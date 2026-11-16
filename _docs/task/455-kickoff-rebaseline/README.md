# Task 455: kickoff re-baseline runbook

This runbook re-baselines programme start dates (`projects.programme_started_at`) to the PM-confirmed kickoff dates in the Oct 15 tracker. The agent never applies anything; you run each step yourself.

## Order

1. **Apply migration 177** (`supabase/migrations/177_programme_delay_notes.sql`). This is needed for project notes and note authorship. The re-baseline itself doesn't depend on it.
2. **Deploy the task 455 code first.** Phase tagging on a started project no longer rewrites the kickoff. If you re-baseline on the old code, the next phase move undoes it.
3. **Run the dry run** (read-only):
   ```bash
   npx tsx --env-file=.env --tsconfig tsconfig.json _docs/task/455-kickoff-rebaseline/dry-run.ts
   ```
   It writes `out/plan.md`, `out/apply.sql` and `out/rollback.sql`. The `out/` folder is git-ignored; never commit it.
4. **Review `out/plan.md`** with the PMs: current vs new kickoff, Day N and days left.
5. **Run `out/apply.sql`** in the Supabase SQL editor. It is a single transaction. A project whose start date changed since the dry run aborts the whole transaction; if that happens, re-run step 3.
6. **Verify:** re-run the dry run. Every mapped project should now appear under "Already matching". Then open the Status Report and check Day N = today − kickoff + 1.

## Rollback

Run `out/rollback.sql` from the **same** dry run that produced the `apply.sql` you applied.

## Operator actions the script cannot do

- **Grand River Realty** (kickoff 2026-10-12): no customer exists yet. Create it via New Project intake and start the programme. Then set the kickoff in the Timeline's **Kickoff** editor, or add it to `MAPPINGS` and re-run.
- **Greydog Security `82ACEB0F-PROJ-02` (Website):** merged into `82ACEB0F-PROJ-03` and archived (tasks 468/472). It is not touched; task 475 re-baselines PROJ-03 instead. Maxton's live programme is `BD64C367-PROJ-02`, which is now in `MAPPINGS` (task 475).

## Future corrections

The Timeline view now has a **Kickoff** editor (admin, super_admin and pm). It sets the date and re-derives the phase and deliverable dates, so there's no need for SQL.
