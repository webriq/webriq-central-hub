"use client";

import { useState } from "react";
import { Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTimer } from "@/app/(hub)/_components/timer-context";
import { BTN_BASE, BTN_CTA } from "./_ui";
import type { DevWorkItem } from "./_types";

// Task 360 — the CTA leaf that subscribes to TimerContext outside the timer card.
//
// Deliberately its own component rather than a prop computed in `_dev-dashboard.tsx`: the
// context value is rebuilt every second (it carries `elapsedSeconds`), so any consumer re-renders
// once per second. Keeping the subscription in this leaf means the per-second tick never reaches
// the stat strip or the side panels. (An earlier `TimerRunningLabel` leaf drove the "In progress"
// stat tile's sub-line with live timer state — removed once that sub-line became a plain
// tasks/tickets breakdown of the "In progress" count, which reads confusingly less like "1 of 54
// tasks has a live timer" and more like "all 54 are being timed". The work list's per-row
// `RunningBadge` now carries the "is this the live-timed item" signal instead.)

/**
 * The screen's single orange CTA. Starts the timer on the highest-priority actionable item and
 * names that item in its tooltip, so the action is never a surprise. Hidden outright while a
 * timer is already running — the timer card owns stop/pause at that point, and two competing
 * primary actions would violate the one-CTA-per-screen rule.
 */
export function DevStartTimerButton({ target }: { target: DevWorkItem | null }) {
  const { timer, startTimer } = useTimer();
  const [busy, setBusy] = useState(false);

  const hasActive = !!timer?.task_id || !!timer?.issue_id;
  if (hasActive) return null;

  const disabled = !target || busy;

  async function onClick() {
    if (!target) return;
    setBusy(true);
    try {
      await startTimer(
        target.kind === "task" ? { taskId: target.id } : { issueId: target.id },
        target.projectId
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void onClick()}
      title={target ? `Start timer on “${target.title}”` : "Nothing assigned to start a timer on"}
      className={cn(BTN_BASE, BTN_CTA)}
    >
      <Play size={15} />
      {busy ? "Starting…" : "Start timer"}
    </button>
  );
}
