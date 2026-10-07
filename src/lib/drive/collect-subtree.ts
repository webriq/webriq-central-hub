import type { DriveViewer } from "./access";

const CHUNK = 100;

// Walks a folder's descendants breadth-first (RLS-filtered reads) and returns the Storage paths of
// every file the cascade is about to drop, so a folder delete can remove those objects. Must run BEFORE the delete.
export async function collectDriveSubtree(viewer: DriveViewer, folderId: string): Promise<string[]> {
  const { supabase } = viewer;
  const folderIds = [folderId];
  const seen = new Set(folderIds);
  let frontier = [folderId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (let i = 0; i < frontier.length; i += CHUNK) {
      const { data } = await supabase.from("drive_folders").select("id").in("parent_folder_id", frontier.slice(i, i + CHUNK));
      for (const row of data ?? []) if (!seen.has(row.id)) { seen.add(row.id); next.push(row.id); }
    }
    folderIds.push(...next);
    frontier = next;
  }
  const filePaths: string[] = [];
  for (let i = 0; i < folderIds.length; i += CHUNK) {
    const { data } = await supabase.from("drive_files").select("file_path").in("folder_id", folderIds.slice(i, i + CHUNK));
    filePaths.push(...(data ?? []).map((r) => r.file_path));
  }
  return filePaths;
}
