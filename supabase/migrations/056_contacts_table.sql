-- Migration 056: Zoho Desk Contacts Table (task 117)
-- Receives imported Zoho Desk contacts, matched to `customers` by normalized
-- Desk account name -> customers.company_name comparison where possible.
--
--   zoho_desk_contact_id  text unique — Desk contact ID, the import dedupe key
--   zoho_desk_account_id  text nullable — raw Desk accountId, kept even after a
--                          successful match for audit/debugging
--   customer_id            text nullable FK -> customers — null means unmatched,
--                          awaiting manual assignment; no assignment UI exists yet
--   match_method            'account_name' (auto) | 'manual' (reserved for a future
--                          assignment UI) | null (unmatched)
--   source_meta            jsonb — Desk fields with no first-class Hub equivalent
--                          (city, country, state, street, zip, type, facebook,
--                          twitter, ownerId, description, cf/custom fields)

create table contacts (
  id uuid primary key default gen_random_uuid(),
  customer_id text references customers(customer_id) on delete set null,
  zoho_desk_contact_id text unique not null,
  zoho_desk_account_id text,
  first_name text,
  last_name text,
  email text,
  secondary_email text,
  phone text,
  mobile text,
  title text,
  match_method text check (match_method in ('account_name', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_meta jsonb default '{}'
);

alter table contacts enable row level security;

create policy "contacts_staff_read"
  on contacts for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

create policy "contacts_pm_write"
  on contacts for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));

create index contacts_customer_id_idx on contacts(customer_id) where customer_id is not null;
create index contacts_email_idx on contacts(email) where email is not null;
