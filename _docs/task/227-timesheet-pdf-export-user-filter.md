# 227: Timesheet PDF Export Overhaul + User Filter (Follow-up to Task 226)

**Created:** 2026-08-12
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** deep
**Status:** Completed

---

## Overview

Follow-up to task 226 (Dedicated Time Logs Page, `_docs/task/226-dedicated-time-logs-page.md`,
implemented and quality-gate-passed). Two additions to that page:

1. **User filter** — Super Admin/Admin/PM (the roles that already see every employee's entries,
   grouped by user) get an additional filter to narrow the on-screen table and the PDF export to
   one specific employee, on top of the existing period/project filters.
2. **Timesheet PDF rewrite** — the current `_export-pdf.ts` (task 226) produces a flat table with
   a redundant per-row Employee column (reference: image 6) and a plain "Time Logs / My Time
   Logs · <date>" header (reference: image 7). This task restructures it into a proper per-employee
   "Timesheet" document: employee name as a section heading (not a column), conditional
   Project/Date columns driven by the active filter, day-subtotaled totals for multi-day periods,
   a repeating logo header on every page, page-break-aware multi-employee layout, and a new
   filename scheme.

**Decisions/assumptions made below (not explicitly confirmed by the user — flagged for review, not
silently decided):**

1. **User filter role set widened to include `hr`**, matching task 226's own precedent — HR is
   already in the "view every employee's entries" role group (`time_logs_manager_read`), so it
   gets the same filter, even though the user's request named only Super Admin/Admin/PM.
2. **Multi-employee export filename segment.** The user's two filename examples
   (`timesheet_Aug06_2026_Brandon_D.pdf`, `timesheet_Aug06_Aug21_2026_Brandon_D.pdf`) both cover
   exactly one employee (self-view, or a User-filtered export). When the exported set spans
   multiple employees (view-all, no User filter applied), there is no name to put in that segment.
   Default: use `All-Users` in that position (e.g. `timesheet_Aug06_2026_All-Users.pdf`). The
   `_First_L` format itself (first name + underscore + first initial of last name) is inferred
   directly from the one example given and applied to whichever single name is available.
3. **No new API route for the User filter.** `GET /api/v2/time-logs` (task 226) already returns
   every entry in range for view-all roles in one response (looped past the 1000-row cap) — the
   User filter is applied **client-side** on that already-complete result set, exactly like the
   existing Project filter's dropdown-options-from-loaded-data pattern would if it worked that way
   (it currently doesn't — Project filtering is server-side via a query param; User filtering does
   not need to be, since no additional server-side truncation risk exists once the period+project
   query has already returned the complete set).
4. **Per-day subtotals (point 8) only apply when the Date column is shown** (i.e. multi-day
   periods — Week/Month/Range). A single-day export has exactly one day of data, so its existing
   single "Total" row is unchanged.

## Requirements

- [ ] `_time-logs-content.tsx`: add a "User" filter control, visible only to
      `admin`/`super_admin`/`pm`/`hr` (Assumption 1), populated from the **distinct employees
      present in the currently-fetched (period+project-filtered) `entries`** — no new endpoint.
      Filtering by user is applied client-side to both the on-screen table and whatever gets
      passed to the PDF export.
- [ ] PDF title changes from "Time Logs" to "Timesheet".
- [ ] Remove the "My Time Logs" / scope-label subtitle line entirely.
- [ ] Remove the Employee column from the table. Print "Employee: <Name>" as a heading directly
      above that employee's table instead.
- [ ] When the exported set spans multiple employees, repeat "Employee: <Name>" + table per
      employee, in the same grouping order the on-screen grouped table already uses
      (`groupByEmployee`, task 226). Page-break behavor: if an employee's table finishes with only
      a small amount of vertical space left on the page (not enough for a reasonable next block —
      heading + at least one row + total), start the next employee's block on a fresh page instead
      of squeezing it in; if there's still meaningfully more room, continue on the same page after
      a blank-line gap.
- [ ] If a single project is selected in the active filter, print "Project: <Project Name>" below
      the title and omit the Project column from every table. If no project filter is active
      ("All Projects"), print "Project: All Projects" and keep the Project column.
- [ ] If the active period is a single day, omit the Date column entirely and print
      "Period: <date>" below the Project line. If the period spans multiple days (Week/Month/
      Range), print "Period: <from> - <to>" below the Project line and keep the Date column —
      placed as the **first** column whenever it's shown.
- [ ] For multi-day periods, each employee's table subtotals by day first (matching the on-screen
      task-detail Time Logs tab's existing `groupByDate` + per-day subtotal pattern), then an
      overall "Total" row per employee, same as today.
- [ ] Add a repeating page header, drawn on every page via jspdf-autotable's `didDrawPage` hook:
      top-left = `public/company_logo.webp` + `public/logo.png` side by side, plus the text
      "WebriQ Central Hub"; top-right = "Exported On: <date + time of export>".
- [ ] New filename scheme: `timesheet_<date-segment>_<employee-segment>.pdf` — see Code Context
      for the exact date-segment format derived from the user's two examples, and Assumption 2 for
      the employee segment when multiple employees are exported.
- [ ] General visual polish pass on the generated PDF — consistent spacing between the header
      block, the Project/Period lines, each employee section, and table cell padding/borders (the
      task doc does not prescribe exact values; use `_final_design/guide` colors — navy header
      fill, muted gray secondary text — translated to jsPDF's RGB color API since the PDF has no
      access to Tailwind/CSS).

## Out of Scope / Must-Not-Change

- The on-screen table (`_time-logs-table.tsx`) keeps its existing grouped/flat rendering,
  Employee-as-column-header design (task 226) — none of the PDF's Employee-as-heading restructuring
  applies to the on-screen UI. Only the exported document's layout changes.
- No change to `GET /api/v2/time-logs`'s response shape or its `.range()` pagination-safety loop —
  the User filter is purely additive client-side filtering on top of an already-complete response.
- No change to who can *add/edit/delete* time logs, or to any RLS policy — this task only touches
  read-side filtering and the export's presentation.
- Task-detail Time Logs tab (`_task-time-logs.tsx`, tasks 214/215) — untouched, referenced only as
  a pattern to mirror (`groupByDate`/day-subtotal shape), not a file this task edits.
- `jspdf`/`jspdf-autotable` stay the export mechanism (task 226) — no new PDF library.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/dashboard/timelogs/_export-pdf.ts` | Rewrite | Title/subtitle changes, Employee-as-heading + per-employee tables, conditional Project/Date columns, day-subtotals, logo header via `didDrawPage`, page-break-aware multi-employee loop, new filename scheme |
| `src/app/v2/(hub)/dashboard/timelogs/_time-logs-content.tsx` | Modify | Add the User filter control + client-side employee filtering of `entries`; pass richer meta (`projectName`, `period`, filtered `entries`) into `exportTimeLogsToPdf` |
| `src/app/v2/(hub)/dashboard/timelogs/_time-logs-shared.ts` | Modify | Add a `groupByDate()` helper (mirrors `_task-time-logs.tsx`'s local one) for the PDF's day-subtotal grouping — shared between `_export-pdf.ts` and (optionally) reused if the on-screen table ever needs it, avoiding a third bespoke copy in this same directory |
| `src/app/v2/(hub)/dashboard/timelogs/_time-logs-table.tsx` | No change expected | User filter only affects which `entries` this component receives, not its own rendering logic |

## Code Context

### Current `_export-pdf.ts` (task 226, full file — this task rewrites it)

```ts
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatHoursAsHHMM, formatClockTime } from "@/lib/timer/format";
import { formatDate } from "@/lib/utils";
import { sumHours, type TimeLogEntry } from "./_time-logs-shared";

export function exportTimeLogsToPdf(entries: TimeLogEntry[], meta: { periodLabel: string; scopeLabel: string }) {
  const doc = new jsPDF({ orientation: "landscape" });
  doc.setFontSize(14);
  doc.text("Time Logs", 14, 16);
  doc.setFontSize(10);
  doc.text(`${meta.scopeLabel} · ${meta.periodLabel}`, 14, 22);
  autoTable(doc, {
    startY: 28,
    head: [["Employee", "Log Title", "Project", "Daily Log Hours", "Time Period", "Date", "Notes"]],
    body: entries.map((e) => [e.display_name, e.task_title, e.project_name, formatHoursAsHHMM(e.hours), /* period */ , formatDate(e.date_logged), e.note ?? ""]),
    foot: [["", "", "Total", formatHoursAsHHMM(sumHours(entries)), "", "", ""]],
    styles: { fontSize: 8, cellPadding: 2.5 },
    headStyles: { fillColor: [7, 17, 51], textColor: 255, fontStyle: "bold" },
    footStyles: { fillColor: [244, 246, 251], textColor: [11, 21, 51], fontStyle: "bold" },
  });
  doc.save(`time-logs-${meta.periodLabel...}.pdf`);
}
```
New signature needs to take the un-flattened inputs the new layout needs — suggested shape:
```ts
export function exportTimeLogsToPdf(
  entries: TimeLogEntry[],
  meta: { period: PeriodValue; projectName: string | null } // projectName: null = "All Projects"
) { ... }
```
`groupByEmployee` (already in `_time-logs-shared.ts`, task 226) gives the per-employee grouping in
existing on-screen order — reuse it directly instead of re-deriving.

### `_time-logs-shared.ts`'s existing `periodToRange`/`PeriodValue` (task 226) — reuse for single-vs-multi-day detection

```ts
export type PeriodValue =
  | { mode: "day"; date: Date }
  | { mode: "week"; date: Date }
  | { mode: "month"; year: number; month: number }
  | { mode: "range"; from: Date; to: Date };
export function periodToRange(p: PeriodValue): { from: string; to: string } { ... }
```
`p.mode === "day"` is the single-day case (Requirement: omit Date column, print "Period: <date>").
Every other mode is multi-day (keep Date column, "Period: <from> - <to>", day-subtotals).

### `_task-time-logs.tsx`'s existing `groupByDate` (pattern to mirror, not import — different directory, task 214)

```ts
function groupByDate(entries: TimeLogEntry[]): [string, TimeLogEntry[]][] {
  const map = new Map<string, TimeLogEntry[]>();
  for (const entry of entries) {
    const list = map.get(entry.date_logged) ?? [];
    list.push(entry);
    map.set(entry.date_logged, list);
  }
  return [...map.entries()];
}
```
Add an equivalent `groupByDate()` to `_time-logs-shared.ts` (this directory doesn't have one yet —
only `groupByEmployee`) so `_export-pdf.ts` doesn't reinvent it, and nest it inside each employee's
block: `groupByEmployee(entries)` → for each employee, if multi-day, `groupByDate(employeeEntries)`
→ one `autoTable` body per day with a day-subtotal row, then the employee's own grand total.

### `jspdf-autotable` v5 API confirmed from installed types/source (`node_modules/jspdf-autotable`)

```ts
// Repeating page header/footer — draws on every page the table(s) span, including pages
// autoTable creates itself when a table overflows:
autoTable(doc, {
  ...,
  didDrawPage: (data) => { drawPageHeader(doc, exportedAtLabel); },
  margin: { top: 26 }, // reserve space below the header on every page
});

// Chaining multiple autoTable() calls (one per employee) on the same doc — jspdf-autotable
// attaches `lastAutoTable` to the jsPDF instance after each call:
// "Assign false to enable `doc.lastAutoTable.finalY || 40` sugar" (jspdf-autotable source comment)
const nextY = (doc as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 26;
```
For the page-break check before starting the next employee's block: compare `nextY` against
`doc.internal.pageSize.getHeight()` minus a bottom margin and a minimum-block-height estimate
(heading + ~2 rows + total, e.g. ~40pt) — if the remaining space is below that, call `doc.addPage()`
and start the next block's `startY` fresh (accounting for the header height reserved by `margin.top`
on that new page); otherwise continue with `startY: nextY + gap`.

### Logo embedding — `public/company_logo.webp` + `public/logo.png`

`jsPDF.addImage()` needs decoded image data (`HTMLImageElement`, `HTMLCanvasElement`, or a data
URL), not a bare path — and this export runs entirely client-side in the browser (`"use client"`),
so the browser's own image decoding can be used directly rather than depending on jsPDF's internal
format parser for `.webp` specifically (spotty across versions). Safest approach: load each logo
into an `HTMLImageElement` (browsers decode webp/png natively), draw onto an offscreen `<canvas>`,
and pass the canvas (or its `toDataURL()`) to `doc.addImage(...)` — sidesteps any "does jsPDF
support WEBP" uncertainty entirely, since by the time jsPDF sees the image it's already a decoded
canvas/PNG-format data URL regardless of the source file's own format. `logo.png` is 48×48px
(confirmed via `file public/logo.png`) — small enough to draw at a modest fixed size (e.g. ~16pt
tall) next to the "WebriQ Central Hub" text without visible upscaling artifacts; check
`company_logo.webp`'s natural aspect ratio at load time (`img.naturalWidth`/`naturalHeight`) rather
than assuming a square, since it wasn't confirmed square like the PNG.

### `formatDate` (`src/lib/utils.ts`) — reuse for the in-PDF "Period: ..." text (readable form, e.g. "Aug 5, 2026")

Do **not** reuse this for the filename — the filename needs a comma/space-free compact form
derived directly from the user's two examples:
- Single day → `Aug06_2026` (2-digit day, no comma, year appended once).
- Range → `Aug06_Aug21_2026` (start without year, end with year) — i.e. `{startShort}_{endShort}_{endYear}`
  where `{startShort}`/`{endShort}` are `{MonthAbbrev}{DD}` with no separator (`Aug06`, not `Aug 06`
  or `Aug-06`). A new small formatter belongs in `_export-pdf.ts` (or `_time-logs-shared.ts` if it
  turns out useful elsewhere) — this exact compact format doesn't exist anywhere else in the
  codebase yet (`formatDate`/`formatFullTimestamp` are both human-readable-with-punctuation, not
  filename-safe).
- Employee segment: `{FirstName}_{FirstLetterOfLastName}` — e.g. "Brandon Dwite Cobacha" →
  `Brandon_D` per the user's own example (first token of `display_name`, then the first letter of
  the *last* whitespace-separated token — "Dwite" is a middle name and is dropped, matching the
  example exactly). Falls back to `All-Users` when the exported set spans more than one distinct
  `employee_id` (Assumption 2).

### `TimeLogsContent`'s existing Project filter (task 226, current shape) — pattern to mirror for the new User filter

```tsx
const [projectFilter, setProjectFilter] = useState("");
...
<select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} className="rounded-full border ...">
  <option value="">All Projects</option>
  {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
</select>
```
New User filter is the same shape but sourced from `entries` (not a separate fetch) and gated on
role:
```tsx
const canFilterByUser = role === "admin" || role === "super_admin" || role === "pm" || role === "hr";
const employeeOptions = useMemo(() => {
  const seen = new Map<string, string>();
  for (const e of entries) if (e.employee_id) seen.set(e.employee_id, e.display_name);
  return [...seen.entries()];
}, [entries]);
const [employeeFilter, setEmployeeFilter] = useState("");
const filteredEntries = employeeFilter ? entries.filter((e) => e.employee_id === employeeFilter) : entries;
```
`filteredEntries` replaces the current direct use of `entries` in both `<TimeLogsTable
entries={...}>` and `handleExport()`'s call to `exportTimeLogsToPdf(...)`.

## Implementation Steps

1. Add the User `<select>` filter to `_time-logs-content.tsx` (role-gated per Assumption 1),
   deriving options from loaded `entries`, and thread `filteredEntries` through to both the table
   and the export call in place of raw `entries`.
2. Add `groupByDate()` to `_time-logs-shared.ts`, mirroring `_task-time-logs.tsx`'s existing
   version exactly (same grouping key/shape) — this directory doesn't have one yet.
3. Add the compact filename-date formatter and the `{FirstName}_{L}` employee-segment formatter
   (either in `_export-pdf.ts` directly, or `_time-logs-shared.ts` if a second consumer appears).
4. Build the logo-loading helper (fetch/decode each PNG/WEBP into a canvas once, cache the
   resulting data URLs for the lifetime of the export call) and the `drawPageHeader(doc,
   exportedAtLabel)` function used by every `autoTable(...)`'s `didDrawPage`.
5. Rewrite `exportTimeLogsToPdf(entries, meta)`: compute `projectName`/`period`-derived title-block
   lines (Title "Timesheet", "Project: ...", "Period: ..." per Requirements), determine
   `showProjectColumn`/`showDateColumn`, group by employee (`groupByEmployee`), and for each
   employee: draw the "Employee: <name>" heading, page-break-check against remaining vertical
   space, run one `autoTable()` per day-group (multi-day) or one flat `autoTable()` (single-day) with
   the correct conditional column set and a day/overall "Total" row, tracking `startY` via
   `doc.lastAutoTable.finalY` between employees and days.
6. Build the new filename from the compact date segment + employee segment (Assumption 2) and call
   `doc.save(...)`.
7. Run `npx tsc --noEmit` and `pnpm lint`; browser-verify as admin/super_admin/pm (grouped
   multi-employee export, User-filtered single-employee export, both single-day and range periods,
   both a specific project and "All Projects") and as developer/self-view (single-employee export,
   no User-filter control visible) — open the generated PDFs and visually confirm the header
   repeats on every page, page-breaks land in sensible places, and column sets match each scenario.

## Acceptance Criteria

- [ ] Admin/Super Admin/PM/HR see a "User" filter alongside Period/Project; developers do not.
- [ ] PDF title reads "Timesheet"; no "My Time Logs"/scope-label subtitle appears anywhere.
- [ ] No Employee column exists in any exported table; every employee's table is preceded by an
      "Employee: <Name>" heading.
- [ ] A multi-employee export repeats the heading+table pattern per employee, in the same order as
      the on-screen grouped view, and never visibly truncates or overlaps an employee's table
      across a page boundary — each employee's block either fits with room to spare or starts
      cleanly on a new page.
- [ ] "Project: <Name>" (Project column dropped) when one project is filtered; "Project: All
      Projects" (Project column present) when not.
- [ ] Single-day period: no Date column, "Period: <date>" shown. Multi-day period: Date column is
      the first column, "Period: <from> - <to>" shown.
- [ ] Multi-day exports show a subtotal row per day within each employee's table, plus the existing
      overall total per employee.
- [ ] Every page of every export shows both logos + "WebriQ Central Hub" top-left and "Exported
      On: <timestamp>" top-right.
- [ ] Filenames follow `timesheet_<date-segment>_<employee-segment>.pdf` exactly matching the two
      given examples for the single-employee case, and `All-Users` for the multi-employee case.
- [ ] `npx tsc --noEmit` and `pnpm lint` both pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```
Manual/browser (this PDF layout logic cannot be meaningfully verified by type-checking or linting
alone): sign in as PM/admin, export with no User filter across multiple employees and a wide Range
— confirm page-break placement, per-day subtotals, and the repeating header on later pages. Export
again with a User filter narrowed to one employee, and again with a Day-only period — confirm
column sets and "Project:"/"Period:" lines match each Requirement exactly. Confirm filenames on
disk match the required pattern for both the single- and multi-employee cases.

## Compatibility Touchpoints

- No new `pnpm` dependency — reuses `jspdf`/`jspdf-autotable` from task 226.
- No change to `GET /api/v2/time-logs`, RLS, or any write route.
- Does not affect the MCP tool inventory.
- `public/company_logo.webp` and `public/logo.png` already exist in the repo (confirmed present,
  48×48 for the PNG) — no new asset needs to be added.

## Implementation Notes

### What Changed
- Added a `groupByDate()` helper to `_time-logs-shared.ts` (mirroring `_task-time-logs.tsx`'s
  local one, task 214) and exported the previously-module-private `MONTH_NAMES` array so the PDF's
  compact filename formatter could reuse it instead of duplicating a 12-entry list.
- Added the User filter to `_time-logs-content.tsx`: a role-gated (`admin`/`super_admin`/`pm`/`hr`)
  `<select>` whose options are derived via `useMemo` from the distinct employees already present
  in the currently-fetched `entries` (no new endpoint). `filteredEntries` (entries narrowed by the
  selected employee, or all of them when unset) now feeds both `<TimeLogsTable>` and the PDF
  export, replacing the previous direct use of `entries` in both places. The filter resets to "All
  Users" whenever the period/project changes and a fresh fetch resolves (nested inside the
  existing `startTransition` callback, not synchronously in the effect body, for the same
  `react-hooks/set-state-in-effect` reason task 226 already had to work around elsewhere in this
  file).
- `exportTimeLogsToPdf` is now `async` (it awaits logo image decoding before drawing) and its
  signature changed from `{ periodLabel, scopeLabel }` to `{ period, projectName }` — the export
  function now derives every text line and column-visibility decision itself from the raw
  `PeriodValue`/project name rather than being handed a pre-formatted label. `handleExport` in
  `_time-logs-content.tsx` is now `async` too, wrapped in a new `exporting` state (spinner +
  "Exporting…" label + disabled button) since logo loading/PDF generation is no longer
  instantaneous.
- Rewrote `_export-pdf.ts` end to end per the task's 11 points: "Timesheet" title, no "My Time
  Logs" subtitle, Employee-as-heading (not a column) repeated per employee with a page-break check
  before each new block, conditional Project column (dropped when one project is filtered) and
  conditional Date-as-first-column (dropped for single-day periods, shown first otherwise),
  per-day subtotal rows via `groupByDate` for multi-day periods plus each employee's existing
  grand-total row, a repeating logo + "WebriQ Central Hub" + "Exported On: ..." header drawn via
  `jspdf-autotable`'s `didDrawPage` hook (fires for every page a table touches, including ones
  autoTable adds itself), and the new `timesheet_<date-segment>_<employee-segment>.pdf` filename
  scheme.
- Logos are decoded via a same-origin `<img>` → offscreen `<canvas>` → PNG data-URL pipeline rather
  than handing jsPDF the raw `.webp`/`.png` paths directly — sidesteps any uncertainty about
  jsPDF's own WEBP format support by letting the browser's native decoder do the work, and the
  result is cached at module scope so repeated exports in the same page session don't re-decode.

### Files Changed
- `src/app/v2/(hub)/dashboard/timelogs/_time-logs-shared.ts` - added `groupByDate()`, exported
  `MONTH_NAMES`
- `src/app/v2/(hub)/dashboard/timelogs/_time-logs-content.tsx` - User filter, `filteredEntries`,
  async `handleExport` + `exporting` state
- `src/app/v2/(hub)/dashboard/timelogs/_export-pdf.ts` - full rewrite per the task's 11 PDF points

### Deviations From Plan
- **Corrected the plan's own stated filename-employee-segment rule.** The task doc's Code Context
  claimed "Brandon_D" (from "Brandon Dwite Cobacha") came from "the first letter of the *last*
  whitespace-separated token" — that's wrong; "Dwite" is the *second* token, not the last
  ("Cobacha" is). Implemented the rule that actually matches the given example:
  `{FirstToken}_{FirstLetterOfSecondToken}` (first name + middle-initial-style abbreviation,
  dropping any further tokens including the surname). Caught by working through the concrete
  example by hand before writing `filenameEmployeeSegment()`, not left as the doc's originally
  (incorrect) described behavior.
- No other deviations — the page-break threshold (`MIN_BLOCK_HEIGHT = 45pt`) and inter-block gap
  (`BLOCK_GAP = 8pt`) are implementation-detail constants the task doc explicitly left unspecified
  ("the task doc does not prescribe exact values").

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (0 errors; the same 2 pre-existing warnings in an unrelated file as task 226,
  still untouched by this task)
- `pnpm dev` smoke test - PASS, and stronger than task 226's own: while the dev server was running
  for this check, an already-authenticated real browser session (not one of my own browser tabs —
  `tabs_context_mcp` confirmed no MCP-managed tab group exists for this session) was observed
  actively hitting `/v2/dashboard/timelogs`, `/api/v2/time-logs?from=2026-08-12&to=2026-08-12`, and
  `/api/v2/projects` with clean `200` responses and no server errors in the dev log, confirming the
  page and its (unchanged) GET route work end-to-end against real data after this task's changes.
  Left that dev server running rather than killing it, since tearing it down would have interrupted
  that active session.
- The PDF generation path itself (logo decoding, multi-employee page-break layout, conditional
  columns, day-subtotals, filename) runs entirely client-side with no server round-trip, so the
  above server-log evidence does not confirm it specifically — **SKIPPED** for the same reason as
  task 226 (no credentials/browser access to click "Export PDF" and inspect the resulting file
  myself). Recommend, before shipping: exporting as an admin/PM with no User filter across
  multiple employees and a wide Range (page-break placement, per-day subtotals, repeating header on
  later pages), exporting with a User filter narrowed to one employee and a Day-only period (column
  set, "Project:"/"Period:" lines), and confirming actual filenames on disk match the required
  pattern for both cases.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation in any changed file.
- No `any`/untyped escape hatches — the one type-augmentation cast
  (`doc as jsPDF & { lastAutoTable?: { finalY: number } }`) is a precisely-typed extension for a
  runtime property `jspdf-autotable` itself documents attaching but doesn't include in its own
  `.d.ts`, not a blanket `any`. `isSummaryRow(raw: unknown)` correctly narrows via `Array.isArray`
  + `typeof` checks rather than casting away the type.
- No deep nesting — the page-break loop in `exportTimeLogsToPdf` is at most two conditional levels
  deep and reads linearly top-to-bottom.
- Each changed file keeps one clear responsibility; the new helper functions in `_export-pdf.ts`
  (`buildColumns`, `buildEntryRow`, `buildSummaryRow`, `filenameDateSegment`,
  `filenameEmployeeSegment`, `drawPageHeader`, `loadLogos`) are each single-purpose and named for
  exactly what they do.
- Repeated logic was extracted where it mattered: `groupByDate` now lives in the shared module
  (used by the PDF only, but centralized rather than re-copied a third time in this directory),
  and `MONTH_NAMES` is reused rather than duplicated for the new compact filename formatter. The
  repeated `doc.setFont/setFontSize/setTextColor` triplets in `exportTimeLogsToPdf` are normal,
  idiomatic usage of jsPDF's stateful mutation API (every jsPDF example follows this shape) —
  not flagged as duplicated business logic.
- **Verified the filename logic against both of the user's own worked examples by hand**, not just
  by reading the code: single-day "Brandon Dwite Cobacha" export traces to exactly
  `timesheet_Aug06_2026_Brandon_D.pdf`, and a range traces to exactly
  `timesheet_Aug06_Aug21_2026_Brandon_D.pdf` — both match the request verbatim.
- Design tokens translated correctly into jsPDF's RGB API: `[7,17,51]`/`[244,246,251]`/
  `[11,21,51]`/`[95,106,136]`/`[226,231,242]` are exact RGB equivalents of this codebase's
  `#071133`/`#F4F6FB`/`#0B1533`/`#5F6A88`/`#E2E7F2` hex tokens — the PDF stays visually consistent
  with the rest of the app rather than inventing new colors.
- Project conventions followed: no `dark:`/CSS-variable classes introduced, error states in the
  modified React component follow the existing inline-`setError`-text pattern where present, and
  the async-transition restructuring in `_time-logs-content.tsx` continues the pattern task 226
  already established for the same `react-hooks/set-state-in-effect` constraint.

### Deviations
- **Minor** — `exportTimeLogsToPdf` can reject (currently only realistic path: logo
  `Image.onerror`, e.g. if a browser extension or aggressive cache/CSP blocked a same-origin static
  asset request) and `_time-logs-content.tsx`'s `handleExport` has a `try/finally` around the
  `await` but no `catch` — the button correctly stops showing "Exporting…" (the `finally` always
  runs), but the user gets no error message, unlike every other fallible async action in this
  codebase (e.g. `_time-log-entry-modal.tsx`'s `setError(...)` on a failed save). Low-probability
  failure mode (same-origin static assets already confirmed present in the repo), but worth a
  follow-up one-line fix (`catch { alert/setError("Failed to generate the PDF.") }`) rather than a
  silent no-op.
- No Medium or Major deviations. Every Out of Scope / Must-Not-Change boundary held: the on-screen
  table (`_time-logs-table.tsx`), `GET /api/v2/time-logs`, RLS, and add/edit/delete permissions are
  all untouched by this task's changes; no new `pnpm` dependency was added.
