-- Migration 169: StackShift direct support foundation (task 444, stage 1a)
-- WRITTEN, NOT APPLIED — the operator applies it. Design: _docs/plan/stackshift-hub-direct-support-design.md §5,
-- contract: _docs/plan/stackshift-hub-support-api-contract.md. No endpoint reads these yet (task 445+), and the
-- existing StackShift → Zoho Desk → Hub flow is untouched.
--
-- Rollback (manual, in reverse order):
--   drop function if exists stackshift_rate_limit_hit(text, timestamptz);
--   drop table if exists support_sla_config, stackshift_rate_limit, stackshift_support_audit, stackshift_outbox;
--   alter table inbox_messages drop column if exists external_ref;
--   alter table inbox drop constraint inbox_channel_check;
--   alter table inbox add constraint inbox_channel_check check (channel in ('portal','email','manual','api'));
--   alter table inbox drop column if exists external_ref, drop column if exists stackshift_site,
--     drop column if exists stackshift_actor_ref, drop column if exists desk_ticket_id;

-- 1. inbox columns ---------------------------------------------------------------------------
-- external_ref: StackShift's own ticket id (unique; nulls don't collide so existing rows are unaffected).
-- desk_ticket_id: the Zoho Desk ticket id StackShift sends during dual-write — a correlation key only,
-- deliberately NOT unique (a duplicate pair may briefly share it).
alter table inbox
  add column if not exists external_ref text,
  add column if not exists stackshift_site text,
  add column if not exists stackshift_actor_ref text,
  add column if not exists desk_ticket_id text;

create unique index if not exists inbox_external_ref_key on inbox (external_ref) where external_ref is not null;
create index if not exists inbox_stackshift_site_idx on inbox (stackshift_site) where stackshift_site is not null;
create index if not exists inbox_desk_ticket_id_idx on inbox (desk_ticket_id) where desk_ticket_id is not null;

-- 'api' (written by the Desk poll, rendered "StackShift") stays valid; 'stackshift' is added (migration 148 pattern).
alter table inbox drop constraint if exists inbox_channel_check;
alter table inbox
  add constraint inbox_channel_check
  check (channel in ('portal', 'email', 'manual', 'api', 'stackshift'));

alter table inbox_messages add column if not exists external_ref text;
create unique index if not exists inbox_messages_external_ref_key
  on inbox_messages (external_ref) where external_ref is not null;

-- 2. Outbox (Hub → StackShift events; dispatcher is task 446) ---------------------------------
create table if not exists stackshift_outbox (
  id              uuid primary key default gen_random_uuid(),
  ticket_id       uuid not null references inbox(id) on delete cascade,
  event_type      text not null,
  payload         jsonb not null default '{}'::jsonb,
  sequence        bigint generated always as identity,
  status          text not null default 'pending' check (status in ('pending', 'sent', 'dead')),
  attempts        integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  created_at      timestamptz not null default now()
);
create index if not exists stackshift_outbox_due_idx on stackshift_outbox (next_attempt_at) where status = 'pending';
create index if not exists stackshift_outbox_ticket_idx on stackshift_outbox (ticket_id, sequence);

-- 3. Audit log (one row per signed request) ---------------------------------------------------
create table if not exists stackshift_support_audit (
  id          uuid primary key default gen_random_uuid(),
  at          timestamptz not null default now(),
  route       text not null,
  key_id      text,
  site        text,
  ticket_ref  text,
  outcome     text not null,
  status_code integer,
  latency_ms  integer,
  ip          text
);
create index if not exists stackshift_support_audit_at_idx on stackshift_support_audit (at desc);
create index if not exists stackshift_support_audit_site_idx on stackshift_support_audit (site, at desc);

-- 4. Rate limit (per site, per minute window) -------------------------------------------------
create table if not exists stackshift_rate_limit (
  site         text not null,
  window_start timestamptz not null,
  count        integer not null default 0,
  primary key (site, window_start)
);

-- Lets the prune below find expired windows without scanning the whole table.
create index if not exists stackshift_rate_limit_window_idx on stackshift_rate_limit (window_start);

-- Single-statement increment: race-free, returns the post-increment count. Also prunes windows older
-- than an hour so the table stays tiny — but only on the FIRST hit of a (site, minute) window
-- (v_count = 1), i.e. at most once per active site per minute instead of on every request.
create or replace function stackshift_rate_limit_hit(p_site text, p_window timestamptz default date_trunc('minute', now()))
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  insert into stackshift_rate_limit as r (site, window_start, count)
  values (p_site, p_window, 1)
  on conflict (site, window_start) do update set count = r.count + 1
  returning r.count into v_count;

  if v_count = 1 then
    delete from stackshift_rate_limit where window_start < now() - interval '1 hour';
  end if;
  return v_count;
end;
$$;

-- 5. SLA config (priority → hours, admin-editable) --------------------------------------------
-- Keys match inbox.priority (low|normal|high|critical). The task doc said "urgent"; inbox uses "critical".
create table if not exists support_sla_config (
  priority   text primary key check (priority in ('low', 'normal', 'high', 'critical')),
  hours      numeric not null check (hours > 0),
  updated_at timestamptz not null default now()
);
insert into support_sla_config (priority, hours) values
  ('critical', 4), ('high', 8), ('normal', 24), ('low', 72)
on conflict (priority) do nothing;

-- 6. RLS --------------------------------------------------------------------------------------
-- Writes (audit, outbox, rate limit) go through the service-role adminClient and bypass RLS; there is no
-- anon/authenticated write path. Role checks use the get_my_role() helper (migration 026).
alter table stackshift_outbox enable row level security;
alter table stackshift_support_audit enable row level security;
alter table stackshift_rate_limit enable row level security;
alter table support_sla_config enable row level security;

create policy "stackshift_outbox_staff_read" on stackshift_outbox
  for select to authenticated using (get_my_role() in ('admin', 'super_admin', 'pm'));

create policy "stackshift_support_audit_staff_read" on stackshift_support_audit
  for select to authenticated using (get_my_role() in ('admin', 'super_admin', 'pm'));

-- stackshift_rate_limit: no policies — internal counter, service role only.

create policy "support_sla_config_staff_read" on support_sla_config
  for select to authenticated using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

create policy "support_sla_config_admin_write" on support_sla_config
  for all to authenticated
  using (get_my_role() in ('admin', 'super_admin'))
  with check (get_my_role() in ('admin', 'super_admin'));
