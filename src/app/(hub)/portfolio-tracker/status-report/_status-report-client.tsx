"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ClipboardList, Search, X, ArrowLeft } from "lucide-react";
import { V2_ROUTES } from "@/config/constants";
import { PROGRAMME_PHASES, CLASSIFICATIONS } from "@/config/customer-phases";
import type { ProjectStatusReportItem, StatusReportResponse } from "./_status-report-types";
import { HEALTH_LABEL } from "./_status-report-types";
import StatusReportTable from "./_status-report-table";
import { FilterMultiSelect } from "../_filter-multi-select";
import { SortSelect } from "../_sort-select";

// Health filter — checkbox multi-select (task 224), mirrors /projects' FilterMultiSelect.
// "All" selected means unfiltered (not an exact .in() match), so rows with health === null
// (no active/overdue phase to roll up) still show up when nothing has been deliberately
// narrowed — see task 224's Key Design Decision on this.
const HEALTH_OPTIONS = (["needs_attention", "at_risk", "on_track", "ahead_of_schedule"] as const).map((h) => ({
  value: h,
  label: HEALTH_LABEL[h],
}));
// "unclassified" covers legacy/pre-classification-system projects (classification: null).
const CLASSIFICATION_OPTIONS = [
  ...CLASSIFICATIONS.map((c) => ({ value: c, label: c })),
  { value: "unclassified", label: "Unclassified" },
] as const;
// Phase filter — checkbox multi-select (task 224 follow-up amendment), same pattern as Health/
// Classification above.
const PHASE_OPTIONS = PROGRAMME_PHASES.map((p) => ({ value: String(p.number), label: p.name }));

// Sort — styled like /projects' SortSelect pill (task 224 follow-up amendment), options
// adapted to this report's actual data: no `updated_at` field exists here, so "Recently
// updated" has no analog — "Programme start" newest/oldest fills the equivalent role.
type SortBy = "overdue" | "name_asc" | "name_desc" | "days_left_asc" | "started_newest" | "started_oldest";
const SORT_OPTIONS: { value: SortBy; label: string }[] = [
  { value: "overdue", label: "Most overdue first" },
  { value: "name_asc", label: "Project name (A–Z)" },
  { value: "name_desc", label: "Project name (Z–A)" },
  { value: "days_left_asc", label: "Days left (soonest)" },
  { value: "started_newest", label: "Programme start (newest)" },
  { value: "started_oldest", label: "Programme start (oldest)" },
];

export default function StatusReportClient({ role }: { role: string | null }) {
  const [projects, setProjects] = useState<ProjectStatusReportItem[]>([]);
  const [canEditNotes, setCanEditNotes] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  const [search, setSearch] = useState("");
  const [healthSelected, setHealthSelected] = useState<string[]>(() => HEALTH_OPTIONS.map((o) => o.value));
  const [classificationSelected, setClassificationSelected] = useState<string[]>(() => CLASSIFICATION_OPTIONS.map((o) => o.value));
  const [phaseSelected, setPhaseSelected] = useState<string[]>(() => PHASE_OPTIONS.map((o) => o.value));
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
    // "All" selected (full selection) means unfiltered — a null-health row (no active/overdue
    // phase) still passes through untouched unless the user has deliberately narrowed the set.
    if (healthSelected.length !== HEALTH_OPTIONS.length) {
      list = list.filter((p) => p.health !== null && healthSelected.includes(p.health));
    }
    if (classificationSelected.length !== CLASSIFICATION_OPTIONS.length) {
      list = list.filter((p) => classificationSelected.includes(p.classification ?? "unclassified"));
    }
    if (phaseSelected.length !== PHASE_OPTIONS.length) {
      // Task 246: PHASE_OPTIONS only lists the 5 defaults — a project currently active in a
      // custom phase (number 6+) has no corresponding checkbox, so it must never be excluded by
      // this filter (there's no way for the PM to "select" it back). Only phase numbers that
      // actually appear in PHASE_OPTIONS are subject to the filter at all.
      list = list.filter(
        (p) =>
          !PHASE_OPTIONS.some((o) => o.value === String(p.currentPhase.phaseNumber)) ||
          phaseSelected.includes(String(p.currentPhase.phaseNumber))
      );
    }

    const sorted = [...list];
    switch (sortBy) {
      case "overdue":
        sorted.sort((a, b) => b.currentPhase.daysOverdue - a.currentPhase.daysOverdue);
        break;
      case "name_asc":
        sorted.sort((a, b) => a.projectName.localeCompare(b.projectName));
        break;
      case "name_desc":
        sorted.sort((a, b) => b.projectName.localeCompare(a.projectName));
        break;
      case "days_left_asc":
        sorted.sort((a, b) => a.programmeDaysLeft - b.programmeDaysLeft);
        break;
      case "started_newest":
        sorted.sort((a, b) => new Date(b.programmeStartedAt).getTime() - new Date(a.programmeStartedAt).getTime());
        break;
      case "started_oldest":
        sorted.sort((a, b) => new Date(a.programmeStartedAt).getTime() - new Date(b.programmeStartedAt).getTime());
        break;
    }
    return sorted;
  }, [projects, search, healthSelected, classificationSelected, phaseSelected, includeCompleted, sortBy]);

  const isFiltered = !!search.trim()
    || healthSelected.length !== HEALTH_OPTIONS.length
    || classificationSelected.length !== CLASSIFICATION_OPTIONS.length
    || phaseSelected.length !== PHASE_OPTIONS.length
    || includeCompleted;

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

            {/* Health filter — checkbox multi-select, "All" syncs with every option. Mirrors
                /projects' FilterMultiSelect (task 224). */}
            <FilterMultiSelect
              label="Health"
              options={HEALTH_OPTIONS}
              selected={healthSelected}
              onChange={setHealthSelected}
            />

            {/* Classification filter — StackShift I/II/Access/Access Plus, PipelineForge,
                Discrete Development, plus "Unclassified" for legacy/pre-classification rows. */}
            <FilterMultiSelect
              label="Classification"
              options={CLASSIFICATION_OPTIONS}
              selected={classificationSelected}
              onChange={setClassificationSelected}
            />

            {/* Phase filter — checkbox multi-select, "All" syncs with every option (task 224
                follow-up amendment; was previously a native single-select). */}
            <FilterMultiSelect
              label="Phase"
              options={PHASE_OPTIONS}
              selected={phaseSelected}
              onChange={setPhaseSelected}
            />

            {/* Sort — pill style matching /projects' SortSelect (task 224 follow-up
                amendment; was previously a plain rounded-lg <select>). */}
            <SortSelect value={sortBy} onChange={(v) => setSortBy(v as SortBy)} options={SORT_OPTIONS} />

            <label className="flex items-center gap-1.5 text-[12px] font-medium text-[#3A4565] cursor-pointer shrink-0">
              <input type="checkbox" checked={includeCompleted} onChange={(e) => setIncludeCompleted(e.target.checked)} className="cursor-pointer" />
              Include completed
            </label>

            {isFiltered && (
              <button
                onClick={() => {
                  setSearch("");
                  setHealthSelected(HEALTH_OPTIONS.map((o) => o.value));
                  setClassificationSelected(CLASSIFICATION_OPTIONS.map((o) => o.value));
                  setPhaseSelected(PHASE_OPTIONS.map((o) => o.value));
                  setIncludeCompleted(false);
                }}
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
