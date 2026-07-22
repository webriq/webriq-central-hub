# 174: Security Sweep #1 — Critical/High: Pipeline RLS + Missing Authorization

**Created:** 2026-07-22
**Priority:** CRITICAL
**Type:** security
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

First full OWASP sweep of the app (all API routes, auth/session layer, RLS policies, AI orchestration pipeline, Zoho/Sanity/GitHub integrations, dependencies). This doc covers the Critical/High findings (#1–#5 of the sweep); Medium/Low findings (#6–#11) are tracked separately in `_docs/task/175-security-sweep-1-medium-low-webhook-upload-deps-onboarding-id.md`.

Root cause across all five findings: several tables and API routes were built assuming "authenticated" meant "trusted staff," when the `profiles.role` enum actually spans `admin | super_admin | hr | pm | developer | marketing | client` — including `client`, the default role assigned to any self-registered signup (`handle_new_user()` trigger). Nothing stopped a `client`-role account from reaching internal pipeline data or endpoints.

1. **`customers`, `classification_records`, `requirements_assessments`, `implementation_plans`, `execution_records`** carried migration 003's Phase-1 policy — `using (true) with check (true)` for any authenticated role — explicitly flagged "tighten in Phase 2" but never revisited. Migration 026 (v2 RLS) tightened `profiles`/`tasks`/`projects`/`tickets`/`hr.*` but never touched these five. Any signed-up user, including `client`, could read and write every customer's data directly via the Supabase REST API, bypassing every Next.js route.
2. `/api/execution`, `/api/orchestrate`, `/api/assessment`, `/api/plan` (POST + PATCH approve/reject) checked only `if (!user)` — no role check — so any authenticated user could trigger Sanity/GitHub execution, approve/reject implementation plans, or run paid LLM assessments.
3. `/api/orchestrate` trusted client-supplied `project.sanity_project_id` / `github_repo` / `vercel_project_id` instead of re-deriving them from the DB row for `project.id` — since `executeSanityPlan()` uses one shared `SANITY_GLOBAL_TOKEN` with write access, a caller could redirect the AI executor's writes to an arbitrary Sanity project ID.
4. Next.js was on `16.2.4`, with 6 HIGH-severity advisories including a Middleware/Proxy bypass — directly relevant since `src/proxy.ts` is this app's entire session-refresh/auth-guard layer.
5. `generateCustomerId()` produced only 4 hex characters (65,536 possible values, no rate limiting) — the sole guard on the public, unauthenticated onboarding PATCH/upload endpoints, brute-forceable in seconds.

A follow-up user request during this same implementation pass ("Include the super admin and marketing role") — `super_admin` and `marketing` are real values in the `profiles.role` enum (`src/types/database.ts:506`) that the stale `CLAUDE.md` doc omitted — expanded the RLS migration below: `super_admin` added everywhere `admin` appears (strict superset), `marketing` added read-only to `customers` only (matching the existing customer-assets-content precedent), explicitly excluded from the AI pipeline tables and routes per user decision.

## Requirements

- [x] Replace the Phase-1 blanket RLS policies on `customers`, `classification_records`, `requirements_assessments`, `implementation_plans`, `execution_records` with a role-matrix pattern (staff read: admin/super_admin/pm/developer[/hr/marketing for `customers` only]; write: admin/super_admin/pm; client read-own on `customers`).
- [x] Add `pm`/`admin`/`super_admin` role checks to `/api/assessment` (POST), `/api/execution` (POST), `/api/plan` (POST + PATCH), `/api/orchestrate` (POST).
- [x] Fix `/api/orchestrate` to re-derive `sanity_project_id`/`dataset`/`vercel_project_id`/`github_repo` from the `projects` table using the DB-verified `project.id`, never trusting those fields from the request body.
- [x] Upgrade Next.js to a patched version (≥16.2.6).
- [x] Widen `generateCustomerId()` from 4 to 8 hex characters in both `src/lib/customers/generate-id.ts` and the duplicate generator in `src/app/api/admin/zoho-import/customers/route.ts`; update UI copy referencing the old 4-char format.

## Out of Scope / Must-Not-Change

- Medium/Low findings from the same sweep (#6–#11) — tracked in task 175.
- `role-access.ts`'s fail-open default for unlisted page routes — flagged in the sweep but not part of #1–#5.
- Any RLS policy not already flagged as Phase-1-permissive in migration 003 (the remaining four — `customer_products`, `playbooks`, `llm_invocation_logs`, `digest_logs` — were missed by this pass and only caught in the second sweep; see task 176).

## Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/084_tighten_pipeline_rls.sql` | New | Role-matrix RLS for the five Phase-1-permissive pipeline tables, including `super_admin`/`marketing` per follow-up request |
| `src/app/api/assessment/route.ts` | Modify | Added `pm`/`admin`/`super_admin` role check on POST |
| `src/app/api/execution/route.ts` | Modify | Added `pm`/`admin`/`super_admin` role check on POST |
| `src/app/api/plan/route.ts` | Modify | Added role check to POST and PATCH (approve/reject) |
| `src/app/api/orchestrate/route.ts` | Modify | Added role check; re-derives project config from DB instead of trusting request body |
| `package.json` | Modify | `next` `16.2.4` → `16.2.11` |
| `src/lib/customers/generate-id.ts` | Modify | Customer ID suffix widened 4 → 8 hex chars (fallback 6 → 10) |
| `src/app/api/admin/zoho-import/customers/route.ts` | Modify | Duplicate ID generator (`generateCustomerIdAdmin`) widened to match |
| `src/app/(hub)/customers/onboard/_content.tsx`, `src/app/v2/(hub)/customers/onboard/_content.tsx`, `src/app/v2/(hub)/portfolio-tracker/new/_content.tsx` | Modify | `WRQ-CUST-XXXX` copy updated to `WRQ-CUST-XXXXXXXX` |

## Implementation Notes

### What Changed
- `migration 084` replaces `using (true) with check (true)` policies with `get_my_role() in (...)` checks calling the existing `get_my_role()`/`get_my_customer_id()` security-definer helpers (migration 026) — no new helper functions introduced, matching established convention.
- Role checks in the four pipeline routes follow the existing codebase pattern seen in `/api/classification/[id]/assign`: fetch `profiles.role` via `adminClient`, `403` if not in the allowed set.
- `/api/orchestrate`'s `PostSchema` was narrowed to `project: z.object({ id: z.string().uuid() })` only — `sanity_project_id`/`github_repo`/etc. are no longer accepted from the client at all; the route now does its own `projects` table lookup by `project.id` and builds the `OrchestrationProject` object server-side.
- Dependency-vulnerability fixes for `next` were verified via `pnpm audit --prod` (0 Next.js advisories remaining post-upgrade, high/critical count dropped 17 → 10 at this stage; the rest were closed in task 175).
- Customer ID widening changes only the *generation* logic — no DB schema change, no length constraint existed (`customer_id` is plain `text`), so shorter pre-existing IDs continue to work unchanged.

### Deviations From Plan
- None from the original 5-item plan. The `super_admin`/`marketing` role expansion was an explicit user request made mid-implementation, before the migration was applied to the database, and is folded into this same migration file rather than a separate one.

### Verification Run
- `npx tsc --noEmit` — PASS, no errors, after every edit in this batch.
- `pnpm audit --prod` — confirmed 0 remaining Next.js advisories post-upgrade.
- No live browser verification (API/RLS/dependency changes, not UI) — user applied the migration directly to the database and confirmed ("Done applying. Let's proceed.") before the follow-up sweep began.
- Migration file was written and reviewed but **not run by the assistant** — applying migrations is a user action per this project's workflow; user confirmed application before work continued.
