"use client";

import React, { useState, useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import {
  AlertCircle, Inbox, Sparkles, Square, CheckSquare,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { formatRelativeTime } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import {
  KpiCard, StatusChip, AIChip, ConfidenceBar,
  PriorityDot, Avatar, SkeletonRow,
} from "./dashboard-shared";

// ─── Types ────────────────────────────────────────────────────────────────────

type ClassRecord = {
  id: string;
  customer_id: string;
  title: string;
  priority: string | null;
  status: string;
  created_at: string;
};

type PendingPlan = {
  id: string;
  customer_id: string;
  confidence_score: number | null;
  created_at: string;
};

type DigestContent = { summary?: string; bullets?: string[] };
type DigestLog = { id: string; content: unknown; created_at: string };

// ─── Static stub data ─────────────────────────────────────────────────────────

const STUB_ASSIGNEES = ["KL", "TM", "RJ", "SK", "AM", "BG"];

const TEAM_CLOCKED_IN = {
  count: 9,
  total: 12,
  avatars: ["KL", "TM", "RJ", "SK"],
};

const LEAVE_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const LEAVE_PEOPLE = [
  { name: "Kate", days: [false, false, true, true, true] },
  { name: "Mike",  days: [false, false, false, true, false] },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatCurrentDate(): string {
  const d = new Date();
  return `${d.toLocaleDateString("en-US", { weekday: "long" })}, ${d.toLocaleDateString("en-US", { month: "long" })} ${d.getDate()} · ${d.getFullYear()} · PM workspace`;
}

function subscribeNoop() {
  return () => {};
}

function getDateServerSnapshot() {
  return "";
}

function planLabel(idx: number): string {
  return `PLAN-${String(41 + idx).padStart(3, "0")}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DecisionCard({ plans, loading }: { plans: PendingPlan[]; loading: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold text-slate-900">Needs your decision</span>
          {!loading && plans.length > 0 && (
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-50 border border-amber-200 text-amber-700">
              {plans.length}
            </span>
          )}
        </div>
        <AIChip label="AI generated" />
      </div>

      {loading ? (
        <div className="p-5 space-y-3">
          <SkeletonRow /><SkeletonRow />
        </div>
      ) : plans.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3">
          <div className="w-12 h-12 rounded-2xl bg-orange-50 flex items-center justify-center">
            <Sparkles size={22} className="text-orange-400" />
          </div>
          <div className="text-center">
            <div className="text-[14px] font-bold text-slate-800">All clear.</div>
            <p className="text-[12px] text-slate-400 mt-1">The AI will queue new plans here as tickets come in.</p>
          </div>
        </div>
      ) : (
        plans.map((plan, idx) => (
          <div
            key={plan.id}
            className="flex items-start gap-4 px-5 py-4 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[10px] font-mono text-slate-400">{planLabel(idx)}</span>
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{plan.customer_id}</span>
              </div>
              <div className="text-[13px] text-slate-900 truncate mb-0.5">
                Plan for {plan.customer_id}
              </div>
              <ConfidenceBar pct={plan.confidence_score != null ? plan.confidence_score * 100 : 0} />
            </div>
            <div className="flex items-center gap-2 shrink-0 mt-1">
              <AIChip />
              <Link
                href={V2_ROUTES.ORCHESTRATION}
                className="text-[12px] px-3 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors font-medium"
              >
                Approve
              </Link>
              <Link
                href={V2_ROUTES.ORCHESTRATION}
                className="text-[12px] px-3 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Review
              </Link>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function TasksTable({ tasks, loading }: { tasks: ClassRecord[]; loading: boolean }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const priorityTasks = tasks
    .filter(r => ["open", "pending", "planning", "active", "review"].includes(r.status))
    .slice(0, 8);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <span className="text-[13px] font-semibold text-slate-900">Priority tasks today</span>
        <span className="text-[11px] font-mono text-slate-400">{priorityTasks.length} tasks</span>
      </div>

      {/* Column headers */}
      <div className="grid border-b border-slate-100 bg-slate-50/60" style={{ gridTemplateColumns: "28px 1fr 110px 52px 90px 100px" }}>
        {["", "Task", "Customer", "Who", "Priority", "Status"].map((h, i) => (
          <div key={i} className="px-3 py-2 text-[11px] font-semibold text-slate-400 tracking-wide">{h}</div>
        ))}
      </div>

      {loading ? (
        <div className="p-5 space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-10 animate-pulse bg-slate-100 rounded" />)}
        </div>
      ) : priorityTasks.length === 0 ? (
        <p className="text-[12px] text-slate-400 px-5 py-4">No open tasks right now.</p>
      ) : (
        priorityTasks.map((task, idx) => (
          <div
            key={task.id}
            className="grid items-center border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors cursor-pointer"
            style={{ gridTemplateColumns: "28px 1fr 110px 52px 90px 100px" }}
          >
            {/* Checkbox */}
            <div className="px-2 py-2.5 flex items-center justify-center">
              <button
                onClick={e => { e.stopPropagation(); setChecked(c => ({ ...c, [task.id]: !c[task.id] })); }}
                className="text-slate-300 hover:text-blue-500 transition-colors cursor-pointer"
              >
                {checked[task.id] ? <CheckSquare size={14} className="text-blue-500" /> : <Square size={14} />}
              </button>
            </div>
            {/* Task */}
            <div className="px-3 py-2.5 flex flex-col gap-0.5 min-w-0">
              <span className="text-[10px] font-mono text-blue-600 leading-none">
                {task.customer_id.slice(-8).toUpperCase()}
              </span>
              <span className="text-[12px] text-slate-800 truncate">{task.title}</span>
            </div>
            {/* Customer */}
            <div className="px-3 py-2.5">
              <span className="text-[11px] text-slate-500 truncate block">{task.customer_id.split("-").slice(-1)[0]}</span>
            </div>
            {/* Who */}
            <div className="px-3 py-2.5">
              <Avatar initials={STUB_ASSIGNEES[idx % STUB_ASSIGNEES.length]} size={6} idx={idx} />
            </div>
            {/* Priority */}
            <div className="px-3 py-2.5">
              <PriorityDot priority={task.priority} />
            </div>
            {/* Status */}
            <div className="px-3 py-2.5">
              <StatusChip status={task.status} />
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function DeskPulse({ statusCounts, slaItems, loading }: {
  statusCounts: Record<string, number>;
  slaItems: ClassRecord[];
  loading: boolean;
}) {
  const total = Object.values(statusCounts).reduce((a, b) => a + b, 0);
  const bars = [
    { label: "Open",        value: (statusCounts.open ?? 0) + (statusCounts.pending ?? 0), color: "#2563EB" },
    { label: "In progress", value: statusCounts.active ?? 0,                               color: "#7C3AED" },
    { label: "Resolved",    value: statusCounts.closed ?? 0,                               color: "#16A34A" },
  ];
  const maxVal = Math.max(...bars.map(b => b.value), 1);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100">
        <div className="flex items-center gap-1.5">
          <Inbox size={13} className="text-slate-400" />
          <span className="text-[13px] font-semibold text-slate-900">Desk pulse</span>
        </div>
        <span className="text-[11px] font-mono text-slate-400">{total} total</span>
      </div>

      {/* Mini bar chart */}
      <div className="px-5 pt-4 pb-3">
        {loading ? (
          <div className="h-24 animate-pulse bg-slate-100 rounded-lg" />
        ) : (
          <div className="flex gap-3 items-end" style={{ height: 64 }}>
            {bars.map(b => (
              <div key={b.label} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] font-mono font-semibold" style={{ color: b.color }}>{b.value}</span>
                <div
                  className="w-full rounded-t-sm"
                  style={{ height: `${(b.value / maxVal) * 44}px`, minHeight: 4, background: b.color, opacity: 0.85 }}
                />
                <span className="text-[9px] text-slate-400 text-center leading-tight">{b.label}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* SLA Breaching */}
      {slaItems.length > 0 && (
        <div className="border-t border-red-50 bg-red-50/40">
          <div className="flex items-center gap-1.5 px-5 py-2">
            <AlertCircle size={11} className="text-red-500" />
            <span className="text-[11px] font-semibold text-red-600">SLA breaching</span>
          </div>
          {slaItems.slice(0, 3).map(item => (
            <div
              key={item.id}
              className="flex items-center justify-between px-5 py-2 border-t border-red-100/50 hover:bg-red-50 transition-colors cursor-pointer"
            >
              <div>
                <div className="text-[10px] font-mono text-red-500">{item.customer_id.slice(-8).toUpperCase()}</div>
                <div className="text-[11px] text-slate-700">{item.customer_id}</div>
              </div>
              <span className="text-[10px] font-mono text-red-400">{formatRelativeTime(item.created_at)} overdue</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DailyDigestCard({ digest, loading }: { digest: DigestLog | null; loading: boolean }) {
  const content = digest?.content as DigestContent | null;
  const bullets: string[] = content?.bullets ?? (content?.summary ? [content.summary] : []);

  return (
    <div
      className="rounded-xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]"
      style={{ background: "#FFFDF7", border: "1px solid rgba(245,158,11,0.3)", borderLeft: "3px solid #F59E0B" }}
    >
      <div className="flex items-center justify-between px-4 py-3 border-b" style={{ borderColor: "rgba(245,158,11,0.15)" }}>
        <div className="flex items-center gap-2">
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "linear-gradient(135deg, #F59E0B, #F97316)" }}
          >
            <Sparkles size={10} color="#FFF" />
          </span>
          <span className="text-[13px] font-semibold" style={{ color: "#92400E" }}>Daily digest</span>
        </div>
        {digest && (
          <span className="text-[10px] font-mono text-amber-600">
            {new Date(digest.created_at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </span>
        )}
      </div>
      <div className="px-4 py-3">
        {loading ? (
          <div className="space-y-2">
            {[1,2,3].map(i => <div key={i} className="h-3 animate-pulse bg-amber-100 rounded" />)}
          </div>
        ) : bullets.length > 0 ? (
          <div className="space-y-2">
            {bullets.map((b, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="w-1 h-1 rounded-full bg-amber-400 shrink-0 mt-1.5" />
                <span className="text-[12px] leading-relaxed" style={{ color: "#78350F" }}>{b}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[12px] text-amber-700/60">No digest generated today.</p>
        )}
      </div>
    </div>
  );
}

function LeaveCalendar() {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)] overflow-hidden">
      <div className="px-5 py-3.5 border-b border-slate-100">
        <span className="text-[13px] font-semibold text-teal-700">Team leave · this week</span>
      </div>
      <div className="p-4">
        {/* Header row */}
        <div className="grid mb-2" style={{ gridTemplateColumns: "56px repeat(5, 1fr)" }}>
          <div />
          {LEAVE_DAYS.map(d => (
            <div key={d} className="text-[10px] font-semibold text-slate-400 text-center">{d}</div>
          ))}
        </div>
        {/* People rows */}
        {LEAVE_PEOPLE.map(p => (
          <div key={p.name} className="grid mb-1.5" style={{ gridTemplateColumns: "56px repeat(5, 1fr)" }}>
            <div className="text-[11px] text-slate-600 flex items-center">{p.name}</div>
            {p.days.map((on, i) => (
              <div key={i} className="flex justify-center px-0.5">
                <div
                  className="h-5 w-full rounded"
                  style={{ background: on ? "#0D9488" : "#F1F5F9", opacity: on ? 0.85 : 0.5 }}
                />
              </div>
            ))}
          </div>
        ))}
        {/* Legend */}
        <div className="flex items-center gap-3 mt-3">
          {[{ color: "#0D9488", label: "On leave" }, { color: "#F1F5F9", border: "#E2E8F0", label: "Working" }].map(l => (
            <div key={l.label} className="flex items-center gap-1.5">
              <div
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: l.color, border: l.border ? `1px solid ${l.border}` : "none" }}
              />
              <span className="text-[10px] text-slate-500">{l.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function PMDashboard() {
  const date = useSyncExternalStore(subscribeNoop, formatCurrentDate, getDateServerSnapshot);
  const [classRecords, setClassRecords] = useState<ClassRecord[]>([]);
  const [pendingPlans, setPendingPlans] = useState<PendingPlan[]>([]);
  const [digest, setDigest] = useState<DigestLog | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase.from("classification_records").select("id, customer_id, title, priority, status, created_at").order("created_at", { ascending: false }),
      supabase.from("implementation_plans").select("id, customer_id, confidence_score, created_at").eq("status", "PENDING_APPROVAL").limit(5),
      supabase.from("digest_logs").select("id, content, created_at").eq("digest_type", "pm").order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]).then(([classResult, plansResult, digestResult]) => {
      setClassRecords((classResult.data ?? []) as ClassRecord[]);
      setPendingPlans((plansResult.data ?? []) as PendingPlan[]);
      setDigest(digestResult.data as DigestLog | null);
      setLoading(false);
    });
  }, []);

  // Derived counts
  const statusCounts = classRecords.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  const openCount   = (statusCounts.open ?? 0) + (statusCounts.pending ?? 0);
  const activeCount = statusCounts.active ?? 0;

  // SLA breaching proxy: oldest open records
  const slaItems = classRecords
    .filter(r => r.status === "open" || r.status === "pending")
    .slice(-3)
    .reverse();

  return (
    <div className="py-6 px-8 flex flex-col gap-5 bg-[#F8FAFC] min-h-full">
      {/* Page header */}
      <div>
        <h1 className="text-[22px] font-bold text-slate-900 tracking-[-0.02em]">Today</h1>
        <p className="text-[13px] text-slate-400 mt-0.5">{date}</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard
          label="Open tickets"
          value={loading ? "—" : openCount}
          subtext={
            slaItems.length > 0
              ? <><AlertCircle size={11} /> {slaItems.length} breaching SLA</>
              : undefined
          }
          subtextColor="#DC2626"
        />
        <KpiCard
          label="Tasks in progress"
          value={loading ? "—" : activeCount}
          valueColor="#2563EB"
          delta={{ text: "+2", dir: "up" }}
        />
        <KpiCard
          label="Plans awaiting approval"
          value={loading ? "—" : pendingPlans.length}
          valueColor="#F97316"
          chip={<AIChip />}
        />
        <KpiCard
          label="Team clocked in"
          value={
            <span className="flex items-baseline gap-1">
              <span style={{ color: "#0D9488" }}>{TEAM_CLOCKED_IN.count}</span>
              <span className="text-[16px] font-normal text-slate-400">/{TEAM_CLOCKED_IN.total}</span>
            </span>
          }
          trailing={
            <div className="flex items-center ml-1">
              {TEAM_CLOCKED_IN.avatars.map((av, i) => (
                <div
                  key={i}
                  className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white border-2 border-white"
                  style={{ background: ["#2563EB","#7C3AED","#DC2626","#0D9488"][i], marginLeft: i > 0 ? -6 : 0 }}
                >
                  {av}
                </div>
              ))}
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-slate-500 bg-slate-100 border-2 border-white"
                style={{ marginLeft: -6 }}
              >
                +1
              </div>
            </div>
          }
        />
      </div>

      {/* Two-column body */}
      <div className="flex gap-5 items-start">
        {/* Left column */}
        <div className="flex-1 min-w-0 flex flex-col gap-5">
          <DecisionCard plans={pendingPlans} loading={loading} />
          <TasksTable tasks={classRecords} loading={loading} />
        </div>

        {/* Right rail */}
        <div className="shrink-0 flex flex-col gap-4" style={{ width: 280 }}>
          <DeskPulse statusCounts={statusCounts} slaItems={slaItems} loading={loading} />
          <DailyDigestCard digest={digest} loading={loading} />
          <LeaveCalendar />
        </div>
      </div>
    </div>
  );
}
