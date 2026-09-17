# 376: Finance Department — Hide Dashboard, Redirect to Orders on Sign-In

**Created:** 2026-09-17
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Follow-up to task 366 (Department-Based Access Control). Today, a Finance-department Admin's sidebar
still shows **Dashboard** alongside **Orders** (`(hub)/layout.tsx`'s department gate and
`isPathAllowedForDepartment` both special-case `/dashboard` as "always allowed, regardless of
department restriction" — see `department-map.ts:56`), and every sign-in path lands the user on
`/dashboard` first regardless of department.

User request: for the Finance department specifically, **hide `/dashboard` entirely for now** and
**land Finance users on Orders (`/stackshift-orders`) immediately on sign-in**, instead of
`/dashboard`.

**Design — a per-department "home" route, not a one-off special case.** The cleanest way to do this
without introducing an infinite-redirect risk is to generalize the existing hardcoded
`/dashboard`-is-always-allowed exception in `isPathAllowedForDepartment` into a **per-department home
route** (`DEPARTMENT_HOME`, defaulting to `/dashboard` for every department except Finance, which maps
to `/stackshift-orders`). This one map then drives three things consistently:

1. **Nav visibility** — the sidebar's `Dashboard` item is a normal `workItems` entry filtered through
   `isPathAllowedForDepartment` (`v2-hub-sidebar.tsx:52,118-119`); once `/dashboard` is no longer
   Finance's home, it's no longer auto-allowed, and since it's also not in
   `DEPARTMENT_NAV_RESTRICTION.Finance` (`[STACKSHIFT_ORDERS]`), the filter now correctly drops it —
   **no sidebar-specific change needed**, this falls out of the `isPathAllowedForDepartment` fix. The
   "Announcements" stub item (`peopleItems`, also pointed at `V2_ROUTES.DASHBOARD` as a placeholder)
   is dropped the same way — an intended side effect, not a separate case to special-case around.
2. **Direct/bookmarked navigation safety net** — `(hub)/layout.tsx`'s department gate
   (`if (!isPathAllowedForDepartment(pathname, departmentName)) redirect(V2_ROUTES.DASHBOARD);`)
   currently always bounces a disallowed path to `/dashboard`. For Finance, `/dashboard` itself would
   now BE the disallowed path being bounced *from* in some cases — bouncing to it would either
   contradict "hide it" or, if `/dashboard` also isn't allowed, risk an infinite redirect loop. Fixing
   the fallback to `getDepartmentHome(departmentName)` (→ `/stackshift-orders` for Finance) closes
   this for every hub URL a Finance user could land on directly (bookmark, typed URL, stale link),
   not just the sidebar.
3. **Sign-in landing page** — see below.

**Sign-in paths.** Two code paths hardcode `/dashboard` as the post-login destination when no (or no
valid) `returnTo` is present:
- `postLoginGate`'s trusted-device fast path (`(auth)/actions.ts:91`) — the normal email/password
  login flow once a device is already verified. Currently: `returnTo ?? "/dashboard"`, no department
  awareness at all.
- `verify/page.tsx:127` — after a **new/untrusted device** completes OTP verification, hardcoded
  `router.push("/dashboard")`, entirely independent of `postLoginGate`.

Both need to land a Finance user on `/stackshift-orders` instead. Rather than duplicating a
department lookup in both places, `verify/page.tsx` is changed to call `postLoginGate(deviceId)`
again after a successful OTP verify (the `device_sessions` row was just upserted as trusted by
`verifyOtpCode`, so this second call takes the same trusted-device fast path and returns the correct,
now department-aware destination) and navigate to its `redirect` field — mirroring the exact pattern
`login/page.tsx:46-52` already uses. This keeps the department-aware destination logic in exactly one
place (`postLoginGate`).

**Deliberately not touched (self-heals via the layout gate instead):** the Zoho OAuth callback page
(`(auth)/callback/page.tsx:34`, also hardcodes `"/dashboard"`) and `proxy.ts`'s
already-authenticated-`GET`-to-`/auth/login` redirect (also targets `/dashboard`). Finance-department
accounts are created via the standard invite flow (`inviteUser()`, email+password), not Zoho sync, so
this path is not a realistic way a Finance admin signs in today. Even if it were exercised, `(hub)
/layout.tsx`'s department gate (fixed above) still catches the resulting `/dashboard` page load and
immediately bounces to `/stackshift-orders` — one extra client-side hop, not a broken or hidden page.
Not worth touching two more files for a login path Finance doesn't use, but flagged here rather than
silently ignored.

## Requirements

- [ ] A Finance-department user's sidebar no longer shows **Dashboard** (only **Orders** remains,
      consistent with `DEPARTMENT_NAV_RESTRICTION.Finance`).
- [ ] A Finance-department user who completes a normal (trusted-device) email/password login lands
      directly on `/stackshift-orders`, not `/dashboard`.
- [ ] A Finance-department user who signs in on a new/untrusted device (OTP verification required)
      also lands on `/stackshift-orders` after entering the correct code, not `/dashboard`.
- [ ] A Finance-department user who navigates directly to `/dashboard` (typed URL, bookmark, stale
      link) is redirected to `/stackshift-orders`, not shown the Dashboard page.
- [ ] A Finance-department user who navigates to any other disallowed hub URL is still redirected to
      `/stackshift-orders` (the existing "disallowed → redirect" behavior, just to the new home).
- [ ] Every other department (Business Team, Enterprise Team, HR, Project Management) and unassigned
      users are completely unaffected — `/dashboard` remains their home, visible in nav, and the
      sign-in/redirect destination, exactly as today.
- [ ] `postLoginGate`'s explicit `returnTo` handling still works for Finance when the target is
      actually allowed (e.g. a deep link into `/stackshift-orders/[orderId]`) — only a `returnTo`
      that resolves to a *disallowed* path for that department falls back to the department home.

## Out of Scope / Must-Not-Change

- `(auth)/callback/page.tsx` (Zoho OAuth callback) and `proxy.ts`'s authenticated-`GET`-to-`/auth/login`
  redirect — not realistic Finance sign-in paths today; the `(hub)/layout.tsx` gate fix already
  guarantees correctness for them regardless (see Overview). Do not touch either file.
- `DEPARTMENT_ROLES`, `DEPARTMENT_INVITE_ROLES`, `DEPARTMENT_NAV_RESTRICTION` — unchanged; this task
  only adds a new `DEPARTMENT_HOME` map alongside them, it does not touch the existing compatibility
  matrix or restriction lists.
- `(hub)/stackshift-orders/page.tsx` / `[orderId]/page.tsx` and their role/read-only checks — already
  correct for a Finance-department Admin (role `admin` passes the page's own
  `role !== "admin" && role !== "super_admin"` gate; read-only enforcement is task 366's, untouched).
- The "Unassigned department = unrestricted" behavior — unaffected; `getDepartmentHome(null)` returns
  `/dashboard`, same as today.
- `login/page.tsx` — already correctly passes `returnTo` through to `postLoginGate` and handles its
  `redirect`/`error`/`warning` fields; no change needed there, only `postLoginGate` itself changes.
- This is scoped to hiding `/dashboard`, per the request's "for now" — no change to what happens if
  Finance later needs more than one nav item; that would revisit `DEPARTMENT_NAV_RESTRICTION`
  directly, not this task's `DEPARTMENT_HOME` addition.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/auth/department-map.ts` | Modify | Add `DEPARTMENT_HOME` map + `getDepartmentHome()` helper; change `isPathAllowedForDepartment`'s hardcoded `/dashboard` special-case to use it. |
| `src/app/(hub)/layout.tsx` | Modify | Department-gate fallback redirects to `getDepartmentHome(departmentName)` instead of hardcoded `V2_ROUTES.DASHBOARD`. |
| `src/app/(auth)/actions.ts` | Modify | `postLoginGate`'s trusted-device destination becomes department-aware: compute the department's home, and fall back to it if `returnTo`-or-default isn't allowed for that department. |
| `src/app/(auth)/auth/verify/page.tsx` | Modify | Replace the hardcoded `router.push("/dashboard")` after successful OTP verification with a second `postLoginGate(deviceId)` call (now department-aware) and navigate to its result, mirroring `login/page.tsx`'s existing pattern. |

## Code Context

### `src/lib/auth/department-map.ts` (current, relevant excerpt)

```ts
export const DEPARTMENT_NAV_RESTRICTION: Partial<Record<DepartmentName, string[]>> = {
  HR: [V2_ROUTES.DASHBOARD_USERS, V2_ROUTES.KB],
  Finance: [V2_ROUTES.STACKSHIFT_ORDERS],
};

export function isPathAllowedForDepartment(pathname: string, departmentName: string | null): boolean {
  if (!departmentName) return true; // unassigned = unrestricted until HR sets one
  const allowed = DEPARTMENT_NAV_RESTRICTION[departmentName as DepartmentName];
  if (!allowed) return true; // Business Team / Enterprise Team / Project Management
  if (pathname === V2_ROUTES.DASHBOARD) return true; // home always reachable
  return allowed.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
```

Target shape:

```ts
// Each department's "home" — always reachable regardless of DEPARTMENT_NAV_RESTRICTION, and the
// destination the department-gate fallback (hub layout) and sign-in flow (postLoginGate) land the
// user on. Defaults to the Dashboard for every department except Finance (task 376 — Dashboard is
// hidden for Finance "for now", Orders is their home instead).
export const DEPARTMENT_HOME: Partial<Record<DepartmentName, string>> = {
  Finance: V2_ROUTES.STACKSHIFT_ORDERS,
};

export function getDepartmentHome(departmentName: string | null): string {
  return DEPARTMENT_HOME[departmentName as DepartmentName] ?? V2_ROUTES.DASHBOARD;
}

export function isPathAllowedForDepartment(pathname: string, departmentName: string | null): boolean {
  if (!departmentName) return true; // unassigned = unrestricted until HR sets one
  const allowed = DEPARTMENT_NAV_RESTRICTION[departmentName as DepartmentName];
  if (!allowed) return true; // Business Team / Enterprise Team / Project Management
  if (pathname === getDepartmentHome(departmentName)) return true; // home always reachable
  return allowed.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
```

### `src/app/(hub)/layout.tsx` (current, relevant excerpt — only this line changes)

```ts
import { isPathAllowedForDepartment } from "@/lib/auth/department-map";
// ...
if (!isPathAllowedForDepartment(pathname, departmentName)) {
  redirect(V2_ROUTES.DASHBOARD);   // <-- becomes redirect(getDepartmentHome(departmentName))
}
```

### `src/app/(auth)/actions.ts:1-19,86-93` (current)

```ts
import { createClient } from "@/lib/supabase/server";
// ...

export async function signOut() { /* unchanged */ }

export async function postLoginGate(
  deviceId: string,
  returnTo?: string
): Promise<{ redirect: string; error?: string; warning?: string; locked?: boolean; lockedUntil?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { redirect: "/auth/login" };
  // ... OTP lockout, force-password-change, device/OTP gates unchanged ...

  // Device is trusted — clear any lingering gate cookies from a previous incomplete session
  await clearGateCookie("mfa_pending");
  await clearGateCookie("change_password_required");

  const safe = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/dashboard";
  return { redirect: safe };
}
```

Target shape for the trusted-device tail (everything above it in the function is unchanged):

```ts
import { getDepartmentHome, isPathAllowedForDepartment } from "@/lib/auth/department-map";

// ... inside postLoginGate, replacing the final two lines ...

// Device is trusted — clear any lingering gate cookies from a previous incomplete session
await clearGateCookie("mfa_pending");
await clearGateCookie("change_password_required");

const departmentName = await getUserDepartmentName(supabase, user.id);
const home = getDepartmentHome(departmentName);
const requested = returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//") ? returnTo : home;
const safe = isPathAllowedForDepartment(requested, departmentName) ? requested : home;
return { redirect: safe };
```

New private helper (local to this file — mirrors the join `(hub)/layout.tsx` already does inline;
not exported/shared, since layout.tsx's own combined `profiles` select stays as-is and is out of
scope to refactor here):

```ts
async function getUserDepartmentName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string
): Promise<string | null> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("department_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.department_id) return null;
  const { data: department } = await supabase
    .from("departments")
    .select("name")
    .eq("id", profile.department_id)
    .maybeSingle();
  return department?.name ?? null;
}
```

### `src/app/(auth)/auth/verify/page.tsx:112-128` (current)

```ts
const deviceId = getDeviceId();
const result = await verifyOtpCode(code.trim(), deviceId);

if (result.locked) {
  setLockedUntil(result.lockedUntil ?? null);
  setLoading(false);
  return;
}
if (result.error) {
  setError(result.error);
  setAttemptsRemaining(result.attemptsRemaining ?? null);
  setLoading(false);
  return;
}

router.push("/dashboard");
```

Target — reuse `postLoginGate` (already imported in this file for the resend flow) instead of a bare
push, mirroring `login/page.tsx:46-52`:

```ts
const deviceId = getDeviceId();
const result = await verifyOtpCode(code.trim(), deviceId);

if (result.locked) {
  setLockedUntil(result.lockedUntil ?? null);
  setLoading(false);
  return;
}
if (result.error) {
  setError(result.error);
  setAttemptsRemaining(result.attemptsRemaining ?? null);
  setLoading(false);
  return;
}

const { redirect: dest, error: gateError, warning: gateWarning } = await postLoginGate(deviceId);
if (gateError) {
  setError(gateError);
  setLoading(false);
  return;
}
router.push(gateWarning ? `${dest}?emailWarning=${encodeURIComponent(gateWarning)}` : dest);
```

### `src/app/(hub)/_components/v2-hub-sidebar.tsx:47-129` — reference only, no change needed

`Dashboard` (`workItems`) and the `Announcements` stub (`peopleItems`, also `href: V2_ROUTES.DASHBOARD`)
are both filtered through `filterByDept`/`isPathAllowedForDepartment`. Once that function's home
special-case uses `getDepartmentHome`, both drop out of a Finance user's sidebar automatically — no
sidebar-specific edit required. Verify this during testing rather than adding a redundant explicit
check here.

## Implementation Steps

1. `src/lib/auth/department-map.ts`: add `DEPARTMENT_HOME` and `getDepartmentHome()` as shown; update
   `isPathAllowedForDepartment` to call it instead of comparing against the hardcoded
   `V2_ROUTES.DASHBOARD` literal; update the comment above `DEPARTMENT_NAV_RESTRICTION` that currently
   explains the old hardcoded-`/dashboard` behavior.
2. `src/app/(hub)/layout.tsx`: import `getDepartmentHome`; change the department-gate's
   `redirect(V2_ROUTES.DASHBOARD)` to `redirect(getDepartmentHome(departmentName))`.
3. `src/app/(auth)/actions.ts`: add the private `getUserDepartmentName()` helper; import
   `getDepartmentHome`/`isPathAllowedForDepartment`; update `postLoginGate`'s trusted-device tail as
   shown.
4. `src/app/(auth)/auth/verify/page.tsx`: replace the hardcoded `router.push("/dashboard")` with the
   `postLoginGate(deviceId)` call + `gateError`/`gateWarning` handling shown above. `postLoginGate` is
   already imported in this file (used by `handleResend`), no new import needed.
5. No other files need to change — the sidebar and `(hub)/stackshift-orders` pages need no edits per
   the Code Context notes above.

## Acceptance Criteria

- [ ] `npx tsc --noEmit` passes.
- [ ] `pnpm lint` passes.
- [ ] Manual: log in as a Finance-department Admin on a trusted device → lands on
      `/stackshift-orders`, sidebar shows only **Orders** (no Dashboard, no Announcements stub).
- [ ] Manual: log in as a Finance-department Admin on a new/untrusted device → completes OTP → lands
      on `/stackshift-orders`, not `/dashboard`.
- [ ] Manual: as a signed-in Finance-department Admin, navigate directly to `/dashboard` → redirected
      to `/stackshift-orders`.
- [ ] Manual regression: log in as a non-Finance user (or unassigned department) → still lands on
      `/dashboard` (or their `returnTo`) exactly as before; Dashboard still visible in their sidebar.
- [ ] Manual regression: an HR-department user still lands on `/dashboard` on sign-in and still sees
      Dashboard + HR + Wiki in the sidebar (HR's home is untouched by this task).
- [ ] Manual regression: a Finance-department Admin with a `returnTo` pointing at an *allowed* URL
      (e.g. `/stackshift-orders/<id>`) still lands there, not force-redirected to the bare Orders list.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manual browser walkthrough of the acceptance criteria above
```

## Compatibility Touchpoints

None — purely internal routing/redirect logic; no packaging, docs, or adapter surface affected. No
migration, no new dependency.
