import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/types/database";
import { closeBreakRecord } from "./breaks";
import { reconcileTimer } from "./reconcile";

// Task 439 — server-side wrapper around the pure reconcileTimer(): load the caller's
// active_timers row, apply any backdated transitions, and return the up-to-date row. Every timer
// route calls this first so correctness never depends on an open browser tab.

export type ActiveTimerRecord = Database["public"]["Tables"]["active_timers"]["Row"];

async function fetchRow(supabase: SupabaseClient, userId: string): Promise<ActiveTimerRecord | null> {
  const { data } = await supabase.from("active_timers").select("*").eq("user_id", userId).maybeSingle();
  return (data as ActiveTimerRecord | null) ?? null;
}

export async function loadReconciledTimer(supabase: SupabaseClient, userId: string): Promise<ActiveTimerRecord | null> {
  const row = await fetchRow(supabase, userId);
  if (!row) return null;

  const result = reconcileTimer(row, Date.now());
  if (!result.patch && !result.deleteRow) return row;

  // Optimistic token: only the first of several concurrent reconciles (multiple tabs) writes; the
  // rest lose the race and simply read the winner's row, so events are never appended twice.
  const guarded = supabase.from("active_timers");
  if (result.deleteRow) {
    const { data } = await guarded.delete().eq("id", row.id).eq("updated_at", row.updated_at).select("id");
    if (!data?.length) return fetchRow(supabase, userId);
    if (result.breakClosed) await closeBreakRecord(supabase, userId, result.breakClosed.endedAt, result.breakClosed.reason);
    return null;
  }

  const patch = { ...result.patch, timeline: result.patch?.timeline as Json, updated_at: new Date().toISOString() };
  const { data, error } = await guarded.update(patch).eq("id", row.id).eq("updated_at", row.updated_at).select().maybeSingle();
  if (error) {
    console.error("[timer/reconcile] write failed:", error.message);
    return row;
  }
  if (!data) return fetchRow(supabase, userId);
  if (result.breakClosed) await closeBreakRecord(supabase, userId, result.breakClosed.endedAt, result.breakClosed.reason);
  return data as ActiveTimerRecord;
}
