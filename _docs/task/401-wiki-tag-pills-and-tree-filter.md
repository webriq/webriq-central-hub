# 401: Wiki Tags — Pill Input with Suggestions + Tree Filter (Tag / Space) + Tags in New Page Modal

**Created:** 2026-09-24
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Completed
**Completed:** 2026-09-24

---

## Completion Summary (final state — read this first)

**Shipped:**
- **Tag pill input** (`_wiki-tag-input.tsx`) replaces the comma-separated field in the doc
  panel's edit mode, now with a visible **"Tags"** label above it (post-gate user request). Pills
  with `X` remove; Backspace on empty input removes the last; Enter / comma / blur commits; paste
  of `a, b` splits. Suggestions: typed text → catalog tags containing it (prefix first); empty input
  → tags appearing in the page title first, then most-used. Unknown text → `Create "<text>"` row.
  Case-insensitive match reuses the catalog's casing.
- **New Page modal** — "Tags (optional)" field with the same input; `POST /api/wiki/pages` saves
  normalized `tags`.
- **Tree Filter** (`_wiki-tree-filter.tsx`) — `ListFilter` icon button beside the search with
  Spaces / Tags checkbox groups (count badge, "Clear filters", tag finder when > 10 tags).
  OR within a group, AND across groups. Search is locked to the filtered set and always matches
  title OR tag. Spaces-only filter keeps the tree (other spaces hidden, drag reorder disabled so the
  saved order can't be truncated); a tag filter or search text shows a flat list with matched tag
  mini-pills.
- **Data** — `WikiPageSummary.tags` added across all producers; `src/lib/wiki/tags.ts` holds the
  shared normalize / catalog / ranking helpers; POST + PATCH normalize tags server-side. No migration.

**Fixes / changes after implementation:**
- Quality gate: Enter in an empty Tags field was swallowed, blocking the New Page modal's submit —
  Enter is now only intercepted when it commits a tag.
- New Page modal panel lost `overflow-hidden` so the suggestion dropdown isn't clipped.
- User request: "Tags" label added above the doc-panel tag input (`htmlFor="wiki-doc-tags"`).

**Verification:** `npx tsc --noEmit` + eslint on all touched paths — PASS after every change.
Browser acceptance on `/kb` was not run by the agent; the task was marked completed on user
sign-off.

**Known limitation (accepted):** a filter-selected tag that disappears from the catalog stays
selected (still counted on the badge) until "Clear filters".

---

## Overview

Tags on a wiki page (`/kb`) are edited today through a single plain text input
(`"Tags (comma-separated)"`) in `_wiki-doc-panel.tsx`, parsed with `split(",")` in
`_wiki-shell.tsx`'s `save()`. There is no reuse of existing tags, no visual pill, no way to
browse/filter the tree by tag, and the New Page modal can't set tags at all.

This task:

1. Replaces the comma input with a **tag pill input** — each tag is a removable pill (`X`),
   typing shows a suggestion dropdown of existing tags, and entering a tag with no matching
   suggestion creates it as new.
2. Adds a **Filter** button beside the tree panel's search bar (same checkbox-dropdown look as
   the multi-status filter elsewhere — `FilterMultiSelect`) with two groups: **Tags** and
   **Spaces**.
3. Scopes search to the active filter ("locked in by the filter"), and when no filter is active
   the search also matches tags, not just titles.
4. Adds the same tag pill input to the **New Page** modal.

No schema change — `wiki_pages.tags text[] not null default '{}'` already exists (migration 149).

## Requirements

### Tag pill input (shared component)
- [x] New `_wiki-tag-input.tsx` in `src/app/(hub)/kb/` — controlled `value: string[]` /
      `onChange(next: string[])`, props `suggestions: string[]` (all known tags) and optional
      `contextTitle?: string` (for title-aware ranking, see below).
- [x] Current tags render as `rounded-full` pills (hub's hand-rolled pill pattern — match the
      existing tag chip in `_wiki-info-panel.tsx:66`) each with an `X` icon-button
      (`aria-label="Remove tag {tag}"`).
- [x] Text input sits inline after the pills (wraps). `Enter` or `,` commits the typed text;
      `Backspace` on an empty input removes the last pill.
- [x] Suggestion dropdown while focused:
  - With typed text: existing tags containing the text (case-insensitive), excluding tags
    already added, max ~8. Keyboard: `↑/↓` to move, `Enter` to pick highlighted, `Esc` closes.
  - With empty text: tags ranked by relevance to `contextTitle` — a tag whose text appears in
    the page title (case-insensitive, token or substring match) ranks first, then by usage
    count across pages. (Interpretation of "suggestions depending on the title".)
  - When the typed text matches no existing tag exactly, the dropdown shows a final row
    `Create "<text>"`; pressing `Enter` with no highlighted suggestion adds it as a new tag.
- [x] Committing a tag that case-insensitively equals an existing tag reuses the **existing
      casing** (prevents `CiteForge` / `citeforge` duplicates). Duplicates within the page's own
      list are ignored.
- [x] Normalization (shared helper): trim, collapse internal whitespace, drop empties, max 40
      chars per tag, case-insensitive dedupe.

### Doc panel (edit mode)
- [x] Replace the comma `<input>` in `_wiki-doc-panel.tsx` (lines ~156–162) with
      `WikiTagInput`, `contextTitle={draftTitle}`.
- [x] `_wiki-shell.tsx`: `draftTags` becomes `string[]` (init `detail.tags`), `save()` sends it
      directly (no `split`).

### New Page modal
- [x] `_wiki-new-page-modal.tsx`: add a "Tags (optional)" field below Title using
      `WikiTagInput`, `contextTitle={title}`; send `tags` in the POST body.
- [x] `POST /api/wiki/pages`: accept optional `tags?: string[]`, normalize server-side, insert.

### Tree filter + search
- [x] `_wiki-tree-panel.tsx`: add a compact filter trigger (lucide `ListFilter` icon button,
      `aria-label="Filter"`) to the right of the search input, inside the same `p-3.5` row.
      Active state (any filter set) uses the same blue active styling as `FilterMultiSelect`'s
      trigger (`border-[#007BFF] bg-[#F0F7FF] text-[#0063D6]`) plus a small count badge.
- [x] Filter panel (portal-positioned, same mechanics/visuals as
      `desk/tickets/_filter-multi-select.tsx` — `FilterCheckRow`, navy checked fill, outside-click
      close, scroll/resize reposition) with two sections:
  - **Spaces** — the 6 `WIKI_PRODUCTS` (colored badge + name).
  - **Tags** — every distinct tag across non-archived pages, with a small search box at the top
    of the section when there are > 10 tags. Empty state: "No tags yet".
  - A "Clear filters" link at the bottom when anything is selected.
  Semantics: empty selection in a group = no restriction (default). Within a group: OR. Across
  groups: AND.
- [x] Result rendering:
  - **No filter, no search** → existing drag-reorderable `WikiSpaceList` tree (unchanged).
  - **Space filter only, no search** → `WikiSpaceList` renders only the selected spaces; drag
    reorder is disabled while a space filter is active (reordering a subset would corrupt the
    persisted full order in `useWikiSpaceOrder`).
  - **Tag filter active, or any search text** → flat result list (existing `searchMatches`
    rendering) over the filtered set, each row also showing the page's matching tag(s) as tiny
    pills when a tag matched.
- [x] Search matching: when a filter is active, search only runs inside the filtered set; title
      OR tag (case-insensitive substring) always, so with no filter the search also finds pages by
      tag. Archived pages stay excluded (current behavior).
- [x] Search placeholder reflects the lock: `"Search wiki…"` with no filter,
      `"Search in filtered pages…"` when a filter is active.
- [x] Empty results: existing "No pages match" copy, plus "Clear filters" action button when a
      filter is active.
- [x] Filter state is local component state (not URL) — out of scope to deep-link.

### Data plumbing
- [x] `WikiPageSummary` gains `tags: string[]`. Update every producer:
      `page.tsx` select + map, `api/wiki/pages/route.ts` (`WikiPageRow`, `toSummary`, both
      `.select(...)`), `api/wiki/pages/[pageId]/route.ts` related-pages select (line ~62) + its
      mapping.
- [x] Shared helper `src/lib/wiki/tags.ts`: `normalizeWikiTags(input: unknown): string[]`
      (server+client safe, no `"use server"`), `collectWikiTags(pages)` → `{ tag, count }[]`
      sorted by count desc then alpha, and `rankTagSuggestions(all, query, title, exclude)`.
- [x] `PATCH /api/wiki/pages/[pageId]`: run incoming `tags` through `normalizeWikiTags` (today it
      writes whatever array arrives).

## Out of Scope / Must-Not-Change

- No migration; no new `wiki_tags` table. Tag catalog = distinct values from `wiki_pages.tags`.
- No tag rename/merge/delete admin UI.
- No URL persistence of filter state (`?space=&page=` handling in `_wiki-shell.tsx` unchanged).
- Do not change `useWikiSpaceOrder` persistence or the unfiltered drag-reorder behavior.
- Do not import `FilterMultiSelect` across feature boundaries — per that file's own documented
  precedent, each feature area keeps its own copy. Port the needed bits (`FilterCheckRow`,
  portal positioning) into the new kb filter file.
- Import modal (`_wiki-import-modal.tsx`) — no tags field (can follow later).
- Info panel tag display (`_wiki-info-panel.tsx`) — unchanged; clicking a tag to filter is a
  possible follow-up, not in this task.
- No `dark:` classes; `/kb` uses the fixed light design tokens already used in these files.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/wiki/tags.ts` | Create | `normalizeWikiTags`, `collectWikiTags`, `rankTagSuggestions` |
| `src/app/(hub)/kb/_wiki-tag-input.tsx` | Create | Pill input + suggestion dropdown (shared by doc panel + new page modal) |
| `src/app/(hub)/kb/_wiki-tree-filter.tsx` | Create | Filter trigger + portal panel (Spaces / Tags groups), ported from `FilterMultiSelect` mechanics |
| `src/app/(hub)/kb/_wiki-tree-panel.tsx` | Modify | Filter button beside search; filtered/locked search; result list with tag pills |
| `src/app/(hub)/kb/_wiki-space-list.tsx` | Modify | Optional `visibleSpaces` + `reorderDisabled` props |
| `src/app/(hub)/kb/_wiki-doc-panel.tsx` | Modify | Replace comma input with `WikiTagInput`; `draftTags: string[]`; new `allTags` prop |
| `src/app/(hub)/kb/_wiki-shell.tsx` | Modify | `draftTags` → `string[]`; compute tag catalog from `pages`; pass to doc panel / modal / tree |
| `src/app/(hub)/kb/_wiki-new-page-modal.tsx` | Modify | Tags field; send `tags` in POST |
| `src/app/(hub)/kb/page.tsx` | Modify | Select + map `tags` into summaries |
| `src/types/wiki.ts` | Modify | `WikiPageSummary.tags: string[]` |
| `src/app/api/wiki/pages/route.ts` | Modify | `tags` in select/summary; accept + normalize `tags` on POST |
| `src/app/api/wiki/pages/[pageId]/route.ts` | Modify | `tags` in related-pages select/map; normalize `tags` on PATCH |

## Code Context

### `src/app/(hub)/kb/_wiki-doc-panel.tsx` (edit-mode tag field to replace, ~L156)

```tsx
<input
  value={draftTags}
  onChange={(e) => onDraftTagsChange(e.target.value)}
  className="w-full text-[12.5px] text-[#3A4565] outline-none border border-[#E2E7F2] bg-[#F4F6FB] rounded-[8px] px-3 py-1.5 mb-4 focus:border-[#007BFF] focus:bg-white"
  placeholder="Tags (comma-separated)"
/>
```
Props `draftTags: string` / `onDraftTagsChange: (value: string) => void` (L56, L62) become
`string[]`. Keep the container look (border `#E2E7F2`, bg `#F4F6FB`, focus-within
`#007BFF` + white bg) on the pill input's wrapper using `focus-within:`.

### `src/app/(hub)/kb/_wiki-shell.tsx`

```ts
const [draftTags, setDraftTags] = useState("");          // L53 → useState<string[]>([])
setDraftTags(detail.tags.join(", "));                     // L107 → setDraftTags(detail.tags)
const tags = draftTags.split(",").map((t) => t.trim()).filter(Boolean); // L115 → drop
```
Compute once: `const tagCatalog = useMemo(() => collectWikiTags(pages), [pages]);` — pass
`tagCatalog` to `WikiTreePanel`, `WikiDocPanel`, `WikiNewPageModal`. `refreshPages()` after
save/create already keeps it fresh (newly created tags appear as suggestions immediately).

### `src/app/(hub)/kb/_wiki-tree-panel.tsx` (search row + current matching)

```tsx
<div className="p-3.5 pb-2.5">
  <div className="flex items-center gap-2 bg-[#F4F6FB] border border-[#E2E7F2] rounded-[8px] px-2.5 py-1.5">
    <Search size={13} ... />
    <input value={search} ... placeholder="Search wiki…" />
  </div>
</div>
...
const searchMatches = useMemo(() => {
  const q = search.trim().toLowerCase();
  if (!q) return null;
  return pages.filter((p) => p.status !== "archived" && p.title.toLowerCase().includes(q));
}, [pages, search]);
```
Wrap the search box + new filter button in `flex items-center gap-1.5`; panel is only 264px
wide, so the filter trigger is an icon button (h-8 w-8-ish, `rounded-[8px]`, same border/bg as
the search box), not a labelled pill. Replace `searchMatches` with a single `results` memo:
`null` when (no search && no tag filter) → tree view; else filtered flat list.

### `src/app/(hub)/desk/tickets/_filter-multi-select.tsx` — mechanics to port

`FilterCheckRow` (navy `#071133` checked box, `hover:bg-[#F4F6FB]`), portal placement
(`getBoundingClientRect` → `position: fixed`, scroll/resize listeners), outside-mousedown close,
panel classes `z-50 rounded-[10px] border border-[#E2E7F2] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] p-1`,
section divider `my-1 h-px bg-[#EDF0F7]`. The panel is wider than the trigger — use
`width: 240` and left-align to `r.right - 240` so it doesn't overflow the tree panel leftward.

### `src/app/(hub)/kb/_wiki-space-list.tsx`

Iterates `order.map(...)` inside `DndContext`/`SortableContext`. Add `visibleSpaces?: Set<WikiProduct>`
(skip names not in it) and `reorderDisabled?: boolean` (pass `disabled` to `useSortable` and
hide the grip) rather than passing a filtered `order` (which would make `handleDragEnd` +
`onReorder` persist a truncated order).

### `src/app/(hub)/kb/_wiki-info-panel.tsx:66` — tag pill look to match

```tsx
<span className="text-[11px] bg-[#F4F6FB] border border-[#E2E7F2] text-[#5F6A88] rounded-full px-2 py-0.5">{tag}</span>
```

### `src/app/api/wiki/pages/route.ts` POST — add tags

```ts
const { product, title, parentId, contentHtml, tags } = (body ?? {}) as {...; tags?: unknown };
.insert({ ..., tags: normalizeWikiTags(tags) })
```
Import modal omits `tags` → `normalizeWikiTags(undefined)` returns `[]` (same as column default).

### Existing data
Current rows may have mixed casing (e.g. `"test"`, `"citeforge"`). No backfill — the
case-insensitive reuse rule converges new input toward the first-seen casing.

## Implementation Steps

1. `src/types/wiki.ts`: add `tags: string[]` to `WikiPageSummary`; fix all producers
   (`page.tsx`, both API routes) so `npx tsc --noEmit` is clean.
2. Create `src/lib/wiki/tags.ts` with the three helpers.
3. Wire `normalizeWikiTags` into POST and PATCH routes; accept `tags` on POST.
4. Build `_wiki-tag-input.tsx` (pills, input, suggestion dropdown, create row, keyboard nav).
   Dropdown can be absolutely positioned under the wrapper (not portal) — it lives in the doc
   panel / modal, neither of which clips overflow at that point; verify in the modal.
5. Swap it into `_wiki-doc-panel.tsx`; convert `draftTags` to `string[]` in `_wiki-shell.tsx`.
6. Add the Tags field to `_wiki-new-page-modal.tsx`, send `tags`.
7. Build `_wiki-tree-filter.tsx`; add `visibleSpaces`/`reorderDisabled` to `_wiki-space-list.tsx`.
8. Rework `_wiki-tree-panel.tsx` search/filter/results logic per Requirements.
9. `npx tsc --noEmit`, `pnpm lint`, then browser acceptance on `/kb`.

## Acceptance Criteria

- [ ] Edit mode shows existing tags as pills; `X` removes one; Backspace on empty input removes
      the last.
- [ ] Typing shows matching existing tags; Enter/click adds; typing a new word + Enter adds it
      as a new pill ("Create …" row visible).
- [ ] Typing `CITEFORGE` when `citeforge` exists adds `citeforge` (no duplicate casing).
- [ ] Focusing the empty tag input on a page titled "CiteForge Setup" lists `citeforge` first.
- [ ] Save persists tags; reload shows the same pills and info-panel tags.
- [ ] New Page modal: tags can be added; created page has them (visible in info panel + filter).
- [ ] Filter button sits beside the search bar; opens a panel with Spaces and Tags groups.
- [ ] Space filter only → tree shows only selected spaces, drag handle hidden/disabled; clearing
      restores full tree with drag working and saved order intact.
- [ ] Tag filter → flat list of pages having any selected tag (within selected spaces if set).
- [ ] With a filter active, search only returns pages inside the filter; placeholder changes.
- [ ] With no filter, searching a tag name returns pages tagged with it even if the title doesn't match.
- [ ] Filter trigger shows active styling + count when filters are set; "Clear filters" resets.
- [ ] Import modal still creates pages (tags default `[]`).
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Browser acceptance on `http://localhost:3000/kb` (writer role for edit/new-page; a non-writer
role to confirm the filter + tag search still work read-only).

## Compatibility Touchpoints

- `WikiPageSummary` shape change touches every summary producer (listed above) — tsc catches
  misses. The MCP server does not expose wiki tools (verify with a grep for `wiki` in
  `src/app/api/mcp/route.ts` before finishing; if it does, update `_docs/mcp-tools.md` only if a
  tool's output shape changes).
- `GET /api/wiki/pages` has no `.range()` pagination; payload grows slightly with `tags`. Fine
  at current wiki size (well under 1000 rows) — note only, not in scope.
- No env, packaging, or migration impact.

## Implementation Notes

### What Changed
- Replaced the comma-separated tag input with a pill input (`WikiTagInput`): removable pills,
  suggestion dropdown (typed-text matches, prefix-first; empty input → tags found in the page
  title first, then most-used), `Create "<text>"` row for unknown tags, Enter / comma / blur
  commits, Backspace-on-empty removes last pill, ↑/↓/Esc keyboard nav, paste of `a, b` splits.
  Case-insensitive match reuses the catalog's casing.
- New Page modal gained an optional Tags field; `POST /api/wiki/pages` accepts + normalizes `tags`.
- `PATCH /api/wiki/pages/[pageId]` now normalizes incoming `tags` server-side.
- `WikiPageSummary.tags` added and populated by every producer (server page, list GET/POST,
  related pages).
- Tree panel: `ListFilter` icon button beside the search opens a Spaces / Tags checkbox panel
  (with count badge on the trigger, "Clear filters" footer, tag finder when > 10 tags). Search is
  scoped to the filtered set and matches title OR tag. Spaces-only filter keeps the tree with
  other spaces hidden and drag disabled; tag filter or search text shows the flat result list,
  with matched tags as mini pills under each title.

### Files Changed
- `src/lib/wiki/tags.ts` - new: `cleanWikiTag`, `normalizeWikiTags`, `collectWikiTags`, `resolveWikiTagCasing`, `rankTagSuggestions`
- `src/app/(hub)/kb/_wiki-tag-input.tsx` - new: pill input + suggestions
- `src/app/(hub)/kb/_wiki-tree-filter.tsx` - new: filter trigger + portal panel
- `src/app/(hub)/kb/_wiki-tree-panel.tsx` - filter wiring, scoped search, tag-aware results
- `src/app/(hub)/kb/_wiki-space-list.tsx` - `visibleSpaces` prop; drag disabled (grip hidden) while set
- `src/app/(hub)/kb/_wiki-doc-panel.tsx` - `WikiTagInput` in edit mode; `draftTags: string[]`, `tagCatalog` prop
- `src/app/(hub)/kb/_wiki-shell.tsx` - `draftTags` as array; `tagCatalog` memo passed to tree/doc/modal
- `src/app/(hub)/kb/_wiki-new-page-modal.tsx` - Tags field, sends `tags`
- `src/app/(hub)/kb/page.tsx` - selects/maps `tags`
- `src/types/wiki.ts` - `WikiPageSummary.tags`
- `src/app/api/wiki/pages/route.ts` - `tags` in summary; POST accepts/normalizes tags
- `src/app/api/wiki/pages/[pageId]/route.ts` - `tags` on related pages; PATCH normalizes tags

### Deviations From Plan
- Added `cleanWikiTag` + `resolveWikiTagCasing` to the helper module (small pieces the input
  needed; same file as planned).
- Removed `overflow-hidden` from the New Page modal panel — it clipped the tag suggestion
  dropdown; nothing inside paints to the rounded corners so there's no visual change.
- Filter trigger aria uses `aria-haspopup="dialog"` (panel has two groups + a search input,
  not a single listbox).
- `visibleSpaces` alone drives the drag-disable (no separate `reorderDisabled` prop on
  `WikiSpaceList`) — the two are always set together.
- Filter trigger shows the active count as a small badge rather than inline text (icon-only button).
- Impeccable design hook flagged `text-[12px]` / `text-[10.5px]` literals in the new files —
  left as-is: they're the exact sizes used by the ported `FilterMultiSelect` rows and the
  neighboring `/kb` tree panel.
- MCP route has no wiki tools (grep verified) — `_docs/mcp-tools.md` untouched.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm exec eslint "src/app/(hub)/kb" src/lib/wiki src/app/api/wiki` - PASS
- Browser acceptance on `/kb` - SKIPPED (deferred to the test stage)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Fixed during gate: `WikiTagInput` called `preventDefault()` on every Enter, so Enter in an empty
  Tags field blocked the New Page modal's form submit. Now only swallowed when Enter actually
  commits a tag (highlighted suggestion or typed text).
- No `any`, no debug logging, no dead code. Helpers are pure and shared client/server
  (`src/lib/wiki/tags.ts`, no `"use server"`). Server routes normalize `tags` from `unknown`.
- Styling follows `/kb` conventions (explicit hex tokens, hand-rolled `rounded-full` pills, no
  `dark:`); `style={{}}` only for portal coordinates and the per-space badge color (same as the
  existing space list). Icon-only buttons have `aria-label`; all interactive rows have hover states;
  filter has empty states ("No tags yet" / "No tags match" / "No pages match these filters." + Clear).
- `FilterCheckRow`/portal mechanics are a local copy, per the documented no-cross-feature-import
  precedent — intentional duplication, not a finding.
- Accepted, not fixed: a selected tag that disappears from the catalog (e.g. its only page is
  deleted) stays in the filter selection until cleared — it is still counted on the trigger badge
  and "Clear filters" removes it. Low impact.
- Impeccable design-hook `design-system-font-size` flags on `text-[12px]`/`text-[10.5px]` —
  false positives; identical to the ported `FilterMultiSelect` and neighboring `/kb` sizes.

### Deviations
- Minor — `WikiTagInput` takes `catalog: WikiTagCount[]` instead of the planned
  `suggestions: string[]`; counts are needed for usage-ranked suggestions. Same behavior.
- Minor — extra helpers `cleanWikiTag` / `resolveWikiTagCasing` in the planned module.
- Minor — `WikiSpaceList` uses a single `visibleSpaces` prop (drag disabled when set) instead of
  `visibleSpaces` + `reorderDisabled`; the two are always set together.
- Minor — removed `overflow-hidden` from the New Page modal panel so the suggestion dropdown
  isn't clipped; no visual change.
- Minor — filter trigger count rendered as a corner badge (icon-only button).
- No medium or major deviations; no out-of-scope files touched.

### Required Fixes
- None.

### Post-Gate Change (user request)
- Added a visible "Tags" label (`<label htmlFor="wiki-doc-tags">`) above the tag pill input in the
  doc panel's edit mode, so new Hub users can tell what the field is for. Styled like the New Page
  modal's field labels (`text-[11px] font-semibold text-[#0B1533]`); the modal already had its
  "Tags (optional)" label. `npx tsc --noEmit` + eslint re-run — PASS.
