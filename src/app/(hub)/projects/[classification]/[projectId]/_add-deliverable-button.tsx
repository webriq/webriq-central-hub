"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import AddDeliverableModal from "./_add-deliverable-modal";

// Task 433 — "Add deliverable" trigger in a swimlane's label cell; opens the shared modal. `endpoint` + `target` pick the route and name the
// phase in its body, and the created row goes to the parent, which merges it into its own state.
export default function AddDeliverableButton<Row>({
  endpoint, target, phaseName, phaseChipClass, phaseDayStart, phaseDayEnd, onAdded,
}: {
  endpoint: string;
  target: Record<string, string | number>;
  phaseName: string;
  phaseChipClass: string;
  /** The phase's day range, or null when it has none. */
  phaseDayStart: number | null;
  phaseDayEnd: number | null;
  onAdded: (row: Row) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={`Add deliverable to ${phaseName}`}
        className="mt-2 flex cursor-pointer items-center gap-1 rounded border-none bg-transparent px-1 py-0.5 text-[10.5px] font-semibold text-[#5F6A88] transition-colors hover:bg-white/60 hover:text-[#007BFF] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]"
      >
        <Plus size={11} aria-hidden="true" /> Add deliverable
      </button>
      {open && (
        <AddDeliverableModal
          endpoint={endpoint}
          target={target}
          phaseName={phaseName}
          phaseChipClass={phaseChipClass}
          phaseDayStart={phaseDayStart}
          phaseDayEnd={phaseDayEnd}
          onAdded={onAdded}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
