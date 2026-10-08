// Task 439 — assertions for the pure timer logic (no test runner in this repo).
// Run: npx tsx _docs/task/439-timer-logic.check.ts
import assert from "node:assert/strict";
import { reconcileTimer, type TimerRow } from "../../src/lib/timer/reconcile";
import { buildActivity } from "../../src/lib/timer/activity";
import type { TimerEvent } from "../../src/lib/timer/timeline";

const T0 = Date.parse("2026-10-08T09:00:00.000Z");
const iso = (offsetMin: number) => new Date(T0 + offsetMin * 60_000).toISOString();

const onBreak: TimerRow = {
  id: "r1", task_id: "t1", issue_id: null, status: "paused", segment_started_at: null,
  break_type: "meal", break_started_at: iso(0), break_duration_minutes: 60,
  timeline: [{ type: "started", at: iso(-30) }, { type: "break_start", at: iso(0), break_type: "meal" }],
};
const apply = (r: TimerRow, p: ReturnType<typeof reconcileTimer>["patch"]): TimerRow => ({ ...r, ...(p ?? {}) });

// 1. break not yet expired → untouched; no break → untouched
assert.equal(reconcileTimer(onBreak, T0 + 59 * 60_000).patch, null);
assert.equal(reconcileTimer({ ...onBreak, break_type: null, break_started_at: null, break_duration_minutes: null }, T0 + 9e9).patch, null);

// 2. meal break (60 min) discovered 104 min after it started → backdated to +60, resumed there
const r2 = reconcileTimer(onBreak, T0 + 104 * 60_000);
assert.equal(r2.breakClosed?.endedAt, iso(60));
assert.equal(r2.patch?.status, "running");
assert.equal(r2.patch?.segment_started_at, iso(60));
assert.equal(r2.patch?.break_type, null);
const tl2 = r2.patch?.timeline as TimerEvent[];
assert.deepEqual(tl2.slice(-2).map((e) => [e.type, e.at]), [["break_end", iso(60)], ["resumed", iso(60)]]);

// 3. exact expiry boundary expires; one ms earlier does not
assert.equal(reconcileTimer(onBreak, T0 + 60 * 60_000).breakClosed?.endedAt, iso(60));
assert.equal(reconcileTimer(onBreak, T0 + 60 * 60_000 - 1).patch, null);

// 4. idempotent
assert.equal(reconcileTimer(apply(onBreak, r2.patch), T0 + 104 * 60_000).patch, null);

// 5. break-only row (no task/issue timer underneath) expires → delete
const only: TimerRow = { ...onBreak, task_id: null, status: null, break_type: "coffee", break_duration_minutes: 15, timeline: [] };
const r5 = reconcileTimer(only, T0 + 16 * 60_000);
assert.equal(r5.deleteRow, true);
assert.equal(r5.breakClosed?.endedAt, iso(15));

// 6. an already-running timer (nothing to resume) just ends the break
const running: TimerRow = { ...onBreak, status: "running", segment_started_at: iso(-30) };
const r6 = reconcileTimer(running, T0 + 70 * 60_000);
assert.equal(r6.patch?.status, undefined);
assert.deepEqual((r6.patch?.timeline as TimerEvent[]).slice(-1).map((e) => e.type), ["break_end"]);

// 7. activity: totals + rows for a session with a pause and a break
const tl: TimerEvent[] = [
  { type: "started", at: iso(0) }, { type: "paused", at: iso(30) }, { type: "resumed", at: iso(40) },
  { type: "break_start", at: iso(50), break_type: "coffee" }, { type: "break_end", at: iso(60) },
  { type: "resumed", at: iso(60) }, { type: "stopped", at: iso(110) },
];
const a = buildActivity(tl, iso(110));
assert.equal(a.rows.length, 7);
assert.equal(a.totals.workedSeconds, (30 + 10 + 50) * 60);
assert.equal(a.totals.pausedSeconds, 10 * 60);
assert.equal(a.totals.breakSeconds, 10 * 60);
assert.equal(a.rows[4].detail, "Ended 5m early");
// 7b. live session: ongoing last row
const live = buildActivity([{ type: "started", at: iso(0) }], null, T0 + 5 * 60_000);
assert.equal(live.rows[0].ongoing, true);
assert.equal(live.totals.workedSeconds, 300);
// 7c. legacy two-event timeline still derives
assert.equal(buildActivity([{ type: "started", at: iso(0) }, { type: "stopped", at: iso(10) }], iso(10)).totals.workedSeconds, 600);

console.log("439 timer logic: all checks passed");
