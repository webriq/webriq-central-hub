"use client";

import { useState, useCallback, useEffect, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FolderKanban, Plus, Search, X,
  LayoutGrid, List, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { FilterMultiSelect, SortSelect, parseMultiParam } from "./_filter-controls";
import { GridView } from "./_project-grid-view";
import { ListView } from "./_project-list-view";
import { CreateProjectModal } from "./_create-project-modal";
import { CardSkeletonGrid, ListRowSkeleton } from "./_list-skeleton";

// ─── Types ───────────────────────────────────────────────────────────────────

export type ProjectListItem = {
  id: string;
  project_id: string | null;
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
  // Task 268 — the real StackShift/PipelineForge/etc. classification (customer_products.
  // classification, joined via customer_product_id). Deliberately a different field name from
  // `classification` above, which means something unrelated ("legacy" vs "version2" for the
  // existing type filter) — do not conflate the two.
  productClassification: string | null;
  hasProduct: boolean;
  members: { id: string; full_name: string | null }[];
  canManageCollaborators: boolean;
  canSetOwner: boolean;
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
const GRID_PAGE_SIZES = [15, 45, 90] as const;
const LIST_PAGE_SIZES = [20, 50, 100] as const;

// ─── Main component ───────────────────────────────────────────────────────────

export default function ProjectsIndex({
  projects,
  customers,
  paginationMeta,
  initialView = "grid",
  canManageTags = false,
  canCreateProject = false,
  canDeleteProjects = false,
}: {
  projects: ProjectListItem[];
  customers: CustomerOption[];
  paginationMeta: PaginationMeta;
  initialView?: "grid" | "list";
  canManageTags?: boolean;
  canCreateProject?: boolean;
  canDeleteProjects?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerFilter = searchParams.get("customer") ?? "";
  const [isPending, startTransition] = useTransition();

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

  const removeTag = useCallback(async (id: string, projectId: string | null, currentTags: string[], tagToRemove: string) => {
    if (!projectId) return;
    const next = currentTags.filter((t) => t !== tagToRemove);
    setTagOverrides((prev) => ({ ...prev, [id]: next }));
    await fetch(`/api/v2/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tags: next }),
    });
  }, []);

  function getTagsFor(p: ProjectListItem): string[] {
    return tagOverrides[p.id] ?? p.tags;
  }

  // Task 268 — the rename duplicate-name error toast's "Search" action lands here: sets this
  // page's own search bar (and URL) to the colliding name so the user can find the other project.
  function handleSearchName(name: string) {
    setSearchInput(name);
    navigate(buildUrl({ search: name, page: 1 }));
  }

  function buildUrl(overrides: Record<string, string | number | null>) {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) { p.delete(k); } else { p.set(k, String(v)); }
    }
    return `${V2_ROUTES.PROJECTS}?${p.toString()}`;
  }

  // Every navigation below is wrapped in startTransition — isPending then drives the skeleton
  // overlay over the results area. Next.js doesn't re-arm loading.tsx's Suspense boundary for a
  // same-segment, search-params-only navigation once it has already committed once, so without
  // this the UI would just sit inert until the new RSC payload streams in (task 263).
  function navigate(url: string) {
    startTransition(() => router.push(url));
  }

  function handleViewChange(next: "grid" | "list") {
    setView(next);
    navigate(buildUrl({ view: next, pageSize: next === "grid" ? 15 : 20, page: 1 }));
  }

  // Encodes a checkbox-group selection back into the URL: a full selection clears the
  // param entirely (equivalent "All"/unfiltered state, keeps URLs clean), an empty
  // selection writes an explicit empty string, otherwise a comma-separated list.
  function handleMultiChange(key: "status" | "classification", next: string[], optionsCount: number) {
    const value = next.length === optionsCount ? null : next.length === 0 ? "" : next.join(",");
    navigate(buildUrl({ [key]: value, page: 1 }));
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
            {canCreateProject && (
              <button
                onClick={() => setShowCreate(true)}
                className="inline-flex items-center gap-2 px-[15px] py-2 rounded-full text-[12px] font-semibold transition-colors cursor-pointer bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white shrink-0"
              >
                <Plus size={14} /> New Project
              </button>
            )}
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
                    navigate(buildUrl({ search: q || null, page: 1 }));
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
            <SortSelect value={sortValue} onChange={(v) => navigate(buildUrl({ sort: v === "newest" ? null : v, page: 1 }))} />

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
                onClick={() => { setSearchInput(""); navigate(V2_ROUTES.PROJECTS); }}
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
                  onChange={(e) => navigate(buildUrl({ pageSize: Number(e.target.value), page: 1 }))}
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
                    onClick={() => navigate(buildUrl({ page: 1 }))}
                    disabled={!hasPrev}
                    className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                    title="First page"
                  >
                    <ChevronsLeft size={14} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => navigate(buildUrl({ page: page - 1 }))}
                    disabled={!hasPrev}
                    className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                    title="Previous page"
                  >
                    <ChevronLeft size={14} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => navigate(buildUrl({ page: page + 1 }))}
                    disabled={!hasNext}
                    className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors"
                    title="Next page"
                  >
                    <ChevronRight size={14} strokeWidth={2} />
                  </button>
                  <button
                    onClick={() => navigate(buildUrl({ page: Math.ceil(total / pageSize) }))}
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
        {isPending ? (
          view === "grid" ? <CardSkeletonGrid count={pageSize} /> : <ListRowSkeleton />
        ) : projects.length === 0 ? (
          <EmptyState isFiltered={isFiltered} />
        ) : view === "grid" ? (
          <GridView projects={projects} canManageTags={canManageTags} canDeleteProjects={canDeleteProjects} getTagsFor={getTagsFor} removeTag={removeTag} onSearchName={handleSearchName} />
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
