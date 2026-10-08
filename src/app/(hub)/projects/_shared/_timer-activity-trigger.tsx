"use client";

import { createPortal } from "react-dom";
import { useAnchoredMenu } from "@/components/share-picker/use-anchored-menu";
import { formatHoursAsHHMM, formatFullTimestamp } from "@/lib/timer/format";
import type { TimerEvent } from "@/lib/timer/timeline";
import { buildActivity } from "@/lib/timer/activity";
import { TimerActivityStream } from "./_timer-activity-stream";

// Task 439 — click/keyboard/touch-accessible replacement for the hover-only timer-timeline
// tooltip (task 215). Wraps the caller's own icon <button> (same props as before, so the three
// `_timer-timeline-popover.tsx` copies are thin re-exports); a click anywhere inside bubbles to
// the wrapper, so Enter/Space on the button opens it too. Portaled + position:fixed through the
// Share Picker's anchored-menu hook so no scrolling ancestor can clip it; Esc and outside-click
// close it. Narrow screens get a full-width bottom sheet.
export function TimerActivityTrigger({
  hours, startTime, endTime, timeline, children,
}: {
  hours: number;
  startTime: string;
  endTime: string;
  timeline: TimerEvent[];
  children: React.ReactNode;
}) {
  const { anchorRef, menuRef, open, show, hide, menuStyle } = useAnchoredMenu({ width: 340, align: "end" });
  // Task 440 — the timeline is immutable, so after a period edit the recorded Worked total can
  // differ from the log's own hours; say so rather than leave the two numbers unexplained.
  const periodEdited = open && Math.abs(buildActivity(timeline, endTime).totals.workedSeconds / 3600 - hours) > 1 / 60;
  const narrow = open && typeof window !== "undefined" && window.innerWidth < 640;

  return (
    <>
      <div ref={anchorRef} className="inline-flex" onClick={() => (open ? hide() : show())}>{children}</div>
      {open && menuStyle && createPortal(
        <div
          ref={menuRef}
          role="dialog"
          aria-label="Timer activity"
          style={narrow ? { position: "fixed", left: 12, right: 12, bottom: 12, maxHeight: "70vh" } : menuStyle}
          className="z-40 flex flex-col overflow-hidden rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)]"
        >
          <div className="flex items-start justify-between gap-3 border-b border-[#EDF0F7] px-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
              <span className="font-heading text-[15px] font-semibold tracking-[-0.01em] text-[#0B1533]">Activity</span>
              <span className="font-mono text-[10px] tabular-nums text-[#8A93AC]">
                {formatFullTimestamp(startTime)} → {formatFullTimestamp(endTime)}
              </span>
            </div>
            <span className="shrink-0 font-mono text-[13px] font-semibold tabular-nums text-[#0B1533]">{formatHoursAsHHMM(hours)} hrs</span>
          </div>
          {periodEdited && (
            <p className="border-b border-[#EDF0F7] bg-[#F4F6FB] px-4 py-2 text-[11px] leading-snug text-[#5F6A88]">
              Period edited after recording — hours reflect the edited range.
            </p>
          )}
          <TimerActivityStream timeline={timeline} endAt={endTime} className="overflow-y-auto p-4" />
        </div>,
        document.body,
      )}
    </>
  );
}
