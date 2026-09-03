import { adminClient } from "@/lib/supabase/admin";
import { createAttachmentUploadUrl, verifyUploadedObject } from "@/lib/uploads/attachment-storage";
import type { UploadsManifest } from "./schema";

// Task 347 — the StackShift Order Form's two documents (required Proposal, optional FlowForge
// spec) are uploaded browser/proxy-direct to Supabase Storage via signed URLs, sidestepping
// Vercel's ~4.5 MB Route Handler body cap (see CLAUDE.md). Reuses task 339's helpers, which
// target the `project-assets` bucket; these land under a dedicated prefix.

const PREFIX = "stackshift-orders/incoming";

const EXT_BY_FIELD: Record<string, string[]> = {
  proposal: ["pdf", "doc", "docx"],
  flowforge_spec: ["pdf", "doc", "docx", "txt", "md", "xls", "xlsx", "csv"],
};

function extOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

function safeName(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 200) || "file";
}

export type MintedUpload = {
  field: string;
  path: string;
  signedUrl: string;
  token: string;
};

export function validateManifest(
  manifest: UploadsManifest
): { ok: true } | { ok: false; reason: string } {
  const seen = new Set<string>();
  for (const f of manifest.files) {
    if (seen.has(f.field)) return { ok: false, reason: `Duplicate file field: ${f.field}` };
    seen.add(f.field);
    const allowed = EXT_BY_FIELD[f.field] ?? [];
    if (!allowed.includes(extOf(f.filename))) {
      return {
        ok: false,
        reason: `${f.field}: .${extOf(f.filename) || "?"} is not an accepted type (${allowed.join(", ")})`,
      };
    }
  }
  return { ok: true };
}

export async function mintUploadUrls(manifest: UploadsManifest): Promise<MintedUpload[]> {
  const batchId = crypto.randomUUID();
  const out: MintedUpload[] = [];
  for (const f of manifest.files) {
    const path = `${PREFIX}/${batchId}/${f.field}-${safeName(f.filename)}`;
    const { signedUrl, token } = await createAttachmentUploadUrl(adminClient, path);
    out.push({ field: f.field, path, signedUrl, token });
  }
  return out;
}

// Confirms an uploaded object exists, is within the intake prefix, and passes the same
// heuristic corruption/spoof check the task/issue attachment flow uses. Removes the object on
// failure (verifyUploadedObject's own behavior).
export async function verifyIncomingObject(
  storagePath: string,
  filename: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  if (!storagePath.startsWith(`${PREFIX}/`)) {
    return { ok: false, reason: "File path is outside the StackShift order intake area." };
  }
  return verifyUploadedObject(adminClient, storagePath, filename);
}
