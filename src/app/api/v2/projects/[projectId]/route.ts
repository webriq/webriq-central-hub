import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

const VALID_STATUS = ["active", "on_hold", "completed", "archived"] as const;
type ProjectUpdate = Database["public"]["Tables"]["projects"]["Update"];

// GET /api/v2/projects/[projectId]  — project + milestones + tasks
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectRes = await supabase.from("projects").select("*").eq("project_id", projectId).single();

  if (projectRes.error || !projectRes.data) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const [milestonesRes, tasksRes] = await Promise.all([
    supabase.from("milestones").select("*").eq("project_id", projectRes.data.id).order("position", { ascending: true, nullsFirst: false }),
    supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectRes.data.id)
      .is("parent_task_id", null)
      .order("position", { ascending: true, nullsFirst: false }),
  ]);

  return NextResponse.json({
    project: projectRes.data,
    milestones: milestonesRes.data ?? [],
    tasks: tasksRes.data ?? [],
  });
}

// PATCH /api/v2/projects/[projectId]  — update project (PM/Admin via RLS)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const patch: ProjectUpdate = { updated_at: new Date().toISOString() };
  if (typeof body.name === "string") patch.name = body.name.trim();
  if (typeof body.description === "string") patch.description = body.description.trim() || null;
  if (typeof body.project_type === "string") patch.project_type = body.project_type;
  if (Array.isArray(body.tags)) patch.tags = body.tags.filter((t: unknown): t is string => typeof t === "string");
  if (typeof body.status === "string") {
    if (!(VALID_STATUS as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    patch.status = body.status as (typeof VALID_STATUS)[number];
  }

  const { data, error } = await supabase
    .from("projects")
    .update(patch)
    .eq("project_id", projectId)
    .select()
    .single();

  if (error) {
    console.error("[api/v2/projects/[id]] patch failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data);
}

// DELETE /api/v2/projects/[projectId]  — delete project (PM/Admin via RLS)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("projects").delete().eq("project_id", projectId);
  if (error) {
    console.error("[api/v2/projects/[id]] delete failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
