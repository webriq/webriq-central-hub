import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isProjectVisibleToCurrentUser } from "@/app/(hub)/projects-old/_project-access";
import { getAssignableMembers } from "@/lib/members/assignable";
import { ticketAssigneeIds } from "@/lib/tickets/permissions";
import { getTicketMetadataInfo } from "../../../../_shared/_get-metadata-titles";
import TicketDetailClient from "./_ticket-detail";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ projectId: string; ticketId: string }>;
}): Promise<Metadata> {
  const { projectId, ticketId } = await params;
  const info = await getTicketMetadataInfo(projectId, ticketId);
  return { title: info ? `${info.ticketTitle} - ${info.projectName}` : "Ticket Not Found" };
}

export default async function TicketDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; ticketId: string }>;
}) {
  const { projectId, ticketId } = await params;
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
    ? await supabase.from("profiles").select("role, full_name, avatar_url").eq("id", currentUserId).maybeSingle()
    : { data: null };
  const currentUserRole = profile?.role ?? null;
  const currentUserName = profile?.full_name ?? null;
  const currentUserAvatarUrl = profile?.avatar_url ?? null;

  const [{ data: ticket }, allMembers] = await Promise.all([
    supabase.from("issues").select("*").eq("display_id", ticketId).eq("project_id", project.id).single(),
    // Task 351 — assignee pool = all staff roles minus the exclude list (shared helper).
    getAssignableMembers(),
  ]);

  if (!ticket) notFound();

  // Resolve every current assignee's name/avatar even if they've since left the member pool
  // (mirrors the task-detail page's `assigneeProfiles` fetch).
  const assigneeIds = ticketAssigneeIds(ticket);
  const { data: assigneeProfiles } = assigneeIds.length > 0
    ? await adminClient.from("profiles").select("id, full_name, avatar_url").in("id", assigneeIds)
    : { data: [] };

  // Quick Access Panel (task 257, Requirement H) — other tasks/tickets assigned to the current
  // user in this project, excluding the one being viewed. Admin/PM viewers are rarely assignees
  // (see getTicketEditPermission's role model), so when both come back empty we fall back to the
  // project's other open tickets so the panel isn't empty for them.
  const [{ data: myTasks }, { data: myTickets }] = currentUserId
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
          .contains("assignees", [currentUserId])
          .neq("id", ticket.id)
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
  let quickAccessTickets = (myTickets ?? []).filter(hasDisplayId);
  if (quickAccessTasks.length === 0 && quickAccessTickets.length === 0) {
    const { data: fallbackTickets } = await supabase
      .from("issues")
      .select("id, display_id, title, status, severity")
      .eq("project_id", project.id)
      .neq("status", "closed")
      .neq("id", ticket.id)
      .order("updated_at", { ascending: false })
      .limit(8);
    quickAccessTickets = (fallbackTickets ?? []).filter(hasDisplayId);
    quickAccessTasks = [];
  }

  return (
    <TicketDetailClient
      ticket={ticket}
      project={project}
      allMembers={allMembers}
      assigneeProfiles={assigneeProfiles ?? []}
      currentUserId={currentUserId}
      currentUserRole={currentUserRole}
      currentUserName={currentUserName}
      currentUserAvatarUrl={currentUserAvatarUrl}
      quickAccessTasks={quickAccessTasks}
      quickAccessTickets={quickAccessTickets}
    />
  );
}
