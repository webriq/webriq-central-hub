// Task 445 — assertions for the inbound schemas + pure decision helpers (no test runner in this repo).
// Run: npx tsx _docs/task/445-support-inbound.check.ts
import assert from "node:assert/strict";
import { createTicketSchema, createCommentSchema, updateStatusSchema } from "../../src/lib/stackshift-support/schema";
import {
  mapPriority, hashBody, decideIdempotency, clampCreatedAt, pickDuplicateOf, statusPatch, isSameCreateRetry,
} from "../../src/lib/stackshift-support/inbound-logic";
import { escapeLike } from "../../src/lib/stackshift-support/like";

const actor = { site: "acme", userRef: "usr_1", email: "a@b.co", name: "A" };
const base = { idempotencyKey: "k1", ticketRef: "t1", actor, subject: "Hi", bodyHtml: "<p>x</p>" };

// schema: valid + defaults
const ok = createTicketSchema.parse(base);
assert.equal(ok.priority, "normal");
assert.equal(ok.suppressCustomerNotifications, true);
// strict: unknown fields rejected at every level
assert.equal(createTicketSchema.safeParse({ ...base, extra: 1 }).success, false);
assert.equal(createTicketSchema.safeParse({ ...base, actor: { ...actor, extra: 1 } }).success, false);
// required / bounds
assert.equal(createTicketSchema.safeParse({ ...base, subject: "" }).success, false);
assert.equal(createTicketSchema.safeParse({ ...base, subject: "x".repeat(501) }).success, false);
assert.equal(createTicketSchema.safeParse({ ...base, bodyHtml: "x".repeat(100_001) }).success, false);
assert.equal(createTicketSchema.safeParse({ ...base, actor: { ...actor, email: "nope" } }).success, false);
assert.equal(createTicketSchema.safeParse({ ...base, priority: "bogus" }).success, false);
assert.equal(createTicketSchema.safeParse({ ...base, priority: "urgent" }).success, true);
assert.equal(createTicketSchema.safeParse({ ...base, createdAt: "yesterday" }).success, false);
assert.equal(createTicketSchema.safeParse({ ...base, createdAt: "2026-10-02T15:58:11Z" }).success, true);
// attachments: empty ok, non-empty rejected until task 447
assert.equal(createTicketSchema.safeParse({ ...base, attachments: [] }).success, true);
assert.equal(createTicketSchema.safeParse({ ...base, attachments: [{ path: "p" }] }).success, false);
// comment + status
assert.equal(createCommentSchema.safeParse({ idempotencyKey: "k", commentRef: "c", actor, bodyHtml: "<p>y</p>" }).success, true);
assert.equal(createCommentSchema.safeParse({ idempotencyKey: "k", actor, bodyHtml: "<p>y</p>" }).success, false);
assert.equal(updateStatusSchema.safeParse({ idempotencyKey: "k", actor, status: "closed" }).success, true);
assert.equal(updateStatusSchema.safeParse({ idempotencyKey: "k", actor, status: "escalated" }).success, false);

// priority mapping
assert.equal(mapPriority("urgent"), "critical");
assert.equal(mapPriority("high"), "high");
assert.equal(mapPriority("low"), "low");

// idempotency decision matrix
const h1 = hashBody('{"a":1}');
assert.equal(hashBody('{"a":1}'), h1);
assert.notEqual(hashBody('{"a":2}'), h1);
assert.deepEqual(decideIdempotency(null, "create", h1), { kind: "new" });
assert.deepEqual(
  decideIdempotency({ route: "create", body_hash: h1, response: { ok: true } }, "create", h1),
  { kind: "replay", response: { ok: true } },
);
assert.deepEqual(decideIdempotency({ route: "create", body_hash: h1, response: {} }, "create", hashBody("x")), { kind: "conflict" });
assert.deepEqual(decideIdempotency({ route: "comment", body_hash: h1, response: {} }, "create", h1), { kind: "conflict" });

// createdAt clamp
const NOW = Date.parse("2026-10-09T00:00:00.000Z");
assert.equal(clampCreatedAt("2026-10-02T15:58:11Z", NOW), "2026-10-02T15:58:11.000Z");
assert.equal(clampCreatedAt("2027-01-01T00:00:00Z", NOW), "2026-10-09T00:00:00.000Z");
assert.equal(clampCreatedAt(undefined, NOW), "2026-10-09T00:00:00.000Z");
assert.equal(clampCreatedAt("garbage", NOW), "2026-10-09T00:00:00.000Z");

// duplicate resolver: exact beats heuristic, heuristic kept otherwise, none => null
assert.deepEqual(pickDuplicateOf({ id: "d1", ticket_number: 5 }, { inboxId: "m1", ticketNumber: 3 }),
  { inboxId: "d1", ticketNumber: 5, via: "desk_ticket_id" });
assert.deepEqual(pickDuplicateOf(null, { inboxId: "m1", ticketNumber: 3 }), { inboxId: "m1", ticketNumber: 3, via: "heuristic" });
assert.equal(pickDuplicateOf(null, null), null);

// (the customer-notification gate moved to stepdown-logic in task 450; see 450-stepdown.check.ts)

// status patch
assert.deepEqual(statusPatch("closed", "T"), { status: "closed", resolved_at: "T" });
assert.deepEqual(statusPatch("open", "T"), { status: "open", resolved_at: null });

// review fix #2: a create whose ticketRef exists is a RETRY only for the same site + subject
assert.equal(isSameCreateRetry({ stackshift_site: "acme", subject: "Hi" }, "acme", "Hi"), true);
assert.equal(isSameCreateRetry({ stackshift_site: "acme", subject: "Hi" }, "acme", "Other"), false, "different request, same ref => 409");
assert.equal(isSameCreateRetry({ stackshift_site: "other", subject: "Hi" }, "acme", "Hi"), false, "another site's ref is never a retry");
assert.equal(isSameCreateRetry({ stackshift_site: null, subject: "Hi" }, "acme", "Hi"), false);

// review fix #4: ilike values match literally (no accidental wildcards from _ or %)
assert.equal(escapeLike("john_doe@x.com"), "john\\_doe@x.com");
assert.equal(escapeLike("100%@x.com"), "100\\%@x.com");
assert.equal(escapeLike("back\\slash"), "back\\\\slash");
assert.equal(escapeLike("plain@x.com"), "plain@x.com");

console.log("445 inbound checks: all passed");
