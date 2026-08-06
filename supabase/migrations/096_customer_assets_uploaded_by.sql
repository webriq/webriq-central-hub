-- Migration 096: Track who uploaded a customer_assets file.
-- Task 219 (Onboarding Workspace v2 follow-up) — task 217 had omitted uploader attribution
-- entirely for lack of a backing column; this task adds it back deliberately, per explicit
-- user instruction to track it properly rather than omit it again. New uploads only — no
-- backfill is possible, since no prior data anywhere records who uploaded existing files.

alter table customer_assets
  add column uploaded_by uuid references profiles (id) on delete set null;

-- ─── profiles ─────────────────────────────────────────────────────────────────
-- Widen SELECT so the new uploader-name join (profiles!customer_assets_uploaded_by_fkey)
-- actually resolves for every role that can open the Onboarding Workspace (WIZARD_ROLES =
-- admin, super_admin, marketing, pm), not just admin/super_admin. Same shape as
-- projects_staff_read (migration 048) — a superset of the existing policy, so this only ever
-- adds visibility, never removes any. developer/hr included too for the same "all non-client
-- staff" reasoning projects_staff_read already uses.
drop policy if exists "profiles_read_own" on profiles;
create policy "profiles_read_own"
  on profiles for select to authenticated
  using (auth.uid() = id or get_my_role() in ('admin', 'super_admin', 'pm', 'marketing', 'developer', 'hr'));
