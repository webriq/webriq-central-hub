-- Rollback for 166_user_drive.sql (task 436). Drops the personal Drive tables + helpers.
-- Storage objects in the `user-drive` bucket are NOT removed (empty the bucket in the dashboard
-- first if you also want the bucket gone — a non-empty bucket cannot be deleted).

drop table if exists drive_shares;
drop table if exists drive_files;
drop table if exists drive_folders;

drop function if exists drive_owns_file(uuid);
drop function if exists drive_owns_folder(uuid);
drop function if exists drive_file_level(uuid);
drop function if exists drive_folder_level(uuid);
drop function if exists drive_is_staff();
drop function if exists drive_files_integrity();
drop function if exists drive_folders_integrity();
drop function if exists drive_touch_updated_at();

delete from storage.buckets where id = 'user-drive' and not exists (select 1 from storage.objects where bucket_id = 'user-drive');
