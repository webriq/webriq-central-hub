// Task 478 — self-check of planExpectedPhase() and its calendar helpers.
// Run: npx tsx _docs/task/478-expected-phase-sync.check.ts
import assert from "node:assert/strict";
import { planExpectedPhase, dayToYmd, dayOf, expectedPhaseFor, OVERRIDE_NOTE, type PhaseRow } from "./478-expected-phase-sync/plan";

const row = (n: number, status: PhaseRow["status"], start: string | null = null, done: string | null = null): PhaseRow => ({
  id: `p${n}`, phase_number: n, position: n, status, actual_start_date: start, actual_completed_date: done,
});
const byId = (plan: ReturnType<typeof planExpectedPhase>) => Object.fromEntries(plan.updates.map((u) => [u.id, u.set]));

// Calendar helpers — Studio Belmont kickoff 2026-07-23 is Day 118 on 2026-11-17 (tracker agrees).
assert.equal(dayToYmd("2026-07-23", 1), "2026-07-23");
assert.equal(dayToYmd("2026-07-23", 91), "2026-10-21");
assert.equal(dayOf("2026-07-23", "2026-11-17"), 118);
assert.equal(dayOf("2026-09-30", "2026-11-17"), 49);
assert.equal(expectedPhaseFor(118), 5);
assert.equal(expectedPhaseFor(80), 4);
assert.equal(expectedPhaseFor(49), 3);
assert.equal(expectedPhaseFor(15), 1);
assert.equal(expectedPhaseFor(16), 2);
assert.throws(() => expectedPhaseFor(121));

// Studio Belmont: Onboard active (overdue) → Optimize. P1–P4 completed on calendar dates, P5 active from Day 91.
{
  const plan = planExpectedPhase(
    [row(1, "active", "2026-07-23"), row(2, "planned"), row(3, "planned"), row(4, "planned"), row(5, "planned")],
    { kickoffYmd: "2026-07-23", targetPhase: 5, todayYmd: "2026-11-17" }
  );
  assert.deepEqual(byId(plan), {
    p1: { status: "completed", actual_completed_date: "2026-08-06" },
    p2: { status: "completed", actual_start_date: "2026-08-07", actual_completed_date: "2026-08-21" },
    p3: { status: "completed", actual_start_date: "2026-08-22", actual_completed_date: "2026-09-20" },
    p4: { status: "completed", actual_start_date: "2026-09-21", actual_completed_date: "2026-10-20" },
    p5: { status: "active", actual_start_date: "2026-10-21" },
  });
  assert.equal(plan.updates.at(-1)!.id, "p5", "target promoted last (one-active unique index)");
  assert.equal(plan.updates[0].id, "p1", "old active demoted before the target is promoted");
  assert.deepEqual(plan.updates[0].from, { status: "active", actual_completed_date: null }, "rollback values captured");
  assert.deepEqual(plan.state, [{ phase_id: "p5", is_manual_override: true, override_note: OVERRIDE_NOTE }]);
}

// Skipped/bypassed earlier phases become completed (never stay skipped); an already-completed one keeps its real dates.
{
  const plan = planExpectedPhase(
    [row(1, "skipped", "2026-07-28"), row(2, "completed", "2026-08-12", "2026-09-01"), row(3, "active", "2026-09-02"), row(4, "planned"), row(5, "planned")],
    { kickoffYmd: "2026-07-28", targetPhase: 5, todayYmd: "2026-11-17" }
  );
  const set = byId(plan);
  assert.equal(set.p1.status, "completed");
  assert.equal(set.p2, undefined, "completed phase untouched");
  assert.deepEqual(set.p3, { status: "completed", actual_start_date: "2026-08-27", actual_completed_date: "2026-09-25" });
  assert.deepEqual(set.p5, { status: "active", actual_start_date: "2026-10-26" });
}

// Later phases go back to planned (AB Lekdetectie-style move to Publish with a stray started P4).
{
  const plan = planExpectedPhase(
    [row(1, "active", "2026-09-30"), row(2, "planned"), row(3, "planned"), row(4, "planned", "2026-11-01"), row(5, "planned")],
    { kickoffYmd: "2026-09-30", targetPhase: 3, todayYmd: "2026-11-17" }
  );
  assert.deepEqual(byId(plan).p4, { actual_start_date: null });
  assert.deepEqual(plan.state.find((s) => s.phase_id === "p4"), { phase_id: "p4", is_manual_override: false, override_note: null });
  assert.deepEqual(byId(plan).p3, { status: "active", actual_start_date: "2026-10-30" });
}

// A phase's completion date never lands after today.
{
  const plan = planExpectedPhase(
    [row(1, "active", "2026-11-10"), row(2, "planned"), row(3, "planned"), row(4, "planned"), row(5, "planned")],
    { kickoffYmd: "2026-11-10", targetPhase: 2, todayYmd: "2026-11-17" }
  );
  assert.equal(byId(plan).p1.actual_completed_date, "2026-11-17");
}

// Already at the expected phase with clean history → no changes.
{
  const plan = planExpectedPhase(
    [row(1, "completed", "2026-10-08", "2026-10-22"), row(2, "completed", "2026-10-23", "2026-11-06"), row(3, "active", "2026-11-07"), row(4, "planned"), row(5, "planned")],
    { kickoffYmd: "2026-10-08", targetPhase: 3, todayYmd: "2026-11-17" }
  );
  assert.deepEqual(plan.updates, []);
}

// Refusals: custom phases, re-activating a completed target.
assert.throws(() => planExpectedPhase([row(1, "active"), row(2, "planned"), row(6, "planned"), row(3, "planned"), row(4, "planned"), row(5, "planned")], { kickoffYmd: "2026-07-01", targetPhase: 3, todayYmd: "2026-11-17" }), /phases 1–5/);
assert.throws(() => planExpectedPhase([row(1, "completed"), row(2, "completed"), row(3, "completed"), row(4, "active"), row(5, "planned")], { kickoffYmd: "2026-07-01", targetPhase: 3, todayYmd: "2026-11-17" }), /already completed/);

console.log("478 expected-phase-sync check: all assertions passed");
