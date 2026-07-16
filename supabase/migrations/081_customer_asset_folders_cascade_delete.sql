-- Migration 081: customer_asset_folders.project_id — add ON DELETE CASCADE.
--
-- Migration 065 defined this FK with no ON DELETE clause (defaults to Postgres's NO ACTION),
-- the only project_id foreign key in this schema that doesn't cascade — every sibling
-- (customer_phases, customer_deliverables, customer_assets, programme_notifications,
-- onboarding_internal_deliverables, project_members, issues, milestones, tasks/tickets, etc.)
-- already does. Confirmed as an oversight, not intentional, after it blocked deleting two test
-- projects from the `projects` table via Supabase's table editor with a foreign-key-constraint
-- error. customer_asset_folders has its own dependent, customer_assets.folder_id, which already
-- uses ON DELETE SET NULL — unaffected by this change.

alter table customer_asset_folders drop constraint customer_asset_folders_project_id_fkey;
alter table customer_asset_folders add constraint customer_asset_folders_project_id_fkey
  foreign key (project_id) references projects (id) on delete cascade;
