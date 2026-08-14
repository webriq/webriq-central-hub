# 250: New Project Form — Duration/Skip-Phase Validation, Collapsible Phases, Name+Type Chip Header, Empty-Name Guards

**Created:** 2026-08-14
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Completed
**Depends on:** 249 (`New Project Form — Per-Phase Custom Duration Days + Auto-Distributed Deliverable Day Ranges`) — every change here is a same-session chat follow-up layered directly on 249's fixed-phases `PhaseBuilder`/`_new-project-types.ts` per-phase day-range editing; none of it is meaningful without 249 already in place.

---

## Overview

Six chat-driven follow-up requests against the New Project wizard's Step 3 ("Phases & Deliverables", `/v2/portfolio-tracker/new`), all scoped to `src/app/v2/(hub)/portfolio-tracker/new/`. Delivered in one continuous session, each building on the previous:

1. **Day-range vs. Programme duration cross-validation.** A phase's `dayEnd` running past the card's own `Programme duration (days)` field now shows an inline red error on that phase's Day-to input — for *every* phase, not just the last one (phases are allowed to run synchronously/overlap by design, so this is a pure ceiling check, not an ordering one). The reciprocal case — duration set lower than the last phase's own end day — shows its own message on the duration field itself, both fields turning red simultaneously.
2. **Auto-extend + warning when duration is raised past the last phase's end day.** Raising the duration field past the last included phase's current end day now auto-stretches that phase's end day to match (deliverable day sub-ranges recompute for free, since they're a pure derivation off `dayStart`/`dayEnd`) and shows an amber "last phase was stretched" notice.
3. **Collapsible phases**, matching the wizard's existing per-type collapsible sections. Each phase row gets its own chevron toggle; the header (drag handle, name, Included/Skipped badge) always stays visible; only the day-range editor and deliverable list collapse; a one-line summary (`Day 76–105 (30 days) · 4 deliverables · Included`) shows while collapsed; "Insert custom phase after this one" stays visible and clickable regardless of collapse state.
4. **Project name + type chip in each section header.** Each Step-3 section now reads `{Project Name} · [Type]` instead of the bare classification string, with the type rendered as a chip reusing this wizard's existing light-blue pill token.
5. **Bug found and fixed mid-session:** the "skip this phase" checkbox's day-range repack cascade could leave the new last included phase short of the Programme duration (e.g. skipping a 15-day middle phase pulls everything after it forward, opening a 15-day unaccounted gap at the tail) without triggering the same auto-extend-and-warn behavior item 2 added — it only fired from the duration field's own `onChange`. Fixed by composing the same extend logic into the checkbox's cascade.
6. **Empty phase/deliverable/checklist-item name validation** before Step 3 can advance — a blank name the PM added but never filled in (or forgot to remove) previously submitted silently wrong, since the submission-shaping functions (`phasePlanDraftToInput`, `defaultPhaseOverridesFromDraft`, `customPhasesFromDraft`) all just skip blank rows. Now blocked with an inline message ("Enter a phase name or remove this phase." / deliverable / checklist-item variants) and a scroll-to-field jump to the first offender.

## Requirements

- [x] Any included phase's `dayEnd > durationDays` shows a red inline error on that phase's own Day-to input, regardless of position in the phase list (no ordering/overlap assumption).
- [x] `durationDays < lastIncludedPhase.dayEnd` shows a red inline error on the Programme duration field itself.
- [x] Raising `durationDays` past the last included phase's `dayEnd` auto-stretches that phase's `dayEnd` to match, and shows an amber notice describing what happened.
- [x] Unchecking a phase's "Included" checkbox re-packs remaining included phases' day ranges (existing behavior, task 249) **and** re-applies the same auto-extend-and-notify behavior if the repack leaves the new last phase short of `durationDays`.
- [x] Re-checking a phase, or any other toggle that doesn't produce a gap, clears a stale extend notice rather than leaving a prior one displayed.
- [x] Each phase row has its own collapse/expand toggle; collapsing hides only the day-range editor and deliverable list — header and "Insert custom phase after this one" stay visible.
- [x] A collapsed phase shows a one-line summary: day range + duration, deliverable count, and Included/Skipped status (fixed-phases mode); deliverable count only (free-form mode).
- [x] Each Step-3 section header shows `{resolved project name} · [type]`, with the type styled as a chip (not plain text).
- [x] An empty phase name (free-form phases and custom fixed-phases only — default fixed-phase names are static, never flagged), empty deliverable name, or empty checklist-item title blocks advancing past Step 3, with an inline message and a scroll-to-field jump to the first offending input.
- [x] The empty-name check runs in both fixed-phases and free-form modes (the pre-existing day-range check only ever ran for fixed-phases cards).
- [x] `scrollToField` degrades gracefully when the exact offending field isn't rendered (phase or type section manually collapsed) by falling back to the nearest visible ancestor instead of silently doing nothing.

## Out of Scope / Must-Not-Change

- No schema/migration changes — everything here is client-side wizard-draft validation and UI state.
- Day-range/duration/empty-name validation stays scoped to Step 3 of `/v2/portfolio-tracker/new`; it does not touch the Portfolio Tracker's post-creation Timeline/phase-editing surfaces.
- Free-form mode's day-concept-free deliverables/checklist are unaffected by the day-range/duration checks (items 1–2, 5) — those apply to fixed-phases mode only, per the pre-existing `phasePlanValidationErrors`/`programmeDurationError` scoping from task 249.
- Did not lift phase/type collapse state up into `_content.tsx` to force-expand collapsed sections on a validation failure — used a lighter-weight scroll-to-field fallback chain instead (see Implementation Notes).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/portfolio-tracker/new/_new-project-types.ts` | Modify | `phasePlanValidationErrors` extended with a `durationDays` overflow check; new `programmeDurationError`, `extendLastPhaseToDuration`, `phasePlanEmptyNameErrors`, `emptyNameFieldId`; shared `lastIncludedPhase` helper. |
| `src/app/v2/(hub)/portfolio-tracker/new/_phase-builder.tsx` | Modify | `InlineRow` gains `id`/`error` props; `ChecklistItemRow`/`DeliverableRow`/`PhaseSection` thread the empty-name error map; `PhaseSection` gains a collapse toggle + collapsed summary; `PhaseBuilder` gains `durationDays`-aware validation, `onLastPhaseExtended` composition in `toggleIncluded`, and per-phase collapse state. |
| `src/app/v2/(hub)/portfolio-tracker/new/_phases-step.tsx` | Modify | Duration field gains red/error state + the extend-notice amber banner; section header renders `{displayName} · [type chip]`; new `getDisplayName` prop; wires `PhaseBuilder`'s new `durationDays`/`onLastPhaseExtended` props. |
| `src/app/v2/(hub)/portfolio-tracker/new/_content.tsx` | Modify | `scrollToField` accepts a fallback id chain; Step-3 `goNext()` gate extended to check both modes and empty-name errors; passes `displayedNameForCard` down as `getDisplayName`. |

## Code Context

### File: `_new-project-types.ts`

```ts
// Overflow check now applies to every included phase, not just the last:
export function phasePlanValidationErrors(draft: PhasePlanDraft, durationDays?: number): Map<string, string> {
  for (const p of draft.phases) {
    if (!p.included || p.dayStart == null || p.dayEnd == null) continue;
    if (p.dayEnd < p.dayStart) { errors.set(p.id, "End day must be on or after the start day."); continue; }
    if (durationDays != null && p.dayEnd > durationDays) {
      errors.set(p.id, `This is more than the set total Programme duration (${durationDays} days) — please update accordingly.`);
      continue;
    }
    // ... existing deliverable-count-vs-span check unchanged
  }
}

// Reciprocal (duration field's own error) + auto-extend, both keyed off the *last included* phase
// in array order (not the numerically highest dayEnd — phases can run out of order by design).
export function programmeDurationError(draft: PhasePlanDraft, durationDays: number): string | undefined { /* ... */ }
export function extendLastPhaseToDuration(draft: PhasePlanDraft, durationDays: number):
  { phasePlan: PhasePlanDraft; extended: boolean; previousDayEnd?: number } { /* ... */ }

// Empty-name guard — globally-unique draft ids (single nextDraftId() counter) make one flat map safe.
export type EmptyNameErrorKind = "phase" | "deliverable" | "checklist";
export function phasePlanEmptyNameErrors(draft: PhasePlanDraft, mode: "fixed-phases" | "free-form"):
  Map<string, { phaseId: string; kind: EmptyNameErrorKind; message: string }> { /* ... */ }
export function emptyNameFieldId(id: string, kind: EmptyNameErrorKind): string { /* ... */ }
```

### File: `_phase-builder.tsx`

```tsx
// PhaseBuilder's toggleIncluded now composes the repack with the same extend-to-duration pass
// the duration field already used, so a skip-triggered gap gets closed too — and reports the
// result (or null) so the parent can show/clear the matching notice.
function toggleIncluded(id: string, included: boolean) {
  const repacked = setPhaseIncluded(phasePlan, id, included);
  if (mode !== "fixed-phases") { onChange(repacked); return; }
  const { phasePlan: extended, extended: wasExtended, previousDayEnd } = extendLastPhaseToDuration(repacked, durationDays);
  onChange(extended);
  onLastPhaseExtended?.(wasExtended && previousDayEnd != null ? previousDayEnd : null);
}
```

### File: `_content.tsx`

```ts
// scrollToField now tries a chain of candidate ids, first one found wins — covers a collapsed
// phase/type section hiding the exact offending field.
function scrollToField(id: string | string[]) {
  const candidates = Array.isArray(id) ? id : [id];
  requestAnimationFrame(() => {
    for (const candidateId of candidates) {
      const el = document.getElementById(candidateId);
      if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus({ preventScroll: true }); return; }
    }
  });
}
```

## Implementation Steps

1. `_new-project-types.ts`: extend `phasePlanValidationErrors` with the duration-overflow check; add `lastIncludedPhase`, `programmeDurationError`, `extendLastPhaseToDuration`.
2. `_phases-step.tsx`: wire the duration field's error/red-state, apply-and-notify `extendLastPhaseToDuration` on duration change, render the amber notice.
3. `_phase-builder.tsx`: add per-phase collapse state to `PhaseBuilder`/`PhaseSection` with a collapsed summary line, keeping the header and "Insert custom phase after this one" always visible.
4. `_phases-step.tsx` + `_content.tsx`: thread `displayedNameForCard` down as `getDisplayName`; render `{displayName} · [type chip]` in each section header using the wizard's existing light-blue pill token.
5. `_phase-builder.tsx`: compose `extendLastPhaseToDuration` into `toggleIncluded`'s repack, add `onLastPhaseExtended` prop; `_phases-step.tsx` wires it to the same notice state the duration field uses, unified via a shared `lastPhaseExtendedNotice()` message helper.
6. `_new-project-types.ts`: add `phasePlanEmptyNameErrors`/`emptyNameFieldId`; `_phase-builder.tsx`: give `InlineRow` `id`/`error` props, thread the error map through `ChecklistItemRow`/`DeliverableRow`/`PhaseSection`/`PhaseBuilder`, auto-expand a deliverable's checklist on mount if it already contains an error; `_content.tsx`: extend the Step-3 gate to run in both modes and upgrade `scrollToField` to accept a fallback chain.
7. `npx tsc --noEmit` and `npx eslint` after every step; re-verify clean at the end.

## Acceptance Criteria

- [x] A phase (any position) with `dayEnd > durationDays` shows a red Day-to input + inline message; the Programme duration field shows its own red state + message when set below the last phase's end day.
- [x] Raising duration past the last phase's end day auto-stretches that phase and shows the amber notice; the notice text is identical whether triggered by the duration field or a skip-toggle repack (shared `lastPhaseExtendedNotice()`).
- [x] Unchecking a phase whose skip repacks the remaining phases short of `durationDays` auto-extends the new last phase and shows the notice; re-checking (or any toggle that doesn't produce a gap) clears a stale notice.
- [x] Every phase row can be independently collapsed/expanded; collapsed phases show `Day X–Y (N days) · M deliverables · Included/Skipped`; "Insert custom phase after this one" remains clickable while collapsed.
- [x] Each Step-3 section header reads `{project name} · [type chip]`, chip styled with the wizard's existing `bg-[#E5F1FF] text-[#007BFF]` pill token.
- [x] A blank phase/deliverable/checklist-item name blocks the "Continue" action from Step 3 with an inline red message and jumps the viewport to the first offending field (or its nearest visible ancestor if collapsed).
- [x] `npx tsc --noEmit` passes clean.
- [x] `npx eslint` passes clean on every touched file.

## Verification

```bash
npx tsc --noEmit
npx eslint "src/app/v2/(hub)/portfolio-tracker/new/_new-project-types.ts" \
  "src/app/v2/(hub)/portfolio-tracker/new/_phase-builder.tsx" \
  "src/app/v2/(hub)/portfolio-tracker/new/_phases-step.tsx" \
  "src/app/v2/(hub)/portfolio-tracker/new/_content.tsx"
```

Both ran clean after every round of changes in this session, re-confirmed at the end with no further fixes needed. `pnpm build` and manual/browser acceptance (live day-range/duration cross-validation, the skip-checkbox auto-extend fix, collapsing/expanding phases, the name+chip header, and the empty-name block-and-scroll flow end-to-end in `/v2/portfolio-tracker/new`) were **not** run in this session — no live dev server/browser session available, the same documented gap as sibling tasks 239/240/244/245/246 — recommended before shipping.

## Compatibility Touchpoints

- No API/schema/migration changes — this task is entirely within the New Project wizard's client-side draft state and validation.
- No `_docs/mcp-tools.md` changes (no MCP tool touched).
- Builds directly on task 249's `PhaseDraft`/`PhasePlanDraft` shapes and `applyDeliverableDayRanges` derivation — no shape changes to either, only new pure functions operating on them.

## Implementation Notes

- **Why a scroll fallback chain instead of forced-open state.** Auto-expanding a collapsed phase/type section on validation failure would require lifting `PhasesStep`'s `expanded` set and `PhaseBuilder`'s `collapsedPhases` set up into `_content.tsx`, plus a mechanism to un-force them again without fighting the PM's own later manual collapse. Given both collapse layers default to fully expanded, the only way a validation target ends up hidden is a PM deliberately collapsing something first — a real but secondary case. `scrollToField`'s new fallback-chain (`[exact field, phase container, type container]`) handles it by degrading to the nearest visible ancestor instead, without any risk of a "why can't I collapse this anymore" regression.
- **Auto-extend is scoped to system-driven changes only, not direct edits.** `extendLastPhaseToDuration` is invoked from the duration field's `onChange` and from the skip-checkbox's repack cascade — never from a direct edit to the last phase's own Day-to input. Applying it unconditionally on every phase-plan change would make it impossible for a PM to ever type a smaller end-day value into the last phase while a fixed duration is set (every keystroke would immediately snap back), which is a worse regression than the gap it's meant to close.
- **Empty-name validation is reactive, not gated behind a submit attempt.** Consistent with this file's pre-existing day-range/duration validation convention (also always-on, not touched-field-gated), a newly added blank phase/deliverable/checklist-item shows its red state immediately on add, before the PM ever clicks Continue.
- **All draft ids are globally unique** (`nextDraftId()` is one shared counter across phases/deliverables/checklist items across every selected type's card), which is what makes a single flat `Map<string, EmptyNameError>` safe to thread through the whole component tree without a prefix scheme.
