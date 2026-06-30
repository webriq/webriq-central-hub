# Task 093 — Zoho Users Export + Import

> **Priority:** HIGH
> **Type:** feature
> **Version Impact:** minor
> **Recommended Model:** sonnet
> **Created:** 2026-06-30
> **Status:** TESTING
> **Completed:** 2026-06-30
> **Implementation Notes:** TypeScript clean (zero errors). Export uses direct paginated fetch loop rather than `getZohoPortalUsers` helper (matches milestones export pattern). Import inlines `determineHubRole` from sync-zoho-role.ts to avoid "use server" boundary. `fullName` construction uses intermediate `combined` variable to satisfy TS5076 (`??` + `||` mixing). Both endpoints use same admin auth guard (`profiles.role === "admin"`). New user creation uses `adminClient.auth.admin.createUser` pattern from v2 `inviteUser` action — trigger fires to create `hub_users` + `profiles`, then both tables updated post-create.
> **Investigation:** /understand ran before this spec. Findings embedded below.

---

## Problem

The Zoho decommission migration pipeline covers projects, milestones, tasklists, tasks, comments, time logs, and attachments — but Zoho portal users are missing. There is no way to bulk-export the full portal user list or bulk-sync/invite them into Hub `hub_users` + `profiles`. Admins currently have to invite users one at a time via `/v2/admin/hub-users`.

---

## Requirements

1. **Export endpoint** (`GET /api/admin/zoho-export/users`) — admin-only, auto-paginates all Zoho portal users (50/page), returns flat `users.json` download. No file dependencies (unlike milestones/tasklists which need `projects.json`).

2. **Import endpoint** (`POST /api/admin/zoho-import/users`) — admin-only, reads `_from_zoho/users.json`, for each user:
   - If email matches an existing `hub_users` row: update `hub_users.display_name` + `hub_users.zoho_user_id` and update `profiles.full_name` + `profiles.role`. (**synced**)
   - If no `hub_users` row exists: create a new Supabase auth user via `adminClient.auth.admin.createUser()` (trigger auto-creates `hub_users` + `profiles`), then update `profiles` with role + full_name. (**invited**)
   - Returns `{ imported, updated, skipped, errors }` where `imported` = new users invited, `updated` = existing users synced.

3. **Migrate page** — add "Users" to both `EXPORT_LEVELS` (index 0) and `IMPORT_LEVELS` (index 0, before "customers"). Both use the existing generic `handleExport` / `handleImport` handlers — no SSE needed.

---

## Notes for Implementation Agent

- **Sonnet rationale:** cross-table writes to `hub_users` + `profiles`, `adminClient.auth.admin.createUser()` auth pattern, two new API endpoints, migrate page update.
- **Export uses v3.1 API, not v3**: `https://projectsapi.zoho.com/api/v3.1/portal/{portalId}/users` — already the URL used by `getZohoPortalUsers` in `src/lib/zoho/index.ts:619`. Do NOT call v3.
- **Do NOT call `getZohoPortalUsers` in the export route** — import the library function only if needed, but it's cleaner to call the Zoho API directly with `getZohoAccessToken()` in a loop, matching the pattern of other export routes.
- **Pagination loop**: call `getZohoPortalUsers({ page, per_page: 50 })` and increment page while `page_info?.has_next_page === true`. Or replicate the fetch inline as other export routes do.
- **`readFromZoho` does NOT exist for users** — read the file directly with `fs.readFileSync(path.join(process.cwd(), "_from_zoho", "users.json"), "utf-8")` and `JSON.parse`. The file is a flat array (same as milestones export output).
- **Role mapping** — inline `determineHubRole` logic from `src/app/(auth)/sync-zoho-role.ts:8-27`. Do NOT import from that file (it has `"use server"` and live Zoho API calls). Use the Zoho user object from the JSON file instead. Mapping:
  - admin: `(isNamedAdmin && roleName === "Administrator" && profileName === "Admin")` OR `(roleName === "Administrator" && profileName === "Manager")` OR `(roleName === "Manager" && profileName === "Portal Owner")`
  - pm: `(roleName === "Manager" && profileName === "Admin")` OR `(roleName === "Administrator" && profileName === "Admin" without name check)` OR `(roleName === "Manager" && profileName === "Manager")`
  - default: pending
- **Profiles role enum** does not include "pending": map `admin→"admin"`, `pm→"pm"`, `pending→"developer"` when writing to `profiles.role`.
- **Two-table update for existing users**: update `hub_users` (display_name, zoho_user_id) AND `profiles` (full_name, role) for the same user ID. Use the hub_users.id (= auth.users.id = profiles.id) as the FK.
- **New user creation**: use `adminClient.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name, display_name: full_name } })` — same pattern as `inviteUser` in `src/app/v2/(auth)/actions.ts:185`. After creation, update `profiles` with role + full_name (trigger creates the row with defaults).
- **Build an email → hub_users map** before the loop (one DB query, not per-row): `adminClient.from("hub_users").select("id, email, display_name, zoho_user_id, role")`. Map by `email.toLowerCase()`.
- **Skip users with no email** in the JSON file — push to errors.
- **Preserve approved roles** on existing users: if the current `hub_users.role` is in `{admin, pm, dev}` and the newly computed role would be `pending`, keep the existing role (same guard as `syncZohoRole`).
- **`anyRunning` lock** in the migrate page already prevents concurrent runs — no changes to lock logic needed.
- **Warning banner text** does not need to change — users are independent and can run at any order relative to the rest.
- **Export: users are independent** — no `projects.json` dependency. The export endpoint loops the Zoho portal users API directly with 100ms sleep between pages.

---

## File Changes

| File | Action | Notes |
|------|--------|-------|
| `src/app/api/admin/zoho-export/users/route.ts` | CREATE | Admin-only; loops Zoho portal users API with pagination; returns `users.json` |
| `src/app/api/admin/zoho-import/users/route.ts` | CREATE | Admin-only; reads `_from_zoho/users.json`; syncs/invites users; returns ImportResult |
| `src/app/v2/(hub)/admin/migrate/page.tsx` | MODIFY | Add "Users" to `EXPORT_LEVELS[0]` and `IMPORT_LEVELS[0]` |

---

## Code Context

### ZohoPortalUser type (src/lib/zoho/index.ts:151)
```ts
export type ZohoPortalUser = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  full_name: string;
  zuid: string;        // → hub_users.zoho_user_id
  status: string;
  user_type: string;
  is_confirmed: boolean;
  added_time: string;
  role: { id: string; name: string };             // .name: "Administrator" | "Manager" | etc.
  portal_profile: { id: string; name: string; is_default: boolean }; // .name: "Admin" | "Manager" | "Portal Owner" | etc.
  reporting_to?: { id: string; full_name: string; ... } | null;
};
```

### hub_users table row (src/types/database.ts:1878)
```ts
hub_users.Row = {
  id: string;          // = auth.users.id = profiles.id
  email: string;
  display_name: string | null;
  role: string;        // "admin" | "pm" | "developer" | "client" | "pending"
  zoho_user_id: string | null;
  created_at: string;
  updated_at: string;
};
```

### profiles table row (src/types/database.ts:497)
```ts
profiles.Row = {
  id: string;
  role: "admin" | "hr" | "pm" | "developer" | "client";  // no "pending"
  full_name: string | null;
  avatar_url: string | null;
  customer_id: string | null;
  created_at: string;
  updated_at: string;
};
```

### determineHubRole logic to inline (src/app/(auth)/sync-zoho-role.ts:8-27)
```ts
// Do NOT import this — inline it in the import route
function determineHubRole(user: ZohoUserFromJson): "admin" | "pm" | "pending" {
  const fn = user.first_name ?? "";
  const dn = user.full_name ?? "";
  const roleName = user.role?.name ?? "";
  const profileName = user.portal_profile?.name ?? "";

  const isNamedAdmin =
    dn.includes("WebriQ") || fn === "WebriQ" ||
    dn.includes("Eleazar") || fn === "Eleazar" ||
    dn.includes("Philippe") || dn.includes("Bodart") || fn === "Philippe";

  if (isNamedAdmin && roleName === "Administrator" && profileName === "Admin") return "admin";
  if (roleName === "Administrator" && profileName === "Manager") return "admin";
  if (roleName === "Manager" && profileName === "Portal Owner") return "admin";
  if (roleName === "Manager" && profileName === "Admin") return "pm";
  if (roleName === "Administrator" && profileName === "Admin") return "pm";
  if (roleName === "Manager" && profileName === "Manager") return "pm";
  return "pending";
}
// Map to profiles role: admin→"admin", pm→"pm", pending→"developer"
```

### inviteUser pattern to mirror (src/app/v2/(auth)/actions.ts:185)
```ts
const { data, error } = await adminClient.auth.admin.createUser({
  email,
  email_confirm: true,
  user_metadata: { full_name: fullName, display_name: fullName },
});
if (error) return { error: error.message };
if (data.user) {
  await adminClient.from("profiles").update({ role, full_name: fullName }).eq("id", data.user.id);
}
```

### Milestones export (mirror this pattern for users, src/app/api/admin/zoho-export/milestones/route.ts:1-54)
```ts
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken } from "@/lib/zoho";

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  const all: unknown[] = [];
  // For users: loop pages instead of looping projects
  // GET https://projectsapi.zoho.com/api/v3.1/portal/{portalId}/users?type=portal_user&view_type=active&page=1&per_page=50
  // Loop while page_info.has_next_page === true

  return new NextResponse(JSON.stringify(all, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": 'attachment; filename="users.json"',
    },
  });
}
```

### Migrate page EXPORT_LEVELS and IMPORT_LEVELS (src/app/v2/(hub)/admin/migrate/page.tsx:31-49)
```ts
// Current EXPORT_LEVELS[0] is "milestones" — insert "users" before it
const EXPORT_LEVELS = [
  { key: "users", label: "Users", desc: "All Zoho portal users — can run independently" },
  { key: "milestones", ... },
  ...
] as const;

// Current IMPORT_LEVELS[0] is "customers" — insert "users" before it
const IMPORT_LEVELS = [
  { key: "users", label: "Users", desc: "Syncs Zoho portal users to hub_users and profiles — can run independently" },
  { key: "customers", ... },
  ...
] as const;
```

### Generic handleExport and handleImport (src/app/v2/(hub)/admin/migrate/page.tsx:97, 258)
```ts
// handleExport(level) at line 97: fetch → blob → createObjectURL → a.click() — covers ALL export levels except "tasks"
// handleImport(level) at line 258: fetch POST → JSON → setImportStates — covers ALL import levels except "tasks"
// Adding "users" to the EXPORT_LEVELS/IMPORT_LEVELS arrays is sufficient — no new handler code needed
```

---

## Implementation Steps

1. **Create export endpoint** `src/app/api/admin/zoho-export/users/route.ts`:
   - Auth guard: `getUser()` + `adminClient.from("profiles").select("role")` → reject if not admin
   - Get Zoho token via `getZohoAccessToken()`
   - Loop pages: `page = 1`, fetch `https://projectsapi.zoho.com/api/v3.1/portal/${ZOHO_PORTAL_ID}/users?type=portal_user&view_type=active&page=${page}&per_page=50`, push users to `all[]`, check `json.page_info?.has_next_page`, sleep 100ms, increment page
   - Return `new NextResponse(JSON.stringify(all, null, 2), { headers: { "Content-Disposition": 'attachment; filename="users.json"' } })`

2. **Create import endpoint** `src/app/api/admin/zoho-import/users/route.ts`:
   - Auth guard (same pattern)
   - Read file: `JSON.parse(fs.readFileSync(path.join(process.cwd(), "_from_zoho", "users.json"), "utf-8"))` — result is a flat array
   - Pre-build email map: one query to `hub_users`, build `Map<email → { id, role, display_name, zoho_user_id }>`
   - Inline `determineHubRole` function
   - Loop users:
     - Skip if no email → push to errors
     - Compute hub role via `determineHubRole`, map to profiles role
     - If email in map: preserve approved role guard → `adminClient.from("hub_users").update({ display_name: full_name, zoho_user_id: zuid })` + `adminClient.from("profiles").update({ full_name, role: profilesRole })` → `result.updated++`
     - If not in map: `adminClient.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name, display_name: full_name } })` → on success update profiles with role + full_name → `result.imported++`; on error push to `result.errors`
   - Return `NextResponse.json({ imported, updated, skipped, errors })`

3. **Update migrate page** `src/app/v2/(hub)/admin/migrate/page.tsx`:
   - Prepend `{ key: "users", label: "Users", desc: "All Zoho portal users — can run independently" }` to `EXPORT_LEVELS` array
   - Prepend `{ key: "users", label: "Users", desc: "Syncs Zoho portal users to hub_users and profiles" }` to `IMPORT_LEVELS` array
   - No new handler code — `handleExport("users")` and `handleImport("users")` are called automatically by the existing render loops

---

## Acceptance Criteria

- [ ] `GET /api/admin/zoho-export/users` returns all portal users as `users.json` (auto-paginated)
- [ ] Non-admin requests to both endpoints return 403
- [ ] `POST /api/admin/zoho-import/users` reads `_from_zoho/users.json` and syncs existing users
- [ ] Existing user sync updates `hub_users.display_name`, `hub_users.zoho_user_id`, `profiles.full_name`, `profiles.role`
- [ ] Approved roles (`admin`, `pm`, `dev`) are never downgraded
- [ ] New users are created via `adminClient.auth.admin.createUser()` with correct role
- [ ] Migrate page shows "Users" row in both Export and Import sections
- [ ] Export and Import buttons trigger correctly via existing generic handlers
- [ ] Import returns `{ imported, updated, skipped, errors }` shape matching `ImportResult` type
