import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isProjectVisibleToCurrentUser } from "@/app/(hub)/projects-old/_project-access";
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
  if (!(await isProjectVisibleToCurrentUser(project.id))) notFound();

  const { data: claimsData } = await supabase.auth.getClaims();
  const currentUserId = (claimsData?.claims?.sub as string | undefined) ?? "";
  const { data: profile } = currentUserId
    ? await supabase.from("profiles").select("role").eq("id", currentUserId).maybeSingle()
    : { data: null };
  const currentUserRole = profile?.role ?? null;

  const [{ data: task }, { data: milestones }] = await Promise.all([
    supabase.from("tasks").select("*").eq("display_id", taskId).eq("project_id", project.id).single(),
    supabase
      .from("milestones")
      .select("*")
      .eq("project_id", project.id)
      .order("position", { ascending: true, nullsFirst: false }),
  ]);

  if (!task) notFound();

  // profiles_read_own RLS only lets a non-admin caller read their own profiles row — adminClient
  // bypasses that for this read-only assignee-name display lookup (same pattern task 210 already
  // shipped for _get-project-detail-data.ts's profiles query).
  const assignees = Array.isArray(task.assignees) ? task.assignees : [];
  const { data: assigneeProfiles } =
    assignees.length > 0
      ? await adminClient.from("profiles").select("id, full_name").in("id", assignees)
      : { data: [] };

  return (
    <TaskDetailClient
      task={task}
      project={project}
      milestones={milestones ?? []}
      currentUserId={currentUserId}
      currentUserRole={currentUserRole}
      assigneeProfiles={assigneeProfiles ?? []}
    />
  );
}
