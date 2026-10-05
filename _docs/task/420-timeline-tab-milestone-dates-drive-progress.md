# 420: Timeline Tab — Milestone Start/Due Dates Drive the Programme Progress Bar + UI Polish

**Created:** 2026-10-05
**Priority:** HIGH
**Type:** fix + enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

On a generic-engine project (e.g. UFP International, StackShift II without the `customer_phases` opt-in), the **Timeline** tab renders `GenericPhaseView` → `GenericSwimlane`. Its "N-Day Programme Progress" card and Gantt grid are computed **only from `milestones.day_start` / `day_end`** (`visibleTotalDays = max(day_end)`), never from `start_date` / `due_date`.

Task 412 let users set **Start** and **Due** on a milestone (Milestones tab). Those columns never feed the Timeline, so a milestone with Sep 23 → Oct 14 and no `day_*` values produces:

- Progress card: **"1-DAY PROGRAMME PROGRESS · DAY 1 OF 1"** (`Math.max(1, …0)`), Day 1 = Oct 5 (the programme start date), Days left 0.
- Gantt: a single date column, a collapsed-looking phase row with no span.
- Header pill: "No active phase" even though today falls inside the milestone's window.

**Fix:** treat a milestone's Start/Due as the source of truth for the Timeline's date window. Setting Start and Due must calculate the number of days shown on the progress bar (Sep 23 → Oct 14 = **22 days**; today Oct 5 = **Day 13 of 22**). "Milestones" are the generic-engine equivalent of StackShift I's "Phases" — the Timeline copy/visuals should read as phases, matching StackShift I's Timeline.

Also polish the Timeline UI (phase span bars, date ranges on lane labels, not-started / overdue / complete states, missing-dates empty state) and keep every touched file within `nextjs-file-length-best-practices.md` (components 100–250 lines, soft warn 250–300, hard 400; hooks/utils 30–150).

## Requirements

- [ ] Progress card total = days from the **earliest effective phase start** to the **latest effective phase end**, inclusive (22 for Sep 23 → Oct 14). "Day N of M" uses today relative to that same origin.
- [ ] Left/right axis labels show the real first/last dates (Sep 23, 2026 / Oct 14, 2026), not the programme start date.
- [ ] Effective phase window per milestone: `start_date`+`due_date` when both set; else fall back to `day_start`/`day_end` offset from `programme_started_at` (seeded StackShift-style milestones keep working). Milestone with only one date: treat as a single-day window on that date. Milestone with neither → excluded from the window and from the Gantt, listed in a "No dates set" hint with a link to the Milestones tab.
- [ ] Tasklist (deliverable) cards, which only carry `day_start`/`day_end` relative to `programme_started_at`, are shifted by `(programme_started_at − origin)` days so they still land in the right columns.
- [ ] Before the window starts: bar at 0%, label "STARTS IN N DAYS" (no "Day 0"). After it ends with phases incomplete: "N DAYS OVERDUE" in the red/overdue style already used by `_programme-progress-card.tsx`. All phases completed: green "Complete".
- [ ] Header pill ("No active phase") falls back to the phase whose window contains today when no milestone has `status = 'active'`.
- [ ] Each phase lane shows a span bar (phase colour from `PHASE_VISUALS`) over its Start→Due columns, and the lane label shows `Sep 23 – Oct 14 · 22d` + task counts.
- [ ] Copy uses "phase/phases" for this engine (stat chip "Phases done" already does); empty state text points to the Milestones tab by that name.
- [ ] "Jump to phase" keeps working. For date-driven milestones (`day_start` null) the existing generic-phase route already skips the `programme_started_at` backdate — verify it only flips statuses and the UI does not claim a day change.
- [ ] Existing seeded generic projects (milestones with `day_start`/`day_end`, optional dates) render exactly as before when no `start_date`/`due_date` exist.
- [ ] No file touched or created exceeds ~250 lines (see split plan below); pure date math lives in a lib module, not inline.

## Out of Scope / Must-Not-Change

- StackShift I engine (`_onboarding-detail.tsx` swimlane, `_programme-progress-card.tsx`, `_use-programme-progress.ts`, `customer_phases`) — untouched. Reuse only its exported constants/helpers (`DAY_WIDTH`, `LABEL_WIDTH`, `ROW_HEIGHT`, `PHASE_VISUALS`, `addDays`, `DateColumnHeader`, `StatChip`).
- No migration; no schema change. `milestones.start_date/due_date/day_start/day_end` already exist.
- No write-through of derived `day_start`/`day_end` back to `milestones` (Timeline computes, never persists).
- Milestone/tasklist/task CRUD stays on the Milestones/Tasks tabs; no drag-resize on the Gantt.
- `getCurrentProgrammeDay` in `@/config/customer-phases` is not changed (StackShift I depends on it).
- Do not run git commands. No `style={{}}` beyond the computed pixel/percent values the existing Gantt already needs.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/programme/generic-timeline.ts` | Create (~110 lines) | Pure helpers: `resolvePhaseWindow(m, programmeStartedAt)`, `buildTimeline(milestones, programmeStartedAt, today)` → `{ origin, totalDays, currentDay, phase: "upcoming"\|"running"\|"overdue"\|"complete", windows: Map<id,{startDay,endDay}>, undated: Milestone[], tasklistOffset }`, `currentPhaseByDate`. Date-only (local-midnight) arithmetic, no `Date.now()` inside so it is testable. |
| `src/app/(hub)/projects/v2/[projectId]/_generic-phase-view.tsx` | Modify (290 → ≤200) | Replace the `max(day_end)` math with `buildTimeline`; render new progress card; pass windows to swimlane. Move not-started + no-milestones screens into `_generic-phase-empty-states.tsx`. |
| `src/app/(hub)/projects/v2/[projectId]/_generic-phase-empty-states.tsx` | Create (~90) | `GenericNotStartedScreen`, `GenericNoPhasesScreen` extracted verbatim (props only). |
| `src/app/(hub)/projects/v2/[projectId]/_generic-progress-card.tsx` | Create (~110) | Progress bar + stat chips for the generic engine (upcoming/running/overdue/complete states, correct axis dates, "No dates set" hint). Does not reuse `ProgrammeProgressCard` (its props are `customer_phases`-specific). |
| `src/app/(hub)/projects/v2/[projectId]/_generic-swimlane.tsx` | Modify (269 → ≤200) | Consume `windows` + `tasklistOffset`; delegate lane rendering to the new lane component; keep wheel/scroll-to-today logic. |
| `src/app/(hub)/projects/v2/[projectId]/_generic-swimlane-lane.tsx` | Create (~120) | One phase lane: label (dates · days · task counts), span bar, deliverable cards. |
| `src/app/(hub)/projects/v2/[projectId]/(tabs)/timeline/page.tsx` | No change expected | Data already flows through `loadOnboardingDetailData`; confirm milestones are passed with all columns (`select("*")`). |

## Code Context

### Root cause — `_generic-phase-view.tsx` (current)

```tsx
const startDate = new Date(programmeStartedAt!);
const currentDay = getCurrentProgrammeDay(programmeStartedAt!);
const visibleTotalDays = Math.max(1, ...milestones.map((m) => m.day_end ?? 0));   // ← ignores start_date/due_date
```

A milestone with `start_date='2026-09-23'`, `due_date='2026-10-14'`, `day_end=null` → `visibleTotalDays = 1`.

### Milestone row (`src/types/database.ts`)

`start_date: string | null; due_date: string | null; day_start: number | null; day_end: number | null; position: number | null; status: "planned"|"active"|"completed"`. `start_date`/`due_date` are `YYYY-MM-DD` — parse as **local** dates (`new Date(y, m-1, d)`) to avoid the UTC off-by-one.

### Intended helper shape

```ts
// src/lib/programme/generic-timeline.ts
export function buildTimeline(milestones: Milestone[], programmeStartedAt: string, today = new Date()) {
  // effective window per milestone (absolute dates):
  //   start_date/due_date if present, else programmeStartedAt + (day_start-1 … day_end-1)
  // origin = min(start), end = max(end), totalDays = diffDays(origin, end) + 1
  // currentDay = diffDays(origin, today) + 1  (may be <1 → "upcoming", >totalDays → "overdue" unless all completed)
  // tasklistOffset = diffDays(origin, programmeStartedAt)  // shift for tasklist day_start/day_end
}
```

### Swimlane inputs that change

`GenericSwimlane` currently gets `startDate`, `currentDay`, `visibleTotalDays` and positions deliverable cards at `(tl.day_start - 1) * DAY_WIDTH`. New: `startDate = origin`, deliverable `left = (tl.day_start - 1 + tasklistOffset) * DAY_WIDTH`, phase span bar `left = (startDay-1)*DAY_WIDTH`, `width = (endDay-startDay+1)*DAY_WIDTH - 6`.

### Why Jump-to-phase is safe

`PATCH /api/projects/[projectId]/programme/generic-phase` only backdates `programme_started_at` when `target.day_start != null`, and otherwise just re-statuses milestones — so date-only milestones are unaffected. For mixed projects the origin comes from `buildTimeline`, so a backdate still shifts only the legacy `day_*` windows.

## Implementation Steps

1. Create `generic-timeline.ts` with local-date parsing, `resolvePhaseWindow`, `buildTimeline`, `currentPhaseByDate`. Unit-check with a throwaway script (no test runner): Sep 23→Oct 14 + today Oct 5 ⇒ `totalDays 22, currentDay 13`; today Sep 1 ⇒ `upcoming`; today Oct 20 ⇒ `overdue`; legacy day-only milestones ⇒ identical numbers to the old `max(day_end)` math.
2. Extract not-started and no-milestones screens into `_generic-phase-empty-states.tsx` (verbatim, no behaviour change).
3. Build `_generic-progress-card.tsx` (states, axis dates, undated hint), reusing `StatChip`/`addDays`/`formatDate` from existing modules; Tailwind classes only, same hex-palette as sibling cards (v2 uses explicit hex/`isDark`-free light styling in these files).
4. Rewire `_generic-phase-view.tsx` to `buildTimeline`; active-phase pill falls back to `currentPhaseByDate`; compute stat chips from the same data.
5. Extract `_generic-swimlane-lane.tsx`; add phase span bar, dates · duration in lane label, offset-adjusted deliverable cards; keep `scrollToToday` using the new `currentDay` (skip when `upcoming`, scroll to window start instead).
6. Verify empty/edge cases: no dated milestones (falls back to old behaviour), single-date milestone, start > due is already rejected by API (412) but guard anyway (swap/ignore), milestone ending before origin.
7. Run `npx tsc --noEmit` and `pnpm lint`; check line counts of every touched file.
8. Browser acceptance on UFP International (Timeline + Milestones tabs).

## Acceptance Criteria

- [ ] UFP International (Milestone "Onboarding & Ingestion", Sep 23 → Oct 14, today Oct 5) shows **"22-DAY PROGRAMME PROGRESS · DAY 13 OF 22"**, axis labels **Sep 23, 2026 / Oct 14, 2026**, Days left **9**, Phases done 0/1, bar ≈59%.
- [ ] Editing the milestone's Start/Due on the Milestones tab and reloading Timeline recalculates the day count and the Gantt columns.
- [ ] Gantt shows one date column per day across the window, a phase span bar over Sep 23 → Oct 14, and the "today" marker on Oct 5.
- [ ] Header pill shows "Onboarding & Ingestion" (date-derived) instead of "No active phase".
- [ ] Upcoming / overdue / complete / no-dates states each render correctly; no "Day 0" or negative values.
- [ ] A seeded legacy project (day_start/day_end only) renders unchanged.
- [ ] StackShift I Timeline and Overview progress card unchanged.
- [ ] No touched/created file exceeds ~250 lines; helper logic is not inline in components.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new warnings.

## Verification

```bash
npx tsc --noEmit
pnpm lint
wc -l src/lib/programme/generic-timeline.ts "src/app/(hub)/projects/v2/[projectId]/_generic-"*.tsx
# Manual (browser, pnpm dev): /projects/v2/<UFP project_id>/timeline and /milestones —
# change Start/Due, reload, confirm day count + Gantt; check a legacy seeded project and a StackShift I project.
```

## Compatibility Touchpoints

- No packaging, adapter, env or migration impact. CLAUDE.md "Project Files / Projects classification navigation" notes unaffected; optionally add one line under the Projects section noting that the generic Timeline is date-driven from `milestones.start_date/due_date` with `day_*` as legacy fallback.

## Open Questions (defaults chosen — flag to change)

1. **Origin when a milestone starts before `programme_started_at`** (as in the screenshot: Sep 23 vs Oct 5) — default: origin = earliest milestone start, `programme_started_at` is ignored for dated milestones.
2. **Single-date milestone** — default: one-day window on that date.
3. **Should Timeline also write derived `day_start`/`day_end`** back to milestones? Default: no (compute-only).

## Implementation Notes

### What Changed
- Timeline window now derives from milestone Start/Due (`buildTimeline`), with `day_start`/`day_end` as fallback; progress card shows real day count, axis dates, and upcoming/running/overdue/complete states plus a "no dates" hint.
- Active-phase pill falls back to the phase containing today.
- Each phase lane has a Start→Due span bar (visible even when collapsed), date range · duration in the label; deliverable cards are offset onto the new origin.
- Empty states and progress card extracted from `_generic-phase-view.tsx`; lane extracted from `_generic-swimlane.tsx`.

### Files Changed
- `src/lib/programme/generic-timeline.ts` (new, 113 lines) - pure date math
- `_generic-progress-card.tsx` (new, 85), `_generic-phase-empty-states.tsx` (new, 100), `_generic-swimlane-lane.tsx` (new, 118)
- `_generic-phase-view.tsx` (290 → 191), `_generic-swimlane.tsx` (269 → 210)

### Deviations From Plan
- None functionally. Impeccable hook flagged 9px / 11.5px font sizes; kept because they mirror the existing StackShift progress card and deliverable-card sizes (consistency). The one new 11.5px (undated hint) was changed to 11px.
- Jump-to-phase route not modified (already skips backdate for date-only milestones).

### Verification Run
- `npx tsc --noEmit` - PASS
- eslint on changed files - PASS
- Throwaway tsx check of `buildTimeline`: UFP case → 22 days, Day 13; upcoming/overdue states correct; legacy day-only → 60 days, Day 1 (unchanged) - PASS
- Browser acceptance on UFP Timeline/Milestones - NOT RUN

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. All touched files ≤210 lines; date math isolated in `generic-timeline.ts`; no dead code, `any`, or debug logging.
- Fixes applied during review: merged duplicate import in `_generic-progress-card.tsx`; refreshed stale header comment in `_generic-swimlane.tsx`. `tsc` re-run PASS.
- Design-hook font-size findings (9px mono pill/axis/span-bar labels, 11.5px deliverable title) are intentional false positives — they match the existing StackShift progress card and deliverable cards.

### Deviations
- Minor: none against scope; out-of-scope boundaries respected (StackShift I files, schema, generic-phase route untouched).

### Required Fixes
- None.
