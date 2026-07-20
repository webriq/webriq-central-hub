"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChartGantt, Plus, Upload, Building2, CalendarClock, ChevronRight, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { usePMSettings } from "@/hooks/use-pm-settings";
import { V2_ROUTES } from "@/config/constants";

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
  status: "draft" | "scheduled" | "in_progress";
  // Task 154: deduped union of project_members + Phase 1 phase_members (task 153).
  members: { id: string; full_name: string | null }[];
};

// Mirrors OwnerChip's initials/color derivation (src/app/v2/(hub)/projects/_pm-shared.tsx) for
// visual consistency with the Projects module's assignee chips — reimplemented locally (not
// imported) since it needs overlap + "+N" overflow behavior OwnerChip doesn't have, and
// Onboarding/Projects are otherwise unrelated feature areas (page-scoped UI convention).
const AVATAR_COLORS = ["#2563EB", "#7C3AED", "#0D9488", "#DC2626", "#D97706"];
const MAX_VISIBLE_AVATARS = 3;

function initialsFor(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function colorFor(name: string | null): string {
  if (!name) return "#64748B";
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function AvatarStack({ members, isDark }: { members: { id: string; full_name: string | null }[]; isDark: boolean }) {
  if (members.length === 0) return null;
  const visible = members.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = members.length - visible.length;
  const ringCls = isDark ? "ring-[#121726]" : "ring-white";
  return (
    <div className="flex items-center">
      {visible.map((m, i) => (
        <div
          key={m.id}
          title={m.full_name ?? "Unnamed"}
          className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white ring-2 shrink-0", ringCls, i > 0 && "-ml-2")}
          style={{ background: colorFor(m.full_name) }}
        >
          {initialsFor(m.full_name)}
        </div>
      ))}
      {overflow > 0 && (
        <div className={cn("w-6 h-6 -ml-2 rounded-full flex items-center justify-center text-[9px] font-semibold ring-2 shrink-0", ringCls, isDark ? "text-slate-300 bg-white/[0.12]" : "text-slate-600 bg-slate-200")}>
          +{overflow}
        </div>
      )}
    </div>
  );
}

const STATUS_STYLE: Record<string, { label: string; text: string; bg: string; border: string; darkText: string; darkBg: string; darkBorder: string }> = {
  draft: { label: "Draft", text: "text-slate-500", bg: "bg-slate-50", border: "border-slate-200", darkText: "text-slate-400", darkBg: "bg-white/[0.06]", darkBorder: "border-white/[0.1]" },
  scheduled: { label: "Scheduled", text: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", darkText: "text-amber-400", darkBg: "bg-amber-500/15", darkBorder: "border-amber-500/25" },
  in_progress: { label: "In Progress", text: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200", darkText: "text-blue-400", darkBg: "bg-blue-500/15", darkBorder: "border-blue-500/25" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ProjectCard({ item, editable, isDark }: { item: OnboardingProjectListItem; editable: boolean; isDark: boolean }) {
  const router = useRouter();
  const style = STATUS_STYLE[item.status] ?? STATUS_STYLE.draft;
  const textPrimary = isDark ? "text-slate-100" : "text-slate-900";
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";

  const content = (
    <div
      className={cn(
        "rounded-xl border p-4 transition-colors",
        isDark ? "bg-[#121726]" : "bg-white",
        editable
          ? isDark ? "border-white/[0.08] hover:border-white/[0.15] cursor-pointer" : "border-slate-200 hover:border-slate-300 cursor-pointer"
          : isDark ? "border-white/[0.06]" : "border-slate-100"
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="min-w-0">
          <div className={cn("text-[13px] font-semibold truncate", textPrimary)}>{item.project_name}</div>
          <div className={cn("inline-flex items-center gap-1 text-[12px] truncate", textMuted)}>
            <Building2 size={11} /> {item.company_name}
          </div>
        </div>
        <span className={cn(
          "shrink-0 inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap",
          isDark ? [style.darkText, style.darkBg, style.darkBorder] : [style.text, style.bg, style.border]
        )}>
          {style.label}
        </span>
      </div>

      {item.current_day ? (
        <>
          <div className="flex items-center gap-2 mb-1.5">
            <div className={cn("flex-1 h-1.5 rounded-full overflow-hidden", isDark ? "bg-white/[0.08]" : "bg-slate-100")}>
              <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${item.progress_pct}%` }} />
            </div>
            <span className={cn("text-[11px] font-mono shrink-0", textMuted)}>Day {item.current_day}/120</span>
          </div>
          <div className={cn("text-[11.5px]", textMuted)}>
            {item.current_phase_name
              ? `Phase ${item.current_phase_number}: ${item.current_phase_name}`
              : "Onboarding"}
            {item.current_phase_number === 1 && item.target_handover_date && (
              <span className={textMuted}> · Handover ~{formatDate(item.target_handover_date)}</span>
            )}
          </div>
        </>
      ) : item.scheduled_onboarding_start_at ? (
        <div className={cn("inline-flex items-center gap-1.5 text-[11.5px]", isDark ? "text-amber-400" : "text-amber-600")}>
          <CalendarClock size={12} /> Starts {new Date(item.scheduled_onboarding_start_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </div>
      ) : (
        <div className={cn("inline-flex items-center gap-1.5 text-[11.5px]", textMuted)}>
          <Clock3 size={12} /> Not started
        </div>
      )}

      {(item.classification || item.members.length > 0) && (
        <div className={cn("mt-2.5 pt-2.5 border-t flex items-center justify-between gap-2", isDark ? "border-white/[0.06]" : "border-slate-50")}>
          <div className={cn("text-[11px] truncate", textMuted)}>{item.classification}</div>
          <AvatarStack members={item.members} isDark={isDark} />
        </div>
      )}
    </div>
  );

  if (!editable) return content;
  return (
    <button onClick={() => router.push(`${V2_ROUTES.PORTFOLIO_TRACKER}/${item.project_id ?? item.id}`)} className="text-left w-full bg-transparent border-none p-0 cursor-pointer">
      {content}
    </button>
  );
}

export default function OnboardingList({ role }: { role: string | null }) {
  const { settings } = usePMSettings();
  const isDark = settings.theme === "dark";
  const [projects, setProjects] = useState<OnboardingProjectListItem[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
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

  const editable = role === "marketing" || role === "admin" || role === "super_admin";
  const textPrimary = isDark ? "text-slate-100" : "text-slate-900";
  const textMuted = isDark ? "text-slate-400" : "text-slate-500";

  return (
    <div className="max-w-350 mx-auto px-8 py-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className={cn("text-[22px] font-bold tracking-[-0.02em] flex items-center gap-2", textPrimary)}>
            <ChartGantt size={20} className={textMuted} /> Portfolio Tracker
          </h1>
          <p className={cn("text-[13px] mt-0.5", textMuted)}>
            {editable
              ? "120-day programme intake and progress, Phase 1–5 — Phase 1 is hidden from PM/staff view until handover."
              : "Projects currently going through Phase 1 onboarding."}
          </p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={V2_ROUTES.PORTFOLIO_TRACKER_IMPORT}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border text-[13px] font-medium transition-colors cursor-pointer",
                isDark ? "border-white/[0.1] text-slate-200 hover:bg-white/[0.06]" : "border-slate-200 text-slate-700 hover:bg-slate-50"
              )}
            >
              <Upload size={16} /> Import Project
            </Link>
            <Link
              href={`${V2_ROUTES.PORTFOLIO_TRACKER}/new`}
              className={cn(
                "inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-[13px] font-medium transition-colors cursor-pointer",
                isDark ? "bg-brand hover:opacity-90" : "bg-slate-900 hover:bg-slate-800"
              )}
            >
              <Plus size={16} /> New Project
            </Link>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-3 mb-4">
          <p className={cn("text-[13px]", isDark ? "text-red-400" : "text-red-500")}>{error}</p>
          <button
            type="button"
            onClick={() => setRetryKey((k) => k + 1)}
            className={cn(
              "text-[13px] font-medium underline underline-offset-2 transition-colors cursor-pointer bg-transparent border-none p-0",
              isDark ? "text-slate-300 hover:text-white" : "text-slate-700 hover:text-slate-900"
            )}
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className={cn("h-32 rounded-xl animate-pulse motion-reduce:animate-none", isDark ? "bg-white/[0.04]" : "bg-slate-100")} />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className={cn("flex flex-col items-center justify-center py-20 gap-3 rounded-xl border", isDark ? "border-white/[0.08] bg-[#121726]" : "border-slate-200 bg-white")}>
          <div className={cn("w-14 h-14 rounded-2xl flex items-center justify-center", isDark ? "bg-white/[0.06]" : "bg-slate-100")}>
            <ChartGantt size={26} className={textMuted} />
          </div>
          <div className="text-center">
            <div className={cn("text-[15px] font-semibold", isDark ? "text-slate-200" : "text-slate-700")}>No projects in onboarding</div>
            <p className={cn("text-[13px] mt-1", textMuted)}>
              {canCreate ? "Start a new intake to begin a 120-day onboarding." : "Nothing is currently gated behind Phase 1."}
            </p>
          </div>
          {canCreate && (
            <Link
              href={`${V2_ROUTES.PORTFOLIO_TRACKER}/new`}
              className={cn(
                "inline-flex items-center gap-2 mt-2 px-4 py-2 rounded-lg text-white text-[13px] font-medium transition-colors cursor-pointer",
                isDark ? "bg-brand hover:opacity-90" : "bg-slate-900 hover:bg-slate-800"
              )}
            >
              <Plus size={15} /> New Project
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((p) => (
            <ProjectCard key={p.id} item={p} editable={editable} isDark={isDark} />
          ))}
        </div>
      )}

      {!editable && projects.length > 0 && (
        <p className={cn("text-[11.5px] mt-4 inline-flex items-center gap-1", textMuted)}>
          <ChevronRight size={11} /> Status only — content and file access are restricted to Marketing.
        </p>
      )}
    </div>
  );
}
