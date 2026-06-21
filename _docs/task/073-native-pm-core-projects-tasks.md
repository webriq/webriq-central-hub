# Native PM Core — Projects / Milestones / Tasks / Subtasks + Kanban / List / Calendar

> **Status:** TESTING
> **Priority:** HIGH
> **Type:** feature
> **Version Impact:** major (new `milestones` table + `tasks.milestone_id` migration)
> **Created:** 2026-06-21
> **Completed:** 2026-06-21
> **Platform:** Web
> **Automation:** manual

## Implementation Notes (for tester)

- **Migration 033 must be pushed before testing**: `npx supabase db push --include-all`. The pages query `milestone_id` / `milestones`, which don't exist until the migration runs.
- `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` were installed.
- All CRUD uses the **user-scoped `createClient()`** — RLS enforces PM/Admin write + developer update-own. No `adminClient` used.
- Routes live under `/api/v2/*`. Pages: `/v2/projects`, `/v2/projects/[projectId]`, `/v2/customers`.
- Sidebar: **Projects** → `/v2/projects` (was `/v2/dashboard/customers`); new **Customers** → `/v2/customers` (hidden for developers, matching existing dev-nav parity).
- The old `dashboard/customers` stub was intentionally left in place (no longer linked) to avoid dead routes.
- Board uses fractional `position` midpoint reorder with optimistic move + rollback on API error.
- `TaskDrawer` is keyed by task id so it remounts per task (clean state init, no sync effect).
- **Deviation:** also fixed a pre-existing unrelated bug in `dev-dashboard.tsx` (`SectionCard` was passed `action`, which doesn't exist — corrected to `trailing`) because it blocked a clean `tsc`.
- `npx tsc --noEmit` and `eslint` on new dirs both pass clean.

## Overview

Stand up the native project-management core inside the v2 hub, replacing the Zoho dependency for day-to-day work tracking. Build full CRUD for **projects → milestones → tasks → subtasks** on the Supabase-native v2 schema, and surface them through a real **Projects** experience: a projects index grid that drills into a per-project detail page with **Kanban (drag-and-drop), List, and Calendar** views.

This also splits the conflated nav: today the sidebar **Projects** item points at the stub `/v2/dashboard/customers`. After this task, **Projects** and **Customers** are distinct top-level pages with their own routes. Projects remain tied to customers (FK `projects.customer_id`) but live on separate screens.

## Requirements

### Must Have
- [ ] New `milestones` table (migration) + `tasks.milestone_id` column with RLS mirroring `tasks`/`projects`.
- [ ] `database.ts` types updated: `milestones` table + `tasks.milestone_id` on Row/Insert/Update.
- [ ] Projects index page at `/v2/projects` — grid/list of all projects, filter by customer + status, "New Project" create.
- [ ] Project detail page at `/v2/projects/[projectId]` — header + view tabs **Board | List | Calendar**, milestone bar/filter.
- [ ] **Kanban board**: columns `Backlog → Todo → In Progress → For Review → Done` with @dnd-kit drag-and-drop; dropping updates `status` + `position` (fractional reorder).
- [ ] **List view**: task table grouped by milestone, inline status/priority/assignee/due-date, sortable.
- [ ] **Calendar view**: month grid placing tasks on `due_date`; click a day to create a task on that date.
- [ ] Task detail drawer: edit task fields + **subtasks** CRUD (subtask = `tasks` row with `parent_task_id`).
- [ ] Milestones CRUD (create/rename/set due/complete) within a project.
- [ ] Customers index page at `/v2/customers` (its own page, separate from Projects).
- [ ] Sidebar: **Projects** → `/v2/projects`; add **Customers** → `/v2/customers`. Breadcrumb map updated.
- [ ] All mutations go through user-scoped `createClient()` so RLS enforces role authz (PM/Admin write, Developer update-own).
- [ ] `npx tsc --noEmit` clean.

### Nice to Have
- [ ] Board "group by milestone" swimlane toggle (default group by status).
- [ ] Optimistic UI on drag-drop with rollback on API error.
- [ ] Empty-states + skeletons consistent with `dashboard-shared.tsx`.
- [ ] Subtask progress chip on parent task card (e.g. `2/5`).

## Current State

The v2 schema (migration 025) already ships `projects` (renamed from `customer_projects`) and `tasks` (with `parent_task_id` for subtasks, `position numeric`, `status`/`priority` enums). RLS (migration 026) already covers both. **There is no `milestones` table.** The Projects/Customers pages are stubs.

**Current Files:**
| File | Purpose |
|------|---------|
| `src/app/v2/(hub)/dashboard/customers/page.tsx` | Stub the sidebar "Projects" currently points to |
| `src/app/v2/(hub)/customers/[customerId]/page.tsx` | Stub customer detail |
| `src/app/v2/(hub)/customers/onboard/page.tsx` | Stub onboard |
| `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` | Nav — "Projects" → `V2_ROUTES.DASHBOARD_CUSTOMERS` |
| `src/app/v2/(hub)/_components/v2-hub-header.tsx` | Breadcrumb `BREADCRUMB_MAP` |
| `src/config/constants.ts` | `V2_ROUTES` |
| `src/app/v2/(hub)/dashboard/_components/dashboard-shared.tsx` | Reusable `KpiCard`, `SectionCard`, `StatusChip`, `PriorityDot`, `Avatar`, `SkeletonRow` |
| `src/types/database.ts` | `projects` (L534), `tasks` (L605), `customers` (L401) types |
| `supabase/migrations/032_ops_chat_llm_layer.sql` | Latest migration → next is **033** |

## Proposed Solution

### Architecture

**Routing** (new pages under the existing `(hub)` group so they inherit `V2HubShell`):
```
/v2/projects                  → projects index (grid of project cards, filters, create)
/v2/projects/[projectId]      → project detail: tabs Board | List | Calendar
/v2/customers                 → customers index (its own page)
```
Server components fetch initial data with the RLS-bound `createClient()`; interactive pieces are client components receiving the data as props. Mutations call thin `/api/v2/*` routes (also RLS-bound) — relying on the existing role policies rather than re-checking roles in code.

**Data model**: a project has many milestones and many tasks; a task optionally belongs to a milestone (`milestone_id`) and optionally has a parent (`parent_task_id`, used for subtasks). The Kanban column is the task `status`; ordering inside a column is `position` (fractional midpoint reorder — no full re-sequence on every drop).

**Drag-and-drop**: `@dnd-kit/core` + `@dnd-kit/sortable`. On drop, compute the new `position` as the midpoint of the neighbors in the target column (or `now()`-style append) and PATCH `{ status, position }`. Optimistic update, rollback on error.

### File Changes

| Action | File | Description |
|--------|------|-------------|
| CREATE | `supabase/migrations/033_milestones.sql` | `milestones` table + `tasks.milestone_id` + RLS |
| MODIFY | `src/types/database.ts` | Add `milestones`; add `milestone_id` to `tasks` Row/Insert/Update |
| MODIFY | `src/config/constants.ts` | Add `PROJECTS`, `CUSTOMERS` (+ a `projectDetail(id)` helper) to `V2_ROUTES` |
| MODIFY | `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` | "Projects" → `PROJECTS`; add "Customers" item → `CUSTOMERS` |
| MODIFY | `src/app/v2/(hub)/_components/v2-hub-header.tsx` | Breadcrumb entries for Projects + Customers |
| CREATE | `src/app/v2/(hub)/projects/page.tsx` | Server: fetch projects + customers → render index |
| CREATE | `src/app/v2/(hub)/projects/_projects-index.tsx` | Client: grid, filters, "New Project" modal |
| CREATE | `src/app/v2/(hub)/projects/[projectId]/page.tsx` | Server: fetch project + milestones + tasks → render detail |
| CREATE | `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` | Client: header + view-tab switch + milestone bar |
| CREATE | `src/app/v2/(hub)/projects/[projectId]/_board-view.tsx` | Kanban with @dnd-kit |
| CREATE | `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` | Grouped task table |
| CREATE | `src/app/v2/(hub)/projects/[projectId]/_calendar-view.tsx` | Month calendar by `due_date` |
| CREATE | `src/app/v2/(hub)/projects/[projectId]/_task-drawer.tsx` | Task detail + subtasks CRUD |
| CREATE | `src/app/v2/(hub)/projects/_pm-shared.tsx` | Local shared bits (task card, status/priority maps, fetch helpers) |
| CREATE | `src/app/v2/(hub)/customers/page.tsx` | Server: customers index |
| CREATE | `src/app/v2/(hub)/customers/_customers-index.tsx` | Client: customers grid/table |
| CREATE | `src/app/api/v2/projects/route.ts` | GET list (filters), POST create |
| CREATE | `src/app/api/v2/projects/[projectId]/route.ts` | GET, PATCH, DELETE project |
| CREATE | `src/app/api/v2/projects/[projectId]/milestones/route.ts` | GET, POST milestones |
| CREATE | `src/app/api/v2/projects/[projectId]/tasks/route.ts` | GET, POST tasks |
| CREATE | `src/app/api/v2/milestones/[milestoneId]/route.ts` | PATCH, DELETE milestone |
| CREATE | `src/app/api/v2/tasks/[taskId]/route.ts` | PATCH (status/position/fields), DELETE |
| CREATE | `src/app/api/v2/tasks/[taskId]/subtasks/route.ts` | GET, POST subtasks |
| DELETE | `src/app/v2/(hub)/dashboard/customers/*` | Remove stubs once nav no longer points here (optional cleanup) |

## Implementation Steps

### Step 1: Migration 033 — milestones + tasks.milestone_id
Create `supabase/migrations/033_milestones.sql`. Mirror the `tasks` RLS exactly (staff read; PM/Admin full write). Do **not** invent inline role logic — use the existing `get_my_role()` helper.

```sql
-- Migration 033: milestones (PM core) + tasks.milestone_id
create table milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text,
  due_date date,
  status text not null check (status in ('planned', 'active', 'completed')) default 'planned',
  position numeric,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table tasks add column milestone_id uuid references milestones(id) on delete set null;

alter table milestones enable row level security;

create policy "milestones_staff_read"
  on milestones for select to authenticated
  using (get_my_role() in ('admin', 'pm', 'developer'));

create policy "milestones_pm_write"
  on milestones for all to authenticated
  using (get_my_role() in ('admin', 'pm'))
  with check (get_my_role() in ('admin', 'pm'));

create index milestones_project_id_idx on milestones(project_id);
create index tasks_milestone_id_idx on tasks(milestone_id);
```
Push with `npx supabase db push --include-all` (the user runs this; do not run git).

### Step 2: Install @dnd-kit
```bash
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

### Step 3: Types
In `src/types/database.ts`: add a `milestones` table block (Row/Insert/Update + Relationships to `projects`), and add `milestone_id: string | null` to `tasks` Row/Insert/Update.

### Step 4: Routes config + nav + breadcrumb
- `V2_ROUTES`: add `PROJECTS: "/v2/projects"`, `CUSTOMERS: "/v2/customers"`. Add a helper `projectDetail = (id: string) => \`/v2/projects/${id}\`` (or build inline).
- Sidebar `getNavGroups`: change the **Projects** item `href` to `V2_ROUTES.PROJECTS`; add a **Customers** item (`Users`/`Building2` icon) → `V2_ROUTES.CUSTOMERS` in the Work group (keep dev-hidden parity with existing logic where appropriate).
- Header `BREADCRUMB_MAP`: add `[V2_ROUTES.PROJECTS] → { section: "Work", page: "Projects" }` and `[V2_ROUTES.CUSTOMERS] → { section: "Work", page: "Customers" }`. (Longest-prefix match already handles `/[projectId]`.)

### Step 5: API routes (`/api/v2/*`)
All use `await createClient()`; check `auth.getUser()` → 401 if absent; let RLS reject unauthorized writes (return the Supabase error as 403/400). Pattern to follow: existing `src/app/api/projects/route.ts`, but use the **user-scoped** client (not `adminClient`) so RLS applies.
- Projects: list (filters `customer_id`, `status`), create.
- Project detail: get (project + milestones + tasks in one handler or rely on page server fetch), patch, delete.
- Milestones: create under project; patch/delete by id.
- Tasks: create under project; patch by id (the drag-drop endpoint — accepts partial `{ status, position, milestone_id, ... }`); delete by id.
- Subtasks: list children (`parent_task_id = taskId`), create child (inherits `project_id`).
- `position` on reorder: client computes midpoint and sends it; server just persists.

### Step 6: Projects index page
`projects/page.tsx` (server) fetches projects + a `customer_id → company_name` map (reuse the join approach from `api/projects/route.ts`). Render `_projects-index.tsx`: responsive card grid, each card shows name, customer, `project_type`, `StatusChip`, task counts (optional aggregate). Filter bar (customer dropdown + status). "New Project" modal → `POST /api/v2/projects` → `router.refresh()`.

### Step 7: Project detail + views
`projects/[projectId]/page.tsx` (server) fetches the project, its milestones (ordered by `position`), and its tasks (ordered `status, position`). `_project-detail.tsx` holds view state (`board | list | calendar`), the milestone bar/filter, and a "New Task" action; passes tasks down and exposes mutation callbacks that hit the API + update local state optimistically.
- `_board-view.tsx`: 5 status columns; `DndContext` + `SortableContext` per column; on `onDragEnd` resolve target column (status) + index → midpoint position → PATCH; optimistic move with rollback.
- `_list-view.tsx`: tasks grouped by milestone (plus "No milestone"); rows with inline `StatusChip`, `PriorityDot`, assignee `Avatar`, due date; column sort.
- `_calendar-view.tsx`: month grid (compute weeks), tasks rendered on `due_date` cells; click empty day → create task prefilled with that date.
- `_task-drawer.tsx`: slide-over showing task fields (editable) + subtasks list with add/toggle/delete via the subtasks API.

### Step 8: Customers index page
`customers/page.tsx` (server) lists customers (`customer_id, company_name, contact_name, status`) + project count per customer. `_customers-index.tsx`: table/grid, status filter, link each row to its projects (filter `/v2/projects?customer=<id>`) and to the existing `/v2/customers/[customerId]` detail stub.

### Step 9: Verify
`npx tsc --noEmit`; manual pass through each view + CRUD path per the testing checklist.

## Code Examples

Fractional position on drop (midpoint reorder):
```typescript
function midpoint(prev?: number | null, next?: number | null): number {
  if (prev == null && next == null) return Date.now();      // empty column
  if (prev == null) return (next as number) - 1;            // dropped at top
  if (next == null) return (prev as number) + 1;            // dropped at bottom
  return ((prev as number) + (next as number)) / 2;         // between two cards
}
```

Drag end → persist:
```typescript
async function onDragEnd(e: DragEndEvent) {
  const { active, over } = e;
  if (!over) return;
  const targetStatus = columnOf(over.id);
  const { prev, next } = neighborsInColumn(targetStatus, over.id);
  const position = midpoint(prev?.position, next?.position);
  setTasks(optimisticMove(active.id, targetStatus, position)); // optimistic
  const res = await fetch(`/api/v2/tasks/${active.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status: targetStatus, position }),
  });
  if (!res.ok) setTasks(prevSnapshot); // rollback
}
```

## Testing Checklist
- [ ] Migration 033 applies; `milestones` + `tasks.milestone_id` exist; RLS blocks a developer write, allows PM/Admin.
- [ ] `/v2/projects` lists projects; customer + status filters work; create project persists and appears.
- [ ] Sidebar "Projects" → `/v2/projects`; new "Customers" → `/v2/customers`; breadcrumbs correct on both + `[projectId]`.
- [ ] Board: drag a card between all 5 columns; order persists after refresh; reorder within a column persists.
- [ ] Board: optimistic move rolls back when the API returns an error (simulate 403 as developer on a non-assigned task).
- [ ] List: tasks grouped by milestone; inline edits + sort work.
- [ ] Calendar: tasks land on correct `due_date`; click day creates a task on that date.
- [ ] Task drawer: edit fields; add/toggle/delete subtasks; parent shows subtask count.
- [ ] Milestone create/rename/complete reflected across views.
- [ ] `/v2/customers` lists customers with project counts; links into filtered projects + customer detail.
- [ ] Developer role: read-only board except own assigned tasks (RLS); PM/Admin full CRUD.
- [ ] `npx tsc --noEmit` clean.

## Dependencies
- **New packages:** `@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/utilities` (`pnpm add`).
- **Migration:** 033 must be pushed before the pages work against `milestone_id`.
- **APIs:** new `/api/v2/*` routes listed above.
- **Blocked by:** none.

## Notes for Implementation Agent
- **Invoke `/vercel-react-best-practices` and `/supabase-postgres-best-practices` before coding** (React + DB work).
- Use the **user-scoped `createClient()`** for all reads/writes so RLS enforces the role matrix — do **not** reach for `adminClient` here (no public/no-session exception applies).
- Reuse `dashboard-shared.tsx` (`SectionCard`, `StatusChip`, `PriorityDot`, `Avatar`, `SkeletonRow`) for visual consistency; only create local components when shared ones don't fit.
- Styling: **Tailwind classes only**, `cn()` for conditionals, prefer scale steps over arbitrary values (per CLAUDE.md). The v2 sidebar/dashboards mix inline `style` for brand colors — match the immediate file's idiom but prefer Tailwind for new layout.
- Task `status` enum is lowercase (`backlog|todo|in_progress|for_review|done|cancelled`); `priority` lowercase (`low|normal|high|critical`) — note this differs from the classification/plan UPPERCASE casing.
- Subtasks are just `tasks` rows with `parent_task_id` set; exclude them from the top-level board/list (filter `parent_task_id is null`) and show them only in the drawer.
- Keep the `dashboard/customers` stub until nav is switched; remove only after `/v2/projects` + `/v2/customers` work, to avoid dead links.
- Do **not** run git. The user pushes migrations and manages version control.

## Related
- Schema: `supabase/migrations/025_v2_schema.sql` (projects/tasks), `026_rls_policies_v2.sql` (RLS + `get_my_role()`)
- Design reference: image in task request (Projects nav active, breadcrumb "Work / Projects")
- Spec: `_docs/plan-v2/` (v2 PM core)
