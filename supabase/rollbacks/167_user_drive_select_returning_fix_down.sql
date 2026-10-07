-- Rollback for 167: restores the 166 select policies (which reject insert ... returning).
drop policy if exists drive_folders_select on drive_folders;
create policy drive_folders_select on drive_folders for select to authenticated
  using (drive_folder_level(id) >= 1);

drop policy if exists drive_files_select on drive_files;
create policy drive_files_select on drive_files for select to authenticated
  using (drive_file_level(id) >= 1);
