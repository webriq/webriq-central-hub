"use client";

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { MAX_DELIVERABLE_NAME_LENGTH } from "@/lib/programme/add-deliverable";
import { useAddDeliverable } from "./_use-add-deliverable";

// Task 433 — "Add deliverable" dialog, shared by the StackShift I swimlane and the generic milestones Timeline. Matches the hub's other
// modals (overlay, 14px panel, tinted footer — see projects/_shared/_create-task-modal.tsx) and the v2 form tokens: inputs on --bg that
// turn white with a blue ring on focus, pill buttons, sentence-case labels that name the outcome, day values in the mono face.
const INPUT = "w-full rounded-[10px] border border-[#E2E7F2] bg-[#F4F6FB] px-3 py-2 text-[13px] text-[#3A4565] outline-none transition-colors placeholder:text-[#5F6A88]/70 focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14] disabled:opacity-60";
const INPUT_ERROR = "border-[#C0392B] bg-white focus:border-[#C0392B] focus:ring-[#C0392B]/[0.12]";
const FOCUSABLE = "button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex='-1'])";

type Props<Row> = {
  endpoint: string;
  target: Record<string, string | number>;
  phaseName: string;
  /** Tailwind classes tinting the phase chip with its phase hue (a phase colour only ever means that phase). */
  phaseChipClass: string;
  phaseDayStart: number | null;
  phaseDayEnd: number | null;
  onAdded: (row: Row) => void;
  onClose: () => void;
};

export default function AddDeliverableModal<Row>({ phaseName, phaseChipClass, phaseDayStart, phaseDayEnd, onClose, ...rest }: Props<Row>) {
  const titleId = useId();
  const nameErrorId = useId();
  const daysHintId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const form = useAddDeliverable<Row>({ phaseDayStart, phaseDayEnd, onDone: onClose, ...rest });
  const { saving, error } = form;
  const hasRange = phaseDayStart !== null && phaseDayEnd !== null;

  // Escape closes (not mid-save), Tab stays inside the panel, and focus returns to the trigger on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !saving) onClose();
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = [...panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("keydown", onKeyDown); opener?.focus(); };
  }, [saving, onClose]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1533]/40 p-4" onClick={saving ? undefined : onClose}>
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#EDF0F7] px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="font-heading text-[15px] font-semibold tracking-[-0.01em] text-[#0B1533]">Add deliverable</h2>
            <div className="mt-1.5 flex items-center gap-2">
              <span className={cn("max-w-[220px] truncate rounded-[5px] px-1.5 py-0.5 text-[10px] font-bold", phaseChipClass)}>{phaseName}</span>
              {hasRange && <span className="font-mono text-[10px] font-semibold text-[#5F6A88]">Day {phaseDayStart}–{phaseDayEnd}</span>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            aria-label="Close"
            className="cursor-pointer rounded-md p-1 text-[#5F6A88] transition-colors hover:bg-[#F4F6FB] hover:text-[#0B1533] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF] disabled:opacity-45"
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void form.submit(); }} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
            <label className="flex flex-col gap-1.5">
              <span className="text-[11px] font-semibold text-[#0B1533]">Name</span>
              <input
                autoFocus
                value={form.name}
                onChange={(e) => form.setName(e.target.value)}
                maxLength={MAX_DELIVERABLE_NAME_LENGTH}
                disabled={saving}
                aria-invalid={error?.field === "name"}
                aria-describedby={error?.field === "name" ? nameErrorId : undefined}
                placeholder="e.g. Content freeze sign-off"
                className={cn(INPUT, error?.field === "name" && INPUT_ERROR)}
              />
              {error?.field === "name" && <p id={nameErrorId} role="alert" className="text-[11px] font-medium text-[#C0392B]">{error.message}</p>}
            </label>

            <fieldset className="flex flex-col gap-1.5" aria-describedby={daysHintId}>
              <legend className="mb-1.5 text-[11px] font-semibold text-[#0B1533]">Schedule <span className="font-normal text-[#5F6A88]">(optional)</span></legend>
              <div className="flex items-center gap-2">
                {([["Start day", form.dayStart, form.setDayStart, phaseDayStart], ["End day", form.dayEnd, form.setDayEnd, phaseDayEnd]] as const).map(([label, value, set, bound], i) => (
                  <div key={label} className="contents">
                    {i === 1 && <span aria-hidden="true" className="text-[#5F6A88]">–</span>}
                    <input
                      type="number"
                      inputMode="numeric"
                      min={phaseDayStart ?? 1}
                      max={phaseDayEnd ?? undefined}
                      value={value}
                      onChange={(e) => set(e.target.value)}
                      disabled={saving}
                      aria-label={label}
                      aria-invalid={error?.field === "days"}
                      placeholder={bound === null ? label : `Day ${bound}`}
                      className={cn(INPUT, "font-mono text-[12px] tabular-nums", error?.field === "days" && INPUT_ERROR)}
                    />
                  </div>
                ))}
              </div>
              {error?.field === "days" && <p role="alert" className="text-[11px] font-medium text-[#C0392B]">{error.message}</p>}
              <p id={daysHintId} className="text-[11px] leading-relaxed text-[#5F6A88]">
                {hasRange
                  ? `Leave blank to schedule it on Day ${phaseDayEnd}, the last day of this phase.`
                  : "This phase has no day range, so a deliverable without days is listed as unscheduled."}
              </p>
            </fieldset>

            {error?.field === "form" && <p role="alert" className="rounded-[10px] bg-[#FDE8E6] px-3 py-2 text-[12px] font-medium text-[#C0392B]">{error.message}</p>}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-[#EDF0F7] bg-[#F4F6FB] px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="cursor-pointer rounded-full border border-[#E2E7F2] bg-white px-4 py-2 text-[13px] text-[#3A4565] transition-colors hover:border-[#A8C6F5] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF] disabled:opacity-45"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-[#007BFF] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#0063D6] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF] disabled:cursor-not-allowed disabled:opacity-45"
            >
              {saving && <Loader2 size={14} className="animate-spin motion-reduce:animate-none" aria-hidden="true" />}
              {saving ? "Adding…" : "Add deliverable"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}
