"use client";

import { useEffect, useState } from "react";
import { PROGRAMME_PHASES } from "@/config/customer-phases";
import type { CustomerPhaseRow } from "@/types/database";

// Task 277 — shared client hook for the uniform V2 header's phase-pill badge (Tasks/Issues/
// Milestones/Files/Access/Members/Status Report/Time Logs/Overview). Reuses the same
// `GET /api/projects/{id}/programme` endpoint the Timeline page (`_onboarding-detail.tsx`)
// already fetches for its own (fully-resolved, custom-phase-aware) swimlane — this hook only
// needs the phase number + a static `PROGRAMME_PHASES` name lookup, not the full
// `resolveEffectivePhase`/`customer_deliverables` resolution Timeline does for its own body, so
// Timeline keeps computing its own `activePhaseNumber`/`activePhase` inline instead of using this
// hook. A custom phase's display name (task 246, phase 6+) won't resolve here — falls back to
// `undefined` (header shows the ProjectStatusBadge fallback instead), a deliberate scope
// simplification, not a bug.
//
// The programme endpoint is staff-role-gated (admin/super_admin/marketing/pm/developer) — a
// client viewing their own v2 project 403s here, same as any other unauthorized/failed fetch:
// silently no-ops, leaving activePhaseNumber undefined so the caller's ProjectStatusBadge
// fallback renders instead.
export function useActivePhase(projectDbId: string, usesCustomerPhasesEngine: boolean) {
  const [phases, setPhases] = useState<CustomerPhaseRow[]>([]);
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
  const activePhaseNumber = activePhaseRow?.phase_number;
  const activePhaseName = activePhaseNumber !== undefined
    ? PROGRAMME_PHASES.find((p) => p.number === activePhaseNumber)?.name
    : undefined;
  const isComplete = phases.length > 0 && [...phases].sort((a, b) => a.sort_order - b.sort_order).at(-1)?.status === "completed";
  const loading = usesCustomerPhasesEngine && !settled;

  return { activePhaseNumber, activePhaseName, isComplete, loading };
}
