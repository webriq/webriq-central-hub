# 465: Import native Zoho documents (Writer → docx, Sheet → xlsx, Show → pptx) into Projects > Files

**Created:** 2026-11-02
**Priority:** MEDIUM
**Type:** enhancement (follow-up to 464)
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

Task 464 imported 6,461 of the 7,362 exported files into each project's **Files** tab and deliberately left 372 **native Zoho documents** out (decision D3). The live-run review of 2026-11-02 confirmed those 372 files are real, valid Office documents that the WorkDrive download endpoint serves:

| Zoho native type | Count | Downloaded as | Local copies |
|---|---:|---|---:|
| `zwriter` | 283 | `.docx` (`application/vnd.openxmlformats-officedocument.wordprocessingml.document`) | 283 |
| `zsheet` | 56 | `.xlsx` (`application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`) | 56 |
| `zslides` | 33 | `.pptx` (`application/vnd.openxmlformats-officedocument.presentationml.presentation`) | 33 |
| **Total** | **372** | | **372** |

All 372 were saved locally under `_docs/task/464-zoho-project-documents-import-files-tab/out/skipped-files/` and every saved file was signature-checked as a genuine Office archive (Word/PowerPoint/Excel). They are currently **missing from the Hub** only because `classifyFile()` returns `{ kind: "native" }` before the normal MIME gate. The three export MIMEs are already in `ALLOWED_MIME_TYPES`, already accepted by the `customer-assets` bucket, and already previewable in the Files tab through the Office Online viewer (`_file-previews.tsx:208`).

This task flips that classification, threads the Office extension into the file name, and re-runs the existing import to backfill the 372 files into their existing folders. No new route, no migration, no Files-tab change.

### Evidence

- **Live import already done:** 10 authoritative report slices, `dryRun: false`; 6,413 files imported + 48 already present; 895 local copies, 0 local failures (`_docs/task/464-zoho-documents-import-report-review.md`).
- **Native files are valid Office documents:** 283 `.docx`, 56 `.xlsx`, 33 `.pptx`; all open as Office 2007+ archives; 0 signature mismatches in the native set.
- **Names carry no extension in Zoho:** e.g. `Elodi App Post-Live Feedback` (`zwriter`), `WMI Home Solutions Pre-live SEO Audit` (`zsheet`), `QA/QC - Elodi Speech Therapy Content Site` (`zslides`).
- **Office preview exists:** `WORD_MIME_TYPES` / `EXCEL_MIME_TYPES` / `POWERPOINT_PREVIEWABLE_MIME_TYPES` route to `https://view.officeapps.live.com/op/embed.aspx?src=<signed url>`.
- **Task 464's own deviation note:** "Because docx/xlsx/pptx are allowed types, importing these 372 files into the Files tab is now possible; not done, outside the agreed D3 — raise it at review if wanted."

## Requirements

- [ ] `classifyFile()` returns an **import** result for native Zoho documents whose exported Office MIME is in `ALLOWED_MIME_TYPES`, with:
  - the correct MIME for the export extension (`docx` / `xlsx` / `pptx`), and
  - an **effective file name** = Zoho name + `.docx` / `.xlsx` / `.pptx` (do not double-append if the name already ends with that extension).
- [ ] Keep a `native` fallback for the (currently impossible) case where the Office MIME is not allowed; that path continues to save locally and report `reason: "native"`.
- [ ] The import route uses the effective name consistently for:
  - the Storage object path (`…/zoho-wd/<id>_<safe effective name>`),
  - `customer_assets.label`,
  - `customer_assets.file_name`,
  - the error/progress `where` string.
- [ ] Re-running the existing import (dry run first) imports the 372 native docs into their **existing** folders, using `external_id` idempotency; no duplicate folders, no duplicate files.
- [ ] Update the pure-logic check so `cls("Doc", "zwriter")` etc. expect import results with the effective name.
- [ ] The report's `filesNative` counter naturally becomes 0 on future runs; old reports remain readable (the `native` skip reason stays in the type and UI).

## Out of Scope / Must-Not-Change

- **Do not widen `ALLOWED_MIME_TYPES` or the bucket policy.** docx/xlsx/pptx are already allowed.
- **Do not change the Files tab UI or preview components.** Office preview already exists.
- **Do not import** the 516 unsupported-type files or the 7 over-200 MB files; they stay local-only under the existing policy.
- **Do not add a migration.** `external_id` (migration 179) is already applied — the live 464 runs relied on it.
- **Do not change** the folder tree, folder conflict suffixing, project matching, SSE protocol, report shape, or upload pacing.
- **Do not delete** the existing 372 local native copies in code; cleanup is an optional operator action after verification.
- No task/issue linkage, no attachment-metadata re-import, no format conversion beyond Zoho's own Office export.
- Do not touch `zoho-export/documents/route.ts`, `ALLOWED_MIME_TYPES`, or the `customer-assets` bucket configuration.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/migrate/zoho-documents-tree.ts` | Modify | `classifyFile()` native branch returns import with Office MIME + effective name; `FileClass` import variant gains `fileName`. |
| `src/app/api/admin/zoho-import/documents/route.ts` | Modify | `importFile()` accepts and uses the effective file name in the storage path, `label`, `file_name`, and log line. |
| `_docs/task/464-zoho-documents-import.check.ts` | Modify | Update native classification assertions; add effective-name assertions (including an already-dotted name). |
| `src/app/(hub)/admin/migrate/_documents-import-card.tsx` | No change expected | `filesNative` will display 0; the existing summary line stays valid. |

No database, type, migration, UI-component, or API-contract changes.

## Code Context

### Current classification (`src/lib/migrate/zoho-documents-tree.ts:111–132`)

```ts
export type FileClass =
  | { kind: "import"; mime: string }
  | { kind: "native"; exportExt: string }
  | { kind: "unsupported-type" }
  | { kind: "too-large" };

// Zoho-native documents download as Office files (spike 2026-10-28: zwriter→docx, zsheet→xlsx, zslides→pptx).
const NATIVE_EXPORT_EXT: Readonly<Record<string, string>> = { zwriter: "docx", zsheet: "xlsx", zslides: "pptx" };

export function classifyFile(f, allowedMimes, maxBytes): FileClass {
  const ext = fileExt(f);
  const exportExt = own(NATIVE_EXPORT_EXT, ext);
  if (exportExt) return { kind: "native", exportExt };
  const mime = mimeForExt(ext);
  if (!mime || !allowedMimes.includes(mime)) return { kind: "unsupported-type" };
  if (f.declaredBytes > maxBytes) return { kind: "too-large" };
  return { kind: "import", mime };
}
```

Proposed shape:

```ts
export type FileClass =
  | { kind: "import"; mime: string; fileName: string }
  | { kind: "native"; exportExt: string }
  | { kind: "unsupported-type" }
  | { kind: "too-large" };

const exportExt = own(NATIVE_EXPORT_EXT, ext);
if (exportExt) {
  const mime = mimeForExt(exportExt);
  if (mime && allowedMimes.includes(mime)) {
    const fileName = f.name.toLowerCase().endsWith(`.${exportExt}`) ? f.name : `${f.name}.${exportExt}`;
    return { kind: "import", mime, fileName };
  }
  return { kind: "native", exportExt }; // fallback; still saved locally
}
// …
return { kind: "import", mime, fileName: f.name };
```

### Current route (`src/app/api/admin/zoho-import/documents/route.ts:174–194`, `:263–279`)

```ts
async function importFile(f: TreeFile, mime: string, customerId, projectId, folderId, where, entry) {
  // …
  const storagePath = `${customerId}/${projectId}/zoho-wd/${f.id}_${f.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-150)}`;
  // …
  adminClient.from("customer_assets").insert({
    // …
    label: f.name, file_path: storagePath, file_name: f.name, file_size: bytes,
    // …
  });
}

const cls = classifyFile(f, ALLOWED_MIME_TYPES, MAX_FILE_SIZE);
// …
await importFile(f, cls.mime, customerId, hub.id, folderId, where, entry);
```

Change `importFile` to take `fileName: string` (or pass `cls.fileName`) and use it in `storagePath`, `label`, `file_name`, and the `where` string.

`assignLocalPaths()` keeps its native-extension handling as the fallback path; no change needed.

### Preview support already present

`src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_file-previews.tsx:208`

```tsx
if (WORD_MIME_TYPES.includes(mime) || EXCEL_MIME_TYPES.includes(mime) || POWERPOINT_PREVIEWABLE_MIME_TYPES.includes(mime)) {
  return <iframe src={officePreviewUrl(url)} … />; // https://view.officeapps.live.com/op/embed.aspx?src=…
}
```

The signed URL is generated from `customer_assets.file_path`; the effective name must therefore carry the Office extension so the object path ends in `.docx` / `.xlsx` / `.pptx`.

## Implementation Steps

1. Extend `FileClass`'s import variant with `fileName: string`.
2. Update `classifyFile()`:
   - Normal files: return `{ kind: "import", mime, fileName: f.name }`.
   - Native docs: resolve `mimeForExt(exportExt)`; if allowed, return import with the effective name; otherwise keep the native fallback.
3. Thread the effective name through `importFile()` in the route (storage path, `label`, `file_name`, `where`).
4. Update `_docs/task/464-zoho-documents-import.check.ts`:
   - `cls("a.png", "png")` → import with `fileName: "a.png"`.
   - `cls("Doc", "zwriter")` → import with docx MIME and `fileName: "Doc.docx"`.
   - `cls("Already.docx", "zwriter")` → `fileName: "Already.docx"` (no double extension).
   - Equivalent for Sheet/Show.
5. Run the pure check, typecheck, and lint.
6. Operator: dry run, then live re-run (see Operator Steps). Verify one preview manually.

## Acceptance Criteria

Each item: check · expected · when.

- [ ] **AC1 Pure logic.** `npx tsx _docs/task/464-zoho-documents-import.check.ts` exits 0. Native classification now returns import results with the correct MIME and effective name; the no-double-extension case is covered. · pre-merge
- [ ] **AC2 Types + lint.** `npx tsc --noEmit` clean and `npx eslint src/lib/migrate/zoho-documents-tree.ts src/app/api/admin/zoho-import/documents/route.ts` clean. · pre-merge
- [ ] **AC3 Dry-run accounting.** Dry run over all slices (`?dryRun=1&from=0`): `filesNative` is 0/absent; `filesImportable` = **6,845** (dry-run 6,473 + 372), `filesUnsupportedType` = **516**, `filesTooLarge` = **1** (only the OOYes ZIP is over 200 MB from export metadata — the other 6 are reclassified after download), total = **7,362**; `skippedFiles` = **517** (516 + 1). No downloads, no writes. The 6 post-download reclassifications then land the live run at AC7's 6,839 / 7. · post-merge, local dev
- [ ] **AC4 One-project import.** Re-run `?project=1512955000019353080` (Elodi Speech Therapy App, 1 native doc): `filesImported` = 1, `filesFailed` = 0, `filesNative` absent. SQL shows one new `customer_assets` row with `file_name = 'Elodi App Post-Live Feedback.docx'`, the docx MIME, and a `file_path` ending `.docx`; the Storage object exists. · post-merge, local dev + SQL
- [ ] **AC5 Viewable.** Open that row from the project's Files tab: the Office Online preview renders the document (manual; the iframe needs the signed URL to be reachable by Microsoft's viewer), and Download produces `Elodi App Post-Live Feedback.docx`. · manual
- [ ] **AC6 Idempotent.** Re-run the same project again: `filesImported` = 0, `filesAlreadyImported` ≥ 1, no new rows or objects. · post-merge
- [ ] **AC7 Full backfill.** Re-run all slices: total new imports = **372** (native) + up to 6 retried failures; all 155 projects keep their existing 499 folder nodes (0 created, 499 reused); total `customer_assets` with `external_id` = **6,833** (or **6,839** if the 6 previously failed files now succeed). · post-merge, local dev
- [ ] **AC8 No regression (non-importable files).** In the re-run reports, the 516 unsupported-type + 7 too-large files are still skipped, still resolved to their existing local copies (`localStatus: "exists"`), and the 523 files remain on disk. No report entry is produced for a native doc (they are imported instead). · post-merge
- [ ] **AC9 No regression (normal upload).** Uploading a file through the normal Files tab flow still works after an import; `GET …/assets/folders` does not duplicate system folders. · manual
- [ ] **AC10 No regression (existing imported data).** `customer_asset_folders` count and the 6,413 already-imported `customer_assets` rows are unchanged by the re-run; no folder is renamed or recreated. · SQL before/after

## Verification

```bash
npx tsx _docs/task/464-zoho-documents-import.check.ts
npx tsc --noEmit
npx eslint src/lib/migrate/zoho-documents-tree.ts src/app/api/admin/zoho-import/documents/route.ts

# SQL (Supabase SQL editor), before and after:
#   select count(*) from customer_assets where external_id is not null;                 -- 6,461 → 6,833 (+372)
#   select count(*) from customer_asset_folders where phase_number = 1 and external_id is not null; -- 499 → 499
#   select file_name, file_mime_type, file_path from customer_assets
#    where external_id = '<a native WorkDrive id>' limit 1;                              -- effective name + Office MIME
```

No test runner is configured; pure logic uses `npx tsx`, everything else browser/SQL acceptance (project convention).

## Coordination

- **464** (Testing): owns the same three files (`zoho-documents-tree.ts`, the import route, `464-…check.ts`). **Land 465 after 464 is accepted/merged**, and keep 464's live-run reports intact — they are the baseline for this task. This task is the follow-up the 464 doc's D3 deviation anticipated.
- **373** (Planned: malware scanning for the customer-asset pipeline): this importer writes directly to Storage/DB, bypassing the sign/register routes. If 373 lands, note that imported native docs bypass the scan hook too.
- No other `Planned` or `In Progress` task touches these files (checked `TASKS.md` on 2026-11-02).

## Open Decisions

- **D1 (NON-BLOCKING): display name.** *Default:* append the Office extension to `label`/`file_name` (`Feedback File.docx`) and to the Storage path. Rationale: the source name has no extension, downloads should open in the right app, and the Office Online viewer keys off the path/MIME. Alternative: keep the exact Zoho name and rely on MIME only — rejected because downloads lose the extension.
- **D2 (NON-BLOCKING): backfill mechanism.** *Default:* re-run the existing import route slice by slice. The per-project `external_id` pre-fetch skips the 6,461 already-imported files without downloading, so only 372 native docs (+ up to 6 retries) are downloaded. Alternative: a one-off script that uploads the existing local copies — more code, and it would not verify the WorkDrive export. Rejected.
- **D3 (NON-BLOCKING): old local native copies.** *Default:* keep them as a backup after the import; optionally delete the 372 native files from `out/skipped-files/` once AC7/AC8 pass. Cleanup is operator-only, not code.

No `BLOCKING` decisions.

## Operator Steps

Merging the code alone does **not** import the 372 files; they must be backfilled by a re-run.

1. **Confirm migration 179 is applied** (`customer_asset_folders` / `customer_assets` have `external_id`). The earlier live 464 runs succeeded, so it should be; a live run returns 409 if it is not.
2. **Run from the local dev server**, not Vercel — the route refuses on Vercel for the local-copy path. Keep `_from_zoho/documents-all-*.json` in place.
3. **Dry run first**, all slices (`POST /api/admin/zoho-import/documents?dryRun=1&from=0` from `/admin/migrate`). Expect AC3: native 0, importable 6,845, unsupported 516, too-large 1, total 7,362 (the live run then reclassifies 6 more as too-large after download).
4. **Live re-run** slice by slice (0–25, 25–50, …, 225–250), reading each report before the next. Expected: each slice imports only its previously-native count; `filesAlreadyImported` accounts for the rest; 0 folder creations.
5. **Verify** AC4/AC5 on one project (open the preview and download), then SQL for AC6/AC7/AC10.
6. **Optional cleanup:** after verification, delete the 372 native files from `_docs/task/464-zoho-project-documents-import-files-tab/out/skipped-files/`; the folder should then hold only the 523 unsupported-type + too-large files. Keep the local copies until AC7 passes.
7. **No deploy** of a separately deployed component: the changed module is imported only by the admin route and the `tsx` check.

## Compatibility Touchpoints

- Admin-only local tooling; no MCP tool, API contract, or Files-tab UI change.
- `_from_zoho/` and the import reports contain real customer data; never commit them.
- The `SkippedFile.reason` union keeps `"native"` so pre-change reports still parse; the card's "native Zoho" summary shows 0 on new runs.
- Expected net effect on a future full import: 6,839 importable (6,461 already + 372 new + 6 retries), 523 local-only files.

## Baseline

Captured 2026-11-02 from the completed 464 live run (see `_docs/task/464-zoho-documents-import-report-review.md`):

- Native docs: **372** (283 zwriter, 56 zsheet, 33 zslides), all saved locally, all valid Office archives.
- Current Hub files with `external_id`: **6,461** (6,413 imported + 48 pre-existing).
- Current folder nodes: **499** (413 created + 86 reused).
- Current local-only files: **895** (516 unsupported + 372 native + 7 too-large).
- Current unresolved failures: **6** (3 empty downloads, 3 storage-upload errors) — the re-run will retry them opportunistically.
- `npx tsx _docs/task/464-zoho-documents-import.check.ts` — PASS today; will need updated native assertions.

## Implementation Notes

### What Changed
- `classifyFile()` now imports native Zoho docs (`zwriter`/`zsheet`/`zslides`) when the exported Office MIME is in the allowlist, returning the Office MIME plus an effective file name with the extension (no double append); otherwise it falls back to the existing `native` skip.
- The import route threads that effective name through the Storage object path, `customer_assets.label`, `customer_assets.file_name`, and the error `where` string.
- Updated the pure check for the new import shape and added the no-double-extension and native-fallback cases.

### Files Changed
- `src/lib/migrate/zoho-documents-tree.ts` — `FileClass` import variant gains `fileName`; native branch resolves the Office MIME/name.
- `src/app/api/admin/zoho-import/documents/route.ts` — `importFile()` takes `fileName`; `where` uses the effective name.
- `_docs/task/464-zoho-documents-import.check.ts` — assertions updated (see Deviations).
- `_docs/task/465-zoho-native-docs-import-files-tab.md` — AC3 / Operator step 3 expectations corrected (see Deviations).
- `TASKS.md` — task moved Planned → In Progress → Testing.

### Deviations From Plan
- **AC3/Operator step 3 dry-run numbers corrected.** The plan expected a dry run to show `filesImportable` 6,839 and `filesTooLarge` 7. A dry run classifies from `declaredBytes` only, so it yields 6,845 importable and 1 too-large (only the OOYes ZIP is over the limit in the export metadata); the 6 post-download reclassifications are what produce 6,839 / 7 on the live run. Evidence: `_docs/task/464-zoho-documents-import-report-review.md` ("Why the live 'importable' count is 6,467 rather than the dry-run's 6,473, and 'too-large' is 7 rather than 1"). AC7's live totals are unchanged.
- **Check allowlist assertion swapped.** The check's synthetic allowlist did not include the xlsx MIME, yet the plan expects `cls("Sheet", "zsheet")` to import. Added xlsx to that list and moved the "known MIME but not allowed" assertion to `csv`, preserving the gate's intent. Added an explicit fallback assertion with an allowlist that omits xlsx.

### Verification Run
- `npx tsx _docs/task/464-zoho-documents-import.check.ts` — PASS (baseline: PASS → now: PASS, updated assertions)
- `npx tsc --noEmit` — PASS
- `npx eslint src/lib/migrate/zoho-documents-tree.ts src/app/api/admin/zoho-import/documents/route.ts` — PASS
- AC3–AC10 — SKIPPED (need the local dev server, an admin session, a Zoho token, and Supabase SQL; they are the operator steps below)

### Attempts That Failed
- None.

### Operator Steps
- Merge alone does not backfill; run the re-runs below.
1. Confirm migration 179 (`external_id`) is applied.
2. Run from the local dev server (the route refuses on Vercel).
3. Dry run all slices from `/admin/migrate` (`?dryRun=1&from=0`): expect native 0, importable 6,845, unsupported 516, too-large 1, total 7,362, skipped 517.
4. Live re-run slice by slice (0–25 … 225–250), reading each report first; expect 372 new native imports, the rest `filesAlreadyImported`, 0 folder creations.
5. Verify AC4/AC5 on one project (Office preview + download), then SQL for AC6/AC7/AC10.
6. Optional: delete the 372 native copies from `out/skipped-files/` after AC7 passes.
- No separately deployed component imports the changed module (only the admin route and the `tsx` check).

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused/dead code, `any`, secrets, or debug logging introduced.
- `classifyFile()` keeps the existing guard-clause shape; the native branch is three lines and names its behaviour (`fileName`).
- `FileClass`'s import variant now requires `fileName`, so every caller must supply it — no untyped escape hatch.
- `importFile()` gained one positional parameter (`fileName`); the call site passes `cls.fileName`, and `where` uses the same value so logs and stored paths cannot drift.
- The old local-copy path (`assignLocalPaths`) is untouched and still supplies native extensions for fallback/reclassified files.
- Route header comment updated from "native Zoho docs are saved locally" to the now-accurate "a native doc whose Office type the bucket rejects".
- Test changes assert behaviour (returned object), including the no-double-extension and fallback branches; the previous allowlist-gate assertion was moved to `csv`, not deleted.
- Every acceptance criterion names an observable check; AC5 is explicitly manual because the Office Online viewer fetches the signed URL from Microsoft's servers.

### Deviations
- **Minor — AC3 numbers corrected** during implementation (dry run is 6,845 importable / 1 too-large; live is 6,839 / 7). Explained in Implementation Notes with evidence from the 464 review.
- **Minor — check allowlist swapped** from xlsx to csv for the "known MIME, not allowed" assertion, because the native Sheet case now needs xlsx allowed. Explained inline and in Implementation Notes.

### Required Fixes
- None.
