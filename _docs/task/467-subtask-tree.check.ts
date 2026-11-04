import assert from "node:assert/strict";
import { buildTree, rollup, MAX_SUBTASK_DEPTH } from "../../src/lib/tasks/subtask-tree";

const t = (id: string, p: string | null, status = "open", position = 0) => ({ id, parent_task_id: p, status, position });
const rows = [t("root", null), t("b", "root", "open", 2), t("a", "root", "closed", 1), t("a1", "a", "closed"), t("a1x", "a1", "open"), t("orphan", "ghost"), t("c1", "c2"), t("c2", "c1")];
const tree = buildTree(rows, "root");
assert.deepEqual(tree.map((n) => n.task.id), ["a", "b"], "siblings sorted by position, orphans/cycles excluded");
assert.equal(tree[0].children[0].children[0].depth, 3, "third level depth");
assert.deepEqual(rollup(tree), { done: 2, total: 4 }, "rollup counts all descendants");
assert.equal(MAX_SUBTASK_DEPTH, 5);
console.log("subtask-tree OK");
