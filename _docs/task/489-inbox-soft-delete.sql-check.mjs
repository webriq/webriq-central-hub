// Task 489 — runs migration 185 on PGlite against a minimal `inbox` and asserts columns, index, idempotency, rollback.
// Not a project dependency: in an empty dir run `pnpm add @electric-sql/pglite@0.2.17`, copy this file there, then
// `node 489-inbox-soft-delete.sql-check.mjs <repo>/supabase/migrations/185_inbox_soft_delete.sql`.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const mig = readFileSync(process.argv[2], "utf8");
const rollback = mig
  .split("\n")
  .filter((l) => /^--\s{3}(drop|alter)/.test(l))
  .map((l) => l.replace(/^--\s+/, ""))
  .join("\n");
const db = new PGlite();
const q = async (s, p) => (await db.query(s, p)).rows;
const cols = async () =>
  (await q(`select column_name from information_schema.columns where table_name='inbox' order by column_name`)).map((r) => r.column_name);

await db.exec(`
create schema auth; create table auth.users (id uuid primary key);
create table inbox (id uuid primary key default gen_random_uuid(), subject text not null, created_at timestamptz not null default now());
insert into auth.users values ('00000000-0000-0000-0000-000000000001');
insert into inbox (subject) values ('a'), ('b');
`);

await db.exec(mig);
assert.ok((await cols()).includes("deleted_at") && (await cols()).includes("deleted_by"), "columns added");
assert.equal((await q(`select count(*)::int n from inbox where deleted_at is null`))[0].n, 2, "existing rows not deleted");
assert.equal((await q(`select count(*)::int n from pg_indexes where indexname='inbox_not_deleted_created_idx'`))[0].n, 1, "index");

await db.exec(mig); // idempotent re-run
console.log("PASS re-run");

// soft delete + FK on delete set null
await q(`update inbox set deleted_at=now(), deleted_by='00000000-0000-0000-0000-000000000001' where subject='a'`);
assert.equal((await q(`select count(*)::int n from inbox where deleted_at is null`))[0].n, 1, "one hidden");
await q(`delete from auth.users`);
assert.equal((await q(`select deleted_by from inbox where subject='a'`))[0].deleted_by, null, "deleted_by set null");
assert.ok((await q(`select deleted_at from inbox where subject='a'`))[0].deleted_at, "still deleted after user removal");
console.log("PASS soft delete / FK");

await db.exec(rollback);
assert.ok(!(await cols()).includes("deleted_at"), "rollback drops columns");
assert.equal((await q(`select count(*)::int n from inbox`))[0].n, 2, "rollback keeps rows");
console.log("PASS rollback");
