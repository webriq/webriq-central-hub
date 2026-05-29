# Required Tokens & API Keys: Classify → Execute → Reply Loop

**Date:** 2026-05-29  
**Scope:** Full orchestration pipeline — Classification (M2) → Execution (M6) → Reply Generation (M8) → Send via Cliq

---

## Overview

This document lists every environment variable consumed across the four stages of the full automation loop. Keys are grouped by criticality — what blocks the pipeline vs. what gracefully degrades.

---

## The 5 Must-Have Keys

These are hard blockers. The pipeline will throw or return 500 without them.

| # | Env Var | Consumed By | Why It's Required |
|---|---------|-------------|-------------------|
| 1 | `ANTHROPIC_API_KEY` | `@ai-sdk/anthropic` (all AI layers) | Classification (Haiku), execution plan-to-mutations (Sonnet), reply draft (Haiku). No LLM calls run without it. |
| 2 | `SUPABASE_SECRET_KEY` | `adminClient` (`src/lib/supabase/admin.ts`) | All server-side DB reads/writes: `llm_config` lookup, `classification_records`, `execution_records`, `reply_drafts`, `llm_invocation_logs`, `customers`, `customer_products`. |
| 3 | `NEXT_PUBLIC_SUPABASE_URL` | `adminClient`, `createClient`, `createBrowserClient` | Connection endpoint for Supabase. |
| 4 | `SANITY_API_TOKEN` | `getSanityClient()` → `src/lib/sanity/index.ts` | Required for Sanity execution path (CONTENT_UPDATE, BLOG_PUBLISH, ASSET_UPLOAD tasks). Must have editor-level access. Throws `"SANITY_API_TOKEN is not set"` if absent during execution. |
| 5 | `GITHUB_TOKEN` | `githubHeaders()` → `src/lib/github/index.ts` | Required for GitHub PR execution path (CODE_CHANGE_MINOR tasks). Fine-grained PAT with repo read/write scope. Throws `"GITHUB_TOKEN is not set"` if absent during execution. |

---

## The 4 Optional Keys (Graceful Degradation)

These silently skip if unset — no errors, no pipeline disruption.

| # | Env Var | Consumed By | Purpose |
|---|---------|-------------|---------|
| 6 | `ZOHO_CLIQ_WEBHOOK_URL` | `sendCliqNotification()` in `src/lib/zoho/index.ts` | PM Cliq channel for: high-priority classification alerts, execution-complete notifications, reply delivery. |
| 7 | `ZOHO_CLIQ_WEBHOOK_TOKEN` | `sendCliqNotification()` | Auth token appended as `?zapikey=` to Cliq webhook URL. |
| 8 | `ZOHO_CLIQ_DEV_WEBHOOK_URL` | `sendCliqNotification(message, "dev")` | Separate Cliq channel for Dev digest notifications. |
| 9 | `OPENAI_API_KEY` | `@ai-sdk/openai` adapter | Only consumed if any `llm_config` row has `provider = 'openai'`. Switch per-layer via DB — no code change required. |

---

## The 4 Supporting Keys (Infrastructure)

Assumed already configured. Not called directly in the execution pipeline but required for adjacent features.

| # | Env Var | Purpose |
|---|---------|---------|
| 10 | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Browser client + SSR session reads (`createClient`, `createBrowserClient`). Required for auth + all UI data fetching. |
| 11 | `ZOHO_CLIENT_ID` / `ZOHO_CLIENT_SECRET` / `ZOHO_REFRESH_TOKEN` | Zoho OAuth 2.0 token exchange (`getZohoAccessToken()`). Required for Zoho Projects sync, dev dashboard task lists, and self-assignment. Gracefully no-ops if absent — API returns empty arrays. |
| 12 | `ZOHO_PORTAL_ID` | Numeric Zoho Projects portal ID — used in all Zoho API calls (`/api/v3/portal/{id}/...`). |
| 13 | `NEXT_PUBLIC_ZOHO_PORTAL_NAME` | Client-safe slug for building "Open in Zoho" URLs. |
| 14 | `ZOHO_WEBHOOK_SECRET` | HMAC-SHA256 validation for incoming Zoho webhooks (`/api/webhooks`). |
| 15 | `DIGEST_SECRET` | Shared secret between Supabase pg_cron and `/api/digest` route for cron-triggered digest generation. |
| 16 | `REPLY_SECRET` | Shared secret for internal `/api/reply` POST calls (non-blocking trigger from execution route). |

---

## Pipeline Trace: What Calls What

### Classification

```
POST /api/classification
  → classifyTask()
    → getModelConfig("classification")  → llm_config (Supabase: SECRET_KEY)
    → getModel("classification")        → ANTHROPIC_API_KEY
    → generateObject() [Claude Haiku]   → ANTHROPIC_API_KEY
    → logLLMInvocation()                → Supabase: SECRET_KEY
    → sendCliqNotification()            → ZOHO_CLIQ_WEBHOOK_URL + TOKEN (optional)
```

### Execution

```
POST /api/execution
  → Supabase auth                      → PUBLIC_SUPABASE_URL + PUBLISHABLE_KEY
  → adminClient reads                  → SUPABASE_SECRET_KEY
  → buildContextChain()                → SUPABASE_SECRET_KEY

  [Sanity path — CONTENT_UPDATE]
    → executeSanityPlan(projectId)
      → getSanityClient(projectId)     → SANITY_API_TOKEN
      → getModel("execution")          → ANTHROPIC_API_KEY
      → generateObject() [Sonnet]      → ANTHROPIC_API_KEY
      → Sanity transaction commit      → SANITY_API_TOKEN

  [GitHub path — CODE_CHANGE_MINOR]
    → executeGitHubPlan(repo)
      → githubHeaders()                → GITHUB_TOKEN
      → getDefaultBranch()             → GITHUB_TOKEN
      → getFilesContent()              → GITHUB_TOKEN
      → getModel("execution")          → ANTHROPIC_API_KEY
      → generateObject() [Sonnet]      → ANTHROPIC_API_KEY
      → createBranch()                 → GITHUB_TOKEN
      → commitFiles()                  → GITHUB_TOKEN
      → createPR()                     → GITHUB_TOKEN

  Post-execution (non-blocking)
    → sendCliqNotification()           → ZOHO_CLIQ_WEBHOOK_URL + TOKEN (optional)
    → generateReplyDraft()             → (see Reply Generation)
    → logLLMInvocation()              → SUPABASE_SECRET_KEY
    → circuit breaker check            → SUPABASE_SECRET_KEY
```

### Reply Generation

```
generateReplyDraft() or POST /api/reply
  → adminClient (customer tone)        → SUPABASE_SECRET_KEY
  → buildContextChain()                → SUPABASE_SECRET_KEY
  → getModel("reply")                  → ANTHROPIC_API_KEY
  → generateText() [Claude Haiku]      → ANTHROPIC_API_KEY
  → Insert reply_drafts                → SUPABASE_SECRET_KEY
  → logLLMInvocation()                 → SUPABASE_SECRET_KEY
```

### Send Reply

```
POST /api/reply/[id]/send
  → Supabase auth + adminClient read   → PUBLIC_SUPABASE_URL + PUBLISHABLE_KEY + SECRET_KEY
  → Update reply_drafts (SENT + diff)  → SUPABASE_SECRET_KEY
  → sendCliqNotification(content, "pm") → ZOHO_CLIQ_WEBHOOK_URL + TOKEN (optional)
```

---

## Quick Start: Minimum .env.local

For the classify → execute → reply loop to work end-to-end with Sanity execution:

```bash
# Supabase — hard blockers
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SECRET_KEY=your-service-role-key

# AI — hard blocker
ANTHROPIC_API_KEY=sk-ant-...

# Sanity — required for Content Update execution
SANITY_API_TOKEN=sk...

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

For GitHub PR execution, also add:

```bash
GITHUB_TOKEN=github_pat_...
```

For Cliq notifications (optional):

```bash
ZOHO_CLIQ_WEBHOOK_URL=https://cliq.zoho.com/api/v2/channelsbyname/pm-digest/message
ZOHO_CLIQ_WEBHOOK_TOKEN=1000.xxx
```

---

## DB Requirement

One active `llm_config` row per orchestration layer must exist in Supabase (seeded by migration `002_seed_llm_config.sql`):

| `orchestration_layer` | `model_id` | `provider` |
|-----------------------|------------|------------|
| `classification` | `claude-haiku-4-5-20251001` | `anthropic` |
| `assessment` | `claude-sonnet-4-6` | `anthropic` |
| `plan` | `claude-sonnet-4-6` | `anthropic` |
| `execution` | `claude-sonnet-4-6` | `anthropic` |
| `reply` | `claude-haiku-4-5-20251001` | `anthropic` |
| `digest` | `claude-haiku-4-5-20251001` | `anthropic` |

All rows must have `is_active = true`.

---

## Testing Connections

Run the connection test script to verify all keys are valid:

```bash
npx tsx scripts/test-connections.ts
```

---

*Document generated for internal use. WebriQ © 2026*
