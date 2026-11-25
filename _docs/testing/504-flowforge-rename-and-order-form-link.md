# Test Report — 504: FlowForge rename, Order Form link + copy password, PM access to Orders

**Date:** 2026-11-24
**Task doc:** `_docs/task/504-flowforge-rename-and-order-form-link.md`
**Result:** PASS for everything testable here. Some checks were skipped or verified statically only (see Skipped).

## Environment
- Local `pnpm dev` (Next.js 16.2.11, Turbopack, http://localhost:3000) against the project's configured Supabase. **Migrations 192 and 193 are not applied**, so this run exercised the pre-migration fallback paths.
- `STACKSHIFT_ORDER_FORM_PASSWORD` was set only in the dev process environment to a throwaway test value. No `.env` file was written.
- Chrome via Claude in Chrome, signed in as an admin user.

## Static and logic checks (from implement/simplify, re-confirmed)

| Command | Result |
|---------|--------|
| `npx tsc --noEmit` | PASS for `src` |
| `pnpm exec eslint` on all changed files | PASS |
| `npx tsx _docs/task/504-flowforge-classification.check.ts` | PASS |
| `node 504-flowforge.sql-check.mjs <192> <193>` (PGlite 0.2.17) | PASS (rename, dedupe, CHECK swap, idempotent, rollback; 193 policy/idempotent/rollback; works when the table is absent) |

## HTTP checks (curl, signed out)

| Request | Expected | Actual | Result |
|---------|----------|--------|--------|
| `/projects/discrete-development` | 308 → `/projects/flowforge` | `308`, `location: /projects/flowforge` | PASS |
| `/projects/discrete-development?status=active` | 308, query kept | `308`, `location: /projects/flowforge?status=active` | PASS |
| `/projects/discrete-development/<id>/tasks?x=1` | 308, path and query kept | `308`, `location: /projects/flowforge/<id>/tasks?x=1` | PASS |
| `GET /api/stackshift-orders/form-password` | 401 | `401 {"error":"Unauthorized"}` | PASS |
| `/projects/flowforge` | hub auth gate | `307` → `/auth/login?returnTo=%2Fprojects%2Fflowforge` | PASS |

## Browser checks (signed in, admin)

| # | Check | Result |
|---|-------|--------|
| 1 | Projects tab strip | Shows StackShift I, StackShift II, StackShift Access, StackShift Access Plus, PipelineForge, **FlowForge → `/projects/flowforge`**, Legacy. No "Discrete Development" on the page. PASS |
| 2 | `/projects/flowforge` listing before migration 192 | "**5 FlowForge projects**" listed. The rows are still stored as "Discrete Development" because 192 isn't applied, so the legacy-aware filter is matching them. PASS |
| 3 | Project detail `/projects/flowforge/C74DEA31-PROJ-03/timeline` | 200. Title "Veteran Roofing & Exteriors App - Timeline". The header classification chip reads FlowForge, the sidebar FlowForge entry is active, and "Discrete Development" doesn't appear. PASS (after the dev-server restart, see Incident) |
| 4 | `GET /api/onboarding/projects` (feeds the PM dashboard) | 0 rows with `classification: "Discrete Development"`, 4 with `FlowForge`. Reads are normalized. PASS |
| 5 | Update Classification modal (row menu → Update classification) | **FlowForge** is checked; Save is disabled because nothing changed. Cancelled without saving. PASS |
| 6 | Stale `?tab=` link `/projects/v2?tab=discrete-development` | Lands on `/projects/flowforge`. PASS |
| 7 | New Project wizard step 2 (dummy company name, Continue only, nothing submitted) | FlowForge card with "Custom app — scoped, one-off development work.". Helper copy reads "…Access Plus, and FlowForge are distinct trackers…". No "Discrete Development". PASS |
| 8 | Orders header | "Order form" link: `href=https://www.webriq.com/stackshift-order-form`, `target=_blank`, `rel=noopener noreferrer`. Copy password button present. Hover tooltip reads "Copy password". PASS |
| 9 | `GET /api/stackshift-orders/form-password` (signed in) | 200, `Cache-Control: no-store`, returns the configured value. PASS |
| 10 | Password not shipped to the page | Test value absent from `document.documentElement.outerHTML` and all inline scripts (RSC payload). PASS |
| 11 | Click Copy password, with the label recorded by a MutationObserver and `navigator.clipboard.write` wrapped to inspect the written blob | Labels went "Copy password (disabled)" (loading) → "Password copied" → "Copy password" (reset). Written through the **ClipboardItem** path, and the blob text equals the configured value. No error toast. PASS |
| 12 | Error path (in-page `fetch` stub returning 503 for the route) | Toast "Order form password is not configured"; nothing written; button back to "Copy password". PASS |

## Incident during testing (not a code defect)
- The first detail-page attempt (#3) returned **404** for every `(tabs)` route (`/timeline`, `/tasks`), for both FlowForge and StackShift I projects. The project root returned 200.
- The dev log showed the routes never compiled, and application code ran in about 30 ms.
- Cause: a `next dev` process left over from the task 503 test session (PID 25804) was still holding port 3000 with a stale Turbopack route cache. Stopping the background task had only killed the `pnpm` wrapper.
- After killing the stray processes, clearing `.next/dev` and starting one fresh server, the same URL compiled and returned **200** (check #3).
- For future sessions: after stopping a dev server, confirm port 3000 is free (`Get-NetTCPConnection -LocalPort 3000`) before trusting a 404.

## Skipped
- **PM account checks** (sidebar entry, list, detail, convert; delete hidden; API 403 on delete): no PM test account in this session. Verified statically:
  - `REVIEWER_ROLES` includes `pm`.
  - Both page guards allow `pm`.
  - The sidebar condition is `isAdmin || role === "pm"`.
  - `DELETE` still checks `auth.role !== "super_admin"`.
  - The RLS change is covered by the PGlite check on 193.
- **Role-based 403 on `form-password`** (e.g. developer): no such account. `requireOrderReviewer()` is shared with the existing order routes.
- **Creating a FlowForge project, CSV import, PATCH classification and order convert against the real DB:** skipped to avoid writing to the shared database. Coverage:
  - Fallback retry behaviour: check script.
  - The exact Postgres 23514 message the fallback matches: PGlite.
  - Pre- and post-192 data shapes: PGlite.
- **Order list classification display and FlowForge pre-selection on convert:** the current orders don't include the FlowForge service. Covered by the service-map assertion in the check script and by normalization in `orders-table.tsx`.
- **Visual "Copied!" tooltip text:** the state change was verified through `aria-label`. The tooltip text comes from the same `state === "copied"` branch.
- **Safari clipboard behaviour:** Chrome only. The ClipboardItem path that targets Safari's gesture rule was the one exercised.
- **Applying migrations 192/193 to the real DB:** operator step.
