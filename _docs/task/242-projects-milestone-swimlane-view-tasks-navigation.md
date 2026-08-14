# 242: Projects Module — Milestone Swimlane View + Deliverable-to-Tasks Navigation

**Created:** 2026-08-13
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Testing

**Depends on:** task 239 (seeds the `milestones`/`tasklists`/`tasks` rows this view reads, via `phase_plan`/`seedCustomPhases`).

---

## Overview

Tasks 239/240 let a PM define custom phases (→ `milestones`), deliverable items (→ `tasklists`), and checklist items (→ `tasks`) for StackShift Access, StackShift Access Plus, Discrete Development, and StackShift II projects at intake. Today, the only way to see that structure is `/v2/projects/[projectId]/milestones`'s `MilestonePanel` — a flat, un-styled table (`src/app/v2/(hub)/projects/[projectId]/_milestone-panel.tsx`), one row per milestone, with no visual grouping of its deliverables (tasklists) and no click-through to the tasks under a given deliverable.

This task adds a **swimlane view** to the Milestones tab: one horizontal lane per milestone (phase), containing cards for each of its tasklists (deliverables) with a task-count/progress badge. Clicking a deliverable card navigates into the Tasks tab, scoped to that tasklist — matching task 241's identical redirect pattern for StackShift's Phase 2-5 cards, so the two features feel like the same interaction language even though they're built for different classification types.

### Key Design Decisions

- This is an **additional view mode** on the existing Milestones tab (a toggle alongside the current table), not a replacement — the existing table stays for PMs who prefer it, and for editing milestone name/status/due-date (the swimlane view is read + navigate only, matching task 241's cards which are also non-editing entry points).
- Styled per Design System v2.0 (`_final_design/guide/central-hub-design-system.md`) — the existing `_milestone-panel.tsx` table predates that system (plain slate-* Tailwind, no v2.0 tokens); this task's new swimlane component follows the current tokens, it does not restyle the pre-existing table (out of scope, unrelated to this feature).
- No "except the Onboard phase" carve-out is needed here: a milestone literally named "Onboard" only exists on a project if a PM copied it in via StackShift II's "generate default phases" checkbox (task 240) — for a milestone-model project there is no Onboarding Workspace to redirect to (that surface is StackShift-I/II-programme-specific, task 222/241), so every deliverable card in this view goes to Projects > Tasks uniformly, including one literally named "Onboard".

## Requirements

- [ ] Milestones tab (`_project-detail.tsx`'s `primaryTab === "milestones"` branch, ~line 656-665) gains a view toggle: "Table" (existing `MilestonePanel`, default) / "Swimlane" (new).
- [ ] Swimlane view: one lane per milestone, ordered by `position` (fallback `start_date`/`created_at`), each lane labeled with the milestone name + a task-count badge (`X/Y done`, reusing the same counting approach as `MilestonePanel`'s existing `countMap`).
- [ ] Each lane renders one card per `tasklists` row whose `milestone_id` matches that milestone, showing the tasklist name and its own task-count/progress (tasks whose `tasklist_id` matches).
- [ ] Tasks with no `tasklist_id` under a milestone (if any) are out of scope for card grouping — only tasklist-level cards are shown (matches `tasklists`' existing role as the deliverable grouping unit, same assumption `_list-view.tsx` already makes).
- [ ] Clicking a tasklist card navigates to `/v2/projects/[projectId]/tasks?tasklist=<id>` (same query param + scroll/expand behavior task 241 adds to `_list-view.tsx` — this task reuses it, doesn't reimplement it).
- [ ] Milestones with zero tasklists render an empty lane with a "No deliverables yet" placeholder (per this repo's UI Polish Conventions — explicit empty state, not blank space).
- [ ] A project with zero milestones shows the existing/appropriate empty state (reuse whatever `MilestonePanel` already shows, or a matching one) rather than an empty swimlane shell.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass clean.

## Out of Scope / Must-Not-Change

- No changes to `MilestonePanel`'s existing table, its create/edit/delete milestone flows, or its API routes (`/api/v2/projects/[projectId]/milestones`, `/api/v2/milestones/[id]`).
- No drag-and-drop reordering or cross-lane dragging in the swimlane view — display + navigate only, matching the read-only nature of task 241's Timeline cards.
- No new database columns/tables — reuses `milestones.position`, `tasklists.milestone_id`, `tasks.tasklist_id` exactly as they exist today.
- The `?tasklist=` deep-link + scroll/expand behavior on `_list-view.tsx` is built by task 241 — this task only reuses it (coordinate merge order if both tasks are implemented close together; either can go first, the query-param contract is the same).
- Board/Calendar views on the Tasks tab are unaffected.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/projects/[projectId]/_milestone-swimlane.tsx` | Create | New swimlane view component: lanes = milestones, cards = tasklists |
| `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` | Modify | Add view-mode toggle state to the milestones tab branch (~line 656-665); render `_milestone-swimlane.tsx` when active |
| `src/app/v2/(hub)/projects/[projectId]/_milestone-panel.tsx` | Read only | Reuse its `countMap`-style task-counting pattern (lines 41-52) for consistency — do not modify this file |

## Code Context

### `_project-detail.tsx` — where the new view slots in (lines 656-665)

```tsx
{/* ── Milestones tab ── */}
{primaryTab === "milestones" && (
  <MilestonePanel
    projectId={project.id}
    projectSlug={...}
    milestones={milestones}
    tasks={tasks}
    onUpsert={upsertMilestone}
    onRemove={removeMilestone}
  />
)}
```

Add a `milestoneView: "table" | "swimlane"` state (default `"table"`) and a small toggle control above this block (match the existing `VIEW_LABELS`/`VIEW_ICONS`/`VIEW_ORDER` pattern already used for the Tasks tab's List/Board/Calendar toggle, lines 33-39, for visual consistency); render `<MilestoneSwimlane>` instead of `<MilestonePanel>` when `milestoneView === "swimlane"`, passing the same `milestones`/`tasklists`/`tasks` already in this component's state (lines 123-125) plus `projectUrlKey`/`router` for the navigate-on-click.

### `_milestone-panel.tsx` — task-counting pattern to mirror (lines 41-52)

```tsx
const countMap = useMemo(() => {
  const map = new Map<string, { total: number; done: number }>();
  for (const t of tasks) {
    if (!t.milestone_id) continue;
    const entry = map.get(t.milestone_id) ?? { total: 0, done: 0 };
    entry.total++;
    if (t.status === "closed") entry.done++;
    map.set(t.milestone_id, entry);
  }
  return map;
}, [tasks]);
```

The new component needs the equivalent keyed by `tasklist_id` (for per-card counts) in addition to `milestone_id` (for per-lane counts) — build both in one pass over `tasks`.

### `src/app/v2/(hub)/projects/_pm-shared.tsx` — shared types already imported elsewhere in this module

```ts
export type Milestone = { id, project_id, name, status, position, start_date, due_date, ... };
export type Tasklist  = { id, project_id, name, position, milestone_id, ... };
export type Task      = { id, project_id, milestone_id, tasklist_id, title, status, ... };
```

Import these the same way `_project-detail.tsx` does (line 15) rather than redefining shapes locally.

### Depends on task 241's `_list-view.tsx` addition (for the click destination)

```tsx
// task 241 adds:
<ListView tasklists={tasklists} tasks={tasks} scrollToTasklistId={initialScrollTasklistId} ... />
```

This task's card `onClick` should navigate with `router.push(`${V2_ROUTES.PROJECTS}/${projectUrlKey}/tasks?tasklist=${tasklist.id}`)` — identical URL shape to task 241's, so both features share one query-param contract on `_list-view.tsx`.

## Implementation Steps

1. Confirm task 241's `?tasklist=` support has landed on `/v2/projects/[projectId]/tasks`/`_list-view.tsx` (or coordinate simultaneous implementation using the shared contract above).
2. Build `_milestone-swimlane.tsx`: accept `milestones`, `tasklists`, `tasks`, `projectUrlKey` props; compute per-milestone and per-tasklist counts in one `useMemo`; render lanes ordered by `position`; render tasklist cards per lane with name + `done/total` badge; empty-lane and empty-project states per the UI Polish Conventions (icon + one-line message).
3. Add the view-mode toggle + conditional render to `_project-detail.tsx`'s milestones tab branch.
4. Wire each tasklist card's click to `router.push` the `?tasklist=` URL.
5. Run `npx tsc --noEmit` and `pnpm lint`; manually create a milestone-model project (via task 240's wizard) with 2+ phases/deliverables, verify the swimlane renders and each card navigates correctly.

## Acceptance Criteria

- [ ] The Milestones tab shows a Table/Swimlane toggle; Table remains the default and is unchanged from today.
- [ ] Swimlane view renders one lane per milestone in `position` order, each with a task-count badge matching the Table view's own counts for the same project (cross-check the two views agree).
- [ ] Each lane shows one card per tasklist under that milestone, each with its own task-count badge.
- [ ] Clicking a tasklist card navigates to `/v2/projects/[projectId]/tasks?tasklist=<id>` and lands scrolled/expanded to that tasklist's group (task 241's shared behavior).
- [ ] A milestone with zero tasklists shows an explicit "No deliverables yet" empty lane, not blank space.
- [ ] A project with zero milestones shows an appropriate empty state in swimlane view (no broken/empty shell).
- [ ] `npx tsc --noEmit` and `pnpm lint` pass clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser acceptance (no test runner configured):
- Create a StackShift Access project via the (task 240) wizard with 2 custom phases, 2-3 deliverables each, a few checklist items — open `/v2/projects/[projectId]/milestones`, toggle to Swimlane, confirm lanes/cards/counts match what was entered.
- Click a deliverable card; confirm it lands on the Tasks tab scrolled to the right tasklist group, with the checklist items visible as tasks.
- Toggle back to Table view; confirm the pre-existing table still works unchanged (add/edit/delete a milestone).

## Compatibility Touchpoints

- No new migration, no schema changes.
- Depends on task 239 for the underlying `milestones`/`tasklists`/`tasks` rows existing, and on task 241 for the shared `?tasklist=` deep-link contract on `_list-view.tsx`.
- No `_docs/mcp-tools.md` changes.

## Implementation Notes

### What Changed
- New `_milestone-swimlane.tsx`: renders one lane per milestone (sorted by `position`, falling back to `start_date` then `created_at` for any milestone without one), each lane showing a `done/total` task-count badge and one card per `tasklists` row whose `milestone_id` matches, each card with its own `done/total` badge. Counts are computed in a single pass over `tasks`, mirroring `MilestonePanel`'s existing `countMap` pattern but keyed by both `milestone_id` and `tasklist_id`. A milestone with zero tasklists renders an explicit "No deliverables yet" placeholder; a project with zero milestones renders a "No milestones yet — switch to Table view" empty state instead of an empty lane shell.
- Clicking a tasklist card calls `router.push` to `/v2/projects/[projectId]/tasks?tasklist=<id>` — the exact URL shape task 241 already wired `_list-view.tsx` to scroll-into-view on.
- `_project-detail.tsx`: added `milestoneView: "table" | "swimlane"` state (default `"table"`), a small pill toggle above the Milestones tab content (visually consistent with the existing List/Board/Calendar toggle on the Tasks tab), and conditional rendering between the existing `<MilestonePanel>` and the new `<MilestoneSwimlane>`, passing the same `milestones`/`tasklists`/`tasks` state already in this component plus `project.project_id ?? project.id` as `projectUrlKey` (matching the fallback pattern already used for `MilestonePanel`'s own `projectSlug` prop a few lines below).

### Files Changed
- `src/app/v2/(hub)/projects/[projectId]/_milestone-swimlane.tsx` — new component
- `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` — view-mode toggle + conditional render on the Milestones tab

### Deviations From Plan
- None — implemented exactly as specified in the task document (view toggle, lane/card structure, counting approach, empty states, and the shared `?tasklist=` navigation contract from task 241, which had already shipped before this task started).

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (2 pre-existing warnings in `_checklist-tab.tsx`, unrelated to this task)
- Manual/browser acceptance checks from the task doc's Verification section — SKIPPED (no live Supabase/browser session available in this implementation pass; recommend creating a StackShift Access project via task 240's wizard with 2+ custom phases/deliverables/checklist items, then walking the 3 listed scenarios — swimlane render/counts match entry, card click lands scrolled on the right tasklist with its checklist items as tasks, and the pre-existing Table view still works unchanged)

## Quality Gate Notes

### Result
PASS

### Standards Review
- `console.log`/`TODO`/`FIXME`/`: any`/`as any` sweep across both changed files returned zero hits.
- `milestoneCounts` in `_milestone-swimlane.tsx` is byte-for-byte the same predicate logic as `MilestonePanel`'s existing `countMap` (`if (!t.milestone_id) continue` / `t.status === "closed"` for "done") — verified line-by-line against `_milestone-panel.tsx`, confirming the acceptance criterion that the two views' badges must agree for the same project.
- Clear single-responsibility split: `sortMilestones` (pure, exported implicitly via module scope, easily testable in isolation), the two `useMemo`s (counts, tasklist-by-milestone grouping), and the render — no logic embedded inside JSX beyond simple lookups.
- The Table/Swimlane toggle reuses the exact visual pattern (pill container, `bg-[#071133]`/text-white active state) already established by the Tasks tab's List/Board/Calendar toggle a few hundred lines above in the same file — no new visual language introduced.
- No secrets, credentials, or debug logging.
- Read/navigate-only surface as specified — no write paths, no new API routes, `MilestonePanel` and its mutation handlers (`onUpsert`/`onRemove`) untouched.

### Deviations
- None found. Implementation matches the task document's Requirements, Proposed File Changes, Code Context, and Out of Scope boundaries exactly — no corrections were needed during this review (unlike tasks 240/241, which each had one real defect caught and fixed at this stage).

### Required Fixes
- None (PASS).
