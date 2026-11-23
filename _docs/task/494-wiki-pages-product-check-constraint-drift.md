# 494: Wiki Import/New Page 500s: `wiki_pages_product_check` in production doesn't allow the 6 Wiki spaces

**Created:** 2026-11-23
**Priority:** HIGH
**Type:** bugfix (migration)
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

Importing a document into the Wiki fails in production with a 500 error. Vercel log (hub.webriqs.com, 2026-11-23 09:05:10 and 09:07:26):

```
POST /api/wiki/pages error: {
  code: "23514",
  message: "new row for relation \"wiki_pages\" violates check constraint \"wiki_pages_product_check\""
}
```

The upstream Supabase `POST` returned 400, and the route turned it into a generic 500 with "Failed to create page" (`src/app/api/wiki/pages/route.ts:98-101`).

### Root cause (hypothesis, to be confirmed by Operator Step 1)

The app and the repo's migration agree:

- `src/types/wiki.ts:6-12` (`WikiProduct` / `WIKI_PRODUCTS`) allows `PipelineForge | PublishForge | CiteForge | StackShift I | StackShift II | Citation Grader`.
- `supabase/migrations/149_wiki_pages.sql:28` checks the same 6 values.
- The import modal only sends a value from `WIKI_PRODUCTS` (`_wiki-import-modal.tsx:174,211,294`; default comes from `selectedProduct` in `_wiki-shell.tsx:227`).

But task 395 first wrote migration 149 with the **4-value `ProductName` list** (`StackShift`, `PublishForge`, `PipelineForge`, `CiteForge`). Task 399 then widened the check **by editing migration 149 in place** instead of adding a new migration (`_docs/task/399-…md:31,52`: "edit in place — unapplied, no live data"). Production clearly has a `wiki_pages` table, so 149 was applied at some point. If it was applied **before** task 399's edit, production still has the 4-value check. Then any page in `StackShift I`, `StackShift II` or `Citation Grader` fails with 23514, whether it comes from Import or from New Page, while `PipelineForge`, `PublishForge` and `CiteForge` still work.

Editing an applied migration never reaches the database, so the fix has to be a **new** migration.

## Requirements

- [ ] New migration `supabase/migrations/188_wiki_pages_product_check_widen.sql`:
  - In one transaction, drop `wiki_pages_product_check` if it exists, then re-add it with the exact 6 values from migration 149.
  - Before re-adding it, remap legacy `product = 'StackShift'` rows to `'StackShift I'` (see D1). Those rows can only exist under the old 4-value check, and they're invisible in the UI today because `WIKI_PRODUCTS` has no `StackShift`.
  - The migration must be idempotent: running it again is a no-op.
- [ ] `POST /api/wiki/pages`: reject a `product` that isn't in `WIKI_PRODUCTS` with **400** `"Unknown wiki space"` before inserting. This is validation at the trust boundary, so a bad value never turns into a 500 again.
- [ ] Update migration 149's header comment with one line saying the widening was shipped as migration 188 (149 was applied before task 399's in-place edit), so nobody repeats the in-place edit.

## Out of scope / must not change

- `WIKI_PRODUCTS`, its order, colours and badges.
- RLS policies on `wiki_pages` (migrations 149 and 152).
- The import conversion pipeline (`.docx`/`.md`/`.pdf`) and `import-pdf` routes.
- Mapping every Postgres error code to an HTTP status in the route: only the product check is added.

## Proposed file changes

| File | Action | Change |
|------|--------|--------|
| `supabase/migrations/188_wiki_pages_product_check_widen.sql` | Create | Remap `StackShift` → `StackShift I`, then drop and re-add the check with 6 values |
| `src/app/api/wiki/pages/route.ts` | Modify | Return 400 when `product` isn't in `WIKI_PRODUCTS` (about 3 lines) |
| `supabase/migrations/149_wiki_pages.sql` | Modify | Header comment only |

## Code Context

`src/app/api/wiki/pages/route.ts:78-80`, where the new guard goes:

```ts
if (!product || !title?.trim()) {
  return NextResponse.json({ error: "product and title are required" }, { status: 400 });
}
// add: if (!WIKI_PRODUCTS.some((p) => p.name === product)) → 400 "Unknown wiki space"
```

`src/app/(hub)/wiki/page.tsx:12-14` already has the same membership test (`isWikiProduct`). Inline the one-liner rather than adding a shared helper.

Migration sketch:

```sql
begin;
alter table wiki_pages drop constraint if exists wiki_pages_product_check;  -- must precede the remap (see Implementation Notes)
update wiki_pages set product = 'StackShift I' where product = 'StackShift';
alter table wiki_pages add constraint wiki_pages_product_check
  check (product in ('PipelineForge','PublishForge','CiteForge','StackShift I','StackShift II','Citation Grader'));
commit;
```

`wiki_page_versions` has no `product` column, so nothing else needs remapping.

## Implementation Steps

1. Write migration 188 as sketched, with a header that explains the drift and cites this task.
2. Add the `WIKI_PRODUCTS` guard to the `POST` handler (`WIKI_PRODUCTS` is already exported from `@/types/wiki`; the route imports only types today, so add the value import).
3. Add the header note to migration 149.
4. Run `npx tsc --noEmit`.

## Acceptance Criteria

| # | Check | Expected | When |
|---|-------|----------|------|
| A1 | `npx tsc --noEmit` | exit 0 | pre-merge |
| A2 | `curl -X POST /api/wiki/pages` with a session and body `{"product":"Nope","title":"x"}` | 400 `{"error":"Unknown wiki space"}`, no row inserted | pre-merge (dev) |
| A3 | SQL `select pg_get_constraintdef(oid) from pg_constraint where conname='wiki_pages_product_check'` | lists all 6 values | post-deploy (after Operator Step 2) |
| A4 | Browser: `/wiki` → space **StackShift II** (and **Citation Grader**) → Import a small `.md` file | page created and shown in the tree; no 23514 in the Vercel logs | post-deploy |
| A5 | **No-regression:** browser: Import a `.md` file into **PipelineForge**, and create a blank page via New Page in **CiteForge** | both succeed as before | post-deploy |
| A6 | **No-regression:** SQL `select count(*) from wiki_pages where product not in (<6 values>)` | 0; existing pages keep their space (only legacy `StackShift` rows move) | post-deploy |
| A7 | Run migration 188 a second time | succeeds, nothing changes | pre-merge (local/PGlite) or post-deploy |

## Verification

`npx tsc --noEmit`; dev `curl` for A2; operator SQL for A3/A6; browser import in production for A4/A5.

## Coordination

- Files touched: `src/app/api/wiki/pages/route.ts`, `supabase/migrations/149_wiki_pages.sql` (comment), new `188_…sql`.
- **408** (Planned, Wiki publish-gated edits) changes the Wiki save/publish flow and may touch `wiki_pages` columns and `api/wiki/pages/*`. No direct conflict with the product check, but if 408 adds a migration it must take a number after 188. Land 494 first, since it's a small, urgent fix.
- **187** (task 492, written-not-applied): numbering only, no overlap.

## Open Decisions

- **D1 (NON-BLOCKING):** where should legacy `product='StackShift'` rows go? **Default: remap them to `StackShift I`.** Operator Step 1 shows whether any exist. If the count is 0, the remap is a no-op and this decision doesn't matter.

## Operator Steps

Merging doesn't apply the migration.

1. **Before applying, confirm the root cause** in the Supabase SQL editor (production):
   ```sql
   select pg_get_constraintdef(oid) from pg_constraint where conname = 'wiki_pages_product_check';
   select product, count(*) from wiki_pages group by product;
   ```
   Expected: a check listing `StackShift` and not `StackShift I/II` / `Citation Grader`. If the definition already lists all 6 values, **stop**: the hypothesis is wrong, so capture the failing request body and re-plan.
2. Apply `supabase/migrations/188_wiki_pages_product_check_widen.sql` to production.
3. Re-run the Step 1 queries (A3/A6).
4. Deploy the Hub (the Next.js app on Vercel is the only deployable; the route change isn't imported anywhere else, and `grep -rn "api/wiki/pages\"" src` shows only the import and new-page modals and the shell call it).

## Baseline

- A1 `npx tsc --noEmit`: not captured separately before the change; the route change is type-only safe and A1 passes after.
- Constraint behaviour (PGlite, old 4-value check): inserting `StackShift I` / `StackShift II` / `Citation Grader` raises 23514 `wiki_pages_product_check`. This reproduces the production error and is asserted by the check script before it applies 188.
- A2: before the change, an unknown `product` reached the insert and came back as 500 (`route.ts` only checked presence).

## Implementation Notes

### What Changed
- New migration 188 drops `wiki_pages_product_check`, remaps legacy `StackShift` → `StackShift I`, and re-adds the check with the 6 `WIKI_PRODUCTS` values, all in one transaction and idempotent.
- `POST /api/wiki/pages` returns 400 `"Unknown wiki space"` for a `product` that isn't in `WIKI_PRODUCTS`, before inserting.
- Migration 149's header now notes that it was applied before task 399's in-place edit, and that the widening ships as 188.

### Files Changed
- `supabase/migrations/188_wiki_pages_product_check_widen.sql` - new; widens the check and remaps legacy rows
- `src/app/api/wiki/pages/route.ts` - `WIKI_PRODUCTS` value import plus a 3-line guard
- `supabase/migrations/149_wiki_pages.sql` - header comment only
- `_docs/task/494-wiki-product-check.sql-check.mjs` - new PGlite check, following the task 492 pattern (not a project dependency)

### Deviations From Plan
- Statement order in 188: the plan's sketch ran the `UPDATE` before the `DROP`. That fails, because the old 4-value check rejects `'StackShift I'`. Now it's drop → remap → add. The sketch in this doc is corrected.
- Added the PGlite check script (A7 asked for a local idempotency run; the plan didn't name a file).

### Verification Run
- `npx tsc --noEmit` - PASS (exit 0)
- `node 494-wiki-product-check.sql-check.mjs …/188_…sql` (PGlite 0.2.17, scratch dir) - PASS (baseline: the 3 new spaces raise 23514 → now: they insert; the legacy row moves to `StackShift I`; other rows are unchanged; `StackShift`/`Nope` are still rejected; running 188 twice is a no-op). Covers A6 and A7 locally.
- A2 (`curl` 400 for an unknown space) - SKIPPED: needs an authenticated dev session; the guard is a single `WIKI_PRODUCTS.some(...)` test, the same as `wiki/page.tsx:12-14`.
- A3, A4, A5 - not run: post-deploy, after Operator Step 2.

### Attempts That Failed
- First run of the PGlite check failed with 23514 inside migration 188 (`Failing row contains (1, StackShift I, legacy)`): the remap ran before the old check was dropped. Fixed by reordering; the re-run passed.

### Operator Steps
1. In the production Supabase SQL editor, confirm the root cause first:
   `select pg_get_constraintdef(oid) from pg_constraint where conname = 'wiki_pages_product_check';` and `select product, count(*) from wiki_pages group by product;`. If the definition already lists all 6 values, **stop**: 188 won't fix the error, so re-plan.
2. Apply `supabase/migrations/188_wiki_pages_product_check_widen.sql`.
3. Re-run the Step 1 queries: the definition should list 6 values, and no `product` should be outside them.
4. Deploy the Hub (Vercel). The route change is only reached over HTTP by the Wiki modals; no other deployable imports it.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. All 4 changed files were reviewed. Changed files come from the Implementation Notes, not `git diff`, because CLAUDE.md forbids git commands.
- `route.ts`: the guard uses the existing `WIKI_PRODUCTS` membership test (the same shape as `wiki/page.tsx:12-14`). There's no new helper or abstraction. `@/types/wiki` is plain constants and server-safe. The validation runs at the trust boundary, before the insert.
- Migration 188: a single transaction, idempotent (`drop … if exists`, and the remap is a no-op once nothing is left to move), and no hardcoded secrets. Explicit `begin;`/`commit;` matches 5 existing migrations.
- The PGlite check script asserts behaviour (real inserts accepted or rejected, row contents), not the SQL text. It fails before the fix: it reproduced the prod 23514 and caught the ordering bug.
- Every acceptance criterion has a check that could fail. A2 has a check but wasn't run (it needs an authenticated session). A3, A4 and A5 are post-deploy and depend on Operator Step 2.

### Deviations
- **Minor:** the migration statement order differs from the plan's sketch (drop → remap → add). The sketch couldn't work; this was caught by the check and the sketch was corrected.
- **Minor:** the added PGlite check script follows the existing task 492 pattern and adds no project dependency.

### Required Fixes
- None

## Operator Step 1 Result (2026-11-23, production)

- Constraint: `CHECK ((product = ANY (ARRAY['StackShift','PublishForge','PipelineForge','CiteForge'])))`. This **confirms the root cause**: it's the 4-value check from before task 399.
- Rows by space: PublishForge 8, CiteForge 1, StackShift 1. The single `StackShift` page is invisible in the UI today and moves to `StackShift I` under D1. All 10 rows fit the new check after the remap.
- Expected after Steps 2–3: the check lists 6 values; the counts are PublishForge 8, CiteForge 1, StackShift I 1.

## Operator Steps 2–3 Result (2026-11-23, production)

- Migration 188 applied.
- **A3 PASS:** the check now lists `PipelineForge, PublishForge, CiteForge, StackShift I, StackShift II, Citation Grader`.
- **A6 PASS:** counts are PublishForge 8, CiteForge 1, StackShift I 1 (10 rows, the same as before). Only the legacy `StackShift` row moved; nothing is outside the 6 values.
- Still pending: Step 4 (deploy the Hub), then A4/A5 browser imports and A2 (400 on an unknown space).
