# 170: Zoho Issue (Bug) Comment Attachment Metadata Export

**Created:** 2026-07-21
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

Add an **Issue Comment Attachment Metadata export** — the Issue-scoped sibling of task 169's Comment Attachment Metadata export, following the same additive Issue/Task-pair pattern already established for Attachment Metadata (104/113), Comments (89/109), Attachments (106/114), and Time Logs. A new route, a new `EXPORT_LEVELS` entry, new state/handler/JSX in `migrate/page.tsx` — task 169's Comment Attachment Metadata export is untouched.

`issue_comments.source_meta.attachments` (populated by `zoho-import/issue-comments/route.ts`) already stores whatever attachment metadata Zoho embeds inline on the raw comment object (`name`/`size`/`type` — see migration 052's design note). That inline data is incomplete for any future import/upload use: no `download_url`, no stable `attachment_id`/`third_party_file_id`. This task fetches the fuller record set from Zoho's dedicated `/attachments` endpoint per issue comment, the same way task 113 did for issue-level attachments — export-only, writes to a local JSON file, no DB writes.

**Functional deltas vs. task 169 (Task Comment version), both per the same convention already established across every Issue/Task export pair in this codebase:**
1. Source file is `issue-comments.json` (task 109's export) instead of `comments.json`.
2. Tag field is `_zoho_issue_id` (carried forward from the source comment record) instead of `_zoho_task_id`.

**The `entity_type` value is the same open question flagged in task 169 — `"comment"` is the guess, unverified against Zoho's official docs for this endpoint.** Unlike the `"task"`→`"bug"` swap task 113 made (a *different* value for issues vs. tasks), there is no a priori reason to expect the comment-attachment `entity_type` value itself to differ between a task comment and an issue comment — Zoho's Comments module is a single concept; only the *parent* (task vs. issue) differs, and that's encoded in `entity_id`/`entity_type`'s pairing with the request URL's project scope, not in `entity_type` itself. This task carries the same `"comment"` value as task 169, not a `"bug"`-flavored variant — flagged as Decision #1 below, verify independently for this endpoint (issue comments may behave differently even if the request shape looks identical) via the same small-slice live test.

---

## Requirements

- [ ] New SSE export route `GET /api/admin/zoho-export/issue-comment-attachment-meta` — reads `_from_zoho/issue-comments.json`, slices by comment-index (`from`/`to` query params), and for each comment calls Zoho's `/attachments` endpoint with `entity_type: "comment"`, `entity_id: {commentId}`.
- [ ] Same admin/super_admin auth guard, `fetchZohoWithRetry` usage, `sleep(700)` pacing, and 404-tolerant/`throttleExhausted`/other-status three-way branch as task 169 and `issue-attachment-meta`.
- [ ] Every returned attachment item tagged with `_zoho_comment_id`, `_zoho_issue_id` (carried forward from the source comment record), and `_zoho_project_id`.
- [ ] New `migrate/page.tsx` UI card ("Issue Comment Attachment Metadata") in Phase 1 — Export, directly after "Comment Attachment Metadata" (task 169), matching the existing card structure.
- [ ] Live-verified with a small slice before a full run.

## Out of Scope / Must-Not-Change

- **No import route.** Do not build an `issue-comment-attachments` import, do not touch the `attachments` table or its `entity_type` CHECK constraint (`'comment'` is already allowed since migration 049) — populating it is separate, unscoped follow-up work.
- **No changes to `issue_comments` schema** — this task writes to a local JSON file only.
- **Do not modify `attachment-meta`, `issue-attachment-meta`, `comment-attachment-meta` (task 169), `comments`, or `issue-comments`** — strictly additive.
- **Do not add an `IMPORT_LEVELS` entry.**
- **Depends on task 169 only for the shared `fetchZohoWithRetry` helper and UI ordering (card placed after it)** — otherwise fully independent; can be implemented in either order, but the UI card position in Requirements assumes 169 lands first.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/admin/zoho-export/issue-comment-attachment-meta/route.ts` | Create | New SSE export route — per-issue-comment attachment metadata fetch, `entity_type: "comment"` |
| `src/app/v2/(hub)/admin/migrate/page.tsx` | Modify | Add `IssueCommentAttachmentMetaExportState` interface, `EXPORT_LEVELS` entry, state hook, `handleIssueCommentAttachmentMetaExport()`, `key === "issue-comment-attachment-meta"` JSX block |

---

## Code Context

### Direct model — task 169's `comment-attachment-meta/route.ts` (see `_docs/task/169-zoho-comment-attachment-meta-export.md` for the full file)

Rename `RawComment`'s `_zoho_task_id` field → `_zoho_issue_id`, source file `comments.json` → `issue-comments.json`, label `"comment-attachment-meta"` → `"issue-comment-attachment-meta"`, `failed_comment_ids` stays the same field name (comment-level failure, not issue-level). Everything else — `entity_type: "comment"`, the `sleep(700)` pacing, `fetchZohoWithRetry` usage, 404-tolerant/`throttleExhausted`/other-status three-way branch, SSE event shape — copied verbatim.

### `src/app/api/admin/zoho-export/issue-comments/route.ts` — how `issue-comments.json` is read and what each raw comment record looks like

```ts
// The final accumulated `issue-comments.json` (written client-side in migrate/page.tsx) is a
// FLAT array of raw Zoho comment objects, each already tagged:
//   { ...rawZohoComment, _zoho_issue_id: issueId, _zoho_project_id: projectId }
// Raw Zoho issue comment shape (from zoho-import/issue-comments/route.ts's ZohoIssueCommentRaw type):
//   { id, comment, added_by: { full_name, name, email }, added_via, created_time,
//     last_modified_time, attachments: [{name, size, type, ...}], _zoho_issue_id, _zoho_project_id }
```

### New route — `src/app/api/admin/zoho-export/issue-comment-attachment-meta/route.ts` (full shape to implement)

```ts
// dev-only export endpoint — fetches attachment metadata for every issue comment via SSE stream.
// Does NOT download files — only exports the list (id, filename, url, size).
// Requires issue-comments.json to be exported first (task 109's issue comments export).
import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { getZohoAccessToken, fetchZohoWithRetry } from "@/lib/zoho";

const BASE = `https://projectsapi.zoho.com/api/v3/portal/${process.env.ZOHO_PORTAL_ID}`;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type RawIssueComment = { id?: string; _zoho_issue_id?: string; _zoho_project_id?: string; [key: string]: unknown };

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await adminClient.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin" && profile?.role !== "super_admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let token = await getZohoAccessToken();
  if (!token) return NextResponse.json({ error: "No Zoho token" }, { status: 502 });

  const filePath = path.join(process.cwd(), "_from_zoho", "issue-comments.json");
  if (!fs.existsSync(filePath)) {
    return NextResponse.json({ error: "Could not find _from_zoho/issue-comments.json — export issue comments first" }, { status: 400 });
  }
  const allComments = JSON.parse(fs.readFileSync(filePath, "utf-8")) as RawIssueComment[];

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
        const issueId = String(comment._zoho_issue_id ?? "");
        const projectId = String(comment._zoho_project_id ?? "");

        if (commentId && projectId) {
          const qp = new URLSearchParams({ entity_type: "comment", entity_id: commentId });
          const url = `${BASE}/projects/${projectId}/attachments?${qp}`;
          const { res, token: newToken, throttleExhausted } = await fetchZohoWithRetry(url, token, { label: "issue-comment-attachment-meta" });
          token = newToken;

          if (res.ok) {
            const json = await res.json() as { attachment?: unknown[] };
            const items = (json.attachment ?? []).map((a) => ({
              ...(a as Record<string, unknown>),
              _zoho_comment_id: commentId,
              _zoho_issue_id: issueId,
              _zoho_project_id: projectId,
            }));
            if (items.length > 0) {
              totalAttachments += items.length;
              send({ type: "attachments", items });
            }
          } else if (throttleExhausted) {
            failedCommentIds.push(commentId);
            console.log(`[issue-comment-attachment-meta] Giving up on comment=${commentId} — rolling-throttle retries exhausted`);
          } else if (res.status !== 404) {
            console.log(`[issue-comment-attachment-meta] ${res.status} comment=${commentId}:`, await res.text().catch(() => ""));
          }
        }

        send({ type: "progress", current: i + 1, total: slice.length });
        await sleep(700); // same calibration as attachment-meta / issue-attachment-meta / comment-attachment-meta
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

### `migrate/page.tsx` — current relevant line numbers (model to mirror, post-task-169 state)

- `CommentAttachmentMetaExportState` interface (added by task 169, directly after `IssueAttachmentMetaExportState` at `page.tsx:88-94`) — add `IssueCommentAttachmentMetaExportState` (same shape) directly after it.
- `EXPORT_LEVELS` array — add directly after the `comment-attachment-meta` entry (added by task 169):
  ```ts
  { key: "issue-comment-attachment-meta", label: "Issue Comment Attachment Metadata", desc: "Attachment list per issue comment (entity_type: comment) — requires issue-comments.json exported first" },
  ```
- State hook — add `issueCommentAttachmentMetaExport` directly after task 169's `commentAttachmentMetaExport` hook. Real grounded count available: migration 052's design note cites **2,285 real issue comments** from the live portal — use that (or a conservative slice like `to: "300"`) as the starting default, same proportional-slice reasoning task 113 applied for its own `to: "100"` default.
- Handler — add `handleIssueCommentAttachmentMetaExport()` directly after task 169's `handleCommentAttachmentMetaExport()` closes, same SSE-reader structure, POSTing to `/api/admin/zoho-export/issue-comment-attachment-meta`, downloading `issue-comment-attachment-meta-{from}-{to}.json`.
- JSX render block — add `if (key === "issue-comment-attachment-meta")` directly after task 169's `key === "comment-attachment-meta"` block closes, same structure, with the count label showing "of 2285 comments" and the progress label "Comment {current} of {total}".

---

## Implementation Steps

1. Create `src/app/api/admin/zoho-export/issue-comment-attachment-meta/route.ts` per Code Context — single-file read of `issue-comments.json`, comment-index `from`/`to` slicing, `entity_type: "comment"`, `_zoho_comment_id`/`_zoho_issue_id`/`_zoho_project_id` tagging, `failed_comment_ids` in the `done` event.
2. In `src/app/v2/(hub)/admin/migrate/page.tsx`:
   a. Add `IssueCommentAttachmentMetaExportState` interface after `CommentAttachmentMetaExportState` (task 169).
   b. Add the `issue-comment-attachment-meta` entry to `EXPORT_LEVELS` after `comment-attachment-meta`.
   c. Add the `issueCommentAttachmentMetaExport` state hook after `commentAttachmentMetaExport`.
   d. Add `handleIssueCommentAttachmentMetaExport()` after `handleCommentAttachmentMetaExport()` closes.
   e. Add the `if (key === "issue-comment-attachment-meta")` JSX block after the `key === "comment-attachment-meta"` block closes.
3. Run `npx tsc --noEmit` and `pnpm lint`.
4. Live-test with a small slice first (`from=0&to=5`) given `entity_type: "comment"` is a guess, not doc-confirmed for this specific endpoint — verify at least one known-attached issue comment (spot-check `issue_comments.source_meta.attachments` for a non-empty row, or the Zoho web UI) returns a non-empty `attachment` array before running the full 2,285-comment export.

---

## Acceptance Criteria

- [ ] `GET /api/admin/zoho-export/issue-comment-attachment-meta` requires admin/super_admin auth — 401/403 matching every other export route
- [ ] Route reads `_from_zoho/issue-comments.json`, returns 400 with a clear error if it doesn't exist
- [ ] `from`/`to` query params slice the comment list
- [ ] For each comment in the slice, calls `/projects/{projectId}/attachments` with `entity_type: "comment"`, `entity_id: {commentId}`
- [ ] Every returned attachment item is tagged with `_zoho_comment_id`, `_zoho_issue_id`, and `_zoho_project_id`
- [ ] 404 responses treated as "no attachments for this comment" (not logged as an error); `throttleExhausted` failures pushed to `failed_comment_ids`; other non-2xx statuses logged but non-fatal
- [ ] Uses `fetchZohoWithRetry` with the same `sleep(700)` pacing as the sibling routes
- [ ] SSE stream emits `progress` (current/total), `attachments` (batch), and a final `done` (total_attachments, failed_comment_ids) event
- [ ] `migrate/page.tsx` shows an "Issue Comment Attachment Metadata" card in Phase 1 — Export, directly after "Comment Attachment Metadata", with From/To inputs, progress bar, downloaded-count message, amber failed-comments warning when non-empty
- [ ] Clicking Export downloads `issue-comment-attachment-meta-{from}-{to}.json` containing the accumulated array
- [ ] Small-slice (`from=0&to=5`) live run confirms `entity_type: "comment"` actually returns attachment data before a full run
- [ ] `npx tsc --noEmit` and `pnpm lint` both clean

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

1. Ensure `_from_zoho/issue-comments.json` exists (task 109's issue comments export).
2. Start dev server: `pnpm dev`.
3. Navigate to `/v2/admin/migrate`. Confirm the "Issue Comment Attachment Metadata" card appears in Phase 1 — Export, after "Comment Attachment Metadata".
4. Run `from=0&to=5` first — inspect the downloaded file; confirm at least one comment returns attachment metadata if known to have one, and confirm `_zoho_comment_id`/`_zoho_issue_id`/`_zoho_project_id` tagging is present.
5. If the small slice returns 0 attachments, manually verify via the Zoho web UI (or `issue_comments.source_meta.attachments` in the DB) whether any of those 5 comments actually have attachments before concluding `entity_type: "comment"` is correct.
6. Run the full export in slices (2,285 comments total, per migration 052). Confirm the run completes cleanly, inspect `failed_comment_ids`.

## Compatibility Touchpoints

- New route only — no changes to any existing export/import route, no schema changes, no `IMPORT_LEVELS` changes.
- Purely additive to `migrate/page.tsx`.
- **A future Issue Comment Attachments import/upload follow-up** would need the same manual-match uploader design as tasks 106/114 (Zoho attachment download is blocked — confirmed live in task 106); `entity_type = 'comment'` is already allowed by the `attachments` table's CHECK constraint (migration 049), so no schema change would be needed there. `entity_id` would resolve to `issue_comments.id` via `external_id` lookup (comment's Zoho ID is already stored as `issue_comments.external_id`, migration 052) — same paginated-lookup-map pattern as `resolveIssueId`.
