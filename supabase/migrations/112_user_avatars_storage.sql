-- Migration 112: user-avatars storage bucket + RLS policies
-- Public bucket for imported Zoho user profile photos (task 288), mirroring the
-- onboarding-assets pattern from migration 005. Public read so existing avatar_url
-- <img> usages across the app (issue/task detail, notification bell, project detail,
-- list views) keep working with no auth-header plumbing. Files are PNGs re-hosted
-- from contacts.zoho.com/file?ID={zuid}&fs=thumb at import time — small thumbnails,
-- observed sizes so far are 2-4KB, so the size limit is generous but capped.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('user-avatars', 'user-avatars', true, 2097152, array['image/png']) -- 2MB
on conflict (id) do nothing;

drop policy if exists "user_avatars_public_read" on storage.objects;
create policy "user_avatars_public_read"
  on storage.objects for select
  using (bucket_id = 'user-avatars');

drop policy if exists "user_avatars_staff_write" on storage.objects;
create policy "user_avatars_staff_write"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'user-avatars'
    and get_my_role() in ('admin', 'super_admin')
  )
  with check (
    bucket_id = 'user-avatars'
    and get_my_role() in ('admin', 'super_admin')
  );
