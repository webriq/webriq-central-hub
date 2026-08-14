# 235: Issue Detail — Attachments Tab (Live Upload, Grid Viewer)

**Created:** 2026-08-13
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced

---

## Overview

First of three follow-ups to task 234 (Issue Detail redesign + RBAC + timer), which explicitly deferred
full Task-Detail-parity tabs to separate tasks. This one adds a live Attachments tab to Issue Detail,
mirroring Task Detail's own (`_task-attachments.tsx`, built across tasks 205/206/211): a grid of
uploaded files with type-coded tiles, an in-app viewer modal, and role-gated upload/delete.

**Why this is small relative to task 234's migration work:** the underlying `attachments` table
(migration 049-era) is already **polymorphic** — `entity_type text, entity_id uuid` — not task-specific.
The task-side route already writes `entity_type: "task"`; this task only needs an issue-scoped sibling
route writing `entity_type: "issue"`. No new table, no RLS change (`attachments_staff_read`/write
policies are role-scoped, not entity-scoped — confirmed by reading the existing task attachments route,
which relies on RLS with no extra entity check of its own).

**Permission model**: reuses task 234's `getIssueEditPermission` — upload/delete requires
`perm.canEditDetails` (creator or PM/Admin/super_admin); everyone with page access can view/download,
same as Task Detail's own read-for-all/write-for-permitted split.

## Requirements

1. New `Attachments` tab/section on Issue Detail (a standalone `Card`, or — if task 236/237 have already
   landed by implementation time — a shared tab panel; if this is the first of the three to land, ship
   it as its own `Card` titled "Attachments" for now, matching how Task Detail looked before task 211
   introduced the merged tab panel. See `TASKS.md` for the current landing order of 235/236/237.)
2. Grid viewer with type-coded tiles (image thumbnail, PDF/DOC/XLS colored tile), file name, size,
   upload date — mirrors `_task-attachments.tsx`'s existing presentation.
3. "View" opens an in-app modal (mirror `_task-attachment-viewer-modal.tsx`) via an on-demand signed
   URL — no direct public URL exposure, consistent with the task-side pattern.
4. Upload control (drag/drop or file picker) visible only when `perm.canEditDetails`; same allow-listed
   MIME types and 25MB limit as the task route.
5. Delete visible only when `perm.canEditDetails`.
6. `npx tsc --noEmit` and `pnpm lint` pass.

## Out of Scope / Must Not Change

- Task attachments (`tasks/[taskId]/_task-attachments.tsx`, its API routes) — untouched; this task
  builds an issue-scoped sibling, not a shared/generalized component (the grid/tile/modal are
  presentational enough that a straight copy-adapt is more in line with this codebase's established
  "page-scoped UI, extract only when truly shared" convention than an early abstraction).
- Comments and Time Logs tabs — tasks 236/237.
- The `attachments` table schema/RLS — no changes needed (already polymorphic and role-scoped).

## Proposed File Changes

- `src/app/api/v2/projects/[projectId]/issues/[issueId]/attachments/route.ts` (new) — `GET`/`POST`,
  adapted from `.../tasks/[taskId]/attachments/route.ts` with `entity_type: "issue"`, `entity_id:
  issue.id`, and the edit-permission check via `getIssueEditPermission` on `POST` (the task route
  doesn't need this check today since only PM/Admin/super_admin can reach task attachments meaningfully
  via its own gating — issues now have a creator-developer tier that must be checked explicitly).
- `src/app/api/v2/projects/[projectId]/issues/[issueId]/attachments/[attachmentId]/route.ts` (new) —
  `DELETE`, same adaptation.
- `src/app/api/v2/projects/[projectId]/issues/[issueId]/attachments/[attachmentId]/file-url/route.ts`
  (new) — signed URL minting, adapted from the task equivalent.
- `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/_issue-attachments.tsx` (new) — adapted from
  `tasks/[taskId]/_task-attachments.tsx` (grid/tiles/formatFileSize/extensionOf) and
  `_task-attachment-viewer-modal.tsx` (viewer), pointed at the new issue routes; upload control gated
  on a new `canEditDetails` prop passed down from `_issue-detail.tsx`.
- `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/_issue-detail.tsx` — renders the new
  `IssueAttachments` component below/beside Description, passing `perm.canEditDetails`.

## Code Context

Task attachments GET/POST route already read in full during task 234's research
(`src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/route.ts`) — same MIME allow-list and
25MB cap to reuse verbatim:
```ts
const ALLOWED_MIME_TYPES = [
  "image/jpeg", "image/png", "image/gif", "image/webp",
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
];
const MAX_FILE_SIZE = 25 * 1024 * 1024;
```
Its GET already shows the exact polymorphic-table query shape to reuse with `entity_type: "issue"`:
```ts
const { data, error } = await supabase
  .from("attachments")
  .select("id, filename, size, created_at")
  .eq("entity_type", "task")
  .eq("entity_id", task.id)
  .order("created_at", { ascending: true });
```

`getIssueEditPermission` (task 234, `src/lib/issues/permissions.ts`) — import and call the same way
`issues/[issueId]/route.ts` does for `PATCH`.

## Implementation Steps

1. Add the three issue-scoped attachment API routes, adapted from their task counterparts.
2. Add `_issue-attachments.tsx`, adapted from `_task-attachments.tsx` + `_task-attachment-viewer-modal.tsx`.
3. Wire into `_issue-detail.tsx`.
4. `npx tsc --noEmit`, `pnpm lint`.

## Acceptance Criteria

- [ ] Attachments upload/view/delete works on an issue, scoped correctly (`entity_type: "issue"`,
      `entity_id: <issue uuid>`), with no cross-contamination with task attachments.
- [ ] Upload/delete controls only appear for PM/Admin/super_admin or the issue's creator.
- [ ] View opens an in-app modal via a signed URL, not a public link.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

- `npx tsc --noEmit`
- `pnpm lint`
- Browser: as PM, upload an attachment to an issue, view it in-app, delete it.
- Browser: as a developer with no edit rights on that issue, confirm attachments are viewable but no
  upload/delete control renders.

## Compatibility Touchpoints

- Depends on task 234 landing first (`getIssueEditPermission`, redesigned `_issue-detail.tsx` layout).
- No schema/RLS changes.

## Implementation Notes

### What Changed
- **Discovered during implementation, not assumed at planning time**: `tasks/[taskId]/_task-attachments.tsx`
  has no upload or delete UI at all — Task Detail's Attachments tab is view-only; uploads happen once,
  at task-creation time, via the New Task modal's picker. No `DELETE` route exists for task attachments
  either. This doesn't change this task's scope (the approved doc's Requirements 4/5 already called for
  upload+delete directly on Issue Detail, since issues have no equivalent creation flow to upload at) —
  it just means there was no task-side `DELETE` route to copy verbatim, and `_issue-attachments.tsx`
  needed its own upload/delete UI built from scratch rather than "adapted" from an existing one.
- Added three issue-scoped attachment API routes (GET+POST, DELETE, file-url), reusing the existing
  polymorphic `attachments` table (`entity_type: "issue"`) and the shared `project-assets` storage
  bucket — no schema/RLS changes, as planned. `POST`/`DELETE` both gate on `getIssueEditPermission(...).canEditDetails`
  (creator or PM/Admin/super_admin), read stays open to any staff role per existing `attachments_staff_read` RLS.
- Added `IssueAttachments` (`_issue-attachments.tsx`) — grid/tile presentation and thumbnail-fetch
  logic adapted from `_task-attachments.tsx`, plus new upload (`+ Add file` button, file input, MIME/
  size validation surfaced inline) and delete (per-tile hover `X`) controls gated by a `canEdit` prop.
  Realtime sync mirrors the task version's exact pattern (`entity_id` filter + `entity_type` double-check).
- Reused `TaskAttachmentViewerModal` directly instead of duplicating it (see Deviations) — it was
  already fully generic (`{ filename }` + a caller-supplied `fetchUrl`, already shared by 2 unrelated
  features), so building an "IssueAttachmentViewerModal" copy would have been pure duplication.
- Wired `IssueAttachments` into `_issue-detail.tsx` as a new `Card` below Description, passing
  `perm.canEditDetails` as `canEdit`.

### Files Changed
- `src/app/api/v2/projects/[projectId]/issues/[issueId]/attachments/route.ts` - new, GET+POST.
- `src/app/api/v2/projects/[projectId]/issues/[issueId]/attachments/[attachmentId]/route.ts` - new, DELETE.
- `src/app/api/v2/projects/[projectId]/issues/[issueId]/attachments/[attachmentId]/file-url/route.ts` - new.
- `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/_issue-attachments.tsx` - new.
- `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/_issue-detail.tsx` - renders `IssueAttachments`.

### Deviations From Plan
- **Reused `TaskAttachmentViewerModal` directly rather than adapting/duplicating it** (the doc's
  Proposed File Changes said `_issue-attachments.tsx` would be adapted from both the grid *and* the
  viewer modal). On inspection the modal takes no task-specific props — only `attachment: { filename }`
  and a `fetchUrl` string — so importing it as-is from
  `tasks/[taskId]/_task-attachment-viewer-modal.tsx` works with zero changes. Minor, less code than
  planned, not more; no behavior difference.
- **No task-side `DELETE` route existed to adapt** (see What Changed) — the new `DELETE` route was
  written fresh, following the same auth/permission/error-response shape as this task's own `POST`
  and the sibling `file-url` `GET`, rather than mirroring a task equivalent that doesn't exist. Noted
  in the new route's own top comment for future readers.
- **Upload/delete UI was built from scratch**, not adapted from an existing task-side control, for the
  same reason. Styling (button/icon sizing, colors, spinner states) matches this codebase's established
  hover-action-icon and inline-loading-spinner conventions used elsewhere on this same page (e.g. the
  header's delete-issue button) rather than copying a nonexistent task-side pattern.
- `TASKS.md`'s Planned → In Progress transition was skipped at the start of this implementation (moved
  directly to Testing at the end instead of via In Progress) — a process miss, not a scope deviation;
  noted here since the `implement` skill's own invariant calls out both transitions explicitly.
- No scope deviations — Comments/Time Logs tabs remain out of scope (tasks 236/237); no schema/RLS
  changes were made, as planned.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing warnings in `_checklist-tab.tsx`, unrelated)
- Browser verification (PM upload/view/delete, developer-with-no-edit-rights view-only) - SKIPPED
  (deferred to the `test` stage; no live database session available)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Reviewed all 5 changed/new files (3 new API routes, new `_issue-attachments.tsx`, the incremental
  addition to `_issue-detail.tsx` — the import + new `Card` block, not the full task-234 diff that
  file also carries) against the task doc's Requirements, Proposed File Changes, and Out of Scope
  boundaries.
- No dead code, no `any`, no TODOs. `console.error` calls in all three API routes are server-side
  error logging on the failure path only, matching the exact pattern already established in the
  task-side attachments routes this was adapted from — not debug logging left in by accident.
- **IDOR check performed explicitly, not assumed**: both `DELETE` and `file-url` `GET` scope their
  `attachments` lookup by `entity_type = "issue"` AND `entity_id = issue.id` (not just `id =
  attachmentId`) before acting — a guessed/enumerated `attachmentId` belonging to a different issue,
  a task, or a comment cannot be deleted or have its URL minted via this route. Verified by reading
  the lookup query directly in both routes, not by trusting the doc's claim of "same as the task
  pattern."
- `POST`/`DELETE` correctly gate on `getIssueEditPermission(...).canEditDetails`, computed from a
  freshly-fetched `created_by`/`assignee_id` (not client-supplied), so a non-privileged developer
  crafting a direct request is still rejected server-side, not just hidden client-side.
- Confirmed the known, inherited storage-RLS gap the new routes' own comments flag (a developer
  creator's upload/delete would still 403 at the `project-assets` bucket layer, since
  `project_assets_staff_write` RLS is PM/Admin/super_admin-only) is genuinely pre-existing and not
  something this task introduced — read `project_assets_staff_write`'s policy definition directly
  (migration 050) to verify, rather than trusting the task-234 doc's own claim second-hand. Confirmed
  it's currently unreachable by any real data (no issue has a non-null `created_by` yet, per task
  234's own findings), so it's correctly left as a documented, out-of-scope limitation rather than a
  blocking finding.
- Confirmed `TaskAttachmentViewerModal`'s reuse is safe: it only reads `attachment.filename` and the
  caller-supplied `fetchUrl` — no task-specific coupling exists in the component itself, verified by
  reading its full source, not inferred from its name.

### Deviations
- None beyond what's already documented in the task doc's own "Deviations From Plan" section (modal
  reuse instead of duplication, fresh `DELETE` route with no task-side twin to copy, upload/delete UI
  built new, and the Planned→In Progress tracker-transition process miss) — all Minor, already
  justified with rationale, no scope expansion.
- No new deviations found during this gate.

### Required Fixes
- None.
