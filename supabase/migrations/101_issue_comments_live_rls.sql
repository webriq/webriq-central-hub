-- Migration 101: issue_comments live insert/delete RLS (task 236)
--
-- issue_comments (migration 052) was built import-only — read via issue_comments_staff_read,
-- write via issue_comments_pm_write (admin/super_admin/pm only). This adds the same
-- staff-insert/own-or-admin-delete split task_comments already has (migration 048), turning on
-- live commenting for any staff role with page access (admin/super_admin/pm/developer).
-- issue_comments_pm_write is untouched — RLS policies for the same operation are OR'd together,
-- so PM/Admin keep their existing broad write access (needed for admin cleanup of imported data).
--
-- The delete role set mirrors task_comments_delete's *current* live policy (migration 048:
-- `get_my_role() in ('admin', 'super_admin') or author_id = auth.uid()`), not the older
-- admin-only version from migration 026 — 048 already widened it app-wide, so this stays
-- consistent with that sweep rather than reintroducing the narrower, superseded role set.

create policy "issue_comments_staff_insert"
  on issue_comments for insert to authenticated
  with check (
    get_my_role() in ('admin', 'super_admin', 'pm', 'developer')
    and author_id = auth.uid()
  );

create policy "issue_comments_delete"
  on issue_comments for delete to authenticated
  using (get_my_role() in ('admin', 'super_admin') or author_id = auth.uid());
