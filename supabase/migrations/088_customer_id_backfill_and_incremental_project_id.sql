-- Migration 088 (task 187): Backfill legacy customer_id values to the current
-- 8-hex-char format, and switch projects.project_id from a random 4-char suffix
-- to an incremental per-customer sequence.
--
-- Part 1 — customer_id backfill. generateCustomerId() (src/lib/customers/generate-id.ts)
-- was hardened from a 4-char to an 8-char hex suffix in task 174/175's security sweep
-- (this ID is the sole guard on the public, unauthenticated onboarding endpoints — a
-- 4-char id is brute-forceable over HTTP). Every *new* customer already gets the 8-char
-- format; this migration backfills any row created before that hardening (still
-- WRQ-CUST-XXXX or the older pre-task-040 WRQ-CLIENT-XXXX) to WRQ-CUST-XXXXXXXX.
--
-- Every FK referencing customers(customer_id) is recreated with ON UPDATE CASCADE
-- (discovered dynamically from pg_constraint, not hardcoded, so nothing is missed and
-- each table's existing ON DELETE behavior is preserved) so the backfill UPDATE below
-- propagates automatically. This is a permanent schema change, not reverted after this
-- migration — customer_id is the cross-system universal key and should stay safe to
-- re-key in the future without another bespoke migration.
--
-- llm_invocation_logs.customer_id has no FK at all (deliberate — cost-attribution logs
-- must survive customer deletion), so it's remapped manually via the same mapping table.
--
-- Part 2 — projects.project_id format change. Migration 066's generate_project_id()
-- trigger produced "<last 4 chars of customer_id>-PROJ-<4 random hex chars>". This
-- rewrites it to "<last 8 chars of customer_id>-PROJ-<2-digit incremental sequence>"
-- (e.g. BDD824C5-PROJ-01, BDD824C5-PROJ-02, ...), sequence per customer in creation
-- order, and regenerates every existing project_id to match (run after Part 1 so it
-- reads each customer's new customer_id).
--
-- BREAKING: any already-shared onboarding link (customer_id in the URL) or
-- portfolio-tracker link (project_id in the URL — a documented routing-key exception,
-- see CLAUDE.md) built from a pre-migration id will stop resolving. Accepted per task
-- 187 — this is a one-time cutover, not a dual-read/dual-write migration.

-- ─── Part 1a: add ON UPDATE CASCADE to every FK referencing customers(customer_id) ──
do $$
declare
  fk record;
  del_clause text;
begin
  for fk in
    select con.conname, con.conrelid::regclass::text as table_name, con.confdeltype
    from pg_constraint con
    join pg_attribute att_local
      on att_local.attrelid = con.conrelid and att_local.attnum = con.conkey[1]
    join pg_attribute att_foreign
      on att_foreign.attrelid = con.confrelid and att_foreign.attnum = con.confkey[1]
    where con.contype = 'f'
      and con.confrelid = 'customers'::regclass
      and array_length(con.conkey, 1) = 1
      and att_local.attname = 'customer_id'
      and att_foreign.attname = 'customer_id'
  loop
    del_clause := case fk.confdeltype
      when 'c' then 'cascade'
      when 'n' then 'set null'
      when 'r' then 'restrict'
      when 'd' then 'set default'
      else 'no action'
    end;

    execute format('alter table %s drop constraint %I', fk.table_name, fk.conname);
    execute format(
      'alter table %s add constraint %I foreign key (customer_id) references customers (customer_id) on delete %s on update cascade',
      fk.table_name, fk.conname, del_clause
    );
  end loop;
end $$;

-- ─── Part 1b: generate the old->new mapping for non-conforming customer_id values ──
create temporary table customer_id_migration_map (
  old_id text primary key,
  new_id text not null unique
);

do $$
declare
  r record;
  candidate text;
begin
  for r in
    select customer_id from customers
    where customer_id !~ '^WRQ-CUST-[0-9A-F]{8}$'
  loop
    loop
      candidate := 'WRQ-CUST-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
      exit when not exists (select 1 from customers where customer_id = candidate)
            and not exists (select 1 from customer_id_migration_map where new_id = candidate);
    end loop;
    insert into customer_id_migration_map (old_id, new_id) values (r.customer_id, candidate);
  end loop;
end $$;

-- ─── Part 1c: apply the remap — cascades to every FK'd table via Part 1a ───────────
update customers c
set customer_id = m.new_id
from customer_id_migration_map m
where c.customer_id = m.old_id;

-- Not FK'd (llm_invocation_logs.customer_id has no constraint) — update manually.
update llm_invocation_logs l
set customer_id = m.new_id
from customer_id_migration_map m
where l.customer_id = m.old_id;

-- ─── Part 2a: rewrite the project_id trigger function ─────────────────────────────
create or replace function generate_project_id() returns trigger as $$
declare
  next_seq int;
begin
  if new.project_id is not null then
    return new;
  end if;

  -- Serialize per-customer so concurrent inserts for the same customer don't race on
  -- the same sequence number. Auto-released at transaction end.
  perform pg_advisory_xact_lock(hashtext(new.customer_id));

  select coalesce(max(substring(project_id from '-PROJ-(\d+)$')::int), 0) + 1
  into next_seq
  from projects
  where customer_id = new.customer_id;

  new.project_id := upper(right(new.customer_id, 8)) || '-PROJ-' || lpad(next_seq::text, 2, '0');
  return new;
end;
$$ language plpgsql;

-- Trigger wiring is unchanged from migration 066 (still BEFORE INSERT); no-op if present.
drop trigger if exists trg_generate_project_id on projects;
create trigger trg_generate_project_id
  before insert on projects
  for each row execute function generate_project_id();

-- ─── Part 2b: regenerate every existing project_id, numbered per customer in ──────
-- ─── creation order, using each customer's now-updated customer_id ────────────────
alter table projects drop constraint if exists projects_project_id_key;

do $$
declare
  cust record;
  proj record;
  seq int;
begin
  for cust in select distinct customer_id from projects loop
    seq := 0;
    for proj in
      select id from projects where customer_id = cust.customer_id order by created_at asc
    loop
      seq := seq + 1;
      update projects
      set project_id = upper(right(cust.customer_id, 8)) || '-PROJ-' || lpad(seq::text, 2, '0')
      where id = proj.id;
    end loop;
  end loop;
end $$;

alter table projects add constraint projects_project_id_key unique (project_id);
