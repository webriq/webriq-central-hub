import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { executeSanityPlan, type PlanStep } from "@/lib/sanity";
import { buildContextChain } from "@/lib/ai/context-chain";
import type { SubTask } from "@/types/hub";

const ResumeSchema = z.object({
  task_id: z.string().min(1),
  pr_merged: z.literal(true),
});

/**
 * POST /api/orchestrate/resume
 *
 * Lane 3 continuation — called after a PR is merged (manually or by webhook).
 * Reads the task_log for the given task_id, then executes the Sanity (Lane 1)
 * sub-tasks that were held pending code completion.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = ResumeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { task_id } = parsed.data;

  // Look up the original task_log to recover project + classification context
  const { data: taskLog } = await adminClient
    .from("task_logs")
    .select("id, project_id, description, result")
    .eq("task_id", task_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!taskLog) {
    return NextResponse.json({ error: "Task log not found for task_id" }, { status: 404 });
  }

  if (taskLog.result !== "lane_3_queued") {
    return NextResponse.json(
      { error: "Task is not in lane_3_queued state", result: taskLog.result },
      { status: 409 }
    );
  }

  if (!taskLog.project_id) {
    return NextResponse.json({ error: "Task log has no project_id" }, { status: 422 });
  }

  // Look up project config for Sanity execution
  const { data: project } = await adminClient
    .from("projects")
    .select("id, customer_id, sanity_project_id, dataset")
    .eq("id", taskLog.project_id)
    .maybeSingle();

  if (!project?.sanity_project_id) {
    return NextResponse.json(
      { error: "No Sanity project configured — cannot execute Lane 1 sub-tasks" },
      { status: 422 }
    );
  }

  // Look up the most recent classification for this task to get sub-tasks
  const { data: classification } = await adminClient
    .from("classification_records")
    .select("id, sub_tasks")
    .eq("customer_id", project.customer_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!classification) {
    return NextResponse.json({ error: "No classification found for this customer" }, { status: 404 });
  }

  const allSubTasks = (classification.sub_tasks ?? []) as SubTask[];
  const sanitySubTasks = allSubTasks.filter(
    (st) => st.classification === "sanity" || st.classification === "both"
  );

  if (sanitySubTasks.length === 0) {
    return NextResponse.json(
      { error: "No Sanity sub-tasks found to execute" },
      { status: 422 }
    );
  }

  const contextChain = await buildContextChain(classification.id);
  const steps: PlanStep[] = sanitySubTasks.map((st) => ({
    order: st.order,
    title: st.id,
    description: st.description,
  }));

  const result = await executeSanityPlan(
    project.sanity_project_id,
    steps,
    contextChain,
    project.dataset ?? undefined,
  );

  // Update task_log to reflect Lane 1 completion
  await adminClient
    .from("task_logs")
    .update({ result: `lane_3_complete:${result.what_was_done.slice(0, 200)}` })
    .eq("id", taskLog.id);

  return NextResponse.json({
    ok: true,
    lane: 1,
    what_was_done: result.what_was_done,
    what_was_skipped: result.what_was_skipped,
    message: "Lane 1 (Sanity) sub-tasks executed after PR merge",
  });
}
