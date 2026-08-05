import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { attachTaskTitle } from "@/lib/timer/serialize";
import type { TimerEvent } from "@/lib/timer/timeline";

// POST /api/v2/timer/start { task_id, project_id }
// Starts a fresh timer for the current user. Only one timer may be active at a time — 409 if
// a row already exists (caller must stop/resume it first, enforced client-side too by disabling
// Play on every other task while one is active).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "developer") {
    return NextResponse.json({ error: "Only developers can start a task timer" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const taskId = typeof body.task_id === "string" ? body.task_id : null;
  const projectId = typeof body.project_id === "string" ? body.project_id : null;
  if (!taskId || !projectId) {
    return NextResponse.json({ error: "task_id and project_id are required" }, { status: 400 });
  }

  const { data: task } = await supabase
    .from("tasks")
    .select("id, assignees, project_id")
    .eq("id", taskId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  if (!task.assignees?.includes(user.id)) {
    return NextResponse.json({ error: "You must be assigned to this task to time it" }, { status: 403 });
  }

  const { data: existing } = await supabase
    .from("active_timers")
    .select("id, task_id, break_type")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing?.task_id) {
    return NextResponse.json({ error: "A timer is already active — stop it first" }, { status: 409 });
  }
  if (existing?.break_type) {
    return NextResponse.json({ error: "End your current break before starting a timer" }, { status: 409 });
  }

  const now = new Date().toISOString();
  // Fresh session — timeline resets to a single "started" event, mirroring the existing
  // accumulated_seconds: 0 reset when reusing a break-only row (task 215).
  const timeline: TimerEvent[] = [{ type: "started", at: now }];
  const { data, error } = existing
    ? await supabase
        .from("active_timers")
        .update({ task_id: taskId, project_id: projectId, status: "running", accumulated_seconds: 0, segment_started_at: now, timeline, updated_at: now })
        .eq("id", existing.id)
        .select()
        .single()
    : await supabase
        .from("active_timers")
        .insert({ user_id: user.id, task_id: taskId, project_id: projectId, status: "running", accumulated_seconds: 0, segment_started_at: now, timeline })
        .select()
        .single();

  if (error) {
    console.error("[api/v2/timer/start] failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ timer: await attachTaskTitle(supabase, data) }, { status: 201 });
}
