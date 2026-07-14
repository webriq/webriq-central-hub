-- Migration 070: Onboarding — PM/Developer read access to programme tables
--
-- Task 146. PM and Developer can now open the Onboarding Timeline (all 5 phases, read-only)
-- and — for PM only — the Phase 1 Wizard (read-only on steps 1-5/7, full Step 6 file/folder
-- access which lives entirely in customer_assets/customer_asset_folders and already has no
-- role restriction there). This migration only widens SELECT on the three programme tables
-- that were previously admin|super_admin|marketing-only end to end (migration 060). Write
-- access (insert/update/delete) stays admin|super_admin|marketing-only — unchanged — since
-- checklist/deliverable/phase state is still Marketing/Admin/Super Admin's to edit.
--
-- Postgres RLS can't express "different role sets for read vs. write" in a single `for all`
-- policy, so each table's existing single policy is dropped and replaced with four: insert,
-- update, delete (unchanged role set) + select (widened role set).

-- ─── onboarding_internal_deliverables ────────────────────────────────────────
drop policy if exists "onboarding_internal_deliverables_staff" on onboarding_internal_deliverables;

create policy "onboarding_internal_deliverables_marketing_insert"
  on onboarding_internal_deliverables for insert to authenticated
  with check (get_my_role() in ('admin', 'super_admin', 'marketing'));

create policy "onboarding_internal_deliverables_marketing_update"
  on onboarding_internal_deliverables for update to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing'))
  with check (get_my_role() in ('admin', 'super_admin', 'marketing'));

create policy "onboarding_internal_deliverables_marketing_delete"
  on onboarding_internal_deliverables for delete to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing'));

create policy "onboarding_internal_deliverables_pm_developer_read"
  on onboarding_internal_deliverables for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing', 'pm', 'developer'));

-- ─── customer_phases ──────────────────────────────────────────────────────────
drop policy if exists "customer_phases_marketing_only" on customer_phases;

create policy "customer_phases_marketing_insert"
  on customer_phases for insert to authenticated
  with check (get_my_role() in ('admin', 'super_admin', 'marketing'));

create policy "customer_phases_marketing_update"
  on customer_phases for update to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing'))
  with check (get_my_role() in ('admin', 'super_admin', 'marketing'));

create policy "customer_phases_marketing_delete"
  on customer_phases for delete to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing'));

create policy "customer_phases_pm_developer_read"
  on customer_phases for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing', 'pm', 'developer'));

-- ─── customer_deliverables ────────────────────────────────────────────────────
drop policy if exists "customer_deliverables_marketing_only" on customer_deliverables;

create policy "customer_deliverables_marketing_insert"
  on customer_deliverables for insert to authenticated
  with check (get_my_role() in ('admin', 'super_admin', 'marketing'));

create policy "customer_deliverables_marketing_update"
  on customer_deliverables for update to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing'))
  with check (get_my_role() in ('admin', 'super_admin', 'marketing'));

create policy "customer_deliverables_marketing_delete"
  on customer_deliverables for delete to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing'));

create policy "customer_deliverables_pm_developer_read"
  on customer_deliverables for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing', 'pm', 'developer'));
