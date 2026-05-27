# CONCERNS.md — Technical Debt & Issues

> Last mapped: 2026-05-27

## Unimplemented Stubs (Sprint 5+)

### Sanity CMS (`src/lib/sanity/index.ts`)
All functions throw `Error("not yet implemented — Sprint 5")`. Not a bug today — Sprint 5 hasn't started. But calling these from execution engine will crash.
- `getSanityClient()`
- `publishSanityDocument()`

### GitHub (`src/lib/github/index.ts`)
All functions throw `Error("not yet implemented — Sprint 5")`.
- `createFeatureBranch()`
- `createPullRequest()`

### Dev & KB Pages
`src/app/(hub)/dev/page.tsx` and `src/app/(hub)/kb/page.tsx` are Sprint 6 stubs. Shown in navigation but likely have placeholder content.

## Missing Test Coverage

**No test runner is configured.** Zero automated tests in `src/`. Correctness relies entirely on:
1. TypeScript strict mode (`npx tsc --noEmit`)
2. Manual browser acceptance testing

Risk areas that lack test coverage:
- `computeLLMCost()` — pricing logic could silently produce $0 for unknown model IDs
- `buildContextChain()` — context string format; a bad prompt could cause silent AI degradation
- Onboarding form completion % calculation in `useOnboardingForm`
- Zod schema edge cases at API boundaries
- HMAC webhook signature verification in `webhooks/route.ts`

## Security Concerns

### `adminClient` Scope Creep
`adminClient` (service role, bypasses RLS) is used in several places beyond the documented exceptions:
- `src/app/api/customers/route.ts` — POST uses `adminClient` for creation (documented)
- `src/app/api/customers/[customerId]/route.ts` — PATCH uses `adminClient` (should use server client)
- `src/app/api/customers/[customerId]/products/route.ts` — reads use `adminClient`

These API routes have auth checks (`user` from session), so RLS bypass isn't exploitable, but it's drift from the stated convention that `adminClient` is for service-level writes only.

### Zoho OAuth Token in Memory
`getZohoAccessToken()` fetches a new access token on every call (no caching). This generates many token requests to Zoho's OAuth endpoint and could hit rate limits. No token caching is implemented.

### Webhook HMAC Verification
Webhook signature verification in `webhooks/route.ts` uses `crypto.timingSafeEqual` — correct implementation. But the `ZOHO_WEBHOOK_SECRET` is optional: if unset, the HMAC check is skipped (check the route for the exact behavior). Ensure secret is always configured in production.

### Zoho Desk Customer Linking Not Implemented
```typescript
// zoho_account_id column was removed — Zoho Desk ticket → customer linking not yet implemented
return null;
```
`zoho_desk` webhooks always return `null` for `customer_id`. Desk tickets create unlinked classification records.

## Performance Concerns

### No Pagination on Classification Records
`src/app/(hub)/pm/tasks/page.tsx` fetches up to 100 classification records (`.limit(100)`). As records accumulate, this will grow stale. No pagination or cursor-based loading.

### Zoho Token on Every API Call
Every `syncTaskToZoho()`, `updateZohoTaskStatus()`, or Cliq notification makes a full OAuth token refresh call (`getZohoAccessToken()`) before the actual API call. Should be cached with ~1hr TTL.

### `llm_config` Cache
5-minute in-memory cache in `model-config.ts` means model config changes take up to 5 minutes to propagate to running instances. Acceptable tradeoff but worth knowing.

## Technical Debt

### Zoho Desk Customer Linking
No mechanism to link Zoho Desk tickets to customers. The `zoho_account_id` column was removed. Creating a classification record from a Desk webhook produces an orphaned record with no `customer_id`.

### `classification_records.status` Dual Purpose
The `status` field has both pipeline values (`pending`, `planning`, `approved`) and PM action values (`open`, `on_hold`, `active`, `review`, `closed`). Migration 013 expanded the constraint. This dual-use field may create confusion about what stage a record is in.

### No Retry Logic on AI Calls
If an AI call fails transiently (network timeout, rate limit), there's no retry mechanism. The operation fails and must be manually re-triggered by the PM.

### No Background Job Queue
Long-running AI operations (assessment, plan generation) run synchronously in API routes. Next.js has a 60s default timeout. Complex prompts or slow models could time out. No job queue (BullMQ, Inngest, etc.) is in place.

### `src/lib/customers/generate-id.ts`
Customer ID generation format (`WRQ-CLIENT-XXXX`) — it's unclear if the generated IDs are checked for uniqueness against the DB before use. Should be verified.

## Fragile Areas

### `proxy.ts` Session Refresh
Next.js 16 uses `proxy.ts` instead of `middleware.ts` for session refresh. This is a non-standard convention that could be broken by a Next.js upgrade if the `proxy` export name changes.

### AI SDK Version Lock
`ai@6.0.168` is a major version that introduced breaking changes from v5. The `@ai-sdk/anthropic@^3.0.71` and `@ai-sdk/openai@^3.0.53` adapters must match the `ai` core version — mismatched peer deps could break silently.

### `pnpm build --webpack`
The `--webpack` flag in the build script is required for Next.js 16 + PWA compatibility. If this flag is ever removed from `package.json`, production builds will fail.

### pg_cron Digest Scheduling
The daily digest is scheduled via `pg_cron` in Supabase (migration 012). The cron job sends an HTTP request to `/api/digest` with `x-digest-secret` header. If `DIGEST_SECRET` env var is not set in production, all pg_cron digest calls will fail silently (the route checks the secret but the behavior on mismatch may vary).

## Incomplete Sprint Work

| Sprint | Status | Notes |
|--------|--------|-------|
| Sprint 1 | Complete | Customer creation, onboarding forms, PM dashboard |
| Sprint 1.1 | Complete | Zoho OAuth, hub_users, PKCE callback |
| Sprint 2 | Largely complete | Classification, webhook, Cliq notifications |
| Sprint 3 | Complete | Assessment, daily digest |
| Sprint 4 | In testing | Plan generation (task 025) + Zoho sync (task 026) |
| Sprint 5 | Not started | Execution engine, reply generation, Sanity/GitHub |
| Sprint 6 | Not started | Dev dashboard, KB seed, time tracking |
