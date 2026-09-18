-- Migration 144: force_logout_user (task 378)
--
-- Single-user mirror of force_logout_all_except (migration 009). Deletes the target's
-- sessions and refresh tokens so a just-deactivated (banned) user loses access on their
-- next request instead of at natural access-token expiry — GoTrue only rechecks
-- auth.users.banned_until on sign-in and on token refresh, so an already-issued access
-- token would otherwise stay valid for the remainder of its TTL (default 1h).
--
-- Called exclusively from POST /api/v2/users/[userId]/deactivate via adminClient (service
-- role). Execute is revoked from anon/authenticated so a logged-in user can never RPC this
-- against someone else — the route's own admin/super_admin guard is the real gate.

create or replace function public.force_logout_user(target_user_id uuid)
returns table(
  action text,
  count bigint
)
language plpgsql
security definer
set search_path = 'auth', 'public'
as $$
declare
  session_count bigint;
  refresh_count bigint;
begin
  -- Refresh tokens first — sessions reference them (same ordering as migration 009).
  -- auth.refresh_tokens.user_id is varchar, so the uuid needs an explicit ::text cast.
  with deleted as (
    delete from auth.refresh_tokens
    where user_id = target_user_id::text
    returning 1
  )
  select count(*) into refresh_count from deleted;

  with deleted as (
    delete from auth.sessions
    where user_id = target_user_id
    returning 1
  )
  select count(*) into session_count from deleted;

  return query
    select 'sessions_deleted'::text, session_count
    union all
    select 'refresh_tokens_deleted'::text, refresh_count;
end;
$$;

revoke all on function public.force_logout_user(uuid) from public;
revoke all on function public.force_logout_user(uuid) from anon;
revoke all on function public.force_logout_user(uuid) from authenticated;
