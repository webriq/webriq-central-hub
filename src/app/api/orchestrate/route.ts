import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { runOrchestration } from "@/lib/pipeline/orchestrate";

const ProjectSchema = z.object({
  id: z.string().uuid(),
  sanity_project_id: z.string().optional(),
  dataset: z.string().optional(),
  vercel_project_id: z.string().optional(),
  github_repo: z.string().optional(),
});

const PostSchema = z.object({
  task_id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  project: ProjectSchema,
});

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { task_id, title, description, project } = parsed.data;

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
