# 148: 120-Day Timeline — Real Day-Span Scheduling + Drag Resize/Move

**Created:** 2026-07-14
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Completed (2026-07-15)

---

## Overview

The horizontal Gantt (`src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx`,
`DeliverableCard`/`Swimlane`) renders each sub-phase/deliverable's day span from
`src/config/customer-phases.ts`'s static `PROGRAMME_PHASES` config. `DeliverableConfig`
already models a `dayStart`/`dayEnd` range (not a single day) — but per that file's own
comment (lines 6-9), **only Phase 1's 7 deliverables use a real range**; every deliverable in
Phases 2-5 has `dayStart === dayEnd` (e.g. `structure-cleanup: { dayStart: 24, dayEnd: 24 }`
— exactly the "Structure cleanup / Day 24" behavior flagged). This task (a) widens the
Phase 2-5 defaults to real spans and (b) adds the ability to drag-edit any deliverable's span
per-project directly on the Gantt.

Two structural facts drive the design:

1. **`PROGRAMME_PHASES` is static and shared by every customer** — it cannot hold per-project
   edits. A drag on one project's timeline must not change another project's default. This
   requires new DB columns to hold a per-project override, read on top of the static default.
2. **A `customer_deliverables` row already exists for every deliverable on every project from
   Day 1** (`phase/route.ts:73-80` inserts a full `PROGRAMME_PHASES.flatMap(...)` row set up
   front, not lazily per phase transition) — so an `UPDATE` (not upsert-with-insert-fallback)
   is always safe once a project has started its programme.

Write access to `customer_deliverables` is `admin | super_admin | marketing` only
(migration 070) — `pm`/`developer` have read-only SELECT. Drag-editing therefore follows that
same role split, independent of the existing `interactive` flag on `DeliverableCard`, which
only gates Phase-1 wizard-step navigation (`_onboarding-detail.tsx:450`:
`interactive = phase.number === 1 && role !== "developer"`) and is unrelated to schedule
editing.

## Requirements

- [ ] **Default spans (Phases 2-5):** widen every Phase 2-5 `DeliverableConfig` in
      `customer-phases.ts` from `dayStart === dayEnd` to a real multi-day span, keeping the
      existing single day as the new `dayEnd` (the documented "due" day) and deriving a
      `dayStart` that fills the gap since the previous deliverable in that phase without
      overlapping. Concrete proposed values (open for a quick Bert/marketing sign-off, but
      unblocks implementation — see Implementation Steps for the full table):
      - Phase 2: `tech-docs` 16–18, `migration-implementation` 16–23, `structure-cleanup`
        20–24, `branding-review` 25–26, `foundational-pages` 27–28, `internal-qa` 29
        (unchanged), `client-review-approval` 30 (unchanged).
      - Phase 3: `product-publishing` 36–40, `industry-publishing` 41–45,
        `location-publishing` 46–50, `buyer-education-content` 51–55, `publishing-report`
        56–60.
      - Phase 4: `updated-publishing-plan` 61–62, `gap-publishing` 63–70,
        `conversion-refinements` 71–80, `ai-visibility-tracking` 81–90.
      - Phase 5: `updated-publishing-plan` 91–92, `gap-publishing` 93–115,
        `next-90day-roadmap` 116–118, `qbr-presentation` 119–120.
      Phase 1 stays untouched (already a deliberate task-123 breakdown).
- [ ] **Per-project override storage:** a project's actual rendered span for a deliverable is
      `override ?? staticConfigDefault`. Edits persist per-project and never mutate the shared
      config.
- [ ] **Resize from the right edge** — dragging a card's right edge changes only `dayEnd`
      (extends/shrinks the span), `dayStart` unchanged.
- [ ] **Resize from the left edge** — dragging a card's left edge changes only `dayStart`
      (moves the start day), `dayEnd` unchanged.
- [ ] **Move the whole card** — dragging the card body (not an edge) shifts both `dayStart`
      and `dayEnd` together by the same delta, to a different date range.
- [ ] All three interactions snap to whole-day increments (`DAY_WIDTH = 80` px/day) and are
      clamped: `dayStart >= 1`, `dayEnd <= 120`, `dayStart <= dayEnd` (minimum 1-day span —
      a resize can't invert or zero out a card), and — since `Swimlane` renders one row per
      fixed phase — a deliverable cannot be dragged outside its own phase's
      `[phase.dayStart, phase.dayEnd]` bounds (moving a deliverable to a different phase
      entirely is out of scope; see below).
- [ ] Drag handles/interactions only render and only submit for `admin`/`super_admin`/
      `marketing` roles, matching `customer_deliverables`'s existing write RLS. `pm`/
      `developer` continue to see the Gantt read-only exactly as today.
- [ ] Change persists via a new `PATCH` endpoint immediately on drag-end (no separate "Save"
      step, consistent with the wizard's autosave-everywhere convention), with an optimistic
      local update that rolls back on request failure.
- [ ] Multi-deliverable overlap within a phase already renders as parallel tracks
      (`assignTracks`, `_onboarding-detail.tsx:120-134`) — dragging one card into another's
      day range must not crash or corrupt track assignment; it's acceptable (and expected) for
      `assignTracks` to reassign tracks and re-stack on the next render.

## Out of Scope / Must-Not-Change

- Do not change the 5 main **phase** boundaries (Day 1–15, 16–30, 31–60, 61–90, 91–120) —
  those are fixed per the source-of-truth QBR HTML and task 123's explicit decision; only
  sub-phase/deliverable-level spans are editable.
- Do not allow dragging a deliverable into a different phase's swimlane (cross-phase move) —
  clamp to the owning phase's day range instead. Reassigning which phase a deliverable
  belongs to is a config-level decision, not a per-project schedule edit.
- Do not change Phase 1's existing `dayStart`/`dayEnd` values or its wizard-step-open
  `interactive` gating — this task only adds *editing* capability to the display; Phase 1's
  cards can gain the same drag handles for consistency (their defaults are unaffected) but
  the click-to-open-wizard behavior on Phase 1 cards must keep working exactly as it does
  today (careful with pointer-event ownership between "click to open" and "drag to resize" on
  the same element — see Implementation Steps).
- Do not touch `customer_phases.actual_start_date`/`actual_completed_date` or the phase-jump
  API (`programme/phase/route.ts`) — those track real historical phase transitions, unrelated
  to the planned/default schedule this task edits.
- Do not introduce a new drag/DnD library. `@dnd-kit/core`/`sortable`/`utilities` are already
  a dependency but only used by the unrelated Projects kanban board
  (`_board-view.tsx`) and are built around sortable lists, not edge-resize-on-an-absolutely-
  positioned-element — a lightweight custom `onPointerDown`/`pointermove`/`pointerup`
  implementation matches this file's existing pattern (it already has no drag library and
  uses raw DOM refs/rects for its popover positioning) and avoids forcing dnd-kit's sensor
  model onto a resize use case it isn't built for. Flag this choice for confirmation during
  planning if a different approach is preferred.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/071_customer_deliverables_schedule_override.sql` | Create | Add nullable `day_start_override smallint`, `day_end_override smallint` to `customer_deliverables`, with a check constraint that both are null or `day_start_override <= day_end_override` |
| `src/config/customer-phases.ts` | Modify | Widen Phase 2-5 `DeliverableConfig` day spans per the table above |
| `src/app/api/projects/[projectId]/programme/deliverables/[deliverableKey]/schedule/route.ts` | Create | New `PATCH` endpoint — role-gated (`admin`/`super_admin`/`marketing`), validates and writes `day_start_override`/`day_end_override` |
| `src/types/database.ts` | Modify | Add the two new columns to `CustomerDeliverableRow` |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` | Modify | Merge overrides into each `DeliverableCard`'s effective `dayStart`/`dayEnd`; add drag-resize/move pointer handlers and role-gated handle UI; call the new schedule endpoint on drag-end |

## Code Context

### File: `src/config/customer-phases.ts` (current, line 58)

```ts
{ key: "structure-cleanup", name: "Structure cleanup", description: "URL architecture, redirects, forms, and navigation finalized.", dayStart: 24, dayEnd: 24, owner: "Dev" },
```

Becomes (per the table in Requirements):

```ts
{ key: "structure-cleanup", name: "Structure cleanup", description: "URL architecture, redirects, forms, and navigation finalized.", dayStart: 20, dayEnd: 24, owner: "Dev" },
```

Apply the same pattern to every other Phase 2-5 deliverable listed above.

### File: `.../deliverables/[deliverableKey]/route.ts` (existing sibling route, full file, status-only PATCH — mirror its shape)

```ts
const WRITE_ROLES = ["admin", "super_admin", "marketing"];
...
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ projectId: string; deliverableKey: string }> }) {
  ...
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (!profile?.role || !WRITE_ROLES.includes(profile.role)) {
    return NextResponse.json({ error: "Not permitted to update programme deliverables" }, { status: 403 });
  }
  ...
  const { data, error } = await supabase
    .from("customer_deliverables")
    .update({ status, completed_at: status === "done" ? new Date().toISOString() : null })
    .eq("project_id", projectId)
    .eq("phase_number", phaseNumber)
    .eq("deliverable_key", deliverableKey)
    .select()
    .single();
```

The new `schedule/route.ts` PATCH follows this exact shape (same auth/role/lookup pattern),
but validates `day_start`/`day_end` against `getPhaseByNumber(phaseNumber)`'s own
`dayStart`/`dayEnd` bounds (imported from `customer-phases.ts`, already used by the sibling
route for `getDeliverable`) and writes `{ day_start_override: dayStart, day_end_override: dayEnd }`.

### File: `_onboarding-detail.tsx` (current, lines 226-227, 451, 485-501)

```ts
const left = (d.dayStart - 1) * DAY_WIDTH;
const width = (d.dayEnd - d.dayStart + 1) * DAY_WIDTH - 4;
...
const tracks = assignTracks(phase.deliverables.map((d) => ({ dayStart: d.dayStart, dayEnd: d.dayEnd })));
...
{!collapsed && phase.deliverables.map((d, i) => {
  ...
  <DeliverableCard
    d={d}
    ...
```

`d` currently comes straight from the static `phase.deliverables` array — no per-project
override is merged in anywhere today. Build an override map from the already-fetched
`deliverables: CustomerDeliverableRow[]` state (`_onboarding-detail.tsx:580`, fetched via
`GET /api/projects/[projectId]/programme`, which already does
`supabase.from("customer_deliverables").select("*")...` — line 31 of that route — so no
fetch-side change is needed, only widening what's selected, which `select("*")` already
covers once the migration adds the columns). In `Swimlane`, compute an effective deliverable
list: `phase.deliverables.map((d) => ({ ...d, dayStart: override?.day_start_override ?? d.dayStart, dayEnd: override?.day_end_override ?? d.dayEnd }))`
and pass that into both `assignTracks` and `DeliverableCard`, keyed by looking up
`deliverableStatusMap`'s sibling override map on `d.key`.

## Implementation Steps

1. Write migration 071: `alter table customer_deliverables add column if not exists day_start_override smallint; add column if not exists day_end_override smallint;` plus a check constraint `(day_start_override is null and day_end_override is null) or (day_start_override is not null and day_end_override is not null and day_start_override <= day_end_override)`. No RLS changes needed — existing `customer_deliverables_marketing_*`/`customer_deliverables_pm_developer_read` policies already cover all columns.
2. Update `src/types/database.ts`'s `CustomerDeliverableRow` (and the generated `Database["public"]["Tables"]["customer_deliverables"]` shape) to include the two new nullable fields.
3. Update `customer-phases.ts` Phase 2-5 deliverable spans per the table above.
4. Create `schedule/route.ts`: role-gate (`admin`/`super_admin`/`marketing`), parse `{ phase_number, day_start, day_end }`, validate types/bounds and `day_start <= day_end`, clamp/reject against `getPhaseByNumber(phase_number)`'s own range, `.update({ day_start_override, day_end_override })` filtered by `project_id`/`phase_number`/`deliverable_key`, return the updated row.
5. In `_onboarding-detail.tsx`: build the override-merged effective deliverable list in `Swimlane` (or a `DeliverableCard`-level merge, implementer's call on where's cleanest given the existing `deliverableStatusMap` pattern at line 789).
6. Add a `canEditSchedule = ["admin", "super_admin", "marketing"].includes(role ?? "")` flag (computed once in `OnboardingDetail`, passed down to `Swimlane`/`DeliverableCard`).
7. In `DeliverableCard`, when `canEditSchedule`, render two thin (~6px) absolutely-positioned edge-handle `<div>`s inside the card (`cursor-ew-resize`) plus make the card body itself draggable (`cursor-grab`/`cursor-grabbing`) — all via `onPointerDown` + `e.currentTarget.setPointerCapture(e.pointerId)` + `onPointerMove`/`onPointerUp` on the handle/card itself (pointer capture keeps move/up events firing on that element even if the cursor leaves it, avoiding the need for `document`-level listeners). Track a local `dragState: { mode: "resize-left" | "resize-right" | "move"; startClientX: number; startDayStart: number; startDayEnd: number } | null`; on move, compute `deltaDays = Math.round((e.clientX - startClientX) / DAY_WIDTH)` and derive the new `dayStart`/`dayEnd` per mode, clamped to the phase bounds and to a minimum 1-day span; render the card at the live preview position during drag (local state, not yet persisted).
8. Since Phase 1 cards already have an `onClick` (`onOpenWizardStep`) on the card `<button>`, and this task adds drag to the card body too: on Phase 1, distinguish a click (no/negligible pointer movement) from a drag (movement past a small threshold, e.g. 4px) before deciding whether to fire `onOpenWizardStep` vs. treat it as a move-drag — a `pointerup` with total movement under the threshold fires the click behavior; over it, treat as a completed drag and call the schedule PATCH instead, suppressing the click.
9. On `pointerup` with an actual change, call the new `PATCH .../schedule` endpoint with the final `dayStart`/`dayEnd`; optimistically keep the dragged position, then reconcile with the response (or the next Supabase realtime `customer_deliverables` update — a subscription on that table already exists at `_onboarding-detail.tsx:645`); on request failure, revert to the pre-drag position and surface an inline error (mirroring the existing `businessFactsUploadError`-style local error state pattern used elsewhere in this module).

## Acceptance Criteria

- [ ] A fresh project's Phase 2-5 cards render as multi-day spans (not single-day pins),
      matching the widened `customer-phases.ts` defaults.
- [ ] As `admin`/`super_admin`/`marketing`, dragging a card's right edge changes only its due
      day; dragging its left edge changes only its start day; dragging its body moves the
      whole span; all three persist across a page reload.
- [ ] A drag cannot move/resize a deliverable outside its own phase's day range, cannot invert
      `dayStart`/`dayEnd`, and snaps to whole days.
- [ ] As `pm`/`developer`, no drag handles render and the Gantt behaves exactly as before this
      task (read-only).
- [ ] Phase 1 cards still open the wizard on a plain click; a drag on a Phase 1 card resizes/
      moves it instead of opening the wizard.
- [ ] A failed schedule PATCH (e.g. network error) reverts the card to its pre-drag position
      and shows an inline error, not a silently-lost edit.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser: as `admin` or `marketing`, open a project's Timeline, drag a Phase 2+ card's
right edge to extend it, reload the page, and confirm the new span persisted. Repeat for the
left edge and for a full-card move. Confirm a `pm` or `developer` session shows no drag
handles. Confirm dragging near a phase's day-range boundary clamps instead of spilling into
the next phase's swimlane.

## Compatibility Touchpoints

- New migration (`071_customer_deliverables_schedule_override.sql`) must be applied by the
  user before the new columns/route work — follow this repo's established pattern (user
  applies migrations manually; code should tolerate the columns being absent only in the
  sense that `select("*")` won't error pre-migration, but the schedule PATCH route will fail
  until it's applied).

## Implementation Notes

### What Changed
- Widened every Phase 2-5 `DeliverableConfig` day span in `customer-phases.ts` per the
  Requirements table (Phase 1 untouched); updated the file's header comment, which
  previously documented the now-superseded single-day-only behavior.
- Added migration 071: nullable `day_start_override`/`day_end_override` smallint columns on
  `customer_deliverables` with a check constraint (`both null` or `start <= end`). No RLS
  changes — migration 070's existing policies already cover all columns.
- Added `day_start_override`/`day_end_override` to `CustomerDeliverableRow` and the
  `customer_deliverables` Row/Insert/Update shapes in `database.ts`.
- Created `PATCH /api/projects/[projectId]/programme/deliverables/[deliverableKey]/schedule` —
  mirrors the sibling status-PATCH route's auth/role/lookup shape exactly (role-gated to
  `admin`/`super_admin`/`marketing`), validates `day_start`/`day_end` are integers with
  `day_start <= day_end`, and rejects values outside `getPhaseByNumber(phase_number)`'s own
  range before writing the override columns.
- `_onboarding-detail.tsx`: `Swimlane` now builds an effective deliverable list
  (`override ?? staticConfigDefault`, keyed by `deliverable_key` — the same keying convention
  already used by the pre-existing `deliverableStatusMap`) and feeds it into both
  `assignTracks` and `DeliverableCard`. Added a `canEditSchedule` flag in `OnboardingDetail`
  (`admin`/`super_admin`/`marketing`, independent of the existing `canManagePhases`) threaded
  through `Swimlane` to `DeliverableCard`. `DeliverableCard` gained a custom
  `onPointerDown`/`pointermove`/`pointerup` drag implementation (pointer capture, no new
  library, per the doc's Out-of-Scope note) with three modes — `resize-left` (~6px edge
  handle, changes `dayStart` only), `resize-right` (changes `dayEnd` only), and `move`
  (dragging the card body, shifts both by the same delta) — snapping to whole days and
  clamped to the deliverable's own phase's day range every frame, with a minimum 1-day span
  enforced on resize. On Phase 1 (where the card body already has a click-to-open-wizard
  handler), a 4px movement threshold distinguishes a click from a drag: movement past the
  threshold sets a `suppressClickRef` flag that swallows the subsequent synthetic `click`
  event so a real drag never also opens the wizard, and a plain click still does. On
  `pointerup` with an actual change, `handleScheduleChange` (in `OnboardingDetail`)
  optimistically updates local `deliverables` state, calls the new PATCH endpoint, and rolls
  back to the pre-drag state via the existing top-of-page `error` banner (reused rather than
  adding a second error-state pattern) if the request fails.

### Files Changed
- `supabase/migrations/071_customer_deliverables_schedule_override.sql` - new migration, not yet applied (see Compatibility Touchpoints)
- `src/config/customer-phases.ts` - widened Phase 2-5 day spans + updated header comment
- `src/types/database.ts` - added override columns to `customer_deliverables` Row/Insert/Update
- `src/app/api/projects/[projectId]/programme/deliverables/[deliverableKey]/schedule/route.ts` - new PATCH route
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` - override merge in `Swimlane`, `canEditSchedule` gate, drag-resize/move implementation in `DeliverableCard`, `handleScheduleChange` in `OnboardingDetail`

### Deviations From Plan
- None from the task doc's own proposed approach or day-span table. One judgment call within
  an area the doc left to the implementer: the effective-deliverable merge happens in
  `Swimlane` (one of the two locations the doc explicitly said was "implementer's call" per
  Implementation Step 5), keyed only by `deliverable_key` — this mirrors the pre-existing
  `deliverableStatusMap` convention exactly, including its known limitation that
  `deliverable_key` repeats across phases (`updated-publishing-plan`/`gap-publishing` appear
  in both Phase 4 and Phase 5), so an override on one would currently be misapplied to the
  other same-keyed deliverable in a different phase. This pre-existing ambiguity is not
  introduced by this task and fixing it (making the map phase-number-aware) was judged out of
  scope — flagging here since drag-editing makes the collision more likely to be hit in
  practice than the read-only status map was.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Manual/browser verification - SKIPPED (no live Supabase/browser environment available in
  this session; migration 071 was created but not applied, per this repo's established
  unattended-run convention)
