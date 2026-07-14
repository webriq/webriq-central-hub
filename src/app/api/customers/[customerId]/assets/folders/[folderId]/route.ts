import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

    // Empty-only delete (task 144): customer_asset_folders.parent_folder_id is ON DELETE
    // CASCADE (would silently delete nested sub-folders) and customer_assets.folder_id is
    // ON DELETE SET NULL (files would silently become unfiled root-level orphans) — both
    // are avoided by requiring the folder to already have zero direct children of either kind.
    const { count: childFolderCount, error: childFolderError } = await supabase
      .from("customer_asset_folders")
      .select("id", { count: "exact", head: true })
      .eq("parent_folder_id", folderId);
    if (childFolderError) {
      console.error("DELETE .../assets/folders/[folderId] child-folder count error:", childFolderError);
      return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
    }
    const { count: assetCount, error: assetError } = await supabase
      .from("customer_assets")
      .select("id", { count: "exact", head: true })
      .eq("folder_id", folderId);
    if (assetError) {
      console.error("DELETE .../assets/folders/[folderId] asset count error:", assetError);
      return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 });
    }
    if ((childFolderCount ?? 0) > 0 || (assetCount ?? 0) > 0) {
      return NextResponse.json({ error: "Folder is not empty — move or remove its contents first" }, { status: 400 });
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
