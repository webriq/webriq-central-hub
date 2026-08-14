# 249: New Project Form — Per-Phase Custom Duration Days + Auto-Distributed Deliverable Day Ranges

**Created:** 2026-08-14
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep
**Status:** Planned
**Depends on:** 248 (shares the same "not started" screen surface for verifying end-to-end effects
of a customized phase plan; not a hard code dependency — can be implemented independently)

---

## Overview

Follow-up to 248, scoped separately per the user's own request ("Add a follow up 2nd task"). The New
Project wizard's fixed-phases `PhaseBuilder` (`_phase-builder.tsx`) currently only exposes editable
Day-range inputs for **custom** phases (`phase.isCustom`, task 246) — the 5 default phases
(Onboard/Migrate & Rebrand/Publish/AI Visibility/Optimize) render as read-only name text with no day
inputs at all; their day ranges are always exactly `PROGRAMME_PHASES`' static 1-15/16-30/31-60/
61-90/91-120 (only uniformly rescaled via `programme_duration_days`, task 239 — never
per-phase-adjustable).

This task makes **every** phase's day range PM-editable at intake — defaulting to today's static
values — and, for phases 2-5 (not Onboard/Phase 1, which keeps its existing curated 7-deliverable
day breakdown untouched per the request), auto-recomputes each deliverable's day sub-range from an
even, largest-remainder-first distribution across the phase's edited day span and current deliverable
count. It also makes inserting a phase between two existing phases automatically cascade every
later phase's day range forward, and makes inserting after the last phase auto-default to
`(previous phase's dayEnd + 1)` as its start day — both already partially present in
`addCustomPhaseDraft` (task 246) but only for the "after the last known phase" case; the
insert-in-the-middle cascade does not exist today (confirmed: `addCustomPhaseDraft` only computes
`dayStart` from the single latest known `dayEnd` across the whole draft, never re-derives every
subsequent phase's range after an insert).

### The distribution formula (user-specified, largest-remainder method)

Given a phase's total day span `N` and its deliverable count `k`:
1. `base = floor(N / k)`
2. `remainder = N - base * k`
3. The first `remainder` deliverables (in order) get `base + 1` days; the rest get `base` days.
4. Day ranges are then assigned sequentially from the phase's `dayStart`.

Worked example from the request: 15 days / 6 deliverables → `base = 2`, `remainder = 3` → sizes
`[3, 3, 3, 2, 2, 2]` (sums to 15). Applied sequentially from a phase starting Day 16: deliverable 1 =
Day 16-18, deliverable 2 = Day 19-21, deliverable 3 = Day 22-24, deliverable 4 = Day 25-26,
deliverable 5 = Day 27-28, deliverable 6 = Day 29-30.

## Requirements

### A — Per-phase day-range inputs for every phase (not just customs)

- [ ] `PhaseSection` (`_phase-builder.tsx`) shows the same `Day [__] to [__]` input pair (currently
      gated to `mode === "fixed-phases" && phase.isCustom`, lines 281-309) for **every** phase in
      `fixed-phases` mode, custom or default.
- [ ] Default values for the 5 static phases pre-fill from `PROGRAMME_PHASES` (1-15, 16-30, 31-60,
      61-90, 91-120) scaled by the card's current `durationDays` (reuse `scaleDay`, already imported
      by `customer-phases.ts` and already used for the engine's runtime day-math — do not
      hand-roll a second scaling formula in the wizard).
- [ ] `PhaseDraft.dayStart`/`dayEnd` (currently `number | null`, only ever populated for customs)
      becomes populated for every phase from creation — `defaultPhasePlanDraft()`
      (`_new-project-types.ts:48-62`) sets `dayStart`/`dayEnd` from `PROGRAMME_PHASES` instead of
      `null`/`null`.
- [ ] Editing a default phase's day range does **not** change its `custom_name`/`custom` status —
      `isCustom` stays `false`; only `day_start_override`/`day_end_override` get set on the
      resulting `customer_phases` row when they differ from the static default (mirrors how a
      custom phase's day range already round-trips through those same override columns today —
      this is not a new column, just a new writer for defaults too).

### B — Auto-distributed deliverable day ranges (phases 2-5 and customs; Onboard/Phase 1 excluded)

- [ ] New pure function `distributeDaysAcrossCount(totalDays: number, count: number): number[]` in
      `src/config/customer-phases.ts` (co-located with `scaleDay`/`resolveEffectivePhase` — the
      other pure day-math helpers) implementing the largest-remainder algorithm above. `count <= 0`
      returns `[]`; `totalDays < count` still returns `count` entries (some sized 0 or negative is
      not valid — clamp `base` at minimum 1 and note the phase needs at least as many days as
      deliverables; surface this as a validation message in the wizard, not a silent clamp — see
      Requirement D).
- [ ] New function `applyDeliverableDayRanges(phase: PhaseDraft): PhaseDraft` (or equivalent) that,
      given a phase's `dayStart`/`dayEnd`/`deliverables.length`, calls
      `distributeDaysAcrossCount` and stamps each deliverable in order with computed
      `dayStart`/`dayEnd` — **only for phase numbers 2+** (Onboard/Phase 1 is explicitly excluded
      per the request: "for the Onboard phase, follow the current durations" — its 7 deliverables
      keep their existing curated `PROGRAMME_PHASES` day ranges verbatim, never redistributed, even
      if a PM edits Phase 1's overall day span in this task's new day-range input).
- [ ] `DeliverableDraft` gains computed, **read-only, display-only** `dayStart`/`dayEnd` (shown next
      to each deliverable row in `fixed-phases` mode only — free-form mode deliverables have no day
      concept, unaffected) — recomputed via `applyDeliverableDayRanges` whenever: the phase's own
      `dayStart`/`dayEnd` changes, or a deliverable is added/removed/reordered within that phase.
      Recomputation is a pure derivation at render/onChange time, not separately-stored per-item
      state that could drift — avoids a second source of truth.
- [ ] Reordering deliverables (existing dnd-kit drag, `handleDeliverableDragEnd`) re-triggers the
      same recompute, since order determines which deliverables get the `base + 1` "extra day" slots
      first.

### C — Insert-in-the-middle cascade

- [ ] `addCustomPhaseDraft` (`_new-project-types.ts:76-95`) — when `afterPhaseId` names a phase that
      is **not** the last one in the draft, every phase after the insertion point (default or
      custom) has its `dayStart`/`dayEnd` shifted forward by the new phase's day span
      (`newPhase.dayEnd - newPhase.dayStart + 1`), preserving each shifted phase's own original
      span length. Phase 1/Onboard is never shifted (it's always first, an insertion can never
      land before it in `fixed-phases` mode — confirm this invariant holds via the existing "Insert
      custom phase after this one" button, which is only ever rendered per-phase, never before
      Phase 1, per `_phase-builder.tsx:334-342`).
- [ ] Inserting after the **last** phase in the draft keeps today's existing behavior
      (`dayStart = latestKnownDayEnd + 1`, `_new-project-types.ts:77-78`) — already correct per the
      request's own description ("Inserting a phase after the last one should automatically
      display the start duration day value +1 from the end duration day of the previous phase"),
      confirmed via direct read, not changed by this task. The only gap this task closes is the
      **middle-insertion cascade**, which does not exist today (the current function only ever
      looks at the single max known `dayEnd` across the whole draft, regardless of insertion
      position — that's the "after the last" formula being (incorrectly) applied even for a
      middle insert today).
- [ ] After a middle-insertion cascade, phases 2-5's deliverable day ranges re-derive per
      Requirement B for every phase whose span shifted (their span length is unchanged, only their
      absolute start/end moved — a pure re-offset is sufficient, no re-run of the distribution
      algorithm needed, since relative sizes within an unchanged span don't change; only phases
      whose own `dayStart`/`dayEnd` the PM directly edits need the full
      `distributeDaysAcrossCount` re-run).
- [ ] Deleting a phase (`removePhase`) is **not** required by the request to cascade-shift
      subsequent phases automatically — explicitly out of scope (see Out of Scope) unless flagged
      otherwise during review; the request only describes insert-time cascading.

### D — Validation

- [ ] A day-range edit where `dayEnd < dayStart`, or a phase span shorter than its own deliverable
      count (Requirement B's "at least 1 day per deliverable" floor), shows an inline error state
      next to that phase's day inputs (border color change + short message, matching this file's
      existing `InlineRow`/input error conventions — check `_content.tsx`'s existing field-error
      pattern for the established visual language before inventing a new one).
- [ ] The wizard's Review/Continue step-transition guard (wherever `_content.tsx` currently
      validates before allowing the next step) blocks progression while any phase has an invalid
      day range, consistent with how other required-field validation already blocks step
      transitions in this wizard.

### E — Backend: thread edited defaults + deliverable day ranges through to seeding

- [ ] `CustomPhaseSeed.deliverables` (`src/config/customer-phases.ts:400-407`) currently carries no
      day fields (`{ name: string }[]`) — extend to `{ name: string; dayStart: number; dayEnd:
      number }[]`, populated by `customPhasesFromDraft` (`_new-project-types.ts:137-163`) from each
      deliverable's computed day range (Requirement B).
- [ ] `POST /api/onboarding/projects` — the 5 defaults' PM-edited day ranges need a new wire field
      (e.g. `default_phase_overrides?: { phaseNumber: number; dayStart: number; dayEnd: number;
      deliverables?: { key: string; dayStart: number; dayEnd: number }[] }[]`) alongside the
      existing `skip_phase_numbers`/`custom_phases` — same `usesCustomerPhasesEngine`-only
      validation pattern as its siblings. This is new wire surface, not a repurposing of
      `custom_phases` (which is specifically for phases 6+, `isCustom: true` — conflating the two
      would break `resolveEffectivePhase`'s existing `isCustom` branching).
- [ ] `seed.ts`'s `buildSeedPhaseEntries` (or its Requirement E-of-task-248 extracted/shared form)
      accepts this new override list alongside `customPhases`, applying `day_start_override`/
      `day_end_override` (already-existing DB columns, migration 071/103) to default phase rows too
      — today only customs ever write those columns (`seed.ts:190-191`,
      `p.isCustom ? p.dayStart : null`); this task removes the `isCustom` gate on writing overrides
      specifically for day ranges (name overrides stay `isCustom`-gated — a default phase's name is
      never PM-editable in this wizard, unchanged).
- [ ] Deliverable-level day overrides write to `customer_deliverables.day_start_override`/
      `day_end_override` (migration 071 — already exist, already read by
      `_onboarding-detail.tsx`'s `deliverableOverrideMap`/Swimlane rendering for **drag-resize**
      overrides today; this task is a second writer of the same columns, at seed time instead of
      via drag) for every deliverable in phases 2-5 whose computed range differs from
      `PROGRAMME_PHASES`' static default. Onboard/Phase 1 deliverables never get an override row
      from this path (Requirement B's exclusion) — `day_start_override`/`day_end_override` stay
      `null` for them, exactly as today.
- [ ] **Draft/Scheduled path (mode `save`/`save_scheduled`):** these new day-range overrides must
      be persisted the same way task 248 persists `skip_phase_numbers`/`custom_phases` for deferred
      starts — extend task 248's `draft_custom_phases`/new `draft_default_phase_overrides` JSONB
      column (or fold into a single `draft_phase_plan jsonb` shape covering skips + customs +
      default overrides together, cleaner than three parallel columns — implementer's call, but
      pick one and apply it consistently) so a Draft/Scheduled project's day-range customization
      survives to actual seed time exactly like task 248 fixes for skip/custom. **This task has a
      hard dependency on task 248's persistence-columns work landing first** (or being done as part
      of this task if 248 hasn't shipped yet) — do not re-introduce the same "silently discarded on
      Draft" bug this task is nominally a sibling to fixing.

## Out of Scope / Must-Not-Change

- Free-form mode (`Access`/`Access Plus`/`Discrete Development`/StackShift II without
  `useDefaultPhases`) — no day-range concept at all in that mode today (the generic
  `milestones`/`tasklists` model has no day-based clock, task 239's design); this task is
  `fixed-phases` mode only.
- Onboard/Phase 1's 7 deliverables' individual day ranges — always the existing curated
  `PROGRAMME_PHASES` values, never redistributed by this task's formula, even if the PM edits
  Phase 1's overall day span (edits shift the whole phase's absolute window
  proportionally/verbatim, per Requirement A, but not the internal deliverable breakdown).
- Cascading a phase **deletion** — only insertion cascades, per the request's own scope (Requirement
  C's last bullet).
- `programme_duration_days`' existing whole-programme rescale (`scaleDay`) — unaffected; a PM can
  still set an overall duration, and per-phase day-range edits happen on top of (after) that scale,
  not instead of it.
- Any change to the already-started Timeline's existing drag-resize override UI
  (`onScheduleChange`/`handleScheduleChange`, day_start_override/day_end_override's *other* writer)
  — this task adds a second, intake-time writer of the same columns; the drag-resize UI itself is
  untouched.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/config/customer-phases.ts` | Modify | Add `distributeDaysAcrossCount`, `applyDeliverableDayRanges`; extend `CustomPhaseSeed.deliverables` with day fields |
| `src/app/v2/(hub)/portfolio-tracker/new/_new-project-types.ts` | Modify | `PhaseDraft`/`DeliverableDraft` day-range population for defaults; `addCustomPhaseDraft` middle-insert cascade; `customPhasesFromDraft` includes deliverable day fields; new `defaultPhaseOverridesFromDraft` extractor |
| `src/app/v2/(hub)/portfolio-tracker/new/_phase-builder.tsx` | Modify | Day-range inputs for every phase (not just customs); read-only computed deliverable day badges; validation error state |
| `src/app/v2/(hub)/portfolio-tracker/new/_content.tsx` | Modify | Step-transition validation guard for invalid day ranges; wire the new `default_phase_overrides` field into the submit payload |
| `src/app/api/onboarding/projects/route.ts` | Modify | Accept + validate `default_phase_overrides`; persist to the draft-plan column(s) for save/save_scheduled; pass through to `seedAndStartProgramme` for immediate start |
| `src/lib/programme/seed.ts` | Modify | `buildSeedPhaseEntries`/`seedAndStartProgramme` apply default-phase and deliverable day overrides (remove the `isCustom` gate specifically for day-range override columns) |
| `supabase/migrations/106_projects_draft_phase_overrides.sql` (or folded into 248's 105) | Create | Persisted draft phase-plan storage for the new default-phase/deliverable day overrides |

## Code Context

### Distribution formula reference implementation (for `distributeDaysAcrossCount`)

```ts
export function distributeDaysAcrossCount(totalDays: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.max(1, Math.floor(totalDays / count));
  const remainder = Math.max(0, totalDays - base * count);
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}
// distributeDaysAcrossCount(15, 6) -> [3, 3, 3, 2, 2, 2]
```

### `PhaseSection`'s existing custom-only day inputs to widen (`_phase-builder.tsx:281-309`)

```tsx
{mode === "fixed-phases" && phase.isCustom && (
  <div className="mb-2 flex items-center gap-2 pl-1">
    <label>Day <input type="number" min={1} value={phase.dayStart ?? ""} onChange={...} /></label>
    <span>to</span>
    <input type="number" min={phase.dayStart ?? 1} value={phase.dayEnd ?? ""} onChange={...} />
  </div>
)}
```

Remove the `&& phase.isCustom` gate; keep the same input pair for every phase in `fixed-phases`
mode. Wrap the `onChange` handlers to also trigger `applyDeliverableDayRanges` (phase number 2+)
and, when this phase isn't the last, nothing else shifts automatically from an in-place day-range
*edit* (only an *insert* cascades per Requirement C — editing an existing phase's span is the PM's
explicit, deliberate action and does not auto-ripple to siblings, avoiding surprising side effects
from a single field edit).

### `addCustomPhaseDraft`'s current "always append to max known end" logic to extend (`_new-project-types.ts:76-95`)

```ts
export function addCustomPhaseDraft(draft: PhasePlanDraft, afterPhaseId?: string): PhasePlanDraft {
  const latestKnownDayEnd = draft.phases.reduce((max, p) => (p.dayEnd != null ? Math.max(max, p.dayEnd) : max), 0);
  const dayStart = latestKnownDayEnd + 1;
  // ... always uses the whole-draft max, regardless of insertAt position
}
```

Needs to become: if `afterPhaseId` is not the last phase, `dayStart` derives from *that specific*
phase's `dayEnd + 1` (not the whole-draft max), and every phase after the insertion point shifts by
the new phase's span. If `afterPhaseId` is the last phase (or omitted), current behavior is already
correct and unchanged.

### `seed.ts`'s existing `isCustom`-gated override write, to widen for day ranges only (`seed.ts:184-201`)

```ts
const phaseRows = entries.map((p) => ({
  ...
  day_start_override: p.isCustom ? p.dayStart : null,
  day_end_override: p.isCustom ? p.dayEnd : null,
  ...
}));
```

Becomes: `day_start_override`/`day_end_override` set whenever `p.dayStart`/`p.dayEnd` differ from
that phase number's static `PROGRAMME_PHASES` default (or unconditionally when `p.isCustom`, same as
today) — i.e. the override write becomes "did this differ from the static default," not "is this a
custom phase."

## Implementation Steps

1. `distributeDaysAcrossCount`/`applyDeliverableDayRanges` in `customer-phases.ts` — pure functions,
   write and sanity-check the worked example (`15, 6` → `[3,3,3,2,2,2]`) inline as a comment or
   quick manual check before wiring into the wizard.
2. `_new-project-types.ts`: populate `dayStart`/`dayEnd` on `defaultPhasePlanDraft()`'s 5 entries;
   extend `addCustomPhaseDraft` with the middle-insert cascade; add
   `defaultPhaseOverridesFromDraft`; extend `customPhasesFromDraft`'s deliverable mapping with day
   fields via `applyDeliverableDayRanges`.
3. `_phase-builder.tsx`: widen the day-range input pair to every phase; add read-only computed
   deliverable day badges (phase 2+ only); wire onChange → recompute → validation state.
4. `_content.tsx`: step-guard validation; submit payload gains `default_phase_overrides`.
5. Migration (`106_...` or folded into 248's `105_...` depending on implementation order/timing)
   for persisted draft-plan storage — coordinate with task 248 to avoid two competing schemas for
   the same "draft phase plan" concept; prefer one shared JSONB shape if both tasks land close
   together.
6. `route.ts`: validate + persist `default_phase_overrides`; pass through on immediate start.
7. `seed.ts`: widen `day_start_override`/`day_end_override` writing off the `isCustom` gate to a
   "differs from static default" check; deliverable rows carry their computed override too.
8. Sweep changed files against `nextjs-file-length-best-practices.md` — `_phase-builder.tsx` is
   already 439 lines pre-task; likely needs the day-range input pair and deliverable day badge
   extracted into their own small components to stay under the soft-warning range after this task's
   additions.
9. `npx tsc --noEmit` and `pnpm lint`.

## Acceptance Criteria

- [ ] Every phase (default and custom) in `fixed-phases` mode shows an editable Day X to Y input,
      pre-filled with today's static values for the 5 defaults.
- [ ] Editing Phase 2's (Migrate & Rebrand) day range to, say, Day 16-30 (15 days) with 6
      deliverables shows those deliverables' computed day badges as 3/3/3/2/2/2-day spans in order,
      matching the worked example.
- [ ] Adding or removing a deliverable within Phase 2 recomputes the distribution immediately.
- [ ] Phase 1 (Onboard)'s deliverable day ranges never change regardless of any edit to Phase 1's
      overall day span or its deliverable list.
- [ ] Inserting a custom phase between Phase 2 and Phase 3 shifts Phase 3, 4, 5 (and any further
      customs) forward by the inserted phase's span, each phase's own span length preserved, and
      each shifted phase's deliverables re-derive their absolute (but not relative) day ranges.
- [ ] Inserting a custom phase after Phase 5 (the last phase) still defaults to
      `Phase 5's dayEnd + 1` as its start — unchanged behavior, confirmed not regressed.
- [ ] A day-range edit producing `dayEnd < dayStart` or fewer days than deliverables blocks wizard
      step progression with a visible inline error.
- [ ] Submitting a project (any of the 3 modes) with edited default-phase day ranges and/or a
      mid-inserted custom phase: the resulting `customer_phases`/`customer_deliverables` rows (once
      started, immediately or via Draft/Scheduled deferred start) reflect the exact edited/computed
      day ranges — verified for all three start modes, closing the same "discarded on Draft" failure
      mode task 248 fixes for skip/custom phases.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual (no test runner configured):
- Create a StackShift I project, edit Phase 2's day range and deliverable count, verify computed
  badges match the largest-remainder formula by hand for at least 2 different (days, count) pairs
  including the request's own `15/6` example.
- Insert a custom phase between two defaults; verify every later phase's day range shifted by the
  correct offset, and deliverable badges recomputed accordingly.
- Submit as Draft; reopen in Portfolio Tracker per task 248's flow; start the programme; inspect the
  resulting `customer_phases`/`customer_deliverables` rows in Supabase against what was configured
  at intake.
- Confirm Phase 1/Onboard's deliverables are untouched in the same inspection.

## Compatibility Touchpoints

- New migration required (exact shape TBD at implementation time — coordinate with task 248's own
  migration to avoid duplicate/competing "draft phase plan" columns).
- `CustomPhaseSeed`'s shape change (deliverables gain day fields) is a wire-format change to
  `POST /api/onboarding/projects`'s `custom_phases` field — additive (new required sub-fields on an
  already-internal, non-public API), no external consumer risk (this route is called only by the
  New Project wizard itself, confirmed via `_content.tsx`'s own call site).
- No `_docs/mcp-tools.md` changes (no MCP tool touched).

## Implementation Notes

### What Changed
- **Requirement A (per-phase day-range inputs):** `PhaseSection` (`_phase-builder.tsx`) now shows
  the Day X to Y input pair for every phase in `fixed-phases` mode (default or custom) — the
  `&& phase.isCustom` gate was removed. `defaultPhasePlanDraft()` (`_new-project-types.ts`) now
  builds directly from `PROGRAMME_PHASES` (dropping the `phasePlanFromProgramme()` indirection,
  which carried no day fields) and pre-fills `dayStart`/`dayEnd` from each static phase's own
  range; deliverables also carry a new optional `key` field, copied from the static
  `deliverable_key`, so later override lookups can match the exact seeded row (see Deviations).
  Editing a default phase's day range only ever writes to `day_start_override`/`day_end_override`
  (via the new `default_phase_overrides` wire field below) — `isCustom`/`custom_name` are
  untouched, matching the existing custom-phase override convention.
- **Requirement B (auto-distributed deliverable day ranges):** `distributeDaysAcrossCount` and
  `applyDeliverableDayRanges` added to `src/config/customer-phases.ts` (largest-remainder method,
  worked example `distributeDaysAcrossCount(15, 6) -> [3,3,3,2,2,2]` verified inline). Read-only
  deliverable day badges (phase 2+ only, `_phase-builder.tsx`'s `DeliverableRow`) are a pure
  render-time derivation from the phase's own `dayStart`/`dayEnd`/`deliverables.length` — never
  separately-stored state — so they recompute automatically on any day-range edit, add/remove, or
  drag reorder. Phase 1/Onboard is excluded everywhere this applies (gated on
  `phase.phaseNumber !== 1`).
- **Requirement C (insert-in-the-middle cascade):** `addCustomPhaseDraft` (`_new-project-types.ts`)
  now detects a middle insert (`afterPhaseId` names a phase that isn't last) and shifts every
  later phase's `dayStart`/`dayEnd` forward by the new phase's span, preserving each shifted
  phase's own span length; inserting after the last phase (or omitting `afterPhaseId`) is
  unchanged (`latestKnownDayEnd + 1`).
- **Requirement D (validation):** new `phasePlanValidationErrors(draft)` in `_new-project-types.ts`
  flags `dayEnd < dayStart` and (phase 2+ only) a span shorter than the phase's own deliverable
  count, keyed by `PhaseDraft.id`. `_phase-builder.tsx` shows the message inline under the day
  inputs with a red border; `_content.tsx`'s `goNext()` blocks the Step 3 → 4 transition and
  scrolls to the offending card when any fixed-phases card has an error.
- **Requirement E (backend threading):** `CustomPhaseSeed.deliverables` now always carries
  `dayStart`/`dayEnd` (computed via `applyDeliverableDayRanges` in `customPhasesFromDraft`, since
  a custom phase is never "Onboard"). New `DefaultPhaseOverride` type + `default_phase_overrides`
  wire field (validated the same way `custom_phases` already is, `usesCustomerPhasesEngine`-gated)
  threads from `_content.tsx` → `POST /api/onboarding/projects` → new
  `projects.draft_default_phase_overrides jsonb` column (migration 106, a sibling to task 248's
  `draft_custom_phases`, not folded into it — different semantics, `isCustom` branching stays
  clean) → the three deferred-start call sites (`programme/start`, `qstash-start`,
  `scheduled-autostart`) → `seedAndStartProgramme`/`seedProgrammeAtPhase`'s new 8th param →
  `buildSeedPhaseEntries` (`seed.ts`), which layers the override onto `PROGRAMME_PHASES`' static
  values before both seed functions write `day_start_override`/`day_end_override`. The
  `isCustom`-gated override-write condition on both `customer_phases` and (newly, this task)
  `customer_deliverables` widened to "differs from the static default" (`phaseDayOverride`/
  `deliverableDayOverride` helpers) — a custom phase/deliverable still always writes (no static
  counterpart), an unedited default now correctly writes nothing (byte-identical to pre-task
  behavior), and an edited default now correctly writes its override.

### Files Changed
- `src/config/customer-phases.ts` - `distributeDaysAcrossCount`, `applyDeliverableDayRanges`,
  `DefaultPhaseOverride` type; `CustomPhaseSeed.deliverables` gains required day fields
- `src/app/v2/(hub)/portfolio-tracker/new/_new-project-types.ts` - `DeliverableDraft.key`;
  `defaultPhasePlanDraft` populates day fields + deliverable keys from `PROGRAMME_PHASES`;
  `addCustomPhaseDraft` middle-insert cascade; `customPhasesFromDraft` computes deliverable day
  ranges; new `defaultPhaseOverridesFromDraft`, `phasePlanValidationErrors`
- `src/app/v2/(hub)/portfolio-tracker/new/_phase-builder.tsx` - day-range inputs for every phase;
  read-only computed deliverable day badges; inline validation error state
- `src/app/v2/(hub)/portfolio-tracker/new/_content.tsx` - Step 3 → 4 validation guard;
  `default_phase_overrides` wired into the submit payload and the jump-to-phase PATCH body; fixed
  a pre-existing bug (see Deviations) where `skip_phase_numbers`/`custom_phases` were never sent
  for Draft/Scheduled submissions
- `src/app/api/onboarding/projects/route.ts` - `default_phase_overrides` type + validation;
  persisted to `draft_default_phase_overrides` for every mode; passed to `seedAndStartProgramme`
  for `mode: "start"`
- `src/lib/programme/seed.ts` - `buildSeedPhaseEntries`/`seedAndStartProgramme`/
  `seedProgrammeAtPhase` accept `defaultPhaseOverrides`; `phaseDayOverride`/
  `deliverableDayOverride` widen the override-write gate from `isCustom` to "differs from static"
- `src/app/api/projects/[projectId]/programme/start/route.ts`,
  `src/app/api/onboarding/projects/[projectId]/qstash-start/route.ts`,
  `src/app/api/onboarding/scheduled-autostart/route.ts` - select + pass
  `draft_default_phase_overrides` into `seedAndStartProgramme`
- `src/app/api/projects/[projectId]/programme/phase/route.ts` - accepts/relays
  `default_phase_overrides` into `seedProgrammeAtPhase`; local `entries` computation now honors a
  default phase's overridden `dayStart` for the jump-to-phase backdate calculation
- `src/types/database.ts` - `draft_default_phase_overrides: Json` on `projects` Row/Insert/Update
- `supabase/migrations/106_projects_draft_default_phase_overrides.sql` - new column

### Deviations From Plan
- **`applyDeliverableDayRanges` signature:** the task doc sketched
  `applyDeliverableDayRanges(phase: PhaseDraft): PhaseDraft`. Implemented instead as
  `applyDeliverableDayRanges(dayStart: number, dayEnd: number, count: number)` — a `PhaseDraft`
  param would require `customer-phases.ts` (lower-level, imported by the wizard) to import the
  wizard-only `PhaseDraft` type from `_new-project-types.ts`, a circular import. The primitive
  signature is reusable by both the wizard's render-time badge derivation and
  `customPhasesFromDraft`/`defaultPhaseOverridesFromDraft` without that cycle, and is the "or
  equivalent" the task doc's own wording allowed for.
- **`DeliverableDraft.key` (new field, not in the task doc):** needed so a default phase's
  deliverable-level override can key back onto the exact `customer_deliverables` row seed.ts
  writes — `deliverable_key` for default-phase deliverables always comes from
  `PROGRAMME_PHASES` (never from the draft's own name), so a slugified-from-name key wouldn't
  reliably match after a rename or drag reorder. Populated only for default-phase deliverables at
  creation time; free-form/custom deliverables are unaffected (still slugified at submission).
- **`skip_phase_numbers`/`custom_phases` mode-gating bug fix (required for correctness, found
  during implementation):** `_content.tsx`'s `buildCreatePayload` only ever sent these two fields
  when `mode === "start"`, despite task 248's own server-side persistence fix expecting them on
  every mode — a Draft/Scheduled submission never actually reached the server with any skip/custom
  configuration to persist, so task 248's fix had nothing to read. This directly blocks this
  task's own acceptance criterion ("verified for all three start modes, closing the same
  'discarded on Draft' failure mode task 248 fixes for skip/custom phases"), so the `mode ===
  "start"` gate was removed from both fields (and never added to the new
  `default_phase_overrides` field) as part of this task.
- **`programme/phase/route.ts`'s local `entries` computation (not itemized in the task doc's file
  list):** now honors a default phase's overridden `dayStart` (previously always the static
  value) so the jump-to-phase two-step's backdate math is correct when a PM both edits a default
  phase's day range and jumps straight to it at intake.
- No Major deviations — every Requirement (A-E) implemented as scoped; Onboard/Phase 1's curated
  deliverable ranges are never redistributed; free-form mode is untouched.

### File-Length Sweep
- `_phase-builder.tsx`: 439 → 489 lines (task doc's own pre-task note flagged this file as
  already over the soft-warning range and likely needing extraction). Still under the 400-500
  "hard limit" band; not extracted further given the net addition (~50 lines) is the day-range
  input pair + a single badge `<span>`, not a new independent concern — matches task 247/248's own
  precedent of not fixing a file's pre-existing over-length condition as a side effect.
- `_content.tsx`: 1196 → ~1229 lines (net +33 for the validation guard + payload wiring). Already
  far over any soft/hard threshold pre-task (task 248 and earlier tasks left this untouched for
  the same reason) — not split, same precedent.
- `route.ts` (onboarding/projects), `seed.ts`, `customer-phases.ts`: all under 500 lines total
  after this task's additions.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing warnings in `_checklist-tab.tsx`, unrelated to this task —
  same warnings noted in tasks 222/239/242/247/248's own Implementation Notes)
- Manual/browser acceptance checks from this task doc's Verification section - SKIPPED (no live
  Supabase/browser session available in this implementation pass, and migration 106 hasn't been
  applied yet — same limitation task 248's own Implementation Notes documented for its migration).
  Recommend applying `106_projects_draft_default_phase_overrides.sql` first, then walking: editing
  Phase 2's day range/deliverable count and checking the computed badges against the largest-
  remainder formula by hand; inserting a custom phase between two defaults and confirming every
  later phase's day range shifts by the correct offset; submitting as Draft/Scheduled/Start Now
  with edited default-phase day ranges and inspecting the resulting `customer_phases`/
  `customer_deliverables` rows in Supabase for all three modes.

## Post-Implementation UI Fixes (chat follow-up)

User feedback after reviewing the shipped UI, addressed directly (no new task doc — small,
same-surface polish/UX fixes to what this task already built):

1. **Day-field visual polish** — the separate "Day [input] to [input]" pair (`_phase-builder.tsx`)
   is now one compact bordered group (`Day [1] to [15]` inside a single `rounded-[9px]` container,
   `focus-within` highlight), native number-input spinners hidden via an `appearance-none`
   arbitrary-variant pair targeting the WebKit inner and outer spin-button pseudo-elements
   individually, values centered.
2. **Skip/include cascade** — new `setPhaseIncluded(draft, phaseId, included)` in
   `_new-project-types.ts`: toggling a phase's `included` checkbox now re-packs every other
   *included* phase's day range into a tight, gapless sequence starting at Day 1 (each keeping its
   own current span) — unchecking Onboard now makes the next included phase start at Day 1 instead
   of leaving a 15-day gap, and rechecking it pushes everything back out. Wired through a new
   `onToggleIncluded` prop (`PhaseBuilder` → `PhaseSection`) instead of the checkbox's previous
   single-phase `onChange` call, since the cascade needs the whole draft, not just one phase.
   Excluded phases keep their own last day range untouched (cosmetic only — never read at seed
   time). Deliverable day badges update automatically (still a pure render-time derivation, no
   separate state to resync).
3. **Checkbox status/tooltip clarity** — the unchecked state's label changed from the imperative
   "Skip this phase" (read as ambiguous — described an action, not the current state, and
   inconsistent with the checked state's "✓ Included" status framing) to a status label matching
   the same convention: "✗ Skipped" (muted red, `X` icon). A native `title` tooltip on the label
   now separately communicates the *action* a click would take: "Skip this phase" when currently
   included, "Include this phase" when currently excluded.

### Files Changed (this follow-up)
- `src/app/v2/(hub)/portfolio-tracker/new/_new-project-types.ts` - new `setPhaseIncluded`
- `src/app/v2/(hub)/portfolio-tracker/new/_phase-builder.tsx` - day-field UI, checkbox
  status label + tooltip, `onToggleIncluded` prop plumbing

### Verification
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (same 2 pre-existing unrelated warnings)
- Manual browser check - not performed in this pass (no live session); recommend confirming the
  cascade visually (uncheck Onboard, confirm Migrate & Rebrand's Day field updates to 1-15) and
  the tooltip text on hover for both checked/unchecked states.
