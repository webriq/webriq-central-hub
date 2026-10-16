# 455: StackShift I programme — re-baseline kickoff dates to the PM tracker + PM-editable delay notes (per phase and per project)

**Created:** 2026-10-16
**Priority:** HIGH
**Type:** enhancement (data correction + feature)
**Recommended Tier:** deep (data correction on live programmes, RLS/permission change, migration)
**Status:** Approved

---

## Overview

The PM-maintained tracker (`Tracker vs. Hub_Status tracker as of Oct. 15.csv`, repo root) was compared against live Hub data on 2026-10-16. Two problems came out of that review:

1. **Programme start dates in the Hub do not match the PM-confirmed kickoff dates.** For example, Retail Sign Systems kicked off on Jun 23, but the Hub starts it on Aug 2, which puts the Hub 41 days behind on day count and days left. **The tracker is the source of truth** (checked and provided by the PMs), so the Hub must be re-baselined to it.
2. **There is no usable way for PMs to record *why* a phase or project is overdue.** Every live programme shows "No reason recorded yet." A per-phase note (`phase_programme_state.delay_note`) already exists, with an editor (`NoteCell`) in the Status Report row detail and the project Status Summary drawer. But it is **not writable by PMs**: the API route and the RLS write policy both allow only `admin`/`super_admin`/`marketing`. There is also no **project-level** note.

### Root cause of the date drift (must be fixed, or the re-baseline gets undone)

`PATCH /api/projects/[projectId]/programme/phase` ("manually tag to phase N") has an **already-started branch that backdates `programme_started_at`**, so that "today" lands inside the target phase's day window (`route.ts` ~L166–176). Every manual phase move on a running programme therefore rewrites the kickoff. Several projects share identical start timestamps (e.g. Retail Sign / Greydog Website / RCB on `2026-08-02 06:10`), which fits a batch of phase moves. If we re-baseline without changing this, the next phase move silently breaks the kickoff again.

### What re-baselining does and does not change

- **Changes:** `projects.programme_started_at`, and therefore the programme Day N, days left, and the materialised `start_date`/`due_date` on the project's `project_phases` + `project_deliverables` rows (via `materialiseDates`, the same logic as `rematerialiseProgrammeDates()`).
- **Does not change:** per-phase overdue figures. `status-report.ts` measures overdue from each phase's own `actual_start_date` → `actual_completed_date`/today, not from the kickoff. Phase `status`, `actual_start_date` and `actual_completed_date` are **not** touched by this task.

## Requirements

### Part A — Kickoff re-baseline (one-off, reviewable, not auto-applied)

- [ ] A dry-run script `_docs/task/455-kickoff-rebaseline/dry-run.ts` (run with `npx tsx --env-file=.env --tsconfig tsconfig.json`). It reads live data **read-only** with the service-role client and writes three files to `_docs/task/455-kickoff-rebaseline/out/` (git-ignored like other `_docs/task/*/out/`):
  - `plan.md`: per project, the current vs new `programme_started_at`, current vs new Day N / days left, and a count of phase/deliverable date rows that will change.
  - `apply.sql`: one transaction with an explicit `update projects set programme_started_at = …`, plus explicit `update project_phases/project_deliverables set start_date, due_date` for every row `materialiseDates()` would change. The SQL is generated from the same pure function, so it matches what `rematerialiseProgrammeDates()` would write.
  - `rollback.sql`: the current values for every row touched.
- [ ] Kickoff timestamps are written as **`<date>T12:00:00Z`**. That falls on the same calendar day in Manila (UTC+8) and US Eastern, so `currentDisplayDay()`'s local-midnight diffing gives Day 1 on the kickoff date regardless of server timezone.
- [ ] The script **refuses to run** (prints the reason) for any mapping whose project UUID/`project_id` is missing, soft-deleted, or has `programme_started_at = null`. Those cases are listed in `plan.md` as operator actions instead.
- [ ] The mapping is a typed constant in the script (`project_id` → kickoff date), seeded from the tracker:

| Tracker # | Account | Hub `project_id` | Hub start now | Kickoff (tracker) | Action |
|---|---|---|---|---|---|
| 01 | Retail Sign Systems | `DDF84B09-PROJ-02` | 2026-08-02 | 2026-06-23 | re-baseline |
| 03 | Saginaw CFC | `C30DE6A5-PROJ-03` | 2026-08-10 | 2026-07-23 | re-baseline |
| 05 | WMI Home Solutions | `09A80681-PROJ-02` | 2026-08-31 | 2026-08-17 | re-baseline |
| 06 | Veteran Roofing & Exteriors | `C74DEA31-PROJ-02` | 2026-06-28 | 2026-06-22 | re-baseline |
| 07 | Black Barn Dumpsters | `2CDA5C64-PROJ-02` | 2026-08-25 | 2026-08-14 | re-baseline |
| 08 | Greydog Security | `82ACEB0F-PROJ-02` (Website) | 2026-08-02 | 2026-06-29 | re-baseline (D1). `82ACEB0F-PROJ-03` (StackShift I Upgrade, started Jul 22) is **not** touched; it is listed in `plan.md` as a duplicate for the PM to resolve |
| 09 | Studio Belmont | `8978E416-PROJ-02` | 2026-09-22 | 2026-07-23 | re-baseline |
| 10 | RCB & Associates LLC | `5EBACF20-PROJ-01` | 2026-08-02 | 2026-07-08 | re-baseline |
| 12 | M&I Interiors | `D0A5D523-PROJ-04` | 2026-07-28 | 2026-07-14 | re-baseline |
| 13 | Royal Thumper | `FC6D83AB-PROJ-01` | 2026-08-06 | 2026-08-06 | none (matches) |
| 14 | Hello Homes GR | `D45CA759-PROJ-01` | 2026-08-06 | 2026-07-28 | re-baseline |
| 15 | AB Lekdetectie | `82159826-PROJ-01` | 2026-09-30 | 2026-09-30 | none (matches) |
| 16 | Maxton Manufacturing | `BD64C367-PROJ-01` | not started | 2026-10-08 | operator: set StackShift I classification + Start programme via UI, then re-run dry-run to re-baseline |
| 17 | Grand River Realty | — (no customer) | — | 2026-10-12 | operator: create via New Project intake, start programme, then add to mapping + re-run |

- [ ] The operator (not the agent) reviews `plan.md` and runs `apply.sql` in the Supabase SQL editor. The agent never applies it.

### Part B — Stop phase moves from overwriting the kickoff

- [ ] In `PATCH /api/projects/[projectId]/programme/phase`, the **already-started** branch no longer modifies `programme_started_at`. It still re-statuses phase rows as today. The **not-started** branch (first start at phase N) keeps its current behaviour: there is no PM kickoff to preserve yet, and the start is backdated so today sits in phase N.
- [ ] Same review for `.../programme/generic-phase/route.ts` (L70 backdates on an already-started project). Apply the same rule if that path is "already started".
- [ ] Before changing the backdate, inventory every consumer that derives *the current phase* from `programme_started_at`/Day N (e.g. `phaseAtDisplayDay()` in `calendar.ts`, `api/programme/reminders`, the onboarding list/detail views). Confirm each one reads phase `status` rather than the day window, or adjust it. Record the inventory in this doc's Implementation Notes.
- [ ] **"Kickoff date" editor (D3, approved)** on the project programme header, editable by admin/super_admin/pm (pm subject to the same membership gating as notes; others see it read-only). A new route `PATCH /api/projects/[projectId]/programme/kickoff` takes a `YYYY-MM-DD` date, stores it as `T12:00:00Z`, and calls `rematerialiseProgrammeDates()`. Phase status and actual dates are unchanged. It rejects a date in the future or a project whose programme hasn't started. The `projects` update uses `adminClient` after the role check, matching the existing phase route.

### Part C — Delay notes PMs can actually use

**Per-phase note (exists, needs opening up):**
- [ ] Allow `pm` to write `phase_programme_state.delay_note`, subject to the same membership gating as the Status Report read (`isRoleGatedByMembership()`: a pm can edit only projects with no `project_members` or where they are a member). Do **not** broaden the `phase_programme_state_write` RLS policy, because that would also open `wizard_data`/`is_manual_override`/`override_note` to PMs. Instead, the note route does its role + membership check with the user client, then writes **only** `delay_note` (+ audit columns) with `adminClient`. Document this as a deliberate write-side exception inline.
- [ ] Record who set the note and when: new nullable columns `phase_programme_state.delay_note_updated_at timestamptz` and `delay_note_updated_by uuid references auth.users`. Return them in the status-report payload (`delayNoteUpdatedAt`, `delayNoteUpdatedBy` as a display name) and show "— Name, Oct 16" under the note.
- [ ] `canEditNotes` in `GET /api/onboarding/projects/status-report` adds `pm` (per-project: include a `canEditNotes` flag per item, since a gated pm can edit only member projects).
- [ ] `NoteCell` UX: the edit pencil is currently `opacity-0 group-hover:opacity-100`, invisible on touch and easy to miss. Make it always visible when `canEdit`. When the phase is `overdue` and empty, show an explicit "Add reason" button instead of the italic "No reason recorded yet." Keep the existing save/cancel behaviour, add a visible error state on a failed save (today a non-OK response is silently ignored), and cap length at 1,000 chars.
- [ ] Show the phase note on the **programme phase view** of the project detail page (`_onboarding-detail.tsx` / `_generic-phase-view.tsx`) for the active phase, using the same `NoteCell`. It is currently visible only in the Status Report row detail and the Status Summary drawer.

**Project-level note (new):**
- [ ] Migration `177_programme_delay_notes.sql` (**written, not applied**, per the existing convention) adds:
  - `projects.delay_note text`, `projects.delay_note_updated_at timestamptz`, `projects.delay_note_updated_by uuid references auth.users`
  - `phase_programme_state.delay_note_updated_at`, `delay_note_updated_by` (above)
- [ ] `PATCH /api/projects/[projectId]/programme/note`: same roles and membership gating as the phase note, trims, `null` on empty, 1,000-char cap, writes only those three columns.
- [ ] Surface it:
  - Status Report table: a small note indicator in the collapsed row (icon + tooltip/first line), with the full editor at the top of the row detail, above the phase rows.
  - Status Summary drawer: the editor at the top, above the phase cards.
  - Project programme view header: the editor next to the programme Day N / days-left summary.
- [ ] Everything degrades before migration 177 lands: reads select the new columns defensively (fall back to null on PostgREST `42703`), and the project-note PATCH returns a clear 503 "pending migration" message rather than a 500.

## Out of Scope / Must-Not-Change

- Phase `status`, `actual_start_date`, `actual_completed_date` and skip flags. The tracker's **phase conflicts** (Veteran Roofing: Hub AI Visibility vs tracker Publish, with Publish wrongly *skipped*; Black Barn: Hub M&R vs tracker Onboard; RCB: Hub Publish vs tracker M&R) and the "skipped phases that carry start dates" are PM actions in the existing UI, listed in the hand-off, not changed here.
- Duplicate customers/projects (Greydog: 2 live programmes + a "Grey Dog Security Discrete" customer; "RCB & Associates" vs "RCB & Associates LLC"; "AB Lekdetectie" vs "Ablekdetectie"; Hello Homes "Content Site" spare project). They are listed for the operator, with no merging or deleting in this task. The exception is D1, which only picks which Greydog programme gets the kickoff.
- Creating Grand River Realty / starting Maxton by script. Use the normal intake + Start programme UI.
- `phase_programme_state_write` RLS policy (stays admin/super_admin/marketing).
- The status-report overdue/health maths in `status-report.ts`.
- `override_note` (manual phase-tag note): a separate field with a separate purpose.
- No `dark:` classes; follow the existing hand-rolled Status Report styling.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `_docs/task/455-kickoff-rebaseline/dry-run.ts` | Create | Read-only planner → `plan.md`, `apply.sql`, `rollback.sql` |
| `_docs/task/455-kickoff-rebaseline/README.md` | Create | Operator runbook (review → apply → verify → rollback; Maxton/Grand River steps) |
| `src/app/api/projects/[projectId]/programme/phase/route.ts` | Modify | Already-started branch keeps `programme_started_at` |
| `src/app/api/projects/[projectId]/programme/generic-phase/route.ts` | Modify (if applicable) | Same rule |
| `supabase/migrations/177_programme_delay_notes.sql` | Create | Project note columns + phase note audit columns |
| `src/types/database.ts` | Modify | New columns |
| `src/app/api/projects/[projectId]/programme/phases/[phaseNumber]/note/route.ts` | Modify | Add pm + membership gating, adminClient write of note-only columns, audit, cap |
| `src/app/api/projects/[projectId]/programme/note/route.ts` | Create | Project-level note PATCH |
| `src/app/api/projects/[projectId]/programme/kickoff/route.ts` | Create | Kickoff date PATCH + rematerialise (D3) |
| `src/lib/programme/store.ts` | Modify | `loadProgrammeSummaries` selects audit columns (42703-tolerant) |
| `src/lib/programme/status-report.ts` | Modify | `delayNoteUpdatedAt/By` on `PhaseDerived` |
| `src/app/api/onboarding/projects/status-report/route.ts` | Modify | Project note + audit fields, per-item `canEditNotes` incl. pm |
| `src/app/(hub)/projects/v2/status-report/_status-report-note-cell.tsx` | Modify | Visible edit, "Add reason", error state, attribution, generic endpoint prop so it serves both phase + project notes |
| `.../status-report/_status-report-types.ts`, `_status-report-table.tsx`, `_status-report-row-detail.tsx`, `_status-report-client.tsx` | Modify | Project note indicator + editor; per-item permission |
| `src/app/(hub)/projects/_shared/_status-report-tab.tsx` | Modify | Same wiring (shares the table) |
| `src/app/(hub)/projects/v2/[projectId]/_status-summary-drawer.tsx`, `_status-summary-phase-cards.tsx` | Modify | Project note at top; per-item permission |
| `src/app/(hub)/projects/v2/[projectId]/_onboarding-detail.tsx` / `_generic-phase-view.tsx` | Modify | Active-phase note + project note in programme header |
| `CLAUDE.md` | Modify | One bullet: delay notes (who can write, adminClient exception, kickoff no longer moved by phase tagging) |

## Code Context

### `src/app/api/projects/[projectId]/programme/phase/route.ts` (~L166) — the drift source
```ts
// Already started — backdate programme_started_at so "today" lands inside the target phase's
// day range (mirrors the not-started branch's own calculation), then re-status the phase rows.
const backdated = new Date();
backdated.setDate(backdated.getDate() - backdateOffsetDays);
await adminClient.from("projects").update({ programme_started_at: backdated.toISOString() }).eq("id", projectId);
```

### `src/lib/programme/store.ts` — re-materialisation (reuse its pure core in the dry run)
```ts
export async function rematerialiseProgrammeDates(client, projectId, programmeStartedAt) {
  const phases = await loadProgramme(client, projectId);
  const patches = materialiseDates({ programmeStartedAt, phases, deliverables: phases.flatMap((p) => p.deliverables) });
  // updates project_phases / project_deliverables start_date, due_date in batches of 25
}
```
`materialiseDates` lives in `src/lib/programme/programme-dates.ts`. The dry run calls it directly and emits SQL instead of updating.

### `src/app/api/projects/[projectId]/programme/phases/[phaseNumber]/note/route.ts` — current gate
```ts
const WRITE_ROLES = ["admin", "super_admin", "marketing"]; // pm/developer/hr read-only
...
await upsertPhaseState(supabase, phase.id, { delay_note: note }); // user client → RLS also blocks pm
```

### RLS (migration 160) — why pm can't write today
```sql
create policy phase_programme_state_write on phase_programme_state for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing'))
  with check (get_my_role() in ('admin', 'super_admin', 'marketing'));
```

### `_status-report-note-cell.tsx` — current UX
```tsx
{phase.delayNote ?? (phase.status === "overdue" ? "No reason recorded yet." : "—")}
{canEdit && <button className="… opacity-0 group-hover:opacity-100 …" aria-label="Edit delay note"><Pencil/></button>}
// save(): if (!res.ok) nothing happens — no error shown
```
Used by `_status-report-row-detail.tsx:75` and `[projectId]/_status-summary-phase-cards.tsx:107`.

### `status-report.ts` — overdue is per-phase actual dates, not kickoff
```ts
const usedDays = computeUsedDays(row?.actual_start_date ?? null, row?.actual_completed_date ?? null);
const daysOverdue = Math.max(0, (usedDays ?? 0) - allotedDays);
const currentProgrammeDay = currentDisplayDay(inputs.programmeStartedAt, totalProgrammeDays); // kickoff = Day 1
```

### Reference precedent for dry-run + SQL hand-off
`_docs/task/434-backfill/dry-run.ts` and `_docs/task/450-duplicate-cleanup/dry-run.ts` (plan + apply + rollback, never applied by the agent, `out/` git-ignored).

## Decisions (confirmed by user 2026-10-16)

- **D1 — Greydog:** re-baseline **`82ACEB0F-PROJ-02` (Website)** only. PROJ-03 is listed in `plan.md` as a duplicate for the PM to resolve.
- **D2 — Drift:** already-started phase tagging **stops** rewriting `programme_started_at`. Not-started first-start behaviour is unchanged.
- **D3 — Kickoff date editor:** **in scope**, editable by admin/super_admin/pm (pm membership-gated).
- **D4 — Note write access:** admin/super_admin/marketing (as today) **+ pm**. developer/hr are read-only.
- **D5 — PM gating (asked during implement):** follow task 291, so PMs are **not** membership-gated for notes or the kickoff editor (the same unrestricted access they have everywhere else). Supersedes the membership-gating wording in Part B/C above.

## Implementation Steps

1. Part B inventory: grep every consumer of `programme_started_at` / `currentDisplayDay` / `phaseAtDisplayDay` and record whether it relies on the backdate. Then change the already-started branches.
2. Write migration 177 + `database.ts` types.
3. Update the phase-note route (pm + gating + adminClient note-only write + audit + cap). Add the project-note route.
4. Extend `loadProgrammeSummaries` / `buildPhaseBreakdown` / status-report GET with audit + project note + per-item `canEditNotes` (42703-tolerant).
5. Generalise `NoteCell` (endpoint + value props) and wire it into the Status Report (collapsed indicator + row detail), the Status Summary drawer and the programme phase view.
6. Write `dry-run.ts` + README. Run it, review `plan.md` output in the hand-off, and confirm that `rollback.sql` restores the current values exactly.
7. `npx tsc --noEmit`, `pnpm lint`. Add a `CLAUDE.md` bullet.

## Acceptance Criteria

- [ ] The dry run produces `plan.md`/`apply.sql`/`rollback.sql` for the 10 re-baseline projects, skips the 2 matching ones, and lists Maxton/Grand River/Greydog-duplicate as operator actions.
- [ ] After the operator applies `apply.sql`, the Status Report shows Day N = (today − kickoff) + 1 for each account (e.g. Retail Sign Systems = Day 116 on Oct 16), and days left = 120 − Day N.
- [ ] After apply, each project's phase/deliverable `start_date`/`due_date` equals what `rematerialiseProgrammeDates()` would produce. A second dry run reports **0 changes**.
- [ ] `rollback.sql` restores the pre-apply values (verified by diffing a dry run after rollback against the first `plan.md`).
- [ ] Manually tagging an already-started project to another phase does **not** change `programme_started_at`.
- [ ] Editing the kickoff date in the programme header (admin/super_admin/member pm) updates Day N/days left and the phase/deliverable dates. developer/hr/non-member pm cannot edit it.
- [ ] A `pm` user can add/edit/clear a phase note and a project note on a project they're a member of (or an unrestricted project). They get 403 on a gated project they're not a member of. `developer`/`hr` remain read-only.
- [ ] A pm still cannot write `wizard_data`/`override_note`/`is_manual_override` (the RLS policy is unchanged).
- [ ] Notes show the author + date. An overdue phase with no note shows an "Add reason" button (to editors) or "No reason recorded yet" (to read-only users). A failed save shows an inline error.
- [ ] The project note is visible in the Status Report (collapsed indicator + row detail), the Status Summary drawer and the programme view header. The phase note is visible on the programme phase view.
- [ ] Before migration 177 is applied, every page still loads, and the project-note save returns a clear "pending migration" message.

## Verification

```bash
npx tsc --noEmit
pnpm lint
npx tsx --env-file=.env --tsconfig tsconfig.json _docs/task/455-kickoff-rebaseline/dry-run.ts   # read-only; inspect out/plan.md
```
Browser: log in as pm (member and non-member project), marketing, developer. Exercise the phase/project note on the Status Report, the drawer and the programme view. Tag a started project to another phase and confirm the kickoff is unchanged.

## Compatibility Touchpoints

- Migration 177 is **written, not applied**. The operator applies it, then `apply.sql`.
- `CLAUDE.md` gets a bullet: delay notes (pm write via note-only adminClient routes; audit columns), and that the kickoff is no longer moved by phase tagging.
- No MCP tool changes (`_docs/mcp-tools.md` untouched).

## Operator Hand-off (outside this task's code, from the Oct 15 tracker review)

- Phase conflicts to fix in the UI: Veteran Roofing (reopen Publish, which is wrongly marked skipped), Black Barn (back to Onboard / awaiting sign-off), RCB (back to M&R, un-skip).
- Duplicates to resolve: Greydog (PROJ-02 vs PROJ-03, plus the "Grey Dog Security Discrete" customer), RCB (`WRQ-CUST-CAA175BE` vs `WRQ-CUST-5EBACF20`), AB Lekdetectie (`WRQ-CUST-F250DE4B` "Ablekdetectie"), Hello Homes "Content Site" spare project.
- AB Lekdetectie Phase 1 has no assignee (the "Marketing" shown is only a placeholder).
- Tracker hygiene: day-count convention (the Hub uses kickoff = Day 1), plus stale "next" dates (Saginaw Aug 12, WMI Aug 12, Black Barn ~Aug 10).

## Implementation Notes

### What Changed
- **Part A:** a read-only dry run, `_docs/task/455-kickoff-rebaseline/dry-run.ts`, with a runbook `README.md`. It was run against live on 2026-10-16 and plans **10 re-baselines** (5 phase + 27 deliverable date rows each), finds **2 already matching** (Royal Thumper, AB Lekdetectie) and lists **3 operator actions** (Grand River, Maxton not started, Greydog PROJ-03 duplicate). Day-after values match the tracker (e.g. Retail Sign Day 116 on Oct 16). Each project block in `apply.sql` has a guard that aborts if its `programme_started_at` changed since the dry run. Nothing was applied.
- **Part B:** the already-started branch of `PATCH .../programme/phase` no longer backdates `programme_started_at` (and no longer re-materialises, since the start is unchanged). `.../generic-phase` backdates only on a first start. New `PATCH .../programme/kickoff` (admin/super_admin/pm) is surfaced as the Timeline **Kickoff** editor.
- **Part C:** the phase-note route opens to pm and records `delay_note_updated_at/_by` (adminClient, note-only columns, falls back without audit columns on 42703). New project-note route. The status-report GET returns `projectNote` + note authors + `canEditKickoff`. `NoteCell` is generalised to `DelayNoteEditor` with an always-visible edit button, "Add reason" on overdue, an inline error, a 1,000-char counter and author/date. The project note appears in the Status Report row detail (plus a note hint in the collapsed row), the Status Summary drawer, and the new `_programme-notes-bar.tsx` on the Timeline (kickoff + project note + active-phase note).
- Migration 177 (written, not applied): project note + audit columns, phase-note audit columns, length check.

### Part B inventory: consumers deriving the current phase from the day window
- `_onboarding-detail.tsx:811`, `_use-programme-progress.ts:52`, `_timeline-reminders.tsx:41`: all prefer the `active` phase row; the day window is only a fallback. No change.
- `api/programme/reminders`: calendar gates (Day 15/16/21/26…) are measured from the kickoff by design, and deduped by `notifyOnce`. A re-baseline moves the day count, so already-passed gates are not re-sent (equality checks only fire on the exact day). Phase 1 overdue notices for still-active Phase 1 projects (WMI, Studio Belmont) may fire once per deliverable, which is correct given the true kickoff. No change.
- `customers/_customers-index.tsx` `ProgrammeBadge`: used the day window **only**. Changed to prefer the active programme phase (`customers/page.tsx` now loads it).
- Status report: overdue comes from per-phase actual dates; Day N/days left come from the kickoff. No change.

### Files Changed
- `supabase/migrations/177_programme_delay_notes.sql`: new (not applied)
- `src/types/database.ts`: note/audit columns
- `src/lib/programme/note-rules.ts` (+ `__checks__/note-rules.check.ts`, `run.ts`): pure roles/validation/kickoff timestamp
- `src/lib/programme/delay-notes.ts`: project-note reads, author names, 42703 helper
- `src/lib/programme/store.ts`, `status-report.ts`: phase-note audit through `loadProgrammeSummaries` / `buildPhaseBreakdown`
- `src/lib/programme/__checks__/programme.check.ts`, `view-model.check.ts`: fixture columns
- `src/app/api/projects/[projectId]/programme/phase/route.ts`, `generic-phase/route.ts`: no backdate on started programmes
- `src/app/api/projects/[projectId]/programme/kickoff/route.ts`, `note/route.ts`: new
- `src/app/api/projects/[projectId]/programme/phases/[phaseNumber]/note/route.ts`: pm + audit + cap
- `src/app/api/onboarding/projects/status-report/route.ts`: project note, authors, flags
- `src/app/(hub)/projects/v2/status-report/*` (types, note-cell, table, row-detail, client), `projects/_shared/_status-report-tab.tsx`, `[projectId]/_status-summary-drawer.tsx`, `_status-summary-phase-cards.tsx`, `_onboarding-detail.tsx`, new `_programme-notes-bar.tsx`
- `src/app/(hub)/customers/page.tsx`, `_customers-index.tsx`: active-phase badge
- `_docs/task/455-kickoff-rebaseline/dry-run.ts`, `README.md`; `CLAUDE.md` bullet

### Deviations From Plan
- **PM gating dropped (D5, user-confirmed):** task 291 already made pm unrestricted, so notes and kickoff use role checks only.
- **Generic-engine view (`_generic-phase-view.tsx`) gets no note UI:** the status report and phase notes only cover the StackShift I programme engine (`project_phases` source `programme`). Generic projects have no `phase_programme_state` row to note against.
- **Per-item `canEditNotes` not needed:** with no pm gating, the response-level flag is exact.
- **Kickoff "future date" check uses UTC+14 "today",** so a PM whose local date is ahead of UTC can still pick their own today.
- **Known minor:** the Status Summary drawer fetches once per mount, so a note edited in the Timeline bar shows in the drawer after a page reload (and vice versa).

### Verification Run
- `npx tsc --noEmit`: PASS
- `pnpm lint`: PASS (0 errors; 3 pre-existing warnings in untouched onboarding-workspace files)
- `pnpm check:logic`: PASS (95/95, incl. 5 new note-rules checks)
- `npx tsx … dry-run.ts` (read-only, live): PASS; output reviewed above, not applied
- Browser acceptance (pm/marketing/developer note + kickoff flows): NOT RUN, left for the `test` stage

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. Typecheck, lint (0 errors) and `check:logic` (95/95) pass.
- Fixed during review: `localYmd()` in `_programme-notes-bar.tsx` took an ISO string and was called as `localYmd(new Date().toISOString())`. It now takes a `Date`.
- Accepted: `loadProgrammeSummaries` uses one `as unknown as PromiseLike<…>` cast. The select column list is chosen at runtime (with or without the migration-177 audit columns), so PostgREST's string-literal typing can't infer the row shape. The cast is local and the row type is declared explicitly (`StateNote`).
- Role checks are centralised in `note-rules.ts` (pure, covered by checks). Both note routes and the kickoff route write only their own columns with `adminClient`, after the role check, and say why inline. There is no debug logging; errors return explicit 4xx/5xx and show inline in the UI.
- Removed code is fully gone: the phase route's backdate, its `adminClient` import and `rematerialiseProgrammeDates` import. `backdateOffsetDays` is still used by the not-started branch.

### Deviations
- **Minor:** no PM membership gating (D5, user-confirmed; matches task 291).
- **Minor:** no note UI on the generic-engine phase view. Delay notes only exist for StackShift I programme phases (`phase_programme_state`).
- **Minor:** the Status Summary drawer caches its fetch per mount, so a note edited in the Timeline bar shows in the drawer after a reload.
- **Minor:** Customers list badge now prefers the active phase. This is an extra file touched, but it was required by Part B's own inventory step.

### Required Fixes
- None.
