import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { attachTaskTitle } from "@/lib/timer/serialize";
import type { TimerEvent } from "@/lib/timer/timeline";

// POST /api/v2/timer/start { task_id, project_id } or { issue_id, project_id }
// Starts a fresh timer for the current user. Exactly one of task_id/issue_id must be given (task
// 234 widens this from task-only to also accept an issue). Only one timer may be active at a
// time — 409 if a row already exists (caller must stop/resume it first, enforced client-side too
// by disabling Play on every other task/issue while one is active).
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const taskId = typeof body.task_id === "string" ? body.task_id : null;
  const issueId = typeof body.issue_id === "string" ? body.issue_id : null;
  const projectId = typeof body.project_id === "string" ? body.project_id : null;
  if (!projectId || (!taskId && !issueId) || (taskId && issueId)) {
    return NextResponse.json({ error: "project_id and exactly one of task_id/issue_id are required" }, { status: 400 });
  }

  if (taskId) {
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
  } else {
    const { data: issue } = await supabase
      .from("issues")
      .select("id, assignee_id, project_id")
      .eq("id", issueId as string)
      .eq("project_id", projectId)
      .maybeSingle();
    if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
    if (issue.assignee_id !== user.id) {
      return NextResponse.json({ error: "You must be assigned to this issue to time it" }, { status: 403 });
    }
  }

  const { data: existing } = await supabase
    .from("active_timers")
    .select("id, task_id, issue_id, break_type")
    .eq("user_id", user.id)
    .maybeSingle();
  if (existing?.task_id || existing?.issue_id) {
    return NextResponse.json({ error: "A timer is already active — stop it first" }, { status: 409 });
  }
  if (existing?.break_type) {
    return NextResponse.json({ error: "End your current break before starting a timer" }, { status: 409 });
  }

  const now = new Date().toISOString();
  // Fresh session — timeline resets to a single "started" event, mirroring the existing
  // accumulated_seconds: 0 reset when reusing a break-only row (task 215).
  const timeline: TimerEvent[] = [{ type: "started", at: now }];
  const payload = {
    task_id: taskId,
    issue_id: issueId,
    project_id: projectId,
    status: "running" as const,
    accumulated_seconds: 0,
    segment_started_at: now,
    timeline,
  };
  const { data, error } = existing
    ? await supabase
        .from("active_timers")
        .update({ ...payload, updated_at: now })
        .eq("id", existing.id)
        .select()
        .single()
    : await supabase
        .from("active_timers")
        .insert({ user_id: user.id, ...payload })
        .select()
        .single();

  if (error) {
    console.error("[api/v2/timer/start] failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ timer: await attachTaskTitle(supabase, data) }, { status: 201 });
}
