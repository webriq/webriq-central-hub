# 099: Fix Super Admin 403 on Admin API Routes

**Created:** 2026-07-01
**Priority:** HIGH
**Type:** bugfix
**Recommended Model:** haiku
**Status:** TESTING
**Completed:** 2026-07-01
**Implementation Notes:** All 22 route files patched. Zoho-export/import routes: `!== "admin"` → `!== "admin" && !== "super_admin"`. Force-logout + 3 classification routes: switched from `hub_users.role` to `profiles.role` (canonical lowercase enum) and expanded guards. TypeScript check clean.

> **Investigation:** /understand ran before this spec. Findings embedded below.

---

## Overview

A user with `super_admin` role in the `profiles` table receives 403 Forbidden when hitting admin-gated API routes. The v2 sidebar correctly shows admin nav items for `super_admin`, so the user can navigate to those pages — but the underlying routes reject them.

Root cause: every route written before `super_admin` was added to the role enum performs a strict `!== "admin"` check. Only one PATCH route (`/api/v2/users/[userId]`) was ever updated to include `super_admin`. All others missed the backfill.

---

## Requirements

- [ ] `super_admin` must pass all admin role guards across API routes (same access as `admin`)
- [ ] The `super_admin`-only guard in `PATCH /api/v2/users/[userId]` (line 55) **must NOT change** — only a `super_admin` can assign the `super_admin` role
- [ ] The force-logout route and classification routes must be switched from `hub_users.role` to `profiles.role` (canonical, lowercase enum; hub_users stores title-case display strings which are unreliable for auth guards)
- [ ] No shared helper — inline replacements only

---

## Out of Scope / Must-Not-Change

- `src/app/api/v2/users/[userId]/route.ts` line 55 — the `super_admin`-only guard (`if (body.role === "super_admin" && callerRole !== "super_admin")`) — this is intentional and correct
- Supabase RLS policies — not investigated, out of scope
- Old `(hub)` layout routes — only v2 and sprint-era API routes are in scope
- Any route not listed in the File Changes table below

---

## Proposed File Changes

| File | Action | Fix |
|------|--------|-----|
| `src/app/api/v2/users/route.ts` | Modify | Add `super_admin` to GET guard (line 15) |
| `src/app/api/admin/hub-users/[userId]/invite/route.ts` | Modify | Add `super_admin` to POST guard (line 22) |
| `src/app/api/auth/force-logout/route.ts` | Modify | Switch from `hub_users.role` to `profiles.role`; allow `admin` + `super_admin` |
| `src/app/api/admin/zoho-export/attachment-meta/route.ts` | Modify | Add `super_admin` to guard |
| `src/app/api/admin/zoho-export/comments/route.ts` | Modify | Add `super_admin` to guard |
| `src/app/api/admin/zoho-export/milestones/route.ts` | Modify | Add `super_admin` to guard |
| `src/app/api/admin/zoho-export/tasklists/route.ts` | Modify | Add `super_admin` to guard |
| `src/app/api/admin/zoho-export/tasks/route.ts` | Modify | Add `super_admin` to guard |
| `src/app/api/admin/zoho-export/timelogs/route.ts` | Modify | Add `super_admin` to guard |
| `src/app/api/admin/zoho-export/users/route.ts` | Modify | Add `super_admin` to guard |
| `src/app/api/admin/zoho-import/attachments/route.ts` | Modify | Add `super_admin` to guard |
| `src/app/api/admin/zoho-import/comments/route.ts` | Modify | Add `super_admin` to guard |
| `src/app/api/admin/zoho-import/customers/route.ts` | Modify | Add `super_admin` to guard |
| `src/app/api/admin/zoho-import/milestones/route.ts` | Modify | Add `super_admin` to guard |
| `src/app/api/admin/zoho-import/projects/route.ts` | Modify | Add `super_admin` to guard |
| `src/app/api/admin/zoho-import/tasklists/route.ts` | Modify | Add `super_admin` to guard |
| `src/app/api/admin/zoho-import/tasks/route.ts` | Modify | Add `super_admin` to guard |
| `src/app/api/admin/zoho-import/timelogs/route.ts` | Modify | Add `super_admin` to guard |
| `src/app/api/admin/zoho-import/users/route.ts` | Modify | Add `super_admin` to guard |
| `src/app/api/classification/route.ts` | Modify | Switch from `hub_users.role` to `profiles.role`; allow `pm`, `admin`, `super_admin` |
| `src/app/api/classification/classify/route.ts` | Modify | Same as above |
| `src/app/api/classification/[id]/assign/route.ts` | Modify | Same as above |
| `src/app/api/classification/[id]/route.ts` | Modify | Check for role guard; if present, same fix as other classification routes |

---

## Code Context

### The broken pattern (most routes — 19 files)

```ts
// src/app/api/v2/users/route.ts:15  ← representative example
const { data: callerProfile } = await adminClient
  .from("profiles")
  .select("role")
  .eq("id", user.id)
  .single();
if (callerProfile?.role !== "admin") {          // ← super_admin fails here
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

### The correct pattern (reference — already correct in one route)

```ts
// src/app/api/v2/users/[userId]/route.ts:44-47  ← model to follow
const callerRole = callerProfile?.role;
if (callerRole !== "admin" && callerRole !== "super_admin") {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

### The guard that must NOT change (same file, line 55)

```ts
// src/app/api/v2/users/[userId]/route.ts:55  ← DO NOT TOUCH
if (body.role === "super_admin" && callerRole !== "super_admin") {
  return NextResponse.json({ error: "Only a Super Admin can assign the Super Admin role." }, { status: 403 });
}
```

### Force-logout — uses hub_users (must switch to profiles)

```ts
// src/app/api/auth/force-logout/route.ts:28-38  ← current code; switch table + add super_admin
const { data: profile } = await supabase
  .from("hub_users")
  .select("role")
  .eq("id", callerUserId)
  .single();
if (!profile || profile.role !== "admin") {
  return NextResponse.json({ error: "Forbidden — admin role required" }, { status: 403 });
}
```

Fix: replace the `hub_users` query with `profiles` via `adminClient`, and change the guard:
```ts
const { data: profile } = await adminClient
  .from("profiles")
  .select("role")
  .eq("id", callerUserId)
  .single();
if (!profile || (profile.role !== "admin" && profile.role !== "super_admin")) {
  return NextResponse.json({ error: "Forbidden — admin role required" }, { status: 403 });
}
```

### Classification routes — use hub_users with lowercase check (must switch to profiles)

```ts
// src/app/api/classification/route.ts:34-41  ← current code
const { data: caller } = await adminClient
  .from("hub_users")
  .select("role")
  .eq("id", user.id)
  .single();
if (!["pm", "admin"].includes(caller?.role ?? "")) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

Fix: switch to `profiles` table (already imported via `adminClient`) and expand the allowlist:
```ts
const { data: caller } = await adminClient
  .from("profiles")
  .select("role")
  .eq("id", user.id)
  .single();
if (!["pm", "admin", "super_admin"].includes(caller?.role ?? "")) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

Note: `adminClient` is already imported in all classification routes — no new import needed.

---

## Implementation Steps

1. **Fix `src/app/api/v2/users/route.ts`** — change the GET guard at line 15 to match the reference pattern: `callerProfile?.role !== "admin" && callerProfile?.role !== "super_admin"`

2. **Fix `src/app/api/admin/hub-users/[userId]/invite/route.ts`** — same change at line 22

3. **Fix `src/app/api/auth/force-logout/route.ts`** — replace `hub_users` query with `profiles` via `adminClient`; change guard to allow `admin` and `super_admin`

4. **Fix all 16 zoho-export/import routes** — each has `profile?.role !== "admin"` or `profile?.role !== "admin"` from a `profiles` query. Change to `profile?.role !== "admin" && profile?.role !== "super_admin"`. Files: `zoho-export/{attachment-meta,comments,milestones,tasklists,tasks,timelogs,users}` and `zoho-import/{attachments,comments,customers,milestones,projects,tasklists,tasks,timelogs,users}`

5. **Fix 3-4 classification routes** — switch from `hub_users.role` to `profiles.role` (via `adminClient`); change allowlist to `["pm", "admin", "super_admin"]`. Read `classification/[id]/route.ts` first to confirm whether it has a role guard before modifying.

6. **TypeScript check** — run `npx tsc --noEmit` to confirm no type errors

---

## Acceptance Criteria

- [ ] Logged in as `super_admin`: GET `/api/v2/users` returns user list (no 403)
- [ ] Logged in as `super_admin`: POST invite on hub-users returns success (no 403)
- [ ] Logged in as `super_admin`: force-logout endpoint returns success (no 403)
- [ ] Logged in as `super_admin`: zoho-export and zoho-import routes return data (no 403)
- [ ] Logged in as `super_admin`: classification routes return data (no 403)
- [ ] Logged in as `admin` (not super_admin): all the above still work (regression check)
- [ ] Logged in as `pm`: classification routes still work; admin-only routes still return 403
- [ ] Attempting to assign `super_admin` role as an `admin` (not `super_admin`): still returns 403

---

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual: sign in as a `super_admin` user and verify the Admin section of the v2 hub loads without 403 errors in the network tab.

---

## Compatibility Touchpoints

- No schema changes
- No client component changes
- No new imports — all files already import `adminClient` where needed
- The `profiles.role` enum includes `super_admin` (confirmed in `src/types/database.ts:500`)
