-- Migration 170: StackShift support idempotency keys (task 445)
-- WRITTEN, NOT APPLIED — the operator applies it (after 169). Backs the contract's replay rules
-- (_docs/plan/stackshift-hub-support-api-contract.md §3): same key + same body => 200 deduped with the
-- original response; same key + different body => 409 idempotency_conflict. The primary key also
-- arbitrates two concurrent requests carrying the same key.
--
-- Rollback: drop table if exists stackshift_idempotency;

create table if not exists stackshift_idempotency (
  key        text primary key,
  route      text not null,
  body_hash  text not null,
  response   jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists stackshift_idempotency_created_idx on stackshift_idempotency (created_at);

-- Service-role only (internal bookkeeping; no anon/authenticated access, so no policies).
alter table stackshift_idempotency enable row level security;
