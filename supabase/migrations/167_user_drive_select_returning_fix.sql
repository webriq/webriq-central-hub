-- Migration 167: fix for 166 (task 436) — creating a folder/file failed with an RLS violation.
--
-- `insert ... returning` (what supabase-js `.insert().select()` issues) re-checks the new row against
-- the SELECT policy. The 166 select policies called drive_folder_level(id) / drive_file_level(id),
-- which are STABLE functions that read the table with the statement's snapshot — so they cannot see
-- the row being inserted and returned 0, rejecting every insert (error 42501).
-- Fix: let the select policies also grant access without reading the new row itself —
--   · the owner by column (`owner_id = auth.uid()`), and
--   · anyone with access to the PARENT folder (an editor creating inside a shared folder),
-- which only reads rows that already exist. Written, NOT applied by the agent.

drop policy if exists drive_folders_select on drive_folders;
create policy drive_folders_select on drive_folders for select to authenticated
  using (
    (owner_id = auth.uid() and drive_is_staff())
    or drive_folder_level(id) >= 1
    or (parent_folder_id is not null and drive_folder_level(parent_folder_id) >= 1)
  );

drop policy if exists drive_files_select on drive_files;
create policy drive_files_select on drive_files for select to authenticated
  using (
    (owner_id = auth.uid() and drive_is_staff())
    or drive_file_level(id) >= 1
    or (folder_id is not null and drive_folder_level(folder_id) >= 1)
  );
