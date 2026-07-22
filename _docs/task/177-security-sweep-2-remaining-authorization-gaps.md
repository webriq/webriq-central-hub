# 177: Security Sweep #2 — #4–#9: Remaining Authorization Gaps

**Created:** 2026-07-22
**Priority:** HIGH
**Type:** security
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Remaining findings from the second OWASP sweep (see task 176 for #1–#3, already fixed). These six items are all authenticated-but-not-authorized gaps or defense-in-depth omissions — lower severity than #1–#3 (which allowed fully unauthenticated or cross-tenant access), but still real broken-access-control issues (OWASP A01:2021). Deliberately deferred per user direction ("Handle #1-3 first"); not yet implemented.

4. `PATCH /api/customers/[customerId]/products/[productName]` has no `if (!user)` check at all. It writes via the session-scoped `supabase` client, so it's now backstopped by migration 085's tightened `customer_products` RLS (task 176) — an anonymous or under-privileged request will be rejected at the DB layer — but the route itself should still check auth/role explicitly, both for defense-in-depth and to return a proper `401`/`403` instead of a raw Postgres RLS error.
5. `POST /api/customers/[customerId]/reopen-onboarding` checks `if (!user)` but no role. Any authenticated user, including `client`, can reset **any** customer's status back to `onboarding` and flip every product's `onboarding_complete` to false, reopening that customer's public onboarding form.
6. `GET /api/customers/[customerId]/primary-contact` checks `if (!user)` but no role, and uses `adminClient` (bypasses RLS). Any authenticated user can read any customer's primary contact name/email/phone.
7. `POST /api/reply/[id]/send` checks `if (!user)` but no role. Any authenticated user can mark any customer's AI-generated reply draft as `SENT`.
8. `POST /api/customers/[customerId]/assets` checks `if (!user)` but no role or ownership check on which `customer_id` an asset — including a `credential`-type asset — may be attached to.
9. `GET /api/customers` and `GET /api/customers/[customerId]` have no explicit auth check in route code. Functionally safe today (session client + migration 084's `to authenticated`-only RLS policies), but inconsistent with the rest of the codebase's convention of checking auth explicitly, and a defense-in-depth gap if RLS is ever loosened again.

## Requirements

- [ ] Add an explicit `if (!user)` check to `PATCH /api/customers/[customerId]/products/[productName]` (role check optional given RLS now enforces `pm`/`admin`/`super_admin` at the DB layer — but returning a proper `401` instead of a raw RLS/Postgres error is still worth doing).
- [ ] Add a `pm`/`admin`/`super_admin` role check to `POST /api/customers/[customerId]/reopen-onboarding`.
- [ ] Add a role check to `GET /api/customers/[customerId]/primary-contact` — likely staff-only (matching `contacts_staff_read` RLS's admin/super_admin/pm/developer set per the existing code comment), or scoped to the caller's own `customer_id` for `client` role.
- [ ] Add a `pm`/`admin`/`super_admin` role check to `POST /api/reply/[id]/send`.
- [ ] Add a role and/or ownership check to `POST /api/customers/[customerId]/assets` — needs a design decision: should any authenticated user still be able to create non-credential assets (matching today's behavior), with only `credential`-type creation restricted to staff? Or should all asset creation require staff? Surface via `AskUserQuestion` before implementing, since this changes existing behavior for a working feature (Storage/KB "Add Asset" modal, tasks 138–140).
- [ ] Add explicit `if (!user)` checks to `GET /api/customers` and `GET /api/customers/[customerId]` for defense-in-depth consistency with the rest of the codebase, even though RLS already covers them.

## Out of Scope / Must-Not-Change

- Findings #1–#3 (tasks 174/176) and first-sweep findings (tasks 174/175) — already resolved.
- Any change to `customer_assets`/`customer_asset_folders` RLS itself — task 176 already closed the direct-REST-bypass; this task only addresses the app-route-level POST authorization gap (#8), which is a narrower, separate design question.
- `role-access.ts`'s fail-open default — explicitly decided "leave as-is" in task 175; not being reopened here.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/customers/[customerId]/products/[productName]/route.ts` | Modify | Add explicit auth check to PATCH |
| `src/app/api/customers/[customerId]/reopen-onboarding/route.ts` | Modify | Add `pm`/`admin`/`super_admin` role check to POST |
| `src/app/api/customers/[customerId]/primary-contact/route.ts` | Modify | Add role check (staff-only, or client-own-scope) to GET |
| `src/app/api/reply/[id]/send/route.ts` | Modify | Add `pm`/`admin`/`super_admin` role check to POST |
| `src/app/api/customers/[customerId]/assets/route.ts` | Modify | Add role/ownership check to POST — pending `AskUserQuestion` design decision |
| `src/app/api/customers/route.ts` | Modify | Add explicit `if (!user)` check to GET |
| `src/app/api/customers/[customerId]/route.ts` | Modify | Add explicit `if (!user)` check to GET |

## Implementation Steps

1. Resolve the #8 design question via `AskUserQuestion` (staff-only asset creation vs. staff-only for `credential` type vs. leave open) before touching `assets/route.ts`.
2. Add the five straightforward role/auth checks (#4, #5, #6, #7, #9) following the established pattern from tasks 174/176 (`adminClient.from("profiles").select("role")`, `403` if not allowed).
3. `npx tsc --noEmit` after each file.
4. No migration changes expected — all six items are route-level fixes only.

## Acceptance Criteria

- [ ] All six routes reject unauthorized callers with the correct role/ownership boundary.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] No regression to legitimate staff/PM workflows that currently rely on these routes (reopen-onboarding from a customer profile page, reply-send from the orchestration UI, asset creation from the Storage/KB "Add Asset" modal).

## Verification

```bash
npx tsc --noEmit
```

## Compatibility Touchpoints

- `#8`'s resolution may change existing UI behavior (Storage/KB "Add Asset" modal, tasks 138–140) if asset creation is narrowed to staff-only — needs explicit confirmation before implementation, not just before merge.

## Implementation Notes

Not started.
