# 357: StackShift Order Convert — Phase/Deliverable Setup Choice

**Created:** 2026-09-10
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep
**Status:** Completed (2026-09-10 — marked complete at the user's explicit request; browser acceptance not run)

---

## Overview

Today the StackShift Orders review page's **"Create customer & project"** button
(`_convert-panel.tsx` → `POST /api/stackshift-orders/[orderId]/convert` → `createFromOrder()`)
creates a customer + a **draft `projects` row with no phases at all** — no `customer_phases`,
no `milestones`/`tasklists`. A PM then has to build the whole phase plan by hand afterward.

This task makes the convert action seed the project's phase/deliverable structure at creation
time, matching what the **New Project** wizard already does:

- **Classification includes StackShift I** → no prompt. Create a **draft project only** — flip
  `uses_customer_phases_engine = true` and persist the empty default draft config
  (`draft_skip_phase_numbers: []`, `draft_custom_phases: []`, `draft_default_phase_overrides: []`),
  exactly like the New Project wizard's "save as draft" path. **Do NOT** call
  `seedAndStartProgramme`, do NOT set `programme_started_at`, do NOT fire a Cliq notification.
  The 120-day programme seeds later, with the vanilla defaults, when someone runs the normal
  "Start Onboarding" flow.
- **Any other classification** → a **confirmation modal** with three choices:
  1. **Use the default StackShift phases** — copy the StackShift I phase/deliverable template
     into generic `milestones` / `tasklists` (empty checklists), via `seedCustomPhases()`. Same
     output as the wizard's "Generate default phases (same as StackShift I)" checkbox. No
     120-day engine.
  2. **Set the phases & deliverables now** — open the same `PhaseBuilder` UI the New Project
     wizard uses (free-form mode), then seed the built plan via `seedCustomPhases()`.
  3. **Skip for now** — seed nothing (today's behavior); PM adds phases manually later.

Because `PhaseBuilder` and its draft-plan helpers currently live *inside* the New Project
wizard route (`src/app/(hub)/projects/v2/new/`), the reusable parts are extracted to shared
locations so the convert dialog and the wizard share one implementation (no copy).

Decisions confirmed with the requester:
- StackShift I convert → **draft project only**; mark the engine + store empty default config,
  never auto-start the programme (revised mid-implementation from an earlier "start now" answer).
- Non-SS1 "default" → **generic milestones/tasklists**, not the `customer_phases` engine.
- "Set phases now" → **modal dialog** over the review page.

## Requirements

- [ ] `PhaseBuilder` component and the pure draft-plan helpers are moved to shared modules and
      imported by both the New Project wizard and the new convert dialog — the wizard's behavior
      and output stay byte-identical.
- [ ] Convert of an order whose classification set contains **StackShift I** skips the dialog and
      creates a draft project with `uses_customer_phases_engine = true` and empty
      `draft_skip_phase_numbers` / `draft_custom_phases` / `draft_default_phase_overrides`.
      No `customer_phases` / `customer_deliverables` rows, no `programme_started_at`, no Cliq.
- [ ] Convert of any **non-StackShift-I** order opens a modal with the three options above;
      "Create customer & project" is not fired until the reviewer picks one.
- [ ] "Use the default StackShift phases" seeds generic `milestones` + `tasklists` from
      `PROGRAMME_PHASES` (deliverables become tasklists, checklists empty).
- [ ] "Set the phases & deliverables now" renders the shared `PhaseBuilder` (free-form,
      starting from an empty draft), validates it with the wizard's own validators, and seeds
      the built plan via `seedCustomPhases()`.
- [ ] "Skip for now" produces exactly today's result (draft project, zero phase rows).
- [ ] `convertSchema` validates the new `phaseSetup` + optional `phasePlan` fields; `custom`
      without a non-empty `phasePlan` is a 400.
- [ ] Re-converting an already-converted order still early-returns without re-seeding.
- [ ] `npx tsc --noEmit` and `pnpm lint` are clean.

## Out of Scope / Must-Not-Change

- **No DB migration.** All columns used (`customer_phases.*`, `customer_deliverables.*`,
  `milestones.*`, `tasklists.*`, `projects.uses_customer_phases_engine`,
  `projects.programme_started_at`) already exist.
- **Do not** put a non-StackShift-I project on the `customer_phases` engine.
- **Do not** expose StackShift II's `use_default_phase_engine` opt-in here — convert only ever
  routes StackShift I to the engine.
- **Do not** change the New Project wizard's UX, request payload, or seeding output. The
  extraction is a pure relocation + re-export; `src/app/(hub)/projects/v2/new/_content.tsx`,
  `_phases-step.tsx`, and every other wizard file must keep compiling with no logic change.
- **Do not** add `skip_phase_numbers` / `custom_phases` / `default_phase_overrides` *choice* to
  the convert path — StackShift I convert always writes them as empty `[]` (plain 5-phase default
  when the programme is later started).
- **Do not** touch `_docs/task/347/354/356` behavior (webhook, notifications, submitter IP) —
  only the reviewer-side convert flow changes.
- Keep `adminClient` usage as-is in `createFromOrder` (it already runs service-level; the
  seed helpers also use `adminClient`).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/programme/phase-plan-draft.ts` | Create | Move the reusable "Draft shapes" block out of `_new-project-types.ts`: types (`ChecklistItemDraft`, `DeliverableDraft`, `PhaseDraft`, `PhasePlanDraft`, `EmptyNameError`, `EmptyNameErrorKind`) + pure helpers (`nextDraftId`, `nextPhaseNumber`, `defaultPhasePlanDraft`, `emptyPhasePlanDraft`, `addCustomPhaseDraft`, `setPhaseIncluded`, `extendLastPhaseToDuration`, `phasePlanDraftToInput`, `phasePlanValidationErrors`, `phasePlanEmptyNameErrors`, `emptyNameFieldId`). Add `defaultPhasePlanInput()` = `phasePlanDraftToInput(defaultPhasePlanDraft())`. No React imports — safe on the server. |
| `src/components/programme/phase-builder.tsx` | Create (move) | Relocate `src/app/(hub)/projects/v2/new/_phase-builder.tsx` verbatim; repoint its `./_new-project-types` import to `@/lib/programme/phase-plan-draft`. Now shared by wizard + convert dialog. |
| `src/app/(hub)/projects/v2/new/_phase-builder.tsx` | Delete | Superseded by `src/components/programme/phase-builder.tsx`. |
| `src/app/(hub)/projects/v2/new/_new-project-types.ts` | Modify | Delete the moved block; add `export * from "@/lib/programme/phase-plan-draft";` at the top so every existing wizard import (`_content.tsx`, `_phases-step.tsx`, …) keeps resolving unchanged. Keep the wizard-only `TypeCardState` / `initTypeCardState` / `PRIMARY_TYPES` / `getDisplayName` / `programmeDurationError` / `scheduledStartError` / `skipPhaseNumbersFromDraft` / `customPhasesFromDraft` / `defaultPhaseOverridesFromDraft`. |
| `src/app/(hub)/projects/v2/new/_phases-step.tsx` | Modify | `import PhaseBuilder from "@/components/programme/phase-builder"` (was `"./_phase-builder"`). |
| `src/lib/stackshift-orders/schema.ts` | Modify | `convertSchema`: add `phaseSetup: z.enum(["stackshift_default","custom","skip"]).default("skip")` and `phasePlan: phasePlanInputSchema.optional()` (new local zod schema mirroring `PhasePlanInput`). `.superRefine`: `phaseSetup === "custom"` requires `phasePlan` with ≥1 phase. |
| `src/lib/stackshift-orders/create-from-order.ts` | Modify | `ConvertInput` gains `phaseSetup: "stackshift_default" \| "custom" \| "skip"` + `phasePlan?: PhasePlanInput`. On the `projects` insert, when the primary classification is StackShift I set `uses_customer_phases_engine: true` + `draft_skip_phase_numbers: []` + `draft_custom_phases: []` + `draft_default_phase_overrides: []` (draft only — no seed call). Otherwise, after the insert, run `seedCustomPhases()` per `phaseSetup` (see Code Context). |
| `src/app/api/stackshift-orders/[orderId]/convert/route.ts` | Modify | Pass `parsed.data.phaseSetup` / `parsed.data.phasePlan` into `createFromOrder()`. Server computes "is StackShift I" itself and, if so, ignores `phaseSetup`/`phasePlan` (draft-engine columns only, no milestone seeding). |
| `src/app/(hub)/stackshift-orders/[orderId]/_components/_convert-panel.tsx` | Modify | `convert()` → `handleCreateClick()`: if the classification set contains `"StackShift I"`, POST immediately with `phaseSetup: "stackshift_default"`; otherwise open `<PhaseSetupDialog>`. New `submitConvert(phaseSetup, phasePlan?)` holds the shared fetch/redirect logic. |
| `src/app/(hub)/stackshift-orders/[orderId]/_components/_phase-setup-dialog.tsx` | Create | Page-scoped modal. Step 1: three option buttons. "default" / "skip" call back immediately with the chosen `phaseSetup`. "set now" swaps the modal body to the shared `PhaseBuilder` (`mode="free-form"`, `emptyPhasePlanDraft()`), validates on confirm (`phasePlanEmptyNameErrors` + `phasePlanValidationErrors`), then calls back with `("custom", phasePlanDraftToInput(draft))`. Overlay markup follows `src/app/(hub)/projects/_shared/_create-task-modal.tsx`. |
| `_docs/task/347-stackshift-order-form-intake-endpoint-review-queue.md` | Modify (doc) | Add a note that convert now seeds phases (was "NO programme auto-start"). |
| `TASKS.md` | Modify | Track this task. |

`CLAUDE.md` has a line under the `stackshift_orders` bullet that says convert creates
"one **draft** `projects` row (no `seedAndStartProgramme`)" — update it during the `document`
stage after this ships.

## Code Context

### `src/lib/stackshift-orders/create-from-order.ts` — new seeding matrix

The `projects` insert gains engine columns when the primary classification is StackShift I
(mirrors the wizard's `mode: "save"` insert — `src/app/api/onboarding/projects/route.ts`):

```ts
const usesEngine = shape.primaryClassification === "StackShift I";

const { data: project, error: projectError } = await adminClient
  .from("projects")
  .insert({
    customer_id: customerId,
    name,
    project_type: shape.projectType,
    customer_product_id: productId,
    created_by: input.actingUserId,
    ...(usesEngine
      ? {
          uses_customer_phases_engine: true,
          draft_skip_phase_numbers: [],
          draft_custom_phases: [],
          draft_default_phase_overrides: [],
        }
      : {}),
  })
  .select("id")
  .single();
```

Then, only for non-engine projects, seed generic milestones after the insert and **before** the
`// ── link back onto the order ──` update (so a seed failure throws before the order is marked
`converted`, letting the reviewer retry — same partial-state risk profile the function already
has for the project row itself):

```ts
import { seedCustomPhases } from "@/lib/programme/seed-custom-phases";
import { defaultPlanFromProgrammePhases } from "@/lib/programme/phase-plan-draft"; // = phasePlanDraftToInput(defaultPhasePlanDraft())

if (!usesEngine) {
  if (input.phaseSetup === "stackshift_default") {
    const { error } = await seedCustomPhases(project.id, input.actingUserId, defaultPlanFromProgrammePhases());
    if (error) throw new Error(error);
  } else if (input.phaseSetup === "custom" && input.phasePlan && input.phasePlan.phases.length > 0) {
    const { error } = await seedCustomPhases(project.id, input.actingUserId, input.phasePlan);
    if (error) throw new Error(error);
  }
  // phaseSetup === "skip": seed nothing — today's behavior.
}
// StackShift I: draft only — no seed call; the programme seeds later via Start Onboarding.
```

### `seedCustomPhases` (`src/lib/programme/seed-custom-phases.ts`)

```ts
export async function seedCustomPhases(
  projectId: string,
  createdByUserId: string | null,
  plan: PhasePlanInput,           // { phases: [{ name, dayStart, dayEnd, deliverables: [{ name, dayStart, dayEnd, checklist: [{title}] }] }] }
): Promise<{ error?: string }>
```
Phases → `milestones`, deliverables → `tasklists`, checklist items → `tasks`. Used today by
`POST /api/onboarding/projects` for every non-StackShift-I classification.

### `defaultPhasePlanDraft()` (moving from `_new-project-types.ts`)

Already builds a full generic draft from `PROGRAMME_PHASES` (`name`, `dayStart`, `dayEnd`, each
deliverable's `name` + static `key`, empty checklists). `phasePlanDraftToInput()` strips the
draft ids → `PhasePlanInput`. So `defaultPlanFromProgrammePhases()` is just
`phasePlanDraftToInput(defaultPhasePlanDraft())` — no new template data.

### `PhaseBuilder` props (`_phase-builder.tsx:514`, moving to `src/components/programme/`)

```ts
{
  mode: "fixed-phases" | "free-form";
  phasePlan: PhasePlanDraft;
  durationDays: number;                 // ignored in free-form
  onChange: (next: PhasePlanDraft) => void;
  onLastPhaseExtended?: (previousDayEnd: number | null) => void;   // fixed-phases only
  collapseAllButFirst?: boolean;
}
```
Self-contained (dnd-kit, inline editors, its own validation display). The convert dialog uses
`mode="free-form"`, `phasePlan={emptyPhasePlanDraft()}` held in local state, `durationDays={120}`.

### `_convert-panel.tsx` — current submit (to split)

```tsx
async function convert() {
  setError(null);
  if (classifications.length === 0) return setError("Select at least one classification.");
  if (!comboValid) return setError("At most one StackShift tier may be selected.");
  if (mode === "existing_customer" && !existingCustomerId) return setError("Pick an existing customer.");
  setBusy("convert");
  try {
    const res = await fetch(`/api/stackshift-orders/${order.id}/convert`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode, existingCustomerId: ..., classifications, projectName: projectName.trim() || undefined }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "Conversion failed");
    router.push(`${V2_ROUTES.CUSTOMERS}/${json.customerId}`);
  } catch (e) { setError(...); setBusy(null); }
}
```

New shape: keep all validation in `handleCreateClick()`; if `classifications.includes("StackShift I")`
call `submitConvert("stackshift_default")` directly, else `setDialogOpen(true)`. `submitConvert(phaseSetup, phasePlan?)`
adds `phaseSetup` + `phasePlan` to the POST body, everything else identical.

### `convertSchema` today (`src/lib/stackshift-orders/schema.ts`)

```ts
export const convertSchema = z.object({
  mode: z.enum(["new_customer", "existing_customer"]),
  existingCustomerId: z.string().min(1).max(64).optional(),
  classifications: z.array(z.enum(CLASSIFICATIONS)).min(1).max(4),
  projectName: z.string().min(1).max(300).optional(),
}).refine(v => v.mode !== "existing_customer" || !!v.existingCustomerId, { ... });
```

Add:
```ts
const checklistItemSchema = z.object({ title: z.string().min(1).max(300) });
const deliverablePlanSchema = z.object({
  name: z.string().min(1).max(300),
  dayStart: z.number().int().positive(),
  dayEnd: z.number().int().positive(),
  checklist: z.array(checklistItemSchema).max(50),
});
const phasePlanInputSchema = z.object({
  phases: z.array(z.object({
    name: z.string().min(1).max(300),
    dayStart: z.number().int().positive(),
    dayEnd: z.number().int().positive(),
    deliverables: z.array(deliverablePlanSchema).max(30),
  })).max(20),
});
```
Then `phaseSetup` + `phasePlan` on the object and a `superRefine` for `custom ⇒ phasePlan.phases.length > 0`.

## Implementation Steps

1. **Extract shared modules (no behavior change).**
   - Create `src/lib/programme/phase-plan-draft.ts` with the "Draft shapes" block cut from
     `_new-project-types.ts` + `defaultPlanFromProgrammePhases()`.
   - Create `src/components/programme/phase-builder.tsx` = old `_phase-builder.tsx` with its
     helper import repointed; delete the old file.
   - In `_new-project-types.ts`: remove the moved code, add `export * from "@/lib/programme/phase-plan-draft";`.
   - In `_phases-step.tsx`: repoint the `PhaseBuilder` import.
   - `grep -rn "_phase-builder\|_new-project-types" src/app/\(hub\)/projects/v2/new` to catch
     every import; `npx tsc --noEmit` + `pnpm lint` must be clean before touching convert.
2. **Schema.** Add `phasePlanInputSchema`, `phaseSetup`, `phasePlan`, and the `custom` refine to
   `convertSchema`.
3. **`createFromOrder`.** Extend `ConvertInput`; add the StackShift I engine/draft columns to the
   `projects` insert; run `seedCustomPhases` for non-engine projects between insert and order link.
4. **Convert route.** Forward `phaseSetup` / `phasePlan`; keep the server-side "is StackShift I →
   engine columns only, no milestone seeding" guard so a hand-crafted request can't route SS1
   to `seedCustomPhases`.
5. **`_phase-setup-dialog.tsx`.** Build the two-state modal (3 options → optional PhaseBuilder),
   following `_create-task-modal.tsx` for overlay/escape/scroll-lock. Loading + error states on
   the confirm button. `aria-label` on the close button; every option is a real `<button>`.
6. **`_convert-panel.tsx`.** Split `convert()` into `handleCreateClick()` + `submitConvert()`;
   wire the dialog; StackShift I bypasses it.
7. **Docs.** Note the change in `_docs/task/347`; leave the `CLAUDE.md` line for the `document`
   stage.
8. Verify (below).

## Acceptance Criteria

- [ ] New Project wizard: creating StackShift I, StackShift II (default + free-form), and
      Discrete Development projects still produces identical phase/deliverable seeding
      (regression check — the extraction changed no logic).
- [ ] Convert a **StackShift I** order → no dialog; the resulting project is a draft with
      `uses_customer_phases_engine = true` and empty `draft_*` phase config, **no**
      `customer_phases` / `customer_deliverables` rows, **no** `programme_started_at`, **no**
      Cliq message. Running "Start Onboarding" on it afterward seeds the vanilla 5-phase default.
- [ ] Convert a **Discrete Development** (or Access / Access Plus / PipelineForge) order → modal
      with three options appears; "Create customer & project" does nothing until one is chosen.
- [ ] "Use the default StackShift phases" → project has `milestones` named Onboard / Migrate &
      Rebrand / … with `tasklists` per deliverable; no `customer_phases` rows;
      `uses_customer_phases_engine` stays false.
- [ ] "Set the phases & deliverables now" → PhaseBuilder opens; a built 2-phase plan seeds as 2
      `milestones` + their `tasklists`/`tasks`; empty/invalid plan is blocked with the wizard's
      own inline errors.
- [ ] "Skip for now" → draft project, zero `milestones` / `customer_phases` rows (unchanged).
- [ ] `POST .../convert` with `phaseSetup:"custom"` and no `phasePlan` → 400.
- [ ] Re-POST `.../convert` for an already-converted order → same `{ customerId, projectId }`,
      no new phase rows.
- [ ] `npx tsc --noEmit` clean; `pnpm lint` clean.
- [ ] No *newly written* file in this task exceeds ~400 lines (the relocated
      `phase-builder.tsx` keeps its existing ~670 — splitting it is out of scope);
      `_convert-panel.tsx` stays well under ~250 (dialog logic lives in `_phase-setup-dialog.tsx`).

## Verification

```bash
npx tsc --noEmit
pnpm lint

# Manual (browser, dev server):
# 1. /projects/v2/new — create one project per classification; confirm phases seed as before.
# 2. Seed a pending StackShift I order (or use an existing one); open /stackshift-orders/<id>,
#    click "Create customer & project" — no dialog, lands on the customer page.
#    Check Supabase: projects.uses_customer_phases_engine = true, draft_* = [], NO
#    customer_phases rows, programme_started_at IS NULL. No Cliq message.
# 3. Seed a pending Discrete Development order; click the button — dialog appears.
#    Exercise each of the 3 options; verify milestones/tasklists (or absence) in Projects.
# 4. curl the convert route with phaseSetup:"custom" and no phasePlan → expect 400.
```

No automated test runner is configured (`CLAUDE.md`) — verification is `tsc` + lint + browser.

## Compatibility Touchpoints

- **Docs:** `_docs/task/347` and the `stackshift_orders` bullet in `CLAUDE.md` both currently
  state convert does no programme seeding — update (347 in this task, `CLAUDE.md` at `document`
  stage).
- **Shared component move:** `PhaseBuilder` and the draft helpers now live at
  `@/components/programme/phase-builder` and `@/lib/programme/phase-plan-draft`. Any future
  wizard work imports from there; `_new-project-types.ts` keeps re-exporting for back-compat.
- **No new outward signals.** StackShift I convert stays a silent draft-create (no Cliq); the
  programme-start Cliq still only fires from the actual Start Onboarding flow.
- **No** packaging / migration / adapter / install-surface impact.

## Implementation Notes

### What Changed
- Extracted the New Project wizard's `PhaseBuilder` component and all its pure draft-plan
  types/helpers into shared modules (`@/components/programme/phase-builder`,
  `@/lib/programme/phase-plan-draft`) so the StackShift Orders convert flow can reuse them
  verbatim. `_new-project-types.ts` now re-exports the moved helpers (`export *`) — every
  existing wizard import site is unchanged; the wizard's behavior/output is byte-identical.
- StackShift Orders **convert** now seeds the new project's phase structure:
  - **Classification includes StackShift I** → no dialog. The `projects` insert gets
    `uses_customer_phases_engine: true` + empty `draft_skip_phase_numbers` /
    `draft_custom_phases` / `draft_default_phase_overrides` (mirrors the wizard's "save as
    draft" insert). No `seedAndStartProgramme`, no `programme_started_at`, no Cliq — the
    120-day programme seeds later at Start Onboarding, per the mid-implementation instruction.
  - **Any other classification** → a modal (`_phase-setup-dialog.tsx`) with three options:
    *Use the default StackShift phases* (`seedCustomPhases(defaultPlanFromProgrammePhases())`),
    *Set the phases & deliverables now* (the shared `PhaseBuilder` in `free-form` mode →
    `seedCustomPhases(builtPlan)`), *Skip for now* (no seeding — prior behavior).
- `convertSchema` gained `phaseSetup` (`"stackshift_default" | "custom" | "skip"`, default
  `"skip"`) + optional `phasePlan` (new `phasePlanInputSchema`) with a refine requiring a
  non-empty plan when `phaseSetup === "custom"`.

### Files Changed
- `src/lib/programme/phase-plan-draft.ts` — **new.** Moved draft-plan types + pure helpers from
  `_new-project-types.ts`; added `defaultPlanFromProgrammePhases()` (= `phasePlanDraftToInput(defaultPhasePlanDraft())`).
- `src/components/programme/phase-builder.tsx` — **new (relocation).** Verbatim move of
  `src/app/(hub)/projects/v2/new/_phase-builder.tsx`; helper import repointed to the new lib module.
- `src/app/(hub)/projects/v2/new/_phase-builder.tsx` — **deleted** (moved).
- `src/app/(hub)/projects/v2/new/_new-project-types.ts` — trimmed to wizard-only code
  (`TypeCardState`, `initTypeCardState`, `PRIMARY_TYPES`, `scheduledStartError`, the three
  customer_phases-engine wire converters) + `export * from "@/lib/programme/phase-plan-draft"`.
- `src/app/(hub)/projects/v2/new/_phases-step.tsx` — `PhaseBuilder` import repointed to `@/components/programme/phase-builder`.
- `src/lib/stackshift-orders/schema.ts` — `phasePlanInputSchema` + `phaseSetup`/`phasePlan` on `convertSchema` + custom-requires-plan refine.
- `src/lib/stackshift-orders/create-from-order.ts` — `ConvertInput` gains `phaseSetup`/`phasePlan`;
  `usesEngine` branch on the `projects` insert; `seedCustomPhases` for non-engine projects, run
  before the order is marked `converted`.
- `src/app/api/stackshift-orders/[orderId]/convert/route.ts` — forwards `phaseSetup`/`phasePlan` to `createFromOrder`.
- `src/app/(hub)/stackshift-orders/[orderId]/_components/_convert-panel.tsx` — `convert()` split
  into `validate()` / `handleCreateClick()` / `submitConvert()`; StackShift I converts directly,
  others open `<PhaseSetupDialog>`.
- `src/app/(hub)/stackshift-orders/[orderId]/_components/_phase-setup-dialog.tsx` — **new.**
  Two-state modal (3 options → shared `PhaseBuilder`), overlay markup follows `_create-task-modal.tsx`.
- `_docs/task/347-...md` — added a Task 357 note under the "No programme auto-start" bullet.

### Deviations From Plan
- **SS1 depth reversed mid-implementation.** The task doc originally said "seed + start the
  programme now" (per the AskUserQuestion answer). The user then said "do not start onboarding
  immediately, save as draft only on Create project", so the plan + code were revised to the
  draft-engine-columns-only approach (Option B from the planning question). `seedAndStartProgramme`
  is not called by the convert path at all.
- **Extra pure helpers moved.** `programmeDurationError` + its private helper `lastIncludedPhase`
  were moved to `phase-plan-draft.ts` alongside `extendLastPhaseToDuration` (the plan listed only
  the latter). Reason: both use `lastIncludedPhase`; moving the pair avoids exporting an internal
  helper across the module seam. Only `scheduledStartError` stays wizard-local (needs `TypeCardState`).
- **impeccable hook — pre-existing font-size findings.** Editing `_convert-panel.tsx` re-lints the
  whole file; the hook flags ~4 pre-existing `text-[Npx]` literals (lines untouched by this task).
  The entire `stackshift-orders` feature + the relocated `PhaseBuilder` use literal px sizes as
  their established convention (CLAUDE.md: hand-rolled `text-[10-11px]` pill pattern), and the
  hook reports its DESIGN.md sidecar is stale. New code reuses `ERROR_BOX_CLASS` and standard
  sizes; the pre-existing lines were left as-is per "don't change intentional design to satisfy
  the hook".

### Verification Run
- `npx tsc --noEmit` — PASS (clean).
- `pnpm lint` — PASS (0 errors; 2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`).
- Browser acceptance — NOT RUN (deferred to the test stage; needs a pending StackShift I order
  and a pending non-SS1 order to exercise both convert paths).

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. Types are clean (no `any`), no dead/commented-out code, no debug logging,
  no secrets. `seedCustomPhases` errors are thrown and caught by the route's existing `try/catch`
  → 500 with the message.
- `src/lib/programme/phase-plan-draft.ts` is 326 lines (just over the 300 soft-warning, well under
  the 400 hard limit). It's a single cohesive concern (draft-plan shapes + pure manipulation
  helpers) lifted verbatim from `_new-project-types.ts` — splitting further would not aid
  understanding. Acceptable.
- `src/components/programme/phase-builder.tsx` stays 674 lines — a pure relocation of the
  existing wizard file; splitting it is explicitly out of scope for this task.
- `_convert-panel.tsx` landed at 250 lines (target was "well under ~250"). The dialog logic is
  fully extracted to `_phase-setup-dialog.tsx`; the panel only gained a `validate()` /
  `handleCreateClick()` / `submitConvert()` split + the dialog render. Still single-responsibility
  and readable — not a real concern, noted for transparency.
- `export *` re-export from `_new-project-types.ts` + a local named `import` of the same symbols
  from the shared module is valid TS and keeps all existing wizard import sites resolving with
  zero edits. `npx tsc --noEmit` confirms every consumer (`_content.tsx`, `_phases-step.tsx`,
  `_type-config-card.tsx`, `_phase-builder.tsx`) still resolves.
- impeccable design hook re-flags ~4 pre-existing `text-[Npx]` literals in `_convert-panel.tsx`
  (untouched lines; whole-file re-lint on edit). This feature area + the relocated `PhaseBuilder`
  use literal px sizes as their established convention (CLAUDE.md), and the hook reports its
  DESIGN.md sidecar is stale. New code reuses `ERROR_BOX_CLASS` + standard sizes. Left as-is per
  "don't change intentional design to satisfy the hook."

### Deviations
- **Medium — StackShift I depth reversed mid-implementation.** Original plan (from the
  AskUserQuestion answer) was "seed + start the programme now". The user then instructed
  "save as draft only on Create project", so both the task doc and the code were revised to the
  draft-engine-columns-only approach. `seedAndStartProgramme` is not called by the convert path.
  User-directed, task doc updated to match.
- **Minor — two extra pure helpers moved.** `programmeDurationError` + its private helper
  `lastIncludedPhase` were moved to `phase-plan-draft.ts` alongside `extendLastPhaseToDuration`
  (plan listed only the latter) to avoid exporting an internal helper across the module seam.
- **Medium — retry-after-partial-failure can duplicate.** If `seedCustomPhases` throws after the
  `projects` row is inserted, the order stays `pending_review` (seeding runs before the
  `converted` update, by design). A reviewer retry then re-runs `createFromOrder`: for
  `new_customer` mode it mints a fresh `customer_id` and suffixes the project name " (2)". This
  is the same non-idempotency `createFromOrder` already had for the project insert itself and
  that `seedCustomPhases` has in the New Project wizard — not newly introduced, but this task
  adds a new failure point inside that window. No mitigation added (out of scope); flagged for
  visibility. A `converted` order is still fully idempotent (early return).

### Required Fixes
- None.
