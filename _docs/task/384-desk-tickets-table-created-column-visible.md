# 384: Desk > Tickets Table — Make Created Date Column Visible (Shrink Other Columns)

**Created:** 2026-09-22
**Priority:** MEDIUM
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

On `/desk/tickets` (the "Tickets" tab — `FiledIssuesTable` in `_filed-issues-table.tsx`), the
**Created** column is pushed to the right edge of the viewport and clipped/scrolled out of view on
real screens (user-reported via screenshot: the table is visibly cut off right at "CREATE",
`Logged` isn't visible at all). The user wants Created reliably visible and is explicitly asking
for this to be solved by **shrinking the other columns**, not by widening the page container.

This is a direct continuation of task 363/383 — 383's own UAT round 2 already "retuned `GRID_COLS`
back down near the original width after the round-1 widening pushed Created off-screen on real
viewports," but the screenshot shows the problem is still present after that retune.

### Root cause

`_filed-issues-table.tsx:33`:

```tsx
const GRID_COLS = "grid-cols-[1fr_90px_130px_150px_130px_110px_120px_145px_150px_90px] min-w-[1565px]";
```

Column order: `Ticket(1fr) Origin(90) Project(130) Assignees(150) Status(130) Severity(110)
Responded(120) Due date(145) Created(150) Logged(90)`.

- Fixed columns sum to 1115px, 9 gaps at `gap-3` (12px) add 108px, row padding (`px-5`, 20px each
  side) adds 40px → 1263px before the `Ticket` track's share. The explicit `min-w-[1565px]` forces
  the `Ticket` track to claim the remaining ~302px minimum.
- The table lives inside `_filed-issues-index.tsx:258`'s `max-w-[1400px] mx-auto px-8` wrapper, so
  the **maximum content width available to the table, on any screen, is 1336px** (1400 − 2×32).
  Because the table's own `min-w-[1565px]` is ~229px **wider than its own container's ceiling**,
  it structurally overflows and requires horizontal scroll on every screen size, not just small
  ones — this is why widening the browser window doesn't help. `Created`/`Logged` sit at the far
  right of that always-overflowing row and end up scrolled past the visible edge by default.
- Secondary contributor: the `Ticket` track is a bare `1fr`, not `minmax(0,1fr)`. A bare `1fr` grid
  track has an implicit `min-width: auto` (≈ the cell's max-content width), so a long,
  unbroken title (e.g. "Fwd: Re: Fwd: Re: November 2025 Blog") can force that column — and the
  whole row — wider than the declared `min-w-[1565px]`, even though the title `<div>` itself has a
  `truncate` class. `truncate` only works once the track is allowed to shrink below its content
  size, which requires `minmax(0, 1fr)`.

### Why not touch Responded / Due date / Created's own widths carelessly

Task 383 deliberately sized `Responded` (120px), `Due date` (145px, includes the "(ND)" overdue
badge), and `Created` (150px) to fit a **full, unclipped** `formatDateTime()` output (e.g. "22 Sep
2026, 3:45 PM") without internal truncation — see the task-383 comment block at the top of
`_filed-issues-table.tsx` (lines 27-32). Shrinking these three aggressively would just move the
clipping problem from "Created is off-screen" to "Created's own text is clipped," trading one
already-fixed regression for another. This task should shrink the **other** columns first (Origin,
Project, Assignees, Status, Severity, Logged) and only touch Responded/Due date/Created's pixel
values as a last resort, with live browser verification against real (long) formatted timestamps.

## Requirements

- [ ] `Created` column is fully visible without needing to scroll horizontally, on the
      `_filed-issues-index.tsx` page's own max content width (1336px, from `max-w-[1400px] px-8`)
      — i.e. the table's total `min-w` must not exceed what that container can offer.
- [ ] `Responded`, `Due date`, and `Created` keep showing their full formatted date+time without
      internal text clipping (the thing task 383 fixed) — verify against real data, not just the
      mostly-empty rows in the reported screenshot.
- [ ] `Due date`'s "(ND)" overdue badge still renders without wrapping/clipping.
- [ ] Other columns (Origin, Project, Assignees, Status pill, Severity select, Logged) remain
      legible and don't visually break — existing `truncate`/`title=` tooltip affordances stay in
      place for anything that now truncates more aggressively than before.
- [ ] The header row's sticky-scroll-sync behavior (`headerScrollRef`/`bodyScrollRef`, task 383
      follow-up) is untouched and still works if horizontal scroll is still needed on narrow
      windows.
- [ ] `Logged` may still require a small scroll on narrow windows — acceptable, it's the lowest
      priority column (read-only, already documented as intentionally not interactive).

## Out of Scope / Must-Not-Change

- Do not widen `_filed-issues-index.tsx`'s `max-w-[1400px]` container — the user explicitly asked
  for the fix via shrinking columns, not growing the page.
- Do not touch the separate Desk > Inbox table (`_ticket-list-view.tsx` or similar) — different
  component, not part of this report.
- Do not change column order, add/remove columns, or change what's editable vs read-only.
- Do not change `formatDateTime()`'s output format.
- Do not touch the sticky-header dual-scroll-region restructure itself (`headerScrollRef` /
  `bodyScrollRef` / `syncScroll`) beyond whatever width numbers it renders — that mechanism is
  unrelated to this bug and already has its own hard-won comments explaining why it's shaped the
  way it is.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/desk/tickets/_filed-issues-table.tsx` | Modify | Retune `GRID_COLS` so total `min-w` fits the page container's max content width (1336px) and `Created` is always visible; switch `Ticket` track to `minmax(0,1fr)`. |

## Code Context

### File: `src/app/(hub)/desk/tickets/_filed-issues-table.tsx`

Current (line 33):

```tsx
const GRID_COLS = "grid-cols-[1fr_90px_130px_150px_130px_110px_120px_145px_150px_90px] min-w-[1565px]";
```

Suggested starting point (implementer should verify pixel-by-pixel in a running browser against
real ticket rows, including long titles and populated Responded/Due date values — do not just trust
these numbers):

```tsx
const GRID_COLS = "grid-cols-[minmax(0,1fr)_70px_110px_130px_115px_95px_105px_125px_140px_75px] min-w-[1320px]";
```

Column-by-column reasoning for the proposed cuts (old → new):
- Origin `90 → 70` — content is just the word "Inbox" or "Manual".
- Project `130 → 110` — already truncates long project names with a `title=` tooltip; fine to
  truncate a little sooner.
- Assignees `150 → 130` — `AssigneeMultiSelect` renders avatar(s), has its own overflow handling.
- Status `130 → 115` — verify the longest status label ("Ready for QA/QC", "For Client Approval")
  still reads in the pill without wrapping.
- Severity `110 → 95` — verify "Show stopper" (longest option) still fits.
- Responded `120 → 105` — only shrink if a real populated value still renders unclipped; the
  screenshot's rows are mostly "–" so this needs checking against actual response timestamps.
- Due date `145 → 125` — same caution, plus the "(ND)" badge.
- Created `150 → 140` — same caution; this is the column that must never clip or scroll off.
- Logged `90 → 75` — "12.3h" + a small clock icon; lowest-priority column, fine if this is the one
  that ends up needing scroll on narrow windows.

`min-w-[1565px] → min-w-[1320px]`: keeps a small margin under the container's 1336px ceiling.

Container reference, unchanged (`_filed-issues-index.tsx:258`):

```tsx
<div className="max-w-[1400px] mx-auto px-8 py-5">
  ...
  <FiledIssuesTable issues={issues} allMembers={members} onUpdate={updateIssue} stickyTop={pageHeaderHeight} />
```

The header row (`_filed-issues-table.tsx:99-110`) uses the same `GRID_COLS` string and needs no
separate edit — it already shares the constant.

## Implementation Steps

1. Update `GRID_COLS` in `_filed-issues-table.tsx` per the numbers above (or tuned equivalents).
2. Run `pnpm dev`, open `/desk/tickets` in a browser at the container's own max width (~1400px+
   window) and confirm `Created` renders fully without horizontal scroll.
3. Check rows with long ticket titles, long project names, and (if available) real
   Responded/Due-date timestamps to confirm no new clipping was introduced in the columns task 383
   protected.
4. Check a narrower window (e.g. ~1200px) to confirm the existing horizontal-scroll fallback and
   sticky-header sync still work cleanly if `Logged` (or, on very narrow windows, more) scrolls off.
5. Adjust individual column widths iteratively if any column's content clips at the values above.

## Acceptance Criteria

- [ ] At the page's own max content width (1336px, i.e. a browser window ≳1400-1450px), `Created`
      is fully visible with no horizontal scroll needed.
- [ ] Responded, Due date, and Created show full, unclipped date+time text on rows with real
      (non-empty) values.
- [ ] Due date's overdue "(ND)" badge doesn't wrap or clip.
- [ ] No column's text is unexpectedly cut off mid-word where it wasn't before (truncation via
      `...` on Ticket title/Project name is fine and expected).
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manual browser check of /desk/tickets — see Implementation Steps 2-4
```

## Compatibility Touchpoints

- None — single-file Tailwind class change, no schema/API/route impact.

---

## Answered alongside this task (no code change): ticket number in the "ticket created" email

The customer confirmation email (`sendTicketCreatedEmail` in
`src/lib/email/ticket-created-notification.ts`, subject `[##{ticketNumber}##] Your ticket has been
created`) sends **`inbox.ticket_number`** — the plain integer `serial` column on the `inbox` table
(migration 025), e.g. `1`, `2`, `42`. It is populated by `notifyCustomerTicketCreated()`
(`src/lib/desk/customer-view-access.ts:108`), called from:
- `src/app/api/cron/email-poll/route.ts:237` — on genuine first-creation of a new native Desk
  Mailbox ticket (`newTicket.ticket_number` from the just-inserted `inbox` row).
- `src/app/api/desk/tickets/[ticketId]/resend-notification/route.ts:44` — task 380's manual resend.
- `src/app/api/v2/projects/[projectId]/tickets/route.ts:114` — task 381's "File a Ticket" flow,
  using the originating `inbox` row's `ticket_number`.

This is **not** the same value as the `displayId` shown under the ticket title in the Tickets table
(the `-TKT####` human-readable id from migration 089/task 189) and **not** the Zoho-style prefix
seen in the screenshot's ticket rows (e.g. `4770643802-TKT0001`) — those are cosmetic/import-era
identifiers on different rows/tables. The email's `[##N##]` number is always the bare `inbox`
table's own auto-incrementing sequence value.

## Implementation Notes

### What Changed
- Retuned `GRID_COLS` in `_filed-issues-table.tsx` so the table's total `min-w` (1320px) fits under
  the page container's 1336px max content width, making `Created` always visible without
  horizontal scroll. `Ticket` track changed from a bare `1fr` to `minmax(0,1fr)` so a long,
  unbroken title can no longer force the row wider than the declared `min-w`.

### Files Changed
- `src/app/(hub)/desk/tickets/_filed-issues-table.tsx` — `GRID_COLS` constant (line ~33) retuned
  from `grid-cols-[1fr_90px_130px_150px_130px_110px_120px_145px_150px_90px] min-w-[1565px]` to
  `grid-cols-[minmax(0,1fr)_70px_110px_130px_115px_95px_120px_145px_150px_75px] min-w-[1320px]`;
  comment above it updated to explain the task-384 root cause and the new numbers.

### Deviations From Plan
- The plan's suggested starting point also shrank `Responded` (120→105), `Due date` (145→125), and
  `Created` (150→140) as one option, explicitly flagged "last resort." Left all three at their
  original task-383 values instead — shrinking only Origin/Project/Assignees/Status/Severity/Logged
  already brings the total to 1320px (16px of margin under the 1336px container ceiling), so
  touching the three columns task 383 protected from clipping wasn't necessary. This is strictly
  more conservative than the plan, not a scope change.
- Live browser verification (Implementation Steps 2-4 / Acceptance Criteria's visual checks) was
  **not run** — the Claude in Chrome extension reported not connected in this session
  ("Browser extension is not connected... ensure the Claude browser extension is installed and
  running"). `pnpm dev` was started and confirmed serving (`curl` 200 on `localhost:3000`) as a
  smoke check only, then stopped; no in-browser visual confirmation of column widths/clipping was
  possible. This should be verified in a browser before this ships, per the task's own acceptance
  criteria.

### Verification Run
- `npx tsc --noEmit` - PASS (0 errors)
- `pnpm lint` - PASS (0 errors, 2 pre-existing unrelated warnings in
  `_checklist-tab.tsx` — unchanged by this task)
- `pnpm dev` + manual browser check - SKIPPED (Claude in Chrome extension not connected in this
  session; dev server smoke-tested via `curl` only, then stopped)

## Quality Gate Notes

### Result
PASS

### Standards Review
- `git diff --name-only` matches exactly the files listed in Implementation Notes
  (`TASKS.md`, `_filed-issues-table.tsx`) plus the new task doc — no untracked/out-of-scope files
  touched.
- Diff is minimal and scoped to the `GRID_COLS` constant and its adjacent comment blocks; no
  unrelated refactoring, no new abstractions, no dead code introduced.
- Found and fixed one stale-comment issue during review: the "No `rounded-b-[14px]
  overflow-hidden` wrapper" comment (line ~119) hardcoded the old `min-w-1565px` value as a
  worked example; now references `GRID_COLS`'s `min-w` generically instead of a number that would
  go stale on the very next retune. Re-ran `tsc`/`lint` after this fix — both still PASS.
- Arbitrary-value Tailwind classes (`grid-cols-[...]`, `min-w-[1320px]`) are a continuation of the
  existing task-363/383 pattern for this exact grid, not a new violation — CLAUDE.md's
  "prefer scale classes" rule explicitly excepts values with no scale-step equivalent, and there is
  no Tailwind scale step for an exact 10-column `grid-template-columns` layout.
- No secrets, no debug logging, no `any`/untyped escape hatches — the change is a single string
  constant.

### Deviations
- Minor: implementation left `Responded`/`Due date`/`Created` at their original task-383 pixel
  values instead of also shrinking them per the task doc's suggested starting point. The task doc
  itself flagged that option as a "last resort," and the more conservative choice already hits the
  target (1320px, 16px under the 1336px container ceiling) without touching the three columns
  383 protected from clipping — this reduces risk relative to the plan's own suggestion, not scope
  creep. Documented in Implementation Notes.
- Minor: full in-browser visual verification (Acceptance Criteria's clipping/visibility checks)
  was not performed — Claude in Chrome extension unavailable this session. This is a testing gap,
  not a code-quality issue; flagged for the `test` stage / a manual pass before ship, consistent
  with how numerous other recent tasks in `TASKS.md` shipped to Testing with browser acceptance
  pending.

### Required Fixes
- None.
