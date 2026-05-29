-- WebriQ Central Hub — Migration 017: KB lint logs + weekly cron (Sprint 6, M10)

create table if not exists kb_lint_logs (
  id            uuid primary key default gen_random_uuid(),
  report        jsonb not null default '{}',
  files_audited integer not null default 0,
  model_used    text,
  input_tokens  integer,
  output_tokens integer,
  created_at    timestamptz not null default now()
);

create index if not exists idx_kb_lint_logs_created_at on kb_lint_logs (created_at desc);

-- Enable RLS (admin-only read via service role; no user-facing policy needed at Phase 1)
alter table public.kb_lint_logs enable row level security;

-- Weekly wiki lint: Monday 06:00 UTC
-- pg_cron and pg_net must already be enabled (migration 012 enables them).
-- Update the URL via cron.alter_job() after deployment (same pattern as migration 012).
select cron.schedule(
  'weekly-wiki-lint',
  '0 6 * * 1',
  $job$
  select net.http_post(
    url     := 'https://REPLACE_WITH_APP_URL/api/kb/lint',
    body    := '{}'::jsonb,
    headers := '{"x-digest-secret":"REPLACE_WITH_DIGEST_SECRET","content-type":"application/json"}'::jsonb
  )
  $job$
);
