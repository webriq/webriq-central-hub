"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { BREAK_WARNING_MINUTES } from "@/lib/timer/constants";
import { playChime, unlockChime } from "@/lib/timer/chime";
import type { ActiveTimerRow } from "./timer-context";

// A warning can be missed by up to ~a minute when the browser throttles a hidden tab's timers.
const WARNING_WINDOW_SECONDS = 90;

// Audible + toast cues around a break: a heads-up before it ends (10 min of a meal break, 5 of a
// coffee break) and a ring when it ends. The server resumes the task/ticket timer at expiry
// (task 439); this only tells the person. The end cue also fires when the server cleared the break
// before the local countdown reached zero (hidden tab), by remembering the break that just ended.
export function useBreakChime(timer: ActiveTimerRow | null, remainingSeconds: number | null, nowMs: number) {
  const fired = useRef(new Set<string>());
  const lastBreak = useRef<{ startedAt: string; expiryMs: number } | null>(null);

  // A reload loses the audio permission; the first interaction on the page restores it.
  useEffect(() => {
    const unlock = () => unlockChime();
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const ring = (key: string, description: string) => {
      if (fired.current.has(key)) return;
      fired.current.add(key);
      playChime("end");
      toast.success("Break over", { description });
    };

    const breakType = timer?.break_type;
    const startedAt = timer?.break_started_at;
    if (breakType && startedAt && timer.break_duration_minutes) {
      lastBreak.current = { startedAt, expiryMs: new Date(startedAt).getTime() + timer.break_duration_minutes * 60_000 };
      const warnMinutes = BREAK_WARNING_MINUTES[breakType];
      const warnKey = `${startedAt}:warn`;
      if (warnMinutes && remainingSeconds !== null && remainingSeconds > 0 && !fired.current.has(warnKey)) {
        const threshold = warnMinutes * 60;
        if (remainingSeconds <= threshold && remainingSeconds > threshold - WARNING_WINDOW_SECONDS) {
          fired.current.add(warnKey);
          playChime("warning");
          toast.info(`Break ends in ${warnMinutes} minutes`, { description: "Your timer will resume automatically." });
        }
      }
      if (remainingSeconds === 0) ring(`${startedAt}:end`, "Your timer is running again.");
      return;
    }

    // Break row gone: ring only if it ended because it ran out, not because it was ended early.
    const ended = lastBreak.current;
    lastBreak.current = null;
    if (ended && nowMs >= ended.expiryMs - 1000) {
      ring(`${ended.startedAt}:end`, timer?.status === "running" ? "Your timer is running again." : "Your break has ended.");
    }
  }, [timer, remainingSeconds, nowMs]);
}
