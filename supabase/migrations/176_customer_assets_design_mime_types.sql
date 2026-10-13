-- Migration 176: Allow design-source MIME types (.eps .psd .ai .fig) on the customer-assets
-- bucket (task 451 addendum). Separate from 175 (fonts) so it works whether or not 175 has been
-- applied yet; appends and is idempotent (distinct), same shape as 158/175. customer-assets only.
-- Not applied by the agent — run separately. Keep in sync with src/config/design-file-types.ts.

update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct m)
  from unnest(allowed_mime_types || array[
    'application/postscript', 'image/vnd.adobe.photoshop', 'application/illustrator', 'application/x-figma',
    'application/eps', 'application/x-eps', 'image/eps', 'image/x-eps',
    'application/x-photoshop', 'application/photoshop', 'image/psd', 'image/x-photoshop',
    'application/vnd.adobe.illustrator', 'application/x-illustrator'
  ]) as m
)
where id = 'customer-assets';
