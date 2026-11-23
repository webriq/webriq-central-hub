-- Task 498 — Orders table row actions.
--   archived_at: set by Archive, cleared by Restore. Archived orders show only on the Archived tab and
--                keep their status (pending_review / converted / dismissed).
--   deleted_at:  soft delete (super_admin, never converted). Hidden everywhere; row + Storage files kept.
-- Written-not-applied: the list page falls back to unfiltered queries on 42703 and the actions return 503.
alter table public.stackshift_orders
  add column if not exists archived_at timestamptz,
  add column if not exists deleted_at timestamptz;
