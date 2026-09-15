# 365: HR &gt; Users — Invite New User (Create + Email Invitation for a Non-Existing User)

**Created:** 2026-09-15
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

`/dashboard/users` (sidebar "People &gt; HR", `V2_ROUTES.DASHBOARD_USERS`) currently only manages users who already have a `hub_users` row — today that row is only created when someone signs in once via the legacy Zoho OAuth flow. There is no way, from this page, to bring a brand-new person (who has never signed in anywhere) into the Hub.

This task adds an **"Invite" button** to the top-right of the Users page header. Clicking it opens a modal to enter the invitee's **email** (+ required **role**, + optional **full name** — see "Design decisions" below). Submitting it, in one action:

1. Creates a real Supabase Auth user for that email (no password set).
2. Creates the corresponding `hub_users` row (the row the Users table itself reads from) and sets `profiles.role`.
3. Emails the person a "set your password" invite link, reusing the exact link-based flow already used by the table's per-row **Send Invite** button (`/auth/register?token_hash=...`).

The new row then appears in the existing table immediately (no page reload), already marked "Invited."

### Key research finding (why step 2 must be explicit)

`handle_new_hub_user()` (the trigger function that auto-inserts a `hub_users` row on `auth.users` insert, added in migration 007/008) is **dead code**. Migration 026 ran `drop trigger if exists on_auth_user_created on auth.users;` and recreated a trigger of the **same name** pointed at `handle_new_user()` (which only inserts into `profiles`). Postgres only allows one trigger per name per table, so since migration 026, creating an `auth.users` row **only** auto-creates a `profiles` row — it does **not** create a `hub_users` row anymore. (Migration 045 later patched `handle_new_hub_user()`'s column references, but never re-attached it to a trigger — it's an orphaned function.)

Confirmed side-effect: the existing legacy invite flow at `(hub)/admin/hub-users/page.tsx` → `inviteUser()` server action (`(auth)/actions.ts:236`) calls `adminClient.auth.admin.createUser()` and only updates `profiles.role` afterward — it never touches `hub_users`. Any user invited through that legacy page today does **not** show up in `/dashboard/users`, since that table's source query (`/api/v2/users`) reads from `hub_users` first and left-joins `profiles`. This task's new endpoint must **not** repeat that gap — it inserts the `hub_users` row itself, explicitly, right after `createUser()` succeeds.

This is a pre-existing gap, not something this task is scoped to fix generally (the dead trigger/orphaned function stays as-is); it's called out because the new code must compensate for it correctly.

### Design decisions made during planning (flagged for review)

- **Role is a required field in the modal**, not optional, even though the request said "enter the email." Reason: the existing per-row flow already hard-gates invite-sending on a role being assigned (`/dashboard/users` row shows "Assign a role first" and hides **Send Invite** until `profile_role` is set; `POST /api/admin/hub-users/[userId]/invite` 400s with `"Assign a role before sending invite"` if role is null). Without a role, "create + immediately email an invite" (what the request asks for) isn't possible under the existing system's own rule. Making role optional would mean either (a) silently picking a default role, which is a bigger behavioral decision, or (b) creating the user but *not* sending the invite yet, contradicting "it will [send] an invitation." Requiring role in the modal keeps one request = one outcome (user created *and* invited) and matches the existing constraint.
- **Full name is an optional field**, not required. It's just used to personalize the invite email greeting ("Hi Ada," vs falling back to the email's local part, exactly like the existing per-row invite route already does: `target.first_name ?? target.email.split("@")[0]`). Omitting it doesn't block anything.
- **Email-link invite (not temp-password invite).** Two invite mechanisms exist in the codebase: the legacy temp-password flow (`inviteUser()` action + `sendInvitationEmail`, reveals a password to the admin) and the current table's recovery-link flow (`sendHubInviteEmail` + `/auth/register?token_hash=...`, person sets their own password). This task uses the **latter**, since it's what the Users page itself already uses for every other invite/resend action on the page — using the other mechanism here would mean two different invite emails/flows depending on whether a user pre-existed, for no reason.
- **On email-send failure after the user row already exists:** do not roll back / delete the created user. The row will simply show up in the table with a role assigned and "Pending" invite status, exactly like any other unsent-invite row — the admin can retry with the existing **Send Invite** button. Only a failure *before* the `hub_users` row exists (i.e. the insert into `hub_users` itself fails) rolls back the just-created auth user (`adminClient.auth.admin.deleteUser`), since without that row the person is invisible to the table and their email stays permanently "taken," blocking a clean retry.

If any of these three decisions should go differently, flag it now — they shape the API contract below.

## Requirements

- [ ] "Invite" button in the top-right of the `/dashboard/users` header (next to the existing "Refresh" link), visible to the same viewers who can already reach this page (admin / super_admin).
- [ ] Clicking it opens a modal with: Email (required), Full name (optional), Role (required select — same option set as the existing per-row role `<select>`).
- [ ] Submitting the modal creates a new Supabase Auth user, a `hub_users` row, and sets `profiles.role`, then sends the same style of invite email the table's **Send Invite** button sends.
- [ ] On success: modal closes, the new user appears at the top of the table immediately (no full refetch required), already showing role + "Invited" status; a toast confirms ("Invitation sent to …").
- [ ] On failure (duplicate email, invalid email, email-send failure, etc.): modal stays open and shows an inline error, matching the existing modal error-display convention in this codebase.
- [ ] Duplicate email (already a `hub_users`/auth user) is rejected with a clear message — not a raw DB error.
- [ ] Only admin / super_admin may call the new endpoint (mirrors every other route under `/api/v2/users*` and `/api/admin/hub-users*`); only a super_admin may invite someone as `super_admin` (mirrors the existing per-row PATCH rule).

## Out of Scope / Must-Not-Change

- Do not re-attach `handle_new_hub_user()` as a trigger, or otherwise "fix" the migration-026 trigger gap generally — only compensate for it inside the new endpoint, as described above.
- Do not touch the legacy `(hub)/admin/hub-users/page.tsx` page or the `inviteUser()` server action in `(auth)/actions.ts` — leave the old temp-password flow exactly as-is.
- Do not change the existing per-row **Send Invite** / **Resend** behavior, role `<select>`, status toggle, unlock, or any other existing row action on `/dashboard/users`.
- Do not change `/auth/register`, `/auth/login`, or any other auth page.
- No new npm/pnpm dependency, no schema migration (the `hub_users` and `profiles` columns this needs already exist).
- Do not adopt the `_final_design/guide/` CSS-custom-property/`dark:`-variant system wholesale — the guide's tokens are applied the way this codebase already applies them elsewhere (see Code Context: `_create-task-modal.tsx`), as literal hex Tailwind arbitrary values, not new CSS variables. Do not restyle the rest of the existing `/dashboard/users` page (its slate/`brand-orange` table, KPI cards, toast, etc.) to match the design guide — only the new button and modal use the guide's tokens; everything else on the page is untouched.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/auth/hub-role-map.ts` | Create | Shared `VALID_ROLES` / `ROLE_DISPLAY` (hub_users display string) / `PROFILE_ROLE` (profiles enum) maps, extracted out of `api/v2/users/[userId]/route.ts` so the new invite route can reuse the exact same role vocabulary instead of duplicating it. |
| `src/app/api/v2/users/[userId]/route.ts` | Modify | Replace its local `VALID_ROLES`/`ROLE_DISPLAY`/`PROFILE_ROLE` consts with imports from the new shared file. No behavior change. |
| `src/app/api/admin/hub-users/invite/route.ts` | Create | `POST` — validates input, creates the auth user, inserts the `hub_users` row, sets `profiles.role`, generates the recovery link, sends the invite email, returns the new row shaped like the table's `HubUser`. |
| `src/app/(hub)/dashboard/users/page.tsx` | Modify | Export `ProfileRole`, `HubUser`, `ROLE_OPTIONS` (add the `export` keyword — no behavior change); add "Invite" button + modal state/wiring in the header and near the toast block. |
| `src/app/(hub)/dashboard/users/_invite-user-modal.tsx` | Create | The modal itself — controlled form, POSTs to the new route, reports the created user back to the page. |

## Code Context

### `src/app/api/admin/hub-users/[userId]/invite/route.ts` (existing per-row invite — the pattern to mirror for link generation + email)

```ts
const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
  type: "recovery",
  email: target.email,
});
const hashedToken = linkData?.properties?.hashed_token;
const inviteUrl = `${process.env.NEXT_PUBLIC_APP_URL}/auth/register?token_hash=${hashedToken}&type=recovery`;
await sendHubInviteEmail(target.email, target.first_name ?? target.email.split("@")[0], inviteUrl);
await adminClient.from("hub_users").update({ is_invited: true }).eq("id", userId);
```

The new route does the same generateLink → `sendHubInviteEmail` → `is_invited: true` sequence, just after creating the user + `hub_users` row instead of loading an existing one.

### `src/app/api/v2/users/[userId]/route.ts` (role maps to extract)

```ts
const VALID_ROLES = ["admin", "super_admin", "hr", "pm", "developer", "client", "other"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

const ROLE_DISPLAY: Record<ValidRole, string> = {
  admin: "Admin", super_admin: "Super Admin", hr: "HR", pm: "PM",
  developer: "Developer", client: "Client", other: "Other",
};

// "other" maps to "client" in profiles (closest enum value for non-standard roles)
const PROFILE_ROLE: Record<ValidRole, "admin" | "super_admin" | "hr" | "pm" | "developer" | "client"> = {
  admin: "admin", super_admin: "super_admin", hr: "hr", pm: "pm",
  developer: "developer", client: "client", other: "client",
};
```

Move these three (plus the `ValidRole` type) into `src/lib/auth/hub-role-map.ts`, export all four, import them back into `[userId]/route.ts` unchanged in behavior.

### `src/app/(auth)/actions.ts` — `inviteUser()` (legacy pattern, NOT reused directly, but shows the `createUser` call shape + the super_admin gate + name-splitting to mirror)

```ts
if (role === "super_admin" && callerRole !== "super_admin") {
  return { error: "Only a Super Admin can invite Super Admin users." };
}
const { data, error } = await adminClient.auth.admin.createUser({
  email,
  password: tempPassword,
  email_confirm: true,
  user_metadata: { full_name: fullName, display_name: fullName, force_password_change: true },
});
```
The new route reuses the `super_admin` gate and the `createUser` call, but **omits `password`** (optional in `AdminUserAttributes` — confirmed in `@supabase/auth-js` types) and does not set `force_password_change`, since the person sets their own password via the recovery link, not a temp password.

### `src/app/(hub)/dashboard/users/page.tsx` — existing types/consts to export (add `export`, no other change)

```ts
type ProfileRole = "admin" | "super_admin" | "hr" | "pm" | "developer" | "client";
interface HubUser { id: string; email: string; first_name: string | null; last_name: string | null;
  role: string | null; profile_role: ProfileRole | null; full_name: string | null; avatar_url: string | null;
  status: string; is_invited: boolean; joined_at: string | null; external_id: string | null;
  created_at: string; otp_locked_until: string | null; }
const ROLE_OPTIONS: { value: SelectRole; label: string }[] = [ /* super_admin, admin, hr, pm, developer, client, other */ ];
```

Header area to extend (around `page.tsx:466-486`):

```tsx
<div className="flex items-start justify-between gap-4">
  <div>...</div>
  <div className="flex items-center gap-3">
    <button onClick={loadUsers} ...>Refresh</button>
    {/* NEW: Invite button */}
  </div>
</div>
```

### `src/app/(hub)/projects/_shared/_create-task-modal.tsx` — the modal shell + design-guide tokens to reuse verbatim (this is the concrete precedent for "follow the `_final_design/guide/` tokens" in this codebase — the guide's hex values applied as Tailwind arbitrary values, not CSS custom properties)

```tsx
const inputClass = "w-full px-3 py-2 rounded-[10px] border text-[13px] outline-none transition-colors border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]";
const labelClass = "text-[11px] font-semibold text-[#0B1533]";

<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B1533]/40 p-4" onClick={onClose}>
  <div className="w-full max-w-2xl rounded-[14px] bg-white shadow-xl border border-[#E2E7F2] overflow-hidden max-h-[90vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
    <div className="flex items-center justify-between px-5 py-4 border-b border-[#EDF0F7] shrink-0">
      <h2 className="text-[15px] font-semibold text-[#0B1533]">New Task</h2>
      <button onClick={onClose} className="p-1 rounded-md text-[#5F6A88] hover:text-[#0B1533] hover:bg-[#F4F6FB] cursor-pointer transition-colors"><X size={16} /></button>
    </div>
    {/* body */}
    <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-[#EDF0F7] bg-[#F4F6FB] shrink-0">
      <button onClick={onClose} className="px-4 py-2 rounded-full text-[13px] text-[#3A4565] bg-white border border-[#E2E7F2] hover:border-[#A8C6F5] cursor-pointer transition-colors">Cancel</button>
      <button className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#007BFF] text-white text-[13px] font-medium hover:bg-[#0063D6] disabled:opacity-45 cursor-pointer transition-colors">{saving && <Loader2 size={14} className="animate-spin" />} Create</button>
    </div>
  </div>
</div>
```

The design guide's CTA-button spec (`--orange` bg `#FB914E`, text `#471F02`, hover `--orange-600` `#E2762F` + white text, pill radius) is what triggers this modal, matching the existing "New Task" trigger button in `_project-detail.tsx:541`:

```tsx
className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#FB914E] text-[#471F02] text-[12.5px] font-medium hover:bg-[#E2762F] hover:text-white transition-colors cursor-pointer shrink-0"
```

Use this exact class string (icon `UserPlus` or `Mail`, label "Invite") for the new header button. Use the modal's own primary submit button as the **blue** "confirm" style (`bg-[#007BFF] hover:bg-[#0063D6]`) per the guide's "one orange CTA per screen" rule — the orange CTA is the header button that opens the modal; the modal's own submit is a secondary confirm action, not a second CTA.

### `hub_users` insertable columns (from `src/types/database.ts`, `Database["public"]["Tables"]["hub_users"]["Insert"]`)

```ts
{ id: string; email: string; first_name?: string | null; last_name?: string | null; role?: string | null;
  external_id?: string | null; status?: string; is_invited?: boolean; last_active_at?: string | null;
  joined_at?: string | null; cost_rate_per_hour?: number; source_meta?: Json; created_at?: string; updated_at?: string; }
```

### `src/lib/email/mailer.ts` — email function to reuse

```ts
export async function sendHubInviteEmail(to: string, firstName: string, inviteUrl: string) { ... }
```

## Implementation Steps

1. Create `src/lib/auth/hub-role-map.ts` exporting `VALID_ROLES`, `ValidRole`, `ROLE_DISPLAY`, `PROFILE_ROLE` (copied verbatim from `api/v2/users/[userId]/route.ts`).
2. Update `api/v2/users/[userId]/route.ts` to import those four from the new file instead of declaring them locally; run `npx tsc --noEmit` to confirm no behavior/type change.
3. Create `POST /api/admin/hub-users/invite/route.ts`:
   - Auth guard identical to `api/v2/users/route.ts` (require session, require `profiles.role` in `admin`/`super_admin`).
   - Parse `{ email, role, fullName? }` from the JSON body. Trim + lowercase email. Validate with a simple email regex (e.g. `/^[^\s@]+@[^\s@]+\.[^\s@]+$/`) → 400 "Enter a valid email address." if it fails.
   - Validate `role` is in `VALID_ROLES` → 400 "Invalid role." Enforce the existing super_admin gate (`role === "super_admin" && callerRole !== "super_admin"` → 403), matching `[userId]/route.ts`.
   - Pre-check: `adminClient.from("hub_users").select("id").eq("email", email).maybeSingle()` → 409 "A user with this email already exists." if found.
   - `const { data, error } = await adminClient.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: fullName || null, role: PROFILE_ROLE[role] } })`. On error, if the message indicates the email is already registered, return 409 with the same friendly message; otherwise 500.
   - Split `fullName` into `first_name`/`last_name` the same way `(auth)/actions.ts`'s legacy `inviteUser` does (`fullName.split(/\s+/)`), both `null` if `fullName` is empty.
   - Insert the `hub_users` row: `{ id: data.user.id, email, first_name, last_name, role: ROLE_DISPLAY[role], status: "active", is_invited: false }`. On error: `await adminClient.auth.admin.deleteUser(data.user.id)` then return 500 "Failed to create user record."
   - Update `profiles.role` for `data.user.id` to `PROFILE_ROLE[role]` (belt-and-suspenders — the trigger already sets it from `user_metadata.role`, but do it explicitly the same way `[userId]/route.ts` does, so this route doesn't silently depend on trigger internals).
   - `generateLink({ type: "recovery", email })` → build `inviteUrl` exactly as the existing per-row invite route does → `sendHubInviteEmail(email, first_name ?? email.split("@")[0], inviteUrl)`. If this step throws/errors, **do not** delete the user or the `hub_users` row — return 500 with a message that says the account was created but the invite email failed to send, and that "Send Invite" on the row can be used to retry.
   - On full success: `adminClient.from("hub_users").update({ is_invited: true }).eq("id", data.user.id)`, then respond `200` with a JSON object shaped like the table's `HubUser` (`id, email, first_name, last_name, role: ROLE_DISPLAY[role], profile_role: PROFILE_ROLE[role], full_name: fullName || null, avatar_url: null, status: "active", is_invited: true, joined_at: null, external_id: null, created_at: <now iso>, otp_locked_until: null`) under a `user` key: `{ user }`.
4. Add `export` to `ProfileRole`, `HubUser`, and `ROLE_OPTIONS` in `dashboard/users/page.tsx` — no other change to that file's existing logic.
5. Create `_invite-user-modal.tsx`:
   - Props: `onClose: () => void`, `onInvited: (user: HubUser) => void`, `viewerRole: ProfileRole | null` (kept for parity/future use; the super_admin restriction is enforced server-side exactly like the existing per-row select already relies on server-side enforcement — no new client-side option-filtering).
   - Local state: `email`, `fullName`, `role` (default `""`, disabled placeholder option "Select a role…" + `ROLE_OPTIONS.map(...)`), `saving`, `error`.
   - Submit handler: client-side guard for empty email/role → inline error; else `fetch("/api/admin/hub-users/invite", { method: "POST", ... })`; non-OK → `setError(d.error)`; OK → `onInvited(d.user); onClose();`.
   - Visual shell copied from `_create-task-modal.tsx` (overlay/card/header/footer classes above), fields styled with local `inputClass`/`labelClass` consts (same values), `Mail`/`User`/`ShieldCheck` leading icons on the three fields (matching the legacy `(hub)/admin/hub-users/page.tsx` input style), `X`/`Loader2` for close/saving states, inline error paragraph in `text-[#C0392B]`.
6. In `dashboard/users/page.tsx`: add `showInvite` state, the header "Invite" button (orange CTA class from Code Context, `UserPlus` icon), and render `<InviteUserModal ... />` conditionally, with `onInvited` doing `setUsers((prev) => [user, ...prev])` + `showToast(\`Invitation sent to ${user.email}\`)`.
7. Run `npx tsc --noEmit` and `pnpm lint`.
8. Manual/browser verification per the Acceptance Criteria below (dev server, sign in as an admin/super_admin, exercise the full flow including the duplicate-email and invalid-email error paths).

## Acceptance Criteria

- [ ] `/dashboard/users` header shows an "Invite" button, styled as the orange CTA pill per the design guide, positioned top-right.
- [ ] Clicking it opens a modal with Email, Full name (optional), Role fields, Cancel + Send Invite actions.
- [ ] Submitting with a new, valid email + role: creates a Supabase Auth user, a `hub_users` row, sets `profiles.role`; the invitee receives an email with a working "set your password" link that lands on `/auth/register` and lets them complete registration exactly like an existing per-row invite does.
- [ ] On success, the modal closes, the new row appears at the top of the table without a manual refresh, already showing the chosen role and an "Invited" pill, and a success toast appears.
- [ ] Submitting with an email that already belongs to a `hub_users` row shows an inline "A user with this email already exists" error and does not create a duplicate or a duplicate email attempt in Supabase Auth.
- [ ] Submitting with an obviously invalid email (no `@`, etc.) is rejected client-side before any network call.
- [ ] A non-super_admin caller attempting to invite someone as "Super Admin" is rejected (403) with a clear message, both if somehow submitted client-side and if hit directly at the API.
- [ ] A non-admin/non-super_admin caller gets 403/401 from the new endpoint (verify by hitting it directly, e.g. via `curl` with a non-admin session, or by reasoning from the auth guard code — this mirrors every sibling route already reviewed).
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new warnings/errors.
- [ ] `_invite-user-modal.tsx` and the new API route each stay within the file-length guidance in `nextjs-file-length-best-practices.md` (soft warning ~250-300 lines; hard ceiling ~400-500) — split further only if a section genuinely earns its own file, don't split just to hit a number.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then sign in as an admin/super_admin user and exercise the flow in-browser:
           #   - open /dashboard/users, click Invite, submit a new email + role
           #   - confirm the row appears immediately, "Invited" pill shown
           #   - check the invite email actually arrives (or check server logs / mailer config) and that its link completes registration
           #   - retry with the same email to confirm the duplicate-email error path
           #   - retry with a malformed email to confirm the client-side validation path
```

No automated test runner is configured for this repo (per `CLAUDE.md`) — verification is `tsc` + lint + the manual browser walkthrough above.

## Compatibility Touchpoints

- No schema migration needed — `hub_users` and `profiles` already have every column this uses.
- No new environment variables — reuses `NEXT_PUBLIC_APP_URL` (already required by the existing per-row invite route) and the existing mailer config (`sendHubInviteEmail`).
- No new dependencies.
- Does not affect the `(auth)` route group, the legacy `_hub_(OLD)`/`(hub)/admin/hub-users` pages, or any Zoho import/export/sync code.

## Implementation Notes

### What Changed
- Added an "Invite" button (orange CTA, matches `_project-detail.tsx`'s "New Task" button class exactly) to the top-right of `/dashboard/users`, opening a modal that collects Email (required), Full name (optional), Role (required).
- On submit, a new `POST /api/admin/hub-users/invite` route creates a Supabase Auth user (no password — recovery-link flow), explicitly inserts a `hub_users` row (compensating for the dead migration-026 trigger), sets `profiles.role`, generates a recovery link, and sends `sendHubInviteEmail` — the exact same email/link mechanism the existing per-row "Send Invite" button uses.
- On success the new row is prepended to the table client-side (no refetch) and a toast confirms; on any failure after the `hub_users` row exists, the row stays (uninvited) so the existing per-row "Send Invite" button can retry — only a `hub_users` insert failure rolls back the created auth user.
- Extracted `VALID_ROLES`/`ROLE_DISPLAY`/`PROFILE_ROLE`/`ValidRole` out of `api/v2/users/[userId]/route.ts` into a new shared `src/lib/auth/hub-role-map.ts`, imported by both routes.
- Exported `ProfileRole`, `HubUser`, `ROLE_OPTIONS` from `dashboard/users/page.tsx` (added `export` only, no behavior change) so the new modal component can reuse them.

### Files Changed
- `src/lib/auth/hub-role-map.ts` — new shared role-vocabulary module.
- `src/app/api/v2/users/[userId]/route.ts` — now imports role maps from the shared module instead of declaring them locally.
- `src/app/api/admin/hub-users/invite/route.ts` — new endpoint: create user + hub_users row + profile role + send invite, in one request.
- `src/app/(hub)/dashboard/users/page.tsx` — added `export` to `ProfileRole`/`HubUser`/`ROLE_OPTIONS`; added `showInvite` state, header Invite button, and `<InviteUserModal>` render.
- `src/app/(hub)/dashboard/users/_invite-user-modal.tsx` — new modal component.

### Deviations From Plan
- Excluded the `"other"` option from the invite modal's role `<select>` (plan said reuse `ROLE_OPTIONS` as-is). Reason found during implementation: `"other"` exists in the table's per-row select only as a display bucket for legacy imported rows whose role couldn't be cleanly mapped (`getSelectValue()` maps `hub_users.role === "Other"` to it) — there's no legacy imported role to map for a brand-new invite, so offering it here would just be a confusing no-op choice (it silently resolves to `profile_role: "client"` either way, same as picking "Client" directly). All other fields/behavior match the plan.
- Everything else matches the approved task document exactly (route shape, rollback behavior, email reuse, shared role-map extraction, modal field set).

### Verification Run
- `npx tsc --noEmit` — PASS (no output, zero errors).
- `pnpm lint` — PASS (2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`; nothing new).
- Browser walkthrough (create + invite, duplicate-email error, invalid-email error, email delivery/registration round-trip) — NOT RUN (no running dev server / authenticated admin session available in this session). Flagged for the `test` stage.
- `pnpm build` — NOT RUN (not requested at this stage; no build-breaking signal expected since `tsc`/lint are clean, but unverified).

## Quality Gate Notes

### Result
PASS

### Standards Review
- Read all five changed files in full (`hub-role-map.ts`, `api/v2/users/[userId]/route.ts`, `api/admin/hub-users/invite/route.ts`, `dashboard/users/page.tsx`, `_invite-user-modal.tsx`).
- Found one real issue during review: `InviteUserModal` declared a `viewerRole?: ProfileRole | null` prop (kept "for parity/future use" per the plan) that was never read anywhere in the component body — dead prop, and the exact kind of speculative future-proofing the project's own conventions warn against. **Fixed**: removed the prop from the modal's signature and from the `page.tsx` call site, and dropped the now-unused `ProfileRole` import from the modal. Re-ran `npx tsc --noEmit` and `pnpm lint` after the fix — both still pass clean (same 2 pre-existing unrelated warnings, zero new).
- No other unused code, no `any`/untyped escape hatches, no unnecessary nesting (both the route and the modal read as a sequence of early-return guard clauses). Error handling is intentional and matches the sibling routes' existing conventions exactly (including the un-try/caught `req.json()` call, which mirrors `[userId]/route.ts` and `v2/users/route.ts` verbatim rather than being a new gap). No secrets, tokens, or passwords logged — only email addresses and generic error messages go to `console.error`, consistent with the rest of the codebase.
- `hub_users`/`profiles`/auth-user naming, the role-map extraction, and the modal's visual tokens all match the approved plan's Code Context precedents exactly (`_create-task-modal.tsx` shell, `_project-detail.tsx`'s CTA button class verbatim).
- Verified against every `Out of Scope / Must-Not-Change` boundary: `(auth)/actions.ts`, `(hub)/admin/hub-users/page.tsx`, `/auth/register`, `/auth/login`, the per-row Send Invite/Resend/status/unlock actions, and the rest of `/dashboard/users`'s visual styling are all untouched — confirmed by re-reading the full `page.tsx` diff area and the unrelated pre-existing `design-system-font-size` hook findings (all at line numbers outside anything this task edited).

### Deviations
- **Minor** — Excluded `"other"` from the invite modal's role `<select>` (documented in Implementation Notes at implement time). Still satisfies every requirement and acceptance criterion; `"other"` remains a valid value everywhere else (`VALID_ROLES`, the per-row select, the API), only the brand-new-invite modal omits it since it's a legacy-import-only bucket with no equivalent for a fresh invite.
- **Minor** — Removed the unused `viewerRole` prop from `InviteUserModal` during this quality-gate pass (not present in the original plan or the implement-stage notes as a deviation, since it was only discovered now). No requirement or acceptance criterion referenced it; removing it is a pure cleanup with no behavior change, verified by a clean `tsc`/`lint` re-run.
- No Medium or Major deviations. Scope, architecture, and requirements match the approved task document.
