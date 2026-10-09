import { createHash } from "node:crypto";
import { EXTENSION_INFO, extensionInfoFor, isHardBlockedFilename } from "@/config/attachment-types";

// Task 447 — pure attachment rules for the StackShift support API (contract §4): manifest validation, the
// server-generated path scheme and the ownership guard that stops one site registering another's upload.
// Imports only the pure allowlist config (no env/DB) so the checks in _docs/task/447-attachments.check.ts
// run under plain tsx.

export const ATTACHMENT_BUCKET = "ticket-attachments";
export const PATH_ROOT = "stackshift-support";
export const MAX_ATTACHMENTS = 10;
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const UPLOAD_URL_TTL_SECONDS = 900; // signed upload (sign) and download (events/reads) URLs: 15 min

export type ManifestFile = { filename: string; contentType: string; size: number };
export type ManifestResult =
  | { ok: true }
  | { ok: false; status: 400 | 413 | 422; error: "invalid_payload" | "payload_too_large" | "unsupported_file_type"; message: string };

export function safeName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  return base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 200) || "file";
}

// Readable, lossy slug for a path segment. On its own it COLLIDES ("a/b" and "a_b" both become "a_b"), so
// the ownership prefix below appends a hash of the exact string — otherwise one site could register another
// site's upload whenever their names differ only by punctuation (task 447 review).
export function slug(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 100) || "x";
}

export function segment(value: string): string {
  return `${slug(value).slice(0, 60)}-${createHash("sha256").update(value).digest("hex").slice(0, 10)}`;
}

// The paths are opaque to StackShift (it only echoes back what uploads/sign returned), so the exact format is
// free to change; the segment is deterministic per exact (site, ticketRef) pair.
export function pathPrefix(site: string, ticketRef: string): string {
  return `${PATH_ROOT}/${segment(site)}/${segment(ticketRef)}/`;
}

export function buildPath(site: string, ticketRef: string, filename: string, nowMs: number, rand: string): string {
  return `${pathPrefix(site, ticketRef)}${nowMs}_${rand}_${safeName(filename)}`;
}

// Only paths this site minted for this ticketRef may be registered. Rejects traversal segments outright.
export function ownsPath(path: string, site: string, ticketRef: string): boolean {
  if (path.includes("..") || path.includes("//") || path.includes("\\")) return false;
  const prefix = pathPrefix(site, ticketRef);
  return path.startsWith(prefix) && path.length > prefix.length;
}

export function validateManifest(files: ManifestFile[]): ManifestResult {
  if (files.length === 0) return { ok: false, status: 400, error: "invalid_payload", message: "At least one file is required" };
  if (files.length > MAX_ATTACHMENTS) {
    return { ok: false, status: 400, error: "invalid_payload", message: `At most ${MAX_ATTACHMENTS} files per request` };
  }
  for (const f of files) {
    if (!Number.isFinite(f.size) || f.size <= 0) {
      return { ok: false, status: 400, error: "invalid_payload", message: `${f.filename}: size must be a positive number` };
    }
    if (f.size > MAX_ATTACHMENT_BYTES) {
      return { ok: false, status: 413, error: "payload_too_large", message: `${f.filename}: exceeds the 25 MB limit` };
    }
    const info = extensionInfoFor(f.filename);
    if (isHardBlockedFilename(f.filename) || !info) {
      return { ok: false, status: 422, error: "unsupported_file_type", message: `${f.filename}: file type is not allowed` };
    }
    // The declared MIME must agree with the extension's category (content bytes are verified at register time).
    // Browsers report "" or application/octet-stream for some types, so those are accepted as "unknown".
    const declared = f.contentType.toLowerCase().split(";")[0].trim();
    if (declared && declared !== "application/octet-stream" && declared !== info.mime) {
      const declaredInfo = Object.values(EXTENSION_INFO).find((i) => i.mime === declared);
      if (!declaredInfo || declaredInfo.category !== info.category) {
        return { ok: false, status: 422, error: "unsupported_file_type", message: `${f.filename}: content type ${declared} does not match the file extension` };
      }
    }
  }
  return { ok: true };
}

export type RegisteredFile = { path: string; filename: string; contentType: string; size: number };

export function checkRegistered(
  files: RegisteredFile[],
  site: string,
  ticketRef: string,
): { ok: true } | { ok: false; path: string; message: string } {
  // No attachments is the normal case for most creates/comments. validateManifest() rejects an empty list ("at
  // least one file is required" — right for uploads/sign, wrong here), which used to crash on files[0] below and
  // 500 every attachment-less create (found by the first live harness run).
  if (files.length === 0) return { ok: true };
  const seen = new Set<string>();
  for (const f of files) {
    if (seen.has(f.path)) return { ok: false, path: f.path, message: "Duplicate path in attachments" };
    seen.add(f.path);
    if (!ownsPath(f.path, site, ticketRef)) return { ok: false, path: f.path, message: "Path was not issued for this site and ticket" };
  }
  const manifest = validateManifest(files);
  if (!manifest.ok) {
    const bad = files.find((f) => manifest.message.startsWith(f.filename)) ?? files[0];
    return { ok: false, path: bad.path, message: manifest.message };
  }
  return { ok: true };
}

export type DownloadAttachment = {
  filename: string;
  size: number | null;
  contentType: string;
  downloadUrl: string;
  expiresInSeconds: number;
};

export function contentTypeFor(filename: string): string {
  return extensionInfoFor(filename)?.mime ?? "application/octet-stream";
}

export function toDownloadAttachment(row: { filename: string; size: number | null }, downloadUrl: string): DownloadAttachment {
  return {
    filename: row.filename,
    size: row.size,
    contentType: contentTypeFor(row.filename),
    downloadUrl,
    expiresInSeconds: UPLOAD_URL_TTL_SECONDS,
  };
}
