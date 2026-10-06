# 433: Add a Deliverable to a Phase on an Already-Started Project (Timeline)

**Created:** 2026-10-06
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Question that prompted this: "how can I add the deliverables?"

Today a programme deliverable (`project_deliverables` row, `source = 'programme'`) can only be created at **programme-setup time**: the Phase Builder's "Add deliverable" button (`src/components/programme/phase-builder.tsx:320`, used by New Project `_phases-step.tsx` and the StackShift-order `_phase-setup-dialog.tsx`) feeds `seedAndStartProgramme` / `seedProgrammeAtPhase` (`src/lib/programme/seed.ts`). Once the programme has started there is **no API and no UI** to add one — the only programme-deliverable routes are `PATCH` status and `PATCH` schedule. Users who need an extra deliverable mid-project have to edit the DB.

This task adds "Add deliverable" to a phase on the project **Timeline** (`/projects/v2/[projectId]/timeline`).

Decisions (confirmed with the user):
- Surface: the existing project's Timeline.
- Who can add: **admin, super_admin, marketing, and pm**.

## Requirements

- [ ] `POST /api/projects/[projectId]/programme/deliverables` creates a `project_deliverables` row (`source='programme'`) in a given phase. Body: `phase_number` (int > 0), `name` (trimmed, non-empty, max length consistent with Phase Builder), optional `day_start`/`day_end` (display-scale ints, within the phase's stored `day_start..day_end`, `day_start <= day_end`). Default span when omitted: the phase's last day (or whole phase if one-day) — pick one and document.
- [ ] Role gate: `admin | super_admin | marketing | pm` (401 unauthenticated, 403 otherwise).
- [ ] Server generates a unique `deliverable_key` (slug of name, de-duplicated within the phase against the unique constraint from migration 161 — verify its exact scope), `position = max(position in phase)+1`, `status='pending'`, `is_default=false`, `phase_id` resolved via `getProgrammePhase`.
- [ ] Derived `start_date`/`due_date` computed the same way the schedule route does (`displayDayToYmd` from `programme_started_at`; null if no start date).
- [ ] Rejects: unknown phase, phase with `status` skipped/excluded, project whose programme has not started (use Phase Builder instead), duplicate name in the phase (case-insensitive, 409).
- [ ] Timeline UI: an "Add deliverable" affordance per phase on the swimlane (StackShift swimlane `_swimlane.tsx` and generic `_generic-swimlane*.tsx`), visible only to permitted roles, opening a small inline form/popover (name + optional day range). Needs loading state, inline error, and keyboard/aria support per CLAUDE.md UI Polish Conventions; uses the `isDark` prop pattern, no `dark:` classes, no `style={{}}`.
- [ ] New card appears immediately for the actor (optimistic or from the response) and for other viewers via the existing `project_deliverables` realtime subscription (`_onboarding-detail.tsx:429`).
- [ ] `notifyProjectMembers` is NOT required (not requested); skip.
- [ ] Opening the new deliverable's card must not crash for a deliverable absent from `DELIVERABLE_WORKSPACE_TARGET` (`handleOpenWizardStep` already falls back to `business-info`; confirm Phase 2+ opens Tasks tab filtered to the new row's id).

## Out of Scope / Must-Not-Change

- Rename, delete, reorder of deliverables (follow-ups).
- Adding **phases**, or editing the Phase Builder / seed functions.
- Checklist items (`onboarding_internal_deliverables`, `wizard_data`) for the new deliverable.
- Work-breakdown (`source != 'programme'`) deliverables / tasklists and Create Task modal.
- Do not change existing `PATCH` routes' role lists, and do not rescale existing deliverables' day ranges.
- Do not apply migrations (written-not-applied convention).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/projects/[projectId]/programme/deliverables/route.ts` | Create | `POST` handler (auth, role gate, validation, insert) |
| `src/lib/programme/store.ts` | Modify | Add `createProgrammeDeliverable()` helper (key de-dup, position, date derivation) kept pure/testable |
| `src/lib/programme/__checks__/add-deliverable.check.ts` | Create | Pure checks: key slug/de-dup, position, default day span, bounds |
| `src/app/(hub)/projects/v2/[projectId]/_add-deliverable-popover.tsx` | Create | Form UI (name, days), loading/error states |
| `src/app/(hub)/projects/v2/[projectId]/_swimlane.tsx`, `_generic-swimlane-lane.tsx`, `_onboarding-detail.tsx` | Modify | Render the affordance per phase; handler wiring + state merge |
| `supabase/migrations/162_*.sql` | Only if RLS route chosen (see below) | Widen `project_deliverables_write` for `pm` on `source='programme'` |

## Code Context

### RLS gotcha (decide before coding)

`supabase/migrations/160_expand_project_phases_deliverables.sql:104-108`:

```sql
create policy project_deliverables_write on project_deliverables for all to authenticated
  using ((source <> 'programme' and get_my_role() in ('admin','super_admin','pm'))
      or (source = 'programme' and get_my_role() in ('admin','super_admin','marketing')))
```

`pm` can NOT write `source='programme'` rows via the user-scoped client, yet the requirement includes PM. Two options:

1. **(Recommended) Route-level role check + `adminClient` insert**, as `programme/generic-phase/route.ts` already does for its project update. No migration, narrowly scoped to insert-only; document the exception inline. Auth and role are checked with the session client first.
2. Migration 162 adding `pm` to the programme branch — but that also grants PM update/delete of every programme row (status, schedule), widening the existing PATCH routes' effective access. Rejected unless the user wants that.

Note the existing PATCH routes use `WRITE_ROLES = ["admin","super_admin","marketing"]` (no pm), so a PM could add a deliverable but not change its status/schedule. Flag this in the handoff; do not silently change it.

### File: `src/app/api/projects/[projectId]/programme/deliverables/[deliverableKey]/schedule/route.ts` (pattern to mirror)

```ts
const phase = await getProgrammePhase(supabase, projectId, phaseNumber);
const startedAt = project?.programme_started_at ?? null;
start_date: startedAt ? displayDayToYmd(startedAt, asDisplayDay(dayStart)) : null,
```
Body day values are DISPLAY-scale, stored as-is (task 429 D-B), bounded by the phase's own `day_start..day_end`.

### File: `src/lib/programme/store.ts`

`ProgrammePhase = ProjectPhaseRow & { state; deliverables }`; deliverables fetched with `.eq("source","programme")`; ordered by `position`. `getProgrammePhase(client, projectId, phaseNumber)` and `getProgrammeDeliverable(...)` resolve by `phase_number` + `deliverable_key`.

### File: `src/types/database.ts` — `project_deliverables.Insert`

`project_id` and `name` required; `phase_id`, `day_start`, `day_end`, `deliverable_key`, `position`, `start_date`, `due_date`, `status`, `source` optional.

### Read before implementing

`seed.ts` ~lines 140-175 and 300-345 (`insertUnifiedProgramme`: how rows/keys are built), migration `161_fix_project_deliverables_key_unique.sql` (key uniqueness scope), `view-model.ts` (`buildDisplayPhases` — confirm a manual extra deliverable renders in both swimlanes and in status reports/health), and the generic-engine view to see whether it reads `project_deliverables` or still `tasklists` after the task 429 cutover.

## Implementation Steps

1. Read the files above; confirm key-uniqueness scope and that both swimlanes render any `project_deliverables` row of the phase.
2. Implement pure helper(s) in `store.ts` (slug/de-dup key, next position, default day span) + `__checks__/add-deliverable.check.ts`.
3. Implement `POST .../programme/deliverables` per Requirements (session auth → role gate → validate → `adminClient` insert with inline exception comment → return the row).
4. Build `_add-deliverable-popover.tsx` (`isDark` prop, spinner on submit, inline error, `aria-label`s, visible hover/focus).
5. Wire into the StackShift swimlane and generic swimlane lanes, gated by role; merge the returned row into `deliverables` state in `_onboarding-detail.tsx` (dedupe with the realtime insert event by `id`).
6. Manual browser pass (see Verification), then update `CLAUDE.md` only if a convention changes (likely a one-line note under the programme/deliverables bullet).

## Acceptance Criteria

- [ ] As admin, super_admin, marketing and pm, a deliverable can be added to any non-skipped phase of a started project from the Timeline; the card appears with correct day span and dates.
- [ ] Developer/client roles see no affordance and get 403 from the API.
- [ ] Duplicate name in the same phase → 409 with an inline error; empty name → 400; out-of-range days → 400; unstarted programme → 400.
- [ ] Two open browsers: the second sees the new card without refresh and without a duplicate.
- [ ] New deliverable's status can be changed by roles allowed on the existing PATCH routes, and its card opens without error.
- [ ] Existing deliverables, phase totals/progress and status report still compute (progress denominators include the new row).
- [ ] No migration needed (option 1), `npx tsc --noEmit` and `pnpm lint` clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
npx tsx src/lib/programme/__checks__/add-deliverable.check.ts   # match how existing __checks__ are run
# Browser: /projects/v2/<project_id>/timeline as each role; add, duplicate, bad-range, realtime in 2nd tab
```

## Compatibility Touchpoints

- RLS: programme-source write excludes `pm` (see RLS gotcha); no policy change under option 1.
- `_docs/mcp-tools.md`: unaffected (no MCP tool added).
- CLAUDE.md: add a short note on mid-programme deliverable creation if implemented as designed.
- Programme health/status-report/dashboards count programme deliverables; verify they include manual additions without special-casing.

## Implementation Notes

### What Changed
- `POST /api/projects/[projectId]/programme/deliverables` adds a programme deliverable to a phase of a started project (roles admin/super_admin/marketing/pm; insert via `adminClient` after session + role check, so no migration).
- Pure helpers (`add-deliverable.ts`) for key slug/de-dup, position, duplicate-name check, default and validated day span; 6 checks added to `pnpm check:logic`.
- StackShift swimlane label cell gets an "Add deliverable" inline form (name + optional day pair); the new row merges into state (deduped against the realtime INSERT).

### Files Changed
- `src/lib/programme/add-deliverable.ts` - pure helpers
- `src/lib/programme/__checks__/add-deliverable.check.ts`, `run.ts` - checks + registration
- `src/app/api/projects/[projectId]/programme/deliverables/route.ts` - POST handler
- `src/app/(hub)/projects/v2/[projectId]/_add-deliverable-form.tsx` - form UI
- `src/app/(hub)/projects/v2/[projectId]/_swimlane.tsx`, `_onboarding-detail.tsx` - wiring, `canAddDeliverable`, `handleDeliverableAdded`

### Deviations From Plan
- Helper functions live in a new `add-deliverable.ts` rather than `store.ts` (keeps store.ts to data access). `defaultDeliverableSpan` takes only the phase end day.
- UI wired to the StackShift swimlane only. The generic swimlane (`_generic-swimlane-lane.tsx`) still renders milestones/tasklists (non-programme work-breakdown rows), which the task lists as out of scope — not touched. Follow-up if wanted.
- The swimlane is light-only (hard-coded colours, no `isDark`), so the form follows that rather than the `isDark` pattern.
- The 23505 race-condition branch was dropped (it returns 500); duplicate names are caught by the pre-check, so only a concurrent same-name add would hit it.
- Not done: no browser pass yet (needs the Testing stage).

### Verification Run
- `npx tsc --noEmit` - PASS for `src/` (only pre-existing errors in the generated `.next/dev/types/routes.d.ts`)
- `npx eslint` on the changed files - PASS (no output)
- `npx tsx src/lib/programme/__checks__/run.ts` - PASS (73/73; `pnpm check:logic` itself crashes in pnpm's deps check)
- Browser acceptance - SKIPPED (Testing stage)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No dead code, `any`, or debug logging; errors handled with intentional status codes (400/401/403/404/409/500). Guard clauses throughout the route.
- Fix applied during review: the insert's `23505` (per-phase key unique index, migration 161) now maps to 409 instead of 500, restoring what the Implementation Notes called "dropped".
- Reverted an unrelated `pnpm-workspace.yaml` edit (`esbuild: set this to true or false`) that a crashed `pnpm` run left behind; not part of this task.
- Inline `adminClient` exception is documented in the route per CLAUDE.md ("Never bypass RLS with adminClient for regular reads" — this is a write, role-gated first).
- Form matches the swimlane's existing light-only styling; Tailwind classes only, `aria-label`s, loading + inline error states, hover/focus rings present.

### Deviations
- Minor: helpers in `add-deliverable.ts` instead of `store.ts`.
- Medium (visible to the user): UI wired to the StackShift swimlane only; the generic swimlane (milestones/tasklists, non-programme rows) is untouched. PM can add but not change status/schedule of a programme deliverable (existing PATCH routes unchanged by design).

### Required Fixes
- None.

## Follow-up (2026-10-06): generic Timeline

The user's project (StackShift II, generic milestones/tasklists Timeline) showed no button — the swimlane deliverable form had only been wired into StackShift I's swimlane (deviation above). Scope widened at the user's request to cover the generic Timeline too:
- `POST /api/projects/[projectId]/programme/generic-deliverables` (body `milestone_id`, `name`, optional `day_start`/`day_end`) — inserts a `source='manual'` `project_deliverables` row with `phase_id = milestone`, roles admin/super_admin/marketing/pm via `adminClient` (RLS lets only admin/super_admin/pm write manual rows). Days are in the phase's own coordinates; default is a one-day deliverable on the phase's last day, or unscheduled when the phase has no day range. Returns the `tasklists` view shape (`milestone_id`).
- `_add-deliverable-form.tsx` generalised (`endpoint` + `target` props, generic row type); wired through `_generic-phase-view.tsx` → `_generic-swimlane.tsx` → `_generic-swimlane-lane.tsx`.
- Bug fixed on the way: `_use-generic-realtime.ts` merged raw `project_deliverables` rows (`phase_id`) into state typed as the `tasklists` view (`milestone_id`), so a live-updated deliverable would lose its lane; it now maps `phase_id → milestone_id`. Without this, the realtime INSERT echo would have replaced the just-added card with a lane-less row.
- Verification: `tsc` (src) and eslint on the touched files clean; browser pass still pending (Testing stage).

## Follow-up (2026-10-06): modal instead of inline form

Per user preference the inline label-cell form was replaced by a modal (design: `_final_design/guide/central-hub-design-system.md` tokens; shell mirrors `projects/_shared/_create-task-modal.tsx`; file sizes per `nextjs-file-length-best-practices.md`).
- `_add-deliverable-button.tsx` (47 lines) — trigger in each swimlane label cell; owns open state.
- `_add-deliverable-modal.tsx` (158) — portal dialog: `role="dialog"`/`aria-modal`/`aria-labelledby`, Escape + overlay close (blocked while saving), Tab trap, focus returns to the trigger. Title in the display face, phase chip in its phase hue + mono day range, Name field, optional Schedule (mono Day inputs with a hint: blank → last day of phase, or "unscheduled" when the phase has no range), inline field errors (`aria-invalid`, `role="alert"`), tinted footer with ghost Cancel + blue "Add deliverable" (spinner, "Adding…").
- `_use-add-deliverable.ts` (73) — state, client validation, submit; a 409 is shown on the Name field.
- Removed `_add-deliverable-form.tsx`; `_swimlane.tsx` and `_generic-swimlane-lane.tsx` now use the button and pass `phaseChipClass`.
- Verification: `tsc` (src) and eslint clean. Visual/browser pass NOT done (Chrome extension not connected) — do in Testing.
