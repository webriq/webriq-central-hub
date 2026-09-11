import { createClient } from "@/lib/supabase/server";
import {
  buildItemHref,
  buildProjectHref,
  localDateKey,
  normalizeTaskPriority,
  severityToPriority,
  type DevDashboardData,
  type DevHoursByProject,
  type DevProjectSummary,
  type DevWorkItem,
} from "./_types";

// Task 360 — every read for the developer dashboard, in one server-side pass.
//
// Plain server module (no `"use server"` — that directive is only for client-callable Server
// Actions). Uses `createClient()` so RLS applies; never `adminClient`, since this is an
// authenticated hub route and row-level scoping is the whole point.
//
// Status normalization and HTML-entity decoding deliberately do NOT happen here — both helpers
// live in `_pm-shared.tsx`, which is `"use client"`. See the note on `DevWorkItem.status`. For
// the same reason, `sortWorkItems()` is called client-side (in `_dev-dashboard.tsx`, after
// normalization), not here — its primary key is status, and an unnormalized raw-Zoho status
// string wouldn't sort correctly against `_types.ts`'s normalized `STATUS_ORDER` table.

const PAGE = 1000;
/**
 * Ceiling on the developer's own work, so a pathological assignee count can't blow up the
 * payload. Closed items are included (bounded by `CLOSED_WINDOW_DAYS` below, not by this limit
 * alone) so this now bounds "open work + recently-closed work" together, not just open work.
 */
const WORK_LIMIT = 500;
const ACTIVITY_WINDOW_DAYS = 30;
/**
 * A closed item only counts toward `WORK_LIMIT` if it closed within this window — otherwise a
 * developer who has ever closed hundreds of old tasks could see those crowd out their actually
 * open work in the `updated_at`-ordered top-`WORK_LIMIT` slice. Reuses the same window as
 * "recently worked on" for one consistent story: this page shows *recent* activity, not the
 * full history.
 */
const CLOSED_WINDOW_DAYS = ACTIVITY_WINDOW_DAYS;
/** The exact two raw spellings `_pm-shared.tsx`'s `normalizeStatus()` maps to `"closed"`. */
const CLOSED_STATUS_VALUES = ["closed", "Closed"];

type PagedQuery<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null }>;

/**
 * PostgREST caps every response at 1000 rows with no error and no warning on truncation — this
 * has caused two separate live-run bugs (tasks 103 and 110). Any select that isn't inherently
 * bounded must page. Canonical pattern: `zoho-import/timelogs/route.ts:104-119`.
 */
async function fetchAllPages<T>(run: PagedQuery<T>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data } = await run(from, from + PAGE - 1);
    const rows = data ?? [];
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

type ProjectRow = {
  id: string;
  name: string;
  project_id: string | null;
  external_project_id: string | null;
  customer_id: string;
};

type TimeLogRow = {
  project_id: string;
  created_at: string;
  date_logged: string;
  hours: number;
  task_id: string | null;
  issue_id: string | null;
};

/** Shared by the three issue-assignee queries below — kept as one constant so the three stay in sync. */
const ISSUE_SELECT = "id, project_id, title, status, severity, due_date, display_id, updated_at";

/**
 * @param fullName the developer's `profiles.full_name`, already resolved by the caller — passed
 *   in rather than re-queried so the legacy `assignee_name` issue lookup doesn't add a waterfall.
 */
export async function loadDevDashboard(userId: string, fullName: string | null): Promise<DevDashboardData> {
  const supabase = await createClient();
  const now = new Date();
  const today = localDateKey(now);
  const activitySince = localDateKey(new Date(now.getTime() - ACTIVITY_WINDOW_DAYS * 86_400_000));

  const trimmedName = fullName?.trim() ?? "";
  const closedSince = localDateKey(new Date(now.getTime() - CLOSED_WINDOW_DAYS * 86_400_000));
  // `tasks`/`issues` aren't guaranteed to already store the normalized lowercase status —
  // `normalizeStatus()` in `_pm-shared.tsx` exists specifically because some (mostly
  // Zoho-imported) rows still carry the raw display name. Its map has exactly two spellings that
  // normalize to "closed": `closed` and `Closed`. This filter, and the `CLOSED_STATUS_VALUES`
  // guard below, check both — a plain `status.neq.closed` would silently miss capitalized rows.
  const closedInList = `(${CLOSED_STATUS_VALUES.join(",")})`;
  // "Not closed, OR closed but touched within CLOSED_WINDOW_DAYS" — see that constant's comment.
  const statusFilter = `status.not.in.${closedInList},and(status.in.${closedInList},updated_at.gte.${closedSince})`;

  // Issues are matched three ways rather than through one `.or(...)`: the `assignees` array
  // containment operator needs brace syntax that PostgREST's or() filter quotes unreliably, and
  // three parallel queries in the same Promise.all cost no extra round trip anyway.
  //
  // This re-expresses, as a SQL filter, the same array-or-scalar-or-legacy-name assignee rule
  // that `issueAssigneeIds()` (`@/lib/issues/permissions.ts`) and `issueMatchesAssigneeFilter()`
  // (`_shared/_assignee-filter.ts`) already apply in JS to an already-fetched row. Those two
  // operate over a single project's already-loaded rows (client-side matchers); this loader needs
  // an org-wide, by-user query, which is a genuinely different shape — no SQL-level equivalent
  // exists yet to call instead. Worth extracting into a shared query-building helper if a second
  // by-user issue query shows up elsewhere; not done here to keep this diff to the dashboard.
  //
  // `activityLogs` covers the last 30 days (`ACTIVITY_WINDOW_DAYS`), which already includes
  // today — so it also supplies every "Logged today" figure below, rather than running a second,
  // overlapping `time_logs` query just for today's rows.
  const [tasksRes, issuesByArrayRes, issuesByIdRes, issuesByNameRes, activityLogs] =
    await Promise.all([
      supabase
        .from("tasks")
        .select("id, project_id, title, status, priority, due_date, display_id, updated_at")
        .contains("assignees", [userId])
        .or(statusFilter)
        .order("updated_at", { ascending: false })
        .limit(WORK_LIMIT),
      supabase
        .from("issues")
        .select(ISSUE_SELECT)
        .contains("assignees", [userId])
        .or(statusFilter)
        .order("updated_at", { ascending: false })
        .limit(WORK_LIMIT),
      supabase
        .from("issues")
        .select(ISSUE_SELECT)
        .eq("assignee_id", userId)
        .or(statusFilter)
        .order("updated_at", { ascending: false })
        .limit(WORK_LIMIT),
      // Legacy Zoho-imported issues can carry only the free-text assignee name — same fallback
      // `issueMatchesAssigneeFilter()` in `_shared/_assignee-filter.ts` applies.
      trimmedName
        ? supabase
            .from("issues")
            .select(ISSUE_SELECT)
            .ilike("assignee_name", trimmedName)
            .or(statusFilter)
            .order("updated_at", { ascending: false })
            .limit(WORK_LIMIT)
        : Promise.resolve({ data: [] }),
      fetchAllPages<TimeLogRow>((from, to) =>
        supabase
          .from("time_logs")
          .select("project_id, created_at, date_logged, hours, task_id, issue_id")
          .eq("employee_id", userId)
          .gte("date_logged", activitySince)
          .order("created_at", { ascending: false })
          .range(from, to)
      ),
    ]);

  const taskRows = tasksRes.data ?? [];

  // De-duplicate the three issue result sets by id — a row can match more than one predicate.
  const issueById = new Map<string, NonNullable<typeof issuesByArrayRes.data>[number]>();
  for (const res of [issuesByArrayRes, issuesByIdRes, issuesByNameRes]) {
    for (const row of res.data ?? []) issueById.set(row.id, row);
  }
  const issueRows = [...issueById.values()];

  // ─── Project + customer lookup maps (js-index-maps: build once, then O(1)) ───
  const projectIds = new Set<string>();
  for (const t of taskRows) projectIds.add(t.project_id);
  for (const i of issueRows) projectIds.add(i.project_id);
  for (const l of activityLogs) projectIds.add(l.project_id);

  const projectIdList = [...projectIds];
  const projectRows = projectIdList.length
    ? await fetchAllPages<ProjectRow>((from, to) =>
        supabase
          .from("projects")
          .select("id, name, project_id, external_project_id, customer_id")
          .in("id", projectIdList)
          .range(from, to)
      )
    : [];

  const customerIds = [...new Set(projectRows.map((p) => p.customer_id))];
  const customerRows = customerIds.length
    ? await fetchAllPages<{ customer_id: string; company_name: string }>((from, to) =>
        supabase
          .from("customers")
          .select("customer_id, company_name")
          .in("customer_id", customerIds)
          .range(from, to)
      )
    : [];

  const companyByCustomerId = new Map(customerRows.map((c) => [c.customer_id, c.company_name]));
  const projectById = new Map(projectRows.map((p) => [p.id, p]));
  const hrefByProjectId = new Map(
    projectRows.map((p) => [
      p.id,
      buildProjectHref({ projectDisplayId: p.project_id, isLegacy: !!p.external_project_id }),
    ])
  );

  // ─── Work items ─────────────────────────────────────────────────────────────
  const items: DevWorkItem[] = [];
  const openCountByProject = new Map<string, number>();

  function pushItem(
    kind: DevWorkItem["kind"],
    row: {
      id: string;
      project_id: string;
      title: string;
      status: string;
      due_date: string | null;
      display_id: string | null;
      updated_at: string;
    },
    priority: DevWorkItem["priority"],
    rawSeverity: string | null
  ) {
    const project = projectById.get(row.project_id);
    const projectHref = hrefByProjectId.get(row.project_id) ?? null;
    items.push({
      id: row.id,
      kind,
      title: row.title,
      status: row.status,
      priority,
      rawSeverity,
      dueDate: row.due_date,
      displayId: row.display_id,
      updatedAt: row.updated_at,
      projectId: row.project_id,
      projectName: project?.name ?? "Unknown project",
      href: buildItemHref(projectHref, kind, row.display_id),
    });
    // "Heaviest workload"'s hint reads "Open items" — a closed item (now fetched too, see
    // `statusFilter` above) must not count toward it. `row.status` is still raw here (unnormalized —
    // see the file header), so this checks both spellings `CLOSED_STATUS_VALUES` covers.
    if (!CLOSED_STATUS_VALUES.includes(row.status)) {
      openCountByProject.set(row.project_id, (openCountByProject.get(row.project_id) ?? 0) + 1);
    }
  }

  for (const t of taskRows) pushItem("task", t, normalizeTaskPriority(t.priority), null);
  for (const i of issueRows) pushItem("issue", i, severityToPriority(i.severity), i.severity);

  // ─── Today's logged time (one pass — js-combine-iterations) ─────────────────
  // `activityLogs` already spans today (it covers the last `ACTIVITY_WINDOW_DAYS`), so today's
  // totals are filtered out of the same result set instead of a second query.
  let hoursToday = 0;
  const todayItemKeys = new Set<string>();
  const hoursTodayByProjectId = new Map<string, number>();
  for (const log of activityLogs) {
    if (log.date_logged !== today) continue;
    hoursToday += log.hours;
    todayItemKeys.add(log.task_id ?? log.issue_id ?? `general:${log.project_id}`);
    hoursTodayByProjectId.set(log.project_id, (hoursTodayByProjectId.get(log.project_id) ?? 0) + log.hours);
  }

  const hoursTodayByProject: DevHoursByProject[] = [...hoursTodayByProjectId.entries()]
    .map(([projectId, hours]) => ({ name: projectById.get(projectId)?.name ?? "Unknown project", hours }))
    .sort((a, b) => b.hours - a.hours);

  // ─── Per-project activity: the developer's own most recent touch ────────────
  // `activityLogs` is already ordered created_at desc, so the first hit per project wins.
  const lastActivityByProject = new Map<string, string>();
  for (const log of activityLogs) {
    if (!lastActivityByProject.has(log.project_id)) lastActivityByProject.set(log.project_id, log.created_at);
  }
  for (const item of items) {
    const seen = lastActivityByProject.get(item.projectId);
    if (!seen || item.updatedAt > seen) lastActivityByProject.set(item.projectId, item.updatedAt);
  }

  const projects: DevProjectSummary[] = projectRows.map((p) => ({
    projectId: p.id,
    name: p.name,
    companyName: companyByCustomerId.get(p.customer_id) ?? null,
    href: hrefByProjectId.get(p.id) ?? null,
    lastActivityAt: lastActivityByProject.get(p.id) ?? null,
    openCount: openCountByProject.get(p.id) ?? 0,
  }));

  return {
    // Unsorted here — `sortWorkItems()`'s primary key is status, which must be normalized first
    // (see the file header); `_dev-dashboard.tsx` sorts after normalizing.
    items,
    hoursToday,
    hoursTodayItemCount: todayItemKeys.size,
    hoursTodayByProject,
    projects,
    today,
    generatedAt: now.toISOString(),
  };
}
