import { INTERNAL_DELIVERABLES } from "@/config/customer-phases";
import { planChecklistBackfill, type ChecklistBackfillInput } from "@/lib/programme/checklist-backfill";
import { checklistPlanToSql } from "@/lib/programme/checklist-backfill-sql";
import { assert, type Check } from "./_harness";

// Task 434 — the checklist backfill planner. Fixture: one project with a Phase 1 and all seven Phase 1 sub-phase deliverables.
const SUB_PHASES = [...new Set(INTERNAL_DELIVERABLES.map((d) => d.subPhaseKey))];
let seq = 0;
const base = (over: Partial<ChecklistBackfillInput> = {}): ChecklistBackfillInput => ({
  phases: [{ id: "ph1", project_id: "p1", phase_number: 1 }, { id: "ph2", project_id: "p1", phase_number: 2 }],
  deliverables: SUB_PHASES.map((k) => ({ id: `d-${k}`, project_id: "p1", phase_id: "ph1", deliverable_key: k })),
  legacy: INTERNAL_DELIVERABLES.map((d) => ({ project_id: "p1", deliverable_key: d.key, status: d.key === "kickoff-meeting-held" ? "done" : "pending" })),
  existing: [],
  now: "2026-10-06T00:00:00.000Z",
  newId: () => `id-${++seq}`,
  ...over,
});

export const checks: Check[] = [
  ["a fresh project gets one insert per checklist item, statuses mapped, attached to Phase 1 and its sub-phase deliverable", () => {
    const plan = planChecklistBackfill(base());
    assert.equal(plan.ops.length, 14);
    assert.ok(plan.ops.every((o) => o.action === "insert"));
    const kickoff = plan.ops.find((o) => o.row.checklist_key === "kickoff-meeting-held")!;
    assert.equal(kickoff.row.status, "closed");
    assert.equal(kickoff.row.is_completed, true);
    assert.equal(kickoff.row.milestone_id, "ph1");
    assert.equal(kickoff.row.tasklist_id, "d-kickoff");
    assert.equal(plan.ops.find((o) => o.row.checklist_key === "dns-details")!.row.status, "open");
    assert.deepEqual([plan.skippedProjects, plan.skippedItems, plan.unknownLegacyKeys, plan.ambiguities], [[], [], [], []]);
  }],
  ["re-planning over its own output is a no-op (idempotent)", () => {
    const first = planChecklistBackfill(base());
    const existing = first.ops.map((o) => ({ id: o.id, project_id: "p1", checklist_key: o.row.checklist_key as string, status: o.row.status as string, milestone_id: o.row.milestone_id as string, tasklist_id: o.row.tasklist_id as string }));
    const second = planChecklistBackfill(base({ existing }));
    assert.ok(second.ops.every((o) => o.action === "unchanged"));
  }],
  ["a status change on an existing row becomes an update", () => {
    const first = planChecklistBackfill(base());
    const existing = first.ops.map((o) => ({ id: o.id, project_id: "p1", checklist_key: o.row.checklist_key as string, status: "open", milestone_id: o.row.milestone_id as string, tasklist_id: o.row.tasklist_id as string }));
    const second = planChecklistBackfill(base({ existing }));
    assert.deepEqual(second.ops.filter((o) => o.action === "update").map((o) => o.row.checklist_key), ["kickoff-meeting-held"]);
  }],
  ["a project with no Phase 1 is reported and gets no rows", () => {
    const plan = planChecklistBackfill(base({ phases: [{ id: "ph2", project_id: "p1", phase_number: 2 }], deliverables: [] }));
    assert.equal(plan.ops.length, 0);
    assert.deepEqual(plan.skippedProjects, [{ project_id: "p1", reason: "no Phase 1 phase" }]);
  }],
  ["a Phase 1 with no deliverables is reported with its own reason", () => {
    const plan = planChecklistBackfill(base({ deliverables: [] }));
    assert.deepEqual(plan.skippedProjects, [{ project_id: "p1", reason: "no Phase 1 deliverables" }]);
  }],
  ["a missing sub-phase deliverable skips only its items and says why", () => {
    const plan = planChecklistBackfill(base({ deliverables: SUB_PHASES.filter((k) => k !== "storage-kb").map((k) => ({ id: `d-${k}`, project_id: "p1", phase_id: "ph1", deliverable_key: k })) }));
    assert.equal(plan.ops.length, 10);
    assert.equal(plan.skippedItems.length, 4);
    assert.ok(plan.skippedItems.every((s) => s.reason.includes("storage-kb")));
  }],
  ["unknown legacy keys are reported, not turned into tasks", () => {
    const plan = planChecklistBackfill(base({ legacy: [...base().legacy, { project_id: "p1", deliverable_key: "mystery-item", status: "pending" }] }));
    assert.deepEqual(plan.unknownLegacyKeys, [{ project_id: "p1", deliverable_key: "mystery-item" }]);
    assert.equal(plan.ops.length, 14);
  }],
  ["two Phase 1 phases is an ambiguity that blocks the project", () => {
    const plan = planChecklistBackfill(base({ phases: [{ id: "a", project_id: "p1", phase_number: 1 }, { id: "b", project_id: "p1", phase_number: 1 }] }));
    assert.equal(plan.ambiguities.length, 1);
    assert.equal(plan.ops.length, 0);
  }],
  ["the SQL carries drift + reconciliation guards and one statement per non-unchanged op", () => {
    const sql = checklistPlanToSql(planChecklistBackfill(base()), { existingChecklistTasks: 0 });
    assert.ok(sql.includes("DRIFT") && sql.includes("RECONCILE") && sql.includes("expected 14"));
    assert.equal(sql.split("\n").filter((l) => l.startsWith("insert into tasks")).length, 14);
    assert.ok(sql.startsWith("-- Task 434") && sql.includes("begin;") && sql.includes("commit;"));
  }],
];
