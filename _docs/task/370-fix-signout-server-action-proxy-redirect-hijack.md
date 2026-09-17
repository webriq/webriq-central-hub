# 370: Fix Sign Out Failure — `proxy.ts` Hijacks the `signOut` Server Action

**Created:** 2026-09-17
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

Reported symptom: clicking **Sign out** in the hub sidebar (`(hub)/_components/v2-hub-sidebar.tsx:428`) throws
`[browser] ⨯ unhandledRejection: Error: An unexpected response was received from the server.` and the user is not
signed out. Reported against a **Finance-department Admin** account (see task 366) that had been active in the
dashboard for a while (server log shows sustained `/api/notifications`, `/api/v2/timer`, `/api/onboarding/projects`
polling in the minutes before the failure). Confirmed with the user this is **not** stale dev-server/HMR state — a
full `pnpm dev` restart + hard browser refresh does not fix it.

**Root cause, confirmed by reading the Next.js 16 client runtime source
(`node_modules/next/dist/esm/client/components/router-reducer/reducers/server-action-reducer.js:76-109`):**

```js
const redirectHeader = res.headers.get('x-action-redirect');
...
const contentType = res.headers.get('content-type');
const isRscResponse = !!(contentType && contentType.startsWith(RSC_CONTENT_TYPE_HEADER));

// A valid response must have `content-type: text/x-component`, unless it's an external redirect.
if (!isRscResponse && !redirectLocation) {
  const message = res.status >= 400 && contentType === 'text/plain'
    ? await res.text()
    : 'An unexpected response was received from the server.';
  ...
}
```

A Server Action's HTTP response is only valid if it's either RSC-formatted (`content-type: text/x-component`) or
carries Next's own `x-action-redirect` header (set internally when the *action itself* calls `redirect()`). **Any
other response — in particular a bare `NextResponse.redirect()` from `proxy.ts` — fails both checks and throws
exactly this error.** This is the identical failure class already fixed once in this codebase in
`_docs/task/269-fix-login-redirect-proxy-server-action-regression.md` ("Next.js's client-side Server Action call
expects a specific action-result payload back, not an arbitrary redirect from middleware").

`signOut()` (`(auth)/actions.ts:15-19`) is called **directly** from a Client Component
(`onClick={() => signOut()}` in `v2-hub-sidebar.tsx:428`), which Next.js implements as a `POST` to the **current
page's own URL** (e.g. `POST /dashboard`). `/dashboard` is an `isHubRoute` in `src/proxy.ts`. Task 269 only guarded
the one `pathname === "/auth/login"` branch with `request.method === "GET"`; its Out-of-Scope section explicitly
left the other three redirect branches alone because *"no auth page's Server Action target falls under
`isHubRoute`"* at the time. That's no longer true — `signOut()` is exactly such an action, and it was never
covered by that fix. All three remaining branches in `src/proxy.ts` have **no method/action guard** and will
short-circuit a `POST` to a hub route with a bare `NextResponse.redirect()`:

```ts
// src/proxy.ts — none of these three branches exclude a Server Action POST:
if (isHubRoute && !isAuthenticated) {
  return NextResponse.redirect(new URL(`/auth/login?returnTo=...`, request.url));   // (A)
}
if (isHubRoute) {
  if (request.cookies.get("change_password_required")?.value) {
    return NextResponse.redirect(new URL("/auth/change-password", request.url));    // (B)
  }
  if (request.cookies.get("mfa_pending")?.value) {
    return NextResponse.redirect(new URL("/auth/verify", request.url));             // (C)
  }
}
```

Branch **(A)** is the prime suspect for this specific report: `proxy.ts` calls `supabase.auth.getClaims()` on
*every* matched request — including the constant `/api/notifications` / `/api/v2/timer` polling already hitting
Supabase's auth verification on a ~1s cadence per the server log — with no error handling. If `getClaims()` returns
no claims for the sign-out `POST` (JWT already past/near expiry after sustained dashboard time, a transient
verification hiccup, or a refresh race with the concurrent polling requests all hitting the same cookie jar), proxy
judges the request unauthenticated *before* the action ever runs and returns a raw redirect — producing exactly the
observed error and leaving the session not signed out. This does not depend on the Finance department restriction
added in task 366 (`(hub)/layout.tsx`'s `isPathAllowedForDepartment` gate runs in a Server Component during render,
which correctly produces an RSC/`x-action-redirect` response — it is not implicated). The Finance-Admin account is
circumstantial (whichever account happens to be signing out when the session is borderline hits this), not causal.

The robust fix is not another one-off method guard on branch (A) — it's closing the general gap: **`proxy.ts` must
never return a bare `NextResponse.redirect()` for a request that is itself a Server Action call**, identified by
Next's own internal `next-action` request header (`ACTION_HEADER` in
`node_modules/next/dist/esm/client/components/app-router-headers.js:2`). Every exported Server Action already does
(or should do) its own server-side auth check before acting — `signOut()` needs no auth check at all, and other
actions like `postLoginGate` already call `supabase.auth.getUser()` internally — so letting a Server Action request
through unconditionally does not weaken any guarantee proxy currently provides for real page navigations.

## Requirements

- [ ] `src/proxy.ts` never intercepts a Server Action request (`next-action` header present) with
      `NextResponse.redirect(...)` — such requests pass through to `return supabaseResponse` so the action's own
      `redirect()` (if any) can produce the correctly-formatted response the client runtime expects.
- [ ] Clicking **Sign out** always succeeds and lands on `/auth/login`, including when the access token is at/near
      expiry at the moment of the click (the exact condition that reproduced this bug) — verify by holding a
      session open long enough to approach token expiry (or forcing an expired/invalid `access_token` cookie) and
      confirming Sign Out still redirects cleanly with no console error.
- [ ] The three existing redirect branches in `proxy.ts` (unauthenticated-hub-route,
      `change_password_required`, `mfa_pending`) keep working correctly for **real page navigations** (`GET`
      requests, and any non-Server-Action `POST`/form submission) — this is a broadening of the existing
      `request.method === "GET"` precedent from task 269 into a general "not a Server Action" guard, not a removal
      of the redirect logic itself.
- [ ] Task 269's `/auth/login`-while-authenticated `GET`-only guard is preserved unchanged (still correct; the new
      guard is additive).

## Out of Scope / Must-Not-Change

- `(auth)/actions.ts` (`signOut`, `postLoginGate`, and everything else in that file) — the action logic itself is
  correct; the bug is purely that `proxy.ts` can intercept its request before it runs. Do not add a redundant
  auth/session check inside `signOut()` to work around this — the actual bug is in `proxy.ts`.
- `(hub)/layout.tsx`, `isPathAllowedForDepartment`, and anything under task 366's department-based access control —
  investigated and ruled out as implicated (see Overview). Do not modify.
- `v2-hub-sidebar.tsx` — the `onClick={() => signOut()}` call pattern is standard Next.js Server Action usage and
  is not the bug; do not rewrite it to a `<form action={signOut}>` or add client-side try/catch as a workaround.
- The unrelated "Unknown" display name shown in the sidebar user card in the reported screenshot
  (`displayName ?? "Unknown"`, `v2-hub-sidebar.tsx:408`) — this means `profiles.full_name` is empty for that
  specific test account, a pre-existing data/UX gap unrelated to the sign-out crash. Not in scope for this task.
- `buildForwardedHeaders()` / the `setAll` cookie-refresh fix from task 262 — unrelated, do not re-touch.
- The `mfa_pending` / `change_password_required` cookie *semantics* — only the delivery mechanism (bare redirect
  vs. letting the action through) changes for the Server-Action case; the checks themselves are unchanged for
  normal page navigations.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/proxy.ts` | Modify | Add a `isServerAction = request.headers.has("next-action")` check; skip all three `NextResponse.redirect(...)` short-circuits (unauthenticated-hub-route, `change_password_required`, `mfa_pending`) when `isServerAction` is true, falling through to `return supabaseResponse` instead. |

## Code Context

### `src/proxy.ts` (current, full relevant body — see full file already read this session)

```ts
export async function proxy(request: NextRequest) {
  // ... env guard, buildForwardedHeaders, supabase client setup unchanged ...

  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = !!data?.claims;

  const pathname = request.nextUrl.pathname;
  const nonHubPrefixes = ["/auth/", "/api/", "/callback", "/onboarding"];
  const isHubRoute = pathname !== "/" && !nonHubPrefixes.some((prefix) => pathname.startsWith(prefix));

  if (request.method === "GET" && pathname === "/auth/login" && isAuthenticated) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (isHubRoute && !isAuthenticated) {
    return NextResponse.redirect(new URL(`/auth/login?returnTo=${encodeURIComponent(pathnameValue)}`, request.url));
  }

  if (isHubRoute) {
    if (request.cookies.get("change_password_required")?.value) {
      return NextResponse.redirect(new URL("/auth/change-password", request.url));
    }
    if (request.cookies.get("mfa_pending")?.value) {
      return NextResponse.redirect(new URL("/auth/verify", request.url));
    }
  }

  return supabaseResponse;
}
```

### Confirmed error source: `node_modules/next/dist/esm/client/components/router-reducer/reducers/server-action-reducer.js:76-109`

```js
const redirectHeader = res.headers.get('x-action-redirect');
const contentType = res.headers.get('content-type');
const isRscResponse = !!(contentType && contentType.startsWith(RSC_CONTENT_TYPE_HEADER));
if (!isRscResponse && !redirectLocation) {
  const message = res.status >= 400 && contentType === 'text/plain'
    ? await res.text()
    : 'An unexpected response was received from the server.'; // <-- exact reported error
  ...
}
```

### Confirmed header name: `node_modules/next/dist/esm/client/components/app-router-headers.js:2`

```js
export const ACTION_HEADER = 'next-action';
```

### `(auth)/actions.ts:15-19` — the action this bug breaks (reference only, do not modify)

```ts
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/auth/login");
}
```

### `_docs/task/269-fix-login-redirect-proxy-server-action-regression.md` — precedent for this exact failure class

Same root cause (`proxy.ts` returning a bare redirect in response to a Server Action's POST), fixed there by adding
`request.method === "GET"` to one branch. This task generalizes that fix to a `next-action`-header check across all
three remaining unguarded branches, since a method check alone doesn't cover this case (`signOut()`'s POST target
varies with whatever hub page the user is on, and the *unauthenticated* branch, unlike the login-page branch, has
no safe method to exclude — it must instead recognize "this is a Server Action" directly).

## Implementation Steps

1. In `src/proxy.ts`, after computing `isHubRoute`, add:
   ```ts
   // A directly-invoked Server Action (e.g. signOut()) POSTs to the current hub page's own URL.
   // It must never be intercepted with a bare redirect — Next's client runtime requires either an
   // RSC response or an `x-action-redirect` header, and a raw NextResponse.redirect() satisfies
   // neither, throwing "An unexpected response was received from the server" (task 370). Every
   // Server Action already performs its own auth check where one is needed, so letting the
   // request through here does not weaken enforcement for real page navigations.
   const isServerAction = request.headers.has("next-action");
   ```
2. Guard each of the three remaining redirect branches with `&& !isServerAction`:
   ```ts
   if (isHubRoute && !isAuthenticated && !isServerAction) { ... }
   if (isHubRoute && !isServerAction) {
     if (request.cookies.get("change_password_required")?.value) { ... }
     if (request.cookies.get("mfa_pending")?.value) { ... }
   }
   ```
3. Leave the task-269 `GET`-only `/auth/login` branch, `buildForwardedHeaders()`, `setAll`, and the matcher
   untouched.
4. No other files need to change.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` passes.
- [ ] `pnpm lint` passes.
- [ ] Manual: sign in, click Sign out promptly → redirected to `/auth/login`, no console error, session actually
      cleared (confirm a subsequent hub URL bounces back to login).
- [ ] Manual: sign in, stay idle/active on the dashboard long enough for the access token to approach or pass
      expiry (or manually corrupt/expire the `sb-*-auth-token` cookie's access token in DevTools), then click Sign
      out → still redirected cleanly to `/auth/login` with no "unexpected response" error — this is the exact
      condition that reproduced the bug.
- [ ] Manual regression (task 269, must still hold): submit Login with valid credentials → still redirects to
      `/dashboard`/`returnTo` correctly; already-authenticated `GET` navigation to `/auth/login` still bounces to
      `/dashboard`.
- [ ] Manual regression: an account with `mfa_pending` or `change_password_required` set is still redirected to
      `/auth/verify` / `/auth/change-password` on a normal **page navigation** (`GET`) to a hub route.
- [ ] Manual regression: an unauthenticated user navigating (`GET`) directly to a hub URL is still bounced to
      `/auth/login?returnTo=...`.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manual browser walkthrough of the acceptance criteria above
```

## Compatibility Touchpoints

None — `src/proxy.ts` is internal request handling; no packaging, docs, or adapter surface affected.

## Implementation Notes

### What Changed
- `src/proxy.ts`: added `isServerAction = request.headers.has("next-action")`, computed right after
  `isHubRoute`. Guarded the two remaining unguarded redirect branches with `&& !isServerAction`
  (unauthenticated-hub-route, and the `change_password_required`/`mfa_pending` cookie block). The
  task-269 `GET`-only `/auth/login` branch is unchanged. A comment above the new check explains why
  (cites task 370, mirrors the file's existing convention of citing task numbers for non-obvious
  "why" context, e.g. the existing `// Task 262 —` / `// Task 255 —` / `// task 269` comments).

### Files Changed
- `src/proxy.ts` — exactly the change scoped in Proposed File Changes / Implementation Steps. No
  other files touched.

### Deviations From Plan
- None. Implementation followed the Implementation Steps as written.

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (2 pre-existing unrelated warnings in
  `(hub)/projects/v2/[projectId]/onboarding-workspace/_checklist-tab.tsx`, same file/warnings task
  269 also noted as pre-existing; untouched by this change)
- Manual browser walkthrough (Acceptance Criteria) — NOT RUN in this session (no live browser
  session/credentials available here). **User follow-up needed** — please run through Sign Out in
  `pnpm dev`, in particular: a normal sign-out right after logging in, and a sign-out attempted
  after the session has been open long enough to approach/pass token expiry (the exact condition
  that reproduced the bug) — both should redirect cleanly to `/auth/login` with no console error.
  Also spot-check the regressions: Login still redirects correctly, an already-authenticated `GET`
  to `/auth/login` still bounces to `/dashboard`, and an unauthenticated `GET` to a hub URL still
  bounces to `/auth/login?returnTo=...`.

## Quality Gate Notes

### Result
PASS

### Standards Review
- `src/proxy.ts` is the only file changed, confirmed by re-reading the live file end to end against
  Proposed File Changes / Implementation Steps — exactly one new `const isServerAction = ...` line
  plus `&& !isServerAction` added to the two branches that lacked a guard; no other logic touched.
- The task-269 `GET`-only `/auth/login` branch correctly received **no** `isServerAction` guard —
  it's already POST-safe by construction (a Server Action's request method is always `POST`, so the
  `request.method === "GET"` condition already excludes it), and the task doc's own Implementation
  Steps scoped the new guard to only the two remaining branches. No deviation.
- The new comment follows this file's established convention of citing the task number for
  non-obvious "why" context (matches the existing `// Task 262 —` / `// Task 255 —` / `// task 269`
  comments already in the file).
- No unused code, no `any`, no added nesting — each guarded `if` keeps its original flat shape with
  one extra `&&` clause.
- No secrets, credentials, or debug logging introduced.
- Naming (`isServerAction`) is self-explanatory and consistent with the file's existing
  `isAuthenticated` / `isHubRoute` naming style.
- Verified against the codebase's actual Server Action surface (`grep -rl '"use server"' src/app`,
  excluding the retired `_hub_(OLD)`/`_auth_(OLD)` trees): only `(auth)/actions.ts` (which contains
  `signOut`), `(auth)/sync-zoho-role.ts`, and `oauth/authorize/actions.ts` are true `"use server"`
  modules today — `(hub)/dashboard/_dev/_load-dev-dashboard.ts` matched the grep only because its
  own comment explains it deliberately is *not* one. So `signOut()` is the only Server Action
  reachable from a hub-gated page right now, meaning this fix's practical blast radius is exactly
  the reported bug — no other in-scope caller is affected either way. Incidental, no-risk side
  benefit noted (not required by this task, not claimed as fixed/verified): `/oauth/authorize` also
  falls under `isHubRoute` (`nonHubPrefixes` doesn't list `/oauth/`), so the same
  `isServerAction` guard would protect any future/existing action call there too.
- Security posture check: bypassing proxy's redirect for Server Action requests does not create a
  new authorization gap — `/api/*` routes were already excluded from `isHubRoute` gating entirely
  (`nonHubPrefixes`) and have always relied on their own internal auth checks; Server Actions now
  follow the same established pattern rather than a new one.

### Deviations
- None. The implementation matches Implementation Steps exactly, all Requirements are satisfied,
  and every Out-of-Scope boundary holds — `(auth)/actions.ts`, `(hub)/layout.tsx`,
  `isPathAllowedForDepartment`, `v2-hub-sidebar.tsx`, `buildForwardedHeaders`/`setAll`, and the
  `mfa_pending`/`change_password_required` cookie semantics are all confirmed untouched.
- Note (not a deviation, carried from Implementation Notes): live-browser manual verification of
  Acceptance Criteria was not run in this session and remains an open user follow-up, already
  flagged there.

### Required Fixes
- None.

## Correction — Real Root Cause Found During Testing

The `proxy.ts` fix above is a real, valid fix for the failure class it targets, but **it was not the
cause of the reported crash**, and testing (live reproduction, both by the user and independently
in-session via browser automation) confirmed Sign Out still failed after it shipped — with the
Network tab this time showing the actual `POST /dashboard` request itself returning `431 Request
Header Fields Too Large` (and, on a second reproduction attempt, `503`).

**This is decisive: a `431`/raw-connection rejection happens in Node's HTTP layer before the request
ever reaches Next.js routing, `proxy.ts`, or the Server Action handler.** No amount of `proxy.ts`
logic can produce or prevent it — the `isServerAction` guard added above was addressing a real but
different bug that this specific report never actually triggered.

**Confirmed real cause**, found by inspecting live cookies in the browser (`document.cookie` on
`localhost:3000`): the browser was holding **four separate Supabase projects' auth-session cookies
simultaneously** — orphaned leftovers from `.env.local` pointing at different Supabase projects at
different points in this repo's history, never cleared because each project ref produces a
uniquely-named cookie (`sb-<ref>-auth-token[.N]`) that the app has no reason to know about or clear
once it's no longer the active project:

| Cookie family | Size | Status |
|---|---|---|
| `sb-tgjpkyiywktjktbsxcyr-auth-token` | 2,713 B | **Active** — matches current `NEXT_PUBLIC_SUPABASE_URL` |
| `sb-qlysmfdwfkhitpbqrwew-auth-token.*` | ~3,306 B | Orphaned |
| `sb-lsfrdidsmbirdwizfnbo-auth-token.*` | ~3,459 B | Orphaned |
| `sb-lswbatinkslhhrsgqxvn-auth-token.*` + 3 stray OAuth PKCE `code-verifier` cookies | ~4,690 B | Orphaned |

Total `Cookie` header: **15,535 bytes**, ~11.5KB of which is pure dead weight. A plain `GET` page
navigation carries this same bloated `Cookie` header and still fits under Node's default
`--max-http-header-size` (16,384 bytes) — which is why every other request in the original report
(`/dashboard`, `/api/notifications`, `/api/v2/timer`, etc.) returned `200`. A Server Action `POST`
additionally carries Next's own `Next-Action` and `Next-Router-State-Tree` request headers on top of
everything a normal navigation sends, which is just enough to tip **only** the Sign Out request over
the 16KB ceiling — explaining both why it was the one request that failed, and why it alternated
between `431` (rejected outright at the header-parsing layer) and `503` (enough of the request got
through for Next's dev server to fail internally instead) across attempts: the request sits right at
the edge, not deterministically over or under it.

**Live confirmation:** clearing the three orphaned cookie families in-browser dropped the `Cookie`
header from 15,535 → 3,191 bytes; the account was then found already signed out on the next
navigation (`/auth/login?returnTo=%2Fdashboard`) — the underlying `signOut()` call had actually been
succeeding server-side all along (session cookie cleared), it was only the malformed HTTP-layer
response that broke the client-side promise, matching the reported behavior exactly.

### Additional Fix Applied

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | `dev` and `start` scripts now set `NODE_OPTIONS='--max-http-header-size=32768'` (doubling Node's default 16KB ceiling), so a Server Action request doesn't fail even when a dev machine has accumulated bloated/orphaned session cookies across Supabase project switches. Verified: `NODE_OPTIONS='--max-http-header-size=32768' node -e "require('http').maxHeaderSize"` → `32768`. |

This is a defense-in-depth mitigation, not a cleanup of the underlying cookie bloat — orphaned
cross-project Supabase cookies are a per-developer-machine artifact from switching
`NEXT_PUBLIC_SUPABASE_URL` over time, not something the app creates or can detect/clear itself (it
only ever reads/writes the cookie name for whatever project ref is *currently* configured). Clearing
already-orphaned cookies is a one-time manual browser action per affected machine (DevTools →
Application → Cookies → delete the non-current `sb-<ref>-*` entries, or "Clear site data" for
`localhost:3000` and log back in) — not something this task automates, since the app has no way to
distinguish "orphaned from an old project" from "a session for a project this browser profile still
legitimately needs" without knowing project history it was never given.

### Requires a dev-server restart
`NODE_OPTIONS` is read at process launch, not hot-reloaded — the currently-running `pnpm dev` process
still has the old 16KB ceiling. **User follow-up needed:** stop and restart `pnpm dev`, then retest
Sign Out (ideally after also clearing any orphaned `sb-<ref>-*` cookies for extra headroom, though the
raised ceiling alone should be sufficient going forward).

### Verification Run (correction)
- `NODE_OPTIONS='--max-http-header-size=32768' node -e "console.log(require('http').maxHeaderSize)"` → `32768` — PASS
- Live browser reproduction (via browser automation, this session): confirmed the exact reported
  `[EXCEPTION] Error: An unexpected response was received from the server.` at
  `fetchServerAction`, with the underlying `POST /dashboard` returning `431` then `503` on repeated
  clicks — PASS (bug reproduced, root cause confirmed)
- Cookie inspection: confirmed 15,535 B total, 4 distinct Supabase project cookie families, only one
  matching the live `NEXT_PUBLIC_SUPABASE_URL` — PASS (cause confirmed)
- Clearing orphaned cookies dropped the header to 3,191 B and the session was found already signed
  out on next navigation — PASS (mechanism confirmed: `signOut()` itself was always correct)
- `npx tsc --noEmit` / `pnpm lint` — not re-run (no `.ts`/`.tsx` changed in this correction, only
  `package.json`)
- Full end-to-end Sign Out retest with the raised header ceiling — **NOT YET RUN**, blocked on the
  required dev-server restart above (see Implementation Notes note). **User follow-up needed.**
