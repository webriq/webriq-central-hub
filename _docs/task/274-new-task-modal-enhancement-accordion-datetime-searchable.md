# 274: New Task Modal Enhancement — Wider Layout, Collapsible Accordions, Combined Date/Time Picker, Searchable Milestone/Tasklist/Assignee

**Created:** 2026-08-19
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Completed (2026-08-19)

---

## Overview

The New Task modal (`CreateTaskModal`, currently defined inline inside `_project-detail.tsx:871-1169`, a 1376-line file already well past this repo's file-length guideline — see `nextjs-file-length-best-practices.md`) gets a structural and visual overhaul: a wider dialog, its fields regrouped into three collapsible sections, Milestone hidden-by-default behind a checkbox, Milestone/Tasklist/Assignee made searchable, and the plain `start_date`/`due_date` inputs replaced by a single combined date-and-time field per requirement 7.

This task extracts `CreateTaskModal` into its own file as part of the redesign (both because the component is growing substantially with new sub-sections, and because it satisfies the file-length guidance the user explicitly pointed to) and adds four new page-scoped supporting files, all under `src/app/(hub)/projects/[projectId]/` (same "page-scoped, not shared across unrelated feature areas" convention this codebase already follows — see `_attachment-upload-zone.tsx` from task 270, and the `dashboard/timelogs/` directory's own explicit precedent of not reaching into other feature areas' popover/select components).

**Two existing components resolve requirement 7's design, once found by research — this is not a from-scratch design:**
- `src/app/(hub)/dashboard/timelogs/_date-field-picker.tsx` + `_time-field-picker.tsx` — these render **exactly** what Image #8 (calendar with navy day-pills and a "Today" link) and Image #9 (Hour / Minute / Period tile grid) show. This is the "Time Logs > Add Time Log dialog" the user pointed to. Confirmed by inspecting `_time-log-entry-modal.tsx`: today, Time Logs uses **three separate** trigger buttons/popovers (Date, Start Time, End Time) — this is exactly the "separate field" structure the user wants replaced.
- `src/app/(hub)/portfolio-tracker/new/_date-time-picker.tsx` — a **different, already-shipped** component (New Project wizard's "Scheduled Start" field, task 251) that already solves the "one connected field, one popover, calendar + time side-by-side" structure the user is asking for — just with a plainer calendar theme and native `<select>` hour/minute dropdowns instead of the Time Logs tile-grid look.

Requirement 7 is read as: **take `_date-time-picker.tsx`'s structure (single trigger, single popover, calendar + time panel side-by-side) and re-skin it with the Time Logs visual system (`DayPanel`'s navy-pill calendar + `HourMinuteAmPmGrid`'s tile picker).** This produces one new field type — a `DateTimeFieldPicker` — used twice (Start, Due), each backed by a single trigger button and one popover containing both pickers together.

**Schema finding that shapes the plan:** `tasks.start_date` / `tasks.due_date` are Postgres `date` columns (migration `025_v2_schema.sql:200`, `035_zoho_decommission_schema.sql:44`) — date-only, no time-of-day — and are read by many other consumers (List/Board/Calendar views, `_milestone-swimlane.tsx`, exports, Gantt-style timeline code). Changing their column type to a timestamp is a large, unscoped blast-radius change this task does not make. Instead, this task adds two **new, nullable, additive** columns — `start_time time`, `due_time time` — plus one more new column, `notes text`, for requirement 2's new RTE field (no existing column holds this). The new `DateTimeFieldPicker`'s single combined value is split into `{date, time}` at submit time: the date half still goes to the untouched `start_date`/`due_date` columns, the time half goes to the two new columns. Nothing that reads `start_date`/`due_date` today changes behavior; the new columns are simply not read by anything but this modal until a future task wires them into Task Detail/other views (explicitly out of scope here).

---

## Requirements

### 1. Widen the New Task dialog

- [ ] `_create-task-modal.tsx`'s outer card: `max-w-lg` (512px) → `max-w-2xl` (672px). Enough room for the new full-width Milestone/Tasklist fields and the two-panel `DateTimeFieldPicker` popover (~480px) without the popover overflowing the card.

### 2. Group Status, Priority, Start Date/Time, Due Date/Time, Assignee, Notes into a "Task Information" collapsible accordion

- [ ] Use the existing `AccordionCard` (`_accordion-card.tsx`, already built for exactly this in task 257/270 — no new accordion primitive needed).
- [ ] Field order inside, matching the order the user listed: Status, Priority, Start (datetime), Due (datetime), Assignee, Notes.
  - Status + Priority: existing 2-col grid, unchanged fields/logic.
  - Start + Due: 2-col grid, each cell a `DateTimeFieldPicker` (replaces the two `<input type="date">`s).
  - Assignee: full-width `SearchableSelect` (was previously paired with Task list in a 2-col grid — Task list moves out per Requirement 5, so Assignee now sits alone).
  - Notes: new full-width RTE field, **reusing `TaskDescriptionEditor`** as-is (its props are already generic — `{projectId, value, onChange}` — nothing in it is Description-specific despite the name/doc-comment). Render a second instance with independent `notes` state; no new editor component needed.
- [ ] `defaultOpen={true}` — Start/Due/Status are effectively required at submit time (existing validation: `if (!startDate)`/`if (!dueDate)` block submit), so this section must be visible without an extra click.

### 3. Make Description, Attachments, and Task Information collapsible/expandable

- [ ] Wrap each of the three sections in its own `AccordionCard`.
- [ ] `Description`: `defaultOpen={true}` (primary content).
- [ ] `Attachments`: `defaultOpen={false}` (optional, matches its existing "(optional)" label).
- [ ] `Task Information`: `defaultOpen={true}` (Requirement 2's reasoning — contains required fields).

### 4. Default-hide Milestone behind a checkbox; move below Attachments, full width

- [ ] New state: `assignMilestone` (boolean), default `false` — **except** default `true` when `defaults.milestone_id` is already set (the `TaskDefaults` type already carries an optional `milestone_id`, for a future "add task from within a milestone" entry point; no current caller passes it, but the field exists and should not silently break if one starts to).
- [ ] Checkbox label: "Assign to a specific milestone". Unchecked → `milestoneId` stays `""` (no milestone) and the select is not rendered at all (not just disabled — matches "default hide").
- [ ] Checked → reveals a full-width `SearchableSelect` for Milestone, placed as its own block directly below the Attachments `AccordionCard`, outside any accordion (a standalone section, not nested inside Task Information — the user's requirement list for Task Information's contents does not include Milestone).

### 5. Move Tasklist below Milestone, full width

- [ ] Tasklist is **not** checkbox-gated (only Milestone gets that treatment per Requirement 4's wording) — it stays always-visible, since every task needs a tasklist today (existing default: `tasklists.find(tl => tl.is_default)?.id`).
- [ ] Full-width `SearchableSelect`, positioned directly below the Milestone block.
- [ ] Preserve the existing inline "create new tasklist" flow (`creatingTasklist`/`newTasklistName` state, POST to `/api/v2/projects/[projectId]/tasklists` on submit) exactly as it works today — see Requirement 6 for how this survives the switch to a searchable component.

### 6. Make Milestone, Tasklist, and Assignee searchable

- [ ] New page-scoped `SearchableSelect` component (`_searchable-select.tsx`), adapted from `dashboard/timelogs/_searchable-select.tsx`'s interaction pattern (search input, portal-positioned option list, outside-click/Escape close) but **restyled** to match this modal's plain form-field look (`inputClass`: `rounded-[10px] border-[#E2E7F2] bg-[#F4F6FB]`) rather than the Time Logs toolbar's pill-button trigger style — the Time Logs one is a filter pill (`rounded-full`, `label: value` format); this modal's other fields are all boxy form inputs, and Milestone/Tasklist/Assignee should look consistent with Title/Status/Priority, not like a different control type.
- [ ] Not reused cross-directory from `dashboard/timelogs/` — same reasoning that directory's own code comments already give for not reaching into other feature areas' components (task 226/228 precedent).
- [ ] Milestone: options = `milestones.map(m => ({value: m.id, label: m.name}))`, placeholder "Select milestone…".
- [ ] Tasklist: options = `tasklists.map(tl => ({value: tl.id, label: tl.name}))`, placeholder "No task list". Add a `footerAction` prop to `SearchableSelect` (`{label: string; onClick: () => void}`, rendered as a pinned row below the option list, distinct from a regular option) — Tasklist passes `{label: "+ Create new list…", onClick: () => setCreatingTasklist(true)}`. When `creatingTasklist` is true, render the existing inline name-input UI in place of the `SearchableSelect` (unchanged from today's `<select>`-based version — same swap, just a different search component underneath).
- [ ] Assignee: options = `developers.map(m => ({value: m.id, label: m.full_name ?? "Unknown"}))`, placeholder "Unassigned".
- [ ] New page-scoped `_use-popover-position.ts` (near-identical duplicate of `dashboard/timelogs/_use-popover-position.ts` — generic `getBoundingClientRect`-based flip-to-fit positioning with no page-specific logic, but per this codebase's established convention this is duplicated per feature area rather than promoted to a shared `src/hooks/` location; see that file's own doc comment, written as "shared for every floating panel in this feature area," implying feature-area scope, not app-wide). Both `SearchableSelect` and `DateTimeFieldPicker` (Requirement 7) use it.

### 7. Combine Start/Due Date and Time into one connected field each

- [ ] New `_datetime-field-picker.tsx` — `DateTimeFieldPicker({ value, onChange, disabled? })`. `value`/`onChange` use the same local `"YYYY-MM-DDTHH:mm"` string shape `_date-time-picker.tsx` already uses (not UTC, not a Date object — avoids timezone round-trip bugs when splitting into date/time at submit).
- [ ] Single trigger button: icon + formatted label (e.g. `Aug 19, 2026, 9:00 AM`), same trigger chrome as the modal's other inputs (`inputClass`-derived, matching `_date-field-picker.tsx`'s `inputTriggerClass` shape).
- [ ] One popover (portaled via `createPortal` + the new `usePopoverPosition`, **not** `_date-time-picker.tsx`'s plain `absolute` positioning — that component works because it's used in a scrolling page, not a clipped modal; this modal has `overflow-hidden`/`overflow-y-auto` ancestors, the same reason `_date-field-picker.tsx`'s own doc comment gives for needing a portal: *"a plain absolute popover would clip against this ... modal card"*). Fixed width (`~480px`) to fit calendar + time panel side-by-side without depending on trigger width.
- [ ] Left side: calendar, using `DayPanel`'s exact visual system (`react-day-picker`, `mode="single"`, navy `#071133` selected pill, `#007BFF` today/hover, "Today" quick-link below the grid) — copied into the new file (not imported cross-directory), since `DayPanel` itself isn't exported for reuse and lives in a differently-scoped file.
- [ ] Right side: time panel, using `HourMinuteAmPmGrid`'s exact tile-grid pattern (Hour 1–12 tiles, Minute quick-picks 0/15/30/45 + exact-minute number input, AM/PM toggle tiles) — also copied in, same reasoning.
- [ ] No `min`/`max` date restriction — the existing plain `<input type="date">` had none, and nothing in this request asks for one (unlike `_date-time-picker.tsx`'s bounded `min`/`max` for its wizard-validation use case, or Time Logs' "no future dates" cap). Out of scope; do not add it as a side effect of reusing these two reference components' code.
- [ ] Picking a day or a time tile updates the combined value live (matches `HourMinuteAmPmGrid`'s existing "every tile commits immediately" behavior) — no separate "Apply"/"Done" step, consistent with `_date-field-picker.tsx`'s single-value "pick and close" for the day, while the time tiles stay editable without re-closing (mirrors `TimeFieldPicker`'s own comment: *"closing on the first tile click would force re-opening for the rest"*).

### 8. Persist the new `start_time` / `due_time` / `notes` fields

- [ ] New migration `supabase/migrations/110_tasks_time_notes_columns.sql`:
  ```sql
  alter table public.tasks
    add column start_time time,
    add column due_time time,
    add column notes text;
  ```
  Additive, nullable, no default, no backfill — zero impact on any existing reader of `tasks.*`.
- [ ] `src/types/database.ts` — add `start_time: string | null`, `due_time: string | null`, `notes: string | null` to the `tasks` table's `Row`, `Insert`, and `Update` shapes (mirrors how `due_date`/`start_date` are already typed as `string | null`).
- [ ] `src/app/api/v2/projects/[projectId]/tasks/route.ts` POST handler — accept `body.start_time`, `body.due_time`, `body.notes` and pass through to `.insert({...})` (`|| null`, same pattern every other optional field already uses). No new required-field validation — these are optional exactly like `description`/`labels` are today, even though the *date* halves (`start_date`/`due_date`) stay required as they already are.

---

## Out of Scope / Must-Not-Change

- **`CreateIssueModal`** (same file, `_project-detail.tsx:1175-1376`) — not touched. The user's request is scoped to "New Task modal" only; the Issue modal keeps its current layout, plain `<select>`s, and native date input. It still needs `STATUS_OPTS` from `_project-detail.tsx`, which stays exported from there.
- **No further splitting of `_project-detail.tsx` beyond extracting `CreateTaskModal`.** The file drops from ~1376 to ~1075 lines after removal — still above the file-length guideline, but that's a pre-existing condition; a full refactor of Board/List/Calendar view wiring is a much larger, unrequested change.
- **No new validation that Due ≥ Start.** The current code has never validated this relationship for dates; this task does not add it as an incidental side effect of adding time-of-day, even though a same-day Due-before-Start combination is now visibly possible in the picker's minute-level granularity.
- **`start_time`/`due_time`/`notes` are write-only from this modal in this task.** They are not surfaced anywhere else yet — not Task Detail, not List/Board/Calendar views, not exports. A future task can read/display them; this one only adds the columns and the New Task modal's write path.
- **No changes to `getTaskEditPermission`, RLS, or any other migration.**
- **`dashboard/timelogs/*` and `portfolio-tracker/new/_date-time-picker.tsx` are read-only references.** Nothing in those files is imported, modified, or reused at runtime by this task — their patterns are copied into new, page-scoped files under `[projectId]/`, per this codebase's established per-feature-area duplication convention.
- **Assignee stays single-select** (`assigneeId: string`, sent as `assignees: [assigneeId]`) — the DB column `assignees` is an array, but the modal's single-assignee UX is pre-existing and not part of this request.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/110_tasks_time_notes_columns.sql` | Create | Additive nullable `start_time`, `due_time`, `notes` columns on `tasks` |
| `src/types/database.ts` | Modify | Add the three new columns to `tasks` Row/Insert/Update |
| `src/app/api/v2/projects/[projectId]/tasks/route.ts` | Modify | POST accepts/persists `start_time`, `due_time`, `notes` |
| `src/app/(hub)/projects/[projectId]/_use-popover-position.ts` | Create | Page-scoped duplicate of the generic portal-popover positioning hook |
| `src/app/(hub)/projects/[projectId]/_searchable-select.tsx` | Create | Page-scoped searchable dropdown, form-field styled |
| `src/app/(hub)/projects/[projectId]/_datetime-field-picker.tsx` | Create | Combined single-trigger Date+Time popover field |
| `src/app/(hub)/projects/[projectId]/_create-task-modal.tsx` | Create | Extracted + redesigned `CreateTaskModal` |
| `src/app/(hub)/projects/[projectId]/_project-detail.tsx` | Modify | Remove inline `CreateTaskModal`; import from new file; export `STATUS_OPTS`, `PRIORITY_OPTS`, `MemberOptionWithRole` for cross-file reuse |

## Code Context

### `_project-detail.tsx:869-990` — current `CreateTaskModal` state/submit (logic to preserve, relocate to the new file)

```tsx
type MemberOptionWithRole = { id: string; full_name: string | null; avatar_url: string | null; role: string };

function CreateTaskModal({ projectId, milestones, tasklists, allMembers, defaults, onClose, onCreated, onTasklistCreated }: {...}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<TaskStatus>(defaults.status ?? "open");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [milestoneId, setMilestoneId] = useState<string>(defaults.milestone_id ?? "");
  const [startDate, setStartDate] = useState<string>("");
  const [dueDate, setDueDate] = useState<string>(defaults.due_date ?? "");
  const [tasklistId, setTasklistId] = useState<string>(() => tasklists.find((tl) => tl.is_default)?.id ?? "");
  const [creatingTasklist, setCreatingTasklist] = useState(false);
  const [newTasklistName, setNewTasklistName] = useState("");
  const [assigneeId, setAssigneeId] = useState<string>("");
  const [attachmentFiles, setAttachmentFiles] = useState<File[]>([]);
  // ...saving/error/upload-queue state (task 273) — unchanged, keep as-is
  const developers = allMembers.filter((m) => m.role === "developer");

  async function submit() {
    if (!title.trim()) { setError("Title is required"); return; }
    if (!startDate) { setError("Start date is required"); return; }
    if (!dueDate) { setError("Due date is required"); return; }
    // ...creates tasklist inline if needed, then POSTs to /tasks
  }
}
```

`startDate`/`dueDate` become the *date half* of two new combined-value states, e.g. `startValue`/`dueValue` (`"YYYY-MM-DDTHH:mm"`, driving the new `DateTimeFieldPicker`s), split at submit time into `{start_date, start_time}`/`{due_date, due_time}` for the POST body. Everything else in `submit()` is unchanged, plus three new fields in the request body: `start_time`, `due_time`, `notes`.

### `_time-period-panels.tsx:96-133` — `DayPanel`, the calendar visual reference for Requirement 7 (copy the pattern, not the import — file is page-scoped to `dashboard/timelogs/`)

```tsx
export function DayPanel({ draft, onChange, actions, disabled }: {...}) {
  const [month, setMonth] = useState(draft);
  function goToday() { const now = new Date(); onChange(now); setMonth(now); }
  return (
    <div>
      <DayPicker
        mode="single" required selected={draft} onSelect={(d) => d && onChange(d)}
        month={month} onMonthChange={setMonth} showOutsideDays navLayout="around"
        disabled={disabled} classNames={calendarClassNames} components={{ DayButton: makeDayButton() }}
      />
      <QuickLinkRow label="Today" onClick={goToday} actions={actions} />
    </div>
  );
}
```
`calendarClassNames`/`dayButtonClass`/`makeDayButton` (same file, lines 23-81) are the exact navy-pill/today/outside-day styling to copy.

### `_time-field-picker.tsx:96-178` — `HourMinuteAmPmGrid`, the time-tile visual reference for Requirement 7

```tsx
export function HourMinuteAmPmGrid({ draft, onChange, maxTime }: {...}) {
  // Hour 1-12 tile grid, Minute 0/15/30/45 quick-picks + exact-minute number input, AM/PM tiles
  // — see full file for `Tile`, `to24Minutes`, `parseValue`/`draftTo24` helpers to copy.
}
```

### `portfolio-tracker/new/_date-time-picker.tsx:98-131` — the "one connected field" structural reference for Requirement 7

```tsx
<div className="relative">
  <button ref={triggerRef} onClick={() => !disabled && setOpen((o) => !o)} className={cn(...)}>
    <CalendarClock size={15} />
    {selectedDate ? selectedDate.toLocaleString(...) : <span>Pick a date &amp; time</span>}
  </button>
  {open && !disabled && (
    <div ref={panelRef} className={cn("absolute ... flex overflow-hidden rounded-xl ...", ...)}>
      <DayPicker mode="single" selected={selectedDate} onSelect={handleDaySelect} disabled={{before: min, after: max}} ... />
      <div className="flex w-[168px] flex-col gap-3 border-l border-[#EDF0F7] p-3.5">
        {/* Hour/Minute <select>s + AM/PM toggle — Requirement 7 replaces this inner panel with HourMinuteAmPmGrid's tile UI */}
      </div>
    </div>
  )}
</div>
```
Note this component's `absolute`-positioned popover (no portal) works because it's used on a scrolling page. `DateTimeFieldPicker` must use the portal + `usePopoverPosition` approach instead (see `_date-field-picker.tsx`'s doc comment on why the modal context requires it).

### `_use-popover-position.ts` — full file to duplicate (copy nearly verbatim into the new page-scoped location; already read/quoted, ~60 lines)

### `dashboard/timelogs/_searchable-select.tsx` — interaction pattern to adapt (search input, portal option list, outside-click close); restyle the trigger from pill (`rounded-full`, `label: value`) to boxy form-input chrome (`rounded-[10px]`, `inputClass`-derived) for this modal's context, and add the new `footerAction` prop for Tasklist's "+ Create new list…".

### `src/app/api/v2/projects/[projectId]/tasks/route.ts:63-79` — POST insert body to extend

```ts
const { data, error } = await supabase
  .from("tasks")
  .insert({
    project_id: project.id,
    title: body.title.trim(),
    description: body.description?.trim() || null,
    status: body.status || "backlog",
    priority: body.priority || "normal",
    milestone_id: body.milestone_id || null,
    tasklist_id: body.tasklist_id || null,
    start_date: body.start_date,
    due_date: body.due_date,
    assignees: Array.isArray(body.assignees) ? body.assignees : null,
    labels: Array.isArray(body.labels) ? body.labels : null,
    position: typeof body.position === "number" ? body.position : Date.now(),
    created_by: user.id,
    // + start_time: body.start_time || null,
    // + due_time: body.due_time || null,
    // + notes: body.notes?.trim() || null,
  })
```

---

## Implementation Steps

1. Write migration `110_tasks_time_notes_columns.sql`; update `src/types/database.ts`'s `tasks` Row/Insert/Update.
2. Extend the POST `/tasks` route to accept/persist `start_time`, `due_time`, `notes`.
3. Create `_use-popover-position.ts` (page-scoped duplicate).
4. Create `_searchable-select.tsx` (form-field-styled, with `footerAction` support).
5. Create `_datetime-field-picker.tsx` (calendar + time-tile popover, single combined value).
6. Create `_create-task-modal.tsx`: move `CreateTaskModal` out of `_project-detail.tsx`, apply the wider dialog, three `AccordionCard` sections, checkbox-gated Milestone + full-width Milestone/Tasklist below Attachments, `SearchableSelect` for Milestone/Tasklist/Assignee, `DateTimeFieldPicker` for Start/Due, new Notes RTE via a second `TaskDescriptionEditor` instance, and the extended submit payload.
7. Update `_project-detail.tsx`: delete the old inline `CreateTaskModal`, export `STATUS_OPTS`/`PRIORITY_OPTS`/`MemberOptionWithRole`, import `CreateTaskModal` from the new file.
8. `npx tsc --noEmit` and `pnpm lint`.
9. Browser-verify (see Verification below).

## Acceptance Criteria

- [ ] New Task dialog renders at the wider `max-w-2xl` width.
- [ ] Description, Attachments, and Task Information each render as an independently collapsible `AccordionCard`; Description and Task Information default open, Attachments defaults closed.
- [ ] Task Information (when open) shows, in order: Status, Priority, Start (combined date+time field), Due (combined date+time field), Assignee, Notes (RTE).
- [ ] Milestone is hidden by default; a checkbox reveals a full-width searchable Milestone field directly below the Attachments section; unchecking hides it again and clears the selection.
- [ ] Tasklist renders full-width directly below Milestone, always visible, searchable, and its "+ Create new list…" inline-create flow still works exactly as before.
- [ ] Milestone, Tasklist, and Assignee are all searchable (typing filters the option list) and visually match the modal's boxy form-field style, not a pill/filter-button style.
- [ ] Start and Due each render as a single trigger button; clicking opens one popover containing both a calendar (Time-Logs-style navy pills + "Today" link) and a time tile grid (Hour/Minute/Period) side-by-side; picking either updates the trigger's combined label live.
- [ ] Start defaults to the current date and time on modal open; Due defaults to the current date (or `defaults.due_date` if the modal was opened with one) with time fixed to 7:00 PM.
- [ ] Submitting a task persists `start_date`/`due_date` (unchanged columns) plus the new `start_time`/`due_time`/`notes` values; a task created via Board's "add in column" or Calendar's "add on day" flows still correctly pre-fills Status/Due as before.
- [ ] `CreateIssueModal` is visually and behaviorally unchanged.
- [ ] `npx tsc --noEmit` and `pnpm lint` both clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
```

Browser: open a project's Tasks tab, click "New Task". Confirm the wider dialog, collapse/expand all three accordions, check the Milestone checkbox and confirm the field appears full-width and is searchable, confirm Tasklist below it is searchable and its "create new" flow still works, confirm Assignee is searchable, open both the Start and Due combined pickers and confirm the calendar+time-grid popover, confirm Start pre-fills to now and Due pre-fills to 7:00 PM today, fill in a title and submit, and confirm the created task's dates/notes look right (via a follow-up Task Detail view or direct Supabase check, since this task does not add UI to display `start_time`/`due_time`/`notes` elsewhere). Also open the Board view's "add in column" and Calendar view's "add on day" entry points to confirm their `defaults` (status / due date) still pre-fill correctly through the new layout. Spot-check "New Issue" to confirm no regression there.

## Compatibility Touchpoints

- New `tasks.start_time`/`due_time`/`notes` columns are additive/nullable — zero impact on any existing `select("*")` consumer (List/Board/Calendar views, exports, Gantt/swimlane code) until a future task chooses to read them.
- `_searchable-select.tsx`, `_use-popover-position.ts`, and `_datetime-field-picker.tsx` are new, generically-named `[projectId]/`-level files — deliberately reusable elsewhere in the Projects feature area later (e.g. Task Detail's own Assignee/Milestone edit controls, if a future task wants them searchable too), without relocation, mirroring the `_attachment-upload-zone.tsx` precedent from task 270. Not wired into any other page in this task.
- No change to `_project-detail.tsx`'s public props/exports other than the three new named exports (`STATUS_OPTS`, `PRIORITY_OPTS`, `MemberOptionWithRole`) needed by the extracted modal file.

---

## Implementation Notes

### What Changed

Implemented all 8 requirements exactly as scoped. `CreateTaskModal` extracted from `_project-detail.tsx` into a new `_create-task-modal.tsx`, redesigned with the wider dialog, three independently collapsible `AccordionCard` sections, checkbox-gated full-width Milestone + always-visible full-width Tasklist below Attachments, a new page-scoped `SearchableSelect` for Milestone/Tasklist/Assignee, and a new `DateTimeFieldPicker` combining calendar + time-tile popover into one field for Start/Due. Two new supporting files (`_use-popover-position.ts`, `_searchable-select.tsx`, `_datetime-field-picker.tsx`) synthesize the two reference patterns identified during planning (Time Logs' `DayPanel`/`HourMinuteAmPmGrid` visual system + the New Project wizard's `_date-time-picker.tsx` structural pattern) rather than reusing either directly, per this codebase's per-feature-area duplication convention.

Live-verified in-browser (Chrome, RCB & Associates project, real seeded data): wider dialog, all three accordions toggling independently with correct default states, Milestone checkbox reveal/hide (including a `defaults.due_date`-independent clear-on-uncheck), Tasklist search + "+ Create new list…" swap-to-inline-input flow (and its cancel-back-to-select path), Assignee search-and-filter, the combined Start/Due picker's live day/hour/minute/period selection and "Today" quick-link (verified via zoomed screenshot after an initial JPEG-compression misread), correct Start-defaults-to-now / Due-defaults-to-7PM-today behavior, Board view's "add in column" Status prefill, Calendar view's "add on day" Due-date prefill (date portion honored, time still defaults to 7:00 PM), and a byte-for-byte-unchanged New Issue modal (no regression).

**Not yet live-verified: an actual successful task creation.** Submitting hit `Could not find the 'due_time' column of 'tasks' in the schema cache` — expected and predicted in the task doc itself (Overview, "Schema finding" paragraph): migration `110_tasks_time_notes_columns.sql` has not been applied to the live database. Per this repo's established precedent (task 263's Implementation Notes: "Migration not applied to the live database — Minor, expected. Correctly deferred per the 'hard-to-reverse, external-system action' safety policy"), the migration was not run by the agent. **The user must run `npx supabase db push` (or apply the migration through their normal Supabase workflow) before the New Task modal can successfully create a task** — until then, submission fails cleanly with an inline error (confirmed: no partial insert, matches the existing error-handling pattern) rather than silently succeeding with data loss.

### Files Changed

- `supabase/migrations/110_tasks_time_notes_columns.sql` — new migration, additive nullable `start_time time`, `due_time time`, `notes text` on `tasks` (not yet applied to the live DB — see above)
- `src/types/database.ts` — added `start_time`/`due_time`/`notes` to `tasks` Row/Insert/Update
- `src/app/api/v2/projects/[projectId]/tasks/route.ts` — POST now accepts/persists `start_time`, `due_time`, `notes`
- `src/app/(hub)/projects/[projectId]/_use-popover-position.ts` — new, page-scoped duplicate of the generic portal-popover positioning hook
- `src/app/(hub)/projects/[projectId]/_searchable-select.tsx` — new, form-field-styled searchable dropdown with `footerAction` support
- `src/app/(hub)/projects/[projectId]/_datetime-field-picker.tsx` — new, combined single-trigger Date+Time popover field
- `src/app/(hub)/projects/[projectId]/_create-task-modal.tsx` — new, extracted + redesigned `CreateTaskModal`
- `src/app/(hub)/projects/[projectId]/_project-detail.tsx` — removed the inline `CreateTaskModal` definition (~300 lines), exported `STATUS_OPTS`/`PRIORITY_OPTS`/`MemberOptionWithRole`, imported `CreateTaskModal` from the new file, dropped the now-unused `TaskDescriptionEditor` import (only `CreateTaskModal` used it; `CreateIssueModal` uses a plain `<textarea>`)

### Deviations From Plan

None. All 8 requirements, the file-split plan, and the schema decision (additive `start_time`/`due_time`/`notes` columns rather than altering `start_date`/`due_date`) were implemented exactly as the approved doc specified.

### Verification Run

- `npx tsc --noEmit` — PASS (clean, zero output)
- `pnpm lint` — PASS (2 pre-existing warnings in `_checklist-tab.tsx`, unrelated to this task — same warnings task 270 also flagged as pre-existing)
- Browser (Chrome, real seeded dev data, RCB & Associates project) — PASS on every UI acceptance criterion; task creation itself blocked pending the migration (see above)

---

## Quality Gate Notes

### Result
PASS

### Standards Review
- Isolated task 274's diff from the working tree's other pending, uncommitted task (273, already completed but not yet committed) via `git diff` on each individual changed file — confirmed `database.ts`, the POST `/tasks` route, and every new file contain only this task's changes, and the `_project-detail.tsx` diff's `CreateTaskModal`-removal/export-addition hunks are cleanly separable from 273's unrelated `CreateIssueModal` upload-queue hunks in the same file.
- No unused code, dead code, or commented-out implementation in any of the five changed/new files. `pnpm lint` confirms zero new warnings (the two pre-existing `_checklist-tab.tsx` warnings are unrelated, already flagged as pre-existing by task 270).
- No `any` or untyped escape hatches — grepped all four new files for `: any`/`as any`/`console.`/`TODO`/`FIXME`, none found. Every new export is fully typed.
- No deep nesting; guard clauses used throughout (`if (!open) return`, `if (!d) return`, `if (disabled) return`).
- Each file keeps a single, clear responsibility: `_use-popover-position.ts` (positioning only), `_searchable-select.tsx` (dropdown UI only), `_datetime-field-picker.tsx` (the combined field only), `_create-task-modal.tsx` (modal orchestration only).
- Names describe behavior accurately (`DateTimeFieldPicker`, `SearchableSelect`, `toggleAssignMilestone`, `nowDateTimeValue`, `dueDefaultValue`).
- Date/time math reviewed specifically for the classic UTC-shift/off-by-one bug class: every date is built and read via local getters (`getFullYear()`/`getMonth()`/`getDate()`/`getHours()`/`getMinutes()`, `new Date(y, m-1, d)`), never `.toISOString()` or a UTC constructor — confirmed no timezone round-trip bug when the combined `YYYY-MM-DDTHH:mm` value is split into `start_date`/`start_time` (and `due_date`/`due_time`) at submit time.
- Errors handled intentionally: task/tasklist creation failures surface inline (unchanged from the pre-existing pattern); the DateTimeFieldPicker/SearchableSelect have no async paths to fail.
- No secrets, credentials, or debug logging introduced.
- File-length guideline (the user's own cited reference): `_create-task-modal.tsx` 362 lines, `_datetime-field-picker.tsx` 276, `_searchable-select.tsx` 157, `_use-popover-position.ts` 55 — all within or near the soft 250–300 line warning band for JSX-heavy components, well under the 400–500 hard limit. `_project-detail.tsx` dropped from 1376 to 1078 lines; still above the guideline but that's the explicitly accepted pre-existing condition the task doc's Out-of-Scope section already called out, not a regression from this task.

### Deviations
- **Minor — circular import between `_create-task-modal.tsx` and `_project-detail.tsx`.** `_project-detail.tsx` imports `CreateTaskModal` from `_create-task-modal.tsx`, which in turn imports `STATUS_OPTS`/`PRIORITY_OPTS`/`MemberOptionWithRole` back from `_project-detail.tsx`. This is a real module cycle, but it was an explicit, documented design decision in the approved task doc's Requirements (6) and Compatibility Touchpoints sections — not an oversight — and it works correctly in practice: neither module has a top-level side effect that depends on the cycle resolving first (the shared values are consts/types consumed only inside component bodies, not at module-eval time), confirmed by a clean `tsc --noEmit`, clean `pnpm lint`, and a live, error-free browser render/interaction pass. Not blocking; noted for awareness if a future refactor wants to hoist these three exports to a small shared module instead.
- **Minor — a ~4-line `pad2()`/local-date-formatting helper is duplicated** between `_create-task-modal.tsx` and `_datetime-field-picker.tsx` rather than shared. Matches this codebase's already-established precedent (e.g. the `ALLOWED_MIME_TYPES`/`MAX_FILE_SIZE` duplication task 270's own doc calls out as intentional) of accepting small utility duplication across page-scoped files over introducing a shared module for a few lines. Not blocking.

No deviation rises to Major — no requirement was violated, no scope was expanded, and no architecture changed without the approved doc's own explicit sign-off.

---

## Follow-Up Fix — UI/UX Round (post-Testing, user-reported)

User testing surfaced three real problems the quality-gate review's static analysis and the implementation stage's own browser pass had missed (the browser pass confirmed the fields were *reachable*, via `scroll_to`, but never exercised plain mouse-wheel scrolling the way a real user would):

1. **Fields genuinely unreachable (screenshot: content cut off right at "Assignee", no scrollbar).** Root cause: the modal's scrollable content `div` (`overflow-y-auto`, inside a `flex flex-col max-h-[90vh]` card) was missing `min-h-0`. A flex child's default `min-height: auto` refuses to shrink below its own content's intrinsic height, so once three collapsible sections plus the new Notes editor pushed the content taller than 90vh, the div itself never overflowed — it just grew past its container, and it was the *outer* card's `overflow-hidden` silently hard-clipping everything below ~90vh instead of the inner div scrolling. This is why mouse-wheel scroll did nothing: the div legitimately had nothing left to scroll on its own terms. **Fix:** added `min-h-0` to both scrollable content divs (the normal-editing view and the post-creation upload-progress view) in `_create-task-modal.tsx`.
2. **Boxed/padded accordion cards read as "boxes within boxes"** and didn't match the Zoho Projects reference the user pointed to (a flat chevron+bold-label header directly on the page background, no enclosing border/padding around the field group). **Fix:** new `_collapsible-section.tsx` (`CollapsibleSection`) — same expand/collapse mechanics as `AccordionCard` (chevron rotation, `framer-motion` height animation) but with no border, no background, no rounded card, and no content-padding box; only a `pt-3` gap under the header for breathing room. `AccordionCard` itself is untouched — Task/Issue Detail's boxed look was an intentional, separate design decision from tasks 257/270 and isn't part of this modal. Swapped all three `AccordionCard` usages (Description, Attachments, Task Information) to `CollapsibleSection` in `_create-task-modal.tsx`; removed the now-redundant inner `<div className="flex flex-col gap-4">` wrapper inside the old Task Information block since `CollapsibleSection`'s own content wrapper already provides that.
3. **The combined Start/Due date-time popover overflowed the viewport and clipped** (screenshot: the Hour column cut off at the right edge). Two compounding causes: (a) the popover's `usePopoverPosition` hook only flipped vertically, never clamped horizontally, so a wide popover anchored to a trigger near the right edge could run off-screen; (b) the popover panel was hard-set to `w-[460px]`, which is actually *narrower* than its own content's natural width (~475px: calendar side ~284px + `p-4` padding + time side `w-[190px]` + divider), so it was simultaneously overflowing the viewport on one side and cramping its own content on the other. **Fix:** added a horizontal clamp to `_use-popover-position.ts` (measures `panelRef.current?.offsetWidth` the same way vertical flip already measures `offsetHeight`, then clamps `left` so `left + panelWidth` never exceeds `window.innerWidth`, with an 8px margin on both edges) and removed the `w-[460px]` class from `_datetime-field-picker.tsx`'s popover so it sizes naturally from its children instead of fighting a too-small fixed width.

### Files Changed (this round)
- `src/app/(hub)/projects/[projectId]/_collapsible-section.tsx` — new, flat accordion primitive
- `src/app/(hub)/projects/[projectId]/_create-task-modal.tsx` — `min-h-0` on both scroll containers; `AccordionCard` → `CollapsibleSection` for all three sections; removed redundant inner wrapper div
- `src/app/(hub)/projects/[projectId]/_use-popover-position.ts` — added horizontal clamp to `place()`
- `src/app/(hub)/projects/[projectId]/_datetime-field-picker.tsx` — removed the undersized fixed `w-[460px]` popover width

### Verification
- `npx tsc --noEmit` — PASS (clean, zero output)
- `pnpm lint` — PASS (same 2 pre-existing, unrelated `_checklist-tab.tsx` warnings)
- **Not browser-verified this round** — the user explicitly asked not to run browser automation this round ("Do not run claude-in-chrome. I will do the checking on my own") and will verify directly.

### Completion Note

User verified the UI/UX fix round directly (scrolling/field-reachability, the flat Zoho-style collapsible sections, and the date/time popover no longer clipping) and closed the task as complete. This task's own migration (`supabase/migrations/110_tasks_time_notes_columns.sql`) was deliberately never applied to the live database by the agent, per this repo's "hard-to-reverse, external-system action" policy (same precedent as task 263) — the user is responsible for having run `npx supabase db push` (or their normal migration flow) before `start_time`/`due_time`/`notes` persist correctly; without it, task creation still fails cleanly with an inline schema-cache error rather than losing data silently, as confirmed during the implementation-stage browser pass.

---

## Follow-Up Fix #2 — Date/Time Popover Layout Gap (post-Completed, user-reported)

After the completion above, the user caught one more defect (screenshot): a large blank horizontal gap between the calendar and the time-tile panel inside the combined `DateTimeFieldPicker` popover, with the divider line and time panel visibly pushed far right of the calendar's actual content.

**Root cause:** a direct side effect of Follow-Up Fix round 1, item 3 — removing the popover's fixed `w-[460px]` (correct, since it was undersized) left the calendar-side wrapper `<div className="p-4">` with no explicit width. `react-day-picker`'s `month_caption` (`flex-1`) and `month_grid` (`basis-full`) classes resolve their percentage-based sizing against that wrapper's own width; once the wrapper itself became `auto`-width instead of bounded by the popover's old fixed total, that chain became width-indeterminate. Browsers computing the shrink-to-fit "preferred width" for the fixed-position popover in this situation can (and here, did) over-estimate the wrapper's needed width well past what the calendar visually renders at, leaving the excess as blank space before the time panel's divider.

**Fix:** gave the calendar-side wrapper an explicit `w-[284px]` (matches its true natural content: 7 day cells × 36px + `p-4`'s 16px×2 padding), and added `shrink-0` to both the calendar wrapper and the time panel (`w-[190px]`) so neither side can be flex-compressed if the horizontal-clamp positioning (Follow-Up Fix round 1, item 3) ever narrows the available space. This removes the sizing ambiguity entirely rather than reintroducing a fixed total width on the outer popover.

### Files Changed
- `src/app/(hub)/projects/[projectId]/_datetime-field-picker.tsx` — calendar wrapper: `w-[284px] shrink-0`; time panel: added `shrink-0`

### Verification
- `npx tsc --noEmit` — PASS (clean, zero output)
- `pnpm lint` — PASS (same 2 pre-existing, unrelated `_checklist-tab.tsx` warnings)
- **Not browser-verified by the agent** — user continues to verify UI/UX changes directly per their standing instruction not to run browser automation for this work.
