import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// On-demand 60s signed URL for one issue comment attachment (task 236) — mirrors
// .../tasks/[taskId]/comments/[commentId]/attachments/[attachmentId]/file-url/route.ts exactly:
// session-bound client (project-assets storage RLS, migration 050, already grants
// admin/super_admin/pm/developer select directly — no adminClient bypass needed).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; issueId: string; commentId: string; attachmentId: string }> }
) {
  const { projectId, issueId, commentId, attachmentId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: issue } = await supabase.from("issues").select("id").eq("id", issueId).eq("project_id", project.id).maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  const { data: comment } = await supabase.from("issue_comments").select("id").eq("id", commentId).eq("issue_id", issue.id).maybeSingle();
  if (!comment) return NextResponse.json({ error: "Comment not found" }, { status: 404 });

  const { data: attachment } = await supabase
    .from("attachments")
    .select("storage_path")
    .eq("id", attachmentId)
    .eq("entity_type", "comment")
    .eq("entity_id", comment.id)
    .maybeSingle();
  if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  const { data: signed, error: signError } = await supabase.storage
    .from("project-assets")
    .createSignedUrl(attachment.storage_path, 60);

  if (signError || !signed) {
    console.error("[api/v2/projects/[id]/issues/[id]/comments/[id]/attachments/[id]/file-url] sign failed:", signError?.message);
    return NextResponse.json({ error: "Failed to generate file URL" }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
