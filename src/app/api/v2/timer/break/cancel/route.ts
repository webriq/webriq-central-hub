import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { attachTaskTitle } from "@/lib/timer/serialize";
import { loadReconciledTimer } from "@/lib/timer/reconcile-apply";
import { closeBreakRecord } from "@/lib/timer/breaks";
import { appendTimerEvent } from "@/lib/timer/timeline";

// POST /api/v2/timer/break/cancel — ends the active break manually (the developer ended it early).
// Idempotent: the countdown reaching zero is resolved server-side by loadReconciledTimer() with
// timestamps backdated to the real expiry (task 439), so by the time this runs for an expired
// break there is nothing left to end and the current timer is simply returned. This route used to
// stamp "now" on break_end/resumed whenever a tab finally called it — that is what dropped the
// time after expiry from a user's logged work.
// If an entity timer (task OR issue — task 345) exists underneath and is manually paused, it
// auto-resumes as part of the same update (task 265). Deletes the row only in the break-only case
// (no entity timer underneath).
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const existing = await loadReconciledTimer(supabase, user.id);
  if (!existing?.break_type) {
    return NextResponse.json({ timer: await attachTaskTitle(supabase, existing) });
  }

  const now = new Date().toISOString();

  // Task 345 — break-only row (no entity timer underneath) is deleted outright; an entity timer
  // is a task OR an issue. Guarding on task_id alone destroyed the active_timers row for every
  // issue timer on break-end (losing the un-logged elapsed time).
  if (!existing.task_id && !existing.issue_id) {
    const { error } = await supabase.from("active_timers").delete().eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    await closeBreakRecord(supabase, user.id, now, "manual");
    return NextResponse.json({ timer: null });
  }

  const shouldResume = existing.status === "paused";
  let timeline = appendTimerEvent(existing.timeline, { type: "break_end", at: now });
  if (shouldResume) timeline = appendTimerEvent(timeline, { type: "resumed", at: now });

  const { data, error } = await supabase
    .from("active_timers")
    .update({
      break_type: null,
      break_started_at: null,
      break_duration_minutes: null,
      ...(shouldResume ? { status: "running", segment_started_at: now } : {}),
      timeline,
      updated_at: now,
    })
    .eq("id", existing.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  await closeBreakRecord(supabase, user.id, now, "manual");
  return NextResponse.json({ timer: await attachTaskTitle(supabase, data) });
}
