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

  const { data, error } = await supabase
    .from("attachments")
    .select("id, filename, size, created_at")
    .eq("entity_type", "task")
    .eq("entity_id", task.id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json(data ?? []);
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
