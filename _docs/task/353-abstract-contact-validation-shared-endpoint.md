# 353: Abstract API Email & Phone Validation — Shared Hub Endpoint (webriq.com → Hub)

**Created:** 2026-09-09
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep
**Status:** Testing

---

## Feasibility verdict

**Yes — this is possible and it fits the codebase well.** The downloaded plan
(`~/Downloads/abstract-validation-plan.md`) is architecturally sound. Section 9
(centralize the Abstract calls in the Hub, call it server-to-server from
webriq.com with a shared token) is almost exactly the pattern task 347 already
shipped for the StackShift order form:

- token-gated server-to-server endpoint, `x-<name>-webhook-secret` header,
  `timingSafeEqual` compare, `503` when the secret env var is missing
  (`src/app/api/webhooks/stackshift-order/_secret.ts`)
- zod-validated JSON body, `adminClient` writes (no user session on this path)
- best-effort side effects (email/Cliq) that never fail the request

So the Hub side is a well-trodden path. The corrections below are about
**what the plan assumes exists that doesn't**, and a few scope simplifications.

### What the plan gets wrong / must be verified before building

1. **No Redis / KV in this repo.** The plan's cache layer assumes "Redis/DB".
   The Hub has Supabase Postgres only (`@upstash/qstash` is installed but it's a
   job queue, not a KV store). → Cache is a **Postgres table** (`validation_cache`)
   with an explicit `expires_at` column, not Redis.
2. **No rate-limiting library.** Nothing in `src/lib` does rate limiting today
   (the only `429` handling is Zoho's retry wrapper). Vercel functions have no
   shared memory, so an in-memory limiter is useless in prod. → Rate limiting is
   a **Postgres counter table** keyed by `(ip, window_start)`, or skipped for v1
   and enforced only by the shared-secret + webriq.com's own per-IP limit.
3. **"Phone Intelligence API" as a separate product is not confirmed.** Abstract
   currently markets **Phone Validation**. Verify at `app.abstractapi.com` whether
   a distinct "Phone Intelligence" product with its own key/quota exists, or
   whether the risk signals are fields on the Phone Validation response. The plan
   itself flags this in §10 — treat the 4-product / 400-req model as unverified
   until you see 4 separate keys in the Abstract dashboard.
4. **Free-tier numbers are unverified.** "100 req/month × 4" is the plan's
   assumption. Abstract has historically offered different free allowances per
   product (some 100/mo, some 250/mo) and a **1 req/sec** hard rate limit on
   free. Confirm the real numbers per product at signup and put them in the task
   doc before Phase 1.
5. **`logLLMInvocation()` does not apply** — these are not LLM calls. The
   equivalent "log every call for cost/tuning" is a `validation_logs` table
   (plan §7), not the AI logger.
6. **zod v4**: this repo is on `zod@4`. `z.string().email()` still works (see
   `src/lib/stackshift-orders/schema.ts:31`) but `z.email()` is the v4 idiom.
7. **Endpoint location.** The plan says `/api/public/validate`. This repo has no
   `src/app/api/public/` yet and `(public)` is a *page* route group. Since this
   is server-to-server and token-gated (not a browser-facing or webhook-provider
   callback), put it at **`src/app/api/public/validate/route.ts`** with its own
   `_secret.ts` (new convention, mirrors `stackshift-order/_secret.ts`). Do not
   put it under `/api/webhooks/` — it isn't a webhook.
8. **One endpoint, not two.** The plan has `/validate-email` + `/validate-phone`.
   A lead form usually collects both; a single `POST /api/public/validate` taking
   `{ email?, phone? }` and returning both results halves the round-trips from
   webriq.com. (Keep the per-type lib functions separate internally.)

---

## Overview

Build a **shared contact-validation service in the Hub** that webriq.com (and
later other WebriQ properties) call server-to-server before storing a lead /
signup / onboarding submission. The service wraps Abstract's Email Validation
(and optionally Email Reputation / Phone Validation / Phone Intelligence) APIs,
applies a composite risk score, caches results in Postgres to protect the free
quota, and returns **only** `{ allowed, riskLevel, reasonCode }` — never raw
Abstract payloads.

This task delivers the **Hub side only**. The webriq.com form handler + client-side
`zod` / `libphonenumber-js` pre-checks are explicitly **out of scope** (user
implements later, in the separate webriq.com repo — a contract appendix is
included below so that work has a spec).

## Requirements

- [ ] `POST /api/public/validate` — token-gated (`x-contact-validation-secret`,
      timing-safe), accepts `{ email?, phone?, stakes?: "low" | "high" }`,
      returns `{ email?: {...}, phone?: {...} }` where each is
      `{ allowed: boolean, riskLevel: "low" | "medium" | "high" | "unknown", reasonCode: string }`.
- [ ] `503` when `CONTACT_VALIDATION_WEBHOOK_SECRET` is unset; `401` on bad/missing
      secret; `400` on invalid body (zod).
- [ ] `src/lib/validation/email.ts` — `validateEmail()`, `getEmailReputation()`
      (Abstract fetch wrappers, keys from env, never `NEXT_PUBLIC_*`).
- [ ] `src/lib/validation/phone.ts` — `validatePhone()`, `getPhoneIntelligence()`
      (only if the product is confirmed to exist — otherwise phone risk comes
      from the Phone Validation response fields).
- [ ] `src/lib/validation/risk-score.ts` — pure function combining signals into a
      0–100 score + `riskLevel` bucket + `reasonCode`; weights table from plan §5,
      documented as tunable.
- [ ] `src/lib/validation/cache.ts` — `getCached(kind, normalizedValue)` /
      `setCached(...)` against a new `validation_cache` table, 30-day TTL
      (`expires_at`), keyed by SHA-256 of the normalized email/phone (avoid storing
      raw PII as the lookup key; store the normalized value in a column too only
      if the retention policy allows — see Security).
- [ ] Conditional escalation: base Validation call always; Reputation/Intelligence
      only when the base result is ambiguous (`deliverability === "UNKNOWN"`,
      catch-all, `quality_score < 0.5`, VoIP/unknown line type) **or**
      `stakes === "high"`.
- [ ] **Graceful degradation**: on Abstract non-2xx, timeout, or a
      quota-exhausted signal → return `{ allowed: true, riskLevel: "unknown",
      reasonCode: "validation_unavailable" }`, write a `validation_logs` row, and
      fire a best-effort Cliq/email alert (do not block signups).
- [ ] `validation_logs` table — one row per decision: kind, hashed value,
      `risk_score`, `risk_level`, `reason_code`, `escalated`, `degraded`,
      `source` (caller id), `created_at`. For audit + weight tuning.
- [ ] `migration 133` — `validation_cache` + `validation_logs` (+ optional
      `validation_rate_limits`). RLS: deny-all to `anon`/`authenticated`;
      `adminClient` only (mirrors `accounts` / `stackshift_orders` policy shape).
      **Written, not applied** by the agent — user applies.
- [ ] Quota-monitor cron route `GET /api/cron/validation-quota-check`
      (`x-cron-secret` / `CRONJOB_SECRET_KEY` per the repo cron pattern) — counts
      `validation_logs` rows this calendar month per product, Cliq-alerts at 80%.
      *(Phase 2 — can defer.)*
- [ ] `env.example` + `CLAUDE.md` updated (new env vars, new endpoint, new tables).
- [ ] `_docs/mcp-tools.md` — N/A (no MCP tool added).

## Out of Scope / Must-Not-Change

- **webriq.com repo** — its `/api/submit-lead` handler, client-side `zod` +
  `libphonenumber-js`, and inline form error UI. Contract appendix only.
- No browser-facing / CORS-open variant of the endpoint. Server-to-server only.
- No changes to existing auth, `(public)` page routes, onboarding form engine, or
  any existing customer/contact write path. This endpoint does **not** create or
  mutate `contacts` / `customers` / `leads` — it only returns a verdict.
- Do **not** add Redis / `@vercel/kv` / a new rate-limit dependency without
  raising it — Postgres-table approach is the default.
- Do not store full raw Abstract payloads long-term (PII). `validation_cache`
  may hold the parsed subset needed for a re-decision; `validation_logs` stores
  only the hashed value + derived fields.
- Do not expose which specific check failed in the API response (`reasonCode` is
  coarse: `invalid_email` / `disposable` / `undeliverable` / `high_risk` /
  `invalid_phone` / `voip_blocked` — never "mailbox does not exist").

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/public/validate/route.ts` | Create | The shared endpoint (POST); GET → 405 |
| `src/app/api/public/validate/_secret.ts` | Create | `assertContactValidationSecret(req)` — mirrors `stackshift-order/_secret.ts` |
| `src/lib/validation/schema.ts` | Create | zod request/response schemas |
| `src/lib/validation/email.ts` | Create | Abstract Email Validation + Reputation fetch wrappers |
| `src/lib/validation/phone.ts` | Create | Abstract Phone Validation (+ Intelligence if it exists) wrappers |
| `src/lib/validation/risk-score.ts` | Create | Pure signal→score→level→reasonCode |
| `src/lib/validation/decision.ts` | Create | Orchestrates cache → base call → escalate → score → cache write → log |
| `src/lib/validation/cache.ts` | Create | `validation_cache` get/set, SHA-256 key, TTL |
| `src/lib/validation/logger.ts` | Create | `logValidationDecision()` → `validation_logs` |
| `src/lib/validation/normalize.ts` | Create | `normalizeEmail()` (lowercase, trim, strip +tag optional), `normalizePhone()` (E.164 best-effort — no libphonenumber dep server-side; accept the international string the caller sends) |
| `src/app/api/cron/validation-quota-check/route.ts` | Create (Phase 2) | Monthly usage alert |
| `supabase/migrations/133_contact_validation.sql` | Create (not applied) | `validation_cache`, `validation_logs`, optional `validation_rate_limits` |
| `env.example` | Modify | Abstract keys + `CONTACT_VALIDATION_WEBHOOK_SECRET` |
| `CLAUDE.md` | Modify | Endpoint + tables + env note under Key Conventions |
| `src/types/database.ts` | Modify | Add the two/three new table types |

## Code Context

### Pattern to copy: `src/app/api/webhooks/stackshift-order/_secret.ts`

```ts
export function assertOrderWebhookSecret(req: NextRequest): NextResponse | null {
  const secret = process.env.STACKSHIFT_ORDER_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stackshift-order] ... not configured");
    return NextResponse.json({ error: "Intake endpoint not configured" }, { status: 503 });
  }
  const provided = req.headers.get("x-stackshift-webhook-secret") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
```

`_secret.ts` for this task is the same with `CONTACT_VALIDATION_WEBHOOK_SECRET`
and `x-contact-validation-secret`.

### Route body shape: `src/app/api/webhooks/stackshift-order/route.ts:14-29`

```ts
export async function POST(req: NextRequest) {
  const secretErr = assertOrderWebhookSecret(req);
  if (secretErr) return secretErr;
  let body: unknown;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const parsed = orderIntakeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload", details: parsed.error.flatten() }, { status: 400 });
  }
  // ...
}
```

### Cron auth pattern (for the Phase 2 quota check)

Every cron route accepts `x-cron-secret: <CRONJOB_SECRET_KEY>` **or** a valid
user session. See `src/app/api/programme/reminders/route.ts` /
`src/app/api/digest/route.ts`. The cron job reads URL + secret from Supabase
Vault (`app_base_url` / `cron_secret_key`), never hardcoded.

### Cliq alert helper: `src/lib/zoho/index.ts:466` `sendCliqNotification(...)`

Reuse for the degradation + quota alerts (or `mailer.ts` `transporter`).

### Abstract endpoints (verify against `docs.abstractapi.com` before shipping)

```
Email Validation   GET https://emailvalidation.abstractapi.com/v1/?api_key=&email=
Email Reputation   GET https://emailreputation.abstractapi.com/v1/?api_key=&email=
Phone Validation   GET https://phonevalidation.abstractapi.com/v1/?api_key=&phone=
Phone Intelligence GET https://phoneintelligence.abstractapi.com/v1/?api_key=&phone=   ← CONFIRM this product exists
```

Field names on Email Validation: `is_valid_format.value`, `is_mx_found.value`,
`is_smtp_valid.value`, `is_disposable_email.value`, `is_catchall_email.value`,
`deliverability` (`DELIVERABLE|UNDELIVERABLE|UNKNOWN|RISKY`), `quality_score`
(string "0.0"–"1.0"). Confirm — Abstract varies field shape by plan tier.

## Implementation Steps

1. **Verify Abstract first (blocking).** Create the account, see exactly which
   products / keys / free quotas / rate limits you get. Record them in this doc.
   Decide: 2-API (Validation only) or 4-API (with Reputation/Intelligence).
2. `migration 133` — write `validation_cache` (`id`, `kind` check
   `('email','phone')`, `value_hash` text, `normalized_value` text null,
   `result` jsonb, `expires_at` timestamptz, `created_at`), unique
   `(kind, value_hash)`; `validation_logs` (see Requirements); RLS deny-all +
   admin bypass. Add types to `src/types/database.ts`. **Do not apply.**
3. `src/lib/validation/normalize.ts` + `schema.ts` (zod, `z.string().email()`,
   phone as a non-empty string the caller already formatted).
4. `src/lib/validation/email.ts` + `phone.ts` — fetch wrappers, `AbortSignal`
   timeout (~4s), throw a typed `ValidationUnavailableError` on non-2xx / quota /
   timeout.
5. `src/lib/validation/risk-score.ts` — port plan §5 weights; export
   `scoreEmail(signals)`, `scorePhone(signals)`, `bucket(score)`.
6. `src/lib/validation/cache.ts` + `logger.ts`.
7. `src/lib/validation/decision.ts` — `decideEmail(email, stakes)` /
   `decidePhone(phone, stakes)`: cache hit → return; else base call → hard-block
   check → escalation check → optional escalate call → score → cache write → log →
   return. Wrap the whole thing so `ValidationUnavailableError` →
   `{ allowed: true, riskLevel: "unknown", reasonCode: "validation_unavailable" }`
   + log `degraded: true` + best-effort alert.
8. `_secret.ts` + `route.ts` — parse `{ email?, phone?, stakes? }`, run whichever
   deciders apply in parallel (`Promise.all`), return combined.
9. `env.example` + `CLAUDE.md`.
10. `npx tsc --noEmit` + `pnpm lint`.
11. **Phase 2:** `validation-quota-check` cron route + register the pg_cron job
    (separate migration, or manual — follow the digest cron precedent).
12. Hand webriq.com contract appendix to the user for the separate repo.

## Acceptance Criteria

- [ ] `POST /api/public/validate` with a valid secret + `{ email: "test@mailinator.com" }`
      → `{ email: { allowed: false, riskLevel: "high", reasonCode: "disposable" } }`.
- [ ] Same call, no/invalid secret → `401`. Secret env unset → `503`.
- [ ] `{ email: "someone@gmail.com" }` twice → 2nd response served from
      `validation_cache` (no 2nd Abstract call — verify via `validation_logs`
      having 1 row, or a `cached: true` flag).
- [ ] Abstract key deliberately broken → endpoint still returns
      `{ allowed: true, riskLevel: "unknown", reasonCode: "validation_unavailable" }`,
      `200`, and a `validation_logs` row with `degraded = true`.
- [ ] `{ phone: "+15555550123", stakes: "high" }` → escalation path runs (if
      Phone Intelligence confirmed) or is a documented no-op.
- [ ] Response never contains raw Abstract fields or a specific failure reason
      beyond the coarse `reasonCode` enum.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass (2 pre-existing unrelated warnings
      are the known baseline).
- [ ] `migration 133` written, valid SQL, **not applied**; `CLAUDE.md` +
      `env.example` updated.

## Verification

```bash
npx tsc --noEmit
pnpm lint

# Local (needs .env.local: ABSTRACT_* keys + CONTACT_VALIDATION_WEBHOOK_SECRET,
# and migration 133 applied to the local DB):
pnpm dev
curl -sS -X POST http://localhost:3000/api/public/validate \
  -H 'content-type: application/json' \
  -H 'x-contact-validation-secret: <secret>' \
  -d '{"email":"test@mailinator.com","phone":"+15555550123"}' | jq

# Missing secret → 401
curl -sS -o /dev/null -w '%{http_code}\n' -X POST http://localhost:3000/api/public/validate \
  -H 'content-type: application/json' -d '{"email":"a@b.com"}'
```

Full production round-trip (webriq.com proxy → Hub) is **not runnable from this
task** — needs both apps deployed with the shared secret. Same posture as task
347.

## Compatibility Touchpoints

- **New env vars** — must be added in Vercel (Hub) *and* webriq.com's host before
  the endpoint is usable: `ABSTRACT_EMAIL_VALIDATION_KEY`,
  `ABSTRACT_EMAIL_REPUTATION_KEY`, `ABSTRACT_PHONE_VALIDATION_KEY`,
  `ABSTRACT_PHONE_INTELLIGENCE_KEY` (Hub only), `CONTACT_VALIDATION_WEBHOOK_SECRET`
  (both).
- **Migration 133** — user applies (Notes/StackShift-migration convention). The
  endpoint's cache/log writes fail loudly until it lands; consider a feature
  check that degrades to "call Abstract every time, skip cache/log" if the table
  is absent.
- No package additions on the Hub side (`zod` already present; no
  `libphonenumber-js`, no Redis).
- **Phase 2** pg_cron job registration follows the digest cron precedent
  (Vault-stored URL/secret).
- `_docs/mcp-tools.md` — not touched (no MCP tool).

---

## What YOU need to set up (checklist)

> **UPDATE (post-implementation):** the account has 2 consolidated products, not 4
> — see "Post-Plan Correction" above. Env vars below are the corrected set.

**Before it can go live:**

1. **From the Abstract dashboard**, open each product and copy its key:
   - **Email Reputation** → `ABSTRACT_EMAIL_REPUTATION_KEY`
   - **Phone Intelligence** → `ABSTRACT_PHONE_INTELLIGENCE_KEY`
   - Note the real free-tier request cap shown on each product's page (put it in
     `ABSTRACT_FREE_TIER_LIMIT` if it isn't 100), and confirm whether the free
     tier returns the `email_quality` / `email_risk` / `email_breaches` blocks or
     just deliverability.
2. **Decide the shared secret** `CONTACT_VALIDATION_WEBHOOK_SECRET`
   (`openssl rand -hex 32`) — set in Vercel (Hub) **and** webriq.com's host env.
3. **Decide policy:** hard-block VoIP or just flag it? (default: flag — set
   `CONTACT_VALIDATION_BLOCK_VOIP=true` to block). Cache TTL 30 days OK?
4. **Alert channel** for degradation + quota alerts — currently
   `sendCliqNotification("dev")`, which is globally disabled; turn Cliq on or
   swap to the mailer if you want the alerts live.

**After implementation (your side):**

5. Apply `migration 133` to the remote database.
6. Set the env vars in Vercel (Hub) and redeploy:
   `CONTACT_VALIDATION_WEBHOOK_SECRET`, `ABSTRACT_EMAIL_REPUTATION_KEY`,
   `ABSTRACT_PHONE_INTELLIGENCE_KEY` (+ optional `CONTACT_VALIDATION_BLOCK_VOIP`,
   `ABSTRACT_FREE_TIER_LIMIT`).

**Later, in the webriq.com repo (out of scope for this task — see appendix):**

7. Client-side pre-check (`zod` `.email()` + `libphonenumber-js`
   `isValidPhoneNumber()`), instant, free, runs before any network call.
8. Server-side `/api/submit-lead` route that: (a) POSTs to the Hub endpoint with
   the secret header, server-to-server; (b) on `allowed: false` returns an inline
   error to the form and does **not** store the lead; (c) on `allowed: true`
   proceeds to store/forward as normal; (d) optionally adds a soft-friction step
   (email confirmation link / OTP) when `riskLevel === "medium"`.
9. Set `CONTACT_VALIDATION_WEBHOOK_SECRET` in webriq.com's host env.
10. No CORS config needed — the call is server-to-server, never from the browser.

---

## Appendix — webriq.com ↔ Hub contract (for the separate repo)

**Endpoint:** `POST https://hub.webriqs.com/api/public/validate`

**Headers:**
```
content-type: application/json
x-contact-validation-secret: <CONTACT_VALIDATION_WEBHOOK_SECRET>
```

**Request body:**
```jsonc
{
  "email": "user@example.com",   // optional
  "phone": "+14155550123",       // optional, E.164 or international format
  "stakes": "low"                // optional, accepted but currently inert
}
```
At least one of `email` / `phone` required. `stakes` is accepted for
forward-compat but has no effect — Abstract returns the full risk picture in one
call, so there is nothing to escalate.

**Response `200`:**
```jsonc
{
  "email": {
    "allowed": true,
    "riskLevel": "low",          // "low" | "medium" | "high" | "unknown"
    "reasonCode": "ok"           // coarse enum, safe to log, NOT safe to show verbatim
  },
  "phone": {
    "allowed": false,
    "riskLevel": "high",
    "reasonCode": "invalid_phone"
  }
}
```
Only the keys you asked about are present. `riskLevel: "unknown"` +
`reasonCode: "validation_unavailable"` means Abstract was unreachable / quota
exhausted — **fail open** (treat as allowed, optionally add friction).

**Errors:** `400` invalid body · `401` bad/missing secret · `503` endpoint not
configured. On any error, webriq.com should fail open (allow the submission)
rather than block all leads, and log it.

**webriq.com must never** call this endpoint from the browser (the secret would
leak). Always proxy through its own server route.

---

## Implementation Notes

### What Changed

- New **`POST /api/public/validate`** endpoint (`src/app/api/public/validate/route.ts`),
  token-gated by `x-contact-validation-secret` (`_secret.ts`, timing-safe, `503`
  when unset — mirrors task 347). Accepts `{ email?, phone?, stakes? }`, runs the
  two deciders in parallel, returns `{ email?: FieldVerdict, phone?: FieldVerdict }`
  where `FieldVerdict = { allowed, riskLevel, reasonCode, cached? }`. `GET` → 405.
- New **`src/lib/validation/`** module:
  - `types.ts` — `FieldVerdict`, `RiskLevel`, `ValidationUnavailableError`, tallies.
  - `schema.ts` — zod request schema (`z.email()`, ≥1 of email/phone, `stakes`
    defaults `"low"`).
  - `normalize.ts` — `normalizeEmail` / `normalizePhone` (no `libphonenumber` dep
    server-side) + SHA-256 `hashValue` for cache/log keys (raw PII isn't the key).
  - `abstract-client.ts` — `fetchAbstract(url)` with a 4 s `AbortController`
    timeout; every non-2xx / timeout / network error / `429`/`402` becomes
    `ValidationUnavailableError`. Plus `abstractBool/Number/String` defensive
    coercers (Abstract returns `{value}` / `"TRUE"` / bare depending on tier).
  - `email.ts` / `phone.ts` — per-product wrappers, `has*()` capability checks
    keyed off which env keys are set. Reputation/Intelligence parsing is
    **heavily defensive** (nested, tier-varying shapes — flagged for live
    confirmation).
  - `risk-score.ts` — composite score from plan §5 weights (start 100, subtract;
    ≥70 low / 40–69 medium / <40 high). `bucket()` surfaces the dominant reason
    even in the low band so the caller sees *why* a score isn't a clean 100.
  - `cache.ts` — `validation_cache` get/set, 30-day TTL, `onConflict:"kind,value_hash"`;
    all DB access wrapped so the endpoint works uncached before migration 133.
    "unavailable" verdicts are never cached (transient).
  - `logger.ts` — `logValidationDecision()` → `validation_logs` (best-effort);
    `alertValidationDegraded()` with a 10-min per-instance cooldown.
  - `decision.ts` — orchestration: cache → base call → hard-block → conditional
    escalation (`stakes:"high"` OR ambiguous base result) → score → cache write →
    log. Any `ValidationUnavailableError` → **fail open**
    `{ allowed:true, riskLevel:"unknown", reasonCode:"validation_unavailable" }`
    + `degraded` log + alert. A *reputation/intelligence* outage during
    escalation is swallowed (base result still scored).
- New **`GET /api/cron/validation-quota-check`** — cron-secret-or-session gated
  (digest pattern), sums `validation_logs.abstract_calls` per product for the
  calendar month, Cliq-alerts (`"dev"` channel) at 80 % of `ABSTRACT_FREE_TIER_LIMIT`
  (default 100). Paginated select per the repo's 1000-row convention.
- **`supabase/migrations/133_contact_validation.sql`** — `validation_cache` +
  `validation_logs`, RLS deny-all to anon/authenticated (service-role writes),
  staff read on the log only. **Written, NOT applied.**
- **`src/types/database.ts`** — `validation_cache` + `validation_logs` Row/Insert/Update.
- **`env.example`** — `CONTACT_VALIDATION_WEBHOOK_SECRET`, 4× `ABSTRACT_*_KEY`,
  `CONTACT_VALIDATION_BLOCK_VOIP`, `ABSTRACT_FREE_TIER_LIMIT`; new cron route added
  to the cron-secret route list.
- **`CLAUDE.md`** — new Key Conventions bullet (tables + endpoint + fail-open +
  fields) and the cron route added to the Cron auth pattern list.

### Files Changed

- `src/app/api/public/validate/route.ts` - Create — the endpoint
- `src/app/api/public/validate/_secret.ts` - Create — shared-secret guard
- `src/lib/validation/types.ts` - Create
- `src/lib/validation/schema.ts` - Create
- `src/lib/validation/normalize.ts` - Create
- `src/lib/validation/abstract-client.ts` - Create — fetch wrapper + coercers
- `src/lib/validation/email.ts` - Create
- `src/lib/validation/phone.ts` - Create
- `src/lib/validation/risk-score.ts` - Create
- `src/lib/validation/cache.ts` - Create
- `src/lib/validation/logger.ts` - Create
- `src/lib/validation/decision.ts` - Create — orchestration
- `src/app/api/cron/validation-quota-check/route.ts` - Create — monthly quota alert
- `supabase/migrations/133_contact_validation.sql` - Create (NOT applied)
- `src/types/database.ts` - Modify — two new table types
- `env.example` - Modify — new vars + cron route list
- `CLAUDE.md` - Modify — Key Conventions bullet + cron list

### Deviations From Plan

- **Quota-monitor cron was NOT deferred** — the task doc marked it "Phase 2 / can
  defer"; it's small and load-bearing for the free-tier strategy, so it shipped now.
- **`risk-score.ts bucket()` surfaces the dominant reason in the low band too**
  (not just on flag/block). More informative for the caller and for weight
  tuning; `allowed` semantics unchanged (low/medium → true, high → false).
- **Plan §5 weights kept verbatim** — note that a *lone* VoIP line (score 80) or a
  *lone* phone-intelligence risk flag (score 70) both land in the "low / allow"
  band by the plan's own math. That's intentional per the plan ("VoIP isn't
  inherently fraudulent") and the weights are explicitly tunable; set
  `CONTACT_VALIDATION_BLOCK_VOIP=true` to hard-block VoIP.
- **`z.email()`** (Zod 4 idiom) used instead of the repo's older
  `z.string().email()` — avoids a new deprecation warning; behaviour identical.
- Degradation alert uses `sendCliqNotification` which is **globally disabled**
  today (`CLIQ_NOTIFICATIONS_ENABLED = false` in `src/lib/zoho/index.ts`), so the
  real signal is the `console.error` + the `degraded` log rows until Cliq/email
  alerting is turned on. Acceptable — matches how the rest of the repo alerts.

### Verification Run

- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing unrelated warnings in `_checklist-tab.tsx`)
- Pure-logic scratch test (15 assertions: `normalize*`, `hashValue`,
  `scoreEmail`/`scorePhone` across clean / medium / high / VoIP-flag / VoIP-block /
  risk-flag paths, `validateRequestSchema` accept+reject cases) - PASS (15/15)
- **Live endpoint round-trip - SKIPPED** — needs an Abstract account + real API
  keys + `CONTACT_VALIDATION_WEBHOOK_SECRET` in `.env.local`, and migration 133
  applied for the cache/log assertions. Same posture as task 347 (no live run
  without the external account). `curl` recipes are in the Verification section
  above.
- **`pnpm build` - SKIPPED** (not requested; tsc + lint cover the type/lint gate).
- **Migration 133 - NOT applied** (Notes/StackShift-migration convention — user
  applies).

---

## Post-Plan Correction — Abstract API reality (2026-09-09, after Quality Gate)

The user's Abstract account showed **no** "Email Validation" or "Phone Validation"
keys — only **Email Reputation** and **Phone Intelligence** (plus a per-product
"primary key"). Confirmed against `docs.abstractapi.com/api/email-reputation` and
`.../api/phone-intelligence`: Abstract **consolidated** its catalog. The two
products the account has are each a **superset** returning the full picture in a
single request:

- **Email Reputation** — `GET https://emailreputation.abstractapi.com/v1/?api_key=&email=`
  → `email_deliverability{status, status_detail, is_format_valid, is_smtp_valid, is_mx_valid}`,
  `email_quality{score, is_disposable, is_catchall, is_role}`,
  `email_domain{domain_age, is_risky_tld}`,
  `email_risk{address_risk_status, domain_risk_status}` (low|medium|high),
  `email_breaches{total_breaches}`. `status` observed values: `deliverable` /
  `undeliverable` (anything else → treated as `unknown`).
- **Phone Intelligence** — `GET https://phoneintelligence.abstractapi.com/v1/?api_key=&phone=`
  → `phone_validation{is_valid, line_status, is_voip}`,
  `phone_carrier{name, line_type}` (mobile|landline|voip|toll_free|personal|pager|unknown),
  `phone_risk{risk_level, is_disposable, is_abuse_detected}`,
  `phone_breaches{total_breaches}`.
- Error codes (both): `401` bad key, `422` free-plan credits exhausted, `429`
  >1 req/sec on free, `500`/`503` server. `422` + `429` now map to
  `ValidationUnavailableError` (was only `429`/`402`).

### Rework applied (re-verified: `tsc` PASS, `lint` PASS, 16/16 scratch assertions PASS)

- **`email.ts`** — dropped `validateEmail`/`hasEmailValidation`; now a single
  `getEmailReputation()` → flat `EmailSignals` parsed from the nested response.
- **`phone.ts`** — dropped `validatePhone`/`hasPhoneValidation`; single
  `getPhoneIntelligence()` → flat `PhoneSignals`.
- **`decision.ts`** — the base-call → conditional-escalation two-step **collapsed
  to one call per kind**. No more `escalated`/`stakes` branching. New
  `failOpen()` helper dedupes the degraded-path logging.
- **`risk-score.ts`** — `scoreEmail(EmailSignals)` / `scorePhone(PhoneSignals, blockVoip)`
  read the real field set; weights adapted from plan §5 (added
  `deliverability_unknown` −20; phone gains `high_phone_risk` −35 /
  `elevated_phone_risk` −15 / `abuse_flagged` −30 / `disposable_number` −25).
- **`abstract-client.ts`** — added `abstractObj()` for nested-field narrowing;
  `422` added to the quota/rate-limit mapping.
- **`types.ts`** — `AbstractCallTally` narrowed to `email_reputation` |
  `phone_intelligence`; `ValidationStakes` removed.
- **`schema.ts`** — `stakes` kept (accepted) but marked inert / forward-compat.
- **`route.ts`** — stops threading `stakes`.
- **migration 133 / `database.ts`** — dropped the now-meaningless `escalated`
  column from `validation_logs`.
- **`validation-quota-check` cron** — `PRODUCTS` list → the two real products.
- **`env.example` / `CLAUDE.md`** — `ABSTRACT_EMAIL_REPUTATION_KEY` +
  `ABSTRACT_PHONE_INTELLIGENCE_KEY` only (the two legacy `*_VALIDATION_KEY` vars
  removed); notes rewritten for the one-call model.

### Net effect

Simpler and cheaper: **1 Abstract call per unique email, 1 per unique phone**
(then cached 30 days). Free-tier exposure is 2 quota pools, not 4. `stakes` in
the request body is now a no-op (full data always returned) — kept only so the
webriq.com contract doesn't need a change if they already send it.

⚠️ **Free-tier caveat:** `email_quality` / `email_risk` / `email_breaches` (and
the phone equivalents) *may* be Professional-tier-only on Abstract. The parser
and scorer treat every missing field as absent/safe, so a thinner free response
just yields a coarser score — never an error. Confirm on the dashboards what the
free tier actually returns.

---

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues.
- `src/lib/validation/` module has clean single-responsibility files; `decision.ts`
  uses early-return guard clauses; error handling is intentional at every layer
  (fail-open on `ValidationUnavailableError`, best-effort swallow on cache/log/
  escalation, rethrow on genuinely unexpected errors).
- Defensive `Record<string, unknown>` casts in `email.ts` / `phone.ts` / 
  `abstract-client.ts` are parsing genuinely-untyped external API responses whose
  shape varies by Abstract plan tier — appropriate use, not an `any` escape hatch.
- `console.warn` / `console.error` calls are intentional operational signals
  (degradation, skipped-DB-when-migration-absent), consistent with the repo's
  existing pattern (`[cliq] notification failed`, etc.) — not debug logging.
- Token-gate (task 347), cron auth (digest), pagination (1000-row cap), and
  migration-written-not-applied conventions all followed.

### Simplifications Applied During Gate
- `decision.ts` — removed the dead `degraded` parameter from `finish()` (it was
  hardcoded `false` at all four call sites; the degraded path logs inline).
- `cache.ts` — replaced the `const { cached: _drop, ...stored } = verdict; void _drop`
  destructure-and-discard with an explicit 3-field object literal.
- `route.ts` — bounded the `x-validation-source` header to 120 chars before it
  reaches `validation_logs.source` (the zod `source` field was already bounded;
  the header path was not).
- Re-verified: `npx tsc --noEmit` PASS, `pnpm lint` PASS (2 pre-existing warnings).

### Deviations
- **Medium** — quota-monitor cron (`/api/cron/validation-quota-check`) shipped now
  rather than deferred to "Phase 2" as the plan suggested. Small, self-contained,
  and load-bearing for the free-tier quota strategy. Risk: acceptable (cron-gated,
  read-only, best-effort alert).
- **Minor** — `risk-score.ts bucket()` surfaces the dominant risk reason in the
  "low" band too (plan implied `reasonCode` only matters on flag/block). More
  informative; `allowed` semantics unchanged.
- **Minor** — plan §5 weights kept verbatim; a lone VoIP line (80) or lone
  phone-intelligence risk flag (70) sit in the allow band by the plan's own math.
  Intentional and tunable; `CONTACT_VALIDATION_BLOCK_VOIP=true` overrides VoIP.
- **Minor** — `z.email()` (Zod 4 idiom) instead of the repo's older
  `z.string().email()`. Behaviour identical, avoids a deprecation warning.
- No Major deviations. Scope matches the task doc; nothing added beyond it.

### Required Fixes
- None.
