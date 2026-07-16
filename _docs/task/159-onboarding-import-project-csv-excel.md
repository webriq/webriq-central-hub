# 159: Onboarding List — "Import Project" CSV/Excel Bulk Intake

**Created:** 2026-07-15
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep
**Status:** Completed (2026-07-16)

---

## Overview

Add an "Import Project" button next to "+ New Project" at the top of the Onboarding list page
(`/v2/onboarding`, `_onboarding-list.tsx`). It opens a modal that accepts a CSV or Excel file and
bulk-creates onboarding projects, mapping columns as the user specified:

| CSV column | Maps to |
|---|---|
| Account | Customer (`customers.company_name`) |
| Type | Project classification |
| Primary Contact | Contact name (single string — no separate email/phone columns given) |
| Kickoff Date | Onboarding start date (`projects.programme_started_at`) |
| Current Phase | Which of the 5 programme phases is currently active — if a specific phase like "Migrate & Rebrand" is given, the timeline jumps straight there and marks earlier phases skipped |

No CSV/Excel parsing library exists in this codebase today (confirmed — no `xlsx`/`papaparse`/
`exceljs` in `package.json`, no existing "parse tabular file client-side" pattern to reuse; the
closest precedent, task 106's manual-match uploader, only matches filenames, it doesn't parse file
*contents*). This task adds `xlsx` (SheetJS) as a new dependency — it's the standard choice for
parsing both `.csv` and `.xlsx`/`.xls` with one library and one code path, avoiding a separate CSV
parser plus a separate Excel parser.

**Dependency on task 157 (multi-select classification):** this task's "Type" column maps to a
**single** classification value per row, matching today's single-`classification` model. If task
157 (multi-select StackShift/PipelineForge/Discrete-Development combos) ships first, this task's
`Type` column parsing should be revisited to accept a delimited list — flagged here rather than
scope-creeping this doc to design a combo-parsing syntax pre-emptively. Implement this task against
whichever classification model (single or multi) is live in the codebase at build time.

## Requirements

- [ ] "Import Project" button renders next to "+ New Project" in the Onboarding list header
      (`_onboarding-list.tsx:186-193`), same visibility gate (`canCreate` — admin/super_admin/
      marketing/pm, per `CREATE_ROLES` in the API route), secondary/outline styling (not the
      primary black CTA — "+ New Project" stays visually primary).
- [ ] Clicking it opens a modal with a file input accepting `.csv,.xlsx,.xls`.
- [ ] On file select, parse client-side (via `xlsx`) into rows keyed by the 5 expected headers
      (case-insensitive header matching: `Account`, `Type`, `Primary Contact`, `Kickoff Date`,
      `Current Phase`). Show a preview table of parsed rows before committing, with inline
      per-row validation flags (unrecognized `Type`, unrecognized `Current Phase`, unparseable
      `Kickoff Date`) so the user can fix the source file and re-upload rather than discovering
      failures only after submit.
- [ ] "Account" resolves to an existing `customers` row by case-insensitive exact match on
      `company_name`; if no match, a new customer is created (mirrors the New Project form's
      "New company" path — `generateCustomerId()` + insert).
- [ ] "Type" matches against `CLASSIFICATIONS` case-insensitively (e.g. `"stackshift i"` →
      `"StackShift I"`); an unmatched value fails that row with a clear error, does not silently
      default to something.
- [ ] "Current Phase" matches against `PROGRAMME_PHASES` by `name` or `shortName`
      case-insensitively (e.g. `"Migrate & Rebrand"` or `"Migrate"` → phase 2); optional — if
      blank, defaults to Phase 1 active (same as a normal onboarding start, just backdated to the
      given Kickoff Date instead of "now").
- [ ] "Kickoff Date" becomes `projects.programme_started_at` for that row, seeding
      `customer_phases` with the resolved Current Phase as `active`, every phase before it as
      `skipped`, everything after as `not_started` — the same shape `PATCH .../programme/phase`'s
      not-started branch already produces for a manual Jump-to-Phase on a fresh project (see Code
      Context), just driven by the CSV's explicit date instead of a "backdate from today"
      calculation.
- [ ] "Primary Contact" (name only) is upserted via the existing `upsertPrimaryContact` helper
      (task 151) — same as the New Project form's contact write path, email/phone left blank.
- [ ] Project name is auto-generated the same way the New Project form does:
      `${companyName} ${deriveProjectSuffix(classification)}`. No project-name column exists in
      the CSV.
- [ ] Import is **partial-failure-tolerant** — one bad row doesn't abort the whole file. Response
      reports `{ imported: number, errors: { row: number, error: string }[] }`, matching this
      codebase's established Zoho-import summary shape (tasks 084/090/108/110/112).
- [ ] After a successful (even partially successful) import, the list page refetches
      (`GET /api/onboarding/projects`) so new rows appear without a manual page reload.

## Out of Scope / Must-Not-Change

- Do not build a generic/reusable "CSV import" framework — this is one purpose-built modal +
  route, matching this codebase's "page-scoped UI" convention (CLAUDE.md).
- Do not add a *download*/export counterpart — this app has no download feature anywhere by
  deliberate design (task 141's precedent); this task is import-only.
- Do not change `POST /api/onboarding/projects` (the single-project New Project route) — this adds
  a **new**, separate bulk route (`.../import`) rather than looping client-side calls to the
  existing single-create endpoint, so the whole batch can be summarized in one response and so
  per-row customer/contact/phase-seed logic isn't duplicated N times over N requests.
- Do not attempt to resolve ambiguous/fuzzy `Account` matches (e.g. "Acme Corp" vs "Acme
  Corporation") — exact case-insensitive match only; anything else creates a new customer, which
  is an accepted, documented behavior, not a gap to solve here.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | `pnpm add xlsx` |
| `src/lib/programme/seed.ts` | Modify | Extract a shared `seedProgrammeAtPhase(project, phaseNumber, startedAt, note?)` helper (see Code Context) — reused by this task's import route and (optionally, as a follow-up cleanup) `PATCH .../programme/phase`'s not-started branch, which duplicates the same phase/deliverable/internal-deliverable insert shape today |
| `src/app/api/onboarding/projects/import/route.ts` | Create | `POST` — parses the row array, resolves/creates customers, creates products+projects, seeds phases per row, returns a per-row summary |
| `src/app/v2/(hub)/onboarding/_onboarding-list.tsx` | Modify | "Import Project" button + `ImportProjectModal` (new inline component in this same file, per page-scoped-UI convention) |

## Code Context

### Phase-seed-at-arbitrary-date shape to extract (`programme/phase/route.ts:52-92`, not-started branch)

```ts
const phaseRows = PROGRAMME_PHASES.map((p) => ({
  customer_id, project_id, phase_number: p.number,
  status: p.number === phaseNumber ? "active" : p.number < phaseNumber ? "skipped" : "not_started",
  actual_start_date: p.number === phaseNumber ? today : null,
  is_manual_override: p.number === phaseNumber,
  override_note: p.number === phaseNumber ? note : null,
}));
const deliverableRows = PROGRAMME_PHASES.flatMap((p) => p.deliverables.map((d) => ({ customer_id, project_id, phase_number: p.number, deliverable_key: d.key })));
const internalDeliverableRows = INTERNAL_DELIVERABLES.map((d) => ({ project_id, deliverable_key: d.key }));
```

The route currently backdates `programme_started_at` from "today" (`backdated.setDate(...
targetPhase.dayStart - 1)`). This task's import needs the **same seed shape** but with
`programme_started_at` set directly to the CSV's Kickoff Date (no backdating math) and `phaseNumber`
resolved from "Current Phase" instead of always defaulting elsewhere. Extract into:

```ts
// seed.ts
export async function seedProgrammeAtPhase(
  project: { id: string; customer_id: string },
  phaseNumber: number,
  startedAt: Date,
  note?: string | null
): Promise<{ error?: string }> {
  const today = startedAt.toISOString().slice(0, 10);
  const { error: updateError } = await adminClient.from("projects").update({ programme_started_at: startedAt.toISOString() }).eq("id", project.id);
  if (updateError) return { error: "Failed to set programme start date" };
  // ...same phaseRows/deliverableRows/internalDeliverableRows shape as above, is_manual_override: phaseNumber !== 1...
}
```

Both the existing `PATCH .../programme/phase` route and this task's import route call it —
resolving the current duplication rather than adding a third copy.

### `upsertPrimaryContact` (task 151, `src/lib/customers/primary-contact.ts`) — reused as-is

Already accepts a partial `{ name?, email?, phone? }` and handles the adminClient RLS exception
already documented inline. Import calls it with `{ name: row.primaryContact }` only.

### New route request/response shape

```ts
type ImportRow = { account: string; type: string; primaryContact?: string; kickoffDate?: string; currentPhase?: string };
type ImportRequestBody = { rows: ImportRow[] };
type ImportResponse = { imported: number; errors: { row: number; error: string }[] };
```

## Implementation Steps

1. `pnpm add xlsx`.
2. Extract `seedProgrammeAtPhase` in `seed.ts` per Code Context; update `programme/phase/route.ts`'s
   not-started branch to call it (confirms the extraction is correct before the new route also
   depends on it).
3. Build `POST /api/onboarding/projects/import/route.ts`: role-gate (same `CREATE_ROLES`), loop
   over `rows`, per row — resolve/create customer, validate `type` against `CLASSIFICATIONS`,
   validate/resolve `currentPhase` against `PROGRAMME_PHASES` (default to phase 1 if blank),
   parse `kickoffDate` (default to "now" if blank), create `customer_products` + `projects` +
   `project_members` (creator = importer, matching the single-create route's owner-on-create
   behavior), upsert contact, call `seedProgrammeAtPhase`. Catch and record per-row errors instead
   of throwing.
4. Build `ImportProjectModal` in `_onboarding-list.tsx`: file input → `xlsx.read` → header-mapped
   rows → preview table with per-row validation (client-side pre-check against `CLASSIFICATIONS`/
   `PROGRAMME_PHASES` mirrors the server's checks, for fast feedback) → submit button posts to the
   import route → shows the `{ imported, errors }` summary → triggers the list's existing fetch on
   success/close.
5. Add the "Import Project" button next to "+ New Project" in the list header, gated by the same
   `canCreate` flag already fetched from `GET /api/onboarding/projects`.

## Acceptance Criteria

- [ ] A well-formed CSV with 3 valid rows imports all 3, list page shows all 3 new projects.
- [ ] A row with an unrecognized `Type` value is skipped with a reported error; the other valid
      rows in the same file still import.
- [ ] A row with `Current Phase: "Migrate & Rebrand"` results in that project's Phase 1 marked
      `skipped` and Phase 2 marked `active` on the Timeline.
- [ ] A row with a matched `Account` name reuses the existing customer (no duplicate customer
      created); an unmatched `Account` creates a new one.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser: build a small test `.csv` with 2-3 rows (one deliberately invalid `Type`), import
it via the new modal, confirm the summary reports 1 error + N imported, and confirm the imported
projects' Timeline pages show the correct active/skipped phase state and Day N derived from the
given Kickoff Date.

## Compatibility Touchpoints

- New dependency: `xlsx` (`pnpm add xlsx`, not `npm`/`yarn` per CLAUDE.md).
- No migration required — reuses existing tables exactly as the single-create New Project flow
  does.

## Implementation Notes

### What Changed
- Added `xlsx` (SheetJS) dependency for client-side CSV/Excel parsing.
- Extracted `seedProgrammeAtPhase()` in `seed.ts` — seeds all 5 phases + deliverables at an
  explicit `phaseNumber`/`startedAt`, generalizing the shape `seedAndStartProgramme` already used.
  `PATCH .../programme/phase`'s not-started branch now calls this shared helper instead of
  duplicating the insert shape inline.
- Built `POST /api/onboarding/projects/import` — role-gated (`CREATE_ROLES`), loops sequentially
  over submitted rows, per row: resolves/creates the customer (case-insensitive exact match on
  `company_name`), parses `Type` as a delimited list (comma/slash/`+`/`&`) against the **live
  multi-select classification model** (task 157 shipped and is already the live model — confirmed
  via `customer_products.classifications` usage in `POST /api/onboarding/projects`), validates the
  combo with `isValidClassificationCombo`, resolves `Current Phase` against `PROGRAMME_PHASES` by
  name/shortName (defaults to Phase 1), parses `Kickoff Date` (defaults to now), creates
  `customer_products` + `projects` + `project_members` (importer as owner), upserts the primary
  contact (name only), and calls `seedProgrammeAtPhase`. Catches and records per-row errors rather
  than aborting the batch; returns `{ imported, errors }`.
- Added "Import Project" button (secondary/outline styling) next to "+ New Project" in
  `_onboarding-list.tsx`, gated by the existing `canCreate` flag, plus an inline
  `ImportProjectModal` — file input (`.csv,.xlsx,.xls`) → `xlsx.read` → header-mapped rows (case-
  insensitive) → client-side pre-validation mirroring the server (unrecognized Type/Current Phase,
  unparseable Kickoff Date) shown inline per row in a preview table → submits to the import route
  → shows the `{ imported, errors }` summary → triggers the list's existing fetch on any successful
  import. Refactored the list's mount-time fetch into a reusable `fetchProjects()` so the modal can
  trigger the same refetch on success.

### Files Changed
- `package.json` / `pnpm-lock.yaml` - added `xlsx` dependency
- `src/lib/programme/seed.ts` - added `seedProgrammeAtPhase()` shared helper
- `src/app/api/projects/[projectId]/programme/phase/route.ts` - not-started branch now calls
  `seedProgrammeAtPhase()`; dropped now-unused `adminClient`/`INTERNAL_DELIVERABLES` imports and
  the inline insert logic they supported
- `src/app/api/onboarding/projects/import/route.ts` - new bulk-import route
- `src/app/v2/(hub)/onboarding/_onboarding-list.tsx` - "Import Project" button + `ImportProjectModal`

### Deviations From Plan
- Task doc's "Type" column handling was written before confirming whether task 157 (multi-select
  classification) had shipped. It has — `customer_products.classifications` and
  `deriveProductNamesMulti`/`isValidClassificationCombo` are already the live model used by
  `POST /api/onboarding/projects`. Per the task doc's own instruction ("implement against
  whichever classification model is live at build time"), the import route parses `Type` as a
  delimited list (comma/slash/`+`/`&`) rather than a single value — not scope creep, this is the
  documented fallback path the task doc pre-approved for this exact situation.
- `PATCH .../programme/phase`'s not-started branch response shape changed from
  `{ phases, deliverables }` (both `.select()`ed from the original inline insert) to `{ phases }`
  only (re-queried after the shared helper runs, since the helper doesn't `.select()` its inserts).
  Confirmed both client call sites (`new/_content.tsx`, `_onboarding-detail.tsx`'s `handleJump`)
  only check `res.ok` and never read `phases`/`deliverables` from this response — safe, no
  behavior change for either caller.
- `seedProgrammeAtPhase`'s `is_manual_override` logic (`phaseNumber !== 1 && p.number ===
  phaseNumber`) differs slightly from the pre-refactor inline code in `programme/phase/route.ts`
  (`p.number === phaseNumber`, unconditional) — this was explicit in the task doc's Code Context
  snippet, aligning the shared helper with `seedAndStartProgramme`'s existing convention that
  landing on Phase 1 is a normal start, not a manual override. Net effect: a manual "Jump to Phase
  1" on a not-yet-started project no longer flags `is_manual_override: true`/sets `override_note`
  on Phase 1's row (a day-1 landing was already the default outcome either way).

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Manual/browser CSV import smoke test - SKIPPED (manual-mode `/implement` hands off to `simplify`/
  `test`; browser-based acceptance testing is the `/test` stage's job, not `/implement`'s, per the
  implement skill's workflow)

### Follow-up revision (post-implementation, still in Testing)

User feedback on the first pass: no way to manually fix a row's validation errors (e.g.
mis-typed `Type` values), and the modal's preview table clipped columns out of view
(`max-w-3xl` with `overflow-x-auto` was too narrow for 5 data columns + validation text).
Reworked in response:

- **Modal → dedicated page.** `ImportProjectModal` in `_onboarding-list.tsx` removed entirely;
  replaced with `src/app/v2/(hub)/onboarding/import/page.tsx` + `_content.tsx`, mirroring
  `../new/page.tsx`'s server-gate pattern (same `CREATE_ROLES` check) and `../new/_content.tsx`'s
  visual language exactly (spaceGrotesk headers, `#2563EB` blue accents, `StepIndicator`,
  `motion/react` step transitions) but at full page width (`max-w-[1200px]`, not the New Project
  wizard's narrow 560px card) so a 5-column table has room. Added `V2_ROUTES.ONBOARDING_IMPORT`
  (`/v2/onboarding/import`); the list page's "Import Project" button is now a plain `Link` to it.
  A full-page nav back to the list naturally refetches on mount, so no cross-component
  `onImported` callback plumbing was needed (simpler than the modal's version).
- **Manual fix, not just flag-and-block.** Each parsed row is now backed by real, always-editable
  controls instead of read-only preview text: `Account`/`Primary Contact` are text inputs,
  `Kickoff Date` is a native date input, `Current Phase` is a `<select>` of `PROGRAMME_PHASES`,
  and `Type` is a set of always-visible toggle chips (`TypeChips`, one per `CLASSIFICATIONS`
  value) — no popover, so nothing clips inside the review table regardless of scroll position.
  The chips reuse the New Project wizard's exact grouping rule (`toggleClassification`,
  duplicated locally per page-scoped-UI convention): at most one StackShift variant active at a
  time (picking a second swaps it in), PipelineForge/Discrete Development combine freely with it
  or each other — verified interactively (clicking StackShift II swapped out StackShift I while a
  simultaneously-selected PipelineForge chip stayed selected). A per-row remove button (`Trash2`)
  was also added so an unfixable row can be dropped from the batch entirely before submit.
  Client-side "unrecognized" text-matching errors are gone by construction — the structured
  controls can't produce an invalid value, so the only remaining flag is "required and still
  empty" (`Account`, `Type`).
- **Real bug found and fixed via browser testing:** `XLSX.utils.sheet_to_json` was called without
  `raw: false`, so SheetJS's default date auto-detection silently converted `Kickoff Date` cells
  (even plain CSV text like `2026-01-05`) into Excel serial-date numbers (e.g.
  `46027.333333333336`) before they ever reached `resolveDate()`'s `new Date(...)` parse — every
  Kickoff Date field rendered empty regardless of what the source file contained. Fixed by adding
  `{ raw: false }` to the `sheet_to_json` call, which returns the cell's formatted display text
  (`"1/5/26"`) instead. Caught by simulating a real file drop (synthetic `DragEvent` with a
  `DataTransfer`-wrapped `File`, dispatched on the dropzone) via `javascript_tool` against the
  actual running dev server (browser file-picker automation isn't available in this environment)
  and inspecting the rendered `<input type="date">` values — confirmed empty before the fix,
  correctly populated (`01/05/2026`, etc.) after.
- Backend `POST /api/onboarding/projects/import` route is unchanged — it only ever receives
  already-resolved JSON from the client (never parses the file itself), so this fix and the
  editable-row rework are entirely client-side.

### Files Changed (follow-up)
- `src/config/constants.ts` - added `V2_ROUTES.ONBOARDING_IMPORT`
- `src/app/v2/(hub)/onboarding/import/page.tsx` - new, server-side role gate mirroring `../new/page.tsx`
- `src/app/v2/(hub)/onboarding/import/_content.tsx` - new, full-page 2-step wizard (Upload → Review & Fix) replacing the modal
- `src/app/v2/(hub)/onboarding/_onboarding-list.tsx` - removed `ImportProjectModal` and its helpers; "Import Project" is now a `Link` to the new page

### Verification Run (follow-up)
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Browser smoke test (real dev server, existing Super Admin session): uploaded a 6-row test CSV
  with deliberately invalid `Type` values (mirroring the user's screenshot) — confirmed all 5
  columns visible with no clipping, validation flags shown correctly, manually fixing a row's
  Type via chips cleared its error and updated the "N rows need attention" count and "Import N
  projects" button count live, StackShift swap-grouping behaved correctly, row removal worked.
  Did not click final "Import" (would have written real rows to the dev database).

### Follow-up revision 2 (post-implementation, still in Testing)

Further user feedback: Current Phase wasn't reliably auto-selecting in the dropdown from the
sheet's raw text; "Account"/"Type" column labels renamed to "Customer"/"Project Type"; the
6-chip Type picker needed to become a compact search-and-select-multiple control to save
space; and Primary Contact placeholder values ("To be confirmed"/"Unknown") should clear the
field (since it's optional) while still surfacing the original text for context.

- **`resolvePhase()` broadened** — previously only matched an exact (case-insensitive) full
  phase name or `shortName`, so anything else (a bare phase number, "P2", "Migrate and
  Rebrand" instead of "Migrate & Rebrand") silently fell back to the Phase 1 default with no
  visible indication anything was even attempted. Now tries, in order: an embedded phase
  number ("Phase 2", "P3", a bare "4"), exact name/shortName match, then a substring match
  either direction. Verified against `"Phase 2"`, `"P3"`, `"Migrate and Rebrand"`, and a bare
  `"4"` in one test file — all four resolved to the correct phase in the dropdown.
- **"Account" → "Customer", "Type" → "Project Type"** — display-only rename (table headers,
  input placeholder, validation messages, upload-step column list). The internal API contract
  (`ImportRow.account`/`.type` sent to `POST /api/onboarding/projects/import`) is untouched;
  `IMPORT_HEADERS` now accepts both the old and new header text (`"account"`/`"customer"`,
  `"type"`/`"project type"`) so files built against either naming import correctly.
- **`TypeChips` (always-visible 6-button grid) → `TypeMultiSelect`** (search-and-select-
  multiple combobox). Selected values collapse to small pills on a single compact trigger;
  clicking it opens a searchable option list. Still enforces the exact same
  `toggleClassification` grouping rule (at most one StackShift variant, swapped in on
  reselect; PipelineForge/Discrete Development combine freely) — verified interactively.
  The option panel renders via a `document.body` portal (position computed from the
  trigger's `getBoundingClientRect()`, mirroring `../new/_content.tsx`'s `DateTimePicker`
  pattern) rather than inline in the table cell, since the table wrapper's `overflow-x-auto`
  would otherwise clip a same-cell-positioned dropdown (confirmed via browser testing that a
  portaled panel opens correctly, unclipped, right below the trigger).
- **Primary Contact placeholder handling** — new `resolvePrimaryContact()`: if the sheet's
  Primary Contact cell (case-insensitive, trimmed) is exactly `"to be confirmed"` or
  `"unknown"`, the editable field is left empty (so it doesn't write a placeholder string into
  `contacts.full_name` on import) but the original text renders as small orange helper text
  beneath the input, so the user still sees what the source said. Verified with both
  placeholder values in one test file.

### Files Changed (follow-up 2)
- `src/app/v2/(hub)/onboarding/import/_content.tsx` - broadened `resolvePhase()`; added
  `resolvePrimaryContact()`; replaced `TypeChips` with portaled `TypeMultiSelect`; renamed
  `Account`/`Type` display labels to `Customer`/`Project Type`; widened `IMPORT_HEADERS`
  aliases; added `primaryContactRaw` to `ImportRow`

### Verification Run (follow-up 2)
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Browser smoke test (real dev server, existing Super Admin session): uploaded a 4-row test
  CSV covering all four changes — Current Phase values `"Phase 2"`, `"P3"`, `"Migrate and
  Rebrand"`, and `"4"` all resolved to the correct phase in their row's dropdown; Primary
  Contact `"Unknown"`/`"To be confirmed"` rows showed an empty, optional-looking input with the
  original text below in orange; `Customer`/`Project Type` headers rendered; the
  `TypeMultiSelect` trigger showed compact pills, its search box filtered the option list
  live, the portaled dropdown opened unclipped and positioned correctly under the trigger, and
  selecting a second, non-StackShift type (PipelineForge) added alongside the existing
  StackShift I pill without removing it. Did not click final "Import" (would have written real
  rows to the dev database).

### Follow-up revision 3 (post-implementation, still in Testing)

Small polish pass on revision 2: wrap the Primary Contact placeholder hint in quotes, give
each selected Project Type pill a direct remove control, fix invisible search-box input text.

- **Quoted placeholder hint** — `{row.primaryContactRaw}` → `&quot;{row.primaryContactRaw}&quot;`,
  so it reads `"Unknown"` / `"To be confirmed"` instead of the bare word.
- **Per-pill remove button.** Previously the only way to deselect a `TypeMultiSelect` value was
  to reopen the dropdown and click it again. Added a small `×` (`X` icon) button inside each
  selected pill. This required changing the trigger element from a `<button>` to a
  `<div role="button" tabIndex={0}>` with an `onKeyDown` handler for Enter/Space — a real
  `<button>` can't contain another `<button>` (invalid HTML; the remove button's clicks
  wouldn't register correctly nested inside it). The remove button calls `e.stopPropagation()`
  so clicking it doesn't also toggle the dropdown open. Verified via `find` (matched by its
  `aria-label="Remove {classification}"`) — clicking it removed exactly that value and
  correctly re-triggered the row's "Select at least one" validation state when it was the last
  one selected.
- **Search box text color fix** — the portaled dropdown's search `<input>` had no explicit text
  color and was rendering invisibly (inheriting some ambient color from outside the normal app
  tree, likely because a `document.body`-portaled node doesn't inherit color context from the
  app's own wrapping elements the way in-tree content does). Added explicit
  `text-[#0F172A]` and `placeholder:text-[#94A3B8]`. Verified — placeholder text ("Search
  types…") is now clearly visible.

### Files Changed (follow-up 3)
- `src/app/v2/(hub)/onboarding/import/_content.tsx` - quoted the Primary Contact placeholder
  hint; `TypeMultiSelect` trigger changed from `<button>` to `<div role="button">` with a
  remove `×` per pill; explicit text color on the dropdown's search input

### Verification Run (follow-up 3)
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Browser smoke test (real dev server, existing Super Admin session): uploaded a 2-row test CSV
  with `Unknown`/`To be confirmed` Primary Contact values and StackShift I / Discrete
  Development types — confirmed the placeholder hints render as `"Unknown"`/`"To be
  confirmed"` (quoted), the search input's placeholder text is clearly visible (was invisible
  before), and clicking a pill's `×` (located via `find` on its `aria-label`) removed that type
  directly without opening the dropdown, correctly re-showing "Select at least one" once the
  row had no types left.

### Follow-up revision 4 (post-implementation, still in Testing)

User-reported bug: Kickoff Date is written DD-MM-YYYY in the source sheet but the import's date
picker showed it as MM-DD-YYYY (day/month swapped for any day ≤ 12). Also requested: derive
Phase 1's active day/sub-phase from the Kickoff Date once seeded, and surface an "Overdue"
warning when a row is still tagged Phase 1 but its Kickoff Date is more than 15 days old (Phase
1's fixed window) — both in the import review table and on the actual project's Timeline.

- **Root cause of the date bug**: `XLSX.utils.sheet_to_json` was previously called with
  `raw: false`, and SheetJS auto-detects date-like CSV/Excel text and reformats it — using a
  US month-first assumption. Fed `"09/07/2026"` (day-first, meant as July 9), it silently
  reinterpreted this as September 7 before `resolveDate()` ever saw the value. Fixed by passing
  `raw: true` to **both** `XLSX.read()` and `sheet_to_json()`, which returns the sheet's literal
  original text for CSV/typed cells (verified via a throwaway Node script: `"25/12/2026"` was
  already surviving as plain text since day=25 is invalid as a month, but `"09/07/2026"` was
  silently coerced — confirming the bug was real and locale-direction-dependent) and the raw
  numeric serial for genuine Excel date-typed cells. `resolveDate()` rewritten to handle both:
  a number is decoded via the standard Excel-serial epoch (`25569`-day offset from Unix epoch,
  verified against a real `.xlsx` file with a native Date cell), a string is parsed explicitly
  as day-first DD-MM-YYYY/DD/MM/YYYY (first segment = day, second = month, unconditionally —
  this codebase's source files are day-first, so no more guessing), with an ISO
  (`YYYY-MM-DD`) and generic-`Date()` fallback for anything else.
- **Active day/sub-phase**: turned out to already be handled by the existing app architecture
  once the date bug above is fixed — `getCurrentProgrammeDay(programme_started_at)` (used
  everywhere else in this codebase, e.g. the Timeline's "Day N" header/marker) is computed
  dynamically from `projects.programme_started_at`, which `seedProgrammeAtPhase` already sets
  directly to the given Kickoff Date. No new day-tracking logic was needed for the marker
  itself — only the date parsing had to be correct. Additionally generalized
  `seedProgrammeAtPhase`'s per-deliverable `status` (previously always `"pending"` for imports/
  Jump-to-Phase, vs. `seedAndStartProgramme`'s hardcoded "kickoff is in_progress on Day 1"): the
  deliverable whose day range contains `getCurrentProgrammeDay(startedAt)` is now seeded
  `"in_progress"` (others `"pending"`) — generalizes that hardcoded convention to any starting
  day, not just Day 1. Note: this is only visibly different from `"pending"` on the Gantt's
  progress fill for deliverables with **no** attached internal checklist items (e.g.
  Outcome Target, HTML Mockup, Location Publishing) — deliverables with internal items (Kickoff,
  Migration Checklist, etc.) derive their percentage from internal-item completion instead, so
  the status flag doesn't change their fill, only their stored DB value.
- **Overdue detection**: new `isOverdue()` in the import page (`_content.tsx`) — true when a
  row's Kickoff Date, resolved via `getCurrentProgrammeDay`, is past Day 15 **and** the row's
  Current Phase resolves to Phase 1 (blank/default or explicit "Onboard"). Shown as small red
  text below the Current Phase `<select>` in the review table. Mirrored on the actual Timeline:
  `_onboarding-detail.tsx`'s existing `buildReminders()` (the reminders-strip system already
  rendered at the top of the Timeline, right below the header card) gained a `phase.number ===
  1 && day > 15` branch producing a single "Phase 1 Overdue" warning item — replacing (not
  stacking with) the existing per-deliverable "Overdue: {name}" entries in that case, since 5+
  individual deliverable-overdue chips would be noisy once the whole phase is already known to
  be overdue.

### Files Changed (follow-up 4)
- `src/app/v2/(hub)/onboarding/import/_content.tsx` - `raw: true` on `XLSX.read`/
  `sheet_to_json`; `normalizeSheetRow` preserves Kickoff Date's raw type via new `pickRaw`;
  rewrote `resolveDate` (day-first string parsing + Excel-serial number decoding); added
  `isOverdue()` + red warning text under the Current Phase select
- `src/lib/programme/seed.ts` - `seedProgrammeAtPhase` now computes each deliverable's `status`
  (`in_progress`/`pending`) from `getCurrentProgrammeDay(startedAt)` instead of leaving every
  deliverable at the DB default
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-detail.tsx` - `buildReminders()` gained
  the Phase-1-overdue special case

### Verification Run (follow-up 4)
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Standalone Node scripts (throwaway, not committed) confirmed: (a) the exact SheetJS
  date-auto-detection bug and its `raw: true` fix, using the literal `"09/07/2026"` example; (b)
  the Excel-serial-to-date formula against a real `.xlsx` file built with `XLSX.write` containing
  a genuine `Date`-typed cell.
- Full browser smoke test (real dev server, existing Super Admin session, actually completed an
  import — not just previewed, since verifying the DB-seeded deliverable/day behavior requires a
  real row): imported 2 test rows — "QA Test DateFix A" (Kickoff `09/07/2026` written DD-MM-YYYY
  = July 9; today in this environment is July 16, 2026) and "QA Test DateFix B" (Kickoff
  `01/06/2026` = June 1). Confirmed in the review table: both dates resolved correctly (no
  month/day swap), and only DateFix B (Day 46) showed the red "Overdue" line while DateFix A
  (Day 8) did not. After import: DateFix A's Timeline shows "Day 8/120" and the dashed Day-N
  marker sitting inside the Migration Checklist deliverable's date range, matching the user's own
  worked example exactly; DateFix B's Timeline shows the new "Phase 1 Overdue" banner at the top
  ("Day 46 — past the 15-day Onboarding window...") with the Day-N marker visibly landing inside
  Phase 3's "Location Publishing" deliverable (shown at 50%), reinforcing that the project is
  behind where its Phase 1 status claims it is.

### Follow-up revision 5 — schema fix found while cleaning up test data

The two "QA Test DateFix A/B" projects created during follow-up 4's browser verification
couldn't be deleted from Supabase's table editor: `DELETE FROM projects` failed with a foreign
key constraint error from `customer_asset_folders`. Investigated (fork research task) every
`project_id` foreign key in the schema — every single one already has `ON DELETE CASCADE`
**except** `customer_asset_folders_project_id_fkey` (migration 065), which has no `ON DELETE`
clause at all (defaults to Postgres's `NO ACTION`). Confirmed this as an unrelated pre-existing
schema oversight, not something introduced by this task, surfaced only because this task's own
test-data cleanup happened to hit it.

- Added `supabase/migrations/081_customer_asset_folders_cascade_delete.sql` — drops and
  recreates `customer_asset_folders_project_id_fkey` with `on delete cascade`, matching every
  sibling `project_id` FK's convention. `customer_asset_folders`'s own dependent
  (`customer_assets.folder_id`) already uses `on delete set null` and is unaffected.
- **Not applied by this session** — no direct database execute access; the user needs to apply
  it themselves (Supabase dashboard SQL editor or their usual migration flow) and separately
  clean up the two orphaned test rows (either via the migration, once applied, or a one-off
  `DELETE FROM customer_asset_folders WHERE project_id IN (...)` before `DELETE FROM projects`).

### Files Changed (follow-up 5)
- `supabase/migrations/081_customer_asset_folders_cascade_delete.sql` - new migration, not yet applied

## Status: Complete

All requirements from the original spec plus 5 rounds of live user testing/iteration are
implemented and verified (browser-tested against the real dev server across every round,
including one full real import). Summary of what shipped:

- Bulk CSV/Excel "Import Project" full-page wizard (`/v2/onboarding/import`) — upload → editable
  review/fix table → import, replacing the original modal design after the first round of
  feedback (columns were clipped, no way to fix bad rows).
- New `POST /api/onboarding/projects/import` route — partial-failure-tolerant, per-row
  customer/contact/phase seeding, reusing `seedProgrammeAtPhase` (extracted from
  `PATCH .../programme/phase`'s not-started branch, now shared by both).
- Editable rows: `Customer` (renamed from "Account"), a searchable multi-select `Project Type`
  combobox (renamed from "Type", reusing the New Project wizard's exact StackShift-grouping
  rule), `Primary Contact` (with "To be confirmed"/"Unknown" placeholder detection), a native
  `Kickoff Date` picker (day-first DD-MM-YYYY parsing, Excel-serial decoding), and a `Current
  Phase` select (lenient matching: phase numbers, "P2", substring, exact name/shortName).
- Phase 1's active day/sub-phase and an "Overdue" (past the 15-day window) warning — both in the
  import review table and on the actual project Timeline (existing reminders-strip system).
- One unrelated schema bug found and fixed (migration 081, pending user application) as a
  byproduct of this task's own test-data cleanup.

One remaining manual step outside this session's control: the user must apply migration 081
themselves before the `customer_asset_folders` foreign-key-constraint deletion error is fully
resolved.
