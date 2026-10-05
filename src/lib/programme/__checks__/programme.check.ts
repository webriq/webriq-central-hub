import type { PhaseProgrammeStateRow, ProjectDeliverableRow, ProjectPhaseRow } from "@/types/database";
import { materialiseDates, type DeliverableDayRow, type PhaseDayRow } from "../programme-dates";
import { activePhase, countedPhases, inProgrammeOrder, isProgrammeComplete } from "../programme-status";
import { assembleProgramme } from "../store";
import { assert, type Check } from "./_harness";

const ph = (id: string, n: number, status: ProjectPhaseRow["status"], over: Partial<ProjectPhaseRow> = {}): ProjectPhaseRow => ({
  id, project_id: "P", external_id: `programme-phase-P-${n}`, name: `Phase ${n}`, description: null, start_date: null, due_date: null, status,
  position: n, day_start: null, day_end: null, created_by: null, created_at: "", updated_at: "", phase_number: n, owner_label: null,
  actual_start_date: null, actual_completed_date: null, source: "programme", ...over,
});
const dl = (id: string, phase_id: string | null, position: number, over: Partial<ProjectDeliverableRow> = {}): ProjectDeliverableRow => ({
  id, project_id: "P", external_id: null, name: id, position, is_default: false, phase_id, day_start: null, day_end: null, created_at: "", updated_at: "",
  deliverable_key: id, description: null, owner_label: null, start_date: null, due_date: null, status: "pending", completed_at: null, source: "programme", ...over,
});
const dayRow = (id: string, s: number | null, e: number | null, start_date: string | null = null, due_date: string | null = null) => ({ id, day_start: s, day_end: e, start_date, due_date });

export const checks: Check[] = [
  ["status: programme order is position then phase_number; activePhase finds the single active one", () => {
    const rows = [ph("c", 3, "planned"), ph("a", 1, "bypassed"), ph("b", 2, "active")];
    assert.deepEqual(inProgrammeOrder(rows).map((p) => p.id), ["a", "b", "c"]);
    assert.equal(activePhase(rows)?.id, "b");
    assert.equal(activePhase([ph("x", 1, "planned")]), null);
  }],
  ["status: programme complete = the LAST phase is completed (a completed middle phase is not enough)", () => {
    assert.equal(isProgrammeComplete([ph("a", 1, "completed"), ph("b", 2, "completed")]), true);
    assert.equal(isProgrammeComplete([ph("a", 1, "completed"), ph("b", 2, "active")]), false);
    assert.equal(isProgrammeComplete([]), false);
  }],
  ["status: permanent skips don't count toward 'N phases done'; bypassed phases do", () => {
    const rows = [ph("a", 1, "bypassed"), ph("b", 2, "skipped"), ph("c", 3, "active")];
    assert.deepEqual(countedPhases(rows).map((p) => p.id), ["a", "c"]);
  }],
  ["dates: Day 1 = start date; Phase 2 D16–30 from Aug 6 → Aug 21–Sep 4", () => {
    const out = materialiseDates({ programmeStartedAt: "2026-08-06T10:00:00Z", phases: [{ ...dayRow("p2", 16, 30), status: "active" }], deliverables: [] });
    assert.deepEqual(out.phases, [{ id: "p2", start_date: "2026-08-21", due_date: "2026-09-04" }]);
  }],
  ["dates: only rows whose dates change are returned — a second pass is a no-op (idempotent)", () => {
    const first = materialiseDates({ programmeStartedAt: "2026-08-06T10:00:00Z", phases: [{ ...dayRow("p", 1, 15), status: "active" }], deliverables: [dayRow("d", 1, 2) as DeliverableDayRow & { phase_id: string | null }].map((d) => ({ ...d, phase_id: "p" })) });
    assert.equal(first.phases.length + first.deliverables.length, 2);
    const again = materialiseDates({
      programmeStartedAt: "2026-08-06T10:00:00Z",
      phases: [{ ...dayRow("p", 1, 15, first.phases[0].start_date, first.phases[0].due_date), status: "active" }],
      deliverables: [{ ...dayRow("d", 1, 2, first.deliverables[0].start_date, first.deliverables[0].due_date), phase_id: "p" }],
    });
    assert.deepEqual(again, { phases: [], deliverables: [] });
  }],
  ["dates: changing programme_started_at (Jump to phase backdates it) shifts every date by the same number of days", () => {
    const rows = { phases: [{ ...dayRow("p", 16, 30, "2026-08-21", "2026-09-04"), status: "active" }] as PhaseDayRow[], deliverables: [] as DeliverableDayRow[] };
    const out = materialiseDates({ programmeStartedAt: "2026-07-27T09:00:00Z", ...rows });     // started 10 days earlier
    assert.deepEqual(out.phases, [{ id: "p", start_date: "2026-08-11", due_date: "2026-08-25" }]);
  }],
  ["dates: permanently skipped phases and their deliverables get NO dates; bypassed phases keep theirs", () => {
    const out = materialiseDates({
      programmeStartedAt: "2026-08-06T10:00:00Z",
      phases: [{ ...dayRow("sk", 16, 30, "2026-08-21", "2026-09-04"), status: "skipped" }, { ...dayRow("by", 1, 15), status: "bypassed" }],
      deliverables: [{ ...dayRow("dsk", 16, 17, "2026-08-21", "2026-08-22"), phase_id: "sk" }, { ...dayRow("dby", 1, 2), phase_id: "by" }],
    });
    assert.deepEqual(out.phases.find((p) => p.id === "sk"), { id: "sk", start_date: null, due_date: null });
    assert.deepEqual(out.phases.find((p) => p.id === "by"), { id: "by", start_date: "2026-08-06", due_date: "2026-08-20" });
    assert.deepEqual(out.deliverables.find((d) => d.id === "dsk"), { id: "dsk", start_date: null, due_date: null });
    assert.deepEqual(out.deliverables.find((d) => d.id === "dby"), { id: "dby", start_date: "2026-08-06", due_date: "2026-08-07" });
  }],
  ["dates: not started (null programme_started_at) clears dates but keeps the day offsets untouched", () => {
    const out = materialiseDates({ programmeStartedAt: null, phases: [{ ...dayRow("p", 1, 15, "2026-08-06", "2026-08-20"), status: "planned" }], deliverables: [] });
    assert.deepEqual(out.phases, [{ id: "p", start_date: null, due_date: null }]);
  }],
  ["dates: a row without day offsets stays date-less (no crash)", () => {
    const out = materialiseDates({ programmeStartedAt: "2026-08-06T10:00:00Z", phases: [{ ...dayRow("p", null, null), status: "planned" }], deliverables: [] });
    assert.deepEqual(out, { phases: [], deliverables: [] });
  }],
  ["store.assembleProgramme: orders phases, orders deliverables by position, attaches state, ignores orphans without a phase", () => {
    const state: PhaseProgrammeStateRow = { phase_id: "a", wizard_data: { s: 1 }, is_manual_override: false, override_note: null, delay_note: null, created_at: "", updated_at: "" };
    const out = assembleProgramme(
      [ph("b", 2, "active"), ph("a", 1, "bypassed")],
      [dl("d2", "a", 1), dl("d1", "a", 0), dl("x", "b", 0), dl("orphan", null, 0)],
      [state]
    );
    assert.deepEqual(out.map((p) => p.id), ["a", "b"]);
    assert.deepEqual(out[0].deliverables.map((d) => d.id), ["d1", "d2"]);
    assert.equal(out[0].state?.phase_id, "a");
    assert.equal(out[1].state, null);
    assert.equal(out.flatMap((p) => p.deliverables).some((d) => d.id === "orphan"), false);
  }],
];
