# 246: StackShift I/II Timeline — Custom Phases Beyond the Fixed 5 (Implementation)

**Created:** 2026-08-14
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep
**Status:** Completed

**Depends on:** task 245 (`StackShift I/II Timeline — Support Custom Phases Beyond the Fixed 5`, research/design — fully resolved). This task implements task 245's already-confirmed Data Model Proposal, Blast-Radius Classification, and Confirmed UI Requirements verbatim — it does not re-derive or re-litigate any of those decisions. Read `_docs/task/245-stackshift-timeline-custom-phases-beyond-fixed-five.md` in full before starting; this doc cites it by section rather than repeating it.

Also depends on tasks 239/240 (generic `phase_plan`/`milestones` model) and 244 (StackShift I default-phase skip, `Testing`) — this task edits files those tasks introduced/shipped.

---

## Overview

Today a StackShift I project's 5 phases (Onboard, Migrate & Rebrand, Publish, AI Visibility, Optimize) are entirely defined by the static `PROGRAMME_PHASES` array in `src/config/customer-phases.ts` — identical for every project, with only *state* (status, actual dates, deliverable day-range overrides) stored per-project in `customer_phases`/`customer_deliverables`. This task lets a PM add genuinely new phases (6th+, or inserted between existing ones) to a specific project's Timeline, per task 245's resolved design:

- **New columns**, not a new table: `customer_phases` gains `custom_name`, `day_start_override`, `day_end_override`, `sort_order`; `customer_deliverables` gains `custom_name`, `custom_description`, `custom_owner`. All nullable — a phase/deliverable with these all `null` behaves byte-identically to today (falls back to `PROGRAMME_PHASES`/static `DeliverableConfig`).
- **`phase_number` becomes open-ended** (the two `between 1 and 5` CHECK constraints are dropped) but stays a stable, monotonically-increasing per-project *identity*, never renumbered. A new `sort_order` column carries *display order* — this is what makes "insert a phase in the middle" safe: it's a `sort_order` change, not a renumbering cascade touching every FK reference (`phase_members`, `customer_assets`, etc.).
- **No RLS changes** — task 245 confirmed every policy on these tables is role-only, never conditioned on `phase_number`'s value.
- **StackShift II's "generate default phases" path gets re-pointed**: today it calls `phasePlanFromProgramme()` once at intake and diverges permanently into the generic `milestones`/`tasklists` model (task 239/240), never touching `customer_phases`/the Timeline at all. This task moves that path onto the same `customer_phases`-backed Timeline StackShift I uses, so both classifications share one custom-phase mechanism instead of StackShift II keeping a separate, already-free-form one.
- **Three UI requirements** (task 245 "Confirmed UI Requirements", carried forward unchanged): field order (Duration/Schedule/Start-at-phase move below the phase builder in the New Project wizard's Step 3), a dynamic "Start at phase" dropdown driven by the project's actual configured phases (ordered by `sort_order`, not `PROGRAMME_PHASES`), and an auto-skip cascade (selecting a non-first phase in that dropdown sets every phase before it, by `sort_order`, to `status: "skipped"`).

## Requirements

### A. Schema migration
- [ ] New migration `NNN_customer_phases_custom.sql` (pick next available number after the latest in `supabase/migrations/`): add the 4 nullable columns to `customer_phases` and 3 to `customer_deliverables` (see Code Context); drop/replace the `between 1 and 5` CHECK constraints on both tables with a looser bound (`phase_number > 0`, matching the already-unconstrained sibling columns on `phase_members`/`customer_assets`); backfill `sort_order = phase_number` for all existing rows so display order matches today's behavior with zero visual change on ship.
- [ ] Add a paired CHECK constraint on the two new override column-pairs, mirroring migration 071's `customer_deliverables_schedule_override_check` exactly (both-null-or-both-set, start ≤ end) — apply to `customer_phases`'s new `day_start_override`/`day_end_override` too (071 only covers `customer_deliverables`).
- [ ] `src/types/database.ts` — add the new columns to `customer_phases`/`customer_deliverables`'s `Row`/`Insert`/`Update` types (regen via Supabase CLI if available, otherwise hand-edit matching the existing `day_start_override` entries as a template).

### B. Config/lookup layer (`src/config/customer-phases.ts`)
- [ ] Add project-aware lookup helpers that prefer a `customer_phases`/`customer_deliverables` row's override columns over the static `PROGRAMME_PHASES` lookup when non-null, falling back to today's static-only behavior when null. Do not delete or deprecate `PROGRAMME_PHASES`, `getPhaseByNumber`, `getPhaseForDay`, `getDeliverable` — they remain the source of truth for the 5 defaults and are still valid for any code path that only ever deals with phase_number 1-5.
- [ ] `resolveEffectivePhaseNumber` (task 244) and any new equivalent cascade logic must key off `sort_order`, not `phase_number` — see Question 2/3's resolution in task 245: a phase inserted mid-sequence has a `phase_number` that says nothing about its position, only `sort_order` does.

### C. Seeding (`src/lib/programme/seed.ts`)
- [ ] `seedAndStartProgramme` and `seedProgrammeAtPhase` both currently do `PROGRAMME_PHASES.map(...)` to build exactly 5 `customer_phases`/`customer_deliverables` rows unconditionally (lines 124-153, 250-275). Generalize both to seed from a per-project phase plan that includes any custom phases the PM configured at intake (passed in from the New Project wizard's phase builder, via the same mechanism `skipPhaseNumbersFromDraft` uses today for the fixed-5 case) — not just the static 5.
- [ ] The "before target = skipped, target = active, after target = not_started" ternary (seed.ts lines 128-134 and 254) must compare by `sort_order`, not `phase_number`, once custom phases can be inserted anywhere in the sequence.

### D. API routes (validation + lookups)
- [ ] Every route with a hardcoded `phaseNumber < 1 || phaseNumber > 5` bound (`onboarding/projects/route.ts`, `projects/[projectId]/programme/phase/route.ts`, `.../complete-phase/route.ts`, `.../deliverables/[deliverableKey]/route.ts`, `.../deliverables/[deliverableKey]/schedule/route.ts`) replaces that bound with a project-scoped existence check (does a `customer_phases` row for this project+phase_number exist), since the numeric range is no longer meaningful.
- [ ] `.../phases/[phaseNumber]/note/route.ts` and `.../phases/[phaseNumber]/members/route.ts` — same bound relaxation (currently app-layer-only "between 1 and 5" validation, no DB constraint backing it, per task 245's research).
- [ ] `programme/phase/route.ts`'s "already started" branch (lines 112-134, both the not-started-seed path and this one independently reimplement the ternary) — same `sort_order`-based generalization as seed.ts's copy; this route iterates its own `PROGRAMME_PHASES.map` rather than calling into `seed.ts`, so the fix must be applied here too, not assumed to be covered by the seed.ts change.
- [ ] `onboarding/projects/route.ts` line 106 (`row.phase_number === 5` as "programme complete") and line 153 (`getPhaseByNumber(activePhaseNumber).name` static lookup) — both need to become "highest `sort_order`'s phase is `completed`" and the new project-aware name lookup, respectively.
- [ ] `onboarding/projects/import/route.ts`'s `parsePhase` (CSV "Current Phase" text → number via `PROGRAMME_PHASES.find`) — needs to resolve against the *target project's* actual phase names once custom phases exist, not just the static 5; if the imported project hasn't been seeded yet (no custom phases possible pre-seed), static-only resolution remains correct — confirm this at implementation time and only touch if a real gap is found.
- [ ] `onboarding/projects/[projectId]/qstash-start/route.ts` — widen the `[1,2,3,4,5].includes(...)` hardcoded array check the same way.
- [ ] `programme/reminders/route.ts` — currently does `PROGRAMME_PHASES[0]` and `for (phase of PROGRAMME_PHASES)` to compute reminder logic; must iterate the *project's actual seeded phases* instead, or reminders will silently ignore any custom phase.

### E. Timeline UI (`_onboarding-detail.tsx`)
- [ ] The Gantt/swimlane render loop (`PROGRAMME_PHASES.map(...)`, line 1914) must iterate the project's actual `customer_phases` rows (ordered by `sort_order`), each resolved through the new project-aware lookup into a `PhaseConfig`-shaped object, instead of the static array directly — this is the file's primary chokepoint and the one users will actually see.
- [ ] `activePhaseNumber`/`activePhase` (lines 1652-1653), `isComplete` (line 1654, currently hardcoded `phase_number === 5`), `totalDeliverables` (line 1674, `PROGRAMME_PHASES.reduce`) all need the same "derive from this project's actual phase set, ordered by `sort_order`" treatment — `isComplete` specifically becomes "the phase with the highest `sort_order` is `completed`", not a hardcoded number-5 check.
- [ ] The 3 `1 | 2 | 3 | 4 | 5` union types (lines 1085, 1537, 1599) covering `altPhase`/`scheduledPhaseNumber`/the "jump to phase" select widen to `number`.
- [x] **RESOLVED (confirmed with user, 2026-08-14): intake-only.** Custom phases are configured once, in the New Project wizard's `PhaseBuilder`, before the project starts — matching task 244's own precedent (phase skip is also intake-only). No Timeline-side "add phase" affordance on an already-running project in this task; `_onboarding-detail.tsx` only needs to *render* whatever custom phases were seeded at intake (Requirement E's other 3 bullets), not let a PM add one after the fact.

### F. New Project wizard
- [ ] `new/_phase-builder.tsx` — fixed-phases mode currently has no add-phase affordance (drag is `disabled: mode !== "free-form"` at line 207; the "Add phase" button at line 377 is gated `mode === "free-form"` only). Add an "Add custom phase" control to fixed-phases mode too, appending a new `PhaseDraft` with `included: true` and empty deliverables — this is the mechanism that actually lets a PM add a 6th+ phase at intake.
- [ ] `new/_new-project-types.ts` — `PhaseDraft` (line 14) needs a way to distinguish "one of the 5 defaults" from "a custom addition" for correct `skipPhaseNumbersFromDraft`/day-range derivation (currently position-based, index+1 — breaks once phases can be added/reordered in fixed-phases mode). `TypeCardState.startPhase` (line 106, `1|2|3|4|5`) widens to `number`.
- [ ] `new/_phases-step.tsx` — reorder per Confirmed UI Requirement 1: move the Duration/Start grid (lines 89-125), Scheduled-start picker (127-139), and "Start at phase" select (141-165) to render **after** the `PhaseBuilder` block (currently lines 186-195) instead of before it. The StackShift II "Generate default phases" checkbox (167-184) stays **before** `PhaseBuilder`, since it determines the builder's mode (`fixed-phases` vs. `free-form`) and must be decided first.
- [ ] `new/_phases-step.tsx` "Start at phase" select (lines 141-165) — per Confirmed UI Requirement 2, its `<option>` list currently comes from `PROGRAMME_PHASES.map` (line 158); replace with a derivation from `card.phasePlan.phases` (the PM's actual entered phases, in order) filtered to `included !== false`.
- [ ] Same select's `onChange` (line 149) — per Confirmed UI Requirement 3, selecting a phase other than the first sets `included: false` on every phase before it in the array (mirroring `skipPhaseNumbersFromDraft`'s existing position-based logic) as a side effect of the selection, so the wizard's own summary/preview reflects the cascade before submission, not just after seeding.
- [ ] `isStackShiftI && canManagePhases` gate on the "Start at phase" control (line 141) — extend to `(isStackShiftI || (isStackShiftII && card.useDefaultPhases)) && canManagePhases`, since StackShift II's default-phases path now shares the same mechanism (see Requirement G).

### G. StackShift II re-pointing
- [ ] `phasePlanFromProgramme()` (`customer-phases.ts` lines 291-298) is currently StackShift II's "generate default phases" seed source, converting into the generic `PhasePlanInput` shape consumed by the `milestones`/`tasklists` model. Re-point StackShift II's default-phases submission path (in `onboarding/projects/route.ts` and wherever else task 239/240 wired `phase_plan` for StackShift II specifically) onto `customer_phases`/`customer_deliverables` via the same `seedAndStartProgramme`/`seedProgrammeAtPhase` StackShift I uses, instead of the generic-model seeder.
- [ ] StackShift II's own project detail page must render via the Timeline (`_onboarding-detail.tsx`) when its phases live in `customer_phases`, instead of whatever generic `milestones`-based view it renders today — confirm which component currently owns that render path (task 239/240 territory) before changing it.
- [ ] StackShift II with "generate default" **unchecked** (free-form via `phase_plan`) is unaffected — it keeps using the generic model exactly as today; this re-pointing only applies to the default-phases-checked path.

## Out of Scope / Must-Not-Change

- Re-opening any of task 245's resolved design questions (data model shape, `phase_number`/`sort_order` split, RLS impact, StackShift II applicability) — implement as specified; if something concretely contradicts the design during implementation, flag it to the user rather than silently re-deciding.
- StackShift Access / Access Plus / Discrete Development — already fully free-form via the generic model, untouched by this task.
- Automatic reflow of existing phases' day ranges when a new phase is inserted — task 245 Question 3 explicitly resolved this as manual placement only; do not add auto-shifting logic.
- Renumbering or reusing `phase_number` values under any circumstance — it is a stable identity per task 245's design; only `sort_order` changes.
- Migrating away from `PROGRAMME_PHASES` as the source of truth for the 5 default phases' names/day-ranges — it stays authoritative; the new columns are override/extension only.
- **Adding a custom phase to an already-running project directly from the Timeline** — confirmed intake-only (see Requirement E). `_onboarding-detail.tsx` renders custom phases seeded at intake; it gets no new "add phase" affordance in this task.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/NNN_customer_phases_custom.sql` | Create | New columns + constraint changes (Requirement A) |
| `src/types/database.ts` | Modify | Add new columns to `customer_phases`/`customer_deliverables` types |
| `src/config/customer-phases.ts` | Modify | Project-aware lookup helpers; `sort_order`-based cascade logic |
| `src/lib/programme/seed.ts` | Modify | Both seed functions accept a custom phase plan; ternaries key off `sort_order` |
| `src/lib/programme/status-report.ts` | Modify | `TOTAL_PROGRAMME_DAYS`/per-phase report rows derive from the project's actual phase set |
| `src/lib/qstash/index.ts` | Modify | Widen `phaseNumber: 1\|2\|3\|4\|5` type |
| `src/app/api/projects/[projectId]/programme/phase/route.ts` | Modify | Bound relaxation; own copy of the sort_order-based cascade ternary |
| `src/app/api/projects/[projectId]/programme/complete-phase/route.ts` | Modify | Bound relaxation; "phase 5 is last" → highest `sort_order` |
| `src/app/api/projects/[projectId]/programme/deliverables/[deliverableKey]/route.ts` | Modify | Bound relaxation; static lookup → project-aware |
| `src/app/api/projects/[projectId]/programme/deliverables/[deliverableKey]/schedule/route.ts` | Modify | Bound relaxation |
| `src/app/api/projects/[projectId]/programme/phases/[phaseNumber]/note/route.ts` | Modify | Bound relaxation |
| `src/app/api/projects/[projectId]/programme/phases/[phaseNumber]/members/route.ts` | Modify | Bound relaxation |
| `src/app/api/onboarding/projects/route.ts` | Modify | `phase_number===5` → highest-sort_order check; static name lookup → project-aware; StackShift II re-pointing (Requirement G) |
| `src/app/api/onboarding/projects/[projectId]/qstash-start/route.ts` | Modify | Widen hardcoded `[1,2,3,4,5]` array check |
| `src/app/api/onboarding/projects/import/route.ts` | Modify (if needed) | `parsePhase` CSV resolution — confirm scope at implementation time |
| `src/app/api/programme/reminders/route.ts` | Modify | Iterate project's actual seeded phases, not `PROGRAMME_PHASES` |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` | Modify | Swimlane loop, `activePhase`/`isComplete`/`totalDeliverables`, union type widening, custom-phase add affordance (scope-confirm) |
| `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx` | Modify | `PROGRAMME_PHASES.length` phase-count proxy → per-project count |
| `src/app/v2/(hub)/customers/[customerId]/_programme-tab.tsx` | Modify | `phase_number===5`/`PROGRAMME_PHASES.map` → project-aware |
| `src/app/v2/(hub)/dashboard/_components/pm-dashboard.tsx` | Modify | Positional `PROGRAMME_PHASES[0]/[1]/[2]` indexing → project-aware |
| `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-client.tsx` | Modify | `PHASE_OPTIONS` filter dropdown → project-aware or global-superset |
| `src/app/v2/(hub)/portfolio-tracker/import/_content.tsx` | Modify | CSV phase-name matching/dropdown → project-aware |
| `src/app/v2/(hub)/portfolio-tracker/new/_phases-step.tsx` | Modify | Field reorder (Requirement F); dynamic "Start at phase" options + auto-skip cascade |
| `src/app/v2/(hub)/portfolio-tracker/new/_new-project-types.ts` | Modify | `PhaseDraft` default-vs-custom distinction; `startPhase` type widen |
| `src/app/v2/(hub)/portfolio-tracker/new/_phase-builder.tsx` | Modify | "Add custom phase" affordance in fixed-phases mode |

## Code Context

### Migration — new columns (mirrors migration 071's override pattern)

```sql
-- customer_phases: custom-phase support (task 246, design per task 245)
alter table customer_phases
  add column if not exists custom_name text,
  add column if not exists day_start_override integer,
  add column if not exists day_end_override integer,
  add column if not exists sort_order integer;

alter table customer_phases
  add constraint customer_phases_schedule_override_check
  check (
    (day_start_override is null and day_end_override is null)
    or (day_start_override is not null and day_end_override is not null and day_start_override <= day_end_override)
  );

-- Backfill: sort_order = phase_number for every existing row — zero visual change on ship.
update customer_phases set sort_order = phase_number where sort_order is null;

alter table customer_phases drop constraint if exists customer_phases_phase_number_check;
alter table customer_phases add constraint customer_phases_phase_number_check check (phase_number > 0);

alter table customer_deliverables
  add column if not exists custom_name text,
  add column if not exists custom_description text,
  add column if not exists custom_owner text;

alter table customer_deliverables drop constraint if exists customer_deliverables_phase_number_check;
alter table customer_deliverables add constraint customer_deliverables_phase_number_check check (phase_number > 0);
```

(Exact original constraint names to `drop` must be confirmed against `059_customer_programme_phases.sql`'s actual generated names in the live DB before writing the final migration — Postgres auto-names unnamed `check(...)` clauses; `\d customer_phases` or the Supabase dashboard will show the real name if it isn't `customer_phases_phase_number_check`.)

### `seed.ts` — the ternary to generalize (current, lines 124-137)

```ts
const phaseRows = PROGRAMME_PHASES.map((p) => ({
  customer_id: project.customer_id,
  project_id: project.id,
  phase_number: p.number,
  status: skipSet.has(p.number)
    ? "skipped"
    : p.number === effectivePhaseNumber
      ? "active"
      : p.number < effectivePhaseNumber
        ? "skipped"
        : "not_started",
  ...
}));
```

`p.number < effectivePhaseNumber` is a `phase_number` comparison — once phases can be inserted out of numeric order, this must become a `sort_order` comparison against the target phase's `sort_order`, and the source array must include any custom phases the PM configured, not just `PROGRAMME_PHASES`.

### `programme/phase/route.ts` — the route's own independent copy of this ternary (lines 112-134)

```ts
const updates = PROGRAMME_PHASES.map(async (p) => {
  if (p.number === phaseNumber) { /* status: "active" */ }
  if (p.number < phaseNumber) { /* status: "skipped" */ }
  return /* status: "not_started" */;
});
```

This does **not** call into `seed.ts` — it's a separate implementation of the same cascade logic for the "already started" branch. Must be fixed independently; do not assume fixing `seed.ts` covers this route.

### `_onboarding-detail.tsx` — Swimlane render loop (line 1914)

```tsx
{PROGRAMME_PHASES.map((phase, index) => (
  <Swimlane key={phase.number} phase={phase} dbStatus={phaseStatusMap.get(phase.number) ?? "not_started"} ... />
))}
```

`Swimlane`'s `phase` prop is typed `PhaseConfig` (name/dayStart/dayEnd/deliverables). Replace the source array with the project's actual `customer_phases` rows (ordered by `sort_order`), each resolved into a `PhaseConfig`-shaped object via the new project-aware lookup (Requirement B) before being passed to `Swimlane` — `Swimlane` itself likely needs no prop-shape change if the resolved object matches `PhaseConfig`'s shape.

### `new/_phases-step.tsx` — current field order (lines 89-195, condensed)

```tsx
<div className="grid grid-cols-2 gap-3">{/* Duration + Start mode */}</div>
{card.startMode === "scheduled" && <DateTimePicker .../>}
{isStackShiftI && canManagePhases && card.startMode !== "draft" && (
  <select value={card.startPhase} onChange={...}>
    {PROGRAMME_PHASES.map((p) => <option key={p.number} value={p.number}>Phase {p.number}: {p.name}</option>)}
  </select>
)}
{isStackShiftII && <label>{/* Generate default phases checkbox */}</label>}
<PhaseBuilder mode={builderMode} phasePlan={card.phasePlan} onChange={...} />
```

Target order: StackShift II checkbox (unchanged position — determines builder mode) → `PhaseBuilder` → Duration/Start grid → Scheduled-start picker → "Start at phase" select (options from `card.phasePlan.phases`, not `PROGRAMME_PHASES`).

### `new/_new-project-types.ts` — `PhaseDraft`/`skipPhaseNumbersFromDraft` (lines 14, 70-75)

```ts
export type PhaseDraft = { id: string; name: string; included: boolean; deliverables: DeliverableDraft[] };
// ...
export function skipPhaseNumbersFromDraft(draft: PhasePlanDraft): number[] {
  return draft.phases.reduce<number[]>((acc, p, i) => {
    if (!p.included) acc.push(i + 1);
    return acc;
  }, []);
}
```

`skipPhaseNumbersFromDraft` relies on array position === phase number (index+1), which was exact *only* because fixed-phases mode never added/removed/reordered phases. Once `_phase-builder.tsx` gains an "Add custom phase" affordance in fixed-phases mode (Requirement F), this position-based derivation breaks — needs a real per-phase identifier surviving submission instead of relying on array index.

## Implementation Steps

1. Write and apply the schema migration (Requirement A); update `src/types/database.ts`.
2. `customer-phases.ts`: add project-aware lookup helpers; generalize `resolveEffectivePhaseNumber`'s cascade to `sort_order`.
3. `seed.ts`: thread a per-project phase plan (defaults + customs) through both seed functions; convert the before/target/after ternary to a `sort_order` comparison.
4. `programme/phase/route.ts`: apply the same `sort_order`-based fix to its own independent copy of the cascade (does not reuse `seed.ts`).
5. Remaining API routes (Requirement D): bound relaxation, static-lookup → project-aware swaps.
6. `_onboarding-detail.tsx`: Swimlane loop, `activePhase`/`isComplete`/`totalDeliverables`, union-type widening (render-only — no Timeline-side "add phase" affordance, confirmed intake-only).
7. New Project wizard (Requirement F): `_phase-builder.tsx` add-phase affordance in fixed-phases mode → `_new-project-types.ts` type/derivation fixes → `_phases-step.tsx` field reorder + dynamic dropdown + auto-skip cascade.
8. StackShift II re-pointing (Requirement G) — coordinate with tasks 239/240's existing seeding/rendering code; this is the step most likely to surface an unplanned dependency, since it changes previously-shipped behavior rather than only adding new behavior.
9. Remaining chokepoints: `pm-dashboard.tsx`, `_onboarding-list.tsx`, `status-report.ts`, `_programme-tab.tsx`, `status-report/_status-report-client.tsx`, `import/_content.tsx`, `reminders/route.ts`, `qstash-start/route.ts`.
10. `npx tsc --noEmit` and `pnpm lint`.
11. Manual browser acceptance (see Verification).

## Acceptance Criteria

- [ ] A StackShift I project seeded with only the 5 default phases (no customs added) behaves byte-identically to today — Timeline render, day-math, reminders, dashboards all unchanged (backward-compatibility check).
- [ ] A PM can add a 6th (or inserted) custom phase to a StackShift I project at intake via the New Project wizard's `PhaseBuilder`, give it a name and day range, and see it render as its own Gantt lane on that project's Timeline with correct position (`sort_order`) relative to the 5 defaults.
- [ ] Inserting a custom phase between two existing phases does not change any existing phase's `phase_number` (verify via Supabase — only `sort_order` values change).
- [ ] The "Start at phase" dropdown in the New Project wizard's Step 3 lists the project's actual entered phases (not a hardcoded 1-5), ordered by position, and moving/adding a phase in the builder updates the dropdown's options live.
- [ ] Selecting a non-first phase in that dropdown visibly sets every phase before it (by position) to excluded/skipped in the wizard's own preview, and the seeded project reflects the same `status: "skipped"` cascade after submission.
- [ ] Duration, Start mode, Scheduled-start, and "Start at phase" all render **below** the phase builder in Step 3 (not above, per task 244 Round 2's current order).
- [ ] StackShift II with "Generate default phases" checked seeds into `customer_phases` (verify via Supabase) and its detail page renders via the same Timeline component as StackShift I, not the generic `milestones` view.
- [ ] StackShift II with "Generate default phases" unchecked (free-form) is unaffected — still seeds via the generic `phase_plan`/`milestones` model exactly as before this task.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm build
```

Manual/browser acceptance (no test runner configured) — run `pnpm dev`, navigate to `/v2/portfolio-tracker/new`:
- New StackShift I project → Step 3 → add one custom phase after "Optimize" with a name and day range → submit "Start now" → confirm the Timeline (`/v2/portfolio-tracker/[projectId]`) shows 6 lanes, the 6th matching the custom phase's name/day-range, `phase_number` for the 5 defaults unchanged in Supabase.
- Same flow, but insert the custom phase between "Publish" and "AI Visibility" → confirm it renders in the correct visual position and no existing phase's `phase_number` changed (only `sort_order`).
- In Step 3's "Start at phase" dropdown, select a phase 3 positions in → confirm the wizard's own preview shows the first 2 phases as excluded, and after submission `customer_phases` shows `status: "skipped"` for those 2.
- StackShift II with "Generate default phases" checked → submit → confirm seeded rows land in `customer_phases` (not `milestones`) and the detail page renders the Timeline.
- StackShift II with "Generate default phases" unchecked, free-form phases added/removed → submit → confirm unchanged behavior (still `milestones`-based).
- Existing StackShift I project created before this migration (no custom phases, all override columns `null`) → confirm Timeline/dashboards/reminders render identically to pre-migration behavior.

## Compatibility Touchpoints

- New migration follows the `NNN_description.sql` convention (see `102_projects_programme_duration_days.sql`).
- No RLS policy changes required (task 245, Question 4, confirmed).
- No `_docs/mcp-tools.md` changes (no MCP tool touched).
- Coordinates with tasks 239/240's StackShift II seeding/rendering code (Requirement G) — this is a behavior change to already-shipped code, not purely additive; flag any conflict found with those tasks' own acceptance criteria to the user rather than silently resolving it.
- Task 244's per-project StackShift I phase-*skip* feature (`Testing`) and this task's phase-*addition* feature must coexist: a project can have some default phases skipped and custom phases added in the same intake submission — spot-check this combination during manual acceptance, since neither task's own test plan covers the other's feature in combination.

## Implementation Notes

### What Changed

**A. Schema migration** — `supabase/migrations/103_customer_phases_custom.sql`: `customer_phases` gains `custom_name`, `day_start_override`, `day_end_override`, `sort_order` (NOT NULL, backfilled `= phase_number` for existing rows); `customer_deliverables` gains `custom_name`, `custom_description`, `custom_owner`. Both tables' `phase_number` CHECK constraint widened from `between 1 and 5` to `> 0`. A paired override-consistency CHECK added to `customer_phases` (both-null-or-both-set, start ≤ end), mirroring migration 071's existing one on `customer_deliverables`.

**B. Config/lookup layer** (`src/config/customer-phases.ts`) — `PhaseConfig.number` widened `1|2|3|4|5` → `number`. New `resolveEffectivePhase`/`resolveEffectiveDeliverable` project-aware lookups (override columns win when non-null, else fall back to `PROGRAMME_PHASES`/static `DeliverableConfig`) — named `PhaseOverrideRow`/`DeliverableOverrideRow` (not `CustomerPhaseRow`/`CustomerDeliverableRow`, which `src/types/database.ts` already exports as the full generated Row types — a real naming collision caught before it caused confusion). `resolveEffectivePhaseNumber` generalized to take an explicit ordered phase list (`PhaseOrderEntry[]`) and compare by `sortOrder` instead of always walking `PROGRAMME_PHASES` by `phase_number` — a breaking signature change, all 2 existing callers (seed.ts, programme/phase/route.ts) updated in this same pass. New `slugifyDeliverableKey` + `CustomPhaseSeed` wire type (the wizard→API→seed.ts contract for a custom phase's data).

**C. Seeding** (`src/lib/programme/seed.ts`) — new `buildSeedPhaseEntries(customPhases)` merges `PROGRAMME_PHASES`' 5 defaults with any `CustomPhaseSeed[]` into one list, sorted by `sortOrder` then **re-indexed to a dense 1..N integer sequence** (a custom phase's `sortOrder` arrives as a fractional value — e.g. 2.5 = "between phase 2 and 3" — which must be normalized before writing to the `integer sort_order` DB column). Both `seedAndStartProgramme` and `seedProgrammeAtPhase` accept a new `customPhases: CustomPhaseSeed[] = []` param and build their `customer_phases`/`customer_deliverables` insert rows from this merged list instead of `PROGRAMME_PHASES` directly; the before/target/after cascade ternary now compares `sortOrder` instead of `phase_number`. Custom deliverables carry no day range (matches the generic model's `DeliverablePlan` shape) so always seed `status: "pending"`.

**D. API routes** — bound relaxation (`phase_number between 1 and 5` → `phase_number > 0`) across `programme/phase/route.ts`, `complete-phase/route.ts`, both `deliverables/[deliverableKey]` routes, and both `phases/[phaseNumber]` routes. `programme/phase/route.ts`'s "already started" branch re-implemented its own copy of the cascade ternary against the project's *actual* seeded phases (fetched fresh, ordered by `sort_order`) instead of `PROGRAMME_PHASES.map` — confirmed via Code Context that this route does not call into `seed.ts`, so fixing `seed.ts` alone would not have covered it. Same route also gained `custom_phases` body support (not explicitly listed in the task doc's Proposed File Changes for this route, but required for the wizard's "jump to phase" two-step submission to actually carry a StackShift I card's custom phases through — see Deviations). `onboarding/projects/route.ts`'s GET aggregation now derives "last phase completed" and the active-phase display name from each project's actual phase set instead of hardcoded `phase_number === 5`/`getPhaseByNumber`. `programme/reminders/route.ts` now iterates each project's actual phase set (not `PROGRAMME_PHASES`) for both the "programme complete" check and the "phase running late" reminder — previously a custom phase would have silently never generated a late reminder. `onboarding/projects/import/route.ts` and `qstash-start/route.ts`'s hardcoded 1-5 array check were reviewed and deliberately left unchanged (see Deviations).

**E. Timeline UI** (`_onboarding-detail.tsx`) — Swimlane render loop, `activePhase`/`isComplete`/`totalDeliverables` all derive from a new `orderedPhases` (this project's `customer_phases` rows resolved via `resolveEffectivePhase`, sorted by `sort_order`) instead of `PROGRAMME_PHASES`. Also fixed two chokepoints not explicitly named in the task doc's Code Context but discovered necessary during implementation: `buildReminders()` called `getPhaseByNumber(activePhaseNumber)` directly, which **throws** for a custom phase's number (would have crashed the whole page on render) — regeneralized to accept `orderedPhases` and resolve safely; and `JumpToPhaseMenu`'s phase list (the already-started "Jump to phase" admin dropdown) was hardcoded to `PROGRAMME_PHASES` — now accepts a `phases` prop, defaulting to `PROGRAMME_PHASES` for the pre-seed call site (no per-project phase set exists yet there) and receiving `orderedPhases` at the already-started call site. `PHASE_VISUALS[phase.number]` (no entry for phase 6+) now falls back to `PHASE_VISUALS[1]`, matching the file's own existing `?? [1]` convention used elsewhere for `PHASE_HEX`.

**F. New Project wizard** — `_phase-builder.tsx`'s fixed-phases mode gained an "Insert custom phase after this one" affordance per phase row (not a full drag-reorder — see Deviations) plus editable name + day-range inputs for custom phases (defaults stay read-only text, matching existing convention). `_new-project-types.ts`: `PhaseDraft` gained `phaseNumber` (stable identity, assigned once via `nextPhaseNumber`), `isCustom`, `dayStart`/`dayEnd`; `skipPhaseNumbersFromDraft` rewritten to key off `phaseNumber` instead of array position (the old position-based derivation broke once phases can be inserted mid-array); new `customPhasesFromDraft` computes each custom phase's fractional `sortOrder` by interpolating between its nearest neighboring non-custom phases' `phaseNumber`s. `_phases-step.tsx`: Duration/Start/Scheduled-start/"Start at phase" fields moved below the `PhaseBuilder` (StackShift II's checkbox stays above, since it determines the builder's mode); "Start at phase" options now come from `card.phasePlan.phases` (filtered to `included`) instead of `PROGRAMME_PHASES`; selecting a phase auto-excludes every phase before it in the draft's array order (`selectStartPhase`). `_content.tsx`: `buildCreatePayload` and the jump-to-phase PATCH both now send `custom_phases` alongside `skip_phase_numbers`.

**G. StackShift II re-pointing** — new `use_default_phase_engine` request field (StackShift II only): when `true` (mirrors the wizard's "Generate default phases" checkbox), the card is seeded via `seedAndStartProgramme`/`customer_phases` exactly like StackShift I, instead of the generic `phase_plan`/`milestones` model. **Scope discovery during implementation**: the task doc's own Requirement G assumed StackShift II's detail page needed a separate rendering fix ("confirm which component currently owns that render path... before changing it") — tracing `page.tsx` showed `/v2/portfolio-tracker/[projectId]` already renders `_onboarding-detail.tsx` (the Timeline) **unconditionally for every classification**, with no classification-based routing/redirect. So re-pointing the *seeding* was sufficient — once `customer_phases` rows exist for a StackShift II project, the existing Timeline renders them correctly with no additional rendering-layer change needed. This simplified Requirement G considerably versus what the task doc anticipated.

### Files Changed
- `supabase/migrations/103_customer_phases_custom.sql` — new columns + constraint changes
- `src/types/database.ts` — `customer_phases`/`customer_deliverables` Row/Insert/Update types
- `src/config/customer-phases.ts` — project-aware lookups, generalized cascade, `CustomPhaseSeed`
- `src/lib/programme/seed.ts` — both seed functions accept `customPhases`, sort_order-based cascade
- `src/lib/programme/status-report.ts` — `buildPhaseBreakdown` iterates project's actual phases, `totalProgrammeDays` derived per-project
- `src/app/api/projects/[projectId]/programme/route.ts` — order by `sort_order` instead of `phase_number`
- `src/app/api/projects/[projectId]/programme/phase/route.ts` — bound relaxation, own cascade copy, `custom_phases` support
- `src/app/api/projects/[projectId]/programme/complete-phase/route.ts` — "next/last phase" derived from actual phase order, not hardcoded 5
- `src/app/api/projects/[projectId]/programme/deliverables/[deliverableKey]/route.ts` — existence/name resolution via DB row, not static lookup
- `src/app/api/projects/[projectId]/programme/deliverables/[deliverableKey]/schedule/route.ts` — same, plus project-aware day-range bound
- `src/app/api/projects/[projectId]/programme/phases/[phaseNumber]/note/route.ts` — bound relaxation
- `src/app/api/projects/[projectId]/programme/phases/[phaseNumber]/members/route.ts` — bound relaxation
- `src/app/api/onboarding/projects/route.ts` — bound relaxation, `custom_phases`/`use_default_phase_engine` fields, project-aware GET aggregation
- `src/app/api/onboarding/projects/status-report/route.ts` — per-project phase-number set instead of hardcoded 1-5 loop; `phases[phases.length-1]` instead of `phases[4]`
- `src/app/api/programme/reminders/route.ts` — iterates project's actual phases for completion + late-phase checks
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` — Swimlane loop, `activePhase`/`isComplete`/`totalDeliverables`, `buildReminders`/`JumpToPhaseMenu` crash-safety fixes, union type widening
- `src/app/v2/(hub)/customers/[customerId]/_programme-tab.tsx` — project-aware phase render loop + completion check
- `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-client.tsx` — phase filter no longer silently hides projects active in a custom phase
- `src/app/v2/(hub)/portfolio-tracker/new/_phases-step.tsx` — field reorder, dynamic "Start at phase" + auto-skip cascade, StackShift II gate extension
- `src/app/v2/(hub)/portfolio-tracker/new/_new-project-types.ts` — `PhaseDraft` extended, `customPhasesFromDraft`/`addCustomPhaseDraft`/`nextPhaseNumber`
- `src/app/v2/(hub)/portfolio-tracker/new/_phase-builder.tsx` — "Add custom phase" affordance + day-range/name inputs in fixed-phases mode
- `src/app/v2/(hub)/portfolio-tracker/new/_content.tsx` — `custom_phases`/`use_default_phase_engine` wired into submission; StackShift II gate extensions

### Deviations From Plan

- **Requirement G turned out smaller than scoped** — see "What Changed" above. No separate detail-page rendering fix was needed; `_onboarding-detail.tsx` is already the universal, classification-agnostic detail page.
- **Custom-phase positioning uses an "Insert after this phase" button per row, not full drag-and-drop reordering of the whole fixed-phases list.** The task doc's Code Context didn't mandate a specific mechanism, only that inserting a custom phase mid-sequence must work (demonstrated in Verification). Reordering the 5 defaults relative to each other was deliberately kept out of scope (their relative order stays fixed 1→5) to avoid a much larger change to `_phase-builder.tsx`'s existing `@dnd-kit` sortable setup; a custom phase's position is instead expressed as a fractional `sortOrder` interpolated between its neighbors and normalized server-side. This still satisfies every stated Acceptance Criterion and Verification scenario.
- **`onboarding/projects/import/route.ts`'s `parsePhase` and `import/_content.tsx`'s CSV phase-matching left unchanged** — confirmed at implementation time (not just assumed) that both only ever resolve against `PROGRAMME_PHASES` for a project that doesn't exist yet pre-import, so no custom-phase gap is possible there.
- **`onboarding/projects/[projectId]/qstash-start/route.ts`'s hardcoded `[1,2,3,4,5].includes(...)` bound was reviewed and deliberately left unwidened** — `custom_phases` is a documented known gap for the scheduled-start path (never persisted to `projects`, same category as task 244's own `skip_phase_numbers` gap), so a scheduled start can only ever land on one of the 5 defaults regardless; widening this bound without also closing that persistence gap would accept input it can't actually act on correctly.
- **`_onboarding-list.tsx` and `pm-dashboard.tsx`'s `PROGRAMME_PHASES` references were reviewed and confirmed not bugs**: `_onboarding-list.tsx`'s usage is page-level descriptive copy ("across all N phases") about the standard programme, not any specific project's phase count. `pm-dashboard.tsx`'s `PROGRAMME_PHASES[1]`/`[2]` and `phase_number === 2/3` filters are dashboard stat tiles specifically about "how many projects are currently in the default Phase 2/3" — a query that stays correct regardless of any project's custom phases, since phase_number 2/3's identity/meaning is unchanged by this task.
- **Known gap carried forward from task 244, now also covering `custom_phases`**: neither is persisted for the `save_scheduled` intake path — see the inline comment in `onboarding/projects/route.ts`. Closing it needs a new `projects` column + threading through both cron paths (`qstash-start`, `scheduled-autostart`), outside this task's listed file changes.
- **Migration's `DROP CONSTRAINT IF EXISTS customer_phases_phase_number_check`/`customer_deliverables_phase_number_check` names are inferred from Postgres's default unnamed-CHECK-constraint naming convention** (`{table}_{column}_check`), matching migration 059's own unnamed inline `check(...)` clauses. Not verified against a live database (none available in this pass) — recommend confirming the actual constraint name (`\d customer_phases` or the Supabase dashboard) before applying this migration to a real environment.
- No Major deviations. Every Out of Scope / Must-Not-Change boundary was respected: no RLS policy touched; `PROGRAMME_PHASES` remains the source of truth for the 5 defaults (never deleted/mutated); `phase_number` is never renumbered/reused anywhere (only `sort_order` changes); no automatic day-range reflow was added; no Timeline-side "add phase to an already-running project" affordance was added (intake-only, confirmed).

### Verification Run
- `npx tsc --noEmit` — PASS
- `npx eslint` (run directly against all 22 changed files) — PASS, zero warnings/errors (0 new; the 2 pre-existing `_checklist-tab.tsx` warnings noted in tasks 222/239/240/244's own implementation notes are untouched by this task and unrelated)
- `pnpm build` — PASS, zero errors/warnings
- Manual/browser acceptance (no test runner configured, no live Supabase/browser session available in this pass) — SKIPPED, same precedent as tasks 239/240/244. Recommend running, in order: (1) the new-custom-phase-at-end and insert-mid-sequence scenarios from this doc's Verification section; (2) the Start-at-phase auto-skip cascade; (3) StackShift II with "Generate default phases" checked, confirming seeded rows land in `customer_phases` not `milestones`; (4) an existing pre-migration StackShift I project, confirming zero visual/behavioral change; (5) confirm the migration's constraint-drop names against the live schema before applying.

### Closing Re-Verification (before marking Completed)
Re-ran `npx tsc --noEmit`, `pnpm lint`, and `pnpm build` immediately before closing this task — no code had changed since the pass above, and no fixes were needed. All three still PASS clean (same 2 pre-existing, unrelated `_checklist-tab.tsx` warnings, zero new). Only the doc's own `Status` field needed correcting (was left at `Planned` from creation instead of being updated through `In Progress`/`Testing`).
