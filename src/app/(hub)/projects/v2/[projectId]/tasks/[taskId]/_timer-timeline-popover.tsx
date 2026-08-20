"use client";

import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { formatHoursAsHHMM, formatFullTimestamp } from "@/lib/timer/format";
import { BREAK_LABELS, type BreakType } from "@/lib/timer/constants";
import type { TimerEvent, TimerEventType } from "@/lib/timer/timeline";

// Hover popover for timer-sourced Time Logs entries (task 215) — mirrors the reference Zoho
// tooltip: "Total Hours 03:28hrs", Start/End timestamps, then a colored event timeline. Manual
// entries have no `timeline` and never render this trigger (see _task-time-logs.tsx).
// --ok: #177E48 · --warn: #8A5A00 · --late: #C0392B (DESIGN.md semantic tokens, see _pm-shared.tsx)
const DOT_COLOR: Record<TimerEventType, string> = {
  started: "#177E48",
  stopped: "#C0392B",
  break_start: "#8A5A00",
  break_end: "#8A5A00",
  paused: "#5F6A88",
  resumed: "#5F6A88",
};

function eventLabel(event: TimerEvent): string {
  switch (event.type) {
    case "started": return "Started";
    case "stopped": return "Stopped";
    case "paused": return "Paused";
    case "resumed": return "Resumed";
    case "break_start": return `Paused — ${event.break_type ? BREAK_LABELS[event.break_type as BreakType] : "Break"}`;
    case "break_end": return "Break ended";
  }
}

export function TimerTimelinePopover({
  hours,
  startTime,
  endTime,
  timeline,
  children,
}: {
  hours: number;
  startTime: string;
  endTime: string;
  timeline: TimerEvent[];
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={<span className="cursor-default">{children}</span>} />
      <TooltipContent side="top" className="w-[260px] max-w-none flex-col items-stretch gap-2.5 p-3.5">
        <p className="text-[13px] font-semibold text-white">Total Hours {formatHoursAsHHMM(hours)}hrs</p>
        <div className="flex flex-col gap-0.5 text-[11px] text-slate-300">
          <span>Start Time: {formatFullTimestamp(startTime)}</span>
          <span>End Time: {formatFullTimestamp(endTime)}</span>
        </div>
        <div className="flex flex-col gap-1.5 border-t border-white/10 pt-2.5">
          {timeline.map((event, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: DOT_COLOR[event.type] }} />
              <span className="text-[11px] text-slate-100">{eventLabel(event)}</span>
              <span className="text-[10px] text-slate-400 ml-auto">{formatFullTimestamp(event.at)}</span>
            </div>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
