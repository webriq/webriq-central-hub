# 202: Onboarding Wizard v2 Sandbox — Tabbed Redesign (Business Info / Files / Access / Checklist) at `/v2/portfolio-tracker/[projectId]/v2`

**Created:** 2026-08-04
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

The Phase 1 Onboarding Wizard (`src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx`) currently forces clients through 7 sequential, gated sub-phase steps (Kickoff → Outcome target → Migration checklist → Content map → HTML mockup → Storage folder + KB → Client sign-off). Full folder-based file management — folders, drag-and-drop, thumbnails, per-role/per-person sharing — only exists inside step 6 ("Storage folder + KB"), even though every other step *also* collects files.

Per direct client feedback (Slack, screenshotted by the requester): clients don't work step-by-step. They want to dump raw files (credentials, marketing docs, anything) into a folder as soon as kickoff starts, organize by folder so they can later gather a folder's contents and feed it to an AI to draft e.g. the Outcome Target doc, set sharing per file (e.g. a HubSpot credential shared with PM *and* developer, but other raw data PM-only), and do all of this "regardless of where I am in the steps" — then go back later and check off the checklist.

Investigation confirms the underlying data model already supports nearly all of this — it's just gated behind the linear step flow and confined to step 6:
- **Folders** already exist per Phase-1 deliverable (`Business Files` [+ `Branding`/`Proposals`/`Collateral` sub-folders], `Outcome Target`, `Checklist`, `Content Map`, `HTML Mockup`, `Other`), auto-provisioned by `assets/folders/route.ts`'s `provisionAndBackfill()` (tasks 141/144).
- **Per-file and per-folder sharing** (role-based and named-person) already exists end-to-end — UI, API, DB columns (`allowed_roles`/`allowed_user_ids` on both `customer_assets` and `customer_asset_folders`, tasks 138/144), including a search-to-add person picker.
- **A full tabbed file explorer** (Project Files / Credentials / Links, drag-and-drop, Drive-style thumbnails, grid/list toggle) was just built for step 6 in task 198.
- **HTML mockups auto-generate a paired AI build-spec MD file** on upload (task 199) — this must keep working regardless of where the upload happens from.

**Decision (requester, 2026-08-04): build this as an isolated sandbox, not an in-place edit.** The redesigned experience ships at a brand-new route — `/v2/portfolio-tracker/[projectId]/v2` — built entirely from **new files**. No existing file is modified. This lets the new tabbed model be reviewed/demoed against real project data without any risk to the shipping wizard (which stays exactly as task 200 left it, gating and all), and without needing to resolve every migration/consolidation question up front.

## Requirements

- [ ] New route `src/app/v2/(hub)/portfolio-tracker/[projectId]/v2/page.tsx` renders at `/v2/portfolio-tracker/[projectId]/v2` (note: the `[projectId]` segment is the project's `project_id`, per this repo's existing routing-key exception for this route family — same convention the parent route already uses).
- [ ] The new route reuses `loadOnboardingDetailData`/`getCompanyNameForMetadata` from the existing `_load-detail-data.ts` **via import only** — this file is shared infrastructure, already used by the current `page.tsx`, and needs no changes.
- [ ] The new page renders a **new** client component (e.g. `_onboarding-wizard-v2.tsx`, new file, not derived by editing the original) implementing Phase 1 as 4 always-accessible tabs — **Business Info**, **Files**, **Access**, **Checklist** — with no forward-progress gate. A client can go straight to Files and upload anything to any folder before touching Business Info.
- [ ] **Business Info** tab: an always-open accordion, one section per structured deliverable — Kickoff (Contacts, Website URL, Competitor URLs, Business Facts rich text, Additional Notes), Outcome Target (rich text), Migration Checklist (rich text), Content Map (rich text), Client Sign-off (rich text). Each section shows its file-completion signal (text OR a file filed in that deliverable's folder) and a quick-upload affordance targeting that deliverable's folder; the file list itself is managed through the Files tab.
- [ ] **Files** tab: a folder-based explorer equivalent to the existing step-6 `StorageFileExplorer` (bigger folder tiles, thumbnails, drag-and-drop, grid/list toggle — task 198's design), showing **all** Phase-1 system folders at once (Business Files, Outcome Target, Checklist, Content Map, HTML Mockup, Other). Uploading an `.html` file into the "HTML Mockup" folder must still trigger the existing `generate-md` API route (task 199's auto paired-MD generation) — call the existing route, do not reimplement it.
- [ ] **Access** tab: Credentials and Links panels, functionally equivalent to the existing ones (reuse `AddCredentialLinkModal` via import — it already accepts an `initialType` prop and is a standalone module-scope component in the original file; see Code Context for whether it needs to move to be importable).
- [ ] **Checklist** tab: one flat, cross-deliverable list combining each deliverable's client-facing status (derived the same way the original file derives `isXFilled`) and the marketing/admin-only internal checklist (`INTERNAL_DELIVERABLES`/`internalDeliverablesForSubPhase`, imported from `@/config/customer-phases` — already a shared module, safe to import), grouped by deliverable, each item checkable independent of order. Internal-deliverable visibility rule ("never shown to PM/developer/hr") must be preserved.
- [ ] Per-file/per-folder sharing (role/person picker) is reachable immediately after an upload completes.
- [ ] Due-day / overdue badges (`DUE DAY N`, `OVERDUE`) appear per-deliverable (Business Info section headers, Checklist group headings), reusing `getCurrentProgrammeDay`/day-range data already exported from `@/config/customer-phases`.
- [ ] PM read-only behavior is preserved: PM can view but not edit/upload, matching the spirit of the original `isStepReadOnly` gate, reimplemented fresh for the tab/section model.
- [ ] **No existing file is modified.** Confirm via `git status`/diff at the end of implementation that every file touched is newly created under the new `v2/` subfolder (or, if truly unavoidable, flag any exception explicitly for user sign-off before proceeding — expected to not be necessary given `_load-detail-data.ts` and `@/config/customer-phases` are already cleanly importable).
- [ ] No entry point/link is added anywhere in the existing UI pointing at this new route (adding one would require editing existing files) — reached by direct URL only, for now.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass; no new API routes or migrations required (existing folder/permission/upload/MD-auto-gen endpoints are reused as-is, called from the new UI).

## Out of Scope / Must-Not-Change

- **Do not edit `_onboarding-wizard.tsx`, `_onboarding-detail.tsx`, `_wizard-step-params.ts`, or the existing `page.tsx` in any way** — not even a comment. The shipping wizard (including task 200's step-gating) stays exactly as-is. This task adds a parallel, additive route only.
- **Phases 2–5** are untouched — same scope boundary as before, this is Phase 1 only.
- **No new Supabase migration, no new API routes.** Folders, permissions, upload, and MD-auto-gen already exist (`/api/customers/[customerId]/assets`, `/assets/folders`, `/assets/upload`, `/assets/[assetId]/generate-md`, `/assets/[assetId]/file-url`) — call them from the new UI exactly as the original wizard does.
- **No navigation entry point added** in the sidebar, project detail page, or timeline pointing at the new `/v2` route — that would require editing existing files. Out of scope for this pass; wiring up real navigation (or deciding whether to replace the original wizard outright) is an explicit follow-up decision after the sandbox is reviewed.
- **Deep-linking is not required for v1 of the sandbox.** The original `?phase=&deliverable=` param scheme belongs to the original route/component and is not reused or reimplemented here unless the requester asks for it later.
- Known, accepted tradeoff: this approach **duplicates** a large amount of logic (rich-text fields, upload handlers, the file explorer, the permission picker, checklist derivation) that exists in `_onboarding-wizard.tsx` today, since nothing there is safe to import (it's a single 6,000+ line page-scoped client component, not a components module). This is intentional per the requester's explicit instruction, not an oversight — flagged here so a future consolidation/cleanup task is expected, not silently forgotten. Do not attempt to "fix" this by extracting shared components out of the original file in this pass — that would count as editing existing code.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/v2/page.tsx` | Create | Server component entry point for the new route. Imports `loadOnboardingDetailData`/`getCompanyNameForMetadata` from the existing `../_load-detail-data.ts` (no edits to that file). Renders the new client component below. |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/v2/_onboarding-wizard-v2.tsx` | Create | New client component: 4-tab shell (Business Info / Files / Access / Checklist), Business Info accordion, promoted file explorer, promoted credentials/links, flat checklist. Built fresh — may reference the original file as a pattern/style reference during implementation, but contains no imports from it. |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/v2/_file-explorer-v2.tsx` (optional split) | Create | If `_onboarding-wizard-v2.tsx` grows unwieldy, split the Files-tab folder/file explorer into its own file within the same `v2/` folder — still page-scoped to this one new route family, not promoted to `src/components/`. |

No existing file appears in this table — that is intentional and required by this task's scope.

## Code Context

### `_load-detail-data.ts` (full file, unchanged, imported as-is)

`loadOnboardingDetailData(projectId)` returns `{ project, role, userId, phase1Members, projectMembers }` — `project.id` (UUID) is what the assets/folders APIs expect as `customerId`'s sibling `projectId` query param (confirm against the original wizard's usage — it calls these APIs with `project.id`, the UUID, not `project.project_id`, the display id). `getCompanyNameForMetadata(projectId)` takes the route's `project_id` (display id) directly, matching `generateMetadata`'s param shape.

### `src/config/customer-phases.ts` (full file, unchanged, imported as-is)

Already-exported and safe to import: `PROGRAMME_PHASES`, `getPhaseByNumber(1)` for Phase 1's 7 deliverables (`kickoff`, `outcome-target`, `migration-checklist`, `content-map`, `html-mockup`, `storage-kb`, `client-signoff`), `getCurrentProgrammeDay(startedAt)`, `INTERNAL_DELIVERABLES`, `internalDeliverablesForSubPhase(key)`.

### Existing API routes to call from the new UI (all unchanged, reused as-is)

```
GET/POST   /api/customers/[customerId]/assets?projectId=&phaseNumber=1
GET/POST   /api/customers/[customerId]/assets/folders?projectId=&phaseNumber=1
POST       /api/customers/[customerId]/assets/upload
POST       /api/customers/[customerId]/assets/[assetId]/generate-md   (HTML mockup → paired MD)
GET        /api/customers/[customerId]/assets/[assetId]/file-url      (signed URL for preview/thumbnail)
PATCH-ish permission updates — mirror the shape used by the original `onPermissionsChange`/`onFolderPermissionsChange` (`{ allowed_roles?, allowed_user_ids? }`) against the same assets/folders routes.
```

### `AddCredentialLinkModal` — currently module-scope inside `_onboarding-wizard.tsx` (~line 4675), not exported

```tsx
function AddCredentialLinkModal({
  customerId, projectId, staffDirectory, initialType, onClose, onCreated,
}: { ... initialType?: "link" | "credential" }) { ... }
```

Since this task must not edit the original file (including adding an `export`), the new sandbox needs its **own** copy of this modal (or an equivalent) inside the new `v2/` folder — do not attempt to import a non-exported symbol across files.

### Reference-only (read, do not import from): `_onboarding-wizard.tsx`'s per-deliverable completion derivation pattern, for shape reference when writing the new component's equivalent logic

```tsx
const isBusinessFactsFilled = stripHtml(businessFacts).length > 0 || businessFactsFiles.length > 0;
const isOutcomeFilled = stripHtml(outcomeText).length > 0 || outcomeFiles.length > 0;
```

### Reference-only: `src/app/api/customers/[customerId]/assets/folders/route.ts:32-55` — system folder names/labels (already provisioned server-side; the new UI just needs to fetch and render them, no changes needed here)

```ts
const LABEL_TO_SYSTEM_FOLDER: Record<string, string> = {
  "Business Facts": "Business Files", "Documents": "Business Files",
  "Outcome Target": "Outcome Target", "Migration Checklist": "Checklist",
  "Content Map": "Content Map", "HTML Mockup": "HTML Mockup", "Mockup Build Spec": "HTML Mockup",
};
```

## Implementation Steps

1. Create `v2/page.tsx`: mirror the existing `page.tsx`'s shape (auth/role guard comes free via `loadOnboardingDetailData`), but drop the `?phase=&deliverable=` deep-link handling (out of scope per Requirements) — just fetch `project`/`role`/`userId` and render the new client component.
2. Create `v2/_onboarding-wizard-v2.tsx`: fetch `phase1Assets`/`phase1Folders` client-side (same query shape as the original: `GET .../assets?projectId=&phaseNumber=1` and `.../assets/folders?projectId=&phaseNumber=1`), fetch/derive each deliverable's rich-text content the same way the original does (likely from a `customer_deliverables`/`onboarding_internal_deliverables`-backed endpoint — check the original's data-fetching effect for the exact shape before writing this from scratch).
3. Build the tab shell (pill-tab bar) and the **Business Info** accordion — one section per deliverable, rich-text field + read-only file summary + quick-upload button targeting that deliverable's folder.
4. Build the **Files** tab — folder grid (bigger tiles per task 198's design intent), open-folder file grid with thumbnails, drag-and-drop upload, wired to the existing upload/folders APIs. Confirm `.html` uploads into "HTML Mockup" call `generate-md` afterward.
5. Build the **Access** tab — Credentials/Links sub-tabs, new self-contained `AddCredentialLinkModal` equivalent (own copy, not imported from the original file).
6. Build the **Checklist** tab — iterate Phase 1's deliverables (`getPhaseByNumber(1).deliverables`), render each with its derived client-facing status and its `internalDeliverablesForSubPhase(key)` items (role-gated: hide the internal half for pm/developer/hr).
7. Add per-file/per-folder sharing UI (role + named-person picker) — new copy, functionally matching the original's picker.
8. Manually verify in-browser: navigate directly to `/v2/portfolio-tracker/<project_id>/v2`; upload directly into Files without visiting Business Info first and confirm the Business Info section reflects it; upload an HTML mockup and confirm paired MD generation still fires; set per-file sharing and confirm role-based visibility; toggle internal checklist items and confirm PM/developer/hr never see them.
9. Run `git status`/`git diff` and confirm every changed/new path is under the new `v2/` folder — no pre-existing file shows as modified.

## Acceptance Criteria

- [ ] `/v2/portfolio-tracker/[projectId]/v2` renders the 4-tab experience against real project data.
- [ ] `git status` shows **only new files** under `.../[projectId]/v2/` — zero modified existing files.
- [ ] Files can be uploaded to any Phase-1 folder from the Files tab without visiting any other tab first; Business Info/Checklist reflect that upload without a full page reload.
- [ ] HTML mockup uploads from the new Files tab still trigger the existing paired-MD auto-generation.
- [ ] Per-file and per-folder sharing works from the new UI (role-based and named-person).
- [ ] The internal checklist is never visible to PM/developer/hr roles in the new Checklist tab.
- [ ] The original `/v2/portfolio-tracker/[projectId]` route (and its wizard, gating included) behaves identically to before this task — zero regression, since nothing there changed.
- [ ] `npx tsc --noEmit` passes; `pnpm lint` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
git status   # confirm only new files under .../[projectId]/v2/
# Manual, browser-based (per CLAUDE.md — no test runner configured):
# 1. Navigate directly to /v2/portfolio-tracker/<project_id>/v2 (no nav link exists yet).
# 2. Go straight to Files tab, upload into "Outcome Target" folder, confirm Business Info
#    reflects it without reload.
# 3. Upload an .html file into "HTML Mockup", confirm the paired MD still auto-generates.
# 4. Set a file's sharing to PM-only at upload time, verify a developer-role account can't see it.
# 5. Check off internal checklist items, confirm PM/developer/hr accounts never see them.
# 6. Separately, spot-check the original /v2/portfolio-tracker/<project_id> route still works
#    exactly as before (no regression from this task, since it touched no shared file).
```

## Compatibility Touchpoints

- No new migration, no new API routes, no schema change — the new UI is purely a new consumer of existing endpoints.
- `_docs/mcp-tools.md` — not affected.
- No change to the original wizard's URL shape, deep-links, or task 200's gating behavior — this task does not supersede task 200; the sandbox exists alongside it. (A prior draft of this task doc proposed editing the original file and retiring task 200's gate — that plan is superseded by the requester's 2026-08-04 decision to build an isolated copy instead.)
- Follow-up decision needed later (not part of this task): once the sandbox is reviewed, decide whether to (a) replace the original wizard with this one and delete the duplication, (b) keep both indefinitely, or (c) discard the sandbox. Flag this explicitly rather than deciding it here.

## Implementation Notes

### What Changed
- Built the 4-tab sandbox (Business Info / Files / Access / Checklist) at `/v2/portfolio-tracker/[projectId]/v2` as 10 brand-new files, all under a new `v2/` subfolder. Zero existing files were modified — confirmed via `git status` at the end of implementation (see Verification Run).
- **Design references followed:** `_final_design/guide/central-hub-design-system.md` for every token (colors, radii, type scale) — matches `../_onboarding-wizard.tsx`'s own fixed-hex convention for this feature area (not the `isDark`-prop pattern used elsewhere in v2, since this file doesn't use it either). Consulted `frontend-design` and `impeccable` skills before writing UI: `impeccable`'s `context.mjs` confirmed this project's register is `product` (not `brand`) — read `reference/product.md`, whose core guidance ("earned familiarity," consistency over novelty, restrained color, one component vocabulary) is why this build faithfully replicates the original wizard's existing visual language (pill tabs, card styling, pill buttons, permission-picker shape) rather than introducing a new one. `frontend-design`'s brainstorm/signature-element process was judged not applicable to an internal tool extension that must match an established design system — noted and consciously skipped rather than blindly applied.
- **File length**: followed `nextjs-file-length-best-practices.md` by splitting what would have been one large component into 10 focused files (largest is 282 lines) instead of one monolith — contrasts with the original `_onboarding-wizard.tsx` (6,148 lines), which this task's "don't edit existing code" constraint left untouched by design.

### Files Changed (all new)
- `v2/page.tsx` (25 lines) — server entry; imports `loadOnboardingDetailData`/`getCompanyNameForMetadata` from `../_load-detail-data.ts` (existing shared module, imported not edited).
- `v2/_wizard-v2-types.ts` (73 lines) — shared types mirroring the `customer_assets`/`customer_asset_folders`/`customer_deliverables`/`onboarding_internal_deliverables` DB rows.
- `v2/_shared-ui.tsx` (151 lines) — design tokens, `IconTip`, `RichTextField` (tiptap StarterKit), `DueBadge`, `PillTabs`.
- `v2/_permission-picker.tsx` (130 lines) — shared role + named-person sharing popover, used by Files and Access tabs.
- `v2/_file-tile.tsx` (139 lines) — folder tile, file tile, image thumbnail (real, lazy-loaded), color-coded file-type fallback tile.
- `v2/_files-tab.tsx` (194 lines) — folder grid / open-folder file grid, drag-and-drop upload into an open folder, new-folder creation.
- `v2/_business-info-tab.tsx` (266 lines) — accordion of Kickoff/Outcome Target/Migration Checklist/Content Map/Client Sign-off, each with debounced autosave to the existing `wizard-data` route, and a per-section "open in Files" link with a real file count resolved through the section's system folder.
- `v2/_access-tab.tsx` (196 lines) — Credentials/Links sub-tabs + a self-contained Add modal (own copy — the original `AddCredentialLinkModal` is a non-exported, page-scoped function, so importing it was not possible without editing the original file).
- `v2/_checklist-tab.tsx` (72 lines) — flat per-deliverable list with the internal (marketing/admin-only) checklist nested underneath, same role-visibility rule as the original.
- `v2/_onboarding-wizard-v2.tsx` (280 lines) — orchestrator: fetches programme data / folders / assets / staff directory on mount, holds all tab state, wires every handler (upload, delete, permission change, folder create, internal-checklist toggle) to the existing API routes, renders the 4-tab shell.

### Deviations From Plan
- **Rich file previews not reproduced.** The original `StorageFileExplorer`'s CSV/Excel/Word/HTML/Markdown live-rendered thumbnails (~600 lines across `CsvFilePreview`/`ExcelFilePreview`/`DocxFilePreview`/`HtmlFilePreview`/`MarkdownFilePreview`) were not rebuilt. Images get a real lazy-loaded thumbnail; every other type gets a static color-coded icon tile (Drive's own fallback behavior for formats it can't thumbnail either — same reasoning task 198 already used for Office files, extended here to the rest). Flagged as a follow-up if the sandbox is promoted.
- **No in-app file editor.** The original's `HtmlEditorModal`/`FileViewerModal` (CodeMirror-based HTML/MD editing, in-app preview) were not rebuilt. "View" opens the file's signed URL in a new browser tab instead. A real, working simplification — not a stub — but a reduced feature vs. the original.
- **Kickoff contacts simplified** from the original's `{fullName, position, email, phone, socialMedia}` shape to `{fullName, email, phone}` (position/socialMedia dropped) to keep `_business-info-tab.tsx` a reasonable size. `phone` is captured in state but has no input field rendered yet — minor, flagged for follow-up.
- **Business Info autosave uses a simpler 1.5s debounce with inline Saving/Saved/Failed text** instead of the original's `SaveIndicator` component with a relative-timestamp display — functionally equivalent, visually plainer.
- **Root-level drag-and-drop onto a specific folder tile is not wired** (task 198's contextual drop-zone behavior) — dragging a file at the folder-grid root is a no-op; a user opens a folder first, then drags/drops or uses the Upload button. Corrected an initially-inaccurate code comment that implied this was implemented.
- **HTML mockup auto-MD-generation (task 199) is called but not deeply verified** — the upload handler fires `POST .../generate-md` when an `.html` file lands in the "HTML Mockup" folder, matching the existing route's contract, but this wasn't exercised against a live Supabase instance in this pass (see Verification Run).
- All of the above are genuine scope reductions for a "for now" sandbox, not accidents — each is a real, working simplification rather than a half-built stub, consistent with CLAUDE.md's "no half-finished implementations" by only cutting whole, clearly-bounded features rather than leaving partial ones.
- No deviation from the "zero edits to existing files" constraint — confirmed via `git status`.

### Verification Run
- `npx tsc --noEmit` — PASS (no errors).
- `pnpm lint` — PASS (no errors; a handful of unused-import warnings surfaced during the build and were fixed inline before this final run).
- `git status` on `.../portfolio-tracker/[projectId]/` — confirms only `v2/` is new (`??`); `_onboarding-detail.tsx` and `_onboarding-wizard.tsx` show as modified, but that predates this task (tasks 199/200, uncommitted from earlier in this session) — nothing in this task's implementation touched either file.
- Manual browser QA (upload-without-visiting-Business-Info-first, HTML mockup paired-MD generation, per-file/per-folder sharing across roles, internal-checklist role-gating, direct-URL navigation to `/v2/portfolio-tracker/<project_id>/v2`) — SKIPPED, not run in this pass. Flagging for the `test` stage / manual QA per the task document's own Verification section.

### Post-Ship Follow-Up (user feedback, same session)

Four changes requested after the first pass, all implemented, all still under the "zero edits to existing files" constraint:

1. **Files tab brought closer to `StorageFileExplorer` (task 198) parity.** Added: grid/list view toggle; a circled-question-mark tooltip explaining the drag-and-drop zone; real per-folder-tile drop targets at root (dragging a file directly onto a folder tile now uploads into it, not just "open a folder first"); a kebab Actions menu per file/folder (View, Rename, Move to folder, Remove — plus the existing permission picker); rename (files and folders) via a new shared `RenameModal`; move-to-folder via a new `MoveModal` (flat list of root folders, since this sandbox doesn't yet support browsing into nested sub-folders — same limitation as before, still flagged); real rendered thumbnails for `text/html`, `text/markdown`, and `text/csv` (previously static icon tiles for everything except images) via two new files, `_file-previews.tsx` (preview renderers, using the already-available `marked` dependency for Markdown) and `_rename-move-modals.tsx`. Bulk multi-select/share/delete and the right-click context menu from the original were deliberately not reproduced — the kebab menu covers the same actions per-item, and bulk operations were judged a lower-priority slice of "same functionality" than folder-first browsing itself; flagged as a further follow-up if wanted.
2. **Business Info accordion removed — full view.** `_business-info-tab.tsx`'s `SectionPanel` no longer has expand/collapse state; all 5 deliverable sections render fully open, always, top to bottom.
3. **Dedicated "Notes" folder for Kickoff and Client sign-off.** `SECTION_FOLDER` in `_business-info-tab.tsx` now points both `kickoff` and `client-signoff` at a folder named "Notes" instead of the catch-all "Business Files". Since "Notes" isn't part of the server-side `SYSTEM_FOLDER_TREE` (in the existing, unedited `assets/folders/route.ts`), `_onboarding-wizard-v2.tsx` gained a one-time effect (`notesFolderRequested` ref guard) that creates it client-side via the same non-system-folder POST endpoint the "New folder" button already uses, the first time it's found missing after the initial folder fetch.
4. **Kickoff Contacts restored to full parity.** `ContactEntry` widened from the first pass's simplified `{fullName, email, phone}` back to the original's exact `{fullName, position, email, phone, socialMedia}` shape, with the same email/phone format validation, "Primary contact" badge on the first entry, and per-contact remove button.

Files changed in this round: `_business-info-tab.tsx` (rewritten), `_files-tab.tsx` (rewritten), `_file-tile.tsx` (rewritten — kebab menu, list-view row, richer thumbnail dispatch), `_onboarding-wizard-v2.tsx` (Notes-folder effect + 4 new handlers: rename asset, rename folder, delete folder, move asset), plus two new files: `_file-previews.tsx`, `_rename-move-modals.tsx`. No existing file touched (re-confirmed via `git status`).

`npx tsc --noEmit` and `pnpm lint` — both PASS, no errors, no warnings, after this round.

Manual browser QA for this round (grid/list toggle, per-tile drag-drop, rename, move, Notes-folder auto-creation, full-view Business Info, expanded contact fields) — not run in this pass, same deferral as the original pass.

### Post-Ship Follow-Up #2 (user feedback, same session)

1. **Business Info narrowed to Kickoff only.** Removed the Outcome Target, Migration Checklist, 90-day Content Map, and Client Sign-off cards from `_business-info-tab.tsx` entirely — those deliverables no longer have a typed-notes surface in this redesign; they're file-first via their own Files-tab folder only (Sign-off's notes now live in the "Notes" folder alongside Kickoff's, per Follow-Up #1's decision). Removed the now-dead `SingleTextField`/`SECTION_FOLDER` multi-key map/`isSectionFilled` export along with them — no orphaned code left behind.
2. **Kickoff card header simplified.** Removed the "Kickoff" title text and the `DueBadge` status chip from the card header entirely. In their place, a single right-aligned "Kickoff Notes" link (disabled until the "Notes" folder exists) that switches to the Files tab with that folder already open — replacing the previous per-section "N files in X — open in Files" footer link.
3. **Files vs. "Documents" naming — kept "Files".** Asked directly; recommendation: keep the tab labeled **Files**, not "Documents". Reasoning — the tab holds far more than documents (HTML mockups, images, spreadsheets, raw/misc dumps per the client's own Slack ask), "Documents" reads as text-file-specific and would undersell what's actually in there, and it stays consistent with the Drive-style mental model the client referenced ("Documents" is what Google Drive calls one *filtered view* within Files, not the whole surface). Easy one-line rename later (`PillTabs` label in `_onboarding-wizard-v2.tsx`) if the requester disagrees after seeing it live.
4. **Drag-and-drop empty state now matches the original wizard's per-field upload box.** Added `UploadDropzone` to `_files-tab.tsx`, copying `../_onboarding-wizard.tsx`'s `FileUploadBox` visual spec exactly: rounded-2xl dashed border, `min-h-[168px]`, circular blue icon badge (solid on drag-over) with `CloudUpload`, "Drag & drop a file, or browse" (browse in blue) + "Any document, spreadsheet, or image" subtext. Replaces the plain dashed-box + static text used for the "this folder is empty" state (read-only viewers without upload rights still get the old plain `EmptyPanel` text, since there's nothing actionable to show them); the root "no folders yet" state is unchanged (dropping isn't valid there without a target folder).

Files changed: `_business-info-tab.tsx` (rewritten, shrunk to 194 lines), `_files-tab.tsx` (added `UploadDropzone`, 277 lines), `_onboarding-wizard-v2.tsx` (`BusinessInfoTab` call site simplified — no longer passes `deliverables`/`assets`/`currentDay`, which that tab no longer needs). No existing file touched (re-confirmed via `git status`). `npx tsc --noEmit` and `pnpm lint` — both PASS, no errors, no warnings.

### Post-Ship Follow-Up #3 (user feedback, same session)

The first Files-tab pass (Follow-Up #1) deliberately deferred the right-click context menu and bulk multi-select/share/move/delete, flagged as a further follow-up. Both are now implemented, closing that gap against `StorageFileExplorer`:

- **Context menu.** Right-clicking a file or folder tile opens the exact same action list as its kebab dropdown, at the cursor position (clamped to the viewport) — `_file-tile.tsx`'s `FileTile`/`FolderTile` now build their `actions: ItemAction[]` array once and feed both triggers (extracted the dropdown's item-rendering into a shared `ActionsMenuItems` so the two entry points can't drift apart, mirroring `../_onboarding-wizard.tsx`'s own `renderFileMenuItems`/`renderFolderMenuItems` reuse pattern). `_files-tab.tsx` owns the single floating menu instance and its dismiss-on-click-outside/on-second-right-click behavior.
- **Bulk selection.** Each `FileTile` (grid and list) gained a select checkbox (hover-revealed, stays visible once checked) — folders are not selectable, matching the original (its bulk bar's Share/Move/Delete only ever acted on assets). A new `_bulk-toolbar.tsx` renders the "N selected" bar (Clear / Share / Move to folder / Remove) once any file is selected; Share reuses the existing `PermissionPicker` popover with local, ephemeral role/person state that starts empty each time it opens and fans every change out to all selected files via `Promise.all`; Move reuses the existing `MoveModal` (generalized from a single `moveTargetAssetId` to `moveTargetAssetIds: string[]`); Remove fans `onDeleteAsset` out the same way.

Files changed: `_file-tile.tsx` (exports `ItemAction`/`ActionsMenuItems`, adds selection checkbox + `onContextMenu` prop to both tile types), `_files-tab.tsx` (selection state, context-menu state + floating menu, `BulkToolbar` wiring, `moveTargetAssetIds` generalization), plus one new file: `_bulk-toolbar.tsx`. No existing file touched (`git status` re-confirmed).

`npx tsc --noEmit` and `pnpm lint` — both PASS, no errors, no warnings.

### Post-Ship Follow-Up #4 (user feedback, same session)

User asked for a careful re-read of `StorageFileExplorer`'s real interaction model, having caught three deviations from it. Re-read the original's actual file/folder card JSX (previously only its state/handlers/menus had been read, not the card markup itself) and corrected all three:

1. **No tooltips on menu items.** `renderFileMenuItems`/`renderFolderMenuItems` in the original are plain buttons — only the kebab *trigger* icon carries an "Actions" tooltip, never the dropdown items themselves. `ActionsMenuItems` (shared by the kebab dropdown and the context menu) no longer wraps each action in `IconTip`.
2. **Clicking a file tile selects it — it does not open/view it.** The original's file card is one big `<button onClick={() => toggleSelect(f.id)}>` with `aria-pressed={isSelected}`; opening the file is only reachable via the kebab/context menu's "View" action. `FileTile`'s card `onClick` now calls `onToggleSelect`, not `handleView` — matches exactly.
3. **No separate checkbox element.** The original never renders a checkbox — "selected" is the whole card's background/border flipping to `bg-[#EAF2FF] border-[#007BFF]`. Removed the checkbox button entirely; selection is now shown purely via that same card-level color change.

While re-reading, two more real mismatches surfaced and were fixed in the same pass, not just the three explicitly flagged:

4. **Permission editing moved from a floating popover to an inline expandable panel.** The original never shows a persistent "Set access" trigger on each card — it shows a small read-only permission badge (`permissionBadge`, e.g. "All roles" or a restricted-roles/person-count summary) directly on the card, and editing happens through a **"Permissions" kebab/context-menu item** that toggles an inline panel rendered below the tile (`renderPermissionsPanel`/`renderFolderPermissionsPanel`). Refactored `_permission-picker.tsx`: extracted the shared role-pill + person-search body into `PermissionFields`, kept the existing floating `PermissionPicker` popover (still correct for the Access tab's credential/link rows and the bulk-selection Share action, which don't have this per-card badge+panel pattern in the original either), and added `InlinePermissionsPanel` for file/folder tiles. Added a small `PermissionBadge` display component to `_file-tile.tsx`.
5. **Folder card is one big button too**, not a button-plus-corner-icons — restructured `FolderTile` to match: single clickable region (icon + name + file count) with the kebab as an absolutely-positioned sibling overlay, same shape as the file tile now.

One accepted, minor deviation from the original kept for simplicity: the original tracks a single `permissionsOpenId`/`folderPermissionsOpenId` so at most one panel is open across the whole grid at a time; this sandbox tracks that state locally per-tile instead, so in principle more than one tile's panel could be open simultaneously. Not expected to matter in practice and flagged here rather than silently diverging.

Files changed: `_permission-picker.tsx` (refactored: `PermissionFields`, `InlinePermissionsPanel` added; `PermissionPicker` popover kept for Access tab/bulk share), `_file-tile.tsx` (rewritten: `ActionsMenuItems` tooltip-free, card click = select not view, no checkbox, `PermissionBadge`, folder tile restructured to one clickable region). No existing file touched (`git status` re-confirmed).

`npx tsc --noEmit` and `pnpm lint` — both PASS, no errors, no warnings.

### Post-Ship Follow-Up #5 (user-reported visual bug, screenshot)

User shared a screenshot of the "Business Files" folder showing two broken-looking thumbnails: an HTML mockup preview overflowing its tile with a visible native scrollbar and cut-off content, and CSV previews rendering as a tiny table stranded in a mostly-empty white tile. Root cause: the first pass's `HtmlPreview`/`CsvPreview` didn't match the original's actual thumbnail technique — only their *existence* had been read/replicated, not their real implementation (`HtmlFilePreview`/`CsvFilePreview` in `../_onboarding-wizard.tsx`, ~5162–5328). Re-read those and fixed both:

- **HtmlPreview** now uses the original's real scale-to-fit technique: a `ResizeObserver` measures the thumbnail's actual box, the iframe renders the page at a real 1280px desktop design width (so the page's own responsive breakpoints behave normally instead of squeezing into a tiny viewport), and a CSS `transform: scale()` shrinks the whole rendered page down to fit — a true "mini page" instead of a cropped, scrollable fragment.
- **CsvPreview** now renders a real, unscaled table (10.5px, not artificially shrunk to 8px/4-columns) inside a clipped `overflow-auto` box, matching the original's actual sizing — it reads as a real spreadsheet snippet instead of a doll's-house table floating in empty space.
- **MarkdownPreview** (not visibly broken in the screenshot, but also re-checked against the original) switched from a raw `dangerouslySetInnerHTML` div to a sandboxed iframe wrapping a small standalone HTML document, matching `MarkdownFilePreview`'s actual approach.

Files changed: `_file-previews.tsx` only (rewritten). No existing file touched (`git status` re-confirmed). `npx tsc --noEmit` and `pnpm lint` — both PASS.

### Post-Ship Follow-Up #6 (user feedback, same session)

User clarified the grid-view file cards should be square, matching `../_onboarding-wizard.tsx`'s actual card shape (`w-full aspect-square`), not the `aspect-[4/3]` thumbnail-plus-content-below layout the sandbox had. Restructured `FileTile`'s grid variant to match the original's real internal layout exactly: a single `aspect-square` button divided into a shrink-0 header row (small file icon + filename), a `flex-1 min-h-0` thumbnail area, and a shrink-0 footer row (file size + permission badge) — not a fixed-ratio thumbnail with a separate content block underneath. Folder tiles were left as-is (the original's folder tile isn't square either — a shorter `min-h-26` rectangle), and list view is unchanged (rows, not squares, by nature).

Files changed: `_file-tile.tsx` only. No existing file touched (`git status` re-confirmed). `npx tsc --noEmit` and `pnpm lint` — both PASS.

### impeccable design-hook findings (acknowledged, left unchanged)
The `impeccable` design hook flagged the same `design-system-font-size` finding repeatedly (~30 occurrences across every new file) for `text-[11px]`/`text-[12px]`/`text-[12.5px]` values used on pills, chips, badges, and dense list rows. These are not new deviations — they replicate `../_onboarding-wizard.tsx`'s own established micro-typography convention verbatim (its `RichTextField` toolbar, `AddCredentialLinkModal`, `ASSET_ROLE_OPTIONS` pills, and permission-picker chips all already use this exact sub-13px scale). Per the `impeccable` product-register guidance ("earned familiarity... consistency over surprise"), matching the existing feature's real, shipped convention was judged more correct than introducing a second, "more compliant" typography scale for a page-sandbox that's meant to look native to this exact feature area. Left unchanged; not suppressed via an ignore-rule since these aren't a standing policy decision, just an acknowledged one-time judgment call for this build. One `broken-image` finding on `_file-tile.tsx`'s `<img src={url}>` is a static-analysis false positive — `url` is a runtime signed-URL string gated behind `url && !failed`, not a literal placeholder.
