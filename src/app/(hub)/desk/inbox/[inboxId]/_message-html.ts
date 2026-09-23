import DOMPurify from "dompurify";

// Shared message-body HTML helpers for the ticket conversation view. Extracted from
// _conversation-thread.tsx (task 333) so _thread-to-project-modal.tsx can reuse
// sanitizeMessageHtml without creating an import cycle back through the thread component.

// Zoho Desk's imported thread inline images are host-relative
// (`/supportapi/api/v1/threads/{id}/inlineImages/{id}?...`) with no origin, so they 404 rendered
// as-is — same class of problem as Zoho Projects' portal-relative description images
// (absolutizeZohoInlineImages in projects-old/_pm-shared.tsx), just a different Zoho product's
// API path. Prepend the same crmplus.zoho.com host those imported threads were served from.
export function absolutizeZohoDeskInlineImages(html: string): string {
  return html.replace(
    /\bsrc=(["'])(\/supportapi\/api\/v1[^"']*)\1/gi,
    (_match, quote: string, path: string) => `src=${quote}https://crmplus.zoho.com${path}${quote}`
  );
}

// Inbound-email inline images referenced as `<img src="/mail/ImageDisplay?...cid=...">` (or a raw
// `src="cid:...">`) are dead for every staff user — the endpoint needs a Zoho Mail webclient
// session (task 321). The email-poll cron + the backfill route (tasks 321/322/341) rewrite these
// to a Hub serving route when the bytes can be recovered over IMAP; anything still carrying the
// dead form here could not be recovered (source email deleted/moved, IMAP not configured at poll
// time, cid token mismatch). Swap the broken <img> for an honest inline marker instead of letting
// the browser render a broken-image box.
export function neutralizeDeadInlineImages(html: string): string {
  return html.replace(
    /<img\b[^>]*\bsrc=(["'])(?:\/mail\/ImageDisplay|cid:)[^"']*\1[^>]*>/gi,
    '<span aria-label="inline image unavailable" title="This inline image could not be retrieved from the mail server" style="font-style:italic;opacity:0.55">[inline image unavailable]</span>'
  );
}

// dangerouslySetInnerHTML consumers only ever receive sanitizeMessageHtml() output — message
// bodies come from arbitrary external senders (anyone can email helpdesk@webriq.us), so
// this is a real untrusted-content boundary, unlike the Zoho-authored descriptions elsewhere
// in this codebase that reuse normalizeZohoDescriptionHtml (no sanitization, semi-trusted
// staff-authored source — not appropriate to reuse here).
export function sanitizeMessageHtml(body: string): string {
  return DOMPurify.sanitize(neutralizeDeadInlineImages(absolutizeZohoDeskInlineImages(body)), {
    USE_PROFILES: { html: true },
  });
}
