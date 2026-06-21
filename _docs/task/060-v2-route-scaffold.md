# Task 060 — v2 Route Scaffold (Sprint 0A Foundation)

> **Status:** TESTING
> **Completed:** 2026-06-11
> **Implementation Notes:** All 26 files created. `npx tsc --noEmit` passes with zero errors in source files (3 pre-existing `.next/` cache errors for a deleted `zoho-projects` route — unrelated to this task). v2 routes are accessible at `/v2/auth/login`, `/v2/auth/signup`, `/v2/callback`, and all hub routes at `/v2/*`. Zoho OAuth points to `/v2/callback`. All v0.1 routes untouched.

> **Type:** feature
> **Priority:** CRITICAL
> **Recommended Model:** sonnet
> **Version Impact:** minor

## Notes for Implementation Agent

- Use sonnet: this spans 20+ files across the full route architecture, auth flow, and requires careful judgment on what to clone vs. share. Wrong redirect paths will silently break auth.
- The existing `(auth)`, `(hub)`, `(public)` route groups remain **completely untouched**. v0.1 routes must continue to work at their current URLs throughout.
- API routes (`src/app/api/`) are **shared** — no cloning needed. Both v0.1 and v2 pages call the same endpoints.
- Shared components in `src/components/` are **shared** — no cloning.
- The `sync-zoho-role.ts`, `sync-hub-user.ts`, and `update-zoho-profile.ts` utility modules can be imported from their original path (`@/app/(auth)/...`) in the v2 callback page — they contain no redirects, only Supabase logic.
- Public onboarding stays at `/onboard/[customerId]` — customers access via tokenized links; do not clone.
- Hub pages for this sprint are **stubs** — the actual v2 UI is built in Sprints 1A–1C. Stubs must render inside the hub shell (auth-gated layout) so the dev can verify the shell works end-to-end.
- After all files are created, run `npx tsc --noEmit` and fix any type errors before marking done.

---

## Goal

Create `src/app/v2/` with the full route group structure mirroring v0.1. Auth must be fully functional at `/v2/auth/login`. The hub shell must load at `/v2/dashboard` after login. All existing v0.1 routes continue working unchanged.

---

## Requirements

- `/v2/auth/login` — working login (email/password + Zoho OAuth)
- `/v2/auth/signup` — working signup
- `/v2/auth/pending` — pending approval page
- `/v2/callback` — Zoho OAuth PKCE callback, redirects to `/v2/dashboard`
- `/v2/dashboard` and all existing hub sub-routes — render the hub shell (sidebar + header) with stub content
- All auth redirect chains stay within `/v2/` — no redirect ever drops a user back to a v0.1 URL
- `V2_ROUTES` constant object added to `src/config/constants.ts`

---

## Redirect Change Map

Every redirect that currently targets a v0.1 path must use the `/v2/` prefixed equivalent in the cloned file:

| File | Change |
|------|--------|
| `v2/(auth)/actions.ts` — `signIn` | `redirect("/dashboard")` → `redirect("/v2/dashboard")` |
| `v2/(auth)/actions.ts` — `signUp` | `redirect("/dashboard")` → `redirect("/v2/dashboard")` |
| `v2/(auth)/actions.ts` — `signOut` | `redirect("/auth/login")` → `redirect("/v2/auth/login")` |
| `v2/(auth)/callback/page.tsx` — success | `destination = "/dashboard"` → `destination = "/v2/dashboard"` |
| `v2/(auth)/callback/page.tsx` — pending | `destination = "/auth/pending"` → `destination = "/v2/auth/pending"` |
| `v2/(auth)/callback/page.tsx` — error | `"/auth/login?error=oauth_failed"` → `"/v2/auth/login?error=oauth_failed"` |
| `v2/(auth)/callback/page.tsx` — Zoho OAuth `redirect_to` | `${origin}/callback` → `${origin}/v2/callback` |
| `v2/(auth)/auth/login/page.tsx` — success | `router.push(ROUTES.DASHBOARD)` → `router.push(V2_ROUTES.DASHBOARD)` |
| `v2/(auth)/auth/login/page.tsx` — Zoho OAuth | `${origin}/callback` → `${origin}/v2/callback` |
| `v2/(auth)/auth/login/page.tsx` — signup link | `ROUTES.AUTH_SIGNUP` → `V2_ROUTES.AUTH_SIGNUP` |
| `v2/(auth)/auth/signup/page.tsx` — login link | `ROUTES.AUTH_LOGIN` → `V2_ROUTES.AUTH_LOGIN` |
| `v2/(hub)/layout.tsx` — no session | `redirect("/auth/login")` → `redirect("/v2/auth/login")` |
| `v2/(hub)/layout.tsx` — pending role | `redirect("/auth/pending")` → `redirect("/v2/auth/pending")` |

---

## Implementation Steps

### Step 1 — Add V2_ROUTES to `src/config/constants.ts`

Append after the existing `ROUTES` export:

```ts
export const V2_ROUTES = {
  DASHBOARD: "/v2/dashboard",
  DASHBOARD_CUSTOMERS: "/v2/dashboard/customers",
  DASHBOARD_TASKS: "/v2/dashboard/tasks",
  DASHBOARD_PIPELINE: "/v2/dashboard/pipeline",
  DASHBOARD_CHAT: "/v2/dashboard/chat",
  DASHBOARD_TIMELOGS: "/v2/dashboard/timelogs",
  DASHBOARD_SETTINGS: "/v2/dashboard/settings",
  DASHBOARD_USERS: "/v2/dashboard/users",
  CUSTOMERS: "/v2/customers",
  ORCHESTRATION: "/v2/orchestration",
  KB: "/v2/kb",
  AUTH_LOGIN: "/v2/auth/login",
  AUTH_SIGNUP: "/v2/auth/signup",
  AUTH_PENDING: "/v2/auth/pending",
  CALLBACK: "/v2/callback",
} as const;
```

### Step 2 — Root v2 layout

Create `src/app/v2/layout.tsx`. This is a minimal pass-through — the root `src/app/layout.tsx` handles fonts, metadata, and PWA. The v2 layout just needs to render children inside a React fragment (no duplicate `<html>` or `<body>`):

```tsx
export default function V2RootLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

### Step 3 — Auth group

Create the following files under `src/app/v2/(auth)/`:

**`layout.tsx`** — identical to `src/app/(auth)/layout.tsx`:
```tsx
import { Suspense } from "react";
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <Suspense>{children}</Suspense>;
}
```

**`actions.ts`** — copy of `src/app/(auth)/actions.ts` with 3 redirects updated per the map above.

**`auth/login/page.tsx`** — copy of `src/app/(auth)/auth/login/page.tsx` with:
- Import `V2_ROUTES` from `@/config/constants` (alongside existing `ROUTES` import)
- `router.push(ROUTES.DASHBOARD)` → `router.push(V2_ROUTES.DASHBOARD)`
- `handleZohoSignIn` redirect_to: `${window.location.origin}/callback` → `${window.location.origin}/v2/callback`
- Signup link: `ROUTES.AUTH_SIGNUP` → `V2_ROUTES.AUTH_SIGNUP`
- Import `signIn` Server Action from `@/app/v2/(auth)/actions` (not the original)

**`auth/signup/page.tsx`** — copy with:
- Login link: `ROUTES.AUTH_LOGIN` → `V2_ROUTES.AUTH_LOGIN`
- Import `signUp` Server Action from `@/app/v2/(auth)/actions`

**`auth/pending/page.tsx`** — copy; update any internal `href` or `router.push` pointing to v0.1 auth paths.

**`callback/page.tsx`** — copy of `src/app/(auth)/callback/page.tsx` with:
- `destination = "/dashboard"` → `destination = "/v2/dashboard"`
- `destination = "/auth/pending"` → `destination = "/v2/auth/pending"`
- Error redirects: `/auth/login?error=...` → `/v2/auth/login?error=...`
- Zoho OAuth `redirect_to`: `${window.location.origin}/callback` → `${window.location.origin}/v2/callback`
- Keep the dynamic imports pointing to the **original** path: `import("@/app/(auth)/sync-zoho-role")` — no change needed here

### Step 4 — Hub group

**`src/app/v2/(hub)/layout.tsx`** — copy of `src/app/(hub)/layout.tsx` with:
- `redirect("/auth/login")` → `redirect("/v2/auth/login")`
- `redirect("/auth/pending")` → `redirect("/v2/auth/pending")`
- All other logic (Supabase session fetch, `hub_users` profile lookup) identical

**`src/app/v2/(hub)/_hub-content-shell.tsx`** — identical copy of `src/app/(hub)/_hub-content-shell.tsx`.

### Step 5 — Hub stub pages

Create a stub page for each of the following. Use this pattern — page name in the label, sprint in which it will be built:

```tsx
export default function DashboardPage() {
  return (
    <div className="py-6.5 px-8">
      <p className="text-sm text-muted-foreground">v2 · Dashboard · Sprint 1A</p>
    </div>
  );
}
```

Pages to stub (mirror every existing `page.tsx` in `(hub)/`):

| v2 path | Sprint |
|---------|--------|
| `src/app/v2/(hub)/dashboard/page.tsx` | 1A |
| `src/app/v2/(hub)/dashboard/customers/page.tsx` | 1A |
| `src/app/v2/(hub)/dashboard/customers/[customerId]/page.tsx` | 1A |
| `src/app/v2/(hub)/dashboard/customers/onboard/page.tsx` | 1A |
| `src/app/v2/(hub)/dashboard/pipeline/page.tsx` | 1A |
| `src/app/v2/(hub)/dashboard/tasks/page.tsx` | 1A |
| `src/app/v2/(hub)/dashboard/timelogs/page.tsx` | 1A |
| `src/app/v2/(hub)/dashboard/settings/page.tsx` | 1A |
| `src/app/v2/(hub)/dashboard/users/page.tsx` | 1A |
| `src/app/v2/(hub)/dashboard/chat/page.tsx` | 1C |
| `src/app/v2/(hub)/customers/[customerId]/page.tsx` | 1A |
| `src/app/v2/(hub)/customers/onboard/page.tsx` | 1A |
| `src/app/v2/(hub)/orchestration/page.tsx` | 1C |
| `src/app/v2/(hub)/admin/hub-users/page.tsx` | 1A |
| `src/app/v2/(hub)/kb/page.tsx` | 1C |
| `src/app/v2/(hub)/pm/pipeline/page.tsx` | 1A |

### Step 6 — TypeScript check

```bash
npx tsc --noEmit
```

Fix any errors before marking done. Common issues: wrong import paths for Server Actions, missing `V2_ROUTES` import.

---

## File Changes

| Action | File |
|--------|------|
| MODIFY | `src/config/constants.ts` — add `V2_ROUTES` export |
| CREATE | `src/app/v2/layout.tsx` |
| CREATE | `src/app/v2/(auth)/layout.tsx` |
| CREATE | `src/app/v2/(auth)/actions.ts` |
| CREATE | `src/app/v2/(auth)/auth/login/page.tsx` |
| CREATE | `src/app/v2/(auth)/auth/signup/page.tsx` |
| CREATE | `src/app/v2/(auth)/auth/pending/page.tsx` |
| CREATE | `src/app/v2/(auth)/callback/page.tsx` |
| CREATE | `src/app/v2/(hub)/layout.tsx` |
| CREATE | `src/app/v2/(hub)/_hub-content-shell.tsx` |
| CREATE | 16× stub pages under `src/app/v2/(hub)/` |

---

## Code Context

### `src/config/constants.ts` — existing ROUTES (lines 1–15)
```ts
export const ROUTES = {
  DASHBOARD: "/dashboard",
  DASHBOARD_CUSTOMERS: "/dashboard/customers",
  DASHBOARD_TASKS: "/dashboard/tasks",
  DASHBOARD_PIPELINE: "/dashboard/pipeline",
  DASHBOARD_CHAT: "/dashboard/chat",
  DASHBOARD_TIMELOGS: "/dashboard/timelogs",
  DASHBOARD_SETTINGS: "/dashboard/settings",
  DASHBOARD_USERS: "/dashboard/users",
  CUSTOMERS_NEW: "/customers/new",
  ORCHESTRATION: "/orchestration",
  KB: "/kb",
  AUTH_LOGIN: "/auth/login",
  AUTH_SIGNUP: "/auth/signup",
} as const;
```

### `src/app/(auth)/actions.ts` — 3 redirects to update in clone
```ts
export async function signIn(...) { ... redirect("/dashboard"); }         // → /v2/dashboard
export async function signUp(...) { ... redirect("/dashboard"); }         // → /v2/dashboard
export async function signOut() { ... redirect("/auth/login"); }          // → /v2/auth/login
```

### `src/app/(auth)/callback/page.tsx` — destinations to update in clone
```ts
let destination = "/dashboard";                                           // → /v2/dashboard
if (!role || role === "pending") destination = "/auth/pending";          // → /v2/auth/pending
window.location.href = "/auth/login?error=oauth_failed";                 // → /v2/auth/login?...
const redirectTo = `${window.location.origin}/callback`;                 // → /v2/callback
```

### `src/app/(hub)/layout.tsx` — redirects to update in clone
```ts
redirect("/auth/login");       // → /v2/auth/login
redirect("/auth/pending");     // → /v2/auth/pending (in "pending" role check)
```

---

## Acceptance Criteria

- [ ] `npx tsc --noEmit` passes with no errors
- [ ] `/v2/auth/login` loads the login page
- [ ] Signing in redirects to `/v2/dashboard` (not `/dashboard`)
- [ ] `/v2/dashboard` renders the hub shell (sidebar + header) with stub content
- [ ] Visiting `/v2/dashboard` while unauthenticated redirects to `/v2/auth/login` (not `/auth/login`)
- [ ] Signing out from the hub redirects to `/v2/auth/login`
- [ ] All existing v0.1 routes (`/auth/login`, `/dashboard`, `/orchestration`) still work unchanged
- [ ] `/onboard/[customerId]` (public) still works unchanged
