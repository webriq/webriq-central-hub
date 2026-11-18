"use client";

import type { ReactNode } from "react";
import { ChevronDown, ChevronRight, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { decodeHtmlEntities } from "@/app/(hub)/projects-old/_pm-shared";
import { DropLine, TriCheckbox } from "./_drag-parts";
import type { Zone } from "./_move-rules";

type Check = { checked: boolean; indeterminate: boolean; disabled: boolean; onChange: () => void };

// Task 487 — task-list group header + its rows (moved from `_list-view.tsx` inline JSX).
export function TasklistGroup({ id, name, count, stripe, collapsed, onToggle, check, handle, drop, compact, onAddTask, children }: {
  id: string;
  name: string;
  count: number;
  stripe: string;
  collapsed: boolean;
  onToggle: () => void;
  check: Check;
  handle?: ReactNode;
  drop?: Zone | null;
  compact?: boolean;
  onAddTask?: () => void;
  children: ReactNode | null; // null = empty list
}) {
  const label = decodeHtmlEntities(name);
  return (
    // Task 241 — `?tasklist=<id>` deep links scroll to this id.
    <div id={`tasklist-group-${id}`}>
      <div
        data-drop-id={`group:${id}`}
        className={cn(
          "group/row relative flex items-center gap-2 pl-4 pr-3 bg-[#FAFBFE] border-b border-[#E2E7F2]",
          compact ? "py-1" : "py-1.5",
          drop === "into" && "ring-1 ring-inset ring-[#007BFF] bg-[#F0F7FF]",
        )}
      >
        {handle && <div className="absolute left-0 top-1/2 -translate-y-1/2">{handle}</div>}
        {(drop === "before" || drop === "after") && <DropLine edge={drop === "before" ? "top" : "bottom"} full />}
        <div className="flex shrink-0 items-center">
          <TriCheckbox {...check} label={`Select all tasks in ${label}`} />
        </div>
        <span aria-hidden className={cn("ml-1.5 h-5 w-0.75 shrink-0 rounded-full", stripe)} />
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          className="flex min-w-0 flex-1 items-center gap-2 py-1 pr-4 text-left cursor-pointer rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]"
        >
          {collapsed ? <ChevronRight size={13} className="shrink-0 text-[#5F6A88]" /> : <ChevronDown size={13} className="shrink-0 text-[#5F6A88]" />}
          <span className="truncate text-[13px] font-bold text-[#0B1533]">{label}</span>
          <span className="shrink-0 rounded-full bg-[#EDF0F7] px-1.5 py-0.5 font-mono text-[10px] font-semibold leading-none text-[#3A4565]">{count}</span>
        </button>
        {onAddTask && (
          <button
            type="button"
            onClick={onAddTask}
            aria-label={`Add task to ${label}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold text-[#0063D6] opacity-0 transition-colors hover:bg-[#E5F1FF] group-hover/row:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100 cursor-pointer focus-visible:outline-2 focus-visible:outline-[#007BFF]"
          >
            <Plus size={12} aria-hidden /> Add task
          </button>
        )}
      </div>
      {!collapsed && (children ?? (
        <div data-drop-id={`group:${id}`} className="py-3 pl-15 pr-4 border-b border-[#EDF0F7]">
          <p className="text-[12px] text-[#5F6A88]">No tasks in this list.</p>
        </div>
      ))}
    </div>
  );
}
