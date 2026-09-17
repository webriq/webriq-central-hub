import { adminClient } from "@/lib/supabase/admin";

// Task 350 — server helpers for the browser-direct customer-asset upload path.
//
// The old flow POSTed the file as multipart/form-data to
// `POST /api/customers/[customerId]/assets/upload`. In production (Vercel) the platform gateway
// rejects any Route Handler request body over ~4.5 MB with HTTP 413
// (`x-vercel-error: FUNCTION_PAYLOAD_TOO_LARGE`) *before the handler runs* — so that route's own
// 25 MB `MAX_FILE_SIZE` check never executed and users saw a bare `413` (e.g. a ~5 MB image on
// the project Files tab). Same root cause + fix shape as task 339 (`attachment-storage.ts`),
// a different surface and a different bucket.
//
// New flow: `.../assets/upload/sign` runs every gate check (auth, write-role, MIME, size) and
// mints a short-lived signed upload URL; the browser PUTs the bytes straight to the private
// `customer-assets` bucket; the already-existing `POST /assets` register call (unchanged) then
// creates the `customer_assets` row. No content verification here — the customer-asset upload
// path has never run one (parity; see the task doc's Out of Scope).

const BUCKET = "customer-assets";

// MIME allowlist for customer-asset uploads. Kept here (not inline in the route) so the `sign`
// route and the legacy multipart `upload` route stay in lockstep.
//
// Task 372 follow-up — must be kept in sync with the client-side ALLOWED_UPLOAD_TYPES in
// onboarding-workspace/_file-upload-constants.ts (this is the server-side gate the client list
// mirrors; a type allowed client-side but missing here 400s at `/upload/sign` before the file
// ever reaches Storage). See that file's comment for the .ico/.zip/.rar/.js/.ts/.xml MIME-variant
// and MIME-sniffing-reliability notes — same caveats apply here.
export const ALLOWED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  // HTML mockups / MD source content / plain-text access notes — Bert's onboarding wizard
  // (task 122) explicitly uploads these alongside branding/document files.
  "text/html",
  "text/markdown",
  "text/plain",
  "text/csv",
  "image/x-icon",
  "image/vnd.microsoft.icon",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.rar",
  "application/x-rar-compressed",
  "text/javascript",
  "application/javascript",
  "video/mp2t",
  "application/xml",
  "text/xml",
];

export const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB — matches the customer-assets bucket's file_size_limit

// Server-generated storage path. Nested under project_id when the caller has a project context
// (project Files tab / onboarding wizard) so files are separated per-project in the bucket;
// falls back to the flat customer-level path otherwise (Customers -> Assets tab). The client
// never chooses this path — the register route additionally asserts it starts with the customer id.
export function buildCustomerAssetPath({
  customerId,
  projectId,
  filename,
}: {
  customerId: string;
  projectId?: string | null;
  filename: string;
}): string {
  const timestamp = Date.now();
  const safeFilename = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return projectId
    ? `${customerId}/${projectId}/${timestamp}_${safeFilename}`
    : `${customerId}/${timestamp}_${safeFilename}`;
}

export async function createCustomerAssetUploadUrl(
  storagePath: string
): Promise<{ path: string; token: string; signedUrl: string }> {
  // adminClient: `customer-assets` is a private bucket with service-level write RLS — the
  // multipart route already uses adminClient for every op on this bucket. The `sign` route runs
  // its own auth + write-role gate before calling this.
  const { data, error } = await adminClient.storage.from(BUCKET).createSignedUploadUrl(storagePath);
  if (error || !data) throw error ?? new Error("No signed upload URL returned");
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}
