// Task 487 — self-check of the Tasks listing tree model + drop resolution.
// Run: npx tsx _docs/task/487-move-rules.check.ts
import assert from "node:assert/strict";
import {
  buildPhases, childrenMap, groupResolver, generalTasklistId, NO_LIST, NO_PHASE, descendantRollup, type TreeTask,
} from "../../src/app/(hub)/projects/_shared/_tasks/_task-tree";
import {
  zoneFor, resolveTaskMove, resolveGroupMove, resolvePhaseMove, reorderIds, positionsToWrite, type TaskCtx,
} from "../../src/app/(hub)/projects/_shared/_tasks/_move-rules";
import { phaseNumber } from "../../src/app/(hub)/projects/_shared/_tasks/_tree-colors";

const ms = (id: string, position: number | null) => ({ id, name: id, position, start_date: null, status: "active", due_date: null });
const tl = (id: string, milestone_id: string | null, position: number | null, name = id) => ({ id, name, position, milestone_id, created_at: `2026-01-0${position ?? 9}` });
const tk = (id: string, tasklist_id: string | null, parent: string | null, depth: number, position: number, status = "open"): TreeTask =>
  ({ id, tasklist_id, parent_task_id: parent, depth, position, status });

// Phases P1, P2 (P2 sorts first by position). Lists: A,B in P1; C in P2; G (General) no phase.
const milestones = [ms("P1", 2), ms("P2", 1)];
const lists = [tl("A", "P1", 2), tl("B", "P1", 1), tl("C", "P2", 1), tl("G", null, 3, "General")];
const tasks = [
  tk("r1", "A", null, 0, 1), tk("c1", "A", "r1", 1, 1), tk("g1", "A", "c1", 2, 1, "closed"),
  tk("r2", "A", null, 0, 2), tk("r3", "B", null, 0, 1), tk("o1", null, null, 0, 1), tk("x1", "C", null, 0, 1, "closed"),
];
const phases = buildPhases(tasks, lists, milestones, (l) => [...l].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)));

// Tree: phase order by position, groups by position, orphan folded into General, no-phase section last.
assert.deepEqual(phases.map((p) => p.key), ["P2", "P1", NO_PHASE]);
assert.deepEqual(phases.map((p) => p.number), [1, 2, null]);
assert.deepEqual(phases[1].groups.map((g) => g.id), ["B", "A"]);
assert.deepEqual(phases[2].groups.map((g) => g.id), ["G"]);
assert.deepEqual(phases[2].groups[0].tasks.map((t) => t.id), ["o1"]);
assert.deepEqual({ done: phases[1].done, total: phases[1].total }, { done: 1, total: 5 });
assert.equal(generalTasklistId(lists), "G");
// No milestones → one unlabeled section; no General → orphans in NO_LIST.
const flat = buildPhases(tasks, lists.filter((l) => l.id !== "G"), [], (l) => l);
assert.deepEqual(flat.map((p) => p.key), [NO_PHASE]);
assert.ok(flat[0].groups.some((g) => g.id === NO_LIST));
// Rollup.
const children = childrenMap(tasks);
assert.deepEqual(descendantRollup("r1", children), { done: 1, total: 2 });

// Zones.
assert.equal(zoneFor("task", "task", 0.1), "before");
assert.equal(zoneFor("task", "task", 0.5), "nest");
assert.equal(zoneFor("task", "task", 0.9), "after");
assert.equal(zoneFor("group", "task", 0.9), "into");
assert.equal(zoneFor("group", "group", 0.2), "before");
assert.equal(zoneFor("task", "group", 0.5), null);
assert.equal(zoneFor("phase", "phase", 0.8), "after");
assert.equal(zoneFor("phase", "task", 0.8), "into");

const ctx: TaskCtx<TreeTask> = {
  byId: new Map(tasks.map((t) => [t.id, t])), children, groups: phases.flatMap((p) => p.groups), phases, groupOf: groupResolver(lists),
};
// Sibling reorder: r2 before r1.
assert.deepEqual(resolveTaskMove(ctx, "r2", { kind: "task", id: "r1", zone: "before" }, false),
  { taskId: "r2", tasklistId: "A", parentId: null, beforeId: null, afterId: "r1", depth: 0 });
// No-op: r2 after r1 is where it already is.
assert.equal(resolveTaskMove(ctx, "r2", { kind: "task", id: "r1", zone: "after" }, true), null);
// Cross-group needs `anywhere`.
assert.equal(resolveTaskMove(ctx, "r3", { kind: "task", id: "r1", zone: "before" }, false), null);
assert.deepEqual(resolveTaskMove(ctx, "r3", { kind: "task", id: "r1", zone: "after" }, true),
  { taskId: "r3", tasklistId: "A", parentId: null, beforeId: "r1", afterId: "r2", depth: 0 });
// Nest: r2 under g1 (depth 3) → last child; un-nest g1 to a root before r2.
assert.deepEqual(resolveTaskMove(ctx, "r2", { kind: "task", id: "g1", zone: "nest" }, true),
  { taskId: "r2", tasklistId: "A", parentId: "g1", beforeId: null, afterId: null, depth: 3 });
assert.deepEqual(resolveTaskMove(ctx, "g1", { kind: "task", id: "r2", zone: "before" }, true),
  { taskId: "g1", tasklistId: "A", parentId: null, beforeId: "r1", afterId: "r2", depth: 0 });
// Own subtree is invalid.
assert.equal(resolveTaskMove(ctx, "r1", { kind: "task", id: "g1", zone: "nest" }, true), null);
// Depth cap: r1 (height 2) nested under g1's level would be 3 + 2 > 5 only if deep enough — build a deep chain.
const deep = [...tasks, tk("d1", "B", "r3", 1, 1), tk("d2", "B", "d1", 2, 1), tk("d3", "B", "d2", 3, 1), tk("d4", "B", "d3", 4, 1)];
const dPhases = buildPhases(deep, lists, milestones, (l) => l);
const dCtx: TaskCtx<TreeTask> = { byId: new Map(deep.map((t) => [t.id, t])), children: childrenMap(deep), groups: dPhases.flatMap((p) => p.groups), phases: dPhases, groupOf: groupResolver(lists) };
assert.equal(resolveTaskMove(dCtx, "r1", { kind: "task", id: "d3", zone: "nest" }, true), null); // 4 + 2 > 5
assert.ok(resolveTaskMove(dCtx, "r2", { kind: "task", id: "d4", zone: "nest" }, true)); // 5 + 0 = 5
// Into a group header → first root; into a phase → its first group; into NO_LIST is invalid.
assert.deepEqual(resolveTaskMove(ctx, "r1", { kind: "group", id: "C", zone: "into" }, true),
  { taskId: "r1", tasklistId: "C", parentId: null, beforeId: null, afterId: "x1", depth: 0 });
assert.equal(resolveTaskMove(ctx, "r1", { kind: "phase", id: "P1", zone: "into" }, true)?.tasklistId, "B");
assert.equal(resolveTaskMove(dCtx, "r1", { kind: "group", id: NO_LIST, zone: "into" }, true), null);

// Groups + phases.
assert.deepEqual(reorderIds(["a", "b", "c"], "c", "a", "before"), ["c", "a", "b"]);
assert.equal(reorderIds(["a", "b"], "b", "a", "after"), null);
assert.deepEqual(resolveGroupMove(phases, "A", { kind: "group", id: "B", zone: "before" }), { groupId: "A", phaseKey: "P1", order: ["A", "B"] });
assert.deepEqual(resolveGroupMove(phases, "A", { kind: "phase", id: "P2", zone: "into" }), { groupId: "A", phaseKey: "P2", order: ["C", "A"] });
assert.equal(resolveGroupMove(phases, "A", { kind: "group", id: "A", zone: "before" }), null);
assert.deepEqual(resolvePhaseMove(phases, "P1", { kind: "phase", id: "P2", zone: "before" }), ["P1", "P2"]);
assert.equal(resolvePhaseMove(phases, "P1", { kind: "phase", id: NO_PHASE, zone: "before" }), null);
assert.deepEqual(positionsToWrite(["P1", "P2"], new Map([["P1", 2], ["P2", 1]])), [{ id: "P1", position: 1 }, { id: "P2", position: 2 }]);
assert.deepEqual(positionsToWrite(["x"], new Map([["x", 1]])), []);

// Phase numbers: programme phases keep theirs; custom ones shift by one when programme Phase 1 is hidden.
const prog = [{ name: "Migrate & Rebrand" }, { name: "Optimize" }, { name: "Testing" }];
assert.equal(phaseNumber(prog[0], 1, prog), 2);
assert.equal(phaseNumber(prog[1], 2, prog), 5);
assert.equal(phaseNumber(prog[2], 5, prog), 6);
assert.equal(phaseNumber({ name: "Design" }, 1, [{ name: "Design" }]), 1);

console.log("487 move-rules checks: PASS");
