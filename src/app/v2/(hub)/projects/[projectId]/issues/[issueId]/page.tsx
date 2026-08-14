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

  return (
    <IssueDetailClient
      issue={issue}
      project={project}
      allMembers={allMembers ?? []}
      currentUserId={currentUserId}
      currentUserRole={currentUserRole}
    />
  );
}
