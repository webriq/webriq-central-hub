import assert from "node:assert/strict";
import { getTaskEditPermission } from "../../src/lib/tasks/permissions";

const me = "u1";
const assigned = { created_by: "pm", assignees: [me] };
const created = { created_by: me, assignees: null };
const unrelated = { created_by: "pm", assignees: ["u2"] };

const assignee = getTaskEditPermission("developer", me, assigned);
assert.equal(assignee.canAddSubtask, true, "dev assignee can add subtasks");
assert.equal(assignee.canEditDetails, false, "dev assignee still can't edit details");
assert.equal(getTaskEditPermission("developer", me, created).canAddSubtask, true, "dev creator");
assert.equal(getTaskEditPermission("developer", me, unrelated).canAddSubtask, false, "unrelated dev");
for (const role of ["client", "marketing", "hr", null]) {
  assert.equal(getTaskEditPermission(role, me, assigned).canAddSubtask, false, `${role} cannot add`);
}
for (const role of ["pm", "admin", "super_admin"]) {
  assert.equal(getTaskEditPermission(role, me, unrelated).canAddSubtask, true, `${role} can add`);
}
console.log("subtask-permission OK");
