# StackShift App ↔ Hub Support Integration — Implementation Instructions

**Audience:** the StackShift app project (`webriq-pagebuilder/app`). Self-contained: paste into a Claude Code session opened in that repo; it cannot read the Hub's docs.
**Derived from:** Hub task 452 (section 3) and contract v1 (`stackshift-hub-support-api-contract.md`). **Hub status (2026-10-13):** all Hub endpoints (create, comment, status, uploads/sign, signed reads, `/events` re-sync, outbound event push) are built. Test against Hub **staging** only, with throwaway secrets and a test site slug supplied by the Hub owner.

## 0. Hard constraints

1. **Do not disable, remove or change the existing StackShift → Zoho Desk flow.** During the overlap StackShift **dual-writes**: Desk first, exactly as today, then the Hub. Desk stops only after a joint parity gate (≥14 days and ≥50 tickets on a pilot site, zero misses) and written sign-off from the Hub owner. Not part of this work.
2. Everything Hub-related is behind a **per-site feature flag, default off**. Flag off must reproduce today's behaviour exactly.
3. **A Hub failure must never fail a customer action.** Log, queue a retry reusing the same idempotency key and byte-identical body, continue.
4. Only the StackShift **server** calls the Hub. Secrets never reach the browser; end users never call the Hub.
5. Customer notifications: keep sending exactly what StackShift/Desk send today. The Hub suppresses its own (`suppressCustomerNotifications: true`).
6. If the contract does not fit StackShift's reality, **do not invent a workaround** — record it as a question for the Hub owner (section 7).

## 1. Trust model — three connections

```
(A) SENDER   StackShift server ──HMAC-signed HTTPS──▶ Hub inbound + read endpoints   secret: HUB_SUPPORT_SECRET
(B) RECEIVER Hub ──HMAC-signed HTTPS (retried)──▶ StackShift events endpoint         secret: HUB_EVENTS_SECRET
(C) FILES    StackShift ──PUT (signed URL)──▶ Hub's Supabase Storage;  Hub signed GET URL ──▶ StackShift/browser
```
- **Two different secrets, one per direction.** A leak of one must not allow forging the other. Never reuse any other secret (order-form webhook, Desk/Zoho credentials).
- Authority = shared secret + signature over method, path, query and the exact body bytes. The Hub trusts `actor.site` exactly as far as it trusts the StackShift server that signs it — hence S8/S9.

## 2. Environment variables (StackShift)

All **server-only**. Never `NEXT_PUBLIC_`, never in client bundles or `next.config` env, never logged. Different values per environment (production / preview / local); preview and local use throwaway values and the Hub **staging** URL only.

| Var | Value / source | Required | Notes |
|-----|----------------|----------|-------|
| `HUB_SUPPORT_BASE_URL` | Hub origin, e.g. `https://hub.webriq.com` (no trailing slash/path) | yes | Must be `https:` (only exception: `http://localhost` in local dev). Validate at boot; refuse to build the Hub client otherwise. |
| `HUB_SUPPORT_SECRET` | = Hub `STACKSHIFT_SUPPORT_SECRET` | yes | `openssl rand -hex 32` (≥256 bit). Signs every request to the Hub. |
| `HUB_SUPPORT_SECRET_NEXT` | = Hub `STACKSHIFT_SUPPORT_SECRET_NEXT` | no | Rotation only (S13). |
| `HUB_SUPPORT_KEY_ID` | `current` (default) or `next` | no | Which key signs. |
| `HUB_EVENTS_SECRET` | = Hub `STACKSHIFT_EVENTS_SECRET` | yes | **Different value** from `HUB_SUPPORT_SECRET`. Verifies events from the Hub (`x-ss-key-id: current`). |
| `HUB_EVENTS_SECRET_NEXT` | = Hub `STACKSHIFT_EVENTS_SECRET_NEXT` | no | Events-secret rotation only (S13). The receiver accepts `x-ss-key-id: next` only while this is set. |
| `HUB_DIRECT_ENABLED_SITES` | comma list of site slugs; empty = off | yes (default empty) | Per-site **write** flag. Exact, case-sensitive slug match. |
| `HUB_READS_ENABLED_SITES` | comma list; empty = off | no | Per-site **read** flag (stage 4); subset of the above. |
| `HUB_REQUEST_TIMEOUT_MS` | `10000` | no | Hard timeout per Hub call. |
| `HUB_RETRY_MAX_ATTEMPTS` | `8` | no | Dual-write job cap before parked `dead` + alerted. |

**Hub-side counterparts** (set by the Hub operator; listed so both sides match): `STACKSHIFT_SUPPORT_SECRET`, `STACKSHIFT_SUPPORT_SECRET_NEXT`, `STACKSHIFT_EVENTS_SECRET`, `STACKSHIFT_EVENTS_SECRET_NEXT` + `STACKSHIFT_EVENTS_KEY_ID` (rotation), and `STACKSHIFT_EVENTS_URL` = **your receiver URL — https, exact path, no query, no credentials**. The Hub **refuses to deliver** (events stay pending) if the URL is not plain https (http allowed only for localhost outside production), embeds credentials, or carries a query/fragment. Give the Hub owner the final receiver URL once D6 is deployed.

Secret hygiene: CSPRNG-generated per environment; stored only in the host secret store; exchanged between teams through the secret manager's sharing feature — **not** chat, email, tickets or git. Rotate on suspected exposure, staff offboarding, and at least yearly.

## 3. Hub API contract v1 (what you call)

Base: `${HUB_SUPPORT_BASE_URL}/api/webhooks/stackshift-support/v1`. JSON UTF-8, max body **256 KB** (files never travel in the body).

### Signing (every request, including GETs; same scheme in both directions)
Headers: `x-ss-key-id` (`current`|`next`), `x-ss-timestamp` (unix seconds), `x-ss-signature`, plus `content-type: application/json` on POST.
```
canonical = timestamp + "\n" + METHOD + "\n" + canonicalPath(path_with_query) + "\n" + hex(sha256(raw_body))
signature = hex(hmac_sha256(secret, canonical))
```
`path_with_query` = full path as the Hub receives it (including `/api/webhooks/stackshift-support/v1`). Empty body hashes the empty string. Skew must stay within ±300 s. Sign the exact bytes you send. `canonicalPath` is in Appendix B — copy it verbatim.

### Common shapes
- `actor` on every write (inside the signed body): `{ site, userRef, email, name? }` — strict object, no extra fields (unknown fields ⇒ `400`).
- `ticketRef` = StackShift's own ticket id (≤200 chars), the preferred path identifier. `hubTicketId` = Hub UUID.
- Errors: `{ "error": "<code>", "message": "…", "details"? }` — `400 invalid_payload`, `401 bad_signature|stale_timestamp|unknown_key`, `403 site_forbidden` (writes: ticket belongs to another site), `404 ticket_not_found` (reads also return 404 for another site's ticket), `409 idempotency_conflict`, `413 payload_too_large`, `422 unsupported_file_type`, `429 rate_limited` (+`Retry-After`; 120 req/min/site), `503 not_configured`.

### Writes
- **`POST /tickets`** — `{ idempotencyKey, ticketRef, deskTicketId?, deskTicketNumber?, actor, subject (1..500), bodyHtml (1..100000), priority: low|normal|high|urgent, createdAt?, suppressCustomerNotifications (default true), attachments? }`. `201 { ok, hubTicketId, ticketNumber, displayId, dueAt, status, duplicateOf }`. Same key + same body ⇒ `200` + `deduped: true`. A retry with a *new* key but the same site + `ticketRef` + subject also returns `200 deduped` (lost-response case). **Send `deskTicketId` during dual-write — required for correlation/parity.**
- **`POST /tickets/{ticketRef}/comments`** — `{ idempotencyKey, commentRef, actor, bodyHtml, createdAt?, attachments? }` ⇒ `201 { ok, messageId }`. Customer comments only; reopens a closed ticket.
- **`POST /tickets/{ticketRef}/status`** — `{ idempotencyKey, actor, status: "closed"|"open" }` ⇒ `200 { ok, status }`.
- Idempotency: same key + different body (or different route) ⇒ `409` = client bug, never retry.

### Attachments (bytes go straight to Storage)
1. `POST /uploads/sign` — `{ actor, ticketRef, files: [{ filename, contentType, size }] }` (≤10 files, ≤25 MB each, MIME allowlist) ⇒ `{ uploads: [{ uploadUrl, path, expiresInSeconds: 900 }] }`. `path` is opaque — echo it back unchanged.
2. `PUT` bytes to `uploadUrl` (declared `content-type`).
3. Register by listing `{ path, filename, contentType, size }` in `attachments[]` of create/comment. The Hub checks the object exists and its leading bytes match the MIME; failure ⇒ `400` with `details.path`, and **nothing is created**. A path is registrable once, only for the site + ticketRef it was minted for.

### Reads (signed GETs; identity in the query string, covered by the signature; empty body)
- `GET /tickets?site=&status=open|on_hold|escalated|closed|all&userRef=&cursor=&limit=1..50` ⇒ `{ tickets: [{ ticketRef, hubTicketId, ticketNumber, subject, status, priority, dueAt, createdAt, updatedAt, lastMessageAt, messageCount }], nextCursor }` (newest first; `cursor` is opaque).
- `GET /tickets/{ticketRef}?site=` ⇒ ticket + `messages: [{ messageId, ref, authorType: client|staff, authorName, bodyHtml, createdAt, attachments: [{ filename, size, contentType, downloadUrl, expiresInSeconds }] }]` + `activity: [{ at, type, summary }]`.
- Direct tickets only (those created through this API). `downloadUrl` lives 15 min — fetch fresh at render, never cache. Internal notes, staff emails/ids and other sites' tickets are never returned.
- **Authorization is by `site` only** (see S9): `userRef` narrows the list but is not enforced on detail/comment/status.

### Events re-sync (signed GET)
`GET /events?site=&afterSequence=&limit=1..100[&ticketRef=]` ⇒ `{ events: [envelope…], nextSequence }` — same redacted envelope as the push. `sequence` is global; gaps are normal. Follow `nextSequence` until `null`.

### Outbound events (Hub → your receiver)
```jsonc
POST {STACKSHIFT_EVENTS_URL}
{ "eventId": "evt_<uuid>", "type": "ticket.reply|ticket.status_changed|ticket.assigned|ticket.due_changed",
  "sequence": 14, "occurredAt": "…",
  "ticket": { "ticketRef", "hubTicketId", "ticketNumber", "status", "site" }, "data": { … } }
```
| `type` | `data` |
|--------|--------|
| `ticket.reply` | `{ messageId, bodyHtml, authorName, createdAt, attachments: [{ filename, size, contentType, downloadUrl, expiresInSeconds }] }` — public staff replies only |
| `ticket.status_changed` | `{ from, to, resolvedAt? }` |
| `ticket.assigned` / `ticket.due_changed` | `{ assigneeName }` / `{ dueAt }` — defined, not emitted yet; ignore gracefully |

At-least-once, ordered per ticket by `sequence`. Reply `2xx` within **10 s** or the Hub retries (1 m, 5 m, 30 m, 2 h, 12 h, then `dead` until an admin replays it). A replayed event keeps its original `sequence` and can arrive late. Each attempt carries a fresh timestamp.

## 4. Deliverables

| # | Deliverable | Detail |
|---|-------------|--------|
| **D1** | `hubClient` module (server-only) | Owns env validation (fail closed if base URL not https / secret missing), `canonicalPath()` (**Appendix B verbatim**), `signHubRequest()`, one `hubFetch()` with `redirect: "error"`, `AbortSignal.timeout(HUB_REQUEST_TIMEOUT_MS)`, `cache: "no-store"`, mapping to the contract error codes. Add `import "server-only"` (or equivalent) so a client import fails the build. |
| **D2** | Signer unit tests | Assert Appendix A vectors exactly (POST + GET); query-order independence; space/unicode encoding; empty-body hash. |
| **D3** | Dual-write: create / comment / resolve-reopen | After the Desk write succeeds, call the Hub. Behind `HUB_DIRECT_ENABLED_SITES`. Send `deskTicketId` + `deskTicketNumber` on create. `actor` built server-side from the authenticated session (S8). `suppressCustomerNotifications: true`. |
| **D4** | Durable retry queue | Table `hub_dualwrite_jobs`: `id, kind, route, idempotency_key, request_body (exact JSON string), attempts, next_attempt_at, status (pending/done/dead), last_error`. Key and **serialized body** are generated once at job creation and re-sent byte-identical on every retry (re-serializing with a reused key ⇒ `409`). Exponential backoff + jitter, honour `Retry-After`; retry only network/`429`/`5xx`; other `4xx` ⇒ `dead` + alert; `200 deduped` = success; `409` = bug ⇒ alert, no retry. |
| **D5** | Attachment flow | Authorize user + ticket → `uploads/sign` → `PUT` with the declared content-type → pass returned `path` unchanged in `attachments[]`. Pre-validate type/size locally for fast UX; the Hub is authoritative. Prefer browser-direct PUT to the signed URL (avoids StackShift's own body cap); URL is single-object, 15 min, never persisted. |
| **D6** | Events receiver (`POST /api/hub/events`, Node runtime, **not Edge**) | Spec in section 6. This URL goes to the Hub owner for `STACKSHIFT_EVENTS_URL`. |
| **D7** | Event store + renderers | `hub_events_seen(event_id pk, received_at)`; per-ticket `last_status_sequence`; staff replies inserted by `messageId` (unique), ordered by `createdAt`; Support Center thread shows Hub staff replies and status. HTML sanitized on render (S10). |
| **D8** | Re-sync job | Per flagged site every ~15 min and on boot after downtime: `GET /events?site=&afterSequence=<cursor>&limit=100`, follow `nextSequence`, feed through the **same** pipeline as D6 (dedupe makes it safe), persist cursor per site. |
| **D9** | Reads adapter (stage 4, `HUB_READS_ENABLED_SITES`) | `GET /tickets` and `/tickets/{ref}` mapped to the existing UI model; fresh `downloadUrl` at render. Tickets not created via the direct path keep reading from Desk during the overlap. Per-user authorization per S9. Flag off ⇒ Desk reads, no data loss. |
| **D10** | Observability + runbook | Structured logs (eventId, ticketRef, route, status, latency — **no** bodies/headers/secrets); alerts on dead jobs, repeated `401/403`, receiver signature failures; runbook for rotating a secret, disabling a site, re-sync. |

## 5. Security rules (binding; checked at PR review)

**Transport & secrets**
- **S1** HTTPS only, both directions; HSTS on the receiver host. No plaintext fallback, never `NODE_TLS_REJECT_UNAUTHORIZED=0`.
- **S2** Secrets: server-only, ≥256-bit random, distinct per direction and environment, never logged or in error pages/Sentry. Redact `x-ss-signature` / `x-ss-key-id` in any request logging.
- **S3** Compare signatures with `crypto.timingSafeEqual` on equal-length buffers (check 64-hex shape/length first). Never `===`.

**Sender (StackShift → Hub)**
- **S4** Sign the **exact bytes sent**: `const raw = JSON.stringify(body)`; hash `raw`; send `raw`. GET signs the empty body. Path is the full `/api/webhooks/stackshift-support/v1/...`; build queries with `URLSearchParams` and sign `canonicalPath(...)`.
- **S5** `redirect: "error"` on every Hub call (a redirect would forward `x-ss-*` headers elsewhere); 10 s timeout; no proxy that rewrites the host.
- **S6** Fresh timestamp **per attempt**; idempotency key and body stay fixed. Server clock on NTP; alert if skew to the Hub's `Date` header exceeds 60 s.
- **S7** One idempotency key per logical action, generated when the action is accepted and persisted with the retry job. Never derived from mutable data.
- **S8** `actor.site`, `userRef`, `email`, `name` come **only** from the server-side authenticated session/DB — never from the body, query, headers or cookies the browser controls. The `site` in any Hub call must be one the session user belongs to; this is the only thing preventing cross-tenant access, since the Hub trusts the signed `site`.
- **S9** Per-user authorization stays in StackShift. The Hub authorizes by **site only**: before `GET /tickets/{ref}`, `/comments`, `/status` or `uploads/sign`, verify the session user may act on that ticket (they created it, or the Support Center is explicitly site-wide for their role). Pass `userRef` on list calls when the product shows only the user's own tickets. **Confirm with the Hub owner whether the Support Center is per-user or site-wide and record the answer in the PR.**
- **S10** All Hub-provided HTML (`bodyHtml` in events and reads) is untrusted: sanitize with DOMPurify (allowlist), strip `javascript:`/`data:` URLs and event handlers, `rel="noopener noreferrer"` on links. Escape `authorName` and `filename` on render.
- **S11** `downloadUrl`: HTTPS only; if StackShift's server ever fetches one, allowlist the host (the Hub's Supabase storage host) to prevent SSRF; do not persist, log, or put it in a shareable URL. Re-fetch via D9 when rendering.

**Receiver (Hub → StackShift)**
- **S12** Rules in section 6: POST only; raw body (body parsing disabled); size cap; `x-ss-key-id` must be `current`, or `next` only while `HUB_EVENTS_SECRET_NEXT` is set (verify with the matching secret); verify over the path+query as received; reject `|now − ts| > 300 s`; dedupe by `eventId`; no work before verification; generic errors (never echo expected signatures or canonical strings); never log raw payloads.
- **S13** Rotation without downtime: ① Hub operator adds the `…_NEXT` secret; ② StackShift deploys `HUB_SUPPORT_SECRET_NEXT` and flips `HUB_SUPPORT_KEY_ID=next`; ③ Hub promotes next→current, clears next; ④ StackShift moves the value into `HUB_SUPPORT_SECRET`, sets `KEY_ID=current`, removes `…_NEXT`. The **events** secret rotates the same way, in the other direction: ① StackShift adds `HUB_EVENTS_SECRET_NEXT` (receiver now accepts both key ids); ② Hub sets `STACKSHIFT_EVENTS_SECRET_NEXT` and `STACKSHIFT_EVENTS_KEY_ID=next` (events now arrive with `x-ss-key-id: next`); ③ Hub moves the value into `STACKSHIFT_EVENTS_SECRET`, sets `KEY_ID=current`, clears `_NEXT`; ④ StackShift moves the value into `HUB_EVENTS_SECRET` and removes `HUB_EVENTS_SECRET_NEXT`.
- **S14** Abuse/availability: honour `429 Retry-After`; cap dual-write concurrency (~4 in flight); circuit-break on repeated `5xx` (pause the queue, keep enqueuing) so a Hub outage never degrades the customer-facing app.

## 6. Events receiver — exact behaviour

Pages Router API route (Node runtime):

```ts
// pages/api/hub/events.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const config = { api: { bodyParser: false } };   // REQUIRED: the signature covers the raw bytes

const MAX_BYTES = 1_000_000;
const SKEW = 300;

async function raw(req: NextApiRequest): Promise<string | null> {
  const chunks: Buffer[] = []; let n = 0;
  for await (const c of req) { n += (c as Buffer).length; if (n > MAX_BYTES) return null; chunks.push(c as Buffer); }
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  if (!process.env.HUB_EVENTS_SECRET) return res.status(503).json({ error: "not_configured" });   // fail closed
  const body = await raw(req);
  if (body === null) return res.status(413).json({ error: "payload_too_large" });

  const ts = String(req.headers["x-ss-timestamp"] ?? "");
  const sig = String(req.headers["x-ss-signature"] ?? "");
  const keyId = req.headers["x-ss-key-id"];
  const secret = keyId === "current" ? process.env.HUB_EVENTS_SECRET : keyId === "next" ? process.env.HUB_EVENTS_SECRET_NEXT : undefined;
  if (!secret) return res.status(401).json({ error: "unknown_key" });
  if (!/^\d+$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > SKEW) return res.status(401).json({ error: "stale_timestamp" });
  if (!/^[0-9a-f]{64}$/i.test(sig)) return res.status(401).json({ error: "bad_signature" });

  const path = canonicalPath(req.url ?? "");                                 // Appendix B — same function as the signer
  const canonical = `${ts}\nPOST\n${path}\n${createHash("sha256").update(body).digest("hex")}`;
  const expected = createHmac("sha256", secret).update(canonical).digest();
  if (!timingSafeEqual(expected, Buffer.from(sig, "hex"))) return res.status(401).json({ error: "bad_signature" });

  // authenticated from here on
  const evt = JSON.parse(body);                 // validate with zod: eventId, type ∈ 4 types, sequence int, ticket{…}, data
  await enqueueForProcessing(evt);              // dedupe by eventId + ordering by sequence happen in the worker (D7)
  return res.status(200).json({ ok: true });    // 2xx well inside the Hub's 10 s timeout
}
```
Worker rules:
1. **Dedupe by `eventId`** (unique constraint on `hub_events_seen`); a conflict means already applied — still reply 2xx.
2. **Order per ticket by `sequence`.** A `ticket.status_changed` older than the held `last_status_sequence` is ignored; `ticket.reply` is additive (insert by `messageId`, order by `createdAt`).
3. **Unknown `ticketRef`, or `ticket.site` ≠ the ticket's site:** drop and alert, but still `2xx` (otherwise the Hub retries a poison event for ~14 h).
4. **Unknown event types / extra fields:** ignore the extras, `2xx` unknown types (v1 additive-change rule).
5. Do not send customer emails from `ticket.reply` during the overlap.
6. The receiver path must be stable with **no query string**. Any proxy/rewrite in front must preserve the path exactly — the Hub signs the path of `STACKSHIFT_EVENTS_URL`; a rewrite changes the canonical string and every event fails `bad_signature`.

## 7. Acceptance criteria

### Security
- [ ] No Hub secret in client bundles, `next.config`, logs, error responses or git history (grep of built `.next/static` for the secret prefix is empty).
- [ ] Hub calls are HTTPS-only; the app refuses to build the Hub client with an `http:` base URL outside local dev.
- [ ] `hubFetch` uses `redirect: "error"` and a timeout — verified by a test against a server that 302s.
- [ ] Signer passes **both** Appendix A vectors byte-for-byte, plus query-order/encoding cases.
- [ ] Receiver: valid event → 200; flipped body byte → 401; wrong secret → 401; `x-ss-key-id: next` → 401 unless `HUB_EVENTS_SECRET_NEXT` is set (then verified with it); timestamp ±301 s → 401; missing/short/non-hex signature → 401 (not 500); body over cap → 413; GET → 405; secret unset → 503; identical event replayed → 200 and **applied once**.
- [ ] `actor.site` is derived server-side; a test proves a user of site A cannot cause a Hub call carrying site B (S8). Per-user authorization (S9) has a test for the chosen behaviour.
- [ ] Hub HTML is sanitized: an event containing `<img src=x onerror=…>` and `<a href="javascript:…">` renders inert.
- [ ] `HUB_SUPPORT_SECRET` ≠ `HUB_EVENTS_SECRET`, and values differ between environments.

### Functional
- [ ] `HUB_DIRECT_ENABLED_SITES` empty ⇒ behaviour and request logs identical to today (zero Hub traffic).
- [ ] Pilot site: create → Desk ticket first, then Hub `201` carrying `deskTicketId`; a Hub `5xx`/timeout/DNS failure does **not** fail the customer action, and the job retries with the same key + identical body and ends `done` (`200 deduped` accepted).
- [ ] Comment and resolve/reopen dual-write the same way; a customer comment on a closed ticket reopens it on the Hub.
- [ ] Attachment round trip works for an allowed type; a `.png` whose bytes aren't a PNG is rejected `400` with no ticket/comment created; a disallowed type gets `422`; >25 MB gets `413`.
- [ ] Receiver applies each event type, including **duplicate delivery** (applied once) and **out-of-order `sequence`** (stale status ignored, reply still inserted).
- [ ] After simulated downtime, the re-sync job recovers every missed event exactly once and advances its cursor.
- [ ] `429` honours `Retry-After`; a wrong-site ref (`403` on writes / `404` on reads) is surfaced as a generic error and not retried.
- [ ] Stage 4: a flagged site renders list + detail from the Hub identical to Desk (screenshot comparison of the list + 5 random threads); flag off returns to Desk with no data loss (rollback rehearsed).
- [ ] Pilot parity: the Hub's parity report passes after ≥14 days and ≥50 tickets with zero dead events and no 5xx (the Hub owner runs and signs this; Desk step-down is not part of this work).

### Verification approach
Use Hub **staging** with throwaway secrets and a test site slug. Minimum checks: create (+ replay), comment, attachment round trip, resolve/reopen, wrong-site 403, stale timestamp 401, 429 backoff, receiving each event type incl. duplicate delivery and out-of-order sequence.

Signed `curl` for manual checks:
```bash
BODY='{"idempotencyKey":"test-1","ticketRef":"test_tkt_1","actor":{"site":"test-site","userRef":"u1","email":"t@example.com","name":"Test"},"subject":"Harness test","bodyHtml":"<p>hi</p>"}'
P=/api/webhooks/stackshift-support/v1/tickets
TS=$(date +%s)
BH=$(printf '%s' "$BODY" | openssl dgst -sha256 -hex | sed 's/^.* //')
SIG=$(printf '%s\n%s\n%s\n%s' "$TS" POST "$P" "$BH" | openssl dgst -sha256 -hmac "$HUB_SUPPORT_SECRET" -hex | sed 's/^.* //')
curl -i -X POST "$HUB_SUPPORT_BASE_URL$P" -H 'content-type: application/json' \
  -H "x-ss-key-id: current" -H "x-ss-timestamp: $TS" -H "x-ss-signature: $SIG" --data "$BODY"
```
Replay ⇒ `200 deduped`; change `subject` with the same key ⇒ `409`; 10-minute-old `TS` ⇒ `401 stale_timestamp`.

## 8. Report back to the Hub owner (open items)

- Confirm the design assumptions against the real StackShift code: tickets created via Desk `POST /tickets` with `cf_stack_shift_site` set at creation; replies are Desk comments; ticket files are Desk attachments; the Support Center lists by site; the Desk ticket id is available right after create.
- **Per-user or site-wide Support Center?** (drives S9).
- How `userRef` is derived (datahub identity) and whether `email`/`name` are reliably available.
- Whether the UI can show Hub ticket numbers instead of Desk numbers, and how pre-cutover Desk numbers display.
- Where the dual-write retry queue lives (DB table vs job runner) given StackShift's runtime.
- The final receiver URL (for the Hub's `STACKSHIFT_EVENTS_URL`) and the site slugs for the pilot.

## Appendix A — Known-answer signature vectors (generated with the Hub's own signer)

Secret `test-secret-do-not-use-0123456789abcdef`, key id `current`, timestamp `1760000000`.

1. **POST** `/api/webhooks/stackshift-support/v1/tickets/ss_1/status`, body (exact bytes) `{"idempotencyKey":"k1","status":"closed"}`
   - body sha256: `5a6dbcf0ddffa61488936bf3ce5662364a9e20e11aa776c8ca92c92f58497062`
   - signature: `10c029d7cd6224a1050f9403ee2e5e9f0a63a7bdf3ef99a07f8085b2b0b6d3e3`
2. **GET** `/api/webhooks/stackshift-support/v1/tickets?status=all&site=a%20b&limit=5` (query deliberately unsorted), empty body
   - canonical string: `"1760000000\nGET\n/api/webhooks/stackshift-support/v1/tickets?limit=5&site=a%20b&status=all\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"`
   - signature: `cdc3c6c7cfb98220f18dd412304c11182f8ae2e425c52dcd2334c2ba490e1e27`

## Appendix B — `canonicalPath` (copy verbatim)

```ts
export function canonicalPath(pathWithQuery: string): string {
  const qIdx = pathWithQuery.indexOf("?");
  if (qIdx === -1) return pathWithQuery;
  const path = pathWithQuery.slice(0, qIdx);
  const pairs = [...new URLSearchParams(pathWithQuery.slice(qIdx + 1))];
  if (pairs.length === 0) return path;
  pairs.sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : av > bv ? 1 : 0) : ak < bk ? -1 : 1));
  return `${path}?${pairs.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")}`;
}
```
