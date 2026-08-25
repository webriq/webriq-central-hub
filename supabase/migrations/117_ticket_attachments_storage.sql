-- Migration 117: ticket-attachments storage bucket + RLS policies (task 306)
-- Dedicated bucket for imported Zoho Desk Thread/Comment attachment files — kept separate
-- from project-assets (Zoho Projects tasks/issues) following this codebase's existing
-- one-bucket-per-domain precedent (task-content, user-avatars, kb).
-- Private bucket (not public) — access mirrors the attachments table's existing staff-only
-- RLS (migration 048): admin/super_admin/pm/developer read, admin/super_admin/pm write.
-- Uses get_my_role() helper (migration 026) — never replicate the role lookup inline.
-- Same structure as project-assets' bucket policies (migration 050).

insert into storage.buckets (id, name, public, file_size_limit)
values ('ticket-attachments', 'ticket-attachments', false, 52428800) -- 50MB
on conflict (id) do nothing;

drop policy if exists "ticket_attachments_staff_read" on storage.objects;
create policy "ticket_attachments_staff_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and get_my_role() in ('admin', 'super_admin', 'pm', 'developer')
  );

drop policy if exists "ticket_attachments_staff_write" on storage.objects;
create policy "ticket_attachments_staff_write"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'ticket-attachments'
    and get_my_role() in ('admin', 'super_admin', 'pm')
  )
  with check (
    bucket_id = 'ticket-attachments'
    and get_my_role() in ('admin', 'super_admin', 'pm')
  );
