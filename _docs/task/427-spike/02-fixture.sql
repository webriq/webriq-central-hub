-- Task 427 spike — fixture on the PRE-427 schema (old table names). Local disposable DB only.
-- Fixed UUIDs so later scripts can reference them.
insert into customers (customer_id, company_name) values ('WRQ-CLIENT-SPIKE', 'Spike Customer') on conflict do nothing;

-- one auth user per role; the on_auth_user_created trigger creates the profile (role 'client'), then we set the role
insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@spike.test',       'authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000a2', 'superadmin@spike.test',  'authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000a3', 'marketing@spike.test',   'authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000a4', 'pm@spike.test',          'authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000a5', 'developer@spike.test',   'authenticated','authenticated','00000000-0000-0000-0000-000000000000'),
  ('00000000-0000-0000-0000-0000000000a6', 'client@spike.test',      'authenticated','authenticated','00000000-0000-0000-0000-000000000000')
on conflict do nothing;
update profiles set role = 'admin'       where id = '00000000-0000-0000-0000-0000000000a1';
update profiles set role = 'super_admin' where id = '00000000-0000-0000-0000-0000000000a2';
update profiles set role = 'marketing'   where id = '00000000-0000-0000-0000-0000000000a3';
update profiles set role = 'pm'          where id = '00000000-0000-0000-0000-0000000000a4';
update profiles set role = 'developer'   where id = '00000000-0000-0000-0000-0000000000a5';
update profiles set role = 'client'      where id = '00000000-0000-0000-0000-0000000000a6';

insert into projects (id, customer_id, name, project_type) values
  ('00000000-0000-0000-0000-0000000000b1', 'WRQ-CLIENT-SPIKE', 'Programme-style project', 'Content Site'),
  ('00000000-0000-0000-0000-0000000000b2', 'WRQ-CLIENT-SPIKE', 'Manual / generic project', 'Content Site');

-- milestones: programme-prefixed (stale 'planned'), manual (null external_id), Zoho-style
insert into milestones (id, project_id, external_id, name, status, position, start_date, due_date, day_start, day_end) values
  ('00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000b1', 'programme-phase-00000000-0000-0000-0000-0000000000b1-2', 'Migrate & Rebrand', 'planned', 1, null, null, null, null),
  ('00000000-0000-0000-0000-0000000000c3', '00000000-0000-0000-0000-0000000000b1', 'programme-phase-00000000-0000-0000-0000-0000000000b1-3', 'Publish',            'planned', 2, null, null, null, null),
  ('00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000b2', null,                                                         'Manual phase',       'active',  0, '2026-09-23', '2026-10-14', null, null),
  ('00000000-0000-0000-0000-0000000000c5', '00000000-0000-0000-0000-0000000000b2', 'zoho-ms-777',                                                'Imported milestone', 'active',  1, null, null, 1, 30),
  ('00000000-0000-0000-0000-0000000000c6', '00000000-0000-0000-0000-0000000000b2', 'zoho-ms-778',                                                'Imported milestone 2','active', 2, null, null, 31, 60);  -- 2 active milestones in one project (real data has 130 such projects)

insert into tasklists (id, project_id, external_id, name, position, milestone_id, day_start, day_end) values
  ('00000000-0000-0000-0000-0000000000d1', '00000000-0000-0000-0000-0000000000b1', 'programme-deliverable-00000000-0000-0000-0000-0000000000b1-2-tech-docs', 'Tech docs', 0, '00000000-0000-0000-0000-0000000000c2', null, null),
  ('00000000-0000-0000-0000-0000000000d2', '00000000-0000-0000-0000-0000000000b2', null,        'Manual list',   0, '00000000-0000-0000-0000-0000000000c4', 5, 9),
  ('00000000-0000-0000-0000-0000000000d3', '00000000-0000-0000-0000-0000000000b2', 'zoho-tl-1', 'Imported list', 1, '00000000-0000-0000-0000-0000000000c5', null, null);

insert into tasks (id, project_id, title, milestone_id, tasklist_id) values
  ('00000000-0000-0000-0000-0000000000e1', '00000000-0000-0000-0000-0000000000b1', 'Task under programme list', '00000000-0000-0000-0000-0000000000c2', '00000000-0000-0000-0000-0000000000d1'),
  ('00000000-0000-0000-0000-0000000000e2', '00000000-0000-0000-0000-0000000000b2', 'Task under manual list',    '00000000-0000-0000-0000-0000000000c4', '00000000-0000-0000-0000-0000000000d2'),
  ('00000000-0000-0000-0000-0000000000e3', '00000000-0000-0000-0000-0000000000b2', 'Task with no phase/list',   null, null);
