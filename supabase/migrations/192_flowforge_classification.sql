-- Migration 192: Rename the "Discrete Development" classification to "FlowForge" (task 504)
--
-- The Custom App engagement type is marketed as FlowForge, which is what the StackShift Order Form
-- already calls it. This renames every stored value and swaps the customer_products.classification
-- CHECK (migration 060) to the new value.
--
-- WRITTEN, NOT APPLIED. The app works before and after it is applied: reads map the legacy value
-- through LEGACY_CLASSIFICATION_ALIASES (src/config/customer-phases.ts), the listing filter matches
-- both values, and customer_products writes retry with the legacy scalar on this CHECK's 23514
-- (src/lib/projects/classification-write.ts).
--
-- Order matters: drop the CHECK, rename, then re-add it. Renaming first fails the old CHECK, and
-- re-adding first fails on the legacy rows (task 494 lesson).
--
-- Idempotent: a second run finds no legacy rows and re-creates the same constraint.
--
-- ─── Rollback (verbatim) ────────────────────────────────────────────────────
-- do $$
-- declare c record;
-- begin
--   for c in
--     select con.conname from pg_constraint con
--     join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
--     where con.conrelid = 'public.customer_products'::regclass and con.contype = 'c' and att.attname = 'classification'
--   loop
--     execute format('alter table public.customer_products drop constraint %I', c.conname);
--   end loop;
-- end $$;
-- update public.customer_products set classification = 'Discrete Development' where classification = 'FlowForge';
-- update public.customer_products set classifications = array_replace(classifications, 'FlowForge', 'Discrete Development')
--   where 'FlowForge' = any (classifications);
-- do $$
-- begin
--   if to_regclass('public.stackshift_orders') is not null then
--     update public.stackshift_orders set mapped_classifications = array_replace(mapped_classifications, 'FlowForge', 'Discrete Development')
--       where 'FlowForge' = any (mapped_classifications);
--   end if;
-- end $$;
-- alter table public.customer_products add constraint customer_products_classification_check
--   check (classification in ('StackShift I', 'StackShift II', 'StackShift Access', 'StackShift Access Plus', 'PipelineForge', 'Discrete Development'));
-- ────────────────────────────────────────────────────────────────────────────

-- 1. Drop whatever CHECK constrains customer_products.classification. It is an inline column check
--    from migration 060 (auto-named customer_products_classification_check), but it is looked up
--    rather than assumed in case the live name differs.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_attribute att on att.attrelid = con.conrelid and att.attnum = any (con.conkey)
    where con.conrelid = 'public.customer_products'::regclass
      and con.contype = 'c'
      and att.attname = 'classification'
  loop
    execute format('alter table public.customer_products drop constraint %I', c.conname);
  end loop;
end $$;

-- 2. Rename stored values. Both columns: rows can hold the legacy scalar with a FlowForge array
--    (written through the pre-192 fallback), and array_replace leaves FlowForge entries alone.
update public.customer_products
  set classification = 'FlowForge'
  where classification = 'Discrete Development';

update public.customer_products
  set classifications = array_replace(classifications, 'Discrete Development', 'FlowForge')
  where 'Discrete Development' = any (classifications);

-- A row that held both values (legacy scalar backfilled into the array alongside a FlowForge entry)
-- would now carry FlowForge twice; collapse duplicates, keeping first-occurrence order.
update public.customer_products cp
  set classifications = (
    select array_agg(v order by first_pos)
    from (
      select v, min(pos) as first_pos
      from unnest(cp.classifications) with ordinality as t(v, pos)
      group by v
    ) d
  )
  where cardinality(classifications) > (select count(distinct v) from unnest(cp.classifications) as u(v));

-- stackshift_orders comes from migration 130, which may not be applied yet.
do $$
begin
  if to_regclass('public.stackshift_orders') is not null then
    update public.stackshift_orders
      set mapped_classifications = array_replace(mapped_classifications, 'Discrete Development', 'FlowForge')
      where 'Discrete Development' = any (mapped_classifications);
  end if;
end $$;

-- 3. Re-add the CHECK with FlowForge in place of Discrete Development.
alter table public.customer_products add constraint customer_products_classification_check
  check (classification in ('StackShift I', 'StackShift II', 'StackShift Access', 'StackShift Access Plus', 'PipelineForge', 'FlowForge'));
