"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Inbox, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { TicketsTable } from "./_tickets-table";
import { FilterMultiSelect } from "./_filter-multi-select";
import { parseStatusFilterParam, STATUS_FILTER_OPTIONS } from "./_status-filter";

export type TicketStatus = "open" | "on_hold" | "escalated" | "closed";

export type TicketListItem = {
  id: string;
  ticketNumber: number;
  ticketId: string;
  displayId: string;
  subject: string;
  status: TicketStatus;
  contactName: string;
  accountName: string | null;
  owner: string;
  respondedAt: string | null;
  dueAt: string | null;
  isOverdue: boolean;
};

export type PaginationMeta = { page: number; pageSize: number; total: number };

const PAGE_SIZES = [20, 50, 100] as const;

export default function TicketsIndex({
  tickets,
  paginationMeta,
}: {
  tickets: TicketListItem[];
  paginationMeta: PaginationMeta;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");
  const statusSelected = parseStatusFilterParam(searchParams.get("status"));
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [scrolled, setScrolled] = useState(false);

  function buildUrl(overrides: Record<string, string | number | null>) {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) { p.delete(k); } else { p.set(k, String(v)); }
    }
    return `${V2_ROUTES.DESK_TICKETS}?${p.toString()}`;
  }

  function handleStatusChange(next: string[]) {
    const value = next.length === 0 ? "" : next.length === STATUS_FILTER_OPTIONS.length ? "all" : next.join(",");
    router.push(buildUrl({ status: value, page: 1 }));
  }

  const { page, pageSize, total } = paginationMeta;
  const from = (page - 1) * pageSize;
  const hasNext = from + pageSize < total;
  const hasPrev = page > 1;
  const showPagination = total > 0;
  const isFiltered = (searchParams.get("search")?.trim().length ?? 0) > 0 || statusSelected.length !== STATUS_FILTER_OPTIONS.length;

  return (
    <div onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)} className="h-full overflow-y-auto">
      {/* ── Sticky header (title row + toolbar row) ─────────────────────────── */}
      <div className={cn("sticky top-0 z-20 bg-[#F4F6FB] transition-shadow duration-150", scrolled && "shadow-[0_1px_0_0_rgba(7,17,51,0.08)]")}>
        <div className="max-w-[1400px] mx-auto px-8 pt-6 pb-4">
          {/* Title row */}
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-[#0B1533]">Tickets</h1>
              <p className="text-[13px] text-[#5F6A88] mt-0.5">{total} ticket{total === 1 ? "" : "s"}</p>
            </div>
          </div>

          {/* Toolbar row: search + status filter + pagination (right) */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative min-w-[220px] max-w-md flex-shrink-0">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5F6A88]" />
              <input
                value={searchInput}
                onChange={(e) => {
                  const q = e.target.value;
                  setSearchInput(q);
                  if (debounceRef.current) clearTimeout(debounceRef.current);
                  debounceRef.current = setTimeout(() => {
                    router.push(buildUrl({ search: q || null, page: 1 }));
                  }, 300);
                }}
                placeholder="Search subject, requester email, or ticket ID…"
                className="w-full pl-9 pr-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14] placeholder:text-[#5F6A88]"
              />
            </div>

            {/* Status filter — checkbox multi-select dropdown, matching Portfolio Tracker/Projects'
                FilterMultiSelect design (task 309 follow-up). */}
            <FilterMultiSelect
              label="Status"
              options={STATUS_FILTER_OPTIONS}
              selected={statusSelected}
              onChange={handleStatusChange}
            />

            {/* Spacer */}
            <div className="flex-1 min-w-0" />

            {/* Pagination controls — only when there are results */}
            {showPagination && (
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={pageSize}
                  onChange={(e) => router.push(buildUrl({ pageSize: Number(e.target.value), page: 1 }))}
                  className="h-8 px-2.5 pr-7 rounded-[10px] border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] outline-none focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14] cursor-pointer appearance-none"
                  style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235F6A88'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
                >
                  {PAGE_SIZES.map((n) => (
                    <option key={n} value={n}>{n} per page</option>
                  ))}
                </select>
                <span className="text-[12px] font-mono text-[#5F6A88] tabular-nums">
                  {from + 1}–{Math.min(from + pageSize, total)} of {total}
                </span>
                <div className="flex items-center gap-1 text-[#5F6A88]">
                  <button
                    onClick={() => router.push(buildUrl({ page: 1 }))}
                    disabled={!hasPrev}
                    className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                    title="First page"
                  >
                    <ChevronsLeft size={14} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => router.push(buildUrl({ page: page - 1 }))}
                    disabled={!hasPrev}
                    className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                    title="Previous page"
                  >
                    <ChevronLeft size={14} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => router.push(buildUrl({ page: page + 1 }))}
                    disabled={!hasNext}
                    className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                    title="Next page"
                  >
                    <ChevronRight size={14} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => router.push(buildUrl({ page: Math.ceil(total / pageSize) }))}
                    disabled={!hasNext}
                    className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                    title="Last page"
                  >
                    <ChevronsRight size={14} strokeWidth={2} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Scrollable content ───────────────────────────────────────────────── */}
      <div className="max-w-[1400px] mx-auto px-8 py-5">
        {tickets.length === 0 ? (
          isFiltered ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-[14px] border border-[#E2E7F2] bg-white">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[#FFF3D6]">
                <Search size={24} className="text-[#8A5A00]" />
              </div>
              <div className="text-center">
                <div className="text-[15px] font-semibold text-[#0B1533]">No tickets match your filters</div>
                <p className="text-[13px] text-[#5F6A88] mt-1">Try a different search term or clear the status filter.</p>
              </div>
              <button
                onClick={() => { setSearchInput(""); router.push(`${V2_ROUTES.DESK_TICKETS}?status=all`); }}
                className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] hover:bg-[#F0F7FF] cursor-pointer transition-colors"
              >
                <X size={13} /> Clear filters
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-[14px] border border-[#E2E7F2] bg-white">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[#F0F7FF]">
                <Inbox size={26} className="text-[#007BFF]" />
              </div>
              <div className="text-center">
                <div className="text-[15px] font-semibold text-[#0B1533]">No tickets yet</div>
                <p className="text-[13px] text-[#5F6A88] mt-1">Imported and incoming Desk tickets will appear here.</p>
              </div>
            </div>
          )
        ) : (
          <TicketsTable tickets={tickets} />
        )}
      </div>
    </div>
  );
}
