-- Migration 067: customer_asset_folders — live-run fix for task 141. This project
-- auto-enables RLS on new tables; migration 065 created customer_asset_folders without
-- ever adding a policy, so every insert was default-denied ("new row violates row-level
-- security policy for table customer_asset_folders", confirmed live). Its sibling
-- customer_assets (migration 021) has the same shape of broad "authenticated users can
-- manage" policy — actual fine-grained permission checks (role/user-based visibility,
-- provisioning/backfill validation) already happen application-side in the API routes,
-- not in RLS, matching that established convention.

alter table customer_asset_folders enable row level security;

create policy "Authenticated users can manage customer asset folders"
  on customer_asset_folders for all
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
