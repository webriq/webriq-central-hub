-- Migration 155: edit-own-comment support (task 411)
--
-- Comment editing never existed in v2 (only own-delete). This adds:
--   1. task_comments.updated_at — null until a comment is first edited (ticket_comments already
--      carries updated_at since the Zoho import, migration 052).
--   2. Author-only UPDATE policies on task_comments and ticket_comments. ticket_comments_pm_write
--      (admin/super_admin/pm, all operations) is untouched and still OR'd in by Postgres; the
--      PATCH routes enforce author-only editing at the app layer on top of this.
--
-- Written, not applied — apply manually (Notes-migration convention).

alter table task_comments add column if not exists updated_at timestamptz;

drop policy if exists "task_comments_author_update" on task_comments;
create policy "task_comments_author_update"
  on task_comments for update to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer') and author_id = auth.uid())
  with check (get_my_role() in ('admin', 'super_admin', 'pm', 'developer') and author_id = auth.uid());

drop policy if exists "ticket_comments_author_update" on ticket_comments;
create policy "ticket_comments_author_update"
  on ticket_comments for update to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer') and author_id = auth.uid())
  with check (get_my_role() in ('admin', 'super_admin', 'pm', 'developer') and author_id = auth.uid());
