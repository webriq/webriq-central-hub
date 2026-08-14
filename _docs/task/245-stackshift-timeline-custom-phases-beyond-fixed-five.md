# 245: StackShift I/II Timeline — Support Custom Phases Beyond the Fixed 5

**Created:** 2026-08-14
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep
**Status:** Completed — research/design fully resolved 2026-08-14; implemented via task 246 (also Completed).

**Depends on:** task 244 (per-project StackShift I default-phase skip, `Testing`). This task is the deliberately-deferred, high-risk half of a request that also asked for phase-skip (delivered in 244) and phase-*addition* (this task). See task 244's Round 2 notes: the user was offered a lower-risk alternative (extra phases routed through the generic `milestones`/`tasklists` model, parallel to the fixed Timeline) and explicitly chose to extend the Timeline itself instead — this task documents and scopes that choice.

---

## Overview

Today, a StackShift I project's 5 phases — Onboard, Migrate & Rebrand, Publish, AI Visibility, Optimize — are entirely defined by a **static config array**, `PROGRAMME_PHASES` in `src/config/customer-phases.ts`. Every piece of code that renders or reasons about a phase (the Timeline's Gantt grid, `customer_phases`/`customer_deliverables` seeding, dashboards, reminders, status reports) either:

- iterates `PROGRAMME_PHASES` directly (a fixed, 5-element, compile-time-known array), or
- looks up phase data via `getPhaseByNumber(n)` / `phase_number: 1|2|3|4|5` and expects the returned `PhaseConfig` (name, day range, owner, deliverables) to come from that same static array.

**Correction to this task's original framing (resolved during research, 2026-08-14):** StackShift II — even with "generate default phases" checked — does **not** actually go through `customer_phases`/the Timeline at all. `phasePlanFromProgramme()` (`customer-phases.ts:291-298`) converts `PROGRAMME_PHASES` into the generic `PhasePlanInput` shape once, at intake, purely as a convenience seed; from that point on StackShift II always lives in the generic `milestones`/`tasklists` model (task 239/240), fully free-form (add/rename/remove phases already works there today). So "StackShift II with generate-default checked" was never actually rendering the fixed 5-phase Timeline — it just started from the same names. This task's Timeline/Gantt-based custom-phase work is intrinsically StackShift-I-only in its mechanics; see Question 5's resolution below for what "applies to StackShift II too" (confirmed by the user) concretely means given this correction.

There is currently **no per-project phase data** at all — a phase's name, day range, and deliverable list are identical for every StackShift I project in the system. `customer_phases`/`customer_deliverables` only store *state* (status, actual dates, per-project day-range overrides) layered on top of the shared static shape.

Letting a PM add a genuinely new phase (a 6th+ phase, or an inserted one) to a specific project's Timeline means that phase needs its own name, day range, and deliverable list that **isn't** in `PROGRAMME_PHASES` — a fundamentally different data shape than "pick which of the 5 known phases to skip" (task 244). This is a data-model change, not a UI change.

### Blast-Radius Classification (resolved 2026-08-14 — re-verify at implementation time, this codebase changes fast)

Live re-grep (`grep -rln "phase_number\|PROGRAMME_PHASES" src/app src/lib src/config supabase/migrations`) found **38 files** (the 2026-08-14 list above was close but not exact). Each was read and classified into one or more of: `passthrough` (no change needed), `assumes-fixed-5` (breaks silently past phase 5), `assumes-static-lookup` (calls `getPhaseByNumber`/reads `PROGRAMME_PHASES` directly, needs a per-project data source instead). **Tally: 15 passthrough (no change), 15 assumes-fixed-5, 13 assumes-static-lookup** (most fixed-5 files are also static-lookup — net ~20 distinct files actually need code changes).

**No change needed (15, passthrough):** `phase-membership.ts`, `programme/route.ts`, `wizard-data/route.ts`, `start/route.ts`, `internal-deliverables/[deliverableKey]/route.ts`, `status-report/route.ts` (onboarding), `assets/route.ts`, `assets/folders/route.ts`, `assets/[assetId]/generate-md/route.ts`, `_load-detail-data.ts`, `_onboarding-wizard.tsx`, `_wizard-v2-types.ts`, `_onboarding-wizard-v2.tsx`, `_access-tab.tsx`, `new/_phase-builder.tsx`.

**Needs code changes (~20, fixed-5 and/or static-lookup):**
- **Chokepoints (own the seeding/lookup logic):** `src/config/customer-phases.ts` (the static config + `getPhaseByNumber`/`getPhaseForDay`/`resolveEffectivePhaseNumber`), `src/lib/programme/seed.ts` (`PROGRAMME_PHASES.map` builds exactly 5 `customer_phases` rows, both `seedAndStartProgramme` and `seedProgrammeAtPhase`)
- **API routes with hardcoded `<1||>5` validation or static lookups:** `onboarding/projects/route.ts`, `onboarding/projects/[projectId]/qstash-start/route.ts`, `onboarding/projects/import/route.ts`, `projects/[projectId]/programme/phase/route.ts`, `.../complete-phase/route.ts`, `.../deliverables/[deliverableKey]/route.ts`, `.../deliverables/[deliverableKey]/schedule/route.ts`, `.../phases/[phaseNumber]/note/route.ts`, `.../phases/[phaseNumber]/members/route.ts`, `programme/reminders/route.ts`
- **Lib:** `src/lib/programme/status-report.ts` (`TOTAL_PROGRAMME_DAYS` derived from `PROGRAMME_PHASES[len-1]`), `src/lib/qstash/index.ts` (type-only `1|2|3|4|5` union)
- **UI:** `_onboarding-detail.tsx` (the Timeline itself — heaviest file, Gantt/swimlane render, 3× `1|2|3|4|5` unions, `phase_number===5` isComplete check), `_onboarding-list.tsx` (`PROGRAMME_PHASES.length` as a phase-count proxy), `_programme-tab.tsx`, `pm-dashboard.tsx` (positional `PROGRAMME_PHASES[0]/[1]/[2]` indexing), `status-report/_status-report-client.tsx`, `portfolio-tracker/import/_content.tsx`, `new/_phases-step.tsx` (builds the "Start at phase" dropdown from `PROGRAMME_PHASES` — the file this task's Confirmed UI Requirements below touch directly), `new/_new-project-types.ts` (mild — just a `1|2|3|4|5` type to widen)

**Database:** migrations `059_customer_programme_phases.sql`, `060_onboarding_project_scoping.sql`, `073_project_phase_membership.sql` read in full — see Question 4's resolution below. No other migrations reference `phase_number`.

## Key Open Design Questions — RESOLVED 2026-08-14

1. **Where does a custom phase's name/day-range/deliverable list live?** RESOLVED — new nullable columns directly on `customer_phases` and `customer_deliverables`, generalizing the override pattern migration 071 already established. See Data Model Proposal below.
2. **Does `phase_number` stay a small closed range (1-5), or become open-ended?** RESOLVED — open-ended. Confirmed low-risk: only 2 DB CHECK constraints anywhere cap it at 1-5 (see Question 4), and no RLS policy keys on the numeric value. Phase *identity* (`phase_number`) and phase *display order* are decoupled — see Data Model Proposal — so a phase inserted "in the middle" doesn't require renumbering/shifting any existing row or FK reference.
3. **What day range does a new phase get, and how does it interact with the 1-120 (or custom-duration) reference scale?** RESOLVED — manual placement, not automatic reflow. A new phase gets `day_start_override`/`day_end_override` (new phase-level columns, same reference scale, subject to the same `scaleDay`/`unscaleDay` as the 5 defaults) defaulting to starting the day after the current last phase ends, PM-adjustable via the same drag/resize interaction the Gantt already supports for deliverables. Existing phases are **never** automatically shifted — this avoids a cascading day-math rewrite across every subsequent phase's deliverables. Overlap between a custom phase and an existing one is allowed at the data level; whether the Gantt should visually warn on overlap is a rendering-polish question for the follow-up implementation task, not a data-model blocker.
4. **RLS**: RESOLVED — **no RLS policy rewrite needed at all.** Migrations 059/060/073 read in full: every policy on `customer_phases`/`customer_deliverables`/`phase_members`/`project_members` is a plain role check (`get_my_role() in (...)`), never conditioned on the *value* of `phase_number`. The only blockers are two DB-level `CHECK` constraints, both from migration 059: `customer_phases.phase_number ... check (phase_number between 1 and 5)` and the identical constraint on `customer_deliverables.phase_number`. `phase_members.phase_number`/`customer_assets.phase_number`/`customer_asset_folders.phase_number` already have no such constraint (073's own migration comment notes it was deliberately left open: "not constrained to 1"). The new migration only needs to drop/widen those two CHECK constraints — this significantly lowers this task's overall risk profile versus the original "RLS is especially high-risk" framing in Compatibility Touchpoints below.
5. **Does this apply to StackShift II too?** RESOLVED (confirmed with user) — **yes, both StackShift I and StackShift II** (its "generate default phases" mode). Given the Overview correction above — StackShift II never actually renders the fixed-5 Timeline, it seeds the generic free-form model once and diverges — "applies to StackShift II too" concretely means: once StackShift I's Timeline supports custom phases, StackShift II's "generate default phases" path should seed into (and its own detail page should render via) the **same** Timeline/Gantt component and underlying `customer_phases`/`customer_deliverables` data model, instead of `phasePlanFromProgramme()` diverging it into the separate generic `milestones` model at intake. This is a meaningfully larger change than "reuse the same custom-phase columns" — it means StackShift II's default-phases path stops using the generic model entirely and adopts `customer_phases` the same way StackShift I does. Flag explicitly in the follow-up implementation task's scope, since it touches StackShift II's own seeding/rendering path (currently owned by tasks 239/240), not just this task's new columns.

## Data Model Proposal (resolved 2026-08-14)

**Schema changes (new migration, `NNN_customer_phases_custom.sql`):**
- `customer_phases`: add `custom_name text null`, `day_start_override integer null`, `day_end_override integer null`, `sort_order integer null` (phase-level day-range override, mirroring `customer_deliverables.day_start_override`/`day_end_override` from migration 071; `custom_name` overrides `PROGRAMME_PHASES` lookup when set). Drop/widen the `check (phase_number between 1 and 5)` constraint to allow any positive integer.
- `customer_deliverables`: add `custom_name text null`, `custom_description text null`, `custom_owner text null` (a custom phase has no static `DeliverableConfig` to fall back to, so its deliverables need their full content stored, not just a day override). Drop/widen the identical `between 1 and 5` constraint.
- **Identity vs. order, decoupled:** `phase_number` remains a stable, monotonically-increasing per-project identifier assigned at creation (`max(existing phase_number) + 1`, never reused, never renumbered) — every existing FK reference (`phase_members`, `customer_assets`, comments, etc.) keeps working unchanged. A new `sort_order` column (phase-level) controls **display/Gantt-lane order only** and is freely reorderable (drag-to-reorder, same `@dnd-kit` pattern task 244 Round 2 already introduced for free-form phases/deliverables) without touching any FK. This is what makes "insert a phase in the middle" safe: it's a `sort_order` change, not a renumbering cascade.
- **Backward compatibility:** for `phase_number` 1-5 with all four new columns `null`, behavior is byte-for-byte identical to today — name/day-range keep coming from `PROGRAMME_PHASES`/`getPhaseByNumber`. The static config is not deleted or deprecated; it stays the source of truth for the 5 defaults, and the new columns are purely an override/extension layer, consistent with how `day_start_override` already works for deliverables.
- **Lookup logic:** `getPhaseByNumber`/`getPhaseForDay` (or new equivalents) become project-aware — given a `phase_number` and its `customer_phases` row, prefer `custom_name`/`day_start_override`/`day_end_override` when non-null, else fall back to `PROGRAMME_PHASES`. Same pattern for deliverables via `getDeliverable`.

This directly answers Confirmed UI Requirements' "Start at phase" dropdown (below): it's populated from that project's actual `customer_phases` rows ordered by `sort_order`, not from `PROGRAMME_PHASES.map`.

## Confirmed UI Requirements (from user, 2026-08-14 — carry into the follow-up implementation task once the data model below is settled)

These are decided product behavior, not open questions — captured now so they aren't lost, but not actionable until Key Open Design Questions 1-3 resolve what a "phase" and its numbering look like once custom phases exist:

- **Field order:** In the New Project wizard (task 244's Step 3, `_phases-step.tsx`), the Programme Duration, Schedule, and "Start at phase" fields move to render **after/below** that type's phase-and-deliverables setup — not above it (task 244 Round 2 currently groups them *above* the phase builder). This ordering follows from the next point: "Start at phase" can't be meaningfully chosen until the phases it selects among have been entered.
- **"Start at phase" becomes dynamic, not a fixed 1-5 select:** its dropdown options are derived from whatever phases exist in that project's phase builder at the time (the fixed 5 today; any custom/added phases once this task's data model ships) — i.e. the option list tracks the *entered* phases (name + position), not a hardcoded `1|2|3|4|5` range.
- **Auto-skip cascade:** selecting a phase other than the first one in that dropdown automatically sets every phase *before* the selected one to `status: "skipped"`. This generalizes the ternary already in `seed.ts` (`p.number === phaseNumber ? "active" : p.number < phaseNumber ? "skipped" : "not_started"`, used today for the fixed-5 "jump to phase" admin flow) to an open/custom-length phase list — same rule, no longer bounded to 5 positions.

## Requirements (Phase 1 — Research & Design, this task's actual scope)

- [x] Classify all files touching `phase_number`/`PROGRAMME_PHASES`: `passthrough` (no change needed), `assumes-fixed-5`, `assumes-static-lookup` — see Blast-Radius Classification above (38 files found live; 15 passthrough, ~20 need changes).
- [x] Read migrations 059/060/073 in full; document exactly which phase numbers get which RLS write permissions today, and what "phase 6+" should inherit — see Question 4's resolution (no RLS rewrite needed; only 2 CHECK constraints block it).
- [x] Produce a concrete data-model proposal answering Open Design Questions 1-3 above — see Data Model Proposal above.
- [x] Confirm with the user whether this applies to StackShift II as well, or is StackShift-I-only (see Question 5) — confirmed: both, with the scope nuance noted (StackShift II's default-phases path adopts the same Timeline/model, replacing its current generic-model divergence).
- [ ] Write the actual implementation task (this document, or a follow-up 246) with a real Proposed File Changes table, Code Context, and Acceptance Criteria, covering: the schema migration; the ~20 files needing changes (chokepoints first: `customer-phases.ts`, `seed.ts`); the StackShift II default-phases path adopting `customer_phases` instead of `phasePlanFromProgramme()`'s generic-model diversion; and the three Confirmed UI Requirements below.
- [ ] The implementation task's Requirements/Acceptance Criteria must include the three Confirmed UI Requirements above (field order, dynamic "Start at phase" options, auto-skip cascade) — do not drop them in the handoff from research to implementation.

## Out of Scope

- Re-litigating task 244's phase-*skip* feature (already shipped, unaffected by this task).
- StackShift Access/Access Plus/Discrete Development — already fully free-form via the generic model, no relevance here.
- Any implementation work — this task is research/design only; the resolved data model and file classification above hand off to a follow-up implementation task (this doc or a new 246) rather than being coded here.

## Verification

No code changes in this task's first phase — verification is "does the research classification + data-model proposal hold up to a second read," not `tsc`/`lint`/`build`.

## Compatibility Touchpoints

- Any schema change from this task needs a new migration, following the existing `NNN_description.sql` convention (see `102_projects_programme_duration_days.sql` for the most recent example).
- ~~RLS policy changes are especially high-risk~~ — **resolved during research**: no RLS policy needs to change at all (see Question 4). The only DB-level risk is correctly dropping/widening the two `between 1 and 5` CHECK constraints on `customer_phases`/`customer_deliverables` without affecting any other constraint on those tables.
- StackShift II's default-phases path (`phasePlanFromProgramme()`, tasks 239/240) needs to be re-pointed at `customer_phases` instead of the generic `milestones` model — coordinate with whoever picks up the follow-up implementation task, since this changes behavior task 239/240 shipped, not just adds new behavior.
