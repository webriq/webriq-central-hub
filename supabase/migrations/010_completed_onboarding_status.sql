-- Migration 010: Add completed_onboarding status + drop zoho_account_id
-- completed_onboarding sits between onboarding and active — PM must manually create Zoho projects to advance.

-- Alter customers.status CHECK to include the new intermediate state
alter table customers drop constraint if exists customers_status_check;
alter table customers add constraint customers_status_check
  check (status in ('active', 'inactive', 'onboarding', 'completed_onboarding'));

-- zoho_account_id is not used — customers have no Zoho account; the Hub owns the Zoho OAuth identity.
-- The Zoho Desk webhook lookup via this column is also removed (see webhooks/route.ts).
alter table customers drop column if exists zoho_account_id;
