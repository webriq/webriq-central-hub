import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// PATCH/DELETE a single time_logs entry (task 214; task 215 moves editing from a raw hours
// number to a start_time/end_time period, hours always recomputed server-side). Ownership is
// already enforced at the DB layer by `time_logs_developer_own` (migration 026 — employee_id =
// auth.uid()), but this route checks ownership explicitly first so a non-owner gets a clean 403
// instead of a silent 0-row update/delete. PATCH never touches `timeline` — a corrected period
// on a timer-sourced entry leaves that entry's recorded event history untouched (task 215
// Decision: edits correct the displayed period, not the historical record of what happened).
async function requireOwnRow(
  supabase: Awaited<ReturnType<typeof createClient>>,
  taskId: string,
  timeLogId: string,
  userId: string
) {
  const { data: row } = await supabase
    .from("time_logs")
    .select("id, employee_id")
    .eq("id", timeLogId)
    .eq("task_id", taskId)
    .maybeSingle();
  if (!row) return { error: NextResponse.json({ error: "Time log not found" }, { status: 404 }) };
  if (row.employee_id !== userId) {
    return { error: NextResponse.json({ error: "You can only edit your own time logs" }, { status: 403 }) };
  }
  return { error: null };
}

// PATCH /api/v2/tasks/[taskId]/time-logs/[timeLogId] — owner-only edit
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string; timeLogId: string }> }
) {
  const { taskId, timeLogId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error: ownError } = await requireOwnRow(supabase, taskId, timeLogId, user.id);
  if (ownError) return ownError;

  const body = await req.json().catch(() => ({}));
  const dateLogged = typeof body.date_logged === "string" ? body.date_logged : "";
  const startTime = typeof body.start_time === "string" ? body.start_time : "";
  const endTime = typeof body.end_time === "string" ? body.end_time : "";
  if (!dateLogged || !startTime || !endTime) {
    return NextResponse.json({ error: "date_logged, start_time, and end_time are required" }, { status: 400 });
  }

  const hours = (new Date(endTime).getTime() - new Date(startTime).getTime()) / 3_600_000;
  if (!(hours > 0) || hours > 24) {
    return NextResponse.json({ error: "End time must be after start time, and no more than 24 hours later" }, { status: 400 });
  }

  const patch = {
    date_logged: dateLogged,
    start_time: startTime,
    end_time: endTime,
    hours,
    note: typeof body.note === "string" && body.note.trim() ? body.note.trim() : null,
  };

  const { data: updated, error } = await supabase
    .from("time_logs")
    .update(patch)
    .eq("id", timeLogId)
    .select("id, date_logged, hours, note, source, start_time, end_time, timeline, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ...updated, can_edit: true });
}

// DELETE /api/v2/tasks/[taskId]/time-logs/[timeLogId] — owner-only delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string; timeLogId: string }> }
) {
  const { taskId, timeLogId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error: ownError } = await requireOwnRow(supabase, taskId, timeLogId, user.id);
  if (ownError) return ownError;

  const { error } = await supabase.from("time_logs").delete().eq("id", timeLogId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
