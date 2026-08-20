import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isProjectVisibleToCurrentUser } from "@/app/(hub)/projects-old/_project-access";
import MilestoneDetailClient from "./_milestone-detail";

export const dynamic = "force-dynamic";

export default async function MilestoneDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; milestoneId: string }>;
}) {
  const { projectId, milestoneId } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, customer_id, project_id")
    .eq("project_id", projectId)
    .single();

  if (!project) notFound();
  if (!(await isProjectVisibleToCurrentUser(project.id))) notFound();

  const [{ data: milestone }, { data: linkedTasks }] = await Promise.all([
    supabase.from("milestones").select("*").eq("id", milestoneId).eq("project_id", project.id).single(),
    supabase
      .from("tasks")
      .select("*")
      .eq("milestone_id", milestoneId)
      .order("position", { ascending: true, nullsFirst: false }),
  ]);

  if (!milestone) notFound();

  return (
    <MilestoneDetailClient
      milestone={milestone}
      project={project}
      linkedTasks={linkedTasks ?? []}
    />
  );
}
