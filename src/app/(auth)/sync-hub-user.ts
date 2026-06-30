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
    .select("first_name, last_name, external_id")
    .eq("id", user.id)
    .maybeSingle();

  function splitName(full: string | null) {
    if (!full) return { first_name: null as string | null, last_name: null as string | null };
    const parts = full.trim().split(/\s+/);
    return { first_name: parts[0] ?? null, last_name: parts.slice(1).join(" ") || null };
  }

  if (!existing) {
    // No hub_users row yet — insert it (shouldn't happen, but safety net)
    const fullName =
      (rawMeta["full_name"] as string) ??
      (rawMeta["name"] as string) ??
      (rawMeta["display_name"] as string) ??
      user.email.split("@")[0];
    const { first_name, last_name } = splitName(fullName);
    await supabase.from("hub_users").insert({
      id: user.id,
      email: user.email,
      first_name,
      last_name,
      role: null,
      external_id: (rawMeta["sub"] as string) ?? null,
    });
    return;
  }

  // Build updates only for NULL fields
  const updates: { first_name?: string | null; last_name?: string | null; external_id?: string | null } = {};

  if (!existing.first_name) {
    const fullName =
      (rawMeta["full_name"] as string) ??
      (rawMeta["name"] as string) ??
      (rawMeta["display_name"] as string) ??
      user.email.split("@")[0];
    const { first_name, last_name } = splitName(fullName);
    updates.first_name = first_name;
    updates.last_name = last_name;
  }

  const zohoSub = rawMeta["sub"] as string | undefined;
  if (!existing.external_id && zohoSub) {
    updates.external_id = zohoSub;
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
