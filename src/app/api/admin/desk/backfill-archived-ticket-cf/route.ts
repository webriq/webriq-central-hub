// One-shot admin backfill (task 334) — grafts the Zoho Desk custom-field object (`cf`) onto
// archived `tickets` rows that were imported by task 325 before the export learned to enrich
// `cf` (task 329 did that for live tickets only). Reads each archived ticket, calls
// GET /api/v1/tickets/{id} (Get Ticket — the only endpoint that returns `cf`), and patches
// `source_meta` in place with { cf, customFields, whiteLabel, stackShiftSite } using the same
// promotion logic as importDeskTickets().
//
// Manually triggered, admin-only, SSE-streamed (the run is ~1,566 Get Ticket calls with
// rolling-throttle pacing — several minutes), bounded, re-runnable. No schema change.
//
// Query params:
//   ?dryRun=1        — report what would change, write nothing (also the probe: ?dryRun=1&limit=1
//                      shows whether Zoho returns `cf` for an archived ticket id)
//   ?limit=N         — cap tickets processed this call
//   ?ticketNumber=N  — restrict to a single ticket (verify before a wider run)
//   ?force=1         — re-fetch even rows that already have source_meta.cf
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken } from "@/lib/zoho";
import { fetchDeskPage } from "@/lib/zoho/desk";
import { CF_TARGETS, resolveCfField } from "@/lib/migrate/desk-cf";

const PAGE = 1000;
const THROTTLE_MS = 700; // same cadence as attachment-meta — stay under Zoho's rolling limit
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type ArchivedTicketRow = {
  id: string;
  external_id: string | null;
  ticket_number: number | null;
  source_meta: Record<string, unknown> | null;
};

export async function POST(req: Request) {
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

  const url = new URL(req.url);
  const dryRun = url.searchParams.get("dryRun") === "1" || url.searchParams.get("dryRun") === "true";
  const force = url.searchParams.get("force") === "1" || url.searchParams.get("force") === "true";
  const limitParam = Number(url.searchParams.get("limit"));
  const limit = Number.isInteger(limitParam) && limitParam > 0 ? limitParam : Infinity;
  const ticketNumberParam = url.searchParams.get("ticketNumber");
  let ticketNumberFilter: number | null = null;
  if (ticketNumberParam != null) {
    const n = Number(ticketNumberParam);
    if (!Number.isInteger(n)) {
      return new Response(JSON.stringify({ error: "Invalid ticketNumber" }), { status: 400 });
    }
    ticketNumberFilter = n;
  }

  // Candidate scan — every archived ticket row (paginated; > 1,000 exist). `cf` presence is
  // filtered in JS (avoids a PostgREST JSON-path predicate) unless ?force.
  const candidates: ArchivedTicketRow[] = [];
  {
    let from = 0;
    while (candidates.length < limit) {
      // `source_meta->>isArchived.eq.true` — same PostgREST JSON-path predicate the Desk
      // Tickets list view uses (src/app/(hub)/desk/tickets/page.tsx).
      let q = adminClient
        .from("tickets")
        .select("id, external_id, ticket_number, source_meta")
        .or("source_meta->>isArchived.eq.true")
        .not("external_id", "is", null)
        .order("ticket_number", { ascending: true })
        .range(from, from + PAGE - 1);
      if (ticketNumberFilter != null) q = q.eq("ticket_number", ticketNumberFilter);

      const { data, error } = await q;
      if (error) {
        return new Response(JSON.stringify({ error: `candidate query failed: ${error.message}` }), { status: 500 });
      }
      const rows = (data ?? []) as ArchivedTicketRow[];
      for (const row of rows) {
        if (candidates.length >= limit) break;
        const hasCf = row.source_meta != null && "cf" in row.source_meta && row.source_meta.cf != null;
        if (force || !hasCf) candidates.push(row);
      }
      if (rows.length < PAGE) break;
      from += PAGE;
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));

      let updated = 0;
      const failed: Array<{ ticketNumber: number | null; reason: string }> = [];
      const total = candidates.length;

      for (let i = 0; i < candidates.length; i++) {
        const cand = candidates[i];
        const externalId = String(cand.external_id ?? "");

        if (!externalId) {
          failed.push({ ticketNumber: cand.ticket_number, reason: "row has no external_id" });
          send({ type: "progress", current: i + 1, total, updated, failed: failed.length });
          continue;
        }

        try {
          const { res, token: nextToken, throttleExhausted } = await fetchDeskPage(
            `/tickets/${externalId}`,
            token,
            {},
            "backfill-archived-cf"
          );
          token = nextToken;

          if (throttleExhausted) throw new Error("Zoho rolling throttle exhausted");
          if (!res.ok) throw new Error(`Get Ticket ${res.status}: ${(await res.text()).slice(0, 200)}`);

          const detail = (await res.json()) as {
            cf?: Record<string, unknown> | null;
            customFields?: unknown;
          };
          const cf = detail.cf ?? {};

          if (!dryRun) {
            const patched = {
              ...(cand.source_meta ?? {}),
              cf,
              customFields: detail.customFields ?? null,
              whiteLabel: resolveCfField(cf, CF_TARGETS.whiteLabel),
              stackShiftSite: resolveCfField(cf, CF_TARGETS.stackShiftSite),
            };
            const { error: updateError } = await adminClient
              .from("tickets")
              .update({ source_meta: patched })
              .eq("id", cand.id);
            if (updateError) throw new Error(`row update failed: ${updateError.message}`);
          }

          updated++;
        } catch (e) {
          failed.push({
            ticketNumber: cand.ticket_number,
            reason: e instanceof Error ? e.message : String(e),
          });
          console.log(`[backfill-archived-cf] ticket=${externalId} (#${cand.ticket_number}) failed:`, e instanceof Error ? e.message : e);
        }

        send({ type: "progress", current: i + 1, total, updated, failed: failed.length });
        await sleep(THROTTLE_MS);
      }

      send({ type: "done", scanned: total, updated, dryRun, failed });
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
