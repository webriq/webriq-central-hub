# 244: New Project Form UX Overhaul — Dedicated Phase/Deliverable Step, Per-Project Duration & Schedule, StackShift I Phase Skip

**Created:** 2026-08-14
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** deep
**Status:** Completed

**Depends on:** tasks 239/240 (currently in `Testing`, not yet shipped/verified). This task builds directly on top of the multi-type wizard those tasks introduced at `src/app/v2/(hub)/portfolio-tracker/new/`. If 239/240 have not been merged/verified by the time this task starts, verify their manual browser acceptance checks first — this task cannot be sanity-checked against a broken foundation.

---

## Overview

Follow-up UX pass on the New Project wizard (`/v2/portfolio-tracker/new`) shipped by tasks 239 (backend) and 240 (frontend). That work made StackShift I/II, Access, Access Plus, and Discrete Development independently multi-selectable, each rendering a `TypeConfigCard` with name + PipelineForge add-on + (duration or default-phase toggle) + an inline `PhaseBuilder` all stacked in Step 2 ("Project Details"). Real usage surfaced four problems with that shape:

1. **Step 2 is a long scroll.** Selecting 2+ types stacks 2+ full `TypeConfigCard`s — each containing a complete phase/deliverable/checklist tree — one after another in a single step, with no visual break between "quick config" and "the big nested builder."
2. **StackShift I's 5 default phases are all-or-nothing per project.** A PM setting up a project for a client who explicitly doesn't need, say, the "AI Visibility" phase has no way to leave it out — every StackShift I project always gets all 5 phases seeded.
3. **The phase/deliverable/checklist builder is buried inside the name/duration card**, rather than being its own step — there's no single place that's clearly "now set up the plan" as distinct from "now name the project."
4. **Duration and schedule are inconsistent across types, and schedule is global, not per-project.** Only StackShift I has a duration field today (Access/Access Plus/Discrete Development/StackShift II-without-checkbox have none). Scheduling ("when does this start") is a single `scheduledAt` + `startPhase` pair applied to the *entire* multi-type submission on the Review step, not per selected type — so a PM creating StackShift I + Discrete Development together can't give them different kickoff dates.

### Key Design Decision — StackShift I phase skip (confirmed with user before planning)

**"Remove specific default phase" means a per-project, intake-time opt-out — not a permanent change to the product's phase model.** Task 239 explicitly locked StackShift I's 5 phases (`phase_number: 1|2|3|4|5`, Onboard/Migrate/Publish/AI Visibility/Optimize) as a closed set referenced by ~20 files (RLS policies, Timeline day-math, dashboards) — phases are not addable/removable, only deliverables within them are. This task does **not** reopen that decision. Instead:

- A PM creating a StackShift I project can **deselect one or more of the 5 default phases for that specific project only**, at intake time.
- A skipped phase still gets a `customer_phases` row (phase_number 1-5 always exists — the closed-type invariant every downstream consumer relies on is preserved), but seeded with **`status: "skipped"`** — the exact status value `seedProgrammeAtPhase` (`src/lib/programme/seed.ts:112,211`) already uses today for phases bypassed by the admin "Start at phase N" jump. No new status value is introduced. Its deliverables (`customer_deliverables`) are not seeded for that phase.
- `_programme-tab.tsx` (`src/app/v2/(hub)/customers/[customerId]/_programme-tab.tsx:153`) already has a `"skipped"` → `{ label: "Skipped", ...greyed-out styles }` status mapping — reused as-is. The Timeline's `phaseStatusMap` (`_onboarding-detail.tsx:1653`) already flows `status` through to swimlane rendering; confirm during implementation that a `"skipped"` phase renders sensibly there too (greyed lane, zero deliverable cards, excluded from `activePhaseNumber`/`phasesCompleted` math — spot-check `_onboarding-detail.tsx:1445,1646,1653,1667-1668` for any place that assumes every phase reaches `"completed"`).
- This is StackShift I only. StackShift II's "Generate default phases" mode already produces a fully free-form `phase_plan` (task 240) where the PM can just not add a deliverable-less phase, or remove a phase outright — no change needed there.

## Requirements

### A. Wizard restructure — new dedicated step, less scroll
- [ ] Split the current Step 2 ("Project Details") into two steps: **Step 2 "Project Setup"** (classification grid + per-type: name, PipelineForge add-on, duration, schedule — no phase builder) and a new **Step 3 "Phases & Deliverables"** (one section per selected type, embedding `PhaseBuilder`/the new fixed-phase-skip UI). Step 3 "Review & Create" becomes **Step 4**. `STEPS`/`Step` type/`StepIndicator` updated to 4 steps.
- [ ] When 2+ types are selected, Step 3 groups each type's builder under a collapsible section (default: first type expanded, rest collapsed) instead of stacking all of them fully expanded — this is the primary scroll reduction for the multi-type case, and should be handled by an `/impeccable` or `/frontend-design`-guided pass at implementation time so the collapse affordance matches the design system's existing card/accordion conventions rather than inventing a new pattern.
- [ ] `goNext`'s Step 2 validation (name required/unique/uniqueness-checked) stays gated at the new Step 2. Step 3 has no blocking validation (an empty/skipped phase plan is valid, matching today's "skip for now" behavior) but should surface a non-blocking summary (e.g. "3 of 5 phases included" / "No phases yet").

### B. StackShift I default-phase skip (per project)
- [ ] In `PhaseBuilder`'s `fixed-phases` mode, each of the 5 phase sections gets an "Include this phase" toggle (default: on). Unchecking it visually collapses/greys the phase's deliverable list (deliverables stay in the draft but are inert while unchecked — re-checking restores them, no data loss while still on Step 3).
- [ ] `PhasePlanDraft`/`PhaseDraft` (`_new-project-types.ts`) gain an `included: boolean` field (default `true`). `phasePlanDraftToInput` (or a StackShift-I-specific variant — see Code Context) filters/flags excluded phases appropriately for the two different downstream consumers (StackShift I's specialized seeding vs. the generic `phase_plan`).
- [ ] `POST /api/onboarding/projects` accepts a new optional field, `skip_phase_numbers?: (1|2|3|4|5)[]`, valid only when the card's classification is `"StackShift I"` (mirrors the existing `programme_duration_days`/`phase_plan` per-classification validation pattern in that route). Sending it for any other classification is rejected with 400, same as the existing two fields.
- [ ] `seedAndStartProgramme`/`seedProgrammeAtPhase` (`src/lib/programme/seed.ts`) accept an optional `skipPhaseNumbers: number[] = []` param. For phase numbers in that set: insert the `customer_phases` row with `status: "skipped"` (instead of the normal `"active"|"not_started"` branch) and skip inserting that phase's `customer_deliverables` rows entirely.
- [ ] All 5 phases can be skipped (edge case — results in a StackShift I project with no active phases; not blocked, since the resulting empty-programme state is materially the same shape as a Discrete Development project with an empty `phase_plan`, which is already valid). Phase 1 being skipped specifically must not break `seedAndStartProgramme`'s existing `targetPhase`/`startedAt` backdating math (`seed.ts:143-144`) — confirm during implementation which phase drives the backdate calculation when phase 1 is skipped (likely: the earliest *non-skipped* phase becomes the effective start; flag any ambiguity found here back to the user rather than guessing silently).

### C. Duration & schedule — per project, all types
- [ ] Every `TypeConfigCard` (not just StackShift I) gets a duration input. For StackShift I, this remains the existing "programme duration in days" field feeding `programme_duration_days` (unchanged semantics). For every other type, add a **duration-in-days** field used only to compute a suggested end date for display purposes on Step 3/Step 4 (informational — the generic `milestones` model already uses real `start_date`/`due_date`, not an abstract day count, per task 239's design; this field's job is to let the PM express "roughly how long" without the wizard forcing them to pick exact per-deliverable dates yet).
- [ ] Each `TypeConfigCard` gets its own **schedule** control: "Start immediately" (default) vs. "Schedule start" with a date/time picker (reuse `DateTimePicker` from `_date-time-picker.tsx`), replacing the current single wizard-level `scheduledAt` applied to the whole submission. `TypeCardState` gains `startMode: "now" | "scheduled"` and `scheduledStartAt: string`.
- [ ] `buildCreatePayload` sends `mode`/`scheduled_start_at` **per card** (derived from that card's own `startMode`/`scheduledStartAt`) instead of one wizard-level `mode` applied uniformly to every call in the submission loop — a PM can start one selected type now and schedule another for next week in the same submission.
- [ ] The existing admin/marketing/super_admin-only "Start StackShift I at phase N" jump (`canManagePhases`, `startPhase` state) stays available, scoped to StackShift I's own card only (it already only applies there) — move its render location to StackShift I's `TypeConfigCard` on the new Step 2 instead of the page-level Review-step footer, consistent with "duration/schedule are per-card" everywhere else in this task.
- [ ] Step 4 (Review) lists each type's name/classification/PipelineForge-badge summary **plus** its resolved duration and start mode ("Starts immediately" / "Scheduled for {date}").

### D. General
- [ ] File-length: `_content.tsx` currently 1199 lines. This task adds a new step, per-card schedule/duration UI, and the phase-skip toggle — split proactively per `nextjs-file-length-best-practices.md`'s "scroll test"/single-responsibility heuristics (not a hard line count). At minimum, extract the new Step 3 phases-and-deliverables step render into its own file (e.g. `_phases-step.tsx`) rather than inlining it in `_content.tsx` alongside Steps 1/2/4.
- [ ] Design tokens: match `_final_design/guide/central-hub-design-system.md` exactly — this file already hand-codes the design system's hex values directly (`#007BFF` blue, `#0B1533` ink, `#5F6A88` muted, `#E2E7F2` line, `#F4F6FB` bg, `#C0392B` late/error — see `central-hub-design-system.md` §1 Color) rather than using CSS variables or Tailwind's `dark:` variant (this page is light-only, no `isDark` prop — keep it that way, don't introduce dark-mode handling here). New UI (collapsible sections, per-card schedule/duration controls, phase-skip toggles) must reuse these exact tokens, not introduce new colors.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass clean.

## Out of Scope / Must-Not-Change

- **No change to the closed `phase_number: 1|2|3|4|5` type, RLS policies, or the fixed Onboard/Migrate/Publish/AI-Visibility/Optimize phase set/count** — see Key Design Decision above. Skipping a phase for one project never removes or renumbers a `customer_phases` row.
- Step 1 (Company & Contact) is unchanged.
- `Field`, `StepIndicator`'s visual mechanics, `SuccessScreen` — reused as-is; `StepIndicator` only needs its step count/labels updated for the new 4-step flow, not a redesign.
- No changes to `/api/customers/check-name` or `/api/onboarding/projects/check-name`.
- No change to `STACKSHIFT_VARIANTS`/`isValidClassificationCombo` semantics.
- No backfill of existing projects — this only affects the intake flow for newly created projects going forward.
- Swimlane/redirect behavior (tasks 241/242) is untouched.
- The generic duration field added for non-StackShift-I types (requirement C) does **not** get wired into any day-count-driven engine (`scaleDay`/`PROGRAMME_PHASES`) — it's display-only metadata for those types, per task 239's decision that only StackShift I's programme is duration-scaled.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/portfolio-tracker/new/_content.tsx` | Modify | 4-step `STEPS`/`Step` type; remove page-level `scheduledAt`/`scheduleExpanded`/`startPhase` (moved per-card); Step 2 render trimmed to config-only; new Step 3 wiring (import from `_phases-step.tsx`); Step 4 (Review) renumbered + per-card duration/schedule summary; `buildCreatePayload`/submission loop reads per-card `mode`/`scheduled_start_at`/`skip_phase_numbers` |
| `src/app/v2/(hub)/portfolio-tracker/new/_phases-step.tsx` | Create | New Step 3 render: per-selected-type collapsible section embedding `PhaseBuilder` (or the phase-skip fixed-phases UI for StackShift I) |
| `src/app/v2/(hub)/portfolio-tracker/new/_type-config-card.tsx` | Modify | Remove embedded `PhaseBuilder` (moves to Step 3); add duration input for non-StackShift-I types; add per-card start-mode/schedule control (reusing `DateTimePicker`); StackShift I's "Start at phase N" admin control moves here |
| `src/app/v2/(hub)/portfolio-tracker/new/_phase-builder.tsx` | Modify | `fixed-phases` mode: add per-phase "Include this phase" toggle wired to `PhaseDraft.included` |
| `src/app/v2/(hub)/portfolio-tracker/new/_new-project-types.ts` | Modify | `PhaseDraft.included: boolean` (default `true`); `TypeCardState` gains `startMode`/`scheduledStartAt`/generic `durationDays` semantics for non-StackShift-I cards; helper to derive `skip_phase_numbers` from a StackShift I card's `phasePlan` |
| `src/app/api/onboarding/projects/route.ts` | Modify | Accept `skip_phase_numbers?: (1\|2\|3\|4\|5)[]`; validate StackShift-I-only (same pattern as `programme_duration_days`); pass through to `seedAndStartProgramme` |
| `src/lib/programme/seed.ts` | Modify | `seedAndStartProgramme`/`seedProgrammeAtPhase` accept `skipPhaseNumbers: number[] = []`; seed those phase numbers with `status: "skipped"` and zero deliverables; resolve the backdating edge case when phase 1 is in the skip set |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` | Modify (if needed) | Confirm/adjust Timeline swimlane + `activePhaseNumber`/`phasesCompleted`/`buildReminders` handling for a project with one or more `"skipped"` phases seeded at intake (not just via the admin phase-jump) |

## Code Context

### `_content.tsx` — current 3-step model to extend (lines 41-49)

```tsx
type Step = 1 | 2 | 3;
const STEPS: { id: Step; label: string }[] = [
  { id: 1, label: "Company & Contact" },
  { id: 2, label: "Project Details" },
  { id: 3, label: "Review & Create" },
];
```

Becomes 4 steps: `1 Company & Contact`, `2 Project Setup`, `3 Phases & Deliverables`, `4 Review & Create`. `StepIndicator` (lines 82-126) needs no structural change — it already maps generically over `STEPS`.

### `_content.tsx` — page-level schedule/phase-jump state to make per-card (lines 427-429, 605, 1070-1095)

```tsx
const [scheduledAt, setScheduledAt] = useState("");
const [scheduleExpanded, setScheduleExpanded] = useState(false);
const [startPhase, setStartPhase] = useState<1 | 2 | 3 | 4 | 5>(1);
// ...
start_phase: mode === "save_scheduled" && canManagePhases && isStackShiftI ? startPhase : undefined,
```

This single set of wizard-level state, applied uniformly to every card in the submission loop, is replaced by per-card `startMode`/`scheduledStartAt` (and, for StackShift I only, a per-card `startPhase`) living on `TypeCardState`. `buildCreatePayload(classification, card, customerId, projectName)` reads `card.startMode`/`card.scheduledStartAt` instead of the page-level `scheduledAt`/`mode` parameter it currently takes — the function's `mode` parameter can likely be derived entirely from the card now rather than passed in from the submission loop; confirm this simplification doesn't lose the "Start at phase N" two-step (create `mode: "save"` then PATCH `.../programme/phase`) shape already implemented in the submission loop (lines ~625-680, not shown above — read this range before touching it).

### `_new-project-types.ts` — `PhaseDraft`/`TypeCardState` to extend (lines 10-11, 58-73)

```ts
export type PhaseDraft = { id: string; name: string; deliverables: DeliverableDraft[] };
// ...
export type TypeCardState = {
  classification: Classification;
  projectName: string;
  projectNameTouched: boolean;
  projectNameError: string;
  checkingName: boolean;
  pipelineforgeAddon: boolean;
  durationDays: number;       // currently StackShift-I-only in practice
  useDefaultPhases: boolean;  // StackShift-II-only
  phasePlan: PhasePlanDraft;
};
```

Add `included: boolean` to `PhaseDraft` (default `true`, only meaningfully toggleable in `fixed-phases` mode). Add `startMode: "now" | "scheduled"` and `scheduledStartAt: string` to `TypeCardState` (default `"now"`/`""`). `durationDays` becomes meaningful for every classification (display-only for non-StackShift-I, as noted in Requirement C) rather than "ignored — never sent" for anything but StackShift I.

### `_phase-builder.tsx` — where the skip toggle attaches (`PhaseSection`, lines 113-150)

```tsx
{mode === "free-form" ? (
  <InlineRow value={phase.name} onChange={...} onRemove={onRemove ?? (() => {})} .../>
) : (
  <span className="text-[12.5px] font-bold text-[#0B1533]">{phase.name}</span>
)}
```

In `fixed-phases` mode, add a toggle (checkbox or switch, matching the existing `PipelineForgeAddonRow`/StackShift-II-checkbox visual vocabulary already in this codebase — don't invent a third toggle style) next to the phase name, wired to `onChange({ ...phase, included: !phase.included })`. When `phase.included === false`, grey/collapse the deliverable list below it (still rendered, just visually inert — matches the "no data loss while unchecked" requirement).

### `seed.ts` — where `skipPhaseNumbers` must apply (lines ~106-130, ~205-235 per task 239's own Code Context)

```ts
status: p.number === phaseNumber ? "active" : p.number < phaseNumber ? "skipped" : "not_started",
```

This existing ternary (used by the "jump to phase N" admin flow) already produces `"skipped"` for phases before the target — this task adds a **second, independent** reason a phase can be `"skipped"`: because the PM explicitly excluded it at intake, regardless of `phaseNumber`. The two conditions can coexist (a phase might be both before the jump target *and* explicitly excluded — either reason alone is sufficient for `"skipped"`). Structure the new logic as `skipPhaseNumbers.includes(p.number) ? "skipped" : <existing ternary>` and skip that phase's `customer_deliverables` insert entirely (not just mark them skipped) when the phase is PM-excluded — deliverables inside an explicitly-excluded phase were never applicable to this engagement, unlike deliverables inside a time-jumped-past phase (which did happen, just before "now").

## Implementation Steps

1. Confirm tasks 239/240 are shipped or at least merged into the working tree (this task edits the same files).
2. `_new-project-types.ts`: add `PhaseDraft.included`, `TypeCardState.startMode`/`scheduledStartAt`; add a `skipPhaseNumbersFromDraft(phasePlan: PhasePlanDraft): number[]` helper (StackShift I fixed-phases mode only — maps excluded `PhaseDraft`s back to their `1|2|3|4|5` position).
3. `_phase-builder.tsx`: add the per-phase include toggle in `fixed-phases` mode; visually collapse excluded phases' deliverables.
4. `seed.ts`: thread `skipPhaseNumbers` through `seedAndStartProgramme`/`seedProgrammeAtPhase`; resolve the phase-1-skipped backdating edge case.
5. `route.ts`: accept + validate `skip_phase_numbers`; pass through to `seedAndStartProgramme`.
6. Restructure `_content.tsx`: 4-step `STEPS`; extract Step 3 into `_phases-step.tsx` with per-type collapsible sections; move page-level schedule/phase-jump state into per-card fields on `_type-config-card.tsx`; update `buildCreatePayload`/submission loop to read per-card `mode`/`scheduled_start_at`/`skip_phase_numbers`; update Step 4 review summary.
7. `_type-config-card.tsx`: add generic duration input, per-card schedule control (`DateTimePicker` reuse), relocated "Start at phase N" control for StackShift I.
8. Spot-check `_onboarding-detail.tsx`'s phase-status-dependent math (`activePhaseNumber`, `phasesCompleted`, `buildReminders`) against a project with an intake-time-skipped phase; adjust if any assumption breaks (e.g. an assumption that every phase eventually reaches `"completed"`).
9. Run `npx tsc --noEmit` and `pnpm lint`.
10. Use `/frontend-design` and/or `/impeccable` (per the user's request) during the collapsible-section and per-card control styling work in steps 3/6/7 to keep the new UI sleek and consistent with `_final_design/guide/central-hub-design-system.md` rather than ad hoc.
11. Manually walk the 4-step wizard in the browser (see Verification) for: single StackShift I with 2 phases unchecked; StackShift I + Discrete Development selected together with different schedules; StackShift II default-phases-checked with one phase excluded.

## Acceptance Criteria

- [ ] Step indicator shows 4 steps; Step 2 no longer renders any `PhaseBuilder` content; Step 3 is the only place phase/deliverable/checklist editing happens.
- [ ] Selecting 2+ types and reaching Step 3 shows collapsible per-type sections, not every type's builder fully expanded at once.
- [ ] On a StackShift I card, unchecking "AI Visibility" (or any phase) and submitting with `mode: "start"` results in a `customer_phases` row for phase 4 with `status: "skipped"` and zero `customer_deliverables` rows for it — verify via Supabase and via `/v2/portfolio-tracker/[projectId]`'s Timeline (phase 4's lane renders as skipped/greyed, not as a normal not-started phase).
- [ ] Submitting with all 5 phases unchecked does not error — produces a StackShift I project with 5 `"skipped"` `customer_phases` rows and no deliverables.
- [ ] Sending `skip_phase_numbers` on any non-StackShift-I classification is rejected with 400.
- [ ] Every `TypeConfigCard` (all 5 classifications) shows a duration input and a per-card schedule control (Start immediately / Schedule start).
- [ ] Submitting StackShift I (start immediately) + Discrete Development (scheduled for a future date) together in one submission creates both projects, with only the Discrete Development one carrying a `scheduled_onboarding_start_at`/deferred-start state — confirm via the created rows, not just the UI.
- [ ] The relocated "Start StackShift I at phase N" admin control still only appears for `canManagePhases` roles and only on StackShift I's card, and still produces the same create-then-PATCH two-step submission shape as before this task.
- [ ] Step 4 (Review) lists every selected type with its duration and start-mode summary.
- [ ] `_content.tsx` and any newly extracted files stay reasonably scoped per `nextjs-file-length-best-practices.md`'s heuristics (single responsibility / scroll test) — not a hard line-count requirement.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser acceptance (no test runner configured) — run `pnpm dev`, navigate to `/v2/portfolio-tracker/new`:
- New company → StackShift I only → Step 3: uncheck "AI Visibility" → submit "Start now" → confirm Timeline shows phase 4 as skipped/greyed, Day-progress math doesn't break on the missing phase.
- New company → StackShift I (start now) + Discrete Development (scheduled 3 days out) selected together → submit → confirm 2 projects created, StackShift I active immediately, Discrete Development in a deferred/scheduled state matching its own card's choice (not StackShift I's).
- StackShift II with "Generate default phases" checked → Step 3 → uncheck one phase → confirm the resulting `phase_plan`/seeded `milestones` correctly excludes it (this path goes through the generic seeder, not `customer_phases` — confirm the exclusion is handled at the `phasePlanDraftToInput`/`seedCustomPhases` layer, not accidentally routed through the StackShift-I-only `skip_phase_numbers` field).
- Confirm Step 2 (no phase builder) and Step 3 (phase builder, collapsible per type) each pass the "no more than 2-3 scrolls" heuristic from `nextjs-file-length-best-practices.md` at a standard laptop viewport with 2 types selected.

## Compatibility Touchpoints

- Depends on tasks 239/240's already-shipped (pending verification) API contract — this task extends it (`skip_phase_numbers`), does not change existing fields' semantics.
- No `_docs/mcp-tools.md` changes (no MCP tool touched).
- No new migration required — reuses the existing `customer_phases.status` free-text column and its already-established `"skipped"` value; no schema change.
- Tasks 241/242 (swimlane, generic Projects milestone view) should be spot-checked against a project created with one or more skipped phases, since they render `milestones`/`customer_phases`-derived data this task's intake path can now produce in a new shape (a StackShift I project with fewer than 5 "live" phases).

## Implementation Notes

### What Changed
- **Wizard restructure (4 steps):** `_content.tsx`'s `STEPS`/`Step` type went from 3 to 4 — `1 Company & Contact`, `2 Project Setup` (renamed from "Project Details" — classification grid + per-type name/add-on/duration/schedule only, no phase builder), `3 Phases & Deliverables` (new — `PhasesStep`), `4 Review & Create` (renumbered). Old page-level `scheduledAt`/`scheduleExpanded`/`startPhase` state and the 3-way "Just Save / Save + Set Schedule / Start Now" footer were removed entirely; the footer at the new Step 4 is a single "Create project(s)" submit button, since every card already carries its own resolved start mode by then.
- **New `_phases-step.tsx`:** one collapsible section per selected type (first expanded by default, rest collapsed), each embedding the existing `PhaseBuilder` — this is the primary scroll fix, moving the (often long) phase/deliverable/checklist tree out of the compact per-type config card.
- **Per-project StackShift I phase skip:** `PhaseDraft` gained `included: boolean` (default `true`). `PhaseBuilder`'s `fixed-phases` mode renders an "Included"/"Skip this phase" checkbox per phase (deliverables stay in the draft, just visually inert via `opacity-50`/`pointer-events-none` while unchecked — no data loss on re-check). `skipPhaseNumbersFromDraft()` (`_new-project-types.ts`) derives the 1-5 phase numbers to skip from array position (fixed-phases mode never reorders/adds/removes phases, so index+1 is exact). `phasePlanDraftToInput()` now also filters out `included: false` phases — this is how StackShift II's "generate default phases" mode gets the same per-phase skip UI for free, routed through the generic `phase_plan` instead of `skip_phase_numbers`.
- **Backend skip support:** new `resolveEffectivePhaseNumber(phaseNumber, skipPhaseNumbers)` in `customer-phases.ts` — if the requested target phase is itself skipped, the earliest non-skipped phase becomes the effective "active"/backdated one; if every phase is skipped, the request phase number is used as-is (purely for the now-moot backdate math). `seedAndStartProgramme`/`seedProgrammeAtPhase` (`seed.ts`) both take an optional `skipPhaseNumbers: number[] = []`: skipped phases get a `customer_phases` row with `status: "skipped"` (reusing the exact value the existing "jump to phase" override already produces for time-bypassed phases) and zero `customer_deliverables` rows. `POST /api/onboarding/projects` accepts a new optional `skip_phase_numbers?: number[]`, validated StackShift-I-only (same pattern as `programme_duration_days`), passed through to `seedAndStartProgramme` on the direct `mode: "start"` path. `PATCH /api/projects/[projectId]/programme/phase` accepts the same field for the wizard's two-step "jump to phase" submission and resolves/passes it into `seedProgrammeAtPhase`.
- **Duration & schedule generalized to every type:** `TypeCardState` gained `startMode: "draft" | "now" | "scheduled"`, `scheduledStartAt: string`, and a per-card `startPhase: 1|2|3|4|5` (StackShift I + `canManagePhases` only) — replacing the old single wizard-level `scheduledAt`/`startPhase` applied uniformly across a multi-type submission. Every `TypeConfigCard` now shows a duration input (StackShift I: real `programme_duration_days`; every other type: display-only Review-step metadata, per task 239's design that non-StackShift-I types use real `start_date`/`due_date`, not an abstract day count) and a 3-way Draft/Now/Scheduled control with an inline `DateTimePicker` when Scheduled is selected. `buildCreatePayload`/`runSubmission` derive `mode`/`scheduled_start_at`/`start_phase` per card instead of from one shared action.
- **Swimlane "Skipped" badge:** `_onboarding-detail.tsx`'s `Swimlane` component now renders a small greyed "Skipped" pill next to a phase's name when `dbStatus === "skipped"`, so an intake-time-excluded phase reads distinctly from a normal not-started one. No other changes were needed in that file — `activePhaseNumber`, `phasesCompleted`, and `buildReminders` all already key off `status === "active"` rather than positional/count assumptions, so a project with one or more `"skipped"` phases flows through existing display math correctly (verified by reading, not by live browser testing — see Verification Run).

### Files Changed
- `src/app/v2/(hub)/portfolio-tracker/new/_content.tsx` — 4-step restructure, per-card submission loop, single Step 4 submit button
- `src/app/v2/(hub)/portfolio-tracker/new/_phases-step.tsx` — new: Step 3, collapsible per-type phase builder sections
- `src/app/v2/(hub)/portfolio-tracker/new/_type-config-card.tsx` — phase builder embed removed; duration-for-all, per-card Draft/Now/Scheduled control + `DateTimePicker`, relocated "Start at phase N" control
- `src/app/v2/(hub)/portfolio-tracker/new/_phase-builder.tsx` — per-phase "Include this phase" toggle in fixed-phases mode
- `src/app/v2/(hub)/portfolio-tracker/new/_new-project-types.ts` — `PhaseDraft.included`, `TypeCardState.startMode`/`scheduledStartAt`/`startPhase`, `skipPhaseNumbersFromDraft()`
- `src/config/customer-phases.ts` — new `resolveEffectivePhaseNumber()`
- `src/lib/programme/seed.ts` — `skipPhaseNumbers` param on both seed functions
- `src/app/api/onboarding/projects/route.ts` — `skip_phase_numbers` field + validation + pass-through
- `src/app/api/projects/[projectId]/programme/phase/route.ts` — `skip_phase_numbers` field + `resolveEffectivePhaseNumber` + pass-through (not-started branch only)
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` — "Skipped" badge on the Swimlane phase label

### Deviations From Plan
- **`TypeCardState.startMode` is 3-valued (`"draft" | "now" | "scheduled"`), not the 2-valued (`"now" | "scheduled"`) shape sketched in the task doc's own Code Context.** The pre-task wizard had a "Just save" (no start, no schedule — `mode: "save"`) capability at the page level; the task doc's Requirements never asked to remove it, only to make duration/schedule per-card. Dropping to 2 values would have silently removed a capability nobody asked to remove. Kept it as a third "Draft" option instead — same per-card requirement, no functionality lost.
- **Known gap, flagged rather than silently worked around: `skip_phase_numbers` is not persisted for the deferred/scheduled-start paths.** A StackShift I card submitted with `startMode: "scheduled"` sends `skip_phase_numbers` in the initial `POST /api/onboarding/projects` call, but that call only *stores* the schedule (`scheduled_onboarding_start_at`) — the actual seeding happens later, via the QStash one-shot (`qstash-start`) or the 5-minute cron poll (`scheduled-autostart`), both of which call `seedAndStartProgramme` from a `projects` row that has no column to remember the original skip selection (unlike `programme_duration_days` and `scheduled_start_phase`, which already have dedicated columns for exactly this reason). Persisting the skip selection the same way would need a new `projects.skip_phase_numbers` column and a migration — not listed in the task doc's Proposed File Changes, and a genuine data-model scope question rather than a code-only fix, so it wasn't added silently. **Net effect: scheduling a StackShift I project's start for later while also skipping one or more default phases will seed all 5 phases (skip selection lost) once the scheduled start actually fires.** The immediate-start path (`startMode: "now"`, including the "jump to phase" two-step) is unaffected — skip selection is applied synchronously in both cases. Recommend a small follow-up task (new column + threading it through `qstash-start`/`scheduled-autostart`) before this combination is relied on in production.
- Everything else matches the task document as written.

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (2 pre-existing warnings in `_checklist-tab.tsx`, unrelated to this task — same warnings noted in tasks 222/239/240's own implementation notes)
- `pnpm build` — PASS (`/v2/portfolio-tracker/new` and all other routes compile clean, zero build warnings)
- Manual/browser acceptance checks from this task doc's Verification section — SKIPPED (no live Supabase/browser session available in this implementation pass, consistent with tasks 239/240's own precedent). Recommend running, in order: (1) StackShift I with 2 phases unchecked, confirm Timeline shows them "Skipped"/greyed; (2) StackShift I (now) + Discrete Development (scheduled) submitted together, confirm both created with independent start states; (3) StackShift II default-phases-checked with one phase excluded, confirm the seeded `milestones` omit it; (4) the known scheduled-start + skip-phase gap noted above, to confirm its actual behavior matches this note before relying on the combination.

## Quality Gate Notes

### Result
PASS

### Standards Review
- `console.log`/`TODO`/`FIXME`/`: any`/`as any` sweep across all 10 changed/touched files (the 7 wizard files, `customer-phases.ts`, `seed.ts`, both API routes, `_onboarding-detail.tsx`) returned zero hits.
- `npx eslint` run directly against exactly these 10 files (not just the whole-project `pnpm lint`) returned zero warnings/errors — confirms no unused imports, unused vars, or other lint-catchable issues were left behind by the multi-file refactor (e.g. the removed `X` icon import in `_content.tsx` after the old schedule-cancel button was deleted).
- **Found and fixed during this pass**: `seedAndStartProgramme`'s all-5-phases-skipped edge case (Requirement B explicitly allows it) fell back to the raw requested `phaseNumber` (default 1) for `effectivePhaseNumber` purely to keep the backdate math defined — but the `phase_members`/Phase-1-ownership insert was gated on that same fallback value (`effectivePhaseNumber === 1`), so a fully-skipped StackShift I project would still grant the creator "owner" of Phase 1 in `phase_members` even though Phase 1's own `customer_phases` row is seeded `status: "skipped"`. Fixed by adding an explicit `&& !allSkipped` guard around the `phase_members` insert only — the separate `project_members` upsert (needed so the creator can still find their own project on the list) correctly still runs unconditionally, per that block's own pre-existing rationale comment. Re-ran `tsc --noEmit` after the fix — still PASS.
- Naming is accurate throughout: `resolveEffectivePhaseNumber`, `skipPhaseNumbersFromDraft`, `effectivePhaseNumber`, `allSkipped` all describe exactly what they compute; `TypeCardState.startMode`'s three values (`"draft" | "now" | "scheduled"`) read unambiguously at every call site.
- Component/file responsibilities stayed cleanly separated post-refactor: `_new-project-types.ts` (pure data/draft-state helpers, no JSX), `_phase-builder.tsx` (the phase/deliverable/checklist editor + new include-toggle), `_phases-step.tsx` (new — collapsible per-type layout for Step 3), `_type-config-card.tsx` (per-type card composition — name/add-on/duration/schedule/phase-jump, no phase-builder content after the split), `_content.tsx` (wizard orchestration: steps, validation, submission loop, results).
- Error handling matches this codebase's existing fetch-wrapper convention throughout (`.catch(() => ({}))` on JSON parse, explicit `error` messages surfaced to the UI) — unchanged from tasks 239/240's pattern, just re-scoped to read per-card state instead of page-level state.
- No secrets, credentials, or debug logging introduced.
- `resolveEffectivePhaseNumber` was factored into `customer-phases.ts` (not duplicated inline in both `seed.ts` and the PATCH route) specifically to avoid the two call sites silently drifting out of sync on which phase is "effectively active" when a skip set is present — this was verified necessary: the route computes its own `startedAt` backdate *before* calling `seedProgrammeAtPhase`, so the resolution has to happen in a place both the route and `seed.ts` can share.

### Deviations
- **Minor** — Two files were touched that weren't listed in the task doc's own Proposed File Changes table: `src/config/customer-phases.ts` (new `resolveEffectivePhaseNumber()` helper) and `src/app/api/projects/[projectId]/programme/phase/route.ts` (accepts/validates/resolves `skip_phase_numbers` for the wizard's "jump to phase" two-step submission). Both were required for Requirement B's own stated scope to actually hold end-to-end — the task doc's Code Context explicitly says `seedProgrammeAtPhase` must accept `skipPhaseNumbers`, and that function is only ever invoked by this PATCH route (and the unrelated CSV/Excel import path, untouched here) — without threading the field through the route, the "Start StackShift I at phase N" + phase-skip combination in the same submission would silently ignore the PM's skip selection. This mirrors task 240's own precedent for the identical class of finding (touching `route.ts` for a fix required by that task's own stated design, not listed in its file table either). No new product behavior beyond what Requirement B specifies; no architecture change.
- **Minor** — The PATCH route's `skip_phase_numbers` validation silently filters out-of-range/non-integer entries rather than rejecting the request with 400 (unlike the POST route's stricter reject-on-invalid pattern for the same field). Accepted as low-risk: this PATCH is only ever called by the wizard's own `runSubmission`, immediately after a same-submission "save" creation, with values produced by `skipPhaseNumbersFromDraft()` (always 1-5 by construction) — there's no real path for a malformed value to reach this endpoint from the shipped UI. Documented here rather than left unexplained.
- **Minor** — `TypeCardState.startMode` shipped as 3-valued (`"draft" | "now" | "scheduled"`) instead of the task doc's own 2-valued Code Context sketch — see Implementation Notes' Deviations From Plan for the full rationale (preserves the pre-existing "Just save" capability the task doc's Requirements never asked to remove).
- **Medium** — `skip_phase_numbers` is not threaded through the deferred/scheduled-start cron paths (`qstash-start`, `scheduled-autostart`) — see Implementation Notes' Deviations From Plan for the full explanation and why it wasn't silently patched with an unplanned migration. Flagged (not fixed) because closing it properly requires a new `projects` column outside this task's listed file changes; the gap is visible (skip selection silently reverts to "all 5 included" only for the scheduled-start + skip-phase combination specifically), not silent-in-behavior-but-hidden-in-code.
- No Major deviations — every Out of Scope / Must-Not-Change boundary in the task doc was respected (verified explicitly: the closed `phase_number` 1-5 model and `PROGRAMME_PHASES` array are unmodified; Step 1, `Field`, `StepIndicator`'s mechanics, and `SuccessScreen` are untouched; `check-name` routes untouched; `STACKSHIFT_VARIANTS`/`isValidClassificationCombo` untouched; no backfill/migration added; the non-StackShift-I duration field is confirmed never sent as `programme_duration_days` — display-only, per `buildCreatePayload`'s `isStackShiftI ? card.durationDays : undefined`). The `_onboarding-detail.tsx` "Skipped" badge touches the StackShift Timeline's `Swimlane` component's phase-label rendering only — not the click/redirect behavior tasks 241/242 own — so it does not conflict with "swimlane/redirect behavior (tasks 241/242) is untouched."

### Required Fixes
- None (PASS). The `phase_members`/all-skipped ownership bug found during this review was fixed inline. Before relying on it in production, address the Medium-flagged scheduled-start + skip-phase gap (new `projects.skip_phase_numbers` column + threading through `qstash-start`/`scheduled-autostart`) as a small follow-up task, and run the manual browser acceptance scenarios listed in Implementation Notes' Verification Run (none of this was exercised in a live browser during implementation or this review).

## Round 2 — Post-QA Visual/UX Refinement (2026-08-14)

User reviewed the wizard visually (screenshots) after the quality gate above and requested the following amendments, applied while still in `Testing` (not yet shipped):

### Amended Requirements
- [x] Move duration, start (draft/now/scheduled), "start at phase N", and the StackShift II "generate default phases" checkbox from Step 2 (`TypeConfigCard`) to Step 3 (`PhasesStep`), grouped per type above that type's phase builder — setting a programme's duration/schedule before its phases are even configured didn't make sense as a field order. Step 2 now holds only project name + PipelineForge add-on per type.
- [x] Unify input styling across the phase builder (phase/deliverable/checklist name inputs) with `Field`'s own input treatment (`rounded-[9px]`, `border-[#E2E7F2]`/`bg-[#F4F6FB]`, `focus:border-[#007BFF]`/`focus:bg-white`/`focus:shadow-[0_0_0_3px_rgba(0,123,255,0.14)]`) — was a visually distinct smaller/tighter style (`rounded-[7px]`, plain white bg, no focus shadow). Also completed the same focus-shadow treatment on the duration input and "start at phase" select, which had the border/bg pieces but were missing the shadow ring.
- [x] Fix `StepIndicator`'s uneven connector-line widths — rebuilt as a CSS grid with dedicated `1fr` connector columns (was a flex row where each connector shared leftover space with its own label's width, so long labels like "Company & Contact" left almost no room for their connector while short ones like "Project Setup" stretched theirs long).
- [x] Step 4's footer rebuilt to match steps 1-3's row layout exactly: bordered pill "Back" button (left) + primary pill action button (right), same row — was a full-width CTA stacked over a bare text "← Back" link with no border, visually inconsistent with every other step.
- [x] Sortable (drag-to-reorder) phases (free-form mode only — see Deferred Scope below), deliverables (either mode), and checklist items (free-form deliverables), via `@dnd-kit/core`/`@dnd-kit/sortable` — already a project dependency, matching the existing pattern in `_board-view.tsx`/`_issue-board-view.tsx`.
- [x] Scroll-to-and-focus the first invalid field after a validation failure on Step 1 (company name / existing-company search / contact email) and Step 2 (first project-name field with an error), instead of leaving the PM to spot a small red error string unassisted.

### Deferred Scope (separate task required)
- **"Add phases on StackShift types, not only the default ones" — user explicitly chose to extend the Timeline itself** (not the lower-risk parallel-generic-milestones alternative that was offered). This reopens task 239's deliberately-locked closed `phase_number: 1|2|3|4|5` model — reworking it, and auditing the ~20 dependent files (RLS policies, day-math, dashboards, the Timeline's own Gantt grid/swimlane) is a genuinely separate, deep-tier architecture change, not a UI polish item. **Not implemented in this pass** — scoped to its own follow-up task rather than bolted onto this round's fixes, so it gets the dedicated research/planning pass that scale of change warrants. StackShift I/II's phase count remains 5 (skippable per task 244's original scope, not yet addable) until that follow-up task ships.
- Given the above, "sortable phases" in this round only applies where phases were already addable/removable (free-form mode: Access/Access Plus/Discrete Development, and StackShift II with its checkbox unchecked) — StackShift I/II's fixed-phases mode still shows its phases in the fixed Onboard→Optimize sequence, undraggable, consistent with the deferred item above.
- The Step 4 `submitError` banner (e.g. "Pick a schedule date/time for: X") now scrolls itself into view, but does not jump the PM back to Step 3 and expand/focus the specific card's schedule field — that would require lifting `PhasesStep`'s local `expanded` (collapsible-section) state up into `_content.tsx` and orchestrating a cross-step navigation, which wasn't judged worth the added complexity for what's already a rare case (Step 3's inline `DateTimePicker` makes an unset schedule visible before the PM ever reaches Step 4). Flagged here rather than silently left unaddressed.

### Files Changed (Round 2)
- `src/app/v2/(hub)/portfolio-tracker/new/_content.tsx` — `StepIndicator` rebuilt as CSS grid; Step 4 footer rebuilt to match steps 1-3; `scrollToField()` helper wired into Step 1/Step 2/submit validation failures; `TypeConfigCard`/`PhasesStep` prop wiring updated for the field relocation
- `src/app/v2/(hub)/portfolio-tracker/new/_type-config-card.tsx` — trimmed to name + PipelineForge add-on only
- `src/app/v2/(hub)/portfolio-tracker/new/_phases-step.tsx` — gained duration/start-mode/schedule/"start at phase"/StackShift-II-checkbox fields (relocated from `_type-config-card.tsx`), plus `canManagePhases`/`scheduleMin`/`scheduleMax` props
- `src/app/v2/(hub)/portfolio-tracker/new/_phase-builder.tsx` — unified input styling; added `@dnd-kit` sortable drag-and-drop for phases (free-form only)/deliverables/checklist items with a shared `DragHandle`/`useDragSensors()` helper

### Verification Run (Round 2)
- `npx tsc --noEmit` — PASS
- `npx eslint` (run directly against all 5 changed files) — PASS, zero warnings/errors
- `pnpm build` — PASS, zero warnings
- Manual/browser acceptance — SKIPPED, same reason as the original pass (no live browser session available). Recommend visually re-checking against the 4 reference screenshots this round was based on, plus a drag-reorder smoke test (reorder 2 free-form phases, 2 deliverables, 2 checklist items) and the scroll-to-error behavior on Step 1/2 before shipping.

## Closing Note — Task 246 Built On Top Of This Task's Files

Between Round 2 landing and this task closing, a separate session implemented task 246 (StackShift I/II Timeline — Custom Phases Beyond the Fixed 5, the item explicitly deferred out of this task's Round 2 — see "Deferred Scope" above). That work extended several files this task owns:

- `_new-project-types.ts` — `PhaseDraft` gained `phaseNumber`/`isCustom`/`dayStart`/`dayEnd`; `TypeCardState.startPhase` widened from `1|2|3|4|5` to `number`; new `nextPhaseNumber()`/`addCustomPhaseDraft()`/`customPhasesFromDraft()` helpers; `skipPhaseNumbersFromDraft()` now reads `phaseNumber` identity directly instead of array position (since custom phases can be inserted anywhere).
- `_phase-builder.tsx` — gained an "Insert custom phase after this one" affordance and day-range inputs for custom phases in fixed-phases mode, layered on top of (not replacing) this task's `included` skip-toggle, `DragHandle`/sortable infrastructure, and unified `InlineRow` input styling — all still present and functioning (grew from ~360 to 439 lines).
- `_phases-step.tsx` — the "Start at phase" field this task relocated to Step 3 now renders after the phase builder instead of before it (its options depend on which phases — including customs — actually exist in the plan) and its duration-label condition was widened to cover StackShift II-with-default-phases, now that task 246 re-points that mode onto the same specialized engine as StackShift I.
- `_content.tsx` — unaffected structurally; `StepIndicator`, the Step 4 footer, and `scrollToField()` all confirmed still present and untouched.
- `_type-config-card.tsx` — untouched (no phase-related content to extend).

Re-verified after these external changes landed: `npx tsc --noEmit`, `npx eslint` (wizard directory), and `pnpm build` all PASS. Every Round 1/Round 2 deliverable specific to this task — the 4-step wizard, per-project phase skip, per-card duration/schedule, sortable reordering, scroll-to-error, the rebalanced step indicator, and the matched-style Step 4 footer — was spot-checked present in the current files and functions independently of task 246's additions. This task is being closed on that basis; task 246's own correctness is that task's responsibility to verify, not re-litigated here.
