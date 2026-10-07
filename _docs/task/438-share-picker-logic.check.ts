// Task 438 — assertions for the Share Picker's pure rules (no test runner in this repo).
// Run: npx tsx _docs/task/438-share-picker-logic.check.ts
import assert from "node:assert/strict";
import {
  allCoveredByRoles, filterPeople, filterRoles, selectionCount, toggleRole, toggleUser,
} from "../../src/components/share-picker/share-picker-logic";
import type { SharePerson, ShareRoleOption, ShareSelection } from "../../src/components/share-picker/types";

const roles: ShareRoleOption[] = [
  { value: "developer", label: "Developers" }, { value: "pm", label: "Project managers" }, { value: "hr", label: "HR" },
];
const people: SharePerson[] = [
  { id: "a", name: "Allen Cartagenas", role: "developer" }, { id: "b", name: "Ericka Dichon", role: "developer" },
  { id: "c", name: "April Trocio", role: "pm" }, { id: "d", name: "Maria Santos", role: "hr" },
];
const none: ShareSelection = { roles: [], userIds: [] };

// 1. nothing selected → everyone listed, all roles offered
assert.equal(filterPeople(people, roles, none, "").length, 4);
assert.equal(filterRoles(roles, "").length, 3);

// 2. selecting a role hides its members from the list
const dev = toggleRole(none, "developer", people);
assert.deepEqual(filterPeople(people, roles, dev, "").map((p) => p.id), ["c", "d"]);

// 3. already-picked members of the role are dropped from the chips (the role covers them)
const picked = toggleUser(toggleUser(none, "a"), "c");
const withRole = toggleRole(picked, "developer", people);
assert.deepEqual(withRole, { roles: ["developer"], userIds: ["c"] });

// 4. deselecting the role restores its members to the list (and does not re-pick them)
const back = toggleRole(withRole, "developer", people);
assert.deepEqual(back, { roles: [], userIds: ["c"] });
assert.equal(filterPeople(people, roles, back, "").length, 4);

// 5. individually selected people stay listed so they can be toggled off
assert.ok(filterPeople(people, roles, picked, "").some((p) => p.id === "a"));
assert.deepEqual(toggleUser(picked, "a").userIds, ["c"]);

// 6. exclusions: roles already shared never appear; people already shared never listed
assert.deepEqual(filterRoles(roles, "", ["pm"]).map((r) => r.value), ["developer", "hr"]);
assert.deepEqual(filterPeople(people, roles, none, "", ["a", "d"]).map((p) => p.id), ["b", "c"]);

// 7. search matches name or role label, case-insensitive; roles match by label
assert.deepEqual(filterPeople(people, roles, none, "ERIC").map((p) => p.id), ["b"]);
assert.deepEqual(filterPeople(people, roles, none, "project").map((p) => p.id), ["c"]);
assert.deepEqual(filterRoles(roles, "dev").map((r) => r.value), ["developer"]);
assert.equal(filterPeople(people, roles, none, "zzz").length, 0);

// 8. "everyone covered" is reported only when roles swallowed every candidate
const all = { roles: ["developer", "pm", "hr"], userIds: [] };
assert.equal(allCoveredByRoles(people, all), true);
assert.equal(allCoveredByRoles(people, dev), false);
assert.equal(allCoveredByRoles([], all), false);

// 9. inactive (deactivated) people are never offered, never counted as "everyone covered" candidates
const withInactive: SharePerson[] = [...people, { id: "z", name: "Zed Gone", role: "developer", inactive: true }];
assert.equal(filterPeople(withInactive, roles, none, "").some((p) => p.id === "z"), false);
assert.equal(filterPeople(withInactive, roles, none, "zed").length, 0);
assert.equal(allCoveredByRoles(withInactive, { roles: ["developer", "pm", "hr"], userIds: [] }), true);
assert.equal(allCoveredByRoles([{ id: "z", name: "Zed", role: "hr", inactive: true }], none), false);

// 10. count
assert.equal(selectionCount(withRole), 2);

console.log("share-picker logic: all checks passed");
