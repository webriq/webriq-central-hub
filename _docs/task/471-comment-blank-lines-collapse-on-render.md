# 471: Blank lines in posted comments collapse (editor ≠ rendered spacing)

**Status:** Planned
**Priority:** MEDIUM
**Type:** bugfix
**Recommended Tier:** fast
**Date:** 2026-11-12

## Overview

When you write a Task or Ticket comment, the editor shows blank lines between sections (for example, after the greeting, before "What was requested", and before each "… Listings:" block). Once the comment is posted or saved, those blank lines are gone and the sections run together.

**Root cause (verified in code):** The Tiptap editor (`StarterKit`) saves each blank line as an empty paragraph, `<p></p>`.
- **In the editor**, ProseMirror puts a `<br class="ProseMirror-trailingBreak">` inside each empty paragraph, so the paragraph is one line tall.
- **In the posted comment**, the body is rendered as raw HTML through `dangerouslySetInnerHTML`. There an empty `<p></p>` has no height, and its `my-1` margins collapse into the paragraphs around it, so the blank line takes up no space.

The stored HTML is correct. Only the read-only rendering is wrong.

`normalizeZohoDescriptionHtml` is **not** the cause. `collapseZohoLineBreaks` only touches `</div>`, `</li>` and `</td>`, never `</p>`. See `src/app/(hub)/projects-old/_pm-shared.tsx:165-173`.

## Requirements

- [ ] In the read-only render of a comment, an empty paragraph takes up one line of height, the same as it does in the editor.
- [ ] Apply this to every place that renders Task or Ticket comments as raw HTML: v2, legacy and projects-old. There are 6 sites, listed below.

## Out of Scope / Must-Not-Change

- Stored comment HTML. No data rewrite, migration or backfill, and no change to the editor's `getHTML()` output.
- `normalizeZohoDescriptionHtml` / `collapseZohoLineBreaks`, which are shared with the Description field and the Desk inbox.
- The Description field. It renders through Tiptap, so empty paragraphs already have height there.
- Spacing of Zoho-imported `<div>` lines. The `[&_div]` rules stay as they are.
- Desk inbox message rendering (`_message-html.ts`).

## Proposed File Changes

In each of these files, add `[&_p:empty]:min-h-lh` to the existing `[&_p]:my-1 …` class string on the comment-body `<div>`:

| File | Line (approx) |
|------|---------------|
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-comments.tsx` | ~319 |
| `src/app/(hub)/projects/v2/[projectId]/tickets/[ticketId]/_ticket-comments.tsx` | ~343 |
| `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-comments.tsx` | ~319 |
| `src/app/(hub)/projects/legacy/[projectId]/tickets/[ticketId]/_ticket-comments.tsx` | ~343 |
| `src/app/(hub)/projects-old/[projectId]/tasks/[taskId]/_task-comments.tsx` | ~215 |
| `src/app/(hub)/projects-old/[projectId]/issues/[issueId]/_ticket-comments.tsx` | ~263 |

Find all of them with `grep -rn "dangerouslySetInnerHTML={{ __html: normalizeZohoDescriptionHtml(c.body)" src`. It should return exactly these 6.

## Code Context

The class string on the comment body (v2 task comments, `_task-comments.tsx:310-328`):

```tsx
<div
  className={cn(
    "text-[13px] text-[#3A4565] leading-relaxed mt-0.5",
    "[&_div]:my-1 [&_div:first-child]:mt-0 [&_div:last-child]:mb-0",
    "[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0 [&_ul]:list-disc ...",   // ← add [&_p:empty]:min-h-lh here
    "[&_a]:text-[#0063D6] [&_a]:underline [&_img]:max-w-full ...",
    MENTION_CLASSES
  )}
  dangerouslySetInnerHTML={{ __html: normalizeZohoDescriptionHtml(c.body) }}
/>
```

Editor classes for comparison (`_comment-editor.tsx:63-69`): the editor uses the same `[&_p]:my-1` margins and `leading-relaxed`. After the fix, an empty paragraph is `1lh` tall plus `my-1` in both places, so the editor and the posted comment line up.

- Tailwind is **4.3.3** (`node -p "require('tailwindcss/package.json').version"`), so the `min-h-lh` utility (`min-height: 1lh`, available since v4.1) works and no arbitrary value is needed.
- `:empty` matches `<p></p>`, which is exactly what Tiptap emits. A paragraph that contains a hard break, `<p><br></p>`, already has height and doesn't change.
- Keep the class string static. The `cn()` rules in CLAUDE.md apply.

## Implementation Steps

1. Run the grep above and confirm it finds 6 sites.
2. In each site, add `[&_p:empty]:min-h-lh` right after `[&_p:last-child]:mb-0` in the `[&_p]` class string.
3. Run `npx tsc --noEmit`.
4. Do the browser check below.

## Acceptance Criteria

| # | Check | Expected | When |
|---|-------|----------|------|
| AC1 | `grep -rc "\[&_p:empty\]:min-h-lh" src/app/\(hub\)/projects src/app/\(hub\)/projects-old` | A count of 1 in each of the 6 files listed above | pre-merge |
| AC2 | `npx tsc --noEmit` | exit 0 | pre-merge |
| AC3 | Browser (manual, because this is visual): on a v2 Task Details page → Comments, post the comment text from the original report (greeting, blank line, paragraph, 3 blank lines, "What was requested", …). | The posted comment shows a visible blank gap wherever the editor showed one, matching the editor screenshot. Sections no longer run together. | pre-merge |
| AC4 | Browser (manual): open Edit on that comment, then Cancel | The spacing in edit mode and in the posted view looks the same | pre-merge |
| AC5 | Browser (manual): v2 **Ticket** comment, and one legacy Task comment | Same result as AC3 | pre-merge |
| AC6 (no-regression) | Browser (manual): open an existing comment with no blank lines, and a Zoho-imported comment (`<div>`-per-line body) | Line spacing is unchanged from before the fix. There are no new gaps between normal lines or `<div>` lines. | pre-merge |
| AC7 (no-regression) | Browser (manual): open a Task Description in both view and edit mode | No change, because this file isn't touched | pre-merge |

## Verification

`npx tsc --noEmit` and the browser checks AC3–AC7. There is no test runner. This is a CSS-only change with no logic, so it needs no `.check.ts`.

## Coordination

- **466** (`@mention` in comment composers, Testing) and **467** (nested subtasks, Testing) both touch `_task-comments.tsx` / `_ticket-comments.tsx`. Neither changes the comment-body class string. Land this after they merge, or rebase. The edit is one class token on one line, so any conflict is trivial.
- **460** (Planned) touches `_comment-editor.tsx` only. No overlap.

## Open Decisions

None.

## Operator Steps

None: merge is enough. There's no migration, and existing comments fix themselves because the stored HTML was already correct.

## Baseline

- AC1 `grep -rc "\[&_p:empty\]:min-h-lh"`: 0 files (fails before the change, as intended)
- Render sites (`dangerouslySetInnerHTML={{ __html: normalizeZohoDescriptionHtml(c.body)`): 6
- AC2 `npx tsc --noEmit`: not recorded before the change (CSS-only edit; exit 0 after)

## Implementation Notes

### What Changed
- Added `[&_p:empty]:min-h-lh` right after `[&_p:last-child]:mb-0` in the comment-body class string at all 6 raw-HTML comment render sites. Each empty `<p></p>` saved by Tiptap is now one line tall, matching the editor.

### Files Changed
- `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-comments.tsx:319` - class token
- `src/app/(hub)/projects/v2/[projectId]/tickets/[ticketId]/_ticket-comments.tsx:343` - class token
- `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-comments.tsx:319` - class token
- `src/app/(hub)/projects/legacy/[projectId]/tickets/[ticketId]/_ticket-comments.tsx:343` - class token
- `src/app/(hub)/projects-old/[projectId]/tasks/[taskId]/_task-comments.tsx:213` - class token
- `src/app/(hub)/projects-old/[projectId]/issues/[issueId]/_ticket-comments.tsx:264` - class token

### Deviations From Plan
- None. (The doc said projects-old task comments were at ~215; the actual line is 213. The issues one is at 264, not ~263.)

### Verification Run
- AC1 grep - PASS (baseline: 0 files → now: count 1 in each of the 6 files, 0 elsewhere)
- AC2 `npx tsc --noEmit` - PASS (exit 0)
- Extra: compiled the class with the installed Tailwind 4.3.3 (`compile().build(["[&_p:empty]:min-h-lh"])`) and it outputs `.\[\&_p\:empty\]\:min-h-lh p:empty { min-height: 1lh; }` - PASS
- AC3–AC7 browser checks - SKIPPED (manual/visual; left for the `test` stage)

### Attempts That Failed
- None

### Operator Steps
- None: merge is enough. This is a CSS class change in page-scoped client components. There's no shared module, migration or separate deployable.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. All 6 lines get the same single class token in the same position. The class strings are static, there are no arbitrary values, and `cn()` is unchanged, which matches the CLAUDE.md styling rules. No logic, types or debug code were touched.
- The changed files were found with `grep` rather than `git diff --name-only`, because CLAUDE.md says not to run git commands.
- The 6 sites already repeat the same class string; this change follows that pattern. Pulling it into a shared constant would be a refactor outside this task's scope.
- Weak spot: AC1 only checks the source text. The real evidence is the visual checks AC3–AC7, which the `test` stage must run. The Tailwind compile check confirms the CSS is actually generated.

### Deviations
- Minor, now intended behaviour: a comment that **ends** with an empty paragraph (Enter pressed after the last line) now shows that trailing blank line, matching the editor. Before the fix it was hidden.
- Minor: a comment that has attachments but an empty body (`<p></p>`, allowed through `allowEmpty`) now shows one blank line of height above the attachments. To confirm in the `test` stage: if this looks off, a follow-up can skip rendering the body when it's empty. That change is out of scope here.

### Required Fixes
- None

## Part B: trailing hard breaks (added 2026-11-12, user report #2)

### Report
A second comment ("Hi Miss @Niña Anjerrie Baraquil, good evening, …") still loses some of its blank lines after the Part A fix: after the greeting, after "…these requests:", and before "Hello Homes listings page". Others now show correctly (before "Our Listings page" and before "Should you…"). So this one comment stores blank lines in two different ways.

### Cause
A blank line made with Shift+Enter, or pasted as a `<br>`, is stored as a hard break at the end of a paragraph: `<p>text<br></p>`. In the editor, ProseMirror adds a `ProseMirror-trailingBreak` `<br>` after it, so you see a blank line. The same behaviour is described in `collapseZohoLineBreaks`. In plain HTML, a `<br>` at the end of a block adds no line, so the blank line disappears in the posted view.
- **Not verified against the stored row:** the read-only query of `task_comments` / `ticket_comments` was blocked by the permission policy (production read). The cause is inferred from which blank lines survive and which collapse.

### Change
- `src/app/(hub)/projects-old/_pm-shared.tsx`: new `normalizeCommentHtml()` = `normalizeZohoDescriptionHtml()` plus a step that adds a second `<br>` after any `<br>` that directly precedes `</p>`. This mirrors ProseMirror's trailing break.
- The 6 comment render sites now import and call `normalizeCommentHtml(c.body)` instead of `normalizeZohoDescriptionHtml(c.body)`.
- Left unchanged on purpose:
  - **Description field**, which still uses `normalizeZohoDescriptionHtml`. Its HTML goes back into Tiptap, and doubling the break there would add a real hard break on every load.
  - **Desk inbox** (`_message-html.ts`).

### Verification
- `npx tsx _docs/task/471-comment-html.check.ts` - PASS. It covers a trailing `<br>` (gets doubled), `<br />` with whitespace, `<p><br></p>`, a mid-paragraph `<br>` (unchanged), an empty `<p>` (unchanged), the Zoho `<div>` collapse (still applies), and the Description normalizer (unchanged).
- `npx tsc --noEmit` - PASS (exit 0)
- `grep`: 0 remaining `normalizeZohoDescriptionHtml(` calls in the 6 comment files.
- Browser - NOT RUN. Add to AC3: re-open the "good evening" comment and confirm every blank line the editor shows also appears in the posted view.

### Operator Steps
- None: merge is enough. `_pm-shared.tsx` is imported by many pages, but the existing export is unchanged, so only the 6 comment views see a difference.
