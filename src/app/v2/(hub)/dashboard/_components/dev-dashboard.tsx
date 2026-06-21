"use client";

import React, { useState, useEffect } from "react";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import { usePMSettings } from "@/hooks/use-pm-settings";
import { KpiCard, SectionCard, PriorityDot, StatusChip } from "./dashboard-shared";

const WeeklyHoursChart = dynamic(
  () => import("./weekly-hours-chart"),
  { ssr: false, loading: () => <div className="h-40 animate-pulse bg-(--c-track) rounded-lg" /> }
);

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

interface Props {
  userId: string;
  displayName: string | null;
}

export default function DevDashboard({ displayName }: Props) {
  const { settings } = usePMSettings();
  const isDark = settings.theme === "dark";

  const [records, setRecords] = useState<ClassRecord[]>([]);
  const [unassigned, setUnassigned] = useState<ClassRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      supabase
        .from("classification_records")
        .select("id, customer_id, title, priority, status, created_at")
        .in("status", ["open", "pending", "planning", "active", "review"])
        .order("created_at", { ascending: false })
        .limit(20),
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
  }, []);

  const { todo, inProgress, forReview } = groupByKanban(records);

  const kpis = [
    { label: "Open",       value: todo.length,       accentClass: "" },
    { label: "In Progress", value: inProgress.length, accentClass: "text-(--c-blue)" },
    { label: "For Review",  value: forReview.length,  accentClass: "text-(--c-amber)" },
    { label: "Due Today",   value: "—",               accentClass: "" },
    { label: "Hours Billed", value: "—",              accentClass: "text-(--c-green)" },
  ];

  const kanbanCols = [
    { label: "To Do",       items: todo,       labelClass: isDark ? "text-slate-400" : "text-slate-500" },
    { label: "In Progress", items: inProgress, labelClass: "text-[var(--c-blue)]" },
    { label: "For Review",  items: forReview,  labelClass: "text-[var(--c-amber)]" },
  ];

  return (
    <div className={`py-6.5 px-8 flex flex-col gap-6 ${isDark ? "pm-dark" : "pm-light"}`}>
      {/* Header */}
      <div>
        <h1 className={`text-xl font-bold ${isDark ? "text-white" : "text-slate-900"}`}>
          Developer Dashboard
        </h1>
        <p className="text-sm text-(--c-sub) mt-0.5">
          {displayName ? `Welcome back, ${displayName}` : "Welcome back"}
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-5 gap-4">
        {kpis.map(k => (
          <KpiCard
            key={k.label}
            label={k.label}
            value={loading ? "—" : k.value}
            accentClass={k.accentClass}
          />
        ))}
      </div>

      {/* Main Body */}
      <div className="flex gap-5 items-start">
        {/* Kanban */}
        <div className="flex-1 min-w-0">
          <SectionCard title="My Tasks">
            {loading ? (
              <div className="grid grid-cols-3 gap-4">
                {[1, 2, 3].map(i => <div key={i} className="h-48 animate-pulse bg-(--c-track) rounded-xl" />)}
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-4">
                {kanbanCols.map(col => (
                  <div key={col.label}>
                    <div className={`text-[11px] font-bold uppercase tracking-wide mb-3 ${col.labelClass}`}>
                      {col.label}{" "}
                      <span className="text-(--c-muted) font-normal normal-case tracking-normal">({col.items.length})</span>
                    </div>
                    <div className="space-y-2">
                      {col.items.slice(0, 4).map(task => (
                        <div
                          key={task.id}
                          className="p-3 rounded-xl border border-(--c-border) bg-(--c-card) flex flex-col gap-2"
                        >
                          <p className="text-[12px] text-(--c-text) font-medium leading-snug line-clamp-2">{task.title}</p>
                          <div className="flex items-center gap-1.5">
                            <PriorityDot priority={task.priority} />
                            <span className="text-[10px] text-(--c-muted) flex-1 truncate">{task.customer_id}</span>
                            <StatusChip status={task.status} />
                          </div>
                        </div>
                      ))}
                      {col.items.length === 0 && (
                        <div className="p-3 rounded-xl border border-dashed border-(--c-border) text-[11px] text-(--c-muted) text-center">
                          Empty
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right rail */}
        <div className="w-72 shrink-0 flex flex-col gap-4">
          {/* Weekly Hours */}
          <SectionCard title="Weekly Hours">
            <WeeklyHoursChart isDark={isDark} />
            <p className="text-[10px] text-(--c-muted) mt-2 text-center">Stub data — HR timesheets integration pending</p>
          </SectionCard>

          {/* Team Pool */}
          <SectionCard
            title="Team Pool"
            trailing={<span className="text-[11px] text-(--c-sub)">{unassigned.length} unassigned</span>}
          >
            {loading ? (
              <div className="space-y-2">
                {[1, 2].map(i => <div key={i} className="h-10 animate-pulse bg-(--c-track) rounded-lg" />)}
              </div>
            ) : unassigned.length === 0 ? (
              <p className="text-[12px] text-(--c-muted) py-2">No open unassigned tasks.</p>
            ) : (
              <div className="space-y-2">
                {unassigned.map(task => (
                  <div key={task.id} className="flex items-center gap-2 py-1.5">
                    <PriorityDot priority={task.priority} />
                    <span className="flex-1 min-w-0 text-[12px] text-(--c-text) truncate">{task.title}</span>
                    <span className="text-[10px] text-(--c-muted) shrink-0">{task.customer_id}</span>
                  </div>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
