import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getIssueEditPermission } from "@/lib/issues/permissions";
import { extensionInfoFor, isHardBlockedFilename, MAX_FILE_SIZE, MAX_FILES } from "@/config/attachment-types";
import { verifyFile } from "@/lib/uploads/verify-file";

// Task 235 — Attachments tab for Issue Detail. Reuses the existing polymorphic `attachments`
// table (entity_type: "issue") and the shared private `project-assets` bucket — same mechanism
// `.../tasks/[taskId]/attachments/route.ts` already uses for tasks, just a different entity_type.
// Unlike that task route (which predates `getTaskEditPermission`, task 209, and so has its own
// ad-hoc isPrivileged/isOwnTask check inline), this one uses the already-canonical
// `getIssueEditPermission` (task 234) directly.
//
// MIME allowlist/size cap/corruption check now come from src/config/attachment-types.ts and
// src/lib/uploads/verify-file.ts (task 273) instead of a locally hand-copied list.
//
// Note: `attachments_pm_write`/`project_assets_staff_write` RLS (migrations 026/048/050) only
// grant developers row-INSERT on `attachments`, not storage-bucket write — so a developer
// creator's upload would still 403 at the storage layer today. This mirrors the task-side
// route's own equivalent, currently-dormant gap (task 234 confirmed `created_by` is null for
// every existing issue, so no real developer can hit this path yet); fixing the storage policy
// is a cross-cutting decision affecting tasks too and is out of scope here.

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

  const { data: issueAttachments, error } = await supabase
    .from("attachments")
    .select("id, filename, size, created_at")
    .eq("entity_type", "issue")
    .eq("entity_id", issue.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Task 257, Requirement F — merge in attachments uploaded on this issue's comments
  // (entity_type: "comment") so they also surface in the Attachments tab, not just the comment
  // thread. `fetchUrl` is computed server-side so the client never has to branch-construct the
  // right signed-URL endpoint per source.
  const { data: comments } = await supabase
    .from("issue_comments")
    .select("id")
    .eq("issue_id", issue.id);
  const commentIds = (comments ?? []).map((c) => c.id);

  type MergedAttachment = {
    id: string; filename: string; size: number | null; created_at: string;
    source: "issue" | "comment"; commentId: string | null; fetchUrl: string;
  };

  const merged: MergedAttachment[] = (issueAttachments ?? []).map((a) => ({
    ...a,
    source: "issue",
    commentId: null,
    fetchUrl: `/api/v2/projects/${projectId}/issues/${issueId}/attachments/${a.id}/file-url`,
  }));

  if (commentIds.length > 0) {
    const { data: commentAttachments } = await supabase
      .from("attachments")
      .select("id, filename, size, created_at, entity_id")
      .eq("entity_type", "comment")
      .in("entity_id", commentIds)
      .order("created_at", { ascending: true });

    for (const a of commentAttachments ?? []) {
      merged.push({
        id: a.id,
        filename: a.filename,
        size: a.size,
        created_at: a.created_at,
        source: "comment",
        commentId: a.entity_id,
        fetchUrl: `/api/v2/projects/${projectId}/issues/${issueId}/comments/${a.entity_id}/attachments/${a.id}/file-url`,
      });
    }
  }

  merged.sort((a, b) => a.created_at.localeCompare(b.created_at));

  return NextResponse.json(merged);
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

  const info = extensionInfoFor(file.name);
  if (!info || isHardBlockedFilename(file.name)) {
    return NextResponse.json({ error: "Unsupported file type." }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: `File size exceeds the ${(MAX_FILE_SIZE / (1024 * 1024)).toFixed(0)}MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB)` }, { status: 400 });
  }

  const { count: existingCount } = await supabase
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", "issue")
    .eq("entity_id", issue.id);
  if ((existingCount ?? 0) >= MAX_FILES) {
    return NextResponse.json({ error: `Only up to ${MAX_FILES} files can be attached.` }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const verification = await verifyFile(buffer, file.name);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.reason }, { status: 400 });
  }

  const timestamp = Date.now();
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `issues/${issue.id}/${timestamp}_${safeFilename}`;

  const { error: uploadError } = await supabase.storage
    .from("project-assets")
    .upload(storagePath, buffer, { contentType: info.mime, upsert: false });

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
