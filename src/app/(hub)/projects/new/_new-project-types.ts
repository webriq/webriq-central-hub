import {
  type Classification,
  type CustomPhaseSeed,
  type DefaultPhaseOverride,
  applyDeliverableDayRanges,
  slugifyDeliverableKey,
} from "@/config/customer-phases";
import {
  type PhaseDraft,
  type PhasePlanDraft,
  defaultPhasePlanDraft,
  emptyPhasePlanDraft,
} from "@/lib/programme/phase-plan-draft";

// Task 357: the draft-plan types + pure helpers (PhasePlanDraft, defaultPhasePlanDraft,
// phasePlanDraftToInput, phasePlanValidationErrors, phasePlanEmptyNameErrors, setPhaseIncluded,
// extendLastPhaseToDuration, programmeDurationError, addCustomPhaseDraft, nextDraftId, …) moved
// to `@/lib/programme/phase-plan-draft` so the same PhaseBuilder UI can also drive the StackShift
// Orders convert dialog. Re-exported here verbatim so every existing wizard import site keeps
// resolving unchanged.
export * from "@/lib/programme/phase-plan-draft";

// ─── customer_phases-engine wire converters ───────────────────────────────────
// These stay wizard-local: they translate a fixed-phases draft into the `skip_phase_numbers` /
// `custom_phases` / `default_phase_overrides` shapes POST /api/onboarding/projects expects for a
// project on the specialized customer_phases engine (StackShift I always, StackShift II when its
// "generate default" checkbox is on). The convert flow never uses them — a StackShift I convert
// only ever marks the engine as a draft with empty config.

// StackShift I only (task 244): its phases never travel through `phase_plan` (task 239 keeps
// StackShift I on the specialized `customer_phases` engine) — this instead derives the
// `skip_phase_numbers` the API expects, from a fixed-phases draft's `included` flags. Task 246:
// now reads `phaseNumber` directly (stable identity) instead of array position+1 — the old
// index-based derivation was exact only because fixed-phases mode never added/reordered phases;
// once custom phases can be inserted anywhere, position no longer equals phase number.
export function skipPhaseNumbersFromDraft(draft: PhasePlanDraft): number[] {
  return draft.phases.filter((p) => !p.included).map((p) => p.phaseNumber);
}

// Task 246 — StackShift I (and, once re-pointed, StackShift II's default-phases mode) only:
// extracts the PM-added custom phases from a fixed-phases draft into the API's `custom_phases`
// shape. sortOrder is a fractional value positioned between the phase_numbers of the nearest
// preceding/following non-custom phase in the draft's own array order (e.g. 2.5 = "between phase
// 2 and phase 3") — the server (seed.ts's buildSeedPhaseEntries) normalizes this to a dense
// integer sequence before writing sort_order, so exact precision here only needs to preserve
// relative order. Consecutive custom phases in the same gap are evenly subdivided.
export function customPhasesFromDraft(draft: PhasePlanDraft): CustomPhaseSeed[] {
  const results: CustomPhaseSeed[] = [];
  let i = 0;
  while (i < draft.phases.length) {
    if (!draft.phases[i].isCustom) {
      i++;
      continue;
    }
    const runStart = i;
    while (i < draft.phases.length && draft.phases[i].isCustom) i++;
    const run = draft.phases.slice(runStart, i);
    const prevNumber = runStart > 0 ? draft.phases[runStart - 1].phaseNumber : 0;
    const nextNumber = i < draft.phases.length ? draft.phases[i].phaseNumber : prevNumber + 1;
    const step = (nextNumber - prevNumber) / (run.length + 1);
    run.forEach((p, j) => {
      const dayStart = p.dayStart ?? 1;
      const dayEnd = p.dayEnd ?? dayStart;
      // Task 249: a custom phase is never "Onboard" (always phaseNumber 6+), so its deliverables'
      // day sub-ranges are always computed via the same largest-remainder distribution phase 2-5
      // defaults use — applyDeliverableDayRanges, in array order.
      const deliverableNames = p.deliverables.filter((d) => d.name.trim());
      const dayRanges = applyDeliverableDayRanges(dayStart, dayEnd, deliverableNames.length);
      results.push({
        phaseNumber: p.phaseNumber,
        sortOrder: prevNumber + step * (j + 1),
        name: p.name.trim() || `Custom Phase ${p.phaseNumber}`,
        dayStart,
        dayEnd,
        deliverables: deliverableNames.map((d, i) => ({ name: d.name.trim(), dayStart: dayRanges[i].dayStart, dayEnd: dayRanges[i].dayEnd })),
      });
    });
  }
  return results;
}

// Task 249 — customer_phases engine only: the PM-edited day range (every phase) and, for phase
// numbers 2-5, the computed deliverable day sub-ranges, for every INCLUDED default phase in a
// fixed-phases draft. Always emitted for every included default (not just ones the PM actually
// edited) — the seed-time write only actually sets day_start_override/day_end_override when a
// value differs from PROGRAMME_PHASES' own static default (see seed.ts's buildSeedPhaseEntries),
// so sending an unedited phase's (== static) values here is harmless and keeps this function
// simple, while guaranteeing the wizard's displayed day badges and the eventually-seeded rows can
// never drift apart. Phase 1/Onboard never gets a `deliverables` array (its ranges are never
// redistributed, per the request) — only its own phase-level day range, when present.
export function defaultPhaseOverridesFromDraft(draft: PhasePlanDraft): DefaultPhaseOverride[] {
  return draft.phases
    .filter((p): p is PhaseDraft & { dayStart: number; dayEnd: number } => !p.isCustom && p.included && p.dayStart != null && p.dayEnd != null)
    .map((p) => {
      if (p.phaseNumber === 1) return { phaseNumber: p.phaseNumber, dayStart: p.dayStart, dayEnd: p.dayEnd };
      const deliverableNames = p.deliverables.filter((d) => d.name.trim());
      const dayRanges = applyDeliverableDayRanges(p.dayStart, p.dayEnd, deliverableNames.length);
      return {
        phaseNumber: p.phaseNumber,
        dayStart: p.dayStart,
        dayEnd: p.dayEnd,
        deliverables: deliverableNames.map((d, i) => ({
          key: d.key ?? slugifyDeliverableKey(d.name.trim(), i),
          dayStart: dayRanges[i].dayStart,
          dayEnd: dayRanges[i].dayEnd,
        })),
      };
    });
}

// Task 251 — every card, not just fixed-phases: the "Scheduled start" field has no validation
// today beyond the DateTimePicker's own day-granularity min/max, which lets a PM leave it empty
// or pick today's date with a time already in the past (min/max only disable whole calendar
// days, not times within the allowed range) and still advance past Step 3. scheduleMin is the
// wizard-level "now" captured once at mount (_content.tsx's scheduleMin, also passed to every
// card's own DateTimePicker) — reused here instead of re-reading Date.now() so the bound stays
// stable for the wizard session, same as the picker's own min prop.
export function scheduledStartError(
  startMode: TypeCardState["startMode"],
  scheduledStartAt: string,
  scheduleMin: Date
): string | undefined {
  if (startMode !== "scheduled") return undefined;
  if (!scheduledStartAt) return "Pick a date and time for the scheduled start.";
  const picked = new Date(scheduledStartAt);
  if (Number.isNaN(picked.getTime()) || picked < scheduleMin) {
    return "Scheduled start must be in the future.";
  }
  return undefined;
}

// ─── Per-type config card state ────────────────────────────────────────────────

export type TypeCardState = {
  classification: Classification;
  projectName: string;
  projectNameTouched: boolean;
  projectNameError: string;
  checkingName: boolean;
  // PipelineForge add-on. Always `true` and locked when classification is "StackShift II" —
  // enforced at render time (TypeConfigCard), not here, so this field alone doesn't imply lock
  // state.
  pipelineforgeAddon: boolean;
  // Task 244: meaningful for every classification now, not just StackShift I. For a card on the
  // customer_phases engine (StackShift I always; StackShift II when useDefaultPhases is on, task
  // 246 Requirement G) this drives `programme_duration_days`, the engine's real day-count. For
  // every other card it's display-only metadata shown on the Review step — those seed generic
  // `milestones` with real dates, not an abstract day count (task 239's design, unchanged here).
  durationDays: number;
  // Only meaningful for "StackShift II" — ignored for every other classification.
  useDefaultPhases: boolean;
  phasePlan: PhasePlanDraft;
  // Task 244: per-card start control, replacing the old single wizard-level scheduledAt/mode
  // applied uniformly to every card in a submission. "draft" = create only (API `mode: "save"`,
  // preserves the pre-244 "Just save" capability per-card); "now" = start immediately (`"start"`,
  // the default); "scheduled" = deferred start (`"save_scheduled"`, requires `scheduledStartAt`).
  startMode: "draft" | "now" | "scheduled";
  scheduledStartAt: string;
  // StackShift I + canManagePhases roles only — mirrors the pre-244 page-level "Start at phase N"
  // admin override, now scoped per card. Ignored (and never sent) for any other classification or
  // when `startMode !== "now"`. Widened from `1|2|3|4|5` (task 246) — the dropdown's options now
  // come from this card's own phasePlan (defaults + any customs), driven by phaseNumber identity.
  startPhase: number;
};

export function initTypeCardState(classification: Classification): TypeCardState {
  const isStackShiftI = classification === "StackShift I";
  const isStackShiftII = classification === "StackShift II";
  return {
    classification,
    projectName: "",
    projectNameTouched: false,
    projectNameError: "",
    checkingName: false,
    pipelineforgeAddon: isStackShiftII, // auto-included + locked for StackShift II only
    durationDays: 120,
    useDefaultPhases: true,
    phasePlan: isStackShiftI || isStackShiftII ? defaultPhasePlanDraft() : emptyPhasePlanDraft(),
    startMode: "now",
    scheduledStartAt: "",
    startPhase: 1,
  };
}

export const PRIMARY_TYPES: Classification[] = ["StackShift I", "StackShift II", "StackShift Access", "StackShift Access Plus", "Discrete Development"];
