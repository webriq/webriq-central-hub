// Task 486 — runs migration 183 (twice) on PGlite against a minimal schema and asserts backfill/trigger/guard behaviour.
// Not a project dependency: in an empty dir run `pnpm add @electric-sql/pglite@0.2.17`, copy this file there, then
// `node 486-general-default-tasklist.sql-check.mjs <repo>/supabase/migrations/183_general_default_tasklist.sql`.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const mig = readFileSync(process.argv[2], "utf8");
const db = new PGlite();
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
await db.exec(`
create role anon; create role authenticated; create role service_role;
create table projects (id uuid primary key);
create table project_phases (id uuid primary key default gen_random_uuid(), project_id uuid references projects(id) on delete cascade, source text not null default 'manual', phase_number int);
create table project_deliverables (id uuid primary key default gen_random_uuid(), project_id uuid not null references projects(id) on delete cascade,
  external_id text unique, name text not null, position numeric, is_default boolean default false, phase_id uuid references project_phases(id) on delete set null,
  status text not null default 'pending', source text not null default 'manual', created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table tasks (id uuid primary key default gen_random_uuid(), project_id uuid references projects(id) on delete cascade,
  tasklist_id uuid references project_deliverables(id) on delete set null, kind text, title text);
insert into projects values ('00000000-0000-0000-0000-000000000001'),('00000000-0000-0000-0000-000000000002'),('00000000-0000-0000-0000-000000000003'),('00000000-0000-0000-0000-000000000004'),('00000000-0000-0000-0000-000000000005');
-- P1: Zoho default "Main"
insert into project_deliverables (id, project_id, name, is_default, position, source) values ('10000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Main',true,5,'zoho_import');
insert into tasks (project_id, tasklist_id, kind, title) values
 ('00000000-0000-0000-0000-000000000001',null,'task','a'),('00000000-0000-0000-0000-000000000001',null,null,'b'),
 ('00000000-0000-0000-0000-000000000001',null,'checklist','cl'),('00000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','task','in main');
-- P2: existing " general " list, no default
insert into project_deliverables (id, project_id, name, position) values ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002',' general ',1);
insert into tasks (project_id, title) values ('00000000-0000-0000-0000-000000000002','c');
-- P4: programme deliverable named General must not be picked
insert into project_phases (id, project_id, source, phase_number) values ('40000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000004','programme',2);
insert into project_deliverables (id, project_id, name, source, phase_id) values ('40000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004','General','programme','40000000-0000-0000-0000-000000000009');
insert into tasks (project_id, title) values ('00000000-0000-0000-0000-000000000004','d');
-- P7: only General sits under a (Zoho) phase, like 7149F820-PROJ-01 → reused, no new list
insert into projects values ('00000000-0000-0000-0000-000000000007');
insert into project_phases (id, project_id, source) values ('70000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000007','zoho_import');
insert into project_deliverables (id, project_id, name, source, phase_id) values ('70000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000007','General','zoho_import','70000000-0000-0000-0000-000000000009');
insert into tasks (project_id, tasklist_id, title) values ('00000000-0000-0000-0000-000000000007','70000000-0000-0000-0000-000000000001','in g'),('00000000-0000-0000-0000-000000000007',null,'orphan');
-- P8: three Generals (two under a phase, one without; the oldest is default) → merged into the no-phase one
insert into projects values ('00000000-0000-0000-0000-000000000008');
insert into project_phases (id, project_id, source) values ('80000000-0000-0000-0000-000000000009','00000000-0000-0000-0000-000000000008','zoho_import');
insert into project_deliverables (id, project_id, name, source, phase_id, is_default, created_at) values
 ('80000000-0000-0000-0000-00000000000a','00000000-0000-0000-0000-000000000008','General','zoho_import','80000000-0000-0000-0000-000000000009',true,'2020-01-01'),
 ('80000000-0000-0000-0000-00000000000b','00000000-0000-0000-0000-000000000008','general','manual',null,false,'2021-01-01'),
 ('80000000-0000-0000-0000-00000000000c','00000000-0000-0000-0000-000000000008','General ','zoho_import','80000000-0000-0000-0000-000000000009',false,'2022-01-01');
insert into tasks (project_id, tasklist_id, kind, title) values
 ('00000000-0000-0000-0000-000000000008','80000000-0000-0000-0000-00000000000a','task','ta'),
 ('00000000-0000-0000-0000-000000000008','80000000-0000-0000-0000-00000000000b','task','tb'),
 ('00000000-0000-0000-0000-000000000008','80000000-0000-0000-0000-00000000000c','checklist','tc'),
 ('00000000-0000-0000-0000-000000000008',null,'task','t-null');
`);
const P = (n) => `00000000-0000-0000-0000-00000000000${n}`;
const gen = async (p) => q(`select * from project_deliverables where project_id=$1 and is_general_tasklist(name, source)`, [p]);
const before = await q(`select id, tasklist_id from tasks where tasklist_id is not null and project_id <> '00000000-0000-0000-0000-000000000008'`);

await db.exec(mig);
await db.exec(mig); // idempotent

// check 4
assert.equal((await one(`select count(*)::int n from tasks where tasklist_id is null and project_id is not null and kind is distinct from 'checklist'`)).n, 0);
// check 5: every project has General, exactly one
for (const n of [1,2,3,4,5,7,8]) assert.equal((await gen(P(n))).length, 1, `P${n} general count`);
// D1: P1 keeps Main as only default, General not default
assert.equal((await gen(P(1)))[0].is_default, false);
assert.equal((await one(`select is_default from project_deliverables where name='Main'`)).is_default, true);
assert.ok(Number((await gen(P(1)))[0].position) < 5, "General first");
// P2 reused existing list, flagged default
assert.equal((await gen(P(2)))[0].id, "20000000-0000-0000-0000-000000000001");
assert.equal((await gen(P(2)))[0].is_default, true);
// P3 created + default
assert.equal((await gen(P(3)))[0].is_default, true);
// P4 programme General untouched, new manual General
assert.notEqual((await gen(P(4)))[0].id, "40000000-0000-0000-0000-000000000001");
// P7: phase General reused, no new list, orphan moved in
assert.equal((await gen(P(7)))[0].id, "70000000-0000-0000-0000-000000000001");
assert.equal((await one(`select count(*)::int n from tasks where project_id=$1 and tasklist_id='70000000-0000-0000-0000-000000000001'`, [P(7)])).n, 2);
// P8: merged into no-phase keeper b; default carried over; a/c deleted; all 4 rows (checklist incl.) now in b
const g8 = (await gen(P(8)))[0];
assert.equal(g8.id, "80000000-0000-0000-0000-00000000000b");
assert.equal(g8.is_default, true);
assert.equal((await one(`select count(*)::int n from project_deliverables where project_id=$1`, [P(8)])).n, 1);
assert.equal((await one(`select count(*)::int n from tasks where project_id=$1 and tasklist_id=$2`, [P(8), g8.id])).n, 4);
// check 7/8 no regression
assert.equal((await one(`select tasklist_id from tasks where kind='checklist'`)).tasklist_id, null);
for (const r of before) assert.equal((await one(`select tasklist_id from tasks where id=$1`, [r.id])).tasklist_id, r.tasklist_id);

// trigger: insert with no list (check 10)
const g1 = (await gen(P(1)))[0].id;
assert.equal((await one(`insert into tasks (project_id, title) values ($1,'new') returning tasklist_id`, [P(1)])).tasklist_id, g1);
// explicit list kept (check 13 no-regression)
assert.equal((await one(`insert into tasks (project_id, tasklist_id, title) values ($1,'10000000-0000-0000-0000-000000000001','x') returning tasklist_id`, [P(1)])).tasklist_id, "10000000-0000-0000-0000-000000000001");
// checklist insert stays null
assert.equal((await one(`insert into tasks (project_id, kind, title) values ($1,'checklist','cl2') returning tasklist_id`, [P(1)])).tasklist_id, null);
// check 15: new project, lazy create
await q(`insert into projects values ('00000000-0000-0000-0000-000000000006')`);
const t6 = await one(`insert into tasks (project_id, title) values ($1,'first') returning tasklist_id`, [P(6)]);
assert.equal(t6.tasklist_id, (await gen(P(6)))[0].id);
// check 16: deleting a list moves its tasks to General
const tmp = await one(`insert into project_deliverables (project_id, name) values ($1,'Tmp') returning id`, [P(1)]);
const tt = await one(`insert into tasks (project_id, tasklist_id, title) values ($1,$2,'tmp') returning id`, [P(1), tmp.id]);
await q(`delete from project_deliverables where id=$1`, [tmp.id]);
assert.equal((await one(`select tasklist_id from tasks where id=$1`, [tt.id])).tasklist_id, g1);
// check 17: clearing
await q(`update tasks set tasklist_id = '10000000-0000-0000-0000-000000000001' where id=$1`, [tt.id]);
await q(`update tasks set tasklist_id = null where id=$1`, [tt.id]);
assert.equal((await one(`select tasklist_id from tasks where id=$1`, [tt.id])).tasklist_id, g1);
// moving to another project with null list → target General
await q(`update tasks set project_id=$2, tasklist_id=null where id=$1`, [tt.id, P(3)]);
assert.equal((await one(`select tasklist_id from tasks where id=$1`, [tt.id])).tasklist_id, (await gen(P(3)))[0].id);
// check 18: protect
await assert.rejects(q(`update project_deliverables set name='Misc' where id=$1`, [g1]), /cannot be renamed or deleted/);
await assert.rejects(q(`delete from project_deliverables where id=$1`, [g1]), /cannot be renamed or deleted/);
await q(`update project_deliverables set name='General' where id=$1`, [g1]); // case-fix rename allowed
// renaming other lists still allowed
await q(`update project_deliverables set name='Main 2' where name='Main'`);
// duplicate General can be deleted while another remains
const dup = await one(`insert into project_deliverables (project_id, name) values ($1,'General') returning id`, [P(1)]);
await q(`delete from project_deliverables where id=$1`, [dup.id]);
// moving General to another project allowed
await q(`update project_deliverables set project_id=$2 where id=$1`, [(await gen(P(5)))[0].id, P(6)]);
// check 19: delete a whole project with General + tasks
await q(`delete from projects where id=$1`, [P(1)]);
assert.equal((await one(`select count(*)::int n from project_deliverables where project_id=$1`, [P(1)])).n, 0);
assert.equal((await one(`select count(*)::int n from tasks where project_id=$1`, [P(1)])).n, 0);
await q(`delete from projects where id=$1`, [P(6)]); // project holding two Generals
console.log("ALL CHECKS PASS");
