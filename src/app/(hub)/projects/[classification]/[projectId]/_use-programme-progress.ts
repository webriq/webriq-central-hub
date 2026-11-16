"use client";

import { useEffect, useState } from "react";
import { currentDisplayDay, phaseAtDisplayDay } from "@/lib/programme/calendar";
import { isProgrammeComplete } from "@/lib/programme/programme-status";
import { buildDisplayPhases, uiPhaseStatus, type ProgrammeDeliverableRow, type ProgrammePhaseRow } from "@/lib/programme/view-model";
import type { Project } from "@/app/(hub)/projects-old/_pm-shared";

// Task 281 — Overview tab's "N-Day Programme Progress" card (moved here from Timeline) needs the
// exact same day-compression-aware stats Timeline computes inline from `phases`/`deliverables`
// (see `_onboarding-detail.tsx`'s own computation, ~lines 1892-1986). Rather than re-deriving that
// skip-phase-compression math independently (task 253's `compressReferenceDay`/`scaleDay`, with
// several documented edge cases), this hook calls the exact same shared `@/config/customer-phases`
// functions Timeline calls, on a fresh fetch of the same `GET /api/projects/{id}/programme`
// endpoint `useActivePhase` already uses — guaranteed to agree with Timeline's numbers since both
// read the same source functions, just gated behind their own fetch instead of sharing state
// across route boundaries (Overview and Timeline are separate pages/requests).
export function useProgrammeProgress(project: Project) {
  const [phases, setPhases] = useState<ProgrammePhaseRow[]>([]);
  const [deliverables, setDeliverables] = useState<ProgrammeDeliverableRow[]>([]);
  const [settled, setSettled] = useState(false);

  const applicable = project.uses_customer_phases_engine && !!project.programme_started_at;

  useEffect(() => {
    if (!applicable) return;
    let cancelled = false;
    fetch(`/api/projects/${project.id}/programme`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data) {
          setPhases(data.phases ?? []);
          setDeliverables(data.deliverables ?? []);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSettled(true); });
    return () => { cancelled = true; };
  }, [applicable, project.id]);

  const loading = applicable && !settled;

  if (!applicable || !project.programme_started_at || !settled || phases.length === 0) {
    return { loading, ready: false as const };
  }

  const programmeDurationDays = project.programme_duration_days ?? 120;
  const currentDay = currentDisplayDay(project.programme_started_at);
  const startDate = new Date(project.programme_started_at);
  const orderedPhases = buildDisplayPhases(phases, deliverables);
  const activePhaseNumber = phases.find((p) => p.status === "active")?.phase_number
    ?? phaseAtDisplayDay(currentDay, programmeDurationDays).number;
  const isComplete = isProgrammeComplete(phases);
  const phaseStatusMap = new Map(phases.map((p) => [p.phase_number, uiPhaseStatus(p.status)]));
  // Stored days are already display-scale and skip-compressed: the grid length is the last planned display day (permanently skipped phases excluded).
  const permanentlySkipped = new Set(phases.filter((p) => p.status === "skipped").map((p) => p.phase_number));
  const visibleDurationDays = Math.max(1, ...orderedPhases.filter((p) => !permanentlySkipped.has(p.number)).map((p) => p.dayEnd));
  const progressPct = Math.min(100, Math.round((currentDay / visibleDurationDays) * 100));
  const programmeOverdue = !isComplete && currentDay > visibleDurationDays;
  const daysOverdue120 = currentDay - visibleDurationDays;
  const totalDeliverables = orderedPhases
    .filter((p) => phaseStatusMap.get(p.number) !== "skipped")
    .reduce((s, p) => s + p.deliverables.length, 0);
  const doneDeliverables = deliverables.filter((d) => d.status === "done").length;
  const phasesCompleted = phases.filter((p) => p.status === "completed").length;
  const daysRemaining = Math.max(0, visibleDurationDays - currentDay);

  return {
    loading, ready: true as const,
    visibleDurationDays, currentDay, startDate, progressPct, programmeOverdue, daysOverdue120,
    isComplete, activePhaseNumber, daysRemaining, phasesCompleted, doneDeliverables, totalDeliverables,
  };
}
