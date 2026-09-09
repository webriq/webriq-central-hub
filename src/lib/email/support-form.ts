// webriq.com Helpdesk "Submit a support ticket" form — body parser (task 352).
//
// The form relays every submission to the helpdesk mailbox from a fixed no-reply address
// (`no-reply@webriq.me`) with the literal subject "Submit ticket". The intake filter
// (src/lib/email/intake-filter.ts) allowlists that sender/subject pair and tags the decision
// `source: "webriq-support-form"`; the email-poll route then calls parseSupportFormEmail() to
// recover the actual submitter so the ticket is attributed to the customer's own address, not
// the relay.
//
// The body is a fixed template — one `key: value` line per form field:
//
//   Below are the details of form submission:
//
//   fullName: Jane Doe
//   email: jane@example.com
//   company: Acme Inc.
//   category: Technical issue
//   subject: Login broken
//   concern: <free text, may span multiple lines>
//   attachment: https://webriqforms-v2-pagebuilder-bucket.s3.us-west-2.amazonaws.com/...
//
// This is NOT a general rich-mail parser — it only understands that one template and returns
// null for anything else (a spoofed no-reply@webriq.me with no form body, a future template
// change, etc.), which the poll route treats as "ingest with the raw envelope + a warning".

import type { ParsedInboundEmail } from "./inbound";

export type SupportFormSubmission = {
  requesterName: string | null;
  requesterEmail: string | null;
  company: string | null;
  category: string | null;
  subject: string | null;
  concern: string;
  attachmentUrl: string | null;
};

// Present in every form email; its absence means this isn't a form submission.
const FORM_MARKER = /details of form submission/i;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const NAME_LABEL = /^\s*full\s*name\s*:\s*(.*)$/i;
const EMAIL_LABEL = /^\s*e-?mail\s*:\s*(.*)$/i;
const COMPANY_LABEL = /^\s*company\s*:\s*(.*)$/i;
const CATEGORY_LABEL = /^\s*category\s*:\s*(.*)$/i;
const SUBJECT_LABEL = /^\s*subject\s*:\s*(.*)$/i;
const CONCERN_LABEL = /^\s*concern\s*:/i;
const ATTACHMENT_LABEL = /^\s*attachment\s*:/i;

// The body arrives as HTML (a banner image + the field list). Collapse it to text: turn block
// boundaries into newlines, drop remaining tags, decode the handful of entities that show up.
function htmlToText(html: string): string {
  return html
    .replace(/<\s*(?:br|\/p|\/div|\/tr|\/li|\/h[1-6])\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&amp;/gi, "&");
}

// Value on the label line; if that's empty (a template that wraps the value to the next line),
// fall through to the next non-blank line.
function fieldValue(lines: string[], label: RegExp): string | null {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (!m) continue;
    if (m[1].trim()) return m[1].trim();
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].trim()) return lines[j].trim();
    }
    return null;
  }
  return null;
}

// "concern" runs from its label to the "attachment:" line (or end of body) so a multi-line
// message survives intact.
function concernValue(lines: string[]): string {
  const start = lines.findIndex((l) => CONCERN_LABEL.test(l));
  if (start === -1) return "";
  // CONCERN_LABEL already consumes "concern:", so only leading whitespace can remain.
  const collected = [lines[start].replace(CONCERN_LABEL, "").trimStart()];
  for (let i = start + 1; i < lines.length; i++) {
    if (ATTACHMENT_LABEL.test(lines[i])) break;
    collected.push(lines[i]);
  }
  return collected.join("\n").trim();
}

function attachmentUrl(text: string, html: string | null): string | null {
  // Prefer the anchor href — the mail client routinely wraps/truncates the visible URL text
  // (e.g. "https://…/1788…"), so the text match is only a fallback for plain-text bodies.
  if (html) {
    const nearLabel = html.match(/attachment[\s\S]{0,300}?href=["'](https?:\/\/[^"']+)["']/i);
    if (nearLabel) return nearLabel[1];
  }
  const inText = text.match(/attachment\s*:\s*(https?:\/\/\S+)/i);
  if (inText) return inText[1].replace(/[)>\].,;'"]+$/, "");
  return null;
}

export function parseSupportFormEmail(
  email: Pick<ParsedInboundEmail, "html" | "text">,
): SupportFormSubmission | null {
  const raw = email.text && email.text.trim() ? email.text : email.html ? htmlToText(email.html) : "";
  if (!raw || !FORM_MARKER.test(raw)) return null;

  const lines = raw.split(/\r?\n/).map((l) => l.trim());

  const rawEmail = fieldValue(lines, EMAIL_LABEL);
  const requesterEmail = rawEmail && EMAIL_RE.test(rawEmail) ? rawEmail.toLowerCase() : null;
  // Without a usable submitter address the whole point of parsing is lost — let the caller
  // fall back to the raw envelope.
  if (!requesterEmail) return null;

  return {
    requesterName: fieldValue(lines, NAME_LABEL),
    requesterEmail,
    company: fieldValue(lines, COMPANY_LABEL),
    category: fieldValue(lines, CATEGORY_LABEL),
    subject: fieldValue(lines, SUBJECT_LABEL),
    concern: concernValue(lines),
    attachmentUrl: attachmentUrl(raw, email.html ?? null),
  };
}

// The plain-text body stored on the ticket's first message. Field header, blank line, the
// customer's message, then the attachment link (the S3 URL is kept as a link only — task 352
// does not pull the file into ticket-attachments storage).
export function buildSupportFormBody(form: SupportFormSubmission): string {
  const header = [
    form.requesterName && `Full name: ${form.requesterName}`,
    form.requesterEmail && `Email: ${form.requesterEmail}`,
    form.company && `Company: ${form.company}`,
    form.category && `Category: ${form.category}`,
  ]
    .filter(Boolean)
    .join("\n");

  const parts = [header, form.concern || "(no message provided)"];
  if (form.attachmentUrl) parts.push(`Attachment: ${form.attachmentUrl}`);
  return parts.filter(Boolean).join("\n\n");
}
