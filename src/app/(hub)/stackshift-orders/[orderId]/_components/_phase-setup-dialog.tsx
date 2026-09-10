"use client";

import { useState } from "react";
import { X, Layers, ListChecks, SkipForward, Loader2 } from "lucide-react";
import type { PhasePlanInput } from "@/config/customer-phases";
import PhaseBuilder from "@/components/programme/phase-builder";
import {
  emptyPhasePlanDraft,
  phasePlanDraftToInput,
  phasePlanEmptyNameErrors,
  phasePlanValidationErrors,
  type PhasePlanDraft,
} from "@/lib/programme/phase-plan-draft";
import { ERROR_BOX_CLASS } from "./_order-ui";

export type PhaseSetup = "stackshift_default" | "custom" | "skip";

// Task 357 — shown by ConvertPanel when the reviewer clicks "Create customer & project" on a
// NON-StackShift-I order. Step 1: pick how to seed the project's milestones. "Set the phases now"
// swaps in the same PhaseBuilder the New Project wizard uses (free-form mode). Every path calls
// `onConfirm`, which fires the actual convert request in the parent.
export default function PhaseSetupDialog({
  busy,
  onCancel,
  onConfirm,
}: {
  busy: boolean;
  onCancel: () => void;
  onConfirm: (phaseSetup: PhaseSetup, phasePlan?: PhasePlanInput) => void;
}) {
  const [step, setStep] = useState<"choose" | "build">("choose");
  const [draft, setDraft] = useState<PhasePlanDraft>(() => emptyPhasePlanDraft());
  const [buildError, setBuildError] = useState<string | null>(null);

  function confirmBuild() {
    setBuildError(null);
    const input = phasePlanDraftToInput(draft);
    if (input.phases.length === 0) {
      setBuildError("Add at least one phase, or go back and choose another option.");
      return;
    }
    if (phasePlanEmptyNameErrors(draft, "free-form").size > 0) {
      setBuildError("Every phase, deliverable, and checklist item needs a name.");
      return;
    }
    if (phasePlanValidationErrors(draft).size > 0) {
      setBuildError("Fix the highlighted day ranges before continuing.");
      return;
    }
    onConfirm("custom", input);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1533]/40 p-4"
      onClick={busy ? undefined : onCancel}
    >
      <div
        className="w-full max-w-2xl rounded-[14px] bg-white shadow-xl border border-[#E2E7F2] overflow-hidden max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDF0F7] shrink-0">
          <h2 className="text-[15px] font-semibold text-[#0B1533]">
            {step === "choose" ? "Phases & deliverables" : "Set the phases & deliverables"}
          </h2>
          {!busy && (
            <button
              onClick={onCancel}
              aria-label="Close"
              className="p-1 rounded-md text-[#5F6A88] hover:text-[#0B1533] hover:bg-[#F4F6FB] cursor-pointer transition-colors"
            >
              <X size={16} />
            </button>
          )}
        </div>

        {busy ? (
          <div className="flex items-center justify-center gap-2 px-5 py-10 text-[13px] text-[#3A4565]">
            <Loader2 size={16} className="animate-spin" /> Creating customer &amp; project…
          </div>
        ) : step === "choose" ? (
          <div className="p-5 flex flex-col gap-2.5 overflow-y-auto min-h-0">
            <p className="text-[12.5px] text-[#5F6A88]">
              This project isn&apos;t StackShift I, so it won&apos;t use the 120-day programme. Choose how to set up its milestones.
            </p>
            <OptionButton
              icon={<Layers size={16} />}
              title="Use the default StackShift phases"
              desc="Copy the StackShift I phase &amp; deliverable structure into this project's milestones. Fully editable afterward."
              onClick={() => onConfirm("stackshift_default")}
            />
            <OptionButton
              icon={<ListChecks size={16} />}
              title="Set the phases &amp; deliverables now"
              desc="Build the milestone plan from scratch, the same way the New Project form does."
              onClick={() => {
                setBuildError(null);
                setStep("build");
              }}
            />
            <OptionButton
              icon={<SkipForward size={16} />}
              title="Skip for now"
              desc="Create the project with no milestones. Add them later from the project's Milestones tab."
              onClick={() => onConfirm("skip")}
            />
          </div>
        ) : (
          <>
            <div className="p-5 flex flex-col gap-3 overflow-y-auto min-h-0">
              {buildError && <div className={ERROR_BOX_CLASS}>{buildError}</div>}
              <PhaseBuilder mode="free-form" phasePlan={draft} durationDays={120} onChange={setDraft} />
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EDF0F7] bg-[#F4F6FB] shrink-0">
              <button
                onClick={() => setStep("choose")}
                className="px-4 py-2 rounded-full text-[13px] text-[#3A4565] bg-white border border-[#E2E7F2] hover:border-[#A8C6F5] cursor-pointer transition-colors"
              >
                Back
              </button>
              <button
                onClick={confirmBuild}
                className="px-4 py-2 rounded-full text-[13px] font-semibold bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white cursor-pointer transition-colors"
              >
                Create customer &amp; project
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function OptionButton({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 w-full text-left rounded-[12px] border border-[#E2E7F2] bg-white px-4 py-3 hover:border-[#A8C6F5] hover:bg-[#F0F7FF] cursor-pointer transition-colors"
    >
      <span className="mt-0.5 shrink-0 text-[#5F6A88]">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-[#0B1533]">{title}</span>
        <span className="block text-[11px] text-[#5F6A88] mt-0.5">{desc}</span>
      </span>
    </button>
  );
}
