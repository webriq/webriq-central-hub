# 449: StackShift direct support — parity report + gate checklist page + alerts (the go/no-go for Desk step-down)

**Created:** 2026-10-08
**Priority:** HIGH
**Type:** feature (reporting)
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Design §9 makes a user-approved **parity gate** the only way to unlock Desk demotion (task 450). This task builds the evidence: an admin report that, for a pilot site and window (≥14 days and ≥50 tickets), checks the six parity conditions and renders a pass/fail checklist with drill-down, plus alerts for auth-failure spikes and dead outbox events.

Part of the StackShift Support → Hub direct rollout: design `_docs/plan/stackshift-hub-direct-support-design.md`, contract `_docs/plan/stackshift-hub-support-api-contract.md`, hand-off `_docs/plan/stackshift-hub-support-handoff.md` (parent task 442).

## Requirements

- [ ] Admin-only page `/desk/stackshift-parity` (admin/super_admin) with site + window controls; computed server-side.
- [ ] Six checks per design §9: (a) every Desk-polled StackShift ticket in the window has a direct row matched by `desk_ticket_id` — **list the misses**; (b) per-pair message counts and body/timestamp equality (normalised HTML) — list diffs; (c) attachment counts; (d) status and `resolved_at`; (e) outbox: no unresolved `dead` events; (f) audit log: no unresolved 5xx/auth failures. Overall PASS only if all six are clean **and** the window/ticket thresholds are met.
- [ ] Sign-off record: a table `stackshift_parity_signoff` (who, when, site, window, snapshot of the report) written only by an explicit button for admin/super_admin; shows the latest sign-off. Task 450 reads this as its precondition.
- [ ] Alerts: Cliq message when one key id exceeds N failed auths in 10 min or any outbox event goes `dead` (dedupe like the validation-quota alert).
- [ ] Pure checks for the comparison/normalisation logic (HTML whitespace/entity normalisation, ordering, off-by-timestamp tolerance).

## Out of Scope / Must-Not-Change

- The existing StackShift → Zoho Desk → Hub flow is **not** disabled, removed, rescheduled or demoted (Desk polls/crons, `desk-ticket-poll`, helpdesk@ Desk email channel, task-441 duplicate flag stay as they are). Only task 450 may touch them, and only after the parity gate passes with the user's written sign-off.
- Duplicates between the direct path and the Desk-polled copy are **allowed and badged**, never auto-skipped or merged.
- Hub side only — no StackShift-app changes (a separate later project; see the hand-off spec).
- No git commands. Migrations are **written, not applied** by the agent.
- The report is read-only and never changes tickets. It does **not** perform or approve the Desk step-down.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/desk/stackshift-parity/page.tsx` | Create | Report page |
| `src/lib/stackshift-support/parity.ts` | Create | Check logic |
| `src/app/api/desk/stackshift-parity/signoff/route.ts` | Create | Record sign-off (admin) |
| `supabase/migrations/171_stackshift_parity_signoff.sql` | Create | Sign-off table (written, not applied) |
| `src/lib/stackshift-support/alerts.ts` | Create | Cliq alerts |
| `_docs/task/449-parity.check.ts` | Create | Pure checks |

## Code Context

Pairs are matched by `inbox.desk_ticket_id` (direct) ↔ `inbox.external_id` (Desk-polled). Message normalisation must tolerate Desk HTML vs Hub HTML differences (task 389/391 notes on Desk bodies always being raw HTML). Alert dedupe precedent: the validation-quota cron's deduped Cliq alert (`/api/cron/validation-quota-check`). Pagination rule: any select that can exceed 1000 rows must page with `.range()` (CLAUDE.md).

## Implementation Steps

1. Implement and unit-check the comparison logic.
2. Build the report page and sign-off flow.
3. Add alerts.
4. Run against harness-generated data, then a real pilot site.

## Acceptance Criteria

- [ ] The page reports each of the six checks with counts and drill-down lists; misses/diffs are specific tickets.
- [ ] PASS is impossible below 14 days / 50 tickets or with any failing check.
- [ ] Sign-off is explicit, audited, and visible; no code path auto-approves.
- [ ] Selects over 1000 rows paginate.

## Verification

```bash
npx tsc --noEmit
pnpm lint
npx tsx _docs/task/449-parity.check.ts
```

## Compatibility Touchpoints

Depends on 444–448. Feeds task 450.


## Implementation Notes

### Decisions (user, 2026-10-09)
- Check (d) blocks unless each differing ticket is acknowledged with a written reason at sign-off. Check (f): any 5xx on the site blocks; auth failures block only above 2% of API requests. Alerts go in-app + push to admins (Cliq stays wired but is disabled in code). The three hand-off steps the report cannot verify are required attestations on the sign-off form.

### What Changed
- `parity-logic.ts` (pure: HTML normalisation, pairing, six checks, thresholds, acknowledgements, verdict, window clamp, alert helpers) + `parity.ts` (paged loader, `buildReport`, `listDirectSites`, `latestSignoff`).
- Migration 173 (written, not applied; renumbered from 171): `stackshift_parity_signoff` (admin read RLS, no write policies) + the `stackshift-alerts` pg_cron job.
- `/desk/stackshift-parity` page + client view (check cards with drill-down, accept-with-reason for (d), attestations, typed site confirmation, revoke); `POST /api/desk/stackshift-parity/signoff` (recomputes server-side, refuses unless PASS) and `.../[signoffId]/revoke`.
- `alerts.ts` + `POST /api/cron/stackshift-alerts`; admin-only Desk nav entry; `DESK_STACKSHIFT_PARITY` route; CLAUDE.md, hand-off and task 450 (migration number `174`, precondition pointer) updated.

### Deviations From Plan
- Migration is 173, not 171. Task 450's planned migration is renumbered to 174.
- (b) compares customer-authored messages only (staff replies/status legitimately live on one copy); (c) compares ticket-level attachment totals (Desk files all hang off the opening message).
- Auth failures are counted API-wide because they are logged before the site is known.
- The Desk copy's `created_at` is the poll's ingestion time, so window membership for Desk-only tickets is approximate.
- The sign-off also notifies the other admins, and refuses a clamped (>90 days) or truncated (>2,000 tickets) report.

### Verification Run
- `npx tsx _docs/task/449-parity.check.ts` (HTML normalisation, message/status comparison, pairing, all six checks, thresholds, acknowledgement rules, verdict, window clamp, alert dedupe) - PASS; 444-448 checks still pass
- `npx tsc --noEmit`, eslint (stackshift-support, parity page, parity + alerts routes) - PASS
- Report against real or harness data, sign-off/revoke flow, alerts cron - NOT RUN (needs migrations 169-173 applied, a pilot site with dual-write, and a browser session)
