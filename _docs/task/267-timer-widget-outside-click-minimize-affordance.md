# 267: Timer Widget — Click-Outside-to-Close, "Minimize" Tooltip Wording, Minimize Icon

**Created:** 2026-08-18
**Priority:** LOW
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Completed (2026-08-18)

---

## Overview

Follow-up polish to the hub-wide floating timer widget (`TimerFloatingWidget`, task 209/234, most recently touched by task 265 — currently in Testing) reported directly against the expanded panel and its collapse affordances:

1. Clicking anywhere outside the expanded Timer panel should collapse it back to the floating pill — today the only way to close it is the header's X button or re-clicking the pill itself.
2. That "outside click" behavior must not fight with the floating pill button's own open/close toggle — clicking the pill while the panel is open should keep behaving exactly as it does today (its own `onClick` toggles `open`), not get double-handled by a separate outside-click listener.
3. The collapsed pill's tooltip currently reads "Close" when the panel is open (see reported screenshot) — rename to "Minimize", since collapsing the panel back to the pill isn't a "close" (the timer keeps running), it's a minimize.
4. The panel header's icon button (currently a plain `X`, no tooltip) should use a minimize-style icon instead of an X, and gain a tooltip — same "Minimize" language as #3, for consistency between the two ways of collapsing the panel.

## Requirements

- [x] A `mousedown` outside the widget's outer container while the panel is open collapses it (`setOpen(false)`), following the exact same pattern already used elsewhere in this codebase (`src/components/hub/hub-header.tsx`'s user-menu dropdown: a `ref` on the *outer* container that wraps both the trigger button and the popup content, checked via `!ref.current.contains(e.target)` in a `mousedown` listener scoped to `open`).
- [x] Because the ref wraps the trigger button too, clicking the floating pill is always "inside" the ref and never triggers the outside-close — its existing `onClick={() => setOpen((o) => !o)}` keeps working unmodified. No special-casing needed beyond using the existing DOM structure (panel + pill button are already siblings inside one outer `<div>`).
- [x] The collapsed-pill `TooltipContent` text changes from `"Close"` to `"Minimize"` (the `"Timer & breaks"` text for the closed state is unchanged).
- [x] The header icon button's icon changes from `X` (lucide) to `Minus` (lucide) — the conventional OS "minimize" glyph, appropriately small and unambiguous at the button's existing 14px icon size.
- [x] The header icon button gains a `Tooltip`/`TooltipTrigger`/`TooltipContent` wrapper (matching this file's existing tooltip pattern used by the pill button and the three break buttons) with text `"Minimize"`, `side="left"`.
- [x] The header button's `aria-label` updates from `"Close timer panel"` to `"Minimize timer panel"` to match the new behavior/icon.

## Out of Scope / Must-Not-Change

- No new shared "useClickOutside" hook — every existing consumer in this codebase (hub-header.tsx, settings-tab.tsx, several others) inlines its own `ref` + `mousedown` `useEffect`; match that convention rather than introducing an abstraction for a single new call site.
- Do not touch the Stop/Pause/Resume buttons, break controls, or any of task 265's changes (title decode, project name, `hh:mm:ss`, break-icon dynamism, auto-resume-after-break) — this task only touches the outer-container ref/effect, the pill tooltip string, and the header button's icon/tooltip/aria-label.
- Do not change what happens when the countdown/break state is active — clicking outside should still just collapse the panel (`setOpen(false)`) regardless of `onBreak`; it doesn't cancel a break or stop the timer.
- Do not add `stopPropagation`/`preventDefault` anywhere — unlike the kebab-menu components elsewhere in the codebase that use a full-screen backdrop `<div>` (a different, deliberately simpler pattern for menus with no persistent trigger affordance), this widget's own trigger must stay directly clickable/hoverable at all times for its tooltip to keep working, which is exactly why this task uses the ref-based pattern instead of a backdrop overlay — do not swap in the backdrop-div approach.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/_components/timer-floating-widget.tsx` | Modify | Add outside-click-to-collapse; rename pill tooltip to "Minimize"; swap header `X` for `Minus` + wrap in `Tooltip` + update `aria-label` |

## Code Context

### `src/app/(hub)/_components/timer-floating-widget.tsx` — current relevant pieces

Imports (post-task-265):

```tsx
import { useState } from "react";
import { Timer, X, Play, Pause, Square } from "lucide-react";
```

Outer container + header (current):

```tsx
<div className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2.5">
  {open && (
    <div className="w-[272px] rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#EDF0F7]">
        <span className="font-heading text-[15px] font-semibold text-[#0B1533] tracking-[-0.01em]">Timer</span>
        <button
          onClick={() => setOpen(false)}
          aria-label="Close timer panel"
          className="flex items-center justify-center w-6 h-6 rounded-full text-[#5F6A88] hover:bg-[#F4F6FB] hover:text-[#0B1533] transition-colors cursor-pointer"
        >
          <X size={14} />
        </button>
      </div>
      ...
```

Collapsed pill tooltip (current, bottom of file):

```tsx
<TooltipContent side="left">{open ? "Close" : "Timer & breaks"}</TooltipContent>
```

Reference pattern for the outside-click effect (`src/components/hub/hub-header.tsx:65-75`, `117`) — note the ref sits on the *outer* wrapper that contains both the trigger button and the dropdown, so the trigger is automatically excluded from the outside-close:

```tsx
const menuRef = useRef<HTMLDivElement>(null);

useEffect(() => {
  function handleClick(e: MouseEvent) {
    if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
  }
  if (menuOpen) document.addEventListener("mousedown", handleClick);
  return () => document.removeEventListener("mousedown", handleClick);
}, [menuOpen]);
// ...
<div className="relative" ref={menuRef}>
  <button onClick={() => setMenuOpen((o) => !o)}>...</button>
  {menuOpen && <div>...dropdown...</div>}
</div>
```

### Target changes

Imports:

```tsx
import { useEffect, useRef, useState } from "react";
import { Timer, Minus, Play, Pause, Square } from "lucide-react";
```

Component body — add the ref and effect right after existing `useState`/`useTimer` calls:

```tsx
const [open, setOpen] = useState(false);
const widgetRef = useRef<HTMLDivElement>(null);
const { timer, elapsedSeconds, breakRemainingSeconds, pauseTimer, resumeTimer, stopTimer, startBreak, cancelBreak } = useTimer();

useEffect(() => {
  function handleClickOutside(e: MouseEvent) {
    if (widgetRef.current && !widgetRef.current.contains(e.target as Node)) setOpen(false);
  }
  if (open) document.addEventListener("mousedown", handleClickOutside);
  return () => document.removeEventListener("mousedown", handleClickOutside);
}, [open]);
```

Attach the ref to the existing outer wrapper (the same `<div>` that already contains both the panel and the pill `<Tooltip>`):

```tsx
<div ref={widgetRef} className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2.5">
```

Header button — swap icon, wrap in Tooltip, update aria-label:

```tsx
<Tooltip>
  <TooltipTrigger render={
    <button
      onClick={() => setOpen(false)}
      aria-label="Minimize timer panel"
      className="flex items-center justify-center w-6 h-6 rounded-full text-[#5F6A88] hover:bg-[#F4F6FB] hover:text-[#0B1533] transition-colors cursor-pointer"
    >
      <Minus size={14} />
    </button>
  } />
  <TooltipContent side="left">Minimize</TooltipContent>
</Tooltip>
```

Collapsed pill tooltip text:

```tsx
<TooltipContent side="left">{open ? "Minimize" : "Timer & breaks"}</TooltipContent>
```

## Implementation Steps

1. Add `useEffect`, `useRef` to the React import; swap `X` for `Minus` in the lucide-react import.
2. Add `widgetRef` and the outside-click `useEffect` (scoped to `open`, mirroring `hub-header.tsx`'s pattern).
3. Attach `ref={widgetRef}` to the outer `fixed bottom-6 right-6 ...` wrapper div.
4. Wrap the header icon button in `Tooltip`/`TooltipTrigger`/`TooltipContent` (side="left", text "Minimize"), swap `<X size={14} />` for `<Minus size={14} />`, update `aria-label` to `"Minimize timer panel"`.
5. Change the collapsed-pill tooltip's open-state string from `"Close"` to `"Minimize"`.
6. Run `npx tsc --noEmit`; manually verify in the browser: open the panel, click elsewhere on the page (confirm it collapses), click the pill itself while open (confirm it still toggles closed via its own handler, not a double-fire), hover the header button and the pill to confirm both tooltips read "Minimize" while open.

## Acceptance Criteria

- [ ] With the panel open, a click anywhere outside the widget (page background, sidebar, another button) collapses it back to the pill.
- [ ] With the panel open, clicking the floating pill itself still collapses it via its own `onClick` (no double-toggle, no console errors, no flicker).
- [ ] With the panel open, clicking inside the panel (e.g. a break button, the Pause button) does **not** collapse the panel.
- [ ] Hovering the collapsed pill while the panel is open shows a tooltip reading "Minimize" (was "Close").
- [ ] Hovering the header icon button shows a tooltip reading "Minimize"; the icon is a minimize glyph (`Minus`), not an `X`.
- [x] `npx tsc --noEmit` passes with no new errors.

The first five acceptance criteria above are runtime/interaction claims — verified by structural code review (ref placement, effect scoping, tooltip wiring) rather than a live browser session in this task; see Implementation Notes / Quality Gate Notes for the reasoning. Task marked complete on the user's explicit instruction without a separate `test` stage.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser: open the timer widget panel and exercise all five acceptance-criteria interactions above.

## Compatibility Touchpoints

- None — single-file UI behavior change on an existing feature (task 209/234/265). No route, schema, or type changes.

## Implementation Notes

### What Changed
- Added `widgetRef` (`useRef<HTMLDivElement>`) attached to the widget's outer `fixed bottom-6 right-6 ...` wrapper, plus a `useEffect` (scoped to `open`) that adds a `mousedown` listener collapsing the panel (`setOpen(false)`) when the click target isn't inside `widgetRef`. Mirrors `hub-header.tsx`'s user-menu pattern exactly. Because the ref wraps both the panel and the pill button, clicking the pill stays fully handled by its own existing `onClick={() => setOpen((o) => !o)}` — never double-fires with the outside-close.
- Swapped the header icon button's `X` for `Minus`, wrapped it in `Tooltip`/`TooltipTrigger`/`TooltipContent` (`side="left"`, text "Minimize"), and updated its `aria-label` from `"Close timer panel"` to `"Minimize timer panel"`.
- Changed the collapsed pill's `TooltipContent` open-state string from `"Close"` to `"Minimize"` (closed-state `"Timer & breaks"` unchanged).
- Updated `useState`/`lucide-react` imports accordingly (`useEffect`, `useRef` added; `X` replaced by `Minus`).

### Files Changed
- `src/app/(hub)/_components/timer-floating-widget.tsx` — outside-click-to-minimize, header icon/tooltip swap, pill tooltip text

### Deviations From Plan
- None against the task doc's explicit requirements. One scoped-out observation for future consideration: the pill button's own `aria-label` (`open ? "Close timer widget" : "Open timer widget"`, line ~164) still says "Close" even though its tooltip now says "Minimize" — the task doc's requirements only called out the *header* button's `aria-label` for the Close→Minimize rename, not the pill's, so this was left untouched per the "don't broaden scope" invariant. Screen-reader-only inconsistency, no visible/behavioral impact.

### Verification Run
- `npx tsc --noEmit` - PASS (no errors)
- `pnpm lint` - PASS (0 errors; 2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`, untouched by this change)
- Manual browser verification of the five interaction-based acceptance criteria - SKIPPED (no live dev-role session with an active timer available in this session; left for the `test` stage)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Sole changed file (`timer-floating-widget.tsx`) read in full and checked line-by-line against every requirement and out-of-scope boundary in the task doc — matches the planned code context almost verbatim.
- Confirmed the `X` import was fully removed (grepped the file for any remaining `X` reference — none), so no unused-import dead code; `pnpm lint` corroborates with zero new warnings.
- `widgetRef` and `handleClickOutside` are clearly named and scoped; the `useEffect` mirrors `hub-header.tsx`'s existing pattern exactly (dependency array `[open]`, listener add/remove on mount/cleanup), so no new pattern was invented.
- The `e.target as Node` cast in the outside-click check is the identical idiom already used in the reference implementation (`hub-header.tsx`) — narrow, established, not a broad `any` escape hatch.
- No new shared hook was introduced (per the explicit out-of-scope instruction); the click-outside logic is inlined exactly as every other consumer in this codebase does it.
- No `stopPropagation`/`preventDefault`, no backdrop `<div>` — confirmed absent, per the explicit "don't swap in the backdrop approach" boundary.
- Verified structurally that `widgetRef` is attached to the outer `<div>` that contains *both* the panel and the pill `<Tooltip>` — the ref-wraps-everything design is what makes the pill's own `onClick` toggle immune to the new outside-click handler, satisfying requirement #2 without any special-casing.
- Task 265's changes (title decode, project name, `hh:mm:ss`, break-icon dynamism, auto-resume) are untouched in this diff — confirmed by reading the full file; only the imports, the new ref/effect, the header button, and the pill's `TooltipContent` string changed.

### Deviations
- Minor — the pill button's own `aria-label` (`open ? "Close timer widget" : "Open timer widget"`) still reads "Close" even though its tooltip now reads "Minimize." The task doc's requirements explicitly scoped the aria-label rename to the *header* button only, not the pill, so leaving it untouched is correct adherence to scope, not an oversight. Screen-reader-only, no visible or behavioral impact. Already logged in Implementation Notes for future consideration — no action needed here.
- No Medium or Major deviations. All 6 requirements and all 4 out-of-scope boundaries are satisfied as written.

### Required Fixes
- None.
