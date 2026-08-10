-- Migration 098: Rename the "Checklist" system folder to "Migration Checklist".
-- Task 222 — the swimlane's "Migration Checklist" deliverable now deep-links straight into this
-- folder in the Onboarding Workspace's Files tab; the folder's own name is renamed to match so
-- the destination reads the same as the thing that linked to it. assets/folders/route.ts's
-- SYSTEM_FOLDER_TREE/LABEL_TO_SYSTEM_FOLDER provision new projects with the new name already —
-- this is the one-time backfill for projects that already had the old "Checklist" folder
-- provisioned. Root-level, system-owned only (is_system = true, parent_folder_id is null) —
-- never touches a user-created folder that happens to share the old name.
--
-- Guarded against customer_asset_folders' unique (customer_id, project_id, phase_number,
-- parent_folder_id, name) constraint: skips (rather than errors on) any row whose scope already
-- has a "Migration Checklist" folder — e.g. a PM who manually created one before this migration
-- ran. That project keeps its old-named "Checklist" folder untouched rather than failing the
-- whole batch; it can be reconciled by hand later if it ever occurs.

update customer_asset_folders as cf
set name = 'Migration Checklist'
where cf.name = 'Checklist'
  and cf.is_system = true
  and cf.parent_folder_id is null
  and not exists (
    select 1
    from customer_asset_folders as existing
    where existing.customer_id = cf.customer_id
      and existing.project_id = cf.project_id
      and existing.phase_number = cf.phase_number
      and existing.parent_folder_id is null
      and existing.name = 'Migration Checklist'
  );
