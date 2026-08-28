-- Migration 125: Zoho Desk Accounts Table (task 335)
-- Receives imported Zoho Desk accounts (companies) from _from_zoho/desk-accounts.json,
-- soft-matched to `customers` by normalized Desk account name -> customers.company_name
-- (the same matching the `contacts` import already does — migration 056 / task 117).
--
--   external_id          text unique — Desk account ID, the import upsert conflict key
--   account_name         text not null — Zoho `accountName`
--   email / website / phone   text — Desk contact fields (email is populated on ~0.1% of
--                          real rows; kept for completeness)
--   web_url              text — Zoho Desk deep link to the account (`webUrl`)
--   customer_happiness   jsonb — Zoho `customerHappiness` object
--                          ({ badPercentage, okPercentage, goodPercentage } as strings)
--   zoho_crm_account_id  text — `zohoCRMAccount.id` when the Desk account is CRM-linked
--   customer_id          text nullable FK -> customers — null means unmatched (CRM noise
--                          or a company that isn't a WRQ customer); rows import anyway
--   match_method          'account_name' (auto) | 'manual' (reserved) | null (unmatched)
--   created_time         timestamptz — Zoho `createdTime`
--   source_meta          jsonb — the full raw Desk account object, for forward-compat

create table accounts (
  id uuid primary key default gen_random_uuid(),
  external_id text unique not null,
  account_name text not null,
  email text,
  website text,
  phone text,
  web_url text,
  customer_happiness jsonb,
  zoho_crm_account_id text,
  customer_id text references customers(customer_id) on delete set null,
  match_method text check (match_method in ('account_name', 'manual')),
  created_time timestamptz,
  source_meta jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table accounts enable row level security;

-- Read gate mirrors `contacts` (migration 056): the internal staff roles. Writes go through
-- the service-role adminClient (import route) and bypass RLS; a pm-write policy is kept for
-- parity with `contacts` should a manual-edit UI ever land.
create policy "accounts_staff_read"
  on accounts for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

create policy "accounts_pm_write"
  on accounts for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

create index accounts_customer_id_idx on accounts(customer_id) where customer_id is not null;
create index accounts_account_name_lower_idx on accounts(lower(account_name));
