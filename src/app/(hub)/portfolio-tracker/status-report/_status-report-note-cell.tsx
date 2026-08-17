"use client";

import { useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PhaseDerived } from "./_status-report-types";

// Task 221's delay-note editor, extracted (task 223) so both the Status Report table's row-detail
// and the project-detail Status Summary drawer's stacked cards can render the same fetch-and-PATCH
// UI instead of duplicating it.
export function NoteCell({
  projectId,
  phase,
  canEdit,
  onSaved,
}: {
  projectId: string;
  phase: PhaseDerived;
  canEdit: boolean;
  onSaved: (projectId: string, phaseNumber: number, note: string | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(phase.delayNote ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/programme/phases/${phase.phaseNumber}/note`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: draft }),
      });
      if (res.ok) {
        const data = await res.json();
        onSaved(projectId, phase.phaseNumber, data.note ?? null);
        setEditing(false);
      }
    } finally {
      setSaving(false);
    }
  }

  if (editing) {
    return (
      <div className="flex items-start gap-1.5 min-w-[220px]">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Why is this phase delayed?"
          rows={2}
          className="flex-1 px-2.5 py-1.5 rounded-[10px] border text-[12px] outline-none resize-none border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]"
        />
        <div className="flex flex-col gap-1 shrink-0">
          <button
            type="button"
            disabled={saving}
            onClick={save}
            aria-label="Save note"
            className="flex items-center justify-center w-6 h-6 rounded-full bg-[#177E48] text-white hover:bg-[#146239] disabled:opacity-45 cursor-pointer transition-colors"
          >
            <Check size={12} />
          </button>
          <button
            type="button"
            onClick={() => { setDraft(phase.delayNote ?? ""); setEditing(false); }}
            aria-label="Cancel"
            className="flex items-center justify-center w-6 h-6 rounded-full border border-[#E2E7F2] bg-white text-[#5F6A88] hover:bg-[#F0F7FF] cursor-pointer transition-colors"
          >
            <X size={12} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-1.5 group min-w-[220px]">
      <p className={cn("text-[12px] flex-1", phase.delayNote ? "text-[#3A4565]" : "text-[#5F6A88] italic")}>
        {phase.delayNote ?? (phase.status === "overdue" ? "No reason recorded yet." : "—")}
      </p>
      {canEdit && (
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label="Edit delay note"
          className="flex items-center justify-center w-6 h-6 rounded-full text-[#5F6A88] hover:bg-white hover:text-[#0B1533] cursor-pointer transition-colors opacity-0 group-hover:opacity-100 shrink-0"
        >
          <Pencil size={12} />
        </button>
      )}
    </div>
  );
}
