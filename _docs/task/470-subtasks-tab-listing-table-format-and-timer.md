# 470: Subtasks tab as a Tasks-listing table (sort, bulk delete, collapse/expand, timer)

**Created:** 2026-11-12
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned
**Builds on:** 467 (Subtasks tab) and 469 (assignee subtask permission), both in Testing. Land after 469.

---

## Overview

The Task Details → **Subtasks** tab (`_task-subtasks.tsx`, shared by v2 + legacy) is a plain indented checklist today: a closed checkbox, title, rollup, status text, and hover add/delete icons. Users want it to look and behave like the **Tasks listing table**, minus the Task List grouping:

- the same columns and row: Task Name (expand chevron, copy link, add subtask, rollup chip), Status select, Assignee picker, Due Date, Priority, hours logged, and **Timer** (start, pause/resume, stop)
- collapse/expand on any row that has its own subtasks
- **sortable** column headers (sorted within each sibling level, D2)
- **row checkboxes + bulk Delete bar**, as in the listing (D1)

**Approach (ponytail): don't build a second table, share the one that exists.** `Row` and `SortHeader` are private to `_list-view.tsx`, which is already **658 lines**. That's over the 400–500 hard limit in `nextjs-file-length-best-practices.md`. Extracting them fixes the file length and gives the tab the identical row for free.

Evidence (re-verify):

| Fact | Where |
|------|-------|
| `Row` (checkbox, name + chevron + copy link + add-subtask + rollup, status select, `AssigneeMultiSelect`, due, priority, hours, `TaskTimerButton`) | `_list-view.tsx:489-658` |
| `SortHeader`, `getDueColor`, `STATUS_OPTS`, `PRIORITY_ORDER`, `STATUS_ORDER`, `DEPTH_INDENT`, `GRID` | `_list-view.tsx:24-45, 301, 471-487` |
| `sortTasks()` is a closure over `sortKey`/`sortDir` props | `_list-view.tsx:~183-194` |
| Bulk bar (amber strip, count, Trash with tooltip) + `ConfirmDialog`; `selectableIds` = rows where `canEditDetails` (task 285) | `_list-view.tsx:~108-116, 345-383` |
| `TaskTimerButton` already does start / pause / resume / stop through `useTimer()` (server-persisted `active_timers`); the listing shows it when `task.assignees` includes the user | `_task-timer-button.tsx`; `_list-view.tsx:645-655` |
| Timer and time-log server gates are per task and assignee-based (subtasks included, task 469) | `api/v2/timer/start/route.ts:27-35` |
| The tab loads the subtree with `GET /api/v2/tasks/[id]/subtasks?tree=1` (flat `select("*")`, level by level) and builds it with `buildTree`/`rollup` | `_task-subtasks.tsx:49`; `api/v2/tasks/[taskId]/subtasks/route.ts` GET; `src/lib/tasks/subtask-tree.ts` |
| The tab already fetches `/api/staff/members` (`getAssignableMembers`, shape `{id, full_name, avatar_url, role}`), but only when the add modal opens | `_task-subtasks.tsx:56-60` |
| Listing hours come from the project loader's `time_logs` sum (`hoursById`). The tab has no hours source today | `_get-project-detail-data.ts:105-107` |
| Optimistic PATCH + rollback pattern to mirror | `_project-detail.tsx:247-259` (`updateTask`) |
| `_task-subtasks.tsx` is 202 lines; `_task-detail.tsx` (v2/legacy) 499 each; panel 143 | `wc -l` |

## Requirements

- [ ] **Shared table pieces** extracted from `_list-view.tsx` with no visual or behaviour change to the listing:
  - `_task-row.tsx`: `TaskRow` (today's `Row`), plus `getDueColor`, `STATUS_OPTS`, `DEPTH_INDENT`
  - `_task-table-parts.tsx`: `TASK_GRID`, `SortHeader`, `TaskTableHeader` (the column-header row), `BulkDeleteBar` (amber strip + `ConfirmDialog`), and a pure `sortTasks(list, key, dir)` with `STATUS_ORDER`/`PRIORITY_ORDER`
- [ ] **Subtasks tab = a table**: a rounded card (`rounded-[14px] border border-[#E2E7F2] bg-white`, same as the listing) with `TaskTableHeader` (sortable Task Name / Status / Due Date / Priority) and one `TaskRow` per subtask. **No Task List group rows.**
- [ ] **Tree:** rows are indented by depth (relative to the viewed task). The chevron collapses or expands any row that has children (default: expanded), and the rollup chip shows closed/total descendants. Adding a subtask expands its parent.
- [ ] **Sorting (D2):** clicking a header sorts **siblings within each level** (`sortTasks` on each children array). Default is no sort key, so rows keep `position` order. A second click flips direction, as in the listing.
- [ ] **Selection + bulk delete (D1):** row checkboxes enabled only where `getTaskEditPermission(..., row).canEditDetails` (the same tooltip for restricted rows comes with `TaskRow`). A header "select all" checkbox toggles all selectable visible rows. `BulkDeleteBar` asks for confirmation, then `DELETE /api/v2/tasks/{id}` each, with optimistic removal including descendants (FK cascade) and rollback plus an inline error on failure. Selecting a parent and its child must not double-delete: skip ids whose ancestor is also selected.
- [ ] **Inline edits** (status, assignees) go through an optimistic `PATCH /api/v2/tasks/{id}` with rollback, mirroring `updateTask`. Server permission rules are unchanged (assignee-only rows get the limited status list from `TaskRow`).
- [ ] **Timer:** `TaskRow` shows `TaskTimerButton` on subtasks assigned to the current user: start, pause/resume, stop. Stopping adds the hours to that row's hours cell immediately (`onHoursLogged`).
- [ ] **Hours column:** `GET …/subtasks?tree=1` returns `logged_hours` on each row, the sum of `time_logs.hours` per task, fetched **paged** (`.range` loop, CLAUDE.md pagination rule) in one `.in("task_id", ids)` query. The tab seeds `hoursById` from it.
- [ ] **Assignee column:** load `/api/staff/members` on tab mount (no longer only when the modal opens). Build `profilesById` from it, falling back to the existing `assigneeProfiles` for people not in the pool.
- [ ] **Add subtask:** the top "Add subtask" button and the per-row add icon (`TaskRow`'s `onAddSubtask`, gated on `canAddSubtask` from 469, depth < `MAX_SUBTASK_DEPTH`) keep opening the existing `CreateTaskModal`.
- [ ] **Width:** the tab sits in the Task Details main column, which is narrower than the listing. Wrap the card in `overflow-x-auto` with the grid's minimum width so columns never squash or overlap. Verify at 1280px and 1440px (AC A6).
- [ ] **Empty state:** no subtasks → icon + one line + the "Add subtask" action (CLAUDE.md UI polish), instead of an empty table.
- [ ] **File length:** every touched or new file ends ≤ 400 lines (target ≤ 300 for components). `_list-view.tsx` must drop from 658 to ≤ 450.

## Out of Scope / Must-Not-Change

- **Tasks listing behaviour and look are unchanged:** same grid, groups, sticky header, sort, bulk delete and timer (AC A8–A9). This is a move, not a redesign.
- No attachment-count indicator on subtask rows (D3: skipped; `TaskRow` gets `attachmentCount={undefined}`, so the indicator stays hidden).
- No drag-reorder, no reparenting, no filters or toolbar in the tab, no Task List column or grouping.
- No API permission changes. `PATCH`/`DELETE /api/v2/tasks/[id]` and the 469 subtask POST gate stay as they are.
- Don't touch the old `_task-drawer.tsx`, Board/Calendar views, or `projects-old/`.
- No `bg-background`/`dark:` tokens or shadcn `Table`/`Badge`. Keep the hand-rolled pill and row classes `TaskRow` already uses (CLAUDE.md "Do not fix").
- No git commands.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_shared/_task-row.tsx` | Create (~190 lines) | `TaskRow` moved verbatim from `_list-view.tsx`. Add an optional `selectable` mode: unchanged when the parent passes `selected`/`onToggle` |
| `src/app/(hub)/projects/_shared/_task-table-parts.tsx` | Create (~130 lines) | `TASK_GRID`, `SortHeader`, `TaskTableHeader` (props: sort state, optional select-all checkbox, `className` for the listing's sticky classes), `BulkDeleteBar`, pure `sortTasks` + order maps |
| `src/app/(hub)/projects/_shared/_list-view.tsx` | Modify (658 → ~420) | Import the above; delete the moved code. No behaviour change |
| `src/app/(hub)/projects/_shared/_task-subtasks.tsx` | Rewrite (~260) | Table version (requirements above). Reuses `buildTree`/`rollup`/`MAX_SUBTASK_DEPTH`, `TaskRow`, the parts, and `CreateTaskModal` |
| `src/app/api/v2/tasks/[taskId]/subtasks/route.ts` | Modify | `?tree=1` adds `logged_hours` per row (paged `time_logs` sum) |
| `_docs/task/470-sort-tasks.check.ts` | Create | `npx tsx` asserts for `sortTasks` (each key, both directions, null due dates last) and the "skip descendants of a selected ancestor" helper |

If the row props need it (members, `assigneeProfiles`), also touch `{v2,legacy}/…/_task-attachments-comments-panel.tsx` and `_task-detail.tsx` to pass `assigneeProfiles` through. Keep this to prop wiring only.

## Code Context

`_list-view.tsx` `Row` props (move as-is, rename to `TaskRow`):
```ts
task, selected, onToggle, href, onUpdate, currentUserId, currentUserRole, profilesById, allMembers,
hoursById, attachmentCount, onHoursLogged, gridClass, depth, childrenCount, isExpanded, onToggleExpand,
onAddSubtask, rollup
```
Listing grid: `"grid-cols-[32px_1fr_148px_156px_108px_80px_64px_48px]"` (checkbox, name, status, assignee, due, priority, hours, timer). The tab uses the same grid, so the header and rows line up.

Tree in the tab (existing):
```ts
const tree = useMemo(() => buildTree(rows ?? [], taskId), [rows, taskId]); // TreeNode<Task>{task, children, depth}
```
Apply sorting per level when rendering: `sortTasks(nodes.map(n => n.task), key, dir)`, then map back to nodes by id. Or sort `TreeNode[]` with a comparator built from `sortTasks`'s key function. Pick whichever is shorter.

Descendant-safe bulk delete: walk `selected` and drop any id whose ancestor chain (via `parent_task_id`, from `rows`) contains another selected id. Put this in the check file.

## Implementation Steps

1. Extract `TaskRow` and the table parts. `_list-view.tsx` imports them. Run `npx tsc --noEmit`, then compare the listing in the browser against the current one (A8).
2. Write `470-sort-tasks.check.ts` against `sortTasks` and the ancestor-skip helper.
3. `?tree=1` returns `logged_hours` (paged).
4. Rewrite `_task-subtasks.tsx`: members fetched on mount, `hoursById`, `collapsed`, `sort`, `selected` state, header, rows, bulk bar, empty state, `overflow-x-auto`.
5. Run tsc and eslint, `wc -l` on the touched files, then the browser checks.
6. Only if the narrow column still reads poorly after step 4, run `/impeccable:impeccable` (critique) on the tab. Don't restyle the listing.

## Acceptance Criteria

| # | Check | Expected | When |
|---|-------|----------|------|
| A1 | `npx tsx _docs/task/470-sort-tasks.check.ts` | Passes: title/status/priority/due asc+desc, null due last, and ancestor-skip drops child ids when their parent is selected | pre-merge |
| A2 | `npx tsc --noEmit` and `npx eslint` on the touched files | 0 errors | pre-merge |
| A3 | `wc -l` on `_list-view.tsx`, `_task-row.tsx`, `_task-table-parts.tsx`, `_task-subtasks.tsx` | `_list-view.tsx` ≤ 450, the others ≤ 300 | pre-merge |
| A4 | Browser: Task Details → Subtasks on a task with 3 levels | Table with listing columns, no Task List rows; chevrons collapse and expand each level; rollup chips correct | pre-merge, manual |
| A5 | Click the Due Date header twice, then Priority | Siblings re-order within each level, children stay under their parent, arrow flips | pre-merge, manual |
| A6 | Viewport 1280px and 1440px | No overlapping or squashed columns; horizontal scroll inside the card if needed; no page-level horizontal scroll | pre-merge, manual |
| A7 | As an assignee developer on a subtask: start the timer from its row → pause → resume → stop | Header and floating widget show the running timer; after stop, that row's hours cell increases and a time log exists on `/dashboard/timelogs` (with the 469 parent link) | pre-merge, manual |
| A8 | **No regression:** Tasks listing in v2 and legacy projects | Pixel-equivalent to before: groups, sticky header, sort, row hover actions, timer, bulk delete | pre-merge, manual |
| A9 | Select a parent subtask and its child → Delete → confirm | One DELETE request (parent only); both rows gone; on a forced failure (offline) rows return and an inline error shows | pre-merge, manual |
| A10 | As an assignee-only developer | Checkboxes disabled with the "restricted" tooltip on rows they didn't create; status limited to In Progress / Ready for QA | pre-merge, manual |
| A11 | Subtask-less task | Empty state with an "Add subtask" action (hidden for read-only users) | pre-merge, manual |

## Verification

```bash
npx tsx _docs/task/470-sort-tasks.check.ts
npx tsc --noEmit
npx eslint "src/app/(hub)/projects/_shared/_list-view.tsx" "src/app/(hub)/projects/_shared/_task-row.tsx" "src/app/(hub)/projects/_shared/_task-table-parts.tsx" "src/app/(hub)/projects/_shared/_task-subtasks.tsx" "src/app/api/v2/tasks/[taskId]/subtasks/route.ts"
wc -l "src/app/(hub)/projects/_shared/"{_list-view,_task-row,_task-table-parts,_task-subtasks}.tsx
```
Browser checks need a developer account assigned to a subtask (for the timer) and a PM account.

## Coordination

| Shared file | Other task | Rule |
|-------------|-----------|------|
| `_task-subtasks.tsx`, `_list-view.tsx`, `subtasks/route.ts` | **467** (Testing) | Land after 467's testing closes; rebase onto any fixes it makes |
| `_task-subtasks.tsx` (per-child delete gate), `_list-view.tsx` (`canAddSubtask`), `subtasks/route.ts` (POST gate) | **469** (Testing) | **Land after 469.** Keep its `canAddSubtask` / `canEditDetails` gates when moving `Row` |
| `_list-view.tsx` | **459** (Testing: attachment indicator on rows) | `AttachmentIndicator` moves with `TaskRow` unchanged |
| `_list-view.tsx` | **468** (Testing: merge wizard) | No overlap found (468 doesn't touch the listing). Re-check before landing |

## Open Decisions

- **D1 (RESOLVED 2026-11-12, user):** checkboxes + bulk Delete bar, the same as the listing.
- **D2 (RESOLVED 2026-11-12, user):** sortable headers that sort siblings within each level.
- **D3 (RESOLVED 2026-11-12, user):** no attachment-count indicator on subtask rows.

## Operator Steps

None: merge is enough. No migration or env change. `worker/` doesn't import `_shared` UI or the subtasks route.

## Compatibility Touchpoints

- `GET /api/v2/tasks/[taskId]/subtasks?tree=1` gains a `logged_hours` field per row (additive). Its only caller is `_task-subtasks.tsx`; the plain GET (no `tree`) is unchanged.
- No MCP tool changes, so `_docs/mcp-tools.md` is untouched.
- Design skills: the format is dictated by the existing listing, so `/frontend-design` isn't needed. `/impeccable:impeccable` runs only as the conditional critique in Implementation Step 6.

## Baseline (2026-11-12, before changes)
- `npx tsc --noEmit`: 0 errors.
- `wc -l`: `_list-view.tsx` 658, `_task-subtasks.tsx` 202. A3 failed at baseline (658 > 450).
- A1 check file absent; `sortTasks` was a closure inside `ListView` and `topSelectedIds` didn't exist, so A1 could not pass before.

## Implementation Notes

### What Changed
- The listing's row moved **verbatim** to `_task-row.tsx` (`TaskRow`). Column header, sort header, grid and bulk-delete bar moved to `_task-table-parts.tsx`. `_list-view.tsx` now imports them (658 → 389 lines) and re-exports `SortKey`/`SortDir`, so `_project-detail.tsx` imports are unchanged.
- Pure `sortTasks(list, key, dir, normalize)` and `topSelectedIds(selected, parentOf)` live in `src/lib/tasks/task-sort.ts`.
- Subtasks tab rewritten as the listing table, without Task List groups:
  - sortable header that sorts siblings per level (default: position order)
  - select-all + per-row checkboxes on rows where `canEditDetails`, and `BulkDeleteBar` (noun "subtask"); it deletes only the top-most selected ids and re-fetches the tree if any delete fails
  - chevron collapse/expand (default expanded) and rollup chip
  - inline status and assignee edits (optimistic PATCH + rollback)
  - hours column, plus the `TaskTimerButton` start/pause/resume/stop on rows assigned to the user; a timer stop adds to that row's hours immediately
  - per-row add subtask via `TaskRow`'s own `canAddSubtask` gate
  - empty state with icon, one line and the action
  - `overflow-x-auto` + `min-w-220` (880px) so columns never squash in the narrower Task Details column
- `GET …/subtasks?tree=1` returns `logged_hours` per row (paged `time_logs` sum).

### Files Changed
- `src/app/(hub)/projects/_shared/_task-row.tsx` (new, 206): `TaskRow` + row helpers, moved from `_list-view.tsx`
- `src/app/(hub)/projects/_shared/_task-table-parts.tsx` (new, 103): `TASK_GRID`, `TaskTableHeader`, `BulkDeleteBar`
- `src/lib/tasks/task-sort.ts` (new): `sortTasks`, `topSelectedIds`, `SortKey`/`SortDir`
- `src/app/(hub)/projects/_shared/_list-view.tsx` (658 → 389): uses the shared pieces; no behaviour change intended
- `src/app/(hub)/projects/_shared/_task-subtasks.tsx` (202 → 257): table rewrite
- `src/app/api/v2/tasks/[taskId]/subtasks/route.ts`: `logged_hours` on `?tree=1`
- `_docs/task/470-sort-tasks.check.ts` (new)

### Deviations From Plan
- **Minor:** `sortTasks`, the order maps and the ancestor-skip helper went to `src/lib/tasks/task-sort.ts` instead of `_task-table-parts.tsx`. That keeps them importable by the `npx tsx` check without pulling in `"use client"` UI modules (next/link, tooltip). `SortHeader` stays private inside `TaskTableHeader`.
- **Minor:** no `assigneeProfiles` fallback for the Assignee column. Names come from `/api/staff/members` (all assignable staff), so no props were threaded through the panels or detail pages. An inactive or excluded assignee shows the picker's unknown-name fallback, as in the listing (which uses the same pool for `allMembers`).
- **Minor:** row-level "Add subtask" now follows each **row's** `canAddSubtask` (that subtask's creator or assignees, PM/Admin), the same as the listing and the server. Before, every row used the viewed task's `canAdd`. The top "Add subtask" button still uses `canAdd`.
- Bulk-delete failure path re-fetches the tree instead of restoring a snapshot, so rows that did delete don't reappear.
- `/impeccable:impeccable` (Implementation Step 6) **not run**. It is conditional on a visual problem, and no browser check has run yet.

### Verification Run
- `npx tsx _docs/task/470-sort-tasks.check.ts`: PASS (A1; baseline: absent → OK)
- `npx tsc --noEmit`: PASS (A2; baseline 0 → 0)
- `npx eslint` on all touched files: PASS (A2; 0 errors, 0 warnings)
- `wc -l`: PASS (A3; `_list-view` 389 ≤ 450, `_task-row` 206, `_task-table-parts` 103, `_task-subtasks` 257, all ≤ 300)
- `npx tsx _docs/task/469-subtask-permission.check.ts`, `npx tsx _docs/task/467-subtask-tree.check.ts`: PASS (no regression)
- A4–A11 (browser): **SKIPPED**. No dev server was running (ports 3000 and 3001 refused), and the checks need PM + assigned-developer sessions. A8 (listing pixel-equivalence) is the key one: the row JSX moved verbatim and the header and bulk-bar classes were kept identical, but this has **not been observed**.

### Attempts That Failed
- `topSelectedIds` first version: the A1 cycle case returned `[]`. The ancestor walk looped back to the starting id, found it "selected", and dropped it. Fixed by seeding `seen` with the starting id; A1 now passes.
- First tab version called a state-setting `load()` from `useEffect`. eslint `react-hooks/set-state-in-effect` error. Fixed with a pure `fetchTree()` and `.then(setRows)` in the effect (the original code's pattern).

### Operator Steps
- None: merge is enough. No migration or env change. `worker/` imports none of these modules.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Scope matches Requirements and D1–D3. No Task List grouping, no attachment indicator, no API permission changes, no drawer, Board or `projects-old` edits.
- No duplicate table: listing and tab share one `TaskRow`, `TaskTableHeader` and `BulkDeleteBar`. Listing classes kept identical (bar `px-8 py-2`, sticky header classes passed via `className`, empty `<div />` leading spacer by default). One harmless addition: `aria-label="Clear selection"` on the bar's X button.
- File lengths are within `nextjs-file-length-best-practices.md`: 389 / 206 / 103 / 257. Each file has one clear purpose.
- Pure logic (`sortTasks`, `topSelectedIds`) sits in `src/lib`, with a behaviour check including the cycle edge case it caught. No `any`. One `!` in `sorted()` is safe because `byId` is built from the same nodes.
- Errors are handled on purpose: optimistic PATCH rolls back; bulk delete re-fetches on partial failure; aborted fetches are ignored.
- Minor (not blocking): `bulkDelete`'s `collect` uses `ids.includes` inside a tree walk (O(n·m)). Subtrees are capped by depth and small, so this is acceptable; a `Set` would be tidier.
- Minor (not blocking): an `error` message from a failed delete stays shown after later successful actions until reload. This is the same behaviour as before 470.
- Minor (not blocking): if `/api/staff/members` fails, the Assignee column shows the unknown-name fallback. It degrades but doesn't break.

### Deviations
- Minor: helpers moved to `src/lib/tasks/task-sort.ts` (testability).
- Minor: no `assigneeProfiles` fallback (member pool only).
- Minor: row-level "Add subtask" follows each row's own `canAddSubtask`, matching the listing and server; the top button still follows the viewed task.
- Minor: on partial bulk-delete failure the tab re-fetches instead of restoring a snapshot.
- No Medium or Major deviations.

### Acceptance-criteria coverage
- A1–A3 ran and pass. A4–A11 are manual browser checks that can fail; none has run yet (no dev server). **A8 (listing unchanged) is the priority for `test`.** If A6 shows the narrow column reads poorly, run `/impeccable:impeccable` (Implementation Step 6).

### Required Fixes
- None.

## Post-Gate UI Fix (2026-11-12, requested by user)
- The "Add subtask" button moved to the **top-right** of the Subtasks tab, in a row it shares with the error line on the left. It shows in both the empty and non-empty states. Before, it sat left-aligned under the empty-state text and above the table.
- Restyled to the brand-orange primary pill used elsewhere (`bg-brand-orange text-white hover:bg-brand-orange/90`, `rounded-full`, visible `focus-visible` outline).
- The empty state is now icon + one line; its action is the top-right button. Same gate (`canAdd`, depth cap).
- `npx tsc --noEmit` and `npx eslint` on the file: PASS. Visual check pending.
- Follow-up (same day, user): the button is now blue to match the Task Details "Add Time Log" button (`bg-[#007BFF] hover:bg-[#0063D6]`, same pill and padding, `_task-time-logs.tsx:114`) instead of brand-orange.
