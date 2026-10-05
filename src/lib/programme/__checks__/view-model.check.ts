import type { PhaseProgrammeStateRow, ProjectDeliverableRow, ProjectPhaseRow } from "@/types/database";
import { buildDisplayPhases, toWire, uiPhaseStatus } from "../view-model";
import { assert, type Check } from "./_harness";

const ph = (id: string, n: number, status: ProjectPhaseRow["status"], over: Partial<ProjectPhaseRow> = {}): ProjectPhaseRow => ({
  id, project_id: "P", external_id: `programme-phase-P-${n}`, name: `Phase ${n}`, description: null, start_date: null, due_date: null, status,
  position: n, day_start: 1, day_end: 10, created_by: null, created_at: "", updated_at: "", phase_number: n, owner_label: null,
  actual_start_date: null, actual_completed_date: null, source: "programme", ...over,
});
const dl = (id: string, phase_id: string, position: number, over: Partial<ProjectDeliverableRow> = {}): ProjectDeliverableRow => ({
  id, project_id: "P", external_id: null, name: `D ${id}`, position, is_default: false, phase_id, day_start: 2, day_end: 4, created_at: "", updated_at: "",
  deliverable_key: id, description: "desc", owner_label: "Dev", start_date: null, due_date: null, status: "pending", completed_at: null, source: "programme", ...over,
});
const state = (phase_id: string, over: Partial<PhaseProgrammeStateRow> = {}): PhaseProgrammeStateRow => ({
  phase_id, wizard_data: { kickoff: { a: 1 } }, is_manual_override: true, override_note: "n", delay_note: "late", created_at: "", updated_at: "", ...over,
});

export const checks: Check[] = [
  ["view-model: uiPhaseStatus maps the unified vocabulary to the legacy UI one (bypassed renders as skipped)", () => {
    assert.equal(uiPhaseStatus("planned"), "not_started");
    assert.equal(uiPhaseStatus("bypassed"), "skipped");
    assert.equal(uiPhaseStatus("skipped"), "skipped");
    assert.equal(uiPhaseStatus("active"), "active");
    assert.equal(uiPhaseStatus("completed"), "completed");
  }],
  ["view-model: toWire flattens state onto the phase, tags deliverables with phase_number, and defaults a missing state row", () => {
    const wire = toWire([
      { ...ph("a", 1, "active"), state: state("a"), deliverables: [dl("k1", "a", 1)] },
      { ...ph("b", 2, "planned"), state: null, deliverables: [] },
    ]);
    assert.equal(wire.phases[0].wizard_data && (wire.phases[0].wizard_data as { kickoff: { a: number } }).kickoff.a, 1);
    assert.equal(wire.phases[0].delay_note, "late");
    assert.equal(wire.phases[1].is_manual_override, false);
    assert.equal(wire.phases[1].delay_note, null);
    assert.equal(wire.deliverables.length, 1);
    assert.equal(wire.deliverables[0].phase_number, 1);
    assert.ok(!("state" in wire.phases[0]));
  }],
  ["view-model: buildDisplayPhases uses stored display days as-is, in position order, with deliverables ordered and falling back to the phase window", () => {
    const wire = toWire([
      { ...ph("b", 2, "planned", { position: 2, day_start: 8, day_end: 15, name: "Migrate & Rebrand" }), state: null, deliverables: [dl("z", "b", 2, { day_start: null, day_end: null }), dl("y", "b", 1, { day_start: 9, day_end: 10 })] },
      { ...ph("a", 1, "active", { position: 1, day_start: 1, day_end: 7, name: "Onboard" }), state: null, deliverables: [] },
    ]);
    const out = buildDisplayPhases(wire.phases, wire.deliverables);
    assert.deepEqual(out.map((p) => [p.number, p.dayStart, p.dayEnd]), [[1, 1, 7], [2, 8, 15]]);
    assert.equal(out[0].shortName, "Onboard");
    assert.equal(out[1].shortName, "Migrate");
    assert.deepEqual(out[1].deliverables.map((d) => [d.key, d.dayStart, d.dayEnd]), [["y", 9, 10], ["z", 8, 15]]);
  }],
  ["view-model: a custom phase keeps its own name/owner and has no static fallback", () => {
    const wire = toWire([{ ...ph("c", 6, "planned", { name: "Launch prep", owner_label: "PM" }), state: null, deliverables: [] }]);
    const [p] = buildDisplayPhases(wire.phases, wire.deliverables);
    assert.equal(p.name, "Launch prep");
    assert.equal(p.shortName, "Launch prep");
    assert.equal(p.owner, "PM");
  }],
];
