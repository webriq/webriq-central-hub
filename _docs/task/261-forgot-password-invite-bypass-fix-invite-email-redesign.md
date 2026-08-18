# 261: Block Forgot-Password Registration Bypass for Never-Registered Invitees + Invitation Email Redesign

**Created:** 2026-08-18
**Priority:** HIGH
**Type:** bugfix / enhancement
**Recommended Tier:** deep

---

## Overview

Two related fixes to the internal-staff invite flow (`src/app/(hub)/dashboard/users` → `/api/admin/hub-users/[userId]/invite` → `/auth/register?token_hash=...&type=recovery`):

1. **Security bug:** a user who was invited but never completed registration (their invite link expired, or they never clicked it) can currently use **Forgot Password** to self-serve into the account anyway — completely bypassing the intended "an admin must resend a fresh invite" control. Forgot Password is meant for someone who already set a password and forgot it; it must not work for someone who never registered in the first place.
2. **Email design/copy bug:** the invitation email (`sendHubInviteEmail` in `src/lib/email/mailer.ts`) has no logo/branding and its body claims the link "expires in 24 hours" — the actual link is a Supabase `type: "recovery"` token that expires in **10 minutes** (same expiry already used and correctly labeled for every other OTP/link in this codebase — device-verification and password-reset codes both say "expires in 10 minutes").

**Root cause of bug #1:** `requestPasswordReset(email)` (`src/app/(auth)/actions.ts:165-188`) looks up the target via `getUserIdByEmail`, which only checks that a `hub_users` row exists for that email — it never checks whether the underlying Supabase Auth user has ever actually authenticated. Both invite paths create the Auth user in a "not yet logged in" state:
   - Zoho-import flow (`src/app/api/admin/zoho-import/users/route.ts:135-139`): `adminClient.auth.admin.createUser({ email, email_confirm: true, ... })` — no password set, no sign-in yet.
   - Direct invite flow (`inviteUser` in `actions.ts:230-276`): `adminClient.auth.admin.createUser({ email, password: tempPassword, ... })` — a password exists but the user hasn't logged in with it yet.

   In both cases Supabase's `auth.users.last_sign_in_at` stays `null` until the user actually authenticates (via the invite link's `verifyOtp({type:"recovery"})` call, a real login, etc.). That makes `last_sign_in_at IS NULL` a reliable, no-migration signal for "this account has never been accessed" — i.e. registration was never completed. Note `hub_users.joined_at` is **not** usable for this: it's overloaded by the Zoho import (`zoho-import/users/route.ts:107,158`) to store the user's *Zoho* join date, which is populated from imported data regardless of whether they've ever touched the Hub.

   The fix: `requestPasswordReset` must additionally check `last_sign_in_at` (via `adminClient.auth.admin.getUserById`) and silently skip issuing a reset code when it's `null` — mirroring the existing silent no-op used for locked accounts and unknown emails, so the response stays generically `{ ok: true }` either way (no user-enumeration signal, per the existing design decision documented in task 180).

**Root cause of bug #2:** `sendHubInviteEmail` was written with a placeholder "24 hours" copy and no logo, and was never reconciled against the real expiry once the recovery-link mechanism was wired up.

## Requirements

### 1. Forgot-password bypass fix
- [ ] `requestPasswordReset(email)` does not issue a password-reset OTP (no `otp_codes` insert, no email sent) when the matched user's Supabase Auth `last_sign_in_at` is `null`.
- [ ] The function's return value stays `{ ok: true }` in this case too — no behavioral or timing signal that would let an attacker distinguish "never registered" from "locked" from "unknown email" from "success" (existing no-enumeration convention, unchanged).
- [ ] A user who *has* completed registration at least once (`last_sign_in_at` is set) is unaffected — Forgot Password continues to work exactly as today.
- [ ] A user with a still-valid (unexpired), unused invite link is unaffected by this change either way — this fix only closes the *expired/never-clicked* bypass, it does not add any new restriction to an in-progress, valid invite.

### 2. Invitation email redesign
- [ ] `sendHubInviteEmail`'s HTML body displays the WebriQ app logo (`public/brand/logo_on_white.png`, 340×75 — designed for a white background, matching the white email card) at the top of the email.
- [ ] Both the `text` and `html` bodies say the link **expires in 10 minutes**, not 24 hours.
- [ ] General visual polish: branded header, a proper card/container layout (table-based, inline-styled — email clients including Outlook do not reliably support flexbox/external stylesheets), and a CTA button using the app's brand color (`--color-brand-orange: #F97316` from `src/app/globals.css`) instead of the current plain dark-slate button.
- [ ] The plain-text fallback (`text` field) stays in sync with the corrected copy (still no logo/HTML in the text version — that's expected for a text fallback).

## Out of Scope / Must-Not-Change

- `sendInvitationEmail` (temp-password invite flow, used by `inviteUser`/`/admin/hub-users`) — not link-based, has no expiry claim to fix, and wasn't mentioned in the request. Leave as-is.
- `src/lib/email/resend.ts` — appears unused (no imports found anywhere in `src/`); not part of this task, do not touch or delete it as a "cleanup" side effect.
- `sendOtpEmail` / `sendPasswordResetOtpEmail` / `sendAccountLockedEmail` — already correctly say "10 minutes" / describe the 1-hour lockout; no changes needed.
- `/auth/register` and `/auth/change-password` pages — no code changes needed; the fix is a single choke point in `requestPasswordReset`, before any session is ever minted for the never-registered case.
- `checkOtpLockout` / `registerOtpFailure` / `resetOtpAttempts` (`src/lib/auth/otp-lockout.ts`) — untouched; this fix is orthogonal to the attempt-lockout system built in task 180.
- No new Supabase migration — the fix uses `adminClient.auth.admin.getUserById()` (Auth Admin API), not a new `hub_users`/`profiles` column.
- Do not change the actual Supabase-side OTP/recovery-link expiry setting (that's a dashboard config, already confirmed at 10 minutes) — this task only fixes the app-level gate and the email copy to match it.
- Legacy `_auth_(OLD)` / `_hub_(OLD)` routes — dead code, not the active flow, do not touch.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(auth)/actions.ts` | Modify | `requestPasswordReset` gains a `last_sign_in_at` check before issuing a reset code |
| `src/lib/email/mailer.ts` | Modify | `sendHubInviteEmail` — add logo, redesign HTML layout, fix "24 hours" → "10 minutes" in both `text` and `html` |

## Code Context

### `requestPasswordReset` — current (`src/app/(auth)/actions.ts:156-188`)

```ts
async function getUserIdByEmail(email: string): Promise<{ id: string; email: string } | null> {
  const { data } = await adminClient
    .from("hub_users")
    .select("id, email")
    .eq("email", email)
    .maybeSingle();
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
      try {
        await sendPasswordResetOtpEmail(target.email, code);
      } catch (e) {
        console.error("[requestPasswordReset] email failed:", e);
      }
    }
  }
  // Always generic — no enumeration signal either way (unknown email, locked account, or success).
  return { ok: true };
}
```

Needs an added check, inside the `if (!locked)` branch (or as its own condition alongside it): fetch the Auth user via `adminClient.auth.admin.getUserById(target.id)` and skip the OTP insert + email send when `data.user?.last_sign_in_at` is falsy. Keep the same silent, generic `{ ok: true }` return — do not add a distinct error path.

### `sendHubInviteEmail` — current (`src/lib/email/mailer.ts:34-51`)

```ts
export async function sendHubInviteEmail(to: string, firstName: string, inviteUrl: string) {
  await transporter.sendMail({
    from: FROM,
    to,
    subject: "You've been invited to WebriQ Central Hub",
    text: [
      `Hi ${firstName},`,
      ``,
      `You've been invited to join WebriQ Central Hub.`,
      ``,
      `Click the link below to set your password and get started:`,
      `${inviteUrl}`,
      ``,
      `This link expires in 24 hours.`,
      `If you did not expect this invitation, you can safely ignore this email.`,
    ].join("\n"),
    html: [
      `<p>Hi ${firstName},</p>`,
      `<p>You've been invited to join <strong>WebriQ Central Hub</strong>.</p>`,
      `<p><a href="${inviteUrl}" style="display:inline-block;padding:10px 20px;background:#1e293b;color:#fff;border-radius:6px;text-decoration:none;font-weight:600;">Accept Invitation</a></p>`,
      `<p style="color:#94a3b8;font-size:12px;">This link expires in 24 hours. If you did not expect this invitation, you can safely ignore this email.</p>`,
    ].join(""),
  });
}
```

Needs: `text` copy "24 hours" → "10 minutes"; `html` rebuilt as a table-based layout with a logo `<img>` pointing at `${process.env.NEXT_PUBLIC_APP_URL ?? "https://hub.webriq.com"}/brand/logo_on_white.png` (same env-fallback pattern already used in `sendInvitationEmail`, `mailer.ts:24`), a white card on a light `#f1f5f9` outer background, and the CTA button recolored to `#F97316` (brand-orange); "24 hours" → "10 minutes" in the `html` string too.

## Implementation Steps

1. In `src/app/(auth)/actions.ts`, update `requestPasswordReset`: after the existing `checkOtpLockout` call, add `const { data: authUser } = await adminClient.auth.admin.getUserById(target.id);` and change the OTP-issuing condition to also require `authUser.user?.last_sign_in_at` to be truthy. Keep everything else (generic `{ ok: true }` return, try/catch around the email send) unchanged.
2. In `src/lib/email/mailer.ts`, rewrite `sendHubInviteEmail`'s `html` string as an inline-styled, table-based email template: outer wrapper table (light background), inner card table (white, rounded corners via `border-radius` where email-client support allows, max-width ~480px), logo `<img src="${appUrl}/brand/logo_on_white.png" width="170" alt="WebriQ Central Hub" style="display:block;margin:0 auto 24px;">` centered at the top, greeting/body copy, CTA button in brand-orange (`#F97316`), and a muted footer line with the corrected "This link expires in 10 minutes." copy plus the existing "if you did not expect this" disclaimer.
3. Update the `text` fallback's "This link expires in 24 hours." line to "This link expires in 10 minutes."
4. Run `npx tsc --noEmit` and `pnpm lint`.
5. Manual verification (see below) — trigger a real invite email and a real forgot-password request against a test/never-registered account and a normal already-registered account, since this is server-action + email-template code with no automated test runner in this repo.

## Acceptance Criteria

- [ ] A `hub_users` row whose Auth user has `last_sign_in_at = null` (never logged in / invite never completed) gets **no** password-reset OTP email when submitting Forgot Password, and the UI shows the same generic "check your email" outcome as any other submission (no error, no enumeration).
- [ ] An existing, previously-active hub user can still successfully request and complete a password reset exactly as before.
- [ ] The invitation email (triggered via "Send Invite" / "Resend Invite" on `/dashboard/users`) renders the WebriQ logo, a redesigned branded layout, and correctly says "expires in 10 minutes" in both the plain-text and HTML bodies.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
```

Manual pass required (no test runner in this repo):
- Import or create a hub user that has never logged in (or use a fresh Zoho-import test row with `is_invited: false`/no login history). Go to `/auth/forgot-password`, submit their email. Confirm no reset-code email arrives and no `otp_codes` row gets created for them (check the table directly), while the UI still proceeds to the generic "verify" screen with no error shown.
- Log in as an existing, already-registered hub user, use Forgot Password normally, and confirm the reset code still arrives and the flow still completes to `/auth/change-password` as before (no regression).
- From `/dashboard/users`, send/resend an invite to a test email and inspect the actual received email: logo renders, layout looks intentional (not a plain unstyled `<p>` stack), CTA button is brand-orange, and the expiry text reads "10 minutes" in both the visible HTML and the plain-text part (view "show original"/plain-text view in the mail client).
- Click the invite link within 10 minutes — confirm registration still completes normally (no regression to the happy path).

## Compatibility Touchpoints

- No new environment variables — reuses `NEXT_PUBLIC_APP_URL` (already used elsewhere in `mailer.ts`) and `MAIL_*` (unchanged transporter config).
- No schema/migration changes.
- `adminClient.auth.admin.getUserById` is an existing Supabase Admin API already used elsewhere in this codebase's pattern (`inviteUser`, `zoho-import/users`) — no new dependency.
- Logo asset (`public/brand/logo_on_white.png`) already exists in the repo; email clients need a publicly reachable absolute URL, so this only renders correctly once `NEXT_PUBLIC_APP_URL` points at a real deployed domain (same pre-existing constraint as the invite link itself).

## Implementation Notes

### What Changed
- `requestPasswordReset` now fetches the target's Supabase Auth record via `adminClient.auth.admin.getUserById(target.id)` and only issues a password-reset OTP (DB insert + email) when both `!locked` and `last_sign_in_at` is set (`hasRegistered`). Never-registered invitees (Zoho-import users with no password set, or invited users who never logged in with their temp/invite credentials) now silently fall through with no OTP issued, while the function's return value stays the same generic `{ ok: true }` for every case — no new branch, no enumeration signal.
- `sendHubInviteEmail` rebuilt: added an `appUrl`/`logoUrl` pair (same `NEXT_PUBLIC_APP_URL ?? "https://hub.webriq.com"` fallback already used by `sendInvitationEmail`), replaced the plain `<p>` stack with a table-based, inline-styled layout (outer light-background wrapper table, white rounded card, centered logo, brand-orange `#F97316` CTA button), and corrected "This link expires in 24 hours." to "This link expires in 10 minutes." in both the `text` and `html` bodies.
- Left `sendInvitationEmail`, `resend.ts`, the OTP/lockout emails, `/auth/register`, `/auth/change-password`, and `otp-lockout.ts` untouched, per Out of Scope.

### Files Changed
- `src/app/(auth)/actions.ts` - `requestPasswordReset` gated on `last_sign_in_at` before issuing a reset OTP
- `src/lib/email/mailer.ts` - `sendHubInviteEmail` redesigned (logo, branded table layout, brand-orange CTA) and "24 hours" → "10 minutes" copy fix in `text` + `html`

### Deviations From Plan
- None. Implementation matches the Code Context/Implementation Steps blocks as written.

### Verification Run
- `npx tsc --noEmit` - PASS (no errors)
- `pnpm lint` - PASS (0 errors; 2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`, untouched by this change)
- Manual browser/email pass - SKIPPED: no `.env.local` in this environment (`MAIL_*`/Supabase credentials required to send a real invite email or exercise a live Forgot Password request against a real `hub_users`/Auth record). A human should run the Verification section's manual checklist before shipping — especially confirming no `otp_codes` row is created for a never-registered account, and visually inspecting the rendered invite email (logo, brand-orange button, "10 minutes" copy) in an actual mail client.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused/dead code, no broad `any` (`authUser.user?.last_sign_in_at` uses the Supabase SDK's typed `User` shape), no new deep nesting, error handling unchanged from the existing pattern in this function.
- Naming (`hasRegistered`, `authUser`, `appUrl`, `logoUrl`) is accurate and self-explanatory.
- No secrets, credentials, or debug logging introduced.
- `git diff --name-only` confirms only the two planned files (plus `TASKS.md` tracker updates) changed — no scope creep into `sendInvitationEmail`, `resend.ts`, `otp-lockout.ts`, or the register/change-password pages, matching Out of Scope.
- `npx tsc --noEmit` and `pnpm lint` both re-verified clean (0 errors; the 2 pre-existing warnings in `_checklist-tab.tsx` are unrelated and untouched).
- Impeccable's design-lint hook flagged Arial/literal-color/literal-radius values in the new `sendHubInviteEmail` HTML — these are false positives in this context: it's a raw nodemailer HTML email, not Tailwind app UI, so DESIGN.md tokens/CSS variables aren't reachable (email clients don't load stylesheets or resolve custom properties); Arial is the standard email-safe font, and `#F97316` is the literal value of the existing `--color-brand-orange` token, exactly as the task's own Requirements/Implementation Steps specified ("table-based, inline-styled"). No change made in response to these flags.

### Deviations
- Minor: `requestPasswordReset` now calls `adminClient.auth.admin.getUserById` unconditionally (even when the account is already `locked`), rather than short-circuiting before the lockout check. Matches the task doc's Code Context/Implementation Steps exactly as written; the extra Admin API call on the already-rare locked-account path is not a meaningful cost.
- Minor (clarifying note, not a code change): the task's acceptance bullet "a still-valid, unused invite link is unaffected by this change either way" is satisfied for the invite-link redemption path itself (`/auth/register`, untouched by this fix) but not literally for Forgot Password on that same not-yet-clicked account — a not-yet-clicked (but still-valid) invitee's `last_sign_in_at` is also `null`, so Forgot Password is now blocked for them too, same as an expired invitee. This is consistent with the task's core intent (Forgot Password should not be usable by anyone who hasn't completed registration, regardless of whether their invite has expired yet) and was already implied by the "root cause" analysis in the task doc; flagging it here for visibility rather than as a defect.

### Required Fixes
- None.
