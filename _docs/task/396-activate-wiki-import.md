# 396: Activate Wiki Import (.docx / .md / .pdf → new page)

**Created:** 2026-09-23
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Task 395 shipped the Wiki tab's "Import" button as a disabled/"coming soon" affordance (`_wiki-tree-panel.tsx:122-129`) because no document-conversion library existed in the repo at the time. That assumption turned out to be wrong for two of the three needed formats: `mammoth` (.docx→HTML) and `marked` (.md→HTML) are **already installed dependencies**, already used client-side in `_onboarding-wizard.tsx`'s `DocxFilePreview`/`MarkdownFilePreview` for file previews. This task activates Import for real: upload a `.docx`, `.md`, or `.pdf` file and it becomes a new Wiki page, in the currently-selected space.

Two architecture decisions, both driven by what's actually proven to work in this codebase (checked before planning, not assumed):
1. **`.docx`/`.md` conversion + sanitization run client-side**, exactly reusing two already-proven-in-this-repo patterns: `mammoth.convertToHtml({ arrayBuffer })` / `marked.parse()` (from `_onboarding-wizard.tsx`), and `DOMPurify.sanitize()` (from `_message-html.ts`'s `sanitizeMessageHtml`) — `dompurify` is only ever called from `"use client"` components in this repo (confirmed via search), because the plain `dompurify` package needs a real `window`/DOM and there's no `jsdom` installed to run it server-side. Sanitizing matters here specifically because `marked` passes raw HTML in Markdown source straight through by default — an imported `.md` file is external content, not RTE-authored, so unlike the "semi-trusted staff-authored" descriptions elsewhere in this codebase that skip sanitization, this is a real injection surface for a `content_html` value that later renders via `dangerouslySetInnerHTML` in `_wiki-doc-panel.tsx` for every viewer.
2. **`.pdf` extraction runs server-side** (new `POST /api/wiki/pages/import-pdf`, Node runtime) via a new `pdf-parse` dependency (**user approved adding a new package for this**) — `pdf-parse` needs Node (`fs`), isn't browser-safe. It returns plain text only (no PDF library is installed that does layout-aware HTML); the route wraps that text into `<p>` paragraphs itself, HTML-escaping every character, so no sanitizer is needed for this path — nothing PDF-derived is ever treated as HTML.

Both paths converge on the same place: the client ends up holding a `contentHtml` string (safe either way) and calls the **existing** `POST /api/wiki/pages` (extended with one new optional field) to actually create the page — reusing task 395's already-tested create-page logic rather than duplicating it in a third route.

## Requirements

- [ ] `pnpm add pdf-parse` (+ `@types/pdf-parse` as a devDependency if TypeScript can't resolve its types without it — verify during implementation, add only if needed).
- [ ] New `POST /api/wiki/pages/import-pdf` — Node-runtime route (do **not** set `export const runtime = "edge"`), auth-checked (`getUser()`), accepts multipart `file`. Validates: file present, `.pdf` extension, size ≤ 15MB (matches the existing description-image upload's order-of-magnitude limit for this kind of small-document feature, not the large `customer-assets` bucket's limits). Runs `pdf-parse` on the buffer, splits `data.text` on blank lines into paragraphs, HTML-escapes each paragraph's text, joins as `<p>...</p>`, returns `{ contentHtml }`. No database write — this route only extracts text.
- [ ] Extend `POST /api/wiki/pages` (`src/app/api/wiki/pages/route.ts`) to accept an optional `contentHtml?: string` field (defaulting to `""`, matching current behavior exactly when omitted) — pass it through to both the `wiki_pages` insert and the seeded `wiki_page_versions` version-1 row (currently both hardcode `content_html: ""`).
- [ ] New `WikiImportModal` (`src/app/(hub)/kb/_wiki-import-modal.tsx`) — file picker/drop-zone accepting `.docx,.md,.markdown,.pdf`, a Space select + optional Parent page select (mirrors `WikiNewPageModal`'s own selects exactly for UI consistency — same `inputClass`/`labelClass`/modal shell), an optional Title field defaulting to the filename with its extension stripped. Client-side validation: extension allow-list, 15MB size cap (matching the server-side PDF route's own limit, applied uniformly to all three types for a consistent user-facing rule), clear inline error text (no `alert()`).
  - `.docx` → `mammoth.convertToHtml({ arrayBuffer })` → `DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })`.
  - `.md`/`.markdown` → `file.text()` → `marked.parse(text, { async: false })` → same `DOMPurify.sanitize(...)`.
  - `.pdf` → `POST` the file to `/api/wiki/pages/import-pdf`, read `{ contentHtml }` from the response.
  - Then `POST /api/wiki/pages` with `{ product, parentId, title, contentHtml }`; on success, call the same `onCreated` contract `WikiNewPageModal` already uses so `WikiShell` can reuse its existing handler unchanged.
- [ ] Activate the Import button in `_wiki-tree-panel.tsx` — remove `disabled`/`title="Import — coming soon"`/the disabled styling, wire `onClick` to a new `onImport` prop (mirrors the existing `onNewPage` prop exactly).
- [ ] Wire `WikiShell` — add import-modal open state (same `{product, parentId} | null` shape already used for `newPageModal`), pass `onImport` down to `WikiTreePanel`, render `<WikiImportModal>` next to the existing `<WikiNewPageModal>`.
- [ ] Regression check (no code change expected): confirm the RTE's existing paste/drop image embed (`_wiki-rte.tsx`, built in task 395, posts to `/api/wiki/pages/[pageId]/description-images`) is untouched by this change and still works — this task doesn't modify `_wiki-rte.tsx` or the image-upload route at all, so this is a verification step, not an implementation step.

## Out of Scope / Must-Not-Change

- `.html` and `.txt` (present in the original mockup's file-type list, but not requested this time) — not handled; an unsupported extension shows a clear client-side error, not a silent failure.
- `.doc` (legacy binary Word format) — `mammoth` targets `.docx` (OOXML); `.doc` stays unsupported.
- Any server-side sanitization library (`sanitize-html`, `isomorphic-dompurify`, `jsdom`) — deliberately avoided by keeping `.docx`/`.md` conversion+sanitization client-side, reusing what's already proven to work here instead of adding a second new dependency beyond the one PDF library already approved.
- PDF layout/images/tables — `pdf-parse` is text-only; imported PDFs become plain paragraphs, no formatting preserved. This is the documented ceiling of a "quick import," not a bug.
- `_wiki-rte.tsx`, `/api/wiki/pages/[pageId]/description-images`, `/api/wiki/pages/[pageId]` — untouched by this task.
- Drag-to-reorder, PDF/Word/Markdown **export**, and the rest of task 395's already-documented out-of-scope list — still out of scope; this task only activates **Import**.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | `pnpm add pdf-parse` (+ `@types/pdf-parse` if needed) |
| `src/app/api/wiki/pages/import-pdf/route.ts` | Create | Server-side `.pdf` → escaped-paragraph HTML extraction |
| `src/app/api/wiki/pages/route.ts` | Modify | `POST` accepts optional `contentHtml`, threaded into the insert + seeded version row |
| `src/app/(hub)/kb/_wiki-import-modal.tsx` | Create | The Import UI: file picker, space/parent/title fields, per-type conversion, create-page call |
| `src/app/(hub)/kb/_wiki-tree-panel.tsx` | Modify | Enable the Import button, wire it to a new `onImport` prop |
| `src/app/(hub)/kb/_wiki-shell.tsx` | Modify | Import-modal state + wiring, same shape as the existing New Page modal |

## Code Context

### Button to activate — `src/app/(hub)/kb/_wiki-tree-panel.tsx:122-129`
```tsx
<button
  type="button"
  disabled
  title="Import — coming soon"
  className="flex items-center gap-1 text-[11px] font-semibold text-[#94A3B8] border border-[#E2E7F2] bg-white rounded-[7px] px-2 py-1 opacity-50 cursor-not-allowed"
>
  <Upload size={11} /> Import
</button>
```
Becomes an enabled button calling a new `onImport: () => void` prop, styled like the adjacent "New page" button's ghost variant (not the orange CTA — Import is a secondary action) — compare `WikiTreePanel`'s own `onNewPage` prop/button immediately to its right for the exact pattern to mirror.

### Client-side `.docx`/`.md` conversion precedent — `_onboarding-wizard.tsx:5442-5463` (docx) and its Markdown sibling
```tsx
fetch(url)
  .then((res) => res.arrayBuffer())
  .then((buffer) => mammoth.convertToHtml({ arrayBuffer: buffer }))
  .then((result) => setHtml(result.value));
```
For a local `File` object (not a fetched URL, since Import reads a picked file directly), use `await file.arrayBuffer()` in place of the `fetch().then(res => res.arrayBuffer())` chain — same `mammoth.convertToHtml({ arrayBuffer })` call. For Markdown: `const text = await file.text(); const html = marked.parse(text, { async: false }) as string;`.

### Client-side sanitization precedent — `src/app/(hub)/desk/inbox/[inboxId]/_message-html.ts:38-42`
```ts
export function sanitizeMessageHtml(body: string): string {
  return DOMPurify.sanitize(neutralizeDeadInlineImages(absolutizeZohoDeskInlineImages(body)), {
    USE_PROFILES: { html: true },
  });
}
```
Only the `DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })` call is relevant here — the Zoho-specific helpers it wraps are not. Write a small local sanitize call inline in `_wiki-import-modal.tsx` (or a one-line local helper) rather than importing this Desk-specific function, per this repo's per-feature decoupling precedent (`_task-description-editor.tsx`'s header comment, task 202 — already followed once in task 395 for the RTE itself).

### `POST /api/wiki/pages` to extend — `src/app/api/wiki/pages/route.ts`
```ts
const { product, title, parentId } = (body ?? {}) as {
  product?: WikiProduct;
  title?: string;
  parentId?: string | null;
};
// ...
.insert({
  product,
  parent_id: parentId ?? null,
  title: title.trim(),
  content_html: "",
  created_by: user.id,
  updated_by: user.id,
})
// ...
const { error: versionError } = await supabase.from("wiki_page_versions").insert({
  page_id: page.id,
  version: 1,
  title: page.title,
  content_html: "",
  edited_by: user.id,
});
```
Add `contentHtml?: string` to the destructured body type, and use `contentHtml ?? ""` in both the `wiki_pages` insert and the seeded version row (currently both are hardcoded `""`).

### `WikiNewPageModal` to mirror for shell/UI conventions — `src/app/(hub)/kb/_wiki-new-page-modal.tsx`
Same overlay/panel classes, same `inputClass`/`labelClass`, same Space/Parent `<select>` pattern, same `onCreated: (page: WikiPageSummary) => void` contract. `WikiImportModal` should feel like a sibling of this component, not a different UI language.

### `WikiShell`'s existing modal-state pattern to mirror — `src/app/(hub)/kb/_wiki-shell.tsx`
```tsx
const [newPageModal, setNewPageModal] = useState<{ product: WikiProduct; parentId: string | null } | null>(null);
// ...
function onPageCreated(page: WikiPageSummary) {
  setNewPageModal(null);
  void refreshPages();
  selectPage(page.id, page.product);
}
```
Add a second, identically-shaped `importModal` state + reuse `onPageCreated` as-is for both modals' `onCreated` (no need for a second handler — the contract is already exactly `(page: WikiPageSummary) => void` either way).

## Implementation Steps

1. `pnpm add pdf-parse`; run `npx tsc --noEmit` once immediately after to see if `@types/pdf-parse` is needed, add it if so.
2. Build `src/app/api/wiki/pages/import-pdf/route.ts`.
3. Extend `src/app/api/wiki/pages/route.ts`'s `POST` for the optional `contentHtml`.
4. Build `src/app/(hub)/kb/_wiki-import-modal.tsx`.
5. Wire `_wiki-tree-panel.tsx` (enable button + `onImport` prop) and `_wiki-shell.tsx` (state + render + prop threading).
6. Manually verify the RTE paste/drop image embed still works (open an existing page, Edit, paste a screenshot) — no code change expected, just confirm no regression.

## Acceptance Criteria

- [ ] Import button in the Wiki sidebar is enabled (no "coming soon" tooltip/disabled styling) for write-capable roles.
- [ ] Uploading a `.docx` file creates a new page whose body renders the document's headings/paragraphs/lists/bold/italic (mammoth's known-supported subset) in the same space, selected immediately after creation.
- [ ] Uploading a `.md` file creates a new page with correctly-rendered Markdown → HTML (headings, lists, code blocks, etc.).
- [ ] Uploading a `.pdf` file creates a new page with its extracted text as paragraphs (no formatting expected).
- [ ] A `.md` file containing a raw `<script>alert(1)</script>` block does **not** execute when the resulting page is viewed — confirms `DOMPurify.sanitize()` is actually wired in, not just imported.
- [ ] An unsupported extension (e.g. `.html`) or an oversized file (>15MB) shows a clear inline error in the modal, no crash, no silent failure.
- [ ] `_wiki-rte.tsx`'s existing paste/drop image embed still works on an existing page (regression check).
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then browser-verify: import a .docx, a .md (incl. one with a raw <script> tag to confirm sanitization), and a .pdf; confirm each creates a real page; confirm RTE image paste still works on an existing page
```

## Compatibility Touchpoints

- New dependency `pdf-parse` (+ possibly `@types/pdf-parse`) — first new package this Wiki feature area has needed; no other packaging/adapter surface affected.
- `/api/wiki/pages/import-pdf` must run on the Node runtime (Next.js default for Route Handlers) — do not add `export const runtime = "edge"` to it, `pdf-parse` needs `fs`.
- No new migration — reuses task 395's `wiki_pages`/`wiki_page_versions` tables and the existing `POST /api/wiki/pages` write path (still RLS-gated, same `admin/super_admin/pm/developer` write roles as everything else in this feature area).

## Implementation Notes

### What Changed
- `pnpm add pdf-parse` installed **v2.4.5**, not v1 — its API is completely different from the v1 shape assumed while planning (`pdf(buffer)`). v2 is a TypeScript-native, dual CJS/ESM package exposing a class: `new PDFParse({ data: buffer })`, then `await parser.getText()` returns `{ text, ... }`, and the README is explicit that `parser.destroy()` must always run in a `finally` block to free memory. `import-pdf/route.ts` follows that exact pattern. v2 ships its own bundled `.d.ts` files, so `@types/pdf-parse` was not needed — confirmed by a clean `tsc` run right after install, per the plan's own "verify during implementation" step.
- `POST /api/wiki/pages` (`route.ts`) now accepts an optional `contentHtml` field, threaded into both the `wiki_pages` insert and the seeded `wiki_page_versions` row (both previously hardcoded `""`). Every existing caller (`WikiNewPageModal`) is unaffected — omitting the field still defaults to `""`, unchanged behavior.
- New `POST /api/wiki/pages/import-pdf` (`export const runtime = "nodejs"` explicit) — auth-checked, validates `.pdf` extension + 15MB cap, runs `pdf-parse`, HTML-escapes the extracted text and wraps it into `<p>` paragraphs (split on blank lines), returns `{ contentHtml }`. No database write.
- New `WikiImportModal` (`_wiki-import-modal.tsx`) — drag-and-drop/browse file picker (`.docx,.md,.markdown,.pdf`), same Space/Parent-select + overlay/panel shell as `WikiNewPageModal` for visual consistency. `.docx`/`.md` are converted and sanitized entirely client-side via **dynamically imported** `mammoth`/`marked`/`dompurify` (`await import(...)` inside the conversion function, not static top-level imports) so those libraries don't bloat the initial `/kb` page bundle for the common case of just reading pages — only loaded when someone actually opens Import and picks a `.docx` or `.md` file. `.pdf` posts to the new server route instead. Either path ends in a plain `contentHtml` string handed to `POST /api/wiki/pages`.
- `_wiki-tree-panel.tsx`'s Import button: removed `disabled`/the "coming soon" tooltip/disabled styling, added an `onImport: () => void` prop wired the same way `onNewPage` already was.
- `_wiki-shell.tsx`: added `importModal` state (identical shape to the existing `newPageModal`), passes `onImport` down to `WikiTreePanel`, renders `<WikiImportModal>` alongside `<WikiNewPageModal>`. `onPageCreated` now closes both modal states (only one is ever open at a time) since it's shared by both `onCreated` callbacks — no new handler needed, the existing `(page: WikiPageSummary) => void` contract already matched.
- `_wiki-rte.tsx` and `/api/wiki/pages/[pageId]/description-images` — **not touched**, per plan. `pnpm dev` boot + route smoke test confirm the app still compiles and runs; the actual "paste an image into an existing page" regression check still needs a live authenticated browser session (migration 149 from task 395 is still written, not applied, so there's no live `wiki_pages` data to test against yet).

### Files Changed
- `package.json` / `pnpm-lock.yaml` - added `pdf-parse` dependency
- `src/app/api/wiki/pages/import-pdf/route.ts` - new server-side PDF text extraction route
- `src/app/api/wiki/pages/route.ts` - `POST` accepts optional `contentHtml`
- `src/app/(hub)/kb/_wiki-import-modal.tsx` - new Import UI
- `src/app/(hub)/kb/_wiki-tree-panel.tsx` - enabled Import button, added `onImport` prop
- `src/app/(hub)/kb/_wiki-shell.tsx` - import-modal state + wiring

### Deviations From Plan
- `pdf-parse`'s actual v2 API (class-based, `getText()`/`destroy()`) differs from the v1 shape the plan's Code Context described (`pdf(buffer).then(...)`) — the plan's Requirements/Implementation Steps still fully apply, only the exact call shape changed. No `@types/pdf-parse` needed (plan flagged this as conditional, verified unnecessary).
- Minor addition beyond the plan's explicit file list: dynamic (`await import(...)`) rather than static imports for `mammoth`/`marked`/`dompurify` in the Import modal, to keep those libraries out of the base `/kb` bundle. Same libraries, same conversion logic the plan specified — just how they're loaded.

### Verification Run
- `npx tsc --noEmit` - PASS (0 errors)
- `pnpm lint` - PASS (0 errors; 2 pre-existing unrelated warnings in `onboarding-workspace/_checklist-tab.tsx`)
- `pnpm dev` + `curl /kb` (307 redirect) + `curl -X POST /api/wiki/pages/import-pdf` (401 Unauthorized, not a 500/crash) - PASS for compile/boot, confirming `pdf-parse` loads correctly in the Node route. Dev log checked for compile/module-resolution errors - none found.
- Full browser acceptance (import a real `.docx`/`.md`/`.pdf`, the `<script>`-in-Markdown sanitization check, the oversized/unsupported-file error states, and the RTE paste-image regression check) - SKIPPED, same reason as task 395: no live authenticated session this pass, and migration 149 is still written, not applied.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Full re-read of all 6 changed/new files (`import-pdf/route.ts`, `wiki/pages/route.ts`, `_wiki-import-modal.tsx`, `_wiki-tree-panel.tsx`, `_wiki-shell.tsx`, plus `package.json`) against the standards checklist.
- One small issue found and fixed (see Deviations) — no scope, architecture, or security-model change.
- Error handling is consistent: the new PDF route wraps the risky `getText()`/`destroy()` calls in `try/catch/finally` exactly matching `pdf-parse`'s own documented pattern (constructor stays outside the `try`, matching the library's own "no code runs until `getText()`" contract — confirmed against its README example rather than assumed); the modal's `convertToHtml()` errors surface as a real message in the existing inline error UI, never a silent failure or `alert()`.
- No secrets, credentials, or debug logging in any new/changed file.
- The security-relevant design decision from planning (client-side DOMPurify sanitization for `.docx`/`.md`, server-side HTML-escaping for `.pdf`, no sanitizer needed there since nothing PDF-derived is ever treated as HTML) is implemented exactly as specified — verified by re-reading `convertToHtml()` and `textToParagraphs()`/`escapeHtml()` line by line, not just trusting the plan.

### Deviations
- **Minor (fixed):** `convertToHtml()` in `_wiki-import-modal.tsx` wrapped a single dynamic import in `Promise.all([import("dompurify")])` — `Promise.all` exists to parallelize multiple promises, and there was only one here. Simplified to a plain `await import("dompurify")`.
- **Minor (documented, not a defect):** `pdf-parse`'s actual installed version (v2.4.5) has a completely different API from the v1 shape the task doc's Code Context described (`pdf(buffer).then(...)` vs. the real `new PDFParse({ data }).getText()` / `.destroy()`). This was caught and correctly adapted during implementation (confirmed against the package's own README, including its `destroy()`-in-`finally` requirement), not something introduced by this quality pass — already logged as an Implementation Notes deviation. Re-verified here: the implemented shape matches the library's actual documented contract.
- **Minor (documented, not changed):** the design-quality hook flagged `text-[12px]`/`text-[12.5px]` button-label sizes in the new files — same call already made and documented during task 395's quality gate: these match `central-hub-design-system.md`'s own documented button sizing ("default 8px 15px / 12px"), the hook just doesn't map literal px back to that component-level spec.
- No Major deviations. Scope matches the approved plan exactly: `.docx`/`.md`/`.pdf` only (no `.html`/`.txt`/`.doc`), no new sanitization library beyond the already-installed `DOMPurify`, `_wiki-rte.tsx` and the image-upload route untouched, no new migration, the existing `POST /api/wiki/pages` reused rather than duplicated.

## Testing Notes — PDF worker bundling bugfix

Live browser testing (post-quality-gate) surfaced a real bug on the first `.pdf` import attempt:

```
POST /api/wiki/pages/import-pdf parse error: Error: Setting up fake worker failed: "Cannot find module
'.../.next/dev/server/chunks/pdf.worker.mjs' imported from '.../.next/dev/server/chunks/1ie6_pdfjs-dist_legacy_build_pdf_mjs_0ge00ru._.js'".
```

**Root cause:** `pdf-parse` v2 wraps `pdfjs-dist`, which loads a separate worker script (`pdf.worker.mjs`) via a relative import resolved at runtime. Next.js bundles Route Handler dependencies by default (Turbopack in this repo's dev mode); bundling rewrote `pdfjs-dist`'s internal module paths into `.next/.../chunks/...`, which broke that relative worker import — `pdf-parse` itself was correct, and the fix in `import-pdf/route.ts` (constructor outside `try`, `getText()`/`destroy()` in `try/finally`) was unaffected; this was purely a bundler/packaging issue, not an application logic bug.

**Fix:** `next.config.ts` — added a top-level `serverExternalPackages: ["pdf-parse", "pdfjs-dist", "@napi-rs/canvas"]` (Next's documented, stable mechanism — [`serverExternalPackages`](node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/serverExternalPackages.md) — for opting a dependency out of bundling so it loads via native Node `require` from `node_modules` instead, where its own internal relative paths resolve correctly). `@napi-rs/canvas` (pdf-parse's other real dependency, a native binary used only by `getImage`/`getScreenshot`, not this app's `getText()`-only usage) was included preemptively — native bindings hit the same class of bundling bug, no reason to wait for a second bug report. None of `pdf-parse`/`pdfjs-dist`/`@napi-rs/canvas` are in Next's short auto-externalized default list, so this had to be explicit.

**Verification:**
- A standalone Node script (`node .tmp-test-pdf-parse.mjs`, run from the project root — exactly the unbundled `require` resolution `serverExternalPackages` produces, deleted after the check) successfully parsed a real PDF from this repo (`_docs/products/CiteForge.pdf`) with zero worker errors, confirming `pdf-parse` itself works correctly once it isn't bundled.
- `npx tsc --noEmit` — PASS.
- Dev server restarted (required — `next.config.ts` changes need a restart) + `curl /kb` (307) + `curl -X POST /api/wiki/pages/import-pdf` (401 Unauthorized, not a crash) — PASS, dev log clean of compile/module-resolution errors.
- Still not run: an actual authenticated `.pdf` upload through the running app (no live browser session this pass) — the standalone-script test is strong evidence the fix resolves the reported error, but isn't a substitute for re-testing the real upload flow end-to-end.
