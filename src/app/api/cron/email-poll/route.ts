// Inbound-email poll (task 303, migrated from a Resend webhook to Zoho Mail polling by task
// 318). Cron-triggered — same auth pattern as /api/digest (x-cron-secret header or a valid
// user session) rather than a provider webhook signature, since there is no webhook anymore.
// Creates/appends native tickets/ticket_messages rows, the live counterpart to the batch Desk
// Tickets import (task 296/302). Separate from src/app/api/webhooks/route.ts (Zoho
// Desk/Projects event webhooks) — unrelated provider and payload shape.
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { listNewMessages, downloadAttachment, type ZohoMailMessageSummary } from "@/lib/zoho/mail";
import { toParsedInboundEmail } from "@/lib/email/inbound";

const BUCKET = "ticket-attachments";
const MAX_SIZE = 52428800; // 50MB — matches the bucket's file_size_limit (migration 117)
const CURSOR_ID = "helpdesk";

export async function POST(req: NextRequest) {
  const cronSecret = process.env.CRONJOB_SECRET_KEY;
  const incomingSecret = req.headers.get("x-cron-secret");
  const isCronCall = !!cronSecret && incomingSecret === cronSecret;

  if (!isCronCall) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const folderId = process.env.ZOHO_MAIL_INBOX_FOLDER_ID;
  if (!folderId) {
    console.error("[cron/email-poll] ZOHO_MAIL_INBOX_FOLDER_ID is not configured — rejecting");
    return NextResponse.json({ error: "ZOHO_MAIL_INBOX_FOLDER_ID is not configured" }, { status: 500 });
  }

  const { data: cursorRow } = await adminClient
    .from("email_poll_cursor")
    .select("last_received_time")
    .eq("id", CURSOR_ID)
    .maybeSingle();

  let messages: ZohoMailMessageSummary[];
  try {
    messages = await listNewMessages({ folderId, sinceReceivedTime: cursorRow?.last_received_time ?? null });
  } catch (e) {
    console.error("[cron/email-poll] failed to list messages", e);
    return NextResponse.json({ error: "Failed to list messages" }, { status: 502 });
  }

  let processed = 0;
  for (const summary of messages) {
    try {
      await processMessage(summary);
      // Advance the cursor only after a successful process — a failure leaves it in place so
      // the next poll retries this message. email_message_id dedupe (below) makes that safe.
      await adminClient
        .from("email_poll_cursor")
        .update({ last_received_time: summary.receivedTime, updated_at: new Date().toISOString() })
        .eq("id", CURSOR_ID);
      processed++;
    } catch (e) {
      console.error(`[cron/email-poll] failed to process message ${summary.messageId}`, e);
    }
  }

  return NextResponse.json({ polled: messages.length, processed });
}

async function processMessage(summary: ZohoMailMessageSummary): Promise<void> {
  // adminClient used throughout — this is a cron-triggered route with no user session, same
  // exception as (public) onboarding routes / the Zoho Desk webhook listener per CLAUDE.md.

  // Idempotency — a re-poll of a message already processed (e.g. after another message in the
  // same batch failed and blocked the cursor) must not create a duplicate ticket_message.
  const { data: existingMessage } = await adminClient
    .from("ticket_messages")
    .select("id")
    .eq("email_message_id", summary.messageId)
    .maybeSingle();
  if (existingMessage) return;

  const email = await toParsedInboundEmail(summary);

  // Thread match: Zoho Mail's threadId groups a full conversation server-side — no
  // In-Reply-To/References header parsing needed, unlike the Resend-era design.
  const { data: existingTicket } = await adminClient
    .from("tickets")
    .select("id")
    .eq("zoho_mail_thread_id", email.threadId)
    .maybeSingle();

  let ticketId = existingTicket?.id ?? null;

  // Fallback match: a ticket created before this thread had any replies (or one imported from
  // an older code path) may still have zoho_mail_thread_id: null. Zoho's threadId convention is
  // "the root message's own messageId" (see src/lib/zoho/mail.ts), so a reply's threadId will
  // match the ORIGINAL message's stored email_message_id even if the ticket row itself was
  // never backfilled. Catch that case and backfill the ticket for future direct-hit lookups.
  if (!ticketId) {
    const { data: rootMessage } = await adminClient
      .from("ticket_messages")
      .select("ticket_id")
      .eq("email_message_id", email.threadId)
      .maybeSingle();
    if (rootMessage) {
      ticketId = rootMessage.ticket_id;
      await adminClient.from("tickets").update({ zoho_mail_thread_id: email.threadId }).eq("id", ticketId);
    }
  }

  if (!ticketId) {
    // Requester -> customer_id resolution mirrors the desk-tickets import's contact-based
    // match (task 302). No match -> null (migration 114's nullable precedent) — the ticket
    // still lands in the staff queue (tickets_staff_all RLS has no customer_id condition).
    const { data: contactMatches } = await adminClient
      .from("contacts")
      .select("customer_id")
      .ilike("email", email.from)
      .not("customer_id", "is", null)
      .limit(1);

    const { data: newTicket, error: ticketError } = await adminClient
      .from("tickets")
      .insert({
        customer_id: contactMatches?.[0]?.customer_id ?? null,
        subject: email.subject,
        channel: "email",
        status: "new",
        priority: "normal",
        requester_email: email.from,
        zoho_mail_thread_id: email.threadId,
      })
      .select("id")
      .single();

    if (ticketError || !newTicket) throw new Error(`failed to create ticket: ${ticketError?.message}`);
    ticketId = newTicket.id;
  }

  const bodyIsHtml = !!email.html;
  const body = email.html ?? email.text ?? "";

  const { data: newMessage, error: messageError } = await adminClient
    .from("ticket_messages")
    .insert({
      ticket_id: ticketId,
      author_type: "client",
      visibility: "public",
      body,
      email_message_id: summary.messageId,
      source_meta: { contentType: bodyIsHtml ? "text/html" : "text/plain" },
    })
    .select("id")
    .single();

  if (messageError || !newMessage) throw new Error(`failed to create ticket_message: ${messageError?.message}`);

  // Attachments — stored in the existing ticket-attachments bucket + attachments table
  // (entity_type: 'ticket_message'), same shape the ticket-attachments import route already
  // writes (task 306). external_id doubles as an idempotency key for a retried upload.
  for (const att of email.attachments) {
    try {
      if (att.size > MAX_SIZE) {
        console.warn(`[cron/email-poll] attachment ${att.attachmentId} exceeds ${MAX_SIZE} bytes, skipping`);
        continue;
      }
      const buffer = await downloadAttachment(summary.messageId, summary.folderId, att.attachmentId);
      const safeFilename = att.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${newMessage.id}/${att.attachmentId}_${safeFilename}`;

      const { error: uploadError } = await adminClient.storage.from(BUCKET).upload(storagePath, buffer, { upsert: true });
      if (uploadError) {
        console.warn(`[cron/email-poll] attachment ${att.attachmentId} storage upload failed`, uploadError.message);
        continue;
      }

      await adminClient.from("attachments").upsert(
        {
          external_id: att.attachmentId,
          entity_type: "ticket_message",
          entity_id: newMessage.id,
          storage_path: storagePath,
          filename: att.fileName,
          size: att.size,
        },
        { onConflict: "external_id" }
      );
    } catch (e) {
      console.error(`[cron/email-poll] attachment ${att.attachmentId} processing failed`, e);
    }
  }
}
