# INTEGRATIONS.md — External Services & APIs

> Last mapped: 2026-05-27

## Supabase

- **Role:** Primary database + auth provider
- **Auth:** Custom OIDC provider (`custom:zoho`) for "Sign in with Zoho" flow; standard email/password fallback
- **PKCE handler:** `src/app/api/auth/callback/` — exchanges OAuth code for Supabase session
- **Storage:** Bucket for brand assets + onboarding files (migration 005)
- **pg_cron:** Schedules daily digest via `pg_net` HTTP call to `/api/digest` (migration 012)
- **RLS:** Enabled; `adminClient` bypasses RLS — only allowed in server-only contexts
- **Env vars:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`

## Zoho

### Zoho Projects (primary integration)
- **Purpose:** Task/project management — Hub pushes plans as Zoho tasks; receives status changes via webhook
- **Auth:** OAuth 2.0 with refresh token (`ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`)
- **Token refresh:** `getZohoAccessToken()` in `src/lib/zoho/index.ts` — exchanges refresh token on each call
- **Operations:**
  - `createZohoProject()` — creates Zoho project on customer onboarding
  - `syncTaskToZoho()` — pushes implementation plan as task on approval (non-blocking)
  - `updateZohoTaskStatus()` — syncs status close/reopen
- **Env vars:** `ZOHO_PORTAL_ID` (numeric, server-only), `NEXT_PUBLIC_ZOHO_PORTAL_NAME` (slug, client-safe), `ZOHO_API_BASE_URL`

### Zoho Webhook (inbound)
- **Route:** `POST /api/webhooks`
- **Security:** HMAC-SHA256 signature verification (`X-ZP-WEBHOOK-SIGNATURE` header, base64-encoded), `ZOHO_WEBHOOK_SECRET`
- **Sources:** `zoho_desk` (tickets) and `zoho_projects` (task status updates)
- **Behavior:** Status updates on plans with `zoho_task_id` set `direct_zoho_edit: true` flag on the plan (shows warning in UI)

### Zoho Cliq (notifications)
- **Purpose:** PM and Dev digest notifications posted to team channels
- **Env vars:** `ZOHO_CLIQ_WEBHOOK_URL`, `ZOHO_CLIQ_DEV_WEBHOOK_URL` (separate dev channel)
- **Behavior:** Silently skips if webhook URL is unset

## Anthropic / Claude

- **SDK:** `@anthropic-ai/sdk@0.91.1` (direct) + `@ai-sdk/anthropic` (Vercel AI SDK adapter)
- **Usage:** Classification, requirements assessment, plan generation, execution, digest, reply
- **Env var:** `ANTHROPIC_API_KEY` (server-only)
- **Layer:** All calls go through `getModel(layer)` which resolves from `llm_config` DB table

## OpenAI (optional)

- **SDK:** `openai@^6.34.0` + `@ai-sdk/openai` adapter
- **Usage:** Per-layer override — switch any orchestration layer to OpenAI by updating `llm_config.provider`
- **Env var:** `OPENAI_API_KEY` (server-only)

## Vercel AI Gateway (optional proxy)

- **Purpose:** Routes AI requests through Vercel's caching/billing proxy
- **Note:** `llm_invocation_logs` in Supabase is the source of truth for per-customer cost attribution regardless of gateway use
- **Env vars:** `VERCEL_AI_GATEWAY_URL`, `VERCEL_AI_GATEWAY_TOKEN`

## Sanity (stub — Sprint 5+)

- **Purpose:** CMS for customer product content (StackShift, PublishForge, etc.)
- **Status:** Stub in `src/lib/sanity/` — not yet implemented
- **Env var:** `SANITY_API_TOKEN`; project ID stored per `customer_products` row

## GitHub (stub — Sprint 5+)

- **Purpose:** PR creation for execution engine
- **Status:** Stub in `src/lib/github/`
- **Env var:** `GITHUB_TOKEN` (fine-grained PAT, repo read/write)

## PWA / Service Worker

- **Provider:** `@ducanh2912/next-pwa@10.2.9`
- **Config:** `next.config.ts` — generates `public/sw.js` on build; disabled in dev
- **Offline fallback:** `src/app/offline/` page

## API Routes Summary

| Route | Purpose | Auth |
|-------|---------|------|
| `POST /api/webhooks` | Zoho inbound webhook | HMAC-SHA256 signature |
| `POST /api/classification` | Trigger AI classification | Session |
| `POST /api/assessment` | Trigger requirements assessment (Sonnet) | Session |
| `POST /api/plan` | Generate implementation plan (Sonnet) | Session |
| `POST /api/execution` | Execution engine | Session |
| `POST /api/digest` | Daily digest (pg_cron or session) | `x-digest-secret` header OR session |
| `POST /api/reply` | Reply generation (Haiku) | Session |
| `POST /api/zoho` | Zoho API proxy actions | Session |
| `GET/POST /api/customers` | Customer CRUD | Session |
| `POST /api/upload` | File upload to Supabase Storage | Session (public routes: adminClient exception) |
| `GET /api/auth/callback` | OAuth PKCE code exchange | None (public) |
