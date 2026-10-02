import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// POST /api/v2/projects/[projectId]/view — task 416. Records that the current user opened this
// project (feeds the Projects listing's "Recently accessed" sort). Resolves by the display
// `project_id` like every sibling /api/v2/projects/[projectId]/* route, falling back to the UUID.
// Best-effort by design: the caller is a fire-and-forget beacon, so any recording failure
// (including migration 156 not being applied yet) returns 204 rather than an error.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: byDisplayId } = await supabase
    .from("projects")
    .select("id, status")
    .eq("project_id", projectId)
    .maybeSingle();
  const project = byDisplayId ?? (UUID_RE.test(projectId)
    ? (await supabase.from("projects").select("id, status").eq("id", projectId).maybeSingle()).data
    : null);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (project.status === "deleted") return new NextResponse(null, { status: 204 });

  const { error } = await supabase.rpc("record_project_view", { p_project_id: project.id });
  if (error) console.warn(`[project-view] record failed for ${projectId}: ${error.message}`);
  return new NextResponse(null, { status: 204 });
}
