import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { attachTaskTitle } from "@/lib/timer/serialize";

// POST /api/v2/timer/resume — continues a manually paused timer. Blocked while a break is
// active; the developer must end the break first (breaks never auto-resume the timer).
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: existing } = await supabase
    .from("active_timers")
    .select("id, task_id, status, break_type")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!existing?.task_id || existing.status !== "paused") {
    return NextResponse.json({ error: "No paused timer to resume" }, { status: 400 });
  }
  if (existing.break_type) {
    return NextResponse.json({ error: "End your current break before resuming the timer" }, { status: 409 });
  }

  const { data, error } = await supabase
    .from("active_timers")
    .update({ status: "running", segment_started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", existing.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ timer: await attachTaskTitle(supabase, data) });
}
