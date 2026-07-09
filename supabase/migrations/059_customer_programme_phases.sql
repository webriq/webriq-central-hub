-- Migration 059: 120-Day Customer Programme — phases, deliverables, notification dedupe, wizard file tagging
--
-- Phase/deliverable *definitions* (names, day ranges, owners) live in src/config/customer-phases.ts as
-- static config — they are identical for every customer and don't belong in the DB. Only per-customer
-- *state* is persisted here: which phase is active, actual start/complete dates, manual overrides, and
-- deliverable completion status.
--
-- "Current phase" is status-driven (customer_phases.status = 'active'), not derived from day-math —
-- this is what lets Bert/PM manually tag a client to whichever phase they're actually starting from,
-- per the spec. programme_started_at is the sole Day-1 anchor for the informational "Day N / 120"
-- counter and for the calendar-driven reminder cron; it is independent of which phase is marked active.

alter table customers add column if not exists programme_started_at timestamptz;
create index if not exists idx_customers_programme_started_at on customers (programme_started_at) where programme_started_at is not null;

-- ─── customer_phases ────────────────────────────────────────────────────────
create table if not exists customer_phases (
  id                    uuid primary key default gen_random_uuid(),
  customer_id           text not null references customers (customer_id) on delete cascade,
  phase_number          smallint not null check (phase_number between 1 and 5),
  status                text not null default 'not_started' check (status in ('not_started', 'active', 'completed', 'skipped')),
  actual_start_date     date,
  actual_completed_date date,
  is_manual_override    boolean not null default false,
  override_note         text,
  wizard_data           jsonb not null default '{}'::jsonb,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (customer_id, phase_number)
);
create index if not exists idx_customer_phases_customer_id on customer_phases (customer_id);

-- ─── customer_deliverables ──────────────────────────────────────────────────
create table if not exists customer_deliverables (
  id               uuid primary key default gen_random_uuid(),
  customer_id      text not null references customers (customer_id) on delete cascade,
  phase_number     smallint not null check (phase_number between 1 and 5),
  deliverable_key  text not null,
  status           text not null default 'pending' check (status in ('pending', 'in_progress', 'done')),
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (customer_id, phase_number, deliverable_key)
);
create index if not exists idx_customer_deliverables_customer_id on customer_deliverables (customer_id);

-- ─── programme_notifications ────────────────────────────────────────────────
-- Dedupe log for the daily reminders cron — a unique (customer_id, notification_key) row means
-- that reminder has already fired for that customer and must never be sent again.
create table if not exists programme_notifications (
  id                uuid primary key default gen_random_uuid(),
  customer_id       text not null references customers (customer_id) on delete cascade,
  notification_key  text not null,
  sent_at           timestamptz not null default now(),
  unique (customer_id, notification_key)
);
create index if not exists idx_programme_notifications_customer_id on programme_notifications (customer_id);

-- ─── customer_assets.phase_number ───────────────────────────────────────────
-- Nullable tag so Bert's wizard file uploads (Step 3) are traceable to Phase 1 while showing up in the
-- same rows the existing Assets tab (task 118) already renders. Null = general asset, unaffected.
alter table customer_assets add column if not exists phase_number smallint;

-- ─── RLS ─────────────────────────────────────────────────────────────────────
alter table customer_phases enable row level security;
alter table customer_deliverables enable row level security;
alter table programme_notifications enable row level security;

drop policy if exists "customer_phases_staff_read" on customer_phases;
create policy "customer_phases_staff_read"
  on customer_phases for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer', 'hr'));

drop policy if exists "customer_phases_staff_write" on customer_phases;
create policy "customer_phases_staff_write"
  on customer_phases for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

drop policy if exists "customer_deliverables_staff_read" on customer_deliverables;
create policy "customer_deliverables_staff_read"
  on customer_deliverables for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer', 'hr'));

drop policy if exists "customer_deliverables_staff_write" on customer_deliverables;
create policy "customer_deliverables_staff_write"
  on customer_deliverables for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

drop policy if exists "programme_notifications_staff_read" on programme_notifications;
create policy "programme_notifications_staff_read"
  on programme_notifications for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer', 'hr'));
-- No client-facing write policy — the reminders cron route writes via adminClient (service role),
-- the documented exception in CLAUDE.md for server-only, session-less write paths.

-- ─── Daily reminders cron ────────────────────────────────────────────────────
-- Same pg_cron/pg_net mechanism as migration 012's daily digest. URL/secret are placeholders —
-- update post-deploy via cron.alter_job(), e.g.:
--
--   select cron.alter_job(
--     (select jobid from cron.job where jobname = 'daily-programme-reminders'),
--     command := format(
--       $cmd$
--       select net.http_post(
--         url     := '%s/api/programme/reminders',
--         body    := '{}'::jsonb,
--         headers := '{"x-digest-secret":"%s","content-type":"application/json"}'::jsonb
--       )
--       $cmd$,
--       'https://YOUR_VERCEL_APP_URL',
--       'YOUR_DIGEST_SECRET'  -- reuses the existing DIGEST_SECRET env var, no new secret introduced
--     )
--   );
--
-- For local development, curl the route directly with the x-digest-secret header (pg_cron can't
-- reach localhost from Supabase cloud) — see task 122's Verification section.
select cron.schedule(
  'daily-programme-reminders',
  '0 9 * * *',
  $job$
  select net.http_post(
    url     := 'https://REPLACE_WITH_APP_URL/api/programme/reminders',
    body    := '{}'::jsonb,
    headers := '{"x-digest-secret":"REPLACE_WITH_DIGEST_SECRET","content-type":"application/json"}'::jsonb
  )
  $job$
);
