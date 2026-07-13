# 133: Onboarding Wizard — HTML Mockup Step (Upload, In-App Preview, Code Editor)

**Created:** 2026-07-13
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** balanced

---

## Overview

The `html-mockup` sub-phase step ("Visual mockup of new site structure for
client approval.", Day 12–13, owner Bert) currently renders no data-entry
fields — it falls through to the generic `WizardDeliverableRow` plus its one
mapped internal-deliverable checklist item (`html-md-files`, "Mockup files
and markdown source content").

Per the user's direction, this step gets file upload + an in-app preview
(both already proven building blocks — `text/html` uploads and the
srcDoc-based HTML viewer were built for Outcome Target in task 130's
follow-ups) **plus a new capability**: editing the uploaded HTML directly in
an in-browser code editor, with the ability to save changes back to the same
file. This is the first place in the codebase that needs an editable code
view (vs. read-only preview), so it requires one new dependency and one new
API route.

## Requirements

- [ ] `html-mockup` step renders a `FileUploadBox` for the mockup file
      (reusing the existing two-call upload flow, `label: "HTML Mockup"`,
      `phase_number: 1`), listing any already-uploaded mockup file(s).
- [ ] Clicking a `text/html` file (via a new "Edit" action, in addition to
      the existing `Eye` "View" action) opens a full-screen modal with a
      **split view**: a code editor pane (left) showing the raw HTML source,
      and a live preview pane (right) rendering the editor's *current*
      in-memory content via `<iframe srcDoc={...} sandbox="">` — updating as
      the user types (debounced), not just on save.
- [ ] The code editor is syntax-highlighted for HTML (a plain `<textarea>` is
      not acceptable — the user explicitly asked for "a code editor").
- [ ] A "Save" button in the modal PATCHes the edited HTML back to the same
      underlying storage object (same `file_path`, no new asset row
      created) and updates the visible `file_size`. A save-status
      indicator (idle/saving/saved/error) shows in the modal header,
      matching this file's existing `SaveStatus`/`SaveIndicator`
      conventions.
- [ ] Non-`text/html` files uploaded to this step (if any) use the existing
      read-only `Eye` viewer only — no "Edit" action for them.
- [ ] Continuing past this step is blocked unless at least one file is
      attached (`isHtmlMockupFilled = htmlMockupFiles.length > 0`) —
      unlike Outcome Target/Migration Checklist/Content Map, there is no
      rich-text alternative here; a mockup is inherently a file.
- [ ] The file list loads previously-uploaded mockup file(s) on mount (same
      per-session-only limitation already present for Business
      Facts/Outcome Target — see Out of Scope).

## Out of Scope / Must-Not-Change

- **No hydration of previously-uploaded files across page reloads within a
  single session beyond what's already true elsewhere in this file** — like
  `businessFactsFiles`/`outcomeFiles`, `htmlMockupFiles` is populated from
  upload responses during the current session, not backfilled from
  `customer_assets` on mount. This is a pre-existing, documented gap in this
  file's shipped pattern (task 130's "Known limitation carried over"); fixing
  it for all steps at once is a separate, larger task, not this one.
- No multi-version history for mockup edits — "Save" overwrites the same
  storage object in place; there is no undo/revision list.
- No collaborative/real-time editing (single editor, single user at a time).
- No changes to `kickoff`, `outcome-target`, `migration-checklist`,
  `content-map`, `storage-kb`, `client-signoff`.
- No DB schema/migration changes — `customer_assets` already has the columns
  needed (`file_path`, `file_size`, `file_mime_type`); editing content in
  place doesn't need a new column.
- Do not build a general-purpose file editor for every mime type — scope the
  "Edit" action to `text/html` only, per the literal ask.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | Add a code-editor dependency (see Implementation Steps for the recommendation) via `pnpm add`. |
| `src/app/api/customers/[customerId]/assets/[assetId]/content/route.ts` | Create | New `PATCH` route: overwrites the asset's underlying storage object with edited text content and updates `file_size`. |
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | Add `html-mockup` state, upload/remove/view handlers, a new `HtmlEditorModal` component (split editor/preview), and the `step.key === "html-mockup"` render block. |

## Code Context

### New dependency recommendation

No code editor package is currently installed (`grep` for `monaco`/
`codemirror` in `package.json` returns nothing). Recommend
**`@uiw/react-codemirror`** + **`@codemirror/lang-html`** — CodeMirror 6 is
far lighter than Monaco (no web worker/AMD loader setup needed), has clean
React 19 support, and this is only for previewing/editing a single HTML
file, not building a full IDE. Install with:

```bash
pnpm add @uiw/react-codemirror @codemirror/lang-html
```

Per this codebase's convention for browser-only libraries (see `recharts` —
"Always import via `next/dynamic` with `ssr: false`"), the editor component
must be dynamically imported the same way:

```tsx
import dynamic from "next/dynamic";
const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });
```

### New route: `PATCH .../assets/[assetId]/content`

Model on the existing upload route's storage-write pattern
(`src/app/api/customers/[customerId]/assets/upload/route.ts:60-75`), but
overwrite the *same* `file_path` instead of generating a new timestamped
one:

```ts
// Pseudocode structure — mirror upload/route.ts's auth/role check, then:
const { data: existing } = await supabase
  .from("customer_assets")
  .select("file_path, file_mime_type")
  .eq("id", assetId).eq("customer_id", customerId).maybeSingle();
if (!existing || existing.file_mime_type !== "text/html") return 400;

const buffer = Buffer.from(body.html, "utf-8");
await adminClient.storage.from("customer-assets")
  .upload(existing.file_path, buffer, { contentType: "text/html", upsert: true }); // upsert:true overwrites in place

await supabase.from("customer_assets")
  .update({ file_size: buffer.byteLength })
  .eq("id", assetId).eq("customer_id", customerId);
```

Reuse the same auth/role guard as `upload/route.ts:35-39` (admin/
super_admin/pm/marketing) — editing content is at least as sensitive as
uploading it.

### Existing HTML preview to reuse for the live pane (`_onboarding-wizard.tsx:1319-1363`)

```tsx
function HtmlFilePreview({ url, fileName }: { url: string; fileName: string }) {
  // fetches url, then renders via <iframe srcDoc={html} sandbox="">
}
```

The new split-view modal's preview pane does **not** need to fetch a signed
URL at all — it already has the editor's current string in memory, so it can
render `<iframe srcDoc={editorValue} sandbox="">` directly (same `sandbox=""`
defense-in-depth as the read-only viewer, disabling scripts/forms/popups in
the previewed content).

### `FileUploadBox`, `FileViewerModal`, `FilePreview` — reuse as-is

Already generic (`_onboarding-wizard.tsx:1189-1315`, `1438-1480`). The
existing `Eye`/`onView` action continues to open the read-only
`FileViewerModal` for viewing; add a second, `text/html`-only "Edit" action
next to it (a new icon button, e.g. a pencil icon from `lucide-react`,
already imported in this file's icon set — add `Pencil` to the existing
import list at `_onboarding-wizard.tsx:4-7`).

## Implementation Steps

1. `pnpm add @uiw/react-codemirror @codemirror/lang-html`.
2. Create `src/app/api/customers/[customerId]/assets/[assetId]/content/route.ts` with the `PATCH` handler above.
3. In `_onboarding-wizard.tsx`: derive `htmlMockupData`/add `htmlMockupFiles`/`uploadingHtmlMockupFile`/`htmlMockupUploadError` state (mirroring `businessFactsFiles`'s shape — no rich text needed here, so no autosave-text effect, no `SaveIndicator` in the step heading).
4. Add `handleHtmlMockupUpload`/`handleRemoveHtmlMockupFile` (mirror `handleBusinessFactsUpload`/`handleRemoveBusinessFactsFile`, `label: "HTML Mockup"`).
5. Add `isHtmlMockupFilled = htmlMockupFiles.length > 0` and extend `handleContinueClick` with the same early-return gate pattern as Outcome Target's, but file-only (no text alternative).
6. Build `HtmlEditorModal` (new file-scoped component, dynamic-imported `CodeMirror` internally): props `file: AssetRow`, `initialHtml: string`, `isDark`, `onClose`, `onSaved: (newSize: number) => void`. Internal state: `value` (seeded from `initialHtml`), `saveStatus: SaveStatus`, `saveError`. "Save" button calls `PATCH .../assets/[assetId]/content` with `{ html: value }`.
7. Wire a new "Edit" button on `text/html` files in the `html-mockup` step's file list (this step renders its own file rows rather than reusing bare `FileUploadBox`, so it can add the extra action) — on click, `fetch` the file's raw text via the existing `file-url` signed-URL endpoint + a plain `fetch(url)`, then open `HtmlEditorModal` with that text.
8. Add the `step.key === "html-mockup"` render block.
9. `npx tsc --noEmit` and `pnpm lint`.
10. Manually verify per Acceptance Criteria.

## Acceptance Criteria

- [ ] The "HTML mockup" step (Step 5 of 7) shows an upload box; uploading a `.html` file lists it with View/Edit/Remove actions.
- [ ] Clicking "Edit" opens a modal with a syntax-highlighted HTML editor on one side and a live-updating rendered preview on the other.
- [ ] Typing in the editor updates the preview pane without needing to save.
- [ ] Clicking "Save" persists the edited HTML to the same storage path (re-opening the viewer/editor afterward shows the edited content, not the original upload).
- [ ] The save-status indicator shows saving → saved/error correctly.
- [ ] Uploading a non-HTML file to this step shows only a View action, no Edit action.
- [ ] Clicking "Continue" with no file attached is blocked with an inline error; attaching one advances.
- [ ] The existing `html-md-files` checklist item is unaffected.
- [ ] All other steps are unchanged.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.
- [ ] `package.json` shows exactly the two new dependencies added, nothing else changed.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manual, localhost:3000:
#   - Navigate to "HTML mockup" (Step 5)
#   - Upload a .html file -> confirm it lists with View/Edit/Remove
#   - Click Edit -> confirm split editor/preview modal opens with correct content
#   - Type a change -> confirm preview pane updates live
#   - Click Save -> confirm save-status indicator, then re-open Edit/View -> confirm the change persisted
#   - Remove file, click Continue -> confirm blocked; re-upload -> confirm it advances
```

## Compatibility Touchpoints

- New pnpm dependencies (`@uiw/react-codemirror`, `@codemirror/lang-html`) — bundle size impact should be checked (`pnpm build`) since this is the first code-editor package in the project; not expected to affect other routes since it's dynamically imported (`ssr: false`), same isolation pattern as `recharts`.
- New API route (`PATCH .../assets/[assetId]/content`) — additive only, no existing route contract changes.

## Implementation Notes

### What Changed
- Added an `html-mockup` sub-phase step to the onboarding wizard: a file-only upload (`label: "HTML Mockup"`, no rich-text alternative — `isHtmlMockupFilled = htmlMockupFiles.length > 0` gates `handleContinueClick`) rendered via a new `HtmlMockupFileList` component (its own file rows rather than bare `FileUploadBox`, so it can add a `text/html`-only "Edit" action next to the existing View/Remove ones).
- Added a new `HtmlEditorModal` split-view component: a CodeMirror 6 HTML editor pane (dynamic-imported, `ssr: false`, same isolation pattern as `recharts`) on one side, and a live preview pane on the other rendering `<iframe srcDoc={...} sandbox="">` from a 300ms-debounced copy of the editor's in-memory value (so large paste/typing bursts don't force a full iframe re-render on every keystroke). A "Save" button PATCHes the new content route and updates the visible `file_size` in `htmlMockupFiles` via `onSaved`.
- Added `PATCH /api/customers/[customerId]/assets/[assetId]/content` — overwrites the same Supabase Storage object in place (`upsert: true` on the existing `file_path`, not a new timestamped path) and updates `file_size` on the `customer_assets` row. Guarded by the same admin/super_admin/pm/marketing role check as the upload route, and rejects any asset whose `file_mime_type` isn't `text/html`.
- Installed `@uiw/react-codemirror` + `@codemirror/lang-html` (23 packages total incl. transitive deps) — no `package.json` changes beyond these two direct dependencies.

### Files Changed
- `package.json` / `pnpm-lock.yaml` — added `@uiw/react-codemirror@4.25.11`, `@codemirror/lang-html@6.4.11`.
- `src/app/api/customers/[customerId]/assets/[assetId]/content/route.ts` — new file, `PATCH` handler as described above.
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` — added the `Pencil` icon import, `next/dynamic` + dynamic `CodeMirror` import, `@codemirror/lang-html`'s `html` import (aliased `htmlLang`); `htmlMockupFiles`/`uploadingHtmlMockupFile`/`htmlMockupUploadError`/`viewingHtmlMockupFileId`/`htmlMockupFieldError`/`editingHtmlAsset`/`editingHtmlContent`/`editingHtmlLoadError` state; `isHtmlMockupFilled` derived check; `handleHtmlMockupUpload`/`handleRemoveHtmlMockupFile`/`handleViewHtmlMockupFile`/`handleOpenHtmlEditor`/`closeHtmlEditor`/`handleHtmlEditorSaved` handlers; the `handleContinueClick` gate extension; the `step.key === "html-mockup"` render block; the `HtmlEditorModal` render wired alongside the existing `FileViewerModal` one; and the two new file-scoped components `HtmlMockupFileList` and `HtmlEditorModal`. No autosave `useEffect` was added for this step (file-only, no persisted text field, matching the task doc's explicit "no rich text needed here" instruction) and no `SaveIndicator` was added to the step heading (the modal has its own).

### Deviations From Plan
- None — implementation matched the task document's Code Context and Implementation Steps. One judgment call not fully spelled out in the plan: the live preview pane updates from a 300ms-debounced copy of the editor value rather than the raw value on every keystroke, to satisfy the requirement's own wording ("updating as the user types (debounced)").

### Verification Run
- `npx tsc --noEmit` — PASS (no errors).
- `pnpm lint` — PASS (no warnings/errors).
- `pnpm build` — PASS (production build completed with no errors; confirms CodeMirror's dynamic `ssr:false` import compiles cleanly and doesn't break the build).
- Manual browser verification — **SKIPPED**, same reason and same standing user decision as tasks 131/132: live verification requires a logged-in Hub session, and entering the user's password to authenticate is a prohibited action regardless of authorization. Verified instead by code review: the upload/remove/view handlers are byte-for-byte the same proven two-call flow used by every other step's file uploads; the new content-PATCH route mirrors the existing upload route's auth/role guard and storage-write pattern exactly, differing only in overwriting the same `file_path` (`upsert: true`) instead of generating a new one.
- Not exercised live (would require the skipped browser session): the CodeMirror editor's actual rendering/typing behavior, the debounced preview pane, and a real Save round-trip against Supabase Storage. Flagged for the `test` stage / a follow-up manual pass once a session is available.

### Follow-up Changes (post-review, same task) — Washed-out syntax colors + missing live preview

User tested live and reported two bugs from a screenshot: most syntax text in the editor (tag names, embedded CSS tokens, plain text) rendered as near-invisible pale gray on white, and the preview pane wasn't visible at all — the code editor appeared to occupy nearly the full modal width with only a blank sliver where the preview should be.

- **Contrast fix**: swapped the bare `theme={isDark ? "dark" : "light"}` string themes for explicit, well-tested theme objects from a new `@uiw/codemirror-theme-github` dependency (`githubLight`/`githubDark`) — designed specifically to plug into `@uiw/react-codemirror`'s `theme` prop, with much higher-contrast token colors than the library's minimal built-in string themes.
- **Layout fix**: the split was built with CSS Grid (`grid grid-cols-1 lg:grid-cols-2`), whose default `1fr` columns resolve to `minmax(auto, 1fr)` — a column can grow past its even share to fit its content's min-content width. A long unwrapped CSS/HTML line inside CodeMirror's internal content box can report a large min-content width, pushing the editor column wide and squeezing the preview column down to a sliver — consistent with the reported screenshot. Replaced the grid split with `flex flex-col lg:flex-row` + `flex-1 min-w-0 min-h-0` on both panes (the same `flex-1`/`min-h-0` idiom already used one level up for the outer scroll area in this same modal), which guarantees an even, content-independent 50/50 split regardless of line length. Also added `className="block"` to the preview `<iframe>` (iframes are inline by default) as a small additional defensive fix.
- Scoped entirely to `HtmlEditorModal` — no other component touched.

**Verification:**
- `npx tsc --noEmit` — PASS. `pnpm lint` — PASS.
- Not re-verified live (same login/password restriction as the rest of this task) — the fixes were derived from a concrete code-level diagnosis of the exact bug shown in the user's screenshot (CSS Grid's `minmax(auto,1fr)` default sizing behavior, and the `@uiw/react-codemirror` bare string themes' known low-contrast defaults), not guessed. The user should re-test live and report back if either issue persists.

### Follow-up Changes (post-review, same task) — Live preview still blank on repeated opens

The layout fix (flex split) worked — the user's own DevTools showed a correctly even 511×658 split. But the live preview remained blank. The user tested live (with DevTools guidance from me, since I can't log in myself) and narrowed it down precisely:
- Both network fetches in `handleOpenHtmlEditor` (the signed file-url request, then the actual content fetch) return 200 with correct content every time — ruled out a data-loading bug.
- The Elements panel's `<iframe>` `srcdoc` *attribute* always shows the correct HTML string.
- But the iframe's actual nested `#document` (its live rendered content, expandable in DevTools) was empty/different from what the attribute showed.
- Reproducible pattern: works exactly once per hard page reload (the very first "Edit" open), then fails on every subsequent open of the same or any file for the rest of the session — regardless of whether DevTools is open or closed.

This is consistent with the browser failing to properly reinitialize a *sandboxed* `srcdoc` iframe's content when an existing iframe element is updated in place (a real, if obscure, class of browser iframe/sandbox quirk) — not a data bug in my fetch/state logic, which the user's diagnosis already ruled out.

- **Fix**: added a `previewRevision` counter, incremented every time `previewValue` is set (both in the seeding effect and the debounce effect), and passed it as the `<iframe key={previewRevision}>`. This forces React to fully unmount and recreate the iframe DOM node — a brand-new sandboxed browsing context — on every content update, instead of relying on the browser to notice and re-render an updated `srcdoc` attribute on an existing element.
- Scoped entirely to `HtmlEditorModal` — no other component touched.

**Verification:**
- `npx tsc --noEmit` — PASS. `pnpm lint` — PASS.
- User confirmed live: the preview now works correctly on repeat opens.

### Follow-up Changes (post-review, same task) — Viewport size toggle (Desktop/Tablet/Mobile)

User asked for a way to preview the mockup at different screen widths, not just full-width.

- Added a `PREVIEW_SIZES` config (module-level, next to `phase1`): three presets — Desktop (`w-full`), Tablet (`w-[768px]`), Mobile (`w-[390px]`) — with a `Monitor`/`Tablet`/`Smartphone` icon each (added to the existing `lucide-react` import list).
- Added `previewSize` state to `HtmlEditorModal`, defaulting to `"full"` (unchanged default behavior).
- Added a small icon-button toolbar above the preview pane (same active/inactive pill styling already used for `RichTextField`'s Bold/Italic/Underline toolbar) to switch between the three presets.
- The preview pane itself now scrolls (`overflow-auto`) and horizontally centers the iframe, whose width is constrained by the selected preset's Tailwind class while height stays `h-full`; a neutral gray/black-tinted backdrop (`bg-slate-100`/`bg-black/20`) around the white iframe makes the device-frame effect visually clear when a narrower preset is selected.
- The existing `key={previewRevision}` forced-remount fix from the prior follow-up is untouched — changing `previewSize` only changes CSS width, not `previewRevision`, so it doesn't force an unnecessary iframe reload.

**Verification:**
- `npx tsc --noEmit` — PASS. `pnpm lint` — PASS.
- Not yet exercised live (same login/password restriction) — awaiting the user's test.

### Follow-up Changes (post-review, same task) — Extended Edit + nice preview to Markdown files

User asked to add the same Edit + preview experience to `.md` files, not just `.html` — the task's own `html-md-files` checklist item already groups "Mockup files and markdown source content" together, so this closes a gap the original scope left (Markdown files could only be uploaded and viewed as raw text, no Edit action).

- Added two new dependencies: `marked` (small, synchronous Markdown→HTML converter, no heavy deps) and `@codemirror/lang-markdown` (CodeMirror syntax highlighting for Markdown, mirroring the existing `@codemirror/lang-html` usage).
- Added a shared `markdownToHtmlDocument(md)` helper — wraps `marked.parse()`'s output in a small self-contained styled HTML document (headings, code blocks, blockquotes, tables) so Markdown renders as an actual formatted page, not unstyled/raw text.
- **Read-only viewer**: split `text/markdown` out of `FilePreview`'s combined `text/plain`/`text/markdown` branch (which just showed raw source text) into its own branch using a new `MarkdownFilePreview` component — fetches the raw text client-side (same pattern as `HtmlFilePreview`/`CsvFilePreview`) and renders it via `markdownToHtmlDocument` in a sandboxed `srcDoc` iframe. `text/plain` is unchanged (still literal text, which is correct for that type).
- **Edit modal**: `HtmlEditorModal` is now mime-aware via a new `isMarkdown` check — CodeMirror uses `markdownLang()` instead of `htmlLang()` for the editor's syntax highlighting, and the live preview pane renders `markdownToHtmlDocument(previewValue)` instead of the raw value.
- **Edit button**: `HtmlMockupFileList`'s Edit action condition extended from `file_mime_type === "text/html"` to also include `"text/markdown"`.
- **Server route**: `PATCH .../assets/[assetId]/content` — extended its mime-type gate to accept `text/markdown` alongside `text/html`, and now writes back using the asset's own `existing.file_mime_type` as the storage `contentType` (previously hardcoded to `"text/html"`, which would have been wrong for markdown saves).
- No changes needed to the upload route — `text/markdown` was already in its allowed-types list from an earlier task.

**Verification:**
- `npx tsc --noEmit` — PASS. `pnpm lint` — PASS. `pnpm build` — PASS (confirms the two new dependencies compile cleanly in production).
- Not yet exercised live (same login/password restriction) — awaiting the user's test.

### Follow-up Changes (post-review, same task) — Larger modal + fixed-width Desktop preset + tablet visibility

User feedback with screenshots: (1) make the modal bigger overall, (2) the "Desktop" preset was rendering the page's *mobile/collapsed-nav* layout instead of a real wide desktop layout, (3) the "Tablet" preset wasn't fully visible (clipped on both edges).

**Root cause of (2)**: Desktop's preset was `w-full` — 100% of the preview *pane's* width, not a real desktop viewport width. The pane is roughly half the modal, which was well under the mockup page's own `@media (max-width: 900px)` breakpoint (visible earlier in `customer-phases.ts`'s reference HTML — collapses `nav-links` and switches to a single-column grid). So "Desktop" was accidentally rendering the page's own mobile layout, matching the user's screenshot exactly.

- Changed Desktop's preset from `w-full` to a fixed `w-[1280px]` (matches Tailwind's `xl` breakpoint, a realistic laptop viewport width) — now consistent with Tablet/Mobile already being fixed pixel widths, and reliably clears the page's 900px breakpoint so its real wide layout renders.
- Enlarged the whole modal from `max-w-6xl h-[85vh]` to `w-[96vw] h-[94vh]` (near-fullscreen) — directly addresses "make it larger" and also gives the preview pane much more room, so Tablet's 768px width fits without clipping on typical screens (previously the modal's fixed `max-w-6xl` ≈ 1152px total, split across editor+preview, left very little room for the pane).
- Mobile's preset (390px) was already reported as looking good and is unchanged.

**Verification:**
- `npx tsc --noEmit` — PASS. `pnpm lint` — PASS.
- Not yet exercised live (same login/password restriction) — awaiting the user's test, including confirming Tablet is now fully visible without clipping on their screen size.

### Bug Fix — False-positive "Upload at least one mockup file" block on Continue

**User-reported** (with screenshot): the step's own checklist item ("HTML and MD files") and the step's deliverable row were both already marked Done, yet clicking Continue still showed "Upload at least one mockup file before continuing." and blocked navigation.

**Root cause**: `handleContinueClick` had its own hard gate — `if (step.key === "html-mockup" && !isHtmlMockupFilled) { ...; return; }` — duplicating the validation that the step's checklist-based Continue gate (`stepInternal.length > 0` branch, which already exists generically for any step with internal deliverables) was supposed to handle. `isHtmlMockupFilled = htmlMockupFiles.length > 0` reads a **per-session-only local array** (documented as a known limitation since task 130 — files aren't hydrated from `customer_assets` on mount). So once the checklist item had been marked done in an *earlier* session, reloading the page in a *new* session left `htmlMockupFiles` empty, and the redundant gate fired a false positive even though the checklist — the actual source of truth for step completion — already showed Done.

**Fix, per the user's direction** ("Continue button will validate based on the checklist... the validation... should be triggered when checking on the Checklist and not on Continue"):
- Removed the redundant `html-mockup` gate from `handleContinueClick` entirely — Continue for this step now relies solely on the existing generic checklist-incompleteness gate, same as every other checklist-bearing step.
- Generalized the existing Kickoff-only `handleKickoffInternalToggle` into `handleValidatedInternalToggle`, used for **every** step's checklist-item clicks (previously only Kickoff's clicks were routed through it; all other steps called `setInternalStatus` directly with no validation). Added a new branch: clicking `html-md-files` to mark it done is now blocked (with `checklistValidationError` = "Upload at least one mockup file before marking this done.") unless `isHtmlMockupFilled` is true — moving the validation to the exact point the user asked for.
- Extended `handleMarkAllDone`'s `hasFailing` check (the "Mark all as done" bulk action from the incomplete-checklist modal) to also cover `html-md-files`, so that bulk path can't bypass the same validation either — it now shows the existing (already-generic-worded) "Missing required fields" confirm-or-review modal instead.
- Generalized the checklist error message's render condition from `step.key === "kickoff" && checklistValidationError` to just `checklistValidationError`, since it's no longer Kickoff-specific.
- Removed the now-dead `htmlMockupFieldError` state and its associated error paragraph from the render block.

**Known latent risk, not fixed here (flagged for awareness)**: Outcome Target, Migration Checklist, and Content Map each still have their own `handleContinueClick` field gates (`isOutcomeFilled`/`isMigrationChecklistFilled`/`isContentMapFilled`), which are OR checks — text-or-file. Since their *text* half is properly hydrated from `wizard_data` on mount (unlike files), these are only vulnerable to the same false-positive bug in the edge case where a user completed the step with a file only, no text, in an earlier session. This is a narrower window than html-mockup's (which is *always* file-only, so *always* vulnerable), so it was left as-is rather than proactively changed — happy to apply the same fix to those three if it turns out to matter in practice.

**Verification:**
- `npx tsc --noEmit` — PASS. `pnpm lint` — PASS.
- Not yet exercised live (same login/password restriction) — awaiting the user's test: mark the checklist item done without a file (should now block with the error at the checklist, not at Continue), then upload a file first and confirm the checklist item can be marked done and Continue proceeds normally.

### Follow-up Changes (post-review, same task) — Scale-to-fit preview (no horizontal scrollbar)

User feedback: the Desktop preview (already rendering correctly at 1280px per the prior fix) should look "zoomed out" to fit the pane, rather than needing horizontal scroll to see the parts that don't fit.

- **Replaced the fixed-width + `overflow-auto` approach with a scale-to-fit transform.** Added a `previewPaneRef` + `ResizeObserver`-backed `paneSize` state to measure the actual preview pane's rendered dimensions. For the selected preset's virtual design width (1280/768/390), computes `previewScale = min(1, paneWidth / virtualWidth)`, gives the iframe an explicit `width: virtualWidth` / `height: paneHeight / previewScale` so the page lays out exactly as it would at that real device width, then visually shrinks it with `transform: scale(previewScale)` (`transformOrigin: top left`) so the scaled-down result exactly fills the pane both horizontally and vertically — by construction, no gaps, no clipping, no scrollbar needed.
- The iframe is absolutely positioned (`absolute top-0`, `left: previewLeftOffset`) inside a `position: relative` (implicit, from being the containing block) `overflow-hidden` wrapper — `previewLeftOffset` centers the scaled visual horizontally when it doesn't need to fill the full pane width (e.g. Mobile's 390px in a wide pane), and is naturally `0` whenever scaling is actively shrinking to fit (since the scaled width then exactly equals the pane width).
- The page's own internal vertical scrolling still works normally inside the iframe (scaling is purely visual — CodeMirror/browser layout and scroll behavior inside the iframe are unaffected), just rendered smaller.
- Removed the now-unused `widthClass` field from `PREVIEW_SIZES` (replaced with a numeric `width` used for the scale math) and the old `flex justify-center overflow-auto` wrapper.

**Verification:**
- `npx tsc --noEmit` — PASS. `pnpm lint` — PASS.
- Not yet exercised live (same login/password restriction) — awaiting the user's test.
