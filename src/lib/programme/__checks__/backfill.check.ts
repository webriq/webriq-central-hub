import { PROGRAMME_PHASES } from "@/config/customer-phases";
import {
  deliverableExternalId, phaseExternalId, planBackfill, summarisePlan,
  type CustomerDeliverableIn, type CustomerPhaseIn, type ExistingDeliverable, type ExistingPhase, type Plan, type PlanInput, type ProjectIn,
} from "../backfill-plan";
import { planToSql } from "../backfill-sql";
import { assert, type Check } from "./_harness";

// Synthetic fixtures — one project per scenario so each rule is isolated.
const P1 = "00000000-0000-0000-0000-000000000001";   // clean: scoped milestones for 2–5, no tasklists for phase 1
const P2 = "00000000-0000-0000-0000-000000000002";   // legacy-unscoped milestone + legacy-format tasklists, permanent skip [2]
const START = "2026-09-01T10:00:00Z";
const mkId = () => { let n = 0; return () => `00000000-0000-0000-0000-${String(++n).padStart(12, "9")}`; };
const project = (id: string, over: Partial<ProjectIn> = {}): ProjectIn => ({ id, project_id: "X", programme_started_at: START, programme_duration_days: 120, draft_skip_phase_numbers: [], ...over });
const cp = (project_id: string, n: number, over: Partial<CustomerPhaseIn> = {}): CustomerPhaseIn => ({ project_id, phase_number: n, status: n === 2 ? "active" : "not_started", sort_order: n, actual_start_date: null, actual_completed_date: null, is_manual_override: false, override_note: null, delay_note: null, wizard_data: { step: n }, custom_name: null, day_start_override: null, day_end_override: null, ...over });
const cd = (project_id: string, n: number, key: string, over: Partial<CustomerDeliverableIn> = {}): CustomerDeliverableIn => ({ project_id, phase_number: n, deliverable_key: key, status: "pending", completed_at: null, custom_name: null, custom_description: null, custom_owner: null, day_start_override: null, day_end_override: null, ...over });
const exPhase = (id: string, project_id: string, external_id: string | null, over: Partial<ExistingPhase> = {}): ExistingPhase => ({ id, project_id, external_id, name: "Existing", description: null, start_date: null, due_date: null, status: "planned", position: null, day_start: null, day_end: null, phase_number: null, owner_label: null, actual_start_date: null, actual_completed_date: null, source: "programme", ...over });
const exDel = (id: string, project_id: string, external_id: string | null, phase_id: string | null, over: Partial<ExistingDeliverable> = {}): ExistingDeliverable => ({ id, project_id, external_id, phase_id, name: "Existing list", description: null, owner_label: null, start_date: null, due_date: null, day_start: null, day_end: null, position: 0, status: "pending", completed_at: null, deliverable_key: null, source: "programme", is_default: false, ...over });

const phasesFor = (pid: string, extra: Partial<CustomerPhaseIn> = {}) => [1, 2, 3, 4, 5].map((n) => cp(pid, n, extra));
// all deliverables of the static config for a project (so repeated keys across phases 4 and 5 are exercised)
const deliverablesFor = (pid: string) => PROGRAMME_PHASES.flatMap((ph) => ph.deliverables.map((d) => cd(pid, ph.number, d.key)));

const base = (): PlanInput => ({
  projects: [project(P1)], phases: phasesFor(P1), deliverables: deliverablesFor(P1),
  existingPhases: [2, 3, 4, 5].map((n) => exPhase(`c${n}`, P1, phaseExternalId(P1, n))),
  existingDeliverables: PROGRAMME_PHASES.filter((p) => p.number >= 2).flatMap((ph) => ph.deliverables.map((d, i) => exDel(`d${ph.number}-${d.key}`, P1, deliverableExternalId(P1, ph.number, d.key), `c${ph.number}`, { position: i }))),
  newId: mkId(),
});
// apply a plan to the existing rows in memory (what the SQL does) so a second run can be checked for idempotence
function applied(input: PlanInput, plan: Plan): PlanInput {
  const phases = new Map(input.existingPhases.map((p) => [p.id, p]));
  for (const op of plan.phases) phases.set(op.id, { id: op.id, ...op.row });
  const dels = new Map(input.existingDeliverables.map((d) => [d.id, d]));
  for (const op of plan.deliverables) dels.set(op.id, { id: op.id, ...op.row });
  for (const o of plan.orphans) { if (o.kind === "deliverable" && dels.has(o.id)) dels.set(o.id, { ...dels.get(o.id)!, source: "manual" }); }
  return { ...input, existingPhases: [...phases.values()], existingDeliverables: [...dels.values()], newId: mkId() };
}
const sum = (input: PlanInput) => summarisePlan(planBackfill(input));

export const checks: Check[] = [
  ["clean project: scoped milestones are updated in place (UUID kept), Phase 1 is created, nothing is ambiguous", () => {
    const plan = planBackfill(base());
    assert.deepEqual(plan.ambiguities, []);
    const byN = new Map(plan.phases.map((p) => [p.row.phase_number, p]));
    for (const n of [2, 3, 4, 5]) { assert.equal(byN.get(n)!.action, "update"); assert.equal(byN.get(n)!.id, `c${n}`); assert.equal(byN.get(n)!.matchedBy, "scoped"); }
    assert.equal(byN.get(1)!.action, "insert");
    assert.equal(plan.phases.length, 5);
  }],
  ["Phase 1 deliverables are created (no tasklists ever existed); phase 2–5 deliverables match their tasklists", () => {
    const plan = planBackfill(base());
    const p1 = plan.deliverables.filter((d) => d.row.phase_id === plan.phases.find((p) => p.row.phase_number === 1)!.id);
    assert.ok(p1.length > 0 && p1.every((d) => d.action === "insert"));
    const rest = plan.deliverables.filter((d) => !p1.includes(d));
    assert.ok(rest.every((d) => d.matchedBy === "scoped" && d.action === "update"));
  }],
  ["the same deliverable key in two phases of one project is two separate deliverables (Phase 4 and 5 `updated-publishing-plan`)", () => {
    const plan = planBackfill(base());
    const dup = plan.deliverables.filter((d) => d.row.deliverable_key === "updated-publishing-plan");
    assert.equal(dup.length, 2);
    assert.notEqual(dup[0].id, dup[1].id);
    assert.notEqual(dup[0].row.phase_id, dup[1].row.phase_id);
    assert.equal(new Set(plan.deliverables.map((d) => `${d.row.phase_id}|${d.row.deliverable_key}`)).size, plan.deliverables.length);   // (phase_id, key) unique — migration 161's index
  }],
  ["status mapping: not_started→planned, active→active, completed→completed", () => {
    const input = base(); input.phases = [cp(P1, 1, { status: "completed" }), cp(P1, 2, { status: "active" }), cp(P1, 3, { status: "not_started" })];
    const byN = new Map(planBackfill(input).phases.map((p) => [p.row.phase_number, p.row.status]));
    assert.deepEqual([byN.get(1), byN.get(2), byN.get(3)], ["completed", "active", "planned"]);
  }],
  ["skipped splits: permanent skip (draft_skip_phase_numbers) → 'skipped' with no dates; time-bypass → 'bypassed' with dates", () => {
    const input = base(); input.projects = [project(P1, { draft_skip_phase_numbers: [2] })]; input.phases = [cp(P1, 1, { status: "skipped" }), cp(P1, 2, { status: "skipped" }), cp(P1, 3, { status: "active" })];
    const byN = new Map(planBackfill(input).phases.map((p) => [p.row.phase_number, p.row]));
    assert.equal(byN.get(2)!.status, "skipped"); assert.equal(byN.get(2)!.start_date, null); assert.equal(byN.get(2)!.day_start, null);
    assert.equal(byN.get(1)!.status, "bypassed"); assert.ok(byN.get(1)!.start_date);
  }],
  ["dates are materialised from programme_started_at + the calendar (Phase 2 = reference days 16–30 → Sep 16–30)", () => {
    const row = planBackfill(base()).phases.find((p) => p.row.phase_number === 2)!.row;
    assert.equal(row.start_date, "2026-09-16"); assert.equal(row.due_date, "2026-09-30");
    assert.equal(row.day_start, 16); assert.equal(row.day_end, 30);
  }],
  ["no programme_started_at → dates stay null but day offsets are still set", () => {
    const input = base(); input.projects = [project(P1, { programme_started_at: null })];
    const row = planBackfill(input).phases.find((p) => p.row.phase_number === 3)!.row;
    assert.equal(row.start_date, null); assert.equal(row.day_start, 31);
  }],
  ["task-432 rule: stored overrides are already compressed — Baoase-style plan keeps Phase 3 at D16–45 after skipping Phase 2", () => {
    const input = base(); input.projects = [project(P1, { draft_skip_phase_numbers: [2] })];
    input.phases = [cp(P1, 1), cp(P1, 2, { status: "skipped" }), cp(P1, 3, { day_start_override: 16, day_end_override: 45 }), cp(P1, 4, { day_start_override: 46, day_end_override: 75 })];
    const byN = new Map(planBackfill(input).phases.map((p) => [p.row.phase_number, p.row]));
    assert.deepEqual([byN.get(3)!.day_start, byN.get(3)!.day_end, byN.get(4)!.day_start, byN.get(4)!.day_end], [16, 45, 46, 75]);
  }],
  ["legacy-unscoped milestone and legacy-format tasklists attach by project_id + number/key and get scoped external_ids", () => {
    const input: PlanInput = {
      projects: [project(P2)], phases: [cp(P2, 2)], deliverables: [cd(P2, 2, "tech-docs")],
      existingPhases: [exPhase("L2", P2, "programme-phase-2")],
      existingDeliverables: [exDel("LD", P2, "programme-deliverable-2-tech-docs", "L2")],
      newId: mkId(),
    };
    const plan = planBackfill(input);
    assert.equal(plan.phases[0].matchedBy, "legacy-unscoped"); assert.equal(plan.phases[0].id, "L2"); assert.equal(plan.phases[0].row.external_id, phaseExternalId(P2, 2));
    assert.equal(plan.deliverables[0].matchedBy, "legacy-unscoped"); assert.equal(plan.deliverables[0].id, "LD");
    assert.equal(plan.deliverables[0].row.external_id, deliverableExternalId(P2, 2, "tech-docs"));
    assert.deepEqual(plan.orphans, []);
  }],
  ["a legacy-format id owned by a DIFFERENT project is never claimed", () => {
    const input: PlanInput = {
      projects: [project(P1), project(P2)], phases: [cp(P1, 2)], deliverables: [],
      existingPhases: [exPhase("L2", P2, "programme-phase-2")],            // belongs to P2, but only P1 has customer_phases
      existingDeliverables: [], newId: mkId(),
    };
    const plan = planBackfill(input);
    assert.equal(plan.phases[0].action, "insert");                          // P1 gets a new row
    assert.equal(plan.orphans.filter((o) => o.kind === "phase").length, 1); // P2's legacy row stays an orphan (kept manual), not stolen
  }],
  ["orphan programme-tagged deliverables (no customer_deliverables row) are kept and flagged, never deleted; tasks are noted", () => {
    const input = base(); input.existingDeliverables.push(exDel("ORPH", P1, "programme-deliverable-removed-key", "c3"));
    input.taskCountByDeliverable = new Map([["ORPH", 3]]);
    const plan = planBackfill(input);
    assert.deepEqual(plan.orphans.map((o) => [o.id, o.kind, o.hasTasks]), [["ORPH", "deliverable", true]]);
    assert.ok(planToSql(plan, input).includes("update project_deliverables set source = 'manual' where id in ('ORPH')"));
    assert.ok(!/delete from/i.test(planToSql(plan, input)));
  }],
  ["ambiguity: scoped AND legacy milestone both exist for the same project/phase → reported, not guessed", () => {
    const input = base(); input.existingPhases.push(exPhase("DUP", P1, "programme-phase-2"));
    const plan = planBackfill(input);
    assert.ok(plan.ambiguities.some((a) => a.includes("phase 2") && a.includes("2 candidate")));
    assert.ok(!plan.phases.some((p) => p.row.phase_number === 2));          // the ambiguous phase is skipped, not half-planned
  }],
  ["wizard data and notes move to phase_programme_state (one row per phase)", () => {
    const input = base(); input.phases = [cp(P1, 1, { wizard_data: { a: 1 }, override_note: "n", delay_note: "d", is_manual_override: true })];
    const op = planBackfill(input).phases[0];
    assert.deepEqual(op.state, { phase_id: op.id, wizard_data: { a: 1 }, is_manual_override: true, override_note: "n", delay_note: "d" });
  }],
  ["IDEMPOTENT: planning again over already-merged rows changes nothing (every op 'unchanged', no orphans)", () => {
    const input = base();
    const again = applied(input, planBackfill(input));
    const s = sum(again);
    assert.deepEqual(s.phases.byAction, { unchanged: 5 });
    assert.deepEqual(s.deliverables.byAction, { unchanged: PROGRAMME_PHASES.reduce((n, p) => n + p.deliverables.length, 0) });
    assert.equal(s.orphans.total, 0); assert.deepEqual(s.ambiguities, []);
    assert.ok(planToSql(planBackfill(again), again).includes("phases insert 0 / update 0"));
  }],
  ["SQL: drift guards, prerequisites, reconciliation, a single transaction, quotes escaped", () => {
    const input = base(); input.phases[1] = cp(P1, 2, { custom_name: "O'Brien's phase" });
    const sql = planToSql(planBackfill(input), input);
    assert.ok(sql.startsWith("-- Task 428 backfill") && sql.includes("\nbegin;") && sql.trim().endsWith("commit;"));
    assert.ok(sql.includes("DRIFT:") && sql.includes("RECONCILE:") && sql.includes("apply migrations 160 and 161 first"));
    assert.ok(sql.includes("'O''Brien''s phase'"));
    assert.equal((sql.match(/\bbegin;/g) ?? []).length, 1);
  }],
];
