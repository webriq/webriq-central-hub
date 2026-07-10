-- Migration 061: contacts.external_id nullable (task 129)
--
-- `contacts` (migration 056, renamed 058) was built as a pure Zoho Desk import table, with
-- `external_id` not null unique. Task 129 adds manually-entered contacts from the internal
-- onboarding wizard's Kickoff step (written on Phase 1 hand-off) — those have no Zoho Desk
-- record, so external_id must be nullable. Multiple NULLs are distinct under a unique index,
-- so this doesn't weaken the existing dedupe guarantee for imported rows.

alter table contacts alter column external_id drop not null;
