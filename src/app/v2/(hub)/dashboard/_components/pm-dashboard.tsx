"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  Building2, AlertTriangle, CalendarClock, Rocket, Bell,
  ChartGantt, CheckCircle2, Clock3, Download,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { V2_ROUTES } from "@/config/constants";
import { useGreeting } from "@/hooks/use-greeting";
import { getPhaseByNumber, PROGRAMME_PHASES, INTERNAL_DELIVERABLES } from "@/config/customer-phases";
import {
  Chip, PhaseChip, ProgrammeTrack, OnboardingStatusPill, SkeletonRow,
} from "./dashboard-shared";
import type { OnboardingProjectListItem } from "../../portfolio-tracker/_onboarding-list";

// ─── Types ────────────────────────────────────────────────────────────────────

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
};

type DeliverableRow = {
  id: string;
  project_id: string;
  phase_number: number;
  deliverable_key: string;
  status: "pending" | "in_progress" | "done";
};

type InternalDeliverableRow = {
  id: string;
  project_id: string;
  deliverable_key: string;
  status: "pending" | "in_progress" | "done";
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = ["#0063D6", "#6A48E0", "#0B8A93", "#B85512", "#177E48", "#44508A"];

function initialsFor(name: string | null): string {
  if (!name) return "?";
  return name.split(" ").filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function isWithinDays(dateIso: string, days: number): boolean {
  const target = new Date(dateIso).getTime();
  const now = Date.now();
  return target >= now && target <= now + days * 86_400_000;
}

function csvCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

// Client-side export of the real, already-fetched programme roster — no new API, no fabricated
// figures, just the same rows the Programme board/Clients table render, as a CSV download.
function exportWeeklyReport(projects: OnboardingProjectListItem[]) {
  const header = ["Client", "Classification", "Phase", "Day", "Status", "Target handover date"];
  const rows = projects.map((p) => [
    p.company_name,
    p.classification ?? "",
    p.current_phase_name ?? "",
    p.current_day != null ? `${p.current_day} / 120` : "",
    p.status,
    p.target_handover_date ? new Date(p.target_handover_date).toLocaleDateString("en-US") : "",
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `webriq-programme-report-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function projectStatusChip(p: OnboardingProjectListItem) {
  if (!p.current_phase_number || p.current_day == null) {
    return <Chip tone="neutral">Tracking</Chip>;
  }
  const phase = getPhaseByNumber(p.current_phase_number);
  const daysLeft = phase.dayEnd - p.current_day;
  if (daysLeft < 0) return <Chip tone="late" dot>{Math.abs(daysLeft)} day{Math.abs(daysLeft) === 1 ? "" : "s"} late</Chip>;
  if (daysLeft <= 1) return <Chip tone="warn" dot>Due soon</Chip>;
  return <Chip tone="ok" dot>On track</Chip>;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatTile({ icon, iconBg, iconColor, label, value, note, loading }: {
  icon: React.ReactNode; iconBg: string; iconColor: string; label: string;
  value: React.ReactNode; note?: string; loading: boolean;
}) {
  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] p-[17px_15px] flex flex-col gap-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-semibold text-[#5F6A88]">{label}</span>
        <span className="w-[30px] h-[30px] rounded-lg flex items-center justify-center shrink-0" style={{ background: iconBg, color: iconColor }}>
          {icon}
        </span>
      </div>
      <div className="font-heading text-[28px] font-bold leading-none tracking-[-0.02em] text-[#0B1533]">
        {loading ? "—" : value}
      </div>
      {note && <div className="text-[11px] text-[#5F6A88]">{note}</div>}
    </div>
  );
}

function SectionPanel({ title, hint, link, linkHref, children, noPad }: {
  title: React.ReactNode; hint?: string; link?: string; linkHref?: string;
  children: React.ReactNode; noPad?: boolean;
}) {
  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] overflow-hidden">
      <div className="flex items-center gap-2.5 flex-wrap px-[18px] py-3.5 border-b border-[#EDF0F7]">
        <span className="font-heading text-[15px] font-semibold text-[#0B1533] tracking-[-0.01em]">{title}</span>
        {hint && <span className="text-[11px] text-[#5F6A88]">{hint}</span>}
        {link && linkHref && (
          <Link href={linkHref} className="ml-auto text-[12px] font-semibold text-[#0063D6] hover:underline">
            {link} →
          </Link>
        )}
      </div>
      <div className={noPad ? "" : "p-[18px]"}>{children}</div>
    </div>
  );
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 gap-3">
      <div className="w-12 h-12 rounded-2xl bg-[#F0F7FF] flex items-center justify-center text-[#007BFF]">{icon}</div>
      <div className="text-center">
        <div className="text-[13px] font-bold text-[#0B1533]">{title}</div>
        <p className="text-[12px] text-[#5F6A88] mt-1 max-w-[280px]">{body}</p>
      </div>
    </div>
  );
}

function ProgrammeBoard({ projects, loading }: { projects: OnboardingProjectListItem[]; loading: boolean }) {
  if (loading) {
    return <div className="p-[18px] space-y-3"><SkeletonRow /><SkeletonRow /><SkeletonRow /></div>;
  }
  if (projects.length === 0) {
    return <EmptyState icon={<ChartGantt size={22} />} title="No clients in the programme yet" body="Clients appear here once their 120-day programme starts in the Tracker." />;
  }
  return (
    <div className="divide-y divide-[#EDF0F7]">
      {projects.map((p, idx) => (
        <Link
          key={p.id}
          href={p.project_id ? `${V2_ROUTES.PORTFOLIO_TRACKER}/${p.project_id}` : V2_ROUTES.PORTFOLIO_TRACKER}
          className="grid items-center gap-4 px-[18px] py-2.5 hover:bg-[#F0F7FF] transition-colors"
          style={{ gridTemplateColumns: "210px 1fr auto" }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-[26px] h-[26px] rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
              style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}
            >
              {initialsFor(p.company_name)}
            </span>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-[#0B1533] truncate">{p.company_name}</div>
              <div className="text-[10px] text-[#5F6A88] truncate">{p.classification ?? "Unclassified"}</div>
            </div>
          </div>
          <ProgrammeTrack currentDay={p.current_day ?? 1} phaseNumber={p.current_phase_number} />
          <div className="flex items-center gap-2 justify-end">
            {p.current_phase_number && p.current_phase_name && (
              <PhaseChip phaseNumber={p.current_phase_number} phaseName={p.current_phase_name} />
            )}
            {projectStatusChip(p)}
          </div>
        </Link>
      ))}
    </div>
  );
}

function ClientsTable({ projects, loading }: { projects: OnboardingProjectListItem[]; loading: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr>
            {["Client", "Classification", "Phase", "Day", "Status"].map((h, i) => (
              <th key={h} className={`text-left text-[9.5px] font-bold text-[#5F6A88] uppercase tracking-[0.09em] py-2.5 border-b border-[#EDF0F7] bg-[#FAFBFE] ${i === 0 ? "pl-[18px]" : "px-3"}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr><td colSpan={5} className="p-[18px]"><SkeletonRow /></td></tr>
          ) : projects.length === 0 ? (
            <tr><td colSpan={5} className="text-[12px] text-[#5F6A88] px-[18px] py-6">No clients in the programme yet.</td></tr>
          ) : (
            projects.map((p, idx) => (
              <tr key={p.id} className="hover:bg-[#F0F7FF] transition-colors">
                <td className="pl-[18px] px-3 py-2.5 border-b border-[#EDF0F7]">
                  <Link href={p.project_id ? `${V2_ROUTES.PORTFOLIO_TRACKER}/${p.project_id}` : V2_ROUTES.PORTFOLIO_TRACKER} className="flex items-center gap-2.5 min-w-0">
                    <span className="w-[22px] h-[22px] rounded-full flex items-center justify-center text-[9px] font-bold text-white shrink-0" style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length] }}>
                      {initialsFor(p.company_name)}
                    </span>
                    <span className="text-[13px] font-semibold text-[#0B1533] truncate">{p.company_name}</span>
                  </Link>
                </td>
                <td className="px-3 py-2.5 border-b border-[#EDF0F7]">
                  {p.classification ? <Chip tone="neutral">{p.classification}</Chip> : <span className="text-[11px] text-[#5F6A88]">—</span>}
                </td>
                <td className="px-3 py-2.5 border-b border-[#EDF0F7]">
                  {p.current_phase_number && p.current_phase_name ? <PhaseChip phaseNumber={p.current_phase_number} phaseName={p.current_phase_name} /> : <span className="text-[11px] text-[#5F6A88]">—</span>}
                </td>
                <td className="px-3 py-2.5 border-b border-[#EDF0F7]">
                  <span className="font-mono text-[11px] text-[#3A4565]">{p.current_day != null ? `${p.current_day} / 120` : "—"}</span>
                </td>
                <td className="px-3 py-2.5 border-b border-[#EDF0F7]">
                  <OnboardingStatusPill status={p.status} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

function RemindersCard({ notifications, loading }: { notifications: NotificationItem[]; loading: boolean }) {
  if (loading) return <div className="p-[18px] space-y-3"><SkeletonRow /><SkeletonRow /></div>;
  if (notifications.length === 0) {
    return <EmptyState icon={<Bell size={20} />} title="You're all caught up" body="Programme reminders — handovers, sign-off gates, status cadences — will show up here." />;
  }
  return (
    <div className="divide-y divide-[#EDF0F7]">
      {notifications.map((n) => {
        const content = (
          <div className="flex gap-2.5 px-[18px] py-3 hover:bg-[#F0F7FF] transition-colors">
            <span className="w-[30px] h-[30px] rounded-lg flex items-center justify-center shrink-0 mt-0.5 bg-[#FFEFE3] text-[#E2762F]">
              <Bell size={13} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold text-[#0B1533] leading-snug">{n.title}</div>
              {n.body && <div className="text-[11px] text-[#5F6A88] mt-0.5 line-clamp-2">{n.body}</div>}
              <div className="font-mono text-[9.5px] font-medium text-[#5F6A88] mt-1">
                {new Date(n.created_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase()}
              </div>
            </div>
            {!n.read_at && <span className="w-[7px] h-[7px] rounded-full bg-[#FB914E] shrink-0 mt-1.5" />}
          </div>
        );
        return n.url ? <Link key={n.id} href={n.url} className="block">{content}</Link> : <div key={n.id}>{content}</div>;
      })}
    </div>
  );
}

function DeveloperQueueCard({ rows, loading }: {
  rows: { projectName: string; deliverableName: string; owner: string; dayEnd: number; currentDay: number; status: DeliverableRow["status"] }[];
  loading: boolean;
}) {
  if (loading) return <div className="p-[18px] space-y-3"><SkeletonRow /><SkeletonRow /></div>;
  if (rows.length === 0) {
    return <EmptyState icon={<Clock3 size={20} />} title="No open Migrate & Rebrand work" body="Deliverables for clients currently in Phase 2 will appear here." />;
  }
  return (
    <div className="divide-y divide-[#EDF0F7]">
      {rows.map((r, i) => {
        const daysLeft = r.dayEnd - r.currentDay;
        const dueTone = daysLeft < 0 ? "late" : daysLeft <= 1 ? "warn" : "neutral";
        const dueLabel = daysLeft < 0 ? `${Math.abs(daysLeft)}D OVERDUE` : `DUE DAY ${r.dayEnd}`;
        return (
          <div key={i} className="px-[18px] py-3 flex flex-col gap-1.5">
            <div className="flex items-start justify-between gap-2.5">
              <div className="min-w-0">
                <div className="text-[12px] font-semibold text-[#0B1533] leading-snug">{r.deliverableName}</div>
                <div className="text-[11px] text-[#5F6A88] truncate">{r.projectName} · {r.owner}</div>
              </div>
              <Chip tone={dueTone} className="font-mono shrink-0">{dueLabel}</Chip>
            </div>
            <span className="text-[10px] text-[#5F6A88]">{r.status === "in_progress" ? "In progress" : r.status === "done" ? "Done" : "Not started"}</span>
          </div>
        );
      })}
    </div>
  );
}

function IntakeChecklistCard({ project, statusByKey, loading }: {
  project: OnboardingProjectListItem | null;
  statusByKey: Map<string, "pending" | "in_progress" | "done">;
  loading: boolean;
}) {
  if (loading) return <div className="p-[18px] space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-8 animate-pulse bg-[#EDF0F7] rounded" />)}</div>;
  if (!project) {
    return <EmptyState icon={<CheckCircle2 size={20} />} title="No Phase 1 clients right now" body="The intake checklist for the client nearest their Day 15 sign-off will appear here." />;
  }
  return (
    <div>
      {INTERNAL_DELIVERABLES.map((d) => {
        const status = statusByKey.get(d.key) ?? "pending";
        const done = status === "done";
        const subPhase = PROGRAMME_PHASES[0].deliverables.find((sp) => sp.key === d.subPhaseKey);
        return (
          <div key={d.key} className="flex items-center gap-2.5 px-[18px] py-2 border-b border-[#EDF0F7] last:border-0">
            <span className={`w-[17px] h-[17px] rounded-[5px] flex items-center justify-center shrink-0 ${done ? "bg-[#177E48]" : "border-[1.5px] border-[#C4CCE0]"}`}>
              {done && <CheckCircle2 size={11} className="text-white" strokeWidth={3} />}
            </span>
            <span className={`flex-1 min-w-0 text-[12px] font-medium truncate ${done ? "text-[#5F6A88] line-through decoration-[#C4CCE0]" : "text-[#0B1533]"}`}>
              {d.name}
            </span>
            <span className="font-mono text-[9px] text-[#5F6A88] shrink-0">{done ? `DAY ${subPhase?.dayEnd ?? "—"}` : "PENDING"}</span>
          </div>
        );
      })}
    </div>
  );
}

function PublishProgressCard({ project, rows, loading }: {
  project: OnboardingProjectListItem | null;
  rows: { name: string; owner: string; dayStart: number; dayEnd: number; status: DeliverableRow["status"] }[];
  loading: boolean;
}) {
  if (loading) return <div className="p-[18px] space-y-3"><SkeletonRow /><SkeletonRow /></div>;
  if (!project) {
    return <EmptyState icon={<Rocket size={20} />} title="No clients in Publish yet" body="They'll appear here once a client's programme reaches Day 31." />;
  }
  return (
    <div className="divide-y divide-[#EDF0F7]">
      {rows.map((r) => {
        const pct = r.status === "done" ? 100 : r.status === "in_progress" ? 50 : 0;
        return (
          <div key={r.name} className="px-[18px] py-3">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[12px] font-semibold text-[#0B1533]">{r.name}</span>
              <Chip tone={r.status === "done" ? "ok" : r.status === "in_progress" ? "warn" : "neutral"}>
                {r.status === "done" ? "Done" : r.status === "in_progress" ? "In progress" : "Not started"}
              </Chip>
            </div>
            <div className="h-[5px] rounded-full bg-[#EDF0F7] overflow-hidden">
              <div className="h-full rounded-full bg-[#6A48E0] transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
      <p className="text-[10.5px] text-[#5F6A88] px-[18px] py-2.5 bg-[#FAFBFE]">
        Per-page publishing counts aren&apos;t tracked yet — this shows deliverable-level progress for {project.company_name}&apos;s Publish phase.
      </p>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

interface Props {
  displayName?: string | null;
}

export default function PMDashboard({ displayName = null }: Props) {
  const { visible, text, dateLabel, dismiss } = useGreeting(displayName);

  const [trackerProjects, setTrackerProjects] = useState<OnboardingProjectListItem[]>([]);
  const [customersCount, setCustomersCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);

  const [devQueueRows, setDevQueueRows] = useState<ReturnType<typeof buildDevQueueRows>>([]);
  const [intakeProject, setIntakeProject] = useState<OnboardingProjectListItem | null>(null);
  const [intakeStatusByKey, setIntakeStatusByKey] = useState<Map<string, "pending" | "in_progress" | "done">>(new Map());
  const [publishProject, setPublishProject] = useState<OnboardingProjectListItem | null>(null);
  const [publishRows, setPublishRows] = useState<ReturnType<typeof buildPublishRows>>([]);
  const [phaseLoading, setPhaseLoading] = useState(true);

  // Base data: tracker projects, customers count, reminders.
  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      fetch("/api/onboarding/projects").then((r) => r.json()).catch(() => ({ projects: [] })),
      supabase.from("customers").select("customer_id", { count: "exact", head: true }),
      fetch("/api/notifications?limit=5").then((r) => r.json()).catch(() => ({ notifications: [] })),
    ]).then(([trackerResult, customersResult, notifResult]) => {
      setTrackerProjects((trackerResult.projects ?? []) as OnboardingProjectListItem[]);
      setCustomersCount(customersResult.count ?? 0);
      setNotifications((notifResult.notifications ?? []) as NotificationItem[]);
      setLoading(false);
    });
  }, []);

  // Phase-scoped data: Developer queue (Phase 2), intake checklist (soonest Phase-1 gate),
  // publish progress (Phase 3) — depends on the tracker project list above.
  useEffect(() => {
    if (loading) return;
    const supabase = createClient();

    const phase1Projects = trackerProjects.filter((p) => p.current_phase_number === 1 && p.current_day != null);
    const phase2Projects = trackerProjects.filter((p) => p.current_phase_number === 2);
    const phase3Projects = trackerProjects.filter((p) => p.current_phase_number === 3);

    const nextIntakeProject = phase1Projects.sort((a, b) => (a.current_day ?? 0) > (b.current_day ?? 0) ? -1 : 1)[0] ?? null;
    const nextPublishProject = phase3Projects[0] ?? null;

    const phase2Ids = phase2Projects.map((p) => p.id);
    const phase3Id = nextPublishProject?.id;
    const intakeId = nextIntakeProject?.id;

    Promise.all([
      phase2Ids.length > 0
        ? supabase.from("customer_deliverables").select("id, project_id, phase_number, deliverable_key, status").eq("phase_number", 2).in("project_id", phase2Ids)
        : Promise.resolve({ data: [] as DeliverableRow[] }),
      phase3Id
        ? supabase.from("customer_deliverables").select("id, project_id, phase_number, deliverable_key, status").eq("phase_number", 3).eq("project_id", phase3Id)
        : Promise.resolve({ data: [] as DeliverableRow[] }),
      intakeId
        ? supabase.from("onboarding_internal_deliverables").select("id, project_id, deliverable_key, status").eq("project_id", intakeId)
        : Promise.resolve({ data: [] as InternalDeliverableRow[] }),
    ]).then(([phase2Result, phase3Result, intakeResult]) => {
      const phase2Rows = (phase2Result.data ?? []) as DeliverableRow[];
      const phase3Rows = (phase3Result.data ?? []) as DeliverableRow[];
      const intakeRows = (intakeResult.data ?? []) as InternalDeliverableRow[];

      setIntakeProject(nextIntakeProject);
      setPublishProject(nextPublishProject);
      setDevQueueRows(buildDevQueueRows(phase2Projects, phase2Rows));
      setPublishRows(buildPublishRows(phase3Rows));
      setIntakeStatusByKey(new Map(intakeRows.map((r) => [r.deliverable_key, r.status])));
      setPhaseLoading(false);
    });
  }, [loading, trackerProjects]);

  const inProgress = trackerProjects.filter((p) => p.status === "in_progress");
  const lateProjects = inProgress.filter((p) => p.current_phase_number != null && p.current_day != null && p.current_day > getPhaseByNumber(p.current_phase_number).dayEnd);
  const handoverDueCount = trackerProjects.filter((p) => p.target_handover_date && isWithinDays(p.target_handover_date, 7)).length;
  const inPublishCount = inProgress.filter((p) => p.current_phase_number === 3).length;

  return (
    <div className="py-6 px-8 flex flex-col gap-5 bg-[#F4F6FB] min-h-full">
      {/* Page head: greeting + real programme summary + export action */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <AnimatePresence>
          {visible && text && (
            <motion.div
              className="cursor-pointer select-none"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.35 }}
              onClick={dismiss}
              title="Click to dismiss"
            >
              <h1 className="font-heading text-[22px] font-bold text-[#0B1533] tracking-[-0.02em]">{text}</h1>
              <p className="text-[13px] text-[#5F6A88] mt-0.5">
                {dateLabel}
                {!loading && (
                  <>
                    {" · "}
                    <span className="font-mono text-[12px] text-[#3A4565]">{inProgress.length}</span> client{inProgress.length === 1 ? "" : "s"} in the 120-day programme
                    {" · "}
                    <span className="font-mono text-[12px] text-[#3A4565]">{lateProjects.length}</span> running late
                  </>
                )}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={() => exportWeeklyReport(inProgress)}
          disabled={loading || inProgress.length === 0}
          className="inline-flex items-center gap-2 px-[15px] py-2 rounded-full text-[12px] font-semibold border border-[#E2E7F2] bg-white text-[#3A4565] hover:border-[#A8C6F5] hover:text-[#0B1533] transition-colors disabled:opacity-45 disabled:cursor-not-allowed shrink-0"
        >
          <Download size={13} />
          Export weekly report
        </button>
      </div>

      {/* Stat tiles */}
      <div className="grid grid-cols-4 gap-3.5">
        <StatTile
          icon={<Building2 size={15} />} iconBg="#E5F1FF" iconColor="#0063D6"
          label="Clients in programme" loading={loading}
          value={<>{inProgress.length}<span className="font-sans text-[11px] font-medium text-[#5F6A88] ml-1">of {customersCount} total</span></>}
        />
        <StatTile
          icon={<AlertTriangle size={15} />} iconBg="#FDE8E6" iconColor="#C0392B"
          label="Running late" loading={loading} value={lateProjects.length}
          note={lateProjects.length > 0 ? lateProjects.slice(0, 2).map((p) => p.company_name).join(" · ") : undefined}
        />
        <StatTile
          icon={<CalendarClock size={15} />} iconBg="#FFEFE3" iconColor="#B85512"
          label="Handover due this week" loading={loading} value={handoverDueCount}
        />
        <StatTile
          icon={<Rocket size={15} />} iconBg="#EFEAFD" iconColor="#6A48E0"
          label="In Publish phase" loading={loading} value={inPublishCount}
        />
      </div>

      {/* 120-Day Programme board (signature element) */}
      <SectionPanel title="120-Day Programme" hint="Each client plotted at their current day · phase widths to scale" link="Open programme view" linkHref={V2_ROUTES.PORTFOLIO_TRACKER} noPad>
        <ProgrammeBoard projects={inProgress} loading={loading} />
      </SectionPanel>

      {/* Clients table + Reminders */}
      <div className="grid gap-4 items-start" style={{ gridTemplateColumns: "minmax(0,1.7fr) minmax(0,1fr)" }}>
        <SectionPanel title="Clients" link="All clients" linkHref={V2_ROUTES.CUSTOMERS} noPad>
          <ClientsTable projects={inProgress} loading={loading} />
        </SectionPanel>
        <SectionPanel title="Reminders" hint="Programme reminders" noPad>
          <RemindersCard notifications={notifications} loading={loading} />
        </SectionPanel>
      </div>

      {/* Developer queue + Phase 1 intake + Publish progress */}
      <div className="grid grid-cols-3 gap-4 items-start">
        <SectionPanel title="Developer queue" hint="Migrate & Rebrand deliverables" noPad>
          <DeveloperQueueCard rows={devQueueRows} loading={phaseLoading} />
        </SectionPanel>
        <SectionPanel title="Phase 1 intake" hint={intakeProject ? intakeProject.company_name : undefined} noPad>
          <IntakeChecklistCard project={intakeProject} statusByKey={intakeStatusByKey} loading={phaseLoading} />
        </SectionPanel>
        <SectionPanel title="Publish progress" hint={publishProject ? publishProject.company_name : undefined} noPad>
          <PublishProgressCard project={publishProject} rows={publishRows} loading={phaseLoading} />
        </SectionPanel>
      </div>
    </div>
  );
}

// ─── Data-shaping helpers (module scope — used by useState<ReturnType<...>>) ──

function buildDevQueueRows(phase2Projects: OnboardingProjectListItem[], rows: DeliverableRow[]) {
  const phase2Config = PROGRAMME_PHASES[1]; // Migrate & Rebrand
  const rowsByProject = new Map<string, DeliverableRow[]>();
  for (const r of rows) {
    if (!rowsByProject.has(r.project_id)) rowsByProject.set(r.project_id, []);
    rowsByProject.get(r.project_id)!.push(r);
  }
  const out: { projectName: string; deliverableName: string; owner: string; dayEnd: number; currentDay: number; status: DeliverableRow["status"] }[] = [];
  for (const project of phase2Projects) {
    const projectRows = rowsByProject.get(project.id) ?? [];
    const statusByKey = new Map(projectRows.map((r) => [r.deliverable_key, r.status]));
    const nextDeliverable = phase2Config.deliverables.find((d) => (statusByKey.get(d.key) ?? "pending") !== "done");
    if (!nextDeliverable || project.current_day == null) continue;
    out.push({
      projectName: project.company_name,
      deliverableName: nextDeliverable.name,
      owner: nextDeliverable.owner,
      dayEnd: nextDeliverable.dayEnd,
      currentDay: project.current_day,
      status: statusByKey.get(nextDeliverable.key) ?? "pending",
    });
  }
  return out;
}

function buildPublishRows(rows: DeliverableRow[]) {
  const phase3Config = PROGRAMME_PHASES[2]; // Publish
  const statusByKey = new Map(rows.map((r) => [r.deliverable_key, r.status]));
  return phase3Config.deliverables.map((d) => ({
    name: d.name,
    owner: d.owner,
    dayStart: d.dayStart,
    dayEnd: d.dayEnd,
    status: statusByKey.get(d.key) ?? "pending",
  }));
}
