-- Task 488 — revoke MCP connections issued before the separate-session fix.
--
-- Before task 488, MCP consent stored the user's *browser* Supabase refresh token,
-- so every pre-fix mcp_oauth_tokens row shares a token family with a hub login.
-- Decision D1: revoke them all; users reconnect the connector once and get their
-- own session.
--
-- Operator: run AFTER task 488 is deployed. Replace <<DEPLOYED_AT>> (both places)
-- with the deploy time, e.g. 2026-11-20T03:00:00Z. The guard aborts if left unset.

do $$
begin
  if '<<DEPLOYED_AT>>' like '<<%' then
    raise exception 'Set DEPLOYED_AT to the task 488 deploy timestamp before running.';
  end if;
end $$;

update public.mcp_oauth_tokens
   set revoked_at = now()
 where revoked_at is null
   and created_at < '<<DEPLOYED_AT>>'::timestamptz;

-- Unredeemed codes from before the deploy also carry browser tokens.
delete from public.mcp_oauth_authorization_codes
 where used_at is null
   and expires_at < '<<DEPLOYED_AT>>'::timestamptz + interval '1 minute';
