# 339: Fix "Upload failed (413)" on Issue Attachments — Browser-Direct Upload to Supabase Storage

**Created:** 2026-08-31
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

Uploading an attachment on the Issue Detail **Attachments** tab (and via the New Issue modal)
fails with **`Upload failed (413)`** for anything larger than ~4.5 MB — e.g. the retina PNG
screenshots (`1.png`, `2.png`) in the bug report.

**Root cause.** The upload sends the file as `multipart/form-data` to the Next.js route handler
`POST /api/v2/projects/[projectId]/issues/[issueId]/attachments`. In production (Vercel), the
platform gateway rejects any Serverless/Route-Handler **request body over 4.5 MB** with HTTP
`413` (`x-vercel-error: FUNCTION_PAYLOAD_TOO_LARGE`) *before the handler runs*. The
`next.config.ts` setting `experimental.proxyClientMaxBodySize: "2gb"` only raises the cap for
**Next.js's own `proxy.ts` body buffering** — it has no effect on Vercel's platform limit. Task
114's note about 119 MB / 1.29 GB batches was only ever exercised against `pnpm dev` locally,
where no such cap exists.

`uploadFileWithProgress()` (the shared XHR helper) surfaces any non-2xx status verbatim as
`Upload failed (<status>)`, which is why the UI shows the raw `413`.

**Fix.** Stop routing file bytes through the Next handler. The browser uploads the file
**directly to Supabase Storage** using a short-lived **signed upload URL**; the Next handlers
only (a) mint that URL after running the existing auth / permission / type / size / count
checks, and (b) register the resulting object as an `attachments` row after a lightweight
server-side byte verification. Both handler calls are tiny JSON requests, far under any cap.

This is the same pattern used by task 114's stated design intent ("much larger batches, files to
119 MB"), finally made to actually work in production.

## Requirements

- [ ] Attachment uploads on Issue Detail succeed for files well over 4.5 MB (test with a
      ~15–30 MB image and a ~120 MB video), in production-equivalent conditions.
- [ ] Server still enforces, before issuing the signed URL: authentication, `getIssueEditPermission(...).canEditDetails`, extension allowlist + hard-block list, `MAX_FILE_SIZE` (200 MB), and the `MAX_FILES` (10) per-issue count.
- [ ] Server still runs `verifyFile()` (magic-byte / corruption / spoof check) on the uploaded object before the `attachments` row is created; a failing file is deleted from storage and returns a 400 with the existing reason string.
- [ ] Per-file upload **progress %** in `UploadQueuePanel` still works (the direct PUT is instrumented with `xhr.upload.onprogress`).
- [ ] The New Issue modal's "create issue → upload staged attachments" flow uses the new path.
- [ ] Same fix applied to the **task** attachment surface that shares the identical helper — `POST /api/v2/projects/[projectId]/tasks/[taskId]/attachments` + the New Task modal — since it has the identical latent bug.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.
- [ ] Realtime list refresh, delete, the comment-attachment merge in `GET`, and the attachment viewer modal all still work unchanged.
- [ ] `CLAUDE.md`'s "Route handlers accepting large request bodies" convention note is updated to record the Vercel 4.5 MB platform cap and point at this direct-upload pattern.

## Out of Scope / Must-Not-Change

- **Comment attachments** — `POST /api/v2/projects/[projectId]/issues/[issueId]/comments/[commentId]/attachments` and `.../tasks/[taskId]/comments/[commentId]/attachments`. Same latent bug, but comment attachments are rarely large; migrate them in a follow-up. They keep using `uploadFileWithProgress()` (do **not** delete that helper).
- `POST /api/zoho/tasks/[taskId]/attachments` (legacy Zoho path) — untouched.
- `kb/upload`, `customers/[id]/assets/upload`, onboarding-workspace `_files-tab.tsx` — separate allowlists / mechanisms, explicitly out of scope (as in task 273).
- The `attachments` table schema, the `project-assets` bucket, storage RLS policies, and `src/config/attachment-types.ts` values — no changes.
- Do not change `GET` on the two modified routes.
- Do not remove `experimental.proxyClientMaxBodySize` from `next.config.ts` (still governs other multipart routes); only update its comment.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/uploads/attachment-storage.ts` | Create | Shared server helpers: `createAttachmentUploadUrl(supabase, storagePath)` → `{ path, token, signedUrl }`; `verifyUploadedObject(supabase, storagePath, filename)` → downloads first 64 KB via a ranged signed-URL fetch, runs `verifyFile()`, deletes the object + returns the reason on failure. |
| `src/app/api/v2/projects/[projectId]/issues/[issueId]/attachments/sign/route.ts` | Create | `POST` — auth + `getIssueEditPermission` + extension/hard-block + `MAX_FILE_SIZE` + `MAX_FILES` count checks (all lifted from the current POST), then `createAttachmentUploadUrl()`. Returns `{ path, token, signedUrl }`. |
| `src/app/api/v2/projects/[projectId]/issues/[issueId]/attachments/route.ts` | Modify | `POST` body becomes JSON `{ path, filename, size }` (was multipart). Re-check auth/permission/count, assert `path` is within `issues/<issue.id>/`, `verifyUploadedObject()`, then insert the `attachments` row as today (`uploaded_by`, `size` from body). `GET` unchanged. |
| `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/sign/route.ts` | Create | Task equivalent of the issue `sign` route (uses the task route's existing `isPrivileged`/own-task permission check). |
| `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/route.ts` | Modify | Same JSON-body + `verifyUploadedObject` change as the issue route. |
| `src/app/(hub)/projects/_shared/_attachment-dropzone.tsx` | Modify | Add `uploadViaSignedUrl({ signUrl, registerUrl, file, mime, onProgress })`: (1) `POST signUrl` `{ filename, size }`; (2) XHR `PUT` the `File` to `${NEXT_PUBLIC_SUPABASE_URL}${signedUrl}` with `x-upsert: false` + `Content-Type: mime`, wiring `xhr.upload.onprogress` → `onProgress`; (3) `POST registerUrl` `{ path, filename, size }`. Keep `uploadFileWithProgress` for comment callers. |
| `src/app/(hub)/projects/v2/[projectId]/issues/[issueId]/_issue-attachments.tsx` | Modify | `useUploadQueue` callback → `uploadViaSignedUrl` with the issue `sign`/register URLs. |
| `src/app/(hub)/projects/legacy/[projectId]/issues/[issueId]/_issue-attachments.tsx` | Modify | Same change (near-identical file — keep the one-line comment drift). |
| `src/app/(hub)/projects/_shared/_create-issue-modal.tsx` | Modify | `useUploadQueue` callback → `uploadViaSignedUrl` (issue URLs). |
| `src/app/(hub)/projects/_shared/_create-task-modal.tsx` | Modify | `useUploadQueue` callback → `uploadViaSignedUrl` (task URLs). |
| `next.config.ts` | Modify | Update the `proxyClientMaxBodySize` comment only — note attachments no longer flow through it and the real prod cap is Vercel's 4.5 MB. |
| `CLAUDE.md` | Modify | Update the "Route handlers accepting large request bodies" bullet with the Vercel 4.5 MB platform cap + the browser-direct-upload pattern for attachments. |

## Code Context

### Current failing path — `src/app/(hub)/projects/_shared/_attachment-dropzone.tsx`

```tsx
// XHR, not fetch — needs upload-progress events.
export function uploadFileWithProgress(url, formData, onProgress?) { /* POST multipart → route handler */ }

// _issue-attachments.tsx (v2 + legacy, identical):
const uploadQueue = useUploadQueue((file, onProgress) => {
  const fd = new FormData();
  fd.append("file", file);
  return uploadFileWithProgress(`/api/v2/projects/${projectId}/issues/${issueId}/attachments`, fd, onProgress).then(() => undefined);
});
```

`uploadFileWithProgress` maps any non-2xx to `new Error(`Upload failed (${xhr.status})`)` → this
is the exact string in the screenshot.

### Current route — `src/app/api/v2/projects/[projectId]/issues/[issueId]/attachments/route.ts` (`POST`)

Checks to preserve (move the pre-upload ones into `sign`, keep the post-upload ones in the
rewritten `POST`):

```ts
const perm = getIssueEditPermission(profile?.role, user.id, issue);
if (!perm.canEditDetails) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

const info = extensionInfoFor(file.name);
if (!info || isHardBlockedFilename(file.name)) return 400 "Unsupported file type.";
if (file.size > MAX_FILE_SIZE) return 400 "File size exceeds the 200MB limit (...)";

const { count: existingCount } = await supabase.from("attachments")
  .select("id", { count: "exact", head: true })
  .eq("entity_type", "issue").eq("entity_id", issue.id);
if ((existingCount ?? 0) >= MAX_FILES) return 400 "Only up to 10 files can be attached.";

// verifyFile(buffer, file.name)  → now runs against a 64 KB ranged read in verifyUploadedObject()
const storagePath = `issues/${issue.id}/${Date.now()}_${safeFilename}`;
await supabase.storage.from("project-assets").upload(storagePath, buffer, { contentType: info.mime, upsert: false });
await supabase.from("attachments").insert({ entity_type: "issue", entity_id: issue.id, storage_path: storagePath, filename: file.name, size: file.size, uploaded_by: user.id }).select().single();
```

### `verifyFile` — `src/lib/uploads/verify-file.ts`

Already operates on a partial buffer (`SAMPLE_BYTES = 4096`; `fileTypeFromBuffer` only reads a
header). A 64 KB ranged read is more than enough for every allowed category (image / pdf /
office / zip / rar / `ftyp`-box video / text). No change to this file.

### Signed upload URL (Supabase JS `@supabase/supabase-js@2.104.1`)

```ts
// server (user's session client — RLS-gated createSignedUploadUrl):
const { data } = await supabase.storage.from("project-assets").createSignedUploadUrl(storagePath);
// data => { signedUrl: "/storage/v1/object/upload/sign/project-assets/<path>?token=...", token, path }

// browser PUT (kept as raw XHR for progress; supabase-js `uploadToSignedUrl` has no progress cb):
xhr.open("PUT", `${process.env.NEXT_PUBLIC_SUPABASE_URL}${signedUrl}`);
xhr.setRequestHeader("x-upsert", "false");
xhr.setRequestHeader("Content-Type", mime);
xhr.upload.onprogress = (e) => onProgress(Math.round((e.loaded / e.total) * 100));
xhr.send(file);
```

The direct PUT is unauthenticated (token-scoped to the exact path, ~2 h expiry), so it also
sidesteps the dormant "developer-creator can't write to the bucket" storage-RLS gap noted in the
route — not a goal here, just a side effect.

### Ranged verification read (`verifyUploadedObject`)

```ts
const { data: signed } = await supabase.storage.from("project-assets").createSignedUrl(storagePath, 60);
const res = await fetch(signed.signedUrl, { headers: { Range: "bytes=0-65535" } });
const head = Buffer.from(await res.arrayBuffer());
const v = await verifyFile(head, filename);
if (!v.ok) { await supabase.storage.from("project-assets").remove([storagePath]); return v; }
```

## Implementation Steps

1. **Confirm the 413 origin** (fast sanity check, not a blocker): reproduce in the browser, open the failed request in the Network tab, confirm `413` + `x-vercel-error: FUNCTION_PAYLOAD_TOO_LARGE` (or Content-Length > ~4.5 MB). The fix is the same regardless.
2. Create `src/lib/uploads/attachment-storage.ts` with `createAttachmentUploadUrl()` and `verifyUploadedObject()` (see Code Context). Both take an already-constructed server `supabase` client.
3. Create `src/app/api/v2/projects/[projectId]/issues/[issueId]/attachments/sign/route.ts` — copy the auth + project/issue lookup + `getIssueEditPermission` + extension + `MAX_FILE_SIZE` + `MAX_FILES` count checks from the current `POST`; build `storagePath = `issues/${issue.id}/${Date.now()}_${safeFilename}``; return `createAttachmentUploadUrl(supabase, storagePath)` as `{ path, token, signedUrl }`.
4. Rewrite `POST` in `.../issues/[issueId]/attachments/route.ts`: parse JSON `{ path, filename, size }`; re-run auth + permission + `MAX_FILES` count; reject if `path` doesn't start with `issues/${issue.id}/`; `verifyUploadedObject(supabase, path, filename)`; on success insert the `attachments` row (`storage_path: path`, `filename`, `size`, `uploaded_by`). Return the row `{ status: 201 }`. Keep `GET` byte-for-byte.
5. Repeat steps 3–4 for the **task** route pair (`.../tasks/[taskId]/attachments/sign` + `.../tasks/[taskId]/attachments`), reusing the task route's existing privileged/own-task permission logic and a `tasks/${task.id}/` path prefix.
6. Add `uploadViaSignedUrl()` to `_attachment-dropzone.tsx` (raw XHR PUT with progress). Export it alongside `uploadFileWithProgress`.
7. Switch the four callers (`_issue-attachments.tsx` ×2, `_create-issue-modal.tsx`, `_create-task-modal.tsx`) to build their `useUploadQueue` callback from `uploadViaSignedUrl`, passing the `sign` URL, the register (base `attachments`) URL, and `extensionInfoFor(file.name)?.mime` for the `Content-Type`.
8. Update the `next.config.ts` comment and the `CLAUDE.md` bullet.
9. `npx tsc --noEmit`, `pnpm lint`.
10. Browser acceptance test (below).

## Acceptance Criteria

- [ ] On Issue Detail → Attachments, uploading a ~20 MB PNG and a ~120 MB MP4 both succeed, show live progress %, and appear in the grid (via realtime) with correct size + thumbnail/type tile.
- [ ] Uploading a `.exe` renamed to `.png`, or a truncated/corrupt image, is rejected with the existing reason text and leaves **no** orphan object in `project-assets` and no `attachments` row.
- [ ] A non-privileged / non-assignee user still gets `403` from the `sign` route (never receives a signed URL).
- [ ] The 11th attachment on an issue is rejected with "Only up to 10 files can be attached." at the `sign` step.
- [ ] New Issue modal: creating an issue with 2 large staged screenshots uploads both after creation; New Task modal behaves equivalently.
- [ ] Deleting an attachment, the comment-attachment merge in the Attachments tab, and the viewer modal all still work.
- [ ] Legacy Issue Detail route (`/projects/legacy/...`) upload works (same shared API).
- [ ] `npx tsc --noEmit` + `pnpm lint` clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then browser-test the flows above at /projects/v2/<projectId>/issues/<issueId>
```

Production-equivalent size check: the local dev server has no 4.5 MB cap, so the *regression*
(large upload works) must be reasoned about from the mechanism (no file bytes touch the Next
handler) and, ideally, confirmed on a Vercel preview deployment with a >5 MB file.

## Compatibility Touchpoints

- **Env:** relies on `NEXT_PUBLIC_SUPABASE_URL` (already public/client-side) — no new vars.
- **Supabase JS:** `createSignedUploadUrl` / `createSignedUrl` + ranged `fetch` — all supported in the pinned `2.104.1`.
- **Storage RLS / bucket:** unchanged; the bucket's own 200 MB `file_size_limit` remains the outer hard stop on the direct PUT.
- **`CLAUDE.md`:** convention note updated (large-request-body handlers / attachments).
- **Docs:** none beyond `CLAUDE.md`.
- **Follow-up (not this task):** migrate the two comment-attachment routes to the same pattern; consider a Vercel preview-deploy check in the test skill for upload-size regressions.

## Implementation Notes

### What Changed
- Attachment uploads for **issues** (Detail tab + New Issue modal) and **tasks** (New Task modal) no longer stream the file through a Next route handler as multipart — which 413s at Vercel's ~4.5 MB gateway cap. New flow:
  1. Browser `POST`s `{ filename, size }` to a new `.../attachments/sign` route → runs auth + permission + extension/hard-block + `MAX_FILE_SIZE` + `MAX_FILES` checks (lifted verbatim from the old POST) → `createSignedUploadUrl()` → returns `{ path, token, signedUrl }`.
  2. Browser `PUT`s the raw `File` straight to `signedUrl` (Supabase Storage) via an instrumented `XMLHttpRequest` so the per-file progress bar still works. No Vercel body cap on this leg.
  3. Browser `POST`s `{ path, filename, size }` to the (rewritten) `.../attachments` route → re-checks auth/permission/count, asserts `path` is inside the entity's folder, downloads the first 64 KB of the object via a ranged signed-URL fetch, runs the existing `verifyFile()` heuristic, deletes the object + 400s on failure, otherwise inserts the `attachments` row.
- New shared server helper `src/lib/uploads/attachment-storage.ts` (`createAttachmentUploadUrl`, `verifyUploadedObject`) — used by both entity route pairs.
- New shared client helper `uploadViaSignedUrl()` in `_attachment-dropzone.tsx`. `uploadFileWithProgress()` kept — comment attachments still use it (deferred).
- `next.config.ts` + `CLAUDE.md` notes updated to record the Vercel 4.5 MB platform cap and the direct-upload pattern.

### Files Changed
- `src/lib/uploads/attachment-storage.ts` — **new**; signed-upload-URL mint + ranged-read verification.
- `src/app/api/v2/projects/[projectId]/issues/[issueId]/attachments/sign/route.ts` — **new**; issue signed-URL endpoint (all pre-upload gate checks).
- `src/app/api/v2/projects/[projectId]/issues/[issueId]/attachments/route.ts` — `POST` now JSON `{ path, filename, size }` + `verifyUploadedObject`; `GET` untouched. Header comment + imports updated.
- `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/sign/route.ts` — **new**; task equivalent (privileged/own-task check).
- `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/route.ts` — same `POST` rewrite as the issue route.
- `src/app/(hub)/projects/_shared/_attachment-dropzone.tsx` — added `uploadViaSignedUrl()` + `readError()` helper.
- `src/app/(hub)/projects/v2/[projectId]/issues/[issueId]/_issue-attachments.tsx` — queue callback → `uploadViaSignedUrl`.
- `src/app/(hub)/projects/legacy/[projectId]/issues/[issueId]/_issue-attachments.tsx` — same.
- `src/app/(hub)/projects/_shared/_create-issue-modal.tsx` — same.
- `src/app/(hub)/projects/_shared/_create-task-modal.tsx` — same.
- `next.config.ts` — `proxyClientMaxBodySize` comment updated (behaviour unchanged).
- `CLAUDE.md` — large-request-body convention bullet updated.

### Deviations From Plan
- Plan floated a `src/lib/uploads/verify-file.ts` change — not needed; `verifyFile()` already works on a partial buffer, so the 64 KB ranged read feeds it unchanged.
- `signedUrl` from `createSignedUploadUrl` is already an **absolute** URL in `@supabase/storage-js` 2.108.2, so the client PUTs to it directly — no need to prepend `NEXT_PUBLIC_SUPABASE_URL` as the plan's Code Context sketch assumed.
- PUT progress is capped at 95% with the final 5% credited on successful register, so the bar never sits at 100% during the verify round-trip.
- Impeccable design hook flagged pre-existing `text-[Npx]` literals in every touched UI file (lines I did not add). Left unchanged — they predate this task and match the codebase's documented hand-rolled pill/label convention (CLAUDE.md "UI Polish Conventions" explicitly rejects forcing these onto a formal type ramp).

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (0 errors; 2 pre-existing warnings in an unrelated file `_checklist-tab.tsx`)
- Browser acceptance (large-file upload success, corrupt-file rejection + no orphan object, 403 for non-privileged user, 11th-file cap, New Issue/New Task modal flows, legacy route) — **NOT RUN**. Local `pnpm dev` has no 4.5 MB cap so it can't demonstrate the regression; the fix should be confirmed on a Vercel preview deploy with a >5 MB file.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. New code is typed (no `any` escape hatches — `body?.path` etc. are narrowed with `typeof` guards), uses guard-clause style consistent with the sibling routes, and reuses the existing `verifyFile()` / `attachment-types` config rather than re-deriving limits.
- `src/lib/uploads/attachment-storage.ts` is server-only (imports `file-type` transitively via `verify-file.ts`) and is imported solely by the four route handlers — correct; must never be pulled into a Client Component.
- Error handling is intentional throughout: every early-return in the register step that has already been preceded by a successful Storage PUT removes the object first (`unsupported type`, `MAX_FILES`, verify failure via `verifyUploadedObject`, insert failure). No `console.log` debug noise; the two `console.error` calls match the pre-existing route style.
- Client helper matches the codebase's hand-rolled-fetch + inline-error convention (no new deps, no `sonner`/`react-hook-form`). Progress-bar behaviour (cap 95% during PUT, 100% on register) is a reasonable UX choice.
- Impeccable `design-system-font-size` hook fired on all touched UI files — verified every flagged line is a pre-existing `text-[Npx]` literal not introduced by this task; consistent with CLAUDE.md "UI Polish Conventions" (hand-rolled pill/label sizes are explicitly not forced onto a type ramp here). No action.

### Deviations
- **Medium — new orphaned-object failure mode.** If the browser completes the Storage PUT but never reaches the register call (tab closed, network drop, hard nav), the object stays in `project-assets` with no `attachments` row. The old multipart flow could not orphan an object this way. Blast radius is bounded (per-entity timestamped paths, 200 MB bucket `file_size_limit`), frequency is low, and it never surfaces in any UI (the GET only lists registered rows). Acceptable to ship; a periodic sweep of unreferenced `issues/`/`tasks/` objects older than a few hours is a reasonable follow-up. Documented here and in CLAUDE.md's follow-up note.
- **Minor — `size` not re-validated at register.** The register POST trusts the client-reported `size` for the `attachments.size` column and does not re-check `> MAX_FILE_SIZE`. The sign route checks it, and the bucket's own 200 MB `file_size_limit` is the hard server-side backstop on the actual PUT (equal to `MAX_FILE_SIZE`), so an oversized file cannot actually land. `attachments.size` was already client-derived (`file.size` from multipart) before this change — no regression.
- **Minor — plan Code Context assumed `signedUrl` needed `NEXT_PUBLIC_SUPABASE_URL` prepended.** `@supabase/storage-js` 2.108.2 returns an absolute URL, so the client PUTs to it directly. Recorded in Implementation Notes.
- All other differences from the plan (no `verify-file.ts` change needed; 95%/100% progress split) are Minor and already in Implementation Notes.

### Required Fixes
- None.
