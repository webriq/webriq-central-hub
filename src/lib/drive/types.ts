import type { Database } from "@/types/database";

export type DrivePermission = "view" | "edit";
export type DriveView = "mine" | "shared";
// 3 owner · 2 edit · 1 view — mirrors drive_folder_level() in migration 166.
export type DriveLevel = 1 | 2 | 3;

type Tables = Database["public"]["Tables"];

export type DriveFolderRow = Tables["drive_folders"]["Row"];
export type DriveFileRow = Tables["drive_files"]["Row"];
export type DriveShareRow = Tables["drive_shares"]["Row"];

// What the client receives: the row plus what the caller may do with it. `share_count` is only
// populated in the "mine" view; `is_shared_root` only in "shared" (the top-level entry point).
export type DriveFolder = DriveFolderRow & { level: DriveLevel; share_count: number; is_shared_root: boolean };
export type DriveFile = DriveFileRow & { level: DriveLevel; share_count: number; is_shared_root: boolean };

export type DrivePayload = { folders: DriveFolder[]; files: DriveFile[]; me: { id: string; role: string } };

export type DrivePerson = { id: string; full_name: string | null; role: string; avatar_url: string | null; inactive: boolean };

export type DriveShare = {
  id: string;
  folder_id: string | null;
  file_id: string | null;
  user_id: string | null;
  role: string | null;
  permission: DrivePermission;
  created_at: string;
};
