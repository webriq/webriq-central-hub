# 231: Delete Project Action (Soft Delete) — Portfolio Tracker & Projects

**Created:** 2026-08-13
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

Add a "Delete Project" action to the Projects module (`/v2/projects`) and the Portfolio Tracker module
(`/v2/portfolio-tracker`). Clicking it shows an irreversible-action confirmation dialog; on confirm, the
project's `status` is set to `'deleted'` in the database — **no row is ever hard-deleted**. Once
`deleted`, the project must stop appearing anywhere staff browse projects, and its detail routes must
404, but the row (and everything FK'd to it — tasks, issues, time logs, milestones, onboarding
data) stays intact and queryable directly in the DB for recovery/audit if ever needed.

This mirrors an existing pattern already shipped in this codebase: `customer_products` uses an
`'archived'` status value (added in migration `023_customer_products_archive_status.sql`) as its
soft-delete, with a confirm modal on the customer detail page (`src/app/v2/(hub)/customers/[customerId]/client.tsx:1162-1194`)
that PATCHes `{ status: "archived" }`. This task applies the same shape to `projects.status`, adding a
new `'deleted'` value alongside the existing `active | on_hold | completed | archived`.

**Decisions made below (not explicitly specified by the user — flagged for review):**

1. **Placement: project detail page, not list rows.** Neither `/v2/projects` (grid cards / table rows)
   nor `/v2/portfolio-tracker` (cards) currently has any per-row action affordance — adding one means a
   new "Actions" column/kebab on every row of both list views (2 view modes × 2 pages). The codebase's
   own precedent for a destructive/irreversible status change (Archive Product) lives in the *detail*
   page, not the list. Portfolio Tracker's detail page (`_onboarding-detail.tsx`) already has a gear
   "Project Settings" dropdown (lines 1667–1704) — Delete Project is added as a new (danger-styled) item
   there. Projects' detail page (`_project-detail.tsx`) has no settings menu yet; this task adds a small
   header action next to "New Task/Issue" (line ~430) for it. If bulk/list-row delete turns out to be
   what's actually wanted, that's a larger, separate follow-up (new Actions column on 3 more view
   surfaces) — flag in review if so.
2. **Who can delete.** Gated to `admin | pm | super_admin` — same role set already used for
   `canManageTags`/`canCreateProject` in `_projects-index.tsx` (task 209) and consistent with the RLS
   write policy `projects_pm_write` (`admin`, `pm` — see migration `026_rls_policies_v2.sql:81-84`).
   `super_admin` is included because it's the established "admin-plus" superset used everywhere else this
   role triple appears in the Projects module; RLS itself doesn't special-case `super_admin` beyond
   whatever `get_my_role()` returns, so this is a UI-side gate only (see Assumption 3).
3. **DELETE, not PATCH, is the wire verb**, and `'deleted'` is deliberately *not* added to the PATCH
   route's `VALID_STATUS` allow-list. `PATCH /api/v2/projects/[projectId]` (`src/app/api/v2/projects/[projectId]/route.ts:42-76`)
   already exists as the general "edit project" endpoint (used today only for tag removal) and must
   never let `'deleted'` be set/unset as a casual field edit. `DELETE /api/v2/projects/[projectId]`
   already exists in the same file (lines 78–94) but currently does a **hard delete** and has **no
   frontend caller anywhere** (confirmed via search — dead code). This task repurposes that unused DELETE
   handler into the soft-delete action instead of hard-deleting, and adds the role check it never had
   (moot before since nothing called it).
4. **No new `deleted_at` timestamp column.** Matches the `customer_products.status = 'archived'`
   precedent exactly — status value only, no extra column. `updated_at` (already on every write) records
   when.
5. **Scope boundary — which listing surfaces must hide `deleted` projects.** In scope: `/v2/projects`
   list query, `/v2/portfolio-tracker` list query (`/api/onboarding/projects`), the Portfolio Tracker
   Status Report query (`/api/onboarding/projects/status-report`), and both detail-page data loaders
   (so a stale/bookmarked link 404s instead of showing a deleted project). Out of scope (see below):
   every other of the ~65 files in the codebase that query `projects` (dashboard stat tiles, Kanban/
   orchestration views, MCP tools, developer-access allow-lists, Zoho import/export, customer detail
   page's project mini-list, etc.) — auditing all of them is disproportionate to "add a delete action"
   and is flagged as a follow-up, not silently done here.

## Requirements

1. `projects.status` CHECK constraint accepts a new `'deleted'` value (migration).
2. A "Delete Project" action is reachable from both the Projects module and the Portfolio Tracker
   module (project detail pages — see Decision 1), visible only to `admin | pm | super_admin`.
3. Clicking it opens a confirmation dialog stating the action is irreversible, with Cancel / Delete
   buttons — no native `window.confirm()`.
4. Confirming calls `DELETE /api/v2/projects/[projectId]`, which sets `status = 'deleted'` (an UPDATE
   under the hood) — the row is never removed from the `projects` table.
5. After a successful delete, the user is redirected to that module's list page, and the project no
   longer appears there.
6. A project with `status = 'deleted'` is excluded from:
   - `/v2/projects` list (grid + table, all filter states, including the unfiltered "All" default)
   - `/v2/portfolio-tracker` list
   - `/v2/portfolio-tracker/status-report`
   - Both projects' and Portfolio Tracker's detail pages (direct navigation 404s via Next's `notFound()`)
7. `'deleted'` is never offered as a selectable value in any existing status filter/dropdown (it isn't
   a browsable lifecycle state).
8. New/edited files stay within `nextjs-file-length-best-practices.md` guidance — `_project-detail.tsx`
   (1224 lines) and `_onboarding-detail.tsx` (1897 lines) are already well past the 400–500 hard-limit
   convention, so the new UI is extracted into small new files and only a few lines are added to those
   two files (a trigger/menu-item + wiring), not the dialog/fetch logic itself.

## Out of Scope / Must Not Change

- Hard-deleting any row, or adding a cascade/cleanup job for a deleted project's tasks/issues/time
  logs/onboarding data — they stay exactly as-is, just orphaned from normal browsing.
- Any listing surface not named in Requirement 6 (dashboard stat tiles, Kanban/orchestration board,
  MCP tools (`list_tasks`, `get_project_status`, etc.), developer project-access allow-list
  (`_project-access.ts`), customer detail page's project mini-list, Zoho import/export). These may still
  surface a deleted project's name/stats — flagged as a known follow-up, not fixed here.
- A per-row "Actions" column/kebab on the Projects grid/table or Portfolio Tracker cards (Decision 1).
- An "undo delete" / restore-from-trash UI. The row is recoverable only by a direct DB update (status
  back to e.g. `active`) — no restore action is being built.
- Re-adding `'deleted'` as a value PATCH-able through the general project-edit endpoint.
- Any change to `customer_products.status`/Archive Product flow — referenced only as prior art.

## Proposed File Changes

**New migration**
- `supabase/migrations/099_projects_deleted_status.sql` — drop and re-add `projects_status_check` to
  include `'deleted'`. Mirrors `023_customer_products_archive_status.sql` exactly.

**Types**
- `src/types/database.ts` — add `"deleted"` to the three `projects.status` literal unions (currently
  `"active" | "on_hold" | "completed" | "archived"` at lines 552, 584, 616).

**API**
- `src/app/api/v2/projects/[projectId]/route.ts`
  - `DELETE`: add a role check (fetch caller's `profiles.role`; 403 if not `admin`/`pm`/`super_admin`).
    Replace `.delete()` with `.update({ status: "deleted", updated_at: new Date().toISOString() })`.
    Return the updated row.
  - `GET`: add `.neq("status", "deleted")` to the project select so a deleted project 404s through this
    endpoint too (currently unused by the frontend, but hardened for consistency/future callers).
  - `PATCH`: unchanged — `VALID_STATUS` stays exactly `["active", "on_hold", "completed", "archived"]`
    (Decision 3).
- `src/app/api/onboarding/projects/route.ts` — add `.neq("status", "deleted")` to the main projects
  query (~line 60).
- `src/app/api/onboarding/projects/status-report/route.ts` — add `.neq("status", "deleted")` to the
  projects query (~line 44).

**Projects module (`src/app/v2/(hub)/projects/`)**
- `page.tsx` — add `.neq("status", "deleted")` to `projectsQuery`, applied unconditionally (before/in
  addition to the optional `statusValues` filter at line 80), so the default unfiltered view also
  excludes deleted rows.
- `[projectId]/_get-project-detail-data.ts` — add `.neq("status", "deleted")` to the initial project
  select (~line 25), so `getProjectDetailData` returns `null` → `notFound()` for a deleted project.
- `[projectId]/_delete-project-action.tsx` **(new, small)** — the trigger button + wiring for the
  Projects detail header: role-gated icon/text button that opens the shared `ConfirmDialog`, calls the
  shared delete hook, and on success `router.push(V2_ROUTES.PROJECTS)`.
- `[projectId]/_project-detail.tsx` — import and render `<DeleteProjectAction />` next to the existing
  header button (~line 430), passing `project.project_id`, `project.name`, `currentUserRole`. Net
  addition to this file: ~5–8 lines.

**Portfolio Tracker module (`src/app/v2/(hub)/portfolio-tracker/`)**
- `[projectId]/_load-detail-data.ts` — add `.neq("status", "deleted")` to the project select (~line 26).
- `[projectId]/_delete-project-menu-item.tsx` **(new, small)** — a danger-styled item for the existing
  Settings dropdown: role-gated, opens the shared `ConfirmDialog`, calls the shared delete hook, on
  success `router.push(V2_ROUTES.PORTFOLIO_TRACKER)`.
- `[projectId]/_onboarding-detail.tsx`:
  - Broaden the Settings-gear visibility gate at line 1667 from `(canManageProjMembers || canSetOwner)`
    to also include a new `canDeleteProject` (so admin/pm who have neither membership-management nor
    owner-setting rights still see the gear).
  - Add `<DeleteProjectMenuItem />` as a new entry inside the dropdown (after line 1700), separated by a
    visual divider from the existing items (danger color, matching the red-toned `ConfirmDialog` icon).
  - Net addition to this file: ~10–15 lines.

**Shared**
- `src/components/ui/confirm-dialog.tsx` **(moved from `src/app/v2/(hub)/dashboard/timelogs/_confirm-dialog.tsx`, unchanged content)**
  — now used by 3 pages (timelogs, Projects detail, Portfolio Tracker detail), which crosses this
  codebase's own stated threshold for promoting a page-scoped component ("Only extract to
  `src/components/` when a component is shared across multiple pages" — see CLAUDE.md UI Polish
  Conventions).
  - `src/app/v2/(hub)/dashboard/timelogs/_time-logs-content.tsx` — update the import path only
    (`@/components/ui/confirm-dialog`), no behavior change.
- `src/hooks/use-delete-project.ts` **(new)** — small hook (`{ deleting, error, deleteProject(projectId) }`)
  wrapping the `DELETE /api/v2/projects/[projectId]` call, shared by both new trigger components so the
  fetch/error-state logic isn't duplicated.

## Code Context

`src/app/api/v2/projects/[projectId]/route.ts` (current DELETE handler — to be changed from hard delete
to soft delete):
```ts
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabase.from("projects").delete().eq("project_id", projectId);
  if (error) {
    console.error("[api/v2/projects/[id]] delete failed:", error.message);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
```

`supabase/migrations/023_customer_products_archive_status.sql` (exact pattern to mirror for the new
migration):
```sql
-- Expand customer_products.status CHECK constraint to allow 'archived' for soft-delete.
ALTER TABLE customer_products DROP CONSTRAINT IF EXISTS customer_products_status_check;
ALTER TABLE customer_products ADD CONSTRAINT customer_products_status_check
  CHECK (status IN ('active', 'inactive', 'archived'));
```

`src/app/v2/(hub)/dashboard/timelogs/_confirm-dialog.tsx` (component being promoted to
`src/components/ui/confirm-dialog.tsx` verbatim — reusable `open/title/body/confirmLabel/onConfirm/onCancel` API):
```tsx
export function ConfirmDialog({
  open, title, body, confirmLabel = "Delete", onConfirm, onCancel,
}: {
  open: boolean; title: string; body: string; confirmLabel?: string;
  onConfirm: () => void; onCancel: () => void;
}) { /* fixed inset-0 overlay, red AlertTriangle icon, Cancel/Delete buttons */ }
```

`src/app/api/v2/projects/[projectId]/route.ts` PATCH handler's `VALID_STATUS` (must NOT gain `'deleted'`):
```ts
const VALID_STATUS = ["active", "on_hold", "completed", "archived"] as const;
```

Portfolio Tracker's existing Settings menu gate/structure (`_onboarding-detail.tsx:1667-1704`) — new
delete item goes inside this dropdown, gate needs broadening:
```tsx
{(canManageProjMembers || canSetOwner) && (
  <div className="relative">
    <button onClick={() => setSettingsMenuOpen((v) => !v)} aria-label="Project Settings" ...>
      <Settings size={13} />
    </button>
    {settingsMenuOpen && (
      <div className="absolute right-0 z-30 mt-1.5 w-48 ... shadow-lg">
        {canSetOwner && <button ...>Set Project Owner</button>}
        {canManageProjMembers && <button ...>Manage Collaborators</button>}
      </div>
    )}
  </div>
)}
```

Projects detail header action row — new trigger goes here (`_project-detail.tsx:418-436`):
```tsx
<div className="flex items-start justify-between gap-4">
  <div className="min-w-0"> ... <h1>{project.name}</h1> <ProjectStatusBadge status={project.status} /> ... </div>
  <button onClick={...}>New Task / New Issue</button>
</div>
```

Projects list query — unconditional `.neq` goes alongside the existing optional status filter
(`page.tsx:66-85`):
```ts
let projectsQuery = supabase
  .from("projects")
  .select(/* ... */, { count: "exact" })
  .order(sortSpec.column, /* ... */);
// ... existing customer/developer/status/classification/search filters ...
if (statusValues !== null) {
  const statusFilter = (statusValues.length > 0 ? statusValues : ["__none__"]) as (...)[];
  projectsQuery = projectsQuery.in("status", statusFilter);
}
```

`src/types/database.ts` — the three literal-union spots to widen:
```ts
552:          status: "active" | "on_hold" | "completed" | "archived";
584:          status?: "active" | "on_hold" | "completed" | "archived";
616:          status?: "active" | "on_hold" | "completed" | "archived";
```

## Implementation Steps

1. Write and note the new migration (`099_projects_deleted_status.sql`) — do not apply it via any
   destructive tooling; follow this repo's normal migration application process.
2. Update `src/types/database.ts` (3 spots).
3. Move `_confirm-dialog.tsx` → `src/components/ui/confirm-dialog.tsx`; update the timelogs import.
4. Add `src/hooks/use-delete-project.ts`.
5. Update `src/app/api/v2/projects/[projectId]/route.ts` (DELETE → soft delete + role check; GET →
   exclude deleted).
6. Add `.neq("status", "deleted")` to the three read queries: `projects/page.tsx`,
   `[projectId]/_get-project-detail-data.ts`, `portfolio-tracker/[projectId]/_load-detail-data.ts`,
   `api/onboarding/projects/route.ts`, `api/onboarding/projects/status-report/route.ts` (5 files total).
7. Build `_delete-project-action.tsx` (Projects) and wire it into `_project-detail.tsx`.
8. Build `_delete-project-menu-item.tsx` (Portfolio Tracker) and wire it into `_onboarding-detail.tsx`'s
   Settings menu, broadening the gear's visibility gate.
9. `npx tsc --noEmit`.
10. Manual browser verification (see below).

## Acceptance Criteria

- [ ] Migration adds `'deleted'` to `projects.status` CHECK without touching existing rows.
- [ ] As `admin` or `pm`: a "Delete Project" action is visible and clickable on a project's detail page
      in both `/v2/projects/[projectId]` and `/v2/portfolio-tracker/[projectId]`.
- [ ] As `developer`/`client`/`hr` (or any role outside `admin|pm|super_admin`): the action is not
      rendered.
- [ ] Clicking it shows a styled confirmation dialog (not `window.confirm`) stating the action is
      irreversible; Cancel closes it with no change.
- [ ] Confirming: the project's DB row still exists afterward with `status = 'deleted'` — not removed.
- [ ] After confirming, the user lands back on that module's list page, and the deleted project is
      absent from it (grid and table views, every filter combination, including no filter applied).
- [ ] The deleted project is absent from `/v2/portfolio-tracker/status-report`.
- [ ] Navigating directly to either deleted-project detail URL 404s.
- [ ] `DELETE /api/v2/projects/[projectId]` called directly (e.g. via curl) as a non-admin/pm session
      returns 403 and leaves `status` unchanged.
- [ ] `PATCH /api/v2/projects/[projectId]` with `{ "status": "deleted" }` is rejected (400 — not in
      `VALID_STATUS`).
- [ ] `npx tsc --noEmit` passes.

## Verification

- `npx tsc --noEmit`
- `pnpm lint`
- Browser: as a `pm` user, delete a disposable/test project from `/v2/projects/[projectId]`; confirm
  list absence, 404 on revisit, and (via Supabase dashboard or a `select`) that the row and its tasks
  still exist with `status = 'deleted'`.
- Repeat from `/v2/portfolio-tracker/[projectId]` for a second test project.
- As a `developer` session, confirm the delete action is not visible on either detail page.

## Compatibility Touchpoints

- RLS: no policy change needed — `projects_pm_write` (migration 026) already permits `admin`/`pm` to
  `UPDATE` the `projects` table, which is all a soft delete requires. `super_admin` reaching this action
  depends on how `get_my_role()` resolves for that role today (same as every other `super_admin` check
  already in this module) — not altered by this task.
- Any other code path querying `projects` without a `status` filter (see "Out of Scope") will continue
  to include deleted rows until separately audited — this is a known, accepted gap, not a regression
  introduced silently.

## Implementation Notes

### What Changed
- Added `'deleted'` as a valid `projects.status` value (new migration, mirroring the existing
  `customer_products.status = 'archived'` soft-delete pattern).
- Repurposed the previously-dead-code `DELETE /api/v2/projects/[projectId]` handler from a hard
  delete into a role-gated (`admin`/`pm`/`super_admin`) soft delete (`status = 'deleted'`); hardened
  its `GET` handler to exclude deleted rows. Left `PATCH`'s `VALID_STATUS` untouched — `'deleted'` is
  not settable through the general edit endpoint.
- Excluded `status = 'deleted'` projects from every listing/detail surface named in Requirement 6:
  `/v2/projects` list query, `/v2/projects/[projectId]` detail loader, `/v2/portfolio-tracker` list
  query, `/v2/portfolio-tracker/[projectId]` detail loader, and the Portfolio Tracker status-report
  query — all via an added `.neq("status", "deleted")`.
- Added a "Delete Project" action to both detail pages, gated to `admin`/`pm`/`super_admin`, opening a
  shared irreversible-action confirmation dialog (no native `window.confirm`) before calling the new
  soft-delete endpoint and redirecting back to that module's list page.
- Promoted the timelogs page's `ConfirmDialog` to `src/components/ui/confirm-dialog.tsx` (verbatim
  content) since it's now shared by 3 pages, per this codebase's own stated threshold for extracting
  page-scoped UI.
- Added a small shared `useDeleteProject` hook so the fetch/loading/error logic for the delete call
  isn't duplicated between the two new trigger components.

### Files Changed
- `supabase/migrations/099_projects_deleted_status.sql` - new migration adding `'deleted'` to the
  `projects.status` CHECK constraint.
- `src/types/database.ts` - added `"deleted"` to the 3 `projects.status` literal unions (Row/Insert/Update).
- `src/components/ui/confirm-dialog.tsx` - new home for the promoted `ConfirmDialog` (moved from
  `src/app/v2/(hub)/dashboard/timelogs/_confirm-dialog.tsx`, which was deleted).
- `src/app/v2/(hub)/dashboard/timelogs/_time-logs-content.tsx` - updated `ConfirmDialog` import path only.
- `src/hooks/use-delete-project.ts` - new shared hook wrapping the soft-delete fetch call.
- `src/app/api/v2/projects/[projectId]/route.ts` - `DELETE` now soft-deletes with a role check;
  `GET` excludes deleted rows.
- `src/app/api/onboarding/projects/route.ts` - excluded deleted projects from the Portfolio Tracker
  list query.
- `src/app/api/onboarding/projects/status-report/route.ts` - excluded deleted projects from the status
  report query.
- `src/app/v2/(hub)/projects/page.tsx` - excluded deleted projects from the Projects list query
  (unconditional, independent of the status filter).
- `src/app/v2/(hub)/projects/[projectId]/_get-project-detail-data.ts` - excluded deleted projects so a
  stale link 404s.
- `src/app/v2/(hub)/projects/[projectId]/_delete-project-action.tsx` - new trigger component for the
  Projects detail header.
- `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` - wired in `DeleteProjectAction` next to
  the existing "New Task/Issue" header button.
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_load-detail-data.ts` - excluded deleted projects so
  a stale link 404s.
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_delete-project-menu-item.tsx` - new menu-item
  component for the Portfolio Tracker Settings dropdown.
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` - added `canDeleteProject`,
  broadened the Settings-gear visibility gate to include it, and added the new menu item (with a
  divider) after the existing dropdown entries.

### Deviations From Plan
- The task doc's plan for `_delete-project-menu-item.tsx` didn't anticipate that closing the parent
  Settings dropdown on click (as originally sketched) would unmount the just-opened `ConfirmDialog`
  along with it, since the dropdown only renders while `settingsMenuOpen` is true. Fixed by not
  closing the dropdown on click — the dialog's full-screen `z-[60]` overlay sits above the dropdown's
  `z-30` regardless, so leaving it open behind the overlay is visually inert. Documented inline in the
  component.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing warnings in an unrelated, untouched file —
  `_checklist-tab.tsx`'s unused `initialsFor`/`colorFor`)
- Manual browser verification (delete flow, list absence, 404 on stale link, role gating) - SKIPPED
  (deferred to the `test` stage per this workflow's handoff to `simplify`/`test`)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused/dead code, no broad `any`, no deep nesting introduced.
- Role-gate arrays (`admin`/`pm`/`super_admin`) are duplicated 3× (API route's `DELETE_ROLES`,
  `_delete-project-action.tsx`'s local `DELETE_ROLES`, `_delete-project-menu-item.tsx`'s exported
  `DELETE_PROJECT_ROLES`) rather than sharing one constant — matches this codebase's existing,
  already-established convention (`canManageTags`/`canCreateProject`/`DETAIL_ROLES` are each defined
  inline at their own call sites too, no shared "roles" module exists anywhere in this codebase).
  Not flagged as a fix — consistent with prior art, not a new pattern.
- Found and fixed during this gate: the shared `ConfirmDialog`'s Delete button wasn't disabled while
  the request was in flight (only its label changed to "Deleting…") — a user could double-click and
  fire two DELETE requests. Added an optional `confirmDisabled` prop to `ConfirmDialog` and wired
  `confirmDisabled={deleting}` from both new trigger components, matching this codebase's own stated
  UI Polish Convention ("every async action needs a loading state — a disabled button... never a
  silent hang"). `_time-logs-content.tsx`'s existing `ConfirmDialog` usage is unaffected (prop is
  optional, defaults to `false`) and was left untouched — out of this task's scope.
- Verified `npx tsc --noEmit` still passes clean after the fix.

### Deviations
- Minor: `DeleteProjectAction` (Projects) self-guards on `currentUserRole` internally (defense in
  depth, returns `null` if unauthorized); `DeleteProjectMenuItem` (Portfolio Tracker) has no internal
  role check and relies entirely on the parent's `{canDeleteProject && (...)}` conditional render.
  Asymmetric, but not a security gap — the server-side `DELETE` route enforces the same
  `admin/pm/super_admin` check regardless of which UI path reaches it, and the parent's gate is
  correctly wired. Documented, not fixed — changing `DeleteProjectMenuItem`'s prop signature to add a
  redundant role check would touch its already-correct call site for no behavioral difference.
- Minor: the confirm-button double-submit gap above (fixed during this gate, not deferred).
- No Major deviations — implementation matches the task doc's Requirements, Proposed File Changes,
  and Out of Scope boundaries exactly; no files exceed the file-length guidance beyond what was
  already true before this task (both large detail files grew by <20 lines each).
