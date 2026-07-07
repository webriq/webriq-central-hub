# Task 114 — Zoho Issue Attachments Import: `issue` Entity Type + Manual-Match Upload Route

> **Priority:** HIGH
> **Type:** feature
> **Version Impact:** minor
> **Recommended Model:** sonnet
> **Date:** 2026-07-07
> **Status:** COMPLETED
> **Completed:** 2026-07-08
> **Deferred (user decision):** 6 large files from batch 1 (`CasaKalma_brochure_v1.pdf`, `_type1/2/3.pdf`, `LX_SE41_Scene.pdf`, `Screen Recording 2026-01-20 175721.mp4`) have `attachments` rows already but no uploaded storage object — blocked on a Supabase Dashboard-level "Global file size limit" setting (separate from the bucket's own `file_size_limit`, which migration 055 already raised) that the user will raise manually before re-uploading those 6 files. Not a code defect; see the "Fourth live run" section below.
> **Investigation:** No formal `/understand` run. Grounded via direct analysis in-session: read the current shipped `src/app/api/admin/zoho-import/attachments/route.ts` (task 106, full file) as the direct model, confirmed the `attachments` table's `entity_type` CHECK constraint (migration 049) only allows `('task', 'project', 'comment')`, confirmed `resolveIssueId()` already exists in `zoho-import.ts` (task 110), confirmed the `project-assets` Storage bucket already exists (migration 050), and — critically — ran a live duplicate-filename analysis across both real downloaded batches (`_from_zoho/issue-attachment-meta-0-500.json` + `500-1049.json`, 629 records, all 629 files already downloaded and organized into `~/Downloads/zoho-issue-attachments-1/` and `-2/` per task 113's live run) that surfaces a real design gap task 106 never had to solve. Treat all counts below as grounded, not estimated.

---

## Overview

Task 106 (Attachments Bulk Upload) built a manual-match uploader for **Task** attachments only, because server-side/browser-JS fetch of Zoho Docs/WorkDrive-routed attachments is architecturally blocked (confirmed via live diagnostics in that task: `401 INVALID_OAUTHSCOPE` with the Projects OAuth token, `401 INVALID_TICKET` + no CORS headers with no auth). This task extends that same proven design to **Issue** attachments, all 629 of which are already downloaded and organized (task 113's live run: 351 in slice 0-500, 278 in slice 500-1049) and carry the identical `app_name: "Zoho Docs"` marker confirming the same architectural block applies.

**Scope**: new migration (add `'issue'` to the `entity_type` CHECK constraint), a new import route (`issue-attachments`, mirroring `attachments` route.ts), and a new `migrate/page.tsx` import card with its own file picker — the existing Task attachments route/card is untouched, matching every other Issue-scoped addition in this codebase (107–113 never modified their Task-side sibling).

**One real design improvement over task 106, not just a rename**: task 106's filename-only matching design was never actually exercised against ambiguous data (its 40-file Task dataset had zero duplicate filenames, confirmed live at the time). The real 629-file Issue dataset does have duplicates — see Decision #2 below — so this task fixes the matching key before it ships, rather than copying an untested assumption forward.

---

## Decisions (resolved before spec — recommended defaults, flag before/during `/implement` if any should differ)

1. **Schema: add `'issue'` to `attachments_entity_type_check`, not a new table.** `attachments` is already a polymorphic `entity_type`/`entity_id` table (migration 025) — the exact same reasoning that made `time_logs.issue_id` (task 112) a column addition rather than a new table applies here even more directly, since this table's whole design is built around adding new entity types via the constraint, not new columns.
2. **Match uploaded files by `(name, size)` compound key, not name alone.** This is the one functional improvement over task 106. Live analysis of the real 629-record dataset found:
   - **566 of 629 files (90%)** have a globally unique name — matches cleanly either way.
   - **20 more files (9 duplicate-name groups)** share a name with another attachment but have a *different* size — task 106's name-only matching would have flagged these as "ambiguous" and skipped them for no real reason; matching on `(name, size)` resolves all 20 correctly.
   - **43 files (20 duplicate-name groups) are genuinely unresolvable** — identical name *and* identical size (e.g. `IMG_6530.jpeg` appears twice at exactly `3804331` bytes both times) — almost certainly the same file content cross-attached to two different issues. No metadata field can distinguish which physical upload belongs to which issue record.
   - **Recommended handling**: for the 43 truly-ambiguous files, keep task 106's original behavior — skip, surface in `errors`, do not guess. This is a real (not theoretical) gap this time, so document it as a known limitation rather than silently accepting whichever match comes first in file order (which would risk mis-attributing an attachment to the wrong issue).
3. **No manual-reassignment UI for the 43 ambiguous files**, matching task 106's own explicit precedent ("out of scope given the tiny, currently-unambiguous dataset" — except this time the dataset genuinely has ambiguity, so this is a real deferred gap, not a hypothetical one). If the user wants these resolved, the fallback is manual `attachments` row insertion via Supabase directly, referencing the specific issue by its known `_zoho_issue_id`.
4. **Storage path**: `zoho/issues/${_zoho_issue_id}/${externalId}_${filename}` — mirrors the Task version's `zoho/${_zoho_task_id}/${externalId}_${filename}` exactly, with an `issues/` segment inserted for organizational clarity in the shared `project-assets` bucket. Not required for collision-avoidance (confirmed zero `third_party_file_id` overlap between the 40 already-imported Task attachments and the 629 Issue attachments — see below), purely for readability when browsing the bucket.
5. **Reuse `third_party_file_id` as `external_id`**, never `attachment_id`. Confirmed the same `attachment_id: "-1"` sentinel quirk from task 106 applies here too: **50 of 629** Issue attachment records carry `attachment_id: "-1"`. `third_party_file_id` is present and usable on all 629.
6. **Confirmed zero `external_id` collision risk**: diffed all 40 already-imported Task attachments' `third_party_file_id` values against all 629 Issue attachments' values — 0 overlaps. Safe to share one `external_id unique` constraint on the same `attachments` table.
7. **No CHECK constraint enforcing entity_type/storage-path consistency** — matches the codebase's existing light-touch constraint style (same reasoning as task 112's decision to skip a `task_id`/`issue_id` mutual-exclusivity CHECK on `time_logs`).
8. **Reuse `resolveIssueId()` is NOT called per-row** — same N+1-avoidance reasoning as every other bulk import route in this codebase. Build a bulk, **paginated** `issueMap` instead (see Notes — `issues` has 1,049 rows, over Supabase's 1000-row default cap).

---

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/054_attachments_issue_entity_type.sql` | Create | Drop + re-add `attachments_entity_type_check` to include `'issue'` |
| `src/app/api/admin/zoho-import/issue-attachments/route.ts` | Create | New manual-match upload route — issue-scoped sibling of `zoho-import/attachments/route.ts` |
| `src/app/v2/(hub)/admin/migrate/page.tsx` | Modify | Add `IssueAttachmentsImportState` interface, `issueAttachmentsFiles` state, `handleIssueAttachmentsImport()`, `issue-attachments` entry in `IMPORT_LEVELS`, `key === "issue-attachments"` JSX block with its own file picker |
| `src/lib/migrate/zoho-import.ts` | No changes | `resolveIssueId` exists but is not used in the hot loop (see Decision #8) |

---

## Code Context

### Migration — `supabase/migrations/054_attachments_issue_entity_type.sql` (full file, new)

```sql
-- Migration 054: attachments.entity_type — add 'issue' (task 114)
-- attachments is already a polymorphic entity_type/entity_id table (migration 025);
-- extending the CHECK constraint is the correct fix, not a new table — same reasoning
-- already applied to time_logs.issue_id in task 112.

alter table attachments
  drop constraint attachments_entity_type_check;

alter table attachments
  add constraint attachments_entity_type_check
  check (entity_type in ('task', 'project', 'comment', 'issue'));
```

### Current Task version (full file, direct model) — `src/app/api/admin/zoho-import/attachments/route.ts`

```ts
// dev-only import endpoint — matches admin-uploaded files against attachment-meta-*.json
// by filename, uploads matched files directly to Supabase Storage, upserts to attachments via SSE.
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";

type ZohoAttachmentRaw = {
  third_party_file_id?: string;
  name?: string;
  size?: string;
  download_url?: string;
  trashed?: boolean;
  _zoho_task_id?: string;
  [key: string]: unknown;
};

export async function POST(request: NextRequest) {
  // ...auth guard (admin/super_admin) — keep identical...

  const formData = await request.formData();
  const files = formData.getAll("files").filter((f): f is File => f instanceof File);
  if (files.length === 0) {
    return NextResponse.json({ error: "No files uploaded" }, { status: 400 });
  }

  // Multi-file scan of attachment-meta-*.json — unchanged pattern
  const dir = path.join(process.cwd(), "_from_zoho");
  const attachments: ZohoAttachmentRaw[] = [];
  const batchFiles = fs.readdirSync(dir).filter((f) => f.startsWith("attachment-meta-") && f.endsWith(".json")).sort();
  // ...loads attachments array...

  // Filename → metadata record(s) — BUG (for our dataset, not task 106's): name-only key
  // collides on 63 real files across 29 duplicate-name groups in the Issue dataset.
  const metaByName = new Map<string, ZohoAttachmentRaw[]>();
  for (const att of attachments) {
    const name = att.name ?? "";
    if (!name) continue;
    if (!metaByName.has(name)) metaByName.set(name, []);
    metaByName.get(name)!.push(att);
  }

  // ... SSE stream setup ...
  // Pre-built, paginated task lookup map
  const taskRows: Array<{ id: string; external_id: string }> = [];
  {
    const PAGE = 1000;
    let from = 0;
    while (true) {
      const { data: page } = await adminClient.from("tasks").select("id, external_id").not("external_id", "is", null).range(from, from + PAGE - 1);
      if (!page || page.length === 0) break;
      taskRows.push(...(page as Array<{ id: string; external_id: string }>));
      if (page.length < PAGE) break;
      from += PAGE;
    }
  }
  const taskMap = new Map(taskRows.map((t) => [String(t.external_id), t.id]));

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const matches = metaByName.get(file.name) ?? [];
    if (matches.length === 0) { /* skip, "no matching record" */ continue; }
    if (matches.length > 1) { /* skip, "ambiguous" */ continue; }

    const att = matches[0];
    const externalId = String(att.third_party_file_id ?? "");
    // ... skip checks for missing externalId, trashed ...
    const taskId = taskMap.get(String(att._zoho_task_id ?? "")) ?? null;
    // ... skip if unresolved ...

    const safeName = `zoho/${att._zoho_task_id}/${externalId}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
    await adminClient.storage.from("project-assets").upload(safeName, file, { upsert: true });

    await adminClient.from("attachments").upsert(
      { external_id: externalId, entity_type: "task", entity_id: taskId, storage_path: safeName, filename: file.name, size: fileSize, source_url: att.download_url ?? null },
      { onConflict: "external_id" }
    );
  }
}
```

### New route — `src/app/api/admin/zoho-import/issue-attachments/route.ts` (differences from the model above)

```ts
type ZohoIssueAttachmentRaw = {
  third_party_file_id?: string;
  name?: string;
  size?: string;
  download_url?: string;
  trashed?: boolean;
  _zoho_issue_id?: string;
  [key: string]: unknown;
};

// Multi-file scan: issue-attachment-meta-*.json (fallback issue-attachment-meta.json)
const batchFiles = fs.readdirSync(dir).filter((f) => f.startsWith("issue-attachment-meta-") && f.endsWith(".json")).sort();

// Compound (name, size) matching key — see Decision #2. Key format: `${name}::${size}`.
const metaByNameSize = new Map<string, ZohoIssueAttachmentRaw[]>();
for (const att of attachments) {
  const name = att.name ?? "";
  if (!name) continue;
  const key = `${name}::${att.size ?? ""}`;
  if (!metaByNameSize.has(key)) metaByNameSize.set(key, []);
  metaByNameSize.get(key)!.push(att);
}

// Pre-built, paginated issue lookup map — issues has 1,049 rows, over the 1000-row default cap
const issueRows: Array<{ id: string; external_id: string }> = [];
{
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data: page } = await adminClient.from("issues").select("id, external_id").not("external_id", "is", null).range(from, from + PAGE - 1);
    if (!page || page.length === 0) break;
    issueRows.push(...(page as Array<{ id: string; external_id: string }>));
    if (page.length < PAGE) break;
    from += PAGE;
  }
}
const issueMap = new Map(issueRows.map((i) => [String(i.external_id), i.id]));

for (let i = 0; i < files.length; i++) {
  const file = files[i];
  const key = `${file.name}::${file.size}`;
  const matches = metaByNameSize.get(key) ?? [];
  if (matches.length === 0) { errors.push(`${file.name}: no matching record (checked name+size)`); skipped++; continue; }
  if (matches.length > 1) { errors.push(`${file.name}: ${matches.length} ambiguous matches even after name+size — identical file content attached to multiple issues, skipped, import manually`); skipped++; continue; }

  const att = matches[0];
  const externalId = String(att.third_party_file_id ?? "");
  // ... same missing-externalId / trashed checks ...
  const issueId = issueMap.get(String(att._zoho_issue_id ?? "")) ?? null;
  if (!issueId) { errors.push(`${file.name}: unresolved issue ${att._zoho_issue_id} (not yet imported)`); skipped++; continue; }

  const safeName = `zoho/issues/${att._zoho_issue_id}/${externalId}_${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await adminClient.storage.from("project-assets").upload(safeName, file, { upsert: true });

  await adminClient.from("attachments").upsert(
    { external_id: externalId, entity_type: "issue", entity_id: issueId, storage_path: safeName, filename: file.name, size: fileSize, source_url: att.download_url ?? null },
    { onConflict: "external_id" }
  );
}
```

**Note on `file.size` reliability for the compound match key**: the browser's `File.size` for a locally-downloaded file is the actual on-disk byte count, which is exactly what we verified byte-for-byte against the export metadata during task 113's live run (100% match across all 629 files, confirmed via Node `fs.statSync`). Safe to trust for this compound key.

### `migrate/page.tsx` — current relevant line numbers for the Task attachments import (model to mirror)

- `AttachmentsImportState` interface: `page.tsx:96-100` — add `IssueAttachmentsImportState` (same shape) directly after it.
- `IMPORT_LEVELS` array (`page.tsx:116-129`) — add directly after the existing `attachments` entry:
  ```ts
  { key: "issue-attachments", label: "Issue Attachments", desc: "Select the files you manually downloaded from each issue attachment's download_url — matches by filename+size and uploads to Supabase Storage" },
  ```
- State hooks: `page.tsx:232` (`attachmentsImport`) and `page.tsx:237` (`attachmentsFiles`) — add `issueAttachmentsImport` and `issueAttachmentsFiles` directly after.
- Handler: `page.tsx:1016-1078` (`handleAttachmentsImport`) — add `handleIssueAttachmentsImport()` directly after it closes, same SSE-reader structure, POSTing to `/api/admin/zoho-import/issue-attachments`, using bracket notation `importStates["issue-attachments"]` (hyphenated key, same rule already established elsewhere in this file).
- JSX render block: `page.tsx:1972-2044` (`if (key === "attachments")`, includes the native `<input type="file" multiple>` picker at `:1989-1994`) — add `if (key === "issue-attachments")` directly after it closes, same structure including its own file picker, before the generic fallback card render (`page.tsx:2046`).

---

## Implementation Steps

1. Write and apply `supabase/migrations/054_attachments_issue_entity_type.sql`.
2. Create `src/app/api/admin/zoho-import/issue-attachments/route.ts` per Code Context — multi-file scan of `issue-attachment-meta-*.json`, `(name, size)` compound matching key, paginated `issueMap`, `entity_type: "issue"`, `zoho/issues/${_zoho_issue_id}/...` storage path.
3. In `src/app/v2/(hub)/admin/migrate/page.tsx`:
   a. Add `IssueAttachmentsImportState` interface after `AttachmentsImportState` (`:100`).
   b. Add the `issue-attachments` entry to `IMPORT_LEVELS` after `attachments` (`:128`).
   c. Add `issueAttachmentsImport` and `issueAttachmentsFiles` state hooks after the Task versions (`:232`, `:237`).
   d. Add `handleIssueAttachmentsImport()` after `handleAttachmentsImport()` closes (~`:1078`).
   e. Add the `if (key === "issue-attachments")` JSX block (with its own file picker) after the `key === "attachments"` block closes (~`:2044`).
4. Run `npx tsc --noEmit` and `pnpm lint`.
5. Live-test: upload the 351 files from `~/Downloads/zoho-issue-attachments-1/`, then the 277 (or 278, if the previously-503'd `Obsolete items.xlsx` recovered fine — it did, per task 113's follow-up) from `~/Downloads/zoho-issue-attachments-2/`. Confirm the done-summary shows roughly 586 imported (566 unique + 20 recovered via name+size), ~43 skipped as genuinely ambiguous, 0 unexpected errors.

---

## Notes for Implementation Agent

- **This route only ever sets `entity_type: "issue"`**, never `"task"` — the existing Task attachments route only ever sets `"task"`. Deliberately parallel, independent writers into the same table, same as the `time_logs.task_id`/`issue_id` split in task 112.
- **The `(name, size)` compound match key is the one real functional delta from task 106** — do not silently revert to name-only matching "to keep it simple." The live data proves name-only would incorrectly skip 20 legitimately-resolvable files (see Decision #2's exact counts).
- **`issueMap` must be paginated** — `issues` has 1,049 rows, over Supabase/PostgREST's 1000-row default cap (same bug class already hit in tasks 103, 108, 110, and caught proactively in task 112's own implementation before it shipped). Do not copy an unbounded `.select()`.
- **Do not build a manual-reassignment UI for the 43 ambiguous files** in this pass — matches task 106's own scoping precedent. Flag clearly in the done-summary's error list so whoever runs this live knows exactly which files need manual attention.
- **Every hyphenated-key state access must use bracket notation** (`importStates["issue-attachments"]`) — same rule already established for `issue-comments`/`issue-timelogs`/`attachment-meta`/`issue-attachment-meta` in this same file.
- **This is a dev-only admin tool** (`/v2/admin/migrate`, already auth-gated) — no RLS changes needed, no public exposure.
- **Prerequisite**: task 108 (Issues import) must already be complete — `issueMap` resolution depends on the `issues` table being populated. It is (confirmed complete per `TASKS.md`).

---

## Implementation Notes

### What Changed
- Added `supabase/migrations/054_attachments_issue_entity_type.sql` — drops and re-adds `attachments_entity_type_check` to include `'issue'`, exactly as specced.
- Created `src/app/api/admin/zoho-import/issue-attachments/route.ts` — new manual-match upload route, issue-scoped sibling of `zoho-import/attachments/route.ts`, using the `(name, size)` compound matching key and a paginated `issueMap`.
- Added all 5 planned pieces to `src/app/v2/(hub)/admin/migrate/page.tsx`: `IssueAttachmentsImportState` interface (after `AttachmentsImportState`), `issue-attachments` entry in `IMPORT_LEVELS` (after `attachments`), `issueAttachmentsImport`/`issueAttachmentsFiles` state hooks (after the Task versions), `handleIssueAttachmentsImport()` (after `handleAttachmentsImport()` closes), and the `key === "issue-attachments"` JSX block with its own file picker (after the `attachments` block, before the generic fallback card).

### Files Changed
- `supabase/migrations/054_attachments_issue_entity_type.sql` — new migration, adds `'issue'` to the entity_type CHECK constraint.
- `src/app/api/admin/zoho-import/issue-attachments/route.ts` — new route; multi-file scan of `issue-attachment-meta-*.json`/`issue-attachment-meta.json`, `(name, size)` compound match key, paginated `issueMap`, `entity_type: "issue"`, `zoho/issues/${_zoho_issue_id}/...` storage path.
- `src/app/v2/(hub)/admin/migrate/page.tsx` — the 5 additive pieces listed above.

### Deviations From Plan
- None. Confirmed `src/types/database.ts`'s `attachments.entity_type` is typed as plain `string` (not a literal union), so no type file changes were needed — this matches the task doc's own File Changes table, which correctly listed no database.ts change for this task.
- `(name, size)` compound key, paginated `issueMap`, `zoho/issues/` storage path prefix, and the "ambiguous even after name+size" error message all match the spec's Code Context exactly.

### Verification Run
- `npx tsc --noEmit` — PASS (clean, no errors)
- `pnpm lint` — PASS (same 44 pre-existing baseline problems — 8 errors/36 warnings — as tasks 111–113's own documented baseline; confirmed via grep that none touch `issue-attachments/route.ts` or `migrate/page.tsx`)
- Migration not yet applied to the live database and route not yet run against the real 629-file dataset — left for the Testing stage per this skill's own contract (implementation stage does not run live migrations/imports).

---

## Post-Implementation Fix (Live Run, 2026-07-07)

### `proxyClientMaxBodySize` too small for the real dataset

**Symptom:** First live upload attempt failed immediately — `Request body exceeded 50MB for /api/admin/zoho-import/issue-attachments` followed by `TypeError: Failed to parse body as FormData` at `route.ts:32` (`request.formData()`), HTTP 500.

**Root cause:** `next.config.ts`'s `experimental.proxyClientMaxBodySize` was `"50mb"` — set by task 106 for its own dataset (~11MB across 40 Task attachment files). The real Issue Attachments dataset is far larger: **1.29GB across 351 files** (`~/Downloads/zoho-issue-attachments-1/`) and **322MB across 278 files** (`-2/`), with individual files up to **118.9MB** (`Screen Recording 2026-01-20 175721.mp4`). Any selection beyond a handful of files exceeds the old 50MB cap.

**Fix** — `next.config.ts`: bumped `proxyClientMaxBodySize` from `"50mb"` to `"2gb"`, comfortably covering the full 1.29GB batch in one request. Requires a dev server restart (`next.config.ts` changes are not hot-reloaded, same gotcha task 106 already documented).

**Recommendation for the live run**: even with the raised cap, consider uploading in smaller sub-batches (e.g. 50–100 files at a time) rather than selecting all 351/278 at once — a single large multipart request means one network hiccup or timeout loses progress on the whole batch, whereas smaller batches isolate failures and are easier to verify against the done-summary counts as you go.

### Second live run — 329 imported, 22 skipped — surfaced two more real issues

**1. Matching-key bug (route code, not expected ambiguity):** 16 of the 22 skipped were `"no matching Zoho attachment record found (checked name+size)"`, all for files with Chrome-appended `" (1)"`/`" (2)"` dedup suffixes (e.g. `Interstate Order 2026 (1).pdf`). Root cause: the lookup key was built from the **uploaded file's actual on-disk name** (including the suffix), but metadata's `name` field is always the **bare original Zoho name** — so any suffixed file could never match regardless of size. Verified by stripping the suffix and re-checking against metadata: **9 of these 16 are genuinely resolvable** (unique sizes, e.g. `Interstate Order 2026.pdf` has two records at `1596682`/`1655048` bytes — the suffixed upload's real size picks the right one). The other 7 remain correctly ambiguous even after stripping (e.g. `2026 ADCC Catalogue Web.pdf` has 3 records all at identical `5110578` bytes — no metadata field can disambiguate, matches Decision #2's accepted gap).

**Fix**: added `stripDedupSuffix()` to `issue-attachments/route.ts` — strips a trailing `" (\d+)"` before the extension from the uploaded filename before building the `(name, size)` lookup key. Also switched the stored `filename` and the storage path's sanitized-name segment to use this canonical (de-suffixed) name instead of the raw upload name, since the suffix is a local Chrome artifact, not meaningful Zoho data.

**2. Storage bucket file-size limit too small:** 6 of the 22 skipped were `"storage upload failed: The object exceeded the maximum allowed size"` — all files over 50MB (`CasaKalma_brochure_v1*.pdf`, `LX_SE41_Scene.pdf`, `Screen Recording 2026-01-20 175721.mp4`). Root cause: the `project-assets` bucket's `file_size_limit` was `52428800` (50MB), set by task 106's migration 050 for its own Task dataset (which never had a file over 50MB). Issue attachments go up to 118.9MB.

**Fix**: `supabase/migrations/055_project_assets_size_limit.sql` — raises `storage.buckets.file_size_limit` for `project-assets` to `209715200` (200MB), with headroom above the known largest file.

**Next step**: apply migration 055, then re-run the Issue Attachments import over the same file selections — the route's upsert-on-`external_id` is idempotent, so the 329 already-imported rows will just no-op update, while the fix recovers ~9 more previously-skipped files and the 6 oversized files should now upload successfully. The ~7 genuinely-ambiguous files (plus the rest of the ~43-file accepted gap across both batches) will remain skipped by design.

### Third live run — 336 imported, 15 skipped — one more real matching bug found

**`stripDedupSuffix()` was too aggressive — it also mangled legitimate filenames.** Two files failed `"no matching record"` even after the previous fix: `1 (6).jpg` and `NI-Vol47-Cover(FINAL) (1).pdf`. Checked both directly against the real metadata: **both `" (N)"` suffixes are genuine, original Zoho filenames** (confirmed: a metadata record literally named `"1 (6).jpg"` at exactly the uploaded file's real size, `748381` bytes; another literally named `"NI-Vol47-Cover(FINAL) (1).pdf"` at `599012` bytes) — not Chrome dedup artifacts at all. Unconditionally stripping the suffix before every lookup destroyed this legitimate content, so neither could ever match.

**Fix**: changed the match to try the **raw uploaded filename first** (handles literal `" (N)"` content in real Zoho names, which matches immediately since metadata keys off the same raw name), and only fall back to the de-suffixed name if the raw lookup finds nothing (handles genuine Chrome dedup renames). This correctly resolves both new cases without regressing the earlier fix — verified no case in the known duplicate/ambiguous groups relies on stripping when a raw match already exists.

**Confirmed working as designed from this run's results**: `line-card-electrical-linked (2).pdf` no longer appears in errors (it was the one file in that 3-record group with a unique size, `722932` bytes — it imported successfully this time), while `line-card-electrical-linked.pdf` and `(1).pdf` both remain correctly flagged ambiguous (the other two records share an identical size, `1044712`, with no way to disambiguate). This is the accepted-gap behavior working exactly as spec'd.

**Storage size failures persisted (`CasaKalma_brochure_v1*.pdf`, `LX_SE41_Scene.pdf`, `Screen Recording 2026-01-20 175721.mp4`) — all confirmed well under the new 200MB limit (largest is 118.9MB)**, which means migration 055 was written but not yet applied to the live database. Creating a migration file in the repo doesn't apply it — it still needs to be pushed to Supabase.

### Fourth live run — migration 055 applied (`supabase db push` confirmed), storage failures still persisted

Same 6 large files still failed `"The object exceeded the maximum allowed size"` even after migration 055 was confirmed applied. Investigated further: **Supabase has two independent size limits** — the bucket's own `file_size_limit` column (which migration 055 raises, and which we could control via SQL) and a **separate project-level "Global file size limit"** configured in Dashboard → Storage → Settings, which is not part of the Postgres schema and cannot be touched by a migration at all. User confirmed the project is on a **Pro plan**, ruling out a hard Free-tier ceiling — but the Dashboard setting still defaults to a low value and has to be raised manually regardless of plan tier, by whoever owns the project.

**Decision**: user chose to defer this — will raise the Dashboard setting and manually upload these 6 specific files later, rather than blocking the rest of the task on it. Documented as a known, intentionally-deferred gap (see Acceptance Criteria and Compatibility Touchpoints below), not a code defect. Since the route's storage-failure handling still upserts the `attachments` row regardless (matching task 106's original non-fatal design), these 6 rows already exist in the DB right now with an empty/broken `storage_path` — they'll just need their storage object uploaded once the Dashboard limit is raised; no new `attachments` rows need creating.

### Manual resolution of genuinely-ambiguous duplicates (both batches)

The accepted gap from Decision #3 (files where metadata's `name` *and* `size` are both identical across multiple issues, so nothing can disambiguate them programmatically) turned out to be resolvable after all — by asking the user which real-world issue each duplicate actually belonged to, cross-referencing `_from_zoho/issues-*.json` for titles/projects, and writing one-off scripts to insert the resolved rows directly. Three scripts were written for this (not part of the shipped route — pure data-fix tooling, run once and not needed again):

- **`scripts/import-ambiguous-issue-attachments.ts`** — resolved batch 1's 6 ambiguous groups (13 records): `2026 ADCC Catalogue Web.pdf` (3 issues, ANZAC Day Commemorative Committee), `IMG_6297/6530/6741.jpeg` (2 issues each, Welcome Tattoo), `line-card-electrical-linked.pdf` (2 of its 3 records, One Source Associates), `Trimexoutdoor...Drafting.docx` (2 records, actually the *same* issue — not really ambiguous, just two separate Zoho attachment uploads of identical content). Live run: 14 imported, 0 errors.
- **`scripts/fix-line-card-electrical-linked-mixup.ts`** — correction for a real bug the script above introduced: it assumed every record sharing a name also shared identical bytes, which was true for 2 of `line-card-electrical-linked.pdf`'s 3 records but not the 3rd (`722932` bytes vs. the other two's `1044712`) — that 3rd record had *already* been correctly imported by the automated route, and the ambiguous-fix script overwrote its storage object with the wrong file's bytes. This script re-uploaded the correct `722932`-byte file back over that one storage path (no DB row change needed — `attachments.size` was already correct throughout, only the stored bytes were wrong). Live run: confirmed fixed.
- **`scripts/import-batch2-fixes.ts`** — resolved batch 2's own 14 ambiguous groups (29 records, mostly Hickory Hardware/Keeler Brass Company duplicates) plus a special case: **`Obsolete items.xlsx`** couldn't match automatically because its Zoho export metadata claims `size: 42544` but the real downloaded file is `4690` bytes (confirmed valid `.xlsx` via file signature — Zoho's own metadata was simply stale for this one record, same class of issue task 106 already flagged: "don't trust size/extension fields blindly"). Inserted directly using the real on-disk size. This script's grouping logic explicitly checks size *within* each name group before reusing a file's bytes — the safeguard that would have caught the line-card mix-up above had it existed first. Live run: 30 imported, 0 errors.

### Fifth live run — batch 2 automated import: 249 imported, 29 skipped, 1 transient storage error

Batch 2 (278 files) surfaced its own 14 duplicate-name groups (different names than batch 1's — Hickory Hardware and Keeler Brass Company account for most of them) plus the `Obsolete items.xlsx` metadata-size mismatch above — both resolved via `scripts/import-batch2-fixes.ts`. Separately, `Image (7) (1).jpeg` failed with `"storage upload failed: Bad Request"` despite matching correctly (confirmed: valid, uncorrupted JPEG at the exact expected size) — re-selecting and re-uploading just that one file succeeded on retry, confirming it was a one-off transient Supabase Storage error, not a code or data issue.

### Final state

- **Batch 1 (351 files)**: all resolved except the 6 large files still pending the Dashboard-level Storage size limit (user-deferred, see Fourth live run above).
- **Batch 2 (278 files)**: fully resolved, no known remaining gaps.
- **629 total Issue Attachments**, 623 fully correct end-to-end, 6 with DB rows present but storage objects pending a manual re-upload once the user raises the Dashboard setting.

---

## Acceptance Criteria

- [x] `supabase/migrations/054_attachments_issue_entity_type.sql` adds `'issue'` to `attachments_entity_type_check`; existing `'task'`/`'project'`/`'comment'` values remain valid
- [x] `POST /api/admin/zoho-import/issue-attachments` requires admin/super_admin auth — 401/403 matching every other import route
- [x] Route reads all `issue-attachment-meta-*.json` files (or `issue-attachment-meta.json` fallback), 400s with a clear error if none exist
- [x] Uploaded files are matched against metadata by `(name, size)` compound key, not name alone
- [x] 0-match and genuinely-ambiguous (2+ matches even after name+size) files are skipped and surfaced in `errors`, not silently dropped or miscounted as imported
- [x] `external_id` written to the DB is `third_party_file_id`, never `attachment_id` (confirmed `-1` sentinel on 50/629 real records)
- [x] Matched files upload to the existing `project-assets` bucket under `zoho/issues/{_zoho_issue_id}/{externalId}_{filename}`
- [x] Every imported row has `entity_type: "issue"`, `entity_id` resolved via a bulk **paginated** `issueMap` (not per-row `resolveIssueId` calls, not an unbounded `.select()`)
- [x] `migrate/page.tsx` shows an "Issue Attachments" import card with its own file picker, directly after "Attachments" — code complete, not yet browser-verified
- [x] Re-running import with the same files is idempotent (upsert on `external_id`) — confirmed no `external_id` collision with the 40 already-imported Task attachments
- [x] `npx tsc --noEmit` and `pnpm lint` both clean
- [x] Live run against the real 629-file dataset (both `~/Downloads/zoho-issue-attachments-1/` and `-2/`) completes with no unhandled errors; done-summary counts are consistent with the known ~586 resolvable / ~43 ambiguous split — confirmed 2026-07-08: all genuinely-ambiguous duplicates across both batches manually resolved via one-off scripts (see Post-Implementation Fix section); 623 of 629 fully correct end-to-end, 6 large files have DB rows but pending storage upload (user-deferred until the Supabase Dashboard's Storage size limit is raised — see Compatibility Touchpoints)

---

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

1. Confirm task 108 (Issues import) is complete — `issues` table populated.
2. Apply migration 054, confirm `attachments_entity_type_check` now includes `'issue'`.
3. Start dev server: `pnpm dev`. Navigate to `/v2/admin/migrate`.
4. Confirm the "Issue Attachments" card appears in Phase 1 — Import, after "Attachments".
5. Select all 351 files from `~/Downloads/zoho-issue-attachments-1/`, click Import. Confirm progress bar advances, done-summary shows imported/skipped counts.
6. Repeat for the 278 files in `~/Downloads/zoho-issue-attachments-2/`.
7. Spot-check in Supabase: query a few `attachments` rows by `external_id`, confirm `entity_type = 'issue'`, `entity_id` resolves to a real `issues.id`, `storage_path` starts with `zoho/issues/`.
8. Confirm the errors list in the final done-summary lists roughly 43 ambiguous files (spot-check a couple against the known list: `IMG_6530.jpeg`, `IMG_6741.jpeg`, `IMG_6297.jpeg`, `2026 ADCC Catalogue Web.pdf`) and that these are genuinely duplicate-content files, not a matching bug.

---

## Compatibility Touchpoints

- New route + new migration only — no changes to the existing Task attachments export/import routes, no changes to `time_logs`, `issues`, or any other table.
- Purely additive to `migrate/page.tsx` (new interface, new array entry, new state × 2, new handler, new JSX block) — no existing import card's behavior changes.
- The originally-anticipated 43 genuinely-ambiguous files (Decision #3) turned out to be fully resolvable by hand — see the "Manual resolution of genuinely-ambiguous duplicates" section above. No future task needed for that; the one-off scripts already handled it.
- **6 files pending a manual storage re-upload** (see header note) — blocked on the Supabase Dashboard's project-level "Global file size limit" (Dashboard → Storage → Settings), which is separate from the bucket's `file_size_limit` column and cannot be changed via migration. User will raise it and re-upload `CasaKalma_brochure_v1.pdf`/`_type1/2/3.pdf`, `LX_SE41_Scene.pdf`, and `Screen Recording 2026-01-20 175721.mp4` manually — no code or task follow-up needed, purely an external config + manual upload step.
- Three one-off data-fix scripts now live in `scripts/`: `import-ambiguous-issue-attachments.ts`, `fix-line-card-electrical-linked-mixup.ts`, `import-batch2-fixes.ts`. These were run-once tools for this specific live migration, not reusable app code — safe to leave in place as a record of what was done, or delete once the user no longer needs them for reference.
