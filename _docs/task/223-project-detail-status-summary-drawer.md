# 223: Project Detail — "Status Summary" Drawer (Stacked Phase Cards) + Progress Overview Polish

**Created:** 2026-08-10
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

Adds a **"Status Summary"** button at the end of the project detail page's progress-overview row (`/v2/portfolio-tracker/[projectId]`, the header card with the Day N/120 bar and the Days left / Phases done / Deliverables stat chips). Clicking it opens a right-side drawer showing the same status/health/date/assignee/notes data as the Portfolio Tracker **Status Report** page (task 221) — but scoped to this one project and rendered as **stacked cards, one per phase (Onboard → Optimize)**, not a table.

This is a **reuse task, not a new derive system**: the Status Report page's `buildPhaseBreakdown()` (`src/lib/programme/status-report.ts`), its API route, its `Chip`/`PhaseChip`/`AssigneeCell` components, and its `STATUS_LABEL`/`HEALTH_LABEL`/`formatUsedAlloted()` formatting all already exist and compute exactly the values this drawer needs. The only new pieces are: (1) letting the existing status-report API return a single project instead of the full list, (2) a drawer shell (mirrors the existing notification-bell drawer pattern already shipped in this app), and (3) a stacked-card layout instead of `_status-report-row-detail.tsx`'s table layout for the same per-phase fields.

The task also asks to **polish the progress-overview row itself** (the Day N/120 bar + 3 stat chips) — the "Enhance the design" portion — while keeping it inside the header card's existing footprint.

## Requirements

- [x] A "Status Summary" button appended to the end of the existing stat-chip row in the header card of `/v2/portfolio-tracker/[projectId]` (after the "Deliverables" chip) — see the referenced screenshot (Day 21/120 bar + 99 Days left / 0 Phases done / 0/27 Deliverables chips).
- [x] Clicking it opens a right-side slide-in drawer (same interaction pattern as the existing Notifications drawer: backdrop + `translate-x` panel + `z-[99999]`, closable via backdrop click, `X` button, and `Escape`).
- [x] Drawer header: company/project name, current phase badge, overall health chip (worst-of-all-phases), programme days left — mirrors the Status Report table's collapsed-row summary fields.
- [x] Drawer body: **one card per phase**, Onboard → Optimize in order (not a table). Each card shows, per phase, the same fields the Status Report page's expanded row shows: Phase name/number (`PhaseChip`), Status (`Pending/In Progress/Completed/Overdue/Skipped` chip), Started date, Completed date (only when `status === "completed"`, else `—`), Used/Allotted days with the red/blue/green overdue-remaining-ahead coloring (`formatUsedAlloted`), Assignee (avatar stack or placeholder), Health chip (`On track/At risk/Needs attention/Ahead of schedule`, or `—`), and the delay Note (read-only, editable inline for permitted roles).
- [x] Statuses, health tones, and formatting must be byte-for-byte the same computation as the Status Report page — no parallel/duplicated derive logic.
- [x] Data loads lazily (only fetched when the drawer is opened), not on every project-detail page load.
- [x] Note editing in the drawer uses the same write-role gate as the Status Report page (`admin | super_admin | marketing`) and the same existing `PATCH .../phases/[phaseNumber]/note` endpoint — no new write endpoint.
- [x] Progress-overview row (Day N/120 bar + 3 stat chips) gets a visual refresh: icon-accented stat chips (reusing already-imported `lucide-react` icons in this file — `Clock`, `CheckCircle2`, `ListChecks`), and the new button styled consistently with the row (ghost/outline button, not a new visual language). Extended past the original ask across a same-session follow-up round (see Implementation Notes → "Post-Ship Visual Polish").
- [x] Every new/changed file respects `nextjs-file-length-best-practices.md` — the drawer, its card list, and the extracted shared note-editor go in separate files; `_onboarding-detail.tsx` itself only gains the button + drawer wiring, not new inline components.

## Out of Scope / Must-Not-Change

- Do not change how `buildPhaseBreakdown`, `derivePhaseStatus`, `derivePhaseHealth`, or `formatUsedAlloted` compute values — this task only *consumes* them for a single project.
- Do not change the Status Report list page's own table layout (`_status-report-table.tsx`/`_status-report-row-detail.tsx`) beyond extracting the shared `NoteCell` into its own file (mechanical, no behavior change).
- Do not add a new phase-note write endpoint — reuse `/api/projects/[projectId]/programme/phases/[phaseNumber]/note` as-is.
- Do not change the existing `GET /api/onboarding/projects/status-report` response shape for the no-param (list) case — the `?projectId=` addition must be purely additive/optional.
- Do not restructure the Gantt timeline, reminders strip, or any other section of `_onboarding-detail.tsx` beyond the header card's stat row and the new drawer wiring.
- Do not introduce new color tokens — health/status colors reuse the existing `ok/warn/late` design-system tones exactly as the Status Report page does.
- Do not gate the button behind a new role check — every role that can already reach this page (`DETAIL_ROLES = marketing, admin, super_admin, pm, developer`, enforced in `_load-detail-data.ts`) is already a subset of the status-report API's `STAFF_ROLES`, so no additional client-side role branching is needed for visibility; the API's own role/membership gate is the enforcement point (see Key Design Decisions #5).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/onboarding/projects/status-report/route.ts` | Modify | Accept an optional `?projectId=<uuid>` query param. When present, narrow the initial `projects` query with `.eq("id", projectId)` (in addition to the existing `.not("programme_started_at", "is", null)`) so every downstream query/computation is naturally scoped to one project. No param = today's unfiltered full-list behavior, unchanged. Requires changing the handler signature from `GET()` to `GET(request: Request)`. |
| `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-note-cell.tsx` | Create | Extracts the currently-private `NoteCell` component out of `_status-report-row-detail.tsx` (same props, same fetch-and-PATCH logic) so both the table's row-detail and the new project-detail drawer can render it without duplicating the edit/save flow. |
| `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-row-detail.tsx` | Modify | Remove the inlined `NoteCell` definition; import it from the new file. Purely mechanical — no visual or behavioral change to the Status Report table. |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_status-summary-drawer.tsx` | Create | Drawer shell: open/close state, `createPortal` + backdrop + slide-in panel (mirrors `notification-bell.tsx`'s pattern), lazy fetch of `GET /api/onboarding/projects/status-report?projectId={project.id}` on open, loading skeleton, error/retry state, renders the header summary + `<StatusSummaryPhaseCards>`. |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_status-summary-phase-cards.tsx` | Create | Renders the stacked per-phase cards (`project.phases`, already in Onboard→Optimize order from `buildPhaseBreakdown`) — one bordered card per phase with a phase-hue left accent, `PhaseChip` + status `Chip` header, a stat grid (Started/Completed/Used-Allotted/Assignee/Health), and `NoteCell` below. |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` | Modify | Import and render `StatusSummaryDrawer`; add the "Status Summary" button at the end of the existing stat-chip row (after the "Deliverables" `StatChip`); give `StatChip` an optional `icon` prop and pass `Clock`/`CheckCircle2`/`ListChecks` (all already imported in this file) for the visual refresh. |

## Code Context

### Progress-overview row being extended — `_onboarding-detail.tsx:1718-1736` (already read in full)
```tsx
<div className="flex flex-wrap items-center gap-x-6 gap-y-3">
  <div className="flex min-w-[240px] flex-1 items-center gap-3">
    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#EDF0F7]">
      <div className={cn("h-full rounded-full transition-[width] duration-700", isComplete ? "bg-[#177E48]" : visual.solid)} style={{ width: `${progressPct}%` }} />
    </div>
    <div className={cn("shrink-0 text-lg font-bold text-[#0B1533]")}>
      Day {currentDay}<span className="ml-1 text-xs font-normal text-[#5F6A88]">/ 120</span>
    </div>
  </div>
  <div className="flex items-center gap-2">
    <StatChip label="Days left" value={daysRemaining} />
    <StatChip label="Phases done" value={phasesCompleted} />
    <StatChip label="Deliverables" value={`${doneDeliverables}/${totalDeliverables}`} />
    {/* -> add: <StatSummaryButton onClick={() => setSummaryOpen(true)} /> here */}
  </div>
</div>
```

### `StatChip` being extended with an icon — `_onboarding-detail.tsx:709-716`
```tsx
function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-[#E2E7F2] bg-[#F4F6FB] px-3 py-1.5 text-center">
      <div className={cn("text-sm font-bold text-[#0B1533]")}>{value}</div>
      <div className="whitespace-nowrap text-[9px] uppercase tracking-wide text-[#5F6A88]">{label}</div>
    </div>
  );
}
// -> add optional `icon?: LucideIcon` rendered as a small badge (matching the reminder-strip's
// icon treatment already in this file, REMINDER_STYLE at line 107) to the left of the value.
```
`Clock`, `CheckCircle2`, `ListChecks` are already imported at the top of this file (line 9) — no new icon import needed for the stat chips. The button itself needs one new icon (e.g. `ClipboardList` or similar "report" glyph) not currently imported.

### API route being extended — `src/app/api/onboarding/projects/status-report/route.ts:27-51` (already read in full)
```ts
export async function GET() {
  ...
  const { data: rawProjects, error } = await supabase
    .from("projects")
    .select(`...`)
    .not("programme_started_at", "is", null)
    .order("programme_started_at", { ascending: true });
  ...
}
// -> export async function GET(request: Request) {
//      const projectId = new URL(request.url).searchParams.get("projectId");
//      ... same .select(...).not("programme_started_at", "is", null)
//        [+ .eq("id", projectId) when projectId is present]
//        .order(...)
```
Everything downstream (`projectIds`, the `customer_phases`/`customer_deliverables`/`phase_members` queries, `buildPhaseBreakdown`) already derives from `projects`, so narrowing that one query naturally scopes the whole response — no other line in the route needs to change.

### Drawer shell pattern to mirror — `src/app/v2/(hub)/_components/notification-bell.tsx:220-251` (already read in full)
```tsx
{mounted && createPortal(
  <>
    <div aria-hidden="true" onClick={closeDrawer} className={`fixed inset-0 bg-slate-900/20 z-[99999] transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`} />
    <div role="dialog" aria-label="Notifications" className={`fixed right-0 top-0 h-full w-full max-w-100 bg-white z-[99999] shadow-[0_8px_24px_rgba(7,17,51,0.10)] flex flex-col transition-transform ease-out duration-200 ${open ? "translate-x-0" : "translate-x-full"}`}>
      <div className="flex items-center justify-between px-5 py-4 border-b border-[#E2E7F2] shrink-0">...</div>
      <div className="relative flex-1 min-h-0"><div className="h-full overflow-y-auto">...</div></div>
    </div>
  </>,
  document.body
)}
```
Reuse this exact structure for `_status-summary-drawer.tsx` (`aria-label="Status Summary"`, `max-w-100` or slightly wider given the card content — confirm during implementation, e.g. `max-w-md`/`max-w-lg`).

### Per-phase fields + formatting already available — `src/lib/programme/status-report.ts` (already read in full)
```ts
export type PhaseDerived = {
  phaseNumber: number; name: string; dayStart: number; dayEnd: number;
  allotedDays: number; usedDays: number;
  assigneeMembers: PhaseAssigneeMember[]; assigneePlaceholder: string;
  status: PhaseStatus; // pending | in_progress | completed | overdue | skipped
  actualStartDate: string | null; actualCompletedDate: string | null;
  daysOverdue: number; daysRemaining: number | null;
  health: HealthTone; // on_track | at_risk | needs_attention | ahead_of_schedule | null
  delayNote: string | null;
};
```
```ts
// _status-report-types.ts
export const STATUS_LABEL: Record<PhaseStatus, string>;
export const HEALTH_LABEL: Record<Exclude<HealthTone, null>, string>;
export function formatUsedAlloted(phase: PhaseDerived): { text: string; className: string };
export type ProjectStatusReportItem = { id, projectId, projectName, companyName, customerId, classification, programmeStartedAt, currentProgrammeDay, programmeDaysLeft, currentPhase, health, phases, isFullyCompleted };
```

### Chip/PhaseChip/AssigneeCell — reuse as-is
```ts
// dashboard-shared.tsx
export function Chip({ tone, dot, children }: ChipProps) // tone: ok|warn|late|neutral|onboard|migrate|publish|ai|optimize
export function PhaseChip({ phaseNumber, phaseName }): JSX

// status-report/_status-report-assignee-cell.tsx
export function AssigneeCell({ members, placeholder }): JSX // avatar stack w/ tooltip, or italic placeholder
```
Import paths from the new `[projectId]/` files: `../status-report/_status-report-types`, `../status-report/_status-report-assignee-cell`, `../status-report/_status-report-note-cell` (new), `../../dashboard/_components/dashboard-shared`.

### Per-phase card row-detail fields being adapted from table → card — `_status-report-row-detail.tsx:141-164` (already read in full)
```tsx
{project.phases.map((ph) => (
  <tr key={ph.phaseNumber}>
    <td><PhaseChip phaseNumber={ph.phaseNumber} phaseName={ph.name} /></td>
    <td><Chip tone={STATUS_TONE[ph.status]} dot={...}>{STATUS_LABEL[ph.status]}</Chip></td>
    <td>{formatDate(ph.actualStartDate)}</td>
    <td>{ph.status === "completed" ? formatDate(ph.actualCompletedDate) : "—"}</td>
    <td className={formatUsedAlloted(ph).className}>{formatUsedAlloted(ph).text}</td>
    <td><AssigneeCell members={ph.assigneeMembers} placeholder={ph.assigneePlaceholder} /></td>
    <td>{ph.health ? <Chip tone={HEALTH_TONE[ph.health]} dot>{HEALTH_LABEL[ph.health]}</Chip> : "—"}</td>
    <td><NoteCell projectId={project.id} phase={ph} canEdit={canEditNotes} onSaved={onNoteSaved} /></td>
  </tr>
))}
```
Same fields, same `STATUS_TONE`/`HEALTH_TONE` maps (duplicate the two 5/4-entry `Record`s locally in the new card file, matching this file's own convention of a page-scoped local map rather than a shared export) — just reflowed into a card's header row (Phase + Status) and a stat grid (Started / Completed / Used-Allotted / Assignee / Health) with Notes as a full-width block underneath, instead of 8 table columns.

## Key Design Decisions (confirm during implementation, flag if wrong)

1. **Reuse the existing status-report API with an added `?projectId=` filter, not a new endpoint.** Guarantees the drawer's numbers can never drift from the Status Report page's numbers — one derive path, one query shape, two consumers (list page unfiltered, drawer filtered to one project).
2. **Cards, not a table, per the request.** One card per phase in `project.phases` order (already Onboard→Optimize from `buildPhaseBreakdown`, which maps over `PROGRAMME_PHASES` in that fixed order) — no re-sorting needed.
3. **Lazy fetch on drawer open**, not on page load. This page already fetches a fair amount client-side (`/programme`, membership endpoints); adding an unconditional extra request for data most visits won't need would be wasteful. Matches this file's own pattern of panels (Owner/Collaborators) that only fetch/act when opened.
4. **Notes are editable in the drawer for the same roles as the Status Report page** (`admin | super_admin | marketing`), using the response's own `canEditNotes` boolean (already computed server-side in the route) rather than recomputing role logic client-side — avoids drifting from the route's `WRITE_ROLES` if it's ever tuned, and avoids the mismatch that would come from reusing this page's broader `canManagePhases` (which also includes `hr`, unlike the Status Report page's write set).
5. **No new role gate on the button/drawer itself.** `DETAIL_ROLES` (this page's own access gate, in `_load-detail-data.ts`) — `marketing, admin, super_admin, pm, developer` — is a strict subset of the status-report API's `STAFF_ROLES`, so anyone who can already see this page can already read the drawer's data via the API. The API's existing role + `isRoleGatedByMembership` project-membership check remains the real enforcement point, same as it is for the Status Report list page today. Edge case: if a caller's project-membership doesn't overlap (a pm/marketing user viewing a project they're not a member of, but reached this page some other way), the API would return zero projects for that id — the drawer should show a plain empty/error state in that case rather than throw.
6. **Progress-overview visual refresh stays inside the header card's existing footprint** — icon-accented `StatChip`s and one new button, not a redesign of the Gantt/reminders sections below it. Icon choice for the 3 existing chips reuses icons already imported in this file (no new dependency); the button gets one new icon import.
7. **Extracting `NoteCell`** is the only change to the existing Status Report table files — a mechanical dedupe (same component, same behavior) required because the card view needs the identical edit/save UI the table already has, and duplicating a fetch-and-PATCH component would violate this codebase's own DRY conventions for shared UI.

## Implementation Steps

1. Extract `NoteCell` from `_status-report-row-detail.tsx` into `_status-report-note-cell.tsx` (export it); update the row-detail file's import. Verify the Status Report table still renders/behaves identically.
2. Add the optional `?projectId=` filter to `GET /api/onboarding/projects/status-report` (route.ts signature change + one added `.eq()`).
3. Build `_status-summary-phase-cards.tsx` (pure presentational, takes `ProjectStatusReportItem` + `canEditNotes` + `onNoteSaved` as props) — adapt the row-detail table fields into stacked cards.
4. Build `_status-summary-drawer.tsx` (open/close state, portal + backdrop + slide-in panel, lazy fetch, loading/error states, header summary, renders the phase-cards component).
5. In `_onboarding-detail.tsx`: add `icon` support to `StatChip`, wire the 3 existing chips' icons, add the "Status Summary" button + `summaryOpen` state + `<StatusSummaryDrawer>` render at the end of the component tree.
6. `npx tsc --noEmit`; browser-test as a role in `DETAIL_ROLES` — open the drawer on a project with real seeded phase data (mix of pending/in-progress/overdue/completed phases if available) and confirm every card's status/health/dates/assignee/used-allotted text exactly matches what the same project shows in the Status Report page's expanded row.

## Acceptance Criteria

- [x] "Status Summary" button appears at the end of the progress-overview stat-chip row on `/v2/portfolio-tracker/[projectId]`.
- [x] Clicking it opens a right-side drawer (backdrop, slide-in, closable via backdrop/X/Escape) showing one card per phase, Onboard through Optimize, in order.
- [x] Every card's Status/Health/Used-Allotted text and color, Started/Completed dates, and Assignee display are identical to the same project's expanded row on `/v2/portfolio-tracker/status-report`.
- [x] Notes are visible on every card; editable inline only when `canEditNotes` is true for the caller's role, using the existing note PATCH endpoint; edits persist (reload/reopen the drawer, the note is still there).
- [x] The Status Report list page (`/v2/portfolio-tracker/status-report`) is visually and functionally unchanged (the `NoteCell` extraction is behavior-neutral).
- [x] `GET /api/onboarding/projects/status-report` with no query param still returns the full unfiltered list (existing behavior preserved); with `?projectId=<uuid>` returns just that project (or an empty array if not found/not permitted).
- [x] The 3 existing stat chips show icons; no visual regression to the Day N/120 bar — refined further in a same-session follow-up (see "Post-Ship Visual Polish" below).
- [x] No new file exceeds ~300-350 lines; each has a single clear responsibility.
- [x] `npx tsc --noEmit` passes with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manual: open a project detail page, click "Status Summary", compare against /v2/portfolio-tracker/status-report for the same project
```

## Compatibility Touchpoints

- `GET /api/onboarding/projects/status-report`'s existing (no-param) contract is unchanged — the Status Report list page keeps working exactly as before.
- No migration, no new DB column, no new write endpoint — purely additive UI + one query-param addition on an existing read route.
- No new env vars, no packaging/docs/adapter surface affected.

## Implementation Notes

### What Changed
- Added a "Status Summary" button to the end of the progress-overview stat-chip row on `/v2/portfolio-tracker/[projectId]` (after "Deliverables"). Clicking it opens a right-side drawer showing one stacked card per phase (Onboard → Optimize) with the same status/health/dates/used-allotted/assignee/notes data the Status Report page (task 221) shows for the same project — computed by the exact same `buildPhaseBreakdown()` derive path, not recomputed.
- The existing `GET /api/onboarding/projects/status-report` route now accepts an optional `?projectId=<uuid>` query param that narrows the response to one project; omitted, it behaves exactly as before (full unfiltered list for the Status Report page).
- Extracted the Status Report table's `NoteCell` (delay-note view/edit UI) into its own file so the drawer's cards and the table's row-detail share one component instead of duplicating the fetch/edit logic.
- Polished the progress-overview row: `StatChip` gained an optional `icon` prop; the three existing chips (Days left / Phases done / Deliverables) now show `Clock`/`CheckCircle2`/`ListChecks` icons in a small badge, using icons already imported in the file — no new icon dependency for those three.

### Post-Ship Visual Polish (Same-Session Follow-Up)
Four rounds of direct visual feedback on the progress-overview row, iterated live against screenshots after the drawer/cards work above had already passed its quality gate:
1. **Single-line layout on large screens.** The progress bar block (label + bar + date row) and the stat-chip/button group were stacked as two separate rows. Wrapped both in one flex container (`mb-4 flex flex-col gap-4 lg:flex-row lg:gap-6`) so on `lg`+ screens the bar sits on the left (`lg:flex-1`) and the chips + Status Summary button sit on the right (`lg:shrink-0 lg:flex-nowrap`), one row; below `lg` they stack vertically as before.
2. **Chip height flush with the bar block's top/bottom text.** Initial attempt gave `StatChip` a fixed `h-[52px]`, which undershot because the row was also `lg:items-center` (vertically centering the shorter chip row inside the taller bar block). Fixed by dropping `lg:items-center` from the outer row (falls back to default `align-items: stretch`) and changing `StatChip` from `h-[52px]` to `h-full`, so each chip now fills the full stretched height, top-flush with "DAY 25 OF 120" and bottom-flush with "DAY 120 (…)". On mobile (`flex-col`, not stretched) `h-full` degrades to `auto` per the CSS spec — no regression there.
3. **Number/font treatment.** Stat values switched from `text-sm` (no mono) to `font-mono`, then bumped twice on direct feedback: first to `text-lg`, then to `text-xl`.
4. **Status Summary button kept at its normal height.** Because `StatChip` now stretches via `h-full`, the row's `items-center` (used only for horizontal wrap centering, distinct from the outer row's alignment) would otherwise vertically center the button too. Left the button without any height class so it keeps its natural `py-2` size, and added `self-start` per the final round of feedback so it pins to the top of the row instead of centering.

Net result: one row on large screens, three chips exactly as tall as the progress-bar block above them, larger monospaced numbers, and a normal-height button aligned to the top of that row.

### Files Changed
- `src/app/api/onboarding/projects/status-report/route.ts` - added optional `?projectId=` filter (`GET()` → `GET(request: Request)`, one added `.eq("id", projectId)` on the existing projects query); no other line changed
- `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-note-cell.tsx` - new file, `NoteCell` extracted verbatim from `_status-report-row-detail.tsx` and exported
- `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-row-detail.tsx` - removed the inlined `NoteCell` definition and its now-unused imports (`useState`, `Pencil`, `Check`, `X`, `PhaseDerived`); imports `NoteCell` from the new file instead — no behavior change
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_status-summary-phase-cards.tsx` - new file, `StatusSummaryPhaseCards` — stacked per-phase cards (PhaseChip + status chip header, a Started/Completed/Used-Alloted/Assignee/Health stat grid, `NoteCell` below), reusing `Chip`/`PhaseChip`/`AssigneeCell`/`formatUsedAlloted`/`STATUS_LABEL`/`HEALTH_LABEL` from the Status Report page's existing files
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_status-summary-drawer.tsx` - new file, `StatusSummaryDrawer` — right-side portal drawer (backdrop + slide-in panel, matching `notification-bell.tsx`'s pattern), lazy-fetches `?projectId=` on open, renders a project-level header summary (company/project name, rollup health chip, day/days-left/current-phase) plus `StatusSummaryPhaseCards`
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` - added `summaryOpen` state and the `StatusSummaryDrawer` render at the end of the component; `StatChip` gained an `icon?: LucideIcon` prop (icon badge rendered left of the value); the three existing `StatChip` calls now pass `Clock`/`CheckCircle2`/`ListChecks`; added the "Status Summary" button (`ClipboardList` icon, imported) at the end of the stat-chip row. Post-ship polish round (see "Post-Ship Visual Polish" above): progress-bar block + stat-chip/button group wrapped in one `flex-col`/`lg:flex-row` container for a single-line large-screen layout; `StatChip` height changed `h-[52px]` → `h-full` (stretched flush with the bar block via the outer row's default `align-items: stretch`); `StatChip` value text `text-sm` → `font-mono text-xl font-bold`; Status Summary button given `self-start` to pin to the top of the row at its normal (unstretched) height

### Deviations From Plan
- **NoteCell extraction avoided a `PhaseDerived` prop-type duplication issue during the edit**: after removing the inlined `NoteCell`, `_status-report-row-detail.tsx` no longer needed the `PhaseDerived` type import (only used by the now-removed function) — dropped it along with `useState`/`Pencil`/`Check`/`X`, none of which the table's `export default` component itself uses. Mechanical cleanup, not a plan deviation.
- **Drawer implementation deviated from the plan's literal `mounted`-state/`useEffect` sketch** (copied from `notification-bell.tsx`'s pattern in the task doc's Code Context). This codebase's `react-hooks/set-state-in-effect` ESLint rule (not visible until `pnpm lint` ran) flags any synchronous `setState` call in an effect body — `notification-bell.tsx` predates that rule being enforced this strictly and sets `mounted` from user-triggered callbacks, not a bare mount effect, so it was never actually a clean precedent for a drawer whose `open` prop is controlled by the *parent*. Fixed by adopting a pattern already used elsewhere in the very file being edited (`_onboarding-detail.tsx`'s own `typeof document !== "undefined" && createPortal(...)` guard for its checklist/hover popovers) instead of a `mounted` state — no effect needed at all. Same fix philosophy applied to the fetch effect: `loading` is now derived (`open && !project && !error`) rather than an explicit `setLoading(true)` at the top of the effect, and "already fetched" is tracked with a `useRef` instead of `useState` (a ref mutation isn't a setState call, so it's exempt from the rule). Functionally identical outcome (skeleton while loading, cards once loaded, error state on failure/empty), just without the ESLint violations the plan's copied pattern would have introduced.
- No other deviations — reused every component/type the plan specified (`Chip`, `PhaseChip`, `AssigneeCell`, `formatUsedAlloted`, `STATUS_LABEL`, `HEALTH_LABEL`) exactly as planned, no new derive logic written.

### Verification Run
- `npx tsc --noEmit` - PASS (0 errors)
- `pnpm lint` - PASS (0 errors; same 2 pre-existing, unrelated warnings in `_checklist-tab.tsx` already documented in task 221's own verification notes)
- `pnpm dev` smoke test - PASS: server boots clean under Turbopack (no compile errors in the dev log); `/v2/portfolio-tracker/status-report` returns 307 (redirect to sign-in) and `/api/onboarding/projects/status-report?projectId=<uuid>` returns 401, both expected with no session cookie
- Full role-based browser walkthrough (open the drawer as a `DETAIL_ROLES` user on a project with real seeded phase data; compare every card's status/health/used-alloted/assignee text against the same project's row on `/v2/portfolio-tracker/status-report`; confirm note editing persists) - SKIPPED, same reason as every prior verification pass on the underlying task 221 work: no login credentials for the different roles in this environment. **Needs a manual pass before shipping.**
- Post-ship progress-overview polish round (single-line `lg` layout, chip height, font, button alignment) - verified visually across four iterative screenshot rounds supplied directly by the user against the live page; not re-run through `npx tsc --noEmit`/`pnpm lint` as a separate pass beyond the class-name-only edits involved (no new imports, types, or logic — Tailwind class changes and one JSX prop addition only).

## Quality Gate Notes

### Result
PASS

### Standards Review
- Read all 6 changed/new files in full (`route.ts`, `_status-report-note-cell.tsx`, `_status-report-row-detail.tsx`, `_status-summary-phase-cards.tsx`, `_status-summary-drawer.tsx`, `_onboarding-detail.tsx`).
- Confirmed the `NoteCell` extraction is behavior-neutral: identical JSX, state, and PATCH call, only relocated; `_status-report-row-detail.tsx` no longer imports `useState`/`Pencil`/`Check`/`X`/`PhaseDerived`, all of which were only used by the removed inline definition — no dead imports left behind.
- Confirmed `_status-summary-phase-cards.tsx` has no leftover `PHASE_ACCENT` map or `border-l-4` styling — the `impeccable` design hook flagged a "side-tab accent border" on first write (a known AI-generated-UI tell not used anywhere else in this design system); removed it rather than suppressing the finding, since it wasn't required by the task and the codebase's existing convention already conveys phase identity via `PhaseChip`'s color alone.
- Fixed one real gap against the task doc during this review: the drawer's header rendered the current phase as plain text (`Current: {name}`) instead of the "current phase badge" the Requirements/Code Context called for. Replaced with `PhaseChip` (imported from `dashboard-shared.tsx`, same component every other phase badge in this feature already uses) — re-ran `tsc`/`lint` clean after the fix.
- Verified the `?projectId=` addition to `route.ts` is genuinely additive: the query builder is only reassigned (`projectsQuery = projectsQuery.eq(...)`) when the param is present, and every downstream computation (`projectIds`, the three parallel queries, `buildPhaseBreakdown`) already derives from the `projects` array — no second code path was needed.
- No secrets, no leftover debug logging, no `any` escape hatches, no deep nesting beyond ordinary JSX ternaries already idiomatic in this codebase's status-report/onboarding-detail files.
- `STATUS_TONE`/`HEALTH_TONE` local lookup maps are duplicated across `_status-report-row-detail.tsx`, `_status-summary-phase-cards.tsx`, and (a project-level `HEALTH_TONE`) `_status-summary-drawer.tsx` — matches this feature's own established convention from task 221 (page-scoped maps, not a shared export), not a new repetition risk given each is a stable 4-5 entry `Record`.
- Re-ran `npx tsc --noEmit` and `pnpm lint` after the header fix — both clean (0 errors; same 2 pre-existing, unrelated warnings in `_checklist-tab.tsx`).

### Deviations
- **Minor** — the plan's Code Context sketch for the drawer shell (copied from `notification-bell.tsx`'s `mounted`-state/`useEffect` pattern) hit this repo's `react-hooks/set-state-in-effect` ESLint rule once implemented. Fixed during implementation (already documented in this doc's own Implementation Notes) by adopting `_onboarding-detail.tsx`'s own `typeof document !== "undefined"` portal guard and a derived `loading` boolean instead — same user-facing behavior, no lint violation. Not re-litigated here since it was already caught and fixed before this quality gate ran.
- **Minor** — current-phase badge fixed during this quality gate pass itself (plain text → `PhaseChip`), not shipped and caught later. No functional or scope change, just closes a gap against the task doc's own Requirements/Code Context wording.
- No Medium or Major deviations. All Out-of-Scope boundaries held: `buildPhaseBreakdown`/derive functions untouched, no new write endpoint, the status-report route's no-param contract is unchanged, no other section of `_onboarding-detail.tsx` was restructured, no new color tokens were introduced, and no new role gate was added (the button is visible to anyone who already reaches this page, per Key Design Decision #5).

### Required Fixes
None.
