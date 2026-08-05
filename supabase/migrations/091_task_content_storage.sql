-- Migration 091: task-content storage bucket for inline task-description images (task 205)
-- Public bucket — pasted/dropped images in the New Task rich text description need a stable
-- URL that keeps working wherever the description HTML is rendered (list/board/detail),
-- without server-side re-signing. Mirrors the public-bucket precedent already established by
-- 005_onboarding_storage.sql. Discrete task "Attachments" (separate from inline description
-- images) continue to use the existing private project-assets bucket + attachments table
-- (050_project_assets_storage.sql) — unrelated to this bucket.
-- Uses get_my_role() helper (migration 026) — never replicate the role lookup inline.

insert into storage.buckets (id, name, public, file_size_limit)
values ('task-content', 'task-content', true, 10485760) -- 10MB, images only
on conflict (id) do nothing;

drop policy if exists "task_content_staff_write" on storage.objects;
create policy "task_content_staff_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'task-content'
    and get_my_role() in ('admin', 'super_admin', 'pm')
  );
-- Public bucket — anon/authenticated SELECT is implicit for public buckets, no read policy needed.
