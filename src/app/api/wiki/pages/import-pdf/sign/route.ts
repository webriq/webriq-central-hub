import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createClient } from "@/lib/supabase/server";

// Step 1 of the browser-direct PDF import (migration 154). Runs the auth / role / type / size
// gate and mints a short-lived signed upload URL for the private `wiki-imports` bucket, so the
// PDF bytes never pass through a Route Handler (Vercel 413s bodies over ~4.5 MB). The browser
// PUTs the file to `signedUrl`, then calls POST /api/wiki/pages/import-pdf with `{ path }`.
const MAX_FILE_SIZE = 200 * 1024 * 1024;
const WRITE_ROLES = ["admin", "super_admin", "pm", "developer"];

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !WRITE_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as { filename?: unknown; size?: unknown } | null;
  const filename = typeof body?.filename === "string" ? body.filename : "";
  const size = typeof body?.size === "number" ? body.size : NaN;

  if (!filename.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ error: "Only .pdf files are accepted here" }, { status: 400 });
  }
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "Missing file size" }, { status: 400 });
  }
  if (size > MAX_FILE_SIZE) {
    return NextResponse.json({ error: `File size exceeds 200MB limit (${(size / (1024 * 1024)).toFixed(1)}MB)` }, { status: 400 });
  }

  const path = `${user.id}/${randomUUID()}.pdf`;
  const { data, error } = await supabase.storage.from("wiki-imports").createSignedUploadUrl(path);
  if (error || !data) {
    console.error("POST /api/wiki/pages/import-pdf/sign failed:", error?.message);
    return NextResponse.json({ error: "Failed to start the upload" }, { status: 500 });
  }

  return NextResponse.json({ path: data.path, signedUrl: data.signedUrl });
}
