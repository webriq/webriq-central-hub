"use client";

import { useState, useCallback, useEffect, useRef } from "react";
// import { motion, useMotionValue, useTransform, useAnimationFrame } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  FolderKanban, Plus, Search, X, Loader2,
  LayoutGrid, List, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import {
  ProjectStatusBadge, ProjectTypeBadge, OwnerChip, CompletionRing,
  TagChip, businessDaysRemaining, PROJECT_TYPES,
} from "./_pm-shared";
import { twMerge } from "tailwind-merge";
import {
  animate,
  motion,
  useMotionTemplate,
  useMotionValue,
} from "motion/react";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProjectListItem = {
  id: string;
  name: string;
  project_type: string;
  status: string;
  customer_id: string;
  company_name: string;
  end_date: string | null;
  tags: string[];
  owner_name: string | null;
  task_total: number;
  task_done: number;
};

export type CustomerOption = { customer_id: string; company_name: string };
export type PaginationMeta = { page: number; pageSize: number; total: number };

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_FILTERS = ["all", "active", "on_hold", "completed", "archived"] as const;
const STATUS_LABELS: Record<string, string> = {
  all: "All", active: "Active", on_hold: "On Hold", completed: "Completed", archived: "Archived",
};
const GRID_PAGE_SIZES = [15, 45, 90] as const;
const LIST_PAGE_SIZES = [20, 50, 100] as const;

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProjectsIndex({
  projects,
  customers,
  paginationMeta,
  initialView = "grid",
  canManageTags = false,
}: {
  projects: ProjectListItem[];
  customers: CustomerOption[];
  paginationMeta: PaginationMeta;
  initialView?: "grid" | "list";
  canManageTags?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerFilter = searchParams.get("customer") ?? "";

  // URL-driven filter values — server is the source of truth.
  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");
  const statusValue = (searchParams.get("status") ?? "all") as (typeof STATUS_FILTERS)[number];
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [view, setView] = useState<"grid" | "list">(initialView);
  const [showCreate, setShowCreate] = useState(false);
  const [tagOverrides, setTagOverrides] = useState<Record<string, string[]>>({});
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const onScroll = () => setScrolled(main.scrollTop > 4);
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  const { page, pageSize, total } = paginationMeta;
  const from = (page - 1) * pageSize;

  const activeCustomer = customers.find((c) => c.customer_id === customerFilter);

  const removeTag = useCallback(async (projectId: string, currentTags: string[], tagToRemove: string) => {
    const next = currentTags.filter((t) => t !== tagToRemove);
    setTagOverrides((prev) => ({ ...prev, [projectId]: next }));
    await fetch(`/api/v2/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: next }),
    });
  }, []);

  function getTagsFor(p: ProjectListItem): string[] {
    return tagOverrides[p.id] ?? p.tags;
  }

  function buildUrl(overrides: Record<string, string | number | null>) {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) { p.delete(k); } else { p.set(k, String(v)); }
    }
    return `${V2_ROUTES.PROJECTS}?${p.toString()}`;
  }

  function handleViewChange(next: "grid" | "list") {
    setView(next);
    router.push(buildUrl({ view: next, pageSize: next === "grid" ? 15 : 20, page: 1 }));
  }

  const pageSizes = view === "grid" ? GRID_PAGE_SIZES : LIST_PAGE_SIZES;
  const hasNext = from + pageSize < total;
  const hasPrev = page > 1;
  const showPagination = total > 0;

  return (
    <div>
      {/* ── Sticky header (title row + toolbar row) ─────────────────────────── */}
      <div className={`sticky top-0 z-20 bg-slate-50 transition-shadow duration-150 ${scrolled ? "shadow-[0_1px_0_0_rgba(0,0,0,0.08)]" : ""}`}>
        <div className="max-w-[1400px] mx-auto px-8 pt-6 pb-4">
          {/* Title row */}
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="text-[22px] font-bold text-slate-900 tracking-[-0.02em]">Projects</h1>
              <p className="text-[13px] text-slate-500 mt-0.5">
                {total} project{total === 1 ? "" : "s"}
                {activeCustomer ? ` · ${activeCustomer.company_name}` : ""}
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-[13px] font-medium hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            >
              <Plus size={16} /> New Project
            </button>
          </div>

          {/* Toolbar row: search + filters + view toggle + pagination (right) */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative min-w-[220px] max-w-xs flex-shrink-0">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
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
                placeholder="Search projects or customers…"
                className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 bg-white text-[13px] text-slate-700 outline-none focus:border-slate-400 placeholder:text-slate-400"
              />
            </div>

            {/* Status filter */}
            <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1 shrink-0">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => router.push(buildUrl({ status: s === "all" ? null : s, page: 1 }))}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors cursor-pointer",
                    statusValue === s ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {STATUS_LABELS[s]}
                </button>
              ))}
            </div>

            {/* View toggle */}
            <div className="flex items-center gap-0.5 border border-slate-200 rounded-lg p-1 bg-white shrink-0">
              <button
                onClick={() => handleViewChange("grid")}
                className={cn("p-1.5 rounded-md transition-colors cursor-pointer", view === "grid" ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-600")}
                title="Grid view"
              >
                <LayoutGrid size={15} />
              </button>
              <button
                onClick={() => handleViewChange("list")}
                className={cn("p-1.5 rounded-md transition-colors cursor-pointer", view === "list" ? "bg-slate-100 text-slate-900" : "text-slate-400 hover:text-slate-600")}
                title="List view"
              >
                <List size={15} />
              </button>
            </div>

            {customerFilter && (
              <button
                onClick={() => router.push(V2_ROUTES.PROJECTS)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-[12px] text-slate-600 hover:bg-slate-50 cursor-pointer shrink-0"
              >
                <X size={13} /> Clear filter
              </button>
            )}

            {/* Spacer */}
            <div className="flex-1 min-w-0" />

            {/* Pagination controls — only when there are results */}
            {showPagination && (
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={pageSize}
                  onChange={(e) => router.push(buildUrl({ pageSize: Number(e.target.value), page: 1 }))}
                  className="h-8 px-2.5 pr-7 rounded-lg border border-slate-200 bg-white text-[12px] text-slate-600 outline-none focus:border-slate-400 cursor-pointer appearance-none"
                  style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%2394a3b8'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}
                >
                  {pageSizes.map((n) => (
                    <option key={n} value={n}>{n} per page</option>
                  ))}
                </select>
                <span className="text-[12px] text-slate-400 tabular-nums">
                  {from + 1}–{Math.min(from + pageSize, total)} of {total}
                </span>
                <div className="flex items-center gap-1 text-slate-500">
                  <button
                    onClick={() => router.push(buildUrl({ page: 1 }))}
                    disabled={!hasPrev}
                    className="flex items-center justify-center w-7 h-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                    title="First page"
                  >
                    <ChevronsLeft size={14} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => router.push(buildUrl({ page: page - 1 }))}
                    disabled={!hasPrev}
                    className="flex items-center justify-center w-7 h-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                    title="Previous page"
                  >
                    <ChevronLeft size={14} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => router.push(buildUrl({ page: page + 1 }))}
                    disabled={!hasNext}
                    className="flex items-center justify-center w-7 h-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                    title="Next page"
                  >
                    <ChevronRight size={14} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => router.push(buildUrl({ page: Math.ceil(total / pageSize) }))}
                    disabled={!hasNext}
                    className="flex items-center justify-center w-7 h-7 rounded-md border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
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
        {projects.length === 0 ? (
          <EmptyState />
        ) : view === "grid" ? (
          <GridView projects={projects} canManageTags={canManageTags} getTagsFor={getTagsFor} removeTag={removeTag} />
        ) : (
          <ListView projects={projects} canManageTags={canManageTags} getTagsFor={getTagsFor} removeTag={removeTag} />
        )}
      </div>

      {showCreate && (
        <CreateProjectModal
          customers={customers}
          defaultCustomer={customerFilter}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); router.refresh(); }}
        />
      )}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
        <FolderKanban size={26} className="text-slate-400" />
      </div>
      <div className="text-center">
        <div className="text-[15px] font-semibold text-slate-700">No projects found</div>
        <p className="text-[13px] text-slate-400 mt-1">Try a different filter or create a new project.</p>
      </div>
    </div>
  );
}

// ─── Grid view ────────────────────────────────────────────────────────────────

function GridView({
  projects, canManageTags, getTagsFor, removeTag,
}: {
  projects: ProjectListItem[];
  canManageTags: boolean;
  getTagsFor: (p: ProjectListItem) => string[];
  removeTag: (id: string, currentTags: string[], tag: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {projects.map((p) => {
        const pct = p.task_total > 0 ? Math.round((p.task_done / p.task_total) * 100) : 0;
        const daysLeft = businessDaysRemaining(p.end_date);
        const tags = getTagsFor(p);
        return (
          <GridCardWrapper key={p.id}>
          <Link
            href={`${V2_ROUTES.PROJECTS}/${p.id}`}
            className="flex flex-col gap-3 group transition-colors p-5 rounded-[10px] bg-white"
          >
            {/* Title + status */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[15px] font-semibold text-slate-900 truncate group-hover:text-blue-600 transition-colors">
                  {p.name}
                </div>
                <div className="text-[12px] text-slate-400 mt-0.5 truncate">{p.company_name}</div>
              </div>
              <ProjectStatusBadge status={p.status} pct={pct} />
            </div>

            {/* Project type (self-start prevents it from stretching full width) */}
            <ProjectTypeBadge type={p.project_type} />

            {/* Tags — pill chips with gap */}
            {tags.length > 0 && (
              <div
                className="flex flex-wrap gap-1.5"
                onClick={(e) => e.preventDefault()}
              >
                {tags.slice(0, 4).map((tag) => (
                  <TagChip
                    key={tag}
                    tag={tag}
                    canRemove={canManageTags}
                    onRemove={() => removeTag(p.id, tags, tag)}
                  />
                ))}
                {tags.length > 4 && (
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] text-slate-400 bg-slate-100">
                    +{tags.length - 4}
                  </span>
                )}
              </div>
            )}

            {/* Footer: owner + ring + stats */}
            <div className="mt-auto pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 min-w-0">
                {p.owner_name ? (
                  <>
                    <OwnerChip name={p.owner_name} />
                    <span className="text-[11px] text-slate-500 truncate">{p.owner_name.split(" ")[0]}</span>
                  </>
                ) : (
                  <span className="text-[11px] text-slate-300">Unassigned</span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-right">
                  <div className="text-[11px] text-slate-400">{p.task_done}/{p.task_total} tasks</div>
                  {daysLeft !== null && (
                    <div className={cn(
                      "text-[10px] font-medium mt-0.5",
                      daysLeft < 0 ? "text-red-500" : daysLeft <= 3 ? "text-amber-500" : "text-slate-400"
                    )}>
                      {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? "Due today" : `${daysLeft}d left`}
                    </div>
                  )}
                </div>
                <CompletionRing pct={pct} size={38} />
              </div>
            </div>
          </Link>
          </GridCardWrapper>
        );
      })}
    </div>
  );
}

// ─── Grid card wrapper — rotating conic border on hover ──────────────────────

function GridCardWrapper({ children }: { children: React.ReactNode }) {
  const turn = useMotionValue(0);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (!isHovered) return;
    const controls = animate(turn, turn.get() + 1, {
      ease: "linear",
      duration: 3,
      repeat: Infinity,
    });
    return () => controls.stop();
  }, [isHovered, turn]);

  const gradient = useMotionTemplate`conic-gradient(from ${turn}turn, transparent 0%, #f472b600 5%, #f472b6 10%, #c084fc 18%, #818cf8 26%, #38bdf8 34%, #2dd4bf 42%, #fbbf24 46%, #fbbf2400 52%, transparent 56%)`;

  return (
    <div
      className={twMerge("relative p-px rounded-xl border border-slate-200 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-md transition-shadow")}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* 1px rotating conic border */}
      <motion.div
        style={{ backgroundImage: gradient }}
        animate={{ opacity: isHovered ? 1 : 0 }}
        transition={{ duration: 0.3 }}
        className="absolute inset-0 rounded-[inherit]"
      />

      {/* Soft glow halo behind the card */}
      <motion.div
        style={{ backgroundImage: gradient }}
        animate={{ opacity: isHovered ? 0.6 : 0 }}
        transition={{ duration: 0.3 }}
        className="pointer-events-none absolute inset-[-40%] -z-10 blur-2xl"
      />

      <div className="relative rounded-[inherit] overflow-hidden">
        {children}
      </div>
    </div>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────

function ListView({
  projects, canManageTags, getTagsFor, removeTag,
}: {
  projects: ProjectListItem[];
  canManageTags: boolean;
  getTagsFor: (p: ProjectListItem) => string[];
  removeTag: (id: string, currentTags: string[], tag: string) => void;
}) {
  const router = useRouter();
  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[920px]">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide min-w-[200px]">Project Name</th>
              <th className="text-left px-3 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-14">%</th>
              <th className="text-left px-3 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-28">Status</th>
              <th className="text-left px-3 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide min-w-[140px]">Tasks</th>
              <th className="text-left px-3 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide min-w-[100px]">Issues</th>
              <th className="text-left px-3 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-36">Type</th>
              <th className="text-left px-3 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide min-w-[160px]">Tags</th>
              <th className="text-left px-3 py-3 text-[11px] font-semibold text-slate-400 uppercase tracking-wide w-36">Owner</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projects.map((p) => {
              const pct = p.task_total > 0 ? Math.round((p.task_done / p.task_total) * 100) : 0;
              const tags = getTagsFor(p);
              return (
                <tr
                  key={p.id}
                  onClick={() => router.push(`${V2_ROUTES.PROJECTS}/${p.id}`)}
                  className="hover:bg-slate-50/60 transition-colors cursor-pointer"
                >
                  {/* Project Name + Customer below */}
                  <td className="px-4 py-3">
                    <div className="text-[13px] font-semibold text-slate-800 leading-tight">{p.name}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">{p.company_name}</div>
                  </td>

                  {/* % */}
                  <td className="px-3 py-3 text-[13px] font-bold text-slate-600">{pct}%</td>

                  {/* Status */}
                  <td className="px-3 py-3">
                    <ProjectStatusBadge status={p.status} pct={pct} />
                  </td>

                  {/* Tasks with progress bar */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2 text-[12px] text-slate-500">
                      <span className="font-mono shrink-0">{p.task_done}</span>
                      <div className="w-10 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct === 100 ? "#16A34A" : "#3B82F6" }} />
                      </div>
                      <span className="font-mono text-slate-400">{pct}%</span>
                      <span className="text-slate-300">{p.task_total}</span>
                    </div>
                  </td>

                  {/* Issues — placeholder until tickets get project_id */}
                  <td className="px-3 py-3">
                    <span className="text-[11px] text-slate-300 bg-slate-50 border border-slate-100 rounded-full px-2 py-0.5 whitespace-nowrap">
                      No Issues
                    </span>
                  </td>

                  {/* Type */}
                  <td className="px-3 py-3">
                    <ProjectTypeBadge type={p.project_type} />
                  </td>

                  {/* Tags */}
                  <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                    {tags.length > 0 ? (
                      <div className="flex flex-wrap gap-y-1">
                        {tags.slice(0, 3).map((tag) => (
                          <TagChip
                            key={tag}
                            tag={tag}
                            canRemove={canManageTags}
                            onRemove={() => removeTag(p.id, tags, tag)}
                          />
                        ))}
                        {tags.length > 3 && (
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] text-slate-400 bg-slate-100">
                            +{tags.length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[12px] text-slate-300">—</span>
                    )}
                  </td>

                  {/* Owner */}
                  <td className="px-3 py-3">
                    {p.owner_name ? (
                      <div className="flex items-center gap-2">
                        <OwnerChip name={p.owner_name} />
                        <span className="text-[12px] text-slate-500 truncate max-w-[90px]">{p.owner_name.split(" ")[0]}</span>
                      </div>
                    ) : (
                      <span className="text-[12px] text-slate-300">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Create project modal ─────────────────────────────────────────────────────

function CreateProjectModal({
  customers, defaultCustomer, onClose, onCreated,
}: {
  customers: CustomerOption[];
  defaultCustomer: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState(defaultCustomer || customers[0]?.customer_id || "");
  const [projectType, setProjectType] = useState<string>(PROJECT_TYPES[0]);
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || !customerId) { setError("Name and customer are required"); return; }
    setSaving(true);
    setError(null);
    const tags = tagsInput.split(",").map((t) => t.trim()).filter(Boolean);
    const res = await fetch("/api/v2/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), customer_id: customerId, project_type: projectType, tags: tags.length > 0 ? tags : undefined }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      setError(body.error || "Failed to create project");
      setSaving(false);
      return;
    }
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl bg-white shadow-xl border border-slate-200 overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-[15px] font-semibold text-slate-900">New Project</h2>
          <button onClick={onClose} className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <ModalField label="Project name">
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400"
              placeholder="e.g. Marketing site redesign" />
          </ModalField>
          <ModalField label="Customer">
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400 bg-white">
              {customers.length === 0 && <option value="">No customers</option>}
              {customers.map((c) => <option key={c.customer_id} value={c.customer_id}>{c.company_name}</option>)}
            </select>
          </ModalField>
          <ModalField label="Project type">
            <select value={projectType} onChange={(e) => setProjectType(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400 bg-white">
              {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </ModalField>
          <ModalField label="Tags (comma-separated)">
            <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-[13px] text-slate-700 outline-none focus:border-slate-400"
              placeholder="e.g. Premium, StackShift, Standard" />
          </ModalField>
          {error && <p className="text-[12px] text-red-600">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] text-slate-600 hover:bg-slate-100 cursor-pointer">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-[13px] font-medium hover:bg-slate-800 disabled:opacity-60 cursor-pointer">
            {saving && <Loader2 size={14} className="animate-spin" />}
            Create
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[12px] font-medium text-slate-600">{label}</span>
      {children}
    </label>
  );
}
