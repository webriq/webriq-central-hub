"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { StepTarget } from "./_step-target";
import { StepReview } from "./_step-review";
import { StepProgressView } from "./_step-progress";
import { StepConfirm, StepDone, StepScan } from "./_step-confirm";
import { btnBlue, btnGhost, btnOrange } from "./_merge-bits";
import { useMergeWizard, type WizardStep } from "./_use-merge-wizard";

const LABELS: { id: WizardStep[]; label: string }[] = [
  { id: ["target"], label: "Choose target" },
  { id: ["scan", "review"], label: "Review" },
  { id: ["confirm"], label: "Confirm" },
  { id: ["merge", "done"], label: "Merge" },
];

// Task 468 — "Merge to…" wizard. Rendered by the header (outside the gear dropdown, which unmounts on close).
export function MergeWizard({ projectKey, projectName, basePath, variant, onClose }: {
  projectKey: string; projectName: string; basePath: string; variant: "legacy" | "v2"; onClose: () => void;
}) {
  const router = useRouter();
  const w = useMergeWizard(projectKey);
  const [typed, setTyped] = useState("");
  const [crossAck, setCrossAck] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);
  const busy = w.step === "scan" || (w.step === "merge" && !w.error);
  const closable = !["confirm", "merge"].includes(w.step) || !!w.error;

  useEffect(() => { dialog.current?.focus(); }, [w.step]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && closable && w.step !== "scan") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closable, w.step, onClose]);

  const { plan, target } = w;
  const folded = plan ? plan.findings.filter((f) => ["skip", "merge"].includes(w.decisions[f.id] ?? f.recommended)).length : 0;
  const nameOk = !!plan && typed.trim().toLowerCase() === plan.targetName.trim().toLowerCase();
  const confirmOk = nameOk && (!plan?.crossCustomer || crossAck);
  const stepIdx = LABELS.findIndex((l) => l.id.includes(w.step));

  const openTarget = () => {
    if (!target) return;
    router.push(`${basePath.slice(0, basePath.lastIndexOf("/") + 1)}${variant === "legacy" ? target.id : target.project_id ?? target.id}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0B1533]/40 p-4">
      <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="merge-title" className="flex max-h-[min(720px,92vh)] w-full max-w-[720px] flex-col rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] outline-none">
        <header className="flex items-start justify-between gap-4 border-b border-[#EDF0F7] px-5 py-4">
          <div className="min-w-0">
            <h2 id="merge-title" className="truncate text-[15px] font-semibold text-[#0B1533]">Merge “{projectName}”{target ? ` into “${target.name}”` : ""}</h2>
            <ol className="mt-2 flex flex-wrap gap-1.5" aria-label="Merge steps">
              {LABELS.map((l, i) => (
                <li key={l.label} aria-current={i === stepIdx ? "step" : undefined} className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold", i === stepIdx ? "bg-[#071133] text-white" : i < stepIdx ? "bg-[#E3F5EA] text-[#177E48]" : "bg-[#EDF0F7] text-[#5F6A88]")}>
                  <span className="font-mono">{i + 1}</span> {l.label}
                </li>
              ))}
            </ol>
          </div>
          {closable && !busy && <button type="button" onClick={onClose} aria-label="Close merge wizard" className="shrink-0 cursor-pointer rounded-full p-1.5 text-[#5F6A88] transition-colors hover:bg-[#F0F7FF] hover:text-[#0B1533]"><X size={16} /></button>}
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {w.step === "target" && <StepTarget projectKey={projectKey} projectName={projectName} targetId={target?.id ?? null} onPick={w.pickTarget} />}
          {w.step === "scan" && <StepScan notes={w.notes} error={w.error} />}
          {w.step === "review" && plan && <StepReview plan={plan} decisions={w.decisions} setDecisions={w.setDecisions} narration={w.narration.review} />}
          {w.step === "confirm" && plan && <StepConfirm plan={plan} typed={typed} setTyped={setTyped} crossAck={crossAck} setCrossAck={setCrossAck} skipCount={folded} />}
          {w.step === "merge" && <StepProgressView progress={w.progress} error={w.error} finished={false} />}
          {w.step === "done" && w.summary && <StepDone summary={w.summary} text={w.narration.summary} />}
        </div>

        <footer className="flex items-center justify-between gap-2 border-t border-[#EDF0F7] px-5 py-3.5">
          {w.step === "target" && <><button type="button" className={btnGhost} onClick={onClose}>Cancel</button><button type="button" className={btnBlue} disabled={!target} onClick={w.scan}>Scan {target ? `against “${target.name}”` : "projects"}</button></>}
          {w.step === "scan" && <><button type="button" className={btnGhost} onClick={w.cancelScan}>Cancel scan</button>{w.error && <button type="button" className={btnBlue} onClick={w.scan}>Try again</button>}</>}
          {w.step === "review" && <><button type="button" className={btnGhost} onClick={() => w.setStep("target")}>Back</button><button type="button" className={btnBlue} disabled={plan?.blocked} onClick={() => w.setStep("confirm")}>{plan?.resumable ? "Continue to resume" : "Continue"}</button></>}
          {w.step === "confirm" && <><button type="button" className={btnGhost} onClick={() => w.setStep("review")}>Back to review</button><button type="button" className={btnOrange} disabled={!confirmOk} onClick={w.run}>Merge into {plan?.targetName}</button></>}
          {w.step === "merge" && (w.error ? <><button type="button" className={btnGhost} onClick={onClose}>Close</button><button type="button" className={btnBlue} onClick={w.run}>Resume merge</button></> : <span className="text-[12px] text-[#5F6A88]">Keep this window open until it finishes.</span>)}
          {w.step === "done" && <><button type="button" className={btnGhost} onClick={onClose}>Close</button><button type="button" className={btnBlue} onClick={openTarget}>Open {target?.name}</button></>}
        </footer>
      </div>
    </div>
  );
}
