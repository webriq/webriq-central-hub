# 159: Onboarding List — "Import Project" CSV/Excel Bulk Intake

**Created:** 2026-07-15
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep
**Status:** Planned

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
