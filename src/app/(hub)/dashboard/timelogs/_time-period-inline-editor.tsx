"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { HourMinuteAmPmGrid, parseValue, draftTo24 } from "./_time-field-picker";
import { formatHoursAsHHMM } from "@/lib/timer/format";
import { usePopoverPosition, POPOVER_ROOT_ATTR } from "./_use-popover-position";

// Inline Time Period editor for the Time Logs table (task 230, Requirement 14) — opens (already
// open, single-click) as a popover anchored to the table cell that rendered it, with independent
// Start/End tile grids (reusing `_time-field-picker.tsx`'s extracted `HourMinuteAmPmGrid`) and a
// live auto-calculated hours preview. Unlike `TimeFieldPicker`'s live-commit-per-tile behavior,
// this edits two interdependent fields at once, so it stages a draft and commits both together via
// an explicit Save (Cancel discards) rather than firing a PATCH per tile click.
function computeHours(date: string, startTime: string, endTime: string): number | null {
  if (!date || !startTime || !endTime) return null;
  const start = new Date(`${date}T${startTime}:00`).getTime();
  const end = new Date(`${date}T${endTime}:00`).getTime();
  const hours = (end - start) / 3_600_000;
  return hours > 0 ? hours : null;
}

export function TimePeriodInlineEditor({
  date, startTime, endTime, maxTime, onSave, onClose,
}: {
  date: string;
  startTime: string;
  endTime: string;
  maxTime?: string;
  onSave: (next: { startTime: string; endTime: string }) => void;
  onClose: () => void;
}) {
  const [draftStart, setDraftStart] = useState(parseValue(startTime));
  const [draftEnd, setDraftEnd] = useState(parseValue(endTime));
  const anchorRef = useRef<HTMLSpanElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Task 230 follow-up — this component is only ever mounted while actively editing (the parent
  // cell conditionally renders it), so it's always "open" from the positioning hook's perspective.
  const pos = usePopoverPosition(true, anchorRef, panelRef);

  useEffect(() => {
    function handleOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (anchorRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      onClose();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  const nextStart = draftTo24(draftStart);
  const nextEnd = draftTo24(draftEnd);
  const previewHours = computeHours(date, nextStart, nextEnd);

  function handleSave() {
    if (previewHours === null) return;
    onSave({ startTime: nextStart, endTime: nextEnd });
  }

  return (
    <>
      <span ref={anchorRef} />
      {pos && createPortal(
        <div
          ref={panelRef}
          {...{ [POPOVER_ROOT_ATTR]: true }}
          style={{ position: "fixed", top: pos.top, bottom: pos.bottom, left: pos.left }}
          className="z-50 w-[300px] rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] p-3 flex flex-col gap-3"
        >
          <div className="flex gap-3">
            <div className="flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#5F6A88] mb-1.5">Start</p>
              <HourMinuteAmPmGrid draft={draftStart} onChange={setDraftStart} maxTime={maxTime} />
            </div>
            <div className="flex-1">
              <p className="text-[10px] font-bold uppercase tracking-wide text-[#5F6A88] mb-1.5">End</p>
              <HourMinuteAmPmGrid draft={draftEnd} onChange={setDraftEnd} maxTime={maxTime} />
            </div>
          </div>

          <div className="flex items-center justify-between rounded-[10px] bg-[#F4F6FB] px-2.5 py-1.5">
            <span className="text-[11px] text-[#5F6A88]">Daily Log Hours</span>
            <span className="font-mono text-[12px] font-semibold text-[#3A4565]">
              {previewHours === null ? "—" : formatHoursAsHHMM(previewHours)}
            </span>
          </div>
          {previewHours === null && (
            <p className="text-[10px] text-[#C0392B]">End time must be after start time.</p>
          )}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-full text-[11px] font-medium text-[#5F6A88] hover:text-[#0B1533] cursor-pointer transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={previewHours === null}
              className="px-3 py-1.5 rounded-full bg-[#FB914E] text-[#471F02] text-[11px] font-semibold hover:bg-[#E2762F] hover:text-white disabled:opacity-45 disabled:cursor-not-allowed cursor-pointer transition-colors"
            >
              Save
            </button>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
