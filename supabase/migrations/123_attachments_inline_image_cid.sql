-- Migration 123: attachments.cid — inline (cid-referenced) images on ticket messages (task 321)
-- Inline images from inbound ticket emails are resolved via IMAP (Zoho Mail's REST API does
-- not expose them as fetchable attachments), stored in the existing ticket-attachments bucket,
-- and distinguished from real downloadable attachments by this column so the ticket detail
-- page's Attachments tab (task 320) can exclude them. Nullable — only set for inline images.
-- Not reused as/from external_id: external_id (migration 035) has a global UNIQUE constraint,
-- but a MIME Content-ID is only guaranteed unique within one message, not across the mailbox.

alter table attachments
  add column cid text null;
