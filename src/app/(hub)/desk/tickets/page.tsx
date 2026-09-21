import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import { buildProjectHref, buildItemHref } from "@/lib/projects/deep-links";
import FiledIssuesIndex, { type PaginationMeta, type FiledIssueListItem } from "./_filed-issues-index";
import { parseStatusFilterParam, ALL_STATUS_VALUES } from "./_status-filter";

// Desk > Tickets (task 363) — a cross-project listing of `tickets` rows, either filed from an
// Inbox (Desk) message via the "File a Ticket" action (task 333, linked by the
// `tickets.source_inbox_id` column — migration 137, renamed from `issues.source_ticket_id` by
// migration 147's task-382 rename) or created directly here via "New Ticket" (task 383,
// `source_inbox_id IS NULL` — "Manual"). The support→dev handoff board: PM/Admin assign a
// developer, track status, and see total logged hours, without opening the owning project.
// Same role gate as Inbox (admin/super_admin/pm) — `tickets_staff_read` (migration 051, was
// `issues_staff_read`) would technically let a developer read every row too, but this page
// deliberately doesn't surface it to them; their own filed-and-assigned tickets remain
// visible on the project's own Tickets tab and Dev Dashboard → My Tasks.
//
// This is a *different* route than `/desk/inbox` (the renamed old `/desk/tickets`, itself
// renamed from "Mailbox" per user preference) — no shared query logic, no shared components
// beyond the page-shell pattern itself.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Desk · Tickets" };

type FiledIssueRow = {
  id: string;
  title: string;
  display_id: string | null;
  status: string;
  severity: string | null;
  assignees: string[] | null;
  assignee_id: string | null;
  created_at: string;
  source_inbox_id: string | null;
  projects: { project_id: string; external_project_id: string | null; name: string } | null;
  // Ticket ID/Responded/Due Date/Status moved here from the Inbox list table (still task 363's
  // follow-up) — these are the *origin Inbox message's own* fields, distinct from this ticket's
  // own `status` above (the dev-workflow status).
  inbox: {
    id: string;
    ticket_id: string;
    subject: string;
    status: string;
    first_response_at: string | null;
    sla_due_at: string | null;
  } | null;
};

function isTicketOverdue(status: string, dueAt: string | null): boolean {
  if (!dueAt || status === "closed") return false;
  return new Date(dueAt).getTime() < Date.now();
}

// Task 383 — whole days elapsed past the SLA due date, for the Due date column's "(ND)" badge.
// Only meaningful when `isTicketOverdue` is true; returns null otherwise.
function overdueDays(dueAt: string | null): number | null {
  if (!dueAt) return null;
  const diffMs = Date.now() - new Date(dueAt).getTime();
  if (diffMs <= 0) return null;
  return Math.max(1, Math.floor(diffMs / 86_400_000));
}

export default async function DeskFiledIssuesPage({
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

  // Task 383 — the same status/search predicates apply to the main listing and both origin
  // counts below; reapplying them via this helper (structural-typed over `.eq`/`.in`/`.or`) keeps
  // the three query builders in sync instead of hand-rolling the filter logic three times.
  function applyTicketFilters<
    Q extends { eq: (col: string, val: string) => Q; in: (col: string, vals: string[]) => Q; or: (str: string) => Q },
  >(query: Q): Q {
    let q = query;
    if (statusSelected.length === 0) {
      // Explicit zero-selection ("uncheck everything") — matches the checkbox's literal state.
      q = q.eq("id", "00000000-0000-0000-0000-000000000000");
    } else if (statusSelected.length < ALL_STATUS_VALUES.length) {
      q = q.in("status", statusSelected);
    }
    if (searchQ) {
      const esc = searchQ.replace(/[%,()]/g, "");
      q = q.or(`title.ilike.%${esc}%,display_id.ilike.%${esc}%`);
    }
    return q;
  }

  // Task 383 — no longer Inbox-only; manually-created tickets (`source_inbox_id IS NULL`) now
  // list here too, distinguished by the Origin column and the two counts below.
  const issuesQuery = applyTicketFilters(
    supabase
      .from("tickets")
      .select(
        "id, title, display_id, status, severity, assignees, assignee_id, created_at, source_inbox_id, projects(project_id, external_project_id, name), inbox(id, ticket_id, subject, status, first_response_at, sla_due_at)",
        { count: "exact" }
      )
  ).order("created_at", { ascending: false });

  const [issuesRes, inboxCountRes, manualCountRes] = await Promise.all([
    issuesQuery.range(from, to),
    applyTicketFilters(
      supabase.from("tickets").select("id", { count: "exact", head: true })
    ).not("source_inbox_id", "is", null),
    applyTicketFilters(
      supabase.from("tickets").select("id", { count: "exact", head: true })
    ).is("source_inbox_id", null),
  ]);
  const issueRows = (issuesRes.data ?? []) as unknown as FiledIssueRow[];
  const inboxFiledCount = inboxCountRes.count ?? 0;
  const manualCreatedCount = manualCountRes.count ?? 0;

  // Total logged hours per issue — a small `.in()` lookup scoped to just this page's issue ids,
  // not the 1000-row bulk-lookup-map pattern (CLAUDE.md's `.range()` pagination rule applies to
  // lookups that could exceed 1000 rows; a page of ≤100 issues' time logs never approaches that).
  const issueIds = issueRows.map((i) => i.id);
  const hoursByIssueId = new Map<string, number>();
  if (issueIds.length > 0) {
    const { data: logRows } = await supabase
      .from("time_logs")
      .select("issue_id, hours")
      .in("issue_id", issueIds);
    for (const l of logRows ?? []) {
      if (!l.issue_id) continue;
      hoursByIssueId.set(l.issue_id, (hoursByIssueId.get(l.issue_id) ?? 0) + (l.hours ?? 0));
    }
  }

  const issues: FiledIssueListItem[] = issueRows.map((i) => {
    const projectHref = buildProjectHref({
      projectDisplayId: i.projects?.project_id ?? null,
      isLegacy: !!i.projects?.external_project_id,
    });
    return {
      id: i.id,
      title: i.title,
      displayId: i.display_id,
      status: i.status,
      severity: i.severity,
      assignees: i.assignees,
      assigneeId: i.assignee_id,
      createdAt: i.created_at,
      projectHref,
      ticketHref: buildItemHref(projectHref, "ticket", i.display_id),
      projectName: i.projects?.name ?? "—",
      isManual: !i.source_inbox_id,
      inboxId: i.inbox?.id ?? "",
      ticketId: i.inbox?.ticket_id ?? "",
      ticketSubject: i.inbox?.subject ?? "",
      ticketRespondedAt: i.inbox?.first_response_at ?? null,
      ticketDueAt: i.inbox?.sla_due_at ?? null,
      ticketOverdue: i.inbox ? isTicketOverdue(i.inbox.status, i.inbox.sla_due_at) : false,
      ticketOverdueDays: i.inbox ? overdueDays(i.inbox.sla_due_at) : null,
      totalHours: hoursByIssueId.get(i.id) ?? 0,
    };
  });

  const paginationMeta: PaginationMeta = {
    page,
    pageSize,
    total: issuesRes.count ?? 0,
  };

  return (
    <FiledIssuesIndex
      issues={issues}
      paginationMeta={paginationMeta}
      inboxFiledCount={inboxFiledCount}
      manualCreatedCount={manualCreatedCount}
    />
  );
}
