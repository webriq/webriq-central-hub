-- Migration 089 (task 189): Human-readable display_id for tasks and issues.
--
-- tasks.id / issues.id stay UUID primary keys — display_id is purely additive,
-- shown in UI text only (never wired into routing). Format:
--   <10-char project base>-T#### (task)
--   <10-char project base>-I#### (issue)
-- where the 10-char base is the owning project's project_id with the
-- "-PROJ-" separator stripped (e.g. BDD824C5-PROJ-01 -> BDD824C501), and the
-- 4-digit suffix is a per-project, per-type incremental sequence (tasks and
-- issues each get their own independent counter, starting at 0001).
--
-- Mirrors migration 088's generate_project_id() shape: pg_advisory_xact_lock
-- scoped per (project, type) so concurrent inserts don't race on the same
-- sequence number, and max(existing suffix)+1 (not count(*)+1) so a deleted
-- row's number is never reused.
--
-- issues.display_id is added for schema completeness only — no Issues
-- browsing UI exists yet (import-only table, see CLAUDE.md). issues.prefix
-- (Zoho's own imported "TC3-I1" format) is left untouched; this is a
-- separate column, not a reuse of that one (see task 189's Design Decision).

-- ─── columns ────────────────────────────────────────────────────────────────
alter table tasks add column if not exists display_id text;
alter table issues add column if not exists display_id text;

-- ─── tasks trigger ──────────────────────────────────────────────────────────
create or replace function generate_task_display_id() returns trigger as $$
declare
  proj_base text;
  next_seq int;
begin
  if new.display_id is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.project_id::text || ':task'));

  select replace(project_id, '-PROJ-', '') into proj_base
  from projects where id = new.project_id;

  select coalesce(max(substring(display_id from '-T(\d+)$')::int), 0) + 1
  into next_seq
  from tasks
  where project_id = new.project_id;

  new.display_id := proj_base || '-T' || lpad(next_seq::text, 4, '0');
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_generate_task_display_id on tasks;
create trigger trg_generate_task_display_id
  before insert on tasks
  for each row execute function generate_task_display_id();

-- ─── issues trigger ─────────────────────────────────────────────────────────
create or replace function generate_issue_display_id() returns trigger as $$
declare
  proj_base text;
  next_seq int;
begin
  if new.display_id is not null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext(new.project_id::text || ':issue'));

  select replace(project_id, '-PROJ-', '') into proj_base
  from projects where id = new.project_id;

  select coalesce(max(substring(display_id from '-I(\d+)$')::int), 0) + 1
  into next_seq
  from issues
  where project_id = new.project_id;

  new.display_id := proj_base || '-I' || lpad(next_seq::text, 4, '0');
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_generate_issue_display_id on issues;
create trigger trg_generate_issue_display_id
  before insert on issues
  for each row execute function generate_issue_display_id();

-- ─── backfill existing rows, numbered per project in created_at order ──────
do $$
declare
  proj record;
  t record;
  seq int;
  base text;
begin
  for proj in select id, project_id from projects loop
    base := replace(proj.project_id, '-PROJ-', '');

    seq := 0;
    for t in
      select id from tasks
      where project_id = proj.id and display_id is null
      order by created_at asc
    loop
      seq := seq + 1;
      update tasks set display_id = base || '-T' || lpad(seq::text, 4, '0') where id = t.id;
    end loop;

    seq := 0;
    for t in
      select id from issues
      where project_id = proj.id and display_id is null
      order by created_at asc
    loop
      seq := seq + 1;
      update issues set display_id = base || '-I' || lpad(seq::text, 4, '0') where id = t.id;
    end loop;
  end loop;
end $$;

-- ─── unique constraints, added after backfill ──────────────────────────────
alter table tasks add constraint tasks_display_id_key unique (display_id);
alter table issues add constraint issues_display_id_key unique (display_id);
