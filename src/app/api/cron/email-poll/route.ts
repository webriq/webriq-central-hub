// Inbound-email poll (task 303, migrated from a Resend webhook to Zoho Mail polling by task
// 318). Cron-triggered — same auth pattern as /api/digest (x-cron-secret header or a valid
// user session) rather than a provider webhook signature, since there is no webhook anymore.
// Creates/appends native tickets/ticket_messages rows, the live counterpart to the batch Desk
// Tickets import (task 296/302). Separate from src/app/api/webhooks/route.ts (Zoho
// Desk/Projects event webhooks) — unrelated provider and payload shape.
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { listNewMessages, downloadAttachment, type ZohoMailMessageSummary } from "@/lib/zoho/mail";
import { toParsedInboundEmail } from "@/lib/email/inbound";
import { applyInlineImages, INLINE_IMAGE_BUCKET as BUCKET } from "@/lib/email/inline-images";
import { shouldIngestEmail } from "@/lib/email/intake-filter";
import { parseSupportFormEmail, buildSupportFormBody } from "@/lib/email/support-form";
import { subjectsMatch } from "@/lib/email/subject";
import { notifyCustomerTicketCreated } from "@/lib/desk/customer-view-access";

const MAX_SIZE = 52428800; // 50MB — matches the bucket's file_size_limit (migration 117)
const CURSOR_ID = "helpdesk";
// Fallback thread match (task 327): how far back to look for a same-sender/same-subject ticket
// when no id-match exists (imported tickets can't be id-matched — see processMessage).
const THREAD_MATCH_LOOKBACK_DAYS = 180;

type ProcessOutcome = "ingested" | "skipped" | "duplicate";

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

  // Keep the ticket_number serial ahead of every imported Zoho number (task 327 / migration
  // 124) so a ticket created below advances from ~21008+, not a stale low serial. Idempotent;
  // non-fatal — a poll that skips this just risks the pre-task-326 numbering.
  const { error: seqError } = await adminClient.rpc("sync_ticket_number_sequence");
  if (seqError) console.error("[cron/email-poll] sync_ticket_number_sequence failed:", seqError.message);

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
  let skipped = 0;
  for (const summary of messages) {
    try {
      const outcome = await processMessage(summary);
      // Advance the cursor only after a successful process — a failure leaves it in place so
      // the next poll retries this message. email_message_id dedupe (below) makes that safe.
      // A filtered-out ("skipped") message still advances the cursor: it is intentionally
      // dropped and must not be reconsidered every poll.
      await adminClient
        .from("email_poll_cursor")
        .update({ last_received_time: summary.receivedTime, updated_at: new Date().toISOString() })
        .eq("id", CURSOR_ID);
      if (outcome === "ingested") processed++;
      else if (outcome === "skipped") skipped++;
    } catch (e) {
      console.error(`[cron/email-poll] failed to process message ${summary.messageId}`, e);
    }
  }

  return NextResponse.json({ polled: messages.length, processed, skipped });
}

async function processMessage(summary: ZohoMailMessageSummary): Promise<ProcessOutcome> {
  // adminClient used throughout — this is a cron-triggered route with no user session, same
  // exception as (public) onboarding routes / the Zoho Desk webhook listener per CLAUDE.md.

  // Idempotency — a re-poll of a message already processed (e.g. after another message in the
  // same batch failed and blocked the cursor) must not create a duplicate ticket_message.
  const { data: existingMessage } = await adminClient
    .from("inbox_messages")
    .select("id")
    .eq("email_message_id", summary.messageId)
    .maybeSingle();
  if (existingMessage) return "duplicate";

  // Intake filter (task 327) — drop the Hub's own system mail and other automation before it
  // becomes a ticket. Runs on the cheap summary fields, before the (slower) content parse.
  const gate = shouldIngestEmail({
    fromAddress: summary.fromAddress,
    fromName: summary.fromName,
    subject: summary.subject,
  });
  if (!gate.ingest) {
    console.log(`[cron/email-poll] skipped ${summary.messageId} from "${summary.fromRaw}": ${gate.reason}`);
    return "skipped";
  }

  const email = await toParsedInboundEmail(summary);

  // Task 352 — the webriq.com support form relays every submission from no-reply@webriq.me
  // (allowlisted past the intake filter as source "webriq-support-form"). The real submitter,
  // their subject, and their message are fields inside the body, not the envelope — parse them
  // out so ticket attribution, contact matching, thread matching, and staff replies all use
  // the customer's own address instead of the no-reply relay. Parse failure -> fall back to
  // the raw envelope (still better than dropping a real support request).
  let requesterEmail = email.from;
  let ticketSubject = email.subject;
  let formBody: string | null = null;
  if (gate.source === "webriq-support-form") {
    const form = parseSupportFormEmail(email);
    if (form?.requesterEmail) {
      requesterEmail = form.requesterEmail;
      ticketSubject = form.subject?.trim() || email.subject;
      formBody = buildSupportFormBody(form);
    } else {
      console.warn(`[cron/email-poll] ${summary.messageId}: support-form parse failed — using raw envelope`);
    }
  }

  let ticketId: string | null = null;
  let ticketNumber: number | null = null;
  // Status of a pre-existing ticket this message was matched onto (null when we create a new
  // ticket) — drives the closed -> open reopen below.
  let matchedTicketStatus: string | null = null;

  // Match 1 — Zoho Mail's threadId groups a full conversation server-side; a ticket we created
  // stores it as zoho_mail_thread_id.
  const { data: existingTicket } = await adminClient
    .from("inbox")
    .select("id, ticket_number, status")
    .eq("zoho_mail_thread_id", email.threadId)
    .maybeSingle();
  if (existingTicket) {
    ticketId = existingTicket.id;
    ticketNumber = existingTicket.ticket_number;
    matchedTicketStatus = existingTicket.status;
  }

  // Match 2 — a ticket created before this thread had any replies may still have
  // zoho_mail_thread_id: null. Zoho's threadId convention is "the root message's own
  // messageId", so a reply's threadId matches the ORIGINAL message's stored email_message_id.
  // Backfill the ticket for future direct-hit lookups.
  if (!ticketId) {
    const { data: rootMessage } = await adminClient
      .from("inbox_messages")
      .select("inbox_id")
      .eq("email_message_id", email.threadId)
      .maybeSingle();
    if (rootMessage) {
      ticketId = rootMessage.inbox_id;
      await adminClient.from("inbox").update({ zoho_mail_thread_id: email.threadId }).eq("id", ticketId);
      const { data: ticketRow } = await adminClient
        .from("inbox")
        .select("ticket_number, status")
        .eq("id", ticketId)
        .maybeSingle();
      ticketNumber = ticketRow?.ticket_number ?? null;
      matchedTicketStatus = ticketRow?.status ?? null;
    }
  }

  // Match 3 (task 327) — imported Desk tickets have no zoho_mail_thread_id and their messages
  // have no email_message_id (the Desk threads export carries no RFC822 Message-ID), so
  // matches 1 & 2 can never find them. Fall back to same-sender + same-normalized-subject
  // within a recent window, and backfill zoho_mail_thread_id so the next reply hits match 1.
  if (!ticketId) {
    const since = new Date(Date.now() - THREAD_MATCH_LOOKBACK_DAYS * 86_400_000).toISOString();
    const { data: candidates } = await adminClient
      .from("inbox")
      .select("id, ticket_number, status, subject, requester_email, zoho_mail_thread_id")
      .ilike("requester_email", requesterEmail)
      .gt("created_at", since)
      .order("created_at", { ascending: false })
      .limit(25);
    const match = (candidates ?? []).find(
      (t) =>
        (t.requester_email ?? "").toLowerCase() === requesterEmail.toLowerCase() &&
        subjectsMatch(t.subject, ticketSubject)
    );
    if (match) {
      ticketId = match.id;
      ticketNumber = match.ticket_number;
      matchedTicketStatus = match.status;
      if (!match.zoho_mail_thread_id) {
        await adminClient.from("inbox").update({ zoho_mail_thread_id: email.threadId }).eq("id", match.id);
      }
    }
  }

  if (!ticketId) {
    // Requester -> customer_id resolution mirrors the desk-tickets import's contact-based
    // match (task 302). No match -> null (migration 114's nullable precedent) — the ticket
    // still lands in the staff queue (tickets_staff_all RLS has no customer_id condition).
    const { data: contactMatches } = await adminClient
      .from("contacts")
      .select("customer_id")
      .ilike("email", requesterEmail)
      .not("customer_id", "is", null)
      .limit(1);

    const { data: newTicket, error: ticketError } = await adminClient
      .from("inbox")
      .insert({
        customer_id: contactMatches?.[0]?.customer_id ?? null,
        subject: ticketSubject,
        channel: "email",
        status: "open",
        priority: "normal",
        requester_email: requesterEmail,
        zoho_mail_thread_id: email.threadId,
      })
      .select("id, ticket_number")
      .single();

    if (ticketError || !newTicket) throw new Error(`failed to create ticket: ${ticketError?.message}`);
    ticketId = newTicket.id;
    ticketNumber = newTicket.ticket_number;

    // Task 379 — customer "ticket created" confirmation, only on genuine first creation (never
    // on a matched reply above). Best-effort/non-blocking — swallows its own failures.
    await notifyCustomerTicketCreated({
      ticketId,
      ticketNumber,
      subject: ticketSubject,
      requesterEmail,
    });
  }

  if (ticketNumber == null) throw new Error(`could not resolve ticket_number for ticket ${ticketId}`);
  // Belt-and-braces: every branch above sets ticketId before reaching here, but this narrows the
  // `string | null` type for the applyInlineImages() call below (task 382).
  if (!ticketId) throw new Error("could not resolve ticket id");

  // Reopen a closed ticket when the customer replies (task 327).
  if (matchedTicketStatus === "closed") {
    await adminClient.from("inbox").update({ status: "open" }).eq("id", ticketId);
  }

  // A parsed support-form body (task 352) is plain text we assembled ourselves — the raw HTML
  // (banner image, field markup) is discarded and there are no cid: inline images to resolve.
  const bodyIsHtml = formBody === null && !!email.html;
  let body = formBody ?? email.html ?? email.text ?? "";

  // The message id is generated up front (attachments.entity_id carries no FK constraint, so
  // referencing a not-yet-inserted row is safe) so inline images can be uploaded and their
  // stored attachment ids substituted into `body` BEFORE the single ticket_messages insert —
  // task 321. Regular (non-inline) attachments below still key off this same id.
  const newMessageId = randomUUID();

  const inlineResult =
    formBody !== null
      ? { body, rewrittenCids: [] as string[], storedButUnmatchedCids: [] as string[] }
      : await applyInlineImages({
          messageRowId: newMessageId,
          // Task 382 — the inline-image serving route now takes inbox.id (UUID) in the URL,
          // not the "TKT-<n>" display key ticketDisplayId used to hold here.
          ticketId,
          inlineImages: email.inlineImages,
          body,
        });
  body = inlineResult.body;

  // Flag the message when it still carries a dead inline-image <img src> — either IMAP
  // resolution recovered nothing (email.inlineImagesUnresolved, warned in inbound.ts) or the
  // bytes were stored but the cid token wasn't found in the src to rewrite. Gives a straggler
  // sweep and the render-time placeholder a precise, regex-free candidate list. Task 341.
  const inlineImagesUnresolved =
    formBody === null && (email.inlineImagesUnresolved || inlineResult.storedButUnmatchedCids.length > 0);

  const { data: newMessage, error: messageError } = await adminClient
    .from("inbox_messages")
    .insert({
      id: newMessageId,
      inbox_id: ticketId,
      author_type: "client",
      visibility: "public",
      body,
      email_message_id: summary.messageId,
      source_meta: {
        contentType: bodyIsHtml ? "text/html" : "text/plain",
        ...(inlineImagesUnresolved ? { inlineImagesUnresolved: true } : {}),
      },
    })
    .select("id")
    .single();

  if (messageError || !newMessage) throw new Error(`failed to create ticket_message: ${messageError?.message}`);

  // Attachments — stored in the existing ticket-attachments bucket + attachments table
  // (entity_type: 'inbox_message'), same shape the ticket-attachments import route already
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
          entity_type: "inbox_message",
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

  return "ingested";
}
