# 405: Wiki PDF Import — Real Streamed Progress in the Import Button

**Created:** 2026-09-30
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

Task 404 added a stage-aware button label, but for PDFs the middle stages ("Analyzing pages…", "Transcribing content with AI…", "Finalizing content…") are **timed guesses**, because `POST /api/wiki/pages/import-pdf` is a single request/response. Make them real: the route streams progress events as it works, and the modal reads them and shows live labels such as "Analyzing page 5 of 17…" and "Transcribing page 3 of 12…".

## Requirements

- [x] `import-pdf/route.ts` returns a streamed `application/x-ndjson` response (`ReadableStream`, Node runtime, one JSON object per line) **after** the up-front checks. Auth/no-file/wrong-type/size errors stay plain JSON with their existing 401/400 status, *before* streaming begins.
- [x] Event shapes (typed once in a shared module, e.g. `src/lib/wiki/pdf-import-events.ts`, imported by both route and modal):
  - `{ type: "stage", stage: "parsing" | "rendering" | "analyzing" | "transcribing", done: number, total: number }` — `done` increments as each page's classify/transcribe call settles (inside `mapWithConcurrency`, via a callback); `total` is the page count for analyzing, the number of complex/no-text pages for transcribing.
  - `{ type: "result", contentHtml, pageCount, complexPageCount }` — final event.
  - `{ type: "error", error, status }` — mid-stream failures (over-page-cap, unreadable PDF, 422 empty result), since the HTTP status is already 200 by then.
- [x] `_wiki-import-modal.tsx` reads the body with `response.body.getReader()` + `TextDecoder`, buffers partial lines, updates the button label per `stage` event (e.g. `Analyzing page ${done} of ${total}…`), resolves on `result`, throws on `error`. Remove the timed `PDF_STAGE_TIMELINE` guesses; keep the real client-side stages ("Uploading PDF…", "Cleaning up formatting…", "Creating the page…").
- [x] Do not double-count when the transcribe fallback runs; a page whose transcription fails still advances `done`.
- [x] Handle client disconnect: abort/stop work when the request is cancelled (`req.signal`) so closing the modal doesn't keep spending Sonnet calls.

## Out of Scope / Must-Not-Change

- DOCX/Markdown paths (client-side, already real stages).
- A visual progress bar / percentage UI — label text only.
- Page cap (20), models, prompts, sanitizing — unchanged.
- Resumable/background jobs — single request only.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/wiki/pdf-import-events.ts` | Create | Shared event types + NDJSON line encode/parse helpers |
| `src/app/api/wiki/pages/import-pdf/route.ts` | Modify | Stream events; `mapWithConcurrency` gains an `onSettled` callback; honour `req.signal` |
| `src/app/(hub)/kb/_wiki-import-modal.tsx` | Modify | Stream reader, per-event labels, drop timed stages |

## Compatibility Touchpoints

- Vercel: streamed responses from Node Route Handlers are supported; `maxDuration = 180` still applies. Verify the platform doesn't buffer the stream (test on a preview deploy — local dev won't reveal buffering).
- Any other caller of `/api/wiki/pages/import-pdf`? Grep before changing the response contract (currently only the import modal).
- The unresolved production 500 from task 404 must be diagnosed independently; streaming does not fix it, though it will make a timeout visible as a truncated stream rather than a bare 500.

## Acceptance Criteria

- [ ] Importing the 17-page sample PDF shows a live, advancing count during analyze and transcribe phases.
- [ ] A rejected PDF (>20 pages, corrupt) still shows the existing error message in the modal.
- [ ] Closing the modal mid-import stops server-side LLM calls (check `llm_invocation_logs` stops growing).
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # import the sample PDF, watch the button label; cancel mid-import and check llm_invocation_logs
```

## Implementation Notes

### What Changed
- New `src/lib/wiki/pdf-import-events.ts`: event types + `encodeEvent()`/`parseEventLines()`.
- `import-pdf/route.ts`: up-front checks still return plain JSON (401/400); after that the response is `application/x-ndjson`. Work moved to `runImport()`; `mapWithConcurrency` takes an `AbortSignal` (`throwIfAborted` per item, so closing the modal stops further LLM calls) and an `onSettled` callback. Stages: parsing, rendering, analyzing (N of pages), transcribing (N of complex pages). Page-cap and empty-result failures are `error` events with a status.
- Modal: reads the stream, label shows e.g. "Analyzing page 5 of 17…" / "Transcribing page 3 of 12…"; timed stage guesses removed.

### Verification Run
- `npx tsc --noEmit` — no errors in changed files; `eslint` on the three files — clean.
- NOT run: browser import of the sample PDF, cancel-mid-import check, or a Vercel preview test for stream buffering.

### Notes
- The label shows `done + 1` (the page currently being worked on); with concurrency 4 that is approximate, not a strict per-page pointer.
- In-flight LLM calls already started when the client disconnects finish; only not-yet-started pages are skipped.
