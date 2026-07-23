-- MCP OAuth 2.1 authorization server schema (task 181).
--
-- These four tables back a new OAuth *authorization server* role for this app
-- (issuing tokens to external MCP clients like Claude's custom connector),
-- distinct from the existing "Sign in with Zoho" flow where this app is an
-- OAuth *client*. Additive only — no changes to existing tables.
--
-- All four are service-role-only: RLS is enabled with no policies defined, so
-- only the service role (adminClient, which bypasses RLS) can read or write
-- them. authenticated/anon get zero access by default.
--
-- supabase_refresh_token columns are stored as plaintext, confirmed with the
-- user during planning (task 181): this matches the existing trust model
-- already extended to adminClient/SUPABASE_SECRET_KEY, and this codebase has
-- no pgcrypto/column-encryption precedent to build on. Revisit if this
-- becomes a compliance requirement.
--
-- NOT YET APPLIED — do not run this migration without explicit approval.

create table public.mcp_oauth_clients (
  id uuid primary key default gen_random_uuid(),
  client_id text not null unique,
  client_name text not null,
  redirect_uris text[] not null,
  token_endpoint_auth_method text not null default 'none',
  created_at timestamptz not null default now()
);

alter table public.mcp_oauth_clients enable row level security;

create table public.mcp_oauth_authorization_codes (
  code text primary key,
  client_id text not null references public.mcp_oauth_clients (client_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  redirect_uri text not null,
  code_challenge text not null,
  code_challenge_method text not null default 'S256',
  scopes text[] not null,
  supabase_refresh_token text not null,
  expires_at timestamptz not null,
  used_at timestamptz
);

alter table public.mcp_oauth_authorization_codes enable row level security;
create index mcp_oauth_authorization_codes_expires_at_idx on public.mcp_oauth_authorization_codes (expires_at);

create table public.mcp_oauth_tokens (
  id uuid primary key default gen_random_uuid(),
  access_token_hash text not null unique,
  refresh_token_hash text not null unique,
  client_id text not null references public.mcp_oauth_clients (client_id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  scopes text[] not null,
  supabase_refresh_token text not null,
  access_token_expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.mcp_oauth_tokens enable row level security;
create index mcp_oauth_tokens_user_id_idx on public.mcp_oauth_tokens (user_id);

create table public.mcp_tool_invocation_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  client_id text,
  tool_name text not null,
  scopes_used text[],
  status text not null default 'success',
  error_message text,
  duration_ms integer,
  created_at timestamptz not null default now()
);

alter table public.mcp_tool_invocation_logs enable row level security;
create index mcp_tool_invocation_logs_created_at_idx on public.mcp_tool_invocation_logs (created_at desc);
