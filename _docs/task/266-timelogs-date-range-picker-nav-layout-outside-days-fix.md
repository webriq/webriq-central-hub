# 266: Time Logs Date Range Picker — Nav Layout, Tab Centering, Outside-Days Fix

**Created:** 2026-08-18
**Priority:** MEDIUM
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Completed

---

## Overview

The Time Logs page's date-range picker popup (`TimePeriodPicker` in `src/app/(hub)/dashboard/timelogs/_time-period-picker.tsx`, built on `react-day-picker@10.0.1` panels in `_time-period-panels.tsx`, shipped by task 226) has five layout/rendering defects visible in the popup UI, all confined to these two files:

1. The calendar's own Prev/Next month chevrons render pinned to the very top of the popup card (above the Day/Week/Month/Range tab row) instead of inline with the "August 2026" caption, below the tabs.
2. The Day/Week/Month/Range tab row is left-aligned instead of centered in the popup card.
3. Day and Week panels show a week-number column (labelled "31", "32"... "36" — ISO week numbers, not dates) on the left of the grid, and hide out-of-month dates entirely, leaving blank cells at the start/end of the grid instead of a continuous 6-row calendar.
4. The Month tab's own hand-built prev/next **year** buttons (`‹`/`›` text glyphs) are visibly smaller than the chevron buttons on Day/Week/Range, and are not aligned to the same left/right edges as the calendar grid below them.
5. The Range tab (2-month `react-day-picker` view) needs the same nav-position/sizing/alignment treatment as Day/Week so all four tabs look consistent.

Root cause for (1): `calendarClassNames.nav` in `_time-period-panels.tsx` is `"absolute inset-x-1 top-0 h-8"`. The nearest positioned ancestor is the popup's own `absolute` wrapper div in `_time-period-picker.tsx` (not the month header), so the nav band pins to the top of the entire popup instead of the month caption row. `react-day-picker@10` has a built-in `navLayout="around"` prop that renders `PreviousMonthButton`/`NextMonthButton` as siblings flanking `MonthCaption` (no absolute positioning needed) — this is the correct built-in fix rather than a manual CSS repositioning hack.

Root cause for (3): `DayPanel` and `WeekPanel` pass `showWeekNumber ISOWeek` to `DayPicker`, and no panel passes `showOutsideDays`. `RangePanel` does not have the week-number bug (it never set `showWeekNumber`), so item 3 is scoped to `DayPanel`/`WeekPanel` only. The `outside` class (`text-[#C7CEDD]`) already exists in `calendarClassNames` and is unused because outside days aren't rendered at all — turning on `showOutsideDays` will make it apply automatically, no new class needed. Outside days are clickable/selectable by default in `react-day-picker` (they still fire `onSelect`); nothing else must change for them to remain interactive.

## Requirements

- [ ] 1. Add `navLayout="around"` to every `DayPicker` instance (Day, Week, Range panels) so Prev/Next month chevrons render flanking the "Month Year" caption, below the tab row — not pinned above it.
- [ ] 2. Center the Day/Week/Month/Range tab row within the popup card.
- [ ] 3. On Day and Week panels: remove `showWeekNumber`/`ISOWeek` (drop the week-number column) and add `showOutsideDays` so the grid is a continuous 6-row calendar with previous/next month dates shown in the existing muted `outside` style and still clickable/selectable.
- [ ] 4. On the Month tab: enlarge the prev/next **year** buttons to match the visual size of the Day/Week/Range chevron buttons (use the same `lucide-react` `ChevronLeft`/`ChevronRight` treatment instead of `‹`/`›` text glyphs), and align them to the start/end edges of the panel (matching where the `navLayout="around"` chevrons sit relative to the calendar grid on the other tabs) instead of a centered `gap-4` row.
- [ ] 5. Confirm the Range tab (2-month view) picks up the same nav position/sizing/alignment treatment as Day/Week — this should fall out of requirement 1 plus the shared `calendarClassNames`, but verify visually since Range renders two months side by side.

## Out of Scope / Must-Not-Change

- Do not change `_time-logs-shared.ts` date-math helpers (`startOfWeekMonday`, `endOfWeekSunday`, `startOfMonth`, `endOfMonth`, `periodLabel`, `stepPeriod`) — no logic bug there, only rendering/layout.
- Do not change the standalone `< [Month Year] >` trigger button in `TimePeriodPicker` (the collapsed, closed-popup control that steps the *applied* period) — only the chevrons inside the open popup's calendar are in scope.
- Do not change `_date-field-picker.tsx` (a different single-date picker used elsewhere on the page) unless it turns out to share `_time-period-panels.tsx` — confirm via grep before touching; current understanding is it's a separate component.
- Do not add `showWeekNumber` back anywhere, and do not introduce a new "week number" UI — the column is being removed per requirement 3, not restyled.
- Do not restructure `TimePeriodPicker`'s open/commit/cancel state logic (`draft`, `openPicker`, `commit`) — layout-only change.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/dashboard/timelogs/_time-period-panels.tsx` | Modify | `navLayout="around"` on all 3 `DayPicker` usages; drop `showWeekNumber`/`ISOWeek`, add `showOutsideDays` on Day/Week; restyle `calendarClassNames` (`nav`, `button_previous`, `button_next`, `month_caption`) for the "around" layout; rebuild Month tab's year-nav buttons with `ChevronLeft`/`ChevronRight` sized/aligned like the other tabs |
| `src/app/(hub)/dashboard/timelogs/_time-period-picker.tsx` | Modify | Add `justify-center` (or equivalent) to the tab row container so tabs sit centered in the popup card |

Both files are already well under the 300-line soft-warning threshold in `nextjs-file-length-best-practices.md` (panels file ~258 lines, picker shell ~144 lines) and this change is layout-only — no new files needed, no risk of exceeding the guideline.

## Code Context

### File: `src/app/(hub)/dashboard/timelogs/_time-period-panels.tsx`

Current shared classNames (nav is the bug source — absolute-positioned relative to the popup, not the caption):

```tsx
const calendarClassNames = {
  months: "flex gap-4",
  month: "flex flex-col gap-2",
  month_caption: "flex items-center justify-center h-8 text-[12px] font-semibold text-[#0B1533]",
  nav: "flex items-center justify-between absolute inset-x-1 top-0 h-8",
  button_previous: "p-1 rounded-full text-[#5F6A88] hover:bg-[#F0F7FF] hover:text-[#007BFF] cursor-pointer transition-colors",
  button_next: "p-1 rounded-full text-[#5F6A88] hover:bg-[#F0F7FF] hover:text-[#007BFF] cursor-pointer transition-colors",
  month_grid: "relative",
  weekdays: "flex",
  weekday: "w-9 h-7 flex items-center justify-center text-[9.5px] font-bold uppercase tracking-wide text-[#5F6A88]",
  week: "flex",
  day: "w-9 h-9 flex items-center justify-center p-0",
  outside: "text-[#C7CEDD]",           // already correct for req 3, currently unused (no outside days rendered)
  disabled: "text-[#E2E7F2] cursor-not-allowed",
  week_number: "w-9 h-9 flex items-center justify-center text-[10px] font-mono font-semibold text-[#5F6A88]",
  week_number_header: "w-9 h-7",
};
```

With `navLayout="around"`, `react-day-picker` renders `PreviousMonthButton`/`NextMonthButton` as **direct siblings of `MonthCaption`** inside `Month` (see `node_modules/react-day-picker/dist/esm/DayPicker.js` lines ~267-297) — not through the `Nav`/`button_previous`/`button_next`... actually `button_previous`/`button_next` classNames still apply to `PreviousMonthButton`/`NextMonthButton` in this layout (confirmed via `UI.PreviousMonthButton`/`UI.NextMonthButton` keys), so keep using those className keys but remove `absolute`/`inset-x-1`/`top-0` from `nav` (the plain `Nav` component is not used in `"around"` layout since `navLayout !== undefined`). `month_caption` needs to become a `flex items-center justify-between` row so the caption text sits between the two buttons (or keep `justify-center` for the text with the buttons flexed via `Month`'s own flow — verify visually against the react-day-picker `navLayout="around"` docs/example, since `Month`'s wrapping div (`calendarClassNames.month = "flex flex-col gap-2"`) determines whether siblings stack or sit in a row; `PreviousMonthButton`, `MonthCaption`, `NextMonthButton` are three flat siblings under `Month`, so `month` needs a row-based first line — the cleanest approach is a small structural className tweak, e.g. give `month_caption` `flex-1 text-center` and let `PreviousMonthButton`/`NextMonthButton` be normal flex children of a `month` container that is itself a column with a *nested* header row — simplest: change `month` to render its first 3 children (prev button / caption / next button) inline by giving them all a shared row via a wrapping caption bar. Confirm actual DOM nesting by inspecting rendered output before finalizing classNames — do not guess blindly, verify in the browser per the UI Polish workflow below).

Day/Week panels (add `showOutsideDays`, drop `showWeekNumber ISOWeek`, add `navLayout="around"`):

```tsx
<DayPicker
  mode="single"
  required
  selected={draft}
  onSelect={(d) => d && onChange(d)}
  month={month}
  onMonthChange={setMonth}
  showOutsideDays
  navLayout="around"
  disabled={disabled}
  classNames={calendarClassNames}
  components={{ DayButton: makeDayButton() }}
/>
```

(Same pattern for `WeekPanel`, keeping its `weekModifier` via `makeDayButton(inWeek)`.)

`RangePanel`'s `DayPicker` (add `navLayout="around"`, verify `showOutsideDays` isn't needed/wanted for 2-month range views — likely skip it there since each of the 2 months already shows its own full grid; only add if the reference screenshots imply the same blank-cell issue exists on Range):

```tsx
<DayPicker
  mode="range"
  required
  selected={{ from: draft.from, to: draft.to }}
  onSelect={(range) => { if (range?.from && range.to) onChange({ from: range.from, to: range.to }); }}
  month={month}
  onMonthChange={setMonth}
  numberOfMonths={2}
  navLayout="around"
  classNames={calendarClassNames}
  components={{ DayButton: makeDayButton() }}
/>
```

Month tab's current year-nav (too small, centered instead of edge-aligned):

```tsx
<div className="flex items-center justify-center gap-4 h-8 mb-2">
  <button type="button" onClick={() => onChange({ year: draft.year - 1, month: draft.month })}
    className="p-1 rounded-full text-[#5F6A88] hover:bg-[#F0F7FF] hover:text-[#007BFF] cursor-pointer transition-colors"
    aria-label="Previous year">
    ‹
  </button>
  <span className="text-[12px] font-semibold text-[#0B1533]">{draft.year}</span>
  <button type="button" onClick={() => onChange({ year: draft.year + 1, month: draft.month })}
    className="p-1 rounded-full text-[#5F6A88] hover:bg-[#F0F7FF] hover:text-[#007BFF] cursor-pointer transition-colors"
    aria-label="Next year">
    ›
  </button>
</div>
```

Replace with `justify-between` (start/end aligned) and `lucide-react` `ChevronLeft`/`ChevronRight` at the same `size={14}` used by the trigger chevrons in `_time-period-picker.tsx:78,94`, in a button sized to match the calendar's own chevron buttons (`p-1.5 rounded-full`, same hover treatment) so all four tabs read as one consistent nav control.

### File: `src/app/(hub)/dashboard/timelogs/_time-period-picker.tsx`

Tab row to center (line 102):

```tsx
<div className="flex items-center gap-1 mb-3 border-b border-[#EDF0F7]">
  {TABS.map((t) => ( ... ))}
</div>
```

Add `justify-center`.

## Implementation Steps

1. In `_time-period-picker.tsx`, add `justify-center` to the tab row container (requirement 2).
2. In `_time-period-panels.tsx`, add `navLayout="around"` to the `DayPicker` calls in `DayPanel`, `WeekPanel`, `RangePanel` (requirement 1, partially 5).
3. Update `calendarClassNames.nav`/`button_previous`/`button_next`/`month_caption` to work with `navLayout="around"` — remove the `absolute inset-x-1 top-0` positioning and verify in-browser that the chevrons land inline with the caption text, below the tab row (requirement 1). Adjust `month`/`month_caption` flex structure as needed based on actual rendered DOM (react-day-picker's `PreviousMonthButton`/`MonthCaption`/`NextMonthButton` are flat siblings under `Month` in this layout — do not assume a wrapper exists; add one via `month` classNames if the three siblings don't naturally lay out in a row).
4. On `DayPanel` and `WeekPanel`, remove `showWeekNumber`/`ISOWeek` props and add `showOutsideDays` (requirement 3). Leave the `outside: "text-[#C7CEDD]"` classNames entry as-is — it already exists and will now apply.
5. Verify in-browser that outside-month days remain clickable (react-day-picker's default `onSelect` firing for outside days) and that selecting one updates `draft` correctly (e.g. clicking "31" from the previous month in a Day panel should select that date, not silently no-op).
6. Rebuild the Month tab's year-nav row in `MonthPanel`: swap `‹`/`›` text glyphs for `lucide-react` `ChevronLeft`/`ChevronRight` (import already used elsewhere in `_time-period-picker.tsx`, add the import here), size/style the buttons to match the Day/Week/Range chevron buttons, and change the row to `justify-between` so the buttons sit at the same start/end inset as the calendar grid below (requirement 4).
7. Manually verify the Range tab (2-month grid) picks up the nav-position and sizing changes consistently with Day/Week (requirement 5) — no separate Range-only code path should be needed if steps 2-3 are applied uniformly via the shared `calendarClassNames` and per-panel `navLayout` prop.
8. Run `npx tsc --noEmit` and `pnpm lint`.
9. Browser-test all 4 tabs (Day, Week, Month, Range) in the actual Time Logs page: open the picker, confirm chevron position/size/alignment, tab centering, continuous muted outside-days grid with working clicks, and that "OK"/"Cancel"/"Today"/"Current Week"/"Current Month" actions still work unchanged.

## Acceptance Criteria

- [ ] Day, Week, and Range tabs: Prev/Next month chevrons render directly beside "Month Year", below the Day/Week/Month/Range tab row — not pinned to the top of the popup card.
- [ ] Tab row (Day/Week/Month/Range) is horizontally centered in the popup card.
- [ ] Day and Week tabs show a continuous 6-row calendar grid with no week-number column; dates from the previous/next month appear muted (`text-[#C7CEDD]`) in the leading/trailing blank cells and are clickable/selectable.
- [ ] Month tab's prev/next year buttons are visually the same size as the Day/Week/Range chevron buttons and sit flush with the start/end edges of the panel (same horizontal inset as the calendar grid on other tabs).
- [ ] Range tab's 2-month view shows the same nav position/size/alignment as Day/Week.
- [ ] No regression to selection behavior: Day single-select, Week whole-week highlight, Month tile-select, Range from/to select all still work; "OK" commits the draft, "Cancel" discards it, quick-link row ("Today"/"Current Week"/"Current Month") still functions.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then manually exercise all 4 tabs on /dashboard/timelogs per acceptance criteria
```

No automated test runner is configured for this repo (per `CLAUDE.md`) — verification is TypeScript check + lint + browser-based acceptance testing of the popup on the live Time Logs page.

## Compatibility Touchpoints

- None — purely a client-side layout/styling change inside two colocated, page-scoped files (`_time-period-picker.tsx`, `_time-period-panels.tsx`) under `src/app/(hub)/dashboard/timelogs/`. No API, schema, packaging, or docs surface is touched.

## Implementation Notes

### What Changed
- `_time-period-picker.tsx`: tab row (Day/Week/Month/Range) is now horizontally centered in the popup card.
- `_time-period-panels.tsx`: all three `DayPicker` instances (Day, Week, Range) now use `navLayout="around"`, putting the Prev/Next month chevrons inline with the "Month Year" caption below the tab row instead of pinned above it. `calendarClassNames.month` was changed to a `flex flex-wrap` row with `month_grid: "... basis-full"` so the chevron/caption row and the calendar grid land on separate lines without any absolute positioning. The now-unused `nav`, `week_number`, and `week_number_header` classNames keys were removed.
- Day and Week panels: dropped `showWeekNumber`/`ISOWeek` (removes the week-number/"31-36" column) and added `showOutsideDays` so the grid is a continuous 6-row calendar with previous/next-month dates filled in.
- Range panel: added `showOutsideDays` too, for the same continuous-grid treatment across its 2-month view (requirement 5).
- `dayButtonClass` now has an explicit `modifiers.outside` branch (muted `text-[#C7CEDD]`, still clickable/hoverable), guarded off when the outside day is itself selected or inside a selected range — needed because the custom `DayButton` override always sets its own explicit text color and never received the library's built-in `outside` class.
- Month tab's year-nav buttons: replaced the `‹`/`›` text glyphs with `lucide-react` `ChevronLeft`/`ChevronRight` (`size={18}`) in the same `p-1 rounded-full` button treatment as the calendar's own chevrons, and changed the row from `justify-center gap-4` to `justify-between` so the buttons sit flush with the start/end edges of the `w-[280px]` panel.

### Files Changed
- `src/app/(hub)/dashboard/timelogs/_time-period-panels.tsx` — nav layout restructure, outside-days support, Month tab chevron rebuild
- `src/app/(hub)/dashboard/timelogs/_time-period-picker.tsx` — tab row centering

### Deviations From Plan
- The task document anticipated possibly needing a CSS-grid/`grid-template-areas` restructure for `month` to get the chevrons inline with the caption; a simpler `flex flex-wrap` + `basis-full` on `month_grid` achieved the same result without arbitrary grid-area values, so that's what shipped.
- Added a `modifiers.outside` branch to `dayButtonClass` in `_time-period-panels.tsx`, which wasn't listed in the original file-changes table's line-level plan (only the `showOutsideDays` prop and existing `outside` classNames entry were called out). This turned out to be required: the custom `DayButton` override ignores the library's own modifier classNames entirely and computes its own class from `modifiers`, so without this branch outside days would render with normal (non-muted) styling. Rationale recorded inline as a code comment.
- Removed the `week_number`/`week_number_header`/`nav` classNames entries as dead code once nothing referenced them, beyond what the task doc's Code Context excerpts explicitly called for — straightforward cleanup, no behavior change.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`, not touched by this change)
- Browser walkthrough on `/dashboard/timelogs` (dev server already running) - PASS: verified Day, Week, Month, and Range tabs all show centered tabs, chevrons inline with "Month Year" below the tab row, continuous grids with muted clickable outside-month dates (confirmed by clicking a muted Sept date in the Range tab, which correctly extended the range to "Aug 1 - Sep 3, 2026" and updated the table), and enlarged/edge-aligned Month tab year-nav buttons. Reset back to today's date afterward.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused/dead code: the now-orphaned `nav`, `week_number`, and `week_number_header` classNames entries were removed rather than left in place unused.
- No broad `any` or untyped escape hatches introduced.
- `dayButtonClass`'s new `outside` branch follows the same early-return guard-clause style as the existing `disabled` branch immediately above it — no added nesting.
- Naming stays accurate (`showOutsideDays`, `navLayout="around"` map directly to their visual effect).
- `button_previous`/`button_next` classNames remain duplicated strings (pre-existing pattern, not introduced by this change) — not worth extracting for a two-line constant in a file already under the length guideline.
- Both changed files stay well under the `nextjs-file-length-best-practices.md` soft-warning threshold (`_time-period-panels.tsx` ~278 lines, `_time-period-picker.tsx` 144 lines).
- No secrets, credentials, or debug logging introduced.

### Deviations
- **Minor** — `_time-period-panels.tsx`'s `DayPanel` export is also consumed by `_date-field-picker.tsx` (the Add/Edit Time Log modal's single-date field), which the task document flagged as a possible shared dependency to check via grep before touching but implementation did not verify until this quality-gate pass. Grepped now: confirmed shared. Since only the shared `_time-period-panels.tsx` file was edited (never `_date-field-picker.tsx` itself), this is outside the letter of the "must-not-change" boundary, but the fixes (nav position, outside-days, muted styling) cascade there too. Browser-verified during this quality gate: the Add Time Log modal's date field renders correctly with the same fixes applied and no regression — future dates past today still show correctly disabled via the existing `disabled={{ after: today }}` matcher, which takes precedence over the new outside-day muted styling in `dayButtonClass`'s branch order. Documented rather than treated as a blocker since the observed behavior is a net improvement, not a regression.
- **Minor** — Task document anticipated a CSS-grid restructure of `month`/`month_caption` for the nav-around layout; a simpler `flex flex-wrap` + `basis-full` approach was used instead (see Implementation Notes). Verified visually in-browser across all four tabs; no functional difference from the plan's intent.
- **Minor** — Added a `modifiers.outside` branch to `dayButtonClass`, not explicitly listed in the task doc's file-changes table. Necessary because the custom `DayButton` override discards the library's own modifier classNames; documented inline as a code comment and in Implementation Notes.

No Major deviations — all five task requirements are implemented as specified and verified in-browser (including the shared-component side effect), with no scope expansion beyond the two files the task authorized.
