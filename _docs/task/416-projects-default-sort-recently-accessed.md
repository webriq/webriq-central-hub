# 416: Projects Listing — "Recently accessed" Sort, Default on Every Classification Tab

**Created:** 2026-10-02
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

Request: *"Default the sorting of the project from the most accessed/recently accessed projects first to not most. Add this as a new filter and make it the default filter when accessing the projects on any classifications."*

Interpretation (confirm at review): add a new **"Recently accessed"** option to the listing's **Sort** control (the existing pill `<select>`, not the Status multi-select) that orders projects by when the **current user** last opened them — most recent first, never-opened projects last — and make it the **default** on every `/projects/v2?tab=<classification>` tab. "Newest first" and the other sorts stay available as explicit choices.

### Key finding: no access tracking exists today

A repo-wide search (`last_accessed`, `last_viewed`, `project_views`, …) finds nothing. The listing sort map (`SORT_MAP` in `_v2-listing/_load-list-data.ts`) only knows `newest|oldest|name_asc|name_desc|due_soonest`, all column-based on `projects`. So this task has two halves: **record** project opens, then **sort** by them. That is why the tier is `deep` (migration + new write path + a sort PostgREST cannot express directly).

## Requirements

**Tracking**
- [ ] New per-user table `project_views` (migration **156**, *written, not applied* per repo convention): `user_id uuid → auth.users`, `project_id uuid → projects(id) on delete cascade`, `last_accessed_at timestamptz not null default now()`, `access_count int not null default 1`, primary key `(user_id, project_id)`. RLS: a user can select/insert/update **only their own rows** (`user_id = auth.uid()`); no cross-user visibility. Index on `(user_id, last_accessed_at desc)`.
- [ ] Recording is an upsert via a small `security invoker` RPC `record_project_view(p_project_id uuid)` (sets `last_accessed_at = now()`, `access_count = access_count + 1`) called from a new `POST /api/v2/projects/[projectId]/view` route (resolves the display `project_id` → UUID like sibling routes; 404/204 semantics; deleted projects are not recorded).
- [ ] The call is fired fire-and-forget from a tiny client component mounted once in `projects/v2/[projectId]/layout.tsx` (task 414/415 layout persists across tab navigation, so one open = one record, not one per tab click). Not done during server render (avoids writes on prefetch). Failures are swallowed silently (never block or toast).
- [ ] Throttle: skip the POST if the same project was recorded in this browser session within the last few minutes (sessionStorage, wrapped in try/catch) so reload/back-forward doesn't inflate `access_count`.
- [ ] Not recorded for the deleted-project landing view (task 415) or when the layout 404s.

**Sorting**
- [ ] New sort value `recent` ("Recently accessed") ordering by the current user's `last_accessed_at` desc; projects with no row sort **after** all opened ones, themselves ordered `created_at` desc (same as "Newest first"). Ties on `last_accessed_at` broken by `access_count` desc then `created_at` desc.
- [ ] `recent` is the **default**: absent `?sort=` ⇒ `recent` on every classification tab (`stackshift-i` … `discrete-development`) and for bare `/projects/v2`. `SortSelect` shows "Recently accessed" selected by default; choosing it removes `sort` from the URL (as "Newest first" does today); choosing **Newest first** now writes `?sort=newest` explicitly.
- [ ] Pagination, search, status filter and "Clear filters" keep working under `recent`; `total` count unchanged; page boundaries stable (no duplicates/missing rows across pages).
- [ ] Degrades safely: if `project_views` doesn't exist yet (migration not applied) or the lookup errors, fall back to `newest` ordering without failing the page (same wrapped-no-op convention as other written-not-applied migrations).
- [ ] Legacy listing (`/projects/legacy`) gets the same option + default (it shares the pattern and `projects` rows). If that proves non-trivial, ship v2 only and note the gap — v2 classification tabs are the stated requirement.
- [ ] Sort preference per tab is not persisted beyond the URL (no localStorage) in this task.

## Out of Scope / Must-Not-Change

- Global/team-wide popularity ("most accessed by everyone") — per-user only; `access_count` is stored for tie-breaks/future use but not shown.
- `/projects/v2/status-report` has its own sort set — untouched.
- Dashboard "recent projects" widgets, search-result ranking, sidebar changes — untouched.
- No change to project permissions/visibility; `project_views` never widens access and is never read cross-user (no admin analytics view).
- Do not add a `last_accessed_at` column to `projects` (would be global, not per-user, and would churn `updated_at`/triggers).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/156_project_views.sql` | Create | Table, RLS, index, `record_project_view()` RPC. **Written, not applied.** |
| `src/types/database.ts` | Modify | Add `project_views` Row/Insert/Update + `record_project_view` function type. |
| `src/app/api/v2/projects/[projectId]/view/route.ts` | Create | `POST` — auth required, resolve project by display id (UUID fallback), skip deleted, call RPC, always cheap `204`. |
| `src/app/(hub)/projects/v2/[projectId]/_record-project-view.tsx` | Create | Client component: on mount, throttled fire-and-forget `fetch(POST)`. |
| `src/app/(hub)/projects/v2/[projectId]/layout.tsx` | Modify | Render `<RecordProjectView projectId=… />` only when the project is not deleted. |
| `src/app/(hub)/projects/_v2-listing/_load-list-data.ts` | Modify | `recent` sort path (see Code Context); default `sort` becomes `"recent"`. |
| `src/app/(hub)/projects/v2/page.tsx` | Modify | `sort: params.sort ?? "recent"`. |
| `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` | Modify | Add `{ value: "recent", label: "Recently accessed" }` as the **first** `SORT_OPTIONS` entry; default `sortValue = "recent"`; URL builder omits `sort` when `recent`; `isFiltered`/clear-filters logic treats `recent` as the default, not a filter. |
| `src/app/(hub)/projects/_legacy-listing/_load-list-data.ts`, `legacy/page.tsx`, `_filter-controls.tsx`/`_projects-index.tsx` | Modify (if included) | Same option/default for Legacy. |
| `CLAUDE.md` | Modify (docs stage) | Note `project_views` + default sort in the "Projects classification navigation" bullet. |

## Code Context

### `_v2-listing/_load-list-data.ts` (current sort mechanics)

```ts
const SORT_MAP = { newest: {column:"created_at",ascending:false,...}, oldest:..., name_asc:..., name_desc:..., due_soonest:... };
const sortSpec = SORT_MAP[params.sort] ?? SORT_MAP.newest;
...
.order(sortSpec.column, { ascending: sortSpec.ascending, nullsFirst: sortSpec.nullsFirst });
// then .range(from, to) with { count: "exact" }
```

### Why a plain `.order()` can't do it

PostgREST can only order the parent by a **to-one** embedded column; `projects → project_views` is one-to-many (one row per user), and the join filter (`classification` via `customer_products!inner`) plus search/status/membership filters already make this query non-trivial. Recommended approach (no SQL gymnastics, bounded data):

1. When `sort === "recent"`: run the existing filtered query but `select("id, created_at")` only, **without** `.range`, paginating internally in 1000-row chunks (CLAUDE.md rule; pattern in `zoho-import/timelogs/route.ts:104-119`) to get every matching project id.
2. Fetch the current user's `project_views` rows for those ids (`.in("project_id", chunk)`, chunked to stay under URL limits) → `Map<id,{last,count}>`.
3. Sort in JS: viewed (last desc, count desc, created desc) then unviewed (created desc).
4. Slice `[from, to]` from the sorted id list, set `total = ids.length`, then load the full list-item rows for just that page (`.in("id", pageIds)`) and re-order them by the sorted id order.
Matching-project counts per classification are in the hundreds, so this is cheap; an RPC returning ordered ids is an acceptable alternative if the implementer prefers (keep filters identical).

### `_onboarding-list.tsx` (current URL handling)

```tsx
const sortValue = searchParams.get("sort") ?? "newest";
onChange={(v) => navigate(buildUrl({ sort: v === "newest" ? null : v, page: 1 }))}
```
Becomes `?? "recent"` and `v === "recent" ? null : v`.

### Notes

- Auth/role gating of the listing is unchanged; `project_views` rows only exist for users who opened a project they can see, but the listing already filters visibility, so stale rows for now-inaccessible projects are harmless.
- `isFiltered` (drives "Clear filters") must not light up merely because the default sort is active; check how it treats `sort` today and keep `newest` explicit choice counted as non-default only if desired (implementer's call, document it).
- Layout caveat from tasks 414/415: the layout stays mounted across tab clicks, so the client recorder runs once per project entry; moving project-to-project remounts via the `projectId` prop/key — pass `projectId` as the effect dependency.

## Implementation Steps

1. Write migration 156 (do not apply) and update `database.ts` types.
2. Add `POST .../view` route + `_record-project-view.tsx`; wire into the project layout (skipped for deleted/404).
3. Implement the `recent` path in `loadOnboardingProjectsList` with the graceful fallback; flip defaults in `page.tsx` and `_onboarding-list.tsx`.
4. Mirror for Legacy if straightforward.
5. `npx tsc --noEmit`, `pnpm lint`.
6. Browser acceptance after the migration is applied (see Verification).

## Acceptance Criteria

- [ ] Opening Project A then Project B, then returning to the listing: B is first, A second, unopened projects after, on the project's classification tab.
- [ ] Every classification tab defaults to "Recently accessed" with no `sort` in the URL; selecting "Newest first" shows `?sort=newest` and orders by created date as before.
- [ ] Switching tabs keeps the default behaviour; search/status/pagination work, no duplicate or missing rows across pages.
- [ ] Two different users have independent orderings; one cannot read the other's `project_views` (RLS).
- [ ] Reloading or flipping between a project's tabs does not inflate `access_count` / reorder repeatedly; a deleted-project landing view is not recorded.
- [ ] With migration 156 **not** applied the listing still loads, ordered by newest (no error page).
- [ ] `tsc` and lint clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Apply migration 156 locally, then browser:
#  1. open 3 projects in a tab in a known order -> listing order matches
#  2. sort dropdown shows "Recently accessed" by default on each classification tab
#  3. second user sees their own order; unapplied-migration fallback verified by temporarily renaming the table
```

## Compatibility Touchpoints

- New migration 156 (written, not applied — repo convention); `database.ts` types.
- CLAUDE.md: document `project_views`, the `recent` default, and the "bare URL ⇒ recent" change (existing bookmarks without `?sort=` change order — intended).
- Open question for review: confirm per-user recency (not global popularity), and whether Legacy should be included.

## Implementation Notes

### What Changed
- New per-user `project_views` table + `record_project_view()` RPC (migration 156, **written, not applied**). Opening any live `/projects/v2/[projectId]/**` project fires a throttled, fire-and-forget `POST /api/v2/projects/[projectId]/view` from a client recorder mounted in the `[projectId]` layout (not for deleted projects).
- `/projects/v2` listing gains a **"Recently accessed"** sort, first in the Sort dropdown and the default on every classification tab (absent `?sort=` ⇒ `recent`). "Newest first" is now explicit `?sort=newest`.
- `recent` is sorted in app code: all matching rows are fetched (paged by 1000, stable `created_at desc, id` base order), ordered by the caller's `last_accessed_at` desc then `access_count` desc, unviewed projects after in newest-first order, then the requested page is sliced; `total` = matched rows. Any `project_views` error (e.g. migration unapplied) degrades to newest ordering with a console warning.

### Files Changed
- `supabase/migrations/156_project_views.sql` (new) - table, own-row RLS, index, RPC. Not applied.
- `src/types/database.ts` - `project_views` table and `record_project_view` function types.
- `src/app/api/v2/projects/[projectId]/view/route.ts` (new) - best-effort recorder endpoint (204 on success/failure; 401/404 only for auth/unknown project).
- `src/app/(hub)/projects/v2/[projectId]/_record-project-view.tsx` (new) - 5-minute sessionStorage-throttled beacon.
- `src/app/(hub)/projects/v2/[projectId]/layout.tsx` - mounts the recorder for non-deleted projects.
- `src/app/(hub)/projects/_v2-listing/_load-list-data.ts` - `RECENT_SORT`, `loadViewStats()`, recent path; ordering moved after filters.
- `src/app/(hub)/projects/v2/page.tsx` - default sort `recent`.
- `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` - new option, default value, URL builder omits `sort` for `recent`.

### Deviations From Plan
- **Legacy listing not included** (plan allowed this): `/projects/legacy` has a separate loader/shape and its detail route has no `[projectId]` layout to host the recorder, so it needs its own wiring. Gap, not a regression: Legacy keeps "Newest first". Follow-up candidate.
- Plan suggested selecting only `id, created_at` in the all-rows pass; the implementation reuses the existing full select instead, which keeps the downstream row mapping untouched (rows are small and bounded per tab).

### Verification Run
- `npx tsc --noEmit` - PASS (no errors outside stale `.next` validator entries)
- `eslint` on changed files - PASS
- Browser acceptance (open projects → order; per-tab default; second-user isolation; unapplied-migration fallback) - SKIPPED (needs migration 156 applied + authenticated session)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. `tsc` + ESLint clean on all changed files. Typed end-to-end (no `any`); migration follows the repo's written-not-applied convention with own-row RLS and `security invoker` RPC; the recorder endpoint and beacon fail silently by design; the 1000-row pagination rule is honored in both the all-rows pass and `loadViewStats`.
- Accepted observations:
  - Before migration 156 is applied, every default listing load logs one `[projects-list] project_views unavailable…` warning (intentional signal, not an error path).
  - The `[projectId]` layout mounts the recorder for any project row the viewer's RLS returns, even if a child tab later 404s for them; this can write a harmless `project_views` row for a project they can't open (never surfaced, listing visibility rules unchanged).
  - `recent` loads all matching rows for the tab per request (hundreds, bounded by classification) instead of a DB-side page; acceptable per the task's approach, revisit with an RPC if tabs grow into the thousands.

### Deviations
- Minor: Legacy listing not included (explicitly allowed by the task if non-trivial; documented in Implementation Notes).
- Minor: reuses the full select for the all-rows pass instead of a lean `id, created_at` select (documented).

## Follow-up: Legacy listing included (user-reported gap)

Review feedback: *"I think it is not applied to the legacy projects."* Correct — the first pass shipped v2 only (documented deviation). Now closed:

- `/projects/legacy` has the same **"Recently accessed"** sort option (first in the dropdown) and it is the default (absent `?sort=` ⇒ `recent`; "Newest first" is explicit `?sort=newest`). Unviewed legacy projects follow in `start_date desc` order (Legacy's own "newest"); degrades to that if migration 156 isn't applied.
- Opening a legacy project is recorded by a new `legacy/[projectId]/layout.tsx` (covers `(tabs)` plus the task/ticket/milestone detail routes).
- Shared logic extracted to `projects/_shared/_recent-sort.ts` (`RECENT_SORT`, `loadViewStats`, `sortByRecentAccess`) and used by both loaders; the recorder moved to `projects/_shared/_record-project-view.tsx`.

### Files Changed (follow-up)
- `src/app/(hub)/projects/_shared/_recent-sort.ts` (new), `_record-project-view.tsx` (moved from `v2/[projectId]/`).
- `src/app/(hub)/projects/_legacy-listing/_load-list-data.ts`, `_filter-controls.tsx`, `_projects-index.tsx`, `legacy/page.tsx` - recent sort + default.
- `src/app/(hub)/projects/legacy/[projectId]/layout.tsx` (new) - recorder.
- `src/app/(hub)/projects/_v2-listing/_load-list-data.ts`, `v2/page.tsx`, `v2/[projectId]/layout.tsx` - switched to the shared module.

### Verification Run (follow-up)
- `npx tsc --noEmit` - PASS; `eslint` on `src/app/(hub)/projects` - 0 errors (2 pre-existing unused-var warnings in `onboarding-workspace/_checklist-tab.tsx`)
- Browser - SKIPPED (needs migration 156 applied)

## Quality Gate Notes (re-run after Legacy follow-up)

### Result
PASS

### Standards Review
- No blocking issues. `tsc` clean; ESLint 0 errors across `src/app/(hub)/projects` (2 pre-existing unused-var warnings in `onboarding-workspace/_checklist-tab.tsx`, untouched).
- The follow-up improved maintainability: the duplicated sort constants, view-stats loader and comparator now live once in `projects/_shared/_recent-sort.ts` and both loaders import it; the recorder is one shared component used by both `[projectId]` layouts. No dead code left behind in the v2 loader after the extraction.
- Legacy path matches the v2 contract: stable `start_date desc, id` base order, paged in 1000-row chunks, `user` null-safe, view-stats errors degrade to the base order.
- Accepted observations (carry-over): per-request all-rows fetch for `recent`; harmless view rows possible for projects whose tabs 404; one warning log per listing load before migration 156 applies. New: Legacy's dropdown now contains both "Recently accessed" (per-user opens) and the older "Recently updated" (`updated_at`); distinct meanings, labels kept as specified.

### Deviations
- None outstanding. The earlier "Legacy not included" deviation is resolved by the follow-up.
