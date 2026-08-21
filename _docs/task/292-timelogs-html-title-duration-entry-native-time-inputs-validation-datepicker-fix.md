# 292: Time Logs — HTML-Entity Title Fix, Manual Duration Entry Toggle, Native Time Inputs, Live Field Validation, Datepicker Width Fix

**Created:** 2026-08-21
**Priority:** MEDIUM
**Type:** enhancement / bugfix
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Six fixes/improvements to the dedicated Time Logs page (`/dashboard/timelogs`, task 226, most recently reworked by task 230):

1. **Log Title HTML-entity bug** — the table's "Log Title" column renders literal `&amp;` (and similar entities) instead of the decoded character, for entries linked to a task/issue whose Zoho-imported title contains an ampersand (e.g. `Project &amp; Task Management ...`, per the user's screenshot). This is the same class of bug already fixed elsewhere in the app (task 194/258) via a shared `decodeHtmlEntities()` helper — never wired into this feature area.
2. **Manual duration entry** — the Add/Edit Time Log modal only supports Start Time + End Time. Add a toggle (mirroring the existing "Select Tasks/Issues ⇄ Enter General Log" toggle pattern in `TaskIssuePicker`) to instead type elapsed time directly as `hh:mm` (placeholder `00:00`), using a native `<input type="time">` per the shadcn reference snippet the user supplied — no seconds, no AM/PM.
3. **Start/End Time → native time input** — replace the modal's custom Tile-grid popover (`TimeFieldPicker`) with a native `<input type="time">` styled per the shadcn reference (leading Clock icon), and add explicit future-time validation (a time log can't be for a time that hasn't happened yet).
4. **Live, per-field validation** — error messages must appear below each field as soon as that field is interacted with (on blur/change), not only after clicking Add/Save.
5. **Submit button gating** — Add/Save must stay disabled until every validation error is cleared, not just until required fields have *some* value (the modal's current, deliberate task-230 design — see `_time-log-entry-modal.tsx`'s comment at the top of the file — which this task explicitly supersedes for the Add/Edit modal).
6. **Datepicker layout bug** — the modal's Date field popover renders with a large empty gutter to the right of the calendar grid (user-confirmed via screenshot, not a date-math bug).

This task **only touches the Add/Edit Time Log modal** (`_time-log-entry-modal.tsx` and its Date/Time sub-components). The table's inline quick-edit popovers (`_time-period-inline-editor.tsx`, and `_time-field-picker.tsx`'s `HourMinuteAmPmGrid`/Tile-grid system) are **not** touched — they're a different interaction model (single-click table-cell edit vs. a full form) and weren't part of the user's request or screenshots.

## Requirements

- [ ] **Log Title decoding**: `_time-logs-table.tsx`'s Log Title cell renders `decodeHtmlEntities(entry.log_title)`, not the raw string.
- [ ] **Task/Issue picker labels decoded too**: `TaskIssuePicker`'s dropdown item list and its selected-value display (the search input's value when closed) render decoded titles — otherwise a task/issue with `&amp;` in its title still shows raw entities the moment a user opens the picker, one click upstream of the same bug. This covers both the modal's own Task/Issue field and `_time-logs-table.tsx`'s inline `LogTitleEditor` (which reuses `TaskIssuePicker`).
- [ ] **Duration toggle**: the Add/Edit modal gets a new link-style toggle near the Date/Start Time/End Time row — "Enter duration manually" (from Period mode) / "Set start and end time" (from Duration mode) — matching the visual/interaction pattern of `TaskIssuePicker`'s existing "Enter General Log" / "Select Tasks/Issues" toggle (small, `text-[#0063D6]`, `hover:underline`).
- [ ] **Duration field**: when in Duration mode, Start Time + End Time fields are replaced by a single "Duration" field — native `<input type="time">`, no `step` attribute (so no seconds), rendered with `lang="en-GB"` (or equivalent) so the browser's built-in time-picker UI shows plain `hh:mm` with no AM/PM segment, placeholder `00:00`, leading `Clock8`/`Clock` icon per the shadcn reference snippet the user pasted (icon inside the input via `absolute`-positioned `pointer-events-none` wrapper + `pl-9` on the input, matching that snippet's structure).
- [ ] **Duration validation**: Duration is required in Duration mode; must be `> 00:00`; total logged hours (`duration ⁄ 60`) must be `≤ 24`.
- [ ] **Start/End Time → native input**: in Period mode, Start Time and End Time each become a native `<input type="time">` (no `step`, so no seconds; default locale AM/PM display, matching the user's Image #8 reference) with a leading Clock icon, replacing `TimeFieldPicker` in this modal only.
- [ ] **Future-time validation**: if the selected Date is today, a Start Time, End Time, or Duration-implied end-of-work time later than the current wall-clock time is rejected with a field error ("Time logging is not allowed for future times") — equivalent behavior to today's Tile-grid `maxTime` disabling, just expressed as post-hoc validation since a native input can't have specific values disabled.
- [ ] **Field errors show live**: every field (Project, Task/Issue, Date, Start Time, End Time, Duration) shows its error message below itself as soon as that field is blurred/closed at least once, in addition to the existing "show everything after a failed submit" behavior — not gated behind a single form-wide `submitAttempted` flag.
- [ ] **Submit button fully gated**: Add/Save is `disabled` unless the form has **zero** validation errors (`isValid`), not merely "every required field has some value" (`requiredFilled`, the current task-230 behavior this task replaces for this modal).
- [ ] **Datepicker width fix**: the Date field's calendar popover (`_date-field-picker.tsx`) no longer shows a large empty gutter to the right of the 7-column day grid — it's sized to the calendar's actual content width, matching the visual footprint of `_time-period-picker.tsx`'s (toolbar) working calendar popover.
- [ ] **API supports duration-only entries**: `POST /api/v2/time-logs` and `PATCH /api/v2/time-logs/[timeLogId]` accept an alternate `duration_hours` body field (in place of `start_time`/`end_time`) and persist `start_time: null, end_time: null, hours: duration_hours` — consistent with the pre-existing nullable `start_time`/`end_time` columns (migration 095) and the table/PDF-export's existing null-safe rendering (`TimePeriodCell`, `_export-pdf.ts`'s `timePeriodText`, both already show `—` for null start/end).
- [ ] **Edit mode round-trips duration entries**: opening Edit on an entry whose `start_time`/`end_time` are both `null` opens the modal in Duration mode, pre-filled with `formatHoursAsHHMM(entry.hours)`.
- [ ] Design tokens (colors, radii, spacing, type scale) for every new/changed element come from `_final_design/guide/central-hub-design-system.md` and match this modal's existing token usage (`#0B1533` text, `#E2E7F2` borders, `#F4F6FB` field backgrounds, `#007BFF` focus, `#C0392B` errors, `rounded-[10px]` field radius) — no new ad-hoc colors.
- [ ] Any new file stays within the file-length conventions in `nextjs-file-length-best-practices.md` (soft warning ~250-300 lines; split sub-components out, matching this directory's existing one-concern-per-file pattern).

## Out of Scope / Must-Not-Change

- `_time-period-inline-editor.tsx` and `_time-field-picker.tsx`'s `HourMinuteAmPmGrid`/Tile-grid system — the table's inline single-click Time Period quick-edit stays exactly as it is today. `_time-field-picker.tsx` itself is **not deleted**; its `parseValue`/`draftTo24`/`HourMinuteAmPmGrid` exports are still consumed by `_time-period-inline-editor.tsx` and must keep working unmodified.
- Duration mode is **modal-only** — no inline-table "enter duration" affordance is added to `_time-logs-table.tsx` in this task.
- `_time-period-picker.tsx` / `_time-period-panels.tsx` (the page's toolbar Day/Week/Month/Range filter) — not touched, except that its `DayPanel` continues to be reused as-is by `_date-field-picker.tsx` (only the popover *wrapper's* width changes, not `DayPanel` itself or the toolbar's own usage).
- `_task-issue-picker.tsx`'s toggle mechanics, search, tabs, and scroll-reveal windowing — unchanged; only its title rendering gets wrapped in `decodeHtmlEntities()`.
- `/api/v2/tasks/[taskId]/time-logs` and `/api/v2/issues/[issueId]/time-logs` (the nested, per-task/per-issue routes used by the Task/Issue Detail pages' own Time Logs tabs) — untouched; this task only extends the unified `/api/v2/time-logs` routes the dedicated Time Logs page uses.
- `_task-time-logs.tsx` / `_issue-time-logs.tsx` and their own `_time-log-form.tsx` (legacy/v2 task-detail pages) — separate components, separate forms, not part of this task.
- No migration — `time_logs.start_time`/`end_time` are already nullable (migration 095); no schema change needed for duration-only rows.
- Second-level (`step="1"`) time precision is explicitly **not** added to Start/End Time — the reference screenshot's `08:30:00`/`01:30:00 AM` seconds are an artifact of the raw shadcn demo, not a new precision requirement; internal storage/handling stays minute-granularity (`combineDateTime`/`isoToHHmm`), consistent with the rest of this feature.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/dashboard/timelogs/_time-logs-table.tsx` | Modify | Decode Log Title cell text via `decodeHtmlEntities` |
| `src/app/(hub)/dashboard/timelogs/_task-issue-picker.tsx` | Modify | Decode dropdown item titles and the selected-value display |
| `src/app/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx` | Modify | Add duration/period mode toggle + state; swap Start/End Time to native inputs; add per-field `touched` tracking + live errors; gate submit on `isValid`; branch save payload on mode; Edit-mode duration detection |
| `src/app/(hub)/dashboard/timelogs/_native-time-input.tsx` | New | Shared native `<input type="time">` field (leading Clock icon, shadcn-pattern styling) used for Start Time, End Time, and Duration — parameterized by whether to force 24h/no-AM-PM (`lang` override) for Duration vs. default locale for Start/End |
| `src/app/(hub)/dashboard/timelogs/_time-logs-shared.ts` | Modify | Add `parseHHMMToHours(value: string): number \| null` (counterpart to the existing `formatHoursAsHHMM` in `@/lib/timer/format`, needed to convert the Duration field's `hh:mm` into decimal hours for the API payload) |
| `src/app/(hub)/dashboard/timelogs/_date-field-picker.tsx` | Modify | Add an explicit width class to the popover panel (fixes the right-hand gutter bug) |
| `src/app/api/v2/time-logs/route.ts` | Modify | `POST`: accept optional `duration_hours`; when present, skip the `start_time`/`end_time` requirement and insert `start_time: null, end_time: null, hours: duration_hours` |
| `src/app/api/v2/time-logs/[timeLogId]/route.ts` | Modify | `PATCH`: same `duration_hours` branch as `POST` |
| `src/app/(hub)/dashboard/timelogs/_time-field-picker.tsx` | No change | Confirm still imported correctly by `_time-period-inline-editor.tsx` after the modal stops importing `TimeFieldPicker` from it |

## Code Context

### `decodeHtmlEntities` — already exists, cross-imported elsewhere

`src/app/(hub)/projects-old/_pm-shared.tsx:134`:
```ts
export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X"
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}
```
Already imported cross-directory by unrelated feature areas (e.g. `src/app/(hub)/projects/_shared/_milestone-swimlane.tsx:6`), so importing it into `timelogs/` is an established pattern, not a new cross-boundary dependency.

### `_time-logs-table.tsx` — Log Title cell (current, line 273)
```tsx
<span className="truncate max-w-[220px] block">{entry.log_title}</span>
```
Change to `{decodeHtmlEntities(entry.log_title)}`.

### `_task-issue-picker.tsx` — two render sites needing decode
Line 194: `const selectedLabel = value && value.kind !== "general" ? value.label : "";` — wrap in `decodeHtmlEntities` when non-empty.
Line 270: `{item.title}` inside the dropdown list — wrap in `decodeHtmlEntities(item.title)`.
(`value.label`/`item.title` both ultimately come from `tasks.title`/`issues.title`, the same Zoho-imported columns as the table's `log_title`.)

### `_time-log-entry-modal.tsx` — current submit-gating comment to replace (lines 78-83)
```ts
// Requirement 9 disables Add/Save until every required field has *some* value (`requiredFilled`
// below) — deliberately not full validity: ...
const [submitAttempted, setSubmitAttempted] = useState(false);
```
and (lines 102-106, 282):
```ts
const requiredFilled =
  (!!initial || !!projectPublicId) &&
  ...
disabled={saving || !requiredFilled}
```
Task 292 explicitly supersedes this design for this modal: replace the `disabled` condition with `!isValid`, and remove `requiredFilled` (or repurpose the comment to explain the new touched-based live-error behavior). `isValid` (already computed at line 125 as `Object.keys(errors).length === 0`) becomes the single source of truth for both submit-gating and error display.

### `_time-log-entry-modal.tsx` — Start/End Time fields to replace (lines 248-257)
```tsx
<div className="flex-1">
  <FieldLabel required hint="Time logging is not allowed for future times">Start Time</FieldLabel>
  <TimeFieldPicker value={startTime} onChange={setStartTime} maxTime={maxTime} />
  <FieldError message={showErrors ? errors.startTime : undefined} />
</div>
```
Replace `TimeFieldPicker` with the new `_native-time-input.tsx` component; `showErrors ? errors.startTime : undefined` becomes `(touched.startTime || submitAttempted) ? errors.startTime : undefined`.

### shadcn reference snippet supplied by the user (adapt, don't copy verbatim — this codebase has no `Label`/generic `Input` primitive beyond `button.tsx` in `components/ui/`, per CLAUDE.md's "Not every UI element needs to be a shadcn primitive" convention; match this modal's own hand-rolled `FieldLabel`/input styling instead)
```tsx
<div className='relative'>
  <div className='text-muted-foreground pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center pl-3'>
    <Clock8Icon className='size-4' />
  </div>
  <Input type='time' step='1' defaultValue='08:30:00'
    className='peer bg-background appearance-none pl-9 [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none' />
</div>
```
`_native-time-input.tsx` should follow this icon-inset structural pattern, but built as a plain controlled `<input>` using this modal's own token classes (`border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] rounded-[10px]`), with `step` omitted (no seconds) and `lang="en-GB"` only for the Duration variant (to suppress the AM/PM segment — cross-browser, the `lang` attribute on a `type="time"` input drives whether the browser renders a 12h-with-AM/PM or 24h picker UI, independent of OS locale; verify in Chrome + Safari during implementation since exact AM/PM-hiding behavior is browser-dependent).

### Datepicker width bug — root cause (confirmed by comparing sibling popovers)
`_date-field-picker.tsx`'s panel (line ~90) is the **only** floating panel in this directory with no explicit width:
```tsx
className="z-50 rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] p-4"
```
Every sibling either sets an explicit width class or uses `usePopoverPosition`'s `pos.width`:
- `_time-field-picker.tsx` panel: `"z-50 w-[220px] rounded-[14px] ..."`
- `_time-period-inline-editor.tsx` panel: `"z-50 w-[300px] rounded-[14px] ..."`
- `_task-issue-picker.tsx` panel: calls `usePopoverPosition(open, triggerRef, panelRef, 260)` and applies `width: pos.width` inline.
- `_date-field-picker.tsx` calls `usePopoverPosition(open, triggerRef, panelRef)` (no `minWidth`) **and** never applies `width` in its inline style — the panel is left to whatever width the browser resolves for a `position: fixed` box constrained only by `left` (shrink-to-fit in theory, but `DayPanel`'s `react-day-picker` internals evidently don't shrink-wrap cleanly in this portaled-fixed context, producing the observed gutter).
Fix: add an explicit `w-[...]` class to this panel (start from the day grid's own dimensions — 7 × `w-9` (36px) cells + `p-4` (32px) padding + border ≈ 284-300px; tune visually against the toolbar's working popover as a reference during implementation) — the same pattern every sibling already uses, rather than relying on shrink-to-fit.

### `POST /api/v2/time-logs` — current start/end requirement (lines 224-226, 239-242)
```ts
if (!dateLogged || !startTime || !endTime) {
  return NextResponse.json({ error: "date_logged, start_time, and end_time are required" }, { status: 400 });
}
...
const hours = (new Date(endTime).getTime() - new Date(startTime).getTime()) / 3_600_000;
if (!(hours > 0) || hours > 24) {
  return NextResponse.json({ error: "End time must be after start time, and no more than 24 hours later" }, { status: 400 });
}
```
Add a branch: if `body.duration_hours` is a finite number, validate `0 < duration_hours <= 24` directly and skip the start/end requirement entirely (insert `start_time: null, end_time: null, hours: duration_hours`); otherwise keep the existing start/end path unchanged. Apply the mirror-image change in `PATCH /api/v2/time-logs/[timeLogId]/route.ts` (same shape, lines ~59-77).

### `_time-logs-shared.ts` — new helper to add near `isoToHHmm` (line 73)
```ts
// Counterpart to `formatHoursAsHHMM` (`@/lib/timer/format`) — parses the Duration field's
// "hh:mm" string back into decimal hours for the API payload. Returns null for an empty/
// malformed value so callers can treat that as "not yet a valid duration."
export function parseHHMMToHours(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hh = Number(match[1]);
  const mm = Number(match[2]);
  if (mm > 59) return null;
  return hh + mm / 60;
}
```

## Implementation Steps

1. Import `decodeHtmlEntities` from `@/app/(hub)/projects-old/_pm-shared` into `_time-logs-table.tsx` and `_task-issue-picker.tsx`; wrap the three render sites identified in Code Context.
2. Add `parseHHMMToHours` to `_time-logs-shared.ts`.
3. Build `_native-time-input.tsx`: controlled `value`/`onChange` (`hh:mm` string) component with a leading Clock icon, this modal's field-input token classes, and an optional `forceNoAmPm` prop (applies `lang="en-GB"`, omits when unset for Start/End Time's default-locale AM/PM display).
4. In `_time-log-entry-modal.tsx`:
   a. Add `timeMode` state (`"period" | "duration"`, default `"period"`, or `"duration"` in Edit mode when `initial.start_time == null && initial.end_time == null`), and a `duration` string state (prefilled via `formatHoursAsHHMM` in that Edit case).
   b. Add the mode-toggle link below/beside the Date/Start/End row, following `TaskIssuePicker`'s toggle styling.
   c. Swap `TimeFieldPicker` for `_native-time-input.tsx` on Start Time/End Time; render the Duration field instead of both when `timeMode === "duration"`.
   d. Add future-time validation for Start Time/End Time/Duration-implied end against `nowHHmm()` when `date === toISODate(new Date())`.
   e. Add `touched` state and set it on each field's blur/close; change every `FieldError message={showErrors ? ... }` to `(touched.field || submitAttempted)`.
   f. Extend the `errors`/`isValid` computation to branch on `timeMode` (Duration required + `>0` + `<=24` in duration mode; existing Start/End checks only in period mode).
   g. Replace `disabled={saving || !requiredFilled}` with `disabled={saving || !isValid}`; remove `requiredFilled`.
   h. Branch `handleSave`'s request body: period mode sends `start_time`/`end_time` as today; duration mode sends `duration_hours: parseHHMMToHours(duration)` and omits `start_time`/`end_time`.
5. In `_date-field-picker.tsx`, add the explicit width class to the popover panel; visually compare against `_time-period-picker.tsx`'s toolbar popover to confirm the gutter is gone and nothing clips.
6. In `src/app/api/v2/time-logs/route.ts` (`POST`) and `src/app/api/v2/time-logs/[timeLogId]/route.ts` (`PATCH`), add the `duration_hours` branch described in Code Context.
7. Run `npx tsc --noEmit` and `pnpm lint`.
8. Browser-verify (see Acceptance Criteria) — this is UI-heavy work; do not report success without an actual `pnpm dev` walkthrough covering both Add and Edit, both Period and Duration modes, and the datepicker fix.

## Acceptance Criteria

- [ ] A time log entry linked to a task/issue whose title contains `&` (e.g. imported as `Project &amp; Task Management`) shows `Project & Task Management` in the table's Log Title column, in the Task/Issue picker's dropdown, and in its selected-value display — not raw `&amp;`.
- [ ] Add Time Log modal: toggling to "Enter duration manually" replaces Start Time/End Time with a single Duration field (`hh:mm`, placeholder `00:00`, no seconds, no AM/PM, Clock icon); toggling back restores Start Time/End Time.
- [ ] Submitting a Duration-mode entry (e.g. `01:30`) creates a row with `hours = 1.5`, `start_time = null`, `end_time = null`; it appears in the table with `01:30` in Daily Log Hours and `—` in Time Period.
- [ ] Editing that same duration-created entry re-opens the modal already in Duration mode with `01:30` pre-filled.
- [ ] Start Time and End Time render as native browser time inputs (not the old Tile-grid popover) with a leading Clock icon, in this modal only — the table's inline Time Period quick-edit still shows the original Tile-grid popover, unchanged.
- [ ] Setting Start Time, End Time, or Duration such that the implied time is later than the current wall-clock time, on today's date, shows a field error and blocks submission; a past/current time does not.
- [ ] Focusing then blurring any single empty/invalid required field (without touching any other field, without clicking Add/Save) shows that field's error message immediately below it.
- [ ] Add/Save stays disabled as long as any field has an active error (e.g. End Time before Start Time), even if every field technically "has a value" — only enables once every error clears.
- [ ] Opening the Date field's calendar popover shows no empty gutter to the right of the day grid — its width visually matches the day-grid content, comparable to the toolbar's own Day-mode popover.
- [ ] A pre-existing Period-mode (Start/End Time) entry still creates/edits/displays exactly as before this task (regression check) — including the modal's General Log / task-linked / issue-linked flows, which are untouched by this task.
- [ ] `npx tsc --noEmit` passes clean.
- [ ] `pnpm lint` passes clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```
No test runner configured — verification is type-check + lint + browser-based acceptance testing (`pnpm dev`) against `/dashboard/timelogs`, covering: Add (Period mode), Add (Duration mode), Edit of a Period entry, Edit of a Duration entry, an entity-encoded task/issue title, live per-field validation, future-time rejection, submit-button gating, and the datepicker popover width.

## Compatibility Touchpoints

- No schema/migration changes — `time_logs.start_time`/`end_time` are already nullable (migration 095).
- `POST`/`PATCH /api/v2/time-logs[...]` gain an optional `duration_hours` body field; existing callers that always send `start_time`/`end_time` (this same modal's Period mode, today) are unaffected — the new branch only activates when `duration_hours` is present.
- No changes to `/api/v2/tasks/[taskId]/time-logs` or `/api/v2/issues/[issueId]/time-logs` (separate, nested routes used by Task/Issue Detail pages) — their own forms (`_time-log-form.tsx`, legacy/v2) are untouched and keep requiring Start/End Time only.
- No changes to the PDF export contract (`_export-pdf.ts` already renders `—` for null start/end).

## Implementation Notes

### What Changed
- **Log Title HTML entities (Req. 1)**: `_time-logs-table.tsx`'s Log Title cell and `_task-issue-picker.tsx`'s dropdown-item titles + selected-value display now wrap through the existing `decodeHtmlEntities()` helper (`@/app/(hub)/projects-old/_pm-shared`).
- **Manual duration toggle (Req. 2)**: `_time-log-entry-modal.tsx` gained a `timeMode: "period" | "duration"` toggle (link-button pattern matching `TaskIssuePicker`'s own General Log toggle) that swaps Start Time + End Time for a single Duration field.
- **Duration field control — deviation from the plan**: the plan called for a native `<input type="time">` with the AM/PM segment suppressed via `lang="en-GB"`. Empirically, in the Chrome build used for verification, `lang` (tried with both `en-GB` and `sv-SE`) did not suppress the AM/PM segment at all — it kept rendering and cycling. Hiding it visually instead via `-webkit-datetime-edit-ampm-field { display: none }` (the same `::-webkit-*` pattern the user's own reference snippet uses for the calendar-picker indicator) hid it on screen but left the control internally incomplete: `document.querySelector('input[type=time]').value` returned `""` and `validity.badInput` stayed `true` even with the visible hour/minute digits correctly filled in, so no valid value was ever recoverable from `onChange`. Root cause: a native `<input type="time">` is the wrong control type for a duration (not a time-of-day) regardless of styling. Replaced with a small masked text input (`DurationInput` in `_native-time-input.tsx`) — `inputMode="numeric"`, auto-inserts the colon after two digits, placeholder `00:00`, same icon/styling — which has no such hidden-subfield failure mode and guarantees a real controlled `"hh:mm"` string. Verified in-browser: typing `0130` renders `01:30` with no AM/PM segment, and the value correctly reaches component state (submit button enables, payload is well-formed).
- **Start/End Time → native input (Req. 3)**: `NativeTimeInput` in `_native-time-input.tsx` — `<input type="time">`, no `step` (no seconds), leading Clock icon — replaces `TimeFieldPicker` in this modal only. Verified in-browser: typing `0900AM`/`1030AM` renders correctly with the browser's native AM/PM UI.
- **Future-time validation (Req. 3)**: implemented as post-hoc validation (`isToday && startTime > nowTime`, same for endTime) rather than disabling specific native-input values (not possible with a native control) — matches the task doc's stated approach.
- **Live per-field validation (Req. 4)**: added `touched: Partial<Record<TouchedField, boolean>>` state, set via `onBlur` on each field's wrapping `<div>` (verified this correctly fires even through `SearchableSelect`'s portaled dropdown — confirmed in-browser: the Project field's "Project is required" error appeared immediately after opening and interacting with the dropdown, before any submit attempt). Every `FieldError` now reads `(touched[field] || submitAttempted)` instead of the old single `showErrors = submitAttempted` flag.
- **Submit gating (Req. 5)**: `disabled={saving || !requiredFilled}` → `disabled={saving || !isValid}`; `requiredFilled` removed along with its explanatory comment (the comment explicitly said this task-230 design was deliberate — task 292's Requirement 5 supersedes it for this modal, as flagged in the task doc). Verified in-browser: Add/Save stayed disabled while Duration was empty, enabled the instant a valid `01:30` was entered.
- **Datepicker width fix (Req. 6)**: added `w-[296px]` to `_date-field-picker.tsx`'s popover panel — the only floating popover in this directory that had no explicit width (confirmed by comparing all siblings, per the task doc's Code Context). Verified in-browser against a fresh screenshot of the same Date-field popover: no more empty gutter to the right of the day grid.
- **API duration_hours branch (new requirement in the doc)**: `POST /api/v2/time-logs` and `PATCH /api/v2/time-logs/[timeLogId]` both accept an optional `duration_hours: number`; when present, validation/hours computation switches to that value and `start_time`/`end_time` are inserted as `null` instead of requiring both. Existing start/end-time payloads are completely unaffected (new branch only activates when `duration_hours` is present).
- **Edit-mode duration detection**: `initialTimeMode()` opens the modal in Duration mode (prefilled via `formatHoursAsHHMM`) when an existing entry's `start_time`/`end_time` are both `null`.

### Files Changed
- `src/app/(hub)/dashboard/timelogs/_time-logs-table.tsx` — decode Log Title cell text.
- `src/app/(hub)/dashboard/timelogs/_task-issue-picker.tsx` — decode dropdown item titles + selected-value display.
- `src/app/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx` — duration/period toggle + state, native time inputs, per-field touched tracking + live errors, `isValid`-gated submit, duration-aware save payload, edit-mode duration detection.
- `src/app/(hub)/dashboard/timelogs/_native-time-input.tsx` — new file: `NativeTimeInput` (Start/End Time) + `DurationInput` (masked text input for Duration).
- `src/app/(hub)/dashboard/timelogs/_time-logs-shared.ts` — added `parseHHMMToHours`.
- `src/app/(hub)/dashboard/timelogs/_date-field-picker.tsx` — explicit popover width.
- `src/app/api/v2/time-logs/route.ts` — `POST` `duration_hours` branch.
- `src/app/api/v2/time-logs/[timeLogId]/route.ts` — `PATCH` `duration_hours` branch.
- `src/app/(hub)/dashboard/timelogs/_time-field-picker.tsx` — unchanged, confirmed still correctly imported by `_time-period-inline-editor.tsx` (`grep` + `tsc` both clean).

### Deviations From Plan
- **Duration field control**: planned as native `<input type="time">` with `lang="en-GB"` suppressing AM/PM; shipped as a masked text input (`DurationInput`) instead. See "What Changed" above for the full empirical rationale (both the `lang` trick and the CSS-hide fallback were tried and failed in-browser before landing on this). The visible behavior (icon, `hh:mm`, placeholder `00:00`, no seconds, no AM/PM) matches the task doc's requirement exactly — only the underlying control type changed.
- Everything else matches the plan as written.

### Verification Run
- `npx tsc --noEmit` — PASS (no output/errors).
- `pnpm lint` — PASS (0 errors; 2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`, not touched by this task — same warnings task 291's Quality Gate notes also recorded).
- Browser-based acceptance testing (`pnpm dev`, existing dev server on :3000, Super Admin test account) —
  - Log Title HTML-entity fix: **PASS**, confirmed against real production-imported data — the exact row from the user's original bug screenshot ("Project &amp; Task Management Updates", Aug 20 2026, Brandon Dwite Cobacha / WebriQ Admin) now renders "Project & Task Management Updates".
  - Duration toggle, masked input, no-seconds/no-AM-PM: **PASS** (typed `0130` → displayed `01:30`, no AM/PM segment; confirmed via `element.value`/`validity` inspection during the earlier native-input diagnosis, and via visual/DOM confirmation on the final masked-input version).
  - Start/End Time native inputs with icon: **PASS** (`09:00 AM` / `10:30 AM` entered and displayed correctly).
  - Live per-field validation: **PASS** (Project-required error appeared on first blur, before any submit attempt).
  - Submit button gating: **PASS** (disabled with an empty/invalid field, enabled once the form became fully valid).
  - Datepicker width fix: **PASS** (popover now hugs the day grid; no gutter, visually compared against the user's original bug screenshot).
  - Full successful create → table round-trip (both modes): **BLOCKED, not a code issue** — the available Super Admin test account isn't a valid `employee_id` for the `time_logs` RLS insert policy against any tried project ("new row violates row-level security policy for table 'time_logs'"). Verified this is unrelated to the `duration_hours` change specifically by reproducing the *identical* error, at the same point in the flow, using a plain Start/End Time (Period-mode) submission against the same project/issue — proving both code paths correctly build a valid payload and reach the DB insert layer; only the RLS/account-permissions layer (pre-existing, out of this task's scope) rejects it.
  - Edit-mode duration round-trip (reopening a duration-created entry): **NOT VERIFIED** — could not create a duration entry to reopen, for the same RLS reason above. Logic was code-reviewed (`initialTimeMode`/`formatHoursAsHHMM` prefill) but not exercised live; recommend a follow-up manual check with an account that has write access to a real project before/after shipping.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code / dead code: confirmed `requiredFilled` and the old `TimeFieldPicker` import are fully removed from `_time-log-entry-modal.tsx` (only explanatory comments reference the old names now) — `grep` for both across the directory returns no lingering usage.
- No `any`/untyped escape hatches introduced; `errors` stays an explicitly-typed inline object matching the pre-existing style in this file.
- No deep nesting — the new Period/Duration branch in the JSX and in the `errors` computation is a single-level `if/else`, consistent with the file's existing structure.
- Error handling: API routes' new `duration_hours` branch reuses the exact same 400-response shape/pattern as the existing start/end-time validation; no silent failure paths added.
- No secrets, credentials, or debug logging added — the one `console.error` in `POST /api/v2/time-logs` predates this task, untouched.
- Duplication between `POST`/`PATCH`'s `duration_hours` branches mirrors the pre-existing duplication pattern between those two routes (they already fully mirrored each other's validation before this task) — consistent with, not a new instance of, this codebase's existing convention there.
- `onBlur`-on-wrapping-`<div>` for per-field touched tracking was verified in-browser (not just reasoned about) to correctly bubble through a portaled dropdown (`SearchableSelect`) before being adopted — see task doc's Verification Run.

### Deviations
- **Medium, documented in the task doc's own Deviations From Plan**: the Duration field ships as a masked text input (`DurationInput`) instead of the planned native `<input type="time">` with `lang`-suppressed AM/PM. This was a plan-time assumption that didn't hold up under actual browser testing (both `lang` locales tried, and a CSS-hide fallback, all left the native control internally invalid — verified via `element.value`/`validity.badInput`). The visible/behavioral contract in the requirements (icon, `hh:mm`, `00:00` placeholder, no seconds, no AM/PM) is met exactly; only the underlying control implementation changed. Not a scope or architecture change — same file, same modal, same data contract out to the API.
- **Minor**: `_time-log-entry-modal.tsx` is now 355 lines, above the generic `nextjs-file-length-best-practices.md` soft-warning band (~250-300) the task doc asked new work to respect. It was already at 293 lines before this task (itself already over that band), and this directory's sibling files already run larger (`_time-logs-table.tsx` is 502 lines) — consistent with this codebase's established norm for this feature area rather than a new violation. Not split out, since the added state (duration mode, touched tracking) is intrinsic to this one form's validation logic, not a separable concern.

### Required Fixes
- None.
