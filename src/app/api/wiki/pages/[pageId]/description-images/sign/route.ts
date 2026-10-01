import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Task 395 — images pasted/dropped into the Wiki page RTE, browser-direct. Replaces the old
// multipart `description-images` POST (Vercel 413s Route Handler bodies over ~4.5 MB): this
// route runs the auth / role / type / size gate and mints a signed upload URL for the PRIVATE
// `wiki-assets` bucket (migration 153); the browser PUTs the bytes straight to Storage. It also
// returns the stable, auth-gated read URL (api/wiki/assets/[pageId]/[filename]) to store in the
// page HTML — the object name is deterministic, so no separate register call is needed.
// The bucket itself also enforces the MIME allow-list and size limit.
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB, matches the bucket's file_size_limit
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ pageId: string }> }
) {
  const { pageId } = await params;
  if (!UUID_RE.test(pageId)) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !["admin", "super_admin", "pm", "developer"].includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { filename?: unknown; size?: unknown; type?: unknown } | null;
  const filename = typeof body?.filename === "string" ? body.filename : "";
  const size = typeof body?.size === "number" ? body.size : NaN;
  const type = typeof body?.type === "string" ? body.type : "";

  if (!filename) return NextResponse.json({ error: "No file provided" }, { status: 400 });
  if (!ALLOWED_MIME_TYPES.includes(type)) {
    return NextResponse.json({ error: `Unsupported file type: ${type}. Only images are supported.` }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "Missing file size" }, { status: 400 });
  }
  if (size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: `File size exceeds 50MB limit (${(size / (1024 * 1024)).toFixed(1)}MB)` }, { status: 400 });
  }

  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "_");
  const objectName = `${Date.now()}_${safeFilename}`;
  const storagePath = `${pageId}/${objectName}`;

  const { data, error } = await supabase.storage.from("wiki-assets").createSignedUploadUrl(storagePath);
  if (error || !data) {
    console.error("[api/wiki/pages/[id]/description-images/sign] failed:", error?.message);
    return NextResponse.json({ error: "Failed to start the upload" }, { status: 500 });
  }

  return NextResponse.json({
    signedUrl: data.signedUrl,
    url: `/api/wiki/assets/${pageId}/${objectName}`,
  });
}
