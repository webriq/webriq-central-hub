"use client";

import { AlertTriangle, ClipboardList, Plus, Minus, CheckCircle2, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";
import { formatWindowRange, windowLength, type PhaseWindow } from "@/lib/programme/generic-timeline";
import { LABEL_WIDTH, ROW_HEIGHT, ROW_GAP, LANE_TOP_PADDING, PHASE_VISUALS, assignTracks } from "./_gantt-shared";
import { useGanttZoom } from "./_gantt-zoom-context";
import AddDeliverableButton from "./_add-deliverable-button";
import { genericFacts, placeTasklist } from "./_timeline-stats";
import { matchesFilters, type TimelineFilters } from "./_use-timeline-filters";

type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
type Tasklist = Database["public"]["Tables"]["tasklists"]["Row"];
type Counts = { total: number; done: number };

// Height of the strip at the top of every lane that carries the phase's Start→Due span bar. It
// stays visible when the lane is collapsed, so a collapsed phase still shows where it sits.
const SPAN_STRIP = 24;
// Height of the "Unscheduled" pill row under the cards.
const UNSCHEDULED_ROW = 36;

// Task 420 — one phase (milestone) lane of the generic Timeline: label cell (dates · duration ·
// task counts), a span bar over the phase's Start→Due columns, and its deliverable cards.
// Deliverables only carry day offsets from `programme_started_at`, so `tasklistOffset` shifts them
// onto the timeline origin; anything with no range, or shifted fully outside the window, is listed
// in an "Unscheduled" row (task 421) rather than placed on the grid.
export default function GenericSwimlaneLane({
  milestone, index, window: phaseWindow, totalDays, tasklistOffset, collapsed, counts, tasklists, tasklistCounts,
  onToggleCollapse, onOpenTasklist, currentDay, filters, projectId, onDeliverableAdded,
}: {
  // Task 433: `onDeliverableAdded` is undefined for roles that may not add deliverables, which hides the control.
  projectId: string;
  onDeliverableAdded?: (tasklist: Tasklist) => void;
  milestone: Milestone;
  index: number;
  window: PhaseWindow | undefined;
  totalDays: number;
  tasklistOffset: number;
  collapsed: boolean;
  counts: Counts;
  tasklists: Tasklist[];
  tasklistCounts: Map<string, Counts>;
  onToggleCollapse: () => void;
  onOpenTasklist: (tasklistId: string) => void;
  // Task 422: today on the timeline axis (health) + active filters (dimming).
  currentDay: number;
  filters: TimelineFilters;
}) {
  const { dayWidth } = useGanttZoom();
  const visual = PHASE_VISUALS[(index % 5) + 1] ?? PHASE_VISUALS[1];
  const placed = tasklists.flatMap((tl) => {
    const at = placeTasklist(tl, tasklistOffset, totalDays);
    return at ? [{ tl, start: at.start, end: at.end }] : [];
  });
  // Task 421: tasklists with no day range, or shifted fully outside the window, used to vanish and
  // leave a misleading "No deliverables yet" — they're listed in an "Unscheduled" row instead.
  const placedIds = new Set(placed.map((p) => p.tl.id));
  const unscheduled = tasklists.filter((tl) => !placedIds.has(tl.id));
  const tracks = assignTracks(placed.map((p) => ({ dayStart: p.start, dayEnd: p.end })));
  const trackCount = tracks.length > 0 ? Math.max(...tracks) + 1 : 1;
  const showTrackBlock = placed.length > 0 || unscheduled.length === 0;
  const trackBlockHeight = showTrackBlock ? trackCount * ROW_HEIGHT + (trackCount - 1) * ROW_GAP : 0;
  const bodyHeight = trackBlockHeight + (unscheduled.length > 0 ? UNSCHEDULED_ROW : 0) + 8 + LANE_TOP_PADDING;
  const laneWidth = totalDays * dayWidth;
  const factsOf = (tl: Tasklist, at: { start: number; end: number } | null) => genericFacts(tl, tasklistCounts.get(tl.id), at, currentDay);
  // Phase health: due date passed (window ended before today) while the phase isn't completed.
  const phaseOverdue = !!phaseWindow && milestone.status !== "completed" && phaseWindow.endDay < currentDay;
  const phasePct = counts.total > 0 ? Math.round((counts.done / counts.total) * 100) : 0;

  return (
    <div className="flex border-b border-[#E2E7F2]">
      <div className={cn("sticky left-0 z-2 shrink-0 border-r border-[#E2E7F2] px-3.5 py-3", visual.bg)} style={{ width: LABEL_WIDTH }}>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent p-0 text-left"
        >
          <div className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[12px] font-bold", visual.iconBg, visual.iconText)}>
            {milestone.status === "completed" ? <CheckCircle2 size={13} /> : index + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className={cn("truncate text-[12.5px] font-bold", milestone.status === "completed" ? "text-[#5F6A88]" : "text-[#0B1533]")}>{milestone.name}</span>
              {milestone.status === "active" && <span className="h-1.5 w-1.5 shrink-0 animate-pulse motion-reduce:animate-none rounded-full bg-[#007BFF]" />}
            </div>
            <div className="font-mono truncate text-[10px] text-[#5F6A88]">
              {phaseWindow ? `${formatWindowRange(phaseWindow)} · ${windowLength(phaseWindow)}d` : "No dates set"}
            </div>
            <div className="font-mono truncate text-[10px] text-[#5F6A88]">
              {counts.done}/{counts.total} tasks
              {unscheduled.length > 0 && <span className="text-[#8A5A00]"> · {unscheduled.length} unscheduled</span>}
            </div>
          </div>
          {collapsed ? <Plus size={14} className="shrink-0 text-[#5F6A88]" /> : <Minus size={14} className="shrink-0 text-[#5F6A88]" />}
        </button>
        {onDeliverableAdded && (
          <AddDeliverableButton<Tasklist>
            endpoint={`/api/projects/${projectId}/programme/generic-deliverables`}
            target={{ milestone_id: milestone.id }}
            phaseName={milestone.name}
            phaseChipClass={cn(visual.bg, visual.text)}
            phaseDayStart={milestone.day_start}
            phaseDayEnd={milestone.day_end}
            onAdded={onDeliverableAdded}
          />
        )}
      </div>

      <div className="relative overflow-visible z-1" style={{ width: laneWidth, height: SPAN_STRIP + (collapsed ? 0 : bodyHeight) }}>
        {phaseWindow && (
          <div
            className={cn("absolute top-1.5 flex h-3.5 items-center overflow-hidden rounded-full px-2", visual.solid, phaseOverdue && "ring-2 ring-[#C0392B]")}
            style={{ left: (phaseWindow.startDay - 1) * dayWidth, width: windowLength(phaseWindow) * dayWidth - 6 }}
          >
            {/* Task 422 (M6): completed share of the phase's tasks, darkened over the solid bar. */}
            <div aria-hidden="true" className="absolute inset-y-0 left-0 bg-black/25" style={{ width: `${phasePct}%` }} />
            {phaseOverdue && <AlertTriangle size={9} className="relative mr-1 shrink-0 text-white" aria-hidden="true" />}
            <span className="relative truncate font-mono text-[9px] font-semibold text-white">
              {formatWindowRange(phaseWindow)}{phaseOverdue ? " · overdue" : ""}{counts.total > 0 ? ` · ${phasePct}%` : ""}
            </span>
          </div>
        )}
        {!collapsed && (
          <div className="absolute inset-x-0 bottom-0" style={{ top: SPAN_STRIP, paddingTop: LANE_TOP_PADDING }}>
            {tasklists.length === 0 && (
              <div className="flex items-center gap-2 px-2 pt-1 text-[11px] text-[#5F6A88]">
                <ClipboardList size={13} className="shrink-0 text-[#B7BFD6]" /> No deliverables yet
              </div>
            )}
            {placed.map(({ tl, start, end }, i) => {
              const tlCounts = tasklistCounts.get(tl.id) ?? { total: 0, done: 0 };
              const facts = factsOf(tl, { start, end });
              const dimmed = !matchesFilters(filters, facts);
              return (
                <button
                  key={tl.id}
                  type="button"
                  onClick={() => onOpenTasklist(tl.id)}
                  aria-label={`${tl.name}, ${tlCounts.done} of ${tlCounts.total} tasks done${facts.health === "overdue" ? ", overdue" : facts.health === "due-soon" ? ", due soon" : ""}`}
                  className={cn(
                    "absolute flex cursor-pointer flex-col items-start gap-0.5 overflow-hidden rounded-[8px] border bg-white px-2 py-1 text-left transition-colors hover:border-[#A8C6F5] hover:bg-[#F0F7FF]",
                    facts.percentage >= 100 ? "border-[#BEE7CD] bg-[#E3F5EA]" : facts.health === "overdue" ? "border-[#C0392B]" : facts.health === "due-soon" ? "border-[#E0A526]" : "border-[#E2E7F2]",
                    dimmed && "opacity-30"
                  )}
                  style={{
                    left: (start - 1) * dayWidth,
                    width: (end - start + 1) * dayWidth - 6,
                    top: LANE_TOP_PADDING + tracks[i] * (ROW_HEIGHT + ROW_GAP),
                    height: ROW_HEIGHT - 8,
                  }}
                >
                  <span className="flex w-full items-center gap-1">
                    {facts.health === "overdue" && <AlertTriangle size={11} className="shrink-0 text-[#C0392B]" aria-hidden="true" />}
                    {facts.health === "due-soon" && <Clock size={11} className="shrink-0 text-[#B7791F]" aria-hidden="true" />}
                    <span className="truncate text-[11.5px] font-semibold text-[#0B1533]">{tl.name}</span>
                  </span>
                  <span className="text-[10px] text-[#5F6A88]">{tlCounts.done}/{tlCounts.total} tasks done</span>
                </button>
              );
            })}
            {unscheduled.length > 0 && (
              <div className="absolute inset-x-0" style={{ top: LANE_TOP_PADDING + trackBlockHeight }}>
                {/* Sticky so the row stays in view however far the grid is scrolled sideways. */}
                <div className="sticky left-52 flex w-max max-w-[calc(100vw-20rem)] flex-wrap items-center gap-1.5 pl-2">
                  <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-[#8A5A00]">Unscheduled ({unscheduled.length})</span>
                  {unscheduled.map((tl) => {
                    const c = tasklistCounts.get(tl.id) ?? { total: 0, done: 0 };
                    return (
                      <button
                        key={tl.id}
                        type="button"
                        onClick={() => onOpenTasklist(tl.id)}
                        className={cn(
                          "inline-flex max-w-52 cursor-pointer items-center gap-1.5 rounded-full border border-[#F0D896] bg-[#FFF3D6] px-2.5 py-1 text-[11px] font-medium text-[#8A5A00] transition-colors hover:border-[#E0BE6A]",
                          !matchesFilters(filters, factsOf(tl, null)) && "opacity-30"
                        )}
                      >
                        <span className="truncate">{tl.name}</span>
                        <span className="font-mono shrink-0 text-[10px]">{c.done}/{c.total}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
