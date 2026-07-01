# Task 100 — Super Admin: RLS Policies + Application-Layer Access

> **Version Impact:** patch
> **Recommended Model:** sonnet
> **Investigation:** /understand ran before this spec. Findings embedded below.
> **Status:** TESTING
> **Completed:** 2026-07-01
> **Implementation Notes:** All 4 changes applied. (1) `048_super_admin_rls.sql` created — drops and recreates 30 RLS policies across profiles, projects, tasks, task_comments, attachments, time_logs, tickets, ticket_messages, event_bus, audit_logs, milestones, tasklists, and all 9 hr.* tables. (2) `dashboard-view.tsx` — super_admin now routes to AdminDashboard. (3) `projects/page.tsx` — canManageTags includes super_admin. (4) `[projectId]/page.tsx` — profiles in-list includes super_admin. TypeScript check clean. Migration must be applied to Supabase manually (Supabase dashboard or `supabase db push`).

## Goal

`super_admin` users can log in and see the correct sidebar (tasks 098/099 covered auth + API routes), but every data-access call returns empty or is denied because the Supabase RLS policies in migrations 026, 033, and 035 never included `super_admin`. Fix all RLS policies to grant `super_admin` full admin+PM parity, and apply matching fixes to three application-layer role checks that also exclude `super_admin`.

## Confirmed Behaviour (Screenshot)

A Super Admin user logged into `/v2/projects` sees the Projects page with sidebar nav — but the list shows "0 projects / No projects found." Same bug applies to tasks, HR tables, audit logs, and all other staff-gated tables.

## Requirements

- [ ] New migration `048_super_admin_rls.sql` — drop + recreate every RLS policy that excludes `super_admin`; covers all tables in migrations 026, 033, 035
- [ ] `super_admin` gets full write access everywhere `admin` has it (projects, tasks, attachments, task_comments, time_logs, event_bus, audit_logs, all `hr.*` tables, milestones, tasklists)
- [ ] `super_admin` can read everything `admin` or `pm` can read (profiles of other users, HR tables with PM read policies, etc.)
- [ ] `dashboard-view.tsx` — route `super_admin` to `<AdminDashboard>` instead of `<PMDashboard>` fallback
- [ ] `projects/page.tsx` — include `super_admin` in `canManageTags` check
- [ ] `projects/[projectId]/page.tsx` — include `"super_admin"` in the profiles `.in("role", [...])` query so Super Admin users appear as assignable team members
- [ ] No changes to the `super_admin`-only guard in `PATCH /api/v2/users/[userId]` (line 55) — that guard is intentional
- [ ] `customers` table is out of scope — already uses `using (true)` (open access to all authenticated users)

## File Changes

| File | Action | Change |
|------|--------|--------|
| `supabase/migrations/048_super_admin_rls.sql` | Create | Drop + recreate all policies that exclude `super_admin`; covers 026, 033, 035 tables |
| `src/app/v2/(hub)/dashboard/_components/dashboard-view.tsx` | Modify | Line 25: add `super_admin` branch before the PM fallback |
| `src/app/v2/(hub)/projects/page.tsx` | Modify | Line 29: add `role === "super_admin"` to `canManageTags` |
| `src/app/v2/(hub)/projects/[projectId]/page.tsx` | Modify | Line 43: add `"super_admin"` to profiles role in-list |

---

## Code Context

### dashboard-view.tsx (lines 21–29) — current broken routing

```tsx
export default function DashboardView({ role, displayName, userId }: DashboardViewProps) {
  if (role === "developer") {
    return <DevDashboard userId={userId} displayName={displayName} />;
  }
  if (role === "admin") {
    return <AdminDashboard userId={userId} displayName={displayName} />;  // super_admin misses this
  }
  return <PMDashboard displayName={displayName} />;  // super_admin falls here — wrong
}
```

Fix: add `|| role === "super_admin"` to the `admin` branch.

### projects/page.tsx (line 29) — broken canManageTags

```tsx
const canManageTags = role === "admin" || role === "pm";
// Fix: const canManageTags = role === "admin" || role === "pm" || role === "super_admin";
```

### projects/[projectId]/page.tsx (line 43) — super_admin excluded from assignees

```tsx
supabase.from("profiles").select("id, full_name, avatar_url")
  .in("role", ["developer", "pm", "admin"])
// Fix: .in("role", ["developer", "pm", "admin", "super_admin"])
```

### 026_rls_policies_v2.sql — policy pattern to follow (lines 76–96)

```sql
-- Staff read: add 'super_admin' to every in(...) that mentions 'admin'
create policy "projects_staff_read"
  on projects for select to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer', 'hr'));    -- add 'super_admin'

create policy "projects_pm_write"
  on projects for all to authenticated
  using (get_my_role() in ('admin', 'pm'))                        -- add 'super_admin'
  with check (get_my_role() in ('admin', 'pm'));                  -- add 'super_admin'
```

For standalone `= 'admin'` checks (profiles_admin_write, event_bus_admin_read, audit_logs_admin_read, task_comments_delete), convert to `in ('admin', 'super_admin')`.

---

## Notes for Implementation Agent

**Why sonnet:** Security-sensitive RLS changes across ~30 policies in 3 migration files, plus multi-table scope. High risk of silent data leaks if any policy is mis-structured.

**Migration approach — mandatory:** Postgres does NOT support `CREATE OR REPLACE POLICY`. The only valid pattern is:
```sql
drop policy if exists "policy_name" on table_name;
create policy "policy_name" on table_name for ... using (...);
```
For `hr.*` schema tables, qualify the table: `drop policy if exists "hr_employees_hr_admin_all" on hr.employees;`

**Complete list of policies to drop + recreate in `048_super_admin_rls.sql`:**

From `026_rls_policies_v2.sql`:
- `profiles`: `profiles_read_own` (change `= 'admin'` → `in ('admin', 'super_admin')`), `profiles_admin_write` (same)
- `projects`: `projects_staff_read`, `projects_pm_write`
- `tasks`: `tasks_staff_read`, `tasks_pm_write`
- `task_comments`: `task_comments_staff_read`, `task_comments_staff_insert`, `task_comments_delete` (change `= 'admin'` → `in ('admin', 'super_admin')`)
- `attachments`: `attachments_staff_read`, `attachments_pm_write`
- `time_logs`: `time_logs_manager_read`
- `tickets`: `tickets_staff_all`
- `ticket_messages`: `ticket_messages_staff_all`
- `event_bus`: `event_bus_staff_insert`, `event_bus_admin_read` (change `= 'admin'` → `in ('admin', 'super_admin')`)
- `audit_logs`: `audit_logs_admin_read` (change `= 'admin'` → `in ('admin', 'super_admin')`)
- `hr.employees`: `hr_employees_hr_admin_all`, `hr_employees_pm_read` (add `'super_admin'` to `= 'pm'`)
- `hr.attendance_punches`: `hr_attendance_punches_hr_admin`
- `hr.attendance_days`: `hr_attendance_days_hr_admin`, `hr_attendance_days_pm_read` (add `'super_admin'`)
- `hr.leave_types`: `hr_leave_types_staff_read`, `hr_leave_types_hr_admin_write`
- `hr.leave_balances`: `hr_leave_balances_hr_admin`
- `hr.leave_requests`: `hr_leave_requests_hr_admin`, `hr_leave_requests_pm_read`
- `hr.timesheets`: `hr_timesheets_hr_admin`, `hr_timesheets_pm_read`
- `hr.announcements`: `hr_announcements_staff_read`, `hr_announcements_hr_admin_write`
- `hr.hr_requests`: `hr_requests_hr_admin`

From `033_milestones.sql`:
- `milestones`: `milestones_staff_read`, `milestones_pm_write`

From `035_zoho_decommission_schema.sql`:
- `tasklists`: `tasklists_staff_read`, `tasklists_pm_write`

**`profiles_read_own` special case:** Current policy is `using (auth.uid() = id or get_my_role() = 'admin')`. The `= 'admin'` check there is what lets admins read other users' profiles. Change to `in ('admin', 'super_admin')` so super_admin can also read all profiles.

**`task_comments_delete` special case:** Current policy is `using (get_my_role() = 'admin' or author_id = auth.uid())`. Change to `using (get_my_role() in ('admin', 'super_admin') or author_id = auth.uid())`.

**For PM-only read policies** (`hr_employees_pm_read`, `hr_attendance_days_pm_read`, `hr_leave_requests_pm_read`, `hr_timesheets_pm_read`): these currently use `= 'pm'`. Super admin should have at least PM read access, so change each to `in ('pm', 'super_admin')`.

**Do NOT change:**
- `notifications_own`, `notification_preferences_own`, `push_subscriptions_own` — these are user-scoped by `auth.uid()`, not role. Super admin sees their own notifications only (correct behavior).
- Developer-only policies (`tasks_developer_update`, `time_logs_developer_own`, `hr_attendance_punches_developer_own`, etc.) — super admin is not a developer and should never have developer-scoped-row access via these policies. Super admin write access is covered by the admin-parity policies.
- `profiles_update_own` — any user can update their own profile; this is correct.
- `tickets_client_read`, `tickets_client_insert`, `ticket_messages_client_*` — client-only policies; no change needed.
- `customers` table — already `using (true)` for all authenticated users.

**Application-layer pattern to follow (from sidebar, already correct):**
```tsx
// v2-hub-sidebar.tsx:29 — the validated isAdmin pattern
const isAdmin = role === "admin" || role === "super_admin";
```
Mirror this exact pattern for `canManageTags` and the dashboard routing.

**Verify after:** TypeScript check (`npx tsc --noEmit`) should pass since only SQL and simple boolean expressions change. The migration must be applied manually via the Supabase dashboard or `supabase db push` — this is not auto-applied.
