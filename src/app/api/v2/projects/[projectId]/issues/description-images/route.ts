import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Images pasted/dropped into the Issue Detail rich text description (task 234). Mirrors
// .../tasks/description-images/route.ts exactly, including its role gate — a developer creator
// with full edit rights still can't paste inline images into their own issue description, same
// pre-existing limitation the task-side route already has for developer task creators; not a
// new inconsistency introduced here, and fixing the task-side gate is out of scope. Uploaded to
// the shared public `task-content` bucket (migration 091) — that bucket is project-scoped
// storage (`storagePath` is keyed by `project.id`, not task/issue id), not task-specific, so no
// bucket policy change is needed to reuse it here.
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB, matches the bucket's file_size_limit

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["admin", "super_admin", "pm"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json({ error: `Unsupported file type: ${file.type}. Only images are supported.` }, { status: 400 });
  }
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: `File size exceeds 10MB limit (${(file.size / (1024 * 1024)).toFixed(1)}MB)` }, { status: 400 });
  }

  const timestamp = Date.now();
  const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${project.id}/${timestamp}_${safeFilename}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from("task-content")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("[api/v2/projects/[id]/issues/description-images] upload failed:", uploadError.message);
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from("task-content").getPublicUrl(storagePath);

  return NextResponse.json({ url: publicUrl, filename: file.name, size: file.size }, { status: 201 });
}
