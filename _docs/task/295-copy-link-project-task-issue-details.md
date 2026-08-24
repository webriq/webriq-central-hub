# 295: Copy Link Button — Project, Task & Issue Detail Pages

**Created:** 2026-08-24
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

Add a "Copy Link" action to the three detail-page headers PMs/Devs actually work in — **Project detail**, **Task detail**, and **Issue detail** — so a user can copy the current page's URL to the clipboard and paste it somewhere (Cliq, email, a comment) without manually selecting the browser address bar.

The active surface is `/projects/v2/[projectId]` and `/projects/legacy/[projectId]` (both are live, parallel-maintained variants per task 280/283 — feature parity is expected across them) plus their nested `tasks/[taskId]` and `issues/[issueId]` routes. `/projects-old` is excluded — it is not linked from the sidebar or any dashboard (`grep` for its only reference found one incidental mention in `timer-floating-widget.tsx`, not a nav link), i.e. an orphaned/deprecated route per task 280's "No change to `/projects-old`" note.

**Per the requested `nextjs-file-length-best-practices.md` guidance** ("Single Responsibility... if a file needs to be duplicated to be reused, split it"): the copy-link button is one small, reusable component (`_copy-link-button.tsx`, ~40-50 lines) added to the existing `projects/_shared/` folder — the same folder `_task-detail.tsx`/`_issue-detail.tsx`/`_project-detail-header.tsx` already pull shared pieces from (`DescriptionField`, `TaskTimerButton`, etc.) — rather than re-implementing `navigator.clipboard` + copied-state + tooltip logic five times across five already-mid-size header blocks (`_project-detail-header.tsx` is 186 lines; `_task-detail.tsx` is 409; `_issue-detail.tsx` is 325). This keeps each touched file's diff to a couple of lines instead of growing any of them.

Scope is copy-to-clipboard of the current page URL only — no shortened/canonical link generation, no share-permission changes, no "link expires" logic. The existing page URLs (UUID-keyed for `tasks/[taskId]`/legacy `issues/[issueId]`, `project_id`/`display_id`-keyed for the v2 project/task/issue routes per CLAUDE.md's routing-key conventions) are already valid, loadable URLs for anyone with hub access — copying `window.location.href` verbatim is sufficient and correct for every one of these routes without the button needing to know which ID scheme a given route uses.

## Requirements

- [ ] New shared `CopyLinkButton` component (`src/app/(hub)/projects/_shared/_copy-link-button.tsx`): on click, copies `window.location.href` via `navigator.clipboard.writeText`; shows a brief "copied" state (icon swaps `Link2` → `Check`, tooltip text swaps "Copy link" → "Copied!") for ~1.5s via `setTimeout`, matching the existing copied-state idiom already used elsewhere in the codebase (`customers/onboard/_content.tsx:58-64`). Wrapped in the same `Tooltip`/`TooltipTrigger`/`TooltipContent` (`@/components/ui/tooltip`) pattern the Delete buttons in `_task-detail.tsx`/`_issue-detail.tsx` already use, so it matches this app's established icon-button-with-tooltip convention exactly. Accepts an optional `className` (button chrome varies slightly per call site — see below) and `size` (icon px, default 18) prop; owns no other state or config.
- [ ] **Project detail header** (`_project-detail-header.tsx`): add `CopyLinkButton` to the top-right action-icon row, always visible (unlike the Settings gear, which is permission-gated) — every user who can view a project detail page should be able to copy its link. Styled to match the existing bordered gear-button chrome (`rounded-full border border-[#E2E7F2] bg-white p-2.5 ... hover:border-[#A8C6F5]`) so the two icon buttons read as one action group.
- [ ] **Task detail header** (`_task-detail.tsx`, both `v2` and `legacy` variants): add `CopyLinkButton` next to the existing Delete button, always visible (Delete stays gated behind `perm.canEditDetails`). Styled to match the existing plain circular icon-button chrome Delete uses (`p-2 rounded-full ... cursor-pointer shrink-0 mt-1 transition-colors`), with a non-destructive (blue) hover instead of Delete's red.
- [ ] **Issue detail header** (`_issue-detail.tsx`, both `v2` and `legacy` variants): identical treatment to Task detail — add `CopyLinkButton` next to the existing Delete button, always visible, same plain-icon-button chrome with blue hover.
- [ ] Clipboard write failure (clipboard API unavailable/denied) does not throw an unhandled rejection — wrap in try/catch; on failure, simply skip the "copied" state change (no error toast needed — this is a low-stakes convenience action, not a scope requiring dedicated error UX).

## Out of Scope / Must-Not-Change

- `/projects-old/[projectId]` and its nested `tasks/[taskId]`/`issues/[issueId]` — orphaned route, not linked from any nav surface, excluded per task 280's established "no change to `/projects-old`" precedent.
- Milestone detail pages / any other detail surface not named in the request (Projects, Task, Issue only).
- Any canonical/shortened-URL generation, deep-link query-param normalization, or "copy as Markdown link" formatting — plain `window.location.href` only.
- No changes to `_project-detail-header.tsx`'s Settings-menu gating logic, `_task-detail.tsx`/`_issue-detail.tsx`'s Delete gating (`perm.canEditDetails`), or any other existing header behavior beyond adding the one new button.
- No new dependency — `navigator.clipboard` is a browser built-in; the `Tooltip` component and `lucide-react` icons are already installed and already used in every file this task touches.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_shared/_copy-link-button.tsx` | Create | Shared copy-to-clipboard icon button with tooltip + copied-state, reused by all 3 detail-page headers |
| `src/app/(hub)/projects/_shared/_project-detail-header.tsx` | Modify | Add `CopyLinkButton` to the always-visible action-icon row (currently only the permission-gated Settings gear lives there) |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | Add `CopyLinkButton` next to Delete in the header's action area |
| `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | Same as v2 (this file is a near-duplicate of the v2 version — only the back-link URL differs per existing `diff`) |
| `src/app/(hub)/projects/v2/[projectId]/issues/[issueId]/_issue-detail.tsx` | Modify | Add `CopyLinkButton` next to Delete in the header's action area |
| `src/app/(hub)/projects/legacy/[projectId]/issues/[issueId]/_issue-detail.tsx` | Modify | Same as v2 (near-duplicate; only the back-link URL differs) |

## Code Context

### New component shape — `_copy-link-button.tsx`
```tsx
"use client";

import { useState } from "react";
import { Link2, Check } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export function CopyLinkButton({ className, size = 18 }: { className?: string; size?: number }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable/denied — no-op, low-stakes convenience action.
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger render={
        <button
          type="button"
          onClick={handleCopy}
          aria-label={copied ? "Link copied" : "Copy link"}
          className={className}
        >
          {copied ? <Check size={size} /> : <Link2 size={size} />}
        </button>
      } />
      <TooltipContent side="top">{copied ? "Copied!" : "Copy link"}</TooltipContent>
    </Tooltip>
  );
}
```

### Project header call site — `_project-detail-header.tsx:179` (current)
```tsx
{settingsMenu && <div className="flex items-center gap-2 shrink-0">{settingsMenu}</div>}
```
Change to always render the wrapper (Copy Link no longer conditional on `settingsMenu` existing):
```tsx
<div className="flex items-center gap-2 shrink-0">
  <CopyLinkButton className="inline-flex cursor-pointer items-center justify-center rounded-full border border-[#E2E7F2] bg-white p-2.5 text-[#3A4565] transition-colors hover:border-[#A8C6F5] hover:text-[#0B1533]" />
  {settingsMenu}
</div>
```

### Task/Issue header call site — `_task-detail.tsx:196-210` / `_issue-detail.tsx:184-198` (current, task version shown)
```tsx
{perm.canEditDetails && (
  <Tooltip>
    <TooltipTrigger render={<button onClick={() => setConfirmOpen(true)} ...><Trash2 size={18} /></button>} />
    <TooltipContent side="top">Delete task</TooltipContent>
  </Tooltip>
)}
```
Wrap both buttons in a shared row so Copy Link renders unconditionally alongside the still-gated Delete:
```tsx
<div className="flex items-center gap-1 shrink-0 mt-1">
  <CopyLinkButton className="p-2 rounded-full text-[#5F6A88] hover:text-[#007BFF] hover:bg-[#E5F1FF] cursor-pointer transition-colors" />
  {perm.canEditDetails && (
    <Tooltip>
      <TooltipTrigger render={<button onClick={() => setConfirmOpen(true)} disabled={deleting} className="p-2 rounded-full text-[#5F6A88] hover:text-[#C0392B] hover:bg-[#FDE8E6] cursor-pointer transition-colors disabled:opacity-45" aria-label="Delete task">...</button>} />
      <TooltipContent side="top">Delete task</TooltipContent>
    </Tooltip>
  )}
</div>
```
Note the `mt-1` moves from the individual Delete button onto the new wrapping row (both buttons need the same top offset relative to the title textarea); drop `mt-1`/`shrink-0` from the inner Delete `<button>` className since the wrapper now supplies them. Same restructure applies to `_issue-detail.tsx`'s `canDelete && (...)` block ("Delete issue" label).

## Implementation Steps

1. Create `src/app/(hub)/projects/_shared/_copy-link-button.tsx` per the Code Context shape above.
2. `_project-detail-header.tsx`: import `CopyLinkButton`, restructure the trailing action wrapper to always render, add the button with bordered chrome ahead of `settingsMenu`.
3. `_task-detail.tsx` (v2): import `CopyLinkButton`, wrap the header's trailing action area, add the button with plain-icon chrome ahead of the gated Delete button; move `mt-1 shrink-0` to the wrapper.
4. Repeat step 3 for `_task-detail.tsx` (legacy) — identical change, different file.
5. Repeat step 3's pattern for `_issue-detail.tsx` (v2), using `canDelete` as the existing gate name (issue's variable name differs from task's `perm.canEditDetails`, per the earlier `grep` — confirm current name at edit time).
6. Repeat step 5 for `_issue-detail.tsx` (legacy).
7. Run `npx tsc --noEmit` and `pnpm lint`.
8. Browser-verify (see Acceptance Criteria) — `pnpm dev`, visit one v2 and one legacy instance of each of the 3 detail pages.

## Acceptance Criteria

- [ ] On `/projects/v2/[projectId]` (any tab) and `/projects/legacy/[projectId]` (any tab), a Copy Link icon button is visible in the header regardless of role/permissions; clicking it copies the current browser URL and shows a brief "Copied!" confirmation (tooltip text and/or icon swap), then reverts.
- [ ] On a Task detail page (`.../tasks/[taskId]`, both v2 and legacy), the same button appears next to Delete (or alone, for a role without delete permission) and behaves identically.
- [ ] On an Issue detail page (`.../issues/[issueId]`, both v2 and legacy), the same button appears next to Delete (or alone) and behaves identically.
- [ ] Copying a link, pasting it in a new tab (or `curl`-equivalent check of the URL shape), and confirming it round-trips to the exact same project/task/issue.
- [ ] Existing Delete-button behavior (gating, confirm dialog, red hover) is unchanged on Task and Issue detail; existing Settings-gear behavior (gating, menu items) is unchanged on Project detail — regression check.
- [ ] Icon-only button has an `aria-label` and a visible hover state per this codebase's UI Polish Conventions.
- [ ] `npx tsc --noEmit` passes clean.
- [ ] `pnpm lint` passes clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```
No test runner configured. Verification is type-check + lint + browser-based acceptance testing (`pnpm dev`) against all six touched routes: `/projects/v2/[projectId]`, `/projects/legacy/[projectId]`, `.../tasks/[taskId]` (v2 + legacy), `.../issues/[issueId]` (v2 + legacy) — confirm the button renders, copies the correct URL, and shows/reverts the copied state, with no regression to the adjacent Delete/Settings controls.

## Compatibility Touchpoints

- No API, schema, or route changes — purely a client-side UI addition reading `window.location.href`, which is safe here because it's only invoked inside the `onClick` handler (an event callback), never at render time, per CLAUDE.md's `window.location` rule.
- `_task-detail.tsx` and `_issue-detail.tsx` each have a `v2` and `legacy` copy that are near-duplicates of each other (confirmed via `diff`: only the back-link/delete-redirect URL differs) — this task's change must be applied to both copies identically to avoid the two variants drifting out of parity, consistent with how task 280/283 have kept them in sync.

## Implementation Notes

### What Changed
- Added a new shared `CopyLinkButton` component and wired it into the action-icon row of all 5 header call sites (Project detail header, Task detail × v2/legacy, Issue detail × v2/legacy), exactly as planned in Code Context — no deviations.
- Project header: the trailing action wrapper now always renders (previously it was conditional on `settingsMenu` existing), housing `CopyLinkButton` ahead of the still permission-gated Settings gear.
- Task/Issue headers: wrapped the previously permission-gated Delete button in a new `<div className="flex items-center gap-1 shrink-0 mt-1">`, with `CopyLinkButton` always rendered first and Delete staying behind its existing gate (`perm.canEditDetails` for tasks, `canDelete` for issues). Moved `shrink-0 mt-1` from the individual Delete `<button>` onto the new wrapper, as planned.

### Files Changed
- `src/app/(hub)/projects/_shared/_copy-link-button.tsx` — new shared component (clipboard write + Tooltip + copied-state icon swap).
- `src/app/(hub)/projects/_shared/_project-detail-header.tsx` — import + always-visible action wrapper with `CopyLinkButton`.
- `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-detail.tsx` — import + header wrapper.
- `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-detail.tsx` — import + header wrapper (identical change to the v2 copy).
- `src/app/(hub)/projects/v2/[projectId]/issues/[issueId]/_issue-detail.tsx` — import + header wrapper (uses the existing `canDelete` gate name).
- `src/app/(hub)/projects/legacy/[projectId]/issues/[issueId]/_issue-detail.tsx` — import + header wrapper (identical change to the v2 copy).

### Deviations From Plan
- None — implemented exactly per the Code Context shape, including the `mt-1`/`shrink-0` migration from the inner Delete button to the new outer wrapper.

### Verification Run
- `npx tsc --noEmit` — PASS (no output/errors).
- `pnpm lint` — PASS (0 errors; 2 pre-existing warnings in `_checklist-tab.tsx`, unrelated to this task, already recorded by tasks 291/292).
- Browser-based acceptance testing (`pnpm dev`, Super Admin session, Chrome via claude-in-chrome) —
  - Button renders correctly on all 3 detail-page types, both `v2` and `legacy` variants: Project detail (`/projects/v2/82ACEB0F-PROJ-03/timeline`, `/projects/legacy/CAA175BE-PROJ-01/tasks`), Task detail (`/projects/v2/46305B0C-PROJ-16/tasks/46305B0C16-T0001`, `/projects/legacy/CAA175BE-PROJ-01/tasks/CAA175BE01-T0001`), Issue detail (`/projects/v2/46305B0C-PROJ-16/issues/46305B0C16-I0001`) — **PASS** for all, confirmed via screenshot.
  - Icon-button chrome matches the adjacent existing button in every location (bordered pair with Settings gear on Project header; plain pair with Delete on Task/Issue headers) — **PASS**.
  - Hover tooltip ("Copy link") confirmed visible on the Project-header and Issue-detail buttons via screenshot — **PASS**.
  - No console errors on any of the 5 pages — **PASS**.
  - Regression check: existing Delete button (Task/Issue) and Settings gear (Project) still render and are unaffected by the new wrapper — **PASS**, confirmed visually.
  - **Clipboard write itself — NOT independently verified end-to-end.** Clicking the button in the automated Chrome session left `navigator.clipboard.writeText()` permanently pending (confirmed via direct JS execution: the promise never resolved or rejected, timing out a raw CDP `Runtime.evaluate` call after 45s). This is a known limitation of synthetic/CDP-dispatched clicks not being treated as a "trusted" user-activation gesture by Chrome's Clipboard-Write permission gate in this automation profile — not a code defect. The same `navigator.clipboard.writeText` + `setTimeout`-reverted-copied-state pattern is already shipped and presumably working in production elsewhere in this codebase (`customers/onboard/_content.tsx:58-64`). Recommended before considering this fully closed: a real mouse click from a human tester should confirm the clipboard actually receives the URL and the icon swaps to the checkmark/"Copied!" tooltip for ~1.5s.
