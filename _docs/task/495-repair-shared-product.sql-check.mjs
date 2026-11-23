// Task 495 — runs supabase/manual/495_repair_order_converted_shared_product_rows.sql on PGlite and asserts:
//   * the order-converted App project gets its own row (Discrete Development, product_name StackShift);
//   * the website project keeps the original StackShift I row, unchanged;
//   * a re-run aborts (no longer shared) and writes nothing.
// Not a project dependency: in an empty dir run `pnpm add @electric-sql/pglite@0.2.17`, copy this file there, then
// `node 495-repair-shared-product.sql-check.mjs <repo>/supabase/manual/495_repair_order_converted_shared_product_rows.sql`.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const script = readFileSync(process.argv[2], "utf8");
const db = new PGlite();
await db.exec(`
  create table customer_products (
    id uuid primary key default gen_random_uuid(), customer_id text not null, product_name text not null,
    classification text, classifications text[] not null default '{}', status text,
    onboarding_complete boolean not null default false, onboarding_data jsonb not null default '{}');
  create table projects (id uuid primary key default gen_random_uuid(), name text, customer_id text,
    customer_product_id uuid references customer_products(id));
  create table stackshift_orders (id serial primary key, status text, project_id uuid references projects(id));
  insert into customer_products (id, customer_id, product_name, classification, classifications, status, onboarding_data)
    values ('00000000-0000-0000-0000-0000000000a1', 'WRQ-CLIENT-0006', 'StackShift', 'StackShift I', '{StackShift I}', 'active', '{"x":1}');
  insert into projects (id, name, customer_id, customer_product_id) values
    ('00000000-0000-0000-0000-0000000000b1', 'Veteran Roofing & Exteriors Website', 'WRQ-CLIENT-0006', '00000000-0000-0000-0000-0000000000a1'),
    ('00000000-0000-0000-0000-0000000000b2', 'Veteran Roofing & Exteriors App', 'WRQ-CLIENT-0006', '00000000-0000-0000-0000-0000000000a1');
  insert into stackshift_orders (status, project_id) values ('converted', '00000000-0000-0000-0000-0000000000b2');
`);

await db.exec(script);

const app = (await db.query(`select cp.* from projects p join customer_products cp on cp.id = p.customer_product_id
  where p.id = '00000000-0000-0000-0000-0000000000b2'`)).rows[0];
assert.notEqual(app.id, "00000000-0000-0000-0000-0000000000a1", "App project must get its own row");
assert.equal(app.classification, "Discrete Development");
assert.deepEqual(app.classifications, ["Discrete Development"]);
assert.equal(app.product_name, "StackShift");
assert.equal(app.customer_id, "WRQ-CLIENT-0006");
assert.deepEqual(app.onboarding_data, {});

const site = (await db.query(`select cp.* from projects p join customer_products cp on cp.id = p.customer_product_id
  where p.id = '00000000-0000-0000-0000-0000000000b1'`)).rows[0];
assert.equal(site.id, "00000000-0000-0000-0000-0000000000a1", "website keeps its row");
assert.equal(site.classification, "StackShift I");
assert.deepEqual(site.onboarding_data, { x: 1 });

await assert.rejects(db.exec(script), /no longer shares/, "re-run must abort");
await db.exec("rollback").catch(() => {});
assert.equal((await db.query("select count(*)::int n from customer_products")).rows[0].n, 2, "re-run wrote nothing");

console.log("495 repair check PASS");
