# 340: Timer Widget — Fix Dropdown Z-Index Under Page Toolbars + Restore Inline Elapsed Time on the Trigger

**Created:** 2026-08-31
**Priority:** MEDIUM
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

Two small, related fixes to the hub-wide header timer widget (`timer-header-widget.tsx`, task 300):

1. **Z-index bug.** On the v2 Projects listing (`/projects/v2`) and Legacy Projects listing (`/projects/legacy`) — and any other hub page with a `sticky top-0 z-20` toolbar — the expanded Timer dropdown panel is painted *behind* the page's sticky title/toolbar row (see screenshot: the "Timer" panel is clipped/overlapped by the "Legacy Projects" button, the "15 per page" pager, and the "Status Report" button). Root cause: `V2HubHeader`'s `<header>` is `relative z-10`, which creates a stacking context capped at `z-10`. The page's sticky toolbar wrapper is `sticky top-0 z-20`, which sits in the root stacking context *above* `z-10`, so it covers everything the header renders — including the timer dropdown's own `z-40` (that `z-40` only orders things *within* the header's `z-10` context, not against the page). Fix: raise the header to `z-30` so the whole header (and its dropdowns) always sits above page content, while staying below in-page modals (`fixed … z-50`) and the notification slide-over (`z-[99999]`).

2. **Missing inline elapsed time.** Task 300's post-ship follow-up removed the `HH:MM:SS` / `MM:SS` text that used to sit next to the Timer icon on the old floating widget, leaving only a small corner status dot. The user wants the running/active time shown after the icon again (as the floating widget did): elapsed `HH:MM:SS` when a task/issue timer is active, break countdown `MM:SS` when on a break. The corner status dot stays.

## Requirements

- [ ] The expanded Timer dropdown panel renders fully above the `sticky top-0 z-20` toolbar on `/projects/v2` and `/projects/legacy` (and `/projects/v2/status-report`, same pattern) — nothing from the page clips or overlaps it.
- [ ] In-page modals (`fixed inset-0 z-50`, e.g. New Project, Create Task) and the notification slide-over still render above the header after the change.
- [ ] When a task/issue timer is active and **not** on break, the trigger button shows `formatHHMMSS(elapsedSeconds)` immediately after the `Timer` icon (running or manually paused).
- [ ] When on a break, the trigger button shows the break countdown `formatMMSS(breakRemainingSeconds ?? 0)` after the icon.
- [ ] When no timer is running, the trigger is icon-only (no text, no dot) — unchanged from today.
- [ ] The corner status dot (green = active, brand-orange = on break) is retained.
- [ ] The trigger stays visually at home in the `h-16` header row (compact `text-[11px] font-mono tabular-nums`, no layout shift of the other right-hand controls).

## Out of Scope / Must-Not-Change

- The dropdown panel's own internal layout, colors, break grid, tooltips, empty state, click-outside behavior (task 267) — untouched.
- The `z-40` on the dropdown panel itself — leave as-is (the comment there about staying below the portalled tooltip's `z-50` is still correct).
- Do **not** lower the page toolbars' `z-20` — the fix belongs on the shared header, not each page.
- `NotificationBell`, `OpsChat`, sidebar z-indexes — not touched.
- The timer detail pages' `_timer-timeline-popover.tsx` — not touched.
- No changes to `TimerContext` / `active_timers` / serialization.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/_components/v2-hub-header.tsx` | Modify | `<header>` class `z-10` → `z-30` so header dropdowns clear `sticky z-20` page toolbars. |
| `src/app/(hub)/_components/timer-header-widget.tsx` | Modify | Trigger button: render inline elapsed time (`HH:MM:SS`) when a timer is active, or break countdown (`MM:SS`) when on break, after the `Timer` icon; keep the status dot. |

## Code Context

### File: `src/app/(hub)/_components/v2-hub-header.tsx` (line ~57)

```tsx
// current
<header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 gap-4 shrink-0 relative z-10">
// change to
<header className="h-16 bg-white border-b border-slate-200 flex items-center px-6 gap-4 shrink-0 relative z-30">
```

Stacking survey (grep of `src/app/(hub)/`): page sticky toolbars max out at `sticky top-0 z-20` (10 occurrences). In-page modals are `fixed inset-0 z-50`; dropdown backdrops on detail pages are `fixed inset-0 z-40`; the notification slide-over is `z-[99999]`. `z-30` on the header clears every sticky toolbar and stays under all modals/backdrops/slide-overs.

### File: `src/app/(hub)/_components/timer-header-widget.tsx` (trigger button, lines 68–89)

```tsx
// Helpers already imported at top of file:
//   import { formatMMSS, formatHHMMSS } from "@/lib/timer/format";
// State already destructured (line 29):
//   const { timer, elapsedSeconds, breakRemainingSeconds, ... } = useTimer();
//   const hasEntity = !!timer?.task_id || !!timer?.issue_id;
//   const onBreak = !!timer?.break_type;

<TooltipTrigger render={
  <button
    onClick={() => setOpen((o) => !o)}
    aria-label={open ? "Close timer widget" : "Open timer widget"}
    className="relative inline-flex items-center gap-1.5 p-1.5 rounded-lg text-[#5F6A88] hover:bg-[#F4F6FB] hover:text-[#3A4565] transition-colors cursor-pointer"
  >
    <span className="relative">
      <Timer size={18} />
      {hasEntity && (
        <span
          className={`absolute top-0.5 right-0.5 w-1.75 h-1.75 rounded-full border border-white ${
            onBreak ? "bg-[#FB914E]" : "bg-emerald-500"
          }`}
        />
      )}
    </span>
    {hasEntity && (
      <span className="text-[11px] font-mono font-semibold tabular-nums leading-none">
        {onBreak ? formatMMSS(breakRemainingSeconds ?? 0) : formatHHMMSS(elapsedSeconds)}
      </span>
    )}
  </button>
} />
```

Notes for the implementer:
- The status dot was previously positioned relative to the button itself; wrapping the icon in a `relative` inline `<span>` keeps the dot pinned to the icon (not drifting to the far edge once text is added). Adjust the exact dot offset only if it visually detaches from the icon corner.
- `gap-1.5` between icon and time text mirrors the projects-old `_task-timer-button.tsx` treatment (`text-[10px] font-mono font-semibold tabular-nums`); `text-[11px]` reads better against the `h-16` header. If the `impeccable` design hook flags the literal font-size, leave it — the whole panel already uses literal sizes carried over from task 300 (documented precedent).
- Trigger tooltip content (`open ? "Minimize" : "Timer & breaks"`) — unchanged.

### Pre-existing sticky toolbars that currently overlap the dropdown (fixed transitively by the header bump)

- `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx:166` — `sticky top-0 z-20`
- `src/app/(hub)/projects/_legacy-listing/_projects-index.tsx:168` — `sticky top-0 z-20`
- `src/app/(hub)/projects/v2/status-report/_status-report-client.tsx:146` — `sticky top-0 z-20`

## Implementation Steps

1. In `v2-hub-header.tsx`, change the `<header>` className `z-10` → `z-30`.
2. In `timer-header-widget.tsx`, update the trigger `<button>`:
   - make it `inline-flex items-center gap-1.5` (keep `relative`, padding, hover, rounded);
   - wrap `<Timer size={18} />` + the status-dot `<span>` in a `relative` inline `<span>` so the dot stays on the icon;
   - after that span, conditionally render the time `<span>` (`text-[11px] font-mono font-semibold tabular-nums leading-none`) — `formatMMSS(breakRemainingSeconds ?? 0)` when `onBreak`, else `formatHHMMSS(elapsedSeconds)` — gated on `hasEntity`.
3. `npx tsc --noEmit` and `pnpm lint`.
4. Browser acceptance (below).

## Acceptance Criteria

- [ ] `/projects/v2`: start a timer, open the Timer widget — the full dropdown panel is visible above the sticky toolbar (title row, pager, Status Report button). Scroll the list; the panel still clears the stuck toolbar.
- [ ] `/projects/legacy`: same result.
- [ ] `/projects/v2/status-report`: dropdown clears the sticky header there too.
- [ ] Open a page modal (e.g. New Project on `/projects/v2`) — it still covers the header. Open the notification bell — its slide-over still covers the header.
- [ ] Trigger shows `H:MM:SS`-style elapsed time next to the icon while a timer runs; pause it (manually) — time still shown, dot stays green.
- [ ] Start a break — trigger shows the `MM:SS` break countdown, dot turns brand-orange.
- [ ] Stop the timer / no timer running — trigger is icon-only, no dot, no text; other right-hand header controls don't shift.
- [ ] `npx tsc --noEmit` clean; `pnpm lint` clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Browser: pnpm dev, sign in with a role that can run a timer, exercise the acceptance list above
```

## Compatibility Touchpoints

- No packaging, docs, adapter, migration, or API surface impact.
- `CLAUDE.md` update not required.
- Partially reverses task 300's post-ship follow-up (which removed the inline elapsed-time text from the trigger) — intentional, per user request.

## Implementation Notes

### What Changed
- `V2HubHeader`'s `<header>` raised from `relative z-10` → `relative z-30`. The header's stacking context now sits above every hub page's `sticky top-0 z-20` toolbar (v2 Projects, Legacy Projects, v2 status-report, and 7 other occurrences), so the timer dropdown (and any other header dropdown) is no longer clipped/overlapped by page content. Still below in-page modals (`fixed … z-50`), detail-page dropdown backdrops (`z-40`), and the notification slide-over (`z-[99999]`).
- `timer-header-widget.tsx` trigger `<button>` is now `inline-flex items-center gap-1.5`. The `Timer` icon + status dot are wrapped in a `relative flex` span so the dot stays pinned to the icon corner once text is added. When a task/issue timer is active (`hasEntity`), an inline time `<span>` (`text-[11px] font-mono font-semibold tabular-nums leading-none`) renders after the icon: `formatHHMMSS(elapsedSeconds)` normally (running or manually paused), `formatMMSS(breakRemainingSeconds ?? 0)` while on a break. No timer running → icon-only, unchanged. `formatMMSS`/`formatHHMMSS` were already imported; `elapsedSeconds`/`breakRemainingSeconds` already destructured from `useTimer()`.

### Files Changed
- `src/app/(hub)/_components/v2-hub-header.tsx` — header `z-10` → `z-30`.
- `src/app/(hub)/_components/timer-header-widget.tsx` — trigger button inline elapsed-time / break countdown + icon-wrap for dot anchoring.

### Deviations From Plan
- None. Followed the Code Context snippets; used `relative flex` (not bare `relative`) on the icon wrap span so the inline-SVG baseline doesn't add descender space next to the time text.

### Design-hook (impeccable) findings
- `v2-hub-header.tsx` L61/L74/L88/L128 and `timer-header-widget.tsx` L130+ literal font-size/color findings all fired on edit but are pre-existing lines untouched by this change (or, for the one new `text-[11px]`, byte-identical to the panel's existing `text-[11px]`/`text-[12px]` treatment and the `projects-old/_task-timer-button.tsx` inline-time precedent). Left unchanged — matches task 300's documented precedent of not retrofitting unrelated shipped styling during a scoped change.

### Verification Run
- `npx tsc --noEmit` — PASS (no output).
- `pnpm lint` — PASS (0 errors; 2 pre-existing warnings in unrelated `_checklist-tab.tsx`).
- Browser acceptance — SKIPPED (not run in this session). Reviewer: with a timer running, open `/projects/v2` and `/projects/legacy`, click the header Timer icon, confirm the dropdown panel renders fully above the sticky title/toolbar row (and while scrolled); confirm inline `HH:MM:SS` shows next to the icon, switches to `MM:SS` + orange dot on a break, and disappears when the timer is stopped; confirm New Project / Create Task modals and the notification slide-over still cover the header.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Both edits are minimal and match existing file conventions. `v2-hub-header.tsx` is a one-token class change (`z-10` → `z-30`).
- `timer-header-widget.tsx`: icon+dot wrapped in a `relative flex` span so the status dot stays anchored to the icon after the time text is added; the now-redundant `relative` on the outer `<button>` (nothing is positioned against it anymore) was removed during this gate.
- New `text-[11px] font-mono font-semibold tabular-nums` matches the panel's existing literal-size treatment and the `projects-old/_task-timer-button.tsx` inline-time precedent. The `impeccable` literal-font-size findings on this file are all pre-existing (task 300 precedent) — not introduced here.
- No dead code, no `any`, no new nesting, no secrets/logging. `formatMMSS`/`formatHHMMSS` and `elapsedSeconds`/`breakRemainingSeconds` were already imported/destructured.

### Deviations
- Minor: inline time renders whenever a task/issue timer exists (running **or** manually paused), not only while strictly "running" as the user phrased it. Documented in Requirements; a paused timer still represents tracked time and the dropdown already showed it in both states. Break state shows the `MM:SS` countdown, matching the pre-task-300 floating widget.
- Minor: removed the outer `<button>`'s `relative` class (became redundant once the dot moved into its own `relative` wrapper).

### Required Fixes
- None.

### Verification Re-Run (post gate edit)
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (0 errors; 2 pre-existing unrelated warnings)

## Follow-up — Trigger Visual Revision (user request, post quality gate)

User asked for a heavier, more legible trigger that communicates state through the icon and a fill colour rather than a small dot:

### What Changed (`timer-header-widget.tsx` only)
- **Larger numbers** — inline elapsed/countdown text `text-[11px]` → `text-[13px]`.
- **Status dot removed** — the green/amber corner dot and its `relative flex` icon wrapper are gone.
- **Icon swaps on break** — new `TriggerIcon`: `Timer` normally, `BREAK_ICONS[break_type]` while on a break (`Utensils` / `Coffee` / `Clock`).
- **Active background** — new `triggerActiveClass`: `bg-[#007BFF] text-white` (hover `#0063D6`) while running, `bg-[#FFF3D6] text-[#8A5A00]` (hover `#FFECBF`) while on a break, default `text-[#5F6A88] hover:bg-[#F4F6FB]` otherwise (idle / manually paused). Icon and numbers inherit the fill's text colour.
- **Stateful tooltip** — `triggerTooltip` replaces the static `"Timer & breaks"`: `"Minimize"` when open, `"On a Meal Break"` / `"On a Coffee Break"` / `"On a 5 minutes break"` while on a break (few-minutes form uses `BREAK_DURATIONS_MIN.few_minutes`), `"Timer is running"` while running, `"Timer paused"` when a timer exists but is stopped, `"Timer & breaks"` when no timer.
- New import: `BREAK_DURATIONS_MIN` from `@/lib/timer/constants`. `isRunning = timer?.status === "running"` helper added.

### Deviations
- Minor: idle/paused states keep the default (no-fill) button look — the user specified fill colours only for "running" and "on break".
- Minor: `few_minutes` tooltip renders literally as `"On a 5 minutes break"` (per the user's `"On a <number> minutes break"` wording), not the more grammatical "5-minute break".

### Design-hook (impeccable)
- `text-[13px]` and the literal hex fills flagged as off-ramp — consistent with this file's established literal-value convention (task 300 precedent, entire panel uses literal sizes/colours); the amber pair `#FFF3D6`/`#8A5A00` is already the dropdown's on-break palette. Left as-is.

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (0 errors; same 2 pre-existing unrelated warnings)
- Browser acceptance — still NOT RUN this session. Reviewer additionally: confirm the button fills solid blue while running (white icon + numbers), fills light amber with the meal/coffee/clock icon while on the matching break, and the tooltip text matches the state.

## Follow-up 2 — Trigger Tweaks (user request)

- **Trigger tooltip suppressed while the panel is open** — `<TooltipContent>` is now conditionally rendered (`{!open && …}`); the `open ? "Minimize"` branch was dropped from `triggerTooltip`. The panel's own Minimize button is the only affordance while open.
- **More horizontal padding** — trigger button `p-1.5` → `px-2.5 py-1.5`.
- **Lighter running fill** — running state `bg-[#007BFF] text-white hover:bg-[#0063D6]` → `bg-[#E1EDFF] text-[#0063D6] hover:bg-[#D0E2FF]`, so it reads as a light tint like the on-break amber rather than a solid button. Icon + numbers inherit `#0063D6`.
- `npx tsc --noEmit` + `pnpm lint` — PASS (same 2 pre-existing unrelated warnings).
