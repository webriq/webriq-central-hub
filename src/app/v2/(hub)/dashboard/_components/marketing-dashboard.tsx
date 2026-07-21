"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Building2, FolderKanban, ChevronRight, ChartGantt } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { usePMSettings } from "@/hooks/use-pm-settings";
import { useGreeting } from "@/hooks/use-greeting";
import { V2_ROUTES } from "@/config/constants";
import { KpiCard, SectionCard, SkeletonRow, OnboardingStatusPill } from "./dashboard-shared";
import type { OnboardingProjectListItem } from "../../portfolio-tracker/_onboarding-list";

function WorkspaceCard({ customersCount, projectsCount, loading, isDark }: {
  customersCount: number;
  projectsCount: number;
  loading: boolean;
  isDark: boolean;
}) {
  return (
    <SectionCard title="Your workspace" noPad>
      <div className="divide-y divide-(--c-border)">
        <Link href={V2_ROUTES.CUSTOMERS} className="group flex items-center gap-3 px-5 py-3 hover:bg-(--c-track) transition-colors">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${isDark ? "bg-white/[0.06]" : "bg-slate-50"}`}>
            <Building2 size={14} className="text-(--c-sky)" />
          </div>
          <span className="text-[12px] text-(--c-sub) flex-1">Customers</span>
          <span className="text-[13px] font-semibold text-(--c-text)">{loading ? "—" : customersCount}</span>
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

export default function MarketingDashboard({ displayName }: Props) {
  const { settings } = usePMSettings();
  const isDark = settings.theme === "dark";
  const { visible, text, dateLabel, dismiss } = useGreeting(displayName);

  const [trackerProjects, setTrackerProjects] = useState<OnboardingProjectListItem[]>([]);
  const [customersCount, setCustomersCount] = useState(0);
  const [projectsCount, setProjectsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    Promise.all([
      fetch("/api/onboarding/projects").then(r => r.json()).catch(() => ({ projects: [] })),
      supabase.from("customers").select("customer_id", { count: "exact", head: true }),
      supabase.from("projects").select("id", { count: "exact", head: true }),
    ]).then(([trackerResult, customersResult, projectsResult]) => {
      setTrackerProjects((trackerResult.projects ?? []) as OnboardingProjectListItem[]);
      setCustomersCount(customersResult.count ?? 0);
      setProjectsCount(projectsResult.count ?? 0);
      setLoading(false);
    });
  }, []);

  const inProgressCount = trackerProjects.filter(p => p.status === "in_progress").length;
  const scheduledCount  = trackerProjects.filter(p => p.status === "scheduled").length;
  const draftCount      = trackerProjects.filter(p => p.status === "draft").length;

  const needsAttention = trackerProjects
    .filter(p => p.status === "draft" || p.status === "scheduled")
    .slice(0, 6);

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
            <p className="text-[13px] text-(--c-sub) mt-0.5">{dateLabel} · Marketing workspace</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-4">
        <KpiCard label="Total tracked" value={loading ? "—" : trackerProjects.length} />
        <KpiCard label="In progress" value={loading ? "—" : inProgressCount} accentClass="text-(--c-blue)" />
        <KpiCard label="Scheduled" value={loading ? "—" : scheduledCount} accentClass="text-(--c-amber)" />
        <KpiCard label="Draft" value={loading ? "—" : draftCount} accentClass="text-(--c-muted)" />
      </div>

      {/* Main Body */}
      <div className="flex gap-5 items-start">
        {/* Needs attention */}
        <div className="flex-1 min-w-0">
          <SectionCard
            title="Needs your attention"
            trailing={<span className="text-[11px] text-(--c-sub)">{needsAttention.length} not yet started</span>}
            noPad
          >
            {loading ? (
              <div className="p-5 space-y-3">
                <SkeletonRow /><SkeletonRow />
              </div>
            ) : needsAttention.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isDark ? "bg-white/[0.06]" : "bg-slate-50"}`}>
                  <ChartGantt size={22} className="text-(--c-violet)" />
                </div>
                <div className="text-center">
                  <div className="text-[14px] font-bold text-(--c-text)">All caught up.</div>
                  <p className="text-[12px] text-(--c-muted) mt-1">Every tracked project has started its programme.</p>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-(--c-border)">
                {needsAttention.map(item => (
                  <Link
                    key={item.id}
                    href={item.project_id ? `${V2_ROUTES.PORTFOLIO_TRACKER}/${item.project_id}` : V2_ROUTES.PORTFOLIO_TRACKER}
                    className="group flex items-center gap-3 px-5 py-3.5 hover:bg-(--c-track) transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[13px] text-(--c-text) truncate">{item.project_name}</span>
                        <OnboardingStatusPill status={item.status} isDark={isDark} />
                      </div>
                      <span className="text-[11px] text-(--c-muted) truncate block">{item.company_name}</span>
                    </div>
                    <ChevronRight size={14} className="text-(--c-muted) shrink-0 transition-transform group-hover:translate-x-0.5" />
                  </Link>
                ))}
              </div>
            )}
          </SectionCard>
        </div>

        {/* Right rail */}
        <div className="w-72 shrink-0 flex flex-col gap-4">
          <WorkspaceCard customersCount={customersCount} projectsCount={projectsCount} loading={loading} isDark={isDark} />
        </div>
      </div>
    </div>
  );
}
