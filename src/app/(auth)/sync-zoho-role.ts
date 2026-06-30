"use server";

import { adminClient } from "@/lib/supabase/admin";
import { getZohoPortalUser, type ZohoPortalUser } from "@/lib/zoho";

export type HubRole = "admin" | "pm" | "pending";

function determineHubRole(user: ZohoPortalUser, displayName: string): HubRole {
  const fn = user.first_name ?? "";
  const dn = displayName || user.full_name || "";
  const roleName = user.role?.name ?? "";
  const profileName = user.portal_profile?.name ?? "";

  const isNamedAdmin =
    dn.includes("WebriQ") || fn === "WebriQ" ||
    dn.includes("Eleazar") || fn === "Eleazar" ||
    dn.includes("Philippe") || dn.includes("Bodart") || fn === "Philippe";

  if (isNamedAdmin && roleName === "Administrator" && profileName === "Admin") return "admin";
  if (roleName === "Administrator" && profileName === "Manager") return "admin";
  if (roleName === "Manager" && profileName === "Portal Owner") return "admin";

  if (roleName === "Manager" && profileName === "Admin") return "pm";
  if (roleName === "Administrator" && profileName === "Admin") return "pm";
  if (roleName === "Manager" && profileName === "Manager") return "pm";

  return "pending";
}

const APPROVED_ROLES = new Set(["admin", "pm", "dev"]);

export async function syncZohoRole(
  userId: string,
  email: string,
  displayName: string
): Promise<HubRole | null> {
  const raw = await getZohoPortalUser(email);
  if (!raw) {
    console.warn("[sync-zoho-role] no portal user found for:", email);
    return null;
  }

  // Zoho API wraps response as { user: {...} } — handle both shapes defensively
  const portalUser: ZohoPortalUser =
    (raw as unknown as { user?: ZohoPortalUser }).user ?? raw;
    console.log("[sync-zoho-role] fetched portal user for:", email, "user:", portalUser);

  const role = determineHubRole(portalUser, displayName);
  console.log("[sync-zoho-role] determined role:", role, "for:", email);

  // Don't downgrade users who already have an approved role (e.g. admin-assigned 'dev')
  if (role === "pending") {
    const { data: existing } = await adminClient
      .from("hub_users")
      .select("role")
      .eq("id", userId)
      .single();
    console.log("[sync-zoho-role] existing role for:", email, "is:", existing?.role);

    const currentRole = existing?.role ?? null;
    if (currentRole && APPROVED_ROLES.has(currentRole)) {
      console.log("[sync-zoho-role] preserving approved role:", currentRole, "for:", email);
      return currentRole as HubRole;
    }
  }

  type HubUserUpdate = {
    first_name?: string | null;
    last_name?: string | null;
    external_id?: string | null;
    role?: string;
  };

  const fullName = (displayName ?? portalUser.full_name ?? "").trim();
  const nameParts = fullName.split(/\s+/);
  const updates: HubUserUpdate = {
    first_name: nameParts[0] || null,
    last_name: nameParts.slice(1).join(" ") || null,
    external_id: portalUser.zuid ?? null,
    role,
  };

  const { error } = await adminClient
    .from("hub_users")
    .update(updates)
    .eq("id", userId);

  if (error) {
    console.error("[sync-zoho-role] hub_users update error:", error.message);
  } else {
    console.log("[sync-zoho-role] synced role:", role, "for:", email);
  }

  return role;
}
