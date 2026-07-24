"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  FolderKanban, Plus, Search, X, Loader2, Check, Building2, ChevronDown, ArrowUpDown,
  LayoutGrid, List, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { TagChip, businessDaysRemaining, PROJECT_TYPES } from "./_pm-shared";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Chip } from "../dashboard/_components/dashboard-shared";

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
  issue_total: number;
  issue_done: number;
  classification: "legacy" | "version2";
  members: { id: string; full_name: string | null }[];
};

export type CustomerOption = { customer_id: string; company_name: string };
export type PaginationMeta = { page: number; pageSize: number; total: number };

// ─── Constants ───────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On Hold" },
  { value: "completed", label: "Completed" },
  { value: "archived", label: "Archived" },
] as const;
const CLASSIFICATION_OPTIONS = [
  { value: "legacy", label: "Legacy" },
  { value: "version2", label: "Version 2" },
] as const;
const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name_asc", label: "Name (A–Z)" },
  { value: "name_desc", label: "Name (Z–A)" },
  { value: "due_soonest", label: "Due date (soonest)" },
  { value: "updated_desc", label: "Recently updated" },
] as const;
const GRID_PAGE_SIZES = [15, 45, 90] as const;
const LIST_PAGE_SIZES = [20, 50, 100] as const;

// Reads a URL param encoding a checkbox-group selection: absent = "All" (every option
// checked, unfiltered); "" = explicitly zero checked; otherwise a comma-separated list.
function parseMultiParam(raw: string | null, options: readonly { value: string }[]): string[] {
  if (raw === null) return options.map((o) => o.value);
  if (raw === "") return [];
  return raw.split(",");
}

// ─── v2.0 avatar stack (page-scoped) ────────────────────────────────────────────
// Mirrors _onboarding-list.tsx's own local AvatarStack/AvatarTip implementation —
// not shared, since the Projects list and Onboarding are unrelated feature areas
// (same "page-scoped UI" reasoning that file's own comment documents), and
// _pm-shared.tsx's OwnerChip is still v1-styled and shared by the not-yet-migrated
// Projects kanban/detail views (see task 185's blast-radius boundary).

const AVATAR_COLORS = ["#0063D6", "#6A48E0", "#0B8A93", "#B85512", "#177E48", "#44508A"];
const MAX_VISIBLE_AVATARS = 5;

function initialsFor(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function colorFor(name: string | null): string {
  if (!name) return "#5F6A88";
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function AvatarTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

// Falls back to a single owner_name-derived bubble when a project has no project_members
// rows (expected for Legacy/Zoho-imported projects, which predate native membership).
function AvatarStack({ members, fallbackName }: { members: { id: string; full_name: string | null }[]; fallbackName: string | null }) {
  if (members.length === 0) {
    if (!fallbackName) return <span className="text-[11px] text-[#5F6A88]">Unassigned</span>;
    return (
      <AvatarTip label={fallbackName}>
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white ring-2 ring-white shrink-0"
          style={{ background: colorFor(fallbackName) }}
        >
          {initialsFor(fallbackName)}
        </div>
      </AvatarTip>
    );
  }

  if (members.length === 1) {
    const m = members[0];
    return (
      <AvatarTip label={m.full_name ?? "Unnamed"}>
        <div
          className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white ring-2 ring-white shrink-0"
          style={{ background: colorFor(m.full_name) }}
        >
          {initialsFor(m.full_name)}
        </div>
      </AvatarTip>
    );
  }

  const visible = members.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = members.length - visible.length;
  return (
    <div className="flex items-center">
      {visible.map((m, i) => (
        <AvatarTip key={m.id} label={m.full_name ?? "Unnamed"}>
          <motion.div
            className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white ring-2 ring-white shrink-0 cursor-default", i > 0 && "-ml-2")}
            style={{ background: colorFor(m.full_name) }}
            whileHover={{ y: -4, zIndex: 10 }}
            transition={{ type: "spring", stiffness: 500, damping: 20 }}
          >
            {initialsFor(m.full_name)}
          </motion.div>
        </AvatarTip>
      ))}
      {overflow > 0 && (
        <div className="w-6 h-6 -ml-2 rounded-full flex items-center justify-center text-[9px] font-semibold ring-2 ring-white shrink-0 text-[#5F6A88] bg-[#EDF0F7]">
          +{overflow}
        </div>
      )}
    </div>
  );
}

// ─── v2.0 status / type chips (page-scoped) ─────────────────────────────────────
// _pm-shared.tsx's ProjectStatusBadge/ProjectTypeBadge stay untouched (still v1,
// shared by the not-yet-migrated kanban/detail views) — these are new, local
// equivalents built on the shared v2.0 Chip primitive from dashboard-shared.tsx.

function ProjectStatusChip({ status, pct }: { status: string; pct: number }) {
  if (status === "active" && pct === 0) return <Chip tone="neutral">Not Started</Chip>;
  if (status === "completed") {
    return (
      <Chip tone="ok">
        <Check size={9} strokeWidth={3} className="shrink-0" /> Completed
      </Chip>
    );
  }
  if (status === "active") return <Chip tone="ok" dot>Active</Chip>;
  if (status === "on_hold") return <Chip tone="warn" dot>On Hold</Chip>;
  if (status === "archived") return <Chip tone="neutral">Archived</Chip>;
  return <Chip tone="neutral">{status}</Chip>;
}

function ProjectTypeChip({ type }: { type: string }) {
  return <Chip tone="neutral">{type}</Chip>;
}

// ─── v2.0 progress ring (page-scoped) ───────────────────────────────────────────
// _pm-shared.tsx's CompletionRing stays untouched (v1 colors, shared by kanban/detail
// views) — this is a smaller, v2.0-token sibling used twice per card (tasks + issues).

function ProgressRing({ pct, size = 34 }: { pct: number; size?: number }) {
  const strokeWidth = 3;
  const r = (size - strokeWidth * 2) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const cx = size / 2;
  const cy = size / 2;
  const fillColor = pct === 100 ? "#177E48" : "#007BFF";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EDF0F7" strokeWidth={strokeWidth} />
      <circle
        cx={cx} cy={cy} r={r} fill="none"
        stroke={fillColor} strokeWidth={strokeWidth} strokeLinecap="round"
        strokeDasharray={`${dash} ${circ}`}
      />
      <text
        x={cx} y={cy}
        dominantBaseline="middle" textAnchor="middle"
        className="font-mono"
        style={{ fontSize: size * 0.26, fill: "#3A4565", fontWeight: 600, transform: "rotate(90deg)", transformOrigin: `${cx}px ${cy}px` }}
      >
        {pct}%
      </text>
    </svg>
  );
}

// ─── Filter multi-select (page-scoped) ──────────────────────────────────────────
// Checkbox-group dropdown replacing the old single-select pill row (which squeezed
// 9 pills into one line at narrower widths). "All" is itself a checkbox tied to the
// full-selection state: checking it selects every option; unchecking any individual
// option un-checks "All". Portal-positioned like import/_content.tsx's TypeMultiSelect
// (same trigger-rect + scroll/resize reposition + outside-click-close pattern), but
// with real 17px/5px-radius checkboxes (DESIGN.md's Checklist-row shape) recolored
// from that spec's ok-green "done" fill to navy — this is a *selection* state, not a
// completion state, and DESIGN.md reserves navy specifically for selection/filter UI
// ("Do use navy for selection/filter state, blue for anything that navigates or
// submits"), matching the same navy fill this page's own Filter-pill precedent used.

function FilterCheckRow({ label, checked, onClick }: { label: string; checked: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-[7px] px-2 py-1.5 text-left text-[12px] text-[#3A4565] transition-colors hover:bg-[#F4F6FB] cursor-pointer"
    >
      <span className={cn(
        "flex h-[17px] w-[17px] shrink-0 items-center justify-center rounded-[5px] border transition-colors",
        checked ? "bg-[#071133] border-[#071133]" : "bg-white border-[#E2E7F2]"
      )}>
        {checked && <Check size={11} strokeWidth={3} className="text-white" />}
      </span>
      {label}
    </button>
  );
}

function FilterMultiSelect({
  label, options, selected, onChange,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function place() {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      setPos({ top: r.bottom + 4, left: r.left, width: Math.max(r.width, 190) });
    }
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || panelRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [open]);

  const allChecked = selected.length === options.length;
  const summary = allChecked
    ? "All"
    : selected.length === 0
      ? "None"
      : selected.length === 1
        ? options.find((o) => o.value === selected[0])?.label
        : `${selected.length} selected`;

  function toggleOption(value: string) {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  }
  function toggleAll() {
    onChange(allChecked ? [] : options.map((o) => o.value));
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "inline-flex items-center gap-1.5 px-3 py-[6.5px] rounded-full border text-[11px] font-semibold transition-colors cursor-pointer shrink-0",
          !allChecked ? "border-[#007BFF] bg-[#F0F7FF] text-[#0063D6]" : "border-[#E2E7F2] bg-white text-[#5F6A88] hover:border-[#A8C6F5] hover:text-[#0B1533]"
        )}
      >
        {label}: <span className="font-mono font-normal">{summary}</span>
        <ChevronDown size={12} className={cn("transition-transform", open && "rotate-180")} />
      </button>

      {open && pos && createPortal(
        <div
          ref={panelRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
          className="z-50 overflow-hidden rounded-[10px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] p-1"
        >
          <FilterCheckRow label="All" checked={allChecked} onClick={toggleAll} />
          <div className="my-1 h-px bg-[#EDF0F7]" />
          {options.map((o) => (
            <FilterCheckRow key={o.value} label={o.label} checked={selected.includes(o.value)} onClick={() => toggleOption(o.value)} />
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Sort select (page-scoped) — matches the existing per-page <select> styling ────

function SortSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="relative shrink-0">
      <ArrowUpDown size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#5F6A88] pointer-events-none" />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 pl-7 pr-7 rounded-full border border-[#E2E7F2] bg-white text-[11px] font-semibold text-[#3A4565] outline-none focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14] cursor-pointer appearance-none"
        style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235F6A88'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
      >
        {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function ProgressStat({ label, done, total }: { label: string; done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex flex-col items-center gap-1 shrink-0">
      <ProgressRing pct={pct} />
      <span className="text-[10px] font-mono text-[#5F6A88] whitespace-nowrap">{done}/{total} {label}</span>
    </div>
  );
}

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
  const statusSelected = parseMultiParam(searchParams.get("status"), STATUS_OPTIONS);
  const classificationSelected = parseMultiParam(searchParams.get("classification"), CLASSIFICATION_OPTIONS);
  const sortValue = searchParams.get("sort") ?? "newest";
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

  // Encodes a checkbox-group selection back into the URL: a full selection clears the
  // param entirely (equivalent "All"/unfiltered state, keeps URLs clean), an empty
  // selection writes an explicit empty string, otherwise a comma-separated list.
  function handleMultiChange(key: "status" | "classification", next: string[], optionsCount: number) {
    const value = next.length === optionsCount ? null : next.length === 0 ? "" : next.join(",");
    router.push(buildUrl({ [key]: value, page: 1 }));
  }

  const pageSizes = view === "grid" ? GRID_PAGE_SIZES : LIST_PAGE_SIZES;
  const hasNext = from + pageSize < total;
  const hasPrev = page > 1;
  const showPagination = total > 0;
  const isFiltered = !!searchInput
    || statusSelected.length !== STATUS_OPTIONS.length
    || classificationSelected.length !== CLASSIFICATION_OPTIONS.length
    || !!customerFilter;

  return (
    <div>
      {/* ── Sticky header (title row + toolbar row) ─────────────────────────── */}
      <div className={cn("sticky top-0 z-20 bg-[#F4F6FB] transition-shadow duration-150", scrolled && "shadow-[0_1px_0_0_rgba(7,17,51,0.06)]")}>
        <div className="max-w-[1400px] mx-auto px-8 pt-6 pb-4">
          {/* Title row */}
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <h1 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-[#0B1533]">Projects</h1>
              <p className="text-[13px] text-[#5F6A88] mt-0.5">
                {total} project{total === 1 ? "" : "s"}
                {activeCustomer ? ` · ${activeCustomer.company_name}` : ""}
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="inline-flex items-center gap-2 px-[15px] py-2 rounded-full text-[12px] font-semibold transition-colors cursor-pointer bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white shrink-0"
            >
              <Plus size={14} /> New Project
            </button>
          </div>

          {/* Toolbar row: search + filters + view toggle + pagination (right) */}
          <div className="flex items-center gap-3 flex-wrap">
            {/* Search */}
            <div className="relative min-w-[220px] max-w-xs flex-shrink-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5F6A88]" />
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
                className="w-full pl-8 pr-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14] placeholder:text-[#5F6A88]"
              />
            </div>

            {/* Status filter — checkbox multi-select, "All" syncs with every option */}
            <FilterMultiSelect
              label="Status"
              options={STATUS_OPTIONS}
              selected={statusSelected}
              onChange={(next) => handleMultiChange("status", next, STATUS_OPTIONS.length)}
            />

            {/* Type filter — Legacy / Version 2 classification, same multi-select pattern */}
            <FilterMultiSelect
              label="Type"
              options={CLASSIFICATION_OPTIONS}
              selected={classificationSelected}
              onChange={(next) => handleMultiChange("classification", next, CLASSIFICATION_OPTIONS.length)}
            />

            {/* Sort */}
            <SortSelect value={sortValue} onChange={(v) => router.push(buildUrl({ sort: v === "newest" ? null : v, page: 1 }))} />

            {/* View toggle — active state is a filled navy pill + white icon (matches the
                filter/selection color language elsewhere in this toolbar), real tooltips
                instead of a bare title="" attribute. */}
            <div className="flex items-center gap-0.5 border border-[#E2E7F2] rounded-full p-1 bg-white shrink-0">
              <Tooltip>
                <TooltipTrigger render={
                  <button
                    onClick={() => handleViewChange("grid")}
                    aria-label="Grid view"
                    className={cn("p-1.5 rounded-full transition-colors cursor-pointer", view === "grid" ? "bg-[#071133] text-white" : "text-[#5F6A88] hover:text-[#0B1533]")}
                  >
                    <LayoutGrid size={15} />
                  </button>
                } />
                <TooltipContent side="top">Grid view</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger render={
                  <button
                    onClick={() => handleViewChange("list")}
                    aria-label="List view"
                    className={cn("p-1.5 rounded-full transition-colors cursor-pointer", view === "list" ? "bg-[#071133] text-white" : "text-[#5F6A88] hover:text-[#0B1533]")}
                  >
                    <List size={15} />
                  </button>
                } />
                <TooltipContent side="top">List view</TooltipContent>
              </Tooltip>
            </div>

            {isFiltered && (
              <button
                onClick={() => { setSearchInput(""); router.push(V2_ROUTES.PROJECTS); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] hover:bg-[#F0F7FF] cursor-pointer shrink-0 transition-colors"
              >
                <X size={13} /> Clear filters
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
                  className="h-8 px-2.5 pr-7 rounded-full border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] outline-none focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14] cursor-pointer appearance-none"
                  style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235F6A88'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
                >
                  {pageSizes.map((n) => (
                    <option key={n} value={n}>{n} per page</option>
                  ))}
                </select>
                <span className="text-[12px] font-mono text-[#5F6A88]">
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
        {projects.length === 0 ? (
          <EmptyState isFiltered={isFiltered} />
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

function EmptyState({ isFiltered }: { isFiltered: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center py-24 gap-3 rounded-[14px] border border-[#E2E7F2] bg-white">
      <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[#F0F7FF]">
        <FolderKanban size={26} className="text-[#007BFF]" />
      </div>
      <div className="text-center">
        <div className="text-[15px] font-semibold text-[#0B1533]">
          {isFiltered ? "No projects match your filters" : "No projects yet"}
        </div>
        <p className="text-[13px] text-[#5F6A88] mt-1">
          {isFiltered ? "Try a different search term or clear a filter." : "New projects will appear here once created."}
        </p>
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-stretch">
      {projects.map((p) => {
        const pct = p.task_total > 0 ? Math.round((p.task_done / p.task_total) * 100) : 0;
        const daysLeft = businessDaysRemaining(p.end_date);
        const tags = getTagsFor(p);
        return (
          <Link
            key={p.id}
            href={`${V2_ROUTES.PROJECTS}/${p.id}`}
            className="h-full flex flex-col gap-3 p-4 rounded-[14px] border border-[#E2E7F2] bg-white hover:border-[#A8C6F5] transition-colors"
          >
            {/* Title + status */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-semibold text-[#0B1533] truncate">{p.name}</div>
                <div className="inline-flex items-center gap-1 text-[12px] text-[#5F6A88] truncate">
                  <Building2 size={11} /> {p.company_name}
                </div>
              </div>
              <ProjectStatusChip status={p.status} pct={pct} />
            </div>

            {/* Project type + days left */}
            <div className="flex items-center justify-between gap-2">
              <ProjectTypeChip type={p.project_type} />
              {daysLeft !== null && (
                <span className={cn(
                  "text-[10px] font-mono shrink-0",
                  daysLeft < 0 ? "text-[#C0392B]" : daysLeft <= 3 ? "text-[#8A5A00]" : "text-[#5F6A88]"
                )}>
                  {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? "Due today" : `${daysLeft}d left`}
                </span>
              )}
            </div>

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
                  <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] text-[#5F6A88] bg-[#EDF0F7]">
                    +{tags.length - 4}
                  </span>
                )}
              </div>
            )}

            {/* Footer: avatar stack + tasks/issues progress */}
            <div className="mt-auto pt-3 border-t border-[#EDF0F7] flex items-center justify-between gap-2">
              <AvatarStack members={p.members} fallbackName={p.owner_name} />
              <div className="flex items-center gap-3 shrink-0">
                <ProgressStat label="tasks" done={p.task_done} total={p.task_total} />
                <ProgressStat label="issues" done={p.issue_done} total={p.issue_total} />
              </div>
            </div>
          </Link>
        );
      })}
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
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px]">
          <thead>
            <tr className="border-b border-[#EDF0F7] bg-[#FAFBFE]">
              <th className="text-left pl-[18px] pr-3 py-3 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] min-w-[200px]">Project Name</th>
              <th className="text-left px-3 py-3 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] w-14">%</th>
              <th className="text-left px-3 py-3 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] w-28">Status</th>
              <th className="text-left px-3 py-3 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] min-w-[140px]">Tasks</th>
              <th className="text-left px-3 py-3 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] min-w-[140px]">Issues</th>
              <th className="text-left px-3 py-3 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] w-36">Type</th>
              <th className="text-left px-3 py-3 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] min-w-[160px]">Tags</th>
              <th className="text-left px-3 py-3 text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88] w-36">Members</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EDF0F7]">
            {projects.map((p) => {
              const pct = p.task_total > 0 ? Math.round((p.task_done / p.task_total) * 100) : 0;
              const issuePct = p.issue_total > 0 ? Math.round((p.issue_done / p.issue_total) * 100) : 0;
              const tags = getTagsFor(p);
              return (
                <tr
                  key={p.id}
                  onClick={() => router.push(`${V2_ROUTES.PROJECTS}/${p.id}`)}
                  className="hover:bg-[#F0F7FF] transition-colors cursor-pointer"
                >
                  {/* Project Name + Customer below */}
                  <td className="pl-[18px] pr-3 py-3">
                    <div className="text-[13px] font-semibold text-[#0B1533] leading-tight">{p.name}</div>
                    <div className="text-[11px] text-[#5F6A88] mt-0.5">{p.company_name}</div>
                  </td>

                  {/* % */}
                  <td className="px-3 py-3 text-[13px] font-bold text-[#3A4565]">{pct}%</td>

                  {/* Status */}
                  <td className="px-3 py-3">
                    <ProjectStatusChip status={p.status} pct={pct} />
                  </td>

                  {/* Tasks with progress bar */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2 text-[12px] text-[#5F6A88]">
                      <span className="font-mono shrink-0">{p.task_done}</span>
                      <div className="w-10 h-1.5 bg-[#EDF0F7] rounded-full overflow-hidden shrink-0">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: pct === 100 ? "#177E48" : "#007BFF" }} />
                      </div>
                      <span className="font-mono text-[#5F6A88]">{pct}%</span>
                      <span className="text-[#A8B0C6]">{p.task_total}</span>
                    </div>
                  </td>

                  {/* Issues with progress bar — real data (task 185) */}
                  <td className="px-3 py-3">
                    {p.issue_total > 0 ? (
                      <div className="flex items-center gap-2 text-[12px] text-[#5F6A88]">
                        <span className="font-mono shrink-0">{p.issue_done}</span>
                        <div className="w-10 h-1.5 bg-[#EDF0F7] rounded-full overflow-hidden shrink-0">
                          <div className="h-full rounded-full" style={{ width: `${issuePct}%`, background: issuePct === 100 ? "#177E48" : "#007BFF" }} />
                        </div>
                        <span className="font-mono text-[#5F6A88]">{issuePct}%</span>
                        <span className="text-[#A8B0C6]">{p.issue_total}</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-[#A8B0C6] bg-[#F4F6FB] border border-[#EDF0F7] rounded-full px-2 py-0.5 whitespace-nowrap">
                        No issues
                      </span>
                    )}
                  </td>

                  {/* Type */}
                  <td className="px-3 py-3">
                    <ProjectTypeChip type={p.project_type} />
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
                          <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] text-[#5F6A88] bg-[#EDF0F7]">
                            +{tags.length - 3}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-[12px] text-[#A8B0C6]">—</span>
                    )}
                  </td>

                  {/* Members */}
                  <td className="px-3 py-3">
                    <AvatarStack members={p.members} fallbackName={p.owner_name} />
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071133]/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-[14px] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] border border-[#E2E7F2] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDF0F7]">
          <h2 className="font-heading text-[15px] font-semibold text-[#0B1533]">New Project</h2>
          <button onClick={onClose} className="p-1 rounded-full text-[#5F6A88] hover:text-[#0B1533] hover:bg-[#EDF0F7] cursor-pointer transition-colors">
            <X size={16} />
          </button>
        </div>
        <div className="p-5 flex flex-col gap-4">
          <ModalField label="Project name">
            <input value={name} onChange={(e) => setName(e.target.value)} autoFocus
              className="w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]"
              placeholder="e.g. Marketing site redesign" />
          </ModalField>
          <ModalField label="Customer">
            <select value={customerId} onChange={(e) => setCustomerId(e.target.value)}
              className="w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]">
              {customers.length === 0 && <option value="">No customers</option>}
              {customers.map((c) => <option key={c.customer_id} value={c.customer_id}>{c.company_name}</option>)}
            </select>
          </ModalField>
          <ModalField label="Project type">
            <select value={projectType} onChange={(e) => setProjectType(e.target.value)}
              className="w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]">
              {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </ModalField>
          <ModalField label="Tags (comma-separated)">
            <input value={tagsInput} onChange={(e) => setTagsInput(e.target.value)}
              className="w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]"
              placeholder="e.g. Premium, StackShift, Standard" />
          </ModalField>
          {error && <p className="text-[12px] text-[#C0392B]">{error}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EDF0F7] bg-[#F4F6FB]">
          <button onClick={onClose} className="px-4 py-2 rounded-full text-[13px] font-semibold text-[#3A4565] border border-[#E2E7F2] bg-white hover:border-[#A8C6F5] hover:text-[#0B1533] cursor-pointer transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#007BFF] text-white text-[13px] font-semibold hover:bg-[#0063D6] disabled:opacity-45 cursor-pointer transition-colors">
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
      <span className="text-[11px] font-semibold text-[#0B1533]">{label}</span>
      {children}
    </label>
  );
}
