# Task 041 — Route Architecture Restructure

> **Type:** refactor
> **Version bump:** minor
> **Priority:** high
> **Recommended Model:** sonnet
> **Status:** TESTING
> **Completed:** 2026-06-02

## Objective

Rename and reorganize all hub routes to match the agreed URL map:

| Area | Old URL | New URL |
|------|---------|---------|
| Login | `/signin` | `/auth/login` |
| Signup | `/signup` | `/auth/signup` |
| PM / Dev Home | `/pm` / `/dev` | `/dashboard` (role-aware) |
| Customers list | `/pm/customers` | `/dashboard/customers` |
| Tasks | `/pm/tasks` | `/dashboard/tasks` (role-aware) |
| Pipeline | `/pm/pipeline` | `/dashboard/pipeline` |
| AI Chat | `/ai-chat` | `/dashboard/chat` |
| Settings | `/pm/settings` | `/dashboard/settings` |
| Time Logs | (section of /dev) | `/dashboard/timelogs` (dev only) |
| PM create customer | `/onboarding` (hub) | `/customers/new` |
| Customer onboarding form | `/onboarding/[customerId]` | unchanged (public) |

## Requirements

1. Auth pages live under `/auth/` prefix — `/auth/login` replaces `/signin`, `/auth/signup` replaces `/signup`.
2. The Zoho OAuth callback page stays at `/callback` — do NOT move it; the OAuth redirect URI is registered against this URL.
3. All authenticated hub pages are under `/dashboard/` except `customers/[customerId]`, `customers/new`, `/orchestration`, and `/kb` which remain at top-level hub paths.
4. `/dashboard` renders role-aware content: PM role → PM dashboard UI; developer role → Dev dashboard UI; admin → PM dashboard UI.
5. `/dashboard/tasks` renders role-aware content: PM role → PM tasks (classification_records); developer role → dev assigned tasks (Zoho).
6. `/dashboard/timelogs` is a new standalone page — extract the "Time Logged" section from the current dev page into its own page component.
7. `/customers/new` is the new PM customer creation page — move the existing hub `/onboarding` page here.
8. After password login (`/auth/login`), redirect to `/dashboard`.
9. After Zoho OAuth (`/callback`), redirect to `/dashboard` on success; redirect to `/auth/login?error=oauth_failed` on failure.
10. Hub layout unauthenticated redirect: `/signin` → `/auth/login`.
11. Update `ROUTES` constants — add all new keys, remove stale ones.
12. Update sidebar nav links to use new ROUTES constants.
13. Update home page (`src/app/page.tsx`) module card `href` values.
14. Delete all old route directories that are being replaced (do not leave dead routes).

## Implementation Steps

### 1. Update `src/config/constants.ts` ROUTES

Replace the existing `ROUTES` object with:

```ts
export const ROUTES = {
  HOME: "/",
  DASHBOARD: "/dashboard",
  DASHBOARD_CUSTOMERS: "/dashboard/customers",
  DASHBOARD_TASKS: "/dashboard/tasks",
  DASHBOARD_PIPELINE: "/dashboard/pipeline",
  DASHBOARD_CHAT: "/dashboard/chat",
  DASHBOARD_TIMELOGS: "/dashboard/timelogs",
  DASHBOARD_SETTINGS: "/dashboard/settings",
  CUSTOMERS_NEW: "/customers/new",
  ORCHESTRATION: "/orchestration",
  KB: "/kb",
  AUTH_LOGIN: "/auth/login",
  AUTH_SIGNUP: "/auth/signup",
} as const;
```

### 2. Move auth pages

- Create `src/app/(auth)/auth/login/page.tsx` — copy content of `src/app/(auth)/signin/page.tsx`
  - Update internal link: "Sign up" → `ROUTES.AUTH_SIGNUP` (`/auth/signup`)
  - Update post-login redirect: `router.push("/hub")` → `router.push(ROUTES.DASHBOARD)`
  - Update Zoho SSO callback URL: `${window.location.origin}/callback` — **leave unchanged** (Zoho OAuth is registered to `/callback`)
  - Update error link in query-param reads: any references to `/signin` → `/auth/login`
- Create `src/app/(auth)/auth/signup/page.tsx` — copy content of `src/app/(auth)/signup/page.tsx`
  - Update internal link: "Sign in" → `ROUTES.AUTH_LOGIN` (`/auth/login`)
- Delete `src/app/(auth)/signin/` directory
- Delete `src/app/(auth)/signup/` directory

### 3. Update `/callback` page

In `src/app/(auth)/callback/page.tsx`:
- Line 20: `router.push("/signin?error=oauth_failed")` → `router.push("/auth/login?error=oauth_failed")`
- Line 33: `router.push("/signin?error=oauth_failed")` → `router.push("/auth/login?error=oauth_failed")`
- Line 74: `router.push("/")` → `router.push("/dashboard")`

### 4. Update hub layout redirect

In `src/app/(hub)/layout.tsx`:
- `redirect("/signin")` → `redirect("/auth/login")`

### 5. Create `/dashboard` route (role-aware home)

Create `src/app/(hub)/dashboard/page.tsx` as a **server component**:
- Fetch the authenticated user's role from `hub_users` (same pattern as layout)
- If `role === "developer"` → render `<DevDashboardContent />` (extracted from current dev page)
- Otherwise (pm, admin) → render `<PMDashboardContent />` (extracted from current pm page)
- Both content components are client components that receive no props — they fetch their own data internally (same as current pages do)

Extract client component from existing pm/page.tsx into `src/app/(hub)/dashboard/_components/pm-dashboard.tsx`.
Extract client component from existing dev/page.tsx into `src/app/(hub)/dashboard/_components/dev-dashboard.tsx`.

### 6. Move PM sub-pages to `/dashboard/`

- `src/app/(hub)/pm/customers/page.tsx` → `src/app/(hub)/dashboard/customers/page.tsx` (copy, no logic changes)
- `src/app/(hub)/pm/tasks/page.tsx` → `src/app/(hub)/dashboard/tasks/page.tsx`
  - Make it role-aware: if developer role → render dev tasks UI (inline, small component); if pm/admin → render existing `<TasksTab />` content
- `src/app/(hub)/pm/pipeline/page.tsx` → `src/app/(hub)/dashboard/pipeline/page.tsx` (copy, no logic changes)
- `src/app/(hub)/pm/settings/page.tsx` → `src/app/(hub)/dashboard/settings/page.tsx` (copy, no logic changes)
- `src/app/(hub)/ai-chat/page.tsx` → `src/app/(hub)/dashboard/chat/page.tsx` (copy, no logic changes)
- Delete `src/app/(hub)/pm/` directory tree
- Delete `src/app/(hub)/ai-chat/` directory

### 7. Create `/dashboard/timelogs` page

Create `src/app/(hub)/dashboard/timelogs/page.tsx`:
- Extract the "Time Logged" section from the current dev page (`dev-page-full` — the card that shows `logsByProject` grouped time entries with today/week toggle)
- The page fetches `/api/dev/tasks?range={range}` and renders only the time log data
- Keep the today/week toggle
- Keep the summary stat (total logged)

### 8. Move PM create customer page

- `src/app/(hub)/onboarding/page.tsx` → `src/app/(hub)/customers/new/page.tsx`
- Inside the moved file, update the two `href` values in the success state:
  - `href="/pm"` → `href={ROUTES.DASHBOARD}`
- Delete `src/app/(hub)/onboarding/` directory

### 9. Update sidebar navigation

In `src/components/hub/hub-sidebar.tsx`, update `navGroups` to use new ROUTES:

```ts
import { ROUTES } from "@/config/constants";

const navGroups = [
  {
    section: "Main",
    items: [
      { href: ROUTES.DASHBOARD,           label: "Home",      icon: LayoutDashboard, exact: true },
      { href: ROUTES.DASHBOARD_CUSTOMERS, label: "Customers", icon: Users },
      { href: ROUTES.DASHBOARD_TASKS,     label: "Tasks",     icon: ListChecks },
      { href: ROUTES.DASHBOARD_PIPELINE,  label: "Pipeline",  icon: GitBranch },
      { href: ROUTES.DASHBOARD_CHAT,      label: "AI Chat",   icon: Bot },
    ],
  },
];
```

(RBAC task 042 will make this dynamic per role — for now update the static links.)

### 10. Update home page module cards

In `src/app/page.tsx`, update `href` values in the `modules` array:
- `ROUTES.PM` → `ROUTES.DASHBOARD`
- `ROUTES.DEV` → `ROUTES.DASHBOARD`
- `ROUTES.AI_CHAT` → `ROUTES.DASHBOARD_CHAT`
- `ROUTES.ONBOARDING` → `ROUTES.CUSTOMERS_NEW`

### 11. Delete old routes

Remove these directories (they are fully replaced):
- `src/app/(hub)/pm/` (all contents moved to `dashboard/`)
- `src/app/(hub)/dev/` (content merged into `dashboard/page.tsx`)
- `src/app/(hub)/ai-chat/` (moved to `dashboard/chat/`)
- `src/app/(hub)/onboarding/` (moved to `customers/new/`)
- `src/app/(auth)/signin/` (moved to `auth/login/`)
- `src/app/(auth)/signup/` (moved to `auth/signup/`)

## File Changes

| Action | Path |
|--------|------|
| MODIFY | `src/config/constants.ts` |
| CREATE | `src/app/(auth)/auth/login/page.tsx` |
| CREATE | `src/app/(auth)/auth/signup/page.tsx` |
| MODIFY | `src/app/(auth)/callback/page.tsx` |
| MODIFY | `src/app/(hub)/layout.tsx` |
| CREATE | `src/app/(hub)/dashboard/page.tsx` |
| CREATE | `src/app/(hub)/dashboard/_components/pm-dashboard.tsx` |
| CREATE | `src/app/(hub)/dashboard/_components/dev-dashboard.tsx` |
| CREATE | `src/app/(hub)/dashboard/customers/page.tsx` |
| CREATE | `src/app/(hub)/dashboard/tasks/page.tsx` |
| CREATE | `src/app/(hub)/dashboard/pipeline/page.tsx` |
| CREATE | `src/app/(hub)/dashboard/settings/page.tsx` |
| CREATE | `src/app/(hub)/dashboard/chat/page.tsx` |
| CREATE | `src/app/(hub)/dashboard/timelogs/page.tsx` |
| CREATE | `src/app/(hub)/customers/new/page.tsx` |
| MODIFY | `src/components/hub/hub-sidebar.tsx` |
| MODIFY | `src/app/page.tsx` |
| DELETE | `src/app/(auth)/signin/` |
| DELETE | `src/app/(auth)/signup/` |
| DELETE | `src/app/(hub)/pm/` |
| DELETE | `src/app/(hub)/dev/` |
| DELETE | `src/app/(hub)/ai-chat/` |
| DELETE | `src/app/(hub)/onboarding/` |

## Code Context

### Current ROUTES (`src/config/constants.ts:1-8`)
```ts
export const ROUTES = {
  HOME: "/",
  PM: "/pm",
  DEV: "/dev",
  ONBOARDING: "/onboarding",
  ORCHESTRATION: "/orchestration",
  PIPELINE: "/pm/pipeline",
  AI_CHAT: "/ai-chat",
  KB: "/kb",
} as const;
```

### Hub layout auth redirect (`src/app/(hub)/layout.tsx:9`)
```ts
redirect("/signin");
```

### Callback redirect targets (`src/app/(auth)/callback/page.tsx:20,33,74`)
```ts
router.push("/signin?error=oauth_failed");  // lines 20 and 33
router.push("/");                           // line 74 — success redirect
```

### Signin post-login redirect (`src/app/(auth)/signin/page.tsx`)
```ts
router.push("/hub");   // ← bug: /hub doesn't exist; fix to /dashboard
```

### Onboarding success back-link (`src/app/(hub)/onboarding/page.tsx`)
```tsx
<a href="/pm" ...>Go to PM Dashboard</a>
```

### Sidebar navGroups (`src/components/hub/hub-sidebar.tsx:32-42`)
```ts
const navGroups: { section: string; items: NavItem[] }[] = [
  {
    section: "Main",
    items: [
      { href: ROUTES.PM,                    label: "Home",      icon: LayoutDashboard, exact: true },
      { href: `${ROUTES.PM}/customers`,     label: "Customers", icon: Users },
      { href: `${ROUTES.PM}/tasks`,         label: "Tasks",     icon: ListChecks },
      { href: ROUTES.PIPELINE,              label: "Pipeline",  icon: GitBranch },
      { href: ROUTES.AI_CHAT,               label: "AI Chat",   icon: Bot },
    ],
  },
];
```

### Dev page timelog data (for timelogs extraction)
The dev page (`src/app/(hub)/dev/page.tsx`) fetches `/api/dev/tasks?range={range}` which returns `{ myTasks, unassignedTasks, timeLogs }`. The timelogs page needs the same fetch but only renders the `timeLogs` array using `logsByProject` grouping logic already in the dev page.

## Notes for Implementation Agent

- **Model rationale:** This is a high-breadth cross-cutting change (20+ files, auth flow, routing layer, shared components) with multiple redirect targets that must stay consistent. Sonnet is warranted.
- **Do NOT move `/callback`** — the Zoho OAuth provider is configured with `${origin}/callback` as the redirect URI. Moving it would break all Zoho SSO logins.
- **`/customers/new` vs `/customers/[customerId]`** — In Next.js App Router, static segments take priority over dynamic ones, so `/customers/new` will never be matched as a customer ID. No conflict.
- **Role fetching in dashboard/page.tsx** — The server component should call `supabase.from("hub_users").select("role").eq("id", userId).single()`. If the role query fails or returns null, default to PM view (fail-safe open, RBAC guards are handled in task 042).
- **`router.push("/hub")` in signin** — This is a pre-existing bug (there is no `/hub` route). Fix to `router.push(ROUTES.DASHBOARD)` as part of this task.
- **After deleting old directories**, run `npx tsc --noEmit` to catch any remaining import references to the old paths. Fix all TypeScript errors before marking done.
- **`src/app/(hub)/pm/settings/page.tsx`** — check contents before copying; it may be mostly a stub. Copy as-is.
- **`_components/` folder** — using underscore prefix so Next.js does not treat them as route segments.
