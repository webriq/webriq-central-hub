-- Migration 153: wiki-assets storage bucket for Wiki page inline images
-- PRIVATE bucket — unlike task-content (public, migration 091), wiki images are only reachable
-- through GET /api/wiki/assets/[pageId]/[filename], which checks the session + staff role and
-- 302-redirects to a short-lived signed URL. The saved page HTML stores that stable route URL,
-- so it never expires and version snapshots stay valid. The bytes are served by Supabase's CDN,
-- not the Next.js function.
-- Uses get_my_role() helper (migration 026) — never replicate the role lookup inline.
-- Written, NOT applied by the agent (storage-migration convention).
-- Existing wiki images stay in task-content (wiki/<pageId>/...) and keep working; only new
-- uploads land here.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'wiki-assets',
  'wiki-assets',
  false,
  52428800, -- 50MB, images only
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do nothing;

-- Write: same roles as wiki_pages_staff_write (migration 149).
drop policy if exists "wiki_assets_staff_write" on storage.objects;
create policy "wiki_assets_staff_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'wiki-assets'
    and get_my_role() in ('admin', 'super_admin', 'pm', 'developer')
  );

-- Read: same roles as wiki_pages_staff_read — needed so the route can mint signed URLs with the
-- caller's own session (createSignedUrl checks SELECT) instead of adminClient.
drop policy if exists "wiki_assets_staff_read" on storage.objects;
create policy "wiki_assets_staff_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'wiki-assets'
    and get_my_role() in ('admin', 'super_admin', 'pm', 'developer', 'hr')
  );
