import type {
  DriveFile, DriveFileRow, DriveFolder, DriveFolderRow, DriveLevel, DriveShareRow, DriveView,
} from "./types";

// Pure mirror of drive_folder_level()/drive_file_level() (migration 166), used to annotate rows in
// one pass instead of one RPC per row. RLS has already filtered what the caller can SEE; this only
// works out what they may DO. Keep the two in sync.
const rank = (p: string) => (p === "edit" ? 2 : 1);

export function annotateDrive({
  folders, files, shares, userId, role, view,
}: {
  folders: DriveFolderRow[]; files: DriveFileRow[]; shares: DriveShareRow[];
  userId: string; role: string; view: DriveView;
}): { folders: DriveFolder[]; files: DriveFile[] } {
  const foldersById = new Map(folders.map((f) => [f.id, f]));
  const grantTo = (s: DriveShareRow) => s.user_id === userId || s.role === role;
  const grantByFolder = new Map<string, number>();
  const grantByFile = new Map<string, number>();
  const shareCount = new Map<string, number>();
  for (const s of shares) {
    const key = s.folder_id ?? s.file_id!;
    if (s.added_by === userId) shareCount.set(key, (shareCount.get(key) ?? 0) + 1);
    if (!grantTo(s)) continue;
    const map = s.folder_id ? grantByFolder : grantByFile;
    map.set(key, Math.max(map.get(key) ?? 0, rank(s.permission)));
  }

  const memo = new Map<string, number>();
  const folderLevel = (id: string | null): number => {
    if (!id) return 0;
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    memo.set(id, 0); // cycle guard
    const f = foldersById.get(id);
    const level = !f ? 0 : f.owner_id === userId ? 3 : Math.max(grantByFolder.get(id) ?? 0, folderLevel(f.parent_folder_id));
    memo.set(id, level);
    return level;
  };

  const inView = (owner: string) => (view === "mine" ? owner === userId : owner !== userId);
  // A "shared root" is an entry point: nothing above it is visible to the caller.
  const isRootFolder = (f: DriveFolderRow) => view === "shared" && (!f.parent_folder_id || !foldersById.has(f.parent_folder_id));

  const outFolders = folders.filter((f) => inView(f.owner_id) && folderLevel(f.id) > 0).map((f): DriveFolder => ({
    ...f, level: folderLevel(f.id) as DriveLevel, share_count: shareCount.get(f.id) ?? 0, is_shared_root: isRootFolder(f),
  }));
  const outFiles = files.filter((f) => inView(f.owner_id)).flatMap((f): DriveFile[] => {
    const level = f.owner_id === userId ? 3 : Math.max(grantByFile.get(f.id) ?? 0, folderLevel(f.folder_id));
    if (level === 0) return [];
    const root = view === "shared" && (!f.folder_id || !foldersById.has(f.folder_id));
    return [{ ...f, level: level as DriveLevel, share_count: shareCount.get(f.id) ?? 0, is_shared_root: root }];
  });
  return { folders: outFolders, files: outFiles };
}
