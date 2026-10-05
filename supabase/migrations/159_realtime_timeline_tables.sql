-- ─── Add the Project Timeline's tables to the Supabase Realtime publication (task 424) ───────────
-- Verified 2026-10-05 (task 423 investigation): customer_phases, customer_deliverables, milestones,
-- tasklists and tasks were NOT in `supabase_realtime`, so the Timeline's postgres_changes
-- subscriptions (StackShift's `v2_onboarding_*` channel and task 422's generic `v2_generic_*`
-- channel) connected but never received an event. Same guarded, idempotent shape as
-- 093_enable_realtime_comments_attachments.sql (safe whether or not a table was already added
-- through the Supabase Studio Replication UI).
--
-- Written, NOT applied by the agent — apply with `supabase db push` after review.
do $$
declare
  t text;
begin
  foreach t in array array['customer_phases', 'customer_deliverables', 'milestones', 'tasklists', 'tasks']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- DELETE events carry only the primary key under the default replica identity, and Realtime cannot
-- apply a column filter (`project_id=eq.…`) to a DELETE — so a filtered subscription would never see
-- a row disappear. FULL puts the whole old row in the WAL record so the filter can match. Applied only
-- to the four small tables (146 / 751 / 695 / 1,571 rows); `tasks` (7.6k rows, large HTML columns)
-- stays on the default, so task *deletions* won't live-update (inserts/updates do) — deletes are rare
-- and a reload shows them. Revisit if that proves insufficient.
alter table customer_phases replica identity full;
alter table customer_deliverables replica identity full;
alter table milestones replica identity full;
alter table tasklists replica identity full;
