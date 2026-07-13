# 136: Phase 1 Completion — Animated Closing/Transition Screen (2.4 Completion Criteria)

**Created:** 2026-07-13
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** balanced

---

## Overview

The QBR spec's section **2.4 "Phase 1 Checklist (Item Completion Criteria)"** lists 5
items distinct from the 8-item file checklist in 2.3:

```
☐ Kickoff meeting held        — Meeting notes filed
☐ Storage folder created      — All team members have access
☐ PF knowledge base live      — All KB categories populated
☐ All 8 deliverables filed    — Correct sub-folders, accessible
☐ HTML mockup complete        — Internal review approved
☐ Client call completed       — Written sign-off received
```

(6 lines in the source table, headed "2.4 Phase 1 Checklist"; the doc's own intro text
says 5 "checklist items" — treat the table as authoritative.)

This list was never modeled anywhere in the codebase — it isn't `INTERNAL_DELIVERABLES`
(2.3's separate file checklist) and isn't tracked in the DB. Per the user's direction,
**this is intentional, not a gap to backfill as a new tracked checklist.** Instead, it
becomes the content of a new animated closing/transition screen shown when Bert clicks
"Complete Phase 1 & notify PM" — replacing the current static "Phase 1 complete!" card
(`_onboarding-wizard.tsx`, the `if (done) return (...)` block) with a sequential,
Windows-Setup-style transition: each criterion appears one at a time (or with a short
stagger), visually "checking off" while the real `POST .../complete-phase` request runs
in the background, before landing on the existing summary card.

The `complete-phase` route already does real, multi-step backend work (updates
`customer_phases`, flips `projects.onboarding_visible_at`, writes Kickoff contacts to the
`contacts` table, sends a Cliq notification, and more) — this justifies a genuine
"preparing your project…" loading sequence rather than a decorative-only animation; the
criteria list is not receiving live status data (see Out of Scope), it's presented as this
context — a "getting everything ready" narrative.

## Requirements

- [ ] Clicking "Complete Phase 1 & notify PM" (`handleComplete`) transitions into a new
      full-card animated sequence instead of immediately showing the static
      "Phase 1 complete!" result.
- [ ] The sequence displays the 6 completion-criteria lines from 2.4 (label + its
      completion-criteria sub-text, e.g. "Kickoff meeting held" / "Meeting notes filed"),
      each animating in with a brief stagger (e.g. fade/slide-in, ~150–250ms apart) and a
      checkmark that appears shortly after each line renders — a determinate-feeling
      sequence, not an indefinite spinner.
- [ ] The animation runs concurrently with the real `POST .../complete-phase` request
      (already fired by `handleComplete`), not before or after it — the transition must
      not add artificial delay beyond what's needed for the last item to finish animating
      in, and must not resolve before the real request completes (whichever is longer
      gates the transition to the final summary card).
- [ ] If the real request fails, the existing `completeError` handling is preserved —
      the animated sequence exits back to the wizard's normal (non-`done`) view with the
      error message shown, exactly as today (no change to failure behavior, only to the
      success path's presentation).
- [ ] Once both the animation and the real request finish, the flow lands on the
      **existing** "Phase 1 complete!" summary card unchanged (deliverables/internal
      deliverables/files-uploaded counts, "Back to Onboarding Timeline" button) — this
      task only inserts a transition *before* that card, it does not redesign it.
- [ ] Respects `isDark` theming per this codebase's established `isDark`-prop pattern
      (no `dark:` classes).

## Out of Scope / Must-Not-Change

- **No live status derivation for the 6 criteria.** None of them map to a real, queryable
  signal today in a form worth wiring up for a one-time transition screen (e.g. "All team
  members have access" to the storage folder has no membership model to check; "Internal
  review approved" for the HTML mockup has no review-approval flag). All 6 lines animate
  in and check off on a fixed timer, presented as "here's what Phase 1 covered," not as
  a live-validated readiness gate. Do not invent new DB columns/flags to make these
  "real" — that's explicitly not what was asked for.
- No new database table, column, or migration.
- No changes to `complete-phase`'s actual behavior (still fires exactly once, same
  payload, same side effects).
- No changes to the 2.3 file checklist (`INTERNAL_DELIVERABLES`) or any other step's
  behavior.
- No changes to the existing "Phase 1 complete!" summary card's content — only what
  precedes it.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | Add a `completing`-driven transition state, a `PHASE1_COMPLETION_CRITERIA` config array, and a new `PhaseCompletionTransition` component rendered between clicking Complete and the existing summary card. |

## Code Context

### Current completion flow (`_onboarding-wizard.tsx`)

```tsx
const [done, setDone] = useState(false);
const [completing, setCompleting] = useState(false);
const [completeError, setCompleteError] = useState<string | null>(null);
// ...
const handleComplete = async () => {
  setCompleting(true);
  setCompleteError(null);
  try {
    const res = await fetch(`/api/projects/${project.id}/programme/complete-phase`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phase_number: 1 }),
    });
    if (!res.ok) throw new Error();
    setDone(true);
  } catch {
    setCompleteError("Failed to complete Phase 1 — please try again.");
  } finally {
    setCompleting(false);
  }
};
// ...
if (done) {
  return ( /* existing static summary card */ );
}
```

Today, `completing` only disables the button and swaps its label to "Completing…"
(`_onboarding-wizard.tsx`'s Complete button). This task introduces a **new** rendered
state between "button clicked" and `done === true` — a full-card transition — rather
than the button's own inline text.

### Design: a `showTransition` state gates the new screen

```tsx
const [showTransition, setShowTransition] = useState(false);

const handleComplete = async () => {
  setCompleting(true);
  setCompleteError(null);
  setShowTransition(true); // new
  try {
    const res = await fetch(`/api/projects/${project.id}/programme/complete-phase`, { /* unchanged */ });
    if (!res.ok) throw new Error();
    setDone(true);
  } catch {
    setCompleteError("Failed to complete Phase 1 — please try again.");
    setShowTransition(false); // new — bail back to the normal wizard view with the error
  } finally {
    setCompleting(false);
  }
};

if (showTransition && !done) {
  return <PhaseCompletionTransition isDark={isDark} onDone={() => { /* no-op; done flips to true when the fetch resolves, which then takes over on next render */ }} />;
}
if (done) {
  return ( /* existing static summary card, unchanged */ );
}
```

`PhaseCompletionTransition` internally staggers through `PHASE1_COMPLETION_CRITERIA`
on its own timers (setTimeout chain or a simple index-incrementing interval) — it does
not need to know about the real fetch's state; the parent naturally swaps this component
out for the real summary card once `done` flips true, and the animation is expected to
finish (all 6 items checked) well within the real request's typical latency. If the
animation finishes before the fetch resolves, hold on the fully-checked state (a brief
"Finishing up…" line) rather than looping or disappearing.

### `PHASE1_COMPLETION_CRITERIA` — new config, sourced from QBR 2.4

```tsx
const PHASE1_COMPLETION_CRITERIA = [
  { label: "Kickoff meeting held", detail: "Meeting notes filed" },
  { label: "Storage folder created", detail: "All team members have access" },
  { label: "PF knowledge base live", detail: "All KB categories populated" },
  { label: "All 8 deliverables filed", detail: "Correct sub-folders, accessible" },
  { label: "HTML mockup complete", detail: "Internal review approved" },
  { label: "Client call completed", detail: "Written sign-off received" },
] as const;
```

### Reference for the requested visual feel

"Windows OS setup transitioning to next phase" — sequential checklist items appearing
one after another with a brief settle/checkmark, not a single spinner. A reasonable
concrete implementation: an `activeIndex` state incremented every ~350ms via
`setInterval`/chained `setTimeout`s; each item at `index <= activeIndex` renders with a
fade/slide-in transition (Tailwind `transition-all` + a mounted/unmounted class toggle,
or `framer-motion` — already an installed dependency per this project's stack — is a
reasonable fit for a polished stagger without hand-rolling CSS timing).

## Implementation Steps

1. Add `PHASE1_COMPLETION_CRITERIA` config (module-level, near `PREVIEW_SIZES`/other config arrays).
2. Add `showTransition` state; wire it into `handleComplete` (set true at the start, false on error) per the Code Context.
3. Build `PhaseCompletionTransition` (new file-scoped component): staggers through the criteria list on a timer, rendering each with a fade-in + checkmark; holds on a "Finishing up…" state once all items are shown, until `done` flips true and the parent stops rendering it.
4. Insert `{showTransition && !done && <PhaseCompletionTransition ... />}` before the existing `if (done)` block.
5. `npx tsc --noEmit` and `pnpm lint`.
6. Manually verify per Acceptance Criteria.

## Acceptance Criteria

- [ ] Clicking "Complete Phase 1 & notify PM" shows the new animated sequence, not an immediate jump to the summary card.
- [ ] All 6 criteria from 2.4 appear, each with its label and completion-criteria detail text, staggered in with a visible transition and a checkmark.
- [ ] The sequence transitions to the existing summary card once the real request succeeds — total wait feels intentional, not artificially padded beyond a full pass through the 6 items.
- [ ] If the request fails, the user lands back on the normal wizard view with the existing error message — no dead-end on the animated screen.
- [ ] The existing summary card's content is unchanged.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manual, localhost:3000, a Phase 1 project on its last step with all checklist items done:
#   - Click "Complete Phase 1 & notify PM"
#   - Confirm the animated criteria sequence plays, then transitions to the summary card
#   - Repeat with the network throttled (slow 3G in DevTools) to confirm the transition holds gracefully if the animation finishes before the request does
#   - Simulate a failure (e.g. temporarily break the endpoint) to confirm the error path still works
```

## Compatibility Touchpoints

- None — no DB/API changes, purely a client-side presentational addition.

## Implementation Notes

### What Changed
- Added `showTransition` state to the onboarding wizard, set `true` at the start of `handleComplete` (alongside the existing `completing`/`completeError` resets) and reset `false` on failure (preserving the existing error path exactly — the user lands back on the normal wizard view with `completeError` shown, no dead-end).
- Added an early-return `if (showTransition && !done) return <PhaseCompletionTransition isDark={isDark} />;` immediately before the existing `if (done)` block — the real summary card render is completely untouched.
- Added `PHASE1_COMPLETION_CRITERIA` (the 6 lines from QBR 2.4, verbatim) and a `PhaseCompletionTransition` component using `framer-motion` (already an installed dependency, per this project's stack, previously unused anywhere in `src`) for a declarative staggered fade/slide-in per item (~220ms apart) with a checkmark popping in ~150ms after each line, followed by a "Finishing up…" line that fades in once the sequence completes and simply stays visible for as long as the parent keeps the component mounted — no internal timer races against the real fetch; the parent naturally swaps this component out for the real summary card the instant `done` flips `true`.

### Files Changed
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` — added the `framer-motion` import; `showTransition` state; the `handleComplete` wiring; `PHASE1_COMPLETION_CRITERIA`/`PHASE1_TRANSITION_STAGGER` module-level config; the early-return before the `done` block; and the new `PhaseCompletionTransition` component (appended at the end of the file, alongside the other file-scoped presentational components). Only file touched, per the task's scope.

### Deviations From Plan
- Dropped the task doc's suggested `onDone` prop on `PhaseCompletionTransition` — the doc itself noted it would be a no-op ("no-op; `done` flips to true when the fetch resolves"), so it was omitted entirely rather than plumbed through as dead code.
- Used `framer-motion`'s declarative `initial`/`animate`/`transition` stagger instead of the doc's suggested manual `activeIndex` + `setInterval`/`setTimeout` approach — functionally equivalent (same staggered reveal, same "hold at the end" behavior), but simpler and removes any timer-cleanup edge cases, since framer-motion owns the animation lifecycle per-element declaratively.

### Verification Run
- `npx tsc --noEmit` — PASS (no errors).
- `pnpm lint` — PASS (no warnings/errors).
- `pnpm build` — PASS; confirms `framer-motion` (previously unused anywhere in this codebase despite being an existing dependency) compiles and tree-shakes correctly in a production build.
- Manual browser verification — **SKIPPED**, same standing reason as tasks 131–135 in this batch: live verification requires a logged-in Hub session, and entering the user's password to authenticate is a prohibited action regardless of authorization. Verified instead by code review: `handleComplete`'s existing try/catch/finally structure and its exact success/failure branches are unchanged (only two new `setShowTransition` calls added at the two points the doc specified); the new component has no dependency on network timing to render correctly (pure declarative CSS-driven animation via framer-motion, verified to compile in a real production build); and the early-return ordering (`showTransition && !done` checked strictly before `done`) guarantees the transition is only ever shown while genuinely waiting for the real request, never after `done` is already true.
