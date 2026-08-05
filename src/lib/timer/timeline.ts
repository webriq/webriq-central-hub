import type { BreakType } from "./constants";

// Event log appended to active_timers.timeline by every timer route (task 215) — copied onto
// the new time_logs row's own `timeline` column when the timer stops, then left immutable as
// the historical record of what actually happened during the session (editing a time_logs
// entry's period afterward never rewrites this array).
export type TimerEventType = "started" | "paused" | "resumed" | "break_start" | "break_end" | "stopped";
export type TimerEvent = { type: TimerEventType; at: string; break_type?: BreakType };

export function appendTimerEvent(existing: unknown, event: TimerEvent): TimerEvent[] {
  const arr = Array.isArray(existing) ? (existing as TimerEvent[]) : [];
  return [...arr, event];
}
