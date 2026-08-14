# 248: Portfolio Tracker "Not Started"/"Scheduled" Screen — Skip-Aware Dynamic Start CTA + Jump-to-Phase

**Created:** 2026-08-14
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

The `customer_phases`-engine "not started" screen (`_onboarding-detail.tsx`, the `!programmeStartedAt`
branch — StackShift I always, StackShift II when it opted into the engine at intake, task 247's
`uses_customer_phases_engine` flag) always shows a static **"Start Onboarding"** button and a
**"Jump to phase"** menu listing the fixed 5 `PROGRAMME_PHASES`, regardless of what the PM actually
configured at intake. Two intake-time features already exist and are already wired into the New
Project wizard's PhaseBuilder (`_phase-builder.tsx`) and `POST /api/onboarding/projects`:

- **Task 244** — a PM can uncheck ("skip") any of the 5 default phases per project
  (`skip_phase_numbers`).
- **Task 246** — a PM can insert custom phases beyond the fixed 5 (`custom_phases`).

But neither ever reaches this screen's render, for a confirmed, concrete reason: **both are only
ever passed to `seedAndStartProgramme` when `mode === "start"` — an immediate start submitted from
the wizard itself.** For `mode: "save"` (Draft) and `mode: "save_scheduled"` (Scheduled), the PM's
skip/custom selections are silently discarded — never written to `projects` or anywhere else. This
was already flagged as a documented "known gap" for `custom_phases` on the scheduled path
(`api/onboarding/projects/route.ts:470-477`, referencing task 246) and for `skip_phase_numbers` more
generally (referenced at `route.ts:281` as "task 244's own documented `skip_phase_numbers` gap") —
this task closes both, for every non-immediate start path, because closing the gap is the
prerequisite for anything on the "not started" screen to be skip/custom-phase aware.

Confirmed by reading all four `customer_phases` seed call sites: **none of the three deferred-start
paths pass skip/custom data today**, not even for a project that WAS created via `mode: "start"`
with a plan that was later abandoned and restarted — this is unrelated; the actual gap is real and
independently confirmed:
- `POST /api/projects/[projectId]/programme/start` (the "Start Onboarding" button's own endpoint —
  fires for a Draft project) calls `seedAndStartProgramme(..., project.programme_duration_days)`
  with **no 6th/7th args** — always empty skip/custom, unconditionally, for every Draft project.
- `POST /api/onboarding/projects/[projectId]/qstash-start` (one-shot QStash message a scheduled
  project's `save_scheduled` submission enqueues) — same, no skip/custom args.
- `POST /api/onboarding/scheduled-autostart` (5-minute cron poll fallback, migration 079) — same,
  no skip/custom args, though it does already read `scheduled_start_phase`.

So today, **any PM who skips a phase or adds a custom phase on a Draft or Scheduled project loses
that configuration entirely** the moment they click Save instead of Start Now — the project seeds
with all 5 vanilla defaults whenever it does eventually start, with zero indication to the PM this
happened. This is a real, independently-verifiable bug, not just a UI polish gap, and is what makes
the "not started" screen's Start button/Jump-to-phase impossible to make accurately dynamic without
first fixing it.

**Scope call — Discrete Development / other classifications:** the request asks for this dynamic
treatment to "apply to the Discrete Development type or the others." Per task 247 (already
implemented, confirmed by reading `_onboarding-detail.tsx:1510` and `_generic-phase-view.tsx`),
every classification except StackShift I (and opted-in StackShift II) already renders through
`GenericPhaseView` instead of this screen — no day-count copy, no fixed "Start Onboarding" label,
and a milestone-name-driven Jump-to-phase menu once milestones exist, with **no blocking "not
started" gate at all** (task 247's explicit design decision — milestones are just browsable). That
already satisfies "dynamic, not static 120-day language" for those types. **This task is therefore
scoped to the `customer_phases` engine's own screen only** (StackShift I / opted-in StackShift II) —
the screen shown in both reference screenshots. Flagged for review in case the intent was instead to
pull Discrete Development into the same gated Start/Jump-to-phase pattern, which would reverse task
247's explicit "no blocking gate" decision for the generic model — not done here without
confirmation.

## Requirements

### A — Persist intake-time skip/custom-phase selection for every start mode

- [ ] New migration `105_projects_draft_phase_plan.sql`: `projects.draft_skip_phase_numbers
      int[] not null default '{}'`, `projects.draft_custom_phases jsonb not null default '[]'` —
      nullable-safe defaults so every existing row (and every non-`customer_phases`-engine project,
      which never sets these) reads as "no skips, no customs," byte-identical to today's behavior.
- [ ] `src/types/database.ts` — add both columns to `projects`' Row/Insert/Update
      (`draft_custom_phases` typed as `Json`, matching this codebase's existing JSONB column
      convention — see `onboarding_data` on `customer_products` for precedent).
- [ ] `POST /api/onboarding/projects` — write `body.skip_phase_numbers ?? []` and
      `body.custom_phases ?? []` onto the `projects` insert (alongside the existing
      `programme_duration_days`/`scheduled_start_phase` fields) **for every mode**, not just
      `mode: "start"` — this is the actual fix; the existing `mode === "start"` branch is
      unaffected (it still seeds `customer_phases` immediately from the same request body, exactly
      as today).
- [ ] `POST /api/projects/[projectId]/programme/start` — select `draft_skip_phase_numbers,
      draft_custom_phases` alongside the columns it already selects, and pass them as
      `seedAndStartProgramme`'s 6th/7th args (currently omitted).
- [ ] `POST /api/onboarding/projects/[projectId]/qstash-start` — same: select and pass both.
- [ ] `POST /api/onboarding/scheduled-autostart` — same: select and pass both.
- [ ] Only ever read/write these two columns when `uses_customer_phases_engine` is true for that
      project — mirrors task 244/246's own existing per-classification validation pattern
      (`route.ts`'s `usesCustomerPhasesEngine` guards on `skip_phase_numbers`/`custom_phases`).

### B — Dynamic Start button + description on the "not started" (unscheduled) screen

- [ ] In `_onboarding-detail.tsx`'s `!programmeStartedAt` / `!hasSchedule` branch: compute this
      project's actual ordered phase set from `project.draft_skip_phase_numbers` +
      `project.draft_custom_phases` merged with `PROGRAMME_PHASES` (reuse
      `buildSeedPhaseEntries`-equivalent logic — see Code Context; do not duplicate the merge/sort
      algorithm, extract it to a shared, importable function instead, see Requirement E).
- [ ] The primary CTA button's label becomes **"Start {firstNonSkippedPhase.name}"** (e.g. "Start
      Migrate & Rebrand" when Onboard/Phase 1 was skipped at intake) instead of the hardcoded
      "Start Onboarding" — `handleStart`'s underlying call already goes through `startAtPhase`,
      which already branches Phase-1-vs-other via `handleStart`/`handleJump`
      (`_onboarding-detail.tsx:1440`) — wire the button's `onClick` to
      `startAtPhase(firstNonSkippedPhase.number)` instead of the current hardcoded `handleStart`.
- [ ] The description line (`_onboarding-detail.tsx:1645`, already dynamic on
      `programmeDurationDays` — confirmed via direct read, this half of the request is already
      shipped) stays as-is; no changes needed there. Verify during implementation that it wasn't
      regressed by an unrelated in-flight change (the file shows as locally modified in git status
      pre-task).
- [ ] `JumpToPhaseMenu` (the "Manually tag starting phase" dropdown at line ~719) — its `phases`
      prop currently defaults to the static `PROGRAMME_PHASES` for this call site
      (`_onboarding-detail.tsx:1713`). Pass this project's actual merged+sorted phase list instead
      (defaults minus skips, plus customs, in sort order) — **including the skipped defaults**, not
      filtered out.
- [ ] Inside `JumpToPhaseMenu`, a phase whose number is in `draft_skip_phase_numbers` renders
      **disabled**: `disabled` on its `<button>`, `cursor-not-allowed` (not the existing
      `cursor-pointer`), muted text color (reuse this file's own `text-[#5F6A88]`/opacity-50
      convention already used for `disabled:opacity-50` elsewhere in this component), and a small
      "Skipped" pill matching the Swimlane's own existing skipped-phase badge
      (`_onboarding-detail.tsx:670-673`, `bg-slate-100 text-slate-400`) for visual consistency
      rather than inventing a second skipped-state treatment in the same file.
- [ ] A disabled/skipped entry's `onClick` must not fire `onJump` — either omit the handler
      entirely when `disabled` or guard inside `onJump` (component already receives `disabled` via
      the native `disabled` attribute, which alone is sufficient — no extra guard needed if wired
      correctly).

### C — Dynamic Scheduled-start card (Image #8's flow)

- [ ] `scheduledPhase`/`scheduledPhaseNumber` (`_onboarding-detail.tsx:1611-1612`) already resolves
      from `project.scheduled_start_phase` via `getPhaseByNumber` — unaffected by this task (a
      scheduled phase can only be one of the fixed 5 today, per `route.ts:345`'s own
      `start_phase` validation `1-5`; widening scheduled-start to target a custom phase number is
      out of scope, not requested).
- [ ] The "Select Phase" dropdown (`_onboarding-detail.tsx:1684`, currently
      `PROGRAMME_PHASES.filter((p) => p.number !== scheduledPhaseNumber)`) switches to the same
      merged+sorted defaults-minus-skips-plus-customs list from Requirement B, still excluding
      `scheduledPhaseNumber` (already scheduled, showing it again as a choice would be redundant,
      not a skip-adjacent concept) — and disables any phase in `draft_skip_phase_numbers`, same
      treatment as Requirement B's `JumpToPhaseMenu` (this is a plain `<select>`, not the same
      component — a disabled `<option>` natively renders non-interactive with the OS's own
      not-allowed affordance; no custom cursor styling is achievable inside a native `<select>`,
      this is an accepted native-control constraint, not a gap).
- [ ] `"Start Phase {scheduledPhaseNumber}: {scheduledPhase.name} Anyway"` — unaffected; already
      dynamic on the actual scheduled phase, not hardcoded "Onboarding."

### D — Style/consistency

- [ ] Reuse this repo's UI Polish Conventions (icon-only buttons keep `aria-label`, disabled states
      never rely on color alone — the "Skipped" pill text label satisfies this alongside the
      cursor/opacity change).
- [ ] No `dark:` classes, no new shadcn primitives — match the existing hand-rolled hex-color +
      `isDark`-free pattern already used throughout this file (Portfolio Tracker's detail page does
      not currently thread an `isDark` prop — confirm this convention still holds during
      implementation before introducing one; if it does, match it, don't diverge).

### E — Shared phase-merge helper (avoid duplicating `buildSeedPhaseEntries`)

- [ ] `buildSeedPhaseEntries` (`src/lib/programme/seed.ts:34-63`, currently module-private) is the
      exact defaults+customs merge/sort/dense-reindex logic Requirements B and C both need
      client-side. Export it (or extract an equivalent pure function into
      `src/config/customer-phases.ts` alongside `resolveEffectivePhase`, which is the more natural
      home since it's already the shared config module imported by both server and client code) so
      `_onboarding-detail.tsx` calls the same logic instead of re-implementing phase-merge order a
      second time with its own subtly different edge cases.
- [ ] The extracted function's signature should accept `CustomPhaseSeed[]` (already the shape
      `draft_custom_phases` is stored as) and return the same `SeedPhaseEntry`-shaped ordered list
      `seed.ts` already produces — `_onboarding-detail.tsx` only needs `{ number, name, dayStart,
      dayEnd, sortOrder }` per entry (matches `PhaseConfig`'s own shape closely enough to reuse
      `PhaseConfig[]` as the return type with an empty `deliverables: []` for the not-started
      screen's purposes, since neither the button label nor the Jump-to-phase menu render
      deliverables).

## Out of Scope / Must-Not-Change

- Discrete Development's (and every other non-`customer_phases`-engine classification's) existing
  `_generic-phase-view.tsx` (task 247) — untouched, already dynamic per its own model. See the
  Overview's scope call.
- Widening `scheduled_start_phase` to accept a custom phase number (6+) — the scheduled-start flow
  stays limited to the fixed 5, matching `route.ts`'s existing `1-5` validation, unchanged.
- The already-started Timeline/Gantt/Swimlane's own existing skipped-phase badge treatment
  (`_onboarding-detail.tsx:665-674`) — reused as a visual reference, not modified.
- No change to `resolveEffectivePhaseNumber`'s skip-resolution semantics (seed.ts) — this task only
  makes the pre-seed UI aware of the same skip set that logic already resolves against at actual
  seed time.
- Task 249 (customizable per-phase duration on the New Project form) is a separate, deeper follow-up
  — not started here. This task treats `draft_custom_phases`' day ranges as opaque (whatever the
  wizard already produces today via `customPhasesFromDraft`), it does not change how those day
  ranges are set.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/105_projects_draft_phase_plan.sql` | Create | `draft_skip_phase_numbers int[]`, `draft_custom_phases jsonb`, both `not null default` empty |
| `src/types/database.ts` | Modify | Add both columns to `projects` Row/Insert/Update |
| `src/app/api/onboarding/projects/route.ts` | Modify | Write both fields on the `projects` insert for every mode (not just `"start"`) |
| `src/app/api/projects/[projectId]/programme/start/route.ts` | Modify | Select + pass both into `seedAndStartProgramme` |
| `src/app/api/onboarding/projects/[projectId]/qstash-start/route.ts` | Modify | Select + pass both into `seedAndStartProgramme` |
| `src/app/api/programme/reminders/route.ts` | Read-only check | Confirm this route doesn't also call a seed function needing the same fix (grep during implementation — not confirmed either way in this task's research pass) |
| `src/app/api/onboarding/scheduled-autostart/route.ts` | Modify | Select + pass both into `seedAndStartProgramme` |
| `src/config/customer-phases.ts` | Modify | Export a shared defaults+customs merge/sort helper (extracted from `seed.ts`'s `buildSeedPhaseEntries`) |
| `src/lib/programme/seed.ts` | Modify | `buildSeedPhaseEntries` calls into the shared helper instead of duplicating it (or is itself the exported function, caller's choice at implementation time) |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_load-detail-data.ts` | Modify | Select `draft_skip_phase_numbers, draft_custom_phases` on the `project` query |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` | Modify | Dynamic Start button label/handler, skip-aware `JumpToPhaseMenu` phases + disabled rendering, skip-aware "Select Phase" dropdown in the scheduled-card branch |

## Code Context

### Confirmed gap — `programme/start/route.ts` never passes skip/custom (lines 39-45)

```ts
const result = await seedAndStartProgramme(
  { id: project.id, customer_id: project.customer_id },
  companyName,
  user.id,
  1,
  project.programme_duration_days
  // <-- skipPhaseNumbers, customPhases both omitted, defaulting to []
);
```

`seedAndStartProgramme`'s signature (`seed.ts:156-164`) already accepts both as optional trailing
params — this route (and the two cron/qstash routes) simply never supply them today.

### `buildSeedPhaseEntries` — the merge logic to share (seed.ts:34-63)

```ts
function buildSeedPhaseEntries(customPhases: CustomPhaseSeed[]): SeedPhaseEntry[] {
  const defaults: SeedPhaseEntry[] = PROGRAMME_PHASES.map((p) => ({
    number: p.number, sortOrder: p.number, isCustom: false, name: p.name,
    dayStart: p.dayStart, dayEnd: p.dayEnd,
    deliverables: p.deliverables.map((d) => ({ key: d.key, name: d.name, dayStart: d.dayStart, dayEnd: d.dayEnd })),
  }));
  const customs: SeedPhaseEntry[] = customPhases.map((c) => ({
    number: c.phaseNumber, sortOrder: c.sortOrder, isCustom: true, name: c.name,
    dayStart: c.dayStart, dayEnd: c.dayEnd,
    deliverables: c.deliverables.map((d, i) => ({ key: slugifyDeliverableKey(d.name, i), name: d.name })),
  }));
  return [...defaults, ...customs]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((entry, i) => ({ ...entry, sortOrder: i + 1 }));
}
```

### `_onboarding-detail.tsx` — the two render sites to change (lines 1611-1717)

```tsx
const scheduledPhaseNumber = (project.scheduled_start_phase ?? 1) as number;
const scheduledPhase = getPhaseByNumber(scheduledPhaseNumber);
...
<button onClick={handleStart} disabled={starting}>
  <PlayCircle size={15} /> {starting ? "Starting…" : "Start Onboarding"}
</button>
<JumpToPhaseMenu open={jumpOpen} setOpen={setJumpOpen} note={jumpNote} setNote={setJumpNote} onJump={handleJump} jumping={jumping} />
...
{PROGRAMME_PHASES.filter((p) => p.number !== scheduledPhaseNumber).map((p) => (
  <option key={p.number} value={p.number}>Phase {p.number}: {p.name}</option>
))}
```

New shape (sketch — exact variable names at implementation time's discretion):

```tsx
const orderedPlan = buildProjectPhasePlan(project.draft_skip_phase_numbers, project.draft_custom_phases); // shared helper, Requirement E
const skipSet = new Set(project.draft_skip_phase_numbers);
const firstActivePhase = orderedPlan.find((p) => !skipSet.has(p.number)) ?? orderedPlan[0];
...
<button onClick={() => startAtPhase(firstActivePhase.number)} disabled={starting}>
  <PlayCircle size={15} /> {starting ? "Starting…" : `Start ${firstActivePhase.name}`}
</button>
<JumpToPhaseMenu ... phases={orderedPlan} skipSet={skipSet} />
```

`JumpToPhaseMenu` gains a `skipSet?: Set<number>` prop (default empty) and, per phase row:

```tsx
{phases.map((p) => {
  const skipped = skipSet.has(p.number);
  return (
    <button
      key={p.number}
      type="button"
      onClick={() => onJump(p.number)}
      disabled={jumping || skipped}
      className={cn(
        "w-full border-none bg-transparent px-3.5 py-2 text-left text-[13px] transition-colors disabled:opacity-50",
        skipped ? "cursor-not-allowed text-[#5F6A88]" : "cursor-pointer text-[#0B1533] hover:bg-[#F4F6FB]"
      )}
    >
      <span className="flex items-center gap-1.5">
        {p.name} (Day {p.dayStart}–{p.dayEnd})
        {skipped && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400">Skipped</span>}
      </span>
    </button>
  );
})}
```

## Implementation Steps

1. Write and apply `105_projects_draft_phase_plan.sql`; update `src/types/database.ts`.
2. Extract/export the phase-merge helper from `seed.ts` into `src/config/customer-phases.ts`
   (Requirement E) — `seed.ts` calls it instead of its own private copy. Run `npx tsc --noEmit`
   after this step alone to confirm no regression before touching anything else.
3. `POST /api/onboarding/projects`: persist `draft_skip_phase_numbers`/`draft_custom_phases` on
   the insert for every mode.
4. `POST /api/projects/[projectId]/programme/start`,
   `POST /api/onboarding/projects/[projectId]/qstash-start`,
   `POST /api/onboarding/scheduled-autostart`: select + pass both into `seedAndStartProgramme`.
   Grep `src/app/api/programme/reminders/route.ts` for any seed call first — confirm in/out of
   scope before editing.
5. `_load-detail-data.ts`: add both columns to the `project` select; thread through to
   `OnboardingDetail`'s prop type.
6. `_onboarding-detail.tsx`: compute `orderedPlan`/`skipSet`/`firstActivePhase`; wire the Start
   button's label + `onClick`; extend `JumpToPhaseMenu` with `skipSet`; pass `orderedPlan` at both
   call sites (not-started `JumpToPhaseMenu`, scheduled-card "Select Phase" `<option>` list).
7. Sweep changed files against `nextjs-file-length-best-practices.md` — `_onboarding-detail.tsx` is
   already well over the soft-warning range pre-task (task 247's own Implementation Notes already
   flagged this as pre-existing); keep this task's net line growth minimal, matching task 247's own
   precedent of not expanding that file further than necessary.
8. `npx tsc --noEmit` and `pnpm lint`.

## Acceptance Criteria

- [ ] A StackShift I project saved as Draft with Phase 1 (Onboard) unchecked in the wizard, then
      reopened in Portfolio Tracker: the primary button reads "Start Migrate & Rebrand" (or
      whichever phase is first non-skipped), not "Start Onboarding."
- [ ] Clicking that button starts the programme at the correct phase (verify via the resulting
      `customer_phases` rows: the skipped default is `status: 'skipped'`, the button's target phase
      is `status: 'active'`) — confirms Requirement A's persistence fix actually threads through to
      seed time, not just the button label.
- [ ] "Jump to phase" on that same Draft project lists all 5 defaults (skipped one included) plus
      any custom phases from intake, in sort order; the skipped entry is visually muted, shows a
      "Skipped" pill, has a not-allowed cursor on hover, and clicking it does nothing.
- [ ] A project saved as `save_scheduled` with a custom phase configured at intake: once the
      schedule fires (manually trigger `qstash-start` or wait for the cron), the resulting
      `customer_phases` rows include that custom phase — confirms the previously-silent
      `save_scheduled` data-loss gap is closed end-to-end, not just at the pre-seed UI layer.
- [ ] The Scheduled card's "Select Phase" dropdown shows the same skip-aware phase list, with
      skipped phases rendered as disabled `<option>` elements (native browser non-interactive
      styling — not custom-cursor, per Requirement C's native-control note).
- [ ] A project with no skips and no custom phases (today's default/common case) behaves
      byte-identical to before this task — "Start Onboarding," the plain 5-phase Jump-to-phase
      list, nothing disabled.
- [ ] Discrete Development (and every other generic-engine classification) is visually and
      behaviorally unchanged — still `_generic-phase-view.tsx`, still no blocking gate, confirming
      this task didn't touch task 247's scope.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual (no test runner configured):
- Create a StackShift I project via the New Project wizard, uncheck Phase 1 (Onboard), save as
  Draft. Reopen in Portfolio Tracker — check the button label and Jump-to-phase list.
- Repeat with a custom phase inserted instead of a skip — confirm it appears in Jump-to-phase in
  the correct sort position, and that starting via the primary button seeds it correctly.
- Create a project with `save_scheduled` + a skip/custom configuration; manually hit
  `POST /api/onboarding/projects/[projectId]/qstash-start` (or wait for the 5-minute cron) and
  inspect the resulting `customer_phases` rows in Supabase.
- Re-check an existing, already-started StackShift I project's Timeline is unaffected.
- Re-check a Discrete Development project's Portfolio Tracker detail page (empty and
  milestone-populated) is unaffected.

## Compatibility Touchpoints

- New migration (`105_projects_draft_phase_plan.sql`) must ship with the code deploy; both new
  columns default to empty, so no backfill is needed for existing rows.
- No `_docs/mcp-tools.md` changes (no MCP tool touched).
- Closes a real, silent data-loss gap (skip/custom-phase configuration lost on Draft/Scheduled
  saves) that task 244/246 each partially flagged but never fully closed — worth calling out in the
  PR description as a bug fix, not purely a UI enhancement.

## Implementation Notes

### What Changed
- **Requirement A (persistence fix):** added `projects.draft_skip_phase_numbers integer[]` and
  `projects.draft_custom_phases jsonb` (migration `105_projects_draft_phase_plan.sql`, both
  `NOT NULL DEFAULT` empty). `POST /api/onboarding/projects` now writes both onto the `projects`
  insert for every mode (previously only reached `seedAndStartProgramme` for an immediate
  `mode: "start"` submission). All three deferred-start call sites —
  `POST /api/projects/[projectId]/programme/start` (manual "Start Onboarding"),
  `POST /api/onboarding/projects/[projectId]/qstash-start` (one-shot QStash callback), and
  `POST /api/onboarding/scheduled-autostart` (5-minute cron fallback) — now select both columns
  and pass them into `seedAndStartProgramme` instead of omitting the args (which silently
  defaulted to empty arrays). Grepped `src/app/api/programme/reminders/route.ts` per the task
  doc's own flag — confirmed it calls no seed function, out of scope, untouched.
- **Requirement E (shared helper, done first per the Implementation Steps ordering):** extracted
  `buildOrderedPhasePlan` into `src/config/customer-phases.ts` — the defaults+customs
  merge/sort/dense-reindex core previously duplicated inline in `seed.ts`'s
  `buildSeedPhaseEntries`. `buildSeedPhaseEntries` now calls it and only adds deliverable rows on
  top; verified byte-identical output via the dense-reindex/sortOrder logic being a direct extract,
  not a rewrite.
- **Requirement B (not-started screen):** `_onboarding-detail.tsx`'s `!programmeStartedAt` /
  `!hasSchedule` branch now computes `orderedPlan` (via `buildOrderedPhasePlan(project.
  draft_custom_phases)`), `skipSet` (from `project.draft_skip_phase_numbers`), and
  `firstActivePhase` (first entry in `orderedPlan` not in `skipSet`). The primary button's label
  is now `` `Start ${firstActivePhase.name}` `` and its `onClick` calls
  `startAtPhase(firstActivePhase.number)` (reusing the existing Phase-1-vs-other branch already in
  `startAtPhase`) instead of the hardcoded `handleStart`/"Start Onboarding". `JumpToPhaseMenu` now
  receives `phases={orderedPlan}` and a new `skipSet` prop instead of defaulting to the static
  `PROGRAMME_PHASES`.
- **`JumpToPhaseMenu` component:** widened its `phases` prop type from `PhaseConfig[]` to a new
  minimal `JumpPhaseOption` shape (`{ number, name, dayStart, dayEnd }`) so both the "already
  started" call site's `PhaseConfig[]` (`orderedPhases`) and the new pre-seed call site's
  `OrderedPhaseSummary[]` (`orderedPlan`) satisfy it structurally without a cast. Added an optional
  `skipSet` prop; a phase whose number is in it renders `disabled`, `cursor-not-allowed`, muted
  `text-[#5F6A88]`, and a "Skipped" pill reusing the exact `bg-slate-100 text-slate-400` classes the
  Swimlane's own existing skipped-phase badge already uses (`_onboarding-detail.tsx:665-674`) — no
  second skipped-state visual language introduced.
- **Requirement C (scheduled card):** the "Select Phase" `<option>` list now maps over
  `orderedPlan.filter((p) => p.number !== scheduledPhaseNumber)` instead of
  `PROGRAMME_PHASES.filter(...)`, with `disabled={skipSet.has(p.number)}` and a `" (Skipped)"`
  label suffix on each disabled option — native `<select>` renders a disabled `<option>`
  non-interactive with the OS's own affordance, matching the task doc's own note that a custom
  not-allowed cursor isn't achievable inside a native select.
- **Jump-to-phase PATCH body (found during implementation, not explicitly itemized in the task
  doc's file list but required for the acceptance criteria "clicking Jump-to-phase seeds it
  correctly"):** `PATCH /api/projects/[projectId]/programme/phase` already accepted
  `skip_phase_numbers`/`custom_phases` in its body (built for the New Project wizard's own
  create-then-jump two-step flow, task 244/246) — but `_onboarding-detail.tsx`'s own `handleJump`
  never sent them. Now includes `skip_phase_numbers: project.draft_skip_phase_numbers,
  custom_phases: project.draft_custom_phases` in the PATCH body. Harmless on the route's
  "already started" branch, which re-statuses from the DB's own stored phases and ignores both
  fields.
- Cleaned up three now-stale comments that described the "known gap" this task closes (in
  `_onboarding-detail.tsx` near `altPhase`/`scheduledPhaseNumber`, and in
  `api/onboarding/projects/route.ts` after the `mode: "start"` seed call) so they no longer point
  future readers at a problem that no longer exists.

### Files Changed
- `supabase/migrations/105_projects_draft_phase_plan.sql` - new migration, both columns
- `src/types/database.ts` - added `draft_skip_phase_numbers`/`draft_custom_phases` to `projects`
  Row/Insert/Update
- `src/config/customer-phases.ts` - added `OrderedPhaseSummary` type + `buildOrderedPhasePlan`
- `src/lib/programme/seed.ts` - `buildSeedPhaseEntries` now calls the shared helper instead of
  duplicating the merge/sort logic
- `src/app/api/onboarding/projects/route.ts` - persist both fields on the `projects` insert for
  every mode; refreshed the now-resolved "known gap" comment
- `src/app/api/projects/[projectId]/programme/start/route.ts` - select + pass both fields into
  `seedAndStartProgramme`
- `src/app/api/onboarding/projects/[projectId]/qstash-start/route.ts` - select + pass both fields
- `src/app/api/onboarding/scheduled-autostart/route.ts` - select + pass both fields
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_load-detail-data.ts` - select both columns,
  return them on the `project` object
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` - props type extended;
  dynamic Start button label/handler; `JumpToPhaseMenu` widened + skip-aware; scheduled-card
  "Select Phase" skip-aware; `handleJump` relays the persisted skip/custom selection; stale
  comments refreshed

### Deviations From Plan
- **Minor, required for correctness:** `handleJump`'s PATCH body now includes
  `skip_phase_numbers`/`custom_phases` — not explicitly listed as a file change in the task doc's
  Proposed File Changes table (which focused on the Start button and the two menu render sites),
  but necessary to satisfy the task doc's own Acceptance Criteria ("clicking [a Jump-to-phase
  target] starts the programme at the correct phase"). The receiving route
  (`programme/phase/route.ts`) already supported both fields — this was a pure caller-side fix,
  no route changes needed.
- **Minor:** `api/programme/reminders/route.ts` was flagged in the task doc as "confirm during
  implementation" — confirmed via grep it calls no seed function; left untouched, no file change
  needed there.
- No Major deviations — every other Requirement (A-D) implemented as scoped; Discrete
  Development/`_generic-phase-view.tsx` untouched per the Overview's scope call.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing warnings in `_checklist-tab.tsx`, unrelated to this task —
  same warnings noted in tasks 222/239/242/247's own Implementation Notes)
- Manual/browser acceptance checks from this task doc's Verification section - SKIPPED (no live
  Supabase/browser session available in this implementation pass, and the migration hasn't been
  applied yet — same limitation task 247's own Implementation Notes documented for its own
  migration. Recommend applying `105_projects_draft_phase_plan.sql` first, then walking: a Draft
  StackShift I project with Phase 1 unchecked at intake (button label + Jump-to-phase disabled
  entry + successful start at the correct phase), a `save_scheduled` project with a custom phase
  (fires via manual `qstash-start` hit or the cron) to confirm the custom phase reaches
  `customer_phases`, and a plain no-skip/no-custom project to confirm byte-identical
  "Start Onboarding" behavior).

## Quality Gate Notes

### Result
PASS

### Standards Review
- `console.log`/`TODO`/`FIXME` sweep across every new/changed file returned zero hits.
- No dead code introduced; no new `any`/untyped escape hatches — the new `Json` cast to
  `CustomPhaseSeed[]` in `_load-detail-data.ts` and the three API routes mirrors this codebase's
  own existing pattern for typing a JSONB column back to its known runtime shape (no stricter
  option exists without a Zod schema, which no other JSONB read site in this codebase uses either).
- File-length: `_onboarding-detail.tsx` is 2103 lines after this task's changes (net growth ~110
  lines for the dynamic button/menu logic, the widened `JumpToPhaseMenu`, `handleJump`'s extended
  body, and three refreshed comments) — already over the 400-500 hard limit before this task
  touched it (task 247's own Implementation Notes flagged this as a pre-existing condition, not
  something this task introduced). Not split further: the task doc's own Implementation Steps only
  called for "minimal" growth matching task 247's precedent of not fixing the file's pre-existing
  over-length condition as a side effect of an unrelated task — extracting `JumpToPhaseMenu` to
  its own file was considered but deferred, since it's a small (60-line), tightly-coupled internal
  component reused by two call sites in the same file, and splitting it wasn't listed in Proposed
  File Changes.
- Rules of Hooks: no new hooks introduced; `orderedPlan`/`skipSet`/`firstActivePhase` are plain
  `const` derivations inside the existing `!programmeStartedAt` branch, not hooks.
- Scope boundaries verified: `_generic-phase-view.tsx` and every Discrete-Development/generic-engine
  code path are untouched (zero diff); the already-started Timeline/Swimlane/Status Summary drawer
  are untouched.
- **Independent re-verification pass (this gate):** traced both `startAtPhase` branches end to
  end against the actual seeding logic — `firstActivePhase.number === 1` routes through
  `handleStart` → `POST .../programme/start`, which now reads the persisted skip/custom data
  server-side and is only reachable when phase 1 itself isn't skipped, so it always resolves phase
  1 as active, correctly. `firstActivePhase.number !== 1` (phase 1 skipped) routes through
  `handleJump` → `PATCH .../programme/phase`, which now receives `skip_phase_numbers`/
  `custom_phases` in the body — confirmed its `resolveEffectivePhaseNumber` call resolves the
  already-non-skipped target immediately, correctly seeding phase 1 "skipped" and the target
  "active." Also confirmed a custom phase (number 6+) reaches this same path correctly, since
  `custom_phases` is now included in the body where it previously wasn't — this is the concrete
  mechanism behind the "clicking Jump-to-phase seeds it correctly" acceptance criterion.
  Re-confirmed the already-started `JumpToPhaseMenu` call site (line ~1913, unchanged,
  `phases={orderedPhases}`) is structurally compatible with the widened `JumpPhaseOption[]` prop
  type with zero behavior change there (no `skipSet` passed, so nothing renders disabled there —
  correct, that call site has no pre-seed skip concept per the task doc's own `skipSet` prop
  comment).
- **Non-blocking observation, not a defect:** the scheduled-card path doesn't guard against a
  theoretically contradictory state where `project.scheduled_start_phase` itself is also present
  in `project.draft_skip_phase_numbers` (scheduled to start at a phase the PM also marked
  skipped). Not reachable through the current New Project wizard (the same intake step drives
  both fields together), out of scope per the task doc's Requirement C note that
  `scheduledPhaseNumber` resolution is "unaffected by this task," and pre-existing regardless (the
  scheduled-start card's own phase resolution never validated against a skip set before this task
  either).

### Deviations
- Same two minor items noted under "Deviations From Plan" above — both required for correctness,
  neither a scope expansion beyond what the task doc's Acceptance Criteria already committed to.

### Required Fixes
- None (PASS).
