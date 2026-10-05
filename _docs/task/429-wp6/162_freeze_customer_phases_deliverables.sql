-- ─── Task 429 WP6 — freeze the legacy programme tables after the cutover (decision: applied AFTER the parity check passes) ───
-- From the cutover on, the app reads/writes `project_phases` / `project_deliverables` / `phase_programme_state`. `customer_phases` and
-- `customer_deliverables` stay as an untouched snapshot (rollback target + task 431's drop). This makes any straggling writer fail
-- LOUDLY instead of silently diverging: INSERT and UPDATE raise. DELETE is deliberately NOT blocked — `ON DELETE CASCADE` from
-- projects/customers fires it, and deleting a project must keep working.
--
-- NOT in supabase/migrations/ on purpose: a routine `supabase db push` before the cutover would apply it and break the still-live
-- (pre-deploy) app. At cutover step 5 the operator either runs this file in the SQL editor or moves it to supabase/migrations/.
-- Rollback: supabase/rollbacks/162_freeze_customer_phases_deliverables_down.sql (drops the triggers + function; nothing else changed).
create or replace function public.reject_legacy_programme_write() returns trigger
language plpgsql as $$
begin
  raise exception 'customer_phases/customer_deliverables are frozen (task 429 cutover): write to project_phases/project_deliverables via the programme store instead'
    using errcode = 'P0001', hint = 'See _docs/task/429-programme-engine-cutover.md';
end $$;

drop trigger if exists customer_phases_frozen on public.customer_phases;
create trigger customer_phases_frozen before insert or update on public.customer_phases
  for each row execute function public.reject_legacy_programme_write();

drop trigger if exists customer_deliverables_frozen on public.customer_deliverables;
create trigger customer_deliverables_frozen before insert or update on public.customer_deliverables
  for each row execute function public.reject_legacy_programme_write();
