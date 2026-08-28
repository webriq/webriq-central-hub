// dev-only export endpoint — SSE stream of archived Desk tickets, 2025-01-01 onward.
// The live /tickets export (fetchAllDeskPages("/tickets", …)) silently omits every
// archived ticket; this route uses the dedicated GET /api/v1/tickets/archivedTickets
// endpoint, which has no server-side date filter (only from/limit/departmentId/viewType),
// so the `createdAfter` cutoff is applied client-side here. Loops every department, and —
// mirroring desk-threads' per-ticket try/catch — isolates per-department failure: one
// department that exhausts retries lands in `failed_departments` and the loop continues.
//
// task 334: each department's tickets are then run through enrichTicketsWithCf() — a
// per-ticket Get Ticket call that grafts the `cf` custom-field object (the archivedTickets
// list endpoint, like List Tickets, never returns it). Roughly doubles the Zoho call count;
// per-ticket Get Ticket failures land in the `done` event's `cf_failed_ticket_ids`.
//
// Needs the Desk.search.READ scope (in addition to Desk.tickets.READ / Desk.departments.READ)
// on ZOHO_REFRESH_TOKEN — see env.example. If it is missing the first department call 401s.
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken } from "@/lib/zoho";
import {
  fetchDeskDepartments,
  fetchAllArchivedTicketsForDept,
  enrichTicketsWithCf,
} from "@/lib/zoho/desk";

const DEFAULT_CREATED_AFTER = "2025-01-01T00:00:00.000Z";
const LABEL = "zoho-export/desk-archived-tickets";

export async function GET(req: Request) {
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

  const createdAfterRaw = new URL(req.url).searchParams.get("createdAfter") ?? DEFAULT_CREATED_AFTER;
  const createdAfterMs = Date.parse(createdAfterRaw);
  if (!Number.isFinite(createdAfterMs)) {
    return new Response(
      JSON.stringify({ error: `Invalid createdAfter (expected ISO8601): ${createdAfterRaw}` }),
      { status: 400 }
    );
  }
  const createdAfter = new Date(createdAfterMs).toISOString();

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let departments: { id: string; name: string }[];
      try {
        const r = await fetchDeskDepartments(token, LABEL);
        token = r.token;
        departments = r.items;
      } catch (e) {
        send({ type: "error", message: `Could not list departments: ${e instanceof Error ? e.message : String(e)}` });
        controller.close();
        return;
      }

      let totalKept = 0;
      const perDepartment: Record<string, number> = {};
      const truncatedDepartments: string[] = [];
      const failedDepartments: string[] = [];
      const cfFailedTicketIds: string[] = []; // task 334 — Get Ticket failures during cf enrichment

      for (let i = 0; i < departments.length; i++) {
        const dept = departments[i];
        try {
          const r = await fetchAllArchivedTicketsForDept(dept.id, token, LABEL, { createdAfter });
          token = r.token; // carry the (possibly refreshed) token forward regardless

          // task 334: the archivedTickets list endpoint (like List Tickets) never returns the
          // `cf` custom-field object — enrich each of this department's tickets via a
          // per-ticket Get Ticket call so archived rows reach parity with live tickets
          // (Business Name / StackShift Site). Per-ticket failures are isolated inside the
          // helper (row still emitted with `cf: null`, id recorded).
          let items = r.items;
          if (items.length > 0) {
            const er = await enrichTicketsWithCf(items, token, LABEL);
            token = er.token;
            items = er.enriched;
            cfFailedTicketIds.push(...er.failedTicketIds);
          }

          totalKept += items.length;
          perDepartment[dept.name] = items.length;
          if (items.length > 0) send({ type: "tickets", tickets: items });

          if (r.truncated) {
            truncatedDepartments.push(dept.name);
            send({
              type: "warning",
              department: dept.name,
              reason: "5000-cap",
              message: `"${dept.name}" hit Zoho's 5,000/department archived-ticket cap — 2025+ tickets beyond that are unreachable via this endpoint (needs the Bulk Export API or a UI CSV export).`,
            });
          }
          if (r.orderUnreliable) {
            send({
              type: "warning",
              department: dept.name,
              reason: "order-not-descending",
              message: `"${dept.name}" archived tickets were not newest-first — early-stop disabled, whole department paged (still bounded by the 5,000 cap and still date-filtered).`,
            });
          }
        } catch (e) {
          failedDepartments.push(dept.name);
          console.log(`[${LABEL}] dept=${dept.id} (${dept.name}) failed:`, e instanceof Error ? e.message : e);
          send({
            type: "warning",
            department: dept.name,
            reason: "fetch-failed",
            message: `"${dept.name}" failed: ${e instanceof Error ? e.message : String(e)} — other departments still exported; re-run to retry.`,
          });
        }

        send({ type: "progress", current: i + 1, total: departments.length, ticketCount: totalKept });
      }

      send({
        type: "done",
        total_tickets: totalKept,
        per_department: perDepartment,
        truncated_departments: truncatedDepartments,
        failed_departments: failedDepartments,
        cf_failed_ticket_ids: cfFailedTicketIds,
        created_after: createdAfter,
      });
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
