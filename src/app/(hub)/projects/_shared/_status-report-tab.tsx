"use client";

import { useEffect, useState, useTransition } from "react";
import { ClipboardList } from "lucide-react";
import StatusReportTable from "@/app/(hub)/projects/v2/status-report/_status-report-table";
import type { ProjectStatusReportItem, StatusReportResponse } from "@/app/(hub)/projects/v2/status-report/_status-report-types";

// Task 276 — Status Report tab, shared by both the legacy and v2 project-detail routes. Reuses
// the existing `_status-report-table.tsx` (imported directly, not duplicated — it's a clean,
// self-contained default export) against the existing `GET /api/onboarding/projects/status-report
// ?projectId=` endpoint (no API changes; that route already supports single-project scoping —
// confirmed by reading route.ts, which does `.eq("id", projectId)` when the query param is
// present). The route filters to only projects with `programme_started_at` set, so a legacy
// project that never went through the 120-day onboarding programme simply gets back an empty
// `projects: []` array — StatusReportTable's own `hasAnyProjects` empty state (icon + one-line
// message) already covers that case gracefully, no extra handling needed here.
export function StatusReportTab({ projectId, currentUserRole }: { projectId: string; currentUserRole: string | null }) {
  const [projects, setProjects] = useState<ProjectStatusReportItem[]>([]);
  const [canEditNotes, setCanEditNotes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  // Task 276 — `isPending` (not a manual `loading` state) avoids the react-hooks/set-state-in-
  // effect cascading-render lint rule, same wrapped-async-transition pattern this codebase already
  // uses for fetch-on-mount effects (e.g. `_time-logs-content.tsx`, `manage-collaborators-modal.tsx`).
  const [loading, startTransition] = useTransition();

  useEffect(() => {
    const ctrl = new AbortController();
    startTransition(async () => {
      try {
        const res = await fetch(`/api/onboarding/projects/status-report?projectId=${projectId}`, { signal: ctrl.signal });
        if (!res.ok) throw new Error();
        const data: StatusReportResponse = await res.json();
        setProjects(Array.isArray(data.projects) ? data.projects : []);
        setCanEditNotes(!!data.canEditNotes);
        setError(null);
      } catch {
        setError("Failed to load the status report.");
      }
    });
    return () => ctrl.abort();
  }, [projectId, retryKey]);

  function handleNoteSaved(pid: string, phaseNumber: number, note: string | null) {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== pid) return p;
        const phases = p.phases.map((ph) => (ph.phaseNumber === phaseNumber ? { ...ph, delayNote: note } : ph));
        return {
          ...p,
          phases,
          currentPhase: p.currentPhase.phaseNumber === phaseNumber ? { ...p.currentPhase, delayNote: note } : p.currentPhase,
        };
      })
    );
  }

  return (
    <div className="px-8 py-5 overflow-y-auto h-full">
      {error && (
        <div className="flex items-center gap-3 mb-4">
          <p className="text-[13px] text-[#C0392B]">{error}</p>
          <button
            type="button"
            onClick={() => setRetryKey((k) => k + 1)}
            className="text-[13px] font-medium underline underline-offset-2 transition-colors cursor-pointer bg-transparent border-none p-0 text-[#3A4565] hover:text-[#0B1533]"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center rounded-[14px] border border-[#E2E7F2] bg-white">
          <ClipboardList size={28} className="text-[#5F6A88] mb-3" />
          <p className="text-[13px] font-medium text-[#0B1533] mb-1">No status report for this project</p>
          <p className="text-[12px] text-[#5F6A88] max-w-sm">
            This project hasn&apos;t started the 120-day onboarding programme, so there&apos;s no phase data to report on yet.
          </p>
        </div>
      ) : (
        <StatusReportTable
          projects={projects}
          loading={loading}
          canEditNotes={canEditNotes}
          onNoteSaved={handleNoteSaved}
          hasAnyProjects={projects.length > 0}
          roleForEmptyState={currentUserRole}
        />
      )}
    </div>
  );
}
