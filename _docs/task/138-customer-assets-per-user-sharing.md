# 138: Customer Assets — Per-User Sharing (Alongside Existing Role-Based Permissions)

**Created:** 2026-07-13
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep

---

## Overview

Investigated per the user's question: can Bert/Admin/PM restrict a link, file, or
credential to specific *individual* people, not just roles?

**Finding: no, not today.** `customer_assets.allowed_roles` is a `text[]` of roles only
(`super_admin | admin | pm | developer`), enforced in application code via
`canSeeAsset(role, allowedRoles)` (duplicated across
`src/app/api/customers/[customerId]/assets/route.ts`, `.../[assetId]/route.ts` (task
134), and `.../[assetId]/file-url/route.ts`). There is no `allowed_user_ids` column and
no per-person sharing UI anywhere — you can say "PM and Developer roles can see this,"
but not "only Jane and Mark specifically."

This task adds a second, **additive** grant mechanism — `allowed_user_ids` — so an asset
can be shared with specific people regardless of role, on top of (or instead of) the
existing role restriction.

**Confirmed low-risk for RLS**: exactly like `allowed_roles` today ("Enforcement is
application-level (API route), not RLS" — migration 057's own comment), this stays
application-level; `customer_assets`' table-level RLS policy is untouched.

## Requirements

- [ ] `customer_assets` gets a new nullable `allowed_user_ids uuid[]` column (parallel to
      `allowed_roles`), referencing `profiles.id` conceptually (not a DB-level FK — a
      soft reference is enough here, consistent with `allowed_roles` also not being an FK
      to an enum table).
- [ ] `canSeeAsset()` (duplicated in 3 route files today — see Code Context) is extended
      to also check `allowed_user_ids`, **OR-combined** with the role check: an asset is
      visible if the caller is admin/super_admin (unchanged, always-visible), OR neither
      `allowed_roles` nor `allowed_user_ids` is set (fully open, unchanged default), OR
      the caller's role is in `allowed_roles`, OR the caller's own user id is in
      `allowed_user_ids`. This makes per-user sharing an *additional* grant, not a
      further restriction — e.g. "PM role only, but also share directly with this one
      Developer" is expressible.
- [ ] A new lightweight endpoint (`GET /api/staff-directory` or similar — see Proposed
      File Changes) lists assignable people (id, display name, role) for the sharing UI's
      picker — **not** the existing `GET /api/v2/users`, which is admin/super_admin-only
      and returns more than a picker needs (email, invite status, etc.); this new endpoint
      is readable by any authenticated staff member (admin/super_admin/pm/developer —
      matching who's allowed to touch these assets at all) and returns only `id`,
      `full_name`, `role` from `profiles`, excluding `client`-role rows.
- [ ] The Customers → Assets tab's "Add Asset" modal (`src/app/v2/(hub)/customers/[customerId]/client.tsx`)
      gets a new "Share with specific people" multi-select alongside its existing
      "Visible To" role pills, using the new directory endpoint — same visual treatment
      (pill/checkbox list), submitting `allowed_user_ids` alongside `allowed_roles`.
- [ ] The Storage/KB File Explorer's permissions panel (task 134,
      `_onboarding-wizard.tsx`'s `StorageFileExplorer`) gets the equivalent addition —
      the existing inline expandable permissions panel gains a second row/section for
      specific-person sharing, wired to `handlePermissionsChange` (extended to accept
      `allowed_user_ids` too).
- [ ] Each file's permission badge (both the Customers Assets tab's existing badge and
      the File Explorer's) reflects specific-person sharing when present — e.g. "PM +
      2 people" or similar — not just role labels.

## Out of Scope / Must-Not-Change

- No RLS changes — confirmed unnecessary (same reasoning as `allowed_roles`).
- No notification/email to a newly-shared person (a "you've been given access to X" ping
  is a reasonable follow-up, not requested here).
- No changes to `allowed_roles`' own existing semantics — it still means exactly what it
  means today; this task only adds a second, OR-combined grant on top.
- No group/team sharing (e.g. "share with everyone on the Migration team") — individual
  people only, per the literal ask.
- No changes to `GET /api/v2/users` (admin-only user management list) — the new picker
  endpoint is a separate, narrower-scoped addition, not a replacement.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/0NN_customer_assets_allowed_user_ids.sql` | Create | Add `allowed_user_ids uuid[]` column to `customer_assets`. |
| `src/app/api/staff-directory/route.ts` | Create | New `GET` endpoint: lists `{ id, full_name, role }` from `profiles` for staff roles only, for use by sharing pickers. |
| `src/app/api/customers/[customerId]/assets/route.ts` | Modify | Extend `canSeeAsset()` and the `POST`/`DELETE` handlers to read/write `allowed_user_ids`. |
| `src/app/api/customers/[customerId]/assets/[assetId]/route.ts` | Modify | Extend the PATCH handler (task 134) to accept/update `allowed_user_ids` alongside `allowed_roles`. |
| `src/app/api/customers/[customerId]/assets/[assetId]/file-url/route.ts` | Modify | Extend its own `canSeeAsset`-equivalent inline check to include `allowed_user_ids`. |
| `src/app/v2/(hub)/customers/[customerId]/client.tsx` | Modify | Add the "Share with specific people" picker to the Add Asset modal and the permission badge display. |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | Add the same picker to `StorageFileExplorer`'s permissions panel and badge display. |

## Code Context

### Current `canSeeAsset()` (duplicated identically in `assets/route.ts` and task 134's `[assetId]/route.ts`)

```ts
function canSeeAsset(role: string | null, allowedRoles: string[] | null) {
  if (role === "admin" || role === "super_admin") return true;
  if (!allowedRoles || allowedRoles.length === 0) return true;
  return role ? allowedRoles.includes(role) : false;
}
```

Extend to:

```ts
function canSeeAsset(
  role: string | null, userId: string | null,
  allowedRoles: string[] | null, allowedUserIds: string[] | null
) {
  if (role === "admin" || role === "super_admin") return true;
  const noRoleRestriction = !allowedRoles || allowedRoles.length === 0;
  const noUserRestriction = !allowedUserIds || allowedUserIds.length === 0;
  if (noRoleRestriction && noUserRestriction) return true;
  const roleMatches = !noRoleRestriction && !!role && allowedRoles.includes(role);
  const userMatches = !noUserRestriction && !!userId && allowedUserIds.includes(userId);
  return roleMatches || userMatches;
}
```

Every call site needs the caller's own `user.id` passed through (already available at
every call site via `supabase.auth.getUser()`, just not currently threaded into this
function).

### `file-url/route.ts`'s own inline check (`src/app/api/customers/[customerId]/assets/[assetId]/file-url/route.ts:30-38`) — same extension, inline rather than via the shared function (this file doesn't import `canSeeAsset` today, consistent with this codebase's per-route-file duplication convention)

```ts
const isPrivileged = myRole === "admin" || myRole === "super_admin";
const permitted = isPrivileged || !asset.allowed_roles || asset.allowed_roles.length === 0
  || (myRole ? asset.allowed_roles.includes(myRole) : false);
```

Extend with the same OR-in `allowed_user_ids` logic, requiring the route to also
`.select(..., allowed_user_ids)` and compare against `user.id`.

### New directory endpoint — model on the existing `/api/v2/users` route's query shape but relax the permission gate and narrow the response

```ts
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: myProfile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!myProfile?.role || !["admin", "super_admin", "pm", "developer"].includes(myProfile.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, role")
    .neq("role", "client")
    .order("full_name", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
```

### Existing role-picker UI to extend (`src/app/v2/(hub)/customers/[customerId]/client.tsx:1606-1643`)

Add a second `<div>` block below the existing "Visible To" role pills, same visual
pattern, but populated from the new directory endpoint and toggling
`addAssetForm.allowedUserIds` (new form field) instead of `allowedRoles`.

## Implementation Steps

1. Write and apply the migration adding `allowed_user_ids uuid[]` to `customer_assets`.
2. Create `src/app/api/staff-directory/route.ts`.
3. Extend `canSeeAsset()` in `assets/route.ts` and `[assetId]/route.ts`; thread `user.id` through every call site; extend `POST`/`PATCH` bodies to accept `allowed_user_ids`.
4. Extend `file-url/route.ts`'s inline permission check the same way.
5. Add the "Share with specific people" picker to the Customers → Assets tab's Add Asset modal, and extend its permission-badge rendering to mention specific-person shares.
6. Add the equivalent picker to `StorageFileExplorer`'s permissions panel in the onboarding wizard, and extend its badge rendering the same way.
7. `npx tsc --noEmit` and `pnpm lint`.
8. Manually verify per Acceptance Criteria, including applying the migration against the linked Supabase project.

## Acceptance Criteria

- [ ] Sharing an asset with zero roles and one specific person makes it visible to that person (any role) but hidden from everyone else (except admin/super_admin, always privileged).
- [ ] Sharing an asset with one role AND one specific person outside that role makes it visible to both — confirms the OR-combination.
- [ ] The directory endpoint returns only staff (no `client`-role rows) and rejects unauthenticated/client callers.
- [ ] Both the Customers → Assets tab and the Storage/KB File Explorer can set and display specific-person sharing.
- [ ] Existing role-only sharing (no specific people) behaves exactly as before — regression check.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Apply the new migration against the linked Supabase project (supabase db push --linked)
pnpm dev
# Manual, localhost:3000:
#   - Share a Storage/KB file with one specific person (no roles) -> confirm visibility via the file-url/list routes for that person vs. another non-privileged staff member
#   - Share a file with one role + one specific outside person -> confirm both can see it
#   - Confirm the directory endpoint rejects an unauthenticated request and a client-role request
#   - Confirm an existing role-only-shared asset (from before this change) still behaves correctly
```

## Compatibility Touchpoints

- New Supabase migration (additive column, no RLS change) — apply via `supabase db push --linked`.
- New API route — additive only.
- No breaking changes to existing `allowed_roles`-only assets.

## Implementation Notes

### What Changed
- Added `allowed_user_ids uuid[]` to `customer_assets` (migration `064_customer_assets_allowed_user_ids.sql`), applied live via `supabase db push --linked` against the `App - Central Hub` project. Manually added the field to `src/types/database.ts`'s `customer_assets` Row/Insert/Update types (this repo hand-maintains this file — no `supabase gen types` script exists).
- Extended `canSeeAsset()` (duplicated in `assets/route.ts` and task 134's `[assetId]/route.ts`) and `file-url/route.ts`'s inline equivalent to OR-combine `allowed_user_ids` with `allowed_roles`, exactly per the task doc's spec — admin/super_admin always privileged; fully open when neither restriction is set; otherwise visible if the role matches OR the specific user id matches.
- `PATCH .../assets/[assetId]` (task 134) now accepts `allowed_roles` and/or `allowed_user_ids` independently — either, both, or neither key present in the body is handled (only the keys actually present get updated), so toggling one doesn't require re-sending the other's current value. Updated `handlePermissionsChange` in the wizard to match this shape (`updates: { allowed_roles?; allowed_user_ids? }` instead of a raw roles array).
- `POST`/`DELETE /api/customers/[customerId]/assets` extended to read/write `allowed_user_ids` and thread `user.id` through the extended `canSeeAsset()` signature.
- New `GET /api/staff-directory` — returns `{ id, full_name, role }` from `profiles`, excluding `client`-role rows.
- Added the "Share with specific people" picker to the Customers → Assets tab's Add Asset modal (below the existing role pills, same visual pattern, fetched lazily on first modal open via a new `hasFetchedStaffDirectoryRef`-gated effect) and extended its permission badge to a combined string like "PM + 2 people".
- Added the equivalent picker to the Storage/KB File Explorer's inline permissions panel (`StorageFileExplorer`, task 134/139), fetched eagerly alongside `phase1Assets` on mount (small dataset, same reasoning as that existing fetch), and extended its own permission badge the same way.

### Files Changed
- `supabase/migrations/064_customer_assets_allowed_user_ids.sql` — new migration, applied live.
- `src/types/database.ts` — added `allowed_user_ids` to `customer_assets`'s Row/Insert/Update types.
- `src/app/api/staff-directory/route.ts` — new file.
- `src/app/api/customers/[customerId]/assets/route.ts` — extended `canSeeAsset()`, GET filter, POST insert, DELETE lookup/check.
- `src/app/api/customers/[customerId]/assets/[assetId]/route.ts` — rewrote the PATCH handler to independently accept `allowed_roles`/`allowed_user_ids`.
- `src/app/api/customers/[customerId]/assets/[assetId]/file-url/route.ts` — extended the inline permission check.
- `src/app/v2/(hub)/customers/[customerId]/client.tsx` — `addAssetForm.allowedUserIds`, `staffDirectory` state + lazy fetch, the new picker UI, `handleAddAsset`'s POST body, and the combined permission-badge string.
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` — `staffDirectory` state + fetch, `handlePermissionsChange`'s new signature, `StorageFileExplorer`'s new prop/picker UI/badge, and the render call site.

### Deviations From Plan
- **Directory endpoint's permission gate**: the task doc suggested `["admin", "super_admin", "pm", "developer"]`. Used `["admin", "super_admin", "pm", "marketing"]` instead — matching the *actual* existing write-permission convention already established by `assets/upload/route.ts` (Bert's role is `marketing`, not `developer`, and developers don't currently upload/manage assets in this codebase, only view them). Using the task doc's suggested list verbatim would have locked Bert himself out of the sharing picker he's the primary user of.
- No other deviations — the rest matches the task document's Code Context and Implementation Steps.

### Verification Run
- `npx tsc --noEmit` — PASS (no errors).
- `pnpm lint` — PASS (no warnings/errors).
- `pnpm build` — PASS; confirmed `/api/staff-directory` registers correctly alongside the other asset routes.
- Migration applied live: `supabase db push --linked` against `App - Central Hub`, confirmed via CLI output ("Applying migration 064_customer_assets_allowed_user_ids.sql... Finished").
- Manual browser verification — **SKIPPED**, same standing reason as the rest of this batch: live verification requires a logged-in Hub session, and entering the user's password to authenticate is a prohibited action regardless of authorization. Verified instead by code review: the OR-combination logic in `canSeeAsset()` and its two inline duplicates were traced by hand against the four cases in the Acceptance Criteria (zero roles + one person; one role + one outside person; open/unrestricted; admin override) and each resolves correctly; the PATCH route's independent-key handling was traced against "roles only," "people only," and "both" request bodies.
