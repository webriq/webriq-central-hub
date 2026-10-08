import { BREAK_DURATIONS_MIN, BREAK_LABELS, type BreakType } from "./constants";
import { formatDurationShort } from "./format";
import type { TimerEvent, TimerEventType } from "./timeline";

// Task 439 — pure derivation of the Activity stream shown per time log (and for the live session
// in the header widget): ordered rows with exact times and the length of the state each event
// enters, plus Worked / Paused / On break totals.

export type ActivityTone = "ok" | "warn" | "late" | "neutral";
export type State = "working" | "paused" | "break" | "stopped";

export type ActivityRow = {
  key: number;
  type: TimerEventType;
  at: string;
  label: string;
  detail: string | null;
  tone: ActivityTone;
  durationSeconds: number | null;
  ongoing: boolean;
};

export type ActivityTotals = { workedSeconds: number; pausedSeconds: number; breakSeconds: number };

export const STATE_AFTER: Record<TimerEventType, State> = {
  started: "working", resumed: "working", paused: "paused", break_start: "break",
  break_end: "paused", stopped: "stopped",
};

const TONE: Record<TimerEventType, ActivityTone> = {
  started: "ok", resumed: "ok", paused: "neutral", break_start: "warn",
  break_end: "warn", stopped: "late",
};

function labelFor(event: TimerEvent): string {
  switch (event.type) {
    case "started": return "Started";
    case "stopped": return "Stopped";
    case "paused": return "Paused";
    case "resumed": return "Resumed";
    case "break_start": return event.break_type ? BREAK_LABELS[event.break_type as BreakType] : "Break";
    case "break_end": return "Break ended";
  }
}

function detailFor(event: TimerEvent): string | null {
  if (event.type === "break_start" && event.break_type) {
    const planned = BREAK_DURATIONS_MIN[event.break_type as BreakType];
    return planned ? `Planned ${planned} min` : null;
  }
  return null;
}

export function buildActivity(
  timeline: TimerEvent[],
  endAtIso?: string | null,
  nowMs?: number,
): { rows: ActivityRow[]; totals: ActivityTotals } {
  const totals: ActivityTotals = { workedSeconds: 0, pausedSeconds: 0, breakSeconds: 0 };
  const rows: ActivityRow[] = [];
  const endMs = endAtIso ? new Date(endAtIso).getTime() : nowMs ?? null;

  timeline.forEach((event, i) => {
    const atMs = new Date(event.at).getTime();
    const next = timeline[i + 1];
    const nextMs = next ? new Date(next.at).getTime() : endMs;
    const state = STATE_AFTER[event.type];
    const ongoing = !next && state !== "stopped" && !endAtIso && nextMs !== null;
    const durationSeconds = state === "stopped" || nextMs === null ? null : Math.max(0, (nextMs - atMs) / 1000);

    if (durationSeconds !== null) {
      if (state === "working") totals.workedSeconds += durationSeconds;
      else if (state === "paused") totals.pausedSeconds += durationSeconds;
      else if (state === "break") totals.breakSeconds += durationSeconds;
    }

    let detail = detailFor(event);
    if (event.type === "break_end") {
      const start = [...timeline.slice(0, i)].reverse().find((e) => e.type === "break_start");
      if (start?.break_type) {
        const takenSeconds = (atMs - new Date(start.at).getTime()) / 1000;
        const earlySeconds = BREAK_DURATIONS_MIN[start.break_type as BreakType] * 60 - takenSeconds;
        if (earlySeconds > 5) detail = `Ended ${formatDurationShort(earlySeconds)} early`;
      }
    }
    rows.push({ key: i, type: event.type, at: event.at, label: labelFor(event), detail, tone: TONE[event.type], durationSeconds, ongoing });
  });

  return { rows, totals };
}
