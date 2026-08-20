# 276: Fix Timer Crash for Non-Developer Task Assignees, "Assign To" Dropdown Viewport Overflow, and Non-Functional Bulk Delete (Tasks)

**Created:** 2026-08-20
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Completed (2026-08-20)

---

## Overview

Three separate bugs reported live against the Projects → Tasks list (`/projects/[projectId]/tasks`), each fixed in its own pass this session:

1. **`useTimer must be used within a TimerProvider` runtime crash**, reported for `nina.baraquil@webriq.services`, thrown from `TaskTimerButton` inside `ProjectTasksPage`. Root cause: `TaskTimerButton` (which calls `useTimer()`) was gated only on raw task assignment (`task.assignees?.includes(currentUserId)`) in both the list view and task detail page, but `TimerProvider` only mounts in `v2-hub-shell.tsx` for `userRole === "developer"` — based on a documented invariant ("only developers are ever assignees") that was already false: `getProjectDetailData`'s `allMembers` query includes `pm`/`admin`/`super_admin` roles as assignable members, so a non-developer assigned to a task hit the crash. The issues side of the app (`getIssueEditPermission`) already had the correct role-aware `canStartTimer` gate matching the server's `/api/v2/timer/start` 403; the tasks side (`getTaskEditPermission`) never had the equivalent field.
2. **"Assign To" dropdown rendering off-screen** when the trigger row is near the bottom of the viewport — the picker panel always positioned itself at `top: buttonBottom + 4` with no viewport-bottom check, so it could render mostly or fully below the visible page.
3. **Bulk delete "Trash" button doing nothing** — no confirmation dialog, no request, no error. Root cause: the button in the tasks list view had no `onClick` handler at all. The equivalent issues-list bulk delete was fully wired (`onBulkDelete` prop → confirm → `DELETE` requests → optimistic removal); the tasks version was left unfinished even though the `DELETE /api/v2/tasks/[taskId]` route already existed.

Two follow-up rounds requested live after the initial bulk-delete fix, before this was marked complete:
- Add sonner `toast.loading`/`toast.success`/`toast.error` feedback to the bulk-delete flow (loading toast updated in place to success/error via matching `id`, mirroring the existing pattern in `editable-project-title.tsx`).
- Replace the native `window.confirm()` used for the bulk-delete confirmation with the app's existing on-brand `ConfirmDialog` component (`src/components/ui/confirm-dialog.tsx`), the same one used by "Delete Project" — user explicitly rejected the native browser alert shown in a screenshot.

## Requirements

- [x] `TaskEditPermission` (`src/lib/tasks/permissions.ts`) gains a `canStartTimer: boolean` field, mirroring `IssueEditPermission`'s existing field: `true` only when `role === "developer"` and the user is an assignee; `false` for `admin`/`pm`/`super_admin` and everyone else.
- [x] `_list-view.tsx`'s `Row` and `_task-detail.tsx` gate `TaskTimerButton` on `perm.canStartTimer` instead of raw `task.assignees?.includes(currentUserId)`.
- [x] Stale comment in `_task-detail.tsx` claiming "only developers are ever assignees" corrected to explain the real invariant (role-aware `canStartTimer`, not raw assignment).
- [x] `AssigneePicker` (`_list-view.tsx`) and `IssueAssigneePicker` (`_issue-list-view.tsx`) measure the panel's actual rendered height via a `useLayoutEffect` after opening and flip the panel above the trigger (`top: btnRect.top - panelHeight - 4`) when there isn't enough room below the trigger and there is enough room above — runs before paint, no visible jump.
- [x] `bulkDeleteTasks` added to `_project-detail.tsx` (parallel `DELETE /api/v2/tasks/[id]` requests, optimistic local-state filter on success), passed to `ListView` as `onBulkDelete`; wired to the previously-inert Trash button via a new `handleBulkTrash` handler in `_list-view.tsx`.
- [x] `bulkDeleteTasks` returns `{ deleted, failed }` counts (not `void`) so the caller can render an accurate success/partial-failure/full-failure toast.
- [x] Bulk-delete flow shows `toast.loading` on start, `toast.success` when all deletes succeed, and `toast.error` (with a partial-failure-aware message) when any fail or the request throws — same `id` across all three so the toast updates in place.
- [x] Bulk-delete confirmation replaced with `ConfirmDialog` (title `Delete N task(s)?`, body "This action is irreversible.", `confirmLabel` swapping to "Deleting…" and disabling while in flight) instead of `window.confirm()`.

## Out of Scope / Must-Not-Change

- `_board-view.tsx` does not render `TaskTimerButton` at all — no change needed there.
- Issues' bulk delete (`_issue-list-view.tsx:240`) still uses native `confirm()` and has no toast feedback — same gap as tasks had, but not touched this round; flagged to the user, not requested.
- No change to `/api/v2/timer/start`'s server-side role check or the `DELETE /api/v2/tasks/[taskId]` route — both were already correct; only client-side gating/wiring was missing.
- No new shared "useClickOutside"-style hook or shared dropdown-positioning hook introduced — the flip-to-top logic is inlined in each picker, matching this codebase's established convention of duplicating small per-component effects rather than abstracting after a single additional call site (same reasoning already accepted for `getIssueEditPermission` vs. `getTaskEditPermission` being separate functions).

## Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/tasks/permissions.ts` | Modify | Add `canStartTimer` to `TaskEditPermission`/`getTaskEditPermission` |
| `src/app/(hub)/projects/[projectId]/_list-view.tsx` | Modify | Gate `TaskTimerButton` on `perm.canStartTimer`; flip-to-top `AssigneePicker` positioning; wire bulk-delete (`onBulkDelete` prop, `handleBulkTrash`, toasts, `ConfirmDialog`) |
| `src/app/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | Gate `TaskTimerButton` on `perm.canStartTimer`; correct stale comment |
| `src/app/(hub)/projects/[projectId]/_issue-list-view.tsx` | Modify | Flip-to-top `IssueAssigneePicker` positioning |
| `src/app/(hub)/projects/[projectId]/_project-detail.tsx` | Modify | Add `bulkDeleteTasks` (returns `{ deleted, failed }`); pass as `onBulkDelete` to `ListView` |

## Implementation Notes

### What Changed — Part 1: Timer Crash

- `TaskEditPermission` gained `canStartTimer: boolean`. `getTaskEditPermission` now computes `isAssignee` once and returns `canStartTimer: false` for `admin`/`pm`/`super_admin`, `canStartTimer: isAssignee` for the creator-developer case, and `canStartTimer: true` for the assignee-only-developer case (via the existing `ASSIGNEE_STATUS_ONLY` constant, now carrying `canStartTimer: true`).
- `_list-view.tsx`'s `Row` component: removed the local `isAssignedToMe` variable, changed the `TaskTimerButton` render condition from `isAssignedToMe &&` to `perm.canStartTimer &&`.
- `_task-detail.tsx`: same swap, plus rewrote the comment block above the (now-removed) `isAssignedToMe` declaration to explain the real mechanism (PM/admin/super_admin can be assignees via `allMembers`, so role-aware `canStartTimer` — not raw assignment — is what keeps `useTimer()` from firing without a `TimerProvider`).

### What Changed — Part 2: Assign To Dropdown Overflow

- Both `AssigneePicker` and `IssueAssigneePicker` already computed `panelPos` on open (`{ top: r.bottom + 4, left: r.left }`) via a `btnRef` bounding-rect read. Added a `panelRef` on the panel `<div>` and a `useLayoutEffect(() => { ... }, [open])` that, once the panel is mounted, re-measures `btnRef`'s rect and `panelRef.current.offsetHeight`, and if `spaceBelow < panelHeight + 8` and there's more than `panelHeight + 8` of room above the trigger, repositions to `top: btnRect.top - panelHeight - 4`.
- Chose to measure the actual rendered panel (rather than guess a fixed height) because panel height varies with member count (`max-h-52` scroll region caps it, but short member lists render shorter) — a guessed constant would either flip unnecessarily for short lists or fail to flip for a genuinely tall one.
- `useLayoutEffect` (not `useEffect`) specifically to avoid a visible jump: the flip happens before the browser paints the initial below-trigger position.

### What Changed — Part 3: Bulk Delete (Tasks)

- **Missing handler (root cause):** the Trash button in `_list-view.tsx`'s selection toolbar had no `onClick` at all — confirmed by reading the file; it rendered inside a `Tooltip`/`TooltipTrigger` with only styling props.
- **Fix:** added `bulkDeleteTasks` to `_project-detail.tsx` — `Promise.all` over the selected ids, `DELETE /api/v2/tasks/{id}` per id (route already existed, cascades subtasks server-side per its own comment), filters successfully-deleted ids out of local `tasks` state, returns `{ deleted, failed }`. Passed as the new `onBulkDelete` prop to `<ListView>`.
- **Toast round (user-requested follow-up):** `_list-view.tsx` imports `toast` from `sonner` (already an installed dependency and already mounted via `<Toaster />` in `(hub)/layout.tsx`, which covers this route — confirmed no nested `layout.tsx` under `projects/[projectId]` overrides it). `handleBulkTrash` now: shows `toast.loading("Deleting N task(s)…")` capturing the returned `toastId`; on success (`failed === 0`) replaces it with `toast.success` via `{ id: toastId }`; on partial/full failure replaces it with a `toast.error` whose message distinguishes "failed to delete N" (all failed) from "Deleted X, failed to delete Y" (partial); on a thrown exception, `toast.error` with the caught message. `onBulkDelete`'s type signature changed from `Promise<void>` to `Promise<{ deleted: number; failed: number }>` on both the `ListView` prop type and `bulkDeleteTasks` itself.
- **Confirm-dialog round (user-requested follow-up, rejecting the native `confirm()` shown in a screenshot):** added `confirmOpen` state; the Trash button now calls `setConfirmOpen(true)` instead of triggering delete logic directly. Rendered `<ConfirmDialog>` (existing shared component, same one used by `DeleteProjectAction`) with `title={\`Delete ${selected.size} task${selected.size === 1 ? "" : "s"}?\`}`, `body="This action is irreversible."`, `confirmLabel` swapping to `"Deleting…"` and `confirmDisabled` while `deleting` is true, `onConfirm={() => void handleBulkTrash()}`, `onCancel={() => setConfirmOpen(false)}`. `handleBulkTrash` itself now closes the dialog first (`setConfirmOpen(false)`) instead of gating on a `confirm()` return value.

### Deviations From Plan

- None — this doc was written retroactively after the fixes were implemented and iterated live with the user across the session (crash fix → dropdown fix → bulk-delete fix → toast follow-up → confirm-dialog follow-up), rather than planned up front. No deviations to record against a prior plan.
- Scoped-out observation, not acted on: the issues list (`_issue-list-view.tsx`) has the identical native-`confirm()`-with-no-toast gap in its own bulk delete. Surfaced to the user twice (after the toast round and implicitly again here); not fixed, since it wasn't requested.

### Verification Run

- `npx tsc --noEmit` — PASS, run after each of the five edit passes (timer gate, dropdown flip, bulk-delete wiring, toasts, confirm dialog), clean every time.
- No `pnpm lint` or live browser verification run in this session.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser (not yet run — recommended before/at the `test` stage):
- As a PM or admin user assigned to a task, open Projects → Tasks (list and detail) and confirm no `useTimer` crash and no timer button renders (developer-only feature, unchanged).
- As a developer assigned to a task, confirm the timer button still renders and works as before.
- Open the "Assign To" picker on a task row near the bottom of the viewport; confirm the panel flips above the trigger instead of rendering off-screen. Repeat for a row near the top (should still render below, unchanged) and for the Issues list's assignee picker.
- Select several tasks, click Trash: confirm the on-brand `ConfirmDialog` appears (not a native browser alert), Cancel closes it with no request sent, Confirm shows a loading toast that resolves to a success toast and removes the rows. Force a failure (e.g. delete a task another tab already removed) to confirm the error/partial-failure toast wording.

## Compatibility Touchpoints

- None — client-side gating/wiring/UI changes on existing features (task timer, assignee picker, bulk delete). No route, schema, or migration changes; both API routes used (`/api/v2/timer/start`, `DELETE /api/v2/tasks/[taskId]`) already existed and were unmodified.

## Quality Gate Notes

### Result
PASS (self-reviewed; no separate `simplify`/quality-gate stage run as a distinct pass — each fix was typechecked immediately after editing, and the confirm-dialog/toast rounds reused existing shared components/patterns verbatim rather than introducing new ones).

### Standards Review
- `canStartTimer` on `TaskEditPermission` mirrors `IssueEditPermission`'s existing field exactly (same comment, same role logic), rather than inventing a parallel mechanism — confirmed by reading `src/lib/issues/permissions.ts` before writing the tasks-side change.
- Toast and confirm-dialog patterns reused verbatim from `editable-project-title.tsx` and `_delete-project-action.tsx`/`confirm-dialog.tsx` respectively — no new UI primitives introduced.
- `useLayoutEffect`-based flip logic measures real DOM (`offsetHeight`) rather than a guessed constant, avoiding a fragile magic-number height that would drift out of sync with the panel's actual content (member count, header row).
- `npx tsc --noEmit` clean after every edit in the sequence — no accumulated type debt across the five passes.

### Deviations
- None Medium/Major. One Minor, already logged above: issues list's bulk delete has the same pre-existing `confirm()`/no-toast gap, intentionally left untouched (out of requested scope).

### Required Fixes
- None.
