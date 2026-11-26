-- Migration 194: Allow application/json on the buckets that keep an allowed_mime_types list
-- (task 505). Appends and is idempotent (distinct), same shape as 158/175/176. Buckets with a
-- null list (unrestricted, e.g. project-assets) are left untouched — `null || array[...]` would
-- restrict them. Not applied by the agent — run separately.

update storage.buckets
set allowed_mime_types = (
  select array_agg(distinct m)
  from unnest(allowed_mime_types || array['application/json']) as m
)
where id in ('customer-assets', 'user-drive', 'onboarding-assets')
  and allowed_mime_types is not null;
