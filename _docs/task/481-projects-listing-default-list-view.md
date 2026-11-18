# 481 — Projects listing: default to List view instead of Grid

**Priority:** LOW · **Type:** enhancement · **Recommended Tier:** `fast` · **Date:** 2026-11-18
**Follows:** 480 (added the Grid/List toggle; currently in Testing)

## Overview

On `/projects/<classification>` the Grid/List toggle (task 480) defaults to Grid: no URL param = grid,
`?view=list` = list. Flip it: **no param = List**, `?view=grid` = Grid.

## Requirements

- [ ] Bare `/projects/<classification>` (and `/projects` → redirect) renders the List view.
- [ ] Clicking Grid writes `?view=grid`; clicking List removes the `view` param.
- [ ] Old links with `?view=list` still render List (any value other than `grid` = list).
- [ ] "Clear filters" keeps the current view (toolbar + empty state): grid keeps `?view=grid`, list has no param.
- [ ] Route-level `loading.tsx` shows the List skeleton (`RowSkeletonList`) instead of `CardSkeletonGrid`,
      so first load doesn't flash grid → list.
- [ ] Toggle order is List, Grid (amended 2026-11-18 at the user's request; was "no reorder").
- [ ] Kebab (3-dot) menu works in List view (amended 2026-11-18, user-reported bug from 480).

## Out of Scope / Must Not Change

- Legacy listing `/projects/legacy` (`_legacy-listing/`, `legacy/page.tsx`) — stays Grid default (see D1).
- No per-user persisted preference (see D2); URL stays the only source of truth.
- Card/row components, page sizes (`PAGE_SIZES` 15/45/90 shared by both views), data loading, queries.

## Proposed File Changes

| File | Change |
|------|--------|
| `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` | Invert view parsing, `clearFiltersHref`, `handleViewChange`; update task-480 comment |
| `src/app/(hub)/projects/_v2-listing/loading.tsx` | `CardSkeletonGrid count={9}` → `RowSkeletonList` |

## Code Context

`_onboarding-list.tsx` (current):

```ts
// :84  Task 480 — Grid (default, no URL param) or List (`?view=list`).
// :116
const view: ListingView = searchParams.get("view") === "list" ? "list" : "grid";
// :120
const clearFiltersHref = view === "list" ? `${classificationHref}?view=list` : classificationHref;
// :140
function handleViewChange(next: ListingView) {
  if (next === view) return;
  navigate(buildUrl({ view: next === "list" ? "list" : null, page: 1 }));
}
```

Other view-dependent lines need no change (they read `view`): `:117` `ProjectEntry`, `:344` skeleton
during transition, `:374` container classes.

`loading.tsx` imports from `./_list-skeleton`, which already exports `RowSkeletonList({ count })`
(task 480, mirrors `_project-row.tsx`).

Grep evidence: `grep -rn 'view=list\|view=grid\|get("view")' src` → only `_onboarding-list.tsx:84,116,120`
(plus unrelated `api/drive/route.ts`). No other code links to `?view=list`.

## Implementation Steps

1. `_onboarding-list.tsx:116` → `searchParams.get("view") === "grid" ? "grid" : "list"`.
2. `:120` → `view === "grid" ? \`${classificationHref}?view=grid\` : classificationHref`.
3. `:142` → `buildUrl({ view: next === "grid" ? "grid" : null, page: 1 })`.
4. `:84` comment → `Task 481 — List (default, no URL param) or Grid (\`?view=grid\`); task 480 had grid default.`
5. `loading.tsx`: import `RowSkeletonList` instead of `CardSkeletonGrid`; render `<RowSkeletonList count={9} />`.

## Acceptance Criteria

| # | Check | Expected | When |
|---|-------|----------|------|
| 1 | `npx tsc --noEmit` | passes | pre-merge |
| 2 | `pnpm exec eslint "src/app/(hub)/projects/_v2-listing"` | no new errors | pre-merge |
| 3 | Browser: open `/projects` (fresh) | lands on a classification tab showing row cards; List button `aria-pressed=true` | pre-merge, manual |
| 4 | Browser: click Grid | URL has `?view=grid`, 3-col cards | pre-merge, manual |
| 5 | Browser: in grid, set a status filter then Clear filters | URL is `<tab>?view=grid`, still grid | pre-merge, manual |
| 6 | Browser: click List | `view` param removed, rows shown, page reset to 1 | pre-merge, manual |
| 7 | Browser: open `<tab>?view=list` | List view (old links still work) | pre-merge, manual |
| 8 | Browser: hard-reload a tab with network throttled | loading skeleton is rows, not cards | pre-merge, manual |
| 9 | **No regression:** open `/projects/legacy` | still Grid by default | pre-merge, manual |
| 10 | **No regression:** in list view, change page size / page / sort | view stays List, results correct | pre-merge, manual |

Browser checks are manual: no test runner is configured (CLAUDE.md).

## Verification

`npx tsc --noEmit`, eslint on the folder, then browser steps 3–10.

## Coordination

- **480** (Testing) — same file `_v2-listing/_onboarding-list.tsx` (and introduced `loading.tsx`'s skeleton
  helpers). Land **after 480** passes browser checks; 480's requirement "Grid is the default" is superseded
  by this task — update 480's test notes if they're still being run.
- No other Planned / In Progress task touches `_v2-listing/` (checked 460, 458, 452, 431, 430, 423, 408,
  373, 194, 429, 321, 048, 056). 429 touches the Timeline/listing *data* (programme engine), not this view toggle.

## Open Decisions

- **D1 — NON-BLOCKING:** Also default `/projects/legacy` to List? Default: **no**, the request is about the
  main Projects listing; legacy keeps Grid.
- **D2 — NON-BLOCKING:** Remember each user's last choice (like `_use-last-tab.ts`)? Default: **no**, URL only.

## Operator Steps

None: merge is enough.

## Baseline

- `npx tsc --noEmit` — PASS (no output)
- `pnpm exec eslint "src/app/(hub)/projects/_v2-listing"` — PASS (no output)
- Both already passed before the change, so neither proves the new default; only browser checks 3–10 do.

## Implementation Notes

### What Changed
- No `view` param now means List; `?view=grid` means Grid. Any other value (including old `?view=list`) means List.
- The Grid button writes `?view=grid` and the List button removes the param. Clear filters keeps `?view=grid` when in grid.
- The route-level loading skeleton shows rows (`RowSkeletonList count={9}`) instead of cards.

### Files Changed
- `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` - flipped view parsing, `clearFiltersHref`, `handleViewChange`, and the comment
- `src/app/(hub)/projects/_v2-listing/loading.tsx` - row skeleton on first load

### Deviations From Plan
- None. Could not re-read the doc from the integration branch: CLAUDE.md forbids git commands, so the local copy (written this session) was used.

### Verification Run
- `npx tsc --noEmit` - PASS (baseline: pass → now: pass)
- `pnpm exec eslint "src/app/(hub)/projects/_v2-listing"` - PASS (baseline: pass → now: pass)
- Browser checks 3–10 - SKIPPED (left for the `test` stage; not run yet)

### Attempts That Failed
- None

### Operator Steps
- None: merge is enough (two client/route files, no shared module imported elsewhere, no migration).

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. The diff is 4 lines in `_onboarding-list.tsx` plus the skeleton swap in `loading.tsx`. There's no dead code, and `CardSkeletonGrid` is still used at `_onboarding-list.tsx:344`, so it stays exported.
- Edge cases read through: an old `?view=list` URL parses as list, and `buildUrl` carries the stale param through filter/page changes. That's harmless, and it's replaced by `view=grid` or deleted on the next toggle. Clicking List while on `?view=list` is a no-op (`next === view`), which is fine.
- Changed files were taken from Implementation Notes, not `git diff --name-only`: CLAUDE.md forbids git commands.

### Deviations
- None.

### Acceptance Criteria Coverage
- 1–2 (tsc/eslint) can fail but already passed at baseline, so they're weak evidence for the behaviour.
- 3–10 are manual browser checks and can fail. They're the real proof and haven't been run yet.

### Required Fixes
- None.

## Amendment (2026-11-18, user request after quality gate)

### Changes
- `_onboarding-list.tsx` `VIEW_OPTIONS`: order is now List, Grid.
- `_project-row.tsx` `menuClassName`: `md:top-1/2 md:-translate-y-1/2` → `md:top-0 md:bottom-0 md:flex md:items-center`.

### Kebab bug root cause (task 480 code)
`PortfolioCardMenu` positions its dropdown and click-away backdrop with `position: fixed`, using viewport coordinates from `getBoundingClientRect()` (`_portfolio-card-menu.tsx:56-60, 122-125`). The List row's menu container had `-translate-y-1/2`. A transformed ancestor becomes the containing block for `fixed` descendants, so the dropdown was offset by the container's own viewport position and the "inset-0" backdrop shrank to the 24px container. The Grid card's container (`top-4 right-4`) has no transform, which is why Grid worked. Centring now uses flex, with no transform.

### Added acceptance checks
| # | Check | Expected | When |
|---|-------|----------|------|
| 11 | Browser: List view, click a row's 3-dot button (md+ width and <md width) | dropdown opens directly under the button; clicking outside closes it; View/Rename/Delete actions work | pre-merge, manual |
| 12 | Browser: toolbar toggle | List button is first (left), Grid second | pre-merge, manual |
| 13 | **No regression:** Grid view kebab | still opens under the button | pre-merge, manual |

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm exec eslint "src/app/(hub)/projects/_v2-listing"` - PASS
- Browser checks 11–13 - SKIPPED (not run yet)

## Amendment 2 (2026-11-18): remove classification chip

**Decision (via AskUserQuestion):** remove the classification chip from both views. Each tab is already one classification (`_load-list-data.ts:122` keeps rows whose `classification` = tab or whose `classifications` contains it), so the chip repeated the tab name and "Unclassified" could never render. Classifications stay viewable and editable via the 3-dot menu's Update Classification.

### Changes
- `_project-row.tsx`: dropped the `lg+` classification column and the unused `Chip` import.
- `_project-card.tsx`: dropped the footer chip and the `Chip` import; the footer is now `justify-end`, so the avatars stay right-aligned.
- `_list-skeleton.tsx`: removed the matching placeholder bones from `RowSkeleton` and `CardSkeleton`.
- No data change: `item.classification` is still loaded.

### Added acceptance checks
| # | Check | Expected | When |
|---|-------|----------|------|
| 14 | Browser: any classification tab, List and Grid | no classification chip; avatars right-aligned in the Grid footer | pre-merge, manual |
| 15 | **No regression:** 3-dot → Update Classification | dialog opens with the project's classifications checked | pre-merge, manual |

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm exec eslint "src/app/(hub)/projects/_v2-listing"` - PASS
- Browser checks 14–15 - SKIPPED (not run yet)

## Amendment 3 (2026-11-18): view switch without refetch

**User report:** switching view showed a skeleton, and it was the wrong one: List showed the Grid skeleton and vice versa.

**Root cause:** `handleViewChange` called `navigate()`, which is `startTransition(() => router.push(url))`. That re-ran the server page (an RSC fetch) even though the server never reads `view` (`[classification]/page.tsx` and `_load-list-data.ts` don't touch it). `isPending` showed the skeleton overlay while `view` was still derived from the *old* URL, hence the mismatched skeleton.

**Fix:** `_onboarding-list.tsx` `handleViewChange` now calls `window.history.pushState(null, "", buildUrl({ view }))`. Next.js syncs `useSearchParams` with it (`node_modules/next/dist/docs/01-app/01-getting-started/04-linking-and-navigating.md`, "Native History API"). Since nothing is refetched, the page is kept (the old `page: 1` reset is dropped), and back/forward still moves between views. The skeleton for filter/sort/page transitions is unchanged and correct, because during those transitions `view` doesn't change.

### Verification Run
- `npx tsc --noEmit` - PASS; eslint `_v2-listing` - PASS
- Browser (localhost:3000/projects/stackshift-i, logged in): the toggle order is List, Grid with List pressed by default. Click Grid → URL `?view=grid`, 3-col grid, 0 `.animate-pulse` elements in 1s of 50ms sampling, 0 requests to localhost:3000. Click List → param removed, rows, 0 skeleton, 0 requests. PASS.
- Not run: kebab (11, 13), chip removal (14, 15), back/forward, legacy no-regression (9).
