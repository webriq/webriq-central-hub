import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// DELETE /api/v2/projects/[projectId]/tickets/[ticketId]/comments/[commentId] — task 236. No
// task-side twin exists to copy verbatim: task_comments_delete RLS (migration 048) has shipped
// since before this task, but Task Detail's own Comments tab (_task-comments.tsx) never built a
// delete route/UI for it — see that file's own "no edit/delete UI yet" comment. This route is
// new plumbing for the app-layer check that mirrors issue_comments_delete RLS (migration 101):
// the comment's own author, or admin/super_admin, may delete.
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; ticketId: string; commentId: string }> }
) {
  const { projectId, ticketId, commentId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: ticket } = await supabase.from("tickets").select("id").eq("id", ticketId).eq("project_id", project.id).maybeSingle();
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  const { data: comment } = await supabase
    .from("ticket_comments")
    .select("id, author_id")
    .eq("id", commentId)
    .eq("ticket_id", ticket.id)
    .maybeSingle();
  if (!comment) return NextResponse.json({ error: "Comment not found" }, { status: 404 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isOwnComment = comment.author_id === user.id;
  const isAdmin = profile?.role === "admin" || profile?.role === "super_admin";
  if (!isOwnComment && !isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase.from("ticket_comments").delete().eq("id", commentId);
  if (error) {
    console.error("[api/v2/projects/[id]/tickets/[id]/comments/[id]] delete failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
