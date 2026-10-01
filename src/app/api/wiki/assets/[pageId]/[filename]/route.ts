import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Authenticated read path for Wiki inline images (private `wiki-assets` bucket, migration 153).
// The page HTML stores this stable URL; each request is session + role checked, then 302s to a
// short-lived signed Supabase URL so the bytes come from Storage's CDN, not this function.
// The redirect is cached privately for slightly less than the signed URL's lifetime, so a
// browser re-checks auth about once per image per ~50 minutes. Object paths are immutable
// (timestamped, upsert: false), so the image itself can be cached freely once fetched.
const SIGNED_URL_TTL_SECONDS = 3600;
const REDIRECT_CACHE_SECONDS = 3000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILENAME_RE = /^[a-zA-Z0-9._-]+$/; // matches the upload route's sanitizer; blocks traversal
const READ_ROLES = ["admin", "super_admin", "pm", "developer", "hr"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ pageId: string; filename: string }> }
) {
  const { pageId, filename } = await params;
  if (!UUID_RE.test(pageId) || !FILENAME_RE.test(filename) || filename.startsWith(".")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile || !READ_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase.storage
    .from("wiki-assets")
    .createSignedUrl(`${pageId}/${filename}`, SIGNED_URL_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const res = NextResponse.redirect(data.signedUrl, 302);
  res.headers.set("Cache-Control", `private, max-age=${REDIRECT_CACHE_SECONDS}`);
  return res;
}
