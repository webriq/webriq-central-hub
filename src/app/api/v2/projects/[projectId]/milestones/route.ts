import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const VALID_STATUS = ["planned", "active", "completed"] as const;
const NAME_MAX = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Task 412 — resolve by the display `project_id` (the convention for every
// /api/v2/projects/[projectId]/* route), falling back to the UUID `id` so a project row
// with a null `project_id` can still be addressed.
async function resolveProject(supabase: Awaited<ReturnType<typeof createClient>>, key: string) {
  const { data } = await supabase.from("projects").select("id").eq("project_id", key).maybeSingle();
  if (data) return data;
  if (!UUID_RE.test(key)) return null;
  const { data: byId } = await supabase.from("projects").select("id").eq("id", key).maybeSingle();
  return byId;
}

// GET /api/v2/projects/[projectId]/milestones
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await resolveProject(supabase, projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("milestones")
    .select("*")
    .eq("project_id", project.id)
    .order("position", { ascending: true, nullsFirst: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}

// POST /api/v2/projects/[projectId]/milestones  — create (PM/Admin via RLS)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const project = await resolveProject(supabase, projectId);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (name.length > NAME_MAX) {
    return NextResponse.json({ error: `name must be ${NAME_MAX} characters or fewer` }, { status: 400 });
  }

  const status = body.status || "planned";
  if (!(VALID_STATUS as readonly string[]).includes(status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const startDate: string | null = body.start_date || null;
  const dueDate: string | null = body.due_date || null;
  if (startDate && dueDate && startDate > dueDate) {
    return NextResponse.json({ error: "start date must be on or before due date" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("milestones")
    .insert({
      project_id: project.id,
      name,
      description: typeof body.description === "string" ? body.description.trim() || null : null,
      start_date: startDate,
      due_date: dueDate,
      status: status as (typeof VALID_STATUS)[number],
      position: typeof body.position === "number" ? body.position : Date.now(),
      created_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/v2/milestones] create failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json(data, { status: 201 });
}
