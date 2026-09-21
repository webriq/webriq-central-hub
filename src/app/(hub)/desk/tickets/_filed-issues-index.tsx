"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Bug, Search, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import type { AssigneeMember } from "@/app/(hub)/projects/_shared/_assignee-multi-select";
import { FiledIssuesTable } from "./_filed-issues-table";
import { FilterMultiSelect } from "./_filter-multi-select";
import { NewTicketModal } from "./_new-ticket-modal";
import { STATUS_FILTER_OPTIONS, ALL_STATUS_VALUES, parseStatusFilterParam } from "./_status-filter";

export type FiledIssueListItem = {
  id: string;
  title: string;
  displayId: string | null;
  status: string;
  severity: string | null;
  assignees: string[] | null;
  assigneeId: string | null;
  createdAt: string;
  projectHref: string | null;
  ticketHref: string | null;
  projectName: string;
  // Task 383 — true when `source_inbox_id` is null (created via "New Ticket" here, or directly
  // on a project's own Tickets tab), driving the Origin column's "Manual" vs "Inbox" rendering.
  isManual: boolean;
  // The origin `inbox` row's UUID `id` — routing key for `/desk/inbox/[ticketId]` since task 382
  // moved that route off the display `ticket_id` ("TKT-<n>"). Empty string when `isManual`.
  inboxId: string;
  ticketId: string;
  ticketSubject: string;
  // Origin ticket's own fields — moved here from the Inbox list table (still task 363's
  // follow-up), distinct from this issue's own `status`/`createdAt` above. `ticketStatus` itself
  // moved back to the Inbox table (task 370), now editable there.
  ticketRespondedAt: string | null;
  ticketDueAt: string | null;
  ticketOverdue: boolean;
  // Whole days past the SLA due date — only meaningful when `ticketOverdue` is true (task 383).
  ticketOverdueDays: number | null;
  totalHours: number;
};

export type PaginationMeta = { page: number; pageSize: number; total: number };

const PAGE_SIZES = [20, 50, 100] as const;

export default function FiledIssuesIndex({
  issues: initialIssues,
  paginationMeta,
  inboxFiledCount,
  manualCreatedCount,
}: {
  issues: FiledIssueListItem[];
  paginationMeta: PaginationMeta;
  inboxFiledCount: number;
  manualCreatedCount: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [newTicketOpen, setNewTicketOpen] = useState(false);

  // Task 383 follow-up — the table's own column-header row sticks just below this sticky page
  // header, so it stays pinned while scrolling through a long list. Its `top` offset has to be
  // this header's live rendered height (not a hardcoded guess — the toolbar row wraps at some
  // viewport widths, changing the header's height), tracked via ResizeObserver and handed down
  // to `FiledIssuesTable`.
  const pageHeaderRef = useRef<HTMLDivElement>(null);
  const [pageHeaderHeight, setPageHeaderHeight] = useState(0);
  useEffect(() => {
    const el = pageHeaderRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setPageHeaderHeight(entry.contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Re-sync local state when the server hands us a new page/filter result — the React-docs
  // "adjusting state when a prop changes" pattern (comparing during render), not an effect, so it
  // doesn't trip `react-hooks/set-state-in-effect`'s cascading-render warning.
  const [prevInitialIssues, setPrevInitialIssues] = useState(initialIssues);
  const [issues, setIssues] = useState(initialIssues);
  if (initialIssues !== prevInitialIssues) {
    setPrevInitialIssues(initialIssues);
    setIssues(initialIssues);
  }

  const [members, setMembers] = useState<AssigneeMember[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/staff/members")
      .then((res) => (res.ok ? res.json() : []))
      .then((data: AssigneeMember[]) => { if (!cancelled) setMembers(data); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Optimistic PATCH — same pattern as `_project-detail.tsx`'s `updateTicket`: apply locally,
  // roll back on failure. `PATCH /api/v2/tickets/[ticketId]` (task 364, renamed from
  // `/api/v2/issues/[issueId]`) is project-agnostic (no projectId in the URL), which is exactly
  // why this cross-project listing can reuse it as-is.
  async function updateIssue(id: string, patch: { status?: string; assignees?: string[]; severity?: string }): Promise<boolean> {
    const snapshot = issues;
    setIssues((prev) => prev.map((i) => (i.id === id
      ? {
          ...i,
          ...(patch.status ? { status: patch.status } : {}),
          ...(patch.assignees ? { assignees: patch.assignees, assigneeId: patch.assignees[0] ?? null } : {}),
          ...(patch.severity ? { severity: patch.severity } : {}),
        }
      : i)));
    const res = await fetch(`/api/v2/tickets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) { setIssues(snapshot); return false; }
    return true;
  }

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
    const isAllStatuses = next.length === ALL_STATUS_VALUES.length && ALL_STATUS_VALUES.every((v) => next.includes(v));
    const value = next.length === 0 ? "" : isAllStatuses ? "all" : next.join(",");
    router.push(buildUrl({ status: value, page: 1 }));
  }

  const { page, pageSize, total } = paginationMeta;
  const from = (page - 1) * pageSize;
  const hasNext = from + pageSize < total;
  const hasPrev = page > 1;
  const showPagination = total > 0;
  const isAllStatusView = statusSelected.length === ALL_STATUS_VALUES.length && ALL_STATUS_VALUES.every((v) => statusSelected.includes(v));
  const isFiltered = (searchParams.get("search")?.trim().length ?? 0) > 0 || !isAllStatusView;

  return (
    <div onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)} className="h-full overflow-y-auto scrollbar-light">
      {/* ── Sticky header (title row + toolbar row) ─────────────────────────── */}
      <div
        ref={pageHeaderRef}
        className={cn("sticky top-0 z-20 bg-[#F4F6FB] transition-shadow duration-150", scrolled && "shadow-[0_1px_0_0_rgba(7,17,51,0.08)]")}
      >
        <div className="max-w-[1400px] mx-auto px-8 pt-6 pb-4">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-[#0B1533]">Tickets</h1>
              <p className="text-[13px] text-[#5F6A88] mt-0.5">
                {inboxFiledCount} ticket{inboxFiledCount === 1 ? "" : "s"} filed from Inbox, {manualCreatedCount} manual created
              </p>
            </div>
            {/* Brand-orange, matching the "New Ticket" button on a project's own Tickets tab
                (`_project-detail.tsx`) rather than the blue used for links/navigation elsewhere
                on this page — task 383 follow-up. */}
            <button
              onClick={() => setNewTicketOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FB914E] text-[#471F02] text-[12.5px] font-medium hover:bg-[#E2762F] hover:text-white cursor-pointer transition-colors shrink-0"
            >
              <Plus size={15} /> New Ticket
            </button>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
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
                placeholder="Search title or issue ID…"
                className="w-full pl-9 pr-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14] placeholder:text-[#5F6A88]"
              />
            </div>

            <FilterMultiSelect
              label="Status"
              options={STATUS_FILTER_OPTIONS}
              selected={statusSelected}
              onChange={handleStatusChange}
            />

            <div className="flex-1 min-w-0" />

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
        {issues.length === 0 ? (
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
                <Bug size={26} className="text-[#007BFF]" />
              </div>
              <div className="text-center">
                <div className="text-[15px] font-semibold text-[#0B1533]">No tickets yet</div>
                <p className="text-[13px] text-[#5F6A88] mt-1">
                  Tickets filed from an Inbox thread message (&ldquo;File a Ticket&rdquo;) or created
                  manually with &ldquo;New Ticket&rdquo; will appear here.
                </p>
              </div>
            </div>
          )
        ) : (
          <FiledIssuesTable issues={issues} allMembers={members} onUpdate={updateIssue} stickyTop={pageHeaderHeight} />
        )}
      </div>

      {newTicketOpen && (
        <NewTicketModal
          onClose={() => setNewTicketOpen(false)}
          onCreated={() => {
            setNewTicketOpen(false);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
