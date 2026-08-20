"use client";

import { useEffect, useState } from "react";
import {
  getCurrentProgrammeDay, getPhaseForDay, resolveEffectivePhase, compressReferenceDay,
  scaleDay, unscaleDay,
} from "@/config/customer-phases";
import type { CustomerPhaseRow, CustomerDeliverableRow } from "@/types/database";
import type { Project } from "@/app/(hub)/projects-old/_pm-shared";
import { TOTAL_DAYS } from "./_onboarding-detail";

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
  const [phases, setPhases] = useState<CustomerPhaseRow[]>([]);
  const [deliverables, setDeliverables] = useState<CustomerDeliverableRow[]>([]);
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
  const currentDay = getCurrentProgrammeDay(project.programme_started_at);
  const startDate = new Date(project.programme_started_at);
  const sortedPhaseRows = [...phases].sort((a, b) => a.sort_order - b.sort_order);
  const deliverablesByPhaseNumber = new Map<number, CustomerDeliverableRow[]>();
  for (const d of deliverables) {
    if (!deliverablesByPhaseNumber.has(d.phase_number)) deliverablesByPhaseNumber.set(d.phase_number, []);
    deliverablesByPhaseNumber.get(d.phase_number)!.push(d);
  }
  const orderedPhases = sortedPhaseRows.map((p) => resolveEffectivePhase(p, deliverablesByPhaseNumber.get(p.phase_number) ?? []));
  const activePhaseNumber = phases.find((p) => p.status === "active")?.phase_number
    ?? getPhaseForDay(unscaleDay(currentDay, programmeDurationDays)).number;
  const isComplete = sortedPhaseRows.length > 0 && sortedPhaseRows[sortedPhaseRows.length - 1].status === "completed";
  const phaseStatusMap = new Map(phases.map((p) => [p.phase_number, p.status]));
  const startedSkipNumbers = project.draft_skip_phase_numbers ?? [];
  const visibleTotalDays = compressReferenceDay(TOTAL_DAYS, orderedPhases, startedSkipNumbers);
  const visibleDurationDays = scaleDay(visibleTotalDays, programmeDurationDays);
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
