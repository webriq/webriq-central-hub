# Task 076 — Dashboard RBAC + Remove Duplicate "Dashboards" Nav Link

> **Status:** TESTING
> **Priority:** HIGH
> **Type:** enhancement
> **Version Impact:** patch
> **Created:** 2026-06-21
> **Completed:** 2026-06-21
> **Platform:** Web
> **Automation:** manual
> **Implementation Notes:** Removed the "Dashboards" plural nav item + orphaned `LayoutGrid` import from `v2-hub-sidebar.tsx`. Rewrote `dashboard-view.tsx` into a stateless role-gated renderer (admin→Admin, developer→Dev, pm/hr/client→PM); removed the tab switcher, `useState`, `TABS`, and `"use client"` (no longer needed). `npx tsc --noEmit` clean; `pnpm lint` shows only pre-existing errors in unrelated files.

## Overview

The v2 sidebar currently shows two redundant nav links — "Dashboard" (singular) and "Dashboards" (plural) — that both point to the exact same route (`V2_ROUTES.DASHBOARD`). Remove the plural "Dashboards" link and keep the single "Dashboard" entry. Additionally, the dashboard page currently renders a tab switcher that lets *any* user freely view all four dashboards (PM / Dev / HR / Admin) with no enforcement. Apply real RBAC so each user sees **only** the dashboard for their session role: Admin → Admin dashboard, PM → PM dashboard, Developer → Dev dashboard. The switcher is hidden since there is nothing to switch to.

## Requirements

### Must Have
- [x] Remove the "Dashboards" (plural, `LayoutGrid` icon) nav item from the sidebar `workItems`.
- [x] Keep the "Dashboard" (singular, `LayoutDashboard` icon) nav item.
- [x] Dashboard renders exactly one dashboard component determined by the session user's role (server-resolved `profiles.role`).
  - `admin` → AdminDashboard
  - `pm` → PMDashboard
  - `developer` → DevDashboard
- [x] Remove the interactive tab switcher from `dashboard-view.tsx` — users can no longer manually switch to a dashboard their role does not own.
- [x] No regression in props passed to each dashboard component (`displayName`, `userId`).

### Nice to Have
- [x] Graceful fallback for `hr` / `client` roles (HR dashboard is still a "coming soon" stub) — falls back to PM dashboard (preserves current `defaultTab` behavior).
- [x] Remove now-unused `LayoutGrid` import from the sidebar if it has no other usage.

## Current State

The role is already resolved server-side in `page.tsx` and passed to a client `DashboardView`. The `TABS` array even declares a `roles: string[]` field per tab — but it is **never used for filtering**. All four tabs render for everyone and `setActive` lets anyone switch freely. There is effectively zero RBAC on the dashboard today.

**Current Files:**
| File | Purpose |
|------|---------|
| `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` | v2 sidebar; `getNavGroups(role)` builds nav. Lines 33 & 36 hold the duplicate Dashboard/Dashboards items. |
| `src/app/v2/(hub)/dashboard/page.tsx` | Server component; resolves `role` + `full_name` from `profiles`, renders `<DashboardView>`. |
| `src/app/v2/(hub)/dashboard/_components/dashboard-view.tsx` | Client; tab switcher rendering all dashboards with no role enforcement. |
| `src/app/v2/(hub)/dashboard/_components/{pm,dev,admin}-dashboard.tsx` | The per-role dashboard components. |

## Proposed Solution

### Architecture

1. **Sidebar** — delete the `{ label: "Dashboards", ... }` line from `workItems`. The singular `Dashboard` item stays. The "Customers" item currently sits in the same `...(!isDev ? [...] : [])` spread — keep Customers, just drop the Dashboards entry.

2. **Dashboard RBAC** — convert `DashboardView` from a stateful tab switcher into a stateless role-gated renderer. Map role → component via a single `switch`/lookup. No `useState`, no tab bar. The role is already trusted (server-resolved from `profiles`), so the gating is authoritative; the client component just renders the right one.

### File Changes

| Action | File | Description |
|--------|------|-------------|
| MODIFY | `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` | Remove the "Dashboards" plural nav item; drop unused `LayoutGrid` import if orphaned. |
| MODIFY | `src/app/v2/(hub)/dashboard/_components/dashboard-view.tsx` | Replace tab switcher with role-based single-dashboard render; remove `useState`/`TABS`. |

## Implementation Steps

### Step 1: Remove duplicate sidebar nav item
In `v2-hub-sidebar.tsx`, edit the `...(!isDev ? [...] : [])` block inside `workItems` to drop the Dashboards entry:

```tsx
...(!isDev ? [
  { label: "Customers", icon: <Building2 size={18} />, href: V2_ROUTES.CUSTOMERS },
] : []),
```

Then remove `LayoutGrid` from the `lucide-react` import line **only if** it is no longer referenced anywhere else in the file (grep confirms it is currently only used by the removed item).

### Step 2: Role-gate the dashboard
Rewrite `dashboard-view.tsx` to render one dashboard based on `role`. Drop `useState`, the `TABS` array, and the tab bar JSX:

```tsx
interface DashboardViewProps {
  role: string | null;
  displayName: string | null;
  userId: string;
}

export default function DashboardView({ role, displayName, userId }: DashboardViewProps) {
  if (role === "developer") return <DevDashboard userId={userId} displayName={displayName} />;
  if (role === "admin")     return <AdminDashboard userId={userId} displayName={displayName} />;
  // pm (and hr/client fallback) → PM dashboard
  return <PMDashboard displayName={displayName} />;
}
```

(If a stricter "no access" state is preferred for `client`, branch on it before the fallback — but PM fallback matches the existing `defaultTab` behavior and is the safer default.)

## Testing Checklist
- [ ] Sidebar shows a single "Dashboard" link (no "Dashboards").
- [ ] Log in as admin → only the Admin dashboard renders, no tab bar, no way to reach PM/Dev views from this page.
- [ ] Log in as PM → only PM dashboard renders.
- [ ] Log in as developer → only Dev dashboard renders; sidebar already hides Customers for dev (unchanged).
- [ ] `npx tsc --noEmit` passes (no unused-import / type errors).
- [ ] `pnpm lint` passes.

## Dependencies
- Required packages: none
- Required APIs: none (role already resolved in `page.tsx`)
- Blocked by: none

## Notes for Implementation Agent
- Role values come from `profiles.role` — note the enum uses `developer` (not `dev`) per CLAUDE.md.
- This is v2 only (`src/app/v2/...`). Do not touch the v0.1 `src/components/hub/hub-sidebar.tsx`.
- Styling stays Tailwind-class based; do not introduce new `style={{}}` beyond what already exists in these files.
- After removing the tab bar, the `#0F172A` header strip disappears — that is expected; each dashboard component renders its own header/content.

## Related
- Task 071 — v2 Dashboard: Role-Aware PM/Dev/Admin Dashboards (established the per-role dashboard components this task now hard-gates).
