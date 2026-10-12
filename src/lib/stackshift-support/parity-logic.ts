// Task 449 — pure logic for the StackShift direct-support PARITY GATE (design §9): HTML normalisation, pairing
// of the direct copy with its Desk-polled copy, the six checks, thresholds, acknowledgements and the overall
// verdict, plus the alert helpers. No env/DB imports so _docs/task/449-parity.check.ts runs under plain tsx.
// The report is read-only evidence; it never changes a ticket and never approves anything by itself.

export const MIN_WINDOW_DAYS = 14;
export const MIN_TICKETS = 50;
export const MAX_WINDOW_DAYS = 90;
export const MAX_TICKETS = 2000;
export const TIME_TOLERANCE_MS = 2 * 60_000; // a message's timestamp may differ by this much between copies
export const RESOLVED_TOLERANCE_MS = 10 * 60_000;
export const AUTH_FAILURE_RATE_LIMIT = 0.02; // check (f): auth failures may be at most 2% of window requests
export const AUTH_SPIKE_THRESHOLD = 10; // alerts: failed auths from one key id within 10 minutes
export const AUTH_FAILURE_OUTCOMES = ["bad_signature", "stale_timestamp", "unknown_key"] as const;

export const normSite = (s: string): string => s.trim().toLowerCase();

// --- HTML normalisation ----------------------------------------------------------------------------
const NAMED_ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'" };

// Removes `<tag ...> ... </tag>` blocks with a LINEAR scan. A lazy regex here is quadratic on crafted input
// (thousands of unclosed "<style" took ~2 s per 112 KB body — task 449 review). Case-insensitive on ASCII only,
// so `lower` keeps the exact length of `html` and the indices line up. An unclosed block is left in place.
function removeBlocks(html: string, tag: "style" | "script"): string {
  const lower = html.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
  const open = `<${tag}`;
  const close = `</${tag}>`;
  let out = "";
  let pos = 0;
  for (;;) {
    const i = lower.indexOf(open, pos);
    if (i === -1) break;
    const j = lower.indexOf(close, i + open.length);
    if (j === -1) break; // nothing closes after here, so no later block can close either
    out += html.slice(pos, i);
    pos = j + close.length;
  }
  return out + html.slice(pos);
}

// Same result as replace(/<[^>]*>/g, "") (a tag runs to the FIRST ">"), without the regex's quadratic
// rescans over many unclosed "<". An unclosed "<" keeps the rest of the text.
function stripTags(html: string): string {
  let out = "";
  let pos = 0;
  for (;;) {
    const i = html.indexOf("<", pos);
    if (i === -1) break;
    const j = html.indexOf(">", i + 1);
    if (j === -1) break;
    out += html.slice(pos, i);
    pos = j + 1;
  }
  return out + html.slice(pos);
}

// Desk and Hub render the same message with different markup (<div> vs <p>, &nbsp;, trailing <br>, wrapper
// styles). Compare the TEXT: drop style/script, turn block boundaries into newlines, strip tags, decode
// entities, remove zero-width characters and collapse whitespace. Every step is linear-time: the bodies are
// customer-controlled and this runs over up to 2,000 tickets in the admin parity report.
export function normalizeHtml(html: string): string {
  return stripTags(
    removeBlocks(removeBlocks(html, "style"), "script")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|blockquote)>/gi, "\n"),
  )
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
      if (e[0] === "#") {
        const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : m;
      }
      return NAMED_ENTITIES[e.toLowerCase()] ?? m;
    })
    .replace(/[​-‍﻿]/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[^\S\n]+/g, " ") // any whitespace run except newlines (incl. NBSP) -> one space
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

// --- copies ----------------------------------------------------------------------------------------
export type Msg = { author_type: string; visibility: string; body: string; created_at: string };
export type Copy = {
  id: string;
  ticket_number: number;
  status: string;
  resolved_at: string | null;
  created_at: string;
  messages: Msg[];
  attachmentCount: number;
};
export type DeskCopy = Copy & { external_id: string };
export type DirectCopy = Copy & { desk_ticket_id: string | null };

const t = (iso: string) => Date.parse(iso);

// Only what the CUSTOMER sent is compared (what StackShift's dual-write must reproduce). Staff replies and
// status changes legitimately live on whichever copy staff worked, so they are not a parity signal.
export function customerMessages(msgs: Msg[]): Msg[] {
  return msgs.filter((m) => m.visibility === "public" && m.author_type === "client").sort((a, b) => t(a.created_at) - t(b.created_at));
}

export type MessageDiff = { kind: "count" | "body" | "time"; detail: string };

// No key links a Desk message to its direct twin, so pair by creation order. Counts must agree first; a
// count mismatch is reported once instead of cascading into misaligned body diffs.
export function compareMessages(desk: Msg[], direct: Msg[], toleranceMs = TIME_TOLERANCE_MS): MessageDiff[] {
  const d = customerMessages(desk);
  const h = customerMessages(direct);
  if (d.length !== h.length) return [{ kind: "count", detail: `customer messages: Desk ${d.length} vs direct ${h.length}` }];
  const diffs: MessageDiff[] = [];
  d.forEach((dm, i) => {
    const hm = h[i];
    if (normalizeHtml(dm.body) !== normalizeHtml(hm.body)) diffs.push({ kind: "body", detail: `message ${i + 1}: body differs` });
    if (Math.abs(t(dm.created_at) - t(hm.created_at)) > toleranceMs) {
      diffs.push({ kind: "time", detail: `message ${i + 1}: timestamps differ by ${Math.round(Math.abs(t(dm.created_at) - t(hm.created_at)) / 1000)} s` });
    }
  });
  return diffs;
}

export function compareStatus(desk: Copy, direct: Copy): string[] {
  const out: string[] = [];
  if (desk.status !== direct.status) out.push(`status: Desk ${desk.status} vs direct ${direct.status}`);
  if (!!desk.resolved_at !== !!direct.resolved_at) out.push(`resolved_at: Desk ${desk.resolved_at ? "set" : "empty"} vs direct ${direct.resolved_at ? "set" : "empty"}`);
  else if (desk.resolved_at && direct.resolved_at && Math.abs(t(desk.resolved_at) - t(direct.resolved_at)) > RESOLVED_TOLERANCE_MS) {
    out.push("resolved_at: timestamps differ by more than 10 minutes");
  }
  return out;
}

// --- checks ----------------------------------------------------------------------------------------
export type Item = { ticketId?: string; ticketNumber?: number; detail: string };
export type CheckId = "a" | "b" | "c" | "d" | "e" | "f";
export type Check = { id: CheckId; title: string; ok: boolean; total: number; failing: number; items: Item[] };

export type Pair = { desk: DeskCopy; direct: DirectCopy };

export function pairCopies(desks: DeskCopy[], directs: DirectCopy[]): { pairs: Pair[]; misses: DeskCopy[]; directOnly: DirectCopy[] } {
  const byDeskId = new Map<string, DirectCopy>();
  for (const d of directs) if (d.desk_ticket_id) byDeskId.set(d.desk_ticket_id, d);
  const pairs: Pair[] = [];
  const misses: DeskCopy[] = [];
  const matched = new Set<string>();
  for (const desk of desks) {
    const direct = byDeskId.get(desk.external_id);
    if (direct) {
      pairs.push({ desk, direct });
      matched.add(direct.id);
    } else misses.push(desk);
  }
  return { pairs, misses, directOnly: directs.filter((d) => !matched.has(d.id)) };
}

const mk = (id: CheckId, title: string, total: number, items: Item[]): Check => ({ id, title, ok: items.length === 0, total, failing: items.length, items });

export function checkA(total: number, misses: DeskCopy[]): Check {
  return mk("a", "Every Desk ticket has a direct copy", total, misses.map((m) => ({ ticketId: m.id, ticketNumber: m.ticket_number, detail: `Desk ticket ${m.external_id} has no direct row (desk_ticket_id)` })));
}

export function checkB(pairs: Pair[]): Check {
  const items: Item[] = [];
  for (const { desk, direct } of pairs) {
    for (const d of compareMessages(desk.messages, direct.messages)) items.push({ ticketId: direct.id, ticketNumber: direct.ticket_number, detail: d.detail });
  }
  return mk("b", "Customer messages match (count, body, time)", pairs.length, items);
}

export function checkC(pairs: Pair[]): Check {
  const items: Item[] = [];
  for (const { desk, direct } of pairs) {
    if (desk.attachmentCount !== direct.attachmentCount) {
      items.push({ ticketId: direct.id, ticketNumber: direct.ticket_number, detail: `attachments: Desk ${desk.attachmentCount} vs direct ${direct.attachmentCount}` });
    }
  }
  return mk("c", "Attachment totals match", pairs.length, items);
}

export function checkD(pairs: Pair[]): Check {
  const items: Item[] = [];
  for (const { desk, direct } of pairs) {
    for (const d of compareStatus(desk, direct)) items.push({ ticketId: direct.id, ticketNumber: direct.ticket_number, detail: d });
  }
  return mk("d", "Status and resolved time match", pairs.length, items);
}

export function checkE(pairsOrDirectCount: number, dead: { ticketId: string; ticketNumber?: number; sequence: number; eventType: string; lastError: string | null }[]): Check {
  return mk("e", "No dead outbox events", pairsOrDirectCount, dead.map((d) => ({ ticketId: d.ticketId, ticketNumber: d.ticketNumber, detail: `dead event seq ${d.sequence} (${d.eventType})${d.lastError ? `: ${d.lastError}` : ""}` })));
}

export type AuditSummary = { fiveXx: { route: string; statusCode: number; at: string }[]; authFailures: number; totalRequests: number };

export function checkF(a: AuditSummary): Check {
  const items: Item[] = a.fiveXx.map((r) => ({ detail: `${r.statusCode} on ${r.route} at ${r.at}` }));
  const rate = a.totalRequests > 0 ? a.authFailures / a.totalRequests : 0;
  if (rate > AUTH_FAILURE_RATE_LIMIT) {
    items.push({ detail: `auth failures ${a.authFailures}/${a.totalRequests} (${(rate * 100).toFixed(1)}%) exceed the ${AUTH_FAILURE_RATE_LIMIT * 100}% limit` });
  }
  return mk("f", "No 5xx or excessive auth failures", a.totalRequests, items);
}

// --- thresholds, acknowledgements, verdict -----------------------------------------------------------
export type Thresholds = { windowDays: number; tickets: number; windowOk: boolean; ticketsOk: boolean };

export function evaluateThresholds(fromMs: number, toMs: number, tickets: number): Thresholds {
  const windowDays = Math.max(0, (toMs - fromMs) / 86_400_000);
  return { windowDays, tickets, windowOk: windowDays >= MIN_WINDOW_DAYS, ticketsOk: tickets >= MIN_TICKETS };
}

export type Ack = { ticketId: string; reason: string };

// Only check (d) can be acknowledged (staff may legitimately have worked one copy). A failing item is
// accepted only when its ticket carries a reason of at least 3 characters. Everything else must be clean.
export function applyAcknowledgements(check: Check, acks: Ack[]): { check: Check; accepted: Item[] } {
  if (check.id !== "d") return { check, accepted: [] };
  const reasoned = new Set(acks.filter((a) => a.reason.trim().length >= 3).map((a) => a.ticketId));
  const accepted = check.items.filter((i) => i.ticketId && reasoned.has(i.ticketId));
  const remaining = check.items.filter((i) => !(i.ticketId && reasoned.has(i.ticketId)));
  return { check: { ...check, items: remaining, failing: remaining.length, ok: remaining.length === 0 }, accepted };
}

export function ackableTicketIds(checkDResult: Check): Set<string> {
  return new Set(checkDResult.items.flatMap((i) => (i.ticketId ? [i.ticketId] : [])));
}

export type Verdict = { pass: boolean; blockers: string[] };

export function evaluateOverall(checks: Check[], thresholds: Thresholds, acks: Ack[] = []): Verdict {
  const blockers: string[] = [];
  if (!thresholds.windowOk) blockers.push(`Window is ${thresholds.windowDays.toFixed(1)} days; at least ${MIN_WINDOW_DAYS} are required`);
  if (!thresholds.ticketsOk) blockers.push(`${thresholds.tickets} tickets in the window; at least ${MIN_TICKETS} are required`);
  for (const c of checks) {
    const { check } = applyAcknowledgements(c, acks);
    if (!check.ok) blockers.push(`(${c.id}) ${c.title}: ${check.failing} failing`);
  }
  return { pass: blockers.length === 0, blockers };
}

// Hard stop: a window longer than MAX_WINDOW_DAYS is clamped to its most recent MAX_WINDOW_DAYS.
export function clampWindow(fromMs: number, toMs: number): { fromMs: number; toMs: number; clamped: boolean } {
  const min = toMs - MAX_WINDOW_DAYS * 86_400_000;
  return fromMs < min ? { fromMs: min, toMs, clamped: true } : { fromMs, toMs, clamped: false };
}

// --- alerts ----------------------------------------------------------------------------------------
// Key ids whose failed-auth count within the window exceeds the threshold. Rows with no key id (missing
// header) are grouped under "(none)".
export function authSpikes(rows: { key_id: string | null }[], threshold = AUTH_SPIKE_THRESHOLD): { keyId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.key_id ?? "(none)", (counts.get(r.key_id ?? "(none)") ?? 0) + 1);
  return [...counts.entries()].filter(([, n]) => n > threshold).map(([keyId, count]) => ({ keyId, count })).sort((a, b) => b.count - a.count);
}

// Re-alert only after the cooldown, so a sustained incident does not page every 10 minutes.
export function shouldAlert(lastAlertIso: string | null, nowMs: number, cooldownMs = 60 * 60_000): boolean {
  if (!lastAlertIso) return true;
  const last = Date.parse(lastAlertIso);
  return !Number.isFinite(last) || nowMs - last >= cooldownMs;
}
