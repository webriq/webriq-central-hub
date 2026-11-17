# 479: Status Report — per-project Tasks panel (top 5 open) + New Task

**Created:** 2026-11-17
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

The classification Status Report (`/projects/<slug>/status-report`, task 473) shows programme
health per project but no task-level view, so a PM reviewing a slipping project has to leave the
report to see or add work. This task adds:

1. A **Tasks panel inside each expanded report row** — the project's 5 most actionable open tasks
   (overdue / soonest due first), a **See more** link to that project's Tasks tab, and a
   **New task** button.
2. A **page-level New task** button in the report header that asks for a project first (picker
   gate, same pattern as the Inbox "File a Ticket" modal), then opens the same modal.

Both entry points open the **existing `CreateTaskModal`** unchanged. No API or schema changes.

### Decisions (confirmed with user 2026-11-17)

| Question | Decision |
|---|---|
| Placement | Tasks panel in the expanded row **and** a header "New task" button with a project picker |
| Which 5 tasks | Open (status ≠ `closed`) top-level tasks, overdue/soonest due first; no due date last |
| Project's own Status Report tab | **Not shown there** — classification report only (Tasks tab is one click away) |

## Requirements

- [ ] Expanded row on `/projects/<slug>/status-report` shows a **Tasks** panel below the phase table.
- [ ] Panel lists up to **5 open top-level tasks** (excludes `closed`, subtasks, checklist rows), sorted
      `due_date` ascending with nulls last, then `position`.
- [ ] Each row: display ID (mono), title (links to task detail), status badge, priority, due date
      (mono; `--late` red + "Overdue" text, not color alone, when past due).
- [ ] Panel header: "Tasks" title, open count in mono, ghost **New task** button.
- [ ] Footer **See more** link → `${projectsBase}/${project.projectId}/tasks`, with "N open" count. Shown
      whenever the project has any tasks.
- [ ] Tasks load lazily on first expand only (no fetch for collapsed rows); skeleton rows while loading;
      inline error + Retry on failure; empty state (icon + one line + "New task" action) when no open tasks.
- [ ] Header **New task** button (the page's one orange CTA) opens a project picker limited to this
      classification's projects, then `CreateTaskModal` for the chosen project.
- [ ] Row-panel **New task** skips the picker and opens `CreateTaskModal` for that row's project.
- [ ] Before the modal opens, the project's milestones, tasklists, members and tasks are fetched in
      parallel (loading state on the triggering button / picker "Continue" button; inline error on failure).
- [ ] On create: `toast.success("Task created in {project}")` with a **View** action to the task detail;
      the panel for that project (if mounted) refreshes and shows the new task when it ranks in the top 5.
- [ ] Projects with a null display `projectId` show the panel's unavailable state ("Tasks unavailable —
      this project has no project code") and are excluded from the picker (the tasks API resolves by display ID).
- [ ] The project's own Status Report tab (`_status-report-tab.tsx`) renders **no** Tasks panel.
- [ ] Follows `_final_design/guide/central-hub-design-system.md` tokens (see Design Notes); every new
      file ≤ 250 lines, functions ≤ ~75 lines (`nextjs-file-length-best-practices.md`).

## Out of Scope / Must-Not-Change

- `CreateTaskModal` (`_shared/_create-task-modal.tsx`) — reuse as-is; no prop or behavior changes.
- No API route changes (`GET/POST /api/v2/projects/[projectId]/tasks`, `/milestones`, `/tasklists`,
  `/members` are used as they are). No migrations.
- Status report API (`/api/onboarding/projects/status-report`) and its payload — unchanged.
- No inline task editing (status/assignee changes) in the panel; it is read + create only.
- Legacy `projects-old` and `projects/legacy` routes — untouched.
- Do not restyle the existing phase table, filters, or note cells.
- Do not "fix" `StatusBadge`/`PriorityBadge`'s existing `style={{}}` usage — reuse them as they are.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_status-report/_status-report-tasks-context.tsx` | Create (~60 lines) | `StatusReportTasksProvider` + `useStatusReportTasks()` — exposes `openNewTask(project \| null)` and `refreshKey(projectId)`. Hosts the modal launcher. Its absence (project tab) hides the panel. |
| `src/app/(hub)/projects/_status-report/_use-project-open-tasks.ts` | Create (~70 lines) | Hook: lazy-fetch `GET /api/v2/projects/{projectId}/tasks`, derive `preview` (top 5 open, sorted), `openCount`, `totalCount`, `loading`, `error`, `retry`. Re-fetches when `refreshKey` changes. |
| `src/app/(hub)/projects/_status-report/_status-report-tasks-panel.tsx` | Create (~160 lines) | The panel UI (header, rows, skeleton, empty/error/unavailable states, See more). |
| `src/app/(hub)/projects/_status-report/_status-report-new-task.tsx` | Create (~180 lines) | `NewTaskLauncher`: optional project-picker gate → parallel bundle fetch → `<CreateTaskModal>`; on create toasts + bumps refresh key. |
| `src/app/(hub)/projects/_status-report/_status-report-row-detail.tsx` | Modify (+3 lines) | Render `<StatusReportTasksPanel project={project} />` below the phase table. |
| `src/app/(hub)/projects/_status-report/_status-report-client.tsx` | Modify (~+20 lines) | Wrap content in `StatusReportTasksProvider` (projects = this classification's list); add header orange **New task** button. |

`_status-report-table.tsx` and `_shared/_status-report-tab.tsx` need **no** change: the panel returns
`null` when there is no provider, and only the classification client mounts one.

## Code Context

### `_status-report-client.tsx` (233 lines) — where the provider + header CTA go

```tsx
export default function StatusReportClient({ role, tabId }: { role: string | null; tabId: ClassificationTabId }) {
  const classification = classificationForTab(tabId);
  const [projects, setProjects] = useState<ProjectStatusReportItem[]>([]);
  // ... filters ...
  const filtered = useMemo(() => { let list = projects.filter((p) => p.classification === classification); ... }, [...]);
  return (
    <div>
      <div className="sticky top-0 z-20 bg-[#F4F6FB]">
        <div className="max-w-350 mx-auto px-8 pt-6 pb-4">
          ...
          <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
            <div>{/* h1 + subtitle */}</div>
            {/* ← add the orange "New task" CTA here (right side of the title row) */}
          </div>
```

Provider's picker list = `projects.filter((p) => p.classification === classification && p.projectId)`
(all of this classification, not just the filtered view), sorted by `projectName`.

### `_status-report-row-detail.tsx` (97 lines) — add the panel

```tsx
return (
  <div className="flex flex-col gap-3">
    <div className="rounded-[10px] border ...">{/* Project note */}</div>
    <div className="rounded-[10px] border border-[#EDF0F7] bg-white overflow-x-auto">{/* phase table */}</div>
    {/* ← <StatusReportTasksPanel project={project} /> */}
  </div>
);
```

`ProjectStatusReportItem` has `id` (UUID), `projectId` (display code, nullable), `projectName`,
`companyName`, `classification`.

### Existing modal — `src/app/(hub)/projects/_shared/_create-task-modal.tsx`

```tsx
export function CreateTaskModal({ projectId, milestones, tasklists, tasks, allMembers, defaults,
  defaultTitle, defaultDescription, parent, onClose, onCreated, onTasklistCreated }: {
  projectId: string;            // DISPLAY project_id — POSTs to /api/v2/projects/${projectId}/tasks
  milestones: Milestone[]; tasklists: Tasklist[];
  tasks: Task[];                // used for the duplicate-title check — pass the full top-level list
  allMembers: MemberOptionWithRole[];
  defaults: TaskDefaults;       // pass {}
  onClose: () => void; onCreated: (t: Task) => void; onTasklistCreated: (tl: Tasklist) => void;
})
```

Types: `Milestone`, `Tasklist`, `Task`, `TaskStatus` from `@/app/(hub)/projects-old/_pm-shared`;
`MemberOptionWithRole` from `@/app/(hub)/projects/_shared/_project-detail`. `onTasklistCreated` can
append to the launcher's local bundle state.

### Bundle-loading + picker-gate pattern to mirror — `src/app/(hub)/desk/inbox/[inboxId]/_thread-to-project-modal.tsx`

```tsx
const getJson = async <T,>(path: string): Promise<T> => {
  const res = await fetch(`/api/v2/projects/${projectId}${path}`);
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json() as Promise<T>;
};
const [tickets, members] = await Promise.all([getJson<Ticket[]>("/tickets"), getJson<MemberOptionWithRole[]>("/members")]);
// then: if (bundle) return <CreateTicketModal ... />;
// gate UI: fixed overlay bg-[#0B1533]/40, max-w-md card, SearchableSelect of projects, Continue button w/ Loader2
```

For tasks: `Promise.all(["/milestones", "/tasklists", "/members", "/tasks"])`.

### Tasks API — `src/app/api/v2/projects/[projectId]/tasks/route.ts`

`GET` resolves `projects.project_id = :projectId` (display code), returns **top-level** tasks only
(`parent_task_id is null`), already through `excludingChecklist()` and paginated past 1000. Returns a
plain `Task[]` ordered by `position`. RLS scopes test data — no extra `loadTestScope()` needed for a
user-session read. Sorting/filtering to the top 5 happens client-side in the hook.

### Display helpers — `src/app/(hub)/projects-old/_pm-shared.tsx`

`StatusBadge({ status })`, `PriorityBadge({ priority })`, `STATUS_LABEL`, `decodeHtmlEntities(title)`
(Zoho-imported titles contain entities — always decode for display).

### Links

- Tasks tab: `${useProjectsBase()}/${project.projectId}/tasks` (`useProjectsBase` from
  `src/app/(hub)/projects/[classification]/[projectId]/_use-projects-base.ts`, already used by the table).
- Task detail: `${projectsBase}/${project.projectId}/tasks/${task.display_id}` (same as
  `_project-detail.tsx:558`).

## Design Notes (from `_final_design/guide/central-hub-design-system.md`)

During implementation, run `/frontend-design` and `/impeccable:impeccable` against the panel and the
picker gate; the guide below wins on any conflict.

- **Panel:** white, `border-[#EDF0F7]`, `rounded-[10px]` (inner surface, matching sibling Project note
  / phase table in the row detail — no nested card shadow). Head: "Tasks" 11px/600-ish label in the
  same caps style as "Project note" (`text-[9.5px] font-bold uppercase tracking-[0.09em] text-[#5F6A88]`),
  open count as a mono pill; right-aligned ghost **New task** button.
- **Rows:** 13px `--ink` title (truncate, `title` attr for full text), display ID JetBrains Mono 10.5px
  `--muted`, due date mono 11px; `--line-soft` dividers; hover `bg-[#F0F7FF]`; whole title is a `<Link>`
  with visible focus ring.
- **Overdue:** `text-[#C0392B]` **plus** "Overdue" wording — color never the sole indicator.
- **Buttons:** header CTA orange pill (`bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white`,
  matches `_project-detail.tsx` New Task) — the only orange on the page. Panel New task = ghost
  (white, `--line` border, hover border `#A8C6F5`), small size. See more = text link `--blue-700`
  600 with `ArrowRight` icon.
- **Loading:** 5 skeleton rows (`animate-pulse motion-reduce:animate-none bg-[#EDF0F7]`), no spinner in
  the panel. Spinner (`Loader2`) only inside a pressed button while the bundle loads.
- **Empty state teaches:** "No open tasks — add the next step for {projectName}." + New task button.
- **Copy:** sentence case, buttons name outcomes ("New task", "Continue to task details"), errors state
  problem + fix, no exclamation points.
- **Motion:** `transition-colors` only; respects reduced motion.
- Tailwind classes only (no `style={{}}`), `cn()`, static class lookups.

## Implementation Steps

1. **Context** (`_status-report-tasks-context.tsx`): `"use client"`. State: `refreshKeys: Record<string, number>`,
   `launch: { project: ProjectStatusReportItem | null } | null`. Expose `openNewTask(project | null)`,
   `refreshKey(projectId)`, `bump(projectId)`. Render `children` plus `{launch && <NewTaskLauncher .../>}`.
   `useStatusReportTasks()` returns the context value or `null` (no throw).
2. **Hook** (`_use-project-open-tasks.ts`): params `(projectCode: string | null, refreshKey: number)`.
   Use the `useTransition` + `AbortController` fetch-on-mount pattern from `_status-report-tab.tsx`
   (avoids the set-state-in-effect lint rule). Derive with `useMemo`: open = `status !== "closed"`;
   sort `due_date` asc nulls last, then `position`; `preview = open.slice(0, 5)`. Return `{ tasks, preview,
   openCount, totalCount, loading, error, retry }`. Skip fetch when `projectCode` is null.
3. **Panel** (`_status-report-tasks-panel.tsx`): `const ctx = useStatusReportTasks(); if (!ctx) return null;`
   Since the row detail only mounts when expanded, mounting = lazy load. Build header, rows (extract a
   small `TaskPreviewRow` component in the same file), skeleton/empty/error/unavailable states, footer
   See more link.
4. **Launcher** (`_status-report-new-task.tsx`): props `{ project: ProjectStatusReportItem | null; pickable:
   ProjectStatusReportItem[]; onClose; onCreated(project, task) }`. If `project` is null show the picker
   gate (mirror `_thread-to-project-modal.tsx` layout: title "New task", Project `SearchableSelect`, helper
   line, Cancel + blue "Continue" button). Load the bundle; for a row-launched project load immediately
   (show a small centered overlay card with skeleton/“Loading project…” rather than a blank screen).
   Escape closes the gate. Once loaded render `CreateTaskModal` with `defaults={{}}`. `onCreated`: toast
   with View action (`router.push` to task detail), `bump(project.projectId)`, close.
5. **Row detail**: render `<StatusReportTasksPanel project={project} />` last in the flex column.
6. **Client**: wrap returned JSX in `<StatusReportTasksProvider pickable={pickable}>` where `pickable` is the
   memoized classification list with a non-null `projectId`; add header CTA calling `openNewTask(null)`
   (CTA must be a child of the provider — put the provider at the top of the returned tree).
7. Run the design skills on the result; tidy spacing/typography to the guide.
8. `npx tsc --noEmit` and `pnpm lint` (or `npx eslint` on the changed files); check every new file's line count.

## Acceptance Criteria

- [ ] Expanding a row on `/projects/<slug>/status-report` shows a Tasks panel with ≤5 open tasks ordered
      overdue/soonest first; closed tasks, subtasks and checklist rows never appear.
- [ ] Collapsed rows trigger no tasks request (verify in Network tab).
- [ ] "See more" navigates to `/projects/<slug>/<projectCode>/tasks`; a task title navigates to its detail page.
- [ ] Panel New task opens the existing New Task modal directly for that project; creating a task toasts,
      and the panel refreshes (new task visible if it ranks in the top 5; count increments).
- [ ] Header New task opens the picker (only this classification's projects), then the modal for the
      chosen project; Cancel/Escape/backdrop close without side effects.
- [ ] Bundle-load failure shows an inline error with a retry path; the modal never opens with empty
      milestones/tasklists due to a silent failure.
- [ ] Loading → skeleton; no open tasks → teaching empty state with New task; fetch error → message + Retry.
- [ ] A project's own Status Report tab (`/projects/<slug>/<projectCode>/status_report`) shows no Tasks panel.
- [ ] Overdue due dates read as overdue without relying on color.
- [ ] All icon-only controls have `aria-label`; keyboard focus visible on every new control.
- [ ] `npx tsc --noEmit` clean; lint clean on changed files; every new file ≤ 250 lines.

## Verification

```bash
npx tsc --noEmit
npx eslint "src/app/(hub)/projects/_status-report"
wc -l src/app/\(hub\)/projects/_status-report/*.ts*
```

Browser (as a PM): open `/projects/<slug>/status-report` →
1. Expand a project with >5 open tasks: 5 rows, correct order, See more count, link targets.
2. Expand a project with zero open tasks: empty state; create one from it; panel updates.
3. Header New task → pick a project → create → toast View link opens the task.
4. Throttle/Offline the tasks request → error + Retry works.
5. Open a project's own Status Report tab → no Tasks panel.
6. Test-data check: as a non-test user, test projects never appear in the report or picker (RLS + existing report filter).

## Compatibility Touchpoints

- No API, MCP, migration, or env changes — `_docs/mcp-tools.md` untouched.
- `_shared/_status-report-tab.tsx` keeps using `StatusReportTable` unchanged; the panel self-hides there
  because no provider is mounted.
- `CreateTaskModal` is shared with the project Tasks tab and subtask flow — must not be modified.
- If task 430 (`milestone_id/tasklist_id` → `phase_id/deliverable_id` rename) lands first, the modal and
  endpoints change together; this task only passes the endpoints' responses through, so re-check types only.

## Implementation Notes

### What Changed
- Expanded rows on `/projects/<slug>/status-report` now show an **Open tasks** panel. It lists up to 5 open top-level tasks, ordered by due date (oldest first, no date last), then by position. Each row shows the display ID, the title (the whole row links to the task), a status chip using the same `Chip` vocabulary as the phase table, priority, and a mono due tag that names its urgency ("3d overdue" / "Due today" / "Nov 21").
- Panel header has a count pill and a ghost **New task** button. The footer link reads "See all N open tasks" when there are more than 5, otherwise "Open Tasks tab". Loading shows skeleton rows (`role="status"`). Errors show a message with `role="alert"` and a Retry button. The empty state teaches and carries its own New task button, so the header button hides there. A project with no project code shows an unavailable message.
- The report header has an orange **New task** CTA, the page's only orange element. It opens a project picker listing this classification's projects that have a project code. A row's New task button skips the picker. Both load the project's milestones, task lists, members and tasks in parallel, then open the unchanged `CreateTaskModal`. After a task is created, a toast offers a **View** action and that project's panel re-fetches.
- The panel only renders inside `StatusReportTasksProvider`. Only the classification client mounts that provider, so the project's own Status Report tab shows no panel.
- Picker dialog accessibility: focus moves into it on open, Escape closes it, Tab is trapped inside, and focus returns to the button that opened it.

### Files Changed
- `src/app/(hub)/projects/_status-report/_status-report-tasks-context.tsx` (new, 79 lines). Contains the provider, `useStatusReportTasks`, `NewTaskHeaderButton`, per-project refresh keys, and focus return.
- `src/app/(hub)/projects/_status-report/_use-project-open-tasks.ts` (new, 55 lines). Lazy fetch, open filter and sort, and the 5-task preview.
- `src/app/(hub)/projects/_status-report/_status-report-tasks-panel.tsx` (new, 145 lines). The panel UI.
- `src/app/(hub)/projects/_status-report/_status-report-new-task.tsx` (new, ~190 lines). The picker gate, the parallel data load, and `CreateTaskModal`.
- `src/app/(hub)/projects/_status-report/_status-report-row-detail.tsx`. Mounts the panel.
- `src/app/(hub)/projects/_status-report/_status-report-client.tsx`. Adds the provider, the `pickable` list and the header CTA.

### Deviations From Plan
- `NewTaskHeaderButton` lives in the context file rather than the client. It has to sit inside the provider to read the context, and this avoids a new file.
- The design review swapped the legacy `StatusBadge` for the dashboard `Chip`, mapping open → neutral, active statuses → ok, and review/approval statuses → warn. This matches the phase table directly above. The old pill used blue, which the design system reserves for interactive elements.
- The footer link appears whenever the project has any tasks (including closed ones), labelled "See all N open tasks" or "Open Tasks tab". It no longer uses a "See more · N" label.
- Two critique findings were deliberately not applied:
  - **(a) Panel off-screen on phones.** The outer report table has `min-w-[1180px]`, so on phones the panel scrolls horizontally with the row. This is existing table behaviour and is left for a responsive pass on the whole report.
  - **(b) `text-[12px]` detector flag.** The detector flags `text-[12px]` as off the DESIGN.md type ramp. It is kept for consistency with the existing status-report files.

### Verification Run
- `npx tsc --noEmit` - PASS
- `npx eslint "src/app/(hub)/projects/_status-report"` - PASS (one intentional `exhaustive-deps` disable, commented)
- Line counts - PASS (all new files ≤ 190 lines; client 244)
- Impeccable critique - DONE, code-level only. The design review and the detector ran as two separate reviews. No browser was available because the app requires login. Fixes applied are listed above.
- Browser acceptance checks - SKIPPED (pending the test stage)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. Each new file has a single job: provider/context, data hook, panel UI, launcher. All files are ≤ 190 lines and functions are well under 75 lines. No `any`, no debug logging, no dead code. Errors are handled with a message and a retry path. `tsc` and `eslint` are clean.
- Conventions followed:
  - Tailwind only (no `style={{}}` in new code), `cn()`, static class lookups.
  - `<button>`/`<Link>`, never `<div onClick>`; lucide icons; `aria-label` / `role` on states.
  - `pnpm`-free change; no adminClient; no Server Actions.
  - Reads go through the existing user-session API, so RLS and `excludingChecklist()` are applied server-side.
- Cleanup applied during the gate: `dueTag` parsed the due date twice. It now parses once and checks "Due today" first. Behaviour is unchanged; tsc and eslint were re-run and pass.
- Minor, not fixed:
  - **Wrapper indentation.** In `_status-report-client.tsx` the wrapper `<div>` was not re-indented inside `<StatusReportTasksProvider>`. Re-indenting would add ~90 lines of whitespace-only diff to an existing file. Left as is; cosmetic only.
- Minor, not fixed:
  - **Escape key with the project dropdown open.** In the picker gate, pressing Escape while the `SearchableSelect` dropdown is open closes the whole gate, not just the dropdown. The gate is safe to dismiss (nothing is lost), so this is acceptable. Revisit if the test stage finds it annoying.
- One `react-hooks/exhaustive-deps` disable in `_status-report-new-task.tsx` (the mount-time load). A comment explains the reason, and it is the documented fetch-on-mount situation.

### Deviations
- **Minor:** `NewTaskHeaderButton` lives in the context file instead of a separate file or inline in the client. Same behaviour; it needs the provider.
- **Minor:** the status chip uses the dashboard `Chip` instead of the planned `StatusBadge`, for consistency with the phase table above it (design critique). Still read-only and labelled.
- **Minor:** the footer link text is "See all N open tasks" / "Open Tasks tab" instead of "See more · N open". It still links to the project Tasks tab as required.
- **Medium (risk acceptable):** two critique findings are deferred and documented in Implementation Notes:
  - The panel scrolls horizontally on phones, inherited from the report table's `min-w-[1180px]`.
  - `text-[12px]` is off the DESIGN.md type ramp; kept to match the existing report files.
- No major deviations. No API, migration, `CreateTaskModal` or project-tab changes. Scope matches the approved doc.

### Required Fixes
- None.
