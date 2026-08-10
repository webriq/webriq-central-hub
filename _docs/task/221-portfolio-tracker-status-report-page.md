# 221: Portfolio Tracker — 120-Day Programme Status Report Page

**Created:** 2026-08-07
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

New staff-facing report page at `/v2/portfolio-tracker/status-report` that rolls up every project currently in the 120-day programme (Onboard → Migrate & Rebrand → Publish → AI Visibility → Optimize) into a single scannable table: current phase, status, days/dates, assignee, health, and delay notes for overdue phases.

This is a **reporting layer on top of an existing, mature data model** — it does not introduce a new phase/tracking system. `customer_phases`, `customer_deliverables`, `PROGRAMME_PHASES` (`src/config/customer-phases.ts`), and the `ok/warn/late` semantic chip vocabulary (`_final_design/guide/central-hub-design-system.md` §1, `Chip`/`PhaseChip` in `dashboard-shared.tsx`) already exist and are reused as-is. The only genuinely new pieces are: (1) deriving "Overdue" / health status from existing dates (nothing today computes this), and (2) a place to record *why* a phase is late.

## Requirements

- [ ] Table/report at `/v2/portfolio-tracker/status-report`, one row per project currently enrolled in the programme (`programme_started_at is not null`).
- [ ] Per project: Project Name, all 5 phases (Onboard, Migrate & Rebrand, Publish, AI Visibility, Optimize) with per-phase breakdown available (expand row — see Key Design Decisions).
- [ ] Status per phase: **Pending / In Progress / Completed / Overdue** (Overdue is derived, not a stored value).
- [ ] Days/dates per phase: static day range (e.g. "Day 1–15"), actual start date, actual/expected completion date, days overdue (if overdue), days remaining (if active and on time), and for the project's current phase, "Day N of programme".
- [ ] Assignee per phase: real person + role when a `phase_members` owner exists (format `"{full_name} ({Role Label})"`, e.g. "Bert (Marketing)"), else the static config owner label (e.g. "PM + Dev", "Erica + April").
- [ ] Health indicator per active/overdue phase: On track / At risk / Needs attention, using the design system's existing `ok/warn/late` tones — not a new color vocabulary.
- [ ] Notes field per phase, shown and editable (for permitted roles) explaining delay reasons — persisted, not just client-side.
- [ ] Search (project/company name), filter by health and by phase, sort by most-overdue-first (default) or name.
- [ ] Follows `_final_design/guide/central-hub-design-system.md` (Table §4, Chips §4, typography §2) — no new visual vocabulary invented.
- [ ] Every file respects `nextjs-file-length-best-practices.md` — split page/table/detail/types into separate files rather than one large client component.

## Out of Scope / Must-Not-Change

- Do not touch `customer_phases`/`customer_deliverables` write paths used by the onboarding wizard, workspace, or `/api/projects/[projectId]/programme/*` routes beyond adding the one new nullable column and one new note-write endpoint.
- Do not change `PROGRAMME_PHASES` static config (day ranges, owner labels, deliverable lists) — this task only *reads* it.
- Do not change `_onboarding-list.tsx` beyond adding a single header link/button to reach the new report (no restructuring of that file).
- Do not add pagination/`.range()` looping — expected project count is in the tens, matching the existing unpaginated `/api/onboarding/projects` pattern. Revisit only if that assumption changes.
- Do not build an editable phase-status changer here (jumping/completing phases) — that already exists in the onboarding workspace/detail pages. This report is status + notes only.
- Do not gate this page behind a new role table entry beyond mirroring `STAFF_ROLES` already used by `/api/onboarding/projects`.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/097_customer_phases_delay_note.sql` | Create | Adds nullable `delay_note text` to `customer_phases`. No RLS change — existing `customer_phases_marketing_update`/`customer_phases_pm_developer_read` policies (migration 070) already cover it column-agnostically. |
| `src/config/constants.ts` | Modify | Add `PORTFOLIO_TRACKER_STATUS_REPORT: "/v2/portfolio-tracker/status-report"` to `V2_ROUTES`. |
| `src/lib/programme/status-report.ts` | Create | Pure functions: derive per-phase status (`pending/in_progress/completed/overdue`), health (`on_track/at_risk/needs_attention`), days overdue/remaining, and resolve assignee display string. No DB access — takes plain data in, returns derived fields. Keeps the API route and UI components from duplicating this logic. |
| `src/app/api/onboarding/projects/status-report/route.ts` | Create | `GET` — aggregate report payload: every in-programme project + its 5 `customer_phases` rows + `customer_deliverables` (for the at-risk heuristic) + resolved `phase_members` owners. Role gate mirrors `/api/onboarding/projects` (`STAFF_ROLES`). |
| `src/app/api/projects/[projectId]/programme/phases/[phaseNumber]/note/route.ts` | Create | `PATCH` — updates `customer_phases.delay_note` for one project+phase. `WRITE_ROLES = ["admin","super_admin","marketing"]`, matching every other phase-write route. |
| `src/app/v2/(hub)/portfolio-tracker/status-report/page.tsx` | Create | Server component — auth guard + role fetch, mirrors `portfolio-tracker/page.tsx` exactly. |
| `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-client.tsx` | Create | Client shell — fetch, search/filter/sort state, header, renders the table. |
| `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-table.tsx` | Create | One row per project: name, 5-phase mini progress strip, current phase + status chip, days/dates, assignee, health chip, expand toggle. |
| `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-row-detail.tsx` | Create | Expanded per-project panel: all 5 phases as a sub-table (status/dates/assignee/health/notes), inline note editor for permitted roles. |
| `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-types.ts` | Create | Shared TS types (`ProjectStatusReportItem`, `PhaseStatusDetail`, `HealthTone`) used by the API route and every component above. |
| `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx` | Modify | Add one "Status report" ghost-button link (à la the existing Import/New Project buttons, lines ~299-314) pointing at the new route. Always visible (not gated by `canCreate`) since read access is broader than create access. |

## Code Context

### `src/config/customer-phases.ts` — the static source of truth (read, do not modify)
```ts
export const PROGRAMME_PHASES: PhaseConfig[] = [
  { number: 1, name: "Onboard", dayStart: 1, dayEnd: 15, owner: "Bert", deliverables: [...] },
  { number: 2, name: "Migrate & Rebrand", dayStart: 16, dayEnd: 30, owner: "PM + Dev", deliverables: [...] },
  { number: 3, name: "Publish", dayStart: 31, dayEnd: 60, owner: "Erica + April", deliverables: [...] },
  { number: 4, name: "AI Visibility", dayStart: 61, dayEnd: 90, owner: "April + Eri", deliverables: [...] },
  { number: 5, name: "Optimize", dayStart: 91, dayEnd: 120, owner: "PM + Strategy", deliverables: [...] },
];
export function getCurrentProgrammeDay(startedAt: string | Date): number { ... } // calendar-date diff, floor 1
export function getPhaseForDay(day: number): PhaseConfig { ... }
export function getPhaseByNumber(n: number): PhaseConfig { ... }
```

### `customer_phases` row shape (migration 059/060, `src/types/database.ts:1838`)
```ts
{
  id: string; customer_id: string; project_id: string; phase_number: number;
  status: "not_started" | "active" | "completed" | "skipped";
  actual_start_date: string | null; actual_completed_date: string | null;
  is_manual_override: boolean; override_note: string | null; // NOT the delay note — do not reuse
  wizard_data: Json; created_at: string; updated_at: string;
  delay_note: string | null; // NEW — this task's migration 097
}
```

### Design system tokens to reuse (`_final_design/guide/central-hub-design-system.md`)
```css
--ok:   #177E48;  --ok-bg:   #E3F5EA;   /* On track */
--warn: #8A5A00;  --warn-bg: #FFF3D6;   /* Due soon / At risk */
--late: #C0392B;  --late-bg: #FDE8E6;   /* Late / Overdue / Needs attention */
```
Phase hues (fixed, never repurpose): Onboard `#E2762F`/`#FFEFE3` · Migrate `#0063D6`/`#E5F1FF` · Publish `#6A48E0`/`#EFEAFD` · AI Visibility `#0B8A93`/`#E2F6F7` · Optimize `#177E48`/`#E3F5EA`.

### Reusable components — do not reinvent
`src/app/v2/(hub)/dashboard/_components/dashboard-shared.tsx`:
```ts
export function Chip({ tone, dot, children }: ChipProps) // tone: ok|warn|late|neutral|onboard|migrate|publish|ai|optimize
export const PHASE_TONE: Record<number, "onboard"|"migrate"|"publish"|"ai"|"optimize">;
export function PhaseChip({ phaseNumber, phaseName }): JSX
export function ProgrammeTrack({ currentDay, phaseNumber }): JSX // the signature 120-day pill track
```
Import path from the new `status-report/` folder: `../../dashboard/_components/dashboard-shared`.

### Existing aggregate-query pattern to model the new route on
`src/app/api/onboarding/projects/route.ts` (`GET`) already does almost the exact join this task needs — projects + `customer_phases` (active/completed) + `phase_members`/`project_members` resolved against `profiles` via `adminClient` (RLS gap workaround, documented inline there). The new `status-report/route.ts` extends this pattern to *all 5* phase rows per project (not just the active one) and adds `customer_deliverables` for the at-risk heuristic.

### Phase-write route pattern for the new note endpoint
`src/app/api/projects/[projectId]/programme/phases/[phaseNumber]/members/route.ts` shows the `parsePhaseNumber` guard + role-check shape to mirror for the new `note/route.ts` (simpler: no membership lookup needed, just `WRITE_ROLES.includes(profile.role)`).

### Role label map to reuse for assignee formatting
`src/app/v2/(hub)/_components/v2-hub-sidebar.tsx`:
```ts
const ROLE_LABEL: Record<string, string> = {
  admin: "Admin", pm: "PM", developer: "Developer", hr: "HR",
  client: "Client", super_admin: "Super Admin", marketing: "Marketing",
};
```
Either import if exported, or duplicate the 6-line map locally (page-scoped convention) if it isn't already exported — check before deciding.

### Header button insertion point
`src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx:299-314` — existing Import/New Project button pair; add a ghost-style `Link` to the new route alongside them (outside the `canCreate` conditional).

## Key Design Decisions (confirm during implementation, flag if wrong)

1. **One row per project, expand for full 5-phase detail** — not 5 rows per project. The requirement list reads as "current status of this project" (current phase's status/dates/assignee/health) plus full traceability into all 5 phases on demand. Matches the existing card-summarizing pattern in `_onboarding-list.tsx` and keeps the table scannable at a glance, consistent with the design system's Table spec (dense, data-rich).
2. **"Overdue" is derived, never stored.** A phase is overdue when its static `dayEnd` has passed (`programme day > dayEnd`) and it isn't `completed`/`skipped`. Computed in `status-report.ts`, not persisted — avoids a second source of truth alongside `customer_phases.status`.
3. **Health thresholds are a tunable constant, not hardcoded inline** — proposed defaults (confirm or adjust): 0 days overdue → on track; 1–3 days overdue → at risk; >3 days overdue → needs attention; additionally, an *active, not-yet-overdue* phase with ≤2 days remaining and <50% of its deliverables done → at risk (early warning). Only active/overdue phases get a health value; pending (future) and completed phases show a dash.
4. **`delay_note` is a new column, not a reuse of `override_note`.** `override_note` is semantically "why was this phase manually jumped to" (set by the phase-override PATCH route) — reusing it for "why is this late" would conflate two unrelated meanings on the same field.
5. **Write access to notes = `admin | super_admin | marketing`**, matching every existing `WRITE_ROLES` constant for phase-level writes (`phase/route.ts`, `deliverables/[key]/route.ts`, `complete-phase/route.ts`, etc.). PM/developer/HR see notes read-only, consistent with `canManagePhases` in `_onboarding-detail.tsx` already excluding pm/developer from phase management. Flag if PMs should actually be able to write their own phase's note — the request's "PM names for Phase 2" wording only establishes them as an *assignee display*, not necessarily a note-writer, but this is worth a second look since PMs are also core report consumers.
6. **Read access = `admin, super_admin, marketing, pm, developer, hr`** (`STAFF_ROLES`, identical set to `/api/onboarding/projects`). `client` role is redirected away, mirroring `portfolio-tracker/page.tsx`.
7. **Default view = in-programme, not-yet-fully-completed projects** (`status !== "completed"` by the existing `/api/onboarding/projects` convention: Phase 5 `completed`), with a filter toggle to include finished programmes. "All projects under the 120-day programme" is read as "currently enrolled", with completed programmes an opt-in view, not the default.
8. **Assignee for phases 2–5 falls back to the static config label** (e.g. "PM + Dev") when no `phase_members` owner row exists for that phase — which will be the common case today, since the codebase's own comments note only Phase 1 has real membership enforcement in practice. Don't treat an empty phase 2–5 assignee as a bug; it's expected until real per-phase assignment is adopted more broadly.

## Implementation Steps

1. Write and apply migration 097 (`delay_note` column).
2. Add `V2_ROUTES.PORTFOLIO_TRACKER_STATUS_REPORT`.
3. Build `src/lib/programme/status-report.ts` with pure derive functions + the tunable threshold constants; these are the easiest to reason about in isolation and everything else depends on them.
4. Build the `GET /api/onboarding/projects/status-report` route using the derive functions.
5. Build the `PATCH .../phases/[phaseNumber]/note` route.
6. Build `_status-report-types.ts`, then `page.tsx` → `_status-report-client.tsx` → `_status-report-table.tsx` → `_status-report-row-detail.tsx`, in that order (each depends on the previous).
7. Add the header link in `_onboarding-list.tsx`.
8. Update `_docs/mcp-tools.md`? No — skip, no MCP tool added.
9. `npx tsc --noEmit`; browser-test as admin/super_admin (full read/write), as pm or developer (read-only notes), and as client (redirected away).

## Acceptance Criteria

- [ ] `/v2/portfolio-tracker/status-report` loads for admin/super_admin/marketing/pm/developer/hr; redirects client to `/v2/dashboard`.
- [ ] Every in-programme project appears with correct current phase, status chip, and Day N/120.
- [ ] A phase past its `dayEnd` with no `actual_completed_date` shows "Overdue" with correct days-overdue count; an on-time active phase shows correct days-remaining.
- [ ] Assignee shows a real name + role label when a `phase_members` owner exists for that phase, else the static config owner label.
- [ ] Health chip renders using only `ok/warn/late` tones (no new colors), matching the design system.
- [ ] Notes are persisted (reload the page, note is still there) and only editable by admin/super_admin/marketing.
- [ ] Search, health filter, phase filter, and default-overdue-first sort all work.
- [ ] No file in the feature exceeds ~350-400 lines; each has a single clear responsibility.
- [ ] `npx tsc --noEmit` passes with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manual: /v2/portfolio-tracker/status-report as admin, pm, and client roles
```

## Compatibility Touchpoints

- New migration only additive (`add column if not exists`) — safe to run against existing data, no backfill needed (`delay_note` defaults to `null`).
- No change to any existing API contract — new routes only, existing `/api/projects/[projectId]/programme/*` and `/api/onboarding/projects` responses are untouched.
- No new env vars, no packaging/docs/adapter surface affected.

## Implementation Notes

### What Changed
- Added `/v2/portfolio-tracker/status-report` — a table of every project enrolled in the 120-day programme, one row per project (name, 5-phase mini strip, current phase + status, days/dates, assignee, health), expandable to a full 5-phase breakdown with per-phase notes.
- All "Overdue"/health/days-remaining/days-overdue values are derived at read time from `customer_phases` + the static `PROGRAMME_PHASES` config — nothing new is stored except the delay-reason text itself.
- Added `customer_phases.delay_note` (migration 097) and a `PATCH` endpoint to edit it, gated to `admin/super_admin/marketing` to match every other phase-write route's `WRITE_ROLES` convention; `pm/developer/hr` see notes read-only.
- Added a "Status Report" link in the Portfolio Tracker list header, visible to everyone who can view the list (not just `canCreate` roles).

### Files Changed
- `supabase/migrations/097_customer_phases_delay_note.sql` - new nullable `delay_note` column on `customer_phases`
- `src/types/database.ts` - added `delay_note` to the `customer_phases` Row/Insert/Update types to match the new migration
- `src/config/constants.ts` - added `V2_ROUTES.PORTFOLIO_TRACKER_STATUS_REPORT`
- `src/lib/programme/status-report.ts` - new pure derive module (status/health/days/assignee logic), shared by the API route and every UI component
- `src/app/api/onboarding/projects/status-report/route.ts` - new `GET`, aggregate report payload
- `src/app/api/projects/[projectId]/programme/phases/[phaseNumber]/note/route.ts` - new `PATCH`, saves `delay_note`
- `src/app/v2/(hub)/portfolio-tracker/status-report/page.tsx` - new server component (auth guard, mirrors `portfolio-tracker/page.tsx`)
- `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-types.ts` - shared payload types + label maps
- `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-client.tsx` - client shell (fetch, search/filter/sort state, header)
- `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-table.tsx` - collapsed-row table
- `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-row-detail.tsx` - expanded 5-phase breakdown + inline note editor
- `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx` - added the "Status Report" header link (moved the Import/New Project buttons inside a nested `canCreate` fragment so the new link can sit alongside them, always visible)

### Deviations From Plan
- The GET route does **not** import `ProjectStatusReportItem` from the UI-side `_status-report-types.ts` as the original file plan implied ("used by the API route and every component above"). Checked `/api/onboarding/projects/route.ts` first — its established convention is to return plain object literals structurally matching the UI's list-item type without ever importing it (API layer doesn't depend on `app/` route-group UI files). Followed that precedent instead: the API route has no type import from the UI folder, and `_status-report-types.ts` remains the client-side contract the fetch response is cast to. No functional difference, just avoids a layering violation the plan's phrasing would have introduced.
- Fixed one thing not called out in the plan: the table's per-project `.map()` originally used a shorthand `<>...</>` fragment with `key` misplaced on the inner `<tr>` instead of the fragment itself (shorthand fragments can't take a `key` prop at all). Switched to `<Fragment key={project.id}>` from `"react"`. Caught before commit, not a runtime bug that shipped.
- One ESLint warning surfaced and was fixed: a ternary used as a bare statement (`no-unused-expressions`) in the row-expand toggle — rewritten as an `if`/`else`.
- The `impeccable` design-quality hook flagged literal `text-[11px]`/`text-[12px]` sizes across every new file as "outside the DESIGN.md ramp." Left unchanged: these are the exact class strings copied from `_onboarding-list.tsx`'s own filter pills, pagination controls, and buttons (already shipped, pre-existing in that file before this task touched it), and DESIGN.md's own Table/Mono-data specs call for `11–12px` cells and `9–11px` mono values. Treated as false positives from the hook's literal-ramp matching, not a real deviation — flagging here per the hook's instructions rather than silently dismissing it, since no explicit user confirmation was sought for a suppression.

### Verification Run
- `npx tsc --noEmit` - PASS (0 errors)
- `pnpm lint` - PASS (0 errors; 2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`, untouched by this task)
- `pnpm dev` smoke test - PASS: server boots clean under Turbopack; `/v2/portfolio-tracker/status-report` returns 307 (redirect to sign-in) and `/api/onboarding/projects/status-report` returns 401 when unauthenticated, both expected with no session cookie; no compile or runtime errors in the dev log.
- Full role-based browser walkthrough (admin/super_admin/marketing full read+write, pm/developer/hr read-only notes, client redirected away; overdue/health computation against real seeded data) - SKIPPED (no login credentials for the different roles available in this environment, and migration 097 is not yet applied to any database — see below). This needs a manual pass before shipping.
- Migration 097 - **not yet applied**. Matches this repo's established pattern (confirmed by task 092's Implementation Notes and by checking this session: no local Supabase CLI/Docker setup, `supabase status` fails with no daemon) — migrations are written and left for the user to run manually against the Supabase project (SQL editor or `supabase db push` from a machine with Docker/CLI access). **This one blocks the whole feature, not just note-editing**: the status-report `GET` route explicitly selects `delay_note` from `customer_phases`, so until migration 097 runs, that query will fail with a Postgres "column does not exist" error and the report page will show its error/retry state for every viewer. Apply the migration before testing or shipping this page.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Read all 11 changed/new files in full. Found and fixed two real dead-code issues that ESLint doesn't catch on exports: `StatusReportResponse` (defined in `_status-report-types.ts`, never imported anywhere) was wired into `_status-report-client.tsx`'s fetch handler instead of left unused, since it also buys real type safety there; `PHASE_COUNT` and the re-exported `PHASE_TONE` at the bottom of `_status-report-table.tsx` were dead exports nothing imported — removed, along with the now-unused `PROGRAMME_PHASES` import that only existed to compute `PHASE_COUNT`.
- Verified the new `Link` construction in `_status-report-table.tsx` (`project.projectId ?? project.id`) matches the codebase's one established routing convention for this exact route (`item.project_id ?? item.id` in `_onboarding-list.tsx:185`) — `/v2/portfolio-tracker/[projectId]` is one of the two documented exceptions where the URL segment is the display `project_id`, not the UUID, so this had to be checked rather than assumed.
- Confirmed `derivePhaseStatus`/`buildPhaseBreakdown` (`src/lib/programme/status-report.ts`) behave correctly under the "current phase is status-driven, not day-math-driven" model this codebase documents elsewhere (migration 059's own comment): a phase whose calendar window has passed while an earlier phase is still `active` in the DB correctly reports as `overdue` on its own, while `currentPhaseOf` still headlines the earlier, still-active phase as "current" for the collapsed row — matches the intended design, not an oversight.
- No secrets, no leftover debug logging (only `console.error` on actual error paths, matching existing route conventions), no `any` escape hatches, no deep nesting beyond ordinary JSX ternaries already idiomatic in this codebase.
- Re-ran `npx tsc --noEmit` and `pnpm lint` after the dead-code fixes — both still clean (0 errors; the same 2 pre-existing, unrelated warnings in `_checklist-tab.tsx`).

### Deviations
- **Minor** — `STATUS_LABEL` includes a 5th "Skipped" value beyond the four the requirements list (Pending/In Progress/Completed/Overdue). Necessary for correctness: `customer_phases.status` can genuinely be `skipped` (set by the existing phase-override flow), and folding it into "Pending" would misreport a deliberately-bypassed phase as one that's merely late to start. Rendered with the same neutral, no-dot chip as Pending so it doesn't visually compete with the four requested states. Documented here since it wasn't called out as a named "Key Design Decision" during planning.
- **Minor** — the two dead-code removals and the `StatusReportResponse` wiring above were fixed during this quality gate pass itself (not shipped and then caught later). No functional change, no scope change.
- No Medium or Major deviations. All Out-of-Scope boundaries from the task doc were checked against the actual diffs and held: no existing phase-write routes were touched, `PROGRAMME_PHASES` was only read, `_onboarding-list.tsx`'s change is confined to the button row, no pagination was added, no phase-status-changing UI was built, and read/write role sets match `STAFF_ROLES`/`WRITE_ROLES` exactly as planned.

### Required Fixes
None.

## Follow-up Amendment (same session, post quality-gate): Used/Allotted Days, Overdue Column, Days-Left, Avatar Assignees

Requested after the quality gate above had already passed. Implemented directly as a continuation of this task rather than a new one, since it builds on the same derive module and components.

### What Changed
- **Overdue is now measured per phase against actual days used, not the static calendar window.** Previously a phase was "overdue" once the programme's absolute day count passed its static `dayEnd`, even if an *earlier* phase was the one that actually ran long. That penalized a phase for someone else's delay. Now: `usedDays` = `actual_start_date` → (`actual_completed_date` ?? today), inclusive; `allotedDays` = the phase's static span (`dayEnd - dayStart + 1`); a phase is only "overdue" once it's actually open *and* `usedDays > allotedDays`. A phase that hasn't started yet is "Pending" regardless of how far behind an earlier phase has pushed the calendar — its own clock hasn't started. This also means a phase can finish under budget (e.g. Onboard done in 10 of its 15 allotted days) as well as over, which is what "Used/Allotted Days" now surfaces directly.
- `daysOverdue` is now computed independent of `status` — a **completed** phase that took longer than its allotment still reports the overage (e.g. "5d" in the new Overdue column) even though its Status chip correctly still says "Completed", not "Overdue". Status = lifecycle state; Overdue column = a retroactive budget measure.
- Added a project-level `programmeDaysLeft` (`120 - currentProgrammeDay`, floored at 0) — a new "Days left" column in the main table, showing "Complete" once Phase 5 is done.
- Assignee changed from a plain text string to a real avatar stack (colors, tooltip, `framer-motion` hover-lift) when the phase has one or more `phase_members` — the API now fetches *all* members per phase (not just `is_owner = true`), owner sorted first. When a phase has no real assignee yet, shows an italic, muted placeholder using a new team-label vocabulary specific to this report (Onboard = "Marketing", Migrate & Rebrand = "PM + Dev", Publish = "PM + SEO", AI Visibility = "PM + SEO", Optimize = "PM + Dev") — deliberately different from `PROGRAMME_PHASES[n].owner` (which holds illustrative example names like "Bert"/"Erica + April" used elsewhere in the app, not generic role labels).

### Files Changed
- `src/lib/programme/status-report.ts` - rewrote the overdue/health derivation around used-vs-allotted days instead of calendar-vs-static-window; added `computeUsedDays`, `TOTAL_PROGRAMME_DAYS`, `programmeDaysLeft()`, `ASSIGNEE_PLACEHOLDER`; `PhaseDerived` gained `allotedDays`/`usedDays`/`assigneeMembers`/`assigneePlaceholder`, lost `configOwner`/`assignee` (string) and `dayWithinPhase` (superseded by `usedDays`); `resolvePhaseAssignee` removed (no longer needed — assignee display is now component-side, not a formatted string)
- `src/app/api/onboarding/projects/status-report/route.ts` - `phase_members` query no longer filters to `is_owner = true`; builds a `PhaseAssigneeMember[]` per phase (owner-first sort) instead of a single override; adds `programmeDaysLeft` to each returned project
- `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-types.ts` - added `programmeDaysLeft` to `ProjectStatusReportItem`; re-exports `PhaseAssigneeMember`
- `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-assignee-cell.tsx` - new file, `AssigneeCell` (avatar stack + tooltip + hover animation, or italic placeholder) — duplicates `_onboarding-list.tsx`'s `AvatarStack`/`AvatarTip` pattern locally rather than importing, matching that file's own stated convention (unexported, page-scoped, otherwise-unrelated feature)
- `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-table.tsx` - added Used/Allotted, Overdue, and Days-left columns; Assignee cell now renders `AssigneeCell`; widened `min-w` for the extra columns
- `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-row-detail.tsx` - same column additions in the per-phase breakdown table; Assignee cell now renders `AssigneeCell`

### Deviations From Plan
- None beyond what's inherent to the request itself — this redefines "overdue" from the original implementation, which is exactly what was asked for (the original calendar-window model was this task's own earlier design choice, not a fixed external requirement).

### Verification Run
- `npx tsc --noEmit` - PASS (0 errors)
- `pnpm lint` - PASS (0 errors; same 2 pre-existing, unrelated warnings)
- `pnpm dev` smoke test - PASS: page/API respond 307/401 unauthenticated, no compile errors
- Full role-based browser walkthrough and real-data validation of the used/allotted math - still SKIPPED, same reasons as before (no credentials in this environment; migration 097 still not applied). **Worth a deliberate manual check once testable**: seed or find a project where an earlier phase overran its allotment while a later phase started and finished within its own budget, and confirm the later phase does *not* inherit the earlier phase's overdue flag.

---

## Follow-up Amendment 2: Fold Overdue Into Used/Allotted, Completed-Only Date Column, Early-Completion Health (Planned)

Requested in a new session, after Follow-up Amendment 1 above had already shipped to this same page. Written as a task-planning addendum rather than a new task ID — it edits the same lib module and the same three components Amendment 1 touched, on a page that hasn't shipped past "Testing" yet.

**Recommended Tier:** balanced — five interdependent files (one lib signature change, one broadened union type touching three exhaustive `Record`s, three components), low architectural risk, no new patterns.

### Requirements

- [ ] Row-detail "Completed / due" column header becomes **"Completed"**. Its cell shows the actual completion date only when the phase `status === "completed"`; every other status (`pending`, `in_progress`, `overdue`, `skipped`) shows `"—"` instead of the current static `Day {dayStart}–{dayEnd}` range.
- [ ] The standalone **Overdue** column is removed from both the main table (`_status-report-table.tsx`) and the row-detail sub-table (`_status-report-row-detail.tsx`).
- [ ] Its information moves into the **Used/Alloted** cell as a single combined string + color, replacing the current plain `{usedDays}/{allotedDays}d`:
  - `overdue` status → red: `"{usedDays}/{allotedDays}d ({daysOverdue}d overdue)"`
  - `in_progress` status (not overdue) → blue: `"{usedDays}/{allotedDays}d ({daysRemaining}d remaining)"`
  - `completed` status, finished **within** its allotment (`usedDays < allotedDays`) → green: `"{usedDays}/{allotedDays}d ({allotedDays - usedDays}d ahead)"` — see Key Design Decisions for the "ahead" term choice.
  - `completed` status but finished **over** its allotment (`daysOverdue > 0`, i.e. still `status === "completed"` per migration 059's status-driven model) → red, same `"(...d overdue)"` form as the overdue case, preserving the existing "a completed phase can still report an overage" behavior from Amendment 1.
  - `completed` status finished **exactly on** the allotment, or `pending`/`skipped` → plain, no parenthetical, neutral gray (matches current styling).
- [ ] A new **health** state for a phase that completed early: green-colored, using the design system's existing `ok` tone (no new color). Only applies when `status === "completed" && usedDays < allotedDays` — a phase completed exactly on time or late keeps today's behavior (late is already visible via the red Used/Allotted text, not a separate health flag; that stays out of scope here).
- [ ] Everywhere `HealthTone`/`HEALTH_LABEL`/`HEALTH_TONE`/`HEALTH_RANK`/`HEALTH_FILTERS` currently enumerate the 3 existing values (`on_track | at_risk | needs_attention`), add the 4th (`ahead_of_schedule`) so it doesn't silently fall through as unhandled — TypeScript's exhaustive `Record<Exclude<HealthTone, null>, ...>` types will fail to compile until every one is updated, which is the mechanical way to confirm none are missed.

### Out of Scope / Must-Not-Change

- Do not change how `daysOverdue`/`daysRemaining` are computed (`buildPhaseBreakdown` in `status-report.ts`) — only how they're *displayed* and how health is derived from them.
- Do not add a health flag for a completed-but-late phase — the request only asks for the early-completion (green) case; late-completed stays healthless (`—`), consistent with today.
- Do not change the "worst health across all phases" rollup *algorithm* (`rollupHealth`) — only extend its rank table so the new value participates without becoming spuriously "worst." A project where every phase is `on_track`/`ahead_of_schedule` will now show a green chip instead of a dash where it previously had no active/overdue phase to report on — this is an accepted natural consequence of one shared `health` field feeding both the per-phase and project-level display, not a separate feature.
- Do not touch `_status-report-client.tsx`'s sort-by-overdue logic (`currentPhase.daysOverdue`) — unaffected by the column removal.
- Do not touch the migration, API route's data shape, or note-editing flow — this is a display-layer change on fields the API already returns.

### Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/programme/status-report.ts` | Modify | Widen `HealthTone` to include `"ahead_of_schedule"`; add it to `HEALTH_RANK`; extend `derivePhaseHealth` to accept an early-completion signal and return the new tone; update its one call site in `buildPhaseBreakdown` to compute and pass that signal. |
| `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-types.ts` | Modify | Add `HEALTH_LABEL.ahead_of_schedule`; add a new exported `formatUsedAlloted(phase: PhaseDerived): { text: string; className: string }` helper (UI-facing formatting, same home as `HEALTH_LABEL`/`STATUS_LABEL`) implementing the combined text+color rules above — shared by both table components so the logic isn't duplicated. |
| `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-table.tsx` | Modify | Remove the "Overdue" `<th>`/`<td>`; Used/Alloted `<td>` renders `formatUsedAlloted(cp)`; add `ahead_of_schedule: "ok"` to the local `HEALTH_TONE` map; fix expanded-row `colSpan` from `9` to `8`; trim `min-w-[1180px]` down modestly to reflect one fewer column (exact value non-critical, verify visually). |
| `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-row-detail.tsx` | Modify | Header `"Completed / due"` → `"Completed"`; its cell becomes `ph.status === "completed" ? formatDate(...) : "—"`; remove the "Overdue" `<th>`/`<td>`; Used/Alloted `<td>` renders `formatUsedAlloted(ph)`; add `ahead_of_schedule: "ok"` to the local `HEALTH_TONE` map; trim `min-w-[1020px]` similarly. |
| `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-client.tsx` | Modify | Add `"ahead_of_schedule"` to the `HEALTH_FILTERS` array (after `"on_track"`) so it's filterable like the other three tones. |

### Code Context

#### `src/lib/programme/status-report.ts` — current shape being extended (already read in full above)
```ts
export type HealthTone = "on_track" | "at_risk" | "needs_attention" | null;
// -> "on_track" | "at_risk" | "needs_attention" | "ahead_of_schedule" | null

export function derivePhaseHealth(
  status: PhaseStatus, daysOverdue: number, daysRemaining: number | null, deliverableRatio: number | null
): HealthTone {
  if (status === "overdue") { ... }
  if (status === "in_progress") { ... }
  return null; // <- completed/skipped/pending currently always null
}
// New: add an `isEarlyCompletion: boolean` param (or usedDays/allotedDays, caller's choice) and:
//   if (status === "completed" && isEarlyCompletion) return "ahead_of_schedule";

const HEALTH_RANK: Record<Exclude<HealthTone, null>, number> = { on_track: 0, at_risk: 1, needs_attention: 2 };
// -> add ahead_of_schedule: 0 (same tier as on_track — never outranks at_risk/needs_attention in rollupHealth)

// buildPhaseBreakdown's one call site:
const health = derivePhaseHealth(status, daysOverdue, daysRemaining, deliverableRatio);
// -> pass the new early-completion signal, computed from the same usedDays/allotedDays already in scope there
```

#### Current Used/Allotted + Overdue cells being merged (both table files, near-identical)
```tsx
// _status-report-table.tsx:159-168 / _status-report-row-detail.tsx:153-156
<td className="px-3 py-3 font-mono text-[11px] text-[#3A4565]">{cp.usedDays}/{cp.allotedDays}d</td>
<td className="px-3 py-3 font-mono text-[11px]">
  {cp.daysOverdue > 0 ? <span className="text-[#C0392B] font-semibold">{cp.daysOverdue}d</span> : <span className="text-[#5F6A88]">—</span>}
</td>
// -> single <td> using formatUsedAlloted(cp): <span className={cn("font-mono text-[11px]", className)}>{text}</span>
```

#### Row-detail "Completed / due" cell being simplified
```tsx
// _status-report-row-detail.tsx:150-152
<td className="px-3 py-2.5 font-mono text-[11px] text-[#3A4565]">
  {ph.status === "completed" ? formatDate(ph.actualCompletedDate) : `Day ${ph.dayStart}–${ph.dayEnd}`}
</td>
// -> {ph.status === "completed" ? formatDate(ph.actualCompletedDate) : "—"}
```

#### `_status-report-client.tsx` filter array (`HealthFilter` type already derives from `HealthTone`, no change needed there)
```ts
const HEALTH_FILTERS: HealthFilter[] = ["all", "needs_attention", "at_risk", "on_track"];
// -> ["all", "needs_attention", "at_risk", "on_track", "ahead_of_schedule"]
```

### Key Design Decisions (confirm during implementation, flag if wrong)

1. **Term for "finished under its allotment": "ahead"** — e.g. `"12d ahead"`. Chosen for grammatical parallelism with the other two states already in the same parenthetical slot (`"...d overdue"`, `"...d remaining"`, `"...d ahead"` all read as `{N} days {status-word}`), and because "ahead (of schedule)" is the plain-English project-management term for finishing early, matching the new health label `"Ahead of schedule"` for the same condition. Flag if a different term (e.g. "saved", "early", "under") is preferred.
2. **New health tone reuses the `ok` (green) Chip tone, not a new color** — per this doc's own established rule (`_final_design/guide/central-hub-design-system.md`: "no new color vocabulary"). `on_track` and `ahead_of_schedule` are visually identical (green dot chip) but carry different labels or so the "why is this green" reason stays legible on hover/read.
3. **Blue for "remaining" is not a new *semantic* health tone** — it's a plain inline text color (`text-[#007BFF]`) on a raw `<span>`, the same pattern the current Overdue cell already uses (`text-[#C0392B]` span, no `Chip`). `#007BFF` itself isn't new either — `PhaseMiniStrip` already uses it for the in-progress dash, and it's the existing link/focus-ring accent color throughout this page. The "ok/warn/late-only" design-system rule governs the `Chip` health/status vocabulary specifically, not every incidental text color in a dense data cell.
4. **A completed-but-overrun phase shows red "(Nd overdue)" in Used/Allotted but no red health flag** — matches today's status quo (Amendment 1 already established that overage on a completed phase is a Used/Allotted-column fact, not a Status or Health fact) and keeps this amendment's health change scoped to exactly what was asked (early completion, green only).
5. **Exactly-on-allotment completions (`usedDays === allotedDays`) get no parenthetical and no health flag** — neither "ahead" nor "overdue" applies; treated the same as today's unflagged completed state.

### Implementation Steps

1. Widen `HealthTone` and `HEALTH_RANK` in `status-report.ts`; extend `derivePhaseHealth`'s signature and logic; update its call site in `buildPhaseBreakdown` to pass the early-completion signal.
2. Add `HEALTH_LABEL.ahead_of_schedule` and the new `formatUsedAlloted()` helper to `_status-report-types.ts`.
3. Update `_status-report-table.tsx`: remove the Overdue column, wire `formatUsedAlloted`, extend `HEALTH_TONE`, fix `colSpan`.
4. Update `_status-report-row-detail.tsx`: rename the header, simplify the Completed cell, remove the Overdue column, wire `formatUsedAlloted`, extend `HEALTH_TONE`.
5. Add `"ahead_of_schedule"` to `_status-report-client.tsx`'s `HEALTH_FILTERS`.
6. `npx tsc --noEmit` — the widened `HealthTone` union will surface any `Record` that wasn't updated as a compile error; fix until clean.
7. Browser-test: a phase overdue (red combined text), a phase in-progress-not-overdue (blue), a phase completed early (green text + green health chip), a phase completed exactly/late (unflagged / red-overdue text respectively); confirm the health filter row now offers "Ahead of schedule" and filters correctly; confirm row-detail's Completed column shows dates only for completed phases and `—` everywhere else.

### Acceptance Criteria

- [ ] Row-detail header reads "Completed" (not "Completed / due"); non-completed phases show `—`, never a `Day N–M` range.
- [ ] No "Overdue" column exists in either table; its data appears inside the Used/Alloted cell exactly as specified (red/blue/green rules above).
- [ ] A phase completed under its allotment shows a green Used/Alloted parenthetical and a green "Ahead of schedule" health chip.
- [ ] A phase completed over its allotment still shows red "(Nd overdue)" text but no health chip (still `—`), matching current status-quo behavior for that case.
- [ ] Health filter pills include "Ahead of schedule" and filtering by it works.
- [ ] `npx tsc --noEmit` passes with no new errors (the widened `HealthTone` union is fully handled everywhere it's pattern-matched).
- [ ] `pnpm lint` stays clean (no new warnings beyond the pre-existing, unrelated `_checklist-tab.tsx` ones).

### Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manual: /v2/portfolio-tracker/status-report — check overdue/in-progress/completed-early/completed-late/pending phases and the new health filter
```

### Compatibility Touchpoints

- No API, type-shape-over-the-wire, migration, or route change — purely a derive-logic + display-layer amendment to fields the route already returns.
- `HealthTone`'s widened union is additive; nothing currently narrows it in a way that would break (confirmed via the earlier grep — only the 5 files listed above reference it).

## Implementation Notes (Follow-up Amendment 2)

### What Changed
- `derivePhaseHealth` now returns a 4th tone, `"ahead_of_schedule"`, for any phase that's `completed` and finished within its day allotment (`usedDays < allotedDays`); everything else (on-time or over-allotment completions, pending/skipped phases) keeps returning `null` as before.
- The standalone "Overdue" column is gone from both the collapsed table and the row-detail sub-table. Its value now lives inside the Used/Alloted cell via a new shared `formatUsedAlloted()` helper: red `"{used}/{alloted}d ({N}d overdue)"` for an overdue phase *or* a completed phase that ran over its allotment, blue `"{used}/{alloted}d ({N}d remaining)"` for an in-progress-not-overdue phase, green `"{used}/{alloted}d ({N}d ahead)"` for a phase completed under its allotment, and plain gray `"{used}/{alloted}d"` for everything else (on-time completion, pending, skipped).
- Row-detail's "Completed / due" column is now just "Completed" — it shows the actual completion date only when `status === "completed"`, and `"—"` for every other status (previously showed the static `Day {dayStart}–{dayEnd}` range for anything not completed).
- The health filter row on the client now includes "Ahead of schedule" as a 5th pill, and both tables' local `HEALTH_TONE` maps render it with the same green `"ok"` Chip tone as `on_track` — no new color introduced.

### Files Changed
- `src/lib/programme/status-report.ts` - widened `HealthTone` to add `ahead_of_schedule`; added it to `HEALTH_RANK` (rank 0, tied with `on_track`); `derivePhaseHealth` gained an `isEarlyCompletion` param and a `completed && isEarlyCompletion` branch; `buildPhaseBreakdown` computes `isEarlyCompletion` from the same `usedDays`/`allotedDays` already in scope and passes it through
- `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-types.ts` - added `HEALTH_LABEL.ahead_of_schedule = "Ahead of schedule"`; added new exported `formatUsedAlloted(phase): { text, className }` implementing the red/blue/green/plain rules, shared by both table components
- `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-table.tsx` - removed the "Overdue" `<th>`/`<td>`; Used/Alloted cell now renders `formatUsedAlloted(cp)`; added `ahead_of_schedule: "ok"` to local `HEALTH_TONE`; `colSpan` on the expanded-detail row corrected from `9` to `8`; `min-w-[1180px]` trimmed to `min-w-[1080px]` to reflect the removed column
- `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-row-detail.tsx` - header renamed "Completed / due" → "Completed"; its cell simplified to date-or-dash; removed the "Overdue" `<th>`/`<td>`; Used/Alloted cell now renders `formatUsedAlloted(ph)`; added `ahead_of_schedule: "ok"` to local `HEALTH_TONE`; `min-w-[1020px]` trimmed to `min-w-[940px]`
- `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-client.tsx` - added `"ahead_of_schedule"` to `HEALTH_FILTERS`, after `"on_track"`

### Deviations From Plan
- None. Implemented exactly as specified in the plan above, including the "ahead" term choice for early completion and the decision to keep a completed-but-overrun phase red (via Used/Alloted text) with no health flag.

### Verification Run
- `npx tsc --noEmit` - PASS (0 errors)
- `pnpm lint` - PASS (0 errors; same 2 pre-existing, unrelated warnings in `_checklist-tab.tsx`)
- `pnpm dev` / browser role walkthrough - SKIPPED, same reasons as every prior verification pass on this task (no login credentials for the different roles in this environment, migration 097 still not applied locally). **Needs a manual pass before shipping**: confirm the red/blue/green Used/Alloted text and the new "Ahead of schedule" health chip render correctly against real seeded phase data, and that the health filter pill filters as expected.
- The `impeccable` design-quality hook re-flagged the same pre-existing `text-[11px]`/`text-[12px]` literal font-size findings across all touched files on every edit in this pass — all on lines this amendment didn't introduce or only passed through untouched (e.g. `text-[11px]` on the new combined Used/Alloted `<td>` matches the exact class already used by every other mono-data cell in these files). Treated as the same false positive already documented in this doc's original Quality Gate Notes, not re-litigated per-edit.
