// StackShift Support Center live ticket poll (task 388) — StackShift's own app
// (webriq-pagebuilder/app) creates tickets directly in Zoho Desk via its own API
// integration, tagging every ticket with cf.cf_stack_shift_site. Until now Central Hub only
// ever captured these via a one-time/manual import (src/lib/migrate/desk-tickets-import.ts).
// This cron pulls them live, mirroring src/app/api/cron/email-poll/route.ts's shape for the
// Zoho Mail channel — but reading Zoho Desk's /tickets/search instead of Zoho Mail, and using
// the SAME Zoho Desk org/credentials Central Hub already has (ZOHO_DESK_ORG_ID) since
// StackShift's Desk org is confirmed to be the same one ("webriqgoesmad").
//
// One-way only: this reads Desk, it never writes back to it. No two-way sync in this task.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken } from "@/lib/zoho";
import { fetchDeskPage } from "@/lib/zoho/desk";
import { mapPriority, mapTicketStatus } from "@/lib/migrate/zoho-import";
import { CF_TARGETS, resolveCfField } from "@/lib/migrate/desk-cf";
// Task 390 — sync logic shared with the backfill-stackshift-messages admin route; do not
// reimplement it here, see src/lib/desk/stackshift-message-sync.ts's header comment for why.
import { syncTicketMessages } from "@/lib/desk/stackshift-message-sync";

// Reuses the email-poll cursor table (migration 122) with a second row — the column is just a
// free-text cursor value, not literally email-specific in structure, and `id` is a free-text
// primary key so no schema change is needed. `last_received_time` here holds a Desk ticket's
// modifiedTime (epoch ms, as text) instead of a Zoho Mail message's receivedTime.
const CURSOR_ID = "stackshift-desk";
const SEARCH_LABEL = "stackshift-desk-poll";
const MAX_PAGES = 20; // 100/page — bounds a runaway loop if Desk's sort order is unreliable

type DeskTicketSearchRow = {
  id?: string | number;
  ticketNumber?: string;
  subject?: string;
  status?: string;
  statusType?: string;
  priority?: string;
  channel?: string;
  departmentId?: string | number | null;
  email?: string | null;
  webUrl?: string | null;
  cf?: Record<string, unknown> | null;
  customFields?: unknown;
  modifiedTime?: string | null;
  createdTime?: string | null;
  dueDate?: string | null;
  closedTime?: string | null;
  customerResponseTime?: string | null;
};

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRONJOB_SECRET_KEY;
  const incomingSecret = req.headers.get("x-cron-secret");
  const isCronCall = !!cronSecret && incomingSecret === cronSecret;

  if (!isCronCall) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const token = await getZohoAccessToken();
  if (!token) {
    console.error("[cron/desk-ticket-poll] Zoho OAuth is not configured — rejecting");
    return NextResponse.json({ error: "Zoho OAuth is not configured" }, { status: 500 });
  }

  const { data: cursorRow } = await adminClient
    .from("email_poll_cursor")
    .select("last_received_time")
    .eq("id", CURSOR_ID)
    .maybeSingle();

  // Unseeded cursor (row missing entirely — shouldn't happen once migration 148 lands, but
  // guards a pre-migration run) starts from "now" rather than null, so a first run never
  // re-ingests every historical StackShift ticket desk-tickets-import.ts already captured —
  // same caveat migration 122 documents for the email cursor's null-start backfill behavior.
  const cursorMs = cursorRow?.last_received_time ? Number(cursorRow.last_received_time) : Date.now();

  let tickets: DeskTicketSearchRow[];
  let latestSeenMs = cursorMs;
  try {
    const result = await fetchTicketsSinceCursor(token, cursorMs);
    tickets = result.tickets;
    latestSeenMs = result.latestSeenMs;
  } catch (e) {
    console.error("[cron/desk-ticket-poll] failed to search Desk tickets", e);
    return NextResponse.json({ error: "Failed to search Desk tickets" }, { status: 502 });
  }

  let processed = 0;
  for (const ticket of tickets) {
    try {
      await processTicket(ticket, token);
      processed++;
    } catch (e) {
      console.error(`[cron/desk-ticket-poll] failed to process ticket ${ticket.id}`, e);
    }
  }

  // Cursor advances to the latest modifiedTime actually observed in this run, even if some
  // tickets failed to process (same as email-poll's per-message cursor advance) — a ticket
  // whose processing throws is skipped, not retried forever, since its own upsert is
  // idempotent on external_id and will simply be corrected on its next natural modification.
  if (latestSeenMs > cursorMs) {
    await adminClient
      .from("email_poll_cursor")
      .upsert(
        { id: CURSOR_ID, last_received_time: String(latestSeenMs), updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );
  }

  return NextResponse.json({ found: tickets.length, processed });
}

// Paginates Desk's /tickets/search filtered to cf_stack_shift_site being non-empty (the exact
// filter StackShift's own app uses to scope "its" tickets — see
// webriq-pagebuilder/app/web/pages/api/support_desk/list-all-tickets-v2.ts), sorted newest
// modified first, stopping early once a whole page is at-or-before the cursor. Zoho's
// `${notempty}` DSL token is passed as literal characters — URLSearchParams percent-encodes
// them the same way StackShift's own hand-encoded `%24%7Bnotempty%7D` does. UNVERIFIED against
// a live account at authoring time — confirm both the encoding and `modifiedTime` sort
// behavior before relying on this, same posture as this codebase's other Zoho API assumptions
// (see src/lib/zoho/mail.ts's header comment).
async function fetchTicketsSinceCursor(
  token: string,
  cursorMs: number
): Promise<{ tickets: DeskTicketSearchRow[]; latestSeenMs: number }> {
  const perPage = 100;
  let from = 1; // Desk's `from` is 1-indexed, same as fetchAllDeskPages()
  let currentToken = token;
  const collected: DeskTicketSearchRow[] = [];
  let latestSeenMs = cursorMs;
  let lastSeen = Infinity; // descending-order sanity check, mirrors fetchAllArchivedTicketsForDept()
  let orderUnreliable = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { res, token: nextToken, throttleExhausted } = await fetchDeskPage(
      "/tickets/search",
      currentToken,
      { customField1: "cf_stack_shift_site:${notempty}", sortBy: "-modifiedTime", from: String(from), limit: String(perPage) },
      SEARCH_LABEL
    );
    currentToken = nextToken;

    if (throttleExhausted) throw new Error("Zoho rolling throttle exhausted");
    if (res.status === 204) break;
    if (!res.ok) throw new Error(`Desk ticket search failed: HTTP ${res.status} ${await res.text().catch(() => "")}`);

    const json = (await res.json()) as { data?: DeskTicketSearchRow[] };
    const rows = json.data ?? [];
    if (rows.length === 0) break;

    let allStale = true;
    for (const t of rows) {
      const modifiedMs = Date.parse(String(t.modifiedTime ?? t.createdTime ?? ""));
      if (!Number.isFinite(modifiedMs)) continue;
      if (modifiedMs > lastSeen) orderUnreliable = true;
      lastSeen = modifiedMs;

      if (modifiedMs > cursorMs) {
        collected.push(t);
        allStale = false;
        if (modifiedMs > latestSeenMs) latestSeenMs = modifiedMs;
      }
    }

    // Sorted newest-modified-first: once a whole page is at-or-before the cursor, every
    // subsequent page is older still — safe to stop, UNLESS the order already proved
    // unreliable this run, in which case page through everything (bounded by MAX_PAGES).
    if (!orderUnreliable && allStale) break;
    if (rows.length < perPage) break;
    from += perPage;
  }

  return { tickets: collected, latestSeenMs };
}

async function processTicket(ticket: DeskTicketSearchRow, token: string): Promise<void> {
  const externalId = ticket.id != null ? String(ticket.id) : "";
  if (!externalId || !ticket.subject) return;

  const requesterEmail = ticket.email ?? null;

  // Simple email match, mirroring email-poll's per-ticket lookup — not desk-tickets-import.ts's
  // heavier bulk contact/account-name matching, which is disproportionate for a live poll.
  let customerId: string | null = null;
  if (requesterEmail) {
    const { data: contactMatches } = await adminClient
      .from("contacts")
      .select("customer_id")
      .ilike("email", requesterEmail)
      .not("customer_id", "is", null)
      .limit(1);
    customerId = contactMatches?.[0]?.customer_id ?? null;
  }

  const { data: upserted, error: upsertError } = await adminClient
    .from("inbox")
    .upsert(
      {
        external_id: externalId,
        customer_id: customerId,
        subject: ticket.subject,
        // Live poll — deliberately does NOT override ticket_number/ticket_id with Zoho's own
        // ticketNumber the way the bulk historical import does. Those columns keep advancing
        // Central Hub's own serial (same convention email-poll already follows for live
        // tickets); Zoho's number is preserved for reference in source_meta.ticketNumber below.
        channel: "api",
        priority: mapPriority(ticket.priority ?? ""),
        status: mapTicketStatus(ticket.status ?? "", ticket.statusType ?? ""),
        requester_email: requesterEmail,
        sla_due_at: ticket.dueDate ?? null,
        resolved_at: ticket.closedTime ?? null,
        first_response_at: ticket.customerResponseTime ?? null,
        source_meta: {
          ticketNumber: ticket.ticketNumber ?? null,
          status: ticket.status ?? null,
          statusType: ticket.statusType ?? null,
          channel: ticket.channel ?? null,
          departmentId: ticket.departmentId ?? null,
          webUrl: ticket.webUrl ?? null,
          cf: ticket.cf ?? null,
          customFields: ticket.customFields ?? null,
          stackShiftSite: resolveCfField(ticket.cf, CF_TARGETS.stackShiftSite),
          whiteLabel: resolveCfField(ticket.cf, CF_TARGETS.whiteLabel),
          source: "stackshift-desk-poll",
        },
      },
      { onConflict: "external_id" }
    )
    .select("id")
    .single();

  if (upsertError || !upserted) throw new Error(`failed to upsert inbox row: ${upsertError?.message}`);
  const inboxId = upserted.id as string;

  // Task 390 — steady-state cron poll never repairs already-existing rows'
  // contentType (repairExistingContentType omitted, defaults to false); that repair is the new
  // backfill-stackshift-messages admin route's job, run manually against dormant tickets.
  await syncTicketMessages(token, externalId, inboxId);
}
