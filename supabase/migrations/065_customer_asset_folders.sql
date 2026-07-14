-- Migration 065: customer_asset_folders — real, user-creatable folder tree for the
-- Storage/KB File Explorer (task 141), replacing the fixed label-derived-only folder
-- model from tasks 134/139. Folders can be created anywhere: at root, or nested inside
-- any existing folder (including the former hardcoded system buckets, which become
-- real rows too via a one-time provisioning step in the API route, not this migration —
-- provisioning is scoped per customer/project/phase and there's no safe single INSERT
-- that covers every existing project here).
--
-- customer_assets.folder_id lets any asset be explicitly placed in a folder. Existing
-- assets are backfilled lazily by GET .../assets/folders (see that route) rather than
-- in this migration, for the same per-project-scoping reason.

create table if not exists customer_asset_folders (
  id uuid primary key default gen_random_uuid(),
  customer_id text not null references customers(customer_id),
  project_id uuid references projects(id),
  phase_number int,
  parent_folder_id uuid references customer_asset_folders(id) on delete cascade,
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (customer_id, project_id, phase_number, parent_folder_id, name)
);

alter table customer_assets
  add column if not exists folder_id uuid references customer_asset_folders(id) on delete set null;

create index if not exists customer_asset_folders_parent_idx on customer_asset_folders(parent_folder_id);
create index if not exists customer_asset_folders_scope_idx on customer_asset_folders(customer_id, project_id, phase_number);
create index if not exists customer_assets_folder_idx on customer_assets(folder_id);
