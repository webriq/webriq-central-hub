"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { X, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import { Chip, PhaseChip } from "@/app/(hub)/dashboard/_components/dashboard-shared";
import type { HealthTone, ProjectStatusReportItem } from "@/app/(hub)/projects/v2/status-report/_status-report-types";
import { HEALTH_LABEL } from "@/app/(hub)/projects/v2/status-report/_status-report-types";
import { StatusSummaryPhaseCards } from "./_status-summary-phase-cards";

const HEALTH_TONE: Record<Exclude<HealthTone, null>, "ok" | "warn" | "late"> = {
  on_track: "ok",
  at_risk: "warn",
  needs_attention: "late",
  ahead_of_schedule: "ok",
};

// Task 282 (item I) — `useSyncExternalStore`'s SSR-safe "is this the client, post-hydration"
// idiom: no external store actually changes, so `subscribe` is a no-op; `getSnapshot` (client)
// returns `true`, `getServerSnapshot` (SSR + the client's first hydration pass) returns `false`.
function mountedSubscribe() { return () => {}; }
function mountedSnapshot() { return true; }
function mountedServerSnapshot() { return false; }

// Task 223 — right-side drawer mirroring notification-bell.tsx's own portal/backdrop/slide-in
// pattern (task 173/186), so this reuses an interaction users already know from elsewhere in the
// app instead of introducing a second modal pattern. Data is the exact same
// buildPhaseBreakdown()-derived shape the Status Report page (task 221) renders, scoped to this
// one project via the route's new `?projectId=` filter — never recomputed here.
export function StatusSummaryDrawer({
  open,
  onClose,
  projectUuid,
}: {
  open: boolean;
  onClose: () => void;
  projectUuid: string;
}) {
  const [project, setProject] = useState<ProjectStatusReportItem | null>(null);
  const [canEditNotes, setCanEditNotes] = useState(false);
  const [error, setError] = useState(false);
  const fetchedRef = useRef(false);
  // Derived, not stored — avoids a synchronous setState(true) at the top of the fetch effect
  // below (react-hooks/set-state-in-effect). True from the moment the drawer opens until the
  // fetch settles into either `project` or `error`.
  const loading = open && !project && !error;

  useEffect(() => {
    if (!open || fetchedRef.current) return;
    fetchedRef.current = true;
    fetch(`/api/onboarding/projects/status-report?projectId=${projectUuid}`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: { projects: ProjectStatusReportItem[]; canEditNotes: boolean }) => {
        const found = data.projects[0];
        if (!found) {
          setError(true);
          return;
        }
        setProject(found);
        setCanEditNotes(data.canEditNotes);
      })
      .catch(() => setError(true));
  }, [open, projectUuid]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  function handleNoteSaved(_projectId: string, phaseNumber: number, note: string | null) {
    setProject((prev) =>
      prev
        ? { ...prev, phases: prev.phases.map((ph) => (ph.phaseNumber === phaseNumber ? { ...ph, delayNote: note } : ph)) }
        : prev
    );
  }

  // Task 282 (item I) — was `if (typeof document === "undefined") return null`, which renders
  // `null` during SSR (no `document` global in Node) but the full portal tree on the client's
  // very first (hydrating) render, since `document` exists from the first client render — the
  // two passes never match, causing a hydration error. `useSyncExternalStore` (same pattern as
  // `use-pm-settings.ts`/`theme-toggle.tsx`) reports `false` for both the server pass and the
  // client's hydration pass, then `true` on the client-only re-render — guaranteed to match
  // without a synchronous `setState` in an effect body (react-hooks/set-state-in-effect).
  const mounted = useSyncExternalStore(mountedSubscribe, mountedSnapshot, mountedServerSnapshot);
  if (!mounted) return null;

  return createPortal(
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={cn(
          "fixed inset-0 bg-slate-900/20 z-[99999] transition-opacity motion-reduce:transition-none duration-200",
          open ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      />
      <div
        role="dialog"
        aria-label="Status Summary"
        aria-modal="true"
        className={cn(
          "fixed right-0 top-0 h-full w-full max-w-md bg-white z-[99999] shadow-[0_8px_24px_rgba(7,17,51,0.10)] flex flex-col transition-transform ease-out motion-reduce:transition-none duration-200",
          open ? "translate-x-0" : "translate-x-full"
        )}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E7F2] shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-full bg-[#E5F1FF] flex items-center justify-center text-[#007BFF] shrink-0">
              <ClipboardList size={14} />
            </span>
            <span className="text-[14px] font-semibold text-[#0B1533]">Status Summary</span>
          </div>
          <button
            aria-label="Close status summary"
            onClick={onClose}
            className="p-1 rounded-[10px] text-[#5F6A88] hover:text-[#3A4565] hover:bg-[#F4F6FB] transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col gap-3 p-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-32 rounded-[12px] bg-[#F4F6FB] animate-pulse" />
              ))}
            </div>
          ) : error || !project ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 px-6 text-center">
              <p className="text-[13px] font-semibold text-[#0B1533]">Couldn&apos;t load the status summary</p>
              <p className="text-[12px] text-[#5F6A88]">Try closing and reopening the drawer.</p>
            </div>
          ) : (
            <div className="p-5">
              <div className="rounded-[12px] border border-[#E2E7F2] bg-[#F4F6FB] p-4 mb-4">
                <div className="text-[12px] text-[#5F6A88] mb-1">{project.companyName}</div>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-[14px] font-bold text-[#0B1533]">{project.projectName}</span>
                  {project.health && <Chip tone={HEALTH_TONE[project.health]} dot>{HEALTH_LABEL[project.health]}</Chip>}
                </div>
                <div className="flex items-center gap-2 flex-wrap mt-2">
                  <PhaseChip phaseNumber={project.currentPhase.phaseNumber} phaseName={project.currentPhase.name} />
                  <span className="text-[11px] text-[#5F6A88]">Day {project.currentProgrammeDay} / 120</span>
                  <span className="text-[11px] text-[#5F6A88]">{project.programmeDaysLeft} days left</span>
                </div>
              </div>

              <StatusSummaryPhaseCards project={project} canEditNotes={canEditNotes} onNoteSaved={handleNoteSaved} />
            </div>
          )}
        </div>
      </div>
    </>,
    document.body
  );
}
