"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import { getPhaseByNumber } from "@/config/customer-phases";
import { textPrimary, textMuted, UnderlineTabs } from "./_shared-ui";
import { ProgrammeTrack } from "./_programme-track";
import { WizardTabKey } from "./_wizard-v2-types";

// Deliverable-boundary ticks (mockup 01's track) — the real Phase 1 day-starts, excluding the
// first (dayStart===dayStart, already the bar's left edge) and last (already the right edge).
const TICK_DAYS = getPhaseByNumber(1).deliverables.slice(1, -1).map((d) => d.dayStart);

// Mockup 01's page shell: breadcrumb, title row (phase + classification chips, "Back to
// website", a CTA slot for task 204's existing "Proceed to Phase 2" button), the programme
// track, and the new underline tab bar. Extracted out of _onboarding-wizard-v2.tsx to keep that
// orchestrator under the file-length ceiling (nextjs-file-length-best-practices.md).
export function WorkspaceHeader({
  companyName, projectRouteId, classification, existingWebsite,
  currentDay, dayStart, dayEnd, overdueCount, startedAt,
  tab, tabCounts, onTabChange, cta,
}: {
  companyName: string;
  projectRouteId: string | null;
  classification: string | null;
  existingWebsite: string | null;
  currentDay: number;
  dayStart: number;
  dayEnd: number;
  overdueCount: number;
  startedAt: string | null;
  tab: WizardTabKey;
  tabCounts: { files: number; access: number; checklist: string };
  onTabChange: (tab: WizardTabKey) => void;
  cta?: ReactNode;
}) {
  // Points at this specific project's timeline page (the original, non-/v2 route) — same
  // destination the old "Back to {project name}" button used, per user feedback replacing the
  // 3-level breadcrumb with a single back-link.
  const portfolioTrackerHref = projectRouteId ? `${V2_ROUTES.PORTFOLIO_TRACKER}/${projectRouteId}` : V2_ROUTES.PORTFOLIO_TRACKER;

  return (
    <div className="mb-5">
      <Link
        href={portfolioTrackerHref}
        className={cn("inline-flex items-center gap-1.5 text-[12.5px] font-medium mb-4 transition-colors", textMuted, "hover:text-[#0063D6]")}
      >
        <ArrowLeft size={14} /> Back to Tracker
      </Link>

      <div className="flex items-start justify-between gap-6 flex-wrap mb-1.5">
        <div>
          <h1 className={cn("font-heading text-[24px] font-bold tracking-[-0.015em] flex items-center gap-2.5 flex-wrap", textPrimary)}>
            {companyName} — Onboarding Workspace
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-[5px] bg-[#FFEFE3] text-[#E2762F]">
              <span className="w-1.5 h-1.5 rounded-full bg-current" />Onboard
            </span>
            {classification && (
              <span className="text-[10px] font-bold tracking-wide px-2 py-0.5 rounded-[5px] bg-[#EDF0F7] text-[#5F6A88]">{classification}</span>
            )}
          </h1>
          <p className={cn("text-[13px] mt-1.5 max-w-[62ch]", textMuted)}>
            Day {dayStart}–{dayEnd} of the 120-day programme. Every deliverable below can be worked in any order — nothing here gates on step sequence.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {existingWebsite && (
            <a
              href={existingWebsite}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-[7px] px-3 py-[5.5px] rounded-full text-[11px] font-semibold border border-[#E2E7F2] bg-white text-[#3A4565] hover:border-[#A8C6F5] hover:text-[#0B1533] transition-colors"
            >
              <ArrowUpRight size={13} /> Back to website
            </a>
          )}
          {cta}
        </div>
      </div>

      <div className="mt-4 mb-4">
        <ProgrammeTrack
          currentDay={currentDay}
          dayStart={dayStart}
          dayEnd={dayEnd}
          overdueCount={overdueCount}
          startedAt={startedAt}
          onReviewChecklist={() => onTabChange("checklist")}
          tickDays={TICK_DAYS}
        />
      </div>

      <UnderlineTabs
        tabs={[
          { id: "business-info", label: "Business info" },
          { id: "files", label: "Files", count: String(tabCounts.files) },
          { id: "access", label: "Access", count: String(tabCounts.access) },
          { id: "checklist", label: "Checklist", count: tabCounts.checklist, alert: overdueCount > 0 },
        ]}
        active={tab}
        onChange={onTabChange}
      />
    </div>
  );
}
