import assert from "node:assert/strict";
import { selectUncheckedByCreated, selectCandidates, advanceCursor, budgetExhausted, POLL_OVERLAP_MS } from "../../src/lib/desk/poll-cursor";

const cursor = 1_000_000;
const rows = [
  { id: "new", modifiedMs: cursor + 5 },
  { id: "late-index", modifiedMs: cursor - 1000 }, // behind cursor, never ingested
  { id: "known", modifiedMs: cursor - 2000 }, // behind cursor, already ingested
];
const picked = selectCandidates(rows, cursor, new Set(["known"]));
assert.deepEqual(picked.map((r) => r.id), ["late-index", "new"], "oldest-first; known overlap rows skipped");
assert.equal(advanceCursor(cursor, cursor - 1000), cursor, "cursor never regresses");
assert.equal(advanceCursor(cursor, cursor + 5), cursor + 5);
assert.equal(budgetExhausted(0, 239_999, 240_000), false);
assert.equal(budgetExhausted(0, 240_000, 240_000), true);
assert.ok(POLL_OVERLAP_MS > 0);
const created = selectUncheckedByCreated(
  [
    { id: "a", createdMs: 10 },
    { id: "b", createdMs: 30 },
    { id: "known", createdMs: 40 },
    { id: "old", createdMs: 5 },
  ],
  8,
  new Set(["known"])
);
assert.deepEqual(created.map((r) => r.id), ["a", "b"], "created pass: after cursor, unknown only, oldest-first");
console.log("441 poll-cursor checks passed");
