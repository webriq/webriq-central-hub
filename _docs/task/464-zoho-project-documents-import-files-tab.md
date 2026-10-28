# 464: Import Zoho Project Documents into Projects > Files (exact folder tree, "(From Zoho)" on name conflicts)

**Created:** 2026-10-28
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Testing — implemented 2026-10-28; live acceptance (AC4–AC11) waits on migration 179 + your go-ahead for a live run

---

## Overview

Task 463 exported each Zoho project's Documents tree to `_from_zoho/documents-all-{0-50,50-100,100-150,150-200,200-250}.json` (7,601 items = 239 folders + 7,362 files, 155 projects). This task imports that tree into each project's **Files** tab (`customer_asset_folders` + `customer_assets`, private `customer-assets` bucket), keeping the **exact folder names and hierarchy**.

- **Folder naming.** Names are copied verbatim (`attributes.name`, never the HTML-escaped `display_attr_name`). If a folder with the same name already exists in the Files tab at the same level, the imported folder gets the suffix ` (From Zoho)`. The existing folder is never touched.
- **Project mapping.** Files must land on the right Hub project. Zoho project → Hub project is resolved **Legacy first, then the other classification (v2)**; never guess, never create a project.
- **Files the Files tab can't take.** Files the bucket rejects (type), native Zoho docs and files over 200 MB are **not** imported, but they are **downloaded to local disk** under the git-ignored `_docs/task/464-zoho-project-documents-import-files-tab/out/`, mirroring the folder tree, and listed in the report. Nothing in the exported tree is silently dropped.
- **Bytes.** Unlike task 106's finding, file bytes **are** downloadable now (see Evidence E1): the `attributes.download_url` still 401s, but the WorkDrive API download endpoint returns the file with the Hub's current token.
- **Batching / throttling.** Same shape as the other import routes: one SSE request per slice, sequential per-file loop, `fetchZohoWithRetry()` for every Zoho call, paged pre-fetch of already-imported ids so re-runs skip finished work, per-file error tolerance, `from`/`to` slicing of the project list (same 50-project slices as the export).

## Requirements

- [ ] `POST /api/admin/zoho-import/documents` (admin/super_admin only), SSE events `progress` / `done`; supports `?from=&to=` (slice of the project list, same convention as the export), `?project=<zoho id>` (single project) and `?dryRun=1` (no writes, no downloads; returns the plan).
- [ ] **Project resolution (per Zoho project id, in this order):**
  1. **Legacy:** `projects.external_project_id = <zoho project id>` (Legacy == `external_project_id IS NOT NULL`, see `projects-old/page.tsx:198`; the same key `zoho-import/projects` writes).
  2. **Other classification (v2, `external_project_id IS NULL`):** derive the customer exactly like `zoho-import/projects` does (`extractZohoCustomerName()` + `buildCustomerNameMap()` from `src/lib/migrate/zoho-import.ts`), then take that customer's project whose `name` equals the Zoho project name (case-insensitive, trimmed).
  3. Exactly one match → use it. **Zero or more than one → skip the project and list it in the report** (with the reason). Never create a project, never pick between candidates.
- [ ] **Folder tree:** rebuilt from the export: roots = parents that are not folder items (`_zoho_root_folder` is the root's name; 260 roots across 155 projects, 1–2 per project); children linked by `_zoho_parent_workdrive_id` (identical to `attributes.parent_id` for all 7,601 items); parents created before children; scope `(customer_id, project_id, phase_number = 1)` (the only folder scope the Files tab uses, `projects/_shared/_use-customer-assets.ts:16`).
- [ ] **Name conflicts:** before creating a folder, read the target parent's current children (root: `parent_folder_id IS NULL`, includes the system folders and user folders). Compare case-insensitively. Free → exact name. Taken → `<name> (From Zoho)`; that also taken → `<name> (From Zoho 2)`, `3`, … . Only the conflicting folder is renamed; its descendants keep their exact names. The DB unique key does **not** protect the root level (`parent_folder_id` is NULL, and NULLs are distinct in a Postgres unique index), so this check is the only guard.
- [ ] **Files:** for each file (tree order, one project at a time): skip if already imported; download via the WorkDrive API (E1) through `fetchZohoWithRetry()`; resolve the MIME type from the extension. A file is **importable** when its extension maps to a type in `ALLOWED_MIME_TYPES`, it is not a native Zoho doc (`zwriter`/`zsheet`/`zslides`), and the **downloaded byte length** is ≤ the bucket's 200 MB (the export's declared size is 0 for 570 files, so it is not trusted). Importable → upload to `customer-assets` and upsert the `customer_assets` row (`type 'file'`, `label`/`file_name` = exact file name, `file_size` = real byte length, `file_mime_type`, `project_id`, `phase_number 1`, `folder_id`, `uploaded_by null`, permissions null like a normal staff upload). Not importable → save to local disk (next bullet).
- [ ] **Local copies of the non-importable files (D2/D3):** save each bucket-rejected, native-doc and over-200 MB file to `_docs/task/464-zoho-project-documents-import-files-tab/out/skipped-files/<Zoho project name>/<root folder>/<…exact folder path…>/<file name>` (git-ignored by `.gitignore:60`). Two files with the same name in one folder get a ` (<last 6 of workdrive id>)` suffix on the **later** one only. Skip the download when the local file already exists and is non-empty (re-runs). A failed or empty download (e.g. a native doc the API won't serve) is recorded in the report as `local-download-failed` with the HTTP status, not retried forever. The route refuses to run when `process.env.VERCEL` is set (it writes to local disk).
- [ ] **Idempotent re-runs:** a second run over the same slice creates 0 folders and 0 files (D1 for the mechanism).
- [ ] **Throttle:** every Zoho call through `fetchZohoWithRetry()` (429 `Retry-After`, rolling-throttle backoff, 401 refresh); fixed pause between downloads (default 700 ms, same as the export); a throttle-exhausted file is recorded and the run continues.
- [ ] Per-file / per-project failures never abort the run; the `done` event carries counts plus the skip/error lists; the card downloads `documents-import-report-<tag>.json` (same `saveJson` pattern as the export card).
- [ ] UI: an import row/card on the Zoho Projects migrate tab: project dropdown, From/To, **Dry run** checkbox (default on), progress bar, summary.

## Out of Scope / Must-Not-Change

- No changes to the Files tab UI, the sign/register upload routes, `ALLOWED_MIME_TYPES`, or the bucket policy (D2 chose "skip, keep local", not "widen").
- No conversion of native Zoho docs; whatever the WorkDrive download returns for them is saved as-is locally, or reported as failed.
- No project creation, no deletion of anything, no renaming/moving of existing Hub folders or files.
- No linking of documents to tasks/issues; no re-import of attachment metadata (tasks 104/106/114 untouched).
- The export route (`zoho-export/documents`) and the 463 output files are read-only inputs.
- No malware scanning (task 373 is separate, see Coordination).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/migrate/zoho-documents-tree.ts` | Create | Pure logic: group by project, build tree, `resolveFolderName()`, `mimeForExtension()`, classify a file (`import` / `native` / `unsupported-type` / `too-large`), `localPathFor()` (tree path → safe local path, same-name suffix). No I/O. |
| `src/app/api/admin/zoho-import/documents/route.ts` | Create | The SSE import route (auth, project resolution, folder creation, download, upload, upsert, local copies of non-importable files, report). |
| `src/app/(hub)/admin/migrate/_documents-import-card.tsx` | Create | Import card (dropdown, From/To, dry-run, progress, report download). Reuses `readSSEStream` and `StateIcon`. |
| `src/app/(hub)/admin/migrate/_zoho-projects-tab.tsx` | Modify | Add `documents` to `IMPORT_LEVELS` (line 137) and a `key === "documents"` branch in the import map (line 2168), mirroring the export branch at ~2107. |
| `supabase/migrations/179_zoho_documents_external_id.sql` | Create | **Written, not applied.** `external_id text` + partial unique index on `customer_asset_folders` and `customer_assets` (D1 default). |
| `src/types/database.ts` | Modify | `external_id` on both tables. |
| `_docs/task/464-zoho-documents-import.check.ts` | Create | Pure-logic checks, run with `npx tsx`. |

## Code Context

### Export item shape (from `documents-all-*.json`)

```jsonc
{ "id": "<workdrive id>", "attributes": { "name": "GetStarted…-RCB&Associates.pdf", "extn": "pdf",
    "is_folder": false, "parent_id": "<parent workdrive id>", "storage_info": { "size_in_bytes": 78264 },
    "created_time_in_millisecond": 17…, "download_url": "https://download-accl.zoho.com/…" },   // download_url 401s (E1)
  "_zoho_project_id": "1512955000020040039", "_zoho_root_folder": "RCB & Associates-Documents",
  "_zoho_parent_workdrive_id": "<same as attributes.parent_id>" }
```

### Download (verified, E1)

```ts
// GET https://www.zohoapis.com/workdrive/api/v1/download/{file id}   Authorization: Zoho-oauthtoken …
const { res, token: next, throttleExhausted } = await fetchZohoWithRetry(url, token, { label: "documents-import" });
```

### Existing patterns to copy

- `zoho-import/ticket-attachments/route.ts`: paged `.range()` pre-fetch of imported ids (lines 91–116), sequential loop, `fetchZohoWithRetry`, per-file `errors.push` + `continue`, `adminClient.storage.upload(..., { upsert: true })`, then DB upsert.
- `zoho-export/documents/route.ts`: `from`/`to`/`project` params, 700 ms pause, `send({type:"progress"})`.
- `src/lib/uploads/customer-asset-storage.ts`: `BUCKET`, `MAX_FILE_SIZE` (200 MB), `ALLOWED_MIME_TYPES` (bucket `allowed_mime_types` enforces the same list, migrations 142/158/175/176, so Storage itself rejects anything else).
- Storage path: `${customerId}/${projectId}/zoho-wd/${workdriveId}_${safeName}` (deterministic; keeps the `${customerId}/` prefix the register route asserts).

## Implementation Steps

1. **Spike (before coding the route).** With the Hub token, do one ranged download of: a native `zwriter`, `zsheet` and `zslides` file, one declared-0-byte `docx`, and one `webm`. Record status, content-type and first bytes in the task doc. This settles what the native-doc local copies will actually contain (D3) and whether declared-0-byte files really are empty.
2. Write `zoho-documents-tree.ts` (pure) + `464-zoho-documents-import.check.ts`; make the checks pass first.
3. Migration 179 + `database.ts` types (D1).
4. Write the route: load the five slice files; resolve Hub project per Zoho project (legacy → v2 → skip); pre-fetch existing `external_id`s (paged); per project: create folders in tree order with conflict resolution, then files sequentially; emit progress; final report. `dryRun` short-circuits before any write/download and returns the plan.
5. Card + tab wiring.
6. Run the verification below; record numbers in the task doc's Completion Note.

## Acceptance Criteria

Each item: check · expected · when.

- [ ] **AC1 Pure logic.** `npx tsx _docs/task/464-zoho-documents-import.check.ts` exits 0. Covers: tree build from fixtures (1 and 2 roots, depth 6, parent-before-child), name resolution (free → exact; taken → ` (From Zoho)`; both taken → ` (From Zoho 2)`; case-insensitive; descendants unchanged), project resolution order (legacy wins over v2; two v2 candidates → skip; none → skip), extension → MIME table, file classification. · pre-merge
- [ ] **AC2 Types.** `npx tsc --noEmit` is clean. · pre-merge
- [ ] **AC3 Accounting.** Dry run over the five slices reports `folders 239 + files 7,362 = 7,601`, and files = importable + native + unsupported-type + too-large with no remainder; all 155 projects are classified `legacy` / `v2` / `unmatched` (unmatched listed with reason). A dry run downloads nothing and writes no local files. · post-deploy, browser
- [ ] **AC11 Local copies.** After a live run, `find _docs/task/464-zoho-project-documents-import-files-tab/out/skipped-files -type f | wc -l` equals the report's `unsupported-type + native + too-large` counts minus its `local-download-failed` list; the paths mirror the Zoho folder tree; a re-run downloads nothing new (file count and mtimes unchanged); `.gitignore:60` covers the directory. · post-deploy (needs disk: ~3 GB)
- [ ] **AC4 Exact hierarchy.** Live import of one small project: its Files tab (`/projects/legacy/<id>/files`) shows the same folder names, nesting and per-folder file counts as the export minus the report's skip list; spot-open 2 files (PDF + image) and confirm they render. · manual (UI + bytes can't be asserted by script)
- [ ] **AC5 Conflict suffix.** Pre-create a root folder in the Hub with the same name as a Zoho root (e.g. `<Project>-Documents`), run the import for that project: `<Project>-Documents (From Zoho)` exists with the exact children; the pre-existing folder and its files are unchanged. · manual / SQL count before & after
- [ ] **AC6 Idempotent.** Re-run the same slice: `imported 0`, `customer_asset_folders` and `customer_assets` row counts for those projects identical (SQL before/after). · post-deploy
- [ ] **AC7 Legacy-then-v2 mapping.** Dry-run report shows `matchedBy: external_project_id` for legacy and `customer+name` for v2; pick one v2 project and confirm its files land on the v2 project's Files tab. `select count(*) from projects` is unchanged by the run. · post-deploy
- [ ] **AC8 Throttle.** A full 50-project slice completes with 0 unhandled 429/`throttle exhausted` errors in the report (throttled calls are retried, not dropped). If any are dropped, they appear in the report and a re-run imports them. · post-deploy
- [ ] **AC9 No regression (upload).** After an import, uploading a file through the normal Files tab flow still works, and `GET …/assets/folders` for an imported project does not create duplicate system folders. · manual
- [ ] **AC10 No regression (untouched data).** Row counts of `customer_asset_folders`/`customer_assets` for a project outside the run are unchanged; `zoho-export/documents/route.ts` is byte-identical (`diff` against a copy taken before). · post-deploy

## Verification

```bash
npx tsx _docs/task/464-zoho-documents-import.check.ts
npx tsc --noEmit
# then browser acceptance on /admin/migrate: dry run → single project → slice 0–50 → full run
# SQL before/after (Supabase SQL editor):
#   select count(*) from customer_asset_folders where project_id = '<uuid>';
#   select count(*) from customer_assets       where project_id = '<uuid>' and external_id is not null;
```

No test runner is configured; pure logic is checked with `npx tsx`, everything else by browser acceptance (project convention).

## Coordination

- **431** (Planned: contract/drop Zoho import libs): this task imports `buildCustomerNameMap` / `extractZohoCustomerName` from `src/lib/migrate/zoho-import.ts` and adds a card to `_zoho-projects-tab.tsx`. **Land 464 before 431**, or 431 must keep those two helpers.
- **423** (investigation; keeps `phase_number` as the stable key for `customer_assets` + folders, decision 5): consistent with using `phase_number = 1`; no conflict unless 423 reverses that.
- **373** (Planned: malware scanning for the customer-asset pipeline): this importer writes to the bucket and table directly, bypassing the sign/register routes, so a scan hook placed in those routes won't see imported files. Note on 373 if it lands first.
- **463** (done): input only. Correct its follow-up note (bytes are reachable, see E1).

## Open Decisions

- **D1 (RESOLVED 2026-10-28): re-run key = migration 179.** `external_id` (+ partial unique index) on `customer_asset_folders` and `customer_assets`, matching the other importers (`attachments.external_id`); written-not-applied, the route returns a clear error if the column is missing (`42703`).
- **D2 (RESOLVED 2026-10-28): 518 files / ~2.7 GB the `customer-assets` bucket rejects** (webm 263, heic 59, mp4 36, mov 32, json 28, eml 15, tif 14, php 6, pages 5, msg 5, …): **not imported, listed in the report, and downloaded to local disk.** The bucket allowlist is not widened. (Assumption, confirm at review: over-200 MB files, currently just the 224 MB `oOYes Website Photos.zip`, get the same treatment.)
- **D3 (RESOLVED 2026-10-28): 372 native Zoho documents** (`.zwriter` 283, `.zsheet` 56, `.zslides` 33, declared 0 bytes): **not imported, listed in the report, spike first, and downloaded to local disk** for whatever the API serves; a failed download is reported, not hidden.
- **D4 (NON-BLOCKING): roots.** *Default:* import both root folders per project (`<Project>-Documents` and `<Project>-Attachments`) as top-level folders with their exact names ("exact folder naming/hierarchy").
- **D5 (NON-BLOCKING): duplicate file names.** 207 name groups repeat inside one folder (distinct Zoho ids). `customer_assets` has no unique constraint on name/folder (checked migrations 021/057/064/090/096). *Default:* import all, exact names.

## Operator Steps

1. Apply migration 179 (`supabase/migrations/179_zoho_documents_external_id.sql`) to the target database before the first live run (D1). Merging alone does not apply it.
2. Run the import **from the local dev server** like the other Zoho importers (they are admin tools run against the real DB; a multi-GB run is not a Vercel request, and the local copies are written to this machine's disk). Keep `_from_zoho/documents-all-*.json` in place. Free about 3 GB of disk for the local copies (bucket-rejected ~2.7 GB + the 224 MB zip + native docs).
3. Run order: dry run (all slices) → one small project → slice 0–50 → remaining slices; read each report before the next.
4. No deploy of a separately deployed component is affected.

## Evidence

- **E1: bytes are downloadable.** Token scopes granted today include `WorkDrive.files.ALL` and `WorkDrive.workspace.ALL`. A 100-byte ranged `GET` of `elodi_homepage_comparison_v2.pdf` (8,758 B): `attributes.download_url` → `401 INVALID_OAUTHSCOPE`; `https://workdrive.zoho.com/api/v1/download/<id>` → `206 application/pdf`, body starts `%PDF-`; `https://www.zohoapis.com/workdrive/api/v1/download/<id>` → `206 application/pdf`. (WorkDrive's web UI still says "Subscription Expired", so the API path may stop working at any time. Run soon.)
- **E2: tree.** 7,601 items = 239 folders + 7,362 files; 260 root ids over 155 projects (50 projects with 1 root, 105 with 2); folder depth below root `1:183 2:25 3:18 4:7 5:4 6:2`; `attributes.parent_id` ≠ `_zoho_parent_workdrive_id` for 0 items; 0 duplicate sibling folder names; 0 names shared by a folder and a file in one parent; 0 folder names with slash/edge-space/>120 chars; 0 empty names.
- **E3: types/sizes.** Files total 11.8 GB declared. Importable by extension 6,472 files (~9.1 GB); native Zoho 372; bucket-rejected 518 (~2.7 GB). One file over 200 MB (`oOYes Website Photos.zip`, 224 MB). 570 files declare 0 bytes, including ordinary `docx`/`xlsx`/`png` files, so declared size is not trustworthy.
- **E4: Files tab scope.** Folders keyed `(customer_id, project_id, phase_number)`, unique `(…, parent_folder_id, name)` (migration 065); only `phase_number = 1` exists (`_use-customer-assets.ts:16`); system root folders provisioned lazily on `GET …/assets/folders` (`assets/folders/route.ts:60–139`).
- **E5: legacy vs v2.** `projects-old/page.tsx:198`: `external_project_id ? "legacy" : "version2"`; `zoho-import/projects/route.ts:62–89` writes `external_project_id` and derives the customer via `extractZohoCustomerName()` + `buildCustomerNameMap()`.
- Reproduce: scripts used for E1–E3 were throwaway (session scratchpad); the counts come straight from `_from_zoho/documents-all-*.json`.

## Compatibility Touchpoints

- Admin-only migrate tooling; no change to the runtime Files tab, MCP tools (`_docs/mcp-tools.md` unaffected) or other routes.
- Migration 179 is "written, not applied": the route must degrade with a clear message when `external_id` is missing (Postgres `42703`).
- `_from_zoho/` and the import reports contain real customer data; do not commit them.

## Baseline

Captured 2026-10-28 before any change:

- AC1 `npx tsx _docs/task/464-zoho-documents-import.check.ts`: FAILS by absence (the script and `src/lib/migrate/zoho-documents-tree.ts` did not exist), so a pass now is meaningful.
- AC2 `npx tsc --noEmit`: 0 errors.
- AC3 / AC4–AC11: nothing to baseline (new route and card); `POST /api/admin/zoho-import/documents` did not exist.

## Implementation Notes

### Spike result (implementation step 1, 2026-10-28)

Ranged `GET https://www.zohoapis.com/workdrive/api/v1/download/<id>` (`Range: bytes=0-199`) with the Hub token:

| Sample | Declared | Result |
|--------|----------|--------|
| native `zwriter` | 0 | `206`, `…wordprocessingml.document`, real **docx**, 3,367,065 B |
| native `zsheet` | 0 | `206`, `…spreadsheetml.sheet`, real **xlsx**, 8,875 B |
| native `zslides` | 0 | `206`, `…presentationml.presentation`, real **pptx**, 7,018,907 B |
| `docx`, declared 0 | 0 | `206`, real docx, 551,511 B |
| `png`, declared 0 | 0 | `206`, real PNG, 70 B |
| `webm` | 850,666 | `206`, `video/webm`, 850,666 B |

Consequences: the declared size is not trustworthy (files declared 0 B are real), so size is judged on the downloaded byte length (as planned). Native Zoho docs **are** downloadable, as Office files; per D3 they are still not imported, but their local copies are saved as `<name>.docx|.xlsx|.pptx` (native names carry no extension). Because docx/xlsx/pptx are allowed types, importing these 372 files into the Files tab is now possible; **not done, outside the agreed D3** — raise it at review if wanted. Also found: file names can contain `/` (e.g. `QA/QC - Elodi Speech Therapy Content Site`), so local paths sanitise `\ / : NUL`.

### What Changed

- Pure import logic in `src/lib/migrate/zoho-documents-tree.ts` (tree build, `(From Zoho)` name resolution, file classification, local path assignment, Legacy-then-v2 project matching) with assertions in `_docs/task/464-zoho-documents-import.check.ts`.
- `POST /api/admin/zoho-import/documents` (SSE; `from`/`to`/`project`/`dryRun`): resolves each Zoho project, creates the folder tree, downloads and uploads importable files, saves non-importable files locally, returns a report.
- Import card on the Zoho Projects migrate tab (dry run on by default, report downloads as JSON).
- Migration 179 (`external_id` on `customer_asset_folders` and `customer_assets`), written not applied; types updated.

### Files Changed

- `src/lib/migrate/zoho-documents-tree.ts` (new) — pure logic.
- `_docs/task/464-zoho-documents-import.check.ts` (new) — `npx tsx` assertions.
- `src/app/api/admin/zoho-import/documents/route.ts` (new) — the import route.
- `src/app/(hub)/admin/migrate/_documents-import-card.tsx` (new) — the card.
- `src/app/(hub)/admin/migrate/_documents-card.tsx` — `saveJson` is now exported (reused by the import card); no other change.
- `src/app/(hub)/admin/migrate/_zoho-projects-tab.tsx` — `documents` entry in `IMPORT_LEVELS` and its render branch.
- `supabase/migrations/179_zoho_documents_external_id.sql` (new, not applied).
- `src/types/database.ts` — `external_id` on both tables (Row/Insert/Update).

### Deviations From Plan

- Files are written with `insert` (a `23505` is counted as already imported) rather than `upsert`; idempotency still comes from the pre-fetched `external_id` set plus the unique index, and it avoids depending on PostgREST `on_conflict` inference.
- The folder count in the dry run (499) includes the 260 synthesized root folders (239 exported folder items + 260 roots). AC3's "folders 239" referred to exported items.
- Measured class counts differ slightly from the plan's estimates (E3: 6,472 importable / 518 rejected): **6,473 importable, 516 unsupported type, 372 native, 1 over 200 MB** (total 7,362). `.htm` and `.ts` are in the extension table, and the 224 MB zip is now counted as too-large.
- Folder reads use `select("*")` so the same code works with and without migration 179.

### Verification Run

- `npx tsx _docs/task/464-zoho-documents-import.check.ts` — PASS (baseline: script absent → now "464 checks passed")
- `npx tsc --noEmit` — PASS (baseline 0 errors → now 0 errors)
- `npx eslint` on the 4 new/changed source files — PASS (no output)
- AC3 dry run over all five slices via `POST …?dryRun=1&from=0` in the logged-in browser — PASS: 155 projects classified (155 Legacy by `external_project_id`, 0 v2, 0 unmatched; 73 projects have no documents = 228 − 155); 499 folders to create; files 7,362 = 6,473 + 372 + 516 + 1 with no remainder; 0 errors; 0 folders renamed (no pre-existing name clashes in the data).
- Card UI — PASS: card renders as the last row of the import list; a slice dry run (projects 0–5) completed from the card, showed the summary (2 Legacy · 3 without documents · 6 folders to create · 10 importable), and downloaded `documents-import-report-dryrun-all-0-5.json`.
- Dry run writes nothing — PASS: no `out/skipped-files` directory was created; the dry-run path contains no insert/upload/download calls.
- Live-run guard — PASS: `POST …?project=does-not-exist` (cannot match a project, so it cannot import anything) returned `409 Migration 179 … is not applied`. This also shows migration 179 is not applied on the connected database.
- AC4, AC5, AC6, AC8, AC9, AC10, AC11 — **SKIPPED**: they need migration 179 applied and a live import into the real database (not done without your go-ahead). AC7: the Legacy branch is confirmed on real data (all 155 projects); the v2 fallback is only covered by the pure check, because no project needed it. The `(From Zoho)` rule (AC5) is covered by the pure check only. AC10: `zoho-export/documents/route.ts` was not edited.

### Attempts That Failed

- None (no check failed during implementation).

### Operator Steps

1. Apply `supabase/migrations/179_zoho_documents_external_id.sql`. Until then a live run returns 409 (verified); the dry run keeps working.
2. Run from the local dev server: dry run (done) → one small project → slice 0–50 → remaining slices, reading each report before the next. Free about 3 GB of disk for the local copies under `_docs/task/464-zoho-project-documents-import-files-tab/out/skipped-files/` (git-ignored by `.gitignore:60`).
3. Run the import soon: the files are reachable through the WorkDrive API even though the WorkDrive web UI shows "Subscription Expired", and that may stop at any time.
4. No deploy needed: the changes are admin-only local tooling plus a type-only `database.ts` change; `zoho-documents-tree.ts` is imported only by the new route and the check script, and `saveJson` only by the new card.

## Quality Gate Notes

### Result
PASS (with one Medium note: live acceptance is not run yet)

### Standards Review

Reviewed the files listed under "Files Changed" (git is not used in this repo, so the list comes from the Implementation Notes). Fixed during the review, then re-checked:

- **Per-project failures aborted the whole run.** A DB read error in one project threw out of the loop and ended the SSE with an `error` event, contradicting the requirement that failures never abort the run. The per-project body is now `runProject()`, and each project runs under `.catch()` that records `projectsFailed` plus an `errors` entry and continues.
- **Double count.** A file classified importable whose real download exceeded 200 MB was counted in both `filesImportable` and `filesTooLarge`, so the dry-run accounting identity could drift in that rare case. `filesImportable` is now decremented when that happens.
- **Dead exports.** `FROM_ZOHO_SUFFIX`, `NATIVE_EXPORT_EXT` and `fileExt` were exported but only used inside `zoho-documents-tree.ts`; they are module-private now.

Re-run after the fixes: `npx tsc --noEmit` 0 errors, `npx tsx _docs/task/464-zoho-documents-import.check.ts` passes, eslint clean on the route and the pure module, and a slice dry run (projects 0–5) through the route returned the same counts as before the refactor (2 Legacy, 3 without documents, 6 folders, 10 importable, 0 errors).

No blocking findings: no `any`, no commented-out code, no debug logging, no secrets; the route's sections are single-purpose and follow the existing `zoho-import` patterns; the pure checks assert behaviour (tree shape, names, classification, paths, project matching) rather than source text. Notes, not defects:

- `adminClient` is used for reads, which CLAUDE.md discourages for regular reads. Kept deliberately: this is an admin-only tool that needs an unfiltered view of every folder to detect name conflicts, the same as the other `zoho-import` routes (comment in the route says so).
- The progress bar uses `style={{ width }}`, copied from the export card; a runtime percentage can't be a static Tailwind class.
- The route is about 250 lines. Splitting it further would only move code around, so it is left as is.

### Deviations

- **Minor:** `insert` + `23505` handling instead of `upsert`; folder reads use `select("*")`; `saveJson` is now exported from `_documents-card.tsx` (a file outside the plan's list, a one-word change, nothing else touched there).
- **Minor:** measured class counts differ slightly from the plan's estimates (6,473 / 516 / 372 / 1), recorded above.
- **Medium (visible to the user):** AC4, AC5, AC6, AC8, AC9, AC10 and AC11 have no result yet. They need migration 179 applied and a live import; the v2 fallback and the `(From Zoho)` rule are only covered by the pure checks. This is not a code problem, but the task cannot be called verified until those run.

### Required Fixes
- None.
