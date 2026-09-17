-- Migration 140: Exclude PMs from StackShift Orders (task 375)
-- The /stackshift-orders review queue and its APIs are now admin/super_admin only — PMs no
-- longer review or convert Order Form submissions (task 375 also updated the page redirects,
-- the sidebar link, and requireOrderReviewer()/requireOrderMutator() in
-- src/app/api/stackshift-orders/_auth.ts to match). This drops 'pm' from migration 130's
-- original read policy; 'marketing' is untouched (out of scope for this task).
--
-- Migration 130 (and its successors 134/135/136) are still WRITTEN NOT APPLIED as of this
-- migration — this one is written in the same state and must be applied together with them,
-- in order.

drop policy if exists "stackshift_orders_staff_read" on stackshift_orders;

create policy "stackshift_orders_staff_read"
  on stackshift_orders for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing'));
