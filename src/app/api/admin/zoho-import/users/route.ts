// Admin-only import: reads _from_zoho/users.json, syncs existing hub_users + profiles,
// invites net-new users via adminClient.auth.admin.createUser.
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

type ZohoUserRaw = {
  email?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  zuid?: string;
  role?: { name?: string };
  portal_profile?: { name?: string };
  user_type?: string;
  status?: string;
  added_time?: string;
  last_accessed_on?: string;
  business_hours?: unknown;
  budget?: { cost_rate_per_hour?: { amount?: number } };
  [key: string]: unknown;
};

type JsonObject = { [key: string]: Json };
type Json = string | number | boolean | null | Json[] | JsonObject;

function buildSourceMeta(u: ZohoUserRaw): JsonObject {
  return {
    zoho_id: u.zuid ?? null,
    role: u.role?.name ?? null,
    portal_profile: u.portal_profile?.name ?? null,
    user_type: u.user_type ?? null,
    business_hours: (u.business_hours as Json) ?? null,
  };
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: callerProfile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (callerProfile?.role !== "admin" && callerProfile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const filePath = path.join(process.cwd(), "_from_zoho", "users.json");
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "users.json not found in _from_zoho/ — run export first" }, { status: 400 });
  }

  const users: ZohoUserRaw[] = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  if (!Array.isArray(users)) {
    return NextResponse.json({ error: "users.json must be a flat array" }, { status: 400 });
  }

  // Pre-build email → hub_users map
  const { data: existingRows } = await adminClient
    .from("hub_users")
    .select("id, email, first_name, last_name, external_id");

  const hubUsersMap = new Map<string, { id: string; first_name: string | null; last_name: string | null; external_id: string | null }>();
  for (const row of existingRows ?? []) {
    if (row.email) hubUsersMap.set(row.email.toLowerCase(), row);
  }

  // Pre-build email → auth.users id map to handle re-runs where auth row exists but hub_users doesn't
  const { data: { users: authUsers } } = await adminClient.auth.admin.listUsers({ perPage: 1000 });
  const authUserMap = new Map<string, string>();
  for (const au of authUsers) {
    if (au.email) authUserMap.set(au.email.toLowerCase(), au.id);
  }

  const result = { imported: 0, updated: 0, skipped: 0, errors: [] as string[] };

  for (const zohoUser of users) {
    const email = zohoUser.email?.toLowerCase();
    if (!email) {
      result.errors.push(`User with no email skipped: ${JSON.stringify(zohoUser.full_name ?? "unknown")}`);
      result.skipped++;
      continue;
    }

    if (zohoUser.role?.name === "Customer" || zohoUser.portal_profile?.name === "Customer") {
      result.skipped++;
      continue;
    }

    const firstName = zohoUser.first_name ?? (zohoUser.full_name?.split(/\s+/)[0] ?? null);
    const combined = `${zohoUser.first_name ?? ""} ${zohoUser.last_name ?? ""}`.trim();
    const lastName = zohoUser.last_name ?? (zohoUser.full_name ? zohoUser.full_name.split(/\s+/).slice(1).join(" ") || null : null);
    const fullName = zohoUser.full_name ?? (combined || null);
    const externalId = zohoUser.zuid ?? null;
    const joinedAt = zohoUser.added_time ?? null;
    const lastActiveAt = zohoUser.last_accessed_on ?? null;
    const status = zohoUser.status ?? "active";
    const costRate = zohoUser.budget?.cost_rate_per_hour?.amount ?? 0;
    const sourceMeta = buildSourceMeta(zohoUser);

    const existing = hubUsersMap.get(email);

    if (existing) {
      // Already in hub_users — update fields
      const [hubErr, profileErr] = await Promise.all([
        adminClient
          .from("hub_users")
          .update({ first_name: firstName, last_name: lastName, external_id: externalId, joined_at: joinedAt, last_active_at: lastActiveAt, status, cost_rate_per_hour: costRate, source_meta: sourceMeta })
          .eq("id", existing.id)
          .then(({ error }) => error),
        adminClient
          .from("profiles")
          .update({ full_name: fullName })
          .eq("id", existing.id)
          .then(({ error }) => error),
      ]);

      if (hubErr || profileErr) {
        const msg = `sync error for ${email}: ${hubErr?.message ?? profileErr?.message ?? "unknown"}`;
        console.error("[zoho-import/users] UPDATE", msg, { hubErr, profileErr });
        result.errors.push(msg);
        result.skipped++;
      } else {
        console.log("[zoho-import/users] updated", email);
        result.updated++;
      }
    } else {
      // Not in hub_users — resolve auth user id (may already exist from a prior import run)
      let authUserId = authUserMap.get(email) ?? null;

      if (authUserId) {
        console.log("[zoho-import/users] auth row already exists, patching hub_users for", email, "id:", authUserId);
      } else {
        // Create auth user silently — no email sent, no password set
        console.log("[zoho-import/users] creating auth user for", email);
        const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
          email,
          email_confirm: true,
          user_metadata: { full_name: fullName, display_name: fullName, first_name: firstName, last_name: lastName },
        });

        if (createErr || !created.user) {
          const msg = `create error for ${email}: ${createErr?.message || createErr?.status || JSON.stringify(createErr) || "unknown"}`;
          console.error("[zoho-import/users] CREATE", msg, createErr);
          result.errors.push(msg);
          result.skipped++;
          continue;
        }

        authUserId = created.user.id;
        console.log("[zoho-import/users] created auth user", email, "id:", authUserId);
      }

      // hub_users row is created by the handle_new_user() trigger — patch fields into it
      const [hubPatchErr, profilePatchErr] = await Promise.all([
        adminClient
          .from("hub_users")
          // role stays NULL, is_invited = false — Super Admin assigns and invites via /admin/hub-users
          .update({ first_name: firstName, last_name: lastName, external_id: externalId, joined_at: joinedAt, last_active_at: lastActiveAt, status, cost_rate_per_hour: costRate, source_meta: sourceMeta, is_invited: false })
          .eq("id", authUserId)
          .then(({ error }) => error),
        adminClient
          .from("profiles")
          .update({ full_name: fullName })
          .eq("id", authUserId)
          .then(({ error }) => error),
      ]);

      if (hubPatchErr || profilePatchErr) {
        const msg = `patch error for ${email}: ${hubPatchErr?.message ?? profilePatchErr?.message ?? "unknown"}`;
        console.error("[zoho-import/users] PATCH", msg, { hubPatchErr, profilePatchErr });
        result.errors.push(msg);
        result.skipped++;
      } else {
        console.log("[zoho-import/users] imported", email, "auth_id:", authUserId);
        result.imported++;
      }
    }
  }

  return NextResponse.json(result);
}
