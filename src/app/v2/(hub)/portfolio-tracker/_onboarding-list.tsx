"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ChartGantt, Plus, Upload, Building2, CalendarClock, Clock3, Search, X,
  ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { PROGRAMME_PHASES } from "@/config/customer-phases";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { Chip, PhaseChip, OnboardingStatusPill } from "../dashboard/_components/dashboard-shared";

export type OnboardingProjectListItem = {
  id: string;
  project_id: string | null;
  project_name: string;
  company_name: string;
  customer_id: string;
  classification: string | null;
  current_phase_number: number | null;
  current_phase_name: string | null;
  current_day: number | null;
  progress_pct: number;
  programme_started_at: string | null;
  scheduled_onboarding_start_at: string | null;
  target_handover_date: string | null;
  // "completed" (task 168 follow-up) = Phase 5 (Optimize) status is `completed` in `customer_phases`.
  status: "draft" | "scheduled" | "in_progress" | "completed";
  // Task 154: deduped union of project_members + Phase 1 phase_members (task 153).
  members: { id: string; full_name: string | null }[];
};

// Mirrors OwnerChip's initials/color derivation (src/app/v2/(hub)/projects/_pm-shared.tsx) for
// visual consistency with the Projects module's assignee chips — reimplemented locally (not
// imported) since it needs overlap + "+N" overflow behavior OwnerChip doesn't have, and
// Onboarding/Projects are otherwise unrelated feature areas (page-scoped UI convention).
const AVATAR_COLORS = ["#0063D6", "#6A48E0", "#0B8A93", "#B85512", "#177E48", "#44508A"];
// Only collapse into a "+N" overflow badge past 5 visible avatars — below that, show everyone.
const MAX_VISIBLE_AVATARS = 5;

function initialsFor(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function colorFor(name: string | null): string {
  if (!name) return "#5F6A88";
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

// Real shadcn/Base UI Tooltip (not a native `title` attribute) for the member's name — mirrors
// `_onboarding-wizard.tsx`'s `IconTip` pattern (a thin wrapper around Tooltip/TooltipTrigger's
// `render` prop) rather than duplicating the 3-component composition at every avatar.
function AvatarTip({ label, children }: { label: string; children: React.ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function AvatarStack({ members }: { members: { id: string; full_name: string | null }[] }) {
  if (members.length === 0) return null;

  // A single member has nothing to lift above — tooltip only, no hover animation.
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

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Fixed 4-slot layout — header / company / progress-or-status row / phase row / footer — always
// rendered (never conditionally omitted) so every card in a grid row is the same height
// regardless of project state. See task 167.
function ProjectCard({ item, editable }: { item: OnboardingProjectListItem; editable: boolean }) {
  const router = useRouter();

  const content = (
    <div
      className={cn(
        "h-full flex flex-col rounded-[14px] border bg-white p-4 transition-colors",
        editable ? "border-[#E2E7F2] hover:border-[#A8C6F5] cursor-pointer" : "border-[#EDF0F7]"
      )}
    >
      {/* Header: title + status */}
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-[#0B1533] truncate">{item.project_name}</div>
          <div className="inline-flex items-center gap-1 text-[12px] text-[#5F6A88] truncate">
            <Building2 size={11} /> {item.company_name}
          </div>
        </div>
        <OnboardingStatusPill status={item.status} />
      </div>

      {/* Progress row — always present */}
      <div className="flex items-center gap-2 mb-1.5">
        <div className="flex-1 h-1.5 rounded-full overflow-hidden bg-[#EDF0F7]">
          <div className="h-full rounded-full bg-[#007BFF] transition-[width] duration-300" style={{ width: `${item.current_day ? item.progress_pct : 0}%` }} />
        </div>
        <span className="text-[11px] font-mono shrink-0 text-[#5F6A88]">
          {item.current_day ? `Day ${item.current_day}/120` : "Day —/120"}
        </span>
      </div>

      {/* Phase / status line — always present, one line */}
      <div className="flex items-center gap-1.5 text-[11.5px] text-[#5F6A88] min-h-[17px] mb-3">
        {item.current_day ? (
          <>
            {item.current_phase_number && item.current_phase_name ? (
              <PhaseChip phaseNumber={item.current_phase_number} phaseName={item.current_phase_name} />
            ) : (
              <span>Onboarding</span>
            )}
            {item.current_phase_number === 1 && item.target_handover_date && (
              <span>· Handover ~{formatDate(item.target_handover_date)}</span>
            )}
          </>
        ) : item.scheduled_onboarding_start_at ? (
          <span className="inline-flex items-center gap-1.5 text-[#B85512]">
            <CalendarClock size={12} /> Starts {new Date(item.scheduled_onboarding_start_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <Clock3 size={12} /> Awaiting kickoff
          </span>
        )}
      </div>

      {/* Footer — always present */}
      <div className="mt-auto pt-2.5 border-t border-[#EDF0F7] flex items-center justify-between gap-2">
        {item.classification ? <Chip tone="neutral">{item.classification}</Chip> : <span className="text-[11px] text-[#5F6A88]">Unclassified</span>}
        <AvatarStack members={item.members} />
      </div>
    </div>
  );

  if (!editable) return <div className="h-full">{content}</div>;
  return (
    <button
      onClick={() => router.push(`${V2_ROUTES.PORTFOLIO_TRACKER}/${item.project_id ?? item.id}`)}
      className="h-full text-left w-full bg-transparent border-none p-0 cursor-pointer"
    >
      {content}
    </button>
  );
}

// ─── Search / status filter / pagination — client-side over the already-fetched list, URL-synced
// to match /v2/projects' UX (see task 167's "second scope decision" for why this isn't server-side
// like /v2/projects: GET /api/onboarding/projects does role/membership filtering in application
// code, after the DB fetch, and is shared by 3 other dashboards — DB-side pagination there is a
// separate, riskier follow-up, out of proportion to this task's realistic dataset size).

const STATUS_FILTERS = ["all", "draft", "scheduled", "in_progress"] as const;
const STATUS_FILTER_LABELS: Record<(typeof STATUS_FILTERS)[number], string> = {
  all: "All", draft: "Draft", scheduled: "Scheduled", in_progress: "In Progress",
};
const PAGE_SIZES = [9, 18, 36] as const;

export default function OnboardingList({ role }: { role: string | null }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [projects, setProjects] = useState<OnboardingProjectListItem[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const [searchInput, setSearchInput] = useState(searchParams.get("search") ?? "");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const statusValue = (searchParams.get("status") ?? "all") as (typeof STATUS_FILTERS)[number];
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.max(1, parseInt(searchParams.get("pageSize") ?? String(PAGE_SIZES[0]), 10) || PAGE_SIZES[0]);

  useEffect(() => {
    let ignore = false;
    // `loading` already starts `true` (initial state) — re-fetches triggered by `retryKey`
    // flip it back to `true` from the Retry button's own click handler, not here, since a
    // synchronous setState call in an effect body triggers cascading renders.
    fetch("/api/onboarding/projects")
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data = await res.json();
        if (!ignore) {
          setProjects(Array.isArray(data.projects) ? data.projects : []);
          setCanCreate(!!data.canCreate);
          setError(null);
        }
      })
      .catch(() => { if (!ignore) setError("Failed to load onboarding projects."); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [retryKey]);

  function buildUrl(overrides: Record<string, string | number | null>) {
    const p = new URLSearchParams(searchParams.toString());
    for (const [k, v] of Object.entries(overrides)) {
      if (v === null) { p.delete(k); } else { p.set(k, String(v)); }
    }
    return `${V2_ROUTES.PORTFOLIO_TRACKER}?${p.toString()}`;
  }

  const searchQ = (searchParams.get("search") ?? "").trim().toLowerCase();
  const filtered = projects.filter((p) => {
    const matchesSearch = !searchQ || `${p.project_name} ${p.company_name}`.toLowerCase().includes(searchQ);
    const matchesStatus = statusValue === "all" || p.status === statusValue;
    return matchesSearch && matchesStatus;
  });

  const total = filtered.length;
  const from = (page - 1) * pageSize;
  const paginated = filtered.slice(from, from + pageSize);
  const hasNext = from + pageSize < total;
  const hasPrev = page > 1;
  const isFiltered = searchQ.length > 0 || statusValue !== "all";

  const editable = role === "marketing" || role === "admin" || role === "super_admin";

  const totalDays = PROGRAMME_PHASES[PROGRAMME_PHASES.length - 1].dayEnd;
  const phaseCount = PROGRAMME_PHASES.length;

  return (
    <div className="max-w-350 mx-auto px-8 py-6">
      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h1 className="font-heading text-[22px] font-bold tracking-[-0.02em] flex items-center gap-2 text-[#0B1533]">
            <ChartGantt size={20} className="text-[#5F6A88]" /> Portfolio Tracker
          </h1>
          <p className="text-[13px] mt-0.5 text-[#5F6A88]">
            {editable
              ? `${total} client${total === 1 ? "" : "s"} · programme intake and progress across all ${phaseCount} phases (${totalDays}-day full cycle) — Phase 1 is hidden from PM/staff view until handover.`
              : "Projects currently going through Phase 1 onboarding."}
          </p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={V2_ROUTES.PORTFOLIO_TRACKER_IMPORT}
              className="inline-flex items-center gap-2 px-[15px] py-2 rounded-full border text-[12px] font-semibold transition-colors cursor-pointer border-[#E2E7F2] bg-white text-[#3A4565] hover:border-[#A8C6F5] hover:text-[#0B1533]"
            >
              <Upload size={14} /> Import Project
            </Link>
            <Link
              href={V2_ROUTES.PORTFOLIO_TRACKER_NEW}
              className="inline-flex items-center gap-2 px-[15px] py-2 rounded-full text-[12px] font-semibold transition-colors cursor-pointer bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white"
            >
              <Plus size={14} /> New Project
            </Link>
          </div>
        )}
      </div>

      {/* Toolbar: search + status filter + pagination */}
      <div className="flex items-center gap-3 flex-wrap mb-4">
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
            placeholder="Search clients or projects…"
            className="w-full pl-8 pr-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14] placeholder:text-[#5F6A88]"
          />
        </div>

        {/* Filter pills — DESIGN.md: individual floating pills, active fills navy (never blue,
            so filters read as selection state, not an action) — not a segmented-control group. */}
        <div className="flex items-center gap-1.5 flex-wrap shrink-0">
          {STATUS_FILTERS.map((s) => (
            <button
              key={s}
              onClick={() => router.push(buildUrl({ status: s === "all" ? null : s, page: 1 }))}
              aria-pressed={statusValue === s}
              className={cn(
                "px-3 py-[4.5px] rounded-full border text-[11px] font-semibold transition-colors cursor-pointer",
                statusValue === s ? "bg-[#071133] border-[#071133] text-white" : "bg-white border-[#E2E7F2] text-[#5F6A88] hover:border-[#A8C6F5] hover:text-[#0B1533]"
              )}
            >
              {STATUS_FILTER_LABELS[s]}
            </button>
          ))}
        </div>

        {isFiltered && (
          <button
            onClick={() => { setSearchInput(""); router.push(V2_ROUTES.PORTFOLIO_TRACKER); }}
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
              onChange={(e) => router.push(buildUrl({ pageSize: Number(e.target.value), page: 1 }))}
              className="h-8 px-2.5 pr-6 rounded-lg border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] outline-none focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14] cursor-pointer"
            >
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} per page</option>)}
            </select>
            <span className="text-[12px] font-mono text-[#5F6A88]">
              {from + 1}–{Math.min(from + pageSize, total)} of {total}
            </span>
            <div className="flex items-center gap-1 text-[#5F6A88]">
              <button onClick={() => router.push(buildUrl({ page: 1 }))} disabled={!hasPrev} className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors" title="First page">
                <ChevronsLeft size={14} />
              </button>
              <button onClick={() => router.push(buildUrl({ page: page - 1 }))} disabled={!hasPrev} className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors" title="Previous page">
                <ChevronLeft size={14} />
              </button>
              <button onClick={() => router.push(buildUrl({ page: page + 1 }))} disabled={!hasNext} className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors" title="Next page">
                <ChevronRight size={14} />
              </button>
              <button onClick={() => router.push(buildUrl({ page: Math.ceil(total / pageSize) }))} disabled={!hasNext} className="flex items-center justify-center w-7 h-7 rounded-full border border-[#E2E7F2] bg-white hover:bg-[#F0F7FF] disabled:opacity-30 disabled:cursor-default cursor-pointer transition-colors" title="Last page">
                <ChevronsRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3 mb-4">
          <p className="text-[13px] text-[#C0392B]">{error}</p>
          <button
            type="button"
            onClick={() => { setLoading(true); setRetryKey((k) => k + 1); }}
            className="text-[13px] font-medium underline underline-offset-2 transition-colors cursor-pointer bg-transparent border-none p-0 text-[#3A4565] hover:text-[#0B1533]"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-40 rounded-[14px] animate-pulse motion-reduce:animate-none bg-[#EDF0F7]" />
          ))}
        </div>
      ) : projects.length === 0 ? (
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
      ) : paginated.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-[14px] border border-[#E2E7F2] bg-white">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-[#FFF3D6]">
            <Search size={24} className="text-[#8A5A00]" />
          </div>
          <div className="text-center">
            <div className="text-[15px] font-semibold text-[#0B1533]">No clients match your search</div>
            <p className="text-[13px] mt-1 text-[#5F6A88]">Try a different search term or clear the status filter.</p>
          </div>
          <button
            onClick={() => { setSearchInput(""); router.push(V2_ROUTES.PORTFOLIO_TRACKER); }}
            className="inline-flex items-center gap-1.5 mt-1 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] hover:bg-[#F0F7FF] cursor-pointer transition-colors"
          >
            <X size={13} /> Clear filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 items-stretch">
          {paginated.map((p) => (
            <ProjectCard key={p.id} item={p} editable={editable} />
          ))}
        </div>
      )}

      {!editable && projects.length > 0 && (
        <p className="text-[11.5px] mt-4 inline-flex items-center gap-1 text-[#5F6A88]">
          <ChevronRight size={11} /> Status only — content and file access are restricted to Marketing.
        </p>
      )}
    </div>
  );
}
