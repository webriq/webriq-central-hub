"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import {
  Flag, ClipboardList, CheckCircle2, ListChecks, CalendarClock, PlayCircle, Clock,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { getCurrentProgrammeDay } from "@/config/customer-phases";
import type { Database } from "@/types/database";
import { StatChip, addDays } from "./_onboarding-detail";
import { GenericJumpToPhaseMenu } from "./_generic-jump-to-phase-menu";
import GenericSwimlane from "./_generic-swimlane";

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
  project, projectUrlKey, initialMilestones, tasklists, tasks, canManagePhases,
}: GenericPhaseViewProps) {
  const [milestones, setMilestones] = useState<Milestone[]>(initialMilestones);
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
    const hasSchedule = !!project.scheduled_onboarding_start_at;
    const scheduledDate = project.scheduled_onboarding_start_at ? new Date(project.scheduled_onboarding_start_at) : null;

    return (
        <div className="flex-1 min-h-0 overflow-y-auto bg-[#F4F6FB] px-7 py-8">
        <div className="mx-auto max-w-[560px] rounded-2xl border border-[#E2E7F2] bg-white p-10 text-center shadow-[0_4px_24px_rgba(15,23,42,0.07)]">
          <CalendarClock size={32} className="mx-auto mb-4 text-[#5F6A88]" />
          <div className="text-lg font-bold text-[#0B1533]">{project.name}</div>
          <div className="mb-3 text-[13px] text-[#5F6A88]">{project.company_name}</div>

          {hasSchedule ? (
            <div className="mx-auto mb-6 max-w-md rounded-[10px] border border-[#F0D896] bg-[#FFF3D6] px-4 py-3 text-left">
              <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#8A5A00]">
                <CalendarClock size={14} /> Scheduled to auto-start
              </div>
              <p className="mt-1 text-[12.5px] leading-relaxed text-[#8A5A00]">
                Onboarding will start automatically on{" "}
                {scheduledDate?.toLocaleString("en-US", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}
                .
              </p>
            </div>
          ) : (
            <p className="mx-auto mb-6 max-w-md text-[13px] text-[#5F6A88]">
              Start onboarding to begin tracking this project&apos;s phases.
            </p>
          )}

          {startError && <p className="mb-3 text-xs text-[#C0392B]">{startError}</p>}

          {canManagePhases ? (
            <button
              type="button"
              onClick={handleStart}
              disabled={starting}
              className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-none bg-[#007BFF] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(0,123,255,0.3)] transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              <PlayCircle size={15} /> {starting ? "Starting…" : hasSchedule ? "Start Anyway" : "Start Onboarding"}
            </button>
          ) : (
            <p className="text-[12.5px] text-[#5F6A88]">Not started yet — Marketing manages the programme start date.</p>
          )}
        </div>
        </div>
    );
  }

  if (milestones.length === 0) {
    return (
        <div className="flex-1 min-h-0 overflow-y-auto bg-[#F4F6FB] px-7 py-8">
        <div className="mx-auto max-w-[560px] rounded-2xl border border-[#E2E7F2] bg-white p-10 text-center shadow-[0_4px_24px_rgba(15,23,42,0.07)]">
          <Flag size={32} className="mx-auto mb-4 text-[#5F6A88]" />
          <div className="text-lg font-bold text-[#0B1533]">{project.name}</div>
          <div className="mb-3 text-[13px] text-[#5F6A88]">{project.company_name}</div>
          <p className="mx-auto mb-6 max-w-md text-[13px] text-[#5F6A88]">
            No phases have been set up for this project yet. Add phases and deliverables from the
            project&apos;s Milestones tab to start tracking progress here.
          </p>
          {/* Task 276 (Phase 3) — was `${V2_ROUTES.PROJECTS}/${projectUrlKey}`; the Milestones tab
              now lives under this same project's unified `/projects/v2` detail page (task 279). */}
          <Link
            href={`/projects/v2/${projectUrlKey}/milestones`}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border-none bg-[#007BFF] px-4 py-2 text-[13px] font-semibold text-white shadow-[0_2px_10px_rgba(0,123,255,0.3)] transition-opacity hover:opacity-90"
          >
            Go to Milestones
          </Link>
        </div>
        </div>
    );
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

  const activeMilestone = milestones.find((m) => m.status === "active") ?? null;
  const milestonesCompleted = milestones.filter((m) => m.status === "completed").length;
  const doneTasks = tasks.filter((t) => t.status === "closed").length;
  const totalTasks = tasks.length;

  // Task 252: day-based progress, mirroring StackShift I's own programme-progress bar
  // (_onboarding-detail.tsx) — total length is simply the latest dayEnd across this project's own
  // milestones (no separate "programme duration" field for the generic engine; see task 252 doc's
  // scope decision), not a fixed constant. `programmeStartedAt` is guaranteed non-null in this
  // branch (the not-started screen above returns before this point).
  const startDate = new Date(programmeStartedAt!);
  const currentDay = getCurrentProgrammeDay(programmeStartedAt!);
  const visibleTotalDays = Math.max(1, ...milestones.map((m) => m.day_end ?? 0));
  const dayProgressPct = Math.min(100, Math.round((currentDay / visibleTotalDays) * 100));
  const daysRemaining = Math.max(0, visibleTotalDays - currentDay);

  return (
      <div className="flex-1 min-h-0 overflow-y-auto bg-[#F4F6FB] px-7 py-8">
      <div className="flex flex-col gap-4">
        {/* Task 283 — Header card dissolved: title/badge/Owner-Collaborators/Settings gear now
            live in the shared `(tabs)/layout.tsx` header (mirrors what task 281 already did for
            the StackShift branch). Jump to Phase moves to its own row here; the active-milestone
            pill and Progress bar/stat chips become their own card. */}
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#E5F1FF] px-2.5 py-0.5 text-[11px] font-semibold text-[#007BFF]">
            {activeMilestone ? activeMilestone.name : "No active phase"}
          </span>
          {canManagePhases && (
            <GenericJumpToPhaseMenu open={jumpOpen} setOpen={setJumpOpen} milestones={milestones} onJump={handleJump} jumping={jumping} />
          )}
        </div>
        {jumpError && <p className="text-xs text-[#C0392B]">{jumpError}</p>}

        <div className="rounded-2xl border border-[#E2E7F2] bg-white p-6 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col gap-4 lg:flex-row lg:gap-6">
            <div className="min-w-0 lg:flex-1">
              <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-3">
                <span className="text-[11px] font-bold uppercase tracking-wide text-[#0B1533]">{visibleTotalDays}-Day Programme Progress</span>
                <span className="font-mono text-[11px] text-[#5F6A88]">DAY {currentDay} OF {visibleTotalDays}</span>
              </div>
              <div className="relative h-5 rounded-full bg-[#EDF0F7]">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-[#007BFF] transition-[width] duration-700"
                  style={{ width: `${dayProgressPct}%` }}
                />
                <div
                  className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full bg-[#071133] px-1.5 py-0.5 font-mono text-[9px] font-semibold text-white shadow-[0_1px_3px_rgba(7,17,51,.35)]"
                  style={{ left: `clamp(28px, ${dayProgressPct}%, calc(100% - 28px))` }}
                >
                  DAY {currentDay}
                </div>
              </div>
              <div className="mt-1.5 flex justify-between font-mono text-[9px] uppercase text-[#5F6A88]">
                <span>Day 1 ({formatDate(startDate).toUpperCase()})</span>
                <span>Day {visibleTotalDays} ({formatDate(addDays(startDate, visibleTotalDays - 1)).toUpperCase()})</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap lg:shrink-0 lg:flex-nowrap">
              <StatChip icon={Clock} label="Days left" value={daysRemaining} />
              <StatChip icon={CheckCircle2} label="Phases done" value={`${milestonesCompleted}/${milestones.length}`} />
              <StatChip icon={ClipboardList} label="Deliverables" value={tasklists.length} />
              <StatChip icon={ListChecks} label="Tasks done" value={`${doneTasks}/${totalTasks}`} />
            </div>
          </div>
        </div>

        <GenericSwimlane
          milestones={milestones}
          tasklists={tasklists}
          tasks={tasks}
          projectUrlKey={projectUrlKey}
          startDate={startDate}
          currentDay={currentDay}
          visibleTotalDays={visibleTotalDays}
          collapsedMilestones={collapsedMilestones}
          onToggleCollapse={toggleCollapse}
        />
      </div>
      </div>
  );
}
