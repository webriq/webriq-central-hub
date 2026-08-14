# 243: Fix Phase 2-5 Milestone/Tasklist `external_id` Collision Across Projects

**Created:** 2026-08-13
**Priority:** HIGH
**Type:** bug
**Recommended Tier:** balanced
**Status:** Testing

**Related:** task 241 (introduced the affected code).

---

## Overview

`seedAndStartProgramme` (`src/lib/programme/seed.ts`) logs a `23505` duplicate-key error on every "Start Onboarding" / programme-start call after the first one, e.g.:

```
seedAndStartProgramme: Phase 2-5 milestone insert error: {
  code: '23505',
  details: 'Key (external_id)=(programme-phase-2) already exists.',
  message: 'duplicate key value violates unique constraint "milestones_external_id_key"'
}
```
(repeated for `programme-phase-3/4/5`), most recently on `POST /api/projects/edda8693-0b54-47f5-bd1a-e8f31389f6db/programme/start`.

**Root cause:** task 241 added a loop (`seed.ts:99-118`) that seeds one `milestones` row and several `tasklists` rows per Phase 2-5, keyed by synthetic `external_id` values:
- `` `programme-phase-${phase.number}` `` (e.g. `programme-phase-2`)
- `` `programme-deliverable-${phase.number}-${d.key}` `` (e.g. `programme-deliverable-2-design-review`)

Neither string includes `project.id`. Both `milestones.external_id` (migration `037_milestones_migration_columns.sql:8`) and `tasklists.external_id` (migration `035_zoho_decommission_schema.sql:19`) carry a **table-wide `UNIQUE` constraint**, not one scoped to `project_id` — the column was originally designed for Zoho's own globally-unique import IDs, which is a valid assumption for that use case but not for these hand-rolled per-phase keys, since `phase.number` only ever takes values 2-5 and `d.key` is a small fixed deliverable-key set repeated identically across every project.

**Effect:** The very first project whose programme is started (after this code shipped) successfully claims `programme-phase-2` through `programme-phase-5` (and their deliverable tasklist rows). Every other project's insert collides on `milestones_external_id_key`. The failure is caught and treated as non-fatal per phase (`if (milestoneError || !milestone) { console.error(...); continue; }`), so `POST /programme/start` still returns `201` and the actual programme (`customer_phases`, `customer_deliverables`, `projects.programme_started_at`) starts correctly — but the affected project silently ends up with **zero** Phase 2-5 `milestones`/`tasklists` rows of its own. Task 241's Timeline deliverable cards then have nothing to resolve against `tasklistIdByExternalId` (`_onboarding-detail.tsx:1414`) and degrade to a bare `/tasks` link instead of the tasklist-scoped deep link — silently, with no error visible to the PM, for every project except whichever one happened to start first.

The project in the reported log (`edda8693-0b54-47f5-bd1a-e8f31389f6db`) is currently in this broken state and needs a one-time backfill in addition to the code fix, or it will stay broken forever (the seeding loop only ever runs once, at programme start).

## Requirements

- [ ] `seedAndStartProgramme`'s Phase 2-5 loop (`seed.ts:99-118`) writes `external_id` values scoped by `project.id`, e.g. `` `programme-phase-${project.id}-${phase.number}` `` and `` `programme-deliverable-${project.id}-${phase.number}-${d.key}` ``, so two different projects can never collide.
- [ ] `_onboarding-detail.tsx:1414`'s lookup key construction is updated to match the new `external_id` format exactly (it must reproduce the same string the seed wrote, since the client-side `Map` is keyed on the raw value returned by the API).
- [ ] `GET /api/projects/[projectId]/programme/route.ts:37`'s `.like("external_id", "programme-deliverable-%")` filter still matches the new format (prefix is unchanged, `project.id` is appended after it) — verify, no code change expected here.
- [ ] Already-affected projects (any project with `programme_started_at` set but zero `milestones` rows matching `programme-phase-%` for its own `project_id`) get their Phase 2-5 `milestones`/`tasklists` rows backfilled once, using the corrected scoped format. See Implementation Steps for the proposed self-healing approach.
- [ ] `npx tsc --noEmit` passes clean.

## Out of Scope / Must-Not-Change

- `seedProgrammeAtPhase` (`seed.ts:156-219`, used by the Jump-to-Phase override and CSV/Excel bulk import) does not write to `milestones`/`tasklists` at all — untouched, unaffected by this bug.
- No changes to `customer_phases`/`customer_deliverables` seeding logic — that part already works correctly (scoped by `project_id` + `phase_number`/`deliverable_key`, no global uniqueness assumption).
- No changes to the Zoho-import `external_id` usage on these same columns (migrations 035/037) — those rows are unrelated (Zoho IDs are genuinely globally unique) and must keep working under the existing table-wide unique constraint.
- Do not widen the `UNIQUE` constraint to a composite `(project_id, external_id)` constraint — that's a larger migration touching a column shared with the unrelated Zoho-import dedup use case, and isn't necessary: scoping the *value* by `project.id` is sufficient and keeps the fix contained to task 241's code.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/programme/seed.ts` | Modify | Scope the two `external_id` template strings in `seedAndStartProgramme`'s Phase 2-5 loop by `project.id`; add an exported, idempotent backfill helper for already-affected projects |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` | Modify | Update `handleOpenPhaseDeliverable`'s lookup key (line 1414) to match the new `external_id` format |
| `src/app/api/projects/[projectId]/programme/route.ts` | Modify | Call the new backfill helper (non-blocking) when `phase_tasklists` comes back empty for a project that already has Phase 2-5 `customer_phases` rows, so existing broken projects self-heal on next Timeline load |

## Code Context

### `seed.ts:99-118` — the colliding loop (current)
```ts
for (const phase of PROGRAMME_PHASES.filter((p) => p.number !== 1)) {
  const { data: milestone, error: milestoneError } = await adminClient
    .from("milestones")
    .insert({ project_id: project.id, external_id: `programme-phase-${phase.number}`, name: phase.name, status: "planned" })
    .select("id")
    .single();
  if (milestoneError || !milestone) {
    console.error("seedAndStartProgramme: Phase 2-5 milestone insert error:", milestoneError);
    continue;
  }
  const tasklistRows = phase.deliverables.map((d, i) => ({
    project_id: project.id,
    milestone_id: milestone.id,
    external_id: `programme-deliverable-${phase.number}-${d.key}`,
    name: d.name,
    position: i,
  }));
  const { error: tasklistError } = await adminClient.from("tasklists").insert(tasklistRows);
  if (tasklistError) console.error("seedAndStartProgramme: Phase 2-5 tasklist insert error:", tasklistError);
}
```
Change both `external_id` template strings to include `project.id` (e.g. right after the `programme-phase-`/`programme-deliverable-` prefix, before `phase.number`).

### `_onboarding-detail.tsx:1409-1418` — the consumer (current)
```ts
const handleOpenPhaseDeliverable = (phaseNumber: number, deliverableKey: string) => {
  if (phaseNumber === 1) {
    handleOpenWizardStep(deliverableKey);
    return;
  }
  const tasklistId = tasklistIdByExternalId.get(`programme-deliverable-${phaseNumber}-${deliverableKey}`);
  ...
```
`project.id` is already in scope in this component (used throughout, e.g. line 1140 `` `/api/projects/${project.id}/programme/phases/1/members` ``) — reuse it in the lookup key so it exactly matches whatever `seed.ts` now writes.

### `programme/route.ts:24-38` — read path, already project-scoped
```ts
const [projectRes, phasesRes, deliverablesRes, internalRes, phaseTasklistsRes] = await Promise.all([
  ...
  supabase.from("tasklists").select("id, external_id").eq("project_id", projectId).like("external_id", "programme-deliverable-%"),
]);
```
This query is already filtered by `.eq("project_id", projectId)`, so it needs no change for the primary fix — it's the natural place to add the backfill call (it already has `phasesRes`/`phaseTasklistsRes` in scope to detect the broken state: `phasesRes.data` shows phase 2-5 rows with `status !== "not_started"` — i.e. the programme reached them — while `phaseTasklistsRes.data` is empty).

### Constraint definitions (for reference, no migration needed)
- `supabase/migrations/037_milestones_migration_columns.sql:8` — `alter table milestones add column external_id text unique;`
- `supabase/migrations/035_zoho_decommission_schema.sql:19` — `external_id text unique,` on `tasklists`

## Implementation Steps

1. In `seed.ts`, update the two `external_id` template strings in the Phase 2-5 loop to include `project.id` (e.g. `` `programme-phase-${project.id}-${phase.number}` `` / `` `programme-deliverable-${project.id}-${phase.number}-${d.key}` ``).
2. Extract that loop body into a small exported helper, e.g. `seedPhase2to5Links(project: { id: string })`, called both from `seedAndStartProgramme` (primary path, unchanged behavior otherwise) and from the new backfill call site — avoids duplicating the loop. Use `.upsert(row, { onConflict: "external_id", ignoreDuplicates: true })` instead of `.insert()` inside this helper so it's safe to call more than once for the same project (idempotent backfill, and resilient to any future double-invocation).
3. In `programme/route.ts`, after the existing `Promise.all` resolves, detect the broken state (`phasesRes.data` has a phase 2-5 row with `status` other than `not_started`, but `phaseTasklistsRes.data` is empty) and call `seedPhase2to5Links(projectRes.data)` inline, non-blocking (log-and-continue on error, matching this codebase's existing convention for this exact feature) — then re-read `tasklists` for the response so the same request returns the freshly-backfilled rows instead of requiring a second page load.
4. In `_onboarding-detail.tsx`, update line 1414's template string to match the new format, using the component's existing `project.id`.
5. Confirm `programme/route.ts:37`'s `.like("external_id", "programme-deliverable-%")` filter still matches (prefix unchanged) — no edit expected, just a read-through check.

## Acceptance Criteria

- [ ] Starting the programme on a second (and third, etc.) project no longer logs `23505 milestones_external_id_key` / `tasklists_external_id_key` errors.
- [ ] Each project's Phase 2-5 `milestones`/`tasklists` rows carry `external_id` values unique to that project (verify via `select external_id, project_id from milestones where external_id like 'programme-phase-%' order by external_id`).
- [ ] The previously-affected project (`edda8693-0b54-47f5-bd1a-e8f31389f6db`) shows populated Phase 2-5 deliverable→tasklist links after loading its Timeline once post-fix (backfill fires on read).
- [ ] Clicking a Phase 2-5 deliverable card on that project now navigates to `/v2/projects/[projectId]/tasks?tasklist=<id>` (not the bare `/tasks` fallback).
- [ ] `npx tsc --noEmit` passes clean.

## Verification

- `npx tsc --noEmit`
- Manually start the programme on two different test projects in sequence; confirm no `23505` errors in server logs on the second.
- Load the previously-broken project's Timeline in the browser, confirm the backfill runs (check server logs for the new helper's non-fatal error path — should be silent/absent) and Phase 2-5 cards deep-link correctly.
- Spot-check via Supabase SQL editor: no duplicate `external_id` values remain ambiguous across projects (each `programme-phase-*`/`programme-deliverable-*` value now embeds its owning `project_id`).

## Compatibility Touchpoints

- No new migration — fix is entirely in application code (`seed.ts`, `_onboarding-detail.tsx`, `programme/route.ts`).
- Existing rows written under the old unscoped format (belonging to whichever project happened to start first) are left as-is; they still resolve correctly today since the read query already filters by `project_id` first. No cleanup required for that project.
- `_docs/mcp-tools.md` — not applicable, no MCP tool surface touched.

## Implementation Notes

### What Changed
- `seedPhase2to5Links(project)` — new exported helper in `seed.ts`, extracted from `seedAndStartProgramme`'s former inline loop. Both `external_id` values are now scoped by `project.id`. Uses `.upsert(row, { onConflict: "external_id", ignoreDuplicates: true })` instead of `.insert()` for both `milestones` and `tasklists`, making repeat calls for the same project safe. Since `ignoreDuplicates` returns no row on a skipped conflict, added a fallback `select().maybeSingle()` lookup by `external_id` to resolve the milestone id for the subsequent `tasklists` upsert in that case (a racing concurrent call, or a future re-invocation after the project is already backfilled) — without it, a race would silently skip that phase's tasklists.
- `seedAndStartProgramme` now just calls `await seedPhase2to5Links(project)` in place of the old inline loop — behavior at programme-start time is unchanged (still non-fatal, still logs on failure).
- `GET /api/projects/[projectId]/programme/route.ts` — added a self-heal step: if any of the project's own `customer_phases` rows show phase 2-5 with `status !== "not_started"` (i.e. the programme reached that far) but the `tasklists` query returned zero rows, it calls `seedPhase2to5Links(projectRes.data)` and re-queries `tasklists` before responding, so an already-broken project (missing rows from the pre-fix collision bug) repairs itself the next time its Timeline is loaded, in the same request — no separate migration/script needed.
- `_onboarding-detail.tsx`'s `handleOpenPhaseDeliverable` (line ~1414) now builds its lookup key as `` `programme-deliverable-${project.id}-${phaseNumber}-${deliverableKey}` ``, matching the new `external_id` format returned by the API.

### Files Changed
- `src/lib/programme/seed.ts` - added `seedPhase2to5Links` (scoped, idempotent), replaced `seedAndStartProgramme`'s inline loop with a call to it
- `src/app/api/projects/[projectId]/programme/route.ts` - added self-heal backfill call + re-query when Phase 2-5 tasklists are missing but the programme reached that far
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` - updated the deliverable-card lookup key to include `project.id`, matching the new `external_id` format

### Deviations From Plan
- Plan step 2 said "log-and-continue... matching this codebase's existing convention" for the milestone upsert failure path; added one extra fallback lookup (existing-row `select`) not explicitly called out in the plan, needed because `ignoreDuplicates: true` returns no row on a skipped conflict — without it, any repeat call (a legitimate, expected case for the backfill helper) would incorrectly log a "failure" and skip that phase's tasklists even though the milestone already exists correctly. This directly serves the plan's own stated goal ("safe to call more than once") so it's a completion of the design, not a scope change.
- Everything else matches the plan as written (Implementation Steps 1, 3, 4, 5 applied as specified).

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing unrelated warnings in `_checklist-tab.tsx`, untouched by this change)
- Manual two-project-in-sequence test / browser Timeline reload test - SKIPPED (no local Supabase/browser session available in this session; deferred to `test` stage)
