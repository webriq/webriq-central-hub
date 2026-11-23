# 499: StackShift Orders: instant loading skeleton on first load, tab switch, search and pagination (+ fewer server round trips)

**Created:** 2026-11-23
**Priority:** MEDIUM
**Type:** enhancement (UX + performance)
**Recommended Tier:** fast
**Status:** Completed

---

## Overview

On `/stackshift-orders`, a tab switch (Pending review / Converted / Dismissed / Archived), a search, or a page change leaves the old rows on screen with no feedback until the server responds. The page looks frozen.

There's a reason for this. `loading.tsx` only shows on the **first** visit. Next.js doesn't re-show a route's Suspense fallback when only the search params change on the same segment (the same finding as task 263 for the Projects listing).

The first-load skeleton (`stackshift-orders/loading.tsx`) exists, but it predates task 498. It has no menu column and its tab placeholder is sized for 3 tabs.

**Scope (D1):** the Orders list page. "Tab navigation" means its status tabs. Other pages are not covered.

## Requirements

### Skeleton everywhere on this page (display: instant, no extra requests)
- [ ] **One shared skeleton:** new `_components/orders-skeleton.tsx` exporting `OrdersTableSkeleton({ rows, withMenu })`. It's used by `loading.tsx` (first load) and by `orders-table.tsx` (in-page navigations), so the two can't drift.
  - It matches the real table: header + rows on `grid-cols-[1.3fr_1.2fr_1.4fr_120px]` and, with `withMenu`, the 44px menu column (task 498).
  - `Bone` uses `animate-pulse` on `#EDF0F7` (the existing look). Under `prefers-reduced-motion`, use `motion-reduce:animate-none` (design guide §5).
- [ ] **`loading.tsx`** uses `OrdersTableSkeleton` for the list, and its header placeholder fits 4 tab pills. First load: the route-level Suspense fallback streams right away, which already works and just needs updating.
- [ ] **`orders-table.tsx` uses `useTransition`** (`_onboarding-list.tsx:157-163`):
  - one `navigate(url)` = `startTransition(() => router.push(url))`, used by **every** list navigation: tab pills, the debounced search, Clear search, and the 4 pagination buttons
  - the row click into an order detail stays a plain `router.push` (a different route)
  - while `isPending`, the table body renders `OrdersTableSkeleton` (with `rows` = the current `pageSize`, capped at 20) **in place of** the rows or the empty state
  - the sticky header (title, search, tabs, pager) stays mounted and interactive, so typing never loses focus
  - `aria-busy={isPending}` on the results region
- [ ] **Instant tab feedback:** a `pendingTab` state is set on click, so the clicked pill shows as active immediately, before the server responds. It clears when the `tab` prop catches up: compare during render, no effect.
- [ ] Rows have a stable height, so the skeleton doesn't shift the layout when real rows replace it.

### Faster server response (fewer sequential round trips)
- [ ] `page.tsx` today: `getClaims` → profile → department → list → 4 counts (in parallel). That's **5 sequential round trips** on every tab switch or search.
  - Embed the department in the profile read: `select("role, departments(name)")` through the existing `profiles_department_id_fkey` (`database.ts:884`). That removes one.
  - Run the list query **and** the 4 counts in one `Promise.all`. That removes another, and the result is 3 sequential.
  - Keep the pre-191 fallback: if the list returns `42703`, re-run the list **and** the counts with `withFlags=false`. This only happens before migration 191.
- [ ] No caching or prefetch changes. The page stays `force-dynamic`, because the counts and the row menu must be fresh after an action.

## Out of scope / must not change

- Other pages' loading states. The order **detail** page (`[orderId]`) has no `loading.tsx`, so opening an order shows no skeleton. That's a separate small task if wanted (D2).
- Debounce timing (300ms), search semantics, URL params, page size, row content, and the row menu behaviour (task 498).
- Prefetching on hover, or client-side caching of tab results.

## Proposed File Changes

| File | Change | Est. lines |
|------|--------|-----------|
| `src/app/(hub)/stackshift-orders/_components/orders-skeleton.tsx` | new shared skeleton | ~45 |
| `src/app/(hub)/stackshift-orders/loading.tsx` | use the shared skeleton; 4-tab header placeholder | ~30 (was 56) |
| `src/app/(hub)/stackshift-orders/_components/orders-table.tsx` | `useTransition` + `navigate()`, `pendingTab`, skeleton while pending, `aria-busy` | ~255 → ≤ ~260; if it goes over, move the empty state into `orders-skeleton.tsx`'s sibling `_orders-empty.tsx` |
| `src/app/(hub)/stackshift-orders/page.tsx` | department embed; list ∥ counts | ~95 |

## Code Context

- `stackshift-orders/loading.tsx` (56 lines): `Bone`, `RowSkeleton` on the 4-column grid, 8 rows, a header placeholder `w-72` sized for 3 pills.
- `orders-table.tsx` `router.push` call sites: line 99 (search debounce), 111 (tab pill), 142 (pager map), 174 (Clear search). Line 202 (row → detail) stays as it is.
- `_onboarding-list.tsx:157-163,355-357`: the pattern to copy (`navigate()` + `isPending ? <Skeleton/> : …`).
- `_v2-listing/_list-skeleton.tsx`: the precedent for one skeleton module shared by `loading.tsx` and the transition overlay.
- `page.tsx:38-47` (profile then department), `:64-82` (list then counts).

## Implementation Steps

1. Capture the baseline (below). Then add `orders-skeleton.tsx` and switch `loading.tsx` to it.
2. `orders-table.tsx`: `useTransition`, `navigate()`, `pendingTab`, skeleton while pending, `aria-busy`.
3. `page.tsx`: the department embed, then list ∥ counts with the fallback kept.
4. Run tsc, eslint, `wc -l`, then the browser checks below.

## Acceptance Criteria

| # | Check | Expected | When |
|---|-------|----------|------|
| 1 | `npx tsc --noEmit` · `npx eslint` on the 4 files | clean | pre-merge |
| 2 | `wc -l` | `orders-table.tsx` ≤ ~260; others well under | pre-merge |
| 3 | Hard reload `/stackshift-orders` (DevTools "Slow 4G" throttling) | the skeleton shows the 4-tab header and the table with a menu column; no blank page | pre-merge |
| 4 | Click each tab under throttling | the clicked pill turns navy **immediately**; skeleton rows replace the table within one frame; then the real rows show; the URL updates | pre-merge |
| 5 | Type a search under throttling | the input keeps focus and every typed character; the skeleton shows after the 300ms debounce until results arrive; Clear search behaves the same | pre-merge |
| 6 | Pager next/prev/first/last (needs > pageSize rows: use `?pageSize=2`) | the skeleton shows during each page change | pre-merge |
| 7 | DevTools Performance or a screenshot pair: the layout when the skeleton swaps to rows | no visible jump in the header; the table width is stable | pre-merge (manual: visual) |
| 8 | Server timing: the dev log `GET /stackshift-orders?status=… 200 in Nms`, median of 5 tab switches, before vs after | after < before (3 vs 5 sequential round trips); record both | pre-merge |
| 9 | `prefers-reduced-motion: reduce` (DevTools Rendering emulation) | the skeleton is static (no pulse) | pre-merge |
| 10 | **No regression:** the row menu (498), row click → detail, Finance read-only (no menu column, and none in the skeleton either), the empty states, and counts on every tab are the same as before | unchanged | pre-merge |
| 11 | **No regression, before 191:** tabs and counts are the same as before the change (42703 fallback, still covering the counts) | unchanged | pre-merge |

## Verification

tsc, eslint and `wc -l`. Browser checks 3–7, 9 and 10 with Chrome DevTools throttling on a local dev server, signed in. These are read-only: no row actions are confirmed. Check 8 compares dev-log timings from before and after the change.

## Coordination

- **498** (Testing): edits the same `orders-table.tsx`, `page.tsx` and `_components/`. **Land after 498.** Build on 498's working-tree state; the skeleton must include 498's menu column.
- **423 / 429** mention stackshift-orders only for `lib/stackshift-orders/*` and the convert route. No file overlap.

## Open Decisions

- **D1 (NON-BLOCKING): scope.** Default: the Orders list page only (its status tabs, search, pagination and first load), since that's the page this work is on. If you meant tab navigation across the whole Hub, that's a separate, larger audit task.
- **D2 (NON-BLOCKING): order detail skeleton.** Default: out of scope. Adding `[orderId]/loading.tsx` is a small follow-up.

## Operator Steps

None: merge is enough. There's no migration, and the only deployable is the hub.

## Baseline

- `npx tsc --noEmit`: exit 0. `orders-table.tsx` 255 lines, `loading.tsx` 56.
- No skeleton on tab, search or pager navigation: `orders-table.tsx` used plain `router.push` and had no `isPending`. The first-load `loading.tsx` had no menu column and a 3-tab placeholder.
- **Server timing** (signed-in Chrome, `fetch('/stackshift-orders?status=<tab>', {headers:{RSC:'1'}})` after warm-up, 5 rounds × 4 tabs, n=20): **median 930 ms** (p25 914, p75 978, min 868, max 1364). The DB then did **not** have migration 191, so every request took the 42703 fallback: claims → profile → department → list (42703) → list → counts = **6 sequential round trips**.

## Implementation Notes

### What Changed
- **New `orders-skeleton.tsx`:** exports `Bone` (`animate-pulse motion-reduce:animate-none`) and `OrdersTableSkeleton({ rows, withMenu })`, which mirrors the real table including 498's 44px menu column. Bone heights are tuned so the header row (35 px) and body rows (61 px) match the real table exactly.
- **`loading.tsx`:** now uses the shared skeleton, with a 4-pill tab placeholder (56 → 30 lines).
- **`orders-table.tsx`:**
  - `useTransition` and one `navigate(overrides)` used by the tab pills, the search debounce, Clear search and the 4 pager buttons (the row → detail navigation is untouched)
  - while `isPending`, the results region renders `OrdersTableSkeleton` (`rows = min(pageSize, 20)`, `withMenu = !readOnly`); the sticky header stays mounted
  - `aria-busy` on the results region
  - `pendingTab` + `activeTab = isPending && pendingTab ? pendingTab : tab` gives instant pill feedback with no effect and no reset logic
- **New `orders-empty.tsx`:** the empty state moved out of the table, unchanged, to keep the table within the length guide (255 → 252 lines).
- **`page.tsx`:**
  - profile read embeds `departments(name)` and runs alongside `await searchParams`
  - list and the 4 counts run in one `Promise.all` (`countsFor()`)
  - on 42703, list **and** counts re-run without the 191 filters
  - 5–6 sequential round trips → 3 (2 more only on the pre-191 fallback)

### Files Changed
- `src/app/(hub)/stackshift-orders/_components/orders-skeleton.tsx` (new)
- `src/app/(hub)/stackshift-orders/_components/orders-empty.tsx` (new, extracted)
- `src/app/(hub)/stackshift-orders/_components/orders-table.tsx`
- `src/app/(hub)/stackshift-orders/loading.tsx`
- `src/app/(hub)/stackshift-orders/page.tsx`

### Deviations From Plan
- Minor: `pendingTab` resets implicitly. It's only read while `isPending`, so there's no compare-during-render step.
- Minor: the empty state was extracted (the plan's fallback when the table went over ~260; it hit 270).
- Minor: the skeleton's second text line and header bones are `h-3.5` (were `h-3`), after measuring a 2 px per-row jump (see below).

### Verification Run
- `npx tsc --noEmit`: PASS (exit 0 → 0). `npx eslint src/app/(hub)/stackshift-orders/`: PASS.
- `wc -l`: table 252, skeleton 52, empty 43, loading 30, page 97. PASS.
- **AC 3, first load:** fetched the document HTML. The streamed skeleton (`motion-reduce:animate-none`, `grid-cols-[1fr_44px]`, 4 tab pills) comes before any row markup. PASS.
- **AC 4, tab click** (Pending → Converted): 2 frames (32 ms) after the click, `aria-busy="true"`, the skeleton is rendered, and the pressed pill is already "Converted". Settled at 706 ms with 5 rows. PASS.
- **AC 5, search:** typed "Veteran". The skeleton showed at 311 ms (after the 300 ms debounce) and settled at 1035 ms. The input kept focus and its value through every sample; 1 result. PASS.
- **AC 6, pager** (`?pageSize=2`, Converted): Next, Last, Previous and First each showed the skeleton within 2 frames with 2 skeleton rows. **Clear search** (after a no-match search showed "No orders match your search") showed the skeleton, cleared the input and returned 2 rows. PASS.
- **AC 7, layout stability:** measured `[aria-busy]` card geometry before, during and after a page change.
  - Card top 232, width 1336 and header 148 are unchanged throughout.
  - The first run found skeleton rows 59 / header 33 vs real 61 / 35. After the fix: 61 / 35 during = 61 / 35 after. PASS.
- **AC 8, server timing** (same method as the baseline, n=20): **median 899 ms** (p25 839, p75 938, min 799, max 1349) vs 930 baseline.
  - Migration 191 was applied between the baseline and this run (by someone else, between my two measurements), so this ran the normal path (3 round trips) vs the baseline's fallback path (6).
  - **The gain is small (~30 ms median, ~75 ms p25)**: most of the ~0.9 s is dev-mode render overhead, not DB round trips. Prod numbers aren't measured. The skeleton is the user-visible improvement.
- **AC 9, reduced motion:** `motion-reduce:animate-none` is present on every Bone (seen in the streamed HTML). PASS. The emulated-media visual check wasn't run, because the extension can't toggle `prefers-reduced-motion`.
- **AC 10, no regression:** row menu present (`aria-label="Order actions"` on every row), counts render on all 4 tabs, and the empty state copy is unchanged. Finance read-only (no menu column in the table or the skeleton) was SKIPPED: no Finance user. In code, `withMenu={!readOnly}`.
- **AC 11, pre-191 fallback:** couldn't re-run, because the DB now has 191. The fallback code path is unchanged apart from also re-running the counts.

### Attempts That Failed
- The first `loading.tsx` tab placeholder used `[120, 96, 96, 92].map` with a `Math.random()` key and never applied a width. Replaced with static `w-30/w-24/w-24/w-22` classes and index keys before any check ran.
- Skeleton rows were 2 px shorter than real rows (59 vs 61), so the table jumped on swap. Fixed by raising two bone heights to `h-3.5`, then re-measured: equal.

### Operator Steps
- None: merge is enough. Hub-only, no migration.

### Note for the operator
- Migration 191 (task 498) **has been applied** to the shared DB since task 498's test run. The Orders counts now show Pending review 2 / Converted 5 / Dismissed 0 / Archived 4 (were 7 / 7 / 0 / 0), so someone has archived and/or deleted orders. Nothing in this task writes data.

## Quality Gate Notes

### Result
PASS (after one fix made in this stage)

### Standards Review
- **Fixed here: a stale `pendingTab`.**
  - Before: `pendingTab` was set only on tab clicks and never cleared. After clicking a tab and then leaving it another way (browser Back), a later pager or search navigation would show the old tab as active for the duration of `isPending`.
  - Now `navigate()` sets it on every navigation (`overrides.status ?? null`), and the tab onClick just calls `navigate`. tsc and eslint pass again.
- **`orders-table.tsx`:**
  - one `navigate()` for all list navigations; no effects added
  - the skeleton swap is a single ternary
  - `aria-busy` on the results region
  - the row → detail `router.push` is deliberately left outside the transition (a different route)
- **`orders-skeleton.tsx`:** small and single-purpose. Its `COLS` duplicates the table's `COLS` grid template (two literal copies). Accepted: both are static class strings Tailwind must see literally, and a shared export would couple the server `loading.tsx` to the client table module for one string.
- **`orders-empty.tsx`:** a verbatim move. Props are minimal, and `onClear` keeps the navigation in the table.
- **`page.tsx`:**
  - `Promise.all` for profile ∥ `searchParams` and for list ∥ counts
  - the fallback re-runs both on 42703 (the first round's counts are discarded, correctly)
  - the `departments(name)` embed is typed through `profiles_department_id_fkey`, and the browser run confirmed it resolves: the role was read and the menu rendered. An embed error would have redirected to the dashboard.
- **Design guide:**
  - skeletons rather than spinners (§5)
  - `motion-reduce:animate-none` (§5)
  - no layout shift (measured equal geometry)
  - existing tokens only
- **File lengths:** table 252, skeleton 52, empty 43, loading 30, page 97.
- **AC coverage:**
  - AC 1–8 ran with behaviour checks (timings, geometry, focus, `aria-busy`, DOM)
  - AC 9 is code-level (class present; emulated media not toggled), which is weak evidence
  - AC 10's Finance part was skipped (no user)
  - AC 11 couldn't run, because the DB now has 191
  - the AC 8 gain is small and was measured on different DB paths (pre/post-191), as recorded in the notes

### Deviations
- Minor (recorded in Implementation Notes):
  - `pendingTab` handling simplified, and now set per navigation
  - the empty state was extracted
  - skeleton bone heights were tuned to remove a 2 px row jump
- Medium, visible to the user: the server-time improvement is ~30 ms on the dev server, not a step change. The plan's round-trip reduction is done (5–6 → 3), but dev render time dominates. The user-visible gain is the instant skeleton.

### Required Fixes
- None remaining.
