# 188: Project Detail & Task Detail Routes — UUID → `project_id`

**Created:** 2026-07-24
**Priority:** MEDIUM
**Type:** refactor
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

`/v2/projects/[projectId]` currently resolves the `[projectId]` URL segment against
`projects.id` (UUID) — e.g. `http://localhost:3000/v2/projects/0a0c0029-b72e-4a40-ae66-f86ffdf04950`.
Now that task 187 (migration 088) has shipped `projects.project_id` as a stable,
human-readable, incremental-per-customer value (`<8-char customer hex>-PROJ-<2-digit
sequence>`, e.g. `BDD824C5-PROJ-01`), the user wants this route family to use
`project_id` as the URL routing key instead — for both the project detail page and its
nested task detail page (`/v2/projects/[projectId]/tasks/[taskId]` — only the
`projectId` segment changes; `taskId` stays the UUID, see task 189 for the *display*
format of task/issue IDs, which is a separate, unrelated concern from routing).

This is the exact same pattern already established for
`/v2/portfolio-tracker/[projectId]` (task 150) — see
`src/app/v2/(hub)/portfolio-tracker/[projectId]/_load-detail-data.ts:27-29` for the
canonical precedent: resolve the `projects` row via `.eq("project_id", projectId)`,
then use the resolved row's `id` (UUID) for every downstream query against
`project_id`-FK'd tables (`milestones`, `tasks`, `tasklists`, `time_logs`, etc. — those
tables' own `project_id` *columns* are still UUID FKs to `projects.id`, unaffected by
this task). This task **expands** that documented routing-key exception to a second
route family — `CLAUDE.md`'s Key Conventions note needs updating to reflect that (see
Requirements).

## Requirements

- [ ] `/v2/projects/[projectId]/page.tsx` resolves the project via
      `.eq("project_id", projectId).single()` instead of `.eq("id", projectId)`; all
      downstream queries (`milestones`, `tasklists`, `tasks`, `time_logs`) use the
      resolved row's `id` (UUID), not the raw route param.
- [ ] `/v2/projects/[projectId]/tasks/[taskId]/page.tsx` resolves the project the same
      way; its current narrow `.select("id, name, customer_id")` must add `project_id`
      to the select list (it does not use `select("*")` like the parent page).
      `taskId` continues to resolve against `tasks.id` (UUID) — unchanged.
- [ ] `/api/v2/projects/[projectId]/route.ts`:
  - `GET` resolves the project via `project_id`, then uses the resolved UUID for the
    `milestones`/`tasks` sub-queries (same shape as the page).
  - `PATCH`/`DELETE` filter directly with `.eq("project_id", projectId)` (no separate
    resolve step needed — `project_id` is unique, Postgrest can update/delete on any
    column).
- [ ] `/api/v2/projects/[projectId]/tasks/route.ts` (`GET`/`POST`) — the route currently
      uses the `[projectId]` param directly as `tasks.project_id` (a UUID FK). Add a
      resolve step: look up `projects.id` via `.eq("project_id", projectId).single()`
      first (404 if not found), then use the resolved UUID for the `tasks` filter/insert.
- [ ] `/api/v2/projects/[projectId]/milestones/route.ts` (`GET`/`POST`) — same resolve
      step as the tasks route (`milestones.project_id` is also a UUID FK).
- [ ] `/api/v2/projects/[projectId]/members/route.ts` — **no change**. Confirmed via
      code read: this route doesn't filter by project at all (role-based only, the
      `[projectId]` segment is unused beyond `await params`) — out of scope.
- [ ] `/v2/projects/page.tsx` — the list query's `.select(...)` (line ~60) is missing
      `project_id`; add it so the list item objects carry it through to the client.
- [ ] `/v2/projects/_projects-index.tsx`:
  - `ProjectListItem` type gains a `project_id` field.
  - Card-view `<Link href={`${V2_ROUTES.PROJECTS}/${p.id}`}>` (~line 671) and
    table-row `onClick={() => router.push(`${V2_ROUTES.PROJECTS}/${p.id}`)}` (~line 770)
    both switch to `p.project_id`.
  - `removeTag()`'s `fetch(`/api/v2/projects/${projectId}`, ...)` call must hit the API
    using `p.project_id`, not `p.id` — but its local optimistic-update state
    (`tagOverrides`, keyed and read via `p.id` in `getTagsFor`) is pure UI state and can
    stay keyed by `p.id`; don't conflate the two. Simplest: pass both, or resolve
    `p.project_id` at the two call sites (~lines 709, 831) without changing the
    state-keying param.
- [ ] `/v2/projects/[projectId]/_project-detail.tsx` — the three
      `router.push(`/v2/projects/${project.id}/tasks/${task.id}`)` calls (~lines 208,
      216, 228) switch the project segment to `project.project_id` (`task.id` stays
      UUID).
- [ ] `/v2/projects/[projectId]/tasks/[taskId]/_task-detail.tsx` — the two
      `router.push(`/v2/projects/${project.id}`)` calls (~lines 188, 198) switch to
      `project.project_id`.
- [ ] `CLAUDE.md`'s Key Conventions note on `projects.project_id` (the sentence
      documenting the portfolio-tracker routing-key exception) is updated to list
      **two** exceptions instead of one: `/v2/portfolio-tracker/[projectId]` (task 150)
      and `/v2/projects/[projectId]` + its nested `tasks/[taskId]` route (task 188) —
      both use `project_id` as the URL segment; every other route in the app still keys
      on the UUID `id`.

## Out of Scope / Must-Not-Change

- **`taskId` route segment stays the UUID.** This task only changes the `projectId`
  segment. Whether/how task and issue IDs get a human-readable *display* format is
  task 189 — a separate, unrelated decision (display text, not a routing key change).
- **No change to `tasks.project_id` / `milestones.project_id` / `time_logs.project_id`
  column semantics.** Those stay UUID FKs to `projects.id`, exactly as today. Only the
  *URL segment* and the *initial project lookup* change — every downstream query still
  operates on the resolved UUID.
- **No change to `/api/v2/projects/[projectId]/members/route.ts`** — confirmed it
  doesn't use the param for filtering; touching it would be scope creep.
- **No change to how `/v2/portfolio-tracker/[projectId]` resolves** — it already does
  this correctly (task 150); this task only extends the same pattern to a second route
  family, not modifies the original.
- Do not regenerate or touch `projects.project_id` values themselves — those are
  produced by migration 088's trigger (task 187); this task only consumes them.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/projects/[projectId]/page.tsx` | Modify | Resolve project via `project_id`; use resolved UUID for sub-queries. |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/page.tsx` | Modify | Same resolve pattern; widen project select to include `project_id`. |
| `src/app/api/v2/projects/[projectId]/route.ts` | Modify | GET resolves via `project_id` then uses UUID for sub-queries; PATCH/DELETE filter directly on `project_id`. |
| `src/app/api/v2/projects/[projectId]/tasks/route.ts` | Modify | Add project resolve step before filtering/inserting `tasks`. |
| `src/app/api/v2/projects/[projectId]/milestones/route.ts` | Modify | Add project resolve step before filtering/inserting `milestones`. |
| `src/app/v2/(hub)/projects/page.tsx` | Modify | Add `project_id` to the projects list `.select(...)`. |
| `src/app/v2/(hub)/projects/_projects-index.tsx` | Modify | `ProjectListItem` type + link/router.push/fetch call sites use `project_id`. |
| `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` | Modify | Task-open `router.push` calls use `project.project_id`. |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | Back-to-project `router.push` calls use `project.project_id`. |
| `CLAUDE.md` | Modify | Document the second routing-key exception. |

## Code Context

### Canonical precedent — `src/app/v2/(hub)/portfolio-tracker/[projectId]/_load-detail-data.ts:27-29`
```ts
const { data: project } = await supabase
  .from("projects")
  .select("id, name, customer_id, project_id, created_by, ...")
  .eq("project_id", projectId)
  .single();
// downstream queries then use project.id (UUID), never the raw route param
```

### Current (to be changed) — `src/app/v2/(hub)/projects/[projectId]/page.tsx`
```ts
const { projectId } = await params;
const { data: project } = await supabase.from("projects").select("*").eq("id", projectId).single();
// ...milestones/tasklists/tasks/time_logs all filter .eq("project_id", projectId) directly
```
Since this page already does `select("*")`, only the `.eq("id", ...)` → `.eq("project_id",
...)` swap is needed on the project fetch; every sub-query must switch from the raw
`projectId` param to `project.id` once resolved.

### `ProjectListItem` / list query — `src/app/v2/(hub)/projects/page.tsx:59-60`
```ts
.from("projects")
.select("id,name,project_type,status,customer_id,end_date,tags,owner_name,updated_at,external_project_id,customer_product_id", { count: "exact" })
```
Add `project_id` to this column list and to the `ProjectListItem` mapping at line ~147.

## Implementation Steps

1. Add a small shared resolve helper or inline pattern (match the portfolio-tracker
   precedent's shape) in each of the 4 route/page files that need it — resolve
   `projects.id` from `project_id`, 404/`notFound()` if missing.
2. Update the 2 page components (project detail, task detail) first; verify both load
   correctly via the new `project_id`-based URL in the browser.
3. Update the 3 API routes (`route.ts`, `tasks/route.ts`, `milestones/route.ts`).
4. Update `page.tsx`'s list select + `_projects-index.tsx`'s type/links/fetch calls.
5. Update the two detail components' internal `router.push` calls.
6. Update `CLAUDE.md`.
7. Manually verify: navigate from `/v2/projects` list → project detail (URL now shows
   `project_id`) → open a task (project segment still `project_id`, task segment still
   UUID) → back to project → tag removal on the list still round-trips correctly.

## Acceptance Criteria

- Visiting `/v2/projects/<project_id>` (e.g. `/v2/projects/BDD824C5-PROJ-01`) loads the
  correct project detail page; the old UUID-based URL for the same project 404s
  (expected — not a dual-read migration, matches task 187's precedent of a one-time
  cutover).
- Visiting `/v2/projects/<project_id>/tasks/<task-uuid>` loads the correct task detail
  page.
- All project-detail sub-views (board, list, calendar) still load milestones/tasks
  correctly.
- Creating a task or milestone from the project detail page still correctly attaches to
  the right project (`tasks.project_id`/`milestones.project_id` still store the UUID).
- Tag removal on the `/v2/projects` list page still works.
- `npx tsc --noEmit` passes.
- `CLAUDE.md`'s routing-key exception note lists both exceptions.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```
Browser-based acceptance testing per the steps above (no test runner configured).

## Compatibility Touchpoints

- Any already-bookmarked `/v2/projects/<uuid>` link breaks after this ships — same
  accepted tradeoff as task 187's one-time cutover, not a concern at this dev-phase
  stage per that task's precedent.

## Implementation Notes

### What Changed
- Both `/v2/projects/[projectId]` and its nested `tasks/[taskId]` route now resolve the
  project via `.eq("project_id", projectId)` instead of `.eq("id", projectId)`; every
  downstream query (milestones, tasklists, tasks, time_logs) uses the resolved row's
  UUID `id`, not the raw route param — matching the portfolio-tracker precedent exactly.
- Same resolve-then-query pattern applied to the 3 API routes that needed it
  (`route.ts`, `tasks/route.ts`, `milestones/route.ts`); `members/route.ts` confirmed
  unchanged (doesn't filter by project).
- `project_id` is nullable at the DB/type level (`text`, no `NOT NULL` — same as the
  rest of the codebase already treats it, e.g. `pm-dashboard.tsx`'s portfolio-tracker
  links), so `ProjectListItem.project_id` and the task-detail `project` prop type are
  both `string | null`, with guard checks (`p.project_id ?` / `project.project_id &&`)
  at every navigation call site, consistent with the existing codebase pattern rather
  than assuming non-null.
- `_projects-index.tsx`'s `removeTag()` signature gained a second `projectId: string |
  null` param so the optimistic-update local state key (`p.id`, unchanged — pure UI
  state) stays decoupled from the API call target (`p.project_id`).
- `CLAUDE.md` updated to document the second routing-key exception alongside the
  existing portfolio-tracker one.

### Files Changed
- `src/app/v2/(hub)/projects/[projectId]/page.tsx` - resolve via `project_id`, use resolved UUID for sub-queries
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/page.tsx` - same resolve pattern; widened project select
- `src/app/api/v2/projects/[projectId]/route.ts` - GET resolves then queries by UUID; PATCH/DELETE filter directly on `project_id`
- `src/app/api/v2/projects/[projectId]/tasks/route.ts` - added project resolve step before filter/insert
- `src/app/api/v2/projects/[projectId]/milestones/route.ts` - added project resolve step before filter/insert
- `src/app/v2/(hub)/projects/page.tsx` - added `project_id` to list select + `ProjectListItem` mapping
- `src/app/v2/(hub)/projects/_projects-index.tsx` - type, links, `removeTag()` signature updated for nullable `project_id`
- `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` - task-open `router.push` calls use `project.project_id`
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx` - widened `project` prop type; back-navigation calls use `project.project_id`, null-guarded
- `CLAUDE.md` - documented the second routing-key exception

### Deviations From Plan
- `project_id` was typed `string | null` throughout (task doc didn't specify), matching
  the DB column's actual nullability and the existing codebase convention (nullable
  ternary guards already used for the portfolio-tracker links in `pm-dashboard.tsx` /
  `marketing-dashboard.tsx`) rather than assuming non-null. All new navigation/fetch call
  sites are null-guarded as a result.
- `removeTag()` gained an extra parameter rather than repurposing its existing one, to
  keep the local optimistic-update state keying (`p.id`) independent of the API call
  target (`p.project_id`) — flagged as a possible approach in the task doc's
  requirements, confirmed as the simplest correct option during implementation.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Browser (Chrome, logged-in session): `/v2/projects` list → clicked into a project card,
  URL became `/v2/projects/473EDDEC-PROJ-01` (project_id, not UUID) - PASS
- Opened a task from that project, URL became
  `/v2/projects/473EDDEC-PROJ-01/tasks/de2e41f4-...` (project segment = project_id, task
  segment = UUID, as specced) - PASS
- Back-navigation from task detail → project detail preserved `project_id` in the URL - PASS
- Old UUID-based URL (`/v2/projects/0a0c0029-b72e-4a40-ae66-f86ffdf04950`) returns 404 -
  expected one-time cutover, matches task 187's precedent - PASS
- Tag removal on `/v2/projects` list: network request confirmed
  `PATCH /api/v2/projects/473EDDEC-PROJ-01` → 200, tag removed from UI - PASS
- No console errors observed during any of the above - PASS
