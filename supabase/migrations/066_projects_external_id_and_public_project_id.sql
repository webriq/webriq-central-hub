-- Migration 066: projects.zoho_project_id -> external_project_id (task 142) — Zoho is
-- being decommissioned, so the reason task 117 kept this column's Zoho-specific name
-- (it was still live-synced, unlike import-only historical columns) no longer applies.
-- Also adds a new public-facing projects.project_id column (format
-- "<last 4 chars of customer_id>-PROJ-<4 random chars>", mirroring generate-id.ts's
-- WRQ-CUST-XXXX pattern), auto-populated by a trigger on insert so every existing
-- project-creation code path gets it for free, with a one-time backfill for rows that
-- already exist. The UUID `id` column is untouched and remains the routing key
-- everywhere — project_id is display-only.

alter table projects rename column zoho_project_id to external_project_id;

alter table projects add column if not exists project_id text;

create or replace function generate_project_id() returns trigger as $$
declare
  candidate text;
begin
  if new.project_id is not null then
    return new;
  end if;
  loop
    candidate := upper(right(new.customer_id, 4)) || '-PROJ-' ||
      upper(substr(md5(random()::text || clock_timestamp()::text), 1, 4));
    exit when not exists (select 1 from projects where project_id = candidate);
  end loop;
  new.project_id := candidate;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_generate_project_id on projects;
create trigger trg_generate_project_id
  before insert on projects
  for each row execute function generate_project_id();

-- One-time backfill for rows that already existed before this migration — the trigger
-- above only fires on INSERT, so pre-existing rows need their project_id filled in here.
do $$
declare
  r record;
  candidate text;
begin
  for r in select id, customer_id from projects where project_id is null loop
    loop
      candidate := upper(right(r.customer_id, 4)) || '-PROJ-' ||
        upper(substr(md5(random()::text || clock_timestamp()::text || r.id::text), 1, 4));
      exit when not exists (select 1 from projects where project_id = candidate);
    end loop;
    update projects set project_id = candidate where id = r.id;
  end loop;
end $$;

alter table projects add constraint projects_project_id_key unique (project_id);
