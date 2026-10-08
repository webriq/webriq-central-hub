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
