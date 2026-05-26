-- WebriQ Central Hub — Migration 009: force_logout_all_except
-- Admin utility to force-logout all users except a specified one.
-- Deletes all sessions and refresh tokens from auth schema for non-exempt users,
-- causing their next request to fail JWT validation via getClaims().

create or replace function public.force_logout_all_except(
  exclude_user_id uuid
)
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
  -- Delete refresh tokens for non-exempt users (must be first — sessions reference them)
  -- auth.refresh_tokens.user_id is varchar, so cast exclude_user_id for comparison
  with deleted as (
    delete from auth.refresh_tokens
    where user_id != exclude_user_id::text
    returning 1
  )
  select count(*) into refresh_count from deleted;

  -- Delete sessions for non-exempt users
  with deleted as (
    delete from auth.sessions
    where user_id != exclude_user_id
    returning 1
  )
  select count(*) into session_count from deleted;

  return query
    select 'sessions_deleted'::text, session_count
    union all
    select 'refresh_tokens_deleted'::text, refresh_count;
end;
$$;


