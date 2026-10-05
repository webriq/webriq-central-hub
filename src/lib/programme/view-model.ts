import { PROGRAMME_PHASES, type DeliverableConfig, type PhaseConfig } from "@/config/customer-phases";
import type { PhaseProgrammeStateRow, ProjectDeliverableRow, ProjectPhaseRow } from "@/types/database";
import { inProgrammeOrder } from "./programme-status";

// Task 429 (WP5) — the wire/view shapes the Timeline, Overview card, wizard and active-phase hook consume, plus the pure builder that
// turns them into render-ready `PhaseConfig`s. Rows already carry DISPLAY-scale, skip-compressed days (decision D-B), so there is no
// reference → compressed → display pipeline on the client any more: what is stored is what is drawn.

/** A unified programme phase row with its programme-state columns flattened in (what `GET …/programme` returns). */
export type ProgrammePhaseRow = Omit<ProjectPhaseRow, "phase_number"> & { phase_number: number } & Pick<PhaseProgrammeStateRow, "wizard_data" | "is_manual_override" | "override_note" | "delay_note">;
/** A unified programme deliverable row plus its phase's `phase_number` (rows only carry `phase_id`). */
export type ProgrammeDeliverableRow = Omit<ProjectDeliverableRow, "deliverable_key"> & { deliverable_key: string; phase_number: number };

/** Server-side flattening used by every route that returns programme rows (pure, shared with the checks). */
export function toWire(phases: (ProjectPhaseRow & { state: PhaseProgrammeStateRow | null; deliverables: ProjectDeliverableRow[] })[]): {
  phases: ProgrammePhaseRow[];
  deliverables: ProgrammeDeliverableRow[];
} {
  return {
    phases: phases.map(({ state, deliverables: _deliverables, ...phase }) => ({
      ...phase,
      phase_number: phase.phase_number ?? 0, // programme rows always carry one (backfill reconciliation asserts it)
      wizard_data: state?.wizard_data ?? {},
      is_manual_override: state?.is_manual_override ?? false,
      override_note: state?.override_note ?? null,
      delay_note: state?.delay_note ?? null,
    })),
    deliverables: phases.flatMap((p) => p.deliverables.map((d) => ({ ...d, deliverable_key: d.deliverable_key ?? d.id, phase_number: p.phase_number ?? 0 }))),
  };
}

/** Status vocabulary the Swimlane/legacy UI components use. A time-bypassed phase renders like a skipped one, as it did before. */
export function uiPhaseStatus(status: ProjectPhaseRow["status"]): "not_started" | "active" | "completed" | "skipped" {
  return status === "planned" ? "not_started" : status === "bypassed" ? "skipped" : status;
}

export type DisplayPhase = PhaseConfig & { sortOrder: number };

/** Programme-ordered, render-ready phases (display-scale days) with their deliverables. */
export function buildDisplayPhases(phases: ProgrammePhaseRow[], deliverables: ProgrammeDeliverableRow[]): DisplayPhase[] {
  const byPhase = new Map<string, ProgrammeDeliverableRow[]>();
  for (const d of deliverables) {
    if (d.phase_id) (byPhase.get(d.phase_id) ?? byPhase.set(d.phase_id, []).get(d.phase_id)!).push(d);
  }
  return inProgrammeOrder(phases).map((p): DisplayPhase => {
    const number = p.phase_number;
    const staticPhase = PROGRAMME_PHASES.find((s) => s.number === number);
    const rows = [...(byPhase.get(p.id) ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return {
      number,
      name: p.name,
      shortName: staticPhase && staticPhase.name === p.name ? staticPhase.shortName : p.name,
      dayStart: p.day_start ?? 1,
      dayEnd: p.day_end ?? 1,
      owner: p.owner_label ?? staticPhase?.owner ?? "",
      sortOrder: p.position ?? 0,
      deliverables: rows.map(
        (d): DeliverableConfig => ({
          key: d.deliverable_key,
          name: d.name,
          description: d.description ?? "",
          dayStart: d.day_start ?? p.day_start ?? 1,
          dayEnd: d.day_end ?? p.day_end ?? 1,
          owner: d.owner_label ?? "",
        })
      ),
    };
  });
}
