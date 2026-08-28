// Subject-line normalization for inbound-email thread matching (task 327).
//
// email-poll can't id-match a reply onto an imported ticket (imported tickets have no
// zoho_mail_thread_id and their messages have no email_message_id — the Desk threads export
// carries no RFC822 Message-ID). The fallback is a `requester_email` + normalized-subject
// match, and this is the normalizer: strip the reply/forward prefixes a mail client stacks on
// ("Re:", "Fwd:", "RE: Re: Fwd:", localized variants, "Re[2]:") so "Re: Widget broken" and
// "Widget broken" compare equal.

// Common reply/forward prefixes across the mail clients a helpdesk mailbox actually sees.
// Deliberately not exhaustive of every locale — the ambiguous 2-letter ones (sv, vs, rv, tr)
// are left out so a real subject like "VS: Q3 numbers" isn't mangled; a missed strip just
// yields a new ticket (the pre-task-327 behaviour), an over-strip could mis-thread.
const REPLY_FORWARD_PREFIX = /^(re|fwd?|fw|aw|wg|antw(ort)?)(\s*\[\d+\])?\s*:\s*/i;

export function normalizeEmailSubject(raw: string): string {
  let s = (raw ?? "").trim();
  let prev: string;
  do {
    prev = s;
    s = s.replace(REPLY_FORWARD_PREFIX, "").trim();
  } while (s !== prev);
  return s.replace(/\s+/g, " ").trim();
}

// Case-insensitive equality on the normalized form — the comparison email-poll actually needs.
export function subjectsMatch(a: string, b: string): boolean {
  return normalizeEmailSubject(a).toLowerCase() === normalizeEmailSubject(b).toLowerCase();
}
