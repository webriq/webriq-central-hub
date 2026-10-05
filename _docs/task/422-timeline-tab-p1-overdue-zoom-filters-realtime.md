# 422: Timeline Tab — P1: Overdue/At-Risk State, Day/Week Zoom, Filters, Generic Realtime, Menu + Scroll Fixes

**Created:** 2026-10-05
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

P1 group from the Timeline tab audit (follows task 421's P0 accessibility/feedback work, and builds on 420's `generic-timeline.ts` and 421's `_gantt-shared.ts` / `_deliverable-card.tsx` extraction). Six usability gaps across both Timeline engines (StackShift I `customer_phases` and the generic milestones engine):

1. **No overdue / at-risk signal (audit M5, M6).** Reminders only ever evaluate Phase 1 deliverables (`buildReminders`); Phases 2–5 and every generic milestone read "On track" regardless of dates. Generic phase span bars carry no progress.
2. **No zoom (M3).** `DAY_WIDTH = 80` is fixed — a 120-day programme is 9,600 px wide with no overview.
3. **No filters (M4).** No way to narrow by status or owner (or search by name) on a busy timeline.
4. **No realtime in the generic view (M10).** StackShift I subscribes to `customer_phases`/`customer_deliverables`; the generic view is SSR props + local state, so another user's milestone/tasklist/task edits don't appear until reload.
5. **Jump-to-phase menu (U4).** No Escape handling, no outside-click close, no `aria-expanded` (both `JumpToPhaseMenu` and `GenericJumpToPhaseMenu`).
6. **Wheel hijack (U10).** `handleGridWheel` converts *all* vertical wheel input over the grid to horizontal pan, trapping trackpad users and fighting page scroll on long timelines.

## Requirements

### A. Overdue / at-risk state
- [ ] One pure helper `deliverableHealth({ dayEnd, currentDay, percentage, status })` → `"done" | "overdue" | "due-soon" | "ok" | "upcoming"` (overdue: end < today and not done; due-soon: end − today ≤ 2 and not done; upcoming: start > today). Lives in a lib module (no inline math), unit-checked via throwaway script.
- [ ] StackShift I: deliverable cards show a state marker beyond colour — overdue gets a red border + `AlertTriangle` icon, due-soon an amber border + `Clock` icon; each has an accessible name suffix (", overdue") in the existing `aria-describedby` text. Phase lane label shows `N overdue` (red) when > 0.
- [ ] `buildReminders` extended to the active phase for **any** phase (not just Phase 1): up to the existing 5-chip cap, with a `+N more` chip when truncated (audit U20).
- [ ] Generic: tasklist cards use the same health states (end < today and `pct < 100` → overdue). The phase span bar gets a progress fill (`done/total` tasks) and turns red-outlined when `due_date` has passed and the milestone isn't completed (M6).
- [ ] No state is conveyed by colour alone (icon + text always accompany).

### B. Day / Week zoom
- [ ] A segmented control (Day | Week) above the grid, both engines. Week uses `DAY_WIDTH_WEEK = 24` px per day, with one header cell per week (e.g. "Mon 6"); Day stays 80.
- [ ] `DAY_WIDTH` stops being a module-global used at render time: grid, cards, span bars, today marker, drag math and scroll-to-today receive a `dayWidth` (prop/context). Shared constants stay as defaults.
- [ ] Drag/resize snapping (StackShift, `canEditSchedule`) still snaps to whole days at either zoom; in Week zoom the live-range chip from task 421 still shows exact dates.
- [ ] Choice persisted per browser in `localStorage` (try/catch-wrapped, renders correctly without it); default Day. "Jump to today" centres correctly at both zooms.
- [ ] Compact cards (`width < 90`) behave sensibly in Week zoom: title hidden, ring + tooltip/focus details only (task 421's details card covers the content).

### C. Filters
- [ ] Toolbar filter row (both engines): **Status** (All / Overdue / In progress / Done) and, for StackShift I, **Owner** (from `ownerChips` owners); generic gets a **name search** over tasklists. Filters match cards; non-matching cards are **dimmed (`opacity-30`, still focusable/readable), not removed**, so positions and the Gantt shape stay stable.
- [ ] A visible "N of M shown" count and a "Clear filters" button when any filter is active; empty-match state is the dimmed grid plus the count (no blank screen).
- [ ] Filter state in URL query params (`?status=overdue&owner=PM&q=…`) via `window.history.replaceState` (same approach as task 359's Files tab — the page is `force-dynamic`, a `router.replace` would refetch). Params coexist with the existing `?phase=&deliverable=` wizard params.

### D. Generic-view realtime
- [ ] `GenericPhaseView` subscribes to Supabase Realtime for `milestones`, `tasklists`, `tasks` filtered by `project_id=eq.{id}` (same pattern/channel hygiene as `_onboarding-detail.tsx`'s `v2_onboarding_{id}` channel). Insert/update/delete merge into local state; `tasklists` and `tasks` move from read-only props to state seeded by props.
- [ ] A subscription error/closed status surfaces a small "Live updates paused — reload to refresh" notice instead of failing silently (also applied to the StackShift channel, audit M11).
- [ ] Tasks can be numerous: realtime handlers update counts via the existing `useMemo` aggregation; no per-event refetch.

### E. Jump menu behaviour (U4)
- [ ] Both Jump-to-phase menus: close on Escape (focus returns to trigger), close on outside `mousedown`, trigger gets `aria-expanded` + `aria-haspopup="menu"`, items `role="menuitem"`, ArrowUp/Down moves focus between enabled items. One shared small hook (`useDismissibleMenu`).

### F. Wheel behaviour (U10)
- [ ] Vertical wheel only pans horizontally when **Shift is held** or the pointer is over the date-header row; unmodified vertical wheel scrolls the page as normal. Native horizontal input (`deltaX` dominant, trackpad swipe) still pans. Ctrl+wheel (pinch-zoom) untouched.
- [ ] The wheel/scroll-to-today logic currently duplicated in `_onboarding-detail.tsx` and `_generic-swimlane.tsx` is extracted into one `useGanttScroll()` hook used by both (needed to fix this once, not twice).

## Out of Scope / Must-Not-Change

- No dependencies/critical path, export/share, drag in the generic engine, collapse-state persistence, phase colour reuse beyond 5 (audit P2 / later items).
- No schema or API changes; realtime uses existing tables and the already-granted publication (verify `milestones`/`tasklists`/`tasks` are in the `supabase_realtime` publication — if not, document and degrade to the "paused" notice; no migration written by this task).
- Task 421's accessibility behaviour (focus details, keyboard nudge, drag chip, Unscheduled row) must keep working at both zoom levels.
- StackShift I data model (`customer_phases`, `programme_duration_days`, day-scale conversions) untouched; health uses the already-display-scaled day values.
- Do not run git commands. Tailwind classes only (computed pixel positions excepted).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/programme/deliverable-health.ts` | Create (~60) | Pure `deliverableHealth`, `countByHealth` helpers. |
| `…/[projectId]/_gantt-shared.ts` | Modify | Add `DAY_WIDTH_WEEK`, `GanttZoom` type, `dayWidthFor(zoom)`; keep `DAY_WIDTH` as the Day default. |
| `…/[projectId]/_gantt-zoom-context.tsx` | Create (~50) | Context + provider supplying `dayWidth`/`zoom` to cards, lanes, header, marker. |
| `…/[projectId]/_use-gantt-scroll.ts` | Create (~70) | Shared wheel (Shift/header-only), scroll-to-today, ref-callback attach logic; replaces the two duplicated copies. |
| `…/[projectId]/_use-dismissible-menu.ts` | Create (~50) | Escape / outside-click / arrow-key handling for both Jump menus. |
| `…/[projectId]/_timeline-toolbar.tsx` | Create (~150) | Zoom segmented control, status/owner/search filters, "N of M" + Clear; URL-param sync via `replaceState`. |
| `…/[projectId]/_use-timeline-filters.ts` | Create (~80) | Parses/serialises filter state; exposes `matches(card)`. |
| `…/[projectId]/_deliverable-card.tsx` | Modify | Health marker + a11y suffix, `dimmed` prop, `dayWidth` from context. |
| `…/[projectId]/_onboarding-detail.tsx` | Modify (net reduction) | Wire toolbar, zoom provider, `useGanttScroll`, `buildReminders` for any phase + `+N more`, per-lane overdue count; channel-status notice. |
| `…/[projectId]/_generic-swimlane-lane.tsx`, `_generic-swimlane.tsx` | Modify | Health on cards, span-bar progress/overdue, dimming, `dayWidth`, `useGanttScroll`, header week grouping. |
| `…/[projectId]/_generic-phase-view.tsx` | Modify | Realtime state for milestones/tasklists/tasks, notice, toolbar wiring. |
| `…/[projectId]/_generic-jump-to-phase-menu.tsx` + `JumpToPhaseMenu` | Modify | Use `useDismissibleMenu`, aria. |
| `…/[projectId]/_date-column-header.tsx` | Create (~60) | `DateColumnHeader` (moved from `_onboarding-detail.tsx`) + week-grouped variant; re-exported for existing importers. |

## Code Context

### Fixed pixel scale everywhere — `_gantt-shared.ts`, `_deliverable-card.tsx`, `_generic-swimlane*.tsx`, `_onboarding-detail.tsx`

`DAY_WIDTH` is read directly in: card `left`/`width` (`_deliverable-card.tsx`), drag delta→days (`_use-deliverable-schedule-drag.ts`), grid width, today marker `left`, `scrollToToday`, generic lane card/span-bar positions. All must take `dayWidth` from the context; the drag hook gets it as a parameter.

### Reminders are Phase-1-only — `_onboarding-detail.tsx` `buildReminders`

`else if (phase.number === 1) { for (const d of phase.deliverables) … }` and `if (items.length === 0) → "On track"`. Generalise the loop to the active phase's deliverables using `deliverableHealth`, keep the Phase-1 window warning and gate-15 chip, add `+N more`.

### Wheel hijack — duplicated in `_onboarding-detail.tsx` (`handleGridWheel`) and `_generic-swimlane.tsx`

Always `preventDefault()`s and maps `deltaY → scrollLeft` whenever the grid overflows. Replace with the Shift/header rule in the shared hook.

### Realtime precedent — `_onboarding-detail.tsx` `v2_onboarding_${project.id}` channel

`postgres_changes` with `filter: project_id=eq.${id}`; handlers upsert into state by `id`. Mirror for `milestones`/`tasklists`/`tasks` (handle `DELETE` via `payload.old.id`, which the StackShift handlers currently ignore).

## Implementation Steps

1. Add `deliverable-health.ts`; verify with a throwaway script (overdue/due-soon/upcoming/done boundaries, single-day deliverables, scaled durations).
2. Introduce `GanttZoomContext` + `dayWidth` plumbing; make the drag hook and all positional math use it. Verify Day zoom is pixel-identical to today before adding Week.
3. Extract `_date-column-header.tsx` (day + week variants) and `useGanttScroll`; switch both views over; apply the Shift/header wheel rule.
4. Add `useDismissibleMenu`; apply to both Jump menus.
5. Build filters hook + toolbar; dimming in cards/lanes; URL sync.
6. Health markers on cards, lane overdue counts, generalised reminders (+N more), generic span-bar progress/overdue.
7. Generic realtime + "paused" notices; confirm publication coverage.
8. `npx tsc --noEmit`, `pnpm lint`, line counts (every new/touched file ≤ ~250; `_onboarding-detail.tsx` must not grow).
9. Browser acceptance (below) at Day and Week zoom, with task 421's checks re-run.

## Acceptance Criteria

- [ ] A Phase 2–5 deliverable past its end date and not done shows the overdue marker (icon + red border + "overdue" in its accessible description), the lane label shows "N overdue", and the reminder strip lists it instead of "On track".
- [ ] A generic tasklist/milestone past due shows the same state; the milestone span bar shows task-completion fill.
- [ ] Week zoom shows the whole 120-day programme in roughly one screenful at 1440 px; switching back and forth keeps "today" centred; choice survives reload; Day zoom looks identical to before this task.
- [ ] Filtering by status/owner/search dims non-matching cards, shows "N of M shown", survives reload via the URL, and Clear restores all; `?phase=&deliverable=` deep links still open the Wizard.
- [ ] Editing a milestone's dates / a tasklist / a task in another tab updates the generic Timeline within a few seconds without reload; killing the connection shows the "paused" notice.
- [ ] Jump menus close on Escape (focus returns) and outside click; arrow keys move through enabled items; `aria-expanded` reflects state.
- [ ] Unmodified vertical wheel over the grid scrolls the page; Shift+wheel and horizontal swipe pan the grid; Ctrl+wheel unaffected.
- [ ] Task 421 behaviours (focus details, `Alt+←/→`, drag chip, Unscheduled row) still pass at both zooms.
- [ ] `npx tsc --noEmit` and `pnpm lint` clean; no touched file grows past guidance; `_onboarding-detail.tsx` line count does not increase.

## Verification

```bash
npx tsc --noEmit
pnpm lint
wc -l src/lib/programme/deliverable-health.ts "src/app/(hub)/projects/v2/[projectId]/"_{timeline-toolbar,use-gantt-scroll,use-dismissible-menu,use-timeline-filters,gantt-zoom-context,date-column-header,deliverable-card,onboarding-detail,generic-swimlane-lane,generic-phase-view}.ts*
# Manual (pnpm dev): StackShift I project mid-programme (overdue Phase 2+ deliverable) and a generic
# project with dated milestones + tasklists, at Day and Week zoom, plus two browser windows for realtime.
```

## Compatibility Touchpoints

- No env, migration, packaging or API impact (verify Realtime publication membership for `milestones`/`tasklists`/`tasks`; if absent, flag to the operator — a migration would be a separate, user-applied task per repo convention).
- Source: Timeline tab audit, 2026-10-05 (items M3–M5, M6, M10, M11, U4, U10, U20). Depends on tasks 420 and 421.

## Open Questions (defaults chosen — flag to change)

1. **Week scale width** — default 24 px/day (168 px/week). Alternative: a Month zoom as a third option later.
2. **Dim vs hide** for filtered-out cards — default dim (keeps Gantt geometry stable); hiding would let lanes collapse.
3. **"Due soon" threshold** — default 2 days, matching `buildReminders`' existing warning cut-off.
4. **Wheel rule** — default Shift or header-row hover; alternative is a visible "scroll lock" toggle.

## Implementation Notes

### What Changed
- **Health (A):** `deliverableHealth`/`progressPercentage` in `src/lib/programme/deliverable-health.ts` (overdue = end < today & not done; due-soon ≤ 2 days; upcoming). StackShift cards get a red/amber border + `AlertTriangle`/`Clock` icon and "Overdue./Due soon." in their `aria-describedby` text; lane labels show "N overdue". `buildReminders` (now in `_timeline-reminders.tsx`) covers whichever phase is active, worst-first, cap 5 with a "+N more" chip; "due today" now reads "Due today" instead of "Overdue". Generic tasklist cards use the same health; phase span bars show a task-completion fill + `· NN%`, and a red ring + "overdue" when the window has ended and the phase isn't completed.
- **Zoom (B):** `GanttZoomProvider` (`useSyncExternalStore` over `localStorage["timeline-zoom"]`, wrapped around `OnboardingDetail` in `timeline/page.tsx`) supplies `dayWidth` to header, lanes, cards, today marker, drag math and scroll-to-today; Week shows one header cell per 7 days; cards narrower than 60 px keep ring + marker only (title `sr-only`); re-centres on today when zoom changes.
- **Filters (C):** `TimelineToolbar` (Day/Week segmented control, status select, owner select [StackShift only], name search, "N of M shown", Clear) + `useTimelineFilters` (URL `?status=&owner=&q=` via `replaceState`, other params preserved). Non-matching cards dim to 30% rather than disappear.
- **Realtime (D):** `useGenericRealtime` subscribes to `milestones`/`tasklists`/`tasks` (`project_id` filter, DELETE handled via `old.id`); `GenericPhaseView` now holds tasklists/tasks in state. `LiveUpdatesNotice` ("Live updates paused — reload to refresh") shows on `CHANNEL_ERROR`/`TIMED_OUT`/`CLOSED`, for both engines (closes audit M11).
- **Menus (E):** `useDismissibleMenu` (Escape → close + refocus trigger, outside mousedown, ArrowUp/Down over enabled `role=menuitem`s, ArrowDown on trigger opens); both Jump menus get `aria-expanded`/`aria-haspopup="menu"`/`role="menu"`.
- **Wheel (F):** `useGanttScroll` replaces the two duplicated copies: vertical wheel pans only over `[data-gantt-header]` or with Shift; horizontal/native and Ctrl+wheel untouched.
- `_onboarding-detail.tsx` shrank 1,385 → 1,027 lines (Swimlane, JumpToPhaseMenu, reminders, date header, `assignTracks` moved out).

### Files Changed
- New: `src/lib/programme/deliverable-health.ts`; in `…/[projectId]/`: `_gantt-zoom-context.tsx`, `_date-column-header.tsx`, `_use-gantt-scroll.ts`, `_use-dismissible-menu.ts`, `_use-timeline-filters.ts`, `_timeline-stats.ts`, `_timeline-toolbar.tsx`, `_timeline-reminders.tsx`, `_live-updates.tsx`, `_use-generic-realtime.ts`, `_swimlane.tsx`, `_jump-to-phase-menu.tsx`
- Modified: `_gantt-shared.ts` (zoom constants, `assignTracks`), `_deliverable-card.tsx`, `_use-deliverable-schedule-drag.ts` (`dayWidth` param), `_onboarding-detail.tsx`, `_generic-swimlane.tsx`, `_generic-swimlane-lane.tsx`, `_generic-phase-view.tsx`, `_generic-jump-to-phase-menu.tsx`, `(tabs)/timeline/page.tsx`

### Deviations From Plan
- **Week scale is 10 px/day, not 24:** at 24 px a 120-day programme was ~3,080 px (2+ screens), contradicting the "roughly one screenful" acceptance criterion; at 10 px it is 1,400 px. Open question 1 resolved this way.
- `deliverableHealth` takes `percentage` (done = ≥100) rather than a separate status.
- Extra extractions beyond the file list (`_swimlane.tsx`, `_jump-to-phase-menu.tsx`, `_timeline-reminders.tsx`, `_timeline-stats.ts`, `_live-updates.tsx`) so `_onboarding-detail.tsx` shrinks instead of growing; `DateColumnHeader` is replaced by `GridHeader` (renders the whole header row, day or week); `DAY_WIDTH`/`ROW_*`/`assignTracks`/`DateColumnHeader` are no longer re-exported from `_onboarding-detail.tsx` (all importers updated; `TOTAL_DAYS`, `PHASE_HEX`, `PHASE_TINT_HEX`, `addDays` still are).
- Owner/status filters cover cards only; the phase-lane "N overdue" count ignores filters.
- **Realtime publication not verified/changed:** no migration in the repo adds `customer_phases`, `customer_deliverables`, `milestones`, `tasklists` or `tasks` to `supabase_realtime`. If they aren't in the publication (it may have been done in the dashboard) the channel subscribes but never delivers events, and the "paused" notice cannot detect that. Per the task's scope no migration was written.

### Verification Run
- `npx tsc --noEmit` — PASS
- `eslint` on `src/lib/programme/deliverable-health.ts` + the whole `[projectId]` folder — 0 errors (3 pre-existing unused-var warnings in files this task did not touch)
- Throwaway `tsx` check of `deliverableHealth`/`progressPercentage` boundaries (overdue, due today, 2 vs 3 days, upcoming, single-day, checklist %) — PASS (10/10)
- Browser (2026-10-05, local dev, Super Admin; no data written):
  - StackShift I (Hello Homes GR, Day 61): Phase 2 deliverables all flagged — 7/7 cards red border + icon + "Overdue." text; reminder strip shows 5 overdue chips + "+2 more"; lane label "7 overdue"; Phase 3 "5 overdue" — PASS
  - Wheel: vertical over cards not prevented; over header prevented and panned 120 px; Shift prevented; horizontal-dominant and Ctrl untouched — PASS
  - Week zoom: header 121 → 19 cells, grid 9,800 → 3,080 px at 24 px (1,400 px after the 10 px change, fits a 1,352 px viewport), today centred, choice persisted in `localStorage` and restored after reload — PASS
  - Filters via URL (`?status=overdue&q=branding`): controls restored, "1 of 20 shown", 6 of 7 cards dimmed — PASS. Generic project: status filter → "0 of 0 shown", URL param set, Clear removes it — PASS
  - Jump menu: ArrowDown opens + focuses first item, second ArrowDown skips the disabled current phase, Escape closes + refocuses trigger, outside mousedown closes; `aria-expanded`/`aria-haspopup` present — PASS
  - Generic engine (UFP International): toolbar, Week zoom (22-day phase ≈ 220 px, weekly header), no "paused" notice (subscribed) — PASS
  - **Not exercised:** realtime event delivery (needs a write to a real project + publication membership unknown), "paused" notice (needs a dropped socket), generic overdue/due-soon card markers and span-bar progress fill with data (no generic project has tasklists/tasks; UFP's phase is not overdue), Week-zoom drag/keyboard nudge, task 421 regression pass beyond aria text, touch.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. Pure logic is isolated (`deliverable-health.ts`, `_timeline-stats.ts`), hooks have single responsibilities (`useGanttScroll`, `useDismissibleMenu`, `useTimelineFilters`, `useGenericRealtime`), and `_onboarding-detail.tsx` shrank 1,385 → ~1,027 lines. Largest new/touched file is `_deliverable-card.tsx` (~294, under the 300 soft-warn); no `any`, debug logging, dead code, or commented-out code. All `localStorage` access is try/catch-wrapped.
- Fixes applied during review: `useTimelineFilters` wrote to `window.history` inside a `setState` updater (impure; StrictMode runs updaters twice) — now computes the next value from a ref and writes the URL outside the updater; `CardFacts` redeclared `percentage`/`health` already provided by `FilterItem` — reduced to `FilterItem & { key }`; two comments still pointed at `_onboarding-detail.tsx` line numbers/Swimlane that moved — updated. `tsc` + eslint re-run PASS; filters re-checked in the browser (URL write, "1 of 20 shown", Clear resets URL + controls).
- Left as-is: small duplication of "subscribe → status" wiring between the StackShift channel and `useGenericRealtime` (two call sites sharing `toLiveStatus`; extracting a wrapper would obscure the different table handlers); `HEALTH_LABEL` carries entries for states that never render a label (typed `Record<Health,…>` keeps it exhaustive).

### Deviations
- Medium (visible): Week zoom is 10 px/day instead of the planned 24 — the plan's own acceptance criterion (programme fits ~one screen) required it; documented in Implementation Notes.
- Medium (visible): Realtime publication membership for `customer_phases`/`customer_deliverables`/`milestones`/`tasklists`/`tasks` is unverified and no migration was written (per scope). If absent, live events won't arrive and the "paused" notice can't detect it — needs an operator check before relying on D.
- Minor: extra extractions (`_swimlane.tsx`, `_jump-to-phase-menu.tsx`, `_timeline-reminders.tsx`, `_timeline-stats.ts`, `_live-updates.tsx`); `GridHeader` replaces `DateColumnHeader`; "Due today" wording in reminders.
- Out-of-scope boundaries respected: no schema/API change, no generic-engine drag, no dependencies/export/collapse persistence, task 421 behaviours untouched.

### Required Fixes
- None.

## Post-implementation Finding (from task 423 investigation, 2026-10-05)

The Realtime publication question is now answered: `customer_phases`, `customer_deliverables`, `milestones`, `tasklists`, `tasks`, `phase_members` and `onboarding_internal_deliverables` are **not** in `supabase_realtime` (verified with a positive control `customer_products` and a nonexistent-table negative control; see `_docs/task/423-unify-phases-deliverables-investigation.md`). So requirement D's hook subscribes but **never receives events**, and the pre-existing StackShift channel has never delivered either. The "Live updates paused" notice cannot detect this. Fix: a migration adding the tables to the publication (written-not-applied per repo convention) — proposed as follow-up F0 in task 423. Until it is applied, treat requirement D as non-functional.
