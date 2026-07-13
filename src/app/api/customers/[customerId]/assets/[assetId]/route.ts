import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

async function getRequesterRole(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  return profile?.role ?? null;
}

// allowed_user_ids is an additive, OR-combined grant on top of allowed_roles (sharing with
// a specific person doesn't require also matching a role) — see task 138.
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
  { params }: { params: Promise<{ customerId: string; assetId: string }> }
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { customerId, assetId } = await params;
    const body = await request.json();
    const allowedRoles = body.allowed_roles;
    const allowedUserIds = body.allowed_user_ids;
    const hasRoles = allowedRoles !== undefined;
    const hasUserIds = allowedUserIds !== undefined;
    if (hasRoles && (!Array.isArray(allowedRoles) || !allowedRoles.every((r) => typeof r === "string"))) {
      return NextResponse.json({ error: "allowed_roles must be a string[]" }, { status: 400 });
    }
    if (hasUserIds && (!Array.isArray(allowedUserIds) || !allowedUserIds.every((r) => typeof r === "string"))) {
      return NextResponse.json({ error: "allowed_user_ids must be a string[]" }, { status: 400 });
    }
    if (!hasRoles && !hasUserIds) {
      return NextResponse.json({ error: "allowed_roles and/or allowed_user_ids is required" }, { status: 400 });
    }

    const { data: existing, error: fetchError } = await supabase
      .from("customer_assets")
      .select("id, allowed_roles, allowed_user_ids")
      .eq("id", assetId)
      .eq("customer_id", customerId)
      .maybeSingle();

    if (fetchError) {
      console.error("PATCH .../assets/[assetId] lookup error:", fetchError);
      return NextResponse.json({ error: "Failed to look up asset" }, { status: 500 });
    }
    if (!existing) return NextResponse.json({ error: "Asset not found" }, { status: 404 });

    const myRole = await getRequesterRole(supabase, user.id);
    if (!canSeeAsset(myRole, user.id, existing.allowed_roles, existing.allowed_user_ids)) {
      return NextResponse.json({ error: "Not permitted to modify this asset" }, { status: 403 });
    }

    const updates: { allowed_roles?: string[] | null; allowed_user_ids?: string[] | null } = {};
    if (hasRoles) updates.allowed_roles = allowedRoles.length > 0 ? allowedRoles : null;
    if (hasUserIds) updates.allowed_user_ids = allowedUserIds.length > 0 ? allowedUserIds : null;

    const { data: updated, error: updateError } = await supabase
      .from("customer_assets")
      .update(updates)
      .eq("id", assetId)
      .eq("customer_id", customerId)
      .select()
      .single();

    if (updateError) {
      console.error("PATCH .../assets/[assetId] update error:", updateError);
      return NextResponse.json({ error: "Failed to update asset" }, { status: 500 });
    }

    return NextResponse.json(updated);
  } catch (err) {
    console.error("PATCH .../assets/[assetId] unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
