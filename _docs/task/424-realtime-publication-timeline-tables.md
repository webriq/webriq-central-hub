# 424: Add the Timeline's Tables to the Supabase Realtime Publication

**Created:** 2026-10-05
**Priority:** HIGH
**Type:** fix (database migration, written-not-applied)
**Recommended Tier:** fast
**Status:** Testing — applied by the operator 2026-10-05; publication + subscription verified live; one end-to-end write test remaining

---

## Overview

Follow-up F0 from task 423's investigation. The Project Timeline subscribes to Postgres changes on `customer_phases`, `customer_deliverables` (StackShift engine, `_onboarding-detail.tsx`) and `milestones`, `tasklists`, `tasks` (generic engine, task 422's `useGenericRealtime`). None of those five tables is in the `supabase_realtime` publication, so every subscription connects but **never receives an event** — the "Live updates paused" notice cannot detect it. The StackShift channel has therefore never worked; task 422 requirement D is non-functional until this lands. (`_project-detail.tsx` also subscribes to `tasks`/`issues` per migration 093's comment — `tasks` is fixed here, `issues` is not; see Out of Scope.)

**Evidence (2026-10-05):** a Realtime probe with the server's `system` message as the signal, validated by controls — `customer_products`, `task_comments`, `attachments` (published by migrations 006/093) → "Subscribed to PostgreSQL"; a nonexistent table → "Unable to subscribe to changes…". `customer_phases`, `customer_deliverables`, `milestones`, `tasklists`, `tasks`, `issues` → not published. A naive probe that only reads the subscribe *status* is useless (`SUBSCRIBED` is returned even for a nonexistent table).

## Requirements

- [x] Migration `supabase/migrations/159_realtime_timeline_tables.sql` (written): guarded/idempotent `alter publication supabase_realtime add table` for the five tables, same shape as `093_enable_realtime_comments_attachments.sql`.
- [x] `REPLICA IDENTITY FULL` on the four small tables (`customer_phases`, `customer_deliverables`, `milestones`, `tasklists`) so DELETE events can match the `project_id=eq.…` filter (default identity sends only the PK; Realtime cannot filter DELETEs on other columns). `tasks` stays default — task deletions won't live-update (documented trade-off).
- [x] Rollback script `supabase/rollbacks/159_realtime_timeline_tables_down.sql` (outside `migrations/` per the repo's rule).
- [ ] **Operator applies** the migration (`supabase db push`) — the agent does not apply migrations.
- [ ] Post-apply verification (below), including a live end-to-end check of both Timeline channels.

## Out of Scope

- `issues` (and any other table) — noted only; `_project-detail.tsx` subscribes to it but it is not a Timeline table.
- Realtime auth/RLS changes (subscriptions run as the signed-in user; events are filtered by existing RLS — read policies already cover admin/super_admin/pm/developer and marketing for `customer_*`).
- Changing the Timeline hooks; no app-code change is needed.

## Risks / Notes

- **Write volume:** `tasks` is the busiest table (7,632 rows); every insert/update now goes through Realtime's per-subscriber RLS check. Only Timeline pages subscribe, filtered by `project_id`.
- **`REPLICA IDENTITY FULL`** raises WAL size for UPDATE/DELETE on those four small tables — negligible at current volumes (≤1.6k rows).
- Applying changes the shared hosted database (there is no separate dev DB) — review before pushing.
- The new `project_phases/project_deliverables` design (task 423) will need the same publication step for the renamed tables; renaming in place keeps publication membership, so this migration carries over.

## Verification (after the operator applies)

1. Re-run the controlled probe (`_docs/task/423-investigation-queries/`; use the `system`-message form, with `customer_products` positive and a nonexistent-table negative control): all five tables report "IN publication".
2. Browser, two windows on the same generic project's Timeline: edit a milestone's dates or a tasklist name in window A (Milestones tab) → window B's Timeline updates within a few seconds without reload.
3. Same for a StackShift I project: change a deliverable's schedule (marketing/admin) in A → B's card moves.
4. Delete a milestone/tasklist in A → disappears in B (confirms the replica-identity change); delete a task → B does *not* update until reload (expected).
5. Confirm no "Live updates paused" notice appears on either engine.

## Rollback

`supabase/rollbacks/159_realtime_timeline_tables_down.sql` (drops the five tables from the publication and restores default replica identity). Safe: the app already tolerates absent events.


## Local Verification (2026-10-05, task 427 spike — Postgres 17.6, disposable Docker DB; the live database was not touched)
- Migration 159 applies cleanly on a fresh database (as part of the 159-migration replay, twice).
- After apply: all five tables are in `supabase_realtime`, replica identity `f` (full) on the four small tables.
- `supabase/rollbacks/159_realtime_timeline_tables_down.sql` returns the publication to none and replica identity to `d` (default); re-applying 159 (twice) is idempotent.
- End-to-end on the local Realtime service: a `project_id=eq.…` filtered subscription receives INSERT, UPDATE **and DELETE** on the (renamed) tables — i.e. the replica-identity assumption in this task's design holds. Note the first events only flow a few seconds after `SUBSCRIBED`.
- Still needed on the live database after you apply it: the "Verification (after the operator applies)" checklist above.
- Task 427 renames `milestones`/`tasklists` → `project_phases`/`project_deliverables`; the publication follows the table, but any subscription must then use the new names (see task 427 finding 3).


## Applied + Live Verification (2026-10-05)
Applied with `supabase db push` together with migration 160 (task 427). Verified read-only on the live database with the controlled probe: `customer_phases`, `customer_deliverables`, `tasks`, and the renamed `project_phases` / `project_deliverables` are **in** `supabase_realtime` (positive control `customer_products` in, nonexistent-table control out); the legacy views `milestones` / `tasklists` are not (views cannot be published — task 427 finding 3). The generic Timeline's channel subscribes without a "Live updates paused" notice. The hook was switched to the real table names after the rename. **Remaining (optional):** a manual two-window check including a *delete* of a milestone; the deliberate task-delete caveat stands (task deletions don't live-update; `tasks` kept on default replica identity).


## Live end-to-end Realtime check (2026-10-05, operator-approved single no-op write)
A test client subscribed exactly as the generic Timeline's hook does (`project_phases`, filter `project_id=eq.<UFP International>`) and one **no-op** `update project_phases set name = <same name>` was run on UFP's single phase (name/status/`updated_at` verified unchanged afterwards).
- **Attempt 1 (7 s after `SUBSCRIBED`, 4 s observation): no event** — subscription reported `ok`; inconclusive (warm-up).
- **Attempt 2 (25 s warm-up, 10 s observation): the `UPDATE` event for the correct row id and name arrived within about a second of the write.** Live delivery on the renamed table with the project filter is confirmed.
- **Caveat (product-level, not a defect of the migration):** a new Realtime subscription needs more than ~7 s before it reliably receives events (also seen locally with <2 s). The Timeline hook subscribes on page load, so a change made by someone else within the first several seconds of opening the page may not appear live; it would show on the next load. If that matters, a one-time refetch after `SUBSCRIBED` (+ a few seconds) closes the gap — not done here.
- Not exercised live (needs destructive writes, deliberately not done): INSERT and DELETE delivery on the live tables — covered by the local spike (all six event types incl. DELETE with `replica identity full`) and by the controlled publication probe.
