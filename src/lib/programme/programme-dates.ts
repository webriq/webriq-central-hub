import { asDisplayDay, displayDayToYmd } from "./calendar";

// Task 429 (WP1, decision D-B) — programme rows store DISPLAY-scale `day_start`/`day_end`; `start_date`/`due_date` are
// derived from them and `programme_started_at`. Whenever `programme_started_at` changes (Start, Jump to phase backdates it)
// the dates of every programme row of that project must be re-materialised in the same operation. Pure: returns only the
// rows whose dates actually change; the store applies them.

type DayRow = { id: string; day_start: number | null; day_end: number | null; start_date: string | null; due_date: string | null };
export type PhaseDayRow = DayRow & { status: string };
export type DeliverableDayRow = DayRow & { phase_id: string | null };
export type DatePatch = { id: string; start_date: string | null; due_date: string | null };

function patchFor(row: DayRow, startedAt: string | null, include: boolean): DatePatch | null {
  const start = include && startedAt && row.day_start != null ? displayDayToYmd(startedAt, asDisplayDay(row.day_start)) : null;
  const due = include && startedAt && row.day_end != null ? displayDayToYmd(startedAt, asDisplayDay(row.day_end)) : null;
  return start === row.start_date && due === row.due_date ? null : { id: row.id, start_date: start, due_date: due };
}

export function materialiseDates(input: {
  programmeStartedAt: string | null;
  phases: PhaseDayRow[];
  deliverables: DeliverableDayRow[];
}): { phases: DatePatch[]; deliverables: DatePatch[] } {
  const { programmeStartedAt: startedAt } = input;
  const skipped = new Set(input.phases.filter((p) => p.status === "skipped").map((p) => p.id));
  return {
    phases: input.phases.flatMap((p) => patchFor(p, startedAt, p.status !== "skipped") ?? []),
    deliverables: input.deliverables.flatMap((d) => patchFor(d, startedAt, !(d.phase_id && skipped.has(d.phase_id))) ?? []),
  };
}
