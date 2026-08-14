import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getIssueEditPermission } from "@/lib/issues/permissions";

// Task 235 — Attachments tab for Issue Detail. Reuses the existing polymorphic `attachments`
// table (entity_type: "issue") and the shared private `project-assets` bucket — same mechanism
// `.../tasks/[taskId]/attachments/route.ts` already uses for tasks, just a different entity_type.
// Unlike that task route (which predates `getTaskEditPermission`, task 209, and so has its own
// ad-hoc isPrivileged/isOwnTask check inline), this one uses the already-canonical
// `getIssueEditPermission` (task 234) directly.
//
// Note: `attachments_pm_write`/`project_assets_staff_write` RLS (migrations 026/048/050) only
// grant developers row-INSERT on `attachments`, not storage-bucket write — so a developer
// creator's upload would still 403 at the storage layer today. This mirrors the task-side
// route's own equivalent, currently-dormant gap (task 234 confirmed `created_by` is null for
// every existing issue, so no real developer can hit this path yet); fixing the storage policy
// is a cross-cutting decision affecting tasks too and is out of scope here.
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
];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

// GET — read-only attachment list. Auth check only; `attachments_staff_read` RLS already scopes
// results to admin/super_admin/pm/developer.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; issueId: string }> }
) {
  const { projectId, issueId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: issue } = await supabase.from("issues").select("id").eq("id", issueId).eq("project_id", project.id).maybeSingle();
  if (!issue) return NextResponse.json({ error: "Issue not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("attachments")
    .select("id, filename, size, created_at")
    .eq("entity_type", "issue")
    .eq("entity_id", issue.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; issueId: string }> }
) {
  const { projectId, issueId } = await params;
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

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Unsupported file type: ${file.type}. Supported types: images, PDF, Word docs, Excel spreadsheets` },
      { status: 400 }
    );
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: `File size exceeds 25MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB)` }, { status: 400 });
  }

  const timestamp = Date.now();
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `issues/${issue.id}/${timestamp}_${safeFilename}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from("project-assets")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("[api/v2/projects/[id]/issues/[issueId]/attachments] upload failed:", uploadError.message);
    return NextResponse.json({ error: "Failed to upload file" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      entity_type: "issue",
      entity_id: issue.id,
      storage_path: storagePath,
      filename: file.name,
      size: file.size,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (error) {
    console.error("[api/v2/projects/[id]/issues/[issueId]/attachments] insert failed:", error.message);
    return NextResponse.json({ error: "Failed to register attachment" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
