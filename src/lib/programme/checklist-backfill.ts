import { INTERNAL_DELIVERABLES } from "@/config/customer-phases";
import type { Database } from "@/types/database";
import { buildChecklistRows, checklistToTaskStatus, type ChecklistStatus } from "./checklist-tasks";

// Task 434 — pure planner for backfilling the legacy `onboarding_internal_deliverables` rows into `tasks` (kind = 'checklist'). No I/O:
// the dry-run script feeds it a read-only snapshot and `checklist-backfill-sql.ts` turns the plan into a reviewable SQL script. Scope is
// every project that has legacy checklist rows; a project with no Phase 1 / no Phase 1 deliverables gets no task rows and is REPORTED
// (decision 3 of the task doc), never silently dropped. Re-running over its own output yields only `unchanged` ops (idempotent).
type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];

export type ChecklistBackfillInput = {
  phases: { id: string; project_id: string; phase_number: number | null }[];
  deliverables: { id: string; project_id: string; phase_id: string | null; deliverable_key: string | null }[];
  legacy: { project_id: string; deliverable_key: string; status: string }[];
  existing: { id: string; project_id: string; checklist_key: string | null; status: string; milestone_id: string | null; tasklist_id: string | null }[];
  now: string;
  newId: () => string;
};

export type ChecklistOp = { action: "insert" | "update" | "unchanged"; id: string; row: TaskInsert };
export type ChecklistPlan = {
  ops: ChecklistOp[];
  skippedProjects: { project_id: string; reason: string }[];
  skippedItems: { project_id: string; checklist_key: string; reason: string }[];
  unknownLegacyKeys: { project_id: string; deliverable_key: string }[];
  /** Anything that makes the plan unsafe to apply — the dry-run exits non-zero and the apply SQL must not be run. */
  ambiguities: string[];
};

const KNOWN_KEYS = new Set(INTERNAL_DELIVERABLES.map((d) => d.key));
const toChecklistStatus = (s: string): ChecklistStatus => (s === "done" || s === "in_progress" ? s : "pending");

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const item of items) (out.get(key(item)) ?? out.set(key(item), []).get(key(item))!).push(item);
  return out;
}

export function planChecklistBackfill(input: ChecklistBackfillInput): ChecklistPlan {
  const plan: ChecklistPlan = { ops: [], skippedProjects: [], skippedItems: [], unknownLegacyKeys: [], ambiguities: [] };
  const phasesByProject = groupBy(input.phases, (p) => p.project_id);
  const deliverablesByProject = groupBy(input.deliverables, (d) => d.project_id);
  const existingByProject = groupBy(input.existing.filter((t) => t.checklist_key), (t) => t.project_id);

  for (const [projectId, legacyRows] of groupBy(input.legacy, (r) => r.project_id)) {
    const phases = phasesByProject.get(projectId) ?? [];
    if (phases.filter((p) => p.phase_number === 1).length > 1) {
      plan.ambiguities.push(`project ${projectId}: more than one Phase 1 phase`);
      continue;
    }
    for (const r of legacyRows) if (!KNOWN_KEYS.has(r.deliverable_key)) plan.unknownLegacyKeys.push({ project_id: projectId, deliverable_key: r.deliverable_key });

    const statusByKey = new Map(legacyRows.map((r) => [r.deliverable_key, toChecklistStatus(r.status)]));
    const rows = buildChecklistRows(projectId, phases, deliverablesByProject.get(projectId) ?? [], statusByKey, input.now);
    if (rows.length === 0) {
      plan.skippedProjects.push({ project_id: projectId, reason: phases.some((p) => p.phase_number === 1) ? "no Phase 1 deliverables" : "no Phase 1 phase" });
      continue;
    }
    const builtKeys = new Set(rows.map((r) => r.checklist_key));
    for (const item of INTERNAL_DELIVERABLES) {
      if (!builtKeys.has(item.key)) plan.skippedItems.push({ project_id: projectId, checklist_key: item.key, reason: `no Phase 1 deliverable "${item.subPhaseKey}"` });
    }

    const existingByKey = new Map((existingByProject.get(projectId) ?? []).map((t) => [t.checklist_key as string, t]));
    for (const row of rows) {
      const ex = existingByKey.get(row.checklist_key as string);
      if (!ex) plan.ops.push({ action: "insert", id: input.newId(), row });
      else if (ex.status === row.status && ex.milestone_id === row.milestone_id && ex.tasklist_id === row.tasklist_id) plan.ops.push({ action: "unchanged", id: ex.id, row });
      else plan.ops.push({ action: "update", id: ex.id, row });
    }
  }
  return plan;
}

export function summariseChecklistPlan(plan: ChecklistPlan) {
  const count = (a: ChecklistOp["action"]) => plan.ops.filter((o) => o.action === a).length;
  return {
    insert: count("insert"), update: count("update"), unchanged: count("unchanged"),
    skippedProjects: plan.skippedProjects.length, skippedItems: plan.skippedItems.length,
    unknownLegacyKeys: plan.unknownLegacyKeys.length, ambiguities: plan.ambiguities.length,
    statusMix: Object.fromEntries(
      (["pending", "in_progress", "done"] as const).map((s) => [s, plan.ops.filter((o) => o.row.status === checklistToTaskStatus(s)).length])
    ),
  };
}
