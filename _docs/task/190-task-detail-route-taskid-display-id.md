# 190: Task Detail Route — `[taskId]` Segment UUID → `display_id`

**Created:** 2026-07-24
**Priority:** MEDIUM
**Type:** refactor
**Recommended Tier:** fast

---

## Overview

`/v2/projects/[projectId]/tasks/[taskId]` currently resolves the `[taskId]` segment
against `tasks.id` (UUID) — e.g.
`http://localhost:3000/v2/projects/473EDDEC-PROJ-01/tasks/de2e41f4-4255-4eae-828d-596fc7e2618e`.
Task 188 deliberately left this segment as the UUID, and task 189 explicitly ruled out
wiring `tasks.display_id` into any URL. The user has now explicitly asked to reverse
that specific piece: with `tasks.display_id` shipped (migration 089/task 189 —
`<10-char project base>-T####`, e.g. `BDD824C501-T0001`), the `[taskId]` segment should
resolve against `display_id` instead, mirroring exactly what task 188 did for
`[projectId]` → `project_id`.

This is a narrow, single-route change — a full codebase sweep (`grep -rn "task\.id\b"`)
found only **one** file constructing this route with `task.id`:
`src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` (3 call sites, all the same
line pattern). Every other `task.id` usage in the codebase is either an `/api/v2/tasks/
[taskId]` **API** call (subtasks fetch, PATCH, DELETE — those stay keyed by the UUID
primary key, unrelated to this page route) or an unrelated Zoho deep-link URL
(`dev-dashboard.tsx`, `_dev-tasks.tsx` — Zoho's own portal URL, not this app's route).

## Requirements

- [ ] `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/page.tsx` resolves the task
      via `.eq("display_id", taskId).eq("project_id", project.id).single()` instead of
      `.eq("id", taskId).single()`. The `project_id` scope is a defense-in-depth
      correctness check (display_id is already globally unique per the migration 089
      constraint, but scoping to the resolved project mirrors how every other sub-query
      on this page already scopes to `project.id`) — 404 (`notFound()`) if no match,
      same as today.
- [ ] `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` — the three
      `router.push(`/v2/projects/${project.project_id}/tasks/${task.id}`)` calls
      (~lines 208, 216, 228) switch the task segment to `task.display_id`, null-guarded
      the same way `project.project_id &&` is already guarded elsewhere on this page
      (`display_id` is nullable at the type level even though the trigger + backfill
      guarantee it's populated in practice — match the existing nullable-guard
      convention rather than assuming non-null).
- [ ] `CLAUDE.md`'s routing-key exception sentence (the one documenting
      `/v2/portfolio-tracker/[projectId]` (task 150) and `/v2/projects/[projectId]` +
      nested `tasks/[taskId]` (task 188)) is updated: the nested task route's `taskId`
      segment now also resolves against a display value (`tasks.display_id`, not the
      UUID) — note this as an amendment/expansion of task 188's original note, made by
      task 190, rather than leaving the stale "`taskId` still resolves against
      `tasks.id`" wording in place.

## Out of Scope / Must-Not-Change

- **`tasks.id` / `issues.id` (UUID primary keys) — unchanged.** `display_id` is still
  additive; no FK, join, or lookup elsewhere switches to it. This task only changes what
  value is accepted in this one route's URL segment.
- **`/api/v2/tasks/[taskId]/...` API routes — unchanged.** Those operate on the UUID
  primary key (subtask fetch/create, PATCH, DELETE) and are a distinct concern from the
  page route's URL segment. Confirmed via `grep` that no other call site needs updating.
- **No change to `issues` — no Issues browsing UI exists**, so there's no analogous
  issue-detail route to update.
- **No backward-compat redirect for old UUID-based task URLs.** Matches the exact
  precedent already accepted in task 187 (customer_id/project_id cutover) and task 188
  (project UUID → project_id): a one-time cutover, not a dual-read migration. Old
  bookmarked task-detail URLs will 404 after this ships.
- **No change to `tasks.display_id`'s format, trigger, or backfill** — that's
  migration 089/task 189, already shipped; this task only consumes the column.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/page.tsx` | Modify | Resolve task via `display_id` (scoped to `project.id`) instead of `id`. |
| `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` | Modify | Task-open `router.push` calls use `task.display_id`, null-guarded. |
| `CLAUDE.md` | Modify | Update the routing-key exception note — nested task route now also uses a display value. |

## Code Context

### Current — `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/page.tsx:23-24`
```ts
const [{ data: task }, { data: milestones }] = await Promise.all([
  supabase.from("tasks").select("*").eq("id", taskId).single(),
  ...
]);
```
Change to:
```ts
supabase.from("tasks").select("*").eq("display_id", taskId).eq("project_id", project.id).single(),
```
(`project` is already resolved above this block via `.eq("project_id", projectId)` — same
variable, no new query needed to get `project.id`.)

### Current — `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx:208,216,228`
```tsx
onOpen={(task) => router.push(`/v2/projects/${project.project_id}/tasks/${task.id}`)}
```
Change the task segment to `task.display_id`, guarding the same way `project.project_id`
is presumably already guarded on this line (check the current null-guard shape used for
`project.project_id` at these exact call sites and mirror it for `task.display_id`).

### `Task` type — already carries `display_id`
`src/app/v2/(hub)/projects/_pm-shared.tsx:10`: `export type Task =
Database["public"]["Tables"]["tasks"]["Row"]` — `display_id: string | null` was added to
that `Row` type in task 189 (`src/types/database.ts`), so no type changes are needed for
this task; `task.display_id` is already available wherever `Task` is imported.

## Implementation Steps

1. Update `page.tsx`'s task query to resolve by `display_id` + `project.id`.
2. Update the 3 `router.push` call sites in `_project-detail.tsx`.
3. Update `CLAUDE.md`.
4. Manually verify in the browser: from `/v2/projects/<project_id>`, open a task from
   board/list/calendar view — the resulting URL's task segment should be the
   `<proj-base>-T####` display value, and the page should load the correct task. Confirm
   the old UUID-based task URL for the same task now 404s.

## Acceptance Criteria

- Visiting `/v2/projects/<project_id>/tasks/<display_id>` (e.g.
  `/v2/projects/473EDDEC-PROJ-01/tasks/473EDDEC01-T0001`) loads the correct task detail
  page.
- The old UUID-based task URL for the same task now 404s (expected one-time cutover).
- Opening a task from any of the project detail page's views (board/list/calendar)
  navigates to the new display_id-based URL.
- `npx tsc --noEmit` passes.
- `CLAUDE.md`'s routing-key exception note reflects the new `taskId` behavior.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```
Browser-based acceptance testing per the steps above (no test runner configured).

## Compatibility Touchpoints

- Any already-bookmarked `/v2/projects/.../tasks/<uuid>` link breaks after this ships —
  same accepted tradeoff as tasks 187/188's one-time cutovers.
- `/api/v2/tasks/[taskId]/...` API routes are unaffected — they're a separate concern
  (UUID-keyed action endpoints, not this page route).

## Implementation Notes

### What Changed
- `page.tsx`'s task query switched from `.eq("id", taskId).single()` to
  `.eq("display_id", taskId).eq("project_id", project.id).single()` — the `project_id`
  scope is the defense-in-depth check called out in the task doc, added at no extra
  query cost since `project` was already resolved above this line.
- `_project-detail.tsx`'s three `router.push` calls (board/list/calendar `onOpen`)
  switched `task.id` → `task.display_id`. No null-guard was added: the codebase's
  existing convention at these exact call sites already interpolates
  `project.project_id` unguarded (confirmed by reading the surrounding code before
  editing — no `project.project_id &&` guard exists there today), so `task.display_id`
  matches that established local convention rather than introducing a new,
  inconsistent guard pattern.
- `CLAUDE.md`'s routing-key exception sentence updated to state both segments on the
  nested task route (`projectId` and `taskId`) are now display values — replacing the
  stale "taskId still resolves against tasks.id" wording task 188 left behind.

### Files Changed
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/page.tsx` - task query resolves by `display_id` (scoped to `project.id`) instead of `id`
- `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` - 3 `router.push` calls use `task.display_id` instead of `task.id`
- `CLAUDE.md` - amended the routing-key exception note

### Deviations From Plan
- Task doc suggested checking whether `project.project_id` was already null-guarded at
  the 3 call sites and mirroring that shape for `task.display_id`. On inspection, no
  guard exists there today (both `project.project_id` and, previously, `task.id` are
  interpolated directly) — so `task.display_id` was left unguarded too, consistent with
  the surrounding code rather than adding a new pattern the task doc left as
  conditional.

### Verification Run
- `npx tsc --noEmit` - PASS (no errors).
- `pnpm lint` - PASS (no warnings/errors).
- Browser-based acceptance testing (navigate from project detail → open a task → confirm
  URL shows `display_id`; confirm old UUID-based task URL 404s) - **not run this
  session** — flagged for the user/next stage to verify live, since it requires a
  logged-in session and an actual project with tasks in the dev DB.
