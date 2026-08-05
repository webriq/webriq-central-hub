-- ─── Enable Supabase Realtime for task comments/attachments live sync (task 213) ──
-- Mirrors 006_product_completion_percentage.sql's `alter publication supabase_realtime
-- add table` precedent, but guarded with an existence check since — unlike that
-- migration — we cannot confirm `tasks`/`issues` (already subscribed to by
-- _project-detail.tsx) weren't enabled directly via the Supabase Studio Replication UI
-- rather than a committed migration. Safe to run whether or not either table is
-- already a publication member.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'task_comments'
  ) then
    alter publication supabase_realtime add table task_comments;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'attachments'
  ) then
    alter publication supabase_realtime add table attachments;
  end if;
end $$;
