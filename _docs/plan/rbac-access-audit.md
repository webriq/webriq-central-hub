# WebriQ Central Hub — Role Access Audit

**Snapshot:** 2026-09-01 · `main` branch · migrations through 127 · current `(hub)` route group.

Every **live** feature broken down to its individual actions (create / read / update / delete plus verb-specific ones: assign, approve, reply, import…), each mapped to the seven roles. Compiled from page guards, API route checks, Postgres RLS policies, and the permission libraries.

Pages that render only a `v2 · … · Sprint N` placeholder (no working UI) are **excluded** — see [Stubbed, not covered](#stubbed-not-covered-no-working-ui).

**Legend:** `✓` allowed · `own` = only rows they created / are assigned to / a folder they own · `rls` = RLS permits but no UI path reaches it · `—` denied.
**`Admin` = `admin` + `super_admin`** — identical in every table (migration 048). `SA-only` differences are called out where they exist.
Effective capability = the union of all enforcement layers, floored by RLS.

---

## How access is enforced (6 layers)

| Layer | Role behaviour |
|---|---|
| `(hub)/layout.tsx` | **Auth only** — checks sign-in, resolves the role, does **not** gate routes by it |
| `v2-hub-sidebar.tsx` | Hides nav items per role. Cosmetic — the URLs still resolve |
| Page guards | `redirect()` on role for **Desk**, **Projects V2**, **New Project**, and **Time Logs** only. Every other page has no server-side role redirect |
| API route guards | Explicit role allow-lists returning `403` |
| Postgres RLS | The real backstop. `get_my_role()` / `get_my_customer_id()` security-definer helpers drive every policy |
| Permission libs | `src/lib/tasks/permissions.ts`, `src/lib/issues/permissions.ts`, `src/lib/programme/membership-rules.ts`, `src/lib/mcp/scopes.ts` |

## The seven roles (`profiles.role` enum)

New sign-ups default to `client`; staff roles are assigned by an admin via invite.

| Role | Summary |
|---|---|
| `super_admin` | Full platform control. RLS parity with admin everywhere, plus sole rights on "set project owner". |
| `admin` | Operations owner. Full CRUD across customers, projects, tasks, HR user management, Zoho migration. |
| `pm` | Full write on customers / projects / tasks / tickets; unrestricted project visibility. |
| `developer` | Assigned projects only. Creates & edits own tasks/issues, advances assigned ones, tracks time. |
| `marketing` | Owns the 120-day Programme & Phase-1 wizard. Membership-gated on projects; read-only on customers. |
| `hr` | Time-log oversight; reads customers, project list, status report. No project write. (Dedicated `hr.*` UI not built.) |
| `client` | Own customer row + own tickets only. The login-free onboarding form is a separate, unauthenticated flow. |

---

## Active surface map

| Page / surface | Route | In sidebar? | Roles that can open it |
|---|---|---|---|
| Dashboard (role-dispatched) | `/dashboard` | Work | all authenticated |
| Customers list | `/customers` | Work (not dev) | admin, pm, dev, mktg, hr — client: own row |
| Customer profile | `/customers/[id]` | — | same as list |
| New Customer wizard | `/customers/onboard` | — | admin, pm |
| Portfolio Tracker | `/portfolio-tracker` | Work "Tracker" (not dev/client) | admin, pm, mktg, hr |
| Tracker — import / status report / project / onboarding workspace | `/portfolio-tracker/*` | — | admin, pm, mktg (+ hr read on status report) |
| Projects (redirect → last tab) | `/projects` | Work "Projects" | admin, pm, dev, mktg, hr |
| Projects V2 list | `/projects/v2` | Work "Projects › V2 Projects" | redirects `client`; dev = assigned; mktg = member-of |
| Legacy Projects list | `/projects/legacy` | Work "Projects › Legacy Projects" | same |
| New Project wizard | `/projects/v2/new` | — | admin, pm, mktg |
| Projects V2 — import / status report | `/projects/v2/import`, `/projects/v2/status-report` | — | admin, pm, mktg |
| **Project detail tabs** | `/projects/{v2,legacy}/[id]/(tabs)/…` | — | project members + staff |
| — Overview | `…/overview` | tab | all with project access |
| — Timeline *(v2 only)* | `…/timeline` | tab | all with project access |
| — Tasks | `…/tasks` + `tasks/[taskId]` | tab | admin, pm, dev |
| — Issues | `…/issues` + `issues/[issueId]` | tab | admin, pm, dev |
| — Milestones | `…/milestones` + `milestones/[milestoneId]` | tab | admin, pm, dev |
| — Files | `…/files` | tab | admin, pm, dev |
| — Notes | `…/notes` | tab | admin, super_admin, pm, developer only |
| — Access | `…/access` | tab | all with project access |
| — Members | `…/members` | tab | all with project access |
| — Status Report | `…/status_report` | tab | all with project access **except developer** |
| — Time Logs | `…/time_logs` | tab | all with project access |
| — Onboarding Workspace *(Phase-1 wizard)* | `…/[id]/onboarding-workspace` | — | admin, mktg (edit); pm (read) |
| Desk — Tickets | `/desk/tickets` + `[ticketId]` | Work "Desk › Tickets" (not dev) | **admin, super_admin, pm only** (page redirect) |
| Desk — Contacts / Accounts | `/desk/contacts`, `/desk/accounts/[id]` | Work "Desk › Contacts" | admin, super_admin, pm |
| Time Logs | `/dashboard/timelogs` | Work (not client/mktg) | admin, pm, dev, hr (page redirects others) |
| Users / roles (labelled "HR") | `/dashboard/users` | People "HR" — **admin only**, greyed for others | admin, super_admin |
| Hub Users admin | `/admin/hub-users` | *not linked* — direct URL | admin, super_admin |
| Zoho migration console | `/admin/migrate` | *not linked* — direct URL | admin, super_admin |
| MCP OAuth consent | `/oauth/authorize` | — | any signed-in user (scopes limited by role) |
| Ops Chat panel | global (header input + side panel) | header | admin, pm (full); developer (limited) |
| Login-free onboarding form | `(public)/onboard/[customerId]` | — | unauthenticated — the customer via link |

### Stubbed, not covered (no working UI)

These routes exist but render only a `v2 · … · Sprint N` placeholder. Their APIs and RLS may be live, but no user-facing feature reaches them, so they are out of scope for this audit:

| Route | Sidebar | Notes |
|---|---|---|
| `/orchestration` | Work "Orchestration" (not dev) | AI pipeline UI. `/api/classification`, `/api/plan`, `/api/assessment` are live but only the retired `_hub_(OLD)` pages ever called them. Pipeline actions survive **only** through Ops Chat / MCP. |
| `/kb` | Knowledge "Wiki" | LLM Wiki. `kb_articles` are imported and RLS-readable by staff, but nothing renders them. No authoring UI for any role. |
| `/dashboard/settings` | Admin "Settings" (admin only) | LLM model-per-layer config has no UI; changed directly in `llm_config`. |
| `/dashboard/tasks` | *not linked* | Superseded by the project Tasks tab. |
| `/dashboard/pipeline`, `/pm/pipeline` | *not linked* | Superseded by the project board / Tracker. |
| `/dashboard/chat` | *not linked* | Superseded by the global Ops Chat panel. |
| "Announcements" nav item | People | Points at `/dashboard`; `stub: true`. `hr.announcements` has no UI. |

---

## Identity & user administration — `/dashboard/users`, `/admin/hub-users`

`/dashboard/users` is the live 588-line user-management screen (nav label "HR", visible only to admin/super_admin). It reads `hub_users` + `profiles`, assigns `profiles.role`, and sends invites via `/api/admin/hub-users/[id]/invite`.

| Action | Admin | PM | Dev | Mktg | HR | Client |
|---|---|---|---|---|---|---|
| Create account (sign up) | Anyone — new account forced to role `client` by the `handle_new_user()` trigger | | | | | |
| Sign in / Zoho OAuth | Anyone with an account | | | | | |
| Read own profile | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Update own profile (name, avatar) | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| Change own role | — | — | — | — | — | — |
| Open the Users screen / read the directory | ✓ | — | — | — | — | — |
| List users API (`GET /api/v2/users`) | ✓ | — | — | — | — | — |
| Create / invite a user | ✓ | — | — | — | — | — |
| Assign / change another user's role | ✓ | — | — | — | — | — |
| Resend / regenerate invite link | ✓ | — | — | — | — | — |
| Force-logout a user (`force_logout` fn) | ✓ | — | — | — | — | — |
| Delete a user | No route / UI — done directly in the Supabase dashboard | | | | | |
| Manage own notifications / prefs / push subscriptions | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

## Dashboard — `/dashboard`

Read-only surface. Every authenticated role gets exactly one dashboard, chosen server-side; no switcher, no write action on the page.

| Role | Dashboard rendered | Content |
|---|---|---|
| admin / super_admin | Admin | currently wraps the PM dashboard |
| pm | PM | clients table, classification pulse, weekly hours |
| developer | Dev | assigned projects & tasks, timers |
| marketing | Marketing | Tracker-first onboarding view |
| hr / client | PM (fallback) | no dedicated dashboard built yet |

## Customers — `/customers`, `/customers/[id]`, `/customers/onboard`

Sidebar item hidden from developers. `customers_staff_read` (migration 084): every staff role reads; client reads only its own row; marketing is read-only.

| Action | Admin | PM | Dev | Mktg | HR | Client |
|---|---|---|---|---|---|---|
| Read customer list & profile | ✓ | ✓ | ✓ | ✓ | ✓ | own row |
| Read Phase-1-gated (pre-handover) customers | ✓ | hidden | hidden | ✓ | hidden | — |
| Create customer (New Customer wizard) | ✓ | ✓ | — | — | — | — |
| Update customer | ✓ | ✓ | — | — | — | — |
| Delete customer | No route / no UI | | | | | |
| Read customer contacts | ✓ | ✓ | ✓ | — | — | — |
| Create / update / delete a contact | ✓ | ✓ | — | — | — | — |
| Set primary contact | ✓ | ✓ | — | — | — | — |
| Read customer products | ✓ | ✓ | ✓ | ✓ | ✓ | own |
| Assign a product to a customer | ✓ | ✓ | — | — | — | — |
| Update product (status, instance id) | ✓ | ✓ | — | — | — | — |
| Archive / delete a product | ✓ | ✓ | — | — | — | — |
| Reopen a completed onboarding | ✓ | ✓ | — | — | — | — |
| Read projects under a customer | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Create / update / delete a customer project | ✓ | ✓ | — | — | — | — |
| Read customer assets & folders (app-level, not RLS) | ✓ (all) | per-asset `allowed_roles` / `allowed_user_ids` | | | | — |
| Upload / update / delete an asset | ✓ | ✓ | if allowed | if allowed | if allowed | — |
| Generate the AI markdown summary of an asset | ✓ | ✓ | if allowed | if allowed | if allowed | — |
| Edit PM-side onboarding responses (active products) | ✓ | ✓ | — | — | — | — |

Credential-type assets store references only (vault path, LastPass item name) — never live secrets.

## Login-free onboarding form — `(public)/onboard/[customerId]`

No authentication. The customer opens a link; the auto-save API writes through `adminClient` (the one documented RLS-bypass exception).

| Action | The customer (via link) | Any Hub role |
|---|---|---|
| Read the form & product schema | ✓ | n/a — separate flow |
| Update `onboarding_data` (debounced auto-save) | ✓ | — |
| Submit / mark onboarding complete | ✓ | — |

## Projects — `/projects/v2`, `/projects/legacy` (+ `/projects` redirect)

V2 list redirects `client`. Developers see only projects they're a member of; marketing is membership-gated; PM / Admin / SA see everything.

| Action | Admin | PM | Dev | Mktg | HR | Client |
|---|---|---|---|---|---|---|
| Read project list & detail (`projects_staff_read`) | ✓ | all | assigned | member-of | ✓ | — |
| Create project (New Project wizard) | ✓ | ✓ | — | ✓ | — | — |
| Update project fields (`projects_pm_write`) | ✓ | ✓ | — | — | — | — |
| Delete project | ✓ | ✓ | — | — | — | — |
| Create / edit / delete project tags | ✓ | ✓ | — | — | — | — |
| Read project members | ✓ | ✓ | if member | if member | ✓ | — |
| Add a collaborator (or the project creator) | ✓ | ✓ | if creator | if creator | if creator | — |
| Remove a collaborator (or the project creator) | ✓ | ✓ | if creator | if creator | if creator | — |
| Set / transfer project owner (**SA + admin**, or creator) | ✓ | if creator | if creator | if creator | if creator | — |

## Project detail tabs — `/projects/{v2,legacy}/[id]/(tabs)/…`

The tab strip renders: Overview · Timeline *(v2 only)* · Tasks · Issues · Milestones · Files · Notes *(staff allowlist)* · Access · Members · Status Report *(hidden from developer)* · Time Logs.

### Overview / Timeline / Access / Members tabs

| Action | Admin | PM | Dev | Mktg | HR | Client |
|---|---|---|---|---|---|---|
| View Overview / Timeline / Access / Members | ✓ | ✓ | if member | if member | ✓ | — |
| (These tabs are read/dashboard surfaces; edits happen through Members management above and the entity tabs below.) | | | | | | |

### Tasks tab (+ `tasks/[taskId]`)

`tasks_staff_read` = admin/SA/pm/developer. Field-level limits for developers live in the PATCH route + client, not the DB.

| Action | Admin | PM | Dev (creator) | Dev (assignee) | Mktg / HR / Client |
|---|---|---|---|---|---|
| Read tasks | ✓ | ✓ | ✓ | ✓ | — |
| Create task | ✓ | ✓ | ✓ (own) | ✓ (own) | — |
| Update all fields (title, desc, priority, dates, assignees…) | ✓ | ✓ | ✓ | — | — |
| Change status — any value | ✓ | ✓ | ✓ | — | — |
| Change status → `in_progress` / `ready_for_qa` only | ✓ | ✓ | ✓ | ✓ | — |
| Assign / reassign a task | ✓ | ✓ | ✓ | — | — |
| Delete task (migration 111) | ✓ | ✓ | own | — | — |
| Read task comments | ✓ | ✓ | ✓ | ✓ | — |
| Post a comment | ✓ | ✓ | ✓ | ✓ | — |
| Delete a comment | ✓ | own | own | own | — |
| Read attachments | ✓ | ✓ | ✓ | ✓ | — |
| Upload an attachment | ✓ | ✓ | own task | — | — |
| Delete an attachment | ✓ | ✓ | — | — | — |
| Read / create subtasks | ✓ | ✓ | ✓ | ✓ | — |
| Start / stop a task timer | — | — | ✓ if assigned | ✓ | — |
| Log time on a task (must be assigned; task 226) | own hrs | own hrs | ✓ | ✓ | HR: own hrs · mktg/client: — |
| Edit / delete own time entry | own | own | ✓ | ✓ | HR: own |

### Issues tab (+ `issues/[issueId]`)

Imported from Zoho; no in-Hub creation flow. The assignee tier is stricter than for tasks — timer only, no status change.

| Action | Admin | PM | Dev (creator) | Dev (assignee) | Mktg / HR / Client |
|---|---|---|---|---|---|
| Read issues (`issues_staff_read`) | ✓ | ✓ | ✓ | ✓ | — |
| Create issue | rls | rls | No in-Hub creation UI (import only) | | |
| Update fields (title, description, severity…) | ✓ | ✓ | own | — | — |
| Change status | ✓ | ✓ | own | — | — |
| Assign issue (`assignee_id`) | ✓ | ✓ | own | — | — |
| Delete issue (migration 111) | ✓ | ✓ | own | — | — |
| Start / stop an issue timer | — | — | ✓ if assigned | ✓ | — |
| Log time on an issue | own hrs | own hrs | ✓ | ✓ | HR: own hrs |
| Read issue comments | ✓ | ✓ | ✓ | ✓ | — |
| Post an issue comment (live, migration 101) | ✓ | ✓ | ✓ | ✓ | — |
| Delete an issue comment | ✓ | own | own | own | — |

### Milestones tab (+ `milestones/[milestoneId]`)

| Action | Admin | PM | Dev | Mktg / HR / Client |
|---|---|---|---|---|
| Read milestones (migration 033) | ✓ | ✓ | ✓ | — |
| Create / update / delete a milestone | ✓ | ✓ | — | — |
| Group tasks into a tasklist (migration 035) | ✓ | ✓ | — | — |

### Files tab

| Action | Admin | PM | Dev | Mktg / HR / Client |
|---|---|---|---|---|
| Read project files (`project-assets` bucket) | ✓ | ✓ | ✓ | — |
| Upload a file | ✓ | ✓ | own object | — |
| Update / delete another user's file | ✓ | ✓ | — | — |

### Notes tab — staff-only (`client` / `marketing` / `hr` never see the pill)

Base access = admin/SA/pm/developer. Google-Keep model: private by default, shared explicitly.

| Action | Admin | PM | Dev | Author | Edit-collaborator |
|---|---|---|---|---|---|
| Read own notes | ✓ | ✓ | ✓ | ✓ | ✓ |
| Read *every* note in the project | ✓ | — | — | n/a | — |
| Read a note shared with me | ✓ | if shared | if shared | ✓ | ✓ |
| Create a note | ✓ | ✓ | ✓ | ✓ | n/a |
| Update a note (title / content / color / pin / archive) | ✓ | own / shared-edit | own / shared-edit | ✓ | ✓ |
| Delete a note | ✓ | own | own | ✓ | — |
| Toggle a note's visibility private ↔ public | ✓ | own | own | ✓ | — |
| Add / update / remove a note collaborator | ✓ | own note | own note | ✓ | — |
| Read folders | ✓ | ✓ | ✓ | ✓ | ✓ |
| Create a folder | ✓ | ✓ | ✓ | ✓ | n/a |
| Rename / delete a folder (or the folder's creator) | ✓ | if creator | if creator | n/a | n/a |
| Add / update / remove a folder share (migration 127 — written, not applied) | ✓ | if creator | if creator | n/a | n/a |

A public folder grants all staff **view-only** access to notes their authors also flipped public. A folder share of `edit` grants note edit but never delete.

### Status Report tab — hidden from `developer`

| Action | Admin | PM | Dev | Mktg | HR | Client |
|---|---|---|---|---|---|---|
| Read the Status Report tab | ✓ | ✓ | hidden | ✓ | ✓ | — |
| Edit status-report notes | ✓ | — | — | ✓ | — | — |

### Time Logs tab

Same rules as the standalone Time Logs page below, scoped to the project.

## Desk — Tickets, Contacts, Accounts — `/desk/*`

**Hard page guard:** `/desk/tickets` redirects everyone except admin / SA / pm. Sidebar "Desk" hidden from developers. RLS grants developers ticket access but no UI reaches it.

| Action | Admin | PM | Dev | Mktg | HR | Client |
|---|---|---|---|---|---|---|
| Open the Desk UI | ✓ | ✓ | redirected | redirected | redirected | — |
| Read tickets (`tickets_staff_all`) | ✓ | ✓ | rls | — | — | own customer |
| Read ticket messages | ✓ | ✓ | rls | — | — | public only |
| Create a ticket | ✓ | ✓ | rls | — | — | own customer |
| Update ticket fields | ✓ | ✓ | rls | — | — | — |
| Change ticket status (`POST .../status`) | ✓ | ✓ | — | — | — | — |
| Reply to a ticket (sends email; `POST .../reply`) | ✓ | ✓ | — | — | — | public msg |
| Add an internal note to a ticket | ✓ | ✓ | — | — | — | — |
| Delete a ticket | rls | rls | rls | — | — | — |
| Read Desk contacts / accounts | ✓ | ✓ | rls | — | — | — |
| Create / update / delete a contact or account | ✓ | ✓ | — | — | — | — |

## Time Logs — `/dashboard/timelogs`

Sidebar item hidden from `client` and `marketing`; the page also redirects roles with no `time_logs` RLS access. The floating timer / break widget mounts hub-wide for every role (migration 113).

| Action | Admin | PM | Dev | Mktg | HR | Client |
|---|---|---|---|---|---|---|
| Read *all* time logs (`VIEW_ALL_ROLES` + migration 094) | ✓ | ✓ | ✓ | — | ✓ | — |
| Read own time logs | own | own | own | — | own | — |
| Create a time entry (must be assigned to the task/issue) | own | own | ✓ | — | own | — |
| Update own time entry | own | own | own | — | own | — |
| Delete own time entry | own | own | own | — | own | — |
| Run the timer / break widget | own | own | own | own | own | own |

## Onboarding Programme & Portfolio Tracker — `/portfolio-tracker`, `/projects/…/onboarding-workspace`

"Tracker" sidebar item hidden from `client` and `developer`. Programme *writes* are `admin / SA / marketing`; migration 070 widened *read* to PM + Developer. `pm` can *start* a programme but not complete phases or edit deliverables.

| Action | Admin | Mktg | PM | Dev | HR / Client |
|---|---|---|---|---|---|
| Read the onboarding timeline & all 5 phases | ✓ | ✓ | ✓ | ✓ | — |
| Read the Phase-1 wizard (onboarding workspace) | ✓ | ✓ | ✓ | — | — |
| Edit the Phase-1 wizard | ✓ | ✓ | — | — | — |
| Start the programme (`WRITE_ROLES` incl. pm) | ✓ | ✓ | ✓ | — | — |
| Complete a programme phase | ✓ | ✓ | — | — | — |
| Update a deliverable's status | ✓ | ✓ | — | — | — |
| Override a deliverable's schedule | ✓ | ✓ | — | — | — |
| Update an internal deliverable | ✓ | ✓ | — | — | — |
| Override a generic phase (`WRITE_ROLES` incl. pm) | ✓ | ✓ | ✓ | — | — |
| Read Phase-1 members | ✓ | ✓ | ✓ | ✓ | — |
| Add / update / remove a Phase-1 member (or the Phase-1 owner) | ✓ | if member | — | — | — |
| Create an onboarding project | ✓ | ✓ | ✓ | — | — |
| Read the cross-project status report | ✓ | ✓ | ✓ | ✓ | HR ✓ / client — |
| Edit status-report notes | ✓ | ✓ | — | — | — |
| Advance the Tracker wizard (`?phase=&deliverable=`) | ✓ | ✓ | ✓ | — | — |

Column order puts Marketing beside Admin here — they own this surface together.

## Admin — `/admin/hub-users`, `/admin/migrate`

Neither is in the sidebar; reachable by direct URL. Every `/api/admin/*` route independently re-checks the caller's role → `403`.

| Action | Admin | PM | Dev | Mktg / HR / Client |
|---|---|---|---|---|
| Open the Hub Users admin page | ✓ | — | — | — |
| Run a Zoho import (per entity) | ✓ | — | — | — |
| Run a Zoho export (per entity) | ✓ | — | — | — |
| Run a Zoho sync (tasklists cron route) | ✓ | — | — | — |
| Run a Desk backfill (archived-ticket CF, inline images) | ✓ | — | — | — |
| Read audit logs | ✓ | — | — | — |
| Insert an event-bus event | ✓ | ✓ | ✓ | — |
| Read the event bus | ✓ | — | — | — |

## MCP Connector & Ops Chat — `/oauth/authorize`, global Ops Chat panel

Ops Chat is a live panel mounted in the hub shell (header input + side panel). External MCP clients authenticate at `/oauth/authorize` and get a scoped token (`scopes.ts`). Both are gated by role and floored by RLS. **This is the only live path to the automation pipeline.**

| Scope / tool | Admin | PM | Dev | HR / Mktg / Client |
|---|---|---|---|---|
| MCP `projects:read` | ✓ | ✓ | ✓ | — |
| MCP `tasks:read` | ✓ | ✓ | ✓ | — |
| MCP `tasks:manage` (create / update / assign) | ✓ | ✓ | — | — |
| MCP `tasks:delete` | ✓ | ✓ | — | — |
| MCP `classifications:read` / `:write` | ✓ | ✓ | — | — |
| MCP `tickets:read` | ✓ | ✓ | — | — |
| MCP `orchestration:run` | ✓ | ✓ | — | — |
| Ops Chat — use it at all | ✓ | ✓ | limited | — |
| Ops Chat — list / update tasks | ✓ | ✓ | own assigned | — |
| Ops Chat — create / assign / delete tasks, update classifications, list tickets, run automation | ✓ | ✓ | — | — |

---

## Audit observations

1. **The `(hub)` layout does not gate routes by role.** It authenticates, resolves the role, and renders. Route protection is spread across sidebar visibility (cosmetic), four page-level `redirect()`s (Desk, Projects V2, New Project, Time Logs), API guards, and RLS. Typing a URL reaches most page shells; the data is what's protected, by RLS.

2. **Large stubbed surface still shows in the nav.** `/orchestration` and `/kb` (Wiki) are sidebar items that open a one-line placeholder; `/dashboard/settings` is the only Admin nav item and is also a stub. "Announcements" is permanently `stub: true`. A first-time user of any staff role hits dead pages from the primary nav.

3. **The AI pipeline has APIs but no live operator UI.** `/api/classification`, `/api/plan`, `/api/assessment` enforce `pm/admin/super_admin` and work, but the only pages that ever called them are in the retired `_hub_(OLD)` tree. In the current app the pipeline is reachable **only** through Ops Chat / the MCP connector. If a classification-review screen is still on the roadmap, the `/orchestration` stub is where it belongs.

4. **`lib/auth/role-access.ts` + `require-role.ts` are stale.** They reference the retired `hub_users` table and the old `dev` role string (current enum is `developer`), and `isRouteAllowed()` default-*allows* unmatched paths. Nothing in the live `(hub)` tree calls `requireRole()`.

5. **RLS is broader than the UI for developers.** Developers have RLS read/write on tickets and `ticket_messages`, and read on Desk contacts/accounts — all hidden or redirected in the app. The connector or a direct PostgREST call would surface data the app never shows them. Marked `rls` above.

6. **Field-level task/issue rules live only in the API + client.** `tasks_developer_update` / `issues_developer_update` enforce row visibility only. "Assignee may only set status to `in_progress` / `ready_for_qa`" is enforced in the PATCH route and React controls, not the database. A hand-crafted PATCH straight to PostgREST could set other fields on an assigned row.

7. **Customer assets rely entirely on application-level checks.** RLS on `customer_assets` / `customer_asset_folders` is a blanket `authenticated` check; all gating (`allowed_roles`, `allowed_user_ids`, credential handling) is in the Next.js routes. Any authenticated user hitting PostgREST directly can read every asset row, including `credential`-type. Migration 085 flagged this deliberately.

8. **Migration 127 (folder-level note sharing) is written but not applied.** Per the Notes-migration convention the agent doesn't apply it. Until it lands, folder shares grant nothing and the folder `GET` degrades to a bare select — per-note collaborator sharing is the only working axis.

9. **Programme write-role sets are inconsistent.** `start` and `generic-phase` allow `pm`; `complete-phase`, `deliverables`, `internal-deliverables`, and `schedule` do not. A PM can begin a 120-day programme but cannot then advance or edit it — likely intentional (marketing owns it), but worth confirming the `start` grant.

10. **`hr.*` schema is fully policied but has zero UI.** `employees`, attendance, leave, timesheets, `hr_requests`, `announcements` all carry a complete RLS matrix (migration 026) and no page renders any of it. The "HR" sidebar item is user-role management (`/dashboard/users`), not the HR schema.

---

## Sources

- `src/app/(hub)/**` page & layout guards; page-body line counts / `Sprint N` placeholder grep for the stub list
- `src/app/api/**/route.ts` role checks
- `supabase/migrations/026, 033, 035, 048, 050–052, 056, 070, 084, 085, 092, 094, 100, 101, 111, 113, 115, 120, 121, 127`
- `src/lib/{tasks,issues,programme,mcp,auth}/*`
- `src/app/(hub)/_components/v2-hub-sidebar.tsx`, `v2-hub-shell.tsx`, `ops-chat.tsx`; `src/lib/mcp/scopes.ts`; `src/lib/ai/ops-chat-tools.ts`
- `src/app/(hub)/projects/_shared/_project-detail-tab-strip.tsx` for the live tab list

Verify against the live policies before relying on any single cell for a security decision.
