# Login Redirect → /v2/dashboard + returnTo Deep-Link Restore

> **Status:** TESTING
> **Priority:** HIGH
> **Type:** enhancement
> **Version Impact:** patch
> **Created:** 2026-06-21
> **Platform:** Web
> **Automation:** manual

## Overview

Two related auth-UX improvements for the v2 flow:

1. **Default post-login landing = `/v2/dashboard`** — confirm/standardize that successful sign-in (email + Zoho SSO) lands on `/v2/dashboard`.
2. **`returnTo` deep-link restore** — when an unauthenticated user opens a protected `/v2` page, the guard redirects them to login *with the original path preserved*. After a successful sign-in they are sent back to that page (falling back to `/v2/dashboard` when no/invalid `returnTo` is present).

Scope: **v2 only** (email/password **and** Zoho SSO). The legacy v0.1 `(auth)`/`(hub)` flow is left untouched.

## Requirements

### Must Have
- [ ] Email/password sign-in defaults to `/v2/dashboard` when no `returnTo` is set.
- [ ] Unauthenticated access to any `/v2/(hub)` page redirects to `/v2/auth/login?returnTo=<original-path+query>`.
- [ ] After successful email login, redirect to the `returnTo` path if present and valid; else `/v2/dashboard`.
- [ ] After successful Zoho SSO login, the same `returnTo` is honored (carried through `/v2/callback`).
- [ ] `returnTo` is validated to prevent open-redirect (must be an internal path starting with `/v2/`).

### Nice to Have
- [ ] Pending-role users (Zoho) still route to `/v2/auth/pending` regardless of `returnTo`.

## Current State

- **`src/app/v2/(auth)/auth/login/page.tsx`** — client component. Email login calls `supabase.auth.signInWithPassword` then `router.push(V2_ROUTES.DASHBOARD)` (already `/v2/dashboard`). Already reads `useSearchParams` (for `error`). Zoho button sets `redirect_to=${origin}/v2/callback`.
- **`src/app/v2/(hub)/layout.tsx`** — server guard. `getClaims()`; if no claims → `redirect("/v2/auth/login")` with **no** returnTo. Has no access to the requested pathname.
- **`src/proxy.ts`** — Supabase session refresh middleware. Does **not** currently expose the request path to server components.
- **`src/app/v2/(auth)/callback/page.tsx`** — OAuth handler. Hardcodes `destination = "/v2/dashboard"` (or `/v2/auth/pending`).
- **`src/config/constants.ts`** — `V2_ROUTES.DASHBOARD = "/v2/dashboard"`, `V2_ROUTES.AUTH_LOGIN = "/v2/auth/login"`.

**Current Files:**
| File | Purpose |
|------|---------|
| `src/app/v2/(auth)/auth/login/page.tsx` | Email + Zoho login form (client) |
| `src/app/v2/(hub)/layout.tsx` | Auth guard for all `/v2` hub pages (server) |
| `src/proxy.ts` | Session refresh middleware |
| `src/app/v2/(auth)/callback/page.tsx` | Zoho OAuth PKCE handler (client) |
| `src/config/constants.ts` | `V2_ROUTES` |

## Proposed Solution

Server Components / layouts in Next 16 cannot read the current pathname directly. Plumb it through a request header set in `proxy.ts`, read it in the hub guard to build `returnTo`, then have the login page (and Zoho callback) honor it.

### Architecture

```
Unauthed → /v2/dashboard/tasks
   │
   ▼  proxy.ts sets request header  x-pathname = "/v2/dashboard/tasks"
   ▼
(hub)/layout.tsx  getClaims() == null
   → redirect /v2/auth/login?returnTo=%2Fv2%2Fdashboard%2Ftasks
   │
   ▼  user signs in (email or Zoho)
   ▼
login page / callback  →  validateReturnTo(returnTo) ?? /v2/dashboard
   → /v2/dashboard/tasks   ✅ original page restored
```

`returnTo` validation: accept only strings that start with `/v2/` (internal, namespaced). Anything else → fall back to `/v2/dashboard`. This blocks `//evil.com`, `https://…`, and cross-app paths.

### File Changes

| Action | File | Description |
|--------|------|-------------|
| MODIFY | `src/proxy.ts` | Forward `x-pathname` request header (path + search) to server components |
| MODIFY | `src/app/v2/(hub)/layout.tsx` | Read `x-pathname` via `headers()`; build `?returnTo=` on login redirect |
| MODIFY | `src/app/v2/(auth)/auth/login/page.tsx` | Read `returnTo` from search params; use it as email-login destination; append to Zoho `redirect_to` |
| MODIFY | `src/app/v2/(auth)/callback/page.tsx` | Read `returnTo` from URL; use as destination (unless pending) |
| CREATE (optional) | helper `safeReturnTo()` | Small inline validator in login page + callback (or shared util) |

## Implementation Steps

### Step 1: Expose the requested path in `proxy.ts`

Forward a `x-pathname` header (path + search) on the request so server components can read it. Preserve the existing Supabase cookie plumbing — pass the modified headers into **every** `NextResponse.next({ request: { headers } })`.

```ts
export async function proxy(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return NextResponse.next({ request });
  }

  // Expose the requested path to server components (auth returnTo deep-link)
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getClaims();
  return supabaseResponse;
}
```

### Step 2: Build `returnTo` in the hub guard

In `src/app/v2/(hub)/layout.tsx`, read the header and append `returnTo` only for in-scope `/v2/` paths.

```ts
import { headers } from "next/headers";
// ...
if (!data?.claims) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const returnTo = pathname.startsWith("/v2/")
    ? `?returnTo=${encodeURIComponent(pathname)}`
    : "";
  redirect(`/v2/auth/login${returnTo}`);
}
```

### Step 3: Honor `returnTo` in the login page

In `src/app/v2/(auth)/auth/login/page.tsx`:

```ts
// Validate: internal /v2/ path only — blocks //evil.com, http(s):// and cross-app paths
function safeReturnTo(value: string | null): string {
  return value && value.startsWith("/v2/") ? value : V2_ROUTES.DASHBOARD;
}
```

Email submit handler:
```ts
const dest = safeReturnTo(searchParams.get("returnTo"));
router.push(dest);
router.refresh();
```

Zoho button — carry `returnTo` through OAuth so the callback can restore it:
```ts
function handleZohoSignIn() {
  const returnTo = searchParams.get("returnTo");
  const callback = returnTo
    ? `${window.location.origin}/v2/callback?returnTo=${encodeURIComponent(returnTo)}`
    : `${window.location.origin}/v2/callback`;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  window.location.href =
    `${supabaseUrl}/auth/v1/authorize?provider=custom%3Azoho&redirect_to=${encodeURIComponent(callback)}`;
}
```

> Note: Supabase requires the exact `redirect_to` URL (incl. query) to be in the project's allowed redirect URL list, or it must match an allowed wildcard (e.g. `…/v2/callback*`). Verify the Supabase Auth → URL Configuration allows the `?returnTo=` variant; if it doesn't, fall back to storing `returnTo` in `sessionStorage` before the redirect and reading it back in the callback.

### Step 4: Honor `returnTo` in the Zoho callback

In `src/app/v2/(auth)/callback/page.tsx`, after `setSession` succeeds, read `returnTo` from the (already-parsed) `params` and use it as the default destination — but keep the pending-role override.

```ts
const returnToParam = params.get("returnTo");
let destination = returnToParam && returnToParam.startsWith("/v2/") ? returnToParam : "/v2/dashboard";
// ...inside syncZohoRole block:
if (!role || role === "pending") destination = "/v2/auth/pending";
```

## Code Examples

See inline snippets in Implementation Steps above.

## Testing Checklist

- [ ] Logged-out, open `/v2/dashboard/tasks` → redirected to `/v2/auth/login?returnTo=%2Fv2%2Fdashboard%2Ftasks`.
- [ ] Email login from that page → lands back on `/v2/dashboard/tasks`.
- [ ] Email login from `/v2/auth/login` (no returnTo) → lands on `/v2/dashboard`.
- [ ] Zoho SSO login with returnTo → lands on the original page (or documented sessionStorage fallback works).
- [ ] Zoho login for a `pending`/no-role user → `/v2/auth/pending` (returnTo ignored).
- [ ] Open-redirect attempt `?returnTo=https://evil.com` and `?returnTo=//evil.com` → falls back to `/v2/dashboard`.
- [ ] Deep path with query string (e.g. `/v2/dashboard/customers?tab=archived`) survives round-trip.
- [ ] `npx tsc --noEmit` clean.

## Dependencies

- Required packages: none
- Required APIs: none (uses existing Supabase auth)
- Blocked by: none

## Notes for Implementation Agent

- **v2 only** — do not touch `(auth)/actions.ts` or `(hub)/layout.tsx` (the non-v2 versions).
- The email login form is a **client component** using `supabase.auth.signInWithPassword` directly (not the `actions.ts` server action). The server action `signIn` already redirects to `/v2/dashboard` but is not the active path for this form — no change needed there.
- Keep Supabase cookie plumbing intact in `proxy.ts`; the only addition is forwarding `x-pathname`. Pass `requestHeaders` into both `NextResponse.next(...)` calls.
- `headers()` is async in Next 16 — `await headers()`.
- Validate `returnTo` with a `startsWith("/v2/")` check in **both** the login page and the callback (defense in depth against open redirects).
- If Supabase's allowed-redirect-URL config rejects the `?returnTo=` query on `/v2/callback`, use the `sessionStorage` fallback noted in Step 3 instead of failing.

## Related

- `_docs/task/043-auth-callback-zoho-role-determination.md` — callback role logic
- `_docs/task/042-rbac-sidebar-and-route-enforcement.md` — route enforcement
