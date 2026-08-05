import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { attachTaskTitle } from "@/lib/timer/serialize";

// POST /api/v2/timer/stop — computes final hours server-side (never trust a client-supplied
// duration), logs to time_logs, then clears the timer portion of the row. If a break is still
// active, the row survives with only its break_* fields (a break can outlive the task timer
// that triggered it); otherwise the row is deleted.
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existing } = await supabase
    .from("active_timers")
    .select("id, task_id, project_id, status, accumulated_seconds, segment_started_at, break_type")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing?.task_id || !existing.project_id) {
    return NextResponse.json({ error: "No active timer to stop" }, { status: 400 });
  }

  const runningSeconds =
    existing.status === "running" && existing.segment_started_at
      ? Math.max(0, (Date.now() - new Date(existing.segment_started_at).getTime()) / 1000)
      : 0;
  const totalSeconds = existing.accumulated_seconds + runningSeconds;
  const hours = totalSeconds / 3600;

  if (hours > 0) {
    const { error: logError } = await supabase.from("time_logs").insert({
      task_id: existing.task_id,
      project_id: existing.project_id,
      employee_id: user.id,
      date_logged: new Date().toISOString().slice(0, 10),
      hours,
      source: "timer",
      billable: false,
    });
    if (logError) {
      console.error("[api/v2/timer/stop] time_logs insert failed:", logError.message);
      return NextResponse.json({ error: logError.message }, { status: 400 });
    }
  }

  if (existing.break_type) {
    const { data, error } = await supabase
      .from("active_timers")
      .update({
        task_id: null,
        project_id: null,
        status: null,
        accumulated_seconds: 0,
        segment_started_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ hours, timer: await attachTaskTitle(supabase, data) });
  }

  const { error: deleteError } = await supabase.from("active_timers").delete().eq("id", existing.id);
  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });
  return NextResponse.json({ hours, timer: null });
}
