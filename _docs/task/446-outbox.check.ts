// Task 446 — assertions for the outbox pure logic (no test runner in this repo).
// Run: npx tsx _docs/task/446-outbox.check.ts
import assert from "node:assert/strict";
import {
  BACKOFF_MS, MAX_FAILURES, outcomeAfterFailure, selectDeliverable, redactData, buildEnvelope,
  replyData, statusData, assignedData, dueData, pageEvents, isEventType, type OutboxRow,
} from "../../src/lib/stackshift-support/outbox-logic";

const NOW = Date.parse("2026-10-09T00:00:00.000Z");
const MIN = 60_000;

// 1. exact retry schedule: 1m, 5m, 30m, 2h, 12h, then dead on the 6th failure
assert.deepEqual([...BACKOFF_MS], [1 * MIN, 5 * MIN, 30 * MIN, 120 * MIN, 720 * MIN]);
assert.equal(MAX_FAILURES, 6);
const delays = [1, 2, 3, 4, 5].map((n) => {
  const o = outcomeAfterFailure(n, NOW);
  assert.equal(o.status, "pending");
  return o.status === "pending" ? Date.parse(o.nextAttemptAt) - NOW : -1;
});
assert.deepEqual(delays, [1 * MIN, 5 * MIN, 30 * MIN, 120 * MIN, 720 * MIN]);
assert.deepEqual(outcomeAfterFailure(6, NOW), { status: "dead" });
assert.deepEqual(outcomeAfterFailure(9, NOW), { status: "dead" });

// 2. per-ticket ordering gate
const iso = (offsetMin: number) => new Date(NOW + offsetMin * MIN).toISOString();
const row = (id: string, ticket: string, seq: number, status: OutboxRow["status"], due: number): OutboxRow =>
  ({ id, ticket_id: ticket, sequence: seq, status, next_attempt_at: iso(due) });

// only the head (lowest pending sequence) of each ticket goes out
let picked = selectDeliverable([row("a2", "A", 2, "pending", -1), row("a1", "A", 1, "pending", -1), row("b1", "B", 3, "pending", -1)], NOW);
assert.deepEqual(picked.map((r) => r.id), ["a1", "b1"]);
// a head that is not yet due holds back the rest of ITS ticket only
picked = selectDeliverable([row("a1", "A", 1, "pending", 5), row("a2", "A", 2, "pending", -1), row("b1", "B", 2, "pending", -1)], NOW);
assert.deepEqual(picked.map((r) => r.id), ["b1"]);
// sent / dead heads do not block the next pending event
picked = selectDeliverable([row("a1", "A", 1, "sent", -10), row("a2", "A", 2, "dead", -10), row("a3", "A", 3, "pending", -1)], NOW);
assert.deepEqual(picked.map((r) => r.id), ["a3"]);
// nothing pending => nothing to do
assert.deepEqual(selectDeliverable([row("a1", "A", 1, "sent", -1)], NOW), []);
// due exactly now is deliverable
assert.equal(selectDeliverable([row("a1", "A", 1, "pending", 0)], NOW).length, 1);

// 3. redaction: only contract fields survive; attachments forced empty until task 447
const leaky = {
  messageId: "m1", bodyHtml: "<p>hi</p>", authorName: "Sam", createdAt: "2026-10-09T00:00:00Z",
  internalNote: "secret", source_meta: { x: 1 }, staffEmail: "s@webriq.com", visibility: "internal",
  customer_view_password_hash: "h", attachments: [{ downloadUrl: "https://x" }],
};
const red = redactData("ticket.reply", leaky);
assert.deepEqual(Object.keys(red).sort(), ["attachments", "authorName", "bodyHtml", "createdAt", "messageId"]);
assert.deepEqual(red.attachments, []);
assert.deepEqual(redactData("ticket.status_changed", { from: "open", to: "closed", resolvedAt: "T", extra: 1 }), { from: "open", to: "closed", resolvedAt: "T" });
assert.deepEqual(redactData("ticket.assigned", { assigneeName: "Sam", assigneeEmail: "s@x" }), { assigneeName: "Sam" });
assert.deepEqual(redactData("ticket.due_changed", { dueAt: "T", note: "n" }), { dueAt: "T" });
assert.deepEqual(redactData("ticket.reply", null), { attachments: [] });

// 4. envelope shape
const env = buildEnvelope({
  eventId: "uuid-1", type: "ticket.status_changed", sequence: 14, occurredAt: "2026-10-09T00:00:00Z",
  ticket: { ticketRef: "r1", hubTicketId: "h1", ticketNumber: 21102, status: "closed", site: "acme" },
  data: { from: "open", to: "closed", leaked: true },
});
assert.equal(env.eventId, "evt_uuid-1");
assert.equal(env.sequence, 14);
assert.deepEqual(env.data, { from: "open", to: "closed" });
assert.deepEqual(Object.keys(env.ticket).sort(), ["hubTicketId", "site", "status", "ticketNumber", "ticketRef"]);

// 5. data builders
assert.deepEqual(statusData({ from: "open", to: "open" }), { from: "open", to: "open" });
assert.deepEqual(statusData({ from: "open", to: "closed", resolvedAt: "T" }), { from: "open", to: "closed", resolvedAt: "T" });
assert.deepEqual(assignedData({ assigneeName: "Sam" }), { assigneeName: "Sam" });
assert.deepEqual(dueData({ dueAt: "T" }), { dueAt: "T" });
assert.deepEqual(replyData({ messageId: "m", bodyHtml: "b", authorName: null, createdAt: "T" }).attachments, []);
assert.equal(isEventType("ticket.reply"), true);
assert.equal(isEventType("ticket.deleted"), false);

// 6. GET /events paging
const evs = [5, 1, 3, 9, 7].map((sequence) => ({ sequence }));
assert.deepEqual(pageEvents(evs, 0, 10), { page: [1, 3, 5, 7, 9].map((sequence) => ({ sequence })), nextSequence: null });
assert.deepEqual(pageEvents(evs, 3, 10).page.map((e) => e.sequence), [5, 7, 9]);
assert.deepEqual(pageEvents(evs, 0, 2), { page: [{ sequence: 1 }, { sequence: 3 }], nextSequence: 3 });
assert.deepEqual(pageEvents(evs, 9, 10), { page: [], nextSequence: null });
assert.deepEqual(pageEvents(evs, 0, 5).nextSequence, null);

console.log("446 outbox checks: all passed");
