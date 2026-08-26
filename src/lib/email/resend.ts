import { randomUUID } from "crypto";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendInvitationEmail(to: string, fullName: string, tempPassword: string) {
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "WebriQ Hub <onboarding@resend.dev>",
    to,
    subject: "You've been invited to WebriQ Central Hub",
    text: [
      `Hi ${fullName},`,
      ``,
      `You've been invited to join WebriQ Central Hub.`,
      ``,
      `Email: ${to}`,
      `Temporary Password: ${tempPassword}`,
      ``,
      `Sign in at: ${process.env.NEXT_PUBLIC_APP_URL ?? "https://hub.webriq.com"}/auth/login`,
      `You will be prompted to set a new password after your first login.`,
    ].join("\n"),
  });
}

export async function sendOtpEmail(to: string, code: string) {
  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL ?? "WebriQ Hub <onboarding@resend.dev>",
    to,
    subject: `${code} — Your WebriQ Hub verification code`,
    text: [
      `Your verification code is: ${code}`,
      ``,
      `This code expires in 10 minutes.`,
      `If you did not request this, contact your administrator.`,
    ].join("\n"),
  });
}

// Outbound ticket reply (task 316) — deliberately separate from the invite/OTP senders above:
// this is the only sender that needs to thread into an existing customer email conversation.
//
// CreateEmailResponseSuccess only returns Resend's internal { id }, not an RFC 5322
// Message-ID — so instead of depending on an unconfirmed mapping between the two, this
// generates its own Message-ID up front, sets it explicitly via the documented `headers`
// passthrough ("Custom headers to add to the email" — resend@6.18.0 CreateEmailBaseOptions),
// and returns that same value to the caller to store as ticket_messages.email_message_id.
// That keeps the stored id exactly equal to what the wire Message-ID header will be, with no
// guessing about Resend's internal id format. Needs a live send to confirm Resend doesn't
// override a caller-supplied Message-ID header (not verifiable without a live account/domain
// — see task 316 Open Decision 2).
export async function sendTicketReply(input: {
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string | null;
  references?: string[];
}): Promise<{ messageId: string }> {
  const from = process.env.RESEND_TICKET_REPLY_FROM_EMAIL;
  if (!from) {
    // Fail loudly — never silently fall back to an unverified/wrong From address for a
    // customer-facing send (same "missing secret -> reject, don't fall open" posture as
    // RESEND_INBOUND_WEBHOOK_SECRET in src/lib/email/inbound.ts).
    throw new Error("RESEND_TICKET_REPLY_FROM_EMAIL is not configured — cannot send ticket reply");
  }

  const domain = from.match(/<([^>]+)>/)?.[1]?.split("@")[1] ?? from.split("@")[1] ?? "webriq.services";
  const messageId = `<ticket-reply-${randomUUID()}@${domain}>`;

  const headers: Record<string, string> = { "Message-ID": messageId };
  if (input.inReplyTo) headers["In-Reply-To"] = input.inReplyTo;
  if (input.references && input.references.length > 0) headers["References"] = input.references.join(" ");

  const { error } = await resend.emails.send({
    from,
    to: input.to,
    subject: input.subject,
    text: input.text,
    headers,
  });
  if (error) throw new Error(error.message);

  return { messageId };
}
