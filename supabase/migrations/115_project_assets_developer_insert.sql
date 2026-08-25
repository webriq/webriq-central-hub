-- Migration 115: developer insert access on project-assets storage bucket
--
-- attachments_developer_insert (migration 026) has let developers insert rows into the
-- `attachments` table since day one, but the underlying `project-assets` storage bucket never
-- got a matching object-level policy — project_assets_staff_write (migration 050) only covers
-- admin/super_admin/pm. A developer's storage.upload() call was therefore rejected by RLS on
-- storage.objects before the request ever reached the attachments-table insert, surfacing as
-- "new row violates row-level security policy" on every attachment upload a developer attempted
-- (task/issue attachments and issue-comment attachments alike — task 299).
--
-- Insert-only, mirroring attachments_developer_insert's scope (developers can add new files;
-- update/delete of others' objects stays admin/super_admin/pm-only via the existing policy).
-- Uses get_my_role() (migration 026) — never replicate the role lookup inline.

drop policy if exists "project_assets_developer_insert" on storage.objects;
create policy "project_assets_developer_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-assets'
    and get_my_role() = 'developer'
  );
