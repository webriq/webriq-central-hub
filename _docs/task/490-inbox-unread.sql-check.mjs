// Task 490 — runs migration 186 on PGlite against a minimal inbox/inbox_messages schema and asserts the baseline,
// the customer-only trigger with its 48h + seen_at guard, idempotent re-run and rollback.
// Not a project dependency: in an empty dir run `pnpm add @electric-sql/pglite@0.2.17`, copy this file there, then
// `node 490-inbox-unread.sql-check.mjs <repo>/supabase/migrations/186_inbox_unread.sql`.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const mig = readFileSync(process.argv[2], "utf8");
const rollback = mig
  .split("\n")
  .filter((l) => /^--\s{3}(drop|alter) /.test(l))
  .map((l) => l.replace(/^--\s+/, ""))
  .join("\n");
const db = new PGlite();
const q = async (s, p) => (await db.query(s, p)).rows;
const unread = async (id) => (await q(`select unread_count from inbox where id=$1`, [id]))[0].unread_count;
const A = "00000000-0000-0000-0000-00000000000a";
const B = "00000000-0000-0000-0000-00000000000b";
const msg = (inbox, author, ago = "0 minutes") =>
  q(`insert into inbox_messages (inbox_id, author_type, body, created_at) values ($1, $2, 'x', now() - $3::interval)`, [inbox, author, ago]);

await db.exec(`
create schema auth; create table auth.users (id uuid primary key);
create table inbox (id uuid primary key, subject text not null, created_at timestamptz not null default now());
create table inbox_messages (id uuid primary key default gen_random_uuid(), inbox_id uuid not null references inbox(id) on delete cascade,
  author_type text not null, body text not null, created_at timestamptz not null default now());
insert into inbox (id, subject) values ('${A}', 'existing');
insert into inbox_messages (inbox_id, author_type, body, created_at) values ('${A}', 'client', 'old', now() - interval '1 hour');
`);

await db.exec(mig);
const base = (await q(`select unread_count, seen_at, last_client_message_at from inbox where id='${A}'`))[0];
assert.equal(base.unread_count, 0, "baseline: existing thread read");
assert.ok(base.seen_at, "baseline: seen_at set");
assert.ok(base.last_client_message_at, "baseline: last_client_message_at backfilled");
console.log("PASS baseline");

// Existing (baselined) thread: a fresh customer message after seen_at counts; staff/system/llm_draft never do.
await msg(A, "client");
for (const a of ["staff", "system", "llm_draft"]) await msg(A, a);
assert.equal(await unread(A), 1, "client counts, others don't");
// Historical insert (> 48h old) and one older than seen_at never count.
await msg(A, "client", "3 days");
await msg(A, "client", "2 hours");
assert.equal(await unread(A), 1, "history / pre-seen_at don't count");
console.log("PASS trigger guard");

// New thread after rollout (seen_at null): its opening customer message counts.
await q(`insert into inbox (id, subject) values ('${B}', 'new')`);
await msg(B, "client");
await msg(B, "client");
assert.equal(await unread(B), 2, "new thread counts");
// Mark read (what POST /read does) then only newer messages count.
await q(`update inbox set unread_count = 0, seen_at = now() where id='${B}'`);
await msg(B, "client", "1 minute");
assert.equal(await unread(B), 0, "message older than seen_at ignored");
console.log("PASS new thread + mark read");

await db.exec(mig); // idempotent re-run
assert.equal(await unread(B), 0, "re-run keeps counts");
assert.equal((await q(`select count(*)::int n from pg_trigger where tgname='inbox_messages_count_client'`))[0].n, 1, "one trigger");
console.log("PASS re-run");

await db.exec(rollback);
const cols = (await q(`select column_name from information_schema.columns where table_name='inbox'`)).map((r) => r.column_name);
assert.ok(!cols.includes("unread_count") && !cols.includes("seen_at"), "rollback drops columns");
await msg(A, "client"); // trigger gone — insert still works
console.log("PASS rollback");
