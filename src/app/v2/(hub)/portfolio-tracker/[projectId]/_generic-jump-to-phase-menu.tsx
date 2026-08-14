"use client";

import { Flag, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type Milestone = Database["public"]["Tables"]["milestones"]["Row"];

// ─── Jump to phase (generic-engine variant, task 247) — lists this project's own milestones
// instead of the fixed PROGRAMME_PHASES the StackShift engine's JumpToPhaseMenu shows. Selecting
// one sets it `active` (and un-sets whichever milestone was previously active) via the parent's
// onJump handler — mirrors the StackShift menu's visual shape (_onboarding-detail.tsx's own
// JumpToPhaseMenu) for consistency, reimplemented here rather than shared since the two operate
// on entirely different data shapes (fixed day-ranges vs. this project's real milestones).
export function GenericJumpToPhaseMenu({
  open, setOpen, milestones, onJump, jumping,
}: {
  open: boolean;
  setOpen: (v: boolean) => void;
  milestones: Milestone[];
  onJump: (milestoneId: string) => void;
  jumping: boolean;
}) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#E2E7F2] bg-white px-3.5 py-2 text-xs font-medium text-[#3A4565] transition-colors hover:border-[#A8C6F5]"
      >
        <Flag size={13} /> Jump to phase <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-64 overflow-hidden rounded-xl border border-[#E2E7F2] bg-white shadow-lg">
          <div className="px-3.5 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-wider text-[#5F6A88]">Set active phase</div>
          {milestones.length === 0 ? (
            <div className="px-3.5 pb-3.5 text-[12.5px] text-[#5F6A88]">No phases yet.</div>
          ) : (
            milestones.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onJump(m.id)}
                disabled={jumping || m.status === "active"}
                className="flex w-full items-center gap-1.5 cursor-pointer border-none bg-transparent px-3.5 py-2 text-left text-[13px] text-[#0B1533] transition-colors hover:bg-[#F4F6FB] disabled:opacity-50"
              >
                <span>
                  {m.name}
                  {/* Task 252: day range now shown here too, matching the StackShift engine's own
                      JumpToPhaseMenu — undefined only for a legacy milestone seeded before this
                      task, or a manually-added one with no range set. */}
                  {m.day_start != null && m.day_end != null && (
                    <span className="text-[#5F6A88]"> (Day {m.day_start}–{m.day_end})</span>
                  )}
                </span>
                {m.status === "active" && <span className="text-[11px] text-[#007BFF]">(current)</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
