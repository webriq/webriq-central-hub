"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ChartGantt, Plus, Upload, Search, X,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { CLASSIFICATIONS } from "@/config/customer-phases";
import { isRoleGatedByMembership } from "@/lib/programme/membership-rules";
import { FilterMultiSelect, parseMultiParam } from "./_filter-multi-select";
import { SortSelect } from "./_sort-select";
import { ProjectCard } from "./_project-card";
import { CardSkeletonGrid } from "./_list-skeleton";
import type { OnboardingPaginationMeta } from "./_load-list-data";

export type OnboardingProjectListItem = {
  id: string;
  project_id: string | null;
  project_name: string;
  company_name: string;
  customer_id: string;
  classification: string | null;
  hasProduct: boolean;
  current_phase_number: number | null;
  current_phase_name: string | null;
  current_day: number | null;
  programme_duration_days: number;
  progress_pct: number;
  programme_started_at: string | null;
  scheduled_onboarding_start_at: string | null;
  target_handover_date: string | null;
  created_at: string;
  // "completed" (task 168 follow-up) = Phase 5 (Optimize) status is `completed` in `customer_phases`.
  status: "draft" | "scheduled" | "in_progress" | "completed";
  // Task 154: deduped union of project_members + Phase 1 phase_members (task 153).
  members: { id: string; full_name: string | null; avatar_url: string | null }[];
  canManageCollaborators: boolean;
  canSetOwner: boolean;
};

// ─── Search / status filter / pagination — server-driven, URL-synced (task 263). Mirrors
// /projects' searchParams -> Supabase query pattern; the initial "fetch everything once, filter
// client-side" approach (task 167's original design note, since superseded) is gone — see the
// task 263 doc for why (GET /api/onboarding/projects does role/membership filtering in
// application code and is shared by 3 dashboards, so this page now has its own server-side query
// in _load-list-data.ts instead of reusing that route).

// Full status enum (task 224 — the old pill row omitted "completed" entirely).
const STATUS_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
] as const;
// Legacy/Zoho-imported projects that predate the classification system (classification: null)
// are excluded from this list entirely (task 272) — no "Unclassified" filter option needed.
const CLASSIFICATION_OPTIONS = CLASSIFICATIONS.map((c) => ({ value: c, label: c }));
// Sort — pill style matching /projects' SortSelect (task 224 follow-up amendment; this page
// previously had no sort control at all).
const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name_asc", label: "Name (A–Z)" },
  { value: "name_desc", label: "Name (Z–A)" },
  { value: "due_soonest", label: "Handover date (soonest)" },
] as const;
const PAGE_SIZES = [15, 45, 90] as const;

// Task 276 (Phase 1) — renamed from the source's `OnboardingList` to `V2ProjectsListing` since
// this is the entry component for the "V2 Projects" tab (now `/projects/v2`, task 279); props
// are unchanged from the original.
export default function V2ProjectsListing({
  role, currentUserId, projects, paginationMeta, canCreate,
}: {
  role: string | null;
  currentUserId: string | null;
  projects: OnboardingProjectListItem[];
  paginationMeta: OnboardingPaginationMeta;
  canCreate: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusSelected = parseMultiParam(searchParams.get("status"), STATUS_OPTIONS);
  const classificationSelected = parseMultiParam(searchParams.get("classification"), CLASSIFICATION_OPTIONS);
  const sortValue = searchParams.get("sort") ?? "newest";

  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const main = document.querySelector("main");
    if (!main) return;
    const onScroll = () => setScrolled(main.scrollTop > 4);
    main.addEventListener("scroll", onScroll, { passive: true });
    return () => main.removeEventListener("scroll", onScroll);
  }, []);

  function buildUrl(overrides: Record<string, string | number | null>) {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) { p.delete(k); } else { p.set(k, String(v)); }
    }
    return `${V2_ROUTES.PROJECTS_V2}?${p.toString()}`;
  }

  // Every navigation below is wrapped in startTransition — isPending then drives the skeleton
  // overlay over the results grid. Next.js doesn't re-arm loading.tsx's Suspense boundary for a
  // same-segment, search-params-only navigation once it has already committed once, so without
  // this the UI would just sit inert until the new RSC payload streams in (task 263).
  function navigate(url: string) {
    startTransition(() => router.push(url));
  }

  // Encodes a checkbox-group selection back into the URL: a full selection clears the param
  // entirely (equivalent "All"/unfiltered state, keeps URLs clean), an empty selection writes
  // an explicit empty string, otherwise a comma-separated list. Mirrors /projects.
  function handleMultiChange(key: "status" | "classification", next: string[], optionsCount: number) {
    const value = next.length === optionsCount ? null : next.length === 0 ? "" : next.join(",");
    navigate(buildUrl({ [key]: value, page: 1 }));
  }

  // Task 268 — the rename duplicate-name error toast's "Search" action lands here: sets this
  // page's own search bar (and URL) to the colliding name so the user can find the other project.
  function handleSearchName(name: string) {
    setSearchInput(name);
    navigate(buildUrl({ search: name, page: 1 }));
  }

  const { page, pageSize, total } = paginationMeta;
  const from = (page - 1) * pageSize;
  const hasNext = from + pageSize < total;
  const hasPrev = page > 1;
  const isFiltered = (searchParams.get("search") ?? "").length > 0
    || statusSelected.length !== STATUS_OPTIONS.length
    || classificationSelected.length !== CLASSIFICATION_OPTIONS.length;

  const roleEditable = role === "marketing" || role === "admin" || role === "super_admin" || role === "pm";
  // A gated role (marketing, as of task 291 — pm moved into roleEditable above) that's a
  // project/Phase-1 member (item.members, task 154's deduped union) can open that specific
  // project even without a role-wide editable grant — mirrors the detail route's own
  // DETAIL_ROLES + membership gate (_load-detail-data.ts), which this list previously didn't
  // account for at all (editable was role-only).
  const canOpenProject = (item: OnboardingProjectListItem) =>
    roleEditable
    // Task 284 — developer: the listing query already restricts rows to projects the developer
    // is a member of or has an assigned task in (_load-list-data.ts), so any card that reaches
    // this list is safe to open; item.members alone (project_members + Phase 1 members only)
    // can't express the "assigned task" half of that rule client-side.
    || role === "developer"
    || (isRoleGatedByMembership(role) && !!currentUserId && item.members.some((m) => m.id === currentUserId));
  // Task 233 — a separate capability from roleEditable above (different role set: marketing is
  // roleEditable but must not see Delete) and independent of project membership — deletion is a
  // role capability, not a membership one. pm is in both sets as of task 291 (pm is no longer
  // membership-gated, so it was added to roleEditable too), which is incidental, not a rule.
  const canDeleteProjects = role === "admin" || role === "pm" || role === "super_admin";

  return (
    <div>
      {/* ── Sticky header (title row + toolbar row) ─────────────────────────── */}
      <div className={cn("sticky top-0 z-20 bg-[#F4F6FB] transition-shadow duration-150", scrolled && "shadow-[0_1px_0_0_rgba(7,17,51,0.06)]")}>
        <div className="max-w-350 mx-auto px-8 pt-6 pb-4">
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <div>
              <p className="text-[13px] text-[#5F6A88]">
                {/* Task 282 — unified across roles: previously the non-roleEditable branch said
                    "project(s)" and falsely claimed every project was in Phase 1 onboarding. */}
                {`${total} project${total === 1 ? "" : "s"} · Current classifications: StackShift I/II, Access, Access Plus & Discrete Development — succeeding Legacy's original StackShift`}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Link
                href={V2_ROUTES.PROJECTS_V2_STATUS_REPORT}
                className="inline-flex items-center gap-2 px-[15px] py-2 rounded-full border text-[12px] font-semibold transition-colors cursor-pointer border-[#E2E7F2] bg-white text-[#3A4565] hover:border-[#A8C6F5] hover:text-[#0B1533]"
              >
                <ClipboardList size={14} /> Status Report
              </Link>
              {canCreate && (
                <>
                  <Link
                    href={V2_ROUTES.PROJECTS_V2_IMPORT}
                    className="inline-flex items-center gap-2 px-[15px] py-2 rounded-full border text-[12px] font-semibold transition-colors cursor-pointer border-[#E2E7F2] bg-white text-[#3A4565] hover:border-[#A8C6F5] hover:text-[#0B1533]"
                  >
                    <Upload size={14} /> Import Project
                  </Link>
                  <Link
                    href={V2_ROUTES.PROJECTS_V2_NEW}
                    className="inline-flex items-center gap-2 px-[15px] py-2 rounded-full text-[12px] font-semibold transition-colors cursor-pointer bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white"
                  >
                    <Plus size={14} /> New Project
                  </Link>
                </>
              )}
            </div>
          </div>

          {/* Toolbar: search + filters + sort + pagination */}
          <div className="flex items-center gap-3 flex-wrap">
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
                placeholder="Search clients or projects…"
                className="w-full pl-8 pr-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14] placeholder:text-[#5F6A88]"
              />
            </div>

            {/* Status filter — checkbox multi-select, "All" syncs with every option. Mirrors
                /projects' FilterMultiSelect (task 224). */}
            <FilterMultiSelect
              label="Status"
              options={STATUS_OPTIONS}
              selected={statusSelected}
              onChange={(next) => handleMultiChange("status", next, STATUS_OPTIONS.length)}
            />

            {/* Classification filter — StackShift I/II/Access/Access Plus, PipelineForge,
                Discrete Development, plus "Unclassified" for legacy/pre-classification rows. */}
            <FilterMultiSelect
              label="Classification"
              options={CLASSIFICATION_OPTIONS}
              selected={classificationSelected}
              onChange={(next) => handleMultiChange("classification", next, CLASSIFICATION_OPTIONS.length)}
            />

            {/* Sort — pill style matching /projects' SortSelect (task 224 follow-up amendment;
                this page previously had no sort control). */}
            <SortSelect
              value={sortValue}
              onChange={(v) => navigate(buildUrl({ sort: v === "newest" ? null : v, page: 1 }))}
              options={SORT_OPTIONS}
            />

            {isFiltered && (
              <button
                onClick={() => { setSearchInput(""); navigate(V2_ROUTES.PROJECTS_V2); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] hover:bg-[#F0F7FF] cursor-pointer shrink-0 transition-colors"
              >
                <X size={13} /> Clear filters
              </button>
            )}

            <div className="flex-1 min-w-0" />

            {total > 0 && (
              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={pageSize}
                  onChange={(e) => navigate(buildUrl({ pageSize: Number(e.target.value), page: 1 }))}
                  className="h-8 px-2.5 pr-7 rounded-full border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] outline-none focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14] cursor-pointer appearance-none"
                  style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235F6A88'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
                >
                  {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} per page</option>)}
                </select>
                <span className="text-[12px] font-mono text-[#5F6A88]">
                  {from + 1}–{Math.min(from + pageSize, total)} of {total}
                </span>
                <div className="flex items-center gap-1 text-[#5F6A88]">
                  <button onClick={() => navigate(buildUrl({ page: 1 }))} disabled={!hasPrev} className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors" title="First page">
                    <ChevronsLeft size={14} />
                  </button>
                  <button onClick={() => navigate(buildUrl({ page: page - 1 }))} disabled={!hasPrev} className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors" title="Previous page">
                    <ChevronLeft size={14} />
                  </button>
                  <button onClick={() => navigate(buildUrl({ page: page + 1 }))} disabled={!hasNext} className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors" title="Next page">
                    <ChevronRight size={14} />
                  </button>
                  <button onClick={() => navigate(buildUrl({ page: Math.ceil(total / pageSize) }))} disabled={!hasNext} className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors" title="Last page">
                    <ChevronsRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Scrollable content ───────────────────────────────────────────────── */}
      <div className="max-w-350 mx-auto px-8 py-5">
      {isPending ? (
        <CardSkeletonGrid count={pageSize} />
      ) : projects.length === 0 && !isFiltered ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-[14px] border border-[#E2E7F2] bg-white">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[#F0F7FF]">
            <ChartGantt size={26} className="text-[#007BFF]" />
          </div>
          <div className="text-center">
            <div className="text-[15px] font-semibold text-[#0B1533]">No projects in onboarding</div>
            <p className="text-[13px] mt-1 text-[#5F6A88]">
              {canCreate ? "Start a new intake to begin an onboarding programme." : "Nothing is currently gated behind Phase 1."}
            </p>
          </div>
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-[14px] border border-[#E2E7F2] bg-white">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[#FFF3D6]">
            <Search size={24} className="text-[#8A5A00]" />
          </div>
          <div className="text-center">
            <div className="text-[15px] font-semibold text-[#0B1533]">No clients match your search</div>
            <p className="text-[13px] mt-1 text-[#5F6A88]">Try a different search term or clear the status filter.</p>
          </div>
          <button
            onClick={() => { setSearchInput(""); navigate(V2_ROUTES.PROJECTS_V2); }}
            className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] hover:bg-[#F0F7FF] cursor-pointer transition-colors"
          >
            <X size={13} /> Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-stretch">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              item={p}
              editable={canOpenProject(p)}
              canDelete={canDeleteProjects}
              canManageCollaborators={p.canManageCollaborators}
              canSetOwner={p.canSetOwner}
              onDeleted={() => router.refresh()}
              onSearchName={handleSearchName}
            />
          ))}
        </div>
      )}

      {!roleEditable && projects.length > 0 && !projects.every(canOpenProject) && (
        <p className="text-[11.5px] mt-4 inline-flex items-center gap-1 text-[#5F6A88]">
          <ChevronRight size={11} /> Status only — open a project you&apos;re a member of, or ask Marketing/Admin for access.
        </p>
      )}
      </div>
    </div>
  );
}
