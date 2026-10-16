# StackShift App — Context Prompt for the Hub Support Integration

**Purpose:** paste everything below the line into a Claude Code session opened in the StackShift repo (`webriq-pagebuilder/app`). It is self-contained: that repo has no access to the Hub's docs.
**Source of truth:** `stackshift-hub-support-api-contract.md` (v1). If the contract changes, regenerate this prompt.
**Hub status (updated 2026-10-13, task 452):** all Hub endpoints (tasks 444–448: create/comment/status, uploads/sign, signed reads, `/events` re-sync, outbound event push) are built. The fuller, security-hardened instructions are in `stackshift-app-hub-integration-instructions.md` — prefer it. Run Phase 1 now. Run Phase 2 only once the Hub owner provides a preview URL and throwaway secrets.

---

## Context

You are working in the StackShift app (`webriq-pagebuilder/app`). Its Support Center currently creates and reads customer support tickets through the **Zoho Desk API** (e.g. `web/pages/api/support_desk/*`: create ticket, `list-all-tickets-v2`, get thread, `create-ticket-comment`, attachments, resolve). Every StackShift ticket carries the Desk custom field `cf_stack_shift_site`.

WebriQ Central Hub (a separate Next.js app, the internal ops platform) currently **polls Zoho Desk** to copy those tickets in. Zoho is being decommissioned, so the target flow is:

```
StackShift server ──signed HTTPS──▶ Hub /api/webhooks/stackshift-support/v1/*   (create, comment, attach, resolve, reads)
Hub staff action  ──signed HTTPS (retried)──▶ StackShift events endpoint          (staff reply, status, assignee, due date)
```

The Hub owns the API contract. StackShift adapts to it. If anything in the contract does not fit StackShift's reality, **do not invent a workaround**. Record it as a question for the Hub owner (see "Report back").

### Hard constraints
1. **Do not disable, remove or change the existing StackShift → Zoho Desk flow.** During the overlap StackShift **dual-writes**: Desk first, exactly as today, then the Hub. Desk stops only after a joint parity gate (≥14 days and ≥50 tickets on a pilot site, zero misses) and written sign-off from the Hub owner. That step is not part of this work.
2. Everything Hub-related goes behind a **per-site feature flag**, default **off**. Flag off must restore today's behaviour exactly.
3. **A Hub failure must never fail a customer action.** Log it, queue a retry that reuses the same idempotency key, and continue.
4. Only the StackShift **server** calls the Hub. Secrets never reach the browser, and end users never call the Hub directly.
5. Customer notifications: keep sending whatever StackShift and Desk send today. The Hub suppresses its own emails during the overlap (`suppressCustomerNotifications: true`).

## Hub API contract v1 (summary)

Base: `${HUB_SUPPORT_BASE_URL}/api/webhooks/stackshift-support/v1`. All bodies are JSON (UTF-8), with a 256 KB maximum body size. Files never travel in the body.

### Signing (both directions, every request including GETs)
Headers: `x-ss-key-id` (`current` | `next`), `x-ss-timestamp` (unix seconds), `x-ss-signature`, and `content-type: application/json` on POST.

```
canonical = timestamp + "\n" + METHOD + "\n" + path_with_sorted_query + "\n" + hex(sha256(raw_body))
signature = hex(hmac_sha256(secret, canonical))
```
- `path_with_sorted_query` is the **full path as the Hub receives it**, including `/api/webhooks/stackshift-support/v1`, with query params sorted by key and URL-encoded. An empty body hashes the empty string.
- Sign the **exact bytes** you send. Serialize the JSON once and reuse that string as both the body and the hash input.
- Clock skew must stay within ±300 s, otherwise you get `401 stale_timestamp`.
- Key rotation: the Hub accepts `current` and `next` during a rotation window.

Reference signer:
```ts
import { createHmac, createHash } from "node:crypto";
export function signHubRequest(secret: string, keyId: string, method: string, pathWithSortedQuery: string, rawBody: string) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const canonical = [ts, method.toUpperCase(), pathWithSortedQuery, bodyHash].join("\n");
  const sig = createHmac("sha256", secret).update(canonical).digest("hex");
  return { "x-ss-key-id": keyId, "x-ss-timestamp": ts, "x-ss-signature": sig };
}
```

### Common shapes
- `actor` is required on every write and covered by the signature: `{ "site": "<site slug>", "userRef": "<StackShift user id>", "email": "...", "name": "..." }`. It must be the user StackShift has already authenticated. The Hub does not re-verify end users.
- `ticketRef` is StackShift's own ticket id (≤200 chars) and the preferred path identifier. `hubTicketId` is the Hub UUID.
- Errors look like `{ "error": "<code>", "message": "...", "details"?: {} }`:
  - `400 invalid_payload`
  - `401 bad_signature | stale_timestamp | unknown_key`
  - `403 site_forbidden` (ticket belongs to another site)
  - `404 ticket_not_found`
  - `409 idempotency_conflict`
  - `413 payload_too_large`
  - `422 unsupported_file_type`
  - `429 rate_limited` (+ `Retry-After`; limit is 120 req/min per site)
  - `503 not_configured`

### Inbound writes (StackShift → Hub)
1. **`POST /tickets`** creates a ticket:
   ```jsonc
   { "idempotencyKey": "ss-ticket-<uuid>", "ticketRef": "ss_tkt_8841",
     "deskTicketId": "300063000091571001", "deskTicketNumber": "21466",   // send during dual-write; required for correlation
     "actor": {...}, "subject": "1..500 chars", "bodyHtml": "1..100000 chars",
     "priority": "low|normal|high|urgent", "createdAt": "ISO-8601 UTC",
     "suppressCustomerNotifications": true, "attachments": [] }
   ```
   - `201` returns `{ ok, hubTicketId, ticketNumber, displayId, dueAt, status, duplicateOf }`.
   - Replaying the same key and body returns `200` with the same payload plus `"deduped": true`.
2. **`POST /tickets/{ticketRef}/comments`** adds a customer comment:
   - Body: `{ idempotencyKey, commentRef, actor, bodyHtml, createdAt, attachments: [] }`.
   - Returns `201 { ok, messageId }`.
   - Only customer comments are accepted. A comment reopens a closed ticket.
3. **`POST /tickets/{ticketRef}/status`** resolves or reopens:
   - Body: `{ idempotencyKey, actor, status: "closed" | "open" }`.
   - Returns `200 { ok, status }`.

### Attachments (direct to Storage, never through the handler)
1. **Sign.** Call `POST /uploads/sign` with `{ actor, ticketRef, files: [{ filename, contentType, size }] }`. Limits: ≤10 files, ≤25 MB each, MIME allowlist enforced. It returns `{ uploads: [{ uploadUrl, path, expiresInSeconds: 900 }] }`.
2. **Upload.** `PUT` the bytes to `uploadUrl`.
3. **Register.** Put `{ path, filename, contentType, size }` in the `attachments` array of the create or comment call. The Hub checks each object's leading bytes against its declared MIME type. A mismatch returns `400` with the offending path.

### Reads (for the Support Center UI; used in a later stage, flagged per site)
- `GET /tickets?site=<site>&status=open|closed|all&cursor=<opaque>&limit=1..50[&userRef=]` returns `{ tickets: [{ ticketRef, hubTicketId, ticketNumber, subject, status, priority, dueAt, createdAt, updatedAt, lastMessageAt, messageCount }], nextCursor }`.
- `GET /tickets/{ticketRef}?site=<site>` returns the ticket plus:
  - `messages: [{ messageId, ref, authorType: client|staff, authorName, bodyHtml, createdAt, attachments: [{ filename, size, contentType, downloadUrl, expiresInSeconds }] }]`
  - `activity: [{ at, type, summary }]`
- `downloadUrl` expires after 15 min. Fetch it fresh when rendering and never cache it.
- Internal notes, staff emails/ids and other sites' tickets are never returned.

### Outbound events (Hub → StackShift), which StackShift must receive
- The Hub POSTs to `STACKSHIFT_EVENTS_URL`, an endpoint you build. It uses the same signing scheme with the events secret.
- Payload: `{ eventId, type, sequence, occurredAt, ticket: { ticketRef, hubTicketId, ticketNumber, status, site }, data }`.

| `type` | `data` |
|---|---|
| `ticket.reply` | `{ messageId, bodyHtml, authorName, createdAt, attachments: [{ filename, size, contentType, downloadUrl }] }` (public staff replies only) |
| `ticket.status_changed` | `{ from, to, resolvedAt? }` |
| `ticket.assigned` | `{ assigneeName }` |
| `ticket.due_changed` | `{ dueAt }` |

- Delivery is **at-least-once**, ordered per ticket by `sequence`.
- The receiver must:
  1. Verify the signature.
  2. Dedupe by `eventId`.
  3. Apply events in `sequence` order per ticket, buffering or re-syncing on gaps.
  4. Return `2xx` within 10 s, doing the real work async.
- Retry schedule: 1 m, 5 m, 30 m, 2 h, 12 h. After that the event goes `dead` and the Hub can replay it.
- Re-sync after downtime: `GET /events?ticketRef=…&afterSequence=…`.
- Treat incoming `bodyHtml` as untrusted and sanitize it before rendering.

### Client behaviour rules
- **Idempotency.** Generate one key per logical action and persist it with the retry job, so retries reuse it. `200 deduped` counts as success. `409` means a bug: do not retry, alert instead.
- **Timeouts and retries.** Use a 10 s timeout. Retry only `429`, `5xx` and network errors, with exponential backoff that honors `Retry-After`. Never retry any other `4xx`.
- **Duplicates during the overlap are expected.** The Hub badges them, and StackShift does nothing special.

### Env vars to provision (server-only)
- `HUB_SUPPORT_BASE_URL`
- `HUB_SUPPORT_SECRET`: equals the Hub's `STACKSHIFT_SUPPORT_SECRET`.
- `HUB_SUPPORT_KEY_ID`: `current`.
- `HUB_EVENTS_SECRET`: equals the Hub's `STACKSHIFT_EVENTS_SECRET` (a different value from `HUB_SUPPORT_SECRET`).
- `HUB_EVENTS_SECRET_NEXT`: optional, equals the Hub's `STACKSHIFT_EVENTS_SECRET_NEXT`; only during an events-secret rotation. The receiver accepts `x-ss-key-id: current` (verified with `HUB_EVENTS_SECRET`) and, only when this is set, `next`.
- The events URL the Hub is given must be a plain `https` URL: no credentials, no query string.
- `HUB_DIRECT_ENABLED_SITES`: a comma list, or use the existing flag service.

## Your task

### Phase 1: Discovery and plan (do now)
Read the code. Do not change behaviour. Produce `docs/hub-support-integration-plan.md` (or this repo's equivalent location) with:

1. **Desk call inventory.** List every Zoho Desk API call in the app: file, route, Desk endpoint, payload fields, and the UI screen that triggers it.
2. **Assumption check.** Mark each of these confirmed, wrong or partially right, citing file:line:
   - **A1** Tickets are created via Desk `POST /tickets` with `cf_stack_shift_site` set at creation, and `description` becomes the opening thread.
   - **A2** Replies are Desk **comments**, with customer vs staff distinguished by `commenter.type`.
   - **A3** Ticket-level files are Desk attachments with no thread/comment linkage.
   - **A4** The Support Center lists tickets by site and shows thread, attachments, due date, activity log and a Resolve action.
   - **A5** End-user identity per comment is resolved through an internal datahub API.
   - **A6** The customer-visible ticket number is Desk's (e.g. #21079).
   - **A7** StackShift runs Node server routes that can sign requests and make server-to-server calls.
   - **A8** The create flow gets back the new Desk ticket id synchronously.
3. **Mapping.** Map each Desk-backed screen/action to its Hub endpoint and list field-level gaps. Include: status vocabulary, priority values, how `ticketRef`, `commentRef` and `userRef` are derived, and whether email and name are always available for `actor`.
4. **Implementation plan** in the stages below, naming the files you would add or change:
   - **Stage 1, dual-write.** Hub client module: signer, typed calls, timeout and retry. A durable retry queue (say where it lives given this runtime: DB table vs job runner). Dual-write hooks after the Desk create, comment and resolve calls, flag-gated per site.
   - **Stage 2, event receiver.** Signature verify, `eventId` dedupe store, per-ticket sequence handling, rendering Hub staff replies and status in the Support Center thread.
   - **Stage 3, attachments.** Sign, then PUT, then register on create/comment. Render Hub attachments via fresh `downloadUrl`s.
   - **Stage 4, reads.** List and detail screens read from the Hub for flagged sites, mapped onto the existing UI model. Flag off falls back to Desk reads.
   - **Ticket numbers.** Show Hub `ticketNumber` vs Desk numbers, and explain how pre-cutover tickets display.
5. **Test plan.** Unit tests for the signer, using the canonical-string vector below. Then a run against a Hub preview with a throwaway secret and a test site slug covering:
   - create, plus replay (`deduped`), plus same key with a different body (`409`)
   - comment
   - attachment round trip
   - resolve and reopen
   - wrong site (`403`)
   - stale timestamp (`401`)
   - `429` backoff
   - each event type, including duplicate delivery and out-of-order `sequence`
6. **Open questions for the Hub owner.** Anything in the contract that doesn't fit.

**Stop after Phase 1 and present the plan for approval.**

### Phase 2: Implementation (only after the plan is approved AND the Hub owner provides a preview `HUB_SUPPORT_BASE_URL` + throwaway secrets)
Implement stages 1–3 behind the per-site flag, default off. Implement stage 4 only when the Hub confirms its read endpoints are live. Never point tests at production Hub data.

### Signer test vector (shell; check that your Node signer produces the same signature)
```bash
BODY='{"idempotencyKey":"test-1","ticketRef":"test_tkt_1","actor":{"site":"test-site","userRef":"u1","email":"t@example.com","name":"Test"},"subject":"Harness test","bodyHtml":"<p>hi</p>"}'
P=/api/webhooks/stackshift-support/v1/tickets
TS=$(date +%s)
BH=$(printf '%s' "$BODY" | openssl dgst -sha256 -hex | sed 's/^.* //')
SIG=$(printf '%s\n%s\n%s\n%s' "$TS" POST "$P" "$BH" | openssl dgst -sha256 -hmac "$HUB_SUPPORT_SECRET" -hex | sed 's/^.* //')
curl -i -X POST "$HUB_SUPPORT_BASE_URL$P" -H 'content-type: application/json' \
  -H "x-ss-key-id: current" -H "x-ss-timestamp: $TS" -H "x-ss-signature: $SIG" --data "$BODY"
```

## Out of scope
- Turning off Zoho Desk, its helpdesk@ email channel, or the Hub's Desk polls. The Hub team does these after the parity gate.
- Any change to Hub code.

## Report back to the Hub owner (end of Phase 1)
- A1–A8 results.
- How `userRef` is derived, and whether email and name are reliable.
- Whether the Support Center can show Hub ticket numbers.
- Where the retry queue will live.
- The URL your events receiver will expose (this becomes the Hub's `STACKSHIFT_EVENTS_URL`).
- Every contract mismatch, with a proposed change.
