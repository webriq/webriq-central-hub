import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// PATCH/DELETE a single time_logs entry via its own id (task 230) — unified counterpart to
// `/api/v2/tasks/[taskId]/time-logs/[timeLogId]` (tasks 214/215, still used unmodified by the
// task-detail page's own Time Logs tab). That nested route can't reassign an entry away from its
// URL's task, and can't reach an issue-linked or task-less ("General Log") row at all — this route
// exists for exactly that: the dedicated Time Logs page's modal and inline-table editors, which
// need to create/edit/delete entries that may be task-linked, issue-linked, or neither.
//
// Ownership is enforced explicitly here (belt-and-suspenders on top of the pre-existing
// `time_logs_developer_own` RLS policy, migration 026 — employee_id = auth.uid()), matching the
// nested route's own pattern, just without a task_id in the URL to filter by.
async function requireOwnRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  timeLogId: string,
  userId: string
) {
  const { data: row } = await supabase
    .from("time_logs")
    .select("id, employee_id")
    .eq("id", timeLogId)
    .maybeSingle();
  if (!row) return { error: NextResponse.json({ error: "Time log not found" }, { status: 404 }) };
  if (row.employee_id !== userId) {
    return { error: NextResponse.json({ error: "You can only edit your own time logs" }, { status: 403 }) };
  }
  return { error: null };
}

// PATCH /api/v2/time-logs/[timeLogId] — owner-only edit, including reassigning the entry between
// a task, an issue, or a task-less/issue-less General Log (Requirement 12). Body shape mirrors
// POST /api/v2/time-logs.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ timeLogId: string }> }
) {
  const { timeLogId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error: ownError } = await requireOwnRow(supabase, timeLogId, user.id);
  if (ownError) return ownError;

  const body = await req.json().catch(() => ({}));
  const taskId = typeof body.task_id === "string" && body.task_id ? body.task_id : null;
  const issueId = typeof body.issue_id === "string" && body.issue_id ? body.issue_id : null;
  const dateLogged = typeof body.date_logged === "string" ? body.date_logged : "";
  const startTime = typeof body.start_time === "string" ? body.start_time : "";
  const endTime = typeof body.end_time === "string" ? body.end_time : "";
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
  // Task 348 — free-text title for a General Log entry (its own column, separate from `note`).
  // Forced null below for task-/issue-linked rows.
  const logTitle = typeof body.log_title === "string" && body.log_title.trim() ? body.log_title.trim() : null;
  // Task 292 — mirrors POST /api/v2/time-logs's duration_hours branch (Add/Edit modal's Duration
  // toggle); see that route for the full rationale.
  const durationHours = typeof body.duration_hours === "number" && Number.isFinite(body.duration_hours) ? body.duration_hours : null;

  if (taskId && issueId) {
    return NextResponse.json({ error: "An entry can be linked to a task or an issue, not both" }, { status: 400 });
  }
  if (!taskId && !issueId && !logTitle) {
    return NextResponse.json({ error: "A General Log entry requires a title" }, { status: 400 });
  }
  if (!dateLogged) {
    return NextResponse.json({ error: "date_logged is required" }, { status: 400 });
  }
  if (durationHours === null && (!startTime || !endTime)) {
    return NextResponse.json({ error: "start_time and end_time (or duration_hours) are required" }, { status: 400 });
  }

  if (taskId) {
    const { data: task } = await supabase.from("tasks").select("id, assignees").eq("id", taskId).maybeSingle();
    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    if (!task.assignees?.includes(user.id)) {
      return NextResponse.json({ error: "You must be assigned to this task to log time" }, { status: 403 });
    }
  } else if (issueId) {
    const { data: issue } = await supabase.from("issues").select("id").eq("id", issueId).maybeSingle();
    if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });
  }

  const hours = durationHours !== null ? durationHours : (new Date(endTime).getTime() - new Date(startTime).getTime()) / 3_600_000;
  if (!(hours > 0) || hours > 24) {
    return NextResponse.json(
      { error: durationHours !== null ? "Duration must be more than 0 and no more than 24 hours" : "End time must be after start time, and no more than 24 hours later" },
      { status: 400 }
    );
  }

  const patch = {
    task_id: taskId,
    issue_id: issueId,
    date_logged: dateLogged,
    start_time: durationHours !== null ? null : startTime,
    end_time: durationHours !== null ? null : endTime,
    hours,
    note,
    log_title: taskId || issueId ? null : logTitle,
  };

  const { data: updated, error } = await supabase
    .from("time_logs")
    .update(patch)
    .eq("id", timeLogId)
    .select("id, task_id, issue_id, project_id, date_logged, hours, note, log_title, source, start_time, end_time, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ...updated, can_edit: true });
}

// DELETE /api/v2/time-logs/[timeLogId] — owner-only delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ timeLogId: string }> }
) {
  const { timeLogId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error: ownError } = await requireOwnRow(supabase, timeLogId, user.id);
  if (ownError) return ownError;

  const { error } = await supabase.from("time_logs").delete().eq("id", timeLogId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
