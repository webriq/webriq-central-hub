-- Migration 045: Update auth triggers for first_name/last_name/external_id schema
-- Fixes handle_new_hub_user() which still referenced dropped display_name + zoho_user_id columns.

create or replace function public.handle_new_hub_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_full_name  text;
  v_first_name text;
  v_last_name  text;
  v_external_id text;
begin
  v_full_name := coalesce(
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'name',
    new.raw_user_meta_data->>'display_name',
    split_part(new.email, '@', 1)
  );

  v_first_name := coalesce(
    new.raw_user_meta_data->>'first_name',
    split_part(v_full_name, ' ', 1)
  );

  v_last_name := coalesce(
    new.raw_user_meta_data->>'last_name',
    nullif(trim(substring(v_full_name from position(' ' in v_full_name || ' '))), '')
  );

  -- external_id: Zoho sends the ZUID in the 'sub' claim as "{ZUID}.{identifier}"
  v_external_id := nullif(split_part(new.raw_user_meta_data->>'sub', '.', 1), '');

  insert into public.hub_users (id, email, first_name, last_name, role, external_id)
  values (
    new.id,
    new.email,
    v_first_name,
    v_last_name,
    null,  -- role is always NULL on creation; Super Admin assigns later
    v_external_id
  )
  on conflict (id) do update set
    email       = excluded.email,
    first_name  = coalesce(hub_users.first_name, excluded.first_name),
    last_name   = coalesce(hub_users.last_name,  excluded.last_name),
    external_id = coalesce(hub_users.external_id, excluded.external_id),
    updated_at  = now();

  return new;
end;
$$;
