import { createClient } from "@/lib/supabase/server";

// Lightweight, title-only queries for generateMetadata — shared by both the legacy and v2
// project route trees since both query the same `projects`/`tasks`/`tickets`/`milestones`
// schema. Deliberately separate from `_get-project-detail-data.ts`'s getProjectDetailData(),
// which fetches the full detail payload (milestones/tasklists/tasks/tickets/members) — pulling
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

export async function getTicketMetadataInfo(
  projectId: string,
  ticketId: string
): Promise<{ ticketTitle: string; projectName: string } | null> {
  const supabase = await createClient();
  const project = await getProjectIdAndName(supabase, projectId);
  if (!project) return null;

  const { data: ticket } = await supabase
    .from("tickets")
    .select("title")
    .eq("display_id", ticketId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!ticket) return null;

  return { ticketTitle: ticket.title, projectName: project.name };
}

export async function getMilestoneMetadataInfo(
  projectId: string,
  milestoneId: string
): Promise<{ milestoneTitle: string; projectName: string } | null> {
  const supabase = await createClient();
  const project = await getProjectIdAndName(supabase, projectId);
  if (!project) return null;

  // Milestones are keyed by UUID `id` in the route (see milestones/[milestoneId]/page.tsx),
  // not a display_id like tasks/tickets, and the table column is `name`, not `title`.
  const { data: milestone } = await supabase
    .from("milestones")
    .select("name")
    .eq("id", milestoneId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!milestone) return null;

  return { milestoneTitle: milestone.name, projectName: project.name };
}
