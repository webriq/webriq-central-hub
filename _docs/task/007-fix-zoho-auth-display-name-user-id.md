# Task 007 — Fix Zoho Auth: Display Name & Zoho User ID

> **Version Impact:** patch
> **Recommended Model:** balanced
> **Sprint:** 1.1 — Auth Layer (post-release fix)
> **Status:** COMPLETED
> **Completed:** 2026-05-15
> **CORS Fix:** 2026-05-15

---

## Summary

Fix three defects + one CORS regression in the Zoho OAuth sign-in flow from Task 006:
1. `hub_users.display_name` was always `NULL` for Zoho users
2. `hub_users.zoho_user_id` was always `NULL` (wrong metadata field)
3. Supabase Auth Dashboard "Display Name" column was empty for all users
4. **CORS:** Browser blocked direct `fetch()` to `https://accounts.zoho.com/oauth/user/info`

The root cause: Zoho's OIDC response does not include `full_name`, `name`, or `display_name` claims. The actual display name is only available through Zoho's `/oauth/user/info` endpoint, which requires the user's `provider_token` from the OAuth callback. This endpoint does not return CORS headers, so it cannot be called from the browser.

---

## Requirements

- [x] `hub_users.zoho_user_id` populated with clean ZUID (extracted from `sub` claim)
- [x] `hub_users.display_name` populated on Zoho login with real name from Zoho API
- [x] Supabase Auth Dashboard shows correct Display Name for all users
- [x] Email-first/Zoho-later users get updated when they link Zoho
- [x] Existing users backfilled with corrected data
- [x] Callback page must not block redirect (fire-and-forget Zoho API call)

---

## Root Cause Analysis

| Defect | Cause |
|--------|-------|
| `zoho_user_id` always NULL | Trigger read `raw_user_meta_data->>'provider_id'` — field does not exist. Zoho sends user ID in `sub`: `"{ZUID}.{identifier}"` |
| `display_name` always NULL | Zoho OIDC sends only: `aud`, `exp`, `iat`, `iss`, `sub`, `email`, `email_verified`, `phone_verified`. No name fields. |
| Email-first/Zoho-later never updated | Trigger was `AFTER INSERT` only. Linking Zoho to existing account is an `UPDATE` on `auth.users`. |
| Auth Dashboard empty | `auth.users.raw_user_meta_data` never received name data from Zoho. |
| **CORS block on Zoho API** | `https://accounts.zoho.com/oauth/user/info` does not return `Access-Control-Allow-Origin` headers. Browser blocks client-side `fetch()`. Fixed by proxying through a Next.js API route (`/api/zoho/user-info`) which calls Zoho server-side. |
| **Callback stuck on "Completing sign-in"** | `await fetch(...)` inside the `async` `.then()` callback blocked `router.push("/")` until the Zoho API call completed. Fixed by wrapping the fetch in an async IIFE (`void (async () => { ... })()`) so the redirect fires immediately. |

Zoho `/oauth/user/info` returns the real profile (tested with Brandon's token):
```json
{"First_Name":"Brandon Dwite","Email":"brandondwite.cobacha@webriq.services","Last_Name":"Cobacha","Display_Name":"Brandon Dwite Cobacha","ZUID":908075526}
```

---

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/008_fix_hub_users_trigger.sql` | Create | Corrected trigger: extract ZUID from `sub`, add email-prefix fallback for `display_name`, add `AFTER UPDATE` trigger, backfill existing rows |
| `src/app/(auth)/callback/page.tsx` | Modify | Parse `provider_token` from URL hash, call Zoho `/oauth/user/info`, fire-and-forget update to `hub_users` + `auth.users` |
| `src/app/(auth)/update-zoho-profile.ts` | Create | Server action: updates `hub_users.display_name`/`zoho_user_id` and `auth.users.raw_user_meta_data` via admin client |
| `src/app/(auth)/sync-hub-user.ts` | Create | Server action: safety-net sync for hub_users row after Zoho login (fills NULL display_name and zoho_user_id) |
| `src/app/(auth)/signup/page.tsx` | Modify | Send `full_name` in metadata (in addition to `display_name`) so trigger picks it up for email signups |
| `src/app/api/zoho/user-info/route.ts` | **Create** | **CORS fix**: API route that proxies `GET` requests to `https://accounts.zoho.com/oauth/user/info` server-side, avoiding browser CORS block |

---

## CORS Fix — API Route Proxy

The original implementation called `https://accounts.zoho.com/oauth/user/info` directly from the browser, which failed with:

```
Access to fetch at 'https://accounts.zoho.com/oauth/user/info' from origin 'http://localhost:3000'
has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present.
```

**Solution**: A Next.js API route handler (`src/app/api/zoho/user-info/route.ts`) acts as a server-side proxy:

```typescript
// src/app/api/zoho/user-info/route.ts
export async function GET(request: Request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) {
    return NextResponse.json({ error: "Missing Authorization header" }, { status: 401 });
  }
  const zohoRes = await fetch("https://accounts.zoho.com/oauth/user/info", {
    headers: { Authorization: authHeader },
  });
  const data = await zohoRes.json();
  return NextResponse.json(data, { status: zohoRes.ok ? 200 : zohoRes.status });
}
```

The client calls `/api/zoho/user-info` (same-origin, no CORS), and the server forwards to Zoho (server-to-server, no CORS).

### Why not Next.js `rewrites`?

A `rewrites` proxy in `next.config.ts` was attempted but caused the `fetch()` call to hang indefinitely, blocking the redirect. An explicit API route handler is more reliable because:
- It gives full control over request/response handling
- It properly forwards the `Authorization` header
- It handles Zoho error responses gracefully

### Callback redirect fix

The Zoho fetch was moved into a **fire-and-forget async IIFE** so `router.push("/")` fires immediately:

```typescript
// Fire-and-forget: fetch Zoho profile in background so redirect isn't blocked
if (providerToken) {
  void (async () => {
    try {
      const zohoRes = await fetch("/api/zoho/user-info", {
        headers: { Authorization: `Bearer ${providerToken}` },
      });
      if (zohoRes.ok) {
        const profile = await zohoRes.json();
        const displayName = profile.Display_Name ?? "";
        const zuid = String(profile.ZUID ?? "");
        if (displayName) {
          const { updateZohoProfile } = await import(
            "@/app/(auth)/update-zoho-profile"
          );
          await updateZohoProfile(userId, displayName, zuid);
        }
      }
    } catch (err) {
      console.warn("[auth/callback] Zoho fetch error:", err);
    }
  })();
}

router.push("/");  // ← fires immediately, Zoho sync runs in background
router.refresh();
```

**Key changes from original:**
1. URL changed from `https://accounts.zoho.com/oauth/user/info` → `/api/zoho/user-info` (CORS fix)
2. Wrapped in `void (async () => { ... })()` (non-blocking IIFE — redirect fires immediately)
3. All error handling remains within the IIFE so the redirect path is never affected

---

## Code Context

### Migration: `supabase/migrations/008_fix_hub_users_trigger.sql`

Key changes in the corrected `handle_new_hub_user()` function:
```sql
-- zoho_user_id: extract ZUID from OIDC sub claim ("{ZUID}.{identifier}")
v_zoho_user_id := split_part(new.raw_user_meta_data->>'sub', '.', 1);

-- display_name: try Zoho name fields, then email signup fields, then email prefix
v_display_name := coalesce(
  new.raw_user_meta_data->>'full_name',
  new.raw_user_meta_data->>'name',
  new.raw_user_meta_data->>'display_name',
  split_part(new.email, '@', 1)
);
```

New `ON CONFLICT DO UPDATE` ensures the trigger works for both INSERT and UPDATE:
```sql
on conflict (id) do update set
  email        = excluded.email,
  display_name = coalesce(hub_users.display_name, excluded.display_name),
  zoho_user_id = coalesce(hub_users.zoho_user_id, excluded.zoho_user_id),
  updated_at   = now();
```

New `AFTER UPDATE` trigger catches Zoho linking to existing accounts:
```sql
create trigger on_auth_user_updated
  after update of raw_user_meta_data on auth.users
  for each row
  when (old.raw_user_meta_data is distinct from new.raw_user_meta_data)
  execute procedure public.handle_new_hub_user();
```

### Callback page: `src/app/(auth)/callback/page.tsx` (original pre-CORS-fix)

The critical change — after `setSession`, parse `provider_token` from the URL hash and call Zoho's API for the real name. **Note:** This code was later updated for CORS — see [CORS Fix](#cors-fix--api-route-proxy) above for the current implementation.
```typescript
const providerToken = hashParams.get("provider_token");

if (providerToken) {
  // Fetch real display name from Zoho (fire-and-forget — never blocks redirect)
  fetch("https://accounts.zoho.com/oauth/user/info", {
    headers: { Authorization: `Bearer ${providerToken}` }
  })
  .then(res => res.json())
  .then(profile => {
    // Fire server action to update hub_users + auth.users
    updateZohoProfile(userId, profile.Display_Name, String(profile.ZUID));
  });
}

router.push("/");  // ← immediate, not after Zoho API
```

### Server action: `src/app/(auth)/update-zoho-profile.ts`

Uses admin client to update both tables:
```typescript
"use server";
import { adminClient } from "@/lib/supabase/admin";

export async function updateZohoProfile(userId, displayName, zuid) {
  // 1. Update hub_users
  await adminClient.from("hub_users").update({
    display_name: displayName, zoho_user_id: zuid
  }).eq("id", userId);

  // 2. Update auth.users.raw_user_meta_data (shows in Auth Dashboard)
  await adminClient.auth.admin.updateUserById(userId, {
    user_metadata: { full_name: displayName, name: displayName, display_name: displayName }
  });
}
```

### Signup fix: `src/app/(auth)/signup/page.tsx:117`

```diff
- options: { data: { display_name: name.trim() } }
+ options: { data: { full_name: name.trim(), display_name: name.trim() } }
```

---

## Implementation Steps

1. Create migration `008_fix_hub_users_trigger.sql`
2. Apply migration to Supabase via Management API (backfills existing users)
3. Create `update-zoho-profile.ts` server action
4. Create `sync-hub-user.ts` server action (safety net)
5. **Create `/api/zoho/user-info` API route** — server-side proxy for Zoho `/oauth/user/info` (CORS fix)
6. Update callback page: parse `provider_token`, call `/api/zoho/user-info` in async IIFE, update profile
7. Fix signup page to send `full_name` in metadata
8. Backfill auth.users `raw_user_meta_data` for all users (admin API)
9. Verify: TypeScript compiles, hub_users has data, Auth Dashboard shows names, redirect is instant

---

## Acceptance Criteria

- [x] `hub_users.zoho_user_id` contains clean ZUID (not compound `sub`)
- [x] `hub_users.display_name` is populated for all users (real name from Zoho, or capitalized email prefix)
- [x] Supabase Auth Dashboard "Display Name" column shows name for all users
- [x] New Zoho signup → both fields populated by DB trigger
- [x] Email user links Zoho later → updated by `AFTER UPDATE` trigger
- [x] Every Zoho login → callback fetches real name from Zoho (fire-and-forget)
- [x] Callback redirect is never blocked by Zoho API call
- [x] `npm run build` succeeds with zero TypeScript errors

---

## Verification

```bash
# Check hub_users
npx tsx -e "import {createClient} from '@supabase/supabase-js'; ..."

# Check auth.users via Supabase Dashboard: Authentication → Users → Display Name column

# Test full flow: Sign out → Sign in with Zoho → Should redirect to / immediately
# → Check hub_users.display_name → Check Auth Dashboard Display Name
```

---

## Compatibility

- No new dependencies
- One new API route (`/api/zoho/user-info`) — additive, does not conflict with existing `/api/zoho` POST handler
- Migration is additive (drops old trigger, creates corrected version)
- Existing email/password flow unchanged
- The DB trigger fallback (`split_part(email, '@', 1)`) ensures display_name is never NULL even without Zoho API
- **CORS architecture**: Browser → same-origin `/api/zoho/user-info` → Next.js server → Zoho API (no browser CORS involved)
