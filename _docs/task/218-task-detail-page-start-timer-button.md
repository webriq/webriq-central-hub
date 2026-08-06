# 218: Task Detail Page — Start Timer Button (Parity with List View)

**Created:** 2026-08-06
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

The tasks list view (`/v2/projects/[projectId]` list rows, via `_list-view.tsx` → `_project-detail.tsx`) already has a per-row timer control (`TaskTimerButton`, task 209) that starts/pauses/resumes/stops a server-tracked timer (`active_timers`, via `TimerContext`) and logs an entry on stop. The task detail page (`/v2/projects/[projectId]/tasks/[taskId]`, `_task-detail.tsx`) has no equivalent — a developer opening a task's full detail page currently has to go back to the list view just to start a timer on it.

This task adds the same `TaskTimerButton` to the task detail page header, reusing the existing component and `TimerContext` as-is (no new timer logic). `TimerProvider` already wraps the whole `(hub)` shell (`v2-hub-shell.tsx:71`), so `useTimer()` is already available on this route — this is purely a UI wiring task.

## Requirements

- [ ] `TaskTimerButton` renders in the task detail page header (`_task-detail.tsx`), next to the status/priority badges, mirroring how it appears next to a task row in the list view.
- [ ] Button reflects the same states as the list view: idle → "Start timer", running → elapsed time + Pause, paused → elapsed time + Resume/Stop, on-break → paused/disabled, another-task-active → disabled with tooltip. No new states — reuse `TaskTimerButton` verbatim.
- [ ] Stopping the timer from the detail page logs the time entry (existing `stopTimer()` → `/api/v2/timer/stop` behavior, unchanged) and the "Time Logs" tab (`_task-time-logs.tsx`, nested inside `TaskAttachmentsCommentsPanel`) reflects the new entry without requiring a manual page reload.
- [ ] Button only renders for roles that can log time on this task — match whatever gating (if any) the list view relies on (`TaskTimerButton` itself has no internal role gate; check what gates its *rendering* in `_project-detail.tsx`/`_task-detail.tsx`, e.g. developer-only per task 209's `TimerProvider` mount comment).

## Out of Scope / Must-Not-Change

- No changes to `_task-timer-button.tsx`, `timer-context.tsx`, or any `/api/v2/timer/*` route — reuse as-is.
- No changes to the list view's existing timer button/behavior.
- No new "logged hours" summary field added to the detail page's sidebar `Card` — out of scope; the Time Logs tab already shows total logged hours (`_task-time-logs.tsx:104`).
- Do not duplicate `TaskTimerButton`'s state-machine logic inline in `_task-detail.tsx` — import and reuse the component.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | Import `TaskTimerButton`, render it in the header row, wire `onHoursLogged` to refresh the Time Logs tab |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx` | Modify (maybe) | Accept a refresh signal (e.g. bump key) so `TaskTimeLogs` refetches after a stop-timer event from the header button, if a prop-based refresh is chosen over local re-fetch |

## Code Context

### File: `src/app/v2/(hub)/projects/[projectId]/_task-timer-button.tsx` (existing — reuse verbatim)

```tsx
export function TaskTimerButton({
  taskId,
  projectId,
  onHoursLogged,
}: {
  taskId: string;
  projectId: string;
  onHoursLogged: (taskId: string, hours: number) => void;
}) {
  const { timer, elapsedSeconds, startTimer, pauseTimer, resumeTimer, stopTimer } = useTimer();
  // idle / other-task-active / on-break / running / paused states — see full file
}
```

`useTimer()` comes from `../../_components/timer-context` (relative to the list-view directory; from the task-detail directory the import path is `../../../_components/timer-context` if imported directly, but importing `TaskTimerButton` itself avoids needing that import at all).

### File: `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` (list view — reference for how it's wired today)

```tsx
import { TaskTimerButton } from "./_task-timer-button";
// ...
const [hoursById, setHoursById] = useState<Record<string, number>>(initialHoursById);
// ...
function handleHoursLogged(taskId: string, hours: number) {
  setHoursById((prev) => ({ ...prev, [taskId]: (prev[taskId] ?? 0) + hours }));
}
// ...
<TaskTimerButton taskId={task.id} projectId={task.project_id} onHoursLogged={onHoursLogged} />
```

Note: `task.id` (UUID) and `task.project_id` (UUID) are passed — not the display IDs used in the URL. `_task-detail.tsx` already has `task.id` and `task.project_id` available on its `task: Task` prop (it currently derives `projectId = project.project_id ?? project.id` for other purposes — that display-ID variable is NOT the same value `TaskTimerButton` needs; `TaskTimerButton`'s `projectId` prop must be `task.project_id`, the UUID, matching the list view's usage).

### File: `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx` (target — header section, lines ~137–165)

```tsx
<div className="flex items-start justify-between gap-4">
  <div className="flex-1 min-w-0">
    <div className="flex items-center gap-2 mb-2 flex-wrap">
      <span className="text-[11px] font-mono text-[#5F6A88] bg-[#EDF0F7] px-2 py-0.5 rounded-[5px]">
        TASK · {task.display_id}
      </span>
      <StatusBadge status={status} />
      <PriorityBadge priority={priority} />
      {/* TaskTimerButton goes here */}
    </div>
    ...
```

### File: `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx` (Time Logs tab lives here)

```tsx
export function TaskAttachmentsCommentsPanel({ projectId, taskId }: { projectId: string; taskId: string }) {
  const [tab, setTab] = useState<PanelTab>("attachments");
  // ...
  <TaskTimeLogs taskId={taskId} />
```

`TaskTimeLogs` fetches its own entries on mount via `useEffect` (`_task-time-logs.tsx:69-81`) and has no external refresh hook today. Simplest option: pass a `refreshKey`/`refreshSignal` prop down from `_task-detail.tsx` → `TaskAttachmentsCommentsPanel` → `TaskTimeLogs`, bumped in `onHoursLogged`, added to `TaskTimeLogs`'s `useEffect` dependency array. Alternative: since the tab already re-fetches nothing on tab-switch (data persists per task 213's "stay mounted" pattern), a simple approach also works: only bump the refresh key, don't over-engineer a full pub/sub.

## Implementation Steps

1. In `_task-detail.tsx`, import `TaskTimerButton` from `../../_task-timer-button` (path: up two dirs from `tasks/[taskId]/` to `[projectId]/`).
2. Add local state (or reuse existing pattern) to bump a `timeLogsRefreshKey` counter inside an `onHoursLogged` handler.
3. Render `<TaskTimerButton taskId={task.id} projectId={task.project_id} onHoursLogged={handleHoursLogged} />` in the header, next to `PriorityBadge` — confirm visually it doesn't wrap awkwardly against the title/back-button row at narrow widths.
4. Check what (if anything) gates `TaskTimerButton`'s rendering in the list view (role check, or none) and apply the same gate here for consistency — don't show a timer-start control to roles that can't log time.
5. Thread `timeLogsRefreshKey` (or equivalent) through `TaskAttachmentsCommentsPanel` into `TaskTimeLogs`'s fetch `useEffect` dependency array so stopping the header timer refreshes the Time Logs tab without a full page reload.
6. Verify `npx tsc --noEmit` passes.

## Acceptance Criteria

- [ ] Opening a task detail page shows a timer button in the header matching the list view's icon/behavior.
- [ ] Starting, pausing, resuming, and stopping the timer from the detail page works identically to the list view (same API calls, same `TimerContext` state).
- [ ] Starting a timer from the list view and then navigating to that task's detail page shows the running timer state (shared `TimerContext`, not page-local state) — no restart/reset.
- [ ] Stopping the timer from the detail page adds a new row to the Time Logs tab, visible without a manual page refresh.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] Role gating (if the list view has any) matches between list and detail views.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser check:
- As a developer with an assigned task, open its detail page, click "Start timer," confirm elapsed time counts up, navigate away and back (state persists via `TimerContext`), pause/resume, then stop and confirm a Time Logs entry appears.
- Start a timer on a different task from the list view, then open a second task's detail page — confirm the second task's button shows the "Timer running on another task" disabled state (same as the list view's `isOtherActive` branch).

## Compatibility Touchpoints

- None — pure UI addition reusing existing, shipped timer infrastructure (task 209). No API, schema, or route changes.

## Implementation Notes

### What Changed
- Imported `TaskTimerButton` into the task detail page and rendered it in the header, next to `StatusBadge`/`PriorityBadge`.
- Gated the button on `isAssignedToMe = task.assignees?.includes(currentUserId) ?? false` — this is the actual gate the list view uses (`_list-view.tsx:569,662`), not a role check. `TaskTimerButton`'s `useTimer()` throws if `TimerProvider` isn't mounted, and `TimerProvider` only mounts for the `developer` role (`v2-hub-shell.tsx`); since only developers are ever task assignees, the assignment check transitively keeps the same safety property the list view relies on, without introducing a redundant/divergent role check.
- Added a `timeLogsRefreshKey` counter (bumped by the button's `onHoursLogged` callback) threaded through `TaskAttachmentsCommentsPanel` → `TaskTimeLogs` as a `refreshKey` prop, added to `TaskTimeLogs`'s data-fetch `useEffect` dependency array, so stopping the timer refreshes the Time Logs tab without a manual page reload.

### Files Changed
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx` - imported `TaskTimerButton`, added `timeLogsRefreshKey` state + `handleHoursLogged` callback, computed `isAssignedToMe`, rendered the button in the header, passed `timeLogsRefreshKey` to `TaskAttachmentsCommentsPanel`.
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx` - accepted optional `timeLogsRefreshKey` prop, forwarded as `refreshKey` to `TaskTimeLogs`.
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-time-logs.tsx` - accepted optional `refreshKey` prop, added to the fetch `useEffect`'s dependency array.

### Deviations From Plan
- The task doc's requirement bullet said to "match whatever gating (if any) the list view relies on" and flagged role-based gating as one possibility. Investigation during implementation found the list view actually gates on task assignment (`isAssignedToMe`), not role — used that instead, since it's the real existing behavior being mirrored and is also the mechanism that prevents the `useTimer()`-without-`TimerProvider` crash for non-developer roles.
- `_task-time-logs.tsx` was listed only implicitly in the plan's Implementation Steps (not in the Proposed File Changes table); modifying it was necessary to fulfill the "Time Logs tab reflects the new entry without a manual reload" requirement, so it was changed as planned in the steps.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Manual/browser check (start/pause/resume/stop, cross-page timer persistence, other-task-active state) - SKIPPED (no running dev session in this environment; flagged for the `test` stage)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused/dead code, no `any`/untyped escape hatches, no unintentional deep nesting.
- Naming is accurate and consistent with the file (`isAssignedToMe`, `handleHoursLogged`, `timeLogsRefreshKey`).
- Comments follow the codebase's existing "Task NNN —" convention (used throughout this file and its siblings) rather than introducing a new commenting style.
- `TaskTimerButton` reused verbatim; no state-machine logic duplicated inline, per the Out-of-Scope boundary.
- No secrets, credentials, or debug logging introduced.

### Deviations
- **Minor** — Gating uses `isAssignedToMe = task.assignees?.includes(currentUserId)` (the list view's real gate, `_list-view.tsx:569,662`) rather than a role check. This was flagged as an open question in the task doc's Requirement #4 and Implementation Step #4; investigation resolved it correctly in favor of true list-view parity. Documented in Implementation Notes.
- **Minor** — `_task-time-logs.tsx` was modified in addition to the two files listed in the Proposed File Changes table. This was already anticipated in Implementation Step #5 (not omitted from planning, just not reflected in the file table) and is required to satisfy Requirement #3 (Time Logs tab reflects the new entry live). Documented in Implementation Notes.
- **Informational, not a deviation** — the `isAssignedToMe` gate carries the same latent risk the list view already has: if a non-developer were ever assigned to a task, `useTimer()` would throw because `TimerProvider` only mounts for the `developer` role. This is inherited, pre-existing behavior being mirrored exactly (per the task's parity requirement), not a regression introduced here, and fixing it would be list-view-wide scope creep beyond this task.

### Required Fixes
- None.

## Follow-Up: Prominent Start-Timer Icon

Post-quality-gate user request: make the detail-page "start timer" icon more noticeable — larger, brand orange.

- Added an opt-in `prominent?: boolean` prop to `TaskTimerButton` (`_task-timer-button.tsx`), defaulting to `false`.
- Scoped the color/size change to the idle "Start timer" state only (the icon this request refers to) — running/paused/other-task-active states keep their existing blue/gray semantics, unchanged.
- Colors used: `orange` `#FB914E` idle → `orange-600` `#E2762F` hover, both from `DESIGN.md`'s documented brand palette (not new arbitrary values).
- `_task-detail.tsx` now passes `prominent` on its `TaskTimerButton` call.
- Follow-up (same session): user asked to apply the same treatment to the tasks-listing row's timer icon too. `_list-view.tsx`'s `TaskTimerButton` call (`_list-view.tsx:663`) now also passes `prominent` — the row's dedicated "Timer" grid cell (`flex items-center justify-center`) accommodates the larger 18px icon without breaking the dense row layout. The task's original "no changes to the list view's existing timer button" boundary is superseded here by this explicit user instruction to make both locations consistent.
- Note: `DESIGN.md`'s "One-CTA Rule" reserves orange for a single call-to-action per screen. No other orange element exists on either the task detail page or the tasks list view today, so this doesn't create a second competing orange CTA on either screen, but it's worth knowing this is a deliberate, explicit exception to the documented "orange = act now, one per screen" guidance if more orange elements are added later.
- `npx tsc --noEmit` - PASS (both edits).
