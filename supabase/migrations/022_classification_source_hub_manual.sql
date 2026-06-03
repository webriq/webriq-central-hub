-- Migration 022: Expand classification_records.source check to include 'hub_manual'
-- Needed for PM-created tasks from the Hub (task 050).
alter table classification_records
  drop constraint if exists classification_records_source_check;

alter table classification_records
  add constraint classification_records_source_check
    check (source in ('zoho_desk', 'zoho_projects', 'hub_manual'));
