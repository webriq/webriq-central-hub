"use client";

import Link from "next/link";
import { Clock, CheckCircle2, ClipboardList, ListChecks, CalendarX } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { shiftDays, type GenericTimeline } from "@/lib/programme/generic-timeline";
import { StatChip } from "./_onboarding-detail";

// Task 420 — generic-engine "N-Day Programme Progress" card. Day count, axis dates and state all
// come from `buildTimeline` (milestone Start/Due dates), not the programme start date.
export function GenericProgressCard({
  timeline, phasesDone, phasesTotal, deliverables, doneTasks, totalTasks, projectUrlKey,
}: {
  timeline: GenericTimeline;
  phasesDone: number;
  phasesTotal: number;
  deliverables: number;
  doneTasks: number;
  totalTasks: number;
  projectUrlKey: string;
}) {
  const { origin, totalDays, currentDay, state, undated } = timeline;
  const overdue = state === "overdue";
  const shownDay = Math.min(Math.max(currentDay, 1), totalDays);
  const pct = state === "upcoming" ? 0 : state === "running" ? Math.round((currentDay / totalDays) * 100) : 100;
  const daysLeft = state === "upcoming" ? totalDays : Math.max(0, totalDays - currentDay);
  const daysOver = currentDay - totalDays;
  const startsIn = 1 - currentDay;

  const status =
    state === "complete" ? "Complete"
    : state === "upcoming" ? `STARTS IN ${startsIn} DAY${startsIn === 1 ? "" : "S"}`
    : overdue ? `${daysOver} DAY${daysOver === 1 ? "" : "S"} OVERDUE`
    : `DAY ${currentDay} OF ${totalDays}`;

  return (
    <div className="rounded-2xl border border-[#E2E7F2] bg-white p-6 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
        <div className="min-w-0 lg:flex-1">
          <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
            <span className="text-[11px] font-bold uppercase tracking-wide text-[#0B1533]">{totalDays}-Day Programme Progress</span>
            <span className={cn("font-mono text-[11px]", overdue ? "font-semibold text-[#C0392B]" : "text-[#5F6A88]")}>{status}</span>
          </div>
          <div className="relative h-5 rounded-full bg-[#EDF0F7]">
            <div
              className={cn(
                "absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 motion-reduce:transition-none",
                state === "complete" ? "bg-[#177E48]" : overdue ? "bg-[#C0392B]" : "bg-[#007BFF]"
              )}
              style={{ width: `${pct}%` }}
            />
            {state !== "upcoming" && (
              <div
                className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-[#071133] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-white shadow-[0_1px_3px_rgba(7,17,51,.35)]"
                style={{ left: `clamp(28px, ${pct}%, calc(100% - 28px))` }}
              >
                DAY {shownDay}
              </div>
            )}
          </div>
          <div className="mt-1.5 flex justify-between font-mono text-[9px] uppercase text-[#5F6A88]">
            <span>Day 1 ({formatDate(origin).toUpperCase()})</span>
            <span>Day {totalDays} ({formatDate(shiftDays(origin, totalDays - 1)).toUpperCase()})</span>
          </div>
          {undated.length > 0 && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-[#8A5A00]">
              <CalendarX size={12} className="shrink-0" />
              {undated.length} phase{undated.length === 1 ? "" : "s"} without dates ({undated.map((m) => m.name).join(", ")}) —{" "}
              <Link href={`/projects/v2/${projectUrlKey}/milestones`} className="font-semibold underline hover:text-[#007BFF]">
                set Start and Due
              </Link>
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap lg:shrink-0 lg:flex-nowrap">
          <StatChip icon={Clock} label="Days left" value={daysLeft} />
          <StatChip icon={CheckCircle2} label="Phases done" value={`${phasesDone}/${phasesTotal}`} />
          <StatChip icon={ClipboardList} label="Deliverables" value={deliverables} />
          <StatChip icon={ListChecks} label="Tasks done" value={`${doneTasks}/${totalTasks}`} />
        </div>
      </div>
    </div>
  );
}
