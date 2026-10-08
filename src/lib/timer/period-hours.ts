import { STATE_AFTER } from "./activity";
import type { TimerEvent } from "./timeline";

// Task 440 — hours for an edited time-log period. A timer-sourced log's `hours` is the time the
// timer actually RAN; its immutable `timeline` records every pause and break. A plain
// `end − start` span after an edit would count those pauses/breaks as work, so for timer logs the
// recorded non-working time that falls inside the new period is subtracted.
// Pure (no I/O); the three PATCH routes call it.

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

type Interval = [number, number];

// "Non-working" uses the same state map as the Activity stream (task 439): every stretch that
// starts at a paused/break state and ends at the next working/stopped event.
export function nonWorkingIntervals(timeline: TimerEvent[], closeAtMs?: number): Interval[] {
  const intervals: Interval[] = [];
  let openAt: number | null = null;
  for (const event of timeline) {
    const state = STATE_AFTER[event.type];
    const at = new Date(event.at).getTime();
    if (!state || Number.isNaN(at)) continue;
    if (state === "working" || state === "stopped") {
      if (openAt !== null) intervals.push([openAt, at]);
      openAt = null;
    } else if (openAt === null) {
      openAt = at;
    }
  }
  // A timeline that ends mid-pause/break (no `stopped`) is closed at the log's own end.
  if (openAt !== null && closeAtMs !== undefined && closeAtMs > openAt) intervals.push([openAt, closeAtMs]);
  return intervals;
}

export type PeriodHoursInput = {
  startIso: string;
  endIso: string;
  source: string | null;
  timeline: unknown;
  /** The row as stored before this edit. */
  stored: { startIso: string | null; endIso: string | null; hours: number } | null;
};

export type PeriodHoursResult = {
  hours: number;
  /** The period is a valid span but lies entirely inside recorded pauses/breaks. */
  onlyNonWorking: boolean;
};

export function workedHoursForPeriod(input: PeriodHoursInput): PeriodHoursResult {
  const startMs = new Date(input.startIso).getTime();
  const endMs = new Date(input.endIso).getTime();
  const spanMs = endMs - startMs;
  const plain: PeriodHoursResult = { hours: spanMs / HOUR_MS, onlyNonWorking: false };

  const timeline = Array.isArray(input.timeline) ? (input.timeline as TimerEvent[]) : [];
  if (input.source !== "timer" || timeline.length === 0 || !(spanMs > 0)) return plain;

  const { stored } = input;
  if (stored?.startIso && stored.endIso) {
    // Same length ⇒ a pure shift (e.g. the date picker moving the log to another day): keep hours.
    const storedSpanMs = new Date(stored.endIso).getTime() - new Date(stored.startIso).getTime();
    if (spanMs === storedSpanMs) return { hours: stored.hours, onlyNonWorking: false };
  }

  // After an earlier date move the stored period is a whole-day shift of the timeline's own
  // timestamps; translate the recorded intervals by that many days. Sub-day differences are real
  // start-time edits and are deliberately NOT translated.
  const firstAt = new Date(timeline[0].at).getTime();
  const shiftMs = stored?.startIso && !Number.isNaN(firstAt)
    ? Math.round((new Date(stored.startIso).getTime() - firstAt) / DAY_MS) * DAY_MS
    : 0;

  const closeAt = stored?.endIso ? new Date(stored.endIso).getTime() - shiftMs : undefined;
  let deductMs = 0;
  for (const [a, b] of nonWorkingIntervals(timeline, closeAt)) {
    const overlap = Math.min(b + shiftMs, endMs) - Math.max(a + shiftMs, startMs);
    if (overlap > 0) deductMs += overlap;
  }

  const netMs = spanMs - deductMs;
  return { hours: Math.max(0, netMs) / HOUR_MS, onlyNonWorking: !(netMs > 0) };
}

export const ONLY_NON_WORKING_ERROR =
  "That period only covers paused or break time — pick a range that includes working time.";
