# 308: Legacy Projects Tab — Restrict to Legacy-Only, Remove Redundant Type Filter

**Created:** 2026-08-25
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** fast

---

## Overview

`/projects/legacy` (the "Legacy Projects" tab, task 279) is supposed to be the home for the old StackShift + Discrete Development projects imported from Zoho Projects — the page's own subtitle already says so ("Original StackShift & Discrete Development — predate onboarding and the 120-day timeline", `_projects-index.tsx:183`). In practice it currently shows **every** project regardless of origin: its "Type" filter (`Legacy` / `Version 2`, backed by `classification`, derived from whether `projects.external_project_id` is set) defaults to "All" — both values checked — so a `version2`-classified (real, non-Zoho-imported) project shows up on the Legacy tab unless a user manually narrows the Type filter to "Legacy" only.

Since `/projects/v2` and `/projects/legacy` are now two separate routes (task 279 split them out of the old combined `?tab=` query param), the tab boundary itself should be the legacy/v2 split — a same-page filter for the same distinction is redundant and is the reason non-legacy projects can currently leak onto this tab. This task:

1. Makes the Legacy Projects page's server-side query **always** restrict to `external_project_id IS NOT NULL` (i.e. `classification: "legacy"`) — no longer optional/filterable, just the page's fixed scope.
2. Removes the "Type" `FilterMultiSelect` (Legacy/Version 2) from the toolbar, along with its URL param (`?classification=`) and all supporting state.

**Important — do not confuse with a same-named, unrelated filter:** `/projects/v2`'s own "Type" filter (`_v2-listing/_onboarding-list.tsx`) and the Status Report page's "Type" filter (`v2/status-report/_status-report-client.tsx`) both use a `CLASSIFICATION_OPTIONS` constant too, but keyed off a **different** field — `customer_products.classification` (the real product type: StackShift, PublishForge, etc., called `productClassification` on `ProjectListItem`). Those are legitimate, still-needed filters and are explicitly out of scope. Only `_legacy-listing/_projects-index.tsx`'s "Legacy vs Version 2" Type filter — the one that duplicates the tab split — is being removed.

## Requirements

- [ ] `_legacy-listing/_load-list-data.ts`: `loadLegacyProjectsList` always applies `.not("external_project_id", "is", null)` to the query (unconditionally — not driven by a param). Remove the `classificationValues` field from `LegacyListParams` and delete the `if (params.classificationValues !== null) { ... }` branch entirely.
- [ ] `_legacy-listing/_load-list-data.ts`: remove the now-always-`"legacy"` `classification: p.external_project_id ? "legacy" : "version2"` line from the mapped `ProjectListItem` output (dead value — confirmed unused for display anywhere in `_legacy-listing/`). Leave `productClassification` and `hasProduct` untouched (unrelated fields).
- [ ] `_legacy-listing/_projects-index.tsx`: remove the `classification` field from the exported `ProjectListItem` type (matches the loader no longer producing it).
- [ ] `_legacy-listing/_projects-index.tsx`: delete `CLASSIFICATION_OPTIONS`, the `classificationSelected` derived value, and the "Type filter" `FilterMultiSelect` JSX block.
- [ ] `_legacy-listing/_projects-index.tsx`: narrow `handleMultiChange`'s `key` parameter type from `"status" | "classification"` to `"status"` (only caller left is the Status filter).
- [ ] `_legacy-listing/_projects-index.tsx`: drop `classificationSelected.length !== CLASSIFICATION_OPTIONS.length` from the `isFiltered` computation.
- [ ] `projects/legacy/page.tsx`: remove `classification` from the `SearchParams` type and delete the `classificationValues` computation/pass-through to `loadLegacyProjectsList`.

## Out of Scope / Must-Not-Change

- `/projects/v2`'s Type filter (`_v2-listing/_onboarding-list.tsx`, `CLASSIFICATIONS`-based) — different field (`customer_products.classification` / product type), still needed, untouched.
- `v2/status-report/_status-report-client.tsx`'s Type filter — same "Legacy/Version 2" shape as the one being removed here, but a separate, standalone copy on an unrelated report page. Not part of this ask; leave as-is.
- `projects-old/_projects-index.tsx` — the retired pre-migration listing (documented elsewhere as read-only/parallel-copy-only). Do not touch.
- `ListingShell` (`_listing-shell.tsx`) and the tab-switch header — already correctly route-based; no change needed there.
- Status filter, Search, Sort, view toggle (Grid/List), pagination — unaffected, keep exactly as-is.
- `productClassification` / `hasProduct` fields on `ProjectListItem` — unrelated to this change, keep untouched.
- No change to `/projects/v2`'s own query/loader logic.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_legacy-listing/_load-list-data.ts` | Modify | Hardcode `external_project_id IS NOT NULL` filter; remove `classificationValues` param + branch; drop dead `classification` output field |
| `src/app/(hub)/projects/_legacy-listing/_projects-index.tsx` | Modify | Remove `CLASSIFICATION_OPTIONS`, Type filter UI, `classification` field from `ProjectListItem`, narrow `handleMultiChange` key type, update `isFiltered` |
| `src/app/(hub)/projects/legacy/page.tsx` | Modify | Remove `classification` search param + pass-through |

## Code Context

### `_load-list-data.ts` — current classification branch (`_load-list-data.ts:85-95`)
```ts
if (params.classificationValues !== null) {
  const hasLegacy = params.classificationValues.includes("legacy");
  const hasVersion2 = params.classificationValues.includes("version2");
  if (hasLegacy && !hasVersion2) {
    projectsQuery = projectsQuery.not("external_project_id", "is", null);
  } else if (!hasLegacy && hasVersion2) {
    projectsQuery = projectsQuery.is("external_project_id", null);
  } else if (!hasLegacy && !hasVersion2) {
    projectsQuery = projectsQuery.eq("id", "00000000-0000-0000-0000-000000000000");
  }
}
```
Replace with an unconditional filter placed alongside the other always-applied clauses (near `.neq("status", "deleted")`, `_load-list-data.ts:72`):
```ts
let projectsQuery = supabase
  .from("projects")
  .select("id,project_id,name,project_type,status,customer_id,end_date,tags,owner_name,updated_at,external_project_id,customer_product_id,created_by,customer_products(classification)", { count: "exact" })
  .neq("status", "deleted")
  .not("external_project_id", "is", null)
  .order(sortSpec.column, { ascending: sortSpec.ascending, nullsFirst: sortSpec.nullsFirst });
```
And delete the `classificationValues` field from the `LegacyListParams` type (`_load-list-data.ts:21`) and the dead output line (`_load-list-data.ts:188`):
```ts
classification: p.external_project_id ? "legacy" : "version2",  // ← delete
```

### `_projects-index.tsx` — pieces to remove
```ts
const CLASSIFICATION_OPTIONS = [
  { value: "legacy", label: "Legacy" },
  { value: "version2", label: "Version 2" },
] as const;
...
const classificationSelected = parseMultiParam(searchParams.get("classification"), CLASSIFICATION_OPTIONS);
...
function handleMultiChange(key: "status" | "classification", next: string[], optionsCount: number) {   // → key: "status"
...
const isFiltered = !!searchInput
  || statusSelected.length !== STATUS_OPTIONS.length
  || classificationSelected.length !== CLASSIFICATION_OPTIONS.length   // ← delete this line
  || !!customerFilter;
...
{/* Type filter — Legacy / Version 2 classification, same multi-select pattern */}
<FilterMultiSelect
  label="Type"
  options={CLASSIFICATION_OPTIONS}
  selected={classificationSelected}
  onChange={(next) => handleMultiChange("classification", next, CLASSIFICATION_OPTIONS.length)}
/>
```
And the `classification` field on the exported type (`_projects-index.tsx:36`):
```ts
classification: "legacy" | "version2";   // ← delete
```

### `legacy/page.tsx` — current (`legacy/page.tsx:18-27, 47-59`)
```ts
type SearchParams = {
  search?: string;
  status?: string;
  classification?: string;   // ← delete
  sort?: string;
  page?: string;
  pageSize?: string;
  customer?: string;
  view?: string;
};
...
const classificationValues = params.classification === undefined ? null : params.classification === "" ? [] : params.classification.split(",");   // ← delete

const { projects, customers, paginationMeta, canManageTags, canCreateProject, canDeleteProjects } = await loadLegacyProjectsList({
  customer: params.customer ?? "",
  page,
  pageSize,
  search: params.search?.trim() ?? "",
  statusValues,
  classificationValues,   // ← delete
  sort: params.sort ?? "newest",
});
```

## Implementation Steps

1. `_load-list-data.ts`: remove `classificationValues` from `LegacyListParams`; add `.not("external_project_id", "is", null)` to the base query chain; delete the conditional classification branch; delete the dead `classification:` output line.
2. `_projects-index.tsx`: delete `CLASSIFICATION_OPTIONS`; delete `classificationSelected`; delete the Type `FilterMultiSelect` JSX; narrow `handleMultiChange`'s key type to `"status"`; remove the `classificationSelected` term from `isFiltered`; remove `classification` from the `ProjectListItem` type.
3. `legacy/page.tsx`: remove `classification` from `SearchParams`; remove the `classificationValues` line; remove `classificationValues` from the `loadLegacyProjectsList(...)` call args.
4. Run `npx tsc --noEmit` and `pnpm lint`.
5. Browser-verify (see Acceptance Criteria) — `pnpm dev`, `/projects/legacy`.

## Acceptance Criteria

- [ ] `/projects/legacy` shows only projects with a non-null `external_project_id` (Zoho-imported StackShift/Discrete Development projects) — no `version2`-classified project appears, even with no other filters applied.
- [ ] The toolbar no longer shows a "Type" filter pill/dropdown — only Status, Search, Sort, view toggle, and (when filtered) Clear filters remain.
- [ ] Visiting `/projects/legacy?classification=version2` (a stale/bookmarked URL) has no effect — the page still shows legacy-only results; the param is silently ignored.
- [ ] Status filter, Search, Sort, Grid/List toggle, pagination, and Clear filters all continue to work exactly as before.
- [ ] `/projects/v2`'s own Type filter (product classification: StackShift/PublishForge/etc.) is untouched and still works.
- [ ] Total project count shown ("`{total}` projects · …") reflects the legacy-only count.
- [ ] `npx tsc --noEmit` passes clean.
- [ ] `pnpm lint` passes clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```
No test runner configured. Verification is type-check + lint + browser-based acceptance testing (`pnpm dev`) on `/projects/legacy` (confirm only legacy-classified projects appear, Type filter is gone, other filters/sort/pagination still work) and a quick regression check on `/projects/v2`'s unrelated Type filter.

## Compatibility Touchpoints

- `?classification=` on `/projects/legacy` becomes a no-op — any old bookmarked/shared URL using it still loads the page correctly (just ignores the param), no broken links.
- No DB schema change — `external_project_id` already exists and is already used for this exact distinction elsewhere in the codebase (see CLAUDE.md's `projects` table conventions).
- No change to `/projects/v2`'s route, loader, or its own (unrelated) Type filter.

## Implementation Notes

### What Changed
- Implemented exactly per the plan — no deviations. `loadLegacyProjectsList` now always applies `.not("external_project_id", "is", null)` unconditionally; the `classificationValues`-driven branch and param were removed end-to-end (loader, page, index component). The "Type" (Legacy/Version 2) `FilterMultiSelect` and its supporting state (`CLASSIFICATION_OPTIONS`, `classificationSelected`) were deleted from the toolbar. The now-always-`"legacy"` `classification` field was removed from `ProjectListItem` and its loader output.

### Files Changed
- `src/app/(hub)/projects/_legacy-listing/_load-list-data.ts` — removed `classificationValues` from `LegacyListParams`; added unconditional `.not("external_project_id", "is", null)`; deleted the conditional classification branch; removed the dead `classification:` output line.
- `src/app/(hub)/projects/_legacy-listing/_projects-index.tsx` — removed `classification` field from `ProjectListItem`; deleted `CLASSIFICATION_OPTIONS`, `classificationSelected`, and the Type `FilterMultiSelect` JSX; narrowed `handleMultiChange`'s key type to `"status"`; removed the classification term from `isFiltered`.
- `src/app/(hub)/projects/legacy/page.tsx` — removed `classification` from `SearchParams`; removed the `classificationValues` computation and its pass-through to `loadLegacyProjectsList`.

### Deviations From Plan
- None.

### Verification Run
- `npx tsc --noEmit` — PASS (no output/errors).
- `pnpm lint` — PASS (0 errors; 2 pre-existing warnings in `_checklist-tab.tsx`, unrelated to this task, same as noted in task 297).
- Browser-based acceptance testing (`pnpm dev`, Super Admin session, Chrome via claude-in-chrome):
  - `/projects/legacy` — toolbar shows only Search, Status filter, Sort, view toggle (Type filter confirmed gone). Shows "227 projects · Original StackShift & Discrete Development — predate onboarding and the 120-day timeline". **PASS**.
  - `/projects/legacy?classification=version2` (stale/bookmarked URL simulation) — page loads normally, still shows the same 227 legacy-only results; param silently ignored, no errors. **PASS**.
  - `/projects/v2` — its own unrelated "Classification" filter (StackShift I/II, Access, Access Plus, Discrete Development — product type) still present and functional; confirms this task did not touch it. **PASS**.
  - No console errors observed on either page. **PASS**.
  - Not independently re-verified: whether any of the 227 results include a project whose `external_project_id` happens to be null but was previously miscounted — not applicable, since the filter is a direct Supabase `.not(...is...)` clause on the same column already used for this distinction elsewhere in the codebase, and the total count dropped from what full-classification (`All`) previously would have shown (spot-checked qualitatively, not via a before/after count diff, since the "before" state — showing all projects unfiltered — was the current behavior being replaced by this task).

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused/dead code: `npx tsc --noEmit` and `pnpm lint` both pass clean on the 3 changed files; `CLASSIFICATION_OPTIONS`, `classificationSelected`, `classificationValues`, and the dead `classification` output field were all fully removed, not just unreferenced.
- No broad `any`/untyped escape hatches introduced or touched.
- `handleMultiChange`'s `key` parameter correctly narrowed from `"status" | "classification"` to `"status"` — matches its only remaining caller.
- `isFiltered` and the toolbar JSX both correctly drop every classification-related term; no orphaned references left behind.
- Project conventions followed: the always-applied `.not("external_project_id", "is", null)` clause was placed alongside the other unconditional filters (`.neq("status", "deleted")`) rather than left as a leftover conditional branch — matches how the rest of the query builder in this file is structured.
- No secrets, credentials, or debug logging introduced.
- Found and fixed one stale-comment issue during review (see Deviations below) — not part of the original plan's Code Context but a direct, in-scope consequence of it.

### Deviations
- **Minor** — `_load-list-data.ts`'s file-header comment (lines 7–13) still claimed "same multi-select status/classification filters" after the classification filter was removed, which was no longer accurate. Updated during this quality-gate pass to describe the status-only filter plus a new note explaining the task-308 hardcoded restriction, so the comment doesn't mislead a future reader about what's actually filterable. Not in the original task doc's Code Context (which only specified the functional diff), but a direct documentation-accuracy consequence of it — no behavior change.
- No Medium or Major deviations. Scope boundaries were respected: `/projects/v2`'s own Type filter, the Status Report page's separate copy, and `projects-old/` were all left untouched, consistent with the task doc's Out of Scope section.

### Required Fixes
- None (PASS).
