"use client";

import { useEffect, useState } from "react";
import { isProgrammeComplete } from "@/lib/programme/programme-status";
import type { ProgrammePhaseRow } from "@/lib/programme/view-model";

// Task 277 — shared client hook for the uniform V2 header's phase-pill badge (Tasks/Issues/
// Milestones/Files/Access/Members/Status Report/Time Logs/Overview). Reuses the same
// `GET /api/projects/{id}/programme` endpoint the Timeline page (`_onboarding-detail.tsx`)
// already fetches for its own (fully-resolved, custom-phase-aware) swimlane — this hook only
// needs the active phase's number + name, not the full deliverable resolution Timeline does for
// its own body, so Timeline keeps computing its own `activePhaseNumber`/`activePhase` inline.
//
// The programme endpoint is staff-role-gated (admin/super_admin/marketing/pm/developer) — a
// client viewing their own v2 project 403s here, same as any other unauthorized/failed fetch:
// silently no-ops, leaving activePhaseNumber undefined so the caller's ProjectStatusBadge
// fallback renders instead.
export function useActivePhase(projectDbId: string, usesCustomerPhasesEngine: boolean) {
  const [phases, setPhases] = useState<ProgrammePhaseRow[]>([]);
  // Task 281 — true from mount until the fetch settles (success or failure), for
  // usesCustomerPhasesEngine projects only. Lets the header show a loading skeleton instead of
  // the wrong ProjectStatusBadge fallback while the real phase pill is still in flight.
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (!usesCustomerPhasesEngine) return;
    let cancelled = false;
    fetch(`/api/projects/${projectDbId}/programme`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled) return;
        if (data) setPhases(data.phases ?? []);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setSettled(true); });
    return () => { cancelled = true; };
  }, [projectDbId, usesCustomerPhasesEngine]);

  const activePhaseRow = phases.find((p) => p.status === "active");
  const activePhaseNumber = activePhaseRow?.phase_number ?? undefined;
  // Task 429: the unified row carries its own name, so a custom phase (6+) now resolves here too.
  const activePhaseName = activePhaseRow?.name;
  const isComplete = isProgrammeComplete(phases);
  const loading = usesCustomerPhasesEngine && !settled;

  return { activePhaseNumber, activePhaseName, isComplete, loading };
}
