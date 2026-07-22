# 169: Zoho Task Comment Attachment Metadata Export

**Created:** 2026-07-21
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

Add a **Comment Attachment Metadata export** — a new sibling in the same family as `attachment-meta` (task-level, task 104/105) and `issue-attachment-meta` (issue-level, task 113), but scoped one level deeper: attachments hanging off an individual **task comment** rather than off the task itself.

This closes a real gap. `comments/route.ts` (task comment export) and `zoho-import/comments/route.ts` (task comment import) currently capture **no attachment data at all** for task comments — unlike the Issue Comments pair (109/110), which already stores whatever attachment metadata Zoho embeds inline on the raw comment object into `issue_comments.source_meta.attachments` (`name`/`size`/`type` only — no `download_url`, no stable attachment ID). `task_comments` doesn't even have a `source_meta` column. This task does not touch either import route or add that column — it is the export-only sibling of task 113, following the exact same scope discipline: fetch the **richer** attachment record set from Zoho's dedicated `/attachments` endpoint (which includes `download_url`, `attachment_id`/`third_party_file_id`, `size`) per comment, write it to a local JSON file, and stop. Any import/upload follow-up (populating the `attachments` table's already-reserved `entity_type = 'comment'` value — see `supabase/migrations/049_attachments_index_constraint.sql`) is future, larger-scoped work.

**The central open question, flagged exactly the way task 113 flagged `entity_type: "bug"`:** what `entity_type` value Zoho's `/attachments` endpoint expects for a comment-scoped attachment. `"comment"` is the most reasonable guess — it already matches the value the Hub's own `attachments` table has reserved for this exact purpose since migration 049 — but it is **not** independently verified against Zoho's official API docs for this endpoint. This is a request-side value, not a response-side one, so it can't be confirmed by reading exported JSON the way task 111 confirmed `"bug"` vs `"issue"` — it can only be confirmed by making the call and checking whether known-attached comments return non-empty results. Flagged as Decision #1 below; the small-slice live test in Implementation Step 4 exists specifically to catch a wrong guess before the full run.

---

## Requirements

- [ ] New SSE export route `GET /api/admin/zoho-export/comment-attachment-meta` — reads `_from_zoho/comments.json` (task 89/comments export output), slices by comment-index (`from`/`to` query params), and for each comment calls Zoho's `/attachments` endpoint with `entity_type: "comment"`, `entity_id: {commentId}`.
- [ ] Same admin/super_admin auth guard, `fetchZohoWithRetry` usage, `sleep(700)` pacing, and 404-tolerant/`throttleExhausted`/other-status three-way branch as `attachment-meta`/`issue-attachment-meta`.
- [ ] Every returned attachment item tagged with `_zoho_comment_id`, `_zoho_task_id` (carried forward from the source comment record), and `_zoho_project_id`.
- [ ] New `migrate/page.tsx` UI card ("Comment Attachment Metadata") in Phase 1 — Export, directly after "Issue Attachment Metadata", matching the existing card structure (From/To inputs, progress bar, downloaded-count message, amber failed-comments warning).
- [ ] Live-verified with a small slice before a full run (see Implementation Steps).

## Out of Scope / Must-Not-Change

- **No import route.** Do not build a `comment-attachments` import, do not touch the `attachments` table, do not add `entity_type = 'comment'` writes anywhere — that value is already reserved in the schema (migration 049) but populating it is separate, unscoped follow-up work (mirrors task 113 → 114's split).
- **No changes to `task_comments` schema** (no `source_meta` column addition) — this task writes to a local JSON file only, same as `attachment-meta`/`issue-attachment-meta`.
- **Do not modify the existing `attachment-meta`, `issue-attachment-meta`, `comments`, or `issue-comments` export routes** — strictly additive, matching every other Issue/Task-pair addition in this codebase (107–114 never modified a sibling route).
- **Do not add an `IMPORT_LEVELS` entry.**
- **The sibling task (170, Issue/Bug Comment Attachment Metadata export) is separate scope** — do not build both in one route or share a file beyond the common `fetchZohoWithRetry` helper.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/admin/zoho-export/comment-attachment-meta/route.ts` | Create | New SSE export route — per-comment attachment metadata fetch, `entity_type: "comment"` |
| `src/app/v2/(hub)/admin/migrate/page.tsx` | Modify | Add `CommentAttachmentMetaExportState` interface, `EXPORT_LEVELS` entry, state hook, `handleCommentAttachmentMetaExport()`, `key === "comment-attachment-meta"` JSX block |

---

## Code Context

### Direct model — `src/app/api/admin/zoho-export/attachment-meta/route.ts` (full file, current, unmodified)

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

export async function GET(request: NextRequest) {
  // ...auth guard (admin/super_admin) — keep identical...
  let token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  const dir = path.join(process.cwd(), "_from_zoho");
  const taskFiles = fs.readdirSync(dir).filter((f) => /^tasks(-\d.*)?\.json$/.test(f)).sort();
  // ...loads all tasks, slices by from/to, loops calling entity_type=task...
}
```

**For the Comment version, the source data shape is different — this is per-comment, not per-task/issue, and the source file is a single flat file, not a multi-slice glob.** Model instead on `comments/route.ts`'s file-reading approach (single `comments.json`, no glob) combined with `attachment-meta/route.ts`'s attachment-fetch loop:

### `src/app/api/admin/zoho-export/comments/route.ts` — how `comments.json` is read and what each raw comment record looks like

```ts
// Support both a single tasks.json and multiple slice files (tasks-0-50-2025.json, etc.)
const fromZoho = path.join(process.cwd(), "_from_zoho");
// ... tasks are read to drive the per-task comment fetch ...
// The final accumulated `comments.json` (written client-side in migrate/page.tsx) is a FLAT
// array of raw Zoho comment objects, each already tagged:
//   { ...rawZohoComment, _zoho_task_id: taskId, _zoho_project_id: projectId }
// Raw Zoho comment shape (from zoho-import/comments/route.ts's ZohoCommentRaw type):
//   { id, comment, created_by: { full_name, name, email }, created_time, _zoho_task_id, _zoho_project_id }
```

### New route — `src/app/api/admin/zoho-export/comment-attachment-meta/route.ts` (full shape to implement)

```ts
// dev-only export endpoint — fetches attachment metadata for every task comment via SSE stream.
// Does NOT download files — only exports the list (id, filename, url, size).
// Requires comments.json to be exported first (task 89's comments export).
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken, fetchZohoWithRetry } from "@/lib/zoho";

const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type RawComment = { id?: string; _zoho_task_id?: string; _zoho_project_id?: string; [key: string]: unknown };

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  const filePath = path.join(process.cwd(), "_from_zoho", "comments.json");
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Could not find _from_zoho/comments.json — export comments first" }, { status: 400 });
  }
  const allComments = JSON.parse(fs.readFileSync(filePath, "utf-8")) as RawComment[];

  const params = request.nextUrl.searchParams;
  const fromN = parseInt(params.get("from") ?? "0", 10);
  const toRaw = params.get("to");
  const toN = toRaw ? parseInt(toRaw, 10) : undefined;
  const slice = allComments.slice(fromN, toN ?? undefined);

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      let totalAttachments = 0;
      const failedCommentIds: string[] = [];

      for (let i = 0; i < slice.length; i++) {
        const comment = slice[i];
        const commentId = String(comment.id ?? "");
        const taskId = String(comment._zoho_task_id ?? "");
        const projectId = String(comment._zoho_project_id ?? "");

        if (commentId && projectId) {
          const qp = new URLSearchParams({ entity_type: "comment", entity_id: commentId });
          const url = `${BASE}/projects/${projectId}/attachments?${qp}`;
          const { res, token: newToken, throttleExhausted } = await fetchZohoWithRetry(url, token, { label: "comment-attachment-meta" });
          token = newToken;

          if (res.ok) {
            const json = await res.json() as { attachment?: unknown[] };
            const items = (json.attachment ?? []).map((a) => ({
              ...(a as Record<string, unknown>),
              _zoho_comment_id: commentId,
              _zoho_task_id: taskId,
              _zoho_project_id: projectId,
            }));
            if (items.length > 0) {
              totalAttachments += items.length;
              send({ type: "attachments", items });
            }
          } else if (throttleExhausted) {
            failedCommentIds.push(commentId);
            console.log(`[comment-attachment-meta] Giving up on comment=${commentId} — rolling-throttle retries exhausted`);
          } else if (res.status !== 404) {
            console.log(`[comment-attachment-meta] ${res.status} comment=${commentId}:`, await res.text().catch(() => ""));
          }
        }

        send({ type: "progress", current: i + 1, total: slice.length });
        await sleep(700); // same calibration as attachment-meta / issue-attachment-meta
      }

      send({ type: "done", total_attachments: totalAttachments, failed_comment_ids: failedCommentIds });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
  });
}
```

### `migrate/page.tsx` — current relevant line numbers (model to mirror)

- `IssueAttachmentMetaExportState` interface: `page.tsx:88-94` — add `CommentAttachmentMetaExportState` (same shape: `from`, `to`, `progress: {current,total}|null`, `done: {count, failed}|null`, `error`) directly after it.
- `EXPORT_LEVELS` array (`page.tsx:108-122`) — add directly after the existing `issue-attachment-meta` entry:
  ```ts
  { key: "comment-attachment-meta", label: "Comment Attachment Metadata", desc: "Attachment list per task comment (entity_type: comment) — requires comments.json exported first" },
  ```
- State hook: `page.tsx:235-241` (`issueAttachmentMetaExport` useState, `from: "0", to: "100"`) — add `commentAttachmentMetaExport` directly after it. Pick a conservative starter `to` (e.g. `"200"`) and flag it as a placeholder to confirm against the real downloaded `comments.json` length — no grounded task-comment count exists in this doc (unlike task 113, which had the real 1,049-issue figure from task 107's completed export).
- Handler: `page.tsx:700-769` (`handleAttachmentMetaExport`) — add `handleCommentAttachmentMetaExport()` after `handleIssueAttachmentMetaExport()` closes (`:840`), same SSE-reader structure, POSTing to `/api/admin/zoho-export/comment-attachment-meta`, downloading `comment-attachment-meta-{from}-{to}.json`.
- JSX render block: `page.tsx:1640-1717` (`if (key === "attachment-meta")`) — add `if (key === "comment-attachment-meta")` after the `issue-attachment-meta` block closes (`:1796`), same structure, with the "of 6946 tasks" label (`:1674`) changed to a comment count placeholder (e.g. "comments" with no hardcoded total, since the real count isn't grounded here — or read it from `commentAttachmentMetaExport.progress.total` once known), and "Task {current} of {total}" (`:1698`) changed to "Comment {current} of {total}".

---

## Implementation Steps

1. Create `src/app/api/admin/zoho-export/comment-attachment-meta/route.ts` per Code Context — single-file read of `comments.json` (no multi-file glob, matching how `comments.json` is produced), comment-index `from`/`to` slicing, `entity_type: "comment"`, `_zoho_comment_id`/`_zoho_task_id`/`_zoho_project_id` tagging, `failed_comment_ids` in the `done` event.
2. In `src/app/v2/(hub)/admin/migrate/page.tsx`:
   a. Add `CommentAttachmentMetaExportState` interface after `IssueAttachmentMetaExportState`.
   b. Add the `comment-attachment-meta` entry to `EXPORT_LEVELS` after `issue-attachment-meta`.
   c. Add the `commentAttachmentMetaExport` state hook after `issueAttachmentMetaExport`.
   d. Add `handleCommentAttachmentMetaExport()` after `handleIssueAttachmentMetaExport()` closes.
   e. Add the `if (key === "comment-attachment-meta")` JSX block after the `key === "issue-attachment-meta"` block closes.
3. Run `npx tsc --noEmit` and `pnpm lint`.
4. Live-test with a small slice first (`from=0&to=5`) given `entity_type: "comment"` is a guess, not doc-confirmed — verify at least one comment known to have an attachment (spot-check via the Zoho web UI) returns a non-empty `attachment` array before running the full export. If the small slice returns 0 across the board, do not conclude "no comments have attachments" — manually verify at least one known-attached comment first.

---

## Acceptance Criteria

- [ ] `GET /api/admin/zoho-export/comment-attachment-meta` requires admin/super_admin auth — 401/403 matching every other export route
- [ ] Route reads `_from_zoho/comments.json`, returns 400 with a clear error if it doesn't exist
- [ ] `from`/`to` query params slice the comment list
- [ ] For each comment in the slice, calls `/projects/{projectId}/attachments` with `entity_type: "comment"`, `entity_id: {commentId}`
- [ ] Every returned attachment item is tagged with `_zoho_comment_id`, `_zoho_task_id`, and `_zoho_project_id`
- [ ] 404 responses treated as "no attachments for this comment" (not logged as an error); `throttleExhausted` failures pushed to `failed_comment_ids`; other non-2xx statuses logged but non-fatal
- [ ] Uses `fetchZohoWithRetry` with the same `sleep(700)` pacing as `attachment-meta`/`issue-attachment-meta`
- [ ] SSE stream emits `progress` (current/total), `attachments` (batch), and a final `done` (total_attachments, failed_comment_ids) event
- [ ] `migrate/page.tsx` shows a "Comment Attachment Metadata" card in Phase 1 — Export, directly after "Issue Attachment Metadata", with From/To inputs, progress bar, downloaded-count message, amber failed-comments warning when non-empty
- [ ] Clicking Export downloads `comment-attachment-meta-{from}-{to}.json` containing the accumulated array
- [ ] Small-slice (`from=0&to=5`) live run confirms `entity_type: "comment"` actually returns attachment data before a full run
- [ ] `npx tsc --noEmit` and `pnpm lint` both clean

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

1. Ensure `_from_zoho/comments.json` exists (task 89's comments export).
2. Start dev server: `pnpm dev`.
3. Navigate to `/v2/admin/migrate`. Confirm the "Comment Attachment Metadata" card appears in Phase 1 — Export, after "Issue Attachment Metadata".
4. Run `from=0&to=5` first — inspect the downloaded file; confirm at least one comment returns attachment metadata if known to have one, and confirm `_zoho_comment_id`/`_zoho_task_id`/`_zoho_project_id` tagging is present.
5. If the small slice returns 0 attachments, manually verify via the Zoho web UI whether any of those 5 comments actually have attachments before concluding `entity_type: "comment"` is correct.
6. Run the full export in slices. Confirm the run completes cleanly, inspect `failed_comment_ids`.

## Implementation Notes

### What Changed
- Added a new SSE export route `GET /api/admin/zoho-export/comment-attachment-meta` that reads `_from_zoho/comments.json` (single flat file, no glob), slices by `from`/`to` comment-index, and for each comment in the slice calls Zoho's `/attachments` endpoint with `entity_type: "comment"`, `entity_id: {commentId}`, tagging every returned item with `_zoho_comment_id`, `_zoho_task_id`, `_zoho_project_id`. Mirrors `attachment-meta`/`issue-attachment-meta`'s auth guard, `fetchZohoWithRetry` usage, `sleep(700)` pacing, and 404-tolerant/`throttleExhausted`/other-status three-way branch.
- Added a "Comment Attachment Metadata" export card to `migrate/page.tsx` Phase 1 — Export, directly after "Issue Attachment Metadata": new `CommentAttachmentMetaExportState` interface, `EXPORT_LEVELS` entry, `commentAttachmentMetaExport` state hook (`to: "200"` placeholder starter, flagged inline as unconfirmed), `handleCommentAttachmentMetaExport()` handler, and the `key === "comment-attachment-meta"` JSX block (From/To inputs, progress bar with "Comment {current} of {total}", downloaded-count message, amber failed-comments warning).

### Files Changed
- `src/app/api/admin/zoho-export/comment-attachment-meta/route.ts` - Created; new export route per task spec.
- `src/app/v2/(hub)/admin/migrate/page.tsx` - Modified; added state interface, EXPORT_LEVELS entry, state hook, handler, and JSX card, all placed directly after their `issue-attachment-meta` counterparts.

### Deviations From Plan
- **Decision #1 resolved: `entity_type: "task_comment"`, not `"comment"`.** Inspecting the local `_from_zoho/comments.json` (17 comments across 11 tasks) showed 5 comments already carry an inline `attachments` array on the raw Zoho comment object — richer than expected (`download_url`, `attachment_id`, `third_party_file_id`, `size`, `type`, `name` — not just name/size/type like issue comments). Every embedded attachment object has `entity_type: "task_comment"`, which is Zoho's own vocabulary straight from its data, not a guess. Updated the Zoho API query param in `route.ts` from `"comment"` to `"task_comment"` before any live call was made, per user decision (skip the live-test-to-discover-it step since the evidence was already sitting in exported data).
- This does **not** touch the Hub's own `attachments` table `entity_type` CHECK constraint (migration 049: `'task', 'project', 'comment'`) — that's a separate, unrelated value space (the Hub's internal schema convention for a future import feature), not Zoho's API request parameter. No schema change; `'comment'` remains the correct value for that future column, should it ever be populated.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Small-slice live run (`from=0&to=5` against real Zoho data + manual Zoho web UI cross-check of `entity_type: "task_comment"`) - SKIPPED (requires a running dev server with an authenticated admin session and live Zoho OAuth token, plus manual comparison against the Zoho web UI for a known-attached comment — genuinely a human-in-the-loop step per the task doc's own Verification section, not something to run unattended against a live third-party API). Confidence is higher than a cold guess since `entity_type: "task_comment"` is now corroborated by Zoho's own embedded attachment records rather than assumed, but the live call itself is still unverified. Flagged for the `test` stage / manual QA before the full-range export is run.

## Compatibility Touchpoints

- New route only — no changes to `attachment-meta`, `issue-attachment-meta`, `comments`, or `issue-comments` export/import routes, no schema changes, no `IMPORT_LEVELS` changes.
- Purely additive to `migrate/page.tsx`.
- **A future Comment Attachments import/upload follow-up** would need: (1) the same manual-match uploader design as tasks 106/114 (Zoho attachment download is blocked — confirmed live in task 106), since `entity_type = 'comment'` is already allowed by the `attachments` table's CHECK constraint (migration 049) so no schema change is needed there; (2) a decision on whether `entity_id` should resolve to `task_comments.id` via `external_id` lookup (comment's Zoho ID is already stored as `task_comments.external_id`, migration 035) — likely a straightforward paginated lookup map, same pattern as `resolveTaskId`/`resolveIssueId`.
