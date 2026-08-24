import { createClient } from "@/lib/supabase/server";

// Lightweight, title-only queries for generateMetadata — shared by both the legacy and v2
// project route trees since both query the same `projects`/`tasks`/`issues`/`milestones`
// schema. Deliberately separate from `_get-project-detail-data.ts`'s getProjectDetailData(),
// which fetches the full detail payload (milestones/tasklists/tasks/issues/members) — pulling
// that just to read a name would double the work generateMetadata and the page component
// already each do independently (Next.js doesn't dedupe unrelated Supabase calls across the two).

export async function getProjectNameForMetadata(projectId: string): Promise<string> {
  const supabase = await createClient();
  const { data } = await supabase.from("projects").select("name").eq("project_id", projectId).maybeSingle();
  return data?.name ?? "Project";
}

async function getProjectIdAndName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string
): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase.from("projects").select("id, name").eq("project_id", projectId).maybeSingle();
  return data;
}

export async function getTaskMetadataInfo(
  projectId: string,
  taskId: string
): Promise<{ taskTitle: string; projectName: string } | null> {
  const supabase = await createClient();
  const project = await getProjectIdAndName(supabase, projectId);
  if (!project) return null;

  const { data: task } = await supabase
    .from("tasks")
    .select("title")
    .eq("display_id", taskId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!task) return null;

  return { taskTitle: task.title, projectName: project.name };
}

export async function getIssueMetadataInfo(
  projectId: string,
  issueId: string
): Promise<{ issueTitle: string; projectName: string } | null> {
  const supabase = await createClient();
  const project = await getProjectIdAndName(supabase, projectId);
  if (!project) return null;

  const { data: issue } = await supabase
    .from("issues")
    .select("title")
    .eq("display_id", issueId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!issue) return null;

  return { issueTitle: issue.title, projectName: project.name };
}

export async function getMilestoneMetadataInfo(
  projectId: string,
  milestoneId: string
): Promise<{ milestoneTitle: string; projectName: string } | null> {
  const supabase = await createClient();
  const project = await getProjectIdAndName(supabase, projectId);
  if (!project) return null;

  // Milestones are keyed by UUID `id` in the route (see milestones/[milestoneId]/page.tsx),
  // not a display_id like tasks/issues, and the table column is `name`, not `title`.
  const { data: milestone } = await supabase
    .from("milestones")
    .select("name")
    .eq("id", milestoneId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!milestone) return null;

  return { milestoneTitle: milestone.name, projectName: project.name };
}
