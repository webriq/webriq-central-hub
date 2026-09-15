-- Migration 138: Ticket display_id marker (task 364)
-- Renames the "Issue" concept to "Ticket" at the application layer everywhere (see task 364's
-- doc) — the `issues` table itself keeps its name (migration 137's comment already explains why:
-- `tickets` is taken by the Desk email table). The one DB-visible change this rename needs is the
-- generated `display_id` marker: today it's `-I####` (migration 089), which reads as "Issue."
-- `tasks.display_id` already uses `-T####` in the same project, so simply switching to `-T####`
-- here would make a Task and a renamed Ticket display-ID-identical within one project — hence
-- the distinct `-TKT####` marker.
--
-- `issues.prefix` (Zoho's own imported issue-ID format, e.g. "TC3-I1") is a different column,
-- untouched by this migration — see CLAUDE.md / task 364's Out of Scope.

-- ─── replace the issues trigger function, `-I####` → `-TKT####` ────────────────────────────────
create or replace function generate_ticket_display_id() returns trigger as $$
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

  select coalesce(max(substring(display_id from '-TKT(\d+)$')::int), 0) + 1
  into next_seq
  from issues
  where project_id = new.project_id;

  new.display_id := proj_base || '-TKT' || lpad(next_seq::text, 4, '0');
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_generate_issue_display_id on issues;
create trigger trg_generate_ticket_display_id
  before insert on issues
  for each row execute function generate_ticket_display_id();

-- Old function is now unreferenced by any trigger — drop it (matches the "no more Issue
-- anywhere" naming sweep this task is doing).
drop function if exists generate_issue_display_id() cascade;

-- ─── backfill existing rows: same numeric suffix, new marker ───────────────────────────────────
update issues
set display_id = regexp_replace(display_id, '-I(\d+)$', '-TKT\1')
where display_id ~ '-I\d+$';

comment on function generate_ticket_display_id() is 'Generates issues.display_id as <project base>-TKT#### (task 364, replacing the -I#### marker from migration 089 — "Issue" was renamed to "Ticket" everywhere at the application layer, and -T#### was already taken by tasks.display_id in the same project).';
