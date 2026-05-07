# Task 001 — Sprint 0: Infrastructure Foundation

> **Type:** feature
> **Version Impact:** major (new project — full scaffold)
> **Priority:** HIGH
> **Recommended Model:** sonnet
> **Status:** DONE
> **Completed:** 2026-04-27
> **Implementation Notes:** Next.js 16 uses Turbopack by default — `build` script uses `--webpack` flag for @ducanh2912/next-pwa compatibility. Next.js 16 renamed `middleware.ts` to `proxy.ts` with exported `proxy` function. Database type required explicit `Relationships: []` per-table to satisfy @supabase/supabase-js@2.104.1 PostgREST 12 generics.

---

## Summary

Bootstrap the WebriQ Central Hub application from zero. No user-facing features. Pure infrastructure: Next.js 16 App Router project scaffold with PWA support, Supabase schema for all Phase 1 tables, Vercel AI SDK + Anthropic SDK wired up, LLM config table seeded, directory structure laid out for all future sprint modules.

Exit condition: project builds cleanly, Supabase migration files exist for all tables, environment variable template is documented, and the `llm_config` table is seeded with Haiku/Sonnet model assignments per orchestration layer.

---

## Requirements

### 1. Next.js Project Scaffold
- Next.js **16.2.4**, App Router, TypeScript strict mode, Tailwind CSS v4, ESLint
- `src/` directory layout (not root-level `app/`)
- Path aliases: `@/*` → `./src/*`
- Clean build with `next build` producing zero TS errors

### 2. PWA Configuration
- Package: `@ducanh2912/next-pwa@10.2.9`
- `public/manifest.json` — WebriQ Central Hub, theme color `#0F172A` (slate-900), display `standalone`
- Service worker generated on build, offline fallback page
- Icons: placeholder 192×192 and 512×512 (SVG-based, no external assets needed at this stage)
- PWA must work on mobile and desktop (installable)

### 3. Directory Structure
Lay out the full module directory structure under `src/` so future sprints have clear homes:

```
src/
  app/                        # Next.js App Router pages
    (auth)/                   # Auth group (login, if needed later)
    (hub)/                    # Main hub layout group
      onboarding/             # Sprint 1 — M1
      pm/                     # Sprint 1–4 — PM dashboard
      dev/                    # Sprint 6 — Developer dashboard
      classification/         # Sprint 2 — M2
      orchestration/          # Sprint 3–5 — M3/M5/M6
      kb/                     # Sprint 6 — M10 LLM Wiki
    api/
      webhooks/               # Sprint 2 — Zoho webhook listener
      classification/         # Sprint 2 — Classification API
      assessment/             # Sprint 3 — Requirements assessment
      plan/                   # Sprint 4 — Plan generation
      execution/              # Sprint 5 — Execution engine
      digest/                 # Sprint 3 — Daily digest
      reply/                  # Sprint 5 — Reply generation
      zoho/                   # Sprint 2/4 — Zoho sync
  components/
    ui/                       # Shared UI primitives
    hub/                      # Hub-specific components
    onboarding/               # Onboarding module components
    pm/                       # PM dashboard components
    dev/                      # Developer dashboard components
    orchestration/            # AI orchestration UI components
  lib/
    supabase/                 # Supabase clients (server, client, admin)
    ai/                       # Vercel AI SDK + Anthropic client setup
    zoho/                     # Zoho API client stubs
    sanity/                   # Sanity client stubs
    github/                   # GitHub API client stubs
    utils/                    # Shared utilities
  types/                      # Global TypeScript type definitions
  hooks/                      # Custom React hooks
  config/                     # App-level config constants
```

### 4. Supabase Schema — Phase 1 Tables

Deploy SQL migration for **all** Phase 1 tables plus `llm_config`. Enable RLS on all tables. Schema design:

#### `customers`
```sql
id              uuid primary key default gen_random_uuid()
customer_id     text unique not null  -- universal key across all systems
company_name    text not null
contact_name    text
contact_email   text
zoho_account_id text                  -- linked Zoho account
status          text default 'active' -- active | inactive | onboarding
created_at      timestamptz default now()
updated_at      timestamptz default now()
```

#### `customer_products`
```sql
id                  uuid primary key default gen_random_uuid()
customer_id         text not null references customers(customer_id)
product_name        text not null  -- StackShift | PublishForge | CiteForge | PipelineForge
product_instance_id text           -- product-specific instance identifier
sanity_project_id   text           -- Sanity CMS project ID for this product instance
zoho_project_id     text           -- linked Zoho Projects project ID
github_repo         text           -- linked GitHub repository
status              text default 'active'
onboarding_complete boolean default false
onboarding_data     jsonb default '{}'
created_at          timestamptz default now()
updated_at          timestamptz default now()
```

#### `classification_records`
```sql
id                uuid primary key default gen_random_uuid()
customer_id       text not null references customers(customer_id)
zoho_ticket_id    text           -- Zoho Desk ticket ID
zoho_task_id      text           -- Zoho Projects task ID
source            text not null  -- zoho_desk | zoho_projects
title             text not null
description       text
task_type         text           -- content_update | settings_change | seo_update | asset_upload | etc.
priority          text           -- low | medium | high | critical
llm_eligible      boolean default false
confidence_score  numeric(5,2)   -- 0.00–100.00
model_used        text           -- model ID string
input_tokens      integer
output_tokens     integer
raw_response      jsonb
status            text default 'pending'  -- pending | reviewed | rejected
reviewed_by       text
reviewed_at       timestamptz
created_at        timestamptz default now()
```

#### `requirements_assessments`
```sql
id                    uuid primary key default gen_random_uuid()
classification_id     uuid not null references classification_records(id)
customer_id           text not null references customers(customer_id)
subtasks              jsonb default '[]'    -- [{title, status: CLEAR|PARTIAL|BLOCKED, notes}]
overall_status        text not null         -- CLEAR | PARTIAL | BLOCKED
clarification_draft   text                  -- auto-generated clarification message
model_used            text
input_tokens          integer
output_tokens         integer
assessment_version    integer default 1     -- increments on re-assessment
created_at            timestamptz default now()
```

#### `implementation_plans`
```sql
id                uuid primary key default gen_random_uuid()
assessment_id     uuid not null references requirements_assessments(id)
customer_id       text not null references customers(customer_id)
steps             jsonb default '[]'        -- [{order, title, description, affected_files}]
affected_files    jsonb default '[]'
apis_involved     jsonb default '[]'
playbooks_used    jsonb default '[]'
confidence_score  numeric(5,2)
risk_flags        jsonb default '[]'
status            text default 'draft'      -- draft | approved | rejected | executing | complete | failed
rejection_reason  text                      -- PLAN_INCOMPLETE | WRONG_APPROACH | SCOPE_EXCEEDED | KNOWLEDGE_GAP | MISCLASSIFICATION
rejected_by       text
approved_by       text
model_used        text
input_tokens      integer
output_tokens     integer
created_at        timestamptz default now()
updated_at        timestamptz default now()
```

#### `execution_records`
```sql
id                  uuid primary key default gen_random_uuid()
plan_id             uuid not null references implementation_plans(id)
customer_id         text not null references customers(customer_id)
status              text default 'pending'   -- pending | running | complete | failed | partial | reverted
pre_action_states   jsonb default '{}'       -- snapshot before execution (for rollback)
post_action_states  jsonb default '{}'
github_pr_url       text
preview_url         text                     -- Vercel/Netlify preview
error_message       text
failure_count       integer default 0        -- feeds circuit breaker
started_at          timestamptz
completed_at        timestamptz
created_at          timestamptz default now()
```

#### `playbooks`
```sql
id             uuid primary key default gen_random_uuid()
customer_id    text                          -- null = internal/shared playbook
task_type      text not null
title          text not null
content        text not null
version        integer default 1
is_active      boolean default true
source         text default 'manual'         -- manual | generated | learned
created_at     timestamptz default now()
updated_at     timestamptz default now()
```

#### `llm_invocation_logs`
```sql
id              uuid primary key default gen_random_uuid()
customer_id     text
orchestration_layer text not null            -- classification | assessment | planning | execution | digest | reply
model_used      text not null
input_tokens    integer not null default 0
output_tokens   integer not null default 0
cost_usd        numeric(10,6)               -- computed at insert
duration_ms     integer
status          text default 'success'       -- success | error | timeout
error_message   text
reference_id    uuid                         -- FK to whichever table triggered this
reference_type  text                         -- classification_records | requirements_assessments | etc.
created_at      timestamptz default now()
```

#### `digest_logs`
```sql
id            uuid primary key default gen_random_uuid()
digest_type   text not null               -- pm | dev
target_user   text                        -- user identifier or 'all'
content       jsonb not null              -- structured digest payload
model_used    text
input_tokens  integer
output_tokens integer
feedback      text                        -- useful | partial | not_useful
feedback_at   timestamptz
digest_date   date not null
created_at    timestamptz default now()
```

#### `llm_config`
```sql
id                    uuid primary key default gen_random_uuid()
orchestration_layer   text unique not null   -- classification | assessment | planning | execution | digest | reply | wiki_lint
model_id              text not null          -- full model ID string
max_tokens            integer default 4096
temperature           numeric(3,2) default 0.3
system_prompt_key     text                   -- reference key for system prompt lookup
is_active             boolean default true
notes                 text
updated_at            timestamptz default now()
```

**Seed `llm_config`** with these rows:

| layer | model_id | max_tokens | temperature |
|-------|----------|------------|-------------|
| classification | claude-haiku-4-5-20251001 | 1024 | 0.1 |
| assessment | claude-sonnet-4-6 | 4096 | 0.3 |
| planning | claude-sonnet-4-6 | 8192 | 0.3 |
| execution | claude-sonnet-4-6 | 8192 | 0.2 |
| digest | claude-haiku-4-5-20251001 | 2048 | 0.4 |
| reply | claude-haiku-4-5-20251001 | 1024 | 0.5 |
| wiki_lint | claude-haiku-4-5-20251001 | 2048 | 0.2 |

### 5. Supabase Client Setup
- Server component client (`createServerClient` from `@supabase/ssr`)
- Browser client (`createBrowserClient`)
- Admin client (service role key — server only)
- Middleware for session refresh (`src/middleware.ts`)

### 6. Vercel AI SDK + Anthropic Client
- `src/lib/ai/anthropic.ts` — Anthropic SDK client, reads `ANTHROPIC_API_KEY`
- `src/lib/ai/model-config.ts` — helper that fetches active model config from `llm_config` table
- `src/lib/ai/logger.ts` — wraps all LLM calls to write to `llm_invocation_logs` automatically

### 7. Environment Variables
`env.example` (not `.env`) documenting all required vars with descriptions — no real values.

### 8. Base Layout + Placeholder Pages
- `src/app/layout.tsx` — root layout, Tailwind, Inter font, metadata for PWA
- `src/app/page.tsx` — minimal hub home (no functionality — just navigation stubs to module routes)
- `src/app/offline/page.tsx` — PWA offline fallback page
- `src/app/(hub)/layout.tsx` — shared hub shell layout (sidebar placeholder)

---

## File Changes

| Action | File | Notes |
|--------|------|-------|
| CREATE | `package.json` | All dependencies pinned |
| CREATE | `next.config.ts` | PWA config via @ducanh2912/next-pwa |
| CREATE | `tsconfig.json` | Strict mode, `@/*` alias |
| CREATE | `tailwind.config.ts` | Tailwind v4 config |
| CREATE | `public/manifest.json` | PWA manifest |
| CREATE | `public/icons/icon-192.svg` | PWA icon placeholder |
| CREATE | `public/icons/icon-512.svg` | PWA icon placeholder |
| CREATE | `public/offline.html` | PWA offline fallback |
| CREATE | `src/app/layout.tsx` | Root layout |
| CREATE | `src/app/page.tsx` | Hub home placeholder |
| CREATE | `src/app/offline/page.tsx` | Offline page |
| CREATE | `src/app/(hub)/layout.tsx` | Hub shell layout |
| CREATE | `src/app/(hub)/onboarding/page.tsx` | Stub |
| CREATE | `src/app/(hub)/pm/page.tsx` | Stub |
| CREATE | `src/app/(hub)/dev/page.tsx` | Stub |
| CREATE | `src/app/(hub)/classification/page.tsx` | Stub |
| CREATE | `src/app/(hub)/orchestration/page.tsx` | Stub |
| CREATE | `src/app/(hub)/kb/page.tsx` | Stub |
| CREATE | `src/lib/supabase/server.ts` | Server Supabase client |
| CREATE | `src/lib/supabase/client.ts` | Browser Supabase client |
| CREATE | `src/lib/supabase/admin.ts` | Admin/service role client |
| CREATE | `src/lib/ai/anthropic.ts` | Anthropic SDK client |
| CREATE | `src/lib/ai/model-config.ts` | LLM config fetcher |
| CREATE | `src/lib/ai/logger.ts` | LLM invocation logger |
| CREATE | `src/lib/utils/index.ts` | cn() and shared utils |
| CREATE | `src/types/database.ts` | DB row types (matches schema) |
| CREATE | `src/types/hub.ts` | Hub domain types |
| CREATE | `src/middleware.ts` | Supabase session middleware |
| CREATE | `src/config/constants.ts` | App constants (routes, etc.) |
| CREATE | `supabase/migrations/001_initial_schema.sql` | All Phase 1 tables |
| CREATE | `supabase/migrations/002_seed_llm_config.sql` | LLM config seed data |
| CREATE | `supabase/migrations/003_rls_policies.sql` | RLS enable + policies |
| CREATE | `env.example` | All env vars documented |
| CREATE | `CLAUDE.md` | Project knowledge file |

---

## Implementation Steps

1. **Scaffold Next.js project**
   - Run: `npx create-next-app@16.2.4 . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --no-git`
   - Verify: `next.config.ts` created, `tsconfig.json` has `@/*` alias, `src/app/` exists

2. **Install dependencies**
   ```bash
   npm install @ducanh2912/next-pwa@10.2.9 @supabase/supabase-js@2.104.1 @supabase/ssr ai@6.0.168 @anthropic-ai/sdk@0.91.1
   npm install -D supabase
   ```

3. **Configure PWA in `next.config.ts`**
   - Wrap Next.js config with `withPWA` from `@ducanh2912/next-pwa`
   - `dest: "public"`, `disable: process.env.NODE_ENV === "development"`
   - Add `cacheOnFrontEndNav: true`, `aggressiveFrontEndNavCaching: true`

4. **Create `public/manifest.json`**
   - name: "WebriQ Central Hub", short_name: "Hub"
   - theme_color: "#0F172A", background_color: "#0F172A"
   - display: "standalone", start_url: "/"
   - icons array pointing to SVG placeholders

5. **Create SVG icon placeholders** (`public/icons/icon-192.svg`, `icon-512.svg`)
   - Simple SVG with "W" lettermark on slate-900 background

6. **Create full `src/` directory structure**
   - Create all stub `page.tsx` files for all module routes
   - Each stub: exports a default component returning a placeholder div

7. **Create Supabase clients** (`src/lib/supabase/`)
   - `server.ts` — `createServerClient` using `cookies()` from `next/headers`
   - `client.ts` — `createBrowserClient` (singleton pattern)
   - `admin.ts` — `createClient` with service role key, server-only guard

8. **Create AI lib files** (`src/lib/ai/`)
   - `anthropic.ts` — `new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })`
   - `model-config.ts` — async `getModelConfig(layer: OrchestrationLayer)` fetches from `llm_config`
   - `logger.ts` — `logLLMInvocation(params)` writes to `llm_invocation_logs`

9. **Create TypeScript types** (`src/types/`)
   - `database.ts` — `Database` namespace with `Row` types for every table
   - `hub.ts` — domain types: `OrchestrationLayer`, `TaskType`, `TaskStatus`, `ClassificationStatus`, etc.

10. **Write Supabase migrations**
    - `001_initial_schema.sql` — all CREATE TABLE statements in dependency order
    - `002_seed_llm_config.sql` — INSERT rows for all 7 orchestration layers
    - `003_rls_policies.sql` — `ALTER TABLE x ENABLE ROW LEVEL SECURITY` for all tables + basic policies

11. **Create root layout and pages**
    - `src/app/layout.tsx` — HTML structure, Inter font, metadata with PWA manifest link
    - `src/app/page.tsx` — Hub home with navigation cards to each module
    - `src/app/offline/page.tsx` — Simple offline message
    - `src/app/(hub)/layout.tsx` — Sidebar shell (placeholder nav links to all modules)

12. **Create middleware** (`src/middleware.ts`)
    - Supabase session refresh on every request
    - Matcher: exclude static files and API routes that don't need auth

13. **Create `env.example`**
    - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`
    - `ANTHROPIC_API_KEY`
    - `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN` (stubs)
    - `NEXT_PUBLIC_APP_URL`

14. **Create `CLAUDE.md`**
    - Tech stack, directory structure, key conventions, Do Not rules

15. **Verify build**
    - `npm run build` must succeed with zero TypeScript errors
    - `npm run lint` must pass

---

## Code Context

### Supabase SSR Pattern (Next.js App Router)

```typescript
// src/lib/supabase/server.ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options))
          } catch {} // Server Component — read-only cookie store is fine
        },
      },
    }
  )
}
```

### PWA Config Pattern (@ducanh2912/next-pwa with Next.js 16)

```typescript
// next.config.ts
import type { NextConfig } from 'next'
import withPWAInit from '@ducanh2912/next-pwa'

const withPWA = withPWAInit({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  fallbacks: { document: '/offline' },
})

const nextConfig: NextConfig = {
  // config here
}

export default withPWA(nextConfig)
```

### LLM Logger Pattern

```typescript
// src/lib/ai/logger.ts — write to llm_invocation_logs after every LLM call
type LogParams = {
  customerId?: string
  layer: OrchestrationLayer
  modelUsed: string
  inputTokens: number
  outputTokens: number
  durationMs: number
  status: 'success' | 'error' | 'timeout'
  errorMessage?: string
  referenceId?: string
  referenceType?: string
}
```

### OrchestrationLayer Union Type

```typescript
// src/types/hub.ts
export type OrchestrationLayer =
  | 'classification'
  | 'assessment'
  | 'planning'
  | 'execution'
  | 'digest'
  | 'reply'
  | 'wiki_lint'
```

---

## Notes for Implementation Agent

- **Sonnet recommended** — this task spans DB schema design (RLS), new architectural patterns, 30+ new files across multiple system layers, and establishes conventions that all future sprints follow. Get it right here.
- **Migration order matters** — `customers` must be created before any table that references `customer_id`. Order: customers → customer_products → classification_records → requirements_assessments → implementation_plans → execution_records → playbooks → llm_invocation_logs → digest_logs → llm_config.
- **`@supabase/ssr` is required** for Next.js App Router (NOT `@supabase/auth-helpers-nextjs` which is deprecated). The server client must use `cookies()` from `next/headers`.
- **`create-next-app` should be run in the project root** since the directory already exists. Use `.` as the directory argument and `--no-git` since git is not yet initialized in the parent directory.
- **Tailwind v4** ships differently from v3 — it uses `@import "tailwindcss"` in CSS rather than `@tailwind base/components/utilities`. The create-next-app scaffold for Next.js 16 handles this automatically.
- **PWA icons**: At this stage, generate simple SVG placeholders. Do not use raster images. The `manifest.json` should reference `/icons/icon-192.svg` and `/icons/icon-512.svg`.
- **Stub pages** must be real Next.js page components (not empty files) to avoid build errors. Minimum: `export default function Page() { return <div>...</div> }`.
- **`env.example`** — never `.env`. Real values never committed. Add `.env*.local` to `.gitignore`.
- **RLS policies at MVP** — enable RLS on all tables. Use permissive policies for now (authenticated users can read/write all rows). This will be tightened per-customer in Phase 2. Don't over-engineer auth at Sprint 0.
- **`CLAUDE.md`** should be created last, after the full structure is known, so it accurately documents the final layout.
- **No Zoho/Sanity/GitHub actual API calls at Sprint 0** — create client stub files (`src/lib/zoho/index.ts`, etc.) that export placeholder functions and TODO comments. The real implementations come in Sprint 2+.
- **Cost tracking**: The `llm_invocation_logs.cost_usd` column should be computed at insert time using a simple rate table. Haiku: $0.80/M input, $4.00/M output. Sonnet: $3.00/M input, $15.00/M output. Hard-code these in `src/config/constants.ts`.

---

## Automation

Automation: manual

---

## Acceptance Criteria

- [ ] `npm run build` succeeds with zero TypeScript errors
- [ ] `npm run lint` passes clean
- [ ] All module route stubs resolve without 404 in dev mode
- [ ] `supabase/migrations/` contains 3 SQL files with correct table definitions
- [ ] `llm_config` seed data covers all 7 orchestration layers
- [ ] `public/manifest.json` is valid PWA manifest
- [ ] PWA installable in Chrome DevTools Application > Manifest (no errors)
- [ ] `env.example` documents all required environment variables
- [ ] `CLAUDE.md` exists and accurately describes the project
