# 476: Settings page — mark existing users, companies and projects as Test

**Created:** 2026-11-16 · **Revised:** 2026-11-16 (rev 4: Settings UI simplified to label + chip box per setting)
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep (RLS changes on core tables, app-level access gates across many routes)
**Status:** Testing (rev 4)

---

## Revision history

- **rev 1 (superseded):** Settings *created* Test Users (email + temp password), Test Companies and Test
  Projects. It was implemented and passed the quality gate, but the user clarified that this was the
  wrong feature:
  > "instead of creating new test users, new company or new project, it is more like setting an existing
  > user as test account, he will able to view and manage test customer/company and test projects. No need
  > to create new data. The user, customer, and project creation still on their own management pages. the
  > settings only add them as."
- **rev 2 (this doc):** Settings only **flags** existing records. See "Rework of rev 1 code" for what
  happens to the code already in the working tree.
- **rev 3:** the user narrowed visibility and added an exclusion rule:
  > "only the test users can view the test projects and test customers. Other users will not be able to see
  > them. Also they are not included on the dashboard overview as well as on the analytics if any for metrics
  > or overall statuses"
  Admins no longer see test records on normal pages (they still manage the flags in Settings). Test data is
  left out of every dashboard, metric and status view, for everyone.

## Overview

`/dashboard/settings` gets two sections:

1. **Test Users** (Super Admin / Admin): search existing users, switch **Test User** on/off, and change
   their role.
2. **Test Data** (Super Admin / Admin / Test Users): search existing customers and projects, and switch
   **Test** on/off.

Once flagged:
- Test companies and projects show in the normal Customers and Projects pages with a "Test" pill, but
  **only to Test Users**. Everyone else, admins included, doesn't see them there. Admins see them only in
  Settings, so they can unflag a record.
- Test data never counts toward the dashboard overview, metrics, KPIs, status reports or charts, for anyone,
  Test Users included. Time logged on test projects isn't counted in hours metrics either.
- A Test User gets **full view and edit access to every test company and test project**, including its
  tasks, tickets, phases and deliverables, whatever their role or project membership. A Developer test
  user can manage a test project like a PM.

Creating users, customers and projects stays on their own pages (`/dashboard/users`, `/customers`,
`/projects/new`).

## Decisions (RESOLVED 2026-11-16 via AskUserQuestion)

- **D1 (rev 2) Flag existing records, create nothing.** `profiles.is_test_user`, `customers.is_test`,
  `projects.is_test`.
- **D2 (rev 3, replaces rev 2) Visibility:** normal pages show test records **only to Test Users**. Admins
  see them only in Settings (flag management). An admin who wants to work in test data flags themselves as a
  Test User.
- **D8 (rev 3) Dashboards and metrics exclude test data for everyone**, Test Users included: dashboard
  overview (admin/PM/marketing/developer), `/api/metrics` (`vw_hub_metrics`), KPI counts, status reports,
  charts, digest.
  **Amended 2026-11-17 (user request):** the status report (`/api/onboarding/projects/status-report`) now
  *includes* test projects for Test Users (also exempting them from the pm/marketing membership gate on
  test projects); non-test users still never see them.
- **D9 (rev 3) Time logs on test projects:** excluded from hours metrics (weekly-hours chart, dashboard
  totals, cost reports). The Test User still sees their own entries on the Time Logs page.
- **D3 (rev 2) Who flags companies and projects:** admins and Test Users. Only admins flag *users*.
  Accepted risk: a Test User could flag a real customer, which hides it from all other staff and from the
  dashboards. Admins can still find it in Settings and unflag it.
- **D4 (rev 2) Access:** Test Users get full access to all test data, regardless of role or membership.

## Open Decisions

- **NON-BLOCKING D5: does flagging a company cascade to its projects?** Default: **yes**. Flagging a
  company flags all its projects, and unflagging unflags them. A project can still be flagged on its own
  under a real company. That mixed case hides the project but not the company.
- **NON-BLOCKING D6: which child tables get the hide rule?** Default: `customers`, `projects`, `tasks`,
  `issues`. These are the ones with cross-project listings (`/dashboard/tasks`, Desk tickets, dashboards).
  Phases and deliverables are only reached through their project page, which is already hidden.
- **NON-BLOCKING D7: should test data be excluded from LLM pipelines and Zoho/Cliq pushes?** Default:
  out of scope. No change.

## Requirements

- [ ] **Settings → Test Users** (admin/super_admin only): searchable list of existing users (from
      `GET /api/v2/users`). Each row has a Test User toggle and the role select. The role select uses the
      existing `PATCH /api/v2/users/[userId]` and keeps its super_admin and department rules.
- [ ] **Settings → Test Data** (admin/super_admin or Test User): two searchable lists, customers and
      projects, each with a Test toggle (+ "Test" pill). Filter: All / Test only.
- [ ] **Searchable, easy-to-configure Settings UI (rev 3, user request: "Ensure the fields on the settings
      are searchable for easy configuration and UI/UX design"):**
      - **Every list has a search box** at the top, debounced 300 ms, with a clear (×) button and `aria-label`.
        - Users: name, email, role, department.
        - Customers: company name, `customer_id`, contact name/email.
        - Projects: name, `project_id` display ID, company name, classification.
      - **Search runs on the server** (`ilike`, special characters escaped like `escapeLike()` in
        `src/lib/stackshift-support/like.ts`), with pages of 25 and "Load more". Never pull every row to the client.
      - **Filter chips** next to search: `All · Test only · Not test`, plus Role (users) and Classification (projects).
        The active filter and query live in the URL (`?tab=&q=&filter=`) so a view can be shared and survives reload.
      - **Tabs** for Test Users / Test Companies / Test Projects. A Test User who isn't an admin sees only the two data tabs.
      - **Rows:** primary text plus a muted secondary line (email or `customer_id`/`project_id` + company), the
        "Test" pill when flagged, and a **switch** (`role="switch"`, `aria-checked`, keyboard Space/Enter,
        visible focus ring) for the flag. The users tab also has the role select.
      - **Toggling:** optimistic update, spinner on the row while saving, revert + inline error on failure,
        and a sonner toast with **Undo** on success.
      - **Customer toggle with cascade (D5):** before saving, a confirm line shows "Also marks N projects as test".
        Use an inline confirm, not a browser `confirm()` dialog.
      - **Counts:** each tab label shows its flagged count ("Test Projects · 3"), and each list shows
        "Showing 25 of 140".
      - **States:** skeleton rows while loading; empty state (icon + one line + action to clear the search/filter);
        "No matches for 'x'" with a clear-search action; the migration banner.
      - **Styling:** follow `DESIGN.md` v2.0 tokens (navy/blue, `line` borders, ink/body/muted text) and the users
        page card style; lucide icons; hand-rolled `rounded-full` pills; usable at phone width.
        Run the `impeccable` design pass on the finished page.
      - Reuse `src/app/(hub)/dashboard/timelogs/_searchable-select.tsx` for the role/classification pickers
        where it fits, instead of writing a new combobox.
- [ ] Only the service role can change `is_test_user` (existing guard trigger). Flag changes go through
      Settings APIs that check the gate first.
- [ ] **Hiding (RLS, restrictive SELECT):** a row with `is_test = true` (customers, projects) or on a
      test project (tasks, issues) is visible only when `get_my_is_test_user()`. **Admins are not exempt.**
      Because this is in RLS, every session-client read for non-test users is covered with no per-page filters.
- [ ] **Settings lists for admins** read flagged rows with `adminClient` after the admin gate. RLS hides them
      from admins, so this is a documented `adminClient` read exception (flag management only). Record it in
      CLAUDE.md "Do Not".
- [ ] **Dashboard and metrics exclusion (D8):** a shared `excludingTestData(query)` helper (same pattern as
      `excludingChecklist()`) adds `is_test = false`, or `project_id not in test projects`, to every
      dashboard, metric and status query. This matters for Test Users (RLS lets them see test rows) and for
      `adminClient` reads (RLS doesn't apply). Inventory (found while planning rev 3; the implementer completes it):
      - `src/app/(hub)/dashboard/_components/pm-dashboard.tsx`: customers count, `project_deliverables`, `/api/onboarding/projects`
      - `src/app/(hub)/dashboard/_components/admin-dashboard.tsx` (renders the PM dashboard) and `marketing-dashboard.tsx`: customers, projects
      - `src/app/(hub)/dashboard/_dev/_load-dev-dashboard.ts`: customers, projects, tasks, time_logs (uses `adminClient`)
      - `src/app/api/onboarding/projects/route.ts` GET (dashboard + portfolio source) and `.../status-report/route.ts`
      - `src/app/api/metrics/route.ts` → view `vw_hub_metrics` (`018_metrics_view.sql`). Views run as owner and
        bypass RLS, so **recreate the view in 181** with `is_test` excluded
      - `weekly-hours-chart.tsx`, `classification-pulse-chart.tsx`: trace their data source and exclude
      - `src/lib/ai/digest.ts` (`adminClient`, "overall status" summaries)
      - Check that `/api/onboarding/projects` isn't also the Test User's way into their test projects
        (portfolio tracker). If it is, exclude only on the dashboard and status callers, through a param
        or a separate loader.
- [ ] **Time logs (D9):** hours aggregations (weekly-hours chart, dashboard totals, dev dashboard "logged
      today", cost reports) skip entries whose project is a test project. Per-user Time Logs listing is unchanged.
- [ ] **Test User access (RLS, permissive):** Test Users get SELECT + write on test customers and test
      projects, and on rows of `tasks`, `issues`, `project_phases`, `project_deliverables`,
      `project_members`, `task_comments` / issue comments that belong to a test project. The existing
      restrictive policies (e.g. 163's checklist rules) still apply.
- [ ] **Test User access (app level):** routes and pages that gate by role (see the inventory below)
      treat a Test User on a test project as `pm` for that request, through one helper. Nowhere else.
- [ ] "Test" pill on test rows in the Customers index, the classification project listing and the
      project header.
- [ ] Code degrades without the migration (existing `testFlagsApplied()` probe): Settings shows the
      banner, and the rest of the app behaves as today.

## Out of scope / must not change

- Creating users, customers or projects (stays on their own pages).
- `/dashboard/users` page and the invite flow.
- Any change to access for **non-test** records or **non-test** users. That's the main no-regression rule.
- LLM pipelines, Zoho/Cliq/StackShift sync (D7).
- `adminClient` reads that aren't dashboards or metrics (MCP tools, crons, ops chat): RLS doesn't apply to
  them, so they still see test data. Known gap. The digest **is** in scope (D8).

## Proposed file changes

| File | Change |
|------|--------|
| `supabase/migrations/181_test_users_and_test_data.sql` | **Rewrite** (not applied yet; confirmed `db push` failed): keep the 3 columns + `is_test_user` guard trigger; add `get_my_is_test_user()` (SECURITY DEFINER, same style as `get_my_role()`) and `is_test_project(uuid)`; restrictive SELECT policies (D6); permissive test-user policies (D4); D5 cascade trigger on `customers.is_test` |
| `src/lib/test-data.ts` | keep probe + viewer; add `effectiveProjectRole(viewer, project)` → `"pm"` for a Test User on a test project, else the real role |
| `src/app/api/v2/settings/test-users/route.ts` | **replace** create with `PATCH { userId, isTestUser }` (admin only). GET is no longer needed: the list comes from `/api/v2/users` + flag |
| `src/app/api/v2/settings/test-data/route.ts` | **replace** create with `GET ?q=&testOnly=` (customers + projects search) and `PATCH { kind, id, isTest }` (admin or Test User) |
| `src/app/api/v2/users/route.ts` | add `is_test_user` to the profiles select (only when the probe passes) |
| `src/app/(hub)/dashboard/settings/_test-users.tsx`, `_test-data.tsx`, `page.tsx` | rework to toggle lists |
| Role-gated routes/pages from the inventory | swap the inline role check for `effectiveProjectRole()` where the record is a project or its child |
| `src/app/(hub)/customers/page.tsx`, `src/app/api/customers/route.ts`, `src/app/api/v2/projects/route.ts` | **remove** the rev 1 `.eq("is_test", false)` filters (RLS hides now, and Test Users must see test rows) |
| `src/lib/test-data.ts` | add `excludingTestData()` (dashboards and metrics) |
| Dashboard and metrics files from the D8 inventory | apply `excludingTestData()`; recreate `vw_hub_metrics` in 181 |
| `CLAUDE.md` | add a convention line: dashboards and metrics go through `excludingTestData()`; Settings flag lists are an `adminClient` read exception |
| Customers index / project listing / project header | "Test" pill |
| `src/app/(hub)/layout.tsx`, `v2-hub-shell.tsx`, `v2-hub-sidebar.tsx` | keep the rev 1 `isTestUser` wiring as is |
| `src/lib/projects/project-types.ts` | revert: move `VALID_PROJECT_TYPES` back into `api/v2/projects/route.ts` (only rev 1's create form used it), delete file |

## Code context

- **Current RLS is role-only, not membership-based:**
  - `customers_staff_read` / `customers_client_read` / `customers_pm_write`: `084_tighten_pipeline_rls.sql:23-36`
  - `projects_staff_read` / `projects_pm_write`: `060_onboarding_project_scoping.sql:123-130`
  - `tasks_*`: 026, 048, 092, 111, 163 (163 adds **restrictive** checklist rules)
  - `issues_*`: 051, 100, 111, 132
  - `project_phases_*` / `project_deliverables_*`: `160_expand_project_phases_deliverables.sql:94-108`
  - Permissive policies OR together, so a new `…_test_user_*` policy adds access without touching the
    existing ones. A restrictive policy ANDs with all of them, which is how hiding works.
- **App-level gates.** Inventory command (36 files when planned):
  `grep -rlE '\["(pm|admin)"|role === "(pm|developer|admin)"|includes\(.*role' src/app/api/v2/projects src/app/api/projects src/app/api/customers src/app/api/v2/tasks src/app/api/v2/issues`
  and membership checks (27 files): `grep -rln 'getDeveloperAccessibleProjectIds|project_members' src`.
  The implementer records the final list and swaps only checks whose subject is a project or its child.
  Key helpers: `src/lib/programme/membership-rules.ts` (`canManageProjectMembers`, `canManagePhase1Membership`),
  `src/app/(hub)/projects-old/_project-access.ts` (`getDeveloperAccessibleProjectIds`),
  `src/app/(hub)/projects/_shared/_get-project-detail-data.ts`.
- **Sidebar:** Developers have no "Customers" link (`v2-hub-sidebar.tsx:49-51`). For a Test User, show
  Customers so they can reach test companies.
- **Rev 1 pieces kept:** `testFlagsApplied()`, `getSettingsViewer()`, `MIGRATION_MISSING`, the guard trigger,
  the `isTestUser` sidebar prop, and `TestPill` / input / button classes.

## Implementation steps

1. Rewrite migration 181 (helpers, policies, cascade trigger). Check it on a local Supabase or a scratch DB
   before the operator applies it (see Operator Steps).
2. Settings APIs: `PATCH` for flags (user: admin only; company/project: admin or Test User), plus `GET` search.
3. Settings UI: two toggle lists.
4. `effectiveProjectRole()` + route inventory swaps.
5. Remove rev 1 filters and creation code; revert `project-types.ts`.
6. "Test" pills; Customers sidebar link for Test Users.
6b. `excludingTestData()` + D8 inventory + `vw_hub_metrics` recreate + D9 hours filters; CLAUDE.md line.
7. `npx tsc --noEmit`, eslint, then the checks below.

## Acceptance criteria

| # | Check | Expected | When |
|---|-------|----------|------|
| A1 | `npx tsc --noEmit` | 0 errors | pre-merge |
| A2 | As admin: Settings → toggle Test User on a Developer | `select is_test_user from profiles where id=…` → true | post-deploy |
| A3 | That Developer, via the API from their browser session: `supabase.from('profiles').update({is_test_user:false}).eq('id', me)` | error "only be changed by the service role" | post-deploy |
| A4 | Test User flags customer X | `customers.is_test` true for X **and** all of X's projects (D5) | post-deploy |
| A5 | Log in as a **non-test PM**, then as a **non-test Admin**: `/customers`, `/projects/<slug>`, `/dashboard/tasks` | X, its projects and their tasks absent; opening X's project URL → not found | post-deploy |
| A5b | As non-test Admin: Settings → Test Data | X listed (flagged) and can be unflagged; after unflagging, X is back on `/customers` | post-deploy |
| A5c | As the Test User: `/dashboard`, `GET /api/metrics`, `/projects/<slug>/status-report` | same counts as a non-test user with the same role; X and its projects not in any KPI, chart or status row | post-deploy |
| A5d | Test User logs 1h on a test project task | their `/dashboard/timelogs` shows the entry; weekly-hours chart and dashboard hour totals unchanged (before vs after) | post-deploy |
| A6 | Log in as the Developer Test User: open X's project, edit a task they aren't assigned to, add a ticket, change a phase | all succeed | post-deploy |
| A7 | Same Developer Test User on a **real** project they aren't assigned to | same access as before (no gain) | post-deploy |
| A8 | Non-test Developer `PATCH /api/v2/settings/test-data` | 403 | post-deploy |
| A9 | Test User (non-admin) `PATCH /api/v2/settings/test-users` | 403 | post-deploy |
| A12b | `select * from vw_hub_metrics` before and after flagging one customer test | `customers_total` drops by 1 | post-deploy |
| A10 | **No-regression:** as a non-test PM and a non-test Developer, record counts in `/customers`, one classification listing and `/dashboard/tasks` before vs after the migration, with no test flags set | identical | post-deploy |
| A13 | Settings → Test Projects: type part of a `project_id` display ID, then a company name | matching rows within ~300 ms of typing stopping; network shows one request per pause, not per keystroke | post-deploy |
| A14 | Search for `50%_off` (with special characters) | treated literally, no wildcard matches | post-deploy |
| A15 | Reload with `?tab=projects&q=acme&filter=test` | same tab, query and filter restored | pre-merge (local) |
| A16 | Keyboard only: Tab to a row switch, press Space | flag toggles, focus ring visible, toast with Undo; Undo restores | pre-merge (local, manual) |
| A17 | Phone width (375 px) | no horizontal scroll; search, chips and switches usable | pre-merge (local, manual) |
| A11 | **No-regression:** `/dashboard/users` role change and invite still work | as before | post-deploy |
| A12 | Policy check: `select polname, polpermissive from pg_policy where polname like '%test%'` | the restrictive and permissive policies listed in the migration exist | post-deploy |

## Coordination

- **429** (In Progress, programme cutover) edits programme APIs and listings, which overlap the route
  inventory. Swap gates in files 429 has finished with, and tell the 429 agent about
  `effectiveProjectRole()`. This doc doesn't change 429's scope.
- **473** (Testing): rev 2 only adds a pill in the classification listing. Land after 473.
- **430** (Planned, tasks column rename): touches `tasks` policies or columns. Land 476 first, or rebase
  the policies.

## Operator Steps

1. **Do not run `supabase db push` unlinked or without `--dry-run`.** Other written-not-applied migrations
   (169–174, 180, …) would apply too. Apply 181 alone, either in the SQL Editor or via
   `supabase link --project-ref tgjpkyiywktjktbsxcyr` → `db push --dry-run` listing only 181.
2. Deploy the Next.js app.

## Rework of rev 1 code (already in the working tree, not shipped)

Rev 1's creation endpoints, forms and listing filters are removed or replaced as listed in Proposed file
changes. Migration 181 was never applied (the user's `db push` failed: "Cannot find project ref"), so it
can be rewritten in place.

## Implementation Notes (rev 3)

### Baseline
- `npx tsc --noEmit` before rev 3 edits: exit 0 (rev 1 code in tree). After: exit 0.
- Acceptance checks A2–A17 need migration 181 applied and real logins, so there was no pre-change value to capture.
  `476-search.check.ts` is new and fails on the old code by construction (`orIlike` didn't exist).

### What Changed
- **Migration 181 rewritten** (still not applied):
  - columns, `is_test_user` guard trigger;
  - `get_my_is_test_user()` and `is_test_project(uuid)` (SECURITY DEFINER, `get_my_role()` style);
  - restrictive SELECT on `customers`/`projects`/`tasks`/`tickets` (visible only to Test Users; admins are not
    exempt);
  - permissive Test User `for all` policies on customers, projects, tasks, tickets, project_phases,
    project_deliverables, project_members, phase_members, task_comments, ticket_comments;
  - D5 cascade trigger (customer → its projects);
  - `vw_hub_metrics` recreated with `customers_total` excluding test customers.
- **Settings** (`/dashboard/settings`):
  - tabs Test Users (admins) / Test Companies / Test Projects (admins + Test Users), each with a flagged-count badge;
  - server-side search (debounced 300 ms, 25 per page, "Load more", "Showing N of M");
  - All/Test/Not filter chips, plus Role (users) and Classification (projects) selects;
  - URL state `?tab=&q=&filter=&role=&classification=` via `history.replaceState`;
  - `role="switch"` toggles with optimistic update, row spinner, inline error and revert on failure, and an Undo toast;
  - inline cascade confirm ("Also marks N projects");
  - skeleton, empty and no-matches states (with Clear search); the migration banner.
  - The users tab keeps the role select (existing `PATCH /api/v2/users/[id]`).
- **APIs:**
  - `GET/PATCH /api/v2/settings/test-users` (admin only) and `GET/PATCH /api/v2/settings/test-data`
    (admin or Test User).
  - Shared gate in `api/v2/settings/_gate.ts`.
  - Search via the new pure `orIlike()` (`src/lib/postgrest-search.ts`): LIKE wildcards are escaped and the
    value is quoted for PostgREST.
- **Test User access (D4)**, all through `src/lib/test-data.ts`:
  - `asTestRole()` wraps the caller's profile in 32 role-gated route files: v2 project task/ticket/attachment/
    tasklist/description-image routes, project delete, all `api/projects/[projectId]/programme/**`, notes images,
    customer detail/primary-contact/reopen/projects, task/ticket PATCH, and task comment routes.
  - `getDeveloperAccessibleProjectIds()` / `isProjectVisibleToCurrentUser()` include test projects for Test Users,
    which reaches every caller of those two gates.
  - Project listing (`_load-list-data.ts`) and both detail loaders use the effective role.
  - Sidebar shows Customers to developer Test Users.
- **Hidden / excluded (D2, D8, D9):**
  - RLS covers every session read for non-test users.
  - Explicit exclusions that also apply to Test Users and `adminClient` reads:
    - `GET /api/onboarding/projects` (PM/marketing dashboards' only source), the status report API;
    - dev dashboard (tasks, tickets, 30-day logged hours / "logged today");
    - PM/marketing dashboard customer/project counts (`excludeTest` prop, true only for Test Users);
    - `vw_hub_metrics`;
    - digest customer counts.
- **"Test" pill** (`src/components/test-pill.tsx`): Customers index, project listing card, project header, Settings rows.
- **Rev 1 code removed:** creation endpoints/forms, `_test-users.tsx`/`_test-data.tsx`, listing `.eq("is_test", false)`
  filters, `src/lib/projects/project-types.ts` (constant moved back into `api/v2/projects/route.ts`).
- CLAUDE.md: a convention line for test data.

### Files Changed
- `supabase/migrations/181_test_users_and_test_data.sql` (rewritten)
- `src/lib/test-data.ts`, `src/lib/postgrest-search.ts` (new), `src/components/test-pill.tsx` (new)
- `src/app/api/v2/settings/_gate.ts` (new), `test-users/route.ts`, `test-data/route.ts`
- `src/app/(hub)/dashboard/settings/page.tsx`, `_settings-client.tsx`, `_settings-ui.tsx`, `_use-flag-list.ts` (new);
  `_test-users.tsx`, `_test-data.tsx` (deleted)
- `src/app/(hub)/layout.tsx`, `_components/v2-hub-shell.tsx`, `_components/v2-hub-sidebar.tsx`
- `src/app/(hub)/customers/page.tsx`, `_customers-index.tsx`
- `src/app/(hub)/projects/_v2-listing/_load-list-data.ts`, `_onboarding-list.tsx`, `_project-card.tsx`
- `src/app/(hub)/projects/_shared/_get-project-detail-data.ts`, `_project-detail-header.tsx`
- `src/app/(hub)/projects/[classification]/[projectId]/_load-detail-data.ts`
- `src/app/(hub)/projects-old/_project-access.ts`
- `src/app/(hub)/dashboard/page.tsx`, `_components/dashboard-view.tsx`, `admin-dashboard.tsx`, `pm-dashboard.tsx`,
  `marketing-dashboard.tsx`, `_dev/_load-dev-dashboard.ts`
- `src/app/api/onboarding/projects/route.ts`, `.../status-report/route.ts`, `src/lib/ai/digest.ts`
- 32 route files wrapped with `asTestRole()` (`grep -rl asTestRole src/app/api`)
- `src/app/api/customers/route.ts`, `src/app/api/v2/projects/route.ts` (rev 1 filters removed)
- `CLAUDE.md`, `_docs/task/476-search.check.ts` (new)

### Deviations From Plan
- **`issues` → `tickets`:** migration 147 renamed `issues`/`issue_comments` to `tickets`/`ticket_comments`, and
  the policies target the real names. The plan said "issues".
- **Classification search:** it's a filter select only, not part of the free-text search. Classification lives on
  `customer_products`, and PostgREST can't OR an embedded column with base columns in one `.or()`.
- **Pickers:** role and classification use native `<select>` chips (≤6 options each), not the time-logs
  `SearchableSelect`. That component lives in another page's folder and a 6-item list doesn't need search.
- **`GET /api/v2/users` unchanged:** the Test Users tab has its own search endpoint.
- **Charts:** `weekly-hours-chart.tsx` / `classification-pulse-chart.tsx` aren't imported anywhere, so I left
  them. No time-cost report exists. The dev dashboard is the only hours aggregation.
- **Not wrapped** (role check isn't about the test record, or the risk is low):
  - `api/customers` POST (creation), `customers/[id]/products` and `assets/**` helper gates
    (role-only helpers without the record id);
  - notes folder share roles, task/ticket time-log visibility, subtask self-assign.
  - A developer Test User therefore can't add products or manage assets on a test company. Follow-up if needed.
- **Accepted gap:** a Test User's own `/dashboard/tasks` cross-project table lists test tasks. It's a listing, not
  a metric, and RLS hides them from everyone else.

### Verification Run
- `npx tsc --noEmit`: PASS (0 errors)
- `npx eslint` over every changed area: PASS (0 problems, after adding `excludeTest` to two effect deps)
- `npx tsx _docs/task/476-search.check.ts`: PASS (literal `%`/`_`, quotes, backslashes, `,()` and `*` cases)
- `curl localhost:3000/dashboard/settings` signed out → 307 to `/auth/login?returnTo=…`;
  `GET /api/v2/settings/test-data` → 401: PASS
- A2–A17: NOT RUN (need migration 181 and signed-in sessions per role). Hand to `test`.
- Migration SQL: NOT EXECUTED anywhere. No local Supabase is running (Docker daemon down per task 427), so syntax and
  policy behaviour are unverified. Run A12 after applying.

### Attempts That Failed
- Template-string `select()` on the customers page lost Supabase's column typing (TS2339 ParserError). Replaced
  with a conditional between two literal strings cast to the wider literal.
- `router.replace` for URL state would re-run the server page (count queries) on every keystroke. Switched to
  `window.history.replaceState`, which Next 16 syncs with `useSearchParams`.

### Operator Steps
1. Back up, then apply `supabase/migrations/181_test_users_and_test_data.sql` **alone**: SQL Editor, or
   `supabase link --project-ref tgjpkyiywktjktbsxcyr` → `db push --dry-run` listing only 181. A plain `db push`
   would also apply 169–174, 180 and other written-not-applied migrations.
2. After applying: `select polname, polpermissive from pg_policy where polname like '%test%';` should return
   4 restrictive `*_test_hidden` and 10 permissive `*_test_user_all` policies.
3. Deploy the Next.js app. It's the only deployable: `worker/` imports none of the changed modules (`grep -rl
   "test-data\|postgrest-search" worker` → empty).


## Rev 4 — Settings UI simplified (2026-11-16)

User request: "Instead of listing it all, I only want a label and a textarea box for multiple selection per
settings, no need to complicate the UI". Decisions via AskUserQuestion:
- **D10** box = textarea-style box with removable chips; typing searches existing records and you pick to add.
- **D11** role changes are removed from Settings and stay on `/dashboard/users`. This replaces rev 1–3's
  "update user role" in Settings.
- **D12** each box has its own **Save**, which sends only the diff. Test Companies asks for an inline
  confirm first, because the change cascades to projects.

**Supersedes rev 3's UI requirements:** tabs, filter chips, role/classification selects, URL state, row switches with
Undo, paging, counts, "Showing N of M", and the A13 (display-ID search part kept), A15 and A16 checks. Everything
else from rev 3 (RLS, access, dashboard/metrics exclusion) is unchanged.

### What changed
- `page.tsx` loads the saved selections (adminClient, after the gate) and renders `SettingsFields`.
- `_settings-fields.tsx` holds three `ChipPicker`s. Test Users shows for admins only; Test Companies and Test
  Projects show for admins and Test Users.
- `_chip-picker.tsx`:
  - label + description, chips in a `min-h-24` box with an inline input (ARIA combobox/listbox);
  - debounced 300 ms server search, up to 8 suggestions with a sub-line (email, `customer_id`, or `project_id · company`),
    already-selected items left out;
  - keyboard: ↑/↓, Enter to add, Esc, Backspace on an empty input removes the last chip;
  - Save is disabled until something changed, with a "N to add, M to remove" hint, inline error, toast on success,
    then `router.refresh()` so every box reloads its saved state (a company change also moves its projects into or
    out of Test Projects).
- APIs: GET in both routes is now search suggestions only (`?q=`, plus `kind=customers|projects`, limit 15).
  PATCH is bulk `{ add: ids[], remove: ids[] }` (+ `kind`), max 200 ids each, validated by `parseIdLists()`.
- Deleted `_settings-client.tsx`, `_settings-ui.tsx`, `_use-flag-list.ts`; removed `PAGE_SIZE` / `FlagFilter` /
  `parseListParams` from `_gate.ts`.

### Checks (replace A13–A17)
| # | Check | Expected | When |
|---|-------|----------|------|
| A13 | Test Projects box: type part of a project display ID, then a company name | matching suggestions about 300 ms after typing stops; one request per pause | post-deploy |
| A14 | Search `50%_off` | treated literally (`476-search.check.ts` covers the escaping) | pre-merge PASS + post-deploy |
| A15 | Add two users, remove one, Save | `select id from profiles where is_test_user` matches the box after reload | post-deploy |
| A16 | Keyboard only: type, ↓, Enter, Backspace, Tab to Save, Enter | chip added, last chip removed, saved | pre-merge (local, manual) |
| A17 | Phone width (375 px) | box wraps chips, no horizontal scroll | pre-merge (local, manual) |
| A18 | Add a company with projects to Test Companies → Save | confirm text shown; after confirm the company's projects appear in the Test Projects box | post-deploy |
| A19 | Non-admin Test User opens Settings | only the Test Companies and Test Projects boxes; `PATCH /api/v2/settings/test-users` → 403 | post-deploy |

### Verification run (rev 4)
- `npx tsc --noEmit`: PASS. `npx eslint` on settings page + APIs: PASS. Browser checks: NOT RUN (migration 181 not applied).
- **Follow-up (user screenshot, list clipped at the page bottom):** the suggestion list now opens **above** the box
  when there is less than about 264 px of viewport below it and more room above. This is measured when the list opens.
  Check: open the Test Projects box near the bottom of the viewport and type; the list appears above the box,
  fully visible (manual, pre-merge).

### Migration 181 applied (2026-11-16, by the user, via SQL Editor)
- The first `db push` attempt failed (CLI not linked). The rev 1 version of 181 (columns only) was applied earlier, and the
  full current file was then run in the SQL Editor.
- A12 PASS: `pg_policy` lists 14 policies: 4 restrictive (`customers/projects/tasks/tickets_test_hidden`) and 10 permissive
  `*_test_user_all` (customers, projects, tasks, tickets, project_phases, project_deliverables, project_members,
  phase_members, task_comments, ticket_comments).
- `pg_proc` lists `get_my_is_test_user`, `is_test_project`, `cascade_customer_is_test`.
- Triggers confirmed: `pg_trigger` lists `profiles_guard_is_test_user` and `customers_cascade_is_test`.
- Not yet confirmed: `vw_hub_metrics.customers_total` excludes test customers (A12b).
- Since 181 was run in the SQL Editor, the CLI migration history may not record the rewritten 181. Don't re-push it.

### Follow-up: route move + duplicate-key fix (2026-11-16)
- **Route:** Settings moved from `/dashboard/settings` to **`/settings`** (user request).
  - Files moved to `src/app/(hub)/settings/` (`page.tsx`, `_settings-fields.tsx`, `_chip-picker.tsx`).
  - `src/app/(hub)/dashboard/settings/page.tsx` is now a redirect to `/settings`, so old links keep working.
  - `V2_ROUTES.DASHBOARD_SETTINGS` became `V2_ROUTES.SETTINGS = "/settings"`, used by the sidebar and the v2 header.
  - Not changed: the old hub's `components/hub/hub-header.tsx` and `lib/auth/role-access.ts` still say
    `/dashboard/settings`, but only the unrouted `_hub_(OLD)` uses them, and the redirect covers them.
  - Department restrictions: HR/Finance couldn't reach Settings before and still can't. No change.
- **Bug:** React "Encountered two children with the same key, ``". Each ChipPicker was keyed by `ids.join()`, so
  two empty lists both produced `""`. Keys are now prefixed (`users:`, `companies:`, `projects:`).
- Checks: `tsc` PASS, `eslint` PASS. Manual: open `/dashboard/settings` → lands on `/settings`; console has no
  duplicate-key error with empty lists.

## Quality Gate Notes (rev 4, after /settings move)

### Result
PASS

### Standards Review
- **Fixed during the gate:**
  - `isTestTarget`, `inList`, `TestTarget` and `TestScope` were exported but imported nowhere, so they're module-private now.
  - `TestScope.applied` was never read and is removed.
  - `settingsGate()` returned `viewer`/`userId` that no caller used after the rev 4 bulk APIs. It now returns
    `NextResponse | null`.
  - Re-run: `tsc` PASS, `eslint` PASS, `476-search.check.ts` PASS.
- **Security:** every `adminClient` write in `api/v2/settings/*` comes after `settingsGate()`. Bulk PATCH validates
  id arrays (strings, ≤200, deduped). `is_test_user` can't be changed through a user session (guard trigger,
  confirmed in `pg_trigger`). Search input is escaped and quoted for PostgREST (`orIlike()`, covered by the check
  file with real output assertions).
- **Access logic is in one place:** `asTestRole()` (32 routes), `projectRoleFor()` and `effectiveProjectRole()` all
  live in `src/lib/test-data.ts`, so the "Test User acts as pm on test data" rule has one definition.
- **Minor perf (accepted):** `asTestRole()` / `getSettingsViewer()` add 1–2 small queries per role-gated request
  for non-admin, non-pm callers. Admin/pm return early. `loadTestScope()` loads all test ids per call (flagged
  `shortcut:` in code; upgrade to SQL-side filtering if test data grows to hundreds of projects).
- **UI conventions:** controlled state + inline fetch + inline errors, sonner only for the save confirmation,
  lucide icons, `aria-*` on combobox/listbox/chip remove buttons, focus rings, hand-rolled pill, no `style={{}}`.
  Arbitrary hex values follow the existing `_invite-user-modal.tsx` precedent for Design System v2 tokens.
- **Error handling:** search errors show inline; save errors show inline and keep the unsaved chips; the page shows
  the migration banner if 181 is missing.

### Deviations
- **Medium (approved by the user during the task):** scope went rev 1 → rev 4 (create flows → flag existing records →
  Test-User-only visibility + dashboard/metrics exclusion → label + chip box UI, route `/settings`). Each revision
  is recorded above with the user's words and AskUserQuestion answers.
- **Medium (recorded in Implementation Notes):** products/assets routes on test companies and the
  `/dashboard/tasks` listing for Test Users aren't covered by `asTestRole()` / D8.
- **Minor:** migration 181 was rewritten in place after a first partial apply. The user re-ran the full file and
  policies, functions and triggers are confirmed. CLI history may record the old 181.

### Acceptance-criteria coverage
- Pre-merge with real checks: A1 (tsc), A14 (search check), A12 (policies, confirmed by the user's query output).
- A2–A11, A12b, A13, A15, A18, A19 are post-deploy browser/SQL checks with concrete expected results.
- A16 and A17 are manual (keyboard and phone width).
- None has been run yet. All go to `test`.

### Required Fixes
- None.
