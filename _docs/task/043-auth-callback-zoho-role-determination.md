# Task 043 — Auth Callback: Zoho Portal User Role Determination

> **Type:** enhancement
> **Priority:** HIGH
> **Version Impact:** patch
> **Recommended Model:** sonnet
> **Status:** COMPLETED
> **Completed:** 2026-06-02
> **Implementation Notes:** Created `sync-zoho-role.ts` server action with `determineHubRole()` role logic. Fixed dead code bug in callback page (premature `return` on line 50). Removed `providerToken` dependency. Zoho response is handled defensively (`json?.user ?? json`). Role is only written to `hub_users` when positively determined (admin/pm); NULL leaves existing role intact.
>
> **Post-implementation fix:** Replaced `router.push()` + `router.refresh()` with `window.location.href` for all navigations in the callback page. The push/refresh combination was racing and leaving the browser stuck on the callback URL despite the server completing the redirect. Hard navigation ensures session cookies are read fresh on the destination page and the hash fragment is cleared from the URL.

---

## Problem

`src/app/(auth)/callback/page.tsx` has two issues:

1. **Dead code** — line 50 has `return { userId, providerToken }` inside the `.then()` callback, making the entire Zoho profile fetch block (lines 52–77) unreachable. Zoho profile updates have never run.
2. **Wrong API** — the old fetch to `/api/zoho/user-info` uses the OAuth provider token (from the URL hash) which is only available at callback time and not a reliable server-side pattern. The correct approach is `getZohoPortalUser(email)` from `@/lib/zoho`, which uses the server-side Zoho access token.

## Goal

Replace the dead fetch-based Zoho profile code with a new server action that:
- Calls `getZohoPortalUser(email)` to fetch the user's Zoho portal profile
- Determines the Hub role based on the portal user's role + profile + name
- Updates `hub_users` with `display_name`, `zoho_user_id`, and `role` (when determinable)
- Awaits completion before redirecting to `/dashboard` so role is set before the dashboard RBAC check runs

---

## Requirements

### Role Determination Logic

Evaluate in order (first match wins):

**ADMIN role:**
1. `(displayName.includes("WebriQ") || first_name === "WebriQ") && role.name === "Administrator" && portal_profile.name === "Admin"`
2. `(displayName.includes("Eleazar") || first_name === "Eleazar") && role.name === "Administrator" && portal_profile.name === "Admin"`
3. `(displayName.includes("Philippe") || displayName.includes("Bodart") || first_name === "Philippe") && role.name === "Administrator" && portal_profile.name === "Admin"`
4. `role.name === "Administrator" && portal_profile.name === "Manager"`
5. `role.name === "Manager" && portal_profile.name === "Portal Owner"`

**PM role:**
1. `role.name === "Manager" && portal_profile.name === "Admin"`
2. `role.name === "Administrator" && portal_profile.name === "Admin"` (catch-all for non-named admins)
3. `role.name === "Manager" && portal_profile.name === "Manager"`

**NULL (no change):**
- All other cases, including `role.name === "Employee" && portal_profile.name === "Employee"`
- `dev` role is NEVER auto-assigned — requires explicit Admin action in the Hub
- When NULL: do NOT update `hub_users.role` (preserve existing value, e.g. "pm" from DB trigger or "dev" set by admin)

### hub_users Update Rules

Always update when portal user is found:
- `display_name` → `portal_user.full_name`
- `zoho_user_id` → `portal_user.zuid`

Only update `role` when determined role is `"admin"` or `"pm"` (not NULL).

### Defensive Response Handling

`getZohoPortalUser` currently returns `json` directly, but the Zoho API response is `{ "user": { ... } }`. The server action must handle both shapes:
```ts
const raw = json?.user ?? json;  // defensive: handle both wrapped and flat
```
This is a known bug in the existing function. Task 043 fixes it in the server action layer without modifying `getZohoPortalUser` itself.

---

## Implementation Steps

### Step 1 — Create `src/app/(auth)/sync-zoho-role.ts`

New server action. Called from the callback page after session is established.

```ts
"use server";

import { adminClient } from "@/lib/supabase/admin";
import { getZohoPortalUser } from "@/lib/zoho";

type HubRole = "admin" | "pm" | null;

function determineHubRole(
  portalUser: {
    first_name?: string;
    full_name?: string;
    role?: { name?: string };
    portal_profile?: { name?: string };
  },
  displayName: string
): HubRole {
  const fn = portalUser.first_name ?? "";
  const dn = displayName || portalUser.full_name || "";
  const roleName = portalUser.role?.name ?? "";
  const profileName = portalUser.portal_profile?.name ?? "";

  const isNamedAdmin =
    dn.includes("WebriQ") || fn === "WebriQ" ||
    dn.includes("Eleazar") || fn === "Eleazar" ||
    dn.includes("Philippe") || dn.includes("Bodart") || fn === "Philippe";

  // ADMIN checks
  if (isNamedAdmin && roleName === "Administrator" && profileName === "Admin") return "admin";
  if (roleName === "Administrator" && profileName === "Manager") return "admin";
  if (roleName === "Manager" && profileName === "Portal Owner") return "admin";

  // PM checks
  if (roleName === "Manager" && profileName === "Admin") return "pm";
  if (roleName === "Administrator" && profileName === "Admin") return "pm";
  if (roleName === "Manager" && profileName === "Manager") return "pm";

  return null;
}

export async function syncZohoRole(userId: string, email: string, displayName: string) {
  const json = await getZohoPortalUser(email);
  if (!json) {
    console.warn("[sync-zoho-role] no portal user found for:", email);
    return;
  }

  // Defensive: Zoho API wraps in { user: {...} } but getZohoPortalUser returns json directly
  const portalUser = (json as Record<string, unknown>)?.user
    ? (json as Record<string, unknown>).user as typeof json
    : json;

  if (!portalUser) return;

  const role = determineHubRole(portalUser, displayName);

  const updates: Record<string, unknown> = {
    display_name: portalUser.full_name ?? displayName,
    zoho_user_id: portalUser.zuid ?? null,
  };

  if (role !== null) {
    updates.role = role;
  }

  const { error } = await adminClient
    .from("hub_users")
    .update(updates)
    .eq("id", userId);

  if (error) {
    console.error("[sync-zoho-role] hub_users update error:", error.message);
  } else {
    console.log("[sync-zoho-role] updated role to:", role ?? "(no change)", "for:", email);
  }
}
```

### Step 2 — Update `src/app/(auth)/callback/page.tsx`

Replace the broken Zoho profile block. Key changes:
- Remove `return { userId, providerToken }` (dead code guard)
- Remove the fetch to `/api/zoho/user-info`
- Remove `providerToken` dependency (keep extracting it from hash for backward compat but don't gate on it)
- Import `syncZohoRole` dynamically (same pattern as existing `updateZohoProfile`)
- **Await** `syncZohoRole` before redirecting

New `.then()` body after `setSession`:
```ts
.then(async ({ data, error }) => {
  if (error || !data.session) {
    console.error("[auth/callback] setSession failed:", error?.message);
    router.push("/auth/login?error=oauth_failed");
    return;
  }

  const userId = data.session.user.id;
  const email = data.session.user.email ?? "";
  const displayName = (data.session.user.user_metadata?.display_name as string) ?? "";

  console.log("[auth/callback] session established for:", email);

  try {
    const { syncZohoRole } = await import("@/app/(auth)/sync-zoho-role");
    await syncZohoRole(userId, email, displayName);
  } catch (err) {
    console.warn("[auth/callback] syncZohoRole error:", err);
  }

  router.push("/dashboard");
  router.refresh();
});
```

Remove the `providerToken` variable entirely — it was only used for the old fetch pattern.

---

## File Changes

| File | Action | Notes |
|------|--------|-------|
| `src/app/(auth)/sync-zoho-role.ts` | CREATE | New server action — role determination + hub_users update |
| `src/app/(auth)/callback/page.tsx` | MODIFY | Fix dead code, await syncZohoRole, remove old fetch |
| `src/app/(auth)/update-zoho-profile.ts` | NO CHANGE | Kept for reference; no longer called from callback |

---

## Code Context

### callback/page.tsx — current broken section (lines 36–79)

```ts
supabase.auth
  .setSession({ access_token: accessToken, refresh_token: refreshToken })
  .then(async ({ data, error }) => {
    if (error || !data.session) {
      console.error("[auth/callback] setSession failed:", error?.message);
      router.push("/auth/login?error=oauth_failed");
      return;
    }

    const userId = data.session.user.id;
    const email = data.session.user.email;
    const displayName = data.session.user.user_metadata?.display_name;
    console.log("[auth/callback] session established for:", data.session.user);
    console.log("[auth/callback] session established for:", data.session.user.email);
    return { userId, providerToken };   // ← BUG: makes lines 52–77 dead code
    // Fire-and-forget: ...
    if (providerToken) {               // ← UNREACHABLE
      void (async () => {
        // fetch /api/zoho/user-info ...
      })();
    }

    router.push("/dashboard");         // ← UNREACHABLE
    router.refresh();
  });
```

### update-zoho-profile.ts (existing pattern to follow for server action structure)

```ts
"use server";

import { adminClient } from "@/lib/supabase/admin";

export async function updateZohoProfile(userId, displayName, zuid) {
  await adminClient.from("hub_users").update({ display_name, zoho_user_id }).eq("id", userId);
  await adminClient.auth.admin.updateUserById(userId, { user_metadata: { ... } });
}
```

### getZohoPortalUser signature (src/lib/zoho/index.ts:488)

```ts
export async function getZohoPortalUser(
  zpuidOrEmail: string
): Promise<ZohoPortalUser | null>
```

Uses Zoho Projects API v3.1 with server-side access token. Accepts email or ZPUID.

### hub_users table shape

```ts
{
  id: string;           // Supabase auth user ID
  email: string;
  display_name: string | null;
  role: string;         // "admin" | "pm" | "dev" — default "pm" from DB trigger
  zoho_user_id: string | null;
}
```

---

## Notes for Implementation Agent

- **Model rationale:** Security-sensitive auth/role logic with non-obvious business rules and a dead code bug fix — sonnet required.
- **Do NOT** modify `getZohoPortalUser` in `src/lib/zoho/index.ts` — fix the response shape issue in `sync-zoho-role.ts` only (defensive `json?.user ?? json`).
- **Do NOT** call `updateZohoProfile` from the new flow — `syncZohoRole` supersedes it for the callback path.
- The `"use server"` directive is correct for `sync-zoho-role.ts` — it's a React Server Action called via dynamic import from a client component.
- `providerToken` extraction from the URL hash can be removed entirely — it was only used for the old fetch to `/api/zoho/user-info`.
- **Await** `syncZohoRole` (not fire-and-forget) — role must be persisted before the dashboard RBAC check on redirect.
- Keep the try/catch around `syncZohoRole` so a Zoho API failure never blocks the user from logging in.
- Double `console.log` on lines 48–49 of the current callback is duplicate — remove one.
