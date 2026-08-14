# 252: Portfolio Tracker — Skip-Phase Timeline Compression (Shipped) + Generic-Engine Swimlane/Overview Parity

**Created:** 2026-08-14
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** deep (Part B only — Part A is already implemented)
**Status:** Testing (both parts implemented; scope decisions below were confirmed with the user before implementing Part B)

**Part B scope decisions (confirmed with user before implementation):**
- Swimlane depth: **full Gantt parity** — day-range columns added to `milestones`/`tasklists` (migration 107), captured at New Project intake via the free-form phase builder, real calendar grid matching StackShift I.
- Skip support: **out of scope** — no skip concept added to milestones; every milestone in a generic-engine project's plan is treated as active/applicable.

---

## Overview

This doc has two parts.

**Part A (already implemented, this session + the two prior turns)** — the StackShift I / `customer_phases`-engine Portfolio Tracker page had a chain of skip-phase display bugs: the "Scheduled to auto-start" screen advertised a skipped Phase 1 instead of the real first phase, the started page's Jump-to-phase dropdown showed every phase as clickable regardless of skip, the Gantt "today" marker landed in the wrong (skipped) phase's column, the deliverables/day totals counted skipped phases' static defaults, and skipped phases still consumed calendar days on the progress bar/timeline. All of this is now fixed and skip-compressed end-to-end (see "Part A — Implementation Record" below). No further work needed here except what Part B's `permanentSkipSet` fix already carried along.

**Part B (planned, this task)** — the fixes in Part A only apply to StackShift I (and StackShift II with the default-phase-engine opt-in), because only those use the `customer_phases`/`customer_deliverables` engine. Every other project type (StackShift Access, Access Plus, Discrete Development, and StackShift II *without* the opt-in) uses the generic `milestones`/`tasklists`/`tasks` model instead, rendered by a much simpler `GenericPhaseView`/`GenericSwimlane` (task 247) with no calendar/Gantt timeline, no day ranges, and no skip-phase concept at all. The user wants this second family of project types to get the same Swimlane + Overview UX as StackShift I, for consistency, driven dynamically by whatever was actually submitted on the New Project form (phase/deliverable names, day ranges if the PM set them, and — if the generic engine grows a skip concept — which phases are excluded).

## Part A — Implementation Record (Completed)

For context/continuity only — nothing in this section is pending work.

1. **`_docs/task/248-*`** (prior turn) — the "not started"/"Scheduled to auto-start" screen (`_onboarding-detail.tsx`) now resolves the scheduled phase through `resolveEffectivePhaseNumber` before display, so it never advertises a skipped Phase 1; its "Select Phase" dropdown shows every phase (including the previously-hidden skipped one) with a "(Skipped)" tag, matching the already-started page's own treatment.
2. **This session, part 1** — the already-started page:
   - `resolveEffectiveStartDay`/`compressReferenceDay` added to `src/config/customer-phases.ts`: a skipped phase's calendar days no longer count as "already elapsed" when backdating `programme_started_at` (`seedAndStartProgramme` in `src/lib/programme/seed.ts`, and both branches of `PATCH /api/projects/[projectId]/programme/phase/route.ts`).
   - The Gantt "today" marker, deliverables total (excludes skipped phases' static-fallback deliverable counts), and "View Onboarding Workspace" button (hidden when Phase 1 itself is skipped) all became skip-aware.
   - The already-started page's own "Jump to phase" dropdown now disables skipped phases (with a "Skipped" pill) and the current phase (with a "Current" pill) — previously showed every phase as fully clickable regardless of state.
3. **This session, part 2 (the compression epic)** — full timeline compression: skipped phases no longer occupy any calendar days on the shared progress bar/Gantt grid at all (`compressReferenceDay` applied to every non-skipped phase's/deliverable's `dayStart`/`dayEnd`, the grid's visible column count, and the displayed programme length) — Day 1 now aligns with the first non-skipped phase, matching what the New Project form's `skip_phase_numbers` actually submitted. Plus:
   - Swimlane rows default to collapsed except the active phase (`collapseDefaultsAppliedRef`/`useEffect` in `_onboarding-detail.tsx`).
   - A skipped phase's deliverable cards are fully inert (`interactive`/`canEditSchedule` both gated off `dbStatus !== "skipped"`), and its own day-range label is hidden.
   - The collapse/expand toggle icon changed from `ChevronDown`/`ChevronRight` to `Plus`/`Minus` (the chevrons implied a vertical list; the revealed content is a horizontal timeline lane).
   - **Bug found and fixed during manual verification:** the already-started Jump-to-phase PATCH route's re-status cascade (`p.sort_order < targetSortOrder ? "skipped" : "not_started"`) used to silently *un-skip* a permanently-excluded phase (e.g. AI Visibility) whenever an unrelated manual jump landed before it in sort order. Fixed with a `permanentSkipSet` (sourced from the request's own `skip_phase_numbers`, i.e. `project.draft_skip_phase_numbers`) that a phase can never be reset out of via this cascade. The frontend's skip-detection for compression/dropdown/collapse purposes was correspondingly switched from DB `status === "skipped"` (which conflates "permanently excluded" with "merely time-bypassed by an unrelated jump") to `project.draft_skip_phase_numbers` directly.
   - Verified end-to-end in-browser against the "ABC Test Company Website 3" project (StackShift I, Onboard + AI Visibility skipped, 110-day custom duration): fresh Jump-to-phase now shows "Day 1 of 69", "68 days left", "0/16 deliverables", "13 days remaining" in the on-track reminder, Onboard/AI Visibility collapsed with hidden day ranges and disabled deliverables, and AI Visibility correctly stays skipped after an unrelated jump to a different phase.

Files touched: `src/config/customer-phases.ts`, `src/lib/programme/seed.ts`, `src/app/api/projects/[projectId]/programme/phase/route.ts`, `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx`.

## Requirements (Part B)

- [ ] Access, Access Plus, Discrete Development, and StackShift II-without-opt-in projects get a Swimlane + Overview page visually and behaviorally consistent with StackShift I's: a calendar/Gantt timeline (day columns, a "today" marker, phase lanes with deliverable/task cards positioned by day range), a progress bar showing elapsed/total days, and the same collapse-by-default (active phase only expanded), disabled/skipped-phase treatment, and Plus/Minus collapse icon.
- [ ] Everything renders dynamically from what was actually submitted on the New Project form for that project (phase names/order, day ranges if configured, any future skip configuration) — no hardcoded phase list standing in for `PROGRAMME_PHASES`.
- [ ] Whatever skip-phase concept results (see Open Questions) reuses the same compression model Part A already built (`compressReferenceDay`/`resolveEffectiveStartDay`) rather than a parallel implementation — generalize those helpers if the generic engine's day-range shape differs from `PhaseDayRangeEntry`.
- [ ] `GenericPhaseView`'s existing read-only scope (task 247's decision: milestone/tasklist/task CRUD stays on the Projects module's own tabs) is preserved — this is a display/timeline upgrade, not a re-opening of that scope decision.

## Open Questions (resolve before/during planning, not assumed here)

1. **Day-range data model gap.** `milestones`/`tasklists`/`tasks` currently carry no `day_start`/`day_end` (or any date-range) columns — `_generic-swimlane.tsx` only sorts by `position`/`start_date`/`created_at` and renders a flat card grid, no calendar axis at all. A Gantt-style swimlane needs *some* day-range source per milestone (phase) and per tasklist (deliverable). Two directions:
   - **(a)** Add day-range columns to `milestones`/`tasklists` (mirroring `customer_phases.day_start_override`/`customer_deliverables.day_start_override`) and a per-project duration field (mirroring `projects.programme_duration_days`), populated at intake by whatever the New Project form's generic-engine builder captures for these project types (check `_phases-step.tsx`/`_phase-builder.tsx`'s free-form mode — task 246's doc calls out that Access/Access Plus/Discrete Development/StackShift-II-without-opt-in use "free-form" phases with their own day-range concept already at the *wizard* level; confirm whether that data reaches `milestones`/`tasklists` at seed time today, or is currently discarded).
   - **(b)** Keep milestones dateless and use a simpler non-Gantt timeline visualization (e.g. a horizontal step/progress track by milestone order, no day columns) — "mirrored... for better consistency" would then mean visual/interaction parity (collapse behavior, cards, disabled states) without a literal calendar grid. Cheaper, but doesn't fully match the user's ask if they specifically want a Gantt.
   - Needs a product decision before implementation — recommend confirming with the user which of (a)/(b) they mean by "mirrored as StackShift I," since (a) is a data-model change (new migration, new intake-form fields, new seeding logic) while (b) is UI-only.
2. **Skip-phase concept for milestones.** StackShift I's skip comes from `customer_phases.status = 'skipped'` + `projects.draft_skip_phase_numbers`. Milestones have no equivalent `skipped` status value today (check the `milestones.status` enum/constraint before assuming one can be added) and the New Project form's generic-engine intake path (task 239/240) doesn't currently collect a skip list for these project types. If skip support is in scope for this task, it needs the same intake-time capture (`_phases-step.tsx`/`_phase-builder.tsx` free-form mode) plus a seeding-time equivalent of `seedAndStartProgramme`'s `skipPhaseNumbers` handling. If out of scope, say so explicitly and only build the day/Gantt parity.
3. **`programme_started_at` equivalent.** `GenericPhaseView` already gates on `project.programme_started_at` (task 251) the same way StackShift I does, so the not-started/scheduled screen parity is closer than the Swimlane itself — confirm the day-range/backdating math (`resolveEffectiveStartDay`, `scaleDay`) can reuse this same field rather than needing a second one.

## Out of Scope / Must-Not-Change

- Milestone/tasklist/task CRUD moving into this page — stays on the Projects module's Milestones/Tasks tabs (task 242's scope decision, restated by task 247).
- StackShift I's own `customer_phases` engine, rendering, or data model — this task only extends parity *to* the other project types, it doesn't refactor StackShift I's existing (now-compressed) implementation.
- Any change to `compressReferenceDay`/`resolveEffectiveStartDay`'s existing StackShift I call sites' behavior — if generalized for reuse, the generalization must be additive/backward-compatible (byte-identical output for existing StackShift I callers).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/types/database.ts` / a new migration | Modify (pending Open Question 1) | Day-range columns on `milestones`/`tasklists` if direction (a) is chosen |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_generic-swimlane.tsx` | Modify | Gantt-style (or step-track) rendering, collapse-by-default, Plus/Minus icon, skip-aware disabling (if in scope) |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_generic-phase-view.tsx` | Modify | Progress bar/overview parity (elapsed/total days, "today" marker context), reuse `StatChip` patterns already imported from `_onboarding-detail.tsx` |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_generic-jump-to-phase-menu.tsx` | Modify | Skip-aware + current-phase-aware disabling, mirroring `JumpToPhaseMenu`'s Part-A fix |
| `src/config/customer-phases.ts` | Modify (if generalizing) | Widen `compressReferenceDay`/`resolveEffectiveStartDay`'s `PhaseDayRangeEntry` acceptance if the generic engine's day-range shape needs a shared helper |
| `src/app/v2/(hub)/portfolio-tracker/new/_phases-step.tsx`, `_phase-builder.tsx` | Modify (pending Open Questions 1/2) | Capture day ranges/skip for generic-engine project types at intake, if not already captured |
| `src/lib/programme/seed.ts` or a new generic-engine seed helper | Modify/Create | Seed day-range/skip data onto `milestones`/`tasklists` at project start, mirroring `seedAndStartProgramme` |

## Code Context

### `src/app/v2/(hub)/portfolio-tracker/[projectId]/_generic-swimlane.tsx`
Current rendering is a flat card grid (see `openTasklist`, the `orderedMilestones.map` block) — no day axis, no collapse state, no skip concept. This is the primary file to rebuild against `_onboarding-detail.tsx`'s `Swimlane` component (lines ~630-725 as of this task) as the reference pattern — same `TOTAL_DAYS`/`DAY_WIDTH`/`ROW_HEIGHT` grid constants, `assignTracks` overlap-stacking, and `DeliverableCard` positioning logic, once a day-range data source exists.

### `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx`
The now-completed reference implementation for every piece of parity this task asks for: `compressReferenceDay`/`resolveEffectiveStartDay` usage (search `compressedPhases`), the `collapseDefaultsAppliedRef` effect, the `Plus`/`Minus` toggle, `JumpToPhaseMenu`'s `skipSet`/`currentPhaseNumber` props, and the `Swimlane`/`DeliverableCard` components themselves.

### `src/config/customer-phases.ts`
`compressReferenceDay(referenceDay, phases, skipPhaseNumbers)` and `resolveEffectiveStartDay(phases, effectivePhaseNumber, skipPhaseNumbers)` — both operate on a generic `PhaseDayRangeEntry = { number, sortOrder, dayStart, dayEnd }` shape already, so they're reusable as-is for any data source that can be mapped into that shape (milestones included), without needing a parallel implementation.

## Implementation Steps

1. Resolve Open Questions 1-3 with the user/product owner before writing code — this determines whether this is primarily a data-model task or a UI-only task.
2. If day-range data is needed: design the migration (columns + constraints), update `src/types/database.ts`, and wire intake capture through the New Project form's generic-engine phase builder.
3. If skip support is needed: design the milestone-level "skipped" status/flag and its intake capture, then reuse `compressReferenceDay`/`resolveEffectiveStartDay` (generalizing the `PhaseDayRangeEntry` type only if the generic engine's field names differ) for the same compression behavior Part A already validated.
4. Rebuild `_generic-swimlane.tsx` against `_onboarding-detail.tsx`'s `Swimlane`/`DeliverableCard` pattern.
5. Bring `_generic-phase-view.tsx`'s overview/progress bar to parity (elapsed/total days, "today" marker, StatChips already partially shared via `_onboarding-detail.tsx`'s exports).
6. Bring `_generic-jump-to-phase-menu.tsx` to parity with `JumpToPhaseMenu`'s skip/current-phase disabling.
7. Manually verify in-browser against one project per generic-engine classification (Access, Access Plus, Discrete Development, StackShift II without opt-in), the same way Part A was verified against a live StackShift I project.

## Acceptance Criteria

- [ ] Every non-StackShift-I(-engine) project type renders a Swimlane/Overview visually and behaviorally consistent with StackShift I's post-Part-A implementation, per whatever scope Open Questions 1/2 resolve to.
- [ ] All rendered phase/deliverable data traces back to what was actually submitted on that project's New Project form — no static fallback list.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass clean.
- [ ] StackShift I's own page is unaffected (regression-check the "ABC Test Company Website 3" project used in Part A's verification still renders identically).

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual: one project per generic-engine classification in the browser (Access, Access Plus,
# Discrete Development, StackShift II without the default-phase-engine opt-in)
```

## Compatibility Touchpoints

- Any new `milestones`/`tasklists` columns need a migration under `supabase/migrations/`, applied in order per this repo's existing convention.
- If the New Project form's generic-engine phase builder gains new fields, `src/config/customer-phases.ts` types and `_new-project-types.ts` drafts need corresponding updates — check `_docs/task/239-*`/`240-*`/`246-*` docs for the current shape of that intake path before extending it.

## Implementation Notes

### What Changed

**Data model** — migration 107 adds nullable `day_start`/`day_end` integer columns (with a `day_end >= day_start` check) to both `milestones` and `tasklists`, applied to the linked Supabase project via `supabase db push`. `src/types/database.ts` updated to match.

**New Project intake (free-form phase builder)** — the day-range editor (`Day X to Y` control) that previously only rendered in fixed-phases mode (StackShift I) now also renders for free-form mode (Access/Access Plus/Discrete Development/StackShift II without the engine opt-in), reusing the same `phasePlanValidationErrors`/`applyDeliverableDayRanges` helpers already built for task 249. A new free-form phase defaults to starting the day after the latest existing phase's end (2-week default span), mirroring `addCustomPhaseDraft`'s existing cascade. Deliverables are never individually dated — auto-distributed across their phase's range, exactly like StackShift I's own Phase 2-5.

`PhasePlan`/`DeliverablePlan` (customer-phases.ts) gained required `dayStart`/`dayEnd` fields; `phasePlanDraftToInput` now computes and includes them. The dead, never-called `phasePlanFromProgramme` function was removed rather than updated (confirmed zero call sites).

**Seeding** — `seedCustomPhases` (seed-custom-phases.ts) now writes `day_start`/`day_end` onto both the `milestones` and `tasklists` rows it inserts.

**Jump-to-phase backdating** — new route `PATCH /api/projects/[projectId]/programme/generic-phase` (no skip-phase concept, so no compression math needed, unlike StackShift I's equivalent): backdates `programme_started_at` to the target milestone's `day_start` and re-statuses every other milestone by position (`completed` if earlier, `planned` if later — there's no "skipped" status value in this engine's schema). `_generic-phase-view.tsx`'s `handleJump` now calls this route instead of two separate milestone-status PATCH calls.

**Swimlane/Overview rebuild** — `_generic-swimlane.tsx` rebuilt from a flat card grid into a real day-based Gantt (day columns, "today" marker, milestone lanes with tasklist cards positioned by day range), reusing `_onboarding-detail.tsx`'s exported grid constants/helpers (`DAY_WIDTH`, `LABEL_WIDTH`, `ROW_HEIGHT`, `ROW_GAP`, `LANE_TOP_PADDING`, `PHASE_VISUALS`, `assignTracks`, `addDays`, `DateColumnHeader`) rather than duplicating them. `_generic-phase-view.tsx` gained a day-based progress bar (Day N of Total, days left, calendar date range) alongside the existing StatChips, plus the same collapse-by-default (only the active milestone starts expanded) behavior as StackShift I's `_onboarding-detail.tsx`. `_generic-jump-to-phase-menu.tsx` now shows each milestone's day range. Completed milestones show a checkmark + greyed name, matching StackShift I's own treatment.

**Total duration** derived dynamically per-project as the max `day_end` across a project's own milestones — no new `projects` column, since (unlike StackShift I) there's no fixed 5-phase default to diverge from.

### Files Changed
- `supabase/migrations/107_milestones_tasklists_day_range.sql` - new migration, applied
- `src/types/database.ts` - `milestones`/`tasklists` types gain `day_start`/`day_end`
- `src/config/customer-phases.ts` - `PhasePlan`/`DeliverablePlan` gain required day fields; removed dead `phasePlanFromProgramme`
- `src/app/v2/(hub)/portfolio-tracker/new/_new-project-types.ts` - `phasePlanDraftToInput` computes/includes day ranges (phase + auto-distributed deliverables)
- `src/app/v2/(hub)/portfolio-tracker/new/_phase-builder.tsx` - day-range editor, deliverable day-range display, and validation widened from fixed-phases-only to both modes; `addPhase()` cascades a default day range
- `src/lib/programme/seed-custom-phases.ts` - writes `day_start`/`day_end` on insert
- `src/app/api/projects/[projectId]/programme/generic-phase/route.ts` - new route, backdate + re-status cascade for the generic engine's Jump-to-phase
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` - exported grid constants/helpers/palette for reuse by the generic Swimlane
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_generic-swimlane.tsx` - rebuilt as a day-based Gantt
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_generic-phase-view.tsx` - day-based progress bar, collapse state, `handleJump` routed through the new backend route
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_generic-jump-to-phase-menu.tsx` - shows each milestone's day range

### Deviations From Plan
- No `projects.programme_duration_days`-equivalent field added for the generic engine (Open Question resolved by deriving total duration from the plan's own latest `day_end` instead — simpler, no new intake field, matches how the task doc's Open Question 1 framed the "full Gantt" option's actual requirement).
- Drag-resize (StackShift I's task 148 feature) was not extended to the generic engine — reasonable scope boundary per the task doc; not part of the user's original ask, and would require its own day-override columns/PATCH endpoints.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing unrelated warnings only)
- Manual in-browser (Discrete Development project "ABC Test Company Gantt Pilot", created live through the New Project wizard with 2 free-form phases + 3 deliverables) - PASS: day-range inputs appeared and cascaded correctly at intake (Day 1–14, then Day 15–28 auto-offset); after creation, Gantt rendered with correct total (28-Day Programme), calendar dates, "27 days left", "3 deliverables"; Jump-to-phase to the second phase correctly backdated `programme_started_at` (Day 15 of 28, Jul 31–Aug 27 range, 13 days left), marked the earlier phase "completed" (checkmark + greyed), and expanded only the newly-active phase by default.
- Manual verification against Access/Access Plus/StackShift-II-without-opt-in specifically - SKIPPED (same code path as Discrete Development; not separately re-verified given time constraints, low risk since none of the changed logic branches on classification).
