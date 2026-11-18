// Task 486 quality gate — runs migration 183 on PGlite, then as role 'authenticated' (no deliverable insert, no project read):
// trigger still files the task under General, direct RPC is denied, guard still blocks deleting General. Same setup as the .sql-check.mjs file.
import { PGlite } from "@electric-sql/pglite"; import { readFileSync } from "node:fs"; import assert from "node:assert/strict";
const db = new PGlite(); const m = readFileSync(process.argv[2], "utf8");
await db.exec(`create role anon; create role authenticated; create role service_role; create table projects (id uuid primary key);
create table project_deliverables (id uuid primary key default gen_random_uuid(), project_id uuid not null references projects(id) on delete cascade, name text not null, position numeric, is_default boolean default false, phase_id uuid, source text not null default 'manual', created_at timestamptz not null default now());
create table tasks (id uuid primary key default gen_random_uuid(), project_id uuid references projects(id) on delete cascade, tasklist_id uuid references project_deliverables(id) on delete set null, kind text);
insert into projects values ('00000000-0000-0000-0000-000000000001');`);
await db.exec(m);
// caller may write tasks but NOT deliverables (stands in for developer RLS) and can't see projects
await db.exec(`insert into projects values ('00000000-0000-0000-0000-000000000002'); grant select, insert, update on tasks to authenticated; grant select on project_deliverables to authenticated;`);
await db.exec(`set role authenticated`);
const r = (await db.query(`insert into tasks (project_id) values ('00000000-0000-0000-0000-000000000002') returning tasklist_id`)).rows[0];
assert.ok(r.tasklist_id, "trigger created General without caller deliverable insert rights");
await assert.rejects(db.query(`select ensure_general_tasklist('00000000-0000-0000-0000-000000000001')`), /permission denied/);
await db.exec(`reset role; grant delete on project_deliverables to authenticated; set role authenticated`);
await assert.rejects(db.query(`delete from project_deliverables where project_id='00000000-0000-0000-0000-000000000002'`), /cannot be renamed or deleted/, "guard holds though caller can't read projects");
console.log("PRIV PASS");
