// Task 468 — merge orchestrator: re-plans server-side (never trusts a client plan), journals, runs steps in order.
import { loadProject, type Db } from "./load";
import { buildPlan } from "./plan";
import { applyRoleRules, resolveProjectId } from "./auth";
import { runContainers, runTasks, runTickets } from "./execute-tasks";
import { runExtras, runFiles, runFinalize, runTimeLogs } from "./execute-files";
import type { Ctx } from "./execute-ctx";
import type { Decisions, MergeEvent, MergeStep } from "./types";

const MISSING_TABLE = ["42P01", "PGRST205"];

type Args = { session: Db; admin: Db; sourceId: string; targetId: string; decisions: Decisions; userId: string; role: string; mergeId?: string | null; emit: (e: MergeEvent) => void };

export async function executeMerge(a: Args) {
  if (!(await resolveProjectId(a.session, a.targetId))) return a.emit({ type: "error", message: "Target project not found or deleted." });
  const [src, tgt] = await Promise.all([loadProject(a.session, a.sourceId), loadProject(a.session, a.targetId)]);
  if (!src || !tgt) return a.emit({ type: "error", message: "Source or target project not found." });
  const plan = applyRoleRules(buildPlan(src, tgt), a.role);
  if (plan.blocked) return a.emit({ type: "error", message: plan.headsUp.find((h) => h.tone === "block")?.text ?? "Merge is blocked." });

  // journal: resume a previous run for this pair if asked, else open a new one
  let decisions = a.decisions;
  let mergeId = a.mergeId ?? null;
  if (mergeId) {
    const { data } = await a.admin.from("project_merges").select("decisions,source_project_id,target_project_id,status").eq("id", mergeId).maybeSingle();
    if (!data || data.source_project_id !== a.sourceId || data.target_project_id !== a.targetId || data.status === "succeeded") mergeId = null;
    else decisions = data.decisions as Decisions;
  }
  if (!mergeId) {
    const { data, error } = await a.admin.from("project_merges").insert({ source_project_id: a.sourceId, target_project_id: a.targetId, decisions, created_by: a.userId }).select("id").single();
    if (error || !data) {
      const missing = MISSING_TABLE.includes(error?.code ?? "");
      return a.emit({ type: "error", message: missing ? "Merge isn't available yet — migration 180 hasn't been applied." : `Could not start the merge: ${error?.message}` });
    }
    mergeId = data.id as string;
  }
  a.emit({ type: "started", mergeId });

  const ctx: Ctx = {
    db: a.admin, src, tgt, plan, decisions, emit: a.emit, sum: { moved: 0, merged: 0, skipped: 0 },
    findings: new Map(plan.findings.map((f) => [f.id, f])), foldTasks: new Map(), tasksLeft: new Set(),
  };
  let step: MergeStep = "tasklists";
  try {
    const lists = await runContainers(ctx, "tasklists", "tasklists", "tasklist", src.tasklists);
    step = "milestones";
    const ms = await runContainers(ctx, "milestones", "milestones", "milestone", src.milestones);
    step = "tasks"; await runTasks(ctx, lists, ms);
    step = "tickets"; await runTickets(ctx);
    step = "files"; await runFiles(ctx);
    step = "timelogs"; await runTimeLogs(ctx);
    step = "extras"; await runExtras(ctx);
    step = "finalize"; await runFinalize(ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Merge failed";
    await a.admin.from("project_merges").update({ status: "failed", error: message, finished_at: new Date().toISOString() }).eq("id", mergeId);
    return a.emit({ type: "error", message, step });
  }
  await a.admin.from("project_merges").update({ status: "succeeded", summary: ctx.sum, finished_at: new Date().toISOString() }).eq("id", mergeId);
  a.emit({ type: "done", summary: ctx.sum, mergeId });
}
