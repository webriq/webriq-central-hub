// Task 468 — pure-logic checks. Run: npx tsx _docs/task/468-project-merge.check.ts
import assert from "node:assert/strict";
import { norm, taskKey, folderPaths } from "../../src/lib/projects/merge/keys";
import { rankSimilarProjects } from "../../src/lib/projects/merge/similarity";
import { buildPlan, matchMap, type ProjectData } from "../../src/lib/projects/merge/plan";

// similarity: closest name first; same customer outranks a different-customer near-match
const ranked = rankSimilarProjects(
  { name: "Acme Dental Website", customer_id: "WRQ-CLIENT-0001" },
  [
    { id: "a", project_id: null, name: "Zeta Roofing", customer_id: "WRQ-CLIENT-0009", status: "active" },
    { id: "b", project_id: null, name: "Acme Dental – Website", customer_id: "WRQ-CLIENT-0001", status: "active" },
    { id: "c", project_id: null, name: "Acme Dental Website v2", customer_id: "WRQ-CLIENT-0002", status: "active" },
  ],
);
assert.equal(ranked[0].id, "b");
assert.ok(ranked.findIndex((r) => r.id === "c") < ranked.findIndex((r) => r.id === "a"));

// keys
assert.equal(norm("  Fix  Login! "), norm("fix login"));
assert.equal(norm("Tom &amp; Jerry <b>x</b>"), "tom jerry x");
assert.equal(taskKey("Fix  Login ", "Sprint 1"), taskKey("fix login", "sprint-1"));
const paths = folderPaths([
  { id: "1", name: "Design", parent_folder_id: null, phase_number: null },
  { id: "2", name: "Logos", parent_folder_id: "1", phase_number: null },
]);
assert.equal(paths.get("2"), ":design/logos");

// plan
const empty = { tasks: [], tasklists: [], milestones: [], tickets: [], folders: [], files: [], logs: [], memberIds: [], noteCount: 0, runningTimers: [], hasProgramme: false };
const t = (id: string, title: string, status = "todo", list: string | null = null) => ({ id, title, status, parent_task_id: null, tasklist_id: list, milestone_id: null, kind: "task", checklist_key: null });
const src: ProjectData = { ...empty, id: "S", name: "Src", customerId: "C1",
  tasks: [t("s1", "Fix login"), t("s2", "Unique"), { ...t("s3", "chk"), kind: "checklist", checklist_key: "k" }],
  tasklists: [{ id: "sl", name: "Sprint 1" }],
  files: [{ id: "f1", label: "Logo.png", type: "file", folder_id: null, file_size: 10 }, { id: "f2", label: "b.png", type: "file", folder_id: null, file_size: 5 }],
  logs: [{ id: "l1", task_id: "s1", employee_id: "e", date_logged: "2026-01-01", hours: 2, note: null }] };
const tgt: ProjectData = { ...empty, id: "T", name: "Tgt", customerId: "C2",
  tasks: [t("t1", "fix  login")], tasklists: [{ id: "tl", name: "sprint 1" }],
  files: [{ id: "g1", label: "logo.png", type: "file", folder_id: null, file_size: 10 }],
  logs: [{ id: "m1", task_id: "t1", employee_id: "e", date_logged: "2026-01-01", hours: 2, note: null }] };
const plan = buildPlan(src, tgt);
assert.deepEqual(buildPlan(src, tgt), plan, "deterministic");
assert.equal(plan.counts.task.total, 2, "checklist rows are not counted");
assert.equal(plan.findings.find((f) => f.id === "task:s1")?.matchId, "t1");
assert.equal(plan.findings.find((f) => f.id === "file:f1")?.recommended, "skip");
assert.ok(!plan.findings.some((f) => f.id === "file:f2"));
assert.equal(plan.findings.find((f) => f.id === "timelog:l1")?.recommended, "skip");
assert.ok(plan.crossCustomer);
assert.equal(plan.blocked, false);
assert.equal(matchMap(plan.findings, {}, "task").get("s1"), "t1");
assert.equal(matchMap(plan.findings, { "task:s1": "keep-both" }, "task").size, 0, "decision overrides recommendation");
assert.equal(buildPlan({ ...src, runningTimers: ["x"] }, tgt).blocked, true);

console.log("468 checks OK");
