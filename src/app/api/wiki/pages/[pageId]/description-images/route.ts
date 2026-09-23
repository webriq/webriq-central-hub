import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Task 395 — images pasted/dropped into the Wiki page RTE. Mirrors
// api/projects/[projectId]/notes/description-images/route.ts exactly (same `task-content`
// bucket, same MIME/size limits, same staff role check — Storage isn't RLS-governed the way
// wiki_pages/wiki_page_versions are, so this route keeps an explicit check), under a `wiki/`
// prefix instead of `notes/`.
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB, matches the bucket's file_size_limit

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const { pageId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["admin", "super_admin", "pm", "developer"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
  const storagePath = `wiki/${pageId}/${timestamp}_${safeFilename}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from("task-content")
    .upload(storagePath, buffer, { contentType: file.type, upsert: false });

  if (uploadError) {
    console.error("[api/wiki/pages/[id]/description-images] upload failed:", uploadError.message);
    return NextResponse.json({ error: "Failed to upload image" }, { status: 500 });
  }

  const { data: { publicUrl } } = supabase.storage.from("task-content").getPublicUrl(storagePath);

  return NextResponse.json({ url: publicUrl, filename: file.name, size: file.size }, { status: 201 });
}
