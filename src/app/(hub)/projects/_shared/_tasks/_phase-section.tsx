"use client";

import type { ReactNode } from "react";
import { CalendarDays, ChevronDown, ChevronRight, Flag } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Milestone, formatDueDate, decodeHtmlEntities } from "@/app/(hub)/projects-old/_pm-shared";
import { DropLine, TriCheckbox } from "./_drag-parts";
import { phaseNumber, phaseTone } from "./_tree-colors";
import type { Zone } from "./_move-rules";

type Check = { checked: boolean; indeterminate: boolean; disabled: boolean; onChange: () => void };

// Task 487 — phase band (milestone) above its task lists. `milestone` null = the trailing "No phase" section.
export function PhaseSection({ milestone, number, allMilestones, done, total, collapsed, onToggle, check, handle, drop, compact, dropId, children }: {
  milestone: Milestone | null;
  number: number | null;
  allMilestones: Milestone[];
  done: number;
  total: number;
  collapsed: boolean;
  onToggle: () => void;
  check: Check;
  handle?: ReactNode;
  drop?: Zone | null;
  compact?: boolean;
  dropId: string;
  children: ReactNode;
}) {
  const tone = phaseTone(milestone);
  const name = milestone ? decodeHtmlEntities(milestone.name) : "No phase";
  const pct = total ? Math.round((done / total) * 100) : 0;
  const late = !!milestone?.due_date && milestone.status !== "completed" && milestone.due_date < new Date().toISOString().slice(0, 10);

  return (
    <section aria-label={name}>
      <div
        data-drop-id={dropId}
        className={cn(
          "group/row relative flex items-center gap-2.5 pl-4 pr-4 bg-[#F4F6FB] border-b border-[#E2E7F2]",
          compact ? "py-2" : "py-2.5",
          drop === "into" && "ring-1 ring-inset ring-[#007BFF] bg-[#F0F7FF]",
        )}
      >
        <span aria-hidden className={cn("absolute inset-y-0 left-0 w-0.75", tone.stripe)} />
        {handle && <div className="absolute left-0.5 top-1/2 -translate-y-1/2">{handle}</div>}
        {(drop === "before" || drop === "after") && <DropLine edge={drop === "before" ? "top" : "bottom"} full />}
        <div className="flex shrink-0 items-center">
          <TriCheckbox {...check} label={`Select all tasks in ${name}`} />
        </div>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]"
        >
          {collapsed ? <ChevronRight size={14} className="shrink-0 text-[#5F6A88]" /> : <ChevronDown size={14} className="shrink-0 text-[#5F6A88]" />}
          <span className={cn("flex size-6 shrink-0 items-center justify-center rounded-[7px]", tone.tile)}>
            <Flag size={12} aria-hidden />
          </span>
          {number !== null && milestone && (
            <span className="shrink-0 rounded-[5px] border border-[#E2E7F2] bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wide text-[#3A4565]">
              Phase {phaseNumber(milestone, number, allMilestones)}
            </span>
          )}
          <span className="truncate text-[14px] font-bold text-[#0B1533]">{name}</span>
        </button>
        <div className="flex shrink-0 items-center gap-2" title={`${done} of ${total} tasks closed`}>
          <span className="text-[11px] text-[#5F6A88]"><span className="font-mono font-semibold text-[#0B1533]">{done}</span> of {total} tasks</span>
          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[#E2E7F2]" aria-hidden>
            <span className="block h-full w-(--pct) rounded-full bg-[#007BFF]" style={{ "--pct": `${pct}%` } as React.CSSProperties} />
          </span>
        </div>
        {milestone?.due_date && (
          <span className={cn("flex shrink-0 items-center gap-1 font-mono text-[11px] font-medium", late ? "text-[#C0392B]" : "text-[#3A4565]")}>
            <CalendarDays size={12} aria-hidden /> Due {formatDueDate(milestone.due_date)}
          </span>
        )}
      </div>
      {!collapsed && children}
    </section>
  );
}
