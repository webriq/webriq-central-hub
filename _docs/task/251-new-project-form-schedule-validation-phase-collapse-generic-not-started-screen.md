# 251: New Project Form — Scheduled Start Validation, StackShift I Phase Collapse-by-Default, Generic-Engine Scheduled/Draft Screen Parity

**Created:** 2026-08-14
**Priority:** MEDIUM
**Type:** enhancement / bug fix
**Recommended Tier:** deep
**Status:** Planned
**Depends on:** 244 (per-card `startMode`/`scheduledStartAt`), 247 (`GenericPhaseView` generic-engine detail split), 248 (StackShift I's not-started/Scheduled/Draft screen), 250 (per-phase collapse pattern in `PhaseBuilder`)

---

## Overview

Three requests against `/v2/portfolio-tracker/new` (New Project wizard) and the Portfolio Tracker project detail page:

1. **Validate the "Scheduled start" field.** When a card's Start option is set to "Scheduled" (`_phases-step.tsx`), the `DateTimePicker` currently has no inline validation — a PM can leave it empty and advance straight to Review; the only guard today is a step-4 submit-time banner (`missingSchedule` in `_content.tsx`'s `runSubmission`) that lists offending types by name after the fact. Also, `DateTimePicker`'s `min`/`max` only disable whole calendar days, so picking *today* with a time earlier than the current moment silently produces a past `scheduledStartAt`.
2. **Collapse StackShift I's phases by default.** `PhaseBuilder`'s per-phase collapse state (task 250) currently starts every phase expanded. For StackShift I specifically, default to only Phase 1 expanded, with Phases 2–5 collapsed, so the section reads as a compact overview instead of a wall of 5 fully-expanded day-range/deliverable editors.
3. **Give every non-StackShift-I project type a real Scheduled/Draft "not started" screen.** Discrete Development (and, by the same request, StackShift Access, StackShift Access Plus, and StackShift II without the customer_phases engine opt-in — collectively "generic-engine" projects) can already be created with Start option Scheduled or Draft, but their detail page (`_generic-phase-view.tsx`) has no equivalent to StackShift I's not-started screen (`_onboarding-detail.tsx` lines ~1647–1784, task 248). It jumps straight to the live milestone board because `projects.phase_plan` is seeded into `milestones`/`tasklists`/`tasks` **immediately at creation regardless of mode** (`api/onboarding/projects/route.ts` lines 524–532) — so `milestones.length === 0` (`GenericPhaseView`'s only "not ready" signal today) is never a reliable proxy for "hasn't started yet."

### Investigation finding — Requirement 3 also uncovers a live bug

`projects.programme_started_at` is a generic column (not customer_phases-specific), but it is currently **only ever written for customer_phases-engine projects** (`seedAndStartProgramme`, called from the intake route, the manual Start button, the 15-minute cron, and the QStash callback). It is documented in `_onboarding-list.tsx` (lines 246–250) as "StackShift-I-specific and null for generic-engine projects." Meanwhile:

- The onboarding list's own `status` derivation (`api/onboarding/projects/route.ts` line 177: `programme_started_at ? "in_progress" : scheduled_onboarding_start_at ? "scheduled" : "draft"`) is written generically and already *intends* to work for every classification — but because `programme_started_at` never gets set for generic-engine projects, they are permanently stuck showing "Scheduled" or "Draft" on the list even after the PM is actively working the milestones/tasks underneath.
- Worse: `api/onboarding/scheduled-autostart/route.ts` (15-min cron) and `api/onboarding/projects/[projectId]/qstash-start/route.ts` (one-shot QStash callback) both query `projects` by `scheduled_onboarding_start_at` + `programme_started_at IS NULL` with **no `uses_customer_phases_engine` filter**, and unconditionally call `seedAndStartProgramme` — which seeds `customer_phases`/`customer_deliverables` rows. A generic-engine project (e.g. Discrete Development) created with mode `save_scheduled` will, once its scheduled time passes, get StackShift-shaped `customer_phases` rows wrongly seeded onto it by whichever of these two fires first.

Fixing requirement 3 properly (branching these two routes — and the manual `/programme/start` route — on `uses_customer_phases_engine`, and only then setting `programme_started_at` for a generic project without re-seeding anything) closes this bug as a side effect and makes the onboarding list's existing status/sort logic finally correct for every classification, with no changes needed there.

## Requirements

- [ ] **Scheduled start validation:** advancing past Step 3 (`goNext`) is blocked, with an inline red error under the `DateTimePicker` (mirrors the duration field's error styling) and a scroll-to-field jump, when any selected card has `startMode === "scheduled"` and either (a) no `scheduledStartAt` is set, or (b) the picked moment is not in the future (closes the same-day-past-time gap `min`/`max` day-granularity leaves open).
- [ ] The Review step's existing `missingSchedule` submit-time guard in `runSubmission` may stay as defense-in-depth but is no longer the primary/only guard.
- [ ] **StackShift I phase collapse:** on the New Project wizard's Step 3, a StackShift I card's `PhaseBuilder` initializes with only Phase 1 expanded; Phases 2–5 start collapsed. StackShift II (even with "Generate default phases" checked, which uses the same fixed-phases `PhaseBuilder`) and every free-form-mode card are unaffected — full-expand-by-default stays exactly as task 250 left it. A PM can still expand/collapse any phase manually afterward.
- [ ] **Generic-engine not-started screen:** a Discrete Development / StackShift Access / StackShift Access Plus / StackShift II-without-engine project created with Start option Scheduled shows a "Scheduled to auto-start on {date}" screen (mirroring StackShift I's, `_onboarding-detail.tsx` ~1674–1692) with a "Start Now"/"Start Anyway" action for `canManagePhases` roles, or a read-only "Not started yet…" message otherwise; created with Start option Draft shows the equivalent Draft not-started screen with a plain "Start Onboarding" action. This screen renders **before** any milestone-board content, regardless of whether `milestones`/`tasklists`/`tasks` rows already exist for the project (they typically do, seeded at creation — see Overview).
- [ ] Once started (`programme_started_at` set, manually or via schedule), the generic-engine detail page shows its existing live milestone/tasklist/task board and existing "no phases set up yet" empty state (for the rare project with a genuinely empty `phase_plan`) exactly as it does today — those two states are unchanged, just now gated behind "has this project actually started" instead of "does a milestone row exist."
- [ ] `programme_started_at` gets set for a generic-engine project (a) immediately, via the "Start Now"/"Start Onboarding" action hitting the same `/api/projects/[projectId]/programme/start` endpoint StackShift I already uses, and (b) automatically, via both the 15-minute cron and the QStash one-shot callback, once `scheduled_onboarding_start_at` passes — in both cases **without** calling `seedAndStartProgramme` (no `customer_phases`/`customer_deliverables` rows written for a generic-engine project).
- [ ] The pre-existing bug (cron/QStash wrongly seeding `customer_phases` rows onto a scheduled generic-engine project) is fixed as part of this change.
- [ ] The onboarding list's status pills/sort for generic-engine projects (already-correct logic, previously starved of real data) start reflecting `in_progress` once a generic project is actually started — verify this as a side effect, no code change expected in `_onboarding-list.tsx` or the GET route.

## Out of Scope / Must-Not-Change

- No "start at phase N" / jump-to-phase-before-start equivalent for generic-engine projects — `scheduled_start_phase` is, and stays, always `null` for these classifications (the wizard already never lets a non-customer_phases-engine card set `startPhase`, `_phases-step.tsx` line 258's existing condition). The not-started screen's Scheduled variant for generic projects does not need an "or select an alternate phase" affordance — there is no phase-number concept to alternate into.
- No change to how/when `milestones`/`tasklists`/`tasks` get seeded for generic-engine projects (still eager, at creation, regardless of mode) — this task only changes when the *board* becomes visible, not when the underlying rows are written.
- No schema/migration changes — `programme_started_at`, `scheduled_onboarding_start_at`, `scheduled_start_phase`, `qstash_message_id`, and `uses_customer_phases_engine` are all pre-existing generic `projects` columns; this task only widens which code paths read/write them.
- Do not touch `seedAndStartProgramme` itself, `seedCustomPhases`, or any StackShift I/customer_phases-engine behavior — every change to shared routes (`/programme/start`, scheduled-autostart, qstash-start) is an added branch, not a modification of the existing customer_phases-engine path.
- Do not widen the StackShift I collapse-by-default treatment to StackShift II's default-phases mode — the task explicitly scopes this to StackShift I; revisit as a separate follow-up if desired.
- `phasePlanValidationErrors`/`programmeDurationError`/empty-name validation (task 249/250) are untouched — the new `scheduledStartError` is an independent, additive check.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/portfolio-tracker/new/_new-project-types.ts` | Modify | Add `scheduledStartError(startMode, scheduledStartAt, scheduleMin): string \| undefined`. |
| `src/app/v2/(hub)/portfolio-tracker/new/_phases-step.tsx` | Modify | Render `scheduledStartError`'s message under the `DateTimePicker`; pass `collapseAllButFirst={isStackShiftI}` into `PhaseBuilder`. |
| `src/app/v2/(hub)/portfolio-tracker/new/_phase-builder.tsx` | Modify | `PhaseBuilder` accepts optional `collapseAllButFirst?: boolean`; lazy-inits `collapsedPhases` to every phase id except the first when true. |
| `src/app/v2/(hub)/portfolio-tracker/new/_content.tsx` | Modify | Step-3 `goNext()` gate additionally blocks on any selected card's `scheduledStartError`, with `scrollToField(['schedule-${type}', 'phases-step-${type}'])`. |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_load-detail-data.ts` | Modify | Select `programme_started_at` in the `projects` query (currently omitted) and include it on the returned `project` object, for every engine. |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` | Modify | Widen `OnboardingDetailProps.project` type with `programme_started_at: string \| null`. |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_generic-phase-view.tsx` | Modify | Widen `GenericPhaseViewProps.project` type with `programme_started_at`/`scheduled_onboarding_start_at`; add local `programmeStartedAt`/`starting`/`startError` state; add the not-started (Scheduled/Draft) screen, checked before the existing "no milestones" empty state; wire "Start Now"/"Start Anyway"/"Start Onboarding" to `POST /api/projects/${project.id}/programme/start`. |
| `src/app/api/projects/[projectId]/programme/start/route.ts` | Modify | Select `uses_customer_phases_engine`; branch — customer_phases-engine path unchanged; generic path sets `programme_started_at = now()`, cancels `qstash_message_id` if present, returns without calling `seedAndStartProgramme`. |
| `src/app/api/onboarding/scheduled-autostart/route.ts` | Modify | Select `uses_customer_phases_engine` in the due-projects query; branch per project in the loop — generic path updates `programme_started_at` only, no `seedAndStartProgramme` call. |
| `src/app/api/onboarding/projects/[projectId]/qstash-start/route.ts` | Modify | Select `uses_customer_phases_engine`; same branch as the cron route. |

## Code Context

### `_new-project-types.ts` — new validation helper

```ts
// Mirrors programmeDurationError's shape/placement. scheduleMin is the wizard-level "now" captured
// once at mount (_content.tsx's scheduleMin) — reused here instead of re-reading Date.now() so the
// bound is stable for the lifetime of one wizard session, consistent with min/max already passed to
// every card's own DateTimePicker.
export function scheduledStartError(
  startMode: TypeCardState["startMode"],
  scheduledStartAt: string,
  scheduleMin: Date
): string | undefined {
  if (startMode !== "scheduled") return undefined;
  if (!scheduledStartAt) return "Pick a date and time for the scheduled start.";
  const picked = new Date(scheduledStartAt);
  if (Number.isNaN(picked.getTime()) || picked < scheduleMin) {
    return "Scheduled start must be in the future.";
  }
  return undefined;
}
```

### `_phases-step.tsx` — inline error + collapse wiring

```tsx
{card.startMode === "scheduled" && (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={`schedule-${type}`} className="text-[13px] font-medium text-[#0B1533]">Scheduled start</label>
    <DateTimePicker id={`schedule-${type}`} value={card.scheduledStartAt} onChange={...} min={scheduleMin} max={scheduleMax} />
    {scheduleError && <span className="text-[10.5px] text-[#C0392B]">{scheduleError}</span>}
  </div>
)}
...
<PhaseBuilder
  mode={builderMode}
  phasePlan={card.phasePlan}
  durationDays={card.durationDays}
  collapseAllButFirst={isStackShiftI}
  onChange={...}
  onLastPhaseExtended={...}
/>
```

(`DateTimePicker` currently has no `id` prop wired to its trigger button — add one alongside the error, matching how `error`/`aria-invalid` are threaded elsewhere in this file, or wrap in a container carrying the id if simpler.)

### `_phase-builder.tsx` — collapse-by-default

```tsx
export default function PhaseBuilder({
  mode, phasePlan, durationDays, onChange, onLastPhaseExtended,
  collapseAllButFirst,
}: {
  ...
  // StackShift I only (wired from _phases-step.tsx) — Phases 2-5 start collapsed, Phase 1 stays
  // expanded. Ignored for every other card; lazy-init only, never re-evaluated after mount (a
  // StackShift I card's phasePlan is a fixed 5-phase array from initTypeCardState, so there's no
  // "phasePlan changed under us" case to react to the way StackShift II's checkbox-reset needs).
  collapseAllButFirst?: boolean;
}) {
  ...
  const [collapsedPhases, setCollapsedPhases] = useState<Set<string>>(
    () => new Set(collapseAllButFirst ? phasePlan.phases.slice(1).map((p) => p.id) : [])
  );
```

### `programme/start/route.ts` — engine branch

```ts
const { data: project } = await supabase.from("projects").select(
  "id, customer_id, programme_started_at, qstash_message_id, programme_duration_days, uses_customer_phases_engine, draft_skip_phase_numbers, draft_custom_phases, draft_default_phase_overrides, customers(company_name)"
).eq("id", projectId).single();
if (project.programme_started_at) return 409;

if (!project.uses_customer_phases_engine) {
  await supabase.from("projects").update({ programme_started_at: new Date().toISOString() }).eq("id", projectId);
  if (project.qstash_message_id) {
    await cancelProjectAutostart(project.qstash_message_id);
    await supabase.from("projects").update({ qstash_message_id: null }).eq("id", projectId);
  }
  return NextResponse.json({ started: true }, { status: 201 });
}
// ...existing seedAndStartProgramme path, unchanged
```

Same `uses_customer_phases_engine` branch shape applies inside the `scheduled-autostart` cron's per-project loop and inside `qstash-start`'s handler (both currently fetch the project row directly — add the column to each `select`).

## Implementation Steps

1. `_new-project-types.ts`: add `scheduledStartError`.
2. `_phases-step.tsx`: render the inline error under `DateTimePicker`; give the trigger an `id={`schedule-${type}`}` target for scroll-to-field; pass `collapseAllButFirst={isStackShiftI}` to `PhaseBuilder`.
3. `_content.tsx`: extend the Step-3 `goNext()` loop to also check `scheduledStartError(card.startMode, card.scheduledStartAt, scheduleMin)` per selected type, blocking with a message + `scrollToField`.
4. `_phase-builder.tsx`: add `collapseAllButFirst` prop, lazy-init `collapsedPhases` accordingly.
5. `_load-detail-data.ts`: add `programme_started_at` to the `projects` select and the returned `project` object (unconditional — cheap column, no per-engine branching needed at read time).
6. `_onboarding-detail.tsx`: widen `OnboardingDetailProps.project` type only (no behavior change — StackShift I's own `programmeStartedAt` state is still fetched separately via `fetchProgramme()`, unaffected).
7. `_generic-phase-view.tsx`: widen prop types; add `programmeStartedAt`/`starting`/`startError` state (seeded from the new props); add the not-started screen (checked before the `milestones.length === 0` branch) with Scheduled/Draft copy and a Start action calling `POST /api/projects/${project.id}/programme/start`, then setting local `programmeStartedAt` on success.
8. `programme/start/route.ts`: select `uses_customer_phases_engine`; add the generic branch.
9. `scheduled-autostart/route.ts` and `qstash-start/route.ts`: select `uses_customer_phases_engine`; branch per project — generic path updates `programme_started_at` directly (and `qstash_message_id` for the manual/cron paths where applicable) instead of calling `seedAndStartProgramme`.
10. `npx tsc --noEmit` and `npx eslint` after each file group; re-verify clean at the end.

## Acceptance Criteria

- [ ] Selecting Start = Scheduled with no date picked, then clicking Continue on Step 3, shows a red inline message under that card's Scheduled start field and does not advance to Step 4.
- [ ] Picking today's date with a time already in the past shows the same inline error and blocks Continue; picking a valid future date/time clears it.
- [ ] A StackShift I card's Step 3 phase builder renders with Phase 1 expanded and Phases 2–5 collapsed on first render; a StackShift II card with "Generate default phases" checked still renders all 5 phases expanded (unchanged from task 250).
- [ ] Creating a Discrete Development project with Start = Scheduled and visiting its detail page shows a "Scheduled to auto-start on {date}" screen, not the live milestone board, even though `milestones` rows already exist for it.
- [ ] Creating a Discrete Development project with Start = Draft shows the Draft not-started screen with a "Start Onboarding" action (for a `canManagePhases` role) or read-only copy otherwise.
- [ ] Clicking "Start Now"/"Start Onboarding" on a generic-engine project's not-started screen sets `programme_started_at`, and the page then shows the live milestone board (or the existing "no phases set up" empty state if `milestones` is genuinely empty) — no `customer_phases`/`customer_deliverables` rows get written for it.
- [ ] A generic-engine project scheduled in the past (simulated by backdating `scheduled_onboarding_start_at` or waiting for the cron) gets `programme_started_at` set by the 15-minute cron without any `customer_phases` rows appearing for it.
- [ ] The onboarding list (`/v2/portfolio-tracker`) shows a generic-engine project as "In Progress" (not stuck on "Scheduled"/"Draft") once its `programme_started_at` is set, with no code change to `_onboarding-list.tsx` or the GET route.
- [ ] StackShift I / StackShift II-with-engine behavior (not-started screen, Start/Start Anyway, cron, QStash callback) is byte-identical to before this task.
- [ ] `npx tsc --noEmit` passes clean.
- [ ] `npx eslint` passes clean on every touched file.

## Verification

```bash
npx tsc --noEmit
npx eslint \
  "src/app/v2/(hub)/portfolio-tracker/new/_new-project-types.ts" \
  "src/app/v2/(hub)/portfolio-tracker/new/_phases-step.tsx" \
  "src/app/v2/(hub)/portfolio-tracker/new/_phase-builder.tsx" \
  "src/app/v2/(hub)/portfolio-tracker/new/_content.tsx" \
  "src/app/v2/(hub)/portfolio-tracker/[projectId]/_load-detail-data.ts" \
  "src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx" \
  "src/app/v2/(hub)/portfolio-tracker/[projectId]/_generic-phase-view.tsx" \
  "src/app/api/projects/[projectId]/programme/start/route.ts" \
  "src/app/api/onboarding/scheduled-autostart/route.ts" \
  "src/app/api/onboarding/projects/[projectId]/qstash-start/route.ts"
```

Manual/browser acceptance (all 8 acceptance-criteria scenarios above, plus a StackShift I regression pass through its existing not-started/Scheduled/Draft screen and manual Start button) required before shipping — no live dev server/browser session available during planning.

## Compatibility Touchpoints

- No `_docs/mcp-tools.md` changes (no MCP tool touched).
- No schema/migration changes.
- `cancelProjectAutostart`/`scheduleProjectAutostart` (`src/lib/qstash/index.ts`) are reused as-is, not modified.
- Builds on task 244's per-card `startMode`/`scheduledStartAt`, task 247's `GenericPhaseView` split, task 248's not-started screen pattern, and task 250's per-phase collapse state — no shape changes to any of their existing types.

## Implementation Notes

- **Why branch three routes instead of adding a new "generic start" endpoint.** `programme/start`, `scheduled-autostart`, and `qstash-start` already carry the exact role/idempotency/qstash-cancellation logic a generic-engine start needs — duplicating that into new routes would just be a second copy to keep in sync. Branching on `uses_customer_phases_engine` (a column all three already have access to, or can cheaply add to their existing `select`) keeps one source of truth per concern.
- **Why the collapse-by-default is StackShift-I-only, not "any fixed-phases card."** The request explicitly named StackShift I. StackShift II's "Generate default phases" mode uses the same `PhaseBuilder` fixed-phases mode but is a secondary, opt-in path for that classification — leaving it fully-expanded avoids silently changing behavior nobody asked to change. Revisit as a one-line follow-up (`isStackShiftI || (isStackShiftII && card.useDefaultPhases)`) if the same collapse treatment turns out to be wanted there too.
- **Why the not-started screen is checked before the empty-milestones screen in `GenericPhaseView`.** A Draft project can legitimately have zero milestones (PM skipped phase planning at intake) — in that case the not-started screen (with its Start action) is the more useful state to show than "no phases set up, go to Milestones tab," mirroring how StackShift I's not-started screen never conditions on deliverable count either. Once started, a genuinely empty `milestones` still falls through to the existing empty state unchanged.

## Implementation Notes

### What Changed
- Added `scheduledStartError()` to `_new-project-types.ts`; wired into `_phases-step.tsx` (inline error under the Scheduled start field) and `_content.tsx` (blocks Step 3 → 4 with scroll-to-field), replacing "no validation until Review's submit-time banner" with the same inline pattern used by every other Step 3 field.
- `PhaseBuilder` gained an optional `collapseAllButFirst` prop, lazy-initializing `collapsedPhases` to every phase except the first when true; `_phases-step.tsx` passes `collapseAllButFirst={isStackShiftI}` — scoped to StackShift I only, per the task's literal wording.
- `DateTimePicker` gained an optional `id` prop on its trigger button, so the Scheduled start field has a real scroll/focus target (it had none before).
- `_load-detail-data.ts` now selects and returns `programme_started_at` for every engine (previously omitted entirely — StackShift I's own copy comes from a separate client-side fetch).
- `_generic-phase-view.tsx` gained a not-started (Scheduled/Draft) screen, mirroring StackShift I's `_onboarding-detail.tsx` one, checked before the existing "no milestones" empty state — plus local `programmeStartedAt`/`starting`/`startError` state and a `handleStart()` hitting the (now branch-aware) `/api/projects/[projectId]/programme/start` endpoint.
- `programme/start/route.ts`, `scheduled-autostart/route.ts` (15-min cron), and `qstash-start/route.ts` (one-shot callback) all now select `uses_customer_phases_engine` and branch: a generic-engine project only gets its `programme_started_at` column set (and, where applicable, its pending `qstash_message_id` cancelled/cleared) — `seedAndStartProgramme` is never called for it. This also fixes the pre-existing bug described in the task doc's Overview, where a scheduled generic-engine project would get wrongly seeded with `customer_phases`/`customer_deliverables` rows once its cron/QStash trigger fired.

### Files Changed
- `src/app/v2/(hub)/portfolio-tracker/new/_new-project-types.ts` — added `scheduledStartError()`.
- `src/app/v2/(hub)/portfolio-tracker/new/_phases-step.tsx` — inline schedule error; `collapseAllButFirst` wiring.
- `src/app/v2/(hub)/portfolio-tracker/new/_phase-builder.tsx` — `collapseAllButFirst` prop + lazy-init.
- `src/app/v2/(hub)/portfolio-tracker/new/_content.tsx` — Step 3 gate extended to block on a scheduling error.
- `src/app/v2/(hub)/portfolio-tracker/new/_date-time-picker.tsx` — added `id` prop on the trigger button.
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_load-detail-data.ts` — select + return `programme_started_at`.
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` — widened `OnboardingDetailProps.project` type only.
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_generic-phase-view.tsx` — not-started screen + start handler + widened prop type.
- `src/app/api/projects/[projectId]/programme/start/route.ts` — generic-engine branch.
- `src/app/api/onboarding/scheduled-autostart/route.ts` — generic-engine branch in the per-project loop.
- `src/app/api/onboarding/projects/[projectId]/qstash-start/route.ts` — generic-engine branch.

### Deviations From Plan
- None — implementation followed the task document's Proposed File Changes and Code Context exactly. The only correction made mid-implementation was adding `collapseAllButFirst` to `PhaseBuilder`'s destructured parameter list (the initial edit added it to the type annotation only, caught immediately by `tsc`).

### Verification Run
- `npx tsc --noEmit` — PASS
- `npx eslint <all touched files>` — PASS (no warnings or errors)
- Manual/browser acceptance (all 8 scenario-level acceptance criteria, plus StackShift I regression pass) — SKIPPED (no live dev server/browser session available in this session, same documented gap as sibling tasks 239/240/244/245/246/250) — recommended before shipping.
