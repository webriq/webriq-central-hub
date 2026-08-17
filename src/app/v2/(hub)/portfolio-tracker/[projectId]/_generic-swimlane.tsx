"use client";

import { useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Flag, Plus, Minus, CheckCircle2, Locate } from "lucide-react";
import { cn } from "@/lib/utils";
import { V2_ROUTES } from "@/config/constants";
import type { Database } from "@/types/database";
import {
  DAY_WIDTH, LABEL_WIDTH, ROW_HEIGHT, ROW_GAP, LANE_TOP_PADDING, PHASE_VISUALS,
  assignTracks, addDays, DateColumnHeader,
} from "./_onboarding-detail";

type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
type Tasklist = Database["public"]["Tables"]["tasklists"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"];

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
// milestone, one card per tasklist, positioned by each row's own day_start/day_end (task 252's
// migration) instead of the flat card grid this used before — mirrors StackShift I's own
// Swimlane (_onboarding-detail.tsx) for visual/interaction consistency: shared date-column grid,
// a "today" marker, collapse-by-default (only the active milestone starts expanded, handled by
// the parent GenericPhaseView the same way _onboarding-detail.tsx owns its own collapse state),
// and the same Plus/Minus toggle. No drag-resize and no skip-phase concept — out of scope for
// this task (skip has no equivalent in the milestones schema; see task 252 doc's Open Questions).
// Read + navigate only — milestone/tasklist/task CRUD stays in the Projects module (task 242's
// scope decision, unaffected by this rebuild).
export default function GenericSwimlane({
  milestones,
  tasklists,
  tasks,
  projectUrlKey,
  startDate,
  currentDay,
  visibleTotalDays,
  collapsedMilestones,
  onToggleCollapse,
}: {
  milestones: Milestone[];
  tasklists: Tasklist[];
  tasks: Task[];
  projectUrlKey: string;
  startDate: Date;
  currentDay: number;
  visibleTotalDays: number;
  collapsedMilestones: Set<string>;
  onToggleCollapse: (milestoneId: string) => void;
}) {
  const router = useRouter();

  // Task 254: wheel-to-horizontal-scroll + "Jump to today" — ported from _onboarding-detail.tsx's
  // identical Gantt grid (StackShift I engine), which this component otherwise already mirrors for
  // layout (task 247/252). This component owns its own scrollable div, so both live here rather
  // than threaded through GenericPhaseView as props.
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrolledToTodayRef = useRef(false);

  // Native addEventListener (not JSX onWheel) is required so preventDefault() works — React's
  // synthetic wheel listener is passive by default.
  function handleGridWheel(e: WheelEvent) {
    const el = scrollRef.current;
    if (!el) return;
    if (e.ctrlKey) return; // preserve native pinch-zoom
    if (el.scrollWidth <= el.clientWidth) return; // nothing to pan
    const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    e.preventDefault();
    el.scrollLeft += delta;
  }

  function scrollToToday(behavior: ScrollBehavior = "auto") {
    if (!scrollRef.current) return;
    const target = Math.max(0, LABEL_WIDTH + (currentDay - 1) * DAY_WIDTH - (scrollRef.current.clientWidth - LABEL_WIDTH) / 2);
    scrollRef.current.scrollTo({ left: target, behavior });
  }

  const { milestoneCounts, tasklistCounts } = useMemo(() => {
    const milestoneCounts = new Map<string, { total: number; done: number }>();
    const tasklistCounts = new Map<string, { total: number; done: number }>();
    for (const t of tasks) {
      if (t.milestone_id) {
        const entry = milestoneCounts.get(t.milestone_id) ?? { total: 0, done: 0 };
        entry.total++;
        if (t.status === "closed") entry.done++;
        milestoneCounts.set(t.milestone_id, entry);
      }
      if (t.tasklist_id) {
        const entry = tasklistCounts.get(t.tasklist_id) ?? { total: 0, done: 0 };
        entry.total++;
        if (t.status === "closed") entry.done++;
        tasklistCounts.set(t.tasklist_id, entry);
      }
    }
    return { milestoneCounts, tasklistCounts };
  }, [tasks]);

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
    router.push(`${V2_ROUTES.PROJECTS}/${projectUrlKey}/tasks?tasklist=${tasklistId}`);
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

  const days = Array.from({ length: visibleTotalDays }, (_, i) => i + 1);

  return (
    <>
      <div className="relative rounded-2xl border border-[#E2E7F2] bg-white pt-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
        <div
          ref={(node) => {
            // Runs on every render where this callback ref's identity changes (i.e. every render,
            // since it's inline) — attach/detach directly here, same pattern as
            // _onboarding-detail.tsx's identical grid ref, so the listener can never end up
            // permanently unattached due to a dependency array missing the render where the node
            // mounts.
            if (scrollRef.current) scrollRef.current.removeEventListener("wheel", handleGridWheel);
            scrollRef.current = node;
            if (!node) return;
            node.addEventListener("wheel", handleGridWheel, { passive: false });
            if (!scrolledToTodayRef.current) {
              scrolledToTodayRef.current = true;
              requestAnimationFrame(() => scrollToToday("auto"));
            }
          }}
          className="overflow-x-auto rounded-2xl"
        >
          <div className="relative" style={{ width: LABEL_WIDTH + visibleTotalDays * DAY_WIDTH }}>
            <div className="flex border-b border-[#E2E7F2]">
              <div className="sticky left-0 shrink-0 border-r z-3 border-[#E2E7F2] bg-white" style={{ width: LABEL_WIDTH }} />
              {days.map((day) => (
                <DateColumnHeader key={day} date={addDays(startDate, day - 1)} isToday={day === currentDay} />
              ))}
            </div>

            {currentDay <= visibleTotalDays && (
              <div
                className="pointer-events-none absolute bottom-0 top-0 z-2 w-0 border-l-2 border-dashed border-[#FB914E]"
                style={{ left: LABEL_WIDTH + (currentDay - 1) * DAY_WIDTH + DAY_WIDTH / 2 }}
              >
                <div className="absolute -top-0.5 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded border border-[#F9C9A0] bg-[#FFEFE3] px-1.5 py-0.5 text-[9px] font-bold text-[#FB914E]">
                  Day {currentDay}
                </div>
              </div>
            )}

            {orderedMilestones.map((m, index) => {
              const counts = milestoneCounts.get(m.id) ?? { total: 0, done: 0 };
              const laneTasklists = (tasklistsByMilestone.get(m.id) ?? []).filter((tl) => tl.day_start != null && tl.day_end != null);
              const visual = PHASE_VISUALS[(index % 5) + 1] ?? PHASE_VISUALS[1];
              const collapsed = collapsedMilestones.has(m.id);
              const tracks = assignTracks(laneTasklists.map((tl) => ({ dayStart: tl.day_start!, dayEnd: tl.day_end! })));
              const trackCount = tracks.length > 0 ? Math.max(...tracks) + 1 : 1;
              const laneHeight = trackCount * ROW_HEIGHT + (trackCount - 1) * ROW_GAP + 8 + LANE_TOP_PADDING;

              return (
                <div key={m.id} className="flex border-b border-[#E2E7F2]">
                  <div className={cn("sticky left-0 z-2 shrink-0 border-r border-[#E2E7F2] px-3.5 py-3", visual.bg)} style={{ width: LABEL_WIDTH }}>
                    <button
                      type="button"
                      onClick={() => onToggleCollapse(m.id)}
                      className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left"
                    >
                      <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold", visual.iconBg, visual.iconText)}>
                        {m.status === "completed" ? <CheckCircle2 size={13} /> : index + 1}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={cn("truncate text-[12.5px] font-bold", m.status === "completed" ? "text-[#5F6A88]" : "text-[#0B1533]")}>{m.name}</span>
                          {m.status === "active" && <span className="h-1.5 w-1.5 shrink-0 animate-pulse motion-reduce:animate-none rounded-full bg-[#007BFF]" />}
                        </div>
                        <div className="font-mono truncate text-[10px] text-[#5F6A88]">
                          {m.day_start != null && m.day_end != null && <>D{m.day_start}–{m.day_end} · </>}
                          {counts.done}/{counts.total} tasks
                        </div>
                      </div>
                      {collapsed ? <Plus size={14} className="shrink-0 text-[#5F6A88]" /> : <Minus size={14} className="shrink-0 text-[#5F6A88]" />}
                    </button>
                  </div>

                  <div
                    className="relative overflow-visible z-1"
                    style={{ width: visibleTotalDays * DAY_WIDTH, height: collapsed ? 0 : laneHeight, paddingTop: collapsed ? 0 : LANE_TOP_PADDING }}
                  >
                    {!collapsed && laneTasklists.length === 0 && (
                      <div className="flex items-center gap-2 px-2 pt-1 text-[11.5px] text-[#5F6A88]">
                        <ClipboardList size={13} className="shrink-0 text-[#B7BFD6]" /> No deliverables yet
                      </div>
                    )}
                    {!collapsed && laneTasklists.map((tl, i) => {
                      const tlCounts = tasklistCounts.get(tl.id) ?? { total: 0, done: 0 };
                      const pct = tlCounts.total > 0 ? Math.round((tlCounts.done / tlCounts.total) * 100) : 0;
                      const span = tl.day_end! - tl.day_start! + 1;
                      return (
                        <button
                          key={tl.id}
                          type="button"
                          onClick={() => openTasklist(tl.id)}
                          className={cn(
                            "absolute flex cursor-pointer flex-col items-start gap-0.5 overflow-hidden rounded-[8px] border bg-white px-2 py-1 text-left transition-colors hover:border-[#A8C6F5] hover:bg-[#F0F7FF]",
                            pct >= 100 ? "border-[#BEE7CD] bg-[#E3F5EA]" : "border-[#E2E7F2]"
                          )}
                          style={{
                            left: (tl.day_start! - 1) * DAY_WIDTH,
                            width: span * DAY_WIDTH - 6,
                            top: tracks[i] * (ROW_HEIGHT + ROW_GAP),
                            height: ROW_HEIGHT - 8,
                          }}
                        >
                          <span className="truncate text-[11.5px] font-semibold text-[#0B1533]">{tl.name}</span>
                          <span className="text-[10px] text-[#5F6A88]">{tlCounts.done}/{tlCounts.total} tasks done</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => scrollToToday("smooth")}
        aria-label="Jump to today"
        className="fixed bottom-8 right-8 z-40 flex h-12 w-12 cursor-pointer items-center justify-center rounded-full border-none bg-[#FB914E] text-white shadow-[0_4px_16px_rgba(251,145,78,0.4)] transition-transform hover:scale-105"
      >
        <Locate size={20} />
      </button>
    </>
  );
}
