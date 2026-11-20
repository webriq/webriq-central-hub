# 492: Tasks and Tickets listings time out (57014): make the read RLS checks run once per query, and index `created_at`

**Created:** 2026-11-20
**Priority:** HIGH
**Type:** bugfix (performance, RLS migration)
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

Quick Links › **Tasks** (`/dashboard/tasks`) shows "0 tasks / No tasks yet" for a PM or admin. The listing query fails with Postgres **`57014 canceling statement due to statement timeout`**. Task 491's new error state made this visible; before that, the page swallowed the error.

- **Found:** 2026-11-20, while testing task 491 (dev server log `[dashboard/tasks] listing query failed: 57014`).
- **Not caused by 491's filters.** With no filter params, `applyListFilters()` adds no predicates, so the query is exactly what task 385 shipped:

```
tasks?select=…,projects(…)&kind=eq.task&order=created_at.desc&offset=0&limit=20   (Prefer: count=exact)
```

### Likely cause (to confirm in step 1)

`count=exact` plus `ORDER BY created_at` makes Postgres check the row-security rules on **every** row of `tasks`, not just the 20 returned. Every rule that applies to a SELECT calls a `SECURITY DEFINER` SQL function, and each call is its own `profiles` / `projects` lookup per row:

| Policy (on `tasks`) | Kind | Per-row work |
|---|---|---|
| `tasks_staff_read` (048) | permissive SELECT | `get_my_role()`, a `profiles` lookup |
| `tasks_pm_write` (048) | permissive ALL (also applies to SELECT) | `get_my_role()` |
| `tasks_checklist_marketing_read` / `_write` (163) | permissive | `get_my_role()` |
| `tasks_test_hidden` (181, if applied) | **restrictive** SELECT | `get_my_is_test_user()` + `is_test_project(project_id)`, a `projects` lookup |
| `tasks_test_user_all` (181, if applied) | permissive ALL | `get_my_is_test_user()` |

There's also no index on `tasks.created_at`, so the sort reads the whole filtered table. `tickets` has the same shape: `tickets_test_hidden`, `tickets_test_user_all`, the staff read/write policies from 051 (renamed by 147), and `tickets_client_read`. Its listing (`/desk/tickets`) runs three counted queries per load.

The standard Supabase fix is to wrap each function call as `(select fn())`. Postgres then evaluates it **once per query** (an InitPlan) instead of once per row. `is_test_project(project_id)` depends on the row, so it can't be wrapped. It's replaced by a once-per-query array of test project ids.

`TASKS.md` lists migration 181 as "not applied", but that may be out of date. Step 1 establishes what's live, and the migration must work either way.

## Requirements

- [ ] **Step 1, confirm (operator).** Before writing SQL, the user runs the diagnostics in [Verification › Before](#before-operator-supabase-sql-editor) in the Supabase SQL editor and pastes the output into this doc under `Diagnosis`:
  - `pg_policies` for `tasks` / `tickets`
  - whether the 181 functions exist
  - row counts
  - `EXPLAIN (ANALYZE, BUFFERS)` of the listing query as a PM

  If the plan doesn't show per-row function calls / a full-table sort dominating, **stop and re-plan** with the evidence.
- [ ] **Migration `supabase/migrations/187_tasks_tickets_rls_initplan.sql`** (written, not applied):
  1. A new helper, `public.my_test_project_ids()`: `returns uuid[]`, `language sql stable security definer`, `set search_path = public`, `select coalesce(array_agg(id), '{}') from projects where is_test`. Created only when `projects.is_test` exists (guarded `DO` block), so the migration still applies before 181.
  2. Rewrite the `USING` / `WITH CHECK` of **every** policy on `tasks` and `tickets` so each `get_my_role()`, `get_my_customer_id()` and `get_my_is_test_user()` call becomes `(select …())`, with `ALTER POLICY` (no drop/recreate, so names, roles, commands and permissive/restrictive stay identical).
     - Write the new expressions out explicitly per policy, from the step-1 `pg_policies` output. Don't regex-rewrite `pg_policies.qual` at apply time: a reviewed literal is safer for security policy text.
  3. `tasks_test_hidden` → `using (project_id is null or (select get_my_is_test_user()) or project_id <> all ((select my_test_project_ids())))`.
     `tickets_test_hidden` → `using ((select get_my_is_test_user()) or project_id <> all ((select my_test_project_ids())))`.
     Only when those policies exist (guarded).
  4. Indexes: `create index if not exists tasks_created_at_idx on tasks (created_at desc)` and `tickets_created_at_idx on tickets (created_at desc)`.
  5. Same access before and after: no role gains or loses a row. Rationale comment per policy.
- [ ] **Rollback script** `supabase/manual/187_rollback_tasks_tickets_rls_initplan.sql`: restores each policy's original expression verbatim, drops the two indexes and the helper.
- [ ] **PGlite check** `_docs/task/492-rls-initplan.sql-check.mjs`, same pattern as `489-inbox-soft-delete.sql-check.mjs` / `490-inbox-unread.sql-check.mjs`.
  - Seed: minimal `profiles` / `projects` / `tasks` / `tickets` + the 181 objects, roles admin / pm / developer / client / marketing / test user, one normal and one test project.
  - Apply 187, then assert that each role's visible task and ticket ids are **identical** before and after.
  - Assert the migration also applies cleanly on a schema **without** 181, and is idempotent (applies twice).
- [ ] No application code change is required. The Tasks error state added during 491 stays as is.

## Out of Scope / Must-Not-Change

- **Who can see what must not change.** This is a performance change only. Any visibility difference in the PGlite check is a blocker.
- `get_my_role()` / `get_my_is_test_user()` / `is_test_project()` definitions stay as they are (other tables' policies use them).
- Policies on other tables (`projects`, `customers`, `task_comments`, …) are not touched. If step 1 shows `projects` RLS dominating the embedded `projects(…)` join, record it as a follow-up; don't fix it here.
- No switch to `count: "estimated"` / `"planned"`: the pagination "x–y of N" must stay exact.
- No change to task 491's filter code or UI.
- The Desk Inbox `GET /api/desk/inbox/unread` 500 seen in the same log is task 490's (migration 186 not applied, and its degrade path returns 500 with an empty error message). Separate; see Compatibility Touchpoints.
- Never run git commands. Never apply migrations; the user applies them.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/187_tasks_tickets_rls_initplan.sql` | Create | Helper, `ALTER POLICY` rewrites (guarded), `created_at` indexes |
| `supabase/manual/187_rollback_tasks_tickets_rls_initplan.sql` | Create | Verbatim restore of the original policy expressions + drop the indexes and helper |
| `_docs/task/492-rls-initplan.sql-check.mjs` | Create | PGlite: per-role visibility unchanged, applies with and without 181, idempotent |
| `_docs/task/492-tasks-tickets-rls-select-performance.md` | Modify | `Diagnosis` section filled from step 1 |

## Code Context

### The functions, all `language sql stable security definer`

```sql
-- 026
create or replace function public.get_my_role() returns text … as $$ select role from public.profiles where id = auth.uid() $$;
-- 181
create or replace function public.get_my_is_test_user() returns boolean … as $$ select coalesce((select is_test_user from public.profiles where id = auth.uid()), false) $$;
create or replace function public.is_test_project(p_project_id uuid) returns boolean … as $$ select coalesce((select is_test from public.projects where id = p_project_id), false) $$;
```

`SECURITY DEFINER` functions are never inlined, so in a policy each call runs per row unless it's wrapped as a scalar subquery `(select f())`. The wrapped form becomes an InitPlan evaluated once per statement.

### The restrictive policies from 181

```sql
create policy tasks_test_hidden on tasks as restrictive for select to authenticated
  using (project_id is null or get_my_is_test_user() or not is_test_project(project_id));
create policy tickets_test_hidden on tickets as restrictive for select to authenticated
  using (get_my_is_test_user() or not is_test_project(project_id));
```

**Why the array must come from a `SECURITY DEFINER` helper, not an inline subquery on `projects`:** an inline `select id from projects where is_test` inside the policy would itself be filtered by `projects_test_hidden`. For a non-test user that returns an empty set, and the test tasks would become visible. `my_test_project_ids()` must bypass RLS, exactly as `is_test_project()` does today.

The semantics are equal: `not is_test_project(pid)` ⇔ pid not in the test set ⇔ `pid <> all(test_ids)`. Both are true for an empty set. For `tickets`, `project_id` is NOT NULL. For `tasks` the `project_id is null` branch is kept.

### Staff read/write policies (048 / 051, as renamed by 147)

```sql
create policy "tasks_staff_read" on tasks for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));
create policy "tasks_pm_write" on tasks for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));
```

The migration file history after 147's rename is not reliable for `tickets` (and some policies may have been edited in the dashboard). That's why step 1's live `pg_policies` output, not the migration files, is the source for the exact policy list and expressions.

### Pattern to copy for guarded DDL

`186_inbox_unread.sql` / `185_inbox_soft_delete.sql` are "written, not applied" migrations with PGlite check scripts. Reuse their check-script harness.

## Implementation Steps

1. User runs the "Before" diagnostics and pastes the output. Record it under `## Diagnosis`. Confirm the cause or re-plan.
2. Write `187_…sql`:
   - helper (guarded on `projects.is_test`)
   - one `ALTER POLICY … USING (…) [WITH CHECK (…)]` per live policy, each in a `DO` block guarded by `exists (select 1 from pg_policies where tablename = … and policyname = …)`
   - the two indexes
3. Write the rollback script from the step-1 expressions, verbatim.
4. Write and run the PGlite check: visibility identical per role, with and without 181, idempotent.
5. Hand off. The user applies 187 and runs the "After" diagnostics. Record before/after timings.

## Acceptance Criteria

- [ ] After 187 is applied, `/dashboard/tasks` loads for a PM/admin with no filters and shows the newest 20 tasks and the correct total, well under the statement timeout.
- [ ] `/desk/tickets` loads with its three counts.
- [ ] `EXPLAIN ANALYZE` after shows `InitPlan`s for the role/test-user/test-project checks, and no per-row SubPlan or function scan on `profiles` / `projects`.
- [ ] The PGlite check passes: identical visible rows per role (admin, super_admin, pm, developer, client, marketing, test user) for `tasks` and `tickets`, before and after.
- [ ] Test data stays hidden from non-test users, admins included (task 476 D-rules), and fully visible to test users.
- [ ] The migration applies on a database without 181 and when applied twice. The rollback restores the original policies exactly.
- [ ] Task 491's filters work on top (due/assignee/project) with no timeout.

## Verification

### Before (operator, Supabase SQL editor)

```sql
-- 1. live policies
select tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies where tablename in ('tasks','tickets') order by 1,2;

-- 2. is 181 live? row counts
select to_regprocedure('public.is_test_project(uuid)') is not null as has_181,
       (select count(*) from tasks) as tasks_rows,
       (select count(*) from tickets) as tickets_rows;

-- 3. the listing as a PM (replace the uuid with a real pm profile id)
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"<PM_PROFILE_UUID>","role":"authenticated"}', true);
explain (analyze, buffers)
select id, title, display_id, status, priority, assignees, due_date, created_at, count(*) over () as total
from tasks where kind = 'task' order by created_at desc limit 20;
rollback;
```

### After

The same three queries after applying 187. Expect InitPlans and a large drop in execution time. Then the browser: `/dashboard/tasks` and `/desk/tickets` with no filters and with each 491 filter.

### Local

```bash
node _docs/task/492-rls-initplan.sql-check.mjs
```

## Compatibility Touchpoints

- **Landing order:** apply 187 **after** 181 if both are pending. Before 181 it still applies (its 181 parts are skipped), but then it must be **re-run after 181**, since 181 recreates `tasks_test_hidden` / `tickets_test_hidden` with per-row calls. Note this in 181's and 476's docs.
- **Task 430** (work-breakdown rename) and **423 / 429 / 431** touch `tasks` columns, not these policies. No conflict.
- **Task 490 (separate):** the same dev log shows `GET /api/desk/inbox/unread` → 500 with an empty `count failed:` message. Its plan says it should degrade on `42703` when migration 186 isn't applied. That's a 490 test finding, to raise on 490, not here.
- **CLAUDE.md:** consider adding one line under RLS helpers once this lands: "wrap helper calls as `(select get_my_role())` in policies". Decide in the document stage.

## Implementation Notes

### What Changed
- **Migration 187** (`supabase/migrations/187_tasks_tickets_rls_initplan.sql`, written, not applied):
  - `public.my_test_project_ids()` → `uuid[]`: SQL, stable, SECURITY DEFINER, `search_path = public`. Created only when `projects.is_test` exists. EXECUTE revoked from public/anon and granted to authenticated.
  - **18 policy rewrites** with `ALTER POLICY`, each through `pg_temp.rls492_swap`:
    - 12 on `tasks`: staff_read, pm_write, developer_insert/update/delete, checklist_write_insert/update/delete, checklist_marketing_read/write, test_hidden, test_user_all.
    - 6 on `tickets`: staff_read, pm_write, developer_update/delete, test_hidden, test_user_all.
    - `get_my_role()`, `get_my_is_test_user()` and `auth.uid()` become `(select …())`, evaluated once per statement as an InitPlan.
    - `is_test_project(project_id)` becomes `project_id = any ((select my_test_project_ids())::uuid[])`, and `not is_test_project(...)` becomes `project_id <> all (…)`.
  - Indexes `tasks_created_at_idx` / `tickets_created_at_idx` on `(created_at desc)`.
- **The guard (`rls492_swap`)**, which replaces "write SQL from the step-1 `pg_policies` dump":
  - For each policy it creates the reviewed original and the target expression as probe policies on a temp `LIKE` copy of the table. That way Postgres deparses both exactly as it deparses the live policy.
  - It rewrites **only** when the live expression equals the reviewed original. If it already equals the target, it's left alone (idempotent).
  - Anything else (missing, or edited in the dashboard) is **skipped with a `NOTICE`** that prints the live expression. Names, commands, roles and permissive/restrictive are never touched.
- **Rollback** (`supabase/manual/187_rollback_tasks_tickets_rls_initplan.sql`) is generated from 187's own swap list with from/to reversed, through the same guard. It then drops both indexes and the helper. The helper drop fails rather than cascading if any policy still uses it.

### Files Changed
- `supabase/migrations/187_tasks_tickets_rls_initplan.sql` — new
- `supabase/manual/187_rollback_tasks_tickets_rls_initplan.sql` — new, generated from 187
- `_docs/task/492-rls-initplan.sql-check.mjs` — new PGlite check

### Deviations From Plan
- **Medium: step 1 (operator diagnostics) did not happen before the SQL was written.**
  - The plan wanted the live `pg_policies` output to supply the exact expressions. Instead, the expected originals come from the migration history (026 → 048 / 051 / 092 / 100 → 132 / 111 / 147 renames / 163 / 181), and the guard makes that safe: a policy whose live text differs is skipped and reported, never overwritten.
  - **Still do the "Before" diagnostics before applying.** They confirm the cause (EXPLAIN) and show in advance whether any policy will be skipped.
  - After applying, read the `NOTICE`s. Every `SKIPPED` line is a policy that still runs per row and needs a follow-up.
- **Minor: `tickets_test_hidden` gains an explicit `project_id is null or` branch.** Without it, `null <> all({…})` is null where the original `not is_test_project(null)` is true. `tickets.project_id` is NOT NULL today, so this only keeps the semantics exactly equal.
- **Minor: the array is cast (`(select my_test_project_ids())::uuid[]`).** Without the cast, Postgres parses `<> all ((select …))` as a subquery comparison (`uuid <> uuid[]`, error 42883). Caught by the PGlite run.
- **Minor: `auth.uid()` is wrapped too** (developer write policies). It's the same per-row lookup class, and the same once-per-statement fix.
- **Minor: the `my_test_project_ids()` RPC is callable by any authenticated user** via PostgREST, so it lists test project UUIDs. That's the same exposure class as the existing `is_test_project(uuid)` RPC. Anon is excluded.

### Verification Run
- `node _docs/task/492-rls-initplan.sql-check.mjs <187> <rollback>` (PGlite 0.2.17, in scratchpad) — **PASS**. Both scenarios, without and with 181 (14 and 18 policies):
  - Every helper call is wrapped. Policy names, commands, permissive/restrictive and roles are unchanged.
  - The rows each role can **SELECT / UPDATE / DELETE** on tasks and tickets are identical before and after. Roles: admin, super_admin, pm, developer, client, marketing, test pm, test developer.
  - The fixture's sanity asserts hold: the client sees nothing, marketing sees checklist rows only, the admin never sees test rows, and test users do.
  - Re-running 187 is a no-op.
  - The PM listing's plan shows `InitPlan` and no `SubPlan`.
  - Rollback restores the exact original `pg_policies` expressions and visibility, and drops the helper and indexes.
  - A policy edited outside migrations is skipped while the rest are rewritten.
- `npx tsc --noEmit` / eslint — SKIPPED. No TypeScript changes.
- **Pending (operator / test stage):** "Before" diagnostics → apply 187 → read the NOTICEs → "After" EXPLAIN → `/dashboard/tasks` and `/desk/tickets` load with no filters and with each 491 filter.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Files reviewed: `supabase/migrations/187_tasks_tickets_rls_initplan.sql`, `supabase/manual/187_rollback_tasks_tickets_rls_initplan.sql`, `_docs/task/492-rls-initplan.sql-check.mjs`. I took the file list from Implementation Notes, not `git diff`, because CLAUDE.md forbids git commands.
- **Security definer helper:**
  - It pins `search_path = public` and fully qualifies `public.projects`.
  - EXECUTE is revoked from public/anon and granted only to authenticated.
  - It bypasses RLS on purpose, and the header documents why: an inline subquery would be filtered by `projects_test_hidden` and expose test rows.
- **Swap guard:**
  - Only identifiers go through `format('%I')`. Expressions are literal SQL from this file, never user input.
  - Probe policies sit on a session temp `LIKE` copy (structure only, no data), are dropped after each use, and the temp tables and function are dropped at the end.
  - A probe `create policy` error aborts the whole migration in its transaction. Nothing is half-applied.
- **Rollback can't drift:** it's generated from 187's swap list. I regenerated it after the `::uuid[]` fix and checked that both files carry the cast (7 uses in 187, mirrored in the rollback).
- **No dead code:**
  - Every swap argument is either used or `null` by design, because the command takes no USING (INSERT) or no WITH CHECK (SELECT/DELETE).
  - The check script's sanity asserts make sure "unchanged access" isn't vacuously true.
- **Migration placement:** it can't legitimately abort on a valid schema (guards are notices, not exceptions), so `supabase/migrations/` is right, not `supabase/manual/`. The rollback is an operator script, in `supabase/manual/`.

### Deviations
- **Medium (accepted): SQL was written before the step-1 operator diagnostics.** The guarded swap makes that safe. The diagnostics stay a required **pre-apply** step, and the reasons are in Implementation Notes.
- **Minor:**
  - the `project_id is null` branch on `tickets_test_hidden` (exact semantic equivalence);
  - the `::uuid[]` cast (a parser requirement);
  - the `auth.uid()` wrapping;
  - the `my_test_project_ids()` RPC exposure, which is the same class as the existing `is_test_project()`.

### Operator notes for `test`
- **NOTICEs may not show,** depending on how 187 is applied (e.g. `supabase db push` may not print them). After applying, run this. It must return **0 rows**; any row is a skipped policy that still runs per row:
  ```sql
  select tablename, policyname, qual, with_check from pg_policies
  where tablename in ('tasks','tickets')
    and regexp_replace(coalesce(qual,'') || ' ' || coalesce(with_check,''), '\(\s*SELECT [a-z_.]+\(\)[^)]*\)', '', 'gi')
        ~ '(get_my_role|get_my_is_test_user|is_test_project|auth\.uid)\(';
  ```
- The two `create index` statements are not `concurrently` (migrations run in a transaction). They briefly block writes to `tasks`/`tickets` while they build. Apply outside busy hours if the tables are large.
- If 181 is applied after 187, re-run 187. The query above will show the four 181 policies until then.

### Required Fixes
- None.
