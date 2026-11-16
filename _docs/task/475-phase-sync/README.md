# Task 475: tracker sync runbook (kickoffs + active phases)

This runbook aligns StackShift I programmes to the PM tracker (Oct 15). The agent never applies anything; you run each SQL file yourself in the Supabase SQL editor. The `out/` folders are git-ignored and hold real customer data, so never commit them.

## Order

1. **Confirm that task 455's code is deployed** where you're applying. `PATCH .../programme/phase` must no longer backdate `programme_started_at`, or the next phase move in the app undoes the kickoffs.
2. **Snapshot the Status Report** (`/projects/v2/status-report`, text or screenshot) for the before/after check.
3. **Kickoffs** (10 projects):
   ```bash
   npx tsx --env-file=.env --tsconfig tsconfig.json _docs/task/455-kickoff-rebaseline/dry-run.ts
   ```
   Review `_docs/task/455-kickoff-rebaseline/out/plan.md`, then run its `apply.sql`.
4. **Phases** (Veteran → Publish, Black Barn → Onboard, RCB → Migrate & Rebrand, Saginaw M&R → completed). Run this after step 3:
   ```bash
   npx tsx --env-file=.env --tsconfig tsconfig.json _docs/task/475-phase-sync/dry-run.ts
   ```
   Review `out/plan.md`, then run `out/apply.sql`. If a project's phases changed since the dry run, the whole transaction aborts; re-run the dry run.
5. **Verify:** first **copy each `out/rollback.sql` somewhere safe** (e.g. `rollback-applied.sql`). Re-running a dry run overwrites `out/` with an empty rollback. Then re-run both dry runs. Every project should show as "Already matching", with 0 changes. Then compare the Status Report with the snapshot. Veteran should be on Publish, Black Barn on Onboard and RCB on Migrate & Rebrand. Royal Thumper, Trident, Baoase and Summit should be unchanged.

## Rollback

Run `out/rollback.sql` from the **same** dry run that produced the `apply.sql` you ran. Roll back the phases (475) before the kickoffs (455).

## Left for the PMs

- Royal Thumper: the Hub moved it to Publish on Nov 10, after the tracker. Confirm its phase.
- M&I Interiors: the tracker says "open Publish", but its current phase is still Migrate & Rebrand. Confirm.
- Grand River Realty: not in the Hub. Create it via intake, then set its kickoff (2026-10-12) in the Timeline's **Kickoff** editor.
