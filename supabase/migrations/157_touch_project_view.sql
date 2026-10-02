-- Migration 157: activity bumps for the "Recently accessed" project sort (task 417)
--
-- Task 416's project_views.last_accessed_at measured opens only. This adds touch_project_view():
-- called (best-effort, post-response) when the user does qualifying work on a project — commenting,
-- editing/status changes, creating tasks/tickets, starting the timer, logging time — so recency
-- follows real work wherever in the app it happens. Depends on migration 156.
--
-- Differences from record_project_view():
--   * does NOT touch access_count on update (that stays "number of opens"; a first-ever touch
--     inserts the table default of 1)
--   * server-side throttle: an existing row touched within the last 60 s is left alone
--   * never touches soft-deleted projects
--
-- SECURITY INVOKER, so project_views' own-row RLS still applies: a caller can only ever write
-- their own row. Written, not applied — apply manually (Notes-migration convention), after 156.

create or replace function public.touch_project_view(p_project_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.project_views (user_id, project_id)
  select auth.uid(), p.id
  from public.projects p
  where p.id = p_project_id
    and p.status <> 'deleted'
  on conflict (user_id, project_id)
  do update set last_accessed_at = now()
  where public.project_views.last_accessed_at < now() - interval '60 seconds';
$$;

grant execute on function public.touch_project_view(uuid) to authenticated;
