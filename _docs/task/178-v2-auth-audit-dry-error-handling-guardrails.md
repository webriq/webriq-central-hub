# 178: `/v2/(auth)` Audit — DRY Refactor, Error Handling & Guard Rails

**Created:** 2026-07-22
**Priority:** MEDIUM
**Type:** refactor
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

`src/app/v2/(auth)/` (login, register-from-invite, OTP verify, forced password change, OAuth callback, pending-approval, and the shared server actions in `actions.ts`) has grown organically across several prior tasks. It works, but:

- The same ~90-line "split hero panel" page shell (desktop image hero + mobile gradient header + form card) is copy-pasted across 4 page files.
- The password-strength meter (`getStrength`, `STRENGTH_META`, `PasswordStrength`) is duplicated verbatim in `auth/register/page.tsx` and `auth/change-password/page.tsx`.
- The show/hide password input, the error banner, and the loading submit button are hand-copied in every form.
- The `hub_device_id` localStorage get-or-create snippet is duplicated in `auth/login/page.tsx` and `auth/register/page.tsx`.
- `actions.ts` repeats the same gate-cookie `set`/clear options object shape 5 times, and has several silent-failure paths in the OTP step-up flow (`postLoginGate`) that leave a user unable to complete login with no clear error surfaced.
- Several `console.log` calls in `postLoginGate` log the user's id/email/device id on every login — debug leftovers, not gated behind an env check.
- `signIn` in `actions.ts` is dead code — `auth/login/page.tsx` performs its own client-side `signInWithPassword` instead of calling it, so the same "sign in with password" behavior exists in two places and only one is reachable.

This task audits the whole `/v2/(auth)` surface, extracts the duplicated pieces into `src/components/auth/` and `src/lib/auth/` (both already exist and already hold auth-adjacent code — `theme-toggle.tsx`, `require-role.ts`, `role-access.ts`), tightens error handling in the server actions, and removes the dead code / debug logging. No new routes, no schema changes, no visual redesign — output must look pixel-identical to today.

## Requirements

- [ ] Extract the shared "split hero + mobile header + form card" page shell (used by login, register, verify, change-password) into a single reusable component; each page supplies only its heading, subheading, and form body.
- [ ] Extract password-strength logic (`getStrength`, `STRENGTH_META`) into `src/lib/auth/password-strength.ts` and the `<PasswordStrength/>` display component into `src/components/auth/`; both `register` and `change-password` import from there instead of redefining.
- [ ] Extract a reusable labeled password `<input>` w/ show/hide toggle (icon button, `aria-label`, focus ring) into `src/components/auth/`; used by login, register (×2), change-password (×2).
- [ ] Extract the error banner markup (`text-destructive bg-destructive/10 border-destructive/20` block) into a small shared component.
- [ ] Extract the submit button (loading label swap + trailing arrow icon, `disabled` state) into a small shared component.
- [ ] Extract the `hub_device_id` localStorage get-or-create logic into `src/lib/auth/device-id.ts` (`getOrCreateDeviceId()`); used by login and register; `verify`'s read-only lookup (`localStorage.getItem("hub_device_id") ?? ""`) can use the same module for consistency.
- [ ] In `actions.ts`, extract the repeated gate-cookie set/clear option objects into a small helper (e.g. `setGateCookie(name, value, maxAgeSeconds)` / `clearGateCookie(name)`) in `src/lib/auth/gate-cookies.ts`, and use it in `postLoginGate` and `confirmPasswordChange`.
- [ ] Fix silent failure in `postLoginGate`: when the `otp_codes` insert (`otpErr`) fails, do not proceed to email a code that was never persisted — return `{ redirect: "/v2/auth/verify", error: "..." }` (or equivalent) so the UI can surface it, instead of only `console.log`-ing the error.
- [ ] Fix silent failure in `postLoginGate`: when `sendOtpEmail` throws, surface it to the caller (non-fatal — the code is still valid to enter manually if the user has another way to see it isn't coming — but the current fully-swallowed `console.error` leaves the user stuck on `/verify` with zero indication email delivery failed). At minimum return a soft warning the `verify` page can display next to "Resend code".
- [ ] Fix the `device_sessions` lookup in `postLoginGate`: distinguish a genuine query error (`dsErr` truthy, not a "no rows" `PGRST116`) from "no session row exists yet" — a real DB/RLS error should not silently fall through to "trigger OTP" as if the row were simply missing.
- [ ] Remove the debug `console.log` statements in `postLoginGate` that log user id/email/device id on every call (lines logging `"[postLoginGate] user:"`, `"deviceSession:"`, `"inserting OTP..."`, `"sending OTP email..."`, `"OTP email sent OK"`). Keep `console.error` for genuine failures only.
- [ ] Remove the unused `signIn` server action from `actions.ts` (dead code — `auth/login/page.tsx` never calls it), or, if kept intentionally for a future non-JS-fallback path, leave a one-line comment explaining why it's unused today. Confirm with codebase search there are no other callers before deleting.
- [ ] De-duplicate the resend-cooldown `setInterval` logic in `auth/verify/page.tsx` (currently inlined identically in the mount `useEffect` and in `handleResend`) into a single local helper function.

## Out of Scope / Must-Not-Change

- No visual/design changes — extracted components must render byte-identical markup/classes to what exists today (this is a refactor, not a redesign; the "UI Polish Conventions" `isDark`-prop / hand-rolled-pill conventions in `CLAUDE.md` still apply if any new shared component needs theme awareness, but none of these pages currently take an `isDark` prop — don't introduce one).
- Do not touch `src/app/(auth)/*` (the non-v2 Zoho-OAuth auth flow) — it's a separate, decommissioning-track flow; only `src/app/v2/(auth)/*` is in scope. The one existing cross-boundary import (`callback/page.tsx` dynamically importing `syncZohoRole` from `@/app/(auth)/sync-zoho-role`) is intentional per `CLAUDE.md` and must be left as-is.
- Do not change the OTP/device-gate security model itself (10-minute code expiry, 7-day device trust window, `sha256` hashing) — this task is about DRY/error-handling/guard-rails around the existing flow, not redesigning MFA.
- Do not regenerate Supabase types or remove the `db = adminClient as any` cast — that's tracked separately (comment already documents it's temporary pending `supabase gen types`).
- Do not add `react-hook-form`/`zod`/`sonner` — these pages already use plain controlled `useState` + inline `fetch`/server-action calls per `CLAUDE.md`'s documented forms convention; keep that pattern in the extracted components.
- Do not fix the `inviteUser` temp-password charset modulo-bias — out of scope, low-severity, separate concern.
- `auth/signup/page.tsx` (a 3-line redirect to `/v2/auth/login`) and `auth/pending/page.tsx` (static content) need no extraction — leave them as-is except any incidental import-path fix if a shared component naturally slots in (it doesn't for pending).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/components/auth/auth-split-shell.tsx` | Create | Shared hero/mobile-header/form-card page shell (heading, subheading, children as props) |
| `src/components/auth/password-input.tsx` | Create | Labeled password field with show/hide toggle |
| `src/components/auth/password-strength-meter.tsx` | Create | `<PasswordStrength/>` display component (imports logic from `lib/auth/password-strength.ts`) |
| `src/components/auth/auth-error-banner.tsx` | Create | Shared destructive-tone inline error banner |
| `src/components/auth/auth-submit-button.tsx` | Create | Shared loading/arrow submit button |
| `src/lib/auth/password-strength.ts` | Create | `getPasswordStrength()` + `STRENGTH_META` (pure logic, no JSX) |
| `src/lib/auth/device-id.ts` | Create | `getOrCreateDeviceId()` — reads/writes `hub_device_id` in `localStorage` |
| `src/lib/auth/gate-cookies.ts` | Create | `setGateCookie(name, value, maxAgeSeconds)` / `clearGateCookie(name)` server-side cookie helpers for the `/v2` gate cookies |
| `src/app/v2/(auth)/actions.ts` | Modify | Use `gate-cookies.ts` helpers; fix `otpErr`/email-failure/`dsErr` handling in `postLoginGate`; remove debug `console.log`s; remove or annotate unused `signIn` |
| `src/app/v2/(auth)/auth/login/page.tsx` | Modify | Use shared shell, password input, error banner, submit button, device-id helper |
| `src/app/v2/(auth)/auth/register/page.tsx` | Modify | Use shared shell, password input (×2), password-strength component, error banner, submit button, device-id helper |
| `src/app/v2/(auth)/auth/change-password/page.tsx` | Modify | Use shared shell, password input (×2), password-strength component, error banner, submit button |
| `src/app/v2/(auth)/auth/verify/page.tsx` | Modify | Use shared shell, error banner, submit button; de-dupe cooldown interval logic; use device-id helper for the read |

## Code Context

### `src/app/v2/(auth)/actions.ts` — `postLoginGate` (the function needing the error-handling fixes)

```ts
const { data: deviceSession, error: dsErr } = await db
  .from("device_sessions")
  .select("last_verified_at")
  .eq("user_id", user.id)
  .eq("device_id", deviceId)
  .single() as { data: { last_verified_at: string } | null; error: unknown };
// dsErr is captured but never inspected — a real query failure and "no row yet"
// currently take the same code path (falls through to "trigger OTP").

if (!deviceSession || deviceSession.last_verified_at < sevenDaysAgo) {
  ...
  const { error: otpErr } = await db.from("otp_codes").insert({ ... });
  console.log("[postLoginGate] OTP insert error:", otpErr); // otpErr never returned to caller

  try {
    await sendOtpEmail(user.email!, code);
  } catch (emailErr) {
    console.error("[postLoginGate] OTP email FAILED:", emailErr); // swallowed, caller never knows
  }
  ...
  return { redirect: "/v2/auth/verify" }; // always "succeeds" even if insert/email failed
}
```

Supabase's `.single()` sets a `PGRST116` code when no rows match — that's the expected "first login on this device" case and should keep falling through to OTP. Any other error code is a real failure and should short-circuit with an error instead of proceeding.

### Duplicated password-strength block (identical in both files today)

`src/app/v2/(auth)/auth/register/page.tsx:12-53` and `src/app/v2/(auth)/auth/change-password/page.tsx:11-52` — verbatim duplicate of `Strength` type, `getStrength()`, `STRENGTH_META`, and the `PasswordStrength` component.

### Duplicated device-id snippet

`src/app/v2/(auth)/auth/login/page.tsx:42-46` and `src/app/v2/(auth)/auth/register/page.tsx:141-145` — identical:
```ts
let deviceId = localStorage.getItem("hub_device_id");
if (!deviceId) {
  deviceId = crypto.randomUUID();
  localStorage.setItem("hub_device_id", deviceId);
}
```

### Duplicated page shell (hero panel + mobile header + form card wrapper)

Present with only text/heading differences in `auth/login/page.tsx:58-125`, `auth/register/page.tsx:168-230`, `auth/verify/page.tsx:75-142`, `auth/change-password/page.tsx:86-148` — same `ThemeToggle`, same `<Image src="/auth-hero-BN2J7r2Q.jpg">` hero, same gradient mobile header, same `-mt-10 rounded-t-3xl` card wrapper. Extract to one component taking `title`, `subtitle`, and `children` (the form).

## Implementation Steps

1. Create `src/lib/auth/password-strength.ts` — move `Strength` type, `getStrength`, `STRENGTH_META` out of both page files (rename `getStrength` → `getPasswordStrength` for clarity since it's now a shared export).
2. Create `src/components/auth/password-strength-meter.tsx` — move the `PasswordStrength` component, importing logic from step 1. Update `register/page.tsx` and `change-password/page.tsx` to import and delete their local copies.
3. Create `src/lib/auth/device-id.ts` with `getOrCreateDeviceId()`. Update `login/page.tsx` and `register/page.tsx` to call it; update `verify/page.tsx`'s plain read to call the same module (add a read-only variant or reuse the same function since it already no-ops correctly if a value exists).
4. Create `src/components/auth/password-input.tsx` (props: `id`, `label`, `value`, `onChange`, `autoComplete`, `placeholder`, `required`) encapsulating the `Lock` icon, input, and show/hide `Eye`/`EyeOff` toggle button. Replace all 5 usages (login ×1, register ×2, change-password ×2).
5. Create `src/components/auth/auth-error-banner.tsx` (props: `message: string | null`) and replace the 4 inline error-banner blocks.
6. Create `src/components/auth/auth-submit-button.tsx` (props: `loading`, `loadingLabel`, `label`, `disabled?`) and replace the 4 submit buttons.
7. Create `src/components/auth/auth-split-shell.tsx` (props: `title`, `subtitle`, `children`) containing the `ThemeToggle`, hero image panel, mobile gradient header, and form-card wrapper currently duplicated across login/register/verify/change-password. Update all four pages to render `<AuthSplitShell title=... subtitle=...>{form}</AuthSplitShell>` instead of the inlined markup. Preserve the `register` page's extra loading/error branch handling (session-loading spinner and session-error state are *outside* the shell in some cases — check each page's conditional rendering carefully so the shell only wraps the parts that are actually identical).
8. Create `src/lib/auth/gate-cookies.ts` with `setGateCookie(name: string, value: string, maxAgeSeconds: number)` and `clearGateCookie(name: string)`, encapsulating the shared `{ httpOnly: true, secure: true, path: "/v2", sameSite: "lax" }` options. Update `postLoginGate` and `confirmPasswordChange` in `actions.ts` to use them.
9. In `actions.ts`, fix `postLoginGate`: check `dsErr` for a real error (anything other than the Supabase "no rows" not-found code) and return an error instead of silently treating it as "device unseen." Check `otpErr` from the `otp_codes` insert and return an error instead of proceeding. Surface `sendOtpEmail` failures via the return value instead of only `console.error`.
10. Remove the debug `console.log` calls in `postLoginGate` (lines logging user/device/OTP-insert/email-send progress). Keep genuine `console.error` calls for unexpected failures.
11. Confirm `signIn` in `actions.ts` has no callers (search the codebase), then remove it; if the implementation stage finds an intended future use, leave it with a one-line comment instead of deleting.
12. In `auth/verify/page.tsx`, extract the repeated `setInterval` cooldown-countdown block (identical in the mount effect and in `handleResend`) into one local function, e.g. `startCooldown()`.
13. Run `npx tsc --noEmit` and manually exercise: login (happy path + wrong password), first-time-device OTP step-up (verify + resend), forced password change, and the invite-registration flow, to confirm no visual or behavioral regression.

## Acceptance Criteria

- [ ] No two files under `src/app/v2/(auth)/` contain duplicated password-strength logic, device-id logic, or the split-hero page shell — each lives once in `src/lib/auth/` or `src/components/auth/`.
- [ ] Every page under `/v2/auth/*` renders visually identically to before the refactor (manually verified in browser: login, register, verify, change-password, pending).
- [ ] `postLoginGate` returns a surfaced error (not a silent console log) when the OTP insert fails, when the confirmation email fails to send, or when the device-session lookup fails for a reason other than "no matching row."
- [ ] No debug `console.log` remains in `postLoginGate` logging user/device/email details on the happy path.
- [ ] `signIn` in `actions.ts` is either removed (confirmed unused) or left with a comment explaining why it's intentionally kept.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manually exercise: /v2/auth/login, /v2/auth/register (invite link), /v2/auth/verify, /v2/auth/change-password, /v2/auth/pending
```

Manual browser pass required for:
- Login with correct/incorrect credentials.
- First login on a new device (device-id cleared from localStorage) → OTP email sent → `/v2/auth/verify` → correct/incorrect code → resend cooldown.
- Forced password change gate (`force_password_change: true` on a test user) → `/v2/auth/change-password`.
- Invite registration flow (`token_hash`/`type=recovery` link) → password set → lands on verify or dashboard per gate logic.

## Compatibility Touchpoints

- No packaging, docs, or install-surface impact.
- No DB migration required.
- No change to cookie names/paths consumed elsewhere (`mfa_pending`, `change_password_required` keep the same names/paths/semantics — only the code that sets them is deduplicated).
