// Admin-only import: reads _from_zoho/users.json, syncs existing hub_users + profiles,
// invites net-new users via adminClient.auth.admin.createUser.
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createHash } from "crypto";
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

// SHA-256 of Zoho's generic default avatar (no custom photo uploaded). Observed byte-identical
// (2001 bytes, image/png) across multiple users on multiple Zoho products (People, Projects/CRM,
// Cliq all serve photos from the same contacts.zoho.com endpoint) — task 288. Used to skip
// importing the placeholder as if it were a real photo.
const ZOHO_DEFAULT_AVATAR_SHA256 = "4521ac8461e45e62a59b56e7e6dbe066e7673ea64fdddaccca333a4862d78457";

// Task 288 follow-up: contacts.zoho.com/file?ID={zuid} turned out to only reach the photo set
// at the Zoho Accounts/Contacts level — Zoho Cliq (and possibly other products) keep a separate,
// independently-uploaded avatar per user under a different internal ID that this endpoint can't
// reach, authenticated or not (confirmed by testing with a live session's own cookies and still
// getting the placeholder for users with real Cliq photos). For the users where this mattered,
// an admin manually downloaded the real photo from their own logged-in browser session into
// _from_zoho/user_photos/{name}.png (or "{name} ({email}).png" for the two users who share a
// full_name — Dannea Moneva and Philippe Bodart both have two Zoho accounts). This directory
// takes priority over the live fetch below; the live fetch remains as a fallback for anyone not
// covered by a local file (it's still correct for users whose real photo IS at the Accounts
// level, and for genuinely photo-less users the placeholder-hash check below still applies).
const USER_PHOTOS_DIR = path.join(process.cwd(), "_from_zoho", "user_photos");

type LocalPhotoEntry = { name: string; email: string | null; filePath: string };

function loadLocalPhotoIndex(): LocalPhotoEntry[] {
  if (!fs.existsSync(USER_PHOTOS_DIR)) return [];

  return fs
    .readdirSync(USER_PHOTOS_DIR)
    .filter((file) => file.toLowerCase().endsWith(".png"))
    .map((file) => {
      const base = file.slice(0, -4); // strip ".png"
      const match = base.match(/^(.*?)\s*\(([^)]+)\)$/); // "Name (email)"
      return match
        ? { name: match[1].trim(), email: match[2].trim().toLowerCase(), filePath: path.join(USER_PHOTOS_DIR, file) }
        : { name: base.trim(), email: null, filePath: path.join(USER_PHOTOS_DIR, file) };
    });
}

// Only trust a plain "{name}.png" file (no email disambiguator) when that full_name is unique
// across the whole roster — otherwise two same-named users (Dannea Moneva, Philippe Bodart)
// could silently both match the same file.
function resolveLocalPhotoPath(
  index: LocalPhotoEntry[],
  fullNameCounts: Map<string, number>,
  fullName: string | null,
  email: string
): string | null {
  if (!fullName) return null;

  const byEmail = index.find((e) => e.email === email.toLowerCase());
  if (byEmail) return byEmail.filePath;

  if ((fullNameCounts.get(fullName) ?? 0) > 1) return null; // ambiguous without an email match

  const byName = index.find((e) => e.email === null && e.name === fullName);
  return byName ? byName.filePath : null;
}

// contacts.zoho.com/file?ID={zuid}&fs=thumb is an undocumented but unauthenticated endpoint —
// confirmed working with no OAuth token or session cookie across Zoho People/Projects/CRM/Cliq.
// The `ID` param is the same zuid already captured as hub_users.external_id. Deliberately NOT
// routed through fetchZohoWithRetry (@/lib/zoho) — that helper always attaches an
// `Authorization: Zoho-oauthtoken` header for projectsapi.zoho.com/Desk calls, which this
// different host neither needs nor expects.
async function fetchAndStoreAvatar(zuid: string | null, profileId: string, localPhotoPath: string | null): Promise<string | null> {
  try {
    let buffer: Buffer;

    if (localPhotoPath) {
      buffer = fs.readFileSync(localPhotoPath); // manually curated — no placeholder check needed
    } else {
      if (!zuid) return null;

      const res = await fetch(`https://contacts.zoho.com/file?ID=${encodeURIComponent(zuid)}&fs=thumb`, {
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return null;

      buffer = Buffer.from(await res.arrayBuffer());

      const hash = createHash("sha256").update(buffer).digest("hex");
      if (hash === ZOHO_DEFAULT_AVATAR_SHA256) return null; // no real photo uploaded
    }

    const storagePath = `${profileId}.png`;
    const { error: uploadError } = await adminClient.storage
      .from("user-avatars")
      .upload(storagePath, buffer, { contentType: "image/png", upsert: true });

    if (uploadError) {
      console.error("[zoho-import/users] avatar upload error for", profileId, uploadError);
      return null;
    }

    const { data: { publicUrl } } = adminClient.storage.from("user-avatars").getPublicUrl(storagePath);
    return publicUrl;
  } catch (err) {
    console.error("[zoho-import/users] avatar fetch error for zuid", zuid, err);
    return null;
  }
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

  const localPhotoIndex = loadLocalPhotoIndex();
  const fullNameCounts = new Map<string, number>();
  for (const u of users) {
    if (u.full_name) fullNameCounts.set(u.full_name, (fullNameCounts.get(u.full_name) ?? 0) + 1);
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

  const result = { imported: 0, updated: 0, skipped: 0, avatarsImported: 0, avatarsSkipped: 0, errors: [] as string[] };

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
      const localPhotoPath = resolveLocalPhotoPath(localPhotoIndex, fullNameCounts, zohoUser.full_name ?? null, email);
      const avatarUrl = await fetchAndStoreAvatar(externalId, existing.id, localPhotoPath);
      if (avatarUrl) result.avatarsImported++;
      else result.avatarsSkipped++;

      const [hubErr, profileErr] = await Promise.all([
        adminClient
          .from("hub_users")
          .update({ first_name: firstName, last_name: lastName, external_id: externalId, joined_at: joinedAt, last_active_at: lastActiveAt, status, cost_rate_per_hour: costRate, source_meta: sourceMeta })
          .eq("id", existing.id)
          .then(({ error }) => error),
        adminClient
          .from("profiles")
          .update({ full_name: fullName, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) })
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
      const localPhotoPath = resolveLocalPhotoPath(localPhotoIndex, fullNameCounts, zohoUser.full_name ?? null, email);
      const avatarUrl = await fetchAndStoreAvatar(externalId, authUserId, localPhotoPath);
      if (avatarUrl) result.avatarsImported++;
      else result.avatarsSkipped++;

      const [hubPatchErr, profilePatchErr] = await Promise.all([
        adminClient
          .from("hub_users")
          // role stays NULL, is_invited = false — Super Admin assigns and invites via /admin/hub-users
          .update({ first_name: firstName, last_name: lastName, external_id: externalId, joined_at: joinedAt, last_active_at: lastActiveAt, status, cost_rate_per_hour: costRate, source_meta: sourceMeta, is_invited: false })
          .eq("id", authUserId)
          .then(({ error }) => error),
        adminClient
          .from("profiles")
          .update({ full_name: fullName, ...(avatarUrl ? { avatar_url: avatarUrl } : {}) })
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
