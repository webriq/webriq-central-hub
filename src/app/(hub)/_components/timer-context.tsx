"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { BreakType } from "@/lib/timer/constants";
import type { TimerEvent } from "@/lib/timer/timeline";
import { useBreakChime } from "./use-break-chime";
import { unlockChime } from "@/lib/timer/chime";

export type ActiveTimerRow = {
  id: string;
  task_id: string | null;
  task_title: string | null;
  task_display_id: string | null;
  issue_id: string | null;
  issue_title: string | null;
  issue_display_id: string | null;
  project_id: string | null;
  project_name: string | null;
  project_display_id: string | null;
  status: "running" | "paused" | null;
  accumulated_seconds: number;
  segment_started_at: string | null;
  break_type: BreakType | null;
  break_started_at: string | null;
  break_duration_minutes: number | null;
  // Task 439 — the session's start/pause/resume/break log, shown as the live Activity stream.
  timeline: TimerEvent[];
};

// Task 234 — widened from task-only to accept either a task or an issue.
export type TimerEntityRef = { taskId: string } | { issueId: string };

type TimerContextValue = {
  timer: ActiveTimerRow | null;
  elapsedSeconds: number;
  breakRemainingSeconds: number | null;
  nowMs: number;
  startTimer: (entity: TimerEntityRef, projectId: string) => Promise<boolean>;
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

// undefined = the request failed (leave state alone); null = the user has no timer row.
async function fetchTimer(): Promise<ActiveTimerRow | null | undefined> {
  const res = await fetch("/api/v2/timer").catch(() => null);
  if (!res?.ok) return undefined;
  return (await res.json()).timer ?? null;
}

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [timer, setTimer] = useState<ActiveTimerRow | null>(null);
  // Captured once per second in an effect (not read live via Date.now() during render, which
  // React's purity rule flags) — elapsed/remaining below are pure functions of this + `timer`.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    let cancelled = false;
    fetchTimer().then((fetched) => { if (!cancelled && fetched !== undefined) setTimer(fetched); });
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
    if (!timer?.task_id && !timer?.issue_id) return 0;
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

  // Every user action bumps the sequence before AND after its request, so a background sync
  // that started earlier (and so reflects older state) can never overwrite the newer result.
  const seqRef = useRef(0);

  const refresh = useCallback(async () => {
    const fetched = await fetchTimer();
    if (fetched !== undefined) setTimer(fetched);
  }, []);

  const act = useCallback(async (url: string, body?: unknown) => {
    seqRef.current++;
    const data = await postJson(url, body);
    seqRef.current++;
    if (data) setTimer(data.timer ?? null);
    else await refresh(); // rejected (e.g. the server already moved on) — resync instead of going stale
    return data;
  }, [refresh]);

  // Server-authoritative (task 439): GET /api/v2/timer reconciles an expired break with timestamps
  // backdated to its real expiry. The client countdown reaching zero only asks for that sooner; it
  // no longer decides anything (a closed or throttled tab can't stretch a break any more).
  const syncFromServer = useCallback(async () => {
    const seq = seqRef.current;
    const fetched = await fetchTimer();
    if (fetched !== undefined && seq === seqRef.current) setTimer(fetched);
  }, []);

  const breakExpired = breakRemainingSeconds === 0;
  useEffect(() => {
    if (!breakExpired) return;
    const first = setTimeout(() => void syncFromServer(), 0);
    const id = setInterval(() => void syncFromServer(), 5000); // retry if the server clock is a hair behind
    return () => { clearTimeout(first); clearInterval(id); };
  }, [breakExpired, syncFromServer]);

  const startTimer = useCallback(async (entity: TimerEntityRef, projectId: string) => {
    const data = await act("/api/v2/timer/start", {
      task_id: "taskId" in entity ? entity.taskId : undefined,
      issue_id: "issueId" in entity ? entity.issueId : undefined,
      project_id: projectId,
    });
    return !!data;
  }, [act]);

  const pauseTimer = useCallback(async () => { await act("/api/v2/timer/pause"); }, [act]);
  const resumeTimer = useCallback(async () => { await act("/api/v2/timer/resume"); }, [act]);
  const stopTimer = useCallback(async () => (await act("/api/v2/timer/stop"))?.hours ?? null, [act]);
  const startBreak = useCallback(async (type: BreakType) => {
    unlockChime(); // still inside the click gesture — lets the chimes play later
    await act("/api/v2/timer/break/start", { break_type: type });
  }, [act]);
  const cancelBreak = useCallback(async () => { await act("/api/v2/timer/break/cancel"); }, [act]);

  useBreakChime(timer, breakRemainingSeconds, now);

  const value = useMemo<TimerContextValue>(() => ({
    timer, elapsedSeconds, breakRemainingSeconds, nowMs: now,
    startTimer, pauseTimer, resumeTimer, stopTimer, startBreak, cancelBreak,
  }), [timer, elapsedSeconds, breakRemainingSeconds, now, startTimer, pauseTimer, resumeTimer, stopTimer, startBreak, cancelBreak]);

  return <TimerContext.Provider value={value}>{children}</TimerContext.Provider>;
}

export function useTimer(): TimerContextValue {
  const ctx = useContext(TimerContext);
  if (!ctx) throw new Error("useTimer must be used within a TimerProvider");
  return ctx;
}
