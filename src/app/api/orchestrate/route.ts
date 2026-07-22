import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { runOrchestration, type OrchestrationProject } from "@/lib/pipeline/orchestrate";

// Only task_id/title/description come from the caller — project config (sanity_project_id,
// github_repo, etc.) is always re-derived from the DB row for project.id below, never trusted
// from the request body, so a caller can't redirect execution at an arbitrary Sanity/GitHub target.
const PostSchema = z.object({
  task_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  project: z.object({ id: z.string().uuid() }),
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: callerProfile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["pm", "admin", "super_admin"].includes(callerProfile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { task_id, title, description, project: projectInput } = parsed.data;

  const { data: projectRow, error: projectErr } = await adminClient
    .from("projects")
    .select("id, sanity_project_id, dataset, vercel_project_id, github_repo")
    .eq("id", projectInput.id)
    .maybeSingle();

  if (projectErr || !projectRow) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const project: OrchestrationProject = {
    id: projectRow.id,
    sanity_project_id: projectRow.sanity_project_id ?? undefined,
    dataset: projectRow.dataset ?? undefined,
    vercel_project_id: projectRow.vercel_project_id ?? undefined,
    github_repo: projectRow.github_repo ?? undefined,
  };

  const result = await runOrchestration({
    task_id,
    title,
    description,
    project,
    userId: user.id,
    userEmail: user.email,
  });

  if (result.error) {
    const status =
      result.error === "Project not found" ? 404 :
      result.error === "Classification failed" ? 500 :
      result.error === "No Sanity project configured for this project" ? 422 : 500;
    return NextResponse.json({ error: result.error }, { status });
  }

  return NextResponse.json(result);
}
