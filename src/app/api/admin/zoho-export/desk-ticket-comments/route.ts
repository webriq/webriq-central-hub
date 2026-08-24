// dev-only export endpoint — SSE stream of comments per ticket, read from desk-tickets.json.
// Requires Desk Tickets to be exported first. Desk's per-ticket /comments endpoint is
// agent-authored notes/replies (isPublic true/false), NOT the full customer conversation —
// that lives in Zoho's separate Threads endpoint, out of scope for this task (task 296).
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken } from "@/lib/zoho";
import { fetchAllDeskPages } from "@/lib/zoho/desk";
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

  let token = await getZohoAccessToken();
  if (!token) return new Response(JSON.stringify({ error: "No Zoho token" }), { status: 502 });

  if (!process.env.ZOHO_DESK_ORG_ID) {
    return new Response(JSON.stringify({ error: "ZOHO_DESK_ORG_ID not configured" }), { status: 500 });
  }

  let tickets: RawTicket[];
  try {
    tickets = readFromZoho<RawTicket>("desk-tickets.json");
  } catch {
    return new Response(
      JSON.stringify({ error: "Could not read _from_zoho/desk-tickets.json — export Desk Tickets first" }),
      { status: 400 }
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let totalComments = 0;
      const failedTicketIds: string[] = [];

      for (let i = 0; i < tickets.length; i++) {
        const ticketId = String(tickets[i].id ?? "");
        if (!ticketId) continue;

        try {
          const { items, token: nextToken } = await fetchAllDeskPages(
            `/tickets/${ticketId}/comments`,
            token,
            "zoho-export/desk-ticket-comments"
          );
          token = nextToken;

          const commentsWithTicket = items.map((c) => ({ ...c, _zoho_ticket_id: ticketId }));
          totalComments += commentsWithTicket.length;
          send({ type: "progress", current: i + 1, total: tickets.length, ticketId });
          send({ type: "comments", comments: commentsWithTicket });
        } catch (e) {
          failedTicketIds.push(ticketId);
          console.log(`[desk-ticket-comments] Giving up on ticket=${ticketId}:`, e instanceof Error ? e.message : e);
          send({ type: "progress", current: i + 1, total: tickets.length, ticketId });
        }
      }

      send({ type: "done", total_comments: totalComments, failed_ticket_ids: failedTicketIds });
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
