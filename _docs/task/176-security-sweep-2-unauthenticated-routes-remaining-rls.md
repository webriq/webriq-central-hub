# 176: Security Sweep #2 — #1–#3: Unauthenticated adminClient Routes + Remaining Permissive RLS

**Created:** 2026-07-22
**Priority:** CRITICAL
**Type:** security
**Recommended Tier:** balanced
**Status:** Completed

---

## Overview

A second, deeper OWASP sweep was requested after task 174/175's fixes were applied, covering the ~75 API routes not reviewed in the first pass (customer/product/project/asset CRUD, dev/notifications/reply routes, v2 API) plus every RLS policy not touched by migration 084. It surfaced a more severe pattern than the first sweep: several data-mutating routes call `adminClient` (which bypasses RLS entirely) with **no authentication check at all**, and four of the nine tables migration 003 originally flagged as "Phase 1 — tighten in Phase 2" were missed by migration 084's tightening pass. This doc covers findings #1–#3 of the second sweep, fixed first per user direction ("Handle #1-3 first"); findings #4–#9 are tracked, not yet implemented, in task 177.

1. **`customer_assets` / `customer_asset_folders`** (migrations 021/057/064/067/068) carried a blanket `auth.role() = 'authenticated'` policy for all operations, by explicit prior design ("Enforcement is application-level, not RLS" — documented in the migration 057/064/067/068 comments themselves, task 118). `customer_assets.type` includes `'credential'`, storing literal secret values in the `fields` jsonb column. Since the app's `canSeeAsset()`/`canSeeFolder()` role/user-scoping runs only in the Next.js route handlers, any authenticated user — including a default `client` self-signup — could read, insert, modify, or delete every customer's stored credentials and files by calling the Supabase REST API directly with their own JWT, completely bypassing the app's permission model.
2. **Multiple customer/product/project routes had zero authentication check** while writing via `adminClient`, meaning literally anyone — no account required — could call them: `POST /api/customers`, `PATCH /api/customers/[customerId]`, `POST`/`DELETE /api/customers/[customerId]/products`, `GET`/`POST /api/customers/[customerId]/projects` (the POST also triggers a real `createZohoProject()` API call), `PATCH /api/customers/[customerId]/projects/[projectId]` (triggers a real Zoho rename call).
3. **`customer_products`, `playbooks`, `llm_invocation_logs`, `digest_logs`** were four of migration 003's original nine Phase-1-permissive tables that migration 084 (task 174) didn't cover — still `using (true) with check (true)` for any authenticated role.

## Requirements

- [x] Add `pm`/`admin`/`super_admin` auth+role checks to `POST /api/customers`, `PATCH /api/customers/[customerId]`, `POST`/`DELETE /api/customers/[customerId]/products`, `PATCH /api/customers/[customerId]/projects/[projectId]`.
- [x] Add staff-read (admin/super_admin/pm/developer/hr/marketing) + write (admin/super_admin/pm) role checks to `GET`/`POST /api/customers/[customerId]/projects`.
- [x] Tighten `customer_products` RLS to the same role-matrix pattern as `customers` (migration 084): staff read, client-read-own, pm/admin/super_admin write.
- [x] Tighten `playbooks`, `llm_invocation_logs`, `digest_logs` RLS to staff-read-only (confirmed via `grep` that all writes to these three tables go through `adminClient` in `src/lib/ai/plan.ts`, `src/lib/ai/logger.ts`, `src/lib/ai/digest.ts`, and the digest-feedback route — no authenticated-write policy is needed since `adminClient` bypasses RLS regardless).
- [x] Replace `customer_assets`/`customer_asset_folders`'s blanket `auth.role() = 'authenticated'` policy with row-level SELECT/UPDATE/DELETE policies mirroring the app's existing `canSeeAsset()`/`canSeeFolder()` logic exactly, closing the direct-REST bypass while preserving current app behavior. INSERT stays open to any authenticated user (unchanged) — a not-yet-existing row has no permissions to check yet; this matches current POST route behavior and is not a regression.

## Out of Scope / Must-Not-Change

- First-sweep findings — tasks 174/175.
- Second-sweep findings #4–#9 (customer_products PATCH route still lacking an explicit auth check — now backstopped by this task's RLS tightening but not fixed at the route level; reopen-onboarding, primary-contact, reply/send missing role checks; customer-assets POST missing ownership/role check; customers GET routes missing explicit auth checks) — tracked in task 177, deliberately deferred per user's "Handle #1-3 first" direction.
- Any change to who may *create* which `customer_assets` type (e.g., restricting `credential`-type creation to staff) — the INSERT policy stays open to match current app behavior; narrowing that is part of #8 in task 177, a separate design decision.
- `storage.objects` RLS for the `customer-assets` bucket (migration 057) — already correctly role-scoped (staff-only read/write) and was not touched; only the `customer_assets`/`customer_asset_folders` *table* policies (metadata + credential values, not file bytes) needed fixing.

## Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/customers/route.ts` | Modify | Added auth + `pm`/`admin`/`super_admin` role check to POST |
| `src/app/api/customers/[customerId]/route.ts` | Modify | Added auth + role check to PATCH |
| `src/app/api/customers/[customerId]/products/route.ts` | Modify | Added shared `requireStaff()` helper; gated POST and DELETE |
| `src/app/api/customers/[customerId]/projects/route.ts` | Modify | Added shared `requireRole()` helper; GET uses staff-read set, POST uses staff-write set |
| `src/app/api/customers/[customerId]/projects/[projectId]/route.ts` | Modify | Added auth + role check to PATCH |
| `supabase/migrations/085_tighten_remaining_rls.sql` | New | Role-matrix RLS for `customer_products`; staff-read-only for `playbooks`/`llm_invocation_logs`/`digest_logs`; row-level `canSeeAsset()`/`canSeeFolder()`-mirroring policies for `customer_assets`/`customer_asset_folders` |

## Implementation Notes

### What Changed
- The five route fixes follow the same auth+role pattern established in task 174 (`adminClient.from("profiles").select("role")...`, `403` if not allowed) — `products/route.ts` and `projects/route.ts` each got a small local helper (`requireStaff()` / `requireRole(allowed)`) since POST/DELETE/GET all needed the same check inline.
- `projects/route.ts`'s GET uses a broader `STAFF_READ_ROLES` set (admin/super_admin/pm/developer/hr/marketing) than its POST's `STAFF_WRITE_ROLES` (admin/super_admin/pm) — mirroring the read/write split already established for the `customers` table itself in migration 084, since this is a read-only listing endpoint (customer profile page's Projects tab) rather than a mutating action.
- Migration 085's `customer_assets`/`customer_asset_folders` policies use the exact same boolean structure as the JS `canSeeAsset()`/`canSeeFolder()` functions: `admin`/`super_admin` see everything; otherwise visible if both `allowed_roles` and `allowed_user_ids` are null/empty (unrestricted-by-default, an intentional existing app behavior, not something this task changed); otherwise visible if the caller's role is in `allowed_roles` or `auth.uid()` is in `allowed_user_ids`. `allowed_roles` is `text[]`, `allowed_user_ids` is `uuid[]` (confirmed via migrations 057/064/068), so `auth.uid() = any(allowed_user_ids)` needed no type cast.
- `customer_products`, `playbooks`, `llm_invocation_logs`, `digest_logs` writes were confirmed server-only (`adminClient`) via `grep -n "adminClient\|createClient"` across `src/lib/ai/logger.ts`, `src/lib/ai/digest.ts`, `src/lib/ai/plan.ts`, and the digest-feedback route, before deciding to omit an authenticated-write RLS policy for the latter three (matches the existing `llm_config` precedent: "write-protected from regular users — only service role can write").

### Deviations From Plan
- None. All three findings (#1–#3) were fixed exactly as scoped; findings #4–#9 were explicitly deferred per user instruction, not silently skipped.

### Verification Run
- `npx tsc --noEmit` — PASS, no errors, after all five route edits.
- Migration file written and reviewed but **not applied by the assistant** — user applies migrations directly per this project's workflow.
- No live browser verification (server-side auth/RLS changes only, no UI surface touched).
