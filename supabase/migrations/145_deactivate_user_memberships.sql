-- Migration 145: deactivate_user_memberships (task 378, /simplify round 2)
--
-- Atomic mirror of what deactivateUser() (src/lib/users/deactivate.ts) otherwise does as two
-- independent DELETEs (phase_members, project_members) plus a separate hub_users.status
-- UPDATE, each its own Supabase-JS round trip with no transaction spanning them. A plpgsql
-- function body is one implicit transaction, so wrapping all three writes here removes the
-- partial-failure state where memberships are gone but status update didn't land (or vice
-- versa) — something the ban step (migration-independent, a GoTrue HTTP call) can't avoid but
-- these plain public-schema writes never needed to accept.
--
-- deactivateUser() calls this first and falls back to its original sequential writes only if
-- the RPC errors (e.g. this migration not yet applied) — same non-fatal-RPC shape already used
-- for force_logout_user (migration 144).

create or replace function public.deactivate_user_memberships(target_user_id uuid)
returns void
language plpgsql
security definer
set search_path = 'public'
as $$
begin
  delete from phase_members where user_id = target_user_id;
  delete from project_members where user_id = target_user_id;
  update hub_users set status = 'inactive' where id = target_user_id;
end;
$$;

revoke all on function public.deactivate_user_memberships(uuid) from public;
revoke all on function public.deactivate_user_memberships(uuid) from anon;
revoke all on function public.deactivate_user_memberships(uuid) from authenticated;
