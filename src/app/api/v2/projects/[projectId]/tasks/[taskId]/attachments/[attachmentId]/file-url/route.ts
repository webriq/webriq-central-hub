import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// On-demand signed URL for one task attachment (task 206) — mirrors
// `src/app/api/customers/[customerId]/assets/[assetId]/file-url/route.ts`'s shape, but uses the
// session-bound client rather than `adminClient`: that route's admin bypass exists for
// `customer_assets`' bespoke `allowed_roles`/`allowed_user_ids` logic, while `project-assets`'
// storage RLS (migration 050) already grants admin/super_admin/pm/developer `select` directly,
// so the session client's own `createSignedUrl` is correctly scoped without a bypass.
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
    .select("storage_path")
    .eq("id", attachmentId)
    .eq("entity_type", "task")
    .eq("entity_id", task.id)
    .maybeSingle();

  if (!attachment) return NextResponse.json({ error: "Attachment not found" }, { status: 404 });

  const { data: signed, error: signError } = await supabase.storage
    .from("project-assets")
    .createSignedUrl(attachment.storage_path, 60);

  if (signError || !signed) {
    console.error("[api/v2/projects/[id]/tasks/[taskId]/attachments/[attachmentId]/file-url] sign failed:", signError?.message);
    return NextResponse.json({ error: "Failed to generate file URL" }, { status: 500 });
  }

  return NextResponse.json({ url: signed.signedUrl });
}
