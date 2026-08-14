# 237: Issue Detail — Time Logs Tab (View/Add/Edit Manual Entries)

**Created:** 2026-08-13
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced

---

## Overview

Third of three follow-ups to task 234 (Issue Detail redesign + RBAC + timer). This one adds a Time Logs
tab to Issue Detail, mirroring Task Detail's own (`_task-time-logs.tsx`, tasks 214/215): every entry
logged against the issue (own + teammates', role-gated Source visibility), grouped by date with
per-day subtotals, manual add/edit for own entries, and the timer-timeline popover for timer-sourced
entries.

**This is the one follow-up with (almost) no new backend plumbing**, because task 234 already did the
hard part: `time_logs.issue_id` already existed before any of this work (unused until task 234's timer
routes started writing to it), `time_logs_developer_own` (migration 026) already permits full CRUD
scoped to `employee_id = auth.uid()` regardless of whether `task_id` or `issue_id` is set, and
`time_logs_developer_read_all` (migration 094) is role-scoped, not `task_id`-scoped, so it already
covers issue-linked rows too. **No migration needed for this task.** The only work is a new API route
(filtering by `issue_id` instead of `task_id`) and the UI.

## Requirements

1. New `Time Logs` tab/section on Issue Detail — standalone `Card` if landing before 235/236, merged
   tab panel if landing after.
2. Every entry logged against the issue is visible to any staff viewer with page access (mirrors task
   234's timer-generated entries plus manual ones), grouped by date with a per-day hour subtotal.
3. `Source` column (timer vs. manual) visible only to `admin`/`super_admin`/`pm`/`hr`, matching
   `SOURCE_VISIBLE_ROLES` in the task route exactly.
4. A developer can add a manual entry for themselves and edit/delete their own entries (via
   `TimeLogForm`); PM/admin/hr see a read-only list plus the Source column, same split
   `_task-time-logs.tsx` already documents.
5. Timer-sourced entries (from task 234's issue timer) show the timer-timeline popover (start/end/
   pause/resume breakdown), same as task entries do.
6. Add/edit/delete permission for manual entries against an issue is **not** gated by
   `getIssueEditPermission` — matches the task-side model, where logging your own time is independent
   of whether you can edit the task/issue's other fields (an assignee-only developer, not the creator,
   can still log manual hours against an issue they're assigned to, same as they can start its timer).
7. `npx tsc --noEmit` and `pnpm lint` pass.

## Out of Scope / Must Not Change

- Task time logs (`tasks/[taskId]/_task-time-logs.tsx`, its API/RLS) — untouched.
- Attachments and Comments tabs — tasks 235/236.
- Any schema/RLS change — none needed (see Overview).

## Proposed File Changes

- `src/app/api/v2/issues/[issueId]/time-logs/route.ts` (new) — `GET`/`POST`, adapted from
  `tasks/[taskId]/time-logs/route.ts` with `.eq("issue_id", issueId)` instead of `.eq("task_id",
  taskId)`, and the insert payload setting `issue_id` instead of `task_id`.
- `src/app/api/v2/issues/[issueId]/time-logs/[timeLogId]/route.ts` (new) — `PATCH`/`DELETE`, adapted
  from the task equivalent (own-row check via `employee_id === user.id`, matching
  `time_logs_developer_own`'s RLS).
- `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/_issue-time-logs.tsx` (new) — adapted from
  `_task-time-logs.tsx`, reusing `_time-log-form.tsx` and `_timer-timeline-popover.tsx` as-is (both are
  already generic over a `TimeLogEntry`/timeline shape, not task-specific — confirm at implementation
  time whether either hardcodes a `task_id` field name anywhere before assuming zero changes needed
  there).
- `_issue-detail.tsx` — renders the new component; if task 234's `TaskTimerButton` usage on this page
  stopped/started a timer already, thread a `timeLogsRefreshKey` bump through the same
  `onHoursLogged` callback task 234 wired (currently a no-op placeholder on the issue side per task
  234's Decision — this task turns it into a real refresh trigger, mirroring `_task-detail.tsx:105-110`).

## Code Context

Task time-logs GET route (already read in full,
`src/app/api/v2/tasks/[taskId]/time-logs/route.ts:24-45`) — the exact query shape to mirror with
`issue_id`:
```ts
const { data: logs, error } = await supabase
  .from("time_logs")
  .select("id, employee_id, date_logged, hours, note, source, owner_name, owner_email, start_time, end_time, timeline, created_at")
  .eq("task_id", taskId)
  .order("date_logged", { ascending: false })
  .order("created_at", { ascending: false });
```
`SOURCE_VISIBLE_ROLES = ["admin", "super_admin", "pm", "hr"]` — reuse verbatim.

`time_logs_developer_read_all` (migration 094, already read in full) — role-scoped, already covers
issue-linked rows with zero changes:
```sql
create policy "time_logs_developer_read_all"
  on time_logs for select to authenticated
  using (get_my_role() = 'developer');
```

`_task-detail.tsx`'s existing `timeLogsRefreshKey` wiring (already read in full,
`_task-detail.tsx:105-110, 359`) — the pattern to replicate once this task's tab exists:
```tsx
const [timeLogsRefreshKey, setTimeLogsRefreshKey] = useState(0);
const handleHoursLogged = useCallback(() => { setTimeLogsRefreshKey((k) => k + 1); }, []);
// ...
<TaskAttachmentsCommentsPanel projectId={projectId} taskId={task.id} timeLogsRefreshKey={timeLogsRefreshKey} />
```

## Implementation Steps

1. Add the two issue-scoped time-log API routes, adapted from task equivalents (no migration needed).
2. Add `_issue-time-logs.tsx`, adapted from `_task-time-logs.tsx`; confirm `_time-log-form.tsx`/
   `_timer-timeline-popover.tsx` need no changes (they're already generic) before reusing as-is.
3. Wire into `_issue-detail.tsx`; connect the issue timer's `onHoursLogged` (task 234) to a real
   `timeLogsRefreshKey` bump instead of its current no-op.
4. `npx tsc --noEmit`, `pnpm lint`.

## Acceptance Criteria

- [ ] Every time log against an issue (timer-sourced from task 234's issue timer, and manual) is
      visible to any staff viewer with page access, grouped by date with subtotals.
- [ ] Source column visible only to admin/super_admin/pm/hr.
- [ ] A developer can add/edit/delete their own manual entries against an issue they're assigned to,
      independent of `getIssueEditPermission`'s edit tier.
- [ ] Stopping the issue timer (task 234) immediately refreshes this tab's list.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

- `npx tsc --noEmit`
- `pnpm lint`
- Browser: as a developer assigned to an issue, add a manual time log entry, confirm it appears grouped
  under today's date with the correct subtotal.
- Browser: start/stop the issue timer (task 234), confirm the resulting entry appears here without a
  manual page refresh.
- Browser: as PM, confirm the Source column is visible and the list is read-only (no add/edit controls
  for others' entries).

## Compatibility Touchpoints

- Depends on task 234 (issue timer writing `time_logs.issue_id`) and ideally lands after it so this
  tab has real timer-sourced data to display, though it works standalone (manual entries only) if
  sequenced differently.
- No schema/RLS changes.

## Implementation Notes

### What Changed
- Added issue-scoped time-log API routes (`GET`/`POST`, `PATCH`/`DELETE`), adapted line-for-line
  from the task equivalents with `issue_id` swapped for `task_id` and the assignee check changed
  from `tasks.assignees` (array, `.includes()`) to `issues.assignee_id` (single column, `===`) —
  `issues` has one assignee, not many, unlike tasks.
- Added `_issue-time-logs.tsx` as a standalone `Card` on Issue Detail (235/236 already exist as
  separate Cards there too, not a merged tab panel, so this follows that shape rather than the
  task side's tabbed `TaskAttachmentsCommentsPanel`).
- `_time-log-form.tsx` (task side) hardcoded its POST/PATCH URL from a `taskId` prop, so it was
  **not** actually reusable "as-is" for issues (confirmed the task doc's flagged risk). Generalized
  it to take a caller-supplied `apiBasePath` string instead — same precedent already established by
  `TaskAttachmentViewerModal`'s `fetchUrl` prop (task 211/212). `TimerTimelinePopover` needed zero
  changes; it was already fully generic. Both are imported directly into the issues directory via a
  relative path (`../../tasks/[taskId]/_time-log-form`), matching the existing cross-directory reuse
  pattern already used by `_issue-attachments.tsx`/`_issue-comments.tsx` for
  `TaskAttachmentViewerModal`.
- Wired `_issue-detail.tsx`'s `TaskTimerButton` `onHoursLogged` (previously wired to nothing — task
  234 had no Time Logs tab to refresh) to a new `timeLogsRefreshKey` state bump, mirroring
  `_task-detail.tsx`'s identical pattern, and passed it into the new `IssueTimeLogs` component.

### Files Changed
- `src/app/api/v2/issues/[issueId]/time-logs/route.ts` (new) — `GET`/`POST`.
- `src/app/api/v2/issues/[issueId]/time-logs/[timeLogId]/route.ts` (new) — `PATCH`/`DELETE`.
- `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/_issue-time-logs.tsx` (new) — the tab UI.
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_time-log-form.tsx` — `taskId` prop
  generalized to `apiBasePath` so the issue side can reuse it; both call sites in
  `_task-time-logs.tsx` updated to pass the equivalent path.
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-time-logs.tsx` — updated both
  `TimeLogForm` call sites for the renamed prop.
- `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/_issue-detail.tsx` — renders the new
  `Time Logs` Card; `handleHoursLogged`/`timeLogsRefreshKey` added and wired to `TaskTimerButton`.

### Deviations From Plan
- Task doc's Proposed File Changes didn't list `_time-log-form.tsx` as a file to change, but did
  flag the need to "confirm... before assuming zero changes needed" — that check found it does
  hardcode a task-specific URL, so it required the `apiBasePath` generalization described above.
  Scope stayed within the task's intent (reuse, not fork); no new file was added beyond what the
  doc proposed.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing warnings in an unrelated file, 0 errors)
- Browser acceptance testing (manual add, timer-stop refresh, PM read-only view) - SKIPPED (no
  interactive browser session in this run; recommend running the Verification section's three
  browser checks before merging)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused/dead code, no untyped escape hatches, no deep nesting, error handling matches the
  established pattern (empty catches on abortable fetches, explicit error JSON on API failures).
- Repeated logic: the simplify pass found `` `/api/v2/tasks/${taskId}/time-logs` `` had grown to 4
  duplicated occurrences inside `_task-time-logs.tsx` (the useEffect fetch, `handleDelete`, and
  both `TimeLogForm` call sites) after the `apiBasePath` prop rename. Extracted a single
  `apiBasePath` const at the top of the component and pointed all 4 sites at it — `_issue-time-logs.tsx`
  already did this correctly from the start, so this brings the task-side file in line with it.
  No behavior change; `npx tsc --noEmit` and `pnpm lint` re-verified clean after the edit.
- Naming, file responsibility, and conventions all match the sibling task-side files this was
  adapted from (component/route naming, comment density, error-message wording).
- No secrets/credentials/debug logging; the one `console.error` in the POST route matches the
  exact pattern already used in the task-side equivalent.

### Deviations
- Minor: `_time-log-form.tsx`'s `taskId` prop was generalized to `apiBasePath` — not listed in the
  task doc's Proposed File Changes, but the doc explicitly flagged this exact risk ("confirm...
  before assuming zero changes needed") and the generalization follows an existing codebase
  precedent (`TaskAttachmentViewerModal`'s `fetchUrl` prop, task 211/212). Still satisfies scope:
  reuse, not a new component or new product surface.
- Minor: added `_issue-time-logs.tsx` as a standalone `Card`, matching how Attachments/Comments
  (235/236) already render on this page today (separate Cards, not a merged tab panel) — this is
  the "if landing before 235/236... if landing after" branch the task doc anticipated, resolved in
  favor of matching the page's current actual shape.

### Required Fixes
- None.
