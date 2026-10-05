# 426: Freeze Zoho Import/Sync of Milestones and Tasklists (Prerequisite for the Rename)

**Created:** 2026-10-05
**Priority:** MEDIUM
**Type:** chore / safety
**Recommended Tier:** fast
**Status:** Testing — code done; operator cron unschedule confirmed
**Depends on:** none (prerequisite for 427)
**Parent:** task 423 (approved design: `_docs/task/423-unify-phases-deliverables-investigation.md`)

---

## Overview

`milestones` (567 rows) and `tasklists` (985 rows) carry Zoho-import `external_id`s, and `milestones.external_id` is the upsert conflict key for `POST /api/admin/zoho-import/{milestones,tasklists,tasks}` and `/api/admin/zoho-sync/tasklists`. A `zoho-tasklists-sync` pg_cron job was scheduled in migration 041 and re-pointed to Vault in 078; **whether it is still scheduled in the live database could not be checked** (`cron.job` isn't exposed over the API). With Zoho being decommissioned, these paths must not write into tables that task 427 renames and reshapes.

## Requirements

- [ ] **Operator step:** in the SQL editor run `select jobid, jobname, schedule, active from cron.job where jobname = 'zoho-tasklists-sync';` and record the result in this doc; if present, `select cron.unschedule('zoho-tasklists-sync');`.
- [x] `POST /api/admin/zoho-sync/tasklists` returns `410 Gone` with a clear message (still session/cron-secret authenticated so it doesn't leak); the three `zoho-import` routes for `milestones`/`tasklists`/`tasks` return `410` unless an explicit `?force=legacy` + `super_admin` guard is passed (decide in Open Question 1).
- [x] The Migrate tab UI marks those import levels as "retired" instead of offering them.
- [x] `CLAUDE.md` Cron-auth list drops `/api/admin/zoho-sync/tasklists`.
- [x] No other code path creates milestones/tasklists with a Zoho-style `external_id` (grep + list in Implementation Notes).

## Out of Scope

- Deleting imported rows or the import libraries (`lib/migrate/zoho-import.ts`) — they stay until task 431.
- Desk/Mail/Cliq integrations (unrelated).

## Acceptance Criteria

- [ ] Calling each frozen route as an admin returns 410 and writes nothing (verify with a row-count before/after).
- [ ] `cron.job` has no active `zoho-tasklists-sync` row (operator confirms).
- [ ] `tsc`/lint clean.

## Rollback

Revert the route guards; re-schedule the cron from migration 078's definition if needed.

## Open Questions

1. Hard 410 for all, or keep a super-admin `?force=legacy` escape hatch until the contract step? Default: hard 410 (the data is already imported).


## Implementation Notes

### What Changed
- **`src/lib/migrate/retired-routes.ts` (new):** `retiredGuard(what)` returns a `410 {"code":"retired"}` response (typed `NextResponse | null` so the legacy handler bodies stay reachable for lint until task 431 deletes them). One constant flips it for a deliberate, reviewed re-enable — no per-request escape hatch (Open Question 1: hard 410).
- **Routes frozen (guard placed *after* auth so anonymous callers still get 401/403):** `POST /api/admin/zoho-import/milestones`, `.../tasklists`, `.../tasks` (admin/super_admin session) and `POST /api/admin/zoho-sync/tasklists` (admin session **and** the `x-cron-secret` path). A `// RETIRED (task 426)` header marks the two files that had descriptive headers.
- **Migrate tab (`_zoho-projects-tab.tsx`):** the Milestones / Tasklists / Tasks import levels render as a greyed "Retired" row with no Import button (`RETIRED_IMPORT_KEYS`); export levels and every other import level are unchanged. The now-unreachable import handlers/branches stay until 431.
- **`CLAUDE.md`:** `/api/admin/zoho-sync/tasklists` removed from the cron-auth route list.
- **Other writers audited:** the only other code paths that write `milestones`/`tasklists` with an `external_id` are the programme seeds (`lib/programme/seed.ts` → `programme-phase-…` / `programme-deliverable-…`, and the read-side backfill in `GET …/programme`), not Zoho-style ids; `lib/migrate/zoho-import.ts` holds shared helpers used by the (now frozen) routes and is removed in 431.

### Files Changed
New: `src/lib/migrate/retired-routes.ts`. Modified: the four route files above, `src/app/(hub)/admin/migrate/_zoho-projects-tab.tsx`, `CLAUDE.md`.

### Deviations From Plan
- None functionally. The Migrate tab keeps the dead handler code (deleting it is task 431's scope). `zoho-sync/tasklists` only admits the `admin` role (pre-existing), so a `super_admin` session gets 403 before reaching the guard — the 410 for that route was verified through the cron path instead.

### Verification Run
- `npx tsc --noEmit` — PASS; eslint on all touched files — 0 errors/warnings.
- Row counts before/after (service key, read-only head counts): `milestones` 695, `tasklists` 1,571, `tasks` 7,632 — **unchanged**.
- Unauthenticated `POST` to all four routes → **401** (auth still runs first).
- Signed-in `super_admin`: the three import routes → **410** `{"code":"retired"}`; `zoho-sync/tasklists` → 403 (role rule, pre-existing).
- Local dev server, `x-cron-secret` valid → `zoho-sync/tasklists` **410**; wrong secret → **401**.
- Browser: Admin → Migrate → Zoho Projects → "Phase 2 — Import": Milestones, Tasklists, Tasks show **Retired** with no button; Users, Customers, Projects, Issues, Comments … still show Import.

## Operator step (still required — the agent cannot read or change `cron.job`)

Run in the Supabase SQL editor and record the output here:

```sql
-- 1) Is the Zoho tasklists sync still scheduled?
select jobid, jobname, schedule, active from cron.job where jobname = 'zoho-tasklists-sync';

-- 2) If a row came back, unschedule it (safe to run even if it returns nothing):
select cron.unschedule('zoho-tasklists-sync');
```

Why it matters even though the route now returns 410: a still-scheduled job keeps calling a frozen endpoint daily (harmless but noisy, and it would resume writing if the constant were ever flipped). **Result recorded 2026-10-05 (operator):** the job **is scheduled and active** — `jobid 1`, `jobname zoho-tasklists-sync`, `schedule 0 2 * * 0` (Sundays 02:00), `active true`. Until it is unscheduled it will call `/api/admin/zoho-sync/tasklists` weekly and receive `410` (nothing is written, so it is harmless but noisy). **Resolved 2026-10-05:** operator ran `select cron.unschedule('zoho-tasklists-sync');` (returned `true`) and the re-check query returned **no rows** — the job is gone.

## Acceptance status

- [x] Frozen routes return 410 and write nothing (counts unchanged).
- [x] `cron.job` has no `zoho-tasklists-sync` row — operator unscheduled jobid 1 and the re-check returned no rows (2026-10-05).
- [x] `tsc`/lint clean.


## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. The guard is one small helper (`retiredGuard`) used after authentication in all four routes; handler bodies are intentionally retained (typed `NextResponse | null` so they stay reachable for lint) until task 431 deletes them; the Migrate tab change is a single early-return row. No secrets or debug logging (the cron-path check read the secret from `.env` in a throwaway command and never printed it).
- The operator step is closed: `zoho-tasklists-sync` (jobid 1) was unscheduled and the re-check returned no rows.

### Deviations
- None against scope. Noted: `zoho-sync/tasklists` only admits the `admin` role (pre-existing), so its 410 was verified through the cron path.

### Required Fixes
- None.
