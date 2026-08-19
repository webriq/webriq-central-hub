import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extensionInfoFor } from "@/config/attachment-types";

// On-demand signed URL for one task attachment (task 206) — mirrors
// `src/app/api/customers/[customerId]/assets/[assetId]/file-url/route.ts`'s shape, but uses the
// session-bound client rather than `adminClient`: that route's admin bypass exists for
// `customer_assets`' bespoke `allowed_roles`/`allowed_user_ids` logic, while `project-assets`'
// storage RLS (migration 050) already grants admin/super_admin/pm/developer `select` directly,
// so the session client's own `createSignedUrl` is correctly scoped without a bypass.
//
// Forces `download` (task 273, Requirement G) for any attachment category the viewer modal
// (TaskAttachmentViewerModal) doesn't render inline via <img>/<iframe> — image/pdf/word/excel
// stay inline-viewable; everything else (zip/rar/text, now including the widened HTML/JS/CSS/TS
// allowlist) always downloads instead of ever being navigable as a raw browser-rendered URL.
const INLINE_SAFE_CATEGORIES = new Set(["image", "pdf", "word", "excel", "video"]);
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; taskId: string; attachmentId: string }> }
) {
  const { projectId, taskId, attachmentId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: task } = await supabase.from("tasks").select("id").eq("id", taskId).eq("project_id", project.id).maybeSingle();
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const { data: attachment } = await supabase
    .from("attachments")
    .select("storage_path, filename")
    .eq("id", attachmentId)
    .eq("entity_type", "task")
    .eq("entity_id", task.id)
    .maybeSingle();

  if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  const category = extensionInfoFor(attachment.filename)?.category;
  const forceDownload = !category || !INLINE_SAFE_CATEGORIES.has(category);

  const { data: signed, error: signError } = await supabase.storage
    .from("project-assets")
    .createSignedUrl(attachment.storage_path, 60, forceDownload ? { download: attachment.filename } : undefined);

  if (signError || !signed) {
    console.error("[api/v2/projects/[id]/tasks/[taskId]/attachments/[attachmentId]/file-url] sign failed:", signError?.message);
    return NextResponse.json({ error: "Failed to generate file URL" }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
