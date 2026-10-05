"use client";

import { motion } from "motion/react";
import { AlertTriangle, CheckCircle2, Plus, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { internalDeliverablesForSubPhase, type PhaseConfig } from "@/config/customer-phases";
import type { OnboardingInternalDeliverableRow } from "@/types/database";
import { TOTAL_DAYS, ROW_HEIGHT, ROW_GAP, LABEL_WIDTH, LANE_TOP_PADDING, PHASE_VISUALS, assignTracks } from "./_gantt-shared";
import { useGanttZoom } from "./_gantt-zoom-context";
import DeliverableCard from "./_deliverable-card";
import { stackshiftFacts } from "./_timeline-stats";
import { matchesFilters, type TimelineFilters } from "./_use-timeline-filters";

// ─── StackShift I swimlane — one phase row: label cell (collapse toggle, day range, progress,
// overdue count) + a lane of deliverable cards. Extracted from _onboarding-detail.tsx (task 422).
export default function Swimlane({
  phase, dbStatus, deliverableStatusMap, internalByKey, collapsed, onToggleCollapse,
  onOpenDeliverable, expandedDeliverable, onExpandDeliverable, index, startDate, role, canEditSchedule, onScheduleChange,
  totalDays = TOTAL_DAYS, currentDay, filters,
}: {
  phase: PhaseConfig;
  dbStatus: string;
  deliverableStatusMap: Map<string, string>;
  internalByKey: Map<string, OnboardingInternalDeliverableRow>;
  collapsed: boolean;
  onToggleCollapse: () => void;
  // Task 241 — phase-aware (was Phase-1-only `(key: string) => void`); Phase 2-5 now open too,
  // routed to Projects > Tasks instead of the Onboarding Workspace.
  onOpenDeliverable: (phaseNumber: number, key: string) => void;
  expandedDeliverable: string | null;
  onExpandDeliverable: (key: string | null) => void;
  index: number;
  startDate: Date;
  role: string | null;
  canEditSchedule: boolean;
  onScheduleChange: (phaseNumber: number, deliverableKey: string, dayStart: number, dayEnd: number) => Promise<boolean>;
  // Chat follow-up to task 244: the shared grid's actual (skip-compressed) column count for this
  // project — defaults to the static 120-reference-day constant for any caller that hasn't been
  // updated to pass a compressed value (none currently; kept for a safe/explicit default).
  totalDays?: number;
  // Task 422: today's column on this grid's display-scaled axis (health) + the active filters (dimming).
  currentDay: number;
  filters: TimelineFilters;
}) {
  const { dayWidth } = useGanttZoom();
  // Task 246: a custom phase (number 6+) has no dedicated PHASE_VISUALS entry — falls back to
  // phase 1's palette, matching the same ?? PHASE_VISUALS[1]/PHASE_HEX[1] convention already used
  // elsewhere in the Timeline (e.g. _deliverable-card.tsx) for an unresolvable phase number.
  const visual = PHASE_VISUALS[phase.number] ?? PHASE_VISUALS[1];
  // Developer never opens anything (task 146); a skipped phase's deliverables are inert for
  // everyone (chat follow-up) — they're shown only for reference when a PM expands the row out of
  // curiosity, never actionable since this phase doesn't apply to the project.
  const interactive = role !== "developer" && dbStatus !== "skipped";
  // Task 253: effective span (per-project override ?? the static config default) is now resolved
  // upstream by resolveEffectiveDeliverable (customer-phases.ts) for every phase.deliverables
  // entry, so there's no separate override map to merge here anymore — never mutates
  // PROGRAMME_PHASES, which is shared by every customer.
  const effectiveDeliverables = phase.deliverables;
  const tracks = assignTracks(effectiveDeliverables.map((d) => ({ dayStart: d.dayStart, dayEnd: d.dayEnd })));
  const trackCount = tracks.length > 0 ? Math.max(...tracks) + 1 : 1;
  const laneHeight = trackCount * ROW_HEIGHT + (trackCount - 1) * ROW_GAP + 8 + LANE_TOP_PADDING;
  const doneCount = phase.deliverables.filter((d) => (deliverableStatusMap.get(d.key) ?? "pending") === "done").length;
  const factsByKey = new Map(effectiveDeliverables.map((d) => [d.key, stackshiftFacts(d, phase.number, deliverableStatusMap.get(d.key) ?? "pending", internalByKey, currentDay)]));
  const overdueCount = dbStatus === "skipped" ? 0 : [...factsByKey.values()].filter((f) => f.health === "overdue").length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.25 }}
      className="flex border-b border-[#E2E7F2]"
    >
      <div className={cn("sticky left-0  z-2 shrink-0 border-r border-[#E2E7F2] px-3.5 py-3", visual.bg)} style={{ width: LABEL_WIDTH }}>
        {/* Task 254: a skipped phase's lane is always empty regardless of collapsed state (it's
            excluded from the shared grid/day range entirely, see the D{}–{} suppression below) —
            there's nothing to reveal by toggling it, so it renders as an inert <div> instead of
            the collapse-toggle <button> non-skipped phases still use. */}
        {dbStatus === "skipped" ? (
          <div className="flex w-full items-center gap-2 p-0 text-left">
            <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold", visual.iconBg, visual.iconText)}>
              {phase.number}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[12.5px] font-bold text-[#5F6A88]">{phase.name}</span>
                {/* Task 244: a StackShift I phase a PM excluded at intake reuses the same "skipped"
                    status a time-based "jump to phase" produces — labeled here so it reads as "not
                    part of this project" rather than "already passed". */}
                <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">
                  Skipped
                </span>
              </div>
            </div>
          </div>
        ) : (
          <button type="button" onClick={onToggleCollapse} className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left">
            <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold", visual.iconBg, visual.iconText)}>
              {dbStatus === "completed" ? <CheckCircle2 size={13} /> : phase.number}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[12.5px] font-bold text-[#0B1533]">{phase.name}</span>
                {dbStatus === "active" && <span className="h-1.5 w-1.5 shrink-0 animate-pulse motion-reduce:animate-none rounded-full bg-[#007BFF]" />}
              </div>
              <div className={cn("font-mono truncate text-[10px] text-[#5F6A88]")}>
                D{phase.dayStart}–{phase.dayEnd} · {doneCount}/{phase.deliverables.length}
              </div>
              {overdueCount > 0 && (
                <div className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-[#C0392B]">
                  <AlertTriangle size={10} aria-hidden="true" /> {overdueCount} overdue
                </div>
              )}
            </div>
            {/* Chat follow-up: swapped for a directionless +/− toggle — a down/right chevron implied
                a vertical list would drop below, but the revealed content is a horizontal timeline
                lane instead, which read as confusing. */}
            {collapsed ? <Plus size={14} className="shrink-0 text-[#5F6A88]" /> : <Minus size={14} className="shrink-0 text-[#5F6A88]" />}
          </button>
        )}
      </div>

      <div
        className="relative overflow-visible z-1"
        style={{ width: totalDays * dayWidth, height: collapsed ? 0 : laneHeight, paddingTop: collapsed ? 0 : LANE_TOP_PADDING }}
      >
        {!collapsed && effectiveDeliverables.map((d, i) => {
          const subInternal = phase.number === 1 ? internalDeliverablesForSubPhase(d.key) : [];
          return (
            <DeliverableCard
              key={d.key}
              d={d}
              track={tracks[i]}
              status={deliverableStatusMap.get(d.key) ?? "pending"}
              health={factsByKey.get(d.key)!.health}
              dimmed={!matchesFilters(filters, factsByKey.get(d.key)!)}
              interactive={interactive}
              internalItems={subInternal}
              internalByKey={internalByKey}
              expanded={expandedDeliverable === d.key}
              onToggleExpand={() => onExpandDeliverable(expandedDeliverable === d.key ? null : d.key)}
              phaseNumber={phase.number}
              phaseVisual={visual}
              startDate={startDate}
              onOpenWizardStep={interactive ? () => onOpenDeliverable(phase.number, d.key) : undefined}
              canEditSchedule={canEditSchedule && dbStatus !== "skipped"}
              phaseDayStart={phase.dayStart}
              phaseDayEnd={phase.dayEnd}
              onScheduleChange={(dayStart, dayEnd) => onScheduleChange(phase.number, d.key, dayStart, dayEnd)}
            />
          );
        })}
      </div>
    </motion.div>
  );
}

