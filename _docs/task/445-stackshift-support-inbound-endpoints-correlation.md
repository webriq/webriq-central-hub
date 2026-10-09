# 445: StackShift direct support — inbound endpoints (create/comment/status) + exact duplicate correlation + signed-request harness (stage 1b)

**Created:** 2026-10-08
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

Exposes the inbound half of contract v1 (`_docs/plan/stackshift-hub-support-api-contract.md` §3) on the Hub: `POST /tickets`, `POST /tickets/{ticketRef}/comments`, `POST /tickets/{ticketRef}/status`, built on task 444's auth/limit/audit. Implements the overlap rules from design §6: the direct path creates its **own** row, never writes `inbox.external_id`, correlates to the Desk copy by exact `deskTicketId`, stamps `duplicateOf` on both sides, and suppresses customer emails. Also ships the signed-request script that verifies every endpoint without the StackShift app.

Part of the StackShift Support → Hub direct rollout: design `_docs/plan/stackshift-hub-direct-support-design.md`, contract `_docs/plan/stackshift-hub-support-api-contract.md`, hand-off `_docs/plan/stackshift-hub-support-handoff.md` (parent task 442).

## Requirements

- [ ] Route tree `src/app/api/webhooks/stackshift-support/v1/`: handlers use `verifySignedRequest` → zod validation → rate limit → site authorization → audit; real 4xx/5xx with the contract's `error` codes; `adminClient` writes with the inline exception comment.
- [ ] **Create:** idempotent on `idempotencyKey` (same key+body ⇒ 200 `deduped:true`, same key+different body ⇒ 409) and unique on `ticketRef`; inserts `inbox` (`channel='stackshift'`, `external_ref`, `stackshift_site`, `stackshift_actor_ref`, `desk_ticket_id`, priority, `sla_due_at` from `computeDueAt`) + first `inbox_messages` (`author_type='client'`, `visibility='public'`, `source_meta.contentType='text/html'`, `created_at` clamped to now); resolves `customer_id` via `contacts.email` like email-poll; customer emails **suppressed** unless `STACKSHIFT_SUPPORT_NOTIFY_CUSTOMER=true`.
- [ ] **Comment:** upsert on `inbox_messages.external_ref = commentRef`; reopens a closed ticket; site authorization; only customer comments accepted.
- [ ] **Status:** customer may only `open ⇄ closed`; sets/clears `resolved_at`.
- [ ] **Exact correlation both ways:** on create, if an `inbox` row has `external_id = deskTicketId`, stamp `duplicateOf` (`via:'desk_ticket_id'`) on the direct row **and** update that Desk row's `source_meta.duplicateOf`; conversely extend `processTicket()` in `src/app/api/cron/desk-ticket-poll/route.ts` to look up `desk_ticket_id = <desk id>` and set `duplicateOf` when a direct row already exists. Order-independent; never merges or skips.
- [ ] HTML bodies stored raw and sanitised on render (existing path); size limit 256 KB; reject unknown fields with `invalid_payload`.
- [ ] `scripts`/`_docs/task/445-support-harness.ts` (run with `npx tsx`): signs and fires the contract's example suite — create, replay, conflict, comment, status, stale timestamp, bad signature, wrong site, oversize, rate limit, unset secret — against a base URL; prints PASS/FAIL per case.
- [ ] Update `CLAUDE.md` (new webhook, tables, correlation rules, env vars).

## Out of Scope / Must-Not-Change

- The existing StackShift → Zoho Desk → Hub flow is **not** disabled, removed, rescheduled or demoted (Desk polls/crons, `desk-ticket-poll`, helpdesk@ Desk email channel, task-441 duplicate flag stay as they are). Only task 450 may touch them, and only after the parity gate passes with the user's written sign-off.
- Duplicates between the direct path and the Desk-polled copy are **allowed and badged**, never auto-skipped or merged.
- Hub side only — no StackShift-app changes (a separate later project; see the hand-off spec).
- No git commands. Migrations are **written, not applied** by the agent.
- No attachments (447), no reads (448), no outbound events/replies (446), no list pill (443).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/webhooks/stackshift-support/v1/tickets/route.ts` | Create | POST create |
| `src/app/api/webhooks/stackshift-support/v1/tickets/[ticketRef]/comments/route.ts` | Create | POST comment |
| `src/app/api/webhooks/stackshift-support/v1/tickets/[ticketRef]/status/route.ts` | Create | POST status |
| `src/lib/stackshift-support/schema.ts` | Create | zod payload schemas |
| `src/lib/stackshift-support/create-ticket.ts` | Create | Create/idempotency/correlation logic (testable) |
| `src/app/api/cron/desk-ticket-poll/route.ts` | Modify | `processTicket` also flags `duplicateOf` from `desk_ticket_id` |
| `_docs/task/445-support-harness.ts` | Create | Signed-request harness |
| `CLAUDE.md` | Modify | Document the direct path |

## Code Context

Reference implementation of a secret-authed StackShift → Hub route: `src/app/api/webhooks/stackshift-order/route.ts` (idempotency via `dedupe_key`, zod `safeParse`, `adminClient` insert). Email-poll's customer resolution and reopen rules: `src/app/api/cron/email-poll/route.ts` (contacts lookup, `matchedTicketStatus === "closed"` ⇒ open). Task-379 notification: `notifyCustomerTicketCreated` in `src/lib/desk/customer-view-access.ts` — call it only when notifications are enabled. `processTicket()`/`findMailDuplicate()` live in the desk-ticket-poll route (task 441).

## Implementation Steps

1. Write schemas + `create-ticket.ts` with pure decision helpers and checks (idempotency decision, correlation resolver).
2. Implement the three routes on the 444 foundation.
3. Extend `processTicket()` for the reverse correlation.
4. Write the harness; run it against local dev with a throwaway secret and test site.
5. `tsc`, eslint, update CLAUDE.md.

## Acceptance Criteria

- [ ] Every harness case passes locally; replay returns `deduped:true`; conflicting replay returns 409.
- [ ] A direct create with a `deskTicketId` whose Desk row exists flags both rows; with the Desk row arriving later (poll), the poll flags both.
- [ ] `inbox.external_id` is never written by the direct path; no row is skipped or merged.
- [ ] Customer emails are not sent while `STACKSHIFT_SUPPORT_NOTIFY_CUSTOMER` is unset/false.
- [ ] Missing secret ⇒ 503; wrong site ⇒ 403; audit rows written.
- [ ] `tsc` + eslint clean; CLAUDE.md updated.

## Verification

```bash
npx tsc --noEmit
pnpm lint
npx tsx _docs/task/445-support-harness.ts --base http://localhost:3000
# Browser: /desk/inbox — direct ticket + its Desk copy both show the duplicate badge
```

## Compatibility Touchpoints

Depends on task 444 (migration applied by the operator first). `CLAUDE.md`, `env.example`. Touches the Desk poll only additively.


## Implementation Notes

### What Changed
- Migration 170 (written, not applied): `stackshift_idempotency` (key, route, body_hash, stored response).
- `src/lib/stackshift-support/`: `schema.ts` (strict zod), `inbound-logic.ts` (pure: priority map, idempotency decision, createdAt clamp, duplicate resolver, notify gate, status patch), `inbound.ts` (shared pipeline + `loadTicketForSite`), `create-ticket.ts`, `comment-status.ts`.
- Routes under `src/app/api/webhooks/stackshift-support/v1/tickets/` (create, comments, status).
- `desk-ticket-poll` `processTicket()`: additive reverse correlation via `findDirectTwin()` (exact `desk_ticket_id` beats the Mail heuristic; flags both rows).
- `database.ts`: the `inbox`/`inbox_messages` column types promised by task 444 had not actually landed (only the channel union, tables and RPC had) — added now, plus `stackshift_idempotency`.
- Harness `_docs/task/445-support-harness.ts`, checks `_docs/task/445-support-inbound.check.ts`, CLAUDE.md bullet, contract note on `urgent` → `critical`.

### Deviations From Plan
- Added migration 170 (user-approved) for idempotency storage.
- Non-empty `attachments` rejected with `invalid_payload` until task 447.
- Comment/status handlers live in `comment-status.ts` rather than `create-ticket.ts`.
- The first message's `external_ref` is `<ticketRef>#body`.

### Verification Run
- `npx tsx _docs/task/445-support-inbound.check.ts` and `444-...auth.check.ts` - PASS
- `npx tsc --noEmit` - PASS; eslint on the touched dirs - PASS; harness type-checks
- Harness against a running server - NOT RUN (needs migrations 169 + 170 applied and a throwaway secret in `.env.local`)
- Browser check of the duplicate badge on /desk/inbox - NOT RUN

### Live harness run (2026-10-09)
- `npx tsx _docs/task/445-support-harness.ts --base http://localhost:3000` against the dev server and the hosted Supabase project (migrations 169-174 applied): all 20 core cases PASS (create, replay, key conflict, lost-response retry, comment, status, wrong site 403, bad/stale/unknown-key auth 401, strict payload, oversize 413, rate limit 429).
- The first run FAILED every create with a 500 — see the bug recorded in task 447's notes. Fixed and re-run green.
