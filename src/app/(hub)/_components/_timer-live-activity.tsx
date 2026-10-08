"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimerActivityStream } from "@/app/(hub)/projects/_shared/_timer-activity-stream";
import type { TimerEvent } from "@/lib/timer/timeline";

// Task 439 — collapsible Activity stream for the live session inside the header timer panel
// (when it started, every pause/resume/break, and any auto-pause so far).
export function TimerLiveActivity({ timeline, nowMs }: { timeline: TimerEvent[]; nowMs: number }) {
  const [open, setOpen] = useState(false);
  if (timeline.length === 0) return null;
  return (
    <div className="flex flex-col gap-2">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center justify-between text-[11px] font-semibold text-[#5F6A88] transition-colors hover:text-[#0B1533] cursor-pointer"
      >
        Session activity
        <ChevronDown size={13} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && <TimerActivityStream timeline={timeline} nowMs={nowMs} className="max-h-60 overflow-y-auto pr-1" />}
    </div>
  );
}
