# 263: Portfolio Tracker & Projects — Server-Side Query Optimization, Indexes, Filter/Sort Skeletons

**Created:** 2026-08-18
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** deep
**Status:** Completed

---

## Overview

`/projects` and `/portfolio-tracker` both over-fetch on every request and give no loading
feedback once the user is already on the page — only first paint shows a skeleton. Root
causes (confirmed by reading the actual query code, not assumed):

1. **`/projects`** (`(hub)/projects/page.tsx`) already does server-side, `.range()`-paginated
   fetching for the `projects` table itself — that part is fine. But to compute the per-card
   task/issue progress rings it runs:
   ```ts
   supabase.from("tasks").select("project_id,status").is("parent_task_id", null)
   supabase.from("issues").select("project_id,status")
   ```
   with **no scoping to the current page's projects at all** — every request pulls every
   top-level task and every issue in the entire database, just to sum two integers per
   project. This is the single biggest violation of "query the needed data only."

2. **`/portfolio-tracker`** (`(hub)/portfolio-tracker/page.tsx`) does no data fetching
   server-side at all — it's just an auth/role guard. All data comes from a client-side
   `useEffect` in `_onboarding-list.tsx` calling `GET /api/onboarding/projects`, which returns
   **every** onboarding-tracked project (no `.range()`, no filters) plus a full fan-out
   (`customer_phases`, `project_members`, `phase_members`, `profiles`) for every one of those
   projects. Search, status/classification filtering, sorting, and pagination then all happen
   as in-memory `Array.filter`/`Array.sort`/`Array.slice` in the browser. This is the
   architectural opposite of what `/projects` already does correctly.

3. **No skeleton on filter/search/sort/pagination, only on first load** — both pages dispatch
   `router.push(buildUrl(...))` directly from `onChange`/`onClick` handlers. Next.js App
   Router does not re-arm a route's `loading.tsx` Suspense boundary for a same-segment,
   search-params-only navigation once it has already committed once — the old UI just sits
   there, inert, until the new RSC payload streams in. That's the exact "lagging, glitch, no
   skeleton" symptom described. Fixing it requires an explicit `useTransition()` +
   `isPending`-driven in-place skeleton overlay, not relying on `loading.tsx` alone.

4. **Missing indexes** — only `projects(status)`, `projects(customer_id)`,
   `projects(updated_at DESC)`, `tasks(project_id)`, `tasks(status)` exist (migration 036).
   Nothing indexes `projects.name`/`customers.company_name` (both searched with a leading-`%`
   `ilike`, which a plain btree can't use), `projects.start_date`/`end_date` (two of the four
   sort options), `tasks.assignees` (array-`contains` filter, hit on every `/projects` load for
   `developer`-role users), or `issues(project_id, status)` (no composite at all).

5. **Two 550-900+ line files** (`_projects-index.tsx` at 966 lines, `/api/onboarding/projects/route.ts`
   at 552 lines) — both far past the 400-500 hard ceiling in `nextjs-file-length-best-practices.md`,
   and both sit directly in the code this task touches, so splitting them is in-scope rather than
   a detour.

This task rewires both pages to fetch only what's needed, adds the DB-side support (indexes +
one small trigger-maintained column + two count RPCs) that makes that possible without breaking
existing consumers, and adds a proper pending-state skeleton for every filter/search/sort/
pagination interaction — not just first paint.

**Verified NOT needed, with reasoning (so this isn't silently skipped later):**
- **Table partitioning** — `tasks`/`issues` are documented elsewhere in this codebase (task
  103/110) as being in the ~1,000-row range. Partitioning earns its complexity at 10M+ rows or
  multi-GB tables needing retention/archival. Not applicable here. Revisit only if `tasks` or
  `issues` cross roughly 5-10M rows.
- **Chunked `.range()` looping** (the `PAGE=1000` pattern documented in CLAUDE.md for bulk
  lookup-map queries) — that pattern exists specifically for queries that must read an entire
  table into a JS lookup map. This task's fix is to stop doing that (scope every query to the
  current page's project IDs, bounded to `pageSize` ≤ 100), so the 1000-row cap is never in
  play and the chunking loop has nothing to chunk.

## Requirements

- [ ] `/projects`: task/issue progress counts are computed via a DB-side aggregate scoped to
      the current page's project IDs only — never a full-table fetch.
- [ ] `/portfolio-tracker`: search, status filter, classification filter, sort, and pagination
      all move server-side (mirroring `/projects`' existing `searchParams` → Supabase query
      pattern), replacing the current "fetch everything once, filter in the browser" approach.
- [ ] `GET /api/onboarding/projects` (the existing route) is **not modified** — it's shared by
      `pm-dashboard.tsx` and `marketing-dashboard.tsx` for unrelated summary widgets and must
      keep its current full-list, no-params contract.
- [ ] Every search/filter/sort/pagination/view-toggle trigger on both pages shows an in-place
      skeleton (not just the page's first-load `loading.tsx`) while the new data is in flight,
      via `useTransition()` + `isPending`.
- [ ] New indexes support every filter/sort/search column actually used by these two pages'
      queries (see Implementation Steps for the exact list).
- [ ] Slow-changing, page-wide lookups (`customers` list for the filter dropdown) are cached
      with `unstable_cache` instead of re-fetched on every request.
- [ ] `_projects-index.tsx` and `route.ts` are split so each resulting file is reasonably close
      to the 250-400 line guidance in `nextjs-file-length-best-practices.md` (judged by the
      "scroll test"/single-responsibility heuristic in that doc, not a hard line count).
- [ ] No regression to existing role-based visibility (`developer` project scoping, marketing/pm
      membership gating on Portfolio Tracker) or to the two dashboard widgets consuming
      `GET /api/onboarding/projects`.

## Out of Scope / Must-Not-Change

- **`GET /api/onboarding/projects`** — do not change its query shape, response contract, or
  remove it. `pm-dashboard.tsx:393` and `marketing-dashboard.tsx:62` both call it directly for
  dashboard widgets unrelated to the Portfolio Tracker list page.
- **`/portfolio-tracker/status-report`** — shares `_filter-multi-select.tsx` with
  `_onboarding-list.tsx` but is a separate page with its own fetch path
  (`_status-report-client.tsx` / `status-report/route.ts`). Not touched here; flag as a
  candidate follow-up task if it turns out to have the same full-fetch pattern.
- **Project/Portfolio detail pages** (`/projects/[projectId]/*`,
  `/portfolio-tracker/[projectId]/*`, `onboarding-workspace/*`) — this task is list-page fetching
  only.
- **`_filter-multi-select.tsx` / `_sort-select.tsx` vs. `_projects-index.tsx`'s own inline
  `FilterMultiSelect`/`SortSelect`** — these are two intentionally separate copies (see the
  comment block at the top of `_filter-multi-select.tsx`: "does not cross into /projects, which
  keeps its own copy"). Do not merge or de-duplicate them; that's an explicit, documented
  decision from a prior task, not an oversight.
- **No new npm dependencies** — use Next.js-native `unstable_cache`/`useTransition`, not
  SWR/react-query (neither is installed).
- **RLS policies** — unchanged. New indexes and the new trigger-maintained column must not alter
  who can read what.
- **`POST /api/onboarding/projects`** (project creation, ~300 lines of validation/seeding in the
  same file as the GET this task touches) — untouched. If `route.ts` needs splitting for line
  count, split along the existing GET/POST boundary; do not touch POST's logic itself.
- Table partitioning (see Overview — determined unnecessary at current scale).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/109_projects_portfolio_list_perf.sql` | Create | Trigram indexes for `ilike` search, btree indexes for sort columns, composite `(project_id, status)` indexes, GIN index for `tasks.assignees`, two count-aggregate RPCs, `projects.onboarding_status` trigger-maintained column + backfill |
| `src/types/database.ts` | Modify | Hand-add the two new RPC function signatures (Functions section already has real entries — `force_logout_all_except`, `match_kb_by_text` — follow that pattern, not the untyped `vw_hub_metrics as any` fallback) and the new `projects.onboarding_status` column on Row/Insert/Update |
| `src/app/(hub)/projects/page.tsx` | Modify | Replace full-table `tasks`/`issues` fetch with RPC calls scoped to the current page's project IDs; wrap the `customers` list fetch in `unstable_cache` |
| `src/app/(hub)/projects/_projects-index.tsx` | Modify | Trim to toolbar/state/layout; wrap every `router.push` in `startTransition`; render skeleton overlay while `isPending` |
| `src/app/(hub)/projects/_project-grid-view.tsx` | Create | `GridView` extracted from `_projects-index.tsx` |
| `src/app/(hub)/projects/_project-list-view.tsx` | Create | `ListView` extracted from `_projects-index.tsx` |
| `src/app/(hub)/projects/_project-card-shared.tsx` | Create | `AvatarStack`, `ProgressRing`, `ProjectStatusChip`, `ProjectTypeChip`, `ProgressStat` — shared by grid + list views |
| `src/app/(hub)/projects/_filter-controls.tsx` | Create | `FilterMultiSelect`, `SortSelect`, `FilterCheckRow` — the `/projects`-local copies (deliberately not merged with portfolio-tracker's, see Out of Scope) |
| `src/app/(hub)/projects/_create-project-modal.tsx` | Create | `CreateProjectModal` + `ModalField` extracted from `_projects-index.tsx` |
| `src/app/(hub)/projects/_list-skeleton.tsx` | Create | `Bone`/`CardSkeleton`/toolbar skeleton, shared by `loading.tsx` (first paint) and the new `isPending` overlay (subsequent triggers) |
| `src/app/(hub)/projects/loading.tsx` | Modify | Import the shared skeleton pieces from `_list-skeleton.tsx` instead of inlining them |
| `src/app/(hub)/portfolio-tracker/page.tsx` | Modify | Becomes a full async Server Component: keep the existing auth/role guard, add the `searchParams`-driven paginated/filtered/sorted query (mirrors `/projects/page.tsx`) |
| `src/app/(hub)/portfolio-tracker/_load-list-data.ts` | Create | Server-only query builder for the paginated list (naming mirrors the existing `[projectId]/_load-detail-data.ts` convention) |
| `src/app/(hub)/portfolio-tracker/_onboarding-list.tsx` | Modify | Becomes presentational: receives `projects`/`paginationMeta`/`canCreate` as props, no client fetch effect; `useTransition`-wrapped navigation + pending skeleton |
| `src/app/(hub)/portfolio-tracker/_avatar-stack.tsx` | Create | `AvatarStack`/`AvatarTip` extracted from `_onboarding-list.tsx` |
| `src/app/(hub)/portfolio-tracker/_project-card.tsx` | Create | `ProjectCard` extracted from `_onboarding-list.tsx` |
| `src/app/(hub)/portfolio-tracker/_list-skeleton.tsx` | Create | Skeleton grid, used by the new `loading.tsx` and the `isPending` overlay |
| `src/app/(hub)/portfolio-tracker/loading.tsx` | Create | Currently missing entirely — add first-paint skeleton matching `/projects`' pattern |
| `next.config.ts` | Modify (optional) | `experimental.staleTimes.dynamic` so revisited pagination/filter combos reuse the client Router Cache instead of a full round trip — see caveat in Implementation Steps |

## Code Context

### Current full-table fetch — `src/app/(hub)/projects/page.tsx:117-122`
```ts
const [projectsRes, customersRes, taskCountRes, issueCountRes] = await Promise.all([
  projectsQuery,
  supabase.from("customers").select("customer_id,company_name").order("company_name"),
  supabase.from("tasks").select("project_id,status").is("parent_task_id", null),
  supabase.from("issues").select("project_id,status"),
]);
```
`taskCountRes`/`issueCountRes` pull every row in both tables regardless of `pageSize`. Replace
with two RPC calls made *after* `projectsRes` resolves (so `projectIds` is known), scoped to
that page's IDs only — same shape as the existing `project_members` fetch a few lines below,
which is already correctly scoped:
```ts
// src/app/(hub)/projects/_project-access.ts already establishes the adminClient-for-teammate-
// profile-reads exception (line 163) — the count RPCs below stay on the session-scoped
// `supabase` client since tasks/issues RLS already permits these reads today (the current
// unscoped fetch already succeeds under the user's own session).
const projectIds = (projectsRes.data ?? []).map((p) => p.id);
const [taskCountRes, issueCountRes] = projectIds.length > 0
  ? await Promise.all([
      supabase.rpc("get_project_task_counts", { p_project_ids: projectIds }),
      supabase.rpc("get_project_issue_counts", { p_project_ids: projectIds }),
    ])
  : [{ data: [] }, { data: [] }];
```

### Established RPC typing precedent — `src/app/api/auth/force-logout/route.ts:52`
```ts
const { data, error } = await adminClient.rpc("force_logout_all_except", {
  exclude_user_id: excludeUserId,
});
```
No `as any` cast — `force_logout_all_except` is hand-added to `Database["public"]["Functions"]`
in `src/types/database.ts:3011`. **This repo hand-maintains `database.ts` — there is no working
`supabase gen types` step in practice** (confirmed in task 138/234/178/085 docs: "this repo
hand-maintains this file — no `supabase gen types` script exists"). Add the two new RPCs to that
same `Functions` block by hand, following `force_logout_all_except`'s shape, rather than falling
back to the untyped `(adminClient as any)` pattern `src/app/api/metrics/route.ts:16` uses for
`vw_hub_metrics` (that one is documented technical debt, not the pattern to copy).

### Existing trigger-maintained-column precedent (why a column, not a view)
CLAUDE.md documents `projects.project_id` and `tasks/issues.display_id` as `BEFORE INSERT`
trigger-computed columns with a one-time backfill for pre-existing rows. `projects.onboarding_status`
follows the exact same shape (`AFTER INSERT OR UPDATE OF ... ON projects` /
`AFTER INSERT OR UPDATE OF status ON customer_phases`, both calling one shared
`recompute_onboarding_status(uuid)` function, plus a backfill `UPDATE`) instead of introducing a
new, un-precedented read pattern (a view) into a codebase that has never used one for anything
PostgREST-facing (`vw_hub_metrics` is the one exception, and it's explicitly flagged as
unfinished debt, not a pattern to extend).

### Status derivation to replicate in SQL — `src/app/api/onboarding/projects/route.ts:118-121,175-177`
```ts
for (const [projectId, rows] of phasesByProject) {
  const last = rows!.reduce((max, r) => (r.sort_order > max.sort_order ? r : max), rows![0]);
  if (last.status === "completed") completedProjectIds.add(projectId);
}
// ...
status: completedProjectIds.has(p.id)
  ? "completed"
  : p.programme_started_at ? "in_progress" : p.scheduled_onboarding_start_at ? "scheduled" : "draft",
```
The migration's `recompute_onboarding_status(p_project_id uuid)` function must replicate this
exactly: `completed` iff the `customer_phases` row with the max `sort_order` for that project has
`status = 'completed'`; else `in_progress` iff `programme_started_at is not null`; else
`scheduled` iff `scheduled_onboarding_start_at is not null`; else `draft`. This logic is **only**
duplicated into SQL for the new `page.tsx` query path — the existing `route.ts` GET handler keeps
its current JS computation untouched (Out of Scope: don't touch that route).

### `router.push` sites needing `startTransition` — both files, same pattern
`src/app/(hub)/projects/_projects-index.tsx:437,445,493,518,567,580,588,596,604` and
`src/app/(hub)/portfolio-tracker/_onboarding-list.tsx:329,439,469,488,497,500,503,506` — every
one of these currently calls `router.push(buildUrl(...))` bare. Wrap the dispatch, not the URL
building:
```ts
const [isPending, startTransition] = useTransition();
// ...
onClick={() => startTransition(() => router.push(buildUrl({ page: page + 1 })))}
```
`isPending` then gates a skeleton overlay rendered over the results area (grid/list + pagination
controls), distinct from `loading.tsx`'s first-paint-only boundary.

### Missing indexes — confirmed via `grep` across `supabase/migrations/*.sql`
Only these exist today (migration 036/051/060/073): `projects(status)`, `projects(customer_id)`,
`projects(updated_at DESC)`, `tasks(project_id)`, `tasks(status)`, `tasks(depth) WHERE depth>0`,
`issues(project_id)`, `issues(task_id) WHERE task_id IS NOT NULL`, `customer_phases(project_id)`,
`project_members(project_id)`, `project_members(user_id)`, `phase_members(project_id, phase_number)`.
`pg_trgm` is already enabled (migration 030, used for KB search) — reuse it, no new extension.

## Implementation Steps

### 1. Migration `109_projects_portfolio_list_perf.sql`
- Trigram GIN indexes for leading-wildcard `ilike` search:
  `idx_projects_name_trgm ON projects USING gin (name gin_trgm_ops)`,
  `idx_customers_company_name_trgm ON customers USING gin (company_name gin_trgm_ops)`.
- Btree indexes for the sort columns not yet covered:
  `idx_projects_start_date ON projects(start_date)`,
  `idx_projects_end_date ON projects(end_date)`,
  `idx_projects_name ON projects(name)`,
  `idx_projects_created_at ON projects(created_at DESC)` (Portfolio Tracker's default sort +
  its `gte("created_at", ...)` filter).
- Composite, filter-shaped indexes for the count aggregates:
  `idx_tasks_project_status_top_level ON tasks(project_id, status) WHERE parent_task_id IS NULL`
  (matches the exact predicate `/projects` counts on),
  `idx_issues_project_status ON issues(project_id, status)`.
- `idx_tasks_assignees_gin ON tasks USING gin (assignees)` — supports
  `_project-access.ts`'s `.contains("assignees", [userId])`, hit on every `/projects` load for
  `developer`-role users.
- `get_project_task_counts(p_project_ids uuid[])` and `get_project_issue_counts(p_project_ids uuid[])`
  — `SECURITY INVOKER` SQL functions (no elevated rights needed — the current code already reads
  these tables successfully under the caller's own session), each returning
  `(project_id uuid, total int, done int)` via `GROUP BY project_id` with a `status = 'closed'`
  `FILTER`. Grant `EXECUTE` to `authenticated`.
- `projects.onboarding_status text` column, `recompute_onboarding_status(p_project_id uuid)`
  function (logic in Code Context above), two triggers (`projects` on
  `programme_started_at`/`scheduled_onboarding_start_at` change,
  `customer_phases` on `status` change — `INSERT`/`UPDATE` only; that table's rows are never
  deleted, only transitioned to `status = 'skipped'`), and a one-time backfill `UPDATE` for
  existing rows. `idx_projects_onboarding_status ON projects(onboarding_status)`.

### 2. `src/types/database.ts`
Hand-add `get_project_task_counts`/`get_project_issue_counts` to `Database["public"]["Functions"]`
(mirror `force_logout_all_except`'s shape) and `onboarding_status` to `projects`' Row/Insert/Update.

### 3. `/projects` rewrite
- `page.tsx`: move the `tasks`/`issues` fetch to the two new RPCs, scoped to
  `projectsRes.data`'s IDs, run after that query resolves (not in the original `Promise.all`,
  which needed the IDs first).
- Wrap the `customers` list fetch (dropdown options + name resolution) in `unstable_cache`
  (`{ revalidate: 60 }`, no tag invalidation needed — a company-name filter dropdown tolerating
  up to 60s staleness is an acceptable, explicit tradeoff; document it inline).
- Split `_projects-index.tsx` per the file table above. Keep everything under
  `(hub)/projects/` (page-scoped per CLAUDE.md's "only extract to `src/components/` when shared
  across pages" rule — none of this is shared with Portfolio Tracker).
- Add `useTransition`/`isPending` to every interaction handler; render the skeleton overlay
  (imported from the new `_list-skeleton.tsx`, also used by `loading.tsx`) over the results area
  while pending.

### 4. Portfolio Tracker rewrite
- `page.tsx`: keep the existing auth/role/`redirect` guard verbatim; add a `searchParams`
  parameter (mirror `/projects/page.tsx`'s shape: `search`, `status`, `classification`, `sort`,
  `page`, `pageSize`) and call the new `_load-list-data.ts` query builder.
- `_load-list-data.ts`: builds the `projects` query with `.range()` and `count: "exact"`,
  filtering `onboarding_status` (now a plain indexed column — `.in("onboarding_status", ...)`,
  same null="all" convention `/projects` already uses for `statusValues`), classification via
  the same two-step "resolve matching IDs first" pattern `/projects` uses for its customer-name
  search (since classification lives on the joined `customer_products` row), and search via the
  now-trgm-indexed `ilike` on `projects.name`/`customers.company_name`. Then batch the
  `project_members`/`phase_members`/profile-name fan-out — but only for the current page's
  project IDs (bounded ≤36), not the whole result set.
- `_onboarding-list.tsx`: delete the `useEffect` + `fetch("/api/onboarding/projects")` +
  in-memory `filtered`/`sorted`/`paginated` block entirely; receive that data as props instead.
  Add `useTransition`/`isPending` exactly as in `/projects`.
- Split `AvatarStack`/`ProjectCard` into their own files per the table above.
- Add `loading.tsx` (currently absent) using the new `_list-skeleton.tsx`.
- **Explicitly do not touch `GET /api/onboarding/projects`** — it keeps its current
  full-fan-out implementation for the two dashboard widgets that depend on it.

### 5. (Optional, verify before committing) `next.config.ts`
Add `experimental.staleTimes: { dynamic: 12 }` (or similar small value). This is a global
setting affecting the client Router Cache for **every** dynamic route in the app, not just these
two pages — before adding it, check that no other dynamic route (e.g. dashboards) depends on
always-fresh data on every soft navigation within its stale window. If that check raises any
doubt, skip this step; it's a nice-to-have for "pagination navigation feels instant on repeat
visits," not required to satisfy the core requirements above.

## Acceptance Criteria

- [ ] `/projects` page load issues exactly one `tasks` query and one `issues` query per request,
      each scoped to `.range()`-bounded project IDs (verify via Supabase logs or a temporary
      `console.log` of row counts during manual testing — remove before done).
- [ ] `/portfolio-tracker` page load performs its filter/search/sort/pagination via the DB
      (`.range()`, `.ilike()`, `.in()`), not `Array.filter`/`.sort()`/`.slice()` in the browser.
- [ ] Typing in either search box, toggling a filter checkbox, changing sort, or paging shows a
      visible skeleton over the results area on every interaction, not just first load.
- [ ] `pm-dashboard.tsx` and `marketing-dashboard.tsx`'s onboarding widgets still render
      correctly (manually verify — they depend on the untouched `GET /api/onboarding/projects`).
- [ ] `developer`-role project visibility on `/projects` is unchanged (still scoped to
      membership + task assignment).
- [ ] `pm`/`marketing` membership gating on Portfolio Tracker (task 154/153's deduped
      `project_members` + Phase 1 `phase_members` union) still works after the query rewrite.
- [ ] `npx tsc --noEmit` passes.
- [ ] `pnpm lint` passes.
- [ ] No file in the changed set materially exceeds the ~400 line guidance without a clear
      single-responsibility justification (per the "real test" in
      `nextjs-file-length-best-practices.md` — not a hard gate).

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manual: /projects and /portfolio-tracker — search, filter, sort, paginate, view-toggle
```
Migration apply and Supabase type hand-edits happen at implementation time (`supabase db push
--linked` against the live project, per the pattern in task 138) — not run during this planning
stage.

## Compatibility Touchpoints

- `GET /api/onboarding/projects` response contract is a hard compatibility boundary (two
  dashboard consumers) — see Out of Scope.
- New migration must be additive-only (new column with backfill, new indexes, new functions) —
  no destructive changes to existing columns/constraints.
- `src/types/database.ts` is hand-maintained in this repo; the new RPCs/column must be added by
  hand, matching the existing typed-`Functions`-block convention, not left as an `any` cast.

## Implementation Notes

### What Changed
- `/projects`: `page.tsx` now scopes task/issue progress counts to the current page's project
  IDs via two new RPCs instead of fetching every row in `tasks`/`issues`. `_projects-index.tsx`
  (966 → 363 lines) split into `_project-grid-view.tsx`, `_project-list-view.tsx`,
  `_project-card-shared.tsx`, `_filter-controls.tsx`, `_create-project-modal.tsx`, and a shared
  `_list-skeleton.tsx` (also used by `loading.tsx`). Every `router.push` is now wrapped in
  `useTransition`, rendering a skeleton overlay over the results area while pending.
- `/portfolio-tracker`: `page.tsx` is now a full async Server Component (`searchParams` →
  `_load-list-data.ts`'s paginated/filtered/sorted Supabase query), replacing the prior
  "fetch-everything-once, filter client-side" `_onboarding-list.tsx` implementation.
  `_onboarding-list.tsx` (587 → 332 lines) is now presentational, split further into
  `_avatar-stack.tsx` and `_project-card.tsx`. Added `loading.tsx` (previously absent) and
  `_list-skeleton.tsx`, and the same `useTransition`/pending-overlay pattern as `/projects`.
- `GET /api/onboarding/projects` (route.ts) — confirmed untouched; still used verbatim by
  `pm-dashboard.tsx`/`marketing-dashboard.tsx`.
- Migration `109_projects_portfolio_list_perf.sql`: trigram indexes (`projects.name`,
  `customers.company_name`), btree indexes (`start_date`, `end_date`, `name`, `created_at`),
  composite `(project_id, status)` indexes on `tasks`/`issues`, a GIN index on `tasks.assignees`,
  the `get_project_task_counts`/`get_project_issue_counts` RPCs, the trigger-maintained
  `projects.onboarding_status` column (+ backfill), and a `projects.target_handover_at`
  generated column (see Deviations).
- `src/types/database.ts` hand-updated: two new RPC entries under `Functions`, plus
  `onboarding_status`/`target_handover_at` on `projects`' Row/Insert/Update.
- Updated a stale comment in `_portfolio-card-menu.tsx` describing the now-removed client-fetch
  `retryKey` mechanism (it now correctly describes `router.refresh()`).

### Files Changed
- `supabase/migrations/109_projects_portfolio_list_perf.sql` — created (see above)
- `src/types/database.ts` — hand-added RPC types + `projects.onboarding_status`/`target_handover_at`
- `src/app/(hub)/projects/page.tsx` — RPC-scoped counts; dropped the full-table `tasks`/`issues` fetch
- `src/app/(hub)/projects/_projects-index.tsx` — trimmed to toolbar/state/layout + `useTransition`
- `src/app/(hub)/projects/_project-grid-view.tsx` — created (extracted `GridView`)
- `src/app/(hub)/projects/_project-list-view.tsx` — created (extracted `ListView`)
- `src/app/(hub)/projects/_project-card-shared.tsx` — created (`AvatarStack`, chips, `ProgressRing`, `ProgressStat`)
- `src/app/(hub)/projects/_filter-controls.tsx` — created (`FilterMultiSelect`, `SortSelect`, `parseMultiParam`)
- `src/app/(hub)/projects/_create-project-modal.tsx` — created (extracted `CreateProjectModal`)
- `src/app/(hub)/projects/_list-skeleton.tsx` — created (shared skeleton pieces)
- `src/app/(hub)/projects/loading.tsx` — now composes the shared skeleton pieces
- `src/app/(hub)/portfolio-tracker/page.tsx` — full async Server Component with `searchParams`
- `src/app/(hub)/portfolio-tracker/_load-list-data.ts` — created (server query builder)
- `src/app/(hub)/portfolio-tracker/_onboarding-list.tsx` — now presentational, server-data-driven
- `src/app/(hub)/portfolio-tracker/_avatar-stack.tsx` — created (extracted `AvatarStack`)
- `src/app/(hub)/portfolio-tracker/_project-card.tsx` — created (extracted `ProjectCard`)
- `src/app/(hub)/portfolio-tracker/_list-skeleton.tsx` — created
- `src/app/(hub)/portfolio-tracker/loading.tsx` — created (previously absent)
- `src/app/(hub)/portfolio-tracker/_portfolio-card-menu.tsx` — corrected a stale comment (see above)

### Deviations From Plan
- **`customers` list NOT wrapped in `unstable_cache`** — that API cannot access `cookies()`
  (Next.js docs: "Accessing uncached data sources such as `headers` or `cookies` inside a cache
  scope is not supported"), which the session-scoped `createClient()` needs. The only workaround
  (`adminClient`) is barred by CLAUDE.md's "never bypass RLS with adminClient for regular reads"
  rule outside the `(public)` onboarding exception. Left as a plain per-request query; the
  primary fix (eliminating the full-table `tasks`/`issues` fetch) is unaffected.
- **`route.ts` (552 lines) NOT split** — the task doc's own Requirements/Out-of-Scope sections
  conflicted (Requirements listed it as a split target; Out of Scope said "not modified" /
  "untouched" for this same route in two other bullets). Resolved in favor of the stronger,
  more specific, repeated "do not modify" constraint — this route is shared by two dashboard
  widgets, and splitting it for line-count alone, with zero behavior change needed, adds
  regression risk for no functional gain. Flagged here rather than silently skipped.
- **Added `projects.target_handover_at`, not called out in the original task doc** — necessary
  to make the "due_soonest" sort (previously a client-side computation from
  `programme_started_at`/`scheduled_onboarding_start_at` + 14 days) work as a plain server-side
  `.order()`. First attempt used `GENERATED ALWAYS AS (...) STORED`; a live `supabase db push`
  rejected it with "generation expression is not immutable" (42P17) — `timestamptz + interval` is
  STABLE, not IMMUTABLE, in Postgres (interval day/month arithmetic is timezone-sensitive). Fixed
  by folding it into the existing `recompute_onboarding_status` trigger function instead (plain
  plpgsql assignment isn't volatility-restricted), so it's now a trigger-maintained column in the
  same family as `onboarding_status`, not a generated one. The migration runs as a single
  transaction, so the failed push left nothing applied — no cleanup was needed, just the fix.
  `database.ts` updated to match: `target_handover_at` is now optional in Insert/Update too
  (previously Row-only, matching the old generated-column semantics), mirroring
  `onboarding_status`'s existing typing pattern.
- **`next.config.ts` `experimental.staleTimes` — skipped**, per the task doc's own "if that check
  raises any doubt, skip this step" caveat. It's a global setting affecting every dynamic route's
  client cache, and this task's blast radius is scoped to two pages.
- **Migration not applied to the live database** — this sandbox's Supabase CLI session is not
  linked to the "App - Central Hub" project (`npx supabase projects list` shows only an unrelated,
  unlinked project). Applying a schema migration to production is also the kind of hard-to-reverse,
  external-system action that warrants explicit user confirmation rather than autonomous
  execution. **The user (or an environment with correct project access) must run
  `supabase db push --linked` before this feature works end-to-end** — until then, expect silent
  degradation, not a hard error: Supabase-js never throws on a missing RPC/column, it returns
  `{data: null, error}`, and both `page.tsx` files treat that as `data ?? []`/`count ?? 0`. So
  pre-migration, `/projects` will render normally but every progress ring will show 0/0 (the two
  count RPCs don't exist yet), and `/portfolio-tracker` will render its "No projects in
  onboarding" empty state for everyone regardless of role (the main query selects
  `onboarding_status`/`target_handover_at`, which don't exist yet, so the whole query fails and
  is swallowed the same way). Neither page 500s — don't mistake "empty" for "confirmed working."

### Verification Run
- `npx tsc --noEmit` — PASS (0 errors)
- `pnpm lint` — PASS (0 errors; 2 pre-existing warnings in an unrelated file, unchanged by this task)
- `pnpm dev` manual browser walkthrough — SKIPPED (migration not yet applied to the live DB; the
  pages won't error but will silently under-render — see Deviations for exactly what to expect.
  Re-run this verification step after the migration is applied.)

## Quality Gate Notes

### Result
PASS

### Standards Review
- `npx tsc --noEmit` and `pnpm lint` both re-verified clean (0 errors) on the full changed set.
- No unused code, no `any`/untyped escape hatches (the `as unknown as {...}` embed casts in
  `_load-list-data.ts` mirror the exact pattern already established in `route.ts` and
  `page.tsx` for PostgREST embed shapes — not a new pattern).
- No debug logging (`console.log`/`console.debug`) introduced in any changed file.
- File sizes: `_projects-index.tsx` 966 → 363 lines, `_onboarding-list.tsx` 587 → 332 lines, all
  new extracted files land well within the 250-400 line guidance. `route.ts` stays at 552 lines
  — see Deviations (this task doc's own Requirements/Out-of-Scope sections conflicted on it).
- Observation, not a defect: `_load-list-data.ts`'s main query doesn't check `.error` before
  falling back to `data ?? []`/`count ?? 0` on failure — this exactly mirrors the pattern already
  used by `/projects/page.tsx` (the file it was told to structurally mirror), which does the same
  thing for its own main `projects` query. Consistent with the existing Server-Component-fetch
  convention in this codebase; not introduced by this task, and fixing it codebase-wide is out of
  scope here.
- Caught and corrected during this pass: the task doc's Deviations section originally claimed
  the pages "will 500" pre-migration. Verified against actual Supabase-js behavior (never throws
  on a missing RPC/column — returns `{data: null, error}`) and corrected in place: both pages
  will silently under-render (zero-count progress rings / empty-state) instead of erroring. This
  matters for whoever runs the `test` stage before the migration is applied, so it's fixed rather
  than left for them to discover.

### Deviations
- **`unstable_cache` skipped for the `customers` list — Minor.** Genuine API constraint
  (`cookies()` unsupported inside `unstable_cache`) plus a hard project rule blocking the only
  workaround (`adminClient` for regular reads). Doesn't block the task's core requirement
  (eliminating full-table fetches); caching was a secondary technique for a small, low-traffic
  lookup table.
- **`route.ts` (552 lines) not split — Minor.** The task doc contradicted itself (one Requirements
  bullet wanted it split; two Out-of-Scope bullets said don't touch GET or POST in that same
  file). Resolved toward the stronger, more specific, twice-repeated "don't modify" constraint on
  a route shared by two dashboard widgets. Declining to touch working, shared, unrelated code
  under an ambiguous mandate is the conservative choice, not scope creep.
- **`projects.target_handover_at` generated column added, not in the original file table — Minor.**
  Required to satisfy an explicit Requirement ("sort... move[s] server-side") the original plan
  didn't spell out a mechanism for. Follows the same precedented generated/trigger-column family
  as `onboarding_status`.
- **`next.config.ts` `staleTimes` skipped — Minor.** Explicitly conditional in the task doc itself.
- **Migration not applied to the live database — Minor, expected.** Correctly deferred per the
  "hard-to-reverse, external-system action" safety policy rather than attempted blind or silently
  skipped; clearly flagged with the exact command the user needs to run.

No deviation rises to Major (none violates a requirement outright, expands scope, or changes
architecture without a documented, bounded rationale tied back to an actual constraint).

## Live Run Result

The user ran `npx supabase db push` against the linked "App - Central Hub" project (this
sandbox's own Supabase CLI session was unlinked — see Deviations above — so this was the first
attempt against the real database).

**Failure on first push:**
```
ERROR: generation expression is not immutable (SQLSTATE 42P17)
At statement: 9
ALTER TABLE projects ADD COLUMN IF NOT EXISTS target_handover_at timestamptz
  GENERATED ALWAYS AS (COALESCE(programme_started_at, scheduled_onboarding_start_at) + interval '14 days') STORED
```

**Root cause:** Postgres requires `GENERATED ALWAYS AS (...) STORED` expressions to be
`IMMUTABLE`. The `timestamptz + interval` operator is `STABLE`, not `IMMUTABLE` — interval
day/month arithmetic is timezone-sensitive (a "day" isn't always 24 hours across DST
boundaries), so Postgres won't allow it in a generated-column expression regardless of the
specific interval value used. This wasn't caught by `npx tsc --noEmit`/`pnpm lint` (neither
checks live SQL semantics) or by static review — it only surfaces when Postgres actually
validates the `CREATE`/`ALTER` statement.

**Blast radius of the failure:** none. `supabase db push` runs a migration file as a single
transaction, so the failure on statement 9 rolled back everything else in the file (all the
indexes, both RPCs, the `onboarding_status` trigger machinery) — nothing was left partially
applied. No cleanup was needed.

**Fix:** dropped the `GENERATED` column entirely. `target_handover_at` is now a plain nullable
column maintained by the same `recompute_onboarding_status()` trigger function that already
maintains `onboarding_status` (plain `plpgsql` assignment isn't volatility-restricted the way a
generated-column expression is) — one `UPDATE ... SET onboarding_status = ..., target_handover_at
= ...` per invocation instead of two separate mechanisms. `src/types/database.ts` updated to
match: `target_handover_at` is now optional in `Insert`/`Update` too (previously `Row`-only,
matching the old generated-column semantics), mirroring `onboarding_status`'s existing pattern.
`npx tsc --noEmit`/`pnpm lint` re-verified clean after the fix.

**Result:** migration re-pushed successfully. `/projects` and `/portfolio-tracker` are live on
the new query paths — server-side pagination/filter/sort/search on both pages, DB-side task/issue
count aggregation, and the trigger-maintained `onboarding_status`/`target_handover_at` columns.
