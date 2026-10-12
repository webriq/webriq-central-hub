-- Migration 173: StackShift parity-gate sign-off + alerts cron (task 449)
-- WRITTEN, NOT APPLIED — the operator applies it (after 169-172).
--
--   1. stackshift_parity_signoff: the explicit, audited record that a human approved the parity gate for a
--      site and window. Task 450 (Desk step-down) reads the latest NON-REVOKED row for a site as its
--      precondition. Written only by the sign-off route (service role) after it recomputes the report and
--      finds it PASS — there is no insert/update/delete policy, so no client can write or approve.
--   2. The pg_cron job for /api/cron/stackshift-alerts (every 10 minutes; Vault pattern of 122/148/171).
--
-- Rollback:
--   select cron.unschedule('stackshift-alerts');
--   drop table if exists stackshift_parity_signoff;

create table if not exists stackshift_parity_signoff (
  id               uuid primary key default gen_random_uuid(),
  site             text not null,
  window_from      timestamptz not null,
  window_to        timestamptz not null,
  ticket_count     integer not null,
  report           jsonb not null,                       -- snapshot of the six checks + thresholds at sign time
  acknowledgements jsonb not null default '[]'::jsonb,   -- [{ticketId, reason}] accepted check-(d) differences
  attestations     jsonb not null default '{}'::jsonb,   -- the manual hand-off steps the signer confirmed
  note             text,
  signed_by        uuid not null references profiles(id),
  signed_at        timestamptz not null default now(),
  revoked_at       timestamptz,
  revoked_by       uuid references profiles(id),
  revoke_reason    text
);
create index if not exists stackshift_parity_signoff_site_idx on stackshift_parity_signoff (site, signed_at desc);

alter table stackshift_parity_signoff enable row level security;

create policy "stackshift_parity_signoff_admin_read" on stackshift_parity_signoff
  for select to authenticated using (get_my_role() in ('admin', 'super_admin'));

create extension if not exists supabase_vault cascade;
create extension if not exists pg_cron cascade;
create extension if not exists pg_net cascade;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'stackshift-alerts') then
    perform cron.alter_job(
      (select jobid from cron.job where jobname = 'stackshift-alerts'),
      command := $cmd$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/cron/stackshift-alerts',
          body    := '{}'::jsonb,
          headers := jsonb_build_object(
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_key'),
            'content-type', 'application/json'
          )
        )
      $cmd$
    );
  else
    perform cron.schedule(
      'stackshift-alerts',
      '*/10 * * * *',
      $cmd$
        select net.http_post(
          url     := (select decrypted_secret from vault.decrypted_secrets where name = 'app_base_url') || '/api/cron/stackshift-alerts',
          body    := '{}'::jsonb,
          headers := jsonb_build_object(
            'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret_key'),
            'content-type', 'application/json'
          )
        )
      $cmd$
    );
  end if;
end $$;
