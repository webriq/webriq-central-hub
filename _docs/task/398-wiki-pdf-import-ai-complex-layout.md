# 398: AI-Assisted PDF Import for Complex Layouts

**Created:** 2026-09-23
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep

---

## Overview

Task 396's `.pdf` import uses `pdf-parse`'s `getText()`, which follows the PDF's internal content-stream order — for a genuinely single-column document that usually matches reading order, but for a designed, multi-column/mixed-graphics layout it very often does not. Verified hands-on against the user's real example (`CiteForge.pdf` — a two-column marketing one-pager with an icon sidebar, a numbered step list, and a header banner): the current import produces a single jumbled paragraph with content from unrelated sections interleaved.

`pdf-parse`'s `getText()` exposes no per-item position data to do column-aware reordering — `PageTextResult` is just `{ num, text }`. A pure-heuristic fix (cluster raw pdf.js text items by x/y into columns) would help some documents but was judged unlikely to reliably handle content this visually designed (icon+text rows, colored panel boundaries, numbered circles as separate visual elements). The user proposed the better answer: **classify each page's complexity first, then only pay for AI transcription on the pages that actually need it** — cheap pages stay on the existing free `pdf-parse` text path, genuinely complex pages get a vision model to read them in real reading order.

This is the **first multimodal (image-input) LLM call in this codebase** — verified against the installed `ai@6.0.168` SDK's actual `ImagePart` type (`{ type: "image", image: Buffer | Uint8Array | base64 string | URL, mediaType?: string }`, from `@ai-sdk/provider-utils`) rather than assumed, since no local precedent exists to copy. Two new orchestration layers are needed, following the exact precedent of migration `032_ops_chat_llm_layer.sql` (which added `ops_chat` the same way): widen the `llm_config`/`llm_invocation_logs` check constraints, add the new values to `OrchestrationLayer` (`src/types/hub.ts`), seed `llm_config` rows.

`pdf-parse`'s `getScreenshot()` (already used indirectly via task 396's `serverExternalPackages` fix for `@napi-rs/canvas`, which `getScreenshot` needs to rasterize pages — verified working locally: rendered a real PNG from the user's actual PDF) supplies the page images.

## Requirements

- [ ] New orchestration layers, `wiki_pdf_classify` (Haiku — cheap, per this repo's established "Haiku: fast, cost-efficient classification" convention) and `wiki_pdf_transcribe` (Sonnet — more capable, for the actual reading-order transcription):
  - Migration: widen `llm_config_orchestration_layer_check` and `llm_invocation_logs_orchestration_layer_check` (both currently allow `classification, assessment, planning, execution, digest, reply, wiki_lint, ops_chat, mockup_spec` per migrations 001/032/090 — confirm the exact current allow-list against the live constraints before writing the `alter`, the same way migration 032 flagged to verify constraint names), add `wiki_pdf_classify`/`wiki_pdf_transcribe`, then seed both `llm_config` rows (mirror migration 002/032's `insert ... on conflict (orchestration_layer) do update ...` pattern).
  - `src/types/hub.ts`'s `OrchestrationLayer` union gets both new values.
- [ ] New `src/lib/ai/wiki-pdf-import.ts` (mirrors `generate-mockup-spec.ts`'s shape — `getModel`/`getModelConfig`, `logLLMInvocation`, try/catch around the call):
  - `classifyPageComplexity(imageBuffer: Buffer): Promise<"simple" | "complex">` — Haiku, vision input, **structured output via `generateObject` + a zod schema** (`z.object({ complexity: z.enum(["simple", "complex"]) })`, not free-text parsing — `zod` is already a dependency and this repo's established validation approach). System prompt asks specifically about column/layout complexity (single linear column of body text = simple; multi-column, sidebars, mixed icon+text arrangements, or anything where visual position carries reading-order meaning = complex). **Fail open to `"simple"` on any error** (cheaper path, not more AI cost) rather than throwing.
  - `transcribePage(imageBuffer: Buffer): Promise<string>` — Sonnet, vision input, `generateText` with a system prompt instructing: transcribe this page's content in correct visual reading order as clean semantic HTML (headings, paragraphs, lists, tables — this pairs naturally with task 397's new RTE table support), no commentary, HTML only.
  - Both log every call via `logLLMInvocation()` (no `customerId` — this feature has no customer context; `referenceType: "wiki_pdf_page_classify"` / `"wiki_pdf_page_transcribe"`, no `referenceId` since the page doesn't exist yet at extraction time).
- [ ] `src/app/api/wiki/pages/import-pdf/route.ts` rework:
  - `export const maxDuration = 180;` (matches the existing `mcp/route.ts` precedent for a route that legitimately needs more time than the default).
  - Hard page-count cap — **reject** (not silently truncate) PDFs over a cap. Proposed cap: **20 pages** (a "quick import" tool, not a bulk migration path — StackShift's own actual bulk migration is a separate paid service per the CiteForge PDF's own copy). Flag this exact number as a judgment call the user can redirect during review.
  - `getText()` first (as today) — gives per-page text for the "simple" fallback path *and* the true page count for the cap check, no extra cost.
  - `getScreenshot({ scale: 1.5 })` for all pages (bounded by the already-enforced cap).
  - Classify every page's screenshot via `classifyPageComplexity()`, **bounded concurrency** (e.g. batches of 4 — a small `mapWithConcurrency` helper, no new dependency; avoids a 20-way burst against the Anthropic API on one request).
  - For pages classified `simple`: reuse the existing `textToParagraphs()` escaping logic against that page's `getText()` output (unchanged behavior).
  - For pages classified `complex`: `transcribePage()`, same bounded concurrency.
  - Concatenate all pages' HTML in original page order; return `{ contentHtml, pageCount, complexPageCount }` (the counts are free to compute and let the client surface a small "AI reformatted N of M pages" note — nice-to-have, not required for correctness).
- [ ] `src/app/(hub)/kb/_wiki-import-modal.tsx` — sanitize `contentHtml` with `DOMPurify.sanitize()` **uniformly for every import type**, not just `.docx`/`.md`. Today's `.pdf` path is self-escaped so this is currently a no-op for it, but once a page can come back from an LLM transcription call, treating it the same as any other not-authored-through-the-RTE content is the correct default posture (matches this feature area's existing "anything not authored via the app's own trusted RTE gets sanitized" principle from task 396).

## Out of Scope / Must-Not-Change

- Heuristic (non-AI) column-detection as a fallback or alternative — the classify-then-conditionally-transcribe design is the whole point of this task; don't also build a second reordering strategy.
- `.docx`/`.md` import paths — untouched, they don't have this problem.
- A user-facing toggle/checkbox for "use AI" — per the user's own proposed design, the classify step *is* the gate; simple PDFs still cost nothing extra and get no UI change. Don't add a checkbox that would just duplicate what classification already decides automatically.
- Raising the 20-page cap, or making it configurable — ship a fixed, documented number; revisit only if real usage shows it's wrong.
- Any change to task 397's RTE table support — this task's transcription prompt is written to be able to *produce* `<table>` HTML for genuinely tabular PDF content, but actually rendering/editing that table depends on 397 shipping; sequence 397 before or alongside this task, not after.
- Streaming progress UI for the multi-page classify/transcribe pipeline — the modal keeps its existing single "Saving…" state; a real progress bar is a reasonable future follow-up, not required here.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/{next}_wiki_pdf_ai_layers.sql` | Create | Widen both orchestration-layer check constraints, seed `wiki_pdf_classify`/`wiki_pdf_transcribe` `llm_config` rows |
| `src/types/hub.ts` | Modify | `OrchestrationLayer` gains the two new values |
| `src/lib/ai/wiki-pdf-import.ts` | Create | `classifyPageComplexity()` + `transcribePage()`, both logged via `logLLMInvocation()` |
| `src/app/api/wiki/pages/import-pdf/route.ts` | Modify | Page-count cap, `getScreenshot()`, classify-then-conditionally-transcribe pipeline, `maxDuration` |
| `src/app/(hub)/kb/_wiki-import-modal.tsx` | Modify | Sanitize `contentHtml` uniformly for all three import types |

## Code Context

### Exact `ImagePart` shape (verified against the installed SDK, not assumed) — `@ai-sdk/provider-utils`
```ts
interface ImagePart {
  type: 'image';
  image: DataContent | URL; // base64 string, Uint8Array, ArrayBuffer, or Buffer
  mediaType?: string;
}
// usage:
await generateText({
  model,
  messages: [{
    role: "user",
    content: [
      { type: "text", text: "..." },
      { type: "image", image: pageImageBuffer, mediaType: "image/png" },
    ],
  }],
});
```

### `getScreenshot()` — already verified working in this environment (task 396's `serverExternalPackages` fix covers `@napi-rs/canvas`, which this needs)
```ts
const parser = new PDFParse({ data: buffer });
const result = await parser.getScreenshot({ scale: 1.5 });
// result.pages[i].data — PNG Buffer
```

### Orchestration-layer precedent to mirror exactly — `supabase/migrations/032_ops_chat_llm_layer.sql`
```sql
alter table llm_config drop constraint if exists llm_config_orchestration_layer_check;
alter table llm_config add constraint llm_config_orchestration_layer_check
  check (orchestration_layer in ('classification','assessment','planning','execution','digest','reply','wiki_lint','ops_chat'));
-- (same for llm_invocation_logs)
insert into llm_config (orchestration_layer, model_id, max_tokens, temperature, notes)
values ('ops_chat', 'claude-sonnet-4-6', 8192, 0.30, '...')
on conflict (orchestration_layer) do update set model_id = excluded.model_id, ...;
```
Current full allow-list (verify against the live DB, don't assume this doc is current by the time this is implemented): `classification, assessment, planning, execution, digest, reply, wiki_lint, ops_chat, mockup_spec` (migrations 001, 032, 090).

### AI call shape to mirror — `src/lib/ai/generate-mockup-spec.ts`
```ts
export async function generateMockupSpec(input: GenerateMockupSpecInput): Promise<{ markdown: string } | null> {
  const start = Date.now();
  let modelId: string | null = null;
  try {
    const [model, config] = await Promise.all([getModel("mockup_spec"), getModelConfig("mockup_spec")]);
    modelId = config.model_id;
    const { text, usage } = await generateText({ model, system: SYSTEM_PROMPT, prompt: ... });
    await logLLMInvocation({ layer: "mockup_spec", modelUsed: config.model_id, inputTokens: usage.inputTokens ?? 0, outputTokens: usage.outputTokens ?? 0, durationMs: Date.now() - start, status: "success", ... });
    return { markdown: text };
  } catch (err) {
    await logLLMInvocation({ layer: "mockup_spec", modelUsed: modelId ?? "unknown", inputTokens: 0, outputTokens: 0, durationMs: Date.now() - start, status: "error", errorMessage: ..., ... });
    return null;
  }
}
```
`wiki-pdf-import.ts`'s two functions should follow this exact try/catch/log shape — `classifyPageComplexity()`'s catch path returns `"simple"` instead of `null`/rethrowing (fail open, per Requirements above).

### `logLLMInvocation` signature — `src/lib/ai/logger.ts`
```ts
type LogParams = {
  customerId?: string; layer: OrchestrationLayer; modelUsed: string;
  inputTokens: number; outputTokens: number; durationMs: number;
  status?: "success" | "error" | "timeout"; errorMessage?: string;
  referenceId?: string; referenceType?: string;
};
```

### Current `import-pdf/route.ts` to rework (task 396)
```ts
export const runtime = "nodejs";
const MAX_FILE_SIZE = 15 * 1024 * 1024;
function textToParagraphs(text: string): string { /* split on blank lines, escapeHtml, wrap <p> */ }
export async function POST(req: NextRequest) {
  // auth check, file validation
  const buffer = Buffer.from(await file.arrayBuffer());
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    const contentHtml = textToParagraphs(result.text);
    return NextResponse.json({ contentHtml });
  } finally {
    await parser.destroy();
  }
}
```
Keep the auth check, file-type/size validation, and `parser.destroy()`-in-`finally` exactly as-is; the classify/transcribe pipeline replaces the middle of the `try` block.

### `maxDuration` precedent — `src/app/api/mcp/route.ts:25`
```ts
export const maxDuration = 300;
```

## Implementation Steps

1. Write and (per this repo's standing convention) leave unapplied the migration widening both check constraints + seeding the two new `llm_config` rows.
2. Add the two values to `OrchestrationLayer`.
3. Build `src/lib/ai/wiki-pdf-import.ts` (`classifyPageComplexity`, `transcribePage`).
4. Rework `import-pdf/route.ts`: page cap, `getScreenshot()`, bounded-concurrency classify pass, conditional transcribe pass, merge, `maxDuration`.
5. Update `_wiki-import-modal.tsx` to sanitize all three import types' `contentHtml` uniformly.
6. Manual verification once a live session + applied migration exist: re-import the actual `CiteForge.pdf` that surfaced this issue and confirm the two-column content reads in correct order (compare against the rendered `getScreenshot()` output, which this task doc's own research already captured).

## Acceptance Criteria

- [ ] Importing a genuinely single-column PDF costs no AI calls beyond the (cheap) per-page classify pass and produces the same output as today.
- [ ] Importing `CiteForge.pdf` (or an equivalent multi-column/complex layout) produces content that reads in the actual visual reading order, not jumbled.
- [ ] A PDF over the 20-page cap is rejected with a clear error, not silently truncated.
- [ ] Every classify/transcribe call has a corresponding `llm_invocation_logs` row (success and error paths both).
- [ ] A classify-call failure degrades to the free `pdf-parse` path for that page rather than failing the whole import.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then browser-verify: import CiteForge.pdf, confirm reading order; import a simple single-column PDF, confirm no regression; check llm_invocation_logs rows via Supabase
```

## Compatibility Touchpoints

- New migration widening two check constraints + seeding two `llm_config` rows — written, not applied, per this repo's standing convention; both AI calls will error (and, for classify, fail open to "simple") until it's applied.
- No new npm dependency — `@ai-sdk/anthropic`, `ai`, `zod` are all already installed; `getScreenshot()`/`@napi-rs/canvas` are already covered by task 396's `serverExternalPackages` fix.
- First multimodal LLM call in this codebase — worth a second pair of eyes on the exact vision message construction during review, since there's no local precedent this leans on beyond the verified SDK types above.
- `ANTHROPIC_API_KEY` usage stays server-only (this route), unchanged from every other AI call in this codebase.

## Implementation Notes

### What Changed
- Added `wiki_pdf_classify` (Haiku) / `wiki_pdf_transcribe` (Sonnet) orchestration layers via a new migration mirroring migration 032/090's exact widen-constraint-then-seed pattern; confirmed the live allow-list against both migration files before writing the `alter` (`classification, assessment, planning, execution, digest, reply, wiki_lint, ops_chat, mockup_spec` — matches the doc's own note, no drift since it was written).
- `OrchestrationLayer` in `src/types/hub.ts` gains both new values.
- New `src/lib/ai/wiki-pdf-import.ts`: `classifyPageComplexity()` (Haiku, `generateObject` + zod `{ complexity: "simple" | "complex" }`, fails open to `"simple"` on any error) and `transcribePage()` (Sonnet, `generateText`, rethrows on error — the route layer decides the fallback). Both use `system` + a single-image `messages` array (verified `Prompt` type in the installed `ai@6.0.168` SDK: `system` may be combined with `messages`, contra `prompt`/`messages` which are mutually exclusive) rather than embedding the instruction as an extra text content part.
- Reworked `src/app/api/wiki/pages/import-pdf/route.ts`: `maxDuration = 180`; hard-rejects (400) PDFs over 20 pages using `getText()`'s own `result.total`/`result.pages[].{num,text}` (verified per-page shape in the installed `pdf-parse@2.4.5` `.d.ts` files, not assumed); renders every page via `getScreenshot({ scale: 1.5 })`; classifies every page's screenshot with a small local `mapWithConcurrency` helper (batches of 4, no new dependency); "simple" pages reuse the existing `textToParagraphs()` path against that page's own `getText()` text (matched by `pageNumber`/`num`); "complex" pages call `transcribePage()`, with a page-level try/catch in the route (not inside `transcribePage()` itself) falling back to the free text path if the transcription call itself fails, so one bad page never fails the whole import — this fallback isn't explicitly spelled out in Requirements (only the classify-failure fallback is) but follows the same fail-open spirit and satisfies the "classify-call failure degrades... rather than failing the whole import" acceptance criterion's intent for the sibling failure mode too. Response now returns `{ contentHtml, pageCount, complexPageCount }`.
- `_wiki-import-modal.tsx`: moved the `DOMPurify` dynamic import above the `.pdf` branch and now sanitizes the PDF route's `contentHtml` with the same `DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })` call used for `.docx`/`.md`, per Requirements — uniform sanitization across all three import types.

### Files Changed
- `supabase/migrations/150_wiki_pdf_ai_import_layers.sql` - new migration (written, not applied)
- `src/types/hub.ts` - `OrchestrationLayer` +2 values
- `src/lib/ai/wiki-pdf-import.ts` - new file, `classifyPageComplexity()` + `transcribePage()`
- `src/app/api/wiki/pages/import-pdf/route.ts` - page cap, screenshot rendering, classify/transcribe pipeline, `maxDuration`
- `src/app/(hub)/kb/_wiki-import-modal.tsx` - uniform `DOMPurify` sanitization for all import types

### Deviations From Plan
- Migration numbered `150` (repo's next-available number as of implementation), not the doc's `{next}` placeholder.
- Per-page transcribe-failure fallback (text path) implemented at the route call site rather than inside `transcribePage()`, since the doc's own type signature for `transcribePage()` is `Promise<string>` with no fail-open value to return (unlike `classifyPageComplexity()`, whose `"simple"` fallback value already exists in its own return type) — keeping the try/catch in the route also keeps `wiki-pdf-import.ts`'s two functions symmetric with `generate-mockup-spec.ts`'s log-then-rethrow/return-null shape rather than inventing a third error-handling convention.

### Verification Run
- `npx tsc --noEmit` - PASS (0 errors)
- `pnpm lint` - PASS (0 errors; 2 pre-existing unrelated warnings in `_checklist-tab.tsx`, same warnings noted in tasks 396/397)
- `pnpm dev` + browser import of `CiteForge.pdf` / a simple PDF / `llm_invocation_logs` check - SKIPPED (no live session in this environment; migration 150 also still unapplied, so both AI calls would error until applied — classify fails open to "simple" per design, transcribe falls back to the text path per the route-level catch added above)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation in any changed file.
- No `any` or untyped escape hatches — `ModelMessage` typed explicitly, zod schema typed, `mapWithConcurrency<T, R>` generic.
- No deep nesting — `classifyPageComplexity`/`transcribePage` are flat try/catch; the route's per-page callback has one conditional branch with an inner try/catch for the transcribe-failure fallback, still shallow.
- Function/file responsibility is clear: `wiki-pdf-import.ts` only builds/logs the two AI calls; the route owns orchestration (cap check, screenshot rendering, concurrency, merge); the modal only owns client-side conversion + sanitization.
- Naming accurate (`classifyPageComplexity`, `transcribePage`, `mapWithConcurrency`, `complexPageCount`).
- The try/catch/log block is duplicated between `classifyPageComplexity()` and `transcribePage()` rather than factored into a shared helper — intentional, matches this codebase's existing convention of not sharing that scaffolding across AI call sites (`generate-mockup-spec.ts`, `assess.ts`, `plan.ts`, `digest.ts` each repeat it inline rather than share a wrapper). Not flagged as a finding.
- Errors handled intentionally at each layer: classify fails open (`"simple"`), transcribe rethrows and the route's per-page catch falls back to the free text path, top-level PDF-parse errors return a 400 with a user-facing message.
- No secrets, credentials, or debug logging — `console.error` calls mirror the existing `generate-mockup-spec.ts` pattern exactly.
- Conventions followed: DB-driven model config via `getModel`/`getModelConfig` (no hard-coded model IDs in orchestration code), `logLLMInvocation()` called on every path, migration left unapplied per standing convention, `pnpm`-only, no new dependency.

### Deviations
- **Minor** — Migration numbered `150` instead of the doc's `{next}` placeholder (expected; doc explicitly deferred the exact number to implementation time).
- **Minor** — Added a transcribe-failure→text-path fallback at the route call site, which Requirements/Acceptance Criteria only specified for classify failures. Documented rationale in Implementation Notes: `transcribePage()`'s return type (`Promise<string>`) has no fail-open value the way `classifyPageComplexity()`'s `"simple"` does, and the fallback is scoped to one page rather than failing the whole import — same fail-open spirit as the required behavior, no scope expansion (no new user-facing behavior, config, or UI). Does not change any specified acceptance criterion's pass/fail outcome.
- No Major deviations. All Out of Scope / Must-Not-Change items respected (no heuristic column detection, no AI-toggle UI, no `.docx`/`.md` conversion-logic changes beyond the mandated uniform-sanitization requirement, cap stays fixed at 20, no RTE/table changes, no streaming-progress UI).
