"use client";

import { CalendarDays } from "lucide-react";
import { formatDueDate } from "@/app/(hub)/projects-old/_pm-shared";

// Task 487 — project progress (all non-checklist tasks incl. subtasks, unfiltered: it is the project's
// progress, not the current view's). Target date = latest phase due date, else the project end date.
export function TasksProgressStrip({ tasks, milestones, projectEndDate }: {
  tasks: { status: string }[];
  milestones: { due_date: string | null }[];
  projectEndDate: string | null;
}) {
  const total = tasks.length;
  if (total === 0) return null;
  const done = tasks.filter((t) => t.status === "closed").length;
  const pct = Math.round((done / total) * 100);
  const target = milestones.map((m) => m.due_date).filter((d): d is string => !!d).sort().at(-1) ?? projectEndDate;

  return (
    <div className="mx-8 mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[14px] border border-[#E2E7F2] bg-white px-5 py-3.5 shadow-xs">
      <div className="flex items-baseline gap-2.5">
        <span className="text-[11px] font-semibold text-[#5F6A88]">Overall progress</span>
        <span className="font-heading text-[22px] font-bold leading-none tracking-[-0.02em] text-[#0B1533] tabular-nums">{pct}%</span>
      </div>
      <div
        role="progressbar"
        aria-label="Tasks completed"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 min-w-40 flex-1 rounded-full bg-[#EDF0F7] overflow-hidden"
      >
        <div className="h-full w-(--pct) rounded-full bg-[#007BFF]" style={{ "--pct": `${pct}%` } as React.CSSProperties} />
      </div>
      <div className="flex items-center gap-5 text-[11px] text-[#5F6A88]">
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[13px] font-semibold text-[#0B1533] tabular-nums">{done}</span>
          <span>completed</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="font-mono text-[13px] font-semibold text-[#0B1533] tabular-nums">{total - done}</span>
          <span>remaining</span>
        </div>
        {target && (
          <div className="flex items-center gap-1.5 border-l border-[#EDF0F7] pl-5">
            <CalendarDays size={13} className="text-[#5F6A88]" aria-hidden />
            <span>Target date</span>
            <span className="font-mono text-[12px] font-semibold text-[#0B1533]">{formatDueDate(target)}</span>
          </div>
        )}
      </div>
    </div>
  );
}
