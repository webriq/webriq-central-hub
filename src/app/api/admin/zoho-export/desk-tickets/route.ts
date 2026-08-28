// Admin-only export: SSE stream of all Zoho Desk tickets, each enriched with its custom
// fields (`cf`) from a per-ticket Get Ticket call (task 329). No new OAuth scope needed —
// Desk.tickets.READ was already granted (task 117's client scope).
//
// Why per-ticket: Zoho Desk's List Tickets endpoint (fetchAllDeskPages("/tickets")) never
// returns custom fields — its `include` param only accepts
// contacts/products/departments/team/isRead/assignee. The "Additional Information" panel
// fields (Business Name, Classifications, StackShift Site, …) live in the `cf` object that
// only GET /api/v1/tickets/{id} returns. Same per-ticket SSE shape as desk-threads.
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken } from "@/lib/zoho";
import { fetchAllDeskPages, enrichTicketsWithCf } from "@/lib/zoho/desk";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return new Response(JSON.stringify({ error: "Forbidden" }), { status: 403 });
  }

  let token = await getZohoAccessToken();
  if (!token) return new Response(JSON.stringify({ error: "No Zoho token" }), { status: 502 });

  if (!process.env.ZOHO_DESK_ORG_ID) {
    return new Response(JSON.stringify({ error: "ZOHO_DESK_ORG_ID not configured" }), { status: 500 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      // 1. List pass — all ticket stubs (no `cf`).
      let stubs: Record<string, unknown>[];
      try {
        const listed = await fetchAllDeskPages("/tickets", token, "zoho-export/desk-tickets");
        stubs = listed.items;
        token = listed.token;
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
        controller.close();
        return;
      }

      // 2. Per-ticket enrichment — attach `cf` (and `customFields` if returned) from Get
      // Ticket. Shared with the archived-tickets export (task 334); streamed one ticket at a
      // time here, exactly as before.
      const { failedTicketIds } = await enrichTicketsWithCf(
        stubs,
        token,
        "zoho-export/desk-tickets",
        {
          onEnriched: (ticket) => send({ type: "tickets", tickets: [ticket] }),
          onProgress: (current, total, ticketId) =>
            send({ type: "progress", current, total, ticketId }),
        }
      );

      send({ type: "done", total: stubs.length, failed_ticket_ids: failedTicketIds });
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
