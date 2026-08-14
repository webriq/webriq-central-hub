"use client";

import { Play, Pause, Square, Coffee, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { useTimer, type TimerEntityRef } from "../../_components/timer-context";
import { formatMMSS } from "@/lib/timer/format";

// Task 209 — replaces the old local-useState TimerButton. State now lives server-side
// (active_timers, via TimerContext) so it survives navigation/refresh and can be seen/paused
// from the hub-wide floating break widget, wherever the developer currently is.
// Task 234 — widened to accept either a task or an issue (mutually exclusive, `entity` prop).
type TaskTimerButtonProps = TimerEntityRef & {
  projectId: string;
  // Task 218 — bumped after a stop so the caller's Time Logs tab (task 214) can refetch.
  // Optional — Issue Detail doesn't have a Time Logs tab yet (task 237 adds it).
  onHoursLogged?: (hours: number) => void;
  // Task 218 — opt-in, larger brand-orange "start" affordance for the task/issue detail page
  // header. Defaults to false so the list view's compact row icon is unchanged.
  prominent?: boolean;
};

export function TaskTimerButton({ projectId, onHoursLogged, prominent = false, ...entity }: TaskTimerButtonProps) {
  const { timer, elapsedSeconds, startTimer, pauseTimer, resumeTimer, stopTimer } = useTimer();

  const entityId = "taskId" in entity ? entity.taskId : entity.issueId;
  const isThisEntity = "taskId" in entity ? timer?.task_id === entityId : timer?.issue_id === entityId;
  const isOtherActive = (!!timer?.task_id || !!timer?.issue_id) && !isThisEntity;

  async function handleStop() {
    const hours = await stopTimer();
    if (hours) onHoursLogged?.(hours);
  }

  if (isOtherActive) {
    return (
      <Tooltip>
        <TooltipTrigger render={
          <span className="flex items-center justify-center text-[#C7CEDD] cursor-not-allowed">
            <Play size={13} />
          </span>
        } />
        <TooltipContent side="top">Timer running on another task or issue</TooltipContent>
      </Tooltip>
    );
  }

  if (!isThisEntity || !timer) {
    return (
      <Tooltip>
        <TooltipTrigger render={
          <button
            onClick={() => void startTimer(entity, projectId)}
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
