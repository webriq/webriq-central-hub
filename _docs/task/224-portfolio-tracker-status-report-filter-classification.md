# 224: Portfolio Tracker & Status Report — Filter UI Parity with `/v2/projects` + Project Classification Filter

**Created:** 2026-08-10
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

`/v2/projects` (`_projects-index.tsx`) has the most mature filter UX in the app: categorical filters (Status, Type/classification) render as a checkbox-group `FilterMultiSelect` dropdown ("All" is itself a checkbox tied to full selection; unchecking any option un-checks "All"), URL-synced via `?status=&classification=` with a shared encode/decode convention (`parseMultiParam`), plus a "Clear filters" pill that only appears when something is actually filtered.

`/v2/portfolio-tracker` (`_onboarding-list.tsx`) and `/v2/portfolio-tracker/status-report` (`_status-report-client.tsx`) both still use the older single-select "pill row" pattern (click one pill, it goes navy, everything else is implicitly excluded) for their one categorical filter (Status / Health respectively), and neither exposes a filter for the project's **classification** (`StackShift I`, `StackShift II`, `StackShift Access`, `StackShift Access Plus`, `PipelineForge`, `Discrete Development` — `CLASSIFICATIONS` in `src/config/customer-phases.ts`), even though both pages already fetch and display that value today (`item.classification` renders as a `Chip` on the Portfolio Tracker card footer; `ProjectStatusReportItem.classification` is fetched but currently unused by the Status Report UI).

This task: (1) swap the single-select pill rows for the same `FilterMultiSelect` checkbox-dropdown pattern used on `/v2/projects`, and (2) add a new Classification `FilterMultiSelect` to both pages, reusing the existing `classification` field already present in both API payloads — **no API or DB changes required**.

## Requirements

- [ ] Extract `/v2/projects`' `FilterMultiSelect` component (and its `parseMultiParam` URL-decoding helper) into a new file shared by `_onboarding-list.tsx` and `status-report/_status-report-client.tsx` — these two pages are the same feature area (Portfolio Tracker + its Status Report sub-page), so sharing here does not violate the codebase's page-scoped-UI convention (which exists to stop *unrelated* feature areas from coupling, e.g. Portfolio Tracker vs. Projects).
- [ ] `/v2/portfolio-tracker`: replace the `STATUS_FILTERS` pill row with a `FilterMultiSelect` "Status" dropdown. Options become the full `OnboardingProjectListItem["status"]` enum (`draft`, `scheduled`, `in_progress`, `completed`) — today's pill row omits `completed` entirely; closing that gap is in scope since it's required to match `/v2/projects`' STATUS_OPTIONS-covers-the-full-enum pattern.
- [ ] `/v2/portfolio-tracker`: add a new "Classification" `FilterMultiSelect`, options = `CLASSIFICATIONS` (from `@/config/customer-phases`) plus one synthetic `"unclassified"` option (label "Unclassified") for projects where `classification` is `null` (legacy/Zoho-imported rows predating the classification system — same population the card footer already labels "Unclassified").
- [ ] `/v2/portfolio-tracker`: both new filters stay URL-synced (`?status=...&classification=...`), following the exact same param convention already used by `search`/`page`/`pageSize` on this page and by `status`/`classification` on `/v2/projects`: param absent → every option selected (unfiltered), param `""` → explicitly zero selected, otherwise a comma-separated list.
- [ ] `/v2/portfolio-tracker/status-report`: replace the `HEALTH_FILTERS` pill row with a `FilterMultiSelect` "Health" dropdown, options = the four real `HealthTone` values (`on_track`, `at_risk`, `needs_attention`, `ahead_of_schedule`) via `HEALTH_LABEL`.
- [ ] `/v2/portfolio-tracker/status-report`: add the same "Classification" `FilterMultiSelect` (options = `CLASSIFICATIONS` + `"unclassified"`).
- [ ] `/v2/portfolio-tracker/status-report`'s two new filters stay **local `useState`** (not URL-synced) — this page has no URL-synced filters today (search/health/phase/sort/includeCompleted are all plain component state) and no pagination; adding URL sync is a separate, larger change than "match the filter *component* used on `/v2/projects`" and is called out below as explicitly out of scope. Only the dropdown UI pattern is being adopted here, not the URL-persistence layer.
- [ ] "All selected" on both new dropdowns must behave as **no filter applied** (not as an explicit `.in()`-style match against exactly those values) so that `null`-valued rows (`classification: null` "Unclassified" is handled by its own bucket, but Status Report's `health: null` has no such bucket) still show up when nothing is deliberately narrowed. See Key Design Decisions.
- [ ] "Clear filters" pill on both pages resets the new filters back to full-selection along with the existing filters it already resets.
- [ ] `isFiltered` computation on both pages accounts for the two new filters (so the "Clear filters" pill appears/hides correctly).

## Out of Scope / Must-Not-Change

- No changes to `/v2/projects` (`_projects-index.tsx`, `page.tsx`) — it's the reference pattern, not a target of this task. Do not export anything out of that file; the shared component is a new, separate file.
- No DB/migration changes. `classification` is already selected and returned by both `/api/onboarding/projects` and `/api/onboarding/projects/status-report` — this is a pure frontend filtering task.
- No changes to `/api/onboarding/projects` or `/api/onboarding/projects/status-report` route handlers.
- Do not add URL-sync, server-side filtering, or pagination to the Status Report page — out of scope (see Requirements note above and Key Design Decisions). Flag to the user separately if that turns out to be wanted.
- Do not convert the Phase filter (`<select>`) or Sort control on either page into `FilterMultiSelect` — on `/v2/projects` itself, Sort stays a plain native `<select>` (`SortSelect`); only enumerable categorical filters (Status, Type) use the checkbox dropdown. Phase and Sort are not categorical multi-value filters in the same sense and stay as-is.
- Do not touch `includeCompleted` (checkbox) on the Status Report page.
- Do not change the `classification` scalar's derivation (`primaryClassification` logic in the API routes) — this task only reads and filters on the existing value.
- Do not restructure card/table layout, columns, or add new displayed columns — filters only.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/portfolio-tracker/_filter-multi-select.tsx` | Create | Shared `FilterMultiSelect` component + `parseMultiParam` helper, lifted from `_projects-index.tsx` (lines ~65-71, ~226-333), scoped to the Portfolio Tracker feature area (both `_onboarding-list.tsx` and `status-report/_status-report-client.tsx` import from here). Same portal-positioned checkbox-dropdown behavior, same navy-fill selection styling (DESIGN.md: navy = selection/filter state). |
| `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx` | Modify | Replace `STATUS_FILTERS` pill row with `FilterMultiSelect` (4-value Status). Add Classification `FilterMultiSelect`. Extend URL read/write (`statusSelected`, `classificationSelected` via `parseMultiParam` + a `handleMultiChange`-style encode helper). Extend `filtered` predicate and `isFiltered`. Import `CLASSIFICATIONS` from `@/config/customer-phases`. |
| `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-client.tsx` | Modify | Replace `HEALTH_FILTERS` pill row with `FilterMultiSelect` (local state, not URL). Add Classification `FilterMultiSelect` (local state). Extend the `filtered` `useMemo` and `isFiltered`/clear-filters reset. Import `CLASSIFICATIONS` from `@/config/customer-phases`. |

No other files change — `_status-report-types.ts`, both API routes, and `_status-report-table.tsx` already carry/display everything needed.

## Code Context

### `_projects-index.tsx` — the pattern being ported (read-only reference, do not modify)

`parseMultiParam` (lines 65-71):
```ts
// Reads a URL param encoding a checkbox-group selection: absent = "All" (every option
// checked, unfiltered); "" = explicitly zero checked; otherwise a comma-separated list.
function parseMultiParam(raw: string | null, options: readonly { value: string }[]): string[] {
  if (raw === null) return options.map((o) => o.value);
  if (raw === "") return [];
  return raw.split(",");
}
```

`FilterMultiSelect` (lines 244-333) — checkbox dropdown, portal-positioned off a trigger button, "All" checkbox syncs with full selection, outside-click + scroll/resize reposition handling. Takes `{ label, options, selected, onChange }`; `onChange(next: string[])` — persistence (URL push vs local state) is the caller's job, so it works unmodified for both a URL-synced caller (Portfolio Tracker) and a local-state caller (Status Report).

`handleMultiChange` (lines 440-443) — the URL-encode side, to mirror for Portfolio Tracker's two filters:
```ts
function handleMultiChange(key: "status" | "classification", next: string[], optionsCount: number) {
  const value = next.length === optionsCount ? null : next.length === 0 ? "" : next.join(",");
  router.push(buildUrl({ [key]: value, page: 1 }));
}
```

### `src/config/customer-phases.ts` — classification source of truth
```ts
export const CLASSIFICATIONS = [
  "StackShift I",
  "StackShift II",
  "StackShift Access",
  "StackShift Access Plus",
  "PipelineForge",
  "Discrete Development",
] as const;
export type Classification = (typeof CLASSIFICATIONS)[number];
```

### `_onboarding-list.tsx` — current single-select pill row to replace (lines 199-203, 344-360)
```ts
const STATUS_FILTERS = ["all", "draft", "scheduled", "in_progress"] as const;
const STATUS_FILTER_LABELS: Record<(typeof STATUS_FILTERS)[number], string> = {
  all: "All", draft: "Draft", scheduled: "Scheduled", in_progress: "In Progress",
};
```
Note `completed` is missing from `STATUS_FILTERS` even though `OnboardingProjectListItem["status"]` includes it — the new `FilterMultiSelect` options should cover all 4 values.

Card already displays classification (line 176): `{item.classification ? <Chip tone="neutral">{item.classification}</Chip> : <span className="text-[11px] text-[#5F6A88]">Unclassified</span>}` — "Unclassified" label text should match whatever the new filter option uses.

### `_status-report-client.tsx` — current single-select pill row to replace (lines 13-16, 110-124)
```ts
type HealthFilter = "all" | Exclude<HealthTone, null>;
const HEALTH_FILTERS: HealthFilter[] = ["all", "needs_attention", "at_risk", "on_track", "ahead_of_schedule"];
```
`HEALTH_LABEL` (in `_status-report-types.ts`) already maps the 4 real values to display labels — reuse directly for the new dropdown's `options`.

Current filter predicate (lines 62-77) to extend:
```ts
const filtered = useMemo(() => {
  let list = projects;
  if (!includeCompleted) list = list.filter((p) => !p.isFullyCompleted);
  const q = search.trim().toLowerCase();
  if (q) list = list.filter((p) => `${p.projectName} ${p.companyName}`.toLowerCase().includes(q));
  if (healthFilter !== "all") list = list.filter((p) => p.health === healthFilter);
  if (phaseFilter !== "all") list = list.filter((p) => p.currentPhase.phaseNumber === phaseFilter);
  // sort ...
}, [projects, search, healthFilter, phaseFilter, includeCompleted, sortBy]);
```

### Both list-item types already carry `classification` — no API change needed
- `OnboardingProjectListItem.classification: string | null` (`_onboarding-list.tsx:24`)
- `ProjectStatusReportItem.classification: string | null` (`status-report/_status-report-types.ts:14`)
- Both populated server-side from `customer_products.classification` (the single-value "primary classification" scalar — see `/api/onboarding/projects/route.ts:129` and `/api/onboarding/projects/status-report/route.ts:142`).

## Key Design Decisions (confirm during implementation, flag if wrong)

1. **Status Report's new filters are local state, not URL-synced.** This page has zero URL-synced filters today (unlike Portfolio Tracker, which already URL-syncs search/status/page/pageSize). Matching `/v2/projects`' *filter component* (the checkbox dropdown) is what was asked for; matching its *URL-persistence architecture* is a bigger, separate change this task doesn't attempt. If the user actually wants bookmarkable/shareable Status Report filters too, that's a good, cheap follow-up but should be its own explicit ask.
2. **"All selected" = no filter applied, not an exact `.in()` match.** For the Status Report Health filter specifically: `health` can be `null` (no active/overdue phase to roll up). If "All 4 real values selected" were implemented as `healthSelected.includes(p.health)`, `null`-health rows would silently disappear even when the user hasn't touched the filter — a regression from today's `healthFilter === "all"` (no filter) behavior. Implementation must special-case: only apply the `.includes()` filter when `selected.length !== options.length`, mirroring `/v2/projects`' "full selection clears the param entirely" URL convention, ported to the in-memory local-state case here.
3. **"Unclassified" bucket.** `classification` is `null` for legacy/pre-classification-system projects. Rather than silently excluding them from the Classification filter (or making them unreachable), they get a synthetic `"unclassified"` option that behaves like any other value: `(p.classification ?? "unclassified")` is what gets compared against `selected`.
4. **Portfolio Tracker's Status filter now includes `completed`.** Today's pill row can't filter to completed onboardings at all. Since `/v2/projects`' STATUS_OPTIONS pattern covers the full status enum, the ported dropdown should too — this is a minor scope addition beyond "just add Classification" but is necessary to actually match the referenced pattern rather than half-porting it.

## Implementation Steps

1. Create `src/app/v2/(hub)/portfolio-tracker/_filter-multi-select.tsx`: move `parseMultiParam` and `FilterMultiSelect` (plus its internal `FilterCheckRow` helper) out of `_projects-index.tsx` into this new file, unchanged in behavior/styling. Export both. Leave `_projects-index.tsx` untouched otherwise (do not have it import from the new file — it keeps its own copy, per the "reference implementation stays put" boundary above) — or, if truly identical, decide once at implementation time whether `_projects-index.tsx` should import from the new shared file instead of keeping a duplicate; either is acceptable, but do not let that decision touch `/v2/projects`' behavior.
2. `_onboarding-list.tsx`: import `FilterMultiSelect`, `parseMultiParam` from `./_filter-multi-select` and `CLASSIFICATIONS` from `@/config/customer-phases`. Define `STATUS_OPTIONS` (4 values, replacing `STATUS_FILTERS`/`STATUS_FILTER_LABELS`) and `CLASSIFICATION_OPTIONS` (`CLASSIFICATIONS` + `unclassified`). Wire `statusSelected`/`classificationSelected` from `searchParams` via `parseMultiParam`, replace the pill-row JSX with two `FilterMultiSelect`s, add a `handleMultiChange`-equivalent that pushes to `buildUrl`. Update `filtered` predicate and `isFiltered`.
3. `status-report/_status-report-client.tsx`: import `FilterMultiSelect` from `../_filter-multi-select` and `CLASSIFICATIONS` from `@/config/customer-phases`. Replace `healthFilter` single-value state with `healthSelected: string[]` (default = all 4 real values) and add `classificationSelected: string[]` (default = all `CLASSIFICATION_OPTIONS` values). Replace the pill-row JSX with two `FilterMultiSelect`s. Update the `filtered` `useMemo` (full-selection-means-unfiltered logic per Key Design Decision 2) and the `isFiltered`/"Clear filters" reset handler.
4. Manual/browser verification (see below).

## Acceptance Criteria

- [ ] `/v2/portfolio-tracker`: Status and Classification render as checkbox-dropdown `FilterMultiSelect`s matching `/v2/projects`' visual style (pill trigger showing "Status: All" / "N selected" / single label, portal dropdown with checkboxes, "All" row).
- [ ] `/v2/portfolio-tracker`: filtering to a subset of statuses (e.g. only "Completed") correctly narrows the grid; filtering to a subset of classifications (e.g. only "StackShift I") correctly narrows the grid; "Unclassified" isolates legacy/no-classification projects.
- [ ] `/v2/portfolio-tracker`: reloading the page or sharing the URL preserves the selected Status/Classification filters (URL params round-trip via `parseMultiParam`).
- [ ] `/v2/portfolio-tracker/status-report`: Health and Classification render as checkbox-dropdown `FilterMultiSelect`s; narrowing either correctly filters the table.
- [ ] `/v2/portfolio-tracker/status-report`: with no filter touched, rows whose `health` is `null` (no active phase) still appear — confirms the "full selection = unfiltered" special case works, not a silent regression.
- [ ] "Clear filters" pill appears only when at least one filter (search, status/health, classification, phase, includeCompleted) is non-default, and resets all of them including the two new ones, on both pages.
- [ ] No visual regression to `/v2/projects` — it is unmodified (or, if the shared-file dedup path was taken, behaves pixel-identically).
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new warnings/errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manual check:
# 1. /v2/portfolio-tracker — toggle Status/Classification dropdowns, confirm grid narrows, confirm URL updates, confirm reload preserves filters, confirm "Clear filters" resets both.
# 2. /v2/portfolio-tracker/status-report — toggle Health/Classification dropdowns, confirm table narrows, confirm a null-health row stays visible when nothing is filtered, confirm "Clear filters" resets both.
# 3. /v2/projects — spot-check Status/Type filters still behave exactly as before (regression check on the reference implementation).
```

## Compatibility Touchpoints

- None — no DB migration, no API route changes, no shared type changes outside the two page-scoped client components and one new page-scoped helper file. `_docs/mcp-tools.md` not affected (no MCP tool touches these routes).

## Implementation Notes

### What Changed
- Extracted `/v2/projects`' checkbox-dropdown `FilterMultiSelect` (+ `parseMultiParam`) into a new shared file scoped to the Portfolio Tracker feature area. `_projects-index.tsx` was left untouched — it keeps its own copy, per the plan's "reference implementation stays put" boundary.
- `/v2/portfolio-tracker`: replaced the single-select Status pill row with a `FilterMultiSelect` covering the full 4-value status enum (Draft/Scheduled/In Progress/Completed — closing the gap where Completed wasn't filterable), URL-synced exactly like the existing search/page/pageSize params. Added a new Classification `FilterMultiSelect` (`CLASSIFICATIONS` + "Unclassified"), also URL-synced.
- `/v2/portfolio-tracker/status-report`: replaced the single-select Health pill row with a `FilterMultiSelect` (4 real `HealthTone` values), kept as local `useState` (this page has no URL-synced filters today). Added the same Classification `FilterMultiSelect`, also local state. Full selection on both is treated as "no filter applied" so `health: null` rows aren't silently dropped when nothing has been deliberately narrowed.
- Verified in-browser against the live dev server (authenticated session): both pages render the new dropdowns, narrowing to a subset correctly filters the grid/table, "Clear filters" resets everything including the two new filters, and `/v2/projects` is unaffected (regression check).

### Files Changed
- `src/app/v2/(hub)/portfolio-tracker/_filter-multi-select.tsx` - New shared `FilterMultiSelect` + `parseMultiParam`, ported from `_projects-index.tsx`.
- `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx` - Status/Classification `FilterMultiSelect`s, URL-synced state, `handleMultiChange` helper, extended `filtered`/`isFiltered`.
- `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-client.tsx` - Health/Classification `FilterMultiSelect`s, local-state selections, extended `filtered` `useMemo`/`isFiltered`/clear-filters handler; removed now-unused `cn` import.

### Deviations From Plan
- None. Implemented exactly as scoped, including both Key Design Decisions (full-status-enum Status filter; "full selection = unfiltered" semantics for Health).

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing warnings in an unrelated file, not introduced by this task)
- Manual browser verification (`pnpm dev`, authenticated session) - PASS: Status/Classification narrowing on Portfolio Tracker, Health/Classification narrowing on Status Report, Clear filters on both, `/v2/projects` regression check

## Follow-up Amendment (same session, post-review): Phase Filter → Multi-Select, Sort Parity on Both Pages

User reviewed the Testing-stage implementation and asked for three more changes, each with reference screenshots: (1) convert Status Report's Phase filter from a native single-select `<select>` to the same checkbox multi-select pattern as Health/Classification; (2) restyle Status Report's Sort control to match `/v2/projects`' pill-shaped `SortSelect` (icon + rounded-full pill) instead of the plain `rounded-lg` `<select>`, with a broader option set analogous to Projects' 6-item list; (3) add a Sort control to Portfolio Tracker, which had none at all.

### What Changed
- New `src/app/v2/(hub)/portfolio-tracker/_sort-select.tsx` — shared `SortSelect` component (icon-prefixed, `rounded-full` pill, native `<select>` underneath), ported from `_projects-index.tsx`'s `SortSelect` but generalized to plain `string` value/options since the two pages' sort criteria differ. `_projects-index.tsx` itself is untouched.
- Status Report Phase filter: replaced the native `<select>` with a `FilterMultiSelect` (`PHASE_OPTIONS` = the 5 `PROGRAMME_PHASES`), same "full selection = unfiltered" pattern as Health/Classification. `phaseFilter: number | "all"` → `phaseSelected: string[]`.
- Status Report Sort: restyled with `SortSelect`, and expanded from 2 options (`overdue`, `name`) to 6, matching Projects' option *count* while mapping to data this report actually has (no `updated_at` field exists here, so "Recently updated" has no analog — replaced with the report-native "Most overdue first" default): Most overdue first, Project name (A–Z), Project name (Z–A), Days left (soonest), Programme start (newest), Programme start (oldest).
- Portfolio Tracker: added a `SortSelect` (previously absent entirely), URL-synced (`?sort=`) exactly like the existing search/status/classification params. 5 options: Newest first (default), Oldest first, Name (A–Z), Name (Z–A), Handover date (soonest). "Newest"/"Oldest" use `programme_started_at`, falling back to `scheduled_onboarding_start_at` for not-yet-started rows; two dedicated null-safe comparators (`compareNullableAsc`/`compareNullableDesc`) push rows with neither date to the end regardless of direction — a naive "swap operands for descending" approach was tried first and rejected because it puts the null-date row *first* instead of last (documented inline).
- Verified in-browser: Phase multi-select narrows the Status Report table correctly (11→4 projects for "Migrate & Rebrand" only); Status Report sort options (`name_asc`, `days_left_asc`) verified via direct `<select>` value dispatch (native-select dropdown overlays aren't screenshot-capturable) and produce correct ordering; Portfolio Tracker sort verified via direct URL params (`?sort=name_asc`, `?sort=due_soonest`, `?sort=oldest`) — all produce correct ordering including the past-due-dates-sort-first semantics that matches Projects' own "Due date (soonest)" behavior. No console errors on either page.

### Files Changed
- `src/app/v2/(hub)/portfolio-tracker/_sort-select.tsx` - New shared `SortSelect`, ported from `_projects-index.tsx`.
- `src/app/v2/(hub)/portfolio-tracker/status-report/_status-report-client.tsx` - Phase `FilterMultiSelect` (replacing native select), `SortSelect` with 6 expanded options, updated `filtered` `useMemo`/`isFiltered`/clear-filters handler.
- `src/app/v2/(hub)/portfolio-tracker/_onboarding-list.tsx` - New `SortSelect` (URL-synced `sort` param), `SORT_OPTIONS`, `compareNullableAsc`/`compareNullableDesc`/`effectiveStartTime` helpers, sorting inserted into the filter→sort→paginate pipeline.

### Deviations From Plan
- None from the user's ask. One internal correction during implementation: the first draft of the "newest first" (descending) comparator swapped `compareNullableAsc`'s operands instead of writing a dedicated descending comparator — caught and fixed before verification (see code comment in `_onboarding-list.tsx`), since swapping breaks the "nulls always sort last" guarantee for the descending case specifically.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (same 2 pre-existing unrelated warnings)
- Manual browser verification (`pnpm dev`, authenticated session) - PASS: Phase multi-select filtering, Status Report sort (name/days-left), Portfolio Tracker sort (newest/oldest/name/due-soonest) via URL params, no console errors
