import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getIssueEditPermission } from "@/lib/issues/permissions";

// DELETE — task 235. No task-side twin exists to copy verbatim: `.../tasks/[taskId]/attachments`
// has no DELETE route at all (Task Detail's Attachments tab is upload-at-creation, view-only
// afterward — see task 235's doc). Issues have no equivalent creation flow to upload at, so
// upload/delete both live directly on this page, gated the same way POST is (`canEditDetails`).
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; issueId: string; attachmentId: string }> }
) {
  const { projectId, issueId, attachmentId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();

  const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: issue } = await supabase
    .from("issues")
    .select("id, created_by, assignee_id")
    .eq("id", issueId)
    .eq("project_id", project.id)
    .maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  const perm = getIssueEditPermission(profile?.role, user.id, issue);
  if (!perm.canEditDetails) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: attachment } = await supabase
    .from("attachments")
    .select("storage_path")
    .eq("id", attachmentId)
    .eq("entity_type", "issue")
    .eq("entity_id", issue.id)
    .maybeSingle();
  if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  const { error: storageError } = await supabase.storage.from("project-assets").remove([attachment.storage_path]);
  if (storageError) {
    console.error("[api/v2/projects/[id]/issues/[issueId]/attachments/[attachmentId]] storage remove failed:", storageError.message);
    return NextResponse.json({ error: "Failed to delete file" }, { status: 500 });
  }

  const { error: deleteError } = await supabase.from("attachments").delete().eq("id", attachmentId);
  if (deleteError) {
    console.error("[api/v2/projects/[id]/issues/[issueId]/attachments/[attachmentId]] delete failed:", deleteError.message);
    return NextResponse.json({ error: deleteError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
