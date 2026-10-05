"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import { toLiveStatus, type LiveStatus } from "./_live-updates";

type Milestone = Database["public"]["Tables"]["milestones"]["Row"];
type Tasklist = Database["public"]["Tables"]["tasklists"]["Row"];
type Task = Database["public"]["Tables"]["tasks"]["Row"];
type Payload = RealtimePostgresChangesPayload<Record<string, unknown>>;

// Insert/update upserts by id; delete removes by `old.id` (a DELETE payload only carries the key).
function merge<T extends { id: string }>(prev: T[], payload: Payload): T[] {
  if (payload.eventType === "DELETE") {
    const id = (payload.old as { id?: string } | undefined)?.id;
    return id ? prev.filter((r) => r.id !== id) : prev;
  }
  const row = payload.new as unknown as T;
  if (!row?.id) return prev;
  const idx = prev.findIndex((r) => r.id === row.id);
  if (idx === -1) return [...prev, row];
  const next = [...prev];
  next[idx] = row;
  return next;
}

// Task 422 — live milestones/tasklists/tasks for the generic Timeline, mirroring the StackShift
// view's customer_phases channel. Task 427: milestones/tasklists are now `project_phases` /
// `project_deliverables` — the legacy names are compat VIEWS, and a view cannot be published, so a
// binding to one makes the whole channel fail. Needs the three tables in `supabase_realtime`
// (migration 159; verified live 2026-10-05).
export function useGenericRealtime(
  projectId: string,
  setters: { setMilestones: Dispatch<SetStateAction<Milestone[]>>; setTasklists: Dispatch<SetStateAction<Tasklist[]>>; setTasks: Dispatch<SetStateAction<Task[]>> }
): LiveStatus {
  const [status, setStatus] = useState<LiveStatus>("live");
  const { setMilestones, setTasklists, setTasks } = setters;

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    const filter = `project_id=eq.${projectId}`;
    const channel = supabase
      .channel(`v2_generic_${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_phases", filter }, (p) => setMilestones((prev) => merge(prev, p)))
      .on("postgres_changes", { event: "*", schema: "public", table: "project_deliverables", filter }, (p) => setTasklists((prev) => merge(prev, p)))
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter }, (p) => setTasks((prev) => merge(prev, p)))
      .subscribe((s) => {
        const next = toLiveStatus(s);
        if (!cancelled && next) setStatus(next);
      });
    return () => { cancelled = true; supabase.removeChannel(channel); };
  }, [projectId, setMilestones, setTasklists, setTasks]);

  return status;
}
