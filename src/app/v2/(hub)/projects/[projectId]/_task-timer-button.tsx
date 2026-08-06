"use client";

import { Play, Pause, Square, Coffee, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useTimer } from "../../_components/timer-context";
import { formatMMSS } from "@/lib/timer/format";

// Task 209 — replaces the old local-useState TimerButton. State now lives server-side
// (active_timers, via TimerContext) so it survives navigation/refresh and can be seen/paused
// from the hub-wide floating break widget, wherever the developer currently is.
export function TaskTimerButton({
  taskId,
  projectId,
  onHoursLogged,
  prominent = false,
}: {
  taskId: string;
  projectId: string;
  onHoursLogged: (taskId: string, hours: number) => void;
  // Task 218 — opt-in, larger brand-orange "start" affordance for the task detail page header.
  // Defaults to false so the list view's compact row icon is unchanged.
  prominent?: boolean;
}) {
  const { timer, elapsedSeconds, startTimer, pauseTimer, resumeTimer, stopTimer } = useTimer();

  const isThisTask = timer?.task_id === taskId;
  const isOtherActive = !!timer?.task_id && !isThisTask;

  async function handleStop() {
    const hours = await stopTimer();
    if (hours) onHoursLogged(taskId, hours);
  }

  if (isOtherActive) {
    return (
      <Tooltip>
        <TooltipTrigger render={
          <span className="flex items-center justify-center text-[#C7CEDD] cursor-not-allowed">
            <Play size={13} />
          </span>
        } />
        <TooltipContent side="top">Timer running on another task</TooltipContent>
      </Tooltip>
    );
  }

  if (!isThisTask || !timer) {
    return (
      <Tooltip>
        <TooltipTrigger render={
          <button
            onClick={() => void startTimer(taskId, projectId)}
            className={cn(
              "flex items-center justify-center transition-colors cursor-pointer",
              prominent
                ? "text-[#FB914E] hover:text-[#E2762F]"
                : "text-[#C7CEDD] hover:text-[#007BFF]"
            )}
          >
            <Timer size={prominent ? 18 : 13} />
          </button>
        } />
        <TooltipContent side="top">Start timer</TooltipContent>
      </Tooltip>
    );
  }

  if (timer.break_type) {
    return (
      <Tooltip>
        <TooltipTrigger render={
          <span className="flex items-center gap-1 text-[#8A5A00] cursor-not-allowed">
            <Coffee size={11} />
            <span className="text-[10px] font-mono font-semibold tabular-nums">{formatMMSS(elapsedSeconds)}</span>
          </span>
        } />
        <TooltipContent side="top">Paused — on break</TooltipContent>
      </Tooltip>
    );
  }

  if (timer.status === "running") {
    return (
      <Tooltip>
        <TooltipTrigger render={
          <button
            onClick={() => void pauseTimer()}
            className="flex items-center gap-1 text-[#007BFF] hover:text-[#0063D6] transition-colors cursor-pointer"
          >
            <Pause size={11} />
            <span className="text-[10px] font-mono font-semibold tabular-nums">{formatMMSS(elapsedSeconds)}</span>
          </button>
        } />
        <TooltipContent side="top">Pause timer</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <span className="flex items-center gap-1.5">
      <Tooltip>
        <TooltipTrigger render={
          <button
            onClick={() => void resumeTimer()}
            className="flex items-center gap-1 text-[#5F6A88] hover:text-[#007BFF] transition-colors cursor-pointer"
          >
            <Play size={11} />
            <span className="text-[10px] font-mono font-semibold tabular-nums">{formatMMSS(elapsedSeconds)}</span>
          </button>
        } />
        <TooltipContent side="top">Resume timer</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger render={
          <button
            onClick={() => void handleStop()}
            className="flex items-center justify-center text-[#5F6A88] hover:text-[#C0392B] transition-colors cursor-pointer"
          >
            <Square size={10} />
          </button>
        } />
        <TooltipContent side="top">Stop & log time</TooltipContent>
      </Tooltip>
    </span>
  );
}
