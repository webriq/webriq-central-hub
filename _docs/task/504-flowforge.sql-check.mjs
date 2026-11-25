// Task 504 — runs migrations 192 (FlowForge rename) and 193 (stackshift_orders PM read) on PGlite.
// Not a project dependency: in an empty dir run `pnpm add @electric-sql/pglite@0.2.17`, copy this file there, then
// `node 504-flowforge.sql-check.mjs <repo>/supabase/migrations/192_flowforge_classification.sql <repo>/supabase/migrations/193_stackshift_orders_pm_read.sql`.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const m192 = readFileSync(process.argv[2], "utf8");
const m193 = readFileSync(process.argv[3], "utf8");

// The verbatim rollback is the commented block between the "Rollback" header and the next rule line.
function rollbackOf(sql) {
  const lines = sql.split("\n");
  const start = lines.findIndex((l) => l.includes("Rollback (verbatim"));
  const end = lines.findIndex((l, i) => i > start && /^-- ─{10,}/.test(l));
  return lines.slice(start + 1, end).map((l) => l.replace(/^-- ?/, "")).join("\n");
}

const OLD_CHECK = `check (classification in ('StackShift I', 'StackShift II', 'StackShift Access', 'StackShift Access Plus', 'PipelineForge', 'Discrete Development'))`;

async function freshDb({ withOrders }) {
  const db = new PGlite();
  await db.exec(`
    create role authenticated;
    create function get_my_role() returns text language sql stable as $$ select 'pm'::text $$;
    create table customer_products (
      id serial primary key,
      classification text ${OLD_CHECK},
      classifications text[] not null default '{}'
    );
    insert into customer_products (classification, classifications) values
      ('Discrete Development', '{"Discrete Development"}'),          -- 1 legacy, both columns
      ('StackShift I', '{"StackShift I","Discrete Development"}'),   -- 2 legacy in array only
      ('Discrete Development', '{"FlowForge"}'),                     -- 3 pre-192 fallback write shape
      ('Discrete Development', '{"Discrete Development","FlowForge"}'), -- 4 both → must dedupe
      ('PipelineForge', '{}'),                                       -- 5 pre-task-157 shape, untouched
      (null, '{}');                                                  -- 6 unclassified
  `);
  if (withOrders) {
    await db.exec(`
      create table stackshift_orders (id serial primary key, mapped_classifications text[] not null default '{}');
      alter table stackshift_orders enable row level security;
      create policy "stackshift_orders_staff_read" on stackshift_orders for select to authenticated
        using (get_my_role() in ('admin', 'super_admin', 'marketing'));
      insert into stackshift_orders (mapped_classifications) values ('{"StackShift II","Discrete Development"}'), ('{"PipelineForge"}');
    `);
  }
  return db;
}

const rows = async (db, sql) => (await db.query(sql)).rows;
const products = (db) => rows(db, `select id, classification, classifications from customer_products order by id`);
const checkDef = async (db) =>
  (await rows(db, `select pg_get_constraintdef(oid) d from pg_constraint where conrelid='customer_products'::regclass and contype='c'`)).map((r) => r.d);
const policyQual = async (db) =>
  (await rows(db, `select qual from pg_policies where tablename='stackshift_orders' and policyname='stackshift_orders_staff_read'`))[0]?.qual;

const EXPECTED = [
  { id: 1, classification: "FlowForge", classifications: ["FlowForge"] },
  { id: 2, classification: "StackShift I", classifications: ["StackShift I", "FlowForge"] },
  { id: 3, classification: "FlowForge", classifications: ["FlowForge"] },
  { id: 4, classification: "FlowForge", classifications: ["FlowForge"] },
  { id: 5, classification: "PipelineForge", classifications: [] },
  { id: 6, classification: null, classifications: [] },
];

// ── 192 with stackshift_orders present ──
{
  const db = await freshDb({ withOrders: true });
  // Pre-192: the new value is rejected by the old CHECK with 23514 naming the constraint (what the app's fallback keys on).
  await assert.rejects(
    db.query(`insert into customer_products (classification) values ('FlowForge')`),
    (e) => e.code === "23514" && /customer_products_classification_check/.test(e.message),
    "pre-192 FlowForge insert → 23514 on customer_products_classification_check"
  );

  await db.exec(m192);
  assert.deepEqual(await products(db), EXPECTED, "192 renames + dedupes");
  assert.deepEqual(
    (await rows(db, `select mapped_classifications m from stackshift_orders order by id`)).map((r) => r.m),
    [["StackShift II", "FlowForge"], ["PipelineForge"]],
    "192 renames stackshift_orders.mapped_classifications"
  );
  const defs = await checkDef(db);
  assert.equal(defs.length, 1, "exactly one classification CHECK");
  assert.ok(defs[0].includes("FlowForge") && !defs[0].includes("Discrete Development"), "CHECK swapped");
  await db.query(`insert into customer_products (classification) values ('FlowForge')`);
  await assert.rejects(db.query(`insert into customer_products (classification) values ('Discrete Development')`), /check constraint/, "legacy value now rejected");
  await db.query(`delete from customer_products where id > 6`);

  // Idempotent
  await db.exec(m192);
  assert.deepEqual(await products(db), EXPECTED, "192 second run is a no-op");
  assert.equal((await checkDef(db)).length, 1, "still one CHECK after rerun");

  // Rollback
  await db.exec(rollbackOf(m192));
  const back = await products(db);
  assert.equal(back[0].classification, "Discrete Development", "rollback restores scalar");
  assert.deepEqual(back[1].classifications, ["StackShift I", "Discrete Development"], "rollback restores array");
  assert.ok((await checkDef(db))[0].includes("Discrete Development"), "rollback restores old CHECK");
  assert.deepEqual(
    (await rows(db, `select mapped_classifications m from stackshift_orders order by id`))[0].m,
    ["StackShift II", "Discrete Development"],
    "rollback restores orders"
  );

  // ── 193 ──
  assert.ok(!(await policyQual(db)).includes("pm"), "pre-193 policy excludes pm");
  await db.exec(m193);
  assert.ok((await policyQual(db)).includes("'pm'"), "193 adds pm");
  assert.ok((await policyQual(db)).includes("'marketing'"), "193 keeps marketing");
  await db.exec(m193);
  assert.equal((await rows(db, `select count(*)::int n from pg_policies where tablename='stackshift_orders'`))[0].n, 1, "193 idempotent");
  await db.exec(rollbackOf(m193));
  assert.ok(!(await policyQual(db)).includes("'pm'"), "193 rollback restores 140 policy");
  console.log("with stackshift_orders: PASS");
}

// ── 192 + 193 without stackshift_orders (migration 130 not applied) ──
{
  const db = await freshDb({ withOrders: false });
  await db.exec(m192);
  assert.deepEqual(await products(db), EXPECTED, "192 works without stackshift_orders");
  await db.exec(m193); // must not throw
  console.log("without stackshift_orders: PASS");
}

console.log("504 SQL checks: PASS");
