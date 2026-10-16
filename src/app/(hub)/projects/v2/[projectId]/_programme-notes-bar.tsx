"use client";

import { useEffect, useState } from "react";
import { CalendarClock, Check, Loader2, Pencil, X } from "lucide-react";
import { canEditKickoff, canWriteDelayNotes } from "@/lib/programme/note-rules";
import { currentDisplayDay } from "@/lib/programme/calendar";
import type { DelayNoteValue, ProjectStatusReportItem, StatusReportResponse } from "@/app/(hub)/projects/v2/status-report/_status-report-types";
import { NoteCell, ProjectNoteCell, withPhaseNote } from "@/app/(hub)/projects/v2/status-report/_status-report-note-cell";

function localYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatKickoff(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// Task 455 — the programme's kickoff date (editable by admin/super_admin/pm), plus the project-level
// and active-phase delay notes, on the Timeline view. Notes come from the same status-report GET the
// Status Summary drawer uses, so "who/when" and overdue status match the report exactly.
export function ProgrammeNotesBar({
  projectId,
  programmeStartedAt,
  durationDays,
  activePhaseNumber,
  role,
  onKickoffSaved,
}: {
  projectId: string;
  programmeStartedAt: string;
  durationDays: number;
  activePhaseNumber: number | null;
  role: string | null;
  onKickoffSaved: () => void;
}) {
  const [report, setReport] = useState<ProjectStatusReportItem | null>(null);
  const [editingKickoff, setEditingKickoff] = useState(false);
  const [kickoffDraft, setKickoffDraft] = useState("");
  const [savingKickoff, setSavingKickoff] = useState(false);
  const [kickoffError, setKickoffError] = useState<string | null>(null);
  const canNote = canWriteDelayNotes(role);
  const canKickoff = canEditKickoff(role);

  // Re-read after a phase move or kickoff change: the active phase and its overdue state come from the report.
  useEffect(() => {
    const ctrl = new AbortController();
    fetch(`/api/onboarding/projects/status-report?projectId=${projectId}`, { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((data: StatusReportResponse) => setReport(data.projects[0] ?? null))
      .catch(() => {});
    return () => ctrl.abort();
  }, [projectId, activePhaseNumber, programmeStartedAt]);

  async function saveKickoff() {
    setSavingKickoff(true);
    setKickoffError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/programme/kickoff`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kickoff_date: kickoffDraft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setKickoffError(typeof data?.error === "string" ? data.error : "Couldn't update the kickoff date");
        return;
      }
      setEditingKickoff(false);
      onKickoffSaved();
    } catch {
      setKickoffError("Couldn't update the kickoff date — check your connection");
    } finally {
      setSavingKickoff(false);
    }
  }

  const day = currentDisplayDay(programmeStartedAt, durationDays);
  const activePhase = report?.phases.find((ph) => ph.phaseNumber === activePhaseNumber) ?? null;
  const today = localYmd(new Date());

  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(7,17,51,0.05)]">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <div className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] mb-1.5">Kickoff</div>
          {editingKickoff ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                <input
                  type="date"
                  value={kickoffDraft}
                  max={today}
                  onChange={(e) => setKickoffDraft(e.target.value)}
                  aria-label="Kickoff date"
                  className="h-8 flex-1 min-w-0 rounded-[10px] border border-[#E2E7F2] bg-[#F4F6FB] px-2 text-[12px] text-[#3A4565] outline-none focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]"
                />
                <button
                  type="button"
                  disabled={savingKickoff || !kickoffDraft}
                  onClick={saveKickoff}
                  aria-label="Save kickoff date"
                  className="flex items-center justify-center w-6 h-6 rounded-full bg-[#177E48] text-white hover:bg-[#146239] disabled:opacity-45 cursor-pointer transition-colors shrink-0"
                >
                  {savingKickoff ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                </button>
                <button
                  type="button"
                  disabled={savingKickoff}
                  onClick={() => { setEditingKickoff(false); setKickoffError(null); }}
                  aria-label="Cancel"
                  className="flex items-center justify-center w-6 h-6 rounded-full border border-[#E2E7F2] bg-white text-[#5F6A88] hover:bg-[#F0F7FF] disabled:opacity-45 cursor-pointer transition-colors shrink-0"
                >
                  <X size={12} />
                </button>
              </div>
              <p className="text-[10.5px] text-[#5F6A88]">Moves Day N and phase due dates. Phase status is unchanged.</p>
              {kickoffError && <p role="alert" className="text-[11px] text-[#C0392B]">{kickoffError}</p>}
            </div>
          ) : (
            <div className="flex items-start gap-1.5">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#0B1533]">
                  <CalendarClock size={13} className="text-[#5F6A88]" aria-hidden="true" />
                  {formatKickoff(programmeStartedAt)}
                </div>
                <div className="text-[11px] font-mono text-[#5F6A88] mt-0.5">
                  Day {day}/{durationDays} · {Math.max(0, durationDays - day)}d left
                </div>
              </div>
              {canKickoff && (
                <button
                  type="button"
                  onClick={() => { setKickoffDraft(localYmd(new Date(programmeStartedAt))); setKickoffError(null); setEditingKickoff(true); }}
                  aria-label="Edit kickoff date"
                  className="flex items-center justify-center w-6 h-6 rounded-full text-[#5F6A88] hover:bg-[#F0F7FF] hover:text-[#0B1533] cursor-pointer transition-colors shrink-0"
                >
                  <Pencil size={12} />
                </button>
              )}
            </div>
          )}
        </div>

        <div>
          <div className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] mb-1.5">Project note</div>
          {report ? (
            <ProjectNoteCell
              projectId={projectId}
              value={report.projectNote}
              isOverdue={report.phases.some((ph) => ph.status === "overdue")}
              canEdit={canNote}
              onSaved={(_id, value: DelayNoteValue | null) => setReport((prev) => (prev ? { ...prev, projectNote: value } : prev))}
            />
          ) : (
            <div className="h-5 w-40 rounded bg-[#F4F6FB] animate-pulse" />
          )}
        </div>

        <div>
          <div className="text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] mb-1.5">
            {activePhase ? `${activePhase.name} note` : "Phase note"}
          </div>
          {!report ? (
            <div className="h-5 w-40 rounded bg-[#F4F6FB] animate-pulse" />
          ) : activePhase ? (
            <NoteCell
              key={activePhase.phaseNumber}
              projectId={projectId}
              phase={activePhase}
              canEdit={canNote}
              onSaved={(_id, phaseNumber, value) => setReport((prev) => (prev ? withPhaseNote(prev, phaseNumber, value) : prev))}
            />
          ) : (
            <p className="text-[12px] text-[#5F6A88] italic">No active phase.</p>
          )}
        </div>
      </div>
    </div>
  );
}
