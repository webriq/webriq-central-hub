"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { FolderKanban, ChartGantt, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { usePMSettings } from "@/hooks/use-pm-settings";
import { useGreeting } from "@/hooks/use-greeting";
import { V2_ROUTES } from "@/config/constants";
import { KpiCard, SectionCard, PriorityDot, StatusChip } from "./dashboard-shared";

type ClassRecord = {
  id: string;
  customer_id: string;
  title: string;
  priority: string | null;
  status: string;
  created_at: string;
};

type OnboardingProject = { status: "draft" | "scheduled" | "in_progress" | "completed" };

// No assigned_developer_id column yet — show all open/active records as the kanban
// TODO: Add assigned_developer_id to classification_records for per-dev task assignment
function groupByKanban(records: ClassRecord[]) {
  return {
    todo:       records.filter(r => ["open", "pending"].includes(r.status)),
    inProgress: records.filter(r => ["active", "planning"].includes(r.status)),
    forReview:  records.filter(r => r.status === "review"),
  };
}

function WorkspaceCard({ trackerInProgress, projectsCount, loading, isDark }: {
  trackerInProgress: number;
  projectsCount: number;
  loading: boolean;
  isDark: boolean;
}) {
  return (
    <SectionCard title="Your workspace" noPad>
      <div className="divide-y divide-(--c-border)">
        <Link href={V2_ROUTES.PORTFOLIO_TRACKER} className="group flex items-center gap-3 px-5 py-3 hover:bg-(--c-track) transition-colors">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isDark ? "bg-white/[0.06]" : "bg-slate-50"}`}>
            <ChartGantt size={14} className="text-(--c-violet)" />
          </div>
          <span className="text-[12px] text-(--c-sub) flex-1">Tracker · in progress</span>
          <span className="text-[13px] font-semibold text-(--c-text)">{loading ? "—" : trackerInProgress}</span>
          <ChevronRight size={13} className="text-(--c-muted) shrink-0 transition-transform group-hover:translate-x-0.5" />
        </Link>
        <Link href={V2_ROUTES.PROJECTS} className="group flex items-center gap-3 px-5 py-3 hover:bg-(--c-track) transition-colors">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isDark ? "bg-white/[0.06]" : "bg-slate-50"}`}>
            <FolderKanban size={14} className="text-(--c-blue)" />
          </div>
          <span className="text-[12px] text-(--c-sub) flex-1">Projects</span>
          <span className="text-[13px] font-semibold text-(--c-text)">{loading ? "—" : projectsCount}</span>
          <ChevronRight size={13} className="text-(--c-muted) shrink-0 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </SectionCard>
  );
}

interface Props {
  userId: string;
  displayName: string | null;
}

export default function DevDashboard({ displayName }: Props) {
  const { settings } = usePMSettings();
  const isDark = settings.theme === "dark";
  const { visible, text, dateLabel, dismiss } = useGreeting(displayName);

  const [records, setRecords] = useState<ClassRecord[]>([]);
  const [unassigned, setUnassigned] = useState<ClassRecord[]>([]);
  const [trackerInProgress, setTrackerInProgress] = useState(0);
  const [projectsCount, setProjectsCount] = useState(0);
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
      supabase.from("projects").select("id", { count: "exact", head: true }),
      fetch("/api/onboarding/projects").then(r => r.json()).catch(() => ({ projects: [] })),
    ]).then(([myResult, unassignedResult, projectsResult, trackerResult]) => {
      setRecords((myResult.data ?? []) as ClassRecord[]);
      setUnassigned((unassignedResult.data ?? []) as ClassRecord[]);
      setProjectsCount(projectsResult.count ?? 0);
      const trackerProjects = (trackerResult.projects ?? []) as OnboardingProject[];
      setTrackerInProgress(trackerProjects.filter(p => p.status === "in_progress").length);
      setLoading(false);
    });
  }, []);

  const { todo, inProgress, forReview } = groupByKanban(records);

  const kpis = [
    { label: "Open",       value: todo.length,       accentClass: "" },
    { label: "In Progress", value: inProgress.length, accentClass: "text-(--c-blue)" },
    { label: "For Review",  value: forReview.length,  accentClass: "text-(--c-amber)" },
  ];

  const kanbanCols = [
    { label: "To Do",       items: todo,       labelClass: isDark ? "text-slate-400" : "text-slate-500" },
    { label: "In Progress", items: inProgress, labelClass: "text-[var(--c-blue)]" },
    { label: "For Review",  items: forReview,  labelClass: "text-[var(--c-amber)]" },
  ];

  return (
    <div className={`py-6.5 px-8 flex flex-col gap-6 ${isDark ? "pm-dark" : "pm-light"}`}>
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
            <h1 className="font-heading text-[22px] font-bold text-(--c-text) tracking-[-0.02em]">{text}</h1>
            <p className="text-[13px] text-(--c-sub) mt-0.5">{dateLabel} · Developer workspace</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPI Row */}
      <div className="grid grid-cols-3 gap-4">
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
          <WorkspaceCard trackerInProgress={trackerInProgress} projectsCount={projectsCount} loading={loading} isDark={isDark} />

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
