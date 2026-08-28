import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import TicketsIndex, { type PaginationMeta, type TicketListItem, type TicketStatus } from "./_tickets-index";
import { parseStatusFilterParam, STATUS_FILTER_OPTIONS } from "./_status-filter";
import { resolveContactName, resolveOwnerName, resolveDisplayId, isOverdue, type ContactRow, type DeskAgentRow } from "./_resolve";

// Desk > Tickets (task 309) — activates the sidebar's "Desk" nav item. Mirrors
// `customers/page.tsx`'s exact searchParams-driven pagination/search/status pattern (not
// `dashboard/timelogs`'s client-fetch pattern, which doesn't fit a URL-shareable paginated list
// as well). Gated to roles with real `tickets_staff_all` RLS access (migration 048): admin,
// super_admin, pm. `developer` stays hidden per the sidebar's existing `!isDev` gate (unchanged
// by this task); hr/client/marketing have no tickets RLS access at all, so they're redirected
// away rather than shown an empty page.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Desk · Tickets" };

type TicketRow = {
  id: string;
  subject: string;
  status: string;
  first_response_at: string | null;
  sla_due_at: string | null;
  requester_email: string | null;
  external_contact_id: string | null;
  source_meta: Record<string, unknown> | null;
  ticket_number: number;
  ticket_id: string;
  customers: { company_name: string } | null;
};

// Translates the curated filter selection (`STATUS_FILTER_OPTIONS` keys: open/on_hold/
// escalated/closed/overdue) into a PostgREST `.or()` clause. open/on_hold/escalated/closed are
// real `tickets.status` values (task 326); "Overdue" is a computed condition (`sla_due_at` in
// the past, not yet closed), expressed as a nested `and(...)` group.
function buildStatusOrClause(selected: string[]): string {
  const nowIso = new Date().toISOString();
  const parts: string[] = [];
  if (selected.includes("open")) parts.push("status.eq.open");
  if (selected.includes("on_hold")) parts.push("status.eq.on_hold");
  if (selected.includes("escalated")) parts.push("status.eq.escalated");
  if (selected.includes("closed")) parts.push("status.eq.closed");
  if (selected.includes("overdue")) parts.push(`and(sla_due_at.lt.${nowIso},status.neq.closed)`);
  return parts.join(",");
}

export default async function DeskTicketsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; pageSize?: string; search?: string; status?: string }>;
}) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = claims.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role ?? null;

  if (role !== "admin" && role !== "super_admin" && role !== "pm") redirect(V2_ROUTES.DASHBOARD);

  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1", 10));
  const pageSize = Math.max(1, parseInt(params.pageSize ?? "20", 10));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  const searchQ = params.search?.trim() ?? "";
  const statusSelected = parseStatusFilterParam(params.status ?? null);

  let ticketsQuery = supabase
    .from("tickets")
    .select(
      "id, subject, status, first_response_at, sla_due_at, requester_email, external_contact_id, source_meta, ticket_number, ticket_id, customers(company_name)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  if (statusSelected.length === 0) {
    // Explicit zero-selection ("uncheck everything") — guaranteed to match no row rather than
    // silently falling back to "all", matching the checkbox's literal state.
    ticketsQuery = ticketsQuery.eq("id", "00000000-0000-0000-0000-000000000000");
  } else if (statusSelected.length !== STATUS_FILTER_OPTIONS.length) {
    ticketsQuery = ticketsQuery.or(buildStatusOrClause(statusSelected));
  }
  if (searchQ) {
    // Strip characters that would break PostgREST's `.or()` filter-list syntax.
    const esc = searchQ.replace(/[%,()]/g, "");
    ticketsQuery = ticketsQuery.or(
      `subject.ilike.%${esc}%,requester_email.ilike.%${esc}%,external_id.ilike.%${esc}%`
    );
  }

  const ticketsRes = await ticketsQuery.range(from, to);
  const ticketRows = (ticketsRes.data ?? []) as TicketRow[];

  // Contact Name has no declared FK to `tickets` (migration 114 added a plain text column, not
  // a foreign key) — resolve it with a scoped lookup Map, same discipline `customers/page.tsx`
  // already applies to its own per-page `contacts`/`projects` lookups.
  const contactExternalIds = [...new Set(ticketRows.map((t) => t.external_contact_id).filter((v): v is string => !!v))];
  const contactByExternalId = new Map<string, ContactRow>();
  if (contactExternalIds.length > 0) {
    const { data: contactRows } = await supabase
      .from("contacts")
      .select("external_id, full_name, first_name, last_name, email")
      .in("external_id", contactExternalIds);
    for (const c of contactRows ?? []) {
      if (c.external_id) contactByExternalId.set(c.external_id, c);
    }
  }

  // Owner has no declared FK either — `source_meta.assigneeId` is Zoho's raw Desk agent id
  // (task 310). Same scoped-lookup discipline as the Contact lookup above.
  const assigneeIds = [
    ...new Set(
      ticketRows
        .map((t) => t.source_meta?.assigneeId)
        .filter((v): v is string | number => v != null)
        .map((v) => String(v))
    ),
  ];
  const agentByExternalId = new Map<string, DeskAgentRow>();
  if (assigneeIds.length > 0) {
    const { data: agentRows } = await supabase
      .from("desk_agents")
      .select("external_id, full_name, email")
      .in("external_id", assigneeIds);
    for (const a of agentRows ?? []) {
      agentByExternalId.set(a.external_id, a);
    }
  }

  const tickets: TicketListItem[] = ticketRows.map((t) => {
    const assigneeId = t.source_meta?.assigneeId;
    const agent = assigneeId != null ? agentByExternalId.get(String(assigneeId)) : undefined;
    return {
      id: t.id,
      ticketNumber: t.ticket_number,
      ticketId: t.ticket_id,
      displayId: resolveDisplayId(t),
      subject: t.subject,
      status: t.status as TicketStatus,
      contactName: resolveContactName(t, contactByExternalId.get(t.external_contact_id ?? "")),
      accountName: t.customers?.company_name ?? null,
      owner: resolveOwnerName(agent),
      respondedAt: t.first_response_at,
      dueAt: t.sla_due_at,
      isOverdue: isOverdue(t.status, t.sla_due_at),
    };
  });

  const paginationMeta: PaginationMeta = {
    page,
    pageSize,
    total: ticketsRes.count ?? 0,
  };

  return <TicketsIndex tickets={tickets} paginationMeta={paginationMeta} />;
}
