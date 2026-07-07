# Task 113 — Zoho Issue Attachment Metadata Export: Per-Issue SSE Streaming (`entity_type: "bug"`)

> **Priority:** HIGH
> **Type:** feature
> **Version Impact:** minor
> **Recommended Model:** sonnet
> **Date:** 2026-07-07
> **Status:** COMPLETED
> **Completed:** 2026-07-07
> **Live run (2026-07-07):** Two slice runs — `from=0&to=500` and `from=500&to=1049` — against the real portal, downloaded as `_from_zoho/issue-attachment-meta-0-500.json` (351 attachments, 179 issues) and `issue-attachment-meta-500-1049.json` (278 attachments, 129 issues). **629 total attachment records across 308 of the 1,049 issues** (~29%) that have at least one attachment; the rest have none, which is expected (not every issue has an attachment). Verified directly against both files: `entity_type: "bug"` is confirmed correct — every raw record's own `entity_type` field returned by Zoho reads `"bug"`, proving the request param actually matched real data rather than silently returning zero results (the exact risk flagged in this doc's Decision #1). Zero overlap in `_zoho_issue_id` between the two slices (full non-overlapping coverage), 100% of records tagged with `_zoho_issue_id`/`_zoho_project_id` (0 missing), 0 missing `download_url`. Also found the same known Zoho quirk already documented from task 106 (Attachments Bulk Upload): 50/629 records carry a sentinel `attachment_id: "-1"` rather than a real ID — confirmed all 50 have a distinct, present `third_party_file_id`, so all 629 records resolve to a unique identifier once that established fallback (`third_party_file_id` when `attachment_id === "-1"`) is applied, same as task 106 already had to handle for Task attachments. Worth keeping in mind for whichever future task builds the Issue Attachments import/upload follow-up.
> **Investigation:** No formal `/understand` run. Grounded via direct analysis in-session: read the current shipped `src/app/api/admin/zoho-export/attachment-meta/route.ts` (the Task version, full file) as the direct model for this task, read the `attachments` table's actual schema (`supabase/migrations/025_v2_schema.sql:70`, `049_attachments_index_constraint.sql`) confirming it uses a polymorphic `entity_type`/`entity_id` pair with a CHECK constraint currently restricted to `('task', 'project', 'comment')`, and confirmed the real issue record shape from `_from_zoho/issues-*.json` (task 107's export — `id`, `id_string` (always empty in this dataset), `_zoho_project_id`, `project: {id, name}`) matches the same shape task 111 already used to resolve issue IDs for the Issue Time Logs export.

---

## Overview

Add an **Issue Attachment Metadata export** — the Issue-scoped sibling of the existing Task attachment-meta export (`zoho-export/attachment-meta/route.ts`), following the same additive pattern already established for Issues (107), Issue Comments (109), and Issue Time Logs (111): a new route, a new `EXPORT_LEVELS` entry, new state/handler/JSX in `migrate/page.tsx` — the existing Task attachment-meta export is untouched.

**The one functional delta, per explicit user instruction: call Zoho's `/attachments` endpoint with `entity_type: "bug"` instead of `"task"`.** This is the same Zoho quirk already observed twice in this codebase — Zoho's Issues/Bugs module is internally labeled `"bug"` in API responses (`module_detail.type` on both the Issues export and the Issue Time Logs export reads `"bug"`, confirmed live in tasks 107 and 111) even though the request-side `module.type` for the Time Logs endpoint accepts the friendlier `"issue"` value. This task takes the user's direction that the **Attachments** endpoint specifically expects `"bug"` on the request side too (unlike Time Logs, which accepted `"issue"` on request). This has **not** been independently re-confirmed against an official Zoho API doc screenshot the way task 111's `module.type` values were — flagged as a decision below, not silently assumed correct.

**Scope is export-only** (attachment metadata list — id, filename, url, size — not the files themselves), matching the Task version exactly. An Issue Attachments *import*/upload follow-up is out of scope here; see Compatibility Touchpoints for why it's likely a bigger lift than task 112 was.

---

## Decisions (resolved before spec — recommended defaults, flag before/during `/implement` if any should differ)

1. **`entity_type: "bug"`** — per explicit user instruction. Not independently verified against an official Zoho API doc for the Attachments endpoint specifically (task 111's `"issue"`/`"bug"` confirmation was for the *Time Logs* endpoint's response shape, not the Attachments endpoint's request shape). Recommended handling if wrong: the existing Task version's 404-tolerant design (a 404 response is treated as "no attachments module for this entity," not an error) already provides a safe failure mode — if `"bug"` is the wrong value, Zoho will most likely return 404s or empty results per issue rather than a hard failure, so a bad value fails safe rather than corrupting data. Confirm with a small slice (`from=0&to=5`) before running the full 1,049-issue export, same guidance the Time Logs export doc gave.
2. **Slice over issues (`from`/`to`), not a flat count** — identical to the Task version's task-index slicing. Total is 1,049 issues (task 107's export), not the 969 that specifically have logged time — attachments and time logs are independent facts about an issue, no correlation assumed.
3. **Entity ID resolution**: `String(issue.id_string ?? issue.id)` — same defensive fallback pattern task 111 used for Issue Time Logs. Confirmed (task 111) that `id_string` is empty on 0/1049 real issue records, so this always resolves via the `id` branch today — dead-code fallback kept only for parity with the established pattern, not because it's currently exercised.
4. **Tag fields**: `_zoho_issue_id` + `_zoho_project_id` on every returned attachment item — mirrors the Task version's `_zoho_task_id` + `_zoho_project_id` tagging exactly.
5. **File naming**: `issue-attachment-meta-{from}-{to}.json` — mirrors `attachment-meta-{from}-{to}.json` and the established `issue-*` prefix convention from tasks 109/111.
6. **Reuse identical throttle pacing**: `fetchZohoWithRetry(url, token, { label: "issue-attachment-meta" })` + `sleep(700)` per issue, matching the Task version's already-proven calibration (comment: "stay under Zoho's 200 req/2 min rolling limit"). Do not re-derive or re-tune — task 109's own history is the cautionary tale for guessing pacing instead of copying a proven value.
7. **404 handling stays silent, non-404 errors stay logged but non-fatal** — identical to the Task version's design: a 404 (no attachments module for this issue) is expected and not logged; a `throttleExhausted` retry failure is pushed to `failed_issue_ids` (renamed from `failed_task_ids`); any other unexpected status is logged via `console.log` but does not stop the run.

---

## File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/admin/zoho-export/issue-attachment-meta/route.ts` | Create | New SSE export route — per-issue attachment metadata fetch, `entity_type: "bug"` |
| `src/app/v2/(hub)/admin/migrate/page.tsx` | Modify | Add `IssueAttachmentMetaExportState` interface, `EXPORT_LEVELS` entry, state hook, `handleIssueAttachmentMetaExport()`, `key === "issue-attachment-meta"` JSX block |

---

## Code Context

### Current Task version (full file, direct model) — `src/app/api/admin/zoho-export/attachment-meta/route.ts`

```ts
// dev-only export endpoint — fetches attachment metadata for every task via SSE stream.
// Does NOT download files — only exports the list (id, filename, url, size).
// Requires tasks.json (or tasks-*.json slice files) to be exported first.
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken, fetchZohoWithRetry } from "@/lib/zoho";

const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type RawTask = { id?: string; id_string?: string; _zoho_project_id?: string; [key: string]: unknown };

export async function GET(request: NextRequest) {
  // ...auth guard (admin/super_admin) — keep identical...

  let token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  const dir = path.join(process.cwd(), "_from_zoho");
  const taskFiles = fs.readdirSync(dir).filter((f) => /^tasks(-\d.*)?\.json$/.test(f)).sort();
  if (taskFiles.length === 0) {
    return NextResponse.json({ error: "No tasks files found in _from_zoho/ — export tasks first" }, { status: 400 });
  }

  const allTasks: RawTask[] = [];
  for (const file of taskFiles) {
    const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf-8"));
    if (Array.isArray(parsed)) allTasks.push(...(parsed as RawTask[]));
  }

  const params = request.nextUrl.searchParams;
  const fromN = parseInt(params.get("from") ?? "0", 10);
  const toRaw = params.get("to");
  const toN = toRaw ? parseInt(toRaw, 10) : undefined;
  const slice = allTasks.slice(fromN, toN ?? undefined);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let totalAttachments = 0;
      const failedTaskIds: string[] = [];

      for (let i = 0; i < slice.length; i++) {
        const task = slice[i];
        const taskId = String(task.id_string ?? task.id ?? "");
        const projectId = String(task._zoho_project_id ?? "");

        if (taskId && projectId) {
          const qp = new URLSearchParams({ entity_type: "task", entity_id: taskId });
          const url = `${BASE}/projects/${projectId}/attachments?${qp}`;
          const { res, token: newToken, throttleExhausted } = await fetchZohoWithRetry(url, token, { label: "attachment-meta" });
          token = newToken;

          if (res.ok) {
            const json = await res.json() as { attachment?: unknown[] };
            const items = (json.attachment ?? []).map((a) => ({
              ...(a as Record<string, unknown>),
              _zoho_task_id: taskId,
              _zoho_project_id: projectId,
            }));
            if (items.length > 0) {
              totalAttachments += items.length;
              send({ type: "attachments", items });
            }
          } else if (throttleExhausted) {
            failedTaskIds.push(taskId);
          } else if (res.status !== 404) {
            console.log(`[attachment-meta] ${res.status} task=${taskId}:`, await res.text().catch(() => ""));
          }
        }

        send({ type: "progress", current: i + 1, total: slice.length });
        await sleep(700);
      }

      send({ type: "done", total_attachments: totalAttachments, failed_task_ids: failedTaskIds });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
}
```

For the Issue version: rename `RawTask`→`RawIssue`, `taskId`→`issueId`, `_zoho_task_id`→`_zoho_issue_id`, `failed_task_ids`→`failed_issue_ids`, `"task"`→`"bug"` (the one functional delta), file glob `tasks(-\d.*)?\.json`→`issues(-\d.*)?\.json` (fallback `issues.json`), label `"attachment-meta"`→`"issue-attachment-meta"`. Everything else — the `sleep(700)` pacing, `fetchZohoWithRetry` usage, 404-tolerant/`throttleExhausted`-tracked/other-status-logged three-way branch, SSE event shape — copied verbatim.

### `attachments` table's current `entity_type` CHECK constraint (relevant only for a future import follow-up, not this export task)

```sql
-- supabase/migrations/049_attachments_index_constraint.sql
alter table attachments
  add constraint attachments_entity_type_check
  check (entity_type in ('task', 'project', 'comment'));
```

No changes needed for this task (export-only, writes to a local JSON file, not the DB) — noted here only because an eventual Issue Attachments import would need `'issue'` added to this constraint, same class of schema note task 111 flagged for its own future import follow-up.

### `migrate/page.tsx` — current relevant line numbers for the Task attachment-meta export (model to mirror)

- `AttachmentMetaExportState` interface: `page.tsx:80-86` — add `IssueAttachmentMetaExportState` (same shape) directly after it.
- `EXPORT_LEVELS` array — add directly after the existing `attachment-meta` entry:
  ```ts
  { key: "issue-attachment-meta", label: "Issue Attachment Metadata", desc: "Attachment list per issue (entity_type: bug) — requires issues-*.json exported first" },
  ```
- State hook: `page.tsx:209-215` (`attachmentMetaExport` useState, defaults `{ from: "0", to: "1000", ... }`) — add `issueAttachmentMetaExport` directly after it. Default `to` should reflect the issue count, not the task count — use `"1049"` (or leave blank/`"all"` placeholder, matching whichever default convention the Task version's `to: "1000"` represents — confirm against the live 6,946-task count comment at `:1507` before picking a literal).
- Handler: `page.tsx:668-733` (`handleAttachmentMetaExport`) — add `handleIssueAttachmentMetaExport()` directly after it closes, same SSE-reader structure, POSTing to `/api/admin/zoho-export/issue-attachment-meta`, downloading `issue-attachment-meta-{from}-{to}.json`.
- JSX render block: `page.tsx:1473-1550` (`if (key === "attachment-meta")`) — add `if (key === "issue-attachment-meta")` directly after it closes, same structure, with the "of 6946 tasks" label (`:1507`) changed to "of 1049 issues", and the "Task {current} of {total}" progress label (`:1531`) changed to "Issue {current} of {total}".

---

## Implementation Steps

1. Create `src/app/api/admin/zoho-export/issue-attachment-meta/route.ts` per Code Context — multi-file scan (`issues-*.json` → `issues.json` fallback, matching task 111's issue-file glob), `entity_type: "bug"`, `_zoho_issue_id` tagging, `failed_issue_ids` in the `done` event.
2. In `src/app/v2/(hub)/admin/migrate/page.tsx`:
   a. Add `IssueAttachmentMetaExportState` interface after `AttachmentMetaExportState`.
   b. Add the `issue-attachment-meta` entry to `EXPORT_LEVELS` after `attachment-meta`.
   c. Add the `issueAttachmentMetaExport` state hook after `attachmentMetaExport`.
   d. Add `handleIssueAttachmentMetaExport()` after `handleAttachmentMetaExport()` closes.
   e. Add the `if (key === "issue-attachment-meta")` JSX block after the `key === "attachment-meta"` block closes.
3. Run `npx tsc --noEmit` and `pnpm lint`.
4. Live-test with a small slice first (`from=0&to=5`) given `entity_type: "bug"` is user-asserted, not doc-confirmed — verify at least one issue in the slice returns a non-empty `attachment` array before running the full 1,049-issue export.

---

## Notes for Implementation Agent

- **This is export-only** — do not build an import route, do not touch the `attachments` table or its `entity_type` CHECK constraint. That's future, larger-scoped work (see Compatibility Touchpoints).
- **`entity_type: "bug"` is the one functional delta and is user-directed, not independently verified against Zoho's official docs for this specific endpoint** — if the small-slice live test in Implementation Step 4 comes back with 0 attachments across issues known (from other systems/manual checks) to have attachments, stop and flag before running the full export; do not assume a zero count means "issues just don't have attachments" without at least one manual spot-check.
- **Reuse `fetchZohoWithRetry` and the exact `sleep(700)` pacing verbatim** — same rationale as every other Issue-scoped export in this codebase (109, 111): proven pacing, not re-tuned.
- **Do not rename or modify anything in the existing Task attachment-meta export** — this is strictly additive, matching the pattern already established across every other Issue/Task export pair in this codebase.
- **`EXPORT_LEVELS` only** — no `IMPORT_LEVELS` changes, matching task 111's own export-only scope note.

---

## Implementation Notes

### What Changed
- Created `src/app/api/admin/zoho-export/issue-attachment-meta/route.ts` — new SSE export route, issue-scoped sibling of `zoho-export/attachment-meta/route.ts`.
- Added all 5 planned pieces to `src/app/v2/(hub)/admin/migrate/page.tsx`: `IssueAttachmentMetaExportState` interface (after `AttachmentMetaExportState`), `issue-attachment-meta` entry in `EXPORT_LEVELS` (after `attachment-meta`), `issueAttachmentMetaExport` state hook (after `attachmentMetaExport`), `handleIssueAttachmentMetaExport()` (after `handleAttachmentMetaExport()` closes), and the `key === "issue-attachment-meta"` JSX block (after the `attachment-meta` block, before the generic fallback card).

### Files Changed
- `src/app/api/admin/zoho-export/issue-attachment-meta/route.ts` — new route; multi-file scan of `issues-*.json`/`issues.json`, `entity_type: "bug"`, `_zoho_issue_id`/`_zoho_project_id` tagging, `failed_issue_ids` in the `done` event, identical `fetchZohoWithRetry` + `sleep(700)` pacing to the Task version.
- `src/app/v2/(hub)/admin/migrate/page.tsx` — the 5 additive pieces listed above.

### Deviations From Plan
- **Default `to` value for the new `issueAttachmentMetaExport` state**: the spec flagged this as needing a decision ("confirm against the live 6,946-task count comment... before picking a literal") rather than prescribing an exact value. Set `to: "100"` (vs. the Task version's `to: "1000"` out of 6,946 — roughly the same ~10-15% first-slice proportion, scaled down for the 1,049-issue total). Flagging here since it wasn't a literal copy from the spec.
- No other deviations — `entity_type: "bug"`, the 404-tolerant/`throttleExhausted`/other-status three-way branch, `_zoho_issue_id` tagging, file naming (`issue-attachment-meta-{from}-{to}.json`), and the "of 1049 issues" / "Issue {current} of {total}" label text all match the spec exactly.

### Verification Run
- `npx tsc --noEmit` — PASS (clean, no errors)
- `pnpm lint` — PASS (same 44 pre-existing baseline problems — 8 errors/36 warnings — as tasks 111/112's own documented baseline; confirmed via grep that none touch `issue-attachment-meta/route.ts` or `migrate/page.tsx`)
- Live run (small-slice `from=0&to=5` test, and the full portal run) not yet performed — per this skill's own contract, the implementation stage does not run live Zoho exports. Both remain open per Acceptance Criteria below, most importantly confirming `entity_type: "bug"` actually returns attachment data before the full run.

---

## Acceptance Criteria

- [x] `GET /api/admin/zoho-export/issue-attachment-meta` requires admin/super_admin auth — 401/403 matching every other export route
- [x] Route reads all `issues-*.json` files in `_from_zoho/` (or `issues.json` fallback), returns 400 with a clear error if none exist
- [x] `from`/`to` query params slice the issue list, matching the existing Task attachment-meta / Issues export convention
- [x] For each issue in the slice, calls `/projects/{projectId}/attachments` with `entity_type: "bug"`, `entity_id: {issueId}`
- [x] Every returned attachment item is tagged with `_zoho_issue_id` and `_zoho_project_id`
- [x] 404 responses are treated as "no attachments for this issue" (not logged as an error); `throttleExhausted` failures are pushed to `failed_issue_ids`; other non-2xx statuses are logged but non-fatal
- [x] Uses `fetchZohoWithRetry` with the same `sleep(700)` pacing as the Task version
- [x] SSE stream emits `progress` (current/total), `attachments` (batch), and a final `done` (total_attachments, failed_issue_ids) event
- [x] `migrate/page.tsx` shows an "Issue Attachment Metadata" card in Phase 1 — Export, directly after "Attachment Metadata", with From/To issue-slice inputs, a progress bar, a downloaded-count message, and an amber failed-issues warning when non-empty — code complete, not yet browser-verified
- [x] Clicking Export downloads `issue-attachment-meta-{from}-{to}.json` containing the accumulated array — code complete, not yet browser-verified
- [x] Small-slice (`from=0&to=5`) live run confirms `entity_type: "bug"` actually returns attachment data (not silently 0 across the board) before the full 1,049-issue run — superseded by the full-scale run itself (2026-07-07), which directly confirmed non-zero, correctly-tagged `entity_type: "bug"` data across both slices
- [x] Full live run against the real portal completes with no unhandled errors — confirmed 2026-07-07: 629 attachments across 308 issues, 0 errors, two slices covering all 1,049 issues with zero overlap
- [x] `npx tsc --noEmit` and `pnpm lint` both clean

---

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

1. Ensure `_from_zoho/issues-*.json` exists (from task 107's export).
2. Start dev server: `pnpm dev`.
3. Navigate to `/v2/admin/migrate`. Confirm the "Issue Attachment Metadata" card appears in Phase 1 — Export, after "Attachment Metadata".
4. Run `from=0&to=5` first — inspect the downloaded file; confirm at least one issue returns attachment metadata (id, filename, url, size) if that issue is known to have attachments, and confirm `_zoho_issue_id`/`_zoho_project_id` tagging is present.
5. If the small slice returns 0 attachments across all 5 issues, manually verify via the Zoho web UI whether any of those 5 issues actually have attachments before concluding `entity_type: "bug"` is correct — do not proceed to the full run on a false negative.
6. Run the full export (`from=0`, no `to`, or `to=1049`). Confirm the run completes cleanly, inspect `failed_issue_ids` in the done state.

---

## Compatibility Touchpoints

- New route only — no changes to the existing Task attachment-meta export/import routes, no schema changes, no changes to `IMPORT_LEVELS`.
- Purely additive to `migrate/page.tsx` (new interface, new array entry, new state, new handler, new JSX block) — no existing card's behavior changes.
- **A future Issue Attachments import/upload follow-up is a larger lift than task 112 was**, for two reasons worth flagging now: (1) task 106 already established that Zoho's attachment *download* is blocked (OAuth-scope/CORS/IAM-ticket issues, confirmed via live diagnostics) — the existing Task attachments import is a manual-match uploader, not an automatic fetch-and-store, and any Issue version would need the same manual-match design; (2) the `attachments` table's `entity_type` CHECK constraint (migration 049) only allows `('task', 'project', 'comment')` today — adding Issue attachment support would need `'issue'` added to that constraint, plus a decision on whether `entity_id` should reference `issues.id` directly or need a new resolution helper (no `resolveIssueId`-equivalent currently exists for attachment linkage specifically, though `resolveIssueId` in `zoho-import.ts` could likely be reused as-is).
