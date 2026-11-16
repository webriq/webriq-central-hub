// Task 475 — self-check of planPhaseSync() on fixtures copied from the live rows (2026-11-16).
// Run: npx tsx _docs/task/475-phase-sync.check.ts
import assert from "node:assert/strict";
import { planPhaseSync, OVERRIDE_NOTE, type PhaseRow } from "./475-phase-sync/plan";

const row = (n: number, status: PhaseRow["status"], actual: string | null = null, start: string | null = null): PhaseRow => ({
  id: `p${n}`, phase_number: n, position: n, status, start_date: start, actual_start_date: actual, actual_completed_date: null,
});
const byId = (plan: ReturnType<typeof planPhaseSync>) => Object.fromEntries(plan.updates.map((u) => [u.id, u.set]));

// RCB: P3 active → P2 (bypassed, started 08-05) becomes active keeping its start; P3 back to planned.
{
  const plan = planPhaseSync([row(1, "bypassed", "2026-07-27"), row(2, "bypassed", "2026-08-05"), row(3, "active", "2026-09-01"), row(4, "planned"), row(5, "planned")], { targetPhase: 2 });
  assert.deepEqual(byId(plan), { p3: { status: "planned", actual_start_date: null }, p2: { status: "active" } });
  assert.equal(plan.updates.at(-1)!.id, "p2", "target promoted last (one-active unique index)");
  assert.deepEqual(plan.updates[0].from, { status: "active", actual_start_date: "2026-09-01" }, "rollback values captured");
  assert.deepEqual(plan.state, [{ phase_id: "p3", is_manual_override: false, override_note: null }, { phase_id: "p2", is_manual_override: true, override_note: OVERRIDE_NOTE }]);
}

// Veteran: P4 active → P3 keeps 08-21; P4 planned + start cleared; P1/P2 stay bypassed (no update).
{
  const plan = planPhaseSync([row(1, "bypassed", "2026-08-21"), row(2, "bypassed"), row(3, "bypassed", "2026-08-21"), row(4, "active", "2026-08-27"), row(5, "planned")], { targetPhase: 3 });
  assert.deepEqual(byId(plan), { p4: { status: "planned", actual_start_date: null }, p3: { status: "active" } });
}

// Black Barn: P2 active → P1 keeps 08-21; P2 planned.
{
  const plan = planPhaseSync([row(1, "bypassed", "2026-08-21"), row(2, "active", "2026-09-09"), row(3, "planned"), row(4, "planned"), row(5, "planned")], { targetPhase: 1 });
  assert.deepEqual(byId(plan), { p2: { status: "planned", actual_start_date: null }, p1: { status: "active" } });
}

// Target with no actual start falls back to its derived start_date (never today).
{
  const plan = planPhaseSync([row(1, "active", "2026-08-01"), row(2, "planned", null, "2026-08-16")], { targetPhase: 2 });
  assert.deepEqual(byId(plan).p2, { status: "active", actual_start_date: "2026-08-16" });
}

// Saginaw D3: P2 bypassed → completed on the day P3 started.
{
  const plan = planPhaseSync([row(1, "bypassed", "2026-08-21"), row(2, "bypassed", "2026-08-21"), row(3, "active", "2026-09-09"), row(4, "planned"), row(5, "planned")], { completePhase: 2 });
  assert.deepEqual(byId(plan), { p2: { status: "completed", actual_completed_date: "2026-09-09" } });
  assert.deepEqual(plan.state, []);
}

// Permanently skipped phase stays skipped; completed phase untouched.
{
  const plan = planPhaseSync([row(1, "completed", "2026-07-01"), row(2, "skipped"), row(3, "planned", null, "2026-08-01"), row(4, "active", "2026-09-01")], { targetPhase: 3 });
  assert.deepEqual(byId(plan), { p4: { status: "planned", actual_start_date: null }, p3: { status: "active", actual_start_date: "2026-08-01" } });
}

// No-op: target already active → nothing to do.
{
  const plan = planPhaseSync([row(1, "bypassed", "2026-08-01"), row(2, "active", "2026-08-05"), row(3, "planned")], { targetPhase: 2 });
  assert.deepEqual(plan, { updates: [], state: [] });
}

// Refuses to activate a skipped phase.
assert.throws(() => planPhaseSync([row(1, "active", "2026-08-01"), row(2, "skipped")], { targetPhase: 2 }), /skipped/);

console.log("475 phase-sync planner: all checks passed");
