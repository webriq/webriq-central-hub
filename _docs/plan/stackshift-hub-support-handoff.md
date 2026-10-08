# StackShift Project Hand-off — Support Center → Hub (task 442)

**Audience:** the future StackShift app project (`webriq-pagebuilder/app`). **Hub side owns the contract:** `stackshift-hub-support-api-contract.md`. Rationale and rollout: `stackshift-hub-direct-support-design.md`. Nothing here may disable or alter the existing StackShift → Zoho Desk flow until the parity gate passes and the Hub owner signs off.

## 1. What StackShift must implement

1. **Signer** — sign every Hub call (create, comment, status, uploads/sign, reads). Reference implementation (Node):
```ts
import { createHmac, createHash } from "node:crypto";
export function signHubRequest(secret: string, method: string, pathWithSortedQuery: string, rawBody: string) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const bodyHash = createHash("sha256").update(rawBody).digest("hex");
  const canonical = [ts, method.toUpperCase(), pathWithSortedQuery, bodyHash].join("\n");
  const sig = createHmac("sha256", secret).update(canonical).digest("hex");
  return { "x-ss-key-id": "current", "x-ss-timestamp": ts, "x-ss-signature": sig };
}
```
Sign the **exact bytes** you send. Query params sorted by key, URL-encoded.
2. **Dual-write (overlap)** behind a **per-site feature flag** (default off): after the Desk ticket is created, call Hub `POST /tickets` with the Desk id (`deskTicketId`). Hub failure must **never** fail the customer's ticket creation: log, queue for retry with the **same idempotency key**, move on. Same for comments and resolve.
3. **Event receiver** — an endpoint that verifies the Hub's signature (same scheme, `STACKSHIFT_EVENTS_SECRET`), dedupes by `eventId`, applies events in `sequence` order per ticket, returns `2xx` quickly (do work async), and renders Hub staff replies/status in the Support Center thread.
4. **Reads from the Hub** (stage 4, flagged per site): list and ticket-detail screens call `GET /tickets` and `GET /tickets/{ticketRef}`; map to the existing UI model.
5. **Attachments:** `POST /uploads/sign` → PUT bytes to the signed URL → reference `path` in create/comment. Display Hub attachments via the short-lived `downloadUrl` (fetch fresh when rendering).

## 2. Support Center screen → Desk call → Hub endpoint (to validate in the StackShift repo)

| Screen / action | Today (Desk) — assumption | Hub endpoint |
|-----------------|---------------------------|--------------|
| Create ticket | Desk `POST /tickets` (cf site set) | `POST /tickets` |
| Ticket list for site | `list-all-tickets-v2.ts` (search by site cf) | `GET /tickets?site=` |
| Ticket detail + thread | Desk ticket + threads + comments | `GET /tickets/{ticketRef}` |
| Add comment | `create-ticket-comment.ts` | `POST /tickets/{ticketRef}/comments` |
| Upload file | Desk ticket attachment | `POST /uploads/sign` + `attachments[]` |
| Resolve / reopen | Desk status update | `POST /tickets/{ticketRef}/status` |
| Activity log | Desk history | `activity[]` in `GET /tickets/{ticketRef}` |
| Due date | Desk `dueDate` | `dueAt` (Hub computes from priority) |
| Customer number (#21079) | Desk number | `ticketNumber` (Hub serial) — decision D4/numbering to confirm |

## 3. Secrets / env to provision in StackShift
`HUB_SUPPORT_BASE_URL`, `HUB_SUPPORT_SECRET` (= Hub `STACKSHIFT_SUPPORT_SECRET`), `HUB_SUPPORT_KEY_ID` (`current`), `HUB_EVENTS_SECRET` (= Hub `STACKSHIFT_EVENTS_SECRET`), `HUB_DIRECT_ENABLED_SITES` (comma list or flag service). Never expose any to the browser.

## 4. Behavioural rules
- **Idempotency:** generate one key per logical action and persist it with the retry job; retries reuse it. `200 deduped` is success. `409` means a bug (same key, different body) — do not retry, alert.
- **Timeouts/retries:** 10 s timeout; retry `429/5xx/network` with exponential backoff (honor `Retry-After`); never retry `4xx` other than 429.
- **Clock:** server clock within ±5 min (NTP) or requests are rejected `stale_timestamp`.
- **Identity:** `actor` must be the authenticated user the Support Center already trusts; the Hub does not re-verify end users.
- **Customer notifications:** keep sending whatever StackShift/Desk sends today; the Hub suppresses its own during the overlap (`suppressCustomerNotifications: true`).
- **Duplicates are expected** during the overlap (the Hub holds a Desk-polled copy and a direct copy); the Hub badges them — StackShift does nothing special.

## 5. Verifying your side without touching production data
Use the Hub's **test harness** (documented in the design doc §10): a signed-request script and a mock outbound receiver. Pointing StackShift at a Hub **preview/staging** deployment with a throwaway secret and a test site slug exercises every endpoint. Minimum checks: create (+ replay), comment, attachment round trip, resolve/reopen, wrong-site 403, stale timestamp 401, 429 backoff, receiving each event type incl. duplicate delivery and out-of-order sequence.

### Signed `curl` example (shell, for the harness and manual checks)
```bash
BODY='{"idempotencyKey":"test-1","ticketRef":"test_tkt_1","actor":{"site":"test-site","userRef":"u1","email":"t@example.com","name":"Test"},"subject":"Harness test","bodyHtml":"<p>hi</p>"}'
P=/api/webhooks/stackshift-support/v1/tickets
TS=$(date +%s)
BH=$(printf '%s' "$BODY" | openssl dgst -sha256 -hex | sed 's/^.* //')
SIG=$(printf '%s\n%s\n%s\n%s' "$TS" POST "$P" "$BH" | openssl dgst -sha256 -hmac "$HUB_SUPPORT_SECRET" -hex | sed 's/^.* //')
curl -i -X POST "$HUB_SUPPORT_BASE_URL$P" -H 'content-type: application/json' \
  -H "x-ss-key-id: current" -H "x-ss-timestamp: $TS" -H "x-ss-signature: $SIG" --data "$BODY"
```
Replay the identical command ⇒ `200` with `"deduped": true`; change `subject` but keep `idempotencyKey` ⇒ `409`; set `TS` 10 minutes old ⇒ `401 stale_timestamp`. Use only a throwaway secret and test site slug against preview/staging, never production data.

## 6. Parity-gate checklist (run together with the Hub owner)
- [ ] Dual-write enabled on a pilot site for ≥14 days / ≥50 tickets with **zero** Hub-side creates failing permanently.
- [ ] Hub parity report: every ticket has a direct row (matched by `deskTicketId`); message counts and bodies/timestamps match the Desk copy; attachment counts match; status/resolved match.
- [ ] No `dead` outbox events outstanding; receiver verified in production traffic.
- [ ] Support Center reads from the Hub match what Desk shows for the pilot site (screenshot comparison of list + 5 random threads).
- [ ] Rollback rehearsed: flag off ⇒ Support Center returns to Desk reads/writes with no data loss.
- [ ] Written sign-off from the Hub owner. **Only then** may Desk writes stop (rollout stage 5).

## 7. Out of scope for the StackShift project
Turning off Zoho Desk, its email channel for helpdesk@, or the Hub's Desk polls — those are Hub-side stages 5–6, executed by the Hub team only after the gate.

## 8. Open items the StackShift project must answer
- Confirm assumptions A1–A8 in the design doc against the real code.
- How StackShift derives `userRef` (datahub identity) and whether it can send email/name reliably.
- Whether the Support Center can show Hub ticket numbers instead of Desk numbers (and how old Desk numbers are displayed for pre-cutover tickets).
- Where the dual-write retry queue lives (DB table vs job runner) given StackShift's runtime.
