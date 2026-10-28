-- Migration 179 (task 464): external_id on customer_asset_folders + customer_assets.
--
-- WRITTEN, NOT APPLIED. The Zoho Project Documents import (POST /api/admin/zoho-import/documents)
-- stores each folder's / file's WorkDrive id here so a re-run recognises what it already created
-- instead of duplicating it (the same idea as attachments.external_id). The import refuses to write
-- until this is applied; its dry run still works without it.
--
-- Plain (non-partial) unique indexes: Postgres treats NULLs as distinct, so every existing row — and
-- every row created through the UI — keeps external_id NULL without conflicting, and PostgREST can
-- still infer the index for ON CONFLICT (external_id) if a later task wants an upsert.

alter table customer_asset_folders add column if not exists external_id text;
alter table customer_assets        add column if not exists external_id text;

create unique index if not exists customer_asset_folders_external_id_key on customer_asset_folders (external_id);
create unique index if not exists customer_assets_external_id_key        on customer_assets (external_id);
