"use client";

import { useState } from "react";
import { Pencil, Check, X, Loader2, MessageSquarePlus } from "lucide-react";
import { cn } from "@/lib/utils";
import { DELAY_NOTE_MAX_LENGTH } from "@/lib/programme/note-rules";
import type { DelayNoteValue, PhaseDerived } from "./_status-report-types";

function formatNoteDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Task 221's delay-note editor, generalised in task 455 so the same fetch-and-PATCH UI serves both
// the per-phase note (phase_programme_state.delay_note) and the project-level note (projects.delay_note).
// Used by the Status Report row detail, the Status Summary drawer and the programme phase view.
export function DelayNoteEditor({
  endpoint,
  value,
  canEdit,
  isOverdue,
  placeholder,
  emptyLabel = "—",
  onSaved,
  className,
}: {
  endpoint: string;
  value: DelayNoteValue | null;
  canEdit: boolean;
  isOverdue: boolean; // an empty note on an overdue phase/project prompts for a reason
  placeholder: string;
  emptyLabel?: string;
  onSaved: (value: DelayNoteValue | null) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value?.note ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function startEditing() {
    setDraft(value?.note ?? "");
    setError(null);
    setEditing(true);
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: draft }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === "string" ? data.error : "Couldn't save the note");
        return;
      }
      onSaved(data.note ? { note: data.note, updatedAt: data.updatedAt ?? null, updatedBy: data.updatedBy ?? null } : null);
      setEditing(false);
    } catch {
      setError("Couldn't save the note — check your connection");
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className={cn("flex flex-col gap-1 min-w-55", className)}>
        <div className="flex items-start gap-1.5">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={placeholder}
            maxLength={DELAY_NOTE_MAX_LENGTH}
            rows={2}
            autoFocus
            aria-label={placeholder}
            className="flex-1 px-2.5 py-1.5 rounded-[10px] border text-[12px] outline-none resize-y border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]"
          />
          <div className="flex flex-col gap-1 shrink-0">
            <button
              type="button"
              disabled={saving}
              onClick={save}
              aria-label="Save note"
              className="flex items-center justify-center w-6 h-6 rounded-full bg-[#177E48] text-white hover:bg-[#146239] disabled:opacity-45 cursor-pointer transition-colors"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => { setDraft(value?.note ?? ""); setError(null); setEditing(false); }}
              aria-label="Cancel"
              className="flex items-center justify-center w-6 h-6 rounded-full border border-[#E2E7F2] bg-white text-[#5F6A88] hover:bg-[#F0F7FF] disabled:opacity-45 cursor-pointer transition-colors"
            >
              <X size={12} />
            </button>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2">
          {error ? <p role="alert" className="text-[11px] text-[#C0392B]">{error}</p> : <span />}
          <span className="text-[10px] font-mono text-[#5F6A88] shrink-0">{draft.length}/{DELAY_NOTE_MAX_LENGTH}</span>
        </div>
      </div>
    );
  }

  if (!value && canEdit && isOverdue) {
    return (
      <button
        type="button"
        onClick={startEditing}
        className={cn(
          "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-dashed border-[#E8A9A1] bg-[#FDF1EF] text-[11.5px] font-medium text-[#C0392B] hover:bg-[#FBE3DF] cursor-pointer transition-colors",
          className
        )}
      >
        <MessageSquarePlus size={12} />
        Add reason
      </button>
    );
  }

  return (
    <div className={cn("flex items-start gap-1.5 min-w-55", className)}>
      <div className="flex-1 min-w-0">
        <p className={cn("text-[12px] whitespace-pre-wrap wrap-break-word", value ? "text-[#3A4565]" : "text-[#5F6A88] italic")}>
          {value?.note ?? (isOverdue ? "No reason recorded yet." : emptyLabel)}
        </p>
        {value && (value.updatedBy || value.updatedAt) && (
          <p className="text-[10.5px] text-[#5F6A88] mt-0.5">
            — {[value.updatedBy, value.updatedAt ? formatNoteDate(value.updatedAt) : null].filter(Boolean).join(", ")}
          </p>
        )}
      </div>
      {canEdit && (
        <button
          type="button"
          onClick={startEditing}
          aria-label={value ? "Edit note" : "Add note"}
          className="flex items-center justify-center w-6 h-6 rounded-full text-[#5F6A88] hover:bg-[#F0F7FF] hover:text-[#0B1533] cursor-pointer transition-colors shrink-0"
        >
          <Pencil size={12} />
        </button>
      )}
    </div>
  );
}

export function phaseNoteValue(phase: PhaseDerived): DelayNoteValue | null {
  return phase.delayNote ? { note: phase.delayNote, updatedAt: phase.delayNoteUpdatedAt, updatedBy: phase.delayNoteUpdatedBy } : null;
}

// Per-phase wrapper (the original task 221 call shape).
export function NoteCell({
  projectId,
  phase,
  canEdit,
  onSaved,
}: {
  projectId: string;
  phase: PhaseDerived;
  canEdit: boolean;
  onSaved: (projectId: string, phaseNumber: number, value: DelayNoteValue | null) => void;
}) {
  return (
    <DelayNoteEditor
      endpoint={`/api/projects/${projectId}/programme/phases/${phase.phaseNumber}/note`}
      value={phaseNoteValue(phase)}
      canEdit={canEdit}
      isOverdue={phase.status === "overdue"}
      placeholder="Why is this phase delayed?"
      onSaved={(value) => onSaved(projectId, phase.phaseNumber, value)}
    />
  );
}

// Project-level wrapper (task 455).
export function ProjectNoteCell({
  projectId,
  value,
  isOverdue,
  canEdit,
  onSaved,
  className,
}: {
  projectId: string;
  value: DelayNoteValue | null;
  isOverdue: boolean;
  canEdit: boolean;
  onSaved: (projectId: string, value: DelayNoteValue | null) => void;
  className?: string;
}) {
  return (
    <DelayNoteEditor
      endpoint={`/api/projects/${projectId}/programme/note`}
      value={value}
      canEdit={canEdit}
      isOverdue={isOverdue}
      placeholder="Why is this project delayed overall?"
      emptyLabel="No project note."
      onSaved={(next) => onSaved(projectId, next)}
      className={className}
    />
  );
}

// Applies a saved phase note to a status-report item (shared by the Status Report page, the
// project Status Report tab and the Status Summary drawer).
export function withPhaseNote<P extends { phases: PhaseDerived[]; currentPhase: PhaseDerived }>(project: P, phaseNumber: number, value: DelayNoteValue | null): P {
  const apply = (ph: PhaseDerived): PhaseDerived =>
    ph.phaseNumber === phaseNumber
      ? { ...ph, delayNote: value?.note ?? null, delayNoteUpdatedAt: value?.updatedAt ?? null, delayNoteUpdatedBy: value?.updatedBy ?? null }
      : ph;
  return { ...project, phases: project.phases.map(apply), currentPhase: apply(project.currentPhase) };
}
