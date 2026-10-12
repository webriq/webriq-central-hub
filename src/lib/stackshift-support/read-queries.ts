import { adminClient } from "@/lib/supabase/admin";
import { fail, type InboundResult } from "./inbound";
import { mintDownloadUrls } from "./attachments";
import {
  buildActivity,
  cursorOrFilter,
  decodeCursor,
  pageRows,
  parseLimit,
  parseStatusFilter,
  readStatusLog,
  serializeMessages,
  serializeTicket,
  type MessageRow,
  type StatusEvent,
  type TicketRow,
  type TicketStats,
} from "./read-model";

// Task 448 — DB side of the Support Center reads (contract §5). Identity is the signed `site` (and optional
// `userRef`) from the query string; every query is scoped to channel='stackshift' AND stackshift_site = site.
// adminClient: a signed server, not a Supabase user — the same documented exception as the other routes.
// Desk-polled rows (channel='api') are deliberately out of scope until cutover.

const TICKET_COLUMNS = "id, ticket_number, external_ref, subject, status, priority, sla_due_at, created_at, updated_at";
const PAGE = 1000;

export async function listTickets(site: string, params: URLSearchParams): Promise<InboundResult> {
  const status = parseStatusFilter(params.get("status"));
  if (!status.ok) return fail(400, "invalid_payload", "`status` must be open, on_hold, escalated, closed or all");
  const limit = parseLimit(params.get("limit"));
  if (limit === null) return fail(400, "invalid_payload", "`limit` must be an integer from 1 to 50");

  const cursorRaw = params.get("cursor");
  const cursor = cursorRaw ? decodeCursor(cursorRaw) : null;
  if (cursorRaw && !cursor) return fail(400, "invalid_payload", "`cursor` is not valid");

  const userRef = params.get("userRef")?.trim() || null;
  if (userRef && userRef.length > 200) return fail(400, "invalid_payload", "`userRef` is too long");

  let q = adminClient
    .from("inbox")
    .select(TICKET_COLUMNS)
    .eq("channel", "stackshift")
    .eq("stackshift_site", site)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (status.value) q = q.eq("status", status.value);
  if (userRef) q = q.eq("stackshift_actor_ref", userRef);
  if (cursor) q = q.or(cursorOrFilter(cursor));

  const { data, error } = await q;
  if (error) throw new Error(`ticket list failed: ${error.message}`);

  const { page, nextCursor } = pageRows((data ?? []) as TicketRow[], limit);

  // One call for the whole page. If migration 172 is not applied yet the list still works, with zeroed stats.
  const stats = new Map<string, TicketStats>();
  if (page.length > 0) {
    const { data: statRows, error: statError } = await adminClient.rpc("stackshift_ticket_message_stats", {
      p_ticket_ids: page.map((t) => t.id),
    });
    if (statError) console.warn("[stackshift-support] message stats unavailable:", statError.message);
    for (const s of statRows ?? []) stats.set(s.ticket_id, { message_count: Number(s.message_count), last_message_at: s.last_message_at });
  }

  return {
    status: 200,
    outcome: "tickets_listed",
    body: { tickets: page.map((t) => serializeTicket(t, stats.get(t.id))), nextCursor },
  };
}

export async function getTicket(site: string, ticketRef: string): Promise<InboundResult> {
  // 404 for BOTH "no such ticket" and "another site's ticket": a read must not reveal that a ref exists.
  const { data: ticket } = await adminClient
    .from("inbox")
    .select(`${TICKET_COLUMNS}, source_meta`)
    .eq("channel", "stackshift")
    .eq("stackshift_site", site)
    .eq("external_ref", ticketRef)
    .maybeSingle();
  if (!ticket) return fail(404, "ticket_not_found", "Unknown ticketRef", undefined, ticketRef);

  const messages: MessageRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await adminClient
      .from("inbox_messages")
      .select("id, author_type, author_id, visibility, body, external_ref, created_at, source_meta")
      .eq("inbox_id", ticket.id)
      .eq("visibility", "public")
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`message load failed: ${error.message}`);
    messages.push(...(data as MessageRow[]));
    if ((data?.length ?? 0) < PAGE) break;
  }

  const visible = messages.filter((m) => m.author_type === "client" || m.author_type === "staff");

  const staffIds = [...new Set(visible.filter((m) => m.author_type === "staff" && m.author_id).map((m) => m.author_id as string))];
  const staffNames = new Map<string, string>();
  if (staffIds.length > 0) {
    const { data: profiles } = await adminClient.from("profiles").select("id, full_name").in("id", staffIds);
    for (const p of profiles ?? []) if (p.full_name) staffNames.set(p.id, p.full_name);
  }

  const attachments = await mintDownloadUrls(visible.map((m) => m.id));
  const serialized = serializeMessages(messages, staffNames, attachments);

  // Staff-initiated status changes come from the outbox (best-effort: a missing table just means none).
  const staffStatusEvents: StatusEvent[] = [];
  const { data: events, error: eventError } = await adminClient
    .from("stackshift_outbox")
    .select("payload, created_at")
    .eq("ticket_id", ticket.id)
    .eq("event_type", "ticket.status_changed")
    .order("sequence", { ascending: true });
  if (eventError) console.warn("[stackshift-support] status events unavailable:", eventError.message);
  for (const e of events ?? []) {
    const d = (e.payload as { data?: { from?: unknown; to?: unknown } } | null)?.data;
    if (typeof d?.from === "string" && typeof d?.to === "string") staffStatusEvents.push({ at: e.created_at, from: d.from, to: d.to });
  }

  const stats: TicketStats = {
    message_count: serialized.length,
    last_message_at: serialized.length ? serialized[serialized.length - 1].createdAt : null,
  };

  return {
    status: 200,
    outcome: "ticket_read",
    ticketRef,
    body: {
      ...serializeTicket(ticket as TicketRow, stats),
      messages: serialized,
      activity: buildActivity({
        createdAt: ticket.created_at,
        messages: serialized,
        staffStatusEvents,
        customerStatusLog: readStatusLog(ticket.source_meta),
      }),
    },
  };
}
