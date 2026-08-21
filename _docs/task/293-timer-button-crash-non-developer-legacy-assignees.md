# 293: Open Timer Tracking to All Roles (fixes "useTimer must be used within a TimerProvider" crash)

**Created:** 2026-08-21
**Priority:** HIGH
**Type:** bugfix / enhancement
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

The Admin user gets a hard runtime-error crash ("useTimer must be used within a TimerProvider") when opening the Tasks tab of legacy projects (reported: `localhost:3000/projects/legacy/C30DE6A5-PROJ-01/tasks`), reproducing on every legacy project she opens, and it's happened twice now. The crash takes down the whole route (Next.js falls back to its generic "This page couldn't load" boundary — there's no local `error.tsx` for this segment).

### Root cause

`<TaskTimerButton>` (`src/app/(hub)/projects/_shared/_task-timer-button.tsx:25`) calls `useTimer()`, whose context is supplied by `<TimerProvider>` — and today `TimerProvider` only mounts when `userRole === "developer"` (`src/app/(hub)/_components/v2-hub-shell.tsx:67-76`, task 209: "timer + break widget is developer-only").

`<TaskTimerButton>` itself is gated only on `isAssignedToMe = task.assignees?.includes(currentUserId)` — with **no role check** — at three call sites:
- `src/app/(hub)/projects/_shared/_list-view.tsx:645,755` (the crash in the screenshot)
- `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-detail.tsx:98,178`
- `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-detail.tsx:98,179`

Each carries a task-218 comment explaining the (broken) assumption: "only developers are ever assignees, so this assignment check is what keeps `useTimer()` from being called without a provider." That invariant doesn't hold for legacy Zoho-imported tasks — `src/app/api/admin/zoho-import/tasks/route.ts:164-166` maps each Zoho task's owner email straight to a Hub user ID via `hub_users`, with **no role filter**. Zoho task ownership was never restricted to Hub `developer`s, so the Admin user's ID ended up in `assignees` on legacy tasks she owned in Zoho, `isAssignedToMe` evaluates `true` for her, `<TaskTimerButton>` renders, and `useTimer()` throws because her (non-developer) role never gets a `TimerProvider`.

### Direction (per user decision, supersedes the original narrower plan)

Rather than patch the three render-gates to also check `role === "developer"` (which would just hide the button for non-developers), **open timer tracking to every role**: `TimerProvider` and `TimerFloatingWidget` mount hub-wide regardless of role, and the timer API/RLS layer is widened to match. This fixes the crash at its root (context is always available, so the existing `isAssignedToMe`-only gate becomes safe) and turns time tracking into a feature every role can use on tasks/issues assigned to them, not just developers.

**This is a bigger surface than a UI-only fix — investigation found the "developer-only" restriction is enforced in three independent layers, all of which currently 403/deny non-developers even after the client-side gate is removed:**

1. **Client shell** — `v2-hub-shell.tsx:69`: `if (userRole !== "developer") return shell;` skips mounting `TimerProvider`/`TimerFloatingWidget` entirely for other roles.
2. **API routes** — explicit role checks that 403 non-developers:
   - `src/app/api/v2/timer/start/route.ts:16-19` — `if (profile?.role !== "developer") return 403 "Only developers can start a timer"`
   - `src/app/api/v2/timer/break/start/route.ts:16-19` — same pattern, "Only developers can take a tracked break"
3. **Database RLS** — two policies scope the underlying tables to `developer` role, not just row ownership:
   - `active_timers_developer_own` (migration 092, `092_developer_task_permissions_and_active_timers.sql:63-66`) — `for all` on `active_timers`, `using/with check (get_my_role() = 'developer' and user_id = auth.uid())`. Without a migration, even a client + API fix would fail here first — every insert/update/select on `active_timers` (start, pause, resume, stop, break start/cancel) would still be denied for non-developers.
   - `time_logs_developer_own` (migration 026, `026_rls_policies_v2.sql:147-150`) — `for all` on `time_logs`, `using/with check (get_my_role() = 'developer' and employee_id = auth.uid())`. The `stop` route (`src/app/api/v2/timer/stop/route.ts:38-50`) inserts the final logged entry into `time_logs` — this would also be silently rejected for non-developers without widening this policy too.

Skipping any of these three layers would leave a broken half-state (e.g. widget visible + button clickable, but every action 403s).

## Requirements

- [ ] `v2-hub-shell.tsx` always wraps `shell` in `<TimerProvider>...<TimerFloatingWidget /></TimerProvider>` — the `if (userRole !== "developer") return shell;` early return is removed. Update the task-209 comment accordingly.
- [ ] `/api/v2/timer/start` no longer 403s based on role — remove the `profile?.role !== "developer"` check (the existing assignee check right below it, `task.assignees?.includes(user.id)` / `issue.assignee_id === user.id`, remains the real authorization: only the task/issue's assignee may start its timer, regardless of role).
- [ ] `/api/v2/timer/break/start` no longer 403s based on role — remove the same check.
- [ ] New Supabase migration widens `active_timers_developer_own` to drop the role condition, keeping row-ownership scoping (`user_id = auth.uid()`) — rename the policy away from `*_developer_own` since it's no longer developer-specific (e.g. `active_timers_own`).
- [ ] Same migration widens `time_logs_developer_own` (write policy) to drop the role condition, keeping `employee_id = auth.uid()` — rename similarly (e.g. `time_logs_own`). `time_logs_manager_read` and `time_logs_developer_read_all` (read policies) are untouched — this task only widens the write path.
- [ ] `_list-view.tsx`, `legacy/.../_task-detail.tsx`, and `v2/.../_task-detail.tsx` keep their existing `isAssignedToMe`-only gate on `<TaskTimerButton>` (now safe, since `TimerProvider` is always mounted) — but update the three stale task-218 comments that assert "only developers are ever assignees" / "TimerProvider only mounts for developer role", since neither is true anymore.
- [ ] Confirm no other role check blocks the flow: `active_timers` select (`GET /api/v2/timer/route.ts`) and pause/resume/stop/break-cancel routes have no route-level role check today (verified) — they rely solely on the RLS policy above, so once that's widened they work for all roles automatically. No route-level change needed for those four.
- [ ] As every role, opening a legacy or v2 project's Tasks tab (or task/issue detail page) where the signed-in user is the assignee renders a working timer button — start/pause/resume/stop all function identically to the current developer experience.
- [ ] As every role, the hub-wide floating timer/break widget (`TimerFloatingWidget`) appears whenever a timer or break is active, regardless of role.

## Out of Scope / Must-Not-Change

- `tasks_developer_insert` / `tasks_developer_update` (migration 092) and other `get_my_role() = 'developer'` policies unrelated to `active_timers`/`time_logs` writes (task creation/edit permissions, storage bucket uploads, task/issue delete RLS) — these govern task/issue editing, a separate permission model (`getTaskEditPermission`), not timer usage. Not touched.
- `time_logs_manager_read` and `time_logs_developer_read_all` (read-only RLS policies) — untouched; this task only widens the write path used by the timer's own `stop` flow.
- No change to `_task-timer-button.tsx` itself, or to the `isAssignedToMe` assignment check anywhere — the authorization model stays "assignee only," it's the role restriction on top of it that's removed.
- No new `error.tsx` boundary — the root-cause fix (provider always mounted) prevents the throw entirely.
- `_milestone-swimlane.tsx` / `_project-detail.tsx` — checked; neither renders `<TaskTimerButton>` directly, no change needed.
- No change to the Zoho task-import mapping (`zoho-import/tasks/route.ts`) — a non-developer legitimately being the recorded Zoho task owner is normal legacy data; it's exactly the case this task now supports rather than works around.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/_components/v2-hub-shell.tsx` | Modify | Remove the `userRole !== "developer"` early return; always mount `TimerProvider` + `TimerFloatingWidget` |
| `src/app/api/v2/timer/start/route.ts` | Modify | Remove the role === developer 403 check; keep the assignee-authorization check |
| `src/app/api/v2/timer/break/start/route.ts` | Modify | Remove the role === developer 403 check |
| `supabase/migrations/113_active_timers_time_logs_all_roles.sql` | New | Drop + recreate `active_timers_developer_own` (→ `active_timers_own`) and `time_logs_developer_own` (→ `time_logs_own`) without the `get_my_role() = 'developer'` condition, keeping ownership scoping |
| `src/app/(hub)/projects/_shared/_list-view.tsx` | Modify | Comment-only: correct the stale task-218 note near `isAssignedToMe`/`TaskTimerButton` (~line 645) |
| `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | Comment-only: same correction (~line 94-97) |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | Comment-only: same correction (~line 94-97) |

## Code Context

### `v2-hub-shell.tsx` — current gate to remove

```ts
// line 67-76
// Task 209 — timer + break widget is developer-only; TimerProvider only mounts (and only
// starts polling active_timers) for that role.
if (userRole !== "developer") return shell;

return (
  <TimerProvider>
    {shell}
    <TimerFloatingWidget />
  </TimerProvider>
);
```
Becomes: always return the `<TimerProvider>{shell}<TimerFloatingWidget /></TimerProvider>` branch; drop the `if`.

### `/api/v2/timer/start/route.ts` — role check to remove (keep the check right after it)

```ts
// lines 16-19 — REMOVE
const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
if (profile?.role !== "developer") {
  return NextResponse.json({ error: "Only developers can start a timer" }, { status: 403 });
}

// lines 29-51 — KEEP (this is the real authorization going forward)
if (taskId) {
  const { data: task } = await supabase.from("tasks").select("id, assignees, project_id")...
  if (!task.assignees?.includes(user.id)) {
    return NextResponse.json({ error: "You must be assigned to this task to time it" }, { status: 403 });
  }
} else {
  // same pattern for issue.assignee_id
}
```
Note: once the `profile` fetch is removed, confirm nothing else in the route still references `profile` before deleting the query entirely.

### `/api/v2/timer/break/start/route.ts` — same shape, remove lines 16-19 equivalent

### RLS policies to widen — current definitions

`supabase/migrations/092_developer_task_permissions_and_active_timers.sql:63-66`:
```sql
create policy "active_timers_developer_own"
  on active_timers for all to authenticated
  using (get_my_role() = 'developer' and user_id = auth.uid())
  with check (get_my_role() = 'developer' and user_id = auth.uid());
```

`supabase/migrations/026_rls_policies_v2.sql:147-150`:
```sql
create policy "time_logs_developer_own"
  on time_logs for all to authenticated
  using (get_my_role() = 'developer' and employee_id = auth.uid())
  with check (get_my_role() = 'developer' and employee_id = auth.uid());
```

New migration should `drop policy if exists ... ; create policy "<new_name>" ... using (user_id = auth.uid()) with check (user_id = auth.uid());` (and the `employee_id` equivalent for `time_logs`), following the existing migration-file style used elsewhere in this repo (e.g. `111_developer_task_issue_delete_rls.sql` for a recent small, single-purpose RLS migration).

### Stale comments to correct (all three near-identical)

Example, `legacy/.../_task-detail.tsx:94-97` (same text in `v2/.../_task-detail.tsx` and referenced from `_list-view.tsx`):
```ts
// Task 218 — mirrors the list view's `TaskTimerButton` gate (`_list-view.tsx:569,662`):
// only the task's assignee sees the timer control. `TimerProvider` only mounts for the
// developer role (`v2-hub-shell.tsx`), and only developers are ever assignees, so this
// assignment check is what keeps `useTimer()` from being called without a provider.
```
Replace the last two lines' claim with the corrected fact: `TimerProvider` now mounts for every role (task 293), so this assignee check is purely an authorization gate (only the task's assignee sees the control), not a provider-safety mechanism.

## Implementation Steps

1. Write the new migration (`113_...sql`) widening both RLS policies; apply it locally and confirm via Supabase.
2. Remove the role check in `/api/v2/timer/start/route.ts` (and delete the now-unused `profile` query if nothing else in the route needs it).
3. Remove the equivalent role check in `/api/v2/timer/break/start/route.ts`.
4. Remove the `userRole !== "developer"` early return in `v2-hub-shell.tsx`; always mount `TimerProvider`/`TimerFloatingWidget`.
5. Update the three stale task-218 comments in `_list-view.tsx` and both `_task-detail.tsx` files.
6. Manually verify pause/resume/stop/break-cancel routes need no route-level change (confirmed in investigation — they only rely on the RLS policy, which step 1 already widens).

## Acceptance Criteria

- Signed in as the reported Admin user, opening any legacy project's Tasks tab (including `/projects/legacy/C30DE6A5-PROJ-01/tasks`) no longer throws and no longer shows the "This page couldn't load" fallback.
- Signed in as Admin (or PM/hr/client) and assigned to a task, the timer button renders and start/pause/resume/stop all succeed (no 403, no RLS denial) exactly as they do today for a developer.
- The floating timer/break widget appears for a non-developer role while a timer/break is active.
- Signed in as a developer, existing behavior is unchanged (regression check).
- `npx tsc --noEmit` passes.

## Verification

- `npx tsc --noEmit`
- Apply the new migration to the local/dev Supabase instance; confirm `active_timers` and `time_logs` inserts succeed for a non-developer test user via the Supabase SQL editor or a direct API call.
- Browser-based acceptance test: sign in as the Admin user, navigate to a legacy project's Tasks tab where she's an assignee, confirm no crash, start a timer, pause/resume it, stop it, and confirm a `time_logs` row is created with `source: "timer"`.
- Sign in as a developer, confirm the timer flow (start/pause/resume/stop, floating widget) is unchanged.

## Implementation Notes

### What Changed
- `TimerProvider`/`TimerFloatingWidget` now mount hub-wide in `v2-hub-shell.tsx` regardless of role — the `if (userRole !== "developer") return shell;` early return was removed.
- Removed the `profile.role !== "developer"` 403 checks in `/api/v2/timer/start` and `/api/v2/timer/break/start`. The existing assignee-authorization checks (task/issue assignee match) remain as the real gate in `start`; `break/start` had no other authorization check to begin with (it only requires an authenticated session, same as pause/resume/stop/break-cancel).
- Added migration `113_active_timers_time_logs_all_roles.sql`, replacing `active_timers_developer_own` → `active_timers_own` and `time_logs_developer_own` → `time_logs_own`, dropping the `get_my_role() = 'developer'` condition on both while keeping ownership scoping (`user_id = auth.uid()` / `employee_id = auth.uid()`).
- Corrected the stale task-218 comments in both `_task-detail.tsx` files (legacy and v2) that claimed "only developers are ever assignees" / "TimerProvider only mounts for developer role" — neither is true after this task. `_list-view.tsx` was checked and carries no such comment (only `{/* Timer */}`), so no edit was needed there.

### Files Changed
- `src/app/(hub)/_components/v2-hub-shell.tsx` — always mount `TimerProvider`/`TimerFloatingWidget`; updated the task-209 comment to reflect task 293.
- `src/app/api/v2/timer/start/route.ts` — removed developer-only role check.
- `src/app/api/v2/timer/break/start/route.ts` — removed developer-only role check.
- `supabase/migrations/113_active_timers_time_logs_all_roles.sql` — new migration widening both RLS policies to ownership-only (**not yet applied to the remote database** — see Verification Run below).
- `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-detail.tsx` — comment-only correction near `isAssignedToMe`.
- `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-detail.tsx` — comment-only correction near `isAssignedToMe`.

### Deviations From Plan
- `_list-view.tsx` was planned for a comment correction but on inspection carries no stale task-218 comment near `isAssignedToMe`/`TaskTimerButton` (the comment referencing it lives in the two `_task-detail.tsx` files, pointing back at this file, not the other way around) — left unchanged, nothing to fix.
- Migration 113 was written but **intentionally not applied** to the remote Supabase database — user asked to apply it themselves rather than have this session run `supabase db push` against the live/shared instance. Until applied, non-developer timer actions will still be denied by RLS even though the client/API layers no longer block them.

### Verification Run
- `npx tsc --noEmit` — PASS
- Apply migration 113 to remote DB — SKIPPED (user will apply manually; not run against the shared remote database in this session)
- Browser-based acceptance test (Admin user, legacy project timer start/pause/resume/stop) — SKIPPED (blocked on migration 113 being applied first; RLS still denies non-developer writes until then)
- Developer regression check (existing timer flow unchanged) — SKIPPED (deferred to `test` stage / manual QA)

## Quality Gate Notes

### Result
PASS

### Standards Review
- `npx eslint` on all five changed source files (`v2-hub-shell.tsx`, both `_task-detail.tsx`, both timer API routes) — clean, no warnings/errors.
- No dead code left behind: removing the role check in `start/route.ts` and `break/start/route.ts` also removed the now-unused `profile` query in both files (confirmed via grep — no remaining `profile` references in either file); no orphaned imports.
- Migration 113 follows the repo's established single-purpose RLS migration style (matches `111_developer_task_issue_delete_rls.sql`'s shape: header comment explaining rationale, `drop policy if exists` + `create policy`), keeps ownership scoping intact, and doesn't touch the untouched-by-design read policies (`time_logs_manager_read`, `time_logs_developer_read_all`).
- Comment updates are accurate and point at real, current line numbers in `_list-view.tsx` (645/755, re-verified against the file as it stands).
- Confirmed no other route in `src/app/api/v2/timer/*` carries a lingering `role !== "developer"` check (`grep -rn "role !=="` over the directory returns nothing) — pause/resume/stop/break-cancel were correctly left alone per the plan, since they only ever depended on the RLS policy now widened by migration 113.

### Deviations
- Minor: `_list-view.tsx` needed no comment change — the task doc's proposed-file-changes table listed it, but on inspection its `TaskTimerButton` render site only carries a `{/* Timer */}` comment, not the stale task-218 note (that note lives in, and was already corrected in, the two `_task-detail.tsx` files, which reference `_list-view.tsx` rather than the reverse). No functional or scope impact — already logged in Implementation Notes.
- Medium: Migration 113 is written but not applied to the remote database, and no browser-based acceptance testing has been run — both by explicit user instruction (session was told not to run `supabase db push` against the shared remote instance). This is a real gap between "code is correct" and "feature is verified working end-to-end," but it's a deliberate, user-directed deferral, not an implementation shortfall. Flagging forward to `test` stage: acceptance testing cannot proceed until migration 113 is applied.

### Required Fixes
- None. (Migration application and live acceptance testing remain outstanding but are out of this stage's control — see Deviations.)
