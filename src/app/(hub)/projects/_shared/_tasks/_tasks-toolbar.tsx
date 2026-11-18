"use client";

import { LayoutGrid, List as ListIcon, Calendar as CalendarIcon, Plus, X, Search, ChevronsUpDown, Rows3, Rows4 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { STATUS_LABEL, PRIORITY_STYLE } from "@/app/(hub)/projects-old/_pm-shared";
import { FilterMultiSelect, SortSelect, type FilterOption } from "../_list-toolbar-controls";
import { STATUS_OPTS, PRIORITY_OPTS, SORT_OPTIONS } from "./_task-options";
import type { useTaskFilters } from "./_use-task-filters";

export type ViewId = "board" | "list" | "calendar";
export type Density = "comfortable" | "compact";

const VIEWS: { id: ViewId; label: string; icon: React.ReactNode }[] = [
  { id: "list", label: "List", icon: <ListIcon size={15} /> },
  { id: "board", label: "Board", icon: <LayoutGrid size={15} /> },
  { id: "calendar", label: "Calendar", icon: <CalendarIcon size={15} /> },
];
const STATUS_FILTER_OPTIONS = STATUS_OPTS.map((s) => ({ value: s, label: STATUS_LABEL[s] }));
const PRIORITY_FILTER_OPTIONS = PRIORITY_OPTS.map((p) => ({ value: p, label: PRIORITY_STYLE[p].label }));

const PILL = "inline-flex items-center gap-1.5 px-3 py-[6.5px] rounded-full border border-[#E2E7F2] bg-white text-[11px] font-semibold text-[#3A4565] hover:border-[#A8C6F5] hover:text-[#0B1533] transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]";

/** Navy-selected icon segmented control (List/Board/Calendar, density). Shared with the Tickets toolbar. */
export function Segmented<T extends string>({ value, onChange, items }: {
  value: T; onChange: (v: T) => void; items: { id: T; label: string; icon: React.ReactNode }[];
}) {
  return (
    <div className="flex items-center gap-0.5 border border-[#E2E7F2] rounded-full p-1 bg-white shrink-0">
      {items.map((it) => (
        <Tooltip key={it.id}>
          <TooltipTrigger render={
            <button
              type="button"
              onClick={() => onChange(it.id)}
              aria-label={it.label}
              aria-pressed={value === it.id}
              className={cn(
                "p-1.5 rounded-full transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]",
                value === it.id ? "bg-[#071133] text-white" : "text-[#5F6A88] hover:text-[#0B1533]"
              )}
            >
              {it.icon}
            </button>
          } />
          <TooltipContent side="top">{it.label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

export function ViewToggle({ value, onChange }: { value: ViewId; onChange: (v: ViewId) => void }) {
  return <Segmented value={value} onChange={onChange} items={VIEWS.map((v) => ({ ...v, label: `${v.label} view` }))} />;
}

const DENSITIES: { id: Density; label: string; icon: React.ReactNode }[] = [
  { id: "comfortable", label: "Comfortable rows", icon: <Rows3 size={15} /> },
  { id: "compact", label: "Compact rows", icon: <Rows4 size={15} /> },
];

export function TasksToolbar({ f, assigneeOptions, view, onView, density, onDensity, onNewTask }: {
  f: ReturnType<typeof useTaskFilters>;
  assigneeOptions: FilterOption[];
  view: ViewId;
  onView: (v: ViewId) => void;
  density: Density;
  onDensity: (d: Density) => void;
  onNewTask: () => void;
}) {
  const sortValue = SORT_OPTIONS.find((o) => o.key === f.sortKey && o.dir === f.sortDir)?.value ?? "status_asc";
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 px-8 py-2.5 bg-white border-b border-[#E2E7F2] shrink-0">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5F6A88] pointer-events-none" />
          <input
            value={f.search}
            onChange={(e) => f.setSearch(e.target.value)}
            placeholder="Search tasks or tasklists…"
            aria-label="Search tasks or tasklists"
            className="w-56 pl-8 pr-3 py-[6.5px] rounded-[10px] border text-[12px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14] placeholder:text-[#5F6A88]"
          />
        </div>
        <FilterMultiSelect label="Status" options={STATUS_FILTER_OPTIONS} selected={f.statusFilter} onChange={f.setStatusFilter} />
        <FilterMultiSelect label="Priority" options={PRIORITY_FILTER_OPTIONS} selected={f.priorityFilter} onChange={f.setPriorityFilter} />
        <FilterMultiSelect label="Assignee" options={assigneeOptions} selected={f.assigneeFilter} onChange={f.setAssigneeFilter} />
        <SortSelect
          value={sortValue}
          onChange={(v) => { const o = SORT_OPTIONS.find((x) => x.value === v); if (o) { f.setSortKey(o.key); f.setSortDir(o.dir); } }}
          options={SORT_OPTIONS}
        />
        <label className="inline-flex items-center gap-2 px-1 text-[11px] font-semibold text-[#3A4565] cursor-pointer select-none shrink-0">
          <button
            type="button"
            role="switch"
            aria-checked={f.showCompleted}
            onClick={() => f.setShowCompleted(!f.showCompleted)}
            className={cn(
              "relative w-7 h-4 rounded-full transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]",
              f.showCompleted ? "bg-[#007BFF]" : "bg-[#C9D0E0]"
            )}
          >
            <span className={cn("absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform", f.showCompleted && "translate-x-3")} />
          </button>
          Show completed
        </label>
        {f.hasActiveFilters && (
          <button onClick={f.clearFilters} className={PILL}>
            <X size={12} /> Clear filters
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {view === "list" && (
          <>
            <button onClick={f.toggleCollapseAll} className={PILL}>
              <ChevronsUpDown size={12} />
              {f.anyCollapsed ? "Expand all" : "Collapse all"}
            </button>
            <Segmented value={density} onChange={onDensity} items={DENSITIES} />
          </>
        )}
        <ViewToggle value={view} onChange={onView} />
        <button
          onClick={onNewTask}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FB914E] text-[#471F02] text-[12.5px] font-medium hover:bg-[#E2762F] hover:text-white transition-colors cursor-pointer shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#007BFF]"
        >
          <Plus size={15} /> New Task
        </button>
      </div>
    </div>
  );
}
