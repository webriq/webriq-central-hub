# 247: Portfolio Tracker — Non-StackShift I Dynamic Phase View, Delete Rename, Creation-Date Sort

**Created:** 2026-08-14
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

Four related Portfolio Tracker fixes. The first two are one root cause: `_onboarding-detail.tsx`
(`/v2/portfolio-tracker/[projectId]`) renders **every** project — regardless of classification —
through the StackShift I specialized `customer_phases`/`customer_deliverables` 120-day
Gantt/Timeline engine. Per task 239's design decision, that engine is StackShift-I-only (plus
StackShift II when a PM explicitly opts in at intake via `use_default_phase_engine`); every other
classification (StackShift Access, StackShift Access Plus, Discrete Development, StackShift II
without the opt-in) is seeded into the generic `milestones`/`tasklists`/`tasks` tables instead
(`seedCustomPhases`, task 239) and never gets `customer_phases` rows or a `programme_started_at`.
`_onboarding-detail.tsx` has **zero branching on classification or engine** (confirmed: zero
matches for `classification`/`STACKSHIFT`/`isStackShift` in the file) — so a Non-StackShift-I
project always falls into the same `!programmeStartedAt` "not started" screen as an
un-started StackShift I project, forever, even after it has real milestones/tasklists/tasks with
real progress. Its "Jump to phase" dropdown lists the fixed 5 `PROGRAMME_PHASES` (Onboard/
Migrate/Publish/AI Visibility/Optimize), which don't exist for these projects. There is currently
no way to distinguish, at render time, "StackShift I hasn't started yet" from "this project uses
the generic milestone model and never will have a `programme_started_at`" — task 239 computed a
`usesCustomerPhasesEngine` boolean at intake (`api/onboarding/projects/route.ts:267`) but never
persisted it, so this task adds that missing persisted flag as the foundation for both fixes.

Item 3 amends task 231's existing soft-delete (`DELETE /api/v2/projects/[projectId]` → `status =
'deleted'`, row never removed) to also rename the project on delete, appending `_deleted_<date>`
to its `name` — makes a soft-deleted row unambiguous on any surface task 231 explicitly left
unfiltered (dashboard tiles, Kanban, MCP tools, Zoho import/export — see task 231's Out of Scope
§5), and frees the clean name for reuse by a new project.

Item 4 fixes the Portfolio Tracker list's default sort (`_onboarding-list.tsx`): "Newest first" /
"Oldest first" currently sort by `programme_started_at ?? scheduled_onboarding_start_at`
(`effectiveStartTime()`), a field that is StackShift-I-specific and null for essentially every
generic-engine project — those projects always sort to the bottom regardless of when they were
actually created. This is the same root issue as items 1-2 (type-dependent field driving a
type-agnostic UI), fixed by switching the default sort to `projects.created_at`, which every
project has regardless of classification.

## Requirements

### A — Persisted phase-engine flag (foundation for items 1 & 2)

- [ ] `projects.uses_customer_phases_engine boolean not null default false` (new migration).
      Backfilled `true` for every project that currently has at least one `customer_phases` row
      (covers all existing StackShift I projects and any legacy StackShift II project already on
      the engine); `false` otherwise.
- [ ] `POST /api/onboarding/projects` sets this column explicitly on the `projects` insert from
      its already-computed `usesCustomerPhasesEngine` local (`route.ts:267`) — decided once at
      creation time, independent of `mode` (`save`/`save_scheduled`/`start`), so it's correct even
      before any `customer_phases` row exists yet (the pre-start / scheduled-start states).
- [ ] `src/types/database.ts` — add the column to `projects`' Row/Insert/Update.
- [ ] `loadOnboardingDetailData` (`_load-detail-data.ts`) selects and returns it on `project`.

### B — Item 1: dynamic "not started"/empty state + dynamic Jump-to-phase for Non-StackShift I

- [ ] `_onboarding-detail.tsx` branches near the top of its render (before the existing
      `!programmeStartedAt` gate) on `project.uses_customer_phases_engine`. `false` → skip the
      StackShift-shaped Timeline entirely and delegate to a new component (see Proposed File
      Changes) instead of falling into the day-based "not started" screen.
- [ ] That new component's empty state (zero `milestones` rows — the "skip phases for now" intake
      case) is visually and textually distinct from StackShift I's: no "Start Onboarding" CTA, no
      day-count copy, no fixed-5-phase language. Explains phases aren't set up yet and links to
      `/v2/projects/{project_id}` (Milestones tab) — where phase/deliverable authoring already
      lives (task 242) — rather than duplicating write UI here (Portfolio Tracker stays
      read+navigate-only for the generic model, matching task 242's own scope decision).
- [ ] When milestones exist, there is no blocking "not started" gate at all — the project goes
      straight to the header/progress/swimlane view (Requirement C). A milestone in `planned`
      status is normal, browsable state for this model, not a pending-start screen.
- [ ] "Jump to phase" for a generic-engine project lists that project's own `milestones` (by
      `name`, ordered by `position`) instead of the fixed `PROGRAMME_PHASES`; selecting one and
      confirming sets it `status: "active"` via `PATCH /api/v2/milestones/[id]` (existing route).
      Any other milestone currently `active` is set back to `planned` first, so at most one
      milestone reads as "current" — mirrors the single-active-phase semantics implied everywhere
      else "current phase" is displayed (`current_phase_name` on the list card, the header's
      "Phase X: Name" chip). **Flagged for review — not explicit in the request.**
- [ ] Gated to the same role set as today's Jump-to-phase (`canManagePhases`: not `pm`/`developer`).

### C — Item 2: progress bar, overview, swim lane for Non-StackShift I

- [ ] The new component's header mirrors the existing header's shape (company name, project name,
      status chip, owner, collaborators, Settings menu incl. Delete — all class-agnostic already)
      but its status chip reads the *active milestone's name* (or "No active phase" if none is
      `active`) instead of `Phase X: <StackShift phase name>`.
- [ ] Progress bar reflects **task completion**, not calendar days: `doneTasks / totalTasks` across
      the project's `tasks` (status `closed` = done, matching `_milestone-swimlane.tsx`'s existing
      `t.status === "closed"` convention), 0% shown explicitly (not hidden) when there are zero
      tasks yet.
- [ ] Overview stat chips: milestones completed / total, tasklists count, tasks done/total —
      replacing StackShift I's "Days left / Phases done / Deliverables" chips (which have no
      equivalent here; no calendar-day chip is shown since this model has no day-based clock).
- [ ] Swim lane: one lane per milestone (ordered by `position`, fallback `start_date`/
      `created_at` — same fallback `_milestone-swimlane.tsx` already uses), one card per
      `tasklists` row in that lane, each with a `done/total` task badge. Clicking a card navigates
      to `/v2/projects/{project_id}/tasks?tasklist={id}` (task 241/242's existing shared
      deep-link contract on `_list-view.tsx` — reused, not reimplemented). Zero-tasklist lane and
      zero-milestone states get explicit empty-state copy (icon + one line), per this repo's UI
      Polish Conventions.
- [ ] **Out of scope:** the Status Summary drawer (`_status-summary-drawer.tsx`) and the separate
      `/v2/portfolio-tracker/status-report` page. Both are built entirely around the
      `customer_phases` health/day model (task 221); making those generic-engine-aware is a
      comparably large, separate effort and isn't part of "Portfolio Tracker details" (the
      `[projectId]` detail page) as scoped here. Opening Status Summary for a generic-engine
      project keeps today's behavior (likely an empty/error state from the status-report API,
      which does not return non-StackShift projects) — not fixed by this task.
- [ ] **Known adjacent gap, not fixed here:** the Portfolio Tracker **list** card
      (`_onboarding-list.tsx`) for a generic-engine project still always shows "Awaiting kickoff" /
      "Day —/120" (its progress row is driven by the same `programme_started_at`-only fields),
      since `GET /api/onboarding/projects` doesn't fetch milestones/tasks per row today. Flagged
      as a follow-up, matching task 231's own precedent of explicitly naming out-of-scope gaps
      rather than silently expanding this task.

### D — Item 3: delete rename

- [ ] `DELETE /api/v2/projects/[projectId]` (task 231's soft-delete handler) additionally sets
      `name` to `` `${currentName}_deleted_${YYYY-MM-DD}` `` in the same update — requires reading
      the current row's `name` first (a `select` before the `update`, or a single
      `update(...).select()` preceded by a fetch — see Code Context).
- [ ] Idempotency guard: if the project's `status` is already `'deleted'` when `DELETE` is called,
      return 400 without re-appending a second suffix (direct-API robustness; the UI can't
      normally reach an already-deleted project since it 404s and drops off every list, task 231).
- [ ] Both delete entry points (Projects `_delete-project-action.tsx`, Portfolio Tracker
      `_delete-project-menu-item.tsx`) already call this one shared endpoint (task 231) — no
      frontend changes needed for the rename itself.

### E — Item 4: default sort by creation date

- [ ] `_onboarding-list.tsx`'s `"newest"`/`"oldest"` sort options switch from
      `effectiveStartTime()` (`programme_started_at ?? scheduled_onboarding_start_at`) to
      `created_at` — present and non-null on every project regardless of classification/engine,
      so ordering no longer depends on project type. `"newest"` stays the default
      (`sortValue = searchParams.get("sort") ?? "newest"`, unchanged).
- [ ] `GET /api/onboarding/projects` selects `created_at` and includes it on each returned list
      item; `OnboardingProjectListItem` type gains `created_at: string`.
- [ ] `name_asc`/`name_desc`/`due_soonest` sort options are unchanged (not type-dependent already).

## Out of Scope / Must-Not-Change

- StackShift I's existing Timeline/Gantt/Swimlane rendering, day-math, Jump-to-phase, Onboarding
  Workspace redirect, and Status Summary drawer — byte-identical behavior, zero regression.
- StackShift II projects that *did* opt into the customer_phases engine at intake
  (`use_default_phase_engine: true`) — these read `uses_customer_phases_engine = true` and get the
  exact same StackShift-shaped view as StackShift I (per task 239's design), unaffected by this task.
- Milestone/tasklist/task create/edit/delete — stays exclusively in the Projects module
  (`/v2/projects/[projectId]` Milestones/Tasks tabs, task 242's own scope decision). Portfolio
  Tracker's new generic view is read + navigate only, matching the existing swimlane's own
  precedent.
- Status Summary drawer, `/v2/portfolio-tracker/status-report` page, and the Portfolio Tracker
  list card's progress row (see the two "Out of scope"/"Known adjacent gap" bullets in
  Requirement C) — explicitly deferred, not silently left broken without a note.
- No hard-delete, no cascade cleanup, no restore/undo UI (task 231's existing boundaries, unchanged).
- No change to `PATCH /api/v2/projects/[projectId]`'s `VALID_STATUS` list or to how `'deleted'`
  becomes settable (task 231 Decision 3, unchanged) — the rename only happens inside the existing
  `DELETE` handler.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/104_projects_phase_engine_flag.sql` | Create | Add `uses_customer_phases_engine`, backfill from existing `customer_phases` rows |
| `src/types/database.ts` | Modify | Add `uses_customer_phases_engine` to `projects` Row/Insert/Update |
| `src/app/api/onboarding/projects/route.ts` | Modify | Set the flag on the `projects` insert from the already-computed `usesCustomerPhasesEngine` (~line 267) |
| `src/app/api/v2/projects/[projectId]/route.ts` | Modify | `DELETE`: fetch current `name`, append `_deleted_<date>` alongside `status: "deleted"`; guard against double-delete |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_load-detail-data.ts` | Modify | Select/return `uses_customer_phases_engine`, and (when `false`) the project's `milestones`/`tasklists`/`tasks` rows |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` | Modify | Add the `project.uses_customer_phases_engine` branch (small early-return before the existing `!programmeStartedAt` block); gate `fetchProgramme()`'s effect off when `false` |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_generic-phase-view.tsx` | Create | New top-level view for non-engine projects: empty state, header, progress bar, overview chips, Jump-to-phase |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_generic-swimlane.tsx` | Create | Lane(milestone)/card(tasklist) swimlane, page-scoped port of `_milestone-swimlane.tsx`'s shape (not cross-imported — matches this codebase's existing page-scoped-component convention between Onboarding/Projects, task 242's own note) |
| `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx` | Modify | Sort `"newest"`/`"oldest"` by `created_at`; add `created_at` to `OnboardingProjectListItem` |
| `src/app/api/onboarding/projects/route.ts` | Modify (2nd hunk) | Select `created_at`, include it on each returned list item |

## Code Context

### `src/app/api/onboarding/projects/route.ts` — `usesCustomerPhasesEngine` already computed (line 267), just never stored

```ts
const isStackShiftI = body.classifications.includes("StackShift I");
const isStackShiftII = body.classifications.includes("StackShift II");
...
const usesCustomerPhasesEngine = isStackShiftI || (isStackShiftII && body.use_default_phase_engine === true);
```

The `projects` insert (same file, ~line 85-94) needs `uses_customer_phases_engine:
usesCustomerPhasesEngine` added to its payload.

### `_load-detail-data.ts` — where the flag and generic-model data join in

```ts
const { data: project, error } = await supabase
  .from("projects")
  .select("id, name, customer_id, project_id, created_by, scheduled_onboarding_start_at, scheduled_start_phase, existing_website, customer_product_id, customers(company_name)")
  .eq("project_id", projectId)
  .neq("status", "deleted")
  .single();
```

Add `uses_customer_phases_engine` to the select list. When it's `false`, also fetch (mirrors
`_get-project-detail-data.ts`'s exact pattern in the Projects module):

```ts
const [milestonesRes, tasklistsRes, tasksRes] = await Promise.all([
  supabase.from("milestones").select("*").eq("project_id", project.id).order("position", { ascending: true, nullsFirst: false }),
  supabase.from("tasklists").select("*").eq("project_id", project.id),
  supabase.from("tasks").select("*").eq("project_id", project.id),
]);
```

Return these alongside `project`/`role`/etc.; `page.tsx` forwards them to `OnboardingDetail` as new
optional props.

### `_onboarding-detail.tsx` — where the branch goes (before line 1557's `if (!programmeStartedAt)`)

```ts
if (!project.uses_customer_phases_engine) {
  return (
    <GenericPhaseView
      project={project}
      role={role}
      milestones={milestones}
      tasklists={tasklists}
      tasks={tasks}
      backLink={backLink}
      canManageProjMembers={canManageProjMembers}
      canSetOwner={canSetOwner}
      canDeleteProject={canDeleteProject}
      // ...owner/collaborator panel state & handlers already computed above this point, reused as-is
    />
  );
}
```

Also gate the existing `fetchProgramme()` effect (the one populating `phases`/`deliverables`/
`programmeStartedAt`) so it doesn't fire a wasted request for a generic-engine project:

```ts
useEffect(() => {
  if (!project.uses_customer_phases_engine) return;
  fetchProgramme();
}, [...]);
```

### `src/app/v2/(hub)/projects/[projectId]/_milestone-swimlane.tsx` — shape to port (read-only reference, do not import cross-module)

```tsx
export default function MilestoneSwimlane({ milestones, tasklists, tasks, projectUrlKey }: {...}) {
  // sortMilestones() by position, fallback start_date/created_at
  // one useMemo pass over tasks building milestoneCounts + tasklistCounts (done = status === "closed")
  // lane per milestone, card per tasklist in that lane, "No deliverables yet" / "No milestones yet" empty states
  // onClick -> router.push(`${V2_ROUTES.PROJECTS}/${projectUrlKey}/tasks?tasklist=${tasklistId}`)
}
```

`_generic-swimlane.tsx` reimplements this same shape (page-scoped, per CLAUDE.md's "inline/page-
scoped UI" convention and task 242's own precedent of not cross-importing between Onboarding and
Projects), swapping `V2_ROUTES.PROJECTS` for the same constant (still `V2_ROUTES.PROJECTS`, since
the click target is the *Projects* module's Tasks tab either way — Portfolio Tracker has no Tasks
tab of its own for this model).

### `src/app/api/v2/projects/[projectId]/route.ts` — current DELETE (to extend with rename)

```ts
export async function DELETE(...) {
  ...
  const { data, error } = await supabase
    .from("projects")
    .update({ status: "deleted", updated_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .select()
    .single();
  ...
}
```

Change to: fetch `status, name` first; 400 if already `'deleted'`; else update with both `status`
and the computed `name`:

```ts
const { data: existing } = await supabase.from("projects").select("status, name").eq("project_id", projectId).single();
if (!existing) return NextResponse.json({ error: "Project not found" }, { status: 404 });
if (existing.status === "deleted") return NextResponse.json({ error: "Project already deleted" }, { status: 400 });

const deletedSuffix = `_deleted_${new Date().toISOString().slice(0, 10)}`;
const { data, error } = await supabase
  .from("projects")
  .update({ status: "deleted", name: `${existing.name}${deletedSuffix}`, updated_at: new Date().toISOString() })
  .eq("project_id", projectId)
  .select()
  .single();
```

### `_onboarding-list.tsx` — sort switch to amend (lines 273-276, 350-369)

```ts
function effectiveStartTime(p: OnboardingProjectListItem): number {
  const d = p.programme_started_at ?? p.scheduled_onboarding_start_at;
  return d ? new Date(d).getTime() : Number.NaN;
}
...
case "oldest":
  sorted.sort((a, b) => compareNullableAsc(effectiveStartTime(a), effectiveStartTime(b)));
  break;
...
case "newest":
default:
  sorted.sort((a, b) => compareNullableDesc(effectiveStartTime(a), effectiveStartTime(b)));
```

Replace `effectiveStartTime(p)` in both the `"oldest"` and `"newest"`/default branches with
`new Date(p.created_at).getTime()` (always present, `compareNullableAsc`/`Desc` still safe to keep
using since they're just plain number comparators, though NaN is no longer actually reachable
here). Leave `effectiveStartTime` itself in place only if still used elsewhere in the file —
otherwise remove the now-dead function.

### `GET /api/onboarding/projects` — add `created_at` to the select + returned item (lines 51-68, 157-177)

```ts
const { data: rawProjects, error } = await supabase
  .from("projects")
  .select(`
    id, project_id, name, customer_id, programme_started_at, programme_duration_days,
    scheduled_onboarding_start_at, customer_product_id, customers(company_name), customer_products(classification)
  `)
  ...
```

Add `created_at` to the select list, and `created_at: p.created_at` to the mapped `items` return
object (~line 157-176) and to `OnboardingProjectListItem`.

## Implementation Steps

1. Write and apply `104_projects_phase_engine_flag.sql`; update `src/types/database.ts`.
2. `api/onboarding/projects/route.ts`: set `uses_customer_phases_engine` on insert (Requirement A);
   add `created_at` to the GET select + returned item shape (Requirement E).
3. `_load-detail-data.ts`: select the new flag; conditionally fetch `milestones`/`tasklists`/
   `tasks` when it's `false`; return both from `loadOnboardingDetailData`; thread through
   `page.tsx` → `OnboardingDetail` props.
4. Build `_generic-swimlane.tsx` (port of `_milestone-swimlane.tsx`'s shape, page-scoped).
5. Build `_generic-phase-view.tsx`: empty state, header (owner/collaborators/settings/delete —
   reuse existing panels as props/children), progress bar (tasks done/total), overview chips,
   dynamic Jump-to-phase menu (milestone list + single-PATCH-then-PATCH active-swap), swimlane.
6. `_onboarding-detail.tsx`: add the early-return branch; gate `fetchProgramme()`'s effect.
7. `api/v2/projects/[projectId]/route.ts`: extend `DELETE` with the fetch-then-rename + idempotency
   guard.
8. `_onboarding-list.tsx`: switch `"newest"`/`"oldest"` to `created_at`; update
   `OnboardingProjectListItem`.
9. Sweep every new/touched file against `nextjs-file-length-best-practices.md` (soft warning
   250-300 lines, hard limit 400-500) — split `_generic-phase-view.tsx` further (e.g. extract the
   Jump-to-phase menu into its own small file) if it grows past ~350 lines with the header+progress
   +overview+menu all inline.
10. `npx tsc --noEmit` and `pnpm lint`.

## Acceptance Criteria

- [ ] A new StackShift Access/Access Plus/Discrete Development (or StackShift II without the
      engine opt-in) project with zero milestones, opened in Portfolio Tracker, shows a distinct
      empty state — no "Start Onboarding" button, no day-count copy, no fixed 5-phase language —
      linking to its Projects-module Milestones tab.
- [ ] The same project after 2+ milestones (with tasklists/tasks) are added via the Projects
      module shows, with no blocking gate: a header with the active milestone's name (or "No
      active phase"), a task-completion progress bar, milestone/tasklist/task overview chips, and
      a swimlane matching the Projects module's own milestone/tasklist counts for that project.
- [ ] Jump-to-phase on that project lists its own milestones (not Onboard/Migrate/Publish/AI
      Visibility/Optimize); selecting one sets it `active` and un-sets any previously-active
      milestone.
- [ ] Clicking a swimlane tasklist card lands on `/v2/projects/{project_id}/tasks` scrolled/
      expanded to that tasklist (task 241/242's existing behavior, reused unmodified).
- [ ] A StackShift I project (and a StackShift II project created with the engine opt-in) is
      pixel-for-pixel unchanged from today — Timeline/Gantt, day-based "not started" screen, Jump-
      to-phase's 5-phase list, Status Summary drawer all behave exactly as before.
- [ ] Deleting a project (either module's delete action): the row's `status` becomes `'deleted'`
      and its `name` becomes `<original name>_deleted_<YYYY-MM-DD>`; the row and every FK'd table
      (tasks/issues/time logs/milestones/onboarding data) remain intact and queryable.
- [ ] Calling `DELETE` a second time on an already-deleted project's `project_id` returns 400 and
      does not append a second suffix.
- [ ] Portfolio Tracker's list, default view (no `?sort=` param): projects appear newest-created
      first, mixing StackShift I and non-StackShift-I projects correctly interleaved by actual
      creation time (not clustered by type) — verify with at least one of each type created at
      different times.
- [ ] "Oldest first" shows the true creation-order reverse of the above.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual (no test runner configured):
- Create one StackShift I project and one StackShift Access project (via `/v2/portfolio-tracker/new`,
  task 240's wizard) a few minutes apart; confirm Portfolio Tracker's default list ordering reflects
  creation order regardless of type.
- Open the StackShift Access project's detail page before adding any milestones — check the empty
  state copy/CTA. Add 2 milestones with 1-2 tasklists each (with a few tasks) via
  `/v2/projects/{project_id}` Milestones tab; reload the Portfolio Tracker detail page — check
  header/progress/overview/swimlane and cross-check counts against the Projects module's own
  Milestones tab (Table and Swimlane views) for the same project.
- Use Jump-to-phase to activate a milestone; confirm the header status chip updates and the
  previously-active milestone (if any) reads as no longer active.
- Click a swimlane tasklist card; confirm it lands on the Tasks tab scrolled to that tasklist.
- Re-open an existing StackShift I project; confirm the Timeline/Gantt/"not started" screen/Jump-
  to-phase are unchanged.
- Delete a disposable test project from each module; confirm `status = 'deleted'` and the renamed
  `name` via Supabase, and that a second `DELETE` call (e.g. via curl) 400s.

## Compatibility Touchpoints

- New migration (`104_projects_phase_engine_flag.sql`) must ship with the code deploy; existing
  rows are backfilled by the migration itself (no separate backfill script/cron needed).
- No `_docs/mcp-tools.md` changes (no MCP tool touched).
- Any other code path that reads `projects.name` and doesn't filter `status = 'deleted'` (task
  231's own documented out-of-scope list: dashboard tiles, Kanban/orchestration board, MCP tools,
  developer project-access allow-list, customer detail page's project mini-list, Zoho import/
  export) will now show the `_deleted_<date>`-suffixed name for a deleted project instead of its
  original name — a visible, intentional side effect of this task's rename (makes those
  already-known gaps self-evident rather than a silent regression).

## Implementation Notes

### What Changed
- **Requirement A (foundation):** added `projects.uses_customer_phases_engine boolean not null
  default false` (migration `104_projects_phase_engine_flag.sql`), backfilled `true` for any
  project with an existing `customer_phases` row. `POST /api/onboarding/projects` now persists the
  already-computed `usesCustomerPhasesEngine` local onto the `projects` insert.
  `loadOnboardingDetailData` selects and returns it, and (only when `false`) also fetches the
  project's `milestones`/`tasklists`/`tasks` rows — mirroring the Projects module's
  `_get-project-detail-data.ts` query shape exactly.
- **Requirements B/C (items 1-2):** `_onboarding-detail.tsx` now branches on
  `project.uses_customer_phases_engine` immediately after `backLink` is defined (after every hook,
  before any StackShift-only state is read) and delegates entirely to the new
  `_generic-phase-view.tsx` when `false`. That component shows a distinct empty state (no
  milestones — no "Start Onboarding" CTA, no day-count copy, links to the Projects module's
  Milestones tab instead) or, once milestones exist, a header (owner/collaborators/Settings menu/
  Delete — reusing `StatChip`/`AvatarCircle`/`CollaboratorAvatars`/`OwnerPanel`/
  `CollaboratorsPanel`, exported from `_onboarding-detail.tsx` rather than duplicated), a
  task-completion progress bar, milestone/tasklist/task overview chips, a dynamic
  milestone-based "Jump to phase" menu (`_generic-jump-to-phase-menu.tsx`, PATCHing
  `/api/v2/milestones/[id]`'s `status`, swapping the previously-active milestone back to
  `planned`), and a lane(milestone)/card(tasklist) swimlane (`_generic-swimlane.tsx`, a
  page-scoped port of the Projects module's `_milestone-swimlane.tsx` shape, navigating to
  `/v2/projects/{project_id}/tasks?tasklist={id}` on card click). The existing `fetchProgramme()`
  initial-fetch effect and the `customer_phases`/`customer_deliverables` realtime-subscription
  effect are both gated off for generic-engine projects (avoids a wasted request and a pointless
  subscription).
- **Requirement D (item 3):** `DELETE /api/v2/projects/[projectId]` now fetches the current
  `status`/`name` first, 400s if already `'deleted'`, and otherwise appends
  `_deleted_<YYYY-MM-DD>` to `name` in the same update that sets `status = 'deleted'`.
- **Requirement E (item 4):** `GET /api/onboarding/projects` selects and returns `created_at` on
  every list item; `_onboarding-list.tsx`'s `"newest"`/`"oldest"` sort switched from
  `effectiveStartTime()` (`programme_started_at ?? scheduled_onboarding_start_at`) to
  `created_at`. `effectiveStartTime()` and the now-unused `compareNullableDesc` were removed as
  dead code (`compareNullableAsc` stays — still used by `"due_soonest"`).

### Files Changed
- `supabase/migrations/104_projects_phase_engine_flag.sql` - new migration, column + backfill
- `src/types/database.ts` - added `uses_customer_phases_engine` to `projects` Row/Insert/Update
- `src/app/api/onboarding/projects/route.ts` - set the flag on insert; added `created_at` to the
  GET select + returned item shape
- `src/app/api/v2/projects/[projectId]/route.ts` - `DELETE` now fetches current name first,
  400s on double-delete, appends `_deleted_<date>` on soft delete
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_load-detail-data.ts` - selects the flag;
  conditionally fetches milestones/tasklists/tasks; returns both from `loadOnboardingDetailData`
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/page.tsx` - threads the three new arrays through
  to `OnboardingDetail`
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` - exported `MemberRow`/
  `StatChip`/`AvatarCircle`/`CollaboratorAvatars`/`OwnerPanel`/`CollaboratorsPanel` (no logic
  change, just export surface); added `uses_customer_phases_engine`/`milestones`/`tasklists`/
  `genericTasks` to `OnboardingDetailProps`; added the early-return branch to `GenericPhaseView`;
  gated the two StackShift-only `useEffect`s
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_generic-phase-view.tsx` - new, top-level
  generic-engine view
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_generic-jump-to-phase-menu.tsx` - new,
  milestone-based Jump-to-phase dropdown
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_generic-swimlane.tsx` - new, page-scoped
  swimlane (lane = milestone, card = tasklist)
- `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx` - `created_at` on
  `OnboardingProjectListItem`; `"newest"`/`"oldest"` sort by it; removed `effectiveStartTime()`
  and `compareNullableDesc` (dead code after the switch)

### Deviations From Plan
- **Minor:** the task doc's Code Context sketch showed `_generic-phase-view.tsx` receiving a
  `role` prop; it turned out unused once `canManagePhases`/`canManageProjMembers`/`canSetOwner`/
  `canDeleteProject` (already role-derived booleans) covered every gate the component needs — kept
  it out of the final prop signature rather than pass an unused value (would've been an ESLint
  `no-unused-vars` warning otherwise).
- **Minor:** split the Jump-to-phase menu into its own file (`_generic-jump-to-phase-menu.tsx`,
  55 lines) rather than inlining it in `_generic-phase-view.tsx`, per the task doc's own step 9
  guidance to split further if the main file approached ~350 lines with everything inline.
  `_generic-phase-view.tsx` landed at 254 lines either way — the split was precautionary/for
  clarity, not because the limit was hit.
- No other deviations — implementation matches the task document's Requirements, Proposed File
  Changes, Code Context, and Out of Scope boundaries.
- **Not done, as scoped:** the migration was written but not applied to any live database (this
  workflow's `implement` stage does not run destructive/schema-changing operations against a real
  DB; task 231/239's own implementation passes followed the same pattern). Every new column
  reference (`uses_customer_phases_engine` and its selects/inserts) will only work at runtime once
  `104_projects_phase_engine_flag.sql` is applied through this repo's normal migration process —
  `npx tsc --noEmit` passes because it only checks against the updated `database.ts` types, not a
  live schema.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing warnings in `_checklist-tab.tsx`, unrelated to this task —
  same warnings noted in tasks 222/239/242's own Implementation Notes)
- Manual/browser acceptance checks from this task doc's Verification section - SKIPPED (no live
  Supabase/browser session available in this implementation pass, and the migration hasn't been
  applied yet — recommend applying the migration first, then walking the listed scenarios: a new
  StackShift Access project's empty state, adding milestones/tasklists/tasks via the Projects
  module and reloading the Portfolio Tracker detail page to check header/progress/overview/
  swimlane counts against the Projects module's own Milestones tab, Jump-to-phase's active-swap
  behavior, the swimlane's tasklist-card deep link, a StackShift I project's unchanged Timeline,
  the delete-rename + double-delete-400 behavior, and the creation-date default sort with mixed
  project types)

## Quality Gate Notes

### Result
PASS

### Standards Review
- `console.log`/`TODO`/`FIXME`/`: any`/`as any` sweep across all new/changed files
  (`_generic-phase-view.tsx`, `_generic-swimlane.tsx`, `_generic-jump-to-phase-menu.tsx`,
  `_load-detail-data.ts`, `page.tsx`, both API routes) returned zero hits. Every `console.error`
  present is a pre-existing call in code this task didn't touch (established error-logging
  convention: `console.error(...)` + scoped `NextResponse.json` error).
- No dead code introduced. `effectiveStartTime()` and `compareNullableDesc` were removed from
  `_onboarding-list.tsx` once the sort switch made them unreachable (`compareNullableAsc` stays —
  still used by `"due_soonest"`).
- No new `any`/untyped escape hatches — every new file's props and Supabase query results are
  typed via `Database["public"]["Tables"][...]["Row"]`, matching the codebase's existing pattern
  for pages that don't have a dedicated shared type module.
- File-length check (this task's own explicit instruction, `nextjs-file-length-best-practices.md`):
  new files landed at 253 (`_generic-phase-view.tsx`), 138 (`_generic-swimlane.tsx`), and 55
  (`_generic-jump-to-phase-menu.tsx`) lines — all within the soft-warning range, well under the
  400-500 hard limit. `_onboarding-detail.tsx` (already 1993 lines pre-task, over the hard limit
  before this task touched it — a pre-existing condition noted by tasks 231/239 too) grew by only
  49 lines net (a branch, five `export` keyword additions with zero logic change, two
  one-line effect guards, and prop-type additions) — consistent with the task doc's own stated
  approach of minimizing growth to that file rather than adding the new logic inline there.
- During this gate: found and merged two separate `import type { ... } from "@/types/database"`
  statements in `_onboarding-detail.tsx` into one (introduced across two separate edits during
  implementation) — cosmetic only, `npx tsc --noEmit` and `pnpm lint` re-verified clean after.
- Rules of Hooks: verified the new `project.uses_customer_phases_engine` early-return in
  `_onboarding-detail.tsx` sits after every `useState`/`useEffect` call in the component (right
  after `backLink`'s definition) — no conditional hook calls introduced.
- Scope boundaries verified against the task doc's Out of Scope list: `_status-summary-drawer.tsx`
  and `_status-summary-phase-cards.tsx` are untouched (zero diff); `_status-report-client.tsx`
  shows a diff but it predates this task (not touched by any edit in this implementation pass —
  pre-existing uncommitted work in the working tree, confirmed by cross-checking against what this
  task's own edits actually were, not by git history since nothing in this repo is committed
  mid-task per this project's own git-usage convention).

### Deviations
- **Minor:** `GenericPhaseView`'s `handleJump` (the single-active-phase swap: PATCH the previously
  active milestone to `planned`, then PATCH the target to `active`) is two sequential, non-atomic
  requests. If the first succeeds but the second fails, the DB is left with zero active milestones
  while local state still shows the old one as active until the next reload — `jumpError` does
  surface a message, but the header/swimlane don't reflect the drift until then. Low-probability
  (requires a network failure between two fast sequential same-origin requests); the task doc
  already flagged the single-active-phase design itself as "not explicit in the request, flagged
  for review" — this note extends that flag to the failure-mode specifically. Not fixed here since
  addressing it (e.g. a combined transactional endpoint, or reconciling from a re-fetch on error)
  is a design choice beyond what the task doc scoped, and the existing codebase doesn't have a
  precedent for multi-step-PATCH rollback elsewhere to follow.
- **Minor:** the cosmetic import-merge fixed during this gate (see Standards Review).
- No Medium or Major deviations — implementation matches the task document's Requirements,
  Proposed File Changes, Code Context, and Out of Scope boundaries; no scope was added, no
  architecture decision was made without the task doc's own prior approval.

### Required Fixes
- None (PASS).
