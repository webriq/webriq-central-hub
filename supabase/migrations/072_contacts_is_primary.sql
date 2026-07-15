-- Migration 072: contacts.is_primary — customer primary contact moves off customers columns
--
-- Task 151. `customers.contact_name`/`contact_email` (plus phone stashed per-project in
-- projects.source_meta.primary_contact_phone, task 122) modeled "primary contact" as a
-- freeform blob on customers even though a customer can have many contacts (contacts,
-- task 117's Zoho Desk import, already has the customer_id FK for this). contacts.is_primary
-- becomes the write-side source of truth; customers.contact_name/contact_email remain as a
-- synced read cache (kept current by application code on every write) so the many existing
-- read-only call sites (list views, search, public onboarding pre-fill, reply.ts) don't need
-- to change.

alter table contacts add column if not exists full_name text;
alter table contacts add column if not exists is_primary boolean not null default false;

-- At most one primary contact per customer, enforced at the DB level.
create unique index if not exists contacts_one_primary_per_customer
  on contacts (customer_id) where is_primary;

-- Backfill (a): customers whose contact_email already matches an existing contacts row
-- (e.g. a Zoho Desk-imported contact previously set primary via task 120) — flag it.
update contacts c
set is_primary = true
from customers cu
where c.customer_id = cu.customer_id
  and cu.contact_email is not null
  and c.email is not null
  and lower(trim(c.email)) = lower(trim(cu.contact_email))
  and not exists (select 1 from contacts c2 where c2.customer_id = c.customer_id and c2.is_primary);

-- Backfill (b): customers with contact_name/contact_email but no existing contacts match —
-- insert a new manually-sourced primary row.
insert into contacts (customer_id, full_name, email, is_primary, match_method)
select cu.customer_id, cu.contact_name, cu.contact_email, true, 'manual'
from customers cu
where (cu.contact_name is not null or cu.contact_email is not null)
  and not exists (select 1 from contacts c where c.customer_id = cu.customer_id and c.is_primary);
