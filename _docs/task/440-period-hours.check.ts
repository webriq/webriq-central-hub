// Task 440 — assertions for workedHoursForPeriod (no test runner in this repo).
// Run: npx tsx _docs/task/440-period-hours.check.ts
import assert from "node:assert/strict";
import { workedHoursForPeriod, nonWorkingIntervals } from "../../src/lib/timer/period-hours";
import type { TimerEvent } from "../../src/lib/timer/timeline";

const T0 = Date.parse("2026-10-08T01:00:00.000Z");
const iso = (min: number) => new Date(T0 + min * 60_000).toISOString();
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !≈ ${b}`);

// Session: 0–360 min span; 60-min meal break at 120–180 ⇒ 5 h worked.
const tl: TimerEvent[] = [
  { type: "started", at: iso(0) },
  { type: "break_start", at: iso(120), break_type: "meal" },
  { type: "break_end", at: iso(180) }, { type: "resumed", at: iso(180) },
  { type: "stopped", at: iso(360) },
];
const stored = { startIso: iso(0), endIso: iso(360), hours: 5 };
const run = (s: number, e: number, over: Partial<Parameters<typeof workedHoursForPeriod>[0]> = {}) =>
  workedHoursForPeriod({ startIso: iso(s), endIso: iso(e), source: "timer", timeline: tl, stored, ...over });

// 1. reported example: start 30 min earlier ⇒ 5.5 h (not 6.5)
near(run(-30, 360).hours, 5.5);
// 2. start later, window still contains the break ⇒ −0.5 h
near(run(30, 360).hours, 4.5);
// 3. start moved past the break ⇒ deduction disappears (plain span of 200–360)
near(run(200, 360).hours, 160 / 60);
// 4. break straddling the new end ⇒ only overlapping part deducted (0–150: 150 − 30)
near(run(0, 150).hours, 2);
// 5. extension beyond recorded start/end counts fully (−60..420 ⇒ 480 − 60)
near(run(-60, 420).hours, 7);
// 6. same-length shift (date change) ⇒ stored hours untouched
assert.equal(run(1440, 1800).hours, 5);
// 7. date moved a day later, then start edited ⇒ intervals translated by whole days
const movedStored = { startIso: iso(1440), endIso: iso(1800), hours: 5 };
near(run(1440 - 30, 1800, { stored: movedStored }).hours, 5.5);
// 8. period entirely inside the break ⇒ flagged
const inside = run(130, 170);
assert.equal(inside.onlyNonWorking, true);
assert.equal(inside.hours, 0);
// 9. manual / null / empty timeline ⇒ plain span
near(run(0, 90, { source: "manual" }).hours, 1.5);
near(run(0, 90, { timeline: null }).hours, 1.5);
near(run(0, 90, { timeline: [] }).hours, 1.5);
// 10. open trailing pause (no `stopped`) closes at the stored end; pause + break don't double count
const open: TimerEvent[] = [
  { type: "started", at: iso(0) }, { type: "paused", at: iso(60) }, { type: "resumed", at: iso(90) },
  { type: "break_start", at: iso(120), break_type: "coffee" }, { type: "break_end", at: iso(135) },
  { type: "resumed", at: iso(135) }, { type: "paused", at: iso(300) },
];
assert.deepEqual(nonWorkingIntervals(open, T0 + 360 * 60_000).map(([a, b]) => [(a - T0) / 60_000, (b - T0) / 60_000]), [[60, 90], [120, 135], [300, 360]]);
near(workedHoursForPeriod({ startIso: iso(0), endIso: iso(330), source: "timer", timeline: open, stored: { startIso: iso(0), endIso: iso(360), hours: 4 } }).hours, (330 - 30 - 15 - 30) / 60);

console.log("440 period-hours: all checks passed");
