import assert from "node:assert/strict";
import { sortTasks, topSelectedIds } from "../../src/lib/tasks/task-sort";

const t = (title: string, status: string, priority: string, due_date: string | null) => ({ title, status, priority, due_date });
const list = [t("b", "closed", "low", "2026-12-01"), t("a", "open", "critical", null), t("c", "in_progress", "high", "2026-11-01")];
const titles = (l: { title: string }[]) => l.map((x) => x.title).join("");

assert.equal(titles(sortTasks(list, "title", "asc")), "abc");
assert.equal(titles(sortTasks(list, "title", "desc")), "cba");
assert.equal(titles(sortTasks(list, "status", "asc")), "acb", "open < in_progress < closed");
assert.equal(titles(sortTasks(list, "priority", "asc")), "acb", "critical < high < low");
assert.equal(titles(sortTasks(list, "due_date", "asc")), "cba", "null due date sorts last");
assert.equal(titles(sortTasks(list, "due_date", "desc")), "abc");
assert.equal(titles(sortTasks([t("x", "Open", "normal", null), t("y", "closed", "normal", null)], "status", "desc", (s) => s.toLowerCase())), "yx", "normalize applied");
assert.equal(titles(list), "bac", "input not mutated");

const parent: Record<string, string | null> = { p: null, c: "p", g: "c", s: null, loop1: "loop2", loop2: "loop1" };
assert.deepEqual(topSelectedIds(["p", "c", "g", "s"], (id) => parent[id]).sort(), ["p", "s"], "descendants of a selected ancestor dropped");
assert.deepEqual(topSelectedIds(["g"], (id) => parent[id]), ["g"], "unselected ancestors don't matter");
assert.deepEqual(topSelectedIds(["loop1"], (id) => parent[id]), ["loop1"], "cycles terminate");
console.log("task-sort OK");
