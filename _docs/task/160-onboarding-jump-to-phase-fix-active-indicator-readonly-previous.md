# 160: Onboarding Timeline — Fix Jump-to-Phase "Day N" Indicator + Read-Only Previous Phases

**Created:** 2026-07-15
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Two related bugs in the "Jump to phase" feature (`_onboarding-detail.tsx`'s `JumpToPhaseMenu` +
`handleJump`, backed by `PATCH /api/projects/[projectId]/programme/phase`):

**Bug 1 — the orange "Day N" indicator doesn't move after a jump on an already-started
programme.** The vertical dashed orange line + "Day N" pill on the Gantt grid
(`_onboarding-detail.tsx:1566-1575`) and the header's "Day {currentDay}" text are both derived from
`getCurrentProgrammeDay(programmeStartedAt)` — i.e. real calendar days elapsed since
`projects.programme_started_at`. Traced the jump endpoint: its **not-started** branch backdates
`programme_started_at` so the target phase lines up (`phase/route.ts:52-58`), but its
**already-started** branch explicitly leaves `programme_started_at` untouched — "only re-status the
existing phase rows" (`phase/route.ts:95` comment). That means jumping an in-progress project to a
different phase changes which phase is flagged `active` in the DB, but the calendar-day-driven "Day
N" marker stays exactly where it was — it never reflects the jump. This is the literal bug behind
"the orange indicator for the active phases must reflect."

**Bug 2 — no edit/upload lock on a phase once it's no longer active.** `Swimlane`'s `interactive`
flag (`_onboarding-detail.tsx:565`) is `phase.number === 1 && role !== "developer"` — it does
**not** check `dbStatus`. So once Phase 1 has been jumped past (its DB status becomes `skipped`),
its deliverable cards are still fully clickable and open the Onboarding Wizard in its normal,
fully-editable state — nothing in `OnboardingWizard` (`_onboarding-wizard.tsx`) currently knows or
cares whether the phase it represents is the DB's current `active` phase. The Wizard already has
one read-only mechanism (`isStepReadOnly = isPM && step.key !== "storage-kb"`, gating a `disabled`
prop threaded through every field in every step) — this task extends that same mechanism to also
lock every step, **including storage-kb** (no carve-out — a jumped-past phase shouldn't accept new
uploads at all, regardless of role), whenever the phase isn't the DB's current active phase.
Phases 2-5 have no interactive/upload UI at all yet (their `Swimlane` cards are non-interactive
regardless of role — `interactive = phase.number === 1 && ...`), so this task's practical scope is
entirely Phase 1's Wizard; Phases 2-5 need no changes since they already can't be edited.

The user's "I can only open them and view the details and uploaded files" implies a jumped-past
Phase 1 should still be **openable** (not blocked outright) — just read-only. Confirmed this is
already true at the deliverable-card level (cards stay clickable regardless of `dbStatus`), but the
top-right "Onboarding Wizard" CTA button is gated by `activePhaseNumber === 1`
(`_onboarding-detail.tsx:1466`) — it disappears entirely once Phase 1 is jumped past, which is the
*only* obvious entry point once every deliverable card is done/collapsed. This task widens that
button's visibility condition too, so there's always a clear way to open Phase 1 in view mode after
a jump — see Requirements.

## Requirements

### Bug 1 — Day N indicator

- [ ] `PATCH .../programme/phase`'s already-started branch (`phase/route.ts:95-118`) now also
      backdates `projects.programme_started_at`, using the same `backdated.setDate(backdated
      .getDate() - (targetPhase.dayStart - 1))` calculation the not-started branch already uses —
      so `currentDay` recomputes on the client to land inside the newly-active phase's day range
      immediately after a jump, no matter whether the programme had already started.
- [ ] After this change, jumping Phase 3→5 on a project started 20 real days ago moves the orange
      "Day N" marker, the header's "Day {N}" text, and the top progress bar all to a day inside
      Phase 5's range (Day 91-120) — currently they'd stay frozen at whatever real-elapsed-day the
      project was actually on.
- [ ] `is_manual_override`/`override_note` bookkeeping on `customer_phases` (already present)
      stays unchanged — this only touches `projects.programme_started_at`.

### Bug 2 — read-only previous/inactive phases

- [ ] `OnboardingWizard` gains a new required prop, e.g. `isPhaseActive: boolean` — passed from
      `_onboarding-detail.tsx` as `phaseStatusMap.get(1) === "active"` (computed once, alongside
      the existing `phaseStatusMap`).
- [ ] `isStepReadOnly` becomes `(isPM && step.key !== "storage-kb") || !isPhaseActive` — i.e. the
      PM role keeps its existing step-6 (storage-kb) carve-out *only when the phase is still
      active*; once the phase is inactive (`skipped` or `completed` after a jump), **every** step
      including storage-kb is read-only for **every** role, no carve-out. Every one of the 15
      `disabled={isStepReadOnly}` call sites in `_onboarding-wizard.tsx` (kickoff `ContactsField`,
      outcome-target/migration-checklist/content-map/client-signoff rich-text + file fields,
      html-mockup, etc.) is covered automatically since they already key off this one flag — no
      per-field changes needed beyond the flag's own definition.
- [ ] Viewing already-uploaded files and reading existing content stays fully available in
      read-only mode — `isStepReadOnly` already governs input/upload `disabled` state, not
      visibility of already-saved content (confirm this holds for every field type while
      implementing; the PM read-only mode is the existing precedent to match).
- [ ] The internal-deliverables checklist toggle (`canEditChecklist`, currently `!isPM`) also
      requires the phase to be active: `canEditChecklist = !isPM && isPhaseActive`.
- [ ] The Kickoff/Client-Signoff completion-checklist "Mark all as done"/force-bypass flow
      (`isLastStep && !isPM`, `_onboarding-wizard.tsx:2290,2307,2320`) is similarly gated by
      `isPhaseActive` — no marking-complete actions on an inactive phase.
- [ ] The top-right "Onboarding Wizard" CTA button's visibility widens from `activePhaseNumber ===
      1 && canOpenWizard` to `phases.some(p => p.phase_number === 1) && canOpenWizard` (i.e. shows
      whenever Phase 1 has been seeded at all, active or not) — its label switches to something
      like "View Onboarding Wizard" (vs. "Onboarding Wizard") when `!isPhaseActive`, so there's
      always an obvious way back in after a jump, in view mode.
- [ ] `PhaseAccessPanel` (task 156's Phase 1 access-management UI, inside the Wizard's header) —
      confirm whether adding/removing Phase 1 members should also lock when the phase is inactive;
      default assumption: membership management stays available regardless (it's not "editing
      documents"), flagged here in case the user wants it locked too, but not blocked on this
      question since it's a minor, easily-adjusted follow-up either way.

## Out of Scope / Must-Not-Change

- Phases 2-5 need no code changes — they have no interactive/upload UI today (`Swimlane`'s
  `interactive` flag already excludes them), so there is nothing to lock.
- Do not change the PM role's existing storage-kb-always-editable carve-out **while the phase is
  still active** — task 146's rule stays exactly as-is in the active-phase case; this task only
  adds the phase-inactive override on top of it.
- Do not change how `is_manual_override`/`override_note` are computed or displayed
  ("Manually tagged" label, `_onboarding-detail.tsx:1421`) — unrelated to either bug.
- Do not change the not-started branch of the jump endpoint — it already backdates correctly; only
  the already-started branch is missing that step.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/projects/[projectId]/programme/phase/route.ts` | Modify | Backdate `programme_started_at` in the already-started branch too |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` | Modify | Pass `isPhaseActive` to `OnboardingWizard`; widen CTA button visibility/label |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | Extend `isStepReadOnly`/`canEditChecklist`/completion-flow gating to include `!isPhaseActive` |

## Code Context

### Already-started branch, missing the backdate (`phase/route.ts:95-118`) — current

```ts
// Already started — only re-status the existing phase rows.
const updates = PROGRAMME_PHASES.map(async (p) => {
  if (p.number === phaseNumber) {
    return supabase.from("customer_phases").update({ status: "active", actual_start_date: today, is_manual_override: true, override_note: note })...
  }
  ...
});
```

Add, before building `updates` (mirrors the not-started branch's own calculation at
`phase/route.ts:53-54`):

```ts
const backdated = new Date();
backdated.setDate(backdated.getDate() - (targetPhase.dayStart - 1));
const { error: dateUpdateError } = await adminClient.from("projects").update({ programme_started_at: backdated.toISOString() }).eq("id", projectId);
if (dateUpdateError) {
  console.error("PATCH .../programme/phase already-started date backdate error:", dateUpdateError);
  return NextResponse.json({ error: "Failed to update programme start date" }, { status: 500 });
}
```

### `isStepReadOnly`/`canEditChecklist` (`_onboarding-wizard.tsx:544-546`) — current

```ts
const isPM = role === "pm";
const isStepReadOnly = isPM && step.key !== "storage-kb";
const canEditChecklist = !isPM;
```

Becomes (new `isPhaseActive` prop threaded in from `OnboardingWizardProps`):

```ts
const isPM = role === "pm";
const isStepReadOnly = (isPM && step.key !== "storage-kb") || !isPhaseActive;
const canEditChecklist = !isPM && isPhaseActive;
```

### CTA button gating (`_onboarding-detail.tsx:1466-1474`) — current

```tsx
{!isComplete && activePhaseNumber === 1 && canOpenWizard && (
  <button ...>
    <PlayCircle size={14} /> Onboarding Wizard
  </button>
)}
```

Becomes:

```tsx
{!isComplete && phases.some((p) => p.phase_number === 1) && canOpenWizard && (
  <button ...>
    <PlayCircle size={14} /> {activePhaseNumber === 1 ? "Onboarding Wizard" : "View Onboarding Wizard"}
  </button>
)}
```

### `OnboardingWizard` invocation (`_onboarding-detail.tsx:1284-1312`) — add the new prop

```tsx
<OnboardingWizard
  project={project}
  ...
  isPhaseActive={phaseStatusMap.get(1) === "active"}
  ...
/>
```

## Implementation Steps

1. Fix Bug 1: add the backdate step to `phase/route.ts`'s already-started branch.
2. Add `isPhaseActive: boolean` to `OnboardingWizardProps` in `_onboarding-wizard.tsx`.
3. Update `isStepReadOnly`/`canEditChecklist` definitions per Code Context.
4. Grep `_onboarding-wizard.tsx` for the completion-flow's `!isPM` checks
   (`isLastStep && !isPM` at both call sites) and add `&& isPhaseActive`.
5. Pass `isPhaseActive={phaseStatusMap.get(1) === "active"}` from `_onboarding-detail.tsx`'s
   `<OnboardingWizard>` invocation.
6. Widen the CTA button's visibility condition and add the conditional label per Code Context.
7. Manually verify: jump an in-progress project from Phase 1 to Phase 3, confirm the Day N marker
   moves into Phase 3's range; then open Phase 1's Wizard (via a deliverable card or the now-always
   -visible "View Onboarding Wizard" button) and confirm every field/upload control is disabled
   while existing content/files are still visible.

## Acceptance Criteria

- [ ] Jumping an already-started project to a later phase moves the orange Day-N marker, the
      header's "Day N" text, and the progress bar into that phase's day range.
- [ ] Jumping to an earlier phase (e.g. back to Phase 2 from Phase 4) also correctly repositions
      the Day-N marker into Phase 2's range.
- [ ] After jumping past Phase 1, opening its Wizard shows all fields/uploads disabled, but
      previously-saved text and previously-uploaded files remain visible/openable.
- [ ] The "Onboarding Wizard" button (or its "View" variant) remains visible after Phase 1 is
      jumped past, instead of disappearing.
- [ ] A PM role opening a still-active Phase 1's storage-kb step still has full upload access
      (existing task 146 behavior, unregressed).
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser: on a test project already in Phase 1, use "Jump to phase" to move to Phase 3,
confirm the Gantt's Day-N line/header text update immediately; open the (now labeled "View") Wizard
and confirm no field accepts input and no upload button is clickable, while existing Kickoff
content/files still render; jump back to Phase 1 and confirm editing is restored.

## Compatibility Touchpoints

- No migration required — only behavior of the existing `PATCH .../programme/phase` route and the
  Wizard's existing read-only mechanism change.
