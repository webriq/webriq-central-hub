import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { collectFolderSubtree } from "@/lib/uploads/customer-asset-folder-tree";

async function getRequesterRole(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  return profile?.role ?? null;
}

// Mirror of the sibling assets routes' canSeeAsset()/canSeeFolder() (tasks 138/144).
function canSeeFolder(
  role: string | null, userId: string | null,
  allowedRoles: string[] | null, allowedUserIds: string[] | null
) {
  if (role === "admin" || role === "super_admin") return true;
  const noRoleRestriction = !allowedRoles || allowedRoles.length === 0;
  const noUserRestriction = !allowedUserIds || allowedUserIds.length === 0;
  if (noRoleRestriction && noUserRestriction) return true;
  const roleMatches = !noRoleRestriction && !!role && allowedRoles.includes(role);
  const userMatches = !noUserRestriction && !!userId && allowedUserIds.includes(userId);
  return roleMatches || userMatches;
}

// Mirror of src/app/api/customers/[customerId]/assets/route.ts's canSeeAsset() — needed here too
// (task 371) to authorize every file in a folder's subtree before a recursive delete.
function canSeeAsset(
  role: string | null, userId: string | null,
  allowedRoles: string[] | null, allowedUserIds: string[] | null
) {
  if (role === "admin" || role === "super_admin") return true;
  const noRoleRestriction = !allowedRoles || allowedRoles.length === 0;
  const noUserRestriction = !allowedUserIds || allowedUserIds.length === 0;
  if (noRoleRestriction && noUserRestriction) return true;
  const roleMatches = !noRoleRestriction && !!role && allowedRoles.includes(role);
  const userMatches = !noUserRestriction && !!userId && allowedUserIds.includes(userId);
  return roleMatches || userMatches;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string; folderId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { customerId, folderId } = await params;
    const body = await request.json();
    const name = body.name;
    const allowedRoles = body.allowed_roles;
    const allowedUserIds = body.allowed_user_ids;
    const hasName = name !== undefined;
    const hasRoles = allowedRoles !== undefined;
    const hasUserIds = allowedUserIds !== undefined;
    if (hasName && (typeof name !== "string" || !name.trim())) {
      return NextResponse.json({ error: "name must be a non-empty string" }, { status: 400 });
    }
    if (hasRoles && (!Array.isArray(allowedRoles) || !allowedRoles.every((r) => typeof r === "string"))) {
      return NextResponse.json({ error: "allowed_roles must be a string[]" }, { status: 400 });
    }
    if (hasUserIds && (!Array.isArray(allowedUserIds) || !allowedUserIds.every((r) => typeof r === "string"))) {
      return NextResponse.json({ error: "allowed_user_ids must be a string[]" }, { status: 400 });
    }
    if (!hasName && !hasRoles && !hasUserIds) {
      return NextResponse.json({ error: "name, allowed_roles, and/or allowed_user_ids is required" }, { status: 400 });
    }

    const { data: existing, error: fetchError } = await supabase
      .from("customer_asset_folders")
      .select("id, allowed_roles, allowed_user_ids")
      .eq("id", folderId)
      .eq("customer_id", customerId)
      .maybeSingle();
    if (fetchError) {
      console.error("PATCH .../assets/folders/[folderId] lookup error:", fetchError);
      return NextResponse.json({ error: "Failed to look up folder" }, { status: 500 });
    }
    if (!existing) return NextResponse.json({ error: "Folder not found" }, { status: 404 });

    const myRole = await getRequesterRole(supabase, user.id);
    if (!canSeeFolder(myRole, user.id, existing.allowed_roles, existing.allowed_user_ids)) {
      return NextResponse.json({ error: "Not permitted to modify this folder" }, { status: 403 });
    }

    const updates: { name?: string; allowed_roles?: string[] | null; allowed_user_ids?: string[] | null } = {};
    if (hasName) updates.name = name.trim();
    if (hasRoles) updates.allowed_roles = allowedRoles.length > 0 ? allowedRoles : null;
    if (hasUserIds) updates.allowed_user_ids = allowedUserIds.length > 0 ? allowedUserIds : null;

    const { data: updated, error: updateError } = await supabase
      .from("customer_asset_folders")
      .update(updates)
      .eq("id", folderId)
      .eq("customer_id", customerId)
      .select()
      .single();

    if (updateError) {
      if (updateError.code === "23505") {
        return NextResponse.json({ error: "A folder with that name already exists here" }, { status: 400 });
      }
      console.error("PATCH .../assets/folders/[folderId] update error:", updateError);
      return NextResponse.json({ error: "Failed to update folder" }, { status: 500 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH .../assets/folders/[folderId] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ customerId: string; folderId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { customerId, folderId } = await params;

    const { data: folder, error: fetchError } = await supabase
      .from("customer_asset_folders")
      .select("id, is_system, allowed_roles, allowed_user_ids")
      .eq("id", folderId)
      .eq("customer_id", customerId)
      .maybeSingle();
    if (fetchError) {
      console.error("DELETE .../assets/folders/[folderId] lookup error:", fetchError);
      return NextResponse.json({ error: "Failed to look up folder" }, { status: 500 });
    }
    if (!folder) return NextResponse.json({ error: "Folder not found" }, { status: 404 });

    const myRole = await getRequesterRole(supabase, user.id);
    if (!canSeeFolder(myRole, user.id, folder.allowed_roles, folder.allowed_user_ids)) {
      return NextResponse.json({ error: "Not permitted to delete this folder" }, { status: 403 });
    }
    if (folder.is_system) {
      return NextResponse.json({ error: "System folders can't be deleted" }, { status: 400 });
    }

    // Task 371 — recursive delete: walk the full subtree so a folder's nested sub-folders and
    // files are authorized (and, for is_system, blocked) before anything is deleted, since each
    // carries its own independent allowed_roles/allowed_user_ids that can be narrower than the
    // folder being clicked.
    const subtree = await collectFolderSubtree(supabase, { id: folder.id, is_system: folder.is_system, allowed_roles: folder.allowed_roles, allowed_user_ids: folder.allowed_user_ids });
    if ("error" in subtree) {
      console.error("DELETE .../assets/folders/[folderId] subtree lookup error:", subtree.error);
      return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
    }
    const { folders: subtreeFolders, assets: subtreeAssets } = subtree;

    if (subtreeFolders.some((f) => f.is_system)) {
      return NextResponse.json({ error: "System folders can't be deleted" }, { status: 400 });
    }
    const canSeeEverything =
      subtreeFolders.every((f) => canSeeFolder(myRole, user.id, f.allowed_roles, f.allowed_user_ids)) &&
      subtreeAssets.every((a) => canSeeAsset(myRole, user.id, a.allowed_roles, a.allowed_user_ids));
    if (!canSeeEverything) {
      return NextResponse.json({ error: "Some items inside this folder aren't visible to you" }, { status: 403 });
    }

    const subtreeFolderIds = subtreeFolders.map((f) => f.id);
    const { error: deleteAssetsError } = await supabase
      .from("customer_assets")
      .delete()
      .eq("customer_id", customerId)
      .in("folder_id", subtreeFolderIds);
    if (deleteAssetsError) {
      console.error("DELETE .../assets/folders/[folderId] subtree asset delete error:", deleteAssetsError);
      return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
    }

    const { error: deleteError } = await supabase
      .from("customer_asset_folders")
      .delete()
      .eq("id", folderId)
      .eq("customer_id", customerId);
    if (deleteError) {
      console.error("DELETE .../assets/folders/[folderId] error:", deleteError);
      return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.error("DELETE .../assets/folders/[folderId] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
