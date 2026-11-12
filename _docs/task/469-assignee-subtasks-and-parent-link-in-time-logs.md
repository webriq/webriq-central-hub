# 469: Assignees can create subtasks and log time on them, plus a "Parent task" link on subtask time logs

**Created:** 2026-11-12
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned
**Builds on:** 467 (nested subtasks, currently in Testing). Land after 467.

---

## Overview

Today only the task creator, or a PM, admin or super_admin, sees "Add subtask". A developer who is **assigned** to a task gets `ASSIGNEE_STATUS_ONLY` from `getTaskEditPermission` (`canEditDetails: false`), and every subtask entry point is gated on `canEditDetails`.

Wanted:
1. Assignees of a task can create subtasks under it.
2. They can log time on those subtasks.
3. In the Time Logs table, a log against a **subtask** shows a small "Parent task · {display_id}" link above the Log Title. Logs against top-level tasks, tickets and general logs look the same as today.

**Most of this already works server-side.** Re-verify each point:

| Fact | Where |
|------|-------|
| UI gate: Task Detail passes `canAddSubtask={perm.canEditDetails}` (v2 + legacy) | `src/app/(hub)/projects/{v2,legacy}/[projectId]/tasks/[taskId]/_task-detail.tsx:98,485` |
| UI gate: listing row shows "Add subtask" only when `perm.canEditDetails` | `src/app/(hub)/projects/_shared/_list-view.tsx:524,582` |
| Subtask tab uses the same `canAdd` for **both** add and delete | `src/app/(hub)/projects/_shared/_task-subtasks.tsx:128,138,162` |
| `POST /api/v2/tasks/[taskId]/subtasks` has **no app-level permission check**. Only RLS applies, and that already lets any developer insert with `created_by = self` | `src/app/api/v2/tasks/[taskId]/subtasks/route.ts`; `supabase/migrations/092_…sql:20-22` (`tasks_developer_insert`) |
| The parent-assignee cascade in that POST runs under `tasks_developer_update`, which already allows creator **or assignee** | `subtasks/route.ts` (missing-assignee update); migration 092:25-29 |
| Time logging and the timer are gated on "caller is in `task.assignees`", per task, and need no change | `api/v2/tasks/[taskId]/time-logs/route.ts:72-76,104-106`; `api/v2/time-logs/route.ts:256`; `[timeLogId]/route.ts:76-78`; `api/v2/timer/start/route.ts:27-35` |
| The developer who creates a subtask is its `created_by`, so they get `FULL_EDIT` on it (and `canStartTimer` once assigned) | `src/lib/tasks/permissions.ts:59` |
| **Gap:** the Time Logs task picker only lists **top-level** tasks, so subtasks can't be chosen | `src/app/(hub)/dashboard/timelogs/_task-ticket-picker.tsx:95` → `api/v2/projects/[projectId]/tasks/route.ts:10,28` (`.is("parent_task_id", null)`) |
| **Gap:** time-log entries carry no parent info | `api/v2/time-logs/route.ts:137` selects `id, title, display_id` only; `TimeLogEntry` in `_time-logs-shared.ts` |
| One shared table renders both the `/dashboard/timelogs` page and the project Time Logs tab | `_time-logs-table.tsx` (Log Title cell ~L300-330), used by `_time-logs-content.tsx` and `projects/_shared/_time-logs-tab.tsx` |
| Saved and edited entries are merged into state client-side (no refetch), built from the picker value | `_time-logs-table.tsx:163-187` (`LogTitleEditor.commit`), `_time-log-entry-modal.tsx:44,236`, `_time-logs-content.tsx:100` |

So the work is: one permission flag, UI gates, a server check, auto-assigning the creator, the picker listing subtasks, and the parent link.

## Requirements

- [ ] Add `canAddSubtask` to `TaskEditPermission`. It is `true` for admin, pm, super_admin, the developer creator, and a **developer assignee**, and `false` for everyone else (client, marketing, hr, unassigned developers).
- [ ] Every "Add subtask" entry point uses `perm.canAddSubtask` instead of `canEditDetails`: the Task Detail Subtasks tab (v2 + legacy), the per-row control in the listing, and the top "Add subtask" button inside the tab.
- [ ] The subtask tab's **delete** control stays per child: show it only when `getTaskEditPermission(role, userId, child).canEditDetails`. An assignee can delete subtasks they created, not anyone else's.
- [ ] `POST /api/v2/tasks/[taskId]/subtasks` enforces `canAddSubtask` against the parent (403 otherwise), using the same profile-role lookup as `PATCH /api/v2/tasks/[taskId]`.
- [ ] **Self-assign so time can be logged:** when the caller is a developer and the request has no assignees, the server sets `assignees = [user.id]`. Without this the creator could not log time (logging is assignee-only). The cascade keeps the caller on the parent, where they already are.
- [ ] The Time Logs task picker also lists **subtasks** the user is assigned to, each with a small parent hint, so they can log time from `/dashboard/timelogs` as well as from the subtask's own detail page.
- [ ] Time-log entries with a subtask `task_id` carry `parent_task_title` and `parent_task_display_id`. All other entries get `null` for both.
- [ ] In the Log Title cell: when `parent_task_display_id` is set, render a small, truncated line **above** the title: `Parent task · {display_id} {parent title}` (D2), linking to the parent's detail page (same base path as `detailHref`), with the full text in the `title` attribute. Use a real `<Link>` as a **sibling** of the title button, never nested inside it (see the existing comment at `_time-logs-table.tsx` ~L316). Top-level tasks, tickets and general logs render exactly as today.
- [ ] The parent line stays correct after an in-place edit (inline Log Title picker or modal): carry the parent on the picker's task value and copy it into the optimistic entry.

## Out of Scope / Must-Not-Change

- No migration. RLS already allows the insert and the cascade (see the table above).
- Assignees still **cannot** edit the parent's details. `canEditDetails` and `allowedStatusValues` for assignees stay unchanged.
- Leave the time-log and timer permission rules alone. They are already per-task and assignee-based.
- `GET /api/v2/projects/[projectId]/tasks` default output stays "top-level only". Subtasks are opt-in via a query param. `_create-task-modal.tsx` (POST) and `projects-old` don't use the GET and stay untouched.
- Don't touch the old `_task-drawer.tsx` flat subtask checklist (it has no gating today and is outside this request), the PDF export (`_export-pdf.ts`), or the task-detail Time Logs tab (`_task-time-logs.tsx`). Every row there belongs to the same task, so a parent line adds nothing; its breadcrumb is already in the header.
- No git commands.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/tasks/permissions.ts` | Modify | Add `canAddSubtask` (FULL_EDIT `true`, ASSIGNEE_STATUS_ONLY `true`, READ_ONLY `false`) |
| `src/app/api/v2/tasks/[taskId]/subtasks/route.ts` | Modify | POST: select `created_by` with the parent, load the role, 403 unless `canAddSubtask`; default `assignees` to `[user.id]` for a developer when none are given |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | `canAddSubtask={perm.canAddSubtask}`; pass role and user id through so the tab can gate delete per child |
| `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | Same (legacy twin) |
| `src/app/(hub)/projects/{v2,legacy}/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx` | Modify | Only if needed to forward role and user id to `TaskSubtasks` |
| `src/app/(hub)/projects/_shared/_task-subtasks.tsx` | Modify | Gate delete on the child's `canEditDetails`; keep add on `canAdd` |
| `src/app/(hub)/projects/_shared/_list-view.tsx` | Modify | Row "Add subtask" gate: `perm.canAddSubtask` (L582). Bulk-select stays on `canEditDetails` (L113) |
| `src/app/api/v2/projects/[projectId]/tasks/route.ts` | Modify | GET: `?include_subtasks=1` drops the `parent_task_id is null` filter (still through `excludingChecklist`) |
| `src/app/(hub)/dashboard/timelogs/_task-ticket-picker.tsx` | Modify | Fetch with `?include_subtasks=1`; `PickerItem` and the task variant of `TaskTicketValue` gain `parent?: { title: string; displayId: string \| null }`, derived from `parent_task_id` within the same fetched list; show the parent hint in the option row |
| `src/app/(hub)/dashboard/timelogs/_time-logs-shared.ts` | Modify | `TimeLogEntry` gains `parent_task_title: string \| null`, `parent_task_display_id: string \| null` |
| `src/app/api/v2/time-logs/route.ts` | Modify | GET: select `parent_task_id` on tasks, then make **one** extra `.in("id", parentIds)` query for parent `title, display_id`, and fill the two fields |
| `src/app/(hub)/dashboard/timelogs/_time-logs-table.tsx` | Modify | Parent line in the Log Title cell; `LogTitleEditor.commit` copies `value.parent` into the entry (null for ticket and general) |
| `src/app/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx` | Modify | Same carry-over when building the saved entry (~L236), and `initialValue` (~L44) includes the parent from the entry |
| `_docs/task/469-subtask-permission.check.ts` | Create | `npx tsx` assert check for `getTaskEditPermission(...).canAddSubtask` across the role and creator/assignee matrix |

No other files. The table and picker are the only places `TimeLogEntry` and `TaskTicketValue` are built. Re-grep `task_display_id:` and `kind: "task"` under `src/app/(hub)` before you finish.

## Code Context

`src/lib/tasks/permissions.ts` (current shape):
```ts
const FULL_EDIT = { canEditDetails: true, canChangeStatus: true, allowedStatusValues: "all", canStartTimer: false };
const READ_ONLY = { canEditDetails: false, canChangeStatus: false, allowedStatusValues: [], canStartTimer: false };
const ASSIGNEE_STATUS_ONLY = { canEditDetails: false, canChangeStatus: true, allowedStatusValues: DEVELOPER_ASSIGNEE_STATUS_OPTIONS, canStartTimer: true };
// admin/pm/super_admin → FULL_EDIT; non-developer → READ_ONLY; dev creator → FULL_EDIT (+timer if assignee); dev assignee → ASSIGNEE_STATUS_ONLY
```

`subtasks/route.ts` POST parent load (add `created_by` to the select list):
```ts
.select("project_id,milestone_id,tasklist_id,priority,depth,kind,assignees,due_date")
```
Self-assign default goes right after `const assignees = …` and before the `getAssignableMembers` check. The caller is always assignable, but keep the check running on the final list.

`_time-logs-table.tsx` Log Title cell (~L301-330): `<div className="flex items-center gap-1.5">` → title `<button>` + hover actions. Wrap the title in a `flex flex-col` with the parent `<Link>` above it, e.g. `text-[10.5px] text-[#5F6A88] hover:text-[#007BFF] transition-colors`, aria-label `Open parent task {display_id}`. Follow the hand-rolled pill/text conventions; no shadcn tokens.

Parent href: reuse `detailHref`'s base:
```ts
const base = `${entry.project_is_legacy ? V2_ROUTES.PROJECTS_LEGACY : V2_ROUTES.PROJECTS_V2}/${entry.project_public_id}`;
// parent: `${base}/tasks/${entry.parent_task_display_id}`
```
Extract a tiny `projectBase(entry)` only if both call sites need it. Otherwise inline it.

## Implementation Steps

1. Add `canAddSubtask` in `permissions.ts`, then write and run `_docs/task/469-subtask-permission.check.ts`.
2. Subtasks POST: role lookup, 403 gate, developer self-assign default.
3. UI gates: both `_task-detail.tsx` files, `_list-view.tsx` row, and per-child delete in `_task-subtasks.tsx`.
4. `include_subtasks` on the project tasks GET; switch the picker to it and add the parent hint.
5. Add parent fields to `TimeLogEntry` and the time-logs GET enrichment.
6. Add the parent line in the table, and carry the parent over in `LogTitleEditor` and the entry modal.
7. Run `npx tsc --noEmit`, then the browser checks below.

## Acceptance Criteria

| # | Check | Expected | When |
|---|-------|----------|------|
| A1 | `npx tsx _docs/task/469-subtask-permission.check.ts` | Passes: dev assignee `canAddSubtask=true` and `canEditDetails=false`; dev non-assignee/non-creator `false`; client/marketing/hr `false`; pm/admin/super_admin `true` | pre-merge |
| A2 | `npx tsc --noEmit` | 0 errors | pre-merge |
| A3 | Browser, as a developer **assigned to but not creator of** task T: Task Detail → Subtasks tab | "Add subtask" visible; create "S1" succeeds (201); S1 shows in the tree and the listing under T | pre-merge, manual |
| A4 | Same user: open S1 detail | S1 assignees include the user; Time Logs tab shows "Add"; manual log saves; Start timer works | pre-merge, manual |
| A5 | Same user, as an API call: `POST /api/v2/tasks/{T}/subtasks` against a task they are **neither assigned to nor created** | 403 | pre-merge |
| A6 | Same user on T's Subtasks tab, where a sibling was created by the PM | No delete icon on the PM's subtask; delete icon on their own S1 | pre-merge, manual |
| A7 | `/dashboard/timelogs` → Add entry → project of T | Picker lists S1 with a parent hint; saving the log adds a row whose Log Title is S1 with a `Parent task · {T.display_id} {T.title}` link above it, **before** reload | pre-merge, manual |
| A8 | Reload `/dashboard/timelogs`, then click the parent link | Link still shows (from the server); it opens T's detail page (v2 or legacy route according to the project) | pre-merge, manual |
| A9 | Inline-edit that row's Log Title to a top-level task, then to a ticket | Parent line disappears immediately and stays gone after reload | pre-merge, manual |
| A10 | **No regression:** a log on a top-level task, a ticket and a general log, in both `/dashboard/timelogs` and the project Time Logs tab | Render exactly as before, with no parent line | pre-merge, manual |
| A11 | **No regression:** a dev assignee on T's detail page | Title, description, dates and assignees are still read-only; status options still limited to In Progress / Ready for QA | pre-merge, manual |
| A12 | **No regression:** `GET /api/v2/projects/{projectId}/tasks` without the param | Still returns only `parent_task_id IS NULL` rows | pre-merge |

## Verification

```bash
npx tsx _docs/task/469-subtask-permission.check.ts
npx tsc --noEmit
```
Browser checks A3–A11 need two accounts (a PM who creates T and assigns a developer, and that developer).

## Coordination

| Shared file | Other task | Rule |
|-------------|-----------|------|
| `subtasks/route.ts`, `_task-subtasks.tsx`, `_list-view.tsx`, both `_task-detail.tsx`, `_task-attachments-comments-panel.tsx` | **467** (Testing, code in working tree) | Land after 467. Don't reopen 467's scope: if 467's testing changes these files, rebase onto that |
| `api/v2/time-logs/route.ts`, `_time-logs-table.tsx` | **468** (merge wizard re-points time logs) | No code overlap expected; 468 only writes `time_logs.task_id`. Re-check if 468 lands first |
| `tasks` column names | **430** (milestone/tasklist → phase/deliverable rename) | This task touches no renamed columns. Re-check if 430 lands first |

## Open Decisions

- **D1 (RESOLVED 2026-11-12, user): an assignee may assign anyone to the subtask.** The modal's assignee picker stays enabled, and the existing 467 cascade adds those people to the parent too. Accepted widening: an assignee can indirectly add assignees to a parent whose details they can't edit. RLS already allowed it via the API.
- **D2 (RESOLVED 2026-11-12, user): the label shows both the display ID and the title**, as `Parent task · TSK-123 Checkout revamp`. Truncate the line to the cell width and put the full title in the `title` attribute.

## Operator Steps

None: merging is enough. No migration, no new env vars, no separately deployed components (`worker/` doesn't import any of the changed modules: re-check with `grep -rn "lib/tasks/permissions\|time-logs" worker`).

## Compatibility Touchpoints

- `TimeLogEntry` gains two nullable fields. The only consumers are the timelogs components and `_export-pdf.ts`, which ignores them.
- MCP server: no tool registered or changed, so `_docs/mcp-tools.md` needs no update.

## Baseline (2026-11-12, before changes)
- `npx tsc --noEmit`: 0 errors.
- A1 check file didn't exist yet. `canAddSubtask` wasn't on `TaskEditPermission`, so the check could not pass before the change.

## Implementation Notes

### What Changed
- Added `canAddSubtask` to the permission tiers. It is true for PM/admin/super_admin, the developer creator, and the developer assignee.
- The subtasks POST now returns 403 without `canAddSubtask` on the parent. It defaults `assignees` to `[caller]` for a developer who sends none, so they can log time on the subtask.
- "Add subtask" (Task Detail tab, v2 + legacy, and the listing row) is now gated on `canAddSubtask`. The tab's delete icon is gated per subtask on that subtask's `canEditDetails`.
- The project tasks GET accepts `?include_subtasks=1` and is now paged with `.range()`. The Time Logs picker uses the param and shows a "Subtask of {ID} {title}" hint.
- `TimeLogEntry` gains `parent_task_title` and `parent_task_display_id` (required, nullable). The time-logs GET fills them with one extra parent query. The inline Log Title editor and the entry modal carry them over from the picker value.
- The Log Title cell shows `Parent task · {display_id} {title}` (truncated, full text in `title`) above the title, linking to the parent's detail page.

### Files Changed
- `src/lib/tasks/permissions.ts`: `canAddSubtask`
- `src/app/api/v2/tasks/[taskId]/subtasks/route.ts`: 403 gate, developer self-assign default
- `src/app/(hub)/projects/{v2,legacy}/[projectId]/tasks/[taskId]/_task-detail.tsx`: `perm.canAddSubtask`
- `src/app/(hub)/projects/{v2,legacy}/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx`: forward `currentUserId`/`currentUserRole`
- `src/app/(hub)/projects/_shared/_task-subtasks.tsx`: per-subtask delete gate
- `src/app/(hub)/projects/_shared/_list-view.tsx`: row add gate
- `src/app/api/v2/projects/[projectId]/tasks/route.ts`: `include_subtasks`, pagination
- `src/app/(hub)/dashboard/timelogs/_task-ticket-picker.tsx`: `TaskParent`, subtasks listed with a parent hint
- `src/app/(hub)/dashboard/timelogs/_time-logs-shared.ts`: parent fields
- `src/app/api/v2/time-logs/route.ts`: parent enrichment
- `src/app/(hub)/dashboard/timelogs/_time-logs-table.tsx`: `projectBase()` helper, parent link, parent carry-over in the inline editor
- `src/app/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx`: parent carry-over
- `_docs/task/469-subtask-permission.check.ts`: new pure-logic check

### Deviations From Plan
- **Pagination added** to `GET /api/v2/projects/[projectId]/tasks`. Including subtasks makes it realistic for a large Zoho-imported project to pass 1000 rows (CLAUDE.md pagination rule). I added a secondary `.order("id")` so page boundaries are stable. Default output (top-level only) is unchanged.
- The parent fields are **required** (`string | null`), not optional, so tsc enforces them. Only the entry modal builds an entry from scratch; every other place spreads `...entry`.
- When the parent isn't visible to the viewer (RLS), the label still shows if the title resolved but there's no link. In practice parent and subtask share a project, so both resolve.

### Verification Run
- `npx tsx _docs/task/469-subtask-permission.check.ts`: PASS (A1; baseline: file absent → now: OK)
- `npx tsc --noEmit`: PASS (A2; baseline 0 → now 0 errors)
- `npx eslint` on the changed files: PASS (exit 0)
- `npx tsx _docs/task/467-subtask-tree.check.ts`: PASS (no-regression for 467 helpers)
- A3–A12 (browser and API): **SKIPPED**. No dev server was running, and these need two signed-in accounts (a PM and an assigned developer). Code-read only for A12: without the param, `.is("parent_task_id", null)` still applies.

### Attempts That Failed
- None.

### Operator Steps
- None: merge is enough. No migration or env change. `worker/` imports none of the changed modules (`grep -rn "lib/tasks/permissions\|time-logs" worker` returns nothing).

## Quality Gate Notes

### Result
PASS

### Standards Review
- Scope matches Requirements. Every file changed is in Proposed File Changes. No dead code, no `any`, no debug logging.
- Permissions have one source of truth (`getTaskEditPermission.canAddSubtask`), used by both the server gate and the UI. The new check (`469-subtask-permission.check.ts`) asserts behaviour across the role matrix, not source text.
- The 403 gate runs right after the parent load and before any write. The cascade's parent update still happens only after validation (no partial writes).
- Parent enrichment adds one batched query (`.in(parentIds)`), not one query per row.
- Accessibility: the parent link has an `aria-label` and a `title`, isn't nested inside the title `<button>`, and the hover color has a visible transition. Uses Tailwind only, following the table's hand-rolled `text-[10.5px]` conventions.
- Minor (not blocking): `GET /api/v2/projects/[projectId]/tasks` now collects rows into `Record<string, unknown>[]`. The response JSON is the same, but the in-route row type is looser than before. It's only serialized, so acceptable.
- Minor (not blocking): the developer self-assign default also applies to a developer **creator** of the parent who sends no assignees. This is intended (they can't log time otherwise). The cascade then adds them to the parent, which RLS allows for the creator.

### Deviations
- **Minor:** pagination added to the project tasks GET (needed for the CLAUDE.md 1000-row rule once subtasks are included). Default semantics unchanged.
- **Minor:** parent fields are required (`string | null`), not optional, so tsc enforces every place an entry is built.
- No Medium or Major deviations.

### Acceptance-criteria coverage
- A1 and A2 ran and pass. A3–A12 each name a check that could fail, but none has run yet: they need a running dev server and two accounts. The `test` stage must run them.

### Required Fixes
- None.

## Post-Gate UI Fix (2026-11-12, requested by user)
- The subtask detail header ran the back link ("← {project}") and 467's "Subtask of {parent}" link together on one line with no gap. In both `_task-detail.tsx` files (v2 + legacy) they are now one flex breadcrumb row with a `/` separator: `← Project / Subtask of **Parent title**`. The parent title is truncated, with the full text in `title`. Both links keep their targets.
- `npx tsc --noEmit` and `npx eslint` on both files: PASS. Visual check pending in the browser.
