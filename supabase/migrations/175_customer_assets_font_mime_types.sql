-- Migration 175: Allow font MIME types on the customer-assets bucket (task 451). Without this,
-- font uploads pass the app-level gate and then fail at Storage. Only customer-assets is
-- widened; onboarding-assets is public and not part of the Files-tab upload path. Appends
-- rather than re-listing (same shape as migration 158) and is idempotent (distinct).
-- Not applied by the agent — run separately. Keep in sync with src/config/font-types.ts.

update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct m)
  from unnest(allowed_mime_types || array[
    'font/ttf', 'font/otf', 'font/woff', 'font/woff2', 'font/collection',
    'application/vnd.ms-fontobject',
    'application/x-font-ttf', 'application/x-font-truetype',
    'application/x-font-otf', 'application/x-font-opentype',
    'application/font-sfnt', 'application/font-woff',
    'application/font-woff2', 'application/x-font-woff'
  ]) as m
)
where id = 'customer-assets';
