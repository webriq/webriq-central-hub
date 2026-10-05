# 431: Contract — Drop `customer_phases`/`customer_deliverables`, Compat Views and the Dual-Seed

**Created:** 2026-10-05
**Priority:** LOW
**Type:** cleanup migration (written-not-applied)
**Recommended Tier:** fast
**Status:** Planned
**Depends on:** 429 and 430 shipped, ≥ 1 release of clean parity, verified backup
**Parent:** task 423 (approved design: `_docs/task/423-unify-phases-deliverables-investigation.md`)

---

## Overview

Final step of the approved plan. Once the cutover has run cleanly for at least one release, remove everything that existed only to bridge the two models.

## Requirements

- [ ] **Precondition checklist** (all recorded in Implementation Notes): a fresh backup/snapshot exists; a parity query between the frozen `customer_*` snapshots and the unified tables shows only expected post-cutover divergence; no code references `customer_phases`/`customer_deliverables` (grep clean); no Realtime/cron/RLS policy references them.
- [ ] Migration (written-not-applied): drop `customer_phases`, `customer_deliverables` (and their policies/indexes/triggers/publication membership); drop compat views `milestones`/`tasklists`; remove the legacy column aliases.
- [ ] Code: delete `seedPhase2to5Links` and its read-side backfill in `GET …/programme`, the `external_id` string-convention lookups (`programme-phase-…`, `programme-deliverable-…`), `tasklistIdByExternalId`, the Zoho import libraries retired in 426 (`lib/migrate/zoho-import.ts` and routes), and unused types.
- [ ] Docs: update CLAUDE.md "Key Conventions" (`projects`/phases/deliverables entries, route-group notes), `_docs/mcp-tools.md`, and add `_docs/` notes describing `project_phases`/`project_deliverables`/`phase_programme_state`.
- [ ] Rollback script exists but is documented as **restore-from-backup only** (dropped data cannot be recreated by SQL).

## Out of Scope

- Anything not listed above; merging swimlane visuals.

## Acceptance Criteria

- [ ] After apply on a branch: app builds and all Timeline/Tasks/Milestones flows pass the 429/430 acceptance checks; `\d` shows the dropped objects gone; `tsc`/lint clean.
- [ ] User sign-off on the precondition checklist before the migration is applied.

## Rollback

Restore from the pre-apply backup only.
