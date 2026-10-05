// Task 221 — Portfolio Tracker status report derive functions. Pure (no DB access): every
// function here takes plain data in and returns derived fields, so the API route and every UI
// component share exactly one implementation of "what does overdue/health/days mean" instead of
// each recomputing it slightly differently.
//
// Overdue is measured per phase against how many days that phase *actually used*
// (actual_start_date -> actual_completed_date, or -> today if still open), not against the
// static PROGRAMME_PHASES calendar window. A phase that starts late because an earlier phase ran
// long isn't penalized for that — its own clock starts when it actually starts. This also means a
// phase can finish in fewer days than its allotment (e.g. Onboard done in 10 of its 15 days) or
// more (used > allotted), which is the whole point of the Used/Allotted + Overdue columns.

import { PROGRAMME_PHASES } from "@/config/customer-phases";
import type { PhaseSummary } from "@/lib/programme/store";
import { inProgrammeOrder } from "@/lib/programme/programme-status";
import { currentDisplayDay } from "@/lib/programme/calendar";

export type PhaseStatus = "pending" | "in_progress" | "completed" | "overdue" | "skipped";
export type HealthTone = "on_track" | "at_risk" | "needs_attention" | "ahead_of_schedule" | null;

// Tunable thresholds — see task 221 doc's "Key Design Decisions" for the rationale. Adjust here
// only; nothing else hardcodes these numbers.
export const RISK_THRESHOLD_DAYS_OVERDUE = 3; // more than this many days over allotment => needs_attention
export const RISK_THRESHOLD_DAYS_REMAINING = 2; // an active phase with this many allotted days or fewer left...
export const RISK_THRESHOLD_DELIVERABLE_RATIO = 0.5; // ...and below this deliverable-completion ratio => early-warning at_risk

// Static fallback (120) — used only when a project's actual phase set isn't available. Task 246:
// a project's real total can now exceed this once a custom phase pushes past day 120;
// buildPhaseBreakdown below derives the real per-project total from phaseRows instead of assuming
// this constant, and returns it as totalProgrammeDays.
export const TOTAL_PROGRAMME_DAYS = PROGRAMME_PHASES[PROGRAMME_PHASES.length - 1].dayEnd;

// Fallback text shown when a phase has no real phase_members assignee yet — generic role-team
// labels, deliberately distinct from PROGRAMME_PHASES[n].owner (that config's labels are
// illustrative example names like "Bert"/"Erica + April" used elsewhere in the app; these are the
// status report's own placeholder vocabulary, per task 221 follow-up).
export const ASSIGNEE_PLACEHOLDER: Record<number, string> = {
  1: "Marketing",
  2: "PM + Dev",
  3: "PM + SEO",
  4: "PM + SEO",
  5: "PM + Dev",
};

export function programmeDaysLeft(currentProgrammeDay: number, totalProgrammeDays: number = TOTAL_PROGRAMME_DAYS): number {
  return Math.max(0, totalProgrammeDays - currentProgrammeDay);
}

// Task 429 (WP3): rows come from the unified `project_phases` (+ state delay note) via store.loadProgrammeSummaries. Day values are
// already display-scale and skip-compressed, so no per-row override resolution happens here any more.
export type StatusPhaseRow = Pick<
  PhaseSummary,
  "phase_number" | "name" | "status" | "position" | "day_start" | "day_end" | "actual_start_date" | "actual_completed_date" | "owner_label" | "delay_note"
>;

export type PhaseAssigneeMember = { id: string; fullName: string; roleLabel: string; avatarUrl: string | null };

export type PhaseDerived = {
  phaseNumber: number;
  name: string;
  dayStart: number;
  dayEnd: number;
  allotedDays: number;
  usedDays: number; // 0 when the phase hasn't started yet (or was skipped)
  assigneeMembers: PhaseAssigneeMember[];
  assigneePlaceholder: string; // shown when assigneeMembers is empty
  status: PhaseStatus;
  actualStartDate: string | null;
  actualCompletedDate: string | null;
  daysOverdue: number; // usedDays beyond allotedDays — computed whenever usedDays is known, regardless of status (a completed phase can still show it ran over)
  daysRemaining: number | null; // only set when status === "in_progress"
  health: HealthTone;
  delayNote: string | null;
};

// Local-midnight date diffing (matches getCurrentProgrammeDay's own approach in
// customer-phases.ts) so a start/end pair on the same calendar day still counts as 1 day used,
// not 0 from a same-instant subtraction.
function daysBetweenInclusive(startIso: string, endIso: string): number {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const diff = Math.round((endDay.getTime() - startDay.getTime()) / 86_400_000);
  return Math.max(1, diff + 1);
}

// null means the phase hasn't actually started yet — there's nothing to measure.
export function computeUsedDays(actualStartDate: string | null, actualCompletedDate: string | null): number | null {
  if (!actualStartDate) return null;
  return daysBetweenInclusive(actualStartDate, actualCompletedDate ?? new Date().toISOString());
}

export function derivePhaseStatus(row: StatusPhaseRow | undefined, allotedDays: number, usedDays: number | null): PhaseStatus {
  const dbStatus = row?.status ?? "planned";
  if (dbStatus === "completed") return "completed";
  // A time-bypassed phase (Jump to phase) reports the same as a permanently skipped one, as it did before the unification.
  if (dbStatus === "skipped" || dbStatus === "bypassed") return "skipped";
  if (dbStatus === "active") {
    return usedDays !== null && usedDays > allotedDays ? "overdue" : "in_progress";
  }
  return "pending";
}

export function derivePhaseHealth(
  status: PhaseStatus,
  daysOverdue: number,
  daysRemaining: number | null,
  deliverableRatio: number | null,
  isEarlyCompletion: boolean
): HealthTone {
  if (status === "overdue") {
    return daysOverdue > RISK_THRESHOLD_DAYS_OVERDUE ? "needs_attention" : "at_risk";
  }
  if (status === "in_progress") {
    const nearingDeadline = daysRemaining !== null && daysRemaining <= RISK_THRESHOLD_DAYS_REMAINING;
    const behindOnDeliverables = deliverableRatio !== null && deliverableRatio < RISK_THRESHOLD_DELIVERABLE_RATIO;
    return nearingDeadline && behindOnDeliverables ? "at_risk" : "on_track";
  }
  // A completed phase that finished within its allotment gets a green flag; on-time or
  // over-allotment completions (and skipped/pending phases) have nothing to warn or celebrate.
  if (status === "completed" && isEarlyCompletion) return "ahead_of_schedule";
  return null;
}

const HEALTH_RANK: Record<Exclude<HealthTone, null>, number> = {
  on_track: 0,
  ahead_of_schedule: 0,
  at_risk: 1,
  needs_attention: 2,
};

// Worst health across a project's phases — used for the collapsed row's single health chip.
export function rollupHealth(healths: HealthTone[]): HealthTone {
  let worst: HealthTone = null;
  for (const h of healths) {
    if (!h) continue;
    if (!worst || HEALTH_RANK[h] > HEALTH_RANK[worst]) worst = h;
  }
  return worst;
}

export type ProjectPhaseInputs = {
  programmeStartedAt: string;
  phaseRows: StatusPhaseRow[]; // 0-N rows, one per started/touched phase
  deliverableRatioByPhase: Record<number, number | null>; // phase_number -> done/total, null if no deliverables tracked yet
  assigneesByPhase: Record<number, PhaseAssigneeMember[]>;
};

export type ProjectPhaseBreakdown = {
  currentProgrammeDay: number;
  totalProgrammeDays: number;
  phases: PhaseDerived[];
};

// Iterates the project's own phaseRows (defaults + any customs) — a custom phase gets a report row too, and totalProgrammeDays is this
// project's actual last display day. Falls back to PROGRAMME_PHASES when phaseRows is empty (not yet seeded).
type ResolvedPhase = { number: number; name: string; dayStart: number; dayEnd: number; owner: string };
export function buildPhaseBreakdown(inputs: ProjectPhaseInputs): ProjectPhaseBreakdown {
  const orderedRows = inProgrammeOrder(inputs.phaseRows);
  const resolvedPhases: ResolvedPhase[] =
    orderedRows.length > 0
      ? orderedRows.map((r) => ({
          number: r.phase_number ?? 0,
          name: r.name,
          dayStart: r.day_start ?? 0,
          dayEnd: r.day_end ?? 0,
          owner: r.owner_label ?? "Team",
        }))
      : PROGRAMME_PHASES;
  const totalProgrammeDays = orderedRows.length > 0 ? resolvedPhases.reduce((max, p) => Math.max(max, p.dayEnd), 0) || TOTAL_PROGRAMME_DAYS : TOTAL_PROGRAMME_DAYS;
  const currentProgrammeDay = currentDisplayDay(inputs.programmeStartedAt, totalProgrammeDays);
  const rowByPhaseNumber = new Map(inputs.phaseRows.map((r) => [r.phase_number, r]));

  const phases = resolvedPhases.map((phase): PhaseDerived => {
    const row = rowByPhaseNumber.get(phase.number);
    const allotedDays = phase.dayEnd - phase.dayStart + 1;
    const usedDays = computeUsedDays(row?.actual_start_date ?? null, row?.actual_completed_date ?? null);
    const status = derivePhaseStatus(row, allotedDays, usedDays);
    const daysOverdue = Math.max(0, (usedDays ?? 0) - allotedDays);
    const daysRemaining = status === "in_progress" ? Math.max(0, allotedDays - (usedDays ?? 0)) : null;
    const deliverableRatio = inputs.deliverableRatioByPhase[phase.number] ?? null;
    const isEarlyCompletion = status === "completed" && usedDays !== null && usedDays < allotedDays;
    const health = derivePhaseHealth(status, daysOverdue, daysRemaining, deliverableRatio, isEarlyCompletion);

    return {
      phaseNumber: phase.number,
      name: phase.name,
      dayStart: phase.dayStart,
      dayEnd: phase.dayEnd,
      allotedDays,
      usedDays: usedDays ?? 0,
      assigneeMembers: inputs.assigneesByPhase[phase.number] ?? [],
      assigneePlaceholder: ASSIGNEE_PLACEHOLDER[phase.number] ?? phase.owner,
      status,
      actualStartDate: row?.actual_start_date ?? null,
      actualCompletedDate: row?.actual_completed_date ?? null,
      daysOverdue,
      daysRemaining,
      health,
      delayNote: row?.delay_note ?? null,
    };
  });

  return { currentProgrammeDay, totalProgrammeDays, phases };
}

// The phase to headline in the collapsed table row — the first non-completed/non-skipped phase
// in order, or the last phase if everything is done (nothing left to call "current").
export function currentPhaseOf(phases: PhaseDerived[]): PhaseDerived {
  return phases.find((p) => p.status !== "completed" && p.status !== "skipped") ?? phases[phases.length - 1];
}
