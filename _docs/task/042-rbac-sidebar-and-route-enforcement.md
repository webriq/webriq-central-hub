# Task 042 — RBAC: Sidebar & Route Enforcement

> **Type:** feature
> **Version bump:** minor
> **Priority:** high
> **Recommended Model:** sonnet
> **Depends on:** Task 041 (route restructure must be complete first)
> **Status:** TESTING
> **Completed:** 2026-06-02

## Objective

Wire up the `userRole` that is already fetched in the hub layout but currently ignored. Enforce role-based access at two levels:

1. **Navigation** — sidebar shows only the routes relevant to the user's role.
2. **Route guards** — unauthorized roles are redirected away from pages they should not access.
3. **Admin Hub Users page** — admin-only page to view and manage `hub_users`.

## Roles & Route Matrix

| Route | PM | Developer | Admin |
|-------|----|-----------|-------|
| `/dashboard` (home) | ✅ PM view | ✅ Dev view | ✅ PM view |
| `/dashboard/customers` | ✅ | ❌ → `/dashboard` | ✅ |
| `/dashboard/tasks` | ✅ PM tasks | ✅ Dev tasks | ✅ PM tasks |
| `/dashboard/pipeline` | ✅ | ❌ → `/dashboard` | ✅ |
| `/dashboard/chat` | ✅ | ❌ → `/dashboard` | ✅ |
| `/dashboard/timelogs` | ❌ → `/dashboard` | ✅ | ✅ |
| `/dashboard/settings` | ✅ | ❌ → `/dashboard` | ✅ |
| `/customers/new` | ✅ | ❌ → `/dashboard` | ✅ |
| `/customers/[customerId]` | ✅ | ✅ (read-only implied) | ✅ |
| `/orchestration` | ✅ | ❌ → `/dashboard` | ✅ |
| `/kb` | ✅ | ✅ | ✅ |
| `/admin/hub-users` | ❌ → `/dashboard` | ❌ → `/dashboard` | ✅ |

## Requirements

1. Sidebar renders different nav items per role — PM nav, Dev nav, Admin nav (all PM nav + Hub Users link).
2. Hub layout enforces route access — if the current path is not in the role's allowed list, redirect to `/dashboard`.
3. Admin gets a new "Hub Users" page at `/admin/hub-users` that lists all `hub_users` records (email, role, display_name, created_at).
4. The `_userRole` unused prop in HubSidebar is wired up — rename to `userRole` and use it.
5. Role is passed from hub layout to sidebar (already passed, just unused).
6. No client-side role check as the sole guard — server layout enforces redirects, sidebar just reflects allowed nav.

## Implementation Steps

### 1. Define role-based nav configurations in sidebar

In `src/components/hub/hub-sidebar.tsx`:

Replace the single static `navGroups` with a function `getNavGroups(role: string | null)` that returns the appropriate groups:

```ts
import { ROUTES } from "@/config/constants";
import { LayoutDashboard, Users, ListChecks, GitBranch, Bot, Clock, Settings, ShieldCheck } from "lucide-react";

function getNavGroups(role: string | null) {
  const isPM    = role === "pm" || role === "admin";
  const isDev   = role === "developer";
  const isAdmin = role === "admin";

  const pmItems = [
    { href: ROUTES.DASHBOARD,           label: "Home",      icon: LayoutDashboard, exact: true },
    { href: ROUTES.DASHBOARD_CUSTOMERS, label: "Customers", icon: Users },
    { href: ROUTES.DASHBOARD_TASKS,     label: "Tasks",     icon: ListChecks },
    { href: ROUTES.DASHBOARD_PIPELINE,  label: "Pipeline",  icon: GitBranch },
    { href: ROUTES.DASHBOARD_CHAT,      label: "AI Chat",   icon: Bot },
  ];

  const devItems = [
    { href: ROUTES.DASHBOARD,           label: "Home",      icon: LayoutDashboard, exact: true },
    { href: ROUTES.DASHBOARD_TASKS,     label: "Tasks",     icon: ListChecks },
    { href: ROUTES.DASHBOARD_TIMELOGS,  label: "Time Logs", icon: Clock },
  ];

  const adminExtras = [
    { href: "/admin/hub-users", label: "Hub Users", icon: ShieldCheck },
  ];

  const items = isDev ? devItems : [...pmItems, ...(isAdmin ? adminExtras : [])];

  return [{ section: "Main", items }];
}
```

In the component, replace `_userRole` with `userRole` and call `getNavGroups(userRole)` to build nav:

```tsx
export default function HubSidebar({ userRole, ... }: HubSidebarProps) {
  const navGroups = getNavGroups(userRole);
  // rest unchanged
}
```

### 2. Add route guard utility

Create `src/lib/auth/role-access.ts`:

```ts
// Maps each protected path prefix to which roles may access it.
// Paths not listed here are accessible to all authenticated users.
const ROLE_RULES: { prefix: string; allowed: string[] }[] = [
  { prefix: "/dashboard/customers",  allowed: ["pm", "admin"] },
  { prefix: "/dashboard/pipeline",   allowed: ["pm", "admin"] },
  { prefix: "/dashboard/chat",       allowed: ["pm", "admin"] },
  { prefix: "/dashboard/timelogs",   allowed: ["developer", "admin"] },
  { prefix: "/dashboard/settings",   allowed: ["pm", "admin"] },
  { prefix: "/customers/new",        allowed: ["pm", "admin"] },
  { prefix: "/orchestration",        allowed: ["pm", "admin"] },
  { prefix: "/admin",                allowed: ["admin"] },
];

export function isRouteAllowed(pathname: string, role: string | null): boolean {
  if (!role) return false;
  for (const rule of ROLE_RULES) {
    if (pathname === rule.prefix || pathname.startsWith(rule.prefix + "/")) {
      return rule.allowed.includes(role);
    }
  }
  return true; // not in the restricted list — allowed
}
```

### 3. Enforce route guards in hub layout

In `src/app/(hub)/layout.tsx`, after fetching `userRole`, add:

```ts
import { isRouteAllowed } from "@/lib/auth/role-access";
import { headers } from "next/headers";

// After fetching userRole...
const hdrs = await headers();
const pathname = hdrs.get("x-invoke-path") ?? hdrs.get("x-pathname") ?? "";
// Next.js 16: use the `pathname` from the request headers
// If pathname is available and access is denied, redirect to /dashboard
if (pathname && userRole && !isRouteAllowed(pathname, userRole)) {
  redirect("/dashboard");
}
```

**Note:** In Next.js App Router, the layout does not receive `pathname` directly. The correct approach is to pass the `searchParams` / use Next.js middleware headers OR use a per-page guard. Since this project avoids middleware (uses `proxy.ts` instead), implement the guard directly in each protected page as a lightweight server-side check:

```ts
// At the top of each protected page (server component):
import { createClient } from "@/lib/supabase/server";
import { isRouteAllowed } from "@/lib/auth/role-access";
import { redirect } from "next/navigation";

async function requireRole(pathname: string) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/auth/login");
  const { data: profile } = await supabase
    .from("hub_users").select("role").eq("id", data.claims.sub).single();
  if (!isRouteAllowed(pathname, profile?.role ?? null)) redirect("/dashboard");
  return profile?.role ?? null;
}
```

Add this guard to the top of each page listed as restricted in the route matrix:
- `src/app/(hub)/dashboard/customers/page.tsx` — `requireRole("/dashboard/customers")`
- `src/app/(hub)/dashboard/pipeline/page.tsx` — `requireRole("/dashboard/pipeline")`
- `src/app/(hub)/dashboard/chat/page.tsx` — `requireRole("/dashboard/chat")`
- `src/app/(hub)/dashboard/timelogs/page.tsx` — `requireRole("/dashboard/timelogs")`
- `src/app/(hub)/dashboard/settings/page.tsx` — `requireRole("/dashboard/settings")`
- `src/app/(hub)/customers/new/page.tsx` — `requireRole("/customers/new")`
- `src/app/(hub)/orchestration/page.tsx` — `requireRole("/orchestration")`
- `src/app/(hub)/admin/hub-users/page.tsx` — `requireRole("/admin/hub-users")`

Place `requireRole` in `src/lib/auth/require-role.ts` (not role-access.ts) so it's importable from any server page.

### 4. Create Admin Hub Users page

Create `src/app/(hub)/admin/hub-users/page.tsx` (server component):
- Call `requireRole("/admin/hub-users")` — non-admins redirect immediately
- Query: `supabase.from("hub_users").select("id, email, display_name, role, zoho_user_id, created_at").order("created_at", { ascending: false })`
- Render a simple table: email, display name, role (badge colored by role), Zoho ID, joined date
- Role badge colors: `admin` → red, `pm` → blue, `developer` → green
- No edit functionality in this task — read-only list

### 5. Add Hub Users link to sidebar (admin only)

Already handled in Step 1 via `adminExtras`. The ShieldCheck icon is from `lucide-react` (already installed).

## File Changes

| Action | Path |
|--------|------|
| MODIFY | `src/components/hub/hub-sidebar.tsx` |
| CREATE | `src/lib/auth/role-access.ts` |
| CREATE | `src/lib/auth/require-role.ts` |
| CREATE | `src/app/(hub)/admin/hub-users/page.tsx` |
| MODIFY | `src/app/(hub)/dashboard/customers/page.tsx` |
| MODIFY | `src/app/(hub)/dashboard/pipeline/page.tsx` |
| MODIFY | `src/app/(hub)/dashboard/chat/page.tsx` |
| MODIFY | `src/app/(hub)/dashboard/timelogs/page.tsx` |
| MODIFY | `src/app/(hub)/dashboard/settings/page.tsx` |
| MODIFY | `src/app/(hub)/customers/new/page.tsx` |
| MODIFY | `src/app/(hub)/orchestration/page.tsx` |

## Code Context

### Current sidebar prop — unused role (`src/components/hub/hub-sidebar.tsx`)
```tsx
export default function HubSidebar({ userEmail: _userEmail, userRole: _userRole }: HubSidebarProps) {
```
The `_userRole` prefix means it is intentionally unused. Remove underscore and wire up.

### Hub layout role fetch (`src/app/(hub)/layout.tsx`)
```ts
const { data: profile } = await supabase
  .from("hub_users")
  .select("email, role, display_name, zoho_user_id")
  .eq("id", userId)
  .single();

if (profile) {
  userEmail = profile.email;
  userRole = profile.role;   // ← already fetched, just not enforced
  ...
}
```

### UserRole type (`src/types/hub.ts:109-110`)
```ts
// Access control roles (COO Specs §Access Control)
export type UserRole = "admin" | "pm" | "developer" | "client";
```

### hub_users table columns (from DB types)
```
id, email, role, display_name, zoho_user_id, created_at
```

## Notes for Implementation Agent

- **Model rationale:** Security-sensitive access control logic, new utility layer (`lib/auth/`), cross-cutting modifications to 8+ pages. Sonnet warranted.
- **Do not use client-side role checks as the only guard.** The `requireRole()` server function is the authoritative guard. The sidebar is purely a UX affordance — a determined user could still type URLs directly, which is why server-side checks are required.
- **`requireRole` makes a second Supabase call** beyond what the layout does. This is acceptable — the layout and pages are separate render contexts. If performance becomes an issue, pass role via a cookie or middleware header in a future task.
- **Admin role** sees the PM nav + Hub Users. Admin is not a separate "dashboard view" — they see the PM dashboard and have extra access.
- **`client` role** (from UserRole type) is not included in the route matrix above — no hub routes are currently intended for clients. If a client somehow authenticates into the hub, `requireRole` will catch any protected route and redirect to `/dashboard`, which will show the PM view as a fallback. This is acceptable for now.
- **`/dashboard/tasks`** is role-aware (PM vs Dev content) — this was handled in task 041. In this task, you only add the `requireRole` guard (which allows both pm and developer, so no restriction needed for tasks). Do not add a route restriction for `/dashboard/tasks`.
- **Run `npx tsc --noEmit`** after all changes to verify no type errors.
