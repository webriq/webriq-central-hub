// Task 494 — runs migration 188 on PGlite against wiki_pages carrying the OLD (task 395) 4-value check and asserts:
//   * 'StackShift I' / 'StackShift II' / 'Citation Grader' fail before 188 (reproduces the prod 23514) and succeed after;
//   * legacy 'StackShift' rows move to 'StackShift I'; other rows keep their space;
//   * unknown values are still rejected; running 188 twice is a no-op.
// Not a project dependency: in an empty dir run `pnpm add @electric-sql/pglite@0.2.17`, copy this file there, then
// `node 494-wiki-product-check.sql-check.mjs <repo>/supabase/migrations/188_wiki_pages_product_check_widen.sql`.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const migration = readFileSync(process.argv[2], "utf8");
const db = new PGlite();
await db.exec(`
  create table wiki_pages (
    id serial primary key,
    product text not null check (product in ('PipelineForge', 'PublishForge', 'CiteForge', 'StackShift')),
    title text not null
  );
  insert into wiki_pages (product, title) values ('StackShift', 'legacy'), ('CiteForge', 'cite'), ('PipelineForge', 'pipe');
`);

const insert = (product) => db.query("insert into wiki_pages (product, title) values ($1, 't')", [product]);
const NEW = ["StackShift I", "StackShift II", "Citation Grader"];

for (const p of NEW) await assert.rejects(insert(p), /wiki_pages_product_check/, `before 188: ${p} should fail`);

await db.exec(migration);
await db.exec(migration); // idempotent

const rows = (await db.query("select title, product from wiki_pages order by id")).rows;
assert.deepEqual(rows, [
  { title: "legacy", product: "StackShift I" },
  { title: "cite", product: "CiteForge" },
  { title: "pipe", product: "PipelineForge" },
]);
for (const p of [...NEW, "PipelineForge", "PublishForge", "CiteForge"]) await insert(p);
for (const p of ["StackShift", "Nope"]) await assert.rejects(insert(p), /wiki_pages_product_check/, `after 188: ${p} should fail`);
const n = (await db.query("select count(*)::int n from wiki_pages")).rows[0].n;
assert.equal(n, 9);
console.log("PASS: 494 migration 188 check");
