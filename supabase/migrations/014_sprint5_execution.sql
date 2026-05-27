-- WebriQ Central Hub — Sprint 5
-- Migration 014: Execution engine additions

-- Circuit breaker: tripped when 3 consecutive executions fail for a customer
alter table customers
  add column if not exists automation_paused boolean not null default false;

-- Constrain execution_records.status to valid pipeline values
-- (drop first to make this idempotent on re-runs)
alter table execution_records
  drop constraint if exists execution_records_status_check;

alter table execution_records
  add constraint execution_records_status_check
    check (status in ('PENDING', 'RUNNING', 'COMPLETED', 'PARTIAL_EXECUTION', 'FAILED', 'REVERTED'));
