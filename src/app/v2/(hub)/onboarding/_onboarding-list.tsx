"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Rocket, Plus, Upload, Building2, CalendarClock, ChevronRight, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";

export type OnboardingProjectListItem = {
  project_id: string;
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
  if (!name) return "#94A3B8";
  return AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];
}

function AvatarStack({ members }: { members: { id: string; full_name: string | null }[] }) {
  if (members.length === 0) return null;
  const visible = members.slice(0, MAX_VISIBLE_AVATARS);
  const overflow = members.length - visible.length;
  return (
    <div className="flex items-center">
      {visible.map((m, i) => (
        <div
          key={m.id}
          title={m.full_name ?? "Unnamed"}
          className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold text-white ring-2 ring-white shrink-0", i > 0 && "-ml-2")}
          style={{ background: colorFor(m.full_name) }}
        >
          {initialsFor(m.full_name)}
        </div>
      ))}
      {overflow > 0 && (
        <div className="w-6 h-6 -ml-2 rounded-full flex items-center justify-center text-[9px] font-semibold text-slate-600 bg-slate-200 ring-2 ring-white shrink-0">
          +{overflow}
        </div>
      )}
    </div>
  );
}

const STATUS_STYLE: Record<string, { label: string; text: string; bg: string; border: string }> = {
  draft: { label: "Draft", text: "text-slate-500", bg: "bg-slate-50", border: "border-slate-200" },
  scheduled: { label: "Scheduled", text: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200" },
  in_progress: { label: "In Progress", text: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function ProjectCard({ item, editable }: { item: OnboardingProjectListItem; editable: boolean }) {
  const router = useRouter();
  const style = STATUS_STYLE[item.status] ?? STATUS_STYLE.draft;

  const content = (
    <div
      className={cn(
        "rounded-xl border bg-white p-4 transition-colors",
        editable ? "border-slate-200 hover:border-slate-300 cursor-pointer" : "border-slate-100"
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-2.5">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold text-slate-900 truncate">{item.project_name}</div>
          <div className="inline-flex items-center gap-1 text-[12px] text-slate-500 truncate">
            <Building2 size={11} /> {item.company_name}
          </div>
        </div>
        <span className={cn("shrink-0 inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full border whitespace-nowrap", style.text, style.bg, style.border)}>
          {style.label}
        </span>
      </div>

      {item.current_day ? (
        <>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-blue-500 transition-[width] duration-300" style={{ width: `${item.progress_pct}%` }} />
            </div>
            <span className="text-[11px] text-slate-500 font-mono shrink-0">Day {item.current_day}/120</span>
          </div>
          <div className="text-[11.5px] text-slate-500">
            {item.current_phase_name
              ? `Phase ${item.current_phase_number}: ${item.current_phase_name}`
              : "Onboarding"}
            {item.current_phase_number === 1 && item.target_handover_date && (
              <span className="text-slate-400"> · Handover ~{formatDate(item.target_handover_date)}</span>
            )}
          </div>
        </>
      ) : item.scheduled_onboarding_start_at ? (
        <div className="inline-flex items-center gap-1.5 text-[11.5px] text-amber-600">
          <CalendarClock size={12} /> Starts {new Date(item.scheduled_onboarding_start_at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
        </div>
      ) : (
        <div className="inline-flex items-center gap-1.5 text-[11.5px] text-slate-400">
          <Clock3 size={12} /> Not started
        </div>
      )}

      {(item.classification || item.members.length > 0) && (
        <div className="mt-2.5 pt-2.5 border-t border-slate-50 flex items-center justify-between gap-2">
          <div className="text-[11px] text-slate-400 truncate">{item.classification}</div>
          <AvatarStack members={item.members} />
        </div>
      )}
    </div>
  );

  if (!editable) return content;
  return (
    <button onClick={() => router.push(`${V2_ROUTES.ONBOARDING}/${item.project_id}`)} className="text-left w-full bg-transparent border-none p-0 cursor-pointer">
      {content}
    </button>
  );
}

export default function OnboardingList({ role }: { role: string | null }) {
  const [projects, setProjects] = useState<OnboardingProjectListItem[]>([]);
  const [canCreate, setCanCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
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
  }, []);

  const editable = role === "marketing" || role === "admin" || role === "super_admin";

  return (
    <div className="max-w-[1400px] mx-auto px-8 py-6">
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-[22px] font-bold text-slate-900 tracking-[-0.02em] flex items-center gap-2">
            <Rocket size={20} className="text-slate-500" /> Onboarding
          </h1>
          <p className="text-[13px] text-slate-500 mt-0.5">
            {editable
              ? "120-day programme intake and progress, Phase 1–5 — Phase 1 is hidden from PM/staff view until handover."
              : "Projects currently going through Phase 1 onboarding."}
          </p>
        </div>
        {canCreate && (
          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={V2_ROUTES.ONBOARDING_IMPORT}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-slate-200 text-slate-700 text-[13px] font-medium hover:bg-slate-50 transition-colors cursor-pointer"
            >
              <Upload size={16} /> Import Project
            </Link>
            <Link
              href={`${V2_ROUTES.ONBOARDING}/new`}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-[13px] font-medium hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Plus size={16} /> New Project
            </Link>
          </div>
        )}
      </div>

      {error && <p className="text-[13px] text-red-500 mb-4">{error}</p>}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-32 rounded-xl bg-slate-100 animate-pulse" />
          ))}
        </div>
      ) : projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 rounded-xl border border-slate-200 bg-white">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center">
            <Rocket size={26} className="text-slate-400" />
          </div>
          <div className="text-center">
            <div className="text-[15px] font-semibold text-slate-700">No projects in onboarding</div>
            <p className="text-[13px] text-slate-400 mt-1">
              {canCreate ? "Start a new intake to begin a 120-day onboarding." : "Nothing is currently gated behind Phase 1."}
            </p>
          </div>
          {canCreate && (
            <Link
              href={`${V2_ROUTES.ONBOARDING}/new`}
              className="inline-flex items-center gap-2 mt-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-[13px] font-medium hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <Plus size={15} /> New Project
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {projects.map((p) => (
            <ProjectCard key={p.project_id} item={p} editable={editable} />
          ))}
        </div>
      )}

      {!editable && projects.length > 0 && (
        <p className="text-[11.5px] text-slate-400 mt-4 inline-flex items-center gap-1">
          <ChevronRight size={11} /> Status only — content and file access are restricted to Marketing.
        </p>
      )}
    </div>
  );
}
