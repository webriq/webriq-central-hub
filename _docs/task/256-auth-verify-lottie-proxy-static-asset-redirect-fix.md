# 256: Fix `/auth/verify` Lottie Animation — `proxy.ts` Redirecting Static Asset Requests

**Created:** 2026-08-17
**Priority:** MEDIUM
**Type:** bug
**Recommended Tier:** fast
**Status:** Completed

---

## Overview

`/auth/verify` showed a Next.js dev overlay console error on load:

```
Invalid Lottie JSON string: The provided string does not conform to the Lottie JSON format.
```

The hero-column animation (`AuthLottie` → `DotLottieReact`, `src="/assets/team-work.lottie"`) never rendered.

**Root cause:** not a corrupt/invalid Lottie file — `public/assets/team-work.lottie` is a valid zip archive (confirmed via `file`/hex-dump, and via a plain `curl` which returned the correct 27,101-byte `PK\x03\x04` payload). The bug was in `src/proxy.ts`'s matcher (line 59, pre-fix):

```ts
"/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|workbox-.*\\.js).*)"
```

This excludes only a short hardcoded list of paths from the proxy — it does **not** exclude arbitrary static files under `public/`, e.g. `/assets/team-work.lottie`. Every request to that path ran through `proxy()`, which:

1. Sets `isHubRoute = pathname !== "/" && !nonHubPrefixes.some(p => pathname.startsWith(p))` where `nonHubPrefixes = ["/auth/", "/api/", "/callback", "/onboarding"]`. `/assets/team-work.lottie` matches none of these prefixes, so `isHubRoute` evaluates `true`.
2. On `/auth/verify`, the `mfa_pending` cookie is set by design (that's the entire premise of the page — a login is mid-verification). `isHubRoute && mfa_pending cookie present` → `NextResponse.redirect(new URL("/auth/verify", request.url))`.
3. The browser's `fetch('/assets/team-work.lottie')` therefore received a **redirect to the `/auth/verify` page's own HTML**, not the `.lottie` zip file.
4. `dotlottie-web`'s `_fetchData` reads the response as an `ArrayBuffer`, checks for the `PK` zip signature, and — since the body was HTML — decodes it as text and hands it to `_loadFromData`'s string branch, which fails `R(e)`'s JSON-shape check and throws the reported error.

Confirmed live in-browser via `fetch('/assets/team-work.lottie')`: bytes started with `3c 21 44 4f 43 54 59 50` (`<!DOCTYP...`), 60,850 bytes — the `/auth/verify` page HTML — not the 27,101-byte zip a same request via `curl` (no cookies) correctly returned.

## Requirements

- [x] `/assets/team-work.lottie` (and any other static file under `public/`) must never be intercepted by `proxy.ts`'s hub-route redirect logic, regardless of which auth-gate cookie (`mfa_pending`, `change_password_required`) is set.
- [x] Fix must generalize to *all* static files under `public/`, not just this one `.lottie` file — `public/` also has `company_logo.webp` (fetched via raw `fetch` in `timelogs/_export-pdf.ts`), `logo.png`, `brand/*`, etc., which were exposed to the identical bug under the right cookie/route combination.
- [x] No change to `proxy.ts`'s actual auth-gate behavior for real page routes (`change_password_required` → `/auth/change-password`, `mfa_pending` → `/auth/verify`) — only the matcher's exclusion set changes.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/proxy.ts` | Modify | Extend the matcher's negative lookahead to exclude any request path whose last segment has a file extension, so static assets under `public/` never run through the proxy |

## Implementation Notes

### What Changed
`src/proxy.ts`'s `config.matcher` (was line 59) gained a generic `.*\\.[a-zA-Z0-9]+$` exclusion alongside the existing named exclusions:

```ts
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icons|manifest.json|sw.js|workbox-.*\\.js|.*\\.[a-zA-Z0-9]+$).*)",
  ],
};
```

Any request whose final path segment contains a file extension (`.lottie`, `.png`, `.webp`, `.jpg`, `.svg`, `.json`, `.js`, etc.) now bypasses the proxy entirely, so it can never be caught by the `isHubRoute` redirect. Real page/API routes are unaffected — none of them have a dot in their path segments (confirmed no exceptions besides `/.well-known/oauth-authorization-server`, whose last segment `oauth-authorization-server` has no extension and is unaffected by this change).

### Files Changed
- `src/proxy.ts` — matcher regex extended with a generic static-file-extension exclusion; kept the existing named exclusions as-is (now partially redundant but harmless, left for clarity).

### Verification Run
- Live browser check via Claude in Chrome (`http://localhost:3000/auth/verify`):
  - Before fix: `fetch('/assets/team-work.lottie')` returned 60,850 bytes starting `3c 21 44 4f 43 54 59 50` (HTML), console showed the `Invalid Lottie JSON string` error, hero column blank.
  - After fix (dev server hot-reloaded `proxy.ts`): `fetch('/assets/team-work.lottie')` returned 27,101 bytes starting `50 4b 03 04` (correct zip/`PK` header), no console errors, Lottie animation rendered correctly in the hero column (confirmed via screenshot).
- `npx tsc --noEmit` — not re-run for this change (single-line regex edit to a `matcher` array, no type surface touched).
