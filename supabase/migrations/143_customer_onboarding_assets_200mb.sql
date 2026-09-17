-- Migration 143: Bump customer-assets / onboarding-assets bucket size limit to 200MB
-- (task 377 follow-up, superseding migration 141's 50MB bump — that migration was
-- already applied, so this is a new migration rather than an edit to it).

update storage.buckets
set file_size_limit = 209715200 -- 200MB
where id in ('customer-assets', 'onboarding-assets');
