import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { sendReply } from "@/lib/zoho/mail";

// Customer-facing reply (task 316, migrated from Resend to the Zoho Mail API by task 318) —
// sends a real email via Zoho Mail's native reply endpoint and, only on send success, records
// it as a public ticket_messages row. Staff-only, same role gate and adminClient-write
// precedent as notes/route.ts. Not AI-drafted (see src/lib/ai/reply.ts for that, unrelated flow).
export async function POST(request: NextRequest, { params }: { params: Promise<{ ticketNumber: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!["admin", "super_admin", "pm"].includes(profile?.role ?? "")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { ticketNumber: ticketNumberParam } = await params;
  const ticketNumber = Number(ticketNumberParam);
  if (!Number.isInteger(ticketNumber)) {
    return NextResponse.json({ error: "Invalid ticket number" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const replyBody = typeof body.body === "string" ? body.body.trim() : "";
  if (!replyBody) {
    return NextResponse.json({ error: "Reply body is required" }, { status: 400 });
  }

  const { data: ticket } = await adminClient
    .from("tickets")
    .select("id, subject, requester_email, external_contact_id")
    .eq("ticket_number", ticketNumber)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ error: "Ticket not found" }, { status: 404 });

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
  if (!recipient) {
    return NextResponse.json({ error: "No recipient email on file for this ticket" }, { status: 400 });
  }

  // Reply target: Zoho Mail's reply endpoint threads natively off a specific message ID (path
  // param), unlike Resend's manual In-Reply-To/References headers. Replying to the most recent
  // message in the thread keeps the conversation's tip growing correctly for multi-hop chains.
  const { data: latestMessage } = await adminClient
    .from("ticket_messages")
    .select("email_message_id")
    .eq("ticket_id", ticket.id)
    .not("email_message_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!latestMessage?.email_message_id) {
    return NextResponse.json({ error: "No prior email message to reply to on this ticket" }, { status: 400 });
  }

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
    const result = await sendReply({
      replyToMessageId: latestMessage.email_message_id,
      from,
      to: recipient,
      subject,
      content: replyBody,
    });
    messageId = result.messageId;
  } catch (e) {
    console.error("[api/desk/tickets/[ticketNumber]/reply] send failed:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to send reply" }, { status: 502 });
  }

  const { data, error } = await adminClient
    .from("ticket_messages")
    .insert({
      ticket_id: ticket.id,
      author_type: "staff",
      author_id: user.id,
      body: replyBody,
      visibility: "public",
      email_message_id: messageId,
    })
    .select("id")
    .single();

  if (error || !data) {
    // Email was already sent successfully at this point — a failure here means the reply
    // reached the customer but isn't recorded in the Hub thread. Surface distinctly so staff
    // know not to resend (that would email the customer twice), not just "reply failed".
    console.error("[api/desk/tickets/[ticketNumber]/reply] sent but insert failed:", error?.message);
    return NextResponse.json(
      { error: "Reply was sent to the customer but failed to save in the ticket thread — do not resend." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: data.id });
}
