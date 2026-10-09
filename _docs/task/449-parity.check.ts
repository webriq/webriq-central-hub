// Task 449 — assertions for the parity-gate logic (no test runner in this repo).
// Run: npx tsx _docs/task/449-parity.check.ts
import assert from "node:assert/strict";
import {
  normalizeHtml, compareMessages, compareStatus, pairCopies, checkA, checkB, checkC, checkD, checkE, checkF,
  evaluateThresholds, applyAcknowledgements, evaluateOverall, clampWindow, authSpikes, shouldAlert, normSite,
  ackableTicketIds, MIN_TICKETS, MIN_WINDOW_DAYS, type Copy, type DeskCopy, type DirectCopy, type Msg,
} from "../../src/lib/stackshift-support/parity-logic";

const T0 = Date.parse("2026-10-01T00:00:00Z");
const iso = (sec: number) => new Date(T0 + sec * 1000).toISOString();
const msg = (body: string, sec: number, over: Partial<Msg> = {}): Msg => ({ author_type: "client", visibility: "public", body, created_at: iso(sec), ...over });
const copy = (id: string, n: number, messages: Msg[], over: Partial<Copy> = {}): Copy => ({
  id, ticket_number: n, status: "open", resolved_at: null, created_at: iso(0), messages, attachmentCount: 0, ...over,
});
const desk = (n: number, messages: Msg[], over: Partial<Copy> = {}): DeskCopy => ({ ...copy(`desk-${n}`, n, messages, over), external_id: `D${n}` });
const direct = (n: number, messages: Msg[], over: Partial<Copy> = {}): DirectCopy => ({ ...copy(`dir-${n}`, n, messages, over), desk_ticket_id: `D${n}` });

// 1. HTML normalisation: markup differences between Desk and Hub renderings vanish; text differences don't
assert.equal(normalizeHtml("<div>Hello&nbsp;world</div>"), normalizeHtml("<p>Hello world</p>"));
assert.equal(normalizeHtml("<p>a</p><p>b</p>"), normalizeHtml("a<br>b"));
assert.equal(normalizeHtml("Tom &amp; Jerry &#39;s &lt;3"), "Tom & Jerry 's <3");
assert.equal(normalizeHtml("<style>p{color:red}</style><p>x</p>"), "x");
assert.equal(normalizeHtml("a​ b  c"), "a b c");
assert.equal(normalizeHtml("  <p> spaced   out </p>\n\n\n"), "spaced out");
assert.notEqual(normalizeHtml("<p>Hello world</p>"), normalizeHtml("<p>Hello World</p>"), "case matters");
assert.notEqual(normalizeHtml("<p>Hello world</p>"), normalizeHtml("<p>Hello  worlds</p>"));
assert.equal(normalizeHtml("&#x41;&#66;"), "AB");
assert.equal(normalizeHtml("&unknownentity;"), "&unknownentity;");

// 2. message comparison
assert.deepEqual(compareMessages([msg("<p>hi</p>", 0)], [msg("<div>hi</div>", 30)]), [], "markup + 30 s skew tolerated");
assert.equal(compareMessages([msg("hi", 0)], [msg("hi!", 0)])[0].kind, "body");
assert.equal(compareMessages([msg("hi", 0)], [msg("hi", 300)])[0].kind, "time");
assert.equal(compareMessages([msg("hi", 0)], [msg("hi", 120)]).length, 0, "exactly the 2 min tolerance is fine");
assert.deepEqual(compareMessages([msg("a", 0), msg("b", 10)], [msg("a", 0)]).map((d) => d.kind), ["count"], "count mismatch reported once");
// staff + internal messages are excluded from the comparison
const staff = msg("staff reply", 50, { author_type: "staff" });
const note = msg("internal", 60, { visibility: "internal" });
assert.deepEqual(compareMessages([msg("hi", 0), staff, note], [msg("hi", 0)]), [], "staff/internal activity is not a parity signal");
// order independence of input arrays
assert.deepEqual(compareMessages([msg("b", 10), msg("a", 0)], [msg("a", 0), msg("b", 10)]), []);

// 3. status
assert.deepEqual(compareStatus(copy("x", 1, []), copy("y", 1, [])), []);
assert.equal(compareStatus(copy("x", 1, [], { status: "closed", resolved_at: iso(0) }), copy("y", 1, [], { status: "open" })).length, 2);
assert.deepEqual(compareStatus(copy("x", 1, [], { status: "closed", resolved_at: iso(0) }), copy("y", 1, [], { status: "closed", resolved_at: iso(300) })), []);
assert.equal(compareStatus(copy("x", 1, [], { status: "closed", resolved_at: iso(0) }), copy("y", 1, [], { status: "closed", resolved_at: iso(3600) })).length, 1);

// 4. pairing
const desks = [desk(1, []), desk(2, []), desk(3, [])];
const directs = [direct(1, []), direct(3, []), { ...direct(9, []), desk_ticket_id: null }];
const paired = pairCopies(desks, directs);
assert.deepEqual(paired.pairs.map((p) => p.desk.ticket_number), [1, 3]);
assert.deepEqual(paired.misses.map((m) => m.ticket_number), [2]);
assert.deepEqual(paired.directOnly.map((d) => d.ticket_number), [9]);

// 5. the six checks
const a = checkA(3, paired.misses);
assert.equal(a.ok, false);
assert.equal(a.failing, 1);
assert.match(a.items[0].detail, /D2/);
assert.equal(checkA(3, []).ok, true);
const goodPair = { desk: desk(1, [msg("x", 0)]), direct: direct(1, [msg("x", 0)]) };
const badPair = { desk: desk(2, [msg("x", 0)], { attachmentCount: 2, status: "closed", resolved_at: iso(0) }), direct: direct(2, [msg("y", 0)], { attachmentCount: 1 }) };
assert.equal(checkB([goodPair]).ok, true);
assert.equal(checkB([goodPair, badPair]).failing, 1);
assert.equal(checkC([goodPair, badPair]).items[0].detail, "attachments: Desk 2 vs direct 1");
assert.equal(checkD([goodPair, badPair]).failing, 2);
assert.equal(checkE(5, []).ok, true);
assert.equal(checkE(5, [{ ticketId: "t", sequence: 3, eventType: "ticket.reply", lastError: "503" }]).failing, 1);
assert.equal(checkF({ fiveXx: [], authFailures: 0, totalRequests: 0 }).ok, true, "no traffic is not a failure of (f)");
assert.equal(checkF({ fiveXx: [], authFailures: 2, totalRequests: 100 }).ok, true, "2% is within the limit");
assert.equal(checkF({ fiveXx: [], authFailures: 3, totalRequests: 100 }).ok, false, "3% exceeds it");
assert.equal(checkF({ fiveXx: [{ route: "POST /tickets", statusCode: 500, at: "T" }], authFailures: 0, totalRequests: 1000 }).ok, false, "any 5xx blocks");

// 6. thresholds
const DAY = 86_400_000;
const th = (days: number, n: number) => evaluateThresholds(T0, T0 + days * DAY, n);
assert.equal(th(MIN_WINDOW_DAYS, MIN_TICKETS).windowOk && th(MIN_WINDOW_DAYS, MIN_TICKETS).ticketsOk, true);
assert.equal(th(13.9, 100).windowOk, false);
assert.equal(th(30, MIN_TICKETS - 1).ticketsOk, false);

// 7. acknowledgements apply to (d) only, need a reason, and only for the named ticket
const d = checkD([goodPair, badPair]);
assert.deepEqual([...ackableTicketIds(d)], ["dir-2"]);
assert.equal(applyAcknowledgements(d, [{ ticketId: "dir-2", reason: "staff closed the Desk copy only" }]).check.ok, true);
assert.equal(applyAcknowledgements(d, [{ ticketId: "dir-2", reason: "  " }]).check.ok, false, "blank reason does not count");
assert.equal(applyAcknowledgements(d, [{ ticketId: "dir-2", reason: "ok" }]).check.ok, false, "too short");
assert.equal(applyAcknowledgements(d, [{ ticketId: "dir-OTHER", reason: "valid reason" }]).check.ok, false, "wrong ticket");
const c = checkC([goodPair, badPair]);
assert.equal(applyAcknowledgements(c, [{ ticketId: "dir-2", reason: "valid reason" }]).check.ok, false, "(c) can never be acknowledged");

// 8. overall verdict: PASS only when thresholds are met AND every check is clean (after (d) acks)
const clean = [checkA(60, []), checkB([goodPair]), checkC([goodPair]), checkD([goodPair]), checkE(60, []), checkF({ fiveXx: [], authFailures: 0, totalRequests: 500 })];
assert.deepEqual(evaluateOverall(clean, th(20, 60)), { pass: true, blockers: [] });
assert.equal(evaluateOverall(clean, th(10, 60)).pass, false, "short window blocks even with clean checks");
assert.equal(evaluateOverall(clean, th(20, 10)).pass, false, "too few tickets blocks");
const dirty = [...clean.slice(0, 3), d, ...clean.slice(4)];
assert.equal(evaluateOverall(dirty, th(20, 60)).pass, false);
assert.equal(evaluateOverall(dirty, th(20, 60), [{ ticketId: "dir-2", reason: "staff worked the Desk copy" }]).pass, true);
const missed = [checkA(60, paired.misses), ...clean.slice(1)];
assert.equal(evaluateOverall(missed, th(20, 60), [{ ticketId: paired.misses[0].id, reason: "valid reason" }]).pass, false, "(a) misses cannot be acknowledged");
assert.equal(evaluateOverall(missed, th(20, 60)).blockers.length, 1);

// 9. window clamp
const c1 = clampWindow(T0, T0 + 30 * DAY);
assert.equal(c1.clamped, false);
const c2 = clampWindow(T0, T0 + 200 * DAY);
assert.equal(c2.clamped, true);
assert.equal(c2.toMs - c2.fromMs, 90 * DAY);

// 10. alerts
assert.deepEqual(authSpikes(Array.from({ length: 11 }, () => ({ key_id: "current" }))), [{ keyId: "current", count: 11 }]);
assert.deepEqual(authSpikes(Array.from({ length: 10 }, () => ({ key_id: "current" }))), [], "exactly the threshold is not a spike");
assert.equal(authSpikes([...Array.from({ length: 6 }, () => ({ key_id: "a" })), ...Array.from({ length: 6 }, () => ({ key_id: "b" }))]).length, 0, "counted per key id");
assert.equal(authSpikes(Array.from({ length: 11 }, () => ({ key_id: null })))[0].keyId, "(none)");
const NOW = Date.parse("2026-10-09T12:00:00Z");
assert.equal(shouldAlert(null, NOW), true);
assert.equal(shouldAlert("2026-10-09T11:30:00Z", NOW), false, "inside the 60 min cooldown");
assert.equal(shouldAlert("2026-10-09T10:59:00Z", NOW), true);
assert.equal(shouldAlert("garbage", NOW), true);

assert.equal(normSite("  McGregor-WEALTH "), "mcgregor-wealth");

// 11. review fix #1: normalizeHtml must be LINEAR on hostile, customer-controlled bodies (a lazy regex took
// ~2 s per 112 KB of unclosed "<style"). Each ~200 KB input must finish well inside the budget.
const hostile: [string, string][] = [
  ["unclosed <style", "<style ".repeat(28_000)],
  ["unclosed <script", "<SCRIPT ".repeat(25_000)],
  ["unclosed tag openers", "<a ".repeat(66_000)],
  ["bare '<'", "<".repeat(200_000)],
  ["carriage returns", "\r".repeat(200_000)],
  ["spaces + newlines", " \n".repeat(100_000)],
  ["entity starts", "&".repeat(200_000)],
  ["<br without close", "<br ".repeat(50_000)],
];
for (const [name, body] of hostile) {
  const t0 = performance.now();
  normalizeHtml(body);
  const ms = performance.now() - t0;
  assert.ok(ms < 400, `${name}: ${ms.toFixed(0)} ms (limit 400)`);
}
// ...and the rewrite keeps the old semantics
assert.equal(normalizeHtml("a<STYLE>p{}</STYLE>b<ScRiPt>x()</script>c"), "abc", "case-insensitive blocks");
// equivalence with the legacy tag-stripping regex on tricky inputs (a lone "<" runs to the FIRST ">")
const legacyStrip = (h: string) => h.replace(/<[^>]*>/g, "");
for (const sample of ["x < y and <b>bold</b>", "keep <style>never closed", "<<a>>", "a<b", "a>b<c", "<>", "plain", "<a href='x>y'>t</a>"]) {
  assert.equal(normalizeHtml(sample), legacyStrip(sample).replace(/[^\S\n]+/g, " ").trim(), `legacy-equivalent: ${sample}`);
}
assert.equal(normalizeHtml("a\r\nb\r\n\r\nc"), "a\nb\nc");
assert.equal(normalizeHtml("one   two  three"), "one two three");

console.log("449 parity checks: all passed");
