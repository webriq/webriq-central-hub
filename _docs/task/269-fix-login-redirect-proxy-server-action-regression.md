# 269: Fix Login Redirect — `proxy.ts` Intercepts the Post-Login Server Action (Regression from Task 262)

**Created:** 2026-08-18
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

Reported symptom: submitting the Login form with valid credentials shows no error, but the page
does not redirect to `/dashboard` — the user is left sitting on `/auth/login` with the submit
button apparently stuck.

Root cause found by inspection, and it is a same-day regression from task 262 (`src/proxy.ts`,
completed earlier today, 2026-08-18):

1. `login/page.tsx` (`handleSubmit`) first calls `supabase.auth.signInWithPassword({ email,
   password })` using the **browser** Supabase client (`@/lib/supabase/client`). `createBrowserClient`
   from `@supabase/ssr` persists the new session as cookies synchronously as part of that call, so
   by the time the promise resolves the browser already holds a valid session cookie.
2. The very next line calls the Server Action `postLoginGate(deviceId, returnTo)`
   (`src/app/(auth)/actions.ts`). Next.js Server Actions execute as a `POST` request to the
   **current page's own URL** — in this case `POST /auth/login`.
3. Task 262 added this block to `proxy.ts` (which runs on every matched request, including this
   POST):
   ```ts
   if (pathname === "/auth/login" && isAuthenticated) {
     return NextResponse.redirect(new URL("/dashboard", request.url));
   }
   ```
   Because step 1 already set the session cookie, `isAuthenticated` is now `true` for this
   `POST /auth/login` request — even though semantically it isn't a page navigation to the login
   form, it's the in-flight Server Action that's supposed to finish the login. The proxy hijacks
   it and returns a raw `302` to `/dashboard` instead of letting the action run.
4. Next.js's client-side Server Action call expects a specific action-result payload back, not an
   arbitrary redirect from middleware. The hijacked response breaks that contract, so
   `await postLoginGate(...)` never resolves the way `login/page.tsx` expects (`redirect`/`error`/
   `warning` fields) — `postLoginGate` itself never runs, `setError` is never reached, and
   `router.push` is never reached. `loading` stays `true` and the user sees no error and no
   redirect, which is exactly the reported behavior.

**Why task 262 didn't catch this:** its own doc
(`_docs/task/262-proxy-auth-redirect-cookie-refresh-fix.md`, Implementation Notes → Verification
Run) shows the `/auth/login`-redirect check was verified only by *address-bar navigation while
already logged in* ("Authenticated → navigated to `/auth/login` → immediately redirected to
`/dashboard`. PASS"). That's a `GET` request and is correct behavior. The actual login **form
submission** path — where a fresh `POST /auth/login` Server Action fires immediately after the
client just became authenticated — was never exercised in that task's manual pass, so the
regression shipped.

**Other auth forms — reviewed, not affected:**

| Page | Server Action POSTs to | Why it's safe |
|------|------------------------|----------------|
| `auth/register/page.tsx` | `/auth/register` | Not `/auth/login`, and `/auth/` is in `proxy.ts`'s `nonHubPrefixes`, so `isHubRoute` is also `false` — no redirect branch applies. |
| `auth/verify/page.tsx` | `/auth/verify` | Same as above. `postLoginGate` is also called here (Resend), but the POST target is `/auth/verify`, not `/auth/login`. |
| `auth/change-password/page.tsx` | `/auth/change-password` | Same as above. |
| `auth/forgot-password/page.tsx` | `/auth/forgot-password` | Same as above; the user also isn't authenticated at this point (no sign-in call precedes it). |

The `pathname === "/auth/login"` check in `proxy.ts` is the only redirect rule scoped to that
exact path, and `/auth/login` is the only auth page whose own client component establishes a new
session immediately before calling a Server Action on that same path — so this exact failure mode
is unique to Login. No changes needed on the other four pages; this row is the requested review.

## Requirements

- [ ] Fix `src/proxy.ts` so the `/auth/login`-while-authenticated redirect only fires for a real
      page navigation (`GET`), not for the `POST` Server Action request that completes the login
      flow (`postLoginGate`).
- [ ] Preserve task 262's intended behavior: a user who is already authenticated and navigates to
      `/auth/login` via the address bar (or a link) still gets redirected straight to `/dashboard`.
- [ ] Preserve the entire `postLoginGate` gate chain unchanged: OTP/device-verification redirect to
      `/auth/verify`, `force_password_change` redirect to `/auth/change-password`, OTP lockout
      redirect to `/auth/verify` with `locked`, and the trusted-device fast path straight to
      `/dashboard` (or `returnTo`).

## Out of Scope / Must-Not-Change

- `src/app/(auth)/actions.ts` (`postLoginGate` and everything else in that file) — the gate logic
  itself is correct; the bug is purely that `proxy.ts` never lets it run.
- `src/lib/auth/gate-cookies.ts`, `src/lib/auth/otp-lockout.ts`, `src/lib/auth/device-id.ts` —
  untouched.
- The `isHubRoute && !isAuthenticated` redirect branch and the `change_password_required` /
  `mfa_pending` cookie checks in `proxy.ts` — not implicated in this bug (no auth page's Server
  Action target falls under `isHubRoute`), leave as-is.
- The other four auth pages listed in the table above — reviewed, confirmed unaffected, no changes.
- `proxy.ts`'s `buildForwardedHeaders()` / `setAll` cookie-refresh fix from task 262 — already
  correct, not part of this bug, do not re-touch.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/proxy.ts` | Modify | Scope the `/auth/login`-while-authenticated redirect to `GET` requests only, so it no longer intercepts the login form's `POST` Server Action. |

## Code Context

### File: `src/proxy.ts` (current, relevant excerpt — see full file already read this session)

```ts
// Already authenticated users shouldn't land back on the login form.
if (pathname === "/auth/login" && isAuthenticated) {
  return NextResponse.redirect(new URL("/dashboard", request.url));
}
```

This matches on `pathname` alone, regardless of HTTP method — so it matches both a normal `GET`
page view of `/auth/login` (correct, desired) and the `POST /auth/login` Server Action fired by
`login/page.tsx`'s `postLoginGate` call right after `signInWithPassword` (incorrect — this must be
allowed through).

### File: `src/app/(auth)/auth/login/page.tsx:34-52` (the call this bug breaks — reference only, do not modify)

```tsx
const supabase = createClient();
const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
if (authError) { setError(authError.message); setLoading(false); return; }

const deviceId = getOrCreateDeviceId();
const { redirect: dest, error: gateError, warning: gateWarning } =
  await postLoginGate(deviceId, searchParams.get("returnTo") ?? undefined); // ← this POST /auth/login gets hijacked
if (gateError) { setError(gateError); setLoading(false); return; }
router.push(gateWarning ? `${dest}?emailWarning=${encodeURIComponent(gateWarning)}` : dest);
```

## Implementation Steps

1. In `src/proxy.ts`, change the authenticated-on-login-page redirect to also require a `GET`
   request:
   ```ts
   if (request.method === "GET" && pathname === "/auth/login" && isAuthenticated) {
     return NextResponse.redirect(new URL("/dashboard", request.url));
   }
   ```
2. Leave every other branch in `proxy.ts` untouched (matcher, `buildForwardedHeaders`,
   `isHubRoute` computation, the unauthenticated-hub-route redirect, and the
   `change_password_required` / `mfa_pending` checks).
3. No other files need to change — this is a single-condition fix.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` passes.
- [ ] `pnpm lint` passes.
- [ ] Manual: log out, submit the Login form with valid credentials for a **trusted device**
      (existing `device_sessions` row, `last_verified_at` within 7 days) → lands on `/dashboard`
      (or the `returnTo` target) with no visible hang and no console error.
- [ ] Manual: log out, submit Login for a device with **no** `device_sessions` row → redirected to
      `/auth/verify`, OTP email sent, correct code accepted → lands on `/dashboard`.
- [ ] Manual: submit Login for an account with `force_password_change` set → redirected to
      `/auth/change-password`, not stuck on `/auth/login`.
- [ ] Manual regression (task 262's original fix, must still hold): while already authenticated,
      navigate to `/auth/login` directly via the address bar → still redirects immediately to
      `/dashboard`.
- [ ] Manual regression: Register (invite link), Forgot Password, Change Password, and Verify
      (OTP + resend) flows all still complete and redirect correctly — confirms the other four
      auth forms were correctly unaffected and remain so.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manual browser walkthrough of the acceptance criteria above, using real credentials
```

## Compatibility Touchpoints

None — `proxy.ts` is internal request handling; no packaging, docs, or adapter surface affected.

## Implementation Notes

### What Changed
- `src/proxy.ts`: the `/auth/login`-while-authenticated redirect now also requires
  `request.method === "GET"`, so it no longer matches the `POST /auth/login` request the login
  form's `postLoginGate` Server Action sends immediately after `signInWithPassword` sets the
  session cookie. A comment citing task 269 explains why the method check exists (matches this
  file's established convention of citing the task number for non-obvious "why" context, e.g. the
  existing `// Task 262 —` comment in the same file).

### Files Changed
- `src/proxy.ts` — single-condition fix, exactly as scoped in Proposed File Changes. No other
  files touched.

### Deviations From Plan
- None. Implementation followed the Implementation Steps as written.

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (2 pre-existing warnings in an unrelated file,
  `(hub)/portfolio-tracker/[projectId]/onboarding-workspace/_checklist-tab.tsx`, same ones task
  262 also noted as pre-existing; untouched by this change)
- Manual browser walkthrough — SKIPPED (this session has no valid Hub login credentials available
  and will not guess/brute-force them). The fix is a single, narrowly-scoped condition change
  (`request.method === "GET"`) verified by code inspection against the exact regression path
  traced in the Overview: the reasoning is symmetric with task 262's own already-verified `GET`
  case (a real address-bar navigation to `/auth/login` while authenticated is unaffected — still
  `GET`, still redirects) and directly excludes the `POST` case that was being wrongly hijacked.
  **User follow-up needed** — please manually run through this task's Acceptance Criteria against
  `pnpm dev` with real credentials, in particular:
  - Submitting Login with valid credentials now reaches `/dashboard` (or the OTP/change-password
    gate) instead of hanging with no error.
  - Address-bar navigation to `/auth/login` while already authenticated still redirects to
    `/dashboard` (confirms no regression of task 262's fix).

## Quality Gate Notes

### Result
PASS

### Standards Review
- `src/proxy.ts` is the only file changed, confirmed by re-reading the live file end to end
  against the Proposed File Changes / Implementation Notes scope — exactly one condition
  (`request.method === "GET"`) added to the existing `pathname === "/auth/login" && isAuthenticated`
  check, plus an explanatory comment.
- The added comment follows this file's established convention of citing the task number for
  non-obvious "why" context (matches the existing `// Task 262 —` and `// Task 255 —` comments
  already in this file) — appropriate, not a deviation.
- No unused code, no `any`, no added nesting — the guard remains a flat early-return, unchanged in
  structure from before.
- No secrets, credentials, or debug logging introduced.
- Naming (`request.method`) is a direct, self-explanatory check; no new identifiers introduced.
- Error handling for `getClaims()` / cookie refresh is unchanged — out of scope per the task's Out
  of Scope section, and untouched by this diff.

### Deviations
- None. The implementation matches Implementation Steps exactly (one condition added to one
  branch), all Requirements are satisfied, and every Out-of-Scope boundary holds — `actions.ts`,
  the gate-cookie libs, the `isHubRoute` branches, `buildForwardedHeaders`/`setAll`, and the other
  four auth pages are all confirmed untouched by reading the live file.
- Note (not a deviation, carried from Implementation Notes): live-credential manual browser
  verification was skipped in-session for lack of a real Hub account and remains an open user
  follow-up item — already flagged in Acceptance Criteria / Implementation Notes, not a gap in
  this quality gate.

### Required Fixes
- None.
