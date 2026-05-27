# STRUCTURE.md — Directory Layout & Organization

> Last mapped: 2026-05-27

## Top-Level Layout

```
webriq-central-hub/
├── src/                    # All application source code
│   ├── app/                # Next.js App Router — routes, layouts, API
│   ├── components/         # Shared UI components
│   ├── config/             # App-wide constants and schemas
│   ├── hooks/              # React client hooks
│   ├── lib/                # Business logic, clients, utilities
│   └── types/              # TypeScript type definitions
├── supabase/
│   └── migrations/         # SQL migrations (001–013), applied in order
├── public/                 # Static assets (sw.js, icons, manifest)
├── _docs/                  # Planning docs, sprint specs, task documents
│   ├── plan/               # Sprint plan + COO/CTO PDFs
│   └── task/               # Task documents (001–NNN format)
├── .planning/              # GSD project planning (new)
│   └── codebase/           # This codebase map
├── next.config.ts          # Next.js + PWA config
├── proxy.ts                # Session refresh (Next.js 16 convention)
├── env.example             # All required env vars (documented)
├── tsconfig.json           # TypeScript config
└── CLAUDE.md               # AI coding instructions
```

## Route Structure (`src/app/`)

```
src/app/
├── (auth)/                 # Auth pages — no sidebar, no auth check
│   ├── layout.tsx
│   ├── actions.ts          # Server Actions: signIn, signUp, signOut
│   ├── callback/page.tsx   # OAuth PKCE code exchange
│   ├── signin/page.tsx
│   └── signup/page.tsx
│
├── (hub)/                  # Auth-gated hub — sidebar + header
│   ├── layout.tsx          # getClaims() guard → redirect /signin
│   ├── classification/page.tsx
│   ├── customers/[customerId]/
│   │   ├── page.tsx        # Server component
│   │   └── client.tsx      # Client component split
│   ├── dev/page.tsx        # Sprint 6 (stub)
│   ├── kb/page.tsx         # Sprint 6 (stub)
│   ├── onboarding/page.tsx # PM: create customer + assign products
│   ├── orchestration/page.tsx  # Main AI pipeline control
│   └── pm/                 # PM dashboard
│       ├── page.tsx
│       ├── customers/page.tsx
│       ├── pipeline/page.tsx
│       ├── settings/page.tsx
│       └── tasks/page.tsx
│
├── (public)/               # Customer-facing — no sidebar, no auth
│   ├── layout.tsx
│   └── onboarding/[customerId]/
│       ├── page.tsx        # Server: loads customer + products
│       ├── client.tsx      # Client: product selection UI
│       └── [productSlug]/page.tsx  # Schema-driven form
│
├── api/                    # REST API routes
│   ├── assessment/route.ts
│   ├── auth/callback/route.ts
│   ├── classification/route.ts
│   ├── customers/route.ts
│   │   └── [customerId]/products/[productName]/onboarding/route.ts
│   ├── digest/route.ts
│   ├── execution/route.ts
│   ├── plan/route.ts
│   ├── reply/route.ts
│   ├── upload/route.ts
│   ├── webhooks/route.ts
│   └── zoho/route.ts
│
├── offline/page.tsx        # PWA offline fallback
├── page.tsx                # Hub home — module navigation cards
├── layout.tsx              # Root layout (fonts, metadata, PWA manifest)
└── globals.css             # Tailwind v4 + design tokens
```

## Library Structure (`src/lib/`)

```
src/lib/
├── ai/
│   ├── anthropic.ts        # Direct Anthropic SDK client (non-streaming)
│   ├── assess.ts           # assessTask() — Sonnet requirements assessment
│   ├── classify.ts         # classifyTask() — Haiku classification
│   ├── context-chain.ts    # buildContextChain() — assemble customer+task context
│   ├── digest.ts           # generateDigest() — Haiku daily digest
│   ├── logger.ts           # logLLMInvocation() — write to llm_invocation_logs
│   ├── model-config.ts     # getModel(layer), getModelConfig(layer) — DB-driven, 5-min cache
│   ├── plan.ts             # generatePlan() — Sonnet plan generation
│   └── providers.ts        # getLanguageModel(provider, modelId) — AI SDK factory
├── customers/
│   └── generate-id.ts      # Generate WRQ-CLIENT-XXXX IDs
├── github/                 # Stub — Sprint 5+
├── sanity/                 # Stub — Sprint 5+
├── supabase/
│   ├── admin.ts            # adminClient — service role, server-only
│   ├── client.ts           # createClient() — browser singleton
│   └── server.ts           # createClient() — async, uses cookies()
├── zoho/
│   └── index.ts            # Zoho API: token refresh, project/task CRUD, Cliq
└── utils.ts                # cn(), formatDate(), formatRelativeTime(), truncate()
```

## Component Structure (`src/components/`)

```
src/components/
├── ui/                     # shadcn/ui primitives (auto-generated)
│   ├── button.tsx
│   ├── card.tsx
│   ├── dialog.tsx
│   ├── input.tsx
│   ├── select.tsx
│   └── ... (other shadcn components)
├── auth/
│   └── theme-toggle.tsx
├── hub/                    # Hub-wide layout components
│   ├── aurora-background.tsx    # Animated background
│   ├── hub-header.tsx
│   ├── hub-sidebar.tsx
│   └── pm-tabs/            # PM dashboard tab components
│       ├── clients-tab.tsx
│       ├── home-tab.tsx
│       ├── pipeline-tab.tsx
│       ├── settings-tab.tsx
│       ├── shared.tsx       # Shared PM tab utilities
│       └── tasks-tab.tsx
├── onboarding/             # Form engine system
│   ├── file-upload.tsx
│   ├── form-engine.tsx      # Main schema-driven form orchestrator
│   ├── form-field.tsx
│   ├── form-section.tsx
│   ├── product-selector.tsx
│   ├── progress-bar.tsx
│   └── save-indicator.tsx
├── pm/                     # PM-specific components
└── orchestration/          # AI orchestration UI components
```

## Config Structure (`src/config/`)

```
src/config/
├── constants.ts            # ROUTES, LLM_PRICING, computeLLMCost()
└── onboarding-schemas.ts   # Per-product FormSchema definitions (StackShift, PublishForge, etc.)
```

## Types Structure (`src/types/`)

```
src/types/
├── database.ts             # Full Database type for all Supabase tables (with Relationships[])
├── hub.ts                  # Domain types: OrchestrationLayer, TaskType, LLMEligibility, UserRole, etc.
└── onboarding.ts           # FormSchema, FormSection, FormField, OnboardingData types
```

## Hooks (`src/hooks/`)

```
src/hooks/
├── use-auto-save.ts        # Debounced PATCH to save onboarding_data (2s debounce)
├── use-file-upload.ts      # Upload to Supabase Storage via /api/upload
├── use-onboarding-form.ts  # Form state, field validation, completion % calculation
└── use-pm-settings.ts      # PM settings state management
```

## Naming Conventions

| Pattern | Convention |
|---------|-----------|
| Files | `kebab-case.ts` / `kebab-case.tsx` |
| Components | `PascalCase` (React), exported as default |
| Hooks | `use-kebab-case.ts`, exported as `useKebabCase` |
| API routes | `route.ts` (Next.js App Router convention) |
| Types | `PascalCase` (interfaces/types) |
| Constants | `SCREAMING_SNAKE_CASE` |
| Functions | `camelCase` |
| `customer_id` | Always TEXT, format `WRQ-CLIENT-XXXX` |
| DB status enums | UPPERCASE for plan/priority, lowercase for task/classification |

## Key File Locations

| What you need | Where to find it |
|---------------|-----------------|
| Add a new product form | `src/config/onboarding-schemas.ts` → add section array, register in `SCHEMAS` map |
| New API route | `src/app/api/[name]/route.ts` |
| New hub page | `src/app/(hub)/[name]/page.tsx` |
| New shadcn component | `npx shadcn add <component>` → lands in `src/components/ui/` |
| DB schema changes | New file in `supabase/migrations/` (sequential numbering) |
| New orchestration layer | Add to `OrchestrationLayer` type in `src/types/hub.ts`, add row to `llm_config` |
