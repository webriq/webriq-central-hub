import { createClient } from "@/lib/supabase/server";

type FolderRow = { id: string; is_system: boolean; allowed_roles: string[] | null; allowed_user_ids: string[] | null };
type AssetRow = { id: string; allowed_roles: string[] | null; allowed_user_ids: string[] | null };

// Task 371 — recursive folder delete needs the full subtree (not just direct children) so the
// route can authorize every nested folder/file before deleting anything. `parent_folder_id` is
// ON DELETE CASCADE (migration 065), so deleting the root folder row alone would already remove
// descendant folder rows — this walk exists for the pre-delete permission/is_system checks and
// to find the asset rows, which are ON DELETE SET NULL and must be deleted explicitly.
export async function collectFolderSubtree(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rootFolder: FolderRow
): Promise<{ folders: FolderRow[]; assets: AssetRow[] } | { error: string }> {
  const folders: FolderRow[] = [rootFolder];
  let frontier = [rootFolder.id];

  while (frontier.length > 0) {
    const { data, error } = await supabase
      .from("customer_asset_folders")
      .select("id, is_system, allowed_roles, allowed_user_ids")
      .in("parent_folder_id", frontier);
    if (error) return { error: "Failed to walk folder subtree" };
    if (!data || data.length === 0) break;
    folders.push(...data);
    frontier = data.map((f) => f.id);
  }

  const allFolderIds = folders.map((f) => f.id);
  const { data: assets, error: assetsError } = await supabase
    .from("customer_assets")
    .select("id, allowed_roles, allowed_user_ids")
    .in("folder_id", allFolderIds);
  if (assetsError) return { error: "Failed to look up files in folder subtree" };

  return { folders, assets: assets ?? [] };
}
