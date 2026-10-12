// Task 448 — assertions for the read model: cursor, status/limit parsing, serialisers, activity, and a
// leak-proof fixture (no test runner in this repo). Run: npx tsx _docs/task/448-read-model.check.ts
import assert from "node:assert/strict";
import {
  encodeCursor, decodeCursor, cursorOrFilter, pageRows, parseStatusFilter, parseLimit, priorityOut,
  serializeTicket, serializeMessages, buildActivity, appendStatusLog, readStatusLog, STATUS_LOG_KEY,
  type MessageRow, type TicketRow,
} from "../../src/lib/stackshift-support/read-model";

const UUID = "123e4567-e89b-12d3-a456-426614174000";
const TS = "2026-10-08T01:02:03.123456+00:00";

// 1. cursor round trip keeps microseconds; tampering is rejected
const cur = encodeCursor({ createdAt: TS, id: UUID });
assert.deepEqual(decodeCursor(cur), { createdAt: TS, id: UUID });
assert.equal(decodeCursor("not-base64-json"), null);
assert.equal(decodeCursor(Buffer.from(JSON.stringify({ c: "yesterday", i: UUID })).toString("base64url")), null);
assert.equal(decodeCursor(Buffer.from(JSON.stringify({ c: TS, i: "1; drop table inbox" })).toString("base64url")), null);
assert.equal(decodeCursor(Buffer.from(JSON.stringify({ c: `${TS}",or(site.eq.x`, i: UUID })).toString("base64url")), null, "filter injection");
assert.equal(decodeCursor(Buffer.from(JSON.stringify({ c: 5, i: UUID })).toString("base64url")), null);
assert.equal(decodeCursor(""), null);
assert.equal(cursorOrFilter({ createdAt: TS, id: UUID }), `created_at.lt."${TS}",and(created_at.eq."${TS}",id.lt."${UUID}")`);

// 2. keyset paging: limit+1 probe, nextCursor from the LAST ROW OF THE PAGE, null at the end
const mk = (n: number) => ({ created_at: `2026-10-08T01:00:0${n}.000000+00:00`, id: `123e4567-e89b-12d3-a456-42661417400${n}` });
const rows = [mk(5), mk(4), mk(3)];
let pg = pageRows(rows, 2);
assert.equal(pg.page.length, 2);
assert.deepEqual(decodeCursor(pg.nextCursor!), { createdAt: mk(4).created_at, id: mk(4).id });
pg = pageRows(rows, 3);
assert.equal(pg.nextCursor, null, "exactly a full last page has no next page");
assert.equal(pageRows([], 25).nextCursor, null);

// 3. filters
assert.deepEqual(parseStatusFilter(null), { ok: true, value: null });
assert.deepEqual(parseStatusFilter("all"), { ok: true, value: null });
for (const s of ["open", "on_hold", "escalated", "closed"]) assert.deepEqual(parseStatusFilter(s), { ok: true, value: s });
assert.deepEqual(parseStatusFilter("deleted"), { ok: false });
assert.equal(parseLimit(null), 25);
assert.equal(parseLimit("1"), 1);
assert.equal(parseLimit("50"), 50);
assert.equal(parseLimit("0"), null);
assert.equal(parseLimit("51"), null);
assert.equal(parseLimit("2.5"), null);
assert.equal(parseLimit("abc"), null);
assert.equal(priorityOut("critical"), "urgent");
assert.equal(priorityOut("high"), "high");

// 4. LEAK FIXTURE — rows carry everything that must never leave; serialised output must contain none of it
const SECRETS = ["SECRET_INTERNAL_NOTE", "staff@webriq.com", "pw_hash_abc", "SOURCE_META_SECRET", "requester@customer.com", "profile-uuid-staff", "llm draft text", "system text"];
const ticketRow = {
  id: UUID, ticket_number: 21102, external_ref: "ss_1", subject: "Hi", status: "open", priority: "critical",
  sla_due_at: "2026-10-09T00:00:00Z", created_at: TS, updated_at: TS,
  // fields a careless spread would leak:
  requester_email: "requester@customer.com", customer_view_password_hash: "pw_hash_abc", source_meta: { x: "SOURCE_META_SECRET" },
} as TicketRow & Record<string, unknown>;
const msg = (over: Partial<MessageRow>): MessageRow => ({
  id: crypto.randomUUID(), author_type: "client", author_id: null, visibility: "public", body: "<p>ok</p>",
  external_ref: null, created_at: TS, source_meta: {}, ...over,
});
const messages: MessageRow[] = [
  msg({ id: "m1", body: "<p>first</p>", external_ref: "ss_1#body", created_at: "2026-10-08T01:00:00+00:00", source_meta: { author: { name: "Celena", email: "requester@customer.com" }, secret: "SOURCE_META_SECRET" } }),
  msg({ id: "m2", author_type: "staff", author_id: "profile-uuid-staff", body: "<p>reply</p>", created_at: "2026-10-08T02:00:00+00:00", source_meta: { staffEmail: "staff@webriq.com" } }),
  msg({ id: "m3", author_type: "staff", visibility: "internal", body: "SECRET_INTERNAL_NOTE", created_at: "2026-10-08T03:00:00+00:00" }),
  msg({ id: "m4", author_type: "llm_draft", body: "llm draft text", created_at: "2026-10-08T04:00:00+00:00" }),
  msg({ id: "m5", author_type: "system", body: "system text", created_at: "2026-10-08T05:00:00+00:00" }),
];
const names = new Map([["profile-uuid-staff", "Sam Support"]]);
const atts = new Map([["m2", [{ filename: "a.png", size: 5, contentType: "image/png", downloadUrl: "https://signed", expiresInSeconds: 900, storage_path: "SOURCE_META_SECRET" } as never]]]);
const ser = serializeMessages(messages, names, atts);
assert.deepEqual(ser.map((m) => m.messageId), ["m1", "m2"], "only public client/staff messages, oldest first");
assert.equal(ser[0].authorName, "Celena");
assert.equal(ser[1].authorName, "Sam Support", "staff identified by display name only");
assert.deepEqual(Object.keys(ser[1].attachments[0]).sort(), ["contentType", "downloadUrl", "expiresInSeconds", "filename", "size"]);
assert.equal(serializeMessages([msg({ author_type: "staff", author_id: "unknown" })], names, new Map())[0].authorName, "WebriQ Support");
assert.equal(serializeMessages([msg({ source_meta: null })], names, new Map())[0].authorName, null);

const activity = buildActivity({
  createdAt: TS, messages: ser,
  staffStatusEvents: [{ at: "2026-10-08T06:00:00+00:00", from: "open", to: "on_hold" }],
  customerStatusLog: [{ at: "2026-10-08T07:00:00+00:00", status: "closed" }],
});
const out = JSON.stringify({ ticket: serializeTicket(ticketRow, { message_count: 2, last_message_at: TS }), messages: ser, activity });
for (const secret of SECRETS) assert.equal(out.includes(secret), false, `leaked: ${secret}`);
assert.deepEqual(Object.keys(serializeTicket(ticketRow)).sort(), [
  "createdAt", "dueAt", "hubTicketId", "lastMessageAt", "messageCount", "priority", "subject", "status", "ticketNumber", "ticketRef", "updatedAt",
].sort());
assert.equal(serializeTicket(ticketRow).priority, "urgent");
assert.equal(serializeTicket(ticketRow).messageCount, 0, "missing stats default to zero");

// 5. activity: opening message is not a comment; ordered; staff + customer status entries; no names
assert.deepEqual(activity.map((a) => a.type), ["created", "staff_reply", "status_changed", "status_changed"]);
assert.equal(activity[2].summary, "Status changed from open to on hold");
assert.equal(activity[3].summary, "You closed the ticket");
const withComment = buildActivity({ createdAt: TS, messages: serializeMessages([msg({ id: "c", external_ref: "cmt_1" })], names, new Map()), staffStatusEvents: [], customerStatusLog: [] });
assert.deepEqual(withComment.map((a) => a.type).sort(), ["created", "customer_comment"]);
// mixed timestamp formats sort as instants
const mixed = buildActivity({ createdAt: "2026-10-08T00:00:00Z", messages: [], staffStatusEvents: [{ at: "2026-10-08T00:30:00+00:00", from: "open", to: "closed" }, { at: "2026-10-08T00:10:00Z", from: "closed", to: "open" }], customerStatusLog: [] });
assert.deepEqual(mixed.map((a) => a.at), ["2026-10-08T00:00:00Z", "2026-10-08T00:10:00Z", "2026-10-08T00:30:00+00:00"]);

// 6. customer status log: append, cap, tolerant read
let meta: Record<string, unknown> | null = { keep: 1 };
for (let i = 0; i < 60; i++) meta = appendStatusLog(meta, { at: `2026-10-08T00:00:${String(i % 60).padStart(2, "0")}Z`, status: i % 2 ? "open" : "closed" });
assert.equal(readStatusLog(meta).length, 50, "capped");
assert.equal(meta!.keep, 1, "other source_meta keys preserved");
assert.ok(STATUS_LOG_KEY in meta!);
assert.deepEqual(readStatusLog(null), []);
assert.deepEqual(readStatusLog({ [STATUS_LOG_KEY]: [{ at: "T", status: "bogus" }, { at: 5 }, "x", { at: "T", status: "open" }] }), [{ at: "T", status: "open" }]);

console.log("448 read-model checks: all passed");
