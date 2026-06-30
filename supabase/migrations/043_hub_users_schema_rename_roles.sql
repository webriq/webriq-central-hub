-- Migration 043: hub_users schema update
-- 1. Rename zoho_user_id → external_id (consistent with tasks/milestones/tasklists)
-- 2. Add operational columns for full Zoho dataset preservation
-- 3. Backfill role values to new Hub role system; Super Admin assigns going forward

-- Rename column
alter table hub_users rename column zoho_user_id to external_id;

-- Add new columns
alter table hub_users
  add column if not exists status text not null default 'active',
  add column if not exists last_active_at timestamptz,
  add column if not exists joined_at timestamptz,
  add column if not exists cost_rate_per_hour numeric(10,2) not null default 0,
  add column if not exists source_meta jsonb not null default '{}';

-- Drop any existing role check constraint before backfill
alter table hub_users drop constraint if exists hub_users_role_check;

-- Allow NULL before backfill (role was NOT NULL in original schema)
alter table hub_users alter column role drop not null;

-- Backfill to new role system
-- New values: 'Super Admin' | 'PM' | 'Admin' | 'Developer' | 'Other' | NULL
update hub_users set role = 'Admin'     where lower(role) = 'admin';
update hub_users set role = 'PM'        where lower(role) = 'pm';
update hub_users set role = 'Developer' where lower(role) in ('developer', 'dev');
update hub_users set role = 'Other'     where lower(role) = 'client';
update hub_users set role = null        where lower(role) = 'pending';

-- Index on external_id for dedup lookups during import
create index if not exists hub_users_external_id_idx on hub_users(external_id) where external_id is not null;

-- Index on status for active-user queries
create index if not exists hub_users_status_idx on hub_users(status);
