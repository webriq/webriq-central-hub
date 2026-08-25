// Inbound-email webhook (task 303) — Resend `email.received` events for helpdesk@webriq.services
// (or its Zoho Mail forwarding target, see task doc Open Decision 2). Creates/appends native
// tickets/ticket_messages rows, the live counterpart to the batch Desk Tickets import (task
// 296/302). Separate route from src/app/api/webhooks/route.ts (Zoho) — different provider,
// different signing scheme, kept independent per that route's Out-of-Scope boundary.
import { NextRequest, NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import {
  verifyResendWebhook,
  fetchReceivedEmail,
  fetchAttachmentDownloadUrl,
  getHeader,
  parseReferences,
  extractEmailAddress,
} from "@/lib/email/inbound";

const BUCKET = "ticket-attachments";
const MAX_SIZE = 52428800; // 50MB — matches the bucket's file_size_limit (migration 117)

export async function POST(req: NextRequest) {
  const rawText = await req.text().catch(() => "");

  // Signature verification is mandatory — without it this endpoint would accept
  // unauthenticated requests that create tickets/messages from a forged sender. A missing
  // secret is a misconfiguration, not an "allow all" fallback — same principle as
  // ZOHO_WEBHOOK_SECRET in src/app/api/webhooks/route.ts.
  const webhookSecret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("[webhook/email] RESEND_INBOUND_WEBHOOK_SECRET is not configured — rejecting request");
    return NextResponse.json({ received: true }); // 200 so Resend doesn't retry
  }

  const svixId = req.headers.get("svix-id") ?? "";
  const svixTimestamp = req.headers.get("svix-timestamp") ?? "";
  const svixSignature = req.headers.get("svix-signature") ?? "";

  let event;
  try {
    event = verifyResendWebhook(rawText, { id: svixId, timestamp: svixTimestamp, signature: svixSignature });
  } catch (e) {
    console.warn("[webhook/email] signature verification failed", e instanceof Error ? e.message : e);
    return NextResponse.json({ received: true });
  }

  if (event.type !== "email.received") {
    // Subscribed to email.received only, but tolerate other event types being sent to the
    // same endpoint (e.g. if the Resend dashboard webhook config is later widened) rather
    // than erroring.
    return NextResponse.json({ received: true });
  }

  const emailId = event.data.email_id;

  let email;
  try {
    // Webhook payloads are metadata-only (no body/headers/attachment content) — this fetches
    // the full email via the Receiving API. See src/lib/email/inbound.ts.
    email = await fetchReceivedEmail(emailId);
  } catch (e) {
    console.error("[webhook/email] failed to fetch received email", emailId, e);
    return NextResponse.json({ received: true });
  }

  const messageId = email.messageId;
  const fromAddress = extractEmailAddress(email.from);

  // adminClient used throughout this route — Resend's server-to-server webhook has no user
  // session, same exception as (public) onboarding routes / the Zoho webhook listener per
  // CLAUDE.md.

  // Idempotency — a provider retry of the same email must not create a duplicate message.
  const { data: existingMessage } = await adminClient
    .from("ticket_messages")
    .select("id")
    .eq("email_message_id", messageId)
    .maybeSingle();
  if (existingMessage) {
    return NextResponse.json({ received: true });
  }

  // Thread match: a reply's In-Reply-To/References carry the Message-ID(s) of prior messages
  // in the thread. Any match to an existing ticket_messages.email_message_id means "append",
  // not "create".
  const inReplyTo = getHeader(email.headers, "In-Reply-To");
  const references = parseReferences(getHeader(email.headers, "References"));
  const threadCandidates = [inReplyTo, ...references].filter((v): v is string => !!v);

  let ticketId: string | null = null;
  if (threadCandidates.length > 0) {
    const { data: matched } = await adminClient
      .from("ticket_messages")
      .select("ticket_id")
      .in("email_message_id", threadCandidates)
      .limit(1);
    ticketId = matched?.[0]?.ticket_id ?? null;
  }

  const bodyIsHtml = !!email.html;
  const body = email.html ?? email.text ?? "";

  if (!ticketId) {
    // Requester -> customer_id resolution mirrors the desk-tickets import's contact-based
    // match (task 302): contacts.email -> contacts.customer_id. No match -> null, same
    // nullable precedent as migration 114 — the ticket still lands in the staff queue
    // (tickets_staff_all RLS has no customer_id condition) instead of being dropped.
    const { data: contactMatches } = await adminClient
      .from("contacts")
      .select("customer_id")
      .ilike("email", fromAddress)
      .not("customer_id", "is", null)
      .limit(1);

    const { data: newTicket, error: ticketError } = await adminClient
      .from("tickets")
      .insert({
        customer_id: contactMatches?.[0]?.customer_id ?? null,
        subject: email.subject || "(no subject)",
        channel: "email",
        status: "new",
        priority: "normal",
        requester_email: fromAddress,
      })
      .select("id")
      .single();

    if (ticketError || !newTicket) {
      console.error("[webhook/email] failed to create ticket", ticketError);
      return NextResponse.json({ received: true });
    }
    ticketId = newTicket.id;
  }

  const { data: newMessage, error: messageError } = await adminClient
    .from("ticket_messages")
    .insert({
      ticket_id: ticketId,
      author_type: "client",
      visibility: "public",
      body,
      email_message_id: messageId,
      source_meta: { contentType: bodyIsHtml ? "text/html" : "text/plain" },
    })
    .select("id")
    .single();

  if (messageError || !newMessage) {
    console.error("[webhook/email] failed to create ticket_message", messageError);
    return NextResponse.json({ received: true });
  }

  // Attachments — stored in the existing ticket-attachments bucket + attachments table
  // (entity_type: 'ticket_message'), same shape the ticket-attachments import route already
  // writes (task 306). external_id = Resend's attachment id doubles as an idempotency key,
  // matching the "source system ID" precedent (migration 035) even though the source here is
  // Resend, not Zoho — a webhook retry that somehow reached this point again would upsert
  // rather than duplicate.
  for (const att of email.attachments) {
    try {
      const { downloadUrl, filename, size, contentType } = await fetchAttachmentDownloadUrl(emailId, att.id);
      if (size > MAX_SIZE) {
        console.warn(`[webhook/email] attachment ${att.id} exceeds ${MAX_SIZE} bytes, skipping`);
        continue;
      }
      const res = await fetch(downloadUrl);
      if (!res.ok) {
        console.warn(`[webhook/email] attachment ${att.id} download failed: HTTP ${res.status}`);
        continue;
      }
      const buffer = await res.arrayBuffer();
      const safeFilename = (filename ?? att.id).replace(/[^a-zA-Z0-9._-]/g, "_");
      const storagePath = `${newMessage.id}/${att.id}_${safeFilename}`;

      const { error: uploadError } = await adminClient.storage
        .from(BUCKET)
        .upload(storagePath, buffer, { upsert: true, contentType });
      if (uploadError) {
        console.warn(`[webhook/email] attachment ${att.id} storage upload failed`, uploadError.message);
        continue;
      }

      await adminClient.from("attachments").upsert(
        {
          external_id: att.id,
          entity_type: "ticket_message",
          entity_id: newMessage.id,
          storage_path: storagePath,
          filename: filename ?? safeFilename,
          size,
        },
        { onConflict: "external_id" }
      );
    } catch (e) {
      console.error(`[webhook/email] attachment ${att.id} processing failed`, e);
    }
  }

  return NextResponse.json({ received: true });
}
