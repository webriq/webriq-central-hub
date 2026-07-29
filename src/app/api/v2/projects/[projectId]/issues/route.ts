import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_STATUS = ["open", "in_progress", "ready_for_qa", "testing_completed", "for_client_approval", "ready_to_merge", "post_live_qa", "closed"] as const;
const VALID_SEVERITY = ["Show stopper", "Critical", "Major", "Minor", "None"] as const;

// GET /api/v2/projects/[projectId]/issues
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

// POST /api/v2/projects/[projectId]/issues  — create an issue (PM/Admin via RLS)
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

  const { data, error } = await supabase
    .from("issues")
    .insert({
      project_id: project.id,
      title: body.title.trim(),
      description: body.description?.trim() || null,
      status: body.status || "open",
      severity: body.severity || null,
      assignee_name: body.assignee_name?.trim() || null,
      assignee_email: body.assignee_email?.trim() || null,
      due_date: body.due_date || null,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/v2/projects/[id]/issues] create failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data, { status: 201 });
}
