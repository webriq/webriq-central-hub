# 215: Time Logs Tab — hh:mm Formatting, Time Period, Timer Timeline Popover, Notes Column, Source Column

**Created:** 2026-08-05
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** deep
**Status:** Completed (2026-08-05)

---

## Overview

Deepens the Time Logs tab shipped in task 214 to match Zoho's time-tracking detail more closely
(reference screenshots: the original Log Hours tab, and a new one showing Zoho's hover popover —
"Total Hours 03:28hrs / Start Time: 05:15 pm, 08-03-2026 / End Time: 08:43 pm, 08-03-2026" plus a
green "Started" / red "Stopped" timeline).

This **supersedes two specific exclusions from task 214**: "no start/end Time Period fields" and
"the timer flow is untouched." Everything else task 214 established — all-task-logs-visible,
self-edit-only RLS model (migration 094), the tab's shell/grouping/empty/loading patterns — is
the foundation this task builds on, not something to re-decide.

**Decisions confirmed with the user before planning:**

1. **Break "why" = existing preset label**, not a new free-text field. `BREAK_LABELS`
   (`meal`→"Meal Break", `coffee`→"Coffee Break", `few_minutes`→"Few Minutes Break") already
   exist and are reused as the timeline's break reason. No new UI is added to the floating timer
   widget's break flow.
2. **Timeline storage = JSONB event log.** A `timeline` column is added to `active_timers`;
   every timer route (start/pause/resume/break-start/break-cancel/stop) appends one event to it.
   On stop, the accumulated timeline plus a derived `start_time`/`end_time` are copied onto the
   new `time_logs` row's own `start_time`/`end_time`/`timeline` columns before the
   `active_timers` row is deleted (unchanged deletion behavior from task 214/209).
3. **hh:mm confirmed as duration formatting**, not clock time, for the hours display (e.g. `1.5`
   → `"01:30"`) — `formatHoursAsHHMM()` already exists in `src/lib/timer/format.ts` and is simply
   unused by the current tab; this task wires it in rather than reinventing it.

## Requirements

- [ ] Replace every decimal-hours display in the Time Logs tab (`entry.hours.toFixed(2)+"h"`,
      day/overall totals) with `formatHoursAsHHMM()` — e.g. `"03:28"` not `"3.47h"`.
- [ ] Add a "Time Period" value per entry, formatted `"hh:mm am/pm - hh:mm am/pm"` (lowercase
      `am`/`pm` on **both** sides, consistent spacing around the dash, tabular/mono digits for
      alignment) — sourced from new `time_logs.start_time`/`end_time` columns. Entries with no
      period (legacy rows, or manual entries that predate this task) render an em dash.
- [ ] New `time_logs` columns: `start_time timestamptz`, `end_time timestamptz`,
      `timeline jsonb` (nullable — only ever populated for `source = 'timer'` rows).
- [ ] New `active_timers` column: `timeline jsonb not null default '[]'::jsonb`. Every timer
      route appends one event `{ type, at, break_type? }` to it:
      `start` → `"started"` (resets `timeline` to a fresh single-event array, mirroring its
      existing `accumulated_seconds: 0` reset when reusing a break-only row), `pause` →
      `"paused"`, `resume` → `"resumed"`, `break/start` → `"break_start"` (+ `break_type`),
      `break/cancel` → `"break_end"`, `stop` → `"stopped"` (then copies the full array plus
      derived `start_time`/`end_time` onto the new `time_logs` row before deleting the
      `active_timers` row, exactly as today).
- [ ] Hover popover on **timer-sourced** entries with a non-empty timeline (reference screenshot):
      title `"Total Hours 03:28hrs"`, `"Start Time: 05:15 pm, 08-03-2026"`,
      `"End Time: 08:43 pm, 08-03-2026"`, then a vertical timeline of every event — green for
      `started`, red for `stopped`, amber for `break_start`/`break_end` (labeled with the preset
      break reason, e.g. `"Paused — Coffee Break"`), neutral for `paused`/`resumed`. Manual
      entries (no timeline) get no popover.
- [ ] Notes column/value shown per entry (already captured as `note` — task 214 stored it but
      only rendered it as a paragraph; make it visually a distinct labeled field alongside
      hours/period, not just inline body text).
- [ ] New "Source" value (`Manual` / `Timer`) visible **only** to admin/pm/hr/super_admin — driven
      by a new `canSeeSource` flag in the GET response (mirrors the existing `canAdd` flag's
      role-gating pattern from task 214), not by a client-side role check.
- [ ] The add/edit form (`_time-log-form.tsx`) changes from a single decimal "Hours" input to
      **Date + Start Time + End Time** inputs; hours is computed server-side from the difference
      (never trust a client-supplied duration, matching every other timer route's existing rule).
      Applies to both add and edit, and to editing a developer's own **timer-sourced** entries too
      (per the user's explicit ask: "User can also edit their own time log adjusting the time
      period") — editing only corrects the displayed `start_time`/`end_time`/`hours`/`date_logged`;
      the original `timeline` event history is left untouched as the historical record of what
      actually happened.

## Out of Scope / Must-Not-Change

- No free-text break-reason capture UI on the floating timer widget (Decision 1) — reuses
  `BREAK_LABELS` as-is.
- No change to who can add/edit/delete (still developer-assignee-only add, own-row-only
  edit/delete — task 214's RLS model and migration 094 are unchanged and not re-litigated here).
- No change to `time_logs_manager_read` / `time_logs_developer_own` / `time_logs_developer_read_all`
  policies — this task only adds columns, it does not touch row-visibility policies.
- Pre-existing `time_logs` rows (including every Zoho-imported row and every entry logged before
  this migration ships) will have `start_time`/`end_time`/`timeline` all `null` — no backfill is
  attempted (there is no historical event data to backfill from); the UI must degrade gracefully
  (em dash for period, no popover), not error.
- The date-group section headers in `_task-time-logs.tsx` (e.g. "Aug 3, 2026", via the existing
  `formatDate()` util) are **not** changed to the popover's `"08-03-2026"` numeric style — that
  numeric format is intentionally scoped to the popover only, to match the reference screenshot's
  own tooltip exactly, without introducing a third date format into the tab's outer list.
- No changes to `TaskTimerButton`'s or `TimerFloatingWidget`'s visible UI/controls — only their
  underlying API routes gain one JSONB-append line each. `TimerContext`'s `ActiveTimerRow` type
  does not need a `timeline` field (the client never reads live timeline state — it's write-only
  until copied to `time_logs` on stop).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/095_timer_timeline_and_time_logs_period.sql` | Create | Add `active_timers.timeline`, `time_logs.start_time`/`end_time`/`timeline` |
| `src/types/database.ts` | Modify | Add the 4 new columns to `active_timers` and `time_logs` Row/Insert/Update types |
| `src/lib/timer/timeline.ts` | Create | `TimerEvent` type + `appendTimerEvent()` helper shared by all 6 timer routes |
| `src/lib/timer/format.ts` | Modify | Add `formatClockTime()` (hh:mm am/pm, lowercase) and `formatFullTimestamp()` (popover's "05:15 pm, 08-03-2026" style) |
| `src/app/api/v2/timer/start/route.ts` | Modify | Append `"started"` event (reset timeline on reused row) |
| `src/app/api/v2/timer/pause/route.ts` | Modify | Append `"paused"` event |
| `src/app/api/v2/timer/resume/route.ts` | Modify | Append `"resumed"` event |
| `src/app/api/v2/timer/break/start/route.ts` | Modify | Append `"break_start"` event with `break_type` |
| `src/app/api/v2/timer/break/cancel/route.ts` | Modify | Append `"break_end"` event |
| `src/app/api/v2/timer/stop/route.ts` | Modify | Append `"stopped"` event; write `start_time`/`end_time`/`timeline` onto the new `time_logs` insert |
| `src/app/api/v2/tasks/[taskId]/time-logs/route.ts` | Modify | GET returns `start_time`/`end_time`/`timeline`/`source` per entry + `canSeeSource`; POST takes `start_time`/`end_time` instead of `hours`, computes hours server-side |
| `src/app/api/v2/tasks/[taskId]/time-logs/[timeLogId]/route.ts` | Modify | PATCH takes `start_time`/`end_time` instead of `hours`, recomputes hours; leaves `timeline` untouched |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_time-log-form.tsx` | Modify | Date + Start Time + End Time inputs replacing the single Hours input |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-time-logs.tsx` | Modify | hh:mm totals, Time Period value, Notes styling, Source badge (role-gated), timer-timeline popover |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_timer-timeline-popover.tsx` | Create | The hover popover content (title, start/end, colored event list) — split out to keep `_task-time-logs.tsx` under the file-length guideline |

## Code Context

### Current `active_timers` schema (migration 092) — columns to add onto

```sql
create table if not exists active_timers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references profiles (id) on delete cascade,
  task_id uuid references tasks (id) on delete cascade,
  project_id uuid references projects (id) on delete cascade,
  status text check (status in ('running', 'paused')),
  accumulated_seconds numeric not null default 0,
  segment_started_at timestamptz,
  break_type text check (break_type in ('meal', 'coffee', 'few_minutes')),
  break_started_at timestamptz,
  break_duration_minutes integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

### New migration to write

```sql
-- Migration 095: timer event timeline + time_logs time-period columns (task 215)
alter table active_timers add column timeline jsonb not null default '[]'::jsonb;

alter table time_logs add column start_time timestamptz;
alter table time_logs add column end_time timestamptz;
alter table time_logs add column timeline jsonb;
```

### `src/lib/timer/format.ts` — existing hh:mm helper this task wires in (do not rewrite it)

```ts
// Time-logged column display — "00:00" hh:mm, e.g. 1.5 -> "01:30".
export function formatHoursAsHHMM(hours: number): string {
  const { hh, mm } = decomposeHours(hours);
  return `${hh.toString().padStart(2, "0")}:${mm.toString().padStart(2, "0")}`;
}
```
Add alongside it:
```ts
// "hh:mm am/pm", lowercase meridiem, for the Time Period column — both sides always show am/pm.
export function formatClockTime(iso: string): string { /* ... */ }

// "hh:mm am/pm, mm-dd-yyyy" — popover-only style, matches the reference screenshot exactly.
export function formatFullTimestamp(iso: string): string { /* ... */ }
```

### `src/lib/timer/constants.ts` — reused as-is for the timeline's break reason (Decision 1)

```ts
export type BreakType = "meal" | "coffee" | "few_minutes";
export const BREAK_LABELS: Record<BreakType, string> = {
  meal: "Meal Break", coffee: "Coffee Break", few_minutes: "Few Minutes Break",
};
```

### `src/lib/timer/timeline.ts` — new shared helper (keeps each route's diff to one line)

```ts
import type { BreakType } from "./constants";

export type TimerEventType = "started" | "paused" | "resumed" | "break_start" | "break_end" | "stopped";
export type TimerEvent = { type: TimerEventType; at: string; break_type?: BreakType };

export function appendTimerEvent(existing: unknown, event: TimerEvent): TimerEvent[] {
  const arr = Array.isArray(existing) ? (existing as TimerEvent[]) : [];
  return [...arr, event];
}
```
Each route calls this once, e.g. in `pause/route.ts`:
```ts
timeline: appendTimerEvent(existing.timeline, { type: "paused", at: now }),
```
`start/route.ts` resets instead of appending when reusing a row (mirrors its existing
`accumulated_seconds: 0` reset):
```ts
timeline: [{ type: "started", at: now }],
```

### `stop/route.ts` — current insert this task extends (full current file already read; only the insert body changes)

```ts
const { error: logError } = await supabase.from("time_logs").insert({
  task_id: existing.task_id,
  project_id: existing.project_id,
  employee_id: user.id,
  date_logged: new Date().toISOString().slice(0, 10),
  hours,
  source: "timer",
  billable: false,
  // NEW:
  start_time: (existing.timeline as TimerEvent[] | null)?.[0]?.at ?? null,
  end_time: new Date().toISOString(),
  timeline: appendTimerEvent(existing.timeline, { type: "stopped", at: new Date().toISOString() }),
});
```
`existing` (the `active_timers` select) needs `timeline` added to its `.select(...)` list.

### `time-logs/route.ts` GET — current `canAdd` pattern to mirror for `canSeeSource` (task 214)

```ts
const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
let canAdd = false;
if (profile?.role === "developer") {
  const { data: task } = await supabase.from("tasks").select("assignees").eq("id", taskId).maybeSingle();
  canAdd = !!task?.assignees?.includes(user.id);
}
return NextResponse.json({ entries, canAdd });
```
Add `canSeeSource = !!profile?.role && ["admin", "super_admin", "pm", "hr"].includes(profile.role);`
alongside it, and include `source`, `start_time`, `end_time`, `timeline` in each mapped entry.

### POST/PATCH body shape change

Old (task 214): `{ date_logged, hours, note }`. New: `{ date_logged, start_time, end_time, note }`
— both timestamps ISO strings built client-side from the form's date + time-of-day inputs
(`new Date(`${date}T${time}:00`).toISOString()`, which correctly applies the browser's local
timezone). Server validates `end_time > start_time`, computes
`hours = (end - start) / 3600000`, rejects `hours <= 0 || hours > 24` (same bounds task 214
already enforced).

### `_task-attachments-comments-panel.tsx` / `_pm-shared.tsx` / `OwnerChip`

Unchanged by this task — referenced here only so the implementer knows `_task-time-logs.tsx`'s
surrounding shell and avatar component are already wired and untouched.

## Implementation Steps

1. Write migration `095_timer_timeline_and_time_logs_period.sql` (do not apply/run it).
2. Update `src/types/database.ts` — add the 4 new columns to `active_timers` and `time_logs`.
3. Create `src/lib/timer/timeline.ts` (`TimerEvent`, `appendTimerEvent`).
4. Add `formatClockTime()` and `formatFullTimestamp()` to `src/lib/timer/format.ts`.
5. Update `start/pause/resume/break/start/break/cancel/stop` routes — one `appendTimerEvent(...)`
   call each (or a reset array for `start`'s reused-row branch), and `stop`'s `time_logs` insert
   gains `start_time`/`end_time`/`timeline`.
6. Update `GET`/`POST` in `time-logs/route.ts` — new response fields (`canSeeSource`, `source`,
   `start_time`, `end_time`, `timeline` per entry); POST takes `start_time`/`end_time` and
   computes `hours` server-side.
7. Update `PATCH` in `time-logs/[timeLogId]/route.ts` — same `start_time`/`end_time`-driven
   recompute; leave `timeline` out of the patchable field set entirely (immutable history).
8. Rework `_time-log-form.tsx` — Date + Start Time + End Time inputs, client-side ISO
   construction, inline validation (`end > start`), same Save/Cancel/error pattern as before.
9. Create `_timer-timeline-popover.tsx` — title + Start/End rows (`formatFullTimestamp`) +
   colored vertical event list (green started / red stopped / amber break events using
   `BREAK_LABELS` / neutral paused-resumed), built on the existing `Tooltip`/`TooltipTrigger`/
   `TooltipContent` primitives (`src/components/ui/tooltip.tsx`) with a wider `className`
   override rather than a new portal/positioning implementation.
10. Update `_task-time-logs.tsx` — swap in `formatHoursAsHHMM()` for all hours displays, add the
    Time Period value (`formatClockTime` both sides, em dash when `start_time`/`end_time` are
    null), style the Notes value as its own labeled field, add the role-gated Source badge
    (`canSeeSource`), wrap timer-sourced entries with a non-empty `timeline` in the new popover
    trigger.
11. Run `npx tsc --noEmit` and `pnpm lint`; browser-verify as a developer (start a timer, pause,
    take a break, resume, stop — confirm the Time Logs tab shows the full timeline on hover,
    correct hh:mm total and Time Period), and as PM/admin (confirm the Source column appears and
    add/edit/delete controls still do not).

## Acceptance Criteria

- [ ] Every hours value in the tab (per-entry, per-day, overall total) renders as `hh:mm`, not
      decimal.
- [ ] Every entry with a recorded period shows `"hh:mm am/pm - hh:mm am/pm"`, lowercase meridiem
      both sides, visually aligned (tabular/mono digits, consistent spacing around the dash).
      Entries without a period show an em dash, not a crash or blank cell.
- [ ] Hovering a timer-sourced entry with a timeline shows the popover: total hours, start/end
      timestamps in `"hh:mm am/pm, mm-dd-yyyy"` form, and a colored event list matching what
      actually happened during that session (including any breaks taken, labeled with their
      preset reason). Manual entries show no popover.
- [ ] Notes are visually distinguishable as their own field, not folded into the row's general
      text.
- [ ] Admin/PM/HR/super_admin see a Source value (Manual/Timer) per entry; developers do not.
- [ ] A developer can add a manual entry by picking a date + start time + end time (hours is
      computed, not typed); the same UI edits an existing entry, including correcting a
      timer-sourced entry's period without altering its recorded timeline.
- [ ] Pre-migration entries (`start_time`/`end_time`/`timeline` all null) render without error.
- [ ] `npx tsc --noEmit` and `pnpm lint` both pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```
Manual/browser: as a developer, start a timer on an assigned task, pause it, take a break, end
the break, resume, then stop — open the Time Logs tab and hover the new entry to confirm the full
timeline renders correctly with hh:mm totals and a correct Time Period. Add a manual entry via
date+start+end time. Edit both a manual and a timer-sourced entry's period. Sign in as PM/admin
and confirm the Source column appears with no write controls.

## Compatibility Touchpoints

- New migration must be applied by the user before these columns exist — until then, the new
  routes' writes to `start_time`/`end_time`/`timeline` will fail. Sequence migration 095 after
  094 (already applied/pending from task 214).
- Does not affect Zoho export/import routes — imported rows simply keep `start_time`/`end_time`/
  `timeline` null, same as any other pre-migration row.
- Does not affect the MCP tool inventory.

## Implementation Notes

### What Changed
- Added migration 095: `active_timers.timeline` (jsonb, default `[]`) and `time_logs.start_time`/
  `end_time`/`timeline` (all nullable).
- Updated `database.ts` types for both tables to match.
- Added `src/lib/timer/timeline.ts` (`TimerEvent`, `appendTimerEvent`) and two new formatters in
  `src/lib/timer/format.ts` (`formatClockTime` — "hh:mm am/pm" lowercase both sides;
  `formatFullTimestamp` — "hh:mm am/pm, mm-dd-yyyy", popover-only style).
- All 6 timer routes now append one event each: `start` resets `timeline` to a fresh
  `[{type:"started"}]` array (mirrors its existing `accumulated_seconds: 0` reset on a reused
  row), `pause`→`"paused"`, `resume`→`"resumed"`, `break/start`→`"break_start"` (+`break_type`),
  `break/cancel`→`"break_end"`, `stop`→`"stopped"` and now also writes `start_time` (derived from
  `timeline[0].at`), `end_time` (now), and the full `timeline` array onto the `time_logs` insert.
- `time-logs/route.ts` GET now returns `canSeeSource` (admin/super_admin/pm/hr) alongside
  `canAdd`, and each entry includes `source`, `start_time`, `end_time`, `timeline`. POST now
  takes `start_time`/`end_time` (ISO) instead of a raw `hours` number — hours is always computed
  server-side from the difference.
- `time-logs/[timeLogId]/route.ts` PATCH mirrors the same `start_time`/`end_time`-driven
  recompute; `timeline` is never part of the patchable field set (left untouched — the
  historical record of what actually happened stays intact even after a period correction).
- `_time-log-form.tsx` — Date + Start Time + End Time inputs (both `type="time"`) replace the
  single decimal Hours input; client combines date+time into ISO via
  `new Date(\`${date}T${time}:00\`).toISOString()`. Legacy entries with no recorded period show
  blank time inputs rather than a guessed value.
- `_task-time-logs.tsx` — every hours display now uses `formatHoursAsHHMM()`; added the Time
  Period value (em dash fallback when unset), a role-gated Source pill (Manual/Timer), a
  distinctly-labeled Notes row, and wraps the hours value in the new
  `TimerTimelinePopover` for timer-sourced entries that have a non-empty `timeline`.
- Added `_timer-timeline-popover.tsx` — built on the shared `Tooltip`/`TooltipTrigger`/
  `TooltipContent` primitives with a widened `className` (`w-[260px]`), showing total hours,
  start/end timestamps, and a colored event list (green started / red stopped / amber break
  events labeled via `BREAK_LABELS` / neutral paused-resumed).

### Files Changed
- `supabase/migrations/095_timer_timeline_and_time_logs_period.sql` - new columns
- `src/types/database.ts` - type updates for active_timers + time_logs
- `src/lib/timer/timeline.ts` - new `TimerEvent`/`appendTimerEvent` helper
- `src/lib/timer/format.ts` - added `formatClockTime`, `formatFullTimestamp`
- `src/app/api/v2/timer/start/route.ts` - append/reset `"started"` event
- `src/app/api/v2/timer/pause/route.ts` - append `"paused"` event
- `src/app/api/v2/timer/resume/route.ts` - append `"resumed"` event
- `src/app/api/v2/timer/break/start/route.ts` - append `"break_start"` event
- `src/app/api/v2/timer/break/cancel/route.ts` - append `"break_end"` event
- `src/app/api/v2/timer/stop/route.ts` - append `"stopped"` event, write period+timeline to time_logs
- `src/app/api/v2/tasks/[taskId]/time-logs/route.ts` - canSeeSource, period-based POST
- `src/app/api/v2/tasks/[taskId]/time-logs/[timeLogId]/route.ts` - period-based PATCH
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_time-log-form.tsx` - Date/Start/End inputs
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-time-logs.tsx` - hh:mm, period, notes, source, popover wiring
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_timer-timeline-popover.tsx` - new popover component

### Deviations From Plan
- None from the approved plan. One clarification made during implementation: when a break stays
  active after a timer stops (the pre-existing "row survives with only break_* fields" branch in
  `stop/route.ts`), the surviving `active_timers` row's stale `timeline` from the just-ended
  session is left as-is rather than explicitly cleared — harmless because the next `start` call
  always resets it to a fresh single-event array before any new session begins, so no stale data
  can ever reach a `time_logs` row.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (no output/warnings)
- Browser/manual verification - SKIPPED (not run in this session; recommend testing the full
  start→pause→break→resume→stop cycle and both add/edit flows before shipping, per this doc's
  Verification section)

### QA Follow-Up (post-implementation, same Testing pass)
User-reported issues against the shipped tab, fixed directly (no new task — same unit of work,
still in Testing):
- **Row alignment** — `_task-time-logs.tsx`'s row was `items-start` with notes rendered as a
  second wrapped line below the meta row, so the avatar/text baseline never centered. Reworked
  into a single always-one-line row (`items-center` on both the `<li>` and its inner flex
  container; `leading-none` on each text span) — notes and timer details moved off that second
  line entirely (see next point), so there's no longer a variable-height row to misalign.
- **Timer-details and notes affordances were invisible** — the original design made the hours
  value itself the (only) popover trigger for timer-sourced entries, with no visual cue it was
  interactive, and rendered notes as permanently-visible inline text (which also caused the
  alignment bug above). Replaced both with dedicated icon-button triggers next to the hours/
  period: a `Timer` icon (opens `TimerTimelinePopover`) shown only when `hasRecordedTimeline()`,
  and a `MessageSquare` icon (opens a plain `Tooltip`/`TooltipContent` with the note text) shown
  only when `entry.note` is set. Rows without either just don't render that icon — no dead/
  disabled placeholder icons.
- **Relative-time ambiguity ("3h ago" question)** — confirmed by reading `formatRelativeTime()`
  (`src/lib/utils.ts`) that it never reverts to an absolute timestamp; it counts hours up to 23
  then switches to "Xd ago" indefinitely. Since that shared util is also used by comments
  elsewhere, added a tab-scoped `formatLoggedAt()` in `_task-time-logs.tsx` instead of changing
  the shared one: same calendar day → relative ("3h ago"), any earlier day → exact
  `"{formatDate}, {formatClockTime}"` (e.g. "Aug 4, 2026, 05:15 pm").
- **Time Period text was effectively invisible** — screenshot showed "09:39 pm - 09:45 pm"
  rendering near-white-on-white. Root cause: `timePeriod()`'s returned `<span>` never set an
  explicit text color (only `whitespace-nowrap font-mono tabular-nums`), so it fell back to
  whatever color it inherited from its ancestor chain instead of a real design-token color.
  Fixed by adding `text-[#5F6A88]` directly on that span — the same muted-gray token already
  used for the day-subtotal and relative-time text elsewhere in this same tab.

Files touched in this follow-up: `_task-time-logs.tsx` only (row markup restructure, new
`formatLoggedAt` helper, new `Timer`/`MessageSquare` icon-trigger imports, explicit text color on
`timePeriod()`'s span). Re-ran
`npx tsc --noEmit` and `pnpm lint` — both PASS.
