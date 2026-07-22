-- Migration 084: Tighten RLS on customers + AI pipeline tables
--
-- Migration 003 (Phase 1) granted `using (true) with check (true)` to every
-- authenticated user on customers, classification_records,
-- requirements_assessments, implementation_plans, and execution_records —
-- explicitly flagged "tighten in Phase 2" but never revisited. Migration 026
-- (v2 RLS) added a proper role matrix for profiles/projects/tasks/tickets/hr.*
-- but did not touch these five tables, leaving every signed-up user
-- (including the default self-registration role `client`) with full
-- read+write access to all customers' data via the Supabase REST API
-- directly, bypassing every Next.js API route's own checks.
--
-- This migration replaces the Phase 1 permissive policies with the same
-- role-matrix pattern migration 026 established elsewhere in the app.

-- ─── customers ──────────────────────────────────────────────────────────────
drop policy if exists "authenticated_read_customers" on customers;
drop policy if exists "authenticated_write_customers" on customers;

-- Staff: all roles except client can read every customer. `marketing` gets read-only
-- visibility here (matches the existing customer-assets-content precedent) — it is
-- deliberately excluded from write and from the AI pipeline tables below.
create policy "customers_staff_read"
  on customers for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer', 'hr', 'marketing'));

-- Client: read only their own customer row.
create policy "customers_client_read"
  on customers for select to authenticated
  using (get_my_role() = 'client' and customer_id = get_my_customer_id());

-- PM / Admin / Super Admin: full write.
create policy "customers_pm_write"
  on customers for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

-- ─── classification_records ─────────────────────────────────────────────────
drop policy if exists "authenticated_read_classification_records" on classification_records;
drop policy if exists "authenticated_write_classification_records" on classification_records;

create policy "classification_records_staff_read"
  on classification_records for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

create policy "classification_records_pm_write"
  on classification_records for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

-- ─── requirements_assessments ───────────────────────────────────────────────
drop policy if exists "authenticated_read_requirements_assessments" on requirements_assessments;
drop policy if exists "authenticated_write_requirements_assessments" on requirements_assessments;

create policy "requirements_assessments_staff_read"
  on requirements_assessments for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

create policy "requirements_assessments_pm_write"
  on requirements_assessments for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

-- ─── implementation_plans ────────────────────────────────────────────────────
drop policy if exists "authenticated_read_implementation_plans" on implementation_plans;
drop policy if exists "authenticated_write_implementation_plans" on implementation_plans;

create policy "implementation_plans_staff_read"
  on implementation_plans for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

create policy "implementation_plans_pm_write"
  on implementation_plans for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

-- ─── execution_records ───────────────────────────────────────────────────────
drop policy if exists "authenticated_read_execution_records" on execution_records;
drop policy if exists "authenticated_write_execution_records" on execution_records;

create policy "execution_records_staff_read"
  on execution_records for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

create policy "execution_records_pm_write"
  on execution_records for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));
