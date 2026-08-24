# 297: Copy Link — Task/Issue List-Row Hover Icon + Project Kebab Menu

**Created:** 2026-08-24
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced

---

## Overview

Follow-up to task 295 (Copy Link on the Project/Task/Issue detail-page headers). This task extends the same capability to two more surfaces the user explicitly asked for:

1. **Task and Issue List views** (`.../tasks`, `.../issues`, both `v2` and `legacy` variants) — a Copy Link icon appears on each row on hover, next to the title, letting a user copy that specific task/issue's link without opening it.
2. **Project listing kebab menu** (the "⋮" `MoreVertical` menu on each project card) — a "Copy Link" menu item, both on `/projects/v2` (`PortfolioCardMenu`) and `/projects/legacy` (`ProjectCardMenu`).

Both surfaces reuse task 295's `CopyLinkButton`/clipboard-write foundation rather than re-implementing it: `_copy-link-button.tsx` gets its clipboard logic extracted into a small `useCopyLink(url?)` hook, and `CopyLinkButton` gains an optional `url` prop (falls back to `window.location.href` when omitted, so the 5 existing task-295 call sites — Project/Task/Issue detail headers — are unaffected). A new sibling component, `CopyLinkMenuItem`, wraps the same hook in a menu-item shape for the kebab menus. This keeps the clipboard-write/copied-state logic in one place across all 8 call sites (5 from task 295 + 3 new) instead of duplicating `navigator.clipboard.writeText` + `setTimeout` reverts, per the same `nextjs-file-length-best-practices.md` "one concern per file, reused via extraction" guidance task 295 followed.

**Scope note on "listing":** the Task/Issue tabs each have three view modes — List, Board (kanban), Calendar. This task covers **List view rows only** ("each row" — table rows), matching the exact scoping precedent task 290 already established for this same file pair (`_list-view.tsx` / `_issue-list-view.tsx`): that task added real `<Link>` navigation to List-view row titles and explicitly left Board/Calendar cards untouched as a separate interaction model. Board/Calendar are out of scope here for the same reason.

**Scope note on "kebab menu":** only two components exist under this description — `PortfolioCardMenu` (v2 grid cards) and `ProjectCardMenu` (legacy grid cards). Legacy's separate `_project-list-view.tsx` (a table view mode for the *project* listing itself, not to be confused with the task/issue List view above) has no kebab menu at all today — nothing to extend there.

## Requirements

- [ ] `_copy-link-button.tsx`: extract clipboard-write + copied-state into an exported `useCopyLink(url?: string)` hook; `CopyLinkButton` keeps its exact current public behavior (default `window.location.href`) via the same hook, plus gains an optional `url` prop that overrides it (resolved relative to `window.location.origin`, so callers can pass either an absolute URL or a route-relative path like `${basePath}/tasks/${task.display_id}`).
- [ ] New `CopyLinkMenuItem` component (`_shared/_copy-link-menu-item.tsx`) using the same hook, rendered as a full-width menu-item button (icon + label) matching this codebase's existing menu-item classes exactly (`flex w-full items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-[12px] text-[#3A4565] cursor-pointer transition-colors hover:bg-[#F4F6FB]`). Shows `Link2`/"Copy Link" normally, swaps to `Check`/"Copied!" for ~1.5s after a successful copy, then auto-closes the menu via an `onDone` callback (matching a menu item's usual "click closes the menu" behavior, just delayed enough to show the confirmation). Always calls `preventDefault`/`stopPropagation` internally regardless of caller (harmless no-op for `PortfolioCardMenu`, required for `ProjectCardMenu` since its whole card is a `<Link>`).
- [ ] **Task List view** (`_list-view.tsx`): each row's Task Name cell gets a `CopyLinkButton` (small, `size=13`) right after the title `<Link>`, hidden by default and revealed on row hover (`opacity-0 group-hover/row:opacity-100`, plus `focus-visible:opacity-100` for keyboard users) — not on title-hover alone, since users may want to copy without triggering the title's own navigation-intent hover color. Uses `url={href}` (the same relative href already computed for the row's `<Link>`, from `getHref(task)`).
- [ ] **Issue List view** (`_issue-list-view.tsx`): identical treatment for each issue row — wrap the existing bare `<Link href={getHref(issue)}>` cell in a `flex items-center gap-1 min-w-0` container so the new `CopyLinkButton` can sit beside it as a same-cell sibling, without changing the grid's column count/widths.
- [ ] Both List views' outer row `<div>` gains a `group/row` (named group) class so the hover-reveal targets the whole row, not just the title `<Link>`'s own (unnamed) `group` — the title's existing `group-hover:text-[#007BFF]` hover-color effect must be unaffected (still fires only on title hover, not full-row hover).
- [ ] **`PortfolioCardMenu`** (v2): add a `CopyLinkMenuItem` right after the existing `{projectId && <button>View Project</button>}` block, inside the same `projectId &&` guard (no link to copy when there's no `project_id`), using `url={`${V2_ROUTES.PROJECTS_V2}/${projectId}/timeline`}` — the same path `openView` already navigates to.
- [ ] **`ProjectCardMenu`** (legacy): identical placement/guard, `url={`${V2_ROUTES.PROJECTS_LEGACY}/${projectId}`}` — the same path its own `openView` already navigates to.

## Out of Scope / Must-Not-Change

- Board view / Calendar view (`BoardView`, `CalendarView`, `IssueBoardView`, `IssueCalendarView` in `_project-detail.tsx`) — cards, not rows; not part of this ask, consistent with task 290's precedent.
- Legacy's `_project-list-view.tsx` (project-listing table view) — no kebab menu exists there today; out of scope since there's nothing to attach to.
- Any change to the existing menu items (View Project, Rename Project, Set Project Owner, Update Classification, Manage Collaborators, Delete Project) beyond inserting the one new item — their gating, order relative to each other, and handlers are unchanged.
- Task 295's 5 existing `CopyLinkButton` call sites (Project/Task/Issue detail headers) — `url` stays unset there, so behavior is byte-for-byte unchanged (still copies `window.location.href`).
- No new dependency — same `navigator.clipboard`, `Tooltip`, and `lucide-react` icons already in use.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_shared/_copy-link-button.tsx` | Modify | Extract `useCopyLink(url?)` hook (exported); `CopyLinkButton` gains optional `url` prop, delegates to the hook |
| `src/app/(hub)/projects/_shared/_copy-link-menu-item.tsx` | Create | `CopyLinkMenuItem` — menu-item-shaped wrapper around `useCopyLink` |
| `src/app/(hub)/projects/_shared/_list-view.tsx` | Modify | Row: `group/row` on outer div; `CopyLinkButton` beside the title `Link`, hover-revealed |
| `src/app/(hub)/projects/_shared/_issue-list-view.tsx` | Modify | Row: `group/row` on outer div; wrap title `Link` + new `CopyLinkButton` in a flex cell |
| `src/app/(hub)/projects/_v2-listing/_portfolio-card-menu.tsx` | Modify | Insert `CopyLinkMenuItem` after "View Project" |
| `src/app/(hub)/projects/_legacy-listing/_project-card-menu.tsx` | Modify | Insert `CopyLinkMenuItem` after "View Project" |

## Code Context

### `_copy-link-button.tsx` — current (post-task-295)
```tsx
export function CopyLinkButton({ className, size = 18 }: { className?: string; size?: number }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* no-op */ }
  };
  return ( <Tooltip>...<button onClick={handleCopy}>{copied ? <Check/> : <Link2/>}</button>...</Tooltip> );
}
```
Target shape:
```tsx
function resolveUrl(url?: string): string {
  if (!url) return window.location.href;
  try { return new URL(url, window.location.origin).href; } catch { return url; }
}

export function useCopyLink(url?: string) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(resolveUrl(url));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
      return true;
    } catch {
      return false;
    }
  };
  return { copied, copy };
}

export function CopyLinkButton({ className, size = 18, url }: { className?: string; size?: number; url?: string }) {
  const { copied, copy } = useCopyLink(url);
  return ( <Tooltip>...<button onClick={copy}>{copied ? <Check size={size}/> : <Link2 size={size}/>}</button>...</Tooltip> );
}
```

### New `_copy-link-menu-item.tsx`
```tsx
"use client";
import { Link2, Check } from "lucide-react";
import { useCopyLink } from "./_copy-link-button";

export function CopyLinkMenuItem({ url, onDone }: { url: string; onDone: () => void }) {
  const { copied, copy } = useCopyLink(url);
  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    await copy();
    setTimeout(onDone, 700);
  }
  return (
    <button
      type="button"
      onClick={handleClick}
      className="flex w-full items-center gap-2 border-none bg-transparent px-3 py-1.5 text-left text-[12px] text-[#3A4565] cursor-pointer transition-colors hover:bg-[#F4F6FB]"
    >
      {copied ? <Check size={13} className="text-[#177E48]" /> : <Link2 size={13} className="text-[#5F6A88]" />}
      {copied ? "Copied!" : "Copy Link"}
    </button>
  );
}
```

### `_list-view.tsx` Row — current title cell (`_list-view.tsx:684-706`)
```tsx
<div className={`flex items-center min-w-0 gap-1 ${DEPTH_INDENT[Math.min(depth, 6)] ?? "pl-0"}`}>
  {childrenCount > 0 ? ( <button onClick={onToggleExpand}>...</button> ) : ( <span className="w-5 h-5 shrink-0" /> )}
  <Link href={href} className="text-left min-w-0 cursor-pointer group flex-1">
    <span className="text-[13px] text-[#3A4565] truncate block group-hover:text-[#007BFF] transition-colors font-medium">
      {decodeHtmlEntities(task.title)}
    </span>
  </Link>
  {childrenCount > 0 && !isExpanded && ( <span>{childrenCount}</span> )}
</div>
```
Row's outer wrapper (`_list-view.tsx:655-657`) — add `group/row`:
```tsx
<div className={`grid ${gridClass} items-center gap-3 pl-4 pr-3 py-2.5 border-b border-[#EDF0F7] last:border-0 transition-colors group/row ${
  selected ? "bg-[#F0F7FF]" : "hover:bg-[#F0F7FF]/60"
}`}>
```
Insert after the `Link` (before the `childrenCount` badge):
```tsx
<CopyLinkButton
  url={href}
  size={13}
  className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 p-1 rounded text-[#94A0BE] hover:text-[#007BFF] hover:bg-[#EDF0F7] transition-colors shrink-0 cursor-pointer"
/>
```
`group/row` (named) is independent of the title `Link`'s own unnamed `group` — hovering elsewhere in the row (e.g. the due-date cell) reveals the copy icon via `group-hover/row:` without also triggering the title's `group-hover:text-[#007BFF]` (that still only fires on direct title hover, since it keys off the nearest **unnamed** `.group`, which is the `Link` itself).

### `_issue-list-view.tsx` Row — current (`_issue-list-view.tsx:388-423`)
```tsx
<div className={`grid ${GRID} items-center gap-3 pl-4 pr-3 py-2.5 border-b border-[#EDF0F7] last:border-0 transition-colors ${
  isSelected ? "bg-[#F0F7FF]" : "hover:bg-[#F0F7FF]/60"
}`}>
  {/* checkbox */}
  <Link href={getHref(issue)} className="text-left min-w-0 cursor-pointer group">
    <span className="text-[13px] text-[#3A4565] truncate block group-hover:text-[#007BFF] transition-colors font-medium">
      {decodeHtmlEntities(issue.title)}
    </span>
  </Link>
```
Add `group/row` to the outer `div` (same as task rows); wrap the `Link` + new button in a flex cell so the grid's 2nd column still holds exactly one child:
```tsx
<div className="flex items-center gap-1 min-w-0">
  <Link href={getHref(issue)} className="text-left min-w-0 cursor-pointer group flex-1">
    <span className="...">...</span>
  </Link>
  <CopyLinkButton url={getHref(issue)} size={13} className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 p-1 rounded text-[#94A0BE] hover:text-[#007BFF] hover:bg-[#EDF0F7] transition-colors shrink-0 cursor-pointer" />
</div>
```

### `PortfolioCardMenu` — current (`_v2-listing/_portfolio-card-menu.tsx:125-133`)
```tsx
{projectId && (
  <button type="button" onClick={openView} className="...">
    <Eye size={13} className="text-[#5F6A88]" /> View Project
  </button>
)}
```
Add immediately after:
```tsx
{projectId && (
  <CopyLinkMenuItem
    url={`${V2_ROUTES.PROJECTS_V2}/${projectId}/timeline`}
    onDone={() => setMenuPos(null)}
  />
)}
```
(Same guard/pattern for `ProjectCardMenu`, url `` `${V2_ROUTES.PROJECTS_LEGACY}/${projectId}` ``.)

## Implementation Steps

1. `_copy-link-button.tsx`: extract `useCopyLink(url?)`; add `url` prop to `CopyLinkButton`; keep the 5 existing task-295 call sites unchanged (they don't pass `url`).
2. Create `_copy-link-menu-item.tsx` per Code Context.
3. `_list-view.tsx`: add `group/row` to the Row wrapper; insert `CopyLinkButton` in the title cell; import `CopyLinkButton`.
4. `_issue-list-view.tsx`: add `group/row`; wrap the title `Link` in a flex cell with the new `CopyLinkButton`; import `CopyLinkButton`.
5. `_v2-listing/_portfolio-card-menu.tsx`: import `CopyLinkMenuItem`; insert after "View Project".
6. `_legacy-listing/_project-card-menu.tsx`: same insertion, legacy URL.
7. Run `npx tsc --noEmit` and `pnpm lint`.
8. Browser-verify (see Acceptance Criteria) — `pnpm dev`, both `v2` and `legacy` Task/Issue List views and both kebab menus.

## Acceptance Criteria

- [ ] Hovering a task row in List view (v2 and legacy) reveals a Copy Link icon next to the title; clicking it copies that task's absolute detail URL (not the currently-open page's URL) and briefly shows a copied state, without navigating.
- [ ] Same for issue rows in List view (v2 and legacy).
- [ ] The icon is invisible (not just transparent-but-clickable — actually hidden via opacity 0, still keyboard-reachable via `focus-visible`) until the row is hovered or the button receives keyboard focus.
- [ ] Hovering any other part of a row (status pill, due date, etc.) still reveals the copy icon (row-level hover) but does **not** turn the title text blue (that stays title-hover-only) — regression check on the `group`/`group/row` split.
- [ ] Clicking a row's title `Link` still navigates normally; middle-click/Cmd-click still opens in a new tab (task 290 behavior unaffected).
- [ ] On `/projects/v2`, each project card's kebab menu shows a "Copy Link" item (when the project has a `project_id`) that copies the same URL "View Project" would navigate to, shows "Copied!" briefly, then the menu closes.
- [ ] Same for `/projects/legacy`'s kebab menu, with the legacy URL.
- [ ] Existing kebab menu items (View Project, Rename, Set Owner, Update Classification, Manage Collaborators, Delete) still work exactly as before — regression check on both menus.
- [ ] Task 295's 5 original Copy Link buttons (Project/Task/Issue detail headers) still copy the current page URL exactly as before — regression check.
- [ ] `npx tsc --noEmit` passes clean.
- [ ] `pnpm lint` passes clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```
No test runner configured. Verification is type-check + lint + browser-based acceptance testing (`pnpm dev`) across: a project's Tasks List view (v2 + legacy), Issues List view (v2 + legacy), and both project-listing kebab menus (v2 + legacy) — plus a regression pass on task 295's original 5 buttons.

## Compatibility Touchpoints

- `CopyLinkButton`'s new `url` prop is optional and additive — every existing caller (the 5 task-295 sites) is unaffected.
- No API/schema/route changes — purely client-side.
- `useCopyLink` becomes a second export from `_copy-link-button.tsx`; no existing import of that module needs to change (`CopyLinkButton` is still the default/named export those callers use).

## Implementation Notes

### What Changed
- Implemented exactly per the plan — no deviations. `useCopyLink(url?)` extracted from `CopyLinkButton`; `CopyLinkButton` gained an optional `url` prop; new `CopyLinkMenuItem` built on the same hook; hover-reveal `CopyLinkButton` added to both List-view row types; "Copy Link" menu item added to both project kebab menus.
- Confirmed live that the trailing-edge icon placement (a consequence of the title `Link`'s pre-existing `flex-1`, from task 290) is a legitimate, common row-hover-action pattern — icon sits at a fixed position at the end of the Task Name/Issue Name column rather than immediately after variable-length title text, so it doesn't jump around row-to-row. Kept as designed rather than restructured.

### Files Changed
- `src/app/(hub)/projects/_shared/_copy-link-button.tsx` — extracted `useCopyLink(url?)`; `CopyLinkButton` gained `url` prop.
- `src/app/(hub)/projects/_shared/_copy-link-menu-item.tsx` — new `CopyLinkMenuItem` component.
- `src/app/(hub)/projects/_shared/_list-view.tsx` — `group/row` on the Row wrapper; `CopyLinkButton` in the Task Name cell.
- `src/app/(hub)/projects/_shared/_issue-list-view.tsx` — `group/row` on the row wrapper; title `Link` wrapped in a flex cell with the new `CopyLinkButton`.
- `src/app/(hub)/projects/_v2-listing/_portfolio-card-menu.tsx` — `CopyLinkMenuItem` inserted after "View Project".
- `src/app/(hub)/projects/_legacy-listing/_project-card-menu.tsx` — same insertion, legacy URL.

### Deviations From Plan
- None.

### Verification Run
- `npx tsc --noEmit` — PASS (no output/errors).
- `pnpm lint` — PASS (0 errors; 2 pre-existing warnings in `_checklist-tab.tsx`, unrelated to this task).
- Browser-based acceptance testing (`pnpm dev`, Super Admin session, Chrome via claude-in-chrome) —
  - Task List view (v2, `ABC Test Company Gantt`): hovering a row reveals the Copy Link icon at the trailing edge of the Task Name column; hovering a *different* cell in the same row (the Status pill) also reveals the icon (row-level `group/row` hover) but does **not** turn the title text blue — confirmed the named-group isolation from the title's own unnamed `group` works as designed. **PASS**.
  - Issue List view (v2, `Login button broken`): same hover-reveal behavior confirmed; clicking the icon does not navigate away from the Issues listing (button is a sibling of `Link`, not nested inside it). **PASS**.
  - `PortfolioCardMenu` (v2 `/projects/v2`, "Greydog Security" card): kebab menu shows "Copy Link" directly after "View Project"; clicking it closes the menu without navigating, page stays on the listing. **PASS**.
  - `ProjectCardMenu` (legacy `/projects/legacy`, "RCB & Associates" card): same — "Copy Link" present after "View Project"; clicking it does not trigger the whole-card `<Link>`'s navigation (confirms `preventDefault`/`stopPropagation` inside `CopyLinkMenuItem` works for the legacy card-is-a-Link case). **PASS**.
  - Regression: task 295's original Project-detail-header Copy Link button (`/projects/v2/46305B0C-PROJ-16/timeline`) still renders and shows its "Copy link" tooltip correctly — the `url` prop addition didn't affect callers that omit it. **PASS**.
  - No console errors observed across all of the above. **PASS**.
  - **Clipboard write itself — not independently re-verified end-to-end in this session**, for the same reason documented in task 295: synthetic/CDP-dispatched clicks aren't treated as a trusted user-activation gesture by Chrome's Clipboard-Write permission gate in this automation profile, so `navigator.clipboard.writeText()` hangs rather than resolving. Not re-tested here since the underlying clipboard-write code path (`useCopyLink`) is unchanged from task 295's already-flagged limitation — only its callers are new. A real mouse click from a human tester should confirm the clipboard receives the correct URL from each of the 3 new surfaces.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused/dead code: all 6 changed files read clean; `pnpm lint` confirms 0 errors (the 2 pre-existing `_checklist-tab.tsx` warnings are unrelated and predate this task).
- Naming is behavior-accurate and consistent with the codebase's existing convention (`useCopyLink` mirrors other `use*` hooks; `CopyLinkMenuItem` mirrors the "shape describes the component" naming already used for `CopyLinkButton`).
- No broad `any`/untyped escape hatches — `resolveUrl(url?: string)`, `useCopyLink(url?: string)`, and `CopyLinkMenuItem`'s `React.MouseEvent` param are all properly typed.
- Errors handled intentionally: `resolveUrl`'s `new URL()` parse failure and `useCopyLink`'s `navigator.clipboard.writeText` rejection are both caught and degrade silently (matches task 295's already-accepted "low-stakes convenience action" precedent — no new error-handling pattern introduced).
- Repeated logic (clipboard-write + copied-state) stayed in one place (`useCopyLink`) across all 4 consumers (`CopyLinkButton`, `CopyLinkMenuItem`) rather than being duplicated — matches the task doc's own stated DRY rationale.
- No secrets, credentials, or debug logging introduced.
- Project conventions followed: menu-item classes copied verbatim from the existing sibling buttons in both kebab menus (not reinvented); `group`/`group/row` named-group split confirmed live to correctly isolate row-hover from title-hover, matching the plan's stated intent.

### Deviations
- **Minor** — `_issue-list-view.tsx` calls `getHref(issue)` twice (once for the `Link`'s `href`, once for `CopyLinkButton`'s `url`) instead of computing it once into a local variable, unlike `_list-view.tsx`'s `Row`, which receives an already-computed `href` prop. `getHref` is a cheap, pure template-string function with no side effects, so this has no functional or performance impact — purely a style nit, not worth a follow-up on its own.
- No Medium or Major deviations. Scope boundaries were respected: Board/Calendar views, legacy's `_project-list-view.tsx`, and task 295's 5 original call sites are all untouched, consistent with the task doc's Out of Scope section and confirmed by the Implementation Notes' regression check.

### Required Fixes
- None (PASS).
