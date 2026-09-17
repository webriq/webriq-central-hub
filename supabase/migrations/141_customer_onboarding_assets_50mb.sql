-- Migration 141: Bump customer-assets / onboarding-assets bucket size limit to 50MB
-- (task 377). Also widens onboarding-assets' allowed_mime_types to match the
-- customer-assets app-level allowlist (task 372) minus image/svg+xml, which stays
-- excluded because onboarding-assets is a public bucket (stored-XSS risk) while
-- customer-assets is private/staff-only.
--
-- customer-assets has no allowed_mime_types restriction at the Storage layer (MIME is
-- gated only in app code) — this migration deliberately does not add one here; see
-- migration 142 for that addition (kept separate because this migration was already
-- applied to the remote database before the need for it was identified).

update storage.buckets
set file_size_limit = 52428800 -- 50MB
where id = 'customer-assets';

update storage.buckets
set
  file_size_limit = 52428800, -- 50MB
  allowed_mime_types = array[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/html',
    'text/markdown',
    'text/plain',
    'text/csv',
    'image/x-icon',
    'image/vnd.microsoft.icon',
    'application/zip',
    'application/x-zip-compressed',
    'application/vnd.rar',
    'application/x-rar-compressed',
    'text/javascript',
    'application/javascript',
    'video/mp2t',
    'application/xml',
    'text/xml'
  ]
where id = 'onboarding-assets';
