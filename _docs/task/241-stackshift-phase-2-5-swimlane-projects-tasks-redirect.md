# 241: StackShift Timeline — Phase 2-5 Deliverable Cards Become Clickable, Redirect to Projects > Tasks

**Created:** 2026-08-13
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Testing

**Depends on:** task 239 (reuses its `milestones`/`tasklists` seeding pattern; this task adds its own StackShift-specific seeding step, not the generic `seedCustomPhases` path).

---

## Overview

The Timeline's Gantt (`src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx`) already renders **all 5 phases** as `Swimlane` rows with per-deliverable `DeliverableCard`s (`PROGRAMME_PHASES.map((phase) => <Swimlane phase={phase} .../>)`, line 1863) — this is more built than it first appears. The gap is narrow: `Swimlane` hardcodes `interactive = phase.number === 1 && role !== "developer"` (line 605), so only Phase 1's 7 deliverable cards are clickable at all; Phases 2-5's 21 deliverable cards render but do nothing on click. Phase 1's click target already correctly goes to the Onboarding Workspace (task 222).

This task:
1. Seeds a `milestones` row per Phase 2-5 (skipping Phase 1) and a `tasklists` row per deliverable in those phases, into the existing generic PM tables, at the moment the StackShift programme starts (`seedAndStartProgramme`).
2. Makes Phase 2-5's `DeliverableCard`s interactive, routing clicks to `/v2/projects/[projectId]/tasks` scoped to that deliverable's tasklist — "Projects > Tasks" per the brief. Phase 1 is explicitly excluded ("except for the Onboard phase") and keeps its existing task-222 destination unchanged.

### Key Design Decisions

- Milestone/tasklist rows are matched to a `(phaseNumber, deliverableKey)` pair via `external_id` (already a nullable text column on both tables, no schema change needed): `external_id: "programme-phase-{n}"` for the milestone, `external_id: "programme-deliverable-{phaseNumber}-{key}"` for the tasklist. This avoids adding new columns and reuses the field's existing purpose (external/foreign correlation ID).
- Seeding happens once, at `seedAndStartProgramme` time, for whichever phase the programme starts at onward (mirrors that function's existing `phaseNumber` param — a programme starting at Phase 3 still gets Phase 2's milestone seeded too, since Phase 2 shows as "skipped" but its deliverable cards are still visibly rendered and should still be clickable).
- No `tasks` rows are auto-created under these tasklists — they start empty. A PM adds real tasks under them from `/v2/projects/[projectId]/tasks` once real work is tracked; the redirect's job is just to land them in the right place, matching how task 222 also just navigates to an existing surface rather than fabricating content.
- Phase 1 stays untouched — its `interactive` gate and `onOpenWizardStep` destination (Onboarding Workspace) are unchanged, per the brief's explicit "except for the Onboard phase" exception.

## Requirements

- [ ] `seedAndStartProgramme` additionally inserts one `milestones` row per Phase 2-5 (`external_id: "programme-phase-{n}"`, `name: phase.name`) and one `tasklists` row per deliverable in those phases (`external_id: "programme-deliverable-{n}-{key}"`, `milestone_id` = that phase's milestone id, `name: deliverable.name`), linked to the same `project_id`/`customer_id`. Phase 1 is skipped (no milestone/tasklist rows created for it by this path — it has no generic-model presence, matching today).
- [ ] `Swimlane`'s `interactive` becomes `role !== "developer"` for all 5 phases (drop the `phase.number === 1` condition).
- [ ] A new prop threads a phase-aware open handler down `Swimlane` → `DeliverableCard`: `onOpenPhaseDeliverable(phaseNumber: number, deliverableKey: string)`.
- [ ] `_onboarding-detail.tsx`'s handler: if `phaseNumber === 1`, call the existing task-222 `handleOpenWizardStep` unchanged; otherwise, resolve `(phaseNumber, deliverableKey)` to a `tasklist_id` (via a lookup against the project's `tasklists` by `external_id`, fetched once alongside the page's existing data load) and `router.push` to `/v2/projects/[projectId]/tasks?tasklist=<id>` using the project's routing key (`project_id` display code, per the CLAUDE.md `/v2/projects/[projectId]` exception).
- [ ] `/v2/projects/[projectId]/tasks` (or its shared list component) recognizes a `?tasklist=<id>` query param on load and scrolls to / expands that tasklist's group in the existing tasklist-grouped List view (`_list-view.tsx` already groups tasks by `tasklist_id`, see task 239/243 context — this task only adds the deep-link, not new grouping logic).
- [ ] `npx tsc --noEmit` and `pnpm lint` pass clean.

## Out of Scope / Must-Not-Change

- Phase 1's `DeliverableCard`s, `handleOpenWizardStep`, and the task-222 Onboarding Workspace deep-linking are unchanged.
- No change to `customer_phases`/`customer_deliverables` schema or seeding for Phases 1-5 — this task only *adds* parallel `milestones`/`tasklists` rows, it doesn't touch the existing day-based rows.
- No change to drag-resize (`onScheduleChange`) behavior on any `DeliverableCard` — a click still only fires when the pointer didn't move (`suppressClickRef`), same guard as today.
- Legacy StackShift projects whose programme already started before this ships do **not** get backfilled with Phase 2-5 milestones/tasklists — forward-only, matching task 239's same stance for StackShift II.
- Board/Calendar views on `/v2/projects/[projectId]/tasks` are not required to support the `?tasklist=` deep-link — List view only (it's already the tasklist-grouped one).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/programme/seed.ts` | Modify | `seedAndStartProgramme`: after the existing `customer_phases`/`customer_deliverables` insert, insert `milestones`/`tasklists` rows for Phase 2-5 |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` | Modify | `Swimlane`'s `interactive` condition; new `onOpenPhaseDeliverable` handler; fetch the project's `tasklists` (filtered to `external_id LIKE 'programme-deliverable-%'`) alongside existing page data |
| `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` | Modify | Accept an `initialScrollTasklistId`/`?tasklist=` param; scroll/expand to that group on mount |
| `src/app/v2/(hub)/projects/[projectId]/page.tsx` (or the `tasks` sub-route's `page.tsx`) | Modify | Parse `?tasklist=` from `searchParams`, pass through to `ProjectDetail`/`ListView` |

## Code Context

### `_onboarding-detail.tsx` — `Swimlane`'s interactive gate (line 605)

```tsx
const interactive = phase.number === 1 && role !== "developer";
```
→
```tsx
const interactive = role !== "developer";
```

### `_onboarding-detail.tsx` — `Swimlane` prop signature (lines 583-601) and its `DeliverableCard` render (lines 646-660)

```tsx
function Swimlane({ phase, ..., onOpenWizardStep, ... }: { ...; onOpenWizardStep: (key: string) => void; ... }) {
  ...
  {!collapsed && effectiveDeliverables.map((d, i) => (
    <DeliverableCard key={d.key} d={d} ... onOpenWizardStep={interactive ? () => onOpenWizardStep(d.key) : undefined} ... />
  ))}
```

Replace `onOpenWizardStep: (key: string) => void` with `onOpenDeliverable: (phaseNumber: number, key: string) => void`, and the render call with `onOpenDeliverable={interactive ? () => onOpenDeliverable(phase.number, d.key) : undefined}` — `phase` is already in scope inside `Swimlane`, no new prop threading beyond the renamed callback.

### `_onboarding-detail.tsx` — existing Phase-1-only handler (lines 166-171, from task 222)

```tsx
const handleOpenWizardStep = (deliverableKey: string) => {
  const target = DELIVERABLE_WORKSPACE_TARGET[deliverableKey] ?? { tab: "business-info" as const };
  const qs = buildWorkspaceQueryString(target.tab, target.folderPath);
  router.push(`${V2_ROUTES.PORTFOLIO_TRACKER}/${projectUrlKey}/onboarding-workspace?${qs}`, { scroll: false });
};
```

New wrapper (this becomes the function actually passed to `<Swimlane onOpenDeliverable={...}>`):

```tsx
const handleOpenPhaseDeliverable = (phaseNumber: number, deliverableKey: string) => {
  if (phaseNumber === 1) {
    handleOpenWizardStep(deliverableKey);
    return;
  }
  const tasklistId = tasklistIdByExternalId.get(`programme-deliverable-${phaseNumber}-${deliverableKey}`);
  router.push(
    tasklistId
      ? `${V2_ROUTES.PROJECTS}/${projectUrlKey}/tasks?tasklist=${tasklistId}`
      : `${V2_ROUTES.PROJECTS}/${projectUrlKey}/tasks`
  );
};
```

`tasklistIdByExternalId` is a `Map<string, string>` built from a new fetch (or extended existing fetch) of the project's `tasklists` rows — add alongside whatever data-loading hook/effect already populates this page (check `_load-detail-data.ts` sibling pattern used by `[projectId]/_load-detail-data.ts` in the Projects module for precedent on a server-side loader, or a lightweight client `useEffect` fetch if this page's data loading is otherwise client-driven — confirm which by reading the page's existing data-fetch pattern before choosing).

### `src/lib/programme/seed.ts` — where to add the new inserts (after line 71's existing `Promise.all`)

```ts
const [phasesRes, deliverablesRes, internalRes] = await Promise.all([
  adminClient.from("customer_phases").insert(phaseRows),
  adminClient.from("customer_deliverables").insert(deliverableRows),
  adminClient.from("onboarding_internal_deliverables").insert(internalDeliverableRows),
]);
if (phasesRes.error || deliverablesRes.error || internalRes.error) { ... }

// NEW: seed Phase 2-5 milestones/tasklists (Phase 1 has no generic-model presence — task 222's
// Onboarding Workspace is its equivalent surface).
for (const phase of PROGRAMME_PHASES.filter((p) => p.number !== 1)) {
  const { data: milestone, error: milestoneError } = await adminClient
    .from("milestones")
    .insert({ project_id: project.id, external_id: `programme-phase-${phase.number}`, name: phase.name, status: "planned" })
    .select("id")
    .single();
  if (milestoneError || !milestone) { console.error(...); continue; } // non-fatal — don't fail programme start over this
  const tasklistRows = phase.deliverables.map((d, i) => ({
    project_id: project.id,
    milestone_id: milestone.id,
    external_id: `programme-deliverable-${phase.number}-${d.key}`,
    name: d.name,
    position: i,
  }));
  await adminClient.from("tasklists").insert(tasklistRows);
}
```

Treat this block as **non-fatal** (log and continue, don't return `{ error }`) — losing the generic milestone/tasklist rows shouldn't block the actual programme start, which is the function's primary job; the swimlane redirect degrades gracefully to a bare `/tasks` link (see `handleOpenPhaseDeliverable` above) when a mapping is missing.

### `_list-view.tsx` — existing tasklist grouping to hook the deep-link into (from task 239's earlier research)

```tsx
const buckets = new Map<string, Task[]>();
for (const tl of tasklists) { ... }
```

Add a `scrollToTasklistId?: string` prop; on mount (or when it changes), find the corresponding group's DOM node (add a stable `id={`tasklist-group-${tl.id}`}` to each group's wrapper if not already addressable) and `scrollIntoView` + ensure it isn't in a collapsed state (reuse whatever collapse-state mechanism the "Collapse / expand all tasklist groups" logic in `_project-detail.tsx` (lines ~383-391) already exposes).

## Implementation Steps

1. Add the Phase 2-5 milestone/tasklist seeding block to `seedAndStartProgramme` in `seed.ts` (non-fatal, as shown above). Do **not** add this to `seedProgrammeAtPhase` in the same file unless product confirms bulk-import/jump-to-phase projects should get it too — out of scope unless raised.
2. Rename/extend `Swimlane`'s `onOpenWizardStep` prop to `onOpenDeliverable(phaseNumber, key)`; flip the `interactive` condition.
3. In `_onboarding-detail.tsx`: add the `tasklistIdByExternalId` lookup (fetch or derive from existing data), add `handleOpenPhaseDeliverable`, wire it as the new `<Swimlane onOpenDeliverable={handleOpenPhaseDeliverable}>` prop at the render call site (~line 1864).
4. Add `?tasklist=` parsing to the Projects `tasks` sub-route's `page.tsx` and thread `scrollToTasklistId` down to `_list-view.tsx`; implement the scroll/expand-on-mount behavior there.
5. Run `npx tsc --noEmit` and `pnpm lint`.

## Acceptance Criteria

- [ ] Starting a new StackShift I or StackShift II programme (via task 240's wizard, "start" mode) creates 4 `milestones` rows (Phases 2-5) and their deliverable `tasklists` rows, visible in `/v2/projects/[projectId]/milestones`.
- [ ] On the Timeline, clicking any deliverable card in Phase 2, 3, 4, or 5 navigates to `/v2/projects/[projectId]/tasks?tasklist=<id>` and that tasklist's group is scrolled into view / expanded.
- [ ] Clicking any Phase 1 deliverable card still navigates to the Onboarding Workspace exactly as before this task (regression check against task 222's acceptance criteria).
- [ ] Developer role: no deliverable card in any phase is clickable (regression check — `interactive` already excluded developer before this task, must stay excluded after).
- [ ] A StackShift project whose programme started *before* this change ships shows non-interactive (or gracefully-degraded, plain `/tasks`-no-param) Phase 2-5 cards — no crash from a missing `tasklistIdByExternalId` entry.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser acceptance (no test runner configured):
- Start a fresh StackShift I programme; open its Timeline; click one card in each of Phases 2-5; confirm each lands on the correct tasklist in Projects > Tasks.
- Click a Phase 1 card; confirm it still opens the Onboarding Workspace (task 222 regression).
- Open the Timeline for a StackShift project whose programme started before this change deployed; confirm Phase 2-5 cards don't error on click (either inert or a bare `/tasks` navigation, per the graceful-degradation design above).

## Compatibility Touchpoints

- No new migration — reuses existing `milestones.external_id`/`tasklists.external_id` columns.
- Depends conceptually on task 239's `milestones`/`tasklists` tables but shares no code path with its `seedCustomPhases` (that function is StackShift-I-excluded; this task's seeding is StackShift-I/II-only, added directly to `seedAndStartProgramme`).
- No `_docs/mcp-tools.md` changes.

## Implementation Notes

### What Changed
- `seedAndStartProgramme` (`seed.ts`) now additionally seeds one `milestones` row per Phase 2-5 (`external_id: "programme-phase-{n}"`) and one `tasklists` row per deliverable in those phases (`external_id: "programme-deliverable-{n}-{key}"`, linked via `milestone_id`), right after the existing `customer_phases`/`customer_deliverables` insert. Non-fatal on error (logs and continues per-phase, doesn't fail the programme start).
- `GET /api/projects/[projectId]/programme` now also returns `phase_tasklists: { id, external_id }[]` (rows matching `external_id LIKE 'programme-deliverable-%'`) alongside the data it already returned, so the Timeline can resolve a clicked deliverable to its tasklist without a second request.
- `_onboarding-detail.tsx`: `Swimlane`'s `interactive` gate dropped its `phase.number === 1` condition (now `role !== "developer"` for all 5 phases); its `onOpenWizardStep: (key) => void` prop was renamed/retyped to `onOpenDeliverable: (phaseNumber, key) => void`, with the phase-aware closure built inside `Swimlane` and passed down to `DeliverableCard` under its existing (unrenamed) `onOpenWizardStep` prop. New `handleOpenPhaseDeliverable(phaseNumber, deliverableKey)` handler: Phase 1 delegates to the existing task-222 `handleOpenWizardStep` unchanged; Phase 2-5 resolves `tasklistIdByExternalId` (a new `Map<string, string>` populated from the route's new `phase_tasklists` field, in both of the page's existing data-fetch call sites) and navigates to `/v2/projects/[projectId]/tasks?tasklist=<id>`, or a bare `/tasks` link when the mapping is missing (legacy pre-this-change projects).
- Projects module: `tasks/page.tsx` now parses `?tasklist=` from `searchParams` and passes it to `ProjectDetail` as `initialScrollTasklistId`, threaded to `<ListView scrollToTasklistId=.../>`. `_list-view.tsx` gained a `scrollToTasklistId?` prop, a stable `id={`tasklist-group-${g.id}`}` on each group wrapper, and a `useEffect` that scrolls the matching group into view once it's in the DOM (groups start expanded by default, so no auto-expand logic was needed).

### Files Changed
- `src/lib/programme/seed.ts` — Phase 2-5 milestone/tasklist seeding block in `seedAndStartProgramme`
- `src/app/api/projects/[projectId]/programme/route.ts` — added `phase_tasklists` to the GET response
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` — `Swimlane` interactive gate + prop rename, `tasklistIdByExternalId` state + population, `handleOpenPhaseDeliverable`, render call site update
- `src/app/v2/(hub)/projects/[projectId]/tasks/page.tsx` — parses `?tasklist=`, passes `initialScrollTasklistId`
- `src/app/v2/(hub)/projects/[projectId]/_project-detail.tsx` — threads `initialScrollTasklistId` prop to `<ListView>`
- `src/app/v2/(hub)/projects/[projectId]/_list-view.tsx` — `scrollToTasklistId` prop, group `id` attribute, scroll-into-view effect

### Deviations From Plan
- **The task doc's acceptance criteria mentions "Starting a new StackShift I or StackShift II programme... creates 4 milestones rows."** This is now stale relative to the architecture tasks 239/240 actually shipped with: `seedAndStartProgramme` is StackShift-I-only (task 240 fixed a bug where it was reachable for every classification; StackShift II always goes through task 239's separate `seedCustomPhases`/generic-model path and never calls this function at all). This task's seeding code is implemented exactly as specified in the Code Context and will correctly fire for every `seedAndStartProgramme` call — which in practice today means StackShift I only. Not a code defect, just a doc footnote the earlier tasks' refinements left behind; noting it here rather than silently editing the historical acceptance-criteria text.
- Everything else matches the task document as written — no scope changes.

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (2 pre-existing warnings in `_checklist-tab.tsx`, unrelated to this task)
- Manual/browser acceptance checks from the task doc's Verification section — SKIPPED (no live Supabase/browser session available in this implementation pass; recommend walking through the 3 listed scenarios — fresh StackShift I programme's Phase 2-5 cards, Phase 1 regression check, and a legacy pre-change project's graceful degradation — before shipping)

## Quality Gate Notes

### Result
PASS

### Standards Review
- `console.log`/`TODO`/`FIXME`/`: any`/`as any` sweep across all 6 changed files returned zero hits.
- **Found and fixed during this pass**: `_list-view.tsx`'s new scroll-to-tasklist `useEffect` depended on `[scrollToTasklistId, groups]` with no "already ran" guard — since `groups` (a `useMemo`) recomputes on every task edit/sort for the page's whole lifetime, and `scrollToTasklistId` never clears itself, the effect would re-fire and yank the user's scroll position back to the deep-linked group on every subsequent task change, not just once on arrival. Added a `useRef` guard so it scrolls exactly once, the first time the target group's DOM node exists. Re-verified `tsc`/`lint` after the fix.
- `seedAndStartProgramme`'s new Phase 2-5 seeding block matches the task doc's Code Context and the rest of the file's existing error-handling convention exactly (non-fatal `console.error` + `continue`, consistent with how the function already treats itself as best-effort for auxiliary side effects like `sendCliqNotification`).
- Prop rename was scoped correctly: `Swimlane`'s own incoming prop was renamed/retyped (`onOpenWizardStep` → `onOpenDeliverable`), but `DeliverableCard`'s prop name was deliberately left as `onOpenWizardStep` (it now just receives a phase-aware closure) — matches the task doc's explicit "no new prop threading beyond the renamed callback," and avoids a wider, unnecessary rename cascade through `DeliverableCard`'s own two call sites (`handleCardClick`, the expanded-panel button).
- `GET /api/projects/[projectId]/programme`'s new `tasklistsRes` query has no explicit `.error` check (unlike the three sibling queries in the same `Promise.all`) — on failure it silently falls through to `phase_tasklists: []`. This is intentional, not an oversight: this data only powers a best-effort deep-link (the task doc's own design explicitly wants a missing/failed mapping to degrade to a bare `/tasks` link, not fail the whole Timeline page load), so this asymmetry is correct behavior, not a bug — noting it here since it could look inconsistent at a glance.

### Deviations
- **Minor (documentation only)** — the task doc's acceptance criteria text mentions StackShift II being seeded by this same mechanism; already flagged and explained in Implementation Notes as stale relative to tasks 239/240's finalized architecture (`seedAndStartProgramme` is StackShift-I-only). No code impact — the seeding code is correct for every classification that actually reaches this function today.
- No Major or additional Medium deviations — every requirement, file-change target, and out-of-scope boundary in the task doc was respected as written.

### Required Fixes
- None (PASS). The scroll-effect re-trigger issue found during this review was fixed inline. Recommended non-blocking follow-up: the task doc's 3 manual browser scenarios haven't been exercised live — do that before shipping, particularly the legacy-project graceful-degradation path.
