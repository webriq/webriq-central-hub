-- Rollback for migration 183 (task 486). Drops the triggers and functions only.
-- The backfill (incl. merged duplicate Generals) is NOT reverted: once tasks were moved into General there is no record of which ones had no list,
-- and the General lists themselves may now hold tasks created since. Delete them by hand if really needed.
begin;
drop trigger if exists tasks_default_general_tasklist on tasks;
drop trigger if exists project_deliverables_protect_general on project_deliverables;
drop function if exists tasks_default_general_tasklist();
drop function if exists project_deliverables_protect_general();
drop function if exists ensure_general_tasklist(uuid);
drop function if exists is_general_tasklist(text, text);
commit;
