# 199: Onboarding Wizard — HTML Mockup Auto-Generated MD Build Spec

**Created:** 2026-08-03
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep
**Status:** Completed (2026-08-03)

---

## Overview

The Onboarding Wizard's Phase 1 "HTML Mockup" step (`src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx`) lets Bert/PM/admin upload static HTML mockup files for client approval. Developers later use these mockups to build the real components/pages, but there is no structured build guidance attached to them today — a dev has to reverse-engineer intent from raw markup.

This task adds an **automatic MD (Markdown) build-spec generation** step: every time an HTML mockup file is uploaded, the system calls an LLM (Sonnet, new `mockup_spec` orchestration layer) to analyze the HTML and produce a paired `.md` file — one MD per HTML, 1:1 — written as a structured, AI-prompt-ready set of build instructions (page/section breakdown, component boundaries, interactive/dynamic elements to wire up, responsive/breakpoint notes, and a ready-to-paste "prompt block" a developer can hand to Claude Code). The MD file is stored as a sibling `customer_assets` row (same pattern as the existing in-app HTML/MD editor from task 133), explicitly linked back to its source HTML asset via a new `source_asset_id` column.

The upload UI gets a two-stage progress indicator: the existing per-file upload progress bar (0–100%, "Finishing…") is followed by a second "Generating build spec…" stage that resolves into the finished HTML+MD pair shown together in the file list. Generation failure must never roll back or block the already-successful HTML upload — it surfaces as a small inline retry affordance next to that file instead.

Editing an HTML mockup in-app (existing `HtmlEditorModal`, task 133) can silently desync its paired MD spec from the markup it describes. Since this feature only has value if the MD stays a truthful description of the HTML, a "Regenerate" action (reusing the same generation endpoint) is added alongside the existing Edit/View/Remove actions on the paired MD row.

## Requirements

- [ ] On successful HTML mockup upload, automatically trigger MD spec generation for that file — no separate user action required for the common path.
- [ ] Exactly one MD asset per HTML asset, explicitly linked (not inferred from filename/label matching).
- [ ] MD content is structured for handing to an AI coding assistant: overview, section/component breakdown, interactive elements, responsive notes, and a explicit "build prompt" block.
- [ ] Progress bar shows two distinct, visually connected phases: file upload (determinate %) → spec generation (indeterminate/labeled), with a clear success end-state.
- [ ] Generation failure is non-blocking: the HTML file stays uploaded and usable; failure shows inline with a manual retry action, does not throw away the upload.
- [ ] Removing an HTML mockup removes its paired MD spec automatically (no orphaned MD rows).
- [ ] The MD file is viewable via the existing read-only viewer and editable via the existing `HtmlEditorModal` (already supports `text/markdown`) — no new preview/editor code needed.
- [ ] A manual "Regenerate" action exists on the paired MD row so developers can refresh the spec after editing the HTML mockup in-app.
- [ ] All LLM calls go through `getModel("mockup_spec")` / `getModelConfig("mockup_spec")` (never hard-coded model IDs) and are logged via `logLLMInvocation()`.
- [ ] `_docs/mcp-tools.md` is **not** affected (no MCP tool added by this task) — confirm no `server.registerTool` touched.

## Out of Scope / Must-Not-Change

- No change to the HTML mockup upload's allowed MIME types, size limit, or storage bucket policy (`customer-assets`, 25MB, already covers `text/html`/`text/markdown` per `upload/route.ts`).
- No change to any other onboarding wizard step (Business Facts, Outcome Target, Migration Checklist, Content Map, Signoff) — only the `html-mockup` step and its supporting file-list component are touched.
- No bulk/backfill generation for HTML mockups already uploaded before this ships — generation only triggers going forward, on new uploads or explicit "Regenerate" clicks. (If backfill is wanted later, it's a separate follow-up task — flag this instead of silently doing it.)
- Do not touch `implementation_plans`/`plan_generation` orchestration layer — `mockup_spec` is a new, separate layer, not a repurposing of `planning`.
- Do not add a chat/iterate-on-the-spec UI — output is a one-shot generation + regenerate, not a conversational refinement loop.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/090_customer_assets_mockup_spec.sql` | Create | Adds `customer_assets.source_asset_id` (self-referencing FK, `on delete cascade`) for HTML→MD pairing; widens `llm_config`/`llm_invocation_logs` orchestration_layer CHECK constraints to include `mockup_spec` (same pattern as migration 032); seeds the `mockup_spec` `llm_config` row (Sonnet). |
| `src/types/hub.ts` | Modify | Add `"mockup_spec"` to the `OrchestrationLayer` union. |
| `src/types/database.ts` | Modify | Add `source_asset_id: string \| null` to `customer_assets` Row/Insert/Update types (regenerate or hand-edit to match the new column). |
| `src/lib/ai/generate-mockup-spec.ts` | Create | `generateMockupSpec({ html, fileName, customerId, projectId }): Promise<{ markdown: string } \| null>` — calls `getModel("mockup_spec")` via `generateText`, logs via `logLLMInvocation`, mirrors `assess.ts`'s try/catch + logging shape (freeform text output like `digest.ts`, not `generateObject`, since the output is prose/Markdown, not structured fields). |
| `src/app/api/customers/[customerId]/assets/[assetId]/generate-md/route.ts` | Create | `POST` — looks up the source asset (must be `text/html`, must belong to `customerId`), downloads its content from the `customer-assets` bucket via `adminClient.storage`, calls `generateMockupSpec`, uploads the resulting Markdown as a new storage object (same folder, filename with `.md` swapped in for the HTML extension), inserts a new `customer_assets` row (`type: "file"`, `label: "Mockup Build Spec"`, `file_mime_type: "text/markdown"`, `source_asset_id` = the HTML asset's id, same `phase_number`/`project_id`/`folder_id` as the source), returns the new row. Non-blocking design: this route can fail (500) independently of the already-committed HTML upload; the caller treats failure as retryable. Same role gate as `upload/route.ts` (`admin \| super_admin \| pm \| marketing`). |
| `src/app/api/customers/[customerId]/assets/route.ts` | Modify | `DELETE`: when deleting an asset, cascading MD cleanup is handled at the DB level (`on delete cascade` via `source_asset_id`) — verify the storage object for the cascaded MD row is also removed from the bucket (the DB row disappearing alone would leave an orphaned storage file); add a lookup-then-bucket-delete step for any row(s) where `source_asset_id = id` before/alongside the existing delete, mirroring the storage-cleanup diligence already expected elsewhere in this route file. |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` | Modify | Wire the new generate-on-upload flow into `handleHtmlMockupUpload`; extend `HtmlMockupFileList` to render each HTML row with its paired MD row nested/grouped beneath it (generating / ready / failed+retry states); add the two-phase progress UI; add a `handleRegenerateMockupSpec` handler; extend `UploadProgressEntry` (or a sibling type) with a `stage: "uploading" | "generating"` field so the existing progress-bar JSX can branch cleanly instead of growing a parallel ad hoc state machine. |

## Code Context

### `src/lib/ai/assess.ts` — orchestration call shape to mirror (try/catch around the LLM call, `logLLMInvocation` in both success and error paths, non-blocking downstream write)

```ts
const config = await getModelConfig("assessment");
const model = getLanguageModel((config.provider ?? "anthropic") as "anthropic" | "openai", config.model_id);
const { object, usage } = await generateObject({ model, schema: AssessmentSchema, prompt: `...${contextChain}...` });
await logLLMInvocation({ customerId, layer: "assessment", modelUsed: config.model_id, inputTokens, outputTokens, durationMs: Date.now() - start, status: "success" });
```
For this task, swap `generateObject`/schema for `generateText` (freeform Markdown output) — same surrounding structure.

### `src/app/api/customers/[customerId]/assets/upload/route.ts` — existing upload route (unchanged by this task, referenced for the storage path convention `${customerId}/${projectId}/${timestamp}_${safeFilename}` that the new MD upload must follow, and the existing `text/html`/`text/markdown` MIME allowlist already in place from task 122).

### `_onboarding-wizard.tsx:1621-1660` — `handleHtmlMockupUpload` (current upload-only flow to extend)

```tsx
const handleHtmlMockupUpload = async (file: File) => {
  const tempId = crypto.randomUUID();
  setHtmlMockupUploadProgress((prev) => [...prev, { id: tempId, name: file.name, progress: 0 }]);
  ...
  const uploaded = await uploadFileWithProgress(`/api/customers/${project.customer_id}/assets/upload`, formData, (pct) => ...);
  ...
  const res = await fetch(`/api/customers/${project.customer_id}/assets`, { method: "POST", ... label: "HTML Mockup" ... });
  const newAsset: AssetRow = await res.json();
  setHtmlMockupFiles((prev) => [...prev, newAsset]);
  ...
  setHtmlMockupUploadProgress((prev) => prev.filter((p) => p.id !== tempId));
};
```
After `setHtmlMockupFiles`, add a call to the new `generate-md` route (fire-and-await, but wrapped so its failure doesn't hit the same catch block as the upload — the upload has already succeeded and must stay committed). Keep the `tempId` progress entry alive through generation (switch its `stage` instead of removing it) so the two-phase bar reads as one continuous action to the user.

### `_onboarding-wizard.tsx:5452-5588` — `HtmlMockupFileList` (component to extend with paired-MD rows + regenerate action; `IconTip`/`CloudUpload`/`FileText`/`Eye`/`Pencil`/`Trash2` already imported and in use here)

### `_onboarding-wizard.tsx:1696+` and `5590+` — `handleOpenHtmlEditor` / `HtmlEditorModal` already support `text/markdown` (`isMarkdown = file.file_mime_type === "text/markdown"`, `markdownToHtmlDocument` preview conversion) — the new MD asset needs **zero** new viewer/editor code, only needs to reach these existing handlers via `onEdit`/`onView` wiring in the extended file list.

### `supabase/migrations/032_ops_chat_llm_layer.sql` — pattern to copy for widening the two CHECK constraints and seeding a new `llm_config` row for a new orchestration layer.

### `supabase/migrations/057_customer_assets_permissions_and_files.sql` / `065_customer_asset_folders.sql` — precedent for adding nullable, `on delete cascade`/`on delete set null` FK columns to `customer_assets` via `alter table ... add column if not exists`.

## Implementation Steps

1. Write migration 090: `source_asset_id uuid references customer_assets(id) on delete cascade`, index on it, widen the two orchestration_layer CHECK constraints, seed `mockup_spec` llm_config row (`claude-sonnet-4-6`, reasoning: this is generation/authoring work closer to `planning`/`execution` complexity than `digest`/`reply`, per this repo's Haiku-vs-Sonnet split).
2. Add `"mockup_spec"` to `OrchestrationLayer` in `src/types/hub.ts`; add `source_asset_id` to the `customer_assets` table types in `src/types/database.ts`.
3. Write `src/lib/ai/generate-mockup-spec.ts` — prompt should instruct the model to: identify distinct sections/components in the HTML, call out any dynamic/interactive elements (forms, carousels, tabs, etc.) that need real component logic vs. static markup, note responsive breakpoints if present in inline styles/classes, and close with an explicit "Build Prompt" section phrased as an instruction a developer can copy verbatim into Claude Code. Log every call via `logLLMInvocation` with `layer: "mockup_spec"`, `referenceId`/`referenceType` pointing at the source asset.
4. Write the `generate-md` API route: fetch + validate source asset, download HTML text from storage, call the generator, upload the MD, insert the linked `customer_assets` row, return it. Handle "no active `mockup_spec` config" and LLM failure as a clean 500 with a descriptive error (caller retries via the same endpoint).
5. Update `assets/route.ts` DELETE to also purge the storage object of any cascaded MD row before/alongside the DB cascade (DB cascade alone leaves the storage file orphaned).
6. Wire the wizard: extend `UploadProgressEntry`/state, call `generate-md` right after the HTML `customer_assets` row is created in `handleHtmlMockupUpload`, add `handleRegenerateMockupSpec`, extend `HtmlMockupFileList` to pair rows by `source_asset_id` and render the two-phase progress + retry/regenerate affordances.
7. Manually verify: upload an HTML mockup → see upload % → see "Generating build spec…" → see paired MD row appear; open the MD in the existing viewer/editor; delete the HTML row and confirm the MD row and its storage object are both gone; force a generation failure (e.g. temporarily misconfigure `mockup_spec`) and confirm the HTML stays uploaded with a retry affordance, not a lost upload.

## Acceptance Criteria

- [ ] Uploading an HTML mockup file always results in exactly one paired MD asset (barring a surfaced, retryable failure).
- [ ] The two-phase progress bar is visually clear and never gets stuck (every terminal state — success or failure — resolves the progress UI).
- [ ] MD content is genuinely useful as an AI build prompt (section breakdown + explicit "Build Prompt" block), not a generic file-info wrapper.
- [ ] Deleting the HTML mockup leaves no orphaned MD `customer_assets` row or orphaned storage object.
- [ ] Regenerate produces a fresh MD reflecting the HTML's current (possibly edited) content, replacing the prior MD's storage content and `file_size`.
- [ ] `npx tsc --noEmit` passes.
- [ ] No hard-coded model IDs; `mockup_spec` config is DB-driven and switchable like every other layer.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual: apply migration 090 to a local/dev Supabase instance, then browser-test the
# HTML Mockup step in the Onboarding Wizard (upload → progress → paired MD → view/edit/
# regenerate → delete-cascade) per Implementation Step 7.
```

## Compatibility Touchpoints

- New Supabase migration — must be applied before the corresponding code deploys (standard migration-then-deploy sequencing already used across this repo's other 090-ish migrations).
- `_docs/mcp-tools.md` — not touched by this task (no new `server.registerTool`); confirmed explicitly in Requirements so implementation doesn't need to double back on it.
- `llm_invocation_logs`/cost attribution (`llm_invocation_logs` table, Vercel AI Gateway if configured) automatically picks up the new `mockup_spec` layer once logged — no separate dashboard/reporting change needed.

## Implementation Notes

### What Changed
- Added a `source_asset_id` self-referencing FK on `customer_assets` (cascade delete) and a new `mockup_spec` orchestration layer (Sonnet), then wired the Onboarding Wizard's HTML Mockup step to auto-generate a paired Markdown build spec on every HTML upload, with a two-phase progress bar (upload % → indeterminate "Generating build spec…") and a Regenerate action.
- The `generate-md` API route doubles as both "generate" (no paired spec yet) and "regenerate" (overwrites the existing paired spec's storage content + `file_size` in place) — one endpoint handles both, matching the task doc's design intent so editing an HTML mockup and regenerating never creates a duplicate row.
- `DELETE /api/customers/[customerId]/assets` now looks up any paired spec's `file_path` before deleting the parent row (whose DB-level cascade removes the spec's row but not its storage object), then removes that storage object explicitly afterward.

### Files Changed
- `supabase/migrations/090_customer_assets_mockup_spec.sql` — new migration: `source_asset_id` column + index, widened `llm_config`/`llm_invocation_logs` CHECK constraints, seeded `mockup_spec` config row.
- `src/types/hub.ts` — added `"mockup_spec"` to `OrchestrationLayer`.
- `src/types/database.ts` — added `source_asset_id` to `customer_assets` Row/Insert/Update + a `Relationships` entry.
- `src/lib/ai/generate-mockup-spec.ts` — new: `generateMockupSpec()`, mirrors `assess.ts`'s try/catch + `logLLMInvocation` shape, `generateText` (freeform Markdown) instead of `generateObject`.
- `src/app/api/customers/[customerId]/assets/[assetId]/generate-md/route.ts` — new `POST` route: generate-or-regenerate the paired spec for a given HTML mockup asset.
- `src/app/api/customers/[customerId]/assets/route.ts` — `DELETE` now cleans up the cascaded spec's storage object.
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` — new `htmlMockupSpecs`/`htmlMockupSpecStatus` state + seeding effect, `generateMockupSpecFor`/`handleRegenerateMockupSpec`, `handleHtmlMockupUpload` chains into generation, `handleRemoveHtmlMockupFile` branches on whether the removed id is a source HTML or a paired spec, `handleViewHtmlMockupFile` looks up both `htmlMockupFiles` and `htmlMockupSpecs`, `UploadProgressEntry` gained an optional `stage` field, `HtmlMockupFileList` renders the two-phase progress bar and nested paired-spec rows (generating/ready/error+retry), `RefreshCw` added to the icon imports.
- `src/app/globals.css` — added an `indeterminate-bar` keyframe for the generation-phase progress bar (translateX sweep, since there's no byte-progress signal to report during generation).

### Deviations From Plan
- None — implementation matches the task document's proposed file changes and design (generate/regenerate sharing one endpoint, storage-cleanup scoped only to the cascaded spec object per the task doc's explicit scope, not the broader pre-existing primary-asset storage-cleanup gap which was intentionally left untouched as out of scope).

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Manual browser test (upload → progress → paired MD → view/edit/regenerate → delete-cascade) - SKIPPED (requires migration 090 applied to a live Supabase instance; not run in this session — flagging for manual QA before ship)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Fixed one real finding during this pass: `generate-mockup-spec.ts`'s error-path `logLLMInvocation` call always logged `modelUsed: "unknown"`, even when `getModelConfig` had already resolved successfully and only the later `generateText` call failed. This diverges from the established `assess.ts` convention (an outer-scoped `modelId` variable set once config resolves, so the error path can still attribute the log correctly) and would have quietly degraded cost-attribution/observability for this layer. Fixed by hoisting `modelId` the same way `assess.ts` does. Re-ran `tsc`/`lint` after the fix — both still pass.
- All new/changed files reviewed (`090_customer_assets_mockup_spec.sql`, `hub.ts`, `database.ts`, `generate-mockup-spec.ts`, `generate-md/route.ts`, `assets/route.ts`, `_onboarding-wizard.tsx`, `globals.css`). No dead code, no untyped escape hatches, no deep nesting beyond what the existing file's established patterns already use, error handling follows the codebase's existing try/catch + `console.error` + typed JSON error response convention throughout.
- New wizard state (`htmlMockupSpecs`, `htmlMockupSpecStatus`) and handlers (`generateMockupSpecFor`, `handleRegenerateMockupSpec`) follow the same naming/shape conventions as the pre-existing `htmlMockup*` state and handlers they sit beside — no parallel/inconsistent pattern introduced.
- No secrets, credentials, or debug logging added.

### Deviations
- None beyond what Implementation Notes already recorded (generate/regenerate sharing one endpoint; storage-cleanup scoped only to the cascaded spec object, not the broader pre-existing primary-asset gap) — both are Minor and already justified against the task document's explicit scope.

### Required Fixes
- None.

## Post-Review Fixes (user-reported during manual QA)

Uploaded HTML/generated MD weren't appearing in the Storage folder + KB step's "HTML Mockup"
folder within the same session. Not a checklist-gating issue (confirmed no such gate exists in
`StorageFileExplorer`, which filters purely on `asset.folder_id`). Two causes, both fixed:

1. **Real task 199 defect:** `LABEL_TO_SYSTEM_FOLDER` in `assets/folders/route.ts` (the
   server-side lazy backfill map from task 141) had no entry for the new `"Mockup Build Spec"`
   label, so even after a refresh the generated spec would land in "Other", not "HTML Mockup".
   Added the missing mapping.
2. **Pre-existing, cross-step gap this feature exposed:** `phase1Assets` (backing the Storage/KB
   File Explorer) is fetched once on wizard mount and is otherwise only kept in sync by that
   step's own direct actions (`handleUpload`/`handleRemoveFile`) — no other step's upload
   handler (Business Facts, Outcome, Migration Checklist, Content Map, Signoff, and originally
   HTML Mockup too) pushes into it, so newly uploaded files across the wizard are invisible in
   Storage/KB until a full page reload. Confirmed present in `handleBusinessFactsUpload` too —
   not introduced by this task. Closed for the HTML Mockup step only (in scope for task 199):
   `handleHtmlMockupUpload` now resolves the already-provisioned "HTML Mockup" system folder id
   from `phase1Folders` and sets it explicitly at creation (so the MD row inherits the same
   `folder_id` server-side, no unfiled window at all), and both `handleHtmlMockupUpload` and
   `generateMockupSpecFor`/`handleRemoveHtmlMockupFile` now keep `phase1Assets` in sync directly,
   mirroring the pattern `handleUpload`/`handleRemoveFile` already use. The same gap for the
   other five steps is unfixed — flagging as a candidate follow-up task, not silently expanded
   into here.

Re-ran `npx tsc --noEmit` and `pnpm lint` after these fixes — both PASS.
