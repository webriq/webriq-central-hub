# StackShift ↔ Hub Support API — Contract v1 (task 442)

**Status:** Draft v1 for review · The Hub implements and owns this contract. Design rationale: `stackshift-hub-direct-support-design.md`. Base path (Hub): `/api/webhooks/stackshift-support/v1`. All bodies JSON, UTF-8. Only the StackShift **server** calls the Hub; end users never do.

## 1. Authentication & signing

Headers on **every** request (both directions):

| Header | Value |
|--------|-------|
| `x-ss-key-id` | `current` or `next` (selects which secret verifies; enables rotation) |
| `x-ss-timestamp` | Unix seconds, integer |
| `x-ss-signature` | `hex(HMAC_SHA256(secret, canonical))` |
| `content-type` | `application/json` (POST) |

`path_with_sorted_query` is the **full request path as the Hub receives it** (including `/api/webhooks/stackshift-support/v1`) with query parameters sorted by key and URL-encoded; the outbound direction signs the receiver's path the same way.

`canonical = timestamp + "\n" + METHOD + "\n" + path_with_sorted_query + "\n" + hex(SHA256(raw_body))` (empty body → SHA-256 of the empty string).

Rules (Hub verification order):
1. `STACKSHIFT_SUPPORT_SECRET` unset → **503** `not_configured` (fail closed, same as the order webhook).
2. `|now − timestamp| > 300 s` → **401** `stale_timestamp`.
3. Signature compared with `timingSafeEqual` against the secret chosen by `x-ss-key-id` (`STACKSHIFT_SUPPORT_SECRET` / `STACKSHIFT_SUPPORT_SECRET_NEXT`) → mismatch **401** `bad_signature`.
4. Replay: writes carry an `idempotencyKey` (§3); identical key + identical body returns the original result, never re-executes.
5. Body size limit 256 KB (files never travel in the body) → **413** `payload_too_large`.
6. Per-site rate limit **120 req/min** → **429** `rate_limited` + `Retry-After`.
7. Site authorization on every ticket-scoped call: the ticket's `stackshift_site` must equal the request's `actor.site` → else **403** `site_forbidden`.

Outbound (Hub → StackShift) uses the identical scheme with `STACKSHIFT_EVENTS_SECRET` and the StackShift endpoint `STACKSHIFT_EVENTS_URL`.

Rotation: provision `next`, switch the StackShift signer to `x-ss-key-id: next`, promote `next` → `current`, clear `next`. Both verify during the window.

## 2. Common shapes

```jsonc
// actor — present on every write; covered by the signature
{ "site": "mcgregor-wealth-mnc1", "userRef": "usr_123", "email": "celena@example.com", "name": "Celena Cavala" }
```
- `ticketRef` = StackShift's own ticket id (string ≤ 200). `hubTicketId` = Hub UUID. Either identifies a ticket in a path; `ticketRef` is preferred.
- Timestamps ISO-8601 UTC. HTML bodies are untrusted: the Hub sanitizes on render (DOMPurify) and stores `contentType: text/html`.
- Error body: `{ "error": "<code>", "message": "<human>", "details"?: {...} }`.

| Status | `error` | When |
|--------|---------|------|
| 400 | `invalid_payload` | zod validation failure (`details` = flattened issues) |
| 401 | `bad_signature` / `stale_timestamp` / `unknown_key` | auth |
| 403 | `site_forbidden` | ticket belongs to another site |
| 404 | `ticket_not_found` | unknown `ticketRef` |
| 409 | `idempotency_conflict` | same key, different body |
| 413 | `payload_too_large` | > 256 KB body or file over limit |
| 422 | `unsupported_file_type` | MIME not in the attachment allowlist |
| 429 | `rate_limited` | per-site limit |
| 503 | `not_configured` | secret unset / feature disabled |

## 3. Inbound (StackShift → Hub)

### POST `/tickets` — create
```jsonc
{
  "idempotencyKey": "ss-ticket-<uuid>",          // required, ≤200; same key+body => 200 deduped
  "ticketRef": "ss_tkt_8841",                    // required, unique per ticket
  "deskTicketId": "300063000091571001",          // optional during dual-write; REQUIRED for correlation
  "deskTicketNumber": "21466",                   // optional
  "actor": { "site": "...", "userRef": "...", "email": "...", "name": "..." },
  "subject": "Website Orders – Populate overcredit_release …",   // 1..500
  "bodyHtml": "<p>…</p>",                        // 1..100000
  "priority": "low|normal|high|urgent",          // default normal
  "createdAt": "2026-10-02T15:58:11Z",           // optional; clamped to now if in the future
  "suppressCustomerNotifications": true,         // default true during overlap
  "attachments": []                              // optional; see §4 (register after upload)
}
```
`201`: `{ "ok": true, "hubTicketId": "<uuid>", "ticketNumber": 21102, "displayId": "…", "dueAt": "…", "status": "open", "duplicateOf": { "inboxId": "…", "ticketNumber": 21088 } | null }`.
Replay of the same key/body: `200` same payload + `"deduped": true`. Behaviour: inserts `inbox` (`channel='stackshift'`, `external_ref`, `stackshift_site`, `desk_ticket_id`) + first `inbox_messages` row (`author_type='client'`, `visibility='public'`); resolves customer via `contacts.email`; never writes `inbox.external_id`; sets `duplicateOf` when a Desk row with `external_id = deskTicketId` exists.

### POST `/tickets/{ticketRef}/comments` — customer comment
```jsonc
{ "idempotencyKey": "ss-cmt-<uuid>", "commentRef": "ss_cmt_551", "actor": {…}, "bodyHtml": "<p>…</p>", "createdAt": "…", "attachments": [] }
```
`201`: `{ "ok": true, "messageId": "<uuid>" }` (upsert on `inbox_messages.external_ref = commentRef`). Reopens a closed ticket (same rule as the email poll). Only customer comments are accepted inbound; staff replies originate in the Hub.

### POST `/tickets/{ticketRef}/status` — resolve / reopen by the customer
`{ "idempotencyKey": "…", "actor": {…}, "status": "closed|open" }` → `200 { "ok": true, "status": "closed" }`. A customer may only move `open ⇄ closed`.

## 4. Attachments (browser/server-direct to Storage; never through the handler)
1. `POST /uploads/sign` — `{ "actor": {…}, "ticketRef": "…", "files": [{ "filename": "a.png", "contentType": "image/png", "size": 123456 }] }` (≤10 files, ≤25 MB each, MIME allowlist = the Hub's task attachment types) → `200 { "uploads": [{ "uploadUrl": "<signed PUT>", "path": "stackshift-support/<ticket>/<ts>_<rand>_a.png", "expiresInSeconds": 900 }] }`. Mirrors `/api/webhooks/stackshift-order/uploads`.
2. StackShift `PUT`s bytes to `uploadUrl`.
3. Register by listing `{ "path", "filename", "contentType", "size" }` in the `attachments` array of create/comment. The Hub verifies each object exists and its leading bytes match the MIME (`verifyUploadedObject`) before inserting the `attachments` row; failure → `400 invalid_payload` with the offending path.

## 5. Reads (StackShift → Hub), for the Support Center UI
Signed GETs. Identity travels in the query string — `site` (required) and optional `userRef` — which is part of `path_with_sorted_query` and therefore covered by the signature; there is no body.

- `GET /tickets?site=<site>&status=open|closed|all&cursor=<opaque>&limit=1..50` → `{ "tickets": [{ "ticketRef", "hubTicketId", "ticketNumber", "subject", "status", "priority", "dueAt", "createdAt", "updatedAt", "lastMessageAt", "messageCount" }], "nextCursor": "…" | null }`. Scoped to `stackshift_site = site`; an optional `userRef` narrows to one requester.
- `GET /tickets/{ticketRef}` → ticket fields above + `messages: [{ "messageId", "ref", "authorType": "client|staff", "authorName", "bodyHtml", "createdAt", "attachments": [{ "filename", "size", "contentType", "downloadUrl", "expiresInSeconds" }] }]` + `activity: [{ "at", "type", "summary" }]`.
- **Never returned:** `visibility='internal'` messages/notes, staff emails/ids, `source_meta`, customer view password data, other sites' tickets. `downloadUrl` = Storage signed URL, TTL 15 min.

## 6. Outbound (Hub → StackShift) events
Delivered from the `stackshift_outbox` by a dispatcher; **at-least-once**, ordered per ticket by `sequence`, receiver dedupes by `eventId`.

```jsonc
POST {STACKSHIFT_EVENTS_URL}
{
  "eventId": "evt_<uuid>", "type": "ticket.reply|ticket.status_changed|ticket.assigned|ticket.due_changed",
  "sequence": 14, "occurredAt": "…",
  "ticket": { "ticketRef": "…", "hubTicketId": "…", "ticketNumber": 21102, "status": "open", "site": "…" },
  "data": { /* type-specific */ }
}
```
| `type` | `data` |
|--------|--------|
| `ticket.reply` | `{ "messageId", "bodyHtml", "authorName", "createdAt", "attachments": [{ "filename", "size", "contentType", "downloadUrl" }] }` — public staff replies only |
| `ticket.status_changed` | `{ "from", "to", "resolvedAt"? }` |
| `ticket.assigned` | `{ "assigneeName" }` (display name only) |
| `ticket.due_changed` | `{ "dueAt" }` |

Receiver contract: respond `2xx` within 10 s to acknowledge; any other status/timeout retries. Retry schedule: 1 m, 5 m, 30 m, 2 h, 12 h (≈ 14 h, 5 attempts), then `dead` + Cliq alert; admin can **replay** dead events. Internal notes and non-public messages are never emitted. The Hub also exposes `GET /events?ticketRef=…&afterSequence=…` so StackShift can re-sync a ticket after downtime.

## 7. Audit & observability
Every call writes `stackshift_support_audit` (time, route, key id, site, ticketRef, outcome, status code, latency, IP). Cliq alert when auth failures from one key exceed a threshold or an outbox event goes `dead`. The parity report (design §9) reads this table and `stackshift_outbox`.

## 8. Versioning
Path-versioned (`/v1`). Additive changes (new optional fields/events) stay in v1; consumers ignore unknown fields. Breaking changes ship as `/v2` with both live until the old one is retired.

## 9. Environment (Hub)
`STACKSHIFT_SUPPORT_SECRET`, `STACKSHIFT_SUPPORT_SECRET_NEXT` (optional), `STACKSHIFT_EVENTS_SECRET`, `STACKSHIFT_EVENTS_URL`, `STACKSHIFT_SUPPORT_NOTIFY_CUSTOMER` (default `false` during overlap). All server-only; absent secret ⇒ 503.
