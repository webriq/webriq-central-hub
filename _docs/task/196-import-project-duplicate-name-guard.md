# 196: Import Project — No Duplicate-Name Guard (Companion Gap to Task 195)

**Created:** 2026-07-29
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

Task 195 fixed duplicate project creation on the "New Project" wizard (`POST /api/onboarding/projects`) by adding a server-side, case-insensitive duplicate-name check before insert. The bulk "Import Project" flow (`/v2/portfolio-tracker/import`, CSV/Excel import) is a **separate route with the identical gap, never covered by task 195**.

`POST /api/onboarding/projects/import` (`src/app/api/onboarding/projects/import/route.ts:177-193`) auto-derives `projectName` the same way the wizard does (`` `${companyName} ${deriveProjectSuffixMulti(classifications)}` ``, line 177) and inserts into `projects` (line 178-189) with **zero** duplicate/name check beforehand — no `ilike` query, no reuse of the `check-name` pattern. The client (`import/_content.tsx`) has no pre-check either (confirmed: no `check-name`/duplicate references anywhere in that file).

This route processes rows **sequentially, one DB transaction per row** (deliberately not `Promise.all`, per the existing comment at `route.ts:94-96`, so a shared new customer across two rows for the same Account works correctly and per-row errors stay attributable). That sequential-and-independently-committed shape means two concrete duplicate scenarios are both currently unguarded:

1. **Same batch, two rows, same Account + same Type** — row 2's auto-generated name collides with row 1's, which by the time row 2 is processed has already committed (each row's insert is its own statement, not one batch transaction) — so a plain `ilike` check immediately before each row's insert, mirroring task 195, would catch this too, not just cross-request duplicates.
2. **Re-running the same import file** (re-upload after a partial failure, accidental double-submit of the Import page) — identical to task 195's root cause: nothing stops the whole file from being reprocessed and creating a second full set of duplicate projects.

## Requirements

- [ ] Inside the per-row loop in `POST /api/onboarding/projects/import`, immediately before the `projects` insert (after `projectName` is derived, before the `.from("projects").insert(...)` call at line 178), add the same case-insensitive `ilike` duplicate-name check used in task 195's fix to `POST /api/onboarding/projects` and in `check-name/route.ts`.
- [ ] On a match, **do not throw/abort the whole import** — this route's existing convention is per-row `errors.push({ row: rowNumber, error: ... })` + `continue` (see every other validation failure in the loop, e.g. lines 102-105, 108-111). Follow that exact pattern: push `{ row: rowNumber, error: "A project with this name already exists" }` and `continue` to the next row, consistent with how every other row-level failure in this route is already reported back in the response's `errors` array.
- [ ] This single check must catch both scenarios above: within-batch duplicate rows (since each prior row's insert has already committed by the time a later row is checked) and duplicates against pre-existing rows from an earlier import run — no special-casing needed for either, the same query covers both because it always reads current DB state at the time of each row's check.
- [ ] No change to `POST /api/onboarding/projects` (task 195's fix stands as-is) or to the wizard (`portfolio-tracker/new/_content.tsx`) — this task is scoped to the import route only.

## Out of Scope / Must-Not-Change

- Any client-side pre-check/preview in `import/_content.tsx` (e.g. a "these rows look like duplicates" warning before submitting) — the server-side per-row guard is the authoritative fix, matching task 195's own scope decision to not require a client-side redesign.
- Fuzzy/near-duplicate matching (e.g. catching "Acme Corp" vs "Acme Corporation") — task 195 and `check-name` both use exact case-insensitive matching only; this task keeps the same semantics for consistency.
- Customer-name deduplication (`ilike` match on `company_name`, `route.ts:129-134`) — already implemented and correct; not part of this gap.
- Any change to how errors are surfaced in the Import page's results UI — the existing `errors` array / row-error display already handles arbitrary per-row error strings, so the new error message needs no new UI handling.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/onboarding/projects/import/route.ts` | Modify | Add a per-row duplicate-name check (`ilike` on `projects.name`) immediately before the `projects` insert; push a row error and `continue` on match instead of inserting |

## Code Context

### File: `src/app/api/onboarding/projects/import/route.ts` (lines 177-193)

Current — no check between deriving the name and inserting:
```ts
const projectName = `${companyName} ${deriveProjectSuffixMulti(classifications)}`;
const { data: project, error: projectError } = await adminClient
  .from("projects")
  .insert({
    customer_id: customerId,
    name: projectName,
    project_type: deriveProjectTypeMulti(classifications),
    customer_product_id: product.id,
    created_by: user.id,
    onboarding_visible_at: null,
  })
  .select("id, customer_id")
  .single();
if (projectError || !project) {
  errors.push({ row: rowNumber, error: "Failed to create project" });
  continue;
}
```

Reference guard added in task 195 (`POST /api/onboarding/projects`), to mirror here with this route's own per-row error-and-continue convention instead of an early `NextResponse.json(..., { status: 409 })`:
```ts
const { data: existingProject, error: nameCheckError } = await supabase
  .from("projects")
  .select("id")
  .ilike("name", body.project_name.trim())
  .limit(1)
  .maybeSingle();
if (nameCheckError) { /* ... */ }
if (existingProject) {
  return NextResponse.json({ error: "A project with this name already exists" }, { status: 409 });
}
```

Note this route uses `adminClient`, not the request-scoped `supabase` client (task 195's fix used `supabase`, the RLS-scoped server client, since that route already does its reads that way) — use `adminClient` here to match this file's existing pattern (every other query in this loop uses `adminClient`, not `supabase`).

## Implementation Steps

1. In `src/app/api/onboarding/projects/import/route.ts`, after the `projectName` derivation (line 177) and before the `projects` insert, add:
   ```ts
   const { data: existingProject, error: nameCheckError } = await adminClient
     .from("projects")
     .select("id")
     .ilike("name", projectName)
     .limit(1)
     .maybeSingle();
   if (nameCheckError) {
     console.error(`POST /api/onboarding/projects/import row ${rowNumber} name check error:`, nameCheckError);
     errors.push({ row: rowNumber, error: "Failed to validate project name" });
     continue;
   }
   if (existingProject) {
     errors.push({ row: rowNumber, error: "A project with this name already exists" });
     continue;
   }
   ```
2. No other files need changes — the response shape (`{ imported, errors }`) and the Import page's existing error-row rendering already handle this without modification.

## Acceptance Criteria

- [ ] Importing a CSV with two rows for the same Account + Type results in exactly one project created; the second row reports `"A project with this name already exists"` in the response's `errors` array instead of silently creating a duplicate.
- [ ] Re-running (re-uploading) an import file that already succeeded once produces the same per-row duplicate error for every row instead of creating a second full set of projects.
- [ ] A normal import of genuinely distinct rows (different accounts and/or types) is unaffected — all still import successfully.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manually: on /v2/portfolio-tracker/import, upload a file with two identical rows (same Account + Type) —
#   confirm only one project is created and the second row's error shows the duplicate-name message.
# Manually: re-upload the same file a second time — confirm every row now reports the duplicate error
#   and no new projects are created.
# Manually: run one normal import with distinct rows to confirm no regression.
```

## Compatibility Touchpoints

- None — internal API-only fix, no schema change, no packaging/docs impact. `POST /api/onboarding/projects/import` gains a new possible per-row error string; the response shape (`{ imported, errors }`) is unchanged, so no caller-side handling changes.

## Implementation Notes

### What Changed
- Added a per-row, case-insensitive duplicate-name check (`ilike` on `projects.name` via `adminClient`, matching this file's existing client usage) immediately after `projectName` is derived and before the `projects` insert. On a match, pushes `{ row: rowNumber, error: "A project with this name already exists" }` and `continue`s to the next row — the same error-and-continue convention already used by every other validation failure in this loop, so no changes were needed to the response shape or the Import page's error-row rendering.
- Covers both scenarios from the task doc in one check: a same-batch repeat row (since each prior row's insert has already committed by the time a later row is checked) and a re-uploaded file colliding with previously-imported rows (since the check always reads current DB state).

### Files Changed
- `src/app/api/onboarding/projects/import/route.ts` - added the duplicate-name guard block between `projectName` derivation and the `projects` insert.

### Deviations From Plan
- None — implementation followed the task doc's Implementation Steps exactly.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Manual browser verification (duplicate rows in one batch, re-upload of an already-imported file, one normal distinct-rows import) - SKIPPED (deferred to the `test` stage per the implement→simplify→test chain; not run in this stage).
