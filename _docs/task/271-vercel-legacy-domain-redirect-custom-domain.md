# 271: Redirect Legacy `*.vercel.app` URL to Official Custom Domain

**Created:** 2026-08-18
**Priority:** LOW
**Type:** chore
**Recommended Tier:** fast
**Status:** Completed

---

## Overview

The official custom domain `centralhub.webriq.cloud` is now attached to the Vercel project (previously the app was only reachable at the Vercel-provided `webriq-central-hub-lime.vercel.app`). Old bookmarks, shared links, and any external references still point at the `.vercel.app` URL, so requests arriving on that host need to permanently redirect to the same path on the custom domain.

## Requirements

- [x] Any request to `webriq-central-hub-lime.vercel.app` (any path) redirects to the same path on `https://centralhub.webriq.cloud`.
- [x] Redirect is permanent (308), not temporary — this is a durable domain migration, not a maintenance-mode bounce.
- [x] No change to redirect behavior for requests already arriving on the custom domain or on `localhost` during development.
- [x] Redirect is codified in the repo (not left as a manual, undocumented Vercel dashboard toggle) so it survives redeploys and is visible in version control.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `next.config.ts` | Modify | Add a host-matched entry to the existing `redirects()` array |

## Implementation Notes

### What Changed
Added a new entry to `next.config.ts`'s existing `redirects()` array (which already handled the task-255 `/v2/*` → `/*` migration redirects), using Next.js's `has` host-matching condition:

```ts
{
  source: "/:path*",
  has: [
    {
      type: "host",
      value: "webriq-central-hub-lime.vercel.app",
    },
  ],
  destination: "https://centralhub.webriq.cloud/:path*",
  permanent: true,
},
```

This matches on the request's `Host` header rather than path, so it only fires for traffic actually arriving on the legacy Vercel-provided domain — requests to `centralhub.webriq.cloud` or `localhost:3000` are unaffected. `permanent: true` emits a 308 (permanent redirect, method-preserving), appropriate since the `.vercel.app` URL is being retired in favor of the custom domain going forward, not temporarily unavailable.

### Files Changed
- `next.config.ts` — one new entry added to the `redirects()` array, ahead of the existing `/v2/*` entries.

### Verification Run
- `npx tsc --noEmit` — not required for this change (config-only array literal, no type surface touched); config shape matches Next.js's documented `Redirect` type (`source`/`has`/`destination`/`permanent`), same pattern as the two pre-existing entries in the same array.
- No live deploy/browser verification — the redirect only takes effect against Vercel's edge once deployed (Vercel `Host`-based routing isn't reproducible against `localhost` in dev). Note left for the user: Vercel's dashboard (Project → Settings → Domains → the `.vercel.app` entry → "Redirect to another domain") offers an equivalent platform-level toggle that would apply immediately without waiting on a deploy; the two approaches are redundant, not conflicting, if both are enabled.
