import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_STATUS = ["open", "in_progress", "ready_for_qa", "testing_completed", "for_client_approval", "ready_to_merge", "post_live_qa", "closed"] as const;
const VALID_PRIORITY = ["low", "normal", "high", "critical"] as const;

// GET /api/v2/projects/[projectId]/tasks  — top-level tasks (no subtasks)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("project_id", project.id)
    .is("parent_task_id", null)
    .order("position", { ascending: true, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}

// POST /api/v2/projects/[projectId]/tasks  — create a task (PM/Admin via RLS)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  if (!body.title?.trim()) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (body.status && !VALID_STATUS.includes(body.status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  if (body.priority && !VALID_PRIORITY.includes(body.priority)) {
    return NextResponse.json({ error: "invalid priority" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("tasks")
    .insert({
      project_id: project.id,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      status: body.status || "backlog",
      priority: body.priority || "normal",
      milestone_id: body.milestone_id || null,
      due_date: body.due_date || null,
      assignees: Array.isArray(body.assignees) ? body.assignees : null,
      labels: Array.isArray(body.labels) ? body.labels : null,
      position: typeof body.position === "number" ? body.position : Date.now(),
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/v2/projects/[id]/tasks] create failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data, { status: 201 });
}
