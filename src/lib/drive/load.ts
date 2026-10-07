import type { DriveViewer } from "./access";
import type { DriveFileRow, DriveFolderRow, DriveShareRow } from "./types";

const PAGE = 1000;

// CLAUDE.md: PostgREST silently caps a response at 1000 rows — page through with .range().
async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[] | null> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error || !data) return null;
    rows.push(...data);
    if (data.length < PAGE) return rows;
  }
}

// Everything the caller can see (RLS-filtered): own tree + everything shared with them.
export async function loadVisibleDrive(viewer: DriveViewer): Promise<{ folders: DriveFolderRow[]; files: DriveFileRow[] } | null> {
  const { supabase } = viewer;
  const [folders, files] = await Promise.all([
    fetchAll<DriveFolderRow>((from, to) => supabase.from("drive_folders").select("*").order("id").range(from, to)),
    fetchAll<DriveFileRow>((from, to) => supabase.from("drive_files").select("*").order("id").range(from, to)),
  ]);
  return folders && files ? { folders, files } : null;
}

// Shares the caller can act on: grants TO them (user or role) and the ones they handed out.
export async function loadMyShares(viewer: DriveViewer): Promise<DriveShareRow[] | null> {
  const { supabase, userId, role } = viewer;
  return fetchAll<DriveShareRow>((from, to) => supabase.from("drive_shares").select("*").order("id")
    .or(`user_id.eq.${userId},role.eq.${role},added_by.eq.${userId}`).range(from, to));
}
