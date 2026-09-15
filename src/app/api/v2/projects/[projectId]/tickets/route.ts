import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { addProjectMember } from "@/lib/programme/phase-membership";
import { buildTicketAssigneeSync } from "@/lib/tickets/assignee-sync";

const VALID_STATUS = ["open", "in_progress", "ready_for_qa", "testing_completed", "for_client_approval", "ready_to_merge", "post_live_qa", "closed"] as const;
const VALID_SEVERITY = ["Show stopper", "Critical", "Major", "Minor", "None"] as const;

// GET /api/v2/projects/[projectId]/tickets
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
    .from("issues")
    .select("*")
    .eq("project_id", project.id)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}

// POST /api/v2/projects/[projectId]/tickets  — create an ticket (PM/Admin via RLS)
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
  if (body.severity && !VALID_SEVERITY.includes(body.severity)) {
    return NextResponse.json({ error: "invalid severity" }, { status: 400 });
  }

  // Task 351 — tickets are multi-assignee (`tickets.assignees`). New callers send `assignees: []`;
  // the legacy `assignee_name`/`assignee_email` free-text path is still accepted for anything
  // not yet migrated. The scalar `assignee_id`/`assignee_name` columns are derived from the array.
  const sync = "assignees" in body
    ? await buildTicketAssigneeSync(supabase, body.assignees)
    : { assignees: [], assignee_id: null, assignee_name: body.assignee_name?.trim() || null, assignee_email: body.assignee_email?.trim() || null };

  const { data, error } = await supabase
    .from("issues")
    .insert({
      project_id: project.id,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      status: body.status || "open",
      severity: body.severity || null,
      assignees: sync.assignees.length > 0 ? sync.assignees : null,
      assignee_id: sync.assignee_id,
      assignee_name: sync.assignee_name,
      assignee_email: sync.assignee_email,
      due_date: body.due_date || null,
      due_time: body.due_time || null,
      notes: body.notes?.trim() || null,
      // Task 363 — set when this ticket was filed from a Desk ticket thread message (the "File a
      // Ticket" flow). The FK constraint (migration 137) rejects a bad/nonexistent ticket id.
      source_ticket_id: body.source_ticket_id || null,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/v2/projects/[id]/tickets] create failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Task 287 / 351 — each assignee gets persistent project access. Best-effort.
  if (sync.assignees.length > 0) {
    await Promise.all(sync.assignees.map((id) => addProjectMember(project.id, id, user.id)))
      .catch((err) => console.error("[api/v2/projects/[id]/tickets] project_members sync failed:", err));
  }

  return NextResponse.json(data, { status: 201 });
}
