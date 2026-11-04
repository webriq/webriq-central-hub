# 467: Nested Subtasks — Task Detail "Subtasks" panel + "Add subtask" in the Tasks listing (multi-level)

**Created:** 2026-11-04
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Users need to break a task into subtasks, and subtasks into further subtasks (Subtask → Subtask1, Subtask2 → Subtask2-1 …), from **(a)** the Tasks tab listing and **(b)** the Task Details page. Every subtask is a real task and shows up in the Tasks listing as an indented, expandable child of its parent ("tabbed" tree).

**Most of the plumbing already exists — this is mainly wiring + hardening, not a new data model.** Evidence (re-verify):

| Fact | Where |
|------|-------|
| `tasks.parent_task_id uuid references tasks(id) on delete cascade` | `supabase/migrations/025_v2_schema.sql:43` |
| `tasks.depth integer not null default 0` (set by the Zoho import) | `supabase/migrations/042_tasks_import_columns.sql`, `src/app/api/admin/zoho-import/tasks/route.ts:188` |
| `GET/POST /api/v2/tasks/[taskId]/subtasks` exist (direct children only) | `src/app/api/v2/tasks/[taskId]/subtasks/route.ts` |
| Listing already renders a recursive, indented, expandable tree (`renderRows`, `childrenByParent`, `DEPTH_INDENT`, up to 7 levels); loader fetches ALL project tasks incl. children | `src/app/(hub)/projects/_shared/_list-view.tsx:34,229,289-314,530`; `_get-project-detail-data.ts:77` |
| Task drawer has a flat, one-level subtask checklist | `src/app/(hub)/projects/_shared/_task-drawer.tsx:30-90` |
| **Missing:** subtask UI on the Task Details **page**, and "Add subtask" on a listing row | `projects/v2/[projectId]/tasks/[taskId]/_task-detail.tsx` (no subtask code), `_list-view.tsx` Row |
| **Gaps in the existing POST:** does not set `depth`; does not copy `tasklist_id`; default `status: "backlog"` (the `tasks_status_check` was replaced by migration 034 with the Zoho status set — `"backlog"` is likely rejected; **verify**) ; no `kind='task'`/checklist guard; no max-depth guard | `subtasks/route.ts:56-66` |

## Requirements

- [ ] **Task Details page** (v2 `projects/v2/[projectId]/tasks/[taskId]` and its legacy twin `projects/legacy/[projectId]/tasks/[taskId]`): a new **"Subtasks" tab inside the existing Comments / Attachments / Time Logs tab strip** (`_task-attachments-comments-panel.tsx`, underline tabs with live count) — NOT a separate card. The tab shows the task's subtree as an indented, collapsible tree with status, assignee, due date; each row links to that subtask's own detail page; inline "Add subtask" input at the top level and an "Add subtask" action on every row (creates a child of *that* row). Header shows a "Subtask of {parent title}" breadcrumb when the task has a parent.
- [ ] **Tasks listing**: a per-row "Add subtask" action (visible on row hover/focus, `aria-label`'d) that inserts an inline title input directly under the parent row, indented one level deeper; on save the new row appears in the tree and the parent auto-expands. Works at every depth (up to the cap).
- [ ] **Nesting**: unlimited-feeling multi-level (Subtask → Subtask1 → Subtask1-1 …) with a hard server-enforced cap (see D1).
- [ ] **Correct data on create**: new subtask gets `project_id`, `milestone_id`, `tasklist_id`, `priority` from the parent, `depth = parent.depth + 1`, valid default status (`open`), `kind='task'`, `created_by`, `position` after existing siblings.
- [ ] Subtasks appear in the listing **only** under their parent (tree), never as duplicate roots — roots remain `parent_task_id IS NULL AND depth = 0`.
- [ ] Task-count/listing queries keep using `excludingChecklist()`; new queries added by this task use it too.
- [ ] Sub-tree rollup indicator on a parent row: "{done}/{total} subtasks" (all descendants) in the listing and on the Subtasks tab label (count) and tab body.
- [ ] Respect existing permissions: only users who may edit the **parent** (`getTaskEditPermission`, RLS) can add; read-only users see the tree without add controls.
- [ ] Degrade gracefully: if the `depth` write fails (column missing → Postgres `42703`) retry without it (CLAUDE.md "written, not applied" rule). No new migration is planned, so this is only defensive.

## Out of Scope / Must-Not-Change

- No new table or column; no migration (columns already exist — see Operator Steps).
- No parent-status auto-rollup / blocking ("can't close parent with open subtasks"), no drag-to-reparent, no subtask templates, no cross-project subtasks.
- Do not change Board / Calendar views, Time Logs, or the StackShift/Zoho import paths.
- Do not add a second recipient picker or touch `src/components/share-picker/`.
- `GET /api/v2/projects/[projectId]/tasks` ("top-level tasks (no subtasks)") semantics stay as-is.
- Do not "fix" listing styling toward shadcn tokens; follow the existing hand-rolled pill/row conventions (CLAUDE.md UI Polish).
- No git commands.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/v2/tasks/[taskId]/subtasks/route.ts` | Modify | POST: copy `tasklist_id`/`priority`, set `depth`, status `open`, depth-cap 400, sibling `position` (max+1), `kind` guard, `42703` retry. GET: add `?tree=1` returning the whole descendant set (recursive, flat list) in one call. |
| `src/lib/tasks/subtask-tree.ts` | Create | Pure helpers: `buildTree(tasks, rootId)`, `descendantCount/doneCount`, `MAX_SUBTASK_DEPTH`. Shared by listing, detail page, API. |
| `_docs/task/467-subtask-tree.check.ts` | Create | `npx tsx` pure-logic check for `subtask-tree.ts` (nesting, rollup counts, depth cap, orphan handling). |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-subtasks.tsx` | Create | Body of the new "Subtasks" tab (tree, inline add per row, toggle done, delete); reports its count via `onCountChange`. |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-attachments-comments-panel.tsx` | Modify | Add `"subtasks"` to `PanelTab`/`TAB_ORDER`/`TAB_LABEL` (order: Comments, Attachments, Time Logs, Subtasks — see D5) and counts; mount body with the `hidden` toggle like the other tabs. |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | Pass subtask data to the panel; breadcrumb "Subtask of …". |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/page.tsx` | Modify | Load parent (id/display_id/title) + descendants server-side and pass to client. |
| `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/page.tsx` (+ its `_task-detail.tsx`) | Modify | Same card/breadcrumb (legacy twin; keep parity — confirm it is still routed, see D4). |
| `src/app/(hub)/projects/_shared/_list-view.tsx` | Modify | Row hover "Add subtask" button + inline title input row under the parent; parent rollup chip; call new handler. |
| `src/app/(hub)/projects/_shared/_project-detail.tsx` | Modify | Own `onAddSubtask(parentId, title)` → POST, append returned row to `tasks` state, auto-expand parent. Pass to `ListView`. |
| `src/app/(hub)/projects/_shared/_task-drawer.tsx` | Modify (small) | Reuse the fixed POST; no UI redesign. Only if it breaks on the status/depth fix. |
| `_docs/mcp-tools.md` | Modify **only if** an MCP tool is touched | Not expected. |

## Code Context

### `src/app/api/v2/tasks/[taskId]/subtasks/route.ts` (current POST — to harden)
```ts
const { data: parent } = await supabase.from("tasks").select("project_id,milestone_id").eq("id", taskId).single();
...insert({ project_id: parent.project_id, parent_task_id: taskId, milestone_id: parent.milestone_id,
  title: body.title.trim(), status: body.status || "backlog", priority: body.priority || "normal",
  position: typeof body.position === "number" ? body.position : Date.now(), created_by: user.id })
```
Needed: select `project_id, milestone_id, tasklist_id, depth, kind`; reject when `kind !== 'task'` or `depth + 1 > MAX_SUBTASK_DEPTH`; insert `depth: parent.depth + 1`, `tasklist_id`, status `open`.

### `src/app/(hub)/projects/_shared/_list-view.tsx`
```ts
const DEPTH_INDENT = ["pl-0","pl-4","pl-8","pl-12","pl-16","pl-20","pl-24"] as const;   // :34 (supports depth 0..6)
function renderRows(list: Task[], depth = 0)  // :289 — recursive over childrenByParent
const groups = ... tasks.filter(t => !t.parent_task_id && t.depth === 0)               // :192 roots only
```
Initial `expandedRows` only pre-expands depth-0 parents (`:133-143`) — newly created children must expand their parent explicitly.

### Task numbering
`tasks.display_id` is trigger-generated (`089_task_issue_display_id.sql`, `{PROJ}-T0001`). Subtasks get their own `display_id` automatically; detail routes use `display_id`, so link rows by `display_id`.

## Implementation Steps

1. Create `subtask-tree.ts` + `467-subtask-tree.check.ts`; run the check.
2. Harden `POST …/subtasks` (fields above, depth cap, `42703` retry); add `GET ?tree=1` (iterative level-by-level `in("parent_task_id", ids)` fetch, ≤ cap rounds, paginate if >1000 rows per CLAUDE.md pagination rule; wrap with `excludingChecklist`).
3. Listing: add row action + inline input + rollup chip; wire `onAddSubtask` in `_project-detail.tsx`.
4. Detail page: loader changes in `page.tsx`, `_task-subtasks.tsx` tab body + panel tab wiring, breadcrumb; mirror in legacy page.
5. Smoke-test the drawer flow still works after the POST fix.
6. `npx tsc --noEmit`; run the check; browser acceptance (below).

## Acceptance Criteria

- [ ] **Pure logic** — `npx tsx _docs/task/467-subtask-tree.check.ts` exits 0: 3-level nesting renders in order, rollup counts descendants (not just children), depth cap rejects level `MAX+1`. *(pre-merge, automated)*
- [ ] **Types** — `npx tsc --noEmit` clean. *(pre-merge)*
- [ ] **API create** — `POST /api/v2/tasks/{id}/subtasks {title}` → 201 with `parent_task_id = id`, `depth = parent.depth+1`, `tasklist_id` = parent's, status `open`, non-null `display_id`. Re-POST against that child → depth 2. *(browser/curl with session, pre-merge)*
- [ ] **API cap** — POST on a task at depth `MAX_SUBTASK_DEPTH` → 400 with a readable message; nothing inserted. *(pre-merge)*
- [ ] **Detail page** — open a task, add "Sub A", then on Sub A add "Sub A-1": the Subtasks tab shows A → A-1 indented; clicking A-1 opens its own detail page whose breadcrumb reads "Subtask of Sub A". *(browser, pre-merge)*
- [ ] **Listing** — on the Tasks tab, hover a row → "Add subtask" → type title + Enter: row appears indented under parent, parent expanded, rollup chip "0/1". Repeat on the subtask to get a third level (indent increases). Reload: same tree persists. *(browser, pre-merge)*
- [ ] **Tasklist grouping** — the new subtask appears only under its parent inside the parent's tasklist group; it is NOT also listed as a root in "No Tasklist". *(browser, pre-merge)*
- [ ] **Rollup** — closing a leaf subtask updates the parent chip on the listing and the Subtasks tab (incl. its count) without reload. *(browser)*
- [ ] **Permissions** — a read-only user (not creator/assignee/PM) sees the tree but no "Add subtask" controls; POST as that user is rejected by RLS/permission check. *(browser + curl, pre-merge)*
- [ ] **No regression — roots & counts**: project task counts / list totals for a project with no subtasks are unchanged; checklist rows (`kind='checklist'`) never appear in the tree or counts. *(browser + SQL spot-check, pre-merge)*
- [ ] **No regression — drawer & Zoho-imported trees**: the existing task drawer still adds/toggles/deletes a subtask; an already-imported Zoho parent with children still renders identically. *(browser, pre-merge)*
- [ ] **Delete cascade** — deleting a parent with subtasks asks for confirmation naming the subtree size and removes all descendants. *(browser, manual: destructive)*

## Verification

```bash
npx tsc --noEmit
npx tsx _docs/task/467-subtask-tree.check.ts
pnpm build --webpack     # optional pre-merge sanity
# Browser: /projects/v2/{projectId}/tasks and a task detail page as PM, assignee, and read-only user
```

## Coordination

| Overlaps with | Shared files | Rule |
|---------------|--------------|------|
| **459** (Testing) — attachment indicator | `_list-view.tsx`, `_project-detail.tsx`, `_get-project-detail-data.ts`, `_task-detail.tsx` | Land **after 459** (it is in Testing; rebase onto its Row/header changes). |
| **466** (Testing) — comment mentions | `_task-comments.tsx`/`_comment-editor.tsx`; possibly `_task-detail.tsx` and `_task-attachments-comments-panel.tsx` | No expected conflict (different panel); if 466 touched `_task-detail.tsx`, land after 466. |
| **460** (Planned) — Cliq DMs on status change | `src/app/api/v2/tasks/[taskId]/route.ts` (PATCH) | This task does not edit that route; subtask status toggles go through it and would trigger 460 DMs — acceptable, note for 460's tester. |
| **429/430** (In Progress/Planned) — programme cutover / work-breakdown rename | `tasks.milestone_id`/`tasklist_id` → `phase_id`/`deliverable_id` | POST copies `milestone_id`/`tasklist_id`; if 430 lands first, copy the renamed columns instead (use aliases). Land **after 430** or re-check column names. |

## Open Decisions

- **D1 (NON-BLOCKING)** — Max nesting depth. Default **5** levels below the root (listing indent supports 7; deeper is unreadable). Say if you want a different cap or "unlimited".
- **D2 (NON-BLOCKING)** — Inherited fields on a new subtask. Default: project, milestone/phase, tasklist, priority copied; assignees, dates, description **not** copied (blank, editable afterwards). Say if assignees/dates should inherit.
- **D3 (NON-BLOCKING)** — Deleting a parent cascades to all descendants (existing FK `on delete cascade`). Default: keep, with a confirmation that names the count. Alternative: block delete while children exist.
- **D5 (NON-BLOCKING)** — Tab position. Default: last (Comments, Attachments, Time Logs, Subtasks) so the default Comments tab is unchanged. Say if Subtasks should come first.
- **D4 (NON-BLOCKING)** — Legacy twin detail page (`projects/legacy/...`) gets the same UI for parity. Default: yes; drop it if legacy is being retired.

## Operator Steps

None: merge is enough. (`parent_task_id` and `depth` already exist in production via migrations 025/042; no new migration, no deploy of a separately deployed component. Only the Next.js app imports the changed code — found by grepping `parent_task_id` / `subtasks` under `src/`, `worker/` and `supabase/functions`: worker does not reference them.)

## Compatibility Touchpoints

- MCP `list-tasks` / `list-open-tasks` / ops-chat tools already return subtasks as ordinary rows; no tool signature changes, so `_docs/mcp-tools.md` stays untouched.
- Update `_docs/context/projects.md` with a short "Subtasks" section (depth cap, POST contract, tree rules) at the document stage.

## Implementation Notes

### What Changed
- Subtasks API hardened: POST copies `tasklist_id`/`priority`, sets `depth`, default status `open`, rejects checklist parents and depth > `MAX_SUBTASK_DEPTH` (5), appends after siblings, retries without `depth` on `42703`. GET `?tree=1` returns all descendants (level-by-level, bounded by the cap).
- New "Subtasks" tab (last, with count) in the Task Details tab strip, v2 + legacy: tree with indent, close/reopen, per-row add, delete with subtree-size confirm, rollup chip, links to each subtask's page.
- "Subtask of {parent}" breadcrumb in both detail headers.
- Listing: per-row "Add subtask" (hover/focus, `aria-label`) with inline input under the row; parent auto-expands; rollup chip `done/total` over all descendants now shown on every parent row (replaces the collapsed-only direct-child count).

### Files Changed
- `src/lib/tasks/subtask-tree.ts` (new), `_docs/task/467-subtask-tree.check.ts` (new)
- `src/app/api/v2/tasks/[taskId]/subtasks/route.ts`
- `src/app/(hub)/projects/_shared/_task-subtasks.tsx` (new, shared by v2 + legacy), `_list-view.tsx`, `_project-detail.tsx`
- `projects/{v2,legacy}/[projectId]/tasks/[taskId]/{_task-attachments-comments-panel,_task-detail,page}.tsx`

### Deviations From Plan
- Tab body lives in `projects/_shared/_task-subtasks.tsx` (one copy) rather than the v2 task folder, because the legacy panel is a byte-identical duplicate.
- Detail tab fetches its own tree client-side (`?tree=1`) instead of page.tsx loading descendants; page.tsx only loads the parent for the breadcrumb.
- `_task-drawer.tsx` not modified (it benefits from the POST fix as-is).
- No baseline captured before changes (checks are new-feature behaviours; none existed to run).

### Verification Run
- `npx tsx _docs/task/467-subtask-tree.check.ts` - PASS
- `npx tsc --noEmit` - PASS for all touched files; remaining errors are pre-existing in `_mention-extension.tsx` (missing `@tiptap/extension-mention`/`suggestion` from task 466, not installed)
- `npx eslint` on touched files - PASS (no output)
- Browser acceptance (create/nest/cap/permissions/regression/cascade) - SKIPPED (needs an authenticated session; not run). Must be covered in `test 467`.

### Attempts That Failed
- None.

### Operator Steps
- None: merge is enough. (`parent_task_id`/`depth` already exist via migrations 025/042.)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Fixed during review: arbitrary `pl-[4.5rem]` in `_task-subtasks.tsx` replaced with scale value `pl-20` (CLAUDE.md styling rule); `buildTree` cycle guard rewritten from a side-effecting `filter` into explicit steps.
- Re-run after fixes: subtree check PASS, `tsc` clean except pre-existing `_mention-extension.tsx` errors (task 466 deps).
- Minor, left as-is: `descendantRollup` in `_list-view.tsx` repeats the logic of `rollup()` in `subtask-tree.ts` (different input shape: id→children map vs. tree); `descendantRollup` has no cycle guard (cycles can't be created via the API; FK + POST only).
- Weak evidence: only the pure tree logic has an automated check; API/UI criteria have no automated check and remain browser-only (`manual`, authenticated session needed).

### Deviations
- Shared tab body in `projects/_shared/` instead of the v2 folder; client-side `?tree=1` fetch instead of page.tsx loading descendants; `_task-drawer.tsx` untouched — all Minor, no scope change.

### Required Fixes
- None.

## Follow-up Scope (2026-11-04, requested by user after testing started)

Added to this task (still in Testing; no other agent had claimed it):
- [ ] The new-subtask form (a modal, from the Tasks listing row button and the Task Details Subtasks tab) takes optional **start date**, **due date** and **assignees**.
- [ ] Subtask dates are **capped at the parent's due date** (UI: native date `max`; server: 400 if start/due is later than the parent's `due_date`; also 400 if start > due). No cap when the parent has no due date.
- [ ] Assigning a user who is not already on the parent **adds them to the parent's `assignees`** (direct parent only; server-side, done before the insert; refused with 403 if RLS stops the parent update). Assignees are validated against `getAssignableMembers()`.

### Implementation (follow-up)
- `src/app/api/v2/tasks/[taskId]/subtasks/route.ts` — body `start_date`, `due_date`, `assignees[]`; validation + parent assignee merge.
- `_create-task-modal.tsx` — new optional `parent` prop turns it into the **New Subtask** modal (same fields as New Task: Title, Description, Attachments, Milestone, Task list, Status, Priority, Start/Due date & time, Assignee, Notes). Pre-filled from the parent: priority, milestone, task list, due date/time; Status defaults to Open; start/due pickers stop at the parent's due date (`DateTimeFieldPicker` new `maxDate` prop); "Parent task" block above Title; posts to `/api/v2/tasks/{parent}/subtasks`. Replaces the earlier custom subtask modal/inline form (deleted).
- Subtasks API now accepts the full task field set (description, status, priority, milestone, tasklist, start/due date+time, notes, labels, assignees), validates status/priority, defaults milestone/tasklist/priority from the parent, syncs `project_members` for assignees.
- Listing: row button calls `onAddSubtask(parent)`; `_project-detail.tsx` owns the modal and merges the parent's assignees locally. Subtasks tab opens the same modal (fetches members/task lists on open).
- `_project-detail.tsx` / `_task-subtasks.tsx` — mirror the parent's new assignees locally; the Task Details page `router.refresh()`es when the viewed task is the parent.
- Panels/detail (v2 + legacy) pass `taskTitle`/`taskDueDate`.

### Follow-up verification
- `npx tsc --noEmit` — PASS for touched files (only the existing `_mention-extension.tsx` errors); eslint on touched dirs — no findings in these files.
- Behaviour (cap 400, parent assignee merge, 403 path, UI date `max`) — **NOT RUN** (same blocker as the main report: no env/login). Add to `test 467`:
  - POST subtask with `due_date` > parent's → 400; equal to parent's → 201.
  - POST with an assignee not on parent → 201 and parent's `assignees` now contains them; a user already on the parent → parent unchanged.
  - As a user who can't edit the parent → 403, no subtask row created.
  - UI: date picker cannot pick past the parent's due date; new assignee appears on the parent row / detail sidebar.

### Known limits (not changed)
- The cap and assignee rule apply at **creation** only. Editing a subtask's dates/assignees later via the existing PATCH route is unchanged (not capped, does not touch the parent), and moving a parent's due date earlier doesn't re-cap existing subtasks.
- Only the **direct** parent gets the new assignee, not further ancestors.
