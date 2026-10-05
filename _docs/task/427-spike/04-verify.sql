-- Task 427 spike — verification of 03-expand-draft.sql on the fixture. LOCAL disposable DB only.
\set ON_ERROR_STOP off
\echo '== V1 data + links preserved'
select (select count(*) from project_phases) as phases, (select count(*) from project_deliverables) as deliverables, (select count(*) from tasks) as tasks,
       (select count(*) from tasks t join project_phases p on p.id = t.milestone_id) as tasks_with_phase,
       (select count(*) from tasks t join project_deliverables d on d.id = t.tasklist_id) as tasks_with_deliverable,
       (select count(*) from project_deliverables d join project_phases p on p.id = d.phase_id) as deliverables_with_phase;

\echo '== V2 source tagging (expected phases: programme 2 / manual 1 / zoho_import 2; deliverables: programme 1 / manual 1 / zoho_import 1)'
select 'phases' as t, source, count(*) from project_phases group by source union all select 'deliverables', source, count(*) from project_deliverables group by source order by 1,2;

\echo '== V3 upsert on external_id still works (the seeds'' conflict key)'
insert into project_phases (project_id, external_id, name, source) values ('00000000-0000-0000-0000-0000000000b1', 'programme-phase-00000000-0000-0000-0000-0000000000b1-2', 'RENAMED via upsert', 'programme')
  on conflict (external_id) do update set name = excluded.name returning id, name;
update project_phases set name = 'Migrate & Rebrand' where id = '00000000-0000-0000-0000-0000000000c2';

\echo '== V4 constraints: status widened; invalid rejected; one-active-programme per project; many active manual allowed'
begin;
  insert into project_phases (project_id, name, status) values ('00000000-0000-0000-0000-0000000000b2', 'skipped ok', 'skipped');
  insert into project_phases (project_id, name, status) values ('00000000-0000-0000-0000-0000000000b2', 'bypassed ok', 'bypassed');
rollback;
begin; insert into project_phases (project_id, name, status) values ('00000000-0000-0000-0000-0000000000b2', 'bad', 'nope'); rollback;
begin;
  update project_phases set status = 'active' where id = '00000000-0000-0000-0000-0000000000c2';
  update project_phases set status = 'active' where id = '00000000-0000-0000-0000-0000000000c3';   -- 2nd active programme phase in the same project → must FAIL
rollback;
select count(*) as active_manual_or_zoho_in_project_b2_still_allowed from project_phases where project_id = '00000000-0000-0000-0000-0000000000b2' and status = 'active';
begin; insert into project_phases (project_id, name, phase_number, source) values ('00000000-0000-0000-0000-0000000000b1', 'dup number', 2, 'programme'),('00000000-0000-0000-0000-0000000000b1', 'dup number again', 2, 'programme'); rollback;   -- unique (project, phase_number) → must FAIL

\echo '== V5 cascades: deleting a project removes its phases/deliverables/tasks'
begin;
  delete from projects where id = '00000000-0000-0000-0000-0000000000b1';
  select (select count(*) from project_phases where project_id = '00000000-0000-0000-0000-0000000000b1') as phases_left,
         (select count(*) from project_deliverables where project_id = '00000000-0000-0000-0000-0000000000b1') as deliverables_left,
         (select count(*) from tasks where project_id = '00000000-0000-0000-0000-0000000000b1') as tasks_left;
rollback;
begin;   -- deleting a phase leaves its tasks (set null) and deliverables (phase_id set null)
  delete from project_phases where id = '00000000-0000-0000-0000-0000000000c4';
  select (select count(*) from project_deliverables where id = '00000000-0000-0000-0000-0000000000d2' and phase_id is null) as deliverable_kept_phase_null,
         (select count(*) from tasks where id = '00000000-0000-0000-0000-0000000000e2' and milestone_id is null) as task_kept_milestone_null;
rollback;

\echo '== V6 compat views (superuser view): row visibility, column shape'
select (select count(*) from milestones) as milestones_view_rows, (select count(*) from tasklists) as tasklists_view_rows;
select column_name from information_schema.columns where table_schema='public' and table_name='tasklists' order by ordinal_position;
begin;   -- Phase 1 programme rows (+ their deliverables) must be hidden from the compat views
  insert into project_phases (id, project_id, name, phase_number, source) values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-0000000000b1', 'Onboard', 1, 'programme');
  insert into project_deliverables (project_id, phase_id, name, source) values ('00000000-0000-0000-0000-0000000000b1', '00000000-0000-0000-0000-0000000000c1', 'Kickoff', 'programme');
  select (select count(*) from milestones) as milestones_view_rows_with_phase1, (select count(*) from tasklists) as tasklists_view_rows_with_phase1_deliverable;
rollback;

\echo '== V7 compat view writes (legacy code path), as the PM user'
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000a4', 'role', 'authenticated')::text, false);
set role authenticated;
insert into milestones (project_id, name, status) values ('00000000-0000-0000-0000-0000000000b2', 'via view', 'planned') returning name, status;
update milestones set name = 'via view (edited)' where name = 'via view' returning name;
insert into tasklists (project_id, name, milestone_id) values ('00000000-0000-0000-0000-0000000000b2', 'list via view', (select id from milestones where name = 'via view (edited)')) returning name;
delete from tasklists where name = 'list via view';
delete from milestones where name = 'via view (edited)';
reset role;
\echo '   as the DEVELOPER (read-only) — insert through the view must be denied by RLS (proves security_invoker):'
select set_config('request.jwt.claims', json_build_object('sub', '00000000-0000-0000-0000-0000000000a5', 'role', 'authenticated')::text, false);
set role authenticated;
insert into milestones (project_id, name) values ('00000000-0000-0000-0000-0000000000b2', 'dev should not');
reset role;

\echo '== V8 RLS matrix (role × operation) — each attempt runs in a rolled-back subtransaction'
create or replace function pg_temp.attempt(p_email text, p_stmt text) returns text language plpgsql as $$
declare v_uid uuid; v_rows bigint; v_result text;
begin
  select id into v_uid from auth.users where email = p_email;
  begin
    begin
      execute 'set local role authenticated';
      perform set_config('request.jwt.claims', json_build_object('sub', v_uid, 'role', 'authenticated')::text, true);
      execute p_stmt;
      get diagnostics v_rows = row_count;
      v_result := case when v_rows > 0 then 'allowed' else 'denied' end;
    exception when insufficient_privilege then v_result := 'denied';
              when others then v_result := 'error: ' || sqlerrm;
    end;
    raise exception using errcode = 'P0001', message = 'ROLLBACK:' || v_result;
  exception when sqlstate 'P0001' then
    if sqlerrm like 'ROLLBACK:%' then v_result := substr(sqlerrm, 10); else raise; end if;
  end;
  return v_result;
end $$;

create temp table matrix (op text, sql text, allowed text[]);
insert into matrix values
 ('phases read',               'select 1 from project_phases',                                                                                            '{admin,superadmin,marketing,pm,developer}'),
 ('phases insert manual',      $q$insert into project_phases (project_id,name,source) values ('00000000-0000-0000-0000-0000000000b2','x','manual')$q$,       '{admin,superadmin,pm}'),
 ('phases insert programme',   $q$insert into project_phases (project_id,name,source,phase_number) values ('00000000-0000-0000-0000-0000000000b1','x','programme',9)$q$, '{admin,superadmin,marketing}'),
 ('phases update manual',      $q$update project_phases set name='y' where id='00000000-0000-0000-0000-0000000000c4'$q$,                                   '{admin,superadmin,pm}'),
 ('phases update programme',   $q$update project_phases set name='y' where id='00000000-0000-0000-0000-0000000000c2'$q$,                                   '{admin,superadmin,marketing}'),
 ('phases delete manual',      $q$delete from project_phases where id='00000000-0000-0000-0000-0000000000c4'$q$,                                           '{admin,superadmin,pm}'),
 ('phases delete programme',   $q$delete from project_phases where id='00000000-0000-0000-0000-0000000000c3'$q$,                                           '{admin,superadmin,marketing}'),
 ('phases escalate manual→programme', $q$update project_phases set source='programme' where id='00000000-0000-0000-0000-0000000000c4'$q$,                  '{admin,superadmin}'),
 ('phases demote programme→manual',   $q$update project_phases set source='manual' where id='00000000-0000-0000-0000-0000000000c2'$q$,                     '{admin,superadmin}'),
 ('deliverables read',         'select 1 from project_deliverables',                                                                                      '{admin,superadmin,marketing,pm,developer}'),
 ('deliverables insert manual',    $q$insert into project_deliverables (project_id,name,source) values ('00000000-0000-0000-0000-0000000000b2','x','manual')$q$,    '{admin,superadmin,pm}'),
 ('deliverables insert programme', $q$insert into project_deliverables (project_id,name,source) values ('00000000-0000-0000-0000-0000000000b1','x','programme')$q$, '{admin,superadmin,marketing}'),
 ('deliverables update manual',    $q$update project_deliverables set name='y' where id='00000000-0000-0000-0000-0000000000d2'$q$,                                '{admin,superadmin,pm}'),
 ('deliverables update programme', $q$update project_deliverables set name='y' where id='00000000-0000-0000-0000-0000000000d1'$q$,                                '{admin,superadmin,marketing}'),
 ('programme_state read',      'select 1 from phase_programme_state',                                                                                     '{admin,superadmin,marketing,pm,developer}'),
 ('programme_state insert',    $q$insert into phase_programme_state (phase_id) values ('00000000-0000-0000-0000-0000000000c2')$q$,                        '{admin,superadmin,marketing}');
-- seed one state row (as superuser) so 'read' returns a row for the roles that may read
insert into phase_programme_state (phase_id) values ('00000000-0000-0000-0000-0000000000c3');

create temp table results as
select m.op, r.role, pg_temp.attempt(r.role || '@spike.test', m.sql) as got, (r.role = any (m.allowed)) as expect_allowed
from matrix m cross join (values ('admin'),('superadmin'),('marketing'),('pm'),('developer'),('client')) as r(role);

\echo '   mismatches (expected vs got) — empty = every cell matches the design table:'
select op, role, case when expect_allowed then 'allowed' else 'denied' end as expected, got from results
 where got <> case when expect_allowed then 'allowed' else 'denied' end order by op, role;
select count(*) as cells, count(*) filter (where got = case when expect_allowed then 'allowed' else 'denied' end) as matching from results;
\echo '   full matrix (A = allowed, . = denied):'
select op, string_agg(case when got = 'allowed' then 'A' else '.' end, ' ' order by array_position(array['admin','superadmin','marketing','pm','developer','client'], role)) as "admin super mktg pm dev client" from results group by op order by op;
