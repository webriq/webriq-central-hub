-- Migration 142: Add a DB-level allowed_mime_types restriction to the customer-assets
-- bucket (task 377 follow-up, user-requested after 141 had already been applied — see
-- 141's header comment for why this is a separate migration rather than an edit to it).
--
-- customer-assets never had a Storage-layer MIME restriction before this migration; MIME
-- was gated only in app code (src/lib/uploads/customer-asset-storage.ts). This sets
-- allowed_mime_types to match that file's ALLOWED_MIME_TYPES exactly, including
-- image/svg+xml — this bucket is private/staff-only (signed URLs only), so the
-- stored-XSS risk that excludes svg from the public onboarding-assets bucket doesn't
-- apply here.

update storage.buckets
set allowed_mime_types = array[
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
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
where id = 'customer-assets';
