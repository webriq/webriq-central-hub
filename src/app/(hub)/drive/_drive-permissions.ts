import type { DriveFile, DriveFolder } from "@/lib/drive/types";

// Task 436 — what the caller may do with a given item. Mirrors the RLS rules in migration 166
// (the database is the authority; this only decides which controls to show):
//   · owner            → everything, including sharing
//   · edit via folder  → rename / move / delete inside the shared subtree, but never the shared
//                        root folder itself (an editor needs edit on its PARENT)
//   · direct file edit → rename only
//   · view             → browse, preview, download
export type Caps = { rename: boolean; move: boolean; remove: boolean; share: boolean };

export function fileCaps(file: DriveFile, foldersById: Map<string, DriveFolder>, meId: string): Caps {
  const owner = file.owner_id === meId;
  const folderEdit = !!file.folder_id && (foldersById.get(file.folder_id)?.level ?? 0) >= 2;
  return { rename: file.level >= 2, move: owner || folderEdit, remove: owner || folderEdit, share: owner };
}

export function folderCaps(folder: DriveFolder, foldersById: Map<string, DriveFolder>, meId: string): Caps {
  const owner = folder.owner_id === meId;
  const parentEdit = !!folder.parent_folder_id && (foldersById.get(folder.parent_folder_id)?.level ?? 0) >= 2;
  return { rename: owner || parentEdit, move: false, remove: owner || parentEdit, share: owner };
}

export const permissionLabel = (level: number) => (level >= 2 ? "Can edit" : "Can view");
