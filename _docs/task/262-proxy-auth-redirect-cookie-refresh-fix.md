# 262: Fix proxy.ts Session-Refresh Header Bug + Missing Auth-State Redirects

**Created:** 2026-08-18
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Two related auth/redirect defects in `src/proxy.ts`:

1. **Intermittent false "redirect to /auth/login" on Dashboard / Time Logs nav.** Root cause found by inspection: `proxy.ts` clones `request.headers` into a local `requestHeaders` *before* calling `supabase.auth.getClaims()`. When `getClaims()` triggers a token refresh, the Supabase SSR client's `setAll` callback correctly calls `request.cookies.set(...)` (which mutates the live request's `Cookie` header) but then rebuilds `supabaseResponse` from the **stale pre-refresh `requestHeaders` clone**, not from the now-updated `request.headers`. Result: the browser *does* receive the new session cookie (for the *next* navigation), but the Server Components rendering the *current* navigation (`(hub)/layout.tsx`, `dashboard/timelogs/page.tsx`, etc. — all of which call `createClient()` → `cookies()` from `next/headers`) still see the expired pre-refresh cookie, so their own `getClaims()` returns no claims and they `redirect("/auth/login")`. This only fires when a refresh happens mid-navigation, matching the reported intermittency and the "log out, log back in fixes it" workaround (a fresh session doesn't need a refresh for a while).
2. **Missing auth-state redirects.** Visiting `/auth/login` while already authenticated does not redirect to `/dashboard` (no guard exists anywhere — `(auth)/layout.tsx` is a bare `<Suspense>` wrapper, `login/page.tsx` is a client component with no session check). The opposite direction (unauthenticated → `/dashboard` redirects to `/auth/login`) is already enforced per-page (`(hub)/layout.tsx:8-16`, `dashboard/timelogs/page.tsx:16-17`, etc.), so it's not actually broken today, but the user asked for it to live in `proxy.ts`/middleware for symmetry and to avoid a full render-then-redirect round trip.

The device/OTP "new device login" guardrail (`postLoginGate`, `verifyOtpCode`, `device_sessions`, `otp_codes`, `gate-cookies.ts`, `otp-lockout.ts` in `src/app/(auth)/actions.ts` + `src/lib/auth/`) is a **separate mechanism**, fully independent of this bug — it runs as a Server Action after `signInWithPassword` succeeds, using its own `mfa_pending` / `change_password_required` cookies which `proxy.ts` already reads correctly. Confirmed by code read: this flow is intact and unaffected by either defect above. This task must not change its behavior — see Out of Scope.

## Requirements

- [ ] Fix the `setAll` cookie/header-forwarding bug in `proxy.ts` so a mid-request token refresh is visible to the *current* request's Server Components, not just the next navigation.
- [ ] Authenticated user visiting `/auth/login` → redirect to `/dashboard`.
- [ ] Unauthenticated user visiting any hub route → redirect to `/auth/login?returnTo=...`, enforced centrally in `proxy.ts` (in addition to, not replacing, the existing per-page/layout guards).
- [ ] `mfa_pending` / `change_password_required` gate cookies continue to be honored exactly as today, and take effect correctly for a user who is authenticated-but-gated (verified: `postLoginGate` sets these cookies only after a real Supabase session already exists, so the new "authenticated → redirect off /auth/login" branch will bounce a mid-MFA user through `/dashboard` and immediately back into the existing gate check to `/auth/verify` / `/auth/change-password` — not a regression, but must be verified manually).

## Out of Scope / Must-Not-Change

- `src/app/(auth)/actions.ts` (`postLoginGate`, `verifyOtpCode`, `checkOtpLockout`, etc.) — the new-device/OTP guardrail logic itself is not touched.
- `src/lib/auth/gate-cookies.ts`, `src/lib/auth/otp-lockout.ts`, `src/lib/auth/device-id.ts` — untouched.
- `(hub)/layout.tsx` and per-page auth guards (e.g. `dashboard/timelogs/page.tsx`) — leave their existing `getClaims()` + `redirect()` checks in place as defense-in-depth; do not remove them even though the new proxy-level check makes them redundant on the happy path.
- `next.config.ts` PWA options (`cacheOnFrontEndNav`, `aggressiveFrontEndNavCaching`) — considered as a possible contributing factor during investigation but the header-forwarding bug is a concrete, sufficient root cause for symptom #1. Do not touch PWA config in this task; revisit only if manual testing after the proxy fix still reproduces stale-redirect behavior.
- `requireRole` / `role-access.ts` — unrelated (route-level RBAC, not session auth).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/proxy.ts` | Modify | Fix stale-header bug in `setAll`; add `/auth/login`-when-authenticated and hub-route-when-unauthenticated redirects |

## Code Context

### File: `src/proxy.ts` (current, full file)

```ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function proxy(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) {
    return NextResponse.next({ request });
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname + request.nextUrl.search);

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } }); // BUG: reuses stale pre-refresh clone
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getClaims(); // result currently discarded

  const pathname = request.nextUrl.pathname;
  const nonHubPrefixes = ["/auth/", "/api/", "/callback", "/onboarding"];
  const isHubRoute = pathname !== "/" && !nonHubPrefixes.some((prefix) => pathname.startsWith(prefix));

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

Reference for the correct pattern (Supabase's own `@supabase/ssr` docs), which passes the **live, mutated `request`** — not a headers snapshot — into `NextResponse.next()`:

```ts
setAll(cookiesToSet) {
  cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
  supabaseResponse = NextResponse.next({ request }) // request.headers reflects the mutation
  cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options))
}
```

This codebase can't use that exact form because it also needs to inject `x-pathname`, which requires a headers object distinct from the raw immutable `request.headers`. The fix is to rebuild that headers object from the **current** `request.headers` (post-mutation) every time `setAll` runs, instead of reusing a pre-refresh snapshot.

### File: `src/app/(hub)/layout.tsx:8-16` (existing unauth guard — reference for `returnTo` construction, do not modify)

```tsx
const { data } = await supabase.auth.getClaims();
if (!data?.claims) {
  const pathname = (await headers()).get("x-pathname") ?? "";
  const returnTo = pathname && pathname.startsWith("/") && !pathname.startsWith("//")
    ? `?returnTo=${encodeURIComponent(pathname)}`
    : "";
  redirect(`/auth/login${returnTo}`);
}
```

## Implementation Steps

1. In `proxy.ts`, compute the `x-pathname` value once (`const pathnameValue = request.nextUrl.pathname + request.nextUrl.search`).
2. Replace the `requestHeaders` pre-clone approach: inside `setAll`, after mutating `request.cookies`, build the forwarded headers from the **current** `request.headers` (`new Headers(request.headers)`), set `x-pathname` on that fresh copy, and use it to construct `supabaseResponse`. Also build the *initial* `supabaseResponse` (before `getClaims()` runs, in case `setAll` never fires) the same way, from `request.headers` at that point, so both paths are consistent.
3. Capture `const { data } = await supabase.auth.getClaims();` (currently discarded) and derive `const isAuthenticated = !!data?.claims;`.
4. Add, in this order, after the existing `pathname` / `isHubRoute` computation:
   - `if (pathname === "/auth/login" && isAuthenticated) return NextResponse.redirect(new URL("/dashboard", request.url));`
   - `if (isHubRoute && !isAuthenticated) return NextResponse.redirect(new URL(`/auth/login?returnTo=${encodeURIComponent(pathname + request.nextUrl.search)}`, request.url));`
   - Keep the existing `change_password_required` / `mfa_pending` block unchanged, directly after (it only runs for `isHubRoute`, and only authenticated users reach it since the previous branch already bounced unauthenticated ones).
5. Leave the matcher config and the "Supabase not configured" early-return untouched.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` passes.
- [ ] `pnpm lint` passes.
- [ ] Manual: while logged out, navigating directly to `/dashboard` or `/dashboard/timelogs` redirects to `/auth/login?returnTo=...`, and after logging in lands back on the originally requested page.
- [ ] Manual: while logged in, navigating to `/auth/login` (address bar) redirects immediately to `/dashboard`.
- [ ] Manual: repeatedly click Dashboard / Time Logs in the sidebar over a span that crosses a token-refresh boundary (or force it by testing with a short-lived session / throttling) without being bounced to `/auth/login`.
- [ ] Manual regression — new device login guardrail: sign in from a device/browser profile with no `device_sessions` row → OTP email sent, `/auth/verify` shown, correct code accepted → lands on `/dashboard` (or `returnTo`), `device_sessions.last_verified_at` updated.
- [ ] Manual regression — trusted device (verified within 7 days) skips OTP and goes straight to `/dashboard`.
- [ ] Manual regression — `force_password_change` account is routed to `/auth/change-password` and cannot reach `/dashboard` by typing `/auth/login` in the address bar mid-gate (should bounce back to `/auth/change-password`, not get stuck or loop).
- [ ] Manual regression — OTP lockout (too many wrong codes) still redirects to `/auth/verify` with the locked message, not `/dashboard`.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manual browser walkthrough of the acceptance criteria above
```

## Compatibility Touchpoints

None — `proxy.ts` is internal request handling; no packaging, docs, or adapter surface affected.

## Implementation Notes

### What Changed
- `src/proxy.ts`: replaced the stale-headers pattern (`requestHeaders` cloned once, before any cookie refresh) with a `buildForwardedHeaders()` helper that always builds from the *current* `request.headers`, so a token refresh triggered by `getClaims()` is visible to the same request's Server Components immediately, not just on the next navigation.
- `src/proxy.ts`: captured `getClaims()`'s `data` (was previously discarded) and derived `isAuthenticated`.
- `src/proxy.ts`: added `pathname === "/auth/login" && isAuthenticated` → redirect to `/dashboard`.
- `src/proxy.ts`: added `isHubRoute && !isAuthenticated` → redirect to `/auth/login?returnTo=...`, placed before the existing `change_password_required`/`mfa_pending` cookie checks so those only run for confirmed-authenticated users (matches how `postLoginGate` sets those cookies — only after a real session already exists).

### Files Changed
- `src/proxy.ts` — the only file touched, exactly as scoped in Proposed File Changes.

### Deviations From Plan
- None. Implementation followed Implementation Steps 1–5 as written.

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (2 pre-existing warnings in an unrelated file, `(hub)/portfolio-tracker/[projectId]/onboarding-workspace/_checklist-tab.tsx`, untouched by this change)
- Manual (via claude-in-chrome, logged in as an existing Super Admin session against `pnpm dev`):
  - Authenticated → navigated to `/auth/login` → immediately redirected to `/dashboard`. PASS
  - Authenticated → clicked Time Logs then Dashboard in the sidebar → both navigated correctly with no bounce to `/auth/login`, no console errors. PASS
  - Authenticated → direct navigation to `/dashboard/timelogs` rendered normally (no false redirect). PASS
- Manual — SKIPPED (could not be exercised in this session, needs the user's own follow-up):
  - Unauthenticated → hub route → `/auth/login?returnTo=...`: the only available browser session already had a valid cookie (real logged-in Chrome profile), so a genuinely logged-out request couldn't be produced without signing out of the user's real session. Logic reviewed by inspection (mirrors the already-working `(hub)/layout.tsx` guard, just centralized and unconditional on `isHubRoute`).
  - Token-refresh-mid-navigation race (the actual root cause of the original sidebar bug): requires a near-expiry JWT at the moment of navigation, not reliably reproducible on demand in a short session.
  - New-device OTP flow, trusted-device skip, force-password-change gate, OTP lockout: require a second real device/browser profile and live email OTP delivery — not exercised here. Code path is unchanged by this fix (verified by inspection in the Overview) but should be spot-checked by the user per the task's Acceptance Criteria.

## Quality Gate Notes

### Result
PASS

### Standards Review
- `src/proxy.ts` is the only file in scope; confirmed via `git diff --name-only` — `src/lib/email/mailer.ts` also shows modified but that change predates this task (present in the session's starting `git status`) and was not touched during this task.
- The `buildForwardedHeaders()` extraction directly targets the root cause (two call sites previously reconstructed forwarded headers differently — the duplication itself was the bug); appropriate deduplication, not premature abstraction.
- Naming is accurate and self-explanatory (`isAuthenticated`, `isHubRoute`, `pathnameValue`, `buildForwardedHeaders`).
- No unused code, no `any`, no added nesting — the two new redirect branches are flat early-returns consistent with the existing `change_password_required`/`mfa_pending` branches below them.
- The `// Task 262 — ...` comment follows this file's and codebase's established convention of citing the task number for non-obvious "why" context (matches existing `// Task 255 —`, `// Task 226 —` comments already in this codebase) — not a deviation from the generic no-task-references default, since local convention overrides it here.
- No secrets, credentials, or debug logging introduced.
- Error handling for `getClaims()` failure (e.g. transient Supabase outage) is unchanged from prior behavior — pre-existing edge case, not introduced or worsened by this change, and out of scope per "only validate at system boundaries."

### Deviations
- None. Implementation matches Implementation Steps 1–5 exactly; all Requirements and Out-of-Scope boundaries hold.

### Required Fixes
- None.
