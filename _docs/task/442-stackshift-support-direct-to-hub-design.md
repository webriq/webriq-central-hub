# 442: StackShift Support → Hub Direct (Replace Zoho Desk) — Design Doc + API Contract

**Created:** 2026-10-08
**Priority:** MEDIUM
**Type:** design / investigation (no product code)
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

Today StackShift tickets flow **StackShift Support Center → Zoho Desk → Hub** (Hub reads Desk one-way; task 388, hardened by task 441). Zoho is being decommissioned, so the target is **StackShift Support → Hub directly**, with Zoho Desk demoted to a fallback that is only consulted for tickets that exist in neither the helpdesk Zoho Mail channel nor StackShift Support, and then removed.

Decisions already made with the user (2026-10-08):
- The StackShift app (`webriq-pagebuilder/app`) **is under our control** and can be changed as part of this project.
- **Scope (user, 2026-10-08): Hub side only for now.** Everything in this task and its follow-ups is built and verified **inside this repo**. The StackShift app work is **transferred to a separate project later**; this task only produces what that project will need: the contract, a hand-off spec, and a Hub-side test harness. The StackShift app is never modified or required for Hub-side acceptance.
- **Safety constraint (user, 2026-10-08): the current StackShift Support → Zoho Desk → Hub flow is NOT disabled or removed** — no cron unscheduled, no Desk poll removed, no Desk email-channel or workflow change — **until the direct StackShift → Hub path is confirmed working** in production (an explicit, documented parity check approved by the user). Until then the two paths **run side by side and may produce duplicate Hub tickets; duplicates are allowed and are shown with a badge** (extending the task-441 `source_meta.duplicateOf` flag), never auto-skipped or merged.
- This task produces a **design document + the StackShift ↔ Hub API contract only**. No webhook/route/migration code is written here; implementation is split into the follow-up tasks this design defines.

Why a design first: moving the system of record changes more than ticket creation. The StackShift Support Center is currently a *client of Zoho Desk's API* (list tickets by site, thread, comments, attachments, resolve, activity log). Replacing Desk means the Hub must serve those capabilities, push staff replies/status back, and keep numbering/identity coherent — and the "does it already exist elsewhere" check must be exact, not heuristic.

## Context from task 441 (verified, do not re-derive)

- The Hub is **read-only toward Desk**; staff replies from the Hub go out by email via Zoho Mail (`/api/desk/tickets/[ticketId]/reply`), never to the StackShift thread.
- Desk's `/tickets/search` index lags hours–days; discovery now uses the created-pass (`runCreatedPass`) — a stopgap that disappears when StackShift posts to the Hub directly.
- helpdesk@ also feeds Zoho Desk (email-to-ticket), so the same email can exist as a Mail ticket **and** a Desk ticket. The Desk poll flags this heuristically (`source_meta.duplicateOf`, same requester + subject + ±1 h). The heuristic is only acceptable until an exact correlation key exists.
- `inbox.external_id` (unique) is the Desk ticket id and the upsert conflict key; `inbox.channel` already has `'api'` (rendered "StackShift"); `ticket_number` is the Hub's own serial.
- Existing precedent for a secret-authed StackShift → Hub webhook: `src/app/api/webhooks/stackshift-order/` (`_secret.ts` timing-safe header check, 503 when unset, `idempotencyKey` dedupe, signed direct-to-Storage uploads for large files, notify-only recording).

## Requirements

### R1 — StackShift-side inputs (assumptions to validate later; no StackShift repo work in this task)
- [ ] The StackShift repo is not in this workspace and is out of scope here. Record what the Hub **assumes** about StackShift's current Desk integration (from tasks 388–392, the poll code and live Desk data) as an explicit **assumptions list**, each marked "validate in the StackShift project". Where the StackShift repo is later available, that project completes the inventory below.
- [ ] Inventory every Zoho Desk call in `webriq-pagebuilder/app` (**deferred to the StackShift project**; listed so the hand-off spec covers it) (e.g. `web/pages/api/support_desk/*`): create ticket, list (`list-all-tickets-v2`), get thread, create comment, attachments, resolve/reopen, activity log, SLA/due date. For each: request/response shape, who calls it (customer vs staff), and which Support Center screen depends on it.
- [ ] Inventory how StackShift correlates a Desk comment to the *real end user* (task 388 noted it uses an internal datahub API the Hub cannot reach) and what identity/site data it can send the Hub.

### R2 — API contract (the main deliverable; the Hub side is the source of truth)
Define, as a versioned contract document, at minimum:
- [ ] **Inbound (StackShift → Hub):** create ticket, add customer comment, upload attachment (signed direct-to-Storage, task 339/350 pattern — not through the handler), resolve/reopen. Payload fields, validation (zod), idempotency key, response (`hubTicketId`, `ticketNumber`, display id), error codes.
- [ ] **Reads for the Support Center UI (StackShift → Hub):** list tickets by site/customer, get ticket + thread + attachments + activity. Decide pull vs. mirrored copy.
- [ ] **Outbound (Hub → StackShift):** staff reply, status/assignee/due-date changes, internal-vs-public visibility. Decide webhook-push (signed, retried, with a dead-letter/replay story) vs. StackShift pull.
- [ ] **Auth:** service-to-service secret (header, timing-safe, 503 when unset — same shape as the order webhook) plus a signed **user-context assertion** (site + end-user id) so customers never call the Hub directly and the Hub never trusts client-supplied identity. Replay protection (timestamp + nonce window) and rotation story.
- [ ] **Security model:** payload size limits, rate limiting, per-site authorization (a site can only see its own tickets), no raw provider payloads echoed back, audit log.

### R3 — Data model & numbering
- [ ] Decide the Hub columns for StackShift-native tickets (e.g. `channel = 'stackshift'` vs. keeping `'api'`; `external_ref` for StackShift's own ticket id; `stackshift_site`; customer/user linkage) and the migration (written-not-applied convention).
- [ ] **Duplicates are allowed during the overlap.** The design must treat a duplicate (same ticket arriving via Desk and via the direct path) as a flagged, visible state, not an error. Specify the badge: reuse `source_meta.duplicateOf`, show it on the detail page (exists since 441) **and** add a pill in the Inbox list (not built yet), plus how the badge clears or persists after cutover.
- [ ] **Dual-write correlation (optional merge, never required):** during migration StackShift creates the Desk ticket *and* posts to the Hub, sending the Desk ticket id. If the Hub writes that id into `inbox.external_id`, the existing Desk-poll upsert (`onConflict: "external_id"`) merges instead of duplicating — verify this and define the race (webhook before Desk poll vs. after).
- [ ] Ticket numbering: customers currently see Desk numbers (e.g. #21079). Decide what they see after cutover and how old numbers map.

### R4 — Desk as fallback, then removal (gated — nothing is switched off before the gate passes)
- [ ] Define "exists in Mail or StackShift" **exactly**: correlation keys per source (StackShift ref / Desk id for StackShift tickets; `zoho_mail_thread_id` or exact message-id for email tickets) replacing the requester+subject heuristic. Define what happens on a miss (import, flag, or alert) and for historical tickets.
- [ ] Define the **go/no-go gate** for any Desk step-down: a time-boxed parity window in which every StackShift ticket exists in the Hub via the direct path with matching thread/attachments/status (counts + per-ticket diff, zero misses), signed off by the user. Until the gate passes, Desk polls, crons and the helpdesk@ Desk channel stay exactly as they are.
- [ ] Plan the demotion (executed only after the gate): Desk poll reconcile-only (read-only, low cadence) → off. Include turning **off the Desk email channel for helpdesk@** so email tickets stop being duplicated, and retiring the created-pass/search-pass crons (`stackshift-desk-ticket-poll`).

### R5a — Hub-side test harness + StackShift hand-off spec
- [ ] Define how the Hub side is verified **without** the StackShift app: a documented set of signed example requests (create, comment, attachment sign/register, resolve, auth failures, replay, duplicate idempotency key) runnable with `curl`/a script against local and preview, and a mock receiver for Hub → StackShift outbound events.
- [ ] Produce `_docs/plan/stackshift-hub-support-handoff.md`: everything the StackShift project needs to implement its side — endpoints and payloads to call, headers/signing, env vars/secrets to provision, outbound event schema it must accept, error/retry behaviour, the dual-write sequence, and the parity-gate checklist.

### R5 — Staged migration & rollout plan
- [ ] Ordered follow-up tasks with dependencies, each independently shippable and reversible, e.g. (0) duplicate badge in the Inbox list (small, independent of the rest), (1) inbound create + comment webhook with dual-write (Desk flow untouched), (2) Hub → StackShift replies/status, (3) attachments, (4) Support Center reads from Hub, (5) **parity gate** — user-approved sign-off, (6) only then Desk demoted to reconcile-only, (7) Desk email channel + crons off. Rollback per stage; parity checks (counts and per-ticket thread diff Desk vs Hub) before each cutover.
- [ ] List everything that must change **outside** this repo (StackShift app, Desk workflow rules/webhooks, Zoho Mail routing) and who owns it. These items go into the hand-off spec and are **not** worked on here.

### R6 — Open questions to resolve in the doc
- [ ] Should the Support Center read tickets live from the Hub, or from a StackShift-side mirror the Hub pushes to?
- [ ] How do customers authenticate to see "their" tickets after cutover (today: Desk-scoped by site)?
- [ ] SLA/due-date ownership (Desk sets `dueDate` today).
- [ ] Customer-facing notifications (Desk emails today vs. Hub's task-379 "ticket created" email + view password).
- [ ] What happens to in-flight Desk tickets at cutover.

## Out of Scope / Must-Not-Change

- **No implementation:** no routes, migrations or cron changes in this task — design, contract and hand-off spec only. **No StackShift-app changes, ever, in this repo's tasks** — that is the later project.
- No change to the Zoho Mail poll, intake filter, or ticket numbering of existing rows.
- No write-back to Zoho Desk (the one-way rule stands until the contract says otherwise).
- Do not remove, disable, reschedule or demote the Desk poll/crons, the Desk email channel, or the task-441 duplicate flag — not in this task, and not in any follow-up until the parity gate in R4 passes and the user confirms.
- Do not auto-skip or merge duplicates in the overlap period; flag them only.
- No git commands.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `_docs/plan/stackshift-hub-direct-support-design.md` | Create | The design doc: inventory, decisions, data model, rollout |
| `_docs/plan/stackshift-hub-support-api-contract.md` | Create | Versioned API contract (inbound, reads, outbound, auth), with example payloads and error codes |
| `_docs/plan/stackshift-hub-support-handoff.md` | Create | Hand-off spec for the future StackShift project + Hub-side test harness (signed example requests, mock receiver) |
| `_docs/task/442-stackshift-support-direct-to-hub-design.md` | Modify | Implementation Notes + follow-up task list |
| `TASKS.md` | Modify | Add follow-up tasks once the design is approved |

## Code Context

Read, don't modify:
- `src/app/api/webhooks/stackshift-order/route.ts`, `_secret.ts`, `uploads/route.ts` — the secret-auth, idempotency and direct-upload pattern to reuse.
- `src/app/api/cron/desk-ticket-poll/route.ts` — `processTicket()` (idempotent upsert on `external_id`), `findMailDuplicate()`, `runCreatedPass()`.
- `src/lib/desk/stackshift-message-sync.ts` — how Desk threads/comments map to `inbox_messages` (author type, visibility, `external_id`, `created_at`).
- `src/app/api/desk/tickets/[ticketId]/reply/route.ts` — current outbound path (email via Zoho Mail only).
- `src/lib/desk/customer-view-access.ts` — customer-facing ticket view password.
- `_docs/task/388-stackshift-desk-ticket-live-ingestion.md`, `389`, `390`, `392`, `441` — prior decisions and deferrals (attachments, end-user identity, two-way sync).
- In the StackShift repo (not in this workspace; locate it first): `web/pages/api/support_desk/*`, especially `list-all-tickets-v2.ts` and `create-ticket-comment.ts`.

## Implementation Steps

1. Compile the StackShift-side assumptions list (R1) from existing task docs, the poll code and live Desk data; do not go looking for the StackShift repo.
2. Draft the contract (R2) and data model (R3) against the inventory; reuse the order-webhook pattern for auth, idempotency and uploads.
3. Specify the exact correlation keys and the Desk demotion plan (R4).
4. Write the staged rollout with rollback and parity checks (R5); resolve or explicitly park the open questions (R6) with the user.
5. Review the design with the user; on approval add the follow-up tasks to `TASKS.md`.

## Acceptance Criteria

- [ ] The StackShift-side assumptions are listed and flagged "validate in the StackShift project" (the full inventory is deferred to that project).
- [ ] A hand-off spec exists that lets the StackShift project implement its side without further Hub-team input, and a Hub-side test harness defines how every endpoint is verified with no StackShift app.
- [ ] The API contract covers inbound, reads, outbound and auth, with example payloads, validation rules, idempotency and error codes.
- [ ] The data model + migration outline and the dual-write correlation (Desk id → `external_id`) are specified, including the race handling.
- [ ] "Exists in Mail or StackShift" is defined with exact keys; no heuristic matching remains in the target design (the heuristic flag stays in place during the overlap).
- [ ] The design states the safety constraint explicitly: current flow untouched until the user-approved parity gate passes; duplicates allowed and badged (detail banner + list pill) in the overlap.
- [ ] A staged rollout exists with ordered follow-up tasks, rollback per stage, parity checks, and the list of out-of-repo changes with owners.
- [ ] Open questions are answered or explicitly deferred, and the user has approved the design.

## Verification

```bash
# Docs only — no build impact
ls _docs/plan/stackshift-hub-direct-support-design.md _docs/plan/stackshift-hub-support-api-contract.md
# Review: walk each acceptance criterion against the design doc with the user
```

## Compatibility Touchpoints

- Follow-up tasks will touch: a new `/api/webhooks/stackshift-support/*` route tree, `inbox` columns (migration, written-not-applied), the Desk poll crons (pg_cron migration), `CLAUDE.md` (poll/webhook notes), `env.example` (new secrets), and `_docs/mcp-tools.md` only if MCP tools are added.
- The StackShift app (separate repo) and Zoho Desk configuration (email channel, workflows) change in later tasks.
- Related tasks: 339, 350, 379, 388–392, 441.


## Implementation Notes

### What Changed
- Produced the three design deliverables (docs only, no product code): the design doc (current state, StackShift-side assumptions A1–A8, target architecture, data-model outline, overlap/duplicate behaviour, exact correlation keys, security summary, staged rollout with rollback, parity gate, Hub test harness, decisions D1–D8, proposed follow-up tasks), the versioned API contract v1 (HMAC signing + rotation, inbound create/comment/status, signed direct uploads, reads, outbound events with outbox/retry, errors, audit, versioning, env), and the StackShift hand-off spec (signer sample, screen→endpoint map, env, behavioural rules, test approach, parity-gate checklist, open items).
- Applied the user constraints: current Desk flow untouched until a user-approved parity gate; duplicates allowed and badged (detail banner exists, list pill planned as stage 0); Hub-side only.

### Files Changed
- `_docs/plan/stackshift-hub-direct-support-design.md` (new)
- `_docs/plan/stackshift-hub-support-api-contract.md` (new)
- `_docs/plan/stackshift-hub-support-handoff.md` (new)
- `TASKS.md` — 442 moved Planned → In Progress → Testing

### Deviations From Plan
- **Residual heuristic (minor):** the "no heuristic matching remains" criterion holds for StackShift↔Desk (exact `desk_ticket_id`/`external_ref` keys) but the **Desk-email ↔ Mail-poll** pair has no exact key (Desk thread export has no RFC822 Message-ID) and stays a flag-only heuristic. Documented in design §6; follow-up item: check whether Desk threads expose a message-id header.
- Follow-up tasks are **proposed in the design (§12) but not added to `TASKS.md`** — the task says to add them on design approval, which has not happened yet.
- Several parameters are proposals needing user input before stage 1: SLA values (D3), customer-notification ownership at cutover (D4), rate-limit store (D7), parity-gate sample size N.
- The StackShift repo was not available; all StackShift-side statements are explicit assumptions (design §3).

### Verification Run
- `ls _docs/plan/stackshift-hub-direct-support-design.md _docs/plan/stackshift-hub-support-api-contract.md _docs/plan/stackshift-hub-support-handoff.md` - PASS
- Cross-read for consistency (endpoint names, headers, env vars, stage numbering across the three docs) - PASS after fixing the reads-identity encoding in the contract
- Build/lint/tsc - SKIPPED (docs only, no code changed)


## Quality Gate Notes

### Result
PASS

### Standards Review
- Docs-only task; no code, secrets or credentials (all secrets are named env vars, examples use placeholders). Scope respected: Hub side only, no StackShift-app or Desk changes, nothing disabled.
- Fixed during review: (1) the design doc claimed `curl` equivalents existed in the hand-off, but they didn't — added a signed `curl` example with replay/conflict/stale-timestamp checks to the hand-off §5; (2) clarified in the contract that the signed path is the full path as the Hub receives it (the hand-off signer sample and the contract now agree).
- Cross-doc consistency re-checked: endpoint names, headers, env vars (`STACKSHIFT_SUPPORT_SECRET[_NEXT]`, `STACKSHIFT_EVENTS_SECRET/URL`), stage numbering 0–6 and the gate wording match across the three docs and the task doc.

### Deviations
- Minor: residual Desk-email ↔ Mail heuristic (already recorded in Implementation Notes).
- Minor: follow-up tasks proposed but intentionally not added to `TASKS.md` until the design is approved.
- Medium (visible, acceptable): the last acceptance criterion ("user has approved the design") and the open decisions D3/D4/D7 and gate sample size N are **not yet resolved** — they require the user's review, which is the purpose of the next stage. No implementation work may start from these docs until that approval.

### Required Fixes
- None.


### Decisions recorded (2026-10-08, via AskUserQuestion)
- **D3 SLA:** admin-editable config table (priority → hours); seed urgent 4 / high 8 / normal 24 / low 72 h, hour values still to confirm.
- **D4 Notifications after cutover:** the Hub sends customer emails (task-379 ticket-created + replies via Zoho Mail); StackShift stays silent; suppressed during the overlap.
- **D7 Rate limit:** Postgres counter per (site, minute).
- **Parity gate:** ≥14 days and ≥50 tickets on a pilot site.
- Remaining unapproved: the design as a whole (acceptance criterion), SLA hour values.

### Follow-up tasks created (2026-10-08, on user request)
443 Inbox list duplicate pill + symmetric banner · 444 foundation (migration 169, signing, rate limit, audit, SLA) · 445 inbound endpoints + exact correlation + harness · 446 outbox/outbound events/replay UI/Hub customer emails · 447 attachments · 448 read endpoints · 449 parity report + gate · 450 Desk step-down (**blocked** on the gate + written sign-off). Added to `TASKS.md` under Planned.
