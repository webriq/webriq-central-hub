// dev-only export endpoint (task 332) — SSE stream of comments per ARCHIVED ticket, read
// from desk-archived-tickets.json (produced by the Desk Archived Tickets export, task 325).
//
// Sibling of desk-archived-threads: the live Desk Ticket Comments export only iterates
// desk-tickets.json, leaving archived tickets' agent notes/replies uncaptured. Feeds the
// archived ticket-id list through the shared exportCommentsForTickets() helper.
//
// Run GET /api/admin/zoho-export/probe-archived-conversation first to confirm Zoho serves
// the per-ticket /comments endpoint for archived ticket ids.
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken } from "@/lib/zoho";
import { exportCommentsForTickets } from "@/lib/zoho/desk";
import { readFromZoho } from "@/lib/migrate/zoho-import";

type RawTicket = { id?: string | number; [key: string]: unknown };

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  const token = await getZohoAccessToken();
  if (!token) return new Response(JSON.stringify({ error: "No Zoho token" }), { status: 502 });

  if (!process.env.ZOHO_DESK_ORG_ID) {
    return new Response(JSON.stringify({ error: "ZOHO_DESK_ORG_ID not configured" }), { status: 500 });
  }

  let tickets: RawTicket[];
  try {
    tickets = readFromZoho<RawTicket>("desk-archived-tickets.json");
  } catch {
    return new Response(
      JSON.stringify({
        error: "Could not read _from_zoho/desk-archived-tickets.json — export Desk Archived Tickets first",
      }),
      { status: 400 }
    );
  }

  const ticketIds = tickets.map((t) => String(t.id ?? ""));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      const { total, failedTicketIds } = await exportCommentsForTickets(
        ticketIds,
        token,
        "zoho-export/desk-archived-ticket-comments",
        {
          onBatch: (comments) => send({ type: "comments", comments }),
          onProgress: (current, totalCount, ticketId) =>
            send({ type: "progress", current, total: totalCount, ticketId }),
        }
      );

      send({ type: "done", total_comments: total, failed_ticket_ids: failedTicketIds });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
