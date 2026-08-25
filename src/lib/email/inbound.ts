// Inbound-email helpers (task 303) — separate from resend.ts (outbound send).
// Verified against the installed resend@6.18.0 package's own type definitions, not assumed:
// webhooks.verify() wraps Svix signature verification; email.received webhook payloads are
// metadata-only (no body/headers/attachment content) — the full email must be fetched
// separately via emails.receiving.get(), and each attachment's download_url via
// emails.receiving.attachments.get(). See resend.com/docs/dashboard/receiving.
import { Resend } from "resend";
import type { WebhookEventPayload } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export type ParsedInboundEmail = {
  emailId: string;
  from: string;
  to: string[];
  subject: string;
  messageId: string;
  html: string | null;
  text: string | null;
  headers: Record<string, string> | null;
  attachments: { id: string; filename: string | null; contentType: string; size: number }[];
};

export function verifyResendWebhook(
  payload: string,
  headers: { id: string; timestamp: string; signature: string }
): WebhookEventPayload {
  const webhookSecret = process.env.RESEND_INBOUND_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error("RESEND_INBOUND_WEBHOOK_SECRET is not configured");
  // Throws if the signature is invalid — callers must catch, not assume a valid return.
  return resend.webhooks.verify({ payload, headers, webhookSecret });
}

export async function fetchReceivedEmail(emailId: string): Promise<ParsedInboundEmail> {
  const { data, error } = await resend.emails.receiving.get(emailId);
  if (error || !data) throw new Error(error?.message ?? `Failed to fetch received email ${emailId}`);
  return {
    emailId: data.id,
    from: data.from,
    to: data.to,
    subject: data.subject,
    messageId: data.message_id,
    html: data.html,
    text: data.text,
    headers: data.headers,
    attachments: data.attachments.map((a) => ({
      id: a.id,
      filename: a.filename,
      contentType: a.content_type,
      size: a.size,
    })),
  };
}

export async function fetchAttachmentDownloadUrl(
  emailId: string,
  attachmentId: string
): Promise<{ downloadUrl: string; filename: string | null; size: number; contentType: string }> {
  const { data, error } = await resend.emails.receiving.attachments.get({ emailId, id: attachmentId });
  if (error || !data) throw new Error(error?.message ?? `Failed to fetch attachment ${attachmentId}`);
  return { downloadUrl: data.download_url, filename: data.filename ?? null, size: data.size, contentType: data.content_type };
}

// Case-insensitive header lookup — Resend returns headers with whatever casing the
// original email used (e.g. "In-Reply-To" vs "in-reply-to").
export function getHeader(headers: Record<string, string> | null, name: string): string | null {
  if (!headers) return null;
  const target = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === target) return value;
  }
  return null;
}

// References header is a whitespace-separated list of Message-IDs, oldest first.
export function parseReferences(referencesHeader: string | null): string[] {
  if (!referencesHeader) return [];
  return referencesHeader.split(/\s+/).map((s) => s.trim()).filter(Boolean);
}

// Resend's `from` has always been a bare address in observed payloads, but email headers
// can carry a "Name <addr>" display form — defensively unwrap it either way.
export function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim();
}
