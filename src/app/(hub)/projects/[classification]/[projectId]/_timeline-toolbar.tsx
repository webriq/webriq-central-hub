"use client";

import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGanttZoom } from "./_gantt-zoom-context";
import { filtersActive, type StatusFilter, type TimelineFilters } from "./_use-timeline-filters";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "overdue", label: "Overdue" },
  { value: "in-progress", label: "In progress" },
  { value: "done", label: "Done" },
];

const FIELD = "h-8 rounded-lg border border-[#E2E7F2] bg-white px-2.5 text-[12px] text-[#0B1533] outline-none transition-colors focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14]";

// Task 422 — zoom toggle + status/owner/name filters above the grid, for both Timeline engines.
// `owners` is omitted for the generic engine (tasklists carry no owner).
export function TimelineToolbar({
  filters, onChange, onClear, shown, total, owners,
}: {
  filters: TimelineFilters;
  onChange: (patch: Partial<TimelineFilters>) => void;
  onClear: () => void;
  shown: number;
  total: number;
  owners?: string[];
}) {
  const { zoom, setZoom } = useGanttZoom();
  const active = filtersActive(filters);

  return (
    <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Timeline view and filters">
      <div className="inline-flex rounded-lg border border-[#E2E7F2] bg-white p-0.5" role="group" aria-label="Zoom">
        {(["day", "week"] as const).map((z) => (
          <button
            key={z}
            type="button"
            onClick={() => setZoom(z)}
            aria-pressed={zoom === z}
            className={cn(
              "cursor-pointer rounded-md px-3 py-1 text-[12px] font-semibold capitalize transition-colors",
              zoom === z ? "bg-[#071133] text-white" : "text-[#3A4565] hover:bg-[#F4F6FB]"
            )}
          >
            {z}
          </button>
        ))}
      </div>

      <select value={filters.status} onChange={(e) => onChange({ status: e.target.value as StatusFilter })} aria-label="Filter by status" className={cn(FIELD, "cursor-pointer")}>
        {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      {owners && owners.length > 0 && (
        <select value={filters.owner} onChange={(e) => onChange({ owner: e.target.value })} aria-label="Filter by owner" className={cn(FIELD, "cursor-pointer")}>
          <option value="">All owners</option>
          {owners.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      )}

      <div className="relative">
        <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5F6A88]" aria-hidden="true" />
        <input
          type="search"
          value={filters.q}
          onChange={(e) => onChange({ q: e.target.value })}
          placeholder="Search deliverables…"
          aria-label="Search deliverables"
          className={cn(FIELD, "w-52 pl-8")}
        />
      </div>

      {active && (
        <>
          <span role="status" className="font-mono text-[11px] text-[#5F6A88]">{shown} of {total} shown</span>
          <button
            type="button"
            onClick={onClear}
            className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-[#E2E7F2] bg-white px-2.5 py-1 text-[11px] font-semibold text-[#3A4565] transition-colors hover:border-[#A8C6F5] hover:text-[#007BFF]"
          >
            <X size={11} aria-hidden="true" /> Clear filters
          </button>
        </>
      )}
    </div>
  );
}
