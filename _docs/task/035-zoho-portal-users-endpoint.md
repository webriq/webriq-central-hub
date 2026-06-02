# Task 035 — Zoho Portal Users: Library Function + API Endpoint

> **Type:** patch
> **Priority:** NORMAL
> **Recommended Model:** haiku
> **Date:** 2026-06-01
> **Status:** TESTING
> **Completed:** 2026-06-01

---

## Goal

Add a `getZohoPortalUsers()` function to `src/lib/zoho/index.ts` that calls the Zoho Projects v3.1 portal users endpoint, and expose it via an authenticated `GET /api/zoho/portal-users` route.

This surfaces rich user details (role, profile, reporting_to, budget, status, etc.) for use in the Dev dashboard, assignment flows, and any future admin UI.

---

## Requirements

### Library function (`src/lib/zoho/index.ts`)

- Function: `getZohoPortalUsers(params?: ZohoPortalUsersParams): Promise<ZohoPortalUsersResponse>`
- Endpoint: `https://projectsapi.zoho.com/api/v3.1/portal/{ZOHO_PORTAL_ID}/users`
- Auth: uses `getZohoAccessToken()` — same pattern as all other Zoho lib functions
- Params (all optional, forwarded as query string):
  - `type` — default `"portal_user"`
  - `view_type` — default `"active"`
  - `page` — default `"1"`
  - `per_page` — default `"50"` (Zoho max)
  - `filter` — JSON object stringified as query param
  - `sort_by` — e.g. `"ASC(first_name)"`
- Returns `{ users: ZohoPortalUser[], page_info: ZohoPageInfo }`; returns `{ users: [], page_info: null }` on failure

### API route (`src/app/api/zoho/portal-users/route.ts`)

- `GET /api/zoho/portal-users`
- Session-gated: calls `createClient()` from `@/lib/supabase/server`, returns 401 if no user
- Reads query params from `request.nextUrl.searchParams` and forwards them to `getZohoPortalUsers()`
- Returns the response JSON directly
- Logs errors with `[api/zoho/portal-users]` prefix

### New types (add to `src/lib/zoho/index.ts`)

```ts
export type ZohoPageInfo = {
  per_page: number;
  has_next_page: boolean;
  count: number;
  page: number;
};

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

export type ZohoPortalUsersResponse = {
  users: ZohoPortalUser[];
  page_info: ZohoPageInfo | null;
};

export type ZohoPortalUsersParams = {
  type?: string;
  view_type?: string;
  page?: string | number;
  per_page?: string | number;
  filter?: Record<string, unknown>;
  sort_by?: string;
};
```

---

## Implementation Steps

1. **Add types** — insert the four new types above into `src/lib/zoho/index.ts` after the existing `ZohoTimeLog` type (around line 115)

2. **Add `getZohoPortalUsers` function** — add after `getZohoProjectUsers` (after line 377):

```ts
export async function getZohoPortalUsers(
  params: ZohoPortalUsersParams = {}
): Promise<ZohoPortalUsersResponse> {
  const portalId = process.env.ZOHO_PORTAL_ID;
  if (!portalId) return { users: [], page_info: null };

  const token = await getZohoAccessToken();
  if (!token) return { users: [], page_info: null };

  const query = new URLSearchParams();
  query.set("type", (params.type ?? "portal_user"));
  query.set("view_type", (params.view_type ?? "active"));
  query.set("page", String(params.page ?? "1"));
  query.set("per_page", String(params.per_page ?? "50"));
  if (params.filter) query.set("filter", JSON.stringify(params.filter));
  if (params.sort_by) query.set("sort_by", params.sort_by);

  const res = await fetch(
    `https://projectsapi.zoho.com/api/v3.1/portal/${portalId}/users?${query}`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  );

  if (!res.ok) {
    console.error("[zoho] getZohoPortalUsers failed:", res.status, await res.text());
    return { users: [], page_info: null };
  }

  const json = await res.json();
  return {
    users: (json?.users ?? []) as ZohoPortalUser[],
    page_info: (json?.page_info ?? null) as ZohoPageInfo | null,
  };
}
```

3. **Create API route** — create `src/app/api/zoho/portal-users/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getZohoPortalUsers } from "@/lib/zoho";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sp = req.nextUrl.searchParams;

  const filterRaw = sp.get("filter");
  let filter: Record<string, unknown> | undefined;
  if (filterRaw) {
    try { filter = JSON.parse(filterRaw); } catch { /* ignore malformed filter */ }
  }

  try {
    const result = await getZohoPortalUsers({
      type: sp.get("type") ?? undefined,
      view_type: sp.get("view_type") ?? undefined,
      page: sp.get("page") ?? undefined,
      per_page: sp.get("per_page") ?? undefined,
      sort_by: sp.get("sort_by") ?? undefined,
      filter,
    });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/zoho/portal-users]", err);
    return NextResponse.json({ error: "Failed to fetch portal users" }, { status: 502 });
  }
}
```

---

## File Changes

| Action | File | Notes |
|--------|------|-------|
| Modify | `src/lib/zoho/index.ts` | Add 4 types + `getZohoPortalUsers` function |
| Create | `src/app/api/zoho/portal-users/route.ts` | Authenticated GET route |

---

## Code Context

### Existing v3 base constant (zoho/index.ts:5)
```ts
const ZOHO_PROJECTSAPI_BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
```
The new function uses v3.1 — construct the URL inline, do not extend or reuse this constant.

### Existing getZohoProjectUsers pattern (zoho/index.ts:354–377) — mirror this structure
```ts
export async function getZohoProjectUsers(projectId: string): Promise<Record<string, string>> {
  const token = await getZohoAccessToken();
  if (!token) return {};
  const res = await fetch(`${ZOHO_PROJECTSAPI_BASE}/projects/${projectId}/users`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  });
  if (!res.ok) {
    console.error("[zoho] getZohoProjectUsers failed:", res.status, await res.text());
    return {};
  }
  const json = await res.json();
  const raw: Array<Record<string, unknown>> = json?.users ?? [];
  return Object.fromEntries(
    raw.filter((u) => u.email && u.id).map((u) => [(u.email as string).toLowerCase(), u.id as string])
  );
}
```

### Auth pattern for API route (api/zoho/route.ts:23–26)
```ts
const supabase = await createClient();
const { data: { user } } = await supabase.auth.getUser();
if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
```

---

## Implementation Notes

> **Simplify Review:** PASS
> **Reviewed:** 2026-06-01

### What was built
`getZohoPortalUsers()` lib function and `GET /api/zoho/portal-users` route. Returns paginated list of Zoho portal users with role, profile, reporting_to, budget, and status fields.

### How to access for testing
- Endpoint: `GET /api/zoho/portal-users` (requires active session)
- Optional params: `type`, `view_type`, `page`, `per_page`, `sort_by`, `filter` (JSON string)

### Deviations from plan
Minor: Two stray comments (`// Returns all portal users...` / `// Returns email → zpuid map...`) and an inline `// add this` spec artifact were left on the pre-existing `getZohoProjectUsers` function. Cleaned up during simplify review.

### Standards check
Pass — no `any` types, early returns, single responsibility, proper error prefix `[zoho]`.

### Convention check
Pass — uses `createClient()` from server, auth guard pattern matches `api/zoho/route.ts`, `getZohoAccessToken()` pattern followed, no hardcoded model IDs, no LLM calls so no `logLLMInvocation()` needed.

---

## Notes for Implementation Agent

- The v3.1 endpoint is distinct from `ZOHO_PROJECTSAPI_BASE` (which is v3). Construct the full URL inline in `getZohoPortalUsers` — do not touch the existing constant.
- `getZohoPortalUsers` does not take `portalId` as a parameter (unlike `getMyZohoTasks` / `getUnassignedZohoTasks`) — it reads `ZOHO_PORTAL_ID` directly from env, consistent with `getZohoProjectUsers`.
- The `filter` query param must be JSON-stringified before appending to `URLSearchParams`.
- `per_page` defaults to 50 (Zoho's max for this endpoint per the docs).
- No `logLLMInvocation()` needed — this is a data fetch, not an LLM call.
- TypeScript strict mode is on — all fields typed as shown; use `?` for optional fields.
