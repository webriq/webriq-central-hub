# StackShift Desk step-down — manual SQL (task 450)

These scripts change the live **Zoho Desk poll schedule**. They live here, **not** in `supabase/migrations/`, on purpose:

- `supabase db push`, preview branches and any migration runner apply `supabase/migrations/` automatically and in order. These scripts are *guarded* — they deliberately abort unless a non-revoked parity sign-off exists (and, for step 6, no open Desk-only tickets remain). Inside the migrations folder that abort would fail the deploy and block every later migration.
- They are not setup: each is a step of a staged, observed, reversible cutover, to be run by a person at the right moment.

Run them yourself, one at a time, **in the Supabase SQL editor**, following `_docs/plan/stackshift-desk-stepdown-runbook.md`:

| Order | Script | Runbook step |
|---|---|---|
| 1 | `step-3_lower-desk-poll-cadence.sql` | 3 — Desk poll every 10 min → hourly |
| 2 | `step-6_unschedule-desk-poll.sql` | 6 — unschedule the Desk poll |

Each file's header documents its guards and its exact rollback SQL. A guard failing ("no active StackShift parity sign-off", or "in-flight Desk-only tickets remain") is the script working as designed — it means that step is not due yet.

The *setup* migrations for this feature (169–174: tables, columns, triggers, the outbox/alerts cron jobs) stay in `supabase/migrations/`.
