# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project
Internal operations platform for PMs and Developers. Sits above Zoho, Sanity, GitHub, and Supabase — it does not replace Zoho. Synthesizes data into a single AI-powered operational layer.

## Commands
`pnpm build` must run with `--webpack` (required for Next.js 16). No test runner is configured — verify with `npx tsc --noEmit` and browser-based acceptance testing; pure-logic checks under `_docs/task/*.check.ts` run with `npx tsx`.

## Stack
Model per layer comes from the `llm_config` table. Tailwind v4 uses `@import "tailwindcss"`, not `@tailwind` directives. Recharts is always imported via `next/dynamic` with `ssr: false`. pnpm only.

## Environment Variables
See `env.example` for the full list. `llm_invocation_logs` is the source of truth for per-customer LLM cost.

## Route Groups

| Group | Layout | Auth? | Use |
|-------|---------|-------|-----|
| `(hub)` | Sidebar + auth guard (`getClaims()` → redirect) | Yes | All PM/internal pages |
| `(auth)` | Minimal | No | Login/signup, Server Actions in `(auth)/actions.ts`; OAuth callback stays at `/callback` (Zoho registered there) |
| `(public)` | Minimal | No | Customer-facing (e.g. `/onboarding/[customerId]`) |

`src/app/v2/` is a parallel v2 build at `/v2/*` with its own `(auth)`/`(hub)` groups; it uses `V2_ROUTES` and the `profiles` table (not `hub_users`).

## Onboarding Form
Schema-driven: `src/config/onboarding-schemas.ts` defines `FormSchema` per product (register it in `SCHEMAS`); `FormEngine` renders it; `useAutoSave` (2s debounce) PATCHes `/api/customers/[customerId]/products/[productName]/onboarding`, which uses `adminClient` because customers have no session (documented exception).

## Core Conventions
- **`customer_id` (text, `WRQ-CLIENT-XXXX`) is the universal cross-system key.** Never use UUIDs for cross-system references.
- **`projects` table:** use `row.name` (not `project_name`) and `external_project_id` (not `zoho_project_id`). `project_id` and `tasks.display_id` / `issues.display_id` are display-only IDs; the UUID `id` is the routing key everywhere except `/v2/portfolio-tracker/[projectId]` and `/v2/projects/[projectId]/tasks/[taskId]` (display IDs). Details: `_docs/context/projects.md`.
- **`profiles`** extends `auth.users`; `role` enum `admin|hr|pm|developer|client` (note `developer`, no `pending`). Auto-created by `handle_new_user()` with `role='client'`. Some code also uses `super_admin` and `marketing` roles.
- **RLS helpers:** always call `get_my_role()` / `get_my_customer_id()` in new policies; never inline that logic.
- **`hr` schema:** query with `.schema("hr").from(table)`.
- **Task listings/counts must go through `excludingChecklist()`** (`src/lib/tasks/exclude-checklist.ts`) — checklist rows (`kind='checklist'`) are never tasks.
- **Enums:** `llm_eligible` = `YES|NO|HUMAN_ONLY` (text, not boolean); task priority `CRITICAL|HIGH|NORMAL|LOW`; plan status `PENDING_APPROVAL|APPROVED|REJECTED|EXECUTING|COMPLETE|FAILED`; playbook `ACTIVE|STALE|ARCHIVED`; `classification_records.source` `portal|email|manual|recurring|hub_manual` (+ legacy `zoho_desk|zoho_projects`).
- **Zoho push is non-blocking:** a Zoho failure never fails plan approval; `zoho_task_id` stays null.
- **Pagination:** any `.select()` that could exceed 1000 rows must loop with `.range(from, from + 999)` until a short page — PostgREST truncates silently. Example: `zoho-import/timelogs/route.ts`.
- **LLM calls:** always log via `logLLMInvocation()`; get models via `getModel(layer)`; never hard-code model IDs; call `buildContextChain(classificationId)` before Sonnet prompts.
- **Assessment is PM-manual** (Run Assessment in `/orchestration`).
- **Cron routes** accept `x-cron-secret` (= `CRONJOB_SECRET_KEY`) or a session. StackShift cron routes must use `authorizeCronOrStaff()` (`cron-auth.ts`). pg_cron reads URL/secret from Supabase Vault — never hardcode in migrations.
- **Migrations that can legitimately abort** (guarded operator scripts) go in `supabase/manual/`, never `supabase/migrations/`.
- **Many recent migrations are "written, not applied"** — code must degrade gracefully (wrap new-column/RPC access; e.g. retry on Postgres `42703`).
- **Uploads above ~4.5 MB must not go through a Route Handler** (Vercel 413s first). Use the browser-direct signed-URL pattern (sign → XHR PUT to Storage → register). Details: `_docs/context/uploads.md`.
- **Remote MCP server** (`src/app/api/mcp/route.ts`): any new `server.registerTool(...)` must update `_docs/mcp-tools.md` in the same change.
- **Generated output under `_docs/task/*/out/`** is git-ignored and may contain real data — never commit it.
- **shadcn** components via `npx shadcn add`; only `button.tsx` exists today.
- **Page-scoped UI** stays in the page file; extract to `src/components/` only when shared.
- **Styling:** Tailwind classes only, no `style={{}}` (except CSS vars/canvas/third-party overrides). Use `cn()`, static class lookups (never runtime-built class names), and scale values over arbitrary `[..px]` values.
- **`window.location`** only inside callbacks/effects.
- **`"use server"`** only for Server Actions.

## UI Polish Conventions
**Adopted:** visible hover states (`transition-colors hover:...`); explicit empty states (icon + one line + primary action); loading states on every async action; `aria-label` on icon-only buttons, visible focus rings, color never the sole indicator; `<button>` not `<div onClick>`; lucide icons, no emoji; `cva` for real variants.

**Do not "fix" existing code toward these — they lost to shipped conventions:**
- v2 does **not** use `bg-background`-style tokens or `dark:` variants. Theme via an `isDark` prop + `cn()` with explicit light/dark class pairs.
- Forms use controlled `useState` + inline `fetch` + inline errors — no `react-hook-form` (not installed). Use `toast.*` (sonner) only for transient confirmations.
- Badges/pills/progress are hand-rolled `rounded-full` / `text-[10-11px]` pills, not shadcn `Badge`/`Progress`.

## Do Not
- Never `npm install` / `yarn add` — use `pnpm`
- Never import `@/lib/supabase/admin` in Client Components
- Never use `adminClient` for regular reads (writes needing service access only; documented exceptions: `(public)` onboarding, signed StackShift webhooks)
- Never write `.env` files — `env.example` is the template, secrets in `.env.local`
- Never skip `logLLMInvocation()` after an LLM call
- Never store credentials (DNS, email tool access) in the Hub
- Never use `middleware.ts` — Next.js 16 uses `proxy.ts` with exported `proxy`
- Never remove `--webpack` from the build script
- **Never run git commands** — the user manages version control
- **Never use Claude Opus** — Sonnet for deep work, Haiku for fast layers
- **Task docs go in `_docs/task/NNN-name.md`**, design/spec in `_docs/plan/` — never `docs/`
- Never add a second recipient picker — extend `src/components/share-picker/`

## Feature Reference
Read the matching file before working in that area. Each holds the full rules, edge cases, and migration status.

| Area | File |
|------|------|
| Projects table, display IDs, Files tab deep links, classification sidebar nav | `_docs/context/projects.md` |
| Programme: checklist-as-tasks (`tasks.kind`), kickoff, delay notes | `_docs/context/programme.md` |
| StackShift direct support API, Desk poll, parity gate, step-down, outbox | `_docs/context/stackshift-support.md` |
| StackShift order webhook, contact validation endpoint | `_docs/context/stackshift-orders.md` |
| Zoho Desk imports: issues, issue_comments, accounts, KB, ticket custom fields | `_docs/context/zoho-desk-import.md` |
| Inbound email: inline images (IMAP), attachments | `_docs/context/email-ingest.md` |
| Uploads: large bodies, signed URLs, presentation types, attachment indicator | `_docs/context/uploads.md` |
| Personal Drive, Share Picker, Notes sharing | `_docs/context/sharing.md` |
| Wiki history, revisions, drafts, presence | `_docs/context/wiki.md` |
| Timer breaks, Activity stream, period edits | `_docs/context/timer.md` |

Sprint plan: `_docs/plan/WebriQ-Central-Hub-Sprint-Plan.md`. Technical spec: `_docs/plan/`.
