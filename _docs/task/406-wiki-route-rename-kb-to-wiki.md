# 406: Rename Wiki Route `/kb` → `/wiki` (with permanent redirect)

**Created:** 2026-09-30
**Priority:** LOW
**Type:** refactor
**Recommended Tier:** fast
**Status:** Testing

---

## Overview

The Wiki page lives at `/kb` (`src/app/(hub)/kb/`, `V2_ROUTES.KB = "/kb"`) even though the feature, sidebar label and header are all "Wiki". Move the page to `/wiki` and keep every existing `/kb` bookmark/shared link working via a permanent redirect in `next.config.ts`, following the precedent of task 255's `/v2/*` redirects already in `redirects()`.

## Requirements

- [x] Rename the route directory `src/app/(hub)/kb/` → `src/app/(hub)/wiki/` (all `_wiki-*`/`_use-wiki-*` colocated modules and `page.tsx` move with it; relative imports between them stay valid, so no import edits inside the folder).
- [x] `src/config/constants.ts`: change the path value to `"/wiki"`. Decide whether to also rename the key `KB` → `WIKI` (recommended — it is referenced in only ~6 places: `src/app/page.tsx`, `_wiki-shell.tsx`, `v2-hub-header.tsx`, `v2-hub-sidebar.tsx`, `department-map.ts`, plus the constants file). If renamed, update all of them; if not, only the value changes.
- [x] `next.config.ts` `redirects()`: add `{ source: "/kb", destination: "/wiki", permanent: true }` **and** `{ source: "/kb/:path*", destination: "/wiki/:path*", permanent: true }`. Place them so the query string (`?page=`, `?product=` etc. used by `_wiki-shell.tsx`'s `router.replace`) is preserved — Next.js redirects preserve the query by default; confirm.
- [x] `src/components/hub/hub-header.tsx` has a legacy `"/kb"` title entry (v0.1 header) — update or remove per whether that header is still used.
- [x] Verify auth/role gating: `role-access.ts` / `requireRole` / `department-map.ts` must still allow the same roles on `/wiki` (they read `V2_ROUTES.KB`, so the value change should carry over, but confirm no hard-coded `"/kb"` string remains — grep for `/kb`).
- [x] Dev server restart needed for the `next.config.ts` change to take effect.

## Out of Scope / Must-Not-Change

- **API routes:** `/api/kb/*` (`lint`, `upload`, `[customerId]`) are the legacy v0.1 KB API, unrelated to `/api/wiki/*`, and stay as is.
- **`src/app/_hub_(OLD)/kb/`** — archived old hub, not routed; leave untouched (its `/api/kb` fetches are unaffected).
- `/api/wiki/*` paths, the `wiki_*` tables, and the Wiki's internal query-param scheme.
- `src/app/api/admin/zoho-export/desk-kb` — Zoho Desk KB export, unrelated to this route.
- Any git operations (user manages version control).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/kb/` → `src/app/(hub)/wiki/` | Move (rename dir) | New route segment |
| `src/config/constants.ts` | Modify | `"/wiki"` value (and key rename if chosen) |
| `next.config.ts` | Modify | Two permanent redirects `/kb` and `/kb/:path*` → `/wiki` |
| `src/app/page.tsx`, `src/app/(hub)/wiki/_wiki-shell.tsx`, `src/app/(hub)/_components/v2-hub-header.tsx`, `src/app/(hub)/_components/v2-hub-sidebar.tsx`, `src/lib/auth/department-map.ts` | Modify (only if key renamed) | Follow `KB` → `WIKI` |
| `src/components/hub/hub-header.tsx` | Modify | Legacy `/kb` header entry |
| `CLAUDE.md` | Modify | Route-structure section still lists `kb/`; also update any doc mentioning `/kb` |

## Compatibility Touchpoints

- Permanent (308) redirects are cached aggressively by browsers — confirm the destination is final before shipping.
- Deep links from notifications/emails/MCP tool output or other code that hard-codes `/kb?…` — grep `_docs/mcp-tools.md`, `src/lib/mcp`, and notification/email builders; the redirect covers them but they should point at `/wiki` directly.
- `pathname`-based active-state logic in the sidebar/header (`v2-hub-header.tsx` maps `[V2_ROUTES.KB]`) must match the new path.
- Existing task docs/TASKS.md reference `/kb` historically — leave as-is.

## Acceptance Criteria

- [ ] `/wiki` renders the Wiki for the same roles as `/kb` did; sidebar "Wiki" item is highlighted there; header shows Knowledge / Wiki.
- [ ] `/kb`, `/kb?page=<id>`, and `/kb/anything` redirect (308) to the matching `/wiki…` URL with the query intact.
- [ ] Wiki interactions that call `router.replace(`${V2_ROUTES.…}?…`)` keep working (page selection, product switch).
- [ ] `/api/kb/*` still resolves; `npx tsc --noEmit` and `pnpm lint` pass; no remaining hard-coded `"/kb"` UI paths (grep clean apart from documented exclusions).

## Verification

```bash
npx tsc --noEmit
pnpm lint
grep -rnE "['\"`]/kb" src | grep -v "api/kb" | grep -v "_hub_(OLD)"
pnpm dev   # restart; then curl -sI localhost:3000/kb?page=x | grep -i "location\|HTTP"
```

## Implementation Notes

### What Changed
- `src/app/(hub)/kb/` moved to `src/app/(hub)/wiki/` (plain `mv`; no git).
- `V2_ROUTES.KB: "/kb"` renamed to `V2_ROUTES.WIKI: "/wiki"`; updated `src/app/page.tsx`, `wiki/_wiki-shell.tsx`, `v2-hub-header.tsx`, `v2-hub-sidebar.tsx`, `department-map.ts`.
- `next.config.ts`: permanent redirects `/kb` → `/wiki` and `/kb/:path*` → `/wiki/:path*` (query string is preserved by Next.js by default).
- `hub-header.tsx` legacy title entry `/kb` → `/wiki` (only used by the archived `_hub_(OLD)` layout); `CLAUDE.md` route tree updated (line 72; the v2 `kb/` stub line at ~114 left as-is — it describes a different, stub v2 folder).

### Verification Run
- `npx tsc --noEmit` — PASS (cleared stale generated `.next/types` that still referenced the old path).
- Grep for hard-coded `"/kb` UI paths — clean (only `/api/kb/*`, Zoho Desk `/kbRootCategories`, and `_hub_(OLD)` remain, all documented exclusions).
- NOT run: dev server restart + `/kb` → `/wiki` redirect check (config changes need a restart), sidebar highlight, role access on `/wiki`.
