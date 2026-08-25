# 305: Issues List — Start Timer Button (Row-Level, Parity with Tasks List)

**Created:** 2026-08-25
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

The Tasks list (`_list-view.tsx`) has a per-row Timer column that lets an assigned developer start/pause/resume/stop a timer directly from the list, without opening the task. The Issues list (`_issue-list-view.tsx`) has no such column — timer start is currently only available on the Issue Detail page (`_issue-detail.tsx:171-178`), added in task 234/237. This task adds the same row-level timer control to the Issues list, reusing the existing shared `TaskTimerButton` component (already widened in task 234 to accept an `issueId` in place of `taskId`) — no new component, no backend changes.

`_issue-list-view.tsx` is a shared component rendered by `_project-detail.tsx` for both `/projects/legacy/[projectId]` and `/projects/v2/[projectId]`, so this single-file change covers both variants automatically.

## Requirements

- [ ] Issues list rows show a Timer column, positioned last (matching the Tasks list's column order: ... → Timer, rightmost).
- [ ] The timer control only renders for a row where the current user is permitted to start a timer on that issue — reuse `getIssueEditPermission(currentUserRole, currentUserId, issue).canStartTimer` (already imported in this file), not a hand-rolled "assigned to me" check.
- [ ] Uses the same shared `TaskTimerButton` component and `prominent` styling the Tasks list already uses for its row-level Timer column (large orange icon, not the compact variant).
- [ ] Cross-row "timer running on another task/issue" disabled state, running/elapsed display, and pause/resume/stop all come for free from `TaskTimerButton` + the existing hub-wide `TimerContext` — no new state needed in `_issue-list-view.tsx` beyond rendering the button.
- [ ] Column header for the Timer column is an empty spacer `<div />` (no label), matching the Tasks list header row.

## Out of Scope / Must-Not-Change

- **"Hours logged" column is NOT part of this task.** The Tasks list's Timer column sits next to a separate "Hours logged" column driven by `hoursById`, which is populated in `_get-project-detail-data.ts:81,89-92` from `time_logs.select("task_id, hours")` — it only aggregates by `task_id`, never `issue_id`, even though `time_logs` has an `issue_id` column (`src/types/database.ts:1426`). Adding an Hours-logged column for issues would require widening that query and its aggregation loop, plus threading a new prop through `_project-detail.tsx` → `IssueListView`. That's a distinct, separately-scoped follow-up — this task is the timer button only.
- Do not touch the Issue Board view (`_issue-board-view.tsx`) or Issue Calendar view (`_issue-calendar-view.tsx`) — the ask is specifically the list rows.
- Do not touch `_task-timer-button.tsx`, `timer-context.tsx`, or any `/api/v2/timer/*` route — the component already supports issues end-to-end (task 234); this is purely a call-site addition.
- Do not change `getIssueEditPermission` in `src/lib/issues/permissions.ts` — `canStartTimer` already exists and is exactly the gate the Issue Detail page uses.
- Do not touch `_list-view.tsx` (Tasks list) — it's the reference pattern, not a target of this change.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_shared/_issue-list-view.tsx` | Modify | Add Timer column to grid template, column header, and per-row `TaskTimerButton` gated by `getIssueEditPermission(...).canStartTimer` |

## Code Context

### File: `src/app/(hub)/projects/_shared/_issue-list-view.tsx`

Current grid (6 columns) and imports — `getIssueEditPermission` is already imported and used for the row-selection checkbox gate (`selectableIds`), just not yet for a per-row timer gate:

```tsx
import { getIssueEditPermission } from "@/lib/issues/permissions";
...
const GRID = "grid-cols-[32px_1fr_160px_160px_108px_120px]";
...
{/* Column headers */}
<div className={`sticky top-0 z-10 grid ${GRID} ...`}>
  <input type="checkbox" ... />
  <SortHeader label="Issue Name" ... />
  <SortHeader label="Status" ... />
  <span ...><Users size={11} /> Assignee</span>
  <SortHeader label="Due Date" ... />
  <SortHeader label="Severity" ... />
</div>
...
{sorted.map((issue) => {
  ...
  return (
    <div key={issue.id} className={`grid ${GRID} ...`}>
      {/* checkbox */}
      {/* title + copy-link */}
      {/* status select */}
      <IssueAssigneePicker issue={issue} allMembers={allMembers} onUpdate={onUpdate} />
      {/* due date */}
      {/* severity select */}
    </div>
  );
})}
```

### File: `src/app/(hub)/projects/_shared/_list-view.tsx` (reference pattern — Tasks list Timer column)

```tsx
import { TaskTimerButton } from "./_task-timer-button";
...
const GRID = "grid-cols-[32px_1fr_148px_120px_108px_80px_64px_48px]";
...
{/* Column headers */}
<span className="flex items-center gap-1 ..."><Clock size={11} /></span>
<div /> {/* timer spacer */}
...
{/* Timer */}
<div className="flex items-center justify-center">
  {isAssignedToMe && (
    <TaskTimerButton
      taskId={task.id}
      projectId={task.project_id}
      onHoursLogged={(hours) => onHoursLogged(task.id, hours)}
      prominent
    />
  )}
</div>
```

### File: `src/app/(hub)/projects/v2/[projectId]/issues/[issueId]/_issue-detail.tsx` (reference — issue-flavored `TaskTimerButton` usage + permission gate)

```tsx
const perm = getIssueEditPermission(currentUserRole, currentUserId, issue);
...
{perm.canStartTimer && (
  <TaskTimerButton
    issueId={issue.id}
    projectId={issue.project_id}
    onHoursLogged={handleHoursLogged}
    prominent
  />
)}
```

### File: `src/lib/issues/permissions.ts` (reference — do not modify)

```ts
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
): IssueEditPermission { ... }
```

## Implementation Steps

1. In `_issue-list-view.tsx`, add `import { TaskTimerButton } from "./_task-timer-button";`.
2. Widen `GRID` from `"grid-cols-[32px_1fr_160px_160px_108px_120px]"` to `"grid-cols-[32px_1fr_160px_160px_108px_120px_48px]"` (append a `48px` Timer column, matching the Tasks list's Timer column width).
3. In the column-headers row, add a trailing `<div />` spacer (no label) after the Severity `SortHeader`.
4. Inside the `sorted.map((issue) => { ... })` row body, compute `const perm = getIssueEditPermission(currentUserRole, currentUserId, issue);` alongside the existing `norm`/`ss`/`sev`/`sv`/`due`/`dueColor`/`isSelected` locals.
5. Add a trailing cell after the Severity `<select>`:
   ```tsx
   <div className="flex items-center justify-center">
     {perm.canStartTimer && (
       <TaskTimerButton
         issueId={issue.id}
         projectId={issue.project_id}
         prominent
       />
     )}
   </div>
   ```
   (No `onHoursLogged` — there's no Hours-logged column on this list to update; see Out of Scope.)

## Acceptance Criteria

- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] On `/projects/v2/[projectId]` (Issues tab, List view) and `/projects/legacy/[projectId]/issues`, a developer who is the assignee (or assignee+creator) of an issue sees a Timer icon in that row and can start/pause/resume/stop it without leaving the list.
- [ ] A developer with no start-timer permission on a given issue (not assignee, or PM/admin/super_admin role) sees an empty cell in that row — no icon, no error.
- [ ] Starting a timer on one issue row shows the disabled "Timer running on another task or issue" state on every other row (and on the Tasks list, and on any open Task/Issue Detail page) — confirms it's sharing the same `TimerContext`, not row-local state.
- [ ] Stopping the timer from the list row correctly logs time (existing `TaskTimerButton`/`stopTimer` behavior, unchanged) — verify a new row appears in that issue's Time Logs tab (task 237) after stopping.
- [ ] No visual regression to the existing Status / Assignee / Due Date / Severity columns or the sticky-header behavior.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Browser-based acceptance testing (per project convention, no test runner configured):
- Log in as a developer assigned to an open issue → open the project's Issues tab, List view → confirm the Timer icon appears on that row and starting it works.
- Log in as a PM/admin → confirm no Timer icon appears on any Issues list row.
- With a timer running on a Task, open the Issues list → confirm all issue rows show the disabled "running elsewhere" state.

## Compatibility Touchpoints

- None — no packaging, docs, adapters, or install-surface impact. Purely a UI addition to an existing shared client component reusing existing shared infrastructure (`TaskTimerButton`, `TimerContext`, `getIssueEditPermission`).

## Implementation Notes

### What Changed
- Added a Timer column (48px, rightmost) to the shared Issues list grid — a per-row `TaskTimerButton` gated by `getIssueEditPermission(currentUserRole, currentUserId, issue).canStartTimer`, matching the Tasks list's existing `prominent` timer control exactly. Covers both `/projects/legacy/[projectId]/issues` and `/projects/v2/[projectId]` (Issues tab) since `_issue-list-view.tsx` is shared by both via `_project-detail.tsx`.

### Files Changed
- `src/app/(hub)/projects/_shared/_issue-list-view.tsx` — added `TaskTimerButton` import; widened `GRID` to append a `48px` timer column; added a spacer `<div />` to the column-header row; computed `perm = getIssueEditPermission(...)` per row and rendered `<TaskTimerButton issueId={issue.id} projectId={issue.project_id} prominent />` inside `perm.canStartTimer` at the end of each row, after the Severity `<select>`.

### Deviations From Plan
- None. Implementation followed the task doc's steps verbatim, including omitting `onHoursLogged` (no Hours-logged column exists on this list to update — see Out of Scope).

### Verification Run
- `npx tsc --noEmit` — PASS (no output, no errors).
- `pnpm lint` — PASS (0 errors; 2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`, untouched by this change).
- Browser-based acceptance testing — SKIPPED (not run this session; flagged for the `test` stage per project convention of no automated test runner).

Note: the `impeccable` design-system hook flagged several `design-system-font-size` findings in this file during editing (e.g. lines 449, 454, 492). All are on pre-existing lines this task did not touch (existing `text-[12px]`/`text-[11px]` utility classes already present before this change) — no new literal font sizes were introduced by this task's edits (the added `TaskTimerButton` usage carries no font-size class). Left unchanged as out of scope.

## Quality Gate Notes

### Result
PASS

### Standards Review
- `TaskTimerButton` import, widened `GRID`, header spacer, and the row-level `perm`/timer cell are the only additions — no dead code, no `any`, no new nesting beyond the existing row-map structure.
- `perm` naming and inline `getIssueEditPermission(currentUserRole, currentUserId, issue)` call-site mirror the established convention already used at `_issue-detail.tsx:75` — consistent with the rest of the codebase rather than inventing a new pattern.
- Minor observation, not a defect: `getIssueEditPermission` is now evaluated twice per issue per render — once inside the memoized `selectableIds` computation (for `canEditDetails`), once inline per row (for `canStartTimer`). The function is pure and cheap (a handful of string comparisons), and this is exactly what Implementation Step 4 specified, so it's a plan-conformant restatement, not a new inefficiency introduced by deviation. No action needed.
- No secrets, credentials, or debug logging introduced.

### Deviations
- None. Implementation matches the task doc's Implementation Steps verbatim, including the deliberate omission of `onHoursLogged` (no Hours-logged column exists on this list — documented in Out of Scope and re-confirmed in Implementation Notes).

### Required Fixes
- None.
