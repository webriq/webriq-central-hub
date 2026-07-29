# 193: Project Detail — Real Sub-Routes for Tasks/Issues/Milestones + Issue & Milestone Detail Pages + Empty-State Polish

**Created:** 2026-07-27
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep

---

## Overview

`/v2/projects/[projectId]` currently renders Tasks/Issues/Milestones as **client-side tabs** inside one component (`_project-detail.tsx`, `primaryTab` = `useState`, no URL change on switch). Task detail already has a real nested route (`tasks/[taskId]`, using `tasks.display_id` in the URL — task 092/188/190). Issues (task 192) and Milestones have no dedicated routes at all — Issues are viewed/edited in a modal, Milestones are an inline-editable table with no drill-in.

This task converts all three tabs into real, linkable sub-routes, adds a full detail page for Issues (mirroring the Tasks detail page — reversing task 192's "no dedicated route" call now that the PM wants deep-linkable issue URLs), adds a list + detail route for Milestones (which today has neither), and upgrades the zero-data empty states ("No tasks yet." / "No issues yet.") to the icon+message+action pattern already used by the filtered-empty state ("No tasks match your filters.").

**User-confirmed decisions (via clarifying questions before this doc was written):**
- Milestone detail route uses `milestones.id` (UUID) — **not** a new display_id/migration. This matches the app's default UUID-as-routing-key rule; only the two documented exceptions (portfolio-tracker, and `projects/[projectId]` + its `tasks/[taskId]` nested route) use non-UUID segments.
- The bare `/v2/projects/[projectId]` URL (no sub-route) now **redirects** to `/v2/projects/[projectId]/tasks`, so existing bookmarks/links keep working.

**Issue display ID clarification:** the request's phrasing ("display issue_id will be saved as issues.prefix… Central Hub format… `<8char>-I####`") describes something that **already exists** — `issues.display_id`, added by migration 089/task 189, in exactly that format (`<owning project's project_id, "-PROJ-" stripped>-I####`). It is separate from `issues.prefix` (Zoho's own raw import format, e.g. `"TC3-I1"`, untouched — see CLAUDE.md). This task reuses `issues.display_id` as the new `/issues/[issueId]` route segment, exactly mirroring how `tasks.display_id` is already used in `/tasks/[taskId]` (task 190). No migration needed.

## Requirements

### A. Route restructure (Tasks/Issues/Milestones become real routes)
- [ ] `/v2/projects/[projectId]/tasks` — Tasks tab content (List/Board/Calendar, toolbar, header CTA). This becomes the **landing page** when a project is opened from the Projects listing.
- [ ] `/v2/projects/[projectId]/issues` — Issues tab content (List/Board/Calendar, toolbar, header CTA).
- [ ] `/v2/projects/[projectId]/milestones` — Milestones tab content (existing `MilestonePanel` table).
- [ ] `/v2/projects/[projectId]` (bare, no sub-route) — server-redirects to `/v2/projects/[projectId]/tasks`.
- [ ] Clicking a project card/row in `/v2/projects` (`_projects-index.tsx`) navigates straight to `.../tasks` (not the bare route).
- [ ] The primary-tab pills switch routes via `router.push` (not local state); the active tab is derived from the URL segment, so direct links to `/issues` or `/milestones` land on the correct tab with correct pill highlighted.
- [ ] All existing tab content, state, mutations, realtime subscriptions (`project_tasks_${id}`, `project_issues_${id}`), filters, and view toggles keep working unchanged — this is a routing change, not a behavior rewrite.

### B. Issue detail page (new — mirrors Task detail page)
- [ ] `/v2/projects/[projectId]/issues/[issueId]` — full detail page, `issueId` param is `issues.display_id` (not UUID), looked up the same way `tasks/[taskId]/page.tsx` looks up `display_id`.
- [ ] Same visual/structural pattern as `tasks/[taskId]/_task-detail.tsx`: header with back-link + breadcrumb tag (`ISSUE · {display_id}`) + status/severity badges + editable title + delete button; left column Description card; right sidebar Details card with Status, Severity, Assignee (single-select from project members), Due date — all auto-saving on change/blur via `PATCH /api/v2/issues/[issueId]` (existing endpoint, no changes needed — already accepts `title`, `description`, `status`, `severity`, `assignee_name`, `assignee_email`, `due_date`).
- [ ] No Subtasks/Labels/Milestone/Start-date/Estimate/Links sections — those fields don't exist on `issues` (per task 192's field-parity notes).
- [ ] Clicking an issue row/card in the Issues tab **navigates to this page** instead of opening the edit modal. The existing `EditIssueModal` component, its `editingIssue` state, and its mount block in `_project-detail.tsx` are removed (dead code once navigation replaces it) — `CreateIssueModal` (issue **creation**) is untouched, since Tasks also keep their create modal and only route to a page for editing/viewing an existing item.

### C. Milestones — list content + new detail page
- [ ] `/v2/projects/[projectId]/milestones` renders the existing `MilestonePanel` (inline add/edit/delete table) unchanged in behavior — this requirement is satisfied by the route restructure in (A).
- [ ] `/v2/projects/[projectId]/milestones/[milestoneId]` — new detail page, `milestoneId` param is the milestone's **UUID** (per user decision above). Same Card/Meta visual shell as the Task/Issue detail pages: header (back-link, editable name, status badge, delete), left column Description card (milestones have a `description` column that the panel table never surfaces today — this page is its first UI), right sidebar Details card (Status, Due date, Start date), and a "Tasks" card listing tasks where `milestone_id` matches (title + status badge, count badge like the Task detail page's Subtasks count, each row clickable through to that task's own detail page). Auto-saves via the existing `PATCH /api/v2/milestones/[milestoneId]` endpoint (already used by `MilestonePanel`).
- [ ] Milestone rows in `MilestonePanel`'s table get their name turned into a link to the detail page (`Pencil`/`Trash2` inline-edit actions stay as-is — the row name link is additive, not a replacement for inline editing).

### D. Empty-state polish
- [ ] `_list-view.tsx`'s zero-data block ("No tasks yet.", currently plain centered text) is upgraded to match the visual pattern already used by its own filtered-empty block a few lines below (`No tasks match your filters.`): icon in a rounded `#EDF0F7` circle + message + a primary action button. Action: "+ New Task" (reuses the same create-flow the header CTA already triggers).
- [ ] `_issue-list-view.tsx`'s zero-data block ("No issues yet.") gets the identical treatment: icon + message + "+ New Issue" primary action.
- [ ] Board/Calendar views are unaffected — neither currently has (nor needs) a distinct "no items" message; this requirement is scoped to the List views, matching where the existing filtered-empty pattern already lives.

## Out of Scope / Must-Not-Change

- No new DB migration. Issue routing reuses the existing `issues.display_id` (migration 089); Milestone routing uses the existing `milestones.id` UUID. `issues.prefix` (Zoho's raw format) is untouched.
- No redesign of `MilestonePanel`'s visual style (still the older slate-palette table, not the v2.0 `#0B1533`/`#5F6A88` palette used by Tasks/Issues) — only add the row-name → detail-page link. A full MilestonePanel restyle is a separate, not-requested task.
- No changes to `CreateIssueModal`, `CreateTaskModal`, or task creation/edit flows beyond what's needed to remove `EditIssueModal`.
- No changes to `_board-view.tsx`, `_calendar-view.tsx`, `_issue-board-view.tsx`, `_issue-calendar-view.tsx` internals beyond the `onOpen` callback body change already required for issues (list/board/calendar `onOpen` prop signatures are unchanged — only what `_project-detail.tsx` does inside the callback changes, from `setEditingIssue(issue)` to `router.push(...)`).
- No RLS changes — `issues_pm_write`/`milestones_pm_write` policies already cover PATCH/DELETE from the new detail pages exactly as they cover the existing modal/panel paths.
- Do not touch `_docs/mcp-tools.md` — no MCP tool changes.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/projects/[projectId]/_get-project-detail-data.ts` | Create | Extract the current `page.tsx` `Promise.all` fetch (project, milestones, tasklists, tasks, issues, customer, profiles, time logs) into one shared async function used by all 3 new tab routes. Returns `null` (caller does `notFound()`) if the project isn't found. |
| `src/app/v2/(hub)/projects/[projectId]/page.tsx` | Modify | Replace body with `redirect(`/v2/projects/${projectId}/tasks`)` (`next/navigation`). |
| `src/app/v2/(hub)/projects/[projectId]/tasks/page.tsx` | Create | Calls `getProjectDetailData`, `notFound()` if missing, renders `<ProjectDetail {...data} activeTab="tasks" />`. |
| `src/app/v2/(hub)/projects/[projectId]/issues/page.tsx` | Create | Same shape, `activeTab="issues"`. |
| `src/app/v2/(hub)/projects/[projectId]/milestones/page.tsx` | Create | Same shape, `activeTab="milestones"`. |
| `src/app/v2/(hub)/projects/[projectId]/tasks/loading.tsx` | Create | Move the existing `[projectId]/loading.tsx` skeleton here (it already models the task-list skeleton). |
| `src/app/v2/(hub)/projects/[projectId]/issues/loading.tsx` | Create | Adapted copy (column labels: Issue Name/Status/Assignee/Due/Severity). |
| `src/app/v2/(hub)/projects/[projectId]/milestones/loading.tsx` | Create | Simple table-row skeleton mirroring `MilestonePanel`'s columns. |
| `src/app/v2/(hub)/projects/[projectId]/loading.tsx` | Keep as-is | Harmless fallback for the brief redirect; not the primary skeleton anymore. |
| `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` | Modify | Replace `primaryTab` `useState` with an `activeTab: PrimaryTab` prop; tab-pill `onClick` → `router.push` to the sub-route; Issues `onOpen` handlers (list/board/calendar) → `router.push` to the issue detail page instead of `setEditingIssue`; remove `EditIssueModal` function, `editingIssue` state, and its mount block. |
| `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` | Modify | Upgrade zero-data empty state (icon + "No tasks yet." + "+ New Task" action); add `onCreateNew?: () => void` prop, wired from `_project-detail.tsx`'s existing `setCreateDefaults({})`. |
| `src/app/v2/(hub)/projects/[projectId]/_issue-list-view.tsx` | Modify | Same treatment for "No issues yet."; add `onCreateNew?: () => void` prop, wired from `_project-detail.tsx`'s existing `setCreateIssueOpen(true)`. |
| `src/app/v2/(hub)/projects/[projectId]/_milestone-panel.tsx` | Modify | Add `projectSlug: string` prop (`project.project_id`, distinct from the existing `projectId` UUID prop used in the create-POST body); milestone name cell becomes a `<Link>`/button to `/v2/projects/${projectSlug}/milestones/${m.id}`. |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | 2 "back to project" nav spots (`router.push(`/v2/projects/${project.project_id}`)`) → append `/tasks` to skip the redirect hop. |
| `src/app/v2/(hub)/projects/_projects-index.tsx` | Modify | 2 nav spots (`href`/`onClick`) that build `${V2_ROUTES.PROJECTS}/${p.project_id}` → append `/tasks`. |
| `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/page.tsx` | Create | Server component: fetch `project` (id, name, customer_id, project_id), fetch `issue` via `.eq("display_id", issueId).eq("project_id", project.id).single()`, fetch `allMembers` (profiles, same role filter as the project page), `notFound()` if issue missing. |
| `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/_issue-detail.tsx` | Create | Client component — issue detail UI per Requirement B. |
| `src/app/v2/(hub)/projects/[projectId]/milestones/[milestoneId]/page.tsx` | Create | Server component: fetch `project`, fetch `milestone` via `.eq("id", milestoneId).eq("project_id", project.id).single()`, fetch linked `tasks` via `.eq("milestone_id", milestone.id)`, `notFound()` if milestone missing. |
| `src/app/v2/(hub)/projects/[projectId]/milestones/[milestoneId]/_milestone-detail.tsx` | Create | Client component — milestone detail UI per Requirement C. |

## Code Context

### Current tab state — becomes a prop
`src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx:28,114,438-456`
```tsx
type PrimaryTab = "tasks" | "issues" | "milestones";
// ...
const [primaryTab, setPrimaryTab] = useState<PrimaryTab>("tasks");
// ...
{PRIMARY_TABS.map((tab) => (
  <button key={tab.id} onClick={() => setPrimaryTab(tab.id)} className={cn(/* active styling via primaryTab === tab.id */)}>
    {tab.label}
  </button>
))}
```
Change: `primaryTab` becomes a prop (`activeTab`), the click handler becomes `router.push(`/v2/projects/${project.project_id}/${tab.id}`)`. All other reads of `primaryTab` in the file (header CTA label/handler at line ~431-434, content-area conditionals at ~463/563/644) keep working unchanged since they just read the (now-prop) value.

### Existing task-detail route — the exact pattern to mirror for issues
`src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/page.tsx` (full file, 41 lines) — note the `display_id` lookup:
```ts
const [{ data: task }, { data: milestones }] = await Promise.all([
  supabase.from("tasks").select("*").eq("display_id", taskId).eq("project_id", project.id).single(),
  supabase.from("milestones").select("*").eq("project_id", project.id).order("position", { ascending: true, nullsFirst: false }),
]);
if (!task) notFound();
```
Issue detail page's fetch is identical in shape, swapping `tasks`→`issues` and dropping the milestones query (issues have no milestone linkage), adding a `profiles` query for `allMembers` instead (needed for the Assignee picker — task detail page's Assignees section is read-only chips and doesn't need this, but Issues' Assignee field is an editable single-select).

### `saveField` auto-save pattern (task detail) — reuse as-is for issue/milestone detail
`src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx:107-126`
```tsx
const saveField = useCallback(async (patch: Partial<Task>) => {
  await fetch(`/api/v2/tasks/${task.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
}, [task.id]);

const saveTitle = useCallback(() => {
  const trimmed = title.trim();
  if (trimmed && trimmed !== task.title) void saveField({ title: trimmed });
}, [title, task.title, saveField]);
```
Same shape for issues (`PATCH /api/v2/issues/${issue.id}`, already accepts every field the detail page needs — see below) and milestones (`PATCH /api/v2/milestones/${milestone.id}`, already used by `MilestonePanel`).

### `PATCH /api/v2/issues/[issueId]` — already supports everything the detail page needs, no API changes required
`src/app/api/v2/issues/[issueId]/route.ts:24-41`
```ts
if (typeof body.title === "string") patch.title = body.title.trim();
if ("description" in body) patch.description = body.description?.trim?.() || null;
if ("due_date" in body) patch.due_date = body.due_date || null;
if ("assignee_name" in body) patch.assignee_name = body.assignee_name?.trim?.() || null;
if ("assignee_email" in body) patch.assignee_email = body.assignee_email?.trim?.() || null;
if (typeof body.status === "string") { /* VALID_STATUS check */ }
if ("severity" in body) { /* VALID_SEVERITY check */ }
```
`DELETE /api/v2/issues/[issueId]` also already exists (same file, lines 60-76).

### Existing `EditIssueModal` — the exact field/save logic to port into the new page (then delete the modal)
`src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx:1116-1268` — already implements title/description/status/severity/assignee(single-select from `allMembers`, writing `assignee_name` and clearing `assignee_email` when a member is picked)/due_date, with this save shape:
```tsx
const assignee = allMembers.find((m) => m.id === assigneeId);
const ok = await onSave(issue.id, {
  title: title.trim() || issue.title,
  description: description.trim() || null,
  status, severity,
  assignee_name: assignee?.full_name ?? null,
  assignee_email: assignee ? null : issue.assignee_email,
  due_date: dueDate || null,
});
```
Port this exact assignee-resolution logic into the new detail page's `saveField` call for the Assignee `<select>`. `MemberOption` type (`{ id: string; full_name: string | null; avatar_url: string | null }`) is currently local to `_project-detail.tsx:968` — redeclare identically (or export it) for the new page.

### Zero-data empty state to upgrade, using the filtered-empty block right below it as the visual template
`src/app/v2/(hub)/projects/[projectId]/_list-view.tsx:362-385`
```tsx
if (tasks.length === 0 && tasklists.length === 0 && !hasActiveFilters) {
  return (
    <div className="flex items-center justify-center h-full">
      <p className="text-[13px] text-[#5F6A88]">No tasks yet.</p>
    </div>
  );
}
if (tasks.length === 0 && hasActiveFilters) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-3">
      <div className="w-10 h-10 rounded-full bg-[#EDF0F7] flex items-center justify-center">
        <SearchX size={18} className="text-[#5F6A88]" />
      </div>
      <p className="text-[13px] text-[#5F6A88]">No tasks match your filters.</p>
      <button onClick={onClearFilters} className="text-[12px] font-semibold text-[#007BFF] hover:text-[#0063D6] cursor-pointer transition-colors">
        Clear filters
      </button>
    </div>
  );
}
```
The zero-data branch should get the same `w-10 h-10 rounded-full bg-[#EDF0F7]` icon treatment (e.g. `ClipboardList`/`ListTodo` for tasks, `Bug` for issues — all already available via `lucide-react`, already a project dependency) plus a "+ New Task"/"+ New Issue" button styled like the `Clear filters` button but triggering `onCreateNew`. Identical structure applies to `_issue-list-view.tsx:230-236`.

### Milestone schema (fields available for the new detail page — `description` and `start_date` are currently unused by `MilestonePanel`)
`supabase/migrations/033_milestones.sql` + `038_milestones_start_date.sql`:
```sql
create table milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text,
  due_date date,
  status text not null check (status in ('planned', 'active', 'completed')) default 'planned',
  position numeric,
  start_date date,        -- added migration 038
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```
RLS (migration 033): `milestones_staff_read` (admin/pm/developer SELECT), `milestones_pm_write` (admin/pm full write) — same pattern the detail page's PATCH/DELETE will rely on, no changes needed.

## Implementation Steps

1. Create `_get-project-detail-data.ts`; move the `Promise.all` block out of `page.tsx` into it.
2. Convert `[projectId]/page.tsx` to a redirect; create `tasks/page.tsx`, `issues/page.tsx`, `milestones/page.tsx` as thin wrappers around the shared fetch + `<ProjectDetail activeTab="..." />`.
3. Move `[projectId]/loading.tsx`'s skeleton to `tasks/loading.tsx`; add adapted `issues/loading.tsx` and `milestones/loading.tsx`.
4. `_project-detail.tsx`: swap `primaryTab` state for an `activeTab` prop; tab clicks → `router.push`; update the two `router.push(V2_ROUTES.PROJECTS)`-adjacent nav call sites if any reference the bare route.
5. `_projects-index.tsx` (2 spots) and `tasks/[taskId]/_task-detail.tsx` (2 spots): append `/tasks` to bare-project navigation targets.
6. Build `issues/[issueId]/page.tsx` + `_issue-detail.tsx` per Code Context above; port `EditIssueModal`'s field/save logic in.
7. In `_project-detail.tsx`: change Issues' three `onOpen` callbacks to `router.push` the new detail route; delete `EditIssueModal`, `editingIssue`, and its mount block.
8. Build `milestones/[milestoneId]/page.tsx` + `_milestone-detail.tsx` (Card/Meta shell, linked-tasks list, `saveField` against the existing milestones PATCH endpoint).
9. `_milestone-panel.tsx`: add `projectSlug` prop, link the name cell to the new detail route; thread `projectSlug={project.project_id}` from `_project-detail.tsx`'s `<MilestonePanel .../>` call site.
10. `_list-view.tsx` / `_issue-list-view.tsx`: upgrade the zero-data empty-state blocks; add and wire `onCreateNew`.
11. `npx tsc --noEmit`, `pnpm lint`, then manual browser walkthrough (see Verification).

## Acceptance Criteria

- [ ] Clicking a project in `/v2/projects` lands on `/v2/projects/<project_id>/tasks`.
- [ ] Visiting the bare `/v2/projects/<project_id>` redirects to `/tasks`.
- [ ] `/tasks`, `/issues`, `/milestones` each render their tab's existing content with correct pill highlighted; switching tabs changes the URL; browser back/forward works across tabs.
- [ ] Clicking an issue row/card in the Issues tab navigates to `/v2/projects/<project_id>/issues/<issue.display_id>`; the page shows editable title/description/status/severity/assignee/due date; edits persist (verify via reload); Delete removes the issue and returns to the Issues tab.
- [ ] `EditIssueModal` no longer exists in the codebase; issue creation via "+ New Issue" is unaffected.
- [ ] Clicking a milestone name in the Milestones tab navigates to `/v2/projects/<project_id>/milestones/<milestone.id>`; the page shows editable name/description/status/due date/start date and a list of linked tasks (clickable through to task detail); Delete removes the milestone and returns to the Milestones tab. Milestone inline add/edit/delete in the panel table still works unchanged.
- [ ] A project with zero tasks shows an icon + "No tasks yet." + "+ New Task" (opens the create modal); a project with zero issues shows the equivalent for issues. Filtered-to-zero states ("No tasks match your filters.") are unchanged.
- [ ] Task detail page's "back to project" link goes to the Tasks tab (`/tasks`), not the bare (now-redirecting) project URL.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with 0 errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manual walkthrough:
#  - /v2/projects → click a project card → lands on .../tasks
#  - visit bare /v2/projects/<id> directly → redirects to .../tasks
#  - switch Tasks/Issues/Milestones pills → URL changes, back/forward works
#  - Issues tab: click a row → issue detail page → edit fields, reload, confirm persisted; delete → back to Issues tab
#  - Milestones tab: click a milestone name → milestone detail page → edit fields incl. description/start date (new), see linked tasks, click one → task detail page; delete → back to Milestones tab
#  - a project with 0 tasks / 0 issues (or a filtered test) → confirm new icon+CTA empty states; confirm filtered-empty states unchanged
#  - Task detail page "back" link → confirm it goes straight to /tasks
```

## Compatibility Touchpoints

- No DB migration.
- No Zoho import/export route changes.
- No RLS policy changes.
- `_docs/mcp-tools.md` not affected.

## Implementation Notes

### What Changed
- Converted `/v2/projects/[projectId]` from a single client-tabbed page into real sub-routes: `tasks/`, `issues/`, `milestones/` (each a thin server page calling a new shared `_get-project-detail-data.ts` fetch, rendering `ProjectDetail` with an `activeTab` prop). The bare `[projectId]/page.tsx` now just `redirect()`s to `./tasks`.
- `_project-detail.tsx`'s `primaryTab` local state became a derived `const primaryTab = activeTab` (prop); tab-pill clicks now `router.push` to the sibling route instead of `setPrimaryTab`.
- Built `/issues/[issueId]` (issue detail page, mirrors the Task detail page's Card/Meta layout) — looked up via `issues.display_id` exactly like `tasks/[taskId]` already does via `tasks.display_id`. Ported `EditIssueModal`'s field/save logic into the new page, then deleted `EditIssueModal`, its `editingIssue` state, and mount block (plus the now-dead `deleteIssue` helper and unused `Trash2` import) since Issues' `onOpen` now navigates to the page instead of opening the modal — mirroring Tasks' existing pattern exactly.
- Built `/milestones/[milestoneId]` (new — milestones previously had no detail view at all), routed by `milestones.id` (UUID, per user decision — no display_id/migration for milestones). Shows description and start date for the first time (previously only editable inline in `MilestonePanel`'s table, which never surfaced those two fields), plus a linked-tasks list (click-through to task detail).
- `_milestone-panel.tsx` milestone-name cells are now `<Link>`s to the detail route (`projectSlug` prop added, kept separate from the existing `projectId` UUID prop which the create-POST body still uses).
- Upgraded `_list-view.tsx`'s and `_issue-list-view.tsx`'s zero-data empty states ("No tasks yet." / "No issues yet.") from plain text to the icon + message + primary-action pattern already used by their sibling filtered-empty state, wired to the existing create-modal triggers via a new optional `onCreateNew` prop.
- Updated all internal "go to project" navigation (`_projects-index.tsx` project-card links, `tasks/[taskId]/_task-detail.tsx` back-links) to target `.../tasks` directly, skipping the redirect hop.

### Files Changed
- `src/app/v2/(hub)/projects/[projectId]/_get-project-detail-data.ts` (new) — shared server fetch extracted from the old `page.tsx`.
- `src/app/v2/(hub)/projects/[projectId]/page.tsx` — now a redirect to `./tasks`.
- `src/app/v2/(hub)/projects/[projectId]/tasks/page.tsx`, `issues/page.tsx`, `milestones/page.tsx` (new) — thin route wrappers.
- `src/app/v2/(hub)/projects/[projectId]/tasks/loading.tsx`, `issues/loading.tsx`, `milestones/loading.tsx` (new) — per-route skeletons (task skeleton moved from the old `[projectId]/loading.tsx`, which is kept as a harmless fallback for the brief redirect).
- `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` — `activeTab` prop replacing `primaryTab` state; tab-pill nav via `router.push`; Issues `onOpen` → route push (list/board/calendar); removed `EditIssueModal`/`editingIssue`/`deleteIssue`/unused `Trash2` import; `onCreateNew` wired to `ListView`/`IssueListView`; `MilestonePanel` call site passes `projectSlug`.
- `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx`, `_issue-list-view.tsx` — zero-data empty-state icon/CTA upgrade + `onCreateNew` prop.
- `src/app/v2/(hub)/projects/[projectId]/_milestone-panel.tsx` — `projectSlug` prop, milestone-name cell is now a `Link`.
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx` — back-links target `.../tasks`.
- `src/app/v2/(hub)/projects/_projects-index.tsx` — project-card nav targets append `/tasks`.
- `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/page.tsx`, `_issue-detail.tsx` (new) — issue detail route.
- `src/app/v2/(hub)/projects/[projectId]/milestones/[milestoneId]/page.tsx`, `_milestone-detail.tsx` (new) — milestone detail route.
- `src/app/api/v2/milestones/[milestoneId]/route.ts` — PATCH now also accepts `start_date` (was previously write-only via DB default/import; needed so the new milestone detail page's Start date field can save — see Deviations).

### Deviations From Plan
- **`PATCH /api/v2/milestones/[milestoneId]` extended to accept `start_date`.** The task doc's Requirement C explicitly calls for an editable Start date field on the milestone detail page, but the existing endpoint only handled `name`/`description`/`due_date`/`position`/`status`. Added one `if ("start_date" in body) patch.start_date = body.start_date || null;` line — minimal, in-scope, required to fulfill the stated requirement rather than scope creep.
- No other deviations — routing, display_id reuse, and the milestone UUID/redirect decisions all match the doc and the pre-implementation clarifying answers.

### Verification Run
- `npx tsc --noEmit` — PASS (re-run after every file group; clean throughout)
- `pnpm lint` — PASS, 0 errors/warnings (2 warnings surfaced mid-work from `EditIssueModal` removal — `Trash2` unused import, `deleteIssue` unused helper — both cleaned up, re-ran to confirm 0/0)
- Manual browser walkthrough (existing dev server on :3000, real seed data) — PASS:
  - Project card click from `/v2/projects` → lands on `.../tasks`; bare `/v2/projects/<id>` → redirects to `.../tasks`.
  - Tasks/Issues/Milestones pill clicks change the URL to the matching sub-route with correct content per route.
  - Issues tab on a project with real issues (`7149F820-PROJ-01`) → clicked an issue → landed on `.../issues/7149F82001-I0020` (display_id in URL, confirmed via a second issue `.../issues/7149F82001-I0021` with sequential numbering) → header/status/severity/description/assignee/due-date all rendered correctly.
  - Created a throwaway test issue, edited its Description on the detail page, reloaded → edit persisted. Deleted it via the page's trash icon → confirmed removed from the Issues list (real seed data untouched — only the throwaway issue was created and deleted).
  - Milestones tab → milestone name is a link → milestone detail page shows description/status/start date/due date and a linked-tasks list with real data (11 tasks, correct done/total badge) → clicked a linked task → landed on its task detail page (`.../tasks/2CDB334E02-T0036`) with the back-link correctly showing the project name.
  - Zero-task and zero-issue empty states verified on real projects with no data (`46305B0C-PROJ-01`): icon + "No tasks yet." / "No issues yet." + "+ New Task" / "+ New Issue" button, clicking the button opens the respective create modal. Filtered-empty states ("No tasks/issues match your filters.") unaffected.
  - Task detail page back-link confirmed going straight to `.../tasks` (no redirect hop).
