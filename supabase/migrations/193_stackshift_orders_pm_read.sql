-- Migration 193: PMs can read StackShift Orders again (task 504)
--
-- Task 375 / migration 140 removed 'pm' from stackshift_orders_staff_read. Task 504 restores full
-- Orders access for PMs (page guards, sidebar, requireOrderReviewer()/requireOrderMutator() in
-- src/app/api/stackshift-orders/_auth.ts). Delete stays super_admin only in the API. The Orders
-- pages read through the session client, so without this policy a PM passes the page guard but
-- sees an empty list.
--
-- WRITTEN, NOT APPLIED. No-op when migration 130 (the table) isn't applied yet; apply after 130
-- and 140. 'marketing' is kept as-is.
--
-- ─── Rollback (verbatim — restores migration 140's policy) ──────────────────
-- do $$
-- begin
--   if to_regclass('public.stackshift_orders') is not null then
--     drop policy if exists "stackshift_orders_staff_read" on public.stackshift_orders;
--     create policy "stackshift_orders_staff_read"
--       on public.stackshift_orders for select to authenticated
--       using (get_my_role() in ('admin', 'super_admin', 'marketing'));
--   end if;
-- end $$;
-- ────────────────────────────────────────────────────────────────────────────

do $$
begin
  if to_regclass('public.stackshift_orders') is null then
    raise notice 'stackshift_orders does not exist (migration 130 not applied) — skipping';
    return;
  end if;

  drop policy if exists "stackshift_orders_staff_read" on public.stackshift_orders;
  create policy "stackshift_orders_staff_read"
    on public.stackshift_orders for select to authenticated
    using (get_my_role() in ('admin', 'super_admin', 'pm', 'marketing'));
end $$;
