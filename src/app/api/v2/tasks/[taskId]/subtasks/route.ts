import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addProjectMember } from "@/lib/programme/phase-membership";
import { touchProject } from "@/lib/projects/touch-project";
import { getAssignableMembers } from "@/lib/members/assignable";
import { MAX_SUBTASK_DEPTH } from "@/lib/tasks/subtask-tree";

// GET /api/v2/tasks/[taskId]/subtasks  — children of a task
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ?tree=1 — every descendant (flat), fetched level by level; the depth cap bounds the rounds.
  if (req.nextUrl.searchParams.get("tree") === "1") {
    const all: unknown[] = [];
    let ids = [taskId];
    for (let level = 0; level < MAX_SUBTASK_DEPTH + 1 && ids.length > 0; level++) {
      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .in("parent_task_id", ids)
        .order("position", { ascending: true, nullsFirst: false });
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
      all.push(...(data ?? []));
      ids = (data ?? []).map((t) => t.id);
    }
    return NextResponse.json(all);
  }

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("parent_task_id", taskId)
    .order("position", { ascending: true, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}

const VALID_STATUS = ["open", "in_progress", "ready_for_qa", "testing_completed", "for_client_approval", "ready_to_merge", "post_live_qa", "closed"];
const VALID_PRIORITY = ["low", "normal", "high", "critical"];

// POST /api/v2/tasks/[taskId]/subtasks  — create a subtask. Accepts the same fields as creating a task; project is the
// parent's, and milestone / tasklist / priority default to the parent's when omitted.
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
  if (body.status && !VALID_STATUS.includes(body.status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }
  if (body.priority && !VALID_PRIORITY.includes(body.priority)) {
    return NextResponse.json({ error: "invalid priority" }, { status: 400 });
  }

  // Resolve the parent so the subtask stays consistent with it (project, phase, tasklist, depth).
  const { data: parent, error: parentErr } = await supabase
    .from("tasks")
    .select("project_id,milestone_id,tasklist_id,priority,depth,kind,assignees,due_date")
    .eq("id", taskId)
    .single();
  if (parentErr || !parent) {
    return NextResponse.json({ error: "Parent task not found" }, { status: 404 });
  }
  if (parent.kind && parent.kind !== "task") {
    return NextResponse.json({ error: "Checklist items cannot have subtasks" }, { status: 400 });
  }
  const depth = (parent.depth ?? 0) + 1;
  if (depth > MAX_SUBTASK_DEPTH) {
    return NextResponse.json({ error: `Subtasks can be nested at most ${MAX_SUBTASK_DEPTH} levels deep` }, { status: 400 });
  }

  // Subtask titles are unique per parent (case-insensitive).
  const { data: siblings } = await supabase.from("tasks").select("title").eq("parent_task_id", taskId);
  const wanted = body.title.trim().toLowerCase();
  if (siblings?.some((t) => t.title.trim().toLowerCase() === wanted)) {
    return NextResponse.json({ error: "A subtask with this title already exists under this parent task." }, { status: 409 });
  }

  // Task 467 — optional dates (capped to the parent's due date) and assignees.
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const startDate: string | null = body.start_date || null;
  const dueDate: string | null = body.due_date || null;
  if ((startDate && !DATE.test(startDate)) || (dueDate && !DATE.test(dueDate))) {
    return NextResponse.json({ error: "Dates must be YYYY-MM-DD" }, { status: 400 });
  }
  if (startDate && dueDate && startDate > dueDate) {
    return NextResponse.json({ error: "Start date cannot be after the due date" }, { status: 400 });
  }
  if (parent.due_date && ((dueDate ?? startDate ?? "") > parent.due_date)) {
    return NextResponse.json({ error: `Dates cannot be later than the parent task's due date (${parent.due_date})` }, { status: 400 });
  }

  const assignees: string[] = Array.isArray(body.assignees) ? [...new Set<string>(body.assignees)] : [];
  if (assignees.length > 0) {
    const allowed = new Set((await getAssignableMembers()).map((m) => m.id));
    if (assignees.some((id) => !allowed.has(id))) {
      return NextResponse.json({ error: "One or more assignees cannot be assigned" }, { status: 400 });
    }
  }
  // Anyone assigned to a subtask is also added to the parent. Done before the insert so a refused
  // parent update (RLS) stops the whole request.
  const parentAssignees: string[] = parent.assignees ?? [];
  const missing = assignees.filter((id) => !parentAssignees.includes(id));
  if (missing.length > 0) {
    const { data: updated, error: updErr } = await supabase
      .from("tasks")
      .update({ assignees: [...parentAssignees, ...missing] })
      .eq("id", taskId)
      .select("id");
    if (updErr || !updated?.length) {
      return NextResponse.json({ error: "You cannot assign users to the parent task" }, { status: 403 });
    }
  }

  // Append after the existing siblings.
  const { data: last } = await supabase
    .from("tasks")
    .select("position")
    .eq("parent_task_id", taskId)
    .order("position", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const row = {
    project_id: parent.project_id,
    parent_task_id: taskId,
    milestone_id: body.milestone_id || parent.milestone_id,
    tasklist_id: body.tasklist_id || parent.tasklist_id,
    title: body.title.trim(),
    description: body.description?.trim() || null,
    notes: body.notes?.trim() || null,
    labels: Array.isArray(body.labels) ? body.labels : null,
    start_time: body.start_time || null,
    due_time: body.due_time || null,
    status: body.status || "open",
    priority: body.priority || parent.priority || "normal",
    position: typeof body.position === "number" ? body.position : (last?.position ?? 0) + 1,
    start_date: startDate,
    due_date: dueDate,
    assignees: assignees.length > 0 ? assignees : null,
    created_by: user.id,
  };
  let { data, error } = await supabase.from("tasks").insert({ ...row, depth }).select().single();
  // Migration 042 (`depth`) not applied yet — create without it.
  if (error?.code === "42703") ({ data, error } = await supabase.from("tasks").insert(row).select().single());

  if (error) {
    console.error("[api/v2/tasks/[id]/subtasks] create failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  // Task 287 — assignees get persistent project access (best-effort, never fails creation).
  await Promise.all(assignees.map((id) => addProjectMember(parent.project_id, id, user.id)))
    .catch((err) => console.error("[api/v2/tasks/[id]/subtasks] project_members sync failed:", err));
  touchProject(parent.project_id);
  return NextResponse.json(data, { status: 201 });
}
