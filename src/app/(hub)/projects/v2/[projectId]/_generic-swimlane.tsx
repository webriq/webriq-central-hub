"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { Flag, Locate } from "lucide-react";
import type { Database } from "@/types/database";
import type { GenericTimeline } from "@/lib/programme/generic-timeline";
import { LABEL_WIDTH } from "./_gantt-shared";
import { useGanttZoom } from "./_gantt-zoom-context";
import { useGanttScroll } from "./_use-gantt-scroll";
import { GridHeader } from "./_date-column-header";
import type { Counts } from "./_timeline-stats";
import type { TimelineFilters } from "./_use-timeline-filters";
import GenericSwimlaneLane from "./_generic-swimlane-lane";

type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
type Tasklist = Database["public"]["Tables"]["tasklists"]["Row"];

// Position first (task-239/240-seeded milestones always set it); falls back to start_date, then
// created_at, for any milestone created another way that never got a position — same fallback
// order as the Projects module's own MilestoneSwimlane (_milestone-swimlane.tsx), reimplemented
// here rather than cross-imported (Portfolio Tracker/Projects are page-scoped, unrelated feature
// areas per this codebase's existing convention — see task 242's own AvatarStack precedent).
function sortMilestones(milestones: Milestone[]): Milestone[] {
  return [...milestones].sort((a, b) => {
    if (a.position != null || b.position != null) {
      return (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER);
    }
    const aKey = a.start_date ?? a.created_at;
    const bKey = b.start_date ?? b.created_at;
    return aKey.localeCompare(bKey);
  });
}

// ─── Generic-model swimlane (task 247; day-based Gantt rebuild, task 252) — one lane per
// milestone, one card per tasklist, positioned on the date window from `buildTimeline` (task 420:
// milestone Start/Due, day_start/day_end as fallback; lane rendering lives in
// `_generic-swimlane-lane.tsx`) instead of the flat card grid this used before — mirrors StackShift I's own
// Swimlane (_swimlane.tsx) for visual/interaction consistency: shared date-column grid,
// a "today" marker, collapse-by-default (only the active milestone starts expanded, handled by
// the parent GenericPhaseView the same way _onboarding-detail.tsx owns its own collapse state),
// and the same Plus/Minus toggle. No drag-resize and no skip-phase concept — out of scope for
// this task (skip has no equivalent in the milestones schema; see task 252 doc's Open Questions).
// Read + navigate only — milestone/tasklist/task CRUD stays in the Projects module (task 242's
// scope decision, unaffected by this rebuild).
export default function GenericSwimlane({
  milestones,
  tasklists,
  milestoneCounts,
  tasklistCounts,
  projectUrlKey,
  timeline,
  collapsedMilestones,
  onToggleCollapse,
  filters,
  projectId,
  onDeliverableAdded,
}: {
  milestones: Milestone[];
  tasklists: Tasklist[];
  milestoneCounts: Map<string, Counts>;
  tasklistCounts: Map<string, Counts>;
  projectUrlKey: string;
  timeline: GenericTimeline;
  collapsedMilestones: Set<string>;
  onToggleCollapse: (milestoneId: string) => void;
  filters: TimelineFilters;
  // Task 433: undefined hides each lane's "Add deliverable" control.
  projectId: string;
  onDeliverableAdded?: (tasklist: Tasklist) => void;
}) {
  const router = useRouter();
  const { origin: startDate, currentDay, totalDays: visibleTotalDays } = timeline;
  const todayInRange = currentDay >= 1 && currentDay <= visibleTotalDays;

  // Task 422: wheel + scroll-to-today + zoom re-centring live in the shared hook (also used by the
  // StackShift Timeline); the focus day is clamped so an out-of-window "today" scrolls to an edge.
  const { dayWidth } = useGanttZoom();
  const gantt = useGanttScroll(dayWidth);
  const focusDay = Math.min(Math.max(currentDay, 1), visibleTotalDays);

  const tasklistsByMilestone = useMemo(() => {
    const map = new Map<string, Tasklist[]>();
    for (const tl of tasklists) {
      if (!tl.milestone_id) continue;
      const list = map.get(tl.milestone_id) ?? [];
      list.push(tl);
      map.set(tl.milestone_id, list);
    }
    for (const list of map.values()) list.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
    return map;
  }, [tasklists]);

  const orderedMilestones = useMemo(() => sortMilestones(milestones), [milestones]);

  function openTasklist(tasklistId: string) {
    // Task 276 (Phase 3) — was `${V2_ROUTES.PROJECTS}/${projectUrlKey}/tasks?...`.
    router.push(`/projects/v2/${projectUrlKey}/tasks?tasklist=${tasklistId}`);
  }

  if (orderedMilestones.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-[12px] border border-dashed border-[#E2E7F2] bg-[#F9FAFC] px-8 py-12 text-center">
        <Flag size={28} className="text-[#B7BFD6]" />
        <div>
          <div className="text-[14px] font-bold text-[#0B1533]">No phases yet</div>
          <p className="mt-1 text-[13px] text-[#5F6A88]">Add phases from the project&apos;s Milestones tab.</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="relative rounded-2xl border border-[#E2E7F2] bg-white pt-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <div
          ref={gantt.bindGrid(focusDay)}
          className="overflow-x-auto rounded-2xl"
        >
          <div className="relative" style={{ width: LABEL_WIDTH + visibleTotalDays * dayWidth }}>
            <GridHeader startDate={startDate} totalDays={visibleTotalDays} todayDay={currentDay} />

            {todayInRange && (
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-2 w-0 border-l-2 border-dashed border-[#FB914E]"
                style={{ left: LABEL_WIDTH + (currentDay - 1) * dayWidth + dayWidth / 2 }}
              >
                <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded border border-[#F9C9A0] bg-[#FFEFE3] px-1.5 py-0.5 text-[9px] font-bold text-[#FB914E]">
                  Day {currentDay}
                </div>
              </div>
            )}

            {orderedMilestones.map((m, index) => (
              <GenericSwimlaneLane
                key={m.id}
                milestone={m}
                index={index}
                window={timeline.windows.get(m.id)}
                totalDays={visibleTotalDays}
                tasklistOffset={timeline.tasklistOffset}
                collapsed={collapsedMilestones.has(m.id)}
                counts={milestoneCounts.get(m.id) ?? { total: 0, done: 0 }}
                tasklists={tasklistsByMilestone.get(m.id) ?? []}
                tasklistCounts={tasklistCounts}
                onToggleCollapse={() => onToggleCollapse(m.id)}
                onOpenTasklist={openTasklist}
                currentDay={currentDay}
                filters={filters}
                projectId={projectId}
                onDeliverableAdded={onDeliverableAdded}
              />
            ))}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => gantt.scrollToToday(focusDay)}
        aria-label="Jump to today"
        className="fixed bottom-8 right-8 z-40 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-none bg-[#FB914E] text-white shadow-[0_4px_16px_rgba(251,145,78,0.4)] transition-transform hover:scale-105"
      >
        <Locate size={20} />
      </button>
    </>
  );
}
