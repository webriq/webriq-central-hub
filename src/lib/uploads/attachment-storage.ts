import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyFile, type VerifyFileResult } from "./verify-file";

// Task 339 — server helpers for the browser-direct attachment upload path.
//
// The old flow POSTed the file as multipart/form-data to the task/issue `attachments` route
// handler. In production (Vercel) the platform gateway rejects any Route Handler request body
// over ~4.5 MB with HTTP 413 (`x-vercel-error: FUNCTION_PAYLOAD_TOO_LARGE`) *before the handler
// runs* — `next.config.ts`'s `proxyClientMaxBodySize` only governs Next's own proxy buffering,
// not that cap. Retina PNG screenshots routinely exceed 4.5 MB, so they 413.
//
// New flow: the `.../attachments/sign` route runs every gate check and mints a short-lived
// signed upload URL; the browser PUTs the bytes straight to Supabase Storage; the
// `.../attachments` route (now a JSON "register" call) verifies the object and inserts the row.
// Both handler calls are tiny JSON requests, well under any cap.

const BUCKET = "project-assets";

// 64 KB — more than enough for every allowed category's magic bytes (image / pdf / office /
// zip / rar / `ftyp`-box video) and for verifyFile's 4 KB text-plausibility sample.
const VERIFY_BYTES = 64 * 1024;

export async function createAttachmentUploadUrl(
  supabase: SupabaseClient,
  storagePath: string
): Promise<{ path: string; token: string; signedUrl: string }> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data) throw error ?? new Error("No signed upload URL returned");
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

// Reads back only the first 64 KB of the just-uploaded object via a ranged signed-URL fetch and
// runs the same heuristic corruption/spoof check the old in-handler upload did. On any failure
// the object is removed so a rejected file never lingers in the bucket.
export async function verifyUploadedObject(
  supabase: SupabaseClient,
  storagePath: string,
  filename: string
): Promise<VerifyFileResult> {
  const { data: signed, error: signErr } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60);

  if (signErr || !signed?.signedUrl) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, reason: "Uploaded file could not be read back for verification." };
  }

  let head: Buffer;
  try {
    const res = await fetch(signed.signedUrl, { headers: { Range: `bytes=0-${VERIFY_BYTES - 1}` } });
    if (!res.ok && res.status !== 206) throw new Error(`read status ${res.status}`);
    head = Buffer.from(await res.arrayBuffer());
  } catch {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    return { ok: false, reason: "Uploaded file could not be read back for verification." };
  }

  const result = await verifyFile(head, filename);
  if (!result.ok) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
  }
  return result;
}
