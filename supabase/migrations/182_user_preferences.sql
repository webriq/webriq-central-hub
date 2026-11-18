-- Task 482 — per-account UI preferences. First (only) preference: the Projects listing view.
-- A separate table rather than a `profiles` column: `profiles_update_own` (026) lets a user write
-- any column of their own profile, so keeping preferences apart keeps that surface from growing.
-- Apply after 181. Code degrades to the List default while this is unapplied (42P01 / PGRST205).

create table if not exists public.user_preferences (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  projects_view text not null default 'list' check (projects_view in ('list', 'grid')),
  updated_at    timestamptz not null default now()
);

alter table public.user_preferences enable row level security;

-- Own row only. No delete policy: the row goes with the user (cascade). No admin access needed.
create policy "user_preferences_select_own"
  on public.user_preferences for select to authenticated
  using (user_id = auth.uid());

create policy "user_preferences_insert_own"
  on public.user_preferences for insert to authenticated
  with check (user_id = auth.uid());

create policy "user_preferences_update_own"
  on public.user_preferences for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
