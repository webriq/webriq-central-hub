import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { asTestRole } from "@/lib/test-data";
import { touchProject } from "@/lib/projects/touch-project";

// PATCH /api/v2/tasklists/[tasklistId] — task 487: reorder a task list and/or move it to another phase.
// Body: { position?: number, milestone_id?: string | null }. pm/admin/super_admin only (tasklists_pm_write RLS).
// A phase change also moves the list's tasks' milestone_id, keeping the "task inherits its list's phase" invariant.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ tasklistId: string }> }) {
  const { tasklistId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const hasPosition = typeof body.position === "number" && Number.isFinite(body.position);
  const hasMilestone = "milestone_id" in body;
  if (!hasPosition && !hasMilestone) return NextResponse.json({ error: "position or milestone_id is required" }, { status: 400 });
  if (hasMilestone && body.milestone_id !== null && typeof body.milestone_id !== "string") {
    return NextResponse.json({ error: "milestone_id must be an id or null" }, { status: 400 });
  }

  const [{ data: list }, { data: profileRow }] = await Promise.all([
    supabase.from("tasklists").select("project_id, milestone_id").eq("id", tasklistId).maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);
  if (!list) return NextResponse.json({ error: "Task list not found" }, { status: 404 });
  const profile = await asTestRole(profileRow, user.id, { projectId: list.project_id });
  if (!profile || !["admin", "super_admin", "pm"].includes(profile.role)) {
    return NextResponse.json({ error: "Only PMs and admins can rearrange task lists" }, { status: 403 });
  }

  const milestoneId: string | null = hasMilestone ? body.milestone_id : list.milestone_id;
  if (hasMilestone && milestoneId) {
    const { data: m } = await supabase.from("milestones").select("project_id").eq("id", milestoneId).maybeSingle();
    if (m?.project_id !== list.project_id) return NextResponse.json({ error: "Phase is not in this project" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("tasklists")
    .update({
      ...(hasPosition ? { position: body.position } : {}),
      ...(hasMilestone ? { milestone_id: milestoneId } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", tasklistId)
    .select()
    .single();
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Not permitted" }, { status: 403 });

  if (hasMilestone && milestoneId !== list.milestone_id) {
    const { error: taskErr } = await supabase.from("tasks").update({ milestone_id: milestoneId }).eq("tasklist_id", tasklistId);
    if (taskErr) console.error("[api/v2/tasklists/[id]] task phase sync failed:", taskErr.message);
    touchProject(list.project_id);
  }
  return NextResponse.json(data);
}
