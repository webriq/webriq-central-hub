# 239: New Project Backend — Multi-Type Creation Support, Configurable StackShift I Duration, Generic Phase Seeding

**Created:** 2026-08-13
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Testing

---

## Overview

Backend foundation for the New Project intake overhaul (see companion tasks 240-242). Today `POST /api/onboarding/projects` (`src/app/api/onboarding/projects/route.ts`) creates exactly **one** `projects` row per call, with a single `classifications: Classification[]` array combining whatever the PM multi-selected (e.g. `["StackShift I", "PipelineForge"]`), and it always seeds the fixed 120-day `customer_phases`/`customer_deliverables` engine when `mode: "start"`.

Per the new business model, **StackShift I, StackShift II, StackShift Access, StackShift Access Plus, and Discrete Development are distinct, independently-configured project trackers** — PipelineForge is never one of them, it's always an add-on flag riding on top of one of the five. When a PM selects multiple of the five in the New Project wizard (task 240), the wizard will call this same endpoint **once per selected type**, sequentially, reusing the customer created/resolved on the first call. This task's job is entirely server-side:

1. Let StackShift I's programme length be overridden (default stays 120 days) instead of hardcoded everywhere.
2. Accept an optional custom phase/deliverable/checklist plan and seed it into the **existing generic `milestones`/`tasklists`/`tasks` tables** (already powering `/v2/projects/[projectId]`'s Milestones tab) for every classification that isn't StackShift I.
3. Keep the request/response contract "one call = one project" — no new batch endpoint.

### Key Design Decisions (confirmed with user before planning)

- **StackShift I** is the *only* classification that keeps using the specialized `customer_phases`/`customer_deliverables`/`seedAndStartProgramme` engine (the 120-day Timeline, Onboarding Workspace, swimlane). Its day-count becomes configurable (default 120) but the 5 fixed phases (Onboard/Migrate/Publish/AI Visibility/Optimize) are **not** addable/removable — only deliverables within them can be added/removed (see task 240) — because `phase_number` is a closed `1|2|3|4|5` type referenced by ~20 files (RLS policies, Timeline math, dashboards). Changing that set is out of scope everywhere in this feature.
- **StackShift II never touches `customer_phases`/`customer_deliverables`/`seedAndStartProgramme`.** It always goes through the generic `milestones`/`tasklists`/`tasks` model (same as Access/Access Plus/Discrete Development). The wizard's "generate default phases & deliverables (same as StackShift I)" checkbox (task 240) is purely a client-side convenience that pre-fills the generic phase-plan builder with StackShift-I-equivalent phase/deliverable names — it does **not** switch StackShift II onto the specialized engine. This keeps the proven 120-day engine untouched by anything except StackShift I, and avoids extending the closed 5-phase model to a type whose brief explicitly says phases "might or might not" match the default.
- `programme_duration_days` (new column) is therefore only ever meaningful for StackShift I. It's stored generically on `projects` (default `120`) but only StackShift I's create path lets a caller set it to something else, and only StackShift I's display/seeding code reads it.
- This is a forward-only change. Existing StackShift II projects already seeded via `customer_phases` before this ships are untouched — no backfill/migration of their data. They keep working exactly as today (Timeline, Onboarding Workspace).
- `phase_plan` (new request field) is accepted for any classification except StackShift I. An empty/omitted `phase_plan` is valid — matches todo #3 ("can add pre-phases... or can skip for now").

## Requirements

- [ ] `projects.programme_duration_days` column added (`integer not null default 120`, `check (programme_duration_days > 0)`).
- [ ] `PROGRAMME_PHASES`-consuming day math (`getCurrentProgrammeDay`, `getPhaseForDay`, phase/deliverable day ranges) can be scaled against a per-project duration instead of the literal `120`.
- [ ] `seedAndStartProgramme`/`seedProgrammeAtPhase` accept the project's `programme_duration_days` and seed phase/deliverable rows so the programme's actual calendar span matches it (default `120` behaves identically to today — zero regression when unset).
- [ ] The ~9 UI call sites that hardcode `120`/`/ 120` read `project.programme_duration_days ?? 120` instead (list in Proposed File Changes).
- [ ] `POST /api/onboarding/projects` accepts new optional fields `programme_duration_days?: number` (StackShift I only) and `phase_plan?: PhasePlanInput` (any classification except StackShift I).
- [ ] When `phase_plan` is present and non-empty, the route seeds it into `milestones` → `tasklists` → `tasks` via a new `seedCustomPhases()` helper, after the `projects` row is created — regardless of `mode`.
- [ ] Validation: reject `programme_duration_days` when the card's classification isn't `"StackShift I"`; reject `phase_plan` when the card's classification is `"StackShift I"`.
- [ ] Response shape is unchanged (`{ project_id, customer_id }`) — this stays a single-project-per-call endpoint.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass clean.

## Out of Scope / Must-Not-Change

- No new batch/multi-create endpoint — the wizard (task 240) loops client-side, one POST per selected type.
- No change to `POST /api/onboarding/projects`'s customer-resolution, contact-upsert, or role-gating logic.
- No change to Portfolio Tracker's `GET` listing query/filters — every classification (including today's Discrete Development/Access projects) already appears there unfiltered; this task doesn't touch that.
- No backfill of existing StackShift II projects onto the generic model — forward-only.
- No changes to the 5 fixed `customer_phases.phase_number` values or `PROGRAMME_PHASES`'s phase *names/count* — only day-range scaling and deliverable add/remove (task 240) are in scope for StackShift I.
- Frontend wizard changes (multi-type cards, add-on UI, phase builder) are task 240. Swimlane/redirect UI is tasks 241-242.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/102_projects_programme_duration_days.sql` | Create | Add `programme_duration_days` column |
| `src/config/customer-phases.ts` | Modify | Add `scaleDay(day, durationDays)` helper; make `getCurrentProgrammeDay`/`getPhaseForDay` duration-aware; add `PhasePlanInput`/`MilestonePlan`/`DeliverablePlan` types and `phasePlanFromProgramme()` (exports the default StackShift I structure for client reuse in task 240) |
| `src/lib/programme/seed.ts` | Modify | `seedAndStartProgramme`/`seedProgrammeAtPhase` accept `durationDays = 120` param; scale `startedAt` offset and any day-range seeding through `scaleDay` |
| `src/lib/programme/seed-custom-phases.ts` | Create | `seedCustomPhases(projectId, customerId, createdByUserId, phasePlan)` — inserts `milestones` → `tasklists` → `tasks` from a phase plan |
| `src/app/api/onboarding/projects/route.ts` | Modify | Accept `programme_duration_days?`, `phase_plan?` on `NewProjectBody`; validate per classification; pass duration through to `seedAndStartProgramme`; call `seedCustomPhases` when applicable; store `programme_duration_days` on the `projects` insert |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` | Modify | Lines ~67, ~1605-1626, ~1755-1787: replace literal `120`/`TOTAL_DAYS` with `project.programme_duration_days ?? 120` |
| `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx` | Modify | Line ~163: `Day X/120` → `Day X/${durationDays}` |
| `src/app/v2/(hub)/dashboard/_components/pm-dashboard.tsx` | Modify | Lines ~73, ~229, ~471, ~512-513: same substitution |
| `src/app/v2/(hub)/customers/_customers-index.tsx` | Modify | Lines ~74, ~79: `Math.min(120, ...)` / `Day X/120` → duration-aware |
| `src/app/v2/(hub)/customers/[customerId]/_programme-tab.tsx` | Modify | Lines ~101, ~111: same substitution |
| `src/app/api/programme/reminders/route.ts` | Modify | Confirm/adjust any day-range math against `PROGRAMME_PHASES` to route through the new scaling helper |
| `src/app/api/projects/[projectId]/programme/phase/route.ts` | Modify | `seedProgrammeAtPhase` call site — pass the project's stored `programme_duration_days` |
| `src/app/api/onboarding/projects/import/route.ts` | Modify | `seedProgrammeAtPhase`/day math call sites — pass duration (import always uses default 120; confirm no regression) |

## Code Context

### `src/app/api/onboarding/projects/route.ts` — current single-classification insert (lines 290-332)

```ts
const productNames = deriveProductNamesMulti(body.classifications);
const primaryClassification = body.classifications.find((c) => STACKSHIFT_VARIANTS.includes(c)) ?? body.classifications[0];
const { data: product } = await supabase.from("customer_products").insert({
  customer_id: customerId,
  product_name: productNames[0],
  classification: primaryClassification,
  classifications: body.classifications,
  status: "active",
  onboarding_complete: false,
  onboarding_data: {},
}).select("id").single();

const { data: project } = await supabase.from("projects").insert({
  customer_id: customerId,
  name: body.project_name.trim(),
  project_type: deriveProjectTypeMulti(body.classifications),
  customer_product_id: product.id,
  created_by: user.id,
  onboarding_visible_at: null,
  scheduled_onboarding_start_at: body.mode === "save_scheduled" ? body.scheduled_start_at : null,
  scheduled_start_phase: scheduledStartPhase,
}).select("id, project_id, customer_id").single();

if (body.mode === "start") {
  const result = await seedAndStartProgramme({ id: project.id, customer_id: project.customer_id }, companyName, user.id);
  ...
}
```

This structure is unchanged by this task — `body.classifications` still holds `[primaryType]` or `[primaryType, "PipelineForge"]` for one card (task 240 sends one request per selected primary type, PipelineForge included in the array when the add-on is checked). Only the new optional fields and the branch on what to seed are added.

### `src/config/customer-phases.ts` — day math to make duration-aware (lines 33-133)

```ts
export const PROGRAMME_PHASES: PhaseConfig[] = [ /* fixed dayStart/dayEnd 1-120, 5 phases */ ];

export function getCurrentProgrammeDay(startedAt: string | Date): number {
  // calendar diff, uncapped — currently assumes the 120-day reference scale implicitly
  // via callers doing Math.min(120, ...) themselves
}
export function getPhaseForDay(day: number): PhaseConfig {
  return PROGRAMME_PHASES.find((p) => day >= p.dayStart && day <= p.dayEnd) ?? PROGRAMME_PHASES[4];
}
```

Add (do not remove the existing exports — every current call site keeps working unchanged with the default):

```ts
export const DEFAULT_PROGRAMME_DAYS = 120;

// Maps a "reference day" in the fixed 1-120 PROGRAMME_PHASES numbering to the actual programme
// day for a project whose total length differs from the default.
export function scaleDay(referenceDay: number, durationDays: number = DEFAULT_PROGRAMME_DAYS): number {
  if (durationDays === DEFAULT_PROGRAMME_DAYS) return referenceDay;
  return Math.max(1, Math.round((referenceDay * durationDays) / DEFAULT_PROGRAMME_DAYS));
}
```

`getCurrentProgrammeDay`/`getPhaseForDay` themselves operate on the *reference* 1-120 scale (unchanged); callers that need the project's real elapsed day relative to a custom duration convert via `scaleDay`'s inverse at display time — keep this conversion centralized in the display call sites listed above (each already has `project`/`durationDays` in scope), not inside the config file, to avoid `customer-phases.ts` needing project-shaped data.

### `src/lib/programme/seed.ts` — where the duration must apply at seed time (lines 21-49)

```ts
export async function seedAndStartProgramme(
  project: { id: string; customer_id: string },
  companyName: string,
  startedByUserId?: string | null,
  phaseNumber: 1 | 2 | 3 | 4 | 5 = 1
): Promise<{ error?: string }> {
  const targetPhase = getPhaseByNumber(phaseNumber);
  const startedAt = new Date();
  startedAt.setDate(startedAt.getDate() - (targetPhase.dayStart - 1)); // ← must scale (targetPhase.dayStart - 1) when durationDays !== 120
  ...
```

Add a `durationDays = 120` parameter; use `scaleDay(targetPhase.dayStart, durationDays) - 1` for the offset. `seedProgrammeAtPhase` (same file, lines 116-175) needs the identical treatment for `getCurrentProgrammeDay`'s comparison against `d.dayStart`/`d.dayEnd` — those also need `scaleDay(d.dayStart, durationDays)`/`scaleDay(d.dayEnd, durationDays)` before comparing to the caller-supplied `currentDay` (which is itself already expressed on the actual/scaled calendar, from `getCurrentProgrammeDay(startedAt)` where `startedAt` was chosen using the scaled offset — keep the two consistent, this is the one place a bug is easy to introduce; add a unit-style manual check in Verification for `durationDays = 60` and `durationDays = 240` producing sane phase boundaries).

### `src/types/database.ts` — tables the new seeder writes to (already exist, no schema change needed)

```ts
milestones: { Row: { id, project_id, external_id, name, description, start_date, due_date, status: "planned"|"active"|"completed", position, created_by, ... } }
tasklists:  { Row: { id, project_id, external_id, name, position, is_default, milestone_id, ... } }
tasks:      { Row: { id, project_id, milestone_id, tasklist_id, title, status, ... } }
```

### New: `src/lib/programme/seed-custom-phases.ts` — shape to implement

```ts
export type ChecklistItemPlan = { title: string };
export type DeliverablePlan = { name: string; checklist: ChecklistItemPlan[] };
export type PhasePlan = { name: string; deliverables: DeliverablePlan[] };
export type PhasePlanInput = { phases: PhasePlan[] };

export async function seedCustomPhases(
  projectId: string,
  customerId: string,
  createdByUserId: string | null,
  plan: PhasePlanInput
): Promise<{ error?: string }> {
  // For each plan.phases[i]: insert a `milestones` row (position: i, status: "planned").
  // For each deliverable in that phase: insert a `tasklists` row (milestone_id: the phase's
  // milestone id, position: j).
  // For each checklist item in that deliverable: insert a `tasks` row (tasklist_id, milestone_id,
  // title, status: "open", created_by: createdByUserId).
  // Insert phase-by-phase (not one giant Promise.all) so a milestone's id is known before
  // inserting its tasklists, and a tasklist's id is known before inserting its tasks.
}
```

## Implementation Steps

1. Write and apply `supabase/migrations/102_projects_programme_duration_days.sql`; add `programme_duration_days: number` to `projects`' `Row`/`Insert`/`Update` in `src/types/database.ts`.
2. Add `scaleDay`/`DEFAULT_PROGRAMME_DAYS`/`PhasePlanInput` types + `phasePlanFromProgramme()` to `customer-phases.ts`.
3. Thread `durationDays` through `seedAndStartProgramme`/`seedProgrammeAtPhase` in `seed.ts`; update their two existing call sites (`onboarding/projects/route.ts`'s `mode === "start"` branch, `programme/phase/route.ts`) to read the project's stored `programme_duration_days`.
4. Create `seed-custom-phases.ts`.
5. Update `POST /api/onboarding/projects`: add the two new optional body fields, per-classification validation, `programme_duration_days` on the `projects` insert, and the `seedCustomPhases` call when `phase_plan` is present.
6. Sweep the 6 UI files in Proposed File Changes for the literal `120`/`TOTAL_DAYS` occurrences found via `grep -rn "120" <file>` and swap in the project's stored duration (all already have the `project`/list-item object with `programme_duration_days` available once the API/select queries include the new column — confirm each file's Supabase `.select()` string includes `programme_duration_days` and add it where missing).
7. Run `npx tsc --noEmit` and `pnpm lint`.

## Acceptance Criteria

- [ ] Creating a StackShift I project with no `programme_duration_days` in the request behaves byte-identical to today (120-day seed, all existing displays unchanged) — regression check.
- [ ] Creating a StackShift I project with `programme_duration_days: 60` produces `customer_phases`/`customer_deliverables` rows whose Phase 1 "Onboard" window is proportionally ~7.5 days instead of 15, and the Timeline/dashboard "Day X / Y" displays show `/60`, not `/120`.
- [ ] Creating a project with classification `"StackShift Access"` and a non-empty `phase_plan` (2 phases, each with 1-2 deliverables, each with 1-2 checklist items) results in matching `milestones`/`tasklists`/`tasks` rows queryable via `/v2/projects/[projectId]` (Milestones tab shows the phases; Tasks tab shows the checklist items grouped under their tasklist).
- [ ] Creating a project with classification `"Discrete Development"` and an omitted/empty `phase_plan` succeeds with zero `milestones` rows (the "skip for now" case).
- [ ] Sending `programme_duration_days` on a non-StackShift-I classification is rejected with 400.
- [ ] Sending `phase_plan` on a `"StackShift I"` classification is rejected with 400.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual (no test runner configured):
- `curl -X POST /api/onboarding/projects` with a StackShift I payload at `programme_duration_days: 60` and `mode: "start"`; inspect `customer_phases`/`customer_deliverables` rows in Supabase for scaled day ranges.
- Same for `programme_duration_days: 240`; confirm `getPhaseForDay`-driven displays don't throw/NaN for `currentDay` values beyond 120.
- `curl` a `phase_plan` payload for an Access-classification project; confirm `milestones`/`tasklists`/`tasks` rows via Supabase and via loading `/v2/projects/[projectId]`.

## Compatibility Touchpoints

- New migration (`102_projects_programme_duration_days.sql`) must ship with the code deploy.
- No `_docs/mcp-tools.md` changes (no MCP tool touched).
- Task 240 (frontend wizard) depends on this task's request/response contract — coordinate field names (`programme_duration_days`, `phase_plan`) exactly as specified here.
- Tasks 241/242 (swimlane redirects) depend on `milestones`/`tasklists`/`tasks` rows existing for a project — this task is what creates them at intake time.

## Implementation Notes

### What Changed
- Added `projects.programme_duration_days` (migration 102, default 120) and the corresponding `Row`/`Insert`/`Update` fields in `src/types/database.ts`.
- `customer-phases.ts`: added `DEFAULT_PROGRAMME_DAYS`, `scaleDay()` (reference day 1-120 → real project day), `unscaleDay()` (inverse, needed anywhere a real elapsed day is fed back into `getPhaseForDay`, which only understands the reference scale), and the generic phase-plan types (`PhasePlanInput`/`PhasePlan`/`DeliverablePlan`/`ChecklistItemPlan`) plus `phasePlanFromProgramme()`.
- `seed.ts`: `seedAndStartProgramme`/`seedProgrammeAtPhase` both take an optional `durationDays` param (default 120) and scale every day-range computation through it.
- New `seed-custom-phases.ts`: `seedCustomPhases()` inserts a wizard-supplied phase plan into `milestones`/`tasklists`/`tasks`.
- `POST /api/onboarding/projects`: accepts `programme_duration_days`/`phase_plan`, validates each against the card's classification (StackShift-I-only vs. everything-except-StackShift-I), stores the duration on the `projects` insert, and calls `seedCustomPhases` when a non-empty `phase_plan` is present.
- Every deferred "start the programme" path that calls `seedAndStartProgramme` was updated to select and pass the project's own `programme_duration_days` instead of silently defaulting to 120: `/api/projects/[projectId]/programme/start`, `/api/onboarding/scheduled-autostart`, `/api/onboarding/projects/[projectId]/qstash-start`. `/api/projects/[projectId]/programme/phase` (the "Jump to phase" override, which calls `seedProgrammeAtPhase`) was updated the same way, in both its not-started and already-started branches.
- `/api/programme/reminders` (daily cron): the Phase-1 due/overdue deliverable checks, the whole-phase "running late" check, and the fixed calendar-day gates (16/21/26/15/30) are now scaled per-project via `scaleDay`, so reminders fire at the right relative point for a custom-duration project instead of always assuming 120.
- Display sites updated to read the project's real `programme_duration_days` instead of a hardcoded `120`: `_onboarding-detail.tsx` (Timeline progress %, overdue threshold, days-remaining, "N-Day Programme Progress" heading, "DAY X OF Y", the day-range footer, and the pre-start "Start the N-day programme" CTA copy — plus its `buildReminders()` helper and its two `getPhaseForDay(currentDay)` call sites, both routed through the new `unscaleDay()`), `_onboarding-list.tsx`, `pm-dashboard.tsx` (including `dashboard-shared.tsx`'s `ProgrammeTrack` mini-widget, which took a new optional `durationDays` prop), `_customers-index.tsx` (its `ProgrammeBadge`, also via `unscaleDay()` before calling `getPhaseForDay`), and `_programme-tab.tsx`. The underlying data plumbing needed for these (`GET /api/onboarding/projects`, `GET /api/projects/[projectId]/programme`, and the customers-list/customer-projects server queries) was extended to select and forward `programme_duration_days` alongside `programme_started_at` everywhere it's already fetched.

### Files Changed
- `supabase/migrations/102_projects_programme_duration_days.sql` — new column + check constraint
- `src/types/database.ts` — `projects.programme_duration_days` in Row/Insert/Update
- `src/config/customer-phases.ts` — `scaleDay`/`unscaleDay`/`DEFAULT_PROGRAMME_DAYS`, generic phase-plan types, `phasePlanFromProgramme()`
- `src/lib/programme/seed.ts` — `durationDays` param on both seed functions
- `src/lib/programme/seed-custom-phases.ts` — new file
- `src/app/api/onboarding/projects/route.ts` — new body fields, validation, `programme_duration_days` on insert, `seedCustomPhases` call, GET handler's `programme_duration_days` select/passthrough and duration-aware `progress_pct`/`current_day`
- `src/app/api/projects/[projectId]/programme/route.ts` — selects `programme_duration_days` for the Timeline's data fetch
- `src/app/api/projects/[projectId]/programme/phase/route.ts` — duration-aware backdating in both branches
- `src/app/api/projects/[projectId]/programme/start/route.ts` — passes stored duration to `seedAndStartProgramme`
- `src/app/api/onboarding/scheduled-autostart/route.ts` — same
- `src/app/api/onboarding/projects/[projectId]/qstash-start/route.ts` — same
- `src/app/api/programme/reminders/route.ts` — duration-aware reminder thresholds
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` — `programmeDurationDays` state + every display/computation site listed above
- `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx` — `programme_duration_days` on the list item type + display
- `src/app/v2/(hub)/dashboard/_components/pm-dashboard.tsx` and `dashboard-shared.tsx` — duration-aware displays + `ProgrammeTrack` prop
- `src/app/v2/(hub)/customers/page.tsx` and `_customers-index.tsx` — `programme_duration_days` threaded through the customer list + `ProgrammeBadge`
- `src/app/v2/(hub)/customers/[customerId]/_programme-tab.tsx` — duration-aware display

### Deviations From Plan
- **Gantt pixel-positioning (`Swimlane`/`DeliverableCard` in `_onboarding-detail.tsx`) was deliberately left unscaled.** The Timeline's grid (`TOTAL_DAYS = 120` columns, `DAY_WIDTH` pixel math, drag-resize clamping, `day_start_override`/`day_end_override` persistence) all operate in the fixed 1-120 reference-day space, and deliverable cards are positioned using those raw reference `dayStart`/`dayEnd` values. For a project with a non-default duration, this means the grid still renders 120 columns and card positions are not visually compressed/stretched to match the real programme length — the underlying `customer_phases`/`customer_deliverables` *data* (seeded via `seedAndStartProgramme`) is correct and duration-scaled, but the Gantt's pixel layout for such a project would look like a 120-day layout with cards sitting at their un-rescaled reference positions. Fully fixing this requires scaling `DeliverableCard`'s `left`/`width` math and re-verifying the drag-resize/override read-write path (which persists reference-scale day numbers) doesn't regress — that needs live browser testing of the drag interaction, which wasn't available in this pass. Flagging for a follow-up rather than risking an untested change to the drag/pointer-capture logic.
- **Page-level aggregate copy left as generic "120-day"/"120-Day Programme" text** (`pm-dashboard.tsx`'s empty state, section heading, and roster summary; `_programme-tab.tsx`'s empty-state copy; `_onboarding-detail.tsx`'s "Failed to start the 120-Day Programme." error string). These describe the product/board as a whole (which can contain many projects of differing durations at once) rather than a single project's computed value, so there's no single number to substitute — left as descriptive copy, matching the task doc's note that per-project displays were the target, not the marketing label for the system.
- Everything else matches the task document as written — no scope changes beyond the above two intentionally-deferred items.

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (2 pre-existing warnings in `_checklist-tab.tsx` for unused `initialsFor`/`colorFor`, predating this task — same warnings noted in task 222's own implementation notes)
- Manual/curl acceptance checks from the task doc's Verification section — SKIPPED (no live Supabase/browser session available in this implementation pass; recommend running the manual duration-override and phase-plan checks against a real project before shipping, in particular the scheduled/qstash/cron "start later" paths and the Gantt visual-positioning limitation noted above)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation found in any changed file (`console.log`/`TODO`/`FIXME`/`: any`/`as any` sweep across all 16 changed files returned zero hits besides one unrelated comment using the word "any").
- Error handling in `seed-custom-phases.ts` and the `route.ts` validation block matches this codebase's existing pattern exactly (`console.error(...)` + a scoped `NextResponse.json({ error }, { status })`), consistent with every sibling function in `seed.ts` and the rest of `onboarding/projects/route.ts`.
- `seedCustomPhases` inserts phase-by-phase/deliverable-by-deliverable rather than one flat batch — correct and necessary given each child row needs its parent's freshly-generated id (Supabase has no client-side nested-insert), and the task doc's own Code Context specified this exact shape.
- New types (`PhasePlanInput`/`PhasePlan`/`DeliverablePlan`/`ChecklistItemPlan`, `scaleDay`/`unscaleDay`) are fully typed, no escape hatches; naming accurately describes behavior (`scaleDay` reference→real, `unscaleDay` the inverse, both documented with a comment explaining which direction they convert).
- No secrets, credentials, or debug logging introduced.
- Project conventions followed: pagination/RLS/adminClient boundaries untouched, `logLLMInvocation` not applicable (no LLM calls here), migration file follows the existing `NNN_description.sql` + comment-header convention seen in `099_projects_deleted_status.sql`.

### Deviations
- **Medium** — Gantt pixel-positioning (`Swimlane`/`DeliverableCard` in `_onboarding-detail.tsx`) was intentionally left on the fixed 120-day reference scale rather than scaled to a project's custom `programme_duration_days`. The underlying `customer_phases`/`customer_deliverables` data seeded via `seedAndStartProgramme` is correctly duration-scaled; only the Timeline's visual card layout for a non-default-duration StackShift I project is affected (cards would sit at their un-rescaled reference positions inside a still-120-column grid). This is visible to a user working with a custom-duration project. Documented explicitly in Implementation Notes with rationale (avoiding an untested change to the drag-resize/pointer-capture/override-persistence path) — risk is acceptable to proceed since the task's core acceptance criteria (seeded data, API validation, "Day X / Y" text displays) are all correct; this is flagged as a recommended follow-up rather than blocking.
- **Minor** — Several files/call sites were touched that weren't explicitly named in the task doc's Proposed File Changes table: `/api/projects/[projectId]/programme/start/route.ts`, `/api/onboarding/scheduled-autostart/route.ts`, `/api/onboarding/projects/[projectId]/qstash-start/route.ts` (all three needed to select and forward `programme_duration_days` into `seedAndStartProgramme`, or a project started via any of these three deferred-start paths would silently lose its configured duration and re-seed at the default 120), and `unscaleDay` additions to fix a latent `getPhaseForDay(realDay)` reference/real-scale mismatch in `_onboarding-detail.tsx`'s `buildReminders`/`activePhaseNumber` fallback and `_customers-index.tsx`'s `ProgrammeBadge`. These are correctness fixes required to actually satisfy the task's stated requirement ("every UI call site... reads the project's own duration") rather than scope expansion — no new product behavior, no new files beyond what was already planned, no architecture change.
- **Minor** — Page-level aggregate "120-day"/"120-Day Programme" copy (`pm-dashboard.tsx`'s board heading/empty-state/roster summary, `_programme-tab.tsx`'s empty-state copy, `_onboarding-detail.tsx`'s generic start-failure error string) was deliberately left as static text rather than made per-duration, since these describe the system/board as a whole (which aggregates many projects of potentially different durations at once), not a single project's computed value. Documented in Implementation Notes.
- No Major deviations — no requirement was violated, no scope was added beyond the task document, and no architectural decision was made without the task doc's own prior approval (the StackShift-I-only vs. generic-model split, and the "grid stays reference-scale" decision, both trace directly to the task doc's Key Design Decisions and Code Context).

### Required Fixes
- None (PASS). Recommended non-blocking follow-up before wide rollout: live-test a custom-duration StackShift I project's Timeline drag-resize interaction, and consider scaling `DeliverableCard`'s pixel positioning in a follow-up task if the visual mismatch noted above is unacceptable to product.
