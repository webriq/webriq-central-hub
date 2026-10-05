// Task 422 — shared schedule-health rules for both Timeline engines (StackShift I deliverables and
// generic-engine tasklists). Pure and day-number based: callers pass day values already on the same
// scale as `currentDay` (the Timeline's display-scaled columns).

export type Health = "done" | "overdue" | "due-soon" | "upcoming" | "ok";

// Matches buildReminders' existing "warning" cut-off (due in ≤ 2 days).
export const DUE_SOON_DAYS = 2;

export function deliverableHealth({
  dayStart, dayEnd, currentDay, percentage,
}: { dayStart: number; dayEnd: number; currentDay: number; percentage: number }): Health {
  if (percentage >= 100) return "done";
  if (dayEnd < currentDay) return "overdue";
  if (dayStart > currentDay) return "upcoming";
  if (dayEnd - currentDay <= DUE_SOON_DAYS) return "due-soon";
  return "ok";
}

// Percentage shown on a StackShift deliverable card: checklist completion when it has internal
// items, otherwise a coarse status guess (done / in progress / pending).
export function progressPercentage(status: string, internalStatuses: string[]): number {
  if (internalStatuses.length > 0) {
    const done = internalStatuses.filter((s) => s === "done").length;
    return Math.round((done / internalStatuses.length) * 100);
  }
  return status === "done" ? 100 : status === "in_progress" ? 50 : 0;
}

export const HEALTH_LABEL: Record<Health, string> = {
  done: "Done",
  overdue: "Overdue",
  "due-soon": "Due soon",
  upcoming: "Upcoming",
  ok: "On track",
};
