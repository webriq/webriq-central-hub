# Test Report — 439: Timers — server-authoritative break expiry, interruption recovery, Activity stream

**Date:** 2026-10-08
**Task doc:** `_docs/task/439-timer-break-expiry-heartbeat-activity-stream.md`
**Quality gate:** PASS (see task doc's Quality Gate Notes)
**Scope change after this report:** the heartbeat / interruption-recovery feature was removed at the user's request (see task doc); rows below that mention heartbeat, auto-pause or Count the gap no longer apply. Static checks were re-run afterward (tsc, eslint, both `tsx` checks: PASS); `pnpm build` was not re-run.
**Overall result:** PARTIAL — all automated/static checks PASS; live browser acceptance NOT RUN (blocked on migration 168 + a live session). Task stays in **Testing**.

## Environment

- Local checkout, Node 20, `pnpm`. No dev server started and no timers created: the live scenarios start/stop timers and breaks on the signed-in user's real data and need migration 168 applied (the agent never applies migrations).

## Static & automated checks

| Command | Result |
|---|---|
| `npx tsc --noEmit` | PASS |
| `npx eslint src/lib/timer src/app/api/v2/timer "src/app/(hub)/_components" "src/app/(hub)/projects/_shared" "src/app/(hub)/dashboard/timelogs" src/app/api/v2/time-logs` | PASS |
| `npx tsx _docs/task/439-timer-logic.check.ts` | PASS — expiry backdating (incl. exact boundary, break-only delete, fresh vs dead heartbeat), stale cap, null/skewed heartbeat, idempotence, interrupted-not-resumed, activity totals/gap/legacy timelines |
| `npx tsx _docs/task/439-reconcile-apply.check.ts` (new, in-memory fake Supabase) | PASS — two concurrent reconciles append `break_end`/`resumed` exactly once; break record closed once |
| `npx tsx _docs/task/438-share-picker-logic.check.ts` (shared hook neighbour, regression) | PASS |
| `pnpm build` (webpack production build) | PASS — exit 0, all routes compile incl. `/api/v2/timer/heartbeat` |

## Acceptance criteria status

| Criterion | Status | Evidence |
|---|---|---|
| Break expiry backdated to real expiry (tab closed) | PASS (logic) / NOT RUN (browser) | check script scenarios 2, 4 |
| Background tab open → no gap, timer already running | PASS (logic) / NOT RUN (browser) | scenario 2b; heartbeat reconcile order |
| 60-min break + 1h44 away → 60:00 break, 44 min recoverable gap | PASS (logic) | scenario 2c, 10; Count-the-gap path in `resume` route not exercised live |
| Browser killed mid-run → paused at last heartbeat, banner, Resume / Count gap | PASS (logic) / NOT RUN (browser/UI) | scenario 6, 10 |
| Stop next morning logs only up to last heartbeat | PASS (logic) | stop route reconciles first; not exercised live |
| Two tabs → one `break_end` | PASS | reconcile-apply check |
| Activity trigger keyboard/touch reachable; exact times, durations, totals | NOT RUN (visual) | derivation covered by check script scenario 10 |
| Break-only breaks leave a `timer_breaks` row; task breaks linked after Stop | NOT RUN | needs migration 168 |
| Pre-migration: no 500s, expiry still backdates, heartbeat/breaks no-op | NOT RUN live; build + code review only | writes are separate best-effort updates |
| Old/manual logs still render | NOT RUN (visual) | types keep `timeline` optional/null |
| Design System v2.0 visual review | NOT RUN | |
| File-length guidance | PASS | quality gate |
| Break chimes (warning 10/5 min, end ring, mute) | NOT RUN | audio can't be asserted headlessly |

## Not verified / risks to check in the live pass

1. `updated_at` optimistic token against real PostgREST timestamp strings (microsecond/`+00:00` format round-trip). If it never matches, reconcile would silently no-op.
2. Audio output and browser autoplay unlock (Chrome, Safari).
3. Positioning of the portaled Activity panel inside scroll containers and at ≤ 640 px.

## Suggested live run (needs migration 168 applied, `pnpm dev`, an assigned task)

1. Start a timer, start a Few-minutes break, close the tab for > 5 min, reopen: break ended at +5:00, banner offers Resume / Count the gap.
2. Start a timer, wait 6 min with the laptop lid closed / network off: banner and toast; both choices appear in the Activity stream.
3. Two tabs on the same account during a break expiry: one `break_end` in the log.
4. Dashboard → Time logs, task Time Logs and ticket Time Logs: Activity trigger opens by keyboard (Enter/Esc).
5. Coffee break: ping at 5 min left, ring at the end, mute toggle respected.
