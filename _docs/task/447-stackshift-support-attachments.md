# 447: StackShift direct support — attachments both ways (signed direct uploads, register/verify, outbound download URLs) (stage 3)

**Created:** 2026-10-08
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Contract §4: StackShift uploads files straight to Storage via Hub-minted signed URLs and registers them with create/comment; staff attachments on replies are exposed to StackShift as short-lived download URLs in `ticket.reply` events and in reads. Reuses the task 339/350 direct-upload machinery and the order-webhook `/uploads` precedent, so the Next.js handler never carries file bytes (Vercel ~4.5 MB cap).

Part of the StackShift Support → Hub direct rollout: design `_docs/plan/stackshift-hub-direct-support-design.md`, contract `_docs/plan/stackshift-hub-support-api-contract.md`, hand-off `_docs/plan/stackshift-hub-support-handoff.md` (parent task 442).

## Requirements

- [ ] `POST /api/webhooks/stackshift-support/v1/uploads/sign`: signed, site-authorised; ≤10 files, ≤25 MB each, MIME allowlist = the task-attachment allowlist (`attachment-types.ts`); path `stackshift-support/<ticket>/<ts>_<rand>_<name>` server-generated; 15 min URLs.
- [ ] Register: `attachments` array on create/comment verifies each object exists and its leading bytes match the declared MIME (`verifyUploadedObject`), then inserts `attachments` rows (`entity_type='inbox_message'`, `external_id` for idempotency); failure ⇒ 400 with the offending path.
- [ ] Outbound: attachments on staff replies are added to the `ticket.reply` payload with `downloadUrl` (Storage signed URL, 15 min, minted at dispatch/at read, never stored).
- [ ] Cleanup note: orphaned uploaded-but-unregistered objects bounded by the 200 MB bucket and timestamped paths (same trade-off as task 339); document, do not build a sweeper.

## Out of Scope / Must-Not-Change

- The existing StackShift → Zoho Desk → Hub flow is **not** disabled, removed, rescheduled or demoted (Desk polls/crons, `desk-ticket-poll`, helpdesk@ Desk email channel, task-441 duplicate flag stay as they are). Only task 450 may touch them, and only after the parity gate passes with the user's written sign-off.
- Duplicates between the direct path and the Desk-polled copy are **allowed and badged**, never auto-skipped or merged.
- Hub side only — no StackShift-app changes (a separate later project; see the hand-off spec).
- No git commands. Migrations are **written, not applied** by the agent.
- No malware scanning (task 373). No new bucket unless the existing one's MIME list blocks a needed type (then a migration, written not applied).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/webhooks/stackshift-support/v1/uploads/sign/route.ts` | Create | Mint signed URLs |
| `src/lib/stackshift-support/attachments.ts` | Create | Validate manifest, verify + register, outbound URLs |
| `src/app/api/webhooks/stackshift-support/v1/tickets/route.ts` | Modify | Accept/verify `attachments` |
| `src/app/api/webhooks/stackshift-support/v1/tickets/[ticketRef]/comments/route.ts` | Modify | Accept/verify `attachments` |
| `src/lib/stackshift-support/outbox.ts` | Modify | Attach download URLs to reply events |

## Code Context

`src/lib/uploads/attachment-storage.ts` (`createAttachmentUploadUrl`, `verifyUploadedObject`), `src/lib/stackshift-orders/uploads.ts` (`validateManifest`, `mintUploadUrls`), `src/app/api/webhooks/stackshift-order/uploads/route.ts`, `attachment-types.ts` + `src/config/powerpoint-types.ts`, and how `email-poll` writes `attachments` rows (`external_id` upsert, bucket `ticket-attachments`).

## Implementation Steps

1. Implement sign route + manifest validation.
2. Add register/verify to create + comment.
3. Outbound URL minting in outbox payloads.
4. Extend the harness with the upload round trip; `tsc`, eslint.

## Acceptance Criteria

- [ ] Upload round trip via the harness succeeds for an allowed type and fails (422) for a disallowed one.
- [ ] A spoofed/corrupt object is rejected at register time.
- [ ] `ticket.reply` events carry working, expiring download URLs.
- [ ] No file bytes pass through any handler.

## Verification

```bash
npx tsc --noEmit
pnpm lint
npx tsx _docs/task/445-support-harness.ts --base http://localhost:3000 --suite attachments
```

## Compatibility Touchpoints

Depends on 445/446. Existing `ticket-attachments` bucket and `attachments` table; `CLAUDE.md` note.


## Implementation Notes

### Decisions (user, 2026-10-09)
- Bucket: `ticket-attachments` (the Inbox viewer's bucket) via an optional `bucket` arg on the storage helpers. Outbound scope: download-URL machinery only, no staff upload UI.

### What Changed
- `attachments-logic.ts` (pure: manifest rules, path scheme + ownership guard, download shape), `attachments.ts` (mint upload URLs, verify + register, mint download URLs), `schema.ts` (strict attachment manifest + sign schema), `POST /v1/uploads/sign`.
- `create-ticket.ts` / `comment-status.ts`: attachments verified BEFORE any write; rolled back with the ticket if the attachment insert fails.
- `dispatch.ts` + `GET /events`: fresh 15-min download URLs injected into `ticket.reply` envelopes (never stored); `buildEnvelope` takes an allow-listed `attachments` arg.
- `inbound.ts`: `idempotencyKey` optional (sign mints no write). `attachment-storage.ts`: optional `bucket` (default unchanged).
- Harness `--suite attachments`; contract §4, CLAUDE.md updated; `_docs/task/447-attachments.check.ts`.

### Deviations From Plan
- Bucket `ticket-attachments`, not `project-assets` (the Inbox viewer only signs from the former).
- Paths include the site: `stackshift-support/<site>/<ticketRef>/…`, and register-time rejects paths not minted for that site + ticketRef or already registered (the doc's scheme let one site register another's upload).
- Oversize files at sign time return 413 `payload_too_large` (contract table), disallowed types 422.
- No staff-side attachment source exists in the Hub, so the outbound half can only be exercised with test attachment rows.

### Verification Run
- `npx tsx _docs/task/447-attachments.check.ts` (+ 444/445/446 checks still pass) - PASS
- `npx tsc --noEmit`, eslint (stackshift-support, webhooks, uploads), harness type-check - PASS
- Harness `--suite attachments` against a running server (sign -> PUT -> register, 422/413/400, spoof, cross-site) - NOT RUN (needs migrations 169-170 applied, ticket-attachments bucket from migration 117, throwaway secret)
- Real download-URL check in a `ticket.reply` event - NOT RUN

### Live harness run (2026-10-09)
- `--suite attachments`: all 10 cases PASS against the hosted project (sign, PUT straight to Storage, register on create, cross-site and cross-ticket path rejected, .exe 422, 26 MB 413, 11 files 400, spoofed .png rejected at register and no ticket created).
- **Bug found by the first live run and fixed:** `checkRegistered([])` ran the "at least one file" manifest rule on an empty list and crashed on `files[0]`, so EVERY create/comment without attachments returned 500. The pure checks only used non-empty lists. Fixed with an early return for an empty list plus a regression assertion in `447-attachments.check.ts`.
- Still not exercised live: outbound download URLs inside a `ticket.reply` event (needs a staff reply carrying attachment rows).
