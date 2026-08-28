// Inbound-email intake filter (task 327).
//
// Before task 327, email-poll turned every message in the helpdesk mailbox into a ticket. A
// live-DB probe found the resulting orphan rows were almost entirely automated mail: the Hub's
// own "WebriQ Central Hub" system emails (verification codes, invites, lockout notices), Zoho
// flow-failure alerts, and calendar-invite notifications. This is the gate that drops those.
//
// Fixed rule list — no scoring, no quarantine table. A dropped message is logged and the poll
// cursor still advances (it is not reprocessed). Header-based rules only apply when the caller
// passes a `headers` map; email-poll currently does not (that needs an extra Zoho Mail API call
// with unverified field names — the sender + subject rules already catch every observed case).

export type IntakeDecision = { ingest: boolean; reason?: string };

// The exact display name every send in src/lib/email/mailer.ts uses
// (`WebriQ Central Hub <MAIL_FROM>`), so this one check covers all of them.
const HUB_SENDER_NAME = "webriq central hub";

const SYSTEM_SENDER_PATTERNS: RegExp[] = [
  /^no-?reply@/i,
  /^do-?not-?reply@/i,
  /^notifications?@/i,
  /^mailer-daemon@/i,
  /^postmaster@/i,
  /^bounces?[@+-]/i,
];

const NOISE_SUBJECT_PATTERNS: RegExp[] = [
  /your webriq hub verification code/i,
  /reset your webriq hub password/i,
  /webriq central hub account has been temporarily locked/i,
  /error notification:\s*your flow/i,
  /has assigned an? .+ to you\.?\s*$/i,
  /^(undeliverable|delivery status notification|mail delivery (failed|subsystem)|returned mail)/i,
  /^automatic reply:/i,
  /^out of office\b/i,
];

const HUB_MAIL_FROM = (process.env.MAIL_FROM ?? "noreply@webriq.com").toLowerCase();
const HUB_OWN_DOMAINS = [HUB_MAIL_FROM.includes("@") ? HUB_MAIL_FROM.split("@")[1] : "webriq.com"];

export function shouldIngestEmail(input: {
  fromAddress: string;
  fromName?: string;
  subject: string;
  headers?: Record<string, string | undefined> | null;
}): IntakeDecision {
  const from = (input.fromAddress ?? "").trim().toLowerCase();
  const name = (input.fromName ?? "").trim().toLowerCase();
  const subject = (input.subject ?? "").trim();
  const domain = from.includes("@") ? from.split("@").pop()! : "";

  if (name === HUB_SENDER_NAME) {
    return { ingest: false, reason: 'sender display name is "WebriQ Central Hub" (Hub system mail)' };
  }

  for (const re of SYSTEM_SENDER_PATTERNS) {
    if (re.test(from)) return { ingest: false, reason: `automated sender (${re.source})` };
  }

  // Own-domain mail with no human display name is almost always a Hub/WebriQ automated send
  // that landed in the helpdesk mailbox. A named person forwarding from @webriq.com is kept —
  // tune HUB_OWN_DOMAINS / this condition if it ever drops legitimate internal forwards.
  if (domain && HUB_OWN_DOMAINS.includes(domain) && !name) {
    return { ingest: false, reason: `unnamed sender on own domain (${domain})` };
  }

  for (const re of NOISE_SUBJECT_PATTERNS) {
    if (re.test(subject)) return { ingest: false, reason: `noise subject (${re.source})` };
  }

  const headers = input.headers ?? null;
  if (headers) {
    const h = (k: string) => (headers[k] ?? headers[k.toLowerCase()] ?? "").trim().toLowerCase();
    const autoSubmitted = h("Auto-Submitted");
    if (autoSubmitted && autoSubmitted !== "no") {
      return { ingest: false, reason: `Auto-Submitted: ${autoSubmitted}` };
    }
    const precedence = h("Precedence");
    if (["bulk", "list", "junk", "auto_reply"].includes(precedence)) {
      return { ingest: false, reason: `Precedence: ${precedence}` };
    }
    if (h("Return-Path") === "<>") {
      return { ingest: false, reason: "empty Return-Path (bounce)" };
    }
  }

  return { ingest: true };
}
