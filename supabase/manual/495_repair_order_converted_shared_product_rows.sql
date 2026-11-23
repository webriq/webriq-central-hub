-- Task 495 — give order-converted projects that share another project's customer_products row
-- their own row, carrying the classification the reviewer actually picked at convert time.
--
-- Before task 495, "Link existing customer" reused the customer's existing same-name product row,
-- so e.g. "Veteran Roofing & Exteriors App" (Discrete Development) sat on the website's
-- StackShift I row and showed on the StackShift I tab.
--
-- Operator:
--   1. Run the read-only detection query (task doc, Operator Step 1). Any order-converted project
--      with projects_on_row >= 2 is a candidate; decide its intended classifications from the
--      order's `services` + project_type ('Custom App' => Discrete Development).
--   2. Edit the `targets` list below (project NAME exactly as stored, intended classifications).
--   3. Run once. It aborts (whole transaction) if a target is missing, ambiguous, or no longer
--      shares its row, so a re-run after success is a no-op error, not a second copy.
--
-- Rollback (per project): update projects set customer_product_id = <old id from NOTICE>
--   where id = <project id>; then delete from customer_products where id = <new id from NOTICE>.

begin;

do $$
declare
  t record;
  proj record;
  v_variants constant text[] := array['StackShift I','StackShift II','StackShift Access','StackShift Access Plus'];
  v_primary text;
  v_product_name text;
  v_new_id uuid;
begin
  for t in
    select * from (values
      ('Veteran Roofing & Exteriors App', array['Discrete Development']::text[])
      -- , ('<project name>', array['<Classification>', ...]::text[])
    ) as v(project_name, classifications)
  loop
    select p.id, p.customer_id, p.customer_product_id
      into proj
      from public.projects p
     where p.name = t.project_name
       and p.id in (select project_id from public.stackshift_orders where status = 'converted');
    if not found then
      raise exception 'Task 495: order-converted project "%" not found', t.project_name;
    end if;
    -- `select into` keeps the first row silently; refuse duplicates explicitly.
    if (select count(*) from public.projects p
         where p.name = t.project_name
           and p.id in (select project_id from public.stackshift_orders where status = 'converted')) > 1 then
      raise exception 'Task 495: project name "%" is ambiguous', t.project_name;
    end if;

    if (select count(*) from public.projects where customer_product_id = proj.customer_product_id) < 2 then
      raise exception 'Task 495: "%" (%) no longer shares customer_products %, nothing to repair',
        t.project_name, proj.id, proj.customer_product_id;
    end if;

    -- Same rules as derivePrimaryClassification / deriveProductNamesMulti (customer-phases.ts).
    select c into v_primary from unnest(t.classifications) c where c = any(v_variants) limit 1;
    v_primary := coalesce(v_primary, t.classifications[1]);
    v_product_name := case
      when t.classifications && v_variants then 'StackShift'
      when 'PipelineForge' = any(t.classifications) then 'PipelineForge'
      else 'StackShift'
    end;

    insert into public.customer_products
      (customer_id, product_name, classification, classifications, status, onboarding_complete, onboarding_data)
    values
      (proj.customer_id, v_product_name, v_primary, t.classifications, 'active', false, '{}'::jsonb)
    returning id into v_new_id;

    update public.projects set customer_product_id = v_new_id where id = proj.id;

    raise notice 'Task 495: project % ("%"): customer_product_id % -> % (%)',
      proj.id, t.project_name, proj.customer_product_id, v_new_id, v_primary;
  end loop;
end $$;

commit;
