# 435: HR Module — Leave Requests, Leave Credits, Holidays, Leave Calendar & Holiday Reminders

**Created:** 2026-10-07
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep (new data model + migration, RLS across 5 roles, cron job, large new UI surface)
**Status:** Planned

---

## Overview

Today the sidebar's **HR** item points only at **Users** (`/dashboard/users`, admin-only; non-admins see a stub). The `hr` Postgres schema from migration 025 (`employees`, `leave_types`, `leave_balances`, `leave_requests`, …) exists with RLS (026/048) but **no application code reads or writes it** — grep finds `schema("hr")` only in `src/types/database.ts`.

This task turns on the leave/holiday half of HR:

| Role | Gets |
|---|---|
| **Super Admin / Admin** | Leave-request queue; approve / deny / cancel; internal admin notes per request; "who's out" overview for any day; holiday management; leave-credit allotments per leave type by **date range** (e.g. 12 days for Jan 15 2026 → Jan 14 2027). |
| **Staff** (every role other than `super_admin`, `admin`, `pm`, and `client`) | Own credits per leave type (allotted / used / pending / remaining); at-a-glance holiday count + dates; **holiday reminder 3 days before each holiday** (in-app + push). |
| **PM** | Everything Staff gets, plus a **team leave calendar** (approved leaves only) in **month / week / day** views. |

Because Admins "view leave requests", something must create them: this task includes a minimal **staff "Request leave"** flow (see Assumption A3 — easy to cut).

## Decisions & Assumptions (review these first)

| # | Decision | Why / how to reverse |
|---|---|---|
| A1 | (**confirmed**) **`hr` role = Admin-level** for this module (full manage). `marketing` and `developer` are Staff. | The brief names only SA/Admin/PM/Staff. `hr` and the HR department already own Users. Flip by editing one constant in `src/lib/hr/access.ts`. |
| A2 | **Leave types are data, not code** (confirmed). Seed three, mirroring Zoho People: *Mandatory holidays*, *Paid time off*, *Personal and sick leave* — **all requestable credits** with allotted / used / remaining (Zoho shows Available + Booked; e.g. 9/0, 9/3, 4/1). Mandatory holidays is the bucket staff book against when swapping a holiday. Admins can add/rename types. | User answers 2026-10-07 + Zoho screenshots. No `system_managed` column needed. |
| A3 | (**confirmed**) Include a **minimal staff "Request leave"** form + "My requests" list (cancel while pending). | Without it the admin queue is permanently empty. Drop Step 9 if requests are created elsewhere. |
| A4 | Credits are **derived at read time** from approved `leave_requests` inside the allotment period; the legacy `hr.leave_balances` (year-int, stored `used`) is **left untouched and unused**. | Ranges like Jan 15 → Jan 14 do not fit `year int`; stored counters drift when a request is cancelled. |
| A5 | Allotments are **org-wide per leave type per period** (no per-employee override yet). `days_allotted NULL` = unlimited. | Brief asks for one company-wide setting. Per-employee overrides = follow-up. |
| A6 | "Absent" in the admin day overview = **approved leave + holidays** only. | `hr.attendance_*` has no writers (no punch feature). Real absence tracking is a follow-up. |
| A7 | (**confirmed**) Approving a request that exceeds remaining credits **warns but is allowed** (admin's call). Overlapping own requests are blocked at creation. | Admins routinely grant exceptions. Switch to hard-block via one check in the PATCH route. |
| A8 | Leave days = **Mon–Fri minus holidays**, half-day request = 0.5. | No work-week config exists. Pure function in `src/lib/hr/leave-days.ts`, easy to change. |
| A9 | Reminder timezone from env `HR_TIMEZONE`, default `Asia/Manila` (**confirmed**). | "3 days before" must be computed on a calendar date, not a UTC instant. |
| A10 | `hr` schema must be **exposed to the Data API** (Supabase dashboard → API → Exposed schemas, and `supabase/config.toml` `schemas`). Currently only `public, graphql_public`. | CLAUDE.md prescribes `.schema("hr").from(...)`. **Step 0 probes this first**; if it cannot be exposed, stop and fall back to `public.hr_*` views — do not silently switch. |
| A11 | **Opening-used adjustments** (confirmed): new `hr.leave_adjustments` (employee × allotment period × `days_used_before`, note). Credits `used = approved-request days in period + days_used_before`. Entered by managers on `/hr/people`. | Staff already have used days in Zoho People (e.g. Paid time off 3 booked); remaining must match from day one. No CSV import in this task. |
| A12 | **Approver = reporting manager** (confirmed): `hr.employees.manager_id` (already exists) identifies the approver. The manager is notified of new requests and can approve / deny / cancel **direct reports' requests only**, plus Admin/SA/HR for everyone. No manager set → falls back to admins. A **PM is not an approver** unless they are the reporting manager. | Managers are a viewer *capability* (has direct reports), orthogonal to role tier. New RLS policy via `manager_id`; `/hr/people` lets managers set "Reporting to". |
| A13 | **Team email on requests** (confirmed): optional `team_emails text[]` on `hr.leave_requests`; on approval, matched Hub users get an in-app notification and every address gets a plain email via `src/lib/email/mailer.ts`. Max 10, validated with zod. | Mirrors Zoho's "Team Email ID" on Apply Time Off. |
| A14 | **Holidays list/calendar toggle** and **Upcoming holidays chips** (next 3: name + `30-Nov-2026, Mon`, "View all") are in scope. | Mirrors Zoho's Holidays page and Activities card. |
| A15 | Date display = `dd-MMM-yyyy, Ddd` in JetBrains Mono (e.g. `30-Nov-2026, Mon`) to match what staff see in Zoho People. Work week Mon–Fri (Zoho shows Sat/Sun = Weekend); timezone Philippine Standard Time (GMT+08:00) confirms A9. | From screenshots. |

## Zoho People Reference (source of truth for parity — screenshots supplied 2026-10-07)

This module replaces the leave/holiday slice of Zoho People (`people.zoho.com/webriqhq`). Parity targets and deliberate departures:

| Zoho People screen | Hub equivalent | Notes |
|---|---|---|
| My Space → **Leave** tab: one card per type (Mandatory Holidays 9 avail / 0 booked, Paid Time Off 9 / 3, Personal and Sick Leaves 4 / 1) | `/hr/my-leave` **credit cards** + overview tiles | Hub shows allotted / used / pending / remaining, not just Available + Booked. Card = icon tile + type name + two mono figures; credit meter added. |
| **Apply Time Off** form: Leave type\*, Date from–to\*, Team Email ID, Reason | `_request-form.tsx` (modal/drawer) | Adds computed working-days preview + remaining-after. Team email = A13. Button reads "Request leave". |
| **Holidays** page: year navigator (`01-Jan-2026 – 31-Dec-2026`), list/calendar toggle, columns Name · Date · Location · Shifts · Classification | `/hr/holidays` | Location/Shifts **dropped** (single location, single shift). Classification kept as `kind`. Year switcher + list/calendar toggle (A14). 2026 seed list in Zoho: New Year's Day 01-Jan, Good Friday 03-Apr, Labor Day 01-May, Independence Day 12-Jun, National Heroes Day 31-Aug, Bonifacio Day 30-Nov, Christmas Day 25-Dec, New Year's Eve 31-Dec — offered as an **optional admin "Import 2026 PH holidays" seed**, not auto-applied. |
| Overview → **Upcoming Holidays** (3 outlined chips + "View all") | Overview card | A14. Next holiday highlighted. |
| **Approvals** tab empty state "All set! No requests pending approval" | Queue empty state | Rewritten to the Hub voice (no exclamation points). |
| Profile: Employee ID (`HRM53`), Reporting To, Department, Shift, Time zone | `/hr/people` shows Employee ID (`employee_number`), department, **Reporting to** | Employee IDs can be imported later; not required. |
| Attendance, Time Logs, Timesheets, Jobs, Files, Related Data (Asset/Benefit/Travel), Check-in/out timer, Feeds, Dashboard | **Out of scope** | Hub already has its own Time Logs; attendance remains a stub (A6). |

## Requirements

### Admin / Super Admin (+ `hr`)
- [ ] List all leave requests; filter by status (pending default), employee, leave type, date range; sort newest first; server-paginated.
- [ ] Request detail drawer: employee, type, dates, computed working days, half-day, reason, credits remaining at time of review, status history.
- [ ] Approve / Deny / Cancel (with optional employee-visible decision note). Deny = DB status `rejected`. Cancel allowed on `pending` **and** `approved`.
- [ ] Internal **admin notes** per request — append-only, author + timestamp, never visible to staff or PMs.
- [ ] **Who's out** overview for a chosen day (default today): approved leaves + whether the day is a holiday.
- [ ] Holidays: add / edit / delete (name, date, kind, optional note); year switcher.
- [ ] People (`/hr/people`): set each employee's **Reporting to**; enter **opening-used days** per leave type for the current period (A11).
- [ ] Leave credits: add / edit / delete allotment periods per leave type with `period_start`–`period_end` and `days_allotted`; periods of the same leave type may not overlap.
- [ ] Notified (in-app + push) when a new request arrives; employee notified on every decision.

### Reporting managers (any role with direct reports — A12)
- [ ] "Team requests" view limited to direct reports; approve / deny / cancel with decision note; same drawer as Admin **minus** internal admin notes.
- [ ] Notified when a direct report requests leave.

### Staff
- [ ] My credits: per leave type — allotted, used, pending, remaining, period range; "No allotment set for this period" state.
- [ ] Holidays at a glance: total for the year + each date (past ones muted, next one highlighted); list ⇄ calendar toggle; "Upcoming holidays" chips on the overview (A14).
- [ ] Holiday reminder 3 days before each holiday (exactly `holiday_date − 3 days`), once per holiday, to every active non-client user.
- [ ] (A3) Request leave; see own requests + status + decision note; cancel own pending request.

### PM
- [ ] All Staff capabilities.
- [ ] Team leave calendar — **approved only** — Month, Week, Day views, with prev/next/today and a person/type filter. Calendar payload exposes name, leave type, dates, half-day flag only — **no reason, no notes**.

### Cross-cutting
- [ ] Follows `_final_design/guide/central-hub-design-system.md` exactly (tokens, type roles, chips, tables, voice) — see **Design Brief**.
- [ ] Follows `nextjs-file-length-best-practices.md` — see **File Budget**.
- [ ] Sidebar: **HR** becomes a collapsible group (same `expanded` map pattern as Desk) with role-filtered children; HR department nav restriction updated.
- [ ] All new tables have RLS; migration is **written, not applied**.

## Out of Scope / Must-Not-Change

- `/dashboard/users` and its components — untouched (only its sidebar parent changes).
- `hr.employees`, `hr.attendance_*`, `hr.timesheets`, `hr.announcements`, `hr.hr_requests`, `hr.leave_balances` — no schema or behaviour changes (attendance/absence tracking, timesheets, announcements stay stubs).
- No per-employee allotment overrides, carry-over/accrual rules, public-holiday auto-import, ICS export, attachments on leave requests, or manager-chain approval.
- No git commands. No `adminClient` for regular reads (use the session client; `adminClient` only for the cron route, notification fan-out, and lazy employee provisioning — each commented inline).
- Do not apply the migration; operator pushes it (project convention).
- Do not use Phase hues (orange/blue/violet/teal/green tints as *Onboard/Migrate/Publish/AI Visibility/Optimize*) to mean leave types — design system forbids reusing phase hues for non-phase meaning.
- No `dark:` classes, no `style={{}}` (except calendar grid CSS variables if unavoidable), no `react-hook-form`.

## Proposed File Changes

### Database — `supabase/migrations/164_hr_leave_holidays.sql` (written, not applied) + `supabase/rollbacks/164_hr_leave_holidays_down.sql`

| Object | Purpose |
|---|---|
| `grant usage on schema hr` + table grants to `authenticated`, `service_role` | A10 — Data API access. |
| `hr.holidays` (`id`, `name`, `holiday_date date`, `kind text check in ('regular','special','company')`, `note`, `created_by`, `created_at`) + `unique(holiday_date, name)` | Holidays. |
| `hr.leave_allotment_periods` (`id`, `leave_type_id → leave_types`, `period_start date`, `period_end date`, `days_allotted numeric(5,2) null`, `created_by`, `created_at`, `check (period_end >= period_start)`) + **exclusion constraint** `(leave_type_id =, daterange(period_start, period_end, '[]') &&)` (needs `btree_gist`) | Range-based credits (A4/A5). |
| `hr.leave_request_notes` (`id`, `leave_request_id → leave_requests on delete cascade`, `author_id → auth.users`, `body text not null`, `created_at`) | Admin notes. |
| `hr.holiday_reminders_sent` (`holiday_id → holidays on delete cascade`, `days_before int`, `sent_at`, `primary key (holiday_id, days_before)`) | Idempotent cron. |
| `hr.leave_adjustments` (`id`, `employee_id`, `leave_type_id`, `period_id → leave_allotment_periods on delete cascade`, `days_used_before numeric(5,2) >= 0`, `note`, `created_by`, `created_at`) + `unique(employee_id, period_id)` | A11 opening-used. RLS: managers all; employee reads own. |
| `alter table hr.leave_requests add column team_emails text[] not null default '{}'` (+ `check (cardinality(team_emails) <= 10)`) | A13. |
| RLS for reporting managers (A12): `leave_requests` select/update where `employee_id in (select id from hr.employees where manager_id = (select id from hr.employees where profile_id = auth.uid()))`; `hr.employees` select where `manager_id` = own employee id. Use a `security definer` helper `hr.is_direct_report(employee_id)` (migration 121 anti-recursion pattern). Updates limited to status transitions via `with check`. | Managers act on direct reports only. |
| Seed `hr.leave_types` rows (A2) — `on conflict (code) do nothing` | Mandatory holidays / Paid time off / Personal and sick leave. |
| Backfill `hr.employees` from `profiles` where `role <> 'client'` and no employee row (`full_name` from profile, `employment_type='full_time'`, `status='active'`) | Staff need an `hr.employees` row for `leave_requests.employee_id`. App also lazily ensures one (`ensureEmployee`). |
| **RLS** (all via `get_my_role()` / `auth.uid()`, never inline role lookups): `holidays` — read: any non-client; write: `super_admin/admin/hr`. `leave_allotment_periods` — same. `leave_request_notes` — `super_admin/admin/hr` only (select + insert). `leave_requests` — add `super_admin` & `marketing` coverage: managers all; `pm` select-all; **any other non-client**: select/insert/update **own** (update restricted to `status → 'cancelled'` while `pending` via `with check`). `hr.employees` — managers all; pm select-all; any non-client select own. `leave_types` read widened to `super_admin`, `marketing`. | Existing 026/048 policies only name `admin/hr/pm/developer` (+ super_admin partially); `marketing` is excluded today. Use `drop policy if exists` + recreate where widening. |
| `pg_cron` job `hr-holiday-reminders` daily 00:05 in `HR_TIMEZONE`-equivalent UTC offset → `net.http_post` to `/api/hr/holiday-reminders` with `x-cron-secret` from Vault (`app_base_url`, `cron_secret_key`) | Copy the `077` vault pattern (`cron.alter_job` if exists else `cron.schedule`). |

### Config / types / auth
| File | Action | Purpose |
|---|---|---|
| `supabase/config.toml` | Modify | Add `"hr"` to `[api] schemas` (local parity with A10). |
| `src/types/database.ts` | Modify | Add `holidays`, `leave_allotment_periods`, `leave_request_notes`, `holiday_reminders_sent` to `Database["hr"]["Tables"]` (with `Relationships[]`) and `admin_notes`-free `leave_requests` stays as is. |
| `src/config/constants.ts` | Modify | `V2_ROUTES.HR`, `HR_LEAVE_REQUESTS`, `HR_CALENDAR`, `HR_HOLIDAYS`, `HR_LEAVE_CREDITS`, `HR_MY_LEAVE` (check whether `ROUTES` must mirror keys). |
| `src/lib/auth/department-map.ts` | Modify | `DEPARTMENT_NAV_RESTRICTION.HR` add `V2_ROUTES.HR` (prefix match covers children). |
| `src/lib/hr/access.ts` | Create | `getHrViewer()` → `{ profileId, employeeId, role, tier: 'manager' \| 'pm' \| 'staff', hasDirectReports }` (A12 capability is orthogonal to tier); single place for A1. Server-only helpers `requireHrTier(...)`. |
| `src/lib/hr/types.ts` | Create | Row/view-model types, status + kind unions, label maps (`rejected` → "Denied"). |
| `src/lib/hr/leave-days.ts` | Create | Pure: `countLeaveDays({start,end,halfDay,holidays})` (A8), `rangeOverlap`, `clipToPeriod`. |
| `src/lib/hr/credits.ts` | Create | Pure: `computeCredits(types, periods, requests, adjustments, today)` → per-type `{allotted, used, pending, remaining, period}`. |
| `src/lib/hr/dates.ts` | Create | Date-only helpers in `HR_TIMEZONE` (`todayInTz`, `addDays`, `startOfWeek`, month grid). **No `new Date("YYYY-MM-DD")` parsing** (UTC shift bug). |
| `src/lib/hr/queries.ts` (+ `queries-requests.ts` if >250 lines) | Create | Server loaders used by pages (session client, paginated `.range()` per CLAUDE.md). |
| `src/lib/hr/employees.ts` | Create | `ensureEmployee(profileId)` (adminClient, commented exception). |
| `src/lib/hr/notify.ts` | Create | Wrappers over `createNotification` for request-created (→ reporting manager, else admins) / decided / holiday reminder. |
| `src/lib/hr/team-email.ts` | Create | A13: resolve `team_emails` to Hub profiles + send plain email via `mailer.ts` on approval. |
| `src/lib/hr/holiday-seed.ts` | Create | Optional PH 2026 holiday list (Zoho reference table) for the admin "Import 2026 PH holidays" action. |

### API routes (each ≤ ~120 lines; zod-validated; auth via `getHrViewer`)
| File | Methods |
|---|---|
| `src/app/api/hr/holidays/route.ts`, `[holidayId]/route.ts` | GET (all non-client), POST/PATCH/DELETE (manager) |
| `src/app/api/hr/leave-allotments/route.ts`, `[periodId]/route.ts` | GET (non-client), POST/PATCH/DELETE (manager; overlap → 409 plain-language) |
| `src/app/api/hr/leave-requests/route.ts` | GET (manager: all+filters+pagination; staff/pm: own), POST (non-client: create own) |
| `src/app/api/hr/leave-requests/[requestId]/route.ts` | PATCH `{ action: 'approve'\|'deny'\|'cancel', decisionNote? }` (manager; staff/pm may only `cancel` own pending) |
| `src/app/api/hr/leave-requests/[requestId]/notes/route.ts` | GET/POST (manager) |
| `src/app/api/hr/calendar/route.ts` | GET `?from&to` (manager + pm) — approved only, restricted columns |
| `src/app/api/hr/people/route.ts`, `[employeeId]/route.ts` | GET (manager), PATCH `{ managerId }` (manager) |
| `src/app/api/hr/leave-adjustments/route.ts` | GET/PUT (manager) — upsert opening-used per employee+period |
| `src/app/api/hr/holidays/seed/route.ts` | POST (manager) — idempotent import of the optional seed list |
| `src/app/api/hr/holiday-reminders/route.ts` | POST — cron-secret **or** manager session (CLAUDE.md cron pattern); finds holidays at `today+3` in `HR_TIMEZONE`, inserts `holiday_reminders_sent` first (unique violation ⇒ skip), then fans out `createNotification` to all active non-client profiles. Add to the cron-route list in CLAUDE.md. |

### UI — `src/app/(hub)/hr/` (pages are thin server components; ≤ 80 lines each)
| File | Purpose |
|---|---|
| `layout.tsx` | Resolves viewer tier once, passes to children via props/context; guards client role → `/dashboard`. |
| `page.tsx` | **Overview**, tier-aware: Manager → stat tiles (Pending, Out today, Next holiday) + Who's out + upcoming holidays; Staff/PM → My credits tiles + holidays card (PM adds link to Calendar). |
| `leave-requests/page.tsx` (managers: all; reporting managers: direct reports only, titled "Team requests") + `_request-table.tsx`, `_request-filters.tsx`, `_request-drawer.tsx`, `_decision-actions.tsx`, `_admin-notes.tsx` | Manager queue. |
| `calendar/page.tsx` + `_leave-calendar.tsx`, `_calendar-toolbar.tsx`, `_month-grid.tsx`, `_week-view.tsx`, `_day-view.tsx` | Manager + PM calendar; Day view doubles as the Admin "who's out" overview. |
| `holidays/page.tsx` + `_holiday-list.tsx`, `_holiday-calendar.tsx`, `_view-toggle.tsx`, `_holiday-form-modal.tsx` | Everyone reads; managers edit. List ⇄ calendar toggle (A14). |
| `people/page.tsx` + `_people-table.tsx`, `_reporting-select.tsx`, `_opening-used-modal.tsx` | Manager-only: Reporting to + opening-used (A11/A12). |
| `_components/upcoming-holidays.tsx` | Next-3 chips + "View all" (A14), used on overview. |
| `leave-credits/page.tsx` + `_allotment-table.tsx`, `_allotment-form-modal.tsx` | Manager: manage periods. |
| `my-leave/page.tsx` + `_credit-cards.tsx`, `_request-form.tsx` (incl. team-email chips input), `_my-requests.tsx` | Staff/PM/Manager: own credits, request, history. |
| `_components/` (shared by ≥2 HR pages): `hr-page-header.tsx`, `status-chip.tsx`, `leave-type-chip.tsx`, `person-avatar.tsx`, `empty-state.tsx`, `skeleton-rows.tsx`, `credit-meter.tsx`, `holiday-chip.tsx` | Design-system primitives, hand-rolled per CLAUDE.md (no shadcn Badge/Progress). |
| `loading.tsx` per route | Skeleton rows, not spinners. |
| `src/app/(hub)/_components/hr-nav.ts` | Role-filtered HR child links (keeps `v2-hub-sidebar.tsx`, already 472 lines, from growing). |
| `src/app/(hub)/_components/v2-hub-sidebar.tsx` | Modify: replace flat `HR` item with collapsible group using `hr-nav.ts`; Users child admin-only. Minimal diff. |

### Docs
| File | Action |
|---|---|
| `CLAUDE.md` | Add an `hr` leave/holiday bullet (tables, derived credits, A10 exposure, cron route in the cron-auth list). Done in the `document` stage, not implementation. |
| `env.example` | Add `HR_TIMEZONE`. |
| `TASKS.md` | Row moved through stages by the workflow. |

## Code Context

### Existing schema to build on (`supabase/migrations/025_v2_schema.sql`)
```sql
create table hr.leave_types (id uuid pk, name text, code text unique, paid boolean default true, accrual_rule jsonb, carry_over_cap numeric, active boolean default true);
create table hr.leave_requests (
  id uuid pk, employee_id → hr.employees, leave_type_id → hr.leave_types,
  start_date date, end_date date, half_day boolean default false, reason text,
  attachment_path text null,
  status text check in ('pending','approved','rejected','cancelled') default 'pending',
  approver_id uuid null → auth.users, decided_at timestamptz null, decision_note text null, created_at);
```
`decision_note` = **employee-visible** note. Admin notes are a separate table so they can never leak through the existing `select` policies.

### RLS gaps to close (`026_rls_policies_v2.sql`, `048_super_admin_rls.sql`)
`hr_employees_developer_own`, `hr_leave_requests_developer_own`, `hr_leave_balances_developer_own` are scoped to `get_my_role() = 'developer'`; `leave_types_staff_read` to `('admin','hr','pm','developer')`. `marketing` has no access; `super_admin` is only covered where 048 patched. New policies use `get_my_role() <> 'client'` for "staff" and `in ('super_admin','admin','hr')` for "manager".

### Sidebar (`v2-hub-sidebar.tsx:112`)
```tsx
const peopleItems: NavItem[] = [
  { label: "HR", icon: <Users size={18} />, href: V2_ROUTES.DASHBOARD_USERS, stub: !isAdmin },
  { label: "Announcements", ..., stub: true },
];
```
Desk (line ~84) already shows the collapsible-parent shape (`children: [{label, href}]`, `expanded` map keyed by label).

### Department gate (`src/lib/auth/department-map.ts`)
`DEPARTMENT_NAV_RESTRICTION.HR = [DASHBOARD_USERS, WIKI]` — prefix match (`p` or `p + "/"`), so adding `V2_ROUTES.HR` (`/hr`) covers all children. HR-department users must still reach `/hr/*`.

### Cron pattern (`src/app/api/programme/reminders/route.ts`, migration 077)
`x-cron-secret === CRONJOB_SECRET_KEY` **or** valid session; insert-first-then-send dedupe (`notifyOnce`); pg_cron + `net.http_post` reading `app_base_url` / `cron_secret_key` from Vault.

### Notifications (`src/lib/notifications/index.ts`)
`createNotification(profileId, { type, title, body, url, actorId })` — writes `notifications` row + best-effort web push. Use `type: 'hr_holiday_reminder' | 'hr_leave_requested' | 'hr_leave_decided'`. Reminder copy per voice guide: *"Company holiday in 3 days — Independence Day · Fri, Jun 12. Swap a workday now if you need to."* (who + what + when, no exclamation).

### Design tokens
Newer v2 pages use the guide's hex directly as Tailwind arbitrary values (`text-[#5F6A88]`, `border-[#E2E7F2]`, `bg-[#F4F6FB]`, `text-[#007BFF]`, `text-[#C0392B]`, `bg-[#F0F7FF]` — 1000+ occurrences in `src/app/(hub)`), not the legacy `isDark` pattern. **Match that**, but centralise: HR primitives in `_components/` own the colour classes so pages never repeat hex. Fonts already loaded in `src/app/layout.tsx` as `--font-display` / `--font-mono` (Space Grotesk / JetBrains Mono) and Inter.

## Design Brief (follow `_final_design/guide/` — and run the skills before building UI)

> **Implementation must invoke `/impeccable:impeccable` (shape → craft) and `/anthropic-skills:frontend-design` before writing any component**, and `/impeccable` critique/polish after. Register = **Product** (dense, familiar, disappears into the task).

**Tokens/type:** page title Space Grotesk 700 22px; panel titles Space Grotesk 600 15px; stat numbers Space Grotesk 700 28px; body Inter 13px `#3A4565`; labels 11px/600 `#5F6A88`; table headers 9.5px/700 caps; **all dates, day counts, credit numbers in JetBrains Mono**. Space Grotesk never in buttons/labels/cells.

**Colour meaning:** navy = selection/filters/active view tab; blue = interactive + approve; **one orange CTA per screen** (Staff: *Request leave*; Holidays: *Add holiday*; Credits: *Set allotment*; Queue: none — approvals are blue); status chips only: Pending = warn tints, Approved = ok, Denied/Cancelled = late/neutral, 5px radius, leading dot. Leave-type chips = **neutral** (`#EDF0F7` / `#5F6A88`). Holidays = `#E5F1FF` / `#0063D6` chip; weekends = `#EDF0F7` cell wash. No phase hues. No left/right accent stripes. No nested cards. Border + `shadow-sm` together on every panel (`rounded-[14px]`).

**Signature pieces**
1. **Credit meter** — pill track (`#EDF0F7`) with fill = used/allotted, pending as hatched/lighter segment, remaining number in mono beside it; turns `warn` ≤ 20% remaining, `late` at 0. Echoes the Programme track.
2. **Month grid** — 7-col, leave shown as avatar-initial pills (24px, stable 6-colour rotation per person), `+N more` popover when > 3; today = navy day pill; holidays tinted + labelled. **Week** = day columns with person rows; **Day** = the "Who's out" list with leave type, return date ("Back Mon, Oct 12"), half-day flag.
3. **Request drawer** — right-side panel; decision actions pinned to the bottom (Approve = blue pill, Deny = ghost with `late` text, Cancel = ghost); admin notes thread beneath, visibly labelled "Internal — only admins see this".
4. **Holiday list** — year switcher + total in a stat tile ("11 holidays"); rows: mono date, name, kind chip, "in 12 days" relative mono tag; next holiday highlighted with `--blue-50`.

**UX rules:** skeleton rows while loading; empty states that teach ("No leave requests waiting — new ones appear here as staff submit them."); errors state problem + fix, no apology; sentence case; buttons name outcomes ("Approve leave", "Deny request", "Cancel approved leave" — never "Submit"); confirm-dialog only for destructive/irreversible (Deny, Cancel approved, Delete allotment/holiday) with consequence text ("Maria will be notified and 3 days return to her Paid time off credits."); optimistic row updates with `sonner` toast on success; inline field errors on forms; date inputs use native `<input type="date">` with mono text; focus ring 2px `#007BFF` offset 2; ≥ 44px touch targets on mobile; calendar degrades to an agenda list < 640px; `prefers-reduced-motion` respected (160ms colour transitions only, no page-load animation); `aria-label` on every icon-only button; calendar cells are buttons with full-date labels; colour never the sole state signal (chips carry text).

## File Budget (per `nextjs-file-length-best-practices.md`)

| Kind | Target | Hard ceiling |
|---|---|---|
| `page.tsx` / `layout.tsx` | ≤ 80 lines (data load + compose) | 150 |
| Client component | 100–250 | 300 (warn) / 400 (never) |
| Route handler | 50–120; business logic in `src/lib/hr/*` | 150 |
| Hook (`_use-*.ts`) | 30–100 | 120 |
| `lib/hr/*` module | 50–150, one concern each | 250 |
| Function / component body | ≤ 60 lines | 75 |

Rules: one-sentence purpose per file; heavy client islands (`_leave-calendar`, `_request-drawer`) via `next/dynamic`; server-only code (`adminClient`, `queries.ts`) never imported by client files; shared state hooks extracted (`_use-leave-requests.ts`, `_use-calendar-range.ts`); no barrel `index.ts` needed. If any file passes ~250 lines during implementation, split before continuing — do not defer.

## Implementation Steps

0. **Gate check (A10).** With a quick throwaway server script/route, run `.schema("hr").from("leave_types").select("id").limit(1)` using the session client against the target DB. If it errors with "schema must be exposed", **stop and report** — operator must add `hr` to Exposed schemas. Do not proceed to UI on an unreachable schema. Read `node_modules/next/dist/docs/` for any App Router API you are unsure of (AGENTS.md).
1. **Migration 164 + rollback** (written, not applied): tables, `btree_gist`, exclusion constraint, grants, seeds, employee backfill, RLS (drop/recreate widened policies), cron job. Verify column/policy names against the live 025/026/048 files before writing `drop policy` lines.
2. **Types + config:** `database.ts`, `constants.ts`, `config.toml`, `env.example`, `department-map.ts`.
3. **Pure libs with a throwaway check script** (project has no test runner): `leave-days.ts`, `credits.ts`, `dates.ts`. Verify with `npx tsx` (or compile + node) over cases: single day, spanning weekend, spanning holiday, half-day, period-edge clipping, overlapping periods, leap/DST-safe date math, Jan-15→Jan-14 range. Delete script after, or keep under `_docs/task/435-checks/`.
4. **Access + queries + employee ensure + notify** (`lib/hr/*`).
5. **API routes** (holidays, allotments, requests, notes, calendar, reminders). Each: auth → zod → lib call → typed JSON. Map DB errors (`23P01` exclusion violation → 409 "This leave type already has an allotment covering part of that range.").
6. **Design pass:** invoke `/impeccable:impeccable` (shape) + `/anthropic-skills:frontend-design`; build `_components/` primitives and verify against `central-hub-style-guide.html` in the browser.
7. **Pages:** Overview → Leave requests (queue + drawer + notes + actions) → Holidays → Leave credits (admin) → Calendar (Month → Week → Day) → My leave (credits).
8. **Sidebar + department gate:** collapsible HR group via `hr-nav.ts`; role-filtered; verify HR-department user reaches `/hr/*` and still cannot reach other areas.
8b. **People page + reporting-manager capability (A11/A12):** `/hr/people`, opening-used modal, manager-scoped queue and RLS; verify a manager with no admin role sees only direct reports.
9. **(A3/A13) Staff request form** + my requests + cancel pending; admin "new request" notification.
10. **Cron route** + local trigger with `x-cron-secret`; confirm second run sends nothing (dedupe).
10b. **Holidays extras (A14):** list/calendar toggle, upcoming chips, optional seed import.
11. **Polish & audit:** `/impeccable` critique + polish; responsive at 375 / 768 / 1280; keyboard walk-through; reduced-motion; file-length audit (`wc -l` every new file against the budget).
12. **Acceptance run** in the browser for all five personas (admin, hr, pm, developer, marketing) + a `client` negative test.

## Acceptance Criteria

**Access**
- [ ] `client` → redirected away from `/hr/*` and gets 403 from `/api/hr/*`.
- [ ] Staff can never read another user's request, any admin note, or `/api/hr/calendar` (403).
- [ ] PM calendar payload contains no `reason`, `decision_note`, or notes (inspect network response).
- [ ] RLS (not just route checks) blocks a staff session from selecting others' `leave_requests` and from selecting `leave_request_notes`.

**Admin**
- [ ] Queue lists requests with working filters; default = Pending; handles > 1000 rows (paginated).
- [ ] Approve / Deny / Cancel update status, `approver_id`, `decided_at`; employee gets an in-app notification; Cancel works on approved.
- [ ] Notes are append-only, show author + time, absent from every non-manager response.
- [ ] Day view for any date lists exactly the approved leaves covering it and flags holidays.
- [ ] Holiday CRUD works; duplicate date+name rejected with a plain message.
- [ ] Allotment "12 days, Jan 15 2026 → Jan 14 2027" saves and displays; an overlapping period for the same type is rejected (409) while the same range for a different type is allowed.

**Reporting managers & Zoho parity**
- [ ] A reporting manager (any role) sees only direct reports' requests, can decide them, and cannot see admin notes or anyone else's requests (verified via RLS, not just UI).
- [ ] With opening-used set to 3 for Paid time off, remaining = allotted − 3 − approved days; editing the adjustment updates credits on next load.
- [ ] Team emails on a request: matched Hub users get an in-app notification and each address an email on approval; > 10 rejected.
- [ ] Holidays list ⇄ calendar toggle shows identical data; overview shows next 3 upcoming holidays as `dd-MMM-yyyy, Ddd` chips + "View all".
- [ ] Credit cards for the three seeded types render like the Zoho Leave tab (type, available/remaining, booked/used) with the added meter.

**Staff / PM**
- [ ] Credits show allotted, used, pending, remaining for the period containing today; changing an allotment or approving/cancelling a request is reflected on next load without any stored counter.
- [ ] Remaining math matches working-day rules (A8) incl. half-day and holidays in range.
- [ ] Holidays card shows the year total and each date; next holiday highlighted.
- [ ] Reminder fires once, exactly 3 days before; re-running the cron the same day sends nothing; adding a holiday < 3 days away does not backfill a reminder.
- [ ] PM Month / Week / Day views show approved leaves only and agree with each other for the same date.

**Design & code quality**
- [ ] Uses only guide tokens/type roles; one orange CTA per screen; no phase hues, accent stripes, nested cards, `dark:` classes, `style={{}}`, or emoji; Space Grotesk absent from buttons/labels/cells; dates/counts in JetBrains Mono.
- [ ] Skeletons on every async view; empty states on every list; every action has loading + error state; focus rings visible; usable at 375px.
- [ ] No new file exceeds 300 lines (hard ceiling 400); pages ≤ 150; route handlers ≤ 150.
- [ ] `npx tsc --noEmit` and `pnpm lint` clean; no `adminClient` import in client files; no `new Date("YYYY-MM-DD")` in HR code.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm build            # --webpack baked in; do not remove
# File-length audit
find "src/app/(hub)/hr" src/app/api/hr src/lib/hr -name '*.ts*' | xargs wc -l | sort -rn | head -20
# Hex/accent audit
grep -rnE "border-l-|border-r-[2-9]|dark:|style=\{\{" "src/app/(hub)/hr" || true
# Cron dedupe (dev server running)
curl -X POST localhost:3000/api/hr/holiday-reminders -H "x-cron-secret: $CRONJOB_SECRET_KEY"   # run twice
```
Browser acceptance (Chrome tools): sign in as each persona; walk the Acceptance Criteria; capture screenshots at 375/768/1280 and compare to `_final_design/guide/central-hub-style-guide.html`. Migration verification is the **operator's** step after `supabase db push` (probe policies with a staff vs manager JWT).

## Compatibility Touchpoints

- **Operator steps (not agent-run):** apply migration 164; add `hr` to Exposed schemas in the Supabase dashboard; set `HR_TIMEZONE` in Vercel/`.env.local`; confirm Vault secrets `app_base_url` / `cron_secret_key` exist (already used by 077/078).
- CLAUDE.md: new `hr` leave/holiday bullet + cron-auth route list + (document stage).
- `_docs/mcp-tools.md`: **no change** — no MCP tools added.
- Sidebar, `department-map.ts`, `constants.ts` are shared files — keep diffs minimal and re-check HR/Finance department behaviour.
- `hr.leave_balances` intentionally orphaned; note in CLAUDE.md so no one wires it back.
- PWA/push: reminders reuse existing `sendPushNotification`; no service-worker change.

## Open Questions for Review

All resolved on 2026-10-07 (A1, A2, A3, A7, A9, A11–A14). Residual assumption: Zoho's "Available" figure is treated as *remaining* and "Booked" as *used*; confirm against one real employee when seeding opening balances.

---

## Implementation Notes

### What Changed
- **Migration 164 (rollback in `supabase/rollbacks/`, outside `migrations/` per repo rule), written not applied:** `hr.holidays`, `hr.leave_allotment_periods` (exclusion constraint blocks overlapping ranges per type), `hr.leave_request_notes` (managers-only), `hr.leave_adjustments`, `hr.holiday_reminders_sent`, `leave_requests.team_emails`; seeds the 3 leave types; backfills `hr.employees` from non-client profiles; widened RLS (super_admin, marketing, self-cancel, reporting-manager via `hr_is_direct_report()`); `pg_cron` job `hr-holiday-reminders` (16:05 UTC = 00:05 Manila).
- **Libs (`src/lib/hr/`):** pure `dates`, `leave-days`, `credits`, `format`, `roles`, `types`; server `access`, `employees`, `queries`, `queries-requests`, `notify`, `team-email`, `schemas`, `api`, `holiday-seed`.
- **API (`/api/hr/*`):** holidays (+seed), leave-allotments, leave-requests (POST own, PATCH approve/deny/cancel, GET credit detail), notes, calendar, people (reporting manager), leave-adjustments, holiday-reminders (cron-secret or manager).
- **UI (`/hr/*`):** Overview, Leave requests / Team requests (queue + review drawer + admin notes), Calendar (Month/Week/Day), Holidays (list ⇄ year calendar, CRUD, optional PH 2026 seed), Leave credits (allotment ranges), People (reporting manager + opening-used), My leave (credits, request form with team emails, my requests). Shared primitives in `hr/_components/` follow the design guide's tokens.
- **Sidebar:** HR is now a collapsible, role-filtered group (`hr-nav.ts`); `isChildActive` special-cases `/hr`; layout → shell → sidebar threads `hasDirectReports` from a new `public.hr_has_direct_reports()` RPC (works without exposing `hr`).
- `V2_ROUTES.HR*`, `DEPARTMENT_NAV_RESTRICTION.HR` includes `/hr`, `config.toml` exposes `hr`, `env.example` adds `HR_TIMEZONE`, `database.ts` typed.

### Files Changed
- New: `supabase/migrations/164_hr_leave_holidays.sql` + `supabase/rollbacks/164_hr_leave_holidays_down.sql`; `src/lib/hr/*` (17 files); `src/app/api/hr/**` (12 routes); `src/app/(hub)/hr/**` (pages, `_components/`, per-route components, `loading.tsx`); `src/app/(hub)/_components/hr-nav.ts`.
- Modified: `src/types/database.ts`, `src/config/constants.ts`, `src/lib/auth/department-map.ts`, `src/app/(hub)/layout.tsx`, `_components/v2-hub-shell.tsx`, `_components/v2-hub-sidebar.tsx`, `supabase/config.toml`, `env.example`, `TASKS.md`.

### Deviations From Plan
- **Step 0 gate failed** (PostgREST: `PGRST106 Invalid schema: hr`). Per the plan I stopped and asked; user chose "build on `hr`, operator exposes it".
- No `GET` list routes for holidays / allotments / requests: pages load via server loaders (`queries*.ts`); only the calendar, request-detail and notes keep `GET`.
- Added (not in plan): `public.hr_has_direct_reports()` RPC + `hasDirectReports` prop; `lib/hr/roles.ts` split out of `access.ts` so the client sidebar never imports server code; `hr_adjustments_reports_read` policy; `api.ts` / `schemas.ts` helpers.
- Plan A2 changed during planning (all 3 types requestable) — migration reflects the final answer, no `system_managed` column.
- `CLAUDE.md` bullet deferred to the `document` stage as planned.

### Verification Run
- `npx tsc --noEmit` — PASS
- `npx eslint` on `src/app/(hub)/hr`, `src/lib/hr`, `src/app/api/hr`, sidebar/layout — PASS
- Throwaway `tsx` check of `leave-days` / `dates` / `credits` (17 cases: weekends, holidays, half-day, period clipping, leap day, DST, Manila "today") — PASS (one expected value in my own test was wrong; the code was right). Script deleted.
- File-length audit: largest new file 131 lines; pages ≤ 60; no `dark:` / accent stripes; one justified `style={{ width }}` in `credit-meter.tsx`; no `new Date("YYYY-MM-DD")`.
- `pnpm build` — type-check PASS, all `/api/hr/*` + `/hr/*` routes compile; process exits 1 only on the sandbox's Google Fonts fetch (`inter_*.module.css`, network), unrelated to this change.
- **SKIPPED — browser acceptance & RLS checks:** `hr` is not exposed and migration 164 is unapplied, so no HR page can load data yet. Operator: expose `hr`, `supabase db push`, set `HR_TIMEZONE`, then run the Acceptance Criteria (5 personas + client negative).

---

## Quality Gate Notes

### Result
PASS

### Standards Review
- **Fixed during the gate:** removed dead `rangesOverlap()` (leave-days.ts); extracted the repeated round-nav / pager / row-icon button class strings (5 copies) into `circleBtn` / `iconBtn` in `hr/_components/ui.ts`. `tsc` and `eslint` re-run clean afterwards.
- No `any`, no commented-out code, no debug logging; errors are mapped to plain-language messages at every route; no secrets. `adminClient` appears only in `employees.ts`, `notify.ts`, `team-email.ts`, notes author-name lookup, and the cron route — each commented, none in a client file.
- File sizes within budget (largest new file 131 lines; pages ≤ 60). One justified `style={{ width }}` (`credit-meter.tsx`, dynamic %).
- Remaining internal-only exports (`periodFor`, `weekdayOf`, `HR_TIMEZONE`, `MutationResult`, `DayRange`) are harmless; left as-is.

### Deviations
- **Minor:** no `GET` list routes (server loaders instead) — satisfies the requirement with less surface.
- **Minor:** added `hr_has_direct_reports()` RPC, `roles.ts`, `api.ts`, `schemas.ts`, `hr_adjustments_reports_read` policy — supporting pieces required by A12 / the client–server split; no scope expansion.
- **Medium (visible, acceptable):** `team_emails` (A13) lets a requester make the Hub email any ≤10 addresses on approval (fixed body text, from the Hub's `FROM`). Consider restricting to the company domain before wide rollout.
- **Medium (visible, acceptable):** the holiday reminder targets every `profiles.role <> 'client'`; if deactivated users keep a profile row they will still be notified. Verify against the real data during testing.
- **Medium (carried from implement):** nothing has been exercised against a database (`hr` not exposed, migration 164 unapplied) — the `test` stage must be run after the operator steps.

### Required Fixes
- None.

---

## Course Correction (2026-10-07, after implement/simplify)

The Supabase project **cannot expose the `hr` schema** to the Data API (PGRST106; no dashboard access to enable it), and migration 164 had already been applied. Decision (user): **move the feature to `public.hr_*` tables**.

- `164_hr_leave_holidays.sql` restored to what was applied (history preserved); it built the new tables inside `hr`.
- New `165_hr_public_tables.sql` (+ `supabase/rollbacks/165_hr_public_tables_down.sql`): creates `hr_employees`, `hr_leave_types`, `hr_leave_requests`, `hr_holidays`, `hr_leave_allotment_periods`, `hr_leave_request_notes`, `hr_leave_adjustments`, `hr_holiday_reminders_sent` with explicit grants, RLS (same policies, new names), seeds + employee backfill; **re-points** `hr_my_employee_id()` / `hr_is_direct_report()` / `hr_has_direct_reports()` at the public tables (`create or replace`); drops the 5 now-unreachable `hr.*` tables from 164. The legacy 025 `hr.*` tables are untouched.
- Code: every `.schema("hr").from("x")` → `.from("hr_x")`; embeds aliased (`employees:hr_employees(full_name)`); `database.ts` moved the types under `public`; `config.toml` reverted. The earlier layout probe now checks `hr_holidays` and shows a setup message if 165 isn't applied.
- Supersedes plan assumption A10 (schema exposure) — no longer required. `CLAUDE.md`'s `.schema("hr")` note should mention that leave/holiday data lives in `public.hr_*` (document stage).
- Verification: `tsc` and `eslint` clean after the change. Not yet run against the database.

---

## UI Follow-up (2026-10-07): datepicker + tooltips

- **`hr/_components/date-field.tsx` (new `DateField`)** replaces every native `<input type="date">`. It reuses the Time Logs calendar (`DayPanel`, `usePopoverPosition`, `toISODate`/`fromISODate` from `dashboard/timelogs/`), portaled at `z-[70]` (above the HR modal's `z-[60]`), flips above the trigger when there's no room below, clamps to the viewport width, and closes on outside click / Escape (Escape does not close the parent modal). Trigger shows `30-Nov-2026, Mon` in mono. `min`/`max` map to react-day-picker `disabled` matchers and are re-checked on pick (the "Today" link ignores them otherwise).
- Used in: `my-leave/_request-form.tsx` (First/Last day, `min` preserved), `holidays/_holiday-form-modal.tsx`, `leave-credits/_allotment-form-modal.tsx` (end `min` = start). The New Project picker is date+time, so the date-only Time Logs one was the closer fit.
- **Tooltips:** `title=` hovers in `holidays/_holiday-calendar.tsx` (holiday name + date) and `calendar/_week-view.tsx` (leave type) now use `@/components/ui/tooltip` (portal, `z-[100000]`, Base UI collision flip/shift), keyboard-focusable triggers. No `title=` hovers remain in `hr/`.
- Verification: `tsc --noEmit` and `eslint src/app/(hub)/hr` clean. Browser check of the popover inside modals and tooltips at calendar edges still to do in the test stage.

## Requester-local "today" on the request form (2026-10-07)

- `my-leave/_request-form.tsx`: the earliest pickable day is `min(company today, requester's browser-local today)`, so a requester behind Manila (e.g. US) can file for their own current day. Someone at or ahead of Manila is unchanged (Manila today). The value only feeds the `DateField` limits, never rendered text, so there is no hydration mismatch.
- No server change: `POST /api/hr/leave-requests` never rejected past dates. Day counting is unchanged (Mon–Fri minus Philippine holidays); leave dates stay plain calendar days, "today" elsewhere (who's out, reminders, current allotment period) stays on `HR_TIMEZONE`.
- Known limit: holidays are a single company list (Philippine); US holidays would apply to everyone if added.
- Verification: `tsc --noEmit` and `eslint` clean; not yet checked in a browser.

## Avatars + admin-only "Reporting to" (2026-10-07)

- `PersonAvatar` now shows the person's `profiles.avatar_url` photo (initials fallback, same as the rest of the Hub). Photos reach it through an `AvatarUrlProvider` context set once in `hr/layout.tsx` from `lib/hr/avatars.ts` (`loadPersonDirectory()`: employee id → photo + role). It reads `hr_employees` and `profiles` with `adminClient` (profiles are owner-read under RLS; display fields only, commented exception, same as the project listings).
- People page: "Reporting to" is a new `people/_manager-select.tsx` listbox (photo + name, portaled, flips above near the screen bottom) offering only people whose account role is `super_admin`/`admin`/`hr` (`MANAGER_ROLES`). A manager set earlier who isn't an admin stays visible on that row so nothing silently changes.
- Verification: `tsc` and `eslint` clean; not yet checked in a browser.

## Browser Acceptance (2026-10-07, Super Admin session, localhost:3000, migration 165 applied)

PASS: Overview (credits 8/12/5, who's out, next holiday) · Request leave (DateField opens Time Logs calendar, past days disabled, live "Uses 1 day · 7 left after", submit → Pending 1) · Leave requests (filter tabs sync to `?status=`, drawer, admin note saved with author/date, approve → credits used 1, cancel approved leave via confirm dialog → credits restored) · Calendar month + week show approved leave with photo avatar · Holidays list + calendar toggle, tooltip on Apr 3 on-screen and unclipped · Add holiday modal: DateField popover over the modal, Escape closes only the popover · Leave credits (3 current allotments) · People: photo avatars, "Reporting to" lists admins only with photos.

Not tested: other personas (PM, staff, reporting manager, hr, client) — need their sessions; RLS negative checks; day view; cron dedupe; holiday seed button; opening-used modal; deny flow; team-email send.

Polish found (not fixed): week-view leave tooltip covers the day header (consider `side="bottom"`); "Edit used days" wraps to two lines on People; request-detail drawer shifts layout when the detail finishes loading; DateField trigger truncates the weekday in the narrow Request leave column; week view reset to the current week when switching from month.

### Polish fixes (2026-10-07, after acceptance)
- Week-view leave tooltip now opens below the chip (no longer covers the day header).
- People: "Edit used days" is `whitespace-nowrap` in a wider (`w-36`) column.
- Request drawer: loading skeletons sized to the loaded content (credits line, admin notes) so the layout no longer jumps.
- Request leave: First/Last day stack vertically so the full `19-Oct-2026, Mon` shows.
- Calendar "reset to current week" was not a bug: the page ignores `?date=` and always opens on today (my test URL carried one).
- Verification: `tsc`/`eslint` clean; request form re-checked in the browser, others not re-run.

## Status

Marked **Completed** in `TASKS.md` on 2026-10-07. Outstanding for the operator: apply `165_hr_public_tables.sql`, set `HR_TIMEZONE=Asia/Manila`; live browser/RLS/cron-dedupe acceptance and the `CLAUDE.md` document-stage note are still open.
