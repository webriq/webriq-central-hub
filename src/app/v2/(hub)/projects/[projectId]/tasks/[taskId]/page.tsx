import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import TaskDetailClient from "./_task-detail";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; taskId: string }>;
}) {
  const { projectId, taskId } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, customer_id, project_id")
    .eq("project_id", projectId)
    .single();

  if (!project) notFound();

  const [{ data: task }, { data: milestones }] = await Promise.all([
    supabase.from("tasks").select("*").eq("display_id", taskId).eq("project_id", project.id).single(),
    supabase
      .from("milestones")
      .select("*")
      .eq("project_id", project.id)
      .order("position", { ascending: true, nullsFirst: false }),
  ]);

  if (!task) notFound();

  return (
    <TaskDetailClient
      task={task}
      project={project}
      milestones={milestones ?? []}
    />
  );
}
