"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { FolderKanban, ChevronRight, ListChecks, Clock3, Eye, CheckCircle2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useGreeting } from "@/hooks/use-greeting";
import { V2_ROUTES } from "@/config/constants";
import { SkeletonRow } from "./dashboard-shared";

type ClassRecord = {
  id: string;
  customer_id: string;
  title: string;
  priority: string | null;
  status: string;
  created_at: string;
};

// No assigned_developer_id column yet — show all open/active records as the kanban
// TODO: Add assigned_developer_id to classification_records for per-dev task assignment
function groupByKanban(records: ClassRecord[]) {
  return {
    todo:       records.filter(r => ["open", "pending"].includes(r.status)),
    inProgress: records.filter(r => ["active", "planning"].includes(r.status)),
    forReview:  records.filter(r => r.status === "review"),
  };
}

// ─── v2.0 status/priority hex maps — classification_records vocabulary is not the
// tasks-table vocabulary and not a phase value, so these stay literal hex (drawn from
// --ok/--warn/--blue/--muted only) instead of reusing dashboard-shared's `Chip` tone
// enum, whose onboard/migrate/publish/ai/optimize tones are reserved for phase hues
// (DESIGN.md §1; already enforced elsewhere per tasks 183/185). Mirrors the pattern
// in `_pm-shared.tsx`'s STATUS_STYLE/PRIORITY_STYLE.
const STATUS_TONE: Record<string, string> = {
  open:     "text-[#5F6A88] bg-[#EDF0F7]",
  pending:  "text-[#5F6A88] bg-[#EDF0F7]",
  planning: "text-[#007BFF] bg-[#E5F1FF]",
  active:   "text-[#007BFF] bg-[#E5F1FF]",
  review:   "text-[#8A5A00] bg-[#FFF3D6]",
  on_hold:  "text-[#5F6A88] bg-[#EDF0F7]",
  closed:   "text-[#177E48] bg-[#E3F5EA]",
};

function StatusBadge({ status }: { status: string }) {
  const tone = STATUS_TONE[status] ?? STATUS_TONE.open;
  return (
    <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.02em] px-2 py-[2.5px] rounded-[5px] capitalize whitespace-nowrap ${tone}`}>
      <span className="w-[5px] h-[5px] rounded-full bg-current shrink-0" />
      {status.replace("_", " ")}
    </span>
  );
}

const PRIORITY_TONE: Record<string, string> = {
  CRITICAL: "text-[#C0392B]",
  HIGH:     "text-[#8A5A00]",
  NORMAL:   "text-[#007BFF]",
  LOW:      "text-[#5F6A88]",
};

const PRIORITY_LABEL: Record<string, string> = {
  CRITICAL: "Critical",
  HIGH:     "High",
  NORMAL:   "Normal",
  LOW:      "Low",
};

function PriorityLabel({ priority }: { priority: string | null }) {
  const key = priority ?? "NORMAL";
  return (
    <span className={`text-[11px] font-semibold ${PRIORITY_TONE[key] ?? PRIORITY_TONE.NORMAL}`}>
      {PRIORITY_LABEL[key] ?? "Normal"}
    </span>
  );
}

// ─── Page-local v2.0 shells — mirrors pm-dashboard.tsx's StatTile/SectionPanel
// (fixed-light, literal hex, no isDark/CSS-var dependency) ──────────────────────

function StatTile({ icon, iconBg, iconColor, label, value, loading }: {
  icon: React.ReactNode; iconBg: string; iconColor: string; label: string;
  value: React.ReactNode; loading: boolean;
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
    </div>
  );
}

function SectionPanel({ title, trailing, noPad, children }: {
  title: React.ReactNode; trailing?: React.ReactNode; noPad?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] overflow-hidden">
      <div className="flex items-center gap-2.5 flex-wrap px-[18px] py-3.5 border-b border-[#EDF0F7]">
        <span className="font-heading text-[15px] font-semibold text-[#0B1533] tracking-[-0.01em]">{title}</span>
        {trailing && <span className="ml-auto">{trailing}</span>}
      </div>
      <div className={noPad ? "" : "p-[18px]"}>{children}</div>
    </div>
  );
}

function EmptyState({ icon, title, body }: { icon: React.ReactNode; title: string; body: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
      <div className="w-9 h-9 rounded-xl bg-[#F0F7FF] flex items-center justify-center text-[#007BFF]">{icon}</div>
      <div className="text-[12px] font-bold text-[#0B1533]">{title}</div>
      <p className="text-[11px] text-[#5F6A88] max-w-[220px]">{body}</p>
    </div>
  );
}

function TaskCard({ task }: { task: ClassRecord }) {
  return (
    <div className="p-3 rounded-[10px] border border-[#E2E7F2] bg-white flex flex-col gap-2">
      <p className="text-[12px] text-[#0B1533] font-medium leading-snug line-clamp-2">{task.title}</p>
      <div className="flex items-center gap-1.5">
        <PriorityLabel priority={task.priority} />
        <span className="text-[10px] font-mono text-[#5F6A88] flex-1 truncate">{task.customer_id}</span>
        <StatusBadge status={task.status} />
      </div>
    </div>
  );
}

function WorkspaceCard({ projectsCount }: { projectsCount: number }) {
  return (
    <SectionPanel title="Your workspace" noPad>
      <Link
        href={V2_ROUTES.PROJECTS_LEGACY}
        className="group flex items-center gap-3 px-[18px] py-3 hover:bg-[#F0F7FF] transition-colors focus-visible:outline-2 focus-visible:outline-[#007BFF] focus-visible:outline-offset-2"
      >
        <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 bg-[#E5F1FF] text-[#0063D6]">
          <FolderKanban size={14} />
        </div>
        <span className="text-[12px] text-[#3A4565] flex-1">My projects</span>
        <span className="text-[13px] font-semibold text-[#0B1533]">{projectsCount}</span>
        <ChevronRight size={13} className="text-[#5F6A88] shrink-0 transition-transform group-hover:translate-x-0.5" />
      </Link>
    </SectionPanel>
  );
}

interface Props {
  userId: string;
  displayName: string | null;
  // "My projects" — same project_members-or-assigned-task definition `_project-access.ts`
  // uses to gate developer project visibility elsewhere (task 208), resolved server-side in
  // page.tsx via `getDeveloperAccessibleProjectIds()` so this component and the access-control
  // check it's gated behind never disagree about what "my projects" means.
  projectsCount: number;
  customerIds: string[];
}

export default function DevDashboard({ displayName, projectsCount, customerIds }: Props) {
  const { visible, text, dateLabel, dismiss } = useGreeting(displayName);

  const [records, setRecords] = useState<ClassRecord[]>([]);
  const [unassigned, setUnassigned] = useState<ClassRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      // No assigned_developer_id column on classification_records yet (see groupByKanban's
      // TODO above), so "My Tasks" is scoped via `customerIds` — the customers behind the
      // projects this developer is a member of or has an assigned task in (see Props above).
      customerIds.length > 0
        ? supabase
            .from("classification_records")
            .select("id, customer_id, title, priority, status, created_at")
            .in("status", ["open", "pending", "planning", "active", "review"])
            .in("customer_id", customerIds)
            .order("created_at", { ascending: false })
            .limit(20)
        : Promise.resolve({ data: [] as ClassRecord[] }),
      // Team Pool intentionally stays org-wide — it's a shared queue any developer can pick
      // up, not "my" work, so it isn't scoped to customerIds.
      supabase
        .from("classification_records")
        .select("id, customer_id, title, priority, status, created_at")
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(5),
    ]).then(([myResult, unassignedResult]) => {
      setRecords((myResult.data ?? []) as ClassRecord[]);
      setUnassigned((unassignedResult.data ?? []) as ClassRecord[]);
      setLoading(false);
    });
  }, [customerIds]);

  const { todo, inProgress, forReview } = groupByKanban(records);

  const kpis = [
    { label: "Open",        value: todo.length,       icon: <ListChecks size={15} />, iconBg: "#EDF0F7", iconColor: "#5F6A88" },
    { label: "In Progress", value: inProgress.length,  icon: <Clock3 size={15} />,     iconBg: "#E5F1FF", iconColor: "#0063D6" },
    { label: "For Review",  value: forReview.length,   icon: <Eye size={15} />,        iconBg: "#FFF3D6", iconColor: "#8A5A00" },
  ];

  const kanbanCols = [
    { label: "To Do",       items: todo,       color: "#5F6A88" },
    { label: "In Progress", items: inProgress, color: "#007BFF" },
    { label: "For Review",  items: forReview,  color: "#8A5A00" },
  ];

  return (
    <div className="py-6.5 px-8 flex flex-col gap-6 bg-[#F4F6FB] min-h-full">
      {/* Greeting */}
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
            <p className="text-[13px] text-[#5F6A88] mt-0.5">{dateLabel} · Developer workspace</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-3.5">
        {kpis.map(k => (
          <StatTile
            key={k.label}
            label={k.label}
            value={k.value}
            icon={k.icon}
            iconBg={k.iconBg}
            iconColor={k.iconColor}
            loading={loading}
          />
        ))}
      </div>

      {/* Main Body */}
      <div className="flex gap-5 items-start">
        {/* Kanban */}
        <div className="flex-1 min-w-0">
          <SectionPanel title="My Tasks">
            {loading ? (
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map(i => <div key={i} className="h-48 animate-pulse bg-[#EDF0F7] rounded-[14px]" />)}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {kanbanCols.map(col => (
                  <div key={col.label}>
                    <div className="text-[11px] font-bold uppercase tracking-wide mb-3" style={{ color: col.color }}>
                      {col.label}{" "}
                      <span className="text-[#5F6A88] font-normal normal-case tracking-normal">({col.items.length})</span>
                    </div>
                    <div className="space-y-2">
                      {col.items.slice(0, 4).map(task => <TaskCard key={task.id} task={task} />)}
                      {col.items.length === 0 && (
                        <div className="p-3 rounded-[10px] border border-dashed border-[#E2E7F2] text-[11px] text-[#5F6A88] text-center">
                          Empty
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionPanel>
        </div>

        {/* Right rail */}
        <div className="w-72 shrink-0 flex flex-col gap-4">
          <WorkspaceCard projectsCount={projectsCount} />

          {/* Team Pool */}
          <SectionPanel
            title="Team Pool"
            trailing={<span className="text-[11px] text-[#5F6A88]">{unassigned.length} unassigned</span>}
          >
            {loading ? (
              <div className="space-y-2">
                <SkeletonRow />
                <SkeletonRow />
              </div>
            ) : unassigned.length === 0 ? (
              <EmptyState icon={<CheckCircle2 size={16} />} title="All caught up" body="No open unassigned tasks in the team pool." />
            ) : (
              <div className="space-y-2">
                {unassigned.map(task => (
                  <div key={task.id} className="flex items-center gap-2 py-1.5">
                    <PriorityLabel priority={task.priority} />
                    <span className="flex-1 min-w-0 text-[12px] text-[#0B1533] truncate">{task.title}</span>
                    <span className="text-[10px] font-mono text-[#5F6A88] shrink-0">{task.customer_id}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionPanel>
        </div>
      </div>
    </div>
  );
}
