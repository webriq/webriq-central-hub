// Inbound-email normalization (task 303, migrated from Resend to Zoho Mail API by task 318).
// Thin adapter over src/lib/zoho/mail.ts's raw API shape — kept separate so the poll route
// (src/app/api/cron/email-poll/route.ts) works against one normalized shape regardless of
// provider, same separation-of-concerns the original Resend version had.
//
// Unlike the Resend-era design, thread-matching no longer parses In-Reply-To/References
// headers — Zoho Mail's own `threadId` groups a full conversation server-side and is used
// directly (see the poll route), which is simpler and doesn't depend on this file at all.
import { getMessageDetail, type ZohoMailMessageSummary } from "@/lib/zoho/mail";
import { fetchInlineImages, type InlineImage } from "./imap";

export type ParsedInboundEmail = {
  messageId: string;
  threadId: string;
  from: string;
  subject: string;
  html: string | null;
  text: string | null;
  attachments: { attachmentId: string; fileName: string; size: number }[];
  inlineImages: InlineImage[];
};

// Cheap pre-check so the (much slower) IMAP round-trip in fetchInlineImages() only runs for
// messages that actually reference an inline image Zoho's REST API can't resolve (task 321) —
// most inbound emails have neither, and shouldn't pay an IMAP connect+search+parse cost.
// Exported for the backfill admin route (task 322), which selects already-stored
// ticket_messages whose body still carries one of these unresolved forms.
export const UNRESOLVED_INLINE_IMAGE_PATTERN = /src=["'](?:\/mail\/ImageDisplay|cid:)/i;

export async function toParsedInboundEmail(summary: ZohoMailMessageSummary): Promise<ParsedInboundEmail> {
  const detail = await getMessageDetail(summary.messageId, summary.folderId);

  const hasUnresolvedInlineImages = !!detail.htmlContent && UNRESOLVED_INLINE_IMAGE_PATTERN.test(detail.htmlContent);
  const inlineImages = hasUnresolvedInlineImages ? await fetchInlineImages(summary) : [];

  return {
    messageId: summary.messageId,
    threadId: summary.threadId,
    from: summary.fromAddress,
    subject: summary.subject,
    html: detail.htmlContent,
    text: detail.textContent,
    attachments: detail.attachments,
    inlineImages,
  };
}
