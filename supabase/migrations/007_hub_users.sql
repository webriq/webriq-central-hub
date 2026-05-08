-- WebriQ Central Hub — Migration 007: hub_users
-- Internal user profiles with role assignment and Zoho identity linkage.
-- id FK references auth.users so rows are deleted automatically when the auth user is removed.

create table if not exists public.hub_users (
  id            uuid primary key references auth.users(id) on delete cascade,
  email         text not null,
  display_name  text,
  role          text not null default 'pm'
    check (role in ('admin', 'pm', 'developer', 'client')),
  zoho_user_id  text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger set_updated_at_hub_users
  before update on public.hub_users
  for each row execute function update_updated_at_column();

alter table public.hub_users enable row level security;

-- Users can read only their own row; role writes are service-role only (via Supabase Dashboard)
create policy "users_read_own"
  on public.hub_users for select to authenticated
  using (id = auth.uid());

-- Auto-insert on first login — fires for both Zoho OAuth and email/password sign-ups.
-- security definer + fixed search_path required for triggers on auth.users writing to public schema.
create or replace function public.handle_new_hub_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.hub_users (id, email, display_name, zoho_user_id)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'provider_id'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_hub_user();
