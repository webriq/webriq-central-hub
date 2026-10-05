# Task 429 — cutover runbook (operator)

All code (WP1–WP6) merges first; **one coordinated deploy**. Keep the window between steps 2 and 5 short — programme edits made in the old app after step 2's snapshot land in `customer_*` and would need replaying.

**Pre-flight (agent, read-only):** `pnpm check:logic` (67/67), `npx tsc --noEmit`, `pnpm lint` clean.

1. **Back up** the database (Supabase dashboard → Backups / PITR marker). Note the time.
2. **Bring the unified tables current (idempotent backfill)**
   - `NODE_OPTIONS=--experimental-websocket node --env-file=.env node_modules/tsx/dist/cli.mjs _docs/task/428-backfill/dry-run.ts` (read-only) → review the report: **0 ambiguities**, counts as expected (phases ≈ unchanged/update, orphans only the known ~11).
   - Run `_docs/task/428-backfill/out/backfill.sql` in the Supabase SQL editor (single transaction; a failed drift/reconcile guard rolls it back).
   - Re-run the dry run: everything `unchanged`.
3. **Deploy** the merged branch (Vercel). The app now reads/writes the unified tables.
4. **Parity check (agent, read-only)** — `NODE_OPTIONS=--experimental-websocket node --env-file=.env node_modules/tsx/dist/cli.mjs _docs/task/429-wp6/parity.ts` must print `PARITY OK` (0 unexpected diffs). Rehearsed locally on a fresh copy of live data: 29 projects, 3,517 fields, 0 diffs; 3 projects with a permanent skip + stored overrides (task 432) and 2 phases with no deliverable rows are reported but compared structurally only.
   - Any diff → **stop, do not freeze**; roll back (below) and investigate `out/parity.json`.
5. **Smoke test in the browser** (staff account): a started project's Timeline (cards, drag a card, mark a deliverable done, realtime in a 2nd tab), Jump to phase, Complete phase, Status Report, Portfolio listing's active-phase column, Overview progress card, StackShift order page link. Start a *new* project (draft → Start) and confirm Phase 1 is seeded.
6. **Freeze the legacy tables** — run `_docs/task/429-wp6/162_freeze_customer_phases_deliverables.sql` in the SQL editor (or move it to `supabase/migrations/`). `customer_phases`/`customer_deliverables` then reject INSERT/UPDATE (DELETE/cascade still allowed). Any straggler fails loudly. Verified locally.
7. **Watch** logs for `customer_phases/customer_deliverables are frozen` errors for a day — each one is a missed writer.

## Rollback
- **Before step 6:** revert the deploy. `customer_*` are untouched since step 2; replay (by hand) any programme edits made in the new app, or accept losing them if the window was short. Unified rows stay (harmless; the old app ignores them, and re-running the backfill later reconciles).
- **After step 6:** first run `supabase/rollbacks/162_freeze_customer_phases_deliverables_down.sql`, then revert the deploy.
- Last resort: restore the step-1 backup.

## After the dust settles
Task 430 (work-breakdown rename) and task 431 (contract: drop `customer_*`, the `milestones`/`tasklists` views, `seedPhase2to5Links`, Zoho libs) follow; neither is needed for the cutover.
