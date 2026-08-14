import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Discrete file attachments on an issue comment (task 236) — mirrors
// .../tasks/[taskId]/comments/[commentId]/attachments/route.ts exactly: reuses the existing
// generic `attachments` table (entity_type: "comment", already a legal value since migration
// 049 — no change needed there, task/issue comments share the same table) and the same private
// `project-assets` bucket. No app-level role/ownership check is needed on POST — a caller who
// can reach this route already passed issue_comments_staff_insert RLS to create the parent
// comment, and attachments_pm_write / attachments_developer_insert RLS scope the actual insert.
const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/html",
  "text/markdown",
  "text/plain",
  "video/mp4",
];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

// GET — read-only attachment list for a comment. Auth check only; attachments_staff_read RLS
// already scopes results to admin/super_admin/pm/developer.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; issueId: string; commentId: string }> }
) {
  const { projectId, issueId, commentId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: issue } = await supabase.from("issues").select("id").eq("id", issueId).eq("project_id", project.id).maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  const { data: comment } = await supabase.from("issue_comments").select("id").eq("id", commentId).eq("issue_id", issue.id).maybeSingle();
  if (!comment) return NextResponse.json({ error: "Comment not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("attachments")
    .select("id, filename, size, created_at")
    .eq("entity_type", "comment")
    .eq("entity_id", comment.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; issueId: string; commentId: string }> }
) {
  const { projectId, issueId, commentId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: issue } = await supabase.from("issues").select("id").eq("id", issueId).eq("project_id", project.id).maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  const { data: comment } = await supabase.from("issue_comments").select("id").eq("id", commentId).eq("issue_id", issue.id).maybeSingle();
  if (!comment) return NextResponse.json({ error: "Comment not found" }, { status: 404 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}. Supported types: images, PDF, Word docs, Excel spreadsheets, HTML, Markdown, plain text, MP4 video` },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: `File size exceeds 25MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB)` }, { status: 400 });
  }

  const timestamp = Date.now();
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `comments/${comment.id}/${timestamp}_${safeFilename}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from("project-assets")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("[api/v2/projects/[id]/issues/[id]/comments/[id]/attachments] upload failed:", uploadError.message);
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      entity_type: "comment",
      entity_id: comment.id,
      storage_path: storagePath,
      filename: file.name,
      size: file.size,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/v2/projects/[id]/issues/[id]/comments/[id]/attachments] insert failed:", error.message);
    return NextResponse.json({ error: "Failed to register attachment" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
