# 272: Portfolio Tracker — Generalize Header Description, Match Projects Page-Size Options, Hide Unclassified Projects

**Created:** 2026-08-18
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Completed (2026-08-18) — marked complete by user request directly after the quality gate; not live-verified in-browser this session, see Implementation Notes

---

## Overview

Three small, independent polish fixes to the Portfolio Tracker list page (`/portfolio-tracker`, `src/app/(hub)/portfolio-tracker/_onboarding-list.tsx`):

1. The role-editable header description hard-codes "all 5 phases (120-day full cycle)" and "Phase 1 is hidden from PM/staff view until handover." This was accurate when every project followed the single StackShift I 5-phase/120-day programme, but the page now supports multiple classifications (StackShift I/II/Access/Access Plus, PipelineForge, Discrete Development) with per-project custom phase counts and durations (`src/config/customer-phases.ts` — `programme_duration_days`, custom phases via `buildOrderedPhasePlan`, non-StackShift-I generic-engine projects driven by `milestones`/`tasklists` instead of the fixed `PROGRAMME_PHASES`). The description needs to describe the page generically instead of assuming the one fixed cycle.
2. The page-size `<select>` (`PAGE_SIZES = [9, 18, 36]`) doesn't match `/projects`' `GRID_PAGE_SIZES = [15, 45, 90]`, and its styling (`rounded-lg`, native browser arrow) doesn't match `/projects`' pill-shaped custom-chevron select (`rounded-full` + `appearance-none` + inline SVG background-image chevron). Match both the values and the visual design shown in the reference screenshot.
3. Projects with no real classification (`classification: null` — legacy/Zoho-imported rows, card footer currently labels them "Unclassified") should no longer appear in the list at all. They're import noise, not real programme-tracked projects.

## Requirements

- [ ] Header description (role-editable branch only, `_onboarding-list.tsx:170`) no longer references a fixed phase count, fixed day count, or "Phase 1 is hidden" mechanic. Write a general description of what the page shows (programme intake/progress tracking across active onboarding projects), reviewed against current multi-classification/custom-duration reality. The non-editable branch (`"Projects currently going through Phase 1 onboarding."`, line 171) is untouched — out of scope, still accurate for that audience.
- [ ] `PAGE_SIZES` changed from `[9, 18, 36]` to `[15, 45, 90]`, matching `/projects`' `GRID_PAGE_SIZES`.
- [ ] Page-size `<select>` restyled to match `/projects`' pill design: `rounded-full`, `appearance-none`, inline SVG chevron `backgroundImage` (copy the exact style block from `_projects-index.tsx`), instead of the current `rounded-lg` native-arrow select.
- [ ] Default page size on load: confirm `page.tsx`'s fallback (`params.pageSize ?? "9"`) is updated to a value present in the new `PAGE_SIZES` set (use `15`, matching `/projects`' grid default) so an un-paginated first load doesn't request an orphaned page size.
- [ ] Projects with no classification (`customer_product_id IS NULL` OR joined `customer_products.classification IS NULL`) are excluded from every query the list page runs, regardless of the `classification` filter's state — not just filtered out by default. This must happen server-side in `_load-list-data.ts` (the `count: "exact"` total and pagination must reflect the exclusion, not just hide cards client-side).
- [ ] The `"unclassified"` entry is removed from `CLASSIFICATION_OPTIONS` in `_onboarding-list.tsx` (nothing left to filter by once those rows never come back).
- [ ] Any in-flight `?classification=` URL param containing `unclassified` degrades gracefully (treated as a no-op value, not an error) — since `classificationValues` is user/URL-controlled and old bookmarked/shared links may still carry it.
- [ ] `ProjectCard`'s "Unclassified" footer label (`_project-card.tsx`) becomes dead code for the list's own data path — verify whether it's reachable from anywhere else (e.g. a detail page reusing the same component) before deciding whether to touch it; if unreachable, leave it (out of scope to hunt down unless trivially confirmed dead) unless it's clearly harmless to leave as-is.

## Out of Scope / Must-Not-Change

- The non-role-editable description branch (line 171) — different audience, not tied to the 5-phase/120-day claim.
- `/projects` page itself — reference only, not modified.
- `GET /api/onboarding/projects` (shared by pm-dashboard/marketing-dashboard widgets) — a separate, already-documented-as-separate data path per the task 263 comment in `_load-list-data.ts`; do not add the unclassified exclusion there unless the user asks — those dashboard widgets may have different intent for showing/counting legacy rows. Flag this in the implementation notes if it seems inconsistent, but don't silently expand scope.
- `PROGRAMME_PHASES` / `customer-phases.ts` config itself — no changes to phase/duration logic, this task only touches display copy and query filtering.
- Detail page (`[projectId]/page.tsx`) and its "Unclassified" handling, if any — list page only.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/portfolio-tracker/_onboarding-list.tsx` | Modify | New header description string; `PAGE_SIZES` values; page-size select restyle; remove `"unclassified"` from `CLASSIFICATION_OPTIONS` |
| `src/app/(hub)/portfolio-tracker/_load-list-data.ts` | Modify | Always exclude null-classification rows from the query (independent of `classificationValues` filter state); harden against a stray `"unclassified"` value still arriving via URL |
| `src/app/(hub)/portfolio-tracker/page.tsx` | Modify | Default `pageSize` fallback `"9"` → `"15"` |

## Code Context

### File: `src/app/(hub)/portfolio-tracker/_onboarding-list.tsx`

```tsx
// line 74
const PAGE_SIZES = [9, 18, 36] as const;

// lines 168-172
<p className="text-[13px] mt-0.5 text-[#5F6A88]">
  {roleEditable
    ? `${total} client${total === 1 ? "" : "s"} · programme intake and progress across all ${phaseCount} phases (${totalDays}-day full cycle) — Phase 1 is hidden from PM/staff view until handover.`
    : "Projects currently going through Phase 1 onboarding."}
</p>

// lines 155-156 (phaseCount/totalDays become unused once the description no longer references them —
// remove if nothing else in the file uses them; grep first, they may be dead after this change)
const totalDays = PROGRAMME_PHASES[PROGRAMME_PHASES.length - 1].dayEnd;
const phaseCount = PROGRAMME_PHASES.length;

// lines 61-64
const CLASSIFICATION_OPTIONS = [
  ...CLASSIFICATIONS.map((c) => ({ value: c, label: c })),
  { value: "unclassified", label: "Unclassified" },
] as const;

// lines 258-264 (select to restyle — current)
<select
  value={pageSize}
  onChange={(e) => navigate(buildUrl({ pageSize: Number(e.target.value), page: 1 }))}
  className="h-8 px-2.5 pr-6 rounded-lg border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] outline-none focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14] cursor-pointer"
>
  {PAGE_SIZES.map((n) => <option key={n} value={n}>{n} per page</option>)}
</select>
```

### File: `src/app/(hub)/projects/_projects-index.tsx` (reference — pill select design + page sizes to match)

```tsx
const GRID_PAGE_SIZES = [15, 45, 90] as const;
const LIST_PAGE_SIZES = [20, 50, 100] as const;

// select styling to copy (lines 282-291)
<select
  value={pageSize}
  onChange={(e) => navigate(buildUrl({ pageSize: Number(e.target.value), page: 1 }))}
  className="h-8 px-2.5 pr-7 rounded-full border border-[#E2E7F2] bg-white text-[12px] text-[#3A4565] outline-none focus:border-[#007BFF] focus:ring-[3px] focus:ring-[#007BFF]/[0.14] cursor-pointer appearance-none"
  style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%235F6A88'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}
>
  {pageSizes.map((n) => (
    <option key={n} value={n}>{n} per page</option>
  ))}
</select>
```

### File: `src/app/(hub)/portfolio-tracker/_load-list-data.ts`

```ts
// lines 45-66 — classification OR-clause builder. "unclassified" is currently opt-in via the
// filter; needs to become an always-applied exclusion instead.
let classificationOrParts: string[] | null = null;
if (params.classificationValues !== null) {
  const wantsUnclassified = params.classificationValues.includes("unclassified");
  const realValues = params.classificationValues.filter((v) => v !== "unclassified");
  const matchingProductIds: string[] = [];
  if (realValues.length > 0) {
    const { data } = await supabase.from("customer_products").select("id").in("classification", realValues);
    matchingProductIds.push(...(data ?? []).map((r) => r.id));
  }
  if (wantsUnclassified) {
    const { data } = await supabase.from("customer_products").select("id").is("classification", null);
    matchingProductIds.push(...(data ?? []).map((r) => r.id));
  }
  classificationOrParts = [];
  if (wantsUnclassified) classificationOrParts.push("customer_product_id.is.null");
  if (matchingProductIds.length > 0) classificationOrParts.push(`customer_product_id.in.(${matchingProductIds.join(",")})`);
}
...
if (classificationOrParts !== null) {
  query = classificationOrParts.length > 0
    ? query.or(classificationOrParts.join(","))
    : query.eq("id", ZERO_ROWS_ID);
}
```

Simplest correct fix: strip `"unclassified"` out of `params.classificationValues` before it's used (so it can never re-enable the branch that includes null-classification rows), and unconditionally add `.not("customer_product_id", "is", null)` to the base query — this covers both "no `customer_product_id` at all" and, combined with a `customer_products.classification IS NOT NULL` inner-join semantics check, "has a product row but its classification is null." Since `customer_products(classification)` is a select-side join (not filterable directly via `.not()` on a joined column with the JS client in an `.or()`-free simple case), the safer approach that reuses existing code is: always compute the null-classification `customer_products.id` list (same query already in the `wantsUnclassified` branch) and always exclude projects whose `customer_product_id` is null OR is in that null-classification id list — independent of what the user's filter selected. Implementation stage should pick whichever shape keeps the query correct and reasonably close to the existing pattern; verify row counts against `total` after the change (a project whose `customer_product_id` is null must not silently outnumber-mismatch the displayed cards).

### File: `src/app/(hub)/portfolio-tracker/page.tsx`

```ts
// line 29
const pageSize = Math.max(1, parseInt(params.pageSize ?? "9", 10) || 9);
// → "9"/9 becomes "15"/15
```

## Implementation Steps

1. In `_load-list-data.ts`, add an always-applied exclusion for null-classification projects (both "no `customer_product_id`" and "has one, but its `customer_products.classification` is null"), independent of `params.classificationValues`. Sanitize `params.classificationValues` to drop a stray `"unclassified"` entry if present (defensive against old URLs) rather than letting it re-include those rows.
2. In `_onboarding-list.tsx`, remove the `{ value: "unclassified", label: "Unclassified" }` entry from `CLASSIFICATION_OPTIONS`.
3. In `_onboarding-list.tsx`, rewrite the role-editable header description to describe the page generically — no fixed phase/day count, no "Phase 1 is hidden" claim tied to the single-programme model. Keep the `${total} client${total === 1 ? "" : "s"} ·` prefix (still accurate). Remove `totalDays`/`phaseCount` locals if they become unused (grep the file first — `PROGRAMME_PHASES` import may still be needed elsewhere; check before deleting the import too).
4. In `_onboarding-list.tsx`, change `PAGE_SIZES` to `[15, 45, 90]` and restyle the `<select>` to the pill/chevron design copied from `_projects-index.tsx` (`rounded-full`, `appearance-none`, inline SVG `backgroundImage` style block).
5. In `page.tsx`, change the `pageSize` fallback from `"9"`/`9` to `"15"`/`15`.
6. Grep for any other reference to the old `PAGE_SIZES` values or the removed `"unclassified"` filter option (e.g. `_filter-multi-select.tsx` usage, tests, or other pages importing `CLASSIFICATION_OPTIONS` from this file) to confirm nothing else breaks.

## Acceptance Criteria

- [ ] Header description on `/portfolio-tracker` (role-editable view) no longer mentions "5 phases," "120-day," or "Phase 1 is hidden."
- [ ] Page-size dropdown offers 15/45/90 and visually matches `/projects`' pill-shaped chevron select.
- [ ] First page load (no `pageSize` param) requests 15 per page, not 9.
- [ ] No card with an "Unclassified" footer label appears in the list, on any page, with any filter/search/sort combination.
- [ ] Classification filter no longer offers an "Unclassified" checkbox.
- [ ] The pagination total (`{total} clients`, "`X–Y of Z`") reflects the exclusion — Z does not count hidden unclassified projects.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual: /portfolio-tracker as an admin/marketing (roleEditable) user —
#   - confirm header copy, page-size options + styling, absence of "Unclassified" cards/filter option
#   - toggle classification filter through all remaining options, confirm counts/pagination stay consistent
```

## Compatibility Touchpoints

- None — page-scoped UI/query change, no shared components, no API contract, no migration.

## Implementation Notes

### What Changed
- Header description (role-editable branch) rewritten to drop the fixed "5 phases (120-day full cycle)" / "Phase 1 is hidden" claims, replaced with a classification/duration-agnostic description. The now-unused `totalDays`/`phaseCount` locals and the `PROGRAMME_PHASES` import were removed.
- `PAGE_SIZES` changed from `[9, 18, 36]` to `[15, 45, 90]`; the page-size `<select>` restyled to the pill/chevron design copied verbatim from `/projects`' `GRID_PAGE_SIZES` select (rounded-full, appearance-none, inline SVG chevron background-image).
- `page.tsx`'s default `pageSize` fallback changed from `"9"`/`9` to `"15"`/`15` to match.
- `CLASSIFICATION_OPTIONS` no longer includes an `"unclassified"` entry — nothing left to filter by since those rows are now always excluded server-side.
- `_load-list-data.ts` now always excludes projects with no `customer_product_id` and projects whose linked `customer_products.classification` is `null`, independent of the classification filter's state — via `.not("customer_product_id", "is", null)` plus a `.not("customer_product_id", "in", "(...)")` exclusion built from a null-classification product-id lookup that now always runs (previously only ran when the removed `"unclassified"` filter value was explicitly selected). `params.classificationValues` is defensively stripped of any stray `"unclassified"` value before use, so an old bookmarked URL degrades to a no-op instead of erroring or re-including hidden rows.

### Files Changed
- `src/app/(hub)/portfolio-tracker/_onboarding-list.tsx` — header copy, `PAGE_SIZES`, page-size select styling, `CLASSIFICATION_OPTIONS`, removed dead `PROGRAMME_PHASES`-derived locals/import
- `src/app/(hub)/portfolio-tracker/_load-list-data.ts` — always-on null-classification exclusion, `classificationValues` sanitization
- `src/app/(hub)/portfolio-tracker/page.tsx` — default `pageSize` fallback `9` → `15`

### Deviations From Plan
- The task doc's "Code Context" section sketched two possible query shapes for the exclusion and left the final shape to the implementation stage. Went with: always run the null-classification `customer_products.id` lookup, then apply two `.not()` filters (`customer_product_id IS NOT NULL` and `customer_product_id NOT IN (null-classification ids)`) unconditionally, ANDed with the existing optional `classificationOrParts` `.or()` filter for user-selected classifications. This reuses the existing lookup pattern with minimal new surface area and keeps `count: "exact"`/pagination correct since the exclusion is a real query-level filter, not client-side hiding.
- `_project-card.tsx`'s "Unclassified" footer label was left untouched (per the task doc's own conditional guidance) — it's now unreachable from this list's data path since those rows never come back from the query, but the component itself isn't provably dead (not confirmed unused elsewhere within this task's scope), so left as dead-but-harmless rather than hunting down all call sites.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`, untouched by this change)
- Manual browser acceptance test - SKIPPED (not run this session; flagging for the `test` stage / manual QA — recommend checking header copy, page-size options/styling, and confirming no "Unclassified" cards appear across filter/search/sort/pagination combinations)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused/dead code: the now-unreferenced `totalDays`/`phaseCount` locals and the `PROGRAMME_PHASES` import were removed alongside the description rewrite, not left behind.
- No broad `any` / untyped escape hatches introduced.
- `classificationValues` sanitization and the null-classification exclusion follow the file's existing two-step lookup + raw `.or()`/`.not()` string-building convention (matches the pre-existing `excludedProjectIds` `.not("id", "in", "(...)")` pattern already in this file) rather than introducing a new query-building style.
- Page-size select styling was copied verbatim from `/projects`' `_projects-index.tsx` reference implementation per the task doc's explicit instruction, not reinvented.
- Naming (`classificationValues`, `nullClassificationProductIds`) is accurate and reads clearly at call sites.
- No secrets, credentials, or debug logging introduced.
- `git diff` scoped to only `_onboarding-list.tsx`, `_load-list-data.ts`, `page.tsx` — `_project-card.tsx` also shows as modified in the working tree but that change predates this task (present in the session's initial `git status` snapshot, before task 272 was planned) and was correctly left untouched by the implementation stage; not reviewed as part of this gate.

### Deviations
- Minor: the null-classification `customer_products` lookup (`.select("id").is("classification", null)`) now runs unconditionally on every list-page request instead of only when a since-removed `"unclassified"` filter value was explicitly selected. This is a small, always-on extra query, not a correctness issue — `customer_products` is a small table (bounded by onboarded-product count), same characterization the file already gives `project_members` nearby. Acceptable; flagging only for awareness, not blocking.
- Minor: task doc's Code Context section left the final query shape open for the implementation stage to decide (explicitly noted as such); implementation chose "always apply two `.not()` exclusions ANDed with the existing optional classification `.or()`" — matches the doc's own stated acceptance criteria (query-level exclusion, pagination/count must reflect it) and reuses established patterns in the file. No scope expansion.

### Required Fixes
- None.
