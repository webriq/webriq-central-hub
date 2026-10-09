# 446: StackShift direct support — outbox, outbound events, replay UI, mock receiver, Hub customer emails (stage 2)

**Created:** 2026-10-08
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

Implements contract §6: staff actions on direct (`channel='stackshift'`) tickets are written to `stackshift_outbox` and delivered to StackShift (`STACKSHIFT_EVENTS_URL`) as signed, retried events — `ticket.reply`, `ticket.status_changed`, `ticket.assigned`, `ticket.due_changed`. Adds the admin replay UI, `GET /events` for re-sync, and the D4 decision: after cutover the **Hub** sends customer emails (config flag, off during the overlap).

Part of the StackShift Support → Hub direct rollout: design `_docs/plan/stackshift-hub-direct-support-design.md`, contract `_docs/plan/stackshift-hub-support-api-contract.md`, hand-off `_docs/plan/stackshift-hub-support-handoff.md` (parent task 442).

## Requirements

- [ ] Enqueue in the existing staff paths (reply, status, assignee/due changes) **only** for `channel='stackshift'` rows, inside the same transaction/ordering as the DB write; per-ticket monotonic `sequence`; payloads per contract (public replies only, never internal notes).
- [ ] Dispatcher: cron-authed `POST /api/cron/stackshift-outbox` (same `x-cron-secret`/session pattern; add to CLAUDE.md's cron list) delivering due events with the signed-request lib, 10 s timeout, retry schedule 1 m / 5 m / 30 m / 2 h / 12 h then `dead` + Cliq alert; strict per-ticket ordering (do not send sequence n+1 before n is `sent` or `dead`).
- [ ] `GET /api/webhooks/stackshift-support/v1/events?ticketRef=&afterSequence=` (signed) for StackShift re-sync.
- [ ] Admin UI (admin/super_admin): list outbox events by status, view payload/error, **Replay** dead events; follows the Desk UI hex-token conventions.
- [ ] Reply route: for `channel='stackshift'` tickets the reply is delivered via outbox (no Zoho Mail thread exists); email path unchanged for other channels. Customer email on direct tickets only when `STACKSHIFT_SUPPORT_NOTIFY_CUSTOMER=true`, via the existing mailer.
- [ ] Mock receiver script `_docs/task/446-mock-receiver.ts`: verifies Hub signatures, can be told to return 5xx/timeout, records ordered event ids — used to test retry, ordering, dedupe.
- [ ] Pure checks for the backoff schedule, per-ticket ordering gate and payload redaction (no internal fields).

## Out of Scope / Must-Not-Change

- The existing StackShift → Zoho Desk → Hub flow is **not** disabled, removed, rescheduled or demoted (Desk polls/crons, `desk-ticket-poll`, helpdesk@ Desk email channel, task-441 duplicate flag stay as they are). Only task 450 may touch them, and only after the parity gate passes with the user's written sign-off.
- Duplicates between the direct path and the Desk-polled copy are **allowed and badged**, never auto-skipped or merged.
- Hub side only — no StackShift-app changes (a separate later project; see the hand-off spec).
- No git commands. Migrations are **written, not applied** by the agent.
- No attachments in events (447). No change to Mail-channel replies.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/stackshift-support/outbox.ts` | Create | enqueue + sequence + redaction |
| `src/lib/stackshift-support/dispatch.ts` | Create | delivery, backoff, ordering gate |
| `src/app/api/cron/stackshift-outbox/route.ts` | Create | cron/session-authed dispatcher |
| `src/app/api/webhooks/stackshift-support/v1/events/route.ts` | Create | GET re-sync |
| `src/app/api/desk/tickets/[ticketId]/reply/route.ts` | Modify | Outbox path for `channel='stackshift'` |
| `src/app/api/desk/tickets/[ticketId]/status/route.ts` | Modify | Enqueue status events |
| `src/app/(hub)/desk/stackshift-outbox/` | Create | Admin events list + replay |
| `supabase/migrations/170_stackshift_outbox_cron.sql` | Create | pg_cron job (Vault pattern of 148), written not applied |
| `_docs/task/446-mock-receiver.ts` | Create | Mock StackShift receiver |

## Code Context

Cron route pattern: `src/app/api/cron/desk-ticket-poll/route.ts` (secret-or-session auth, run summary log, time budget from task 441). pg_cron + Vault registration: `supabase/migrations/148_stackshift_desk_ticket_poll.sql`. Reply route to branch: `src/app/api/desk/tickets/[ticketId]/reply/route.ts` (currently requires a prior `email_message_id` and calls `sendReply`). Cliq alert helper: `sendCliqNotification` in `src/lib/zoho/index.ts`. Signing lib from task 444.

## Implementation Steps

1. Build outbox + redaction with checks first.
2. Dispatcher + cron route + migration for the job.
3. Branch the reply/status routes; add `GET /events`.
4. Admin replay UI.
5. Mock receiver; run retry/order/dedupe scenarios.

## Acceptance Criteria

- [ ] Replies/status on a direct ticket reach the mock receiver signed, in sequence order; a failing receiver triggers the exact retry schedule then `dead` + Cliq alert.
- [ ] Replay of a dead event delivers it and keeps ordering.
- [ ] Internal notes never appear in any payload.
- [ ] Mail/Desk tickets behave exactly as before.
- [ ] `GET /events` returns events after a given sequence for the right site only.

## Verification

```bash
npx tsc --noEmit
pnpm lint
npx tsx _docs/task/446-outbox.check.ts
npx tsx _docs/task/446-mock-receiver.ts   # then trigger replies from the Hub
```

## Compatibility Touchpoints

Depends on 444/445. New cron (`CLAUDE.md` cron list, migration, Vault secrets already present). `env.example`.


## Implementation Notes

### Decisions (user, 2026-10-09)
- `ticket.assigned` / `ticket.due_changed`: types + builders only, no emitter (no assignee column / due-date UI exists). Replay keeps the original `sequence`; the receiver applies by sequence. Replies enqueued by a SQL trigger. Customer reply email included, gated by `STACKSHIFT_SUPPORT_NOTIFY_CUSTOMER`. Retries: initial + 5 (assumed; the question was dropped by the 4-question tool limit) — dead after the 6th failure.

### What Changed
- Migration 171 (written, not applied; renumbered from 170): delivery-tracking columns, unique reply guard, `stackshift_enqueue_staff_reply` trigger, pg_cron job `stackshift-outbox-dispatch` (every minute).
- `src/lib/stackshift-support/`: `outbox-logic.ts` (backoff, ordering gate, redaction allowlists, paging), `outbox.ts` (`enqueueStatusChanged`), `dispatch.ts` (lease claim, signed POST, retry/dead), `direct-reply.ts`, `signed-get.ts` (reusable signed-GET pipeline).
- Routes: `POST /api/cron/stackshift-outbox`; `GET /api/webhooks/stackshift-support/v1/events`; `POST /api/desk/stackshift-outbox/[eventId]/replay`; reply + status routes branched for `channel='stackshift'` only.
- UI: `/desk/stackshift-outbox` (admin/super_admin) + admin-only Desk nav child; `V2_ROUTES.DESK_STACKSHIFT_OUTBOX`.
- `database.ts` outbox columns; contract, hand-off and CLAUDE.md updated; `_docs/task/446-outbox.check.ts` and `446-mock-receiver.ts`.

### Deviations From Plan
- `GET /events` requires a `site` query param (contract read convention) — needed to enforce "right site only".
- Status events are enqueued from app code (not a trigger) so customer-initiated changes arriving via the inbound API are not echoed back.
- `sequence` is the global identity from migration 169; per-ticket ordering uses (ticket_id, sequence).
- `sendCliqNotification` is globally disabled in code (`CLIQ_NOTIFICATIONS_ENABLED = false`), so the dead-event alert is currently a console error only.
- Replay can deliver out of order by design (see decisions); the "Replay keeps ordering" criterion is met as "keeps original sequence".

### Verification Run
- `npx tsx _docs/task/446-outbox.check.ts` (retry schedule, ordering gate, redaction, paging) - PASS
- Mock receiver smoke test with signed requests (valid, duplicate, bad signature, injected 503, out-of-order) - PASS
- `npx tsc --noEmit`, eslint on touched areas - PASS
- End-to-end (Hub -> receiver, retry timing, replay, trigger) - NOT RUN (needs migrations 169-171 applied, STACKSHIFT_EVENTS_URL/SECRET set)
- Browser check of /desk/stackshift-outbox - NOT RUN
