import { INTERNAL_DELIVERABLES, type InternalDeliverableConfig } from "@/config/customer-phases";
import type { Database, OnboardingInternalDeliverableRow } from "@/types/database";

// Task 434 — the StackShift I Phase 1 onboarding checklist (INTERNAL_DELIVERABLES) as `tasks` rows (`kind = 'checklist'`, keyed by
// `checklist_key`). Pure mapping between the checklist vocabulary (pending | in_progress | done), the tasks vocabulary (migration 034) and
// the legacy `onboarding_internal_deliverables` row shape the UI still consumes. No I/O.

export type ChecklistStatus = "pending" | "in_progress" | "done";
type TaskInsert = Database["public"]["Tables"]["tasks"]["Insert"];

export const checklistToTaskStatus = (s: string): string => (s === "done" ? "closed" : s === "in_progress" ? "in_progress" : "open");

/** `closed` → done, `open` → pending; every other (QA-pipeline) task status means work has started. */
export const taskToChecklistStatus = (s: string): ChecklistStatus => (s === "closed" ? "done" : s === "open" ? "pending" : "in_progress");

/** A sub-phase's status from its checklist items' statuses: all done → done, any started → in_progress, else pending (task 127's rule). */
export function deriveSubPhaseStatus(statuses: ChecklistStatus[]): ChecklistStatus {
  if (statuses.length > 0 && statuses.every((s) => s === "done")) return "done";
  return statuses.some((s) => s !== "pending") ? "in_progress" : "pending";
}

/** Task-column values that mirror a checklist status (the import path's convention: completed rows carry is_completed/completed_on). */
export function completionColumns(status: ChecklistStatus, now: string) {
  const done = status === "done";
  return { status: checklistToTaskStatus(status), is_completed: done, completed_on: done ? now : null, completion_percentage: done ? 100 : 0 };
}

export type ChecklistTaskTarget = { projectId: string; phaseId: string; deliverableId: string; position: number };

/** The `tasks` insert for one checklist item (`created_by` stays null: it is system-seeded, not authored). */
export function checklistTaskRow(item: InternalDeliverableConfig, target: ChecklistTaskTarget, status: ChecklistStatus, now: string): TaskInsert {
  return {
    project_id: target.projectId,
    milestone_id: target.phaseId,
    tasklist_id: target.deliverableId,
    title: item.name,
    description: item.description,
    position: target.position,
    kind: "checklist",
    checklist_key: item.key,
    ...completionColumns(status, now),
  };
}

/** Position of an item within its sub-phase, in config order. */
export function positionInSubPhase(item: InternalDeliverableConfig): number {
  return INTERNAL_DELIVERABLES.filter((d) => d.subPhaseKey === item.subPhaseKey).findIndex((d) => d.key === item.key);
}

type ChecklistTaskRow = { id: string; project_id: string; checklist_key: string | null; status: string; created_at: string; updated_at: string };

/** Adapter: checklist task rows → the `onboarding_internal_deliverables` shape the cards/wizard/dashboard already read. */
export function toInternalRows(tasks: ChecklistTaskRow[]): OnboardingInternalDeliverableRow[] {
  return tasks.flatMap((t) =>
    t.checklist_key
      ? [{ id: t.id, project_id: t.project_id, deliverable_key: t.checklist_key, status: taskToChecklistStatus(t.status), created_at: t.created_at, updated_at: t.updated_at }]
      : []
  );
}

/** Checklist rows from `tasks` win per key; legacy rows fill any key the project has no task for (e.g. a skipped sub-phase). */
export function mergeInternalRows(fromTasks: OnboardingInternalDeliverableRow[], legacy: OnboardingInternalDeliverableRow[]): OnboardingInternalDeliverableRow[] {
  const seen = new Set(fromTasks.map((r) => r.deliverable_key));
  return [...fromTasks, ...legacy.filter((r) => !seen.has(r.deliverable_key))];
}

type PhaseRef = { id: string; phase_number: number | null };
type DeliverableRef = { id: string; phase_id: string | null; deliverable_key: string | null };

/**
 * One checklist task per config item for a project, attached to its Phase 1 phase and the Phase 1 deliverable whose key is the item's
 * sub-phase. Items with no matching deliverable are skipped (a project with no Phase 1, or one that never got that sub-phase) — callers
 * that need the skips reported (the backfill) diff against INTERNAL_DELIVERABLES themselves.
 */
export function buildChecklistRows(
  projectId: string,
  phases: PhaseRef[],
  deliverables: DeliverableRef[],
  statusByKey: ReadonlyMap<string, ChecklistStatus>,
  now: string
): TaskInsert[] {
  const phase1 = phases.find((p) => p.phase_number === 1);
  if (!phase1) return [];
  const bySubPhase = new Map(deliverables.filter((d) => d.phase_id === phase1.id && d.deliverable_key).map((d) => [d.deliverable_key as string, d.id]));
  return INTERNAL_DELIVERABLES.flatMap((item) => {
    const deliverableId = bySubPhase.get(item.subPhaseKey);
    if (!deliverableId) return [];
    return [checklistTaskRow(item, { projectId, phaseId: phase1.id, deliverableId, position: positionInSubPhase(item) }, statusByKey.get(item.key) ?? "pending", now)];
  });
}
