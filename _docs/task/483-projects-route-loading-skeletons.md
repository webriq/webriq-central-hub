# 483 — Projects: restore route-level loading skeletons (classification listing, legacy, status report)

**Priority:** MEDIUM · **Type:** bugfix · **Recommended Tier:** `fast` · **Date:** 2026-11-18
**Follows:** 473 (moved the listing to `/projects/<slug>`), 481/482 (assumed the listing's `loading.tsx` was live)

## Overview

**User report:** clicking a Projects classification link in the sidebar freezes the UI. The RSC request shows in
Network, but the page only changes once the response arrives, and the skeleton no longer shows on first load.

**Root cause:** the listing skeletons live in `_v2-listing/loading.tsx` and `_legacy-listing/loading.tsx`.
Folders prefixed with `_` are Next.js private folders, never route segments, so a `loading.tsx` inside them is
dead code. Task 473 moved the listing to `[classification]/page.tsx`, a segment with no `loading.tsx`, and
`legacy/page.tsx` never had one. All three pages are `force-dynamic` with no Suspense boundary, so the router
can't commit the navigation until the whole RSC payload has arrived. `[classification]/status-report` had the
same gap.

## Requirements

- [x] Clicking a classification link shows the listing skeleton immediately, then streams in the data.
- [x] `/projects/legacy` shows the legacy listing skeleton immediately.
- [x] `/projects/<slug>/status-report` shows a status-report-shaped skeleton immediately.
- [x] The listing skeleton must **not** wrap project pages (`[classification]/[projectId]/…`) or the status report.

## Out of Scope / Must Not Change

- Skeleton designs: the existing `_v2-listing` / `_legacy-listing` skeletons are reused as they are.
- Data loading, queries, auth/role redirects, URLs.
- Project detail pages (`[projectId]` has no top-level `loading.tsx`; its `(tabs)/*` already have their own).

## File Changes

| File | Change |
|------|--------|
| `src/app/(hub)/projects/[classification]/page.tsx` → `[classification]/(listing)/page.tsx` | Moved into a route group (URL unchanged); relative imports `../` → `../../` |
| `src/app/(hub)/projects/[classification]/(listing)/loading.tsx` | New: re-exports `_v2-listing/loading` |
| `src/app/(hub)/projects/legacy/loading.tsx` | New: re-exports `_legacy-listing/loading` |
| `src/app/(hub)/projects/[classification]/status-report/loading.tsx` | New: back-link bar + `HeaderSkeleton` + `ToolbarSkeleton` (from `_v2-listing/_list-skeleton`) + 5 rows identical to `StatusReportTable`'s own loading rows |

**Why a route group:** `[classification]/loading.tsx` would also become the Suspense fallback for
`[projectId]` and `status-report`, flashing the listing skeleton when opening a project. `(listing)` limits it to
the listing page. `legacy/loading.tsx` needs no group, because `legacy/[projectId]/loading.tsx` already overrides
it for project pages.

## Acceptance Criteria

| # | Check | Expected | When |
|---|-------|----------|------|
| 1 | `npx tsc --noEmit` | passes (ignore stale `.next/types/validator.ts` errors for the old `[classification]/page.js` path; they clear on the next `pnpm dev`/build) | pre-merge |
| 2 | Browser, network throttled: click a sidebar classification link | URL + skeleton change at once; data replaces skeleton | pre-merge, manual |
| 3 | Browser: click Legacy in the sidebar | legacy skeleton at once | pre-merge, manual |
| 4 | Browser: listing → "Status report" | status-report skeleton at once, then the table's loading rows with no layout jump | pre-merge, manual |
| 5 | **No regression:** listing → open a project | no listing skeleton flash; project page loads as before | pre-merge, manual |
| 6 | **No regression:** `/projects/<slug>` URL, unknown slug 404, client-role redirect, saved Grid/List view (482) | unchanged | pre-merge, manual |
| 7 | **No regression:** `/projects/legacy/<id>` | still shows its own project skeleton | pre-merge, manual |

## Coordination

- **481 / 482 (Testing):** both edit or rely on the listing page now at `[classification]/(listing)/page.tsx`.
  Their docs cite `[classification]/page.tsx`, the pre-move path. 481's check 8 ("loading skeleton is rows")
  could never have passed before this fix.
- **482 edge case:** the route skeleton is always rows (List). A user whose saved view is Grid sees rows → grid on
  first load. Not fixed here: the fallback can't read the preference without a fetch.

## Open Decisions

None.

## Operator Steps

None: merge is enough. Restart `pnpm dev` once so the `.next` route types regenerate.

## Implementation Notes

### What Changed
- See File Changes. No logic changed: one file moved, three one-file `loading.tsx` added.

### Verification Run
- `npx tsc --noEmit`: PASS apart from the stale `.next/types` errors above.
- Browser checks 2–7: run 2026-11-18 on localhost:3000 (dev, logged in, no throttling). Timings measured by
  rAF sampling from the click.

| # | Result | Evidence |
|---|--------|----------|
| 2 | PASS | Sidebar → StackShift II / PipelineForge / StackShift I: URL + skeleton at 84 / 74 / 40 ms; RSC done at 3289 / 2651 / 2496 ms |
| 3 | PASS | Sidebar → Legacy: URL + skeleton at 83 ms (66 ms on a second run); RSC done at 3141 ms |
| 4 | PASS after fix | Status report skeleton at 282 ms, RSC done at 518 ms. First run: the rows **jumped 17 px** (route 244 → client 261) because the skeleton header was shorter than the real one (back link 14 vs 18 px, title block 46 vs 55, toolbar 36 vs 38). Fixed by pinning heights in `status-report/loading.tsx` (`h-4.5`, `min-h-17.75`, `min-h-10`); re-run: 261 → 261, no jump |
| 5 | PASS | Listing → project row: no listing skeleton (`.h-6.w-44.animate-pulse`) seen. **But** the URL changed only after 2902 ms, so project pages have the same freeze (see Follow-up) |
| 6 | PASS | `?view=grid` → Grid pressed, List not. Unknown slug renders "404 This page could not be found." + `noindex`, but HTTP status is now **200** (the response starts streaming before `notFound()` runs, which is normal for a page with `loading.tsx`). Client-role redirect not checked (no client account used) |
| 7 | PASS | Legacy → project: URL at 284 ms with a skeleton showing |

### Follow-up (not in this task)
- `[classification]/[projectId]` has no top-level `loading.tsx`, so opening a project still freezes ~2.9 s. A
  `[projectId]/loading.tsx` (or one inside `(tabs)` per tab) would fix it, but needs a project-page skeleton design.
- The sidebar uses `<button onClick={router.push}>` (`v2-hub-sidebar.tsx:275,329`), so it never prefetches.
  Switching to `<Link>` would make the skeleton show at 0 ms.

### Deviations From Plan
- None. The doc was written after the fix, at the user's request.

### Docs to update at the `document` stage
- `_docs/context/projects.md`: note that the listing page lives at `[classification]/(listing)/page.tsx`, and that
  `loading.tsx` must sit in a route segment, not in an `_` private folder.
