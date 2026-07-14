# 145: Onboarding List — Stop Hiding Projects Once Phase 1 Is Done

**Created:** 2026-07-14
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

`/v2/onboarding` (`GET /api/onboarding/projects`) currently filters projects with
`.is("onboarding_visible_at", null)`. `onboarding_visible_at` is set the moment Phase 1
("Onboard", Day 1–15) is completed (`complete-phase/route.ts:59-67`), which hands the
project into the default PM/staff view. Because the onboarding list query excludes any
project with that column set, a project **disappears from the Onboarding page entirely**
as soon as Phase 1 finishes — even though the 120-day programme still has Phases 2–5
(Migrate & Rebrand, Publish, AI Visibility, Optimize) ahead of it, and this page is the
only place in the Hub that can view/track/edit those phases (`customer_phases` RLS
restricts read/write to `admin|super_admin|marketing` only — see migration
`060_onboarding_project_scoping.sql:99-111` — so PM/developer/hr never see phase 2-5 data
through any other surface).

The detail route (`[projectId]/page.tsx`) already has no such gate — it only checks role,
not `onboarding_visible_at` — so a marketing/admin/super_admin user could navigate to a
phase-1-done project directly by URL and see/edit it. The bug is isolated to the list
query and the list card's phase/day rendering, which hardcoded Phase-1-only assumptions.

This task removes the `onboarding_visible_at` filter from the list query so every project
started via Onboarding stays visible on this page for its entire 120-day journey — and,
per explicit product decision, **does not roll off even after all 5 phases complete**
(no filter is added for full-programme completion either).

## Requirements

- [ ] `GET /api/onboarding/projects` returns projects regardless of `onboarding_visible_at`
      (i.e. include Phase 1 in-progress, Phase 1 done/Phase 2+ in progress, and fully
      completed 120-day programmes) — remove the `.is("onboarding_visible_at", null)` filter.
- [ ] The list card's phase label stops hardcoding "Phase 1:" and instead shows the
      project's actual active phase name (`Phase {current_phase_number}: {current_phase_name}`),
      since projects in Phase 2–5 will now appear.
- [ ] The list card's day counter stops hardcoding `/15` and instead reflects the full
      120-day programme (`Day {current_day}/120`), matching the detail page's existing
      `getCurrentProgrammeDay` + `/120` convention (`_onboarding-detail.tsx:772`).
- [ ] Progress bar percentage is computed against the full 120-day programme
      (`current_day / 120`), not `/15`, again matching the detail page's existing
      `progressPct = Math.min(100, Math.round((currentDay / 120) * 100))` (`_onboarding-detail.tsx:772`).
- [ ] A project whose Phase 5 is completed still appears in the list (no new exclusion
      filter for full completion) and does not visually read as broken (100% progress bar,
      correct final phase name, no "Day 121/120" overflow — `current_day` is already
      clamped via `Math.min(120, getCurrentProgrammeDay(...))` server-side, keep that).
- [ ] No behavior change to who can create/edit projects, RLS, or the detail route —
      this is a read-list filter and card-rendering fix only.

## Out of Scope / Must-Not-Change

- Do not touch `onboarding_visible_at` semantics or when it gets set
  (`complete-phase/route.ts`) — it still correctly gates the **PM/staff default view**
  (`customers`, `projects` pages) until Phase 1 handover. Only the onboarding list's own
  filter changes.
- Do not change `DETAIL_ROLES` / role gating on `[projectId]/page.tsx` — already correct.
- Do not change `customer_phases` RLS (migration 060) — phase 2-5 tracking staying
  marketing/admin/super_admin-only is intentional per that migration's own comments, not
  something this task revisits.
- Do not add a "programme complete" status/badge or any new schema — out of scope per the
  "never roll off" decision; the existing `draft | scheduled | in_progress` status enum is
  left as-is (a fully completed programme still reports `in_progress` since
  `programme_started_at` is set — acceptable, no new status requested).
- Do not modify `_onboarding-detail.tsx` or the wizard — they already handle all 5 phases
  correctly; this task only fixes the list/card view.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/onboarding/projects/route.ts` | Modify | Remove `.is("onboarding_visible_at", null)` filter from the `GET` query |
| `src/app/v2/(hub)/onboarding/_onboarding-list.tsx` | Modify | Fix hardcoded "Phase 1:" label and `/15` day count on `ProjectCard` to use the actual phase number and full 120-day range |

## Code Context

### File: `src/app/api/onboarding/projects/route.ts` (current, lines 17-41)

```ts
// GET — role-conditional list of projects still gated behind the Phase 1 handover
// (onboarding_visible_at IS NULL). Marketing/admin/super_admin see the same shape as
// pm/developer/hr — this is a status-only list either way; the wizard/detail route is where
// the real access split happens (marketing|admin|super_admin only, see [projectId]/page.tsx).
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (!profile?.role || !STAFF_ROLES.includes(profile.role)) {
      return NextResponse.json({ error: "Not permitted to view onboarding projects" }, { status: 403 });
    }

    const { data: projects, error } = await supabase
      .from("projects")
      .select("id, name, customer_id, programme_started_at, scheduled_onboarding_start_at, customer_product_id, customers(company_name), customer_products(classification)")
      .is("onboarding_visible_at", null)   // <-- REMOVE this line + the .is() call chain
      .order("created_at", { ascending: false });
```

The `.is("onboarding_visible_at", null)` call needs removing so the query becomes:

```ts
    const { data: projects, error } = await supabase
      .from("projects")
      .select("id, name, customer_id, programme_started_at, scheduled_onboarding_start_at, customer_product_id, customers(company_name), customer_products(classification))
      .order("created_at", { ascending: false });
```

Update the leading comment (lines 17-20) to reflect the new behavior — it's no longer
"projects still gated behind the Phase 1 handover," it's "every project that has started
onboarding, for its full 120-day programme."

Note `current_day` is already computed as `Math.min(120, getCurrentProgrammeDay(...))`
(line 58) and `target_handover_date` is Phase-1-specific (`+14 days`, lines 59-63) —
leave `target_handover_date` as-is (it's specifically the Phase 1 handover target and is
only rendered in the card's "scheduled" branch, which doesn't apply to in-progress
Phase 2+ projects — no change needed there).

### File: `src/app/v2/(hub)/onboarding/_onboarding-list.tsx` (current, lines 60-71)

```tsx
      {item.current_day ? (
        <>
          <div className="flex items-center gap-2 mb-1.5">
            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full bg-blue-500 transition-[width] duration-300" style={{ width: `${item.progress_pct}%` }} />
            </div>
            <span className="text-[11px] text-slate-500 font-mono shrink-0">Day {item.current_day}/15</span>
          </div>
          <div className="text-[11.5px] text-slate-500">
            {item.current_phase_name ? `Phase 1: ${item.current_phase_name}` : "Onboarding"}
            {item.target_handover_date && <span className="text-slate-400"> · Handover ~{formatDate(item.target_handover_date)}</span>}
          </div>
        </>
      ) : ...
```

Change to:

```tsx
            <span className="text-[11px] text-slate-500 font-mono shrink-0">Day {item.current_day}/120</span>
          </div>
          <div className="text-[11.5px] text-slate-500">
            {item.current_phase_name
              ? `Phase ${item.current_phase_number}: ${item.current_phase_name}`
              : "Onboarding"}
```

`item.current_phase_number` is already present on `OnboardingProjectListItem` (line 16)
and already populated by the API (`route.ts:71`) — it's just unused in the card today.
Also gate the `Handover ~{date}` suffix to only render when `current_phase_number === 1`
(or omit the check for now — `target_handover_date` is only non-null when
`programme_started_at`/`scheduled_onboarding_start_at` is set, which is true for every
phase, so showing a Phase-1 handover date next to a Phase 3 project would be misleading).
Recommended: only render the handover suffix when `item.current_phase_number === 1`.

Server-side `progress_pct` (`route.ts:74`) must change from `(currentDay / 15) * 100` to
`(currentDay / 120) * 100` to match — this is the actual bug behind the progress bar,
listed under Proposed File Changes for `route.ts` even though it wasn't quoted above;
implementer must update both the day label divisor (client) and the `progress_pct`
divisor (server, `route.ts:74`) together or the bar and the day count will disagree.

## Implementation Steps

1. In `src/app/api/onboarding/projects/route.ts`:
   - Remove the `.is("onboarding_visible_at", null)` filter from the `GET` query.
   - Change `progress_pct` calc (line 74) from `(currentDay / 15) * 100` to `(currentDay / 120) * 100`.
   - Update the function's leading comment (lines 17-20) to describe the new scope.
2. In `src/app/v2/(hub)/onboarding/_onboarding-list.tsx`:
   - Change the day label from `Day {item.current_day}/15` to `Day {item.current_day}/120`.
   - Change the phase label from hardcoded `Phase 1: ${item.current_phase_name}` to
     `` `Phase ${item.current_phase_number}: ${item.current_phase_name}` ``.
   - Gate the "Handover ~{date}" suffix to only show when `item.current_phase_number === 1`.
3. Update the page subtitle copy at `src/app/v2/(hub)/onboarding/_onboarding-list.tsx:129-132`
   if it still reads as Phase-1-only (currently: "Phase 1 (Day 1–15) intake and progress —
   hidden from PM/staff view until handover" for editable roles) — reword to reflect that
   the page now tracks the full 120-day programme, not just Phase 1 intake.

## Acceptance Criteria

- [ ] A project that has completed Phase 1 (`onboarding_visible_at` set) still appears on
      `/v2/onboarding` for a marketing/admin/super_admin user.
- [ ] That project's card shows its actual current phase name/number (e.g. "Phase 2:
      Migrate & Rebrand"), not "Phase 1: ...".
- [ ] That project's card shows `Day N/120`, not `Day N/15`, and the progress bar reflects
      `N/120`.
- [ ] A project whose full 120-day programme is complete (Phase 5 `completed`) still
      appears in the list (no roll-off).
- [ ] Existing Phase-1-in-progress and scheduled/draft projects behave exactly as before
      (no regression to the `scheduled`/`draft` card branches, which are untouched).
- [ ] `pm`/`developer`/`hr` (`editable = false`) still see the same status-only cards, just
      now including Phase 2-5 projects too.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser: as a `marketing` or `admin` user, open `/v2/onboarding` and confirm a
project that already went through Phase 1 handover (has an active `customer_phases` row
for phase 2+) is listed with the correct phase name and `Day N/120` counter. If no such
project exists in the dev DB, complete Phase 1 on a test project via the wizard's sign-off
step first (`complete-phase` action), then reload the list.

## Compatibility Touchpoints

- None — no schema, route, or packaging changes. Purely a query filter removal + display
  fix confined to `src/app/api/onboarding/projects/route.ts` and
  `src/app/v2/(hub)/onboarding/_onboarding-list.tsx`.

## Implementation Notes

### What Changed
- Removed the `.is("onboarding_visible_at", null)` filter from `GET /api/onboarding/projects`
  so the query no longer excludes projects once Phase 1 hands over — every project that
  started onboarding now stays listed for its full 120-day programme, including after all
  5 phases complete (no roll-off, per product decision).
- Changed server-side `progress_pct` calc from `(currentDay / 15) * 100` to
  `(currentDay / 120) * 100` to match the full-programme day range (was previously correct
  only because the list was artificially limited to Phase 1's 15 days).
- Fixed the list card's hardcoded `"Phase 1: {name}"` label to
  `` `Phase ${current_phase_number}: ${name}` `` and the hardcoded `Day N/15` to `Day N/120`,
  matching the detail page's existing `/120` convention.
- Gated the "Handover ~{date}" suffix to only render when `current_phase_number === 1`,
  since `target_handover_date` is specifically the Phase 1 handover target and would be
  misleading next to a Phase 2-5 project.
- Reworded the editable-role page subtitle from Phase-1-only framing to reflect the page
  now tracks the full 120-day programme.

### Files Changed
- `src/app/api/onboarding/projects/route.ts` — removed the visibility filter, fixed
  `progress_pct` divisor, updated the `GET` handler's leading comment.
- `src/app/v2/(hub)/onboarding/_onboarding-list.tsx` — dynamic phase label, `/120` day
  count, phase-1-only handover suffix gate, updated subtitle copy.

### Deviations From Plan
- None.

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS
- Manual browser check — SKIPPED (no dev-DB project with a completed Phase 1 was
  available in this session to click through; the code path was verified by reading the
  detail page's existing `/120` + dynamic-phase pattern this change now mirrors, and by
  the type-check/lint passing against the full data flow. Recommend a manual pass during
  `test 145` once a Phase 1 handover can be exercised or seeded.)
