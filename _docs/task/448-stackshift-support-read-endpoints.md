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
