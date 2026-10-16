# 452: StackShift App ↔ Hub Ticket Flow — Audit + StackShift-side Implementation Instructions (env, deliverables, acceptance criteria, security)

**Created:** 2026-10-13
**Priority:** HIGH
**Type:** docs / hand-off (+ small Hub hardening items, section 4)
**Recommended Tier:** deep (security-sensitive, cross-system trust boundary)
**Status:** Hub hardening implemented (H1, H2, H4); H3 deferred; StackShift build (Phase 2) pending in the other repo

> **Model note:** the request asked for Opus. `CLAUDE.md` makes Opus off-limits in this repo ("use `claude-sonnet-4-6` for all deep reasoning"), so this was planned on Sonnet at `deep` tier. The tier is guidance only.

---

## Overview

Tasks 442–450 shipped the Hub half of **StackShift Support → Hub (direct)**: inbound create/comment/status/uploads, signed reads, the outbox + outbound events, the parity gate and the (dark) Desk step-down. The Hub is feature-complete; **nothing on the StackShift side exists yet**. This task:

1. Records the result of a code-level audit of the Hub implementation against the contract (section 2), including gaps found.
2. Gives the StackShift project (`webriq-pagebuilder/app`) a self-contained, ordered set of instructions: **env vars, deliverables, acceptance criteria and a security checklist** for all three trust relationships — the Hub **endpoint**, the StackShift **sender**, and the StackShift **receiver** (section 3).
3. Lists the small Hub-side hardening items the audit surfaced (section 4), and fixes the now-stale `stackshift-app-context-prompt.md` (it still says the Hub endpoints are "not built yet").

Source of truth for the wire format stays `_docs/plan/stackshift-hub-support-api-contract.md` (v1). This doc does not change it; it adds the StackShift-side obligations and the security rules around it.

## Requirements

- [ ] Section 3 (StackShift instructions) is copied/regenerated into `_docs/plan/stackshift-app-context-prompt.md` so the StackShift repo session gets it as one paste (that repo cannot read Hub docs).
- [ ] Stale statements in `stackshift-app-context-prompt.md` / `stackshift-hub-support-handoff.md` corrected (Hub endpoints exist; reads, events, attachments, `/events` re-sync are live; the env names below).
- [ ] Hub hardening items H1–H4 (section 4) are either implemented or explicitly deferred by the user.
- [ ] The known-answer signature vectors (Appendix A) are given to StackShift as fixtures.

## Out of Scope / Must-Not-Change

- **No change to the wire contract v1** (paths, headers, canonical string, error codes). Hardening is additive/internal.
- **The existing StackShift → Zoho Desk flow is never disabled or altered** by this work (contract hard constraint 1, design §1). Desk step-down remains task 450 and stays dark until a site has a non-revoked parity sign-off.
- Hub does not verify end users (design A7/D2): StackShift is a trusted server. This task does not add end-user auth to the Hub.
- Do not apply migrations (convention: written-not-applied). Migrations 169–174 must already be applied by the operator in the target environment before Phase 2 testing; this task does not do it.
- No git commands (CLAUDE.md).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `_docs/plan/stackshift-app-context-prompt.md` | Modify | Replace "Hub endpoints not built yet", add env table, security rules, receiver spec, acceptance criteria from section 3 |
| `_docs/plan/stackshift-hub-support-handoff.md` | Modify | §3 env names → section 3.2 names; add security rules S1–S14 pointer; fix status line |
| `src/lib/stackshift-support/dispatch.ts` | Modify (H1) | Refuse non-`https:` `STACKSHIFT_EVENTS_URL` outside `NODE_ENV !== "production"`; also reject URLs with credentials/query |
| `src/lib/stackshift-support/dispatch.ts`, `src/lib/stackshift-support/auth.ts`, `env.example` | Modify (H2, optional) | `STACKSHIFT_EVENTS_SECRET_NEXT` + outbound `x-ss-key-id` selection so the events secret can rotate without downtime |
| `_docs/task/452-signature-vectors.json` | Create | Appendix A fixtures, machine-readable, for the StackShift test suite |
| `env.example` | Modify | Comment block describing the StackShift-side counterpart names |

## Code Context

### Verified Hub behaviour (audit, 2026-10-13)

| Area | File | Finding |
|------|------|---------|
| Signing | `src/lib/stackshift-support/auth-logic.ts` | HMAC-SHA256 over `ts\nMETHOD\ncanonicalPath\nsha256(rawBody)`; `timingSafeEqual`; ±300 s; signature must be 64 hex chars; `STACKSHIFT_SUPPORT_SECRET` unset → 503 (fail closed); `next` key selected only via `x-ss-key-id: next`. Query is sorted and re-encoded on **both** sides (`canonicalPath`). **Sound.** |
| Pipeline order | `inbound.ts` | raw body → signature → 256 KB → JSON → zod `.strict()` → per-site rate limit → idempotency → write → audit (`after()`). Unauthenticated callers never reach any DB work. **Sound.** |
| Identity | `schema.ts` | `actor.site/userRef/email/name` inside the signed body; all schemas `.strict()`. |
| Site isolation | `inbound.ts` `loadTicketForSite` | write → unknown ref 404, other site's ref **403**; reads (`read-queries.ts`) → **404** for other site's ref (no existence leak). |
| Idempotency | `inbound.ts` + `stackshift_idempotency` | key + route + sha256(rawBody) → stored response; replay = 200 `deduped:true`; mismatch = 409. Table missing → degrades to no dedupe (create falls back to `isSameCreateRetry`). |
| Rate limit | `rate-limit.ts` | 120/min/site, Postgres counter, **fails open** on DB error (availability over strictness). Auth failures carry no site so are not rate-limited (brute-forcing a 256-bit HMAC is infeasible; alerting covers it, `stackshift-alerts` cron: >10 failed auths/key/h). |
| Outbound | `dispatch.ts` | Signs `POST` with `cfg.url.pathname + cfg.url.search`, **fresh timestamp every attempt**, `x-ss-key-id: current` always, `redirect: "manual"` (3xx = failure), 10 s timeout, lease claim, per-ticket ordering, retry 1 m/5 m/30 m/2 h/12 h → `dead`. Payload re-filtered by `redactData()` allowlist at send time. |
| Events re-sync | `v1/events/route.ts` | `GET /events?site=&afterSequence=&limit=1..100[&ticketRef=]`, scoped to `site`; `sequence` is a **global** `bigint identity` → one cursor per site is valid (gaps are normal). |
| Attachments | `attachments.ts` | `uploads/sign` → opaque server-generated path under `stackshift-support/<site>-<hash>/<ref>-<hash>/…`; register verifies path ownership, uniqueness, magic bytes **before any row is written**. Outbound `downloadUrl`s minted fresh (15 min), never stored. |
| Reads | `read-queries.ts` | Allowlist serialisers (never spread a row); internal notes, staff emails/ids, `source_meta` never returned. |
| **Gap G1** | `read-queries.ts` | `GET /tickets/{ref}` and the three write routes authorise by **site only**. `userRef` only narrows the *list*. A signed call for site X can read/comment on/close **any** ticket of site X regardless of `userRef`. This is by design if the Support Center is a site-wide (org-wide) inbox — **StackShift must enforce per-user visibility itself if it is per-user** (rule S9). |
| **Gap G2** | `dispatch.ts` `eventsConfig()` | Accepts `http:` URLs and URLs with embedded credentials/query in production. Secret + payload would travel in clear if mis-set. → H1. |
| **Gap G3** | `dispatch.ts` `postEvent` | Outbound is hard-wired `x-ss-key-id: current`; there is no `STACKSHIFT_EVENTS_SECRET_NEXT`, so the events secret cannot rotate without a coordinated cut-over. → H2 (optional). |
| **Gap G4** | docs | `stackshift-app-context-prompt.md` header says endpoints are not built; handoff §3 env names differ from this doc. → file changes above. |
| Note N1 | `signed-get.ts` | GET signatures carry no nonce; a captured signed GET can be replayed for ≤5 min. Reads are idempotent and `downloadUrl`s are short-lived, so accepted; mitigated by TLS (S1) and never logging URLs/headers (S12). |
| Note N2 | `inbound.ts` | Body is fully read before the 256 KB check; bounded in practice by the platform's ~4.5 MB cap. Accepted. |
| Note N3 | `create-ticket.ts` | `bodyHtml` is stored untrusted; Hub sanitises on render (DOMPurify). The same must hold in the other direction in StackShift (S10). |

## Implementation Steps

1. **Phase 0 — Hub hardening (this repo).** Implement H1 (and H2 if approved). Add `npx tsx` checks beside the existing `_docs/task/*.check.ts` files for the URL guard. Update `env.example` comments.
2. **Phase 1 — Hand-off docs (this repo).** Update `stackshift-app-context-prompt.md` and `stackshift-hub-support-handoff.md` from section 3; generate `452-signature-vectors.json` from Appendix A.
3. **Phase 2 — StackShift build (other repo, per section 3 deliverables D1–D10).** Out of this repo's control; the Hub owner supplies a preview/staging URL, a **throwaway** pair of secrets and a test site slug, and reviews the StackShift PR against section 3.4 and section 5.
4. **Phase 3 — Joint verification** against Hub staging with the Hub harness + mock receiver (section 5), then pilot-site enablement under the parity gate (task 449). Production secrets are generated only at this point.

---

## 3. StackShift App — instructions (paste into the StackShift repo session)

### 3.1 Trust model — three connections, three sets of rules

```
(A) SENDER   StackShift server ──HMAC-signed HTTPS──▶ Hub inbound + read endpoints   secret: HUB_SUPPORT_SECRET
(B) RECEIVER Hub ──HMAC-signed HTTPS (retried)──▶ StackShift events endpoint         secret: HUB_EVENTS_SECRET
(C) FILES    StackShift ──PUT (signed URL)──▶ Hub's Supabase Storage;  Hub signed GET URL ──▶ StackShift/browser
```
- **Two different secrets, two different directions.** A leak of one must not let an attacker forge the other. Never reuse the order-form secret (`STACKSHIFT_ORDER_WEBHOOK_SECRET`) or any Desk/Zoho credential.
- Authority is the shared secret + the signature over method, path, query and exact body bytes. `actor.site` is only as trustworthy as the StackShift server that signs it — hence S8/S9.

### 3.2 Environment variables (StackShift)

All **server-only**. Never prefix with `NEXT_PUBLIC_`, never import in client bundles, never log, never put in `next.config` `env`/`publicRuntimeConfig`. Different values per environment (production / preview / local); preview and local use throwaway values and the Hub **staging** URL only.

| StackShift var | Value / source | Required | Notes |
|----------------|----------------|----------|-------|
| `HUB_SUPPORT_BASE_URL` | Hub origin, e.g. `https://hub.webriq.com` (no trailing slash, no path) | yes | Must be `https:` (the only exception: `http://localhost` in local dev). Validate at boot; refuse to start the Hub client otherwise. |
| `HUB_SUPPORT_SECRET` | = Hub `STACKSHIFT_SUPPORT_SECRET` | yes | `openssl rand -hex 32` (≥ 256 bits). Signs every request to the Hub. |
| `HUB_SUPPORT_SECRET_NEXT` | = Hub `STACKSHIFT_SUPPORT_SECRET_NEXT` | no | Only during rotation (S13). |
| `HUB_SUPPORT_KEY_ID` | `current` (default) or `next` | no | Which key signs. Flip to `next` during rotation step 2. |
| `HUB_EVENTS_SECRET` | = Hub `STACKSHIFT_EVENTS_SECRET` | yes | **Different value** from `HUB_SUPPORT_SECRET`. Verifies events from the Hub. |
| `HUB_DIRECT_ENABLED_SITES` | comma list of site slugs; empty = off for all | yes (default empty) | Per-site **write** dual-write flag. Exact slug match, case-sensitive. Empty/unset ⇒ behaviour identical to today. |
| `HUB_READS_ENABLED_SITES` | comma list; empty = off | no (default empty) | Per-site **read** flag (stage 4); must be a subset of `HUB_DIRECT_ENABLED_SITES`. |
| `HUB_REQUEST_TIMEOUT_MS` | `10000` | no | Hard timeout per Hub call. |
| `HUB_RETRY_MAX_ATTEMPTS` | `8` | no | Dual-write retry job cap before it is parked `dead` + alerted. |

**Hub-side counterparts** (Hub operator sets in Vercel/`.env.local`; listed so both sides match): `STACKSHIFT_SUPPORT_SECRET`, `STACKSHIFT_SUPPORT_SECRET_NEXT`, `STACKSHIFT_EVENTS_SECRET`, `STACKSHIFT_EVENTS_URL` (= StackShift's receiver URL, **https, exact path, no query, no credentials**), `STACKSHIFT_SUPPORT_NOTIFY_CUSTOMER=false` and `STACKSHIFT_SUPPORT_NOTIFY_SITES=` (keep off during the overlap), `CRONJOB_SECRET_KEY` (outbox/alerts cron). Do not touch `STACKSHIFT_DESK_RECONCILE_ENABLED`.

Secret hygiene: generate once per environment with a CSPRNG; store only in the host's secret store (Vercel env / vault); transmit between teams via the secret manager's share feature — **not** chat, email, tickets or git. Rotate on suspicion of exposure, on staff offboarding, and at least yearly.

### 3.3 Deliverables

| # | Deliverable | Detail |
|---|-------------|--------|
| **D1** | `hubClient` module (server-only) | One file owning: env validation (fail closed if `HUB_SUPPORT_BASE_URL` not https / secret missing), `canonicalPath()` (**byte-for-byte the Hub's algorithm**, Appendix B), `signHubRequest()`, a single `hubFetch()` with `redirect: "error"`, `AbortSignal.timeout(HUB_REQUEST_TIMEOUT_MS)`, `cache: "no-store"`, error mapping to the contract's `error` codes. Add `import "server-only"` (or equivalent) so a client import fails the build. |
| **D2** | Signed-request unit tests | Assert Appendix A vectors exactly (POST + GET); query-order independence; unicode/space encoding; empty-body hash; stale/future timestamp helper. |
| **D3** | Dual-write on create / comment / resolve-reopen | After the Desk write succeeds, call Hub `POST /tickets`, `/tickets/{ref}/comments`, `/tickets/{ref}/status`. Behind `HUB_DIRECT_ENABLED_SITES`. Send `deskTicketId` (+ `deskTicketNumber`) on create — required for correlation/parity. `actor` built **server-side from the authenticated session** (S8). `suppressCustomerNotifications: true`. |
| **D4** | Durable retry queue | DB table (or job runner) `hub_dualwrite_jobs`: `id, kind, route, idempotency_key, request_body (exact JSON string), attempts, next_attempt_at, status(pending/done/dead), last_error`. The key and the **serialized body** are generated once at job creation and re-sent byte-identical on every retry (a re-serialized body with a reused key is a `409`). Backoff exponential with jitter, honour `Retry-After`; retry only network/`429`/`5xx`; `4xx` (≠429) ⇒ `dead` + alert; `200 deduped` = success; `409` = bug ⇒ alert, never retry. A Hub failure **never** fails the customer's action. |
| **D5** | Attachment flow | `POST /uploads/sign` (authorise user + ticket first) → `PUT` bytes to `uploadUrl` with the declared `content-type` → pass returned `path` **unchanged** in `attachments[]`. ≤10 files, ≤25 MB each; pre-validate type/size locally to give users fast errors, but the Hub is authoritative. Prefer browser-direct PUT to the signed URL (Vercel body cap); the URL is single-object and 15 min — never persist it. |
| **D6** | Events receiver endpoint (`POST /api/hub/events`, Node runtime, **not Edge**) | Spec in 3.5. Verifies signature on raw bytes, rejects stale, dedupes by `eventId`, orders by `sequence`, `2xx` fast, work async. This URL is what the Hub operator puts in `STACKSHIFT_EVENTS_URL`. |
| **D7** | Event store + renderers | Table `hub_events_seen(event_id pk, received_at)`; per-ticket `last_status_sequence`; staff replies inserted by `messageId` (unique), ordered by `createdAt`; Support Center thread renders Hub staff replies and status. HTML sanitised on render (S10). |
| **D8** | Re-sync job | Scheduled (e.g. every 15 min per flagged site) + run on boot after downtime: `GET /events?site=<s>&afterSequence=<cursor>&limit=100`, follow `nextSequence` until null, feed events through the **same** pipeline as D6 (dedupe makes this safe), persist cursor per site. |
| **D9** | Reads adapter (stage 4, flag `HUB_READS_ENABLED_SITES`) | `GET /tickets`, `GET /tickets/{ref}` mapped to the existing UI model; `downloadUrl` fetched fresh at render, never cached/stored. During the overlap, tickets not created via the direct path still read from Desk. Per-user authorisation per S9. Flag off ⇒ Desk reads, no data loss (rollback rehearsed). |
| **D10** | Observability + runbook | Structured logs (eventId, ticketRef, route, status, latency — **no** bodies/headers/secrets); alert on dead jobs, repeated `401/403`, receiver signature failures; short runbook: rotate a secret, disable a site, replay/re-sync. |

### 3.4 Security rules (binding; reviewed at PR time)

**Transport & secrets**
- **S1** HTTPS only, in both directions. `HUB_SUPPORT_BASE_URL` validated at boot; the events endpoint is served over TLS only (HSTS on the host). No plaintext fallback, no `NODE_TLS_REJECT_UNAUTHORIZED=0`, ever.
- **S2** Secrets are server-only env, ≥ 256-bit random, distinct per direction and per environment, never logged, never in client bundles/error pages/Sentry breadcrumbs. Redact `x-ss-signature` and `x-ss-key-id` in any request logging.
- **S3** Compare signatures with `crypto.timingSafeEqual` on equal-length buffers (check length and 64-hex shape first). Never `===`.

**Sender (StackShift → Hub)**
- **S4** Sign the **exact bytes sent**: serialise once (`const raw = JSON.stringify(body)`), hash `raw`, send `raw`. GET signs the empty body. Build the path as `/api/webhooks/stackshift-support/v1/...` (full path as the Hub receives it) and the query via `URLSearchParams`, signing `canonicalPath(...)`.
- **S5** `redirect: "error"` on every Hub call (a redirect would forward `x-ss-*` headers to another host); 10 s timeout; no proxy env that rewrites the host.
- **S6** Fresh timestamp **per attempt** (retries re-sign; idempotency key and body stay fixed). Server clock under NTP; alert if skew to the Hub's `Date` header exceeds 60 s.
- **S7** Idempotency key: one per logical action, generated at the moment the action is accepted, persisted with the retry job (D4). Never derive it from mutable data.
- **S8** `actor.site`, `userRef`, `email`, `name` come **only** from the server-side authenticated session / DB. Never from the request body, query, headers or cookies the browser controls. The `site` slug used in any Hub call must be one the session user is a member of (this is the only thing preventing cross-tenant access, since the Hub trusts the signed `site`).
- **S9** Per-user authorisation stays in StackShift. The Hub authorises by **site only** (audit gap G1): before calling `GET /tickets/{ref}`, `/comments`, `/status` or `uploads/sign`, StackShift must verify the session user may act on that ticket (it created it, or the Support Center is explicitly site-wide for their role). Pass `userRef` on list calls to narrow to the user's own tickets when that is the product behaviour. **Decision to confirm with the Hub owner:** is the Support Center per-user or site-wide? Record the answer in the PR.
- **S10** Treat all Hub-provided HTML (`bodyHtml` in events and reads) as untrusted: sanitise with DOMPurify (server or client) with an allowlist, strip `javascript:`/`data:` URLs and event handlers, `rel="noopener noreferrer"` on links. Same for `authorName`, `filename` (escape on render).
- **S11** `downloadUrl` hygiene: HTTPS only; if StackShift's server ever fetches one, check the host against an allowlist (the Hub's Supabase storage host) to avoid SSRF; do not persist it, do not log it, never put it in a URL the user can share. Re-fetch via D9 when rendering.

**Receiver (Hub → StackShift)**
- **S12** Receiver rules (full spec 3.5): POST only; read the **raw** body (disable body parsing); size cap; require `x-ss-key-id: current`; verify the signature over `req.url` path+query as received; reject `|now − ts| > 300 s`; dedupe by `eventId`; no unauthenticated work before verification; respond with generic errors (no echo of expected signatures/canonical strings); never log raw payloads.
- **S13** Rotation (no downtime): ① Hub operator adds `…_NEXT`; ② StackShift deploys with `HUB_SUPPORT_SECRET_NEXT` and flips `HUB_SUPPORT_KEY_ID=next`; ③ Hub promotes next→current and clears next; ④ StackShift moves the value to `HUB_SUPPORT_SECRET`, sets `KEY_ID=current`, removes `…_NEXT`. The **events** secret rotates as a coordinated change on both sides until H2 lands (receiver can temporarily accept two secrets, trying each with `timingSafeEqual`).
- **S14** Rate/abuse: honour `429 Retry-After`; cap dual-write concurrency (e.g. 4 in flight); circuit-break on repeated `5xx` (pause the queue, keep enqueuing) so an outage never degrades the customer-facing app.

### 3.5 Events receiver — exact behaviour

Next.js **Pages Router** API route (StackShift uses `pages/api`), Node runtime:

```ts
// pages/api/hub/events.ts
import type { NextApiRequest, NextApiResponse } from "next";
import { createHmac, createHash, timingSafeEqual } from "node:crypto";

export const config = { api: { bodyParser: false } };   // REQUIRED: signature covers the raw bytes

const MAX_BYTES = 1_000_000;
const SKEW = 300;

async function raw(req: NextApiRequest): Promise<string | null> {
  const chunks: Buffer[] = []; let n = 0;
  for await (const c of req) { n += (c as Buffer).length; if (n > MAX_BYTES) return null; chunks.push(c as Buffer); }
  return Buffer.concat(chunks).toString("utf8");
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).end();
  const secret = process.env.HUB_EVENTS_SECRET;
  if (!secret) return res.status(503).json({ error: "not_configured" });   // fail closed
  const body = await raw(req);
  if (body === null) return res.status(413).json({ error: "payload_too_large" });

  const ts = String(req.headers["x-ss-timestamp"] ?? "");
  const sig = String(req.headers["x-ss-signature"] ?? "");
  if (req.headers["x-ss-key-id"] !== "current") return res.status(401).json({ error: "unknown_key" });
  if (!/^\d+$/.test(ts) || Math.abs(Date.now() / 1000 - Number(ts)) > SKEW) return res.status(401).json({ error: "stale_timestamp" });
  if (!/^[0-9a-f]{64}$/i.test(sig)) return res.status(401).json({ error: "bad_signature" });

  const path = canonicalPath(req.url ?? "");                                 // Appendix B, same function as the signer
  const canonical = `${ts}\nPOST\n${path}\n${createHash("sha256").update(body).digest("hex")}`;
  const expected = createHmac("sha256", secret).update(canonical).digest();
  if (!timingSafeEqual(expected, Buffer.from(sig, "hex"))) return res.status(401).json({ error: "bad_signature" });

  // authenticated from here on
  const evt = JSON.parse(body);                 // validate with zod: eventId, type∈4 types, sequence int, ticket{…}, data
  await enqueueForProcessing(evt);              // dedupe by eventId + order by sequence happen in the worker (D7)
  return res.status(200).json({ ok: true });    // 2xx well inside the Hub's 10 s timeout
}
```
Behavioural rules the worker must follow:
1. **Dedupe by `eventId`** (insert into `hub_events_seen` with a unique constraint; conflict ⇒ already applied ⇒ still reply 2xx). Delivery is at-least-once.
2. **Order per ticket by `sequence`.** Replayed `dead` events keep their original `sequence` and may arrive late: `ticket.status_changed` older than the held `last_status_sequence` is ignored; `ticket.reply` is additive (insert by `messageId`, order by `createdAt`).
3. **Unknown `ticketRef` / `site` mismatch** (the ticket's site ≠ the event's `ticket.site`): drop and alert, still `2xx` (otherwise the Hub retries a poison event for 14 h).
4. **Unknown event types / extra fields:** ignore the extras, `2xx` unknown types (v1 additive-change rule).
5. Never trigger customer emails from `ticket.reply` while `suppress…` overlap is in force — StackShift keeps sending only what it sends today.
6. The receiver URL path must be stable and contain **no query string**; any reverse proxy / rewrite in front of it must preserve the path exactly (the Hub signs the path of `STACKSHIFT_EVENTS_URL`; a rewrite changes the canonical string and every event fails `bad_signature`).

## Acceptance Criteria

### Security
- [ ] No Hub secret appears in client bundles, `next.config`, logs, error responses or git history (grep of the built `.next/static` for the secret prefix returns nothing).
- [ ] All Hub calls are HTTPS-only; app refuses to boot the Hub client with an `http:` base URL outside local dev.
- [ ] `hubFetch` uses `redirect: "error"` and a timeout; verified by a test against a server that 302s.
- [ ] Signer passes **both** Appendix A vectors byte-for-byte and the query-order/encoding cases.
- [ ] Receiver passes: valid event → 200; flipped body byte → 401; wrong secret → 401; `x-ss-key-id: next` → 401; timestamp ±301 s → 401; missing/short/non-hex signature → 401 (not a 500); body > cap → 413; GET → 405; secret unset → 503; replayed identical event → 200 and **applied once**.
- [ ] `actor.site` is derived server-side; a test proves a user of site A cannot cause a Hub call carrying site B (S8). Per-user authorisation (S9) has a test for the chosen product behaviour.
- [ ] Hub-provided HTML is sanitised: an event with `<img src=x onerror=…>` and `<a href="javascript:…">` renders inert.
- [ ] Secrets differ between `HUB_SUPPORT_SECRET` and `HUB_EVENTS_SECRET` and between environments.

### Functional
- [ ] With `HUB_DIRECT_ENABLED_SITES` empty, behaviour and request logs are identical to today (no Hub traffic).
- [ ] Pilot site: create → Desk ticket first, then Hub `201` with `deskTicketId`; Hub `5xx`/timeout/DNS failure does **not** fail the customer action, the job retries with the same key + identical body and ends `done` (`200 deduped` accepted).
- [ ] Comment and resolve/reopen dual-write the same way; a customer comment on a closed ticket reopens it on the Hub.
- [ ] Attachment round trip (sign → PUT → register) works for an allowed type; a `.png` declared but containing other bytes is rejected by the Hub with `400` and no ticket/comment is created; a disallowed type gets `422`; > 25 MB gets `413`.
- [ ] Receiver applies each event type, including **duplicate delivery** (applied once) and **out-of-order `sequence`** (stale status ignored, reply still inserted).
- [ ] After simulated downtime, the re-sync job (D8) recovers every missed event exactly once and advances its cursor.
- [ ] `429` honours `Retry-After`; wrong-site ref → `403` on writes and `404` on reads is surfaced as a generic error, not retried.
- [ ] Stage 4: flagged site renders list + detail from the Hub identical to Desk for the pilot (screenshot comparison of the list + 5 random threads); flag off returns to Desk with no data loss (rollback rehearsed).

### Process
- [ ] Hub parity report (`/desk/stackshift-parity`) shows PASS for the pilot site after ≥ 14 days and ≥ 50 tickets, with zero `dead` outbox events and no 5xx — the gate in task 449. (Desk step-down is **not** part of this task.)

## Verification

Hub side (this repo), run from the repo root:
```bash
npx tsc --noEmit
pnpm lint
npx tsx _docs/task/444-stackshift-support-auth.check.ts
npx tsx _docs/task/446-outbox.check.ts
# H1 guard check (new): npx tsx _docs/task/452-events-url-guard.check.ts
```
Joint, against Hub **staging** with throwaway secrets and a test site slug:
```bash
# Hub harness: create(+replay), comment, attachments, status, wrong-site, stale ts, 429, 503
npx tsx _docs/task/445-support-harness.ts --base https://<hub-staging>
# StackShift receiver vs a Hub-signed event: mock receiver mirrors what StackShift must accept
npx tsx _docs/task/446-mock-receiver.ts --secret <throwaway-events-secret>
```
StackShift side: unit tests D2 + receiver tests from the acceptance list; one end-to-end run on staging for each row of the handoff's "Minimum checks" (`stackshift-hub-support-handoff.md` §5).

## Compatibility Touchpoints

- Docs: `stackshift-app-context-prompt.md`, `stackshift-hub-support-handoff.md` updated; contract unchanged.
- `env.example`: comments only (and `STACKSHIFT_EVENTS_SECRET_NEXT` if H2 is approved).
- `CLAUDE.md` StackShift paragraph: add one sentence on H1/H2 and on gap G1 (site-only authorisation) if they are implemented.
- No DB/migration change. No Desk-flow change. No MCP tool change (`_docs/mcp-tools.md` n/a).

## 4. Hub-side hardening items surfaced by the audit (decide before Phase 2)

| ID | Item | Recommendation |
|----|------|----------------|
| **H1** ✅ done — `events-config-logic.ts` + `_docs/task/452-events-config.check.ts`. Reject insecure `STACKSHIFT_EVENTS_URL` (`http:` in production, embedded credentials, query string, non-standard scheme) in `eventsConfig()`; log once and treat as not configured (events stay `pending`, nothing leaves the Hub). | **Do it** — small, pure, testable. |
| **H2** ✅ done — adds `STACKSHIFT_EVENTS_KEY_ID`. `STACKSHIFT_EVENTS_SECRET_NEXT` + outbound key id, mirroring inbound rotation. | Recommended; skip only if a coordinated events-secret rotation is acceptable. |
| **H3** ⏸ deferred. Optionally add `userRef` enforcement (opt-in query param on detail/comment/status) so per-user Support Centers get Hub-side defence in depth. | **Defer** unless the S9 answer is "per-user"; otherwise StackShift enforces. |
| **H4** ✅ done — context prompt, handoff §3, CLAUDE.md updated; standalone `_docs/plan/stackshift-app-hub-integration-instructions.md` created. | Done. |

## Appendix A — Known-answer signature vectors (generated with the Hub's own `signRequest`)

Secret `test-secret-do-not-use-0123456789abcdef`, key id `current`, timestamp `1760000000`.

1. **POST** `/api/webhooks/stackshift-support/v1/tickets/ss_1/status`, body (exact bytes) `{"idempotencyKey":"k1","status":"closed"}`
   - body sha256: `5a6dbcf0ddffa61488936bf3ce5662364a9e20e11aa776c8ca92c92f58497062`
   - signature: `10c029d7cd6224a1050f9403ee2e5e9f0a63a7bdf3ef99a07f8085b2b0b6d3e3`
2. **GET** `/api/webhooks/stackshift-support/v1/tickets?status=all&site=a%20b&limit=5` (query deliberately unsorted), empty body
   - canonical string: `"1760000000\nGET\n/api/webhooks/stackshift-support/v1/tickets?limit=5&site=a%20b&status=all\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"`
   - signature: `cdc3c6c7cfb98220f18dd412304c11182f8ae2e425c52dcd2334c2ba490e1e27`

## Appendix B — `canonicalPath` (copy verbatim; Hub: `auth-logic.ts`)

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
