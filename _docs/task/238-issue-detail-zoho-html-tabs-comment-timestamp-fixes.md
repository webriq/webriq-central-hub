# 238: Issue Detail — Zoho Description Line-Break/Image Fix, Attachments/Comments/Time Logs Tabs, Comment Timestamp Hover

**Created:** 2026-08-13
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

Four fixes to the Issue Detail page (`_issue-detail.tsx`), reported against real Zoho-imported data:

1. **Description renders with large phantom gaps.** Zoho's exported description HTML wraps every
   line in `<div>...<br/></div>` (the trailing `<br/>` is Zoho's own line terminator, not an
   intentional blank line). When that HTML is fed into the Description field's Tiptap editor
   (`_description-field.tsx`, shared by both Task and Issue Detail), each `<div>` becomes its own
   `<p>` node and the trailing `<br/>` survives as a real `hardBreak` inside it — so *every* line
   gets one extra blank line appended, not just Zoho's genuinely-blank `<div><br/></div>` rows. This
   is why Central Hub's rendering (image 6) is far more spaced out than Zoho's own (image 5).
2. **Inline images from Zoho description HTML don't resolve.** `<img src="/portal/viewInlineAttachment/image?file=...">`
   is a Zoho-relative path with no host — needs `https://crmplus.zoho.com` prepended before it can
   load in the browser.
3. **Attachments/Comments/Time Logs render as three stacked block `Card`s** instead of the pill-tab
   switcher Task Detail already ships (`_task-attachments-comments-panel.tsx`, task 211/214). Tasks
   235/236/237 built each tab as its own standalone Card on the issue side (documented deviation in
   each of those task docs — "if landing before 235/236... this follows that shape"); now that all
   three exist, this task does the tab-panel consolidation those docs deferred.
4. **Comment timestamps have no exact date/time on hover**, and the underlying relative-time
   formatter (`formatRelativeTime` in `src/lib/utils.ts`) has no week/month/year tiers — it falls
   straight from `Nd ago` to arbitrarily large day counts (e.g. `92d ago`, per image 8, instead of
   `3mo ago`).

Fixes 1 and 2 land in the shared `_description-field.tsx` / `_pm-shared.tsx`, so Task Detail's
Description field gets the same correction as a side effect (same shared component, same bug
class). Fix 4's `formatRelativeTime` change is in the shared `src/lib/utils.ts`, so every other
caller (`_task-comments.tsx`, `notification-bell.tsx`, `home-tab.tsx`, onboarding workspace file
tiles) also benefits from the added week/month/year tiers — that's an accepted, low-risk side
effect, not scope creep, since the function's contract (a relative-time string) is unchanged, only
its granularity at long durations improves. The hover-tooltip UI itself is added only to the two
comment threads (`_task-comments.tsx` and `_issue-comments.tsx`), matching where the reported bug
(image 8) was observed and where "Comment date" (Requirement 4's own wording) applies.

## Requirements

1. Fix the Description field's Zoho-imported-HTML line-break bug: every line ending in a trailing
   `<br/>` immediately before `</div>` (or `</li>`, `</td>`) must render as a single line/blank line,
   matching Zoho's own rendering — not one extra blank line per div. Verify against the exact sample
   HTML in the task request (renders like image 5, not image 6).
2. Any `<img src="...">` in description HTML whose `src` starts with
   `/portal/viewInlineAttachment/image` gets `https://crmplus.zoho.com` prepended before the HTML
   reaches the Tiptap editor, so the image actually loads.
3. Issue Detail's Attachments / Comments / Time Logs sections become a single pill-tab panel
   (mirroring `_task-attachments-comments-panel.tsx` exactly — same tab-switcher visual pattern, same
   "all tabs stay mounted, toggle `hidden`" behavior so live subscriptions/fetched state survive tab
   switches), replacing the three separate `Card`s currently on the page.
4. `formatRelativeTime` (`src/lib/utils.ts`) gains week/month/year tiers: `Nm ago` (minutes), `Nh ago`
   (hours), `Nd ago` (days, <7), `Nw ago` (weeks, <4), `Nmo ago` (months, <12), `Ny ago` (years) —
   thresholds chosen so each tier hands off to the next once it would otherwise show `≥7`/`≥4`/`≥12`
   of the smaller unit.
5. Hovering a comment timestamp (both Task Detail's `_task-comments.tsx` and Issue Detail's
   `_issue-comments.tsx`) shows a tooltip with the exact date + time, e.g. `Aug 13, 2026 3:11 pm`
   (reuse `formatDate` + `formatClockTime`, already used elsewhere for this exact combination — see
   `_issue-time-logs.tsx`'s `formatLoggedAt` helper).
6. `npx tsc --noEmit` and `pnpm lint` pass.

## Out of Scope / Must-Not-Change

- Comment body HTML rendering (`dangerouslySetInnerHTML={{ __html: c.body }}` in
  `_task-comments.tsx`/`_issue-comments.tsx`) — the reported bug and sample HTML are both scoped to
  the **Description** field specifically. Do not run the new line-break/image normalizer over
  comment bodies; that's a separate concern not requested here.
- No schema/RLS/migration changes — this is a client-side rendering fix plus a UI reorganization.
- Do not touch `_task-description-editor.tsx` (the New Task modal's creation-time editor) — it only
  ever handles freshly-authored content, never Zoho-imported HTML.
- Do not strip trailing `<br/>` before `</p>` — only `</div>`, `</li>`, `</td>`. Zoho's exporter never
  emits `<p>` tags; our own Tiptap editor's serializer does, and a user's own intentional trailing
  hard-break (Shift+Enter at a paragraph's end) inside a `<p>` must survive a save/reload round-trip
  unchanged.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/projects/_pm-shared.tsx` | Modify | Add a regex-based `normalizeZohoDescriptionHtml(html)` helper next to `decodeHtmlEntities` — collapses redundant trailing `<br/>` before `</div>`/`</li>`/`</td>`, and prepends `https://crmplus.zoho.com` to `/portal/viewInlineAttachment/image` image `src`s. Must stay regex-only (no `DOMParser`) — this module is imported into components Next.js pre-renders on the server. |
| `src/app/v2/(hub)/projects/[projectId]/_description-field.tsx` | Modify | Import the new helper; wrap `content: value` as `content: normalizeZohoDescriptionHtml(value)` in the `useEditor` call. |
| `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/_issue-attachments-comments-panel.tsx` | Create | New pill-tab panel wrapping `IssueAttachments` / `IssueComments` / `IssueTimeLogs`, adapted 1:1 from `tasks/[taskId]/_task-attachments-comments-panel.tsx` (3-tab variant already exists there as precedent — that file already has an `attachments`/`comments`/`timelogs` `PanelTab` union). |
| `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/_issue-detail.tsx` | Modify | Replace the three separate `Card`-wrapped `IssueAttachments`/`IssueComments`/`IssueTimeLogs` renders with the new `IssueAttachmentsCommentsPanel`, passing `timeLogsRefreshKey` through (already threaded via `handleHoursLogged`, task 237). |
| `src/lib/utils.ts` | Modify | Extend `formatRelativeTime` with week/month/year tiers. |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-comments.tsx` | Modify | Wrap the `formatRelativeTime(c.created_at)` `<span>` in a `Tooltip`/`TooltipTrigger`/`TooltipContent` showing the exact date+time. |
| `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/_issue-comments.tsx` | Modify | Same tooltip addition as above. |

## Code Context

### `_pm-shared.tsx` — existing regex-only convention to match (already read in full)
```ts
// ─── HTML entity decoding (Zoho-imported titles carry literal `&amp;` etc.) ─
// Regex-based, no DOMParser/document — this module is imported by components
// Next.js server-renders on first paint, so it must run with no DOM available.
export function decodeHtmlEntities(input: string): string { ... }
```
Add directly below it:
```ts
// ─── Zoho-imported description HTML normalization (task 238) ───────────────
// Zoho's exporter wraps every line in `<div>...<br/></div>` — the trailing <br/> is Zoho's own
// line terminator, not an intentional blank line. Left as-is, Tiptap turns each <div> into its own
// <p> node and keeps the trailing <br/> as a real hardBreak inside it, so *every* line renders with
// one extra blank line appended (not just Zoho's genuinely-blank <div><br/></div> rows). Stripping
// the trailing <br/> collapses that back to Zoho's own single-line-per-div rendering, and a
// genuinely empty `<div><br/></div>` still becomes one blank paragraph after stripping (not zero) —
// matching Zoho's own blank-line convention exactly.
// Scoped to </div>, </li>, </td> only — never </p>. Zoho's exporter never emits <p> tags; our own
// Tiptap editor's serializer does, and a user's intentional trailing hard-break (Shift+Enter at a
// paragraph's end) inside a <p> must survive a save/reload round-trip unchanged.
function collapseZohoLineBreaks(html: string): string {
  return html.replace(/(<br\s*\/?>)\s*(?=<\/(?:div|li|td)>)/gi, "");
}

// Zoho's inline description images are portal-relative (`/portal/viewInlineAttachment/image?file=...`)
// with no host, so they 404 rendered as-is in the browser. Prepend the portal host.
function absolutizeZohoInlineImages(html: string): string {
  return html.replace(
    /\bsrc=(["'])(\/portal\/viewInlineAttachment\/image[^"']*)\1/gi,
    (_match, quote: string, path: string) => `src=${quote}https://crmplus.zoho.com${path}${quote}`
  );
}

export function normalizeZohoDescriptionHtml(html: string): string {
  return absolutizeZohoInlineImages(collapseZohoLineBreaks(html));
}
```

### `_description-field.tsx` — the one line to change (already read in full, line 43-49)
```tsx
const editor = useEditor({
  extensions: [ StarterKit.configure({ link: { openOnClick: false } }), Image ],
  content: value,   // ← becomes: content: normalizeZohoDescriptionHtml(value),
  editable: !readOnly,
  immediatelyRender: false,
  ...
```
Import: `import { normalizeZohoDescriptionHtml } from "../_pm-shared";` (same relative path
`_issue-detail.tsx` already uses one level further down: `"../../../_pm-shared"` — confirm the exact
relative depth from `_description-field.tsx`'s own location, `[projectId]/_description-field.tsx`,
which is one level closer than `_issue-detail.tsx`, so `"../_pm-shared"`).

### `_task-attachments-comments-panel.tsx` — exact pattern to replicate (already read in full)
```tsx
"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { TaskAttachments } from "./_task-attachments";
import { TaskComments } from "./_task-comments";
import { TaskTimeLogs } from "./_task-time-logs";

type PanelTab = "attachments" | "comments" | "timelogs";
const TAB_LABEL: Record<PanelTab, string> = { attachments: "Attachments", comments: "Comments", timelogs: "Time Logs" };

export function TaskAttachmentsCommentsPanel({ projectId, taskId, timeLogsRefreshKey }: {
  projectId: string; taskId: string; timeLogsRefreshKey?: number;
}) {
  const [tab, setTab] = useState<PanelTab>("attachments");
  return (
    <div className="rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_1px_2px_rgba(7,17,51,0.05)] overflow-hidden">
      <div className="flex items-center px-[18px] py-3 border-b border-[#EDF0F7]">
        <div className="flex items-center gap-1 bg-[#F4F6FB] rounded-full p-1">
          {(["attachments", "comments", "timelogs"] as const).map((t) => (
            <button key={t} type="button" onClick={() => setTab(t)} aria-pressed={tab === t}
              className={cn("px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors cursor-pointer",
                tab === t ? "bg-white text-[#0B1533] shadow-[0_1px_2px_rgba(7,17,51,.05)]" : "text-[#5F6A88] hover:text-[#0B1533]")}>
              {TAB_LABEL[t]}
            </button>
          ))}
        </div>
      </div>
      <div className="p-[18px]">
        <div className={cn(tab !== "attachments" && "hidden")}><TaskAttachments projectId={projectId} taskId={taskId} /></div>
        <div className={cn(tab !== "comments" && "hidden")}><TaskComments taskId={taskId} /></div>
        <div className={cn(tab !== "timelogs" && "hidden")}><TaskTimeLogs taskId={taskId} refreshKey={timeLogsRefreshKey} /></div>
      </div>
    </div>
  );
}
```
The Issue version's props differ slightly from the task version's components — reuse each tab's
real signature (already read in full):
```tsx
<IssueAttachments projectId={projectId} issueId={issue.id} canEdit={perm.canEditDetails} />
<IssueComments projectId={projectId} issueId={issue.id} currentUserId={currentUserId} currentUserRole={currentUserRole} />
<IssueTimeLogs issueId={issue.id} refreshKey={timeLogsRefreshKey} />
```
So `IssueAttachmentsCommentsPanel` needs `projectId`, `issueId`, `canEdit`, `currentUserId`,
`currentUserRole`, `timeLogsRefreshKey` as props, and `_issue-detail.tsx`'s three `Card`-wrapped
blocks (lines 288-303 in the current file) get replaced with a single call to it.

### `src/lib/utils.ts` — current implementation to extend (already read in full)
```ts
export function formatRelativeTime(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;   // ← never advances past days; 92d ago instead of 3mo ago
}
```
New tiers to add after `days`:
```ts
if (days < 7) return `${days}d ago`;
const weeks = Math.floor(days / 7);
if (weeks < 4) return `${weeks}w ago`;
const months = Math.floor(days / 30);
if (months < 12) return `${months}mo ago`;
const years = Math.floor(days / 365);
return `${years}y ago`;
```

### `_issue-time-logs.tsx` — existing `formatDate` + `formatClockTime` combo + `Tooltip` usage to mirror (already read in full)
```tsx
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";
import { cn, formatDate, formatRelativeTime } from "@/lib/utils";
import { formatClockTime } from "@/lib/timer/format";
// ...
<Tooltip>
  <TooltipTrigger render={<button ...>...</button>} />
  <TooltipContent side="top" className="whitespace-pre-wrap">{entry.note}</TooltipContent>
</Tooltip>
```
`TooltipProvider` is already global (`src/app/layout.tsx`), so no provider wiring needed at either
call site. Apply the same `Tooltip`/`TooltipTrigger`/`TooltipContent` shape to the comment
timestamp `<span>` in both `_task-comments.tsx` (line 173) and `_issue-comments.tsx` (line 199):
```tsx
<Tooltip>
  <TooltipTrigger render={
    <span className="text-[10px] font-mono text-[#5F6A88]">{formatRelativeTime(c.created_at)}</span>
  } />
  <TooltipContent side="top">{formatDate(c.created_at)}, {formatClockTime(c.created_at)}</TooltipContent>
</Tooltip>
```
Import `formatDate` alongside the already-imported `formatRelativeTime`, and `formatClockTime` from
`@/lib/timer/format`, in both files.

## Implementation Steps

1. Add `normalizeZohoDescriptionHtml` (+ its two private helpers) to `_pm-shared.tsx`.
2. Wire it into `_description-field.tsx`'s `useEditor({ content: ... })`.
3. Manually verify against the task request's exact sample HTML (paste into a scratch description,
   or reason through the regex transform) that it renders like image 5, not image 6, and that both
   inline `<img>` tags resolve to `https://crmplus.zoho.com/portal/viewInlineAttachment/image?...`.
4. Create `_issue-attachments-comments-panel.tsx`, adapted from the task-side panel with the Issue
   tab components' real prop signatures.
5. Update `_issue-detail.tsx` to render the new panel in place of the three `Card`s.
6. Extend `formatRelativeTime` in `src/lib/utils.ts` with week/month/year tiers.
7. Add the hover tooltip to comment timestamps in `_task-comments.tsx` and `_issue-comments.tsx`.
8. `npx tsc --noEmit`, `pnpm lint`.

## Acceptance Criteria

- [ ] The task request's sample Zoho description HTML renders with single-line spacing between
      content lines and single blank lines where Zoho's source has them — no doubled gaps.
- [ ] Both inline images in that sample HTML load (resolve to `https://crmplus.zoho.com/portal/...`).
- [ ] Issue Detail shows one pill-tab panel (Attachments / Comments / Time Logs) instead of three
      stacked Cards, visually matching Task Detail's tab switcher.
- [ ] Switching tabs does not refetch/reset a tab's already-loaded data (all three stay mounted).
- [ ] `formatRelativeTime` returns `Nw ago` / `Nmo ago` / `Ny ago` at the appropriate thresholds
      (e.g. 92 days → `3mo ago`, not `92d ago`).
- [ ] Hovering a comment's relative timestamp (Task Detail and Issue Detail) shows a tooltip with
      the exact date + time, e.g. `Aug 13, 2026 3:11 pm`.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```
- Browser: open an Issue Detail page whose `description` contains the task request's sample HTML
  (or seed one), confirm spacing/images match Zoho's own rendering.
- Browser: confirm the Attachments/Comments/Time Logs pill-tab switcher on Issue Detail, switch tabs
  back and forth, confirm no refetch/loading-skeleton flash on return to an already-loaded tab.
- Browser: hover a comment timestamp on both Task Detail and Issue Detail, confirm the exact
  date+time tooltip appears.
- Browser: confirm Task Detail's own Description field (shared component) isn't visually broken by
  the normalizer change, for any existing Zoho-imported task description.

## Compatibility Touchpoints

- `_description-field.tsx` is shared by both Task Detail and Issue Detail — this fix applies to both
  automatically, which is intended (same bug class, same root cause).
- `formatRelativeTime` is called from several other places (`notification-bell.tsx`, `home-tab.tsx`,
  onboarding workspace file tiles, `_task-time-logs.tsx`/`_issue-time-logs.tsx`'s `sameDay` check) —
  the added tiers only change output for durations ≥7 days, and only make the string more precise,
  not differently shaped, so no caller needs a corresponding change.

## Implementation Notes

### What Changed
- Added `normalizeZohoDescriptionHtml` (+ private `collapseZohoLineBreaks` /
  `absolutizeZohoInlineImages` helpers) to `_pm-shared.tsx`, regex-only per the file's existing
  SSR-safety convention. Verified against the exact sample HTML from the task request (scratch
  Node script): every content-carrying `<div>` collapses from `text<br/>` to `text` (no extra blank
  line), every genuinely empty `<div><br/></div>` collapses to `<div></div>` (renders as exactly one
  blank paragraph, matching Zoho's own rendering), and the inline image `src` resolves to
  `https://crmplus.zoho.com/portal/viewInlineAttachment/image?file=...`.
- Wired the normalizer into `_description-field.tsx`'s `useEditor({ content: ... })` — since this
  component is shared by Task Detail and Issue Detail, both get the fix from one change (per user's
  explicit follow-up: "apply same fix to the tasks comment dates and task RTE" — the RTE half of
  that was already covered by this shared-component design, confirmed in the task doc's Overview).
- Created `_issue-attachments-comments-panel.tsx`, a line-for-line adaptation of
  `_task-attachments-comments-panel.tsx`'s pill-tab pattern, wired to each Issue tab component's
  real prop signature (`IssueAttachments` needs `canEdit`; `IssueComments` needs `currentUserId`/
  `currentUserRole`; `IssueTimeLogs` needs `refreshKey`). Replaced the three standalone
  Attachments/Comments/Time Logs `Card`s in `_issue-detail.tsx` with a single call to it.
- Extended `formatRelativeTime` (`src/lib/utils.ts`) with week (`<4w`), month (`<12mo`), and year
  tiers after the existing day tier, so e.g. 92 days now returns `3mo ago` instead of `92d ago`.
- Added a `Tooltip`/`TooltipTrigger`/`TooltipContent` (existing global `TooltipProvider` in
  `src/app/layout.tsx`, no extra provider wiring needed) around the relative-time `<span>` in both
  `_task-comments.tsx` (per user's explicit follow-up request) and `_issue-comments.tsx`, showing
  `formatDate(created_at), formatClockTime(created_at)` on hover — e.g. `Aug 13, 2026, 3:11 pm`.

### Files Changed
- `src/app/v2/(hub)/projects/_pm-shared.tsx` — added `normalizeZohoDescriptionHtml` + two private
  helpers.
- `src/app/v2/(hub)/projects/[projectId]/_description-field.tsx` — imports and applies the
  normalizer to `content:` in `useEditor`.
- `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/_issue-attachments-comments-panel.tsx`
  (new) — the pill-tab panel.
- `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/_issue-detail.tsx` — swapped the three
  `Card`-wrapped tab renders for the new panel; removed the now-unused `IssueAttachments`/
  `IssueComments`/`IssueTimeLogs` direct imports (now only imported inside the new panel file).
- `src/lib/utils.ts` — `formatRelativeTime` week/month/year tiers.
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-comments.tsx` — hover tooltip on the
  comment timestamp.
- `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/_issue-comments.tsx` — same tooltip
  addition.

### Deviations From Plan
- None. The user's mid-implementation note ("apply same fix to the tasks comment dates and task
  RTE") was already in scope per the task doc's Overview/Requirements — confirmed before starting
  implementation, no scope change made.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing warnings in an unrelated file — `_checklist-tab.tsx` unused
  vars — 0 errors)
- Scratch Node script against the task request's exact sample HTML - PASS (output verified
  line-by-line: single blank line per genuinely-blank Zoho div, no doubled line-break, image `src`
  absolutized)
- Browser acceptance testing (pill-tab switching persistence, tooltip hover, live Zoho-imported
  description/comment rendering) - SKIPPED (no interactive browser session in this run); recommend
  running the task doc's Verification section browser checks before merging.

## Quality Gate Notes

### Result
PASS

### Standards Review
- All 7 changed files read in full and cross-checked against the task doc's Code Context — every
  edit matches the planned snippet exactly (`normalizeZohoDescriptionHtml` + private helpers in
  `_pm-shared.tsx`, the single `content:` line in `_description-field.tsx`, the new panel's prop
  wiring in `_issue-attachments-comments-panel.tsx`/`_issue-detail.tsx`, the `formatRelativeTime`
  tiers, and the tooltip block in both comment files).
- `normalizeZohoDescriptionHtml` stays regex-only (no `DOMParser`), matching `_pm-shared.tsx`'s
  existing `decodeHtmlEntities` SSR-safety convention documented in the file itself.
- No unused/dead code, no untyped escape hatches, no unnecessary nesting.
- No secrets, credentials, or debug logging introduced.
- Naming (`collapseZohoLineBreaks`, `absolutizeZohoInlineImages`, `IssueAttachmentsCommentsPanel`)
  describes behavior accurately and follows existing file conventions.

### Deviations
- Minor (documented, not a maintenance-risk deviation): the 5-line
  `Tooltip`/`TooltipTrigger`/`TooltipContent` block is duplicated verbatim between
  `_task-comments.tsx` and `_issue-comments.tsx` rather than extracted to a shared helper. Left
  as-is because this pair of files already duplicates several other pieces the same way
  (`formatFileSize`, `IMAGE_EXTENSIONS`, `COMMENT_ATTACHMENT_MIME_TYPES`) per the issue file's own
  "copy-adapted from" header comment — matching the established pattern is more consistent with the
  codebase than introducing a new shared component for one 5-line block.
- None else. Implementation Notes' "Deviations From Plan" (none) confirmed accurate on review.

### Required Fixes
- None.

## Post-Gate Refinement (Testing Feedback)

During browser review, the first cut of `collapseZohoLineBreaks` was reported as visually too tight:
stripping the trailing `<br/>` from *every* div (blank or not) meant Zoho's intentional blank-line
dividers rendered with the same tight ~4px paragraph margin as ordinary line-to-line gaps, losing the
visual grouping Zoho's own rendering shows (tight lines within a block, a clear gap between blocks).

**Fix:** `collapseZohoLineBreaks`'s regex now only strips the trailing `<br/>` when the div/li/td has
real content before it — a negative lookbehind (`(?<!<(?:div|li|td)>\s*)`) excludes the case where the
`<br/>` is the tag's *only* content. Content-carrying divs (`<div>text<br/></div>`) still get
de-duped exactly as before. Genuinely-blank divs (`<div><br/></div>`, nothing else) are now left
untouched — their trailing hardBreak still gets ProseMirror's own extra "trailingBreak" companion
`<br>`, which is precisely the double-height blank line Zoho's source intends there. Net effect:
regular lines stay tight, blank-line dividers regain their visual weight, and nothing in between (no
CSS margin tuning needed — the user's own suggested fallback wasn't necessary once the regex targeted
the right case).

Verified with an updated scratch Node script against a longer slice of the task request's sample
HTML (multiple content divs, multiple blank dividers, an inline image div, and a `<ul>`/`<li>` list):
output confirmed all 4 blank dividers preserved as `<div><br/></div>` and all content
divs/list-items/image-div correctly stripped of their trailing `<br/>`.

- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (same 2 pre-existing unrelated warnings, 0 errors)
- Files changed: `src/app/v2/(hub)/projects/_pm-shared.tsx` only (`collapseZohoLineBreaks` regex +
  updated comment explaining the blank-vs-content distinction).

### Second Refinement — Explicit CSS for Blank-Line Paragraphs (Testing Feedback)

User flagged (correctly) that relying on `<p>` for the blank-line marker is architecturally fragile:
every `<p>` — blank-marker or ordinary — gets the exact same `[&_p]:my-1` margin (compiles to
`margin-block: var(--spacing)`, `globals.css`), so the blank-marker paragraph's actual visual height
came entirely from how the browser happens to lay out its two stacked children
(`<br><br class="ProseMirror-trailingBreak">`) — an emergent side effect, not something the
stylesheet explicitly controls.

**Fix:** Added two arbitrary-variant Tailwind rules to `_description-field.tsx`'s Tiptap
`editorProps.attributes.class`, scoped via `:has()` to exactly this structural pattern (a real
hardBreak `<br>` immediately followed by ProseMirror's own `<br class="ProseMirror-trailingBreak">`
companion — the precise signature of a blank-line marker paragraph, distinct from an ordinary
user-created empty paragraph which only ever gets the single trailing-break `<br>`, no preceding
sibling):
```
[&_p:has(>br+br.ProseMirror-trailingBreak)]:min-h-[1em]
[&_p:has(>br+br.ProseMirror-trailingBreak)>br]:hidden
```
Both `<br>` children are hidden and the paragraph itself is given an explicit `min-h-[1em]` — the
blank-line height is now fully deterministic (one paragraph's `[&_p]:my-1` margin + a fixed 1em),
independent of browser `<br>`-stacking behavior.

Verified the arbitrary-variant selectors compile correctly by fetching the already-running local dev
server's compiled CSS chunk directly (did not start or stop the dev server — an existing process was
already listening on :3000) and confirming both rules landed in the output exactly as written:
```css
p:has( > br + br.ProseMirror-trailingBreak) { min-height: 1em; }
p:has( > br + br.ProseMirror-trailingBreak) > br { display: none; }
```

- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (same 2 pre-existing unrelated warnings, 0 errors)
- Compiled-CSS check against the running dev server - PASS (both rules present, correctly scoped)
- Files changed: `src/app/v2/(hub)/projects/[projectId]/_description-field.tsx` only (two new
  Tailwind arbitrary-variant classes + explanatory comment on the existing `editorProps` class list).

### Third Refinement — Comment Timestamp: Inline Reveal, Not a Floating Tooltip (Testing Feedback)

User clarified Requirement 5's actual intent: the exact date/time should appear **inline, right
after** the relative-time text, revealed on hovering the comment — not in a separate floating
`Tooltip` popup (what the original implementation shipped, per `_issue-time-logs.tsx`'s existing
`Tooltip` pattern, which is the wrong shape for this specific spot even though it's the right
component for other spots like `_issue-time-logs.tsx`'s note icon).

**Fix:** Removed the `Tooltip`/`TooltipTrigger`/`TooltipContent` usage from both
`_task-comments.tsx` and `_issue-comments.tsx` (and the now-unused import). Replaced with an inline
reveal: the exact date/time lives in a nested `<span>` sitting directly after the relative-time text,
collapsed to `max-w-0 overflow-hidden` at rest (zero visual footprint, no reserved blank space) and
expanding to `group-hover:max-w-[200px]` with `transition-[max-width] duration-200 ease-out` when the
comment is hovered — matching this codebase's existing width-transition convention (`transition-[width]`,
already used for the sidebar collapse and several progress bars) rather than introducing a new
animation pattern. The reveal is triggered by hovering the whole comment `<li>` (the existing `group`
class already on `_issue-comments.tsx`'s `<li>` for the delete-button reveal; added the same `group`
class to `_task-comments.tsx`'s `<li>`, which didn't have one yet), not just the small 10px timestamp
text — matching "when I hover the comment," not "when I hover the timestamp."

Considered and rejected two simpler alternatives before landing on this:
- A plain `opacity-0 → group-hover:opacity-100` reveal (this codebase's most common hover-reveal
  pattern, e.g. the delete button in the same files) — rejected because `opacity` doesn't remove the
  element from layout, so it would permanently reserve ~150px of blank space after every timestamp
  even when not hovering, which reads as a rendering bug, not a considered design.
- `hidden group-hover:inline` (display toggle) — rejected because it causes an instant width jump
  rather than a smooth transition, and — more importantly — directly abuts the delete button's
  `ml-auto` positioning on the issue side with no transition to soften the shift.

Verified the new arbitrary-variant classes compile by fetching the running dev server's CSS chunk
again (same no-start/no-stop approach as the earlier refinement) and confirming
`.group-hover\:max-w-\[200px\]:is(:where(.group):hover *) { max-width: 200px; }` is present.

- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (same 2 pre-existing unrelated warnings, 0 errors)
- Compiled-CSS check against the running dev server - PASS
- Files changed: `_task-comments.tsx` (added `group` to the `<li>`, replaced `Tooltip` usage with
  the inline reveal, removed the now-unused `Tooltip`/`TooltipTrigger`/`TooltipContent` import) and
  `_issue-comments.tsx` (same reveal swap; `group` was already present on its `<li>`).

## Final Summary

All four original requirements shipped, with three testing-feedback refinements folded in before
sign-off:

1. **Zoho description line-break bug** — `normalizeZohoDescriptionHtml()` in `_pm-shared.tsx`
   (regex-only, SSR-safe) strips a trailing `<br/>` only when the enclosing `<div>`/`<li>`/`<td>` has
   real content before it, leaving genuinely-blank Zoho divider divs untouched. Paired with an
   explicit CSS rule in `_description-field.tsx` (`:has()`-scoped to the exact
   `<br><br class="ProseMirror-trailingBreak">` blank-marker signature) so the resulting blank-line
   height is deterministic — a fixed `min-h-[1em]` — rather than an emergent side effect of how a
   browser stacks two `<br>` tags. Content lines render tight; Zoho's intentional blank-line dividers
   keep their visual weight. Applies to both Task Detail and Issue Detail (shared component).
2. **Zoho inline image URLs** — the same normalizer absolutizes any `/portal/viewInlineAttachment/image`
   `src` to `https://crmplus.zoho.com/...` before the HTML reaches Tiptap.
3. **Attachments/Comments/Time Logs tabs** — Issue Detail's three stacked `Card`s replaced with
   `_issue-attachments-comments-panel.tsx`, a pill-tab switcher matching Task Detail's
   `_task-attachments-comments-panel.tsx` exactly (all three tabs stay mounted; switching only
   toggles `hidden`, so no data refetch on tab return).
4. **Comment timestamps** — `formatRelativeTime()` (`src/lib/utils.ts`) gained week/month/year tiers.
   Hovering a comment (the whole row, not just the timestamp text) reveals the exact date + time
   inline right after the relative time (e.g. `1h ago · Aug 13, 2026 3:11 pm`), via a
   `max-w-0 → group-hover:max-w-[200px]` transition — zero footprint at rest, no floating tooltip.
   Applied identically to both `_task-comments.tsx` and `_issue-comments.tsx`.

Final verification state: `npx tsc --noEmit` and `pnpm lint` both clean (0 errors; the same 2
pre-existing, unrelated warnings in `_checklist-tab.tsx` throughout every round). All Tailwind
arbitrary-variant selectors introduced in this task were confirmed to actually compile by inspecting
the already-running local dev server's live CSS output (never started or stopped that server).

**Not run in this session** (no interactive browser/test-credential access): live acceptance testing
of the pill-tab switcher against real data, the hover reveal's visual timing/positioning, and
rendering of a live Zoho-imported description/comment end-to-end in the browser. Recommend a quick
manual pass over the task doc's Verification section before this is treated as fully shipped.
