// Inbound-email normalization (task 303, migrated from Resend to Zoho Mail API by task 318).
// Thin adapter over src/lib/zoho/mail.ts's raw API shape — kept separate so the poll route
// (src/app/api/cron/email-poll/route.ts) works against one normalized shape regardless of
// provider, same separation-of-concerns the original Resend version had.
//
// Unlike the Resend-era design, thread-matching no longer parses In-Reply-To/References
// headers — Zoho Mail's own `threadId` groups a full conversation server-side and is used
// directly (see the poll route), which is simpler and doesn't depend on this file at all.
import { getMessageDetail, type ZohoMailMessageSummary } from "@/lib/zoho/mail";

export type ParsedInboundEmail = {
  messageId: string;
  threadId: string;
  from: string;
  subject: string;
  html: string | null;
  text: string | null;
  attachments: { attachmentId: string; fileName: string; size: number }[];
};

export async function toParsedInboundEmail(summary: ZohoMailMessageSummary): Promise<ParsedInboundEmail> {
  const detail = await getMessageDetail(summary.messageId, summary.folderId);
  return {
    messageId: summary.messageId,
    threadId: summary.threadId,
    from: summary.fromAddress,
    subject: summary.subject,
    html: detail.htmlContent,
    text: detail.textContent,
    attachments: detail.attachments,
  };
}
