import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/v2/tasks/[taskId]/subtasks  — children of a task
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("parent_task_id", taskId)
    .order("position", { ascending: true, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}

// POST /api/v2/tasks/[taskId]/subtasks  — create a subtask (inherits parent's project)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }

  // Resolve parent's project_id + milestone so the subtask stays consistent.
  const { data: parent, error: parentErr } = await supabase
    .from("tasks")
    .select("project_id,milestone_id")
    .eq("id", taskId)
    .single();
  if (parentErr || !parent) {
    return NextResponse.json({ error: "Parent task not found" }, { status: 404 });
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: parent.project_id,
      parent_task_id: taskId,
      milestone_id: parent.milestone_id,
      title: body.title.trim(),
      status: body.status || "backlog",
      priority: body.priority || "normal",
      position: typeof body.position === "number" ? body.position : Date.now(),
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/v2/tasks/[id]/subtasks] create failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data, { status: 201 });
}
