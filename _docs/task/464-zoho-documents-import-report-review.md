# Zoho Project Documents Import — Report Review

**Reviewed:** 2026-11-02
**Scope:** `_from_zoho/documents-import-report-all-*.json` (10 slices / 11 files, 0–250) plus the local copies under `_docs/task/464-zoho-project-documents-import-files-tab/out/skipped-files/`
**Source of truth for the tree:** `_from_zoho/documents-all-{0-50,50-100,100-150,150-200,200-250}.json`

## Verdict

The reports are **internally consistent and match the export and the disk**. Every count balances, every project's folder/file totals match the source export, and **all 895 local copies exist, are non-empty, and match their source file** (513 byte-for-byte against declared size, the rest size-unverifiable because Zoho reports 0 bytes but signatures are valid).

Three things need your attention:

1. **`documents-import-report-all-50-75.json` is a failed run that was superseded by `documents-import-report-all-50-75 (1).json`.** Do not sum the two files. All 333 failures and 91 local failures in the original were resolved on the rerun.
2. **6 files are still unresolved** (3 empty downloads + 3 storage-upload errors). They are the only data not in the Hub and not saved locally.
3. **The live Supabase tables were not queried in this review** (credentials were not available in this sandbox). Verification is report ↔ export ↔ disk. SQL checks are suggested at the end.

## Headline totals

| Measure | Count |
|---|---|
| Zoho projects in scope (`projects.json`) | **228** |
| Projects with documents | **155** |
| Projects with no documents at all | **73** |
| Export items | **7,601** = 239 folders + 7,362 files |
| Folder nodes in the Hub | **499** (413 created + 86 reused; includes 260 synthesized roots) |
| Files in the Hub after import | **6,461** (6,413 imported during these runs + 48 already present) |
| Importable files (live classification) | **6,467** |
| Failed files (not in Hub, not local) | **6** |
| Files not importable by design → saved locally | **895** = 516 unsupported + 372 native + 7 too-large |
| Local copies on disk | **895 files, 5,356 MiB (~5.6 GB)** |
| Local copy failures | **0** |
| Projects matched | **155/155** by `external_project_id` (0 v2, 0 unmatched) |
| Folders renamed / skipped / failed | **0 / 0 / 0** |
| Unreachable export items | **0** |

### Accounting proof (all checks pass)

```
7,362 files  = 6,467 importable + 516 unsupported + 372 native + 7 too-large
6,467        = 6,413 imported + 48 already imported + 6 failed
895 local    = 516 unsupported + 372 native + 7 too-large
895 local    = 850 saved during these runs + 45 already on disk + 0 failed
499 folders  = 413 created + 86 reused = 239 exported folders + 260 synthesized roots
228 projects = 155 with documents + 73 without documents
```

All 10 authoritative reports also pass, per report: `sum(project.folders) = foldersCreated + foldersReused` and `sum(project.files) = filesImportable + filesNative + filesUnsupportedType + filesTooLarge`.

## Per-slice results

Authoritative report = the successful run for each slice (the 50–75 rerun replaces the original).

| Slice | Projects | No docs | Folders created | Folders reused | Files total | Imported | Already | Failed | Local saved | Local existed |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0–25 | 16 | 9 | 47 | 3 | 210 | 175 | 6 | 0 | 29 | 0 |
| 25–50 | 17 | 8 | 56 | 0 | 332 | 280 | 0 | 0 | 52 | 0 |
| 50–75 (rerun) | 23 | 2 | 0 | 83 | 511 | 332 | 42 | 0 | 92 | 45 |
| 75–100 | 18 | 7 | 45 | 0 | 351 | 304 | 0 | 0 | 47 | 0 |
| 100–125 | 12 | 13 | 42 | 0 | 361 | 306 | 0 | 0 | 55 | 0 |
| 125–150 | 21 | 4 | 65 | 0 | 1,190 | 1,048 | 0 | 1 | 141 | 0 |
| 150–175 | 22 | 3 | 67 | 0 | 2,199 | 2,006 | 0 | 3 | 190 | 0 |
| 175–200 | 10 | 15 | 34 | 0 | 583 | 510 | 0 | 0 | 73 | 0 |
| 200–225 | 14 | 11 | 51 | 0 | 1,475 | 1,321 | 0 | 2 | 152 | 0 |
| 225–250 | 2 | 1 | 6 | 0 | 150 | 131 | 0 | 0 | 19 | 0 |
| **Total** | **155** | **73** | **413** | **86** | **7,362** | **6,413** | **48** | **6** | **850** | **45** |

> The slice named 225–250 contains only 3 projects because `projects.json` has 228 entries, so `slice(225, 250)` returns 3. There is no gap.

### Superseded run — do not count

| Report | Imported | Failed | Local saved | Local failed | Status |
|---|---:|---:|---:|---:|---|
| `documents-import-report-all-50-75.json` (Oct 29 12:54) | 42 | **333** | 45 | **91** | Superseded |
| `documents-import-report-all-50-75 (1).json` (Oct 29 14:25) | **332** | **0** | 92 | 0 | **Authoritative** |

The original run hit HTTP 500 on Zoho downloads for 333 files. The rerun imported 332, found the 42 from the original already in the Hub, and correctly reclassified one file as too-large. Every one of the 91 local failures from the original was saved on the rerun. If both files are summed, the 50–75 slice is double-counted and 333 resolved failures appear outstanding.

## Local copies — verified

Checked against both the report list and the original export:

| Check | Result |
|---|---|
| Entries in the authoritative reports | 895 |
| Files on disk | 895 |
| Referenced file missing | **0** |
| Zero-byte files | **0** |
| Extra files on disk not in any report | **0** |
| Entries with `localStatus: saved` | 850 |
| Entries with `localStatus: exists` (already on disk) | 45 |
| Entries with `localStatus: failed` | 0 |
| Local path computed from export = reported path | **895/895** |
| Declared size > 0 compared byte-for-byte | **513/513 exact** |
| Declared size = 0 (Zoho metadata not trustworthy) | 382 — all non-empty, signatures valid |
| Native extension rewritten correctly | **372/372** (283 `.docx`, 56 `.xlsx`, 33 `.pptx`) |
| Duplicate local paths | **0** |
| Same-name sibling groups (Zoho legitimately has same-named files) | 22 groups / 53 files — disambiguated with ` (<last 6 of id>)`, all unique |
| File-signature mismatch | **1** (a file named `.heic` that is actually JPEG — valid image, Zoho mislabel, not corruption) |
| HTML/error-page content saved as a document | **0** |

The 45 `exists` entries are the 45 files the original 50–75 run had already saved before it failed; the rerun correctly skipped re-downloading them. The 91 original `localStatus: failed` entries were all saved on the rerun.

## Unresolved failures — 6 files

These were neither imported nor saved locally. Retrying by project is the fix.

| # | Project (Zoho ID) | File | Error |
|---|---|---|---|
| 1 | BP Portal (`1512955000002906003`) | `BP Portal-Documents/Stock Level Update.csv` | empty download |
| 2 | WSC Group (`1512955000000872289`) | `WSC Group-Attachments/Image 1.png` | storage upload failed: `<none>` |
| 3 | WSC Group (`1512955000000872289`) | `WSC Group-Attachments/6. June Wage increase special S3 E5.png` | storage upload failed: `<none>` |
| 4 | Welcome Tattoo (`1512955000000697473`) | `Welcome Tattoo-Attachments/Still Not Asking For It Flash Sheet.jpg` | storage upload failed: `<none>` |
| 5 | OOYes (`1512955000000065039`) | `OOYes-Documents/Images/oOYes Website Photos/DSC06767.jpg` | empty download |
| 6 | OOYes (`1512955000000065039`) | `OOYes-Documents/Documents/oOYes Website Photos/DSC06767.jpg` | empty download |

Notes:

- **Empty download** means WorkDrive returned a 0-byte body. Two are the same photo name in two different OOYes folders.
- **`storage upload failed: <none>`** means Supabase returned no error message — usually transient or a bucket/MIME policy edge case. A rerun is the first thing to try.
- The 333 HTTP 500 failures in the original 50–75 run are **not** outstanding; the rerun resolved them.

## Not imported by design (895 files, saved locally)

| Reason | Files | Size on disk | Detail |
|---|---:|---:|---|
| Unsupported type (bucket rejects) | 516 | 2,708,656,963 B (~2.52 GiB) | `webm` 263, `heic` 59, `mp4` 36, `mov` 32, `json` 28, `eml` 15, `tif` 14, `php` 6, `pages` 5, `msg` 5, `scss`/`ics`/`rtf`/`avif`/`css` 4 each, plus a long tail |
| Native Zoho docs | 372 | 392,069,101 B (~374 MiB) | Saved as Office files: 283 `.docx`, 56 `.xlsx`, 33 `.pptx` |
| Over 200 MB | 7 | 2,515,573,589 B (~2.34 GiB) | See list below |
| **Total** | **895** | **5,356 MiB (~5.6 GB)** | |

### The 7 too-large files

| Project | File | Size |
|---|---|---:|
| Casa Kalma | `CasaKalma_Presentation_juni_26.pdf` | 267.6 MB |
| Casa Kalma | `CasaKalma_factsheet_juni_26.pdf` | 278.5 MB |
| Casa Kalma | `CasaKalma_factsheet_Type_2s.pdf` | 367.8 MB |
| Casa Kalma | `CasaKalma_factsheet_Type_3s.pdf` | 396.0 MB |
| Casa Kalma | `CasaKalma_factsheet_Type_1s.pdf` | 402.5 MB |
| OOYes | `oOYes Website Photos.zip` | 224.0 MB |
| Ellen Cassilly Architects | `Clayton Road II-1-001.zip` | 462.6 MB |

Only the OOYes ZIP was known to be over 200 MB from the export metadata. The other 6 declared 0 bytes (or a small size) and were correctly reclassified **after download**. This is why the live "importable" count is 6,467 rather than the dry-run's 6,473, and "too-large" is 7 rather than 1. The plan's numbers still reconcile:

```
dry run: 6,473 importable + 516 unsupported + 372 native + 1 too-large = 7,362
live:    6,467 importable + 516 unsupported + 372 native + 7 too-large = 7,362
```

## 73 projects with no documents

These are not failures — the export contains zero items for them. They account for all 73 of the 228 projects not listed in the reports.

<details>
<summary>Project names (73)</summary>

Hello Homes GR Content Site; All About Smiles (Seva Dental); Pine Ridge Dental Team; Test WebriQ Content Site; Test Central Hub Content Site; Ohio Urgent Dental Care (Seva); First Watch Security; Dino Group of Companies; West Bloomfield Dental Team; Citation Grader; CiteForge; Staro; Willoughby Dental Team; Quality Edge Portal; Mikula Dental; Toledo Dental Team; Grandville Family Dental; WebriQ Bootcamp; Irth Solutions; 2024 April StackShift Template; StackShift - Test; StackShift - Template 2024; Eunoia Inc; WPP - Commercial Electrical; WPP - Gas Lines Services; WPP - Residential Electrical; Watershed Analytics, LLC; Well Being; Revisions by Jonathan; ProGrowth Advisors; Getskywayanalyatics; EPIPHRON Health Care; AAA Master CLean LCC; Marketing Strategy; Marketing Strategy; Mile High Training, LLC; Dr Alastair Dvaz; Test Project (Dorell); DXP Studio; Boulder Biotech Launch Specialists, LLC; Buck Woodcraft; Colorado Transmission & Diesel Specialists; Solid Rock Agency; Sierravp; Quar Notary; Balance Chiropractic; PSI Systems Inc.; CLGS; Assured Assisted Living; Trimex Outdoor; John R Davies; Dawson Infrastructure Solutions; Neighborhood IT LLC; L.L. Nelson Paralegal; Flawless Steel Welding LLC; Lane Mitchell Jewelers; Armstrong Real Estate; Retirement Optimized; K and G Solutions; Day Lily Salon and Spa; Lightning Mobile Electric; Site LIVE Preview; Pikes Peak Security; ANZAC Day Commemorative Committee; Mc Gregor Wealth; Ketamine CO Springs; WebriQ - Blank Template; CI4SI; Brian Boals; Sandy Scott; Pacific Coast Land Solutions, LLC; Mission Mortgage Colorado; Frontline Partners, LLC.

</details>

## Accuracy findings and caveats

1. **The 50–75 original report is misleading on its own.** It records a real mid-run failure (333 HTTP 500s, 91 local failures). The `(1)` rerun is the authoritative version. Any total that adds both reports double-counts that 25-project slice.
2. **Missing count keys mean zero.** The route only emits counters it incremented, so the absence of e.g. `filesTooLarge` or `localExisting` in some reports is not a missing measurement.
3. **`projects` in a report excludes projects with no documents.** It lists only resolved documents-bearing projects. `projectsWithoutDocuments` is the companion count. For every slice: `report.projects.length + projectsWithoutDocuments = slice size`. Confirmed.
4. **All 155 projects matched by `external_project_id`; 0 matched by `customer+name`, 0 unmatched.** No guesswork, no project creation.
5. **No duplicate Zoho project, no duplicate Hub project, no duplicate local path** across the authoritative reports.
6. **The task doc's dry-run expectations match the live outcomes** (499 folder nodes, 7,362 files, 155 projects, 516 unsupported, 372 native), with the 6 post-download size reclassifications explained above.
7. **Database and Storage were not independently verified.** The reports' `filesImported` counts were checked only for arithmetic consistency and against the source export, not against rows in `customer_assets` / objects in the `customer-assets` bucket. This is the one remaining verification gap.

## Suggested follow-ups

1. **Retry the 6 failed files**, one project at a time from the local dev server:
   - `POST /api/admin/zoho-import/documents?project=1512955000002906003` (BP Portal)
   - `POST /api/admin/zoho-import/documents?project=1512955000000872289` (WSC Group)
   - `POST /api/admin/zoho-import/documents?project=1512955000000697473` (Welcome Tattoo)
   - `POST /api/admin/zoho-import/documents?project=1512955000000065039` (OOYes)
2. **Confirm the DB/Storage counts** with read-only SQL:
   ```sql
   -- Expect 6,461
   select count(*) from customer_assets where external_id is not null;
   -- Expect 499
   select count(*) from customer_asset_folders where phase_number = 1 and external_id is not null;
   -- Expect 0 duplicates
   select project_id, external_id, count(*)
   from customer_assets
   where external_id is not null
   group by 1, 2 having count(*) > 1;
   ```
   Then compare Storage object count for `customer-assets` with the same 6,461.
3. **Optional policy decision:** the 372 native Zoho docs downloaded as valid `.docx`/`.xlsx`/`.pptx`, which the bucket accepts. They were excluded by decision D3 ("skip, keep local"). If you want them in the Files tab, they can now be imported without widening the bucket allowlist.
