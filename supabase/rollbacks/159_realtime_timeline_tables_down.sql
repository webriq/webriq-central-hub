-- Down-migration for supabase/migrations/159_realtime_timeline_tables.sql (task 424)
--
-- Lives in supabase/rollbacks/ (NOT migrations/) so `supabase db push` never applies it as a forward
-- migration — see the explanation at the top of 147_desk_inbox_tickets_rename_down.sql.
--
-- NOTE: if any of these tables was already in the publication BEFORE 159 ran (e.g. added through
-- the Studio UI), this removes it too; the up-migration is idempotent and cannot know which it added.
-- As of the 2026-10-05 investigation none of the five were published, so a full revert is correct.
alter table customer_phases replica identity default;
alter table customer_deliverables replica identity default;
alter table milestones replica identity default;
alter table tasklists replica identity default;

do $$
declare
  t text;
begin
  foreach t in array array['customer_phases', 'customer_deliverables', 'milestones', 'tasklists', 'tasks']
  loop
    if exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime drop table public.%I', t);
    end if;
  end loop;
end $$;
