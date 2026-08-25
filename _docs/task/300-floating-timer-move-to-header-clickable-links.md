# 300: Floating Timer → Header Dropdown + Clickable Task/Project Links

**Created:** 2026-08-25
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Completed
**Completed:** 2026-08-25

---

## Overview

Two related changes to the hub-wide timer widget (`TimerFloatingWidget`, task 209/234/267/293), reported via screenshot:

1. **Relocate the timer from a fixed bottom-right floating pill to the top header, beside the Notification Bell icon.** Today the pill (`fixed bottom-6 right-6 z-40` in `timer-floating-widget.tsx:52`) floats over the bottom-right corner of every `/v2/*` page and its expanded panel opens *upward* from there — the screenshot shows it overlapping in-page controls (e.g. a "Post comment" button and video content) on pages with content near that corner. Moving it into `V2HubHeader` (mounted once, hub-wide, on every page already) removes the overlap entirely — nothing in the main scroll area sits under the header.
2. **Make the task/issue title and the project name inside the expanded timer panel real links.** Today they're plain `<p>` text (`timer-floating-widget.tsx:78-83`). They should navigate to that task's/issue's detail page and the project's detail page respectively, using standard `<Link>` (anchor) semantics — a normal click navigates in the same tab, and the browser's native Ctrl/Cmd+click (or middle-click) opens it in a new tab, exactly like the existing List-view row links (task 290) and Copy-Link precedents (task 295/297) already do elsewhere in this codebase. No custom key-handling is needed — that behavior is free once the element is a real `<Link href>` instead of a `<p>`.

This is v2-only (`(hub)/_components/*`, mounted by `V2HubShell`). The old `src/components/hub/hub-header.tsx` is dead code, only referenced by the unused `src/app/_hub_(OLD)/layout.tsx` — not in scope.

### Why the panel currently can't just print `<Link>`s as-is

`ActiveTimerRow` (`timer-context.tsx:6-20`), populated by `attachTaskTitle()` (`src/lib/timer/serialize.ts`, shared by all 7 `/api/v2/timer/**` routes), only carries the task/issue **title** and the project's **name** — not the display IDs the detail-page routes actually key on. Per this codebase's routing convention (`/projects/v2/[projectId]/tasks/[taskId]` and `/projects/v2/[projectId]/issues/[issueId]` both resolve `projectId` against `projects.project_id`, the human-readable display column, and `taskId`/`issueId` against `tasks.display_id`/`issues.display_id` — confirmed by reading both detail page.tsx files, which `.eq("project_id", projectId)` and `.eq("display_id", taskId/issueId)`), building a working href requires the timer row to also carry `projects.project_id`, and whichever of `tasks.display_id` / `issues.display_id` applies. `attachTaskTitle` already does one shared Supabase round-trip per field group (title, project name) for both entity kinds — extending its existing `.select()` calls to also pull `display_id`/`project_id` covers all 7 routes with a single change, no per-route edits needed.

## Requirements

- [ ] The timer trigger (compact pill/icon showing elapsed time or break countdown) renders inside `V2HubHeader`'s right-controls group, immediately to the left of `NotificationBell`, sized to fit the `h-16` header (not the larger `h-11`/`w-11` floating-pill dimensions).
- [ ] Clicking the trigger opens a dropdown panel anchored *below* it (`absolute right-0 top-full`, matching the existing user-menu dropdown pattern in `v2-hub-sidebar.tsx:117-125`), not a panel that floats independently over page content. Click-outside-to-close keeps working (existing `widgetRef` + `mousedown` listener logic is reused, just re-anchored).
- [ ] The floating bottom-right pill and its old fixed positioning are fully removed — no leftover overlay anywhere on `/v2/*` pages.
- [ ] All existing panel functionality is preserved exactly: pause/resume, stop, the 3 break buttons, break countdown + "End break", the "No timer running…" empty state, and their tooltips.
- [ ] When the active timer is on a task, the task title inside the panel is a `<Link>` to `/projects/v2/{project_display_id}/tasks/{task_display_id}`. When it's on an issue, the issue title links to `/projects/v2/{project_display_id}/issues/{issue_display_id}`. The link has a visible hover state (text color shift, per this repo's UI Polish conventions) and truncates the same as today.
- [ ] The project name line below the title is a `<Link>` to `/projects/v2/{project_display_id}/timeline` (the same target `CopyLinkMenuItem`'s "View Project" convention already uses per task 297), with the same hover treatment.
- [ ] If a display ID needed to build a link is ever `null` (e.g. legacy data mid-migration), that line falls back to today's plain, non-clickable text — never a broken/empty `href`.
- [ ] Ctrl/Cmd+click (and middle-click) on either link opens it in a new tab; a plain click navigates normally in the current tab. (Native `<Link>`/`<a>` behavior — no bespoke handler needed.)
- [ ] `ActiveTimerRow` and `attachTaskTitle`'s return type both grow additive, nullable fields only — every other current consumer (`timer-timeline-popover.tsx` ×2, `_task-timer-button.tsx`, `projects-old` variants) keeps compiling and behaving identically.

## Out of Scope / Must-Not-Change

- Break-button grid, break countdown UI/logic, `TimerProvider`'s public API (`startTimer`/`pauseTimer`/`resumeTimer`/`stopTimer`/`startBreak`/`cancelBreak`) — unchanged.
- `timer-timeline-popover.tsx` (both `legacy` and `v2` project-detail variants) and `_task-timer-button.tsx` — different components, not touched, just kept type-compatible.
- The dead v1 `src/components/hub/hub-header.tsx` / `src/app/_hub_(OLD)/` tree — not part of the app users see; not touched.
- `NotificationBell`, `HelpCircle` button, and the Ops Chat toggle — unchanged apart from the new sibling element inserted next to them.
- No new dependency — `next/link` is already used throughout this codebase for entity links (task 290, 297).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/timer/serialize.ts` | Modify | `attachTaskTitle`: select `display_id` alongside `title` on the tasks/issues query, and `project_id` alongside `name` on the projects query; return `task_display_id`, `issue_display_id`, `project_display_id` (all nullable) in addition to the existing fields. |
| `src/app/(hub)/_components/timer-context.tsx` | Modify | Widen `ActiveTimerRow` with the 3 new nullable fields from `attachTaskTitle`'s return type. |
| `src/app/(hub)/_components/timer-floating-widget.tsx` → renamed to `src/app/(hub)/_components/timer-header-widget.tsx` | Modify + Rename | Drop the `fixed bottom-6 right-6` overlay wrapper in favor of a `relative` trigger + `absolute right-0 top-full` dropdown (header-docked sizing); task/issue title and project name become `Link`s built from the new display-id fields, with a plain-text fallback when a display id is missing. Default export renamed `TimerFloatingWidget` → `TimerHeaderWidget`. |
| `src/app/(hub)/_components/v2-hub-header.tsx` | Modify | Import `TimerHeaderWidget`; render it in the "Right controls" group immediately before `<NotificationBell />`. |
| `src/app/(hub)/_components/v2-hub-shell.tsx` | Modify | Remove the old `<TimerFloatingWidget />` mount and its import (now rendered inside `V2HubHeader` instead); `TimerProvider` keeps wrapping `shell` since the header — several levels deep — still needs `useTimer()`. |

## Code Context

### `src/lib/timer/serialize.ts` — current
```ts
export async function attachTaskTitle<T extends { task_id: string | null; issue_id: string | null; project_id: string | null }>(
  supabase: SupabaseClient,
  timer: T | null
): Promise<(T & { task_title: string | null; issue_title: string | null; project_name: string | null }) | null> {
  if (!timer) return null;

  const titleQuery = timer.task_id
    ? supabase.from("tasks").select("title").eq("id", timer.task_id).maybeSingle()
    : timer.issue_id
    ? supabase.from("issues").select("title").eq("id", timer.issue_id).maybeSingle()
    : null;
  const projectQuery = timer.project_id
    ? supabase.from("projects").select("name").eq("id", timer.project_id).maybeSingle()
    : null;

  const [titleResult, projectResult] = await Promise.all([
    titleQuery ?? Promise.resolve({ data: null }),
    projectQuery ?? Promise.resolve({ data: null }),
  ]);

  const project_name = (projectResult.data as { name?: string } | null)?.name ?? null;
  const title = (titleResult.data as { title?: string } | null)?.title ?? null;

  if (timer.task_id) return { ...timer, task_title: title, issue_title: null, project_name };
  if (timer.issue_id) return { ...timer, task_title: null, issue_title: title, project_name };
  return { ...timer, task_title: null, issue_title: null, project_name };
}
```

Target shape (additive fields only — `title`/`project_id`(FK)/`project_name` semantics unchanged):
```ts
export async function attachTaskTitle<T extends { task_id: string | null; issue_id: string | null; project_id: string | null }>(
  supabase: SupabaseClient,
  timer: T | null
): Promise<(T & {
  task_title: string | null; task_display_id: string | null;
  issue_title: string | null; issue_display_id: string | null;
  project_name: string | null; project_display_id: string | null;
}) | null> {
  if (!timer) return null;

  const titleQuery = timer.task_id
    ? supabase.from("tasks").select("title, display_id").eq("id", timer.task_id).maybeSingle()
    : timer.issue_id
    ? supabase.from("issues").select("title, display_id").eq("id", timer.issue_id).maybeSingle()
    : null;
  const projectQuery = timer.project_id
    ? supabase.from("projects").select("name, project_id").eq("id", timer.project_id).maybeSingle()
    : null;

  const [titleResult, projectResult] = await Promise.all([
    titleQuery ?? Promise.resolve({ data: null }),
    projectQuery ?? Promise.resolve({ data: null }),
  ]);

  const projectRow = projectResult.data as { name?: string; project_id?: string } | null;
  const project_name = projectRow?.name ?? null;
  const project_display_id = projectRow?.project_id ?? null;

  const titleRow = titleResult.data as { title?: string; display_id?: string } | null;
  const title = titleRow?.title ?? null;
  const display_id = titleRow?.display_id ?? null;

  if (timer.task_id) return { ...timer, task_title: title, task_display_id: display_id, issue_title: null, issue_display_id: null, project_name, project_display_id };
  if (timer.issue_id) return { ...timer, task_title: null, task_display_id: null, issue_title: title, issue_display_id: display_id, project_name, project_display_id };
  return { ...timer, task_title: null, task_display_id: null, issue_title: null, issue_display_id: null, project_name, project_display_id };
}
```

### `timer-context.tsx:6-20` — `ActiveTimerRow`, widen additively
```ts
export type ActiveTimerRow = {
  id: string;
  task_id: string | null;
  task_title: string | null;
  task_display_id: string | null;      // new
  issue_id: string | null;
  issue_title: string | null;
  issue_display_id: string | null;     // new
  project_id: string | null;
  project_name: string | null;
  project_display_id: string | null;   // new
  status: "running" | "paused" | null;
  accumulated_seconds: number;
  segment_started_at: string | null;
  break_type: BreakType | null;
  break_started_at: string | null;
  break_duration_minutes: number | null;
};
```

### `timer-floating-widget.tsx` → `timer-header-widget.tsx` — repositioning

Current outer wrapper (`:48-52`, panel-then-trigger, `flex-col items-end`, `fixed`):
```tsx
<div ref={widgetRef} className="fixed bottom-6 right-6 z-40 flex flex-col items-end gap-2.5">
  {open && ( <div className="w-[272px] ..."> ... </div> )}
  <Tooltip> <TooltipTrigger render={ <button className="... h-11 px-3.5 ..."> ... </button> } /> ... </Tooltip>
</div>
```

Target — `relative` trigger-first wrapper, dropdown anchored below (mirrors `v2-hub-sidebar.tsx`'s user-menu pattern), trigger resized for the `h-16` header:
```tsx
<div ref={widgetRef} className="relative">
  <Tooltip>
    <TooltipTrigger render={
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? "Close timer widget" : "Open timer widget"}
        className={
          onBreak
            ? "flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#FFF3D6] text-[#8A5A00] hover:bg-[#FCE9B8] transition-colors cursor-pointer"
            : hasEntity
            ? "flex items-center gap-1.5 h-8 px-3 rounded-full bg-[#E5F1FF] text-[#0063D6] hover:bg-[#D6E9FF] transition-colors cursor-pointer"
            : "flex items-center justify-center w-8 h-8 rounded-full bg-[#071133] text-white hover:bg-[#0C1B4A] transition-colors cursor-pointer"
        }
      >
        {/* same three branches as today: break icon+countdown / Timer icon+HH:MM:SS / bare Timer icon */}
      </button>
    } />
    <TooltipContent side="bottom">{open ? "Minimize" : "Timer & breaks"}</TooltipContent>
  </Tooltip>

  {open && (
    <div className="absolute right-0 top-full mt-2 w-[272px] rounded-[14px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] overflow-hidden z-40">
      {/* header row, entity block, break controls — unchanged from today except the Link swap below */}
    </div>
  )}
</div>
```
Notes for the implementer:
- `z-40` is carried over unchanged — the original in-code comment explains it's deliberately *below* the shared `Tooltip` component's portal (`z-50`) so break-button tooltips render in front of the panel; that constraint is unaffected by the position change and the comment should move with the code, reworded for the new anchor.
- `TooltipContent side="left"` → `side="bottom"` for the trigger's own tooltip (it now sits in a header row, not a corner) — the panel's *internal* tooltips (Minimize button, break-type buttons) keep their existing `side="left"`/`"top"`.
- The "no entity" idle state's icon-only button becomes `w-8 h-8 rounded-full` (was `w-11 h-11`), matching the sizing of `V2HubHeader`'s existing Ops Chat icon button (`v2-hub-header.tsx:119-131`, also `w-8 h-8 rounded-full`) for visual consistency with its new header neighbors.

### Entity block (`:71-88`) — title/project become conditional `Link`s

Current:
```tsx
<div className="flex-1 min-w-0">
  <p className="text-[12px] font-medium text-[#3A4565] truncate">
    {decodeHtmlEntities(timer!.task_title ?? timer!.issue_title ?? "Untitled item")}
  </p>
  {timer!.project_name && (
    <p className="text-[10.5px] text-[#8A93AC] truncate">{timer!.project_name}</p>
  )}
</div>
```

Target:
```tsx
const entityHref =
  timer!.project_display_id && timer!.task_id && timer!.task_display_id
    ? `${V2_ROUTES.PROJECTS_V2}/${timer!.project_display_id}/tasks/${timer!.task_display_id}`
    : timer!.project_display_id && timer!.issue_id && timer!.issue_display_id
    ? `${V2_ROUTES.PROJECTS_V2}/${timer!.project_display_id}/issues/${timer!.issue_display_id}`
    : null;
const projectHref = timer!.project_display_id
  ? `${V2_ROUTES.PROJECTS_V2}/${timer!.project_display_id}/timeline`
  : null;

// ...
<div className="flex-1 min-w-0">
  {entityHref ? (
    <Link href={entityHref} className="text-[12px] font-medium text-[#3A4565] hover:text-[#007BFF] truncate block transition-colors">
      {decodeHtmlEntities(timer!.task_title ?? timer!.issue_title ?? "Untitled item")}
    </Link>
  ) : (
    <p className="text-[12px] font-medium text-[#3A4565] truncate">
      {decodeHtmlEntities(timer!.task_title ?? timer!.issue_title ?? "Untitled item")}
    </p>
  )}
  {timer!.project_name && (
    projectHref ? (
      <Link href={projectHref} className="text-[10.5px] text-[#8A93AC] hover:text-[#007BFF] truncate block transition-colors">
        {timer!.project_name}
      </Link>
    ) : (
      <p className="text-[10.5px] text-[#8A93AC] truncate">{timer!.project_name}</p>
    )
  )}
</div>
```
Add `import Link from "next/link";` and `import { V2_ROUTES } from "@/config/constants";` to the file's imports.

### `v2-hub-header.tsx` — "Right controls" group (`:108-132`)
```tsx
<div className="flex items-center gap-3 flex-1 justify-end">
  <TimerHeaderWidget />              {/* new */}
  <NotificationBell />
  <button aria-label="Help" ...>...</button>
  <button onClick={onOpenChat} ...>...</button>
</div>
```
Add `import TimerHeaderWidget from "./timer-header-widget";`.

### `v2-hub-shell.tsx` — remove the old mount
```tsx
// remove: import TimerFloatingWidget from "./timer-floating-widget";
// remove the trailing comment block + wrapper return:
return (
  <TimerProvider>
    {shell}
    <TimerFloatingWidget />   // ← delete this line
  </TimerProvider>
);
```
becomes:
```tsx
// TimerProvider still wraps the whole shell — V2HubHeader (rendered inside `shell`, several
// levels deep) needs useTimer() for the header-docked timer widget. Task 209/293: timer +
// break tracking is hub-wide across every role.
return <TimerProvider>{shell}</TimerProvider>;
```

## Implementation Steps

1. `src/lib/timer/serialize.ts`: widen `attachTaskTitle`'s selects and return type per Code Context. This is the single shared point all 7 `/api/v2/timer/**` routes go through — no per-route edits needed.
2. `src/app/(hub)/_components/timer-context.tsx`: widen `ActiveTimerRow` with the 3 new nullable fields.
3. Rename `timer-floating-widget.tsx` → `timer-header-widget.tsx`; rename the default export `TimerFloatingWidget` → `TimerHeaderWidget`; apply the repositioning + Link changes from Code Context, keeping every other visual/behavioral detail (colors, break grid, tooltips, empty state, click-outside) identical to today.
4. `src/app/(hub)/_components/v2-hub-header.tsx`: import `TimerHeaderWidget`, insert it before `<NotificationBell />` in the right-controls group.
5. `src/app/(hub)/_components/v2-hub-shell.tsx`: remove the old import + `<TimerFloatingWidget />` mount; keep `TimerProvider` wrapping `shell`.
6. Grep the repo for any other import of `./timer-floating-widget` (besides `v2-hub-shell.tsx`) to make sure the rename doesn't leave a dangling import.
7. `npx tsc --noEmit` — confirm the widened `ActiveTimerRow`/`attachTaskTitle` types don't break `timer-timeline-popover.tsx` (×2) or any other consumer.
8. `pnpm lint`.
9. Browser-verify (see Acceptance Criteria) with `pnpm dev`, developer-role session with an active timer running on both a task and (separately) an issue.

## Acceptance Criteria

- [ ] With a timer running, the pill showing elapsed time appears in the header row, immediately left of the Notification Bell — not floating over page content anywhere.
- [ ] Clicking the pill opens a dropdown directly below it; clicking outside (or the Minimize button) closes it. No page content is ever covered by the collapsed pill (it's docked in the header, not overlaid).
- [ ] Scrolling a page with content near the bottom-right corner (e.g. the Issue Detail comments panel from the screenshot) no longer shows the timer overlapping any button or content.
- [ ] Pause/Resume, Stop, all 3 break buttons, break countdown, "End break", and the "No timer running…" empty state all work exactly as before.
- [ ] With a task timer active: the task title in the panel is a link; a plain click navigates to that task's detail page (`/projects/v2/{project_id}/tasks/{task.display_id}`); Ctrl/Cmd+click (or middle-click) opens it in a new tab instead.
- [ ] With an issue timer active: same, linking to the issue's detail page.
- [ ] The project name line links to that project's detail page (`/projects/v2/{project_id}/timeline`); same click/new-tab behavior.
- [ ] Both links show a visible hover color change and a pointer cursor.
- [ ] `timer-timeline-popover.tsx` (both `legacy` and `v2` project-detail task pages) still render correctly — regression check on the widened shared type.
- [ ] `npx tsc --noEmit` passes clean.
- [ ] `pnpm lint` passes clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then browser-check as a developer-role account:
           # - start a task timer, confirm header placement + working links (plain click + Cmd/Ctrl+click)
           # - start an issue timer, confirm the issue link variant
           # - visit a page with bottom-right content (e.g. an Issue Detail page) and confirm no overlap
           # - exercise pause/resume/stop/breaks to confirm no regression
```
No test runner configured. Verification is type-check + lint + browser-based acceptance testing.

## Compatibility Touchpoints

- `attachTaskTitle`'s return type gains 3 new nullable fields — purely additive; every existing consumer that destructures/spreads the result keeps compiling.
- `ActiveTimerRow` gains the same 3 fields — `timer-timeline-popover.tsx` (×2 route variants) and `_task-timer-button.tsx` consume `useTimer()`/`ActiveTimerRow` too; confirm via `tsc` they don't need changes (they shouldn't, since they don't destructure exhaustively).
- File rename (`timer-floating-widget.tsx` → `timer-header-widget.tsx`): only one other file imports it (`v2-hub-shell.tsx`), and that import is being removed in this same task, replaced by `v2-hub-header.tsx`'s new import — no dangling references expected, but step 6 above double-checks.
- No API route, schema, or migration changes — this task only widens two existing Supabase `.select()` calls (adding columns already present on `tasks`/`issues`/`projects`) inside `attachTaskTitle`.

## Implementation Notes

### What Changed
- Implemented per the plan, no functional deviations. `attachTaskTitle` now also selects and returns `task_display_id`/`issue_display_id`/`project_display_id`; `ActiveTimerRow` widened to match.
- `timer-floating-widget.tsx` renamed to `timer-header-widget.tsx`, default export renamed `TimerFloatingWidget` → `TimerHeaderWidget`. The `fixed bottom-6 right-6` overlay wrapper was replaced with a `relative` trigger + `absolute right-0 top-full mt-2` dropdown panel (same anchoring pattern as `v2-hub-sidebar.tsx`'s user menu). Trigger resized from `h-11`/`w-11` to `h-8`/`w-8` to fit the header row, matching the Ops Chat icon button's existing `w-8 h-8` sizing. Trigger's own tooltip moved from `side="left"` to `side="bottom"`; the panel's internal tooltips (Minimize, break buttons) kept their original sides.
- Task/issue title and project name inside the panel are now `next/link` `Link`s to `/projects/v2/{project_display_id}/tasks|issues/{display_id}` and `/projects/v2/{project_display_id}/timeline` respectively, each with a conditional plain-text fallback when the needed display id is `null`. No custom click/keyboard handling was added — Ctrl/Cmd+click-opens-new-tab is native `<a>` behavior once the element is a real link.
- `v2-hub-header.tsx`: imported `TimerHeaderWidget`, rendered immediately before `<NotificationBell />` in the right-controls group.
- `v2-hub-shell.tsx`: removed the old `TimerFloatingWidget` import and its separate mount; `TimerProvider` now wraps `shell` directly (`return <TimerProvider>{shell}</TimerProvider>;`) since the widget is now rendered inside the header rather than as a shell-level sibling.
- Confirmed via grep that no other file imported `timer-floating-widget`/`TimerFloatingWidget` before deleting the old file — no dangling references.

### Files Changed
- `src/lib/timer/serialize.ts` — `attachTaskTitle` widened to select/return the 3 new display-id fields.
- `src/app/(hub)/_components/timer-context.tsx` — `ActiveTimerRow` widened with the 3 new nullable fields.
- `src/app/(hub)/_components/timer-header-widget.tsx` — new file (rename of `timer-floating-widget.tsx`), header-docked dropdown positioning + Link-ified title/project.
- `src/app/(hub)/_components/timer-floating-widget.tsx` — deleted (renamed).
- `src/app/(hub)/_components/v2-hub-header.tsx` — mounts `TimerHeaderWidget` beside `NotificationBell`.
- `src/app/(hub)/_components/v2-hub-shell.tsx` — removed the old floating-widget mount; `TimerProvider` simplified to wrap `shell` directly.

### Deviations From Plan
- None — matches the task document's Proposed File Changes, Code Context, and Implementation Steps.
- Pre-existing `impeccable` design-hook findings (literal font-size values on the timer panel text, carried over byte-for-byte from the original file, and a few pre-existing literal colors/font-sizes on unrelated lines of `v2-hub-header.tsx`, e.g. the OpsChat gradient) fired on edit. All are pre-existing conditions unrelated to this task's scope (header relocation + link-ification only) and were left unchanged per this codebase's established precedent (task 299) of not retrofitting unrelated shipped styling while making a scoped change.

### Verification Run
- `npx tsc --noEmit` — PASS (no output, no errors).
- `pnpm lint` — PASS (0 errors; 2 pre-existing `no-unused-vars` warnings in an unrelated file, `onboarding-workspace/_checklist-tab.tsx`, not touched by this task).
- `pnpm dev` browser-based acceptance testing — SKIPPED. The Chrome browser-automation extension was not connected in this environment ("Browser extension is not connected"). Recommend the human reviewer, with a running timer as a developer-role account: (1) confirm the pill renders in the header immediately left of the Notification Bell with no floating overlay anywhere on the page, (2) click it and confirm the dropdown opens below it and closes on outside-click/Minimize, (3) confirm pause/resume/stop/breaks still work, (4) start a task timer and confirm the task title link navigates correctly on plain click and opens a new tab on Cmd/Ctrl+click, (5) repeat for an issue timer, (6) confirm the project name link navigates to `/projects/v2/{project_id}/timeline`, (7) spot-check a `legacy`/`v2` project's `_timer-timeline-popover.tsx` for a visual regression (should be none — that component doesn't consume the widened fields).

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused/dead code: `pnpm lint` reports 0 errors; the file rename left no dangling imports (`grep` for `timer-floating-widget`/`TimerFloatingWidget` across `src/` returns nothing).
- No broad `any`/untyped escape hatches — the new `as { name?: string; project_id?: string } | null` / `as { title?: string; display_id?: string } | null` casts in `serialize.ts` follow the exact narrow-cast pattern the original function already used for `{ name?: string }`, not a new pattern.
- No deep nesting — the `entityHref` ternary chain in `timer-header-widget.tsx` is flat (task branch / issue branch / null), consistent with this codebase's existing ternary-chain style (e.g. `attachTaskTitle` itself, `getBreadcrumb`'s prefix match).
- Naming is behavior-accurate: `entityHref`/`projectHref` describe what they hold; `TimerHeaderWidget` (renamed from `TimerFloatingWidget`) now matches what the component actually is post-move.
- Repeated logic: none introduced; the Link/plain-text fallback pattern is duplicated exactly twice (task/issue title, project name) — that's normal JSX branching, not a maintenance-risk repetition worth extracting.
- Errors handled intentionally: no new error paths — a missing display id degrades to plain non-clickable text rather than a broken link or thrown error, per the task doc's explicit fallback requirement.
- No secrets, credentials, or debug logging introduced.
- Project conventions followed: Tailwind-only styling on every new/changed element (no `style={{}}` added); `next/link` used for the new links, matching the established convention from tasks 290/295/297; route construction reuses `V2_ROUTES.PROJECTS_V2` rather than a hardcoded string; the dropdown-anchoring pattern (`relative` + `absolute right-0 top-full`) was copied from `v2-hub-sidebar.tsx`'s existing user-menu dropdown rather than invented fresh.
- Fixed one stale doc comment during this pass: `serialize.ts`'s file-level comment still called the consumer the "floating widget" after the whole point of this task was to stop it floating — updated to "header timer widget" and noted the task 300 addition, directly in scope since it's documentation of the exact function this task modified.

### Deviations
- **Minor** — pre-existing `impeccable` design-hook findings (literal font-size values in the timer panel, carried over byte-for-byte from the original `timer-floating-widget.tsx`; a few pre-existing literal colors/font-sizes on unrelated lines of `v2-hub-header.tsx`, e.g. the OpsChat gradient and breadcrumb text) fired on edit and were left unchanged. These predate this task and are unrelated to its scope (header relocation + link-ification), matching this codebase's established precedent (task 299) of not retrofitting unrelated shipped styling while making a scoped change.
- No Medium or Major deviations. Scope boundaries were respected: `TimerProvider`'s public API, break-button logic, `timer-timeline-popover.tsx` (both variants), `_task-timer-button.tsx`, and the dead v1 `hub-header.tsx`/`_hub_(OLD)` tree are all untouched, confirmed by the Implementation Notes' file list and by grepping for any stray reference to the removed `TimerFloatingWidget` name.

### Required Fixes
- None (PASS).

## Post-Implementation Revision (2026-08-25)

After reviewing the shipped trigger button, the user requested a follow-up visual change directly (not a new task doc): the trigger's persistent colored-pill background (amber on break / blue with entity / navy idle) and its inline `HH:MM:SS`/`MM:SS` elapsed-time text were replaced with a plain icon button matching `NotificationBell`'s exact styling (`p-1.5 rounded-lg text-[#5F6A88] hover:bg-[#F4F6FB] hover:text-[#3A4565]` — no background except on hover), plus a small corner status dot on the `Timer` icon: `bg-emerald-500` when a timer is active (running or manually paused), `bg-[#FB914E]` (the same brand-orange already used for `NotificationBell`'s unread badge) when on break, and no dot at all when no timer is running. The elapsed time itself is unchanged — still visible inside the expanded dropdown panel, which is otherwise untouched by this revision.

- `src/app/(hub)/_components/timer-header-widget.tsx` — trigger `<button>`/status-dot markup replaced per above.
- Verification: `npx tsc --noEmit` — PASS. `pnpm lint` — PASS (same 2 pre-existing unrelated warnings as before).
- Browser verification still not performed in this environment (Chrome extension not connected) — carries forward the same manual-check recommendation from the Implementation Notes above, now also covering: icon-only idle state (no dot), green dot while a timer runs, orange dot while on break.

**Two further micro-adjustments requested live against the shipped screenshot, same day:**
- **Dot size/position** — shrunk the status dot from `w-2.5 h-2.5` / `-top-0.5 -right-0.5` (overhanging past the icon's edge, `border-[1.5px]`) to `w-1.75 h-1.75` / `top-0.5 right-0.5` (sitting closer in, on the icon's corner, `border` (1px)) — matches the sizing convention of the existing plain presence-dot in `v2-hub-sidebar.tsx` (`w-1.75 h-1.75 border-[1.5px]`) rather than the larger count-badge convention it was copied from initially.
- **Tooltip side** — the trigger's own `TooltipContent` changed from `side="bottom"` to `side="left"`, so it opens toward the breadcrumb/search side of the header instead of downward into the dropdown-panel's own space, avoiding the overlap the user flagged in a screenshot.
- `npx tsc --noEmit` — PASS after each change. `pnpm lint` — re-run after both, PASS (same 2 pre-existing unrelated warnings).
