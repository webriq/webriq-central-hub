"use client";

import { useEffect, useState } from "react";
import { CalendarClock, CheckCircle2, Clock, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROGRAMME_PHASES, getCurrentProgrammeDay } from "@/config/customer-phases";
import type { CustomerPhaseRow, CustomerDeliverableRow, ProjectRow } from "@/types/database";

interface ProgrammeTabProps {
  customerId: string;
  isDark: boolean;
}

type PhaseStyle = { text: string; textDark: string; bg: string; bgDark: string };
const PHASE_STYLES: Record<number, PhaseStyle> = {
  1: { text: "text-blue-600", textDark: "text-blue-400", bg: "bg-blue-50", bgDark: "bg-blue-500/10" },
  2: { text: "text-violet-600", textDark: "text-violet-400", bg: "bg-violet-50", bgDark: "bg-violet-500/10" },
  3: { text: "text-teal-600", textDark: "text-teal-400", bg: "bg-teal-50", bgDark: "bg-teal-500/10" },
  4: { text: "text-amber-600", textDark: "text-amber-400", bg: "bg-amber-50", bgDark: "bg-amber-500/10" },
  5: { text: "text-slate-700", textDark: "text-slate-300", bg: "bg-slate-100", bgDark: "bg-slate-500/10" },
};

type ProgrammeState = { phases: CustomerPhaseRow[]; deliverables: CustomerDeliverableRow[] };

// Read-only history view — only ever shows a project once it's been handed over
// (onboarding_visible_at set). Phase-1 editing (Start/Jump-to-phase/wizard) now lives
// exclusively in the gated /v2/onboarding module; this tab never writes anything.
export default function ProgrammeTab({ customerId, isDark }: ProgrammeTabProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleProjects, setVisibleProjects] = useState<ProjectRow[]>([]);
  const [programmeByProject, setProgrammeByProject] = useState<Record<string, ProgrammeState>>({});

  useEffect(() => {
    let ignore = false;
    fetch(`/api/customers/${customerId}/projects`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Failed to load projects");
        const data: unknown = await res.json();
        const all = Array.isArray(data) ? (data as ProjectRow[]) : [];
        const visible = all.filter((p) => p.onboarding_visible_at);
        if (ignore) return;
        setVisibleProjects(visible);

        const entries = await Promise.all(
          visible.map(async (p) => {
            try {
              const r = await fetch(`/api/projects/${p.id}/programme`);
              if (!r.ok) return [p.id, null] as const;
              const d = await r.json();
              return [p.id, { phases: d.phases ?? [], deliverables: d.deliverables ?? [] }] as const;
            } catch {
              return [p.id, null] as const;
            }
          })
        );
        if (ignore) return;
        const map: Record<string, ProgrammeState> = {};
        for (const [id, state] of entries) if (state) map[id] = state;
        setProgrammeByProject(map);
        setError(null);
      })
      .catch(() => { if (!ignore) setError("Failed to load programme history."); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [customerId]);

  const cardCls = isDark
    ? "bg-[#121726] border border-white/[0.08] rounded-xl shadow-[0_1px_4px_rgba(0,0,0,0.15)]"
    : "bg-white border border-slate-200 rounded-xl shadow-[0_1px_4px_rgba(0,0,0,0.05)]";
  const textPrimary = isDark ? "text-slate-200" : "text-slate-900";
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";

  if (loading) {
    return <div className={cn("text-[13px] text-center py-12", textMuted)}>Loading programme history…</div>;
  }

  if (error) {
    return <p className="text-[13px] text-red-500 py-6">{error}</p>;
  }

  if (visibleProjects.length === 0) {
    return (
      <div className={cn(cardCls, "p-8 flex flex-col items-center text-center gap-3")}>
        <CalendarClock size={32} className={textMuted} />
        <div className={cn("text-base font-bold", textPrimary)}>No handed-over onboarding yet</div>
        <p className={cn("text-[13px] max-w-md", textMuted)}>
          Projects in Phase 1 onboarding stay in the dedicated Onboarding module until Bert hands them over — this tab shows their 120-day history once that happens.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {visibleProjects.map((project) => {
        const state = programmeByProject[project.id];
        if (!state || !state.phases.length) return null;
        const started = state.phases.find((p) => p.phase_number === 1)?.actual_start_date;
        const startedAt = started ? new Date(started).toISOString() : null;
        const currentDay = startedAt ? Math.min(120, getCurrentProgrammeDay(startedAt)) : null;
        const isComplete = state.phases.find((p) => p.phase_number === 5)?.status === "completed";
        const phaseStatusMap = new Map(state.phases.map((p) => [p.phase_number, p.status]));

        return (
          <div key={project.id} className={cn(cardCls, "p-5")}>
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div>
                <div className={cn("text-[14px] font-bold", textPrimary)}>{project.name}</div>
                {currentDay !== null && (
                  <div className={cn("text-[12px]", textMuted)}>Day {currentDay} / 120{isComplete ? " · Programme complete" : ""}</div>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              {PROGRAMME_PHASES.map((phase) => {
                const dbStatus = phaseStatusMap.get(phase.number) ?? "not_started";
                const phaseDeliverables = state.deliverables.filter((d) => d.phase_number === phase.number);
                const doneCount = phaseDeliverables.filter((d) => d.status === "done").length;
                const style = PHASE_STYLES[phase.number];
                return (
                  <div key={phase.number} className={cn("flex items-center gap-3 px-3 py-2.5 rounded-lg", isDark ? "bg-white/[0.02]" : "bg-slate-50/60")}>
                    <div className={cn("w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[12px] font-bold", dbStatus === "not_started" ? (isDark ? "bg-white/[0.06] text-slate-500" : "bg-slate-100 text-slate-400") : cn(isDark ? style.bgDark : style.bg, isDark ? style.textDark : style.text))}>
                      {dbStatus === "completed" ? <CheckCircle2 size={13} /> : phase.number}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn("text-[12.5px] font-semibold", textPrimary)}>{phase.name}</span>
                        <PhaseBadge status={dbStatus} isDark={isDark} />
                      </div>
                      <div className={cn("text-[10.5px] flex items-center gap-2", textMuted)}>
                        <span className="font-mono">Day {phase.dayStart}–{phase.dayEnd}</span>
                        <span className="inline-flex items-center gap-1"><Users size={9} /> {phase.owner}</span>
                        <span className="inline-flex items-center gap-1"><Clock size={9} /> {doneCount}/{phase.deliverables.length}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function PhaseBadge({ status, isDark }: { status: string; isDark: boolean }) {
  const cfg: Record<string, { light: string; dark: string; label: string }> = {
    completed: { light: "bg-green-50 text-green-600", dark: "text-green-400 bg-green-500/15", label: "Completed" },
    active: { light: "bg-blue-50 text-blue-600", dark: "text-blue-400 bg-blue-500/15", label: "Active" },
    skipped: { light: "bg-slate-100 text-slate-400", dark: "text-slate-500 bg-slate-500/15", label: "Skipped" },
    not_started: { light: "bg-slate-50 text-slate-400", dark: "text-slate-500 bg-slate-500/10", label: "Upcoming" },
  };
  const c = cfg[status] ?? cfg.not_started;
  return <span className={cn("text-[10px] font-semibold rounded-full px-1.5 py-px", isDark ? c.dark : c.light)}>{c.label}</span>;
}
