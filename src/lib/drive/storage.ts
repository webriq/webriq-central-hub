import { adminClient } from "@/lib/supabase/admin";
import { ALLOWED_MIME_TYPES } from "@/lib/uploads/customer-asset-storage";
import { DRIVE_BUCKET, DRIVE_MEDIA_MIME_TYPES } from "./constants";

// Task 436 — server helpers for the browser-direct Drive upload path (same shape as task 350's
// customer-asset-storage.ts, a different private bucket). adminClient is used ONLY to sign URLs
// and remove objects, always after the calling route has run its own auth + access check.

export const DRIVE_ALLOWED_MIME_TYPES = [...ALLOWED_MIME_TYPES, ...DRIVE_MEDIA_MIME_TYPES];

// Server-generated; the client never chooses it. Namespaced by the drive OWNER's id so an editor
// uploading into a shared folder still writes inside the owner's tree.
export function buildDrivePath({ ownerId, filename }: { ownerId: string; filename: string }): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  return `${ownerId}/${Date.now()}_${crypto.randomUUID().slice(0, 8)}_${safe}`;
}

export async function createDriveUploadUrl(path: string): Promise<{ path: string; token: string; signedUrl: string }> {
  const { data, error } = await adminClient.storage.from(DRIVE_BUCKET).createSignedUploadUrl(path);
  if (error || !data) throw error ?? new Error("No signed upload URL returned");
  return { path: data.path, token: data.token, signedUrl: data.signedUrl };
}

export async function signDriveFileUrl(path: string, opts?: { download?: string | true }): Promise<string | null> {
  const { data, error } = await adminClient.storage
    .from(DRIVE_BUCKET)
    .createSignedUrl(path, 60, opts?.download ? { download: opts.download } : undefined);
  if (error || !data) return null;
  return data.signedUrl;
}

export async function signDriveFileUrls(paths: string[], ttlSeconds: number): Promise<Map<string, string> | null> {
  const { data, error } = await adminClient.storage.from(DRIVE_BUCKET).createSignedUrls(paths, ttlSeconds);
  if (error || !data) return null;
  return new Map(data.flatMap((s) => (s.path && s.signedUrl ? [[s.path, s.signedUrl] as const] : [])));
}

// Register-time check that the browser's PUT actually landed.
export async function driveObjectExists(path: string): Promise<boolean> {
  const { data, error } = await adminClient.storage.from(DRIVE_BUCKET).exists(path);
  return !error && data === true;
}

// Best-effort: the DB row is already gone, so a Storage failure is logged, never surfaced.
export async function removeDriveObjects(paths: string[]): Promise<void> {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await adminClient.storage.from(DRIVE_BUCKET).remove(paths.slice(i, i + 100));
    if (error) console.error("drive storage cleanup error:", error);
  }
}
