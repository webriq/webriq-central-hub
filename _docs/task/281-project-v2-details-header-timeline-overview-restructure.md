# 281: V2 Project Details — Header Badge Flash Fix, Timeline Spacing Fix, Classification Chip, Header-Card Dissolution (Settings/Owner → Page Header, Jump-to-Phase/Onboarding-Workspace/Status-Summary Repositioned Above Swimlane), Programme Progress → Overview Tab

**Created:** 2026-08-20
**Priority:** HIGH
**Type:** enhancement / bugfix
**Recommended Tier:** deep
**Status:** Completed

---

## Overview

Eight related fixes to the V2 project detail pages at `/projects/v2/[projectId]/*` (task 279 renamed this from `/projects-v2/v2/...`; Legacy at `/projects/legacy/[projectId]/*` is **not** in scope). All eight are the natural next iteration on task 277 (which built the uniform `ProjectDetailHeader` + split Overview/Timeline) — several of task 277's own "not fixed further" / "deliberate scope" notes are exactly what this task now resolves.

1. **Badge flash on load** — every V2 tab's header briefly shows the `ProjectStatusBadge` fallback ("Active") before `useActivePhase`'s client fetch resolves to the real phase pill ("Phase 1: Onboard"). Documented in task 277's Implementation Notes as "noted, not a bug... not fixed further" — now in scope.
2. **Timeline tab has extra header margin the other 8 tabs don't have** — `_onboarding-detail.tsx` (Timeline) wraps its uniform `ProjectDetailHeader` inside a `px-7 py-8` gray-background content div, so the header renders as a padded, sharp-cornered white rectangle instead of flush-to-edge like every other tab (`_project-detail.tsx`'s structure). `_generic-phase-view.tsx` (the non-StackShift Timeline branch) has the identical bug.
3. **Classification text → chip** — the header subtitle's `{companyName} · {classification}` is one plain-text string today; the classification half (e.g. "StackShift I") should render as a read-only chip per `central-hub-design-system.md`'s "Classification / neutral" chip spec, reusing the existing `Chip` component.
4. **Remove the duplicate title block from Timeline's "Header card"** — `_onboarding-detail.tsx`'s in-body "Header card" repeats the company name + project name + phase pill that the page-level `ProjectDetailHeader` above it already shows.
5. **Move the Settings gear (Set Owner / Manage Collaborators / Delete dropdown) into the page-level header's actions slot** — currently rendered inside the in-body Header card; every other V2 tab already has an `actions` slot on `ProjectDetailHeader` (used for `ManageCollaboratorsAction`/`DeleteProjectAction`/tab CTA buttons), Timeline's equivalent control should live there too.
6. **Move "Jump to Phase" + "Onboarding Workspace" buttons above the swimlane, top-right, vertically centered with the Reminder cards row** — currently part of the Header card's action row.
7. **Move the "N-Day Programme Progress" bar + stat chips (Days left / Phases done / Deliverables) to the Overview tab**, which today is just a static "Coming soon" placeholder (task 277) — and add the Status Summary button there too.
8. **Status Summary button on both Overview and Timeline** — on Timeline it moves to sit alongside the relocated Jump to Phase button (same row, item 6); on Overview it sits with the relocated progress section (item 7).

Net effect on Timeline (`_onboarding-detail.tsx`, customer-phases-engine branch): the in-body "Header card" wrapper is dissolved entirely — its pieces distribute to (a) the page-level header (title/badge/subtitle already there; Settings gear and, by the same logic, the Owner/Collaborators line newly move there too — see Flagged Decision 1), (b) a new row above the swimlane (Jump to Phase, Onboarding Workspace, Status Summary — combined with the existing Reminders strip), and (c) the Overview tab (Programme Progress bar + stat chips + its own Status Summary button). Nothing in this task changes `_generic-phase-view.tsx`'s (non-StackShift) content beyond the shared spacing fix (item 2) — items 4–8 describe StackShift/customer-phases-engine-only UI that has no equivalent there.

## Requirements

- [ ] **Badge flash (item 1):** For a `uses_customer_phases_engine` project, the header badge shows a neutral loading skeleton (not the `ProjectStatusBadge` "Active"/other-status fallback) until the phase/programme fetch resolves, then swaps to the real "Phase N: {name}" / "Complete" pill. For a non-customer-phases-engine project, `ProjectStatusBadge` renders immediately as today (no flash exists there, no change needed).
- [ ] **Timeline spacing (item 2):** `ProjectDetailHeader` renders flush (no left/top/right padding) on every render branch of `_onboarding-detail.tsx` and `_generic-phase-view.tsx`, matching `_project-detail.tsx`'s structure. The `px-7 py-8` (or equivalent) padding moves to wrap only the content *below* the header, not the header itself.
- [ ] **Classification chip (item 3):** The header subtitle renders `{companyName} · <chip>{classification-or-project_type}</chip>` — company name as plain text, the type/classification value as a read-only `Chip` (`tone="neutral"`, per `central-hub-design-system.md` §4 "Chips"). Applies to every `ProjectDetailHeader` caller (`_project-detail.tsx` for all 8 shared V2 tabs + Legacy, `_coming-soon-overview.tsx`, `_onboarding-detail.tsx`) — see Flagged Decision 2 on whether Legacy's `project_type` gets the same chip treatment.
- [ ] **Remove duplicate title (item 4):** The company-name/project-name/phase-pill block inside Timeline's in-body Header card is deleted. Nothing else in that card's title row (Owner/Collaborators line — see Flagged Decision 1) is deleted by this requirement alone.
- [ ] **Settings gear → page header (item 5):** The Settings gear button + its dropdown (Set Project Owner / Manage Collaborators / Delete) renders via `ProjectDetailHeader`'s `actions` prop on Timeline, in the same visibility-gated way it does today (`canManageProjMembers || canSetOwner || canDeleteProject`). `OwnerPanel`/`CollaboratorsPanel` (the inline expandable panels the dropdown's "Set Project Owner"/"Manage Collaborators" options open) continue to work — they render inline in the Timeline body (first thing below the header) when open, same components/state, just no longer nested inside the now-removed Header card wrapper.
- [ ] **Jump to Phase + Onboarding Workspace → above swimlane (item 6):** Both buttons move into a new row directly above the Gantt swimlane grid, right-aligned, vertically centered (`items-center`) with the Reminders strip which now shares that same row (left side, wraps). Same visibility gating as today (`canManagePhases` for Jump to Phase; the existing Phase-1-not-skipped + `canOpenWizard` + `!isComplete` conditions for the Onboarding Workspace button). The row renders even when there are zero reminders (buttons must not disappear).
- [ ] **Programme Progress → Overview tab (item 7):** For a `uses_customer_phases_engine` project, the Overview tab (`_coming-soon-overview.tsx`) renders the "{N}-Day Programme Progress" bar (day counter, overdue state, progress fill) + the three stat chips (Days left / Phases done / Deliverables), computed the same way Timeline computes them today (day-compression-aware — see Code Context). For a non-customer-phases-engine project, Overview keeps the existing static "Coming soon" empty state unchanged (no programme concept exists to show).
- [ ] **Status Summary on both tabs (item 8):** Overview gets a new "Status Summary" button (opens `StatusSummaryDrawer`, same `projectUuid` pattern already used on Timeline) next to the relocated progress section, for `uses_customer_phases_engine` projects only. Timeline's existing Status Summary button moves into the new above-swimlane row from item 6, positioned adjacent to Jump to Phase.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors.

## Out of Scope / Must-Not-Change

- `/projects/legacy/[projectId]/*` content and behavior — only the classification-chip styling (item 3) touches Legacy's header subtitle at all; everything else in this task is V2/customer-phases-engine-specific.
- `_generic-phase-view.tsx` content/behavior beyond the item-2 spacing fix — items 4–8 are StackShift/customer-phases-engine concepts (phase pill, programme day count, Jump to Phase between numbered phases) that don't exist on the generic-engine branch.
- The Wizard (`_onboarding-wizard.tsx`), Onboarding Workspace, `StatusSummaryDrawer`'s/`_status-summary-phase-cards.tsx`'s internal content, `GET /api/projects/[projectId]/programme` and its sibling routes — no route or drawer-internals changes, only new call sites of the existing drawer and existing endpoint.
- No new database columns, migrations, or API routes — the Overview progress section's data comes from the same `GET /api/projects/{id}/programme` endpoint Timeline and `useActivePhase` already call.
- Tab strip order/labels (`_project-detail-tab-strip.tsx`) — unchanged, already correct since task 277 (Overview, Timeline, Tasks, ...).
- Skip-phase day-compression logic (`scaleDay`, `visibleTotalDays`, task 253) — reused as-is by the extracted progress component, not modified.

## Flagged Decisions (confirm during implementation / review)

1. **Where does the Owner/Collaborators line go once the Header card is dissolved?** The user's screenshots (image #17) only called out the Settings gear icon for relocation to the header, not the Owner/Collaborators text line sitting above it in the same card. Once the title row (item 4) and the gear (item 5) are both gone, that line would be the sole remaining content of an otherwise-empty card. **Recommended default:** move it into the page-level header too (e.g. a slim second line under the subtitle, or folded next to the `actions` slot), since it's functionally paired with the Settings gear (which edits it) and there is no other natural home once the Header card wrapper is removed. Flag this for explicit confirmation before/during implementation — if the user wants it left as a standalone strip in the Timeline body instead, that's a smaller change.
2. **Does Legacy's `project_type` subtitle also become a chip (item 3), or only V2's `classification`?** The user's example ("StackShift I") is V2-only, but a single shared `ProjectDetailHeader` component makes an inconsistent look (chip on V2, plain text on Legacy) more visible. **Recommended default:** apply the chip treatment uniformly wherever `ProjectDetailHeader` renders a type/classification value, including Legacy's `project_type`, for visual consistency within one shared component. Legacy's own layout/behavior stays otherwise untouched per the Out of Scope list above.
3. **Badge-flash fix approach (item 1):** two options exist — (a) the client-loading-skeleton fix described in Requirements (small, no new server work, matches the existing `useActivePhase` client-hook architecture task 277 established), or (b) compute the active phase server-side in `_get-project-detail-data.ts`/`loadOnboardingDetailData` (bigger change, adds a `customer_phases` lookup to the shared server loader, removes the fetch+flash entirely rather than replacing it with a skeleton). This task proposes (a) as the minimal, consistent-with-existing-architecture fix; note in Implementation Notes if (b) is preferred instead.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_shared/_use-active-phase.ts` | Modify | Return a `loading: boolean` (`usesCustomerPhasesEngine && phases.length === 0` before the fetch settles) alongside the existing fields |
| `src/app/(hub)/projects/_shared/_project-detail-header.tsx` | Modify | (a) Add a `phaseLoading?: boolean` prop → render a neutral pulsing skeleton pill instead of `ProjectStatusBadge` while true; (b) replace the `subtitle: string` prop with `companyName: string` + `typeLabel: string`, render `{companyName} · <Chip tone="neutral">{typeLabel}</Chip>`; (c) accept an `actions` node already exists — no shape change needed there |
| `src/app/(hub)/projects/_shared/_project-detail.tsx` | Modify | Update the `subtitle` construction (lines ~460-462) to pass `companyName`/`typeLabel` instead; thread `phaseLoading` from `useActivePhase` |
| `src/app/(hub)/projects/v2/[projectId]/_coming-soon-overview.tsx` | Modify (substantial) | Branch on `project.uses_customer_phases_engine`: generic-engine keeps today's static empty state; customer-phases-engine renders the new `ProgrammeProgressCard` (item 7) + a "Status Summary" button + `StatusSummaryDrawer`, fed by the new `useProgrammeProgress` hook. Update `subtitle`→`companyName`/`typeLabel` call. |
| `src/app/(hub)/projects/v2/[projectId]/_onboarding-detail.tsx` | Modify (substantial) | See Implementation Steps 2–7 below — spacing fix on all 6 render branches; delete Header card's title row; move Settings-gear block into `ProjectDetailHeader`'s `actions` prop (panels stay inline in the body); delete progress-bar+stat-chip block (extracted to shared component, now Overview-only); build the new above-swimlane row (Reminders + Jump to Phase + Onboarding Workspace + Status Summary); update `subtitle`→`companyName`/`typeLabel` call (×2 — `backLink` and the shared header call) |
| `src/app/(hub)/projects/v2/[projectId]/_generic-phase-view.tsx` | Modify | Same spacing fix as `_onboarding-detail.tsx` (pull `{backLink}` out of the `px-7 py-8` wrapper) on all 3 render branches; update its `subtitle`-derived call site if it separately builds one |
| `src/app/(hub)/projects/v2/[projectId]/_programme-progress-card.tsx` | Create | Extracted progress-bar + stat-chips JSX (current `_onboarding-detail.tsx` lines ~2136-2186), parameterized by props (`visibleDurationDays`, `currentDay`, `progressPct`, `programmeOverdue`, `daysOverdue120`, `isComplete`, `activePhaseNumber`, `startDate`, `daysRemaining`, `phasesCompleted`, `doneDeliverables`, `totalDeliverables`, `onOpenStatusSummary`). Used by both `_onboarding-detail.tsx` (Timeline, values it already computes inline) and `_coming-soon-overview.tsx` (Overview, values from the new hook below). |
| `src/app/(hub)/projects/_shared/_use-programme-progress.ts` | Create | Client hook for Overview: fetches `GET /api/projects/{id}/programme` (same endpoint `useActivePhase` and Timeline's own effect already call), computes the same day-compression-aware stats Timeline computes inline (`scaleDay`/`visibleTotalDays`, `progressPct`, `daysRemaining`, `phasesCompleted`, `doneDeliverables`/`totalDeliverables`, `isComplete`) — see Code Context for the exact source computation being ported. Gated on `usesCustomerPhasesEngine`, same fetch-failure no-op pattern as `useActivePhase`. |

## Code Context

### `_project-detail.tsx` — current subtitle construction to change (lines 460-462, 469)
```tsx
const subtitle = variant === "v2"
  ? `${companyName} · ${classification ?? project.project_type}`
  : `${companyName} · ${project.project_type}`;
...
subtitle={subtitle}
```
Same pattern in `_coming-soon-overview.tsx:33` and `_onboarding-detail.tsx:1636` (`subtitle={`${project.company_name} · ${project.classification ?? project.project_type}`}`) — all three need to switch to passing `companyName`/`typeLabel` once `ProjectDetailHeader`'s prop shape changes.

### `_project-detail-header.tsx` — current badge fallback logic to add a loading branch to (lines 60-77)
```tsx
let badge: React.ReactNode;
if (variant === "v2" && isComplete) {
  badge = ( <span ...>Complete</span> );
} else if (variant === "v2" && activePhaseNumber !== undefined && activePhaseName) {
  const style = PHASE_BADGE_STYLE[activePhaseNumber] ?? PHASE_BADGE_STYLE[1];
  badge = ( <span ...>Phase {activePhaseNumber}: {activePhaseName}</span> );
} else {
  badge = <ProjectStatusBadge status={projectStatus} />;
}
```
A new first branch — `if (variant === "v2" && phaseLoading) { badge = <SkeletonPill /> }` — needs to come before the `else` fallback so a still-loading customer-phases-engine project shows the skeleton instead of `ProjectStatusBadge`.

### Design system chip spec (`_final_design/guide/central-hub-design-system.md` §4)
```
### Chips — 5px radius, 10px/700
- Status (leading 5px dot): ok / warn / late tints.
- Phase: phase fg on phase tint, no dot.
- Classification / neutral: --line-soft bg, --muted text.
- Chips are read-only — never clickable.
```
`Chip` (`src/app/(hub)/dashboard/_components/dashboard-shared.tsx:209`) already implements this with `tone="neutral"` mapping to `bg-[#EDF0F7] text-[#5F6A88]` (the `--line-soft`/`--muted` pair) — reuse directly, do not reimplement.

### `_onboarding-detail.tsx` — Header card's duplicate title block to delete (item 4, lines 2014-2040)
```tsx
<div className="mb-4 flex flex-wrap items-start justify-between gap-4">
  <div>
    <div className="mb-1 text-xs text-[#5F6A88]">{project.company_name}</div>
    <div className="mb-1.5 flex items-center gap-2">
      <span className={cn("text-lg font-bold text-[#0B1533]")}>{project.name}</span>
      {isComplete ? ( <span ...>Complete</span> ) : ( <span ...>Phase {activePhaseNumber}: {activePhase.name}</span> )}
    </div>
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-[#5F6A88]">
      <span ...>Owner: ... {ownerDisplayName ?? "Unassigned"}</span>
      <span ...>Collaborators: <CollaboratorAvatars members={collaborators} /></span>
      {isManualOverride && <span ...>Manually tagged</span>}
    </div>
  </div>
  <div className="flex items-center gap-2">
    {/* Settings gear block, lines 2042-2085 — move to ProjectDetailHeader's actions */}
    {/* JumpToPhaseMenu, lines 2086-2098 — move above swimlane */}
    {/* Onboarding Workspace button, lines 2099-2112 — move above swimlane */}
  </div>
</div>
```
Delete the `company_name`/`project.name`/phase-pill sub-block (lines 2015-2029). The Owner/Collaborators sub-block (2030-2039) — see Flagged Decision 1. The three items in the right-hand `flex items-center gap-2` div (Settings gear, JumpToPhaseMenu, Onboarding Workspace button) each relocate per items 5/6 respectively.

### `_onboarding-detail.tsx` — Progress bar + stat chips to extract (item 7, lines 2136-2186)
```tsx
<div className="mb-4 flex flex-col gap-4 lg:flex-row lg:gap-6">
  <div className="min-w-0 lg:flex-1">
    {/* progress bar + day counter, uses visibleDurationDays/currentDay/progressPct/programmeOverdue/daysOverdue120/isComplete/activePhaseNumber/startDate */}
  </div>
  <div className="flex items-center gap-2 flex-wrap lg:shrink-0 lg:flex-nowrap">
    <StatChip icon={Clock} label="Days left" value={daysRemaining} />
    <StatChip icon={CheckCircle2} label="Phases done" value={phasesCompleted} />
    <StatChip icon={ListChecks} label="Deliverables" value={`${doneDeliverables}/${totalDeliverables}`} />
    <button onClick={() => setSummaryOpen(true)} ...><ClipboardList size={13} /> Status Summary</button>
  </div>
</div>
```
This whole block moves out of Timeline into the new `_programme-progress-card.tsx`, which both Timeline (item 7's Timeline side is really "delete from here") and Overview render.

### `_onboarding-detail.tsx` — source computation for `_use-programme-progress.ts` to port (lines 1892-1986)
```tsx
const currentDay = getCurrentProgrammeDay(programmeStartedAt);
const startDate = new Date(programmeStartedAt);
const isComplete = sortedPhaseRows.length > 0 && sortedPhaseRows[sortedPhaseRows.length - 1].status === "completed";
// ... (orderedPhases / sortedPhaseRows come from `phases` sorted by sort_order — Task 253's day-compression)
const visibleDurationDays = scaleDay(visibleTotalDays, programmeDurationDays);
const progressPct = Math.min(100, Math.round((currentDay / visibleDurationDays) * 100));
const programmeOverdue = !isComplete && currentDay > visibleDurationDays;
const daysOverdue120 = currentDay - visibleDurationDays;
const totalDeliverables = orderedPhases /* ...sum of deliverables per visible phase */;
const doneDeliverables = deliverables.filter((d) => d.status === "done").length;
const phasesCompleted = phases.filter((p) => p.status === "completed").length;
const daysRemaining = Math.max(0, visibleDurationDays - currentDay);
```
`getCurrentProgrammeDay`, `scaleDay`, and the `visibleTotalDays`/`orderedPhases`/`sortedPhaseRows` derivation all need to be either imported into the new hook (if already exported utilities) or duplicated with a shared-utility extraction — check exports before duplicating. `deliverables` and `phases` both come from the same `GET /api/projects/{id}/programme` response `useActivePhase` already fetches (`data.deliverables`, `data.phases`) — the new hook is effectively `useActivePhase` plus this additional computation plus the `deliverables` half of the response `useActivePhase` currently discards.

### `_onboarding-detail.tsx` — spacing bug, all 6 render-branch wrappers (item 2)
```tsx
// current — header wrapped inside padded div, at each of: 1681-1682, 1704-1705, 1742-1743, 1773-1774, 2008-2009 (5 more sites, same shape)
<div className={cn("min-h-full px-7 py-8", "bg-[#F4F6FB]")}>
  {backLink}
  {/* ...page content... */}
</div>
```
Needs to become (matching `_project-detail.tsx`'s flush-header structure):
```tsx
<div className="flex flex-col h-full min-h-0">
  {backLink}
  <div className="flex-1 min-h-0 overflow-y-auto bg-[#F4F6FB] px-7 py-8">
    {/* ...page content... */}
  </div>
</div>
```
Same fix needed at `_generic-phase-view.tsx:125-126, 178-179, 245-246` (3 sites, identical shape).

## Implementation Steps

1. **Badge flash fix:** add `loading` to `useActivePhase`'s return; add `phaseLoading` prop + skeleton branch to `_project-detail-header.tsx`; thread it from `_project-detail.tsx` and `_coming-soon-overview.tsx`. For `_onboarding-detail.tsx` (which computes phase data inline, not via the hook), pass `phaseLoading={project.uses_customer_phases_engine && phases.length === 0}` directly to its `ProjectDetailHeader` call.
2. **Classification chip + header prop rename:** change `ProjectDetailHeader`'s `subtitle: string` prop to `companyName: string` + `typeLabel: string`; render via `Chip`. Update the 3 call sites (`_project-detail.tsx`, `_coming-soon-overview.tsx`, `_onboarding-detail.tsx`).
3. **Spacing fix:** restructure all 6 `_onboarding-detail.tsx` render branches + all 3 `_generic-phase-view.tsx` render branches to render `{backLink}` flush, with page content in a separate scrollable padded div below it.
4. **Delete duplicate title block** (item 4) from the Header card.
5. **Extract Settings-gear block** into a local variable/component in `_onboarding-detail.tsx`, pass it as `ProjectDetailHeader`'s `actions` prop; keep `OwnerPanel`/`CollaboratorsPanel` rendering inline in the page body (first thing below the header, still gated on `ownerPanelOpen`/`collaboratorsPanelOpen`), decoupled from the now-deleted Header card wrapper.
6. **Build the new above-swimlane row:** combine the existing Reminders strip with Jump to Phase + Onboarding Workspace + (new) Status Summary button in one flex row, `items-center justify-between`, reminders wrapping on the left, buttons `shrink-0` on the right. Row renders unconditionally (buttons must show with zero reminders).
7. **Extract `_programme-progress-card.tsx`:** move the progress-bar+stat-chips JSX out of `_onboarding-detail.tsx` into the new component, parameterized by props; wire Timeline to render it in its new above-swimlane-adjacent-or-removed position — confirm with the task's own Requirement 7 that this block leaves Timeline entirely (it moves to Overview only, it does not also stay on Timeline).
8. **`_use-programme-progress.ts`:** implement the hook per Code Context above, reusing `scaleDay`/`getCurrentProgrammeDay` (check existing exports in `_onboarding-detail.tsx`/a shared util file before duplicating).
9. **Wire Overview (`_coming-soon-overview.tsx`):** branch on `project.uses_customer_phases_engine` — customer-phases-engine renders `ProgrammeProgressCard` (fed by the new hook) + a "Status Summary" button + `StatusSummaryDrawer` (mirroring Timeline's existing `open`/`onClose`/`projectUuid` pattern); generic-engine keeps the current static empty state unchanged.
10. **Resolve Flagged Decisions 1 & 2** (Owner/Collaborators destination, Legacy chip treatment) before or during implementation — confirm with user if uncertain, otherwise follow the Recommended Defaults stated above and note the choice in Implementation Notes.
11. **Full V2 walkthrough** (`pnpm dev`, browser): confirm no badge flash on hard refresh for a customer-phases-engine project; Timeline header flush like Tasks; classification renders as a chip everywhere; Timeline's Header card fully dissolved (no duplicate title, no gear, no progress bar); new above-swimlane row shows Jump to Phase/Onboarding Workspace/Status Summary aligned with Reminders; Overview shows the moved progress section + working Status Summary button for a customer-phases-engine project and unchanged "Coming soon" for a generic-engine project; Legacy pages unaffected beyond the chip.

## Acceptance Criteria

- [ ] Hard-refreshing any V2 tab of a customer-phases-engine project never shows `ProjectStatusBadge` — it shows a loading skeleton, then the correct phase/Complete pill.
- [ ] Timeline's header renders flush (no visible gray margin on left/top/right), identical spacing to Tasks/Issues/etc.
- [ ] Header subtitle's classification/type value renders as a `Chip`, not plain text, on every V2 tab (and Legacy, per Flagged Decision 2's resolution).
- [ ] Timeline's Header card no longer shows a duplicate company name/project name/phase pill.
- [ ] The Settings gear (Set Owner/Manage Collaborators/Delete) is reachable from Timeline's page-level header, not from an in-body card; Owner/Collaborators panels still open and function correctly.
- [ ] Jump to Phase and Onboarding Workspace buttons render above the swimlane, right-aligned, vertically centered with the Reminders row, and still work.
- [ ] Timeline's progress bar + stat chips no longer render on Timeline; the same content (with correct live numbers) renders on Overview for a customer-phases-engine project.
- [ ] Status Summary button works from both Overview (new) and Timeline (relocated, aligned with Jump to Phase); both open the correct project's drawer.
- [ ] A generic-engine (non-customer-phases) project's Overview tab is visually unchanged ("Coming soon"); its Timeline gets the spacing fix but no other item-4–8 changes.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then browser-test per Implementation Step 11
```
Browser-based acceptance testing is required (per CLAUDE.md — no test runner configured): items 1, 2, 6, 7 are all visual/timing changes that cannot be confirmed from code alone. Test at minimum one customer-phases-engine project (StackShift I, e.g. "Glorias Anzac Biscuits") and one generic-engine project (e.g. Discrete Development) to cover both branches.

## Compatibility Touchpoints

- `_docs/mcp-tools.md` — not affected (no new `server.registerTool` calls).
- No new env vars, no DB migration, no new API routes — `_use-programme-progress.ts` calls the existing `GET /api/projects/[projectId]/programme` route.
- `role-access.ts` — no change.

## Implementation Notes

### What Changed

- **Badge flash (item 1)**: `useActivePhase` now returns a `loading` flag (`usesCustomerPhasesEngine && !settled`). `ProjectDetailHeader` renders a neutral pulsing skeleton pill instead of `ProjectStatusBadge` while `phaseLoading` is true, on every V2 tab.
- **Timeline/GenericPhaseView spacing (item 2)**: all 6 render branches of `_onboarding-detail.tsx` and all 3 of `_generic-phase-view.tsx` restructured from a single `min-h-full px-7 py-8` div wrapping both the header and content, to `flex flex-col h-full min-h-0` (header flush) + a separate `flex-1 min-h-0 overflow-y-auto px-7 py-8` content div — matching `_project-detail.tsx`'s structure.
- **Classification chip (item 3)**: `ProjectDetailHeader`'s `subtitle: string` prop replaced with `companyName: string` + `typeLabel: string`; renders `{companyName} <Chip tone="neutral">{typeLabel}</Chip>`. Applied uniformly to V2 and Legacy (Flagged Decision 2 resolved: yes, Legacy's `project_type` gets the same chip treatment, confirmed working on "RCB & Associates").
- **Header-card dissolution (items 4–6, 8)**: Timeline's old in-body "Header card" is fully dissolved. Title/phase-pill row deleted (item 4). Settings gear (Set Owner/Manage Collaborators/Delete) moved into a new `mainBackLink` (a second `ProjectDetailHeader` instance, main-render-branch only) via its `actions` prop (item 5) — the restricted/wizard/loading/not-started branches keep the plain `backLink` with no actions, preserving original availability. Owner/Collaborators (+ "Manually tagged") moved into the shared header's new `secondaryRow` slot (Flagged Decision 1 resolved per user's follow-up image: yes, into the page header) — hoisted `isManualOverride`'s computation earlier (`headerIsManualOverride`) so it's available at that point. Jump to Phase + Onboarding Workspace + Status Summary now render together in one new row directly above the swimlane, combined with the (now always-rendered, not gated on `reminders.length > 0`) Reminders strip (item 6/8).
- **Programme progress → Overview (item 7)**: the progress-bar+stat-chip block extracted verbatim into new `_programme-progress-card.tsx`; a new `_use-programme-progress.ts` hook (calls the same `@/config/customer-phases` functions Timeline's own inline computation uses, against a fresh fetch of the same `/programme` endpoint) feeds it on the Overview tab (`_coming-soon-overview.tsx`), gated on `uses_customer_phases_engine` + a started programme — generic-engine or not-yet-started projects keep the original static "Coming soon" state unchanged. A "Status Summary" button (own `StatusSummaryDrawer` instance) added next to it.
- Removed now-unused local computations in `_onboarding-detail.tsx` (`activePhase`, outer-scope `visual`, `progressPct`/`programmeOverdue`/`daysOverdue120`/`totalDeliverables`/`doneDeliverables`/`phasesCompleted`/`daysRemaining`, duplicate `isManualOverride`) and the now-unused `formatDate` import, to keep `tsc`/lint clean.

### Files Changed

- `src/app/(hub)/projects/_shared/_use-active-phase.ts` — added `loading`
- `src/app/(hub)/projects/_shared/_project-detail-header.tsx` — `phaseLoading` skeleton badge; `subtitle` → `companyName`/`typeLabel` + `Chip`; new `secondaryRow` slot
- `src/app/(hub)/projects/_shared/_project-detail.tsx` — updated header call (`typeLabel`, `phaseLoading`)
- `src/app/(hub)/projects/v2/[projectId]/_coming-soon-overview.tsx` — branches on `uses_customer_phases_engine`; renders `ProgrammeProgressCard` + Status Summary, or the original "Coming soon"
- `src/app/(hub)/projects/v2/[projectId]/_onboarding-detail.tsx` — spacing fix (6 branches); `mainBackLink` (header + Settings-gear actions + `secondaryRow`) vs. plain `backLink`; Header card dissolved; new above-swimlane row; removed now-dead computations/import
- `src/app/(hub)/projects/v2/[projectId]/_generic-phase-view.tsx` — spacing fix only (3 branches); no other content changes (out of scope per task doc)
- `src/app/(hub)/projects/v2/[projectId]/_programme-progress-card.tsx` — new, extracted progress-bar+stat-chips component
- `src/app/(hub)/projects/v2/[projectId]/_use-programme-progress.ts` — new, Overview's data hook
- `TASKS.md` — moved 281 Planned → In Progress → Testing

### Deviations From Plan

- **`_use-programme-progress.ts` and `_programme-progress-card.tsx` placed in `v2/[projectId]/`, not `_shared/`** (as the task doc's Proposed File Changes table listed) — both need `TOTAL_DAYS`/`PHASE_HEX`/`PHASE_TINT_HEX`/`StatChip`/`addDays`, which are local exports of `_onboarding-detail.tsx`; placing the new files in `_shared/` would either duplicate those constants or create a circular import (`_shared/` already imports from `_onboarding-detail.tsx` would-be-reverse via `_project-detail-header.tsx`'s existing avoidance of the same problem, per task 277's note). Co-locating with `_onboarding-detail.tsx` avoids both.
- **Settings gear only added to the main (fully-loaded) render branch's header (`mainBackLink`), not the shared `backLink` used by the restricted/wizard/loading/not-started branches** — preserves the exact original availability (the gear only ever appeared once the full Header card rendered, never on those other screens); adding it everywhere would have been a small unrequested scope increase.
- **Owner/Collaborators (Flagged Decision 1) resolved via user follow-up mid-implementation** (image showing the exact target — the header's secondary row), not left as an open question — implemented as described in that follow-up rather than my doc's more conservative "leave as a standalone Timeline-body strip" fallback option.
- **Legacy chip treatment (Flagged Decision 2) resolved as "yes, apply uniformly"** — implemented as the doc's stated recommended default, confirmed visually on "RCB & Associates."
- **Badge-flash fix (Flagged Decision 3) implemented as option (a)**, the client-side loading-skeleton approach — as recommended in the task doc.

### Verification Run

- `npx tsc --noEmit` — PASS (0 errors)
- `pnpm lint` — PASS (0 errors; 2 pre-existing unused-var warnings in `onboarding-workspace/_checklist-tab.tsx`, unrelated)
- Browser walkthrough (Claude-in-Chrome, against the user's own already-running `pnpm dev` on localhost:3000, Super Admin) — PASS:
  - **Glorias Anzac Biscuits** (StackShift I, customer-phases engine, Phase 1 active) — hard refresh on Timeline showed the skeleton badge during load, then "Phase 1: Onboard"; header flush (no margin); "StackShift I" renders as a chip; no duplicate title/phase-pill in the body; Settings gear present in the header and its dropdown (Set Project Owner/Manage Collaborators/Delete) works; Owner/Collaborators + "Manually tagged" shown in the header's secondary row; Jump to Phase + Onboarding Workspace + Status Summary render together above the swimlane, aligned with the Reminders strip. Overview tab showed the moved "120-Day Programme Progress" card with matching numbers (117 days left / 0 phases done / 1/27 deliverables) plus a working Status Summary button (drawer opened correctly).
  - **ABC Test Company Gantt** (Discrete Development, generic engine) — Overview correctly stayed on the static "Coming soon" state (no programme concept); Timeline got the spacing fix (flush header) with its own untouched in-body Header card (title/phase-pill/owner/gear/progress bar all still present there, as intended — out of scope for items 4–8); top-level header showed "Discrete Development" as a chip, "Active" badge with no skeleton flash (not on the phases engine); no second Settings gear in the page-level header (correctly omitted since only Timeline's `mainBackLink` gets `actions`).
  - **RCB & Associates** (Legacy) — "Content Site" renders as a chip in the header; no Overview/Timeline tabs, no Owner/Collaborators secondary row (not passed for Legacy); otherwise unchanged.
- **Not verified in this pass**: other V2 classifications (StackShift II, PipelineForge, Access/Access Plus) were not spot-checked individually — the two branches exercised (customer-phases engine vs. generic engine) cover the header's fallback logic; a non-Super-Admin role's view of the Settings gear/Owner-Collaborators visibility gating was not separately tested.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation found — `npx tsc --noEmit` and `pnpm lint` both clean (2 pre-existing, unrelated warnings in `onboarding-workspace/_checklist-tab.tsx`, untouched by this task).
- Typing is sound throughout the new/changed files — no `any` introduced; `_use-programme-progress.ts`'s discriminated `{ ready: false }` / `{ ready: true, ...fields }` return shape gives `_coming-soon-overview.tsx` a compile-time-checked `progress.ready` guard before accessing the numeric fields.
- No deep nesting introduced — the new above-swimlane row and `ProgrammeProgressCard` are flat, guard-clause-friendly JSX; `useProgrammeProgress`'s early-return (`if (!applicable || ...) return { loading, ready: false }`) keeps the main computation block unindented.
- Names are accurate and consistent with existing conventions (`mainBackLink`, `settingsMenu`, `ownerCollaboratorsRow`, `headerIsManualOverride` clearly describe what they hold; `_use-programme-progress.ts`/`_programme-progress-card.tsx` names match the existing `_use-active-phase.ts` pattern).
- Now-dead computations were correctly removed alongside the JSX that used them (`activePhase`, outer-scope `visual`, `progressPct`/`programmeOverdue`/`daysOverdue120`/`totalDeliverables`/`doneDeliverables`/`phasesCompleted`/`daysRemaining`, duplicate `isManualOverride`, unused `formatDate` import) — verified via `tsc`/lint passing clean, not left as dead weight.
- Task-attribution comments follow the codebase's existing style (`// Task 281 — ...` with rationale), matching CLAUDE.md's "WHY, not WHAT" comment guidance.
- `react-hooks/set-state-in-effect` violation caught and fixed during implementation (`_use-programme-progress.ts`'s early-return no longer calls `setSettled` synchronously in the effect body).

### Deviations
- **Minor** — `_use-programme-progress.ts` and `_programme-progress-card.tsx` placed in `v2/[projectId]/` rather than `_shared/` (as the task doc's Proposed File Changes table listed). Documented rationale (avoids a circular import / duplicating `TOTAL_DAYS`/`PHASE_HEX`/`PHASE_TINT_HEX`/`StatChip`/`addDays`) is sound and consistent with task 277's own precedent for the identical problem. Doesn't affect any requirement or acceptance criterion — both files are still correctly scoped to V2/customer-phases-engine use only.
- **Minor** — `backLink` and `mainBackLink` are two near-identical `ProjectDetailHeader` JSX consts (~15 lines each, differing only in `actions`), rather than one parameterized helper. Chosen deliberately to preserve exact original branch-scoped behavior (Settings gear only ever available once the full swimlane loads) at low risk; an alternative single-function approach (e.g. `renderHeader(actions?: ReactNode)`) would reduce the duplication but wasn't necessary for correctness. Acceptable given the small size and low change-frequency of this JSX.
- **Minor** — cosmetic indentation is flat (not nested) at the three new wrapper-div insertion points (`_onboarding-detail.tsx`'s 6 branches, `_generic-phase-view.tsx`'s 3 branches) where a `flex-1 overflow-y-auto` div was inserted between the header and existing content without re-indenting the existing children. Doesn't affect runtime behavior (`tsc`/lint/browser walkthrough all clean) — a future `prettier`/format pass would naturally correct it if the project adopts one; no action taken since the project doesn't enforce format-on-save in CI per `CLAUDE.md`.
- **Resolved as documented, not deviations** — Flagged Decisions 1–3 in the task doc were pre-approved open questions the doc explicitly called out for implementer resolution; Decision 1 (Owner/Collaborators → page header) was confirmed by the user's mid-implementation follow-up image, Decisions 2 and 3 were resolved per the doc's own stated recommended defaults.

### Required Fixes
None — no Major deviations found.

## Follow-up Fix (Same Session, Outside Original Scope)

While this task was in Testing, the user reported a separate, unrelated bug: the Projects listing (`/projects/v2` and `/projects/legacy`), the Marketing dashboard, and Customer profile pages were rendering with a black/near-black background for some users — reported as "the Developer dashboard or some roles." Investigated via `superpowers:systematic-debugging` before any fix was proposed.

### Root Cause

A dark-mode preference (`hub_pm_settings.theme` in browser `localStorage`, read via the shared `usePMSettings()` hook) used to be user-controllable from a Settings tab in the pre-migration hub. Task 255 (v2 → root migration) retired that entire old hub UI — moved to an unrouted `_hub_(OLD)` folder — which deleted the *only* code path anywhere in the app that ever wrote that value (`src/components/hub/pm-tabs/settings-tab.tsx`'s `onUpdate("theme", ...)`, now unreachable). Three live components never got updated to match and kept reading the same now-permanently-orphaned global preference, rendering fully dark whenever it happened to be `"dark"`:

- `src/app/(hub)/projects/_listing-shell.tsx` — shared header for `/projects/v2` and `/projects/legacy`
- `src/app/(hub)/dashboard/_components/marketing-dashboard.tsx`
- `src/app/(hub)/customers/[customerId]/client.tsx`

This isn't role-specific — it's per-browser. Anyone whose `localStorage` retained `theme: "dark"` from using the old Settings toggle before it was retired is stuck seeing these three pages dark forever, with no way to switch back since the control no longer exists anywhere reachable in the live app. Confirmed by grepping the entire active source tree for `updateSetting`/`onUpdate("theme"` call sites — the only writer is the retired, unrouted component. A companion component, `src/app/(hub)/_hub-content-shell.tsx`, has the same dead read but is itself unused/unimported anywhere — left untouched (dead code, but inert, out of the reported scope).

### Fix

Asked the user to choose between removing dark mode (matching the PM dashboard's existing "fixed-light" precedent, CLAUDE.md) vs. building a new Settings-page toggle to restore it. User chose removal. Applied:

- `_listing-shell.tsx` — removed `usePMSettings` and every `isDark` ternary; always renders the light branch (`bg-[#F4F6FB]`, light chip/link styling). Simplified `TAB_BADGE_STYLE` from a `{light, dark}` record to a single tone per tab.
- `marketing-dashboard.tsx` — removed `usePMSettings`/`isDark`; hardcoded the wrapper to `pm-light`; dropped the now-unused `isDark` prop from `WorkspaceCard` and the `OnboardingStatusPill`/`ProgrammeTab`/`ResponsesView` call sites (their `isDark` props are optional/pass-through, so omitting it — or it always evaluating `false` — has the same effect).
- `client.tsx` (Customer profile) — replaced the `usePMSettings`-derived `isDark` with a hardcoded `const isDark = false`, documented inline. This file has 100+ `isDark ? dark : light` ternaries across 2600+ lines feeding into it (plus a nested `ResponsesView` component and the separately-filed `ProgrammeTab`, both of which only receive `isDark` as a prop from this same source) — hardcoding the single source achieves the identical "always light" result as stripping every call site, without the risk of 100+ individual edits in one pass. The ternaries are left in place (permanently resolving to their light branch) as a deliberate, documented scope decision — a full dead-ternary cleanup across this file is a separate, larger effort.

### Verification

- `npx tsc --noEmit` — PASS (0 errors)
- `pnpm lint` — PASS (0 errors; same 2 pre-existing unrelated warnings)
- Browser-verified (Claude-in-Chrome): forced `localStorage.hub_pm_settings = {"theme":"dark"}` in a live tab (reproducing the exact stale state) and reloaded each of the three affected pages — `/projects/legacy`, `/customers` → a customer profile (Company Info tab and Products tab, which exercises the status-badge/asset-type dark ternaries) — all rendered fully light with no regression. Cleared the forced value afterward.
- `marketing-dashboard.tsx` was not separately re-screenshotted live (no Marketing-role test session available in this sandbox) — verified by code inspection + `tsc`/lint only; same fix pattern as the other two, which were both visually confirmed.

### Files Changed (Follow-up)

- `src/app/(hub)/projects/_listing-shell.tsx`
- `src/app/(hub)/dashboard/_components/marketing-dashboard.tsx`
- `src/app/(hub)/customers/[customerId]/client.tsx`
