"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import type { Task } from "@/app/(hub)/projects-old/_pm-shared";

export const PREVIEW_LIMIT = 5;

// Open first by urgency: due date ascending (no due date last), then the Tasks tab's own order.
function byDueThenPosition(a: Task, b: Task): number {
  if (a.due_date !== b.due_date) {
    if (!a.due_date) return 1;
    if (!b.due_date) return -1;
    return a.due_date < b.due_date ? -1 : 1;
  }
  return (a.position ?? Number.MAX_SAFE_INTEGER) - (b.position ?? Number.MAX_SAFE_INTEGER);
}

// Task 479 — a project's top-level tasks for the Status Report's Tasks panel. The API already
// excludes subtasks and checklist rows, and RLS scopes test data. Fetches on mount (the panel only
// mounts when its row is expanded) and again whenever `refreshKey` changes.
export function useProjectOpenTasks(projectCode: string | null, refreshKey: number) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  // `isPending` instead of a manual loading flag — same fetch-on-mount pattern as `_status-report-tab.tsx`.
  const [loading, startTransition] = useTransition();

  useEffect(() => {
    if (!projectCode) return;
    const ctrl = new AbortController();
    startTransition(async () => {
      try {
        const res = await fetch(`/api/v2/projects/${encodeURIComponent(projectCode)}/tasks`, { signal: ctrl.signal });
        if (!res.ok) throw new Error();
        const data: Task[] = await res.json();
        setTasks(Array.isArray(data) ? data : []);
        setError(null);
      } catch {
        if (!ctrl.signal.aborted) setError("Couldn't load this project's tasks.");
      }
    });
    return () => ctrl.abort();
  }, [projectCode, refreshKey, retryKey]);

  const open = useMemo(() => tasks.filter((t) => t.status !== "closed").sort(byDueThenPosition), [tasks]);

  return {
    preview: open.slice(0, PREVIEW_LIMIT),
    openCount: open.length,
    totalCount: tasks.length,
    loading,
    error,
    retry: () => setRetryKey((k) => k + 1),
  };
}
