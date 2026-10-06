import { INTERNAL_DELIVERABLES } from "@/config/customer-phases";
import {
  checklistTaskRow, checklistToTaskStatus, completionColumns, deriveSubPhaseStatus, mergeInternalRows, positionInSubPhase, taskToChecklistStatus, toInternalRows,
} from "@/lib/programme/checklist-tasks";
import { assert, type Check } from "./_harness";

// Task 434 — pure mapping between the Phase 1 onboarding checklist and `tasks` rows.
const NOW = "2026-10-06T00:00:00.000Z";

export const checks: Check[] = [
  ["status maps to the Zoho-style task vocabulary and back", () => {
    assert.equal(checklistToTaskStatus("pending"), "open");
    assert.equal(checklistToTaskStatus("in_progress"), "in_progress");
    assert.equal(checklistToTaskStatus("done"), "closed");
    assert.equal(taskToChecklistStatus("open"), "pending");
    assert.equal(taskToChecklistStatus("closed"), "done");
    for (const s of ["pending", "in_progress", "done"] as const) assert.equal(taskToChecklistStatus(checklistToTaskStatus(s)), s);
  }],
  ["QA-pipeline task statuses read as in_progress", () => {
    for (const s of ["in_progress", "ready_for_qa", "testing_completed", "for_client_approval", "ready_to_merge", "post_live_qa"]) {
      assert.equal(taskToChecklistStatus(s), "in_progress");
    }
  }],
  ["sub-phase status derives from its items (all done / any started / none)", () => {
    assert.equal(deriveSubPhaseStatus([]), "pending");
    assert.equal(deriveSubPhaseStatus(["pending", "pending"]), "pending");
    assert.equal(deriveSubPhaseStatus(["done", "pending"]), "in_progress");
    assert.equal(deriveSubPhaseStatus(["in_progress", "pending"]), "in_progress");
    assert.equal(deriveSubPhaseStatus(["done", "done"]), "done");
  }],
  ["completion columns: done carries is_completed/completed_on/100, anything else clears them", () => {
    assert.deepEqual(completionColumns("done", NOW), { status: "closed", is_completed: true, completed_on: NOW, completion_percentage: 100 });
    assert.deepEqual(completionColumns("pending", NOW), { status: "open", is_completed: false, completed_on: null, completion_percentage: 0 });
  }],
  ["every config item yields a checklist row keyed by its config key, with a unique position per sub-phase", () => {
    const seen = new Set<string>();
    for (const item of INTERNAL_DELIVERABLES) {
      const row = checklistTaskRow(item, { projectId: "p", phaseId: "ph", deliverableId: "d", position: positionInSubPhase(item) }, "pending", NOW);
      assert.equal(row.kind, "checklist");
      assert.equal(row.checklist_key, item.key);
      assert.equal(row.title, item.name);
      assert.equal(row.milestone_id, "ph");
      assert.equal(row.tasklist_id, "d");
      assert.equal(row.created_by, undefined);
      const slot = `${item.subPhaseKey}:${row.position}`;
      assert.ok(!seen.has(slot), `duplicate position ${slot}`);
      seen.add(slot);
    }
  }],
  ["config has the 14 checklist items", () => {
    assert.equal(INTERNAL_DELIVERABLES.length, 14);
  }],
  ["merge: task rows win per key, legacy fills the keys that have no task", () => {
    const row = (key: string, status: "pending" | "in_progress" | "done") => ({ id: key, project_id: "p", deliverable_key: key, status, created_at: "c", updated_at: "u" });
    const merged = mergeInternalRows([row("a", "done")], [row("a", "pending"), row("b", "in_progress")]);
    assert.deepEqual(merged.map((r) => [r.deliverable_key, r.status]), [["a", "done"], ["b", "in_progress"]]);
    assert.deepEqual(mergeInternalRows([], [row("b", "pending")]).length, 1);
  }],
  ["adapter returns the legacy row shape and ignores non-checklist tasks", () => {
    const rows = toInternalRows([
      { id: "t1", project_id: "p", checklist_key: "kickoff-meeting-held", status: "closed", created_at: "c", updated_at: "u" },
      { id: "t2", project_id: "p", checklist_key: null, status: "open", created_at: "c", updated_at: "u" },
    ]);
    assert.deepEqual(rows, [{ id: "t1", project_id: "p", deliverable_key: "kickoff-meeting-held", status: "done", created_at: "c", updated_at: "u" }]);
  }],
];
