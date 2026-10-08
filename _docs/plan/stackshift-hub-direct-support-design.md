# StackShift Support → Hub Direct — Design (task 442)

**Status:** Draft for user review · **Date:** 2026-10-08 · **Scope:** Hub side only. The StackShift app is a separate, later project — see `stackshift-hub-support-handoff.md`. Wire contract: `stackshift-hub-support-api-contract.md`.

## 1. Goal and hard constraints

Replace **StackShift Support → Zoho Desk → Hub** with **StackShift Support → Hub**, keeping Zoho Desk only as a temporary fallback, then removing it.

1. **The current flow is not disabled, removed, rescheduled or demoted** (Desk polls/crons, helpdesk@ Desk email channel, task-441 duplicate flag) **until the direct path is confirmed working in production** via the parity gate (§9) and the user signs it off.
2. **During the overlap, duplicates are allowed and badged** — never auto-skipped, never auto-merged.
3. **Hub side only.** Nothing here requires touching the StackShift app; the Hub is verified with a test harness (§10).
4. Existing Hub conventions apply: `adminClient` for service-level writes with an inline exception comment, secret-authed webhooks fail closed (503 when unset), written-not-applied migrations, `customer_id` stays the universal cross-system key.

## 2. Current state (verified in tasks 388–392, 441)

```
StackShift app ──create/comment/upload──▶ Zoho Desk ◀── helpdesk@ email-to-ticket
                                              │
              Hub (read-only) ◀── desk-ticket-poll: search pass (modified cursor, lags hours–days)
                                         + created-pass (real-time list, 1 Get Ticket per new ticket)
Zoho Mail helpdesk@ ──▶ Hub email-poll (+ Sent folder) ──▶ inbox / inbox_messages
Hub staff reply ──▶ Zoho Mail (email only). Nothing is ever written back to Desk / StackShift.
```
Key facts the design relies on:
- `inbox.external_id` (unique) = Desk ticket id; `channel` ∈ `portal|email|manual|api`; `ticket_number` = Hub serial; `source_meta.duplicateOf` flags a Desk copy of a Mail ticket (heuristic: requester + subject + ±1 h).
- `inbox_messages`: `author_type` `staff|client`, `visibility` `public|internal`, `external_id` (Desk thread/comment id), `email_message_id`, `source_meta.contentType` (always `text/html` for Desk-sourced), `created_at` = source time.
- Attachments: `attachments` table (`entity_type='inbox_message'`), bucket `ticket-attachments`; large files go browser/server-direct to Storage via signed URLs (task 339/350 pattern), never through a handler (Vercel ~4.5 MB cap).
- Precedent to copy: `/api/webhooks/stackshift-order` — shared-secret header, timing-safe compare, 503 when unset, `idempotencyKey` dedupe, `/uploads` step minting signed URLs.
- Customer-facing: task-379 "ticket created" email + per-ticket view password (`customer_view_*` columns).

## 3. StackShift-side assumptions (validate in the StackShift project)

| # | Assumption | Source | Validate by |
|---|-----------|--------|-------------|
| A1 | StackShift creates tickets via Desk `POST /tickets` with `cf_stack_shift_site` set at creation, `description` becoming the opening thread | task 388, live ticket 21466 history | read `create-ticket.ts` |
| A2 | Replies are Desk **comments** (`create-ticket-comment.ts`), customer vs staff via `commenter.type` | tasks 388/389 | read comment route |
| A3 | Ticket-level files are Desk attachments with no thread/comment linkage | task 392 | read upload route |
| A4 | Support Center lists tickets by site (`list-all-tickets-v2.ts`) and shows thread, attachments, due date, activity log, Resolve | live UI screenshots | read list/get routes |
| A5 | End-user identity per comment is resolved by an internal datahub API the Hub cannot reach | task 388 | read identity helper |
| A6 | Customer-visible ticket number is Desk's (#21079) | live UI | confirm what the UI renders |
| A7 | StackShift is a trusted server that can sign requests and call the Hub server-to-server (end users never reach the Hub) | user decision: "we control it" | confirm runtime (Node server routes) |
| A8 | StackShift can send the Desk ticket id it just created (needed for correlation) | A1 (create returns the id) | confirm |

## 4. Target architecture

```
StackShift server ──signed HTTPS──▶ Hub /api/webhooks/stackshift-support/v1/*   (create, comment, attach, resolve, reads)
Hub staff action ──▶ outbox ──signed HTTPS (retried)──▶ StackShift events endpoint (reply, status, assignee, due)
Overlap: StackShift ALSO still writes to Desk (dual-write); Desk polls unchanged.
```
- The Hub is the **source of truth** for tickets created through the direct path. StackShift's Support Center reads them **live from the Hub** (§11 D1) — no StackShift-side mirror to drift.
- End users never call the Hub. StackShift authenticates its user, then calls the Hub with a signed request whose body carries the **actor** (user ref, email, name, site). The HMAC covers the body, so the Hub trusts identity exactly as far as it trusts the StackShift server.

## 5. Data model (migration, written-not-applied; next free number after 168)

`inbox` — add:
| Column | Type | Purpose |
|--------|------|---------|
| `external_ref` | text, unique, nullable | StackShift's own ticket id (direct-path idempotency + lookup key) |
| `stackshift_site` | text, nullable, indexed | site slug (authorization scope; mirrors `source_meta.stackShiftSite` which stays for Desk rows) |
| `stackshift_actor_ref` | text, nullable | StackShift end-user id of the requester |
| `channel` | widen check | add `'stackshift'` (direct path). `'api'` stays = Desk-polled StackShift tickets; the UI label for both is "StackShift" |
| `desk_ticket_id` | text, nullable, indexed | the Desk ticket id StackShift reports during dual-write (NOT unique; **not** written to `external_id`, see §6) |

`inbox_messages` — add `external_ref text unique nullable` (StackShift comment id; idempotent upsert key), reuse `author_type`, `visibility`, `source_meta.contentType='text/html'`.
New tables: `stackshift_outbox` (id, ticket_id, event_type, payload jsonb, sequence bigint per ticket, status `pending|sent|dead`, attempts, next_attempt_at, last_error, created_at) and `stackshift_support_audit` (id, at, route, key_id, site, ticket_ref, outcome, ip). RLS: staff-only read, service role writes (same posture as `validation_logs`).
Numbering: Hub serial `ticket_number` (global sequence, already ahead of imported Desk numbers). The create response returns it; StackShift displays it. Old Desk numbers remain on old tickets; each ticket carries both when correlated (`source_meta.deskTicketNumber`).

## 6. Overlap behaviour: duplicates allowed and badged

- **Direct path always creates its own row** (`channel='stackshift'`, `external_ref` set). It never writes `external_id`, so the Desk poll's `onConflict: external_id` upsert can never overwrite or collide with it. Result during dual-write: two Hub rows for one ticket (the direct one and the Desk-polled one).
- **Exact correlation** (no heuristic): the create payload carries `deskTicketId`. The Hub stores it in `desk_ticket_id` and stamps both rows: `source_meta.duplicateOf = { inboxId, ticketNumber, via: "desk_ticket_id" }` — on the direct row when a Desk row with `external_id = deskTicketId` exists, and (via the poll's `processTicket()`, extended) on the Desk row when a direct row with that `desk_ticket_id` exists. Order-independent (webhook may arrive before or after the poll).
- **Badge:** detail-page banner already exists (task 441). Add an Inbox **list pill** ("Duplicate · #n") and make the banner wording symmetrical (it currently says "email ticket"). The badge never hides a row.
- **Customer email suppression:** while Desk is still emailing/StackShift-notifying the customer, the direct path must **not** also send the task-379 "ticket created" email. Request flag `suppressCustomerNotifications` (default `true` during the overlap, flipped by config at cutover).
- **Staff workflow in the overlap:** staff should work the **direct** row (it can push replies to StackShift); the Desk copy is read-only reference. The badge text on the Desk row says which one is authoritative.
- **Residual heuristic:** the Desk-email ↔ Mail-poll duplicate (task 441) has no exact key today (Desk thread export carries no RFC822 Message-ID). It stays heuristic and flag-only. Action item: check whether Desk threads expose a message-id header; if so, upgrade to exact in a follow-up.

## 7. "Exists in Mail or StackShift" — exact keys (used by the Desk fallback)

| Source | Exact key | Where |
|--------|-----------|-------|
| StackShift direct | `inbox.desk_ticket_id` (during dual-write) / `external_ref` | direct rows |
| Zoho Mail | `inbox.zoho_mail_thread_id`, `inbox_messages.email_message_id` | email rows |
| Desk-polled | `inbox.external_id` | Desk rows |
Fallback rule after cutover: the Desk poll (reconcile-only) ingests a Desk ticket **only if** no row has `external_id = id` **and** no row has `desk_ticket_id = id`; otherwise it only refreshes the existing Desk row. A miss (StackShift ticket in Desk but not in Hub) is **alerted** (Cliq) in the reconcile phase, not silently imported, because it signals the direct path failed.

## 8. Security model (summary; full detail in the contract)
HMAC-SHA256 request signing with key id, timestamp (±5 min), body hash; secret pair for zero-downtime rotation; 503 when unset; timing-safe compare; per-site authorization on every read/write (a site only touches `stackshift_site = its site`); only `visibility='public'` messages and non-internal fields ever leave the Hub; size/rate limits; every request audited; no provider payloads echoed.

## 9. Staged rollout, rollback, parity gate

| Stage | Hub change | StackShift project | Rollback |
|-------|-----------|--------------------|----------|
| 0 | List pill + symmetric duplicate banner | — | revert UI |
| 1 | Migration + inbound create/comment/resolve (+ uploads) + audit + test harness | dual-write behind a per-site flag, Desk unchanged | flag off; rows are additive |
| 2 | Outbox + outbound events (reply/status/assignee/due) + admin replay | receive events, render Hub replies | stop dispatcher; outbox keeps events |
| 3 | Attachments both ways | send/receive files | disable attachments only |
| 4 | Read endpoints (list/get) | Support Center reads from Hub **for flagged sites** | flip site flag back to Desk reads |
| **Gate** | parity report job (§below) | — | — |
| 5 | Desk polls → reconcile-only, cron cadence lowered | stop writing to Desk | restore cadence; re-enable dual-write |
| 6 | Desk email channel for helpdesk@ off; Desk crons off; duplicate cleanup script | — | re-enable channel |

**Parity gate (user sign-off required before stage 5):** over a window of ≥14 days **and** ≥50 tickets on a pilot site (decided 2026-10-08; whichever is later), for every StackShift ticket created: (a) a direct Hub row exists (zero misses by `desk_ticket_id`), (b) message counts and per-message bodies/timestamps match the Desk-polled copy, (c) attachment counts match, (d) status/resolved timestamps match, (e) outbound events were delivered (outbox `sent`, none `dead` unresolved), (f) no unresolved 5xx/auth failures in the audit log. A Hub admin report (query + page) produces this; gate passes only when all six are clean and the user approves in writing.

## 10. Hub-side verification (no StackShift app)
- **Signed example request suite**: a `tsx` script generating signatures from the shared secret and exercising create, duplicate key (same body → 200 `deduped`; different body → 409), comment, upload-sign + register, resolve/reopen, stale timestamp, bad signature, wrong site, oversize, rate limit, 503 when secret unset. Documented with `curl` equivalents in the hand-off spec.
- **Mock receiver** for outbound events: a tiny local server that verifies the Hub's signature, can return 5xx on demand, and records event ids to test retry, ordering and dedupe.
- **Pure-logic checks** (`npx tsx`, repo convention) for: signature verify/skew, idempotency decision, duplicate-correlation resolver, outbox backoff schedule, site-authorization filter.

## 11. Decisions and open questions

| # | Question | Recommendation | Status |
|---|----------|----------------|--------|
| D1 | Support Center reads live from Hub vs StackShift mirror | **Live from Hub** (one source of truth; list/get endpoints, cursor pagination) | proposed |
| D2 | Customer auth for "their" tickets | StackShift authenticates the user and signs the call with actor + site; Hub authorizes by `stackshift_site` and `stackshift_actor_ref` | proposed |
| D3 | SLA / due date | Hub computes `dueAt` from priority via an admin-editable config table (priority → hours), returned in create response and events. Seed defaults (editable, to confirm): urgent 4 h / high 8 h / normal 24 h / low 72 h | **decided 2026-10-08** (config table); hour values still to confirm |
| D4 | Customer notifications | Suppressed on the direct path during overlap; at cutover the **Hub sends them** (task-379 ticket-created email with view password + reply emails via Zoho Mail); StackShift stays silent | **decided 2026-10-08** |
| D5 | In-flight Desk tickets at cutover | Stay Desk rows (read-only); new activity on them keeps syncing through the reconcile pass until closed | proposed |
| D6 | Merge instead of flag after cutover | One-time cleanup script retires the Desk copy of each correlated pair (keeps direct row, copies Desk-only fields) — separate task, after the gate | proposed |
| D7 | Rate limiting store | **Postgres counter per (site, minute)** — durable across serverless instances, no new infrastructure (one small write per request) | **decided 2026-10-08** |
| D8 | Outbound transport | Push webhook with outbox + retries (at-least-once, per-ticket `sequence`, receiver dedupes by event id) | proposed |

## 12. Proposed follow-up tasks (not yet added to TASKS.md — pending design approval)
1. Inbox list duplicate pill + symmetric banner (stage 0).
2. Migration (columns, outbox, audit) + inbound endpoints + signing library + test harness (stage 1).
3. Outbox + outbound dispatcher + admin replay UI (stage 2).
4. Attachments both ways (stage 3).
5. Read endpoints for the Support Center (stage 4).
6. Parity report + gate checklist page (gate).
7. Desk demotion + helpdesk@ channel + cron retirement + duplicate cleanup (stages 5–6, only after sign-off).
