"use client";

import { useState } from "react";
import Link from "next/link";
import { Pause, Play, Square, TimerOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTimer } from "@/app/(hub)/_components/timer-context";
import { formatHHMMSS, formatHoursAsHHMM, formatHoursInWords } from "@/lib/timer/format";
import { BREAK_ICONS, BREAK_LABELS } from "@/lib/timer/constants";
import { TRANSITION } from "./_ui";
import type { DevHoursByProject } from "./_types";

// Task 360 — the navy "Active timer" card, driven entirely by the hub-wide TimerContext
// (server-backed `active_timers`), never a local mock clock.
//
// The mockup's "Switch task" control is dropped: TimerContext has no switch operation and this
// page has no task picker. The second slot is Pause/Resume, which the context does support.

const CARD =
  "relative overflow-hidden rounded-[14px] bg-[#071133] text-white p-[18px] shadow-[0_8px_24px_rgba(7,17,51,0.10)]";
const GLOW =
  "before:content-[''] before:absolute before:inset-0 before:pointer-events-none " +
  "before:bg-[radial-gradient(120%_90%_at_100%_0%,rgba(0,123,255,0.22),transparent_60%)]";

const BTN =
  `flex-1 inline-flex items-center justify-center gap-2 text-[13px] font-semibold py-2 rounded-full border ${TRANSITION} ` +
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5EB0FF] disabled:opacity-45 disabled:pointer-events-none";

function LoggedToday({ hours, byProject }: { hours: number; byProject: DevHoursByProject[] }) {
  const top = byProject.slice(0, 3);
  return (
    <>
      <div className="relative flex items-center justify-between mt-4 pt-3.5 border-t border-white/10">
        <span className="text-[11.5px] font-medium text-[#8B96B3]">Logged today</span>
        <span className="font-mono text-[14px] font-semibold text-white" title={formatHoursInWords(hours)}>
          {formatHoursAsHHMM(hours)}
        </span>
      </div>
      {top.length > 0 ? (
        <div
          className="relative flex gap-0.5 h-1.5 rounded mt-2.5 overflow-hidden"
          title={top.map((p) => `${p.name}: ${formatHoursAsHHMM(p.hours)}`).join(" · ")}
        >
          {top.map((p, i) => (
            <span
              key={p.name}
              className={i === 0 ? "bg-[#007BFF]" : i === 1 ? "bg-[#4C7FF0]" : "bg-[#7FA3F5]"}
              style={{ flex: Math.max(p.hours, 0.01) }}
            />
          ))}
        </div>
      ) : null}
    </>
  );
}

export default function DevTimerCard({
  hoursToday,
  hoursTodayByProject,
  projectHrefs,
}: {
  hoursToday: number;
  hoursTodayByProject: DevHoursByProject[];
  /**
   * project uuid → its `/projects/{v2,legacy}/{display id}` base, built once by the parent from
   * the loader's own project rows and passed down as a plain map (not fetched here) so this
   * card's per-second `useTimer()` tick never triggers a query.
   *
   * The map exists at all because `ActiveTimerRow` (`timer-context.tsx`, populated by
   * `attachTaskTitle()` in `@/lib/timer/serialize.ts`) doesn't carry `external_project_id`, so
   * the legacy-vs-v2 route tab can't be derived from the timer row alone — the same gap
   * `timer-header-widget.tsx` currently papers over by hardcoding `V2_ROUTES.PROJECTS_V2`
   * (a pre-existing bug for a legacy-project timer, not introduced here). Fixing that at the
   * root would mean adding the field to `attachTaskTitle()`'s existing project select and to
   * `ActiveTimerRow` itself, so every timer-link consumer benefits — a small change, but to
   * shared server-side timer plumbing well outside "redesign one dashboard page", so it's left
   * as a follow-up rather than folded into this diff.
   */
  projectHrefs: Record<string, string>;
}) {
  const { timer, elapsedSeconds, pauseTimer, resumeTimer, stopTimer } = useTimer();
  const [busy, setBusy] = useState(false);

  const entity = timer?.task_id
    ? { title: timer.task_title, displayId: timer.task_display_id, segment: "tasks" }
    : timer?.issue_id
      ? { title: timer.issue_title, displayId: timer.issue_display_id, segment: "tickets" }
      : null;

  if (!timer || !entity) {
    return (
      <section className={cn(CARD, GLOW)}>
        <div className="relative">
          <span className="text-[11.5px] font-bold tracking-[0.05em] uppercase text-[#8B96B3]">Active timer</span>
          <div className="flex flex-col items-center text-center gap-2 py-5">
            <div className="w-9 h-9 rounded-xl bg-white/[0.06] flex items-center justify-center text-[#8B96B3]">
              <TimerOff size={16} />
            </div>
            <p className="text-[13px] font-semibold text-white m-0">No timer running</p>
            <p className="text-[11.5px] text-[#8B96B3] m-0 max-w-[220px]">
              Start one from any row in My work to track time against it.
            </p>
          </div>
        </div>
        <LoggedToday hours={hoursToday} byProject={hoursTodayByProject} />
      </section>
    );
  }

  const onBreak = !!timer.break_type;
  const running = timer.status === "running" && !onBreak;
  const BreakIcon = timer.break_type ? BREAK_ICONS[timer.break_type] : null;

  const projectBase = timer.project_id ? projectHrefs[timer.project_id] : undefined;
  const entityHref = projectBase && entity.displayId ? `${projectBase}/${entity.segment}/${entity.displayId}` : null;

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={cn(CARD, GLOW)}>
      <div className="relative flex items-center justify-between mb-3.5">
        <span className="text-[11.5px] font-bold tracking-[0.05em] uppercase text-[#8B96B3]">Active timer</span>
        {onBreak && BreakIcon ? (
          <span className="flex items-center gap-1.5 text-[10.5px] font-bold text-[#F0D896]">
            <BreakIcon size={11} />
            {BREAK_LABELS[timer.break_type!]}
          </span>
        ) : running ? (
          <span className="flex items-center gap-1.5 text-[10.5px] font-bold text-[#FCA5A5]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#EF4444] animate-pulse motion-reduce:animate-none" />
            RECORDING
          </span>
        ) : (
          <span className="text-[10.5px] font-bold text-[#8B96B3]">PAUSED</span>
        )}
      </div>

      <p className="relative text-[14.5px] font-semibold text-white m-0 line-clamp-2">
        {entity.title ?? "Untitled"}
      </p>
      <p className="relative text-[12px] text-[#8B96B3] mt-0.5 mb-4 truncate">
        {timer.project_name ?? "Unknown project"}
        {entity.displayId ? <span className="font-mono"> · {entity.displayId}</span> : null}
      </p>

      <div className="relative font-mono text-[38px] font-semibold tracking-[-0.01em] text-white mb-4 tabular-nums">
        {formatHHMMSS(elapsedSeconds)}
      </div>

      <div className="relative flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void run(stopTimer)}
          className={cn(BTN, "bg-[#C0392B] border-transparent text-white hover:bg-[#A93226]")}
        >
          <Square size={13} />
          Stop
        </button>
        {onBreak ? null : (
          <button
            type="button"
            disabled={busy}
            onClick={() => void run(running ? pauseTimer : resumeTimer)}
            className={cn(BTN, "bg-white/[0.08] border-white/[0.12] text-white hover:bg-white/[0.14]")}
          >
            {running ? <Pause size={13} /> : <Play size={13} />}
            {running ? "Pause" : "Resume"}
          </button>
        )}
      </div>

      {entityHref ? (
        <Link
          href={entityHref}
          className="relative block mt-3 text-[12px] font-semibold text-[#5EB0FF] hover:text-white transition-colors motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#5EB0FF] rounded-sm"
        >
          Open {timer.task_id ? "task" : "ticket"} →
        </Link>
      ) : null}

      <LoggedToday hours={hoursToday} byProject={hoursTodayByProject} />
    </section>
  );
}
