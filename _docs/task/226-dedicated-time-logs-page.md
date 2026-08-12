# 226: Dedicated Time Logs Page (`/v2/dashboard/timelogs`)

**Created:** 2026-08-12
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Testing

---

## Overview

Build out the stubbed `/v2/dashboard/timelogs` route (`V2_ROUTES.DASHBOARD_TIMELOGS`, currently a
one-line placeholder) into a real, dedicated Time Logs page — a cross-project table of every
`time_logs` entry, filterable by period (Day / Week / Month / Range) and exportable to PDF. This
is a **new, standalone page**, distinct from the existing per-task "Time Logs" tab on the task
detail page (tasks 214/215, at `.../tasks/[taskId]/_task-time-logs.tsx`) — that tab stays exactly
as-is and is not touched by this task. This page answers "show me time logged across all my
work / everyone's work over a period," not "show me time logged on this one task."

Reference screenshots (Zoho Projects): four screenshots of a Day/Week/Month/Range date picker
modal, and one screenshot of the target list layout (toolbar with Group-By/List dropdowns, date
navigator, filter icon, "Add Time Log" split button; table columns ID / Log Title / Project /
Daily Log Hours / Time Period / Date / Billing Type / Notes / Created By, rows grouped under a
bold per-user subtotal row). Per the user's explicit instruction, **no Billing Type column** —
everything else is adapted to this codebase's own design tokens (light theme, `_final_design/guide`
palette), not Zoho's dark theme — the screenshots are a UX/interaction reference, not a literal
visual spec.

**Assumptions made below (not explicitly stated by the user — flagged so they can be corrected
before implementation, not silently decided):**

1. **"Super Admin, Admin, PM" view-all set is widened to include `hr`.** The existing
   `time_logs_manager_read` RLS policy (migration 048) already groups `admin`, `super_admin`,
   `pm`, `hr` together as the DB's own definition of "can read every time-log row." Since HR
   already has that underlying read access, this page's role gate reuses the same four-role group
   rather than inventing a narrower one that would just hide data HR can already query directly.
   `client` and `marketing` get no access (no RLS policy grants them any `time_logs` rows, and
   there's nothing in the user's request suggesting they should see this page).
2. **"Restricted from adding for others" is enforced structurally, not by a role check.** The
   underlying `POST` route always inserts `employee_id: user.id` from the session — it never
   accepts a client-supplied employee — so no role, including admin/super_admin/PM, can ever log
   time as someone else. This task loosens that route's *role* gate (currently hard-coded to
   `role === "developer"` only) to "any authenticated role, provided they're assigned to the
   chosen task," so a PM/admin can log their own hours too, matching the user's generic "User can
   also add/edit for his/her own."
3. **No separate "Group By User" vs "List" view toggle.** The reference screenshot has both a
   grouping dropdown and a view-type dropdown; this task collapses that to one fixed behavior:
   view-all roles (admin/super_admin/pm/hr) see entries grouped under a collapsible per-user
   section with a period subtotal (matches the screenshot's default state); the developer's
   self-only view is always a flat list (grouping by "just me" would be a no-op group header).
4. **Project filter is a simple single-select dropdown**, not the portal-based checkbox
   `FilterMultiSelect` built for Portfolio Tracker (`_filter-multi-select.tsx`) — that component's
   own header comment scopes it to the Portfolio Tracker feature area on purpose (task 224:
   "does not cross into `/v2/projects`, which keeps its own copy"). Time Logs is a third feature
   area; duplicating the elaborate portal/multi-check version here for one filter is not
   justified by the ask. A plain `<select>` is enough.
5. **Add Time Log task-picker only lists tasks the current user is assigned to**, not every task
   in the chosen project — the underlying POST route 403s on non-assignees regardless, so
   listing only eligible tasks avoids a pick-then-fail loop.
6. **Export to PDF is client-side** (`jspdf` + `jspdf-autotable`, new `pnpm` dependencies — no PDF
   library exists in this repo today). It renders whatever the current filter (period + project +
   role scope) resolves to server-side (see point below on the 1000-row cap), not just whatever
   happens to be scrolled into view.

## Requirements

- [ ] New sidebar entry "Time Logs" (Clock icon) under the "Work" group, linking to
      `V2_ROUTES.DASHBOARD_TIMELOGS`, visible to every role except `client`/`marketing`.
- [ ] `page.tsx` (server component) — auth guard + role fetch, `redirect(V2_ROUTES.DASHBOARD)` for
      `client`/`marketing`, passes `role` + `currentUserId` to the client content component
      (mirrors `portfolio-tracker/page.tsx`'s exact pattern).
- [ ] Period filter — four modes matching the reference screenshots:
      - **Day**: single date, calendar with ISO week-number gutter, "Today" quick link.
      - **Week**: Mon–Sun, selecting any day highlights/selects its whole week, "Current Week"
        quick link.
      - **Month**: a Jan–Dec grid with year prev/next, "Current Month" quick link.
      - **Range**: two-month side-by-side calendar, arbitrary start/end.
      All four share one modal shell with Day/Week/Month/Range tabs (orange active-tab underline)
      and OK/Cancel actions; the trigger shows `< {formatted date/range} >` with prev/next arrows
      that step by the active mode's unit (day/week/month/range-length).
- [ ] Table columns (no Billing Type): Log Title (task title), Project, Daily Log Hours (`hh:mm`
      via `formatHoursAsHHMM`), Time Period (`hh:mm am/pm - hh:mm am/pm` via `formatClockTime`, em
      dash if unset), Date, Notes (icon-trigger tooltip, matching task 215's QA-follow-up pattern),
      edit/delete icon actions (own entries only).
- [ ] View-all roles (`admin`, `super_admin`, `pm`, `hr`): every entry across every project for the
      active period, grouped under a collapsible per-user section (avatar, name, period subtotal).
      Optional single-select Project filter narrows this further.
- [ ] `developer` role: only their own entries, flat list, no per-user grouping, no "Created By"
      column (redundant when every row is already theirs).
- [ ] "Add Time Log" — orange CTA, opens a modal: Project select → Task select (only tasks the
      current user is assigned to) → Date → Start Time → End Time → Note, same field shape and
      client-side ISO construction as `_time-log-form.tsx` (task 215). On submit, POSTs to the
      existing `/api/v2/tasks/[taskId]/time-logs` route once a task is chosen.
- [ ] Edit — opens the same field set pre-filled, `PATCH`es
      `/api/v2/tasks/[taskId]/time-logs/[timeLogId]`; only rendered on entries where
      `can_edit` is true (i.e., `employee_id === current user`), regardless of role.
- [ ] Export to PDF — button in the toolbar (ghost/blue, not competing with the orange "Add Time
      Log" CTA per the one-CTA-per-screen rule), generates a PDF of every row matching the current
      filter (period + project + role scope), not just the current viewport.
- [ ] Every new/modified file respects `nextjs-file-length-best-practices.md` — the period-picker
      in particular is non-trivial (four modes) and should be split across at least two files
      rather than grown into one.
- [ ] Visual language matches `_final_design/guide/central-hub-design-system.md` tokens (inline
      hex, no `dark:`/`bg-background` — per CLAUDE.md's UI Polish Conventions). Calendar day pills
      use `--navy` (`#071133`, "day pills, active filters" per the token comment), CTA uses
      `--orange` (`#FB914E`), OK/Cancel and other confirm actions use `--blue`/ghost per the
      Buttons section.

## Out of Scope / Must-Not-Change

- The task-detail "Time Logs" tab (`_task-time-logs.tsx`, `_time-log-form.tsx`,
  `_timer-timeline-popover.tsx`) — untouched. This is a new, separate surface over the same table.
- `TaskTimerButton` / `active_timers` / `TimerContext` / the floating timer widget — untouched.
  This page is a read/manual-entry surface, not a timer control.
- No new RLS migration. `time_logs_manager_read` (admin/super_admin/pm/hr, migration 048) and
  `time_logs_developer_own` + `time_logs_developer_read_all` (developer, migrations 026/094)
  already cover every access pattern this page needs — write access stays exactly as strict as it
  is today (owner-row only), this task only reuses it from a new client surface.
- No Billing Type column or field anywhere in this page (explicit user instruction) — new manual
  entries keep inserting `billable: false`, same as the existing tab.
- No "Group By User" / "List" view-type dropdown (see Assumption 3) — fixed grouped-vs-flat
  behavior by role instead.
- No global cross-project "my tasks" endpoint is created — the Add modal's task step reuses the
  existing per-project `GET /api/v2/projects/[projectId]/tasks` and filters to
  `assignees?.includes(currentUserId)` client-side (Assumption 5); no new endpoint needed for it.
- Issues (`time_logs.issue_id`) are not selectable in the Add modal — this codebase has no Issues
  browsing UI yet (per CLAUDE.md, import-only), so the picker only offers Project → Task.
- Delete is included (the underlying `DELETE` route already exists and task 214 established the
  add/edit/delete triad) but is not the focus — same `confirm()`-based pattern as the existing tab,
  no new confirmation modal component.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/dashboard/timelogs/page.tsx` | Modify | Replace stub with server-component auth/role guard, mirrors `portfolio-tracker/page.tsx` |
| `src/app/v2/(hub)/dashboard/timelogs/_time-logs-content.tsx` | Create | Client shell — toolbar (period picker, project filter, Add Time Log, Export PDF), fetch, role-based grouped/flat table dispatch |
| `src/app/v2/(hub)/dashboard/timelogs/_time-logs-table.tsx` | Create | Table body — grouped-by-user (view-all) or flat (developer) rendering, empty/loading states |
| `src/app/v2/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx` | Create | Add/Edit modal — Project→Task→Date→Start→End→Note, posts to the per-task route |
| `src/app/v2/(hub)/dashboard/timelogs/_time-period-picker.tsx` | Create | Picker shell — Day/Week/Month/Range tabs, trigger button, OK/Cancel, delegates to panel components |
| `src/app/v2/(hub)/dashboard/timelogs/_time-period-panels.tsx` | Create | The four mode-specific panels (Day/Week calendar via react-day-picker, Month grid, Range dual-calendar) — split out to keep the picker shell under the file-length guideline |
| `src/app/v2/(hub)/dashboard/timelogs/_export-pdf.ts` | Create | `exportTimeLogsToPdf(entries, meta)` — jspdf + jspdf-autotable table export |
| `src/app/api/v2/time-logs/route.ts` | Create | `GET` — cross-project, role-scoped, period+project filtered list (the new aggregate query this page needs) |
| `src/app/api/v2/tasks/[taskId]/time-logs/route.ts` | Modify | Loosen `POST`'s role gate from `role === "developer"` to any role, assignee-gate unchanged (line 94) |
| `src/app/api/v2/projects/route.ts` | Modify | Add `project_id` to the `GET` select list (line 19) — needed to link a picked project to its tasks route, which addresses by `project_id`, not `id` |
| `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` | Modify | Add "Time Logs" nav item (Clock icon) to `workItems`, gated out for `client`/`marketing` |
| `package.json` | Modify | Add `jspdf`, `jspdf-autotable` (`pnpm add jspdf jspdf-autotable`) |

## Code Context

### Current stub (`dashboard/timelogs/page.tsx`, full file)

```tsx
export default function TimelogsPage() {
  return (
    <div className="py-6.5 px-8">
      <p className="text-sm text-muted-foreground">v2 · Time Logs · Sprint 1A</p>
    </div>
  );
}
```

### Precedent to mirror exactly: `portfolio-tracker/page.tsx` (full file)

```tsx
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { V2_ROUTES } from "@/config/constants";
import OnboardingList from "./_onboarding-list";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Portfolio Tracker" };

export default async function OnboardingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect(V2_ROUTES.AUTH_LOGIN);

  const userId = data.claims.sub as string;
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const role = profile?.role ?? null;

  if (role === "client") redirect(V2_ROUTES.DASHBOARD);

  return <OnboardingList role={role} currentUserId={userId} />;
}
```
New page's guard: `if (role === "client" || role === "marketing") redirect(V2_ROUTES.DASHBOARD);`

### `time_logs` table (post-migration-095 shape)

```ts
time_logs: {
  id, task_id, issue_id, project_id, employee_id, date_logged, hours, billable,
  note, source: "timer" | "manual", timesheet_id, external_id, owner_name, owner_email,
  created_at, start_time, end_time, timeline,
}
```

### RLS already in place — this task adds no migration

```sql
-- migration 048 (view-all)
create policy "time_logs_manager_read" on time_logs for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'hr'));

-- migration 026 (own-row write)
create policy "time_logs_developer_own" on time_logs for all to authenticated
  using (get_my_role() = 'developer' and employee_id = auth.uid())
  with check (get_my_role() = 'developer' and employee_id = auth.uid());

-- migration 094 (developer read-all, used by the per-task tab; harmless for this page too)
create policy "time_logs_developer_read_all" on time_logs for select to authenticated
  using (get_my_role() = 'developer');
```

### Existing per-task POST route — exact change needed (`api/v2/tasks/[taskId]/time-logs/route.ts:93-96`)

```ts
const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
if (profile?.role !== "developer") {
  return NextResponse.json({ error: "Only developers can log time" }, { status: 403 });
}
```
Change to: drop the role check entirely (or check `profile?.role` is a known internal role,
excluding `client`) — the very next block already enforces
`task.assignees?.includes(user.id)`, which is the real gate. Update the error message
accordingly (e.g. `"You must be assigned to this task to log time"`, matching the assignee-gate
message already used lower in the same function). The task-detail tab's own `GET`'s `canAdd`
computation (same file, line 71-75, `if (profile?.role === "developer")`) also currently hides its
own tab's "Add Time Log" button for non-developers — leave that specific `canAdd` line as-is
(task 214/215 scope, not part of this task) unless it visibly breaks; this task's new page computes
its own add-eligibility independently in `_time-log-entry-modal.tsx`, it does not depend on that
flag.

### Existing per-task GET route's name-resolution + `canSeeSource` pattern — reuse in the new aggregate `GET /api/v2/time-logs`

```ts
const SOURCE_VISIBLE_ROLES = ["admin", "super_admin", "pm", "hr"];
function resolveOwnerName(row, profileNames) { /* employee_id -> profiles.full_name, else owner_name/owner_email */ }
```
The new route needs the same shape, plus a `project_name`/`task_title` join (batch-fetch
`projects`/`tasks` by the distinct ids in the result set, same `Map`-based pattern — do not use a
PostgREST embed since `employee_id` has no FK to `profiles` to embed through, exactly as the
existing route's comment explains).

### `>1000-row` pagination rule — directly applicable here (CLAUDE.md)

> Any `.select()` that could return more than 1000 rows must paginate with `.range()` ...
> Has caused two separate live-run bugs ... see `zoho-import/timelogs/route.ts:104-119` for the
> canonical example.

`GET /api/v2/time-logs` for an admin viewing a wide Range with no project filter is exactly this
shape. Loop with `.range()` (`PAGE = 1000`) server-side until a short page returns, so both the
on-screen table and the PDF export ("export what's filtered") are complete, not silently
truncated at 1000. Do not add client-visible pagination controls for v1 — the period filter is the
existing, sufficient bound (matches the reference screenshot, which has no pager).

### `GET /api/v2/projects` — field to add (`api/v2/projects/route.ts:19`)

```ts
.select("id,name,project_type,status,customer_id,description,created_at,updated_at")
```
→ add `project_id` (the human-readable id `/api/v2/projects/[projectId]/tasks` addresses by) so
the Add modal's Project step can link straight to the Task step's fetch URL.

### `GET /api/v2/projects/[projectId]/tasks` — reused as-is for the Add modal's Task step

```ts
const { data: project } = await supabase.from("projects").select("id").eq("project_id", projectId).single();
const { data } = await supabase.from("tasks").select("*").eq("project_id", project.id).is("parent_task_id", null)...
```
Filter the response client-side to `assignees?.includes(currentUserId)` before populating the
Task select (Assumption 5) — no server change needed here.

### `formatHoursAsHHMM` / `formatClockTime` (`src/lib/timer/format.ts`) — reuse, do not reimplement

```ts
export function formatHoursAsHHMM(hours: number): string { /* 1.5 -> "01:30" */ }
export function formatClockTime(iso: string): string { /* "hh:mm am/pm" lowercase */ }
```

### `Avatar` (`dashboard/_components/dashboard-shared.tsx:161`) — reuse for the per-user group header

```tsx
export function Avatar({ initials, size = 7, idx = 0 }: { initials: string; size?: number; idx?: number }) { /* AVATAR_COLORS rotation */ }
```
Derive `initials` from `display_name` and a stable `idx` (e.g. sum of char codes mod
`AVATAR_COLORS.length`) the same way sibling dashboard components already do — do not import
`OwnerChip` from `projects/_pm-shared.tsx` (a different feature area's local component; this
page's own directory already has an equivalent).

### Sidebar nav — insertion point (`v2-hub-sidebar.tsx:33-46`)

```tsx
const workItems: NavItem[] = [
  { label: "Dashboard", icon: <LayoutDashboard size={18} />, href: V2_ROUTES.DASHBOARD, exact: true },
  ...
  { label: "Projects", icon: <FolderKanban size={18} />, href: V2_ROUTES.PROJECTS },
  ...
];
```
Add (all roles except client/marketing get this item — no `isDev`/`isAdmin`-style conditional
needed, unlike the existing `!isDev`/`role !== "client"` guards on neighboring items):
```tsx
...(role !== "client" && role !== "marketing" ? [
  { label: "Time Logs", icon: <Clock size={18} />, href: V2_ROUTES.DASHBOARD_TIMELOGS },
] : []),
```
Import `Clock` from `lucide-react` alongside the existing icon imports.

### Design tokens (`_final_design/guide/central-hub-design-system.md`)

```
--navy: #071133   (day pills, active filters, group headers)
--blue: #007BFF / --blue-700: #0063D6   (confirm/navigate actions, links)
--orange: #FB914E / --orange-600: #E2762F   (the one CTA per screen — "Add Time Log")
--ink: #0B1533   --body: #3A4565   --muted: #5F6A88   --line: #E2E7F2   --line-soft: #EDF0F7
--bg: #F4F6FB   --surface: #FFFFFF
Table: header 9.5px/700 caps --muted on #FAFBFE, row hover --blue-50, first column padded 18px.
Buttons: pill radius 999px; CTA orange one-per-screen; confirm/navigate blue; ghost white+line border.
```

## Implementation Steps

1. `pnpm add jspdf jspdf-autotable`.
2. Add `project_id` to `GET /api/v2/projects`'s select list.
3. Loosen the role gate in `POST /api/v2/tasks/[taskId]/time-logs` (keep the assignee-gate).
4. Build `GET /api/v2/time-logs` — resolve caller's role; view-all roles query every row in
   `[from, to]` (optionally `.eq("project_id", ...)`), self-only role additionally filters
   `.eq("employee_id", user.id)`; batch-resolve `profiles`/`projects`/`tasks` names via `Map`s
   (same pattern as the per-task route); loop `.range()` to avoid the 1000-row cap; return
   `{ entries, groupByUser: boolean }` (or compute grouping client-side — implementer's call,
   keep the route itself simple).
5. Build `_time-period-panels.tsx` (Day/Week calendar on `react-day-picker` with
   `showWeekNumber`; Month as a manual 12-button grid + year nav; Range as
   `react-day-picker`'s `mode="range"` with `numberOfMonths={2}`), then `_time-period-picker.tsx`
   (tab shell + trigger button + OK/Cancel wrapping the panels).
6. Build `_time-log-entry-modal.tsx` (Project select → fetch+filter Task select → Date/Start/End/
   Note, same validation shape as `_time-log-form.tsx`) — POSTs/PATCHes the per-task routes once a
   `taskId` is resolved.
7. Build `_time-logs-table.tsx` (grouped-by-user vs flat dispatch, empty/loading states, edit/
   delete icon actions gated on `can_edit`) and `_export-pdf.ts` (`jspdf-autotable` from the
   currently-loaded filtered entries).
8. Build `_time-logs-content.tsx` (toolbar wiring: period picker, project `<select>`, Add Time Log
   button opening the modal, Export PDF button, fetch-on-filter-change, renders the table).
9. Wire `page.tsx` (server guard, mirrors `portfolio-tracker/page.tsx`).
10. Add the sidebar "Time Logs" nav item.
11. Run `npx tsc --noEmit` and `pnpm lint`; browser-verify as a developer (see only own entries,
    add/edit/delete own, cannot see a "Created By" column or other users' rows), and as PM/admin/
    super_admin/hr (see every entry grouped by user across projects, filter by Day/Week/Month/
    Range and by project, export a filtered PDF, no add-for-others path exists anywhere in the UI).

## Acceptance Criteria

- [ ] `/v2/dashboard/timelogs` shows a real page (not the Sprint 1A stub), reachable from a new
      sidebar "Time Logs" item, redirects `client`/`marketing` away.
- [ ] Developer sees only their own entries, flat list, all four period filters work correctly
      (Week = Mon–Sun containing the selected day; Month = full calendar month; Range = arbitrary
      start/end inclusive).
- [ ] Admin/Super Admin/PM/HR see every entry across every project for the active period, grouped
      under a collapsible per-user section with a correct period subtotal; an optional project
      filter narrows the same query.
- [ ] A user can add a manual time log for themselves via Project→Task→Date→Start→End→Note; the
      task-picker only offers tasks they're assigned to; submitting for a task they're not
      assigned to is impossible from this UI (and still 403s server-side if forced).
- [ ] No control anywhere in this page lets any role — including admin/super_admin/PM — submit a
      time log with someone else as the owner.
- [ ] A user can edit or delete only their own entries; no edit/delete affordance renders on any
      entry that isn't theirs, regardless of role.
- [ ] Export to PDF produces a document containing every row matching the current filter (period +
      project + role scope), not just the rows currently rendered/scrolled into view, and excludes
      any Billing Type field.
- [ ] `npx tsc --noEmit` and `pnpm lint` both pass; no new file exceeds the file-length guideline
      without a documented reason.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```
Manual/browser: as a developer, open Time Logs, confirm only own entries show, cycle through
Day/Week/Month/Range, add + edit + delete an own entry. As PM/admin/super_admin/hr, confirm every
user's entries show grouped by user, filter by project, export a PDF and check its row count
against the active filter. Attempt (via devtools/network tab, not UI) to POST a time log with a
different `employee_id` and confirm the server still inserts the caller's own id regardless.

## Compatibility Touchpoints

- New `pnpm` dependencies (`jspdf`, `jspdf-autotable`) — purely client-side, no server/env changes.
- Does not affect the MCP tool inventory (`_docs/mcp-tools.md`).
- Does not affect Zoho export/import routes or the per-task Time Logs tab (tasks 214/215).
- `GET /api/v2/projects`'s added `project_id` field is additive — existing callers selecting a
  subset of fields via the same query are unaffected; anything already spreading the full response
  object gains one extra field, which is safe.
- The `POST /api/v2/tasks/[taskId]/time-logs` role-gate loosening is a **behavior change** on an
  existing, already-shipped route (tasks 214/215) — after this change, any authenticated
  non-client role assigned to a task can log manual time against it via the task-detail tab too
  (not just via this new page), where previously only `developer` could. This is the intended,
  requested widening ("User can also add/edit for his/her own" is role-generic), but it does mean
  the task-detail tab's own behavior changes as a side effect of this task, worth calling out
  explicitly during review since that tab's own task doc didn't anticipate it.

## Implementation Notes

### What Changed
- Added `GET /api/v2/time-logs?from=&to=&project_id=` — the new cross-project, role-scoped,
  `.range()`-paginated list endpoint the dedicated page needed (view-all roles get every entry in
  range; `developer` is additionally filtered to `employee_id = self`; `client`/`marketing` 403).
- Loosened `POST /api/v2/tasks/[taskId]/time-logs`'s role gate from hard-coded `role ===
  "developer"` to any non-client/known role, keeping the assignee-gate unchanged — this also
  affects the pre-existing task-detail Time Logs tab (tasks 214/215), per the doc's Compatibility
  Touchpoints note.
- Added `project_id` to `GET /api/v2/projects`'s select list (additive field) so the Add-modal's
  Project step can resolve straight into `GET /api/v2/projects/[projectId]/tasks`.
- Built the page at `src/app/v2/(hub)/dashboard/timelogs/`: `page.tsx` (server guard, mirrors
  `portfolio-tracker/page.tsx`), `_time-logs-content.tsx` (toolbar + fetch + table shell),
  `_time-logs-table.tsx` (grouped-by-user vs. flat rendering, empty state, edit/delete icons),
  `_time-log-entry-modal.tsx` (Add/Edit — Project→Task→Date→Start→End→Note, posts to the existing
  per-task route), `_time-period-picker.tsx` + `_time-period-panels.tsx` (Day/Week/Month/Range
  picker on `react-day-picker` v10 — previously installed, unused), `_export-pdf.ts`
  (`jspdf`/`jspdf-autotable`, exports the full currently-filtered set, not just on-screen rows).
- Added `src/app/v2/(hub)/dashboard/timelogs/_time-logs-shared.ts` (types + period-math helpers) —
  a deviation from the plan's file list, see below.
- Added a "Time Logs" sidebar item (Clock icon) to the "Work" group, hidden for `client`/
  `marketing`.
- `pnpm add jspdf jspdf-autotable`.

### Files Changed
- `src/app/api/v2/time-logs/route.ts` - new, cross-project GET
- `src/app/api/v2/tasks/[taskId]/time-logs/route.ts` - POST role gate loosened to assignee-only
- `src/app/api/v2/projects/route.ts` - added `project_id` to the GET select
- `src/app/v2/(hub)/dashboard/timelogs/page.tsx` - server guard, replaces the Sprint 1A stub
- `src/app/v2/(hub)/dashboard/timelogs/_time-logs-content.tsx` - toolbar + fetch + table shell
- `src/app/v2/(hub)/dashboard/timelogs/_time-logs-table.tsx` - table rendering
- `src/app/v2/(hub)/dashboard/timelogs/_time-log-entry-modal.tsx` - Add/Edit modal
- `src/app/v2/(hub)/dashboard/timelogs/_time-period-picker.tsx` - picker shell/tabs
- `src/app/v2/(hub)/dashboard/timelogs/_time-period-panels.tsx` - Day/Week/Month/Range panels
- `src/app/v2/(hub)/dashboard/timelogs/_time-logs-shared.ts` - new, shared types + period math
- `src/app/v2/(hub)/dashboard/timelogs/_export-pdf.ts` - PDF export
- `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` - new nav item
- `package.json` / `pnpm-lock.yaml` - `jspdf`, `jspdf-autotable`

### Deviations From Plan
- **Added `_time-logs-shared.ts`, not in the original file list.** The period-math (Day/Week/
  Month/Range → `{from, to}`, prev/next stepping, trigger labels) and the `TimeLogEntry`/
  `ProjectOption` types were needed identically by four different files
  (`_time-logs-content.tsx`, `_time-logs-table.tsx`, `_time-period-picker.tsx`, `_export-pdf.ts`);
  splitting them into their own file avoided duplicating that logic and kept every consuming file
  further under the length guideline. Purely an internal implementation-detail split, not a scope
  change.
- **`react-hooks/set-state-in-effect` (a real ESLint error in this repo's shared Next.js config,
  not a stylistic choice) required restructuring both data-fetching effects** in
  `_time-logs-content.tsx` and `_time-log-entry-modal.tsx` to use React 19's async-transition-
  function form of `useTransition` instead of a bare `useState` "loading" flag toggled
  synchronously inside the effect body. Functionally equivalent (still shows a spinner while a
  request is in flight, still aborts stale requests on rapid filter changes), just via
  `startTransition(async () => {...})` instead of `setLoading(true)` + `.finally(() =>
  setLoading(false))`. Not anticipated in the plan since no existing file in this codebase needed
  this exact "auto-refetch on multiple changing filters" shape before.
- **`DayPicker`'s `month`/`onMonthChange` needed real local state, not the plan's implicit
  assumption that the selected value alone would drive the visible month.** Caught during
  self-review before verification: an initial `month={draft} onMonthChange={() => {}}` would have
  made the calendar's own prev/next month chevrons silently do nothing. Fixed by giving each of
  `DayPanel`/`WeekPanel`/`RangePanel` their own local `month` state (seeded from `draft`,
  independent of the selected value), with the "Today"/"Current Week"/"Current Month" quick links
  updating both the selection and the visible month together.
- Design/impeccable hook flagged `text-[10px]`/`text-[11px]`/`text-[12px]`/`text-[9.5px]` as
  "outside the DESIGN.md type ramp" across every new file. Left unchanged — every sibling file in
  this same feature area (`_task-time-logs.tsx`, `_time-log-form.tsx`, `_onboarding-list.tsx`,
  `_filter-multi-select.tsx`, etc.) already uses this identical set of arbitrary-pixel Tailwind
  sizes pervasively; this is CLAUDE.md's documented, already-reconciled codebase convention (UI
  Polish Conventions section), not drift introduced by this task. Not suppressed via an
  `/impeccable hooks ignore-*` config change either, since that reconciliation is already recorded
  in CLAUDE.md — a second, per-file suppression list would just duplicate it.
- Pre-existing `design-system-color` findings on `v2-hub-sidebar.tsx` (its own long-standing slate/
  navy palette, e.g. `#0F172A`, `#2563EB`) are unrelated to this task's one-line addition (a new
  `Clock` import + one conditional nav item) and were left untouched.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (0 errors; 2 pre-existing warnings in an unrelated file,
  `onboarding-workspace/_checklist-tab.tsx`, not touched by this task)
- `pnpm dev` smoke test - PASS: `GET /v2/dashboard/timelogs` compiles and returns a clean `307`
  redirect to `/v2/auth/login?returnTo=...` when unauthenticated (no server-side crash/500 across
  any of the new files or the `react-day-picker` integration).
- Full authenticated, role-based browser verification (developer own-only view, admin/PM/HR/
  super_admin grouped view, Day/Week/Month/Range filtering, add/edit/delete flows, PDF export
  content) - **SKIPPED**, no test credentials available in this session for any role. This mirrors
  tasks 214/215's own precedent of documenting the gap rather than claiming untested behavior
  works. Recommend exercising, before shipping: each role's visibility scope, all four period
  modes (especially Week's whole-row highlight and Range's two-month selection), the Add modal's
  Project→Task dependent-fetch and its "no assigned tasks" empty state, and an exported PDF's row
  count against the active filter for a range wide enough to matter.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation found in any changed file.
- No `any`/untyped escape hatches — the new aggregate route types its Supabase rows
  (`TimeLogRow`) and casts once (`as TimeLogRow[]`), the same pattern the sibling per-task route
  already uses.
- No deep nesting — every new function uses early-return guard clauses (auth/role/not-found
  checks) consistent with every other API route in this codebase.
- Each new file has one clear responsibility (page guard, toolbar/fetch shell, table rendering,
  add/edit modal, picker shell, picker panels, shared types/math, PDF export) — no file mixes
  concerns.
- Names are accurate and match sibling-file conventions (`TimeLogsTable`, `periodToRange`,
  `groupByEmployee`, `exportTimeLogsToPdf`, etc.).
- Shared logic already extracted where reuse existed within this new feature area
  (`calendarClassNames`, `makeDayButton`, `QuickLinkRow` across the three `react-day-picker`
  panels; `TimeLogEntry`/`ProjectOption`/period math centralized in `_time-logs-shared.ts`).
- Errors are handled intentionally throughout — every `fetch` has a `try/catch` or `.catch()`,
  user-facing failures surface via inline `setError` text (matching this codebase's no-toast
  convention), and API routes return typed error JSON with correct status codes.
- No secrets, credentials, or debug logging added.
- Re-verified against the live files (not from memory) that the structural safety properties
  called out in the task doc actually hold: `POST /api/v2/tasks/[taskId]/time-logs` still always
  inserts `employee_id: user.id` from the session (never client-supplied — the "no logging for
  others" guarantee is intact after the role-gate loosening), and the aggregate GET's
  `can_edit: r.employee_id === user.id && !!r.task_id` correctly suppresses edit/delete controls
  on null-`task_id` legacy rows before they could ever hit the `task_id`-nested PATCH/DELETE route
  and 404.

### Deviations
- **Minor** — `GET /api/v2/time-logs`'s query-error branch returns the error JSON without a
  `console.error(...)` first. Every sibling list route in this codebase (e.g. `api/v2/projects`
  `GET`/`POST`) logs the failure server-side before responding. Not a functional bug (the client
  still gets a proper error), just a minor consistency gap worth a one-line fix.
- **Minor** — `toTimeInputValue()`/`combineDateTime()` in the new `_time-log-entry-modal.tsx` are
  byte-for-byte duplicates of the same two helpers in the pre-existing `_time-log-form.tsx`
  (different directory — `projects/[projectId]/tasks/[taskId]/`). Consistent with this codebase's
  established "page-scoped UI, don't share across feature areas" convention (CLAUDE.md; also the
  reasoning already used in this task's own doc for not reusing `OwnerChip`/`FilterMultiSelect`
  across directories), so left as-is rather than introducing a new cross-directory shared-utils
  module for two ~3-line functions.
- **Minor** — `TimePeriodPicker`'s dropdown backdrop/panel use `z-40`/`z-50`, neither of which is
  one of DESIGN.md's two documented z-scale steps (`--z-sticky: 20`, `--z-popover: 40`). The panel
  still stacks correctly above its own backdrop and well below the app's higher fixed overlays
  (tooltips at `z-[100000]`, the Status Summary drawer at `z-[99999]`), so there's no functional
  stacking bug — just an undocumented step. Not fixed inline since DESIGN.md's z-scale note says
  to "extend semantically," and a popover panel above its own backdrop is exactly that; renaming
  to the exact `z-40` popover token for the panel (moving the backdrop to something below it) is a
  trivial follow-up but not required for correctness.
- Font-size hook findings (`text-[9.5–12px]`) across every new file were already reviewed and
  classified as false positives during implementation, matching this exact feature area's
  pre-existing convention — recorded in this doc's own Implementation Notes → Deviations, not
  repeated in full here.
- No Medium or Major deviations found. Every Out of Scope / Must-Not-Change boundary from the
  approved task doc was checked against the actual changed files and held: the task-detail Time
  Logs tab (tasks 214/215) is untouched, no new RLS migration was added, no Billing Type
  field/column exists anywhere in the new surface, no Group-By/List dropdown was built, no global
  "my tasks" endpoint was created, and Issues are not selectable in the Add modal.
