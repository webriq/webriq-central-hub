import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { sendNewEmail, sendReply } from "@/lib/zoho/mail";
import { replyOnDirectTicket } from "@/lib/stackshift-support/direct-reply";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Same rule the ticket page renders by (page.tsx isHtml). Every writer, Desk imports included,
// stamps source_meta.contentType, so no tag sniffing — that misread plain text like "<a@b.com>".
function isHtmlBody(sourceMeta: unknown): boolean {
  return (sourceMeta as { contentType?: string } | null)?.contentType === "text/html";
}

const EMAIL_RE = /^[^\s@,;<>"]+@[^\s@,;<>"]+\.[^\s@,;<>"]+$/;
const MAX_RECIPIENTS = 20;

// Validates the optional to/cc/bcc string arrays: trims, lowercases-for-dedupe, and drops an
// address already present in an earlier list (To beats CC beats BCC) so no one gets it twice.
function parseRecipients(
  body: Record<string, unknown>
): { to: string[] | null; cc: string[]; bcc: string[] } | { error: string } {
  const seen = new Set<string>();
  const lists: Record<"to" | "cc" | "bcc", string[] | null> = { to: null, cc: null, bcc: null };
  for (const field of ["to", "cc", "bcc"] as const) {
    const raw = body[field];
    if (raw === undefined) continue;
    if (!Array.isArray(raw) || raw.some((v) => typeof v !== "string")) {
      return { error: `"${field}" must be an array of email addresses` };
    }
    const list: string[] = [];
    for (const value of raw as string[]) {
      const email = value.trim();
      if (!EMAIL_RE.test(email)) return { error: `Invalid email address: ${email || "(empty)"}` };
      if (seen.has(email.toLowerCase())) continue;
      seen.add(email.toLowerCase());
      list.push(email);
    }
    lists[field] = list;
  }
  if (seen.size > MAX_RECIPIENTS) return { error: `At most ${MAX_RECIPIENTS} recipients per reply` };
  return { to: lists.to, cc: lists.cc ?? [], bcc: lists.bcc ?? [] };
}

// Mail-client-style quote ("On <date>, <author> wrote:" + blockquote) appended below the reply.
function withQuotedMessage(
  replyHtml: string,
  quoted: { body: string; createdAt: string; isHtml: boolean; author: string }
): string {
  const date = new Date(quoted.createdAt).toUTCString();
  // Stored inline images point at relative, auth-gated Hub routes (inline-images.ts) that a mail
  // client can't load — swap them for a placeholder rather than send broken-image boxes.
  const quotedHtml = quoted.isHtml
    ? quoted.body.replace(/<img\b[^>]*\bsrc=["']\/api\/[^"']*["'][^>]*>/gi, "[image]")
    : escapeHtml(quoted.body).replace(/\r?\n/g, "<br>");
  return (
    `${replyHtml}<br><div>On ${escapeHtml(date)}, ${escapeHtml(quoted.author)} wrote:</div>` +
    `<blockquote style="margin:0 0 0 0.8ex;border-left:1px solid #ccc;padding-left:1ex">${quotedHtml}</blockquote>`
  );
}

// Customer-facing reply (task 316, migrated from Resend to the Zoho Mail API by task 318) —
// sends a real email via Zoho Mail's native reply endpoint (or, task 458, a fresh "Re:" email
// quoting the last message when the ticket has no mail message to thread off) to the
// staff-chosen To/Cc/Bcc and, only on send success, records
// it as a public ticket_messages row. Staff-only, same role gate and adminClient-write
// precedent as notes/route.ts. Not AI-drafted (see src/lib/ai/reply.ts for that, unrelated flow).
export async function POST(request: NextRequest, { params }: { params: Promise<{ ticketId: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["admin", "super_admin", "pm"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Task 382 — routes by inbox.id (UUID), not the "TKT-<n>" display key. See _resolve.ts.
  const { ticketId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ticketId)) {
    return NextResponse.json({ error: "Invalid ticket id" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const replyBody = typeof body.body === "string" ? body.body.trim() : "";
  // Task 320 — body is now Tiptap HTML; an "empty" editor still serializes to "<p></p>", which
  // is a non-empty string, so a plain truthiness check no longer rejects an empty reply.
  if (!replyBody || replyBody.replace(/<[^>]*>/g, "").trim().length === 0) {
    return NextResponse.json({ error: "Reply body is required" }, { status: 400 });
  }

  const { data: ticket } = await adminClient
    .from("inbox")
    .select("id, subject, requester_email, external_contact_id, channel")
    .eq("id", ticketId)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

  // Task 446 — direct StackShift tickets have no Zoho Mail thread; the reply goes out through the outbox.
  // Every other channel falls through to the unchanged Zoho Mail path below.
  if (ticket.channel === "stackshift") {
    const direct = await replyOnDirectTicket({ ticket, staffUserId: user.id, bodyHtml: replyBody });
    return direct.ok ? NextResponse.json({ ok: true, id: direct.id }) : NextResponse.json({ error: direct.error }, { status: 500 });
  }

  let contactEmail: string | null = null;
  if (ticket.external_contact_id) {
    const { data: contact } = await adminClient
      .from("contacts")
      .select("email")
      .eq("external_id", ticket.external_contact_id)
      .maybeSingle();
    contactEmail = contact?.email ?? null;
  }
  const recipient = contactEmail ?? ticket.requester_email;

  // Staff-editable To/CC/BCC from the composer. An absent `to` keeps the old behaviour (the
  // resolved ticket contact only); a sent `to` replaces it, so the contact can be removed.
  const parsed = parseRecipients(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const to = parsed.to ?? (recipient ? [recipient] : []);
  const { cc, bcc } = parsed;
  if (to.length === 0) {
    return NextResponse.json({ error: "Add at least one To recipient" }, { status: 400 });
  }

  // Reply target: Zoho Mail's reply endpoint threads natively off a specific message ID (path
  // param), unlike Resend's manual In-Reply-To/References headers. Replying to the most recent
  // message in the thread keeps the conversation's tip growing correctly for multi-hop chains.
  // No such message (Desk-imported / Desk-polled ticket) -> fresh email fallback below.
  const { data: latestMessage } = await adminClient
    .from("inbox_messages")
    .select("email_message_id")
    .eq("inbox_id", ticket.id)
    .not("email_message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const from = process.env.ZOHO_MAIL_FROM_ADDRESS;
  if (!from) {
    // Fail loudly — never silently fall back to an unconfigured From address for a
    // customer-facing send (same "missing secret -> reject, don't fall open" posture used
    // throughout this codebase's other provider integrations).
    return NextResponse.json({ error: "ZOHO_MAIL_FROM_ADDRESS is not configured — cannot send ticket reply" }, { status: 500 });
  }

  const subject = /^re:/i.test(ticket.subject) ? ticket.subject : `Re: ${ticket.subject}`;

  let messageId: string | null;
  try {
    let result: { messageId: string | null };
    if (latestMessage?.email_message_id) {
      result = await sendReply({
        replyToMessageId: latestMessage.email_message_id,
        from,
        to,
        cc,
        bcc,
        subject,
        content: replyBody,
      });
    } else {
      // No Zoho Mail message to thread off — Desk-imported / Desk-polled tickets never carry an
      // email_message_id. Send a fresh "Re:" email that quotes the last public message so it
      // still reads as a reply in the customer's inbox. The Hub row below is the same staff
      // reply row either way (body without the quote), so the thread shows it as a normal reply.
      const { data: lastPublic } = await adminClient
        .from("inbox_messages")
        .select("author_type, body, created_at, source_meta")
        .eq("inbox_id", ticket.id)
        .eq("visibility", "public")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      result = await sendNewEmail({
        from,
        to,
        cc,
        bcc,
        subject,
        content: lastPublic
          ? withQuotedMessage(replyBody, {
              body: lastPublic.body,
              createdAt: lastPublic.created_at,
              isHtml: isHtmlBody(lastPublic.source_meta),
              author: lastPublic.author_type === "client" ? (recipient ?? to[0]) : from,
            })
          : replyBody,
      });
    }
    messageId = result.messageId;
  } catch (e) {
    console.error("[api/desk/tickets/[ticketId]/reply] send failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to send reply" }, { status: 502 });
  }

  const { data, error } = await adminClient
    .from("inbox_messages")
    .insert({
      inbox_id: ticket.id,
      author_type: "staff",
      author_id: user.id,
      body: replyBody,
      visibility: "public",
      email_message_id: messageId,
      // Task 320 — body is now Tiptap HTML, not plain text. Without this the detail page's
      // isHtml check (contentTypeMeta === "text/html") stays false for our own outgoing
      // messages and they render as escaped raw tags instead of formatted HTML.
      // `recipients` is what the thread shows as To/Cc/Bcc on this reply.
      source_meta: { contentType: "text/html", recipients: { to, cc, bcc } },
    })
    .select("id")
    .single();

  if (error || !data) {
    // Email was already sent successfully at this point — a failure here means the reply
    // reached the customer but isn't recorded in the Hub thread. Surface distinctly so staff
    // know not to resend (that would email the customer twice), not just "reply failed".
    console.error("[api/desk/tickets/[ticketId]/reply] sent but insert failed:", error?.message);
    return NextResponse.json(
      { error: "Reply was sent to the customer but failed to save in the ticket thread — do not resend." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: data.id });
}
