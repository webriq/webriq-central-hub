// Shared types for the status report GET payload — consumed by the API route and every
// component under this folder. Re-exports the derive-function types from status-report.ts so
// there's exactly one definition of PhaseDerived/HealthTone/PhaseStatus.
import type { PhaseDerived, HealthTone, PhaseStatus, PhaseAssigneeMember } from "@/lib/programme/status-report";

export type { PhaseDerived, HealthTone, PhaseStatus, PhaseAssigneeMember };

export type ProjectStatusReportItem = {
  id: string; // project UUID
  projectId: string | null; // human-readable display code, may be null on legacy rows
  projectName: string;
  companyName: string;
  customerId: string;
  classification: string | null;
  programmeStartedAt: string;
  currentProgrammeDay: number;
  programmeDaysLeft: number; // days remaining in the 120-day programme overall
  currentPhase: PhaseDerived;
  health: HealthTone; // worst health across all phases
  phases: PhaseDerived[]; // all 5, in order
  isFullyCompleted: boolean; // Phase 5 (Optimize) status === "completed"
};

export type StatusReportResponse = {
  projects: ProjectStatusReportItem[];
  canEditNotes: boolean;
};

export const HEALTH_LABEL: Record<Exclude<HealthTone, null>, string> = {
  on_track: "On track",
  at_risk: "At risk",
  needs_attention: "Needs attention",
  ahead_of_schedule: "Ahead of schedule",
};

export const STATUS_LABEL: Record<PhaseStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  completed: "Completed",
  overdue: "Overdue",
  skipped: "Skipped",
};

// Combines the old separate "Overdue" column into the Used/Alloted cell: overdue (or a completed
// phase that ran over its allotment) shows red, an in-progress-not-overdue phase shows blue days
// remaining, a phase completed within its allotment shows green days ahead. Exactly-on-allotment
// completions and pending/skipped phases get plain, uncolored text.
export function formatUsedAlloted(phase: PhaseDerived): { text: string; className: string } {
  const base = `${phase.usedDays}/${phase.allotedDays}d`;
  if (phase.status === "overdue" || (phase.status === "completed" && phase.daysOverdue > 0)) {
    return { text: `${base} (${phase.daysOverdue}d overdue)`, className: "text-[#C0392B] font-semibold" };
  }
  if (phase.status === "in_progress" && phase.daysRemaining !== null) {
    return { text: `${base} (${phase.daysRemaining}d remaining)`, className: "text-[#007BFF] font-semibold" };
  }
  if (phase.status === "completed" && phase.usedDays < phase.allotedDays) {
    const daysAhead = phase.allotedDays - phase.usedDays;
    return { text: `${base} (${daysAhead}d ahead)`, className: "text-[#177E48] font-semibold" };
  }
  return { text: base, className: "text-[#3A4565]" };
}
