# 229: Time Logs — Searchable Project/Task Fields + Redesigned Date/Time Pickers in Add Time Log Form + Source/Type Column

**Created:** 2026-08-12
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

Follow-up to tasks 226/227/228 on the dedicated Time Logs page (`/v2/dashboard/timelogs`). Three changes, all scoped to the existing page — no new API routes, no schema changes:

1. **Add Time Log modal** (`_time-log-entry-modal.tsx`) — the Project and Task fields are native `<select>`s. Task 228 already built a searchable single-select combobox (`_searchable-select.tsx`) for this page's Project/User *filters*; reuse it here for the modal's Project and Task fields too, so long project/task lists are searchable instead of scroll-a-native-select.
2. **Same modal** — Date/Start Time/End Time are plain `<input type="date">` / `<input type="date">`/`<input type="time">`. Replace with a popover-based UI in the same visual language as the page's own date filter (`TimePeriodPicker` / `_time-period-panels.tsx`): a bordered trigger that opens a floating panel with a proper calendar for Date (literally reusing `DayPanel`) and a tile-based hour/minute/AM-PM picker for Start/End Time (new — the date filter has no time-of-day concept to reuse, so this is a new component built in the same visual system: navy `#071133` selected state, blue `#007BFF` hover/today, `rounded-[14px]`/`shadow-[0_8px_24px_rgba(7,17,51,0.10)]` popover chrome).
3. **Table** (`_time-logs-table.tsx`) — add a "Type" column showing whether each entry is `Manual` or `Timer` (the `source` field already flows through `/api/v2/time-logs` into `TimeLogEntry.source`, unused in this table today). Reuse the exact pill styling already shipped for this in the task-detail page's own Time Logs tab (`_task-time-logs.tsx` lines ~204-215).

## Requirements

- [ ] Add Time Log modal's Project field uses `SearchableSelect` (search box + option list), not a native `<select>`.
- [ ] Add Time Log modal's Task field uses `SearchableSelect` too, and correctly reflects its three states: disabled/empty before a project is picked, "Loading…" while tasks are being fetched, and the assignee-filtered task list once loaded (including the existing "You have no assigned tasks in this project." hint when the filtered list is empty).
- [ ] `SearchableSelect` gains an optional `disabled` prop (additive, default `false`/undefined) so the Task field can be disabled pre-project-selection/while loading — its two existing call sites (Project/User filters in `_time-logs-content.tsx`) are unaffected.
- [ ] Date field is a trigger button (calendar icon + formatted date, e.g. "Aug 12, 2026") that opens a popover containing `DayPanel` (imported from `_time-period-panels.tsx`, already exported) for single-date selection; picking a day applies it and closes the popover immediately (no separate OK/Cancel — there's only one value to set, unlike the multi-mode period filter).
- [ ] Start Time and End Time fields are trigger buttons (clock icon + formatted time, e.g. "09:30 AM") that open a popover with an Hour (1–12) tile grid, a Minute control that supports both quick picks (00/15/30/45) *and* exact minute entry (0–59) — manual time logs need exact clock times, this must not regress the precision the native `<input type="time">` already had — and an AM/PM two-tile toggle. Picking updates a draft time live in the popover; the popover closes on outside-click/Escape or an explicit "Done" action (do not auto-close on the first tile click — the user needs to set hour, minute, and AM/PM independently).
- [ ] Both new popovers are portaled to `document.body` and positioned from the trigger's bounding rect (same mechanism `_searchable-select.tsx` already uses: `createPortal` + `getBoundingClientRect` + scroll/resize listeners + outside-click/Escape-to-close) — **not** `TimePeriodPicker`'s simpler non-portal `absolute` popover, which relies on open space around the page toolbar that this 420px-wide modal doesn't have. A calendar or tile grid positioned via plain `absolute` inside the modal card would visually clip/overflow the card.
- [ ] The value contracts into `handleSave()`/`combineDateTime()` do not change: `date` stays a `"YYYY-MM-DD"` string, `startTime`/`endTime` stay `"HH:mm"` 24-hour strings. Only the input UI changes — no changes to `POST`/`PATCH` payload shape.
- [ ] `_time-logs-table.tsx` gets a new "Type" column between an existing pair of columns (suggest: after "Time Period", before "Notes" — or wherever reads best next to the existing columns) showing a `Manual`/`Timer` pill, using the same conditional classes as `_task-time-logs.tsx`'s existing pill (`bg-[#F4F6FB] text-[#5F6A88] border-[#E2E7F2]` for manual, `bg-[#E5F1FF] text-[#0063D6] border-[#CFE4FF]` for timer).
- [ ] The grouped-view header row's `colSpan={7}` in `_time-logs-table.tsx` is bumped to `colSpan={8}` to match the new column count.
- [ ] No new role gating is added for the Type column — `/api/v2/time-logs` already returns `source` unconditionally for every entry the caller can see, and callers who aren't in `VIEW_ALL_ROLES` already only ever receive their *own* entries from that route, so there's no new information exposure from displaying it.

## Out of Scope / Must-Not-Change

- No changes to `/api/v2/time-logs/route.ts` or `/api/v2/tasks/[taskId]/time-logs/route.ts` — `source` is already selected and returned; this is a display-only change.
- No changes to `_searchable-select.tsx`'s existing filter behavior/props beyond the additive `disabled` prop.
- No changes to `TimePeriodPicker`/`_time-period-panels.tsx` themselves — only imported from (`DayPanel`).
- Do not change the modal's Edit-mode behavior (Project/Task stay fixed and non-editable in edit mode, per the existing comment in `_time-log-entry-modal.tsx`) — only Add-mode's Project/Task fields and both modes' Date/Start Time/End Time fields are in scope.
- Do not touch the PDF export (`_export-pdf.ts`) or the page-level Project/User filter dropdowns beyond the shared `disabled` prop addition to `SearchableSelect`.
- Do not add a "type" filter to the toolbar — this task only adds the column, not a new filter control.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx` | Modify | Swap Project/Task `<select>`s for `SearchableSelect`; swap Date/Start/End `<input>`s for new `DateFieldPicker`/`TimeFieldPicker` |
| `src/app/v2/(hub)/dashboard/timelogs/_searchable-select.tsx` | Modify | Add optional `disabled` prop |
| `src/app/v2/(hub)/dashboard/timelogs/_date-field-picker.tsx` | Create | New trigger+popover date field wrapping `DayPanel` |
| `src/app/v2/(hub)/dashboard/timelogs/_time-field-picker.tsx` | Create | New trigger+popover time-of-day field (hour/minute/AM-PM) |
| `src/app/v2/(hub)/dashboard/timelogs/_time-logs-shared.ts` | Modify | Add a small `fromISODate(s: string): Date` helper (local-date parse counterpart to the existing `toISODate`) for `_date-field-picker.tsx` to consume |
| `src/app/v2/(hub)/dashboard/timelogs/_time-logs-table.tsx` | Modify | Add "Type" column (header + `EntryRow` cell), bump grouped-row `colSpan` |

## Code Context

### File: `src/app/v2/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx`

Current Project/Task fields (lines ~147-179) to replace with `SearchableSelect`:

```tsx
<select
  value={projectPublicId}
  onChange={(e) => setProjectPublicId(e.target.value)}
  className={`${inputClass} bg-white`}
>
  <option value="">Select project…</option>
  {projects.map((p) => (
    <option key={p.id} value={p.project_id}>{p.name}</option>
  ))}
</select>
```

`SearchableSelect`'s call convention (already used in `_time-logs-content.tsx`):

```tsx
<SearchableSelect
  value={projectFilter}
  onChange={setProjectFilter}
  options={projects.map((p) => ({ value: p.id, label: p.name }))}
  placeholder="All Projects"
  searchPlaceholder="Search projects…"
/>
```

Note the modal keys Project by `project_id` (public Zoho-style id, since `/api/v2/projects/${projectPublicId}/tasks` expects it), not `id` — keep that value semantics, only swap `options={projects.map((p) => ({ value: p.project_id, label: p.name }))}` and use a non-clearable placeholder like `"Select project…"`.

Current Date/Start/End block (lines ~181-194) to replace:

```tsx
<div className="flex-1">
  <label className="text-[11px] font-semibold text-[#0B1533] mb-1 block">Date</label>
  <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`${inputClass} bg-white`} />
</div>
<div className="flex-1">
  <label className="text-[11px] font-semibold text-[#0B1533] mb-1 block">Start Time</label>
  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className={`${inputClass} bg-white`} />
</div>
<div className="flex-1">
  <label className="text-[11px] font-semibold text-[#0B1533] mb-1 block">End Time</label>
  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className={`${inputClass} bg-white`} />
</div>
```

`date`/`startTime`/`endTime` state and `combineDateTime`/`toTimeInputValue` (top of file, unchanged) define the exact string formats the new components must produce.

### File: `src/app/v2/(hub)/dashboard/timelogs/_time-period-panels.tsx`

`DayPanel` is already exported and exactly what the Date field needs:

```tsx
export function DayPanel({ draft, onChange, actions }: { draft: Date; onChange: (d: Date) => void; actions: React.ReactNode }) {
  const [month, setMonth] = useState(draft);
  function goToday() { ... }
  return (
    <div>
      <DayPicker mode="single" required selected={draft} onSelect={(d) => d && onChange(d)}
        month={month} onMonthChange={setMonth} showWeekNumber ISOWeek
        classNames={calendarClassNames} components={{ DayButton: makeDayButton() }} />
      <QuickLinkRow label="Today" onClick={goToday} actions={actions} />
    </div>
  );
}
```

For a single-value form field (no draft/commit split needed), `_date-field-picker.tsx` should call `onChange` from `DayPanel`'s own `onChange` and close the popover in the same handler — `actions` can be an empty node or omitted-equivalent (`null`), since there's no OK/Cancel step.

### File: `src/app/v2/(hub)/dashboard/timelogs/_searchable-select.tsx`

Portal-positioning pattern to mirror for the two new picker components (trigger ref → `getBoundingClientRect()` → fixed-position portal panel, scroll/resize listeners, outside-click + Escape close):

```tsx
useEffect(() => {
  if (!open) return;
  function place() {
    const r = triggerRef.current?.getBoundingClientRect();
    if (!r) return;
    setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 200) });
  }
  place();
  window.addEventListener("scroll", place, true);
  window.addEventListener("resize", place);
  return () => { window.removeEventListener("scroll", place, true); window.removeEventListener("resize", place); };
}, [open]);
```

### File: `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-time-logs.tsx` (reference only, do not modify)

The exact Manual/Timer pill to replicate in `_time-logs-table.tsx`:

```tsx
<span
  className={cn(
    "text-[10px] font-semibold px-1.5 py-0.5 rounded-full border shrink-0 leading-none",
    entry.source === "manual"
      ? "bg-[#F4F6FB] text-[#5F6A88] border-[#E2E7F2]"
      : "bg-[#E5F1FF] text-[#0063D6] border-[#CFE4FF]"
  )}
>
  {entry.source === "manual" ? "Manual" : "Timer"}
</span>
```

### File: `src/app/v2/(hub)/dashboard/timelogs/_time-logs-table.tsx`

`TimeLogEntry.source` (`"timer" | "manual"`, from `_time-logs-shared.ts`) is already on every row object — no new fetch needed. Add a `<th>` to `TableHead` and a `<td>` to `EntryRow`, and bump the grouped section's `<td colSpan={7} ...>` (line ~173) to `colSpan={8}`.

## Implementation Steps

1. Add `disabled?: boolean` to `SearchableSelect`'s props; when true, the trigger button gets `disabled`/`opacity-50 cursor-not-allowed` and `toggleOpen()` becomes a no-op. Verify the two existing call sites in `_time-logs-content.tsx` still compile untouched (prop is optional).
2. In `_time-log-entry-modal.tsx`, replace the Project `<select>` with `SearchableSelect` (value = `projectPublicId`, options from `projects`, non-clearable "Select project…" placeholder — decide whether the leading placeholder row in `SearchableSelect`'s option list acts as a clear action here too; that's fine/consistent, just confirm it doesn't break the "tasks reset on project change" `useEffect`).
3. Replace the Task `<select>` with `SearchableSelect` (value = `taskId`, options from `tasks`, `disabled={!projectPublicId || loadingTasks}`, placeholder reflecting `loadingTasks ? "Loading…" : "Select task…"`). Keep the existing "no assigned tasks" hint paragraph below it, driven by the same `projectPublicId && !loadingTasks && tasks.length === 0` condition.
4. Add `fromISODate(s: string): Date` to `_time-logs-shared.ts`, parsing `"YYYY-MM-DD"` into a local-timezone `Date` (mirrors the existing `toISODate` comment's rationale — avoid `new Date(string)`'s UTC-shift behavior).
5. Build `_date-field-picker.tsx`: `DateFieldPicker({ value, onChange }: { value: string; onChange: (v: string) => void })`. Trigger styled as a bordered form field (reuse `_time-log-entry-modal.tsx`'s `inputClass` look, as a `<button type="button">` with a `Calendar` icon + formatted label via the existing `shortDate`-style formatting already in `_time-logs-shared.ts`/`periodLabel`, or a small local formatter). Popover: portal-positioned (per Code Context above), renders `DayPanel` with `draft={fromISODate(value)}`, `onChange={(d) => { onChange(toISODate(d)); close(); }}`, `actions={null}`.
6. Build `_time-field-picker.tsx`: `TimeFieldPicker({ value, onChange }: { value: string; onChange: (v: string) => void })` where `value`/`onChange` are `"HH:mm"` 24-hour strings (matching `toTimeInputValue`'s output format). Internally track hour (1-12), minute (0-59), and AM/PM as derived/draft state from the incoming `"HH:mm"`. Trigger shows formatted 12-hour label (e.g. "09:30 AM") with a `Clock` icon. Popover: hour tile grid (12 tiles), minute quick-picks (00/15/30/45) plus a bounded numeric input for exact minutes, AM/PM 2-tile toggle — every tile/input change updates the draft and calls `onChange` with the recomputed 24-hour `"HH:mm"` immediately (live, not deferred to a "Done" button) so the trigger label updates as you go; only closing (outside-click/Escape/an explicit close affordance) ends the interaction.
7. Wire both new components into `_time-log-entry-modal.tsx` in place of the three native inputs, keeping the existing `flex gap-2.5` three-column row layout and labels.
8. Add the "Type" column to `_time-logs-table.tsx`'s `TableHead` and `EntryRow`, and bump the grouped-row `colSpan` to `8`.
9. `npx tsc --noEmit` and `pnpm lint`; manually smoke-test the modal in a browser (open Add Time Log, search/select a project, confirm task list loads and is searchable, pick a date via the calendar popover, pick start/end times via the new time popovers including an exact non-quarter-hour minute, save, and confirm the entry appears correctly in the table with the right Type pill).

## Acceptance Criteria

- [ ] Add Time Log modal's Project and Task fields are searchable comboboxes, not native selects; Task field is disabled until a project is chosen and shows a loading state while fetching.
- [ ] Date field opens a calendar popover (reusing `DayPanel`) styled consistently with the page's own date filter; picking a day sets the field and closes the popover.
- [ ] Start Time and End Time fields open a tile-based hour/minute/AM-PM popover; an exact (non-quarter-hour) minute can still be entered, matching the precision the old native time input had.
- [ ] Both new popovers render via portal and do not visually clip inside the 420px modal card, at any trigger position in the three-column row.
- [ ] Saving a manual entry still produces the same POST/PATCH payload shape as before (`date_logged`, `start_time`, `end_time` ISO strings) — no behavior change to the save path itself.
- [ ] The Time Logs table shows a "Type" column with a `Manual`/`Timer` pill matching `_task-time-logs.tsx`'s existing styling, for both grouped and flat table modes.
- [ ] Grouped view's collapsible header row still spans the full row width with no leftover border/gap from the `colSpan` mismatch.
- [ ] `npx tsc --noEmit` and `pnpm lint` are clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manual browser check — see step 9 above
```

## Compatibility Touchpoints

- None — page-scoped UI change, no route/API/schema/packaging surface affected. `SearchableSelect`'s new `disabled` prop is additive and optional, so no other consumer needs updating.

## Implementation Notes

### What Changed
- Add Time Log modal's Project and Task fields now use `SearchableSelect` instead of native `<select>`s. Task field is disabled (and shows "Loading…") until a project is picked and its assigned-task list finishes fetching — same underlying `projectPublicId`/`taskId`/`tasks`/`loadingTasks` state and effects, only the rendering component changed.
- `SearchableSelect` gained an additive, optional `disabled` prop: the trigger button gets `disabled`/`opacity-50 cursor-not-allowed` styling and `toggleOpen()` becomes a no-op. The two pre-existing call sites (Project/User filters in `_time-logs-content.tsx`) are unaffected since the prop defaults to falsy.
- Date field is now a `DateFieldPicker` trigger button (calendar icon + "Aug 12, 2026"-style label) that opens a portal-positioned popover reusing `DayPanel` from `_time-period-panels.tsx` verbatim — the same calendar the page's date filter already uses. Picking a day applies immediately and closes the popover (no OK/Cancel — single value, no mode-switching to stage).
- Start Time / End Time fields are now `TimeFieldPicker` trigger buttons (clock icon + "09:30 AM"-style label) opening a new tile-based popover: Hour tiles (1–12), Minute quick-picks (00/15/30/45) plus a bounded 0–59 numeric input for exact minutes, and an AM/PM two-tile toggle. Every interaction commits live via `onChange`; the popover only closes on outside-click/Escape, since hour/minute/AM-PM are independent selections and auto-closing on the first tile would force reopening.
- Both new picker components are portaled to `document.body` and positioned from the trigger's `getBoundingClientRect()` (mirroring `_searchable-select.tsx`'s existing mechanism) rather than a plain `absolute` popover, so they don't clip against the 420px-wide modal card.
- `date`/`startTime`/`endTime` state in the modal stays exactly the same string formats (`"YYYY-MM-DD"` / `"HH:mm"` 24-hour) — `combineDateTime()` and the POST/PATCH payload are untouched.
- `_time-logs-table.tsx` gained a "Type" column (header + `EntryRow` cell) showing a `Manual`/`Timer` pill, copied verbatim from `_task-time-logs.tsx`'s existing pill styling (`bg-[#F4F6FB]`/gray for manual, `bg-[#E5F1FF]`/blue for timer). No new role gating added — `/api/v2/time-logs` already returns `source` unconditionally, and non-`VIEW_ALL_ROLES` callers already only ever receive their own entries from that route. Grouped-view header row's `colSpan` bumped from `7` to `8` to match the new column count.
- Added `fromISODate(s: string): Date` to `_time-logs-shared.ts` as the local-timezone-safe counterpart to the existing `toISODate`, consumed by `_date-field-picker.tsx`.

### Files Changed
- `src/app/v2/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx` - swapped Project/Task `<select>`s for `SearchableSelect`; swapped Date/Start/End `<input>`s for the two new picker components
- `src/app/v2/(hub)/dashboard/timelogs/_searchable-select.tsx` - added optional `disabled` prop
- `src/app/v2/(hub)/dashboard/timelogs/_date-field-picker.tsx` - new file, trigger+popover date field wrapping `DayPanel`
- `src/app/v2/(hub)/dashboard/timelogs/_time-field-picker.tsx` - new file, trigger+popover time-of-day field (hour/minute/AM-PM tiles + exact-minute input)
- `src/app/v2/(hub)/dashboard/timelogs/_time-logs-shared.ts` - added `fromISODate()` helper
- `src/app/v2/(hub)/dashboard/timelogs/_time-logs-table.tsx` - added "Type" column (header + cell), bumped grouped-row `colSpan` to `8`

### Deviations From Plan
- None — implementation followed the task document's Implementation Steps as written.

### Verification Run
- `npx tsc --noEmit` - PASS (no output)
- `pnpm lint` - PASS (0 errors; 2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`, untouched by this change)
- `pnpm dev` manual browser check - SKIPPED (no test credentials/browser session available in this environment, same documented gap as tasks 226/227/228). Recommended before shipping: open Add Time Log, confirm Project/Task search-and-select works and the Task field's disabled/loading states are correct, pick a date via the calendar popover, pick start/end times including a non-quarter-hour exact minute via the numeric input, save, and confirm the entry appears with the correct Type pill in both flat and grouped table views; also confirm neither new popover clips against the 420px modal card at any of the three trigger positions.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Reviewed all six changed/new files (`_time-log-entry-modal.tsx`, `_searchable-select.tsx`, `_date-field-picker.tsx`, `_time-field-picker.tsx`, `_time-logs-shared.ts`, `_time-logs-table.tsx`) against the codebase's established conventions for this feature directory (pixel-value Tailwind classes, portal+bounding-rect popover mechanics, `cn()` for conditional classes, page-scoped components not shared).
- Found one repeated-logic issue: `_date-field-picker.tsx`'s `DayPanel` `onChange` callback reimplemented the exact `"YYYY-MM-DD"` string-building logic already exported as `toISODate()` from `_time-logs-shared.ts` (imported into the same file for `fromISODate`, so the sibling helper was right there unused). Fixed by importing and calling `toISODate(d)` instead of the inline duplicate — removes a maintenance risk where the two implementations could silently diverge.
- No unused code, no `any`/untyped escape hatches, no deep nesting, no dead code, no secrets/debug logging. Both new components' effects/cleanup mirror `_searchable-select.tsx`'s already-reviewed pattern exactly (scroll/resize listeners, outside-click, Escape).
- Column order in `_time-logs-table.tsx` verified by direct read: `TableHead` (Log Title, Project, Daily Log Hours, Time Period, Date, Type, Notes, actions) matches `EntryRow`'s cell order 1:1, and the grouped-row `colSpan={8}` matches the new 8-column count.
- Repeated `impeccable` design-hook `design-system-font-size` findings across every touched file are all on lines pre-existing before this task's edits (verified line-by-line against the pre-edit reads captured during implementation) or, in the two new files, exact copies of the pixel-value convention already used pervasively throughout this same directory (`text-[10px]`/`text-[11px]`/`text-[12px]`/`text-[13px]` per `_time-period-panels.tsx`, `_time-log-entry-modal.tsx`, `_time-logs-table.tsx`). Classified as false positives — this app has no rem-based type ramp; CLAUDE.md's "UI Polish Conventions" section documents pixel-precise arbitrary values as this codebase's actual, working convention. No fix applied.

### Deviations
- Minor: Type column placed between Date and Notes (task doc offered this as one acceptable option among a few — "after Time Period, before Notes — or wherever reads best"). No deviation from acceptance criteria.
- None at Medium or Major level. All six Requirements items and all eight Acceptance Criteria items are satisfied by the code as written; no out-of-scope files were touched (API routes, PDF export, page-level filters, `TimePeriodPicker`/`_time-period-panels.tsx` all untouched).

### Verification Run (re-run after the fix above)
- `npx tsc --noEmit` - PASS (no output)
- `pnpm lint` - PASS (0 errors; same 2 pre-existing unrelated warnings in `_checklist-tab.tsx`)

## Post-QA Adjustments (user feedback during Testing)

- **Project/Task layout:** the two-column `flex gap-2.5` row (each field at `flex-1`, ~195px wide inside the 420px modal) read as squeezed for the searchable combobox's trigger/search input. Changed to a vertical `flex flex-col gap-3` stack — full modal width per field — in `_time-log-entry-modal.tsx`. Date/Start Time/End Time stayed as the existing three-column row (three short trigger buttons with icon+short label read fine at that width; only Project/Task, which need room for a search box and longer option labels, were squeezed).
- **Future dates disabled:** a time log can't be logged against a day that hasn't happened yet. Added an optional `disabled?: Matcher | Matcher[]` prop to `DayPanel` (`_time-period-panels.tsx`, passed straight through to the underlying `react-day-picker` `DayPicker`'s own `disabled` prop) — additive and unused by `_time-period-picker.tsx`'s existing Day/Week panel calls, so the date *filter* is untouched and still allows any date. `_date-field-picker.tsx` now passes `disabled={{ after: today }}` (today at 23:59:59.999, so today itself stays selectable regardless of current hour) to grey out and block future days in the Add Time Log modal's calendar specifically.
- **Project/Task still visually narrow after stacking:** the vertical stack above didn't actually fix the squeeze — `SearchableSelect`'s trigger `<button>` used `inline-flex` (sized to its own text, not its parent), so each trigger stayed pill-width even inside a full-width `div`. Added an optional `fullWidth?: boolean` prop to `SearchableSelect` (`flex w-full justify-between` instead of `inline-flex` when set) and passed it on both the Project and Task fields in the modal. The toolbar's Project/User filters don't pass it, so their existing compact pill sizing is unchanged.
- **Date/Start/End Time reverted:** a follow-up "make both fields full-width" request was initially (mis)applied to Date/Start/End Time (stacked each onto its own row) before the user clarified it was about Project/Task, not Date/Time. Reverted Date/Start Time/End Time back to their original three-column `flex gap-2.5` row.
- **Toolbar filters centered, away from the action buttons:** `_time-logs-content.tsx`'s toolbar row was a single `justify-between` flex (title left, everything else — filters + Export PDF + Add Time Log — bunched together on the right). Restructured into three explicit regions: `<h1>` title (`shrink-0`, left), a `flex-1 flex justify-center` middle section holding `TimePeriodPicker`/Project filter/Employee filter (centers within the remaining space between title and actions), and a `shrink-0` right-hand group holding Export PDF + Add Time Log.
- **Project/Employee filter trigger labels:** added an optional `label?: string` prop to `SearchableSelect` that renders `{label}: {value}` on the trigger (e.g. "Project: All Projects" / "Project: <name>") plus a blue-highlighted border once a specific value is picked (not "All") — copied from `_filter-multi-select.tsx`'s `FilterMultiSelect` trigger convention (the app's existing "Status: All" / "Classification: All" pattern) so this page's filter pills read consistently with the rest of the app. Applied `label="Project"` to the Project filter and `label="Employee"` to the employee filter, and renamed that filter's placeholder/search text from "All Users"/"Search users…" to "All Employees"/"Search employees…" to match the requested wording. The modal's Project/Task fields don't pass `label` (they have their own adjacent `<label>` element), so they're unaffected.
- Verified with `npx tsc --noEmit` and `pnpm lint` after every change in this section — all clean (same 2 pre-existing unrelated warnings in `_checklist-tab.tsx`, untouched by this task).
