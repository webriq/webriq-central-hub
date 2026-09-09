# 350: Fix "Upload failed (413)" on Projects → Files Tab — Browser-Direct Upload to Supabase Storage

**Created:** 2026-09-08
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** deep
**Status:** Completed (2026-09-08) — marked complete at the user's explicit request; browser acceptance on a Vercel preview is the outstanding manual check.

---

## Overview

Uploading a file on the project **Files** tab fails with **`Upload failed (413)`** for
anything larger than ~4.5 MB. In the bug report (project WMFA), a 3.9 MB `.jpg` and a 1.2 MB
`.docx` uploaded fine; four other `.jpg` files — each around 4.5–5 MB — all failed with a bare
`413`.

**Root cause.** Identical to task 339 (issue/task attachments), a different surface. The Files
tab sends the file as `multipart/form-data` via XHR to the Next route handler
`POST /api/customers/[customerId]/assets/upload` (`_upload-queue.tsx` → `uploadFileWithProgress`,
called from `_shared/_files-tab.tsx` `handleUpload`). In production (Vercel) the platform
gateway rejects any Route-Handler **request body over ~4.5 MB** with HTTP `413`
(`x-vercel-error: FUNCTION_PAYLOAD_TOO_LARGE`) *before the handler runs*. The route's own
`MAX_FILE_SIZE = 25 * 1024 * 1024` check never executes, so the user gets the raw status code
instead of a helpful message. `next.config.ts`'s `experimental.proxyClientMaxBodySize` only
raises the cap for Next's own `proxy.ts` body buffering in local dev — it has no effect on
Vercel's platform limit. The client-side and server-side "25 MB" limits are both dead letters
in production; the real ceiling is ~4.5 MB.

`uploadFileWithProgress()` surfaces any non-2xx status verbatim as `Upload failed (<status>)`,
which is the exact string in the screenshot.

**Fix.** Same shape as task 339. Stop routing file bytes through the Next handler. The browser
uploads the file **directly to Supabase Storage** via a short-lived **signed upload URL**; a new
tiny JSON `sign` handler runs the existing auth / role / MIME / size checks and mints the URL.
The already-existing `POST /api/customers/[customerId]/assets` "register" call (which creates the
`customer_assets` row) is unchanged — the Files tab upload is *already* a two-step flow, so only
the storage-upload leg moves off the handler.

## Requirements

- [ ] File uploads on the project Files tab succeed for files well over 4.5 MB (test with a
      ~15–25 MB image), in production-equivalent conditions.
- [ ] Server still enforces, before issuing the signed URL: authentication, the
      `admin | super_admin | pm | marketing` write-role check, the `ALLOWED_MIME_TYPES`
      allowlist, and `MAX_FILE_SIZE` (25 MB) — all lifted verbatim from the current
      `assets/upload/route.ts`.
- [ ] Storage path is still **server-generated** (`{customerId}/[{projectId}/]{timestamp}_{safeName}`)
      — the client never chooses the path.
- [ ] `POST /api/customers/[customerId]/assets` (register) rejects a `type: "file"` payload whose
      `file_path` does not start with `${customerId}/` (defense against a client registering a
      cross-customer or arbitrary storage object).
- [ ] Per-file upload **progress %** in `UploadQueuePanel` still works (the direct PUT is
      instrumented with `xhr.upload.onprogress`).
- [ ] Both callers that share `_upload-queue.tsx` are migrated: the project Files tab
      (`_shared/_files-tab.tsx`) **and** the onboarding-workspace Files tab
      (`onboarding-workspace/_onboarding-wizard-v2.tsx`).
- [ ] The **Customers → Assets** tab (`customers/[customerId]/client.tsx` `handleAddAsset`) —
      same latent bug, one plain-`fetch` call site — is migrated too (no progress bar there;
      it can call the helper without an `onProgress` callback).
- [ ] The old multipart `POST /api/customers/[customerId]/assets/upload` route keeps working
      (the legacy v2 onboarding wizard still uses it — see Out of Scope) but gains a comment
      pointing at the `sign` route as the preferred path.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.
- [ ] Folder create/rename/delete, asset delete, move, permission changes, the file-URL signed
      download, and the `.docx`/`.md` generate flows all still work unchanged.
- [ ] `CLAUDE.md` — the task-339 direct-upload convention note is extended to record that the
      customer-assets Files tab now uses the same pattern.

## Out of Scope / Must-Not-Change

- **Legacy v2 onboarding wizard** — `src/app/(hub)/projects/v2/[projectId]/_onboarding-wizard.tsx`.
  It has its own inline `uploadFileWithProgress` and 6+ call sites (logo, favicon, brand assets,
  documents, migration files) against `/assets/upload`. Most of those are small branding images,
  but **document uploads there can exceed 4.5 MB and will 413** — this is a real latent bug, but
  migrating a 1,900-line file with 6 call sites is a separate task. Documented follow-up below.
- `src/app/_hub_(OLD)/customers/[customerId]/client.tsx` — dead route tree, untouched.
- **Magic-byte / corruption verification** (`verifyFile` / `verifyUploadedObject`). The
  customer-assets upload path has *never* run this — it only checks the client-reported
  `file.type` against `ALLOWED_MIME_TYPES`. Adding real content verification to customer assets
  is a separate hardening task; this task keeps parity (no new verification).
- The `customer_assets` table schema, the `customer-assets` storage bucket config / RLS
  policies, `src/app/api/customers/[customerId]/assets/folders/**`, `.../[assetId]/**`,
  `.../file-url`, `.../content`, `.../generate-md` — no changes.
- `GET` / `DELETE` on `assets/route.ts` — no changes (only the `POST` register guard is added).
- Do not remove `experimental.proxyClientMaxBodySize` from `next.config.ts` (still governs other
  multipart routes); only touch its comment if it references this surface.
- Do not delete `uploadFileWithProgress` from `_upload-queue.tsx` — the legacy wizard's copy is
  separate, but the shared helper may still be referenced; only add the new helper alongside it.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/uploads/customer-asset-storage.ts` | Create | Server helper `createCustomerAssetUploadUrl(storagePath)` → `{ path, token, signedUrl }` via `adminClient.storage.from("customer-assets").createSignedUploadUrl(path)`. Mirrors `attachment-storage.ts` but for the private `customer-assets` bucket and using `adminClient` (matches the existing route, which already uses `adminClient` for this bucket's writes). No `verifyUploadedObject` equivalent (see Out of Scope). |
| `src/app/api/customers/[customerId]/assets/upload/sign/route.ts` | Create | `POST` — auth + write-role check + `ALLOWED_MIME_TYPES` + `MAX_FILE_SIZE` checks (all lifted from `../route.ts`), builds the same server-side `storagePath` (incl. the `project_id` nesting branch), returns `createCustomerAssetUploadUrl(storagePath)`. Body: `{ filename, size, mimeType, project_id? }`. |
| `src/app/api/customers/[customerId]/assets/upload/route.ts` | Modify | Comment only — note the `sign` route is the preferred path and the multipart POST remains for the legacy onboarding wizard. Behaviour unchanged. |
| `src/app/api/customers/[customerId]/assets/route.ts` | Modify | `POST`: when `type === "file"`, reject if `file_path` doesn't start with `${customerId}/`. One guard clause, no other change. |
| `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_upload-queue.tsx` | Modify | Add `uploadViaSignedUrl(signUrl, file, projectId, onProgress?)`: (1) `POST signUrl` `{ filename, size, mimeType, project_id }`; (2) XHR `PUT` the `File` to `signedUrl` with `x-upsert: false` + `Content-Type`, wiring `xhr.upload.onprogress`; (3) resolve `{ path, filename, size, mimeType }` — same shape the current `uploadFileWithProgress` result has, so callers change one line. Keep `uploadFileWithProgress` in place. |
| `src/app/(hub)/projects/_shared/_files-tab.tsx` | Modify | `handleUpload` → call `uploadViaSignedUrl('/api/customers/${customerId}/assets/upload/sign', file, projectId, onProgress)` instead of building `FormData` + `uploadFileWithProgress`. Register `POST` unchanged. |
| `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_onboarding-wizard-v2.tsx` | Modify | Same one-line `handleUpload` swap (near-identical function). |
| `src/app/(hub)/customers/[customerId]/client.tsx` | Modify | `handleAddAsset` file branch → `uploadViaSignedUrl` (imported from `_upload-queue.tsx`), no `onProgress`. Replaces the inline `fetch('.../assets/upload', { FormData })`. |
| `CLAUDE.md` | Modify | Extend the task-339 "Route handlers accepting large request bodies" / direct-upload note to cover the customer-assets Files tab. |

## Code Context

### Current failing path

`src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_upload-queue.tsx`:

```ts
export function uploadFileWithProgress(url, formData, onProgress?): Promise<{ path; filename; size; mimeType }> {
  // XHR POST multipart → route handler. Maps any non-2xx to new Error(`Upload failed (${xhr.status})`).
}
```

`src/app/(hub)/projects/_shared/_files-tab.tsx` (and the near-identical `_onboarding-wizard-v2.tsx`):

```ts
async function handleUpload(file: File, folderId: string, onProgress?: (pct: number) => void) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("project_id", projectId);
  const uploaded = await uploadFileWithProgress(`/api/customers/${customerId}/assets/upload`, formData, onProgress);
  const assetRes = await fetch(`/api/customers/${customerId}/assets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "file", label: uploaded.filename, file_path: uploaded.path, file_name: uploaded.filename,
      file_size: uploaded.size, file_mime_type: uploaded.mimeType, phase_number: 1, project_id: projectId, folder_id: folderId,
    }),
  });
  // ... setAssets(...)
}
```

Client-side size guard that is *also* dead in prod (the 413 pre-empts it) —
`onboarding-workspace/_files-tab.tsx`:

```ts
const MAX_FILE_SIZE = 25 * 1024 * 1024;
const MAX_SIZE_LABEL = "25 MB";
// handleFiles(): if (file.size > MAX_FILE_SIZE) setRejectedFile({ ... "exceeds the 25 MB limit" })
```

### Current route — `src/app/api/customers/[customerId]/assets/upload/route.ts` (`POST`)

Checks to lift into `sign`:

```ts
const { data: { user } } = await supabase.auth.getUser();
if (!user) return 401;
const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
const myRole = profile?.role;
if (myRole !== "admin" && myRole !== "super_admin" && myRole !== "pm" && myRole !== "marketing") return 403;

if (!ALLOWED_MIME_TYPES.includes(file.type)) return 400 "Unsupported file type: ...";
if (file.size > MAX_FILE_SIZE) return 400 "File size exceeds 25MB limit (...)";

const timestamp = Date.now();
const safeFilename = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
const storagePath = projectId
  ? `${customerId}/${projectId}/${timestamp}_${safeFilename}`
  : `${customerId}/${timestamp}_${safeFilename}`;

// then: adminClient.storage.from("customer-assets").upload(storagePath, buffer, { contentType: file.type, upsert: false });
// return { path: storagePath, filename: file.name, size: file.size, mimeType: file.type }
```

`ALLOWED_MIME_TYPES` = images (jpeg/png/gif/webp/svg), pdf, msword + docx, xls + xlsx,
text/html, text/markdown, text/plain, text/csv. **Move this constant to the shared helper or a
small shared module** so `sign` and the legacy multipart route stay in lockstep.

### Register route — `src/app/api/customers/[customerId]/assets/route.ts` (`POST`)

Already a JSON handler. Add near the existing `type === "file"` validation:

```ts
if (type === "file" && (!file_path || !file_name)) {
  return NextResponse.json({ error: "file_path and file_name are required for file assets" }, { status: 400 });
}
// NEW — the storage path is server-generated by the sign route; never trust a path outside this customer's tree
if (type === "file" && !file_path!.startsWith(`${customerId}/`)) {
  return NextResponse.json({ error: "Invalid file path" }, { status: 400 });
}
```

### Signed upload URL — reference from task 339 `src/lib/uploads/attachment-storage.ts`

```ts
const { data } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storagePath);
// data => { signedUrl (absolute URL in @supabase/storage-js 2.108.2), token, path }

// browser PUT (raw XHR for progress; uploadToSignedUrl has no progress cb):
xhr.open("PUT", data.signedUrl);
xhr.setRequestHeader("x-upsert", "false");
xhr.setRequestHeader("Content-Type", mime);
xhr.upload.onprogress = (e) => onProgress?.(Math.round((e.loaded / e.total) * 100));
xhr.send(file);
```

Use `adminClient` (not the request's session client) for `createSignedUploadUrl` here —
`assets/upload/route.ts` already uses `adminClient` for every `customer-assets` bucket op and
notes the bucket's write-RLS is service-level. The `sign` route does its own role gate first.

### Buckets — note the naming

Table `customer_assets` (underscore); bucket `customer-assets` (hyphen); bucket
`file_size_limit` is 25 MB and is the outer hard stop on the direct PUT regardless of the
`sign` route's check.

## Implementation Steps

1. **Confirm the 413 origin** (sanity check, not a blocker): reproduce on a Vercel deploy,
   open the failed `assets/upload` request in the Network tab, confirm `413` +
   `x-vercel-error: FUNCTION_PAYLOAD_TOO_LARGE` (or `Content-Length` > ~4.5 MB).
2. Create `src/lib/uploads/customer-asset-storage.ts`: export `ALLOWED_MIME_TYPES` (moved from
   `assets/upload/route.ts`), `MAX_FILE_SIZE`, `buildCustomerAssetPath({ customerId, projectId, filename })`,
   and `createCustomerAssetUploadUrl(storagePath)` (uses `adminClient`).
3. Update `assets/upload/route.ts` to import `ALLOWED_MIME_TYPES` / `MAX_FILE_SIZE` /
   `buildCustomerAssetPath` from the new module (no behaviour change) + add the "prefer the
   sign route" comment.
4. Create `src/app/api/customers/[customerId]/assets/upload/sign/route.ts`: `POST`, parse
   `{ filename, size, mimeType, project_id? }`; auth + role + `ALLOWED_MIME_TYPES` + `MAX_FILE_SIZE`
   checks; `buildCustomerAssetPath(...)`; return `createCustomerAssetUploadUrl(path)` as
   `{ path, token, signedUrl }`.
5. Add the `file_path` prefix guard to `assets/route.ts` `POST`.
6. Add `uploadViaSignedUrl()` to `_upload-queue.tsx` (raw XHR PUT with progress); export
   alongside `uploadFileWithProgress`.
7. Swap the one line in `_shared/_files-tab.tsx` `handleUpload` and
   `onboarding-workspace/_onboarding-wizard-v2.tsx` `handleUpload`.
8. Swap the file branch of `customers/[customerId]/client.tsx` `handleAddAsset` to
   `uploadViaSignedUrl` (no `onProgress`).
9. Update the `CLAUDE.md` note.
10. `npx tsc --noEmit`, `pnpm lint`.
11. Browser acceptance test (below).

## Acceptance Criteria

- [ ] Project → Files: uploading a ~20 MB PNG succeeds, shows live progress %, and appears in
      the folder grid with the correct size and type tile.
- [ ] Onboarding-workspace → Files tab: same, into a Phase 1 folder.
- [ ] Customers → Assets → Add Asset (type File): a ~20 MB PDF uploads and the asset row is
      created.
- [ ] A file whose type is not in `ALLOWED_MIME_TYPES` (e.g. `.zip`) is rejected at the `sign`
      step with the existing "Unsupported file type" message; no storage object is created.
- [ ] A > 25 MB file is rejected at the `sign` step with "File size exceeds 25MB limit"; if it
      somehow reaches the PUT, the bucket's own 25 MB `file_size_limit` rejects it.
- [ ] A `client` / `developer` / unauthenticated user gets `403` / `401` from the `sign` route
      and never receives a signed URL.
- [ ] Calling `POST /assets` directly with `type: "file"` and `file_path: "WRQ-OTHER-0001/x"`
      returns `400 "Invalid file path"`.
- [ ] Folder create/rename/delete, asset delete/move/permission-change, signed download, and
      the generate-md flow all still work.
- [ ] `npx tsc --noEmit` + `pnpm lint` clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # browser-test the flows above:
           #   /projects/v2/<projectId> → Files tab
           #   /projects/v2/<projectId>/onboarding-workspace → Files tab
           #   /customers/<customerId> → Assets → Add Asset (File)
```

Production-equivalent size check: local `pnpm dev` has no 4.5 MB cap, so the *regression* (large
upload works) must be reasoned about from the mechanism (no file bytes touch the Next handler)
and ideally confirmed on a Vercel preview deploy with a > 5 MB file.

## Compatibility Touchpoints

- **Env:** `NEXT_PUBLIC_SUPABASE_URL` is already public; `createSignedUploadUrl` returns an
  absolute URL in the pinned `@supabase/supabase-js@2.104.1` / `storage-js` — no new vars.
- **Supabase JS:** `createSignedUploadUrl` supported in the pinned version.
- **Storage RLS / bucket:** unchanged; `customer-assets` bucket `file_size_limit` (25 MB) stays
  the outer hard stop.
- **`CLAUDE.md`:** direct-upload convention note extended.
- **Docs:** none beyond `CLAUDE.md`.
- **Follow-up (not this task):**
  - Migrate `src/app/(hub)/projects/v2/[projectId]/_onboarding-wizard.tsx` (6+ `/assets/upload`
    call sites, own inline helper) to `uploadViaSignedUrl` — its document uploads have the same
    413 bug.
  - Orphaned-object risk: a browser that completes the PUT but never reaches the `POST /assets`
    register call leaves an unreferenced object in `customer-assets` (same trade-off task 339
    accepted for `project-assets`). A periodic sweep of unreferenced `customer-assets` objects
    is a shared follow-up with task 339's note.
  - Optionally add real content verification (`verifyFile` on a ranged read) to customer-asset
    uploads — never existed on this path.

## Implementation Notes

### What Changed
- Customer-asset uploads no longer stream the file through the Next route handler
  `POST /api/customers/[customerId]/assets/upload` as multipart — which 413s at Vercel's
  ~4.5 MB gateway cap before the handler's 25 MB check runs. New flow:
  1. Browser `POST`s `{ filename, size, mimeType, project_id? }` to the new
     `POST /api/customers/[customerId]/assets/upload/sign` route → runs auth + write-role
     (`admin | super_admin | pm | marketing`) + `ALLOWED_MIME_TYPES` + `MAX_FILE_SIZE` (25 MB)
     checks (lifted verbatim), builds the server-side storage path, returns
     `{ path, token, signedUrl }` from `createSignedUploadUrl()`.
  2. Browser `PUT`s the raw `File` straight to the absolute `signedUrl` (private
     `customer-assets` bucket) via an instrumented `XMLHttpRequest` so the per-file progress
     bar still works. No Vercel body cap on this leg.
  3. Browser runs its existing (unchanged) `POST /api/customers/[customerId]/assets` register
     call to create the `customer_assets` row.
- New shared server helper `src/lib/uploads/customer-asset-storage.ts` — `ALLOWED_MIME_TYPES`,
  `MAX_FILE_SIZE`, `buildCustomerAssetPath()`, `createCustomerAssetUploadUrl()` (uses
  `adminClient`, matching the multipart route's existing bucket access). No `verifyUploadedObject`
  equivalent — parity, the customer-asset path never had content verification.
- New shared client helper `uploadViaSignedUrl()` in `onboarding-workspace/_upload-queue.tsx`,
  returning the same `{ path, filename, size, mimeType }` shape `uploadFileWithProgress()` did so
  each caller changed one line. `uploadFileWithProgress()` kept — the legacy v2 onboarding wizard
  still uses the multipart route.
- `POST /assets` (register) now rejects a `type: "file"` payload whose `file_path` doesn't start
  with `${customerId}/`.
- The legacy multipart `assets/upload/route.ts` now imports the shared constants +
  `buildCustomerAssetPath()` (behaviour unchanged) and carries a "prefer ./sign" comment.
- `CLAUDE.md` task-339 direct-upload note extended to cover the customer-assets surface.

### Files Changed
- `src/lib/uploads/customer-asset-storage.ts` — **new**; MIME allowlist + size const + path
  builder + signed-upload-URL mint (adminClient, `customer-assets` bucket).
- `src/app/api/customers/[customerId]/assets/upload/sign/route.ts` — **new**; signed-URL endpoint
  with all pre-upload gate checks.
- `src/app/api/customers/[customerId]/assets/upload/route.ts` — imports shared constants +
  `buildCustomerAssetPath`; "prefer ./sign" comment. No behaviour change (kept for legacy wizard).
- `src/app/api/customers/[customerId]/assets/route.ts` — `POST` gains the `file_path` must-start-
  with-`${customerId}/` guard for `type: "file"`.
- `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_upload-queue.tsx` — added
  `uploadViaSignedUrl()`; `uploadFileWithProgress()` untouched.
- `src/app/(hub)/projects/_shared/_files-tab.tsx` — `handleUpload` → `uploadViaSignedUrl`; import swap.
- `src/app/(hub)/projects/v2/[projectId]/onboarding-workspace/_onboarding-wizard-v2.tsx` — same
  one-line `handleUpload` swap; import swap. HTML-mockup MD-generation follow-up (uses
  `uploaded.mimeType`) unaffected.
- `src/app/(hub)/customers/[customerId]/client.tsx` — `handleAddAsset` file branch →
  `uploadViaSignedUrl` (no `onProgress`); import added; stale allowlist-source comment repointed.
- `CLAUDE.md` — large-request-body / direct-upload note extended.

### Deviations From Plan
- Plan named the helper module `customer-asset-storage.ts` with a `createCustomerAssetUploadUrl`
  taking a `supabase` client arg (mirroring `attachment-storage.ts`). Implemented it to use
  `adminClient` directly instead — the multipart route already uses `adminClient` for every
  `customer-assets` bucket op (service-level write RLS), and the `sign` route does its own
  role gate first. One fewer arg to thread; consistent with the existing route.
- `uploadViaSignedUrl` signature is positional `(signUrl, file, projectId?, onProgress?)` rather
  than task 339's options-object form, and it does **not** perform the register `POST` (each
  customer-asset caller's register call differs — label, phase_number, folder_id, plus the
  onboarding wizard's HTML-mockup post-processing). It returns the upload metadata and the caller
  runs its own existing `POST /assets`. Kept progress as a straight 0–100 on the PUT (no 95/100
  split — there's no helper-owned register step to reserve the tail for; `useUploadQueue` sets
  100 when the whole `handleUpload` promise resolves).
- Confirmed `@supabase/storage-js@2.108.2` `createSignedUploadUrl` returns an **absolute**
  `signedUrl` (`new URL(this.url + data.url).toString()`), so the browser PUTs to it directly —
  no `NEXT_PUBLIC_SUPABASE_URL` prepend needed.
- **Orphaned-object failure mode** (same as task 339): a browser that completes the PUT but never
  reaches the register `POST` leaves an unreferenced object in `customer-assets`. Bounded by the
  per-customer/timestamped paths + the bucket's 25 MB limit; no UI ever lists it. Sweep is a
  documented follow-up.
- Impeccable `design-system-font-size` / `gray-on-color` hooks fired on all four touched UI files
  — every flagged line is a pre-existing `text-[Npx]` literal / existing colored-badge style not
  introduced by this task (line numbers shifted by the added imports/helper). Left unchanged, per
  CLAUDE.md "UI Polish Conventions" (hand-rolled pill/label sizes are explicitly not forced onto a
  type ramp here) — same disposition as task 339.

### Verification Run
- `npx tsc --noEmit` — PASS
- `pnpm lint` — PASS (0 errors; 2 pre-existing unrelated warnings in `_checklist-tab.tsx`)
- Browser acceptance (large-file upload success on all three surfaces, unsupported-type + >25MB
  rejection at the sign step, 401/403 for unauthorized roles, `POST /assets` cross-customer
  `file_path` rejection, folder/delete/move/permission/generate-md regressions) — **NOT RUN**.
  Local `pnpm dev` has no 4.5 MB cap so it can't demonstrate the regression; confirm on a Vercel
  preview deploy with a >5 MB file.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. New code is typed (no `any` annotations; `body?.filename` etc. narrowed
  with `typeof` guards), uses guard-clause style consistent with the sibling routes, and the
  shared `customer-asset-storage.ts` re-homes the MIME allowlist / size const so the `sign` and
  legacy multipart routes cannot drift.
- `src/lib/uploads/customer-asset-storage.ts` is server-only (imports `@/lib/supabase/admin`)
  and is imported solely by the two route handlers — correct; must never be pulled into a Client
  Component. The client helper lives separately in `_upload-queue.tsx`.
- Error handling is intentional: the `sign` route try/catch + `console.error` matches the
  sibling route's existing style; `uploadViaSignedUrl` maps every failure leg (sign non-2xx,
  non-JSON body, PUT non-2xx, network) to a user-facing `Error` message. No `console.log` debug
  noise, no secrets.
- `uploadViaSignedUrl` was simplified from a `.then(async …)` chain to a flat `async function`
  during the gate (matches the `uploadFileWithProgress` neighbour and task 339's helper). `tsc`
  + `lint` re-run clean after.
- The new `POST /assets` `file_path` prefix guard was checked against every live `type: "file"`
  caller (project Files tab, onboarding-workspace, legacy wizard, Customers → Assets tab): all
  receive a server-generated path starting with `${customerId}/`, so none regress. `generate-md`
  inserts `customer_assets` rows directly (not via this route) and is unaffected.
- Impeccable `design-system-font-size` fired on `_upload-queue.tsx` L159/L203 and
  `gray-on-color` / `design-system-font-size` on the other touched UI files — every flagged line
  is a pre-existing `text-[Npx]` literal / existing badge style, not introduced here (line
  numbers shifted by the added imports/helper). Left unchanged per CLAUDE.md "UI Polish
  Conventions" — same disposition as task 339. No action.

### Deviations
- **Medium — orphaned-object failure mode** (identical to task 339, now on `customer-assets`).
  A browser that completes the Storage PUT but never reaches its own `POST /assets` register
  call leaves an unreferenced object in the bucket. The old multipart flow could not orphan this
  way. Blast radius bounded (per-customer/timestamped paths, 25 MB bucket limit), never surfaces
  in any UI (asset lists only show registered rows). Acceptable to ship; a periodic sweep of
  unreferenced `customer-assets` objects is a documented follow-up shared with task 339's note.
- **Minor — `size` / `mimeType` trusted at register.** `POST /assets` writes the client-reported
  `file_size` / `file_mime_type` without re-checking. The `sign` route validates both, and the
  bucket's 25 MB `file_size_limit` is the hard backstop on the actual PUT. These columns were
  already client-derived (`file.size` / `file.type` from multipart) before this change — no
  regression.
- **Minor — helper uses `adminClient` directly** instead of a threaded `supabase` client arg
  (plan sketch mirrored `attachment-storage.ts`). The multipart route already does this for the
  `customer-assets` bucket; the `sign` route gates on role first. Recorded in Implementation Notes.
- **Minor — positional helper signature + no register call inside the helper** (each caller's
  `POST /assets` differs). Recorded in Implementation Notes.

### Required Fixes
- None.
