import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { attachTaskTitle } from "@/lib/timer/serialize";
import { appendTimerEvent } from "@/lib/timer/timeline";

// POST /api/v2/timer/break/cancel — ends the active break (countdown reached zero, or the
// developer ended it manually). If an entity timer (task OR issue — task 345) exists underneath
// and is currently paused, it auto-resumes as part of the same update (task 265) — the developer
// shouldn't have to hit Resume separately after a break. Deletes the row entirely only in the
// break-only case (no entity timer underneath).
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existing } = await supabase
    .from("active_timers")
    .select("id, task_id, issue_id, status, break_type, timeline")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing?.break_type) {
    return NextResponse.json({ error: "No active break" }, { status: 400 });
  }

  // Task 345 — break-only row (no entity timer underneath) is deleted outright; an entity timer
  // is a task OR an issue. Guarding on task_id alone destroyed the active_timers row for every
  // issue timer on break-end (losing the un-logged elapsed time).
  if (!existing.task_id && !existing.issue_id) {
    const { error } = await supabase.from("active_timers").delete().eq("id", existing.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ timer: null });
  }

  const now = new Date().toISOString();
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
  return NextResponse.json({ timer: await attachTaskTitle(supabase, data) });
}
