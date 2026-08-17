# 253: Portfolio Tracker (StackShift I / customer_phases Engine) — Fix Reference/Real Day-Scale Mismatch, Suppress Skipped-Phase Day Ranges, Backfill Legacy Overrides

**Created:** 2026-08-17
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** deep
**Status:** Completed

---

## Overview

On the Portfolio Tracker detail page for `customer_phases`-engine projects (StackShift I always; StackShift II when `use_default_phase_engine: true` — see `src/app/api/onboarding/projects/route.ts:265-275`), the displayed day ranges are internally inconsistent whenever a project's `projects.programme_duration_days` differs from the static default of 120, and/or when phases are skipped.

Reported symptom (project `c3613f2a-2073-433f-a5ee-d6...`, "ABC Test Company Website 3", `programme_duration_days = 110`, Onboard + AI Visibility skipped):
- Header reads **"69-Day Programme Progress"**.
- The last phase (Optimize) is labeled **"D46–75"** on the Swimlane and **"Optimize (Day 46–75)"** in the Jump-to-phase menu — 75 is greater than the 69-day total the header claims, which reads as broken/overflowing to a user.
- Skipped phases (Onboard, AI Visibility) still show a `(Day N–N)` range in the Jump-to-phase dropdown even though they're marked SKIPPED and occupy no calendar days.
- `customer_phases.day_start_override`/`day_end_override` are `NULL` for every row on this project (see attached screenshot), which is what the user first suspected as the cause.

### Root cause (traced, not guessed)

`day_start_override`/`day_end_override` being `NULL` is **not** itself the bug — it's documented, intended behavior. `resolveEffectivePhase` (`src/config/customer-phases.ts:259-275`) falls back to the static `PROGRAMME_PHASES` reference-scale entry (`row.day_start_override ?? staticPhase?.dayStart`) whenever a phase was never customized at intake. Recomputing the Jump-to-phase/Swimlane day labels by hand against the static `PROGRAMME_PHASES` values (Onboard 1–15, Migrate 16–30, Publish 31–60, AI Visibility 61–90, Optimize 91–120) run through `compressReferenceDay` (`src/config/customer-phases.ts:179-193`) with skip set `{Onboard, AI Visibility}` reproduces the exact numbers shown on screen (Migrate 1–15, Publish 16–45, Optimize 46–75, compressed total = 75). **The compression math is correct.**

The actual bug is a **scale mismatch**: `scaleDay(referenceDay, programmeDurationDays)` (`src/config/customer-phases.ts:298-301`) — which converts a static 1–120 "reference day" into this project's real calendar day — is applied to derive the header's `visibleDurationDays` (`_onboarding-detail.tsx:1889`, `scaleDay(visibleTotalDays, programmeDurationDays)` → 75 scaled to a 110-day project → 69) but is **not** applied anywhere else on the page:

- `compressedPhases` (`_onboarding-detail.tsx:1867-1880`) keeps every phase's `dayStart`/`dayEnd` on the raw **compressed reference scale** (max 75 in this example), never passed through `scaleDay`.
- The Gantt grid's day columns are generated as `Array.from({ length: visibleTotalDays }, ...)` (`_onboarding-detail.tsx:1932`) and each column's calendar date is `addDays(startDate, day - 1)` (`_onboarding-detail.tsx:2159`) — i.e. **1 calendar day per reference-day column**, always, regardless of `programmeDurationDays`. For a 120-day project this is correct (scaleDay is identity when `durationDays === 120`). For a 110-day project it's wrong: 75 reference days should span ~69 real calendar days, not 75.
- `JumpToPhaseMenu` (`_onboarding-detail.tsx:745-810`) is passed `phases={compressedPhases}` and prints `Day {p.dayStart}–{p.dayEnd}` verbatim — same unscaled reference numbers.
- `DeliverableChip`'s date badge (`_onboarding-detail.tsx:615`, via `formatDeliverableDateRange`) also consumes unscaled `d.dayStart`/`d.dayEnd`.

Net effect: the header total is the only value on the page that's actually scaled to the project's real duration; every other day-range display is on the raw reference scale. They agree only when `programme_duration_days === 120` (the default), which is why this has gone unnoticed until a non-default-duration project was inspected.

A second, smaller, confirmed gap: `resolveEffectiveDeliverable` (`src/config/customer-phases.ts:242-254`) never reads `row.day_start_override`/`day_end_override` at all — it always returns the static deliverable's day range. The only place a deliverable-level day override actually takes effect is an ad-hoc overlay map built inline in `_onboarding-detail.tsx:1897-1901` (`deliverableOverrideMap`) and applied only inside the Swimlane's `DeliverableChip` renderer (`_onboarding-detail.tsx:664-665`). Anything else that calls `resolveEffectiveDeliverable` directly silently ignores a PM's manual deliverable-schedule drag (`handleScheduleChange`, `_onboarding-detail.tsx:1554-1567`, which writes to `day_start_override`/`day_end_override` via `PATCH /api/projects/[projectId]/programme/deliverables/[deliverableKey]/schedule`).

## Requirements

- [ ] **Scale consistency.** Every day-range value rendered on the `customer_phases`-engine Portfolio Tracker detail page (Gantt grid column count + calendar dates, phase bar `D{start}–{end}` labels, Jump-to-phase dropdown `Day {start}–{end}` labels, deliverable date badges, "today" marker) must be derived on the **same** scale as the `{visibleDurationDays}-Day Programme Progress` header total for that project's actual `programme_duration_days` — not just the header. Decide and apply one consistent approach (recommended: keep `compressedPhases`/grid columns on the compressed reference scale for internal layout math as today, but run every *displayed* day number and every *rendered calendar date* through `scaleDay`/`addDays` using the project's real duration before it reaches JSX — i.e. the grid should have `visibleDurationDays` (scaled) columns, not `visibleTotalDays` (reference) columns, and each phase/deliverable's displayed start/end must be `scaleDay(compressedDay, programmeDurationDays)`). Verify against a project with a non-default `programme_duration_days` (e.g. this task's 110-day repro) that the last phase's end-day label never exceeds the header's total, and that grid column dates land on real, correctly-spaced calendar days.
- [ ] **Skipped phases show no day range.** `JumpToPhaseMenu` must omit the `(Day N–N)` suffix for a skipped phase, mirroring the Swimlane phase-row header's existing `dbStatus !== "skipped" && <>D{phase.dayStart}–{phase.dayEnd}</>` conditional (`_onboarding-detail.tsx:701`) — the dropdown at `_onboarding-detail.tsx:801` currently prints it unconditionally.
- [ ] **Deliverable-level overrides resolved consistently.** `resolveEffectiveDeliverable` (`src/config/customer-phases.ts:242-254`) should honor `row.day_start_override`/`row.day_end_override` the same way `resolveEffectivePhase` honors its own override columns, so every caller (not just the one inline overlay in `_onboarding-detail.tsx`) sees a PM's manually-rescheduled deliverable day range. Fold the now-redundant `deliverableOverrideMap` overlay into this if it becomes dead code — confirm no other caller relies on its current partial-application behavior first.
- [ ] **Backfill migration for existing projects.** Add a new migration (`supabase/migrations/108_...sql` — confirm 107 is still the latest before numbering) that backfills `customer_phases.day_start_override`/`day_end_override` and `customer_deliverables.day_start_override`/`day_end_override` for existing rows where **both** columns are currently `NULL`, using the static `PROGRAMME_PHASES` reference-scale (1–120) values as the seed — i.e. the same values `resolveEffectivePhase`/`resolveEffectiveDeliverable` already fall back to, made explicit. Scope to `phase_number`/`deliverable_key` values that exist in the static `PROGRAMME_PHASES` config (phases 1–5 and their known deliverable keys) — custom phases (6+, `is_custom = true`) have no static entry and must be left untouched (nothing to backfill). Do not scale these values per project — override columns are reference-scale everywhere else in the codebase (`seed.ts`'s `phaseDayOverride`/`deliverableDayOverride`, `resolveEffectivePhase`), scaling happens at render time via `scaleDay(..., programme_duration_days)`.

## Out of Scope / Must-Not-Change

- The generic (`milestones`/`tasklists`) engine used by non-`customer_phases` project types (Access, Access Plus, Discrete Development, StackShift II without the opt-in) — its own day-range migration (107) and Gantt parity were already handled in task 252. Do not touch `_generic-swimlane.tsx`, `_generic-phase-view.tsx`, `_generic-jump-to-phase-menu.tsx`, or the `milestones`/`tasklists` schema.
- `compressReferenceDay`'s skip-compression algorithm itself — it is correct (verified by hand above); do not change its logic, only ensure its *output* is consistently scaled before display.
- The New Project form / intake wizard (`_content.tsx`, `_phases-step.tsx`, `_phase-builder.tsx`) — this task is about the Portfolio Tracker *detail* page's display and legacy-data backfill, not intake.
- `projects.uses_customer_phases_engine` detection logic (`src/app/api/onboarding/projects/route.ts`) — unrelated to this bug.
- Do not write override values for custom (non-static) phases/deliverables in the backfill migration — there is no reference value to backfill from.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` | Modify | Apply `scaleDay` consistently to grid columns/dates, phase labels, deliverable date badges; suppress skipped-phase day range in `JumpToPhaseMenu`. Follow `nextjs-file-length-best-practices.md` — this file is already ~2200 lines; if the day-scale/grid-rendering logic grows, extract it into a colocated helper (e.g. `_onboarding-detail-day-scale.ts` or similar) rather than adding further bulk to the existing file. |
| `src/config/customer-phases.ts` | Modify | `resolveEffectiveDeliverable` reads `day_start_override`/`day_end_override`. |
| `supabase/migrations/108_customer_phases_deliverables_default_day_backfill.sql` (confirm next available number) | Create | Backfill `NULL` override columns on `customer_phases`/`customer_deliverables` with static reference-scale defaults for existing rows. |
| `src/types/database.ts` | None expected | No schema shape change (existing nullable columns), only data — confirm no type changes needed. |

## Code Context

### `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx`

```tsx
// lines 1867-1889 — compression is correct, scaling is the gap
const compressedPhases = orderedPhases.map((p) =>
  startedSkipNumbers.includes(p.number)
    ? p
    : {
        ...p,
        dayStart: compressReferenceDay(p.dayStart, orderedPhases, startedSkipNumbers),
        dayEnd: compressReferenceDay(p.dayEnd, orderedPhases, startedSkipNumbers),
        deliverables: p.deliverables.map((d) => ({
          ...d,
          dayStart: compressReferenceDay(d.dayStart, orderedPhases, startedSkipNumbers),
          dayEnd: compressReferenceDay(d.dayEnd, orderedPhases, startedSkipNumbers),
        })),
      }
);
const visibleTotalDays = compressReferenceDay(TOTAL_DAYS, orderedPhases, startedSkipNumbers);
const visibleDurationDays = scaleDay(visibleTotalDays, programmeDurationDays); // <- only this is scaled

// lines 1932, 2155-2160 — grid columns never scaled
const days = Array.from({ length: visibleTotalDays }, (_, i) => i + 1);
// ...
{days.map((day) => (
  <DateColumnHeader key={day} date={addDays(startDate, day - 1)} isToday={day === gridMarkerDay} />
))}

// line 701 — Swimlane already hides day range for skipped; JumpToPhaseMenu (line ~801) does not
{dbStatus !== "skipped" && <>D{phase.dayStart}–{phase.dayEnd} · </>}
```

```tsx
// lines 745-810 — JumpToPhaseMenu: no skip check on the day-range text
{p.dayStart /* unscaled reference day */}
<span>{p.name} (Day {p.dayStart}–{p.dayEnd})</span>
{skipped && ( /* pill rendered, but the day range above is not conditioned on `skipped` */
```

### `src/config/customer-phases.ts`

```tsx
// lines 298-308 — the scale conversion helpers that need to be applied consistently
export function scaleDay(referenceDay: number, durationDays: number = DEFAULT_PROGRAMME_DAYS): number {
  if (durationDays === DEFAULT_PROGRAMME_DAYS) return referenceDay;
  return Math.max(1, Math.round((referenceDay * durationDays) / DEFAULT_PROGRAMME_DAYS));
}
export function unscaleDay(realDay: number, durationDays: number = DEFAULT_PROGRAMME_DAYS): number { /* inverse */ }

// lines 242-254 — resolveEffectiveDeliverable currently ignores override columns entirely
export function resolveEffectiveDeliverable(phaseNumber: number, row: DeliverableOverrideRow): DeliverableConfig {
  const staticDeliverable = PROGRAMME_PHASES.find((p) => p.number === phaseNumber)?.deliverables.find(
    (d) => d.key === row.deliverable_key
  );
  return {
    key: row.deliverable_key,
    name: row.custom_name ?? staticDeliverable?.name ?? row.deliverable_key,
    description: row.custom_description ?? staticDeliverable?.description ?? "",
    dayStart: staticDeliverable?.dayStart ?? 1, // <- never checks row.day_start_override
    dayEnd: staticDeliverable?.dayEnd ?? 1,     // <- never checks row.day_end_override
    owner: row.custom_owner ?? staticDeliverable?.owner ?? "",
  };
}
// Note: DeliverableOverrideRow (line 235-240) doesn't even carry day_start_override/day_end_override
// today — it will need those two fields added to its type before this function can read them.
```

### `src/lib/programme/seed.ts` (reference only — confirms override columns are reference-scale, not real-scale)

```tsx
// lines 91-98 — override write gate; migration should produce output consistent with this semantics
function phaseDayOverride(p: SeedPhaseEntry): { dayStartOverride: number | null; dayEndOverride: number | null } {
  const staticPhase = getPhaseByNumber(p.number);
  const differs = p.isCustom || !staticPhase || staticPhase.dayStart !== p.dayStart || staticPhase.dayEnd !== p.dayEnd;
  return { dayStartOverride: differs ? p.dayStart : null, dayEndOverride: differs ? p.dayEnd : null };
}
```

### Static reference data (for the migration's backfill values)

`src/config/customer-phases.ts:38-116` — `PROGRAMME_PHASES` array: phase 1 Onboard (1–15, 7 deliverables), phase 2 Migrate & Rebrand (16–30, 7 deliverables), phase 3 Publish (31–60, 5 deliverables), phase 4 AI Visibility (61–90, 4 deliverables), phase 5 Optimize (91–120, 4 deliverables) — each with its own deliverable `key`/`dayStart`/`dayEnd`. The migration's backfill values must match this table exactly.

## Implementation Steps

1. Confirm the latest applied migration number under `supabase/migrations/` (currently `107_milestones_tasklists_day_range.sql`) and write `108_customer_phases_deliverables_default_day_backfill.sql`: `UPDATE customer_phases SET day_start_override = <static>, day_end_override = <static> WHERE day_start_override IS NULL AND day_end_override IS NULL AND phase_number IN (1,2,3,4,5)` (per-phase-number `CASE`/individual statements), and the equivalent for `customer_deliverables` keyed by `phase_number` + `deliverable_key`, sourced from the same `PROGRAMME_PHASES` table above. Apply via `supabase db push` (or the project's normal migration-apply flow) — confirm with the user before applying to production data.
2. In `src/config/customer-phases.ts`: add `day_start_override`/`day_end_override` to `DeliverableOverrideRow`, and update `resolveEffectiveDeliverable` to prefer them over the static fallback (same pattern as `resolveEffectivePhase`).
3. In `_onboarding-detail.tsx`: rework the "already started" render path (`compressedPhases`, `visibleTotalDays`, the `days` array, grid column generation, `DateColumnHeader`, `Swimlane`/`PhaseRow`/`DeliverableChip` props, `JumpToPhaseMenu` props) so every displayed day number and every rendered calendar date is scaled via `scaleDay(..., programmeDurationDays)` against the project's real duration, not the raw compressed reference scale. Keep internal grid-layout math (pixel positions via `DAY_WIDTH`) self-consistent with whichever scale you choose as the column axis — the safest approach is to make `visibleDurationDays` (already scaled) the column count/axis directly, and scale each phase/deliverable's `dayStart`/`dayEnd` into that same space before handing them to `PhaseRow`/`DeliverableChip`/`JumpToPhaseMenu`, rather than scaling in multiple places ad hoc.
4. In `JumpToPhaseMenu`, add a `skipped` check around the `(Day {p.dayStart}–{p.dayEnd})` text, matching the Swimlane header's existing pattern.
5. Re-verify `handleScheduleChange`'s drag-resize math (`clampDragToPhase`, `DeliverableChip`'s `effectiveDayStart`/`effectiveDayEnd`, lines ~323-396) still writes reference-scale (unscaled) values to the schedule API after the display layer starts scaling for render — the stored override must stay reference-scale per step 2/`seed.ts`'s convention, so any scale conversion must be display-only and inverted (`unscaleDay`) before persisting a drag.
6. Manually verify against the reported project (or an equivalent 110-day, 2-skipped-phase repro) that the header total, last phase's end day, and grid's last calendar-date column all agree.

## Acceptance Criteria

- [x] For a project with `programme_duration_days` ≠ 120 and at least one skipped phase, the header's `{N}-Day Programme Progress` total, the last visible phase's end-day label, and the Gantt grid's last calendar-date column all represent the same day count — no phase's displayed end day exceeds the header total. Verified by hand against the reported repro's exact numbers (see Implementation Notes); not re-confirmed in a live browser.
- [x] Skipped phases show no `(Day N–N)` text in the Jump-to-phase dropdown (still show the "Skipped" pill).
- [x] A deliverable manually rescheduled via drag (`handleScheduleChange`) displays its overridden day range consistently everywhere `resolveEffectiveDeliverable` is used, not only inside the Swimlane's inline overlay.
- [ ] New migration successfully backfills `day_start_override`/`day_end_override` on `customer_phases`/`customer_deliverables` for existing `NULL` rows belonging to `customer_phases`-engine projects, using the static `PROGRAMME_PHASES` values; custom (non-static) phases/deliverables are untouched. **Migration file written and reviewed, but not yet applied** — still needs an explicit go-ahead to run against the linked Supabase project (production data backfill, not additive DDL). Left unchecked deliberately.
- [x] `npx tsc --noEmit` passes.
- [x] A default-duration (120-day), no-skip project renders identically before/after this change (regression check — `scaleDay`/`unscaleDay` are identity at 120, so nothing should visibly move — proven by construction, not a live diff).

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual/browser: open a customer_phases-engine project with programme_duration_days != 120
# and at least one skipped phase; confirm header total, last phase label, and grid's last
# calendar column agree; confirm skipped phases show no day range in Jump-to-phase.
```

## Compatibility Touchpoints

- New migration under `supabase/migrations/` — must be applied in numeric order per this repo's existing convention; confirm with the user before running against production data (this is a data backfill, not purely additive DDL).
- No route/API contract changes expected — `PATCH /api/projects/[projectId]/programme/deliverables/[deliverableKey]/schedule` already writes reference-scale values; this task must not change that contract (see Implementation Step 5).

## Implementation Notes

### What Changed

- **`src/config/customer-phases.ts`** — `DeliverableOverrideRow` gained optional `day_start_override`/`day_end_override` fields; `resolveEffectiveDeliverable` now honors them (`row.day_start_override ?? staticDeliverable?.dayStart ?? 1`, same pattern `resolveEffectivePhase` already used) instead of always falling back to the static default. This makes every caller of `resolveEffectiveDeliverable` (not just the one inline overlay in `_onboarding-detail.tsx`) see a PM's manually-rescheduled deliverable day range.
- **`_onboarding-detail.tsx`** — this required two changes to reach the acceptance criteria, both scoped to the "already started" render path:
  1. **Removed the now-redundant `deliverableOverrideMap` overlay.** Since `resolveEffectiveDeliverable` resolves overrides itself now, `orderedPhases` (built from `resolveEffectivePhase`) already carries correct per-deliverable day ranges — `Swimlane`'s `effectiveDeliverables` is now just `phase.deliverables` directly, no separate map/prop needed. Removed the `deliverableOverrideMap` prop from `Swimlane`'s signature and its one call site.
  2. **Added a `displayPhases` layer and repointed the grid axis onto it.** `compressedPhases` (the existing skip-compression output) is left completely untouched — it's still what `buildReminders` and the drag-resize persist path (`handleScheduleChange`) use, since override columns are stored on that same (skip-)compressed-but-unscaled reference scale (matches `seed.ts`'s existing write convention). `displayPhases` is a new `compressedPhases.map(...)` that additionally runs every phase's and every deliverable's `dayStart`/`dayEnd` through `scaleDay(..., programmeDurationDays)` — this is what's actually rendered: the Swimlane loop, `JumpToPhaseMenu`'s `phases` prop, and (transitively, since `DeliverableCard` receives its `d`/`phaseDayStart`/`phaseDayEnd` props from a `displayPhases` entry) the deliverable hover tooltip's `formatDeliverableDateRange`. The Gantt grid's own axis (`days`, the grid container's pixel width, the "today" marker's bounds check) moved from `visibleTotalDays` (raw compressed reference total) to `visibleDurationDays` (the already-scaled total the header text uses) — so 1 grid column is now always 1 real calendar day of this project's actual `programme_duration_days`, and `DateColumnHeader`'s `addDays(startDate, day - 1)` is finally accurate for a non-default duration. `gridMarkerDay` no longer needs its own `unscaleDay` conversion, since the grid it's positioned against is now on the real/scaled scale `currentDay` already lives on.
  3. **`handleScheduleChange`** now calls `unscaleDay(dayStart/dayEnd, programmeDurationDays)` before updating local state and before the PATCH body — inverting the new display-scaling layer so the persisted value stays on the same (skip-)compressed reference scale the schedule route's own range validation (`resolveEffectivePhase(phaseRow)`) already expects. Identity (no-op) at the 120-day default.
  4. **`JumpToPhaseMenu`** — the `(Day {p.dayStart}–{p.dayEnd})` text is now conditioned on `!skipped`, mirroring the Swimlane phase-row header's existing `dbStatus !== "skipped"` check.
- **`supabase/migrations/108_customer_phases_deliverables_default_day_backfill.sql`** (new) — backfills `day_start_override`/`day_end_override` on `customer_phases` (keyed by `phase_number`) and `customer_deliverables` (keyed by `phase_number` + `deliverable_key`, one `UPDATE` per phase to avoid the cross-phase `deliverable_key` collision between phases 4 and 5's `updated-publishing-plan`/`gap-publishing`) for rows where both columns are still `NULL`, using the exact static `PROGRAMME_PHASES` values. Scoped to `phase_number IN (1,2,3,4,5)` — custom phases are untouched. **Not yet applied** — see Deviations below.

### Verified by hand (repro from the task's reported symptom)

Static `PROGRAMME_PHASES` + skip set `{Onboard, AI Visibility}` + `programme_duration_days = 110`: `compressedPhases` gives Migrate `1–15`, Publish `16–45`, Optimize `46–75` (this reproduced the originally-reported bug exactly). After `scaleDay(_, 110)`: Migrate `1–14`, Publish `15–41`, Optimize `42–69` — the last phase's displayed end day (`69`) now exactly equals the header's `visibleDurationDays` (`69`), and the grid's last calendar-date column (`addDays(startDate, 68)`) now agrees with the existing footer text `Day {visibleDurationDays} ({end date})` at line ~2117, which was already correctly computed off `visibleDurationDays` before this task (that line was the one place already scaled correctly, and served as a second confirmation the grid's *old* axis was the actual bug — the grid used to run 6 columns past this exact same footer's own stated end date).

### Files Changed

- `src/config/customer-phases.ts` — `DeliverableOverrideRow` type + `resolveEffectiveDeliverable` now read deliverable-level day overrides.
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` — added `displayPhases`; repointed grid axis, `Swimlane` loop, and `JumpToPhaseMenu` onto it; removed `deliverableOverrideMap`; `handleScheduleChange` unscales before persisting; `JumpToPhaseMenu` suppresses the day range for skipped phases; `gridMarkerDay` simplified (no longer needs `unscaleDay`).
- `supabase/migrations/108_customer_phases_deliverables_default_day_backfill.sql` — new, not yet applied.

### Deviations From Plan

- **Migration not applied.** Per the task doc's own Compatibility Touchpoints note ("confirm with the user before running against production data — this is a data backfill, not purely additive DDL"), the migration file was created but not run against the linked Supabase project. Needs an explicit go-ahead from the user (and their normal `supabase db push`/migration-apply flow) before it takes effect.
- **Scope held to the "already started" render path**, as the task doc's Requirements/Code Context centered on. The "not started"/"Scheduled to auto-start" screen's own `JumpToPhaseMenu` call site (`orderedPlan` from `buildOrderedPhasePlan`, no skip-compression applied there today) was left as-is — it has no header total on that screen to disagree with, and skip-compressing/scaling a pre-seed plan display wasn't part of the reported symptom or an explicit requirement. Flagging in case the user wants day-range parity there too as a follow-up.
- No other deviations — all four requirements (scale consistency, skipped-phase suppression, deliverable-override resolution, legacy backfill migration) implemented as scoped.

### Verification Run

- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`, not touched by this task)
- Manual browser verification against the reported project — SKIPPED (no browser/Supabase session available in this environment; the hand-verified arithmetic above reproduces the exact reported numbers before the fix and confirms the fix's resulting numbers are internally consistent, but a live click-through of the Portfolio Tracker detail page against the actual reported project was not performed)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation — `deliverableOverrideMap` (state, prop, type, and merge logic) was fully removed, not left commented out or orphaned; grep confirms zero remaining references anywhere in the two changed files.
- No new `any`/untyped escape hatches — `DeliverableOverrideRow`'s two new fields are typed `number | null` (optional), matching the existing `PhaseOverrideRow` sibling pattern exactly.
- No new nesting/control-flow complexity — `displayPhases` is a single flat `.map()` mirroring the existing `compressedPhases` construction immediately above it; `handleScheduleChange`'s two new `unscaleDay` calls are straight-line, no branching added.
- Naming is accurate — `displayPhases` (rendered/scaled) vs. `compressedPhases` (storage-compatible/unscaled) reads as the intended distinction; `referenceDayStart`/`referenceDayEnd` in `handleScheduleChange` name the scale they're on, not just "converted" values.
- No repeated logic needing extraction — the scaling `.map()` appears once; the migration's five near-identical per-phase `UPDATE` blocks are boilerplate inherent to a one-time SQL backfill (same repetitive-ALTER shape as the precedent migration 103), not application code repetition.
- Errors handled the same as before — `handleScheduleChange`'s existing try/catch/revert structure is unchanged, just operating on unscaled values now.
- No secrets, credentials, or debug logging introduced.
- `npx tsc --noEmit` and `pnpm lint` both re-run clean at gate time (0 errors; the 2 warnings are in an untouched file).
- File-length convention (`nextjs-file-length-best-practices.md`, cited by the user and the task doc's own Proposed File Changes note): `_onboarding-detail.tsx` was already far past any soft/hard line-count guidance before this task; the net addition here is modest (~20 lines: the `displayPhases` block, a few comments, two `unscaleDay` calls) and a full extraction of the day-scale/grid-rendering logic into its own file — as the task doc flagged as a *possible* follow-up — was correctly judged not required for a change this size; forcing an unrelated large-scale file split into a bugfix diff would itself be a standards violation (unrequested scope).

### Deviations
- **Minor** — `resolveEffectiveDeliverable`'s two new fields were made optional (`?:`) rather than required, so the one other call site (`/api/projects/[projectId]/programme/deliverables/[deliverableKey]/route.ts`) that constructs a `DeliverableOverrideRow` literal without them didn't need touching. This is a smaller, lower-risk footprint than the task doc's Code Context implied ("Note: DeliverableOverrideRow ... doesn't even carry ... today — it will need those two fields added") without changing the resulting behavior (`??` treats `undefined` the same as `null`). Still satisfies Requirement 3 exactly.
- **Minor** — the task doc's Implementation Step 3 suggested the column-count/axis change as one of several possible approaches ("the safest approach is..."); the implementation took that suggested approach directly rather than exploring alternatives, which is the expected outcome, not a deviation in substance.
- **Medium, pre-disclosed by implement stage** — the backfill migration (108) was created but not applied, and live browser verification against the actual reported project was not performed (no environment access). Both are called out explicitly in Implementation Notes' own Deviations section, are consistent with the task doc's own Compatibility Touchpoints instruction ("confirm with the user before running against production data"), and are correctly left as follow-up items rather than something requiring a return to implementation — the `test` stage should be the one to actually exercise this, ideally with real browser/Supabase access to confirm the hand-computed numbers hold in the live UI.
- No Major deviations — all four Requirements implemented within the stated Out-of-Scope boundaries (generic engine untouched, `compressReferenceDay` untouched, intake wizard untouched, no custom-phase rows touched by the migration).

### Required Fixes
- None.

## Completion Notes

**Completed:** 2026-08-17

Code-complete and quality-gated — all four requirements implemented, `npx tsc --noEmit`/`pnpm lint` clean. Marked Completed with two known, explicitly-disclosed gaps carried forward (consistent with this project's established convention of shipping with a documented "recommended before shipping" follow-up list rather than blocking on live verification that no session in this environment can perform):

1. **Migration 108 has not been applied.** The backfill file exists and was reviewed, but needs an explicit go-ahead to run against the linked Supabase project before `customer_phases`/`customer_deliverables` rows for pre-existing projects get their `NULL` overrides filled in. Functionally low-risk to defer (the app already resolves the same values via the existing `?? staticPhase` fallback), but the migration itself is still outstanding.
2. **No live browser verification.** The header/last-phase/grid-agreement fix was confirmed by hand-computed arithmetic reproducing the exact reported bug numbers and the fix's resulting numbers (see Implementation Notes), not by loading the actual reported project in a browser.
