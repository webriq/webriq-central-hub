# 362: Visible Scrollbar on Dev / PM / Admin Dashboard — Hub Main Scroll Container

**Created:** 2026-09-14
**Priority:** LOW
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

The Dev dashboard (`_dev/_dev-dashboard.tsx`) and the PM/Admin dashboard (`_components/pm-dashboard.tsx`
— `AdminDashboard` just renders `PMDashboard`, so "PM or Admin Dashboard" is literally the same
component/page) sit on light backgrounds (`bg-[#F4F6FB]`). The page itself doesn't scroll — the
actual scroll container for every `(hub)` route, including these two dashboards, is the shared
`<main className="flex-1 overflow-y-auto">` in `V2HubShell` (`_components/v2-hub-shell.tsx:56`).

`globals.css` forces classic (non-overlay) WebKit scrollbars app-wide, but the default thumb color
is a translucent **white** (`oklch(1 0 0 / 12%)`) tuned for the Hub's dark surfaces — invisible on a
light content area. This is the exact same root cause task 355 fixed for the Tasks/Issues list
views and the Time Log modal: the codebase already has `.scrollbar-light`
(`globals.css:251-254`, widened to 10px by task 355) for exactly this situation, it's just not
applied to the main content scroll container. When a dashboard's content is tall enough to scroll,
users currently can't tell it's scrollable or where they are in it.

This task applies `.scrollbar-light` to that one shared scroll container. Per the user's explicit
scope decision: the fix targets the **content scroll area only** — the header (`V2HubHeader` and
its children, e.g. the notification-bell dropdown's own internal scroll) and the sidebar nav
(`v2-hub-sidebar.tsx`'s `overflow-y-auto`, which sits on the Hub's dark sidebar surface and is
already visible against that background) are explicitly left untouched.

Because `<main>` is shared by every `(hub)` route (not a dashboard-only wrapper), this change is
technically hub-wide, not scoped to a dashboard-only container — there is no dashboard-specific
scroll wrapper today. The user confirmed this is acceptable (it was presented and chosen as the
recommended option): the rest of the Hub's page content is light-themed the same way the
dashboards are, so a visible grey scrollbar there is consistent, not a regression.

## Requirements

- [ ] The Hub's main content scroll container (`<main>` in `V2HubShell`) shows a clearly visible
      (grey, not invisible white-on-white) scrollbar when its content overflows.
- [ ] Verified specifically on: the Dev dashboard (`/dashboard` as a developer) and the PM/Admin
      dashboard (`/dashboard` as a pm or admin) — content tall enough to require scrolling shows the
      scrollbar and it can be dragged.
- [ ] Uses the established `.scrollbar-light` utility (no new bespoke scrollbar CSS).
- [ ] Header (`V2HubHeader`, notification-bell dropdown, OpsChat panel) is untouched — no scrollbar
      styling changes there.
- [ ] Sidebar nav (`v2-hub-sidebar.tsx`) is untouched — it keeps the app-wide default scrollbar
      (correct against its dark background).
- [ ] No visual regression to any other `(hub)` route that scrolls inside the same `<main>` (this is
      a shared container — the change is necessarily hub-wide).

## Out of Scope / Must-Not-Change

- Any redesign of the dashboards themselves (no new max-height/internal-scroll panels inside
  `pm-dashboard.tsx` or the Dev dashboard's side-rail cards) — this task fixes the *page-level*
  scrollbar visibility only, not per-panel scroll regions. (A per-panel capped-scroll treatment was
  considered and explicitly not chosen — see conversation.)
- `V2HubHeader` and its descendants (`notification-bell.tsx`'s internal `overflow-y-auto` dropdown,
  `ops-chat.tsx`'s message list) — excluded per the user's explicit instruction.
- `v2-hub-sidebar.tsx`'s nav scroll — dark surface, current default scrollbar is already correct
  there; do not add `.scrollbar-light` to it.
- The global `::-webkit-scrollbar` rule (`globals.css:240-243`) — leave the app-wide default alone;
  only extend/apply the existing `.scrollbar-light` class.
- The `.scrollbar-light` color/width values themselves (`globals.css:251-254`) — already tuned by
  task 355; no further changes to the class definition needed for this task.
- No new dependencies, no `style={{}}`, no JS-driven scroll logic — a single className addition.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/_components/v2-hub-shell.tsx` | Modify | Add `scrollbar-light` to the `<main>` scroll container's className (line 56). |

## Code Context

### `src/app/(hub)/_components/v2-hub-shell.tsx` (lines 54-58)

```tsx
        {/* Row below header: scrollable page + OpsChat panel */}
        <div className="flex flex-1 overflow-hidden min-h-0">
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
          {/* OpsChat is below the header — shares the same row as main */}
```

Change to:

```tsx
          <main className="flex-1 overflow-y-auto scrollbar-light">
```

### `src/app/globals.css` (lines 239-254, unchanged — reference only)

```css
/* ─── Scrollbar ──────────────────────────────────────────────────────────── */
::-webkit-scrollbar { width: 5px; height: 5px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: oklch(1 0 0 / 12%); border-radius: 99px; }
::-webkit-scrollbar-thumb:hover { background: oklch(1 0 0 / 20%); }

/* The default thumb above is a translucent WHITE tuned for the Hub's dark surfaces — invisible
   (white-on-white) on genuinely light/white content ... Opt into this class ... */
.scrollbar-light::-webkit-scrollbar { width: 10px; height: 10px; }
.scrollbar-light::-webkit-scrollbar-track { background: #f1f5f9; }
.scrollbar-light::-webkit-scrollbar-thumb { background: #cbd5e1; border: 2px solid #f1f5f9; }
.scrollbar-light::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
```

No edits needed here — `.scrollbar-light` already exists and is already sized/colored correctly
(task 355). This task only adds the class name to a new consumer.

## Implementation Steps

1. `v2-hub-shell.tsx`: append `scrollbar-light` to the `<main>` element's className (line 56).
2. `npx tsc --noEmit` + `pnpm lint`.
3. Browser check per Verification — confirm the scrollbar is visible on both dashboards, and that
   the header/sidebar/OpsChat panel are visually unaffected.

## Acceptance Criteria

- [ ] On the Dev dashboard, with enough content to overflow the viewport, a grey scrollbar is
      clearly visible on the right edge of the content area and can be dragged to scroll.
- [ ] On the PM dashboard (and Admin, same component) same behavior.
- [ ] The header bar and its notification-bell dropdown look and scroll exactly as before (no
      `.scrollbar-light` applied there).
- [ ] The sidebar's own scroll (when its nav list is long) still shows the original default
      scrollbar, unchanged.
- [ ] Spot-check one or two other `(hub)` pages (e.g. `/customers`, `/projects/v2`) that scroll
      inside the same `<main>` — confirm the now-visible grey scrollbar looks correct there too and
      isn't a regression (this container is shared, so the change necessarily reaches them).
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.
- [ ] No file touched by this task needs splitting per `nextjs-file-length-best-practices.md` — the
      only edit is a one-word className addition to a 72-line file; confirm this still holds at
      implementation time.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Browser (pnpm dev):
#  1. Sign in as a developer → /dashboard: resize the window short enough (or use a seeded account
#     with enough work items) that the page overflows; confirm a visible grey scrollbar on the
#     right edge, draggable, and the header stays fixed at the top (untouched, no scrollbar change).
#  2. Sign in as a pm or admin → /dashboard: same check against the PM/Admin dashboard's Programme
#     board / Clients / Reminders / Developer queue sections.
#  3. Open the notification bell dropdown from the header and confirm its own scroll (if the list is
#     long) still shows the original white/dark-tuned scrollbar — unchanged.
#  4. Visit one other hub page (e.g. /customers) and confirm the visible scrollbar there is a
#     sensible, non-regressive side effect of the shared container.
```

## Compatibility Touchpoints

- No packaging / docs / adapter / install-surface impact.
- CSS class-only change (one className addition); no migration, no deps, no API, no `database.ts`.
- The touched container (`<main>` in `V2HubShell`) is shared by every `(hub)` route, so the visible
  effect reaches beyond just the two named dashboards — flagged above and accepted as in-scope by
  the user.

## Implementation Notes

### What Changed
- Added `scrollbar-light` to the shared `<main>` scroll container's className in `v2-hub-shell.tsx`
  (line 56), which now reads `"flex-1 overflow-y-auto scrollbar-light"`. This is the only edit —
  `.scrollbar-light` already exists in `globals.css` (widened/colored by task 355), so no CSS change
  was needed. Header (`V2HubHeader`, notification-bell dropdown, OpsChat panel) and the sidebar nav
  (`v2-hub-sidebar.tsx`) were left untouched, per scope.

### Files Changed
- `src/app/(hub)/_components/v2-hub-shell.tsx` — one className addition (`scrollbar-light`) on the
  `<main>` element so the page-level scroll area shows a visible grey scrollbar instead of the
  app-wide white-tuned default.

### Deviations From Plan
- None. Implemented exactly as specified (single line, matches the Code Context diff verbatim).

### Verification Run
- `npx tsc --noEmit` — PASS (no output)
- `pnpm lint` — PASS (0 errors; 2 pre-existing warnings in an unrelated file,
  `onboarding-workspace/_checklist-tab.tsx`, same as task 355's run)
- Browser acceptance — NOT RUN (handed to test stage; needs `pnpm dev` + signed-in Dev and PM/Admin
  sessions with enough dashboard content to overflow the viewport, plus a check of the notification
  dropdown and sidebar nav to confirm they're visually unaffected)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Single-line className addition (`scrollbar-light` on `<main>`, `v2-hub-shell.tsx:56`) — exactly
  matches the Code Context diff in the task doc. No dead code, no `any`, no new nesting, no secrets
  or debug logging, no `style={{}}`.
- Reuses the existing `.scrollbar-light` utility (task 355) rather than introducing a second
  scrollbar pattern — consistent with CLAUDE.md's "match existing conventions" guidance.
- Confirmed no other file was touched by this task: the implementation stage made exactly one edit
  (`v2-hub-shell.tsx`), and that file is unchanged elsewhere — header (`v2-hub-header.tsx`,
  `notification-bell.tsx`), `ops-chat.tsx`, and `v2-hub-sidebar.tsx` are untouched, matching the
  Out-of-Scope boundaries.
- File-length check (per `nextjs-file-length-best-practices.md`, explicitly called out for this
  task): `v2-hub-shell.tsx` is 72 lines before and after — no split warranted; nothing else was
  large enough to need one.

### Deviations
- None. Implementation matches the task doc's Proposed File Changes, Code Context, and
  Implementation Steps exactly — a single className addition, no scope drift.

### Required Fixes
- None.

## Scope Addition — Desk Tickets & Contacts Main Content Scroll

User request (post-quality-gate, pre-test): "Include the Desk Tickets and Contacts tab main
content to have scroll."

### Why this is a separate scroll region from the original fix
`_tickets-index.tsx` and `_contacts-index.tsx` each render their own
`<div onScroll={...} className="h-full overflow-y-auto">` as the page's real scroll container —
sized to fill the shared `<main>` exactly (`h-full`), with a `sticky top-0` header inside it. Because
this inner div does the scrolling, `<main>` itself never overflows on these two pages, so the
`scrollbar-light` added to `<main>` in the original fix has no visible effect here. It needs to be
added directly to each page's own `overflow-y-auto` container — the same reasoning task 355 applied
to `_list-view.tsx`/`_issue-list-view.tsx`.

### Files Changed
- `src/app/(hub)/desk/tickets/_tickets-index.tsx` (line 75) — added `scrollbar-light` to the
  `h-full overflow-y-auto` root scroll container (Tickets tab's main content).
- `src/app/(hub)/desk/contacts/_contacts-index.tsx` (line 83) — same change on the equivalent
  container, shared by both the Contacts and Accounts sub-tabs (`?tab=`) since they render through
  the same component.

### What Changed
- One-word className addition (`scrollbar-light`) on each file's existing `overflow-y-auto` div —
  no structural change, no new state, no new deps. Reuses the same `.scrollbar-light` utility as
  the original fix and task 355; no CSS changes needed.

### Deviations From Plan
- Scope addition beyond the original task doc, made at the user's explicit direction after the
  quality gate had already passed on the narrower scope. No deviation from *this* addition's own
  intent — implemented exactly as asked.

### Verification Run
- `npx tsc --noEmit` — PASS (no output)
- `pnpm lint` — PASS (0 errors; same 2 pre-existing unrelated warnings in
  `onboarding-workspace/_checklist-tab.tsx`)
- Design-hook scan flagged pre-existing `text-[NNpx]` literals in both files (lines unrelated to
  this edit) — same codebase-wide convention noted in CLAUDE.md, not introduced by this change, left
  as-is.
- Browser acceptance — NOT RUN (handed to test stage; needs a Tickets list and a Contacts/Accounts
  list each with enough rows to overflow the viewport, confirming the grey scrollbar appears in the
  inner scroll region and the sticky header keeps its shadow-on-scroll behavior).

### Standards Review (mini quality-gate re-check)
- Both edits are minimal, single-className additions matching the established `.scrollbar-light`
  pattern — no unused code, no `any`, no new nesting, no regression to the `sticky top-0` header or
  the `onScroll`-driven shadow toggle (`scrolled` state), which live on the same element and are
  unaffected by adding a class.
- File lengths unchanged (214 / 229 lines) — well within `nextjs-file-length-best-practices.md`
  guidance; no split needed.

### Result
PASS
