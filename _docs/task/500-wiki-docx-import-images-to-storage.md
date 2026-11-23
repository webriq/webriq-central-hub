# 500: Wiki .docx import uploads embedded images to Storage + RTE paste/drop image polish

**Created:** 2026-11-23
**Priority:** MEDIUM
**Type:** bugfix + enhancement
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

Right now, importing a `.docx` into the Wiki keeps its images only by accident, and they are fragile:

1. mammoth's default `convertToHtml` puts every embedded image inline as a base64 `data:` URI (`src/app/(hub)/wiki/_wiki-import-modal.tsx:143`). DOMPurify keeps these, and they are saved into `wiki_pages.content_html`.
2. The wiki editor registers Tiptap `Image` without options (`_wiki-rte.tsx:76`). The default is `allowBase64: false`, and its parse rule is `img[src]:not([src^="data:"])` (`node_modules/@tiptap/extension-image/dist/index.js:16,38`). So when someone opens an imported page in **Edit** and saves, **every imported image is lost without any warning**.
3. The base64 images travel inside the JSON body of `POST /api/wiki/pages` (`_wiki-import-modal.tsx:208-212`). A `.docx` with a few photos goes over Vercel's ~4.5 MB limit and the import fails with a 413 (CLAUDE.md "Uploads above ~4.5 MB must not go through a Route Handler").

The fix: during conversion, upload each embedded image browser-direct into the private `wiki-assets` bucket, using the existing sign route (task 395). The page HTML then stores the stable `/api/wiki/assets/{pageId}/{file}` URL, the same as a pasted image.

Manual embedding in the RTE (paste from the clipboard, drag and drop in Edit) **already exists** (`_wiki-rte.tsx:117-131`, task 395). This task keeps that and fixes its gaps:
- failures are silently dropped (`:63`, `:68`)
- there's no uploading indicator
- a drop inserts at the old cursor, not where the image was dropped
- only the first image of a multi-file paste or drop is used

## Requirements

### A. `.docx` import: images go to Storage
- [ ] The import modal generates the page id up front, `const pageId = crypto.randomUUID()`, so images can be uploaded under `wiki-assets/{pageId}/` before the page row exists. Neither the sign route nor the asset read route checks that the page exists (they gate on role + path only, see Code Context), so this works without a schema change.
- [ ] `POST /api/wiki/pages` accepts an optional `id`. If present, it must match `UUID_RE`, otherwise return 400 `"Invalid id"`. It is passed to the `insert`. If absent, behaviour is unchanged (DB default). A duplicate id hits a PK conflict (`23505`), which returns 409, not 500.
- [ ] `.docx` branch: `mammoth.convertToHtml({ arrayBuffer }, { convertImage: mammoth.images.imgElement(async (image) => …) })`, and for each image:
  - read the bytes with `image.read()` and build a `File`/`Blob` with `image.contentType`
  - if `contentType` is not one of `image/jpeg|png|gif|webp` (the sign route's allow-list, e.g. Word's `x-emf`/`x-wmf`/`tiff`), **skip** it: return `{ src: "" }` and count it as skipped
  - otherwise call the same sign → `putToSignedUrl` → `url` flow as `uploadAndInsertImage` in `_wiki-rte.tsx:54-70`, with filename `docx-image-{n}.{ext}`, and return `{ src: url }`
  - if uploading one image fails, skip that image and count it. The import itself does not fail.
- [ ] After conversion, remove `<img>` elements with an empty `src` before DOMPurify runs, so no broken-image boxes are left behind.
- [ ] Images upload **one at a time** (mammoth calls `convertImage` in document order). The modal shows a new stage `uploadingImages`: `"Uploading images… {done}/{total}"`. `total` is unknown up front, so show `"Uploading images… {done}"`.
- [ ] If any images were skipped, the page is still created, and the modal fires `toast.warning("{n} image(s) couldn't be imported (unsupported format or upload failed)")` before `onCreated`.
- [ ] The final `contentHtml` sent to `POST /api/wiki/pages` contains **no** `data:` URIs.

### B. RTE paste / drop (Edit mode)
- [ ] **Uploading indicator:** a count of images in flight. While it's above 0, the toolbar shows `Loader2` + `"Uploading image…"`, with `aria-live="polite"`.
- [ ] **Errors:** on a sign failure (non-OK response), show `toast.error(body.error ?? "Image upload failed")`. Network or Storage failures get the same toast. No more silent drops.
- [ ] **Drop position:** `handleDrop` uses `view.posAtCoords({ left: event.clientX, top: event.clientY })` and inserts at that position with `insertContentAt(pos, { type: "image", attrs: { src } })`. If `posAtCoords` returns null, insert at the cursor as today.
- [ ] **Multiple files:** paste and drop handle **all** image files, uploaded one at a time and inserted in order. Non-image files are still ignored, and the handler returns `false` when there are no images, so normal text/HTML paste is unaffected.
- [ ] Still no `allowBase64`. Images stay URL-only by design.

## Out of scope / must not change
- `.md` import (external URLs already work; relative paths can't be resolved from a single file) and `.pdf` import (text/AI-only by design, task 396/398).
- Pasting rich HTML that contains `data:` images (e.g. copying a block from Word into the RTE). Tiptap will still drop those. NON-BLOCKING D2.
- Cleaning up orphaned `wiki-assets` objects if an import fails after its images were uploaded. Same accepted behaviour as pasting an image and then discarding the edit.
- Migrating existing pages that already hold `data:` images. NON-BLOCKING D3.
- The sign route, the asset read route, the bucket, and the storage policies (migration 153): no changes.
- No `allowBase64: true`.

## Proposed File Changes
| File | Change |
|---|---|
| `src/app/(hub)/wiki/_wiki-import-modal.tsx` | `pageId` generated up front, `convertImage` upload, empty-img strip, `uploadingImages` stage, skipped-count toast, `id` in POST body |
| `src/app/api/wiki/pages/route.ts` | optional validated `id` on POST; 23505 → 409 |
| `src/app/(hub)/wiki/_wiki-rte.tsx` | uploading state + indicator, error toasts, drop-at-coords, multi-file |
| (maybe) a shared `uploadWikiImage(pageId, file): Promise<string>` in `src/lib/wiki/` | only if A and B would otherwise duplicate the sign→PUT code. Prefer extracting it (two callers). It throws on failure, and each caller decides between a toast and a skip. |

## Code Context
- Sign route `src/app/api/wiki/pages/[pageId]/description-images/sign/route.ts`: checks `UUID_RE` on pageId and role `admin|super_admin|pm|developer`; MIME is `jpeg|png|gif|webp`; max 50MB. It **does not check that the page exists**. It returns `{ signedUrl, url: "/api/wiki/assets/{pageId}/{ts}_{safeName}" }`.
- Asset read route `src/app/api/wiki/assets/[pageId]/[filename]/route.ts`: session + role (`+hr`), then a 302 to a 1h signed URL. It also doesn't look up the page.
- Existing RTE upload `_wiki-rte.tsx:54-70`:
  ```ts
  const res = await fetch(`/api/wiki/pages/${pageId}/description-images/sign`, { method: "POST", … body: JSON.stringify({ filename: file.name, size: file.size, type: file.type }) });
  if (!res.ok) return; // silently drop
  const { signedUrl, url } = await res.json();
  await putToSignedUrl({ signedUrl, file, mime: file.type });
  editor?.chain().focus().setImage({ src: url }).run();
  ```
- Paste/drop handlers: `_wiki-rte.tsx:117-131` (first image only, inserted at the cursor).
- mammoth types (`node_modules/mammoth/lib/index.d.ts`): `convertImage?: ImageConverter`, `images.imgElement(f: (image: Image) => Promise<ImageAttributes>)`. Check `Image.read()`'s overloads (`read(): Promise<Buffer>` / `read("base64")`) before using it. In the browser build, the Buffer is a Uint8Array subclass, and `new Blob([buf], { type })` works.
- `POST /api/wiki/pages` (`src/app/api/wiki/pages/route.ts:61-123`): inserts `wiki_pages` and then seeds `wiki_page_versions` v1 with the same `content_html`.
- Import modal stages: `STAGE_LABELS` / `StageUpdate` / `stageLabel()` at `_wiki-import-modal.tsx:52-76`.
- `WikiRte` is used only in `_wiki-doc-panel.tsx:223` with `pageId={detail.id}`.

## Implementation Steps
1. Extract `uploadWikiImage(pageId, file)` (sign → PUT → returns `url`, throws with the server's `error` message).
2. Change `POST /api/wiki/pages` to take an optional `id` (UUID check, 409 on 23505).
3. Import modal: generate `pageId`, add `convertImage` with upload/skip counting, the new stage, the empty-img strip, `id` in the POST body, and the warning toast.
4. RTE: in-flight counter + toolbar indicator, toasts, `posAtCoords` drop, loop over all image files.
5. `npx tsc --noEmit`, then the browser checks below.

## Acceptance Criteria
| # | Check | Expected | When |
|---|---|---|---|
| 1 | `npx tsc --noEmit` | 0 errors | pre-merge |
| 2 | Import a `.docx` with 2+ PNG/JPEG images, then in DevTools Network inspect the `POST /api/wiki/pages` request body | `contentHtml` has `/api/wiki/assets/{id}/…` srcs, `grep -c "data:"` = 0, and `id` equals the page id in the response | pre-merge (browser) |
| 3 | Open the page from #2 in view mode | all images render | pre-merge (browser) |
| 4 | Edit the page from #2, change one word, Save, reload | images are still present (this was the original bug) | pre-merge (browser) |
| 5 | Import a `.docx` with images totalling more than 5 MB | page is created, no 413 | pre-merge (browser) |
| 6 | Import a `.docx` with an EMF/WMF image (e.g. an inserted Office shape or clip-art) | page is created without that image, warning toast shows "1 image(s) couldn't be imported…", no broken-image box | pre-merge (browser, manual: needs a crafted file) |
| 7 | `curl -X POST /api/wiki/pages` with `id: "not-a-uuid"` (with a session) | 400 `Invalid id` | pre-merge |
| 8 | POST the same `id` twice | second call returns 409 | pre-merge |
| 9 | **No regression:** New Page modal (no `id`) | page is created with a DB-generated id, as before | pre-merge (browser) |
| 10 | **No regression:** import `.md` and `.pdf` | same output as before this change | pre-merge (browser) |
| 11 | Edit: paste a screenshot from the clipboard | uploading indicator shows, then the image is inserted at the cursor | pre-merge (browser) |
| 12 | Edit: drag 2 images from Finder between two paragraphs | both are inserted at the drop point, in order | pre-merge (browser) |
| 13 | Edit: drop a 60 MB image or a `.svg` | error toast with the server message, nothing inserted | pre-merge (browser) |
| 14 | **No regression:** Edit: paste plain text or HTML text | pastes normally, no upload is triggered | pre-merge (browser) |

## Verification
`npx tsc --noEmit`, then `pnpm dev` and run the browser checks 2–6 and 9–14 with a staff session. Checks 7–8 use curl or DevTools fetch with the session cookie.

## Coordination
- **494** (Testing) edits `src/app/api/wiki/pages/route.ts` POST (product validation, which looks like it's already in the working tree). Land after 494, and build on its version of the POST handler.
- **408** (Planned, publish-gated edits) will touch the wiki edit/save flow and probably `_wiki-doc-panel.tsx`, but its doc doesn't reference `_wiki-rte.tsx` or the import modal. Whichever lands second re-checks the `WikiRte` props.
- No other Planned or In Progress tasks touch these files.

## Open Decisions
- **D1 (NON-BLOCKING):** Page id generated on the client (`crypto.randomUUID()` + optional `id` on POST) vs. create an empty page first, upload, then PATCH. **Default: client id.** One write, version 1 holds the real content, and a failed upload doesn't leave an empty page behind. Create-then-PATCH would leave an empty v1 and an extra version row on every import.
- **D2 (NON-BLOCKING):** Should rich-HTML paste with `data:` images (copy from Word straight into the RTE) also upload them? **Default: out of scope.** It could be a follow-up that reuses `uploadWikiImage` in `transformPastedHTML`.
- **D3 (NON-BLOCKING):** Should a backfill move `data:` images in pages imported before this fix? **Default: no.** Do a one-off check after deploy: `select count(*) from wiki_pages where content_html like '%src="data:%'`. If the count is above 0, open a follow-up.

## Operator Steps
None: merge is enough. There's no migration and no new env var. It uses the existing `wiki-assets` bucket (migration 153) and the sign route, which must already be applied in the target environment (true wherever RTE image paste works today).

## Baseline
- `npx tsc --noEmit`: PASS (0 errors) before any change.
- AC2/AC4 fail before the change by construction: `mammoth.convertToHtml({ arrayBuffer })` with no `convertImage` uses mammoth's `images.dataUri` default (`node_modules/mammoth/lib/images.js:25`), and Tiptap `Image` parses only `img[src]:not([src^="data:"])`. Not observed in a browser (no dev server or session this pass).

## Implementation Notes

### What Changed
- `.docx` import uploads each embedded JPEG/PNG/GIF/WebP to `wiki-assets/{pageId}/` through the existing sign route. The page id is generated in the browser (`crypto.randomUUID()`) and sent as `id` to `POST /api/wiki/pages`. Other formats, and failed uploads, are skipped and counted: the `<img src="">` is removed before DOMPurify, and a `toast.warning` fires after the page is created.
- `POST /api/wiki/pages` accepts an optional `id`: a non-UUID returns 400 `Invalid id`, and a `23505` returns 409. Only the PK can raise 23505, since there are no other unique constraints/indexes on `wiki_pages` in `supabase/migrations`.
- RTE paste/drop handles every image file, uploaded one at a time and inserted in order. A drop goes at `posAtCoords`, a paste at the selection. The toolbar shows a `Loader2` "Uploading image(s)…" indicator in an `aria-live` region, and failures `toast.error` the server's message.

### Files Changed
- `src/lib/wiki/upload-image.ts` (new): `uploadWikiImage(pageId, file)`, sign → `putToSignedUrl` → returns url. Throws with the server's `error`.
- `src/app/(hub)/wiki/_wiki-import-modal.tsx`: `convertImage` upload/skip, empty-img strip, `uploadingImages` stage (`Uploading images… n`), `id` in the POST, skipped toast.
- `src/app/api/wiki/pages/route.ts`: optional validated `id`, 409 on 23505.
- `src/app/(hub)/wiki/_wiki-rte.tsx`: multi-image upload, drop position, indicator, toasts. Uses the shared helper; the direct `putToSignedUrl` import was removed.

### Deviations From Plan
- The RTE inserts through the ProseMirror `view` passed to `handlePaste`/`handleDrop` (`replaceSelectionWith` / `replaceRangeWith` + `tr.mapping`), not `editor.chain()…insertContentAt` as planned. `editorProps` handlers close over the first render, where `editor` is still `null` (`immediatelyRender: false`). The old `editor?.chain()` call had the same exposure. `replaceRangeWith` also fits the block-level image node when it's dropped mid-paragraph.
- Images are read with `image.readAsArrayBuffer()` (it exists in `mammoth/lib/documents.js:174` and the `.d.ts`) instead of `read()`, so no Buffer polyfill question comes up.

### Verification Run
- `npx tsc --noEmit`: PASS (baseline: 0 errors → now: 0 errors), run after each step.
- `npx eslint` on the 4 changed files: PASS.
- mammoth `imgElement` emits `src` verbatim (`images.js:8-18`), so a `{ src: "" }` result is matched by the `img[src=""]` strip selector. Confirmed by reading the source, not by running it.
- AC2–AC14 (browser/curl): SKIPPED. No dev server or authenticated session this pass (`curl localhost:3000` → connection refused). They're left for the `test` stage.

### Attempts That Failed
- None.

### Operator Steps
- None: merge is enough. There's no migration, no env var, and no separately deployed component. The changed shared module `src/lib/wiki/upload-image.ts` is new, and its only importers are `_wiki-rte.tsx` and `_wiki-import-modal.tsx` (both part of the Next.js app). It needs `wiki-assets` (migration 153) applied in the target environment, the same as the existing RTE paste.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Repeated sign→PUT logic is extracted to `src/lib/wiki/upload-image.ts` and used by both callers; the RTE's direct `putToSignedUrl` import was removed. No dead code, no `any`, no debug logging.
- Errors are handled on purpose: the RTE toasts the server's message, and the import skips the image, counts it, and warns, so the import never fails because of one image. The server validates `id` at the trust boundary (UUID → 400, PK conflict → 409). The sign route's role/MIME/size gate is unchanged, and so is the asset read route.
- Conventions: lucide `Loader2`, `aria-live` region, sonner for transient messages, Tailwind scale classes, no new dependency, no `adminClient`, no git.
- **Fixed during the gate:** (1) two stacked comment blocks on `uploadAndInsertImages` merged into one; (2) `if (view.isDestroyed) continue;` added, so leaving Edit mid-upload no longer calls `dispatch` on a destroyed view (that would have thrown into the catch and shown a misleading error toast). After the fixes, `npx tsc --noEmit` PASS and eslint PASS.
- Not fixed (pre-existing, out of scope): `WikiRte` isn't keyed by `pageId` in `_wiki-doc-panel.tsx:223`, so the handlers keep the first `pageId` if the page changed while the editor stayed mounted. The old code had the same exposure.
- Acceptance criteria: all 14 have a check that can fail. #6 is manual (needs a crafted EMF/WMF .docx). Checks 2–14 haven't been run yet: no dev server or session during implementation.

### Deviations
- Minor: RTE inserts through the ProseMirror `view` (`replaceSelectionWith`/`replaceRangeWith` + `tr.mapping`) instead of `editor.chain().insertContentAt`. Same behaviour, and it avoids the null `editor` closure. Documented in Implementation Notes.
- Minor: `image.readAsArrayBuffer()` instead of `read()`. A public mammoth API, and no Buffer is needed in the browser.

### Required Fixes
- None.
