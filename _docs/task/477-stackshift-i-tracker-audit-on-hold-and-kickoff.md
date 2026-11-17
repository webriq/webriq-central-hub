# 477: StackShift I tracker audit (Nov 17), Trident fix, On Hold status, kickoff = Onboard start, Kickoff column

**Created:** 2026-11-17
**Priority:** HIGH
**Type:** chore (data correction) + enhancement
**Status:** Completed

---

## Overview

This task compares the StackShift I programmes in the Hub (`/projects/stackshift-i`) with the PM tracker
`Tracker vs. Hub.xlsx`, sheet **"Status tracker as of Nov 17"**. It follows up task 475, which synced the Hub to the Oct 15 sheet.

**Audit scope (user rule):**
- StackShift I projects only.
- Projects that also have the **Discrete Development** classification are excluded, e.g. `67CC38C5-PROJ-03` "Trident Roof Solutions App August 2026".
- Tracker accounts with no Hub project are skipped (Grand River Realty).

**Audit result (16 accounts, before this task):**
- 13 of 16 kickoffs matched. Mismatches: Trident (the Hub date was wrong); Glorias and Shelly Beach (the tracker said "TBC").
- 15 of 16 active phases matched. Mismatch: Trident.

The audit also found four Hub gaps, fixed here:
1. **On Hold could not be seen.** StackShift I cards, the Status Report and the list Status filter only read `projects.onboarding_status`, so `projects.status = 'on_hold'` had no effect on screen.
2. **Kickoff and Onboard start drifted apart.** The kickoff (`projects.programme_started_at`) and Onboard's start date (`project_phases.actual_start_date`, phase 1) are separate fields. Editing the kickoff never updated Onboard's start, and only 2 of 16 projects matched. **PM rule: the kickoff IS Onboard's start date.**
3. **No On Hold option in the Status filter** on the projects list.
4. **No kickoff on the Status Report.** It was used only for days-left and the programme-start sorts.

## Data Changes (applied on LIVE via the Hub UI/API, 2026-11-17)

### Trident Roof Solutions Website (`67CC38C5-PROJ-04`)

| Field | Before | After | How |
|---|---|---|---|
| Kickoff `programme_started_at` | 2026-07-22 | **2026-06-17** | Timeline Kickoff editor (`PATCH /api/projects/[id]/programme/kickoff`) |
| Active phase | Publish (P3) | **Migrate & Rebrand (P2)** | Timeline "Jump to phase" (`PATCH /api/projects/[id]/programme/phase`) |
| `projects.status` | `active` | **`on_hold`** | `PATCH /api/v2/projects/67CC38C5-PROJ-04` `{status:"on_hold"}` |

Side effects of the phase jump:
- Onboard stays `skipped`. Publish, AI Visibility and Optimize went back to `planned`.
- M&R's `actual_start_date` became 2026-11-17, so it reads "1/15d" and not overdue.
- The route posted the standard "manually jumped to Phase 2" Cliq notification to the PM channel.

### Onboard start aligned to kickoff (14 StackShift I projects)

Each project's existing kickoff was re-saved through the updated kickoff route (see Code Changes). Kickoffs did not change.

| Project | Kickoff | Onboard start before |
|---|---|---|
| Trident Roof Solutions Website | 2026-06-17 | 2026-08-05 |
| Veteran Roofing & Exteriors | 2026-06-22 | 2026-08-21 |
| Retail Sign Systems | 2026-06-23 | 2026-08-04 |
| Greydog Security | 2026-06-29 | 2026-08-21 |
| RCB & Associates | 2026-07-08 | 2026-07-27 |
| M&I Interiors | 2026-07-14 | 2026-07-28 |
| Studio Belmont | 2026-07-23 | 2026-09-22 |
| Saginaw CFC | 2026-07-23 | 2026-08-21 |
| Royal Thumper | 2026-08-06 | 2026-07-28 |
| Black Barn Dumpsters | 2026-08-14 | 2026-08-21 |
| WMI Home Solutions | 2026-08-17 | 2026-08-31 |
| Glorias Anzac Biscuits | 2026-08-30 | 2026-08-18 |
| Maxton Manufacturing | 2026-10-08 | 2026-10-22 |
| Shelly Beach House | 2026-11-09 | (null) |

Hello Homes GR and AB Lekdetectie already matched. The Discrete Development Trident App project was left untouched (it still has Onboard start 2026-08-05).

The undo path is the "before" column above. There is no SQL rollback.

Overdue figures for projects still in Onboard now count from the kickoff:

| Project | Before | After |
|---|---|---|
| Studio Belmont | 42d | 103d overdue |
| Black Barn | 74d | 81d overdue |
| WMI | 64d | 78d overdue |
| Maxton | 12d | 26d overdue |
| AB Lekdetectie | 34d | 34d (unchanged) |

## Code Changes

### On Hold on the StackShift I card
- `src/app/(hub)/projects/_v2-listing/_load-list-data.ts`: selects `projects.status`. The card status is `on_hold` when `projects.status = 'on_hold'`, otherwise `onboarding_status`.
- `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx`: `OnboardingProjectListItem.status` gains `"on_hold"`.
- `src/app/(hub)/dashboard/_components/dashboard-shared.tsx`: `ONBOARDING_STATUS_STYLE.on_hold` gives an amber "On Hold" pill.

### On Hold on the Status Report
- `src/app/api/onboarding/projects/status-report/route.ts`: selects `status` and returns `onHold: p.status === "on_hold"`.
- `src/app/(hub)/projects/_status-report/_status-report-types.ts`: adds `onHold: boolean` to `ProjectStatusReportItem`, plus `ReportHealthKey` / `reportHealthKey()`. An on-hold project's health key is `"on_hold"`.
- `src/app/(hub)/projects/_status-report/_status-report-client.tsx`: Health filter gets an **On Hold** option. "Most overdue first" sorts on-hold projects below every active project.
- `src/app/(hub)/projects/_status-report/_status-report-table.tsx`: the Health cell shows an amber "On Hold" chip instead of the derived health.

### On Hold in the projects list Status filter
- `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx`: adds `STATUS_OPTIONS` entry `on_hold` ("On Hold").
- `src/app/(hub)/projects/_v2-listing/_load-list-data.ts`: the status filter mirrors the card's display status. An on-hold project matches only "On Hold", never its `onboarding_status`. Three cases:
  - Without on_hold: `status <> on_hold AND onboarding_status IN (...)`.
  - Only on_hold: `status = on_hold`.
  - Both: `or(status.eq.on_hold, onboarding_status.in.(...))`.

  URL values are checked against the new `PROGRAMME_STATUSES` list before they go into `.or()`.

### Kickoff = Onboard start
- `src/app/api/projects/[projectId]/programme/kickoff/route.ts`: after saving the kickoff and re-materialising dates, the route also sets the programme phase 1 (Onboard) `actual_start_date` to the kickoff date (`adminClient`, `source = 'programme'`, `phase_number = 1`). If that update fails, it returns a 500 with "save again to retry". The header comment is updated: task 455 previously left all actual dates untouched.

### Kickoff column on the Status Report
- `src/app/(hub)/projects/_status-report/_status-report-table.tsx`: new **Kickoff** column between Project and Phases. It shows "Jun 17, 2026" with "Day N" under it. Table `min-w` goes from 1080px to 1180px, and the detail row `colSpan` from 8 to 9.
- **Real day past 120** (follow-up, same day):
  - `src/app/api/onboarding/projects/status-report/route.ts` adds `actualProgrammeDay` (uncapped, `currentDisplayDay(start)` with no duration), `totalProgrammeDays` and `programmeEndDate` (`displayDayToYmd(start, total)`). The capped `currentProgrammeDay` is unchanged and still drives days left.
  - `_status-report-types.ts` adds those three fields.
  - The Kickoff cell shows "Day N". Past the last programme day it shows "Day 127 · ended Nov 10" in red.
  - Checked against the tracker: M&I 127 / Nov 10, RCB 133 / Nov 4, Retail Sign 148 / Oct 20, Veteran 149 / Oct 19, Greydog 142 / Oct 26, Trident Website 154 / Oct 14.
- **Real day past 120 on the project cards** (follow-up):
  - `src/app/(hub)/projects/_v2-listing/_load-list-data.ts` adds `actual_day` (uncapped) and `programme_end_date` to each list item. `_onboarding-list.tsx` adds both to `OnboardingProjectListItem`.
  - `_project-card.tsx`: past the programme's last day, the bar stays full and the label reads "Day 154 · ended Oct 14" in red. Otherwise "Day N/120", unchanged.
- **Real day past 120 on the Timeline** (follow-up):
  - `src/app/(hub)/projects/[classification]/[projectId]/_programme-notes-bar.tsx`: the Kickoff box shows "Day 154 · ended Oct 14" in red past the last day, otherwise "Day N/120 · Nd left".
  - `_status-summary-drawer.tsx`:
    - Same real day / ended label; "Day N / {totalProgrammeDays}" replaces a hard-coded "/ 120".
    - The health chip shows "On Hold" when `onHold`. The drawer has its own chip, which had still read "On track" for Trident.

## Out of Scope / Not Changed
- The Discrete Development Trident App project: its "On Hold" is a project note only, and it still shows Overdue / Needs attention.
- Tracker-side updates, owned by the PM: backfill kickoffs for Glorias (Aug 30) and Shelly Beach (Nov 9); confirm Shelly Beach's Onboard skip.
- PM to confirm the Black Barn and Studio Belmont phases. They match the tracker (Onboard), but the tracker notes say work has moved past it.
- Skipped phases show "used" days counted from their `actual_start_date` to today (e.g. Trident Onboard "154/15d"). This was already true before this task; aligning Onboard's start to the kickoff made the numbers larger for the skipped-Onboard projects.
- The project-detail header phase pill stays stale after "Jump to phase" until the page reloads (minor UI bug, not fixed).

## Verification
- `npx tsc --noEmit`: clean after every change.
- Browser (local dev, live DB):
  - The StackShift I card shows "On Hold" for Trident.
  - Status Report: Trident shows the On Hold chip and sorts last under "Most overdue first". The Kickoff column renders with dates and days.
  - Status Report API: all 16 StackShift I projects have kickoff = Onboard `actualStartDate`.
- Status filter, checked via list page counts: All 19 = In Progress 17 + On Hold 1 + Scheduled 1. In Progress + On Hold = 18. On Hold with search "Trident" returns only the Website project; In Progress with search "Trident" returns only the App project (confirms the status `.or()` works alongside the search `.or()`).
- No automated tests (no test runner configured).
