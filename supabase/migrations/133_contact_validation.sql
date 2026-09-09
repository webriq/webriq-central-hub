-- Migration 133: Contact Validation — cache + decision log (task 353)
--
-- Backs the shared contact-validation endpoint POST /api/public/validate, which webriq.com
-- (and later other WebriQ properties) call server-to-server before storing a lead / signup.
-- The endpoint wraps Abstract's Email/Phone Validation APIs, applies a composite risk score,
-- and returns ONLY { allowed, riskLevel, reasonCode } — never raw Abstract payloads.
--
-- Both tables are written exclusively by the service-role adminClient (the endpoint has no
-- user session — it is token-gated, mirroring task 347's stackshift-order webhook). RLS is
-- therefore deny-all to anon/authenticated; a staff read policy is kept only so an internal
-- ops view could inspect the decision log later.
--
--   validation_cache   normalized email/phone -> verdict, 30-day TTL. The lookup key is a
--                      SHA-256 hex of the normalized value (value_hash) so raw PII is not
--                      the primary key. `normalized_value` is kept for debugging/ops and can
--                      be dropped or nulled under a stricter retention policy.
--   validation_logs    one row per decision, for audit + tuning the risk-score weights and
--                      for the monthly Abstract-quota check. `abstract_calls` is a jsonb
--                      tally like {"email_reputation":1} or {"phone_intelligence":1} — 0
--                      keys on a cache hit — summed per calendar month by the quota-check
--                      cron. (Abstract's Email Reputation / Phone Intelligence products each
--                      return the full picture in one request, so it's at most 1 per kind.)

create table validation_cache (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('email', 'phone')),
  value_hash text not null,
  normalized_value text,
  result jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (kind, value_hash)
);

create index validation_cache_expires_at_idx on validation_cache(expires_at);

create table validation_logs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('email', 'phone')),
  value_hash text not null,
  allowed boolean not null,
  risk_level text not null check (risk_level in ('low', 'medium', 'high', 'unknown')),
  risk_score integer,
  reason_code text not null,
  degraded boolean not null default false,
  cache_hit boolean not null default false,
  abstract_calls jsonb not null default '{}'::jsonb,
  source text,
  created_at timestamptz not null default now()
);

create index validation_logs_created_at_idx on validation_logs(created_at);
create index validation_logs_value_hash_idx on validation_logs(kind, value_hash);

alter table validation_cache enable row level security;
alter table validation_logs enable row level security;

-- Writes bypass RLS via the service-role adminClient. No anon/authenticated write path.
-- Staff read on the log only (parity with `accounts` / `stackshift_orders`); the cache has
-- no read policy — it is an internal implementation detail with hashed-PII rows.
create policy "validation_logs_staff_read"
  on validation_logs for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'));
