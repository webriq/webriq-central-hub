-- Migration 156: per-user project access tracking (task 416)
--
-- Backs the Projects listing's "Recently accessed" sort (default on every classification tab).
-- One row per (user, project): when the user last opened the project and how many times.
-- Strictly per-user — RLS only ever exposes a user's own rows; there is no cross-user read.
--
-- Written, not applied — apply manually (Notes-migration convention). The listing loader and the
-- recorder route both degrade to a no-op / "newest" ordering until this lands.

create table if not exists public.project_views (
  user_id          uuid        not null references auth.users(id) on delete cascade,
  project_id       uuid        not null references public.projects(id) on delete cascade,
  last_accessed_at timestamptz not null default now(),
  access_count     integer     not null default 1,
  primary key (user_id, project_id)
);

create index if not exists project_views_user_recent_idx
  on public.project_views (user_id, last_accessed_at desc);

alter table public.project_views enable row level security;

drop policy if exists "project_views_own_select" on public.project_views;
create policy "project_views_own_select"
  on public.project_views for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "project_views_own_insert" on public.project_views;
create policy "project_views_own_insert"
  on public.project_views for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "project_views_own_update" on public.project_views;
create policy "project_views_own_update"
  on public.project_views for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- Upsert helper. SECURITY INVOKER so the policies above still apply: a caller can only ever
-- write their own row. Called from POST /api/v2/projects/[projectId]/view.
create or replace function public.record_project_view(p_project_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.project_views (user_id, project_id)
  values (auth.uid(), p_project_id)
  on conflict (user_id, project_id)
  do update set last_accessed_at = now(),
                access_count     = public.project_views.access_count + 1;
$$;

grant execute on function public.record_project_view(uuid) to authenticated;
