# 387: Fix Task Detail "Attachments" Upload Zone — Still on Pre-Task-339 Multipart Flow, Every Upload 400s "Invalid request"

**Created:** 2026-09-22
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Completed (marked complete at the user's explicit request — browser acceptance not run)

---

## Overview

A PM reported "Invalid request" when uploading a `.docx` file. Live network capture confirmed the request:

```
POST https://hub.webriqs.com/api/v2/projects/C30DE6A5-PROJ-03/tasks/e91f121a-72de-4a26-a25e-78b7f3746663/attachments
Payload: Form data — file: (binary)
Response: {"error":"Invalid request"}   (400)
```

**Root cause:** `src/app/(hub)/projects/_shared/_attachment-upload-zone.tsx` (the small "Attachment upload" dropzone rendered directly on the Task Detail page, above the Attachments/Comments panel — used to add a file to an *already-created* task) still builds a `FormData` and POSTs it as `multipart/form-data` via `uploadFileWithProgress`, straight to `/api/v2/projects/[projectId]/tasks/[taskId]/attachments`:

```tsx
const queue = useUploadQueue((file, onProgress) => {
  const fd = new FormData();
  fd.append("file", file);
  return uploadFileWithProgress(uploadUrl, fd, onProgress).then(() => undefined);
});
```

But task 339 migrated that exact POST route to a JSON-only "register" step (`{ path, filename, size }`), part of moving task/issue attachments to a browser-direct-to-Storage signed-URL flow (to avoid Vercel's ~4.5MB request-body gateway cap). The route now does `await req.json().catch(() => null)`; multipart form-data isn't valid JSON, so `body` comes back `null`, `filename` resolves to `""`, and this guard trips:

```ts
// src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/route.ts:128-134
const body = await req.json().catch(() => null);
const storagePath = typeof body?.path === "string" ? body.path : "";
const filename = typeof body?.filename === "string" ? body.filename : "";
const size = typeof body?.size === "number" ? body.size : null;
if (!storagePath || !filename) {
  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
```

`_attachment-upload-zone.tsx` was simply never migrated when task 339 shipped — it's the one remaining consumer of the old multipart flow against a route that's been JSON-only since. **This means every file upload through Task Detail's Attachments zone is currently broken for every file, not just `.docx`** (both `/projects/v2/[projectId]/tasks/[taskId]` and `/projects/legacy/[projectId]/tasks/[taskId]`, since both import the same shared `_task-detail.tsx` → `AttachmentUploadZone`).

The sibling Ticket/Issue attachments tab (`_ticket-attachments.tsx`) already does this correctly — it's the reference pattern to mirror:

```tsx
// src/app/(hub)/projects/v2/[projectId]/tickets/[ticketId]/_ticket-attachments.tsx:55-64
const uploadQueue = useUploadQueue((file, onProgress) => {
  const base = `/api/v2/projects/${projectId}/tickets/${ticketId}/attachments`;
  return uploadViaSignedUrl({
    signUrl: `${base}/sign`,
    registerUrl: base,
    file,
    mime: extensionInfoFor(file.name)?.mime ?? "application/octet-stream",
    onProgress,
  }).then(() => undefined);
});
```

The New Task modal's own attachment staging (`_task-attachment-picker.tsx` → `_create-task-modal.tsx`) already uses this same correct `uploadViaSignedUrl` pattern — it was not affected. This bug is isolated to the **post-creation** "add attachment to an existing task" surface.

## Requirements

- [ ] `AttachmentUploadZone` (`_attachment-upload-zone.tsx`) uploads via the signed-URL flow (`uploadViaSignedUrl`: sign → browser-direct PUT to Storage → register), matching `_ticket-attachments.tsx`'s and `_create-task-modal.tsx`'s existing pattern, instead of multipart `FormData` + `uploadFileWithProgress`.
- [ ] Uploading any allowed file type (image, PDF, Word, Excel, text/code, zip/rar, video) through Task Detail's Attachments zone succeeds — on both `/projects/v2/[projectId]/tasks/[taskId]` and `/projects/legacy/[projectId]/tasks/[taskId]`.
- [ ] `projects-old`'s own separate copy of this component (`src/app/(hub)/projects-old/[projectId]/_attachment-upload-zone.tsx`) is left untouched — see Out of Scope.

## Out of Scope / Must-Not-Change

- Do not touch `uploadFileWithProgress` itself (`_attachment-dropzone.tsx`) — it's still the correct, live mechanism for onboarding-workspace/onboarding-wizard uploads (`_upload-queue.tsx`, `_onboarding-wizard.tsx`), an unrelated surface with its own multipart route that was never migrated to signed-URL and isn't part of this bug.
- Do not touch `/api/v2/projects/[projectId]/tasks/[taskId]/attachments/route.ts` or `.../sign/route.ts` — both are already correct (JSON register + signed-URL mint), matching task 339's shipped design; the bug is entirely client-side.
- Do not touch `_ticket-attachments.tsx` — already correct, used only as the reference pattern.
- Do not touch `src/app/(hub)/projects-old/**` (including its own `_attachment-upload-zone.tsx` and `_create-task-modal.tsx`, which still use the old multipart flow throughout) — `projects-old` is not linked from the v2 sidebar nav and appears to be dead/orphaned legacy code, not the surface the PM hit (confirmed via the live network capture's project-ID format, which matches the current `/projects/v2`/`/projects/legacy` scheme). Fixing it is out of scope unless the user says otherwise.
- Do not change `TaskAttachmentsCommentsPanel` (the read-only listing/comments panel rendered below the upload zone) — it has no upload logic of its own; a successful upload through the fixed zone already reaches it via the existing Supabase Realtime subscription, no wiring needed.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_shared/_attachment-upload-zone.tsx` | Modify | Swap `uploadFileWithProgress` + `FormData` for `uploadViaSignedUrl`, mirroring `_ticket-attachments.tsx`'s call shape |

## Code Context

### File: `src/app/(hub)/projects/_shared/_attachment-upload-zone.tsx` (current, full file — 28 lines)

```tsx
"use client";

import { AttachmentDropzone, uploadFileWithProgress, useUploadQueue } from "./_attachment-dropzone";

export function AttachmentUploadZone({
  uploadUrl,
  disabled = false,
}: {
  uploadUrl: string;
  disabled?: boolean;
}) {
  const queue = useUploadQueue((file, onProgress) => {
    const fd = new FormData();
    fd.append("file", file);
    return uploadFileWithProgress(uploadUrl, fd, onProgress).then(() => undefined);
  });

  return <AttachmentDropzone queue={queue} disabled={disabled} />;
}
```

`uploadUrl` is always the "register" base URL today (e.g. `/api/v2/projects/${projectId}/tasks/${task.id}/attachments`, from `_task-detail.tsx:454`) — the `/sign` sibling route already exists at `${uploadUrl}/sign` for both the v2 and legacy task routes (confirmed: `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/sign/route.ts` exists and is already used correctly by the New Task modal's post-creation upload path). No prop signature change is needed — `${uploadUrl}/sign` can be derived the same way `_ticket-attachments.tsx` derives it from its own `base`.

### Reference pattern: `src/app/(hub)/projects/v2/[projectId]/tickets/[ticketId]/_ticket-attachments.tsx` (lines 55–64)

```tsx
const uploadQueue = useUploadQueue((file, onProgress) => {
  const base = `/api/v2/projects/${projectId}/tickets/${ticketId}/attachments`;
  return uploadViaSignedUrl({
    signUrl: `${base}/sign`,
    registerUrl: base,
    file,
    mime: extensionInfoFor(file.name)?.mime ?? "application/octet-stream",
    onProgress,
  }).then(() => undefined);
});
```

### `uploadViaSignedUrl` signature (`_attachment-dropzone.tsx:73-124`) — already exported, no change needed

```ts
export async function uploadViaSignedUrl({
  signUrl, registerUrl, file, mime, onProgress,
}: { signUrl: string; registerUrl: string; file: File; mime: string; onProgress?: (pct: number) => void }): Promise<unknown>
```

### Caller (unchanged): `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-detail.tsx:453-456` and the identical block in `.../legacy/.../_task-detail.tsx`

```tsx
<AttachmentUploadZone
  uploadUrl={`/api/v2/projects/${projectId}/tasks/${task.id}/attachments`}
  disabled={!perm.canEditDetails}
/>
```

This passes `uploadUrl` as the register base already — no caller change required once the component derives `signUrl` internally.

## Implementation Steps

1. In `_attachment-upload-zone.tsx`, replace the `uploadFileWithProgress`/`FormData` import and call with `uploadViaSignedUrl` (import from the same `./_attachment-dropzone` module) and `extensionInfoFor` (from `@/config/attachment-types`).
2. Inside the `useUploadQueue` callback, call `uploadViaSignedUrl({ signUrl: `${uploadUrl}/sign`, registerUrl: uploadUrl, file, mime: extensionInfoFor(file.name)?.mime ?? "application/octet-stream", onProgress }).then(() => undefined)`, matching `_ticket-attachments.tsx`'s shape exactly.
3. No changes needed to either caller (`v2`/`legacy` `_task-detail.tsx`) — both already pass the register-base `uploadUrl`, and the `/sign` sibling route already exists server-side for tasks.

## Acceptance Criteria

- [ ] On `/projects/v2/[projectId]/tasks/[taskId]`, use the "Attachment upload" zone to attach a `.docx` (or any allowed type) to an existing task — succeeds (no "Invalid request"), file appears in the Attachments panel below.
- [ ] Same check on `/projects/legacy/[projectId]/tasks/[taskId]`.
- [ ] Network tab shows two requests per upload: `POST .../attachments/sign` (200) then `POST .../attachments` (201), plus the direct `PUT` to Supabase Storage — not a single multipart `POST .../attachments`.
- [ ] `npx tsc --noEmit` passes.
- [ ] `pnpm lint` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Then browser-acceptance: open an existing task on both `/projects/v2/.../tasks/[taskId]` and `/projects/legacy/.../tasks/[taskId]`, upload a file via the Attachments zone, confirm success and that the file shows up in the attachments list without a page refresh (Realtime subscription).

## Compatibility Touchpoints

- None — client-side upload-mechanism fix only, no schema, migration, or API contract change (the API route is already correct and unchanged).

## Implementation Notes

### What Changed
- `AttachmentUploadZone` now uploads via `uploadViaSignedUrl` (sign → browser-direct PUT to Storage → register) instead of building a `FormData` and POSTing multipart via `uploadFileWithProgress`. Both callers (`v2`/`legacy` `_task-detail.tsx`) needed no changes — they already pass the register-base `uploadUrl`, and `${uploadUrl}/sign` resolves to the existing, already-correct `.../attachments/sign` route.

### Files Changed
- `src/app/(hub)/projects/_shared/_attachment-upload-zone.tsx` - swapped `uploadFileWithProgress`/`FormData` import and call for `uploadViaSignedUrl` + `extensionInfoFor`, matching `_ticket-attachments.tsx`'s call shape exactly; added a task-387 comment explaining why (non-obvious: this component was the one leftover consumer of the pre-task-339 multipart flow)

### Deviations From Plan
- None. Implementation matched the plan's Implementation Steps exactly — no caller changes were needed, as anticipated.

### Verification Run
- `npx tsc --noEmit` - PASS (no output, 0 errors)
- `pnpm lint` - PASS (2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx` — not touched by this change)
- Browser acceptance - SKIPPED (no live Claude in Chrome session this pass). Reproduction/verification steps are in the task doc's Verification section — needs a live check on both `/projects/v2/.../tasks/[taskId]` and `/projects/legacy/.../tasks/[taskId]` uploading a file via the Attachments zone, confirming the two-request signed-URL flow in the Network tab and success in the UI.

## Quality Gate Notes

### Result
PASS

### Standards Review
- `git diff --name-only` confirms only `src/app/(hub)/projects/_shared/_attachment-upload-zone.tsx` was touched for this task (the other files in the working tree are pre-existing, unrelated changes from tasks 385/386, untouched here).
- The diff matches the approved plan's Code Context exactly: `uploadFileWithProgress`/`FormData` import replaced with `uploadViaSignedUrl` + `extensionInfoFor`, call shape mirrors `_ticket-attachments.tsx`'s reference pattern (`signUrl`/`registerUrl`/`file`/`mime`/`onProgress`) field-for-field.
- No leftover dead code: the removed `FormData`/`fd.append` block has no other references in this file; `uploadFileWithProgress` itself is untouched and still correctly used by the unrelated onboarding-workspace/onboarding-wizard callers (verified via `git diff --name-only` showing those files unmodified).
- No unused imports, no `any`, no new abstractions — the component's public prop signature (`uploadUrl`, `disabled`) is unchanged, so both callers (`v2`/`legacy` `_task-detail.tsx`) needed no edits, as the plan anticipated.
- The added comment explains the non-obvious WHY (this was the one leftover multipart consumer of a route task 339 made JSON-only) rather than restating what the diff already shows — consistent with CLAUDE.md's comment policy.
- `npx tsc --noEmit` and `pnpm lint` re-verified clean (0 errors; 2 pre-existing unrelated warnings, same as before this change).

### Deviations
- None. Implementation is a literal application of the approved plan with zero scope drift — single file, no caller changes, no route changes, out-of-scope boundaries (`_ticket-attachments.tsx`, the API routes, `projects-old`) all confirmed untouched.

### Required Fixes
- None.
