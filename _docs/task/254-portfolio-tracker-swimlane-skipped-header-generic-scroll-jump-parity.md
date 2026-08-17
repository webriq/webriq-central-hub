# 254: Portfolio Tracker Swimlane — Hide Skipped-Phase Collapse Toggle/Task Count, Generic-Engine Gantt Scroll + Jump-to-Today Parity

**Created:** 2026-08-17
**Priority:** MEDIUM
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

Three independent Portfolio Tracker Swimlane/Gantt UI bugs, reported with screenshots. Not a continuation of task 253 (already in Testing).

**1. StackShift I / `customer_phases`-engine Swimlane — skipped-phase header shows a pointless collapse toggle and task count.** In `Swimlane` (`_onboarding-detail.tsx`), a skipped phase's row header still renders the full collapse/expand `+`/`−` icon and the `{doneCount}/{phase.deliverables.length}` text (screenshot: "Onboard SKIPPED 0/7" with a `+` icon on the right). A skipped phase's lane is always empty regardless of collapsed state (`effectiveDeliverables`/the lane render loop only ever has content when the phase actually has deliverables to show, and a skipped phase's own day range is already hidden per the existing `dbStatus !== "skipped"` check at line 699) — there's nothing to reveal by toggling it, and "0/7" reads as a real, actionable task count for a phase that isn't part of the project. Elsewhere on this same row, `interactive = role !== "developer" && dbStatus !== "skipped"` and `canEditSchedule && dbStatus !== "skipped"` already treat a skipped phase as inert — this task extends that same treatment to the toggle and the count.

**2. Discrete Development (and other generic-engine) project types — Gantt horizontal scroll effectively doesn't work.** `_generic-swimlane.tsx`'s Gantt grid wrapper (`<div className="overflow-x-auto rounded-2xl">`, line 121) *does* have `overflow-x-auto` set, so a trackpad horizontal swipe or manual scrollbar drag can technically move it — but unlike StackShift I's identical-looking grid in `_onboarding-detail.tsx`, it has no wheel-to-horizontal-pan handler wired up. A normal vertical mouse-wheel/trackpad scroll over the grid does nothing, which is what a user actually tries first and is almost certainly what's being reported as "x-scroll not working" (screenshot: a "App I…" deliverable card cut off at the right edge of a short 28-day/2-phase "Discrete Dev" programme, with no visible way to reach it).

**3. Generic-engine pages are missing the "Jump to today" floating button entirely.** StackShift I's page (`_onboarding-detail.tsx`) renders a `fixed bottom-8 right-8` orange circular button (`aria-label="Jump to today"`, `Locate` icon from `lucide-react`) that calls `scrollToToday("smooth")`, plus an effect that auto-scrolls to today on first load. `_generic-phase-view.tsx`/`_generic-swimlane.tsx` have no `scrollRef`, no `scrollToToday`, no wheel handler, and no button at all — this was apparently never ported when the generic engine's Gantt was built (task 247/252's own doc describes that work as building "Gantt parity" with StackShift I; scroll UX was evidently missed).

## Requirements

- [ ] In `Swimlane` (`_onboarding-detail.tsx`), for a skipped phase (`dbStatus === "skipped"`): do not render the `Plus`/`Minus` collapse-toggle icon, and do not render the `{doneCount}/{phase.deliverables.length}` text. Since the entire header is currently one `<button onClick={onToggleCollapse}>`, and a skipped phase has nothing to reveal by expanding, render the header as a non-interactive element (not a `<button>`) for skipped rows — same spirit as the existing `interactive`/`canEditSchedule` "skipped is inert" pattern already used elsewhere on this same component. Non-skipped phases must render exactly as before (toggle + count both present, row still clickable).
- [ ] Port the wheel-to-horizontal-pan behavior from `_onboarding-detail.tsx`'s `handleGridWheel`/`scrollRef` (lines ~1197, ~1466-1477, ~2160-2177) onto the generic engine's Gantt grid (`_generic-swimlane.tsx`'s `overflow-x-auto` container, currently line 121) — same logic: ignore when `e.ctrlKey` (preserve pinch-zoom), no-op when `scrollWidth <= clientWidth`, otherwise `preventDefault()` and pan `scrollLeft` by whichever of `deltaX`/`deltaY` is larger in magnitude. Must use a native `addEventListener("wheel", ..., { passive: false })` (not JSX `onWheel`), same reason as the StackShift I version — React's synthetic wheel listener is passive and can't call `preventDefault()`.
- [ ] Port the "Jump to today" floating action button + `scrollToToday` + first-load auto-scroll-to-today behavior onto the generic engine's page, visually and behaviorally matching StackShift I's version exactly (same `Locate` icon, same `fixed bottom-8 right-8` orange circular button, same clamped-to-content `scrollTo` math using `LABEL_WIDTH`/`DAY_WIDTH`/`clientWidth`). Decide during implementation whether the `scrollRef`/wheel-handler/`scrollToToday`/button live inside `GenericSwimlane` itself (self-contained, no new props needed since it owns the scrollable div) or are lifted into `GenericPhaseView` with `scrollRef` passed down as a prop (closer 1:1 structural mirror of `_onboarding-detail.tsx`, but adds prop-threading) — either is acceptable, pick whichever keeps the diff smaller.

## Out of Scope / Must-Not-Change

- No changes to `_onboarding-detail.tsx`'s own working scroll/jump-to-today implementation beyond what Requirement 1 touches (the skipped-phase header) — it's the reference implementation Requirements 2/3 are copying from, not something to refactor.
- No changes to task 253's scope (day-scale consistency, deliverable override resolution, the migration) — that task is already implemented and in Testing; do not re-touch `displayPhases`/`compressedPhases`/`scaleDay` logic here.
- No changes to the generic engine's data model (`milestones`/`tasklists` columns) or to skip-phase semantics for the generic engine (it has none — task 252's doc already noted this as an explicit non-goal).
- No changes to collapse/expand behavior for non-skipped phases in either engine.
- Don't add a skip-phase concept to the generic engine as part of fixing the scroll/jump-to-today gap — those are unrelated; keep this task to the three items above.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` | Modify | Requirement 1 — skipped-phase header in `Swimlane`. |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_generic-swimlane.tsx` | Modify | Requirements 2/3 — wheel-pan handler on the grid container; `scrollRef`/`scrollToToday`/button if implemented here. |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_generic-phase-view.tsx` | Modify (if the scrollRef/button is lifted here instead) | Requirement 3 — floating button + first-load auto-scroll, if implemented at this level. |

## Code Context

### `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` — current skipped-phase header (Requirement 1 target)

```tsx
// lines 677-708 (Swimlane component)
<div className={cn("sticky left-0  z-2 shrink-0 border-r border-[#E2E7F2] px-3.5 py-3", visual.bg)} style={{ width: LABEL_WIDTH }}>
  <button type="button" onClick={onToggleCollapse} className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left">
    <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold", visual.iconBg, visual.iconText)}>
      {dbStatus === "completed" ? <CheckCircle2 size={13} /> : phase.number}
    </div>
    <div className="min-w-0 flex-1">
      <div className="flex items-center gap-1.5">
        <span className={cn("truncate text-[12.5px] font-bold", dbStatus === "skipped" ? "text-[#5F6A88]" : "text-[#0B1533]")}>{phase.name}</span>
        {dbStatus === "active" && <span className="h-1.5 w-1.5 shrink-0 animate-pulse motion-reduce:animate-none rounded-full bg-[#007BFF]" />}
        {dbStatus === "skipped" && (
          <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">
            Skipped
          </span>
        )}
      </div>
      <div className={cn("font-mono truncate text-[10px] text-[#5F6A88]")}>
        {dbStatus !== "skipped" && <>D{phase.dayStart}–{phase.dayEnd} · </>}
        {doneCount}/{phase.deliverables.length}  {/* <- Requirement 1: hide when dbStatus === "skipped" */}
      </div>
    </div>
    {/* <- Requirement 1: don't render this icon at all when dbStatus === "skipped"; also the
         surrounding <button onClick={onToggleCollapse}> itself should become non-interactive
         (e.g. a plain <div>) for a skipped row, since there's nothing to toggle */}
    {collapsed ? <Plus size={14} className="shrink-0 text-[#5F6A88]" /> : <Minus size={14} className="shrink-0 text-[#5F6A88]" />}
  </button>
</div>
```

### `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` — reference implementation for Requirements 2/3

```tsx
// lines 1197-1198 (component-level refs)
const scrollRef = useRef<HTMLDivElement>(null);
const scrolledToTodayRef = useRef(false);

// lines 1466-1477 (wheel-to-pan handler)
function handleGridWheel(e: WheelEvent) {
  const el = scrollRef.current;
  if (!el) return;
  if (e.ctrlKey) return; // preserve native pinch-zoom
  if (el.scrollWidth <= el.clientWidth) return; // nothing to pan
  const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  e.preventDefault();
  el.scrollLeft += delta;
}

// lines 1945-1949 (scrollToToday)
function scrollToToday(behavior: ScrollBehavior = "auto") {
  if (!scrollRef.current) return;
  const target = Math.max(0, LABEL_WIDTH + (gridMarkerDay - 1) * DAY_WIDTH - (scrollRef.current.clientWidth - LABEL_WIDTH) / 2);
  scrollRef.current.scrollTo({ left: target, behavior });
}

// lines 2159-2178 (ref attach/detach + first-load auto-scroll, wraps the overflow-x-auto container)
<div className="relative rounded-2xl border border-[#E2E7F2] bg-white pt-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
  <div
    ref={(node) => {
      if (scrollRef.current) scrollRef.current.removeEventListener("wheel", handleGridWheel);
      scrollRef.current = node;
      if (!node) return;
      node.addEventListener("wheel", handleGridWheel, { passive: false });
      if (!scrolledToTodayRef.current) {
        scrolledToTodayRef.current = true;
        requestAnimationFrame(() => scrollToToday("auto"));
      }
    }}
    className="overflow-x-auto rounded-2xl"
  >
    {/* ... grid content ... */}
  </div>
</div>

// lines 2230-2237 (floating button, sibling of the grid card, not nested inside it — `fixed`
// positioning means DOM location doesn't affect placement)
<button
  type="button"
  onClick={() => scrollToToday("smooth")}
  aria-label="Jump to today"
  className="fixed bottom-8 right-8 z-40 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-none bg-[#FB914E] text-white shadow-[0_4px_16px_rgba(251,145,78,0.4)] transition-transform hover:scale-105"
>
  <Locate size={20} />
</button>
```

### `src/app/v2/(hub)/portfolio-tracker/[projectId]/_generic-swimlane.tsx` — current grid wrapper (Requirement 2 target)

```tsx
// lines 3-12 — already imports several shared pieces from _onboarding-detail.tsx; Locate/useRef
// will need adding (Locate from "lucide-react" directly, useRef from "react")
import { useMemo } from "react";
...
import {
  DAY_WIDTH, LABEL_WIDTH, ROW_HEIGHT, ROW_GAP, LANE_TOP_PADDING, PHASE_VISUALS,
  assignTracks, addDays, DateColumnHeader,
} from "./_onboarding-detail";

// lines 119-122 — has overflow-x-auto but no ref/wheel listener at all
const days = Array.from({ length: visibleTotalDays }, (_, i) => i + 1);
return (
  <div className="relative rounded-2xl border border-[#E2E7F2] bg-white pt-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
    <div className="overflow-x-auto rounded-2xl">
      <div className="relative" style={{ width: LABEL_WIDTH + visibleTotalDays * DAY_WIDTH }}>
```

`currentDay`/`visibleTotalDays` are already props on `GenericSwimlane` (passed from `GenericPhaseView`), matching the values `gridMarkerDay`/`visibleDurationDays` play in the StackShift I version — `scrollToToday`'s math can use these directly if the ref/button end up living inside `GenericSwimlane`.

## Implementation Steps

1. **Requirement 1** — in `Swimlane` (`_onboarding-detail.tsx`), branch the header's root element on `dbStatus === "skipped"`: skipped renders a plain `<div>` (no `onClick`, no cursor-pointer styling) with the toggle icon and the `{doneCount}/{...}` text both omitted; non-skipped keeps the existing `<button>` unchanged. Keep the "Skipped" pill and the phase name/icon circle as-is either way.
2. **Requirement 2** — in `_generic-swimlane.tsx`: add `useRef` to the React import, add a `scrollRef = useRef<HTMLDivElement>(null)`, add a `handleGridWheel` function identical in behavior to the StackShift I version, and wire it onto the grid's `overflow-x-auto` div via the same callback-ref attach/detach pattern (or a `useEffect`, if simpler here since this component doesn't already have the StackShift I file's "avoid stale listener after unrelated re-renders" constraint spelled out — check whether it applies here too before choosing a simpler `useEffect`-based attach).
3. **Requirement 3** — add `scrolledToTodayRef`, a `scrollToToday` function (same clamped-scroll math, using this component's own `currentDay`/`visibleTotalDays` in place of `gridMarkerDay`/`visibleDurationDays`), the first-load auto-scroll trigger, and the floating `Locate` button. Place these in `GenericSwimlane` if self-contained turns out simplest (see Requirements' note on this), otherwise lift `scrollRef` up into `GenericPhaseView` and pass it down as a prop, rendering the button in `GenericPhaseView`'s own return alongside `<GenericSwimlane .../>`.
4. Manually verify: a Discrete Development (or other generic-engine) project's Gantt now pans with mouse-wheel/trackpad scroll, and clicking the new orange button scrolls to today's column; a StackShift I project's skipped phase no longer shows a toggle icon or task count and its row is inert (no hover/click affordance); a StackShift I project's non-skipped phases are visually unchanged.

## Acceptance Criteria

- [x] A skipped phase's Swimlane header (StackShift I engine) shows no collapse/expand icon and no `N/N` task count; the row is not clickable. Non-skipped phases are pixel-identical to before this task. Verified by code inspection (the non-skipped branch's JSX is byte-identical to the pre-existing markup); not re-confirmed in a live browser.
- [x] On a generic-engine (e.g. Discrete Development) project's Portfolio Tracker detail page, scrolling the mouse wheel/trackpad while hovering the Gantt grid pans it horizontally, matching StackShift I's existing behavior. Implementation mirrors the reference `handleGridWheel` logic exactly; not re-confirmed in a live browser.
- [x] The same generic-engine page shows an orange "Jump to today" floating button (bottom-right) that scrolls the grid to today's column when clicked, and the grid auto-scrolls to today on first load. Implementation mirrors the reference `scrollToToday`/button/first-load-effect exactly; not re-confirmed in a live browser.
- [x] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual/browser: open a StackShift I project with a skipped phase; open a Discrete
# Development (or other generic-engine) project's Portfolio Tracker detail page and confirm
# wheel-scroll + the new Jump-to-today button both work.
```

## Compatibility Touchpoints

- None — UI-only, no schema/route/API changes.

## Implementation Notes

### What Changed

- **`_onboarding-detail.tsx` (Requirement 1)** — `Swimlane`'s phase-row header now branches on `dbStatus === "skipped"`. Skipped: renders a plain non-interactive `<div>` — icon circle, phase name, and the "Skipped" pill only; no `+`/`−` toggle icon, no `D{start}–{end}` day range (already suppressed pre-existing), no `{doneCount}/{total}` count. Non-skipped: unchanged `<button onClick={onToggleCollapse}>` with everything it had before. Since `collapsedPhases` already defaults every non-active phase (including every skipped one) to collapsed on first load and nothing can un-collapse a skipped row anymore (its toggle no longer exists), a skipped phase's lane now stays permanently empty/height-0 — no separate state change was needed to achieve that. Updated a now-stale nearby comment (`compressedPhases`) that referenced a PM being able to "manually expand" a skipped row for historical reference — that's no longer possible after this task.
- **`_generic-swimlane.tsx` (Requirements 2 & 3)** — ported `_onboarding-detail.tsx`'s Gantt scroll UX verbatim: added `scrollRef`/`scrolledToTodayRef`, a `handleGridWheel` wheel-to-pan handler (native `addEventListener`, `{ passive: false }`, so `preventDefault()` works — JSX `onWheel` can't), and a `scrollToToday` function using this component's own `currentDay`/`visibleTotalDays` in place of the StackShift I page's `gridMarkerDay`/`visibleDurationDays`. Wired the same callback-ref attach/detach pattern onto the grid's existing `overflow-x-auto` div, and added the identical `fixed bottom-8 right-8` orange `Locate`-icon "Jump to today" button plus a first-load auto-scroll effect. Kept this fully self-contained inside `GenericSwimlane` (no props added, `_generic-phase-view.tsx` untouched) since the component already owns its own scrollable div and the button's `fixed` positioning doesn't depend on where in the DOM it renders — the simpler of the two options the task doc left open. Wrapped the return in a Fragment (`<>...</>`) to add the button as a second top-level sibling next to the existing Gantt card, and reindented the whole grid subtree to keep it consistent after the added nesting level.

### Files Changed

- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` — skipped-phase Swimlane header no longer renders a toggle or task count; one stale comment updated.
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_generic-swimlane.tsx` — added wheel-to-pan handler, `scrollToToday`, first-load auto-scroll, and the "Jump to today" floating button; no other files touched.

### Deviations From Plan

- None of substance. The task doc explicitly left the `GenericSwimlane`-self-contained vs. `GenericPhaseView`-lifted choice open for whichever kept the diff smaller — self-contained was chosen, so `_generic-phase-view.tsx` (listed as a conditional "Modify (if...)" in Proposed File Changes) ended up untouched.

### Verification Run

- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (same 2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`)
- Manual browser verification (skipped-phase header, generic-engine wheel-scroll, Jump-to-today button) — SKIPPED (no browser/Supabase session available in this environment)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation — the skipped-phase branch and the non-skipped branch each render their own complete, live JSX (no leftover disabled/commented copies); grep for `TODO`/`FIXME`/`console.log`/stray `any` across both changed files came back clean (one incidental match was a pre-existing comment using the English word "any," not a type annotation).
- No new `any`/untyped escape hatches — no new types introduced beyond what already existed; the wheel handler's `e: WheelEvent` param matches the reference implementation's own typing exactly.
- No deep nesting where guard clauses would help — the skipped/non-skipped header split is a single top-level ternary, not nested conditionals; `handleGridWheel`/`scrollToToday` in `_generic-swimlane.tsx` are copied verbatim (same shape as the reference) rather than restructured, so no new complexity was introduced.
- Naming is accurate — `scrollRef`/`scrolledToTodayRef`/`handleGridWheel`/`scrollToToday` in `_generic-swimlane.tsx` reuse the exact names the equivalent StackShift I code already uses for the same roles, which aids cross-file recognition rather than inventing parallel vocabulary.
- No repeated logic needing extraction — `handleGridWheel`/`scrollToToday`/the ref-attach callback are now duplicated between `_onboarding-detail.tsx` and `_generic-swimlane.tsx` (same logic, two call sites). This is the same duplication pattern this file already established for its other shared pieces (`DAY_WIDTH`, `assignTracks`, `DateColumnHeader`, etc. — those are cross-imported from `_onboarding-detail.tsx`, but scroll/today logic reads local component state — `programmeDurationDays`/`gridMarkerDay` vs. `currentDay`/`visibleTotalDays` — so a shared hook would need a small adapter interface). Flagged under Deviations below as a Minor, disclosed tradeoff rather than silently left.
- Errors handled the same as elsewhere on this page — no new error paths were introduced (the wheel handler and scroll-to-today are UI-only, non-throwing by construction, matching the reference implementation).
- No secrets, credentials, or debug logging introduced.
- `npx tsc --noEmit` and `pnpm lint` both re-run clean at gate time (0 errors; the 2 warnings are in an untouched file, same as task 253's gate).
- Indentation: the implementer's own notes flagged that wrapping `GenericSwimlane`'s return in a Fragment initially left ~90 lines under-indented by one level; this was caught and corrected in the same implementation pass (re-verified at gate time — the full grid subtree now indents consistently under the new Fragment).

### Deviations
- **Minor** — `handleGridWheel`/`scrollToToday`/the ref-attach-callback pattern are now duplicated (not shared) between `_onboarding-detail.tsx` and `_generic-swimlane.tsx`. The task doc itself framed this as an acceptable tradeoff ("pick whichever keeps the diff smaller") rather than mandating extraction into a shared hook — duplicating ~25 lines of self-contained, unlikely-to-drift scroll UX is lower-risk here than introducing a new shared hook/prop-threading contract across two components with different local state shapes for what is otherwise a UI-polish fix. Worth a follow-up extraction only if a third engine/Gantt view is added later.
- **Minor** — `_generic-phase-view.tsx`, listed in the task doc's Proposed File Changes as a conditional "Modify (if the scrollRef/button is lifted here instead)," was correctly left untouched since the self-contained `GenericSwimlane` approach was chosen — matches the task doc's own stated flexibility on this point, not an unplanned scope change.
- **Medium, pre-disclosed by implement stage** — no live browser verification of any of the three fixes (no environment access). All three are visual/interaction behaviors best confirmed by actually looking at a rendered page; the `test` stage should exercise a StackShift I project with a skipped phase and a generic-engine (Discrete Development) project's Gantt to confirm the reference-implementation-derived code behaves identically in the browser.
- No Major deviations — all three requirements implemented within the stated Out-of-Scope boundaries (task 253's day-scale logic untouched, no generic-engine data-model/skip-concept changes, non-skipped/non-generic behavior unchanged).

### Required Fixes
- None.

## Completion Notes

**Completed:** 2026-08-17

Code-complete and quality-gated — all three requirements implemented (`_onboarding-detail.tsx`'s skipped-phase header, `_generic-swimlane.tsx`'s wheel-pan handler and Jump-to-today button), `npx tsc --noEmit`/`pnpm lint` clean. Marked Completed with one known, explicitly-disclosed gap: no live browser verification was performed in this environment (no session access). The generic-engine wheel-scroll and Jump-to-today additions are copied line-for-line from the StackShift I reference implementation this task was explicitly modeled on, which lowers risk relative to novel code, but an actual click-through on a Discrete Development project (and a StackShift I project with a skipped phase) is recommended before considering this fully verified in production.
