import { adminClient } from "@/lib/supabase/admin";
import { escapeLike } from "./like";
import {
  AUTH_FAILURE_OUTCOMES,
  MAX_TICKETS,
  checkA,
  checkB,
  checkC,
  checkD,
  checkE,
  checkF,
  clampWindow,
  evaluateOverall,
  evaluateThresholds,
  normSite,
  pairCopies,
  type AuditSummary,
  type Check,
  type DeskCopy,
  type DirectCopy,
  type Msg,
  type Thresholds,
  type Verdict,
} from "./parity-logic";

// Task 449 — builds the parity report (design §9) from live data. READ-ONLY: it never writes and never
// changes a ticket. adminClient is used behind the callers' explicit admin/super_admin gate (the page and the
// sign-off route) because the comparison spans Desk-polled rows, direct rows, messages, attachments, the
// outbox and the audit log. Every select that can exceed 1000 rows pages with .range() (CLAUDE.md rule).

const PAGE = 1000;
const CHUNK = 100;
const DESK_SOURCE = "stackshift-desk-poll";

export type ParityReport = {
  site: string;
  fromIso: string;
  toIso: string;
  generatedAt: string;
  clamped: boolean;
  truncated: boolean;
  thresholds: Thresholds;
  checks: Check[];
  verdict: Verdict; // computed with NO acknowledgements; the sign-off re-evaluates with the signer's
  counts: { desk: number; direct: number; paired: number; deskMisses: number; directOnly: number };
  firstDirectAt: string | null;
};

const chunks = <T,>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

type CopyRow = { id: string; ticket_number: number; status: string; resolved_at: string | null; created_at: string };

async function loadDirectRows(site: string, fromIso: string, toIso: string) {
  const rows: (CopyRow & { desk_ticket_id: string | null })[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await adminClient
      .from("inbox")
      .select("id, ticket_number, desk_ticket_id, status, resolved_at, created_at")
      .eq("channel", "stackshift")
      .ilike("stackshift_site", escapeLike(site))
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`direct rows failed: ${error.message}`);
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

async function loadDeskRows(site: string, fromIso: string, toIso: string, extraExternalIds: string[]) {
  const rows = new Map<string, CopyRow & { external_id: string }>();
  const cols = "id, ticket_number, external_id, status, resolved_at, created_at";
  for (let from = 0; ; from += PAGE) {
    // The Desk copy's created_at is the poll's INGESTION time (the upsert never sets it), so window
    // membership for Desk-only tickets is approximate — pairs below use the direct row's real time.
    const { data, error } = await adminClient
      .from("inbox")
      .select(cols)
      .eq("source_meta->>source", DESK_SOURCE)
      .ilike("source_meta->>stackShiftSite", escapeLike(site))
      .gte("created_at", fromIso)
      .lte("created_at", toIso)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`desk rows failed: ${error.message}`);
    for (const r of data) if (r.external_id) rows.set(r.id, r as CopyRow & { external_id: string });
    if (data.length < PAGE) break;
  }
  // A Desk copy ingested late (after `to`) of a ticket created inside the window still belongs to its pair.
  for (const ids of chunks(extraExternalIds, CHUNK)) {
    const { data, error } = await adminClient.from("inbox").select(cols).in("external_id", ids);
    if (error) throw new Error(`paired desk rows failed: ${error.message}`);
    for (const r of data) if (r.external_id) rows.set(r.id, r as CopyRow & { external_id: string });
  }
  return [...rows.values()];
}

async function loadMessagesAndAttachments(inboxIds: string[]) {
  const messagesByTicket = new Map<string, Msg[]>();
  const ticketOfMessage = new Map<string, string>();
  for (const ids of chunks(inboxIds, CHUNK)) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await adminClient
        .from("inbox_messages")
        .select("id, inbox_id, author_type, visibility, body, created_at")
        .in("inbox_id", ids)
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`messages failed: ${error.message}`);
      for (const m of data) {
        ticketOfMessage.set(m.id, m.inbox_id);
        const list = messagesByTicket.get(m.inbox_id) ?? [];
        list.push({ author_type: m.author_type, visibility: m.visibility, body: m.body, created_at: m.created_at });
        messagesByTicket.set(m.inbox_id, list);
      }
      if (data.length < PAGE) break;
    }
  }

  const attachmentsByTicket = new Map<string, number>();
  for (const ids of chunks([...ticketOfMessage.keys()], 200)) {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await adminClient
        .from("attachments")
        .select("entity_id")
        .eq("entity_type", "inbox_message")
        .in("entity_id", ids)
        .order("created_at", { ascending: true })
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`attachments failed: ${error.message}`);
      for (const a of data) {
        const ticket = ticketOfMessage.get(a.entity_id);
        if (ticket) attachmentsByTicket.set(ticket, (attachmentsByTicket.get(ticket) ?? 0) + 1);
      }
      if (data.length < PAGE) break;
    }
  }
  return { messagesByTicket, attachmentsByTicket };
}

async function loadDeadEvents(directIds: string[], numberById: Map<string, number>) {
  const dead: { ticketId: string; ticketNumber?: number; sequence: number; eventType: string; lastError: string | null }[] = [];
  for (const ids of chunks(directIds, CHUNK)) {
    const { data, error } = await adminClient
      .from("stackshift_outbox")
      .select("ticket_id, sequence, event_type, last_error")
      .eq("status", "dead")
      .in("ticket_id", ids);
    if (error) throw new Error(`outbox failed: ${error.message}`);
    for (const e of data) dead.push({ ticketId: e.ticket_id, ticketNumber: numberById.get(e.ticket_id), sequence: e.sequence, eventType: e.event_type, lastError: e.last_error });
  }
  return dead;
}

async function loadAudit(site: string, fromIso: string, toIso: string): Promise<AuditSummary> {
  const { data: fiveXx, error } = await adminClient
    .from("stackshift_support_audit")
    .select("route, status_code, at")
    .ilike("site", escapeLike(site))
    .gte("status_code", 500)
    .gte("at", fromIso)
    .lte("at", toIso)
    .order("at", { ascending: false })
    .limit(200);
  if (error) throw new Error(`audit failed: ${error.message}`);

  // A failed signature is rejected BEFORE the payload (and its site) is parsed, so auth failures carry no
  // site: they are counted across the whole API and compared with the whole API's request volume.
  const { count: authFailures } = await adminClient
    .from("stackshift_support_audit")
    .select("id", { count: "exact", head: true })
    .in("outcome", [...AUTH_FAILURE_OUTCOMES])
    .gte("at", fromIso)
    .lte("at", toIso);
  const { count: totalRequests } = await adminClient
    .from("stackshift_support_audit")
    .select("id", { count: "exact", head: true })
    .gte("at", fromIso)
    .lte("at", toIso);

  return {
    fiveXx: (fiveXx ?? []).map((r) => ({ route: r.route, statusCode: r.status_code ?? 0, at: r.at })),
    authFailures: authFailures ?? 0,
    totalRequests: totalRequests ?? 0,
  };
}

export async function buildReport(siteInput: string, fromMs: number, toMs: number): Promise<ParityReport> {
  const site = normSite(siteInput);
  const win = clampWindow(fromMs, toMs);
  const fromIso = new Date(win.fromMs).toISOString();
  const toIso = new Date(win.toMs).toISOString();

  let directRows = await loadDirectRows(site, fromIso, toIso);
  const directDeskIds = directRows.flatMap((d) => (d.desk_ticket_id ? [d.desk_ticket_id] : []));
  let deskRows = await loadDeskRows(site, fromIso, toIso, directDeskIds);

  let truncated = false;
  if (directRows.length > MAX_TICKETS) {
    directRows = directRows.slice(0, MAX_TICKETS);
    truncated = true;
  }
  if (deskRows.length > MAX_TICKETS) {
    deskRows = deskRows.slice(0, MAX_TICKETS);
    truncated = true;
  }

  const allIds = [...directRows.map((r) => r.id), ...deskRows.map((r) => r.id)];
  const { messagesByTicket, attachmentsByTicket } = await loadMessagesAndAttachments(allIds);
  const withData = <R extends CopyRow>(r: R) => ({
    ...r,
    messages: messagesByTicket.get(r.id) ?? [],
    attachmentCount: attachmentsByTicket.get(r.id) ?? 0,
  });

  const desks: DeskCopy[] = deskRows.map(withData);
  const directs: DirectCopy[] = directRows.map(withData);
  const { pairs, misses, directOnly } = pairCopies(desks, directs);

  const numberById = new Map(directRows.map((r) => [r.id, r.ticket_number]));
  const dead = await loadDeadEvents(directRows.map((r) => r.id), numberById);
  const audit = await loadAudit(site, fromIso, toIso);

  const checks: Check[] = [
    checkA(desks.length, misses),
    checkB(pairs),
    checkC(pairs),
    checkD(pairs),
    checkE(directs.length, dead),
    checkF(audit),
  ];
  const thresholds = evaluateThresholds(win.fromMs, win.toMs, desks.length);

  return {
    site,
    fromIso,
    toIso,
    generatedAt: new Date().toISOString(),
    clamped: win.clamped,
    truncated,
    thresholds,
    checks,
    verdict: evaluateOverall(checks, thresholds),
    counts: { desk: desks.length, direct: directs.length, paired: pairs.length, deskMisses: misses.length, directOnly: directOnly.length },
    firstDirectAt: directRows.length ? directRows[directRows.length - 1].created_at : null,
  };
}

// Sites that have direct tickets, with how many and since when — feeds the page's site picker and its default
// window start (the dual-write start for that site).
export async function listDirectSites(): Promise<{ site: string; tickets: number; firstAt: string }[]> {
  const sites = new Map<string, { tickets: number; firstAt: string }>();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await adminClient
      .from("inbox")
      .select("stackshift_site, created_at")
      .eq("channel", "stackshift")
      .not("stackshift_site", "is", null)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`site list failed: ${error.message}`);
    for (const r of data) {
      const key = normSite(r.stackshift_site as string);
      const cur = sites.get(key);
      sites.set(key, { tickets: (cur?.tickets ?? 0) + 1, firstAt: cur?.firstAt ?? r.created_at });
    }
    if (data.length < PAGE) break;
  }
  return [...sites.entries()].map(([site, v]) => ({ site, ...v })).sort((a, b) => b.tickets - a.tickets);
}

// Task 450's precondition: the latest sign-off for a site that has not been revoked.
export async function latestSignoff(site: string) {
  const { data } = await adminClient
    .from("stackshift_parity_signoff")
    .select("id, site, window_from, window_to, ticket_count, note, signed_by, signed_at, revoked_at, revoke_reason, acknowledgements, attestations")
    .ilike("site", escapeLike(normSite(site)))
    .order("signed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

// Task 450 — the set of sites whose parity gate is signed off and NOT revoked. Read once per poll run;
// revoking a sign-off removes the site from the set, which puts it back on normal ingestion automatically.
// Fails CLOSED to "nobody signed off" (=> today's behaviour) if the table is missing or the read errors.
export async function activeSignedOffSites(): Promise<Set<string>> {
  const { data, error } = await adminClient.from("stackshift_parity_signoff").select("site").is("revoked_at", null);
  if (error) {
    console.warn("[stackshift-support] sign-off lookup unavailable, treating no site as signed off:", error.message);
    return new Set();
  }
  return new Set((data ?? []).map((r) => normSite(r.site)));
}

export async function isSiteSignedOff(site: string | null | undefined): Promise<boolean> {
  if (!site) return false;
  return (await activeSignedOffSites()).has(normSite(site));
}
