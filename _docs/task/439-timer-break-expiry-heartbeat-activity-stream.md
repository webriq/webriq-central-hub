# 439: Timers — server-authoritative break expiry, break records, break chimes and per-log Activity stream (heartbeat/idle detection removed)

**Created:** 2026-10-08
**Priority:** HIGH
**Type:** bugfix + feature (data model change, migration written-not-applied)
**Recommended Tier:** deep
**Status:** Completed

> **SCOPE CHANGE (user request, after implementation):** the heartbeat / interruption-recovery part (piece B) was **removed**. People close the Hub and keep working, so "app went quiet" is not a signal that work stopped. Sections below that mention heartbeat, `auto_paused`, `gap_counted`, `interrupted_at`, the recovery banner/toast, Count the gap, and the heartbeat route/hook are historical — see "Scope change: heartbeat removed" at the end for what actually ships. The break-expiry fix (A), `timer_breaks` (C) and the Activity stream (D, start/pause/resume/break/stop only) remain.

---

## Overview

A developer reported a Meal Break (60 min) that lasted **1 h 44 min** before the timer "continued as a regular timer", leaving about 44 minutes of real work un-logged (they noticed a 7-hour day).

### Premise check: breaks are not in localStorage

The request says breaks live "just in localStorage". They do not. `grep localStorage` finds nothing in `src/lib/timer/` or `src/app/(hub)/_components/timer-*`. Break state is already server-persisted in `active_timers` (`break_type`, `break_started_at`, `break_duration_minutes`; migrations 092/095). The real defects are different and are what this task fixes.

### Root causes

1. **Break expiry is client-driven.** `timer-context.tsx` calls `cancelBreak()` from a `useEffect` when `breakRemainingSeconds === 0`. That depends on a `setInterval` running in an open tab. If the tab is closed, throttled or the laptop sleeps, nothing ends the break until the user comes back. `POST /api/v2/timer/break/cancel` then stamps `break_end` and `resumed` at **now** (not at the real expiry) and starts the new segment at **now**. So the overrun after expiry (the 44 minutes) is dropped from work time and shows up as a break that "lasted 1 h 44 min".
2. **Breaks leave no durable history.** A break is a few columns on the single `active_timers` row, deleted at stop or, for a break-only row, deleted on end. Task-less breaks vanish entirely; task breaks only survive as `break_start`/`break_end` events inside `time_logs.timeline`. There are no break records to report on or audit.
3. **No liveness signal for running timers.** A running timer is `segment_started_at` plus the clock. After a power cut, crash or shutdown, the segment keeps "running" on the server. The next morning, Stop logs the whole offline gap as worked hours. Or the user sees an unexplained state and distrusts it. There is nothing to cap the segment at the last moment the device was actually alive.
4. **The activity record is thin.** `TimerTimelinePopover` is hover-only (not keyboard or touch accessible), lists raw events without durations, has no pause-length or worked/paused/break totals, and can't represent "stopped counting because the device went away".

### Solution (summary)

| Piece | What |
|---|---|
| **A. Server-authoritative reconcile** | New pure `reconcileTimer(row, nowMs)` applies **backdated** transitions: an expired break ends at `break_started_at + duration` (not "now"), and the paused task timer resumes at that same instant. Applied by `GET /api/v2/timer` and the start of every timer route, so correctness no longer depends on any tab. |
| **B. Heartbeat + interruption recovery** | The client pings `POST /api/v2/timer/heartbeat` (~30 s, plus on `visibilitychange`/`focus`/`online`/`pageshow`) and stores `active_timers.last_heartbeat_at`. If a running timer's heartbeat is older than 5 min, reconcile **closes the segment at the last heartbeat**, sets status `paused`, stamps `interrupted_at`, and appends an `auto_paused` event. The next load shows a recovery banner with **Resume** (gap excluded) or **Count the gap** (gap added as worked time, audited). The 44-min case becomes a one-click recovery. |
| **C. Durable break records** | New `timer_breaks` table, one row per break, written at start and closed at end with `end_reason` (`expired`/`manual`/`stopped`/`interrupted`). Linked to `time_logs` on stop. Survives break-only sessions. |
| **D. Activity stream per time log** | The timeline popover becomes a click/keyboard-accessible **Activity** panel: ordered rows with exact times, per-segment durations, a Worked/Paused/Break summary strip, and distinct treatment for auto-paused and counted gaps. Also shown (compact) for the live session in the header timer widget. |

## Requirements

### Correctness (server)
- [ ] `reconcileTimer()` is pure and unit-checkable (no I/O): input row plus `nowMs`, output next row fields plus appended events (plus `timer_breaks` closures). Idempotent: running it twice with the same `nowMs` yields no further change.
- [ ] Expired break: appends `break_end` at `expiry` and, when an entity timer is underneath and `paused`, `resumed` at `expiry`; `segment_started_at = expiry`. Break-only row is deleted. Late discovery never changes the recorded times.
- [ ] Manual End break before expiry still ends at `now` (existing behavior). Manual End break after expiry is backdated to expiry (reconcile ran first).
- [ ] Stale running timer (`now - last_heartbeat_at > HEARTBEAT_STALE_SECONDS`, 300): segment closed at `last_heartbeat_at`, `accumulated_seconds += (last_heartbeat_at - segment_started_at)` (clamped ≥ 0), `status = 'paused'`, `interrupted_at = last_heartbeat_at`, event `auto_paused { at: last_heartbeat_at, reason: "no_activity" }`.
- [ ] Order: apply break expiry first, then the stale check against the **resumed segment**. A user who left during a break and never came back gets the post-expiry gap flagged for recovery, not silently counted as work.
- [ ] `stop` reconciles before computing hours, so stopping a timer the morning after a shutdown can no longer log the offline gap.
- [ ] `pause`/`resume`/`start`/`break/start`/`break/cancel` reconcile first.
- [ ] `POST /api/v2/timer/resume { include_gap?: boolean }`: plain resume clears `interrupted_at` (gap excluded). `include_gap: true` adds `now - interrupted_at` to `accumulated_seconds`, appends `gap_counted { at: now, gap_seconds }`, then resumes. Both append `resumed`.
- [ ] `POST /api/v2/timer/heartbeat` updates `last_heartbeat_at`, reconciles, and returns the serialized timer. Cheap: single row, own-row RLS.
- [ ] Concurrent reconciles (several tabs) cannot double-append events: reconcile writes are conditional on the row's `updated_at` (optimistic token). A lost race refetches and returns the winner's row.
- [ ] Degrades before migration 168 is applied: missing-column errors (`42703`/PostgREST schema errors) on heartbeat/`timer_breaks` writes are swallowed (non-fatal, one `console.warn`). The break-expiry backdating works without the migration because it needs no new column.

### Data (migration 168, written-not-applied per repo convention)
- [ ] `active_timers`: add `last_heartbeat_at timestamptz`, `interrupted_at timestamptz`.
- [ ] New `timer_breaks` (`id`, `user_id`, `break_type`, `planned_minutes`, `started_at`, `ended_at`, `end_reason`, `task_id`/`issue_id`/`project_id` snapshots, `time_log_id` nullable FK → `time_logs` on delete set null, `created_at`). RLS: owner full access (`user_id = auth.uid()`); read for the same manager roles as `time_logs_manager_read` (copy the exact policy from 026/094/048 rather than inventing one). Use `get_my_role()` per CLAUDE.md. Index `(user_id, started_at desc)`.
- [ ] `database.ts` updated (`active_timers` columns, `timer_breaks` Row/Insert/Update/Relationships[]).

### Client / UX
- [ ] Break auto-end stays in the client **only as a UI nicety**. The countdown hits zero, the client calls the idempotent reconcile and applies the server's row. It is no longer the thing that makes the timer correct.
- [ ] `use-timer-heartbeat.ts`: 30 s interval while a timer row exists, immediate beat on `visibilitychange` (visible), `focus`, `online`, `pageshow`; `navigator.sendBeacon` best-effort on `pagehide`. Pauses itself when there is no timer row.
- [ ] Recovery banner (header widget panel, and a one-time `toast` on first load that detects `interrupted_at`): states **who/what/when** ("Timer stopped counting at 2:14 PM — no activity for 3 h 12 m."), actions **Resume** and **Count the gap**. Persistent in the panel until resolved. `aria-live="polite"`.
- [ ] Widget trigger shows an "attention" state for `interrupted_at` (label text in tooltip plus amber styling, never color alone).
- [ ] **Activity stream** in: task Time Logs tab (v2 + legacy), ticket Time Logs (v2 + legacy), Dashboard → Time logs table, and the live session in the header widget panel.
- [ ] Activity stream rows: Started · Paused · Resumed · Break started/ended (type, planned vs actual) · Stopped counting (auto) · Gap counted, each with an exact time and the duration of the segment they close. Summary strip: Worked / Paused / On break (mono).
- [ ] Manual time-log entries (no `timeline`) keep rendering no Activity trigger (unchanged).
- [ ] Design System v2.0 (`_final_design/guide/central-hub-design-system.md`) followed. Apply `frontend-design` and `impeccable` at the UI step (see Implementation Steps).

### Code quality
- [ ] Follow `nextjs-file-length-best-practices.md`: components 100–250 lines (warn 250–300), hooks 30–100, route handlers 50–150 with logic extracted to `src/lib/timer/`, functions ≤ 50–75 lines. The file plan below is sized to that.

## Out of Scope / Must-Not-Change

- **No server cron / pg_cron sweeper.** Lazy reconcile makes hours correct without one. Auto-logging orphaned timers (user never returns) is a follow-up.
- **No idle/inactivity detection** (mouse/keyboard). Heartbeat measures "the app was alive", not "the person was working".
- Break durations stay fixed server-side (`BREAK_DURATIONS_MIN`); no custom-length breaks.
- `time_logs.timeline` remains an **immutable** historical record; editing a log's period never rewrites it (task 215). Old rows and manual entries stay timeline-less and degrade gracefully.
- Existing event types/semantics unchanged (`started|paused|resumed|break_start|break_end|stopped`); new types are additive, so old timelines render.
- Do **not** touch `projects-old/**` timer copies (superseded route; leave as is).
- No changes to MCP tool inventory (`_docs/mcp-tools.md`) unless a timer MCP tool turns out to read these columns (check during implementation; update the file in the same change if so).
- No new dependencies. Use the existing `sonner`, `lucide-react`, shared `Tooltip`.
- No git commands (CLAUDE.md).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/168_timer_heartbeat_breaks_interruption.sql` | Create | `active_timers.last_heartbeat_at` / `interrupted_at`; `timer_breaks` table + RLS + index. Written, **not applied**. |
| `src/types/database.ts` | Modify | New `active_timers` columns; `timer_breaks` table types |
| `src/lib/timer/constants.ts` | Modify | `HEARTBEAT_INTERVAL_MS` (30 000), `HEARTBEAT_STALE_SECONDS` (300) |
| `src/lib/timer/timeline.ts` | Modify | Add `auto_paused`, `gap_counted` types + optional `reason`, `gap_seconds`, `break_id` fields |
| `src/lib/timer/reconcile.ts` | Create | Pure `reconcileTimer(row, nowMs)` → `{ patch, events, closedBreak, deleteRow }` |
| `src/lib/timer/reconcile-apply.ts` | Create | Server helper: load row, reconcile, conditional write (`updated_at` token), close `timer_breaks`, return serialized row |
| `src/lib/timer/breaks.ts` | Create | `openBreakRecord()`, `closeBreakRecord()`, `linkBreaksToLog()` (non-fatal, pre-migration safe) |
| `src/lib/timer/activity.ts` | Create | Pure `buildActivity(timeline, endAt)` → rows + `{workedSeconds, pausedSeconds, breakSeconds}` |
| `src/app/api/v2/timer/route.ts` | Modify | GET runs reconcile |
| `src/app/api/v2/timer/heartbeat/route.ts` | Create | Heartbeat |
| `src/app/api/v2/timer/{start,pause,resume,stop}/route.ts` | Modify | Reconcile first; `resume` accepts `include_gap`; `stop` links breaks to the new `time_logs` row |
| `src/app/api/v2/timer/break/{start,cancel}/route.ts` | Modify | Reconcile first; open/close `timer_breaks`; cancel backdates to expiry |
| `src/app/(hub)/_components/timer-context.tsx` | Modify | Expose `resumeTimer({ includeGap })`, `interruptedAt`, `activity`; reconcile on break expiry; mount heartbeat |
| `src/app/(hub)/_components/use-timer-heartbeat.ts` | Create | Heartbeat hook (≈60–80 lines) |
| `src/app/(hub)/_components/timer-header-widget.tsx` | Modify | Slim down: delegate break panel / recovery banner / activity |
| `src/app/(hub)/_components/_timer-recovery-banner.tsx` | Create | Interruption banner + actions |
| `src/app/(hub)/_components/_timer-break-panel.tsx` | Create | Break picker/countdown extracted from the widget (keeps widget < 250 lines) |
| `src/app/(hub)/projects/_shared/_timer-activity-stream.tsx` | Create | Shared Activity panel (replaces the three tooltip popovers' content) |
| `src/app/(hub)/projects/_shared/_timer-activity-trigger.tsx` | Create | Accessible click/keyboard trigger wrapping the panel (popover on desktop, bottom sheet ≤ 640 px) |
| `src/app/(hub)/projects/{v2,legacy}/[projectId]/tasks/[taskId]/_timer-timeline-popover.tsx` | Modify | Thin re-export of the shared trigger (keeps imports in `_task-time-logs.tsx` stable) |
| `src/app/(hub)/projects/{v2,legacy}/[projectId]/{tasks/[taskId]/_task-time-logs,tickets/[ticketId]/_ticket-time-logs}.tsx` | Modify | Pass `timeline` to the shared trigger; minimal edits |
| `src/app/(hub)/dashboard/timelogs/_time-logs-table.tsx` | Modify | Add Activity trigger on timer-sourced rows (file is already 583 lines: **add only the import and ~6 lines**; do not grow it further) |
| `_docs/task/439-timer-logic.check.ts` | Create | `npx tsx` checks for `reconcile` and `activity` (pattern: `438-share-picker-logic.check.ts`) |
| `CLAUDE.md` | Modify | One bullet under Key Conventions: server-authoritative timer reconcile, heartbeat constants, `timer_breaks`, migration 168 written-not-applied |

## Code Context

### Where the 1 h 44 m comes from — `timer-context.tsx`
```tsx
// Auto-end the break once the countdown hits zero — the timer stays paused, no auto-resume.
useEffect(() => {
  if (breakRemainingSeconds === 0) void cancelBreak();   // only runs if a tab is alive
}, [breakRemainingSeconds, cancelBreak]);
```
The comment is also stale: `break/cancel` has auto-resumed since task 265.

### `break/cancel/route.ts` — stamps "now", not expiry
```ts
const now = new Date().toISOString();
const shouldResume = existing.status === "paused";
let timeline = appendTimerEvent(existing.timeline, { type: "break_end", at: now });
if (shouldResume) timeline = appendTimerEvent(timeline, { type: "resumed", at: now });
// ...update({ ..., segment_started_at: now })   ← overrun after expiry is lost
```
Target: `endAt = min(now, break_started_at + duration)`, and the same instant is used for `break_end`, `resumed` and `segment_started_at`.

### Reconcile sketch (`src/lib/timer/reconcile.ts`)
```ts
export type TimerRow = { /* active_timers columns used */ };
export type ReconcileResult = {
  patch: Partial<TimerRow> | null;      // null = nothing to do
  events: TimerEvent[];                 // appended in order
  breakClosed: { endedAt: string; reason: "expired" | "interrupted" } | null;
  deleteRow: boolean;                   // expired break-only row
};

export function reconcileTimer(row: TimerRow, nowMs: number): ReconcileResult {
  // 1) expired break -> backdated break_end (+ resumed) at expiry
  // 2) stale running segment (check against last_heartbeat_at, never earlier than segment start)
  //    -> close at last heartbeat, status paused, interrupted_at, auto_paused event
}
```
Edge cases to cover in the check script: break expires exactly at `nowMs`; break-only expiry; expired break with entity timer `running` underneath (cannot happen today, `break/start` pauses it, but must not corrupt); `last_heartbeat_at` null (pre-migration or first beat missed → fall back to `segment_started_at`, i.e. no stale cap); heartbeat before `segment_started_at`; multiple reconciles; clock skew (negative durations clamp to 0).

### Existing timeline model — `src/lib/timer/timeline.ts`
```ts
export type TimerEventType = "started" | "paused" | "resumed" | "break_start" | "break_end" | "stopped";
export type TimerEvent = { type: TimerEventType; at: string; break_type?: BreakType };
```
Add `auto_paused` (`reason`), `gap_counted` (`gap_seconds`). `break_start`/`break_end` may carry `break_id`. `eventLabel()` in the popover has an exhaustive `switch` with no default, so TypeScript will force every new type to be labelled.

### Design tokens already used by the timer UI (match them)
`#0B1533` ink · `#3A4565` body · `#5F6A88` muted · `#8A93AC` faint · `#E2E7F2` line · `#EDF0F7` line-soft · `#F4F6FB` hover · `#007BFF`/`#0063D6` blue · `--ok #177E48 / #E3F5EA` · `--warn #8A5A00 / #FFF3D6` · `--late #C0392B / #FDE8E6`. Panel: white, 1px line, 14 px radius, `0 8px 24px rgba(7,17,51,.10)`. Fonts: Space Grotesk panel titles only; JetBrains Mono for every time/duration; Inter elsewhere. Note: v2 files use the `isDark` prop + explicit utility pairs, never `dark:`. The timer widget is light-only today, so match that.

## Implementation Steps

1. **Read first.** `node_modules/next/dist/docs/` for route-handler conventions (AGENTS.md), the six `active_timers` routes (`start` has not been read yet), `026/048/094/113` for the exact RLS shape to mirror, and `_docs/mcp-tools.md` for any timer tool.
2. **Migration 168** + `database.ts` types. Written-not-applied; state it in the file header, like 127/151/166.
3. **Pure logic first** (`reconcile.ts`, `activity.ts`) + `_docs/task/439-timer-logic.check.ts`; run with `npx tsx` before any wiring.
4. **Server wiring:** `reconcile-apply.ts` (optimistic `updated_at` write), `breaks.ts`, then routes (GET, heartbeat, then the existing ones). Keep each handler ≤ 150 lines by pushing logic into `src/lib/timer/`.
5. **Client state:** `use-timer-heartbeat.ts`; extend `timer-context.tsx` (`interruptedAt`, `resumeTimer({ includeGap })`, activity). Fix the stale "no auto-resume" comment.
6. **UI, invoke the design skills before writing markup.** Run `frontend-design` and `impeccable` (shape/craft) for the recovery banner, Activity panel and widget changes, constrained to the Design System v2.0 tokens above. Their output may refine layout and hierarchy; it may not introduce new colors, fonts or card patterns. Rules to honor:
   - Activity panel: panel title in Space Grotesk 15/600; times and durations in JetBrains Mono; a quiet vertical rail (1px `--line-soft`) joining 8 px state dots (a rail, **not** a colored left-border stripe on a card); break rows get `--warn-bg` chip with the break type name; `auto_paused` gets a `--late` chip reading "Stopped counting" plus the explanatory sub-line; `gap_counted` gets a neutral chip "Gap counted". Meaning is carried by label text, not color alone.
   - Summary strip: three mono stats (Worked / Paused / On break), no nested cards.
   - Recovery banner: `--warn-bg` surface, `--warn` text, **Resume** as the blue pill, **Count the gap** as the ghost pill. No orange; there is no CTA on this screen. Sentence case; plain-language, no apology.
   - Interactions: 160 ms `cubic-bezier(.22,1,.36,1)` color transitions only; visible 2 px blue focus ring; Esc closes; trigger is a real `<button>` with `aria-label`; `prefers-reduced-motion` respected; no entrance animation.
   - Mobile: panel becomes a bottom sheet ≤ 640 px; touch targets ≥ 40 px.
   - Empty/odd states: a one-event timeline renders "Started 9:02 AM, still running" rather than a blank list.
7. **File-length pass:** confirm every new/changed file against the limits; `timer-header-widget.tsx` must end ≤ ~200 lines after extraction; do not grow `_time-logs-table.tsx`.
8. **CLAUDE.md** convention bullet; `npx tsc --noEmit`; `pnpm lint`.
9. **Browser acceptance** (below). Because migration 168 is not applied by the agent, run the acceptance both before it (degraded mode) and after the operator applies it.

## Acceptance Criteria

- [ ] Start a 5-minute break, **close the tab**, return 20 minutes later: the timeline shows `break_end` + `resumed` at exactly +5:00, not at return time; the segment counts from +5:00. With no heartbeat after the break, the banner offers **Count the gap**, and one click adds ~15 minutes as worked time with a `gap_counted` event.
- [ ] Same scenario with the tab **open but in the background** for the whole break: no banner, the timer is already running at expiry (heartbeat keeps it alive), and the log shows no gap.
- [ ] Reproduce the report: 60-min meal break, away 1 h 44 min with the tab closed → break recorded as **60:00**, 44 minutes surfaced as a recoverable gap rather than silently dropped.
- [ ] Kill the browser while a task timer is running (simulating shutdown), reopen 3 hours later: timer is `paused`, `interrupted_at` = last heartbeat (±30 s), banner reads "Timer stopped counting at …", **Resume** excludes the gap, **Count the gap** includes it, and both are visible in the stream.
- [ ] Stop pressed the next morning after an unexplained shutdown logs hours up to the last heartbeat only, never the overnight gap.
- [ ] Two tabs open: simultaneous reconciles produce one `break_end`, not two.
- [ ] Each timer-sourced log has an Activity trigger reachable by keyboard and touch; rows have exact times and segment durations; Worked + Paused + Break ≈ the log's start→end span.
- [ ] Break-only breaks (no task) now leave a `timer_breaks` row; task breaks are linked to their `time_logs` row after Stop.
- [ ] Before migration 168 is applied: no 500s, break expiry still backdates correctly, heartbeat/`timer_breaks` writes no-op with a single warning.
- [ ] Manual entries and pre-existing timer logs (old timelines) still render correctly.
- [ ] Visual review against the design guide and style guide HTML: tokens, fonts, focus rings, no stripes/nested cards/emoji; light mode only (matches the widget today).
- [ ] No new/changed file exceeds the file-length guidance (or has a stated reason).

## Verification

```bash
npx tsc --noEmit
pnpm lint
npx tsx _docs/task/439-timer-logic.check.ts      # reconcile + activity pure logic
# Browser (pnpm dev): the break/interruption scenarios in Acceptance Criteria.
# Simulate time passing without waiting: temporarily shorten via a dev-only SQL
# update of active_timers.break_started_at / last_heartbeat_at, then reload.
```

## Compatibility Touchpoints

- **Schema:** migration 168 is additive; deployed code must keep working before it is applied (degraded mode above). Operator applies it, then re-runs acceptance.
- **`timeline` JSON shape:** additive event types only, so old logs and the three existing popover copies keep working during rollout.
- **Realtime / other readers:** nothing else reads `active_timers` apart from `src/app/api/v2/timer/*`, `projects/_shared/_task-timer-button.tsx`, `_project-detail.tsx`, `dashboard/_dev/_timer-card.tsx`, and the header widget. Re-grep for `active_timers` and `useTimer` consumers after changing the `useTimer()` API. `resumeTimer` gains an optional argument, so existing call sites stay valid.
- **Docs:** `CLAUDE.md` bullet. `_docs/mcp-tools.md` only if a timer MCP tool is affected.
- **Open follow-ups (not in this task):** orphaned-timer auto-log after N hours (cron), idle detection, timer/break reporting UI over `timer_breaks`.


## Implementation Notes

### What Changed
- **Server-authoritative reconcile:** pure `reconcileTimer()` + `loadReconciledTimer()` (optimistic `updated_at` token). Expired breaks end/resume at the real expiry instant; stale running segments are capped at the last heartbeat. Applied first by GET, heartbeat, start, pause, resume, stop, break/start and break/cancel.
- **Heartbeat + recovery:** new `POST /api/v2/timer/heartbeat` (reconciles *before* stamping). Client hook pings every 30 s and on visibility/focus/online/pageshow, plus `sendBeacon` on pagehide. `resume` accepts `include_gap`. Recovery banner in the header panel and a one-time sonner toast.
- **Durable breaks:** `timer_breaks` table (migration 168), opened on break start, closed on expiry/manual end, linked to the `time_logs` row on stop.
- **Activity stream:** `buildActivity()` + shared `TimerActivityStream` / `TimerActivityTrigger` (click/keyboard/touch, portaled via the Share Picker's anchored-menu hook, bottom sheet on narrow screens). Wired into task + ticket Time Logs (v2 + legacy, via the old popover files now re-exporting), Dashboard → Time logs (API now returns `timeline` for timer rows), and the live session in the header widget.
- Client countdown reaching zero no longer ends the break itself; it just asks the server (heartbeat) to reconcile, retrying every 5 s.

### Files Changed
- `supabase/migrations/168_timer_heartbeat_breaks_interruption.sql` - new columns + `timer_breaks` + RLS (written, NOT applied)
- `src/types/database.ts` - `active_timers` columns, `timer_breaks`
- `src/lib/timer/{constants,timeline,format}.ts` - heartbeat constants, new event types, `formatDurationShort`
- `src/lib/timer/{reconcile,reconcile-apply,breaks,activity}.ts` - new
- `src/app/api/v2/timer/{route,start,pause,resume,stop}/…`, `break/{start,cancel}`, new `heartbeat/route.ts`
- `src/app/(hub)/_components/{timer-context,timer-header-widget}.tsx` (modified, 168 / 210 lines); new `use-timer-heartbeat.ts`, `use-interruption-toast.ts`, `_timer-break-panel.tsx`, `_timer-recovery-banner.tsx`, `_timer-live-activity.tsx`
- `src/app/(hub)/projects/_shared/_timer-activity-{stream,trigger}.tsx` - new; `projects/{v2,legacy}/.../_timer-timeline-popover.tsx` - now re-exports
- `src/app/(hub)/projects-old/.../_timer-timeline-popover.tsx` - two added cases only (exhaustive `Record`/`switch` stopped compiling with the new event types)
- `src/app/api/v2/time-logs/route.ts`, `dashboard/timelogs/{_time-logs-shared.ts,_time-logs-table.tsx,_time-log-entry-modal.tsx}` - timeline plumbing + Activity trigger
- `_docs/task/439-timer-logic.check.ts` - pure-logic checks; `CLAUDE.md` - convention bullet

### Follow-up added after review (user request): break chimes
- `src/lib/timer/chime.ts` (Web Audio synthesized warning/end chimes, mute preference in localStorage), `use-break-chime.ts` (warning at 10 min of a meal break / 5 min of a coffee break, ring + toast at expiry, also when the server cleared the break while the tab was hidden), `BREAK_WARNING_MINUTES` in `constants.ts`, mute toggle in `_timer-break-panel.tsx`, `unlockChime()` on break start. Resume-at-expiry was already server-side (reconcile); no change needed.

### Deviations From Plan
- Narrow-screen "bottom sheet" is a fixed full-width panel (no backdrop/drag) rather than a separate sheet component.
- Heartbeat is stamped by its own best-effort update after `start`/`resume` (not part of their payloads) so a pre-migration database never fails those writes.
- `break/cancel` returns 200 with the current timer when no break is active (idempotent) instead of the previous 400.
- `projects-old` popover touched minimally for compilation only (see above).
- Ticket Time Logs needed no edit: they import the v2/legacy task popover path, which re-exports the shared trigger.
- `_time-logs-table.tsx` grew by ~10 lines (already over guidance at 583; pre-existing).

### Verification Run
- `npx tsc --noEmit` - PASS
- `npx eslint` (timer lib, routes, components, timelogs) - PASS
- `npx tsx _docs/task/439-timer-logic.check.ts` - PASS
- Browser acceptance (break tab-closed, shutdown simulation, two tabs, migration before/after) - SKIPPED (not run by the agent; needs dev server + migration 168 applied by the operator)

## Quality Gate Notes

### Result
PASS

### Standards Review
- `npx tsc --noEmit`, `npx eslint` on all touched timer areas and `npx tsx _docs/task/439-timer-logic.check.ts` pass; no `any`, debug `console.log`, commented-out code or unused imports in new files (`console.warn/error` only on intentional degraded-mode / failure paths).
- File length: every new/changed file is within guidance (largest: `timer-header-widget.tsx` 210, `timer-context.tsx` 174, `reconcile.ts` 102, `activity.ts` 100; route handlers 50–95 lines). `_time-logs-table.tsx` stays over guidance (~590) but only gained ~10 lines of pre-existing-pattern plumbing.
- Logic is correctly layered: pure `reconcile`/`activity` (checked), thin I/O wrappers, UI split into single-purpose components. Cleanup made in this pass: dropped a redundant `cn()` wrapper in `_timer-activity-trigger.tsx`.
- Noted, not changed (low value / risk): the initial `GET /api/v2/timer` effect in `timer-context.tsx` duplicates `refresh()`; `BreakEndReason` keeps `"interrupted"` because the migration's check constraint allows it though no code path writes it yet.

### Deviations
- Minor: narrow-screen panel is a fixed full-width panel, not a separate bottom-sheet component.
- Minor: heartbeat stamped by a separate best-effort update after start/resume (pre-migration safety).
- Minor: `break/cancel` is idempotent (200) instead of 400 when no break is active.
- Medium (visible, low risk): `projects-old` popover copy edited (two cases) solely so exhaustive types compile, against the "don't touch projects-old" note.
- Medium: break chimes were added after planning at the user's explicit request (not in the original doc); self-contained, client-only, mutable.
- Not verified here: browser acceptance criteria and migration 168 application remain for the test stage.

### Required Fixes
- None.

### Follow-up: heartbeat cost reduction (user request)
- Heartbeat route authenticates with `getClaims()` instead of `getUser()` (no auth-server round trip).
- `reconcileTimerRow()` reports `changed`; when nothing changed the route returns `{ unchanged: true, updated_at }` and skips the task/project title lookups. The client (`timer-context.tsx` `beat`) compares the stamp with its own `updated_at` and fetches the full timer only on mismatch (another tab/device changed it). `ActiveTimerRow` gained `updated_at`.
- `use-timer-heartbeat.ts` ignores pings within 5 s of the previous one (visibility/focus/online/pageshow fire together).
- Verified: `tsc`, `eslint`, both `tsx` checks pass. Not exercised live.

### Scope change: heartbeat removed (user request)
- **Removed:** `POST /api/v2/timer/heartbeat`, `use-timer-heartbeat.ts`, `use-interruption-toast.ts`, `_timer-recovery-banner.tsx`, the stale-segment/auto-pause step in `reconcileTimer`, `stampHeartbeat`, `resume { include_gap }`, `auto_paused` / `gap_counted` events, the "Not counted" stat/chips, `HEARTBEAT_*` constants, and the interruption styling in the header widget. `active_timers.last_heartbeat_at` / `interrupted_at` were dropped from migration 168 (renamed `168_timer_breaks.sql`; now only `timer_breaks`). **If 168 was already applied with the old content, those two columns are unused and harmless; drop them with `alter table active_timers drop column last_heartbeat_at, drop column interrupted_at;` if desired.**
- **Kept:** server-side break-expiry backdating (reconcile on every route), `timer_breaks`, break chimes, the Activity stream (Started / Paused / Resumed / Break / Break ended / Stopped, durations, Worked / Paused / On break totals) and the live "Session activity" section.
- **How an open tab ends a break now:** when its countdown reaches zero the client re-fetches `GET /api/v2/timer` (retrying every 5 s), which reconciles server-side; a closed tab is handled by the next request of any kind.
- **Verified:** `tsc`, `eslint`, `439-timer-logic.check.ts`, `439-reconcile-apply.check.ts` pass; no heartbeat/interrupt references remain in `src/`.

## Final Changes & Fixes (completion summary)

What shipped, in the order it happened after the original plan:
1. **Server-authoritative break expiry** — `reconcileTimer()` / `loadReconciledTimer()` run first in every `/api/v2/timer/*` route; an expired break ends and the task/ticket timer resumes at the real expiry time, with an `updated_at` optimistic token so two tabs never double-append. Fixes the reported 60-min break that lasted 1 h 44 m.
2. **`timer_breaks`** (migration `168_timer_breaks.sql`, written-not-applied) — one durable row per break, linked to the time log on Stop; writes are best-effort so the app works before the migration is applied.
3. **Break chimes** (user request) — Web Audio warning at 10 min (meal) / 5 min (coffee) left, ring + "Break over" toast at expiry, mute toggle; the end cue also fires when the server cleared the break in a hidden tab.
4. **Heartbeat cost reduction** (user request) — `getClaims()`, slim `{unchanged, updated_at}` response, 5 s ping de-duplication. **Superseded by item 5.**
5. **Heartbeat / idle detection removed** (user request) — the Hub being open or closed must not affect a timer, so the heartbeat route/hook, auto-pause, "Count the gap", recovery banner/toast and the `last_heartbeat_at`/`interrupted_at` columns were removed. An open tab now just re-fetches `GET /api/v2/timer` when its break countdown reaches zero.
6. **Activity stream** — per-log Activity panel (click/keyboard/touch) on task + ticket Time Logs, Dashboard → Time logs, and a collapsible "Session activity" in the header timer panel; only Started / Paused / Resumed / Break / Break ended / Stopped, with durations and Worked / Paused / On break totals.
7. **Alignment fix (user report)** — on Dashboard → Time logs the "Timer" source chip and the Activity (history) button were vertically misaligned because they sat inline beside each other; they are now in a `flex items-center gap-1.5` row in `_time-logs-table.tsx`.
8. **Follow-up** — editing a timer log's period now subtracts recorded pauses/breaks: see task 440.

Verification at completion: `tsc`, `eslint`, `439-timer-logic.check.ts` and `439-reconcile-apply.check.ts` pass; `pnpm build` passed before the heartbeat removal. Browser acceptance was run by the user on their own session (no automated browser pass was recorded by the agent).
Deployment note: apply `supabase/migrations/168_timer_breaks.sql`; if an earlier version of 168 (with the heartbeat columns) was already applied, `last_heartbeat_at` / `interrupted_at` on `active_timers` are unused and can be dropped.
