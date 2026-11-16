"use client";

import { Clock, CheckCircle2, ListChecks, ClipboardList } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { PHASE_HEX, PHASE_TINT_HEX, StatChip, addDays } from "./_onboarding-detail";

// Task 281 — the "{N}-Day Programme Progress" bar + stat chips, extracted verbatim out of
// Timeline's old in-body "Header card" (`_onboarding-detail.tsx`) so it can render on the
// Overview tab instead (item 7 of task 281). Timeline no longer renders this at all — it moved
// here, not duplicated. Values are computed by the caller (Timeline computes them inline;
// Overview uses `_use-programme-progress.ts`, which calls the same `@/config/customer-phases`
// functions Timeline's own computation does, so the two can never disagree).
export function ProgrammeProgressCard({
  visibleDurationDays,
  currentDay,
  startDate,
  progressPct,
  programmeOverdue,
  daysOverdue120,
  isComplete,
  activePhaseNumber,
  daysRemaining,
  phasesCompleted,
  doneDeliverables,
  totalDeliverables,
  onOpenStatusSummary,
}: {
  visibleDurationDays: number;
  currentDay: number;
  startDate: Date;
  progressPct: number;
  programmeOverdue: boolean;
  daysOverdue120: number;
  isComplete: boolean;
  activePhaseNumber: number;
  daysRemaining: number;
  phasesCompleted: number;
  doneDeliverables: number;
  totalDeliverables: number;
  onOpenStatusSummary: () => void;
}) {
  return (
    <div className="rounded-2xl border border-[#E2E7F2] bg-white p-6 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        <div className="min-w-0 lg:flex-1">
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#0B1533]">{visibleDurationDays}-Day Programme Progress</span>
            <span className={cn("font-mono text-[11px]", programmeOverdue ? "font-semibold text-[#C0392B]" : "text-[#5F6A88]")}>
              {isComplete ? (
                "Complete"
              ) : programmeOverdue ? (
                <>{daysOverdue120} DAY{daysOverdue120 === 1 ? "" : "S"} OVERDUE</>
              ) : (
                <>DAY {currentDay} OF {visibleDurationDays}</>
              )}
            </span>
          </div>
          <div className="relative h-5 rounded-full bg-[#EDF0F7]">
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700"
              style={{
                width: `${progressPct}%`,
                background: isComplete
                  ? "#177E48"
                  : programmeOverdue
                    ? "linear-gradient(90deg,#FDE8E6,#C0392B)"
                    : `linear-gradient(90deg, ${PHASE_TINT_HEX[activePhaseNumber] ?? PHASE_TINT_HEX[1]}, ${PHASE_HEX[activePhaseNumber] ?? PHASE_HEX[1]})`,
              }}
            />
            <div
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-[#071133] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-white shadow-[0_1px_3px_rgba(7,17,51,.35)]"
              style={{ left: `clamp(28px, ${progressPct}%, calc(100% - 28px))` }}
            >
              DAY {currentDay}
            </div>
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[9px] uppercase text-[#5F6A88]">
            <span>Day 1 ({formatDate(startDate).toUpperCase()})</span>
            <span>Day {visibleDurationDays} ({formatDate(addDays(startDate, visibleDurationDays - 1)).toUpperCase()})</span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap lg:shrink-0 lg:flex-nowrap">
          <StatChip icon={Clock} label="Days left" value={daysRemaining} />
          <StatChip icon={CheckCircle2} label="Phases done" value={phasesCompleted} />
          <StatChip icon={ListChecks} label="Deliverables" value={`${doneDeliverables}/${totalDeliverables}`} />
          <button
            type="button"
            onClick={onOpenStatusSummary}
            className="inline-flex cursor-pointer items-center gap-1.5 self-start rounded-full border border-[#E2E7F2] bg-white px-3.5 py-2 text-[12px] font-semibold text-[#3A4565] transition-colors hover:border-[#A8C6F5] hover:text-[#007BFF]"
          >
            <ClipboardList size={13} /> Status Summary
          </button>
        </div>
      </div>
    </div>
  );
}
