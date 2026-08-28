// dev-only export endpoint — SSE stream of threads per ticket, read from desk-tickets.json.
// Requires Desk Tickets to be exported first. Threads are the actual customer<->agent
// conversation (task 304) — unlike Desk Comments (agent-authored notes only).
//
// The per-ticket walk (list pagination + defensive per-thread detail fill + per-ticket
// fault isolation) lives in exportThreadsForTickets() in src/lib/zoho/desk.ts, shared with
// the archived-ticket threads export (task 332). This route only wires the live ticket-id
// list from desk-tickets.json into the SSE frames.
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken } from "@/lib/zoho";
import { exportThreadsForTickets } from "@/lib/zoho/desk";
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
    tickets = readFromZoho<RawTicket>("desk-tickets.json");
  } catch {
    return new Response(
      JSON.stringify({ error: "Could not read _from_zoho/desk-tickets.json — export Desk Tickets first" }),
      { status: 400 }
    );
  }

  const ticketIds = tickets.map((t) => String(t.id ?? ""));

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      const { total, failedTicketIds } = await exportThreadsForTickets(
        ticketIds,
        token,
        "zoho-export/desk-threads",
        {
          onBatch: (threads) => send({ type: "threads", threads }),
          onProgress: (current, totalCount, ticketId) =>
            send({ type: "progress", current, total: totalCount, ticketId }),
        }
      );

      send({ type: "done", total_threads: total, failed_ticket_ids: failedTicketIds });
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
