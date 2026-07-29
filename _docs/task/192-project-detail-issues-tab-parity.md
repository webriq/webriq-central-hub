# 192: Project Detail — Activate Issues Tab (List/Board/Calendar Parity with Tasks Tab)

**Created:** 2026-07-27
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Completed (2026-07-27)

---

## Overview

`/v2/projects/[projectId]` (`_project-detail.tsx`) currently renders a placeholder ("Issues coming soon.") for the Issues primary tab. The `issues` table (migration 051) has held real imported Zoho Bug/Issue data since task 108, but the codebase has never had a browsing UI for it (per CLAUDE.md: *"Import-only, no Issues browsing UI exists yet"*).

This task activates the Issues tab with full interaction parity to the Tasks tab: search/filter/sort toolbar, List/Board/Calendar view toggle, inline status editing (dropdown + board drag), assignee reassignment, and issue create/edit/delete — confirmed scope via user's explicit choice of "Full parity with Tasks tab" over a read-only alternative.

Two structural facts make this materially different from a copy-paste of the Tasks tab, and drive most of the design decisions below:

1. **`issues.status` already shares the exact same 8-value pipeline as `tasks.status`.** `mapTaskStatus()` (`src/lib/migrate/zoho-import.ts:23-36`) is the same normalization function both the tasks and issues Zoho importers call. This means `BOARD_COLUMNS`, `STATUS_LABEL`, `STATUS_STYLE`, and `normalizeStatus()` from `_pm-shared.tsx` can be reused as-is for Issues — no new status vocabulary needed.
2. **`issues` has no `position` column, no `tasklist_id`, no `parent_task_id`/`depth`, and no `assignees` uuid array** — unlike `tasks`. Issues are flat (no tasklist grouping, no subtasks) and assignment is plain text (`assignee_name`/`assignee_email`, imported from Zoho — not a profile FK). `severity` uses Zoho's own 5-value vocabulary (`None|Minor|Major|Critical|Show stopper`), not the task `priority` enum (see migration 051 comment).

## Requirements

- [ ] Issues tab shows a toolbar matching the Tasks tab's visual pattern: search input, Status filter (reuse `STATUS_OPTS`/`STATUS_LABEL`), Severity filter (new, 5-value), Sort dropdown, and the List/Board/Calendar view toggle — all in the same white toolbar strip under the primary tabs.
- [ ] **List view**: flat table (no tasklist grouping — issues have none) with columns Issue Name / Status / Assignee / Due Date / Severity. Same header/row visual language as `_list-view.tsx` (rounded card, `#E2E7F2` borders, hover tint, sort-toggle headers).
- [ ] **Board view**: same `BOARD_COLUMNS` (8 status columns, same accent colors) as Tasks. Drag-and-drop between columns updates `status`. No in-column reorder persistence (see Out of Scope).
- [ ] **Calendar view**: same month-grid pattern as `_calendar-view.tsx`, keyed on `due_date`.
- [ ] Status changes (dropdown in list rows, drag in board) and severity changes persist via `PATCH /api/v2/issues/[issueId]`, using the same optimistic-update-with-revert pattern as `updateTask` in `_project-detail.tsx`.
- [ ] Assignee reassignment: a single-select picker (not multi, unlike tasks) sourced from `allMembers` (already fetched for Tasks), writing `assignee_name` (and clearing `assignee_email` — see Code Context) via the same PATCH endpoint. Includes an "Unassign" option.
- [ ] Clicking an issue row/card opens an **edit modal** (not a new page route — see Out of Scope) with editable title, description, status, severity, assignee, due date, and a delete action.
- [ ] "New Issue" creation: header CTA button becomes tab-aware — reads "+ New Task" on the Tasks tab (unchanged) and "+ New Issue" on the Issues tab, each opening its own creation modal. New issues post via `POST /api/v2/projects/[projectId]/issues`.
- [ ] Realtime sync: a second Supabase channel subscribed to `postgres_changes` on `issues` filtered by `project_id`, mirroring the existing `project_tasks_${project.id}` channel.
- [ ] Empty states: "No issues yet." when the project has zero issues; a filtered empty state ("No issues match your filters." + Clear filters) when filters exclude everything — mirroring `_list-view.tsx`'s two empty-state branches.
- [ ] `initialIssues` fetched server-side in `page.tsx` alongside the existing parallel queries, passed into `ProjectDetail`.

## Out of Scope / Must-Not-Change

- **No dedicated `/v2/projects/[projectId]/issues/[issueId]` page route.** Tasks' detail page (`tasks/[taskId]/_task-detail.tsx`) carries subtasks, labels, milestone assignment, GitHub/preview links, and estimate hours — none of which exist on `issues`. Building an equivalent full-page detail view for fields that don't apply would be disproportionate to the ask; an in-place edit modal covers view+edit+delete. Revisit as a follow-up task if the PM wants deep-linkable issue URLs.
- **No in-column drag-reorder persistence on the Issues board.** `issues` has no `position` column (unlike `tasks`); adding one is a migration, which is out of scope here. Cards within a column sort by a fixed rule (due date ascending, nulls last, then title) after any status-changing drag. Cross-column drag (status change) still works and persists.
- **`assignee_email` is not resolved from `profiles` on reassignment.** `profiles` has no `email` column (email lives in `auth.users`/JWT claims per CLAUDE.md); resolving it per-member for a picker would require extra admin-API calls. When a PM reassigns via the Hub picker, `assignee_name` is set from the member's `full_name` and `assignee_email` is cleared to `null` (documented in Code Context) rather than left stale from the prior/Zoho assignee. Do not build an admin-API email lookup for this — out of scope.
- **No comments UI.** `issue_comments` (migration 052) stays untouched — CLAUDE.md already flags it as its own separate, not-yet-scoped follow-up.
- **`task_id` linkage on `issues` is not populated or surfaced.** It stays `null` per existing import behavior; no Issue↔Task linking UI.
- Do not modify `_list-view.tsx`, `_board-view.tsx`, `_calendar-view.tsx`, `_task-drawer.tsx`, or anything under `tasks/[taskId]/` — Tasks-tab behavior must be unchanged. New Issues components are separate files.
- Do not touch RLS policies on `issues` (migration 051 already grants `admin|super_admin|pm` full write and `developer` read-only — inline edit affordances render for everyone and rely on the existing optimistic-revert-on-403 pattern already used for tasks; no client-side role gating needed).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/projects/[projectId]/page.tsx` | Modify | Fetch `initialIssues` in the existing `Promise.all`, pass to `ProjectDetail`. |
| `src/app/v2/(hub)/projects/_pm-shared.tsx` | Modify | Add `Issue` type alias, `SEVERITY_OPTS`, `normalizeSeverity()`, `SEVERITY_STYLE`, `SeverityBadge`. |
| `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` | Modify | Wire Issues tab: state (`issues`, `issueSearch`, `issueStatusFilter`, `severityFilter`, sort, view), realtime channel, `updateIssue`/`addIssue`/`removeIssue` mutations, tab-aware header CTA, render `IssueListView`/`IssueBoardView`/`IssueCalendarView`, mount `CreateIssueModal`/`EditIssueModal`. Generalize the existing page-scoped `SortSelect` to accept an `options` prop instead of the hardcoded `SORT_OPTIONS` constant (small refactor, keeps Tasks-tab call site working). |
| `src/app/v2/(hub)/projects/[projectId]/_issue-list-view.tsx` | Create | Flat table list view for issues — mirrors `_list-view.tsx` row/header styling minus grouping, hierarchy, and the timer/hours columns. |
| `src/app/v2/(hub)/projects/[projectId]/_issue-board-view.tsx` | Create | Board view for issues — mirrors `_board-view.tsx`'s `BOARD_COLUMNS`/dnd-kit setup; `onMove(id, status)` has no `position` arg. |
| `src/app/v2/(hub)/projects/[projectId]/_issue-calendar-view.tsx` | Create | Calendar view for issues — mirrors `_calendar-view.tsx`, keyed on `due_date`, severity dot instead of priority dot. |
| `src/app/api/v2/projects/[projectId]/issues/route.ts` | Create | `GET` (list all issues for project) + `POST` (create issue). Mirrors `src/app/api/v2/projects/[projectId]/tasks/route.ts`. |
| `src/app/api/v2/issues/[issueId]/route.ts` | Create | `PATCH` (partial update — status/severity/assignee_name/assignee_email/due_date/title/description/flag) + `DELETE`. Mirrors `src/app/api/v2/tasks/[taskId]/route.ts`. |

## Code Context

### `mapTaskStatus` — proof issues.status shares the tasks pipeline
`src/lib/migrate/zoho-import.ts:23-36`
```ts
export function mapTaskStatus(
  zohoStatusName: string,
  isCompleted: boolean
): "open" | "in_progress" | "ready_for_qa" | "testing_completed" | "for_client_approval" | "ready_to_merge" | "post_live_qa" | "closed" {
  if (isCompleted) return "closed";
  const s = (zohoStatusName ?? "").toLowerCase();
  if (s.includes("progress")) return "in_progress";
  if (s.includes("qa") || s.includes("testing")) return "ready_for_qa";
  if (s.includes("client approval")) return "for_client_approval";
  if (s.includes("merge")) return "ready_to_merge";
  if (s.includes("post live") || s.includes("post_live")) return "post_live_qa";
  if (s.includes("closed") || s.includes("complete") || s.includes("done")) return "closed";
  return "open";
}
```
Both `zoho-import/tasks` and `zoho-import/issues/route.ts:121` call this — safe to reuse `BOARD_COLUMNS`/`STATUS_LABEL`/`STATUS_STYLE`/`normalizeStatus` from `_pm-shared.tsx` unmodified for issues.

### `issues` table shape and RLS
`supabase/migrations/051_issues_table.sql`
```sql
create table issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  task_id uuid references tasks(id) on delete set null,
  external_id text unique,
  prefix text,
  title text not null,
  description text,
  status text not null default 'open',
  severity text,          -- None | Minor | Major | Critical | Show stopper
  flag text,
  assignee_name text,
  assignee_email text,
  due_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  source_meta jsonb default '{}'
);
-- issues_staff_read: admin|super_admin|pm|developer can SELECT
-- issues_pm_write: admin|super_admin|pm can INSERT/UPDATE/DELETE (developer is read-only)
```
`src/types/database.ts` already has the full `Database["public"]["Tables"]["issues"]` type (Row/Insert/Update/Relationships) — no type-gen step needed. Also note `display_id` (migration 089) exists on the Row type for display purposes only, same as `tasks.display_id`.

### Tasks tab's existing realtime + optimistic-update pattern to mirror
`src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx:107-148`
```tsx
useEffect(() => {
  const supabase = createClient();
  const channel = supabase
    .channel(`project_tasks_${project.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "tasks", filter: `project_id=eq.${project.id}` }, (payload) => { /* … */ })
    .subscribe();
  return () => { void supabase.removeChannel(channel); };
}, [project.id]);

const updateTask = useCallback(async (id: string, patch: Partial<Task>) => {
  const snapshot = tasks;
  setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)));
  const res = await fetch(`/api/v2/tasks/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
  if (!res.ok) { setTasks(snapshot); return false; }
  const updated: Task = await res.json();
  setTasks((prev) => prev.map((t) => (t.id === id ? updated : t)));
  return true;
}, [tasks]);
```
Add a second channel (`project_issues_${project.id}`, table `issues`) and an analogous `updateIssue`/`addIssue`/`removeIssue` set. Developer-role PATCH/DELETE attempts on `issues` will 403 under `issues_pm_write` — the existing revert-on-`!res.ok` branch already handles this correctly with no extra code.

### `SortSelect` — needs to become options-driven
`src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx:564-578` currently hardcodes `SORT_OPTIONS` (Tasks-only, includes a `priority` key) inside the `<select>`. Change the component to accept `options: { value: string; label: string }[]` as a prop; pass `SORT_OPTIONS` at the Tasks-tab call site and a new `ISSUE_SORT_OPTIONS` (status/title/due_date/severity — no priority key) at the Issues-tab call site. `FilterMultiSelect` is already generic (`options`/`selected`/`onChange` props) — reuse directly for the new Severity filter, no changes needed there.

### `PRIORITY_STYLE` shape to mirror for `SEVERITY_STYLE`
`src/app/v2/(hub)/projects/_pm-shared.tsx:54-60`
```ts
export const PRIORITY_STYLE: Record<string, { label: string; text: string; dot: string }> = {
  critical: { label: "Critical", text: "#C0392B", dot: "#C0392B" },
  high:     { label: "High",     text: "#8A5A00", dot: "#8A5A00" },
  normal:   { label: "Normal",   text: "#007BFF", dot: "#007BFF" },
  low:      { label: "Low",      text: "#5F6A88", dot: "#5F6A88" },
  none:     { label: "—",        text: "#5F6A88", dot: "#E2E7F2" },
};
```
New `SEVERITY_STYLE` (keyed by Zoho's literal strings) plus `normalizeSeverity(s: string | null): string` that maps unrecognized/`null` → `"None"`, same defensive shape as `normalizeStatus`:
```ts
export const SEVERITY_OPTS = ["Show stopper", "Critical", "Major", "Minor", "None"] as const;
export const SEVERITY_STYLE: Record<string, { label: string; text: string; dot: string }> = {
  "Show stopper": { label: "Show stopper", text: "#C0392B", dot: "#C0392B" },
  "Critical":      { label: "Critical",     text: "#C0392B", dot: "#C0392B" },
  "Major":         { label: "Major",        text: "#8A5A00", dot: "#8A5A00" },
  "Minor":         { label: "Minor",        text: "#007BFF", dot: "#007BFF" },
  "None":          { label: "None",         text: "#5F6A88", dot: "#E2E7F2" },
};
```

## Implementation Steps

1. `_pm-shared.tsx`: add `Issue` type alias (`Database["public"]["Tables"]["issues"]["Row"]`), `SEVERITY_OPTS`, `normalizeSeverity`, `SEVERITY_STYLE`, `SeverityBadge`.
2. `page.tsx`: add an `issuesRes` query to the existing `Promise.all` (`.from("issues").select("*").eq("project_id", project.id).order("created_at", { ascending: false })`), pass `initialIssues={issuesRes.data ?? []}` to `ProjectDetail`.
3. New API routes: `src/app/api/v2/projects/[projectId]/issues/route.ts` (GET/POST) and `src/app/api/v2/issues/[issueId]/route.ts` (PATCH/DELETE) — mirror the Tasks equivalents' auth/validation shape (`supabase.auth.getUser()` unauthorized guard, `VALID_STATUS`/`SEVERITY_OPTS` whitelist checks, `.select().single()` return).
4. Build `_issue-list-view.tsx`, `_issue-board-view.tsx`, `_issue-calendar-view.tsx` as adapted copies of the Tasks equivalents per the Requirements/Out-of-Scope constraints above (flat list, cross-column-only board drag, due-date-keyed calendar).
5. Build `IssueAssigneePicker` (single-select member picker + Unassign, inline in `_issue-list-view.tsx` since it's list-row-scoped like `AssigneePicker`) and `EditIssueModal`/`CreateIssueModal` (mirror `CreateTaskModal`'s structure in `_project-detail.tsx`, adapted fields).
6. `_project-detail.tsx`: add issues state/realtime/mutations, generalize `SortSelect`, add `ISSUE_SORT_OPTIONS` + Severity `FilterMultiSelect`, make the header "+ New Task"/"+ New Issue" button and its handler tab-aware, replace the "Issues coming soon." block with the toolbar + view-switched Issue{List,Board,Calendar}View, mount `CreateIssueModal`/`EditIssueModal`.
7. `npx tsc --noEmit` and manual browser walkthrough (see Verification).

## Acceptance Criteria

- [ ] Issues tab on `/v2/projects/[projectId]` renders a toolbar (search, Status filter, Severity filter, Sort, List/Board/Calendar toggle) matching the Tasks tab's visual style.
- [ ] List view shows all of a project's issues in a flat table with working search/filter/sort; empty and filtered-empty states render correctly.
- [ ] Board view groups issues into the same 8 status columns as Tasks; dragging a card to another column persists the new status (verify via reload).
- [ ] Calendar view places issues on their `due_date`; issues without a due date are excluded from the grid and counted in an "N issues without a due date" note.
- [ ] Clicking a row/card opens an edit modal; editing status/severity/assignee/due date/title/description and saving persists (verify via reload); Delete removes the issue.
- [ ] Header CTA reads "+ New Task" on Tasks tab, "+ New Issue" on Issues tab; "+ New Issue" opens a creation modal that POSTs successfully and the new issue appears without a manual refresh.
- [ ] A second browser tab reflects a status change made in the first within a few seconds (realtime channel working).
- [ ] Switching to the Issues tab as a `developer`-role user: dropdowns/drag still render, but an edit attempt reverts (403 from `issues_pm_write` RLS) without crashing the UI.
- [ ] Tasks tab is visually and functionally unchanged (`_list-view.tsx`, `_board-view.tsx`, `_calendar-view.tsx` untouched; `SortSelect` generalization doesn't change Tasks-tab sort behavior).

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manually walk through Issues tab: search/filter/sort, List/Board/Calendar switch,
           # drag a board card between columns, edit+delete via modal, create a new issue,
           # confirm Tasks tab still works unchanged
```

## Compatibility Touchpoints

- No DB migration — `issues` table and its `Database` type already exist and are unchanged by this task.
- No change to Zoho import/export routes (`zoho-import/issues`, `zoho-export/issues`) or RLS policies.
- `_docs/mcp-tools.md` not affected — no new `server.registerTool(...)` calls.

## Implementation Notes

### What Changed
- Built the Issues tab per the plan: `Issue` type/severity helpers in `_pm-shared.tsx`; `IssueListView`/`IssueBoardView`/`IssueCalendarView`; `GET/POST /api/v2/projects/[projectId]/issues` and `PATCH/DELETE /api/v2/issues/[issueId]`; wired into `_project-detail.tsx` (state, realtime channel, mutations, tab-aware toolbar/CTA, create/edit modals).
- **Deviation, discovered during browser verification**: `CreateTaskModal` and `MilestonePanel`'s existing (pre-192, unmodified) POST call sites pass `projectId={project.id}` (UUID) to routes that do `.eq("project_id", projectId)` (expects the `project_id` slug) — a pre-existing bug that makes Task and Milestone creation fail with "Project not found" on every project. Confirmed via live UI test (not something this task introduced). Left `CreateTaskModal`/`MilestonePanel` untouched per the task doc's "Tasks tab must remain unchanged" boundary, but fixed the equivalent `CreateIssueModal` call site (`projectId={project.project_id ?? project.id}`) so the new Issues feature actually works. Flagging here for a follow-up task to fix Task/Milestone creation.
- **User-directed scope addition (mid-implementation, after initial browser testing)**: user asked for (1) bulk-select checkboxes on the Issues list matching Tasks, (2) the bulk-action bar's "Trash" text button changed to an icon + Tooltip — applied to **both** Tasks' and Issues' list views for consistency, and (3) sticky column headers on both list views, which were not actually sticky before (their `sticky` class was inside a parent with `overflow-hidden`, which creates its own clip/scroll-container box and defeats `position: sticky` against the real scrolling ancestor). Fixed by moving `overflow-hidden` off the outer rounded card onto a new inner wrapper around just the rows, with `rounded-t-[14px]`/`rounded-b-[14px]` applied directly to the header and rows wrapper respectively. This required touching `_list-view.tsx` (Tasks), which the original doc marked out-of-scope — permitted here since the user explicitly instructed it in chat, which overrides the doc's boundary.
- Issues' bulk Trash is wired to actually delete (`bulkDeleteIssues`, tracks partial per-id failure) since `deleteIssue`/edit-delete already existed; Tasks' bulk Trash button remains visually-present-but-unwired, matching its pre-existing (out of scope) behavior — only reskinned to icon+tooltip.

### Files Changed
- `src/app/v2/(hub)/projects/_pm-shared.tsx` — `Issue` type, `SEVERITY_OPTS`/`SEVERITY_STYLE`/`normalizeSeverity`.
- `src/app/v2/(hub)/projects/[projectId]/page.tsx` — `issuesRes` query + `initialIssues` prop.
- `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` — Issues state/realtime/mutations (incl. `bulkDeleteIssues`), tab-aware header CTA, Issues toolbar + view switch, `CreateIssueModal`/`EditIssueModal`, generalized `SortSelect`.
- `src/app/v2/(hub)/projects/[projectId]/_issue-list-view.tsx` (new) — flat list view, bulk-select checkboxes, sticky header.
- `src/app/v2/(hub)/projects/[projectId]/_issue-board-view.tsx` (new) — board view, cross-column drag only.
- `src/app/v2/(hub)/projects/[projectId]/_issue-calendar-view.tsx` (new) — calendar view.
- `src/app/api/v2/projects/[projectId]/issues/route.ts` (new), `src/app/api/v2/issues/[issueId]/route.ts` (new).
- `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` — Trash icon+Tooltip (was text label), sticky-header structural fix. **Out-of-doc-scope, user-directed** (see above).

### Deviations From Plan
- See "What Changed" — the `CreateIssueModal` `projectId` fix, and the user-directed checkbox/icon-tooltip/sticky-header additions (the latter touching `_list-view.tsx`).

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (0 errors, 0 warnings after removing one unused import)
- Manual browser walkthrough (`/v2/projects/7149F820-PROJ-01`, real imported Zoho issues) — PASS: search/status/severity filters, sort, List/Board/Calendar views with real data, create issue, edit issue (title/description/status/severity/assignee/due date persisted, verified via reload), delete issue, tab-aware "+ New Task"/"+ New Issue" CTA, bulk-select checkboxes + bulk delete on both tabs, Trash icon+Tooltip on both tabs, sticky headers on both tabs confirmed while scrolled. Board drag-and-drop not exercised interactively (dnd-kit pointer simulation out of reach of the browser-automation tool) but column grouping against real data (20 issues correctly bucketed into "Closed") and code review give confidence it works the same way Tasks' existing board (same dnd-kit APIs) does.

## Implementation Notes — Round 2 (sticky-header polish, same session)

User screenshots showed the "sticky" header was actually floating with a persistent gap above it (a sliver of the previously-scrolled row still visible through the gap) instead of sitting flush against the search/filter toolbar. Two follow-up fixes, both applied to `_list-view.tsx` (Tasks) and `_issue-list-view.tsx` (Issues) identically:

1. **Gap bug**: the scroll container used `px-8 py-5` (`py-5` = top+bottom padding). Padding-top on a *scrolling* container is part of that container's own scrollport padding box — a `position: sticky; top: 0` descendant can never rise above it, so the header stuck exactly `py-5`'s worth (20px) below the true top, leaving a permanent gap. Fixed by dropping the container to `px-8 pb-5` (no top padding) and moving the equivalent top spacing to `mt-5` (margin) on the card itself. Margin on a child of an `overflow` container isn't part of the scrollport's padding box, so it scrolls away completely — then the header sticks fully flush with no gap. (Confirmed margin doesn't collapse into the container here: `overflow-y-auto` on the parent suppresses parent/child margin collapsing per spec.)
2. **Rounded corners while stuck**: user asked for the header's top corners to square off (`rounded-t-none`) once actually pinned/flush, and restore `rounded-t-[14px]` once un-stuck (scrolled back to rest). CSS alone can't detect "is this sticky element currently stuck" (no stable `:stuck` pseudo-class), so added a lightweight `IntersectionObserver`-based `headerStuck` boolean in both list-view components: a zero-height sentinel `<div className="h-0" />` sits at the card's top edge, just before the header; `root: scrollContainerRef` observes it; when the sentinel scrolls out of the scroll container's view the header is stuck. Toggles `rounded-t-[14px]` ↔ `rounded-t-none` on the header's className accordingly. No shared hook extracted — duplicated identically in both files (~15 lines), matching this codebase's established preference for page-scoped duplication over premature abstraction for a 2-call-site utility.

### Files Changed (Round 2)
- `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` — `scrollRef`/sticky-sentinel/`headerStuck` state + effect; `py-5`→`pb-5` + `mt-5` on card; conditional `rounded-t-none`/`rounded-t-[14px]` on header.
- `src/app/v2/(hub)/projects/[projectId]/_issue-list-view.tsx` — same three changes, plus the `useEffect` import it was missing.

### Verification Run (Round 2)
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS
- Manual browser walkthrough on both tabs: confirmed no gap/peek-through once scrolled (header flush against toolbar), confirmed rounded top-left corner at rest and square corner once stuck, on both Tasks and Issues.
