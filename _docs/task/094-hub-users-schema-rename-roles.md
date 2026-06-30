# Task 094 — hub_users Schema: Rename external_id + New Columns + Role System

> **Priority:** HIGH
> **Type:** feature
> **Version Impact:** minor
> **Recommended Model:** sonnet
> **Created:** 2026-06-30
> **Status:** DONE
> **Completed:** 2026-06-30

---

## Changelog

### Original scope (Migration 043)
- `zoho_user_id` → `external_id` across 14 files
- Added `status`, `last_active_at`, `joined_at`, `cost_rate_per_hour`, `source_meta` columns
- Role system changed to `Super Admin | PM | Admin | Developer | Other | NULL`
- `determineHubRole` removed from import; role set to `NULL` for all imported users

### Migration 043 fix
- Added `alter table hub_users alter column role drop not null` before backfill — original schema had NOT NULL constraint on role which blocked the `SET role = null` update for `pending` rows.

### Migration 044 — display_name → first_name + last_name
- `display_name` column dropped; replaced with `first_name text` + `last_name text`
- `is_invited boolean not null default false` added
- Backfilled from existing `display_name` data (first word → first_name, remainder → last_name)
- All consumers updated: layouts, dashboards, API routes, auth callbacks (17 files total)
- `auth.users.raw_user_meta_data` still receives `display_name` on write for Supabase Dashboard visibility

### Migration 045 — trigger fix
- `handle_new_hub_user()` still referenced dropped `display_name` + `zoho_user_id` columns, causing `AuthRetryableFetchError` (status 500) on `createUser()`
- Rewrote trigger to use `first_name`, `last_name`, `external_id`; set `role = null` on insert

### Custom invite system
- `POST /api/admin/hub-users/[userId]/invite` — generates password-recovery link via `adminClient.auth.admin.generateLink({ type: 'recovery' })`, sends custom email, flips `is_invited = true`
- `sendHubInviteEmail(to, firstName, inviteUrl)` added to `src/lib/email/mailer.ts` (HTML + plain text via nodemailer/Zeptomail)
- `/admin/hub-users` page: added Send Invite button (shown only when role is assigned and `is_invited = false`)
- Import: `createUser({ email_confirm: true })` creates auth row silently — no email sent; `is_invited = false`

### Import route fixes
- Pre-loads `auth.users` via `adminClient.auth.admin.listUsers()` to handle re-runs where auth row exists but `hub_users` row doesn't (avoids duplicate `createUser` 500 errors)
- Now populates all Zoho fields: `joined_at` ← `added_time`, `last_active_at` ← `last_accessed_on`, `status` ← `status`, `cost_rate_per_hour` ← `budget.cost_rate_per_hour.amount`
- Improved error messages: full error object logged with `[zoho-import/users]` prefix; `createErr.status` fallback when `.message` is empty

---

## Problem

Three issues need resolving together (single migration to avoid multiple table rewrites):

1. **`zoho_user_id` has a Zoho-specific prefix** — other decommission tables use `external_id` (tasks, milestones, tasklists). hub_users is inconsistent.
2. **hub_users is missing operational fields** needed to carry the full Zoho dataset post-decommission: `status`, `last_active_at`, `joined_at`, `cost_rate_per_hour`, `source_meta`.
3. **Role system is undefined and Zoho-derived** — roles must now be set explicitly by a Super Admin, with values: `Super Admin | PM | Admin | Developer | Other | NULL`. NULL means unassigned (awaiting Super Admin).

---

## Requirements

### Migration 043

```sql
-- 1. Rename zoho_user_id → external_id
alter table hub_users rename column zoho_user_id to external_id;

-- 2. Add new operational columns
alter table hub_users
  add column status text not null default 'active',
  add column last_active_at timestamptz,
  add column joined_at timestamptz,
  add column cost_rate_per_hour numeric(10,2) not null default 0,
  add column source_meta jsonb not null default '{}';

-- 3. Drop existing role constraint (if any) and backfill to new role names
-- Old values: admin | pm | developer | dev | client | pending
-- New values: 'Super Admin' | 'PM' | 'Admin' | 'Developer' | 'Other' | NULL
update hub_users set role = 'Admin'     where role = 'admin';
update hub_users set role = 'PM'        where role = 'pm';
update hub_users set role = 'Developer' where role in ('developer', 'dev');
update hub_users set role = 'Other'     where role = 'client';
update hub_users set role = NULL        where role = 'pending';
-- (no check constraint — role is free-form text or NULL going forward)
```

### Source → Column mapping for import route

| `users.json` field | hub_users column |
|---|---|
| `email` | `email` |
| `full_name` | `display_name` |
| `zuid` | `external_id` |
| `status` | `status` (`"active"` for all current records) |
| `last_accessed_on` | `last_active_at` |
| `added_time` | `joined_at` |
| `budget.cost_rate_per_hour.amount` | `cost_rate_per_hour` |
| `id`, `role`, `portal_profile`, `user_type`, `business_hours`, `is_resend_invite`, `is_confirmed`, `updated_time` | `source_meta` (JSONB) |
| *(not set by import)* | `role` → `NULL` (Super Admin assigns) |

### Role system changes

- Import route: **remove `determineHubRole` entirely** — set `role = null` for all users. Super Admin assigns later.
- `approveHubUser` action: update caller guard from `"admin"` → allow `"Super Admin"` OR `"Admin"`. Update allowed role values from `["admin","pm","dev"]` → `["Super Admin","PM","Admin","Developer","Other"]`.
- `_table.tsx`: update badge color map and approve-form `<select>` options to new role names.

---

## Notes for Implementation Agent

- **Sonnet rationale:** schema migration + 11 files with `zoho_user_id` references + role value backfill + import route rewrite.
- **Migration number is 043** — `042_tasks_import_columns.sql` is the current highest.
- **`zoho_user_id` appears in 11 source files** — use replace_all to rename systematically. Full list in File Changes. Also rename the variable name `zohoUserId`/`zoho_user_id` in JS/TS to `externalId`/`external_id` where it refers to the column.
- **`src/types/database.ts` hub_users Row/Insert/Update** must be updated: rename `zoho_user_id` → `external_id`, add the 5 new column types, update `role` from `string` to `string | null`.
- **Role guard in `approveHubUser`**: currently checks `caller?.role !== "admin"`. New guard: `!["Super Admin","Admin"].includes(caller?.role ?? "")`. Allowed roles for the select: `["Super Admin","PM","Admin","Developer","Other"]`.
- **Import route (`zoho-import/users/route.ts`)**: remove `HubRole`, `toProfileRole`, `determineHubRole`, `APPROVED_ROLES`. Replace with `role: null`. Add new fields to both the update (existing user) and post-create (new user) paths. `source_meta` object: `{ zoho_id: user.id, role: user.role, portal_profile: user.portal_profile, user_type: user.user_type, business_hours: user.business_hours, is_resend_invite: user.is_resend_invite, is_confirmed: user.is_confirmed, updated_time: user.updated_time }`. Filter out null/undefined keys.
- **Import still updates `profiles.role`** for new users via `adminClient.auth.admin.createUser` path — but only sets `"developer"` as a safe default for the v2 auth layer (profiles.role is a separate Postgres enum, not changed in this task).
- **`last_active_at`**: map from `zohoUser.last_accessed_on ?? null`. Cast to `new Date(str).toISOString()` if present, else null.
- **`joined_at`**: map from `zohoUser.added_time ?? null`. Same cast.
- **`cost_rate_per_hour`**: map from `zohoUser.budget?.cost_rate_per_hour?.amount ?? 0`. Cast to number.
- **Do NOT add a CHECK constraint on role** — it's free-form text or NULL going forward. No enum type.
- **`_table.tsx` ROLE_BADGE maps**: add entries for `"Super Admin"`, `"PM"`, `"Admin"`, `"Developer"`, `"Other"`. Keep existing `"pm"`, `"dev"`, `"admin"` entries only if they're still used (they won't be after backfill, but it's harmless to keep them).
- **`hub_users` pre-built map in import route**: add `external_id` to the select so it can be checked (prevents re-writing if already set).
- **`sync-hub-user.ts` and `update-zoho-profile.ts`**: only rename the column reference. No logic change.
- **`src/app/(hub)/layout.tsx`**: renames `zoho_user_id` in the select string and the variable `userZohoId`. The variable name can stay as-is or be renamed — only the DB column string matters for correctness.

---

## File Changes

| File | Action | Notes |
|------|--------|-------|
| `supabase/migrations/043_hub_users_schema_rename_roles.sql` | CREATE | Rename column, add 5 columns, backfill roles |
| `src/types/database.ts` | MODIFY | hub_users Row/Insert/Update: rename + new fields + `role: string \| null` |
| `src/app/(hub)/layout.tsx` | MODIFY | `zoho_user_id` → `external_id` in select string (line 25) |
| `src/app/(hub)/admin/hub-users/page.tsx` | MODIFY | `zoho_user_id` → `external_id` in select + display (lines 29, 83) |
| `src/app/(hub)/dashboard/users/page.tsx` | MODIFY | `zoho_user_id` → `external_id` in select (line 16) |
| `src/app/(hub)/dashboard/users/_table.tsx` | MODIFY | Rename column + update `HubUser` type + badge map + approve form options |
| `src/app/(hub)/actions/approve-hub-user.ts` | MODIFY | Update caller guard + allowed role values |
| `src/app/api/admin/zoho-import/users/route.ts` | MODIFY | Rename column; remove role logic; add new fields; populate source_meta |
| `src/app/api/dev/tasks/route.ts` | MODIFY | `zoho_user_id` → `external_id` in select + variable (lines 40, 45) |
| `src/app/api/dev/ask/route.ts` | MODIFY | `zoho_user_id` → `external_id` (lines 42, 46) |
| `src/app/api/dev/assign/route.ts` | MODIFY | `zoho_user_id` → `external_id` (line 17) |
| `src/app/(auth)/sync-hub-user.ts` | MODIFY | `zoho_user_id` → `external_id` in select, updates, and variable names |
| `src/app/(auth)/update-zoho-profile.ts` | MODIFY | `zoho_user_id` → `external_id` (line 19) |
| `src/app/(auth)/sync-zoho-role.ts` | MODIFY | `zoho_user_id` → `external_id` in HubUserUpdate type + update object |

---

## Code Context

### Current hub_users Row type (src/types/database.ts:1878)
```ts
hub_users: {
  Row: {
    id: string;
    email: string;
    display_name: string | null;
    role: string;
    zoho_user_id: string | null;   // → rename to external_id
    created_at: string;
    updated_at: string;
    // ADD: status, last_active_at, joined_at, cost_rate_per_hour, source_meta
  };
```

### Target hub_users Row type (after migration)
```ts
hub_users: {
  Row: {
    id: string;
    email: string;
    display_name: string | null;
    role: string | null;           // NULL = unassigned
    external_id: string | null;    // was zoho_user_id
    status: string;                // 'active' | 'inactive' | 'deactivated'
    last_active_at: string | null;
    joined_at: string | null;
    cost_rate_per_hour: number;
    source_meta: Json;
    created_at: string;
    updated_at: string;
  };
  Insert: {
    // same with external_id optional, role optional (nullable)
  };
  Update: {
    // same, all optional
  };
};
```

### approveHubUser (src/app/(hub)/actions/approve-hub-user.ts:7)
```ts
// CURRENT — must update both guards:
if (caller?.role !== "admin") return;                            // → !["Super Admin","Admin"].includes(...)
if (!["admin", "pm", "dev"].includes(role)) return;             // → ["Super Admin","PM","Admin","Developer","Other"]
```

### _table.tsx role badges + approve form (src/app/(hub)/dashboard/users/_table.tsx)
```ts
// CURRENT badge maps — expand to new role names:
const ROLE_BADGE_LIGHT: Record<string, string> = {
  admin:   "bg-red-50 text-red-700 border border-red-200",
  pm:      "bg-blue-50 text-blue-700 border border-blue-200",
  dev:     "bg-green-50 text-green-700 border border-green-200",
  pending: "bg-amber-50 text-amber-700 border border-amber-200",
};
// ADD: "Super Admin", "PM", "Admin", "Developer", "Other", and keep old keys for safety

// CURRENT approve form:
<option value="dev">Dev</option>
<option value="pm">PM</option>
<option value="admin">Admin</option>
// REPLACE WITH:
<option value="Super Admin">Super Admin</option>
<option value="PM">PM</option>
<option value="Admin">Admin</option>
<option value="Developer">Developer</option>
<option value="Other">Other</option>
```

### Import route — current role logic to REMOVE (src/app/api/admin/zoho-import/users/route.ts)
```ts
// DELETE these entirely:
type HubRole = "admin" | "pm" | "pending";
type ProfileRole = "admin" | "pm" | "developer" | "client";
const APPROVED_ROLES = new Set(["admin", "pm", "dev"]);
function determineHubRole(user: ZohoUserRaw): HubRole { ... }
function toProfileRole(hubRole: HubRole): ProfileRole { ... }

// In existing-user update — was:
.update({ display_name: fullName, zoho_user_id: zohoUserId })
// becomes:
.update({
  display_name: fullName,
  external_id: zohoUserId,
  status: zohoUser.status ?? "active",
  last_active_at: zohoUser.last_accessed_on ? new Date(zohoUser.last_accessed_on).toISOString() : null,
  joined_at: zohoUser.added_time ? new Date(zohoUser.added_time).toISOString() : null,
  cost_rate_per_hour: zohoUser.budget?.cost_rate_per_hour?.amount ?? 0,
  source_meta: buildSourceMeta(zohoUser),
})
// role NOT updated — Super Admin assigns

// In new-user path — was:
.update({ role: hubRole, full_name: fullName }).eq("id", created.user.id)   // profiles
.update({ display_name: fullName, zoho_user_id: zohoUserId, role: hubRole }) // hub_users
// becomes (profiles unchanged except safe default):
.update({ role: "developer", full_name: fullName }).eq("id", created.user.id) // profiles — v2 auth default
.update({                                                                       // hub_users
  display_name: fullName, external_id: zohoUserId, role: null,
  status: zohoUser.status ?? "active",
  last_active_at: ..., joined_at: ..., cost_rate_per_hour: ..., source_meta: ...,
})
```

### source_meta builder helper (add inline in import route)
```ts
function buildSourceMeta(u: ZohoUserRaw): Record<string, unknown> {
  const raw: Record<string, unknown> = {
    zoho_id: u.id,
    role: u.role,
    portal_profile: u.portal_profile,
    user_type: u.user_type,
    business_hours: u.business_hours,
    is_resend_invite: u.is_resend_invite,
    is_confirmed: u.is_confirmed,
    updated_time: u.updated_time,
  };
  return Object.fromEntries(Object.entries(raw).filter(([, v]) => v != null));
}
```

### sync-hub-user.ts — rename only (src/app/(auth)/sync-hub-user.ts:24)
```ts
// Line 24: .select("display_name, zoho_user_id") → .select("display_name, external_id")
// Line 39: zoho_user_id: ... → external_id: ...
// Line 45: { display_name?: string; zoho_user_id?: string | null } → { display_name?: string; external_id?: string | null }
// Line 56: if (!existing.zoho_user_id && zohoSub) → if (!existing.external_id && zohoSub)
// Line 57: updates.zoho_user_id = zohoSub → updates.external_id = zohoSub
```

---

## Implementation Steps

1. **Create migration** `supabase/migrations/043_hub_users_schema_rename_roles.sql`:
   - `alter table hub_users rename column zoho_user_id to external_id`
   - Add 5 columns with defaults
   - Backfill role values (admin→Admin, pm→PM, developer/dev→Developer, client→Other, pending→NULL)

2. **Update `src/types/database.ts`** — hub_users section: rename field, add 5 new fields, change `role: string` → `role: string | null`

3. **Rename `zoho_user_id` → `external_id`** in the 11 source files — use replace_all for the string literal `"zoho_user_id"` in each file, then rename the TS variable references

4. **Update `approveHubUser`** — new caller guard + allowed role list

5. **Update `_table.tsx`** — badge color maps + HubUser type + approve form `<select>` options

6. **Rewrite import route** — remove role logic, populate all new fields, add `buildSourceMeta` helper

---

## Acceptance Criteria

- [ ] Migration 043 applies cleanly: column renamed, 5 new columns added, existing roles backfilled
- [ ] `npx tsc --noEmit` passes with zero errors
- [ ] Hub users page still loads and displays `external_id` column correctly
- [ ] Approve form shows new role options: Super Admin / PM / Admin / Developer / Other
- [ ] Only users with role `"Super Admin"` or `"Admin"` can approve
- [ ] Import route populates all new columns; `role` is null for all imported users
- [ ] Import skips Customer-role users (existing filter preserved)
- [ ] `source_meta` is populated with Zoho reference data
- [ ] `dev/tasks`, `dev/ask`, `dev/assign` routes still resolve the user's external_id correctly
