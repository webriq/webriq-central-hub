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

// dangerouslySetInnerHTML consumers only ever receive sanitizeMessageHtml() output — message
// bodies come from arbitrary external senders (anyone can email helpdesk@webriq.us), so
// this is a real untrusted-content boundary, unlike the Zoho-authored descriptions elsewhere
// in this codebase that reuse normalizeZohoDescriptionHtml (no sanitization, semi-trusted
// staff-authored source — not appropriate to reuse here).
export function sanitizeMessageHtml(body: string): string {
  return DOMPurify.sanitize(absolutizeZohoDeskInlineImages(body), { USE_PROFILES: { html: true } });
}
