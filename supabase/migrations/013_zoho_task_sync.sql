-- WebriQ Central Hub — Sprint 4 Part 2
-- Migration 013: Zoho task sync columns + classification status expansion

-- Add Zoho sync columns to implementation_plans
alter table implementation_plans
  add column if not exists zoho_task_id     text,
  add column if not exists direct_zoho_edit boolean not null default false;

create index if not exists idx_implementation_plans_zoho_task_id
  on implementation_plans (zoho_task_id)
  where zoho_task_id is not null;

-- Expand classification_records status check to include pipeline + PM action statuses.
-- Original constraint ('pending', 'reviewed', 'rejected') from migration 001 is too narrow —
-- task 025 already writes 'planning' and 'approved' to this column.
alter table classification_records
  drop constraint if exists classification_records_status_check;

alter table classification_records
  add constraint classification_records_status_check
    check (status in (
      'pending', 'classifying', 'classified', 'reviewed', 'rejected',
      'planning', 'approved',
      'open', 'on_hold', 'active', 'review', 'closed'
    ));
