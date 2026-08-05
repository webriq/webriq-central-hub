"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { BreakType } from "@/lib/timer/constants";

export type ActiveTimerRow = {
  id: string;
  task_id: string | null;
  task_title: string | null;
  project_id: string | null;
  status: "running" | "paused" | null;
  accumulated_seconds: number;
  segment_started_at: string | null;
  break_type: BreakType | null;
  break_started_at: string | null;
  break_duration_minutes: number | null;
};

type TimerContextValue = {
  timer: ActiveTimerRow | null;
  elapsedSeconds: number;
  breakRemainingSeconds: number | null;
  startTimer: (taskId: string, projectId: string) => Promise<boolean>;
  pauseTimer: () => Promise<void>;
  resumeTimer: () => Promise<void>;
  stopTimer: () => Promise<number | null>;
  startBreak: (type: BreakType) => Promise<void>;
  cancelBreak: () => Promise<void>;
};

const TimerContext = createContext<TimerContextValue | null>(null);

async function postJson(url: string, body?: unknown): Promise<{ timer?: ActiveTimerRow | null; hours?: number } | null> {
  const res = await fetch(url, {
    method: "POST",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) return null;
  return res.json();
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [timer, setTimer] = useState<ActiveTimerRow | null>(null);
  // Captured once per second in an effect (not read live via Date.now() during render, which
  // React's purity rule flags) — elapsed/remaining below are pure functions of this + `timer`.
  const [now, setNow] = useState(() => Date.now());
  const cancelingBreakRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/v2/timer")
      .then((res) => (res.ok ? res.json() : { timer: null }))
      .then((data) => { if (!cancelled) setTimer(data.timer ?? null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // `now` is only ever written here (outside render) — elapsed/remaining below are always
  // recomputed from server timestamps, so a backgrounded tab self-corrects on the next tick
  // instead of drifting.
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const elapsedSeconds = useMemo(() => {
    if (!timer?.task_id) return 0;
    if (timer.status === "running" && timer.segment_started_at) {
      return timer.accumulated_seconds + Math.max(0, (now - new Date(timer.segment_started_at).getTime()) / 1000);
    }
    return timer.accumulated_seconds;
  }, [timer, now]);

  const breakRemainingSeconds = useMemo(() => {
    if (!timer?.break_type || !timer.break_started_at || !timer.break_duration_minutes) return null;
    const total = timer.break_duration_minutes * 60;
    const elapsed = (now - new Date(timer.break_started_at).getTime()) / 1000;
    return Math.max(0, total - elapsed);
  }, [timer, now]);

  const cancelBreak = useCallback(async () => {
    if (cancelingBreakRef.current) return;
    cancelingBreakRef.current = true;
    try {
      const data = await postJson("/api/v2/timer/break/cancel");
      if (data) setTimer(data.timer ?? null);
    } finally {
      cancelingBreakRef.current = false;
    }
  }, []);

  // Auto-end the break once the countdown hits zero — the timer stays paused, no auto-resume.
  useEffect(() => {
    if (breakRemainingSeconds === 0) void cancelBreak();
  }, [breakRemainingSeconds, cancelBreak]);

  const startTimer = useCallback(async (taskId: string, projectId: string) => {
    const data = await postJson("/api/v2/timer/start", { task_id: taskId, project_id: projectId });
    if (!data) return false;
    setTimer(data.timer ?? null);
    return true;
  }, []);

  const pauseTimer = useCallback(async () => {
    const data = await postJson("/api/v2/timer/pause");
    if (data) setTimer(data.timer ?? null);
  }, []);

  const resumeTimer = useCallback(async () => {
    const data = await postJson("/api/v2/timer/resume");
    if (data) setTimer(data.timer ?? null);
  }, []);

  const stopTimer = useCallback(async () => {
    const data = await postJson("/api/v2/timer/stop");
    if (!data) return null;
    setTimer(data.timer ?? null);
    return data.hours ?? null;
  }, []);

  const startBreak = useCallback(async (type: BreakType) => {
    const data = await postJson("/api/v2/timer/break/start", { break_type: type });
    if (data) setTimer(data.timer ?? null);
  }, []);

  const value = useMemo<TimerContextValue>(() => ({
    timer, elapsedSeconds, breakRemainingSeconds,
    startTimer, pauseTimer, resumeTimer, stopTimer, startBreak, cancelBreak,
  }), [timer, elapsedSeconds, breakRemainingSeconds, startTimer, pauseTimer, resumeTimer, stopTimer, startBreak, cancelBreak]);

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

export function useTimer(): TimerContextValue {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useTimer must be used within a TimerProvider");
  return ctx;
}
