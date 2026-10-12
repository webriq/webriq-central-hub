# 448: StackShift direct support — read endpoints for the Support Center (list/get, site-scoped, cursor-paginated) (stage 4)

**Created:** 2026-10-08
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Contract §5: signed `GET /tickets` and `GET /tickets/{ticketRef}` so the StackShift Support Center can read direct tickets live from the Hub (design D1). Strict site scoping and redaction: only `visibility='public'` messages, no staff identifiers, no `source_meta`, no other sites' tickets.

Part of the StackShift Support → Hub direct rollout: design `_docs/plan/stackshift-hub-direct-support-design.md`, contract `_docs/plan/stackshift-hub-support-api-contract.md`, hand-off `_docs/plan/stackshift-hub-support-handoff.md` (parent task 442).

## Requirements

- [ ] `GET /tickets?site=&status=&userRef=&cursor=&limit=` (limit 1–50, opaque keyset cursor on `(created_at, id)`): fields per contract; scoped to `stackshift_site = site`; optional `userRef` narrows to `stackshift_actor_ref`.
- [ ] `GET /tickets/{ticketRef}`: ticket + public messages (author name only, `bodyHtml`, attachments with fresh `downloadUrl`) + `activity[]` (created, replies, status changes, due changes derived from messages/events).
- [ ] Site authorization on every call (403 `site_forbidden`); rate limit and audit like the writes; identity comes only from signed query params.
- [ ] Pure checks for cursor encode/decode, redaction (a fixture with internal notes/`source_meta` must leak nothing) and site filtering.
- [ ] Scope is **direct** (`channel='stackshift'`) tickets only. Desk-polled rows stay Desk's responsibility until cutover (documented in the hand-off spec), so a site's Support Center list during the overlap is the direct tickets it created.

## Out of Scope / Must-Not-Change

- The existing StackShift → Zoho Desk → Hub flow is **not** disabled, removed, rescheduled or demoted (Desk polls/crons, `desk-ticket-poll`, helpdesk@ Desk email channel, task-441 duplicate flag stay as they are). Only task 450 may touch them, and only after the parity gate passes with the user's written sign-off.
- Duplicates between the direct path and the Desk-polled copy are **allowed and badged**, never auto-skipped or merged.
- Hub side only — no StackShift-app changes (a separate later project; see the hand-off spec).
- No git commands. Migrations are **written, not applied** by the agent.
- No write endpoints, no realtime/WebSocket, no full-text search.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/webhooks/stackshift-support/v1/tickets/route.ts` | Modify | Add GET list |
| `src/app/api/webhooks/stackshift-support/v1/tickets/[ticketRef]/route.ts` | Create | GET detail |
| `src/lib/stackshift-support/read-model.ts` | Create | Serialisers + redaction + cursor |
| `_docs/task/448-read-model.check.ts` | Create | Pure checks |

## Code Context

Messages live in `inbox_messages` (`author_type`, `visibility`, `external_ref`, `created_at`); attachments in `attachments` (`entity_type='inbox_message'`); activity can be derived from message timestamps and the outbox. Keyset pagination precedent in the Desk inbox list (`src/app/(hub)/desk/inbox/page.tsx` uses range/count; use keyset here). Auth/limit/audit from task 444.

## Implementation Steps

1. Write the read-model + checks.
2. Implement list/detail routes.
3. Extend the harness with read cases (including cross-site 403 and redaction).

## Acceptance Criteria

- [ ] A site can list/read only its own direct tickets; a request for another site's ticket returns 403/404 without leaking existence.
- [ ] No internal note, staff email/id or `source_meta` appears in any response (fixture check).
- [ ] Pagination is stable under inserts (keyset), `nextCursor` null at the end.

## Verification

```bash
npx tsc --noEmit
pnpm lint
npx tsx _docs/task/448-read-model.check.ts
```

## Compatibility Touchpoints

Depends on 444/445 (and 447 for attachment URLs). Contract §5 is the source of truth.


## Implementation Notes

### Decisions (user, 2026-10-09)
- Statuses: raw four (`open|on_hold|escalated|closed`) in reads and events (customers will see internal wording such as `escalated`). List stats via a migration 172 SQL function. Cross-site reads return 404 for both unknown and other-site tickets. Customer-initiated status changes are logged in `source_meta` for the activity list.

### What Changed
- `read-model.ts` (pure: keyset cursor, filters, allowlist serialisers, activity, status log) + `read-queries.ts` (DB: `listTickets`, `getTicket`).
- Routes: `GET .../v1/tickets` (added to the existing file) and new `GET .../v1/tickets/[ticketRef]`, both via `handleSignedGet`.
- Migration 172 (written, not applied): `stackshift_ticket_message_stats()` + a partial index for the list query. `database.ts` updated.
- `setCustomerStatus` appends a capped `customerStatusLog` to `inbox.source_meta`.
- Harness `--suite reads`; contract §5, hand-off and CLAUDE.md updated; `_docs/task/448-read-model.check.ts`.

### Deviations From Plan
- Cross-site reads return 404 (not the contract's 403 rule 7) so existence does not leak; documented in the contract.
- `status` filter accepts the raw Hub statuses in addition to the contract's `open|closed|all`.
- Activity has no due-date entries (no editing surface exists) and customer status changes depend on the new `source_meta` log, so closes/reopens made before this change have no activity entry.
- Messages are read with a 1000-row paging loop and all public messages are returned (no message pagination in v1).

### Verification Run
- `npx tsx _docs/task/448-read-model.check.ts` (cursor round-trip + tamper/injection rejection, keyset paging, filters, leak-proof fixture, activity ordering, status-log cap) - PASS; 444-447 checks still pass
- `npx tsc --noEmit`, eslint (stackshift-support, webhooks), harness type-check - PASS
- Harness `--suite reads` against a running server - NOT RUN (needs migrations 169-172 applied and a throwaway secret)

### Live harness run (2026-10-09)
- `--suite reads`: all 20 cases PASS against the hosted project with migration 172 applied (keyset paging with cursor and a null nextCursor at the end, userRef/status filters, bad status/limit/cursor/site 400, tampered GET signature 401, detail redaction, activity incl. the customer's close, empty list for another site, other site's ticket 404 identical to an unknown ref).
