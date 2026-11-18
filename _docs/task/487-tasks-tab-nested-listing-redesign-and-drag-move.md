# 487: Project › Tasks tab — nested Phase › Group › Task listing redesign + drag-and-drop move

**Created:** 2026-11-18
**Priority:** HIGH
**Type:** enhancement (UI/UX) + small API + migration (written-not-applied)
**Recommended Tier:** deep (data-moving RPC, permission rules, DnD across a 4-level tree, shared row component)
**Status:** Testing

---

## Overview

Redesign the Project › **Tasks** tab list view to follow the Figma Make prototype **"Modern Nested Task List"** (`figma.com/make/98PqIEFfA3w3ZTZ63C41qC`, Tasks tab). The redesign adds a **Phase** level above the existing tasklist groups, a progress strip, comment counts, a density toggle, a "Show completed" toggle, and drag-and-drop with a **drop-indicator line**. Drag-and-drop must be able to move items **between groups, phases and parent tasks**, not just reorder siblings like the prototype.

This is an enhancement, not a rewrite. **Every existing Tasks-tab function stays** (inventory below). The look follows `_final_design/guide/` + `DESIGN.md` v2.0, except where this doc records an approved exception (D1) or deliberately strengthens contrast (§Visual spec).

The tab is rendered by the shared `ProjectDetail`, so it changes on both `/projects/<classification>/<id>/tasks` and `/projects/legacy/<id>/tasks`. `projects-old` is not touched.

### What the prototype does (evidence, captured 2026-11-18 in Chrome)

| Prototype behaviour | Verdict for the Hub |
|---|---|
| 4 levels: Phase band (flag tile, `PHASE n` chip, name, `3 of 9 tasks` + mini bar, `Due Mar 14`, ⋯) › Group (stripe, name, count, ⋯, hover "+ Add task") › Task › Subtask (≥3 deep, ~26px indent per level) | **Adopt** (phase = `milestones` row via `tasklists.milestone_id`) |
| Hover row: drag handle ⠿ left gutter, left accent, ⋯ right | **Adopt** |
| Checkbox cascade: child ticked → group + phase checkboxes go indeterminate | **Adopt** (selection still feeds the existing bulk-delete bar) |
| Search keeps the ancestor path of a match | **Already true** (root match keeps its subtree; group/phase shown if it has a match) |
| Show completed toggle | **Adopt** (synced with Status filter) |
| List/grid toggle = row density only | **Adopt as a density toggle**. List/Board/Calendar toggle stays. |
| Overall progress card (%, completed, remaining (mock shows no number: bug), target date) | **Adopt**, with the number fixed |
| Native HTML5 DnD; reorder **only within the same parent** (task, subtask, group, phase); cross-parent and nest drops = no-op; only feedback = source row at 40% opacity; **no drop indicator**; phase badge keeps its old number after a phase reorder | **Extend**: cross-parent moves, nesting, drop-indicator line, keyboard DnD, numbering by position |
| ⋯ menus, status pill click, filters, Add milestone = not wired in the mock | Hub keeps its working equivalents |

---

## Decisions (resolved with the user 2026-11-18)

- **D1 RESOLVED: Figma-faithful accents.** Phases and groups get **colored left stripes**, as in the mock. This is an approved exception to the guide's "no accent stripes" rule, **scoped to phase/group header rows of this listing only** (task rows don't get a resting stripe; the hover accent below is a state cue). Color rules (see D5):
  - Phase stripe + flag tile = **phase state**, not an arbitrary hue: `active` → blue `#007BFF`, `completed` → ok `#177E48`, `planned` → `#8792B0`. When a milestone's name equals a programme phase (Onboard / Migrate & Rebrand / Publish / AI Visibility / Optimize), use that phase's fixed hue instead (guide vocabulary). Never reuse a programme hue otherwise.
  - Group stripe: fixed 6-color rotation by group order within its phase: `#0063D6 #B85512 #0B8A93 #44508A #177E48 #C0392B`, tint at 100% fg on 3px × 20px rounded bar.
- **D2 RESOLVED: Dragging switches the sort.** Add **"Manual order"** (`position`) to the sort options. Handles always show on hover; when a drag starts while another sort is active, the list switches to Manual order *before* lifting, and a `toast.info("Sorted by manual order")` appears once per session. The default sort stays **Status**.
- **D3 RESOLVED: Editors move, assignees reorder.** People with `canEditDetails` (creator, pm/admin/super_admin; Test User = pm on test data via `asTestRole`) may move a task **anywhere** (other group, other phase, other parent, nest/un-nest). Assignees who can only change status may **reorder among siblings** (same parent + same tasklist). Rows the user can't do either on show **no handle**. Group and phase drags: **pm/admin/super_admin only** (matches `tasklists_pm_write` / milestones RLS).
- **D4 RESOLVED: Include all four extras:** comment counts, progress strip, Show completed toggle, density toggle.

- **D5 RESOLVED (2026-11-18): State + rotation.** Phase stripe = phase state (active blue / completed green / planned grey; a programme-phase name uses its fixed hue). Group stripe = fixed 6-color rotation by order within the phase. Constants live in `_tasks/_tree-colors.ts`.
- **D6 RESOLVED (2026-11-18): Fix the shared token on all screens.** Change `STATUS_STYLE` blue-family text (`in_progress`, `testing_completed`, `ready_to_merge`) and `PRIORITY_STYLE.normal` text from `#007BFF` to `#0063D6` in `_pm-shared.tsx` (17 importers). `#007BFF` on `#E5F1FF` is 3.6:1 and fails AA at 11px; `#0063D6` is about 5:1. Text color only, no layout change.
- **D7 RESOLVED (2026-11-18): Save density to the user's account** via task 482's `user_preferences`, not the browser. Migration 184 adds `user_preferences.tasks_density text not null default 'comfortable' check (tasks_density in ('comfortable','compact'))`. `PUT /api/v2/me/preferences` accepts `tasks_density` as well as `projects_view` (each validated if present; at least one required; upsert writes only the keys sent). The loader reads it. Missing table/column (`42P01` / `PGRST205` / `42703`) → `comfortable`, and the save is a silent no-op (same as 482). **Requires migration 182 applied before 184.**
- **D8 RESOLVED (2026-11-18): Renumber by order.** The `PHASE n` chip is the phase's index in `milestones.position` order, so it renumbers after a phase reorder (the mock keeps old numbers; treated as a mock bug).

## Open Decisions

None.

---

## Existing functionality inventory: MUST all survive

Verified from `_project-detail.tsx`, `_list-view.tsx`, `_task-row.tsx`, `_task-table-parts.tsx` on 2026-11-18. Each line is an acceptance check (AC-R*).

**Toolbar** (`_project-detail.tsx:478-553`)
1. Search "tasks or tasklists" (root match keeps the whole subtree).
2. Status / Priority / Assignee multi-select filters (`FilterMultiSelect`), Assignee options from task 346.
3. Sort select (`SortSelect`) + sortable column headers (Task name, Status, Due date, Priority; asc/desc toggle).
4. Collapse all / Expand all (list view only). Now covers phases **and** groups.
5. Clear filters (shown only with active filters).
6. List / Board / Calendar view toggle (tooltips, `aria-label`). Board and Calendar unchanged.
7. **New Task** orange CTA (the one CTA on screen).

**Groups**
8. Group select-all checkbox, limited to tasks the user may delete (task 285); disabled when none.
9. Collapse per group; group task count.
10. "General" fallback group for tasks with no visible tasklist (task 486, `generalTasklistId`).
11. Deep link `?tasklist=<id>` scrolls that group into view once (task 241); must also **expand its phase** if collapsed.
12. Empty group: "No tasks in this list." (text strengthened, see visual spec).

**Rows** (`_task-row.tsx`)
13. Row checkbox, disabled + tooltip "You're restricted from taking action on this task" when not deletable.
14. Expand/collapse chevron for rows with subtasks (title tooltip with count); parents with children start expanded.
15. Title is a real `<Link>` (middle-click / ⌘-click opens a new tab, task 290); hover color.
16. **Attachment count** indicator (`AttachmentIndicator`, task 459).
17. **Copy link** button (`CopyLinkButton`), hover-revealed, focus-visible.
18. **Add subtask** button (`ListTree`), only if `perm.canAddSubtask` and depth < `MAX_SUBTASK_DEPTH`; opens the New Subtask modal and re-expands the parent after create (`expandRequest`).
19. Subtask rollup chip `done/total` over all descendants.
20. Inline **Status** select with permission-limited options (task 209).
21. Inline **Assignee** multi-select (`AssigneeMultiSelect`), editable only with `canEditDetails`.
22. Due date with color (late / ≤7 days / normal), "—" when empty.
23. Priority dot + label.
24. **Hours logged** (HH:MM + tooltip in words).
25. **Timer** (`TaskTimerButton`, prominent) for tasks assigned to me; `onHoursLogged` updates the hours column live.

**List-level**
26. Bulk-delete bar + irreversible confirm (`BulkDeleteBar`).
27. Sticky column header with stuck-corner detection.
28. Empty states: "No tasks yet." + New Task; "No tasks match your filters." + Clear filters.
29. Realtime `tasks` INSERT/UPDATE/DELETE sync.
30. Shared row/header still render correctly in **Task Details › Subtasks tab** (`_task-subtasks.tsx`, task 470), which uses `TaskRow`, `TaskTableHeader` and `BulkDeleteBar`.

---

## Requirements

### R1 Structure: Phase › Group › Task › Subtask
- [ ] Phases = the project's `milestones` (ordered by `position`, then `start_date`). A group belongs to the phase of `tasklists.milestone_id`.
- [ ] Groups with no phase render in a trailing **"No phase"** section, with a neutral band and no `PHASE n` chip. A project with **zero milestones renders no phase bands at all** (groups only, as today).
- [ ] Phase band: chevron, flag tile (stripe color, tint bg), `PHASE n` mono chip, name (Inter 14/700 ink), `done of total tasks` + 64px mini progress bar (closed root + sub tasks), `Due <date>` (mono, from `milestones.due_date`; red if past and not completed). A phase `⋯` menu is **not** added (nothing to put in it).
- [ ] Group header: checkbox (task 285 rules, plus indeterminate state), chevron, stripe, name (13/700 ink), count chip, and on hover **"+ Add task"**, which opens `CreateTaskModal` with this tasklist preselected (`TaskDefaults.tasklist_id`, new).
- [ ] Phases and groups collapse independently. Collapse all / Expand all covers both. Collapsed state lives in the existing `collapsedGroups` set, with phase ids prefixed `phase:`.
- [ ] Checkbox cascade: indeterminate parents (group from its tasks; phase from its groups). A phase checkbox selects every selectable task in the phase.

### R2 Row redesign (`TaskRow`)
- [ ] Left gutter (16px) shows the drag handle `GripVertical` on row hover/focus when the user may drag it (D3). It's a real `<button aria-label="Move {title}">` (keyboard DnD). While hovered or focused the row shows a 2px blue inset accent on its left edge (a state cue, not a resting stripe).
- [ ] Title cell, in order: chevron · title link · **counters cluster** · hover actions. Counters cluster in mono 11px muted: subtask rollup `1/4`, attachments (`Paperclip n`), **comments (`MessageSquare n`, new)**. Each shows only when > 0. Counters keep fixed positions so titles don't jump.
- [ ] Hover actions at the right end of the title cell: Copy link, Add subtask (existing rules), **⋯ row menu** (new).
- [ ] Row ⋯ menu (`_task-row-menu.tsx`, popover via `_use-popover-position.ts`): **Open task**, **Open in new tab**, **Copy link** (reuse `_copy-link-menu-item.tsx`), **Add subtask** (if allowed), **Move to…** (if the user may move it; opens R4's dialog), **Delete task** (if `canEditDetails`; `ConfirmDialog` → existing `DELETE /api/v2/tasks/[id]`, same as one-row bulk delete). Keyboard: Enter/Space opens, arrows move, Esc closes, focus returns to the trigger.
- [ ] Closed tasks: title struck through in `#5F6A88` (not lighter), and the row stays fully interactive.
- [ ] Timer column unchanged in behaviour. A **running** timer stays visible without hover.
- [ ] Density: comfortable (`py-2.5`, about 44px) / compact (`py-1.5`, about 36px), applied to task rows, group headers and phase bands. The initial value comes from the server (`user_preferences.tasks_density`, D7), so there's no flash on load. Toggling updates the UI at once and saves with a non-blocking `PUT /api/v2/me/preferences`; on failure the UI keeps the new density for the session and does not toast.
- [ ] `TaskRow` keeps working in `_task-subtasks.tsx`: all new props optional; no handle and no menu-only behaviour unless passed.

### R3 Toolbar + progress strip
- [ ] Extract the Tasks toolbar from `_project-detail.tsx` into `_tasks/_tasks-toolbar.tsx`. Layout: search · Status · Priority · Assignee · Sort · **Show completed** switch · (spacer) · Collapse/Expand all · Clear filters · **density toggle** (icon button pair, `aria-pressed`, navy active) · List/Board/Calendar · New Task.
- [ ] **Show completed** (default on) is a view of the Status filter: off = `closed` removed from `statusFilter`; on = added back. Toggling the Status filter's Closed option updates the switch. `hasActiveFilters` ignores the switch alone (hiding completed is not a "filter" needing Clear).
- [ ] **Progress strip** (`_tasks/_tasks-progress-strip.tsx`) between toolbar and table, list view only: `Overall progress` label + **stat number** (Space Grotesk 700, allowed per guide) `NN%` + 6px blue track + `n completed` / `n remaining` (mono numbers) + `Target date` (latest `milestones.due_date`, else `projects.end_date`, else hidden). Counts = all non-checklist tasks incl. subtasks, **unfiltered** (it is project progress, not view progress).
- [ ] Sort options gain **Manual order** (`key: "position"`). `task-sort.ts` sorts by `position` (nulls last, then `created_at`).

### R4 Drag-and-drop with drop indicator (core)
Use the installed **`@dnd-kit/core` + `@dnd-kit/sortable`** (already used by `_board-view.tsx`; stable `useId()` for `DndContext id`). No new dependency.

- [ ] **Draggables:** task/subtask rows (D3 rules), group headers and phase bands (pm/admin/super_admin).
- [ ] **Drop zones per task row** (pointer y within the target row): top 30% → **before**, bottom 30% → **after** (same parent as target), middle 40% → **nest** (becomes last child of the target).
- [ ] **Group header** → move into that group as the **first** root task. **Empty group placeholder** → into the group. **Phase band** (task drag) → first root of the phase's first group; a **collapsed** phase or group under the pointer auto-expands after 600ms.
- [ ] Group drag: before/after another group header, in the same or another phase, or onto a phase band (= last group of that phase). Phase drag: before/after another phase band only.
- [ ] **Drop indicator** (`_tasks/_drop-indicator.tsx`): 2px `#007BFF` line with a 6px circle cap at its left end, absolutely positioned at the target row's top/bottom edge and **inset to the indent of the resulting depth** (so the user sees whether it lands as sibling or child). Nest state shows the target row with `bg-[#F0F7FF]` + 1px `#007BFF` inset ring and a small mono hint `→ subtask of "{title}"` at the right of the row. Group/phase drops use the same line at header width.
- [ ] **Invalid targets** (own subtree, would exceed `MAX_SUBTASK_DEPTH` for the deepest descendant, assignee-only crossing parents, different project): no line, row shows `cursor-not-allowed`, drop is a no-op.
- [ ] **Drag overlay** (`DragOverlay`): compact card (white, `line` border, `sh-md`, radius 10) with title + `+n subtasks` when it has children. The source row stays at 40% opacity in place; its subtree collapses visually while dragging.
- [ ] **Keyboard:** `KeyboardSensor` with Space/Enter to lift, ↑/↓ to move between drop slots, → / ← to nest under the previous row / un-nest one level, Space/Enter to drop, Esc to cancel. Screen reader announcements via dnd-kit `accessibility.announcements` in plain words ("Moved Map core user journeys into Experience design, position 2 of 3").
- [ ] **Non-drag alternative:** "Move to…" dialog (`_tasks/_move-task-dialog.tsx`): pick a group (grouped by phase, reuse `_searchable-select.tsx`) and optionally a parent task in that group; "Move" button (blue, confirm). Same API as drag.
- [ ] **Optimistic + revert:** apply the move to local `tasks`/`tasklists`/`milestones` state at once. On API failure revert and `toast.error("Couldn't move "{title}". {server message}")`.
- [ ] Autoscroll at the scroll container's edges (dnd-kit default). `prefers-reduced-motion` disables the overlay drop animation.
- [ ] Filters/search active: drag still allowed. The server places the item relative to the `before_id`/`after_id` the client sends, so hidden siblings keep their relative order.
- [ ] Board and Calendar views unchanged (Board keeps its own status DnD).

### R5 API + data
- [ ] **`POST /api/v2/tasks/[taskId]/move`** body `{ tasklist_id: string, parent_task_id: string | null, before_id: string | null, after_id: string | null }`. Route: auth → load task (+ project) → `asTestRole` → `getTaskEditPermission`. If `canEditDetails` → allowed. Else if `canChangeStatus` **and** `tasklist_id`/`parent_task_id` are unchanged → allowed (reorder only). Else 403. Then call RPC **`move_task`** with `adminClient`, a documented exception: it's a subtree write the caller may not hold RLS update rights on for every descendant, and the RPC is service-role-only. `touchProject()` only when the parent or tasklist changed (task 417 rule: reorder is cosmetic).
- [ ] **`PATCH /api/v2/tasklists/[tasklistId]`** body `{ milestone_id?: string | null, before_id?: string | null, after_id?: string | null }`. pm/admin/super_admin (same check as the tasklists POST route). Sets `position` (midpoint), and on a `milestone_id` change also updates `tasks.milestone_id` for every task in that tasklist (keeps the subtask route's "inherit phase from tasklist" invariant).
- [ ] **Phase reorder** reuses the existing `PATCH /api/v2/milestones/[id]` `{ position }` (numeric midpoint computed client-side; `milestones.position` is `numeric`).
- [ ] **Migration 184** `supabase/migrations/184_task_move_and_comment_counts.sql` (**WRITTEN, NOT APPLIED**):
  - `move_task(p_task_id uuid, p_tasklist_id uuid, p_parent_task_id uuid, p_before_id uuid, p_after_id uuid) returns setof tasks`, `language plpgsql security definer set search_path = public`, `revoke all … from public, authenticated; grant execute … to service_role`. In one transaction: same-project check for tasklist/parent; **cycle guard** (parent ∉ subtree of task, recursive CTE); **depth cap** (new depth + subtree height ≤ `MAX_SUBTASK_DEPTH` = 5); a parent must be in the target tasklist; set the task's `tasklist_id`, `milestone_id` (= tasklist's), `parent_task_id`, `depth`, `position` (midpoint of before/after; if the gap is < 1e-6 or neighbours have null positions, renumber that sibling set 1..n first); propagate `tasklist_id`, `milestone_id` and `depth` deltas to every descendant; `updated_at = now()`. Returns every changed row (the client merges them). Raises `check_violation` with readable messages (`cannot move a task into its own subtask`, `subtask depth limit (5) exceeded`).
  - `project_task_comment_counts(p_project_id uuid) returns table(task_id uuid, comment_count bigint)`: `language sql stable`, **SECURITY INVOKER** (RLS decides), `count(*) from task_comments c join tasks t on t.id = c.task_id where t.project_id = p_project_id group by c.task_id`. Reuses `task_comments_task_id_idx` from migration 178.
  - `alter table public.user_preferences add column if not exists tasks_density text not null default 'comfortable' check (tasks_density in ('comfortable','compact'))` (D7; existing own-row RLS covers it).
  - Rollback block in the header comment (drop both functions; `alter table user_preferences drop column if exists tasks_density`).
- [ ] **Graceful degrade before 184 is applied** (CLAUDE.md rule): the comment-count RPC error → `console.warn`, empty map, no counters (same as attachment counts). `move_task` missing (`42883` / PGRST202) → the route returns **503** `{ error: "Moving between lists needs migration 184" }`. The client then disables cross-parent/nest drops for the session (indicator shows only before/after among siblings) and still supports sibling reorder via the existing `PATCH /api/v2/tasks/[id] { position }` (midpoint computed client-side).
- [ ] Loader (`_get-project-detail-data.ts`): add `project_task_comment_counts` to the `Promise.all` (`commentCountById`); add the caller's `user_preferences.tasks_density` (own row, session client, `maybeSingle`, missing table/column → `comfortable`; follow the read in `[classification]/(listing)/page.tsx`); order tasklists by `position` (nulls last) then `created_at`.
- [ ] `PUT /api/v2/me/preferences`: accept `{ projects_view?, tasks_density? }` (validate each if present; 400 when neither or an invalid value is sent); upsert only the keys sent. The existing `projects_view` behaviour is unchanged (task 482 callers send only that key).

### R6 File-length + structure (per `nextjs-file-length-best-practices.md`)
Components ≤ 250 lines, hooks ≤ 100, pure utils ≤ 150, route handlers ≤ 150. No file in this task may end above 300. `_project-detail.tsx` (840 today) must **shrink**: the Tasks toolbar moves out.

## Out of Scope / Must-Not-Change
- Board and Calendar views, Tickets tab, Milestones tab (except that a phase reorder made here shows up there, which is the same data).
- No Zoho push of moves (Hub-only; Zoho sync is non-blocking by design and moves aren't mapped).
- No new task fields; no change to the task detail page.
- `projects-old/*` untouched.
- No change to filter semantics (root match keeps the subtree), selection permission rules (285) or status permission rules (209).
- Don't migrate the sidebar/header to v2.0 here.
- Don't add the mock's "Add milestone" button (Milestones tab owns phase creation) or a phase ⋯ menu.
- Checklist rows (`kind='checklist'`) stay excluded everywhere, including the progress strip, which counts from the already-filtered `tasks` (loader uses `excludingChecklist()`).

---

## Visual spec (guide-weighted, contrast strengthened)

Tokens from `DESIGN.md`. Tailwind classes only (no `style={{}}` except the existing CSS-var/status color pattern). Use static class lookups, no runtime-built class names, and `cn()`.

| Element | Spec | Why it differs from the guide/mock |
|---|---|---|
| Table header | Inter **10.5px**/700 caps +0.08em `#5F6A88` on `#FAFBFE` | Guide 9.5px is too small for a dense daily table |
| Phase band | 48px (comfortable) / 40px (compact), bg `#F4F6FB`, 3px left stripe (D1), flag tile 24px radius 7 tint+fg, chip `PHASE n` JetBrains Mono 10/600 on white with `line` border, name Inter 14/700 `#0B1533` | Mock name weight kept; no Space Grotesk in rows (guide) |
| Group header | bg `#FAFBFE`, 3×20px stripe (D1 rotation), name 13/700 `#0B1533`, count chip mono 10/600 `#3A4565` on `#EDF0F7` | Count text darker than today's `#5F6A88` on grey |
| Task row | 13px/500 `#0B1533` title (was `#3A4565`), indent **24px per depth level** (`DEPTH_INDENT` steps `pl-0 pl-6 pl-12 pl-18 pl-24 pl-30`; static lookup) | Stronger title ink; deeper indent reads as nesting like the mock |
| Status pill | Keep `rounded-full` (shipped convention), add 5px leading dot, text 11/600; blue family text `#0063D6` (D6) | AA fix |
| Priority | Dot + label; `normal` text `#0063D6` (D6) | `#007BFF` on white is 3.97:1 |
| Due / hours / counters | JetBrains Mono 11.5/500, `tabular-nums` | Guide: machine values in mono |
| Hover-action icons | `#5F6A88` → hover `#007BFF` on `#EDF0F7` | Today `#94A0BE` is 2.6:1 |
| Empty group text | `#5F6A88` | Today `#A8B0C8` fails contrast |
| Row hover / selected | `#F0F7FF` / `#E5F1FF` | Selected was the same as hover; now distinct |
| Drop line | 2px `#007BFF` + 6px cap, inset to the target depth | New |
| Focus | 2px `#007BFF` ring, 2px offset on every control incl. the handle and ⋯ | Guide |
| Motion | 160ms `cubic-bezier(.22,1,.36,1)` colors only; overlay drop 150ms; all off under `prefers-reduced-motion` | Guide |

Icons: lucide only (`GripVertical`, `Flag`, `MessageSquare`, `Paperclip` via `AttachmentIndicator`, `MoreHorizontal`, `Rows3`/`Rows4` for density). No emoji. `aria-label` on every icon-only button. Color never the only indicator (status has label, stripe has name, invalid drop has a cursor + no line).

Responsive: the table keeps `overflow-x-auto` below 1024px. The handle and ⋯ are always visible (no hover) on `pointer: coarse` devices. Touch DnD uses `TouchSensor` with a 200ms press delay so scrolling still works.

---

## Proposed File Changes

New folder `src/app/(hub)/projects/_shared/_tasks/` (like `_notes/`, `_merge/`).

| File | Action | Purpose | Target lines |
|---|---|---|---|
| `_shared/_tasks/_task-tree.ts` | Create | Pure: phases → groups → root tasks, `childrenByParent`, descendant rollups, phase/project progress. Moved out of `_list-view.tsx` (`groups`, `childrenByParent`, `descendantRollup`) | ≤150 |
| `_shared/_tasks/_move-rules.ts` | Create | Pure: resolve pointer zone → `{ kind, tasklistId, parentId, beforeId, afterId, depth }`; `canDrop()` (subtree, depth cap, D3 perms); `midpoint()` | ≤150 |
| `_shared/_tasks/_use-task-dnd.ts` | Create | dnd-kit sensors (pointer, touch, keyboard), active/over state, announcements, calls `onMove*`, triggers sort switch (D2) | ≤100 |
| `_shared/_tasks/_drop-indicator.tsx` | Create | Line + cap + nest highlight hint | ≤60 |
| `_shared/_tasks/_phase-section.tsx` | Create | Phase band + its groups | ≤180 |
| `_shared/_tasks/_tasklist-group.tsx` | Create | Group header (moved from `_list-view.tsx` inline JSX) + rows + empty placeholder | ≤180 |
| `_shared/_tasks/_task-row-menu.tsx` | Create | Row ⋯ menu | ≤150 |
| `_shared/_tasks/_move-task-dialog.tsx` | Create | Keyboard/menu alternative to drag | ≤160 |
| `_shared/_tasks/_tasks-toolbar.tsx` | Create | Extracted from `_project-detail.tsx` + Show completed + density | ≤200 |
| `_shared/_tasks/_tasks-progress-strip.tsx` | Create | Progress strip | ≤80 |
| `_shared/_tasks/_tree-colors.ts` | Create | D1/D5 static color class maps | ≤50 |
| `_shared/_tasks/_use-task-moves.ts` | Create | Optimistic move/reorder + revert + 503 degrade flag, API calls | ≤120 |
| `_shared/_list-view.tsx` | Modify | Becomes the orchestrator: selection, expand state, DnD context, renders `PhaseSection`s; keeps `generalTasklistId` export | 395 → ≤250 |
| `_shared/_task-row.tsx` | Modify | Handle, counters (comments), hover cluster + menu, density, closed style, depth indent; new props optional | 206 → ≤250 |
| `_shared/_task-table-parts.tsx` | Modify | Header type size; grid adds 16px handle gutter (`TASK_GRID`), `BulkDeleteBar` unchanged | ≈ same |
| `_shared/_task-subtasks.tsx` | Modify (only if needed) | Compile with new optional props; no DnD there | — |
| `_shared/_project-detail.tsx` | Modify | Use `TasksToolbar`, progress strip, manual sort, show-completed, density, `commentCountById`, move handlers | 840 → ≤700 (must shrink) |
| `_shared/_get-project-detail-data.ts` | Modify | Comment counts RPC; tasklist order by position | +10 |
| `_shared/_create-task-modal.tsx` | Modify | `TaskDefaults.tasklist_id` preselect (for "+ Add task") | +3 |
| `src/lib/tasks/task-sort.ts` | Modify | `SortKey` adds `"position"` | +8 |
| `src/app/(hub)/projects-old/_pm-shared.tsx` | Modify | D6 contrast values only (`STATUS_STYLE` blue text, `PRIORITY_STYLE.normal`) | values only |
| `src/app/api/v2/tasks/[taskId]/move/route.ts` | Create | Move endpoint (R5) | ≤120 |
| `src/app/api/v2/tasklists/[tasklistId]/route.ts` | Create | Tasklist reorder / change phase | ≤100 |
| `src/app/api/v2/me/preferences/route.ts` | Modify | Also accept `tasks_density` (D7) | 31 → ≤60 |
| `supabase/migrations/184_task_move_and_comment_counts.sql` | Create | `move_task`, `project_task_comment_counts`, `user_preferences.tasks_density` | — |
| `[classification]/[projectId]/(tabs)/tasks/loading.tsx` | Modify | Skeleton matches toolbar + strip + phase band rows (task 484 file) | ≈ same |
| `_docs/task/487-move-rules.check.ts` | Create | Pure-logic checks for `_move-rules.ts` + `_task-tree.ts` (`npx tsx`) | — |
| `_docs/context/projects.md` | Modify | Short "Tasks listing tree + move API" section (rules, migration 184 status) | — |

---

## Code Context

### `_list-view.tsx` (current shape to preserve)
- Groups built only from tasklists (`groups` memo, lines ~150-170); **no phase level today**. `"__none"` group only when no General list (486).
- `selectableIds` (task 285) drives row + group checkbox enablement; keep it and extend to phases.
- `expandedRows` initial state pre-expands parents; `expandRequest` re-expands after "Add subtask".
- Sticky header uses an IntersectionObserver sentinel. Keep it; don't add `overflow-hidden` on the card (comment in file explains why).
- `renderRows()` passes `attachmentCount={attachmentCountById[t.id]}` and `onAddSubtask` only when `depth < MAX_SUBTASK_DEPTH`.

### `_task-row.tsx`
- `getTaskEditPermission(role, userId, task)` → `canEditDetails`, `canChangeStatus`, `canAddSubtask`, `allowedStatusValues`. Use the **same** object for D3 drag rights.
- `DEPTH_INDENT` is a static class array; keep it static (CLAUDE.md: no runtime-built class names).

### `PATCH /api/v2/tasks/[taskId]` (unchanged)
- Doesn't accept `tasklist_id`/`parent_task_id` today. **Keep it that way**; moves go through `/move` so subtree consistency lives in one place.
- Assignee-only callers may send `status`/`position` only (`ASSIGNEE_ALLOWED_FIELDS`). Used by the 503 fallback reorder.

### `POST /api/v2/tasks/[taskId]/subtasks`
- Invariant to keep: a subtask inherits `project_id`, `milestone_id`, `tasklist_id` from its parent, and `depth = parent.depth + 1 ≤ 5`. `move_task` must keep the whole subtree in line with this.

### Positions
- `tasks.position`, `tasklists.position`, `milestones.position` are all `numeric` (migrations 025/033). Midpoints are safe; renumber only on a tiny gap or nulls.

### Existing DnD reference
- `_board-view.tsx`: `DndContext` with `id={useId()}` (hydration-safe), `useDroppable`, `@dnd-kit/sortable`. Mirror its sensor setup.

---

## Implementation Steps

1. **Migration 184** (both functions + `tasks_density` column + rollback header). Check it on PGlite like task 486 did: cycle, depth cap, cross-project, renumber, subtree propagation, comment counts, density check constraint.
2. `task-sort.ts` manual key; `_pm-shared.tsx` D6 contrast values.
3. Pure modules `_task-tree.ts`, `_move-rules.ts`, `_tree-colors.ts` + `_docs/task/487-move-rules.check.ts`. Run it.
4. API: `/tasks/[id]/move`, `/tasklists/[id]`, loader changes (comment counts, tasklist order).
5. Extract `TasksToolbar` from `_project-detail.tsx` **with no behaviour change first**; verify AC-R1…R7. Then add Show completed, Manual order, density, progress strip.
6. Restructure `ListView` → `PhaseSection` / `TasklistGroup` / `TaskRow` with **no DnD yet**; verify the whole inventory (AC-R*).
7. Row redesign: handle slot, counters (comments), hover cluster, ⋯ menu, density, visual spec.
8. DnD: `_use-task-dnd.ts`, `_use-task-moves.ts`, `_drop-indicator.tsx`, overlay, keyboard, announcements, D2 sort switch, D3 rules, 503 degrade.
9. Move-to dialog.
10. Loading skeleton; `_docs/context/projects.md`.
11. `npx tsc --noEmit`, eslint on changed files, check script, impeccable detector, browser ACs.

---

## Acceptance Criteria

Browser checks run on a **test project** (task 476 Test User, so no real data moves) on `pnpm dev`, in both the v2 route and `/projects/legacy/<id>/tasks`. "pre" = pre-merge; "post" = after migration 184 is applied.

### No-regression (inventory)
- [ ] **AC-R1…R30 (pre, browser):** walk the 30-item inventory above. Each control is present, in the place given in R2/R3, and behaves as before (e.g. ⌘-click title opens a new tab; restricted checkbox shows its tooltip; Timer start/stop updates the hours column; bulk delete confirms then removes rows; `?tasklist=<id>` scrolls to the group and expands its phase).
- [ ] **AC-R31 (pre, browser):** Task Details › Subtasks tab renders and works exactly as before (sort, checkboxes, bulk delete, timer).
- [ ] **AC-R32 (pre, browser):** Board and Calendar views unchanged (Board DnD still changes status).
- [ ] **AC-R33 (pre, command):** `npx tsc --noEmit` reports no new errors vs. baseline; `npx eslint <changed files>` clean.

### Structure + UI
- [ ] **AC-1 (pre, browser):** a project with milestones shows phase bands in `position` order with `PHASE n`, `done of total`, mini bar, due date; groups sit under their phase; phase-less groups appear under "No phase". A project with no milestones shows groups only.
- [ ] **AC-2 (pre, browser):** ticking one subtask sets its group and phase checkboxes indeterminate; a phase checkbox selects only tasks the user may delete (285).
- [ ] **AC-3 (pre, browser):** group hover "+ Add task" opens New Task with that tasklist preselected; the created task appears in that group.
- [ ] **AC-4 (pre, browser):** row ⋯ menu shows the R2 items according to permissions; keyboard-only open/navigate/close works; Delete asks for confirmation.
- [ ] **AC-5 (pre, browser):** Show completed off hides closed rows and unticks Closed in the Status filter; ticking Closed back turns the switch on; Clear filters does not appear for the switch alone.
- [ ] **AC-6 (post, browser + SQL):** density toggle switches row heights (≈44 ↔ 36px); after a reload **and in a second browser signed in as the same user** it is still compact; `select tasks_density from user_preferences where user_id = '<me>'` = `compact`. The Projects listing Grid/List preference (482) is unchanged.
- [ ] **AC-6b (pre, before 184 / before 182):** toggle works for the session, reload returns to comfortable, `PUT` returns 204, no console error or toast.
- [ ] **AC-6c (pre, API):** `PUT /api/v2/me/preferences` with `{ "tasks_density": "huge" }` → 400; `{}` → 400; `{ "projects_view": "grid" }` → 204 and doesn't reset `tasks_density`.
- [ ] **AC-7 (pre, browser):** progress strip numbers match `select count(*) … where status='closed'` / total for the project (non-checklist), and do not change when filters change.
- [ ] **AC-8 (post, browser + SQL):** comment counter equals `select count(*) from task_comments where task_id = '<id>'`. Before 184: no counters, no console error beyond one `console.warn`.
- [ ] **AC-9 (pre, manual: contrast can't be fully automated):** check status pill and priority text, table header and empty-group text with a contrast checker at ≥4.5:1; screenshots before/after in the test report.
- [ ] **AC-10 (pre, command):** `impeccable detect --json --changed` has no new high-severity findings (stripe rule excepted, D1).

### Drag-and-drop
- [ ] **AC-11 (pre, browser):** reorder a task among siblings (sort = Status): the list switches to Manual order with one toast, the blue line shows at the target edge, the drop persists after reload (`tasks.position`).
- [ ] **AC-12 (post, browser + SQL):** drag a task with 2 levels of subtasks into a group **in another phase**: after reload it sits there with its subtree; SQL: `tasklist_id`/`milestone_id` equal the new group's for the task **and every descendant**; depths unchanged.
- [ ] **AC-13 (post, browser + SQL):** drop on the middle of another row → becomes its last child; `parent_task_id` set, `depth` = target depth + 1 for it and +delta for descendants. Dropping a subtask before a root row un-nests it (`parent_task_id` null, `depth` 0) and it then shows as a root in the listing.
- [ ] **AC-14 (pre, browser):** the drop line's left inset matches the resulting depth (sibling vs. child is visibly different); nest shows the highlighted row + "→ subtask of" hint.
- [ ] **AC-15 (post, browser + API):** invalid drops show no line and do nothing: into own subtree; beyond depth 5. Direct API: `POST /move` with own descendant as parent → 400 with the readable message; no rows change.
- [ ] **AC-16 (post, browser + API):** as an assignee-only developer: handle shows, reorder among siblings works, dropping into another group/parent shows no line; direct `POST /move` with a new tasklist → 403.
- [ ] **AC-17 (pre, browser):** as pm: drag a group to another phase (persists; its tasks' `milestone_id` updated); reorder phases (persists; `PHASE n` renumbers, D8). As developer: group/phase handles absent.
- [ ] **AC-18 (pre, browser, keyboard only):** Tab to a handle, Space, ↑/↓, →, Space moves a task under a new parent; Esc cancels; screen reader (VoiceOver) announces the result.
- [ ] **AC-19 (pre, browser):** "Move to…" dialog moves a task to another group (post-184 for cross-group) with no pointer DnD.
- [ ] **AC-20 (pre, browser):** with the API forced to fail (DevTools offline), the item snaps back and an error toast names the task.
- [ ] **AC-21 (pre, before 184):** `/move` returns 503; the UI then allows only sibling reorder (via `PATCH { position }`), no error loop.
- [ ] **AC-22 (pre, browser):** a second browser on the same project sees the move live (realtime UPDATE merge), no duplicate rows.
- [ ] **AC-23 (pre, command):** `npx tsx _docs/task/487-move-rules.check.ts` passes (zones, cycle, depth cap incl. subtree height, assignee rules, midpoint, renumber trigger, phase/group/no-phase tree building, General fallback).
- [ ] **AC-24 (pre, command):** `wc -l` on every created/modified component ≤ 250, hooks ≤ 100, pure utils/routes ≤ 150, `_project-detail.tsx` < 840.

## Verification

```bash
npx tsc --noEmit
npx eslint "src/app/(hub)/projects/_shared/_tasks" "src/app/(hub)/projects/_shared/_list-view.tsx" "src/app/(hub)/projects/_shared/_task-row.tsx" "src/app/(hub)/projects/_shared/_project-detail.tsx" "src/app/api/v2/tasks/[taskId]/move" "src/app/api/v2/tasklists"
npx tsx _docs/task/487-move-rules.check.ts
wc -l src/app/\(hub\)/projects/_shared/_tasks/* src/app/\(hub\)/projects/_shared/{_list-view,_task-row,_project-detail}.tsx
"<impeccable skill dir>/scripts/impeccable" detect --json --changed
# Migration 184 on PGlite (as task 486 did) before handing to the operator
# Browser ACs on a Test User + test project (pnpm dev)
```

## Coordination

| Task | Status | Shared files / concern | Rule |
|---|---|---|---|
| 470 Subtasks tab listing format | Testing | `_task-row.tsx`, `_task-table-parts.tsx`, `_task-subtasks.tsx` | **Land after 470** |
| 486 General default tasklist | Testing | `_list-view.tsx` (`generalTasklistId`), General trigger/guards (moving General into a phase must still pass D3 of 486) | **Land after 486**; migration 184 after 183 |
| 484 Project page loading skeletons | Testing | `(tabs)/tasks/loading.tsx` | **Land after 484** |
| 467 / 469 Nested subtasks, assignee subtasks | Testing | subtask invariants, `MAX_SUBTASK_DEPTH`, `canAddSubtask` | Re-check rules if either changes before merge |
| 476 Test users + test data | Testing | `asTestRole` in the new move route | Use the same pattern |
| 430 Work-breakdown rename | Planned | renames `tasks.milestone_id/tasklist_id`; **`move_task`, the tasklist PATCH route and the comment-count loader must be included in 430's rename** | Add a note to 430 when it's picked up |
| 429 Programme cutover | In Progress | reads phases on Timeline/listing/dashboards; no shared file found (`grep` of 429 doc: `_v2-listing`, `_use-active-phase`) | Not blocking; tell the 429 agent that phase order is now draggable here |
| 423 Unify phases/deliverables | Planned (investigation) | consumer inventory should list the new RPC + routes | Informational |
| 482 user_preferences | Testing | D7 extends its table (migration 184 adds `tasks_density`) and its `PUT /api/v2/me/preferences` route | **Land after 482**; apply 182 before 184 |

## Operator Steps

1. Apply **migration 184** after 181–183 (Supabase SQL editor). **182 (`user_preferences`) must already be applied**: 184 alters that table. Rollback: the header block (drop both functions, drop column `user_preferences.tasks_density`).
2. Deploy: the single Next.js app. `worker/` doesn't import any changed module (checked: `grep -rln "_pm-shared|task-sort|projects/_shared" worker` → none).
3. Before 184 is applied: listing works with sibling reorder only and no comment counters (by design).

## Compatibility Touchpoints

- `STATUS_STYLE`/`PRIORITY_STYLE` color change (D6) shows on all 17 importers (board, calendar, tickets, detail pages): text color only, no layout.
- MCP server (`src/app/api/mcp/route.ts`): **no new tool** in this task, so `_docs/mcp-tools.md` is unchanged. (A future "move task" MCP tool must call `move_task` and update that doc.)
- `_docs/context/projects.md` gets the tree/move rules; CLAUDE.md feature table unchanged.

---

## Baseline (2026-11-18, before any change)

- `npx tsc --noEmit` → 0 errors.
- File sizes: `_list-view.tsx` 395, `_task-row.tsx` 206, `_task-table-parts.tsx` 103, `_project-detail.tsx` 840.
- Behaviour: no phase level, no drag-and-drop in the list view, no row menu, no comment counts, no progress strip / density / Show completed, so every new-behaviour AC fails before the change by construction. No-regression ACs (R1–R33) were walked against the new build (below).

## Implementation Notes

### What Changed
- **Tree listing:** Phase band › list group › task › subtask, built by the pure `_tasks/_task-tree.ts`. Figma-style stripes (D1/D5), `PHASE n` chip, done-of-total mini bar, due date (red when late), "No phase" section, phase + group collapse, checkbox cascade (indeterminate), group hover "+ Add task" (preselects list + phase).
- **Rows:** drag handle + hover accent in the left gutter, comment counter, rollup/attachment counters as mono, ⋯ menu (Open, Open in new tab, Copy link, Add subtask, Move to…, Delete with confirm), status pill dot, 24px indent per level, struck-through closed titles, compact density. Copy link, Add subtask, Timer, hours, inline status/assignee all kept.
- **Toolbar** extracted (`_tasks/_tasks-toolbar.tsx` + `_use-task-filters.ts`), with Show completed switch, density toggle (saved per account, D7), "Manual order" sort. **Progress strip** added.
- **Drag-and-drop:** dnd-kit pointer + touch sensors with our own hit test and zones (before / after / nest / into), blue drop line inset to the resulting depth, nest highlight "→ subtask", drag card with "+n subtasks", blocked state; keyboard moves (Space, arrows, → nest, ← un-nest, Esc/Tab cancel) with live-region announcements; "Move to…" dialog. Drag switches the sort to Manual order (D2) with a one-time toast. Group + phase reorder for pm/admin/super_admin.
- **API / DB:** `POST /api/v2/tasks/[id]/move` → `move_task()` (migration 184), `PATCH /api/v2/tasklists/[id]`, preferences route accepts `tasks_density`, loader adds comment counts + density + tasklist order. 503 fallback to sibling reorder before 184.
- **D6:** shared `STATUS_STYLE` blue text and `PRIORITY_STYLE.normal` text → `#0063D6`.

### Files Changed
- `supabase/migrations/184_task_move_and_comment_counts.sql` (new): `move_task`, `project_task_comment_counts`, `user_preferences.tasks_density`.
- `src/app/api/v2/tasks/[taskId]/move/route.ts` (new), `src/app/api/v2/tasklists/[tasklistId]/route.ts` (new), `src/app/api/v2/me/preferences/route.ts` (accepts `tasks_density`).
- `src/app/(hub)/projects/_shared/_tasks/*` (new, 19 files): `_task-tree.ts`, `_move-rules.ts`, `_tree-colors.ts`, `_task-options.ts`, `_use-task-filters.ts`, `_use-task-moves.ts`, `_use-task-dnd.ts`, `_use-keyboard-move.ts`, `_use-list-dnd.ts`, `_use-list-selection.ts`, `_list-chrome.tsx`, `_drag-parts.tsx`, `_phase-section.tsx`, `_tasklist-group.tsx`, `_task-row-menu.tsx`, `_move-task-dialog.tsx`, `_tasks-toolbar.tsx`, `_tasks-progress-strip.tsx`.
- `_shared/_list-view.tsx` (395 → 220, orchestrator), `_shared/_task-row.tsx` (206 → 249), `_shared/_task-table-parts.tsx` (header 10.5px/700), `_shared/_project-detail.tsx` (840 → 652), `_shared/_get-project-detail-data.ts`, `_shared/_create-task-modal.tsx` (`defaults.tasklist_id`).
- `src/lib/tasks/task-sort.ts` (`position` key), `src/app/(hub)/projects-old/_pm-shared.tsx` (D6 colors only).
- `src/app/(hub)/projects/[classification]/[projectId]/(tabs)/tasks/loading.tsx` (skeleton matches the new layout; legacy re-exports it).
- `_docs/task/487-move-rules.check.ts`, `_docs/task/487-move-task.sql-check.mjs` (new), `_docs/context/projects.md` (tree + move rules).

### Deviations From Plan
- `_drop-indicator.tsx` became `_drag-parts.tsx` (drop line + drag handle + drag card + tri-state checkbox). Extra modules were split out to meet the file-length targets: `_task-options.ts`, `_use-task-filters.ts`, `_use-list-selection.ts`, `_use-list-dnd.ts`, `_use-keyboard-move.ts`, `_list-chrome.tsx`.
- `TASK_GRID` was **not** changed. The handle sits absolutely in the existing 16px left padding, so the Subtasks tab grid is untouched.
- `PATCH /api/v2/tasklists/[id]` takes `{ position, milestone_id }` (the client renumbers the phase's lists 1..n and PATCHes the changed ones), not `before_id/after_id`. Reason: list positions are often null; client renumbering is simpler and the list count per phase is small. Phases use the same client renumbering via the existing milestones PATCH.
- Keyboard moves are our own state machine, not dnd-kit's `KeyboardSensor`: the custom zones (nest / un-nest) don't map onto its coordinate model.
- "Move to…" uses native `<select>` with `<optgroup>` per phase instead of `_searchable-select.tsx` (grouping + accessibility for free).
- **D8 refinement (found in the browser):** the `milestones` view hides programme Phase 1, so order numbering called "Migrate & Rebrand" PHASE 1. Programme phases now keep their programme number (Onboard 1 … Optimize 5), and custom phases in a programme project shift by one (e.g. "Testing" after Optimize = PHASE 6). Covered in the check script.
- Progress bars don't animate width (guide: never animate layout).
- `_use-list-dnd.ts` is 113 lines (hook target ≤100); every other file is within its target.

### Verification Run
- `npx tsc --noEmit`: PASS (baseline 0 → now 0 errors).
- `npx eslint` on all changed files: PASS (0 errors, 0 warnings).
- `npx tsx _docs/task/487-move-rules.check.ts`: PASS (zones, sibling/cross/nest/un-nest, own-subtree, depth cap incl. subtree height, group/phase reorder, positions, tree building, General fallback, phase numbers).
- `node 487-move-task.sql-check.mjs` (PGlite 0.2.17, scratch dir): PASS, 11 groups (subtree move, nest, un-nest, cycle, depth cap, cross-project, other-list parent, null-position renumber, untouched rows, service_role-only grant, comment counts, density check).
- `impeccable detect` on changed UI files: PASS, 0 high-severity; 17 advisory "font size off ramp" (12px ×15 used Hub-wide, 14px phase name per spec, 9px pre-existing sort arrow).
- `wc -l` (AC-24): PASS except `_use-list-dnd.ts` 113 (noted above). `_project-detail.tsx` 840 → 652.
- **Browser (pnpm dev, legacy route Raith Design `7149F820-PROJ-01` read-only; v2 route test project "ABC Test Company Website" `46305B0C-PROJ-01`):**
  - AC-1 PASS: phase bands in order, groups under phases, "No phase" section, empty-phase + empty-list texts.
  - AC-2 PASS: one row → group + phase indeterminate; group select-all picked its 14 roots, phase indeterminate.
  - AC-4 PASS: ⋯ menu items, ↓ moves focus, Esc closes; flips upward near the bottom.
  - AC-5 PASS: Show completed off hid Closed rows, Status filter "7 selected", no Clear filters.
  - AC-6 / 6b PASS for the pre-184 path: compact applied, `PUT /api/v2/me/preferences` 204, reload → comfortable (column missing), no console error.
  - AC-8 pre-184 PASS: no counters; dev log shows only the expected `comment counts unavailable` warning.
  - AC-11 PASS (test project): pointer drag "Testing 12345" above "Test 2" → `POST /move` 503 → `PATCH` position 200 → order persisted after reload in Manual order (AC-21 PASS). Then restored the original order the same way.
  - AC-14 PASS: drop line shown for sibling slot (1 line), "→ subtask" nest highlight via keyboard.
  - AC-16-style blocking PASS (pre-184): after the 503, cross-list and nest drops showed no line + blocked drag card, no request.
  - AC-17 partial PASS: group handle shown for super admin, group drag shows its line (cancelled; not dropped).
  - AC-18 partial PASS: keyboard lift → ↓↓ → → (nest) → Esc; sort switched to Manual order + one toast; no request sent.
  - AC-R31 PASS: Task Details › Subtasks tab renders with the shared row (new indent, no handle/menu).
  - Console: 0 errors on both routes.
- **Not run:** AC-3 (+ Add task create), AC-7 SQL comparison, AC-9 contrast measurements, AC-10 via `--changed` (files passed instead: CLAUDE.md forbids git), AC-12/13/15/19 and AC-16 API 403 (need migration 184 / an assignee-only account), AC-17 group/phase drops that persist, AC-20 offline revert, AC-22 realtime second browser, VoiceOver for AC-18, touch devices, Board/Calendar regression walk (AC-R32; code untouched apart from shared color values).

### Attempts That Failed
- Browser automation `left_click_drag` (one-step mousedown → move → up) left the dnd-kit drag active and stuck (row faded, Esc ignored), with no request. Stepped `PointerEvent`s (12 moves, 30ms apart) via page JS work end-to-end, so this is a test-tool artifact, not a product bug. Use stepped pointer events for future automated drag checks.
- The first "line shown" probe matched the always-present hover accent span (same `bg-[#007BFF]` class); re-probed with the drop line's own `h-0.5` class.

### Known Issues / Follow-ups
- **Drag while sorted by another key:** the switch to Manual order happens at drag start, so rows can reshuffle under the pointer at the start of the first drag (consequence of D2). Possible follow-up: switch on drop instead, or animate the reorder.
- **Toolbar wraps** to two lines when filter labels grow (e.g. "Status: 7 selected") at ~1560px viewports, and always on narrower laptops. Layout is correct but it shifts.
- "Move to…" is offered before migration 184 is applied; the first cross-list move then fails with a clear toast and disables cross-list moves for the session.

### Operator Steps
1. Apply **migration 184** after 181–183; **182 must already be applied** (184 alters `user_preferences`). Rollback: the header block (drop both functions, drop `user_preferences.tasks_density`). Pre-checked on PGlite (`_docs/task/487-move-task.sql-check.mjs`).
2. Deploy: the single Next.js app. Changed shared modules (`_pm-shared.tsx` colors, `task-sort.ts`, `_task-row.tsx`) are imported only by the Next.js app; `worker/` imports none of them (`grep -rln "_pm-shared|task-sort|projects/_shared" worker` → none).
3. Optional: `supabase gen types` after 184 to drop the `as any` casts on the two new RPCs / `tasks_density`.

## Quality Gate Notes

### Result
PASS

Changed files were taken from Implementation Notes (CLAUDE.md forbids git commands, so no `git diff --name-only`). After the fixes below: `npx tsc --noEmit` exit 0, `npx eslint` on the changed files exit 0, `npx tsx _docs/task/487-move-rules.check.ts` PASS.

### Standards Review
Fixed in this gate (no behaviour change):
- Dead code: `_list-view.tsx` still re-exported `generalTasklistId`, which nothing imports any more. Removed; `_docs/context/projects.md` updated.
- Duplication: `_use-list-dnd.ts` had its own `countDescendants()` repeating `descendantRollup(...).total`. Now uses the shared helper (113 → 104 lines).
- Placement: the pure `phaseKey()` helper lived in a hook file (`_use-task-filters.ts`) and two other modules imported it from there. Moved to `_task-tree.ts` with the rest of the tree model.
- Type escape: `drop={d.zoneOf(...) as "before" | "after" | "nest" | null}` in `_list-view.tsx` replaced by a real narrowing (`zone === "into" ? null : zone`).

Remaining, non-blocking:
- Four `as any` casts for the not-yet-typed RPCs / `user_preferences` (move route, loader ×2, preferences route). This follows task 482's established pattern with `eslint-disable` + reason; remove after `supabase gen types` (Operator Step 3).
- `useTaskMoves.moveTask` reverts to a closure snapshot, the same pattern as the existing `updateTask`. Two overlapping moves where the first fails could revert the second locally (realtime/reload corrects it). Acceptable for now.
- Move route treats a task with a null `tasklist_id` (orphan shown under General) as a cross-list move, so a status-only assignee reordering it gets 403. Migration 183 (task 486) backfills those nulls, so this is a transient edge.
- `PATCH /api/v2/tasklists/[id]` updates the list, then its tasks' `milestone_id`, in two statements (not atomic). Failure is logged; the listing reads phase from the list, so the UI stays correct.
- Role list `admin/super_admin/pm` for arranging lists/phases exists client-side (`ARRANGERS`) and server-side; same as other Hub role gates.
- Impeccable detector: 0 high-severity; 17 advisory off-ramp font sizes (12px used Hub-wide; 14px phase name per spec; 9px pre-existing).
- No secrets and no debug logging. `console.warn`/`console.error` only on the degrade/failure paths, matching the loader's existing style.
- Acceptance criteria: each has a check that can fail. Post-184 and multi-account criteria are still unrun (listed under "Not run" above), so the test stage owns them.

### Deviations
- **Minor:** module split differs from the plan (`_drag-parts.tsx` instead of `_drop-indicator.tsx`, plus extra hooks/helpers to hit the file-length targets). Same responsibilities, smaller files.
- **Minor:** `TASK_GRID` unchanged (handle sits in the existing left padding), which keeps the Subtasks tab grid untouched.
- **Minor:** native `<select>`/`<optgroup>` in "Move to…" instead of `_searchable-select.tsx`; custom keyboard mover instead of dnd-kit's `KeyboardSensor`.
- **Minor:** progress bars don't animate width (DESIGN.md: never animate layout).
- **Minor:** `_use-list-dnd.ts` 104 lines vs the ≤100 hook guideline (soft target; the doc's hard rule is ≤300).
- **Medium (visible, accepted):** `PATCH /api/v2/tasklists/[id]` takes `{ position, milestone_id }` with client-side renumbering instead of `before_id/after_id`. Internal API, small lists per phase, null positions common; documented in `_docs/context/projects.md`.
- **Medium (visible, accepted):** D8 refined: programme phases keep their programme number, and custom phases in programme projects shift by one. Without this the chip mislabeled "Migrate & Rebrand" as PHASE 1 (found in the browser). Non-programme projects still number by order exactly as D8 says.
- **Medium (visible, accepted):** UX caveats recorded under Known Issues: a drag started while sorted by another key reorders rows at drag start (direct consequence of D2), and the toolbar wraps at ≤ ~1560px when filter labels grow.
- No Major deviations: no scope added beyond the doc, no architecture change beyond the planned RPC + routes, out-of-scope boundaries respected (Board/Calendar/Tickets/Milestones tabs, `projects-old` apart from the D6 color values, no Zoho push, no MCP tool).

### Required Fixes
None.
