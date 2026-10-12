-- Migration 174: StackShift reconcile misses (task 450)
-- WRITTEN, NOT APPLIED — the operator applies it (after 169-173).
--
-- In Desk reconcile mode (a site is signed off AND STACKSHIFT_DESK_RECONCILE_ENABLED=true) a StackShift ticket
-- that exists in Zoho Desk but has neither a Hub Desk row nor a direct copy is a MISS: the direct path failed
-- for it. It is never imported silently; it is recorded here, admins are notified, and an admin imports or
-- dismisses it from Desk -> StackShift step-down. Service-role writes only; admin read.
--
-- Rollback: drop table if exists stackshift_reconcile_misses;

create table if not exists stackshift_reconcile_misses (
  desk_ticket_id  text primary key,
  ticket_number   text,
  subject         text not null,
  site            text,
  requester_email text,
  first_seen_at   timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  last_alerted_at timestamptz,
  status          text not null default 'open' check (status in ('open', 'imported', 'dismissed')),
  resolved_by     uuid references profiles(id),
  resolved_at     timestamptz
);
create index if not exists stackshift_reconcile_misses_status_idx on stackshift_reconcile_misses (status, last_seen_at desc);

alter table stackshift_reconcile_misses enable row level security;

create policy "stackshift_reconcile_misses_admin_read" on stackshift_reconcile_misses
  for select to authenticated using (get_my_role() in ('admin', 'super_admin'));
