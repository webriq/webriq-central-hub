# 358: Hide the "Tracker" Sidebar Tab + Redirect `/portfolio-tracker` → `/projects/v2`

**Created:** 2026-09-10
**Priority:** LOW
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Testing — implementation complete

---

## Overview

The Portfolio Tracker module was retired in task 280. Its sub-routes already
`redirect()` to their new homes under `/projects/v2`, but two loose ends remain:

1. The **"Tracker"** item is still shown in the v2 hub sidebar (Work group) to every
   non-`client`, non-`developer` role, pointing at `V2_ROUTES.PORTFOLIO_TRACKER`
   (`/portfolio-tracker`).
2. The **root** `/portfolio-tracker` page still renders a "Portfolio Tracker has
   moved" human-readable notice (task 280 deliberately left it as a notice because
   "no single redirect target makes sense for a listing"). The user is now
   overriding that call: the root route should hard-redirect to
   `/projects/v2` like its siblings.

This task removes the sidebar item and converts the root page to a `redirect()`.

## Requirements

- [ ] "Tracker" no longer appears anywhere in the v2 hub sidebar, for any role.
- [ ] Visiting `/portfolio-tracker` redirects to `/projects/v2` (`V2_ROUTES.PROJECTS_V2`).
- [ ] The redirect uses the same `redirect()` from `next/navigation` pattern as the
      sibling routes (`status-report/page.tsx`, `import/page.tsx`), not a
      `next.config.ts` rule.
- [ ] `npx tsc --noEmit` passes.
- [ ] `pnpm lint` passes (the now-unused `ChartGantt` lucide import must be dropped
      from the sidebar; `Link` / `Metadata` / `LayoutGrid` / `MoveRight` imports must
      be dropped from the root page).
- [ ] No regression to the sidebar shell, other nav items, collapse/expand state, or
      any other route.

## Out of Scope / Must-Not-Change

- **Do not touch the `/portfolio-tracker` sub-route redirect pages** —
  `[projectId]/page.tsx`, `[projectId]/onboarding-workspace/page.tsx`,
  `status-report/page.tsx`, `import/page.tsx` already redirect correctly (tasks
  277/280) and preserve deep-link query params. Leave them exactly as-is.
- **Do not delete the `src/app/(hub)/portfolio-tracker/` folder.** Deep bookmarked
  links into the sub-routes still need to resolve. Only the root `page.tsx` body
  changes.
- **Do not remove the `PORTFOLIO_TRACKER` key from `V2_ROUTES`** (`src/config/constants.ts`).
  After this change it is unused by navigation, but many in-tree code comments
  reference `V2_ROUTES.PORTFOLIO_TRACKER` / `/portfolio-tracker` as a porting
  origin; removing the key adds churn for no benefit. Leaving an unused key in an
  `as const` object does not trip lint.
- **No `next.config.ts` change.**
- **No dashboard changes** — `marketing-dashboard.tsx` / `pm-dashboard.tsx` already
  link to `V2_ROUTES.PROJECTS_V2`; their `trackerProjects` state is an API fetch,
  not a route link.
- **No header/breadcrumb change** — `v2-hub-header.tsx`'s `BREADCRUMB_MAP` has no
  `/portfolio-tracker` entry.
- No auth/role logic changes.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/_components/v2-hub-sidebar.tsx` | Modify | Delete the `...(role !== "client" && !isDev ? [ { label: "Tracker", ... } ] : [])` spread from `workItems`. Remove `ChartGantt` from the `lucide-react` import (line 10) — it has no other use in the file. |
| `src/app/(hub)/portfolio-tracker/page.tsx` | Modify | Replace the entire "has moved" notice component with a `redirect(V2_ROUTES.PROJECTS_V2)` call, mirroring `status-report/page.tsx`. Drop the now-unused `Link` / `Metadata` / `LayoutGrid` / `MoveRight` imports and the `metadata` export. |

## Code Context

### `src/app/(hub)/_components/v2-hub-sidebar.tsx` — current `workItems` head (L35–42)

```tsx
  const workItems: NavItem[] = [
    { label: "Dashboard",     icon: <LayoutDashboard size={18} />, href: V2_ROUTES.DASHBOARD, exact: true },
    ...(!isDev ? [
      { label: "Customers",   icon: <Building2 size={18} />,       href: V2_ROUTES.CUSTOMERS },
    ] : []),
    ...(role !== "client" && !isDev ? [
      { label: "Tracker",     icon: <ChartGantt size={18} />,          href: V2_ROUTES.PORTFOLIO_TRACKER },
    ] : []),
    {
      label: "Projects",
```

Remove the `Tracker` spread (the `role !== "client" && !isDev` block). Line 10
import becomes `Clock, ClipboardList,` (drop `ChartGantt`).

### Target pattern — `src/app/(hub)/portfolio-tracker/status-report/page.tsx` (whole file)

```tsx
import { redirect } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";

// Portfolio Tracker is retired (task 280) — the Overall Status Report moved to /projects/v2/status-report.
export default function PortfolioTrackerStatusReportRedirect() {
  redirect(V2_ROUTES.PROJECTS_V2_STATUS_REPORT);
}
```

### New `src/app/(hub)/portfolio-tracker/page.tsx` (full replacement)

```tsx
import { redirect } from "next/navigation";
import { V2_ROUTES } from "@/config/constants";

// Portfolio Tracker is retired (task 280 / task 358) — the module's listing now lives at
// /projects/v2 (V2 Projects). Task 280 kept this root as a human-readable "has moved" notice;
// task 358 hard-redirects it in line with the sibling sub-routes and drops the sidebar "Tracker"
// item. Sub-routes ([projectId], onboarding-workspace, status-report, import) keep their own
// param-preserving redirects.
export default function PortfolioTrackerRedirect() {
  redirect(V2_ROUTES.PROJECTS_V2);
}
```

## Implementation Steps

1. **Sidebar** — in `src/app/(hub)/_components/v2-hub-sidebar.tsx`:
   - Delete the `...(role !== "client" && !isDev ? [ { label: "Tracker", ... } ] : []),` entry from `workItems`.
   - Remove `ChartGantt` from the `lucide-react` import list on line 10.
2. **Root route** — overwrite `src/app/(hub)/portfolio-tracker/page.tsx` with the
   `redirect(V2_ROUTES.PROJECTS_V2)` version above; delete the `Link`, `Metadata`,
   `LayoutGrid`, `MoveRight` imports and the `metadata` export.
3. Run `npx tsc --noEmit` and `pnpm lint`; fix any residual unused-import fallout.
4. Browser check (see Verification).

## Acceptance Criteria

- The v2 hub sidebar (as admin / super_admin / pm) shows **Dashboard, Customers,
  Projects, Desk, Orders, Orchestration, Time Logs** in the Work group — no
  "Tracker".
- `GET /portfolio-tracker` returns a redirect (307) to `/projects/v2`; the browser
  lands on the V2 Projects listing.
- `GET /portfolio-tracker/status-report`, `/portfolio-tracker/import`,
  `/portfolio-tracker/<projectId>`, and
  `/portfolio-tracker/<projectId>/onboarding-workspace?tab=files` still redirect to
  their respective `/projects/v2/...` targets (unchanged behavior).
- `npx tsc --noEmit` — clean.
- `pnpm lint` — clean (no new warnings/errors).

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Browser (dev server):
- Load `/dashboard`, confirm no "Tracker" item in the sidebar (check as a PM/admin account).
- Navigate to `/portfolio-tracker` → should land on `/projects/v2`.
- Spot-check one sub-route, e.g. `/portfolio-tracker/status-report` → `/projects/v2/status-report`.

## Compatibility Touchpoints

None. No schema/migration, no deps, no env, no API routes, no PWA manifest, no
docs surface beyond this task file. `V2_ROUTES.PORTFOLIO_TRACKER` intentionally
retained.

## Implementation Notes

### What Changed
- Removed the "Tracker" nav item from the v2 hub sidebar's Work group (and the
  now-unused `ChartGantt` lucide import).
- Replaced the `/portfolio-tracker` root page's "Portfolio Tracker has moved"
  notice component with `redirect(V2_ROUTES.PROJECTS_V2)`, matching the sibling
  sub-route redirect pages.

### Files Changed
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` — dropped the `role !== "client" && !isDev`
  Tracker `NavItem` spread from `workItems`; removed `ChartGantt` from the
  `lucide-react` import (no other use in file).
- `src/app/(hub)/portfolio-tracker/page.tsx` — full replacement: `redirect()` to
  `/projects/v2`; removed `Link` / `Metadata` / `LayoutGrid` / `MoveRight` imports
  and the `metadata` export.

### Deviations From Plan
- None.

### Notes
- The impeccable design hook flagged 22 pre-existing literal-color / font-size
  findings in `v2-hub-sidebar.tsx`, all on lines untouched by this change. They are
  the hand-rolled `#0F172A`/`#1E293B`/etc. sidebar palette that CLAUDE.md's "UI
  Polish Conventions" explicitly sanctions for the v2 sidebar (`isDark`-prop /
  inline-style pattern, not `dark:` tokens). Left unchanged — not in scope.

### Verification Run
- `npx tsc --noEmit` — PASS (no output).
- `pnpm lint` — PASS (2 pre-existing unrelated warnings in
  `onboarding-workspace/_checklist-tab.tsx`; 0 errors).
- Browser acceptance (sidebar has no Tracker item; `/portfolio-tracker` →
  `/projects/v2`; sub-route redirects still work) — SKIPPED (no dev server run this
  session).

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. Both diffs are minimal and match the plan exactly.
- `portfolio-tracker/page.tsx` now mirrors the sibling `status-report/page.tsx` /
  `import/page.tsx` redirect pattern (same imports, same shape) — consistent.
- `ChartGantt` import correctly dropped (no remaining use); `Link` / `Metadata` /
  `LayoutGrid` / `MoveRight` correctly dropped from the root page.
- `V2_ROUTES.PORTFOLIO_TRACKER` retained as planned; sidebar was its only nav
  consumer, remaining references are code comments.
- No dead code, no `any`, no debug logging, conventions followed.

### Deviations
- None.

### Required Fixes
- None.
