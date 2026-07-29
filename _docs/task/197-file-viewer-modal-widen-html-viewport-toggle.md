# 197: Onboarding Wizard File Viewer Modal — Widen + HTML Desktop/Tablet/Mobile Viewport Toggle

**Created:** 2026-07-29
**Completed:** 2026-07-29
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Completed

---

## Overview

The Onboarding Wizard's in-app file "View" modal (`FileViewerModal` in `_onboarding-wizard.tsx`) is capped at `max-w-4xl h-[85vh]`, which is noticeably small/narrow (see reference screenshot of `onboarding-user-manual.docx` in a cramped card). Meanwhile, the "Edit HTML" modal (`HtmlEditorModal`), used from the HTML Mockup sub-phase/deliverable, already renders near-fullscreen (`w-[96vw] h-[94vh]`) and has a Desktop/Tablet/Mobile viewport toggle for its live preview pane, using a scale-to-fit technique so the previewed page renders at a real desktop design width (1280px) instead of being squeezed into the pane and tripping the page's own mobile responsive breakpoints.

This task:
1. Widens `FileViewerModal` to match `HtmlEditorModal`'s near-fullscreen footprint, for all file types.
2. When the file being viewed is HTML (`file_mime_type === "text/html"`), adds the same Desktop/Tablet/Mobile viewport toggle above the preview, reusing the existing `PREVIEW_SIZES` config and the scale-to-fit math already proven in `HtmlEditorModal`.
3. Ensures the "Desktop" option renders the HTML document at its real desktop design width (1280px virtual viewport, scaled to fit the now much-wider pane) rather than whatever narrower width the modal happens to be — i.e. it must not trigger the page's own mobile/responsive CSS breakpoints. Because the modal is now near-fullscreen, once the pane is ≥1280px wide the scale factor is 1 and the page renders truly 1:1/full-screen; on narrower viewports it scales down but keeps the 1280px virtual layout (never re-flows to mobile).

Non-HTML file types (image, PDF, Office docs, CSV, Markdown, plain text) are unaffected beyond the modal getting bigger — no viewport toggle for them.

## Requirements

- [x] `FileViewerModal` container is resized from `w-full max-w-4xl h-[85vh]` to the same near-fullscreen footprint as `HtmlEditorModal` (`w-[96vw] h-[94vh]`), for every file type. *(Amended in Follow-up #2 to `w-[1360px] max-w-[96vw]` per user feedback so Desktop mode fills the pane without excess side padding.)*
- [x] When the viewed file's `file_mime_type === "text/html"`, render a Desktop/Tablet/Mobile toggle, defaulting to "Desktop" (`"full"` key). *(Amended in Follow-up #2: not a toolbar bar above the preview — moved into the modal header, absolutely centered, icon-only buttons with tooltips, matching the Projects list's Grid/List pill design.)*
- [x] The HTML preview in the viewer, when a viewport size is selected, renders via the same scale-to-fit approach as `HtmlEditorModal`'s preview pane: a `ResizeObserver`-measured pane, iframe rendered at the preset's virtual width (1280 / 768 / 390), `transform: scale(...)` to fit, centered via left-offset.
- [x] "Desktop" specifically renders the page at its real desktop layout (1280px virtual width) — confirmed visually that a responsive HTML mockup shows its desktop nav/grid, not a hamburger/stacked mobile layout, when "Desktop" is selected.
- [x] Non-HTML mime types keep their current preview behavior (`FilePreview`'s existing branches) — only the modal's outer size changes for them.
- [x] ~~No change to `HtmlEditorModal` itself~~ — **superseded.** The user explicitly requested changes to `HtmlEditorModal` in Follow-ups #3 and #4 (viewport-toggle header parity, CTA-styled Save button, `<>` code-editor toggle) after the original scope was implemented — see those sections for what changed and why.

## Out of Scope / Must-Not-Change

- Do not modify `HtmlEditorModal`'s own behavior/sizing — only reuse its pattern.
- Do not add the Desktop/Tablet/Mobile toggle to non-HTML file previews (image, PDF, Office, CSV, Markdown, plain text).
- Do not change how files are fetched/uploaded, or the `handleOpenAssetFile`/`closeFileViewer` state machine (`viewerFile`, `viewerUrl`, `viewerLoading`, `viewerError`) — this is a presentational change to `FileViewerModal` and (for the html branch only) `HtmlFilePreview`/`FilePreview`.
- Do not touch `HtmlMockupFileList`'s Edit action or the editor's save flow.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` | Modify | Widen `FileViewerModal`; add viewport toggle + scale-to-fit rendering for HTML files, threaded through `FilePreview` → `HtmlFilePreview` |

## Code Context

### `PREVIEW_SIZES` config (already exists, reuse as-is) — around line 143

```tsx
const PREVIEW_SIZES = [
  { key: "full", label: "Desktop", icon: Monitor, width: 1280 },
  { key: "tablet", label: "Tablet", icon: Tablet, width: 768 },
  { key: "mobile", label: "Mobile", icon: Smartphone, width: 390 },
] as const;
type PreviewSizeKey = (typeof PREVIEW_SIZES)[number]["key"];
```

### `FileViewerModal` — current implementation, around line 4675

```tsx
function FileViewerModal({
  file, url, loading, error, onClose,
}: {
  file: AssetRow; url: string | null; loading: boolean; error: string | null; onClose: () => void;
}) {
  ...
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071133]/60 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="file-viewer-title" className={cn(cardCls, "w-full max-w-4xl h-[85vh] shadow-xl overflow-hidden flex flex-col")} onClick={(e) => e.stopPropagation()}>
        {/* header with title + close */}
        <div className="flex-1 min-h-0 min-w-0 relative bg-[#EDF0F7]">
          {loading && ...}
          {error && !loading && ...}
          {url && !loading && !error && <FilePreview file={file} url={url} />}
        </div>
      </div>
    </div>
  );
}
```

Change the `w-full max-w-4xl h-[85vh]` class to `w-[96vw] h-[94vh]` (dropping `w-full max-w-4xl`), matching `HtmlEditorModal`'s dialog exactly. Insert the viewport toolbar (conditional on `file.file_mime_type === "text/html"`) between the header and the content pane, using the same markup/classes as `HtmlEditorModal`'s toolbar (lines ~5016–5035). Track selected size in a `previewSize` state local to `FileViewerModal`, defaulting to `"full"`.

### `HtmlEditorModal`'s scale-to-fit logic — reference implementation, around lines 4896–4916 and 5036–5053

```tsx
const previewPaneRef = useRef<HTMLDivElement>(null);
const [paneSize, setPaneSize] = useState({ width: 0, height: 0 });
useEffect(() => {
  const el = previewPaneRef.current;
  if (!el) return;
  const observer = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect;
    if (rect) setPaneSize({ width: rect.width, height: rect.height });
  });
  observer.observe(el);
  return () => observer.disconnect();
}, []);
const previewVirtualWidth = PREVIEW_SIZES.find((s) => s.key === previewSize)?.width ?? 1280;
const previewScale = paneSize.width > 0 ? Math.min(1, paneSize.width / previewVirtualWidth) : 1;
const previewVirtualHeight = paneSize.height > 0 && previewScale > 0 ? paneSize.height / previewScale : paneSize.height;
const previewVisualWidth = previewVirtualWidth * previewScale;
const previewLeftOffset = Math.max(0, (paneSize.width - previewVisualWidth) / 2);
```

...and the iframe render:

```tsx
<iframe
  key={previewRevision}
  srcDoc={previewDocument}
  sandbox=""
  title="Live preview"
  className="block border-0 bg-white absolute top-0"
  style={{
    left: previewLeftOffset,
    width: previewVirtualWidth,
    height: previewVirtualHeight,
    transform: `scale(${previewScale})`,
    transformOrigin: "top left",
  }}
/>
```

### `FilePreview` / `HtmlFilePreview` — current implementation, around lines 4449 and 4512

`FilePreview`'s `text/html` branch currently just delegates to `HtmlFilePreview`, which fetches the raw HTML and renders a plain `w-full h-full` iframe (no scaling, no viewport concept):

```tsx
if (mime === "text/html") {
  return <HtmlFilePreview url={url} fileName={fileName} />;
}
...
function HtmlFilePreview({ url, fileName }: { url: string; fileName: string }) {
  const [html, setHtml] = useState<string | null>(null);
  ...
  return <iframe srcDoc={html} title={fileName} sandbox="" className="w-full h-full border-0 bg-white" />;
}
```

This needs a `previewSize: PreviewSizeKey` prop threaded through from `FileViewerModal` → `FilePreview` → `HtmlFilePreview`, and `HtmlFilePreview` needs its own `ResizeObserver`-measured wrapper + scale-to-fit math (same formulas as above) around its iframe, since `FileViewerModal`'s content pane (not `HtmlFilePreview`) is the resizable container being measured.

**Design decision for the implementer:** the scale-to-fit math (`ResizeObserver` + `paneSize` state + the four derived `preview*` values) is identical in `HtmlEditorModal` and this new `HtmlFilePreview` path. Consider extracting a small shared hook (e.g. `useScaleToFitPane(virtualWidth: number)` returning `{ paneRef, virtualHeight, scale, leftOffset }`) to avoid duplicating ~15 lines of non-trivial measurement logic verbatim. Not mandatory if the implementer judges the duplication acceptable, but it removes a real "two places that must stay in sync" risk (both consumers use the same `PREVIEW_SIZES` widths).

### `AssetRow` type / mime check pattern

`file.file_mime_type === "text/html"` is the existing detection pattern used elsewhere in this file (e.g. `FilePreview`'s branch, `HtmlMockupFileList`'s edit-icon condition at line 4838) — reuse it verbatim for gating the toggle bar's visibility.

## Implementation Steps

1. In `FileViewerModal`, change the dialog's className from `"w-full max-w-4xl h-[85vh] shadow-xl overflow-hidden flex flex-col"` to `"w-[96vw] h-[94vh] shadow-xl overflow-hidden flex flex-col"`.
2. Add `const [previewSize, setPreviewSize] = useState<PreviewSizeKey>("full");` inside `FileViewerModal`.
3. Between the header `div` and the content pane `div`, conditionally render the viewport toolbar when `file.file_mime_type === "text/html"`, mirroring `HtmlEditorModal`'s toolbar markup (map over `PREVIEW_SIZES`, same active/inactive button classes).
4. Pass `previewSize` down: `<FilePreview file={file} url={url} previewSize={previewSize} />`.
5. Update `FilePreview`'s signature to accept an optional `previewSize?: PreviewSizeKey` and pass it to `HtmlFilePreview` only in the `text/html` branch.
6. Update `HtmlFilePreview` to accept `previewSize: PreviewSizeKey` and implement the scale-to-fit rendering (own `ResizeObserver` ref + derived values, or the extracted shared hook per the design decision above) instead of the current plain `w-full h-full` iframe. Keep the existing loading/error states unchanged.
7. Verify the toolbar does not render (and `HtmlFilePreview` still renders full-bleed) for any non-`text/html` mime type, and that other `FilePreview` branches (image/pdf/office/csv/markdown/plain) are untouched aside from the outer modal being bigger.
8. Manually test in the browser: open the Storage/KB or HTML Mockup step, upload/select an HTML file with a responsive layout, click "View" (not "Edit"), confirm Desktop shows the desktop layout, Tablet/Mobile show their respective responsive layouts, and the modal itself is visibly larger for a non-HTML file (e.g. the `.docx` from the reference screenshot).

## Acceptance Criteria

- [x] `FileViewerModal` renders visibly larger than before for every file type (final: `w-[1360px] max-w-[96vw] h-[94vh]`, amended from the original `w-[96vw]` per Follow-up #2).
- [x] Viewing a `text/html` file shows a Desktop/Tablet/Mobile toggle, styled consistently with `HtmlEditorModal`'s toggle (both now share the identical header-centered, icon-only, navy-active pill design after Follow-up #2).
- [x] Selecting Desktop renders the page's desktop layout (no mobile nav/stacking), Tablet/Mobile render their respective breakpoints — verified against both a real responsive HTML mockup and a purpose-built test fixture with an explicit `max-width: 700px` breakpoint.
- [x] Viewing any non-HTML file shows no toggle and behaves exactly as before, just inside the bigger modal — verified with a `text/plain` test file.
- [x] `npx tsc --noEmit` passes with no new errors — re-confirmed after every follow-up round.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Manual: pnpm dev → open a project's Onboarding Wizard → Storage/KB or HTML Mockup step →
# click "View" on an .html file with responsive breakpoints → toggle Desktop/Tablet/Mobile →
# also click "View" on a non-html file (e.g. .docx/.pdf) to confirm the modal is larger and unaffected otherwise.
```

## Compatibility Touchpoints

- None — purely a client-side presentational change inside one file's private components (`FileViewerModal`, `FilePreview`, `HtmlFilePreview`), no API/DB/route changes.

## Implementation Notes

### What Changed
- Widened `FileViewerModal`'s dialog from `w-full max-w-4xl h-[85vh]` to `w-[96vw] h-[94vh]`, matching `HtmlEditorModal`'s footprint, for every file type.
- Added a Desktop/Tablet/Mobile toolbar to `FileViewerModal`, rendered only when `file.file_mime_type === "text/html"`, reusing the existing `PREVIEW_SIZES` config and toolbar markup/classes from `HtmlEditorModal`. Selected size is local `previewSize` state, default `"full"` (Desktop).
- Threaded `previewSize` from `FileViewerModal` → `FilePreview` (new optional prop) → `HtmlFilePreview` (new required prop) so the HTML branch can render with the selected viewport.
- Rewrote `HtmlFilePreview` to scale-to-fit instead of a plain `w-full h-full` iframe: a `ResizeObserver`-measured wrapper div, iframe rendered at the preset's virtual width (1280/768/390) and `transform: scale(...)`-ed to fit, centered via a computed left offset — the same math `HtmlEditorModal`'s preview pane already used. Did not extract the shared hook suggested in Code Context — the duplication is small (~15 lines) and the two call sites have slightly different mount lifecycles (see deviation below), so keeping them independent avoided over-abstracting for two call sites.

### Files Changed
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` — `FileViewerModal`, `FilePreview`, `HtmlFilePreview`

### Deviations From Plan
- The task doc's reference implementation for `HtmlFilePreview` (mirroring `HtmlEditorModal`) had the same conditional-early-return-before-the-ref-div structure `HtmlEditorModal` avoids only because its preview pane is a sibling of the loading/error UI, not nested inside a shared early return. Copying that shape into `HtmlFilePreview` verbatim caused a real bug during manual testing: the `ResizeObserver` effect (`useEffect(..., [])`) ran once on mount against `paneRef.current`, but on first mount (while `html === null`) the ref'd wrapper div didn't exist yet — it was behind an `if (html === null) return <different div>` — so the observer never attached and the preview stayed blank forever once `html` resolved. Fixed by keeping the `ref={paneRef}` wrapper div always mounted and moving the loading/error/iframe branches inside it as conditional children (absolutely positioned), instead of returning different top-level elements per state. Verified via zoomed-in DOM inspection (`querySelector` + `getBoundingClientRect()` in the browser) that showed an empty always-present wrapper div with `paneSize.width` stuck at 0 before the fix, and a correctly sized/scaled iframe after.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
- Manual (Chrome, `pnpm dev`, ABC Test Company project → Onboarding Wizard → HTML mockup step):
  - Uploaded a test HTML file with a `max-width: 700px` responsive breakpoint (desktop nav → hamburger, 3-col grid → stacked). Desktop showed the desktop nav/grid at true 1:1 scale (pane ≥1280px). Tablet (768px virtual width) still showed desktop layout, correctly above the test fixture's own breakpoint. Mobile (390px virtual width) correctly showed the hamburger menu and stacked cards.
  - Viewed a plain-text (`text/plain`) file in the same step: modal rendered at the new larger size with no Desktop/Tablet/Mobile toolbar, content unaffected — confirms the toolbar is HTML-gated only.
  - Re-viewed the project's pre-existing `webriq-central-hub-dashboard.html` mockup (the real file referenced in the task's screenshots) via "View" (not "Edit") — confirmed it renders correctly full-size with the same toggle.
  - Removed both test files (`test-mockup.html`, `test-plain.txt`) after verification; the pre-existing project file was untouched.

### Follow-up Refinement (same session, post-review)

User reviewed the first pass and asked for three adjustments, all applied directly (no new task doc — same task, pre-ship):
1. Moved the Desktop/Tablet/Mobile control from its own toolbar row into the middle of the modal header, absolutely centered (`absolute left-1/2 -translate-x-1/2`) between the file name (left) and close button (right) — removes the separate pane row.
2. Converted the toggle to icon-only buttons with tooltips, copying the exact Grid/List view-toggle pattern from `src/app/v2/(hub)/projects/_projects-index.tsx` (pill container `border border-[#E2E7F2] rounded-full p-1 bg-white`, buttons `p-1.5 rounded-full`, active = `bg-[#071133] text-white`, inactive = `text-[#5F6A88] hover:text-[#0B1533]`, icon `size={15}`) — tooltips via the file's existing `IconTip` wrapper, which itself wraps the same shared `Tooltip`/`TooltipTrigger`/`TooltipContent` primitives the Projects page toggle uses, so behavior matches exactly.
3. Shrank the modal from `w-[96vw]` to `w-[1360px] max-w-[96vw]` (still `h-[94vh]`) so Desktop mode (1280px content) fills the pane without excess side padding, matching the reference screenshot.

Verified manually in the browser (same dev server, same project's `webriq-central-hub-dashboard.html`): toggle renders centered in the header with tooltips on hover, active state matches the Grid/List navy-pill treatment, all three sizes render correctly, and the modal width now tracks the desktop content closely.

- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS

### Follow-up Refinement #2 (same session) — "Edit HTML" button + modal transition

User asked for an "Edit HTML" button in `FileViewerModal`'s header (next to Close, HTML files only) that closes the viewer and opens `HtmlEditorModal` for the same file, with a smooth transition between the two. Applied directly, same task, pre-ship:

1. Added a new `handleEditHtmlFromViewer(asset)` handler (next to `closeHtmlEditor`) that calls `closeFileViewer()` then `handleOpenHtmlEditor(asset)` synchronously — both state updates land in the same render, so React batches them.
2. `FileViewerModal` gained a required `onEditHtml: (file: AssetRow) => void` prop and a `Pencil`-icon button (`IconTip label="Edit HTML"`) in the header, grouped with the existing Close button in a `flex items-center gap-1` wrapper, gated on the same `isHtml` check the viewport toggle already uses.
3. For "a nice transition between closing and opening": neither modal had any enter/exit animation before (plain conditional render, instant pop). Added `AnimatePresence` around both `{viewerFile && <FileViewerModal .../>}` and `{editingHtmlAsset && <HtmlEditorModal .../>}` blocks (each given a stable `key` so framer-motion tracks them), and converted both modals' backdrop + card from plain `<div>` to `<motion.div>` (backdrop: opacity 0→1 fade, 0.15s; card: opacity+scale(0.97→1)+y(8→0), 0.18s, both with matching `exit` variants). Because `handleEditHtmlFromViewer` triggers both state changes in one commit, the viewer's exit animation and the editor's enter animation run concurrently — a genuine crossfade, not a sequential close-then-open.
4. This also means every other close (viewer's own Close button, editor's own Close button) now gets the same fade/scale-out for free, not just this specific hand-off — matches the user's phrasing ("nice transition between closing and opening of the modals," not just this one flow).
5. Scoped to `text/html` only, matching the earlier viewport-toggle work and the user's literal ask — did not extend to `text/markdown` (the HTML Mockup step's own file list already has a dedicated Edit icon covering both mime types for that step specifically; this new button lives in the shared, cross-step viewer).

Known limitation (not addressed, judged out of scope for this ask): `handleOpenHtmlEditor`/`handleHtmlEditorSaved` were originally wired only for the HTML Mockup step's file list — `handleHtmlEditorSaved` updates `htmlMockupFiles` state specifically after a save. Since `FileViewerModal` is shared across many steps (Kickoff attachments, Outcome/Migration/Content-map/Signoff steps, Storage/KB explorer), editing-then-saving an HTML file surfaced from a *different* step's file list won't refresh that step's own local `file_size` display until the page reloads. The save itself always succeeds (generic per-asset PATCH endpoint) and re-viewing always re-fetches fresh content, so this is a cosmetic staleness in one field, not a functional break — flagged here rather than silently left undocumented.

Verified manually in the browser: Edit HTML button appears only for the HTML file, tooltip reads "Edit HTML", clicking it shows a live crossfade (view modal fading/scaling out while the editor fades/scales in with the same file's content and Desktop preview already correct), and the editor's own Close button fades back out cleanly to the wizard page with no stray state.

- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS

### Follow-up Refinement #3 (same session) — Edit HTML modal parity + CTA button + code toggle

User asked to (1) bring `HtmlEditorModal`'s Desktop/Tablet/Mobile toggle in line with the just-updated `FileViewerModal` version, (2) restyle its "Save" button to match the orange CTA from `_final_design/guide/central-hub-design-system.md`, (3) add a `<>` toggle to show/hide the code editor pane, defaulting to shown. Applied directly, same task, pre-ship:

1. **Viewport toggle parity** — moved the Desktop/Tablet/Mobile control out of its own toolbar row above the preview pane and into the modal's main header, absolutely centered, converted to the same icon-only + `IconTip` tooltip + navy-fill-active pill used in `FileViewerModal` (verbatim copy of that block). Removing the toolbar row let the preview-pane wrapper collapse to just the `ref={previewPaneRef}` div directly (the extra `flex-col` wrapper that used to hold toolbar+pane is gone).
2. **Save button → CTA** — read `_final_design/guide/central-hub-design-system.md` §4 Buttons: pill radius, orange bg, `#471F02` text, hover `orange-600` + white text, default size `8px 15px / 12px`. Rather than inventing new classes, copied the exact class string already used by this codebase's real orange CTAs (`"+ Add client"` in `_customers-index.tsx`/`_projects-index.tsx`, `"+ New Project"` in `portfolio-tracker/new/_content.tsx`) for pixel-identical consistency: `inline-flex items-center gap-2 px-[15px] py-2 rounded-full text-[12px] font-semibold transition-colors cursor-pointer bg-[#FB914E] text-[#471F02] hover:bg-[#E2762F] hover:text-white disabled:cursor-not-allowed disabled:opacity-60`. Used the codebase's actual `disabled:opacity-60` convention (found in 2 other CTA instances) rather than the doc's literal 45%, since no other CTA in the app implements 45% — judged real precedent more reliable than the written number for this one detail.
3. **Code toggle** — added `const [showCode, setShowCode] = useState(true)` and a `Code2` (renders as `</>`) icon button in the header's right-side group, using this same file's existing single-icon-toggle convention (`StorageFileExplorer`'s Grid/List switch: light-blue `bg-[#E5F1FF] text-[#007BFF]` when active, muted/transparent when inactive) rather than the navy-pill-group style, since it's a standalone binary toggle, not a multi-option group. When off, the editor pane (`{showCode && (<div>...CodeMirror...</div>)}`) is unmounted entirely rather than hidden with CSS, so the preview pane's `flex-1` naturally claims the full row as the only remaining flex child — no extra width math needed, and the existing `ResizeObserver` on the preview pane already reacts correctly to the resulting width change.

Verified manually in the browser: toggle now renders centered in the editor's header exactly like the viewer's; Save button shows the orange pill with darker-orange hover; clicking the code toggle hides the editor and the live preview immediately re-flows to fill the full width (confirmed via a real HTML file, Desktop mode); toggling back restores the split view.

- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS

### Follow-up Refinement #4 (same session) — code toggle placement + active styling

User feedback on refinement #3: reposition the `<>` code toggle to sit before (left of) the Desktop/Tablet/Mobile pill, style it identically, and give it the same navy/black active fill (not the light-blue single-toggle treatment) when the editor is visible. Applied directly:

- Moved the `Code2` button out of the header's right-side group and into its own small pill (`border border-[#E2E7F2] rounded-full p-1 bg-white`) immediately to the left of the viewport-size pill, both wrapped in one absolutely-centered flex container (`gap-2` between the two pills).
- Changed its active-state class from the light-blue `bg-[#E5F1FF] text-[#007BFF]` to the same navy fill used by the viewport buttons (`bg-[#071133] text-white`), inactive state `text-[#5F6A88] hover:text-[#0B1533] bg-transparent` — verbatim match to the `PREVIEW_SIZES` button classes, size `15` icon to match too (was `16`).
- This supersedes the "standalone toggle → light-blue active" convention note from refinement #3 for this specific button; that convention still applies elsewhere (e.g. `StorageFileExplorer`'s Grid/List), but here the user explicitly asked for parity with the adjacent viewport pill instead.

Verified manually: code toggle now renders as its own pill directly before the Desktop/Tablet/Mobile pill, both pills visually matching; toggle shows navy/black fill while the editor is visible (default) and reverts to the muted/transparent state when hidden, confirmed via zoomed screenshots of both states.

- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS
