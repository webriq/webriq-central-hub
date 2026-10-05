-- Migration 158: Allow presentation MIME types (.ppt/.pps, .pptx, .ppsx, .odp) on the two
-- Storage buckets that enforce allowed_mime_types (task 418). Without this, uploads pass the
-- app-level gate and then fail at Storage. customer-assets (migration 142) and onboarding-assets
-- (migrations 005/141) are the only buckets with a MIME restriction on this upload path;
-- project-assets has none. Appends rather than re-listing, so it can't drift from earlier lists,
-- and is idempotent (distinct). Not applied by the agent — run separately.

update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct m)
  from unnest(allowed_mime_types || array[
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
    'application/vnd.oasis.opendocument.presentation'
  ]) as m
)
where id in ('customer-assets', 'onboarding-assets');
