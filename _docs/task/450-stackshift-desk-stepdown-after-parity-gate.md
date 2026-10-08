# 450: BLOCKED — Desk step-down after the parity gate: Desk polls reconcile-only, helpdesk@ Desk channel off, crons off, duplicate cleanup (stages 5–6)

**Created:** 2026-10-08
**Priority:** LOW
**Type:** chore / cutover (blocked)
**Recommended Tier:** deep
**Status:** Planned  
**BLOCKED:** do not start until task 449's parity gate has passed and the user has signed off.

---

## Overview

**Do not start until the parity gate (task 449) has passed and the user has given written sign-off** — a recorded `stackshift_parity_signoff` row plus explicit approval in conversation. Only this task may demote or disable the Zoho Desk flow. It makes the Desk poll reconcile-only (ingest a Desk ticket only if no row has `external_id = id` and none has `desk_ticket_id = id`, and **alert** on a miss), lowers cron cadence, then disables the Desk email channel for helpdesk@ and the Desk crons, and runs the one-time duplicate cleanup (D6). Customer emails switch to the Hub (D4) in this task.

Part of the StackShift Support → Hub direct rollout: design `_docs/plan/stackshift-hub-direct-support-design.md`, contract `_docs/plan/stackshift-hub-support-api-contract.md`, hand-off `_docs/plan/stackshift-hub-support-handoff.md` (parent task 442).

## Requirements

- [ ] **Precondition check in code:** the step-down routes/scripts refuse to run unless a valid sign-off exists and the user passes an explicit confirmation flag; dry-run first.
- [ ] Desk poll → reconcile-only mode (env/config switch, reversible): exact-key existence check; miss ⇒ Cliq alert, **not** a silent import.
- [ ] Lower `stackshift-desk-ticket-poll` cadence (new migration using the `cron.alter_job` pattern, written not applied), then — after a further observed window — unschedule; document each step with rollback.
- [ ] Checklist (operator, outside the repo): turn off the Desk email channel/workflow rules for helpdesk@; confirm the Mail poll still covers helpdesk@; confirm the StackShift project stopped Desk writes.
- [ ] **Duplicate cleanup (D6):** dry-run-first admin script that, for each correlated pair, keeps the direct row, copies Desk-only fields (Site, Business Name, SLA history) onto it, and retires the Desk copy (status/flag, never delete) with a reviewable plan file, in the style of `_docs/task/434-backfill/dry-run.ts`.
- [ ] Switch customer emails to the Hub: set `STACKSHIFT_SUPPORT_NOTIFY_CUSTOMER=true` per site once StackShift stops its own.
- [ ] Rollback for every step (restore cadence, re-enable the Desk channel, un-retire copies).

## Out of Scope / Must-Not-Change

- Everything before the gate. Deleting Desk data. Any StackShift-app change. Applying migrations (operator). No git commands.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/cron/desk-ticket-poll/route.ts` | Modify | Reconcile-only mode + miss alert |
| `supabase/migrations/172_stackshift_desk_poll_stepdown.sql` | Create | Cadence change then unschedule (written, not applied) |
| `_docs/task/450-duplicate-cleanup/` | Create | Dry-run + reviewable plan for retiring Desk copies |
| `CLAUDE.md` | Modify | Document the new steady state |

## Code Context

Sign-off table from task 449. Exact-key rules: design §7. Cron migration pattern: `supabase/migrations/148_stackshift_desk_ticket_poll.sql` (`cron.alter_job` / `cron.schedule`). Dry-run script precedent: `_docs/task/434-backfill/dry-run.ts`. Everything about the overlap constraints: design §1/§9.

## Implementation Steps

1. Verify gate + sign-off (stop if absent).
2. Implement reconcile-only mode behind a switch; ship dark.
3. Operator enables it; observe; lower cadence; observe; unschedule.
4. Operator disables the Desk channel; run the cleanup dry-run, review, apply.
5. Flip customer emails to the Hub per site.

## Acceptance Criteria

- [ ] The task cannot execute any step without a recorded sign-off.
- [ ] Reconcile-only mode never silently imports a StackShift ticket; a miss raises an alert.
- [ ] Each cutover step has been rehearsed with rollback.
- [ ] Duplicate cleanup produces a reviewable plan first and never deletes data.
- [ ] CLAUDE.md reflects the new steady state.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Dry-runs first; operator-confirmed live steps with rollback rehearsed
```

## Compatibility Touchpoints

Blocked on 449 + sign-off. External: Zoho Desk channel/workflow settings (operator).
