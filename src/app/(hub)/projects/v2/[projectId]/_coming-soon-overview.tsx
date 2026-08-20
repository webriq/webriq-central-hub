"use client";

import { useState } from "react";
import { ComingSoonPanel } from "@/app/(hub)/projects/_shared/_coming-soon-panel";
import type { Project } from "@/app/(hub)/projects-old/_pm-shared";
import { StatusSummaryDrawer } from "./_status-summary-drawer";
import { ProgrammeProgressCard } from "./_programme-progress-card";
import { useProgrammeProgress } from "./_use-programme-progress";

// Task 277 — Overview's body. The swimlane/programme content this route used to render moved to
// the Timeline tab (`../timeline/page.tsx` + `_onboarding-detail.tsx`); this renders either the
// "N-Day Programme Progress" card (task 281 — moved here from Timeline's old Header card,
// customer-phases-engine projects with a started programme only) or the static "coming soon"
// empty state (generic-engine projects, or a customer-phases project that hasn't started yet).
// Task 282 (items D5/D6) — 3-way branch (loading skeleton / ready / coming soon) so a
// still-loading fetch no longer flashes the "coming soon" empty state first.
// Task 283 — no longer renders `ProjectDetailHeader` itself; `(tabs)/layout.tsx` does that once
// for every tab, so this is content-only now (was causing the header to visibly reload/flash on
// every tab navigation, since each tab's page fully unmounted and remounted its own header copy).
export function ComingSoonOverview({ project }: { project: Project }) {
  const progress = useProgrammeProgress(project);
  const [summaryOpen, setSummaryOpen] = useState(false);

  return (
    <>
      <div className="flex-1 min-h-0 overflow-y-auto bg-[#F4F6FB] px-8 py-8">
        {progress.loading ? (
          <div className="flex flex-col gap-4">
            <div className="h-[104px] rounded-2xl bg-[#EDF0F7] animate-pulse" />
            <div className="h-4 w-64 rounded bg-[#EDF0F7] animate-pulse" />
          </div>
        ) : progress.ready ? (
          <>
            <ProgrammeProgressCard
              visibleDurationDays={progress.visibleDurationDays}
              currentDay={progress.currentDay}
              startDate={progress.startDate}
              progressPct={progress.progressPct}
              programmeOverdue={progress.programmeOverdue}
              daysOverdue120={progress.daysOverdue120}
              isComplete={progress.isComplete}
              activePhaseNumber={progress.activePhaseNumber}
              daysRemaining={progress.daysRemaining}
              phasesCompleted={progress.phasesCompleted}
              doneDeliverables={progress.doneDeliverables}
              totalDeliverables={progress.totalDeliverables}
              onOpenStatusSummary={() => setSummaryOpen(true)}
            />
            {/* Task 282 (item D6) */}
            <p className="mt-4 text-[12px] text-[#5F6A88]">
              This tab is still under development — more will be added soon.
            </p>
          </>
        ) : (
          <ComingSoonPanel body="This tab is being redesigned. Head over to the Timeline tab for the full project programme." />
        )}
      </div>

      {project.uses_customer_phases_engine && (
        <StatusSummaryDrawer open={summaryOpen} onClose={() => setSummaryOpen(false)} projectUuid={project.id} />
      )}
    </>
  );
}
