import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import { buildProjectHref, buildItemHref } from "@/lib/projects/deep-links";
import InboxIndex, { type PaginationMeta, type TicketListItem } from "./_inbox-index";
import { parseStatusFilterParam, STATUS_FILTER_OPTIONS, ARCHIVED_FILTER_VALUE } from "./_status-filter";
import { resolveContactName, type ContactRow } from "./_resolve";

// Desk > Inbox (task 309, renamed from "Tickets" then "Mailbox" by task 363) — activates the
// sidebar's "Desk" nav item. Mirrors `customers/page.tsx`'s exact searchParams-driven
// pagination/search/status pattern (not `dashboard/timelogs`'s client-fetch pattern, which
// doesn't fit a URL-shareable paginated list as well). Gated to roles with real
// `tickets_staff_all` RLS access (migration 048): admin, super_admin, pm. `developer` stays
// hidden per the sidebar's existing `!isDev` gate (unchanged by this task); hr/client/marketing
// have no tickets RLS access at all, so they're redirected away rather than shown an empty page.
//
// Task 363 split this page in two: this is the raw helpdesk-email inbox (unchanged data model,
// unchanged `/api/desk/tickets/**` API routes — only this page route moved from `/desk/tickets`,
// then from `/desk/mailbox`). The new `/desk/tickets` route is a different feature entirely: a
// cross-project listing of issues filed from a ticket thread message (see
// `src/app/(hub)/desk/tickets/page.tsx`).
//
// Follow-up (still task 363) — Ticket ID/Owner/Responded/Due Date moved off this list table onto
// the Tickets tab (they're still shown on this page's own ticket detail view, unaffected — only
// the list table's columns changed). `first_response_at`/`sla_due_at`/`source_meta` are
// consequently no longer selected here: the status FILTER dropdown still works
// (`buildStatusOrClause`/`NOT_ARCHIVED_OR` below filter server-side via `.or()`, which doesn't
// require the filtered columns to be in the `select` list at all), only the removed columns'
// *display* is gone. In their place: a "Linked Ticket" column — a reverse lookup of any
// `issues.source_ticket_id` pointing at this row, linking to that filed issue's existing detail
// page under Projects (no dedicated Desk-side ticket detail page exists).
//
// Follow-up (task 370) — the Tickets tab's read-only "Ticket status" column (the origin ticket's
// own open/on_hold/escalated/closed status) moved back here as an editable "Status" column: this
// is the *origin ticket's own row*, so editing it in place (same `PATCH .../status` endpoint the
// ticket detail page already uses) is more direct than a read-only mirror one tab over. `status`
// is therefore selected again.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Desk · Inbox" };

type TicketRow = {
  id: string;
  subject: string;
  requester_email: string | null;
  external_contact_id: string | null;
  ticket_id: string;
  status: "open" | "on_hold" | "escalated" | "closed";
  created_at: string;
  customers: { company_name: string } | null;
};

type LinkedIssueRow = {
  source_ticket_id: string | null;
  display_id: string | null;
  created_at: string;
  projects: { project_id: string; external_project_id: string | null } | null;
};

// Translates the curated status selection (`STATUS_FILTER_OPTIONS` keys: open/on_hold/
// escalated/closed/overdue — NOT "archived", which is handled separately below) into a
// PostgREST `.or()` clause fragment. open/on_hold/escalated/closed are real `tickets.status`
// values (task 326); "Overdue" is a computed condition (`sla_due_at` in the past, not yet
// closed), expressed as a nested `and(...)` group. Returns "" when nothing status-y is selected.
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

// A row is "not archived" when source_meta.isArchived is absent (NULL — every Hub-native
// email-poll ticket, which is inserted with no source_meta) or explicitly "false" (live Zoho
// imports). Only "true" (task 325's archive import) is archived. Expressed NULL-safely so the
// exclusion doesn't silently drop Hub-native tickets.
const NOT_ARCHIVED_OR = "source_meta->>isArchived.is.null,source_meta->>isArchived.neq.true";
const IS_ARCHIVED = "source_meta->>isArchived.eq.true";

export default async function DeskInboxPage({
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
  const archivedChecked = statusSelected.includes(ARCHIVED_FILTER_VALUE);
  const realStatuses = statusSelected.filter((s) => s !== ARCHIVED_FILTER_VALUE);

  let ticketsQuery = supabase
    .from("tickets")
    .select(
      "id, subject, requester_email, external_contact_id, ticket_id, status, created_at, customers(company_name)",
      { count: "exact" }
    )
    .order("created_at", { ascending: false });

  const statusClause = buildStatusOrClause(realStatuses);

  if (statusSelected.length === 0) {
    // Explicit zero-selection ("uncheck everything") — guaranteed to match no row rather than
    // silently falling back to "all", matching the checkbox's literal state.
    ticketsQuery = ticketsQuery.eq("id", "00000000-0000-0000-0000-000000000000");
  } else if (statusSelected.length === STATUS_FILTER_OPTIONS.length) {
    // Every option checked (incl. "Archived") — no status/archive filter at all.
  } else if (archivedChecked) {
    // "Archived" is checked: OR the archived rows in alongside whatever real statuses are
    // selected ("Closed" + "Archived" → all closed; "Archived" alone → every archived ticket).
    ticketsQuery = ticketsQuery.or(statusClause ? `${statusClause},${IS_ARCHIVED}` : IS_ARCHIVED);
  } else {
    // "Archived" is unchecked (the default): apply the status union AND exclude archived rows,
    // so e.g. checking "Closed" shows live closed tickets only, not the imported Zoho archive.
    if (statusClause) ticketsQuery = ticketsQuery.or(statusClause);
    ticketsQuery = ticketsQuery.or(NOT_ARCHIVED_OR);
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

  // Linked Ticket — the reverse of the Tickets tab's "Origin Ticket" column: does any filed
  // issue point back at this ticket via `source_ticket_id`? At most one is shown per ticket
  // (the most recently filed, if more than one somehow exists — no DB constraint enforces
  // uniqueness, but in practice a ticket is filed into an issue once).
  const ticketIds = ticketRows.map((t) => t.id);
  const linkedIssueByTicketId = new Map<string, { issueDisplayId: string; href: string }>();
  if (ticketIds.length > 0) {
    const { data: linkedRows } = await supabase
      .from("issues")
      .select("source_ticket_id, display_id, created_at, projects(project_id, external_project_id)")
      .in("source_ticket_id", ticketIds)
      .order("created_at", { ascending: false });
    for (const iss of (linkedRows ?? []) as unknown as LinkedIssueRow[]) {
      if (!iss.source_ticket_id || linkedIssueByTicketId.has(iss.source_ticket_id)) continue;
      const projectHref = buildProjectHref({
        projectDisplayId: iss.projects?.project_id ?? null,
        isLegacy: !!iss.projects?.external_project_id,
      });
      const href = buildItemHref(projectHref, "ticket", iss.display_id);
      if (iss.display_id && href) {
        linkedIssueByTicketId.set(iss.source_ticket_id, { issueDisplayId: iss.display_id, href });
      }
    }
  }

  const tickets: TicketListItem[] = ticketRows.map((t) => ({
    id: t.id,
    ticketId: t.ticket_id,
    subject: t.subject,
    contactName: resolveContactName(t, contactByExternalId.get(t.external_contact_id ?? "")),
    accountName: t.customers?.company_name ?? null,
    receivedAt: t.created_at,
    status: t.status,
    linkedIssue: linkedIssueByTicketId.get(t.id) ?? null,
    hasRequesterEmail: !!t.requester_email,
  }));

  const paginationMeta: PaginationMeta = {
    page,
    pageSize,
    total: ticketsRes.count ?? 0,
  };

  return <InboxIndex tickets={tickets} paginationMeta={paginationMeta} />;
}
