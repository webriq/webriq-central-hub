"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, Search, X, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { PROGRAMME_PHASES } from "@/config/customer-phases";
import type { HealthTone, ProjectStatusReportItem, StatusReportResponse } from "./_status-report-types";
import { HEALTH_LABEL } from "./_status-report-types";
import StatusReportTable from "./_status-report-table";

type HealthFilter = "all" | Exclude<HealthTone, null>;
type SortBy = "overdue" | "name";

const HEALTH_FILTERS: HealthFilter[] = ["all", "needs_attention", "at_risk", "on_track", "ahead_of_schedule"];

export default function StatusReportClient({ role }: { role: string | null }) {
  const [projects, setProjects] = useState<ProjectStatusReportItem[]>([]);
  const [canEditNotes, setCanEditNotes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState<HealthFilter>("all");
  const [phaseFilter, setPhaseFilter] = useState<number | "all">("all");
  const [includeCompleted, setIncludeCompleted] = useState(false);
  const [sortBy, setSortBy] = useState<SortBy>("overdue");

  useEffect(() => {
    let ignore = false;
    fetch("/api/onboarding/projects/status-report")
      .then(async (res) => {
        if (!res.ok) throw new Error();
        const data: StatusReportResponse = await res.json();
        if (!ignore) {
          setProjects(Array.isArray(data.projects) ? data.projects : []);
          setCanEditNotes(!!data.canEditNotes);
          setError(null);
        }
      })
      .catch(() => { if (!ignore) setError("Failed to load the status report."); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [retryKey]);

  function handleNoteSaved(projectId: string, phaseNumber: number, note: string | null) {
    setProjects((prev) =>
      prev.map((p) => {
        if (p.id !== projectId) return p;
        const phases = p.phases.map((ph) => (ph.phaseNumber === phaseNumber ? { ...ph, delayNote: note } : ph));
        return {
          ...p,
          phases,
          currentPhase: p.currentPhase.phaseNumber === phaseNumber ? { ...p.currentPhase, delayNote: note } : p.currentPhase,
        };
      })
    );
  }

  const filtered = useMemo(() => {
    let list = projects;
    if (!includeCompleted) list = list.filter((p) => !p.isFullyCompleted);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((p) => `${p.projectName} ${p.companyName}`.toLowerCase().includes(q));
    if (healthFilter !== "all") list = list.filter((p) => p.health === healthFilter);
    if (phaseFilter !== "all") list = list.filter((p) => p.currentPhase.phaseNumber === phaseFilter);

    const sorted = [...list];
    if (sortBy === "overdue") {
      sorted.sort((a, b) => b.currentPhase.daysOverdue - a.currentPhase.daysOverdue);
    } else {
      sorted.sort((a, b) => a.projectName.localeCompare(b.projectName));
    }
    return sorted;
  }, [projects, search, healthFilter, phaseFilter, includeCompleted, sortBy]);

  const isFiltered = !!search.trim() || healthFilter !== "all" || phaseFilter !== "all" || includeCompleted;

  return (
    <div>
      <div className="sticky top-0 z-20 bg-[#F4F6FB]">
        <div className="max-w-350 mx-auto px-8 pt-6 pb-4">
          <Link href={V2_ROUTES.PORTFOLIO_TRACKER} className="inline-flex items-center gap-1.5 text-[12px] font-medium text-[#5F6A88] hover:text-[#0B1533] transition-colors mb-2">
            <ArrowLeft size={13} /> Portfolio Tracker
          </Link>
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <div>
              <h1 className="font-heading text-[22px] font-bold tracking-[-0.02em] flex items-center gap-2 text-[#0B1533]">
                <ClipboardList size={20} className="text-[#5F6A88]" /> Status report
              </h1>
              <p className="text-[13px] mt-0.5 text-[#5F6A88]">
                {filtered.length} project{filtered.length === 1 ? "" : "s"} currently in the 120-day programme — current phase, health, and overdue reasons at a glance.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative min-w-[220px] max-w-xs flex-shrink-0">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#5F6A88]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search clients or projects…"
                className="w-full pl-8 pr-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14] placeholder:text-[#5F6A88]"
              />
            </div>

            <div className="flex items-center gap-1.5 flex-wrap shrink-0">
              {HEALTH_FILTERS.map((h) => (
                <button
                  key={h}
                  onClick={() => setHealthFilter(h)}
                  aria-pressed={healthFilter === h}
                  className={cn(
                    "px-3 py-[4.5px] rounded-full border text-[11px] font-semibold transition-colors cursor-pointer",
                    healthFilter === h ? "bg-[#071133] border-[#071133] text-white" : "bg-white border-[#E2E7F2] text-[#5F6A88] hover:border-[#A8C6F5] hover:text-[#0B1533]"
                  )}
                >
                  {h === "all" ? "All" : HEALTH_LABEL[h]}
                </button>
              ))}
            </div>

            <select
              value={phaseFilter}
              onChange={(e) => setPhaseFilter(e.target.value === "all" ? "all" : Number(e.target.value))}
              className="h-8 px-2.5 pr-6 rounded-lg border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] outline-none focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14] cursor-pointer shrink-0"
            >
              <option value="all">All phases</option>
              {PROGRAMME_PHASES.map((p) => (
                <option key={p.number} value={p.number}>{p.name}</option>
              ))}
            </select>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortBy)}
              className="h-8 px-2.5 pr-6 rounded-lg border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] outline-none focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14] cursor-pointer shrink-0"
            >
              <option value="overdue">Most overdue first</option>
              <option value="name">Project name</option>
            </select>

            <label className="flex items-center gap-1.5 text-[12px] font-medium text-[#3A4565] cursor-pointer shrink-0">
              <input type="checkbox" checked={includeCompleted} onChange={(e) => setIncludeCompleted(e.target.checked)} className="cursor-pointer" />
              Include completed
            </label>

            {isFiltered && (
              <button
                onClick={() => { setSearch(""); setHealthFilter("all"); setPhaseFilter("all"); setIncludeCompleted(false); }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] hover:bg-[#F0F7FF] cursor-pointer shrink-0 transition-colors"
              >
                <X size={13} /> Clear filters
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-350 mx-auto px-8 py-5">
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

        <StatusReportTable
          projects={filtered}
          loading={loading}
          canEditNotes={canEditNotes}
          onNoteSaved={handleNoteSaved}
          hasAnyProjects={projects.length > 0}
          roleForEmptyState={role}
        />
      </div>
    </div>
  );
}
