import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { attachTaskTitle } from "@/lib/timer/serialize";
import { appendTimerEvent } from "@/lib/timer/timeline";

// POST /api/v2/timer/pause — banks elapsed seconds from the current run segment, no time_logs
// write yet (that only happens on stop).
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existing } = await supabase
    .from("active_timers")
    .select("id, task_id, status, accumulated_seconds, segment_started_at, timeline")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing?.task_id || existing.status !== "running" || !existing.segment_started_at) {
    return NextResponse.json({ error: "No running timer to pause" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const elapsed = (Date.now() - new Date(existing.segment_started_at).getTime()) / 1000;
  const { data, error } = await supabase
    .from("active_timers")
    .update({
      status: "paused",
      accumulated_seconds: existing.accumulated_seconds + Math.max(0, elapsed),
      segment_started_at: null,
      timeline: appendTimerEvent(existing.timeline, { type: "paused", at: now }),
      updated_at: now,
    })
    .eq("id", existing.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ timer: await attachTaskTitle(supabase, data) });
}
