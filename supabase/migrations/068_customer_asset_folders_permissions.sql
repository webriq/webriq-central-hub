-- Migration 068: customer_asset_folders — role/user-based sharing (task 144), same
-- shape/semantics as customer_assets.allowed_roles/allowed_user_ids (task 138):
-- NULL/empty = no restriction, OR-combined, enforced application-side (API routes),
-- not RLS — same convention as every other allowed_roles/allowed_user_ids column here.

alter table customer_asset_folders
  add column if not exists allowed_roles text[],
  add column if not exists allowed_user_ids uuid[];
