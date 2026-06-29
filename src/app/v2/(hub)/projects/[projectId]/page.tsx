import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ProjectDetail from "./_project-detail";

export const dynamic = "force-dynamic";

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();

  if (!project) notFound();

  const [milestonesRes, tasklistsRes, tasksRes, customerRes] = await Promise.all([
    supabase
      .from("milestones")
      .select("*")
      .eq("project_id", projectId)
      .order("position", { ascending: true, nullsFirst: false }),
    supabase
      .from("tasklists")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    supabase
      .from("tasks")
      .select("*")
      .eq("project_id", projectId)
      .is("parent_task_id", null)
      .order("position", { ascending: true, nullsFirst: false }),
    supabase.from("customers").select("company_name").eq("customer_id", project.customer_id).single(),
  ]);

  return (
    <ProjectDetail
      project={project}
      companyName={customerRes.data?.company_name ?? project.customer_id}
      initialMilestones={milestonesRes.data ?? []}
      initialTasklists={tasklistsRes.data ?? []}
      initialTasks={tasksRes.data ?? []}
    />
  );
}
