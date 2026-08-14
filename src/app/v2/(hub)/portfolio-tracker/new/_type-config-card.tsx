"use client";

import { Check, GitBranch, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Classification } from "@/config/customer-phases";
import { Field } from "./_content";
import { type TypeCardState } from "./_new-project-types";

// ─── PipelineForge add-on row ───────────────────────────────────────────────────
// Hidden from the primary type grid entirely (task 240) — surfaces here, per selected type card,
// under an "Add-on" heading. Locked "Included" for StackShift II (platform-module semantics);
// a normal selectable checkbox for every other type.

function PipelineForgeAddonRow({ locked, checked, onToggle }: { locked: boolean; checked: boolean; onToggle: () => void }) {
  return (
    <div>
      <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.06em] text-[#5F6A88]">Add-on</div>
      {locked ? (
        <div className="flex items-center gap-2.5 rounded-[9px] border border-[#BEE7CD] bg-[#E3F5EA] px-3.5 py-2.5">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-[#177E48] text-white">
            <GitBranch size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-[#0B1533]">PipelineForge</div>
            <div className="text-[11px] text-[#177E48]">Included — integrated as a platform module for StackShift II</div>
          </div>
          <div className="flex shrink-0 items-center gap-1 rounded-full bg-[#177E48] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
            <Check size={10} strokeWidth={3} /> Included
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={checked}
          className={cn(
            "flex w-full cursor-pointer items-center gap-2.5 rounded-[9px] border px-3.5 py-2.5 text-left transition-colors",
            checked ? "border-[#007BFF] bg-[#F0F7FF]" : "border-[#E2E7F2] bg-white hover:border-[#A8C6F5]"
          )}
        >
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px]",
              checked ? "bg-[#E5F1FF] text-[#0063D6]" : "bg-[#EDF0F7] text-[#5F6A88]"
            )}
          >
            <GitBranch size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <div className={cn("text-[13px] font-semibold", checked ? "text-[#0063D6]" : "text-[#0B1533]")}>PipelineForge</div>
            <div className="text-[11px] text-[#5F6A88]">Build automation & deployment pipeline — optional add-on</div>
          </div>
          <div
            className={cn(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
              checked ? "border-[#007BFF] bg-[#007BFF]" : "border-[#E2E7F2] bg-white"
            )}
          >
            {checked && <Check size={11} color="#FFFFFF" strokeWidth={2.5} />}
          </div>
        </button>
      )}
    </div>
  );
}

// ─── Per-type configuration card ───────────────────────────────────────────────
// Task 244 follow-up: trimmed to name + PipelineForge add-on only — duration, start
// (draft/now/scheduled), "start at phase N", and the StackShift II "generate default phases"
// checkbox all moved to Step 3 (`_phases-step.tsx`), grouped with the phase builder itself. They
// don't belong here: setting a programme's duration/schedule before the PM has even looked at (or
// possibly excluded) its phases put the cart before the horse.

export default function TypeConfigCard({
  classification,
  state,
  displayedName,
  onChange,
  onRemove,
}: {
  classification: Classification;
  state: TypeCardState;
  // Auto-suggested `${company} ${type} Website/App` until the PM edits the field, computed by
  // the parent (needs `companyName`, which lives at the wizard level, not on the card's own
  // state) — mirrors the single-project wizard's `displayedProjectName` pattern.
  displayedName: string;
  onChange: (next: TypeCardState) => void;
  onRemove: () => void;
}) {
  const isStackShiftII = classification === "StackShift II";

  return (
    <div className="rounded-[12px] border border-[#E2E7F2] bg-[#F9FAFC] p-4">
      <div className="mb-3.5 flex items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-[#0B1533]">{classification}</span>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${classification}`}
          className="flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 text-[11.5px] font-medium text-[#5F6A88] transition-colors hover:text-[#C0392B]"
        >
          <X size={12} /> Remove
        </button>
      </div>

      <div className="mb-4">
        <Field
          id={`project-name-${classification}`}
          label="Project name"
          value={displayedName}
          onChange={(v) => onChange({ ...state, projectName: v, projectNameTouched: true, projectNameError: "" })}
          placeholder="Auto-generated from company + classification"
          required
          error={state.projectNameError}
          disabled={state.checkingName}
        />
      </div>

      <PipelineForgeAddonRow
        locked={isStackShiftII}
        checked={state.pipelineforgeAddon}
        onToggle={() => onChange({ ...state, pipelineforgeAddon: !state.pipelineforgeAddon })}
      />
    </div>
  );
}
