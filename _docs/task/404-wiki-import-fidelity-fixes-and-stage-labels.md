# 404: Wiki Import — Image-Only PDF Fix, Formatting Fidelity, Checkbox Lists, Full-Width Tables, Stage Labels

**Created:** 2026-09-30
**Priority:** HIGH
**Type:** fix
**Recommended Tier:** balanced
**Status:** Completed
**Completed:** 2026-09-30

---

## Overview

Follow-up fixes to tasks 396/398 (Wiki Import), driven by a real failing import of `Newsletter Documentation.pdf` (17 pages, image-only). Reported as: production `POST /api/wiki/pages/import-pdf` → 500; local → 200 but `contentHtml` was 16 newlines (empty page), then, once content appeared, several formatting mismatches versus the PDF.

Root causes found:
- **Empty content:** the PDF has **no text layer** (`pdf-parse` `getText()` → 0 chars on all 17 pages). Task 398 gates on a Haiku *layout* classifier; it judged these pages "simple", and "simple" pages use only the (empty) text layer. `llm_config` rows were present and classify calls succeeded — this was not a config/migration problem.
- **Fidelity gaps:** the transcription prompt was generic and the wiki editor only supports StarterKit + tables, so headings, checklists, rules, muted text, running headers/footers and inline fonts were not handled/styled.
- **Table width:** `[&_table]:block` shrinks the table to content width.

## Requirements

- [x] Pages with no extractable text always go to vision transcription (skip the classifier); empty final result → 422 with a clear message.
- [x] Rewrite the transcription prompt: supported-tag whitelist, heading detection (incl. `3: Title`, `Step 2: …`) → `h2`/`h3`, `hr` under headings, omit running headers/footers/page numbers, muted text → own italic paragraph, table → real `<table>`, lists grouped, no inline styles/fonts.
- [x] Checkbox (☐/□) lists → disabled, unchecked task-list checkboxes with no bullet.
- [x] Tables expand to full container width; consistent list line spacing.
- [x] Strip `style`/`class`/`font` (and `h1` for PDF) from imported HTML; strip repeated header/footer lines from the text-layer path.
- [x] Dynamic import-button label per stage.

## Out of Scope / Must-Not-Change

- Table look (uppercase header row / dividers) is the wiki-wide design-system table style — intentionally unchanged.
- Editor has no color/font-size support, so PDF "muted" text is approximated with italics and fonts are made uniform, not matched.
- Real streamed progress → task 405.
- Production 500 root cause is **not** confirmed (see Follow-up).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/wiki/pages/import-pdf/route.ts` | Modify | Force-transcribe no-text pages, 422 on empty result, `stripRunningHeadersFooters()` for the text path |
| `src/lib/ai/wiki-pdf-import.ts` | Modify | New transcription system prompt (headings/tables/lists/checklists/hr/muted/no header-footer), strip ```html fences |
| `src/app/(hub)/kb/_wiki-import-modal.tsx` | Modify | `FORBID_ATTR`/`FORBID_TAGS` sanitizing, `withTaskItemMarkup()`, staged button label (`STAGE_LABELS`, timed PDF stages) |
| `src/app/(hub)/kb/_wiki-rte.tsx` | Modify | Register `TaskList`/`TaskItem`; task-list, `hr`, list-spacing, full-width table styles |
| `src/app/(hub)/kb/_wiki-prose.ts` | Modify | Same read-mode styles |
| `package.json` / `pnpm-lock.yaml` | Modify | `pnpm add @tiptap/extension-list` (TaskList/TaskItem; was only a transitive dep) |

## Implementation Notes

### What Changed
- Route: per-page text computed once (`pageTexts`); empty-text pages are classified `"complex"` without an LLM call; final HTML with no visible text returns 422.
- Prompt: whitelist of supported tags (`h2 h3 p strong em u a ul ol li blockquote pre code hr table… img` + `ul[data-type=taskList]`/`li[data-type=taskItem][data-checked]`), explicit rules per issue reported.
- Checklists: model emits Tiptap task-list markup; the modal wraps each item as Tiptap serializes it (`<label><input type=checkbox disabled></label><div>…</div>`) so read mode shows a checkbox before the page is ever opened in the editor. Checkboxes are display-only (pointer-events none); ticked state is never persisted.
- Tables `display: table; width: 100%` (was `block`) — very wide tables now squeeze instead of scrolling.
- Button label stages — PDF: Reading file → Uploading PDF → Analyzing pages (2.5s) → Transcribing content with AI (9s) → Finalizing content (60s) → Cleaning up formatting → Creating the page. DOCX/MD: Reading file → Converting document → Creating the page. The three middle PDF stages are **time-based estimates** (single request).

### Files Changed
See Proposed File Changes.

### Deviations From Plan
- No prior plan doc; work was driven iteratively by live user feedback.

### Verification Run
- `npx tsc --noEmit` — no errors in changed files (filtered to `kb/`, `import-pdf`, `wiki-pdf` after each round).
- Local diagnostics: `pdf-parse` on the sample PDF (0 text chars ×17 pages); DB check that `wiki_pdf_classify`/`wiki_pdf_transcribe` `llm_config` rows exist and classify invocations succeeded.
- Full-page re-import in the browser after each round was run by the user, not the agent; the last three rounds (checklists, table width, stage labels) were not re-verified visually by the agent.

## Follow-up

- **Production 500 unresolved.** Route wraps parse errors as 400, so a 500 likely originates outside the handler — candidates: function timeout/`maxDuration` vs plan cap (17 image-only pages now = 17 Sonnet calls), or `@napi-rs/canvas` not loading in the Vercel runtime. Needs the Vercel function log for the failing request.
- Streamed real progress → task 405.

## Final Summary

Image-only PDFs now import (vision transcription forced for text-less pages), with substantially better structural fidelity (headings, tables, checklists, rules, spacing, no stray headers/footers), full-width tables, and a stage-aware import button. Production 500 still needs a log to diagnose.
