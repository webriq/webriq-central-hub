# 366: Department-Based Access Control for Hub Users

**Created:** 2026-09-15
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

Every internal Hub user (`profiles` row) currently gets their dashboard access from `role` alone (`admin | super_admin | hr | pm | developer | client`, per `role-access` conventions — see CLAUDE.md). This task adds a second, independent dimension, **Department**, which can *further narrow* what a subset of departments are allowed to see — regardless of role. The concrete example that drove this: an **Admin** whose department is **Finance** should only ever see the **Orders** tab (StackShift Orders), read-only, even though "Admin" would otherwise see everything.

Department is managed in **HR > Users** (`/dashboard/users`) via a new per-row "Department" action, separate from the existing Role select, and is a **required** field on the "Invite" flow (task 365's `_invite-user-modal.tsx`) — where it must be picked **before** Role, since the department picked determines which roles are even offered.

### Design decisions made during planning (fully clarified with the user — recorded here so the rationale survives)

**1. Department ↔ Role compatibility matrix.** Not every role can hold every department. Confirmed matrix (roles named are the `ValidRole` vocabulary from `src/lib/auth/hub-role-map.ts` — `"other"` is excluded here exactly as task 365 excluded it from the invite dropdown, since it's a legacy-import-only bucket with no equivalent for a fresh assignment; the `"marketing"` profile role is excluded too — it exists in the `profiles.role` DB enum but has no path through this UI at all today (`VALID_ROLES`/`ROLE_OPTIONS` never included it), a pre-existing gap this task doesn't need to fix):

| Department | Allowed roles |
|---|---|
| Business Team | Super Admin, Admin, Developer, Client |
| Enterprise Team | Super Admin, Admin, Developer, Client |
| HR | HR, Super Admin, Admin |
| Project Management | PM |
| Finance | Super Admin, Admin |

This applies **bidirectionally**: assigning a department checks the user's current role against that department's allowed-roles list, and changing a user's role checks their current department (if any) the same way. Either direction rejects an incompatible combination with a clear error — it does not silently reset the other field.

**2. Department → visible-tabs restriction.** Only two departments actually narrow the nav; the other three leave the role-based sidebar exactly as it is today:

| Department | Restriction |
|---|---|
| Business Team | None — same as current role-based access |
| Enterprise Team | None — same as current role-based access |
| Project Management | None — same as current role-based access |
| **HR** | Only **Dashboard** (home) + **HR** (`/dashboard/users`) + **Wiki** (`/kb`) |
| **Finance** | Only **Dashboard** (home) + **Orders** (`/stackshift-orders`) — and **read-only**: view the list and view an order's detail page, but no Convert-to-customer/project, no Dismiss/Reopen |

This is deliberately keyed off **department**, not role — so if the compatibility matrix above is ever loosened later (e.g. a Developer allowed into HR), the narrowing still applies correctly without new code. In practice today it only ever bites Admin/Super Admin/HR-role users, since those are the only roles the matrix allows into HR or Finance.

**3. Enforcement level.** Sidebar-hide + page-level redirect (an actual navigation boundary, not just a hidden button) — consistent with how every other role gate in this codebase already works (each page does its own inline role check + `redirect()`, e.g. `stackshift-orders/page.tsx:24`; there is no central middleware — `src/lib/auth/role-access.ts` + `require-role.ts` are dead code, only imported by the retired `_hub_(OLD)` tree, confirmed by grep). Underlying API routes for the newly-hidden areas (Customers, Projects, Desk, Orchestration, Time Logs, Settings, HR/Users) are **not** modified to re-check department — matching the existing precedent that a role-gated page's own API routes don't redundantly re-check role either. The one exception is Finance's explicit "no action" requirement below, which is a hard requirement, not just a hidden button.

**4. Finance is read-only, enforced at the API layer too.** Because the request explicitly said "no action like edit or delete or create customer & project" for Finance, hiding the Convert/Dismiss/Reopen buttons is not enough — a Finance-department Admin could otherwise call those API routes directly. `POST /api/stackshift-orders/[orderId]/convert` and `PATCH /api/stackshift-orders/[orderId]` (dismiss/reopen) get an explicit department check. `GET /api/stackshift-orders/[orderId]/file` (downloading the Proposal/FlowForge doc) stays allowed — that's part of "viewing details," not an action.

**5. Unassigned (`department_id IS NULL`) users are unrestricted** beyond their existing role-based access, until HR explicitly assigns a department. This avoids locking out any existing admin/super_admin the moment this ships.

**6. Invite-flow role options can differ from the edit-time matrix for one department.** At invite time, picking **Finance** only offers **Admin** in the role dropdown (not Super Admin) — Super Admin is still a valid Finance-department role and can be set later via the HR > Users edit action, it's just not offered at invite time. Every other department's invite-time role options match the compatibility matrix above exactly.

## Requirements

- [ ] New `departments` lookup table, seeded with exactly: Business Team, Enterprise Team, HR, Project Management, Finance.
- [ ] `profiles.department_id` nullable FK → `departments.id`.
- [ ] HR > Users (`/dashboard/users`) shows each user's current Department and a dedicated action to change it — separate control from the existing Role `<select>`.
- [ ] Changing Department or Role is cross-validated against the compatibility matrix above; an incompatible combination is rejected with a clear inline error and neither field changes.
- [ ] The Invite modal (task 365) gains a required **Department** field, asked **before** Role; the Role dropdown is disabled/empty until a department is chosen, then offers only that department's allowed invite-time roles.
- [ ] Submitting the invite form sets `profiles.department_id` on the newly created user, alongside the existing role/hub_users wiring.
- [ ] HR-department users see only Dashboard, HR (Users), and Wiki in the sidebar; navigating directly to any other Hub URL redirects to `/dashboard`.
- [ ] Finance-department users see only Dashboard and Orders in the sidebar; navigating directly to any other Hub URL redirects to `/dashboard`.
- [ ] On the Orders detail page, a Finance-department viewer sees no Convert, Dismiss, or Reopen controls — view-only.
- [ ] `POST .../convert` and `PATCH /api/stackshift-orders/[orderId]` (dismiss/reopen) reject a Finance-department caller with 403, regardless of role.
- [ ] Business Team, Enterprise Team, and Project Management departments make no change to what a user can already see based on role.
- [ ] A user with no department assigned (`NULL`) is unaffected — sees exactly what their role already allows, no new redirects.

## Out of Scope / Must-Not-Change

- Do not touch `src/lib/auth/role-access.ts` / `require-role.ts` — confirmed dead code (only the retired `_hub_(OLD)` tree imports them); do not resurrect or "fix" them as part of this task.
- Do not add department-level checks to any API route **other than** the two Orders mutation routes named above (convert, PATCH dismiss/reopen). Customers/Projects/Desk/Orchestration/Time Logs/Settings/HR-Users API routes are unchanged — the page-level redirect is the only new boundary for those.
- Do not add `"marketing"` to `VALID_ROLES`/`ROLE_OPTIONS` — it stays unreachable through this UI, exactly as it is today (pre-existing gap, not this task's to fix).
- Do not change the legacy `(hub)/admin/hub-users/page.tsx`, the `inviteUser()` server action, or anything under `_hub_(OLD)`.
- Do not change `/auth/register`, `/auth/login`, or any other auth page.
- Do not change the existing per-row Role select, status toggle, unlock, or Send Invite/Resend behavior on `/dashboard/users` beyond adding the new Department control alongside them.
- No new npm/pnpm dependency.
- Migration is **written, not applied** by the agent (this repo's established convention — see e.g. migrations 127, 130, 133–136) — the user applies it via Supabase themselves; degrade gracefully is not required here since this is new, additive schema with no existing code path depending on it yet.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/139_departments.sql` | Create | `departments` table + seed 5 rows + `profiles.department_id` FK column + RLS (open `select` for `authenticated`, no client-writable policies). |
| `src/lib/auth/department-map.ts` | Create | `DEPARTMENTS`, `DepartmentName`, `DEPARTMENT_ROLES`, `DEPARTMENT_INVITE_ROLES`, `DEPARTMENT_NAV_RESTRICTION`, `isPathAllowedForDepartment()`. Single source of truth, mirrors how `hub-role-map.ts` centralizes role vocabulary. |
| `src/app/api/departments/route.ts` | Create | `GET` — admin/super_admin only, returns `{ departments: {id, name}[] }` for the invite modal + HR > Users department select. |
| `src/app/api/admin/hub-users/invite/route.ts` | Modify | Require `departmentId` in the body; resolve its name; validate `role` against `DEPARTMENT_INVITE_ROLES[name]`; set `profiles.department_id` alongside the existing role write; include `department_id`/`department_name` in the response `user` object. |
| `src/app/api/v2/users/[userId]/route.ts` | Modify | Accept `department_id?: string \| null`; cross-validate against `DEPARTMENT_ROLES` both when `role` changes (check existing department) and when `department_id` changes (check existing role). |
| `src/app/api/v2/users/route.ts` | Modify | Extend the `profiles` select + merge to include `department_id` and the joined department `name`. |
| `src/app/(hub)/dashboard/users/_user-row.tsx` | Create | Extracted from `page.tsx` (`UserRow` + its private helpers: `getSelectValue`, `getInitials`, `formatDate`, `avatarColor`, `AVATAR_COLORS`, `ROLE_BADGE`) — needed to keep `page.tsx` within `nextjs-file-length-best-practices.md` guidance once the Department column/control is added. Gains the new Department cell + select. |
| `src/app/(hub)/dashboard/users/page.tsx` | Modify | Import `UserRow` from the new file instead of defining it inline; fetch `/api/departments` alongside `/api/v2/users`; add `handleDepartmentChange`; extend `HubUser` type with `department_id`/`department_name`. |
| `src/app/(hub)/dashboard/users/_invite-user-modal.tsx` | Modify | Add required Department field (rendered first), fetched from `/api/departments`; Role options filtered by the chosen department via `DEPARTMENT_INVITE_ROLES`; reset Role if it becomes invalid when Department changes. |
| `src/app/(hub)/layout.tsx` | Modify | Resolve `pathname` once (already reads it for the login-redirect case); also select `department_id` + joined department name for the signed-in user; `redirect(V2_ROUTES.DASHBOARD)` when `!isPathAllowedForDepartment(pathname, departmentName)`; pass `departmentName` down to `V2HubShell`. |
| `src/app/(hub)/_components/v2-hub-shell.tsx` | Modify | Accept + forward `departmentName: string \| null` prop to `V2HubSidebar`. |
| `src/app/(hub)/_components/v2-hub-sidebar.tsx` | Modify | `getNavGroups(role, departmentName)` — filter each group's items through `isPathAllowedForDepartment(item.href, departmentName)` after building them as today; drop any group left empty. |
| `src/app/(hub)/stackshift-orders/page.tsx` | Modify | Also select department; compute `readOnly = departmentName === "Finance"`; pass to `OrdersTable` (or just to the page's own rendering — list has no mutating actions today, so this is mainly for consistency/future-proofing). |
| `src/app/(hub)/stackshift-orders/[orderId]/page.tsx` | Modify | Same department lookup; pass `readOnly` to `OrderReview`. |
| `src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx` | Modify | Accept `readOnly?: boolean`; hide Dismiss/Reopen controls and don't render `_convert-panel.tsx`'s action button when true. |
| `src/app/(hub)/stackshift-orders/[orderId]/_components/_convert-panel.tsx` | Modify | Accept `readOnly?: boolean`; render nothing actionable (or a plain "read-only" notice) when true. |
| `src/app/api/stackshift-orders/_auth.ts` | Modify | `requireOrderReviewer()` also returns `departmentName`; add `requireOrderMutator()` = same guard + 403 if `departmentName === "Finance"`. |
| `src/app/api/stackshift-orders/[orderId]/convert/route.ts` | Modify | Use `requireOrderMutator()` instead of `requireOrderReviewer()`. |
| `src/app/api/stackshift-orders/[orderId]/route.ts` | Modify | `PATCH` (dismiss/reopen) uses `requireOrderMutator()` instead of `requireOrderReviewer()`. |
| `src/types/database.ts` | Modify | Add `departments` table Row/Insert/Update + `Relationships[]`; add `department_id` to `profiles` Row/Insert/Update. |

## Code Context

### `src/lib/auth/hub-role-map.ts` (existing — the vocabulary this task builds on top of, unchanged)

```ts
export const VALID_ROLES = ["admin", "super_admin", "hr", "pm", "developer", "client", "other"] as const;
export type ValidRole = (typeof VALID_ROLES)[number];
```

### New `src/lib/auth/department-map.ts` (full contents to create)

```ts
import type { ValidRole } from "./hub-role-map";
import { V2_ROUTES } from "@/config/constants";

export const DEPARTMENTS = [
  "Business Team", "Enterprise Team", "HR", "Project Management", "Finance",
] as const;
export type DepartmentName = (typeof DEPARTMENTS)[number];

// Edit-time: which roles a department may hold. Checked bidirectionally by
// PATCH /api/v2/users/[userId] whenever either role or department_id changes.
export const DEPARTMENT_ROLES: Record<DepartmentName, ValidRole[]> = {
  "Business Team":       ["super_admin", "admin", "developer", "client"],
  "Enterprise Team":     ["super_admin", "admin", "developer", "client"],
  "HR":                  ["super_admin", "admin", "hr"],
  "Project Management":  ["pm"],
  "Finance":             ["super_admin", "admin"],
};

// Invite-time role options per department — identical to DEPARTMENT_ROLES except
// Finance, which excludes "super_admin" from the invite dropdown only (still settable
// later via the HR > Users edit action).
export const DEPARTMENT_INVITE_ROLES: Record<DepartmentName, ValidRole[]> = {
  ...DEPARTMENT_ROLES,
  "Finance": ["admin"],
};

// Path prefixes a department restricts nav/routing to, ON TOP of role-based access.
// Absent key = no additional restriction (falls back to whatever role already allows).
// "/dashboard" itself (the home page) is always allowed — handled separately below —
// so it is deliberately NOT listed here (listing it as a prefix would also match every
// other /dashboard/* route and defeat the restriction).
export const DEPARTMENT_NAV_RESTRICTION: Partial<Record<DepartmentName, string[]>> = {
  "HR":      [V2_ROUTES.DASHBOARD_USERS, V2_ROUTES.KB],
  "Finance": [V2_ROUTES.STACKSHIFT_ORDERS],
};

export function isPathAllowedForDepartment(pathname: string, departmentName: string | null): boolean {
  if (!departmentName) return true; // unassigned = unrestricted until HR sets one
  const allowed = DEPARTMENT_NAV_RESTRICTION[departmentName as DepartmentName];
  if (!allowed) return true; // Business Team / Enterprise Team / Project Management
  if (pathname === V2_ROUTES.DASHBOARD) return true; // home always reachable
  return allowed.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
```

### `src/app/(hub)/layout.tsx` (current — full file shown earlier in research; the two spots to change)

```ts
// current: pathname only read inside the !claims branch
const pathname = (await headers()).get("x-pathname") ?? "";
```
Move this above the `if (!data?.claims)` check so it's available for both branches, then after resolving `userRole`, also resolve `departmentName` (join `profiles.department_id` → `departments.name` in the same select the layout already runs) and add:
```ts
import { isPathAllowedForDepartment } from "@/lib/auth/department-map";
// ...
if (!isPathAllowedForDepartment(pathname, departmentName)) {
  redirect(V2_ROUTES.DASHBOARD);
}
```
Supabase embedded-resource select for the join (PostgREST auto-detects the FK once migration 139 lands):
```ts
const { data: profile } = await supabase
  .from("profiles")
  .select("role, full_name, avatar_url, department_id, departments(name)")
  .eq("id", userId)
  .single();
const departmentName = (profile?.departments as { name: string } | null)?.name ?? null;
```

### `src/app/(hub)/_components/v2-hub-sidebar.tsx` — `getNavGroups` (current signature `getNavGroups(role: string | null)`, current body shown in full during research)

Change signature to `getNavGroups(role: string | null, departmentName: string | null)`, and after building `workItems`/`peopleItems`/`knowledgeItems`/`adminItems` exactly as today, filter each with:
```ts
const filterByDept = (items: NavItem[]) =>
  items.filter((item) => isPathAllowedForDepartment(item.href, departmentName));
```
then build `groups` from the filtered arrays and drop any group whose `items.length === 0` (the existing `if (adminItems.length > 0)` pattern already does this for the Admin group — reuse the same pattern for Work/People/Knowledge too instead of the current unconditional push).

### `src/app/api/v2/users/[userId]/route.ts` — cross-validation to add (current file shown in full during research; extends the existing `if (body.role !== undefined)` block and adds a new `if (body.department_id !== undefined)` block)

```ts
import { DEPARTMENT_ROLES, DepartmentName } from "@/lib/auth/department-map";

// ...inside PATCH, after resolving `role` in the existing role-change block:
if (body.role !== undefined) {
  // existing VALID_ROLES + super_admin-gate checks stay as-is, then:
  const { data: current } = await adminClient
    .from("profiles").select("department_id, departments(name)").eq("id", userId).maybeSingle();
  const deptName = (current?.departments as { name: string } | null)?.name ?? null;
  if (deptName && !DEPARTMENT_ROLES[deptName as DepartmentName].includes(role)) {
    return NextResponse.json(
      { error: `"${ROLE_DISPLAY[role]}" isn't compatible with this user's department (${deptName}).` },
      { status: 400 }
    );
  }
  // ...existing dual-write continues unchanged
}

if (body.department_id !== undefined) {
  if (body.department_id === null) {
    const { error } = await adminClient.from("profiles").update({ department_id: null }).eq("id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  } else {
    const { data: dept } = await adminClient.from("departments").select("id, name").eq("id", body.department_id).maybeSingle();
    if (!dept) return NextResponse.json({ error: "Invalid department" }, { status: 400 });
    const { data: current } = await adminClient.from("profiles").select("role").eq("id", userId).maybeSingle();
    if (current?.role && !DEPARTMENT_ROLES[dept.name as DepartmentName].includes(current.role as ValidRole)) {
      return NextResponse.json(
        { error: `This user's role isn't compatible with ${dept.name}. Change their role first.` },
        { status: 400 }
      );
    }
    const { error } = await adminClient.from("profiles").update({ department_id: dept.id }).eq("id", userId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
```

### `src/app/api/stackshift-orders/_auth.ts` (current — full file shown during research)

```ts
export async function requireOrderReviewer():
  Promise<{ userId: string; departmentName: string | null } | NextResponse> {
  // ...existing auth + role check, then also select department_id/departments(name)
  // and return { userId: user.id, departmentName } instead of just { userId }
}

export async function requireOrderMutator():
  Promise<{ userId: string } | NextResponse> {
  const auth = await requireOrderReviewer();
  if (auth instanceof NextResponse) return auth;
  if (auth.departmentName === "Finance") {
    return NextResponse.json({ error: "Finance department has read-only access to Orders." }, { status: 403 });
  }
  return { userId: auth.userId };
}
```
`convert/route.ts` and `[orderId]/route.ts`'s `PATCH` swap their `requireOrderReviewer()` call for `requireOrderMutator()`; `file/route.ts` keeps `requireOrderReviewer()` unchanged (downloading a doc is "viewing," not an action).

### `src/app/(hub)/dashboard/users/page.tsx` — current `HubUser` type + `UserRow` extraction point (full file read during research, 609 lines pre-task)

`UserRow` currently spans lines 104–278 (including its `RowProps` interface) and uses these page-local helpers/constants that must move with it into `_user-row.tsx`: `getSelectValue`, `getInitials`, `formatDate`, `avatarColor`, `AVATAR_COLORS`, `ROLE_BADGE`. `page.tsx` keeps `KpiCard`, `ROLE_OPTIONS`, the `ProfileRole`/`HubUser`/`SelectRole` types (extend `HubUser` with `department_id: string | null; department_name: string | null;`), and all the `use...` state/handlers, importing `UserRow` from the new file.

## Implementation Steps

1. Write `supabase/migrations/139_departments.sql`: `departments` table (`id uuid pk default gen_random_uuid()`, `name text unique not null`, `created_at timestamptz not null default now()`), seed the 5 rows, `alter table profiles add column department_id uuid references departments(id)`, `enable row level security` on `departments` with one `select` policy for `authenticated using (true)` (no insert/update/delete policy — only `adminClient`/service role writes it).
2. Update `src/types/database.ts` — add the `departments` table shape and `profiles.department_id` (Row/Insert/Update + `Relationships`), following the existing file's conventions for a simple lookup table (mirror `leave_types` or similar small `hr.*` table shape if a close analog exists, otherwise the generic `public.*` table shape used throughout the file).
3. Create `src/lib/auth/department-map.ts` exactly as in Code Context above.
4. Create `src/app/api/departments/route.ts` — `GET`, admin/super_admin gate (mirror `api/v2/users/route.ts`'s gate exactly), returns `{ departments: adminClient.from("departments").select("id, name").order("name") }`.
5. Extend `src/app/api/admin/hub-users/invite/route.ts`: require `departmentId` in the body (400 if missing/blank); look it up in `departments`; validate `role` against `DEPARTMENT_INVITE_ROLES[deptName]` (400 with a clear message if not); include `department_id: dept.id` in the `profiles` insert/update alongside the existing role write; include `department_id`/`department_name` in the returned `user` shape.
6. Extend `src/app/api/v2/users/[userId]/route.ts` per Code Context — bidirectional cross-validation on both the existing `role` branch and the new `department_id` branch.
7. Extend `src/app/api/v2/users/route.ts`'s `profiles` select + merge to include `department_id` and joined `departments(name)`, surfaced on each returned user as `department_id`/`department_name`.
8. Extract `UserRow` (+ its helpers) out of `dashboard/users/page.tsx` into `_user-row.tsx`; add the Department cell (badge/select styled like the existing Role select, its own `ROLE_BADGE`-equivalent color map or a neutral badge since departments don't need semantic coloring) with an `onDepartmentChange(userId, departmentId)` handler prop.
9. In `page.tsx`: fetch `/api/departments` once on mount (parallel with the existing `/api/v2/users` fetch), add `handleDepartmentChange` (PATCH `/api/v2/users/[userId]` with `{ department_id }`, optimistic update + rollback-on-error following the exact pattern `handleRoleChange` already uses), extend `HubUser`, pass departments + the new handler down to `UserRow`.
10. Update `_invite-user-modal.tsx`: fetch `/api/departments` on mount; add a required Department `<select>` rendered above Role; Role `<select>` is disabled with a placeholder until a department is chosen, then its options come from `DEPARTMENT_INVITE_ROLES[selectedDepartmentName]`; if the previously-picked role becomes invalid when department changes, reset it to `""`; include `departmentId` in the POST body.
11. Update `(hub)/layout.tsx` per Code Context — hoist `pathname`, add the department select/join, call `isPathAllowedForDepartment` + redirect, pass `departmentName` to `V2HubShell`.
12. Thread `departmentName` through `v2-hub-shell.tsx` into `v2-hub-sidebar.tsx`; update `getNavGroups` per Code Context.
13. Update `stackshift-orders/page.tsx` and `[orderId]/page.tsx` to also resolve department and pass `readOnly = departmentName === "Finance"` down.
14. Update `order-review.tsx` and `_convert-panel.tsx` to accept and honor `readOnly`.
15. Update `_auth.ts` (`requireOrderMutator`) and swap it into `convert/route.ts` + `[orderId]/route.ts`'s `PATCH`.
16. Run `npx tsc --noEmit` and `pnpm lint`.
17. Manual/browser verification per Acceptance Criteria below — this task cannot be meaningfully verified without the migration applied and a live session per department, since it's fundamentally an access-control change.

## Acceptance Criteria

- [ ] `departments` table exists with exactly the 5 seeded rows; `profiles.department_id` is a nullable FK to it.
- [ ] HR > Users shows a Department control per row; changing it to an incompatible department for the user's current role is rejected with a clear inline error and no DB write; changing it to a compatible one succeeds and reflects immediately.
- [ ] Changing a user's Role to something incompatible with their current department is likewise rejected; changing Role when the user has no department, or to something compatible, succeeds exactly as it does today.
- [ ] Invite modal: Department is required and appears above Role; Role is unusable until a department is picked; picking Finance offers only Admin; picking any other department offers exactly that department's `DEPARTMENT_ROLES` list.
- [ ] A newly invited user's `profiles.department_id` is set correctly and shows up in the HR > Users table without a manual refresh.
- [ ] Signed in as an HR-department user (any allowed role): sidebar shows only Dashboard, HR, Wiki; typing `/customers`, `/projects`, `/desk/inbox`, `/orchestration`, `/dashboard/timelogs`, or `/dashboard/settings` directly redirects to `/dashboard`.
- [ ] Signed in as a Finance-department user: sidebar shows only Dashboard, Orders; every other Hub URL redirects to `/dashboard`; on an order's detail page there is no Convert/Dismiss/Reopen control; calling `POST /api/stackshift-orders/[orderId]/convert` or `PATCH /api/stackshift-orders/[orderId]` directly (e.g. via `curl` with a Finance session cookie) returns 403.
- [ ] Signed in as a Business Team, Enterprise Team, or Project Management user: sidebar and route access are unchanged from before this task, for every role that department allows.
- [ ] A user with `department_id = NULL` sees exactly what their role already grants — no new redirects, no sidebar changes.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new warnings/errors.
- [ ] `dashboard/users/page.tsx` and `_user-row.tsx` each stay within `nextjs-file-length-best-practices.md` guidance (soft warning ~250–300 lines, hard ceiling ~400–500) after the extraction — split further only if a section genuinely earns its own file.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Apply migration 139 in the target Supabase project first (this agent does not apply migrations).
# Then, per the Acceptance Criteria above:
#   - HR > Users: exercise Department + Role cross-validation both directions
#   - Invite flow: Department-first ordering, Finance → Admin-only role option
#   - Sign in as an HR-department user and a Finance-department user separately,
#     confirm sidebar contents + direct-URL redirects + Orders read-only (UI + curl 403 check)
#   - Confirm an unassigned-department user is unaffected
```

No automated test runner is configured for this repo (per `CLAUDE.md`) — verification is `tsc` + lint + the manual browser/curl walkthrough above, and it requires migration 139 to actually be applied first since this is fundamentally a data-model + access-control change.

## Compatibility Touchpoints

- **Migration 139 is written, not applied** — nothing in this task depends on it being live yet at merge time, but none of the department behavior works until it's applied (department will just always read as `NULL`, i.e. fully backward compatible / no-op, until then).
- No new environment variables, no new dependencies.
- Does not affect `(auth)`, `_hub_(OLD)`, or any Zoho import/export/sync code.
- `CLAUDE.md` documentation of the new table/column and the department↔role/nav rules is left to the `document` stage after implementation, per this repo's convention.

## Implementation Notes

### What Changed
- New `departments` table (migration 139, written not applied) seeded with the 5 departments, plus `profiles.department_id` nullable FK.
- New `src/lib/auth/department-map.ts`: `DEPARTMENT_ROLES`, `DEPARTMENT_INVITE_ROLES`, `DEPARTMENT_NAV_RESTRICTION`, `isPathAllowedForDepartment()` — single source of truth for the compatibility matrix and nav restriction.
- New `GET /api/departments` (admin/super_admin only) backs both department dropdowns.
- `POST /api/admin/hub-users/invite` now requires `departmentId`, validates the role against that department's invite-time role list, and writes `profiles.department_id`.
- `PATCH /api/v2/users/[userId]` now accepts `department_id` and cross-validates bidirectionally: changing role checks the user's current department, changing department checks the user's current role.
- `GET /api/v2/users` now returns `department_id`/`department_name` per user.
- HR > Users: extracted `UserRow` (+ helpers) into new `_user-row.tsx`, which gained a Department `<select>` cell; `page.tsx` fetches `/api/departments` and wires `handleDepartmentChange`.
- Invite modal: Department field added, rendered **before** Role; Role is disabled until a department is picked, then filtered to that department's `DEPARTMENT_INVITE_ROLES`.
- `(hub)/layout.tsx` now resolves the signed-in user's department and redirects to `/dashboard` when the current path isn't allowed for that department; `departmentName` threads through `V2HubShell` → `V2HubSidebar`, whose `getNavGroups()` filters every nav group's items through `isPathAllowedForDepartment()`.
- Orders read-only enforcement for Finance: `[orderId]/page.tsx` computes `readOnly` and passes it to `OrderReview`, which renders a plain notice instead of `ConvertPanel` when read-only, and hides the Reopen button on a dismissed order. `_auth.ts` gained `requireOrderMutator()` (wraps `requireOrderReviewer()` + a Finance-department 403), swapped into `convert/route.ts` and `[orderId]/route.ts`'s `PATCH`.

### Files Changed
- `supabase/migrations/139_departments.sql` — new table + seed + FK column + RLS (written, not applied).
- `src/types/database.ts` — added `departments` table type + `profiles.department_id`.
- `src/lib/auth/department-map.ts` — new shared department vocabulary/rules module.
- `src/app/api/departments/route.ts` — new GET endpoint.
- `src/app/api/admin/hub-users/invite/route.ts` — department required + validated, written to `profiles.department_id`, included in response.
- `src/app/api/v2/users/[userId]/route.ts` — bidirectional department/role cross-validation.
- `src/app/api/v2/users/route.ts` — department id/name added to the merged response.
- `src/app/(hub)/dashboard/users/_user-row.tsx` — new file, extracted `UserRow` + helpers, added Department cell.
- `src/app/(hub)/dashboard/users/page.tsx` — imports `UserRow`, fetches departments, adds `handleDepartmentChange`, extends `HubUser`, adds table column.
- `src/app/(hub)/dashboard/users/_invite-user-modal.tsx` — Department field (first), Role filtered by department.
- `src/app/(hub)/layout.tsx` — hoisted pathname, resolves department, redirects when path not allowed, passes `departmentName` down.
- `src/app/(hub)/_components/v2-hub-shell.tsx` — forwards `departmentName`.
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` — `getNavGroups()` filters by department.
- `src/app/(hub)/stackshift-orders/[orderId]/page.tsx` — resolves department, computes/passes `readOnly`.
- `src/app/(hub)/stackshift-orders/[orderId]/_components/order-review.tsx` — accepts `readOnly`, hides Reopen and swaps `ConvertPanel` for a read-only notice.
- `src/app/api/stackshift-orders/_auth.ts` — `requireOrderReviewer()` returns `departmentName`; new `requireOrderMutator()`.
- `src/app/api/stackshift-orders/[orderId]/convert/route.ts` — uses `requireOrderMutator()`.
- `src/app/api/stackshift-orders/[orderId]/route.ts` — `PATCH` uses `requireOrderMutator()`.

### Deviations From Plan
- **`src/app/(hub)/stackshift-orders/page.tsx` (list) was not touched.** The plan's Proposed File Changes listed it as a "for consistency/future-proofing" edit, but the list page has no mutating actions at all (confirmed by reading `orders-table.tsx` — every button there is pagination/search/navigation), so there is nothing for a `readOnly` flag to gate. Skipped rather than adding an unused prop.
- **`_convert-panel.tsx` was not modified.** The plan's file-change table listed adding a `readOnly` prop to it, but the simpler and equally correct approach was to just not render `<ConvertPanel>` at all when `readOnly` (done in `order-review.tsx`), showing a plain notice instead. This avoids threading an unused-when-true prop through a component whose entire body is the convert/dismiss form.
- **Dropped the unused `toastMsg` prop** that existed on the original inline `UserRow`'s `RowProps` (it was accepted but never read in the component body) while extracting it into `_user-row.tsx` — pure dead-prop cleanup, no behavior change, matches the project's own precedent (task 365 removed an equivalent unused prop during its quality-gate pass).
- Everything else matches the approved task document: schema, compatibility matrix, invite-flow ordering, nav restriction scope, and Finance API-level enforcement.

### Verification Run
- `npx tsc --noEmit` — PASS (no output, zero errors), run twice (mid-implementation and after all edits).
- `pnpm lint` — PASS (2 pre-existing warnings in `_checklist-tab.tsx`, unrelated to this task — same warnings task 365 also reported; nothing new).
- Browser/curl walkthrough (invite flow, department cross-validation, HR/Finance sidebar+redirect behavior, Orders read-only + 403 checks) — **NOT RUN**: requires migration 139 applied to a live Supabase project plus authenticated sessions per department, neither available in this session. Flagged for the `test` stage.
- `pnpm build` — NOT RUN (not requested at this stage).

## Quality Gate Notes

### Result
PASS

### Standards Review
- Read all 18 changed/created files in full (migration, `department-map.ts`, both `/api/v2/users*` routes, `/api/departments`, the invite route, `_auth.ts` + its two mutating-route call sites, both `stackshift-orders/[orderId]` files, `layout.tsx`, `v2-hub-shell.tsx`, `v2-hub-sidebar.tsx`, `page.tsx`, `_user-row.tsx`, `_invite-user-modal.tsx`, `database.ts`).
- Found and fixed one real issue during this pass: `_invite-user-modal.tsx`'s role-options filter had an unnecessary `(availableRoles as string[])` cast — `r.value` is already typed `SelectRole` and `availableRoles` is already `SelectRole[]`, so `.includes(r.value)` type-checks without widening to `string[]`. Removed the cast (`availableRoles.includes(r.value)`); re-ran `npx tsc --noEmit` + `pnpm lint`, both still pass clean. The other `as string[]` cast in the same file (guarding `newAvailableRoles.includes(role)` where `role: string`) is genuinely required, since `role`'s state type is a plain `string`, not narrowed to `SelectRole` — left as-is.
- No other unused code, dead code, or commented-out logic found. No broad `any` anywhere in the new/changed code — every cast (`as DepartmentName`, `as ValidRole`, `as string[]` where needed) narrows a known literal union, matching the exact pattern already used by the pre-existing `hub-role-map.ts` consumers.
- No deep nesting — every new branch (department/role cross-validation, department-based redirect, read-only Orders rendering) is a flat guard-clause sequence, consistent with the surrounding code's style.
- Error handling matches existing sibling-route conventions exactly: same `adminClient` query → `maybeSingle()`/`.single()` → early-return-on-missing pattern used throughout `api/v2/users` and `api/stackshift-orders`; fetches in client components wrapped in try/catch with a toast, matching `handleRoleChange`/`handleStatusToggle`.
- No secrets, tokens, or credentials logged or introduced; only generic error messages and department/role names reach `console.error`, consistent with the rest of the codebase.
- Verified every `Out of Scope / Must-Not-Change` boundary directly against the diff: `role-access.ts`/`require-role.ts` untouched; no department check added to any API route beyond the two named Orders mutation routes; `VALID_ROLES`/`ROLE_OPTIONS` unchanged (no `"marketing"` added); `_hub_(OLD)`, `(auth)/actions.ts`, `/auth/register`, `/auth/login` untouched; the existing per-row Role select/status toggle/unlock/Send Invite/Resend behavior in `_user-row.tsx` is byte-identical to the pre-extraction version aside from the new Department cell; no new dependency added to `package.json`.
- Verified the bidirectional cross-validation actually short-circuits before any write: both the role-change and department-change branches in `[userId]/route.ts` `return NextResponse.json(...)` on an incompatible combination *before* reaching their respective `.update()` calls — an incompatible PATCH performs zero DB writes, matching the acceptance criterion.
- File length: `page.tsx` is 436 lines (down from 609 pre-task after extracting `_user-row.tsx`, which is 256 lines) — `page.tsx` sits above the guidance's 250–300 soft-warning band but comfortably under the 400–500 hard ceiling. The remaining bulk is six `useCallback` handlers plus the table/KPI JSX for a single CRUD admin page; there's no further natural split (the row-rendering — the one piece that clearly earned its own file — is already extracted) without forcing an artificial break, which the guidance itself says not to do "just to hit a number." Accepted as-is.

### Deviations
- **Minor** — Removed an unnecessary type cast in `_invite-user-modal.tsx` during this quality-gate pass (found now, not anticipated at implement time). Pure type-safety polish, zero behavior change, confirmed via clean `tsc`/`lint` re-run.
- **Minor** — `stackshift-orders/page.tsx` (list) left untouched instead of receiving the plan's suggested (optional, "for consistency") `readOnly` wiring — the list page has no mutating actions for any viewer, so there was nothing to gate. Documented in Implementation Notes at implement time.
- **Minor** — `_convert-panel.tsx` was not given a `readOnly` prop as the plan's file table suggested; `order-review.tsx` instead simply doesn't render `<ConvertPanel>` at all when read-only, showing a plain notice in its place. Same net effect (no convert/dismiss UI reaches a Finance-department viewer), fewer files touched, no prop that would only ever be `true` since the component is unreachable otherwise. Documented in Implementation Notes at implement time.
- **Minor** — Dropped an unused `toastMsg` prop that existed on the pre-task inline `UserRow`'s prop type, discovered while extracting it into `_user-row.tsx`. Pure dead-prop cleanup; not referenced by any requirement or acceptance criterion.
- No Medium or Major deviations. Scope, data model, compatibility matrix, invite-flow ordering, nav-restriction scope, and Finance API-level enforcement all match the approved task document exactly.
