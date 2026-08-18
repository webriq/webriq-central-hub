import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

const VALID_STATUS = ["active", "on_hold", "completed", "archived"] as const;
// Who may soft-delete a project (task 231) — mirrors the RLS write policy
// (projects_pm_write: admin, pm) plus super_admin, the admin-plus superset already used
// elsewhere in the Projects module (e.g. canManageTags/canCreateProject).
const DELETE_ROLES = ["admin", "pm", "super_admin"] as const;
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

  const projectRes = await supabase.from("projects").select("*").eq("project_id", projectId).neq("status", "deleted").single();

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

  // Task 268 — card-title rename (hover-to-edit + kebab "Rename Project"): reject an empty name
  // outright, and reject a name that collides with any other non-deleted project (case-
  // insensitive) so the UI can offer a "search for the existing one" action instead of a
  // confusing DB-level failure.
  if (patch.name !== undefined) {
    if (!patch.name) {
      return NextResponse.json({ error: "Project name cannot be empty" }, { status: 400 });
    }
    const { data: dupe } = await supabase
      .from("projects")
      .select("id")
      .ilike("name", patch.name)
      .neq("project_id", projectId)
      .neq("status", "deleted")
      .maybeSingle();
    if (dupe) {
      return NextResponse.json({ error: "duplicate_name", name: patch.name }, { status: 409 });
    }
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

// DELETE /api/v2/projects/[projectId]  — soft delete (task 231): sets status = "deleted",
// never removes the row. Tasks/issues/time logs/onboarding data stay intact for recovery/audit.
// Task 247: also renames the project, appending `_deleted_<YYYY-MM-DD>` — makes a soft-deleted
// row unambiguous on any surface that doesn't filter status = "deleted" (task 231's own
// documented out-of-scope list), and frees the clean name for reuse by a new project.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile?.role || !(DELETE_ROLES as readonly string[]).includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted to delete projects" }, { status: 403 });
  }

  const { data: existing, error: existingError } = await supabase
    .from("projects")
    .select("status, name")
    .eq("project_id", projectId)
    .single();
  if (existingError || !existing) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }
  if (existing.status === "deleted") {
    return NextResponse.json({ error: "Project already deleted" }, { status: 400 });
  }

  const deletedName = `${existing.name}_deleted_${new Date().toISOString().slice(0, 10)}`;
  const { data, error } = await supabase
    .from("projects")
    .update({ status: "deleted", name: deletedName, updated_at: new Date().toISOString() })
    .eq("project_id", projectId)
    .select()
    .single();

  if (error) {
    console.error("[api/v2/projects/[id]] delete failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data);
}
