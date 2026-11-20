// Task 492 — runs migration 187 (+ its manual rollback) on PGlite against a minimal tasks/tickets schema carrying the
// live policy set (026/048/092/111/132→147/163, optionally 181) and asserts, for every role:
//   * the rows it can SELECT, UPDATE and DELETE on tasks and tickets are identical before and after 187 (and after rollback);
//   * 187 rewrites every policy, is idempotent, skips a policy edited elsewhere, applies with and without 181;
//   * the plan uses InitPlans (once-per-statement) instead of per-row helper calls.
// Not a project dependency: in an empty dir run `pnpm add @electric-sql/pglite@0.2.17`, copy this file there, then
// `node 492-rls-initplan.sql-check.mjs <repo>/supabase/migrations/187_tasks_tickets_rls_initplan.sql <repo>/supabase/manual/187_rollback_tasks_tickets_rls_initplan.sql`.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const mig = readFileSync(process.argv[2], "utf8");
const rollback = readFileSync(process.argv[3], "utf8");

const P_NORMAL = "00000000-0000-0000-0000-0000000000a1";
const P_TEST = "00000000-0000-0000-0000-0000000000a2";
const U = {
  admin: "00000000-0000-0000-0000-000000000001",
  super_admin: "00000000-0000-0000-0000-000000000002",
  pm: "00000000-0000-0000-0000-000000000003",
  developer: "00000000-0000-0000-0000-000000000004",
  client: "00000000-0000-0000-0000-000000000005",
  marketing: "00000000-0000-0000-0000-000000000006",
  test_pm: "00000000-0000-0000-0000-000000000007",
  test_dev: "00000000-0000-0000-0000-000000000008",
};

const BASE = `
create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('app.uid', true), '')::uuid $$;
create role authenticated; create role anon;
grant usage on schema auth to authenticated;

create table profiles (id uuid primary key, role text not null, is_test_user boolean not null default false);
create table projects (id uuid primary key, name text);
create table tasks (id serial primary key, project_id uuid, kind text not null default 'task', created_by uuid,
  assignees uuid[], created_at timestamptz not null default now());
create table tickets (id serial primary key, project_id uuid not null, created_by uuid, assignees uuid[], assignee_id uuid,
  created_at timestamptz not null default now());

create or replace function public.get_my_role() returns text language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() $$;

alter table tasks enable row level security;
alter table tickets enable row level security;
grant select, insert, update, delete on tasks, tickets to authenticated;
grant usage on all sequences in schema public to authenticated;

-- 048 / 092 / 111 / 163 (tasks)
create policy "tasks_staff_read" on tasks for select to authenticated using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));
create policy "tasks_pm_write" on tasks for all to authenticated using (get_my_role() in ('admin', 'super_admin', 'pm')) with check (get_my_role() in ('admin', 'super_admin', 'pm'));
create policy "tasks_developer_insert" on tasks for insert to authenticated with check (get_my_role() = 'developer' and created_by = auth.uid());
create policy "tasks_developer_update" on tasks for update to authenticated using (get_my_role() = 'developer' and (created_by = auth.uid() or auth.uid() = any(assignees))) with check (get_my_role() = 'developer');
create policy "tasks_developer_delete" on tasks for delete to authenticated using (get_my_role() = 'developer' and created_by = auth.uid());
create policy tasks_checklist_write_insert on tasks as restrictive for insert to authenticated with check (kind <> 'checklist' or get_my_role() in ('admin', 'super_admin', 'marketing'));
create policy tasks_checklist_write_update on tasks as restrictive for update to authenticated using (kind <> 'checklist' or get_my_role() in ('admin', 'super_admin', 'marketing')) with check (kind <> 'checklist' or get_my_role() in ('admin', 'super_admin', 'marketing'));
create policy tasks_checklist_write_delete on tasks as restrictive for delete to authenticated using (kind <> 'checklist' or get_my_role() in ('admin', 'super_admin', 'marketing'));
create policy tasks_checklist_marketing_read on tasks for select to authenticated using (kind = 'checklist' and get_my_role() = 'marketing');
create policy tasks_checklist_marketing_write on tasks for all to authenticated using (kind = 'checklist' and get_my_role() = 'marketing') with check (kind = 'checklist' and get_my_role() = 'marketing');

-- 051 / 111 / 132, as renamed by 147 (tickets = former issues)
create policy "tickets_staff_read" on tickets for select to authenticated using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));
create policy "tickets_pm_write" on tickets for all to authenticated using (get_my_role() in ('admin', 'super_admin', 'pm')) with check (get_my_role() in ('admin', 'super_admin', 'pm'));
create policy "tickets_developer_delete" on tickets for delete to authenticated using (get_my_role() = 'developer' and created_by = auth.uid());
create policy "tickets_developer_update" on tickets for update to authenticated using (get_my_role() = 'developer' and (created_by = auth.uid() or auth.uid() = any(assignees))) with check (get_my_role() = 'developer');
`;

// The 181 pieces this migration interacts with, verbatim from 181.
const M181 = `
alter table profiles add column if not exists is_test_user boolean not null default false;
alter table projects add column if not exists is_test boolean not null default false;
create or replace function public.get_my_is_test_user() returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select is_test_user from public.profiles where id = auth.uid()), false) $$;
create or replace function public.is_test_project(p_project_id uuid) returns boolean language sql stable security definer set search_path = public
as $$ select coalesce((select is_test from public.projects where id = p_project_id), false) $$;
create policy tasks_test_hidden on tasks as restrictive for select to authenticated
  using (project_id is null or get_my_is_test_user() or not is_test_project(project_id));
create policy tickets_test_hidden on tickets as restrictive for select to authenticated
  using (get_my_is_test_user() or not is_test_project(project_id));
create policy tasks_test_user_all on tasks for all to authenticated
  using (get_my_is_test_user() and is_test_project(project_id))
  with check (get_my_is_test_user() and is_test_project(project_id));
create policy tickets_test_user_all on tickets for all to authenticated
  using (get_my_is_test_user() and is_test_project(project_id))
  with check (get_my_is_test_user() and is_test_project(project_id));
`;

async function seed(db, with181) {
  const isTest = (role) => role.startsWith("test_");
  for (const [name, id] of Object.entries(U)) {
    const role = name === "test_pm" ? "pm" : name === "test_dev" ? "developer" : name;
    await db.query(`insert into profiles (id, role${with181 ? ", is_test_user" : ""}) values ($1, $2${with181 ? ", $3" : ""})`,
      with181 ? [id, role, isTest(name)] : [id, role]);
  }
  await db.query(`insert into projects (id, name${with181 ? ", is_test" : ""}) values ($1, 'normal'${with181 ? ", false" : ""}), ($2, 'test'${with181 ? ", true" : ""})`, [P_NORMAL, P_TEST]);
  const t = (project, kind, createdBy, assignees) =>
    db.query(`insert into tasks (project_id, kind, created_by, assignees) values ($1, $2, $3, $4)`, [project, kind, createdBy, assignees]);
  await t(P_NORMAL, "task", U.pm, [U.developer]);
  await t(P_NORMAL, "task", U.developer, null);
  await t(P_NORMAL, "task", U.pm, []);
  await t(P_NORMAL, "checklist", U.marketing, null);
  await t(P_TEST, "task", U.test_pm, [U.test_dev]);
  await t(P_TEST, "task", U.test_dev, null);
  await t(P_TEST, "checklist", U.admin, null);
  await t(null, "task", U.pm, [U.developer]);
  const k = (project, createdBy, assignees, assigneeId) =>
    db.query(`insert into tickets (project_id, created_by, assignees, assignee_id) values ($1, $2, $3, $4)`, [project, createdBy, assignees, assigneeId]);
  await k(P_NORMAL, U.pm, [U.developer], U.developer);
  await k(P_NORMAL, U.developer, null, null);
  await k(P_TEST, U.test_pm, [U.test_dev], U.test_dev);
  await k(P_TEST, U.test_dev, null, null);
}

// Per user: the ids it can SELECT / UPDATE / DELETE in each table (writes inside a rolled-back transaction).
async function snapshot(db) {
  const out = {};
  for (const [name, id] of Object.entries(U)) {
    for (const table of ["tasks", "tickets"]) {
      await db.exec("begin");
      await db.query(`select set_config('app.uid', $1, true)`, [id]);
      await db.exec("set local role authenticated");
      const ids = async (sql) => (await db.query(sql)).rows.map((r) => r.id).sort((a, b) => a - b).join(",");
      const sel = await ids(`select id from ${table}`);
      const upd = await ids(`update ${table} set created_at = created_at returning id`);
      const del = await ids(`delete from ${table} returning id`);
      await db.exec("rollback");
      out[`${name}.${table}`] = { sel, upd, del };
    }
  }
  return out;
}

const policies = async (db) =>
  (await db.query(`select tablename, policyname, cmd, permissive, roles::text, qual, with_check from pg_policies
                   where tablename in ('tasks','tickets') order by 1, 2`)).rows;

async function scenario(with181) {
  const label = with181 ? "with 181" : "without 181";
  const db = new PGlite();
  await db.exec(BASE);
  if (with181) await db.exec(M181);
  await seed(db, with181);

  const before = await snapshot(db);
  const originalPolicies = await policies(db);
  // Sanity: the fixture actually exercises the rules (otherwise "unchanged" proves nothing).
  assert.equal(before["client.tasks"].sel, "", `${label}: client sees no tasks`);
  assert.equal(before["marketing.tasks"].sel, "4" + (with181 ? "" : ",7"), `${label}: marketing sees checklist rows only`);
  if (with181) {
    assert.ok(!before["admin.tasks"].sel.split(",").includes("5"), "admin never sees test tasks");
    assert.ok(before["test_pm.tasks"].sel.split(",").includes("5"), "test user sees test tasks");
  }

  await db.exec(mig);
  const after = await policies(db);
  const notRewritten = after.filter((p) => /get_my_role\(\)|get_my_is_test_user\(\)|is_test_project\(/.test(
    `${p.qual ?? ""} ${p.with_check ?? ""}`.replace(/\(\s*SELECT [a-z_]+\(\)[^)]*\)/gi, "")));
  assert.deepEqual(notRewritten.map((p) => p.policyname), [], `${label}: every helper call wrapped`);
  assert.equal(after.length, originalPolicies.length, `${label}: same policy count`);
  for (let i = 0; i < after.length; i++) {
    const [a, o] = [after[i], originalPolicies[i]];
    assert.deepEqual([a.policyname, a.cmd, a.permissive, a.roles], [o.policyname, o.cmd, o.permissive, o.roles], `${label}: ${o.policyname} shape kept`);
  }
  assert.deepEqual(await snapshot(db), before, `${label}: access unchanged after 187`);
  console.log(`PASS ${label}: all ${after.length} policies rewritten, per-role select/update/delete unchanged`);

  await db.exec(mig);
  assert.deepEqual(await policies(db), after, `${label}: idempotent`);
  console.log(`PASS ${label}: idempotent re-run`);

  const plan = (await (async () => {
    await db.exec("begin");
    await db.query(`select set_config('app.uid', $1, true)`, [U.pm]);
    await db.exec("set local role authenticated");
    const r = await db.query(`explain select id from tasks where kind = 'task' order by created_at desc limit 20`);
    await db.exec("rollback");
    return r.rows.map((x) => x["QUERY PLAN"]).join("\n");
  })());
  assert.match(plan, /InitPlan/, `${label}: helper calls are InitPlans`);
  assert.doesNotMatch(plan, /SubPlan/, `${label}: no per-row subplans`);
  console.log(`PASS ${label}: plan uses InitPlans, no SubPlans`);

  await db.exec(rollback);
  const restored = await policies(db);
  assert.deepEqual(restored, originalPolicies, `${label}: rollback restores the exact original expressions`);
  assert.deepEqual(await snapshot(db), before, `${label}: access unchanged after rollback`);
  const leftovers = (await db.query(`select count(*)::int n from pg_proc where proname = 'my_test_project_ids'`)).rows[0].n
    + (await db.query(`select count(*)::int n from pg_indexes where indexname in ('tasks_created_at_idx','tickets_created_at_idx')`)).rows[0].n;
  assert.equal(leftovers, 0, `${label}: rollback drops helper + indexes`);
  console.log(`PASS ${label}: rollback exact`);
  await db.close();
}

await scenario(false);
await scenario(true);

// A policy edited outside migrations is left untouched; the rest still get rewritten.
{
  const db = new PGlite();
  await db.exec(BASE + M181);
  const custom = "get_my_role() in ('admin', 'pm')";
  await db.exec(`alter policy tasks_staff_read on tasks using (${custom})`);
  const edited = (await db.query(`select qual from pg_policies where policyname = 'tasks_staff_read'`)).rows[0].qual;
  await db.exec(mig);
  const rows = (await db.query(`select policyname, qual from pg_policies where tablename = 'tasks'`)).rows;
  assert.equal(rows.find((r) => r.policyname === "tasks_staff_read").qual, edited, "edited policy skipped");
  assert.match(rows.find((r) => r.policyname === "tasks_pm_write").qual, /SELECT get_my_role\(\)/i, "others still rewritten");
  console.log("PASS edited-elsewhere policy skipped, others rewritten");
  await db.close();
}

console.log("492 RLS InitPlan checks: all passed");
