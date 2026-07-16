-- Migration 075: customer_products.classifications array (task 157)
--
-- Adds multi-select support for the New Project intake's classification picker. The existing
-- `classification` scalar column stays as-is (check constraint unchanged) and keeps being
-- populated on every write as a backward-compatible read cache for the ~15 existing call sites
-- that expect a single value (Onboarding list badge, GET /api/onboarding/projects, etc.) —
-- `classifications` is the new write-side source of truth for the full selected set.

alter table customer_products add column if not exists classifications text[] not null default '{}';

-- Backfill existing rows so already-created projects have a non-empty classifications array
-- matching their single legacy `classification` value.
update customer_products
  set classifications = array[classification]
  where classification is not null and classifications = '{}';
