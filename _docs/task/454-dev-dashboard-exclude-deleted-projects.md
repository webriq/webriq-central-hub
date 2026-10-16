# 454: Dev Dashboard — Exclude Deleted Projects

**Created:** 2026-10-16
**Priority:** MEDIUM
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

The developer dashboard (`/dashboard`, developer role) lists tasks and tickets from **soft-deleted** projects. Example from the screenshot: "Fix Contact Us Form" and "Update Hero Section" appear under `Test Central Hub Content Site_deleted_2026-10-16`. They show up in My Tasks, the stat strip counts (Open, In progress, Overdue), the digest, the Overdue card, Recently worked on and Heaviest workload ("Test Central Hu…  2").

Soft delete (tasks 231 / 247) sets `projects.status = 'deleted'` and renames the row to `<name>_deleted_<YYYY-MM-DD>`. It never touches the project's tasks or tickets, so those rows keep their assignees and status. Every project listing and detail loader already filters with `.neq("status", "deleted")`. The dev dashboard loader is the surface that doesn't: it fetches the developer's work by assignee, then looks up projects by id with no status check.

Every panel on the page is computed from the loader's `items` and `projects` arrays (`_dev-dashboard.tsx` derives the stat strip, recently moved, digest, overdue, recently worked on and heaviest workload client-side). So one filter in the loader fixes every panel.

## Requirements

- [ ] Tasks and tickets whose project has `status = 'deleted'` are left out of `DevDashboardData.items`. They then disappear from My Tasks (every tab, plus "View all N assigned"), the stat strip counts (Due today, In progress, Overdue, and the header "N overdue"), Recently moved to In progress, Your digest, Overdue — needs attention, and the Start timer target.
- [ ] Deleted projects are left out of `DevDashboardData.projects` (Recently worked on, Heaviest workload).
- [ ] Items whose project row is **not returned at all** (RLS-hidden or missing; today these render as "Unknown project") behave as they do now. Exclude only rows the database confirms are `deleted`.
- [ ] The "Logged today" figures (`hoursToday`, `hoursTodayItemCount`, `hoursTodayByProject`) stay as they are. Time already logged is real work, and the totals must keep matching `/dashboard/timelogs`. See the open question below.

## Out of Scope / Must-Not-Change

- PM, admin and marketing dashboards, `/dashboard/tasks` and other task listings. Only the developer dashboard is in scope. If the same leak exists elsewhere, it gets its own follow-up.
- The soft-delete flow itself (`DELETE /api/v2/projects/[projectId]`): no cascading status changes to tasks or tickets.
- No migration and no RLS changes.
- Don't change the `WORK_LIMIT` / `statusFilter` / closed-window semantics.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/dashboard/_dev/_load-dev-dashboard.ts` | Modify | Select `projects.status`, build the set of deleted project ids, and drop matching task/issue rows and project summaries before items and per-project maps are built |

## Code Context

### File: `src/app/(hub)/dashboard/_dev/_load-dev-dashboard.ts`

Work is fetched by assignee with no project filter (lines ~119–162). Projects are looked up afterwards:

```ts
type ProjectRow = {
  id: string;
  name: string;
  project_id: string | null;
  external_project_id: string | null;
  customer_id: string;
};
...
const projectRows = projectIdList.length
  ? await fetchAllPages<ProjectRow>((from, to) =>
      supabase
        .from("projects")
        .select("id, name, project_id, external_project_id, customer_id")
        .in("id", projectIdList)
        .range(from, to)
    )
  : [];
...
for (const t of taskRows) pushItem("task", t, normalizeTaskPriority(t.priority), null);
for (const i of issueRows) pushItem("ticket", i, severityToPriority(i.severity), i.severity);
...
const projects: DevProjectSummary[] = projectRows.map((p) => ({ ... }));
```

Notes:
- `projects.status` is non-null: `"active" | "on_hold" | "completed" | "archived" | "deleted"` (`src/types/database.ts`, CHECK in migration 099).
- Filter in JS after the lookup instead of adding `.neq("status","deleted")` to the query. With the query filter, a deleted project would simply be missing from `projectById`, and its items would still render as "Unknown project". The work rows have to be dropped too, and that needs the set of deleted ids.
- Keep `activityLogs` unchanged for the hours figures. The project lookup still has to include deleted projects so the `hoursTodayByProject` names resolve.
- Existing pattern elsewhere: `.neq("status", "deleted")` in `projects/_v2-listing/_load-list-data.ts:98`, `projects/_shared/_get-project-detail-data.ts:36`.

Sketch:

```ts
type ProjectRow = { ...; status: string };
// select: "id, name, project_id, external_project_id, customer_id, status"

// Soft-deleted projects (task 231/247) keep their tasks/tickets assigned — drop that work here.
const deletedProjectIds = new Set(projectRows.filter((p) => p.status === "deleted").map((p) => p.id));
const liveTaskRows = taskRows.filter((t) => !deletedProjectIds.has(t.project_id));
const liveIssueRows = issueRows.filter((i) => !deletedProjectIds.has(i.project_id));
// pushItem over live rows; projects summary over projectRows.filter((p) => !deletedProjectIds.has(p.id))
```

`lastActivityByProject` may still hold deleted ids from `activityLogs`. That's harmless because it's only read for projects in the filtered summary list.

## Implementation Steps

1. Add `status` to `ProjectRow` and to the `projects` select string.
2. After `projectRows` loads, build `deletedProjectIds`.
3. Feed `pushItem` filtered task/issue rows, so `items` and `openCountByProject` exclude deleted work.
4. Build `projects: DevProjectSummary[]` from non-deleted rows only.
5. Leave the hours section unchanged. Add a short comment explaining why it intentionally includes deleted projects.
6. Optional: skip the `customers` lookup for customers whose only projects are deleted. Not required; leaving it is fine.

## Acceptance Criteria

- [ ] With a soft-deleted project that has open tasks assigned to the developer, none of those tasks appear anywhere on `/dashboard` (My Tasks tabs and counts, View all, stat cards, header overdue count, recently moved, digest, overdue card).
- [ ] That project doesn't appear in Recently worked on or Heaviest workload.
- [ ] The tab counts (All / Open / In progress / …) and stat cards drop by exactly the number of excluded items.
- [ ] Non-deleted projects (active, on_hold, completed, archived) render as before.
- [ ] "Logged today" totals match `/dashboard/timelogs` for today.
- [ ] `npx tsc --noEmit` passes and `pnpm lint` reports no new issues in the touched file.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Browser check: sign in as a developer who has tasks on a soft-deleted project (e.g. `Test Central Hub Content Site_deleted_2026-10-16`, `EBCF833001-T0001` / `-T0003`) and confirm the rows and the "Test Central Hu…" workload entry are gone, and that the All / Open counts dropped by 2.

## Open Question (reviewer)

- Should time logged **today** on a deleted project also be excluded from "Logged today"? This plan keeps it, for parity with the Time Logs page. If excluded, filter `activityLogs` by `deletedProjectIds` before the hours pass.

## Compatibility Touchpoints

- None. Server-side loader only; no API, type-export, docs or packaging changes. `DevDashboardData` shape is unchanged.

## Implementation Notes

### What Changed
- The project lookup now selects `status`. A `deletedProjectIds` set is built from it, and task/ticket rows belonging to those projects are dropped before `pushItem`. As a result, `items`, `openCountByProject` and every client-derived panel exclude deleted work.
- The `projects` summary (Recently worked on, Heaviest workload) skips deleted projects.
- Today's logged hours are deliberately left unfiltered, per the plan's default. Deleted projects stay in `projectRows` so `hoursTodayByProject` names still resolve. Code comments explain both choices.

### Files Changed
- `src/app/(hub)/dashboard/_dev/_load-dev-dashboard.ts`: deleted-project filter (raw rows renamed to `allTaskRows` / `allIssueRows`; the filtered `taskRows` / `issueRows` keep their names, so downstream code is untouched).

### Deviations From Plan
- None. Optional step 6 (skipping the customer lookup for deleted-only customers) was not done.

### Verification Run
- `npx tsc --noEmit`: PASS (no output)
- `npx eslint src/app/(hub)/dashboard/_dev/_load-dev-dashboard.ts`: PASS (no output)
- Browser acceptance check: SKIPPED (left for the `test` stage)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. One file changed, as planned. No dead code, no `any`, no debug logging.
- Naming is clear: the unfiltered rows are `allTaskRows` / `allIssueRows`, and the filtered `taskRows` / `issueRows` keep their names, so every downstream use (`pushItem`, open counts, per-project activity) picks up the filter without further edits.
- `deletedProjectIds` is built once and reused for tasks, tickets and project summaries, so there is no repeated predicate.
- The comments explain the two non-obvious choices: filtering in JS instead of `.neq()`, and hours left unfiltered. They match the file's existing comment density.
- RLS-respecting `createClient()` is unchanged, with no `adminClient`.

### Deviations
- Minor: `ProjectRow.status` is typed `string`, not the `projects.status` union from `src/types/database.ts`. It's only compared against the literal `"deleted"`, and the file's other row types are hand-written the same way. Acceptable.
- Minor: deleted-project rows still count toward `WORK_LIMIT` (500) before filtering. This only matters for a developer with hundreds of recent items on deleted projects, and the effect is that fewer live items show, never wrong ones. Acceptable.
- Minor: optional step 6 (customer lookup trimming) was not done. It has no visible effect.

### Required Fixes
- None.
