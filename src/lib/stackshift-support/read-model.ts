import type { DownloadAttachment } from "./attachments-logic";

// Task 448 — pure read model for the StackShift Support Center (contract §5): keyset cursor, status filter,
// and the serialisers that decide EXACTLY what leaves the Hub. Everything is an allowlist built field by
// field — raw rows are never spread into a response — so internal notes, staff emails/ids, `source_meta`
// and customer-view password data cannot leak by adding a column. No env/DB imports, so the checks in
// _docs/task/448-read-model.check.ts run under plain tsx.

// --- keyset cursor ---------------------------------------------------------------------------------
// Position only: the site/userRef/status scope is re-applied from the signed query on every request, so a
// forged cursor can reposition within the caller's own tickets and nothing more.
export type Cursor = { createdAt: string; id: string };

const TS_RE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}(:?\d{2})?)$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// createdAt is carried as the exact string the database returned: a JS Date would truncate microseconds
// and the keyset comparison would skip or repeat rows.
export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify({ c: c.createdAt, i: c.id }), "utf8").toString("base64url");
}

export function decodeCursor(raw: string): Cursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as { c?: unknown; i?: unknown };
    if (typeof parsed.c !== "string" || typeof parsed.i !== "string") return null;
    if (!TS_RE.test(parsed.c) || !UUID_RE.test(parsed.i)) return null;
    return { createdAt: parsed.c, id: parsed.i };
  } catch {
    return null;
  }
}

// PostgREST `.or()` filter for "strictly after this cursor" in (created_at DESC, id DESC) order. Values are
// double-quoted because timestamps contain `:` and `+`, which are filter-syntax characters.
export function cursorOrFilter(c: Cursor): string {
  return `created_at.lt."${c.createdAt}",and(created_at.eq."${c.createdAt}",id.lt."${c.id}")`;
}

// The list is fetched with limit + 1 rows; the extra row only proves there is another page.
export function pageRows<T extends { created_at: string; id: string }>(rows: T[], limit: number) {
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return { page, nextCursor: rows.length > limit && last ? encodeCursor({ createdAt: last.created_at, id: last.id }) : null };
}

// --- status filter ---------------------------------------------------------------------------------
export const TICKET_STATUSES = ["open", "on_hold", "escalated", "closed"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

// Contract §5 lists open|closed|all; the raw Hub statuses are an additive extension (decided with the user).
export function parseStatusFilter(raw: string | null): { ok: true; value: TicketStatus | null } | { ok: false } {
  if (raw === null || raw === "all") return { ok: true, value: null };
  return (TICKET_STATUSES as readonly string[]).includes(raw) ? { ok: true, value: raw as TicketStatus } : { ok: false };
}

export function parseLimit(raw: string | null, def = 25, max = 50): number | null {
  if (raw === null) return def;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 && n <= max ? n : null;
}

// --- serialisers -----------------------------------------------------------------------------------
export type TicketRow = {
  id: string;
  ticket_number: number;
  external_ref: string | null;
  subject: string;
  status: string;
  priority: string;
  sla_due_at: string | null;
  created_at: string;
  updated_at: string;
};
export type TicketStats = { message_count: number; last_message_at: string | null };

// Same vocabulary as the inbound contract: the Hub's `critical` is StackShift's `urgent`.
export const priorityOut = (p: string): string => (p === "critical" ? "urgent" : p);

export function serializeTicket(row: TicketRow, stats?: TicketStats) {
  return {
    ticketRef: row.external_ref,
    hubTicketId: row.id,
    ticketNumber: row.ticket_number,
    subject: row.subject,
    status: row.status,
    priority: priorityOut(row.priority),
    dueAt: row.sla_due_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastMessageAt: stats?.last_message_at ?? null,
    messageCount: stats?.message_count ?? 0,
  };
}

export type MessageRow = {
  id: string;
  author_type: string;
  author_id: string | null;
  visibility: string;
  body: string;
  external_ref: string | null;
  created_at: string;
  source_meta: unknown;
};

const STAFF_FALLBACK_NAME = "WebriQ Support";

// Timestamps come from Postgres (`+00:00`) and from JS (`Z`); compare as instants, never as strings.
const byTime = (a: string, b: string) => Date.parse(a) - Date.parse(b);

function clientAuthorName(meta: unknown): string | null {
  const author = (meta as { author?: { name?: unknown } } | null)?.author;
  return typeof author?.name === "string" && author.name ? author.name : null;
}

// Only public customer/staff messages. `internal` notes, `system` and `llm_draft` rows never leave.
export function serializeMessages(
  rows: MessageRow[],
  staffNames: Map<string, string>,
  attachmentsByMessage: Map<string, DownloadAttachment[]>,
) {
  return rows
    .filter((m) => m.visibility === "public" && (m.author_type === "client" || m.author_type === "staff"))
    .sort((a, b) => byTime(a.created_at, b.created_at))
    .map((m) => ({
      messageId: m.id,
      ref: m.external_ref,
      authorType: m.author_type as "client" | "staff",
      authorName:
        m.author_type === "staff" ? (m.author_id ? staffNames.get(m.author_id) : undefined) ?? STAFF_FALLBACK_NAME : clientAuthorName(m.source_meta),
      bodyHtml: m.body,
      createdAt: m.created_at,
      attachments: (attachmentsByMessage.get(m.id) ?? []).map((a) => ({
        filename: a.filename,
        size: a.size,
        contentType: a.contentType,
        downloadUrl: a.downloadUrl,
        expiresInSeconds: a.expiresInSeconds,
      })),
    }));
}

// --- activity --------------------------------------------------------------------------------------
export type StatusLogEntry = { at: string; status: "open" | "closed" };
export const STATUS_LOG_KEY = "customerStatusLog";
const STATUS_LOG_CAP = 50;

// Customer-initiated closes/reopens arrive through the inbound API and are not outbox events, so
// setCustomerStatus keeps a small capped log in inbox.source_meta for the activity list.
export function appendStatusLog(meta: Record<string, unknown> | null, entry: StatusLogEntry): Record<string, unknown> {
  const existing = Array.isArray(meta?.[STATUS_LOG_KEY]) ? (meta![STATUS_LOG_KEY] as StatusLogEntry[]) : [];
  return { ...(meta ?? {}), [STATUS_LOG_KEY]: [...existing, entry].slice(-STATUS_LOG_CAP) };
}

export function readStatusLog(meta: unknown): StatusLogEntry[] {
  const raw = (meta as Record<string, unknown> | null)?.[STATUS_LOG_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e) => {
    const x = e as { at?: unknown; status?: unknown };
    return typeof x?.at === "string" && (x.status === "open" || x.status === "closed") ? [{ at: x.at, status: x.status }] : [];
  });
}

export type StatusEvent = { at: string; from: string; to: string };
export type ActivityItem = { at: string; type: "created" | "customer_comment" | "staff_reply" | "status_changed"; summary: string };

const label = (s: string) => s.replace(/_/g, " ");

export function buildActivity(input: {
  createdAt: string;
  messages: ReturnType<typeof serializeMessages>;
  staffStatusEvents: StatusEvent[];
  customerStatusLog: StatusLogEntry[];
}): ActivityItem[] {
  const items: ActivityItem[] = [{ at: input.createdAt, type: "created", summary: "Ticket created" }];

  for (const m of input.messages) {
    // The ticket's opening message is the "created" entry, not a separate comment.
    if (m.authorType === "client" && m.ref?.endsWith("#body")) continue;
    items.push(
      m.authorType === "staff"
        ? { at: m.createdAt, type: "staff_reply", summary: "Support replied" }
        : { at: m.createdAt, type: "customer_comment", summary: "You added a comment" },
    );
  }
  for (const e of input.staffStatusEvents) {
    items.push({ at: e.at, type: "status_changed", summary: `Status changed from ${label(e.from)} to ${label(e.to)}` });
  }
  for (const e of input.customerStatusLog) {
    items.push({ at: e.at, type: "status_changed", summary: e.status === "closed" ? "You closed the ticket" : "You reopened the ticket" });
  }
  return items.sort((a, b) => byTime(a.at, b.at));
}
