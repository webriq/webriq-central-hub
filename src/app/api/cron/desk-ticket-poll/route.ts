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
import { pickDuplicateOf } from "@/lib/stackshift-support/inbound-logic";
// Task 450 — Desk step-down. DORMANT unless STACKSHIFT_DESK_RECONCILE_ENABLED=true AND the ticket's site has a
// non-revoked parity sign-off; otherwise every ticket takes the unchanged ingest path below.
import { loadReconcileContext, recordMiss, type ReconcileContext } from "@/lib/stackshift-support/reconcile";
import { isRetired, reconcileDecision } from "@/lib/stackshift-support/stepdown-logic";
import { normSite } from "@/lib/stackshift-support/parity-logic";
import { escapeLike } from "@/lib/stackshift-support/like";
import { authorizeCronOrStaff } from "@/lib/stackshift-support/cron-auth";
import { getZohoAccessToken } from "@/lib/zoho";
import { fetchDeskPage } from "@/lib/zoho/desk";
import { mapPriority, mapTicketStatus } from "@/lib/migrate/zoho-import";
import { CF_TARGETS, resolveCfField } from "@/lib/migrate/desk-cf";
// Task 390 — sync logic shared with the backfill-stackshift-messages admin route; do not
// reimplement it here, see src/lib/desk/stackshift-message-sync.ts's header comment for why.
import { syncTicketMessages } from "@/lib/desk/stackshift-message-sync";
// Task 441 — overlap window, incremental cursor and time budget (pure helpers).
import { POLL_OVERLAP_MS, selectCandidates, selectUncheckedByCreated, advanceCursor, budgetExhausted } from "@/lib/desk/poll-cursor";
import { subjectsMatch } from "@/lib/email/subject";

// Without this the platform default applies and a long run dies before the cursor moves.
export const maxDuration = 300;
// Stop starting new tickets well before maxDuration so the run exits cleanly.
const RUN_BUDGET_MS = 240_000;

// Reuses the email-poll cursor table (migration 122) with a second row — the column is just a
// free-text cursor value, not literally email-specific in structure, and `id` is a free-text
// primary key so no schema change is needed. `last_received_time` here holds a Desk ticket's
// modifiedTime (epoch ms, as text) instead of a Zoho Mail message's receivedTime.
const CURSOR_ID = "stackshift-desk";
const SEARCH_LABEL = "stackshift-desk-poll";
// Task 441 — created-pass: its own cursor row (created on first advance; a missing row seeds a
// bounded 7-day lookback), and a cap on per-run Get Ticket calls to stay inside Desk's rate limits.
const CREATED_CURSOR_ID = "stackshift-desk-created";
const CREATED_SEED_LOOKBACK_MS = 7 * 86_400_000;
const MAX_CREATED_CHECKS = 60;
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
  // pg_cron secret, or a signed-in STAFF user — a client-role session must not be able to burn Zoho Desk API
  // quota by triggering polls (task 450 review; the pre-existing check accepted any session).
  const auth = await authorizeCronOrStaff(req);
  if ("denied" in auth) return auth.denied;
  const isCronCall = auth.isCron;

  const token = await getZohoAccessToken();
  if (!token) {
    console.error("[cron/desk-ticket-poll] Zoho OAuth is not configured — rejecting");
    return NextResponse.json({ error: "Zoho OAuth is not configured" }, { status: 500 });
  }

  // Task 450 — explicit, admin-only import of ONE reconcile miss (Desk -> StackShift step-down page). The only way
  // a miss ever becomes a Hub row; the regular poll never imports it. Cron calls cannot reach this branch.
  const body = (await req.json().catch(() => ({}))) as { importDeskTicketId?: unknown };
  if (typeof body.importDeskTicketId === "string") {
    return importMiss(body.importDeskTicketId, token, isCronCall);
  }

  const reconcile = await loadReconcileContext();

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

  const startedAt = Date.now();
  let scanned: DeskTicketSearchRow[];
  try {
    // Scan from cursor − overlap so late-indexed tickets are not stranded (task 441).
    scanned = await fetchTicketsSinceCursor(token, cursorMs - POLL_OVERLAP_MS);
  } catch (e) {
    console.error("[cron/desk-ticket-poll] failed to search Desk tickets", e);
    return NextResponse.json({ error: "Failed to search Desk tickets" }, { status: 502 });
  }

  const modifiedOf = (t: DeskTicketSearchRow) => Date.parse(String(t.modifiedTime ?? t.createdTime ?? ""));
  const byId = new Map(scanned.map((t) => [String(t.id), t]));

  // Overlap-zone rows are only worth processing if the Hub has never ingested them.
  const overlapIds = scanned.filter((t) => modifiedOf(t) <= cursorMs).map((t) => String(t.id));
  const knownIds = new Set<string>();
  for (let i = 0; i < overlapIds.length; i += 200) {
    const { data } = await adminClient
      .from("inbox")
      .select("external_id")
      .in("external_id", overlapIds.slice(i, i + 200));
    for (const r of data ?? []) if (r.external_id) knownIds.add(String(r.external_id));
  }

  const candidates = selectCandidates(
    scanned.map((t) => ({ id: String(t.id), modifiedMs: modifiedOf(t) })),
    cursorMs,
    knownIds
  );

  let processed = 0;
  let failed = 0;
  let cursor = cursorMs;
  let budgetHit = false;
  for (const c of candidates) {
    if (budgetExhausted(startedAt, Date.now(), RUN_BUDGET_MS)) {
      budgetHit = true;
      break;
    }
    const ticket = byId.get(c.id);
    if (!ticket) continue;
    try {
      await processTicket(ticket, token, reconcile);
      processed++;
    } catch (e) {
      failed++;
      console.error(`[cron/desk-ticket-poll] failed to process ticket ${ticket.id}`, e);
    }
    // Oldest-first, so advancing per ticket is safe: anything not yet handled stays above the
    // cursor. A failed ticket is skipped (its upsert is idempotent and the overlap window
    // re-offers it while it is still unknown to the Hub), not retried forever.
    const next = advanceCursor(cursor, c.modifiedMs);
    if (next > cursor) {
      cursor = next;
      await adminClient
        .from("email_poll_cursor")
        .upsert(
          { id: CURSOR_ID, last_received_time: String(cursor), updated_at: new Date().toISOString() },
          { onConflict: "id" }
        );
    }
  }

  let createdPass: Awaited<ReturnType<typeof runCreatedPass>> | { error: string };
  try {
    createdPass = await runCreatedPass(token, startedAt, reconcile);
  } catch (e) {
    console.error("[cron/desk-ticket-poll] created-pass failed", e);
    createdPass = { error: e instanceof Error ? e.message : "created-pass failed" };
  }

  const summary = {
    reconcile: { enabled: reconcile.enabled, signedOffSites: reconcile.signedOffSites.size },
    createdPass,
    found: candidates.length,
    processed,
    failed,
    budgetHit,
    cursorBefore: cursorMs,
    cursorAfter: cursor,
    ms: Date.now() - startedAt,
  };
  console.log("[cron/desk-ticket-poll] run", JSON.stringify(summary));
  return NextResponse.json(summary);
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
  sinceMs: number
): Promise<DeskTicketSearchRow[]> {
  const perPage = 100;
  let from = 1; // Desk's `from` is 1-indexed, same as fetchAllDeskPages()
  let currentToken = token;
  const collected: DeskTicketSearchRow[] = [];
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

      if (modifiedMs > sinceMs) {
        collected.push(t);
        allStale = false;
      }
    }

    // Sorted newest-modified-first: once a whole page is at-or-before the cursor, every
    // subsequent page is older still — safe to stop, UNLESS the order already proved
    // unreliable this run, in which case page through everything (bounded by MAX_PAGES).
    if (!orderUnreliable && allStale) break;
    if (rows.length < perPage) break;
    from += perPage;
  }

  return collected;
}

// `reconcile` defaults to "off" so any caller that does not pass it (and the forced import) keeps the
// pre-step-down behaviour byte for byte.
const RECONCILE_OFF: ReconcileContext = { enabled: false, signedOffSites: new Set() };

async function processTicket(
  ticket: DeskTicketSearchRow,
  token: string,
  reconcile: ReconcileContext = RECONCILE_OFF
): Promise<void> {
  const externalId = ticket.id != null ? String(ticket.id) : "";
  if (!externalId || !ticket.subject) return;

  // Task 450 — reconcile mode (design §7 fallback rule). Decided per ticket from its site: only a signed-off
  // site is ever reconciled, so revoking a sign-off returns that site to normal ingestion on the next run.
  if (reconcile.enabled) {
    const siteRaw = resolveCfField(ticket.cf, CF_TARGETS.stackShiftSite);
    const site = siteRaw != null ? String(siteRaw) : null;
    if (!site) {
      console.warn(`[cron/desk-ticket-poll] ticket ${externalId} has no site custom field; ingesting as usual`);
    } else if (reconcile.signedOffSites.has(normSite(site))) {
      const { data: deskRow } = await adminClient.from("inbox").select("id, source_meta").eq("external_id", externalId).maybeSingle();
      const decision = reconcileDecision({
        enabled: true,
        siteSignedOff: true,
        hasDeskRow: !!deskRow,
        deskRowRetired: isRetired(deskRow?.source_meta),
        hasDirectTwin: deskRow ? false : !!(await findDirectTwin(externalId)),
      });
      if (decision === "miss") {
        await recordMiss({
          deskTicketId: externalId,
          ticketNumber: ticket.ticketNumber ?? null,
          subject: ticket.subject,
          site,
          requesterEmail: ticket.email ?? null,
        });
        return;
      }
      if (decision === "skip_retired" || decision === "skip_direct") return;
      // "refresh": the Hub already holds this Desk row (design D5) — fall through to the normal upsert.
    }
  }

  const requesterEmail = ticket.email ?? null;

  // Simple email match, mirroring email-poll's per-ticket lookup — not desk-tickets-import.ts's
  // heavier bulk contact/account-name matching, which is disproportionate for a live poll.
  let customerId: string | null = null;
  if (requesterEmail) {
    const { data: contactMatches } = await adminClient
      .from("contacts")
      .select("customer_id")
      .ilike("email", escapeLike(requesterEmail))
      .not("customer_id", "is", null)
      .limit(1);
    customerId = contactMatches?.[0]?.customer_id ?? null;
  }

  // Task 445 — exact correlation first: a StackShift-direct row (inbox.desk_ticket_id = this Desk id)
  // is the same ticket, so it wins over the task-441 Mail heuristic. Flag only — never merge or skip.
  const directRow = await findDirectTwin(externalId);
  const duplicateOf = directRow
    ? pickDuplicateOf({ id: directRow.id, ticket_number: directRow.ticket_number }, null)
    : await findMailDuplicate(ticket, requesterEmail);

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
          ...(duplicateOf ? { duplicateOf } : {}),
        },
      },
      { onConflict: "external_id" }
    )
    .select("id, ticket_number")
    .single();

  if (upsertError || !upserted) throw new Error(`failed to upsert inbox row: ${upsertError?.message}`);
  const inboxId = upserted.id as string;

  // Task 445 — the other half of the pair: point the direct row back at this Desk copy. Best-effort;
  // the direct-create endpoint flags the Desk row itself when it arrives second, so either order converges.
  if (directRow) {
    const { error: flagError } = await adminClient
      .from("inbox")
      .update({
        source_meta: {
          ...directRow.source_meta,
          duplicateOf: { inboxId, ticketNumber: upserted.ticket_number, via: "desk_ticket_id" },
        },
      })
      .eq("id", directRow.id);
    if (flagError) console.warn("[desk-ticket-poll] could not flag direct twin:", flagError.message);
  }

  // Task 390 — steady-state cron poll never repairs already-existing rows'
  // contentType (repairExistingContentType omitted, defaults to false); that repair is the new
  // backfill-stackshift-messages admin route's job, run manually against dormant tickets.
  await syncTicketMessages(token, externalId, inboxId);
}


// Task 445 — the StackShift-direct twin of a Desk ticket, matched exactly by the Desk ticket id the
// StackShift app sends during dual-write (inbox.desk_ticket_id, migration 169). Null before the
// migration lands (the query errors) or when StackShift never posted this ticket directly.
async function findDirectTwin(
  deskTicketId: string
): Promise<{ id: string; ticket_number: number; source_meta: Record<string, unknown> } | null> {
  const { data, error } = await adminClient
    .from("inbox")
    .select("id, ticket_number, source_meta")
    .eq("desk_ticket_id", deskTicketId)
    .eq("channel", "stackshift")
    .limit(1)
    .maybeSingle();
  if (error) return null;
  return data;
}

// Task 441 — a Desk ticket for an email that also reached the Hub through the Zoho Mail poll is
// the same conversation twice (helpdesk@ also feeds Desk). Flag it, never merge: the Desk copy
// keeps its own fields (Site, Business Name) and the Inbox shows a link to the Mail ticket.
async function findMailDuplicate(
  ticket: DeskTicketSearchRow,
  requesterEmail: string | null
): Promise<{ inboxId: string; ticketNumber: number } | null> {
  const createdMs = Date.parse(String(ticket.createdTime ?? ""));
  if (!requesterEmail || !ticket.subject || !Number.isFinite(createdMs)) return null;
  const HOUR = 3_600_000;
  const { data } = await adminClient
    .from("inbox")
    .select("id, ticket_number, subject, requester_email")
    .eq("channel", "email")
    .ilike("requester_email", requesterEmail)
    .gte("created_at", new Date(createdMs - HOUR).toISOString())
    .lte("created_at", new Date(createdMs + HOUR).toISOString())
    .limit(10);
  const match = (data ?? []).find(
    (t) => (t.requester_email ?? "").toLowerCase() === requesterEmail.toLowerCase() && subjectsMatch(t.subject, ticket.subject!)
  );
  return match ? { inboxId: match.id, ticketNumber: match.ticket_number } : null;
}

// Task 441 — discovery that doesn't depend on Desk's search index. Verified lag: a ticket created
// with the StackShift Site already set (#21083, Desk 21466) wasn't returned by /tickets/search for
// 4 days though a direct fetch worked at once. This pass lists the newest-created tickets
// (`/tickets` is real-time), fetches each unseen one once to read its custom fields (List
// Tickets never returns `cf`), and ingests the StackShift ones through the same processTicket().
// UNVERIFIED at authoring time: `sortBy=-createdTime` on List Tickets — the order check below
// keeps paging if the order proves unreliable, same posture as the search pass.
async function runCreatedPass(token: string, startedAt: number, reconcile: ReconcileContext) {
  const { data: cursorRow } = await adminClient
    .from("email_poll_cursor")
    .select("last_received_time")
    .eq("id", CREATED_CURSOR_ID)
    .maybeSingle();
  const cursorBefore = cursorRow?.last_received_time
    ? Number(cursorRow.last_received_time)
    : Date.now() - CREATED_SEED_LOOKBACK_MS;

  const listed: { id: string; createdMs: number }[] = [];
  let currentToken = token;
  let lastSeen = Infinity;
  let orderUnreliable = false;
  for (let page = 0, from = 1; page < 5; page++, from += 100) {
    const { res, token: nextToken, throttleExhausted } = await fetchDeskPage(
      "/tickets",
      currentToken,
      { sortBy: "-createdTime", from: String(from), limit: "100" },
      SEARCH_LABEL
    );
    currentToken = nextToken;
    if (throttleExhausted) throw new Error("Zoho rolling throttle exhausted");
    if (res.status === 204) break;
    if (!res.ok) throw new Error(`Desk ticket list failed: HTTP ${res.status} ${await res.text().catch(() => "")}`);
    const rows = ((await res.json()) as { data?: DeskTicketSearchRow[] }).data ?? [];
    if (rows.length === 0) break;
    let allStale = true;
    for (const t of rows) {
      const createdMs = Date.parse(String(t.createdTime ?? ""));
      if (!Number.isFinite(createdMs) || t.id == null) continue;
      if (createdMs > lastSeen) orderUnreliable = true;
      lastSeen = createdMs;
      if (createdMs > cursorBefore) {
        listed.push({ id: String(t.id), createdMs });
        allStale = false;
      }
    }
    if (!orderUnreliable && allStale) break;
    if (rows.length < 100) break;
  }

  const knownIds = new Set<string>();
  for (let i = 0; i < listed.length; i += 200) {
    const { data } = await adminClient
      .from("inbox")
      .select("external_id")
      .in("external_id", listed.slice(i, i + 200).map((r) => r.id));
    for (const r of data ?? []) if (r.external_id) knownIds.add(String(r.external_id));
  }

  let cursor = cursorBefore;
  let checked = 0;
  let ingested = 0;
  for (const c of selectUncheckedByCreated(listed, cursorBefore, knownIds)) {
    if (checked >= MAX_CREATED_CHECKS || budgetExhausted(startedAt, Date.now(), RUN_BUDGET_MS)) break;
    const r = await fetchDeskPage(`/tickets/${c.id}`, currentToken, {}, SEARCH_LABEL);
    currentToken = r.token;
    // A failed fetch stops the pass without advancing, so the ticket is retried next run.
    if (!r.res.ok) break;
    const full = (await r.res.json()) as DeskTicketSearchRow;
    checked++;
    if (resolveCfField(full.cf, CF_TARGETS.stackShiftSite)) {
      try {
        await processTicket(full, currentToken, reconcile);
        ingested++;
      } catch (e) {
        // Skip, don't block the pass on one bad ticket (same stance as the search pass).
        console.error(`[cron/desk-ticket-poll] created-pass failed to process ticket ${c.id}`, e);
      }
    }
    cursor = advanceCursor(cursor, c.createdMs);
    await adminClient
      .from("email_poll_cursor")
      .upsert(
        { id: CREATED_CURSOR_ID, last_received_time: String(cursor), updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );
  }
  return { listed: listed.length, checked, ingested, cursorBefore, cursorAfter: cursor };
}

// Task 450 — the deliberate import of a single reconcile miss. Admin session only (never the cron secret). It
// runs the normal ingest path with reconcile OFF, so the ticket becomes a Desk row exactly as it would have
// before the step-down, then marks the miss imported.
async function importMiss(deskTicketId: string, token: string, isCronCall: boolean): Promise<NextResponse> {
  if (isCronCall) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["admin", "super_admin"].includes(profile?.role ?? "")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: miss } = await adminClient
    .from("stackshift_reconcile_misses")
    .select("desk_ticket_id, status")
    .eq("desk_ticket_id", deskTicketId)
    .maybeSingle();
  if (!miss) return NextResponse.json({ error: "No such miss" }, { status: 404 });
  if (miss.status !== "open") return NextResponse.json({ error: `Miss is already ${miss.status}` }, { status: 409 });

  const r = await fetchDeskPage(`/tickets/${encodeURIComponent(deskTicketId)}`, token, {}, SEARCH_LABEL);
  if (!r.res.ok) return NextResponse.json({ error: `Desk returned HTTP ${r.res.status}` }, { status: 502 });
  try {
    await processTicket((await r.res.json()) as DeskTicketSearchRow, r.token);
  } catch (e) {
    console.error(`[cron/desk-ticket-poll] import of miss ${deskTicketId} failed`, e);
    return NextResponse.json({ error: "Import failed" }, { status: 500 });
  }
  await adminClient
    .from("stackshift_reconcile_misses")
    .update({ status: "imported", resolved_by: user.id, resolved_at: new Date().toISOString() })
    .eq("desk_ticket_id", deskTicketId);
  return NextResponse.json({ ok: true });
}
