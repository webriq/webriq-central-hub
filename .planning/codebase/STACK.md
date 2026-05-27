# STACK.md — Technology Stack

> Last mapped: 2026-05-27

## Language & Runtime

- **Language:** TypeScript 5 (strict mode)
- **Runtime:** Node.js (Next.js App Router server components + API routes)
- **Package Manager:** pnpm (required — never npm or yarn)

## Framework

- **Next.js 16.2.4** — App Router, React Server Components, Server Actions
  - Build flag: `--webpack` (required for Next.js 16; baked into `pnpm build`)
  - Session refresh: `proxy.ts` (not `middleware.ts`) — Next.js 16 convention
  - Server Actions body limit: 10 MB (`experimental.serverActions.bodySizeLimit`)
- **React 19.2.4** — with full RSC (React Server Components) support
- **PWA:** `@ducanh2912/next-pwa@10.2.9` — service worker in `public/sw.js`, offline fallback at `/offline`, disabled in dev

## Styling

- **Tailwind CSS v4** — `@import "tailwindcss"` in CSS (not old `@tailwind` directives)
- **shadcn/ui 4.5.0** — component primitives in `src/components/ui/` (Tailwind v4 compatible)
- **tw-animate-css** — additional animation utilities
- **class-variance-authority (CVA)** — variant-based component styling
- **clsx + tailwind-merge** — conditional class merging via `cn()` in `src/lib/utils.ts`
- **framer-motion v12** — page/component animations

## AI / LLM

- **Vercel AI SDK `ai@6.0.168`** — provider-agnostic streaming + text generation
  - `@ai-sdk/anthropic@^3.0.71` — Anthropic provider adapter
  - `@ai-sdk/openai@^3.0.53` — OpenAI provider adapter
- **`@anthropic-ai/sdk@0.91.1`** — direct SDK for non-streaming calls
- **Model config is DB-driven** — `llm_config` table controls provider + model per orchestration layer; 5-minute in-memory cache
- **Default models:**
  - Haiku (`claude-haiku-4-5-20251001`) → classification, digest, reply
  - Sonnet (`claude-sonnet-4-6`) → assessment, planning, execution
- **All LLM calls log via** `logLLMInvocation()` in `src/lib/ai/logger.ts`

## Database

- **Supabase (PostgreSQL)** via `@supabase/supabase-js@2.104.1` + `@supabase/ssr@0.10.2`
- Three client types:
  - **Server:** `createClient()` from `@/lib/supabase/server` — async, uses `cookies()`
  - **Browser:** `createClient()` from `@/lib/supabase/client` — singleton pattern
  - **Admin:** `adminClient` from `@/lib/supabase/admin` — service role, server-only, bypasses RLS
- 13 migrations in `supabase/migrations/` (001–013)
- **pg_cron + pg_net** enabled (migration 012) for daily digest scheduling

## Validation

- **Zod v4.3.6** — schema validation, TypeScript inference

## Icons & UI Primitives

- **lucide-react v1.11.0** — icon library
- **`@base-ui/react@^1.4.1`** — low-level accessible UI primitives (used alongside shadcn)

## Configuration Files

| File | Purpose |
|------|---------|
| `next.config.ts` | Next.js config + PWA setup |
| `proxy.ts` | Session refresh (Next.js 16 proxy convention) |
| `tsconfig.json` | TypeScript strict config, `@/` path alias |
| `env.example` | All required env vars documented |
| `postcss.config.*` | Tailwind v4 PostCSS |
| `eslint.config.*` | ESLint with `eslint-config-next` |

## Dev Tooling

- **ESLint 9** + `eslint-config-next@16.2.4`
- **TypeScript** — `npx tsc --noEmit` for type-check (no test runner configured)
- **Supabase CLI** (`supabase@^2.98.2` dev dep) — migration management

## Key Constraints

- Never hardcode model IDs — always fetch from `llm_config` table via `getModel(layer)`
- Never use `style={{}}` inline styles — always Tailwind classes (exception: CSS custom properties, canvas/SVG dimensions)
- Never construct Tailwind class names dynamically — use static lookup maps or ternaries with complete class strings
- `window.location` only safe inside callbacks/effects (SSR crash risk)
- `"use server"` directive only for React Server Actions — never on utility modules
