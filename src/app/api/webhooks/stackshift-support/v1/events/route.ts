import { NextRequest } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { handleSignedGet } from "@/lib/stackshift-support/signed-get";
import { mintDownloadUrls } from "@/lib/stackshift-support/attachments";
import { fail } from "@/lib/stackshift-support/inbound";
import { buildEnvelope, isEventType, pageEvents } from "@/lib/stackshift-support/outbox-logic";

// Task 446 — GET /api/webhooks/stackshift-support/v1/events?site=&ticketRef=&afterSequence=&limit=
// Re-sync for StackShift after downtime: every outbox event with sequence > afterSequence (any delivery
// status), ascending. Scoped to the requesting site; ticketRef narrows to one ticket. The same redacted
// envelope the push delivers — never internal notes or raw rows.
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  return handleSignedGet({
    req,
    route: "GET /events",
    run: async ({ site, params }) => {
      const afterRaw = params.get("afterSequence");
      const afterSequence = afterRaw === null ? 0 : Number(afterRaw);
      if (!Number.isInteger(afterSequence) || afterSequence < 0) {
        return fail(400, "invalid_payload", "`afterSequence` must be a non-negative integer");
      }
      const limitRaw = params.get("limit");
      const limit = limitRaw === null ? DEFAULT_LIMIT : Number(limitRaw);
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        return fail(400, "invalid_payload", `\`limit\` must be 1..${MAX_LIMIT}`);
      }

      const ticketRef = params.get("ticketRef")?.trim() || null;
      let ticketId: string | null = null;
      if (ticketRef) {
        const { data: ticket } = await adminClient.from("inbox").select("id, stackshift_site").eq("external_ref", ticketRef).maybeSingle();
        if (!ticket) return fail(404, "ticket_not_found", "Unknown ticketRef", undefined, ticketRef);
        if (ticket.stackshift_site !== site) return fail(403, "site_forbidden", "Ticket belongs to another site", undefined, ticketRef);
        ticketId = ticket.id;
      }

      // adminClient: a signed server, no Supabase session — same documented exception as the inbound routes.
      let q = adminClient
        .from("stackshift_outbox")
        .select("id, ticket_id, event_type, sequence, payload, created_at, inbox!inner(id, ticket_number, status, external_ref, stackshift_site)")
        .eq("inbox.stackshift_site", site)
        .gt("sequence", afterSequence)
        .order("sequence", { ascending: true })
        .limit(limit + 1);
      if (ticketId) q = q.eq("ticket_id", ticketId);
      const { data, error } = await q;
      if (error) throw new Error(`events query failed: ${error.message}`);

      const { page, nextSequence } = pageEvents(data ?? [], afterSequence, limit);

      // Task 447 — fresh download URLs for the reply events on this page (one lookup, never stored).
      const replyMessageIds = page.flatMap((row) => {
        const mid = row.event_type === "ticket.reply" ? (row.payload as { data?: { messageId?: unknown } } | null)?.data?.messageId : null;
        return typeof mid === "string" ? [mid] : [];
      });
      const downloads = await mintDownloadUrls(replyMessageIds);

      const events = page.flatMap((row) => {
        const t = (Array.isArray(row.inbox) ? row.inbox[0] : row.inbox) as
          | { id: string; ticket_number: number; status: string; external_ref: string | null; stackshift_site: string | null }
          | null;
        if (!t?.external_ref || !t.stackshift_site || !isEventType(row.event_type)) return [];
        const payload = (row.payload ?? {}) as { ticketStatus?: string; data?: unknown };
        return [
          buildEnvelope({
            eventId: row.id,
            type: row.event_type,
            sequence: row.sequence,
            occurredAt: row.created_at,
            ticket: { ticketRef: t.external_ref, hubTicketId: t.id, ticketNumber: t.ticket_number, status: payload.ticketStatus ?? t.status, site: t.stackshift_site },
            data: payload.data,
            attachments: typeof (payload.data as { messageId?: unknown } | undefined)?.messageId === "string"
              ? downloads.get((payload.data as { messageId: string }).messageId)
              : undefined,
          }),
        ];
      });

      return { status: 200, outcome: "events_listed", ticketRef, body: { events, nextSequence } };
    },
  });
}
