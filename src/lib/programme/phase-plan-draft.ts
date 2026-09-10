import {
  type PhasePlanInput,
  PROGRAMME_PHASES,
  applyDeliverableDayRanges,
} from "@/config/customer-phases";

// ─── Draft shapes ─────────────────────────────────────────────────────────────
// Mirror task 239's PhasePlanInput/PhasePlan/DeliverablePlan/ChecklistItemPlan exactly, but with
// a client-only `id` (for React keys + in-place editing) alongside each name/title — stripped by
// `phasePlanDraftToInput` before the field is sent to the API.
//
// Task 357: extracted out of `src/app/(hub)/projects/v2/new/_new-project-types.ts` (which keeps
// re-exporting everything here) so the same `PhaseBuilder` UI + draft helpers can also drive the
// StackShift Orders convert flow's "set the phases now" dialog. Pure — no React, no server
// clients — so it's safe to import from both a client component and `createFromOrder` server-side.

export type ChecklistItemDraft = { id: string; title: string };
// `key` (task 249): set only for a default (non-custom) phase's deliverables, from PROGRAMME_PHASES'
// own static deliverable_key, at defaultPhasePlanDraft() creation time — preserved through drag
// reorder (the object moves, the field stays attached) so defaultPhaseOverridesFromDraft below can
// key its per-deliverable override back onto the exact same customer_deliverables row seed.ts
// writes, instead of re-deriving a slug that wouldn't match the static key. Free-form/custom
// deliverables never carry it (slugifyDeliverableKey generates their key at submission time, same
// as before this task).
export type DeliverableDraft = { id: string; name: string; checklist: ChecklistItemDraft[]; key?: string };
// `included` (task 244): fixed-phases mode only — lets a PM opt a specific phase out of this one
// project (StackShift I: excluded from `skip_phase_numbers`; StackShift II-with-default: simply
// omitted from the generic `phase_plan`). Always `true` in free-form mode — no UI there toggles
// it, so a free-form phase is either present or removed outright, never "included: false".
//
// phaseNumber/isCustom/dayStart/dayEnd (task 246): fixed-phases mode gained an "Add custom
// phase" affordance (`_phase-builder.tsx`), letting a PM add phases beyond the fixed 5.
// `phaseNumber` is a stable identity assigned once at creation (1-5 for the defaults, 6+ for
// customs via `nextPhaseNumber` below) — never derived from array position, since a custom phase
// can be inserted anywhere in the array. Task 249: `isCustom: false` phases now ALSO carry their
// own dayStart/dayEnd, PM-editable — pre-filled from PROGRAMME_PHASES at draft creation
// (defaultPhasePlanDraft below); was previously always `null` for defaults, with the day range
// implicitly read straight off PROGRAMME_PHASES wherever needed. `isCustom: true` phases carry
// their own (PM-set, day 1-120+ reference scale, same as the 5 defaults).
export type PhaseDraft = {
  id: string;
  phaseNumber: number;
  name: string;
  included: boolean;
  isCustom: boolean;
  dayStart: number | null;
  dayEnd: number | null;
  deliverables: DeliverableDraft[];
};
export type PhasePlanDraft = { phases: PhaseDraft[] };

let draftIdCounter = 0;
export function nextDraftId(): string {
  draftIdCounter += 1;
  return `draft-${draftIdCounter}`;
}

export function emptyPhasePlanDraft(): PhasePlanDraft {
  return { phases: [] };
}

// StackShift I always, and StackShift II when its "generate default" checkbox is checked — the
// 5 fixed programme phases as an editable-at-the-deliverable-level starting point (task 239's
// PROGRAMME_PHASES, task 249's own day-range fields included). The 5 defaults are never reordered/
// removed relative to each other in this mode; a PM can only add custom phases around them (see
// addCustomPhaseDraft).
export function defaultPhasePlanDraft(): PhasePlanDraft {
  return {
    phases: PROGRAMME_PHASES.map((p) => ({
      id: nextDraftId(),
      phaseNumber: p.number,
      name: p.name,
      included: true,
      isCustom: false,
      // Task 249: pre-filled from PROGRAMME_PHASES' own static range (was `null`/`null`) — at
      // creation time the card's durationDays is always the 120 default, so this is already the
      // correctly-scaled value (scaleDay(x, 120) === x); a card-level duration edit made later in
      // the wizard doesn't retroactively rescale an already-populated per-phase range, matching
      // how a PM's own per-phase edit is never auto-rippled by anything but an insert cascade.
      dayStart: p.dayStart,
      dayEnd: p.dayEnd,
      deliverables: p.deliverables.map((d) => ({ id: nextDraftId(), name: d.name, checklist: [], key: d.key })),
    })),
  };
}

// Task 357 — the StackShift I default phase/deliverable template as a plain `PhasePlanInput`,
// ready to hand straight to `seedCustomPhases`. Used by the convert flow's "use the default
// StackShift phases" option for non-StackShift-I projects, so they get the same milestone
// structure without going onto the specialized customer_phases engine.
export function defaultPlanFromProgrammePhases(): PhasePlanInput {
  return phasePlanDraftToInput(defaultPhasePlanDraft());
}

// Next stable identity for a newly-added custom phase — always beyond the highest phaseNumber
// already in the draft (5 for a fresh fixed-phases draft, since defaults occupy 1-5), so it never
// collides with a default or an earlier custom, regardless of where it's positioned in the array.
export function nextPhaseNumber(draft: PhasePlanDraft): number {
  return draft.phases.reduce((max, p) => Math.max(max, p.phaseNumber), 0) + 1;
}

// Task 246 — fixed-phases mode's "Add custom phase": inserts a new phase into the draft right
// after `afterPhaseId` (or at the end when omitted/not found). Default day range starts the day
// after the latest currently-known phase end (best-effort — a default phase's own end isn't in
// the draft, so this only looks at other customs already placed; the PM adjusts via the day-range
// inputs regardless). A 2-week span is a reasonable default the PM can resize.
//
// Task 249: now every phase (default or custom) carries a real dayStart/dayEnd, so "the latest
// currently-known phase end" is always accurate — and when `afterPhaseId` names a phase that
// isn't the last one in the draft, this also cascades every later phase's dayStart/dayEnd forward
// by the new phase's span (own span length preserved per phase), closing the gap where a
// middle-insert incorrectly reused the "append after the whole draft's max" formula. Inserting
// after the last phase (or omitting afterPhaseId) is unchanged — still `latestKnownDayEnd + 1`.
export function addCustomPhaseDraft(draft: PhasePlanDraft, afterPhaseId?: string): PhasePlanDraft {
  const insertAt = afterPhaseId ? draft.phases.findIndex((p) => p.id === afterPhaseId) : -1;
  const isMiddleInsert = insertAt !== -1 && insertAt < draft.phases.length - 1;

  let dayStart: number;
  if (isMiddleInsert) {
    dayStart = (draft.phases[insertAt].dayEnd ?? 0) + 1;
  } else {
    const latestKnownDayEnd = draft.phases.reduce((max, p) => (p.dayEnd != null ? Math.max(max, p.dayEnd) : max), 0);
    dayStart = latestKnownDayEnd + 1;
  }
  const dayEnd = dayStart + 13;
  const span = dayEnd - dayStart + 1;
  const newPhase: PhaseDraft = {
    id: nextDraftId(),
    phaseNumber: nextPhaseNumber(draft),
    name: "",
    included: true,
    isCustom: true,
    dayStart,
    dayEnd,
    deliverables: [],
  };

  const shiftedPhases = draft.phases.map((p, i) =>
    isMiddleInsert && i > insertAt
      ? { ...p, dayStart: p.dayStart != null ? p.dayStart + span : p.dayStart, dayEnd: p.dayEnd != null ? p.dayEnd + span : p.dayEnd }
      : p
  );

  const phases =
    insertAt === -1
      ? [...shiftedPhases, newPhase]
      : [...shiftedPhases.slice(0, insertAt + 1), newPhase, ...shiftedPhases.slice(insertAt + 1)];
  return { phases };
}

// Chat follow-up to task 249 — fixed-phases mode only: toggling a phase's `included` flag
// re-packs every currently-included phase's day range into a tight, gapless sequence starting at
// Day 1, in array order, each keeping its own current span (dayEnd - dayStart + 1). Unchecking
// Phase 1/Onboard now makes Phase 2 start at Day 1 instead of leaving a Day 1-15 gap; rechecking
// it pushes everything back out again — same for unchecking/rechecking any phase in between.
// Excluded phases keep whatever day range they last had (purely cosmetic while grayed out — never
// read at seed time, since an excluded phase's day range is never written to customer_phases).
// A full from-scratch recompute (not a delta shift) keeps this correct regardless of how many
// phases were already excluded before this toggle, without tracking prior state.
export function setPhaseIncluded(draft: PhasePlanDraft, phaseId: string, included: boolean): PhasePlanDraft {
  let cursor = 1;
  const phases = draft.phases.map((p) => {
    const next = p.id === phaseId ? { ...p, included } : p;
    if (!next.included || next.dayStart == null || next.dayEnd == null) return next;
    const span = next.dayEnd - next.dayStart + 1;
    const dayStart = cursor;
    const dayEnd = cursor + span - 1;
    cursor = dayEnd + 1;
    return { ...next, dayStart, dayEnd };
  });
  return { phases };
}

// Strips draft ids and blank rows before this becomes the API's `phase_plan` field. A phase with
// no name, or a deliverable with no name, is dropped entirely — half-filled rows left over from
// editing shouldn't be submitted as real phases/deliverables. `included: false` (task 244) drops
// the phase the same way an empty name would — this is how StackShift II's "generate default
// phases" mode lets a PM opt a phase out per project, without a dedicated skip field of its own
// (StackShift I's equivalent goes through `skipPhaseNumbersFromDraft` instead, since it
// never reaches this function — StackShift I's `phase_plan` is always omitted from the request).
// Task 252: free-form phases now always carry a real dayStart/dayEnd (see the phase builder's
// day-range control, mirroring fixed-phases mode's own) — the `?? 1`/`?? dayStart` fallback below
// only guards a phase somehow left mid-edit with a blank day field, matching customPhasesFromDraft's
// identical defensive pattern for StackShift I's own custom phases.
export function phasePlanDraftToInput(draft: PhasePlanDraft): PhasePlanInput {
  return {
    phases: draft.phases
      .filter((p) => p.included && p.name.trim())
      .map((p) => {
        const dayStart = p.dayStart ?? 1;
        const dayEnd = p.dayEnd ?? dayStart;
        const namedDeliverables = p.deliverables.filter((d) => d.name.trim());
        const dayRanges = applyDeliverableDayRanges(dayStart, dayEnd, namedDeliverables.length);
        return {
          name: p.name.trim(),
          dayStart,
          dayEnd,
          deliverables: namedDeliverables.map((d, i) => ({
            name: d.name.trim(),
            dayStart: dayRanges[i].dayStart,
            dayEnd: dayRanges[i].dayEnd,
            checklist: d.checklist.filter((c) => c.title.trim()).map((c) => ({ title: c.title.trim() })),
          })),
        };
      }),
  };
}

// Task 249 (Requirement D) — fixed-phases mode only: a day-range edit producing `dayEnd <
// dayStart`, a phase (any of them, not just the last — phases are allowed to run synchronously/
// overlap, so this is a pure ceiling check, not an ordering one) whose `dayEnd` runs past the
// card's own `durationDays`, or a phase span shorter than its own deliverable count (phase 2-5/
// customs only — Phase 1's deliverables are never redistributed, so its span isn't constrained by
// a deliverable count), keyed by PhaseDraft.id so _phase-builder.tsx can show the message inline
// next to the offending phase's own day inputs. Free-form mode has no day concept, so an empty map
// is correct there (callers only invoke this for a fixed-phases draft). `durationDays` is optional
// only so existing call sites that predate the duration check keep compiling — every real caller
// now passes the card's current durationDays.
export function phasePlanValidationErrors(draft: PhasePlanDraft, durationDays?: number): Map<string, string> {
  const errors = new Map<string, string>();
  for (const p of draft.phases) {
    if (!p.included || p.dayStart == null || p.dayEnd == null) continue;
    if (p.dayEnd < p.dayStart) {
      errors.set(p.id, "End day must be on or after the start day.");
      continue;
    }
    if (durationDays != null && p.dayEnd > durationDays) {
      errors.set(p.id, `This is more than the set total Programme duration (${durationDays} days) — please update accordingly.`);
      continue;
    }
    if (p.phaseNumber === 1) continue;
    const count = p.deliverables.filter((d) => d.name.trim()).length;
    const span = p.dayEnd - p.dayStart + 1;
    if (count > 0 && span < count) {
      errors.set(p.id, `Needs at least ${count} day${count === 1 ? "" : "s"} for ${count} deliverable${count === 1 ? "" : "s"}.`);
    }
  }
  return errors;
}

// Shared by programmeDurationError and extendLastPhaseToDuration below — the *last* included
// phase in the draft's own array order (not the one with the numerically highest dayEnd — phases
// can run synchronously/out of order by design) since that's the phase the Programme duration
// field is conceptually sized against.
function lastIncludedPhase(draft: PhasePlanDraft): PhaseDraft | undefined {
  for (let i = draft.phases.length - 1; i >= 0; i--) {
    if (draft.phases[i].included) return draft.phases[i];
  }
  return undefined;
}

// Task 249 follow-up — fixed-phases mode only: the reciprocal of the overflow check above, shown
// next to the Programme duration field itself rather than a phase's day inputs. Returns undefined
// once the PM has fixed either side (raised the duration or pulled the last phase's end day back
// in).
export function programmeDurationError(draft: PhasePlanDraft, durationDays: number): string | undefined {
  const last = lastIncludedPhase(draft);
  if (!last || last.dayEnd == null) return undefined;
  if (durationDays < last.dayEnd) {
    return `This is less than the last phase's target day (Day ${last.dayEnd}) — please update accordingly.`;
  }
  return undefined;
}

// Task 249 follow-up — fixed-phases mode only: when a PM raises the Programme duration past the
// last included phase's current end day, stretches that phase's dayEnd out to match instead of
// leaving a silent gap at the tail end of the programme nothing is scheduled into (deliverable day
// sub-ranges are a pure derivation off dayStart/dayEnd elsewhere — applyDeliverableDayRanges,
// called from _phase-builder.tsx — so they pick up the wider span automatically, no separate
// recompute needed here). Returns the draft unchanged with `extended: false` when there's no
// included phase, no dayEnd yet, or the duration hasn't actually grown past it — callers use
// `extended` to decide whether to surface a "last phase was stretched" notice, and
// `previousDayEnd` to word it.
export function extendLastPhaseToDuration(
  draft: PhasePlanDraft,
  durationDays: number
): { phasePlan: PhasePlanDraft; extended: boolean; previousDayEnd?: number } {
  const last = lastIncludedPhase(draft);
  if (!last || last.dayEnd == null || durationDays <= last.dayEnd) return { phasePlan: draft, extended: false };
  const previousDayEnd = last.dayEnd;
  const phases = draft.phases.map((p) => (p.id === last.id ? { ...p, dayEnd: durationDays } : p));
  return { phasePlan: { phases }, extended: true, previousDayEnd };
}

// Chat follow-up — both modes: an empty phase/deliverable/checklist-item name the PM added but
// never filled in (or never removed) would otherwise submit silently wrong — phasePlanDraftToInput,
// defaultPhaseOverridesFromDraft, and customPhasesFromDraft all just skip blank rows, which reads
// as "my edit vanished" rather than "remove this if you don't want it." Only flags entries with a
// real, user-editable name field: a default (non-custom) fixed-phase's name is static text, never
// blank/editable, so it's never flagged; every free-form phase, every custom fixed-phase, and
// every deliverable/checklist item in either mode are all covered. Keyed by the entity's own draft
// id — globally unique (nextDraftId() is a single shared counter across phases/deliverables/
// checklist items), so one flat map is safe. Iteration order matches the draft's own nesting
// (phase, then its deliverables, then each one's checklist), so the map's first entry is always
// the topmost offending field — callers use that to report/scroll to just the first one.
export type EmptyNameErrorKind = "phase" | "deliverable" | "checklist";
export type EmptyNameError = { phaseId: string; kind: EmptyNameErrorKind; message: string };

export function phasePlanEmptyNameErrors(draft: PhasePlanDraft, mode: "fixed-phases" | "free-form"): Map<string, EmptyNameError> {
  const errors = new Map<string, EmptyNameError>();
  for (const p of draft.phases) {
    const nameEditable = mode === "free-form" || p.isCustom;
    if (nameEditable && !p.name.trim()) {
      errors.set(p.id, { phaseId: p.id, kind: "phase", message: "Enter a phase name or remove this phase." });
    }
    for (const d of p.deliverables) {
      if (!d.name.trim()) {
        errors.set(d.id, { phaseId: p.id, kind: "deliverable", message: "Enter a deliverable name or remove this deliverable." });
      }
      for (const c of d.checklist) {
        if (!c.title.trim()) {
          errors.set(c.id, { phaseId: p.id, kind: "checklist", message: "Enter a checklist item or remove this item." });
        }
      }
    }
  }
  return errors;
}

// DOM id for the offending input itself (see the phase-name-/deliverable-name-/checklist-item-
// prefixed ids in _phase-builder.tsx) — kept alongside phasePlanEmptyNameErrors so the id scheme
// has one source of truth instead of being duplicated at every call site that needs to scroll to
// or render one of these fields.
export function emptyNameFieldId(id: string, kind: EmptyNameErrorKind): string {
  return kind === "phase" ? `phase-name-${id}` : kind === "deliverable" ? `deliverable-name-${id}` : `checklist-item-${id}`;
}
