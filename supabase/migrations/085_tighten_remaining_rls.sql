-- Migration 085: Tighten RLS on customer_products, customer_assets,
-- customer_asset_folders, playbooks, llm_invocation_logs, digest_logs
--
-- Second-pass security sweep findings:
--
-- 1. customer_products was one of the nine tables migration 003 (Phase 1) granted
--    `using (true) with check (true)` to every authenticated user — migration 084
--    tightened five of those nine (customers, classification_records,
--    requirements_assessments, implementation_plans, execution_records) but missed
--    customer_products, playbooks, llm_invocation_logs, and digest_logs. This
--    migration closes the remaining four.
--
-- 2. customer_assets and customer_asset_folders (migrations 021/057/064/067/068)
--    deliberately kept RLS at a blanket `auth.role() = 'authenticated'` and pushed
--    all real permission logic (canSeeAsset()/canSeeFolder() — role + per-user
--    allowed_roles/allowed_user_ids arrays) into the Next.js API routes only,
--    documented explicitly in migration 057/064/067/068 comments ("Enforcement is
--    application-level, not RLS"). customer_assets.type includes 'credential', which
--    stores literal secret values in the `fields` column — so any authenticated user
--    (including a default `client` self-signup) could read/write every customer's
--    stored credentials by calling the Supabase REST API directly with their own JWT,
--    bypassing canSeeAsset() entirely. This migration mirrors canSeeAsset()/
--    canSeeFolder()'s exact logic in RLS so the same rule is enforced at both layers.
--    INSERT stays open to any authenticated user (unchanged) since a not-yet-existing
--    row has no permissions to check — matches current POST route behavior; the app
--    layer still owns any tightening of who may create which asset types.

-- ─── customer_products ───────────────────────────────────────────────────────
drop policy if exists "authenticated_read_customer_products" on customer_products;
drop policy if exists "authenticated_write_customer_products" on customer_products;

create policy "customer_products_staff_read"
  on customer_products for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer', 'hr', 'marketing'));

create policy "customer_products_client_read"
  on customer_products for select to authenticated
  using (get_my_role() = 'client' and customer_id = get_my_customer_id());

create policy "customer_products_pm_write"
  on customer_products for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

-- ─── playbooks ────────────────────────────────────────────────────────────────
-- Read/written server-side only (src/lib/ai/plan.ts, via adminClient) — no authenticated
-- write policy needed; adminClient bypasses RLS regardless.
drop policy if exists "authenticated_read_playbooks" on playbooks;
drop policy if exists "authenticated_write_playbooks" on playbooks;

create policy "playbooks_staff_read"
  on playbooks for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

-- ─── llm_invocation_logs ────────────────────────────────────────────────────────
-- Written server-side only (src/lib/ai/logger.ts, via adminClient).
drop policy if exists "authenticated_read_llm_invocation_logs" on llm_invocation_logs;
drop policy if exists "authenticated_write_llm_invocation_logs" on llm_invocation_logs;

create policy "llm_invocation_logs_staff_read"
  on llm_invocation_logs for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'));

-- ─── digest_logs ─────────────────────────────────────────────────────────────
-- Written server-side only (src/lib/ai/digest.ts, /api/digest/[id]/feedback — both via
-- adminClient).
drop policy if exists "authenticated_read_digest_logs" on digest_logs;
drop policy if exists "authenticated_write_digest_logs" on digest_logs;

create policy "digest_logs_staff_read"
  on digest_logs for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'));

-- ─── customer_assets ────────────────────────────────────────────────────────────
drop policy if exists "Authenticated users can manage customer assets" on customer_assets;

create policy "customer_assets_insert"
  on customer_assets for insert to authenticated
  with check (true);

create policy "customer_assets_select"
  on customer_assets for select to authenticated
  using (
    get_my_role() in ('admin', 'super_admin')
    or (
      (allowed_roles is null or array_length(allowed_roles, 1) is null)
      and (allowed_user_ids is null or array_length(allowed_user_ids, 1) is null)
    )
    or (allowed_roles is not null and get_my_role() = any(allowed_roles))
    or (allowed_user_ids is not null and auth.uid() = any(allowed_user_ids))
  );

create policy "customer_assets_update"
  on customer_assets for update to authenticated
  using (
    get_my_role() in ('admin', 'super_admin')
    or (
      (allowed_roles is null or array_length(allowed_roles, 1) is null)
      and (allowed_user_ids is null or array_length(allowed_user_ids, 1) is null)
    )
    or (allowed_roles is not null and get_my_role() = any(allowed_roles))
    or (allowed_user_ids is not null and auth.uid() = any(allowed_user_ids))
  )
  with check (true);

create policy "customer_assets_delete"
  on customer_assets for delete to authenticated
  using (
    get_my_role() in ('admin', 'super_admin')
    or (
      (allowed_roles is null or array_length(allowed_roles, 1) is null)
      and (allowed_user_ids is null or array_length(allowed_user_ids, 1) is null)
    )
    or (allowed_roles is not null and get_my_role() = any(allowed_roles))
    or (allowed_user_ids is not null and auth.uid() = any(allowed_user_ids))
  );

-- ─── customer_asset_folders ─────────────────────────────────────────────────────
drop policy if exists "Authenticated users can manage customer asset folders" on customer_asset_folders;

create policy "customer_asset_folders_insert"
  on customer_asset_folders for insert to authenticated
  with check (true);

create policy "customer_asset_folders_select"
  on customer_asset_folders for select to authenticated
  using (
    get_my_role() in ('admin', 'super_admin')
    or (
      (allowed_roles is null or array_length(allowed_roles, 1) is null)
      and (allowed_user_ids is null or array_length(allowed_user_ids, 1) is null)
    )
    or (allowed_roles is not null and get_my_role() = any(allowed_roles))
    or (allowed_user_ids is not null and auth.uid() = any(allowed_user_ids))
  );

create policy "customer_asset_folders_update"
  on customer_asset_folders for update to authenticated
  using (
    get_my_role() in ('admin', 'super_admin')
    or (
      (allowed_roles is null or array_length(allowed_roles, 1) is null)
      and (allowed_user_ids is null or array_length(allowed_user_ids, 1) is null)
    )
    or (allowed_roles is not null and get_my_role() = any(allowed_roles))
    or (allowed_user_ids is not null and auth.uid() = any(allowed_user_ids))
  )
  with check (true);

create policy "customer_asset_folders_delete"
  on customer_asset_folders for delete to authenticated
  using (
    get_my_role() in ('admin', 'super_admin')
    or (
      (allowed_roles is null or array_length(allowed_roles, 1) is null)
      and (allowed_user_ids is null or array_length(allowed_user_ids, 1) is null)
    )
    or (allowed_roles is not null and get_my_role() = any(allowed_roles))
    or (allowed_user_ids is not null and auth.uid() = any(allowed_user_ids))
  );
