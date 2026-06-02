# Task 036 — Zoho Portal User: Single-User Lookup by ZPUID or Email

> **Type:** patch
> **Priority:** NORMAL
> **Recommended Model:** haiku
> **Date:** 2026-06-01
> **Status:** TESTING
> **Completed:** 2026-06-01

---

## Goal

Add a `getZohoPortalUser(zpuidOrEmail)` function to `src/lib/zoho/index.ts` that fetches a single portal user by ZPUID or email address via the Zoho Projects v3.1 API, and expose it as an authenticated `GET /api/zoho/portal-users/[userId]` dynamic route.

This complements `getZohoPortalUsers()` (task 035 — list endpoint) with a targeted single-user fetch for assignment flows, user profile display, and Dev dashboard lookups.

---

## Requirements

### Library function (`src/lib/zoho/index.ts`)

- Function: `getZohoPortalUser(zpuidOrEmail: string): Promise<ZohoPortalUser | null>`
- Endpoint: `GET https://projectsapi.zoho.com/api/v3.1/portal/{ZOHO_PORTAL_ID}/users/{zpuidOrEmail}`
- Auth: uses `getZohoAccessToken()` — same pattern as all other Zoho lib functions
- Returns the `ZohoPortalUser` object on success, `null` on any failure (missing env, bad token, non-2xx response)
- No query params — identifier is path-only

### API route (`src/app/api/zoho/portal-users/[userId]/route.ts`)

- `GET /api/zoho/portal-users/[userId]`
- `[userId]` accepts ZPUID (numeric string) or email address
- Session-gated: returns 401 if no user session
- On `null` result from lib function: returns 404 `{ error: "User not found" }`
- On success: returns `{ user: ZohoPortalUser }`
- Logs errors with `[api/zoho/portal-users/[userId]]` prefix

---

## Implementation Steps

1. **Add `getZohoPortalUser` function** — insert after `getZohoPortalUsers` (after line 488 in `src/lib/zoho/index.ts`):

```ts
export async function getZohoPortalUser(
  zpuidOrEmail: string
): Promise<ZohoPortalUser | null> {
  const portalId = process.env.ZOHO_PORTAL_ID;
  if (!portalId) return null;

  const token = await getZohoAccessToken();
  if (!token) return null;

  const res = await fetch(
    `https://projectsapi.zoho.com/api/v3.1/portal/${portalId}/users/${encodeURIComponent(zpuidOrEmail)}`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  );

  if (!res.ok) {
    console.error("[zoho] getZohoPortalUser failed:", res.status, await res.text());
    return null;
  }

  const json = await res.json();
  return (json ?? null) as ZohoPortalUser | null;
}
```

2. **Create API route** — create `src/app/api/zoho/portal-users/[userId]/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getZohoPortalUser } from "@/lib/zoho";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId } = await params;

  try {
    const result = await getZohoPortalUser(userId);
    if (!result) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ user: result });
  } catch (err) {
    console.error("[api/zoho/portal-users/[userId]]", err);
    return NextResponse.json({ error: "Failed to fetch portal user" }, { status: 502 });
  }
}
```

---

## File Changes

| Action | File | Notes |
|--------|------|-------|
| Modify | `src/lib/zoho/index.ts` | Add `getZohoPortalUser` function after `getZohoPortalUsers` |
| Create | `src/app/api/zoho/portal-users/[userId]/route.ts` | Authenticated dynamic GET route |

---

## Code Context

### Existing `ZohoPortalUser` type (zoho/index.ts:124–143) — already defined, reuse as-is
```ts
export type ZohoPortalUser = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  zuid: string;
  status: string;
  user_type: string;
  is_confirmed: boolean;
  is_resend_invite: boolean;
  added_time: string;
  updated_time: string;
  last_accessed_on?: string | null;
  role: { id: string; name: string };
  portal_profile: { id: string; name: string; is_default: boolean };
  reporting_to?: { id: string; full_name: string; first_name: string; last_name: string; zuid: string } | null;
  business_hours?: { id: string; name: string } | null;
  budget?: { cost_per_hour: { currency_code: string; formatted_amount: string; currency_id: string; amount: number } } | null;
};
```

### Existing `getZohoPortalUsers` (zoho/index.ts:456–488) — mirror the v3.1 URL construction and error pattern
```ts
export async function getZohoPortalUsers(
  params: ZohoPortalUsersParams = {}
): Promise<ZohoPortalUsersResponse> {
  const portalId = process.env.ZOHO_PORTAL_ID;
  if (!portalId) return { users: [], page_info: null };

  const token = await getZohoAccessToken();
  if (!token) return { users: [], page_info: null };

  const res = await fetch(
    `https://projectsapi.zoho.com/api/v3.1/portal/${portalId}/users?${query}`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  );
  // ...
}
```

### Existing `portal-users/route.ts` pattern (full file) — follow same auth + error shape:
```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getZohoPortalUsers } from "@/lib/zoho";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // ...
}
```

### Next.js 16 dynamic route params pattern — `params` is a Promise in Next.js 16
```ts
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  const { userId } = await params;
  // ...
}
```

---

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-06-01

### What was built
`getZohoPortalUser(zpuidOrEmail)` lib function and `GET /api/zoho/portal-users/[userId]` dynamic route. Returns a single `ZohoPortalUser` by ZPUID or email, or 404 if not found.

### How to access for testing
- Endpoint: `GET /api/zoho/portal-users/{zpuid}` or `GET /api/zoho/portal-users/{email}` (requires active session)
- Returns `{ user: ZohoPortalUser }` on success, `{ error: "User not found" }` on 404

### Deviations from plan
Medium: Plan used bare `encodeURIComponent(zpuidOrEmail)`. Changed to `.replace('%40', '@')` after Zoho returned `400 INVALID_PARAMETER_VALUE` — the API rejects `%40` in the path and requires literal `@`. Validated in production request during testing.

### Standards check
Pass — no `any` types, guard clauses for `portalId` + `token`, Next.js 16 `params` awaited correctly, error prefix `[api/zoho/portal-users/[userId]]`.

### Convention check
Pass — session auth follows established pattern, `_req` prefix on unused param, no `adminClient`, no LLM calls.

---

## Notes for Implementation Agent

- `ZohoPortalUser` type is already defined in `src/lib/zoho/index.ts` (lines 124–143) from task 035 — do NOT redefine it.
- The Zoho API returns the user object directly at the top level (not nested under a `user` key), so `json` is the user. Cast it to `ZohoPortalUser | null`.
- Use `encodeURIComponent(zpuidOrEmail)` in the URL — email addresses contain `@` which must be percent-encoded.
- In Next.js 16 App Router, dynamic route `params` is a `Promise` and must be `await`ed before destructuring.
- No `logLLMInvocation()` needed — this is a data fetch, not an LLM call.
- No new types needed — all types are already in place from task 035.
