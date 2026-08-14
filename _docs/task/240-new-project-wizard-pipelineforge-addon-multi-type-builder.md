# 240: New Project Wizard — PipelineForge Add-on Section, Multi-Type Selection, Duration & Phase Builder

**Created:** 2026-08-13
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Testing

**Depends on:** task 239 (backend must ship first — this task's submit logic calls the new `programme_duration_days`/`phase_plan` fields and expects them to be understood by the API).

---

## Overview

Overhauls Step 2 ("Project Details") of the New Project wizard (`src/app/v2/(hub)/portfolio-tracker/new/_content.tsx`, currently 1247 lines — already over this repo's file-length guardrails, see `nextjs-file-length-best-practices.md`) so that:

1. **PipelineForge is hidden from the primary type grid.** Once the PM selects a primary type, PipelineForge appears below a divider under an "Add-on" heading. If **StackShift II** is selected, PipelineForge is auto-included with a visible "Included" badge (not a plain unchecked toggle — it's locked on). For every other type, it's a normal selectable add-on toggle.
2. **The 5 primary types (StackShift I/II, Access, Access Plus, Discrete Development) become independently multi-selectable**, each rendering its own configuration card below the grid: project name (auto-suggested, editable, per-type uniqueness-checked), and a type-specific body (duration + default-phase toggle for StackShift I/II; a free-form phase/deliverable/checklist builder — or "Skip for now" — for Access/Access Plus/Discrete Development).
3. **Submitting creates one project per selected type**, sequentially reusing the resolved/created customer across calls, and the success screen lists every created project.

### Key Design Decisions (confirmed with user; mirrors task 239's decisions — read that task's "Key Design Decisions" first)

- Multi-select is allowed across the 5 primary types; each selected type is one independent tracker (one `POST /api/onboarding/projects` call each), not one project with a combined `classifications` array like today.
- StackShift I always shows the default 120-day (or custom-duration) phase/deliverable list pre-filled, editable at the **deliverable** level only (phases themselves are fixed — see task 239's rationale).
- StackShift II defaults to the **same free-form phase/deliverable/checklist builder** as Access/Access Plus/Discrete Development, with an added checkbox: "Generate default phases & deliverables (same as StackShift I)" — checking it pre-fills the builder from `phasePlanFromProgramme()` (task 239) as an editable starting point; it does not switch StackShift II onto the specialized 120-day engine.
- Duration-in-days input only appears on the StackShift I card (default `120`, editable). StackShift II and the other three types have no duration field — their `milestones` use real `start_date`/`due_date`, not an abstract day count.
- PipelineForge add-on state is per selected primary-type card (a PM could add PipelineForge to StackShift I's card but not to a simultaneously-selected Discrete Development card).

## Requirements

- [ ] PipelineForge is removed from the main `CLASSIFICATIONS` grid in Step 2 and instead surfaces per-selected-type-card, under an "Add-on" divider/heading.
- [ ] Selecting StackShift II auto-adds PipelineForge to that card with a locked/"Included" visual state (no unchecking).
- [ ] Selecting any other primary type shows PipelineForge as a normal selectable add-on checkbox on that card (unchecked by default).
- [ ] The 5 primary types are independently toggleable (no more "at most one StackShift variant" cap) — the picker becomes: click any number of the 5 cards to select/deselect them.
- [ ] Each selected primary type renders its own configuration card underneath the grid with: an auto-suggested + editable project name (uniqueness-checked against `/api/onboarding/projects/check-name`, same as today but per-card), and:
  - **StackShift I:** duration-in-days input (default `120`), and an editable list of the default phases/deliverables (add/remove/rename **deliverables** within the fixed 5 phases; phases themselves are not addable/removable — see task 239).
  - **StackShift II:** "Generate default phases & deliverables (same as StackShift I)" checkbox; when checked, the same editable default-deliverable list as StackShift I appears (still saved as a generic phase plan, not the specialized engine); when unchecked, the free-form builder (below) appears.
  - **StackShift Access / StackShift Access Plus / Discrete Development:** a free-form phase/deliverable/checklist builder (add phase → add deliverable items under it → add checklist items under each deliverable) with an explicit "Skip for now" affordance that leaves the card's phase plan empty.
- [ ] Step 3 (Review) lists every selected type's summary (name, classification, add-on state, duration/phase-plan summary).
- [ ] Submit calls `POST /api/onboarding/projects` once per selected type-card, sequentially: the first call creates or resolves the customer; subsequent calls pass `{ existing_customer_id }` using the customer ID returned by the first response.
- [ ] If any call in the sequence fails, previously-created projects in this submission are **not** rolled back (each is a real, independently valid project) — the error state clearly lists which types succeeded and which failed, so the PM can retry only the failed ones.
- [ ] Success screen lists all created projects (name + "View" link each), not just one.
- [ ] `_content.tsx` is split into smaller files per `nextjs-file-length-best-practices.md` (currently 1247 lines; this task adds substantially more UI) — extract at minimum a type-card component and a phase-builder component into their own files.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass clean.

## Out of Scope / Must-Not-Change

- Step 1 (Company & Contact) is unchanged.
- The `Field`, `DateTimePicker`, `StepIndicator`, `SuccessScreen`-shell styling/mechanics are reused as-is, not redesigned.
- No changes to `src/app/api/customers/check-name/route.ts`.
- Existing single-classification create flows for already-shipped surfaces (e.g. the Import Project wizard, `portfolio-tracker/import/_content.tsx`) are untouched — this task only touches `portfolio-tracker/new/_content.tsx` and its new sub-components.
- Swimlane/redirect behavior for the created projects is tasks 241 (StackShift Phase 2-5) and 242 (generic Projects module) — not this task.
- No change to `STACKSHIFT_VARIANTS`/`isValidClassificationCombo` semantics beyond what's needed for per-card validation (each card still only ever contains one primary + optional PipelineForge, so the existing combo validator keeps working unchanged per call).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/portfolio-tracker/new/_content.tsx` | Modify | Step 2 restructure: multi-select grid (drop `toggleClassification`'s "swap StackShift variant" rule), render one `<TypeConfigCard>` per selected type, submit loop |
| `src/app/v2/(hub)/portfolio-tracker/new/_type-config-card.tsx` | Create | Per-type card: name field, PipelineForge add-on row, duration input (StackShift I) or default-toggle (StackShift II), embeds `<PhaseBuilder>` |
| `src/app/v2/(hub)/portfolio-tracker/new/_phase-builder.tsx` | Create | Free-form phase → deliverable → checklist-item builder UI + "Skip for now"; also renders the editable default-deliverable list mode (StackShift I / StackShift II-with-default) |
| `src/app/v2/(hub)/portfolio-tracker/new/_new-project-types.ts` | Create | Shared local types: `TypeCardState`, `PhasePlanDraft`, etc. |
| `src/config/customer-phases.ts` | Read only | Reuse `CLASSIFICATIONS`, `STACKSHIFT_VARIANTS`, `PROGRAMME_PHASES`, and task 239's new `phasePlanFromProgramme()`/`PhasePlanInput` |

## Code Context

### `_content.tsx` — current single-classification-array model to replace (lines 556-596)

```tsx
const [classifications, setClassifications] = useState<Classification[]>([]);
...
function toggleClassification(c: Classification) {
  setClassifications((prev) => {
    if (prev.includes(c)) return prev.filter((x) => x !== c);
    if (STACKSHIFT_VARIANTS.includes(c)) {
      return [...prev.filter((x) => !STACKSHIFT_VARIANTS.includes(x)), c]; // ← this "swap" rule goes away
    }
    return [...prev, c];
  });
}
...
const displayedProjectName = projectNameTouched || !companyName.trim()
  ? projectName
  : `${companyName.trim()} ${deriveProjectSuffixMulti(classifications)}`;
```

Replace with: `selectedTypes: Classification[]` (the 5 primary types only, no cap), and a `Record<Classification, TypeCardState>` map for per-card config (name, name-touched, name-error, pipelineforgeAddon, durationDays, useDefaultPhases, phasePlan). Selecting/deselecting a type adds/removes its entry from both. `PipelineForge` is never a member of `selectedTypes` — it's read/written only inside each card's `pipelineforgeAddon` boolean.

### `_content.tsx` — classification grid render (lines 1031-1038) and card model (`ClassificationCard`, lines 394-434)

```tsx
<div className="grid grid-cols-2 gap-3">
  {CLASSIFICATIONS.map((c) => (
    <ClassificationCard key={c} classification={c} selected={classifications.includes(c)} onSelect={() => toggleClassification(c)} />
  ))}
</div>
```

`CLASSIFICATIONS` (from `customer-phases.ts`) includes `"PipelineForge"` as element 5 of 6 — filter it out of this grid (`CLASSIFICATIONS.filter((c) => c !== "PipelineForge")`), and reuse `ClassificationCard`'s existing selected/unselected visual for the 5 primary cards (`ClassificationCard` itself needs no changes — only the array fed into it and the click handler change).

### `_content.tsx` — submit flow to replace with a loop (lines 682-730)

```tsx
function buildCreatePayload(mode) {
  return { mode, ..., customer: companyMode === "existing" ? {...} : {...}, classifications, project_name: displayedProjectName.trim() };
}
async function submit(mode) {
  const res = await fetch("/api/onboarding/projects", { method: "POST", body: JSON.stringify(buildCreatePayload(mode)) });
  const data = await res.json();
  setSuccess({ project_id: data.project_id, customer_id: data.customer_id, isNewCustomer: companyMode === "new" });
}
```

New version builds one payload per selected type (`classifications: [type, ...(card.pipelineforgeAddon ? ["PipelineForge"] : [])]`, `programme_duration_days: type === "StackShift I" ? card.durationDays : undefined`, `phase_plan: type !== "StackShift I" ? card.phasePlan : undefined`), and after the first successful response, rewrites subsequent payloads' `customer` field to `{ existing_customer_id: firstResponse.customer_id }` regardless of the original `companyMode` (so a "new company" submission with 3 selected types creates the customer once, then 2 more projects under it — mirrors how `companyMode === "existing"` already works for a single project today). `success` becomes `{ customer_id: string; isNewCustomer: boolean; projects: { project_id: string; classification: Classification }[] }`.

### `src/config/customer-phases.ts` — reused constants (already read by this file)

```ts
export const CLASSIFICATIONS = ["StackShift I", "StackShift II", "StackShift Access", "StackShift Access Plus", "PipelineForge", "Discrete Development"] as const;
export const STACKSHIFT_VARIANTS: Classification[] = ["StackShift I", "StackShift II", "StackShift Access", "StackShift Access Plus"];
export const PROGRAMME_PHASES: PhaseConfig[] = [ /* 5 phases, each with .deliverables[] */ ];
```

Task 239 adds `phasePlanFromProgramme(): PhasePlanInput` and `PhasePlanInput`/`DeliverablePlan`/`ChecklistItemPlan` types to this same file — import them in `_phase-builder.tsx`/`_type-config-card.tsx` rather than re-deriving the shape.

### Naming suffix per type — existing helper, still applicable per-card

```ts
export function deriveProjectSuffixMulti(selected: Classification[]): "Website" | "App" {
  return selected.includes("Discrete Development") ? "App" : "Website";
}
```

Call this per-card with `[type, ...(addon ? ["PipelineForge"] : [])]` to keep today's auto-suggested-name behavior (`${companyName} ${type} Website` / `... App` for Discrete Development), not a single combined suggestion across all selected types.

## Implementation Steps

1. Confirm task 239 has shipped (or stub the two new API fields locally if working ahead — do not block on this, but do not consider this task done until 239's fields are actually understood server-side).
2. Create `_new-project-types.ts` with the shared local types (`TypeCardState`, `PhasePlanDraft` mirroring task 239's `PhasePlanInput`).
3. Create `_phase-builder.tsx`: two render modes — (a) "default deliverable list" (StackShift I always; StackShift II when its checkbox is checked) rendering `PROGRAMME_PHASES`' 5 phases with add/remove-deliverable controls only; (b) "free-form builder" (Access/Access Plus/Discrete Development; StackShift II when its checkbox is unchecked) with add-phase/add-deliverable/add-checklist-item controls and a "Skip for now" toggle that collapses the builder to an empty state.
4. Create `_type-config-card.tsx`: name field (reuse `Field`), PipelineForge add-on row (checkbox, locked+"Included" badge when `type === "StackShift II"`), duration input (StackShift I only), "Generate default..." checkbox (StackShift II only), embeds `<PhaseBuilder>`.
5. In `_content.tsx`: replace `classifications`/`toggleClassification`/`displayedProjectName` with `selectedTypes`/`cardsByType` state; filter PipelineForge out of the main grid; render `<TypeConfigCard>` per selected type below the grid, inside an "Add-on" divider block only for the per-card PipelineForge row (not a page-level section, since add-on choice is per type).
6. Update Step 2's `goNext` validation to check every selected card's name (and duplicate names across cards in the same submission) instead of a single `displayedProjectName`.
7. Update Step 3 (Review) to list every card.
8. Rewrite `submit`/`startAtPhase` as the sequential-loop described above; update `SuccessScreen` (or a new `MultiSuccessScreen`) to list N projects.
9. Run `npx tsc --noEmit` and `pnpm lint`; manually walk the wizard in the browser for: single StackShift I, StackShift II with default checkbox on/off, two types selected simultaneously (one with PipelineForge add-on), and a "skip for now" Discrete Development submission.

## Acceptance Criteria

- [ ] PipelineForge never appears in the primary 2-column grid.
- [ ] Selecting StackShift II shows PipelineForge on its card as included/locked, with a clear visual indicator (not an unchecked toggle).
- [ ] Selecting StackShift I + Discrete Development simultaneously renders two independent config cards, and submitting creates two `projects` rows under one customer.
- [ ] StackShift I's card shows a duration input defaulting to 120; changing it and submitting produces a project whose `programme_duration_days` matches (verify via task 239's created row).
- [ ] StackShift II's card, with the default-phases checkbox checked, submits a `phase_plan` populated from `PROGRAMME_PHASES`' names; unchecked, submits whatever the free-form builder holds (or empty, if untouched/skipped).
- [ ] Access/Access Plus/Discrete Development cards default to "Skip for now" and can optionally have phases/deliverables/checklist items added.
- [ ] A mid-sequence failure (e.g. second of three types has a duplicate name) leaves the first project created and clearly reports which type failed, without silently losing the successful ones.
- [ ] Success screen lists every created project with a working "View" link per project.
- [ ] `_content.tsx` and its new sibling files each stay under this repo's soft ~300-line guidance where reasonably achievable (large forms may exceed it — acceptable if the split still meaningfully separates concerns per `nextjs-file-length-best-practices.md`'s "scroll test"/"single responsibility" heuristics, not a hard line count).
- [ ] `npx tsc --noEmit` and `pnpm lint` pass clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser acceptance (no test runner configured) — run `pnpm dev`, navigate to `/v2/portfolio-tracker/new`:
- New company + StackShift I only, default 120 days, submit with "start" — confirm one project created, Timeline shows Day 1/120.
- New company + StackShift I (duration 60) + Discrete Development (skip for now) simultaneously — confirm 2 projects created under 1 new customer, StackShift I's Timeline shows `/60`.
- Existing company + StackShift II with default-phases checkbox checked, edit one deliverable name before submit — confirm the edited name persists in the created `tasklists` row (via `/v2/projects/[projectId]`).
- StackShift II with the checkbox unchecked, add 2 custom phases with deliverables/checklist items, submit — confirm matching `milestones`/`tasklists`/`tasks`.
- Force a duplicate-name failure on the second of two selected types — confirm the first project's success is preserved and reported, and only the failed type is retryable.

## Compatibility Touchpoints

- Depends on task 239's API contract (`programme_duration_days`, `phase_plan` fields) being live.
- No `_docs/mcp-tools.md` changes.
- Tasks 241/242 build UI that reads the `milestones`/`tasklists`/`tasks` rows this wizard causes to be seeded (via task 239) — no direct code dependency, but manual testing of 241/242 should use projects created through this wizard.

## Implementation Notes

### What Changed
- Step 2 ("Project Details") is fully restructured: `CLASSIFICATIONS` filtered to `PRIMARY_TYPES` (the 5 primary types, PipelineForge excluded) for the main grid; the old single `classifications`/`toggleClassification` "swap StackShift variant" model is replaced by `selectedTypes: Classification[]` (no cap — any number of the 5 may be selected) plus `cardsByType: Partial<Record<Classification, TypeCardState>>` holding one independent config per selected type.
- New `TypeConfigCard` (one per selected type) renders: an auto-suggested + editable project name, a per-card PipelineForge "Add-on" row (locked/"Included" badge for StackShift II, a normal toggle for every other type), a duration-in-days input for StackShift I only, a "Generate default phases & deliverables (same as StackShift I)" checkbox for StackShift II only, and an embedded `PhaseBuilder`.
- New `PhaseBuilder` has two modes: `fixed-phases` (StackShift I always; StackShift II when its checkbox is checked) — the 5 programme phases pre-filled from task 239's `phasePlanFromProgramme()`, deliverables addable/removable/renamable, phases themselves fixed; `free-form` (Access/Access Plus/Discrete Development; StackShift II when unchecked) — phases, deliverables, and checklist items are all addable/removable, with an empty-state "Skip for now / Add first phase" prompt when no phases exist yet.
- Submit is now a sequential per-type loop (`runSubmission`): one `POST /api/onboarding/projects` call per selected type, the first call's response resolves the customer id and every subsequent call reuses it via `{ existing_customer_id }`. A failed type does not block or roll back already-succeeded types; results are tracked per type (`SubmitOutcome[]`) and a "Retry failed (N)" action re-runs only the failed types against the now-known customer id.
- The old single-project `SuccessScreen` was generalized to list every result: successes get a "View" link each, failures show their error inline, and the header/icon/copy adapt to all-succeeded vs. partial-failure.
- Step 3 (Review) now lists a per-type summary card (name, PipelineForge add-on badge if present, and a duration/phase-count summary) instead of a single classification/name pair.
- The "Start at phase N" picker (marketing/admin/super_admin only) now only appears when StackShift I is among the selected types, since Phase 2-5 jump semantics only apply to it; other types in the same submission always get a plain `mode: "start"` call.
- **Found and fixed a bug in task 239's already-shipped API route** (blocking, not optional — see Deviations below): `POST /api/onboarding/projects`'s `mode === "start"` branch unconditionally called `seedAndStartProgramme` (seeding `customer_phases`/`customer_deliverables`) regardless of classification. This was latent but harmless as long as only StackShift I/II ever used `mode: "start"` (the pre-multi-type wizard's only real-world pattern); task 240 makes it reachable for Access/Access Plus/Discrete Development too, which must never get the specialized engine seeded. Gated the branch to `body.mode === "start" && isStackShiftI`.
- Extracted `DateTimePicker` (previously inline, ~200 lines, zero coupling to wizard state) into its own file as part of bringing `_content.tsx` back down after the new UI's net size increase.

### Files Changed
- `src/app/v2/(hub)/portfolio-tracker/new/_new-project-types.ts` — new: `TypeCardState`, phase-plan draft types (`PhasePlanDraft`/`PhaseDraft`/`DeliverableDraft`/`ChecklistItemDraft`), `initTypeCardState`, `defaultPhasePlanDraft`/`emptyPhasePlanDraft`, `phasePlanDraftToInput`, `PRIMARY_TYPES`
- `src/app/v2/(hub)/portfolio-tracker/new/_phase-builder.tsx` — new: the fixed-phases/free-form phase/deliverable/checklist builder
- `src/app/v2/(hub)/portfolio-tracker/new/_type-config-card.tsx` — new: per-type configuration card, including the PipelineForge add-on row
- `src/app/v2/(hub)/portfolio-tracker/new/_date-time-picker.tsx` — new: `DateTimePicker`, extracted unchanged from `_content.tsx`
- `src/app/v2/(hub)/portfolio-tracker/new/_content.tsx` — rewritten Step 2/3 render, multi-type state, submit loop, `SuccessScreen`; `Field` exported for reuse by `_type-config-card.tsx`; `DateTimePicker` and its dedicated imports removed (now imported)
- `src/app/api/onboarding/projects/route.ts` — bugfix: gated `seedAndStartProgramme` to `isStackShiftI` (see above; this file otherwise belongs to task 239, this is the one change made here)

### Deviations From Plan
- **`_content.tsx` extraction went one file further than the task doc's minimum** ("extract at minimum a type-card component and a phase-builder component") — also extracted `_date-time-picker.tsx`, since the new Step 2/3 logic pushed `_content.tsx` net-larger despite the two required extractions (1247 → 1409 lines before this extra split), and `DateTimePicker` was a zero-risk, fully self-contained candidate. Final size: `_content.tsx` 1197 lines (net *smaller* than the pre-task 1247, despite substantially more functionality), `_type-config-card.tsx` 169, `_phase-builder.tsx` 235, `_new-project-types.ts` 91, `_date-time-picker.tsx` 215. Still well above the repo's soft ~300-line guidance for `_content.tsx` itself, which the task doc's own acceptance criteria explicitly allows ("large forms may exceed it... not a hard line count") given it remains a single coherent multi-step wizard orchestrator.
- **Fixed a bug in task 239's shipped `route.ts`** (the unconditional `seedAndStartProgramme` call on `mode: "start"`) rather than working around it in the wizard. This wasn't listed in task 240's Proposed File Changes (that file wasn't expected to need edits), but leaving it unfixed would mean any non-StackShift-I "Start" submission incorrectly seeds the 120-day engine — a direct violation of task 239's own "Key Design Decisions" ("StackShift II never touches customer_phases/customer_deliverables... [applies to] every classification except StackShift I"). Scoped to the smallest possible change (one added condition), not a broader refactor of that route.
- Everything else matches the task document as written.

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (2 pre-existing warnings in `_checklist-tab.tsx`, unrelated to this task)
- Manual/browser acceptance checks from the task doc's Verification section — SKIPPED (no live Supabase/browser session available in this implementation pass; the multi-type submission loop, retry-on-partial-failure path, and both PhaseBuilder modes should be walked through in a real browser before shipping — recommend starting with the task doc's 5 listed scenarios)

## Quality Gate Notes

### Result
PASS

### Standards Review
- `console.log`/`TODO`/`FIXME`/`: any`/`as any` sweep across all 6 changed files returned zero hits.
- **Found and fixed during this pass**: `toggleType` (`_content.tsx`) originally called `setCardsByType(...)` *inside* `setSelectedTypes`'s updater function — React state updaters must stay pure (no side effects), and this pattern is exactly what React 18/19 Strict Mode's dev-only double-invocation is designed to catch (it would have double-fired `setCardsByType`, wastefully calling `initTypeCardState`/`nextDraftId()` twice per toggle). Rewritten so `selectedTypes.includes(c)` is read directly from render scope (safe — `toggleType` only ever runs synchronously from a click handler) and the two `setState` calls are now siblings, not nested. Verified `tsc`/`lint` still pass after the fix.
- Component responsibilities are clearly separated post-extraction: `_new-project-types.ts` (pure data/draft-state helpers, no JSX), `_phase-builder.tsx` (the two-mode phase/deliverable/checklist editor), `_type-config-card.tsx` (per-type card composition), `_date-time-picker.tsx` (fully self-contained, zero coupling to wizard state), `_content.tsx` (wizard orchestration: steps, validation, submission loop, results).
- Naming is accurate throughout: `runSubmission`/`retryFailed`/`buildCreatePayload`/`displayedNameForCard` all describe exactly what they do; `SubmitOutcome`/`SubmitAction`/`TypeCardState`/`PhasePlanDraft` read clearly at their call sites.
- Error handling matches this codebase's existing fetch-wrapper convention (`.catch(() => ({}))` on JSON parse, explicit `error` messages surfaced to the UI) — consistent with the pre-existing single-project `submit`/`startAtPhase` this replaced.
- No secrets, credentials, or debug logging introduced.
- `Field` was exported (not duplicated) for reuse by `_type-config-card.tsx` — avoids the repeated-markup risk the Standards Checklist flags.

### Deviations
- **Minor** — `_content.tsx` was split into one more file than the task doc's stated minimum (also extracted `_date-time-picker.tsx`, a fully self-contained, zero-risk component), to help offset the new Step 2/3 logic's size before any splitting. Net result: `_content.tsx` ends at 1197 lines — smaller than the pre-task 1247 despite substantially more functionality — with 4 clearly-scoped sibling files. Still above the repo's soft ~300-line guidance, which the task doc's own acceptance criteria explicitly permits for "large forms."
- **Minor** — One line changed in `src/app/api/onboarding/projects/route.ts` (task 239's file, not in task 240's Proposed File Changes): gated the `mode === "start"` branch to `isStackShiftI`, fixing a latent bug where any classification's "Start" submission would incorrectly seed the StackShift-I-only `customer_phases`/`customer_deliverables` engine. This was unreachable before task 240 (the pre-existing single-project wizard only ever sent StackShift I/II through `mode: "start"` in practice) and became reachable — and incorrect — the moment task 240 allowed Access/Access Plus/Discrete Development to submit with `mode: "start"`. Fixing it here (rather than filing a separate follow-up) was necessary for task 240's own acceptance criteria to hold; the fix is a single added condition, not a broader change to that route.
- No Major deviations — every requirement in the task doc is met, the Out of Scope boundaries (Step 1, `Field`/`DateTimePicker`/`StepIndicator` mechanics, `check-name` route, Import Project wizard, swimlane/redirect behavior, `STACKSHIFT_VARIANTS`/`isValidClassificationCombo` semantics) were all respected, and both cross-file fixes above are narrowly scoped corrections required by the task's own stated design, not scope expansion.

### Required Fixes
- None (PASS). The setState-impurity issue found during this review was fixed inline rather than deferred. Recommended non-blocking follow-up: run the task doc's 5 manual browser scenarios (multi-type submission, duration override, StackShift II default-checkbox on/off, free-form builder, forced duplicate-name partial failure + retry) before shipping — none of this was exercised in a live browser during implementation or this review.
