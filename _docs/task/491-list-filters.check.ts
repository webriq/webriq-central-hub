// Task 491 — assertions for the Quick Links list-filter params (no test runner in this repo).
// Run: npx tsx _docs/task/491-list-filters.check.ts
import assert from "node:assert/strict";
import {
  parseDueParam, serializeDue, dueRange, parseIdListParam, serializeIdList,
  assigneeOrFilter, applyListFilters, parseListFilters, hasListFilters, isDuePeriod,
  type DueFilter,
} from "../../src/lib/list-filters/params";

// 1. every due form round-trips
for (const raw of ["overdue", "none", "day:2026-11-19", "week:2026-11-19", "month:2026-02", "range:2026-11-01..2026-11-30"]) {
  const f = parseDueParam(raw);
  assert.ok(f, `parses ${raw}`);
  assert.equal(serializeDue(f), raw);
}

// 2. invalid inputs → Any (null)
for (const raw of [null, undefined, "", "  ", "day:2026-13-40", "day:2026-02-30", "month:2026-13", "month:2026-1",
  "week:", "range:2026-11-01", "range:2026-11-01..", "range:a..b", "range:2026-11-01..2026-11-02..2026-11-03",
  "yesterday", "day:2026-11-19;drop", "year:2026"]) {
  assert.equal(parseDueParam(raw), null, `rejects ${String(raw)}`);
}

// 3. backwards range is swapped
assert.equal(serializeDue(parseDueParam("range:2026-11-30..2026-11-01")!), "range:2026-11-01..2026-11-30");

// 4. ranges — week is Mon–Sun (Sunday belongs to the week before), month end handles Feb/leap
const range = (raw: string) => {
  const f = parseDueParam(raw)!;
  assert.ok(isDuePeriod(f));
  return dueRange(f);
};
assert.deepEqual(range("day:2026-11-19"), { from: "2026-11-19", to: "2026-11-19" });
assert.deepEqual(range("week:2026-11-19"), { from: "2026-11-16", to: "2026-11-22" }); // Thu
assert.deepEqual(range("week:2026-11-22"), { from: "2026-11-16", to: "2026-11-22" }); // Sun
assert.deepEqual(range("week:2026-12-30"), { from: "2026-12-28", to: "2027-01-03" }); // year wrap
assert.deepEqual(range("month:2026-02"), { from: "2026-02-01", to: "2026-02-28" });
assert.deepEqual(range("month:2028-02"), { from: "2028-02-01", to: "2028-02-29" });
assert.deepEqual(range("range:2026-11-01..2026-11-30"), { from: "2026-11-01", to: "2026-11-30" });

// 5. id lists: UUIDs only (the PostgREST injection guard), dedupe, lowercase, `unassigned` opt-in
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
assert.deepEqual(parseIdListParam(`${A},${B},${A.toUpperCase()}, ,`), [A, B]);
assert.deepEqual(parseIdListParam(`${A},unassigned`), [A]);
assert.deepEqual(parseIdListParam(`${A},unassigned,unassigned`, { allowUnassigned: true }), [A, "unassigned"]);
assert.deepEqual(parseIdListParam(`${A}),or(id.neq.0`), []);
assert.deepEqual(parseIdListParam("not-a-uuid"), []);
assert.deepEqual(parseIdListParam(null), []);
assert.equal(serializeIdList([]), null);
assert.equal(serializeIdList([A, B]), `${A},${B}`);

// 6. assignee `.or()` strings — tasks (array only) vs tickets (array + legacy scalar)
assert.equal(assigneeOrFilter([]), null);
assert.equal(assigneeOrFilter([A, B]), `assignees.ov.{${A},${B}}`);
assert.equal(assigneeOrFilter(["unassigned"]), "assignees.is.null,assignees.eq.{}");
assert.equal(assigneeOrFilter([A, "unassigned"]), `assignees.ov.{${A}},assignees.is.null,assignees.eq.{}`);
assert.equal(
  assigneeOrFilter([A], { scalarColumn: "assignee_id" }),
  `assignees.ov.{${A}},and(or(assignees.is.null,assignees.eq.{}),assignee_id.in.(${A}))`
);
assert.equal(
  assigneeOrFilter(["unassigned"], { scalarColumn: "assignee_id" }),
  "and(or(assignees.is.null,assignees.eq.{}),assignee_id.is.null)"
);

// 7. applyListFilters issues the expected builder calls
type Call = [string, ...unknown[]];
class Recorder {
  calls: Call[] = [];
  private rec(name: string, args: unknown[]) { this.calls.push([name, ...args]); return this; }
  gte(c: string, v: string) { return this.rec("gte", [c, v]); }
  lte(c: string, v: string) { return this.rec("lte", [c, v]); }
  lt(c: string, v: string) { return this.rec("lt", [c, v]); }
  is(c: string, v: null) { return this.rec("is", [c, v]); }
  in(c: string, v: string[]) { return this.rec("in", [c, v]); }
  not(c: string, o: string, v: string) { return this.rec("not", [c, o, v]); }
  or(f: string) { return this.rec("or", [f]); }
}
const run = (due: DueFilter | null, assignees: string[] = [], projects: string[] = [], scalar?: string) =>
  applyListFilters(new Recorder(), { due, assignees, projects }, { today: "2026-11-19", scalarAssigneeColumn: scalar }).calls;

assert.deepEqual(run(null), []);
assert.deepEqual(run({ mode: "none" }), [["is", "due_date", null]]);
assert.deepEqual(run({ mode: "overdue" }), [["lt", "due_date", "2026-11-19"], ["not", "status", "in", "(closed,Closed)"]]);
assert.deepEqual(run(parseDueParam("week:2026-11-19")), [["gte", "due_date", "2026-11-16"], ["lte", "due_date", "2026-11-22"]]);
assert.deepEqual(run(null, [A], [B]), [["or", `assignees.ov.{${A}}`], ["in", "project_id", [B]]]);
assert.deepEqual(run(null, ["unassigned"], [], "assignee_id"), [["or", "and(or(assignees.is.null,assignees.eq.{}),assignee_id.is.null)"]]);

// 8. parseListFilters / hasListFilters from raw searchParams
const parsed = parseListFilters({ due: "overdue", assignee: `${A},unassigned,junk`, project: `${B},unassigned` });
assert.deepEqual(parsed, { due: { mode: "overdue" }, assignees: [A, "unassigned"], projects: [B] });
assert.equal(hasListFilters(parsed), true);
assert.equal(hasListFilters(parseListFilters({ due: "nope", assignee: "", project: undefined })), false);

console.log("491 list-filter checks: all passed");
