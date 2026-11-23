// Task 497 — runs migration 190 on PGlite against a minimal `inbox_messages` and asserts columns, idempotency, FK, rollback.
// Not a project dependency: in an empty dir run `pnpm add @electric-sql/pglite@0.2.17`, copy this file there, then
// `node 497-inbox-messages-soft-delete.sql-check.mjs <repo>/supabase/migrations/190_inbox_messages_soft_delete.sql`.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const mig = readFileSync(process.argv[2], "utf8");
const rollback = mig
  .split("\n")
  .filter((l) => /^--\s{3}(drop|alter)/.test(l))
  .map((l) => l.replace(/^--\s+/, ""))
  .join("\n");
assert.ok(rollback.length > 0, "rollback block found");
const db = new PGlite();
const q = async (s, p) => (await db.query(s, p)).rows;
const cols = async () =>
  (await q(`select column_name from information_schema.columns where table_name='inbox_messages'`)).map((r) => r.column_name);

await db.exec(`
create schema auth; create table auth.users (id uuid primary key);
create table inbox_messages (id uuid primary key default gen_random_uuid(), inbox_id uuid not null, body text not null, created_at timestamptz not null default now());
insert into auth.users values ('00000000-0000-0000-0000-000000000001');
insert into inbox_messages (inbox_id, body) values (gen_random_uuid(), 'a'), (gen_random_uuid(), 'b');
`);

await db.exec(mig);
assert.ok((await cols()).includes("deleted_at") && (await cols()).includes("deleted_by"), "columns added");
assert.equal((await q(`select count(*)::int n from inbox_messages where deleted_at is null`))[0].n, 2, "existing rows not deleted");
await db.exec(mig); // idempotent re-run
console.log("PASS apply + re-run");

await q(`update inbox_messages set deleted_at=now(), deleted_by='00000000-0000-0000-0000-000000000001' where body='a'`);
assert.equal((await q(`select count(*)::int n from inbox_messages where deleted_at is null`))[0].n, 1, "one hidden");
await q(`delete from auth.users`);
assert.equal((await q(`select deleted_by from inbox_messages where body='a'`))[0].deleted_by, null, "deleted_by set null");
assert.ok((await q(`select deleted_at from inbox_messages where body='a'`))[0].deleted_at, "still deleted after user removal");
console.log("PASS soft delete / FK");

await db.exec(rollback);
assert.ok(!(await cols()).includes("deleted_at") && !(await cols()).includes("deleted_by"), "rollback drops columns");
assert.equal((await q(`select count(*)::int n from inbox_messages`))[0].n, 2, "rollback keeps rows");
console.log("PASS rollback");
