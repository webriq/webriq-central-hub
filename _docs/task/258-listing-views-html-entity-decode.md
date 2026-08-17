# 258: Fix Unrendered HTML Entities (`&amp;` etc.) in Task/Issue/Milestone Listing Views

**Created:** 2026-08-17
**Priority:** MEDIUM
**Type:** bug
**Recommended Tier:** fast
**Status:** Testing

---

## Overview

On the project Tasks tab (and equivalently Issues), task titles imported from Zoho carry literal HTML-entity-encoded text — e.g. a title stored as the string `Fix ShipStation &amp; Test Orders Cleanup` instead of `Fix ShipStation & Test Orders Cleanup`. Zoho's export encoded `&` as `&amp;` and it was imported as-is rather than decoded. React does not decode entities in interpolated JSX text (`{task.title}` is inserted as a text node, not parsed as HTML), so every screen that prints a raw title/name literally shows `&amp;` to the user instead of `&`.

**This is not a new bug** — it's known-open leftover scope from task 194 (`_docs/task/194-task-issue-detail-design-system-v2-html-rendering.md`). That task's Requirement A called out exactly this class of defect and enumerated the listing/board/calendar/milestone-detail sites needing a fix, but its own doc was split: task 206 fixed `_task-detail.tsx`'s title only ("not part of this task, which is scoped to the detail page only" — see 206 line 90), and task 234 fixed `_issue-detail.tsx`'s title only. Neither touched the listing/board/calendar views or `_milestone-detail.tsx`, which 206's own notes flag as still open (line 199: "task 194's Requirement A (listing/board/calendar title-decoding) ... remain separately open work"). This task closes that gap.

The fix utility already exists and is proven in production: `decodeHtmlEntities()` in `src/app/(hub)/projects/_pm-shared.tsx:134` (regex-based, no `DOMParser`/`document` — safe for server-rendered client components). It's currently used only in `_task-detail.tsx`, `_issue-detail.tsx`, and `_issue-quick-access-panel.tsx`. This task is purely mechanical: wrap the remaining raw title/name interpolations in the same function. No new decoding logic needed.

### Additional sites found during research (beyond 194's original 7)

While locating every site that renders a raw Zoho-imported title/name as plain JSX text, three more instances of the identical bug were found, all sharing the same root cause and fix:
- Tasklist/group name headers in the Tasks list view (`g.name`) and the Milestones swimlane (`tl.name`)
- Milestone names (`m.name`) in the swimlane lane header, the milestone panel, and the milestone bar chip + its rename input's `defaultValue`
- Subtask titles (`s.title`) inside the task drawer's Subtasks list — these are real `tasks` rows via the same Zoho import pipeline, not UI-only labels

These are included since they're the same defect class, same one-line fix, and leaving them would mean "General" (a clean tasklist name) renders fine next to a nearby milestone or subtask that still shows `&amp;`.

## Requirements

- [ ] Every task/issue title, tasklist/group name, milestone name, and subtask title rendered as plain text in a listing, board, calendar, swimlane, or milestone-detail view is passed through `decodeHtmlEntities()` before display.
- [ ] Milestone bar's rename `<input defaultValue={m.name}>` (`_milestone-bar.tsx:85`) also decodes, so editing a milestone whose name still carries entities starts from clean text and the blur-save (`_milestone-bar.tsx:86`) organically writes the decoded name back to the DB — same self-healing pattern already established for task/issue titles in `_task-detail.tsx`/`_issue-detail.tsx`.
- [ ] No visual/layout change — this only affects the text content, not styling, of the affected spans.
- [ ] Sort comparators (`a.title.localeCompare(b.title)` if any exist in these files) are **not** touched — comparing encoded vs. decoded strings produces a materially identical order for the entities involved; changing it is unrelated churn (this mirrors task 194's own explicit exclusion, doc line 31).
- [ ] Task 194's row in `TASKS.md` is updated to note this task closes its remaining Requirement A scope (same pattern task 234 used for the issue-detail half — see 194 doc's own "Relationship" note, line 199).

## Out of Scope / Must Not Change

- `project.name` (project title elsewhere in the UI) — not part of the Zoho task/issue/tasklist/milestone import path this bug traces to; no evidence it carries encoded entities.
- Attachment `file.name` — actual filenames, not Zoho free-text fields.
- Comment content (`_task-comments.tsx`, `_issue-comments.tsx`) — comment bodies are stored/rendered as real HTML (`dangerouslySetInnerHTML`), so entities there already decode correctly at render time; not the same bug.
- Mention-picker labels (`m.title` in `_comment-editor.tsx`/`_issue-comment-editor.tsx`/`_task-description-editor.tsx`) — these are hardcoded UI menu labels, not Zoho data.
- `decodeHtmlEntities()` itself — already implemented and covers the needed named/numeric entities; no changes to `_pm-shared.tsx`'s existing function body.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/[projectId]/_list-view.tsx` | Modify | Import `decodeHtmlEntities`; wrap `task.title` (line 625) and `g.name` (line 515) |
| `src/app/(hub)/projects/[projectId]/_board-view.tsx` | Modify | Import `decodeHtmlEntities`; wrap `task.title` (line 205) |
| `src/app/(hub)/projects/[projectId]/_calendar-view.tsx` | Modify | Import `decodeHtmlEntities`; wrap `t.title` (line 124) |
| `src/app/(hub)/projects/[projectId]/_issue-list-view.tsx` | Modify | Import `decodeHtmlEntities`; wrap `issue.title` (line 354) |
| `src/app/(hub)/projects/[projectId]/_issue-board-view.tsx` | Modify | Import `decodeHtmlEntities`; wrap `issue.title` (line 156) |
| `src/app/(hub)/projects/[projectId]/_issue-calendar-view.tsx` | Modify | Import `decodeHtmlEntities`; wrap `issue.title` (line 110) |
| `src/app/(hub)/projects/[projectId]/milestones/[milestoneId]/_milestone-detail.tsx` | Modify | Import `decodeHtmlEntities`; wrap `t.title` (line 182) |
| `src/app/(hub)/projects/[projectId]/_task-drawer.tsx` | Modify | Import `decodeHtmlEntities`; wrap `s.title` (line 216, subtask row) |
| `src/app/(hub)/projects/[projectId]/_milestone-swimlane.tsx` | Modify | Import `decodeHtmlEntities`; wrap `m.name` (line 102) and `tl.name` (line 124) |
| `src/app/(hub)/projects/[projectId]/_milestone-panel.tsx` | Modify | Import `decodeHtmlEntities`; wrap `m.name` (line 196) |
| `src/app/(hub)/projects/[projectId]/_milestone-bar.tsx` | Modify | Import `decodeHtmlEntities`; wrap `m.name` (line 78, chip label) and `defaultValue={m.name}` (line 85, rename input) |
| `TASKS.md` | Modify | Add row for task 258; add a note on task 194's row that its Requirement A (listing/board/calendar/milestone-detail scope) is closed by 258 |

## Code Context

### `src/app/(hub)/projects/_pm-shared.tsx:126-144` — existing decode utility, already proven, do not modify
```ts
// ─── HTML entity decoding (Zoho-imported titles carry literal `&amp;` etc.) ─
// Regex-based, no DOMParser/document — this module is imported by components
// Next.js server-renders on first paint, so it must run with no DOM available.
const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  hellip: "…", mdash: "—", ndash: "–",
  lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
};
export function decodeHtmlEntities(input: string): string {
  return input.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1] === "x" || entity[1] === "X"
        ? parseInt(entity.slice(2), 16)
        : parseInt(entity.slice(1), 10);
      return Number.isNaN(code) ? match : String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[entity] ?? match;
  });
}
```

### Precedent usage — `src/app/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx:97`
```ts
const [title, setTitle] = useState(() => decodeHtmlEntities(task.title));
```
Same one-line wrap-on-read pattern applies to every site in this task — no state needed for the read-only listing views, just wrap the interpolation directly: `{decodeHtmlEntities(task.title)}`.

### `src/app/(hub)/projects/[projectId]/_milestone-bar.tsx:73-88` — chip + rename input, both need wrapping
```tsx
<button ...>
  {m.name}
  {dueLabel && <span className="opacity-70">· {dueLabel}</span>}
</button>
{isEditing && (
  <div ...>
    <input
      defaultValue={m.name}
      onBlur={(e) => { if (e.target.value.trim() && e.target.value !== m.name) patchMilestone(m.id, { name: e.target.value.trim() }); }}
      ...
```
The `onBlur` comparison (`e.target.value !== m.name`) stays against the **raw** `m.name` — only the two rendered values (`{m.name}` and `defaultValue`) get wrapped, so a no-op blur (user opens the field and blurs without typing) still correctly no-ops instead of firing a spurious PATCH because the decoded default no longer string-equals the raw `m.name`. Concretely: `defaultValue={decodeHtmlEntities(m.name)}`, chip label `{decodeHtmlEntities(m.name)}`, but leave the `onBlur` guard's `e.target.value !== m.name` as-is.

## Implementation Steps

1. In each of the 11 files listed in Proposed File Changes, add `decodeHtmlEntities` to the existing `from "../_pm-shared"` (or `"../../../_pm-shared"` for `_milestone-detail.tsx`) import.
2. Wrap each identified raw interpolation per the table above.
3. For `_milestone-bar.tsx`, wrap both the chip label and the rename input's `defaultValue`, but leave the `onBlur` change-detection comparison against the raw `m.name` (see Code Context note above) so an untouched field never fires a spurious PATCH.
4. Update `TASKS.md`: add the 258 row under the appropriate section, and append a short note to task 194's row indicating this task closes its remaining listing/board/calendar/milestone-detail scope (mirroring how 234's completion was cross-referenced against 194).

## Acceptance Criteria

- [ ] A task with `&amp;` in its title (e.g. "Fix ShipStation &amp; Test Orders Cleanup") displays as "Fix ShipStation & Test Orders Cleanup" in: Tasks list view, board view, calendar view, and the task drawer's subtask list (if used as a subtask).
- [ ] Same for an issue title across Issues list view, board view, and calendar view.
- [ ] A tasklist/group name with `&amp;` displays decoded in both the Tasks list view group header and the Milestones swimlane deliverable card.
- [ ] A milestone name with `&amp;` displays decoded in the swimlane lane header, the milestone panel, and the milestone bar chip — and opening its rename field shows decoded text, not `&amp;`.
- [ ] `_milestone-detail.tsx`'s task rows show decoded titles.
- [ ] No regression: renaming a milestone via the bar's inline input still only fires a PATCH when the user actually changes the value.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm dev
```
Then browser-check: navigate to a project with a task/tasklist/milestone whose name contains `&` (Zoho-imported data reliably has these — the "ShipStation & Test Orders Cleanup" task from the bug report is a known example), and confirm the decoded `&` renders (not `&amp;`) in every view listed in Acceptance Criteria.

## Implementation Notes

### What Changed
Wrapped every raw Zoho-imported title/name interpolation in the 11 target files with the existing `decodeHtmlEntities()` helper (`_pm-shared.tsx:134`, unmodified) — purely mechanical, no new logic. 24 total call sites across task titles, issue titles, tasklist/group names, milestone names, and subtask titles. `_milestone-bar.tsx`'s rename input got both the chip label and `defaultValue` wrapped, while its `onBlur` change-detection guard was deliberately left comparing against the raw `m.name` (per the task doc's Code Context note) so an untouched field never fires a spurious PATCH.

### Files Changed
- `src/app/(hub)/projects/[projectId]/_list-view.tsx` - wrapped `task.title` (task rows) and `g.name` (tasklist group headers)
- `src/app/(hub)/projects/[projectId]/_board-view.tsx` - wrapped `task.title` (board cards)
- `src/app/(hub)/projects/[projectId]/_calendar-view.tsx` - wrapped `t.title` (calendar cells)
- `src/app/(hub)/projects/[projectId]/_issue-list-view.tsx` - wrapped `issue.title` (issue rows)
- `src/app/(hub)/projects/[projectId]/_issue-board-view.tsx` - wrapped `issue.title` (board cards)
- `src/app/(hub)/projects/[projectId]/_issue-calendar-view.tsx` - wrapped `issue.title` (calendar cells)
- `src/app/(hub)/projects/[projectId]/milestones/[milestoneId]/_milestone-detail.tsx` - wrapped `t.title` (task rows within milestone detail)
- `src/app/(hub)/projects/[projectId]/_task-drawer.tsx` - wrapped `s.title` (subtask rows)
- `src/app/(hub)/projects/[projectId]/_milestone-swimlane.tsx` - wrapped `m.name` (lane header) and `tl.name` (deliverable card)
- `src/app/(hub)/projects/[projectId]/_milestone-panel.tsx` - wrapped `m.name` (table row link)
- `src/app/(hub)/projects/[projectId]/_milestone-bar.tsx` - wrapped `m.name` (chip label) and `defaultValue={m.name}` (rename input), left `onBlur` guard comparing against raw `m.name`
- `TASKS.md` - moved 258 through Planned → In Progress → Testing; added cross-reference note to task 194's row

### Deviations From Plan
- None. All 11 files and 24 call sites matched the task doc's Proposed File Changes exactly; line numbers were re-verified against the live files before editing (all matched the doc).

### Verification Run
- `npx tsc --noEmit` - PASS (no output, clean)
- Manual browser pass against a task/tasklist/milestone with `&` in its name - SKIPPED (deferred to `simplify`/`test` stage per implement skill's reading-rules scope; no dev server session started during this stage)

### Note on `impeccable` design-hook findings
The PostToolUse design hook flagged pre-existing `design-system-font-size`/`design-system-color`/`gray-on-color` findings on every file touched (arbitrary Tailwind values like `text-[12px]`, hex colors like `#BFDBFE`, etc.). All flagged line numbers are pre-existing code untouched by this task's edits — this task's changes were limited to import statements and wrapping existing interpolations in `decodeHtmlEntities()`, no styling changes. Left unchanged as out of scope per the task doc's Out of Scope section ("No visual/layout change").

## Quality Gate Notes

### Result
PASS

### Standards Review
- All 24 call sites verified present via `grep -rn "decodeHtmlEntities"` against the 11 target files — matches the Proposed File Changes table exactly (file, line, and site count).
- `npx tsc --noEmit` re-run clean (no output) — confirms `decodeHtmlEntities(string)` accepts every wrapped field (`task.title`, `issue.title`, `g.name`, `tl.name`, `m.name`, `s.title`, `t.title`) with no type errors, i.e. none of those fields are nullable in a way that would break the call.
- No unused imports introduced — each file's new `decodeHtmlEntities` import is used at least once in that same file.
- No dead code, no `any`, no new nesting, no error-handling paths touched — the change is a pure wrap-on-read, consistent with the existing precedent in `_task-detail.tsx:97` / `_issue-detail.tsx:73`.
- `_milestone-bar.tsx`'s `onBlur` guard (`e.target.value !== m.name`) was confirmed left comparing against the **raw** `m.name`, not the decoded `defaultValue` — satisfies Requirement 2's no-spurious-PATCH condition exactly as specified in the task doc's Code Context.
- No sort comparators exist in any of the 11 touched files (confirmed while reading each file in full during implementation) — Requirement 4 (comparators untouched) is trivially satisfied, nothing to preserve.
- Out-of-scope boundaries respected: `project.name`, `file.name`, comment content, mention-picker labels, and `decodeHtmlEntities()`'s own body were not touched in any file.
- Pre-existing `impeccable` design-hook findings (font-size/color/gray-on-color) on all touched files are unrelated to this change — confirmed each flagged line falls outside the diff (import lines and the specific wrapped interpolations only). Correctly left alone per "No visual/layout change" requirement; not a standards violation to leave them, since fixing them would itself be an unrequested visual change.

### Deviations
- None. Implementation matches the task doc's Proposed File Changes, Implementation Steps, and Requirements with no scope drift.

### Required Fixes
- None.
