"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ListChecks, Search, TriangleAlert, X } from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { StatusChip } from "@/app/(hub)/dashboard/_components/dashboard-shared";
import { AssigneeMultiSelect, type AssigneeMember } from "@/app/(hub)/projects/_shared/_assignee-multi-select";
import { ListFilterBar } from "@/components/list-filters/list-filter-bar";
import { useListFilters } from "@/components/list-filters/use-list-filters";

export type AllTaskListItem = {
  id: string;
  title: string;
  displayId: string | null;
  status: string;
  priority: string | null;
  assignees: string[] | null;
  dueDate: string | null;
  createdAt: string;
  projectName: string;
  projectHref: string | null;
  taskHref: string | null;
};

export type AllTasksPaginationMeta = { page: number; pageSize: number; total: number };

const PAGE_SIZES = [20, 50, 100] as const;

// Task 493 — column headers stick to the top of the list scroller. A sticky cell in a collapsed-border table loses
// its own border, so the bottom hairline is an inset shadow instead.
const TH_CLASS =
  "sticky top-0 z-10 bg-[#F9FAFD] shadow-[inset_0_-1px_0_#E2E7F2] px-4 py-2.5 font-semibold text-[#5F6A88] text-[11px] uppercase tracking-wide";

// tasks.priority is lowercase (critical/high/normal/low/none) — a distinct convention from the
// dashboard-shared.tsx PriorityDot component, which expects the uppercase CRITICAL/HIGH/NORMAL/LOW
// casing used elsewhere (e.g. implementation_plans). Kept as a small local map rather than
// reusing that component with mismatched casing.
const PRIORITY_STYLE: Record<string, { label: string; color: string }> = {
  critical: { label: "Critical", color: "#C0392B" },
  high: { label: "High", color: "#E2762F" },
  normal: { label: "Normal", color: "#007BFF" },
  low: { label: "Low", color: "#5F6A88" },
  none: { label: "None", color: "#94A0BE" },
};

function PriorityLabel({ priority }: { priority: string | null }) {
  const s = PRIORITY_STYLE[priority ?? "none"] ?? PRIORITY_STYLE.none;
  return <span className="text-[11px] font-semibold" style={{ color: s.color }}>{s.label}</span>;
}

export default function AllTasksIndex({
  tasks: initialTasks,
  paginationMeta,
  currentUserId,
  isFiltered,
  loadError,
}: {
  tasks: AllTaskListItem[];
  paginationMeta: AllTasksPaginationMeta;
  currentUserId: string;
  // Server-computed: any of search / due / assignee / project narrowed this result (task 491).
  isFiltered: boolean;
  // The listing query's error message, when it failed — rendered instead of "No tasks yet".
  loadError: string | null;
}) {
  const searchParams = useSearchParams();
  // Task 491 — every URL change (search, filters, pagination) goes through the same transition,
  // so the table dims while the server re-queries.
  const filters = useListFilters(V2_ROUTES.DASHBOARD_TASKS);
  const { navigate, isPending } = filters;

  // Re-sync local state when the server hands us a new page/search result — same
  // adjusting-state-during-render pattern `_filed-issues-index.tsx` uses.
  const [prevInitialTasks, setPrevInitialTasks] = useState(initialTasks);
  const [tasks, setTasks] = useState(initialTasks);
  if (initialTasks !== prevInitialTasks) {
    setPrevInitialTasks(initialTasks);
    setTasks(initialTasks);
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

  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { page, pageSize, total } = paginationMeta;
  const from = (page - 1) * pageSize;
  const hasNext = from + pageSize < total;
  const hasPrev = page > 1;
  const showPagination = total > 0;

  // Task 493 — Projects › Tasks/Tickets tab pattern: the page header never scrolls; only the list below it does.
  // `scrolled` drives the header's hairline shadow, and every new result (page, page size, search, filter) starts
  // the list back at the top, since the inner scroller would otherwise keep the previous offset.
  const listRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const paramsKey = searchParams.toString();
  useEffect(() => {
    listRef.current?.scrollTo({ top: 0 });
  }, [paramsKey]);

  function resetSearchInput() {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setSearchInput("");
  }

  return (
    <div className="h-full flex flex-col min-h-0">
      {/* Fixed page header — positioned + z-20 so the Due date popover (absolute) overlays the list below. */}
      <div className={cn("relative z-20 shrink-0 bg-[#F4F6FB] transition-shadow duration-150", scrolled && "shadow-[0_1px_0_0_rgba(7,17,51,0.08)]")}>
        <div className="max-w-[1400px] mx-auto px-8 pt-6 pb-4">
          <div className="mb-4">
            <h1 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-[#0B1533]">Tasks</h1>
            <p className="text-[13px] text-[#5F6A88] mt-0.5">
              {isFiltered
                ? `${total} matching task${total === 1 ? "" : "s"}`
                : `${total} task${total === 1 ? "" : "s"} across all projects`}
            </p>
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
                    navigate({ search: q || null, page: 1 });
                  }, 300);
                }}
                placeholder="Search title or task ID…"
                aria-label="Search tasks"
                className="w-full pl-9 pr-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14] placeholder:text-[#5F6A88]"
              />
            </div>

            <ListFilterBar
              filters={filters}
              members={members}
              currentUserId={currentUserId}
              onClear={resetSearchInput}
            />

            <div className="flex-1 min-w-0" />

            {showPagination && (
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={pageSize}
                  onChange={(e) => navigate({ pageSize: Number(e.target.value), page: 1 })}
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
                    onClick={() => navigate({ page: 1 })}
                    disabled={!hasPrev}
                    className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                    title="First page"
                  >
                    <ChevronsLeft size={14} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => navigate({ page: page - 1 })}
                    disabled={!hasPrev}
                    className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                    title="Previous page"
                  >
                    <ChevronLeft size={14} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => navigate({ page: page + 1 })}
                    disabled={!hasNext}
                    className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                    title="Next page"
                  >
                    <ChevronRight size={14} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => navigate({ page: Math.ceil(total / pageSize) })}
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

      <div
        ref={listRef}
        onScroll={(e) => setScrolled(e.currentTarget.scrollTop > 4)}
        className="flex-1 min-h-0 overflow-y-auto scrollbar-light"
      >
        <div
          aria-busy={isPending}
          className={cn("max-w-[1400px] mx-auto px-8 py-5 transition-opacity duration-150", isPending && "opacity-60")}
        >
          {loadError ? (
            <div role="alert" className="flex flex-col items-center justify-center py-20 gap-3 rounded-[14px] border border-[#E2E7F2] bg-white">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[#FDECEA]">
                <TriangleAlert size={24} className="text-[#C0392B]" />
              </div>
              <div className="text-center">
                <div className="text-[15px] font-semibold text-[#0B1533]">Couldn&apos;t load tasks</div>
                <p className="text-[13px] text-[#5F6A88] mt-1 max-w-md">{loadError}</p>
              </div>
              <button
                onClick={() => { resetSearchInput(); filters.clearFilters(); }}
                className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] hover:bg-[#F0F7FF] cursor-pointer transition-colors"
              >
                <X size={13} /> Clear filters
              </button>
            </div>
          ) : tasks.length === 0 ? (
            isFiltered ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-[14px] border border-[#E2E7F2] bg-white">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[#FFF3D6]">
                  <Search size={24} className="text-[#8A5A00]" />
                </div>
                <div className="text-center">
                  <div className="text-[15px] font-semibold text-[#0B1533]">No tasks match your filters</div>
                  <p className="text-[13px] text-[#5F6A88] mt-1">Try a different search term or loosen the filters.</p>
                </div>
                <button
                  onClick={() => { resetSearchInput(); filters.clearFilters(); }}
                  className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] hover:bg-[#F0F7FF] cursor-pointer transition-colors"
                >
                  <X size={13} /> Clear filters
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-[14px] border border-[#E2E7F2] bg-white">
                <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[#F0F7FF]">
                  <ListChecks size={26} className="text-[#007BFF]" />
                </div>
                <div className="text-center">
                  <div className="text-[15px] font-semibold text-[#0B1533]">No tasks yet</div>
                  <p className="text-[13px] text-[#5F6A88] mt-1">Tasks created across any project will appear here.</p>
                </div>
              </div>
            )
          ) : (
            <div className="rounded-[14px] border border-[#E2E7F2] bg-white overflow-clip">
              {/* overflow-clip, not overflow-hidden: it rounds the corners without becoming a scroll container,
                  which would trap the sticky header cells inside the card. */}
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left">
                    <th className={TH_CLASS}>Task</th>
                    <th className={TH_CLASS}>Project</th>
                    <th className={TH_CLASS}>Status</th>
                    <th className={TH_CLASS}>Priority</th>
                    <th className={TH_CLASS}>Assignees</th>
                    <th className={TH_CLASS}>Due date</th>
                    <th className={TH_CLASS}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((t) => (
                    <tr key={t.id} className="border-b border-[#EDF0F7] last:border-b-0 hover:bg-[#F9FAFD] transition-colors">
                      <td className="px-4 py-3 max-w-[320px]">
                        {t.taskHref ? (
                          <Link href={t.taskHref} className="text-[#0B1533] font-medium hover:text-[#007BFF] hover:underline truncate block">
                            {t.title}
                          </Link>
                        ) : (
                          <span className="text-[#0B1533] font-medium truncate block">{t.title}</span>
                        )}
                        {t.displayId && <span className="text-[11px] font-mono text-[#94A0BE]">{t.displayId}</span>}
                      </td>
                      <td className="px-4 py-3 max-w-[200px]">
                        {t.projectHref ? (
                          <Link href={t.projectHref} className="text-[#3A4565] hover:text-[#007BFF] hover:underline truncate block">
                            {t.projectName}
                          </Link>
                        ) : (
                          <span className="text-[#3A4565] truncate block">{t.projectName}</span>
                        )}
                      </td>
                      <td className="px-4 py-3"><StatusChip status={t.status} /></td>
                      <td className="px-4 py-3"><PriorityLabel priority={t.priority} /></td>
                      <td className="px-4 py-3 min-w-[160px]">
                        <AssigneeMultiSelect value={t.assignees ?? []} members={members} onChange={() => {}} editable={false} />
                      </td>
                      <td className="px-4 py-3 text-[#5F6A88] whitespace-nowrap">
                        {t.dueDate ? formatDate(t.dueDate) : "—"}
                      </td>
                      <td className="px-4 py-3 text-[#5F6A88] whitespace-nowrap">
                        {formatDate(t.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
