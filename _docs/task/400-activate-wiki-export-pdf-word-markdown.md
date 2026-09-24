# 400: Activate Wiki Export — PDF, Word (.docx), Markdown

**Created:** 2026-09-24
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Completed
**Completed:** 2026-09-24

---

## Completion Summary (final state — read this first)

> The planning sections below (Overview → Compatibility Touchpoints) are the **original plan** and are partly superseded: the plan's print-dialog PDF and the Revision 1 embedded-font Word export were both replaced during follow-up rounds. The sections after "Implementation Notes" record each round in order. This summary describes what actually shipped.

### Delivered
All four Wiki **Export ▾** formats work, fully client-side, from the saved page (`detail.contentHtml`). The menu is driven by one registry, and each row shows a spinner while it runs and a toast on failure.

| Format | How it works (final) |
|---|---|
| **HTML** | A standalone file styled by `buildWikiCss()`: Wiki tokens in a `.wiki-export`-scoped stylesheet, with Inter / Space Grotesk / JetBrains Mono → Noto Sans / sans-serif stacks. The title is HTML-escaped. |
| **PDF** | A **direct `.pdf` download** (not a print dialog). jspdf `html()` + html2canvas (jspdf's already-installed optional dependency) produce vector, selectable text with **embedded Inter / Space Grotesk / JetBrains Mono** (static OFL TTFs in `public/fonts/wiki-export/`, license texts included). If a font can't load, the text falls back to Helvetica. Page size is A4 with 48pt margins. |
| **Word (.docx)** | `docx` v9. Sizes, colors, letter-spacing and spacing mirror the Wiki read view, set **explicitly on every paragraph and run**. Fonts are **Arial** (text) and **Courier New** (code), per the user's decision. Lists use custom bullet and decimal numbering with the Wiki's 20px indent and explicit tab stops. Code, quote and table blocks are styled like the Wiki. Images are embedded, with an "[image unavailable]" placeholder. Page size is A4. |
| **Markdown** | turndown + the GFM plugin: ATX headings, fenced code, `-` bullets, pipe tables and `~~strike~~`, with Tiptap's `<li><p>`/`<td><p>` and header-row shapes normalized first. |

### Problems found and fixed after the first implementation
1. **User request:** the PDF became a direct download instead of a print dialog, and the Word layout was rebuilt from the Wiki's typography and spacing.
2. **PDF words ran together; title letters had gaps.** Fonts registered through the JS `FontFace` API don't reach html2canvas's cloned iframe. They're now declared as `@font-face` CSS and loaded explicitly.
3. **Word tables collapsed to one character wide.** Tables now get explicit DXA widths, `columnWidths` and a fixed layout.
4. **`/kb` hydration mismatch** (`DndDescribedBy-0` vs `-1`). Fixed with `DndContext id={useId()}`, applied to the Wiki space list and, on request, to all 7 other `DndContext`s in the app.
5. **The PDF failed in the Hub** with "unsupported color function `lab`": html2canvas 1.4 can't parse Tailwind v4 / shadcn `oklch()`/`color-mix()` colors. Fixed with `onclone` → `isolateExportStyles()`, which removes every stylesheet except the export's own from html2canvas's clone.
6. **PDF bold list titles overlapped their text; markers floated above them.** jspdf's `autoPaging: "text"` shifts later-drawn text by its page-break offsets, and html2canvas draws `<strong>` in a later pass. Fixed by breaking pages in the DOM before rendering (`insertPageBreakSpacers`: unbreakable blocks are pushed past boundaries, headings stay with the next block) and switching to plain `autoPaging: true`.
7. **PDF markers still sat slightly high.** html2canvas's own marker placement is replaced by real inline marker spans on each item's first line (`renderListMarkers`), giving 0.00pt baseline offset.
8. **Word showed serif text and large gaps in Pages.**
   - Source whitespace from pretty-printed imported HTML was copied into runs; it's now collapsed like a browser (`collapseWhitespace`).
   - Spacing and fonts are now explicit per paragraph and run.
   - Pages, TextEdit and Quick Look substitute Times for any font that isn't installed, and ignore embedding, font-table `altName`/`family` and name lists (all verified). So the .docx uses Arial / Courier New, as the user chose.
9. **Content `<h1>`/`<h4>`–`<h6>`** now render as body text in every export, matching the Wiki (Tailwind preflight behavior); only the export's own title is styled as a title.

### Final files (`src/app/(hub)/kb/`, all ≤ 137 lines)
- **Menu and dispatch:** `_wiki-export-menu.tsx`, `_wiki-export-formats.ts`
- **Shared:** `_wiki-export-shared.ts`, `_wiki-export-style.ts` (tokens + CSS), `_wiki-export-fonts.ts` (PDF font loading), `_wiki-export-whitespace.ts`
- **PDF:** `_wiki-export-pdf.ts`, `_wiki-export-pdf-pagination.ts`, `_wiki-export-pdf-markers.ts`
- **Word:** `_wiki-export-docx.ts`, `-docx-nodes.ts`, `-docx-boxes.ts`, `-docx-styles.ts`, `-docx-types.ts`
- **Markdown:** `_wiki-export-markdown.ts`
- **Modified:** `_wiki-doc-panel.tsx` (264 → 223 lines; `PILL_BUTTON`) and `_wiki-space-list.tsx` (DnD id)
- **Assets:** `public/fonts/wiki-export/*.ttf` + `OFL-*.txt`
- **Types:** `src/types/turndown-plugin-gfm.d.ts`
- **Dependencies:** `docx`, `turndown`, `turndown-plugin-gfm`, `@types/turndown` (dev)
- **Outside `/kb`:** the `DndContext` id fix in `projects/_shared/_board-view.tsx`, `_ticket-board-view.tsx`, the `projects-old` board views and `components/programme/phase-builder.tsx`

### Verification (final)
- `npx tsc --noEmit` PASS; `pnpm lint` PASS (0 errors, the same 2 pre-existing unrelated warnings).
- A scratchpad harness ran the real exporter modules against the **real CiteForge page HTML**:
  - **Chrome (PDF):** Hub-like global CSS; PDF operators checked for marker and title alignment; visual check including a page break.
  - **Node/jsdom (Word):** XML checks.
  - **Quick Look / macOS Word importer:** Arial render and spacing.
- **Tested live by the user during the task:** HTML, PDF and Word exports from `/kb`, which surfaced issues 5–8 above.
- **Not run by the agent:** opening the final `.docx` in Pages or Microsoft Word (Pages automation was blocked), and a final authenticated `/kb` re-export after the last round.

### Follow-ups (not in this task)
- The CiteForge page content starts with a literal "```html" and ends with "```": leftover markdown fences from the task 398 AI PDF-import transcription. Fix the importer (strip fences) and/or clean the stored page.
- Promote `downloadBlob()` to `src/lib/` and replace the 4 other inline `createObjectURL` download helpers.
- Word export uses Arial/Courier New by design (user decision), so the .docx intentionally doesn't use the Wiki's Inter/Space Grotesk typeface. Revisit only if a fallback-capable format becomes an option.

---

## Overview

The Wiki (`/kb`) document panel has an **Export ▾** menu (task 395). Only **Export as HTML** works today: it's a client-side Blob download built inline in `_wiki-doc-panel.tsx`. **PDF**, **Word (.docx)** and **Markdown** are shown as disabled rows with a "soon" pill, because task 395 found no doc-conversion library in the codebase.

This task makes all three work, **fully client-side** (no new API route). It also moves the export logic out of the 264-line doc panel into small, single-purpose colocated modules, following `nextjs-file-length-best-practices.md`. All formats are driven from one **format registry**, so the menu rows, the dispatcher and the filename/download plumbing are each written once (DRY).

Approach decisions (confirmed with the user during planning, 2026-09-24):

| Format | Approach | New dependency |
|---|---|---|
| HTML | Unchanged behavior. `buildStandaloneHtml()` moves into a shared module. | — |
| **PDF** | **Print dialog.** The same standalone HTML document goes into a hidden, sandboxed iframe, then `contentWindow.print()`. The user picks "Save as PDF". Text stays selectable, and tables, code and images render exactly like the HTML export. | none |
| **Word (.docx)** | **`docx` library**, dynamically imported. The page HTML is parsed with `DOMParser` and walked into `docx` `Paragraph`/`TextRun`/`Table`/`ImageRun` objects, then `Packer.toBlob()`. | `docx` |
| **Markdown** | **`turndown`** + its GFM plugin (for tables and strikethrough), dynamically imported. | `turndown`, `turndown-plugin-gfm`, `@types/turndown` (dev) |

## Requirements

- [ ] **Export as PDF** opens the browser print dialog with a print-styled render of the page: title as `<h1>`, then content. It must not print the Hub UI. The iframe is removed after printing, or by a fallback cleanup timer.
- [ ] **Export as Word (.docx)** downloads `<slug>.docx` that opens cleanly in Word and Google Docs. It preserves, at minimum:
  - the page title (Title/Heading 1)
  - H2/H3 → Heading 2/3
  - paragraphs
  - bold, italic, underline, strikethrough and inline code (monospace run)
  - links (`ExternalHyperlink`)
  - bullet and numbered lists, including nested levels
  - blockquotes (indented, shaded paragraph)
  - code blocks (monospace, line breaks preserved)
  - tables (header row bold)
  - images (fetched as `ArrayBuffer`, scaled to fit the page width)

  An image that fails to fetch is skipped with a placeholder text run ("[image unavailable]"). It must not fail the whole export.
- [ ] **Export as Markdown** downloads `<slug>.md`: `# {title}` + blank line + GFM markdown of the content. ATX headings, fenced code blocks, `-` bullets, and GFM tables.
- [ ] **Export as HTML** behaves exactly as today (same stylesheet and filename). The page `<title>`/`<h1>` is now HTML-escaped (a latent bug: `detail.title` is interpolated raw today).
- [ ] The menu is driven by a single format registry (`id`, `label`, `run`). No per-format copy-pasted buttons, and no "soon" pills remain.
- [ ] Each menu action shows a loading state while it runs: that row gets a spinner and all rows are disabled. The heavy libs are dynamically imported, so the first click takes a moment. A failure shows `toast.error(...)` (`sonner`, already mounted in `(hub)/layout.tsx`) and leaves the menu usable.
- [ ] Export uses the **saved** page (`detail.contentHtml`), never the unsaved edit draft. The Export button is already hidden in edit mode; keep that.
- [ ] Heavy libraries (`docx`, `turndown`, `turndown-plugin-gfm`) are loaded only via `await import(...)` inside the exporter, never at module top level. They must add nothing to the `/kb` initial bundle.
- [ ] Every new or modified file stays within `nextjs-file-length-best-practices.md` targets: components ≤ ~250 lines, utility files ≤ ~150 lines, functions ≤ ~50–75 lines. `_wiki-doc-panel.tsx` must end up **shorter** than its current 264 lines.

## Out of Scope / Must-Not-Change

- No server route or server-side conversion. Everything runs in the browser.
- No direct `.pdf` file download via jspdf/html2canvas. The print-dialog approach was chosen explicitly. Do **not** add `html2canvas`.
- Do not touch `_wiki-rte.tsx`, `_wiki-import-modal.tsx`, the `/api/wiki/**` routes, `src/types/wiki.ts` or migrations.
- Do not change the Export button's placement, style or visibility rules. It stays hidden in edit mode and is visible to all roles (read-only viewers can export).
- Do not refactor the four other inline `createObjectURL` download copies elsewhere in the app (`pm-dashboard.tsx`, `admin/migrate/_zoho-projects-tab.tsx`, `_zoho-desk-tab.tsx`, `_general-timelogs-card.tsx`). The wiki gets its own colocated `downloadBlob()`. Promoting it to `src/lib/` and migrating those call sites is a noted **follow-up**, kept out of this task to hold the blast radius to `/kb`. Per CLAUDE.md, only extract to shared locations once something is used across pages.
- No export of child pages or a whole space. Only the current page is exported.
- Don't use `dark:` classes (v2 convention). This page uses fixed light tokens anyway.

## Proposed File Changes

All new files are colocated in `src/app/(hub)/kb/`, using the existing `_wiki-*` underscore convention.

| File | Action | Purpose | Target lines |
|------|--------|---------|------|
| `package.json` | Modify | `pnpm add docx turndown turndown-plugin-gfm` + `pnpm add -D @types/turndown` | — |
| `src/types/turndown-plugin-gfm.d.ts` | Create | Minimal ambient module declaration (the plugin ships no types): `export const gfm: TurndownService.Plugin; export const tables…; export const strikethrough…` | ~10 |
| `_wiki-export-shared.ts` | Create | Shared primitives used by every exporter: `escapeHtml()`, `exportFilename(title, ext)` (today's slug regex, lifted verbatim), `downloadBlob(blob, filename)`, `buildStandaloneHtml(detail)` (today's template + print CSS + escaped title) | ~70 |
| `_wiki-export-pdf.ts` | Create | `printAsPdf(detail)`: hidden `sandbox="allow-same-origin allow-modals"` iframe, `srcdoc = buildStandaloneHtml(detail)`, wait for `load` + images, `print()`, cleanup on `afterprint` or a 60 s fallback timer | ~50 |
| `_wiki-export-markdown.ts` | Create | `exportMarkdown(detail)`: dynamic `turndown` + gfm, returns `.md` blob via `downloadBlob` | ~40 |
| `_wiki-export-docx.ts` | Create | `exportDocx(detail)`: dynamic `docx`, `DOMParser` → body, calls the block walker, `new Document({ numbering, styles, sections })`, `Packer.toBlob`, `downloadBlob` | ~80 |
| `_wiki-export-docx-nodes.ts` | Create | Pure HTML→docx mapping: `blockToDocx(el, ctx)` (h2/h3/p/ul/ol/blockquote/pre/table/img/hr) and `inlineRuns(node, marks, ctx)` (strong/em/u/s/code/a/br/text). `ctx` carries the imported `docx` module + a pre-fetched image map. Split from `_wiki-export-docx.ts` so each stays under ~150 lines. | ~150 |
| `_wiki-export-formats.ts` | Create | The **format registry**: `WIKI_EXPORT_FORMATS: { id: "html"\|"pdf"\|"docx"\|"md"; label: string; run: (detail) => Promise<void> }[]`, plus the HTML exporter (a 3-line wrapper over shared helpers). The single source of truth the menu maps over. | ~35 |
| `_wiki-export-menu.tsx` | Create | `WikiExportMenu({ detail })`: the Export ▾ button + dropdown (markup lifted from the doc panel), maps over `WIKI_EXPORT_FORMATS`, owns `open`/`busyId` state, handles try/catch + `toast.error`, spinner on the busy row | ~75 |
| `_wiki-doc-panel.tsx` | Modify | Delete `downloadHtml()` and the inline export dropdown and render `<WikiExportMenu detail={detail} />`. Drop `exportOpen` state and the now-unused `Download`/`FileDown`/`ChevronDown` imports. DRY the 4× repeated pill-button class string into one `PILL_BUTTON` constant (kept local), with per-button hover overrides via `cn()`. Update the header comment. | 264 → ~200 |

## Code Context

### `src/app/(hub)/kb/_wiki-doc-panel.tsx` (current export code, to be moved)

```tsx
// lines 26-40 — becomes buildStandaloneHtml() + exportFilename() + downloadBlob() in _wiki-export-shared.ts
function downloadHtml(detail: WikiPageDetail) {
  const page = `<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="UTF-8">\n<title>${detail.title}</title>\n` +
    `<style>body{font-family:Arial,Helvetica,sans-serif;max-width:720px;margin:40px auto;padding:0 20px;color:#0f172a;line-height:1.6;}` +
    `h2{font-size:18px;margin-top:28px;}h3{font-size:15px;}` +
    `blockquote{background:#eef3ff;border:1px solid #d7e3ff;border-radius:8px;padding:12px 14px;margin:0 0 16px;}` +
    `pre{background:#0f172a;color:#e2e8f0;padding:12px 14px;border-radius:6px;overflow-x:auto;}</style>\n</head>\n<body>\n` +
    `<h1>${detail.title}</h1>\n${detail.contentHtml}\n</body>\n</html>`;
  const blob = new Blob([page], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${detail.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").toLowerCase() || "page"}.html`;
  a.click();
  URL.revokeObjectURL(url);
}
```

```tsx
// lines 156-184 — the dropdown to lift into _wiki-export-menu.tsx (keep this exact styling)
<div className="relative">
  <button type="button" onClick={() => setExportOpen((v) => !v)}
    className="flex items-center gap-1.5 text-[12px] font-semibold text-[#5F6A88] border border-[#E2E7F2] bg-white rounded-full px-3.5 py-1.5 cursor-pointer transition-colors hover:border-[#A8C6F5]">
    <Download size={12} /> Export <ChevronDown size={11} />
  </button>
  {exportOpen && (
    <>
      <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
      <div className="absolute right-0 top-[calc(100%+6px)] z-50 min-w-[180px] bg-white border border-[#E2E7F2] rounded-[10px] shadow-[0_8px_24px_rgba(7,17,51,.10)] p-1.5">
        <button type="button" onClick={...}
          className="w-full flex items-center gap-2 text-left text-[12.5px] text-[#3A4565] rounded-[7px] px-2.5 py-2 cursor-pointer transition-colors hover:bg-[#F4F6FB]">
          <FileDown size={13} /> Export as HTML
        </button>
        {["PDF", "Word (.docx)", "Markdown"].map((label) => ( /* disabled "soon" rows — delete */ ))}
      </div>
    </>
  )}
</div>
```

Notes:
- The backdrop `<div onClick>` is an existing overlay-dismiss pattern, not an action. It's acceptable to keep, but give it `aria-hidden`. Add `aria-haspopup="menu"` and `aria-expanded` on the trigger, and `role="menu"`/`role="menuitem"` on the list and rows. Close on `Escape`.
- The pill-button class `flex items-center gap-1.5 text-[12px] font-semibold text-[#5F6A88] border border-[#E2E7F2] bg-white rounded-full px-3.5 py-1.5 cursor-pointer transition-colors hover:border-[#A8C6F5]` is repeated for Cancel, Edit, Delete and Export. Define it once as a `PILL_BUTTON` const in the panel and pass it to the menu as a `triggerClassName` prop, so the string exists in exactly one place. Don't put it in `_wiki-export-shared.ts`, which is non-UI.

### `src/types/wiki.ts`, `WikiPageDetail` (read-only for this task)

```ts
export type WikiPageDetail = WikiPageSummary & {
  contentHtml: string; tags: string[]; createdAt: string;
  createdBy: WikiContributor | null; updatedBy: WikiContributor | null;
  contributors: WikiContributor[]; relatedPages: WikiPageSummary[];
};  // WikiPageSummary has: id, product, parentId, title, status, sortOrder, version, updatedAt
```

### What `contentHtml` contains (the input to every exporter)

Tiptap output from `_wiki-rte.tsx` (StarterKit + Image + Table), or sanitized import HTML (task 396): `h2`, `h3`, `p`, `strong`, `em`, `u`, `s`, `code`, `a`, `br`, `ul`/`ol`/`li` (nested), `blockquote`, `pre>code`, `hr`, `img[src]`, `table>tbody>tr>th|td` (Tiptap puts header cells as `<th>` in the first row, **no `<thead>`**; turndown-gfm's table rule needs a heading row, so verify the first-row `<th>` case converts, and pre-process to wrap the first row in `<thead>` if it doesn't). Imported `.docx`/`.md` content may also contain `h1`/`h4`–`h6`: map h1 → Heading 1 and h4+ → Heading 3 in docx; turndown handles them natively.

**Images** are public Supabase Storage URLs (`task-content` bucket, via `getPublicUrl` in `src/app/api/wiki/pages/[pageId]/description-images/route.ts:53`), so the browser can `fetch(src)` them for the docx `ImageRun`. Get dimensions via `createImageBitmap(blob)` (or an `Image` load) and scale to ≤ 600 px wide, preserving the aspect ratio. Pre-fetch all images in parallel **before** walking the tree, so the walker stays synchronous. The `ctx.images: Map<src, {data, width, height, type}>` is built in `_wiki-export-docx.ts`. `ImageRun` needs `type: "png" | "jpg" | "gif" | "bmp"`: derive it from the blob MIME. For unsupported types (webp/svg), rasterize via canvas → PNG, reusing the `loadImageAsDataUrl` idea from `src/app/(hub)/dashboard/timelogs/_export-pdf.ts:26-40` (don't import it across routes; it's ~12 lines, so re-implement locally or skip that image with the placeholder).

### Existing dynamic-import precedent (same folder), from `_wiki-import-modal.tsx:33`

```ts
const { default: DOMPurify } = await import("dompurify");
```

Use the same pattern: `const docx = await import("docx");`, `const { default: TurndownService } = await import("turndown");`, `const { gfm } = await import("turndown-plugin-gfm");`.

### PDF print: security note

`contentHtml` is sanitized on import (task 396) and produced by Tiptap otherwise, but the print iframe renders it **same-origin** via `srcdoc`. The iframe **must** carry `sandbox="allow-same-origin allow-modals"` with **no `allow-scripts`**. That blocks any script in stored content, while the parent can still call `iframe.contentWindow.print()` (which needs same-origin; Chrome also needs `allow-modals` for print inside a sandboxed frame). Also escape the title (`escapeHtml`) in `buildStandaloneHtml`. Position the iframe off-screen (`position:fixed; width:0; height:0; border:0`, applied via `iframe.style` in the DOM API, not JSX, which is fine). Add `@media print` rules to the standalone stylesheet: `pre{white-space:pre-wrap}`, `img{max-width:100%}`, `table{border-collapse:collapse} td,th{border:1px solid #ddd;padding:6px}`, `h2,h3{break-after:avoid}`, `tr,img,pre{break-inside:avoid}`. These rules also improve the HTML export (shared stylesheet, DRY).

### docx library shape (v9, verify against the installed `.d.ts` during implementation)

```ts
const { Document, Packer, Paragraph, TextRun, HeadingLevel, ExternalHyperlink, Table, TableRow,
        TableCell, WidthType, ImageRun, LevelFormat, AlignmentType, ShadingType } = docx;
// Numbered lists need a numbering config: new Document({ numbering: { config: [{ reference: "wiki-ol", levels: [...0..8 LevelFormat.DECIMAL] }] }, sections: [{ children }] })
// Bullets: new Paragraph({ children, bullet: { level } })
// Numbered: new Paragraph({ children, numbering: { reference: "wiki-ol", level } })
```

The planning stage assumed the API shape (as task 396 learned with `pdf-parse` v2): **read `node_modules/docx/dist/index.d.ts` before writing the mapper** and adapt if it differs.

## Implementation Steps

1. `pnpm add docx turndown turndown-plugin-gfm` and `pnpm add -D @types/turndown`. Confirm the installed `docx` major version and its exports.
2. Create `src/types/turndown-plugin-gfm.d.ts` (ambient module).
3. Create `_wiki-export-shared.ts`: `escapeHtml`, `exportFilename` (lift today's slug regex exactly), `downloadBlob`, and `buildStandaloneHtml`. For `buildStandaloneHtml`, lift today's CSS, add the table and `@media print` rules, and escape the title.
4. Create `_wiki-export-pdf.ts` (`printAsPdf`). Resolve once the iframe's `load` fires and every `<img>` inside it has `complete` (or 5 s max). Then `focus()` + `print()`. Clean up on `afterprint`, with a fallback timer.
5. Create `_wiki-export-markdown.ts` (`exportMarkdown`). Configure turndown with `headingStyle: "atx"`, `codeBlockStyle: "fenced"`, `bulletListMarker: "-"` and `.use(gfm)`. If needed, pre-process the parsed doc so a first `<tr>` of `<th>` sits in a `<thead>`. Prepend `# ${title}\n\n`.
6. Create `_wiki-export-docx-nodes.ts` (pure mapper) and then `_wiki-export-docx.ts` (orchestration: parse → pre-fetch images → walk → `Document` → `Packer.toBlob` → `downloadBlob`). Keep every function ≤ ~50 lines. Use a `switch` on `tagName` with small helper functions (`listToParagraphs`, `tableToDocx`, `codeBlockToParagraphs`), not one giant function.
7. Create `_wiki-export-formats.ts` (the registry: HTML, PDF, Word (.docx), Markdown, in that order, matching today's menu order).
8. Create `_wiki-export-menu.tsx` (lifted markup + registry map + `busyId` + `toast.error` + a11y attributes + Escape-to-close). Take `triggerClassName` from the panel.
9. Edit `_wiki-doc-panel.tsx`: remove `downloadHtml` and the inline dropdown, add `PILL_BUTTON`, render `<WikiExportMenu detail={detail} triggerClassName={PILL_BUTTON} />`, prune imports and state, and update the header comment (task 400: all four export formats live).
10. `npx tsc --noEmit` and `pnpm lint`. Then `wc -l` every touched file in `src/app/(hub)/kb/_wiki-export*` + `_wiki-doc-panel.tsx` to confirm the length targets.

## Acceptance Criteria

- [ ] Export ▾ shows four enabled rows (HTML, PDF, Word (.docx), Markdown), with no "soon" pills.
- [ ] HTML: the downloaded file is identical in content to before (plus table/print CSS), and a title containing `<b>` renders as literal text.
- [ ] PDF: the print dialog opens showing only the page title and content (no sidebar or Hub chrome). Images, tables and code blocks are visible, and a long code line wraps. Canceling the dialog leaves no stray iframe in the DOM (check after ≤ 60 s).
- [ ] Word: the `.docx` opens in Word/Google Docs with correct headings, bold/italic/underline/strike, links, nested bullet and numbered lists, blockquote, code block, a table with a bold header row, and embedded images. A page containing a broken image URL still exports, with the placeholder text in its place.
- [ ] Markdown: the `.md` starts with `# Title`, has ATX headings, fenced code, `-` bullets, a GFM pipe table for a Tiptap table, and `![alt](url)` images.
- [ ] While an export runs, its row shows a spinner and the other rows are disabled. A forced failure (e.g. throwing inside `run`) shows a toast and the menu recovers.
- [ ] The `/kb` initial JS doesn't include `docx`/`turndown` (verify via Network tab: those chunks load only on first click).
- [ ] A read-only role (e.g. `hr`) can use all four exports. In edit mode the Export button remains hidden.
- [ ] `_wiki-doc-panel.tsx` < 264 lines, every new `.ts` ≤ ~150 lines, `_wiki-export-menu.tsx` ≤ ~100 lines.

## Verification

```bash
npx tsc --noEmit
pnpm lint
wc -l "src/app/(hub)/kb/_wiki-doc-panel.tsx" src/app/\(hub\)/kb/_wiki-export*
pnpm dev   # then browser acceptance on /kb
```

Browser acceptance (Claude in Chrome if connected): open a page that has H2/H3, lists (nested), a blockquote, a code block, a table and a pasted image. Run each of the four exports and inspect the outputs (open the `.docx` and `.md` files, look at the print preview). Caveat carried from tasks 395–399: **migration 149 is still written, not applied**. If the live DB has no `wiki_pages`, browser acceptance is blocked. In that case, report it as NOT RUN rather than claiming it passed.

## Compatibility Touchpoints

- **Dependencies:** `docx`, `turndown`, `turndown-plugin-gfm` (runtime) and `@types/turndown` (dev). All are browser-safe and dynamically imported. Nothing is added to `serverExternalPackages`, since nothing runs server-side.
- **Types:** a new ambient declaration, `src/types/turndown-plugin-gfm.d.ts`.
- **Docs:** update CLAUDE.md only if the implementer finds a reusable gotcha (e.g. a docx API or print-sandbox quirk). Otherwise no durable-instruction change. The `_wiki-doc-panel.tsx` header comment must be updated (it currently says PDF/Word/Markdown stay disabled).
- **Follow-up (not this task):** promote `downloadBlob()` to `src/lib/` and replace the 4 other inline `createObjectURL` copies across the app.

---

## Implementation Notes

### What Changed
- All four Export ▾ formats now work, fully client-side. **PDF** = print dialog over a hidden `sandbox="allow-same-origin allow-modals"` iframe (no `allow-scripts`) showing the same standalone document the HTML export downloads. The frame waits for images (≤ 5 s) and cleans up on `afterprint`, or on a 60 s fallback. **Word** = `docx` 9.7.2: the `DOMParser` tree is walked into Paragraph/TextRun/ExternalHyperlink/Table/ImageRun. Images are pre-fetched in parallel via `Promise.allSettled`, scaled to ≤ 600 px, and non-png/jpg/gif/bmp images are re-encoded to PNG through a canvas. A failed image becomes an italic "[image unavailable]" run. Each top-level `<ol>` gets its own numbering `instance`, so numbering restarts per list. **Markdown** = `turndown` + `turndown-plugin-gfm`, with ATX headings, fenced code, `-` bullets, pipe tables and `~~strike~~`.
- Export logic moved out of `_wiki-doc-panel.tsx` into colocated single-purpose modules, driven by one registry (`WIKI_EXPORT_FORMATS`). The menu maps over it, so there are no per-format buttons. The filename slug, `downloadBlob` and the standalone HTML template each exist once (`_wiki-export-shared.ts`).
- The menu now has a per-row spinner while an export runs, disables the other rows, shows `toast.error` on failure, closes on Escape, and carries `aria-haspopup`/`aria-expanded`/`role="menu|menuitem"`.
- HTML export: same stylesheet plus table and `@media print` rules. The title is now HTML-escaped (verified: `<b>` in a title renders as `&lt;b&gt;`).
- `_wiki-doc-panel.tsx`: the 4× repeated pill-button class string became one `PILL_BUTTON` const, passed to the menu as `triggerClassName`. 264 → 223 lines.

### Files Changed
- `package.json` / `pnpm-lock.yaml` – `docx@9.7.2`, `turndown@7.2.4`, `turndown-plugin-gfm@1.0.2`, and dev `@types/turndown@5.0.6`
- `src/types/turndown-plugin-gfm.d.ts` – new ambient module declaration
- `src/app/(hub)/kb/_wiki-export-shared.ts` – new (55 lines): `escapeHtml`, `exportFilename`, `downloadBlob`, `buildStandaloneHtml`, `parseContentHtml`
- `src/app/(hub)/kb/_wiki-export-pdf.ts` – new (57): `printAsPdf`
- `src/app/(hub)/kb/_wiki-export-markdown.ts` – new (52): `exportMarkdown`
- `src/app/(hub)/kb/_wiki-export-docx.ts` – new (80): `exportDocx` + image prefetch
- `src/app/(hub)/kb/_wiki-export-docx-nodes.ts` – new (150): pure HTML → docx mapper (type-only import of `docx`)
- `src/app/(hub)/kb/_wiki-export-formats.ts` – new (23): the format registry
- `src/app/(hub)/kb/_wiki-export-menu.tsx` – new (78): `WikiExportMenu`
- `src/app/(hub)/kb/_wiki-doc-panel.tsx` – removed `downloadHtml` and the inline dropdown, added `PILL_BUTTON`, rendered `<WikiExportMenu>`, updated the header comment

### Deviations From Plan
- **Exporter modules are lazy too, not just the libraries.** The registry loads `_wiki-export-docx`/`_wiki-export-markdown` with `await import(...)`, so even the mapper code stays out of the `/kb` initial bundle. PDF and HTML are imported statically because they're tiny and dependency-free.
- **Markdown needed one more normalization than planned.** Tiptap wraps `<li>`, `<th>` and `<td>` text in `<p>`, and turndown then produced loose lists and broken multi-line table cells. Found via a harness run, fixed by unwrapping a lone `<p>` in those elements (alongside the planned first-row → `<thead>` lift).
- **Strikethrough override.** `turndown-plugin-gfm` emits single-tilde `~x~`. An `addRule` override emits `~~x~~`, which every renderer accepts.
- **Heading mapping bug caught in the harness.** The first draft mapped h2 → Heading 1. Corrected to h1→H1, h2→H2, h3+→H3, and re-verified.
- **Cancel button.** It now shares `PILL_BUTTON`, which adds `flex items-center gap-1.5`. That's a no-op for a text-only button.
- **Design hook false positive, left unchanged.** It flagged `Arial` in `STANDALONE_CSS`. That stylesheet was lifted verbatim from task 395's HTML export, which is deliberately decoupled from app fonts so the file renders standalone (already documented in task 395's review).

### Verification Run
- `npx tsc --noEmit` – PASS
- `pnpm lint` – PASS (0 errors; the same 2 pre-existing unrelated warnings in `_checklist-tab.tsx`)
- Exporter harness – PASS. The real modules were bundled with esbuild and run under jsdom 24 in the scratchpad (not in the project), against a Tiptap-shaped sample page with h2/h3, marks, a link, `<br>`, nested ul/ol, a blockquote, a code block, a `<th>`-first-row table, a good image, a 404 image and an hr.
  - Markdown output is valid GFM: tight nested lists, a pipe table, fenced code and `~~s~~`.
  - The `.docx` contains 6 list paragraphs across 3 numbering ids, 1 table, 1 embedded drawing, 1 hyperlink and the "[image unavailable]" placeholder, with styles Title/Heading2/Heading3/ListParagraph.
  - macOS `textutil` parsed the `.docx` cleanly, with all content present.
  - HTML title escaping was confirmed.
- `pnpm dev` + `curl /kb` – PASS (307 to sign-in, no compile or server errors in the dev log). The dev server was stopped afterwards.
- Browser acceptance – **NOT RUN**:
  - no authenticated session
  - migration 149 (`wiki_pages`, task 395) is still written, not applied
  - the PDF print dialog, the real Word/Google Docs open, Storage-image CORS and the lazy-chunk Network-tab check all still need a live pass

---

## Quality Gate Notes

### Result
PASS

### Standards Review
- **Fixed in this pass** (all behavior-neutral; re-verified with `tsc` PASS, `lint` PASS with 0 errors and the same 2 pre-existing warnings, and a harness re-run with identical output and a `.docx` that still parses):
  - `escapeHtml` (`_wiki-export-shared.ts`) and `inlineRuns` (`_wiki-export-docx-nodes.ts`) were exported but only used inside their own file. They're now module-private, which trims the public surface.
  - `paragraphFrom`'s `extra` param was a loose `Record<string, unknown>` escape hatch. It's now `Omit<IParagraphOptions, "children">` (a type-only import from `docx`), so heading/numbering/border/shading options are type-checked.
  - `blockquoteToParagraphs` passed `{ ...marks, italics: false }`, an override with no purpose that could have been read as intentional. Now it passes `marks` through.
- **Checked, no issues:**
  - No dead or commented-out code, and no `any`.
  - Each file has one responsibility. The largest is `_wiki-export-docx-nodes.ts` at 150 lines, where the largest function is `listToParagraphs` (~20 lines). No function exceeds ~30 lines.
  - Guard-clause style is used throughout the walker. No secrets.
- `console.error("[wiki-export] …")` in `_wiki-export-menu.tsx` is intentional failure logging next to the user-facing toast, consistent with the repo's `[tag]` console convention. It's not debug noise, so it stays.
- **DRY confirmed:**
  - The filename slug, the Blob download and the standalone HTML template each exist once.
  - The standalone HTML is shared by the HTML and PDF exports.
  - The menu rows come from the registry.
  - The pill-button class exists once and is passed to the menu via `triggerClassName`.
  - `parseContentHtml` is shared by the Word and Markdown exporters.
- **Scope boundaries respected:**
  - Untouched: `_wiki-rte.tsx`, `_wiki-import-modal.tsx`, `/api/wiki/**`, `src/types/wiki.ts`, migrations, and the four other inline `createObjectURL` sites.
  - No `html2canvas` or server route was added.
  - The Export button is still hidden in edit mode and visible to all roles.

### Deviations
- **Minor:** exporter modules are lazy-loaded too, not just the libraries. This is stricter than the plan's requirement, with the same user-facing behavior.
- **Minor:** Markdown pre-processing also unwraps a lone `<p>` inside `li`/`th`/`td`. It was needed to meet the "GFM tables" acceptance criterion against real Tiptap output, and stays within scope.
- **Minor:** a strikethrough `addRule` override emits `~~x~~` instead of the plugin's `~x~`. It serves the Markdown requirement.
- **Minor:** the Cancel button inherits `flex items-center gap-1.5` from `PILL_BUTTON`. It's a text-only button, so there's no visual change.
- No Medium or Major deviations.

### Required Fixes
- None.

---

## Revision 1 — Wiki-faithful Word layout + direct PDF download (user request, 2026-09-24)

User request: *"Structure the Export Docx output properly based on the fonts and spacing on the Wiki document. If the font do not exist on word or docx, fallback to free sans serif fonts. For the PDF, I want an auto-export/download, not the Save to PDF one."* This supersedes two planning decisions: the print-dialog PDF, and "do not add html2canvas". No new npm dependency was needed, because `html2canvas` is already installed as jspdf's optional dependency and jspdf loads it itself.

### What Changed
- **One style spec for every format.** The new `_wiki-export-style.ts` holds the read view's typography and spacing as tokens, mirrored from `_wiki-doc-panel.tsx`'s read-mode Tailwind classes:
  - fonts: Inter body, Space Grotesk headings, JetBrains Mono code
  - sizes: 13px body at 1.7 line-height, 22 / 15 / 13px title / H2 / H3
  - paragraph, heading, list, callout, code, table-header and image spacing
  - colors and the page setup (A4, 48pt margins)

  `buildWikiCss()` generates the `.wiki-export`-scoped stylesheet that the HTML and PDF exports use, and the Word styles are derived from the same tokens.
- **Fonts.** Static TTFs of Inter (400/700 plus italics), Space Grotesk 700 and JetBrains Mono 400/700 are in `public/fonts/wiki-export/` (~1.6 MB, SIL OFL; the `OFL-*.txt` license texts sit next to them, as the license requires). `_wiki-export-fonts.ts` fetches them on the first export and caches them for the session. A face that fails to load is simply left out, a warning is logged, and a later export retries.
  - **Word:** the fonts are embedded in the `.docx`. `docx` allows one face per family, so the file ships Inter Regular, Space Grotesk Bold and (only when the page has code) JetBrains Mono Regular. Adds ~255 KB.
  - **PDF:** all 7 faces are registered with jspdf and subset into the file.
  - **Fallback.** When a Wiki font didn't load, Word falls back to the free, OFL-licensed Noto Sans / Noto Sans Mono. The PDF CSS stack falls through to `sans-serif`, which jspdf maps to Helvetica. The HTML export's CSS stack is `"Inter", "Noto Sans", sans-serif` (and the equivalents for headings and code).
- **Word layout rebuilt from the tokens.** The Word export is now split into `-docx-types` / `-docx-nodes` / `-docx-boxes` / `-docx-styles` / `-docx`:
  - Document default, Title, H1–H3, ListParagraph and Hyperlink styles carry the Wiki's fonts, sizes, colors, heading `before`/`after` spacing, letter-spacing and 1.7 line height.
  - Custom bullet (•◦▪) and decimal numbering use the Wiki's 20px indent step.
  - **Code block:** dark `#0F172A` box, `#D7E0F7` JetBrains Mono text, 1.6 line height, padding emulated with a same-color border `space` plus an indent.
  - **Blockquote:** `#EEF3FF` fill, `#D7E3FF` border, `#243B6B` text.
  - **Table:** header cells are small bold uppercase `#5F6A88` on a `#FAFBFE` fill, with horizontal `#EDF0F7` rules only, the Wiki's cell padding, and fixed, explicit, evenly split column widths.
  - Paragraphs that hold only an image get the 12px image margin. Inline code and links pick up their own fonts and colors.
- **PDF is now a direct `.pdf` download** (`_wiki-export-pdf.ts` rewritten). The page is rendered into an off-screen `.wiki-export` host (sanitized again with DOMPurify, because a live element would run inline event handlers). jspdf `html()` with `autoPaging: "text"` converts it to vector, selectable text, then `downloadBlob(doc.output("blob"), "<slug>.pdf")`. The page is A4, the same as the Word export.
- The registry now lazy-loads the PDF exporter as well (`_wiki-export-formats.ts`).

### Bugs Found and Fixed During Browser Verification
- **Words ran together and the title had letter gaps in the first PDF.** Fonts registered through the JS `FontFace` API aren't copied into the iframe clone that html2canvas lays out in. So layout used a fallback font while jspdf drew Inter glyphs at those positions. Fixed by declaring the loaded faces as CSS `@font-face` rules in the injected stylesheet (`fontFaceCss()`), and forcing each face to load with `document.fonts.load()` before rendering.
- **Word table columns collapsed to one character wide.** `docx` tables need explicit widths. Fixed with a `DXA` table width, `columnWidths` and per-cell widths (text column ÷ column count), plus `TableLayoutType.FIXED`. Verified in the XML (`tblW 9984`, 2 × `gridCol 4992`).

### Files Changed (this revision)
- `public/fonts/wiki-export/*.ttf` + `OFL-*.txt`: new font assets and their license texts
- `src/app/(hub)/kb/_wiki-export-style.ts`: new style tokens, `buildWikiCss()`, page setup and unit conversions
- `src/app/(hub)/kb/_wiki-export-fonts.ts`: new font manifest, cached loader, `fontFaceCss()`, `toBase64()`
- `src/app/(hub)/kb/_wiki-export-docx-types.ts` / `_wiki-export-docx-boxes.ts` / `_wiki-export-docx-styles.ts`: new
- `src/app/(hub)/kb/_wiki-export-docx-nodes.ts` / `_wiki-export-docx.ts`: reworked to use the styles and embedded fonts
- `src/app/(hub)/kb/_wiki-export-pdf.ts`: rewritten as a direct download
- `src/app/(hub)/kb/_wiki-export-shared.ts`: `buildWikiArticleHtml()` is shared by HTML and PDF; `buildStandaloneHtml()` now uses `buildWikiCss()`
- `src/app/(hub)/kb/_wiki-export-formats.ts`: PDF entry is lazy-loaded

All files are ≤ 115 lines; `_wiki-doc-panel.tsx` is unchanged at 223.

### Verification Run
- `npx tsc --noEmit`: PASS
- `pnpm lint`: PASS (0 errors; the same 2 pre-existing unrelated warnings)
- **Real Chrome.** A scratchpad harness page served the real exporter modules (esbuild bundle) and the real font files:
  - **PDF:** a 489 KB `.pdf` in ~1.5 s. Visually checked:
    - Space Grotesk title and headings, Inter body, JetBrains Mono code
    - correct word and letter spacing after the fix
    - blue callout, dark code block, small-caps table header with rules
    - bullets and numbering, image
    - text is selectable
  - **PDF fallback** (font requests forced to 404): a 76 KB PDF in Helvetica/Courier with the same layout, and the `[wiki-export] 7 font face(s) unavailable` warning logged.
  - **Word:** a 255 KB `.docx` with 3 embedded `.odttf` fonts and the image included.
- **Node/jsdom harness (Word).** Styles use `Space Grotesk`/`Inter` when the fonts load and `Noto Sans` when they're missing. Numbering has 4 instances. Shading fills are `0F172A`/`EEF3FF`/`FAFBFE`, and the colors match the tokens.
- **Quick Look render of the `.docx`:** structure, headings, lists, links, callout and image are all in place. Quick Look's docx renderer ignores embedded fonts, paragraph shading, docDefaults spacing and table widths, so those were verified in the XML instead.
- **Not verified:**
  - opening the `.docx` in real Microsoft Word or Google Docs (neither is installed)
  - whether Word keeps the embedded fonts on re-save: `docx` doesn't write `w:embedTrueTypeFonts` to settings.xml, which I believe affects only re-saving, not reading
  - an authenticated `/kb` browser pass (migration 149 is still unapplied)

### Known Limitations
- Word can embed only one face per family, so bold or italic Inter in the `.docx` is synthesized by Word unless the reader has Inter installed. Google Docs has all three families natively.
- The PDF is A4 (as is the Word export). Letter would be a one-token change in `WIKI_PAGE`.

### Side fix — /kb hydration mismatch (user-reported, 2026-09-24)
- **Symptom:** a Next dev overlay "A tree hydrated but some attributes … didn't match": `aria-describedby="DndDescribedBy-0"` (client) vs `"DndDescribedBy-1"` (server), on `SortableSpaceRow`'s drag handle in `_wiki-space-list.tsx` (task 399's space reorder, not the export code).
- **Cause:** `@dnd-kit/core` builds its accessibility ids from a module-level counter when `DndContext` gets no `id`, and that counter differs between the SSR pass and hydration.
- **Fix:** `DndContext id={useId()}`. React's `useId` is identical on the server and the client.
- **Checks:** `tsc` PASS, `lint` PASS (0 errors, the same 2 pre-existing warnings).
- **Not changed (out of scope):** 5 other `DndContext` usages have no `id` either:
  - `projects/_shared/_board-view.tsx`
  - `projects/_shared/_ticket-board-view.tsx`
  - `projects-old/[projectId]/_board-view.tsx`
  - `projects-old/[projectId]/_ticket-board-view.tsx`
  - `components/programme/phase-builder.tsx`

  Those are only at risk if they render during SSR.
- **Follow-up applied (user request):** the same `id={useId()}` fix is now in all 5, covering 7 `DndContext`s (`phase-builder.tsx` has 3, one per component: checklist items, deliverables and phases, each with its own `useId`). Every `DndContext` in `src/` now has a stable id. `tsc` PASS, `lint` PASS (0 errors, the same 2 pre-existing warnings). Behavior is unchanged apart from the aria-id values; not browser-checked.

### Fix — PDF export failed in the Hub: "Attempting to parse an unsupported color function \"lab\"" (user-reported, 2026-09-24)
- **Cause:** html2canvas 1.4.1 (used by jspdf `html()`) can't parse modern CSS color functions. `globals.css:173-174` (the shadcn base layer) applies `* { @apply border-border outline-ring/50 }`, which gives every element an `oklch()` border color and a `color-mix()` outline color. Chrome serializes the outline as `lab()`/`oklab()`. html2canvas clones the whole page, so the export article inherited those rules.
- **Why the Revision 1 harness missed it:** the harness page had no app CSS.
- **Fix:** in `_wiki-export-pdf.ts`, `html2canvas.onclone` (passed through by jspdf via `Object.assign({...}, this.opt.html2canvas)`, and present in jspdf's `Html2CanvasOptions` type) calls `isolateExportStyles()`. That removes every `<style>`/`<link rel="stylesheet">` in html2canvas's cloned document except the export's own, marked with `data-wiki-export-style`. The article then renders from `buildWikiCss()` alone (hex colors only), identical to the harness conditions that were already visually verified. The live Hub page is never touched; only html2canvas's throwaway clone is.
- **Verification:**
  - `tsc` PASS, `lint` PASS (0 errors, the same 2 pre-existing warnings)
  - Real Chrome harness with Hub-like global CSS added (`* { border-color: oklch(...); outline-color: color-mix(in oklab, ...) }`; the probe computed `oklab(0.708 0 0 / 0.5)`):
    - a **control** build without the fix threw `Attempting to parse an unsupported color function "oklch"`, the same failure
    - the fixed build produced a 489 KB PDF, visually identical to the earlier verified render
  - Not yet re-tested on the real authenticated `/kb` page.

### Fix — PDF list markers misaligned / bold item titles overlapping their text (user-reported, 2026-09-24)
- **Symptom (real CiteForge page):** bullets and numbers sat on their own line above the item text; each item's bold title collided with the description line under it; the numbered list's last item was detached onto page 2.
- **Diagnosis:** reproduced in the scratchpad harness with list-markup variants. I then read the text operators straight out of the generated PDF, because hooking jspdf's context2d didn't capture calls: that class is created per document.
  - The bold runs were drawn *after* everything else, and ~5.1pt lower than their line. Example: the marker was at y=578.26, the description at 562.48, and the bold title at 573.13 instead of ~578.7.
  - A one-page file was fine, and switching `autoPaging` from `"text"` to `true` put the title at 578.70.
- **Root cause:** jspdf's `autoPaging: "text"` (context2d `putText`) keeps a running `prevPageLastElemOffset`. When any text line would cross a page's bottom margin, jspdf re-flows it to the next page and adds that overflow to the offset, which shifts every text run drawn afterwards. html2canvas draws in paint order, not reading order: plain text first, inline runs such as `<strong>` in a later pass. So those runs picked up offsets from page breaks further down the document. The markers and plain text had already been drawn without them.
- **Fix:**
  - The new `_wiki-export-pdf-pagination.ts` (`insertPageBreakSpacers`) does the page breaking in the DOM before jspdf renders:
    - **Units:** it measures the unbreakable blocks in reading order. Atomic units are `pre`, `blockquote`, `tr`, `img` and `hr`. Innermost `p`/`h1`–`h6`/`li` count as text units.
    - **Spacers:** any unit that would straddle a page boundary gets a spacer inserted before it. A `<div>`, or a `<tr><td>` for table rows, is placed before the unit's outermost first-child ancestor, so a list's first item moves together with its marker. The spacer is topped up if margin collapsing swallows part of it.
    - **Keep with heading:** a heading directly before a moved block is moved together with it.
    - **Oversized units:** units taller than a page are left to be sliced.
  - `_wiki-export-pdf.ts` computes one page's text area in CSS px (`(pageH − 2·margin) ÷ (contentWidthPt ÷ 680)`, ≈ 1016px) and switches to `autoPaging: true`, plain slicing, which now only ever cuts through spacer or empty space.
  - `_wiki-export-style.ts` adds `.wiki-export h4,h5,h6 { font-size: inherit; font-weight: inherit; margin: 0 }`. The Wiki read view gets that from Tailwind's preflight, which the previous fix (`isolateExportStyles`) strips from html2canvas's clone, so imported `<h4>` item titles had picked up UA margins.
- **Verification:**
  - `tsc` PASS; `lint` PASS (0 errors, the same 2 pre-existing warnings); `_wiki-export-pdf.ts` is 101 lines, `_wiki-export-pdf-pagination.ts` 79.
  - Real Chrome harness with a 2-page CiteForge-shaped page and the Hub-like `oklch`/`color-mix` global CSS:
    - `strong`+`br` items, `p`+`p` items, a 5-item numbered list near the page break, and inline `strong:` items all render correctly.
    - PDF operator check: **0 of 63** bold runs off their line's baseline, against ~5pt off before.
    - Visual check: markers are aligned with the titles and there are no overlaps. The page break falls between paragraphs, and "How It Works" moved to page 2 together with its list.
  - Not re-tested on the real authenticated `/kb` CiteForge page.
- **Not addressed (content, not export):** the CiteForge page's content starts with a literal "```html" line. That's a markdown code fence left over from the task 398 AI PDF-import transcription; it's stored in the page itself and appears in every view, not just the export.

### Fix — PDF markers still slightly high; DOCX serif fonts + broken spacing (user-reported, 2026-09-24)
Diagnosed against the **real** CiteForge page. Its `content_html` was read read-only via PostgREST with the local `.env` service key; no secrets were printed, and a copy of the HTML was saved to the scratchpad for the harness. The page is raw AI-imported markup (task 398): a leading "```html" fence, `<header><h1>…</h1><p><em>…</em></p></header>`, `<main><section>…`, and pretty-printed `<li>\n        <strong>Title</strong><br>\n        Description\n      </li>` items.

**PDF: list markers**
- **Cause:** html2canvas 1.4 draws `list-style` markers with its own positioning, a few pt above the text baseline.
- **Fix:** the new `_wiki-export-pdf-markers.ts` (`renderListMarkers`, 45 lines) turns native markers off on the off-screen render host and puts a real inline-block `.wiki-export-marker` span (•/◦/▪ by depth, or `N.` honoring `<ol start>`) at the start of each item's first line. It descends through leading `p`/`h*`/`div` wrappers and first strips leading source whitespace, which otherwise rendered as a space after the marker. The marker CSS is in `buildWikiCss()`: width = the list indent, negative margin, right-aligned.
- **Verified in the PDF operators:** every marker has a baseline offset of 0.00pt from its text, bold titles and descriptions both start at x=62.7, and the visual check matches.

**PDF/HTML: content `<h1>`**
- The Wiki read view shows content `h1` (and `h4`–`h6`) as body text via Tailwind preflight, but the export rendered it as a 22px heading.
- The export's own page title now uses `.wiki-export-title`, and content `h1:not(.wiki-export-title)` and `h4`–`h6` are reset to body text.

**DOCX: spacing**
- **Cause 1:** the Word walker copied source whitespace (newlines + indentation) verbatim into runs. That was the big gaps and indented description lines seen in Pages. The new `_wiki-export-whitespace.ts` (`collapseWhitespace`) collapses whitespace like a browser: runs become one space, dropped at line starts and ends (block edges and `<br>`), and `<pre>` is untouched.
- **Cause 2:** spacing lived only in document-default and style properties. Every paragraph now carries explicit `spacing` that mirrors the read-view CSS (via `paragraphSpacing()`):
  - `p + p` 14px
  - h2 28/10 and h3 20/8
  - list items 4px
  - images 12px
  - 1.7 line height
- List paragraphs also get an explicit tab stop at the text indent, and numbering levels carry the marker's run font.
- `header`/`main`/`footer`/`nav`/`aside`/`figure` are now recognized as wrappers. Content `h1`/`h4`–`h6` map to body paragraphs; only `h2`/`h3` get heading styles, as in the Wiki.

**DOCX: fonts (user decision: "Arial everywhere")**
- **Tested in macOS's Word importer** (Quick Look/TextEdit, which substituted Times exactly as Pages did). Hand-edited variants showed that none of these prevents the serif substitution when the named font isn't installed:
  - embedded fonts
  - `w:family="swiss"` in the font table
  - `w:altName="Helvetica"`
  - `"Inter;Arial"` name lists

  Only an installed font name renders sans. Pages couldn't be scripted (`osascript` isn't allowed assistive access), so Quick Look stood in for it.
- **Change:** `DOCX_FONTS` = Arial for body and headings, Courier New for code. Every run sets its font, size and color explicitly via `blockMarks()`, because Pages ignores document-default run properties. Sizes, colors, letter-spacing and spacing still follow the Wiki tokens.
- Font embedding was removed from the .docx (it had no effect for these readers): `embeddedDocxFonts`/`resolveDocxFonts`/`hasFamily` are gone and the file is ~10 KB. The PDF still embeds Inter/Space Grotesk/JetBrains Mono.
- This supersedes Revision 1's "embed Inter, fall back to Noto Sans" approach for Word.

**Verification**
- `tsc` PASS; `lint` PASS (0 errors, the same 2 pre-existing warnings).
- The real CiteForge HTML went through the Node harness to a `.docx`:
  - 46 text runs, all with explicit `w:rFonts`
  - no newline or indent characters in any text run
  - fonts used: Arial only
- Quick Look render: sans-serif throughout; the "```html"/"CiteForge"/tagline lines are plain as in the Wiki; bullets and numbers sit on the title line, with descriptions aligned under the text and Wiki-like spacing.
- The PDF went through the real Chrome harness with the same HTML: markers are on the baseline and titles aligned.
- **Not verified:** opening the new `.docx` in Pages itself (automation blocked) or in Word. The authenticated `/kb` page has not been re-tested.

**Content note:** the page still shows a literal "```html" at the top and "```" at the end. That's a leftover markdown fence from the task 398 importer and lives in the stored content, so it appears in every view, not just exports.
