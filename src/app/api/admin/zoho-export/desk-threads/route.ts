// dev-only export endpoint — SSE stream of threads per ticket, read from desk-tickets.json.
// Requires Desk Tickets to be exported first. Unlike Desk Comments (agent-authored notes
// only), Threads are the actual customer<->agent conversation (task 304) — the follow-up
// task 296 explicitly flagged as out of scope.
//
// NOTE: the Threads list endpoint's response shape was not independently confirmed during
// planning (only the per-thread detail endpoint's fields were confirmed via documentation
// examples during task 296's research). Defensively: if a list item already carries `content`,
// it's used as-is; otherwise a per-thread detail fetch fills it in. Confirm against a real
// export and simplify if the list endpoint turns out to always return full content.
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken } from "@/lib/zoho";
import { fetchAllDeskPages, fetchDeskPage } from "@/lib/zoho/desk";
import { readFromZoho } from "@/lib/migrate/zoho-import";

type RawTicket = { id?: string | number; [key: string]: unknown };
type RawThread = { id?: string | number; content?: string | null; [key: string]: unknown };

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

      let totalThreads = 0;
      const failedTicketIds: string[] = [];

      for (let i = 0; i < tickets.length; i++) {
        const ticketId = String(tickets[i].id ?? "");
        if (!ticketId) continue;

        try {
          const { items, token: listToken } = await fetchAllDeskPages(
            `/tickets/${ticketId}/threads`,
            token,
            "zoho-export/desk-threads"
          );
          token = listToken;

          const enriched: Record<string, unknown>[] = [];
          for (const raw of items as RawThread[]) {
            const threadId = String(raw.id ?? "");
            if ((raw.content != null && raw.content !== "") || !threadId) {
              enriched.push({ ...raw, _zoho_ticket_id: ticketId });
              continue;
            }

            try {
              const { res, token: detailToken, throttleExhausted } = await fetchDeskPage(
                `/tickets/${ticketId}/threads/${threadId}`,
                token,
                {},
                "zoho-export/desk-threads-detail"
              );
              token = detailToken;
              if (throttleExhausted || !res.ok) {
                enriched.push({ ...raw, _zoho_ticket_id: ticketId });
              } else {
                const detail = (await res.json()) as Record<string, unknown>;
                enriched.push({ ...raw, ...detail, _zoho_ticket_id: ticketId });
              }
            } catch {
              enriched.push({ ...raw, _zoho_ticket_id: ticketId });
            }
          }

          totalThreads += enriched.length;
          send({ type: "progress", current: i + 1, total: tickets.length, ticketId });
          send({ type: "threads", threads: enriched });
        } catch (e) {
          failedTicketIds.push(ticketId);
          console.log(`[desk-threads] Giving up on ticket=${ticketId}:`, e instanceof Error ? e.message : e);
          send({ type: "progress", current: i + 1, total: tickets.length, ticketId });
        }
      }

      send({ type: "done", total_threads: totalThreads, failed_ticket_ids: failedTicketIds });
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
