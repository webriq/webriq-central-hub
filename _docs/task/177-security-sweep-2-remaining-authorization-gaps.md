# 177: Security Sweep #2 — #4–#9: Remaining Authorization Gaps

**Created:** 2026-07-22
**Priority:** HIGH
**Type:** security
**Recommended Tier:** balanced
**Status:** Completed (2026-09-17) — marked complete at the user's explicit request; browser/API acceptance testing not run this session. See Quality Gate Notes.

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

### What Changed

This task was planned 2026-07-22 and sat untouched for two months, so before touching anything I re-verified all 7 files against the live codebase rather than trusting the doc's original findings — the codebase moved substantially in the interim (roles, RLS, and call sites all changed). All 6 findings were confirmed still present exactly as described. Two deviations from the doc's original suggested fix emerged from that re-verification (see Deviations below); everything else matches the plan.

- **#4** `PATCH /api/customers/[customerId]/products/[productName]` — added `if (!user)` → `401`. No role check added (RLS already enforces pm/admin/super_admin at the DB layer per the doc's own note).
- **#5** `POST /api/customers/[customerId]/reopen-onboarding` — added a `pm`/`admin`/`super_admin` role check (same `adminClient.from("profiles").select("role")` + array-includes pattern already used by `customers/route.ts` POST and `customers/[customerId]/route.ts` PATCH).
- **#6** `GET /api/customers/[customerId]/primary-contact` — added a role check, but widened to `admin`/`super_admin`/`pm`/`developer`/`marketing` rather than the doc's originally-suggested `contacts_staff_read`-matching set (`admin`/`super_admin`/`pm`/`developer`). The file's own comment documents `marketing` as an intentional caller (New Project intake's existing-company pre-fill) precisely because `marketing` isn't covered by that RLS policy — excluding it would have broken that live feature. Verified `CREATE_ROLES = ["admin", "super_admin", "marketing", "pm"]` in `onboarding/projects/route.ts` confirms `marketing` is a real, current caller of that flow.
- **#7** `POST /api/reply/[id]/send` — added a `pm`/`admin`/`super_admin` role check. Confirmed its one live caller (`orchestration/_content.tsx`) already only renders behind `role-access.ts`'s `/orchestration` → `["pm", "admin"]` gate, so this is consistent, not a new restriction on any reachable path.
- **#8** `POST /api/customers/[customerId]/assets` — added an `admin`/`super_admin`/`pm`/`marketing` role check (reusing the file's own existing `getRequesterRole` helper already used by its `GET`/`DELETE` handlers) for **all** asset types, per the `AskUserQuestion` decision below.
- **#9** `GET /api/customers` and `GET /api/customers/[customerId]` — added explicit `if (!user)` → `401` checks to both (defense-in-depth; RLS already covers this per the doc).

### Files Changed
- `src/app/api/customers/[customerId]/products/[productName]/route.ts` — #4
- `src/app/api/customers/[customerId]/reopen-onboarding/route.ts` — #5
- `src/app/api/customers/[customerId]/primary-contact/route.ts` — #6
- `src/app/api/reply/[id]/send/route.ts` — #7
- `src/app/api/customers/[customerId]/assets/route.ts` — #8
- `src/app/api/customers/route.ts` — #9 (GET)
- `src/app/api/customers/[customerId]/route.ts` — #9 (GET)

### Deviations From Plan

- **#6's role list widened to include `marketing`** — see above. Minor deviation, same severity/spirit as the plan, corrects for codebase drift since the doc was written.
- **#8's design question resolved via `AskUserQuestion`** (per the task's own Implementation Step 1) as: restrict **all** asset types (file/link/credential) to `admin`/`super_admin`/`pm`/`marketing`, not just `credential`-type as the doc's more hesitant framing considered. Research before asking found the page hosting the "Add Asset" modal (`/customers/[customerId]`) has no role gate of its own (falls through `role-access.ts`'s fail-open default), and that `type: "file"` assets were already effectively staff-gated (every caller uploads via `/upload/sign` first) while `type: "link"`/`type: "credential"` had zero gating anywhere — credential-type assets can hold passwords/API keys, making that the more sensitive half of the gap. The user picked the broadest closure (Recommended option) after seeing this context.
- **Legacy `_onboarding-wizard.tsx` (v1) has looser page-level role gating** (`canOpenWizard = role !== "developer"` in `_onboarding-detail.tsx`, i.e. every role except `developer` can open it, membership-gating notwithstanding) than the current-generation `onboarding-workspace/_onboarding-wizard-v2.tsx` (`WIZARD_ROLES = ["admin", "super_admin", "marketing", "pm"]`). This legacy wizard is one of the seven call sites of `POST /assets` (business facts, outcome target, migration checklist, content map, signoff, HTML mockup uploads). The #8 fix does **not** accommodate that laxity — if an `hr` or `client` role could technically reach an editable step in the legacy wizard today, they will now get a `403` on asset creation. This is treated as intentional, not a regression: no product documentation or role convention anywhere in this codebase supports `hr`/`client` having asset-write access to a customer's onboarding wizard, and closing incidental gaps exactly like this is this task's purpose. Flagged here for visibility rather than silently narrowed.
- `_hub_(OLD)/customers/[customerId]/client.tsx` and `_hub_(OLD)/orchestration/_content.tsx` also call the affected routes but are dead code — `_hub_(OLD)` is an underscore-prefixed directory, which Next.js excludes from routing entirely. No live path reaches them; not a regression concern.

### Verification Run
- `npx tsc --noEmit` - PASS (no errors)
- `pnpm lint` - PASS (2 pre-existing unrelated warnings in `_checklist-tab.tsx`)
- Browser/API acceptance (each route actually rejecting an unauthorized role, and the three named legitimate workflows still working) - SKIPPED (not run this session)

## Quality Gate Notes

### Result
PASS

### Standards Review
- `git diff --name-only` against the 7 files listed in Implementation Notes confirms no extraneous files touched — scope matches exactly.
- Every diff is a small, additive guard clause inserted at the top of its handler (2–8 lines each); no restructuring, no unrelated edits, no dead/commented-out code.
- Naming matches this codebase's own existing convention exactly rather than inventing a new style: `callerProfile` (already used identically in `customers/route.ts` POST and `customers/[customerId]/route.ts` PATCH, both pre-existing) reused verbatim in the three new inline checks; `myRole` (already the `assets/route.ts` file's own established local variable name, via its existing `getRequesterRole` helper) reused for #8 rather than introducing a second convention in the same file.
- No broad `any`, no deep nesting — every check is a flat early-return guard clause.
- Errors handled intentionally and consistently: `401` for missing auth, `403` for insufficient role, matching the exact response shape (`{ error: string }`) every sibling route in this codebase already uses.
- No secrets, credentials, or debug logging introduced.
- One observation, not a required fix: the `adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle()` one-liner is now inline-duplicated across 5 routes in this file set (was already duplicated across 2 routes — `customers/route.ts` POST, `customers/[customerId]/route.ts` PATCH — before this task). Extracting a shared `getCallerRole()` helper would remove that duplication, but the task doc's own Implementation Steps explicitly said to follow "the established pattern from tasks 174/176" — i.e. this inline duplication is the deliberate existing convention, not an oversight introduced here. Refactoring it now would touch already-shipped routes outside this task's Proposed File Changes / Out of Scope boundaries. Left as-is; worth a dedicated small follow-up if the duplication ever becomes a real maintenance burden.
- Project conventions followed: no git commands run, no new deps/env/migrations, `adminClient` used only for role lookups + already-adminClient operations (matching each file's pre-existing pattern), session-scoped `createClient()` preserved everywhere it was already used.

### Deviations
- Minor: #6's role list widened to include `marketing` beyond the task doc's original suggested set — corrects for a real, verified live caller (New Project intake) the two-month-old doc predates; documented in Implementation Notes with the specific evidence (`CREATE_ROLES` in `onboarding/projects/route.ts`).
- No deviation (not a departure, but worth noting as resolved-per-plan): #8's "restrict all types to staff" outcome came from following the task doc's own mandated `AskUserQuestion` step (Implementation Step 1) — the doc explicitly left this open pending that decision, so implementing the user's chosen answer is compliance with the plan, not a deviation from it.
- No Major deviations. All 6 numbered findings addressed exactly as scoped; findings #1–#3, `customer_assets`/`customer_asset_folders` RLS, and `role-access.ts`'s fail-open default all confirmed untouched via the file-scope check above, per the task doc's explicit Out of Scope boundaries.

### Required Fixes
- None.
