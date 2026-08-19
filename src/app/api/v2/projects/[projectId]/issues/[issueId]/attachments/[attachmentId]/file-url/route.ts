import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extensionInfoFor } from "@/config/attachment-types";

// On-demand signed URL for one issue attachment (task 235) — mirrors
// `.../tasks/[taskId]/attachments/[attachmentId]/file-url/route.ts` exactly, including its
// force-download handling for non-inline-safe categories (task 273, Requirement G); `project-assets`
// storage RLS already grants admin/super_admin/pm/developer `select` directly, so the
// session-bound client's own `createSignedUrl` is correctly scoped without a bypass.
const INLINE_SAFE_CATEGORIES = new Set(["image", "pdf", "word", "excel", "video"]);
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; issueId: string; attachmentId: string }> }
) {
  const { projectId, issueId, attachmentId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: issue } = await supabase.from("issues").select("id").eq("id", issueId).eq("project_id", project.id).maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  const { data: attachment } = await supabase
    .from("attachments")
    .select("storage_path, filename")
    .eq("id", attachmentId)
    .eq("entity_type", "issue")
    .eq("entity_id", issue.id)
    .maybeSingle();

  if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  const category = extensionInfoFor(attachment.filename)?.category;
  const forceDownload = !category || !INLINE_SAFE_CATEGORIES.has(category);

  const { data: signed, error: signError } = await supabase.storage
    .from("project-assets")
    .createSignedUrl(attachment.storage_path, 60, forceDownload ? { download: attachment.filename } : undefined);

  if (signError || !signed) {
    console.error("[api/v2/projects/[id]/issues/[issueId]/attachments/[attachmentId]/file-url] sign failed:", signError?.message);
    return NextResponse.json({ error: "Failed to generate file URL" }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
