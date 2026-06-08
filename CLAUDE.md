# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project
Internal operations platform for PMs and Developers. Sits above Zoho, Sanity, GitHub, and Supabase — it does not replace Zoho. Synthesizes data into a single AI-powered operational layer.

## Commands

```bash
pnpm dev              # start dev server (http://localhost:3000)
pnpm build            # production build — uses --webpack flag (required for Next.js 16)
pnpm lint             # eslint
```

No test runner is configured. Verification is done via `npx tsc --noEmit` (TypeScript check) and browser-based acceptance testing.

## Stack
- **Framework:** Next.js 16.2.4, App Router, React 19, TypeScript strict
- **Styling:** Tailwind CSS v4 + shadcn/ui 4.5.0 — uses `@import "tailwindcss"` in CSS (not old `@tailwind` directives)
- **UI Components:** shadcn/ui (Tailwind v4 compatible), lucide-react for icons, framer-motion for animations
- **Database:** Supabase (PostgreSQL) — `@supabase/supabase-js@2.104.1` + `@supabase/ssr@0.10.2`
- **AI:** Vercel AI SDK `ai@6.0.168` — provider-agnostic; `@ai-sdk/anthropic` + `@ai-sdk/openai` for providers
- **Models (default):** Claude Haiku (`claude-haiku-4-5-20251001`) for classification/digest/reply; Claude Sonnet (`claude-sonnet-4-6`) for assessment/planning/execution. OpenAI models switchable per-layer via `llm_config` table.
- **PWA:** `@ducanh2912/next-pwa@10.2.9` — configured in `next.config.ts`
- **Package manager:** pnpm — always use `pnpm`, never `npm` or `yarn`
- **Utilities:** `clsx`, `tailwind-merge`, `zod@4.3.6`

## Environment Variables
See `env.example` for all required vars. Key ones:
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — public, safe for client
- `SUPABASE_SECRET_KEY` — server-only, bypasses RLS
- `ANTHROPIC_API_KEY` — server-only (for direct SDK calls)
- `OPENAI_API_KEY` — server-only (if switching any layer to OpenAI)
- `VERCEL_AI_GATEWAY_URL`, `VERCEL_AI_GATEWAY_TOKEN` — optional proxy for caching + unified billing; `llm_invocation_logs` in Supabase is the source of truth for per-customer cost attribution
- `ZOHO_PORTAL_ID` — numeric Zoho Projects portal ID for API calls (server-only)
- `NEXT_PUBLIC_ZOHO_PORTAL_NAME` — Zoho portal name/slug for client-side URL construction (`projects.zoho.com/portal/{name}/`)

## Route Group Architecture

Three route groups, each with its own layout:

| Group | Layout | Auth? | Use |
|-------|---------|-------|-----|
| `(hub)` | Hub sidebar + auth guard (`getClaims()` → redirect `/signin`) | Yes | All PM/internal pages |
| `(auth)` | Minimal, no sidebar | No | `/signin`, `/signup` — Server Actions in `(auth)/actions.ts` |
| `(public)` | Minimal, no sidebar | No | Customer-facing pages (e.g. `/onboarding/[customerId]`) |

Route groups are invisible to the URL — `/onboarding/[customerId]` resolves to `(public)/onboarding/[customerId]/page.tsx`.

## Project Structure
```
src/
  app/
    (hub)/              Hub shell — auth-gated, sidebar visible
      dashboard/        Role-aware home + sub-routes (PM and Dev)
        page.tsx        Server component — fetches role, renders PMDashboard or DevDashboard
        _components/    pm-dashboard.tsx, dev-dashboard.tsx (client components)
        customers/      PM customers list
        tasks/          Role-aware tasks (PM = classification_records; Dev = Zoho tasks)
        pipeline/       PM pipeline kanban
        chat/           AI Chat (under development)
        timelogs/       Dev time logs
        settings/       PM settings
      customers/
        [customerId]/   Customer profile pages
        new/            PM: create new customer + assign products
      classification/   Sprint 2 — M2
      orchestration/    Sprints 3–5 — M3/M5/M6/M8
      kb/               Sprint 6 — M10: LLM Wiki
    (auth)/             Auth pages — no sidebar, no auth check
      auth/
        login/          Login page (/auth/login)
        signup/         Registration page (/auth/signup)
      callback/         OAuth PKCE callback — stays at /callback (Zoho OAuth registered here)
      actions.ts        Server Actions for auth (signIn, signUp, signOut)
      layout.tsx
    (public)/           Customer-facing — no sidebar, no auth check
      onboarding/[customerId]/   Login-free onboarding form
      layout.tsx
    api/
      auth/callback/    OAuth PKCE code exchange → Supabase session (Sprint 1.1)
      customers/        CRUD for customer records + onboarding PATCH
      upload/           File upload endpoint (brand assets, etc.)
      webhooks/         Sprint 2 — Zoho webhook listener
      classification/   Sprint 2
      assessment/       Sprint 3
      plan/             Sprint 4
      execution/        Sprint 5
      digest/           Sprint 3
      reply/            Sprint 5
      zoho/             Sprints 2/4
    offline/            PWA offline fallback
    layout.tsx          Root layout (fonts, metadata, PWA manifest)
    page.tsx            Hub home — module navigation cards
  components/
    ui/                 shadcn/ui primitives (auto-generated by `npx shadcn add`)
    hub/                Hub-wide components (sidebar, nav)
    onboarding/         Form engine system — see Onboarding Architecture below
    pm/                 PM dashboard components
    dev/                Developer dashboard
    orchestration/      AI orchestration UI
  lib/
    supabase/
      server.ts         createClient() — server components, uses cookies()
      client.ts         createClient() — browser, singleton
      admin.ts          adminClient — service role, server-only
    ai/
      anthropic.ts      Direct Anthropic SDK client (for non-streaming calls)
      providers.ts      getLanguageModel(provider, modelId) — AI SDK provider factory
      model-config.ts   getModelConfig(layer), getModel(layer) — DB-driven, 5-min cache
      logger.ts         logLLMInvocation() — writes to llm_invocation_logs
      context-chain.ts  buildContextChain(classificationId) — assembles customer+task context string for Sonnet prompts (Sprint 3+)
      assess.ts         assessTask({ classificationId, customerId }) — Sonnet, CLEAR/PARTIAL/BLOCKED subtask breakdown, inserts to requirements_assessments
      digest.ts         generateDigest(type) — Haiku, compiles PM/Dev digest from live DB data, inserts to digest_logs
    auth/
      role-access.ts    isRouteAllowed(pathname, role) — route permission table (no side effects)
      require-role.ts   requireRole(pathname) — server guard; redirects to /auth/login or /dashboard if unauthorized
    zoho/               Sprint 2+; `syncTaskToZoho(input)` creates Zoho task on plan approval; `updateZohoTaskStatus()` for close/reopen sync; `createZohoProject()` for onboarding; `sendCliqNotification()` for Cliq alerts
    sanity/             Stub — Sprint 5+
    github/             Stub — Sprint 5+
    utils.ts            cn(), formatDate(), formatRelativeTime(), truncate()
  types/
    database.ts         Full Database type for all Supabase tables (with Relationships[])
    hub.ts              Domain types: OrchestrationLayer, TaskType, LLMEligibility, UserRole, etc.
    onboarding.ts       FormSchema, FormSection, FormField, OnboardingData types
  config/
    constants.ts        ROUTES (DASHBOARD, DASHBOARD_*, CUSTOMERS_NEW, AUTH_LOGIN, AUTH_SIGNUP, ORCHESTRATION, KB), LLM_PRICING, computeLLMCost()
    onboarding-schemas.ts  Per-product form definitions (StackShift, PublishForge, etc.)
  hooks/
    use-auto-save.ts    Debounced PATCH to save onboarding_data; accepts completionPercentage
    use-onboarding-form.ts  Form state, field validation, completion % calculation
    use-file-upload.ts  Upload to Supabase Storage via /api/upload
  proxy.ts              Supabase session refresh — Next.js 16 "proxy" convention
supabase/
  migrations/           Applied in order; 005 adds onboarding storage bucket + policies; 007 adds hub_users table + auto-insert trigger; 011 adds raw_response to requirements_assessments; 012 enables pg_cron + pg_net for daily digest
_docs/
  plan/                 Sprint plan + COO/CTO spec docs + design documents
  task/                 Task documents (001–NNN format) — superpowers `/task` skill outputs go here, NOT in `docs/`
```

## Onboarding Form Architecture

The customer onboarding form (`(public)/onboarding/[customerId]`) is schema-driven:

1. **`src/config/onboarding-schemas.ts`** — defines `FormSchema` per product (sections → fields → conditional logic). `condition: { field, value }` controls field visibility.
2. **`FormEngine`** (`src/components/onboarding/form-engine.tsx`) — reads schema, manages section navigation, wires `useOnboardingForm` + `useAutoSave`. Renders a completion screen (`isCompleted` state) when the customer clicks "Complete Onboarding" on the last section.
3. **`useAutoSave`** — debounced (2s), sends `{ data, completedPercentage }` to `PATCH /api/customers/[customerId]/products/[productName]/onboarding`. Sets `onboarding_complete: true` in DB when `completedPercentage >= 100`.
4. **Auto-save API** uses `adminClient` (not `createClient()`) because customers have no session — this is the documented exception to the "no adminClient for reads" rule.

When adding a new product form: add a section array in `onboarding-schemas.ts`, register it in the `SCHEMAS` map, and the engine picks it up automatically.

## Key Conventions
- **`customer_id` (text) is the universal key** across all systems. Never use UUID for cross-system references. Format: `WRQ-CLIENT-XXXX` (generated by `src/lib/customers/generate-id.ts`).
- **`customer_projects` table** holds project-level metadata (`zoho_project_id`, `sanity_project_id`, `github_repo`, `dedicated_developers`, `project_type`, `project_name`) keyed by `customer_id`. These columns were removed from `customer_products` in migration 024. A customer can have multiple projects. `project_type` is one of: `Content Site | Ecommerce (B2C) | Ecommerce (B2B) | Custom App`.
- **`llm_eligible` is a 3-state TEXT**: `YES | NO | HUMAN_ONLY` — not a boolean. HUMAN_ONLY = never enters automation pipeline.
- **Task priority casing**: `CRITICAL | HIGH | NORMAL | LOW` (uppercase, NORMAL not MEDIUM).
- **Plan status**: `PENDING_APPROVAL | APPROVED | REJECTED | EXECUTING | COMPLETE | FAILED` (uppercase).
- **`implementation_plans.zoho_task_id`** — set automatically on plan approval when Zoho is configured; used for Zoho deep links and bidirectional status sync.
- **`implementation_plans.direct_zoho_edit`** — set `true` by the inbound webhook when Zoho sends a status change on a plan we pushed; shows a warning in the orchestration UI.
- **`classification_records.status`** includes pipeline values (`pending`, `planning`, `approved`) and PM action values (`open`, `on_hold`, `active`, `review`, `closed`) — migration 013 expanded the constraint.
- **Zoho task push is non-blocking** — Zoho failure on plan approval does not fail the approve action; `zoho_task_id` stays `null` if Zoho is unconfigured or the push fails.
- **Playbook status**: `ACTIVE | STALE | ARCHIVED`.
- **Supabase server client** = `createClient()` from `@/lib/supabase/server` (async, uses `cookies()`)
- **Supabase browser client** = `createClient()` from `@/lib/supabase/client` (singleton)
- **Admin client** = `adminClient` from `@/lib/supabase/admin` — server-only, bypasses RLS
- **All LLM calls must log** via `logLLMInvocation()` from `@/lib/ai/logger` — cost attribution from day one
- **Model config is DB-driven** — use `getModel(layer)` from `@/lib/ai/model-config` for AI SDK calls; `getModelConfig(layer)` for metadata. Never hard-code model IDs.
- **`buildContextChain(classificationId)`** from `@/lib/ai/context-chain` — call before every Sonnet prompt in Sprints 3–5. Returns a structured string with customer + task context. Never rebuild this inline.
- **Assessment trigger is PM-manual** — no auto-trigger after classification. PM clicks "Run Assessment" in `/orchestration` page.
- **Digest auth pattern** — `/api/digest` accepts either `x-digest-secret` header (pg_cron) or a valid user session. Secret must match `DIGEST_SECRET` env var.
- **`DIGEST_SECRET`** env var required for pg_cron integration (Sprint 3+). See `env.example`.
- **`ZOHO_CLIQ_DEV_WEBHOOK_URL`** env var — separate Cliq channel for dev digest notifications. Optional; silently skips if unset (Sprint 3+).
- **Multi-provider**: `provider` column in `llm_config` controls `anthropic | openai`. Switch per-layer via DB with no code changes.
- **shadcn components** are added via `npx shadcn add <component>` — they land in `src/components/ui/`
- **`src/lib/utils.ts`** (flat file, not directory) is the cn() / utils home — shadcn imports from here
- **Page-scoped UI** — inline small components into the page file rather than creating separate component files. Only extract to `src/components/` when a component is shared across multiple pages.
- **Styling: always Tailwind CSS classes, never `style={{}}`** — use `className` with Tailwind utilities. Use `cn()` from `@/lib/utils` for conditional classes. For dynamic single-property values (e.g. computed colors), use a static lookup map or ternary that produces complete class strings (e.g. `score >= 80 ? "text-green-600" : "text-red-600"`), never construct class names dynamically at runtime (Tailwind tree-shakes unknown strings). `style={{}}` is only acceptable for values that are genuinely not expressible as Tailwind utilities (e.g. CSS custom properties, canvas/SVG dimensions, or third-party component overrides).
- **Prefer Tailwind scale classes over arbitrary values** — for spacing, sizing, and layout use named scale values (e.g. `py-6.5`, `w-14`, `h-10`, `mt-3`) instead of arbitrary bracket syntax (e.g. `py-[26px]`, `w-[56px]`). Only use arbitrary values when no Tailwind scale step maps to the required dimension.
- **`window.location`** is only safe inside callbacks/effects, never at component render time (SSR crash).
- **`"use server"`** is only for React Server Actions (client-callable functions). Do not add it to utility modules or API route helpers.

## Do Not
- Never `npm install` or `yarn add` — use `pnpm add` / `pnpm install`
- Never import `@/lib/supabase/admin` in Client Components
- Never hard-code model IDs in orchestration code — always fetch from `llm_config` table
- Never write `.env` files — use `env.example` as template, actual secrets in `.env.local`
- Never skip the `logLLMInvocation()` call after any LLM invocation
- Never bypass RLS with `adminClient` for regular reads — use it only for writes that need service-level access. **Exception:** `(public)` routes where customers have no session (onboarding page + onboarding PATCH API) — document the exception inline with a comment.
- Never store credentials (DNS, email tool access) in the Hub — D4 from tech spec: products expose via MCP/Tools only
- Never use the old `middleware.ts` convention — Next.js 16 requires `proxy.ts` with exported `proxy` function
- Never run `pnpm build` without the `--webpack` flag — it is baked into the `build` script but do not remove it
- **Never run git commands** (`git add`, `git commit`, `git push`, `git reset`, etc.) — the user manages all version control manually
- **Never use Claude Opus** — use `claude-sonnet-4-6` for all deep reasoning, complex tasks, planning, and orchestration. Haiku for fast/cheap layers. Opus is off-limits.
- **Task docs belong in `_docs/task/`** — superpowers skills (`/task`, `/implement`, writing-plans) must write task documents to `_docs/task/NNN-name.md`, never to `docs/`. Design/spec artifacts go to `_docs/plan/`.

## Sprint Plan
Phase 0 (done): Infrastructure
Phase 1: MVP — 6 sprints, ~12 weeks
  Sprint 1 (done): Customer creation + onboarding (M1) — PM dashboard, customer profiles, login-free onboarding form
  Sprint 1.1 (done): Zoho OAuth — "Sign in with Zoho" via Supabase custom OIDC provider (`custom:zoho`); `hub_users` table with role assignment; `/api/auth/callback` PKCE handler
  Sprint 2: Classification engine + Zoho webhook (M2, M7 partial) + Cliq notifications
  Sprint 3: Requirements assessment + daily digest (M3, M4)
  Sprint 4: Plan generation + full Zoho sync (M5, M7 complete)
  Sprint 5: Execution engine + reply generation (M6, M8)
  Sprint 6: Developer dashboard + time tracking + KB seed (M9, M10)

Full plan: `_docs/plan/WebriQ-Central-Hub-Sprint-Plan.md`
Technical spec: `_docs/plan/` (COO/CTO PDF docs)
