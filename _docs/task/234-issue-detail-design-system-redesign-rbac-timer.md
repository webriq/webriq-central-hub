# 234: Issue Detail Page — Design System v2.0 Redesign, RBAC (Creator/Assignee), Timer Support

**Created:** 2026-08-13
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** deep

---

**Also closes out task 194's still-open issue-detail scope.** Task 194 ("Task & Issue Detail Pages —
Design System v2.0 Redesign + Proper HTML Title/Description Rendering") was fulfilled for Task Detail
by task 206 but never revisited for Issue Detail — confirmed by reading the current
`_issue-detail.tsx`: its title `useState` still initializes from the raw `issue.title` (no
`decodeHtmlEntities`, unlike `_task-detail.tsx:92`), and its Description is still a raw-text
`<textarea>` rather than rendered/rich HTML. This task's redesign (Requirement 1's title init,
Requirement 6's rich-text Description) resolves both, the same way 206 did for tasks — no separate
task needed for that leftover scope.

## Overview

The Issue Detail page (`/v2/projects/[projectId]/issues/[issueId]`, `_issue-detail.tsx`) still uses the
pre-design-system slate/gray look (from before the v2.0 design tokens `#0B1533`/`#E2E7F2`/`font-heading`
were adopted — see task 206/211/218's `_task-detail.tsx`, which already carries them) and has **no
permission model at all** — any authenticated staff role (including a read-only developer) can currently
edit every field via the client UI, blocked only by RLS at the DB layer for non-PM/Admin roles (which
today means developers get a silent 403 on every write, not a disabled control).

This task redesigns the page to match `_task-detail.tsx`'s layout/tokens exactly (per the user-provided
Task Detail screenshot: sidebar **Details** card on the left, **Description** card on the right, header
badges row, timer button in the header), and introduces the RBAC/timer capability the user asked for:
developers **assigned** to an issue can start a timer on it; developers who **created** an issue can also
edit its title/description/etc.

**The schema doesn't support either of those asks today, and this task adds what's missing:**

- `issues` has no `created_by` and no `assignee_id` — only Zoho-imported free-text `assignee_name`/
  `assignee_email`, and RLS (`issues_pm_write`, migration 051) grants write access to
  admin/super_admin/pm only, with **no developer write policy of any kind**. Issues are 100%
  Zoho-imported (CLAUDE.md: "Import-only") — there is no in-Hub issue-creation flow, so a `created_by`
  column will be `null` for every existing and future-imported row. Confirmed with the user directly
  (this task's own planning): they explicitly chose to add a real `created_by` column anyway (mirroring
  `tasks.created_by`) rather than substitute "assignee" for "creator" — understanding this means the
  "creator can edit" tier is **not reachable by any current data path** until a future issue-creation
  flow exists. This is an intentional, accepted tradeoff, not a gap to paper over.
- The entire timer subsystem (`active_timers` table, `TimerContext`, `/api/v2/timer/*` routes,
  `TaskTimerButton`) is task-only — `active_timers.task_id` has no `issue_id` sibling, and every route
  hard-codes `task_id`. "Start a timer from the Issue Detail page" requires extending this real
  subsystem, not just reusing a UI button.

**Decisions made below (flagged for review):**

1. **`issues.assignee_id` (new `uuid` FK to `profiles`)** is added alongside the existing
   `assignee_name`/`assignee_email` text columns (kept as-is, unchanged — still Zoho's own fields,
   still shown in the UI). A migration backfills `assignee_id` by matching `assignee_name` to
   `profiles.full_name` (best-effort, same fragile-but-only-available signal the current dropdown
   already uses to *initialize* its selection — see `_issue-detail.tsx:66-68` today). Going forward,
   the Assignee `<select>` writes `assignee_id` directly (a real FK) instead of relying on repeated
   name-matching. This is what makes "developer assigned to this issue" a reliable, indexable
   server-side check instead of a fragile string comparison repeated in every RLS policy/API route
   that needs it.
2. **`getIssueEditPermission(role, userId, issue)`** (new file, `src/lib/issues/permissions.ts`) mirrors
   `src/lib/tasks/permissions.ts`'s `getTaskEditPermission` shape exactly, but is **not** the same
   function — issue `status` is a plain `string` column (not the `TaskStatus` union), and per this
   task's own planning conversation, "assignee" is a **strictly lower** tier than "creator" for issues
   (unlike tasks, where assignee-only also gets status-change rights) — the user's literal ask was
   "assignee → timer only" and "creator → edit title/description/etc.", so:
   - PM/Admin/super_admin → full edit (existing RLS already covers this).
   - developer + `created_by === userId` → full edit (dormant today, see above).
   - developer + `assignee_id === userId` → **status-change only** (reusing the same
     `in_progress`/`ready_for_qa` value restriction tasks use for their own assignee-only tier, for
     consistency — issues share the exact same status vocabulary) **+ `canStartTimer: true`**.
   - anything else → fully read-only, `canStartTimer: false`.
   `canStartTimer` is computed independently of the edit tier (an assignee gets it regardless of
   whether they're also the creator) — see Code Context.
3. **Timer generalization, not duplication.** Rather than building an issue-specific timer subsystem
   alongside the task one, `active_timers`/`time_logs` (which already has an `issue_id` column,
   unused until now — see `time_logs` schema) gain first-class issue support: `active_timers.issue_id`
   (new, nullable, mirrors `task_id`), and every timer route/helper/component that currently only
   understands `task_id` is widened to accept `task_id` **or** `issue_id` (mutually exclusive, enforced
   at the API layer — matching this table's existing app-layer-only enforcement style, e.g. `task_id`
   and `break_type` are already allowed to coexist with no DB constraint forcing exclusivity). One
   active timer per developer either way (existing `unique` constraint on `user_id` is untouched).
4. **Delete stays PM/Admin-only, unaffected by the new "creator can edit" tier.** The user's ask was
   specifically "edit the issue title, description, etc." for creators — not delete. `issues_pm_write`
   RLS (migration 051) already restricts `DELETE` to admin/super_admin/pm and this task adds **no**
   developer delete policy. The client only shows the trash icon for that same role check (not
   `perm.canEditDetails`), so a developer creator never sees a delete affordance they'd be 403'd on.
5. **Description upgrades from a plain `<textarea>` to the same rich-text `Tiptap` editor Task Detail
   uses** (image paste/drop included) — this is folded into *this* task (not deferred to the
   Comments/Attachments follow-ups) because it's a single field directly gated by the RBAC tier this
   task is already building, not a separate live-collaboration subsystem. The existing
   `_task-description-field.tsx` component is relocated up to the shared
   `projects/[projectId]/_description-field.tsx` level (same directory `_task-timer-button.tsx` already
   lives at, for the same reason: shared by both `tasks/[taskId]/` and `issues/[issueId]/`) and gains an
   `uploadUrl` prop instead of hard-coding the tasks-only image endpoint. A twin
   `/api/v2/projects/[projectId]/issues/description-images` route is added, **mirroring the tasks
   version's existing role gate exactly** (`admin`/`super_admin`/`pm` only — note this means a developer
   creator with full edit rights still can't paste inline images into their own issue description,
   same pre-existing limitation the task-side route already has for developer task creators; not a new
   inconsistency introduced by this task, and fixing the task-side gate is out of scope here).
6. **No Attachments/Comments/Time Logs tabs in this task.** Per this task's own planning conversation,
   the user explicitly agreed to split full Task-Detail parity across separate follow-up tasks (235,
   236, 237 — see `TASKS.md`), the same way Task Detail itself was built incrementally (206 → 211 → 212
   → 214). This task's Issue Detail page will therefore visually stop at the Description + Details
   layout (no tab panel below it) until those land — an intentional, temporary gap, not an oversight.

## Requirements

1. Issue Detail's layout/visual language matches `_task-detail.tsx` exactly: header (back link + project
   name, `ISSUE · {display_id}` chip, `StatusBadge`, new `SeverityBadge`, conditional timer button,
   title as an editable/read-only textarea initialized via `decodeHtmlEntities(issue.title)` (closes
   task 194's still-open issue-detail gap — see Overview), delete icon gated to PM/Admin/super_admin), content area
   with **Details sidebar on the left** (`w-72` `Card`) and **Description on the right** (flex-1 `Card`)
   — note this is a left/right swap from the current file, to match Task Detail's arrangement.
2. `Status`, `Severity`, `Assignee`, `Due date` remain editable in the sidebar (as today) but are now
   gated: enabled for PM/Admin/super_admin and the issue's creator; `Status` is additionally editable
   (value-restricted to `in_progress`/`ready_for_qa`) for an assigned-but-not-creator developer; fully
   disabled otherwise. Title/Description are editable only for PM/Admin/super_admin and the creator.
3. A timer button (mirroring Task Detail's header `TaskTimerButton`, `prominent`) appears in the badges
   row **only** for a developer whose `assignee_id` matches the current user, and behaves identically
   to the task one (start/pause/resume/stop, one active timer per developer across tasks *and* issues,
   server-persisted, visible in the hub-wide floating widget).
4. Stopping an issue timer logs a `time_logs` row with `issue_id` set (not `task_id`), same as the task
   flow logs `task_id`.
5. The hub-wide `TimerFloatingWidget` shows the issue's title when an issue timer is active (falls back
   to "Untitled item" like it already falls back to "Untitled task").
6. Description becomes a rich-text field (Tiptap, image paste/drop) instead of a plain `<textarea>`,
   read-only unless the viewer has edit rights (Requirement 2).
7. All existing functionality (Status/Severity/Assignee/Due-date save-on-change, title save-on-blur,
   delete with confirm) continues to work, now correctly gated instead of universally open.
8. `npx tsc --noEmit` and `pnpm lint` pass; file lengths follow
   `@nextjs-file-length-best-practices.md` (split `_issue-detail.tsx` if it grows past the
   soft-warning range the way `_task-detail.tsx` already sits near).

## Out of Scope / Must Not Change

- Comments, Attachments, and Time Logs tabs for issues — see Decision 6; tracked separately as tasks
  235, 236, 237.
- Any change to `_task-detail.tsx`'s own behavior, the task timer's existing task-only call sites, or
  `getTaskEditPermission`/`tasks_developer_update` RLS — this task only *widens* the shared timer
  subsystem and description-field component to also accept issues; task behavior is unchanged.
- Issue creation flow — out of scope; `created_by` stays `null` for all data this task will ever see
  (Decision, accepted by the user).
- Bulk issue actions, the Issues board/list/calendar views (`_issue-board-view.tsx`,
  `_issue-calendar-view.tsx`, `_issue-list-view.tsx`) — untouched. (A future consistency pass could
  reuse the new `SeverityBadge` there, but that's not required by this task.)
- `issue_comments`/`attachments` tables — untouched by this task (see follow-ups).

## Proposed File Changes

- **`supabase/migrations/100_issues_creator_assignee_active_timer.sql`** (new) — see Code Context for
  the exact statements: `issues.created_by`, `issues.assignee_id` (+ backfill + index), the
  `issues_developer_update` RLS policy, `active_timers.issue_id` (+ index).
- **`src/lib/issues/permissions.ts`** (new) — `getIssueEditPermission()`, mirroring
  `src/lib/tasks/permissions.ts`'s shape (Decision 2). Exports its own
  `ISSUE_ASSIGNEE_STATUS_OPTIONS` constant duplicated locally rather than imported from the tasks
  module — matches this codebase's own established convention of duplicating small per-entity arrays
  across independent permission modules (see task 233's Decision 3 for the same reasoning already
  accepted in this codebase).
- **`src/app/v2/(hub)/projects/_pm-shared.tsx`** — add `SeverityBadge` (mirrors `PriorityBadge`,
  ~10 lines, uses the existing `SEVERITY_STYLE`/`normalizeSeverity`).
- **`src/lib/timer/serialize.ts`** — `attachTaskTitle` → generalized to resolve either a task's or an
  issue's title depending on which id is set on the row; keep the export name's call sites updated
  (only 3: `timer/route.ts`, `timer/start/route.ts`, `timer/stop/route.ts`).
- **`src/app/api/v2/timer/start/route.ts`** — accept `issue_id` as an alternative to `task_id`; branch
  the assignee check to `issue.assignee_id === user.id` (vs. `task.assignees.includes(user.id)`); the
  existing "only developers can start a timer" gate is unchanged and applies to both.
- **`src/app/api/v2/timer/stop/route.ts`** — branch on `existing.task_id` vs. `existing.issue_id` when
  building the `time_logs` insert and the row-reset payload.
- **`src/app/v2/(hub)/_components/timer-context.tsx`** — `ActiveTimerRow` gains `issue_id`/
  `issue_title`; `startTimer` signature widens from `(taskId, projectId)` to accept either
  `{ taskId }` or `{ issueId }` plus `projectId`.
- **`src/app/v2/(hub)/_components/timer-floating-widget.tsx`** — `hasTask` → `hasEntity` (checks
  `task_id` or `issue_id`); title fallback checks both `task_title`/`issue_title`.
- **`src/app/v2/(hub)/projects/[projectId]/_task-timer-button.tsx`** — prop signature widens from
  `{ taskId, projectId, onHoursLogged, prominent }` to accept `({ taskId } | { issueId }) & { projectId,
  onHoursLogged?, prominent? }`; `onHoursLogged` simplifies to `(hours: number) => void` (the id
  parameter is dropped — `_task-detail.tsx`'s own handler already ignores it, see Code Context) and
  becomes optional (Issue Detail doesn't yet have a Time Logs tab to refresh — task 237 will wire it).
- **`src/app/v2/(hub)/projects/[projectId]/_description-field.tsx`** (new — relocated from
  `tasks/[taskId]/_task-description-field.tsx`, Decision 5) — same component, renamed
  `DescriptionField`, `uploadUrl: string` prop replaces the hard-coded tasks endpoint.
  `tasks/[taskId]/_task-detail.tsx`'s import updates to the new path/name and passes
  `` `/api/v2/projects/${projectId}/tasks/description-images` `` explicitly.
- **`src/app/api/v2/projects/[projectId]/issues/description-images/route.ts`** (new) — mirrors
  `.../tasks/description-images/route.ts` verbatim (same role gate, same `task-content` bucket — it's
  project-scoped storage, not task-scoped, so no bucket policy change is needed).
- **`src/app/api/v2/issues/[issueId]/route.ts`** — `PATCH` gains server-side enforcement via
  `getIssueEditPermission` (currently has none beyond RLS — see Code Context for the exact tasks-side
  pattern this mirrors), and accepts `assignee_id` as a settable field alongside the existing
  `assignee_name`/`assignee_email`.
- **`src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/page.tsx`** — fetch `currentUserId`/
  `currentUserRole` the same way `tasks/[taskId]/page.tsx` does; select `created_by, assignee_id` on
  the `issues` query.
- **`src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/_issue-detail.tsx`** — full redesign per
  Requirement 1; permission wiring per Requirements 2–3; rich-text Description per Requirement 6.

## Code Context

Current RLS gap — `issues` has no developer write policy at all today (`supabase/migrations/051_issues_table.sql:41-44`):
```sql
create policy "issues_pm_write"
  on issues for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));
```
The pattern to mirror for the new developer policy, `tasks_developer_update` (`supabase/migrations/092_developer_task_permissions_and_active_timers.sql:26-29`):
```sql
create policy "tasks_developer_update"
  on tasks for update to authenticated
  using (get_my_role() = 'developer' and (created_by = auth.uid() or auth.uid() = any(assignees)))
  with check (get_my_role() = 'developer');
```
New migration 100 should add:
```sql
alter table issues add column created_by uuid references profiles(id) on delete set null;
alter table issues add column assignee_id uuid references profiles(id) on delete set null;

update issues i
set assignee_id = p.id
from profiles p
where i.assignee_name is not null and p.full_name = i.assignee_name and i.assignee_id is null;

create index issues_assignee_id_idx on issues(assignee_id) where assignee_id is not null;
create index issues_created_by_idx on issues(created_by) where created_by is not null;

create policy "issues_developer_update"
  on issues for update to authenticated
  using (get_my_role() = 'developer' and (created_by = auth.uid() or assignee_id = auth.uid()))
  with check (get_my_role() = 'developer');

alter table active_timers add column issue_id uuid references issues(id) on delete cascade;
create index idx_active_timers_issue_id on active_timers(issue_id) where issue_id is not null;
```

`src/lib/tasks/permissions.ts` — the exact shape `getIssueEditPermission` mirrors (do not import from
here; duplicate per Decision 2/existing convention):
```ts
export const DEVELOPER_ASSIGNEE_STATUS_OPTIONS: TaskStatus[] = ["in_progress", "ready_for_qa"];
export type TaskEditPermission = { canEditDetails: boolean; canChangeStatus: boolean; allowedStatusValues: TaskStatus[] | "all" };
export function getTaskEditPermission(role, userId, task: { created_by, assignees }): TaskEditPermission {
  if (role === "admin" || role === "pm" || role === "super_admin") return FULL_EDIT;
  if (role !== "developer") return READ_ONLY;
  if (task.created_by === userId) return FULL_EDIT;
  if (task.assignees?.includes(userId)) return ASSIGNEE_STATUS_ONLY;
  return READ_ONLY;
}
```
The issues version's shape (new file, `canStartTimer` is the one structural addition beyond mirroring):
```ts
const ISSUE_ASSIGNEE_STATUS_OPTIONS = ["in_progress", "ready_for_qa"] as const;
export type IssueEditPermission = {
  canEditDetails: boolean;
  canChangeStatus: boolean;
  allowedStatusValues: readonly string[] | "all";
  canStartTimer: boolean;
};
export function getIssueEditPermission(
  role: string | null | undefined,
  userId: string,
  issue: { created_by: string | null; assignee_id: string | null }
): IssueEditPermission {
  const isAssignee = issue.assignee_id === userId;
  if (role === "admin" || role === "pm" || role === "super_admin")
    return { canEditDetails: true, canChangeStatus: true, allowedStatusValues: "all", canStartTimer: false };
  if (role !== "developer")
    return { canEditDetails: false, canChangeStatus: false, allowedStatusValues: [], canStartTimer: false };
  if (issue.created_by === userId)
    return { canEditDetails: true, canChangeStatus: true, allowedStatusValues: "all", canStartTimer: isAssignee };
  if (isAssignee)
    return { canEditDetails: false, canChangeStatus: true, allowedStatusValues: ISSUE_ASSIGNEE_STATUS_OPTIONS, canStartTimer: true };
  return { canEditDetails: false, canChangeStatus: false, allowedStatusValues: [], canStartTimer: false };
}
```
(PM/Admin's `canStartTimer: false` matches existing behavior — `/api/v2/timer/start` already 403s any
non-developer role, this just keeps the client from showing a button that would fail.)

`src/app/api/v2/tasks/[taskId]/route.ts` — the exact PATCH enforcement pattern `issues/[issueId]/route.ts` needs to gain (full file already read; reuse this shape 1:1, swapping `getTaskEditPermission`/`tasks` for `getIssueEditPermission`/`issues`, and `ASSIGNEE_ALLOWED_FIELDS` limited to `{"status"}` — issues have no `position` column):
```ts
const [{ data: existingIssue }, { data: profile }] = await Promise.all([
  supabase.from("issues").select("created_by, assignee_id").eq("id", issueId).maybeSingle(),
  supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
]);
if (!existingIssue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
const perm = getIssueEditPermission(profile?.role, user.id, existingIssue);
if (!perm.canChangeStatus && !perm.canEditDetails) {
  return NextResponse.json({ error: "You don't have permission to edit this issue" }, { status: 403 });
}
// ...same submittedFields/disallowed check, then gate title/description/severity/due_date/
// assignee_id/assignee_name/assignee_email behind perm.canEditDetails, and status behind
// perm.allowedStatusValues, exactly like the tasks route does.
```

`src/app/api/v2/timer/start/route.ts` (full file already read) — the task-assignee branch to mirror for
issues:
```ts
if (!task.assignees?.includes(user.id)) {
  return NextResponse.json({ error: "You must be assigned to this task to time it" }, { status: 403 });
}
```
becomes, for the issue branch:
```ts
if (issue.assignee_id !== user.id) {
  return NextResponse.json({ error: "You must be assigned to this issue to time it" }, { status: 403 });
}
```
Both branches share the same "one active timer already exists" 409 check and the same
insert/update-or-reuse-existing-row logic (just set `issue_id`/leave `task_id` null, or vice versa).

`_task-timer-button.tsx`'s current call site to generalize (`_task-detail.tsx:159-166`):
```tsx
{isAssignedToMe && (
  <TaskTimerButton taskId={task.id} projectId={task.project_id} onHoursLogged={handleHoursLogged} prominent />
)}
```
`_task-detail.tsx`'s `handleHoursLogged` already ignores the id param it's called with today (confirms
the simplified `(hours: number) => void` signature in Proposed File Changes is safe):
```tsx
const handleHoursLogged = useCallback(() => { setTimeLogsRefreshKey((k) => k + 1); }, []);
```

`timer-floating-widget.tsx`'s task-only display to generalize (already read in full):
```tsx
const hasTask = !!timer?.task_id;
...
{timer!.task_title ?? "Untitled task"}
...
<p ...>No timer running. Start one from a task you're assigned to.</p>
```

Current `_issue-detail.tsx` layout to swap (content-left/sidebar-right → sidebar-left/content-right,
matching `_task-detail.tsx:192-360`'s structure):
```tsx
<div className="flex gap-6 max-w-5xl">
  <div className="flex-1 flex flex-col gap-5 min-w-0">      {/* currently: Description, LEFT */}
    <Card title="Description">...</Card>
  </div>
  <div className="w-72 shrink-0 flex flex-col gap-5">        {/* currently: Details, RIGHT */}
    <Card title="Details">...</Card>
  </div>
</div>
```

`issues` table's current relevant columns (`src/types/database.ts`, `issues` Row) — no `created_by`,
no `assignee_id` yet:
```ts
task_id: string | null; external_id: string | null; prefix: string | null; title: string;
description: string | null; status: string; severity: string | null; flag: string | null;
assignee_name: string | null; assignee_email: string | null; due_date: string | null;
```
Regenerate/hand-update `src/types/database.ts`'s `issues` and `active_timers` blocks to add the new
columns after the migration lands (this codebase hand-maintains `database.ts`, no `supabase gen types`
step is documented — follow whatever process the last several migrations used, e.g. task 231's
`status` column addition).

## Implementation Steps

1. Write and apply migration 100 (Code Context has the exact SQL). Hand-update the `issues` and
   `active_timers` blocks in `src/types/database.ts` to match.
2. Add `src/lib/issues/permissions.ts` (`getIssueEditPermission`).
3. Add `SeverityBadge` to `_pm-shared.tsx`.
4. Generalize the timer subsystem: `serialize.ts`, `timer/start`, `timer/stop`, `timer-context.tsx`,
   `timer-floating-widget.tsx`, `_task-timer-button.tsx` (in that dependency order — types/helpers
   first, then routes, then the two consuming components).
5. Relocate `_task-description-field.tsx` → `_description-field.tsx` at the shared `[projectId]/`
   level with the `uploadUrl` prop; update `_task-detail.tsx`'s import; add the issues
   `description-images` route.
6. Update `PATCH /api/v2/issues/[issueId]` with `getIssueEditPermission` enforcement + `assignee_id`
   field support.
7. Update `page.tsx` to fetch and pass `currentUserId`/`currentUserRole`; select `created_by,
   assignee_id` on the issue query.
8. Redesign `_issue-detail.tsx`: layout swap, design-system tokens, `SeverityBadge`, gated
   controls (`readOnly`/`disabled` per `perm`), conditional `TaskTimerButton`, `DescriptionField`
   swap-in, delete icon gated to role (not `perm`).
9. `npx tsc --noEmit`, `pnpm lint`. Split `_issue-detail.tsx` into smaller pieces if it exceeds
   `_task-detail.tsx`'s current ~366-line size by a wide margin (per
   `@nextjs-file-length-best-practices.md`'s soft-warning guidance).

## Acceptance Criteria

- [ ] Issue Detail's visual layout, header, and Details/Description card arrangement match Task
      Detail's (screenshot parity: sidebar left, Description right, badges row, timer button).
- [ ] As PM/Admin/super_admin: all fields remain fully editable, exactly as today.
- [ ] As a developer who is the issue's `assignee_id` (not creator): Status is editable and limited to
      `in_progress`/`ready_for_qa`; Title/Description/Severity/Due date/Assignee are read-only; a
      timer button appears and works (start/pause/resume/stop; stopping writes a `time_logs` row with
      `issue_id` set); the floating widget shows the issue's title while it runs.
- [ ] As a developer who is neither creator nor assignee: everything is read-only, no timer button.
- [ ] Delete icon appears only for PM/Admin/super_admin.
- [ ] Description supports rich text with image paste/drop when editable, matching Task Detail's editor
      (mirroring its exact same PM/Admin/super_admin-only image-upload role gate).
- [ ] Starting a timer on a task still works unchanged; starting a timer on an issue while a task timer
      (or vice versa) is already running is rejected with the existing 409, same as today's
      task-vs-task collision.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

- `npx tsc --noEmit`
- `pnpm lint`
- Browser, as `pm`: open an issue, confirm redesigned layout, edit every field, confirm saves persist.
- Browser, as `developer` assigned to an issue (not its creator, since `created_by` is null for all
  current data): confirm Status-only editing, confirm the timer button appears, start/stop it, confirm
  a `time_logs` row lands with `issue_id` set and `task_id` null.
- Browser, as `developer` with no relationship to the issue: confirm fully read-only, no timer button.
- Browser: start a task timer, confirm the issue timer button is disabled/shows "Timer running on
  another task" (mirrors the existing task-vs-task tooltip); stop it, confirm the issue timer can then
  start.
- Confirm `tasks/[taskId]` page and its own timer button are visually and functionally unchanged.

## Compatibility Touchpoints

- Migration 100 is additive-only (new nullable columns, new indexes, one new RLS policy) — no
  destructive change to `issues` or `active_timers`.
- `attachTaskTitle`'s rename/signature change touches all 3 of its current call sites — grep for any
  other importers before finishing (none expected outside `src/app/api/v2/timer/`).
- `_task-timer-button.tsx`'s prop signature change is a breaking change to its only two call sites
  (task's header, this task's new issue header) — both are updated in this same task.

## Implementation Notes

### What Changed
- Migration 100 adds `issues.created_by`/`issues.assignee_id` (+ best-effort `assignee_name`-match
  backfill + indexes), the `issues_developer_update` RLS policy (creator-or-assignee row visibility
  for developer writes, mirroring `tasks_developer_update`), and `active_timers.issue_id` (+ index).
  `src/types/database.ts`'s `issues` and `active_timers` blocks were hand-updated to match.
- Added `src/lib/issues/permissions.ts` (`getIssueEditPermission`) — PM/Admin/super_admin full edit;
  developer creator full edit (dormant today, no data has `created_by` set); developer assignee gets
  status-change-only (`in_progress`/`ready_for_qa`) plus `canStartTimer: true`; everyone else
  read-only.
- Added `SeverityBadge` to `_pm-shared.tsx`, mirroring `PriorityBadge`.
- Generalized the timer subsystem from task-only to task-or-issue: `src/lib/timer/serialize.ts`'s
  `attachTaskTitle` now resolves either a task's or an issue's title (kept the export name
  unchanged — see Deviations); `/api/v2/timer/start` accepts `task_id` OR `issue_id` (exactly one
  required) and branches the assignee check accordingly; `/api/v2/timer/stop` writes `time_logs`
  with whichever id was active and resets both columns on the row; `timer-context.tsx`'s
  `ActiveTimerRow` gained `issue_id`/`issue_title` and `startTimer` now takes a
  `{ taskId } | { issueId }` union; `timer-floating-widget.tsx` renamed its local `hasTask` to
  `hasEntity` and its title fallback now checks both `task_title`/`issue_title`;
  `_task-timer-button.tsx` widened to accept the same `{ taskId } | { issueId }` union via a
  `TaskTimerButtonProps` type, and `onHoursLogged` simplified from `(taskId, hours) => void` to the
  optional `(hours: number) => void` (the id is redundant — every call site already knows which
  entity its own button belongs to).
- Relocated `tasks/[taskId]/_task-description-field.tsx` → `[projectId]/_description-field.tsx`
  (`DescriptionField`), replacing its hard-coded tasks-only image endpoint with an `uploadUrl` prop.
  Added the mirrored `/api/v2/projects/[projectId]/issues/description-images` route (same role gate,
  same shared `task-content` bucket).
- `PATCH /api/v2/issues/[issueId]` now enforces `getIssueEditPermission` server-side (previously had
  no permission logic beyond RLS) and accepts `assignee_id` as a settable field. `DELETE` is
  unchanged — still relies purely on `issues_pm_write` RLS (PM/Admin/super_admin only).
- `issues/[issueId]/page.tsx` now fetches `currentUserId`/`currentUserRole` (mirroring
  `tasks/[taskId]/page.tsx`'s existing pattern) and passes them to the client component.
- Fully redesigned `_issue-detail.tsx` to match `_task-detail.tsx`'s layout/tokens: header badges
  row (`ISSUE · {display_id}`, `StatusBadge`, new `SeverityBadge`, conditional `TaskTimerButton`),
  sidebar-left (`Details`: Status/Severity/Assignee/Due date, each gated by `perm`)/content-right
  (`Description`, now the rich-text `DescriptionField` instead of a plain `<textarea>`) layout, title
  initialized via `decodeHtmlEntities` (closes task 194's leftover issue-detail gap), delete icon
  gated to role (`admin`/`pm`/`super_admin`) independent of the creator edit tier. Reused `SEVERITY_OPTS`
  from `_pm-shared.tsx` for the Severity `<select>` instead of a hardcoded duplicate list.
- Assignee `<select>` now writes `assignee_id` (the real FK) as the source of truth, syncing
  `assignee_name` from the selected profile for display/back-compat and clearing `assignee_email`
  (see Deviations — this is a small, deliberate behavior change from the pre-existing file).

### Files Changed
- `supabase/migrations/100_issues_creator_assignee_active_timer.sql` - new migration.
- `src/types/database.ts` - `issues`/`active_timers` blocks hand-updated for the new columns.
- `src/lib/issues/permissions.ts` - new, `getIssueEditPermission`.
- `src/app/v2/(hub)/projects/_pm-shared.tsx` - added `SeverityBadge`.
- `src/lib/timer/serialize.ts` - `attachTaskTitle` generalized to resolve task or issue titles.
- `src/app/api/v2/timer/start/route.ts` - accepts `task_id` or `issue_id`.
- `src/app/api/v2/timer/stop/route.ts` - branches on `task_id`/`issue_id` for the `time_logs` insert
  and row reset.
- `src/app/v2/(hub)/_components/timer-context.tsx` - `ActiveTimerRow` + `startTimer` widened.
- `src/app/v2/(hub)/_components/timer-floating-widget.tsx` - `hasTask` → `hasEntity`, title fallback
  widened.
- `src/app/v2/(hub)/projects/[projectId]/_task-timer-button.tsx` - prop signature widened to accept
  a task or issue id; `onHoursLogged` simplified and made optional.
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx` - updated
  `DescriptionField`/`TaskTimerButton` import paths and `handleHoursLogged`'s signature to match.
- `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` - adapted its per-row `TaskTimerButton`
  call site to the new `onHoursLogged` signature (see Deviations).
- `src/app/v2/(hub)/projects/[projectId]/_description-field.tsx` - new (relocated from
  `tasks/[taskId]/_task-description-field.tsx`), `uploadUrl` prop replaces the hard-coded endpoint.
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-description-field.tsx` - deleted
  (relocated).
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_comment-editor.tsx` - updated a stale
  comment referencing the old file path.
- `src/app/api/v2/projects/[projectId]/issues/description-images/route.ts` - new.
- `src/app/api/v2/issues/[issueId]/route.ts` - `PATCH` gains `getIssueEditPermission` enforcement
  and `assignee_id` field support.
- `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/page.tsx` - fetches
  `currentUserId`/`currentUserRole`.
- `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/_issue-detail.tsx` - full redesign.

### Deviations From Plan
- **`attachTaskTitle` kept its export name** instead of being renamed, despite resolving both task
  and issue titles now. The task doc left this ambiguous ("generalized... keep the export name's
  call sites updated"); keeping the name avoided touching import lines in all 7 of its call sites
  (3 read in detail during planning, plus `resume`/`pause`/`break/cancel`/`break/start` routes found
  during implementation that also import it) for a purely cosmetic rename. Minor, no behavior change.
- **`_list-view.tsx`'s own `TaskTimerButton` call site** wasn't listed in the task doc's Proposed File
  Changes (only `_task-detail.tsx`'s was) — `npx tsc --noEmit` caught it: that file threads its own
  `onHoursLogged: (taskId, hours) => void` prop through several levels to update a per-row hours map,
  and the button's simplified `(hours) => void` signature broke that call site. Fixed by adapting at
  the call site itself (`onHoursLogged={(hours) => onHoursLogged(task.id, hours)}`), not by reverting
  the button's signature — the list view already knows which task's button is rendering, so closing
  over `task.id` there is the correct fix, not a workaround.
- **Assignee `<select>`'s save behavior changed slightly from the pre-existing file**: the old
  `saveAssignee` kept `assignee_email` unchanged when unassigning (`member ? null : issue.assignee_email`,
  which looks unintentional — unassigning left a stale email). The redesigned version always sets
  `assignee_email: null` when this selector is used (assigning or unassigning), since `assignee_id`
  is now the authoritative link and this UI has no free-text email input to preserve. Small, contained
  correctness fix, not a scope expansion.
- No other deviations — Comments/Attachments/Time Logs tabs are out of scope per the task doc
  (tasks 235/236/237); delete stayed PM/Admin/super_admin-only as specified.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing warnings in `_checklist-tab.tsx`, unrelated to this task, same
  ones task 233's doc already noted)
- Browser/manual RBAC + timer verification (PM full edit, developer assignee status-only + timer
  start/stop, developer with no relationship read-only, floating widget issue title, task-vs-issue
  timer collision, description rich-text/image paste) - SKIPPED (deferred to the `test` stage; the
  migration has not been applied to a live database in this session)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Reviewed all 19 changed/new files against the task doc's Requirements, Proposed File Changes, and
  Out of Scope boundaries (`git diff --stat` scoped to exactly those files, cross-checked against
  `Implementation Notes`' own file list — no unrelated pre-existing working-tree changes from other
  in-flight tasks, e.g. the soft-delete/portfolio-tracker work, were touched or reviewed as part of
  this gate).
- No unused imports/dead code: `_issue-detail.tsx` correctly dropped `STATUS_STYLE`/`SEVERITY_STYLE`
  (superseded by `StatusBadge`/`SeverityBadge`) rather than leaving them imported-but-unused.
- No broad `any`: the one non-obvious type, `TaskTimerButtonProps = TimerEntityRef & {...}` (a
  discriminated union intersected with a shared object type), destructures correctly into
  `{ taskId: string } | { issueId: string }` for the rest param — verified structurally, not just
  by trusting `tsc`'s silence, since union+rest-destructuring is exactly the kind of pattern that
  can silently degrade to `any` if written wrong.
- Server-side enforcement mirrors the established task-route pattern exactly (`getIssueEditPermission`
  gates both field selection and status-value selection in `PATCH /api/v2/issues/[issueId]`,
  `ASSIGNEE_ALLOWED_FIELDS` rejects any other submitted field for the assignee-only tier) — not just
  client-side hiding, so a crafted request from a non-privileged developer is still rejected.
- **Found and fixed during this gate**: `_task-timer-button.tsx`'s "other timer active" tooltip still
  read "Timer running on another task" unconditionally, even when the actual blocker is now an issue
  timer (the `isOtherActive` check itself was already correctly widened to check both `task_id` and
  `issue_id`, just not the copy). Changed to "Timer running on another task or issue". Cosmetic-only,
  no logic change, re-verified `tsc`/`lint` clean after.
- Confirmed the migration's RLS addition (`issues_developer_update`) is additive-only alongside the
  existing `issues_pm_write` (`for all`) policy — Postgres RLS policies for the same operation are
  OR'd together, so PM/Admin/super_admin's existing broad access is unaffected; only visibility for
  developer `UPDATE`s widens. `DELETE` correctly has no new developer policy, matching the task doc's
  Decision 4 (delete stays role-gated, independent of the creator edit tier) — verified by reading the
  unmodified `DELETE` handler directly, not just trusting the doc's claim.

### Deviations
- None beyond what's already documented in the task doc's own "Deviations From Plan" section
  (`attachTaskTitle` name kept, the `_list-view.tsx` call site fix, the assignee-email-clearing
  correctness fix) — all Minor, already justified with rationale, no scope expansion.
- The tooltip-text fix found in this gate is itself Minor (copy-only, no behavior/scope change) and
  was applied directly rather than left open.

### Required Fixes
- None.
