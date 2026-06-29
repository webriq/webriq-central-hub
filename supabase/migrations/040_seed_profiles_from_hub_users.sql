-- Migration 040: Seed profiles roles from hub_users
-- Fix: staff users who signed up on the new database got role='client' from
-- handle_new_user() trigger default. This upserts the correct role for every
-- user in hub_users, mapping hub_users role values to profiles role enum values.
--
-- Role mapping:
--   hub_users 'admin'   → profiles 'admin'
--   hub_users 'pm'      → profiles 'pm'
--   hub_users 'dev'     → profiles 'developer'
--   hub_users 'pending' → profiles 'hr'  (Nikki — confirmed from data.sql dump)

insert into public.profiles (id, role, full_name, created_at, updated_at)
select
  hu.id,
  case hu.role
    when 'dev'     then 'developer'
    when 'pending' then 'hr'
    else hu.role
  end,
  hu.display_name,
  now(),
  now()
from public.hub_users hu
on conflict (id) do update
  set role       = excluded.role,
      updated_at = now();
