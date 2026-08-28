// Shared inline-image store + body-rewrite step (task 321 forward poll path, task 322 backfill).
// Extracted verbatim from processMessage() in src/app/api/cron/email-poll/route.ts so the
// cron poll and the backfill admin route (src/app/api/admin/desk/backfill-inline-images) run
// exactly one implementation — a divergence between "fix inline images on new mail" and "fix
// inline images on old mail" is precisely the kind of drift this extraction prevents.
import { adminClient } from "@/lib/supabase/admin";
import type { InlineImage } from "./imap";

export const INLINE_IMAGE_BUCKET = "ticket-attachments";

// Rewrites an inline image's <img src="..."> (either the dead Zoho ImageDisplay URL or a raw
// "cid:" form) to point at the inline-images serving route (task 321). Matches by substring
// containment rather than building a regex from the cid value, since a Content-ID can contain
// regex-special characters (e.g. "image001.png@01DD2890.901E00F0").
//
// Re-run safe: after a rewrite the src is "/api/desk/tickets/{ticketId}/messages/{id}/inline-
// images/{attachmentId}" — it contains neither "cid:" nor the cid token, so a second pass is a no-op.
export function rewriteInlineImageSrc(html: string, cid: string, replacementUrl: string): string {
  return html.replace(/src=(["'])([^"']*)\1/gi, (match, quote: string, url: string) => {
    if (url === `cid:${cid}` || url.includes(cid)) return `src=${quote}${replacementUrl}${quote}`;
    return match;
  });
}

// Uploads each resolved inline image to the ticket-attachments bucket, upserts an attachments
// row (cid column set, external_id synthesized as `${messageRowId}:${cid}` — a Content-ID is
// only unique within one message, but external_id has a global UNIQUE constraint, migration
// 035), and rewrites the message body's <img src> refs to the serving route. Per-image failure
// is logged and skipped, never fatal (mirrors the poll route's attachment-loop posture).
// Returns the rewritten body — the caller is responsible for persisting it.
export async function applyInlineImages(params: {
  messageRowId: string;
  ticketId: string;
  inlineImages: InlineImage[];
  body: string;
}): Promise<string> {
  let body = params.body;

  for (const img of params.inlineImages) {
    try {
      const safeFilename = img.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${params.messageRowId}/inline_${safeFilename}`;

      const { error: uploadError } = await adminClient.storage
        .from(INLINE_IMAGE_BUCKET)
        .upload(storagePath, img.content, { upsert: true, contentType: img.contentType });
      if (uploadError) {
        console.warn(`[inline-images] ${img.cid} storage upload failed`, uploadError.message);
        continue;
      }

      const { data: attachmentRow, error: attachmentError } = await adminClient
        .from("attachments")
        .upsert(
          {
            external_id: `${params.messageRowId}:${img.cid}`,
            entity_type: "ticket_message",
            entity_id: params.messageRowId,
            storage_path: storagePath,
            filename: img.filename,
            size: img.size,
            cid: img.cid,
          },
          { onConflict: "external_id" }
        )
        .select("id")
        .single();
      if (attachmentError || !attachmentRow) {
        console.warn(`[inline-images] ${img.cid} attachment upsert failed`, attachmentError?.message);
        continue;
      }

      body = rewriteInlineImageSrc(
        body,
        img.cid,
        `/api/desk/tickets/${params.ticketId}/messages/${params.messageRowId}/inline-images/${attachmentRow.id}`
      );
    } catch (e) {
      console.error(`[inline-images] ${img.cid} processing failed`, e);
    }
  }

  return body;
}
