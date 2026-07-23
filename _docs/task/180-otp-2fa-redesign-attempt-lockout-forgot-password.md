# 180: OTP/2FA Verification Redesign — Digit-Box UI, Attempt Lockout, Forgot Password Flow

**Created:** 2026-07-23
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep

---

## Overview

Redesign `/v2/auth/verify` (the OTP/2FA code-entry screen) to match the provided reference mocks: a 6-box digit input (one field per digit, image 3) and a red/error state showing the number of attempts remaining (image 4). Layer a hard attempt-limit and account-lockout policy underneath it, and extend the same hardened OTP screen to a **Forgot Password** flow that does not exist yet today.

**Current state:** `verify/page.tsx` (`src/app/v2/(auth)/auth/verify/page.tsx`) is a single `<input maxLength={6}>` text field with no attempt tracking — `verifyOtpCode` (`src/app/v2/(auth)/actions.ts`) just returns `"Invalid or expired code."` forever, with unlimited retries and unlimited resends. OTP already gates two flows via `postLoginGate`: login on an untrusted device, and registration-from-invite (which calls `postLoginGate` at the end of `registerFromInvite`). There is **no forgot-password flow today** — the "Forgot password?" link on the login page (`login/page.tsx:87-90`) is a dead `href="#"`.

**Design decisions (locked in for this task):**
1. **Lockout is account-level, not per-code.** Failed attempts accumulate on the user's `profiles` row (`otp_failed_attempts`) across resends; hitting 4 sets `profiles.otp_locked_until` = now + 1 hour and blocks *all* OTP verification/resend for that account until it lapses or a Super Admin clears it — this also blocks completing login itself (device-gate OTP is a required step before reaching `/v2/dashboard`), which satisfies "you'll wait for 1 hour to relogin."
2. **Lockout expiry is lazy, not cron-driven** — checked and auto-cleared (attempts reset to 0, `otp_locked_until` set to null) the next time any OTP action runs for that user. No new scheduled job needed.
3. **Forgot Password is built on our own `otp_codes` table**, not Supabase's native recovery-link email — it needs the same custom digit-box UI, attempt count, and lockout as device verification, which Supabase's built-in flow can't enforce. Supabase's `admin.generateLink({ type: "recovery" })` is used only as the mechanism to mint a real session *after* our own OTP + lockout gate has already passed (same pattern `register/page.tsx` already uses for invite links via `verifyOtp({ token_hash, type: "recovery" })`) — no parallel/competing password-reset mechanism is introduced.
4. **Registration from Invite needs no new code.** It already ends by calling `postLoginGate`, which already routes through `/v2/auth/verify` (device purpose). It inherits the new digit-box UI and lockout automatically once `verify/page.tsx` and `postLoginGate` are updated — call this out explicitly rather than re-touching `register/page.tsx`.
5. **Manual unlock is Super Admin–only** (not Admin) per the request's explicit wording — added to the existing `/v2/dashboard/users` roster page and its backing `PATCH /api/v2/users/[userId]` route, which already gates `super_admin`-only actions (e.g. assigning the `super_admin` role itself).
6. **No user enumeration on the request-reset step** — `requestPasswordReset` always returns the same generic result regardless of whether the email exists, matches a locked account, or is a normal account (silently skips sending if not found or locked). The lock message is only ever revealed *after* a code has been submitted on the verify screen — by that point the user already knows the address exists, so this is consistent with the device-verification flow's already-visible lockout banner (mirrors the reference mock).

## Requirements

### UI — Digit-box OTP input + error state
- [ ] New `OtpInput` component: 6 individual single-digit boxes (not one text field), numeric-only, auto-advances focus on entry, backspace clears-and-moves-back, arrow-key navigation, and paste support (pasting a 6-digit string fills all boxes).
- [ ] Default state matches image 3: rounded-square boxes, neutral border, large centered monospace digit.
- [ ] Error state matches image 4: every box gets a red border (`auth-late` token) when the last submitted code was wrong, with an inline message below the boxes: `Incorrect or expired code. {n} attempt{s} remaining.` (singular "attempt" at 1).
- [ ] Locked state (new — not in the reference mocks but required by the attempt policy): boxes disabled/hidden, replaced by a lockout message with a live `mm:ss` countdown to `otp_locked_until`, no Resend option while locked.
- [ ] Applies to the one shared `/v2/auth/verify` screen used by all three flows (device verification, forgot-password, invite registration) — one component change covers all three.

### Attempt limit + lockout policy
- [ ] Max 4 failed verification attempts per account (cumulative across resends, not per-code).
- [ ] On the 4th failure: set a 1-hour lockout (`otp_locked_until = now() + 1h`) and send a security-alert email to the account's own address ("someone attempted to access your account and it has been temporarily locked").
- [ ] While locked: no new OTP codes can be generated or resent (`postLoginGate` and `requestPasswordReset` must refuse to issue a new code), and `verifyOtpCode`/`verifyPasswordResetOtp` must refuse to check any code, for that account.
- [ ] Lockout auto-expires after 1 hour (lazy-checked, not cron) — attempts reset to 0 on expiry, account can retry a full login/verification from scratch.
- [ ] A Super Admin can manually clear a lockout before the hour elapses, from the existing `/v2/dashboard/users` page.
- [ ] On a *successful* code verification, the account's failed-attempt counter resets to 0 (a fresh future lockout window doesn't inherit old near-misses).

### Forgot Password flow (new)
- [ ] New `/v2/auth/forgot-password` page: single email field, "Send reset code" button, generic "If that email is registered, we've sent a code" outcome regardless of what actually happened server-side.
- [ ] Wire the login page's "Forgot password?" link (`login/page.tsx:87-90`, currently `href="#"`) to `/v2/auth/forgot-password`.
- [ ] Reuses the same `/v2/auth/verify` screen (via a `?purpose=reset&email=...` query string) — same digit boxes, same attempt/lockout behavior — instead of a second bespoke verify screen.
- [ ] On successful reset-code verification, the user lands on the existing `/v2/auth/change-password` page (already built, no changes needed there) with a real Supabase session, and sets a new password through the existing `confirmPasswordChange` action.

### Super Admin manual unlock
- [ ] `/v2/dashboard/users` roster shows a "Locked" indicator for any account with a future `otp_locked_until`, visible to whoever can already load that page (admin/super_admin).
- [ ] An "Unlock" action is visible **only when the viewing user is `super_admin`** and clears `otp_failed_attempts`/`otp_locked_until` for the target account.

## Out of Scope / Must-Not-Change

- The 10-minute OTP code expiry and 7-day device-trust window (`postLoginGate`'s existing gates) — untouched.
- `sha256` code hashing — untouched, reused as-is for the new `password_reset`-purpose codes.
- Supabase's own native email-OTP/magic-link recovery mechanism — not used as the primary reset path (see Design Decision #3); `admin.generateLink({ type: "recovery" })` is only a session-minting step after our own gate passes.
- `change-password/page.tsx` and `confirmPasswordChange` — no changes; the reset flow ends by handing off to this existing, unmodified page/action.
- `AuthSplitShell`, `AuthErrorBanner`, `AuthSubmitButton`, `PasswordInput`, theming tokens (`auth-blue`/`auth-orange`/`auth-late`/etc. from task 179) — reused as-is, not restyled.
- Do not touch `src/app/(auth)/*` (legacy Zoho flow) — v2-only, same boundary as tasks 178/179.
- `inviteUser`'s temp-password generation, `device-id.ts`, `gate-cookies.ts` — untouched.
- No changes to `hub_users` table structure — only read from it (email lookup for the reset flow).
- Do not add a cron job for lockout expiry — lazy-expiry on next access, per Design Decision #2.
- Admin-role users (non-super_admin) can *see* the "Locked" badge on `/v2/dashboard/users` but must not get an unlock control — Super Admin only.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/086_otp_lockout_and_purpose.sql` | Create | `profiles.otp_failed_attempts INT NOT NULL DEFAULT 0`, `profiles.otp_locked_until TIMESTAMPTZ NULL`; `otp_codes.purpose TEXT NOT NULL DEFAULT 'device_verification' CHECK (purpose IN ('device_verification','password_reset'))` |
| `src/components/auth/otp-input.tsx` | Create | 6-box digit input: auto-advance, backspace-back, arrow nav, paste-split, `error` prop for red state |
| `src/lib/auth/otp-lockout.ts` | Create | `MAX_OTP_ATTEMPTS`, `OTP_LOCK_DURATION_MS`, `checkOtpLockout(userId)` (lazy-expiry read), `registerOtpFailure(userId, email)` (increment/lock/email-alert), `resetOtpAttempts(userId)` |
| `src/lib/email/mailer.ts` | Modify | Add `sendAccountLockedEmail(to)` and `sendPasswordResetOtpEmail(to, code)` |
| `src/app/v2/(auth)/actions.ts` | Modify | `postLoginGate` + `verifyOtpCode` call the new lockout helpers and tag inserts with `purpose: "device_verification"`; add `requestPasswordReset(email)` and `verifyPasswordResetOtp(email, code)` |
| `src/app/v2/(auth)/auth/verify/page.tsx` | Modify | Use `OtpInput`; read `?purpose=reset&email=` to branch verify/resend calls; render attempts-remaining error text and the new locked-state countdown panel |
| `src/app/v2/(auth)/auth/forgot-password/page.tsx` | Create | Email-entry page → `requestPasswordReset` → redirect to `/v2/auth/verify?purpose=reset&email=...` |
| `src/app/v2/(auth)/auth/login/page.tsx` | Modify | "Forgot password?" link → `/v2/auth/forgot-password` (one-line `href` change) |
| `src/app/api/v2/users/route.ts` | Modify | Include `otp_locked_until` (from `profiles`) and the caller's own `viewerRole` in the response |
| `src/app/api/v2/users/[userId]/route.ts` | Modify | Accept `body.unlockOtp: true`, restricted to `callerRole === "super_admin"`, clears `otp_failed_attempts`/`otp_locked_until` |
| `src/app/v2/(hub)/dashboard/users/page.tsx` | Modify | Show a "Locked" badge; render an "Unlock" button in the Actions cell when `viewerRole === "super_admin"` and the row is locked |

## Code Context

### `postLoginGate` — current OTP-issuing branch (`actions.ts:50-76`)

```ts
if (!deviceSession || deviceSession.last_verified_at < sevenDaysAgo) {
  const bytes = randomBytes(4);
  const code = String(bytes.readUInt32BE(0) % 900000 + 100000);
  const codeHash = createHash("sha256").update(code).digest("hex");

  const { error: otpErr } = await db.from("otp_codes").insert({
    user_id: user.id,
    code_hash: codeHash,
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  });
  ...
}
```

Needs: (a) a lockout check *before* Gate 1 even runs (locked accounts can't complete login regardless of device trust), (b) `purpose: "device_verification"` added to the insert now that `otp_codes` is shared across two purposes.

### `verifyOtpCode` — current check (`actions.ts:105-135`)

```ts
const { data: otpRecord } = await db
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
```

Needs: `.eq("purpose", "device_verification")` added to the query; wrap the `!otpRecord` branch to call `registerOtpFailure` and return `{ error, attemptsRemaining, locked, lockedUntil }` instead of a bare string; call `resetOtpAttempts` alongside the existing `used: true` update on success. Return type gains `attemptsRemaining?: number`, `locked?: boolean`, `lockedUntil?: string`.

### New `src/lib/auth/otp-lockout.ts` (shape)

```ts
export const MAX_OTP_ATTEMPTS = 4;
export const OTP_LOCK_DURATION_MS = 60 * 60 * 1000; // 1 hour

export async function checkOtpLockout(userId: string): Promise<{ locked: boolean; lockedUntil: string | null }> {
  const { data: profile } = await adminClient
    .from("profiles")
    .select("otp_locked_until")
    .eq("id", userId)
    .single();

  if (!profile?.otp_locked_until) return { locked: false, lockedUntil: null };

  if (new Date(profile.otp_locked_until) <= new Date()) {
    // Lazy expiry — clear it and give the account a fresh window.
    await adminClient.from("profiles").update({ otp_failed_attempts: 0, otp_locked_until: null }).eq("id", userId);
    return { locked: false, lockedUntil: null };
  }

  return { locked: true, lockedUntil: profile.otp_locked_until };
}

export async function registerOtpFailure(
  userId: string,
  email: string
): Promise<{ attemptsRemaining: number; locked: boolean; lockedUntil: string | null }> {
  const { data: profile } = await adminClient
    .from("profiles")
    .select("otp_failed_attempts")
    .eq("id", userId)
    .single();

  const nextCount = (profile?.otp_failed_attempts ?? 0) + 1;

  if (nextCount >= MAX_OTP_ATTEMPTS) {
    const lockedUntil = new Date(Date.now() + OTP_LOCK_DURATION_MS).toISOString();
    await adminClient.from("profiles").update({ otp_failed_attempts: nextCount, otp_locked_until: lockedUntil }).eq("id", userId);
    await sendAccountLockedEmail(email);
    return { attemptsRemaining: 0, locked: true, lockedUntil };
  }

  await adminClient.from("profiles").update({ otp_failed_attempts: nextCount }).eq("id", userId);
  return { attemptsRemaining: MAX_OTP_ATTEMPTS - nextCount, locked: false, lockedUntil: null };
}

export async function resetOtpAttempts(userId: string): Promise<void> {
  await adminClient.from("profiles").update({ otp_failed_attempts: 0, otp_locked_until: null }).eq("id", userId);
}
```

### Password-reset actions (new, `actions.ts`)

```ts
async function getUserIdByEmail(email: string): Promise<{ id: string; email: string } | null> {
  const { data } = await adminClient.from("hub_users").select("id, email").eq("email", email).maybeSingle();
  return data;
}

export async function requestPasswordReset(email: string): Promise<{ ok: true }> {
  const target = await getUserIdByEmail(email);
  if (target) {
    const { locked } = await checkOtpLockout(target.id);
    if (!locked) {
      const bytes = randomBytes(4);
      const code = String(bytes.readUInt32BE(0) % 900000 + 100000);
      const codeHash = createHash("sha256").update(code).digest("hex");
      await db.from("otp_codes").insert({
        user_id: target.id,
        code_hash: codeHash,
        purpose: "password_reset",
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      await sendPasswordResetOtpEmail(target.email, code).catch((e) => console.error("[requestPasswordReset] email failed:", e));
    }
  }
  return { ok: true }; // Always generic — no enumeration signal either way.
}

export async function verifyPasswordResetOtp(
  email: string,
  code: string
): Promise<{ error?: string; attemptsRemaining?: number; locked?: boolean; lockedUntil?: string; hashedToken?: string }> {
  const target = await getUserIdByEmail(email);
  if (!target) return { error: "Incorrect or expired code." };

  const { locked, lockedUntil } = await checkOtpLockout(target.id);
  if (locked) return { error: "Too many attempts.", locked: true, lockedUntil: lockedUntil! };

  const codeHash = createHash("sha256").update(code).digest("hex");
  const { data: otpRecord } = await db
    .from("otp_codes")
    .select("id")
    .eq("user_id", target.id)
    .eq("code_hash", codeHash)
    .eq("purpose", "password_reset")
    .eq("used", false)
    .gte("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (!otpRecord) {
    const failure = await registerOtpFailure(target.id, target.email);
    return { error: "Incorrect or expired code.", ...failure };
  }

  await db.from("otp_codes").update({ used: true }).eq("id", otpRecord.id);
  await resetOtpAttempts(target.id);

  const { data, error } = await adminClient.auth.admin.generateLink({ type: "recovery", email: target.email });
  if (error || !data) return { error: "Could not complete verification. Please try again." };

  return { hashedToken: data.properties.hashed_token };
}
```

### Client-side session mint after reset-OTP success (`verify/page.tsx`, reset-purpose branch)

```ts
const result = await verifyPasswordResetOtp(email, code);
if (result.hashedToken) {
  const supabase = createClient(); // browser client, @/lib/supabase/client
  const { error } = await supabase.auth.verifyOtp({ token_hash: result.hashedToken, type: "recovery" });
  if (!error) router.push("/v2/auth/change-password");
}
```

Mirrors the existing `register/page.tsx:34-38` pattern (`supabase.auth.verifyOtp({ token_hash, type: "recovery" })`), which already establishes a session from a `hashed_token`/`token_hash` this same way.

### `login/page.tsx:86-91` — the link to change

```tsx
<a href="#" className="text-sm font-semibold text-auth-blue-700 hover:text-auth-blue transition-colors">
  Forgot password?
</a>
```
→ `<Link href="/v2/auth/forgot-password" className="...">Forgot password?</Link>` (swap `<a>` for `next/link`'s `Link`, matching the `Link` import already used in `register/page.tsx`).

### `/api/v2/users/route.ts` — current profile merge (`route.ts:29-38`)

```ts
const { data: profiles } = ids.length > 0
  ? await adminClient.from("profiles").select("id, role, full_name").in("id", ids)
  : { data: [] };
```
→ add `otp_locked_until` to the `.select()`, merge it onto each row; also fetch and return the caller's own `profile.role` as a top-level `viewerRole` alongside the `merged` array (response shape becomes `{ viewerRole, users: merged }` — the users page's two `fetch("/api/v2/users")` call sites need their `.json()` handling updated to match).

### `/api/v2/users/[userId]/route.ts` — new unlock branch (add after the existing `body.status` branch, `route.ts:70-76`)

```ts
if (body.unlockOtp === true) {
  if (callerRole !== "super_admin") {
    return NextResponse.json({ error: "Only a Super Admin can unlock an account." }, { status: 403 });
  }
  const { error } = await adminClient
    .from("profiles")
    .update({ otp_failed_attempts: 0, otp_locked_until: null })
    .eq("id", userId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
}
```

## Implementation Steps

1. Write `086_otp_lockout_and_purpose.sql`: `ALTER TABLE profiles ADD COLUMN otp_failed_attempts INT NOT NULL DEFAULT 0, ADD COLUMN otp_locked_until TIMESTAMPTZ NULL;` and `ALTER TABLE otp_codes ADD COLUMN purpose TEXT NOT NULL DEFAULT 'device_verification' CHECK (purpose IN ('device_verification','password_reset'));`. Apply it and regenerate/hand-edit the untyped areas the same way `039` was handled (still accessed via the `db = adminClient as any` alias — no `database.ts` type changes required for `otp_codes`; `profiles` type in `src/types/database.ts` *does* need the two new nullable fields added to its `Row`/`Insert`/`Update` shapes since `profiles` — unlike `otp_codes`/`device_sessions` — is a typed table).
2. Create `src/lib/auth/otp-lockout.ts` per Code Context above.
3. Add `sendAccountLockedEmail(to)` and `sendPasswordResetOtpEmail(to, code)` to `mailer.ts` (same `transporter.sendMail` pattern as `sendOtpEmail`; lockout email subject e.g. `"Your WebriQ Hub account has been temporarily locked"`, body explains repeated failed verification attempts, contact-admin-if-not-you, and the 1-hour wait).
4. In `actions.ts`: add `purpose: "device_verification"` to `postLoginGate`'s OTP insert; add a `checkOtpLockout` call as the very first check after resolving `user` (before Gate 1), short-circuiting with `{ redirect: "/v2/auth/verify", locked: true, lockedUntil }` and skipping OTP generation entirely if locked. Update `verifyOtpCode` to add `.eq("purpose", "device_verification")`, call `registerOtpFailure`/`resetOtpAttempts`, and return the extended shape. Add `requestPasswordReset` and `verifyPasswordResetOtp` per Code Context.
5. Create `src/components/auth/otp-input.tsx` — controlled component, props `{ value: string; onChange: (v: string) => void; error?: boolean; disabled?: boolean }`, 6 `<input maxLength={1} inputMode="numeric">` boxes in a flex row (`gap-2` or `gap-3`), refs array for focus management, `onKeyDown` handles Backspace/Arrow keys, `onPaste` splits digits across boxes. Error state swaps border/ring classes to `border-auth-late focus-visible:ring-auth-late`.
6. Update `verify/page.tsx`: replace the single `<input>` with `<OtpInput>`; read `purpose`/`email` from `useSearchParams()`; branch `handleSubmit`/`handleResend` between the existing device-purpose calls (`verifyOtpCode`/`postLoginGate`) and the new reset-purpose calls (`verifyPasswordResetOtp`/`requestPasswordReset`); track `attemptsRemaining`/`locked`/`lockedUntil` state; render the attempts-remaining error text under the boxes; render a distinct locked-state panel (countdown timer, no Resend) when `locked` is true; on `hashedToken` success in reset mode, call the browser client's `verifyOtp({ token_hash, type: "recovery" })` and push to `/v2/auth/change-password`.
7. Create `src/app/v2/(auth)/auth/forgot-password/page.tsx` — single email input + `AuthSubmitButton`, calls `requestPasswordReset(email)`, then `router.push(`/v2/auth/verify?purpose=reset&email=${encodeURIComponent(email)}`)` unconditionally (generic outcome, no branching on the server's always-`{ok:true}` response).
8. Update `login/page.tsx`'s "Forgot password?" anchor to a `Link` pointing at `/v2/auth/forgot-password`.
9. Update `/api/v2/users/route.ts`: add `otp_locked_until` to the profiles select/merge; compute and return `viewerRole` alongside the roster.
10. Update `/api/v2/users/[userId]/route.ts`: add the `unlockOtp` branch restricted to `super_admin`.
11. Update `/v2/dashboard/users/page.tsx`: adjust the two `fetch("/api/v2/users")` call sites for the new `{ viewerRole, users }` response shape; add a `HubUser.otp_locked_until` field; render a "Locked" badge (red, matches other `border`/`bg`/`text` pill conventions already in this file) next to Status when locked; add an "Unlock" button in the Actions cell, gated on `viewerRole === "super_admin" && isLocked`, calling `PATCH /api/v2/users/[id]` with `{ unlockOtp: true }` and refetching/optimistically clearing the row.
12. Run `npx tsc --noEmit` and `pnpm lint`.
13. Manual browser pass (see Verification) covering all three flows plus the lockout path and the Super Admin unlock control.

## Acceptance Criteria

- [ ] `/v2/auth/verify` renders 6 separate digit boxes, not one text field, on all three flows that reach it.
- [ ] Submitting a wrong code shows red borders on the boxes and "Incorrect or expired code. N attempt(s) remaining." with the correct count.
- [ ] The 4th wrong attempt locks the account for 1 hour, sends a security-alert email to the account's address, and immediately replaces the code-entry UI with a locked-state panel (countdown, no Resend).
- [ ] While locked, `postLoginGate` and `requestPasswordReset` refuse to issue a new code; `verifyOtpCode`/`verifyPasswordResetOtp` refuse to check any code.
- [ ] After the 1-hour lock naturally expires (or a Super Admin clears it), the account gets a full fresh set of 4 attempts.
- [ ] `/v2/auth/forgot-password` exists, is linked from the login page's "Forgot password?", and successfully round-trips through the verify screen to `/v2/auth/change-password` with a real session on correct-code entry.
- [ ] Registration-from-invite (`registerFromInvite` → `postLoginGate` → `/v2/auth/verify`) requires no code changes and automatically shows the new digit-box UI and is subject to the same lockout.
- [ ] `/v2/dashboard/users` shows a "Locked" badge for locked accounts; only a user with `viewerRole === "super_admin"` sees/can click "Unlock"; clicking it clears the lock and the badge disappears.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
```

Manual browser pass required for:
- Device verification: log in from a "new" device (clear `hub_device_id` from localStorage), see the digit-box UI, enter 3 wrong codes (see attempts-remaining count down 3→2→1), enter a 4th wrong code (see lockout panel + confirm the lockout email arrives), confirm Resend is unavailable while locked, confirm login is blocked until the hour lapses or a Super Admin unlocks.
- Forgot password: click "Forgot password?" on login, submit an email, receive the reset code, enter it correctly on the verify screen, land on `/v2/auth/change-password` with a working session, set a new password, confirm it works on next login.
- Invite registration: complete an invite link, confirm the post-registration OTP step shows the same new digit-box UI with no additional code changes needed.
- Super Admin unlock: as a `super_admin` user, lock a test account, confirm the "Locked" badge + "Unlock" button appear only for that role (not for a plain `admin`), click Unlock, confirm the account can immediately retry.

## Compatibility Touchpoints

- New migration (`086_otp_lockout_and_purpose.sql`) — additive columns only, no backfill risk (`DEFAULT 0` / `DEFAULT 'device_verification'` keep existing rows valid).
- `src/types/database.ts`'s `profiles` type gains two new optional fields — additive, no breaking change to existing callers.
- `/api/v2/users` response shape changes from a bare array to `{ viewerRole, users }` — both call sites in `dashboard/users/page.tsx` must be updated in the same change (no external consumers of this internal API).
- No new environment variables (reuses existing `MAIL_*` vars already used by `sendOtpEmail`/`sendInvitationEmail`).

## Implementation Notes

### What Changed
- Added migration `086_otp_lockout_and_purpose.sql` (`profiles.otp_failed_attempts`/`otp_locked_until`, `otp_codes.purpose`) and the corresponding `profiles` type fields in `src/types/database.ts`.
- Added `src/lib/auth/otp-lockout.ts` (`checkOtpLockout`, `registerOtpFailure`, `resetOtpAttempts`, `MAX_OTP_ATTEMPTS = 4`, `OTP_LOCK_DURATION_MS = 1h`) — shared by both the device-verification and password-reset code paths.
- Added `sendPasswordResetOtpEmail` and `sendAccountLockedEmail` to `mailer.ts`.
- Wired lockout into `actions.ts`: `postLoginGate` now checks lockout before any other gate (blocks login entirely while locked, without ever generating a new OTP); `verifyOtpCode` now checks lockout, tags its query with `purpose: "device_verification"`, and calls `registerOtpFailure`/`resetOtpAttempts` on failure/success respectively. Added the new `requestPasswordReset(email)` and `verifyPasswordResetOtp(email, code)` actions (via a local `getUserIdByEmail` helper reading `hub_users`), which use `adminClient.auth.admin.generateLink({ type: "recovery" })` to mint a `hashed_token` once our own OTP+lockout gate passes — the client then calls `supabase.auth.verifyOtp({ token_hash, type: "recovery" })` to establish a real session, exactly mirroring the existing invite-registration pattern in `register/page.tsx`.
- Built `OtpInput` (`src/components/auth/otp-input.tsx`) — 6 independent digit boxes with auto-advance, backspace-back, arrow-key nav, and paste-splitting; red (`auth-late`) border in the `error` state.
- Extended `AuthErrorBanner` with an optional `suffix` node (rather than duplicating its markup) so the verify page can append "N attempts remaining" or the lockout countdown to the same banner used everywhere else.
- Rewrote `verify/page.tsx`: swapped the single text input for `OtpInput`; branches all submit/resend logic on `?purpose=reset&email=` vs. the default device-verification path; tracks `attemptsRemaining`/`lockedUntil`; renders a distinct locked-state panel with a live `mm:ss` countdown (ticked via `setInterval`, derived from `lockedUntil` rather than a separately-tracked duration) in place of the form; on a successful reset-purpose verification, mints the Supabase session client-side and redirects to `/v2/auth/change-password` (unmodified).
- Created `forgot-password/page.tsx` — plain email form, always redirects to the verify screen regardless of the (intentionally generic) `requestPasswordReset` result, per the no-enumeration design decision.
- Wired the login page's previously-dead `href="#"` "Forgot password?" link to `/v2/auth/forgot-password`.
- Extended `/api/v2/users` (GET) to return `{ viewerRole, users }` (added `otp_locked_until` to the per-row merge) and `/api/v2/users/[userId]` (PATCH) to accept `{ unlockOtp: true }`, restricted to `callerRole === "super_admin"`.
- Updated `dashboard/users/page.tsx`: both fetch call sites now read the new `{ viewerRole, users }` shape; added a red "Locked" badge next to the Status toggle; added an "Unlock" button in the Actions cell (visible only when `viewerRole === "super_admin"` and the row is locked), backed by a new `handleUnlock` callback.
- Registration-from-invite required no code changes, as planned — `registerFromInvite` already ends by calling `postLoginGate`, so it automatically picks up the new digit-box UI and lockout behavior.

### Files Changed
- `supabase/migrations/086_otp_lockout_and_purpose.sql` - new: lockout/purpose columns
- `src/types/database.ts` - `profiles` Row/Insert/Update gain `otp_failed_attempts`/`otp_locked_until`
- `src/lib/auth/otp-lockout.ts` - new: shared lockout/attempt helpers
- `src/lib/email/mailer.ts` - added `sendPasswordResetOtpEmail`, `sendAccountLockedEmail`
- `src/app/v2/(auth)/actions.ts` - `postLoginGate`/`verifyOtpCode` lockout-aware; added `requestPasswordReset`, `verifyPasswordResetOtp`, `getUserIdByEmail`
- `src/components/auth/otp-input.tsx` - new: 6-box digit input
- `src/components/auth/auth-error-banner.tsx` - added optional `suffix` prop
- `src/app/v2/(auth)/auth/verify/page.tsx` - digit-box UI, purpose branching, attempts/lockout UI
- `src/app/v2/(auth)/auth/forgot-password/page.tsx` - new: email-entry reset-request page
- `src/app/v2/(auth)/auth/login/page.tsx` - "Forgot password?" now links to the new page
- `src/app/api/v2/users/route.ts` - returns `{ viewerRole, users }`, includes `otp_locked_until`
- `src/app/api/v2/users/[userId]/route.ts` - added `unlockOtp` PATCH branch (super_admin only)
- `src/app/v2/(hub)/dashboard/users/page.tsx` - Locked badge, Unlock action, updated fetch response handling

### Deviations From Plan
- None from the task document's Requirements/Implementation Steps — implementation matches the Code Context blocks essentially verbatim, with one small type-safety adjustment: `verifyOtpCode`/`verifyPasswordResetOtp`'s `lockedUntil` field was typed `string | null` (not `string | undefined`) to match what `checkOtpLockout`/`registerOtpFailure` actually return — the task doc's Code Context sketch used a non-null assertion in one spot but the full return type needed to be widened for `tsc` to accept the plain (non-asserted) assignments in the failure branches.

### Verification Run
- `npx tsc --noEmit` - PASS (no errors)
- `pnpm lint` - PASS (0 errors, 0 warnings)
- `pnpm dev` manual browser pass - SKIPPED: no `.env.local` exists in this environment (`env.example` requires real `NEXT_PUBLIC_SUPABASE_URL`/`SUPABASE_SECRET_KEY`/`MAIL_*` credentials to stand up a working Supabase session and send real emails), so the three flows (device verification, forgot-password, invite registration) and the Super Admin unlock control could not be exercised live here. A human should manually run through the Verification section's manual-pass checklist — especially the 4th-attempt lockout email, the reset-OTP→`verifyOtp`→session handoff, and the `viewerRole === "super_admin"` gating on the Unlock button — before shipping.
