"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ListChecks, Search, X } from "lucide-react";
import { formatDate } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { StatusChip } from "@/app/(hub)/dashboard/_components/dashboard-shared";
import { AssigneeMultiSelect, type AssigneeMember } from "@/app/(hub)/projects/_shared/_assignee-multi-select";

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
}: {
  tasks: AllTaskListItem[];
  paginationMeta: AllTasksPaginationMeta;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

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

  function buildUrl(overrides: Record<string, string | number | null>) {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) { p.delete(k); } else { p.set(k, String(v)); }
    }
    return `${V2_ROUTES.DASHBOARD_TASKS}?${p.toString()}`;
  }

  const { page, pageSize, total } = paginationMeta;
  const from = (page - 1) * pageSize;
  const hasNext = from + pageSize < total;
  const hasPrev = page > 1;
  const showPagination = total > 0;
  const isFiltered = (searchParams.get("search")?.trim().length ?? 0) > 0;

  return (
    <div className="h-full overflow-y-auto scrollbar-light">
      <div className="max-w-[1400px] mx-auto px-8 pt-6 pb-4">
        <div className="mb-4">
          <h1 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-[#0B1533]">Tasks</h1>
          <p className="text-[13px] text-[#5F6A88] mt-0.5">
            {total} task{total === 1 ? "" : "s"} across all projects
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
                  router.push(buildUrl({ search: q || null, page: 1 }));
                }, 300);
              }}
              placeholder="Search title or task ID…"
              className="w-full pl-9 pr-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14] placeholder:text-[#5F6A88]"
            />
          </div>

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

      <div className="max-w-[1400px] mx-auto px-8 py-5">
        {tasks.length === 0 ? (
          isFiltered ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-[14px] border border-[#E2E7F2] bg-white">
              <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[#FFF3D6]">
                <Search size={24} className="text-[#8A5A00]" />
              </div>
              <div className="text-center">
                <div className="text-[15px] font-semibold text-[#0B1533]">No tasks match your search</div>
                <p className="text-[13px] text-[#5F6A88] mt-1">Try a different search term.</p>
              </div>
              <button
                onClick={() => { setSearchInput(""); router.push(V2_ROUTES.DASHBOARD_TASKS); }}
                className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] hover:bg-[#F0F7FF] cursor-pointer transition-colors"
              >
                <X size={13} /> Clear search
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
          <div className="rounded-[14px] border border-[#E2E7F2] bg-white overflow-hidden">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#E2E7F2] bg-[#F9FAFD] text-left">
                  <th className="px-4 py-2.5 font-semibold text-[#5F6A88] text-[11px] uppercase tracking-wide">Task</th>
                  <th className="px-4 py-2.5 font-semibold text-[#5F6A88] text-[11px] uppercase tracking-wide">Project</th>
                  <th className="px-4 py-2.5 font-semibold text-[#5F6A88] text-[11px] uppercase tracking-wide">Status</th>
                  <th className="px-4 py-2.5 font-semibold text-[#5F6A88] text-[11px] uppercase tracking-wide">Priority</th>
                  <th className="px-4 py-2.5 font-semibold text-[#5F6A88] text-[11px] uppercase tracking-wide">Assignees</th>
                  <th className="px-4 py-2.5 font-semibold text-[#5F6A88] text-[11px] uppercase tracking-wide">Due date</th>
                  <th className="px-4 py-2.5 font-semibold text-[#5F6A88] text-[11px] uppercase tracking-wide">Created</th>
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
  );
}
