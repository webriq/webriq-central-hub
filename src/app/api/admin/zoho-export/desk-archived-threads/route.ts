// dev-only export endpoint (task 332) — SSE stream of threads per ARCHIVED ticket, read from
// desk-archived-tickets.json (produced by the Desk Archived Tickets export, task 325).
//
// The live Desk Threads export only ever iterates desk-tickets.json, so every archived
// ticket imported by task 325 currently shows an empty conversation. This route feeds the
// archived ticket-id list through the same exportThreadsForTickets() helper — the import
// side already links archived rows via tickets.external_id with no change.
//
// Whether Zoho Desk's per-ticket /threads endpoint serves archived ticket ids is the one
// unknown task 325 left open — run GET /api/admin/zoho-export/probe-archived-conversation
// first to confirm before a full run.
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

      const { total, failedTicketIds } = await exportThreadsForTickets(
        ticketIds,
        token,
        "zoho-export/desk-archived-threads",
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
