# 126: Onboarding Detail Gantt — Badge Clipping Fix, Wheel-to-Horizontal-Scroll, Calendar-Day Programme Day Fix

**Created:** 2026-07-10
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Completed

---

## Overview

Three bugs in the 120-Day Programme Gantt view (`OnboardingDetail`, task 125's deliverable):

1. **Internal Deliverables badge is clipped at the top.** The `ListChecks` count badge (`0/1`, `0/2`, etc.) on each `DeliverableCard` is positioned `absolute -top-1.5 -right-1.5`, poking ~6px above the card. The `Swimlane` row that contains it is `relative overflow-scroll` (`_onboarding-detail.tsx:325`), which clips anything outside its own box — including that 6px of badge that pokes above `top: 0` for track-0 cards. Visually this shows up as the badge circle chopped off flat along its top edge (see attached screenshot).
2. **Horizontal scroll only works by dragging the scrollbar.** The Gantt's horizontal scroll container is the outer `scrollRef` div (`overflow-x-auto`, `_onboarding-detail.tsx:746-754`). A normal mouse wheel / trackpad vertical scroll over that area does nothing to it (it has no vertical overflow of its own), so the wheel event just bubbles up and scrolls the whole page vertically instead of panning the Gantt left/right. There's no `wheel` handler converting vertical scroll input into `scrollLeft` movement.
3. **"Day N" indicator doesn't match today's calendar date.** `getCurrentProgrammeDay` (`src/config/customer-phases.ts:110-115`) computes `Math.floor((now - start) / 86_400_000) + 1`. `programme_started_at` is stored as a full ISO timestamp (see `.../programme/start/route.ts` and `.../programme/phase/route.ts`, both write `new Date().toISOString()` / a back-dated timestamp), not a midnight-normalized date. If the programme was started at, say, 3pm, then on any day before 3pm the elapsed time is still a fraction under N full days, so `Math.floor` returns `N-1` — the UI shows yesterday's day number until the exact start time-of-day rolls around today. This is why "Day 9" is still showing on July 10.

## Requirements

- [ ] `DeliverableCard`'s internal-deliverables `ListChecks` badge (and its popover trigger) is fully visible, not clipped, for every track row in every swimlane — including track 0 (top row) of every phase.
- [ ] Hovering the mouse over the Gantt grid (swimlane rows + date header) and scrolling the wheel/trackpad pans the Gantt horizontally (left on scroll-up/left, right on scroll-down/right). Native pinch-zoom (`ctrlKey` wheel events) must keep working, unaffected.
- [ ] Moving the mouse outside the Gantt grid restores normal vertical page scrolling — no listener should intercept wheel events outside the grid's bounding box.
- [ ] `getCurrentProgrammeDay` returns a day number based on calendar-date difference (local midnight to local midnight), not raw millisecond/86,400,000 floor division, so "Day N" and the `isToday` highlighted column always match the actual current calendar date regardless of what time-of-day the programme was started or backdated to.
- [ ] Existing callers of `getCurrentProgrammeDay` (`programme/reminders/route.ts`, `onboarding/projects/route.ts`, `_onboarding-detail.tsx`) continue to work unchanged — this is a pure internal fix to the function, not a signature change.

## Out of Scope / Must-Not-Change

- Do not change `DAY_WIDTH`, `TOTAL_DAYS`, `ROW_HEIGHT`, `ROW_GAP`, or `LABEL_WIDTH` constants.
- Do not change the sticky-label column behavior, the `JumpToPhaseMenu`, or the `scrollToToday()` / "Jump to today" FAB behavior beyond what's needed to keep them working with the wheel handler.
- Do not touch `internalDeliverablesForSubPhase`, `assignTracks`, or any deliverable/phase data in `customer-phases.ts` beyond `getCurrentProgrammeDay`.
- Do not add a live-ticking clock/interval to force re-renders at midnight — recomputing on each existing render (data fetch, realtime update, or page reload) is sufficient; the bug is the calculation being wrong, not the component failing to re-render.
- Do not modify `OnboardingWizard` or any other file under `_onboarding-detail.tsx`'s directory.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` | Modify | Fix `Swimlane` row overflow clipping the badge; add wheel→horizontal-scroll handler scoped to the Gantt container |
| `src/config/customer-phases.ts` | Modify | Fix `getCurrentProgrammeDay` to diff calendar dates (midnight-normalized), not raw ms/86,400,000 |

## Code Context

### File: `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx`

Swimlane row — `overflow-scroll` clips the badge's negative top offset (line ~324-327):

```tsx
<div
  className="relative overflow-scroll"
  style={{ width: TOTAL_DAYS * DAY_WIDTH, height: collapsed ? 0 : laneHeight }}
>
```

This container has no horizontal-scroll role of its own (its width is always exactly `TOTAL_DAYS * DAY_WIDTH`, same as its parent — nothing ever overflows it); the real horizontal scroll container is the outer div below. `overflow-scroll` here is redundant and is the direct cause of the badge clipping. Switch it to `overflow-visible` and add a small top buffer to `laneHeight` (or a `pt-*`) so the badge has breathing room instead of sitting flush with the row's top edge — badge position math (`-top-1.5` in `DeliverableCard`) can stay as-is since padding on a `relative` ancestor shifts the containing block for absolutely-positioned children.

Badge itself, for reference (`DeliverableCard`, line ~221-230):

```tsx
{internalItems.length > 0 && (
  <button
    ref={badgeRef}
    type="button"
    onClick={onToggleExpand}
    className="absolute -right-1.5 -top-1.5 z-10 flex h-[18px] cursor-pointer items-center gap-0.5 rounded-full border border-[#E2E8F0] bg-white px-1.5 text-[8px] font-bold text-[#64748B] shadow-sm"
  >
    <ListChecks size={8} /> {doneInternal}/{internalItems.length}
  </button>
)}
```

Outer horizontal scroll container — this is where the wheel handler needs to attach (line ~745-755):

```tsx
<div className="relative rounded-2xl border border-[#E2E8F0] bg-white pt-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
  <div
    ref={(node) => {
      scrollRef.current = node;
      if (node && !scrolledToTodayRef.current) {
        scrolledToTodayRef.current = true;
        requestAnimationFrame(() => scrollToToday("auto"));
      }
    }}
    className="overflow-x-auto rounded-2xl"
  >
```

`scrollRef` (already declared, line 429) is a plain `useRef<HTMLDivElement>(null)` — reuse it for the wheel listener via a `useEffect`, since the `ref` callback above already assigns `scrollRef.current` on mount. Attach with `{ passive: false }` so `preventDefault()` works (React's synthetic `onWheel` is passive by default for scroll perf, so use a native `addEventListener` in a `useEffect`, not a JSX `onWheel` prop).

### File: `src/config/customer-phases.ts`

```tsx
export function getCurrentProgrammeDay(startedAt: string | Date): number {
  const start = new Date(startedAt);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, diffDays + 1);
}
```

`programme_started_at` is written as a full timestamp (`new Date().toISOString()`), e.g. `src/app/api/projects/[projectId]/programme/start/route.ts` and the backdating logic in `.../programme/phase/route.ts:57`. Raw ms division means the "day" only increments once the current time-of-day catches up to the start time-of-day — a calendar date is not a fixed 24h multiple from an arbitrary start instant. Needs to normalize both timestamps to local midnight before differencing so the day rolls over exactly at local midnight, independent of the start hour/minute/second.

## Implementation Steps

1. In `customer-phases.ts`, rewrite `getCurrentProgrammeDay` to construct midnight-normalized `Date` objects for both `start` and `now` (via `new Date(y, m, d)`) and diff those, using `Math.round` instead of `Math.floor` (avoids float epsilon issues since both operands are now exact midnights).
2. In `_onboarding-detail.tsx`, change the `Swimlane` lane div from `overflow-scroll` to `overflow-visible`, and add a small top buffer (either bump the `laneHeight` calculation by a few px, or wrap deliverables in a container with `pt-2`/inline `paddingTop`) so the top-track badges have clear space above them and don't visually collide with the sticky date header row directly above.
3. Add a `useEffect` in `OnboardingDetail` that attaches a native `wheel` listener to `scrollRef.current` (`{ passive: false }`): on wheel, if `!e.ctrlKey`, compute `delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY`, `e.preventDefault()`, and `el.scrollLeft += delta`. Clean up the listener on unmount / ref change.
4. Verify the "Jump to today" FAB (`scrollToToday`) and initial auto-scroll-to-today still work after the wheel handler is added (they use the same `scrollRef`, no conflict expected — just confirm no double-handling).
5. Run `npx tsc --noEmit` and manually verify in the browser: badge fully visible on track-0 cards in every phase; wheel-scroll while hovering the Gantt pans horizontally; wheel-scroll outside the Gantt (e.g. over the header card or reminders strip) scrolls the page normally; "Day N" matches today's actual calendar date regardless of the stored `programme_started_at` time-of-day.

## Acceptance Criteria

- [ ] No `ListChecks` badge is visually clipped/cut off on any deliverable card, in any phase, at any horizontal scroll position.
- [ ] Scrolling the mouse wheel while the cursor is over the Gantt grid moves the grid horizontally; the page itself does not scroll while doing so.
- [ ] Scrolling the mouse wheel while the cursor is outside the Gantt grid scrolls the page vertically as normal.
- [ ] Pinch-to-zoom (ctrl+wheel) over the Gantt still zooms the browser instead of being hijacked.
- [ ] With `programme_started_at` set to any time-of-day on a past date, the "Day N" badge and the dashed "today" column line match the actual number of calendar days elapsed, on the day it's viewed — not delayed by up to 24h based on start time-of-day.
- [ ] `npx tsc --noEmit` passes with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manually verify wheel-scroll, badge visibility, and Day N in browser at /v2/onboarding/[projectId]
```

## Compatibility Touchpoints

- `getCurrentProgrammeDay` is also called from `src/app/api/programme/reminders/route.ts` and `src/app/api/onboarding/projects/route.ts` — same signature, same return type (`number`), so no call-site changes are needed; just confirm both still get sane day numbers with the new calendar-date logic (they will, since the new logic is a strict correction of the old one, not a behavior change for the common case).

## Implementation Notes

### What Changed
- `getCurrentProgrammeDay` now diffs midnight-normalized calendar dates instead of floor-dividing the raw millisecond gap, so "Day N" advances at local midnight regardless of the stored timestamp's time-of-day.
- Swimlane row container switched from `overflow-scroll` to `overflow-visible` and given a `LANE_TOP_PADDING` (8px) top padding, so the `ListChecks` internal-deliverables badge (`-top-1.5` offset) is no longer clipped on track-0 cards. `laneHeight` grows by the same amount to keep row spacing consistent.
- Added a native (non-passive) `wheel` event listener on `scrollRef` that converts vertical wheel/trackpad input into `scrollLeft` movement while the cursor is over the Gantt grid, skipping interception on `ctrlKey` (pinch-zoom) or when there's no horizontal overflow to pan. Outside the grid, no listener intercepts, so page scroll behaves as before.

### Files Changed
- `src/config/customer-phases.ts` — `getCurrentProgrammeDay` calendar-date fix.
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` — `LANE_TOP_PADDING` constant, Swimlane row overflow/padding fix, wheel-to-horizontal-scroll `useEffect`.

### Deviations From Plan
- None. Implementation matches the plan: `overflow-visible` (not a removal of the overflow property) plus explicit top padding, calendar-midnight diff with `Math.round`, and a native wheel listener scoped to `scrollRef`.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Manual browser verification (wheel-scroll, badge visibility, Day N) - SKIPPED (handed to `/test` stage per workflow; visual/interaction behavior should be confirmed in-browser before ship)
