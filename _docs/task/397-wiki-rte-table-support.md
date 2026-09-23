# 397: Wiki RTE Table Support

**Created:** 2026-09-23
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

The Wiki RTE (`_wiki-rte.tsx`, task 395) only registers `StarterKit` + `Placeholder` + `Image` — no table node exists in its ProseMirror schema. This has two consequences:

1. **A real, if narrow, correctness bug**: task 396's Import feature produces genuine `<table>` HTML for `.docx` (via `mammoth`) and `.md` (via `marked`'s GFM table support) — both already work today in **read mode**, but the moment someone opens an imported page with a table in **Edit mode**, Tiptap parses the stored `content_html` into its editor document, and any element type with no matching schema node is silently dropped. A table imported today would vanish the first time anyone edits that page and saves.
2. **A missing capability**: nobody can insert or edit a table by hand while writing a Wiki page directly — a real gap for documentation content (the mockup's own reference content includes a "Page metadata" table).

This task adds `@tiptap/extension-table` (npm registry confirms a `deps: none` single package in v3 — the v2-era split into 4 separate `@tiptap/extension-table-row`/`-cell`/`-header` packages appears consolidated; **verify the exact named exports during implementation**, since this wasn't testable ahead of time), wires an "Insert table" toolbar action plus contextual row/column controls, and styles tables in both the editable and read-mode views using the Table spec already documented in `central-hub-design-system.md`.

## Requirements

- [ ] `pnpm add @tiptap/extension-table` (verify whether this alone exports `Table`/`TableRow`/`TableHeader`/`TableCell`, or whether separate `-row`/`-cell`/`-header` packages are still needed for v3 — add them too if so, and correct this doc's assumption in Implementation Notes).
- [ ] Register the table extension(s) in `_wiki-rte.tsx`'s `useEditor({ extensions: [...] })` list, alongside the existing `StarterKit`/`Placeholder`/`Image`.
- [ ] Toolbar: one "Insert table" button (a new icon, e.g. `Table` from `lucide-react`) — `editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()`.
- [ ] Contextual table-editing controls, shown only when `editor.isActive("table")` — a small row of icon buttons for: Add row below (`addRowAfter`), Add column right (`addColumnAfter`), Delete row (`deleteRow`), Delete column (`deleteColumn`), Delete table (`deleteTable`). Follow this file's existing `ToolbarButton`/`IconTip` pattern, don't invent a second button style.
- [ ] Editable-view table styling (inside `_wiki-rte.tsx`'s `editorProps.attributes.class`) and read-mode table styling (inside `_wiki-doc-panel.tsx`'s rendered-HTML `className`, which already has a matching `[&_h2]`/`[&_blockquote]`/`[&_pre]` block to extend) — both driven by the same design-system Table spec:
  - Header: `9.5px`/700, uppercase-tracking `--muted` (`#5F6A88`) text on `#FAFBFE` background.
  - Cells: `11–12px` padding, `13px` text, `--line-soft` (`#EDF0F7`) dividers.
  - Row hover: `--blue-50` (`#F0F7FF`).
  - First column: `18px` left padding.
  - Match this exactly against the design system doc at implementation time — don't approximate from memory.
- [ ] Confirm (manually, once a live session is available) that an imported `.docx`/`.md` page with a table survives an Edit → Save round-trip without losing the table.

## Out of Scope / Must-Not-Change

- Column resizing / drag-to-resize (Tiptap's table extension supports `resizable: true` as an option — leave it off/default unless trivial; not requested).
- Merged/spanning cells beyond whatever `insertTable`'s defaults produce — no custom merge-cell UI.
- Any change to `.pdf` import (that's task 398's territory — AI-assisted complex-layout import, which may itself produce `<table>` markup for tabular PDF content; this task just makes sure the RTE schema can actually hold a table once one exists, regardless of source).
- `_wiki-tree-panel.tsx`, `_wiki-shell.tsx`, `_wiki-info-panel.tsx`, `_wiki-new-page-modal.tsx`, `_wiki-import-modal.tsx`, any API route — untouched.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `package.json` | Modify | `pnpm add @tiptap/extension-table` (+ sub-packages if actually still separate in v3) |
| `src/app/(hub)/kb/_wiki-rte.tsx` | Modify | Register table extension(s), add Insert-table + contextual table toolbar buttons, editable-table CSS |
| `src/app/(hub)/kb/_wiki-doc-panel.tsx` | Modify | Read-mode table CSS added to the existing rendered-HTML `className` block |

## Code Context

### Extensions + toolbar pattern to extend — `src/app/(hub)/kb/_wiki-rte.tsx`
```tsx
const editor = useEditor({
  extensions: [StarterKit, Placeholder.configure({ placeholder: "Write the page…" }), Image],
  // ...
});

const structure: { icon: typeof Bold; title: string; action: () => void; active: () => boolean }[] = [
  { icon: Heading2, title: "Heading", action: () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), active: () => editor?.isActive("heading", { level: 2 }) ?? false },
  // ... Heading3, List, ListOrdered, Quote, Code2
];

function ToolbarButton({ icon: Icon, title, action, active }: { ... }) { /* existing shared button */ }
```
Add a `Table` icon action to `structure` (or a new row) for insert, and a separate conditionally-rendered row (only when `editor.isActive("table")`) for the row/column/table controls — same `ToolbarButton` component, same `IconTip` tooltips.

### Read-mode CSS block to extend — `src/app/(hub)/kb/_wiki-doc-panel.tsx`
```tsx
<div
  className={cn(
    "text-[13px] leading-[1.7] text-[#3A4565]",
    "[&_h2]:font-heading [&_h2]:text-[15px] [&_h2]:font-bold ...",
    "[&_blockquote]:bg-[#EEF3FF] [&_blockquote]:border ...",
    "[&_pre]:bg-[#0F172A] [&_pre]:text-[#D7E0F7] ...",
    "[&_img]:max-w-full [&_img]:rounded-[10px] [&_img]:my-3"
  )}
  dangerouslySetInnerHTML={{ __html: renderedHtml }}
/>
```
Add `[&_table]`/`[&_th]`/`[&_td]`/`[&_tr]` rules to this same array, matching the design-system Table spec verbatim.

### Design-system Table spec to match exactly — `_final_design/guide/central-hub-design-system.md`
```
### Table
- Header: 9.5px/700 caps `--muted` on `#FAFBFE`, bottom `--line-soft`.
- Cells: 11–12px padding, 13px text, `--line-soft` dividers. Row hover `--blue-50`.
- First column padded 18px. Wrap in `overflow-x: auto` for mobile.
```
(`--muted:#5F6A88`, `--line-soft:#EDF0F7`, `--blue-50:#F0F7FF` per the same doc's Color section.)

## Implementation Steps

1. `pnpm add @tiptap/extension-table`; check its exports (`import { Table, TableRow, TableHeader, TableCell } from "@tiptap/extension-table"` or similar) — add sibling packages only if the single package doesn't cover all four node types.
2. Register the extension(s) in `_wiki-rte.tsx`.
3. Add the Insert-table toolbar button.
4. Add the contextual (cursor-in-table-only) row/column/table controls.
5. Add editable-mode table CSS in `_wiki-rte.tsx` and matching read-mode CSS in `_wiki-doc-panel.tsx`, both sourced from the design-system Table spec.
6. Manual check once a live session exists: import a `.docx`/`.md` with a table (task 396), open it, Edit, Save, reload — table must still be there.

## Acceptance Criteria

- [ ] "Insert table" in the RTE toolbar inserts a 3×3 table with a header row.
- [ ] With the cursor inside a table, contextual add/delete row/column/table controls appear and work.
- [ ] Tables render with the exact design-system Table styling in both edit and read mode.
- [ ] An imported page containing a table keeps that table through an Edit → Save → reload cycle.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then browser-verify: insert a table by hand; import a .docx/.md with a table and confirm it survives an edit round-trip
```

## Compatibility Touchpoints

- New dependency `@tiptap/extension-table` (+ possibly sub-packages) — same "first new package a Wiki sub-feature needed" pattern as task 396's `pdf-parse`.
- No migration, no API route changes, no new nav/routing surface.

## Implementation Notes

### What Changed
- Confirmed during implementation: `@tiptap/extension-table` v3 is a single package (`deps: none`) exporting `Table`, `TableRow`, `TableHeader`, `TableCell` directly — no separate sub-packages needed, resolving the doc's "verify during implementation" flag.
- `pnpm add @tiptap/extension-table` initially resolved `3.31.3`, which doesn't match the rest of this repo's already-installed `@tiptap/*` packages (all pinned at `3.30.5` via their peer deps on `@tiptap/core`/`@tiptap/pm`) — pinned explicitly to `@tiptap/extension-table@3.30.5` to match exactly and eliminate the peer-dependency warning.
- `_wiki-rte.tsx`: registered `Table.configure({ resizable: false })` + `TableRow`/`TableHeader`/`TableCell` in `useEditor`'s extensions; added an "Insert table" toolbar action (3×3, header row) to the existing `structure` array; added a new `tableControls` array (Add row below, Add column right, Delete row, Delete column, Delete table) rendered only when `editor.isActive("table")`, using the file's existing `ToolbarButton`/`IconTip` components unchanged.
- Table CSS added to both `_wiki-rte.tsx` (editable) and `_wiki-doc-panel.tsx` (read mode), matching `central-hub-design-system.md`'s Table spec exactly (header `9.5px`/700/caps/`--muted` on `#FAFBFE`; cells `13px`/`--line-soft` dividers; row hover `--blue-50`; first-column `18px` padding). `overflow-x-auto` is applied directly to `<table>` (via `block` + `overflow-x-auto`) rather than a wrapper `<div>`, since Tiptap's own `TableView` wrapper is editor-internal DOM only and isn't serialized into the stored `content_html` that read mode renders — this way both views get horizontal-scroll safety from the same self-contained CSS rule, no extra markup needed.
- Mid-implementation fix: the row-hover rule was first written as `hover:[&_tr]:bg-...` (Tailwind variant syntax, which targets hover on the *outer* element, not each `tr`) — corrected to `[&_tr:hover]:bg-...` (the arbitrary-selector's own `:hover` pseudo-class) in both files before it ever reached a passing build.
- Answered a related user question mid-task (not implemented, no code change): the RTE already has basic hyperlink support via StarterKit's bundled `Link` extension (`autolink: true`, `openOnClick: true` by default) — raw URLs auto-linkify on paste/type. There is still no toolbar button to turn arbitrary selected text into a custom-URL link; flagged as a small, separate, not-yet-requested follow-up.

### Files Changed
- `package.json` / `pnpm-lock.yaml` - added `@tiptap/extension-table@3.30.5`
- `src/app/(hub)/kb/_wiki-rte.tsx` - table extension registration, toolbar actions, editable-table CSS
- `src/app/(hub)/kb/_wiki-doc-panel.tsx` - matching read-mode table CSS

### Deviations From Plan
- None beyond the version-pin and hover-selector fixes noted above, both caught and corrected during implementation rather than shipped as bugs.

### Verification Run
- `npx tsc --noEmit` - PASS (0 errors)
- `pnpm lint` - PASS (0 errors; 2 pre-existing unrelated warnings in `onboarding-workspace/_checklist-tab.tsx`)
- `pnpm dev` + `curl /kb` (307 redirect, no server error) - PASS for compile/boot; dev log clean of compile/module-resolution errors for the new Tiptap extension.
- Full browser acceptance (insert a table by hand, use the contextual row/column/delete controls, import a `.docx`/`.md` with a table and confirm it survives an Edit → Save round-trip) - SKIPPED, same reason as tasks 395/396: no live authenticated session this pass, migration 149 still written not applied.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Full re-read of both changed files (`_wiki-rte.tsx`, `_wiki-doc-panel.tsx`) against the standards checklist.
- Two maintainability issues found and fixed during this pass (see Deviations) — neither changed behavior or scope.
- Error handling, naming, and structure otherwise consistent with the rest of the file (no new escape hatches, no dead code beyond what was fixed, no deep nesting).

### Deviations
- **Minor (fixed):** `tableControls`' three delete actions (row/column/table) all used the same `Trash2` icon, distinguishable only by tooltip text on hover — a real usability smell for an icon-only toolbar. Swapped "Delete row"/"Delete column" to `TableRowsSplit`/`TableColumnsSplit` (both genuine lucide-react exports, verified before use), keeping `Trash2` only for "Delete table" (the one truly destructive, no-undo-visible action). All five table-control actions are now visually distinct, not just tooltip-distinct.
- **Minor (fixed):** the inline toolbar-item type literal (`{ icon: typeof Bold; title: string; action: () => void; active: () => boolean }`) was repeated three times (`marks`, `structure`, and the new `tableControls`) — task 397 tipped a pre-existing 2x duplication into a clearer 3x signal to extract. Pulled into a single `ToolbarItem` type with `active` now optional (defaulting to `() => false` in `ToolbarButton`), removing five identical `active: () => false` lines from `tableControls` in the same pass.
- **Minor (documented, not fixed — out of this task's scope):** `_wiki-rte.tsx` and `_wiki-doc-panel.tsx` duplicate the entire prose CSS rule set (h2/h3/blockquote/pre/code/img, and now table) verbatim between the editable and read-mode views. This duplication pre-dates task 397 (already present for every other element type since task 395); this task extended it consistently rather than introducing a new inconsistency. Worth extracting into a shared constant in a future pass, but doing so now would touch already-shipped, already-tested task 395 code beyond what "add table support" asked for.
- No Major deviations. Scope matches the approved plan: table extension registered, insert + contextual controls added, styling matches the design-system Table spec in both views, no changes to any file outside the plan's list, no column-resize/merge-cell UI added (correctly left out per Out of Scope).
