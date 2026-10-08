import type { TimerEvent } from "./timeline";

// Task 439 — server-authoritative break expiry. Pure (no I/O): given the active_timers row and the
// current instant, returns the BACKDATED transition that should already have happened. This
// replaces "a browser tab notices the countdown hit zero": an expired break ends (and the paused
// task timer resumes) at the real expiry instant, whichever request discovers it, so a closed or
// throttled tab can no longer stretch a break. Idempotent: applying the patch and reconciling
// again with the same `nowMs` yields no further change.

export type TimerRow = {
  id: string;
  task_id: string | null;
  issue_id: string | null;
  status: string | null;
  segment_started_at: string | null;
  break_type: string | null;
  break_started_at: string | null;
  break_duration_minutes: number | null;
  timeline: unknown;
};

export type ReconcilePatch = Partial<Pick<TimerRow,
  "status" | "segment_started_at" | "break_type" | "break_started_at" | "break_duration_minutes" | "timeline">>;

export type ReconcileResult = {
  patch: ReconcilePatch | null;
  breakClosed: { endedAt: string; reason: "expired" } | null;
  deleteRow: boolean;
};

const NOOP: ReconcileResult = { patch: null, breakClosed: null, deleteRow: false };

export function reconcileTimer(row: TimerRow, nowMs: number): ReconcileResult {
  const breakStartMs = row.break_started_at ? new Date(row.break_started_at).getTime() : NaN;
  if (!row.break_type || Number.isNaN(breakStartMs) || !row.break_duration_minutes) return NOOP;

  const expiryMs = breakStartMs + row.break_duration_minutes * 60_000;
  if (nowMs < expiryMs) return NOOP;

  const endIso = new Date(expiryMs).toISOString();
  const breakClosed = { endedAt: endIso, reason: "expired" as const };
  // Break-only row (no task/issue timer underneath): nothing left to keep.
  if (!row.task_id && !row.issue_id) return { patch: null, breakClosed, deleteRow: true };

  const events: TimerEvent[] = [{ type: "break_end", at: endIso }];
  const patch: ReconcilePatch = { break_type: null, break_started_at: null, break_duration_minutes: null };
  if (row.status === "paused") {
    events.push({ type: "resumed", at: endIso });
    patch.status = "running";
    patch.segment_started_at = endIso;
  }
  const existing = Array.isArray(row.timeline) ? (row.timeline as TimerEvent[]) : [];
  patch.timeline = [...existing, ...events];
  return { patch, breakClosed, deleteRow: false };
}
