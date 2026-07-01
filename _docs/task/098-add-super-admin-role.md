# Task 098 — Add super_admin Role to the v2 Hub

> **Version Impact:** minor
> **Recommended Model:** sonnet
> **Investigation:** /understand ran before this spec. Findings embedded below.
> **Status:** TESTING
> **Completed:** 2026-07-01
> **Implementation Notes:** All 7 steps implemented. TypeScript clean (no errors). Migration file created but must be applied to Supabase manually (run via Supabase dashboard or `supabase db push`). The invite form shows Super Admin to all callers; server-side enforcement in `inviteUser` rejects it for non-super_admin callers. The PATCH route guards are in the correct order: VALID_ROLES check → super_admin assignment guard → Promise.all write.

## Goal

Add a `super_admin` role as a higher tier above `admin` in the v2 hub. Existing admin users stay unchanged. `super_admin` has all admin capabilities plus two exclusive powers: (1) ability to assign the `super_admin` role via the PATCH API, (2) ability to invite admin or super_admin users. Everything else — nav, sidebar visibility, page access — is identical to admin.

## Requirements

- `super_admin` is a new value in the `profiles.role` CHECK constraint (text, not a PostgreSQL ENUM)
- Existing `admin` users are NOT migrated. Both roles co-exist permanently.
- `super_admin` sees the same nav groups and items as `admin` (isAdmin check covers both)
- `super_admin` can invite any role including `admin` and `super_admin`
- `admin` can invite any role **except** `super_admin` — the server action enforces this
- Only `super_admin` can PATCH a user's role to `super_admin` — the API route enforces this
- Both `admin` and `super_admin` can access the PATCH API for all other role changes
- The invite form shows `super_admin` as an option in the dropdown; the server action rejects the attempt if the caller is not a `super_admin`

## Version Impact

`minor` — new DB value, new role tier, no breaking changes to existing APIs or users.

## File Changes

| File | Action | Change |
|------|--------|--------|
| `supabase/migrations/047_add_super_admin_role.sql` | Create | Drop + recreate profiles_role_check to include `super_admin` |
| `src/types/database.ts` | Modify | Add `"super_admin"` to Row (line 500), Insert (line 509), Update (line 518) role unions |
| `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` | Modify | `isAdmin` check on line 29; `ROLE_LABEL` map lines 75–78 |
| `src/app/v2/(hub)/admin/hub-users/page.tsx` | Modify | `Role` type (line 7) and `ROLES` array (lines 9–14) |
| `src/app/v2/(auth)/actions.ts` | Modify | `inviteUser` signature (line 166) and guard (line 177) |
| `src/app/api/v2/users/[userId]/route.ts` | Modify | `VALID_ROLES`, `ROLE_DISPLAY`, `PROFILE_ROLE`, and PATCH guard (lines 5–44) |
| `src/app/v2/(hub)/dashboard/users/page.tsx` | Modify | `ProfileRole` type (line 9), `ROLE_OPTIONS` (lines 29–36), `ROLE_BADGE` (lines 39–47) |

## Implementation Steps

### Step 1 — Database migration

Create `supabase/migrations/047_add_super_admin_role.sql`:

```sql
-- profiles.role is a text CHECK constraint (not a PostgreSQL ENUM type)
-- Drop and recreate the constraint to add 'super_admin'
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_role_check
    CHECK (role IN ('admin', 'hr', 'pm', 'developer', 'client', 'super_admin'));
```

### Step 2 — TypeScript database types (`src/types/database.ts`)

Add `"super_admin"` to the role union in all three positions (Row, Insert, Update) under the `profiles` table definition:

```ts
// Before (all three):
role: "admin" | "hr" | "pm" | "developer" | "client"

// After (all three):
role: "admin" | "hr" | "pm" | "developer" | "client" | "super_admin"
```

### Step 3 — Sidebar (`src/app/v2/(hub)/_components/v2-hub-sidebar.tsx`)

Update `isAdmin` at line 29 so `super_admin` gets the same nav as `admin`:

```ts
// Before:
const isAdmin = role === "admin";

// After:
const isAdmin = role === "admin" || role === "super_admin";
```

Update `ROLE_LABEL` at lines 75–78 to add the display label:

```ts
const ROLE_LABEL: Record<string, string> = {
  admin: "Admin", pm: "PM", developer: "Developer",
  hr: "HR", client: "Client", super_admin: "Super Admin",
};
```

### Step 4 — Invite form page (`src/app/v2/(hub)/admin/hub-users/page.tsx`)

Add `"super_admin"` to the `Role` type and `ROLES` array. The form shows the option to all callers; enforcement happens server-side:

```ts
// Before:
type Role = "pm" | "developer" | "hr" | "admin";

const ROLES: { value: Role; label: string }[] = [
  { value: "pm", label: "Project Manager" },
  { value: "developer", label: "Developer" },
  { value: "hr", label: "HR" },
  { value: "admin", label: "Admin" },
];

// After:
type Role = "pm" | "developer" | "hr" | "admin" | "super_admin";

const ROLES: { value: Role; label: string }[] = [
  { value: "pm", label: "Project Manager" },
  { value: "developer", label: "Developer" },
  { value: "hr", label: "HR" },
  { value: "admin", label: "Admin" },
  { value: "super_admin", label: "Super Admin" },
];
```

### Step 5 — inviteUser Server Action (`src/app/v2/(auth)/actions.ts`)

Two changes:
1. Widen the function signature to accept `"super_admin"`
2. Replace the single `admin`-only guard with a two-level guard:
   - Both `admin` and `super_admin` may call the function
   - Only `super_admin` may invite a `super_admin`

```ts
// Before:
export async function inviteUser(
  email: string,
  fullName: string,
  role: "admin" | "hr" | "pm" | "developer"
): Promise<{ tempPassword?: string; error?: string }> {
  ...
  if (profile?.role !== "admin") return { error: "Admin access required." };

// After:
export async function inviteUser(
  email: string,
  fullName: string,
  role: "admin" | "hr" | "pm" | "developer" | "super_admin"
): Promise<{ tempPassword?: string; error?: string }> {
  ...
  const callerRole = profile?.role;
  if (callerRole !== "admin" && callerRole !== "super_admin") {
    return { error: "Admin access required." };
  }
  if (role === "super_admin" && callerRole !== "super_admin") {
    return { error: "Only a Super Admin can invite Super Admin users." };
  }
```

### Step 6 — PATCH API route (`src/app/api/v2/users/[userId]/route.ts`)

Four changes in the first ~50 lines:

1. Add `"super_admin"` to `VALID_ROLES`
2. Add `"Super Admin"` entry to `ROLE_DISPLAY`
3. Update `PROFILE_ROLE` type signature and add `super_admin` entry
4. Update the caller guard and add role-assignment guard:

```ts
// Before:
const VALID_ROLES = ["admin", "hr", "pm", "developer", "client", "other"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

const ROLE_DISPLAY: Record<ValidRole, string> = {
  admin: "Admin",
  hr: "HR",
  pm: "PM",
  developer: "Developer",
  client: "Client",
  other: "Other",
};

const PROFILE_ROLE: Record<ValidRole, "admin" | "hr" | "pm" | "developer" | "client"> = {
  admin: "admin",
  hr: "hr",
  pm: "pm",
  developer: "developer",
  client: "client",
  other: "client",
};

// ... in handler:
if (callerProfile?.role !== "admin") {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

// After:
const VALID_ROLES = ["admin", "super_admin", "hr", "pm", "developer", "client", "other"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

const ROLE_DISPLAY: Record<ValidRole, string> = {
  admin: "Admin",
  super_admin: "Super Admin",
  hr: "HR",
  pm: "PM",
  developer: "Developer",
  client: "Client",
  other: "Other",
};

const PROFILE_ROLE: Record<ValidRole, "admin" | "super_admin" | "hr" | "pm" | "developer" | "client"> = {
  admin: "admin",
  super_admin: "super_admin",
  hr: "hr",
  pm: "pm",
  developer: "developer",
  client: "client",
  other: "client",
};

// ... in handler (replace the single guard):
const callerRole = callerProfile?.role;
if (callerRole !== "admin" && callerRole !== "super_admin") {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
// Add immediately after, before processing body.role:
if (body.role === "super_admin" && callerRole !== "super_admin") {
  return NextResponse.json({ error: "Only a Super Admin can assign the Super Admin role." }, { status: 403 });
}
```

Note: the `body.role === "super_admin"` guard must be placed AFTER the `VALID_ROLES` include-check and before the `Promise.all` write — i.e., inside the `if (body.role !== undefined)` block, right after role validation passes.

### Step 7 — Users management table (`src/app/v2/(hub)/dashboard/users/page.tsx`)

Add `"super_admin"` to `ProfileRole`, `ROLE_OPTIONS`, and `ROLE_BADGE`:

```ts
// Before:
type ProfileRole = "admin" | "hr" | "pm" | "developer" | "client";

const ROLE_OPTIONS: { value: SelectRole; label: string }[] = [
  { value: "admin",     label: "Admin" },
  ...
];

const ROLE_BADGE: Record<string, string> = {
  "admin":     "bg-purple-50 text-purple-700 border-purple-200",
  ...
};

// After:
type ProfileRole = "admin" | "super_admin" | "hr" | "pm" | "developer" | "client";

const ROLE_OPTIONS: { value: SelectRole; label: string }[] = [
  { value: "super_admin", label: "Super Admin" },
  { value: "admin",       label: "Admin" },
  { value: "hr",          label: "HR" },
  { value: "pm",          label: "PM" },
  { value: "developer",   label: "Developer" },
  { value: "client",      label: "Client" },
  { value: "other",       label: "Other" },
];

const ROLE_BADGE: Record<string, string> = {
  "":             "bg-amber-50 text-amber-700 border-amber-200",
  "super_admin":  "bg-violet-50 text-violet-700 border-violet-200",
  "admin":        "bg-purple-50 text-purple-700 border-purple-200",
  "hr":           "bg-teal-50 text-teal-700 border-teal-200",
  "pm":           "bg-blue-50 text-blue-700 border-blue-200",
  "developer":    "bg-green-50 text-green-700 border-green-200",
  "client":       "bg-slate-50 text-slate-600 border-slate-200",
  "other":        "bg-orange-50 text-orange-700 border-orange-200",
};
```

Also update `SelectRole` type to include `"super_admin"`:
```ts
type SelectRole = ProfileRole | "other" | "";
```
(This automatically picks it up once ProfileRole is updated — no separate change needed.)

## Code Context

### profiles.role CHECK constraint (migration 025, line 9)
```sql
role text not null check (role in ('admin', 'hr', 'pm', 'developer', 'client')),
```

### VALID_ROLES + ROLE_DISPLAY + PROFILE_ROLE (route.ts lines 5–25)
```ts
const VALID_ROLES = ["admin", "hr", "pm", "developer", "client", "other"] as const;
type ValidRole = (typeof VALID_ROLES)[number];

const ROLE_DISPLAY: Record<ValidRole, string> = {
  admin: "Admin", hr: "HR", pm: "PM", developer: "Developer",
  client: "Client", other: "Other",
};

const PROFILE_ROLE: Record<ValidRole, "admin" | "hr" | "pm" | "developer" | "client"> = {
  admin: "admin", hr: "hr", pm: "pm", developer: "developer",
  client: "client", other: "client",
};
```

### PATCH caller guard (route.ts line 42)
```ts
if (callerProfile?.role !== "admin") {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

### getNavGroups isAdmin check (sidebar line 29)
```ts
const isAdmin = role === "admin";
```

### inviteUser guard (actions.ts line 177)
```ts
if (profile?.role !== "admin") return { error: "Admin access required." };
```

## Notes for Implementation Agent

- **Recommended sonnet** — this change is security-sensitive (role/permission guards), cross-cutting (DB + API + 3 UI surfaces), and introduces a two-tier enforcement pattern that requires judgment calls in each guard.
- `profiles.role` is a text CHECK constraint, NOT a PostgreSQL ENUM. Migration syntax is `ALTER TABLE profiles DROP CONSTRAINT profiles_role_check; ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (...)`. Do not use `ALTER TYPE`.
- The `super_admin` guard in the PATCH route (step 6) must be placed inside the `if (body.role !== undefined)` block, AFTER the `VALID_ROLES` includes check passes, BEFORE the `Promise.all` write — see the step for the exact position.
- `hub_users.role` (display string) and `profiles.role` (CHECK enum) are always written together in the existing `Promise.all` in the PATCH route. `ROLE_DISPLAY["super_admin"]` becomes `"Super Admin"` in `hub_users`, and `PROFILE_ROLE["super_admin"]` becomes `"super_admin"` in `profiles`. The existing pattern handles this automatically once the maps are updated.
- The invite form (`admin/hub-users/page.tsx`) is a client component with no server-side role context — it shows all roles including `super_admin`. Server-side enforcement in `inviteUser` is the only gate. This is intentional: the error is surfaced back to the form via `res.error`.
- `SelectRole` in `dashboard/users/page.tsx` is derived from `ProfileRole | "other" | ""` — updating `ProfileRole` to include `"super_admin"` automatically widens `SelectRole`. No separate type change needed, but verify the derived type union is correct after updating `ProfileRole`.
- Do NOT auto-migrate existing `admin` users. The migration only widens the CHECK constraint.
- Run `npx tsc --noEmit` after all changes — the role type union touches 3 files and the compiler will catch any missed spots.
