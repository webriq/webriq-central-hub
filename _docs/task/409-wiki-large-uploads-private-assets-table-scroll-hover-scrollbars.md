# 409: Wiki — Browser-Direct PDF/Image Uploads, Private Image Bucket, Higher Limits, Table Scroll + Hover Scrollbars

**Created:** 2026-10-01
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Completed (2026-10-01)

---

## Overview

Follow-up to the Wiki import/RTE tasks (395, 396, 398, 400). A set of related changes made in one session:

1. **PDF import limits raised** — 20 → 100 pages, 15 MB → 200 MB, `maxDuration` 180 → 300 s (Pro + Fluid compute allows up to 800 s).
2. **Large uploads no longer blocked by Vercel** — Route Handler request bodies over ~4.5 MB 413 *before the handler runs*, so both the PDF import and the inline image upload now go **browser-direct to Supabase Storage** through signed upload URLs (same pattern as tasks 339 / 350).
3. **Wiki inline images moved to a private bucket** — new private `wiki-assets` bucket (limit 10 → 50 MB) read through an auth-gated route that 302s to a short-lived signed URL, instead of the public `task-content` bucket.
4. **Wide tables** (e.g. the 10-column "Access and Permissions" table) were clipped on the right — they now scroll horizontally inside the page with a visible scrollbar directly under the table.
5. **Hover vertical scrollbars** on the document, left tree, right info and history panels.

## Requirements

### Limits
- [x] `MAX_PAGES` 100, `MAX_FILE_SIZE` 200 MB (client modal + server), `maxDuration` 300 on `import-pdf`. The over-limit message reads `MAX_PAGES`, so it follows automatically.

### PDF import — browser-direct upload (migration 154)
- [x] Private, transient `wiki-imports` bucket (PDF only, 200 MB). Insert/select/delete policies scoped to the caller's own `<auth.uid()>/` folder; insert limited to writer roles (admin, super_admin, pm, developer) via `get_my_role()`.
- [x] `POST /api/wiki/pages/import-pdf/sign` — auth + writer-role + `.pdf` + size gate, mints a signed upload URL for `<uid>/<uuid>.pdf`.
- [x] `POST /api/wiki/pages/import-pdf` now takes JSON `{ path }` (was multipart): validates the path is under the caller's folder, downloads the object, checks size and the `%PDF-` magic bytes, runs the unchanged import, and **always deletes the upload** in `finally`.
- [x] Import modal: sign → XHR PUT with live "Uploading… N%" label → import call. New shared `src/lib/uploads/put-signed-url.ts`.

### Inline images — private bucket + direct upload (migration 153)
- [x] Private `wiki-assets` bucket (images only, 50 MB). Insert policy: writer roles. Select policy: writer roles + `hr` (matches `wiki_pages` read) so the read route can sign with the caller's own session — no `adminClient`.
- [x] `POST /api/wiki/pages/[pageId]/description-images/sign` replaces the old multipart `description-images` route (deleted): auth + role + MIME + size gate, mints a signed upload URL, returns the stable read URL.
- [x] `GET /api/wiki/assets/[pageId]/[filename]` — session + role check, UUID/filename validation (no traversal), `createSignedUrl` (1 h) → 302 with `Cache-Control: private, max-age=3000`. Bytes are served by Storage's CDN, not the function; the stored page HTML URL never expires.
- [x] `_wiki-rte.tsx` uploads via sign → PUT; failures are still silently dropped (a failed inline image is not fatal to the page).
- [x] Existing images stay in `task-content` (public) and keep working; only new uploads use `wiki-assets`. The docx export's same-origin `fetch(src)` follows the redirect and carries the session cookie (comment updated).

### Tables
- [x] `[&_table]` → `block w-max min-w-full max-w-full overflow-x-auto` in `_wiki-prose.ts` (read + diff views) and `_wiki-rte.tsx` (edit view): wide tables scroll inside the page; narrow tables still fill the width. A "fit to width" attempt (`overflow-wrap:anywhere`) was tried and rejected by the user.
- [x] `.wiki-prose table { scrollbar-width: thin; scrollbar-color: #b8c2db #edf0f7 }` in `globals.css` — always-visible bar directly under the table.

### Hover scrollbars
- [x] `.scrollbar-hover` (`globals.css`): `scrollbar-width: thin`, transparent thumb at rest, `#9aa7c7` on `:hover`. Applied to the doc panel, tree panel, info panel and both history-panel scrollers.

## Out of Scope / Must-Not-Change
- Existing wiki images are **not** migrated out of `task-content`.
- No source-PDF retention — the page keeps only the converted HTML; the upload is deleted after the import.
- `.docx` / `.md` import remains fully client-side (never hit the body cap).
- Comment attachments, customer assets and the legacy multipart upload routes are untouched.

## Proposed File Changes
- **New:** `supabase/migrations/153_wiki_assets_storage.sql`, `154_wiki_imports_storage.sql`; `src/app/api/wiki/pages/import-pdf/sign/route.ts`; `src/app/api/wiki/pages/[pageId]/description-images/sign/route.ts`; `src/app/api/wiki/assets/[pageId]/[filename]/route.ts`; `src/lib/uploads/put-signed-url.ts`.
- **Changed:** `src/app/api/wiki/pages/import-pdf/route.ts`; `src/app/(hub)/wiki/_wiki-import-modal.tsx`, `_wiki-rte.tsx`, `_wiki-prose.ts`, `_wiki-export-docx.ts` (comment), `_wiki-doc-panel.tsx`, `_wiki-tree-panel.tsx`, `_wiki-info-panel.tsx`, `_wiki-history-panel.tsx`; `src/app/globals.css`.
- **Deleted:** `src/app/api/wiki/pages/[pageId]/description-images/route.ts` (multipart).

## Compatibility Touchpoints
- Tailwind v4 emits nothing for `::-webkit-scrollbar-*` arbitrary variants, and Chrome 121+ **ignores** those pseudo-elements once `scrollbar-width`/`scrollbar-color` is non-auto (and `scrollbar-color` is inherited). The first attempt used the pseudo-elements with `:hover`; Chrome cached the thumb style and never repainted it, so the bar stayed invisible. The standard properties are used instead, and the table sets its own so it doesn't inherit the transparent thumb from a `.scrollbar-hover` ancestor.
- A bucket's `file_size_limit` cannot exceed the **project-wide** Storage upload limit.
- Firefox keeps its own scrollbar behaviour for the old pseudo-element rules that were removed; the new standard properties are supported there.

## Acceptance Criteria
- [x] Over-limit message reads "up to 100 pages"; file cap reads 200 MB.
- [x] `npx tsc --noEmit` passes.
- [x] Document panel shows a thin vertical thumb on hover and none at rest (verified in Chrome against the dev server).
- [x] The 11-column "Access and Permissions" table on *PublishForge Complete* scrolls horizontally with a visible bar directly under it (verified in Chrome).
- [ ] Apply migrations 153 + 154, then: paste an image into a wiki page, reload it as another staff user, and run a Word export containing it.
- [ ] Import a PDF larger than 4.5 MB on a Vercel deployment; confirm the `wiki-imports` object is deleted afterward.

## Verification
- `npx tsc --noEmit` — PASS.
- Scrollbar + table behaviour inspected live in Chrome (computed `scrollbar-width`/`scrollbar-color`, screenshots of hover thumb and table bar).
- **Not exercised:** migrations 153/154 are written, **not applied**; the signed-upload, import-delete and image read-redirect flows were not run end-to-end. The left tree and history panel scrollbars share the class but weren't visually checked (nothing overflowed on the test page).

## Follow-up
- **Raise the Supabase project-wide upload limit to ≥ 200 MB** (Dashboard → Storage → Settings; Pro plan) — otherwise the 200 MB/50 MB bucket limits don't take effect.
- Memory/time risk: the import still loads the whole PDF into function memory and renders every page; a 100-page / 200 MB PDF may exceed memory or 300 s. Test with a large file; consider raising `CONCURRENCY` or `maxDuration` (≤ 800 s).
- Orphan sweep for `wiki-imports` objects uploaded but never imported (tab closed after the PUT).
- Optionally migrate existing `task-content/wiki/...` images into `wiki-assets` and rewrite their URLs in `wiki_pages` + `wiki_page_versions`.
- Pre-existing `design-system-font-size` hook findings in `_wiki-import-modal.tsx`, `_wiki-tree-panel.tsx`, `_wiki-history-panel.tsx` were not touched.
