import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isProjectVisibleToCurrentUser } from "../../../_project-access";
import IssueDetailClient from "./_issue-detail";

export const dynamic = "force-dynamic";

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; issueId: string }>;
}) {
  const { projectId, issueId } = await params;
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

  const [{ data: issue }, { data: allMembers }] = await Promise.all([
    supabase.from("issues").select("*").eq("display_id", issueId).eq("project_id", project.id).single(),
    supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .in("role", ["developer", "pm", "admin", "super_admin"])
      .order("full_name", { ascending: true }),
  ]);

  if (!issue) notFound();

  // Quick Access Panel (task 257, Requirement H) — other tasks/issues assigned to the current
  // user in this project, excluding the one being viewed. Admin/PM viewers are rarely assignees
  // (see getIssueEditPermission's role model), so when both come back empty we fall back to the
  // project's other open issues so the panel isn't empty for them.
  const [{ data: myTasks }, { data: myIssues }] = currentUserId
    ? await Promise.all([
        supabase
          .from("tasks")
          .select("id, display_id, title, status")
          .eq("project_id", project.id)
          .contains("assignees", [currentUserId])
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(8),
        supabase
          .from("issues")
          .select("id, display_id, title, status, severity")
          .eq("project_id", project.id)
          .eq("assignee_id", currentUserId)
          .neq("id", issue.id)
          .order("due_date", { ascending: true, nullsFirst: false })
          .limit(8),
      ])
    : [{ data: null }, { data: null }];

  // display_id is nullable in the schema but always populated by the auto-generation trigger in
  // practice (migration 089/task 189) — filter defensively rather than widen the panel's prop type,
  // since a null display_id has no route to navigate to.
  const hasDisplayId = <T extends { display_id: string | null }>(row: T): row is T & { display_id: string } =>
    row.display_id !== null;

  let quickAccessTasks = (myTasks ?? []).filter(hasDisplayId);
  let quickAccessIssues = (myIssues ?? []).filter(hasDisplayId);
  if (quickAccessTasks.length === 0 && quickAccessIssues.length === 0) {
    const { data: fallbackIssues } = await supabase
      .from("issues")
      .select("id, display_id, title, status, severity")
      .eq("project_id", project.id)
      .neq("status", "closed")
      .neq("id", issue.id)
      .order("updated_at", { ascending: false })
      .limit(8);
    quickAccessIssues = (fallbackIssues ?? []).filter(hasDisplayId);
    quickAccessTasks = [];
  }

  return (
    <IssueDetailClient
      issue={issue}
      project={project}
      allMembers={allMembers ?? []}
      currentUserId={currentUserId}
      currentUserRole={currentUserRole}
      quickAccessTasks={quickAccessTasks}
      quickAccessIssues={quickAccessIssues}
    />
  );
}
