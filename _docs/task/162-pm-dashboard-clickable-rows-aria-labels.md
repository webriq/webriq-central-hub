# 162: PM Dashboard — Wire Unwired Clickable Rows + Add Missing aria-labels

**Created:** 2026-07-17
**Priority:** MEDIUM
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

A Web Interface Guidelines audit of `/v2/dashboard` (see prior conversation turn) found two categories of issues, both being fixed here:

1. **Dead clickable affordances in `pm-dashboard.tsx`** — three rows (`DecisionCard`, `TasksTable`, `DeskPulse` SLA item) are styled with `cursor-pointer` + `hover:bg-*` implying they're clickable, but have no `onClick`, no keyboard handler, and no `<a>`/`<Link>` semantics. There is no dedicated task/plan detail route in the app yet, so per user decision these rows will be wired to the closest existing destination rather than left dead or stripped of the affordance:
   - `DecisionCard` row → `V2_ROUTES.ORCHESTRATION` (same destination as its existing "Review" link)
   - `TasksTable` row → `V2_ROUTES.DASHBOARD_TASKS`
   - `DeskPulse` SLA-breaching item row → `V2_ROUTES.DASHBOARD_TASKS`

2. **Icon-only buttons missing `aria-label`** across the three audited files — confirmed in scope by user: not just `pm-dashboard.tsx`, but also `v2-hub-header.tsx` and `v2-hub-sidebar.tsx`.
   - `pm-dashboard.tsx` — `TasksTable` row-select toggle button (icon-only, no `aria-label`, no `aria-pressed`)
   - `v2-hub-header.tsx` — notification bell button, help button
   - `v2-hub-sidebar.tsx` — expand-sidebar button, collapse-sidebar button, sign-out button (all currently rely on `title` only, which is not a reliable accessible name for all AT/browsers)

## Requirements

- [ ] `DecisionCard` row in `pm-dashboard.tsx`: wrap the left info block (`flex-1 min-w-0`) in a `<Link href={V2_ROUTES.ORCHESTRATION}>`; remove `cursor-pointer` from the outer row wrapper (CSS `:hover` bubbles from descendants so `hover:bg-slate-50` keeps working); leave the existing "Approve"/"Review" `<Link>`s untouched as siblings.
- [ ] `TasksTable` row in `pm-dashboard.tsx`: convert the "Task" grid cell (`<div className="px-3 py-2.5 flex flex-col gap-0.5 min-w-0">`) into a `<Link href={V2_ROUTES.DASHBOARD_TASKS}>` with the same classes; remove `cursor-pointer` from the outer grid row wrapper; leave the checkbox button and other cells untouched.
- [ ] `DeskPulse` SLA item row in `pm-dashboard.tsx`: convert the row `<div>` directly into a `<Link href={V2_ROUTES.DASHBOARD_TASKS}>` with the same classes (no nested interactive elements in this row, so no restructuring needed beyond the tag swap); remove `cursor-pointer` (anchors get a pointer cursor by default).
- [ ] `TasksTable` checkbox-toggle button in `pm-dashboard.tsx`: add `aria-label` (e.g. `checked[task.id] ? "Deselect task" : "Select task"`) and `aria-pressed={!!checked[task.id]}`.
- [ ] `v2-hub-header.tsx` bell button: add `aria-label="Notifications"`.
- [ ] `v2-hub-header.tsx` help button: add `aria-label="Help"`.
- [ ] `v2-hub-sidebar.tsx` expand-sidebar button: add `aria-label="Expand sidebar"` (keep existing `title`).
- [ ] `v2-hub-sidebar.tsx` collapse-sidebar button: add `aria-label="Collapse sidebar"` (keep existing `title`).
- [ ] `v2-hub-sidebar.tsx` sign-out button: add `aria-label="Sign out"` (keep existing `title`).

## Out of Scope / Must-Not-Change

- No new routes or detail pages are created — rows are wired only to existing `V2_ROUTES` destinations.
- Do not touch `dev-dashboard.tsx` or `admin-dashboard.tsx` (not part of this fix; admin's LLM-spend progress-bar `aria` gap and `toFixed(4)` formatting are separate, not requested here).
- Do not add `focus-visible:ring-*` styles, convert sidebar nav `<button>`s to `<Link>`, mark stub nav items `aria-disabled`, or add `role="progressbar"` to `ConfidenceBar`/admin spend bars — all flagged in the earlier audit but explicitly out of scope for this task.
- Do not change `DecisionCard`'s or `TasksTable`'s existing `Approve`/`Review` links, checkbox toggle logic, or any data-fetching/Supabase query code.
- Do not modify `dashboard-shared.tsx`, `layout.tsx`, or `globals.css`.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/dashboard/_components/pm-dashboard.tsx` | Modify | Wire the 3 dead-clickable rows to real `<Link>` destinations; add `aria-label`/`aria-pressed` to the checkbox toggle button |
| `src/app/v2/(hub)/_components/v2-hub-header.tsx` | Modify | Add `aria-label` to bell and help icon buttons |
| `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` | Modify | Add `aria-label` to expand, collapse, and sign-out icon buttons |

## Code Context

`Link` is already imported in `pm-dashboard.tsx` (`import Link from "next/link";`, used by the existing Approve/Review buttons) — no new import needed. `V2_ROUTES.DASHBOARD_TASKS` and `V2_ROUTES.ORCHESTRATION` are already defined in `src/config/constants.ts`.

### File: `src/app/v2/(hub)/dashboard/_components/pm-dashboard.tsx`

Current `DecisionCard` row (~line 105):

```tsx
plans.map((plan, idx) => (
  <div
    key={plan.id}
    className="flex items-start gap-4 px-5 py-4 border-b border-slate-50 last:border-0 hover:bg-slate-50 transition-colors cursor-pointer"
  >
    <div className="flex-1 min-w-0">
      {/* PLAN-xxx label, customer chip, "Plan for {customer_id}", ConfidenceBar */}
    </div>
    <div className="flex items-center gap-2 shrink-0 mt-1">
      <AIChip />
      <Link href={V2_ROUTES.ORCHESTRATION} ...>Approve</Link>
      <Link href={V2_ROUTES.ORCHESTRATION} ...>Review</Link>
    </div>
  </div>
))
```

Target: outer `<div>` keeps `hover:bg-slate-50 transition-colors` but drops `cursor-pointer`; the `flex-1 min-w-0` inner `<div>` becomes `<Link href={V2_ROUTES.ORCHESTRATION} className="flex-1 min-w-0 block">`.

Current `TasksTable` row (~line 169):

```tsx
priorityTasks.map((task, idx) => (
  <div
    key={task.id}
    className="grid items-center border-b border-slate-50 last:border-0 hover:bg-slate-50/60 transition-colors cursor-pointer"
    style={{ gridTemplateColumns: "28px 1fr 110px 52px 90px 100px" }}
  >
    {/* Checkbox */}
    <div className="px-2 py-2.5 flex items-center justify-center">
      <button
        onClick={e => { e.stopPropagation(); setChecked(c => ({ ...c, [task.id]: !c[task.id] })); }}
        className="text-slate-300 hover:text-blue-500 transition-colors cursor-pointer"
      >
        {checked[task.id] ? <CheckSquare size={14} className="text-blue-500" /> : <Square size={14} />}
      </button>
    </div>
    {/* Task */}
    <div className="px-3 py-2.5 flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] font-mono text-blue-600 leading-none">{task.customer_id.slice(-8).toUpperCase()}</span>
      <span className="text-[12px] text-slate-800 truncate">{task.title}</span>
    </div>
    {/* Customer / Who / Priority / Status cells unchanged */}
  </div>
))
```

Target: outer `<div>` keeps `hover:bg-slate-50/60 transition-colors`, drops `cursor-pointer`. Checkbox `<button>` gains `aria-label` + `aria-pressed`, e.g.:

```tsx
<button
  onClick={e => { e.stopPropagation(); setChecked(c => ({ ...c, [task.id]: !c[task.id] })); }}
  aria-label={checked[task.id] ? "Deselect task" : "Select task"}
  aria-pressed={!!checked[task.id]}
  className="text-slate-300 hover:text-blue-500 transition-colors cursor-pointer"
>
```

The "Task" cell `<div>` becomes `<Link href={V2_ROUTES.DASHBOARD_TASKS} className="px-3 py-2.5 flex flex-col gap-0.5 min-w-0">` (same children, same classes — `Link` is a valid CSS Grid item so column tracks are unaffected). `V2_ROUTES` is already imported at the top of this file.

Current `DeskPulse` SLA row (~line 264):

```tsx
{slaItems.slice(0, 3).map(item => (
  <div
    key={item.id}
    className="flex items-center justify-between px-5 py-2 border-t border-red-100/50 hover:bg-red-50 transition-colors cursor-pointer"
  >
    <div>
      <div className="text-[10px] font-mono text-red-500">{item.customer_id.slice(-8).toUpperCase()}</div>
      <div className="text-[11px] text-slate-700">{item.customer_id}</div>
    </div>
    <span className="text-[10px] font-mono text-red-400">{formatRelativeTime(item.created_at)} overdue</span>
  </div>
))}
```

Target: swap the outer `<div>` for `<Link href={V2_ROUTES.DASHBOARD_TASKS}>` with the same `key`/className (minus `cursor-pointer`), children unchanged.

### File: `src/app/v2/(hub)/_components/v2-hub-header.tsx`

```tsx
// line 138
<button className="relative p-1.5 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors cursor-pointer">
  <Bell size={18} />
  ...
</button>

// line 144
<button className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-50 transition-colors cursor-pointer">
  <HelpCircle size={18} />
</button>
```

Add `aria-label="Notifications"` to the first, `aria-label="Help"` to the second (same pattern already used on the Ops Chat button at line 149, which has `aria-label="Open Ops Chat"`).

### File: `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx`

```tsx
// line 113 (collapsed state, expand)
<button
  onClick={() => setCollapsed(false)}
  className="flex items-center justify-center cursor-pointer"
  title="Expand sidebar"
>

// line 128 (expanded state, collapse)
<button
  onClick={() => setCollapsed(true)}
  className="p-1 rounded-md cursor-pointer transition-colors"
  style={{ color: "#64748B" }}
  ...
  title="Collapse sidebar"
>

// line 249 (sign out)
<button
  onClick={() => signOut()}
  className="p-1.5 rounded-md cursor-pointer transition-colors shrink-0"
  style={{ color: "#64748B" }}
  ...
  title="Sign out"
>
```

Add `aria-label="Expand sidebar"`, `aria-label="Collapse sidebar"`, `aria-label="Sign out"` respectively (in addition to the existing `title` attributes, which can stay for the mouse tooltip).

## Implementation Steps

1. In `pm-dashboard.tsx`, update `DecisionCard`: drop `cursor-pointer` from the row wrapper, wrap the left info block in `<Link href={V2_ROUTES.ORCHESTRATION}>`.
2. In `pm-dashboard.tsx`, update `TasksTable`: drop `cursor-pointer` from the row wrapper, convert the "Task" cell to `<Link href={V2_ROUTES.DASHBOARD_TASKS}>`, add `aria-label`/`aria-pressed` to the checkbox button.
3. In `pm-dashboard.tsx`, update `DeskPulse`: convert the SLA item row `<div>` to `<Link href={V2_ROUTES.DASHBOARD_TASKS}>`, drop `cursor-pointer`.
4. In `v2-hub-header.tsx`, add `aria-label` to the bell and help buttons.
5. In `v2-hub-sidebar.tsx`, add `aria-label` to the expand, collapse, and sign-out buttons.
6. Run `npx tsc --noEmit` and visually verify in-browser (hover state still shows on each row, clicking navigates to the intended `V2_ROUTES` destination, checkbox click still works and does not trigger row navigation, all icon-only buttons expose an accessible name in devtools' Accessibility panel).

## Acceptance Criteria

- [ ] Clicking anywhere in the `DecisionCard` info area navigates to `/v2/orchestration`; Approve/Review buttons still work independently and don't double-navigate.
- [ ] Clicking the "Task" cell in a `TasksTable` row navigates to `/v2/dashboard/tasks`; clicking the checkbox still only toggles selection and does not navigate.
- [ ] Clicking an SLA-breaching row in `DeskPulse` navigates to `/v2/dashboard/tasks`.
- [ ] Cmd/Ctrl-click and middle-click on any of the three rows opens the destination in a new tab (real `<a>` semantics via `Link`).
- [ ] No `cursor-pointer` remains on a non-interactive wrapper in any of the three fixed rows.
- [ ] The `TasksTable` checkbox button exposes an accessible name and toggled state (`aria-label`, `aria-pressed`) in the browser's Accessibility panel.
- [ ] The header bell and help buttons, and the sidebar expand/collapse/sign-out buttons, each expose an `aria-label` in the Accessibility panel.
- [ ] `npx tsc --noEmit` passes with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual: pnpm dev, open /v2/dashboard as a PM-role user, check each fixed row's
# click/keyboard/Cmd-click behavior and inspect accessible names via the browser
# DevTools Accessibility panel (or axe DevTools) for the 6 buttons touched.
```

## Compatibility Touchpoints

- None — no route, API, schema, or packaging changes. Purely presentational/markup fixes in three existing client components.

## Implementation Notes

### What Changed
- `DecisionCard` (pm-dashboard.tsx): left info block wrapped in `<Link href={V2_ROUTES.ORCHESTRATION}>`, `cursor-pointer` dropped from the row wrapper. Approve/Review `<Link>`s untouched as siblings outside the new Link.
- `TasksTable` (pm-dashboard.tsx): "Task" cell converted to `<Link href={V2_ROUTES.DASHBOARD_TASKS}>`, `cursor-pointer` dropped from the row wrapper, checkbox button gained `aria-label`/`aria-pressed`.
- `DeskPulse` SLA row (pm-dashboard.tsx): row `<div>` swapped for `<Link href={V2_ROUTES.DASHBOARD_TASKS}>`, `cursor-pointer` dropped.
- `v2-hub-header.tsx`: added `aria-label="Notifications"` to the bell button and `aria-label="Help"` to the help button.
- `v2-hub-sidebar.tsx`: added `aria-label` (matching existing `title` text) to the expand, collapse, and sign-out buttons.

### Files Changed
- `src/app/v2/(hub)/dashboard/_components/pm-dashboard.tsx` - wired 3 dead-clickable rows to real `Link` destinations; added checkbox `aria-label`/`aria-pressed`
- `src/app/v2/(hub)/_components/v2-hub-header.tsx` - added `aria-label` to bell and help buttons
- `src/app/v2/(hub)/_components/v2-hub-sidebar.tsx` - added `aria-label` to expand, collapse, and sign-out buttons

### Deviations From Plan
- None. All 9 requirement items and the exact restructuring described in Code Context were applied as written.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS for all 3 touched files (1 pre-existing error remains in `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx`, an untouched, out-of-scope file with pre-existing uncommitted changes predating this task)
- Manual in-browser click/Cmd-click/keyboard verification - SKIPPED (no browser session run this pass; recommend before merge)
