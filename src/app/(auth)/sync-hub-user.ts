"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * Sync hub_users after Zoho login.
 * Safety net for email-first/Zoho-later users where the DB trigger
 * already fired on the initial email insert and won't re-fire.
 */
export async function syncHubUserAfterLogin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) return;

  const rawMeta = (user.user_metadata ?? {}) as Record<string, unknown>;

  // Check current hub_users row
  const { data: existing } = await supabase
    .from("hub_users")
    .select("display_name, zoho_user_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!existing) {
    // No hub_users row yet — insert it (shouldn't happen, but safety net)
    await supabase.from("hub_users").insert({
      id: user.id,
      email: user.email,
      display_name:
        (rawMeta["full_name"] as string) ??
        (rawMeta["name"] as string) ??
        (rawMeta["display_name"] as string) ??
        user.email.split("@")[0],
      role: "pm",
      zoho_user_id: (rawMeta["sub"] as string) ?? null,
    });
    return;
  }

  // Build updates only for NULL fields
  const updates: { display_name?: string; zoho_user_id?: string | null } = {};

  if (!existing.display_name) {
    updates.display_name =
      (rawMeta["full_name"] as string) ??
      (rawMeta["name"] as string) ??
      (rawMeta["display_name"] as string) ??
      user.email.split("@")[0];
  }

  const zohoSub = rawMeta["sub"] as string | undefined;
  if (!existing.zoho_user_id && zohoSub) {
    updates.zoho_user_id = zohoSub;
  }

  if (Object.keys(updates).length > 0) {
    const { error } = await supabase
      .from("hub_users")
      .update(updates)
      .eq("id", user.id);

    if (error) {
      console.error("[sync-hub-user] update error:", error.message);
    }
  }
}
