import { adminClient } from "@/lib/supabase/admin";
import { classifyTask, enumerateSubTasks } from "@/lib/ai/classify";
import { executeSanityPlan, type PlanStep } from "@/lib/sanity";
import { buildContextChain } from "@/lib/ai/context-chain";
import type { SubTask } from "@/types/hub";

export type OrchestrationProject = {
  id: string;
  sanity_project_id?: string;
  dataset?: string;
  vercel_project_id?: string;
  github_repo?: string;
};

export type OrchestrationInput = {
  task_id: string;
  title: string;
  description: string;
  project: OrchestrationProject;
  userId: string;
  userEmail?: string;
};

export type OrchestrationResult = {
  ok: boolean;
  lane: 1 | 2 | 3;
  sub_tasks: SubTask[];
  kb_hit: boolean;
  task_log_id: string | null;
  status?: string;
  what_was_done?: string;
  message?: string;
  error?: string;
};

async function insertTaskLog(opts: {
  task_id: string;
  description: string;
  result: string;
  project_id: string;
  email: string | undefined;
  userId: string;
  kb_hit: boolean;
  lane: number;
  tools_called: string[];
}): Promise<string | null> {
  try {
    const { data } = await adminClient
      .from("task_logs")
      .insert({
        task_id: opts.task_id,
        description: opts.description,
        result: opts.result,
        project_id: opts.project_id,
        triggered_by: opts.email ?? null,
        triggered_by_id: opts.userId,
        kb_hit: opts.kb_hit,
        lane: opts.lane,
        tools_called: opts.tools_called,
      })
      .select("id")
      .single();
    return data?.id ?? null;
  } catch {
    return null;
  }
}

export async function runOrchestration(input: OrchestrationInput): Promise<OrchestrationResult> {
  const { task_id, title, description, project, userId, userEmail } = input;

  // Look up customer_id from the project record
  const { data: projectRow } = await adminClient
    .from("projects")
    .select("customer_id")
    .eq("id", project.id)
    .maybeSingle();

  if (!projectRow?.customer_id) {
    return { ok: false, lane: 1, sub_tasks: [], kb_hit: false, task_log_id: null, error: "Project not found" };
  }

  const customerId = projectRow.customer_id;

  // Step 1: KB text-similarity lookup (pg_trgm) — non-fatal
  let kbHit = false;
  let kbContext = "";
  try {
    const { data: kbMatches } = await adminClient.rpc("match_kb_by_text", {
      query_text: description,
      match_threshold: 0.3,
      match_count: 1,
    });
    if (kbMatches?.length) {
      kbHit = true;
      kbContext = `KB Match: ${JSON.stringify(kbMatches[0])}`;
    }
  } catch {
    // KB lookup is non-fatal — proceed with fresh classification
  }

  // Step 2: Classify → enumerate sub-tasks
  const classificationRecord = await classifyTask({
    customerId,
    title,
    description,
    source: "hub_manual",
  });

  if (!classificationRecord) {
    return { ok: false, lane: 1, sub_tasks: [], kb_hit: kbHit, task_log_id: null, error: "Classification failed" };
  }

  const classificationId = classificationRecord.id;
  const subTasks: SubTask[] = await enumerateSubTasks(classificationId);

  // Step 3: Lane determination — highest wins (both=3 > code=2 > sanity=1)
  const lane: 1 | 2 | 3 = subTasks.some((st) => st.classification === "both")
    ? 3
    : subTasks.some((st) => st.classification === "code")
    ? 2
    : 1;

  const toolsCalled: string[] = ["classifyTask", "enumerateSubTasks"];
  const logBase = {
    task_id,
    description,
    project_id: project.id,
    email: userEmail,
    userId,
    kb_hit: kbHit,
    lane,
  };

  // Lane 3 — code sub-tasks must complete before Sanity
  if (lane === 3) {
    const task_log_id = await insertTaskLog({ ...logBase, result: "lane_3_queued", tools_called: toolsCalled });
    return { ok: true, lane, sub_tasks: subTasks, kb_hit: kbHit, task_log_id, status: "lane_3_queued", message: "Code sub-tasks must complete first" };
  }

  // Lane 2 — GitHub execution requires an approved plan; route to /api/execution
  if (lane === 2) {
    const task_log_id = await insertTaskLog({ ...logBase, result: "lane_2_queued", tools_called: toolsCalled });
    return { ok: true, lane, sub_tasks: subTasks, kb_hit: kbHit, task_log_id, status: "lane_2_queued", message: "GitHub execution requires PM plan approval — use /api/execution" };
  }

  // Lane 1 — execute Sanity plan directly
  if (!project.sanity_project_id) {
    return { ok: false, lane, sub_tasks: subTasks, kb_hit: kbHit, task_log_id: null, error: "No Sanity project configured for this project" };
  }

  const contextChain = await buildContextChain(classificationId);
  const enrichedContext = kbContext ? `${kbContext}\n\n${contextChain}` : contextChain;

  const steps: PlanStep[] = subTasks.map((st) => ({
    order: st.order,
    title: st.id,
    description: st.description,
  }));

  toolsCalled.push("executeSanityPlan");
  const result = await executeSanityPlan(
    project.sanity_project_id,
    steps,
    enrichedContext,
    project.dataset,
  );

  const task_log_id = await insertTaskLog({
    ...logBase,
    result: result.what_was_done,
    tools_called: toolsCalled,
  });

  return { ok: true, lane, sub_tasks: subTasks, kb_hit: kbHit, task_log_id, what_was_done: result.what_was_done };
}
