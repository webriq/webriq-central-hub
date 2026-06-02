# Task 044 — Zoho Employee Pending Approval Flow

> **Type:** feature
> **Priority:** HIGH
> **Version Impact:** minor
> **Recommended Model:** sonnet
> **Status:** COMPLETED
> **Completed:** 2026-06-02
> **Implementation Notes:** All 7 files implemented. DB migration applied via `supabase db push`. The approveHubUser server action verifies admin role before applying any update. Pending users are blocked at the hub layout level before the sidebar renders. The no-downgrade guard prevents re-login from resetting admin-approved users back to 'pending'.
>
> **Post-implementation fixes:**
> - Added `pm` to the approve form role picker and server action allowlist (was missing from initial implementation)
> - Improved `/auth/pending` page with step-by-step "What happens next?" panel for clearer user guidance
> - Hub Users page switched from `createClient()` to `adminClient` for the user fetch — RLS was filtering out rows for the logged-in admin, causing their own account to not appear
> - Added "(You)" chip next to the current admin's email using `getClaims()` to identify the session user
> - `sync-zoho-role.ts` display_name field order adjusted by linter (`displayName ?? portalUser.full_name` → `portalUser.full_name ?? displayName` preference)

---

## Problem

Zoho users with `role.name = "Employee"` and `portal_profile.name = "Employee"` currently get no role assigned (task 043 returns `null` and skips the update, leaving the DB trigger's default `'pm'` in place). They can then access the full hub dashboard.

The correct behavior: these users land in a **pending** state, see a "thank you / awaiting approval" page, and cannot access the hub until an admin explicitly assigns them a role.

---

## Goal

1. Add `'pending'` as a valid role value at the DB level
2. `syncZohoRole` sets `'pending'` for Employee users and returns the determined role to the caller
3. The auth callback redirects `'pending'` users to `/auth/pending` instead of `/dashboard`
4. A pending page explains the situation (no sidebar, no hub access)
5. The hub layout blocks pending users from entering the hub at all
6. Admins approve pending users from `/admin/hub-users` with a role picker (admin | dev)

---

## Requirements

### Role determination update (sync-zoho-role.ts)

- Employee+Employee → `'pending'`
- **Do not downgrade** already-approved users: if current DB role is `'admin'`, `'pm'`, or `'dev'` and the new determination is `'pending'`, skip the update and return the current role unchanged
- Return the final effective role (`'admin' | 'pm' | 'pending' | null`) so the callback can branch

### Pending page (`/auth/pending`)

No sidebar. No auth guard. Plain centered card:
> **Thank you for signing in using Zoho!**
> The admin will review your account. Once approved, you'll be able to sign in and access the hub.

Keep it minimal — matches the `(auth)` layout pattern.

### Hub layout guard

If `userRole === 'pending'` after fetching hub_users, redirect to `/auth/pending` before rendering the sidebar or children. Prevents direct-navigation bypass.

### Admin Hub Users — approve action

Add to the existing `/admin/hub-users` page:
- Show a **Pending** badge (amber) for `role === 'pending'` rows
- Each pending row gets an **Approve** form (inline `<form>` with server action — no client component needed):
  - `<select name="role">` with options `admin` and `dev`
  - Submit button: "Approve"
- Server action `approveHubUser(formData)` updates `hub_users.role` for the given user ID

Non-pending rows remain read-only (no change to existing display).

### Route access

`isRouteAllowed` currently passes `'pending'` through as truthy (catch-all `return true`). Fix: treat `'pending'` same as `null` — return `false` immediately.

---

## Implementation Steps

### Step 1 — DB migration: `supabase/migrations/020_hub_users_pending_role.sql`

```sql
ALTER TABLE hub_users DROP CONSTRAINT hub_users_role_check;
ALTER TABLE hub_users
  ADD CONSTRAINT hub_users_role_check
  CHECK (role IN ('admin', 'pm', 'dev', 'pending'));
```

### Step 2 — Update `src/app/(auth)/sync-zoho-role.ts`

Changes:
- Return type: `Promise<'admin' | 'pm' | 'pending' | null>`
- Employee+Employee case: `role = 'pending'`
- Before updating: fetch current `hub_users.role` for this user
  - If current role is `'admin' | 'pm' | 'dev'` AND new role is `'pending'` → skip update, return current role
- Always update when new role is `'admin'` or `'pm'`

Updated logic sketch:
```ts
// after determineHubRole():
const effectiveRole = role ?? 'pending';  // Employee case → 'pending', others → null stays null

// fetch current
const { data: existing } = await adminClient
  .from("hub_users").select("role").eq("id", userId).single();
const currentRole = existing?.role ?? null;

const approved = ['admin', 'pm', 'dev'];
if (effectiveRole === 'pending' && currentRole && approved.includes(currentRole)) {
  return currentRole as ReturnType;  // don't downgrade
}

// build updates
const updates: HubUserUpdate = {
  display_name: ...,
  zoho_user_id: ...,
  role: effectiveRole !== null ? effectiveRole : undefined,
};
```

Return the effective role at the end.

### Step 3 — Update `src/app/(auth)/callback/page.tsx`

`syncZohoRole` now returns the role. Use it to branch the redirect:

```ts
const { syncZohoRole } = await import("@/app/(auth)/sync-zoho-role");
const role = await syncZohoRole(userId, email, displayName);

router.push(role === 'pending' ? "/auth/pending" : "/dashboard");
router.refresh();
```

### Step 4 — Create `src/app/(auth)/auth/pending/page.tsx`

Server component. No auth guard (sits inside `(auth)` layout which has no guard).

```tsx
export default function PendingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f5f4f1] px-4">
      <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 shadow-sm p-8 text-center">
        <div className="text-3xl mb-4">🎉</div>
        <h1 className="text-lg font-bold text-slate-900 mb-2">
          Thank you for signing in!
        </h1>
        <p className="text-[13px] text-slate-500 leading-relaxed">
          The admin will review your account. Once approved, you will be able
          to sign in and access the hub.
        </p>
      </div>
    </div>
  );
}
```

> Note: follow the no-emoji rule in CLAUDE.md — use a simple checkmark SVG or remove the emoji. Style with Tailwind only, no `style={{}}`.

### Step 5 — Update `src/app/(hub)/layout.tsx`

After fetching `profile`, add:

```ts
if (profile?.role === 'pending') {
  redirect("/auth/pending");
}
```

Add this before the `return (...)` statement.

### Step 6 — Update `src/app/(hub)/admin/hub-users/page.tsx`

Add `'pending'` to `ROLE_BADGE`:
```ts
pending: "bg-amber-50 text-amber-700 border border-amber-200",
```

Add `approveHubUser` server action at the top of the file:
```ts
"use server";  // NOT at file level — use inline server action inside async function
```

Actually: since the page is a server component, define the server action as an `async function` with `"use server"` directive at the top of its body (inline server action pattern for Next.js App Router):

```ts
async function approveHubUser(formData: FormData) {
  "use server";
  const userId = formData.get("userId") as string;
  const role = formData.get("role") as string;
  if (!userId || !["admin", "dev"].includes(role)) return;
  const { adminClient } = await import("@/lib/supabase/admin");
  await adminClient.from("hub_users").update({ role }).eq("id", userId);
  const { revalidatePath } = await import("next/cache");
  revalidatePath("/admin/hub-users");
}
```

In the table row for pending users, add the approve form after the role badge cell:

```tsx
{user.role === 'pending' && (
  <form action={approveHubUser} className="flex items-center gap-2 mt-1">
    <input type="hidden" name="userId" value={user.id} />
    <select name="role" className="text-[11px] border border-slate-200 rounded px-1.5 py-0.5 text-slate-700">
      <option value="dev">Dev</option>
      <option value="admin">Admin</option>
    </select>
    <button type="submit" className="text-[11px] font-semibold text-white bg-slate-800 hover:bg-slate-900 px-2.5 py-0.5 rounded">
      Approve
    </button>
  </form>
)}
```

Add a 5th column header "Actions" and a corresponding `<td>` in each row.

### Step 7 — Update `src/lib/auth/role-access.ts`

```ts
export function isRouteAllowed(pathname: string, role: string | null): boolean {
  if (!role || role === 'pending') return false;
  // ... rest unchanged
}
```

---

## File Changes

| File | Action | Notes |
|------|--------|-------|
| `supabase/migrations/020_hub_users_pending_role.sql` | CREATE | Add 'pending' to role check constraint |
| `src/app/(auth)/sync-zoho-role.ts` | MODIFY | Return role, handle Employee→pending, no-downgrade guard |
| `src/app/(auth)/callback/page.tsx` | MODIFY | Branch redirect on returned role |
| `src/app/(auth)/auth/pending/page.tsx` | CREATE | Pending approval message page |
| `src/app/(hub)/layout.tsx` | MODIFY | Redirect pending users before rendering |
| `src/app/(hub)/admin/hub-users/page.tsx` | MODIFY | Add Approve form + server action, pending badge |
| `src/lib/auth/role-access.ts` | MODIFY | Block 'pending' role same as null |

---

## Code Context

### current sync-zoho-role.ts (return type is void — must change)

```ts
export async function syncZohoRole(userId, email, displayName): Promise<void>
```

### current callback/page.tsx — redirect section (from task 043)

```ts
const { syncZohoRole } = await import("@/app/(auth)/sync-zoho-role");
await syncZohoRole(userId, email, displayName);
router.push("/dashboard");
router.refresh();
```

### hub layout — profile fetch section (layout.tsx:20–33)

```ts
if (userId) {
  const { data: profile } = await supabase
    .from("hub_users")
    .select("email, role, display_name, zoho_user_id")
    .eq("id", userId)
    .single();

  if (profile) {
    userEmail = profile.email;
    userRole = profile.role;
    // ...
  }
}
// ADD HERE: if (userRole === 'pending') redirect("/auth/pending");
return (...)
```

### role-access.ts full current content

```ts
const ROLE_RULES: { prefix: string; allowed: string[] }[] = [
  { prefix: "/dashboard/customers",  allowed: ["pm", "admin"] },
  ...
  { prefix: "/admin",                allowed: ["admin"] },
];

export function isRouteAllowed(pathname: string, role: string | null): boolean {
  if (!role) return false;        // ← add `|| role === 'pending'`
  for (const rule of ROLE_RULES) { ... }
  return true;
}
```

### hub-users page — ROLE_BADGE (line 5–10)

```ts
const ROLE_BADGE: Record<string, string> = {
  admin:     "bg-red-50 text-red-700 border border-red-200",
  pm:        "bg-blue-50 text-blue-700 border border-blue-200",
  developer: "bg-green-50 text-green-700 border border-green-200",
  client:    "bg-slate-50 text-slate-600 border border-slate-200",
  // ADD: pending: "bg-amber-50 text-amber-700 border border-amber-200",
};
```

---

## Notes for Implementation Agent

- **Model rationale:** Auth/role security logic + DB migration + multi-file change spanning auth, hub layout, and admin UI.
- **No client components needed** — the approve form uses an inline server action (`"use server"` inside the function body), which is the correct pattern for server component pages in Next.js App Router.
- The pending page is in `(auth)/auth/pending/page.tsx` — follows the pattern of `(auth)/auth/login/page.tsx`.
- Do NOT add emoji to the pending page (CLAUDE.md: no emojis) — use text only or a simple inline SVG icon.
- `requireRole` (require-role.ts) does NOT need to change — the hub layout catches pending before requireRole is ever called for page routes. requireRole is only called explicitly inside specific pages.
- Run `npx tsc --noEmit` after implementation.
- The DB migration must be applied manually by the user (`supabase db push` or pasting into Supabase SQL editor).
