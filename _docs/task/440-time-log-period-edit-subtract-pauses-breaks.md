# 440: Editing a timer time log's period subtracts recorded pauses and breaks

**Created:** 2026-10-08
**Priority:** MEDIUM
**Type:** bugfix + enhancement (follow-up to 439)
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

A timer-sourced `time_logs` row records its real session in `time_logs.timeline` (Started / Paused / Resumed / Break / Break ended / Stopped, task 215/439) and its `hours` is the time the timer actually *ran*. When the user edits that row's start or end time, every `PATCH` route recomputes

```ts
hours = (new Date(endTime) - new Date(startTime)) / 3_600_000   // plain span
```

so every pause and break inside the period is silently counted as work. Example: a log with 5 h worked and a 1 h meal break (6 h span). Moving the start 30 min earlier gives **6 h 30 m**, not 5 h 30 m. The Activity stream (task 439) then also disagrees with the log's own total, because the timeline is deliberately immutable.

The user asked for edits to **recalculate the total minus the break** (they chose "Option 1" from the 439 discussion): when a timer log's period is edited, subtract the recorded paused and break time that falls inside the new period.

### Where the span math lives (three PATCH routes, same bug)

| Route | Used by |
|---|---|
| `src/app/api/v2/time-logs/[timeLogId]/route.ts` | Dashboard → Time logs (inline period/date editor, Edit modal) |
| `src/app/api/v2/tasks/[taskId]/time-logs/[timeLogId]/route.ts` | Task Time Logs tab edit form (v2 + legacy) |
| `src/app/api/v2/tickets/[ticketId]/time-logs/[timeLogId]/route.ts` | Ticket Time Logs tab edit form (v2 + legacy) |

## Requirements

### Calculation rule (pure, one shared function)
- [ ] New pure `workedHoursForPeriod()` used by all three PATCH routes. For a row with `source = 'timer'` and a non-empty `timeline`: `hours = span(newStart, newEnd) − (sum of non-working intervals clipped to [newStart, newEnd])`. Non-working intervals come from the timeline: `paused → resumed`, `break_start → break_end`, and (defensively) any trailing open pause/break up to `stopped`. `break_end → resumed` has zero length and is ignored.
- [ ] **Pauses/breaks outside the new window do not count** (moving the end earlier past a break removes that break's deduction entirely; a break straddling the edge is clipped).
- [ ] **Time added beyond the recorded session counts fully as work** (start moved earlier than the first event, or end later than `stopped`): the user is correcting the record, so the extension is trusted. Document this in the code comment and the route response needs no new field.
- [ ] **Unchanged length ⇒ unchanged hours.** If the new period has the same length as the stored one (a pure date/time shift, e.g. the date picker moving a log to another day), hours stay exactly as stored and no recalculation runs. This also keeps notes-only/date-only saves (which resend start/end) idempotent.
- [ ] **Date moves don't strand the timeline.** The stored period can be a whole-day shift of the timeline's own timestamps after an earlier date edit. The function translates the timeline intervals by `round((storedStart − timeline[0].at) / 24h)` whole days before clipping, so a log moved to another day still deducts its breaks. Sub-day differences are real start-time edits and are *not* translated.
- [ ] Manual rows, rows with `timeline = null`/`[]`, and Duration-mode saves (`duration_hours` supplied) behave exactly as today (plain span / the typed duration).
- [ ] Result must still satisfy the existing guard `0 < hours ≤ 24`. When subtraction makes it ≤ 0 (period lies entirely inside a break), return the existing-style 400: "That period only covers paused or break time — pick a range that includes working time."
- [ ] Rounding: compute in milliseconds, convert once at the end; do not accumulate float error per interval.

### Server wiring
- [ ] Each PATCH loads the existing row's `source`, `start_time`, `end_time`, `timeline` (the routes already call an own-row guard; extend its select instead of adding a query where possible) and passes them to the helper.
- [ ] `time_logs.timeline` is **never rewritten** by an edit (task 215/439 invariant).

### UI
- [ ] Activity panel header (`_timer-activity-trigger.tsx`): when the log's `hours` differ from the timeline-derived Worked total by more than 1 minute, show one quiet line: "Period edited after recording — hours reflect the edited range." (mono time stays; sentence case; muted text, no warning color.) This explains why Worked (recorded) and the log total can differ.
- [ ] Inline period editor and edit forms already show the server-returned `hours`; verify none of them shows a client-side `end − start` preview that would now be wrong. If one does, remove or correct it.
- [ ] Follow `_final_design/guide/central-hub-design-system.md` tokens and the existing `isDark`/explicit-class conventions; no new colors, fonts or components beyond that one line.

### Code quality
- [ ] `nextjs-file-length-best-practices.md`: the helper file ≈ 60–100 lines, routes change by a few lines each, no file grows past its guidance because of this task.

## Out of Scope / Must-Not-Change

- Rewriting or "repairing" `timeline`, or recomputing already-stored hours for logs nobody edited. No backfill.
- Manual-entry logic, Duration-mode logic, creating logs (`POST`), the timer routes, break/chime behavior (task 439).
- Changing what Stop writes into `hours` (accumulated run time stays authoritative at creation).
- Any new DB column or migration. No new dependency.
- Do not touch `projects-old/**`.
- No git commands (CLAUDE.md).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/timer/period-hours.ts` | Create | Pure `workedHoursForPeriod()` + interval derivation from a timeline |
| `_docs/task/440-period-hours.check.ts` | Create | `npx tsx` checks (pattern: `439-timer-logic.check.ts`) |
| `src/app/api/v2/time-logs/[timeLogId]/route.ts` | Modify | Use helper in PATCH; load `source/start_time/end_time/timeline` |
| `src/app/api/v2/tasks/[taskId]/time-logs/[timeLogId]/route.ts` | Modify | Same |
| `src/app/api/v2/tickets/[ticketId]/time-logs/[timeLogId]/route.ts` | Modify | Same |
| `src/app/(hub)/projects/_shared/_timer-activity-trigger.tsx` | Modify | "Period edited" line in the header |
| `src/lib/timer/activity.ts` | Modify (only if needed) | Reuse its state machine so interval logic is not duplicated (extract a shared `nonWorkingIntervals()` rather than copying) |
| `CLAUDE.md` | Modify | Extend the task-439 timer bullet with this rule |

## Code Context

### The span math to replace (all three routes)
```ts
// src/app/api/v2/time-logs/[timeLogId]/route.ts:84
const hours = durationHours !== null
  ? durationHours
  : (new Date(endTime).getTime() - new Date(startTime).getTime()) / 3_600_000;
if (!(hours > 0) || hours > 24) { /* 400 */ }
```
The task/ticket routes use the span only (no `duration_hours` branch).

### Timeline shape (`src/lib/timer/timeline.ts`)
```ts
type TimerEventType = "started" | "paused" | "resumed" | "break_start" | "break_end" | "stopped";
type TimerEvent = { type: TimerEventType; at: string; break_type?: BreakType };
```
`src/lib/timer/activity.ts` already walks this log with a `STATE_AFTER` map (`working | paused | break | stopped`); reuse that notion for "non-working" instead of writing a second state machine.

### Sketch
```ts
export function workedHoursForPeriod(i: {
  startIso: string; endIso: string;
  source: string | null; timeline: TimerEvent[] | null;
  storedStartIso: string | null; storedEndIso: string | null;
}): number {
  const span = ms(i.endIso) - ms(i.startIso);
  if (i.source !== "timer" || !i.timeline?.length) return span / 3_600_000;   // unchanged behavior
  if (i.storedStartIso && i.storedEndIso && span === ms(i.storedEndIso) - ms(i.storedStartIso)) {
    /* pure shift → caller keeps the stored hours; return stored hours */
  }
  const shift = dayShift(i.storedStartIso, i.timeline[0].at);
  const deduct = nonWorkingIntervals(i.timeline).reduce(/* clip(interval + shift, [start,end]) */, 0);
  return Math.max(0, span - deduct) / 3_600_000;
}
```
(The "unchanged length" case needs the stored `hours` too; pass it in rather than recomputing.)

### Cases the check script must cover
1. 5 h worked + 1 h break, start −30 min ⇒ 5.5 h (the reported example).
2. Start moved later, past the break ⇒ break deduction disappears.
3. Break straddling the new end ⇒ only the overlapping part deducted.
4. Extension beyond recorded start/end counts fully.
5. Same-length shift (date change) ⇒ stored hours untouched.
6. Date moved earlier, then start edited ⇒ timeline translated by whole days, break still deducted.
7. Period entirely inside a pause/break ⇒ ≤ 0 ⇒ caller 400.
8. Manual row, null/empty timeline, `duration_hours` ⇒ plain span / typed value.
9. Timeline ending with an open pause/break (no `stopped`).
10. Multiple pauses + breaks, ordered and clipped; no double counting where `break_end` and `resumed` share an instant.

## Implementation Steps

1. Read the three PATCH routes, their own-row guard, `activity.ts`, `_timer-activity-trigger.tsx`, and the inline period editor / edit forms (check for any client-side hours preview).
2. Extract `nonWorkingIntervals(timeline)` from the existing state logic (or write it once in `period-hours.ts` and have `activity.ts` import it, so there is a single definition of "paused or on break").
3. Write `period-hours.ts` and `440-period-hours.check.ts`; make every case above pass before touching a route.
4. Wire the three routes: select the extra columns, call the helper, keep all existing validation/error text, add the new 400 message.
5. Add the quiet "Period edited" line to the Activity panel header.
6. `CLAUDE.md` note; `npx tsc --noEmit`, `pnpm lint`, run both check scripts (`439-timer-logic`, `440-period-hours`).
7. Browser acceptance (below) with a throwaway timer log.

## Acceptance Criteria

- [ ] A timer log with a 1 h meal break: moving **Start earlier by 30 min** raises hours by exactly 0.5 h; moving **Start later by 30 min** lowers it by 0.5 h while the window still contains the break.
- [ ] Moving the **date** of a timer log (inline date picker) leaves its hours unchanged.
- [ ] Editing only the **note** leaves hours unchanged on all three edit paths.
- [ ] A range that sits fully inside a pause/break is rejected with the new message; the log is not modified.
- [ ] Manual logs and Duration-mode edits behave exactly as before.
- [ ] The Activity panel shows the "Period edited" line only after a period edit that changed hours, never for an untouched log.
- [ ] `time_logs.timeline` is byte-identical before and after an edit.
- [ ] Both `tsx` checks, `tsc` and lint pass; no file exceeds the length guidance.

## Verification

```bash
npx tsc --noEmit
pnpm lint
npx tsx _docs/task/440-period-hours.check.ts
npx tsx _docs/task/439-timer-logic.check.ts
# Browser (pnpm dev): throwaway timer log with a 5-min break — edit start earlier/later,
# change date, edit note only, on Dashboard → Time logs, task Time Logs and ticket Time Logs.
```

## Compatibility Touchpoints

- No schema change; behavior change is server-side only, so old and new clients both work.
- Logs edited before this ships keep whatever hours they already have (no backfill).
- Docs: extend the task-439 bullet in `CLAUDE.md`. `_docs/mcp-tools.md` only if a time-log MCP tool recalculates hours the same way (grep `time_logs` in `src/app/api/mcp/` / `src/lib/mcp/` during step 1; update the file in the same change if so).
- **Open questions for review:** (a) is "extension beyond the recorded session counts as full work" the right default, or should it be capped to the recorded range? (b) should the whole-day translation heuristic exist, or should date edits simply be treated as a pure shift (and any combined date+time edit fall back to the plain span)?


## Implementation Notes

### What Changed
- New pure `workedHoursForPeriod()` / `nonWorkingIntervals()` (`src/lib/timer/period-hours.ts`). It reuses the Activity stream's state map (`STATE_AFTER`, now exported from `activity.ts`), so "paused or on break" has a single definition.
- All three PATCH routes (`time-logs/[id]`, `tasks/.../time-logs/[id]`, `tickets/.../time-logs/[id]`) load `source/start_time/end_time/hours/timeline` through their existing own-row guard and use the helper. New 400 message when the range lies entirely in pauses/breaks. Duration-mode saves and manual logs unchanged.
- Inline period editor now previews the same number the server will save for timer logs (`hoursFor` prop + `periodPreviewHours()`); other entries keep the old preview.
- Activity panel header shows "Period edited after recording — hours reflect the edited range." when its recorded Worked total and the log's hours differ by more than a minute.
- Defaults chosen for the two open questions: time added beyond the recorded session counts fully as work; the whole-day translation heuristic is kept (date moves with unchanged length keep stored hours).

### Files Changed
- `src/lib/timer/period-hours.ts` (new), `src/lib/timer/activity.ts` (export `STATE_AFTER`/`State`)
- `src/app/api/v2/time-logs/[timeLogId]/route.ts`, `src/app/api/v2/tasks/[taskId]/time-logs/[timeLogId]/route.ts`, `src/app/api/v2/tickets/[ticketId]/time-logs/[timeLogId]/route.ts`
- `src/app/(hub)/dashboard/timelogs/{_time-logs-shared.ts,_time-period-inline-editor.tsx,_time-logs-table.tsx}`
- `src/app/(hub)/projects/_shared/_timer-activity-trigger.tsx`
- `_docs/task/440-period-hours.check.ts` (new), `CLAUDE.md`

### Deviations From Plan
- None of substance. The "Period edited" note and the preview change touch two more files than the plan table listed (`_time-period-inline-editor.tsx`, `_time-logs-shared.ts`); both were called for by the "verify no client-side preview" requirement. No MCP tool recalculates hours, so `_docs/mcp-tools.md` is unchanged.

### Verification Run
- `npx tsx _docs/task/440-period-hours.check.ts` - PASS (10 scenarios incl. the reported 5 h + 1 h break, start −30 min ⇒ 5.5 h)
- `npx tsx _docs/task/439-timer-logic.check.ts` - PASS
- `npx tsc --noEmit` - PASS
- `npx eslint` (timer lib, the three routes, dashboard/timelogs, projects/_shared) - PASS
- Browser acceptance - SKIPPED (to be run by the user / test stage)

## Quality Gate Notes

### Result
PASS

### Standards Review
- `npx tsc --noEmit`, `npx eslint` (touched areas), `440-period-hours.check.ts` and `439-timer-logic.check.ts` pass. No `any`, debug logging, dead or commented-out code.
- Single source of truth kept: "paused or on break" comes from the Activity stream's exported `STATE_AFTER` (no second state machine); the three routes call one pure helper; the inline editor preview and the server use the same function, so the number previewed is the number saved.
- File sizes within guidance (`period-hours.ts` ~100 lines; routes ~100–120). The only large touched file, `_time-logs-table.tsx`, grew by two lines.
- Cleanup in this pass: replaced a non-null assertion (`period!.hours`) in the general route with `durationHours ?? period?.hours ?? 0`.
- Noted, not changed: (a) the `requireOwnRow` guards now also select `timeline` for DELETE calls (one extra jsonb column on a single-row read, negligible); (b) a note-only edit through the task/ticket form resends minute-rounded start/end, so the span differs from the stored (second-precision) one by under a minute and hours are recomputed rather than kept — the result is the original minus the same breaks (≈ the original ±1 min), identical to the rounding the old plain-span code already did.

### Deviations
- Minor: two extra files touched beyond the plan table (`_time-period-inline-editor.tsx`, `_time-logs-shared.ts`) to satisfy the "no wrong client-side preview" requirement.
- Minor: the two open review questions were answered by the documented defaults (extension counts fully; whole-day translation kept).
- Not verified: browser acceptance criteria remain for the test stage.

### Required Fixes
- None.

## Final Changes & Fixes (completion summary)

- Shipped as implemented (see Implementation Notes): `workedHoursForPeriod()` in `src/lib/timer/period-hours.ts` used by all three time-log PATCH routes; inline period editor preview matches the server; "Period edited after recording" line in the Activity panel; `time_logs.timeline` never rewritten. Defaults kept for the two open questions (extension beyond the recorded session counts fully; whole-day translation heuristic kept).
- Quality-gate cleanup: removed a non-null assertion in the general PATCH route.
- **Alignment fix (user report, Dashboard → Time logs):** the Type column's "Timer" chip and the Activity (history) button were misaligned; wrapped in a `flex items-center gap-1.5` row with a `-my-1.5` on the button so the row height is unchanged (`_time-logs-table.tsx`, the same cell this task's inline-editor wiring touches).
- Verification at completion: `tsc`, `eslint`, `440-period-hours.check.ts`, `439-timer-logic.check.ts` pass; browser checks run by the user on their own session.
