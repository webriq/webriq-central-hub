import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { asTestRole } from "@/lib/test-data";
import { getTaskEditPermission } from "@/lib/tasks/permissions";
import { touchProject } from "@/lib/projects/touch-project";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MISSING_FN = new Set(["42883", "PGRST202"]); // migration 184 not applied yet

const idOrNull = (v: unknown): string | null | undefined =>
  v === null || v === undefined ? null : typeof v === "string" && UUID.test(v) ? v : undefined;

// POST /api/v2/tasks/[taskId]/move — task 487. Moves a task and its subtree to another list / parent / slot.
// Body: { tasklist_id, parent_task_id, before_id, after_id } (before/after = siblings right before/after the slot).
// Editors (getTaskEditPermission.canEditDetails) may move anywhere; status-only assignees may only reorder
// among siblings. The write runs through move_task (migration 184) with adminClient — a documented exception:
// it rewrites a whole subtree the caller may not hold RLS update rights on, and the RPC is service-role-only.
export async function POST(req: NextRequest, { params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const tasklistId = idOrNull(body.tasklist_id);
  const parentId = idOrNull(body.parent_task_id);
  const beforeId = idOrNull(body.before_id);
  const afterId = idOrNull(body.after_id);
  if (!tasklistId || parentId === undefined || beforeId === undefined || afterId === undefined) {
    return NextResponse.json({ error: "tasklist_id is required; parent_task_id, before_id, after_id must be ids or null" }, { status: 400 });
  }

  // Session read on purpose: a task the caller can't see (RLS, test data) 404s before any service-role write.
  const [{ data: task }, { data: profileRow }] = await Promise.all([
    supabase.from("tasks").select("created_by, assignees, project_id, tasklist_id, parent_task_id").eq("id", taskId).maybeSingle(),
    supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
  ]);
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const profile = await asTestRole(profileRow, user.id, { projectId: task.project_id });
  const perm = getTaskEditPermission(profile?.role, user.id, task);
  const sameSlot = tasklistId === task.tasklist_id && parentId === task.parent_task_id;
  if (!perm.canEditDetails && !(perm.canChangeStatus && sameSlot)) {
    return NextResponse.json({ error: sameSlot ? "You don't have permission to move this task" : "You can only reorder this task within its list" }, { status: 403 });
  }

  // move_task isn't in the generated Database types until `supabase gen types` re-runs.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (adminClient as any).rpc("move_task", {
    p_task_id: taskId, p_tasklist_id: tasklistId, p_parent_task_id: parentId, p_before_id: beforeId, p_after_id: afterId,
  });
  if (error) {
    if (MISSING_FN.has(error.code)) return NextResponse.json({ error: "Moving between lists needs migration 184" }, { status: 503 });
    if (error.code === "23514") return NextResponse.json({ error: error.message }, { status: 400 });
    console.error("[api/v2/tasks/[id]/move] move failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  // Task 417 — a reorder is cosmetic; a new list/parent is real work on the project.
  if (!sameSlot) touchProject(task.project_id);
  return NextResponse.json(data ?? []);
}
