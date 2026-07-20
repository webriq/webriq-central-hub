import { getPhaseByNumber } from "@/config/customer-phases";

// The Wizard only ever covers Phase 1 today (OnboardingWizard's STEPS = phase1.deliverables) —
// this constant is the single place that assumption lives. `phase=` is still carried through the
// URL (see stepKeyToWizardParams/wizardParamsToStepKey below) so a future multi-phase wizard
// doesn't require another URL redesign.
const WIZARD_PHASE_NUMBER = 1;

export type WizardStepParams = { phase: number; deliverable: number };

// Deliverable keys ("kickoff", "outcome-target", ...) are static text tied to the current
// config — encoding the 1-based position within the phase instead keeps the URL shape stable as
// deliverables are added/renamed/reordered in customer-phases.ts.
export function stepKeyToWizardParams(stepKey: string): WizardStepParams | null {
  const deliverables = getPhaseByNumber(WIZARD_PHASE_NUMBER).deliverables;
  const idx = deliverables.findIndex((d) => d.key === stepKey);
  if (idx < 0) return null;
  return { phase: WIZARD_PHASE_NUMBER, deliverable: idx + 1 };
}

// phase/deliverable come from an untrusted URL query string — getPhaseByNumber throws on an
// unknown phase number, so validate against the one phase the Wizard actually supports rather
// than passing the raw value through.
export function wizardParamsToStepKey(phase: number | null | undefined, deliverable: number | null | undefined): string | undefined {
  if (phase !== WIZARD_PHASE_NUMBER || !deliverable) return undefined;
  const deliverables = getPhaseByNumber(WIZARD_PHASE_NUMBER).deliverables;
  return deliverables[deliverable - 1]?.key;
}

export const FIRST_WIZARD_STEP_PARAMS: WizardStepParams = { phase: WIZARD_PHASE_NUMBER, deliverable: 1 };
