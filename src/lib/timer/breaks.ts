import type { SupabaseClient } from "@supabase/supabase-js";
import { BREAK_DURATIONS_MIN, type BreakType } from "./constants";

// Task 439 — durable per-break records (timer_breaks, migration 168). Every helper is non-fatal:
// the live timer must keep working before the migration is applied, so a failed write only warns.

function warn(op: string, message: string) {
  console.warn(`[timer/breaks] ${op} skipped: ${message}`);
}

export type BreakEndReason = "expired" | "manual" | "stopped";

export async function openBreakRecord(
  supabase: SupabaseClient,
  input: { userId: string; breakType: BreakType; startedAt: string; taskId: string | null; issueId: string | null; projectId: string | null },
): Promise<void> {
  const { error } = await supabase.from("timer_breaks").insert({
    user_id: input.userId,
    break_type: input.breakType,
    planned_minutes: BREAK_DURATIONS_MIN[input.breakType],
    started_at: input.startedAt,
    task_id: input.taskId,
    issue_id: input.issueId,
    project_id: input.projectId,
  });
  if (error) warn("open", error.message);
}

export async function closeBreakRecord(
  supabase: SupabaseClient,
  userId: string,
  endedAt: string,
  reason: BreakEndReason,
): Promise<void> {
  const { error } = await supabase
    .from("timer_breaks")
    .update({ ended_at: endedAt, end_reason: reason })
    .eq("user_id", userId)
    .is("ended_at", null);
  if (error) warn("close", error.message);
}

// On Stop: attach the session's finished breaks to the new time_logs row.
export async function linkBreaksToLog(
  supabase: SupabaseClient,
  userId: string,
  timeLogId: string,
  sessionStartedAt: string,
): Promise<void> {
  const { error } = await supabase
    .from("timer_breaks")
    .update({ time_log_id: timeLogId })
    .eq("user_id", userId)
    .is("time_log_id", null)
    .not("ended_at", "is", null)
    .gte("started_at", sessionStartedAt);
  if (error) warn("link", error.message);
}
