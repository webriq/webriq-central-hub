import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Images pasted/dropped into a comment body's rich-text editor (task 212) — mirrors
// src/app/api/v2/projects/[projectId]/tasks/description-images/route.ts (task 205) exactly,
// except the role gate is broadened to match task_comments_staff_insert's own role set
// (admin/super_admin/pm/developer) rather than that route's PM+-only gate: since a developer
// can already post a comment, gating image-paste more tightly than text-posting would silently
// break paste for them with no explanation (task 212 Decision #4).
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB, matches the task-content bucket's file_size_limit

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["admin", "super_admin", "pm", "developer"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: task } = await supabase.from("tasks").select("id").eq("id", taskId).maybeSingle();
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });

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
  const storagePath = `${task.id}/${timestamp}_${safeFilename}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from("task-content")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("[api/v2/tasks/[id]/comments/description-images] upload failed:", uploadError.message);
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from("task-content").getPublicUrl(storagePath);

  return NextResponse.json({ url: publicUrl, filename: file.name, size: file.size }, { status: 201 });
}
