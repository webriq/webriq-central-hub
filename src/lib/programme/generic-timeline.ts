import type { Database } from "@/types/database";

type Milestone = Database["public"]["Tables"]["milestones"]["Row"];

const MS_PER_DAY = 86_400_000;

// Task 420 — date math for the generic-engine Timeline tab. A milestone's Start/Due dates are the
// source of truth for its window; `day_start`/`day_end` (offsets from `programme_started_at`, set
// by the programme seeders) are only a fallback for milestones with no dates. Everything here is
// calendar-date (local midnight) arithmetic, and `today` is injectable so it stays testable.

export type TimelineState = "upcoming" | "running" | "overdue" | "complete";

export interface PhaseWindow {
  /** 1-based day index of the window's first / last day, relative to `GenericTimeline.origin`. */
  startDay: number;
  endDay: number;
  start: Date;
  end: Date;
}

export interface GenericTimeline {
  origin: Date;
  totalDays: number;
  /** Today relative to `origin` (Day 1 = origin). Below 1 = not started, above `totalDays` = past the end. */
  currentDay: number;
  state: TimelineState;
  windows: Map<string, PhaseWindow>;
  /** Milestones with neither dates nor a day range — excluded from the window and the Gantt. */
  undated: Milestone[];
  /** Days to add to a tasklist's `day_start`/`day_end` (relative to `programme_started_at`) to land on `origin`. */
  tasklistOffset: number;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// `YYYY-MM-DD` strings parse as UTC with `new Date(str)`, which shifts the day in negative-offset
// timezones — build a local date instead.
function parseLocalDate(value: string): Date {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function diffDays(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / MS_PER_DAY);
}

export function shiftDays(date: Date, n: number): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() + n);
  return d;
}

function resolveDates(m: Milestone, programmeStart: Date): { start: Date; end: Date } | null {
  if (m.start_date || m.due_date) {
    const start = parseLocalDate((m.start_date ?? m.due_date)!);
    const end = parseLocalDate((m.due_date ?? m.start_date)!);
    return end < start ? { start: end, end: start } : { start, end };
  }
  if (m.day_start != null && m.day_end != null) {
    return { start: shiftDays(programmeStart, m.day_start - 1), end: shiftDays(programmeStart, m.day_end - 1) };
  }
  return null;
}

export function buildTimeline(milestones: Milestone[], programmeStartedAt: string, today: Date = new Date()): GenericTimeline {
  const programmeStart = startOfDay(new Date(programmeStartedAt));
  const resolved = new Map<string, { start: Date; end: Date }>();
  const undated: Milestone[] = [];
  for (const m of milestones) {
    const dates = resolveDates(m, programmeStart);
    if (dates) resolved.set(m.id, dates);
    else undated.push(m);
  }

  const all = [...resolved.values()];
  const origin = all.length > 0 ? new Date(Math.min(...all.map((d) => d.start.getTime()))) : programmeStart;
  const last = all.length > 0 ? new Date(Math.max(...all.map((d) => d.end.getTime()))) : programmeStart;
  const totalDays = diffDays(origin, last) + 1;
  const currentDay = diffDays(origin, today) + 1;

  const windows = new Map<string, PhaseWindow>();
  for (const [id, { start, end }] of resolved) {
    windows.set(id, { start, end, startDay: diffDays(origin, start) + 1, endDay: diffDays(origin, end) + 1 });
  }

  const allCompleted = milestones.length > 0 && milestones.every((m) => m.status === "completed");
  const state: TimelineState = allCompleted ? "complete" : currentDay < 1 ? "upcoming" : currentDay > totalDays ? "overdue" : "running";

  return { origin, totalDays, currentDay, state, windows, undated, tasklistOffset: diffDays(origin, programmeStart) };
}

/** First milestone (in the given order) whose window contains today — used when none is flagged `active`. */
export function currentPhaseByDate(milestones: Milestone[], timeline: GenericTimeline): Milestone | null {
  return milestones.find((m) => {
    const w = timeline.windows.get(m.id);
    return w != null && timeline.currentDay >= w.startDay && timeline.currentDay <= w.endDay;
  }) ?? null;
}

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function formatWindowRange(w: PhaseWindow): string {
  return w.startDay === w.endDay ? SHORT_DATE.format(w.start) : `${SHORT_DATE.format(w.start)} – ${SHORT_DATE.format(w.end)}`;
}

export function windowLength(w: PhaseWindow): number {
  return w.endDay - w.startDay + 1;
}
