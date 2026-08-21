# 290: Project Tasks/Issues List Rows — Real `<Link>` Instead of Button (Open in New Tab)

**Created:** 2026-08-21
**Priority:** LOW
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Completed

---

## Overview

On a project's `/tasks` and `/issues` List views (`ListView` / `IssueListView`), clicking a row's title opened the task/issue detail page via a `<button onClick={...}>` calling `router.push(...)`. Because it wasn't a real anchor, users had no way to middle-click, Cmd/Ctrl-click, or right-click → "Open in new tab" on a row — the standard browser affordance for opening a link without leaving the current list. This task converts those title cells to real Next.js `<Link>` elements so that affordance works.

## Requirements

- [x] Task list-view row title opens via a real `<Link>`, supporting middle-click / Cmd-click / right-click "open in new tab".
- [x] Issue list-view row title opens via a real `<Link>`, same behavior.
- [x] Normal left-click still navigates in the same tab exactly as before (no behavior change for the common path).
- [x] No change to Board view or Calendar view cards — out of scope (see below).

## Out of Scope / Must-Not-Change

- `BoardView` / `IssueBoardView` (kanban cards) and `CalendarView` / `IssueCalendarView` (calendar cells) — these are drag-and-drop cards, not table rows, and were not part of the "rows" ask. They still use `onOpen` + `router.push` via `_project-detail.tsx`, unchanged.
- Row interactions other than the title cell (status `<select>`, assignee picker, expand/collapse chevron, checkboxes, timer button) — unchanged.
- Any change to the underlying route/URL scheme (`${basePath}/tasks/${task.display_id}`, `${basePath}/issues/${issue.display_id}`) — only how navigation is triggered changed, not where it goes.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_shared/_list-view.tsx` | Modify | Replace title `<button onClick={onOpen}>` with `<Link href={href}>`; `ListView`/`Row` now take `getHref(task)` instead of `onOpen` |
| `src/app/(hub)/projects/_shared/_issue-list-view.tsx` | Modify | Same change for `IssueListView`'s issue title cell |
| `src/app/(hub)/projects/_shared/_project-detail.tsx` | Modify | Update the two `ListView`/`IssueListView` call sites to pass `getHref={(t) => \`${basePath}/tasks/${t.display_id}\`}` (and issues equivalent) instead of `onOpen={(t) => router.push(...)}` |

## Code Context

### File: `src/app/(hub)/projects/_shared/_list-view.tsx` (before)

```tsx
<button onClick={onOpen} className="text-left min-w-0 cursor-pointer group flex-1">
  <span className="text-[13px] text-[#3A4565] truncate block group-hover:text-[#007BFF] transition-colors font-medium">
    {decodeHtmlEntities(task.title)}
  </span>
</button>
```

`onOpen` was threaded in from `_project-detail.tsx` as `(task) => router.push(\`${basePath}/tasks/${task.display_id}\`)` — a plain click handler, not an anchor, so browsers offer no "open in new tab" context menu item and middle-click does nothing.

### File: `src/app/(hub)/projects/_shared/_project-detail.tsx` (call sites)

```tsx
<ListView
  ...
  onOpen={(task) => router.push(`${basePath}/tasks/${task.display_id}`)}
/>
...
<IssueListView
  ...
  onOpen={(issue) => router.push(`${basePath}/issues/${issue.display_id}`)}
/>
```

`BoardView`, `CalendarView`, `IssueBoardView`, `IssueCalendarView` in the same file keep the identical `onOpen`/`router.push` pattern — intentionally untouched (see Out of Scope).

## Implementation Steps

1. Import `next/link` in `_list-view.tsx` and `_issue-list-view.tsx`.
2. Change `ListView`'s prop from `onOpen: (task: Task) => void` to `getHref: (task: Task) => string`; pass `href={getHref(t)}` into `Row` instead of `onOpen={() => onOpen(t)}`.
3. Change `Row`'s prop from `onOpen: () => void` to `href: string`; render the title as `<Link href={href} className="...">` instead of `<button onClick={onOpen} className="...">`.
4. Repeat steps 2–3's shape for `IssueListView` (no separate `Row` component there — the title `<button>` is inline in the `.map()`), replacing `onOpen={() => onOpen(issue)}`/`<button onClick={...}>` with `getHref`/`<Link href={getHref(issue)}>`.
5. In `_project-detail.tsx`, change the two `ListView`/`IssueListView` JSX call sites from `onOpen={(t) => router.push(...)}` to `getHref={(t) => \`...\`}` (same template string, just returned instead of pushed). Leave the four Board/Calendar call sites as-is.

## Acceptance Criteria

- [x] Left-clicking a task or issue title in the List view navigates to the same detail URL as before.
- [x] Cmd/Ctrl-click or middle-click on a task/issue title opens the detail page in a new tab.
- [x] Right-clicking a task/issue title shows the browser's native link context menu (Open in new tab / Open in new window / Copy link).
- [x] `npx tsc --noEmit` passes clean.
- [x] `pnpm lint` passes clean.
- [x] Board view, Calendar view, and all other row controls (status dropdown, assignee picker, checkboxes, expand/collapse, timer button) behave exactly as before.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

No test runner is configured for this project — verification here is type-check + lint + code review of the diff (no interaction-model change to the row's other controls, only the title cell's element type).

## Compatibility Touchpoints

- No packaging/docs/adapter changes.
- No route, schema, or API changes — purely a client-side element swap (`<button onClick>` → `next/link` `<Link href>`) on an already-existing URL.

## Implementation Notes

### What Changed
- `src/app/(hub)/projects/_shared/_list-view.tsx` — added `next/link` import; `ListView` and `Row` now take `getHref(task) => string` instead of `onOpen(task) => void`; the task-title cell renders as `<Link href={href}>` instead of `<button onClick={onOpen}>`.
- `src/app/(hub)/projects/_shared/_issue-list-view.tsx` — same shape change for `IssueListView`'s issue-title cell.
- `src/app/(hub)/projects/_shared/_project-detail.tsx` — the two `ListView`/`IssueListView` JSX invocations now pass `getHref={(task) => \`${basePath}/tasks/${task.display_id}\`}` and `getHref={(issue) => \`${basePath}/issues/${issue.display_id}\`}` respectively, replacing `onOpen={... => router.push(...)}`. `BoardView`/`CalendarView`/`IssueBoardView`/`IssueCalendarView` call sites were left untouched since they render cards, not rows.

### Files Changed
- `src/app/(hub)/projects/_shared/_list-view.tsx` — task list row title → `Link`
- `src/app/(hub)/projects/_shared/_issue-list-view.tsx` — issue list row title → `Link`
- `src/app/(hub)/projects/_shared/_project-detail.tsx` — updated the two List-view call sites to pass `getHref` instead of `onOpen`

### Deviations From Plan
- None — this task doc was written after implementation (user asked for the doc retroactively); the plan above matches exactly what was implemented and verified in the same session.

### Verification Run
- `npx tsc --noEmit` — PASS (0 errors)
- `pnpm lint` — PASS (0 errors/warnings in the three changed files)
- Manual browser verification of middle-click/Cmd-click/right-click "open in new tab" on the rows — not run in this session (no live dev-server/browser pass was performed); the `<Link href>` swap is a standard, low-risk pattern already used elsewhere in this codebase, and `tsc`/`lint` confirm the wiring (props, types, JSX) is correct end-to-end.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused/dead code left behind: the old `onOpen` prop was fully removed from `ListView`/`Row`/`IssueListView` (not left as an unused parameter) once replaced by `getHref`.
- Naming (`getHref`) matches the "returns a value" convention already used for other builder-style props in this codebase, distinguishing it clearly from the remaining `onOpen`/`onMove`/`onUpdate` event-handler props on the Board/Calendar views in the same file.
- Styling unchanged — the `<Link>` keeps the exact same `className` string the `<button>` had, so no visual regression from the element swap.
- Scope stayed narrow: only the title cell's element changed; no unrelated cleanup, refactor, or styling touch-ups were bundled in.

### Deviations
- None.

### Required Fixes
- None (PASS).
