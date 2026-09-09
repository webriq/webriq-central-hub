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
//
// Task 352 added an allowlist (INTAKE_ALLOWLIST) checked before the denylist, so mail relayed
// by a trusted form through an otherwise-blocked no-reply address (the webriq.com support
// form) is kept — the matched entry's label is returned as `source`.

export type IntakeDecision = { ingest: boolean; reason?: string; source?: string };

// The exact display name every send in src/lib/email/mailer.ts uses
// (`WebriQ Central Hub <MAIL_FROM>`), so this one check covers all of them.
const HUB_SENDER_NAME = "webriq central hub";

// Automated senders whose mail IS a real ticket despite matching a denylist rule below.
// Checked FIRST — a match forces ingest and short-circuits every denylist check. BOTH
// `fromAddress` and `subject` must match. `label` is surfaced on the decision as `source` so
// a downstream consumer (email-poll route) knows which upstream form produced the message and
// can parse its body accordingly. Add one entry per trusted form/integration.
//   - webriq-support-form: the webriq.com Helpdesk "Submit a support ticket" form relays every
//     submission from this fixed no-reply address with this exact subject. The real submitter
//     is inside the body — src/lib/email/support-form.ts pulls it out (task 352).
const INTAKE_ALLOWLIST: { label: string; fromAddress: RegExp; subject: RegExp }[] = [
  { label: "webriq-support-form", fromAddress: /^no-?reply@webriq\.me$/i, subject: /^submit ticket$/i },
];

const SYSTEM_SENDER_PATTERNS: RegExp[] = [
  /^no-?reply@/i,
  /^do-?not-?reply@/i,
  /^notifications?@/i,
  /^mailer-daemon@/i,
  /^postmaster@/i,
  /^bounces?[@+-]/i,
];

// Whole sender domains that are always automation, never a real customer. Matched on the part
// after "@", exact or as a subdomain (`x.notification.wix.com` too). Add a bare domain string.
const SYSTEM_SENDER_DOMAINS: string[] = [
  "notification.wix.com", // wix-team@notification.wix.com and siblings (task 352)
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

  // Allowlist wins over every denylist rule — a trusted form relays through a no-reply address
  // that would otherwise be dropped by SYSTEM_SENDER_PATTERNS.
  for (const entry of INTAKE_ALLOWLIST) {
    if (entry.fromAddress.test(from) && entry.subject.test(subject)) {
      return { ingest: true, source: entry.label };
    }
  }

  if (name === HUB_SENDER_NAME) {
    return { ingest: false, reason: 'sender display name is "WebriQ Central Hub" (Hub system mail)' };
  }

  for (const re of SYSTEM_SENDER_PATTERNS) {
    if (re.test(from)) return { ingest: false, reason: `automated sender (${re.source})` };
  }

  for (const d of SYSTEM_SENDER_DOMAINS) {
    if (domain === d || domain.endsWith(`.${d}`)) {
      return { ingest: false, reason: `automated sender domain (${d})` };
    }
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
