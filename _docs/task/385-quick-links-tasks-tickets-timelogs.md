# 385: Quick Links / Shortcuts to Tasks, Tickets & Time Logs

**Created:** 2026-09-22
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

The user wants fast, easily-discoverable access to three cross-project views:

- **Tasks** — a table of all tasks across all projects, sorted by `created_at` DESC.
- **Tickets** — same, for tickets.
- **Time Logs**.

Research findings before proposing placement:

- **Tickets already exists and already satisfies the ask.** `/desk/tickets` (`src/app/(hub)/desk/tickets/page.tsx`) is already a cross-project `tickets` listing (no `project_id` filter, joined to `projects`), already ordered `created_at` DESC, already paginated, and already has a persistent sidebar entry (Desk → Tickets, in `v2-hub-sidebar.tsx`). No new work needed for Tickets beyond linking to it.
- **Time Logs already exists and already has a sidebar entry.** `/dashboard/timelogs` is a real page, already linked as "Time Logs" in the sidebar's Work group. No new work needed beyond linking to it.
- **Tasks does not exist yet — it's a dead stub with zero nav entry.** `src/app/(hub)/dashboard/tasks/page.tsx` is an 11-line placeholder ("v2 · Tasks · Sprint 1A") and there is currently **no sidebar link to it at all** (`v2-hub-sidebar.tsx`'s `workItems` has Dashboard, Customers, Projects, Desk, Orders, Orchestration, Time Logs — no Tasks). So the real gap driving this request is Tasks, not Tickets/Time Logs.

**Recommended placement for "quick links" (answers the user's question):** two complementary spots, matching how the app already treats this class of shortcut:

1. **A new "Quick Links" nav group at the very bottom of the sidebar** (after Work/People/Knowledge/Admin, immediately above the user card) containing three flat items: Tasks, Tickets, Time Logs. This is a labeled, dedicated section rather than scattering Tasks into the existing "Work" group — per user feedback. "Time Logs" moves out of the Work group into this new group (it was already a flat, ungrouped-benefit item there, so the move costs nothing). "Tickets" gets a **flat duplicate** entry here in addition to its existing nested position under the collapsible "Desk" group — unlike Time Logs, the nested Desk > Tickets entry stays put because Desk still needs it alongside Inbox/Contacts, and the duplicate is a genuine shortcut (skips expanding Desk). "Tasks" gets its only entry here, since it has none today.
2. **A small "Quick Links" row on the Dashboard home page** (PM/Admin dashboard — `pm-dashboard.tsx`, which `admin-dashboard.tsx` re-exports), placed directly under the greeting header and above the stat tiles. This is the first screen every PM/Admin sees after login, so it's the most immediately visible location for a one-click jump to Tasks / Tickets / Time Logs.

Dev and Marketing dashboards are intentionally left out of the dashboard Quick Links row (see Out of Scope) — the sidebar "Quick Links" group's Tasks/Tickets items are gated the same way as their originals, so those roles wouldn't be able to open two of the three links anyway.

## Requirements

- [ ] Build a real `/dashboard/tasks` page: a table of tasks joined across **all** projects (no `project_id` filter), sorted by `created_at` DESC, paginated — replacing the current stub.
- [ ] Add a new "Quick Links" nav group at the bottom of the sidebar (`v2-hub-sidebar.tsx`), below Admin and above the user card, containing flat Tasks / Tickets / Time Logs items — moving Time Logs out of Work and adding a flat duplicate of Tickets alongside its existing nested Desk > Tickets entry.
- [ ] Add a "Quick Links" shortcut row to the PM/Admin dashboard home page linking to Tasks, Tickets (`/desk/tickets`), and Time Logs (`/dashboard/timelogs`).
- [ ] No changes to the existing Tickets or Time Logs pages themselves — this task only links to them.

## Out of Scope / Must-Not-Change

- Inline editing (status/assignee/priority changes) on the new Tasks table — view + navigate only, matching the literal ask ("a table"). Ticket-style inline editing can be a follow-up if wanted.
- Advanced filtering (by status, priority, project) on the Tasks table beyond a basic text search — keep parity with the minimum viable version of the Tickets page, not its full feature set.
- Quick Links row on the Marketing or Developer dashboards. Marketing has no RLS/role access to Tasks or Tickets today; Developer already has their own task/ticket view via the Dev Dashboard ("My Tasks") and already has a Time Logs sidebar entry — adding a redundant, mostly-broken (2-of-3 links redirect) Quick Links row there is not part of this task.
- Any change to `tasks`/`tickets`/`time_logs` RLS policies, table schema, or the Desk Tickets / Time Logs pages' own code.
- Any change to `TASKS.md`'s historical Planned/In Progress rows other than adding this task's own row.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/dashboard/tasks/page.tsx` | Modify | Replace the Sprint 1A stub with a real server component: auth guard, role gate (admin/super_admin/pm — same as Desk > Tickets; redirect developer/client/marketing to `/dashboard`), paginated cross-project `tasks` query joined to `projects`, ordered `created_at` DESC. |
| `src/app/(hub)/dashboard/tasks/_all-tasks-index.tsx` | Create | Client component rendering the table shell (search box, pagination controls, columns: Task/display_id, Project, Status, Priority, Assignees, Due date, Created) — modeled on `src/app/(hub)/desk/tickets/_filed-issues-index.tsx`'s read-only parts, without its inline-edit affordances. |
| `src/app/(hub)/_components/v2-hub-sidebar.tsx` | Modify | Add a new `quickLinksItems` array + `{ group: "Quick Links", items: filterByDept(quickLinksItems) }` appended as the **last** entry in `groupDefs` (renders at the bottom of the nav, above the user card). Contains: Tasks (gated admin/super_admin/pm, mirroring the page's own gate), Tickets (flat duplicate of the existing Desk > Tickets href, same admin/super_admin/pm gate — the nested Desk entry is untouched), Time Logs (moved out of `workItems`, same `role !== "client" && role !== "marketing"` gate as before). |
| `src/app/(hub)/dashboard/_components/pm-dashboard.tsx` | Modify | Add an inline "Quick Links" row (3 pill-style links: Tasks → `V2_ROUTES.DASHBOARD_TASKS`, Tickets → `V2_ROUTES.DESK_TICKETS`, Time Logs → `V2_ROUTES.DASHBOARD_TIMELOGS`) directly under the greeting/export-button header row, above the stat tiles grid. Reuses the existing pill-button classes already used for "Export weekly report" for visual consistency; inlined per this codebase's page-scoped-UI convention (only one caller — `admin-dashboard.tsx` re-exports the same component, so both PM and Admin roles get it for free). |

## Code Context

### File: `src/app/(hub)/dashboard/tasks/page.tsx` (current stub, to be replaced)

```tsx
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPage() {
  return (
    <div className="py-6.5 px-8">
      <p className="text-sm text-muted-foreground">v2 · Tasks · Sprint 1A</p>
    </div>
  );
}
```

### Reference pattern: `src/app/(hub)/desk/tickets/page.tsx` (cross-project query + role gate to mirror)

```tsx
export const dynamic = "force-dynamic";

// ...
const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
const role = profile?.role ?? null;
if (role !== "admin" && role !== "super_admin" && role !== "pm") redirect(V2_ROUTES.DASHBOARD);

const params = await searchParams;
const page = Math.max(1, parseInt(params.page ?? "1", 10));
const pageSize = Math.max(1, parseInt(params.pageSize ?? "20", 10));
const from = (page - 1) * pageSize;
const to = from + pageSize - 1;

const issuesQuery = supabase
  .from("tickets")
  .select("id, title, display_id, status, severity, assignees, assignee_id, created_at, projects(project_id, external_project_id, name)", { count: "exact" })
  .order("created_at", { ascending: false });

const { data, count } = await issuesQuery.range(from, to);
```

The new Tasks page should follow this exact shape against the `tasks` table instead of `tickets`. Known `tasks` columns (from `src/lib/mcp/tools/list-tasks.ts` and `src/app/(hub)/dashboard/_dev/_load-dev-dashboard.ts`): `id, project_id, title, status, priority, due_date, display_id, assignees, created_at, updated_at, description`. `assignees` is an array column (`.contains("assignees", [userId])` is used elsewhere) — no separate `assignee_id` scalar column on `tasks` (unlike `tickets`, which has both).

### File: `src/lib/projects/deep-links.ts` — use for building per-row links to a project/task

```tsx
// buildProjectHref({ projectDisplayId, isLegacy }) and buildItemHref(projectHref, "task", displayId)
// already resolve the v2-vs-legacy routing split — reuse these rather than hand-building hrefs,
// exactly as _filed-issues-index.tsx / desk/tickets/page.tsx already do for tickets.
```

### File: `src/app/(hub)/_components/v2-hub-sidebar.tsx` (current structure to modify)

```tsx
// Currently inside workItems — task 226 comment explains the gate:
...(role !== "client" && role !== "marketing" ? [
  { label: "Time Logs",    icon: <Clock size={18} />,          href: V2_ROUTES.DASHBOARD_TIMELOGS },
] : []),
```

```tsx
// groupDefs — where the new group gets appended (renders in this order, so appending last
// puts it at the physical bottom of the scrollable nav, directly above the user card):
const groupDefs: { group: string; items: NavItem[] }[] = [
  { group: "Work",      items: filterByDept(workItems) },
  { group: "People",    items: filterByDept(peopleItems) },
  { group: "Knowledge", items: filterByDept(knowledgeItems) },
  { group: "Admin",     items: filterByDept(adminItems) },
];
```

Changes:
1. Remove the `Time Logs` block shown above from `workItems`.
2. Define `quickLinksItems`, gated per-item (not all-or-nothing, since Tasks/Tickets and Time Logs have different role allowlists):

```tsx
const isAdminOrPm = isAdmin || role === "pm";
const quickLinksItems: NavItem[] = [
  ...(isAdminOrPm ? [
    { label: "Tasks",    icon: <ListChecks size={18} />, href: V2_ROUTES.DASHBOARD_TASKS },
    { label: "Tickets",  icon: <Inbox size={18} />,       href: V2_ROUTES.DESK_TICKETS },
  ] : []),
  ...(role !== "client" && role !== "marketing" ? [
    { label: "Time Logs", icon: <Clock size={18} />,      href: V2_ROUTES.DASHBOARD_TIMELOGS },
  ] : []),
];
```

3. Append to `groupDefs`: `{ group: "Quick Links", items: filterByDept(quickLinksItems) }` as the last array element (after `Admin`). The existing `.filter((g) => g.items.length > 0)` on `groupDefs` already drops the group entirely for roles with zero matching items (e.g. a hypothetical role with no access to any of the three).
4. Import `ListChecks` from `lucide-react` (not currently imported in this file — `Clock` and `Inbox` already are).

### File: `src/app/(hub)/dashboard/_components/pm-dashboard.tsx` (insertion point, page head)

```tsx
<button
  onClick={() => exportWeeklyReport(inProgress)}
  disabled={loading || inProgress.length === 0}
  className="inline-flex items-center gap-2 px-[15px] py-2 rounded-full text-[12px] font-semibold border border-[#E2E7F2] bg-white text-[#3A4565] hover:border-[#A8C6F5] hover:text-[#0B1533] transition-colors disabled:opacity-45 disabled:cursor-not-allowed shrink-0"
>
  <Download size={13} />
  Export weekly report
</button>
```

Add a "Quick Links" row of `Link` pills (same class pattern, swap `button`/`onClick` for `Link`/`href`) targeting `V2_ROUTES.DASHBOARD_TASKS`, `V2_ROUTES.DESK_TICKETS`, `V2_ROUTES.DASHBOARD_TIMELOGS` — placed as its own flex row between the page-head `div` and the "Stat tiles" `div`.

## Implementation Steps

1. Build `src/app/(hub)/dashboard/tasks/_all-tasks-index.tsx` — read-only table (search input, pagination footer) modeled on `_filed-issues-index.tsx`'s non-editing parts.
2. Rewrite `src/app/(hub)/dashboard/tasks/page.tsx` — auth + role guard, paginated cross-project `tasks` query joined to `projects`, `created_at` DESC, hand off rows to the new index component. Resolve per-row hrefs via `buildProjectHref`/`buildItemHref`.
3. In `v2-hub-sidebar.tsx`: remove "Time Logs" from `workItems`, add the `quickLinksItems` array, and append a new `{ group: "Quick Links", items: filterByDept(quickLinksItems) }` as the last entry in `groupDefs`.
4. Add the "Quick Links" pill row to `pm-dashboard.tsx`'s page head.
5. Run verification (below).

## Acceptance Criteria

- [ ] `/dashboard/tasks` renders a live table of tasks pulled from every project (not scoped to one), sorted by `created_at` DESC, with working pagination.
- [ ] Only admin/super_admin/pm can view `/dashboard/tasks`; developer/client/marketing are redirected to `/dashboard` (matching the Desk > Tickets gate).
- [ ] Sidebar shows a "Quick Links" group at the bottom of the nav (below Admin, above the user card) with Tasks / Tickets / Time Logs, each visible only to the roles that can open that respective page; active-state highlighting works like the other nav items.
- [ ] "Time Logs" no longer appears in the Work group (moved to Quick Links, not duplicated); "Tickets" still appears nested under Desk **and** flat under Quick Links (intentional duplicate); "Tasks" appears only under Quick Links.
- [ ] PM and Admin dashboard home pages show a "Quick Links" row (Tasks / Tickets / Time Logs) directly below the greeting, above the stat tiles.
- [ ] Desk > Tickets and Time Logs pages are unchanged.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new warnings/errors.
- [ ] Browser acceptance: sign in as a PM, click each dashboard Quick Link and confirm it lands on the right page; confirm the sidebar "Quick Links" group renders at the bottom with all three items and each navigates/highlights correctly; confirm a developer/client/marketing account is redirected away from `/dashboard/tasks` if visited directly and sees a correspondingly trimmed Quick Links group.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Then: pnpm dev, sign in as pm/admin, click through the three Quick Links + sidebar Tasks entry.
# Sign in as developer/client/marketing, confirm /dashboard/tasks redirects.
```

## Compatibility Touchpoints

- No packaging, docs-generation, or install-surface impact.
- `_docs/task/` documentation stage should note the new `/dashboard/tasks` page's existence and its role gate, since CLAUDE.md's Project Structure table currently lists `dashboard/tasks/` only as "Role-aware tasks (PM = classification_records; Dev = Zoho tasks)" — that description predates this change and should be corrected once implemented.

## Implementation Notes

### What Changed
- Replaced the `/dashboard/tasks` Sprint 1A stub with a real cross-project `tasks` listing (all projects, `created_at` DESC, paginated, basic title/display_id search), gated admin/super_admin/pm (redirects developer/client/marketing to `/dashboard`), mirroring `desk/tickets/page.tsx`'s shape.
- Added a new "Quick Links" nav group at the bottom of the sidebar (`v2-hub-sidebar.tsx`), rendered after Work/People/Knowledge/Admin, directly above the user card. Contains Tasks (new, admin/super_admin/pm), a flat duplicate of Tickets (same gate, nested Desk > Tickets entry left untouched), and Time Logs (moved out of `workItems`, same role gate as before — a pure relocation, not a duplicate).
- Added a "Quick Links" pill row (Tasks / Tickets / Time Logs) to `pm-dashboard.tsx`'s page head, between the greeting/export-button row and the stat tiles, gated per-link by role (see Deviations — `PMDashboard` also renders for hr/client, which required threading `role` down so those roles don't see dead-end links).

### Files Changed
- `src/app/(hub)/dashboard/tasks/page.tsx` — rewritten from the stub into a real server component (auth guard, role gate, paginated cross-project query joined to `projects`, hands rows to the new index component).
- `src/app/(hub)/dashboard/tasks/_all-tasks-index.tsx` — new client component: search box, pagination controls, and a read-only table (Task/display_id, Project, Status via `StatusChip`, Priority via a new local `PriorityLabel` (tasks.priority is lowercase — casing mismatch with `dashboard-shared.tsx`'s `PriorityDot`, so a small local map was used instead of reusing that component), Assignees via `AssigneeMultiSelect` with `editable={false}`, Due date, Created).
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` — added `ListChecks` import; removed the Time Logs block from `workItems`; added `quickLinksItems` + appended `{ group: "Quick Links", items: filterByDept(quickLinksItems) }` as the last `groupDefs` entry.
- `src/app/(hub)/dashboard/_components/pm-dashboard.tsx` — added `ListChecks`, `Inbox`, `Clock` imports; added the inline Quick Links `Link` row, gated by a new `role` prop (`canSeeTasksTickets` / `canSeeTimeLogs`).
- `src/app/(hub)/dashboard/_components/dashboard-view.tsx` *(not in original plan — see Deviations)* — passes `role` through to both `AdminDashboard` and the `PMDashboard` fallback call.
- `src/app/(hub)/dashboard/_components/admin-dashboard.tsx` *(not in original plan — see Deviations)* — accepts and forwards a new `role` prop to `PMDashboard`.

### Deviations From Plan
- Minor — touched two files not in the original Proposed File Changes table (`dashboard-view.tsx`, `admin-dashboard.tsx`). Caught during the quality-gate pass: `dashboard-view.tsx`'s own doc comment states `PMDashboard` is the fallback for **hr and client** roles too (not just PM/Admin), but the Quick Links row as first implemented was unconditional — hr/client would have seen Tasks/Tickets links that instantly redirect them to `/dashboard` (neither role passes that page's admin/super_admin/pm gate), and client would additionally have seen a Time Logs link that also redirects (client is excluded from that page's gate). Fixed by threading a `role` prop from `DashboardView` → `AdminDashboard`/`PMDashboard` and gating each link individually (`canSeeTasksTickets`, `canSeeTimeLogs`), matching the sidebar's per-item gating. No new product scope — this only makes the already-planned pm-dashboard.tsx change behave correctly for roles the plan didn't explicitly call out.
- Implementation otherwise matches the approved plan, including the mid-planning revision to a dedicated bottom-anchored sidebar "Quick Links" group (Time Logs relocated, Tickets flat-duplicated, Tasks added).
- One detail not explicitly spelled out in the plan's code context: `tasks.priority` uses lowercase values (`critical/high/normal/low/none`, confirmed via `_list-view.tsx`'s `PRIORITY_ORDER` map), which doesn't match `dashboard-shared.tsx`'s `PriorityDot` (expects uppercase `CRITICAL/HIGH/NORMAL/LOW`). Used a small local `PriorityLabel` map instead of misapplying `PriorityDot` with mismatched casing.

### Verification Run
- `npx tsc --noEmit` - PASS (no errors)
- `pnpm lint` - PASS (2 pre-existing warnings in `_checklist-tab.tsx`, unrelated to this change — file not touched)
- Browser acceptance - SKIPPED (no live session with a pm/admin/developer/client/marketing test account available this session; needs manual click-through per the Acceptance Criteria's browser-acceptance item before this ships)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation in any changed/new file.
- No new untyped (`any`) escape hatches — the `as unknown as TaskRow[]` cast in `tasks/page.tsx` mirrors the identical, already-established pattern in `desk/tickets/page.tsx` (Supabase's generated join types vs. the hand-written row shape), not a new convention.
- No deep nesting; both role gates use early-return guard clauses (`if (role !== ... ) redirect(...)`), matching `desk/tickets/page.tsx`.
- Names are accurate (`AllTaskListItem`, `AllTasksPaginationMeta`, `canSeeTasksTickets`, `canSeeTimeLogs`).
- Reused existing shared pieces instead of duplicating logic: `buildProjectHref`/`buildItemHref` (`deep-links.ts`), `StatusChip` (`dashboard-shared.tsx`), `AssigneeMultiSelect` with `editable={false}` (`_assignee-multi-select.tsx`) rather than hand-rolling avatar/name resolution a second time.
- `tasks.priority`'s lowercase casing was verified against real usage (`_list-view.tsx`'s `PRIORITY_ORDER`) before writing a new local map, rather than guessing or forcing a mismatched shared component.
- `npx tsc --noEmit` and `pnpm lint` both re-run after the role-gating fix below — still clean (0 errors, same 2 pre-existing unrelated warnings).

### Deviations
- Minor (documented in Implementation Notes → Deviations From Plan, and fixed in this pass): the dashboard Quick Links row was initially unconditional, which would have shown dead-end redirect links to hr/client (both fall back to `PMDashboard` per `dashboard-view.tsx`'s own doc comment). Fixed by threading a `role` prop through `DashboardView` → `AdminDashboard`/`PMDashboard` and gating each link. This touched two files not in the original Proposed File Changes table (`dashboard-view.tsx`, `admin-dashboard.tsx`) but added no new product scope — it's a correctness fix for the already-planned `pm-dashboard.tsx` change, not a feature addition. Risk is low: the added prop is optional (`role?: string | null`, defaults to `null` → no Quick Links rendered), so no other caller of `PMDashboard`/`AdminDashboard` can break.
- No other deviations. All four Requirements and the Out-of-Scope boundaries are respected — no inline editing was added to the Tasks table, no advanced filtering beyond basic search, Marketing/Developer dashboards untouched, and no RLS/schema/Tickets-page/Time-Logs-page changes.

### Required Fixes
- None.
