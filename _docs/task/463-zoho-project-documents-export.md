# 463: Zoho Project Documents export (metadata + WorkDrive download URLs) — Projects migrate tab

**Created:** 2026-10-28
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Completed (2026-10-28)

---

## Overview

The Zoho Projects migrate tab (`/admin/migrate`) exported tasks, issues, comments, time logs and *attachment* metadata, but nothing for each project's **Documents** module — the project-level folder tree where files live. This task adds a **Project Documents** export card that walks that tree and downloads the metadata as JSON, ahead of the Zoho decommission. Like `attachment-meta`, it does **not** download file bytes; it captures metadata + the WorkDrive `download_url` per file.

Zoho Projects v3 lists only each project's *root* folders (`GET /projects/{id}/documents` → `documents.folders[]`, each with a `workdrive_folder_id`). The files themselves live in Zoho WorkDrive, so the route walks the folder tree breadth-first through the WorkDrive API (`GET /workdrive/api/v1/files/{folderId}/files`).

## Requirements

- [x] Export route `GET /api/admin/zoho-export/documents` (admin / super_admin only), streamed as SSE (`progress`, `documents`, `done`)
- [x] `?list=1` returns the project dropdown options from `_from_zoho/projects.json`
- [x] `?project=<zoho id>` exports one project; otherwise all projects, optionally sliced with `from` / `to` (same convention as the other exports) so a long run can be split
- [x] Walk each root folder's WorkDrive tree (paginated, `page[limit]=50`, `seen` set guards against revisiting a folder); tag every item with `_zoho_project_id`, `_zoho_root_folder`, `_zoho_parent_workdrive_id`
- [x] Throttle-safe: reuses `fetchZohoWithRetry()` plus 700 ms sleeps between calls (Zoho's 200 req / 2 min rolling limit)
- [x] Failed projects are collected and reported in the `done` event; the card saves them as `documents-failed-<tag>.json`
- [x] UI row (`DocumentsExportRow`) with project dropdown, From/To range, progress bar, and a browser download of `documents-<tag>.json`

## Out of Scope / Must-Not-Change

- **No file-byte download.** WorkDrive/Docs-hosted files are not fetchable server-side with the Projects OAuth token (task 106: `401 INVALID_OAUTHSCOPE`). This export captures metadata and URLs only.
- No import step — nothing consumes `documents-*.json` yet.
- Other export routes and `getZohoProjects()` are untouched.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/admin/zoho-export/documents/route.ts` | Create | SSE export: root folders from Projects v3, tree walk through WorkDrive |
| `src/app/(hub)/admin/migrate/_documents-card.tsx` | Create | `DocumentsExportRow` — dropdown, From/To, progress, JSON download |
| `src/app/(hub)/admin/migrate/_zoho-projects-tab.tsx` | Modify | Add the `documents` entry to `EXPORT_LEVELS` and render `DocumentsExportRow` for it |

## Implementation Notes

- **Output location.** The card builds the file in the browser (`saveJson()` → `Blob` + `<a download>`), so downloads land in the browser's download folder (`~/Downloads`), not in the repo. Move `documents-*.json` into `_from_zoho/` by hand.
- **Filename tag.** `documents-<tag>.json`, where `<tag>` is the project id for a single project, or `all-<from>-<to>` (`to` = `end` when blank). The failures file is `documents-failed-<tag>.json` and holds `[{ id, name }]` only — **no failure reason is recorded**.
- **404 vs everything else.** The route treats only `404` as benign ("project has no Documents module / folder is gone"). Any other non-OK status, including throttle exhaustion, marks the project failed. The real status is only `console.log`ged on the dev server, not returned to the browser.

## Run Results (2026-10-28)

Exported in five slices of the 228 projects in `projects.json` (0–50, 50–100, 100–150, 150–200, 200–250; the last slice ends at 227):

| Slice | Documents | Projects with documents | Failed projects |
|-------|-----------|-------------------------|-----------------|
| 0–50 | 599 | 33 | 0 |
| 50–100 | 923 | 41 | 0 |
| 100–150 | 1,601 | 33 | 0 |
| 150–200 | 2,828 | 32 | 14 |
| 200–250 | 1,650 | 16 | 12 |
| **Total** | **7,601** | **155** | **26** |

- Item mix: 4,057 images, 1,088 docs, 797 PDFs, 443 files, 333 video, 283 writer, 242 spreadsheets, 239 folders, plus presentations/Zoho Sheet/Show/audio. Declared size across `storage_info.size_in_bytes` ≈ **16.7 GB** of file content that this export did *not* download.
- 228 − 155 − 26 = 47 projects returned no documents (404 / empty root folders) and are not failures.
- `_from_zoho/documents-all.json` (7,574 docs, same 155 projects) is an earlier combined export. The five slice files contain **27 additional documents** not in it, so the slices are the authoritative set. Why those 27 differ was not investigated.

## Why 26 projects "failed"

The failed files record no reason, so it was reproduced after the run: replaying the route's first call (`GET /projects/{id}/documents`) for **all 26 failed projects** returned the same response for every one:

```
403  {"error":{"code":6500,"message":"The module is not available in your current plan or it has been disabled."}}
```

A control project that exported successfully (RCB & Associates) returned `200` with its folders in the same session, so the token and portal were fine. The failures are the **Documents module being disabled on those specific projects**, not throttling, not auth, and not a route bug.

Supporting evidence:
- All 26 are old projects (created Aug–Sep 2020, most untouched since 2022).
- None has a single document captured in any `documents-*.json`.
- The failures are scattered through each run (slice positions 179–198 and 201–226), not bunched at the end, which rules out rolling-throttle exhaustion.

**Conclusion:** nothing was lost. There is no document tree to export for these 26 projects and retrying will not change that. The 7,601 captured documents are everything the portal exposes.

### Names of the 26 projects

150–200 slice: PSI Systems Inc., CLGS, Assured Assisted Living, Trimex Outdoor, John R Davies, Dawson Infrastructure Solutions, Neighborhood IT LLC, Flawless Steel Welding LLC, Lane Mitchell Jewelers, Armstrong Real Estate, Retirement Optimized, K and G Solutions, Day Lily Salon and Spa, Lightning Mobile Electric.

200–250 slice: Site LIVE Preview, Pikes Peak Security, ANZAC Day Commemorative Committee, Mc Gregor Wealth, Ketamine CO Springs, WebriQ - Blank Template, CI4SI, Brian Boals, Sandy Scott, Pacific Coast Land Solutions, LLC, Mission Mortgage Colorado, Frontline Partners, LLC.

## Acceptance Criteria

- [x] Card exports one project or a From/To range and downloads `documents-<tag>.json`
- [x] Every one of the 228 projects in `projects.json` was attempted (five slices cover 0–227)
- [x] Failed projects are listed in a downloadable `documents-failed-<tag>.json`
- [x] Cause of the 26 failures identified and confirmed against all 26 (403 / code 6500, module disabled)

## Verification

- Browser-based acceptance run against the live portal (the five slices above). No test runner is configured for this area.
- Failure diagnosis: a throwaway script replayed the first Documents call for all 26 failed projects plus one control project; it lived in the session scratchpad and was not added to the repo.

## Follow-ups (not done)

- **Treat 403 / code 6500 as "no Documents module"** (same as 404) in `documents/route.ts` so the card stops reporting module-disabled projects as failures. Optionally include the HTTP status and Zoho error code in the `failed_projects` entries so the failed file explains itself.
- **File bytes are not captured.** (Corrected 2026-10-28 during task 464 planning: the earlier "likely unreachable" guess was wrong.) `attributes.download_url` still returns `401 INVALID_OAUTHSCOPE` (task 106), but the WorkDrive API download endpoint (`GET https://www.zohoapis.com/workdrive/api/v1/download/<id>`) returns file bytes with the Hub's current token (`WorkDrive.files.ALL`) even though the WorkDrive web UI shows "Subscription Expired". It may stop working at any time, so import soon — see task 464.
- Move/merge the five slice files into `_from_zoho/`, and decide whether `documents-all.json` should be retired in favour of them.

## Compatibility Touchpoints

- Admin-only migrate tooling; no change to the Hub's runtime features, schema, or the MCP tool surface (`_docs/mcp-tools.md` not affected).
- `_from_zoho/` output may contain real customer data — do not commit it.

## Completion Note

Marked complete 2026-10-28 at the user's request after the five-slice run. Verified: 7,601 documents across 155 projects exported; all 26 failures confirmed as Zoho 403 / 6500 (Documents module disabled). Not verified: the 27-document difference versus `documents-all.json`, and whether `documents-failed-*.json` and the five slices have been moved into `_from_zoho/` beyond what the listing showed.
