# 346: Assignee / User Filter on Tasks & Issues Listings (with "(You)" for the current user)

**Created:** 2026-09-01
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

The project **Tasks** and **Issues** tabs currently filter by Status, Priority/Severity, and
free-text search only. There is no way to narrow the list to a specific person's work.

Add an **Assignee** multi-select filter to both toolbars in
`src/app/(hub)/projects/_shared/_project-detail.tsx` (the single shared component behind
`/projects/legacy/[projectId]` and `/projects/v2/[projectId]`). The filter's options are the
project members; the option for the **currently logged-in user** is labelled with a trailing
**" (You)"** and sorted to the top.

Because `filteredTasks` / `filteredIssues` already feed all three views (List, Board, Calendar),
wiring the new filter into those memos makes it apply consistently across every view with no
per-view change.

## Requirements

- [ ] Tasks toolbar gains an **Assignee** `FilterMultiSelect` (same control already used for
      Status/Priority), placed after the Priority filter and before the Sort select.
- [ ] Issues toolbar gains an **Assignee** `FilterMultiSelect`, placed after the Severity filter
      and before the Sort select.
- [ ] Options are built from `allMembers` (`{ id, full_name, avatar_url, role }[]`), ordered with
      the current user first, then the rest by `full_name` (A–Z).
- [ ] The current user's option label is `"<full_name> (You)"`. If the current user is not present
      in `allMembers`, still inject their option using `profilesById[currentUserId]?.full_name`
      (fallback label `"You"`).
- [ ] Options include a leading **"Unassigned"** entry (sentinel value) so tasks/issues with no
      assignee remain visible under the default "all selected" state and can be isolated.
- [ ] Default state = every option selected (no-op), matching the Status/Priority filters.
- [ ] A Task matches when **any** id in `task.assignees` is in the selected set, OR when
      "Unassigned" is selected and `task.assignees` is null/empty. Matching is evaluated on the
      **root task** only (same rule the existing status/priority filter uses — whole subtree
      follows a matching root).
- [ ] An Issue matches when its resolved assignee id (`issue.assignee_id`, else the member whose
      `full_name === issue.assignee_name`) is in the selected set, OR when "Unassigned" is
      selected and the issue has neither `assignee_id` nor `assignee_name`.
- [ ] When **all** options are selected the assignee filter short-circuits (no filtering) — this
      also prevents tasks/issues assigned to someone no longer in the member pool from being
      hidden by default.
- [ ] `hasActiveFilters` / `hasActiveIssueFilters` become true when the assignee filter is
      narrowed; **Clear filters** resets it to all-selected along with the others.
- [ ] The existing "No tasks/issues match your filters" empty state already keys off
      `hasActiveFilters` — verify it still shows correctly, no new empty state needed.
- [ ] `_project-detail.tsx` does not grow meaningfully: extract the co-located filter/sort
      presentational components into their own file (see Proposed File Changes) so the net line
      count stays flat, per `nextjs-file-length-best-practices.md`.
- [ ] `npx tsc --noEmit` and `pnpm lint` clean.

## Out of Scope / Must-Not-Change

- **`src/app/(hub)/projects-old/[projectId]/_project-detail.tsx`** — the deprecated pre-split
  copy. Not routed by the live `/projects/legacy` or `/projects/v2` paths. Do not touch.
- No change to the row-level assignee pickers (`AssigneePicker` in `_list-view.tsx`,
  `IssueAssigneePicker` in `_issue-list-view.tsx`) or to any assignment write path / API route.
- No new dependencies. Reuse the existing `FilterMultiSelect` control — do **not** introduce a
  combobox / command-palette component or a new forms/toast library (see CLAUDE.md "Rejected /
  superseded").
- No URL/query-param persistence of the filter (the current Status/Priority filters are
  in-memory only — match that; a persisted-filter feature is a separate decision).
- Do not add avatars inside the filter dropdown rows — `FilterMultiSelect` is a text +
  checkbox control; keep it consistent with Status/Priority.
- No server-side filtering / no change to `_get-project-detail-data.ts` — all filtering stays
  client-side on the already-loaded arrays.
- Styling: Tailwind utility classes only, reuse the existing toolbar classes. No `style={{}}`.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_shared/_list-toolbar-controls.tsx` | Create | Move `FilterOption` type + `FilterCheckRow`, `FilterMultiSelect`, `SortSelect` out of `_project-detail.tsx` verbatim (they are generic presentational components; ~125 lines). Re-import into `_project-detail.tsx`. |
| `src/app/(hub)/projects/_shared/_assignee-filter.ts` | Create | Pure helpers: `UNASSIGNED_VALUE` constant, `buildAssigneeFilterOptions(allMembers, currentUserId, profilesById)`, `taskMatchesAssigneeFilter(task, selectedSet, allSelected)`, `issueMatchesAssigneeFilter(issue, membersById, selectedSet, allSelected)`. One concern per file, unit-testable. |
| `src/app/(hub)/projects/_shared/_project-detail.tsx` | Modify | Import the two new modules. Add `assigneeFilter` / `issueAssigneeFilter` state (default = all option values). Wire into `filteredTasks` / `filteredIssues` memos, `hasActiveFilters` / `hasActiveIssueFilters`, `clearFilters` / `clearIssueFilters`. Render `<FilterMultiSelect label="Assignee" … />` in both toolbars. |
| `_docs/task/346-tasks-issues-assignee-user-filter.md` / `TASKS.md` | Create / Modify | This document + tracker row. |

## Code Context

### `_project-detail.tsx` — current toolbar state & filter memos

```tsx
// Task toolbar state (line ~155)
const [taskSearch, setTaskSearch] = useState("");
const [statusFilter, setStatusFilter] = useState<string[]>(() => STATUS_OPTS.map((s) => s as string));
const [priorityFilter, setPriorityFilter] = useState<string[]>(() => PRIORITY_OPTS.map((p) => p as string));

// Issue toolbar state (line ~163)
const [issueStatusFilter, setIssueStatusFilter] = useState<string[]>(() => STATUS_OPTS.map((s) => s as string));
const [severityFilter, setSeverityFilter] = useState<string[]>(() => SEVERITY_OPTS.map((s) => s as string));

// filteredTasks (line ~319) — rootMatches gates on statusSet / prioritySet, then search.
//   Add: `&& assigneeMatch(t)` inside rootMatches.
// hasActiveFilters (line ~354): add `|| assigneeFilter.length < assigneeOptions.length`
// clearFilters (line ~359): add `setAssigneeFilter(assigneeOptions.map(o => o.value))`

// filteredIssues (line ~382) — .filter() on statusSet / severitySet, then search.
//   Add: assignee predicate.
// hasActiveIssueFilters (line ~394) / clearIssueFilters (line ~399): mirror the task side.
```

### `_project-detail.tsx` — toolbar JSX to mirror

```tsx
// Tasks (line ~465)
<FilterMultiSelect label="Status" options={STATUS_FILTER_OPTIONS} selected={statusFilter} onChange={setStatusFilter} />
<FilterMultiSelect label="Priority" options={PRIORITY_FILTER_OPTIONS} selected={priorityFilter} onChange={setPriorityFilter} />
{/* NEW: <FilterMultiSelect label="Assignee" options={assigneeOptions} selected={assigneeFilter} onChange={setAssigneeFilter} /> */}
<SortSelect value={sortValue} onChange={handleSortChange} options={SORT_OPTIONS} />

// Issues (line ~581)
<FilterMultiSelect label="Status" options={STATUS_FILTER_OPTIONS} selected={issueStatusFilter} onChange={setIssueStatusFilter} />
<FilterMultiSelect label="Severity" options={SEVERITY_FILTER_OPTIONS} selected={severityFilter} onChange={setSeverityFilter} />
{/* NEW: <FilterMultiSelect label="Assignee" options={assigneeOptions} selected={issueAssigneeFilter} onChange={setIssueAssigneeFilter} /> */}
<SortSelect value={issueSortValue} onChange={handleIssueSortChange} options={ISSUE_SORT_OPTIONS} />
```

### Types

- `Task = Database["public"]["Tables"]["tasks"]["Row"]` — `assignees: string[] | null` (profile ids).
- `Issue = Database["public"]["Tables"]["issues"]["Row"]` — `assignee_id: string | null`
  (FK → `profiles.id`, source of truth since migration 100) and `assignee_name: string | null`
  (legacy Zoho free-text; resolve via `allMembers.find(m => m.full_name === issue.assignee_name)`).
- `allMembers` prop: `{ id: string; full_name: string | null; avatar_url: string | null; role: string }[]`.
- `profilesById` prop: `Record<string, { full_name: string; avatar_url: string | null }>`.

### `buildAssigneeFilterOptions` — shape

```ts
export const UNASSIGNED_VALUE = "__unassigned__";

export function buildAssigneeFilterOptions(
  allMembers: { id: string; full_name: string | null }[],
  currentUserId: string,
  profilesById: Record<string, { full_name: string }>,
): { value: string; label: string }[] {
  const seen = new Set(allMembers.map((m) => m.id));
  const members = [...allMembers];
  if (!seen.has(currentUserId)) {
    members.push({ id: currentUserId, full_name: profilesById[currentUserId]?.full_name ?? "You" });
  }
  members.sort((a, b) => {
    if (a.id === currentUserId) return -1;
    if (b.id === currentUserId) return 1;
    return (a.full_name ?? "").localeCompare(b.full_name ?? "");
  });
  return [
    { value: UNASSIGNED_VALUE, label: "Unassigned" },
    ...members.map((m) => ({
      value: m.id,
      label: m.id === currentUserId ? `${m.full_name ?? "You"} (You)` : (m.full_name ?? "Unknown"),
    })),
  ];
}
```

### Existing `FilterMultiSelect` (moving to `_list-toolbar-controls.tsx`)

Portal-based dropdown, `options: { value; label }[]`, `selected: string[]`, `onChange`.
Header shows `All` / `None` / `<label>` / `N selected`. Trigger highlights blue when `!allChecked`.
No code change needed — pure relocation.

## Implementation Steps

1. **Create `_shared/_list-toolbar-controls.tsx`.** Cut `FilterOption` type, `FilterCheckRow`,
   `FilterMultiSelect`, `SortSelect` from the bottom of `_project-detail.tsx` (lines ~770–895),
   paste verbatim, add `"use client";` + the `useState/useEffect/useRef`, `createPortal`, `cn`,
   `ChevronDown/ArrowUpDown/Check` imports they use. Export all three components.
2. **`_project-detail.tsx`:** remove the moved code; add
   `import { FilterMultiSelect, SortSelect } from "./_list-toolbar-controls";`. Drop now-unused
   lucide imports if they are no longer referenced elsewhere in the file (verify `Check`,
   `ArrowUpDown`, `ChevronDown`, `ChevronsUpDown` usage before removing — `ChevronsUpDown` is
   still used by Collapse-all).
3. **Create `_shared/_assignee-filter.ts`** with `UNASSIGNED_VALUE`,
   `buildAssigneeFilterOptions`, `taskMatchesAssigneeFilter(task, selectedSet, allSelected)`,
   `issueMatchesAssigneeFilter(issue, membersById, selectedSet, allSelected)`:
   - `taskMatchesAssigneeFilter`: `if (allSelected) return true;` then
     `const a = task.assignees ?? []; if (a.length === 0) return selectedSet.has(UNASSIGNED_VALUE);
      return a.some((id) => selectedSet.has(id));`
   - `issueMatchesAssigneeFilter`: `if (allSelected) return true;`
     resolve `id = issue.assignee_id ?? membersById-by-name lookup`; if no id and no
     `assignee_name` → `return selectedSet.has(UNASSIGNED_VALUE)`; else `return id != null &&
     selectedSet.has(id)` (an unresolvable legacy name → treat as non-match when filtered).
4. **`_project-detail.tsx` wiring:**
   - `const assigneeOptions = useMemo(() => buildAssigneeFilterOptions(allMembers, currentUserId, profilesById), [allMembers, currentUserId, profilesById]);`
   - `const [assigneeFilter, setAssigneeFilter] = useState<string[]>(() => assigneeOptions.map(o => o.value));`
     and `issueAssigneeFilter` likewise. (Initialise from `assigneeOptions` — it is stable for
     the lifetime of the page since `allMembers` is a prop.)
   - `membersById` map for issue name→id resolution: `useMemo` over `allMembers`.
   - In `filteredTasks`: compute `const assigneeAllSelected = assigneeFilter.length === assigneeOptions.length;`
     and `const assigneeSet = new Set(assigneeFilter);`, then add
     `if (!taskMatchesAssigneeFilter(t, assigneeSet, assigneeAllSelected)) return false;` to `rootMatches`.
     Add `assigneeFilter` (+ `assigneeOptions.length`) to the dep array.
   - In `filteredIssues`: same, using `issueMatchesAssigneeFilter`.
   - `hasActiveFilters` / `hasActiveIssueFilters`: `|| assigneeFilter.length < assigneeOptions.length`.
   - `clearFilters` / `clearIssueFilters`: reset the assignee arrays to `assigneeOptions.map(o => o.value)`.
5. **Render** `<FilterMultiSelect label="Assignee" … />` in both toolbars at the positions noted above.
6. `npx tsc --noEmit`, `pnpm lint`.
7. Browser acceptance (see Verification).

## Acceptance Criteria

- [ ] Tasks tab: **Assignee** filter appears in the toolbar; opening it lists "Unassigned" +
      every project member; the logged-in user is first and reads "<name> (You)".
- [ ] Selecting only "(You)" narrows the list (List, Board, and Calendar views) to tasks where
      `assignees` includes the current user; "Clear filters" restores the full list.
- [ ] Selecting only "Unassigned" shows only tasks with no assignee.
- [ ] Issues tab: same behaviour; "(You)" narrows to issues assigned to the current user via
      `assignee_id` **or** a legacy `assignee_name` that matches their profile name.
- [ ] With all assignee options selected, results are identical to before this change (including
      tasks/issues assigned to a non-member).
- [ ] Narrowing the assignee filter flips the toolbar's "Clear filters" button visible and the
      list's "No … match your filters" empty state shows when nothing matches.
- [ ] `_project-detail.tsx` line count is within ~30 lines of its pre-change size (control
      components extracted).
- [ ] `npx tsc --noEmit` clean; `pnpm lint` clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then browser acceptance
```

Browser (dev server, logged in):
1. Open a project with several tasks/issues across multiple assignees —
   `/projects/v2/<projectId>` → **Tasks**.
2. Toolbar → **Assignee** → confirm "(You)" is first, "Unassigned" present.
3. Select only "(You)" → list shrinks to your tasks; switch to **Board** and **Calendar** →
   same subset. **Clear filters** → full list back.
4. Select only "Unassigned" → only unassigned tasks.
5. Repeat 2–4 on the **Issues** tab; include an issue that has a legacy `assignee_name` (no
   `assignee_id`) matching your name → it is included under "(You)".
6. Repeat on `/projects/legacy/<projectId>` for one project to confirm the shared component
   behaves identically on both routes.

## Compatibility Touchpoints

- No API, schema, or migration changes — purely client-side filtering on already-loaded data.
- No package / install-surface changes. No `_docs/mcp-tools.md` impact (no `registerTool`).
- Shared component: the change lands once in `_shared/` and applies to both `/projects/legacy`
  and `/projects/v2`. `projects-old` is untouched and already deprecated.
- New files are `_`-prefixed private modules under `_shared/`, consistent with the existing
  colocation convention.

## Implementation Notes

### What Changed

- **Tasks and Issues toolbars each gained an "Assignee" `FilterMultiSelect`** in
  `_shared/_project-detail.tsx`, placed between the Status/Priority (resp. Severity) filter and
  the Sort select. Options: a leading **"Unassigned"**, then the current user first labelled
  `"<name> (You)"`, then the other project members A–Z. The current user is injected even when
  absent from `allMembers` (name from `profilesById`, fallback `"You"`).
- **Filtering is wired into the `filteredTasks` / `filteredIssues` memos**, so List, Board, and
  Calendar views all honour it (same as the existing Status/Priority filters). Tasks match when
  any id in `task.assignees` is selected, or "Unassigned" is selected and `assignees` is
  empty/null — evaluated on the root task, whole subtree follows. Issues resolve
  `assignee_id` first, then a normalized `assignee_name` → member lookup; unresolvable legacy
  names are excluded while the filter is narrowed.
- **"All options selected" short-circuits** (`taskMatchesAssigneeFilter` / `issueMatchesAssigneeFilter`
  return `true` immediately) so the default state never hides work assigned to someone no
  longer in the member pool.
- `hasActiveFilters` / `hasActiveIssueFilters` and `clearFilters` / `clearIssueFilters` updated
  to include the assignee filter. The existing "No … match your filters" empty state keys off
  those flags — no new empty state.
- **File-length compliance:** extracted `FilterCheckRow` / `FilterMultiSelect` / `SortSelect`
  (and the `FilterOption` type) **verbatim** into new `_shared/_list-toolbar-controls.tsx`, and
  the pure filter helpers into new `_shared/_assignee-filter.ts`. `_project-detail.tsx` went
  from **900 → 798 lines** (net −102) despite the new feature. Removed now-unused imports from
  `_project-detail.tsx`: `useRef`, `createPortal`, and the `Check` / `ChevronDown` / `ArrowUpDown`
  lucide icons.

### Files Changed

- `src/app/(hub)/projects/_shared/_list-toolbar-controls.tsx` — **new.** `FilterMultiSelect`,
  `SortSelect`, `FilterOption` moved here verbatim (client component; owns the `createPortal` /
  `useRef` / icon imports they need).
- `src/app/(hub)/projects/_shared/_assignee-filter.ts` — **new.** `UNASSIGNED_VALUE`,
  `buildAssigneeFilterOptions()`, `buildMemberIdByName()`, `taskMatchesAssigneeFilter()`,
  `issueMatchesAssigneeFilter()` — pure, no React.
- `src/app/(hub)/projects/_shared/_project-detail.tsx` — imports the two new modules; adds
  `assigneeOptions` / `memberIdByName` memos + `assigneeFilter` / `issueAssigneeFilter` state;
  wires both `filtered*` memos, `hasActive*Filters`, `clear*Filters`; renders the two new
  `FilterMultiSelect`s; drops the extracted component definitions and now-unused imports.

### Deviations From Plan

- Added a `buildMemberIdByName()` helper to `_assignee-filter.ts` (the plan sketched the map
  inline in `_project-detail.tsx`). Keeping name-normalization next to the matcher that
  consumes it is cleaner and keeps `_project-detail.tsx` smaller. No behavioural difference.
- No other deviations. `projects-old/` untouched as specified.

### Verification Run

- `npx tsc --noEmit` — PASS (exit 0, no output)
- `pnpm lint` — PASS (0 errors; 2 pre-existing warnings in
  `onboarding-workspace/_checklist-tab.tsx`, unrelated — same as task 345)
- `impeccable` design hook — `design-system-font-size` warnings fired on both files: in
  `_list-toolbar-controls.tsx` they are on the **verbatim-relocated** `text-[12px]` etc.; in
  `_project-detail.tsx` they are pre-existing `text-[Npx]` literals in untouched surrounding
  code that only shifted line numbers. All match this codebase's shipped convention (CLAUDE.md
  "UI Polish Conventions" — `isDark`/explicit `text-[Npx]` is the established pattern). Not
  introduced by this task; left unchanged.
- Browser acceptance — NOT RUN (handed to `test` stage; needs dev server + a project with
  multiple assignees on both `/projects/v2` and `/projects/legacy`).

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. Diff is tight: 1 modified file (+~35 net) and 2 new `_`-prefixed
  `_shared/` modules; `_project-detail.tsx` dropped 900 → 798 lines.
- `_list-toolbar-controls.tsx` is a **verbatim** relocation of `FilterCheckRow` /
  `FilterMultiSelect` / `SortSelect` — no logic change, just `export` + a `"use client"` header
  and the icon/`createPortal`/`useRef` imports moved with them. `FilterCheckRow` stays private.
- `_assignee-filter.ts` is pure, React-free, guard-clause style, one responsibility per
  function, no `any`, no dead code, no logging. Doc comments explain the non-obvious
  `allSelected` short-circuit and the legacy-name exclusion rule.
- `_project-detail.tsx` changes mirror the existing Status/Priority filter plumbing exactly
  (`new Set(...)` + predicate in the memo, `< options.length` for the active-flag, reset in
  `clear*Filters`). `memberIdByName` is a `useMemo([allMembers])` so the `filteredIssues` dep
  array stays stable.
- Removed imports (`useRef`, `createPortal`, `Check`, `ChevronDown`, `ArrowUpDown`) are all
  genuinely unused post-extraction — confirmed by clean `pnpm lint` (no `no-unused-vars`).
- Tailwind-class styling only; the one `style={{}}` (SortSelect chevron bg) is pre-existing,
  relocated untouched. Font-size `text-[Npx]` literals match the codebase's shipped convention.

### Deviations
- **Minor — `buildMemberIdByName()` helper added** (plan sketched the name→id map inline in
  `_project-detail.tsx`). Moves normalization next to its consumer and keeps the page file
  smaller. No behavioural difference.
- **Minor — `assigneeFilter` / `issueAssigneeFilter` initial state reads `assigneeOptions`**
  (a `useMemo` declared just above) in its lazy initializer; state is not re-synced if
  `allMembers` later changes. `allMembers` is a server prop, stable for the page lifetime — the
  plan called this out explicitly. Acceptable.
- **Minor — a narrowed filter excludes tasks/issues assigned to someone not in the option list**
  (ex-member). This only happens when the user has deliberately narrowed the filter (the
  default all-selected state short-circuits), and excluding non-listed assignees is the
  expected semantics of an explicit people filter. Consistent between the task and issue paths.
- No Medium or Major deviations. `projects-old/` untouched; no new deps; no API/schema change.

### Required Fixes
- None.
