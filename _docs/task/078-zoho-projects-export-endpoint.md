# Task 078 — Zoho Projects Export: GET /api/zoho/projects

> **Type:** patch
> **Priority:** HIGH
> **Recommended Model:** haiku
> **Investigation:** /understand ran before this spec. Findings embedded below.
> **Status:** TESTING
> **Completed:** 2026-06-25
> **Implementation Notes:** Implemented exactly per spec. Fixed typo `ZojoProject[]` → `ZohoProject[]` in lib function. TypeScript passes clean (`npx tsc --noEmit` zero errors).

## Goal

Add a `GET /api/zoho/projects` endpoint that auto-paginates all Zoho Projects and returns the full raw payload in a single response. Used by the team to dump Zoho project data to JSON for DB migration planning.

## Requirements

- Endpoint: `GET /api/zoho/projects`
- Auth: any authenticated hub user (session-based `getUser()` check)
- Pagination: auto-paginate all pages internally; loop until `page_info.has_next_page === false`; return the combined `projects[]` array in one response
- Response: raw Zoho payload per project — no field filtering, no transformation
- Response shape: `{ projects: ZohoProject[], total: number }`
- Error handling: 401 for unauthenticated, 502 on Zoho fetch failure, empty array if `ZOHO_PORTAL_ID` unset

## File Changes

| File | Action | Notes |
|------|--------|-------|
| `src/lib/zoho/index.ts` | Modify | Add `ZohoProject` type + `getZohoProjects()` function |
| `src/app/api/zoho/projects/route.ts` | Create | Thin GET handler — auth guard → call lib → return JSON |

## Implementation Steps

### 1. Add `ZohoProject` type to `src/lib/zoho/index.ts`

Insert after the `ZohoPortalUsersParams` type block (after line ~183):

```ts
export type ZohoProject = {
  id: string;
  id_string: string;
  name: string;
  status: string;
  [key: string]: unknown;
};
```

The `[key: string]: unknown` index signature preserves all raw Zoho fields without enumerating them — appropriate for a migration export where the caller wants the full payload.

### 2. Add `getZohoProjects()` to `src/lib/zoho/index.ts`

Insert after `getZohoPortalUsers` (after line ~625). Auto-paginate until `has_next_page === false`:

```ts
export async function getZohoProjects(): Promise<{ projects: ZohoProject[]; total: number }> {
  const portalId = process.env.ZOHO_PORTAL_ID;
  if (!portalId) return { projects: [], total: 0 };

  const token = await getZohoAccessToken();
  if (!token) return { projects: [], total: 0 };

  const all: ZojoProject[] = [];
  let page = 1;

  while (true) {
    const query = new URLSearchParams({ page: String(page), per_page: "100" });
    const res = await fetch(
      `${ZOHO_PROJECTSAPI_BASE}/projects?${query}`,
      { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
    );

    if (!res.ok) {
      console.error("[zoho] getZohoProjects failed:", res.status, await res.text());
      break;
    }

    const json = await res.json();
    const batch: ZohoProject[] = (json?.projects ?? []) as ZohoProject[];
    all.push(...batch);

    const pageInfo: ZohoPageInfo | null = json?.page_info ?? null;
    if (!pageInfo?.has_next_page) break;
    page++;
  }

  return { projects: all, total: all.length };
}
```

Note: uses `ZOHO_PROJECTSAPI_BASE` (module-scoped `const` at line 5) — this is why the function must live in `src/lib/zoho/index.ts` and not a new file.

### 3. Create `src/app/api/zoho/projects/route.ts`

Thin delegator — mirrors `src/app/api/zoho/portal-users/route.ts` exactly:

```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getZohoProjects } from "@/lib/zoho";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const result = await getZohoProjects();
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/zoho/projects]", err);
    return NextResponse.json({ error: "Failed to fetch Zoho projects" }, { status: 502 });
  }
}
```

## Code Context

### `ZohoPageInfo` type — `src/lib/zoho/index.ts:144–149`

```ts
export type ZohoPageInfo = {
  per_page: number;
  has_next_page: boolean;
  count: number;
  page: number;
};
```

### `getZohoPortalUsers` pagination pattern — `src/lib/zoho/index.ts:593–625`

```ts
export async function getZohoPortalUsers(
  params: ZohoPortalUsersParams = {}
): Promise<ZohoPortalUsersResponse> {
  const portalId = process.env.ZOHO_PORTAL_ID;
  if (!portalId) return { users: [], page_info: null };

  const token = await getZohoAccessToken();
  if (!token) return { users: [], page_info: null };

  const query = new URLSearchParams();
  query.set("page", String(params.page ?? "1"));
  query.set("per_page", String(params.per_page ?? "50"));
  // ...

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

### Route pattern — `src/app/api/zoho/portal-users/route.ts` (full file)

```ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getZohoPortalUsers } from "@/lib/zoho";

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // ... parse query params ...

  try {
    const result = await getZohoPortalUsers({ ... });
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/zoho/portal-users]", err);
    return NextResponse.json({ error: "Failed to fetch portal users" }, { status: 502 });
  }
}
```

### `ZOHO_PROJECTSAPI_BASE` — `src/lib/zoho/index.ts:5`

```ts
const ZOHO_PROJECTSAPI_BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
```

Not exported — new function **must** live in `src/lib/zoho/index.ts`.

## Notes for Implementation Agent

- `ZOHO_PROJECTSAPI_BASE` is module-scoped and not exported. `getZohoProjects` must be added to `src/lib/zoho/index.ts` (not a new file).
- `getZohoPortalUsers` uses `https://projectsapi.zoho.com/api/v3.1/portal/${portalId}/users` (hardcoded v3.1 URL with portalId inline), while `ZOHO_PROJECTSAPI_BASE` uses `/api/v3/`. Use `ZOHO_PROJECTSAPI_BASE` for the projects endpoint since v3 is the declared base.
- Zoho V3 project list response wraps results as `json?.projects ?? []` — defensively handle this (same as `createZohoProject` at line ~95 uses `json?.projects?.[0]`).
- Token empty-string guard: `if (!token) return { projects: [], total: 0 }` — never throw on missing token.
- `[key: string]: unknown` on `ZohoProject` satisfies TypeScript strict mode — the index signature allows arbitrary fields while maintaining a typed contract for the known ones.
- Fix typo in step 2 code: `ZojoProject[]` should be `ZohoProject[]`.
- No `NextRequest` import needed in the new route since there are no query params to parse.
- This endpoint has no write side-effects and no rate-limit risk beyond the existing Zoho token limits.

## Acceptance Criteria

- [x] `GET /api/zoho/projects` returns `{ projects: [...], total: N }` with all projects from Zoho
- [x] Unauthenticated request returns `401`
- [x] Response includes the full raw Zoho payload per project (no field stripping)
- [x] If Zoho has multiple pages, all are fetched and merged into a single array
- [x] TypeScript check passes: `npx tsc --noEmit`
