# 493: Quick Links › Tasks and Tickets — sticky page header (search, filters, pagination) and sticky table column header

**Created:** 2026-11-20
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

On the Quick Links listings, scrolling down a long page should keep the **page header** (title, search, the task-491 filters, pagination) and the **table's column header row** in view, so the user can re-filter, re-search or read column names without scrolling back up.

### Current state, checked in the browser on 2026-11-20 (dev, 1568×945)

- **Tickets (`/desk/tickets`) already does this** (task 383 follow-up).
  - After scrolling the page scroller 548 px, the sticky page header stayed at `top 64` (148 px tall), and the column-header row stayed pinned right under it at `top 212`.
  - Mechanism: the whole page scrolls; a `sticky top-0` page header; a `ResizeObserver` measures that header's height and passes it to `FiledIssuesTable` as `stickyTop` for its sticky column-header wrapper.
- **Tasks (`/dashboard/tasks`) doesn't.** Title, toolbar and `<thead>` all scroll away (confirmed by screenshot).
  - The page is one `overflow-y-auto` scroller with an unsticky header block.
  - The table sits in a card with `overflow-hidden`, which would defeat a sticky `<th>` anyway.

### Pattern to follow: Projects › Tasks and Tickets tabs

`_shared/_list-view.tsx`, `_shared/_ticket-list-view.tsx`, `_shared/_tasks/_list-chrome.tsx`:

- The page root is `h-full flex flex-col min-h-0`.
- The toolbar is a `shrink-0` block **outside** the scroller, so it never moves and doesn't need to be sticky.
- Only the list region scrolls: `flex-1 min-h-0 overflow-y-auto scrollbar-light px-8 pb-5`.
- Inside it, the column header is `sticky top-0 z-10` on a card that is **not** `overflow-hidden`. The card's top spacing is a **margin**, not scroller padding, so the stuck header sits flush.
- `useStickyHeader()` (a zero-height sentinel plus an `IntersectionObserver`) squares off the header's top corners while it's stuck.

There's no height measuring at all: the header is outside the scroll area, so the column header just sticks at `top-0`.

## Requirements

- [ ] **Tasks page, restructured to the project-tab pattern:**
  - Root `h-full flex flex-col min-h-0`.
  - The title + subtitle + toolbar (search, Due date / Assignee / Project filters, Clear filters, page size, range, pager) become a non-scrolling `shrink-0` header, with the same `max-w-[1400px] mx-auto px-8` content width as today.
  - Below it, a `flex-1 min-h-0 overflow-y-auto scrollbar-light` scroller holds the table, empty states and error state.
- [ ] **Tasks column header sticks** at `top-0` of that scroller:
  - Sticky on the `<th>` cells (`sticky top-0 z-10`, keeping `bg-[#F9FAFD]`), plus the `border-b` hairline drawn so it stays visible while stuck. `border-collapse` tables drop a sticky cell's border, so use an inset `shadow-[inset_0_-1px_0_#E2E7F2]` or equivalent instead.
  - The card loses `overflow-hidden`; use `overflow-clip` (it doesn't create a scroll container, so `sticky` works) or the `useStickyHeader()` corner-squaring approach.
  - The card's top gap is a **margin** (`mt-…`), not scroller `pt-…`, so the stuck header is flush with the page header.
- [ ] **Separation cue:** once the list is scrolled (`scrollTop > 4`), the fixed page header shows the same hairline shadow the Tickets header uses (`shadow-[0_1px_0_0_rgba(7,17,51,0.08)]`, `transition-shadow`).
- [ ] **Behaviour kept:**
  - The task-491 pending dim (`aria-busy`, `opacity-60`) stays on the list region only.
  - Changing page, page size or a filter scrolls the list back to the top. Today the whole page reloads at the top; with an inner scroller it would keep the old offset.
  - Empty / filtered-empty / "Couldn't load tasks" states render inside the scroller unchanged.
- [ ] **Popovers stay usable from the sticky header:**
  - The Due date popover (absolute, `z-50`) must overlay the list.
  - Portaled Assignee/Project panels (`position: fixed`) must stay anchored to their trigger.
- [ ] **Tickets page: no behaviour change needed.** It already meets the request. Re-verify after this lands (scroll → header + column header pinned, filters usable while scrolled). Leave its measured-offset implementation as it is (see Out of Scope).
- [ ] At narrow widths, where the toolbar wraps to two or three lines, the header grows and the scroller shrinks. Nothing overlaps, and the column header still pins at the scroller top.

## Out of Scope / Must-Not-Change

- **Tickets page code is not refactored** to the project-tab pattern. Its measured approach works, and its table has a separate horizontal-scroll header/body arrangement (`min-w-[1320px]`) that a refactor would put at risk. Revisit only if it shows a bug.
- No change to filter, search or pagination logic, URL params, or the table's columns and content (task 491).
- No change to the project tabs' `_list-view.tsx`, `_ticket-list-view.tsx` or `_list-chrome.tsx`. Reusing `useStickyHeader` from there is allowed; changing it isn't.
- No new shared layout component. This is page-scoped UI and stays in the page file (CLAUDE.md).
- **Side finding, not fixed here:** the hub header breadcrumb labels `/dashboard/tasks` as "Work / **Desk**". `v2-hub-header.tsx:15` maps `DASHBOARD_TASKS` to `page: "Desk"`. Separate one-line fix if wanted.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/dashboard/tasks/_all-tasks-index.tsx` | Modify | Flex-column layout: a fixed `shrink-0` header, an inner list scroller, sticky `<th>`s, scrolled shadow, reset to top on page/filter change |

## Code Context

### Today's Tasks layout (`_all-tasks-index.tsx`)

```tsx
<div className="h-full overflow-y-auto scrollbar-light">           // whole page scrolls
  <div className="max-w-[1400px] mx-auto px-8 pt-6 pb-4"> …title, subtitle, toolbar… </div>
  <div aria-busy={isPending} className={cn("max-w-[1400px] mx-auto px-8 py-5 transition-opacity duration-150", isPending && "opacity-60")}>
    {loadError ? … : tasks.length === 0 ? … : (
      <div className="rounded-[14px] border border-[#E2E7F2] bg-white overflow-hidden">   // overflow-hidden blocks sticky
        <table className="w-full text-[13px]">
          <thead><tr className="border-b border-[#E2E7F2] bg-[#F9FAFD] text-left"> <th className="px-4 py-2.5 …">Task</th> …
```

### Project-tab reference (`src/app/(hub)/projects/_shared/_ticket-list-view.tsx`)

```tsx
<div className="h-full flex flex-col min-h-0">
  {/* toolbar: shrink-0, outside the scroller */}
  <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto scrollbar-light px-8 pb-5">
    {/* No overflow-hidden — it would break sticky. Top spacing is a margin, not scroller padding. */}
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white mt-5">
      <div ref={stickySentinelRef} className="h-0" />
      <div className={`sticky top-0 z-10 grid … bg-[#FAFBFE] ${headerStuck ? "rounded-t-none" : "rounded-t-[14px]"}`}>
```

`useStickyHeader()` in `_shared/_tasks/_list-chrome.tsx` returns `{ scrollRef, sentinelRef, headerStuck }`.

### Tickets' scrolled-shadow cue to mirror (`_filed-issues-index.tsx`)

```tsx
const [scrolled, setScrolled] = useState(false);
<div onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)} …>
  <div className={cn("sticky top-0 z-20 bg-[#F4F6FB] transition-shadow duration-150", scrolled && "shadow-[0_1px_0_0_rgba(7,17,51,0.08)]")}>
```

### Layout height

The hub `<main>` is `flex-1 overflow-y-auto` with a bounded height (881 px in the check above). A page root with `h-full` gets that height, so an inner `flex-1 min-h-0` scroller works. The project tabs rely on the same thing.

## Implementation Steps

1. Change the Tasks root to `h-full flex flex-col min-h-0`. Wrap the existing header block in a `shrink-0` element with the scrolled-shadow classes, and give it a page background (`bg-[#F4F6FB]`) so it sits on the canvas as the Tickets header does.
2. Move the list region into `<div ref={listRef} onScroll={…} className="flex-1 min-h-0 overflow-y-auto scrollbar-light">`. Inside it, the existing `max-w-[1400px] mx-auto px-8 pb-5` wrapper keeps `aria-busy` and the dim. The card gets `mt-…` (not `pt`).
3. Card: `overflow-hidden` → `overflow-clip`. Each `<th>` gets `sticky top-0 z-10 bg-[#F9FAFD]` plus an inset bottom-border shadow. Check in the browser that the rounded top corners look right while stuck. If not, use `useStickyHeader()` and toggle `rounded-t-*` on the first/last `<th>`.
4. When `paginationMeta.page`, `pageSize` or the filter params change, set `listRef.current.scrollTop = 0`. Use a `useEffect` keyed on `searchParams.toString()`.
5. `npx tsc --noEmit`, eslint, then the browser checks below.

## Acceptance Criteria

- [ ] On `/dashboard/tasks`, after scrolling the list, the title, search, all filters, Clear filters and pagination stay visible and usable. The column header row stays pinned directly under them, with its bottom hairline visible.
- [ ] A hairline shadow appears under the page header only once the list is scrolled.
- [ ] Opening Due date, Assignee and Project while scrolled shows each popover above the list, anchored to its trigger. Applying a filter scrolls the list back to the top.
- [ ] Next/previous page and a page-size change scroll the list back to the top.
- [ ] Empty, filtered-empty and error states look as before.
- [ ] At ~1024 px wide (toolbar wrapped), the header and column header still pin with no overlap or double scrollbars.
- [ ] `/desk/tickets` still pins its header and column header (re-verified; no code change).
- [ ] The project › Tasks and Tickets tabs are unchanged.

## Verification

```bash
npx tsc --noEmit
npx eslint "src/app/(hub)/dashboard/tasks"
```

In the browser (pm/admin):

1. `/dashboard/tasks`: scroll the list → header and column header pinned (measure with `getBoundingClientRect().top` before and after scrolling, as in the Tickets check above).
2. While scrolled, change each filter, then the page → the list jumps to the top and the dim shows during loading.
3. Resize to ~1024 px → the toolbar wraps and pinning still works.
4. `/desk/tickets`: same scroll check (expect header `top` unchanged and column header at header bottom).

## Compatibility Touchpoints

- Builds on task 491's toolbar and filters; land after 491.
- No route, API, data or shared-component changes.

## Implementation Notes

### What Changed
- `/dashboard/tasks` now follows the Projects › Tasks/Tickets tab layout:
  - The root is `h-full flex flex-col min-h-0`.
  - Title, subtitle and toolbar (search, 491 filters, Clear filters, page size, range, pager) sit in a non-scrolling `shrink-0` header: `relative z-20 bg-[#F4F6FB]`, so the absolutely positioned Due date popover overlays the list.
  - Only the list region (`flex-1 min-h-0 overflow-y-auto scrollbar-light`) scrolls.
- **Column headers:**
  - Each `<th>` uses a shared `TH_CLASS`: `sticky top-0 z-10 bg-[#F9FAFD]` plus `shadow-[inset_0_-1px_0_#E2E7F2]` as the bottom hairline. A sticky cell in a collapsed-border table drops its border, so the `tr` border was removed.
  - The card's `overflow-hidden` became `overflow-clip`: it still rounds the corners, but doesn't create a scroll container that would trap the sticky cells.
- **Scrolled cue:** the list's `onScroll` sets `scrolled` (`scrollTop > 4`), which adds the same hairline shadow under the header that Tickets uses.
- **Reset to top:** a `useEffect` keyed on `searchParams.toString()` scrolls the list back to the top on every page, page-size, search or filter change.
- The task-491 pending dim, empty and filtered-empty states, and the error state are unchanged, now inside the scroller.

### Files Changed
- `src/app/(hub)/dashboard/tasks/_all-tasks-index.tsx` — layout restructure, `TH_CLASS`, `listRef` / `scrolled` / scroll reset.

### Deviations From Plan
- None. `useStickyHeader()` wasn't needed: with `overflow-clip`, a stuck header sits mid-card where the clip box is square, so the rounded top corners only show at rest.
- The card's top gap stays as `py-5` on the inner content wrapper rather than a card margin. The plan's "margin, not padding" rule only applies to padding on the **scroll container itself**. This wrapper is a scrolled child, so its padding scrolls away and the stuck header sits flush (`th` top = scroller top = 212 px, measured).

### Verification Run
- `npx tsc --noEmit` — PASS (no errors outside the stale `.next` types).
- `npx eslint "src/app/(hub)/dashboard/tasks"` — PASS.
- **Browser, `/dashboard/tasks?pageSize=100`, 1568×945, super_admin** — PASS:
  - Before scrolling: title at `top 88`, header bottom and scroller top at 212, `Due date` `<th>` at 233.
  - After scrolling the list 1500 px: title still at 88, `<th>` pinned at 212 (flush under the header). `<main>` doesn't scroll (881/881), and the header shadow is applied.
  - Screenshot confirms the header row and hairline are visible above the rows.
  - While scrolled, the Assignee panel opens anchored under its trigger (Me / Unassigned / members), and the Due date popover overlays the list.
  - Next page from `scrollTop 1800` → URL `page=2`, range "101–200 of 7836", list `scrollTop 0`.
- **Tickets** re-verified earlier the same day (no code change): header stays at `top 64`, column header pinned at 212 after scrolling.
- **Not run:** the ~1024 px wrapped-toolbar check (the browser window couldn't be resized from here). The layout has no fixed offsets (no `ResizeObserver`), so a taller wrapped header just shrinks the scroller.
- **Unrelated, observed:** the Next dev overlay's "1 Issue" is a hydration mismatch on `fdprocessedid` attributes injected into the search input by a browser extension. Not app code.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Reviewed `src/app/(hub)/dashboard/tasks/_all-tasks-index.tsx`, the only changed file. The file list came from Implementation Notes, because CLAUDE.md forbids git commands.
- **Fixed during the gate:** the closing tag of the header's inner `max-w` wrapper was indented one level short after the re-indent. Corrected; `tsc` and eslint were re-run clean.
- **No duplication:** the seven `<th>` class strings were collapsed into one `TH_CLASS` constant. It carries a comment explaining the inset-shadow border.
- **No dead code:**
  - `useStickyHeader` isn't imported because it isn't needed (see Implementation Notes).
  - The `tr`'s old `border-b`/`bg` were removed rather than left inert.
- **Conventions:**
  - Tailwind classes and `cn()`; the static class strings aren't built at runtime.
  - DOM access (`scrollTo`) happens only in an effect. `onScroll` uses the event's own target.
  - Page-scoped UI stays in the page file.
  - No arbitrary `style={{}}`.
- **Behaviour:**
  - The reset-to-top effect also runs on mount. That's harmless, since a fresh mount is already at 0.
  - Its own scroll event clears `scrolled`, so the shadow doesn't stick after a reset.
  - The header's `relative z-20` stacking context keeps the absolutely positioned Due date popover above the list. The portaled panels are unaffected (verified in the browser).

### Deviations
- **Minor:** the card's top gap is padding on a scrolled child, not a card margin. That's equivalent; the rule only concerns the scroll container's own padding, and the browser measured the column header flush at the scroller top.
- **Minor:** `useStickyHeader()` isn't used. `overflow-clip` makes the corner-squaring unnecessary.

### Required Fixes
- None.

### Watch in `test`
- The ~1024 px wrapped-toolbar check is still to run.
