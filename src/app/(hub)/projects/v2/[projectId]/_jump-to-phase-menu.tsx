"use client";

import { Flag, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROGRAMME_PHASES } from "@/config/customer-phases";
import { useDismissibleMenu } from "./_use-dismissible-menu";

// Minimal shape this menu actually needs — satisfied by both PhaseConfig (the "already started"
// call site's orderedPhases) and OrderedPhaseSummary (task 248's pre-seed "not started" call
// site's buildOrderedPhasePlan output), so either can be passed without a cast.
type JumpPhaseOption = { number: number; name: string; dayStart: number; dayEnd: number };

export default function JumpToPhaseMenu({
  open, setOpen, note, setNote, onJump, jumping, phases = PROGRAMME_PHASES, skipSet, currentPhaseNumber,
}: {
  open: boolean; setOpen: (v: boolean) => void; note: string; setNote: (v: string) => void;
  onJump: (phaseNumber: number) => void; jumping: boolean;
  // Task 246: defaults to PROGRAMME_PHASES for the pre-seed "not started" call site (no per-project
  // phase set exists yet); the "already started" call site passes this project's actual
  // orderedPhases (defaults + any customs) instead.
  phases?: JumpPhaseOption[];
  // Task 248: phase numbers this project's PM excluded at intake — shown in the list (not
  // filtered out, so the full plan stays visible) but disabled with a not-allowed cursor and a
  // "Skipped" pill, matching the Swimlane's own existing skipped-phase badge treatment. Chat
  // follow-up: the "already started" call site now passes its own DB-status-derived skip set
  // (customer_phases.status === "skipped") — the authoritative source once a project has seeded,
  // rather than leaving it undefined/every phase enabled as before.
  skipSet?: Set<number>;
  // Chat follow-up: the phase this project is currently active in — shown disabled with a
  // "Current" pill instead of "Skipped", since jumping to the phase you're already in is a no-op.
  // Undefined for the pre-seed "not started" call site, which has no active phase yet.
  currentPhaseNumber?: number;
}) {
  const { rootRef, triggerRef, onTriggerKeyDown, onMenuKeyDown } = useDismissibleMenu(open, setOpen);
  return (
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(!open)}
        onKeyDown={onTriggerKeyDown}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-[#E2E7F2] bg-white px-3.5 py-2 text-xs font-medium text-[#3A4565] transition-colors hover:border-[#A8C6F5]"
      >
        <Flag size={13} /> Jump to phase <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div role="menu" onKeyDown={onMenuKeyDown} className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-64 overflow-hidden rounded-xl border border-[#E2E7F2] bg-white shadow-lg">
          <div className="px-3.5 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-wider text-[#5F6A88]">Manually tag starting phase</div>
          {phases.map((p) => {
            const skipped = skipSet?.has(p.number) ?? false;
            const isCurrent = !skipped && p.number === currentPhaseNumber;
            const disabled = skipped || isCurrent;
            return (
              <button
                key={p.number}
                type="button"
                role="menuitem"
                onClick={() => onJump(p.number)}
                disabled={jumping || disabled}
                aria-disabled={disabled}
                className={cn(
                  "flex w-full items-center gap-1.5 border-none bg-transparent px-3.5 py-2 text-left text-[13px] transition-colors disabled:opacity-50",
                  disabled ? "cursor-not-allowed text-[#5F6A88]" : "cursor-pointer text-[#0B1533] hover:bg-[#F4F6FB]"
                )}
              >
                {/* Task 253: a skipped phase occupies no calendar days (compressed out of the
                    shared grid entirely, same as the Swimlane phase-row header) — showing a day
                    range here would misleadingly imply it still does. */}
                <span>{p.name}{!skipped && ` (Day ${p.dayStart}–${p.dayEnd})`}</span>
                {skipped && (
                  <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                    Skipped
                  </span>
                )}
                {isCurrent && (
                  <span className="shrink-0 rounded-full bg-[#E5F1FF] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#007BFF]">
                    Current
                  </span>
                )}
              </button>
            );
          })}
          <div className="px-3.5 pb-3.5 pt-1">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional note…"
              className="w-full rounded-lg border border-[#E2E7F2] bg-white px-2.5 py-1.5 text-xs text-[#0B1533] outline-none focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14]"
            />
          </div>
        </div>
      )}
    </div>
  );
}

