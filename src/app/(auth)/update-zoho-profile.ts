"use server";

import { adminClient } from "@/lib/supabase/admin";

/**
 * Update hub_users.display_name and auth.users.raw_user_meta_data
 * with the real Zoho profile info fetched via /oauth/user/info.
 */
export async function updateZohoProfile(
  userId: string,
  displayName: string,
  zuid: string
) {
  // 1. Update hub_users
  const { error: hubErr } = await adminClient
    .from("hub_users")
    .update({
      display_name: displayName,
      zoho_user_id: zuid,
    })
    .eq("id", userId);

  if (hubErr) {
    console.error("[update-zoho-profile] hub_users update error:", hubErr.message);
  }

  // 2. Update auth.users.raw_user_meta_data so Display Name shows in Supabase Dashboard
  const { error: authErr } = await adminClient.auth.admin.updateUserById(
    userId,
    {
      user_metadata: {
        display_name: displayName,
        full_name: displayName,
        name: displayName,
      },
    }
  );

  if (authErr) {
    console.error("[update-zoho-profile] auth.users update error:", authErr.message);
  }
}
