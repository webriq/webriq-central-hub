// Regular (non-inline) email attachments -> ticket-attachments bucket + attachments table
// (entity_type 'inbox_message'), same shape the ticket-attachments import route writes (task
// 306). Shared by the email-poll cron and the task-456 backfill. Per-attachment failures are
// collected, never thrown — a bad file must not fail the message. external_id (globally UNIQUE,
// migration 035) plus upload upsert make a retry safe.
import { adminClient } from "@/lib/supabase/admin";
import { downloadAttachment, type ZohoMailMessageDetail } from "@/lib/zoho/mail";
import { INLINE_IMAGE_BUCKET as BUCKET } from "@/lib/email/inline-images";
import { extensionInfoFor } from "@/config/attachment-types";

const MAX_SIZE = 52428800; // 50MB — matches the bucket's file_size_limit (migration 117)

export async function storeEmailAttachments(input: {
  messageRowId: string; // inbox_messages.id
  zohoMessageId: string;
  folderId: string;
  attachments: ZohoMailMessageDetail["attachments"];
}): Promise<{ stored: number; failed: { attachmentId: string; reason: string }[] }> {
  let stored = 0;
  const failed: { attachmentId: string; reason: string }[] = [];

  for (const att of input.attachments) {
    try {
      if (att.size > MAX_SIZE) {
        // Permanent skip, not a failure — a retry can never succeed.
        console.warn(`[email-attachments] attachment ${att.attachmentId} exceeds ${MAX_SIZE} bytes, skipping`);
        continue;
      }
      const buffer = await downloadAttachment(input.zohoMessageId, input.folderId, att.attachmentId);
      const safeFilename = att.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${input.messageRowId}/${att.attachmentId}_${safeFilename}`;

      // Without contentType, storage-js stores an ArrayBuffer as text/plain and signed URLs serve it that way.
      const { error: uploadError } = await adminClient.storage.from(BUCKET).upload(storagePath, buffer, {
        upsert: true,
        contentType: extensionInfoFor(att.fileName)?.mime ?? "application/octet-stream",
      });
      if (uploadError) {
        console.warn(`[email-attachments] attachment ${att.attachmentId} storage upload failed`, uploadError.message);
        failed.push({ attachmentId: att.attachmentId, reason: `upload failed: ${uploadError.message}` });
        continue;
      }

      const { error: rowError } = await adminClient.from("attachments").upsert(
        {
          external_id: att.attachmentId,
          entity_type: "inbox_message",
          entity_id: input.messageRowId,
          storage_path: storagePath,
          filename: att.fileName,
          size: att.size,
        },
        { onConflict: "external_id" }
      );
      if (rowError) {
        failed.push({ attachmentId: att.attachmentId, reason: `row upsert failed: ${rowError.message}` });
        continue;
      }
      stored++;
    } catch (e) {
      console.error(`[email-attachments] attachment ${att.attachmentId} processing failed`, e);
      failed.push({ attachmentId: att.attachmentId, reason: e instanceof Error ? e.message : String(e) });
    }
  }

  return { stored, failed };
}
