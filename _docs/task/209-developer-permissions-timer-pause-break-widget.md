# 209: Developer Role Permissions (Hide New Project, Task Creation/Edit Rules) + Task Timer Pause/Resume + Floating Break Widget

**Created:** 2026-08-05
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep

---

## Overview

Four related developer-role changes to the native Projects module (`src/app/v2/(hub)/projects/**`), scoped and confirmed with the user via `AskUserQuestion` before writing this doc (the three answers below are load-bearing — do not re-derive from the raw request text alone):

1. **Hide "New Project."** Only `pm`/`admin`/`super_admin` can create projects. The `/v2/projects` list already blocks `developer` project *creation* at the RLS layer (`projects_pm_write`, migration 026, `admin`/`pm` only) — this task only needs to hide the button; no DB change required here.
2. **Task creation opens up to developers.** The "New Task" button/modal (`_project-detail.tsx:429-434`, `CreateTaskModal`) is already visible to every role with page access — nothing blocks a developer from clicking it today except a missing RLS INSERT policy on `tasks`, which silently fails the insert. This task adds that policy.
3. **Task edit permission model** (confirmed via `AskUserQuestion`, overriding a literal read of "otherwise read-only"): a developer who is the task's **creator** gets full edit rights, exactly like today's PM/admin behavior. A developer who is only **assigned** (not creator) may change status to **`in_progress` or `ready_for_qa`** only — no editing of title, description, priority, dates, milestone, assignees, or attachments. A developer who is neither creator nor assignee gets the existing read-only view (this part is unchanged — `tasks_staff_read` already allows visibility, no write path already existed for this case).
4. **Timer pause/resume + a hub-wide floating break widget.** The list view already has a working start→stop `TimerButton` (`_list-view.tsx:161-209`) that only logs `time_logs` on stop, with everything held in local component `useState` (lost on navigation/refresh, and nothing outside that row can see or control it). The floating break widget (confirmed: **hub-wide overlay**, mounted in `V2HubShell` so it can pause a timer regardless of which page the developer is on) needs to reach into that same running timer from an entirely different part of the component tree, and the state needs to survive navigation and refresh — confirmed: **server-persisted** via a new `active_timers` table + API routes, replacing the local-`useState` timer entirely.

## Requirements

- [ ] `/v2/projects` "New Project" button is hidden for `role === "developer"`; unaffected for `pm`/`admin`/`super_admin`.
- [ ] A `developer` can create a task via the existing "New Task" modal on any project they can already see (task 208 visibility rules unaffected) — the insert currently fails silently due to missing RLS; fix that.
- [ ] Task edit permission, enforced server-side (API + RLS) and reflected client-side (disabled/hidden controls), for `role === "developer"`:
  - Creator (`tasks.created_by === current user`): full edit — title, description, priority, due/start date, milestone, assignees, attachments, delete — identical to PM/admin.
  - Assignee-only (in `tasks.assignees`, not creator): may set `status` to `in_progress` or `ready_for_qa` only. Every other field is read-only. Attempting any other field write via the API is rejected (403).
  - Neither creator nor assignee: fully read-only (unchanged from today).
  - `pm`/`admin`/`super_admin`: unaffected, full edit on everything, as today.
- [ ] A developer assigned to a task sees a Timer icon on that task (list view row — existing `isAssignedToMe` gate at `_list-view.tsx:659` stays the entry condition). Clicking it starts a server-persisted timer. Only one timer may be active per developer at a time — the Play control on any other task is disabled while one is running/paused elsewhere.
- [ ] The developer can pause the running timer (banks elapsed time, does not log it yet) and resume it later. A separate explicit stop action logs the banked+running time to `time_logs` (`source: "timer"`) and clears the active timer.
- [ ] A hub-wide floating widget (visible to `role === "developer"` on every `/v2/*` page, mounted in `V2HubShell`) toggles open to reveal three break buttons, each showing a tooltip and only one selectable at a time:
  - Utensils icon, label "60 mins", tooltip "Meal Break for 60 mins" → 60-minute break.
  - Coffee icon, label "15 mins", tooltip "Coffee Break for 15 mins" → 15-minute break.
  - Clock icon, label "Few Minutes Break", tooltip "Few Minutes Break for 5 mins" → 5-minute break (duration not specified in the request — defaulting to 5 minutes; flag for confirmation during review).
- [ ] Clicking a break button auto-pauses the active timer (if one is running) and starts a countdown shown on/near the widget of minutes:seconds remaining. Only one break can be active at a time — the other two break buttons are disabled while one is running.
- [ ] When the countdown reaches zero (or the developer manually ends the break), the break clears. The timer stays **paused** — it does not auto-resume; the developer must explicitly resume it (avoids silently billing time while away).
- [ ] Any Timer control (row Play/Pause, floating widget's pause/resume) reflects true server state after a page refresh or navigating to a different page/tab.

## Out of Scope / Must-Not-Change

- Board view drag-and-drop and Calendar view are adjusted only enough to respect the same status-write restriction (assignee-only devs can only drop/set a card into `in_progress`/`ready_for_qa`); no other board/calendar behavior changes.
- Task **delete** stays PM/admin/super_admin-only via existing `tasks_pm_write` — a developer cannot delete even a task they created. Not requested, not added.
- No change to task **comments** (`task_comments` RLS already allows any staff author to insert/delete their own — unaffected) or to the developer project-visibility rules from task 208.
- No change to `issues` — this task is tasks-only, matching the request's wording.
- Break durations are fixed server-side (`meal: 60`, `coffee: 15`, `few_minutes: 5`) — no admin-configurable break-duration settings UI.
- Only one active timer per developer, globally (not per-project) — starting a second task's timer while one is active elsewhere is blocked, not auto-switched.
- `pm`/`admin`/`super_admin` do not get timer/break UI — this is a developer-only feature per the request's framing throughout.
- No retroactive backfill/migration of historical `time_logs` rows — this only changes how *new* timer sessions are captured.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/092_developer_task_permissions_and_active_timers.sql` | Create | `tasks_developer_insert` policy, replace `tasks_developer_update`, widen `task_content_staff_write` storage policy to `developer`, new `active_timers` table + RLS |
| `src/lib/tasks/permissions.ts` | Create | `getTaskEditPermission(role, userId, task)` — shared client+server permission helper |
| `src/lib/timer/constants.ts` | Create | `BREAK_DURATIONS_MIN` map, `BreakType` type — single source of truth for durations |
| `src/app/v2/(hub)/projects/page.tsx` | Modify | Add `canCreateProject` (same role set as `canManageTags`), pass to `ProjectsIndex` |
| `src/app/v2/(hub)/projects/_projects-index.tsx` | Modify | Accept `canCreateProject`, gate the "New Project" button (~line 466-472) |
| `src/app/v2/(hub)/projects/[projectId]/_get-project-detail-data.ts` | Modify | Derive `currentUserRole` from the already-fetched `allMembers` (no new query), add to return type |
| `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` | Modify | Accept `currentUserRole`; thread to `ListView`/`BoardView`/`CreateTaskModal`; remove local `handleTimerStop`/`onTimerStop` (superseded by global timer context) |
| `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` | Modify | `Row`: use `getTaskEditPermission` to gate `AssigneePicker` (creator-only) and restrict status `<select>` options; replace local `TimerButton` with the shared `useTimer()` context (play/pause/stop) |
| `src/app/v2/(hub)/projects/[projectId]/_board-view.tsx` | Modify | Thread `currentUserRole`; disable drag for cards the current developer can't move; restrict drop-target columns to `allowedStatusValues` when not `"all"` |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/page.tsx` | Modify | Resolve `currentUserId`/`currentUserRole` (mirrors the `/v2/projects` `page.tsx` pattern), pass to `TaskDetailClient` |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | Accept `currentUserId`/`currentUserRole`; compute permission once; disable/hide title, description, priority, milestone, dates, estimate, delete when `!canEditDetails`; restrict status options; pass `canEdit` to `TaskAttachments` |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachments.tsx` | Modify | Accept `canEdit`, hide upload/delete controls when false (viewing stays available) |
| `src/app/api/v2/tasks/[taskId]/route.ts` | Modify | PATCH: fetch task + resolve role, call `getTaskEditPermission`, strip/reject disallowed fields and disallowed status values (403) |
| `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/route.ts` | Modify | POST: replace hard `admin/super_admin/pm`-only gate with creator-aware check (developer allowed only if `task.created_by === user.id`) |
| `src/app/api/v2/timer/route.ts` | Create | `GET` — current user's active timer/break row, or `null` |
| `src/app/api/v2/timer/start/route.ts` | Create | `POST { task_id, project_id }` — must be assignee; 409 if a timer is already active |
| `src/app/api/v2/timer/pause/route.ts` | Create | `POST` — bank elapsed seconds, clear `segment_started_at` |
| `src/app/api/v2/timer/resume/route.ts` | Create | `POST` — resume from manual pause (blocked while a break is active) |
| `src/app/api/v2/timer/stop/route.ts` | Create | `POST` — computes final hours server-side, inserts `time_logs`, clears the timer portion of the row |
| `src/app/api/v2/timer/break/start/route.ts` | Create | `POST { break_type }` — server-resolved duration, auto-pauses an active timer |
| `src/app/api/v2/timer/break/cancel/route.ts` | Create | `POST` — clears break fields; deletes the row if nothing else is tracked |
| `src/app/api/v2/tasks/[taskId]/timelog/route.ts` | Delete | Superseded by `/api/v2/timer/stop` — only caller was the old `handleTimerStop`, which is being removed |
| `src/app/v2/(hub)/_components/timer-context.tsx` | Create | `TimerProvider` + `useTimer()` — fetches/holds active timer state, exposes start/pause/resume/stop/startBreak/cancelBreak, client-side tick for display |
| `src/app/v2/(hub)/_components/timer-floating-widget.tsx` | Create | Hub-wide floating toggle + break buttons + countdown, `role === "developer"` only |
| `src/app/v2/(hub)/_components/v2-hub-shell.tsx` | Modify | Wrap children in `<TimerProvider>`, render `<TimerFloatingWidget />` when `userRole === "developer"` |

## Code Context

**Existing `TimerButton` (to be replaced) — `_list-view.tsx:163-209`:** local `useState`, start→stop only, hours computed client-side and passed to `onStop`. Rendered only when `isAssignedToMe` (`_list-view.tsx:584,659`) — keep that gate.

**Existing task creation — already open to all roles client-side (`_project-detail.tsx:429-434`, `CreateTaskModal` at line 818); the only blocker is RLS.** `POST /api/v2/projects/[projectId]/tasks` (`src/app/api/v2/projects/[projectId]/tasks/route.ts:55-72`) already sets `created_by: user.id` — no API change needed there, only the RLS insert policy.

**Current tasks RLS (`supabase/migrations/026_rls_policies_v2.sql:86-102`):**
```sql
create policy "tasks_staff_read"
  on tasks for select to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer'));

create policy "tasks_pm_write"
  on tasks for all to authenticated
  using (get_my_role() in ('admin', 'pm'))
  with check (get_my_role() in ('admin', 'pm'));

create policy "tasks_developer_update"
  on tasks for update to authenticated
  using (get_my_role() = 'developer' and auth.uid() = any(assignees))
  with check (get_my_role() = 'developer');
```
No INSERT policy exists for `developer` — this is why task creation silently fails today for that role. `tasks_pm_write` also doesn't cover `super_admin`; that's a pre-existing gap, out of scope here (mirrors task 208's own note about `canManageTags`).

**Migration 092 — new/changed policies (append to a new file, don't edit 026):**
```sql
-- tasks: developer can create their own tasks.
create policy "tasks_developer_insert"
  on tasks for insert to authenticated
  with check (get_my_role() = 'developer' and created_by = auth.uid());

-- tasks: widen update visibility to creator OR assignee (row-level only —
-- field/value-level restriction ["assignee-only devs limited to status
-- in_progress/ready_for_qa"] is enforced in the PATCH API route, matching
-- this policy's own pre-existing lack of field-level restriction).
drop policy if exists "tasks_developer_update" on tasks;
create policy "tasks_developer_update"
  on tasks for update to authenticated
  using (get_my_role() = 'developer' and (created_by = auth.uid() or auth.uid() = any(assignees)))
  with check (get_my_role() = 'developer');

-- task-content storage bucket (migration 091): allow developer uploads for
-- inline description images. App-layer already restricts who can open the
-- description editor for a given task; this only widens the role-level gate.
drop policy if exists "task_content_staff_write" on storage.objects;
create policy "task_content_staff_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'task-content'
    and get_my_role() in ('admin', 'super_admin', 'pm', 'developer')
  );

-- ─── active_timers — one row per developer, server-persisted timer + break state ──
create table if not exists active_timers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles (id) on delete cascade,
  task_id uuid references tasks (id) on delete cascade,
  project_id uuid references projects (id) on delete cascade,
  status text check (status in ('running', 'paused')),
  accumulated_seconds numeric not null default 0,
  segment_started_at timestamptz,
  break_type text check (break_type in ('meal', 'coffee', 'few_minutes')),
  break_started_at timestamptz,
  break_duration_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_active_timers_task_id on active_timers (task_id);

alter table active_timers enable row level security;

create policy "active_timers_developer_own"
  on active_timers for all to authenticated
  using (get_my_role() = 'developer' and user_id = auth.uid())
  with check (get_my_role() = 'developer' and user_id = auth.uid());
```
`task_id`/`project_id` are nullable because a break can exist with no task timer running (a developer can take a break without having started a timer at all). `status`/`accumulated_seconds`/`segment_started_at` are only meaningful when `task_id` is set; `break_*` fields are only meaningful when `break_type` is set. Both can be set simultaneously (timer paused-for-break).

**Existing time_logs RLS already covers the stop-and-log insert** (`026_rls_policies_v2.sql:146-150`, `time_logs_developer_own`, full CRUD on own rows) — no change needed there.

**Existing attachment POST hard-blocks developers today** (`src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/route.ts:64-67`):
```ts
const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
if (!profile || !["admin", "super_admin", "pm"].includes(profile.role)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```
Change to: fetch the task (need `created_by` anyway before the existing `project`/`task` lookups at lines 69-73 — reorder so task is fetched once and reused), then allow if `["admin","super_admin","pm"].includes(profile.role)` **or** (`profile.role === "developer" && task.created_by === user.id`).

**`V2HubShell` is already a client component receiving `userRole`** (`src/app/v2/(hub)/_components/v2-hub-shell.tsx:15`) and already renders sibling floating-style children (`OpsChat`, `PushPermissionPrompt`) alongside `{children}` — same mounting point for `TimerProvider`/`TimerFloatingWidget`.

**Status enum + labels** (`_pm-shared.tsx:28-37`) — the two statuses a non-creator assignee may set: `in_progress` ("In Progress"), `ready_for_qa` ("Ready for QA/QC").

## Implementation Steps

1. Write and apply migration 092 (RLS + `active_timers` table) per Code Context above.
2. `src/lib/tasks/permissions.ts`:
   ```ts
   export const DEVELOPER_ASSIGNEE_STATUS_OPTIONS: TaskStatus[] = ["in_progress", "ready_for_qa"];
   export type TaskEditPermission = {
     canEditDetails: boolean;
     canChangeStatus: boolean;
     allowedStatusValues: TaskStatus[] | "all";
   };
   export function getTaskEditPermission(
     role: string | null | undefined,
     userId: string,
     task: { created_by: string | null; assignees: string[] | null }
   ): TaskEditPermission { /* admin/pm/super_admin -> all; creator -> all;
     assignee-only -> canChangeStatus + DEVELOPER_ASSIGNEE_STATUS_OPTIONS;
     else -> fully read-only */ }
   ```
   No framework imports — safe to import from both server (API routes) and client (`"use client"` components).
3. `src/lib/timer/constants.ts`: `export type BreakType = "meal" | "coffee" | "few_minutes"; export const BREAK_DURATIONS_MIN: Record<BreakType, number> = { meal: 60, coffee: 15, few_minutes: 5 };`
4. New Project button: `page.tsx` adds `canCreateProject = role === "admin" || role === "pm" || role === "super_admin"` (separate prop from `canManageTags` even though the role set matches today — different capability), passes to `ProjectsIndex`; `_projects-index.tsx` wraps the button JSX in `{canCreateProject && (...)}`.
5. `_get-project-detail-data.ts`: `const currentUserRole = (profilesRes.data ?? []).find((p) => p.id === currentUserId)?.role ?? null;` add to the returned object and `ProjectDetailData` type.
6. `_project-detail.tsx`: accept `currentUserRole`, thread to `ListView`, `BoardView`, `CreateTaskModal` (developer needs the tasklist/assignee UI already there — no change to the modal itself, just confirm developers reach it, which they already do). Remove `handleTimerStop` and the `onTimerStop` prop passed to `ListView` — the row's timer action now calls `useTimer()` directly.
7. `_list-view.tsx`:
   - `Row` computes `const perm = getTaskEditPermission(currentUserRole, currentUserId, task);`
   - `AssigneePicker`: render only when `perm.canEditDetails`; otherwise render the existing static assignee display (check `_project-detail.tsx`/board view for the read-only chip pattern already used elsewhere, e.g. `AssigneeChip` in `_pm-shared.tsx:321`).
   - Status `<select>`: `options={perm.allowedStatusValues === "all" ? STATUS_OPTS : perm.allowedStatusValues}`; `disabled={!perm.canChangeStatus}`.
   - Replace `TimerButton` with a version reading from `useTimer()`: shows Play (disabled if another timer is active elsewhere), running mm:ss + Pause when this task is the active one and running, Play (resume) + a small Square "stop & log" icon when paused. Keep the existing `isAssignedToMe` gate — a developer must still be assigned to see any timer control at all, even if they're also the creator.
8. `_board-view.tsx`: thread `currentUserRole`; in `SortableCard`, only spread `useSortable`'s `attributes`/`listeners` when `getTaskEditPermission(...).canChangeStatus` is true for that card; in `handleDragEnd`, if the permission for the dragged task restricts `allowedStatusValues` and the drop target column's status isn't in that list, no-op the drop (don't call `onUpdate`).
9. `tasks/[taskId]/page.tsx`: resolve `currentUserId` (via `supabase.auth.getClaims()`, same pattern as `_get-project-detail-data.ts`) and `currentUserRole` (via `profiles` lookup), pass both to `TaskDetailClient`.
10. `_task-detail.tsx`: accept the two new props, compute `getTaskEditPermission` once, use it to add `disabled`/`readOnly` to the title input, `TaskDescriptionField` (needs a `readOnly` prop threaded through to its editor), priority `<select>`, milestone `<select>`, due/start date inputs, estimate hours input; hide the Delete button entirely when `!canEditDetails`; restrict the status `<select>` the same way as step 7; pass `canEdit={perm.canEditDetails}` to `TaskAttachments`.
11. `_task-attachments.tsx`: accept `canEdit`, hide the upload trigger and any per-attachment delete affordance when `false`; the list/view/download UI stays available to any role that can already read the task.
12. `src/app/api/v2/tasks/[taskId]/route.ts` PATCH: fetch the task's `created_by`/`assignees` before building `patch`; resolve requester role via `profiles`; call `getTaskEditPermission`. If `!canEditDetails`: reject (400/403) if `body` contains any key besides `status`; if `status` present, reject unless it's in `allowedStatusValues` (or `allowedStatusValues === "all"`). If `!canChangeStatus` and any body key present at all: 403. `pm`/`admin`/`super_admin` (and creator-developer) paths are unchanged.
13. `attachments/route.ts` POST: reorder to fetch `task` (including `created_by`) before/alongside the role check; replace the hard role gate with the creator-aware check described in Code Context.
14. Timer API routes (`src/app/api/v2/timer/**`) — each: `createClient()` from `@/lib/supabase/server`, resolve `user`/role via `profiles` (or trust RLS + return whatever comes back, but still 401 on no session), implement the state transition described in Requirements/Out-of-Scope. `stop` computes `elapsed = accumulated_seconds + (status === "running" ? (Date.now() - segment_started_at)/1000 : 0)`, `hours = elapsed / 3600`, inserts into `time_logs` only if `hours > 0`, then either deletes the row (no break active) or clears just the timer columns (break still active).
15. `timer-context.tsx`: `TimerProvider` fetches `GET /api/v2/timer` on mount, exposes the row plus action functions (each action calls its route, then re-fetches or optimistically updates local state), runs a 1s `setInterval` purely for display (`elapsedSeconds`, `breakRemainingSeconds` — both computed from server timestamps, not incremented client-side, so a stale tab self-corrects on next tick); auto-calls `break/cancel` when `breakRemainingSeconds` hits 0.
16. `timer-floating-widget.tsx`: toggle button (fixed position, e.g. `fixed bottom-6 right-6 z-50`, matching the floating-action-button convention); expanded panel shows the three break buttons (Utensils/Coffee/Clock from `lucide-react`, `Tooltip`/`TooltipTrigger`/`TooltipContent` from `@/components/ui/tooltip`) when no break is active, or a single countdown + "End Break" button when one is. Also surfaces the active task timer (title truncated, mm:ss, pause/resume) when one exists, so a developer working on a different page can still see/control it.
17. `v2-hub-shell.tsx`: wrap the existing render tree in `<TimerProvider>` (or only when `userRole === "developer"` — cheaper, and matches the feature's role scope) and add `{userRole === "developer" && <TimerFloatingWidget />}` alongside `OpsChat`/`PushPermissionPrompt`.
18. Delete `src/app/api/v2/tasks/[taskId]/timelog/route.ts` (confirm no other caller first — only reference found is the `handleTimerStop` being removed in step 6).
19. `npx tsc --noEmit` after each file group (permissions/RLS → task-detail/list/board → timer API → timer UI).

## Acceptance Criteria

- [ ] Logged in as `developer`: `/v2/projects` shows no "New Project" button. `pm`/`admin`/`super_admin` still see it and can create.
- [ ] Logged in as `developer`: can open "New Task" on a visible project and successfully create a task (previously failed silently).
- [ ] Logged in as the `developer` who created a task: full edit — title, description, priority, dates, milestone, assignees, attachments, any status — works exactly like PM/admin.
- [ ] Logged in as a `developer` assigned to (but not the creator of) a task: title/description/priority/dates/milestone/assignees/attachments are all read-only (disabled inputs, no delete button); the status control only offers/accepts `In Progress` and `Ready for QA/QC`; attempting any other field change via a direct API call returns 403.
- [ ] Logged in as a `developer` who is neither creator nor assignee: task remains fully read-only (unchanged from today).
- [ ] Assigned developer sees the Timer icon on that row; clicking Play starts a timer; the Play control on every other task is disabled while it's active.
- [ ] Clicking Pause on the running timer stops the clock without logging hours yet; Resume continues from the banked time; a separate stop action logs the total hours to `time_logs` and clears the timer.
- [ ] Refreshing the page, or navigating away and back, shows the timer in its true running/paused state (not reset).
- [ ] The floating widget appears on every `/v2/*` page for `role === "developer"` only, and is absent for other roles.
- [ ] Clicking "Meal Break" starts a 60-minute countdown, auto-pauses any running timer, and disables the other two break buttons until it ends or is manually ended; same for Coffee (15 min) and Few Minutes (5 min).
- [ ] When a break's countdown reaches zero, the break clears and the timer (if any) stays paused — it does not auto-resume.
- [ ] `npx tsc --noEmit` passes with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Browser-based acceptance pass required per `CLAUDE.md` (role-scoped permissions + a stateful, cross-page timer widget are not covered by typecheck alone):
- Log in as `developer`: verify New Project hidden, task creation works, edit restrictions on an assigned-not-created task, full edit on a self-created task, timer start/pause/resume/stop across a page refresh and a navigation to a different `/v2/*` page, break button mutual exclusivity and countdown, break auto-pausing the timer.
- Log in as `pm`/`admin`: verify zero regressions — New Project button present, full task edit on everything, no timer/break widget rendered.

## Compatibility Touchpoints

- `POST /api/v2/tasks/[taskId]/timelog` is removed — confirm no other consumer exists beyond the `handleTimerStop` callback being deleted in this task before deleting the route file.
- New public API surface (`/api/v2/timer/**`) — not currently referenced in `_docs/mcp-tools.md` (MCP tool inventory) since these are plain UI-facing routes, not MCP-registered tools; no update needed there.
- `active_timers` is a new table — not part of any existing export/import (Zoho decommission) pipeline; no touchpoint there.

## Implementation Notes

### What Changed
- "New Project" button on `/v2/projects` is now gated behind `canCreateProject` (admin/pm/super_admin), computed and passed down from `page.tsx` → `_projects-index.tsx`.
- `tasks_developer_insert` RLS policy added — developers can now create tasks (the "New Task" button was already unrestricted client-side; only the missing INSERT policy was blocking it).
- `tasks_developer_update` RLS widened to creator OR assignee at the row level; field/value restriction (assignee-only devs limited to `status` ∈ {`in_progress`, `ready_for_qa`} + `position`, everything else read-only) is enforced in `PATCH /api/v2/tasks/[taskId]`, backed by a single shared `getTaskEditPermission()` helper used by both that route and every client surface (list view, board view, task detail page).
- Task attachments POST route now allows a developer to upload to a task they created (previously hard-blocked for every developer, including on their own new task).
- `task-content` storage bucket policy (inline description-image paste) widened to include `developer`.
- Task timer rebuilt from local per-row `useState` (start→stop only, lost on navigation) into a server-persisted model: new `active_timers` table (one row per developer, nullable task/break fields so a break can exist independently of a task timer) + 7 API routes (`GET`, `start`, `pause`, `resume`, `stop`, `break/start`, `break/cancel`) + a `TimerProvider` context mounted hub-wide for the developer role, replacing the old `POST /api/v2/tasks/[taskId]/timelog` endpoint (deleted).
- New hub-wide floating widget (`TimerFloatingWidget`, mounted in `V2HubShell`, developer-only) shows the active task timer and three break toggles (Meal 60 min / Coffee 15 min / Few Minutes 5 min), each with the requested tooltip text, mutually exclusive, with a live countdown; ending or expiring a break leaves the timer paused (no auto-resume).
- Row-level Timer control in the task list (`TaskTimerButton`) now reads/writes the same shared `TimerProvider` state instead of local component state, so it reflects the true server state after navigation or refresh, and is disabled (with a tooltip) on every other task while one timer is active.

### Files Changed
- `supabase/migrations/092_developer_task_permissions_and_active_timers.sql` - new RLS policies + `active_timers` table (**not yet applied** — no local Supabase CLI/config found in this repo; needs to be run against the project's Supabase instance manually, e.g. via the SQL editor)
- `src/types/database.ts` - added the `active_timers` table type by hand (no CLI available to regenerate from the live schema)
- `src/lib/tasks/permissions.ts` - new shared `getTaskEditPermission()`
- `src/lib/timer/constants.ts`, `format.ts`, `serialize.ts` - new small timer utilities
- `src/app/v2/(hub)/projects/page.tsx`, `_projects-index.tsx` - New Project button gate
- `src/app/v2/(hub)/projects/[projectId]/_get-project-detail-data.ts` - derives `currentUserRole`
- `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` - threads `currentUserRole`; removed local `handleTimerStop`/`onTimerStop`, replaced with `onHoursLogged`
- `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` - permission-gated status select + `AssigneePicker`; swapped local `TimerButton` for `TaskTimerButton`
- `src/app/v2/(hub)/projects/[projectId]/_board-view.tsx` - permission-gated drag (disabled per-card) and drop-target column restriction
- `src/app/v2/(hub)/projects/[projectId]/_task-timer-button.tsx` - new, shared row-level timer control
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/page.tsx`, `_task-detail.tsx`, `_task-description-field.tsx` - permission-gated fields on the task detail page
- `src/app/api/v2/tasks/[taskId]/route.ts` - PATCH field/status enforcement via `getTaskEditPermission`
- `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/route.ts` - creator-aware developer upload check
- `src/app/api/v2/timer/**` (7 new route files) - timer/break API
- `src/app/api/v2/tasks/[taskId]/timelog/route.ts` - deleted (superseded)
- `src/app/v2/(hub)/_components/timer-context.tsx`, `timer-floating-widget.tsx` - new
- `src/app/v2/(hub)/_components/v2-hub-shell.tsx` - mounts `TimerProvider`/`TimerFloatingWidget` for developer role

### Deviations From Plan
- `_task-attachments.tsx` was **not modified**. On reading the live file, it turned out to already be a pure read-only viewer (no upload/delete UI exists on the task detail page at all — attachments are only added once, during task creation, via a separate picker in the "New Task" modal). The planned `canEdit` prop had nothing to gate, so it was dropped rather than adding a dead prop.
- "Few Minutes Break" duration defaulted to 5 minutes and its icon to `Clock` (lucide-react) — neither was specified in the original request; flagged for confirmation.
- The task doc's Code Context section stated `tasks_pm_write`/`projects_pm_write` don't cover `super_admin` (mirroring an old note from task 208). On reading migration `048_super_admin_rls.sql` during implementation, both policies were already widened to include `super_admin` — that earlier note was stale. No code change was needed either way since the UI-side `canManageTags`/`canCreateProject` checks already included `super_admin`.
- PATCH route's allow-list for assignee-only developers includes `position` alongside `status` (not just `status` as literally scoped) — necessary because the board view's drag-and-drop always sends `{status, position}` together as one action; rejecting `position` would have broken the assignee-only developer's ability to move a card between their two allowed columns at all. This was called out as a build-time judgment call, not a silent scope change.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Browser-based acceptance pass - SKIPPED (no browser session in this implementation run; migration 092 also needs to be applied to the database before any of this is testable end-to-end — see Files Changed note above)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Fixed one real finding during this pass: `BREAK_LABELS` in `src/lib/timer/constants.ts` was dead code (exported, never imported), while `timer-floating-widget.tsx` instead derived the same label via a fragile regex-strip of the tooltip string (`BREAK_META[timer!.break_type!].tooltip.replace(/ for .*/, "")`) — a redundant double-lookup plus two unnecessary non-null assertions. Replaced with a `breakLabel` value computed the same optional-chaining way `breakMeta` already was (`timer?.break_type ? BREAK_LABELS[timer.break_type] : null`), which also let both assertions be dropped. Re-ran `tsc`/`lint` after the fix — both still clean.
- No other unused code, dead code, or commented-out implementation found across the changed files.
- No `any` escape hatches or debug `console.log` in any new/changed file (`console.error` only, on genuine error paths, matching existing route conventions).
- Permission logic has one source of truth (`getTaskEditPermission`) reused identically in the PATCH route, list view, board view, and task detail page — no duplicated/drifting copies of the rule.
- API routes follow guard-clause style throughout (401 → not-found → permission → validation → mutate); no deep nesting.
- Pre-existing, unrelated `design-system-font-size` hook findings (12px/11px/9.5px) surfaced repeatedly during implementation on files this task touched — verified these match the same micro-type scale already used pervasively elsewhere in the same files/module before this task; not a new deviation, left unchanged.
- Noted but out of scope to touch: `_task-drawer.tsx` (in the same `[projectId]` directory) is pre-existing dead code — not imported anywhere in the codebase, predates this task, and its own task-PATCH call site would already inherit this task's new enforcement if it were ever wired up. No action taken.

### Deviations
- Minor — `_task-attachments.tsx` left unmodified. On inspection it was already a pure read-only viewer with no upload/delete UI on the task detail page at all (uploads only happen once, during task creation, via a separate picker). The planned `canEdit` prop had nothing to gate; adding it would have been a dead prop. Correctly resolves the underlying requirement (attachments read-only for non-editors) without code.
- Minor — "Few Minutes Break" duration defaulted to 5 minutes, icon defaulted to `Clock`. Neither was specified in the original request; both are cheap to change (single line in `src/lib/timer/constants.ts` / `timer-floating-widget.tsx`) if the user wants a different value.
- Medium — PATCH route's field allow-list for assignee-only developers is `{status, position}`, not literally just `status` as the requirement's wording implies. Necessary because board drag-and-drop always sends both fields as one action; rejecting `position` would silently break the assignee-only developer's ability to move a card between their two allowed columns. `position` is cosmetic ordering only (not a "detail" field per the user's own clarification distinguishing status changes from task-detail edits), so risk is low, but flagging as visible-to-user since it technically widens the literal allow-list.

### Required Fixes
None.

## Post-QA Fixes (User-Reported, Live Browser Testing)

Four follow-up fixes requested directly by the user after trying the shipped feature in-browser — none change scope, all are corrections to the initial implementation.

1. **Break-button tooltips rendered behind the floating panel.** The `TimerFloatingWidget` wrapper used `z-[9999]`, but the shared `Tooltip` component (`src/components/ui/tooltip.tsx`) portals its content to `document.body` at only `z-50` — so the widget's own panel (stacked above the portaled tooltip) hid it. Fixed by lowering the widget wrapper to `z-40` (the design system's documented `--z-popover` level), which sits below the shared Tooltip's `z-50` while staying above sticky headers (`z-20`). File: `timer-floating-widget.tsx`.
2. **Row-level Pause timer used a native `title` attribute instead of a styled tooltip.** The task list's `TaskTimerButton` had two states already using the app's `Tooltip` component (disabled "other task active" and "on break") but the Start/Pause/Resume/Stop states used the plain HTML `title` attribute. Converted all four to `Tooltip`/`TooltipTrigger`/`TooltipContent` for consistency. File: `_task-timer-button.tsx`.
3. **"Time logged" column reformatted.** Was `1.5h`-style; changed to zero-padded `hh:mm` (e.g. `01:30`), with a hover tooltip showing the plain-language total ("1 hour and 30 minutes", "45 minutes", "2 hours" — singular/plural handled, hour-only and minute-only cases collapse correctly). Added `formatHoursAsHHMM()`/`formatHoursInWords()` to `src/lib/timer/format.ts` alongside the existing `formatMMSS()`; wired into the `Row` component's "Hours logged" cell in `_list-view.tsx` using the same `Tooltip` pattern as everywhere else in that file.
4. **Start Timer icon changed from `Play` to `Timer` (lucide-react).** Scoped to the specific enabled "Start timer" button only (`_task-timer-button.tsx`) — the disabled "timer running on another task" indicator still uses `Play`, since it's a distinct blocked-state affordance, not the start action itself; left unchanged per the literal scope of the request.

`npx tsc --noEmit` and `pnpm lint` re-run clean after each of the four fixes.

**Status: Completed.**
