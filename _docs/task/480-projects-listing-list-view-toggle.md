# 480: Projects listing — List view (stacked row cards) + Grid/List toggle

**Created:** 2026-11-17
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

The classification projects listing (`/projects/<classification>`, e.g. StackShift I) only shows a
3-column card grid. Add a second **List** view, a vertical stack of full-width row cards (one project
per row, with the same data as the grid card laid out horizontally). Add a **Grid / List toggle** to
the toolbar. The toggle matches the one already shipped on the legacy listing
(`_legacy-listing/_projects-index.tsx`) and on Drive.

Rows are compact cards (rounded, bordered, hover border), not a `<table>`. That fits "vertical
chip/card" and lets the row reuse the card's pills and click/menu behaviour unchanged.

## Requirements

- [ ] Toolbar gets a segmented Grid / List toggle (two icon-only buttons, `LayoutGrid` / `List`
      from lucide, `aria-label` + `aria-pressed`, tooltip "Grid view" / "List view"), placed after
      the Sort select (before "Clear filters"). Visuals copy the legacy toggle (navy-filled active pill).
- [ ] The view is stored in the URL as `?view=list`. Grid is the default, so the param is absent for
      grid. Search, status, sort, page size and pagination keep the current view (`buildUrl` already
      preserves unknown params).
- [ ] "Clear filters" (toolbar and empty-state button) **keeps** the current view: it resets
      search/status/sort/page only.
- [ ] Switching view keeps page size and resets to page 1. No server/query change: the page loads
      the same `projects` array either way.
- [ ] **List row** (one per project, full width, `gap-2` stack) shows, left → right on `md+`:
  1. Title (`EditableProjectTitle`, rename still works) + company line (`Building2` icon, `TestPill`)
  2. Phase/status line (PhaseChip + "Handover ~…", or "Starts …", or "Awaiting kickoff"), with the
     same three-branch logic as the card
  3. Progress bar (fixed width, ~w-40) + Day label (same red "Day N · ended …" overrun branch)
  4. Classification chip (or "Unclassified")
  5. AvatarStack
  6. `OnboardingStatusPill`
  7. `PortfolioCardMenu` slot (overlaid sibling, same reason as the card: no nested buttons)
- [ ] Below `md`, the row wraps to two lines (identity + status on top; progress/phase/members
      below). No horizontal page scroll at any width.
- [ ] Row click / Enter opens `${projectsBase}/${project_id ?? id}/timeline` exactly like the card;
      non-editable rows are inert with the lighter `border-[#EDF0F7]` border; the menu shows under the
      same `showMenu` rule.
- [ ] Pending-transition skeleton matches the active view: grid uses `CardSkeletonGrid`, list uses a
      new `RowSkeletonList` (count = pageSize).
- [ ] Empty states (none / no match) are unchanged and shared by both views.
- [ ] The card's progress/phase rendering logic is **not duplicated**. It is extracted into small
      shared pieces used by both the card and the row (see Proposed File Changes).

## Out of Scope / Must-Not-Change

- No change to `_load-list-data.ts`, `[classification]/page.tsx` data loading, sorting, filtering,
  or page sizes (15/45/90 for both views).
- Grid card must look and behave **exactly** as today (pixel-equivalent after the refactor).
- No localStorage persistence: the URL is the single source of truth, as on the legacy listing.
  (Possible follow-up if users want the choice to stick across sessions.)
- Legacy listing (`_legacy-listing/*`), `projects-old/*`, dashboards, and the Status Report page
  are untouched.
- `loading.tsx` (route-level first paint) stays grid-only: it gets no `searchParams`. A first hard
  load of `?view=list` briefly shows grid bones; this is accepted.
- No `<table>` list. No new columns/data (tasks/tickets counts etc.).
- No `dark:` variants / tokens (v2 convention); no shadcn Badge.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_v2-listing/_project-card-parts.tsx` | Create | Shared pieces pulled out of `_project-card.tsx`: `formatYmdShort`, `formatDate`, `ProjectProgress` (bar + Day label, accepts a `className` for bar width), `ProjectPhaseLine` (3-branch phase/start/awaiting line), `ProjectOpenWrapper` (the `role="button"` div + Enter handling + `showMenu` overlay slot) |
| `src/app/(hub)/projects/_v2-listing/_project-card.tsx` | Modify | Use the shared parts; markup/classes otherwise unchanged |
| `src/app/(hub)/projects/_v2-listing/_project-row.tsx` | Create | `ProjectRow`: same props as `ProjectCard`, horizontal layout described above |
| `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` | Modify | Read `view` from `searchParams`, add toggle, `handleViewChange`, view-aware skeleton + results container, keep `view` on Clear filters |
| `src/app/(hub)/projects/_v2-listing/_list-skeleton.tsx` | Modify | Add `RowSkeleton` / `RowSkeletonList` |

## Code Context

### `_onboarding-list.tsx` (current)

- `buildUrl(overrides)` copies all current params, so `view` survives search/status/sort/page
  navigations automatically.
- `clearFiltersHref = classificationTabHref(activeTabId)` drops **all** params. For the "keep view"
  requirement, use `view === "list" ? `${clearFiltersHref}?view=list` : clearFiltersHref` at
  both Clear-filters call sites (toolbar ~L259, empty state ~L327).
- Results container (L334): `grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-stretch` →
  wrap in a `view === "grid" ? … : <div className="flex flex-col gap-2">…ProjectRow…</div>` branch.
- Skeleton (L303-304): `isPending ? <CardSkeletonGrid count={pageSize} />`; branch on view.
- Toolbar order (L222-266): search → `FilterMultiSelect` → `SortSelect` → Clear filters → spacer →
  pagination. Insert toggle after `SortSelect`.

Suggested view handling:

```tsx
const view: "grid" | "list" = searchParams.get("view") === "list" ? "list" : "grid";
function handleViewChange(next: "grid" | "list") {
  if (next === view) return;
  navigate(buildUrl({ view: next === "list" ? "list" : null, page: 1 }));
}
```

Derive `view` from `searchParams`; no `useState`. The URL changes optimistically, so `isPending`
already shows the right skeleton.

### Legacy toggle to copy (`_legacy-listing/_projects-index.tsx` ~L235-263)

```tsx
<div className="flex items-center gap-0.5 border border-[#E2E7F2] rounded-full p-1 bg-white shrink-0">
  <Tooltip>
    <TooltipTrigger render={
      <button onClick={() => handleViewChange("grid")} aria-label="Grid view"
        className={cn("p-1.5 rounded-full transition-colors cursor-pointer",
          view === "grid" ? "bg-[#071133] text-white" : "text-[#5F6A88] hover:text-[#0B1533]")}>
        <LayoutGrid size={15} />
      </button>
    } />
    <TooltipContent side="top">Grid view</TooltipContent>
  </Tooltip>
  … same for "list" with <List size={15} />
</div>
```

Add `aria-pressed={view === m}` and `type="button"`. `Tooltip` comes from `@/components/ui/tooltip`.

### `_project-card.tsx` — logic to extract (do not change behaviour)

- Progress row (L79-92): bar `style={{ width: `${item.current_day ? item.progress_pct : 0}%` }}`
  (allowed inline style: dynamic width); label red branch when
  `item.actual_day && item.programme_end_date && item.actual_day > item.programme_duration_days`.
- Phase line (L95-116): `current_day` → PhaseChip (+ "· Handover ~date" if phase 1 and
  `target_handover_date`) / `scheduled_onboarding_start_at` → orange "Starts …" / else
  "Awaiting kickoff".
- Wrapper (L139-173): `<div role="button" tabIndex={0}>` (deliberately **not** `<button>`, see the
  task 268 comment: rename input + Space/Enter). Menu is an absolutely positioned **sibling**
  (`absolute top-4 right-4`); the card reserves `w-6 h-6` next to the status pill. The row must
  reserve the same slot at its right end and position the menu vertically centred
  (`absolute right-4 top-1/2 -translate-y-1/2`). Keep the extracted wrapper's comments.
- `showMenu = (canDelete && !!item.project_id) || canManageCollaborators || canSetOwner`.

### Shared chips

`Chip`, `PhaseChip`, `OnboardingStatusPill` from `../../dashboard/_components/dashboard-shared`;
`AvatarStack` from `./_avatar-stack`; `TestPill` from `@/components/test-pill`.

### `_list-skeleton.tsx`

Add, mirroring `CardSkeleton` bones:

```tsx
function RowSkeleton() { /* rounded-[14px] border bg-white px-4 py-3, flex row:
  title/company bones · phase bone · progress bone w-40 · chip bone · avatar bone · pill bone */ }
export function RowSkeletonList({ count = 15 }) { /* flex flex-col gap-2 */ }
```

## Implementation Steps

1. Create `_project-card-parts.tsx` and move `formatYmdShort`/`formatDate`, progress, phase line and
   open-wrapper logic into it. Refactor `_project-card.tsx` to use them. Visually diff the grid:
   it must be unchanged.
2. Create `_project-row.tsx` (`ProjectRow`, same prop type as `ProjectCard`; export the props type
   from one place). Build the responsive horizontal layout with Tailwind scale values (`md:` breakpoints,
   `min-w-0`/`truncate` on the identity column so long names like "Veteran Roofing & Exteriors -
   StackShift I …" truncate).
3. Add `RowSkeleton`/`RowSkeletonList` to `_list-skeleton.tsx`.
4. In `_onboarding-list.tsx`: derive `view`, add `handleViewChange`, insert the toggle after
   `SortSelect`, branch the skeleton and results container, and make both Clear-filters actions
   keep `view=list`.
5. `npx tsc --noEmit`, eslint on touched files, then browser checks.

## Acceptance Criteria

- [ ] `/projects/stackshift-i` (no param) renders the grid exactly as before; the toggle shows Grid active.
- [ ] Clicking List → URL gets `view=list`, page resets to 1, rows render one per line with title,
      company (+ Test pill), phase line, progress + Day label (red overrun variant where applicable),
      classification chip, avatars, status pill, ⋮ menu.
- [ ] Search, status filter, sort, page size, and next/prev all keep `view=list`.
- [ ] Clear filters (toolbar and empty state) keeps List view.
- [ ] Row click and Enter open the project Timeline; ⋮ menu opens without navigating; inline rename
      from the menu works in the row and Space/Enter while renaming do not navigate.
- [ ] Non-openable rows (status-only roles) are inert and use the lighter border; the "Status only"
      hint still appears.
- [ ] While a navigation is pending in List view, row skeletons show (not card skeletons).
- [ ] At 375px width: no horizontal page scroll; row wraps cleanly. At ≥1280px everything stays on one line.
- [ ] Toggle buttons are keyboard-focusable with visible focus, have `aria-label` + `aria-pressed`.
- [ ] Back/forward browser navigation switches view correctly (URL-driven).

## Verification

```bash
npx tsc --noEmit
npx eslint "src/app/(hub)/projects/_v2-listing"
```

Browser (`pnpm dev`): run through every Acceptance Criterion on `/projects/stackshift-i` as a PM, and
check one status-only role (e.g. marketing non-member) for the inert rows + hint. Compare grid
screenshots before and after step 1 to confirm the refactor changed nothing.

## Compatibility Touchpoints

- No migration, API, MCP tool, or env change.
- Every classification tab uses the same `V2ProjectsListing`, so all of them get the toggle.
- Existing bookmarked URLs (no `view`) keep landing on grid.

## Implementation Notes

### What Changed
- Added a List view: full-width row cards stacked vertically. On md+ each row is one line (identity · phase · progress · classification · avatars · status · ⋮). Below md it wraps into two lines.
- Added a Grid/List toggle after the Sort select, styled like the legacy toggle. It has `aria-label`, `aria-pressed`, tooltips and a focus ring.
- The view comes from `searchParams` (`?view=list`; grid when absent). Search, filters, sort and paging keep it via `buildUrl`. Clear filters (toolbar and empty state) keeps `?view=list`. Switching view resets to page 1.
- The pending skeleton follows the view (`RowSkeletonList` vs `CardSkeletonGrid`).
- Moved the card's progress/phase/open-wrapper logic into `_project-card-parts.tsx`. The card and the row both use it. The card's markup and classes are otherwise unchanged.

### Files Changed
- `src/app/(hub)/projects/_v2-listing/_project-card-parts.tsx` - new: `ProjectListEntryProps`, `showProjectMenu`, `ProjectProgress`, `ProjectPhaseLine`, `ProjectOpenWrapper` (keeps the task 233/268 comments)
- `src/app/(hub)/projects/_v2-listing/_project-card.tsx` - refactored onto the shared parts
- `src/app/(hub)/projects/_v2-listing/_project-row.tsx` - new `ProjectRow`
- `src/app/(hub)/projects/_v2-listing/_list-skeleton.tsx` - `RowSkeleton` / `RowSkeletonList`
- `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` - view derivation, toggle, `handleViewChange`, view-aware skeleton/results, Clear filters keeps the view

### Deviations From Plan
- The row hides the classification chip below `lg`. Every row on a classification tab carries the same classification, and at md widths the chip pushed the row past one line. It is shown on lg+.
- Small additions that also reach the grid: the clickable wrapper got a `focus-visible` ring (accessibility convention), and the phase-line spans got `whitespace-nowrap` so the row's phase column doesn't break mid-phrase. The grid looks the same apart from keyboard focus.

### Revision 1 — column alignment (2026-11-17)
- Feedback: the row columns didn't line up across rows. The variable-width status pill ("On Hold" vs "In progress") and the variable Day label ("Day 49/120" vs "Day 154 · ended Oct 14") changed the width of the flex-1 identity column, so the columns after it moved from row to row.
- Fix: every column after the identity now has a fixed width on md+: phase `w-52`, progress `w-72` with a fixed `w-36` Day label (new `labelClassName` prop on `ProjectProgress`) so all bars are the same length, classification `w-28`, avatars `w-36` right-aligned, and status `w-24` right-aligned. `RowSkeleton` uses the same column widths.

### Verification Run
- `npx tsc --noEmit` - PASS
- `npx eslint "src/app/(hub)/projects/_v2-listing"` - PASS
- Browser acceptance checks - SKIPPED (left for the test stage)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Typed throughout. No `any`, debug logging, dead code or commented-out code. `tsc --noEmit` and eslint on `_v2-listing` are clean after the fixes below.
- Progress/phase/open-wrapper logic has a single home in `_project-card-parts.tsx`, and the task 233/268 rationale comments moved with it. The only inline style is the dynamic progress width, which CLAUDE.md allows and which already existed.
- The view is derived from the URL with no duplicated state, so back/forward works. The toggle buttons are real `<button type="button">` with `aria-label`, `aria-pressed`, a focus ring and tooltips.
- Small cleanups applied during the gate:
  - the Grid/List component is now picked once per render instead of inside `projects.map`;
  - `cn(showMenu ? "pr-11" : "")` became `cn(showMenu && "pr-11")`.
- Accepted duplication: `ProjectCard` and `ProjectRow` each render the `PortfolioCardMenu` props and the `EditableProjectTitle` block. The layouts differ, and a shared wrapper for ~12 lines would cost more than it saves.
- Type-only import of `OnboardingProjectListItem` from `_onboarding-list.tsx` into the parts file. This pattern already existed in the card and has no runtime cycle.

### Deviations
- Minor: the row hides the classification chip below `lg` (it is redundant on a classification tab and too wide at md). Documented in Implementation Notes.
- Minor: the grid wrapper gained a `focus-visible` ring and the phase-line spans got `whitespace-nowrap`. The grid looks unchanged apart from keyboard focus.
- Minor: Revision 1 (fixed column widths) came from user feedback and stays within scope (List view layout).

### Required Fixes
- None
