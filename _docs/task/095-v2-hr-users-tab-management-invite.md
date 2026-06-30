# Task 095 — v2 HR > Users Tab: List Users, Manage Role/Status, Send Invite

> **Type:** feature
> **Priority:** HIGH
> **Version Impact:** minor
> **Recommended Model:** sonnet
> **Status:** COMPLETED
> **Completed:** 2026-06-30
> **Investigation:** /understand ran before this spec. Findings embedded below.

## Post-Implementation Notes

### Fixes Applied After Initial Implementation

**1. Role dropdown showed "Client" for all unassigned users**

Root cause: the `handle_new_user()` trigger sets `profiles.role = 'client'` as default for all new users. Imported Zoho users have `hub_users.role = null` (no explicit assignment) but `profiles.role = 'client'` from the trigger. The original select was driven by `profile_role`, so every unassigned user appeared as "Client".

Fix: introduced `getSelectValue(user)` which reads `hub_users.role` (nullable) instead of `profile_role`. When `hub_users.role` is null → select value is `""` → shows `--`. The `profile_role` is only used as a fallback after the null check.

**2. "Other" role added**

Added `"other"` as a valid option in the role dropdown (displayed in orange). In the PATCH API, `"other"` maps to `profiles.role = "client"` (closest enum value) and `hub_users.role = "Other"` (display string). The `PROFILE_ROLE` map in the API handles this translation.

**3. Column header renamed**

Changed column header from "V2 Role" to "Role".

### Flow Verified End-to-End

- Invite sent → recovery link generated with `redirectTo` pointing to `/v2/auth/register`
- Register page: session established from hash tokens, email pre-filled (read-only), password set
- `registerFromInvite` calls `postLoginGate` → `deviceSession: null` (PGRST116) on first login is **expected** — no device session exists yet, so OTP is triggered
- OTP verified → device session upserted → user lands on `/v2/dashboard`
- On subsequent logins from the same device within 7 days, OTP is skipped

---

## Problem

The v2 HR > "Users" tab (`/v2/dashboard/users`) is a 6-line stub. All hub users were imported from Zoho in Task 093, but there's no UI to view them, update their role or status, or send them an invite to register.

Additionally, the existing invite REST route (`/api/admin/hub-users/[userId]/invite`) has two bugs:
1. It checks `hub_users.role` for "Super Admin"/"Admin" — these are Zoho-style labels, not v2 profile roles. A v2 admin (with `profiles.role = "admin"` and `hub_users.role = null`) would be blocked.
2. `generateLink` is called without a `redirectTo`, so the recovery link lands on Supabase's default reset page instead of the v2 registration page.

There is also no invite registration page — `/v2/auth/signup` is a dead redirect.

---

## Requirements

1. **Users list page** at `/v2/dashboard/users` (visible only to `admin` role):
   - Fetch all `hub_users` rows joined with `profiles` (for `profiles.role`)
   - Display columns: full name, email, hub role (from `hub_users.role`), v2 role (from `profiles.role`), status, is_invited, joined_at
   - Inline role editor: dropdown to change `profiles.role` enum (`admin | hr | pm | developer | client`) — saves immediately on change, writes both `hub_users.role` and `profiles.role`
   - Status toggle: activate / deactivate (sets `hub_users.status`) — immediate, no confirmation
   - Invite button: shown for users where `is_invited = false`; fires `POST /api/admin/hub-users/[userId]/invite`; button updates to "Invited" after success; shows error toast on failure if role is not yet assigned

2. **Fix invite REST route** (`/api/admin/hub-users/[userId]/invite/route.ts`):
   - Replace `hub_users.role` auth guard with `profiles.role === "admin"` check
   - Add `redirectTo: \`${process.env.NEXT_PUBLIC_APP_URL}/v2/auth/register\`` to `generateLink` call
   - Remove the `if (target.is_invited)` early-return guard — allow resend (admin may need to resend)

3. **New API routes** for the Users list and role/status CRUD:
   - `GET /api/v2/users` — returns `hub_users` joined with `profiles`, admin-only
   - `PATCH /api/v2/users/[userId]` — updates `hub_users.role` (string) + `profiles.role` (enum) for role changes, or `hub_users.status` for status changes; admin-only

4. **Invite registration page** at `/v2/auth/register`:
   - Renders when a recovery link is clicked (Supabase auto-signs in via the token in the URL hash)
   - Email field: read-only, pre-populated from the signed-in session
   - Password + Confirm Password fields
   - On submit: calls a new `registerFromInvite(password)` Server Action that:
     a. Calls `supabase.auth.updateUser({ password })` to set the password
     b. Calls `postLoginGate(deviceId)` to trigger OTP step
     c. Returns `{ redirect: "/v2/auth/verify" }` (OTP page handles the rest)
   - After OTP verification, user lands on `/v2/dashboard`

5. **Sidebar cleanup**: Remove the duplicate "Auth frames" Admin nav item in `v2-hub-sidebar.tsx:53` (points to same URL as HR "Users")

---

## File Changes

| File | Action | Notes |
|------|--------|-------|
| `src/app/v2/(hub)/dashboard/users/page.tsx` | Modify | Replace 6-line stub with full client component Users management UI |
| `src/app/v2/(auth)/auth/register/page.tsx` | Create | Invite registration page (email RO, password, confirm password) |
| `src/app/v2/(auth)/actions.ts` | Modify | Add `registerFromInvite()` Server Action |
| `src/app/api/admin/hub-users/[userId]/invite/route.ts` | Modify | Fix v2 auth guard + add redirectTo to generateLink + remove resend block |
| `src/app/api/v2/users/route.ts` | Create | `GET` — hub_users joined with profiles, admin-only |
| `src/app/api/v2/users/[userId]/route.ts` | Create | `PATCH` — role/status update, writing both tables, admin-only |
| `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` | Modify | Remove "Auth frames" Admin nav item (line 53) |

---

## Code Context

### `hub_users` Row type (`src/types/database.ts:1879-1894`)

```typescript
Row: {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  role: string | null;             // free-form string from Zoho import
  external_id: string | null;
  status: string;                  // e.g. "active" / "inactive"
  is_invited: boolean;
  last_active_at: string | null;
  joined_at: string | null;
  cost_rate_per_hour: number;
  source_meta: Json;
  created_at: string;
  updated_at: string;
};
```

### `profiles` Row type (`src/types/database.ts:498-505`)

```typescript
Row: {
  id: string;
  role: "admin" | "hr" | "pm" | "developer" | "client";  // enum — auth system uses this
  full_name: string | null;
  avatar_url: string | null;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
};
```

### Existing invite route — current (broken) auth guard (`src/app/api/admin/hub-users/[userId]/invite/route.ts:17-22`)

```typescript
const { data: caller } = await adminClient
  .from("hub_users")
  .select("role")
  .eq("id", user.id)
  .single();
if (!["Super Admin", "Admin"].includes(caller?.role ?? "")) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

Replace with:

```typescript
const { data: profile } = await adminClient
  .from("profiles")
  .select("role")
  .eq("id", user.id)
  .single();
if (profile?.role !== "admin") {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

### Existing invite route — current `generateLink` call (`src/app/api/admin/hub-users/[userId]/invite/route.ts:38-41`)

```typescript
const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
  type: "recovery",
  email: target.email,
});
```

Fix by adding `redirectTo`:

```typescript
const { data: linkData, error: linkErr } = await adminClient.auth.admin.generateLink({
  type: "recovery",
  email: target.email,
  options: {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/v2/auth/register`,
  },
});
```

### `postLoginGate()` signature (`src/app/v2/(auth)/actions.ts:36-38`)

```typescript
export async function postLoginGate(
  deviceId: string,
  returnTo?: string
): Promise<{ redirect: string; error?: string }>
```

Call this at the end of `registerFromInvite()` to trigger the OTP gate. It already handles `force_password_change` redirect, OTP pending state, and device session checks — do not duplicate this logic.

### `inviteUser()` — the OLD temp-password approach to avoid (`src/app/v2/(auth)/actions.ts:163-203`)

The existing `inviteUser()` action creates net-new users with a temp password. **Do not use this for the Users tab invite.** Pre-imported users already have auth accounts — use the recovery link approach via `POST /api/admin/hub-users/[userId]/invite`.

### Sidebar duplicate entry to remove (`src/app/v2/(hub)/_components/v2-hub-sidebar.tsx:51-54`)

```typescript
const adminItems: NavItem[] = isAdmin ? [
  { label: "Settings",    icon: <Settings size={18} />, href: V2_ROUTES.DASHBOARD_SETTINGS },
  { label: "Auth frames", icon: <KeyRound size={18} />, href: V2_ROUTES.DASHBOARD_USERS },  // ← REMOVE this line
] : [];
```

### `sendHubInviteEmail()` — use this for invite emails (`src/lib/email/mailer.ts:34`)

```typescript
export async function sendHubInviteEmail(to: string, firstName: string, inviteUrl: string)
```

Already formatted with HTML button. Do not create a new email function.

---

## Implementation Steps

### Step 1 — Fix invite REST route

1. Open `src/app/api/admin/hub-users/[userId]/invite/route.ts`
2. Replace the `hub_users.role` auth guard with the `profiles.role === "admin"` pattern (see Code Context above)
3. Add `options.redirectTo` to the `generateLink` call pointing to `/v2/auth/register`
4. Remove the `if (target.is_invited)` early-exit — replace with a soft reset: don't block the resend

### Step 2 — New API routes

**`GET /api/v2/users/route.ts`:**
- Auth guard: `profiles.role === "admin"` via `createClient()` + `adminClient`
- Query: `adminClient.from("hub_users").select("id, email, first_name, last_name, role, status, is_invited, joined_at, external_id")`
- Join profiles: separate query `adminClient.from("profiles").select("id, role, full_name").in("id", hubUserIds)` then merge by id
- Return merged array

**`PATCH /api/v2/users/[userId]/route.ts`:**
- Auth guard: same as above
- Body: `{ role?: ProfileRole, status?: string }` (use zod for validation)
- If `role` present: update `profiles.role` AND `hub_users.role` (map ProfileRole enum to display string for hub_users)
- If `status` present: update `hub_users.status` only
- Return `{ ok: true }`

### Step 3 — Users list page

Replace `src/app/v2/(hub)/dashboard/users/page.tsx` with a client component:

- Fetch `GET /api/v2/users` on mount via `useState` + `useEffect`
- Table columns: Avatar/initials | Name | Email | Hub Role (hub_users.role display) | V2 Role (profiles.role dropdown) | Status (toggle badge) | Invited (badge) | Joined | Actions (Invite button)
- Role dropdown: `<select>` with options `admin | hr | pm | developer | client`, calls `PATCH /api/v2/users/[id]` on change
- Status toggle: click to flip active ↔ inactive, calls `PATCH /api/v2/users/[id]` with `{ status }`
- Invite button: `POST /api/admin/hub-users/[userId]/invite`; on success, update local state to mark as invited; show error toast if role not assigned yet (API returns 400)
- Loading skeleton while fetching; empty state if no users
- Guard: redirect to `/v2/dashboard` if not admin (check via layout — but also guard in the page for safety)

### Step 4 — Register page

Create `src/app/v2/(auth)/auth/register/page.tsx`:

- Supabase recovery links auto-sign-in the user when the token is consumed from the URL hash (handled by `@supabase/ssr` via the `createClient()` session detection)
- Page should check for an active session on render — if no session (token invalid/expired), redirect to `/v2/auth/login?error=invite_expired`
- Form: email (read-only, from `supabase.auth.getUser().email`), password, confirm password
- Submit calls `registerFromInvite(password)` Server Action
- On success, redirect to the path returned by `postLoginGate()` (should be `/v2/auth/verify`)
- Error display inline below the form

### Step 5 — `registerFromInvite()` Server Action

Add to `src/app/v2/(auth)/actions.ts`:

```typescript
export async function registerFromInvite(
  password: string,
  deviceId: string
): Promise<{ redirect?: string; error?: string }> {
  if (password.length < 8) return { error: "Password must be at least 8 characters." };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Session expired. Request a new invite." };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  // Mark hub_users as joined
  await adminClient
    .from("hub_users")
    .update({ joined_at: new Date().toISOString() })
    .eq("id", user.id);

  return postLoginGate(deviceId);
}
```

### Step 6 — Sidebar cleanup

Remove the "Auth frames" line from `v2-hub-sidebar.tsx:53` (see Code Context above).

---

## Notes for Implementation Agent

- **Sonnet recommended** because this task touches 7 files across 3 layers (DB API, REST routes, UI), includes security-sensitive auth guard fixes, and introduces a new auth registration flow.
- **Two-table role update is mandatory.** Updating only `profiles.role` or only `hub_users.role` creates silent divergence. Always write both in the same PATCH handler. Map the profile enum to a display string for `hub_users.role` (e.g., `"admin"` → `"Admin"`, `"developer"` → `"Developer"`).
- **v2 admin guard = `profiles.role === "admin"`**, not `hub_users.role`. The existing invite route checks `hub_users.role` for "Super Admin"/"Admin" — this is wrong for v2 users.
- **`generateLink` needs `options.redirectTo`**. Without it, the recovery link points to Supabase's default handler and the user never reaches the register page.
- **The register page gets a session automatically.** Supabase processes the recovery token client-side (via `@supabase/ssr`'s `exchangeCodeForSession` or hash detection). The page can call `supabase.auth.getUser()` directly — it should already have a session when the user lands.
- **`postLoginGate()` already handles the OTP chain.** Do not re-implement OTP sending or device session logic in `registerFromInvite()`. Call `postLoginGate(deviceId)` and return its `{ redirect }` to the page.
- **`sendHubInviteEmail()` already exists** in `src/lib/email/mailer.ts:34`. The invite route already uses it — do not create a new email function.
- **Page-scoped UI**: The users table is a single-page component. Do not extract sub-components to `src/components/` — inline everything into the page file.
- **`window.location`** is only safe inside `useEffect` or callbacks, never at render time. Use it only inside the useEffect that reads the session for the register page.
- **Styling**: Use Tailwind classes and `cn()` from `@/lib/utils`. Use `adminClient` from `@/lib/supabase/admin` for all writes; `createClient()` from `@/lib/supabase/server` for auth checks in Server Actions and API routes.

---

## Resolved Open Questions

| Question | Decision |
|----------|----------|
| Registration page route | `/v2/auth/register` (new page, not repurpose of /signup) |
| Invite link type | `recovery` with `redirectTo` pointing to `/v2/auth/register` |
| Status management | Yes — include active/inactive toggle |
| Role change UX | Immediate save, no confirmation modal |
| Post-registration destination | `/v2/dashboard` (via OTP at `/v2/auth/verify` → dashboard) |
