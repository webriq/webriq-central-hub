-- Migration 037: milestones migration columns
-- Adds external_id to milestones for Zoho dedup during one-time import.
-- Adds milestone_id to tasklists to preserve the Zoho hierarchy:
--   project → milestone → tasklist → task.
-- Safe to drop external_id after migration is fully verified.

alter table milestones
  add column external_id text unique;

create index milestones_external_id_idx on milestones(external_id) where external_id is not null;

alter table tasklists
  add column milestone_id uuid references milestones(id) on delete set null;

create index tasklists_milestone_id_idx on tasklists(milestone_id);
