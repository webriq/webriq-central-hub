// Task 446 — pure outbox logic (contract §6): retry schedule, per-ticket ordering gate, and the
// allowlist builders that guarantee nothing internal ever leaves the Hub. No env/DB imports so the
// checks in _docs/task/446-outbox.check.ts run under plain tsx.

export const EVENT_TYPES = ["ticket.reply", "ticket.status_changed", "ticket.assigned", "ticket.due_changed"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// Initial send + 5 retries (decided with the user, task 446): a failure N schedules BACKOFF_MS[N-1];
// the 6th failure marks the event dead.
export const BACKOFF_MS = [1 * MINUTE, 5 * MINUTE, 30 * MINUTE, 2 * HOUR, 12 * HOUR] as const;
export const MAX_FAILURES = BACKOFF_MS.length + 1;
// A claimed event is leased this long so an overlapping cron run does not double-send.
export const LEASE_MS = 2 * MINUTE;
export const SEND_TIMEOUT_MS = 10_000;

export type FailureOutcome =
  | { status: "pending"; nextAttemptAt: string }
  | { status: "dead" };

// `attempts` is the failure count INCLUDING the one that just happened.
export function outcomeAfterFailure(attempts: number, nowMs: number): FailureOutcome {
  if (attempts >= MAX_FAILURES) return { status: "dead" };
  return { status: "pending", nextAttemptAt: new Date(nowMs + BACKOFF_MS[Math.max(0, attempts - 1)]).toISOString() };
}

export type OutboxRow = {
  id: string;
  ticket_id: string;
  sequence: number;
  status: "pending" | "sent" | "dead";
  next_attempt_at: string;
};

// Per-ticket ordering gate: only the lowest-sequence PENDING event of a ticket may go out, and only once
// it is due. `sent` and `dead` events never block (a dead event is released for an admin to replay).
// A leased (claimed) head has a future next_attempt_at, so it correctly holds the rest of its ticket.
export function selectDeliverable<T extends OutboxRow>(rows: T[], nowMs: number): T[] {
  const heads = new Map<string, T>();
  for (const r of rows) {
    if (r.status !== "pending") continue;
    const head = heads.get(r.ticket_id);
    if (!head || r.sequence < head.sequence) heads.set(r.ticket_id, r);
  }
  return [...heads.values()]
    .filter((r) => Date.parse(r.next_attempt_at) <= nowMs)
    .sort((a, b) => a.sequence - b.sequence);
}

// --- payload allowlists ---------------------------------------------------------------------------

type Data = Record<string, unknown>;
const ALLOWED_DATA_KEYS: Record<EventType, readonly string[]> = {
  "ticket.reply": ["messageId", "bodyHtml", "authorName", "createdAt", "attachments"],
  "ticket.status_changed": ["from", "to", "resolvedAt"],
  "ticket.assigned": ["assigneeName"],
  "ticket.due_changed": ["dueAt"],
};

// Whatever was stored (SQL trigger, route, future writer) is re-filtered to the contract's fields at
// send time, so an extra column added to a payload can never leak.
export function redactData(type: EventType, raw: unknown): Data {
  const src = raw && typeof raw === "object" ? (raw as Data) : {};
  const out: Data = {};
  for (const k of ALLOWED_DATA_KEYS[type]) if (k in src) out[k] = src[k];
  if (type === "ticket.reply") out.attachments = []; // attachments in events arrive with task 447
  return out;
}

export function isEventType(t: string): t is EventType {
  return (EVENT_TYPES as readonly string[]).includes(t);
}

export type EnvelopeInput = {
  eventId: string;
  type: EventType;
  sequence: number;
  occurredAt: string;
  ticket: { ticketRef: string; hubTicketId: string; ticketNumber: number; status: string; site: string };
  data: unknown;
  // Task 447 — freshly minted (never stored) download URLs, injected for ticket.reply only.
  attachments?: OutboundAttachment[];
};

export type OutboundAttachment = {
  filename: string;
  size: number | null;
  contentType: string;
  downloadUrl: string;
  expiresInSeconds: number;
};

const pickAttachment = (a: OutboundAttachment): OutboundAttachment => ({
  filename: a.filename,
  size: a.size,
  contentType: a.contentType,
  downloadUrl: a.downloadUrl,
  expiresInSeconds: a.expiresInSeconds,
});

export function buildEnvelope(i: EnvelopeInput) {
  const data = redactData(i.type, i.data);
  if (i.type === "ticket.reply" && i.attachments?.length) data.attachments = i.attachments.map(pickAttachment);
  return {
    eventId: `evt_${i.eventId}`,
    type: i.type,
    sequence: i.sequence,
    occurredAt: i.occurredAt,
    ticket: {
      ticketRef: i.ticket.ticketRef,
      hubTicketId: i.ticket.hubTicketId,
      ticketNumber: i.ticket.ticketNumber,
      status: i.ticket.status,
      site: i.ticket.site,
    },
    data,
  };
}

// Builders for the data a writer stores. Assigned/due have no emitter yet (no assignee column or due-date
// editing UI exists) — the builders are here so the wiring is a one-liner when those land.
export const replyData = (d: { messageId: string; bodyHtml: string; authorName: string | null; createdAt: string }) =>
  redactData("ticket.reply", d);
export const statusData = (d: { from: string; to: string; resolvedAt?: string | null }) =>
  redactData("ticket.status_changed", { from: d.from, to: d.to, ...(d.resolvedAt ? { resolvedAt: d.resolvedAt } : {}) });
export const assignedData = (d: { assigneeName: string }) => redactData("ticket.assigned", d);
export const dueData = (d: { dueAt: string }) => redactData("ticket.due_changed", d);

// GET /events paging: events strictly after `afterSequence`, ascending, capped; nextSequence is the last
// returned sequence when more remain.
export function pageEvents<T extends { sequence: number }>(events: T[], afterSequence: number, limit: number) {
  const sorted = events.filter((e) => e.sequence > afterSequence).sort((a, b) => a.sequence - b.sequence);
  const page = sorted.slice(0, limit);
  return { page, nextSequence: sorted.length > limit ? page[page.length - 1].sequence : null };
}
