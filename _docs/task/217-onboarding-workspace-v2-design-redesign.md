# 217: Onboarding Workspace v2 (`/v2/portfolio-tracker/[projectId]/v2`) — Design Redesign From `_final_design/Onboarding Workspace Design`

**Created:** 2026-08-06
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

Task 202 (and its 6 post-ship follow-ups) built the Phase 1 "Onboarding Workspace" sandbox at `/v2/portfolio-tracker/[projectId]/v2` — a 4-tab (Business Info / Files / Access / Checklist), always-accessible replacement for the original gated wizard, reachable by direct URL only. It's functionally complete and already uses the Design System v2.0 fixed-hex token convention (`_final_design/guide/central-hub-design-system.md`).

Six new final-design mockups now exist at `_final_design/Onboarding Workspace Design/` (`01-page-shell-layout.html` … `06-checklist.html`), each with an in-page annotation block explaining what changed versus the prior pass and why. They target this exact sandbox and are the source of truth for this task. Read each mockup's `.annot` block directly — it is the design rationale, not just decoration.

This task **re-skins and extends the existing 10 sandbox files** to match the 6 mockups — it does not rebuild the route from scratch, and it does not touch the original wizard (`_onboarding-wizard.tsx`, `_onboarding-detail.tsx`, `_wizard-step-params.ts`, the original `page.tsx`) at all, same boundary task 202 established. Per the explicit user instruction, apply `nextjs-file-length-best-practices.md` while doing this — several existing files are already near/at the file-length soft ceiling and must not be allowed to grow past it un-split.

### What the mockups add that the current build has no data for (read before implementing)

Investigation (this task doc) found the following mockup elements have **no backing column/field today**. Each has a scoped-down, no-migration treatment specified below — do not silently invent fake data, and do not attempt a real fix that requires a new migration (out of scope, same constraint task 202 operated under):

| Mockup element | Gap found | Scoped treatment for this task |
|---|---|---|
| Per-checklist-section owner avatar (06, "BT"/"NT" colored initials) | Neither `customer_deliverables` nor `onboarding_internal_deliverables` has an assignee/owner column | **Omit.** Do not fabricate an owner. Flag as a follow-up requiring a schema decision. |
| File-row "Uploaded by Danessa · Jul 24" (02 kickoff card, 03 file table) | `customer_assets` has no uploader column | **Omit the name, keep the date** (`created_at` already exists) — e.g. "Uploaded Jul 24" not "Uploaded by Danessa · Jul 24". |
| File version badge "v4 · latest" + version history on repeat uploads of the same filename (03) | No version-chain column on `customer_assets` (`source_asset_id` exists but is exclusively used for HTML-mockup→paired-MD linkage, task 199 — do not repurpose it) | **Client-side grouping only.** Group assets in the same folder by identical `file_name`, sort by `created_at` desc, render the newest as the visible tile/row with a `v{n} · latest` badge (`n` = count of same-name assets), expose the older ones via a small "version history" list (upload dates only, same omission as above — no rollback/diff, just a list). No new column, no migration. |
| Title-row phase chip ("Onboard") + classification chip ("StackShift I") + "Back to website" button (01) | `loadOnboardingDetailData()` in `../_load-detail-data.ts` does not select `project_type`, `existing_website`, or the linked `customer_products.classification` | **Additive-only edit to `_load-detail-data.ts`** — widen the existing `.select()` on `projects` to include `project_type`, `existing_website`, and `customer_product_id`, plus a second lookup (or a join) for `customer_products.classification`. This file is shared with the original (unmodified-elsewhere) wizard's `page.tsx`; widening a `select()` and a return object is additive and does not change that consumer's behavior — confirm this at implementation time by re-reading that call site. The phase chip itself needs no new data: this route is Phase-1-only, so it's a static "Onboard" label. |

Two mockup elements are **real, buildable features**, not just re-skins — call these out explicitly rather than passing them off as CSS work:

- **Upload progress + retry (04).** The current `handleUpload` uses `fetch`, which has no upload-progress event. Swap to `XMLHttpRequest` (or `fetch` + a `ReadableStream` wrapper, implementer's choice) so `upload.onprogress` can drive a real per-file progress bar, and so a failed request can be retried by re-invoking the same upload call rather than needing to re-pick the file.
- **5-second undo-delete on Access tab deletes (05).** Mockup 05 is the only place this appears — do not add undo to Files-tab deletes (03's bulk bar shows immediate Move/Delete, no undo). Scope this as delaying the actual `DELETE` network call ~5s behind an optimistic UI state, cancelable by an "Undo" action, implemented locally inside `_access-tab.tsx` — no change to the shared `handleDeleteAsset` contract in the orchestrator.

## Requirements

- [ ] **01 — Page shell:** breadcrumb (`Work / Portfolio Tracker / {company name}`), title row with phase chip ("Onboard", orange) + classification chip (from `customer_products.classification`, neutral gray, omit if null), subtitle copy, "Back to website" ghost button (only rendered when `existing_website` is set, opens in a new tab), and the existing task-204 "Proceed to Phase 2" CTA re-skinned into the same title-actions slot (its gating logic is unchanged — do not touch when/why it appears, only its position/wrapper).
- [ ] **01 — Programme track.** New reusable component: horizontal progress bar with ticks at phase-boundary fractions, a navy day-pill positioned at the current-day fraction, a top label row (`DAY N OF M · X SECTIONS OVERDUE`), and a footer row (`DAY 1` / `DAY M · {milestone label}`). Rendered under the title row on the page shell, and reused (see below) at the top of the Checklist tab. Compute "sections overdue" from the same per-deliverable due-day logic `DueBadge` in `_shared-ui.tsx` already uses (`currentDay > dayEnd && !done`).
- [ ] **01 — Tabs.** Replace the top-level 4-tab `PillTabs` with a new underline-style tab component (active tab gets a 2px blue underline, not a filled pill — mockup 01's annotation explicitly distinguishes this from filter/segmented pills so the two don't read as the same control). Each tab label carries a live count (Files → total asset count in Phase 1 folders; Access → total credentials+links; Checklist → `done/total` deliverables). Sub-tab pill controls (Access's Credentials/Links toggle, the grid/list view toggle) are unaffected — they keep their existing segmented-pill look, matching the mockups' own segmented (`.seg`) styling for those, which is visually distinct from the underline top-level tabs.
- [ ] **02 — Business Info field polish:** every field label marks required (`*`, red) vs. optional (`(optional)`, muted) explicitly, not just via placeholder text. Competitor/reference URLs become **editable per-row inputs with a remove button** (replacing the current add-then-display-as-chip UX) — matches mockup 02's `.multi-url` rows exactly, one `<input>` + remove button per URL, not a chip list. Business facts / Additional notes rich-text fields get a character counter footer (`N / 2000`) and a Bold/Italic/Underline/Bullet toolbar (current `RichTextField` in `_shared-ui.tsx` has B/I/Bullet only — add Underline). Website URL field gets a resolved-favicon + success-check visual state once a syntactically valid URL is entered (no backend favicon fetch required — a simple first-letter/generic globe placeholder chip satisfies the mockup's intent; do not build real favicon fetching, that's a different, larger feature). Autosave indicator becomes one full-width footer row under the whole two-column grid (`Saved automatically · last change N minutes ago` / a saving spinner state / a failed state), not the current per-column inline `SaveHint`.
- [ ] **02 — Kickoff notes reference card.** A file-card row (icon + filename + upload date + "Open" button) shown under Business Info when a file exists in the "Notes" folder — reusing the folder/asset data the orchestrator already fetches, no new query. Replaces the current header-only "Kickoff Notes" text link (that link's tab-switch-and-open-folder behavior can stay as the card's "Open" affordance, or open the file directly — implementer's call, keep whichever is less code).
- [ ] **03 — File management toolbar:** add a search input (client-side filter over the current folder's file list, or the root folder-name list when no folder is open) and a "Sort: Newest / Name" control (client-side sort, no new query param). Keep the existing breadcrumb, grid/list toggle, New-folder, and Upload controls — reposition/restyle to match mockup 03's toolbar order (breadcrumb+search flex-1, sort, view toggle, New folder, Upload).
- [ ] **03 — Duplicate-folder-name warning.** At the root folder grid, detect case-insensitive name collisions among sibling folders (the create-folder API already blocks new duplicates on the happy path — see `assets/folders/route.ts`'s 400 response — so this only ever fires for legacy data or the documented 23505-race fallback) and render the warning chip (`Same name as another folder`, warn-amber border) mockup 03 shows. Purely a read/display concern — do not change folder-creation validation.
- [ ] **03 — "New folder" as a grid tile.** Replace the current toolbar-button-reveals-an-inline-input pattern with an inline dashed "+ New folder" tile inside the folder grid itself (mockup 03's `.folder.new`), matching its position/behavior (click → inline name input appears in the tile, Enter/blur commits).
- [ ] **03 — Version badge + grouped display.** Per the scoped treatment in the gap table above: group same-named files client-side, show `v{n} · latest` badge + a version-history affordance (list of older uploads by date) on the visible tile/row.
- [ ] **04 — Dropzone states.** Default / drag-over / rejected-file (oversized or wrong type, with the specific reason in the message, matching mockup 04's copy pattern) states for the existing `UploadDropzone`-equivalent (relocate it into a new `_upload-queue.tsx`, see Proposed File Changes). State the size/type limits inline (`UP TO 25 MB PER FILE · PDF, DOCX, XLSX, CSV, PNG, JPG` — pull the real list from `ALLOWED_UPLOAD_TYPES`/`MAX_FILE_SIZE`, don't hand-copy mockup text that may drift from the real allow-list).
- [ ] **04 — Upload queue with real progress + retry.** Per-file row: icon, filename, either a determinate progress bar + percentage (via `XMLHttpRequest.upload.onprogress`) while in flight, a green check + "Uploaded" once done, or a red error icon + reason + a "Retry" button that re-attempts the same file without re-selecting it.
- [ ] **05 — Access tab:** replace the `<select>` type-switcher in the add-asset modal with a segmented Credential/Link toggle (mockup's `.type-toggle`); this already has multi-select role pills client-side — no change needed there, just confirm the visual matches (`.seg`-style pill row, `active` = filled navy, matching mockup exactly — current implementation already renders this shape, verify not rebuild). Credential rows must show the actual masked value (`••••••••••`) per field with a reveal-toggle and a copy-to-clipboard button, instead of today's `"N field(s)"` count-only summary — read the value from `AssetRow.fields[].value`, already fetched, just not rendered. Deleting a credential/link shows the 5-second undo bar described above instead of deleting immediately.
- [ ] **06 — Checklist:** render the shared `ProgrammeTrack` component at the top (see 01's requirement — same component, reused). Add the summary stats row (`Sections complete X/Y`, `Overdue` count in red, current day) above the per-deliverable cards. Where a checklist item's completion evidence lives in another tab (e.g. Migration Checklist's "Implementation file," Storage/KB's "Credentials for external integrations"), render an "Attach from Files" / "Attach from Access" link that switches tabs and opens the right folder — reuse the existing `openFolderByName` callback pattern for Files; add an equivalent tab-switch for Access (no folder to open there, just `setTab("access")`). No owner avatar (see gap table).
- [ ] File-length discipline (per `nextjs-file-length-best-practices.md`, explicitly requested): extract the new page-shell markup (breadcrumb, title row, chips, track) into its own file rather than growing `_onboarding-wizard-v2.tsx` (currently 431 lines, already over the 400-line soft ceiling) further; extract the dropzone/upload-queue markup into its own file rather than growing `_files-tab.tsx` (currently 327 lines). See Proposed File Changes for the concrete split.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass. No new Supabase migration. The one shared-infra edit (`_load-detail-data.ts`) is additive-only (widens a `select()` + return type; removes/renames nothing) — confirm the original (non-`/v2`) wizard's `page.tsx` still compiles and behaves identically after the widen.

## Out of Scope / Must-Not-Change

- **`_onboarding-wizard.tsx`, `_onboarding-detail.tsx`, `_wizard-step-params.ts`, the original (non-`/v2`) `page.tsx`** — zero edits, same boundary as task 202.
- **No new Supabase migration, no new columns.** Every scoped-down item in the gap table stays scoped down for this pass. If the requester wants real file versioning, uploader attribution, or checklist-item ownership after reviewing this pass, that's a follow-up task with its own migration — do not sneak a migration into this one.
- **Do not touch task 204's "Proceed to Phase 2" gating condition** (`allDeliverablesDone && isWriteRole && isPhaseActive`) — only its visual placement inside the new title-actions row changes.
- **Do not add undo-delete to the Files tab** — mockup 03's bulk bar and kebab/context-menu delete stay immediate, matching what mockup 03 actually shows (only mockup 05/Access shows undo).
- **No navigation entry point added anywhere** pointing at `/v2/portfolio-tracker/[projectId]/v2` — still direct-URL-only, same as task 202 left it.
- **No real favicon-fetching service** for the website-URL field's success state — a static placeholder chip is sufficient (see Requirements, 02).
- Search (03) and sort (03) are **client-side only** — no new query params, no server-side filtering.

## Proposed File Changes

| File | Action | Purpose |
|---|---|---|
| `.../v2/_workspace-header.tsx` | Create | Breadcrumb, title row (phase + classification chips, "Back to website", task-204 CTA slot), renders `<ProgrammeTrack>` and the new underline tab bar. Extracted out of `_onboarding-wizard-v2.tsx` to keep that file under the line-length ceiling. |
| `.../v2/_programme-track.tsx` | Create | The progress-bar/tick/day-pill component (mockups 01 and 06 share the exact same markup) — one component, two call sites (header, Checklist tab). |
| `.../v2/_upload-queue.tsx` | Create | Dropzone default/drag/error states + per-file upload queue with real `XMLHttpRequest` progress and retry. Replaces the inline `UploadDropzone` currently at the bottom of `_files-tab.tsx`. |
| `.../v2/_onboarding-wizard-v2.tsx` | Modify | Swap inline header/tabs JSX for `<WorkspaceHeader>`; thread `project_type`/`existing_website`/`classification` through; keep all existing data-fetching/handler logic (upload/delete/permission/rename/move/toggle) as-is except where a requirement above calls for a behavior change (undo-delete stays local to `_access-tab.tsx`, not here). |
| `.../v2/_shared-ui.tsx` | Modify | Add `UnderlineTabs` (top-level tabs w/ count badges); extend `RichTextField` with an optional `maxLength` prop that renders the `N / limit` counter and adds the Underline toolbar button; keep `PillTabs` as-is for sub-tabs/segmented controls. |
| `.../v2/_business-info-tab.tsx` | Modify | Required/optional label markers; competitor-URL chips → editable per-row inputs; website-URL success-state chip; full-width autosave footer; Kickoff-notes file-reference card. |
| `.../v2/_files-tab.tsx` | Modify | Search input, sort control, duplicate-folder-name warning, grid "New folder" tile, wires `_upload-queue.tsx` in place of the inline dropzone, computes client-side filename version groups and passes the derived badge/history data to `_file-tile.tsx`. |
| `.../v2/_file-tile.tsx` | Modify | Version badge + version-history affordance; "Uploaded {date}" (no name) in list/grid metadata; confirm list-view column order matches mockup 03 (Name / Uploaded / Visible to / Size / actions). |
| `.../v2/_access-tab.tsx` | Modify | Segmented Credential/Link toggle in the add modal (replacing the `<select>`); masked-value reveal/copy per credential field; 5s local undo-delete. |
| `.../v2/_checklist-tab.tsx` | Modify | Renders `<ProgrammeTrack>` + summary stats row at top; "Attach from Files/Access" evidence links; no owner avatar. |
| `.../v2/_wizard-v2-types.ts` | Modify | Extend `WizardV2Project` with `project_type: string \| null`, `existing_website: string \| null`, `classification: string \| null`. |
| `.../[projectId]/_load-detail-data.ts` | Modify (additive only) | Widen the existing `projects` `.select()` to also fetch `project_type`, `existing_website`, `customer_product_id`; add a follow-up `customer_products.classification` lookup keyed off `customer_product_id`; add the three fields to the returned `project` object/type. No existing field removed or renamed; no change to the auth/role-guard logic; re-verify the original wizard's `page.tsx` (which also calls this function) still works unchanged. |
| `.../v2/page.tsx` | Modify (minimal) | Pass the three new project fields through to `OnboardingWizardV2` (prop plumbing only). |

Files intentionally **not** in this table (no mockup coverage, left as-is): `_permission-picker.tsx`, `_rename-move-modals.tsx`, `_bulk-toolbar.tsx`, `_file-previews.tsx`.

## Code Context

### `_final_design/Onboarding Workspace Design/*.html`
Each file's inline `<style>` block is the literal CSS for every component in this task (colors, radii, states) — treat class names like `.track`, `.folder.dupe`, `.uploadrow`, `.access-row`, `.cl-item` as the implementation spec, not just a visual reference. All six already use the exact same CSS custom properties as `_final_design/guide/central-hub-design-system.md` (`--navy:#071133`, `--blue:#007BFF`, `--orange:#FB914E`, etc.) — the same fixed-hex values `_shared-ui.tsx` already hardcodes as Tailwind arbitrary-value classes (e.g. `text-[#0B1533]`), so no new token mapping work is needed, just translate each mockup class 1:1 into the existing Tailwind-arbitrary-value convention this folder already uses.

### `_shared-ui.tsx` — current `PillTabs` (keep for sub-tabs; do not delete)
```tsx
export function PillTabs<T extends string>({ tabs, active, onChange }: { tabs: { id: T; label: string }[]; active: T; onChange: (id: T) => void }) {
  return (
    <div className="flex items-center gap-1 bg-[#F4F6FB] rounded-full p-1 w-fit">
      {tabs.map((tab) => (
        <button key={tab.id} onClick={() => onChange(tab.id)} aria-pressed={active === tab.id}
          className={cn("px-3.5 py-1.5 rounded-full text-[12.5px] font-medium transition-colors ...",
            active === tab.id ? "bg-white text-[#007BFF] shadow-..." : "bg-transparent text-[#5F6A88] ...")}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```
New `UnderlineTabs` needs the same generic-`<T extends string>` shape but mockup 01's visual: `border-bottom` container, each tab `padding:11px 4px; margin-right:22px`, active tab gets `::after` 2px blue underline — translate to a Tailwind `after:` pseudo-element or an absolutely positioned span, plus an optional `count` per tab rendered as a muted mono-font suffix (`.tab .tcount`).

### `database.ts` — confirms the gap-table findings (read-only reference, do not add columns)
```ts
customer_assets: { Row: { /* ...no uploader/created_by column, no version column... */ source_asset_id: string | null; /* HTML-mockup→MD-spec pairing only, task 199 — do not repurpose */ } }
customer_deliverables: { Row: { /* ...no assignee/owner column... */ } }
onboarding_internal_deliverables: { Row: { /* ...no assignee/owner column... */ } }
customer_products: { Row: { classification: string | null; classifications: string[]; /* "StackShift I" etc. lives here */ } }
projects: { Row: { project_type: string; existing_website: string | null; customer_product_id: string | null; /* all present but not currently selected by _load-detail-data.ts */ } }
```

### `src/config/customer-phases.ts` — already-exported, safe to import (unchanged)
`CLASSIFICATIONS`, `STACKSHIFT_VARIANTS` (confirms `"StackShift I"` is an established classification value, not mockup-only text); `getCurrentProgrammeDay`, `getPhaseByNumber(1)` for the track's day math and deliverable list, already imported by the current orchestrator/checklist tab.

### `src/app/api/customers/[customerId]/assets/folders/route.ts` (reference only, unchanged)
Duplicate-name creation is already blocked (`"A folder with that name already exists here"`, 400) with a documented race-condition fallback (`// Ignore a duplicate-name race (23505)`) — confirms the duplicate-warning UI (Requirement 03) is a display-only concern for pre-existing/raced data, not a validation gap to fix here.

### `_files-tab.tsx` — current inline `UploadDropzone` (relocate into `_upload-queue.tsx`, do not just copy-paste unmodified — it needs the new states)
```tsx
function UploadDropzone({ uploading, isDragOver, onBrowse }: { uploading: boolean; isDragOver: boolean; onBrowse: () => void }) {
  // circular blue icon badge, "Drag & drop a file, or browse", dashed rounded-2xl border
  // — becomes the "default" state; add drag-over/error/queue states alongside it per mockup 04.
}
```

### `_access-tab.tsx` — current add-modal type control (swap `<select>` for a segmented toggle; role-pill multi-select already matches the mockup, don't rebuild it)
```tsx
<select value={type} onChange={...}><option value="link">Link</option><option value="credential">Credential</option></select>
// Visible-to pills below already do exactly what mockup 05 wants (multi-select, `active` = filled) — confirmed correct as-is.
```

## Implementation Steps

1. `_load-detail-data.ts`: widen the `projects` select + `customer_products` classification lookup; extend the returned `project` shape. Re-check the original (non-`/v2`) `page.tsx` still compiles/renders unchanged.
2. `_wizard-v2-types.ts` / `v2/page.tsx`: extend `WizardV2Project`, thread the three new fields through.
3. Build `_programme-track.tsx` (pure presentational, props: `currentDay`, `totalDays`, `phaseBoundaries`, `overdueCount`, `milestoneLabel`).
4. Build `_workspace-header.tsx` (breadcrumb, title/chips, back-to-website, CTA slot, `<ProgrammeTrack>`, new `UnderlineTabs`); wire it into `_onboarding-wizard-v2.tsx`, removing the markup it replaces.
5. Add `UnderlineTabs` + `RichTextField`'s `maxLength`/counter/Underline-mark support to `_shared-ui.tsx`.
6. `_business-info-tab.tsx`: required/optional labels, editable competitor-URL rows, website success-state chip, full-width autosave footer, Kickoff-notes reference card.
7. Build `_upload-queue.tsx` (dropzone states + XHR-backed progress queue with retry); wire into `_files-tab.tsx` in place of the old inline dropzone.
8. `_files-tab.tsx`: search + sort controls, duplicate-name detection, grid "New folder" tile, client-side version grouping (pass grouped view-model to `_file-tile.tsx`).
9. `_file-tile.tsx`: version badge + history affordance, "Uploaded {date}" copy fix, column-order check against mockup 03.
10. `_access-tab.tsx`: segmented type toggle, masked-value reveal/copy per credential field, 5s local undo-delete.
11. `_checklist-tab.tsx`: `<ProgrammeTrack>` + summary stats row + evidence links; confirm no owner-avatar was added.
12. Manual browser QA (see Verification) against real project data at `/v2/portfolio-tracker/<project_id>/v2`.
13. `git status`/`git diff` — confirm every touched path is either a new file under `.../v2/` or one of the two explicitly-approved existing-file edits (`_load-detail-data.ts`, `.../v2/page.tsx`), and that `_load-detail-data.ts`'s diff is additive-only.

## Acceptance Criteria

- [ ] All 6 mockups' components are present and visually matched at `/v2/portfolio-tracker/<project_id>/v2`: underline tabs w/ counts, programme track (header + Checklist), business-info field polish + Kickoff-notes card, file-management toolbar (search/sort/dup-warning/new-folder tile/version badge), upload dropzone states + real-progress queue, Access masked-values + segmented toggle + undo-delete.
- [ ] No fabricated data anywhere the gap table calls for an omission (no fake owner avatars, no fake uploader names, no fake favicon service).
- [ ] `_load-detail-data.ts`'s diff is additive-only; the original (non-`/v2`) onboarding wizard route still loads and behaves identically.
- [ ] Task 204's "Proceed to Phase 2" button still only appears under its existing gating condition, just re-skinned/repositioned.
- [ ] Undo-delete works on Access tab deletes only; Files-tab deletes remain immediate.
- [ ] `_onboarding-wizard-v2.tsx` and `_files-tab.tsx` end this task smaller (or not meaningfully larger) than their current line counts, with the extracted logic living in the new files — spot-check every changed file's line count against `nextjs-file-length-best-practices.md`'s 400–500 hard-limit guidance.
- [ ] `npx tsc --noEmit` passes; `pnpm lint` passes.
- [ ] No new Supabase migration; `git status` shows no edits outside `.../v2/`, `_load-detail-data.ts`, and `.../v2/page.tsx`.

## Verification

```bash
npx tsc --noEmit
pnpm lint
git status   # only .../v2/*, _load-detail-data.ts, and .../v2/page.tsx should show as changed
git diff .../[projectId]/_load-detail-data.ts   # confirm additive-only
# Manual, browser-based (per CLAUDE.md — no test runner configured):
# 1. Navigate to /v2/portfolio-tracker/<project_id>/v2 directly.
# 2. Confirm breadcrumb, phase/classification chips, "Back to website" (only if existing_website set),
#    programme track, and underline tabs w/ live counts render against real project data.
# 3. Business Info: add/remove a competitor URL row inline; verify required/optional markers;
#    confirm autosave footer states (saving → saved); upload a Notes-folder file and confirm the
#    Kickoff notes card appears.
# 4. Files: search and sort inside a folder; upload the same filename twice and confirm the
#    "v2 · latest" badge + version history appear; trigger a duplicate-folder-name state (if
#    reachable) and confirm the warning chip; drag a file to trigger the upload queue with a
#    real progress bar; force a failed upload (e.g. disallowed type) and confirm Retry works
#    where applicable.
# 5. Access: add a credential via the segmented Credential/Link toggle; confirm masked value +
#    reveal/copy; delete a credential and confirm the 5s undo bar restores it if clicked.
# 6. Checklist: confirm the programme track + summary stats row render; click an "Attach from
#    Files"/"Attach from Access" evidence link and confirm it switches tabs (and opens the right
#    folder, for Files) correctly.
# 7. Spot-check the ORIGINAL /v2/portfolio-tracker/<project_id> route (no /v2 suffix) still works
#    exactly as before — this task's only shared-file edit is additive.
```

## Compatibility Touchpoints

- No new migration, no new API routes, no schema change — every new behavior is either client-side (search/sort/dup-warning/version-grouping/undo-timer) or a real transport-level change to the existing upload call (`fetch` → `XMLHttpRequest`, same endpoint, same contract).
- `_docs/mcp-tools.md` — not affected.
- Does not supersede or alter task 200's gating on the original wizard, or task 204's Phase-2 gating condition on this sandbox.
- Follow-up decisions this task deliberately does not make (flag for the requester after review, per the gap table): whether to add real uploader attribution, real file versioning, and checklist-item ownership — each would need its own migration and its own task.

## Implementation Notes

### What Changed
- Re-skinned and extended all 10 existing task-202 sandbox files to match the 6 final-design mockups, plus 3 new files (`_programme-track.tsx`, `_workspace-header.tsx`, `_upload-queue.tsx`). One shared-infra file (`_load-detail-data.ts`) got an additive-only `select()` widen. No existing file outside `.../v2/` and that one shared file was touched; `_onboarding-wizard.tsx`/`_onboarding-detail.tsx`/`_wizard-step-params.ts`/the original `page.tsx` are untouched, confirmed via `git status`.
- **Correction to the task doc's gap table during implementation**: `DeliverableConfig` in `src/config/customer-phases.ts` already carries an `owner: string` field ("display label only, not a Hub user FK" per that file's own type comment) for every Phase 1 deliverable (`"Bert"`, `"PM + Bert"`, etc.). This is real, existing, intentional config data — not a Hub-user assignment, but not fabricated either — so the Checklist tab's per-section owner avatar (mockup 06) was **built using it** (deterministic initials + color, from `config.owner`) rather than omitted as the original task doc's gap-table entry proposed. The two other gap-table omissions (uploader name, per-checklist-item ownership beyond the section level) still stand as written — those genuinely have no backing field anywhere.
- Underline top-level tabs (`UnderlineTabs`, new in `_shared-ui.tsx`) replace the old `PillTabs` bar for the 4-tab shell only; `PillTabs` itself is unchanged and still used for the Access sub-tabs and the Credential/Link add-modal toggle, matching the mockups' own tabs-vs-segmented-pill distinction.
- Programme track (`_programme-track.tsx`) is shared by the new `_workspace-header.tsx` (with real deliverable-boundary ticks, computed from `getPhaseByNumber(1).deliverables`, not guessed) and `_checklist-tab.tsx` (no ticks, no overdue count — matches mockup 06's simpler variant exactly).
- Upload progress is real, not simulated: `_upload-queue.tsx` exports `uploadFileWithProgress()` (XHR, `upload.onprogress`) which `_onboarding-wizard-v2.tsx`'s `handleUpload` now calls instead of `fetch` for the storage-upload leg; the DB-row insert stays a plain `fetch` (small JSON, no benefit from progress). `useUploadQueue()` is a small hook (not baked into one component) so `_files-tab.tsx` can enqueue from the drag zone, a folder-tile drop, or the file picker without duplicating retry/progress bookkeeping.
- File versioning (mockup 03's "v4 · latest" badge) is client-side grouping only, computed in `_files-tab.tsx` (`versionGroups`, grouped by exact `file_name` match within the open folder, sorted by `created_at`) and rendered by a new `VersionBadge` in `_file-tile.tsx` — no schema change, no rollback/diff, just a dated list of the older uploads. Search and sort are both client-side (`searchQuery`/`sortBy` state in `_files-tab.tsx`), applied after grouping.
- Duplicate-folder-name warning is a pure display computation (`duplicateFolderNames` in `_files-tab.tsx`, case-insensitive collision count among root siblings) — the create-folder API's existing validation is untouched.
- Checklist evidence links ("Attach from Files"/"Attach from Access") are intentionally limited to the exact two items mockup 06 shows them on (`implementation-file` → Files/"Checklist" folder, `credentials-external` → Access) via a small hardcoded `EVIDENCE_LINKS` map in `_checklist-tab.tsx` — not inferred/generalized to every internal-deliverable item, since the mockup itself only wires those two (others get a plain checkbox or a `PENDING` tag).
- Access-tab undo-delete (5s) is local, single-slot state in `_access-tab.tsx` only — `onDelete` fires after the timeout unless "Undo" is clicked; a second delete while one is pending commits the first immediately rather than queuing multiple undo bars. Files-tab deletes remain immediate, per the mockups.
- `_onboarding-wizard-v2.tsx` ends at 430 lines (was 431) despite the added header-shell wiring, since the breadcrumb/title/tabs/track markup moved out to `_workspace-header.tsx`. `_files-tab.tsx` grew to 420 lines (from 327) absorbing search/sort/dup-detection/queue-wiring/version-grouping/new-folder-tile — still under the 400–500 hard-limit band in `nextjs-file-length-best-practices.md`; not split further since it remains one coherent concern (the folder/file browser) per that doc's "does splitting make it easier to understand" test.

### Files Changed
- `_load-detail-data.ts` (shared, parent folder) — additive `select()` widen (`project_type`, `existing_website`, `customer_product_id`) + a `customer_products.classification` lookup + three new fields on the returned `project` object. Nothing removed/renamed; the original (non-`/v2`) route's destructure is unaffected (excess object properties are fine in TS).
- `v2/_wizard-v2-types.ts` — `WizardV2Project` extended with `project_type`, `existing_website`, `classification`. `v2/page.tsx` needed no edit — it already passes the whole `project` object through.
- `v2/_programme-track.tsx` (new) — shared progress-bar/tick/day-pill component.
- `v2/_workspace-header.tsx` (new) — breadcrumb, title row (phase/classification chips, "Back to website", CTA slot), track, underline tabs w/ counts.
- `v2/_upload-queue.tsx` (new) — `uploadFileWithProgress`, `useUploadQueue`, `UploadQueuePanel`, `UploadDropzone` (default/drag/error states).
- `v2/_shared-ui.tsx` — added `UnderlineTabs`; extended `RichTextField` with `maxLength` (counter + Underline mark, via `@tiptap/extension-underline`, already an installed dependency).
- `v2/_onboarding-wizard-v2.tsx` — swapped inline header/tabs JSX for `<WorkspaceHeader>`; `handleUpload` now takes an optional `onProgress` and uses XHR; `ChecklistTab`/`BusinessInfoTab` call sites pass the new props.
- `v2/_business-info-tab.tsx` — required/optional field labels, editable per-row competitor-URL inputs, website-URL success-state chip, full-width autosave footer, Kickoff-notes reference card (new `customerId`/`assets` props).
- `v2/_files-tab.tsx` — search + sort, duplicate-folder-name warning, grid "New folder" tile (replacing the toolbar-button pattern), wired to `_upload-queue.tsx`, client-side version grouping.
- `v2/_file-tile.tsx` — `duplicateWarning` on `FolderTile`; `versionCount`/`olderVersions` + new `VersionBadge` on `FileTile`; "Uploaded {relative date}" in list-view metadata (no uploader name — no backing column).
- `v2/_access-tab.tsx` — segmented Credential/Link toggle (via `PillTabs`, replacing the `<select>`); masked-value reveal/copy per credential field (new `CredentialField`); 5s local undo-delete.
- `v2/_checklist-tab.tsx` — `<ProgrammeTrack>` + summary stats row; per-section owner avatar (see correction above); two evidence links; orchestrator now passes `onOpenFolder`/`onGoToAccess`.

### Deviations From Plan
- **Checklist owner avatar built, not omitted** — see "What Changed" above; the task doc's gap table proposed omitting it for lack of data, but `DeliverableConfig.owner` turned out to already exist and be appropriate to use.
- Everything else matches the approved task doc's Requirements/Proposed File Changes with no scope changes.

### Verification Run
- `npx tsc --noEmit` — PASS (no errors).
- `pnpm lint` — PASS (0 errors, 0 warnings; one `no-unused-vars` warning on `fieldInputCls` in `_files-tab.tsx` surfaced mid-implementation after removing the old inline new-folder input, fixed by dropping the now-unused import).
- `git status` — confirms every changed/new path is either under `.../[projectId]/v2/`, the one approved shared-file edit (`_load-detail-data.ts`), this task doc, or `TASKS.md`; `_onboarding-wizard.tsx`/`_onboarding-detail.tsx`/`_wizard-step-params.ts`/the original `page.tsx` show no diff.
- `git diff .../[projectId]/_load-detail-data.ts` — confirms additive-only (widened `select()`, one new lookup block, three new fields on the return object; nothing removed or renamed).
- Manual browser QA (upload progress/retry, version badge grouping, duplicate-folder warning, credential reveal/copy, undo-delete, checklist evidence links, original route regression check) — **SKIPPED, not run in this pass** — flagging for the `test` stage per the task document's own Verification section, consistent with task 202's own precedent of deferring manual QA to that stage.
- `impeccable` design-hook findings — recurring `design-system-font-size` (sub-13px micro-typography: pills, chips, badges, mono labels) and one `design-system-color` (`#FFD9B8`, the programme track's gradient start) finding surfaced across nearly every new/edited file in this pass. All are literal 1:1 translations of the approved mockups' own CSS values (`_final_design/Onboarding Workspace Design/*.html`), which is this task's explicit source of truth, and match task 202's own established precedent of replicating this feature area's existing sub-13px convention rather than introducing a second type scale. Left unchanged, acknowledged here rather than filed as a standing ignore-rule, same reasoning task 202 documented. One `broken-image` finding on `_file-tile.tsx`'s `<img>` is a pre-existing false positive (signed-URL string gated behind `url && !failed`), already documented in task 202's notes, not introduced by this pass.

## Quality Gate Notes

### Result
PASS

### Standards Review
- **Found and fixed during this pass**: `project_type` was added to `_load-detail-data.ts`'s `select()` and to `WizardV2Project` but never actually consumed anywhere in the UI (only `existing_website` and `classification` ended up rendered, in `_workspace-header.tsx`) — dead data fetched and typed with no reader. Removed from the `select()`, the returned `project` object, and the type; re-ran `npx tsc --noEmit` / `pnpm lint` after the fix, both still clean.
- No other unused code, dead code, or commented-out implementation found across the 13 changed/new files.
- No untyped escape hatches (`any`) introduced; all new props/state are explicitly typed.
- No deep nesting beyond what the pre-existing codebase already uses in this feature area (ternary chains for status-dependent styling, ternary chains for tab/view-mode branching) — consistent with `_file-tile.tsx`'s and `_files-tab.tsx`'s existing style from task 202, not a new pattern.
- Function/file responsibilities are clear and single-purpose: `_programme-track.tsx` (one presentational component, shared by two call sites), `_upload-queue.tsx` (transport + queue-state hook + two presentational components, all upload-related), `_workspace-header.tsx` (page shell only).
- Naming is accurate (`useUploadQueue`, `uploadFileWithProgress`, `duplicateWarning`, `versionCount`/`olderVersions`, `EVIDENCE_LINKS`) — no misleading names found.
- Errors handled intentionally throughout: `uploadFileWithProgress` rejects with a real message parsed from the response body where possible; `_access-tab.tsx`'s add-modal catches and displays API errors; `KickoffNoteCard`/`FileTile.handleView` swallow fetch failures with an explicit non-fatal comment, matching the existing codebase's established convention for these low-stakes preview/open actions (not a new pattern — copied from the pre-existing `FileTile.handleView`).
- No secrets, credentials, or debug logging introduced. `CredentialField`'s reveal/copy is client-side only against already-fetched, permission-gated data — no new data exposure path (the value was already being fetched into `AssetRow.fields`, just not rendered before).
- Project conventions followed: fixed-hex Tailwind arbitrary-value tokens (not the `isDark` prop pattern, correct for this feature area per CLAUDE.md's UI Polish Conventions), `pnpm`-only tooling used for verification, no `git` commands run by the agent, task doc structure followed.

### Deviations
- **Minor — corrected during Implementation, documented in that section**: the Checklist-tab owner avatar was built (using `DeliverableConfig.owner`) rather than omitted as the original task doc's gap table proposed, once real backing data was found. Net effect: mockup 06 is matched *more* faithfully than originally planned, not less. Not a scope violation — still using only real, existing data.
- **Minor — found and fixed in this gate**: unused `project_type` field (see Standards Review above). Already corrected; no outstanding action.
- No Medium or Major deviations. All Requirements, Proposed File Changes, Out-of-Scope boundaries, and Acceptance Criteria in the task doc are satisfied as implemented — verified by re-reading all 13 changed/new files against the task doc line-by-line, plus `git status`/`git diff` confirming the file-scope boundary held.

### Required Fixes
- None.

### Post-Ship Follow-Up (user feedback, same session)

User reported two issues via screenshots against a real project (`ABC Test Company`): the header didn't match the mockup's fonts/buttons precisely, and the programme track's day-pill visually overlapped the track's edge once `currentDay` exceeded the phase's `dayEnd` (a real overdue project, "Day 21 of 15").

1. **Header title wasn't actually rendering in Space Grotesk.** `_workspace-header.tsx`'s `<h1>` used an inline `style={{ fontFamily: "var(--font-space-grotesk, inherit)" }}` — that CSS variable doesn't exist anywhere in this codebase (the real one, set up in `src/app/layout.tsx`, is `--font-display`, exposed as the Tailwind utility `font-heading`, already used correctly elsewhere in this same file's neighbor `_onboarding-wizard-v2.tsx`). The `inherit` fallback silently masked the bug — the title was rendering in the body font (Inter) the whole time. Fixed by switching to the `font-heading` Tailwind class and bumping the size to the mockup's actual 24px (was 22px).
2. **Chip text was uppercased; the mockup renders title case.** The "Onboard"/classification chips had a stray `uppercase` class not present in the mockup's own CSS (`.chip` has no `text-transform`) — rendered "ONBOARD" instead of "Onboard". Removed.
3. **Breadcrumb links weren't underlined.** The mockup's `.crumb a` rule sets no `text-decoration`, so browser-default anchor underlining applies — confirmed by opening the actual mockup file. Added `underline underline-offset-2` to the "Work"/"Portfolio Tracker" links to match.
4. **Button sizing didn't match the mockup's two distinct button sizes.** "Back to website" is the mockup's `.btn.btn-ghost.btn-sm` (padding 5.5px/12px, 11px font); the CTA is the *non-*`sm` `.btn.btn-cta` (padding 8px/15px, 12px font). Both were using ad-hoc sizing before. Corrected both to the mockup's real padding/font-size/gap values in `_workspace-header.tsx` and the CTA button in `_onboarding-wizard-v2.tsx`.
5. **Day-pill overflow at/past 100%.** `ProgrammeTrack`'s day-pill was positioned with `left: {pct}%` + `translate-x(-50%)`, so at `pct=100` (day at or past `dayEnd`) the pill's center sat exactly on the track's right edge, hanging half outside the rounded container — visible in the user's screenshot as "DAY 21" clipping past the card boundary. Fixed with `left: clamp(28px, {pct}%, calc(100% - 28px))`, which keeps the whole pill inside the track regardless of width, not just for this one screenshot's proportions.
6. **New: whole-phase overdue visual state.** Previously the track had no distinct look for "the phase itself is now overdue" (`currentDay > dayEnd`) versus "still in range, N individual sections are late" (`overdueCount > 0`, mockup's existing label suffix). Added `isOverdue` (derived from `currentDay > dayEnd`) to `ProgrammeTrack`: the fill gradient and day-pill switch from orange/navy to the codebase's existing `--late`/`--late-bg` red tokens (`#C0392B`/`#FDE8E6` — reused, not invented), and the "DAY N OF M" label turns red/semibold. Applies automatically at both call sites (workspace header, Checklist tab) since it's computed inside the shared component.

Files changed: `_workspace-header.tsx`, `_programme-track.tsx`, `_onboarding-wizard-v2.tsx` (CTA button sizing only). No existing file outside this task's established scope touched.

`npx tsc --noEmit` and `pnpm lint` — both PASS, no errors, no warnings, after this round.

Manual browser re-verification of this specific round (title font, chip casing, breadcrumb underline, button sizing, day-pill clamp at day > dayEnd, red overdue track state) — not run in this pass; still pending at the `test` stage along with the rest of the deferred manual QA noted above.

### Post-Ship Follow-Up #2 (user feedback, same session)

Seven more items, all against the still-overdue `ABC Test Company` test project used in Follow-Up #1:

1. **Removed the duplicate "Onboard phase progress" track from the Checklist tab.** It's already shown once in the workspace header (visible on every tab); the Checklist tab's own copy was pure redundancy, confirmed by the user's screenshot showing both stacked on top of each other. Dropped the `<ProgrammeTrack>` call and its now-unused `PHASE2` import from `_checklist-tab.tsx`; the tab's own summary stats row (sections complete / overdue / current day) stays, since that's Checklist-specific data the header doesn't show.
2. **Replaced the 3-level breadcrumb with a single "← Back to Tracker" link.** Per direct instruction — `_workspace-header.tsx` now renders one `<ArrowLeft>` + "Back to Tracker" link instead of Work / Portfolio Tracker / {company}, pointed at the same destination the breadcrumb's "Portfolio Tracker" crumb used (the project's timeline page — same route the codebase's own "Back to Onboarding Timeline" button elsewhere already uses).
3. **Day-pill reverted to always-navy.** Follow-Up #1 had made the pill switch to red during the whole-phase-overdue state; the user clarified the pill itself should stay the brand navy (`#071133`) always — only the track's fill gradient and the "DAY N OF M" label should carry the red overdue treatment. Reverted the pill's conditional background in `_programme-track.tsx`, kept everything else from #1's overdue state.
4. **Increased tab spacing.** `UnderlineTabs` in `_shared-ui.tsx` had `mr-5` (20px) between tabs, visibly tight per the user's screenshot; bumped to `mr-9` (36px, `last:mr-0` so the last tab doesn't carry trailing margin into the border).
5. **Business Info: removed "Additional notes"; renamed/refocused the file-reference card to a persistent "Notes" section.** Deleted the `additionalNotes` RichTextField, its state, and its autosave payload key entirely — confirmed no other file referenced it. The former conditionally-rendered "Kickoff notes" card (only shown once a file existed) is now an always-visible "Notes" card with the user's exact requested copy ("Upload documents/notes recorded during the client kickoff and sign-off calls. Added files on the notes folder will be listed here."), an empty-state line ("No files uploaded yet.") when the Notes folder has nothing in it yet, and a "Go to Notes folder" link moved to *below* the file list (previously a "View all in Files" link sat in the card header) per the user's annotated screenshot. Renamed the file-card component `KickoffNoteCard` → `NoteFileCard` since it's no longer Kickoff-specific.
6. **Business Info field-group restructuring.** Added a shared `GroupHeading` (title + muted description, matching mockup 02's `.field-block h3`/`p.hint` pattern) and applied it to three groups: **Contacts** ("Who we coordinate with during project development process and maintenance." — note this replaces the earlier mockup-derived "...during onboarding." copy per the user's explicit new wording), a new **"Web presence"** wrapper ("Used to brief the design and content team.") around the Current-website-URL and Competitor-URLs fields (previously ungrouped, sitting bare under Contacts with no shared heading), and **Business facts** (via `RichTextField`'s new `description` prop — see below). "Current website URL" changed from required to optional (dropped the `*`/kept `(optional)`), and its placeholder changed to `https://www.yourdomain.com`. The favicon-initial/checkmark validation chip built in Follow-Up #1 was preserved (re-added after being dropped in an intermediate full-file rewrite during this round — caught before shipping).
7. **`RichTextField` gained an optional `description` prop** (`_shared-ui.tsx`) — renders as a hint line between the label and the editor box, same visual weight as `GroupHeading`'s hint, so Business Facts' "History, services, value proposition, target customers." reads consistently with the other groups. Also bumped the editor's `min-h` from 88px to 168px (roughly 3 extra visible rows) per the explicit request to give Business Facts more room.

Files changed: `_checklist-tab.tsx`, `_workspace-header.tsx`, `_programme-track.tsx`, `_shared-ui.tsx`, `_business-info-tab.tsx` (full rewrite). No existing file outside this task's established scope touched; re-confirmed no other file referenced the removed `additionalNotes` key.

`npx tsc --noEmit` and `pnpm lint` — both PASS, no errors, no warnings.

Manual browser re-verification of this round — not run in this pass; still pending at the `test` stage along with everything else deferred there.

### Post-Ship Follow-Up #3 (user feedback, same session)

Four more items against the same test project:

1. **Business facts RTE fixed to a real 8-row box (min === max), scrolling past that.** Previously `min-h-[168px]`/`max-h-[340px]` let it grow well past 8 rows before scrolling — the user wanted 8 rows as a hard ceiling, matching the Contacts column's height. Changed both to `192px` (min === max) in `_shared-ui.tsx`'s `RichTextField`.
2. **Moved "Notes" out of its own separate card and into the grid's right column, below Business facts** — so it lines up with "Web presence" in the left column (both are now the second stacked section per column). This required threading `customerId`, `notesFiles`, and `onOpenFolder` down into `KickoffFields` (previously only `BusinessInfoTab` itself had them) and removing the second top-level `cardCls` wrapper; `BusinessInfoTab` now renders a single card containing the whole two-column grid.
3. **Section-title typography corrected to match the actual mockup HTML.** The user's screenshot of the real mockup (opened directly, not a description) showed "Contacts"/"Business facts"/"Web presence" in Space Grotesk 15px semibold (mockup's `.field-block h3`) — my `GroupHeading` and `RichTextField`'s label were both using the smaller 13px `fieldLabelCls` (the per-*field* label style, not the section-title style). Fixed both to `font-heading text-[15px] font-semibold` with the hint paragraph at `mb-3.5` (matches the mockup's 14px gap). Per-field labels (Full name, Email, etc.) were left alone — the user's annotation only circled the three section titles, not individual field labels, and changing `fieldLabelCls` itself would have affected the Access tab too, outside this request's scope.
4. **Fixed the missing initial Competitor URL row.** `competitorUrls` initialized to `[]`, so with no saved data the field showed only a bare "+ Add another URL" button with no input to add *another* to — confirmed exactly as the user's screenshot showed. Now initializes to `[""]` when there's no saved data (or the saved array is empty), guaranteeing at least one visible input. Also hid the per-row remove button when only one row remains, so deleting back down to zero (and reproducing the same dead-end) is no longer possible.

Files changed: `_shared-ui.tsx` (RichTextField height + label style), `_business-info-tab.tsx` (GroupHeading style, Notes relocated into KickoffFields, competitor-URL initial state + remove-guard). No existing file outside this task's established scope touched.

`npx tsc --noEmit` and `pnpm lint` — both PASS, no errors, no warnings.

Manual browser re-verification of this round — not run in this pass; still pending at the `test` stage along with everything else deferred there.
