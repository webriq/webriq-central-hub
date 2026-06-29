# 085: Auth Overhaul — Invitation-Only Registration, Forced Password Change & Email OTP Step-Up

**Created:** 2026-06-29
**Priority:** HIGH
**Type:** feature
**Recommended Model:** sonnet
**Status:** TESTING
**Completed:** 2026-06-29

## Implementation Notes

### Deviations from original spec

**Email provider: Nodemailer instead of Resend**
- `pnpm add resend` was installed but replaced with `pnpm add nodemailer` + `@types/nodemailer`
- Reason: no access to `webriq.com` DNS for Resend domain verification; team has existing ZeptoMail SMTP credentials
- Email helpers live in `src/lib/email/mailer.ts` (not `resend.ts` — that file is now unused)
- SMTP env vars: `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`
- ZeptoMail config: `host=smtp.zeptomail.com`, `port=587`, `user=emailapikey`

**Cookie deletion must specify `path: "/v2"`**
- `cookieStore.delete("mfa_pending")` silently fails when the cookie was set with `path: "/v2"` because delete targets `path: "/"` by default
- Fixed: use `cookieStore.set("mfa_pending", "", { maxAge: 0, path: "/v2", httpOnly: true })` for both gate cookies in all deletion sites

**Clear stale gate cookies on trusted-device login**
- A lingering `mfa_pending` cookie from a previous incomplete verification caused the proxy to redirect to `/v2/auth/verify` even when `postLoginGate` determined the device was trusted (within 7-day window)
- Fixed: `postLoginGate` now explicitly clears both `mfa_pending` and `change_password_required` cookies before returning the dashboard redirect, regardless of which gate triggered

**Untyped new tables**
- `device_sessions` and `otp_codes` are not in `src/types/database.ts` yet (migration 039 not yet reflected in generated types)
- Fixed: `const db = adminClient as any` alias in `actions.ts` with a comment — run `supabase gen types typescript` after applying migration 039 and remove the alias

### Pre-prod checklist
- [ ] Apply `supabase/migrations/039_auth_device_sessions_otp_codes.sql` via Supabase dashboard SQL editor
- [ ] Add SMTP vars to production env: `MAIL_HOST`, `MAIL_PORT`, `MAIL_USER`, `MAIL_PASS`, `MAIL_FROM`
- [ ] Run `supabase gen types typescript` and remove `db` alias in `actions.ts`
- [ ] Remove debug `console.log` statements from `postLoginGate` in `actions.ts`

> **Recommended Model:** sonnet — security-sensitive auth system, cross-cutting across DB + proxy + server actions + 6 UI files, new migration required.

---

## Overview

Replace Zoho OAuth with a clean email+password-only system augmented by three new mechanisms:

1. **Admin-only invitation** — admin sends invite from Hub; system auto-generates a 12-char temp password, emails it via Resend, creates user with `force_password_change: true` in `user_metadata`.
2. **Forced password change** — first login with temp password is gated: `proxy.ts` sets a `change_password_required` cookie, all hub routes redirect to `/v2/auth/change-password` until user sets a new password.
3. **Email OTP step-up** — on new/unrecognized device or after 7 days of inactivity, a 6-digit code is sent to the user's email; `proxy.ts` sets a `mfa_pending` cookie; hub routes redirect to `/v2/auth/verify` until verified.

No self-service signup. `/v2/auth/signup` is replaced with a redirect to login.

---

## Requirements

- [ ] Remove "Continue with Zoho" button and all `handleZohoSignIn` logic from v2 login + signup pages
- [ ] Replace `/v2/auth/signup` page with a server component that redirects to `/v2/auth/login`
- [ ] After `signInWithPassword` succeeds, login page calls `postLoginGate(deviceId, returnTo)` server action which:
  1. Checks `user.user_metadata.force_password_change` → sets `change_password_required` httpOnly cookie + returns `{ redirect: '/v2/auth/change-password' }`
  2. Checks `device_sessions` for `(user_id, device_id)` with `last_verified_at > now() - 7 days` → if missing/expired: generates OTP, sends email, sets `mfa_pending` httpOnly cookie, returns `{ redirect: '/v2/auth/verify' }`
  3. Otherwise returns `{ redirect: returnTo || '/v2/dashboard' }`
- [ ] `proxy.ts` gates (checked after session validation, before passing through):
  - `change_password_required` cookie present + path starts with `/v2/` but not `/v2/auth/` → redirect to `/v2/auth/change-password`
  - `mfa_pending` cookie present + same path condition → redirect to `/v2/auth/verify`
- [ ] `/v2/auth/change-password` — new page: new password + confirm; calls `confirmPasswordChange(newPassword)` server action; on success clears cookie and redirects to `/v2/dashboard`
- [ ] `/v2/auth/verify` — new page: 6-digit code input; reads `hub_device_id` from localStorage; calls `verifyOtpCode(code, deviceId)` server action; on success clears cookie and redirects to `/v2/dashboard`; show resend link after 60s
- [ ] Admin invite form at `/v2/(hub)/admin/hub-users/page.tsx` (replace stub): fields — full name, email, role (pm | developer | hr | admin); on submit calls `inviteUser(...)` server action; on success shows temp password in a copy-able field
- [ ] Migration 039: create `device_sessions` and `otp_codes` tables (see schema below), RLS enabled, no user-level policies (service role only via `adminClient`)
- [ ] `pnpm add resend`; add `RESEND_API_KEY` to `env.example`
- [ ] Create `src/lib/email/resend.ts` with `sendInvitationEmail(to, fullName, tempPassword)` and `sendOtpEmail(to, code)` helpers
- [ ] `hub_device_id` UUID: generated via `crypto.randomUUID()` on first login, stored in `localStorage`; read and passed to server actions from client components

---

## Out of Scope

- `/v2/callback` — leave as-is; Zoho callback cleanup is part of the separate decommission task (079)
- `(auth)/sync-zoho-role.ts` — not touched here
- Old v1 `(auth)` login/signup pages — not touched here
- "Forgot password" flow
- RLS user-level policies on the new tables (service role only for now)
- Rate limiting on OTP sends

---

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/039_auth_device_sessions_otp_codes.sql` | Create | New tables for device trust + OTP codes |
| `src/lib/email/resend.ts` | Create | Resend email helpers for invitation + OTP |
| `env.example` | Modify | Add `RESEND_API_KEY` |
| `src/app/v2/(auth)/actions.ts` | Modify | Add `postLoginGate`, `inviteUser`, `confirmPasswordChange`, `verifyOtpCode` server actions |
| `src/app/v2/(auth)/auth/login/page.tsx` | Modify | Remove Zoho button; generate/read `hub_device_id`; call `postLoginGate` after sign-in |
| `src/app/v2/(auth)/auth/signup/page.tsx` | Replace | Server component that redirects to `/v2/auth/login` |
| `src/app/v2/(auth)/auth/change-password/page.tsx` | Create | Forced password change page |
| `src/app/v2/(auth)/auth/verify/page.tsx` | Create | Email OTP verification page |
| `src/app/v2/(hub)/admin/hub-users/page.tsx` | Modify | Replace stub with admin invite form |
| `src/proxy.ts` | Modify | Add cookie gate redirects for change-password and mfa |

---

## Code Context

### `src/proxy.ts` — current (full file, 46 lines)

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
        getAll() { return request.cookies.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  await supabase.auth.getClaims();
  return supabaseResponse;
}
```

Add after `await supabase.auth.getClaims()`:

```ts
const pathname = request.nextUrl.pathname;
const isHubRoute = pathname.startsWith("/v2/") && !pathname.startsWith("/v2/auth/");

if (isHubRoute) {
  if (request.cookies.get("change_password_required")?.value) {
    return NextResponse.redirect(new URL("/v2/auth/change-password", request.url));
  }
  if (request.cookies.get("mfa_pending")?.value) {
    return NextResponse.redirect(new URL("/v2/auth/verify", request.url));
  }
}
```

### `src/app/v2/(auth)/actions.ts` — add these server actions

```ts
// postLoginGate — called from login page after signInWithPassword succeeds
export async function postLoginGate(
  deviceId: string,
  returnTo?: string
): Promise<{ redirect: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { redirect: "/v2/auth/login" };

  // Gate 1: forced password change
  if (user.user_metadata?.force_password_change) {
    const cookieStore = await cookies();
    cookieStore.set("change_password_required", "1", {
      httpOnly: true, secure: true, path: "/v2", sameSite: "lax", maxAge: 3600,
    });
    return { redirect: "/v2/auth/change-password" };
  }

  // Gate 2: device/inactivity check
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: deviceSession } = await adminClient
    .from("device_sessions")
    .select("last_verified_at")
    .eq("user_id", user.id)
    .eq("device_id", deviceId)
    .single();

  if (!deviceSession || deviceSession.last_verified_at < sevenDaysAgo) {
    const bytes = randomBytes(4);
    const code = String(bytes.readUInt32BE(0) % 900000 + 100000);
    const codeHash = createHash("sha256").update(code).digest("hex");

    await adminClient.from("otp_codes").insert({
      user_id: user.id,
      code_hash: codeHash,
      expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });
    await sendOtpEmail(user.email!, code);

    const cookieStore = await cookies();
    cookieStore.set("mfa_pending", "1", {
      httpOnly: true, secure: true, path: "/v2", sameSite: "lax", maxAge: 600,
    });
    return { redirect: "/v2/auth/verify" };
  }

  const safe = returnTo?.startsWith("/v2/") ? returnTo : "/v2/dashboard";
  return { redirect: safe };
}

// confirmPasswordChange — called from /v2/auth/change-password page
export async function confirmPasswordChange(
  newPassword: string
): Promise<{ error?: string }> {
  if (newPassword.length < 8) return { error: "Password must be at least 8 characters." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired. Please log in again." };

  const { error } = await adminClient.auth.admin.updateUserById(user.id, {
    password: newPassword,
    user_metadata: { ...user.user_metadata, force_password_change: false },
  });
  if (error) return { error: error.message };

  const cookieStore = await cookies();
  cookieStore.delete("change_password_required");
  return {};
}

// verifyOtpCode — called from /v2/auth/verify page
export async function verifyOtpCode(
  code: string,
  deviceId: string
): Promise<{ error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired." };

  const codeHash = createHash("sha256").update(code).digest("hex");
  const { data: otpRecord } = await adminClient
    .from("otp_codes")
    .select("id")
    .eq("user_id", user.id)
    .eq("code_hash", codeHash)
    .eq("used", false)
    .gte("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!otpRecord) return { error: "Invalid or expired code." };

  await adminClient.from("otp_codes").update({ used: true }).eq("id", otpRecord.id);
  await adminClient.from("device_sessions").upsert(
    { user_id: user.id, device_id: deviceId, last_verified_at: new Date().toISOString() },
    { onConflict: "user_id,device_id" }
  );

  const cookieStore = await cookies();
  cookieStore.delete("mfa_pending");
  return {};
}

// inviteUser — admin-only, called from hub-users admin page
export async function inviteUser(
  email: string,
  fullName: string,
  role: "admin" | "hr" | "pm" | "developer"
): Promise<{ tempPassword?: string; error?: string }> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated." };

  const { data: profile } = await supabase
    .from("profiles").select("role").eq("id", user.id).single();
  if (profile?.role !== "admin") return { error: "Admin access required." };

  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  const bytes = randomBytes(12);
  const tempPassword = Array.from(bytes as Uint8Array)
    .map((b) => chars[b % chars.length]).join("");

  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
    user_metadata: { full_name: fullName, display_name: fullName, force_password_change: true },
  });
  if (error) return { error: error.message };

  if (data.user) {
    await adminClient.from("profiles")
      .update({ role, full_name: fullName })
      .eq("id", data.user.id);
  }

  await sendInvitationEmail(email, fullName, tempPassword);
  return { tempPassword };
}
```

### `src/app/v2/(auth)/auth/login/page.tsx` — key changes (current: 244 lines)

Replace `handleZohoSignIn` + Zoho button block (lines 27–34, 133–149) with nothing.

After `signInWithPassword` succeeds, replace `router.push(safeReturnTo(...))` with:

```ts
// Generate/read device ID
let deviceId = localStorage.getItem("hub_device_id");
if (!deviceId) {
  deviceId = crypto.randomUUID();
  localStorage.setItem("hub_device_id", deviceId);
}
const { redirect: dest } = await postLoginGate(deviceId, searchParams.get("returnTo") ?? undefined);
router.push(dest);
router.refresh();
```

Also remove the Zoho-specific error handling: `searchParams.get("error") === "oauth_failed"` check (line 18).

### Migration schema

```sql
-- 039_auth_device_sessions_otp_codes.sql

CREATE TABLE IF NOT EXISTS device_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  last_verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_id)
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE device_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE otp_codes ENABLE ROW LEVEL SECURITY;
-- No user-level policies; accessed only via service role (adminClient)
```

### `src/lib/email/resend.ts`

```ts
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendInvitationEmail(to: string, fullName: string, tempPassword: string) {
  await resend.emails.send({
    from: "WebriQ Hub <noreply@webriq.com>",
    to,
    subject: "You've been invited to WebriQ Central Hub",
    text: [
      `Hi ${fullName},`,
      ``,
      `You've been invited to join WebriQ Central Hub.`,
      ``,
      `Email: ${to}`,
      `Temporary Password: ${tempPassword}`,
      ``,
      `Sign in at: ${process.env.NEXT_PUBLIC_APP_URL ?? "https://hub.webriq.com"}/v2/auth/login`,
      `You will be prompted to set a new password after your first login.`,
    ].join("\n"),
  });
}

export async function sendOtpEmail(to: string, code: string) {
  await resend.emails.send({
    from: "WebriQ Hub <noreply@webriq.com>",
    to,
    subject: `${code} — Your WebriQ Hub verification code`,
    text: [
      `Your verification code is: ${code}`,
      ``,
      `This code expires in 10 minutes.`,
      `If you did not request this, contact your administrator.`,
    ].join("\n"),
  });
}
```

---

## Implementation Steps

1. **Install Resend** — `pnpm add resend`; add `RESEND_API_KEY=your_key_here` to `env.example`

2. **Migration 039** — create `supabase/migrations/039_auth_device_sessions_otp_codes.sql` with the schema above; apply via `supabase db push` or Supabase dashboard

3. **Email helpers** — create `src/lib/email/resend.ts` using the snippet above; add `NEXT_PUBLIC_APP_URL` to `env.example` if not present

4. **Server actions** — update `src/app/v2/(auth)/actions.ts`:
   - Add imports: `cookies` from `next/headers`, `randomBytes`, `createHash` from `node:crypto`, `adminClient` from `@/lib/supabase/admin`, `sendOtpEmail`, `sendInvitationEmail` from `@/lib/email/resend`
   - Remove `signUp` (no longer needed)
   - Add `postLoginGate`, `confirmPasswordChange`, `verifyOtpCode`, `inviteUser` per the snippets above

5. **proxy.ts** — add the `isHubRoute` gate block after `await supabase.auth.getClaims()` per the snippet above

6. **Login page** (`src/app/v2/(auth)/auth/login/page.tsx`):
   - Remove `handleZohoSignIn` function (lines 27–34)
   - Remove Zoho SSO button block (lines 133–149 — the `<div className="mb-6">` containing the Zoho button)
   - Remove the divider below it (lines 151–156)
   - Remove `zoho_oauth_failed` error check from initial state (line 18)
   - Remove `Eye`, `EyeOff` icon imports if only used for password — keep them (password field stays)
   - After `signInWithPassword` succeeds, replace `router.push(safeReturnTo(...))` with deviceId read/generate + `postLoginGate` call
   - Import `postLoginGate` from `@/app/v2/(auth)/actions`

7. **Signup page** — replace entire file content with:
   ```tsx
   import { redirect } from "next/navigation";
   export default function SignUpPage() {
     redirect("/v2/auth/login");
   }
   ```

8. **Change-password page** — create `src/app/v2/(auth)/auth/change-password/page.tsx` as a `"use client"` component:
   - Form: new password input + confirm password input (both with show/hide toggle)
   - Password strength indicator (reuse `PasswordStrength` component inline or copy from signup page)
   - On submit: call `confirmPasswordChange(newPassword)`; on success `router.push("/v2/dashboard")`
   - Match the existing auth page visual style (same layout shell as login page: hero panel left, form right)

9. **Verify page** — create `src/app/v2/(auth)/auth/verify/page.tsx` as a `"use client"` component:
   - Heading: "Check your email" with subtext "We sent a 6-digit code to your email address."
   - Single 6-digit code input (type="text" inputMode="numeric" maxLength={6})
   - On submit: read `hub_device_id` from localStorage, call `verifyOtpCode(code, deviceId)`; on success `router.push("/v2/dashboard")`
   - "Resend code" link that becomes active after 60s countdown; on click re-calls `postLoginGate` (need to re-read deviceId from localStorage)
   - Match auth page visual style

10. **Admin hub-users page** — update `src/app/v2/(hub)/admin/hub-users/page.tsx`:
    - `"use client"` component
    - Form: full name (text), email, role dropdown (`pm | developer | hr | admin`)
    - On submit: call `inviteUser(email, fullName, role)`
    - On success: show a result card with temp password in a monospace copy-able field (`<code>`) + "Invitation sent to {email}" message
    - Clear form on success for next invite
    - Show error inline if inviteUser returns `{ error }`

---

## Acceptance Criteria

- [ ] Login page shows no Zoho button; email+password form works
- [ ] Navigating to `/v2/auth/signup` redirects immediately to `/v2/auth/login`
- [ ] Admin can invite a user from hub-users page; temp password appears on screen; invitation email is received
- [ ] First login with temp password → redirected to `/v2/auth/change-password`; cannot reach hub until password changed
- [ ] After password change, user reaches dashboard; subsequent login uses new password (not temp)
- [ ] Logging in from a new browser → OTP email received; entering correct code grants access; incorrect code shows error
- [ ] Logging in from same browser within 7 days → no OTP required
- [ ] Logging in from same browser after 7 days → OTP required again
- [ ] Direct navigation to `/v2/dashboard` while `mfa_pending` cookie is set → redirected to `/v2/auth/verify`
- [ ] Direct navigation to `/v2/dashboard` while `change_password_required` cookie is set → redirected to `/v2/auth/change-password`
- [ ] `npx tsc --noEmit` passes with no errors

---

## Verification

```bash
pnpm build
npx tsc --noEmit
```

Manual browser acceptance:
1. Invite a user as admin → check email received
2. Log in with temp password → confirm redirect to change-password
3. Change password → confirm dashboard access
4. Log out and log in again → confirm no OTP (same device, fresh session)
5. Clear localStorage → log in → confirm OTP required
6. Enter wrong code → confirm error; enter correct code → confirm dashboard access

---

## Compatibility Touchpoints

- `proxy.ts` is the session refresh layer — added gate redirects must not break the cookie `setAll` flow. Gates are inserted **after** `await supabase.auth.getClaims()` and before `return supabaseResponse`.
- `adminClient` is imported in `actions.ts` (server-only file with `"use server"`) — this is safe; `adminClient` from `@/lib/supabase/admin` throws on `window !== undefined`.
- `handle_new_user()` trigger (migration 026) auto-creates `profiles` row with `role = 'client'` on user creation. `inviteUser` must update the profile role **after** creation, not as part of `createUser`.
- New tables (`device_sessions`, `otp_codes`) are not in `src/types/database.ts`. After migration, run `supabase gen types typescript` and update `database.ts` if type safety is needed; otherwise use raw `.from("device_sessions")` calls with explicit types.
