import { internalDeliverablesForSubPhase, type DeliverableConfig, type PhaseConfig } from "@/config/customer-phases";
import type { Database, OnboardingInternalDeliverableRow } from "@/types/database";
import { deliverableHealth, progressPercentage, type Health } from "@/lib/programme/deliverable-health";
import { matchesFilters, type FilterItem, type TimelineFilters } from "./_use-timeline-filters";

type Tasklist = Database["public"]["Tables"]["tasklists"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"];
export type Counts = { total: number; done: number };

export type CardFacts = FilterItem & { key: string };

// ─── StackShift I ────────────────────────────────────────────────────────────────────────────
// `d` and `currentDay` must be on the same (display-scaled) day scale.
export function stackshiftFacts(
  d: DeliverableConfig, phaseNumber: number, status: string,
  internalByKey: Map<string, OnboardingInternalDeliverableRow>, currentDay: number
): CardFacts {
  const items = phaseNumber === 1 ? internalDeliverablesForSubPhase(d.key) : [];
  const percentage = progressPercentage(status, items.map((i) => internalByKey.get(i.key)?.status ?? "pending"));
  return {
    key: d.key, name: d.name, owner: d.owner, percentage,
    health: deliverableHealth({ dayStart: d.dayStart, dayEnd: d.dayEnd, currentDay, percentage }),
  };
}

export function ownerOptions(phases: PhaseConfig[]): string[] {
  const names = new Set<string>();
  for (const p of phases) for (const d of p.deliverables) for (const n of d.owner.split("+")) if (n.trim()) names.add(n.trim());
  return [...names].sort();
}

export function countStackshift(
  phases: PhaseConfig[], skipped: Set<number>, statusByKey: Map<string, string>,
  internalByKey: Map<string, OnboardingInternalDeliverableRow>, currentDay: number, filters: TimelineFilters
): { shown: number; total: number } {
  let shown = 0;
  let total = 0;
  for (const p of phases) {
    if (skipped.has(p.number)) continue;
    for (const d of p.deliverables) {
      total++;
      if (matchesFilters(filters, stackshiftFacts(d, p.number, statusByKey.get(d.key) ?? "pending", internalByKey, currentDay))) shown++;
    }
  }
  return { shown, total };
}

// ─── Generic engine ──────────────────────────────────────────────────────────────────────────
export function buildTaskCounts(tasks: Task[]) {
  const milestoneCounts = new Map<string, Counts>();
  const tasklistCounts = new Map<string, Counts>();
  const bump = (map: Map<string, Counts>, id: string, done: boolean) => {
    const entry = map.get(id) ?? { total: 0, done: 0 };
    entry.total++;
    if (done) entry.done++;
    map.set(id, entry);
  };
  for (const t of tasks) {
    const done = t.status === "closed";
    if (t.milestone_id) bump(milestoneCounts, t.milestone_id, done);
    if (t.tasklist_id) bump(tasklistCounts, t.tasklist_id, done);
  }
  return { milestoneCounts, tasklistCounts };
}

// Tasklist day offsets are relative to programme_started_at; `tasklistOffset` shifts them onto the
// timeline origin. null = no range, or shifted fully outside the window ("unscheduled").
export function placeTasklist(tl: Tasklist, tasklistOffset: number, totalDays: number): { start: number; end: number } | null {
  if (tl.day_start == null || tl.day_end == null) return null;
  const start = Math.max(1, tl.day_start + tasklistOffset);
  const end = Math.min(totalDays, tl.day_end + tasklistOffset);
  return end >= start ? { start, end } : null;
}

export function genericFacts(tl: Tasklist, counts: Counts | undefined, placement: { start: number; end: number } | null, currentDay: number): CardFacts {
  const percentage = counts && counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0;
  const health: Health = placement ? deliverableHealth({ dayStart: placement.start, dayEnd: placement.end, currentDay, percentage }) : percentage >= 100 ? "done" : "ok";
  return { key: tl.id, name: tl.name, percentage, health };
}

export function countGeneric(
  tasklists: Tasklist[], tasklistCounts: Map<string, Counts>, tasklistOffset: number, totalDays: number, currentDay: number, filters: TimelineFilters
): { shown: number; total: number } {
  const shown = tasklists.filter((tl) => matchesFilters(filters, genericFacts(tl, tasklistCounts.get(tl.id), placeTasklist(tl, tasklistOffset, totalDays), currentDay))).length;
  return { shown, total: tasklists.length };
}
