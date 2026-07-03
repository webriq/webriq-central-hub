-- Migration 050: project-assets storage bucket + RLS policies
-- src/app/api/admin/zoho-import/attachments/route.ts (task 104, rewritten task 106) has
-- referenced the "project-assets" bucket since it was written, but no migration ever
-- created it — every upload silently failed with "Bucket not found" until now.
-- Private bucket (not public) — access mirrors the attachments table's existing RLS
-- (migration 048): admin/super_admin/pm/developer read, admin/super_admin/pm write.
-- Uses get_my_role() helper (migration 026) — never replicate the role lookup inline.

insert into storage.buckets (id, name, public, file_size_limit)
values ('project-assets', 'project-assets', false, 52428800) -- 50MB
on conflict (id) do nothing;

drop policy if exists "project_assets_staff_read" on storage.objects;
create policy "project_assets_staff_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'project-assets'
    and get_my_role() in ('admin', 'super_admin', 'pm', 'developer')
  );

drop policy if exists "project_assets_staff_write" on storage.objects;
create policy "project_assets_staff_write"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'project-assets'
    and get_my_role() in ('admin', 'super_admin', 'pm')
  )
  with check (
    bucket_id = 'project-assets'
    and get_my_role() in ('admin', 'super_admin', 'pm')
  );
