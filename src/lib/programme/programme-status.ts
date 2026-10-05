import type { ProjectPhaseRow } from "@/types/database";

// Task 429 (WP1) — status helpers over the unified `project_phases` rows (replaces the ad-hoc checks that read
// `customer_phases.status`). Vocabulary: planned | active | completed | skipped (permanent exclusion) | bypassed (passed over
// by Jump to phase). Pure — takes any rows that carry `status` and an order.

export type PhaseStatus = ProjectPhaseRow["status"];
type Ordered = { status: PhaseStatus; position: number | null; phase_number: number | null };

/** Phases in programme order: `position` (the old `sort_order`), then `phase_number`. */
export function inProgrammeOrder<P extends Ordered>(phases: P[]): P[] {
  return [...phases].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || (a.phase_number ?? 0) - (b.phase_number ?? 0));
}

/** The one `active` phase (a partial unique index guarantees at most one per project for programme rows). */
export function activePhase<P extends Ordered>(phases: P[]): P | null {
  return phases.find((p) => p.status === "active") ?? null;
}

/** A phase that occupies no calendar days of its own: permanently excluded. (`bypassed` phases keep their days.) */
export const isPermanentlySkipped = (status: PhaseStatus) => status === "skipped";

/** Programme finished = the LAST phase (by order) is completed — same rule as before the unification. */
export function isProgrammeComplete<P extends Ordered>(phases: P[]): boolean {
  const ordered = inProgrammeOrder(phases);
  return ordered.length > 0 && ordered[ordered.length - 1].status === "completed";
}

/** Phases that count toward "N of M phases done": everything except permanent skips. */
export function countedPhases<P extends Ordered>(phases: P[]): P[] {
  return phases.filter((p) => !isPermanentlySkipped(p.status));
}
