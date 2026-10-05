"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import type { Database } from "@/types/database";
import { buildTimeline, currentPhaseByDate } from "@/lib/programme/generic-timeline";
import { GenericNotStartedScreen, GenericNoPhasesScreen } from "./_generic-phase-empty-states";
import { GenericProgressCard } from "./_generic-progress-card";
import { GenericJumpToPhaseMenu } from "./_generic-jump-to-phase-menu";
import GenericSwimlane from "./_generic-swimlane";
import { TimelineToolbar } from "./_timeline-toolbar";
import { LiveUpdatesNotice } from "./_live-updates";
import { useGenericRealtime } from "./_use-generic-realtime";
import { useTimelineFilters } from "./_use-timeline-filters";
import { buildTaskCounts, countGeneric } from "./_timeline-stats";

type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
type Tasklist = Database["public"]["Tables"]["tasklists"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"];

interface GenericPhaseViewProps {
  project: {
    id: string;
    name: string;
    company_name: string;
    project_id: string | null;
    // Task 251: generic-engine equivalent of StackShift I's "programme started" gate — was never
    // set for these classifications before this task (see route.ts's programme/start branch), so
    // this page previously had no way to distinguish "not started yet" from "started but genuinely
    // has zero milestones."
    programme_started_at: string | null;
    scheduled_onboarding_start_at: string | null;
  };
  projectUrlKey: string;
  initialMilestones: Milestone[];
  tasklists: Tasklist[];
  tasks: Task[];
  canManagePhases: boolean;
}

// ─── Generic-model detail view (task 247) — every project not on the specialized customer_phases
// engine (StackShift Access/Access Plus/Discrete Development, or StackShift II without the engine
// opt-in). Read + navigate only: milestone/tasklist/task CRUD stays on the Projects module's own
// Milestones/Tasks tabs (task 242's scope decision) — this page's only write action is picking
// which milestone is "active" (Jump to phase).
// Task 283 — the in-body "Header card" (title/badge/Owner-Collaborators/Settings gear) that used
// to open this page's content is dissolved: those pieces now live in the shared
// `(tabs)/layout.tsx` header, which persists across tab navigation instead of reloading with this
// page. Jump to Phase moved to its own row above the swimlane; the Programme Progress bar/stat
// chips stay here as their own card (this generic-engine branch never moved that content to
// Overview the way StackShift did — task 281/282's explicit, still-current scope decision).
export default function GenericPhaseView({
  project, projectUrlKey, initialMilestones, tasklists: initialTasklists, tasks: initialTasks, canManagePhases,
}: GenericPhaseViewProps) {
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones);
  // Task 422: tasklists/tasks are live state (seeded from SSR props) so Realtime edits land without a reload.
  const [tasklists, setTasklists] = useState<Tasklist[]>(initialTasklists);
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const liveStatus = useGenericRealtime(project.id, { setMilestones, setTasklists, setTasks });
  const { filters, update: updateFilters, clear: clearFilters } = useTimelineFilters();
  const { milestoneCounts, tasklistCounts } = useMemo(() => buildTaskCounts(tasks), [tasks]);
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumping, setJumping] = useState(false);
  const [jumpError, setJumpError] = useState<string | null>(null);

  // Task 252: default collapse state (only the active milestone starts expanded) — same pattern
  // as _onboarding-detail.tsx's own collapseDefaultsAppliedRef, applied once the first time
  // milestones load so it doesn't fight a PM's own later manual expand/collapse.
  const [collapsedMilestones, setCollapsedMilestones] = useState<Set<string>>(new Set());
  const collapseDefaultsAppliedRef = useRef(false);
  useEffect(() => {
    if (collapseDefaultsAppliedRef.current || milestones.length === 0) return;
    collapseDefaultsAppliedRef.current = true;
    const active = milestones.find((m) => m.status === "active")?.id;
    setCollapsedMilestones(new Set(milestones.filter((m) => m.id !== active).map((m) => m.id)));
  }, [milestones]);
  function toggleCollapse(milestoneId: string) {
    setCollapsedMilestones((prev) => {
      const next = new Set(prev);
      if (next.has(milestoneId)) next.delete(milestoneId);
      else next.add(milestoneId);
      return next;
    });
  }

  // Task 251: local copy of the not-started gate, seeded from SSR props — flipped optimistically
  // by handleStart below instead of a full page refetch, same pattern OnboardingDetail's own
  // `milestones` local state already uses elsewhere on this page.
  const [programmeStartedAt, setProgrammeStartedAt] = useState(project.programme_started_at);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  async function handleStart() {
    setStarting(true);
    setStartError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/start`, { method: "POST" });
      if (!res.ok) throw new Error();
      setProgrammeStartedAt(new Date().toISOString());
    } catch {
      setStartError("Failed to start onboarding.");
    } finally {
      setStarting(false);
    }
  }

  // Task 251: checked before the "no milestones" empty state below — a Draft/Scheduled project
  // can legitimately have zero milestones yet (PM skipped phase planning at intake), in which case
  // this screen (with its own Start action) is the more useful state than "no phases set up, go to
  // Milestones tab." Mirrors StackShift I's not-started screen (_onboarding-detail.tsx), which
  // never conditions on deliverable count either.
  if (!programmeStartedAt) {
    return (
      <GenericNotStartedScreen
        name={project.name}
        companyName={project.company_name}
        scheduledStartAt={project.scheduled_onboarding_start_at}
        canManagePhases={canManagePhases}
        starting={starting}
        startError={startError}
        onStart={handleStart}
      />
    );
  }

  if (milestones.length === 0) {
    return <GenericNoPhasesScreen name={project.name} companyName={project.company_name} projectUrlKey={projectUrlKey} />;
  }

  // Task 252: routed through the dedicated generic-phase route (backdates programme_started_at
  // to the target milestone's day_start and re-statuses every other milestone by position —
  // "completed" for anything earlier, "planned" for anything later — instead of the old two-PATCH
  // dance that only ever flipped the two milestones' own status, never touching the programme's
  // start date at all). At most one milestone reads as "active" at a time, mirroring the
  // single-active-phase semantics used everywhere else "current phase" is displayed.
  async function handleJump(milestoneId: string) {
    setJumping(true);
    setJumpError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/programme/generic-phase`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ milestone_id: milestoneId }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setMilestones(data.milestones ?? []);
      if (data.programme_started_at) setProgrammeStartedAt(data.programme_started_at);
      setJumpOpen(false);
    } catch {
      setJumpError("Failed to update the active phase.");
    } finally {
      setJumping(false);
    }
  }

  // Task 420: the date window comes from each phase's Start/Due (buildTimeline); `day_start`/
  // `day_end` are only a fallback for phases with no dates. `programmeStartedAt` is guaranteed
  // non-null here (the not-started screen above returns first).
  const timeline = buildTimeline(milestones, programmeStartedAt);
  const activeMilestone = milestones.find((m) => m.status === "active") ?? currentPhaseByDate(milestones, timeline);
  const milestonesCompleted = milestones.filter((m) => m.status === "completed").length;
  const doneTasks = tasks.filter((t) => t.status === "closed").length;
  const filterCount = countGeneric(tasklists, tasklistCounts, timeline.tasklistOffset, timeline.totalDays, timeline.currentDay, filters);

  return (
      <div className="flex-1 min-h-0 overflow-y-auto bg-[#F4F6FB] px-7 py-8">
      <div className="flex flex-col gap-4">
        {/* Task 283 — Header card dissolved: title/badge/Owner-Collaborators/Settings gear live in
            the shared `(tabs)/layout.tsx` header. Jump to Phase has its own row here; the
            progress bar/stat chips are their own card. */}
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E5F1FF] px-2.5 py-0.5 text-[11px] font-semibold text-[#007BFF]">
            {activeMilestone ? activeMilestone.name : "No active phase"}
          </span>
          {canManagePhases && (
            <GenericJumpToPhaseMenu open={jumpOpen} setOpen={setJumpOpen} milestones={milestones} onJump={handleJump} jumping={jumping} />
          )}
        </div>
        {jumpError && <p className="text-xs text-[#C0392B]">{jumpError}</p>}
        <LiveUpdatesNotice status={liveStatus} />

        <GenericProgressCard
          timeline={timeline}
          phasesDone={milestonesCompleted}
          phasesTotal={milestones.length}
          deliverables={tasklists.length}
          doneTasks={doneTasks}
          totalTasks={tasks.length}
          projectUrlKey={projectUrlKey}
        />

        <TimelineToolbar
          filters={filters}
          onChange={updateFilters}
          onClear={clearFilters}
          shown={filterCount.shown}
          total={filterCount.total}
        />

        <GenericSwimlane
          milestones={milestones}
          tasklists={tasklists}
          milestoneCounts={milestoneCounts}
          tasklistCounts={tasklistCounts}
          projectUrlKey={projectUrlKey}
          timeline={timeline}
          collapsedMilestones={collapsedMilestones}
          onToggleCollapse={toggleCollapse}
          filters={filters}
        />
      </div>
      </div>
  );
}
