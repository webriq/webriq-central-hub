// Sent-folder ingestion (task 441). The helpdesk poll only reads INBOX, so staff replies — and
// anything sent straight from the Zoho Mail UI — never reached the Hub thread. This pass lists
// the Sent folder and appends each message to the ticket it belongs to as a staff message.
//
// It NEVER creates a ticket (a Sent-only message with no matching ticket is skipped), and replies
// the Hub itself sent via sendReply() are deduped on email_message_id (the reply route stores the
// id Zoho returned). UNVERIFIED against a live account: that the id returned by sendReply equals
// the Sent-folder listing's messageId — if it doesn't, Hub-sent replies would appear twice;
// check once after enabling.
import { adminClient } from "@/lib/supabase/admin";
import { listNewMessages, getMessageDetail, type ZohoMailMessageSummary } from "@/lib/zoho/mail";
import { subjectsMatch } from "@/lib/email/subject";

const CURSOR_ID = "helpdesk-sent";
const THREAD_MATCH_LOOKBACK_DAYS = 180;

export type SentPollResult = { polled: number; ingested: number; skipped: number; failed: number };

export async function pollSentFolder(): Promise<SentPollResult> {
  const result: SentPollResult = { polled: 0, ingested: 0, skipped: 0, failed: 0 };
  const folderId = process.env.ZOHO_MAIL_SENT_FOLDER_ID;
  if (!folderId) {
    console.warn("[cron/email-poll] ZOHO_MAIL_SENT_FOLDER_ID is not set — staff replies sent outside the Hub won't sync");
    return result;
  }

  const { data: cursorRow } = await adminClient
    .from("email_poll_cursor")
    .select("last_received_time")
    .eq("id", CURSOR_ID)
    .maybeSingle();

  const messages = await listNewMessages({ folderId, sinceReceivedTime: cursorRow?.last_received_time ?? null });
  result.polled = messages.length;

  for (const summary of messages) {
    try {
      const ingested = await processSentMessage(summary);
      if (ingested) result.ingested++;
      else result.skipped++;
      if (Number.isFinite(Number(summary.receivedTime))) {
        await adminClient
          .from("email_poll_cursor")
          .upsert(
            { id: CURSOR_ID, last_received_time: summary.receivedTime, updated_at: new Date().toISOString() },
            { onConflict: "id" }
          );
      }
    } catch (e) {
      // Stop so the single-watermark cursor never advances past a failed message (same rule as
      // the inbound loop); email_message_id dedupe makes the retry safe.
      console.error(`[cron/email-poll] sent message ${summary.messageId} failed`, e);
      result.failed++;
      break;
    }
  }
  return result;
}

async function findTicketId(summary: ZohoMailMessageSummary): Promise<string | null> {
  const { data: byThread } = await adminClient
    .from("inbox")
    .select("id")
    .eq("zoho_mail_thread_id", summary.threadId)
    .maybeSingle();
  if (byThread) return byThread.id;

  const { data: root } = await adminClient
    .from("inbox_messages")
    .select("inbox_id")
    .eq("email_message_id", summary.threadId)
    .maybeSingle();
  if (root) {
    await adminClient.from("inbox").update({ zoho_mail_thread_id: summary.threadId }).eq("id", root.inbox_id);
    return root.inbox_id;
  }

  // Imported tickets carry no thread id — fall back to recipient + normalized subject, as the
  // inbound poll's Match 3 does with the sender.
  if (!summary.toAddress) return null;
  const since = new Date(Date.now() - THREAD_MATCH_LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data: candidates } = await adminClient
    .from("inbox")
    .select("id, subject, requester_email, zoho_mail_thread_id")
    .ilike("requester_email", summary.toAddress)
    .gt("created_at", since)
    .order("created_at", { ascending: false })
    .limit(25);
  const match = (candidates ?? []).find(
    (t) => (t.requester_email ?? "").toLowerCase() === summary.toAddress!.toLowerCase() && subjectsMatch(t.subject, summary.subject)
  );
  if (!match) return null;
  if (!match.zoho_mail_thread_id) {
    await adminClient.from("inbox").update({ zoho_mail_thread_id: summary.threadId }).eq("id", match.id);
  }
  return match.id;
}

// Returns true when a message row was inserted.
async function processSentMessage(summary: ZohoMailMessageSummary): Promise<boolean> {
  const { data: existing } = await adminClient
    .from("inbox_messages")
    .select("id")
    .eq("email_message_id", summary.messageId)
    .maybeSingle();
  if (existing) return false;

  const ticketId = await findTicketId(summary);
  if (!ticketId) return false;

  const detail = await getMessageDetail(summary.messageId, summary.folderId);
  const html = detail.htmlContent;
  const body = html ?? detail.textContent ?? "";
  if (!body) return false;

  const receivedMs = Number(summary.receivedTime);
  const { error } = await adminClient.from("inbox_messages").insert({
    inbox_id: ticketId,
    author_type: "staff",
    visibility: "public",
    body,
    email_message_id: summary.messageId,
    ...(Number.isFinite(receivedMs) && receivedMs > 0 ? { created_at: new Date(receivedMs).toISOString() } : {}),
    source_meta: { contentType: html ? "text/html" : "text/plain", source: "zoho-mail-sent" },
  });
  if (error) throw new Error(`failed to insert sent message: ${error.message}`);
  return true;
}
