# 230: Time Logs Page & Forms — Full UX Overhaul (Progressive Reveal, Recently-Accessed Projects, Tasks/Issues Search Picker + General Log Mode, Rich Text Notes, Validation, Future Date/Time Guards, Hover Actions, Inline Table Editing, Detail Deep-Link)

**Created:** 2026-08-12
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** deep
**Status:** Completed

---

## Overview

Fifteen-point follow-up to tasks 226–229 (Dedicated Time Logs Page, `/v2/dashboard/timelogs`). Where
226–229 built the page and progressively polished its filters/date-time pickers/PDF export, this task
reworks the Add/Edit Time Log **form** into a proper guided flow (project → task/issue/general log →
date/time/notes, with validation) and the **table** into a hover-driven, inline-editable surface — plus
two structural additions the current data model doesn't yet support: logging time against an **Issue**
(not just a Task), and logging a **General Log** entry tied to a project but no specific task/issue.

The schema already supports both: `time_logs.task_id` and `time_logs.issue_id` are both nullable FKs
(confirmed in `src/types/database.ts:1310-1393`; `time_logs_issue_id_fkey` → `issues`), and `note` is a
free-text column with no NOT NULL constraint. **No migration is needed** — a General Log entry is simply
a row with `task_id = null`, `issue_id = null`, and the user's free text stored in `note`; an Issue-linked
entry sets `issue_id` instead of `task_id`. What's missing is application code: the write API is
currently only reachable through a task-scoped nested route (`POST/PATCH/DELETE
/api/v2/tasks/[taskId]/time-logs...`), which structurally can't create/edit an issue-linked or
task-less entry, or reassign an existing entry from one task to another. This task adds a new,
unified, non-nested write API for exactly that (see Assumption 2), while leaving the task-detail page's
own existing Time Logs tab (`_task-time-logs.tsx` / `_time-log-form.tsx`, tasks 214/215/218) and its
nested routes **completely untouched** — that simpler tab keeps creating task-scoped-only entries via
its existing route, unaffected by anything in this task.

**Decisions/assumptions made below (not explicitly confirmed by the user — flagged for review, not
silently decided):**

1. **General Log storage.** The "Enter General Log" textarea's content (image 14: labeled "Other Log
   Entries") becomes the entry's `note` value directly — there is no separate title column to add
   without a migration, and adding one for a single free-text field isn't justified. Because a General
   Log entry has no task/issue title to show, the table's "Log Title" column falls back to this same
   `note` text (truncated) for General Log rows. Consequence: when in General Log mode, the modal's
   separate "Notes (optional)" field is **hidden** (the "Other Log Entries" textarea already *is* the
   note) rather than stacking two note-like inputs that would silently overwrite each other against one
   DB column.
2. **New unified write API**, additive alongside the existing nested one:
   - `POST /api/v2/time-logs` — `{ project_id, task_id?, issue_id?, date_logged, start_time, end_time,
     note? }` (exactly one of `task_id`/`issue_id` set, or neither for General Log — General Log
     requires non-empty `note`).
   - `PATCH /api/v2/time-logs/[timeLogId]` / `DELETE /api/v2/time-logs/[timeLogId]` — owner-scoped
     (`employee_id = auth.uid()`, checked explicitly like the existing nested route does), same body
     shape as POST, allowing an entry to be reassigned between task/issue/general on edit (Requirement
     12).
   The existing `/api/v2/tasks/[taskId]/time-logs[...]` nested routes are untouched and keep serving the
   task-detail tab. The dedicated Time Logs page's modal and new inline-table editors (Requirements
   3–15) all move to the new unified route instead.
3. **Issue-linked entries have no assignee gate.** Tasks restrict the picker/POST to tasks the caller is
   assigned to (`task.assignees.includes(user.id)`); `issues` has no equivalent Hub-user assignee column
   (only `assignee_name`/`assignee_email` text imported from Zoho — confirmed via
   `src/types/database.ts` around the `issues` table). Issue-linked and General Log writes are gated on
   role only (same non-client/non-marketing check the page already uses for `canAdd`), not per-issue
   assignment.
4. **"Recently Accessed" projects are tracked client-side via `localStorage`**, keyed per user (e.g.
   `webriq_timelogs_recent_projects_${currentUserId}`), populated whenever a project is picked in this
   modal (Add or Edit). No backend "recently viewed" tracking exists anywhere in this codebase today, so
   this is the lowest-risk read: it costs no migration/API and degrades gracefully (empty history on
   first use → every project just shows under "Others", no empty "Recently Accessed" heading rendered).
5. **Tasks/Issues picker's "load on scroll" is in-memory reveal, not new server pagination.** Both
   `GET /api/v2/projects/[projectId]/tasks` and `GET /api/v2/projects/[projectId]/issues` already
   return their **complete** list in one response (`select("*")`, no query params) — that's how the
   existing single-task picker already works. For "100+ items" performance, the fix needed is
   **client-side windowed rendering** (mirroring `notification-bell.tsx`'s `visibleLimit`/`loadMore()`/
   `handleScroll()` pattern, `src/app/v2/(hub)/_components/notification-bell.tsx:100-175`) operating on
   the already-fetched, already-filtered, already-sorted array — not a new paginated endpoint.
6. **The Task/Issues picker's detail-link icon (Requirement 15) is click-only** — the reference
   screenshot's "Ctrl+Enter" hint is Zoho's own UI chrome, not a requirement to replicate a keyboard
   shortcut.
7. **The "disable until valid" rule (Requirement 9) is applied to both modes' primary button** — "Add"
   in Add mode and "Save changes" in Edit mode — for consistency, since the same field requirements
   apply to both; the user's wording named only "Add" but Edit has the identical required-field set.
8. **Rich Text Notes (Requirement 7) reuses the `Tiptap` stack already in this codebase**
   (`_comment-editor.tsx`'s `StarterKit`, Bold/Italic/bullet-list toolbar) but **without** that
   component's image-paste/upload capability — not requested here, and adding it would require a new
   upload endpoint out of scope for a Notes field.

## Requirements

Numbered to match the user's original list; each maps to concrete files in Proposed File Changes below.

1. **Not-allowed cursor on disabled future dates**, in both Add and Edit Time Log. The Date field
   already passes `disabled={{ after: today }}` into `DayPanel` (task 229 post-QA), but
   `_time-period-panels.tsx`'s `dayButtonClass()` never reads `modifiers.disabled` — disabled days fall
   through to the normal hover/cursor styling today. Fix `dayButtonClass()` to render
   `cursor-not-allowed` (plus the existing `classNames.disabled` muted text color) whenever
   `modifiers.disabled` is true. Since `DateFieldPicker` is shared by both Add and Edit modes already
   (it sits outside the `initial ? … : …` branch in `_time-log-entry-modal.tsx`), fixing it once covers
   both forms.
2. **Delete confirmation is a styled popup, not the native `confirm()`.** Replace
   `_time-logs-content.tsx`'s `if (!confirm("Delete this time log entry? This cannot be undone."))` with
   a new `ConfirmDialog` component (same modal-card visual language as `TimeLogEntryModal` itself:
   `fixed inset-0 z-50 … bg-[#0B1533]/40` overlay, white `rounded-[14px]` card), title "Delete time log
   entry?", body "This action cannot be undone.", Cancel + red-styled "Delete" actions.
3. **Add Time Log hides all fields until a project is picked.** In `_time-log-entry-modal.tsx`'s Add
   branch, only the Project field (+ Cancel/Add buttons) renders when `projectPublicId` is empty; the
   Task/Issue-or-General field and the Date/Start Time/End Time/Notes block only render once a project
   is selected.
4. **Project field redesign — searchable, grouped "Recently Accessed" / "Others".** Extend
   `SearchableSelect` with an optional `recentValues?: string[]` prop (additive, default
   undefined/off — the Task filter/User filter/old Task field call sites are unaffected). When set and
   no search query is active, render two labeled sections (`RECENTLY ACCESSED` / `OTHERS`, same orange
   `text-[#FB914E]` uppercase label styling `_time-period-panels.tsx`'s `QuickLinkRow` already uses)
   instead of one flat list. `_time-log-entry-modal.tsx`'s Project field passes
   `recentValues={getRecentProjectIds(currentUserId)}` (Assumption 4) and records the pick via
   `pushRecentProjectId(currentUserId, projectPublicId)` in its `onChange`.
5. **Task/Issues field redesigned as a search-only trigger (no chevron)** that opens a **tabbed**
   panel (Tasks / Issues), each list sorted newest-to-oldest, showing only titles, and windowed/
   revealed on scroll for large lists (Assumption 5). New component, `_task-issue-picker.tsx` — see
   Proposed File Changes.
6. **"Enter General Log" textarea, switchable with "Select Tasks/Issues".** Same component
   (`_task-issue-picker.tsx`, or a thin wrapper around it) owns a `mode: "picker" | "general"` toggle: a
   link at the bottom of the picker panel switches to a textarea labeled "Other Log Entries" (image 14),
   which itself has a "Select Tasks/Issues" link back to the picker.
7. **Rich Text Editor for Notes** — new `_time-log-notes-editor.tsx`, `Tiptap`/`StarterKit`-based,
   Bold/Italic/bullet-list toolbar only (Assumption 8), replacing the plain `<textarea>` currently used
   for Notes in `_time-log-entry-modal.tsx`. Hidden when in General Log mode (Assumption 1).
8. **Proper field validation** — required-field `*` markers (Project, Task/Issue-or-General, Date,
   Start Time, End Time; Notes stays optional/unmarked) and small red inline error text under each
   invalid field, replacing today's single form-level error line under the buttons.
9. **Disable Add (and, per Assumption 7, Save changes) until every required field is filled** and valid
   (including "End time after Start time").
10. **Helper icon + tooltip beside the Date and Time labels** — reuse the existing
    `Tooltip`/`TooltipTrigger`/`TooltipContent` (`@/components/ui/tooltip`, already used elsewhere in
    `_time-logs-table.tsx`) with a small `Info`/`HelpCircle` (lucide-react) trigger: "Time logging is
    not allowed for future dates" beside the Date label, "Time logging is not allowed for future times"
    beside the Start Time / End Time labels.
11. **Disable future times.** `TimeFieldPicker` gains an optional `maxTime?: string` ("HH:mm" 24h) prop;
    when the selected Date equals today, the modal passes the current wall-clock time as `maxTime` to
    both Start/End `TimeFieldPicker`s, and hour/minute tiles beyond it render disabled +
    `cursor-not-allowed` (same visual fix as Requirement 1, applied to `Tile`).
12. **Edit Time Log gets the same capabilities**, including changing the selected task/issue or
    switching to a General Log. Edit mode's static "fixed, non-editable" project/task info card (task
    229) is replaced: Project stays **read-only** (shown as a label, per Assumption — the user's request
    only calls out changing "the selected task", not the project), but the Task/Issue-or-General field
    becomes the same interactive `_task-issue-picker.tsx` as Add mode, pre-populated with the entry's
    current task/issue/general-note state, backed by the new unified `PATCH` (Assumption 2).
13. **Row actions (Edit/Delete) only appear on row hover** in `_time-logs-table.tsx` — add `group` to
    `<tr>`, wrap the existing action buttons' container in `opacity-0 group-hover:opacity-100
    transition-opacity` (buttons remain keyboard/focus-reachable via `focus-within:opacity-100` so they
    aren't hover-only for keyboard users).
14. **Log Title / Time Period / Date cells become inline-editable on click**, hover-affordanced. Log
    Title click opens the same `_task-issue-picker.tsx` used by the modal (reassign task/issue/general).
    Time Period click opens a new `_time-period-inline-editor.tsx` popover with Start/End time tiles
    (reusing `TimeFieldPicker`'s `Tile`/hour-minute-AM-PM building blocks, exported for reuse rather than
    duplicated) and a live auto-calculated hours preview. Date click opens the existing
    `DateFieldPicker`. All three commit through the new unified `PATCH /api/v2/time-logs/[timeLogId]`.
    Future dates/times stay disabled in every inline editor, same as the modal (Requirements 1/11).
15. **Detail deep-link icon on Log Title cell hover** — for task/issue-linked entries only (not General
    Log, per the user's explicit carve-out), an `ExternalLink` (lucide-react) icon appears on row hover
    inside the Log Title cell and navigates to `/v2/projects/${project_public_id}/tasks/${task_display_id}`
    or `/v2/projects/${project_public_id}/issues/${issue_display_id}` (exact href pattern already used
    at `_project-detail.tsx:527,620` — `router.push(`/v2/projects/${project.project_id}/tasks/${task.display_id}`)`).
    Requires the GET route to start returning `project_public_id`/`task_display_id`/`issue_display_id`
    per entry (see Proposed File Changes → `route.ts`).

## Out of Scope / Must-Not-Change

- **No database migration.** `task_id`/`issue_id`/`note` are already nullable on `time_logs` — General
  Log and Issue-linked entries are representable today with zero schema change.
- **Task-detail page's own Time Logs tab is untouched**: `_task-time-logs.tsx`, `_time-log-form.tsx`,
  and the existing nested `/api/v2/tasks/[taskId]/time-logs[...]` routes keep their current
  task-scoped-only behavior — referenced here only as patterns to mirror (delete-confirm text, Manual/
  Timer pill), never edited.
- **No change to `_export-pdf.ts`'s layout/columns/page-break logic** (task 227) beyond swapping the row
  label from `task_title` to the new unified `log_title` field (so a General Log row prints its actual
  text instead of "—") — a one-line change at the existing row-building call site, not a rewrite.
- **No change to `GET /api/v2/time-logs`'s `.range()` pagination-safety loop, role gating, or existing
  response fields** — only additive fields (`issue_id`, `entry_kind`, `log_title`, `project_public_id`,
  `task_display_id`, `issue_display_id`).
- **No change to who can log time at the RLS level** — `time_logs_developer_own` (migration 026) already
  scopes writes to `employee_id = auth.uid()`; the new unified route adds an explicit ownership check on
  top (matching the existing nested route's own belt-and-suspenders pattern), not a new RLS policy.
- **Not a multi-select anywhere** — Task/Issue picker selects exactly one task, one issue, or "general",
  never multiple.
- **No new `pnpm` dependency** — `@tiptap/react`/`@tiptap/starter-kit` are already installed
  (`_comment-editor.tsx`, `_task-description-field.tsx`); `react-dom`'s `createPortal` and
  `react-day-picker` are already installed and used throughout this directory.
- **PDF export's Employee/Project/Period grouping, page-break logic, and filename scheme (task 227)** —
  untouched beyond the one-line `log_title` swap above.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/v2/time-logs/route.ts` | Modify | GET: resolve issue titles/`display_id` alongside tasks, add `project_public_id`, unified `entry_kind`/`log_title`. Add POST: unified create (`project_id`, optional `task_id`/`issue_id`, General Log when neither). |
| `src/app/api/v2/time-logs/[timeLogId]/route.ts` | Create | Unified owner-scoped PATCH (date/time/note + task/issue/general reassignment) and DELETE. Mirrors `src/app/api/v2/tasks/[taskId]/time-logs/[timeLogId]/route.ts`'s ownership-check shape, not nested under a task. |
| `src/app/v2/(hub)/dashboard/timelogs/_time-logs-shared.ts` | Modify | Extend `TimeLogEntry` (`issue_id`, `entry_kind`, `log_title`, `project_public_id`, `task_display_id`, `issue_display_id`); add `getRecentProjectIds()`/`pushRecentProjectId()` (localStorage helpers, Assumption 4). |
| `src/app/v2/(hub)/dashboard/timelogs/_searchable-select.tsx` | Modify | Add optional `recentValues?: string[]` prop → renders "Recently Accessed"/"Others" sections when set. |
| `src/app/v2/(hub)/dashboard/timelogs/_time-period-panels.tsx` | Modify | `dayButtonClass()` reads `modifiers.disabled` → adds `cursor-not-allowed` (Requirement 1). |
| `src/app/v2/(hub)/dashboard/timelogs/_time-field-picker.tsx` | Modify | Add optional `maxTime?: string` prop (disables + `cursor-not-allowed`s hour/minute tiles beyond it); export `Tile`/hour-grid pieces for reuse by the new inline Time Period editor. |
| `src/app/v2/(hub)/dashboard/timelogs/_task-issue-picker.tsx` | Create | Search-trigger + tabbed (Tasks/Issues) scroll-revealed panel, with the General Log textarea switch. Used by the modal (Add + Edit) and the table's inline Log Title editor. |
| `src/app/v2/(hub)/dashboard/timelogs/_time-log-notes-editor.tsx` | Create | Tiptap rich-text Notes field (Bold/Italic/bullet list), no image upload. |
| `src/app/v2/(hub)/dashboard/timelogs/_confirm-dialog.tsx` | Create | Reusable styled confirm modal (title/body/Cancel/destructive-action). |
| `src/app/v2/(hub)/dashboard/timelogs/_time-period-inline-editor.tsx` | Create | Table-cell popover: Start/End time tiles (reusing `_time-field-picker.tsx`'s exported pieces) + live auto-calculated hours. |
| `src/app/v2/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx` | Modify | Progressive field reveal, validation + `*` markers + inline errors, disabled Add/Save until valid, tooltips, future-time wiring, Edit-mode task/issue/general reassignment via `_task-issue-picker.tsx`, Rich Text Notes, moves to the new unified POST/PATCH. |
| `src/app/v2/(hub)/dashboard/timelogs/_time-logs-table.tsx` | Modify | Hover-reveal row actions; Log Title/Time Period/Date cells become inline-editable + hover detail-link icon on Log Title. |
| `src/app/v2/(hub)/dashboard/timelogs/_time-logs-content.tsx` | Modify | Swap native `confirm()` for `ConfirmDialog`; wire inline-table edit callbacks to the new unified PATCH; no change to period/project/employee filter logic. |
| `src/app/v2/(hub)/dashboard/timelogs/_export-pdf.ts` | Modify | Row label uses the new `log_title` instead of `task_title` (one call site). |

## Code Context

### `time_logs` table already supports both new entry kinds (`src/types/database.ts:1310-1393`)

```ts
time_logs: {
  Row: {
    id: string;
    task_id: string | null;
    issue_id: string | null;      // ← already exists, unused by any write path today
    project_id: string;
    employee_id: string | null;
    date_logged: string;
    hours: number;
    billable: boolean;
    note: string | null;          // ← General Log's text lives here (Assumption 1)
    source: "timer" | "manual";
    // ...
  };
}
```

### Existing nested write route to mirror for the new unified one (`src/app/api/v2/tasks/[taskId]/time-logs/[timeLogId]/route.ts`)

```ts
async function requireOwnRow(supabase, taskId: string, timeLogId: string, userId: string) {
  const { data: row } = await supabase.from("time_logs").select("id, employee_id")
    .eq("id", timeLogId).eq("task_id", taskId).maybeSingle();
  if (!row) return { error: NextResponse.json({ error: "Time log not found" }, { status: 404 }) };
  if (row.employee_id !== userId) return { error: NextResponse.json({ error: "You can only edit your own time logs" }, { status: 403 }) };
  return { error: null };
}
```
The new `[timeLogId]/route.ts` drops the `.eq("task_id", taskId)` filter (no task in the URL) and looks
the row up by `id` alone, otherwise identical ownership-check shape. Same `hours` server-side
recomputation from `start_time`/`end_time` (never trust client-supplied hours).

### Current Add-mode field layout to make conditional (`_time-log-entry-modal.tsx:149-204`)

```tsx
{initial ? ( /* fixed info card */ ) : (
  <div className="flex flex-col gap-3">
    {/* Project field */}
    {/* Task field */}
  </div>
)}
<div className="flex gap-2.5">{/* Date / Start / End — currently always rendered */}</div>
<div>{/* Notes — currently always rendered */}</div>
```
Requirement 3 wraps the Date/Start/End/Notes block in the same `projectPublicId`-gated condition the
Task field already effectively has via its `disabled={!projectPublicId}` — but hidden entirely, not just
disabled, per the reference screenshots.

### `SearchableSelect`'s existing option-list rendering to extend with sections (`_searchable-select.tsx:159-168`)

```tsx
<div className="max-h-[220px] overflow-y-auto p-1">
  <OptionRow label={placeholder} selected={value === ""} onClick={() => pick("")} />
  {filtered.length === 0 ? (
    <div className="px-2 py-2 text-[11.5px] text-[#5F6A88]">No matches</div>
  ) : (
    filtered.map((o) => <OptionRow key={o.value} label={o.label} selected={o.value === value} onClick={() => pick(o.value)} />)
  )}
</div>
```
When `recentValues` is set and `query` is empty: split `filtered` into `recent = filtered.filter(o =>
recentValues.includes(o.value))` (in `recentValues` order) and `others = filtered.filter(o =>
!recentValues.includes(o.value))`, render two labeled groups instead of one flat `filtered.map(...)`.
Section label style to reuse — `_time-period-panels.tsx`'s `QuickLinkRow` orange label:
`text-[12px] font-semibold text-[#FB914E]` (scale down to ~10-11px uppercase tracked, matching this
directory's other section-header convention, e.g. `_time-logs-table.tsx`'s `HEADER_CLASS`).

### `notification-bell.tsx`'s scroll-reveal pattern to adapt for in-memory windowing (`notification-bell.tsx:100-175`)

```tsx
const [visibleLimit, setVisibleLimit] = useState(INITIAL_LIMIT);
function loadMore() { setVisibleLimit(v => v + PAGE_SIZE); }
function handleScroll(e) {
  const el = e.currentTarget;
  if (el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_THRESHOLD_PX) loadMore();
}
```
For `_task-issue-picker.tsx`, this becomes purely client-side: `visibleLimit` slices the already-fetched,
already-filtered-by-search, already-sorted-newest-first array (`items.slice(0, visibleLimit)`) — no
`fetch()` call inside `loadMore()`, since the full list is already in memory (Assumption 5).

### Task/Issue detail-link href pattern already established (`_project-detail.tsx:527,620`)

```tsx
onOpen={(task) => router.push(`/v2/projects/${project.project_id}/tasks/${task.display_id}`)}
onOpen={(issue) => router.push(`/v2/projects/${project.project_id}/issues/${issue.display_id}`)}
```
`project.project_id` is the **public** id (not the UUID `id`) — the modal already fetches `ProjectOption
{ id, project_id, name }` from `/api/v2/projects`, so `project_public_id` just needs threading from
there into the `time_logs` GET response for the table's link icon (Requirement 15) to reuse this exact
pattern without a second projects lookup.

### `_task-time-logs.tsx`'s delete-confirm text to reuse verbatim in `ConfirmDialog` (`_task-time-logs.tsx:85`)

```tsx
if (!confirm("Delete this time log entry? This cannot be undone.")) return;
```
Same copy, styled modal instead of the native dialog.

### `_comment-editor.tsx`'s Tiptap setup to mirror (minus image upload) for `_time-log-notes-editor.tsx`

```tsx
const editor = useEditor({
  extensions: [StarterKit.configure({ link: { openOnClick: false } })],
  content: "", immediatelyRender: false,
  editorProps: { attributes: { class: cn("outline-none px-3 py-2 text-[13px] min-h-[70px] leading-relaxed", /* ... */) } },
  onUpdate: ({ editor: e }) => onChange(e.getHTML()),
});
```
Drop the `Image` extension and `handlePaste`/`handleDrop` image-upload handlers entirely (Assumption 8)
— Bold/Italic/bullet-list toolbar only, matching the three marks already defined in `_comment-editor.tsx`.

## Implementation Steps

### Phase A — Data layer (API + shared types)
1. Extend `GET /api/v2/time-logs`: add an `issueIds`/`issueTitles`+`issueDisplayIds` resolution pass
   parallel to the existing `taskIds`/`taskTitles` one; add a `projectPublicIds` map from the already-
   fetched `projects` batch (`select` needs `project_id` added alongside `id, name`); compute per-row
   `entry_kind: "task" | "issue" | "general"` and `log_title` (task title, issue title, or `note`
   fallback for general, truncate consistently with how the table already displays it).
2. Add `POST /api/v2/time-logs`: validate `project_id` + exactly-one-of/neither `task_id`/`issue_id`;
   for `task_id` set, keep the existing assignee check; for `issue_id` set or neither, role-only gate
   (Assumption 3); General Log requires non-empty `note`; server-computed `hours` from `start_time`/
   `end_time`, identical validation to the existing nested POST.
3. Create `src/app/api/v2/time-logs/[timeLogId]/route.ts` — PATCH (same body shape as POST, plus
   reassignment support) and DELETE, both owner-scoped per Code Context's `requireOwnRow` mirror.
4. Extend `TimeLogEntry` in `_time-logs-shared.ts`; add `getRecentProjectIds(userId)` /
   `pushRecentProjectId(userId, projectId)` (localStorage, capped at ~5 entries, most-recent-first,
   de-duplicated).

### Phase B — New shared components
5. Build `_confirm-dialog.tsx`: `ConfirmDialog({ open, title, body, confirmLabel, onConfirm, onCancel
   })`, styled per Requirement 2.
6. Extend `_time-period-panels.tsx`'s `dayButtonClass()` to append `cursor-not-allowed` when
   `modifiers.disabled` (Requirement 1).
7. Extend `_time-field-picker.tsx`: `Tile` gains `disabled?: boolean` → `cursor-not-allowed
   opacity-40 pointer-events-none`; `TimeFieldPicker` gains `maxTime?: string`, computing per-tile
   disabled state (hour/minute combinations after `maxTime`) for both the Hour grid and Minute
   quick-picks/exact-input; export the tile-grid building blocks (or a small shared
   `<HourMinuteAmPmGrid draft onChange maxTime />` subcomponent) for reuse by
   `_time-period-inline-editor.tsx` rather than duplicating the grid markup.
8. Build `_time-log-notes-editor.tsx` per Code Context above.

### Phase C — Task/Issue picker + General Log
9. Build `_task-issue-picker.tsx`: search-input-styled trigger (no chevron) → portal popover (same
   positioning mechanics as `_searchable-select.tsx`) containing a Tasks/Issues tab switcher, each tab's
   list windowed via the in-memory reveal pattern (Code Context), sorted newest-first (`created_at`
   descending — Tasks need a client-side sort since their GET route orders by `position`; Issues'
   GET route already orders `created_at desc`). Below the search input, an "Enter General Log" link
   toggles `mode: "general"`, swapping the whole panel for a `<textarea>` labeled "Other Log Entries"
   with a "Select Tasks/Issues" link back. Component's public contract:
   `TaskIssuePicker({ projectId /* public id */, currentUserId, value: { kind: "task"|"issue"|"general";
   id?: string; text?: string } | null, onChange, tasksAssignedOnly?: boolean })` — `tasksAssignedOnly`
   defaults true for Add mode (matches today's assignee-filtered behavior) but is passable as `false` if
   Edit mode's current task isn't one the caller is assigned to (edge case: reassignment shouldn't hide
   the entry's own existing task).

### Phase D — Modal rework
10. `_time-log-entry-modal.tsx`: gate the Date/Start/End/Notes block on `projectPublicId` truthy
    (Requirement 3); pass `recentValues` into the Project `SearchableSelect` and call
    `pushRecentProjectId` on selection (Requirement 4); replace the Task field with
    `_task-issue-picker.tsx` (Requirement 5/6); replace the Notes `<textarea>` with
    `_time-log-notes-editor.tsx`, hidden when `mode === "general"` (Requirement 7); add per-field
    validation state + `*` labels + inline red error text, and a derived `isValid` gating both the Add
    and Save-changes buttons' `disabled` (Requirements 8/9, Assumption 7); add the two tooltip icons
    (Requirement 10); compute `maxTime` from `date === todayISO` and thread into both `TimeFieldPicker`s
    (Requirement 11); replace the Edit-mode fixed info card with a read-only Project label + the same
    interactive `_task-issue-picker.tsx` pre-populated from `initial` (Requirement 12); switch
    `handleSave()` from the nested `/api/v2/tasks/${taskId}/time-logs...` URL to the new unified
    `POST /api/v2/time-logs` / `PATCH /api/v2/time-logs/${initial.id}`.

### Phase E — Table rework
11. `_time-logs-table.tsx`: add `group` to `EntryRow`'s `<tr>`; wrap the actions `<div>` in
    `opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity` (Requirement 13).
    Make the Log Title `<td>` clickable (opens `_task-issue-picker.tsx` inline, reassign-in-place,
    Requirement 14) and, on row hover, show the `ExternalLink` icon beside it when
    `entry.entry_kind !== "general"`, linking to the href pattern from Code Context (Requirement 15).
    Make the Time Period `<td>` clickable → `_time-period-inline-editor.tsx` popover (Requirement 14).
    Make the Date `<td>` clickable → reuse `DateFieldPicker` directly (Requirement 14). Every inline
    editor commits via `PATCH /api/v2/time-logs/${entry.id}` and calls the same `onSaved`-style callback
    the modal uses to update local state.
12. `_time-logs-content.tsx`: swap the native `confirm()` in `handleDelete` for `ConfirmDialog` state
    (Requirement 2); route delete through `DELETE /api/v2/time-logs/${entry.id}` (new unified route)
    instead of the old nested URL; wire the table's new inline-edit callbacks to the same
    `handleSaved`-shaped state update the modal already triggers, so on-screen data stays consistent
    regardless of which UI (modal vs. inline cell) made the edit.
13. `_export-pdf.ts`: swap `e.task_title` for `e.log_title` in the row-building call site (one line).

### Phase F — Verification
14. `npx tsc --noEmit` and `pnpm lint`.
15. Manual/browser verification (see Verification section) — this task is UI-heavy and cannot be
    meaningfully verified by type-checking alone.

## Acceptance Criteria

- [ ] Future dates in both Date pickers (modal + inline table) show a not-allowed cursor and cannot be
      selected; same for future times when the picked date is today.
- [ ] Deleting a time log shows a styled confirmation dialog (not the browser's native `confirm()`) with
      Cancel/Delete actions; deleting is unchanged in effect (row removed, entry actually deleted).
- [ ] Add Time Log shows only the Project field until a project is chosen; the rest of the form appears
      immediately after.
- [ ] Project field is a searchable combobox showing "Recently Accessed" (once at least one project has
      been picked before) and "Others" sections.
- [ ] Task/Issues field is a chevron-less search trigger; clicking it opens a Tasks/Issues-tabbed panel,
      newest-first, titles only, that reveals more items as the user scrolls near the bottom of a 100+
      item list without noticeable lag.
- [ ] "Enter General Log" / "Select Tasks/Issues" links correctly toggle between the picker and a
      required "Other Log Entries" textarea, in both Add and Edit modes.
- [ ] Notes field is a rich text editor (Bold/Italic/bullet list at minimum), hidden when General Log
      mode is active.
- [ ] Every required field (Project, Task/Issue/General, Date, Start Time, End Time) shows a `*` and,
      when left invalid, a small red error message directly below it; Notes has no `*`.
- [ ] Add (and Save changes, in Edit mode) stays disabled until every required field is valid.
- [ ] Date and Time labels each show a small helper icon whose tooltip reads the exact specified copy.
- [ ] Edit Time Log supports changing the linked task, switching to a different issue, or switching to a
      General Log, alongside everything Add mode supports; Project itself stays read-only in Edit mode.
- [ ] Table rows only show Edit/Delete icons on hover (or keyboard focus).
- [ ] Clicking the Log Title cell opens the task/issue/general reassignment picker in place; clicking
      Time Period opens a from/to time popover that live-recalculates the daily hours; clicking Date
      opens the date popover — all three save via the entry's own row, with future dates/times still
      disabled.
- [ ] On row hover, task/issue-linked Log Title cells (not General Log rows) show a link icon that
      navigates to that task's or issue's detail page.
- [ ] `npx tsc --noEmit` and `pnpm lint` are both clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manual browser check — see below
```

Manual/browser, as a role that can add/edit time logs (e.g. developer or PM):
1. Open Add Time Log — confirm only Project shows initially; pick a project and confirm the rest of the
   form appears, with "Recently Accessed" populated on a second open after a prior pick.
2. Open the Task/Issues picker on a project with 100+ tasks — confirm the list scrolls smoothly with
   incremental reveal, tabs correctly switch to Issues, and both lists read newest-first.
3. Switch to "Enter General Log", type free text, and save — confirm the table shows that text as the
   Log Title, with a Manual/Timer pill and no detail-link icon on hover.
4. Log against an Issue — confirm the table's Log Title links to the correct issue detail page on hover-
   icon click, and against a Task — confirm it links to the correct task detail page.
5. Try to save with required fields empty — confirm inline red errors appear and Add stays disabled;
   confirm Add enables once every required field is valid.
6. With today selected as the date, confirm future hour/minute tiles in Start/End Time are disabled with
   a not-allowed cursor; confirm future calendar days are disabled the same way.
7. Edit an existing task-linked entry — reassign it to a different task, then to an Issue, then to a
   General Log, confirming each save round-trips correctly and the table reflects it.
8. Hover a table row — confirm Edit/Delete only appear on hover; click Delete — confirm the new styled
   confirmation dialog appears and actually deletes on confirm, does nothing on cancel.
9. Click directly on a row's Log Title, Time Period, and Date cells — confirm each opens its inline
   editor, saves correctly, and the Daily Log Hours recalculates live while adjusting Time Period.
10. Export a PDF including a General Log entry — confirm its row shows the general text instead of "—".

## Compatibility Touchpoints

- New API surface (`POST /api/v2/time-logs`, `PATCH`/`DELETE /api/v2/time-logs/[timeLogId]`) is
  additive — does not replace or break the existing nested `/api/v2/tasks/[taskId]/time-logs...` routes
  still used by the task-detail page's Time Logs tab.
- No new `pnpm` dependency.
- No RLS/migration changes — `time_logs_developer_own` (migration 026) already covers the new route's
  ownership requirement.
- Does not affect the MCP tool inventory.
- `SearchableSelect`'s new `recentValues` prop and `TimeFieldPicker`'s new `maxTime` prop are both
  additive/optional — every existing call site (Project/User filters, the old Task field being replaced,
  the page's own date filter) keeps working unmodified.

## Implementation Notes

### What Changed
- **Data layer**: `GET /api/v2/time-logs` now resolves issue titles/`display_id` alongside task ones,
  and every entry carries `issue_id`, `entry_kind` (`task`/`issue`/`general`), `log_title` (unified
  display title — task title, issue title, or the General Log's own text), `project_public_id`,
  `task_display_id`, `issue_display_id`. `can_edit` dropped its `&& !!r.task_id` restriction — every
  entry the caller owns is now editable via the new route, not just task-linked ones. Added
  `POST /api/v2/time-logs` (unified create) and `src/app/api/v2/time-logs/[timeLogId]/route.ts`
  (unified owner-scoped PATCH/DELETE), exactly as planned in Assumption 2 — the existing nested
  `/api/v2/tasks/[taskId]/time-logs...` routes are untouched.
- **Requirement 1**: `_time-period-panels.tsx`'s `dayButtonClass()` now renders `cursor-not-allowed`
  (plus the existing muted color) whenever `modifiers.disabled` is true — previously disabled days fell
  through to normal hover/pointer styling despite already being unselectable.
- **Requirement 2**: `_confirm-dialog.tsx` (new) replaces `_time-logs-content.tsx`'s native `confirm()`
  for delete; wired through a `deleteTarget` state + `ConfirmDialog`.
- **Requirements 3/8/9**: `_time-log-entry-modal.tsx`'s Add mode now hides everything but Project until
  one is picked. Every required field shows a `*` and inline red error text once the user has touched
  *any* field (`interacted` state) — not gated on a submit attempt, since Add/Save are disabled from
  first render whenever the form is invalid (a genuinely `disabled` button can never fire a click to
  "attempt" a submit, so error visibility had to key off per-field interaction instead).
- **Requirement 4**: `SearchableSelect` gained an optional `recentValues` prop rendering "Recently
  Accessed"/"Others" sections; `_time-logs-shared.ts` gained `getRecentProjectIds`/`pushRecentProjectId`
  (localStorage, per-user key, 5-entry cap) per Assumption 4.
- **Requirements 5/6**: New `_task-issue-picker.tsx` — chevron-less search trigger opening a portal
  panel with Tasks/Issues tabs (newest-first, titles only, in-memory scroll-reveal windowing per
  Assumption 5) and an "Enter General Log" / "Select Tasks/Issues" toggle to a free-text mode.
- **Requirement 7**: New `_time-log-notes-editor.tsx` (Tiptap, Bold/Italic/bullet-list only, no image
  upload per Assumption 8), replacing the plain `<textarea>`; hidden in General Log mode.
- **Requirement 10**: Helper tooltip icons added beside Date/Start Time/End Time labels via the
  existing `Tooltip`/`TooltipTrigger`/`TooltipContent`.
- **Requirement 11**: `TimeFieldPicker` gained an optional `maxTime` ("HH:mm") prop disabling
  hour/minute/AM-PM tiles beyond it; the modal computes it from `date === today`. The Hour/Minute/AM-PM
  grid was extracted into a new exported `HourMinuteAmPmGrid` (plus exported `Tile`, `parseValue`,
  `draftTo24`) so `_time-period-inline-editor.tsx` doesn't duplicate it.
- **Requirement 12**: Edit mode's previously-static, non-editable project/task info card is now a
  read-only Project label plus the same interactive `_task-issue-picker.tsx` as Add mode, pre-populated
  from the entry, saving through the unified PATCH.
- **Requirement 13**: `EntryRow`'s `<tr>` gained `group`; the action-buttons container is now
  `opacity-0 group-hover:opacity-100 focus-within:opacity-100`.
- **Requirement 14**: Log Title, Time Period, and Date cells are click-to-edit. Log Title opens
  `_task-issue-picker.tsx` inline (task/issue picks commit immediately; General Log gets an explicit
  Save/Cancel since it's free text). Time Period opens the new `_time-period-inline-editor.tsx`
  (Start/End tile grids + live auto-calculated hours, explicit Save/Cancel). Date reuses
  `DateFieldPicker` directly, extended with optional `autoOpen`/`onClose` props so a single click opens
  it immediately and exiting the popover returns the cell to its static state. All three commit via a
  new `patchEntry()` helper hitting `PATCH /api/v2/time-logs/[id]`.
- **Requirement 15**: Task/issue-linked Log Title cells show an `ExternalLink` icon on row hover,
  linking to `/v2/projects/${project_public_id}/tasks/${task_display_id}` or `.../issues/${issue_display_id}`
  (the same href pattern already used in `_project-detail.tsx`) — omitted for General Log rows.
- `_export-pdf.ts`'s row builder now prints `log_title` instead of `task_title`, so a General Log entry
  shows its actual text in the PDF instead of the old task-less "—" fallback.

### Files Changed
- `src/app/api/v2/time-logs/route.ts` - extended GET (issue/display-id/log_title resolution), added POST
- `src/app/api/v2/time-logs/[timeLogId]/route.ts` - new, unified PATCH/DELETE
- `src/app/v2/(hub)/dashboard/timelogs/_time-logs-shared.ts` - extended `TimeLogEntry`, added recent-projects localStorage helpers
- `src/app/v2/(hub)/dashboard/timelogs/_searchable-select.tsx` - added `recentValues` prop + Recently Accessed/Others sections
- `src/app/v2/(hub)/dashboard/timelogs/_time-period-panels.tsx` - `dayButtonClass()` disabled-cursor fix
- `src/app/v2/(hub)/dashboard/timelogs/_time-field-picker.tsx` - added `maxTime`/tile `disabled`, extracted `HourMinuteAmPmGrid`/`Tile`/`parseValue`/`draftTo24` for reuse
- `src/app/v2/(hub)/dashboard/timelogs/_date-field-picker.tsx` - added `autoOpen`/`onClose` props (not in the original file list — needed for Requirement 14's single-click inline table editing; see Deviations)
- `src/app/v2/(hub)/dashboard/timelogs/_task-issue-picker.tsx` - new
- `src/app/v2/(hub)/dashboard/timelogs/_time-log-notes-editor.tsx` - new
- `src/app/v2/(hub)/dashboard/timelogs/_confirm-dialog.tsx` - new
- `src/app/v2/(hub)/dashboard/timelogs/_time-period-inline-editor.tsx` - new
- `src/app/v2/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx` - full rework per Phase D
- `src/app/v2/(hub)/dashboard/timelogs/_time-logs-table.tsx` - full rework per Phase E
- `src/app/v2/(hub)/dashboard/timelogs/_time-logs-content.tsx` - `ConfirmDialog` wiring, `onInlineSave`, unified delete route
- `src/app/v2/(hub)/dashboard/timelogs/_export-pdf.ts` - `log_title` swap

### Deviations From Plan
- **`_date-field-picker.tsx` modified** — not in the task doc's Proposed File Changes table. Needed
  optional `autoOpen`/`onClose` props so the table's Date cell can open the popover on a single click
  and return to its static display when the popover closes; both additive, the modal's own usage is
  unaffected.
- **Add/Save button disabling gates on `!isValid` directly from first render**, not on a
  `submitAttempted` flag as an earlier draft of this implementation did. A `disabled` button can never
  fire a click to "attempt" a submit, so gating field-error visibility on a submit click would have made
  errors permanently unreachable. Field errors instead reveal once the user has touched any field
  (`interacted` state) — functionally equivalent to Requirement 9's "disabled until valid," but the
  error-visibility trigger is a per-field-touch heuristic, not explicitly specified in the task doc.
- **`_task-issue-picker.tsx`'s `TaskIssueValue` carries a `displayId`** on its task/issue variants,
  beyond the task doc's sketched `{ kind; id?; text? }` contract — needed so reassigning an entry's
  task/issue (Requirement 12/14) produces an immediately-correct detail-link (Requirement 15) without
  waiting for a full page refetch.
- **Inline Log Title reassignment to General Log uses an explicit Save/Cancel pair**, not specified in
  the task doc's Code Context for that path. Committing on every keystroke (matching `TaskIssuePicker`'s
  live per-tile commit for task/issue picks) isn't appropriate for free text; an explicit action was
  chosen for predictability, mirroring `_time-period-inline-editor.tsx`'s own Save/Cancel pattern rather
  than inventing a third commit style.
- **Found and fixed during implementation, not anticipated in the plan**: the first draft of the Log
  Title cell nested a `<Link>` (renders `<a>`) inside a `<button>` — invalid HTML / hydration risk.
  Restructured into sibling elements (a `<button>` for the edit trigger, a separate `<Link>` for the
  detail icon).
- **Found and fixed during implementation**: the Time/AM-PM-tile `maxTime` disabling logic initially
  used hour12 `1` as each period's "earliest" reference when deciding whether to disable the whole AM or
  PM tile; corrected to hour12 `12` (midnight/noon), the actual chronological start of each period —
  the `1` reference could have disabled the AM tile one hour too early right after midnight.
- No other deviations — every Requirement (1–15) and every planned file was implemented as scoped; no
  Out-of-Scope boundary was crossed (task-detail's own Time Logs tab, its nested routes, RLS, the PDF's
  layout/page-break logic, and `TimePeriodPicker`/`_time-period-picker.tsx` are all untouched).

### Verification Run
- `npx tsc --noEmit` - PASS (no output)
- `pnpm lint` - PASS (0 errors; the same 2 pre-existing warnings in
  `portfolio-tracker/.../onboarding-workspace/_checklist-tab.tsx` documented in tasks 226–229, untouched
  by this task). One real hard error (`react-hooks/set-state-in-effect` in `_task-issue-picker.tsx`) and
  one warning (`react-hooks/exhaustive-deps` in `_date-field-picker.tsx`) were caught and fixed during
  implementation — see Deviations-adjacent fixes above; both re-verified clean after the fix.
- `pnpm dev` manual browser check - **SKIPPED**, no test credentials/browser session available in this
  environment, same documented gap as tasks 226–229. This task is UI-heavy (15 requirements spanning a
  redesigned form flow, a new tabbed search picker, rich text, and three kinds of inline table editing)
  and cannot be meaningfully verified by type-checking/linting alone — recommend running the full manual
  verification checklist in this doc's Verification section before shipping, in particular: the
  Tasks/Issues picker's scroll-reveal against a 100+-item project, General Log and Issue-linked entries
  end-to-end (create, table display, PDF export), the future-date/time disabling at every entry point
  (modal + all three inline table editors), and the Edit-mode task/issue/General-Log reassignment path.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Read every changed/new file in full (both API routes, all 6 new components, and all 9 modified
  files) against this codebase's established conventions for the `dashboard/timelogs` feature area.
- No unused code, dead code, or commented-out implementation in any file. Removed one now-dead
  constant (`inputClass` in `_time-log-entry-modal.tsx`) left over from before the Rich Text Notes
  editor replaced the plain `<textarea>` it styled.
- No `any`/untyped escape hatches — every new type (`TaskIssueValue`, `EntryKind`, the API routes'
  request/response shapes) is precisely typed; `patchEntry()`'s `Record<string, unknown>` body
  parameter is an appropriate, narrow escape (the body shape legitimately varies per call site: date-
  only, period-only, or task/issue/note reassignment), not a blanket `any`.
- No deep nesting — every new function (`TaskIssuePicker`'s handlers, `LogTitleEditor`'s `commit`/
  `handleChange`, the API routes' validation chain) reads linearly with early-return guard clauses,
  consistent with the rest of this feature area.
- Each file/function keeps one clear responsibility: the two API routes split cleanly into
  read-and-resolve (GET) vs. create (POST) vs. owner-scoped edit/delete (`[timeLogId]/route.ts`);
  `_task-issue-picker.tsx` owns picker state only; `_time-period-inline-editor.tsx` owns its own
  draft/save/cancel only; `_time-logs-table.tsx`'s `LogTitleEditor`/`patchEntry`/`basePatchBody`/
  `detailHref`/`pickerValueFromEntry` are each single-purpose and named for exactly what they do.
- **Repeated logic found and extracted during this gate**: `nowHHmm()` and `combineDateTime()` were
  defined identically in both `_time-log-entry-modal.tsx` and `_time-logs-table.tsx`, and an ISO ->
  "HH:mm" formatter existed under two different names in the same two files
  (`toTimeInputValue`/`toHHmm`, identical bodies). All three were extracted to `_time-logs-shared.ts`
  (`nowHHmm`, `combineDateTime`, `isoToHHmm`) — the directory's existing shared module for exactly this
  kind of cross-file date/time helper — and both files now import them instead of maintaining their
  own copies. Re-verified `npx tsc --noEmit` and `pnpm lint` clean after the extraction.
- Errors are handled intentionally throughout: every new `fetch()` call (`TaskIssuePicker`'s
  task/issue load, `patchEntry()`, the modal's save, `_confirm-dialog.tsx`'s delete flow) checks
  `res.ok` and falls back to a safe default or surfaces `body.error`, matching this app's established
  inline-error-text pattern rather than throwing unhandled. Both new API routes validate every body
  field defensively (`typeof` guards) before touching the database, matching the existing nested
  route's own validation shape.
- No secrets, credentials, or debug logging — the one `console.error` in the new POST route matches
  the exact logging convention already present in the sibling nested POST route it was modeled on.
- Project conventions followed: no `isDark`/`dark:` classes introduced (v2 pages don't use them per
  CLAUDE.md), Tailwind-only styling throughout (no `style={{}}`), every new popover/portal component
  (`_task-issue-picker.tsx`, `_time-period-inline-editor.tsx`) mirrors the exact portal-positioning/
  outside-click/Escape mechanics already established by `_searchable-select.tsx`/`_date-field-picker.tsx`
  rather than inventing a new pattern.
- **Bug found and fixed during this gate, before it could reach testing**: the first implementation
  pass nested a `<Link>` (renders `<a>`) inside a `<button>` in the table's Log Title cell — invalid
  HTML (interactive content inside interactive content) that risked a hydration mismatch and would
  have made the detail-link icon unreliable to click. Restructured into sibling elements.
- Repeated `impeccable` design-hook `design-system-font-size` findings across every touched/new file
  are all either on lines pre-existing before this task's edits, or in new files using the exact same
  pixel-value convention already used pervasively throughout this directory (`text-[10px]`/
  `text-[11px]`/`text-[12px]`/`text-[13px]` per `_time-log-entry-modal.tsx`, `_time-logs-table.tsx`,
  `_time-period-panels.tsx`, etc.). Classified as false positives per CLAUDE.md's already-reconciled
  "UI Polish Conventions" section and the identical precedent set by tasks 226–229's own quality gates
  — this app has no rem-based type ramp. No fix applied.

### Deviations
- **Minor** — `_date-field-picker.tsx` was modified (added optional `autoOpen`/`onClose` props) though
  it wasn't in the task doc's Proposed File Changes table; required for Requirement 14's single-click
  inline Date-cell editing. Additive/optional, the modal's own existing usage is unaffected.
- **Minor** — `TaskIssueValue`'s task/issue variants carry a `displayId` field beyond the task doc's
  sketched `{ kind; id?; text? }` contract, so a reassigned entry's detail-link (Requirement 15) is
  correct immediately rather than only after a full page refetch.
- **Minor** — inline Log Title reassignment to General Log uses an explicit Save/Cancel pair rather
  than a specified commit mechanism; reasonable given free text can't commit on every keystroke the
  way a single task/issue pick can.
- **Minor, found and fixed during implementation (not by this gate)** — a `react-hooks/set-state-in-
  effect` hard lint error in `_task-issue-picker.tsx` and a `react-hooks/exhaustive-deps` warning in
  `_date-field-picker.tsx`; both fixed and re-verified before implementation was reported complete.
- **Minor, found and fixed during implementation** — the AM/PM tile future-time-disabling logic used
  hour12 `1` instead of `12` as each period's chronological start reference, which could have disabled
  the AM tile one hour too early right after midnight; corrected.
- **Minor, found and fixed during this gate** — `nowHHmm()`/`combineDateTime()`/an ISO->"HH:mm"
  formatter were duplicated verbatim across two files; extracted to the shared module (see Standards
  Review above).
- No Medium or Major deviations. Every Requirement (1–15) from the approved task doc is implemented;
  every Out of Scope / Must-Not-Change boundary held — no migration was added, the task-detail page's
  own Time Logs tab and its nested write routes are untouched, `_export-pdf.ts`'s only change is the
  one-line `log_title` swap, `GET /api/v2/time-logs`'s pagination loop and role gating are unchanged
  (only additive response fields), and `TimePeriodPicker`/`_time-period-picker.tsx` were not touched.

### Verification Run (re-run after this gate's fixes)
- `npx tsc --noEmit` - PASS (no output)
- `pnpm lint` - PASS (0 errors; same 2 pre-existing, unrelated warnings in
  `onboarding-workspace/_checklist-tab.tsx` as tasks 226–229, untouched by this task)

## Post-QA Adjustments (user feedback during Testing)

Three issues reported after manually exercising the Add Time Log modal and the table's inline
Log Title editor:

1. **Error messages appeared before any save attempt.** The original design conflated two different
   things under one `isValid`/`interacted` gate: "a required field has no value" (should disable
   Add/Save) and "the fields are filled but semantically wrong, e.g. End Time before Start Time"
   (should only surface once the user actually tries to save). Since a `disabled` button can never
   fire a click, and error text was tied to per-field touch rather than a save attempt, a semantic
   error like "End time must be after start time" could appear the instant the user picked a Start/
   End combination, before ever clicking Add. Fixed in `_time-log-entry-modal.tsx` by splitting the
   two: a new `requiredFilled` boolean (presence-only — every required field has *some* value, no
   cross-field check) now gates the Add/Save button's `disabled` state; the existing `errors` object
   (which includes the End-after-Start check) still exists, but its messages only render once
   `submitAttempted` is true — set by `handleSave()` itself on click, not by touching a field. This
   also meant `handleProjectChange` and the picker/date/time `onChange` handlers no longer need the
   `interacted`-tracking wrappers they'd gained — reverted to plain `setPickerValue`/`setDate`/
   `setStartTime`/`setEndTime` passed directly.
2. **Date and Time popovers overflowed the bottom of the viewport** when their trigger sat low on
   the page (e.g. the modal's Date/Start Time/End Time row on a shorter viewport) — every popover in
   this feature area anchored purely below the trigger (`top: r.bottom + 4`) with no
   viewport-boundary awareness. Added a new shared `_use-popover-position.ts` hook
   (`usePopoverPosition`) that measures the panel's actual rendered height (via a
   `requestAnimationFrame` re-measure pass, since the panel isn't mounted yet on the first
   positioning pass) and flips to anchor *above* the trigger (`bottom: window.innerHeight - r.top +
   4`) when there isn't enough room below and there's more room above. Applied to all five portal
   popovers in this directory for consistency, not just the two reported (Date/Time): `_date-field-
   picker.tsx`, `_time-field-picker.tsx`, `_task-issue-picker.tsx`, `_time-period-inline-editor.tsx`,
   `_searchable-select.tsx` — each replaced its own local positioning `useState`/`useEffect` with a
   call to the shared hook, removing five more instances of duplicated positioning logic in the same
   pass.
3. **Inline Log Title reassignment from a General Log to a task/issue silently did nothing** (the
   reverse direction, task/issue -> General Log, worked). Root cause: `_time-logs-table.tsx`'s
   `LogTitleEditor` wraps `TaskIssuePicker` with its own outside-click-to-cancel listener, checking
   `containerRef.current.contains(e.target)`. `TaskIssuePicker`'s own dropdown panel is portaled to
   `document.body` — outside `containerRef`'s DOM subtree even while the panel is visually positioned
   right below the field. Clicking a task/issue row inside that panel fires a `mousedown` that
   `LogTitleEditor`'s listener misread as "outside," calling `onCancel()` (unmounting the whole
   inline editor) *before* the row's own `onClick` — the actual pick — could fire on the subsequent
   `click` event. This only broke the general-\>task/issue path because every interaction on the
   task-\>general path (the "Enter General Log" link, the textarea, the Save/Cancel buttons) lives
   directly inside `containerRef`, never inside a portaled panel. Fixed by exporting a
   `POPOVER_ROOT_ATTR` marker (`data-popover-root`) from the new `_use-popover-position.ts`, adding it
   to all five popover panels' root elements (same pass as fix #2), and updating `LogTitleEditor`'s
   outside-click check to also treat `e.target.closest("[data-popover-root]")` as "inside." This is a
   general-purpose fix — any future component in this directory that wraps one of these popovers with
   its own outside-click logic gets the same protection for free.

Verified with `npx tsc --noEmit` and `pnpm lint` after each fix — all clean (same 2 pre-existing,
unrelated warnings in `_checklist-tab.tsx`; one new hard `react-hooks/set-state-in-effect` error
surfaced in the new `_use-popover-position.ts` hook's early-return branch and was fixed immediately,
same pattern as the rest of this feature area's set-state-in-effect workarounds).
