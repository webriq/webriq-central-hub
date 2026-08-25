"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Timer, Minus, Play, Pause, Square } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useTimer } from "./timer-context";
import { formatMMSS, formatHHMMSS } from "@/lib/timer/format";
import { BREAK_LABELS, BREAK_ICONS, type BreakType } from "@/lib/timer/constants";
import { decodeHtmlEntities } from "@/app/(hub)/projects-old/_pm-shared";
import { V2_ROUTES } from "@/config/constants";

const BREAK_META: Record<BreakType, { icon: LucideIcon; label: string; tooltip: string }> = {
  meal: { icon: BREAK_ICONS.meal, label: "60 mins", tooltip: "Meal Break for 60 mins" },
  coffee: { icon: BREAK_ICONS.coffee, label: "15 mins", tooltip: "Coffee Break for 15 mins" },
  few_minutes: { icon: BREAK_ICONS.few_minutes, label: "Few Minutes Break", tooltip: "Few Minutes Break for 5 mins" },
};
const BREAK_ORDER: BreakType[] = ["meal", "coffee", "few_minutes"];

// Task 209 — hub-wide timer widget (developer role only, widened to every role by task 293) so a
// running timer can be seen and paused from anywhere. Task 300 moved this from a fixed
// bottom-right floating overlay into V2HubHeader (beside NotificationBell) — it was overlapping
// in-page controls on pages with content near that corner. State comes from TimerContext
// (server-persisted active_timers).
export default function TimerHeaderWidget() {
  const [open, setOpen] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);
  const { timer, elapsedSeconds, breakRemainingSeconds, pauseTimer, resumeTimer, stopTimer, startBreak, cancelBreak } = useTimer();

  // Task 234 — "entity" covers either a task or an issue; the widget doesn't care which.
  const hasEntity = !!timer?.task_id || !!timer?.issue_id;
  const onBreak = !!timer?.break_type;
  const breakMeta = timer?.break_type ? BREAK_META[timer.break_type] : null;
  const breakLabel = timer?.break_type ? BREAK_LABELS[timer.break_type] : null;

  // Task 300 — task/issue title and project name link to their detail pages. Detail-page routes
  // key on the human-readable display_id/project_id columns, not the FK UUIDs on the timer row
  // (see attachTaskTitle in src/lib/timer/serialize.ts), so a link only renders when the needed
  // display id actually came back — otherwise these fall back to plain, non-clickable text.
  const entityHref =
    timer?.project_display_id && timer.task_id && timer.task_display_id
      ? `${V2_ROUTES.PROJECTS_V2}/${timer.project_display_id}/tasks/${timer.task_display_id}`
      : timer?.project_display_id && timer.issue_id && timer.issue_display_id
      ? `${V2_ROUTES.PROJECTS_V2}/${timer.project_display_id}/issues/${timer.issue_display_id}`
      : null;
  const projectHref = timer?.project_display_id
    ? `${V2_ROUTES.PROJECTS_V2}/${timer.project_display_id}/timeline`
    : null;

  async function handleStop() {
    await stopTimer();
  }

  // Task 267 — click-outside-to-minimize. widgetRef wraps both the trigger and the dropdown panel
  // (same pattern as v2-hub-sidebar.tsx's user menu), so a click on the trigger itself is always
  // "inside" and never fights with its own onClick toggle below.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (widgetRef.current && !widgetRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={widgetRef} className="relative">
      <Tooltip>
        <TooltipTrigger render={
          <button
            onClick={() => setOpen((o) => !o)}
            aria-label={open ? "Close timer widget" : "Open timer widget"}
            className="relative p-1.5 rounded-lg text-[#5F6A88] hover:bg-[#F4F6FB] hover:text-[#3A4565] transition-colors cursor-pointer"
          >
            <Timer size={18} />
            {hasEntity && (
              // Task 300 — status dot replaces the old persistent colored-pill background:
              // green = task in progress (running or manually paused), brand-orange = on break,
              // no dot at all = no timer running (see the `hasEntity &&` guard above).
              <span
                className={`absolute top-0.5 right-0.5 w-1.75 h-1.75 rounded-full border border-white ${
                  onBreak ? "bg-[#FB914E]" : "bg-emerald-500"
                }`}
              />
            )}
          </button>
        } />
        <TooltipContent side="left">{open ? "Minimize" : "Timer & breaks"}</TooltipContent>
      </Tooltip>

      {open && (
        // z-40 (design system's --z-popover level) — deliberately below the shared Tooltip
        // component's z-50 (src/components/ui/tooltip.tsx), which portals to document.body. A
        // higher value here would put this panel in front of its own break-button tooltips.
        <div className="absolute right-0 top-full mt-2 w-[272px] rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] overflow-hidden z-40">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#EDF0F7]">
            <span className="font-heading text-[15px] font-semibold text-[#0B1533] tracking-[-0.01em]">Timer</span>
            <Tooltip>
              <TooltipTrigger render={
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Minimize timer panel"
                  className="flex items-center justify-center w-6 h-6 rounded-full text-[#5F6A88] hover:bg-[#F4F6FB] hover:text-[#0B1533] transition-colors cursor-pointer"
                >
                  <Minus size={14} />
                </button>
              } />
              <TooltipContent side="left">Minimize</TooltipContent>
            </Tooltip>
          </div>

          <div className="p-4 flex flex-col gap-4">
            {/* ── Active task timer ── */}
            {hasEntity ? (
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Timer size={14} className="text-[#007BFF] shrink-0" />
                  <div className="flex-1 min-w-0">
                    {entityHref ? (
                      <Link href={entityHref} className="text-[12px] font-medium text-[#3A4565] hover:text-[#007BFF] truncate block transition-colors">
                        {decodeHtmlEntities(timer!.task_title ?? timer!.issue_title ?? "Untitled item")}
                      </Link>
                    ) : (
                      <p className="text-[12px] font-medium text-[#3A4565] truncate">
                        {decodeHtmlEntities(timer!.task_title ?? timer!.issue_title ?? "Untitled item")}
                      </p>
                    )}
                    {timer!.project_name && (
                      projectHref ? (
                        <Link href={projectHref} className="text-[10.5px] text-[#8A93AC] hover:text-[#007BFF] truncate block transition-colors">
                          {timer!.project_name}
                        </Link>
                      ) : (
                        <p className="text-[10.5px] text-[#8A93AC] truncate">{timer!.project_name}</p>
                      )
                    )}
                  </div>
                  <span className="text-[12px] font-mono font-semibold text-[#0B1533] tabular-nums shrink-0">
                    {formatHHMMSS(elapsedSeconds)}
                  </span>
                </div>
                {onBreak ? (
                  <p className="text-[11px] text-[#8A5A00] bg-[#FFF3D6] rounded-[7px] px-2.5 py-1.5">
                    Paused — on break
                  </p>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => void (timer!.status === "running" ? pauseTimer() : resumeTimer())}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[12px] font-medium text-[#3A4565] hover:border-[#A8C6F5] transition-colors cursor-pointer"
                    >
                      {timer!.status === "running" ? <Pause size={12} /> : <Play size={12} />}
                      {timer!.status === "running" ? "Pause" : "Resume"}
                    </button>
                    <button
                      onClick={() => void handleStop()}
                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E2E7F2] bg-white text-[12px] font-medium text-[#5F6A88] hover:border-[#F5B8B8] hover:text-[#C0392B] transition-colors cursor-pointer"
                      title="Stop & log time"
                    >
                      <Square size={11} />
                      Stop
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-[12px] text-[#5F6A88]">No timer running. Start one from a task or issue you&apos;re assigned to.</p>
            )}

            {(hasEntity) && <div className="h-px bg-[#EDF0F7]" />}

            {/* ── Break controls ── */}
            {onBreak && breakMeta ? (
              <div className="flex flex-col items-center gap-2 py-1">
                <breakMeta.icon size={18} className="text-[#8A5A00]" />
                <span className="text-[11px] font-semibold text-[#5F6A88]">{breakLabel}</span>
                <span className="text-[20px] font-mono font-semibold text-[#0B1533] tabular-nums">
                  {formatMMSS(breakRemainingSeconds ?? 0)}
                </span>
                <button
                  onClick={() => void cancelBreak()}
                  className="text-[11px] font-semibold text-[#0063D6] hover:text-[#007BFF] transition-colors cursor-pointer"
                >
                  End break
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {BREAK_ORDER.map((type) => {
                  const meta = BREAK_META[type];
                  const Icon = meta.icon;
                  return (
                    <Tooltip key={type}>
                      <TooltipTrigger render={
                        <button
                          onClick={() => void startBreak(type)}
                          className="flex flex-col items-center justify-center gap-1 px-1.5 py-2 min-h-[58px] rounded-[10px] border border-[#E2E7F2] bg-white hover:border-[#A8C6F5] hover:bg-[#F0F7FF] transition-colors cursor-pointer"
                        >
                          <Icon size={16} className="text-[#5F6A88]" />
                          <span className="text-[9.5px] font-semibold text-[#5F6A88] text-center leading-tight">{meta.label}</span>
                        </button>
                      } />
                      <TooltipContent side="top">{meta.tooltip}</TooltipContent>
                    </Tooltip>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
