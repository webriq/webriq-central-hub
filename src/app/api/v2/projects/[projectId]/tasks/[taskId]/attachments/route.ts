import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { extensionInfoFor, isHardBlockedFilename, MAX_FILES } from "@/config/attachment-types";
import { verifyUploadedObject } from "@/lib/uploads/attachment-storage";

// Discrete "Attachments" section on the New Task modal (task 205) — files staged client-side,
// uploaded here once the task itself exists. Reuses the existing private project-assets bucket
// + generic attachments table (entity_type: "task"), the same mechanism the Zoho attachment
// importers already use (src/app/api/admin/zoho-import/attachments/route.ts).
//
// MIME allowlist/size cap/corruption check come from src/config/attachment-types.ts and
// src/lib/uploads/verify-file.ts (task 273) instead of a locally hand-copied list.
// image/svg+xml stays excluded there — SVGs can carry embedded <script>, a stored-XSS vector
// when served back at the storage domain.
//
// Task 339 — upload no longer flows the file through this handler as multipart (Vercel's
// gateway 413s any Route Handler request body over ~4.5 MB). The browser gets a signed upload
// URL from `./sign`, PUTs the bytes straight to Storage, then calls this POST with JSON
// `{ path, filename, size }` to verify + register the object.

// GET — read-only attachment list for the task detail page's viewer (task 206). No signed URL
// here (see the sibling `[attachmentId]/file-url` route) — those are minted on-demand when a
// PM/admin/developer clicks "View", matching the codebase's one existing signed-URL precedent.
// Auth check only; `attachments_staff_read` RLS (migration 048) already scopes results to
// admin/super_admin/pm/developer, matching how `[taskId]/route.ts`/`subtasks/route.ts` rely on
// RLS instead of a duplicate app-level role check for reads.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; taskId: string }> }
) {
  const { projectId, taskId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: task } = await supabase.from("tasks").select("id").eq("id", taskId).eq("project_id", project.id).maybeSingle();
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  const { data: taskAttachments, error } = await supabase
    .from("attachments")
    .select("id, filename, size, created_at")
    .eq("entity_type", "task")
    .eq("entity_id", task.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Task 368, R3 — merge in attachments uploaded on this task's comments (entity_type: "comment")
  // so they also surface in the Attachments tab, not just the comment thread. Mirrors the
  // equivalent merge already shipped for tickets (task 257, Requirement F) in
  // `.../tickets/[ticketId]/attachments/route.ts`. `fetchUrl` is computed server-side so the
  // client never has to branch-construct the right signed-URL endpoint per source.
  const { data: comments } = await supabase
    .from("task_comments")
    .select("id")
    .eq("task_id", task.id);
  const commentIds = (comments ?? []).map((c) => c.id);

  type MergedAttachment = {
    id: string; filename: string; size: number | null; created_at: string;
    source: "task" | "comment"; commentId: string | null; fetchUrl: string;
  };

  const merged: MergedAttachment[] = (taskAttachments ?? []).map((a) => ({
    ...a,
    source: "task",
    commentId: null,
    fetchUrl: `/api/v2/projects/${projectId}/tasks/${taskId}/attachments/${a.id}/file-url`,
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
        fetchUrl: `/api/v2/tasks/${taskId}/comments/${a.entity_id}/attachments/${a.id}/file-url`,
      });
    }
  }

  merged.sort((a, b) => a.created_at.localeCompare(b.created_at));

  return NextResponse.json(merged);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; taskId: string }> }
) {
  const { projectId, taskId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();

  const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: task } = await supabase.from("tasks").select("id, created_by").eq("id", taskId).eq("project_id", project.id).maybeSingle();
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

  // Task 209 — a developer may attach files to a task they created (e.g. right after creating
  // it via the New Task modal); every other developer case stays forbidden.
  const isPrivileged = !!profile && ["admin", "super_admin", "pm"].includes(profile.role);
  const isOwnTask = profile?.role === "developer" && task.created_by === user.id;
  if (!isPrivileged && !isOwnTask) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Task 339 — "register" step: the file bytes were uploaded straight to Storage by the browser
  // via the signed URL minted by `./sign`. Body is JSON `{ path, filename, size }`, never
  // multipart (which would 413 at Vercel's gateway for files > ~4.5 MB).
  const body = await req.json().catch(() => null);
  const storagePath = typeof body?.path === "string" ? body.path : "";
  const filename = typeof body?.filename === "string" ? body.filename : "";
  const size = typeof body?.size === "number" ? body.size : null;
  if (!storagePath || !filename) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (!storagePath.startsWith(`tasks/${task.id}/`)) {
    return NextResponse.json({ error: "Invalid upload path" }, { status: 400 });
  }

  const info = extensionInfoFor(filename);
  if (!info || isHardBlockedFilename(filename)) {
    await supabase.storage.from("project-assets").remove([storagePath]);
    return NextResponse.json({ error: "Unsupported file type." }, { status: 400 });
  }

  const { count: existingCount } = await supabase
    .from("attachments")
    .select("id", { count: "exact", head: true })
    .eq("entity_type", "task")
    .eq("entity_id", task.id);
  if ((existingCount ?? 0) >= MAX_FILES) {
    await supabase.storage.from("project-assets").remove([storagePath]);
    return NextResponse.json({ error: `Only up to ${MAX_FILES} files can be attached.` }, { status: 400 });
  }

  const verification = await verifyUploadedObject(supabase, storagePath, filename);
  if (!verification.ok) {
    return NextResponse.json({ error: verification.reason }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("attachments")
    .insert({
      entity_type: "task",
      entity_id: task.id,
      storage_path: storagePath,
      filename,
      size,
      uploaded_by: user.id,
    })
    .select()
    .single();

  if (error) {
    await supabase.storage.from("project-assets").remove([storagePath]);
    console.error("[api/v2/projects/[id]/tasks/[taskId]/attachments] insert failed:", error.message);
    return NextResponse.json({ error: "Failed to register attachment" }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
