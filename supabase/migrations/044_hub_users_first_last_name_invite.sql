-- Migration 044: hub_users — split display_name into first_name/last_name, add is_invited
-- display_name is dropped; first_name + last_name are the source of truth going forward.

-- Add new columns
alter table hub_users
  add column if not exists first_name text,
  add column if not exists last_name  text,
  add column if not exists is_invited boolean not null default false;

-- Backfill from display_name
update hub_users
set
  first_name = split_part(trim(display_name), ' ', 1),
  last_name  = nullif(trim(substring(trim(display_name) from position(' ' in trim(display_name) || ' '))), '')
where display_name is not null;

-- Drop old column
alter table hub_users drop column if exists display_name;
