import { adminClient } from "@/lib/supabase/admin";
import { createAttachmentUploadUrl, verifyUploadedObject } from "@/lib/uploads/attachment-storage";
import {
  ATTACHMENT_BUCKET,
  UPLOAD_URL_TTL_SECONDS,
  buildPath,
  checkRegistered,
  toDownloadAttachment,
  type DownloadAttachment,
  type ManifestFile,
  type RegisteredFile,
} from "./attachments-logic";

// Task 447 — StackShift attachments (contract §4). Bytes never pass through a Hub handler (Vercel ~4.5 MB
// cap, see CLAUDE.md): StackShift PUTs straight to Supabase Storage with a Hub-minted signed URL, then
// registers the path with create/comment. Files live in the `ticket-attachments` bucket — the one the Inbox
// attachment viewer signs from — under stackshift-support/<site>/<ticketRef>/….
//
// Orphans: an object uploaded but never registered stays in the bucket (bounded by the 50 MB bucket file
// limit, timestamped paths and the 10-file/25 MB request caps; same accepted trade-off as task 339). No
// sweeper is built here.

export async function mintUploads(site: string, ticketRef: string, files: ManifestFile[]) {
  const now = Date.now();
  return Promise.all(
    files.map(async (f) => {
      const path = buildPath(site, ticketRef, f.filename, now, crypto.randomUUID().slice(0, 8));
      const { signedUrl } = await createAttachmentUploadUrl(adminClient, path, ATTACHMENT_BUCKET);
      return { filename: f.filename, path, uploadUrl: signedUrl, expiresInSeconds: UPLOAD_URL_TTL_SECONDS };
    }),
  );
}

export type VerifyOutcome = { ok: true } | { ok: false; path: string; message: string };

// Runs BEFORE any ticket/message row is written, so a bad attachment fails the whole request with
// `invalid_payload` and leaves nothing behind. `forMessageId` lets a retried comment re-register the paths
// it already owns; any other already-registered path is rejected so one site can never re-home another's file.
export async function verifyRegistered(
  files: RegisteredFile[],
  site: string,
  ticketRef: string,
  forMessageId?: string,
): Promise<VerifyOutcome> {
  const shape = checkRegistered(files, site, ticketRef);
  if (!shape.ok) return shape;
  if (files.length === 0) return { ok: true };

  const { data: taken } = await adminClient
    .from("attachments")
    .select("external_id, entity_id")
    .in(
      "external_id",
      files.map((f) => f.path),
    );
  const clash = (taken ?? []).find((t) => t.entity_id !== forMessageId);
  if (clash) return { ok: false, path: clash.external_id ?? "", message: "Path is already registered" };

  // Paths this very message already owns were verified when first registered. Re-verifying them on a retried
  // comment is pointless and dangerous: verifyUploadedObject DELETES the object when the read-back fails,
  // even transiently, which would leave the attachment row pointing at a missing file (task 447 review).
  const alreadyOwned = new Set((taken ?? []).map((t) => t.external_id));
  for (const f of files) {
    if (alreadyOwned.has(f.path)) continue;
    const res = await verifyUploadedObject(adminClient, f.path, f.filename, ATTACHMENT_BUCKET);
    if (!res.ok) return { ok: false, path: f.path, message: res.reason };
  }
  return { ok: true };
}

export async function insertAttachmentRows(messageId: string, files: RegisteredFile[]): Promise<void> {
  if (files.length === 0) return;
  const { error } = await adminClient.from("attachments").upsert(
    files.map((f) => ({
      external_id: f.path, // unique => idempotent re-registration of the same message's files
      entity_type: "inbox_message",
      entity_id: messageId,
      storage_path: f.path,
      filename: f.filename,
      size: f.size,
    })),
    { onConflict: "external_id" },
  );
  if (error) throw new Error(`attachment insert failed: ${error.message}`);
}

// Outbound: signed download URLs minted fresh at send/read time and never stored (15 min). Keyed by
// inbox_messages.id. A file whose URL can't be minted is skipped with a warning rather than failing the event.
export async function mintDownloadUrls(messageIds: string[]): Promise<Map<string, DownloadAttachment[]>> {
  const out = new Map<string, DownloadAttachment[]>();
  if (messageIds.length === 0) return out;

  const { data: rows, error } = await adminClient
    .from("attachments")
    .select("entity_id, storage_path, filename, size")
    .eq("entity_type", "inbox_message")
    .in("entity_id", messageIds)
    .order("created_at", { ascending: true });
  if (error) {
    console.warn("[stackshift-support] attachment lookup failed:", error.message);
    return out;
  }

  for (const row of rows ?? []) {
    const { data: signed, error: signError } = await adminClient.storage
      .from(ATTACHMENT_BUCKET)
      .createSignedUrl(row.storage_path, UPLOAD_URL_TTL_SECONDS, { download: row.filename });
    if (signError || !signed?.signedUrl) {
      console.warn(`[stackshift-support] could not sign ${row.storage_path}:`, signError?.message);
      continue;
    }
    const list = out.get(row.entity_id) ?? [];
    list.push(toDownloadAttachment(row, signed.signedUrl));
    out.set(row.entity_id, list);
  }
  return out;
}
