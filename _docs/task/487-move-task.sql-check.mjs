// Task 487 — runs migration 184 on PGlite against a minimal schema and asserts move_task / comment counts / density.
// Not a project dependency: in an empty dir run `pnpm add @electric-sql/pglite@0.2.17`, copy this file there, then
// `node 487-move-task.sql-check.mjs <repo>/supabase/migrations/184_task_move_and_comment_counts.sql`.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const mig = readFileSync(process.argv[2], "utf8");
const db = new PGlite();
const q = async (s, p) => (await db.query(s, p)).rows;
const one = async (s, p) => (await q(s, p))[0];
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
await db.exec(`
create role anon; create role authenticated; create role service_role;
create table projects (id uuid primary key);
create table milestones (id uuid primary key, project_id uuid);
create table tasklists (id uuid primary key, project_id uuid, milestone_id uuid, position numeric);
create table tasks (id uuid primary key, project_id uuid, tasklist_id uuid, milestone_id uuid, parent_task_id uuid,
  depth int not null default 0, position numeric, created_at timestamptz not null default now(), updated_at timestamptz);
create table task_comments (id uuid primary key default gen_random_uuid(), task_id uuid);
create table user_preferences (user_id uuid primary key, projects_view text not null default 'list');
insert into projects values ('${id(1)}'), ('${id(2)}');
insert into milestones values ('${id(11)}', '${id(1)}'), ('${id(12)}', '${id(1)}');
insert into tasklists values ('${id(21)}', '${id(1)}', '${id(11)}', 1), ('${id(22)}', '${id(1)}', '${id(12)}', 2), ('${id(29)}', '${id(2)}', null, 1);
-- List A (phase 11): R1 > C1 > G1 ; R2 ; R3 (null position)
insert into tasks (id, project_id, tasklist_id, milestone_id, parent_task_id, depth, position) values
 ('${id(101)}', '${id(1)}', '${id(21)}', '${id(11)}', null, 0, 1),
 ('${id(102)}', '${id(1)}', '${id(21)}', '${id(11)}', '${id(101)}', 1, 1),
 ('${id(103)}', '${id(1)}', '${id(21)}', '${id(11)}', '${id(102)}', 2, 1),
 ('${id(104)}', '${id(1)}', '${id(21)}', '${id(11)}', null, 0, 2),
 ('${id(105)}', '${id(1)}', '${id(21)}', '${id(11)}', null, 0, null),
-- List B (phase 12): S1, S2
 ('${id(201)}', '${id(1)}', '${id(22)}', '${id(12)}', null, 0, 1),
 ('${id(202)}', '${id(1)}', '${id(22)}', '${id(12)}', null, 0, 2);
insert into task_comments (task_id) values ('${id(101)}'), ('${id(101)}'), ('${id(104)}');
`);
await db.exec(mig);
const move = (t, l, p, b, a) => q(`select id from move_task($1,$2,$3,$4,$5)`, [t, l, p, b, a]);
const row = (n) => one(`select * from tasks where id = $1`, [id(n)]);
const rejects = async (fn, re) => assert.rejects(fn, (e) => re.test(e.message));

// 1. Move R1 (with 2-level subtree) into list B between S1 and S2 → subtree follows, depths unchanged.
await move(id(101), id(22), null, id(201), id(202));
for (const n of [101, 102, 103]) {
  const r = await row(n);
  assert.equal(r.tasklist_id, id(22)); assert.equal(r.milestone_id, id(12));
}
assert.equal((await row(101)).depth, 0); assert.equal((await row(103)).depth, 2);
assert.equal(Number((await row(101)).position), 1.5);

// 2. Nest S2 under C1 (depth 1) → S2 depth 2, parent C1, appended after G1.
await move(id(202), id(22), id(102), id(103), null);
let s2 = await row(202);
assert.equal(s2.parent_task_id, id(102)); assert.equal(s2.depth, 2); assert.equal(Number(s2.position), 2);

// 3. Un-nest G1 to a root of list A, before R2 → depth 0, parent null.
await move(id(103), id(21), null, null, id(104));
const g1 = await row(103);
assert.equal(g1.parent_task_id, null); assert.equal(g1.depth, 0); assert.equal(g1.tasklist_id, id(21)); assert.equal(Number(g1.position), 1);

// 4. Cycle: R1 into its own child C1.
await rejects(() => move(id(101), id(22), id(102), null, null), /own subtask/);
// 5. Depth cap: build a chain of 5 under S1 then try to nest a 1-deep subtree at the bottom.
let parent = id(201);
for (let i = 0; i < 5; i++) {
  await q(`insert into tasks (id, project_id, tasklist_id, parent_task_id, depth, position) values ($1,$2,$3,$4,$5,1)`, [id(300 + i), id(1), id(22), parent, i + 1]);
  parent = id(300 + i);
}
await rejects(() => move(id(101), id(22), id(304), null, null), /depth limit/);
// 6. Cross-project list and parent in another list.
await rejects(() => move(id(104), id(29), null, null, null), /not in this project/);
await rejects(() => move(id(104), id(21), id(201), null, null), /different list/);
// 7. Null-position neighbour → slot renumbered, then placed between.
await move(id(104), id(21), null, id(105), null); // R3 has null position → renumber, R2 goes after it
const order = (await q(`select id from tasks where tasklist_id = $1 and parent_task_id is null order by position`, [id(21)])).map((r) => r.id);
assert.deepEqual(order, [id(103), id(105), id(104)]);
// 8. Unchanged rows outside the slot/subtree keep their values.
assert.equal(Number((await row(201)).position), 1);
// 9. Grants: service_role only.
assert.equal((await one(`select has_function_privilege('authenticated', 'move_task(uuid,uuid,uuid,uuid,uuid)', 'execute') ok`)).ok, false);
assert.equal((await one(`select has_function_privilege('service_role', 'move_task(uuid,uuid,uuid,uuid,uuid)', 'execute') ok`)).ok, true);
// 10. Comment counts.
const counts = Object.fromEntries((await q(`select task_id, comment_count::int n from project_task_comment_counts($1)`, [id(1)])).map((r) => [r.task_id, r.n]));
assert.deepEqual(counts, { [id(101)]: 2, [id(104)]: 1 });
// 11. Density column default + check.
await q(`insert into user_preferences (user_id) values ($1)`, [id(900)]);
assert.equal((await one(`select tasks_density from user_preferences`)).tasks_density, "comfortable");
await rejects(() => q(`update user_preferences set tasks_density = 'huge'`), /check/);
console.log("487 move_task SQL checks: PASS (11 groups)");
