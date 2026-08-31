import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";
import { getTaskEditPermission } from "@/lib/tasks/permissions";
import { addProjectMember } from "@/lib/programme/phase-membership";

const VALID_STATUS = ["open", "in_progress", "ready_for_qa", "testing_completed", "for_client_approval", "ready_to_merge", "post_live_qa", "closed"] as const;
const VALID_PRIORITY = ["low", "normal", "high", "critical"] as const;
type TaskUpdate = Database["public"]["Tables"]["tasks"]["Update"];

// Task 209 — fields an assignee-only developer (not the creator) may still touch: status
// (value-restricted separately, see getTaskEditPermission) and position, since drag-and-drop
// board moves always send both together and position alone is cosmetic ordering, not a "detail".
const ASSIGNEE_ALLOWED_FIELDS = new Set(["status", "position"]);

// PATCH /api/v2/tasks/[taskId]
// Partial update — also the drag-and-drop endpoint (status + position).
// RLS: PM/Admin full write; developers may write to tasks they created or are assigned to
// (migration 092) — but field/value restriction for the assignee-only case is enforced here,
// via getTaskEditPermission (single source of truth, shared with the client-side UI gating).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: existingTask }, { data: profile }] = await Promise.all([
    supabase.from("tasks").select("created_by, assignees, project_id").eq("id", taskId).maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);
  if (!existingTask) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const perm = getTaskEditPermission(profile?.role, user.id, existingTask);
  if (!perm.canChangeStatus && !perm.canEditDetails) {
    return NextResponse.json({ error: "You don't have permission to edit this task" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));

  if (!perm.canEditDetails) {
    const submittedFields = Object.keys(body);
    const disallowed = submittedFields.filter((f) => !ASSIGNEE_ALLOWED_FIELDS.has(f));
    if (disallowed.length > 0) {
      return NextResponse.json({ error: `Not permitted to edit: ${disallowed.join(", ")}` }, { status: 403 });
    }
  }

  const patch: TaskUpdate = { updated_at: new Date().toISOString() };

  if (perm.canEditDetails) {
    if (typeof body.title === "string") patch.title = body.title.trim();
    if ("description" in body) patch.description = body.description?.trim?.() || null;
    if ("milestone_id" in body) patch.milestone_id = body.milestone_id || null;
    if ("due_date" in body) patch.due_date = body.due_date || null;
    // Task 338 — `start_date` and `estimate_hours` were already being sent by the Task Detail
    // page (`_task-detail.tsx`) but were silently dropped here (never mapped into `patch`),
    // so those edits no-op'd. Also surface `start_time` / `due_time` / `notes` (task 274's
    // migration-110 columns) now that Task Detail edits them.
    if ("start_date" in body) patch.start_date = body.start_date || null;
    if ("start_time" in body) patch.start_time = body.start_time || null;
    if ("due_time" in body) patch.due_time = body.due_time || null;
    if ("notes" in body) patch.notes = body.notes?.trim?.() || null;
    if ("estimate_hours" in body) {
      patch.estimate_hours = typeof body.estimate_hours === "number" && Number.isFinite(body.estimate_hours)
        ? body.estimate_hours
        : null;
    }
    if ("assignees" in body) {
      patch.assignees = Array.isArray(body.assignees) ? body.assignees : null;
      // Task 287 — reassigning a task grants each new assignee persistent project access
      // (project_members), so it survives the task being unassigned/deleted later.
      if (patch.assignees && patch.assignees.length > 0) {
        void Promise.all(
          patch.assignees.map((assigneeId) => addProjectMember(existingTask.project_id, assigneeId, user.id))
        ).catch((err) => console.error("[api/v2/tasks/[id]] project_members sync failed:", err));
      }
    }
    if ("labels" in body) patch.labels = Array.isArray(body.labels) ? body.labels : null;
    if (typeof body.priority === "string") {
      if (!(VALID_PRIORITY as readonly string[]).includes(body.priority)) {
        return NextResponse.json({ error: "invalid priority" }, { status: 400 });
      }
      patch.priority = body.priority as (typeof VALID_PRIORITY)[number];
    }
  }
  if (typeof body.position === "number") patch.position = body.position;
  if (typeof body.status === "string") {
    if (!(VALID_STATUS as readonly string[]).includes(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }
    if (perm.allowedStatusValues !== "all" && !perm.allowedStatusValues.includes(body.status as (typeof VALID_STATUS)[number])) {
      return NextResponse.json({ error: "Not permitted to set this status" }, { status: 403 });
    }
    patch.status = body.status as (typeof VALID_STATUS)[number];
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

// DELETE /api/v2/tasks/[taskId]  — delete (PM/Admin or the task's creator via RLS; migration 111; cascades subtasks)
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
