-- WebriQ Central Hub — Migration 008: Fix hub_users trigger + backfill
-- Fixes three issues:
--   1. zoho_user_id was reading nonexistent raw_user_meta_data.provider_id → use sub
--   2. display_name was NULL for Zoho users → fallback to email prefix
--   3. Email-first/Zoho-later users never got updated → add AFTER UPDATE trigger

begin;

-- ── 1. Drop old trigger + function ─────────────────────────────────────────

drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists on_auth_user_updated on auth.users;
drop function if exists public.handle_new_hub_user();

-- ── 2. Create corrected function (used by both INSERT and UPDATE triggers) ──

create or replace function public.handle_new_hub_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_display_name text;
  v_zoho_user_id text;
begin
  -- display_name: try Zoho name fields, then email signup fields, then email prefix.
  -- Note: Zoho OIDC doesn't send a name — the callback page fetches the real name
  -- from Zoho's /oauth/user/info endpoint and updates both hub_users + auth.users.
  v_display_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'display_name',
    split_part(new.email, '@', 1)
  );

  -- zoho_user_id: Zoho sends the user's unique ID in the 'sub' claim.
  -- Format is "{ZUID}.{identifier}" — we want just the ZUID part.
  v_zoho_user_id := split_part(new.raw_user_meta_data->>'sub', '.', 1);

  insert into public.hub_users (id, email, display_name, role, zoho_user_id)
  values (
    new.id,
    new.email,
    v_display_name,
    'pm',
    v_zoho_user_id
  )
  on conflict (id) do update set
    email        = excluded.email,
    display_name = coalesce(hub_users.display_name, excluded.display_name),
    zoho_user_id = coalesce(hub_users.zoho_user_id, excluded.zoho_user_id),
    updated_at   = now();

  return new;
end;
$$;

-- ── 3. Re-create AFTER INSERT trigger ──────────────────────────────────────

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_hub_user();

-- ── 4. AFTER UPDATE trigger — catches email-first/Zoho-later linking ────────

create trigger on_auth_user_updated
  after update of raw_user_meta_data on auth.users
  for each row
  when (old.raw_user_meta_data is distinct from new.raw_user_meta_data)
  execute procedure public.handle_new_hub_user();

-- ── 5. Backfill existing hub_users with corrected data ─────────────────────

-- Extract just the ZUID from sub (e.g., "908075526.1344712556" → "908075526")
update public.hub_users hu
set
  zoho_user_id = split_part(au.raw_user_meta_data->>'sub', '.', 1),
  updated_at   = now()
from auth.users au
where hu.id = au.id
  and au.raw_user_meta_data->>'sub' is not null
  and (hu.zoho_user_id is null or hu.zoho_user_id like '%.%');

-- Fill NULL display_names with email prefix fallback
update public.hub_users
set
  display_name = coalesce(display_name, split_part(email, '@', 1)),
  updated_at   = now()
where display_name is null;

commit;
