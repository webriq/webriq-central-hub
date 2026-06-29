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

  const [{ data: task }, { data: project }, { data: milestones }] = await Promise.all([
    supabase.from("tasks").select("*").eq("id", taskId).single(),
    supabase.from("projects").select("id, name, customer_id").eq("id", projectId).single(),
    supabase
      .from("milestones")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true, nullsFirst: false }),
  ]);

  if (!task || !project) notFound();

  return (
    <TaskDetailClient
      task={task}
      project={project}
      milestones={milestones ?? []}
    />
  );
}
