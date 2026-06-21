import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

const VALID_STATUS = ["open", "in_progress", "ready_for_qa", "testing_completed", "for_client_approval", "ready_to_merge", "post_live_qa", "closed"] as const;
const VALID_PRIORITY = ["low", "normal", "high", "critical"] as const;
type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

// PATCH /api/v2/tasks/[taskId]
// Partial update — also the drag-and-drop endpoint (status + position).
// RLS: PM/Admin full write; developers may update tasks they're assigned to.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const patch: TaskUpdate = { updated_at: new Date().toISOString() };

  if (typeof body.title === "string") patch.title = body.title.trim();
  if ("description" in body) patch.description = body.description?.trim?.() || null;
  if (typeof body.position === "number") patch.position = body.position;
  if ("milestone_id" in body) patch.milestone_id = body.milestone_id || null;
  if ("due_date" in body) patch.due_date = body.due_date || null;
  if ("assignees" in body) patch.assignees = Array.isArray(body.assignees) ? body.assignees : null;
  if ("labels" in body) patch.labels = Array.isArray(body.labels) ? body.labels : null;
  if (typeof body.status === "string") {
    if (!(VALID_STATUS as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    patch.status = body.status as (typeof VALID_STATUS)[number];
  }
  if (typeof body.priority === "string") {
    if (!(VALID_PRIORITY as readonly string[]).includes(body.priority)) {
      return NextResponse.json({ error: "invalid priority" }, { status: 400 });
    }
    patch.priority = body.priority as (typeof VALID_PRIORITY)[number];
  }

  const { data, error } = await supabase
    .from("tasks")
    .update(patch)
    .eq("id", taskId)
    .select()
    .single();

  if (error) {
    console.error("[api/v2/tasks/[id]] patch failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
  if (!data) {
    return NextResponse.json({ error: "Task not found or not permitted" }, { status: 403 });
  }
  return NextResponse.json(data);
}

// DELETE /api/v2/tasks/[taskId]  — delete (PM/Admin via RLS; cascades subtasks)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("tasks").delete().eq("id", taskId);
  if (error) {
    console.error("[api/v2/tasks/[id]] delete failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
