# 399: Wiki Follow-Up — Full Mockup Space Catalog, Draggable Space Reorder, Version Badge Replaces Status on Page Rows, Page Delete, Metadata/API Contract Fixes

**Created:** 2026-09-23
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

Follow-up to task 395 (Activate Wiki Page/Tab). While reviewing the shipped `/kb` implementation against `_final_design/wiki/wiki-mockup.html`, the user flagged that task 395 deliberately narrowed "Spaces" to the existing 4-entry `ProductName` catalog rather than the mockup's full 6-space list, and asked whether the mockup's "Page metadata" table + example API shape (shown in the mockup page's own body copy) are actually being followed by the real implementation. They are only partially followed — see **Audit Findings** below — and the user asked to close those gaps in this task rather than just report on them. Two more asks came in during scoping: make the space list draggable to reorder, and add a Delete action next to each page's Edit button.

This task does **not** touch the RTE, Import (task 396), Export, or the PDF AI-import pipeline (task 398) — those stay exactly as shipped.

## Audit Findings (answers the "is this being followed?" question)

Comparing the mockup's `.doc-body`'s "Page metadata" table + `GET /api/wiki/spaces/:spaceId/pages/:pageId` example (both are the mockup's own sample **page content**, not a literal spec — but the concepts they name are real and worth checking against what shipped):

| Mockup says | Shipped in task 395 | Verdict |
|---|---|---|
| `Status: enum` — Draft / In review / Published | `draft \| published \| archived` (migration 149) | Different vocabulary (no "in review"; "archived" added instead, used to hide pages from the tree) — a deliberate, sensible divergence, not a bug. Left as-is. |
| `Owner: user` — defaults to creator | `created_by` is set to the creator at insert (`POST /api/wiki/pages`) and never reassigned, but nothing in the UI ever labels or shows it as "Owner" | **Gap — fixed in this task** (see Requirements). |
| `Version: int` — auto-increments **on publish** | Shipped behavior bumps version (and inserts a `wiki_page_versions` row) on **every** content-changing save, regardless of status | **Gap — fixed in this task**, per explicit user decision (real behavior change, see Requirements + Implementation Notes). |
| `Tags: string[]` — used for search & filtering | Column + type exist, `PATCH` already accepts `tags`, info panel already displays them — but no UI anywhere lets a user add/edit a tag | **Gap — fixed in this task** (edit-mode input only; not added to page creation). |
| `GET /api/wiki/spaces/:spaceId/pages/:pageId` → `{ title, body, version, status, tags, owner }` | `GET /api/wiki/pages/[pageId]` (flat, not nested under `/spaces/:spaceId/`) → richer shape (`contentHtml`, `contributors`, `relatedPages`, etc.) | Intentional, better design (page ids are globally unique UUIDs; nesting under space would be redundant) — not a gap, no change needed. |

## Requirements

- [ ] **All 6 mockup spaces, exactly** — `WikiProduct` becomes its own fixed union (no longer an alias of `ProductName`): `"PipelineForge" | "PublishForge" | "CiteForge" | "StackShift I" | "StackShift II" | "Citation Grader"`, in that order (mockup's own order), with the mockup's own per-space colors and badge letters — `PipelineForge` `#2f6fed`/"P", `PublishForge` `#7c5cf0`/"P" (mockup literally uses "P" for both, differentiated only by color — keep that, don't invent a disambiguated letter), `CiteForge` `#16a34a`/"C", `StackShift I` `#c8860a`/"S1", `StackShift II` `#e15b64`/"S2", `Citation Grader` `#0891b2`/"G". Plain `"StackShift"` (task 395's 4th catalog entry) is dropped — it isn't one of the mockup's 6 spaces. Since migration 149 is still written-not-applied and no `wiki_pages` rows exist anywhere yet, the check constraint is widened **in place** (edit the same migration file), not via a second migration.
- [ ] **Draggable space reorder** — the space list in Panel 1 becomes drag-reorderable (`@dnd-kit/core` + `@dnd-kit/sortable`, already a dependency, same pattern as `phase-builder.tsx`'s checklist/deliverable/phase drag handles: `GripVertical` handle, `DndContext`/`SortableContext`/`useSortable`/`arrayMove`). This is a **personal display preference**, not shared data — no new table/column. Persist via a new `localStorage`-backed hook (`use-wiki-space-order.ts`), same `useSyncExternalStore` pattern as `use-pm-settings.ts`, defaulting to the mockup's own order. Available to every role that can see `/kb` (not gated to `canWrite` — reordering your own view isn't a data mutation). Search mode is unaffected (it already lists matching pages flat, not grouped by space).
- [ ] **Version badge replaces the status pill on page-tree rows only** (per explicit user decision — the mockup's doc canvas status pill and the info panel's Status row are untouched; they're the actual control for draft → published → archived, and the mockup itself shows the tree badge and the canvas pill at the same time, not as substitutes for each other). Every page row in the tree (and in search results, for consistency) shows a `v{n}` badge — mirrors the mockup's own `.badge-count` styling (`#F4F6FB` bg, `#E2E7F2` border, `#94A3B8` text, pill, ~10px) — instead of today's draft-only "draft" pill, which is removed. `WikiPageSummary` needs a `version` field for this (currently only on `WikiPageDetail`) — thread it through the list query, the create/update routes' summary selects, and the detail route's sibling/related-pages query.
- [ ] **Delete page action** — a Delete button next to Edit in the document canvas header (view mode only, `canWrite`-gated, same visual family as Edit's outline button but with a destructive hover treatment, matching `_task-drawer.tsx`'s existing `hover:bg-[#FDE8E6] hover:text-[#C0392B]` destructive-hover precedent). Confirms via `confirm()` before calling — same inline pattern `_task-drawer.tsx` already uses for task delete (`if (confirm(...)) onDelete(...)`), with the message naming the child-page count when the page has children (child pages cascade-delete via the existing `parent_id … on delete cascade` FK — no extra cleanup code needed; `wiki_page_versions` rows cascade the same way via `page_id`). New `DELETE /api/wiki/pages/[pageId]` route handler — permission stays RLS-only (`wiki_pages_staff_write` policy already covers `for all`, matching this route's existing GET/PATCH convention of never adding a redundant in-route role check). After a successful delete, the shell clears the selection (if the deleted page was selected), refreshes the tree, and falls back to another page in the same space or the empty state.
- [ ] **Owner surfaced** — a new "Owner" row in the info panel's PAGE INFO block, sourced from the existing `detail.createdBy` (already returned by `GET /api/wiki/pages/[pageId]`, already "defaults to creator" since `created_by` is set once at insert and never reassigned). No schema or API change — display-only wiring.
- [ ] **Tags editing UI** — a plain comma-separated text input in the document canvas's edit mode (not added to the New Page modal — kept there to avoid scope creep on a modal that's already working; tags are edited after a page exists). Parses to `string[]` on save, included in the existing `PATCH` body (the route already accepts `tags`, no API change needed).
- [ ] **Version bumps only on publish, not on every save** (behavior change from task 395's shipped behavior — explicit user decision). `PATCH /api/wiki/pages/[pageId]`: a content-only save (title/body/tags) updates those columns directly with **no** version bump and **no** `wiki_page_versions` insert. A version bump + history row is inserted only when the request transitions `status` to `"published"` from something else. Page creation keeps seeding `version: 1` + an initial `wiki_page_versions` row exactly as today (the v1 baseline, independent of the publish workflow). **Documented side effect, not a bug to chase further:** because `wiki_page_versions` also powers the Contributors avatar stack, someone who only ever edits a page's draft content (never publishes it) will not appear as a contributor until a publish happens — this is the natural consequence of "auto-increments on publish" and matches the mockup's own wording; no separate edit-history mechanism is being added to work around it.

## Out of Scope / Must-Not-Change

- RTE (`_wiki-rte.tsx`), Import (task 396), Export, and the PDF AI-import pipeline (task 398) — untouched.
- Page-level drag-to-reorder (`sort_order` on `wiki_pages`) — still out of scope, exactly as task 395 documented; this task only adds drag-reorder for the fixed **space** list, which is a client-only display preference, not the DB-backed page tree.
- The "In review" status value from the mockup's copy — not adding a third pre-publish state; `draft/published/archived` stays as shipped.
- Any change to the `GET /api/wiki/pages/[pageId]` route's shape or path (the flat, non-nested design is intentionally kept — see Audit Findings).
- Full page-history diff/browse UI — still just a version count + contributor stack, unchanged from task 395's own out-of-scope note.
- Migration 150 (task 398, PDF AI import) — unrelated, not touched.

## Proposed File Changes

| File | Action | Purpose |
|---|---|---|
| `supabase/migrations/149_wiki_pages.sql` | Modify | Widen `product` check constraint to the 6 mockup spaces (edit in place — unapplied, no live data). |
| `src/types/wiki.ts` | Modify | `WikiProduct` becomes its own 6-value union (no longer a `ProductName` alias); `WIKI_PRODUCTS` gets the mockup's colors + explicit `badge` field; `WikiPageSummary` gains `version: number`. |
| `src/types/database.ts` | Modify | Update the 3 `wiki_pages.product` literal-union occurrences (Row/Insert/Update) to the new 6 values. |
| `src/app/api/wiki/pages/route.ts` | Modify | `GET`'s summary select/mapping adds `version`; no other change (POST's create/seed-version-1 behavior is unchanged). |
| `src/app/api/wiki/pages/[pageId]/route.ts` | Modify | `GET`'s sibling/related-pages query adds `version`; `PATCH` reworked to bump version/insert history only on a publish transition; new `DELETE` handler. |
| `src/app/(hub)/kb/page.tsx` | Modify | `isWikiProduct()`/default-space logic keep working unchanged (already derives from `WIKI_PRODUCTS`, not a hardcoded list) — verify only, likely no edit needed beyond the summary mapping picking up `version`. |
| `src/hooks/use-wiki-space-order.ts` | Create | `localStorage`-backed space-order preference, `useSyncExternalStore` pattern copied from `use-pm-settings.ts`. |
| `src/app/(hub)/kb/_wiki-space-list.tsx` | Create | Extracted, drag-reorderable space-switcher list (was inline in `_wiki-tree-panel.tsx`) — keeps `dnd-kit` wiring out of the already-204-line tree panel file. |
| `src/app/(hub)/kb/_wiki-tree-panel.tsx` | Modify | Space-switcher block replaced with `<WikiSpaceList />`; page rows (`PageRow` and the search-results branch) get the `v{n}` badge, draft pill removed. |
| `src/app/(hub)/kb/_wiki-doc-panel.tsx` | Modify | Delete button beside Edit (`confirm()`-gated); tags input in edit mode; new props (`draftTags`, `onDraftTagsChange`, `onDelete`, `childCount`). |
| `src/app/(hub)/kb/_wiki-info-panel.tsx` | Modify | New "Owner" row in PAGE INFO, sourced from `detail.createdBy`. |
| `src/app/(hub)/kb/_wiki-shell.tsx` | Modify | `draftTags` state wired into `save()`'s PATCH body; `deletePage()` handler (calls `DELETE`, clears/reassigns selection, refreshes tree); space-order state via the new hook, threaded to `WikiTreePanel`. |

## Code Context

### Current 4-space catalog to replace (`src/types/wiki.ts`)
```ts
export type WikiProduct = ProductName; // → becomes its own 6-value union
export const WIKI_PRODUCTS: { name: WikiProduct; color: string }[] = [
  { name: "StackShift", color: "#3358F4" },
  { name: "PublishForge", color: "#7C3AED" },
  { name: "PipelineForge", color: "#F97316" },
  { name: "CiteForge", color: "#0EA5E9" },
];
```

### Mockup's spaces, in order, with their literal colors/badges (`_final_design/wiki/wiki-mockup.html:219-242`)
```
PipelineForge    #2f6fed   "P"   (open by default in the mockup)
PublishForge     #7c5cf0   "P"
CiteForge        #16a34a   "C"
StackShift I     #c8860a   "S1"
StackShift II    #e15b64   "S2"
Citation Grader  #0891b2   "G"
```

### Mockup's page-row version badge to replicate (`_final_design/wiki/wiki-mockup.html:100-105,221`)
```css
.badge-count{margin-left:auto;font-size:10px;color:var(--ink-faint);background:var(--paper);
  border:1px solid var(--line);border-radius:99px;padding:1px 6px;}
```
```html
<div class="page-row active">...Overview & Architecture<span class="badge-count">v2</span></div>
```
Real-token translation: `text-[#94A3B8] bg-[#F4F6FB] border border-[#E2E7F2]`.

### `localStorage` preference-hook pattern to copy (`src/hooks/use-pm-settings.ts`)
```ts
const STORAGE_KEY = "hub_pm_settings";
function readSettings(): PMSettings { try { ...JSON.parse(localStorage.getItem(STORAGE_KEY)) } catch { return DEFAULTS; } }
// useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot) + module-level cache/listeners
```
New hook: `STORAGE_KEY = "hub_wiki_space_order"`, snapshot type `WikiProduct[]`, default `WIKI_PRODUCTS.map(p => p.name)`.

### Drag-reorder pattern to copy (`src/components/programme/phase-builder.tsx`)
```tsx
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, arrayMove } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
// drag handle: GripVertical icon, "cursor-grab active:cursor-grabbing"
// onDragEnd: onChange(arrayMove(list, oldIndex, newIndex))
```

### Destructive-hover button precedent (`src/components/programme/phase-builder.tsx:102`)
```tsx
className="... hover:bg-[#FDE8E6] hover:text-[#C0392B]"
```

### `confirm()`-before-delete precedent (`src/app/(hub)/projects/_shared/_task-drawer.tsx:103`)
```tsx
onClick={() => { if (confirm("Delete this task and its subtasks?")) onDelete(task.id); }}
```

### Current PATCH version-bump logic to rework (`src/app/api/wiki/pages/[pageId]/route.ts:152-196`)
```ts
const isContentChange =
  (title !== undefined && title.trim() !== current.title) ||
  (contentHtml !== undefined && contentHtml !== current.content_html);
const nextVersion = isContentChange ? current.version + 1 : current.version;
// ... if (isContentChange) update.version = nextVersion; insert wiki_page_versions row
```
New: fetch `current.status` too; `const isPublishing = status === "published" && current.status !== "published";` drives `nextVersion`/`update.version`/the history insert instead of `isContentChange`. The history row still snapshots `updated.title`/`updated.content_html` (the row's current values after the update, whether or not this request changed them) — no different from today's insert shape, just gated on a different condition.

### `wiki_pages` cascade already in place (`supabase/migrations/149_wiki_pages.sql:25,47`)
```sql
parent_id uuid references wiki_pages(id) on delete cascade,   -- child pages
page_id uuid not null references wiki_pages(id) on delete cascade,  -- wiki_page_versions
```
Confirms `DELETE /api/wiki/pages/[pageId]` needs no manual cleanup of children or version rows.

## Implementation Steps

1. Widen the `product` check constraint in `149_wiki_pages.sql` to the 6 mockup values; update `src/types/database.ts`'s 3 matching literal unions.
2. Rewrite `src/types/wiki.ts`: `WikiProduct` as its own union, `WIKI_PRODUCTS` with mockup colors/badges, `WikiPageSummary.version` added.
3. Add `version` to the `GET /api/wiki/pages` list select/mapping and to the `[pageId]` route's sibling/related-pages select/mapping.
4. Rework `PATCH /api/wiki/pages/[pageId]` for publish-gated versioning; add the `DELETE` handler.
5. Build `use-wiki-space-order.ts`, then `_wiki-space-list.tsx` (drag-reorderable), then wire it into `_wiki-tree-panel.tsx` (replacing the inline space block) and give `PageRow`/search results the version badge (removing the draft pill).
6. Add the Delete button + tags input to `_wiki-doc-panel.tsx`; add the Owner row to `_wiki-info-panel.tsx`.
7. Wire `draftTags` and `deletePage()` through `_wiki-shell.tsx`, including the post-delete selection-fallback logic.
8. Re-check file lengths against `nextjs-file-length-best-practices.md` (soft warn ~250-300 lines) — `_wiki-tree-panel.tsx` and `_wiki-doc-panel.tsx` are the two most likely to grow; the space-list extraction in step 5 is specifically to keep the tree panel under that line.

## Acceptance Criteria

- [ ] Panel 1 lists exactly the 6 mockup spaces, in the mockup's order, with the mockup's colors/badge letters; a `client`/`marketing` session still can't reach any `/api/wiki/*` route or see the Wiki nav entry (unchanged from task 395).
- [ ] Dragging a space row reorders the list and the new order survives a page reload (same browser); a different browser/profile still sees the default mockup order (per-viewer `localStorage`, not shared).
- [ ] Every page row in the tree (and in search results) shows a `v{n}` badge instead of the old draft-only pill; the document canvas's status pill/dropdown and the info panel's Status row are unchanged.
- [ ] A Delete button appears beside Edit (view mode, write roles only); confirms before deleting; deleting a page with children removes the children too (cascade); the tree and selection update correctly afterward.
- [ ] The info panel shows an "Owner" row matching the page's creator.
- [ ] Editing a page's tags via the new input persists them (visible immediately in the info panel's tag chips after save).
- [ ] Saving content-only edits (title/body/tags) no longer changes the version number or adds a contributor; explicitly changing status to Published bumps the version and adds/refreshes the contributor list.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then browser-verify: all 6 spaces render/reorder-and-persist, page rows show v{n},
           # delete a page (with and without children), edit tags, confirm version only bumps on publish
```
No test runner is configured in this repo (per CLAUDE.md) — verification is TypeScript check + lint + manual browser acceptance. Migration 149 is still written, not applied — same caveat task 395/396 already carry; none of this task's browser verification can run live until it's applied.

## Compatibility Touchpoints

- Migration 149 must still be applied before any `/api/wiki/*` route works — this task's constraint widening is folded into that same not-yet-applied migration, so it doesn't add a second pending migration to track.
- No changes to `V2_ROUTES`, `v2-hub-sidebar.tsx`, or `department-map.ts`.
- No changes to `_docs/mcp-tools.md` — no new `server.registerTool(...)` call.
- Task 396's Import modal and 398's PDF-import route both call `POST /api/wiki/pages` and read `WIKI_PRODUCTS` for their own space `<select>` — both automatically pick up the 6-space list with no changes needed on their side (confirmed both already iterate `WIKI_PRODUCTS` rather than hardcoding the 4 names).

## Implementation Notes

### What Changed
- `WikiProduct` is now its own fixed 6-value union (`PipelineForge | PublishForge | CiteForge | StackShift I | StackShift II | Citation Grader`), no longer a `ProductName` alias; `WIKI_PRODUCTS` carries the mockup's own colors + explicit `badge` letters (PipelineForge/PublishForge both "P", matching the mockup exactly). Migration 149's `product` check constraint widened in place (still written, not applied — no live data affected). `database.ts`'s 3 matching literal unions updated.
- `WikiPageSummary` gained `version: number`, threaded through the list route (`GET`/`POST /api/wiki/pages`), the detail route's sibling/related-pages query, and `page.tsx`'s SSR mapping.
- Space switcher extracted into a new `_wiki-space-list.tsx` (drag-reorderable via `@dnd-kit`, same `DndContext`/`SortableContext`/`useSortable`/`arrayMove` pattern as `phase-builder.tsx`) and a new shared `_wiki-tree-panel-rows.tsx` (`buildTree`/`PageRow`, now used by both the tree panel and the space list) — kept out of `_wiki-tree-panel.tsx` to hold its line count down. Order persists per-browser via a new `use-wiki-space-order.ts` hook (`localStorage`, `useSyncExternalStore`, copied from `use-pm-settings.ts`'s pattern), available to every role (a display preference, not gated to `canWrite`).
- Every page-tree row (including search results) now shows a `v{n}` badge styled after the mockup's `.badge-count`; the old draft-only status pill is removed from rows. The document canvas's status pill/dropdown and the info panel's Status row are untouched, per the user's explicit choice.
- `PATCH /api/wiki/pages/[pageId]` reworked: version now bumps (and a `wiki_page_versions` row is inserted) only on a transition into `status: "published"`, not on every content-changing save. Content-only saves (title/body/tags) update those columns directly with no version/history side effect. Page creation still seeds `version: 1` + an initial history row, unchanged.
- New `DELETE /api/wiki/pages/[pageId]` — RLS-only permission (matches this route's existing GET/PATCH convention); child pages and `wiki_page_versions` rows cascade via their existing `on delete cascade` FKs, no manual cleanup code.
- Doc canvas: a Delete button now sits beside Edit (write roles, view mode), `confirm()`-gated with a child-count-aware message, destructive hover styled after `phase-builder.tsx`'s existing precedent. A comma-separated Tags input appears in edit mode (`_wiki-shell.tsx`'s `save()` parses it into `string[]` before PATCHing — the route already accepted `tags`, no API change needed there).
- Info panel gained an "Owner" row sourced from the existing `detail.createdBy` (already returned by `GET /api/wiki/pages/[pageId]`, already "defaults to creator" since `created_by` is set once at insert and never reassigned) — display-only wiring, no schema/API change.
- `_wiki-shell.tsx`: added `draftTags` state (synced from `detail.tags` on `enterEdit`, included in `save()`'s PATCH body) and a `deletePage()` handler (calls `DELETE`, optimistically drops the page + its direct children from local state, selects a fallback page in the same space or falls back to the empty state, then reconciles with `refreshPages()`).

### Files Changed
- `supabase/migrations/149_wiki_pages.sql` - widened `product` check constraint to the 6 mockup spaces (still written, not applied)
- `src/types/database.ts` - updated 3 `wiki_pages.product` literal unions to match
- `src/types/wiki.ts` - `WikiProduct` is now its own union; `WIKI_PRODUCTS` mockup colors/badges; `WikiPageSummary.version` added
- `src/app/api/wiki/pages/route.ts` - `version` added to `GET`'s summary select/mapping and `POST`'s create select
- `src/app/api/wiki/pages/[pageId]/route.ts` - `version` added to the sibling/related-pages query; `PATCH` reworked for publish-gated versioning; new `DELETE` handler
- `src/app/(hub)/kb/page.tsx` - `version` added to the SSR summary mapping
- `src/hooks/use-wiki-space-order.ts` - new `localStorage`-backed space-order preference hook
- `src/app/(hub)/kb/_wiki-tree-panel-rows.tsx` - new, extracted `buildTree`/`PageRow` (version badge replaces the draft pill), shared by the tree panel and the new space list
- `src/app/(hub)/kb/_wiki-space-list.tsx` - new, drag-reorderable space switcher
- `src/app/(hub)/kb/_wiki-tree-panel.tsx` - space block replaced with `<WikiSpaceList />`; search-result rows get the version badge
- `src/app/(hub)/kb/_wiki-doc-panel.tsx` - Delete button beside Edit; Tags input in edit mode; new props
- `src/app/(hub)/kb/_wiki-info-panel.tsx` - new "Owner" row
- `src/app/(hub)/kb/_wiki-shell.tsx` - `draftTags` state + `deletePage()` handler; new props threaded to `WikiDocPanel`

### Deviations From Plan
- **Minor:** the plan described threading space order "to `WikiTreePanel`" without specifying where the hook is called; implemented by calling `useWikiSpaceOrder()` directly inside `_wiki-tree-panel.tsx` rather than in `_wiki-shell.tsx` and passing it down — it's a self-contained client display concern with no shell-level state dependency, so there was no reason to add it to the shell's already-large prop-drilling surface. No behavior difference from what the plan intended.
- None else — scope matches the approved task document exactly, including the three audit-gap fixes (Owner, Tags UI, version-on-publish) the user selected.

### Verification Run
- `npx tsc --noEmit` - PASS (0 errors)
- `pnpm lint` - PASS (0 errors; 2 pre-existing unrelated warnings in `onboarding-workspace/_checklist-tab.tsx`, same ones task 395/396 already carried)
- Live dev server (already running from a prior session, with a connected browser tab) recompiled cleanly after the final edit landed (`✓ Compiled in ...ms`, no further errors); `curl /kb` returns `307` (redirect to `/auth/login`, no server crash) both before and after. Mid-edit-sequence Fast Refresh errors appeared transiently in that connected tab (`WIKI_PRODUCTS is not defined`) between the moment the old inline space-block was removed and `WikiSpaceList` was wired in — expected transient HMR noise during a multi-step edit to a single file, not a defect in the final state; confirmed clean afterward.
- Full authenticated browser acceptance (drag-reorder persists, version badges render, Delete + cascade, Owner row, Tags edit/persist, version bumps only on publish) NOT RUN — migration 149 is still written, not applied, so `wiki_pages` doesn't exist in the connected database yet; same carried-forward caveat as tasks 395/396/398.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Full re-read of all 13 changed files (migration, `database.ts`, `wiki.ts`, both API routes, `page.tsx`, the new hook, the two new tree/space-list files, the tree panel, doc panel, info panel, shell) against the standards checklist (unused code, untyped escapes, deep nesting, naming, error handling, secrets/logging, repeated logic, project conventions).
- No blocking issues. Error handling in the new `DELETE` handler matches the existing `GET`/`PATCH` try/catch + logged `console.error` + JSON error response convention in the same file exactly. No secrets, credentials, or debug logging in any changed file. No new `any`/untyped escapes. `_wiki-tree-panel-rows.tsx` extraction removes what would otherwise have been duplicated `buildTree`/`PageRow` logic between the tree panel and the new space list — a repetition-avoidance the plan didn't spell out at that level of detail but that directly serves the plan's own "keep dnd-kit wiring out of the tree panel" intent.
- Two small maintainability issues found and fixed during this pass (see Deviations) — neither changed behavior, scope, or the approved architecture.

### Deviations
- **Minor (fixed):** `WikiPageDetail` still declared its own `version: number` field after this task added `version` to `WikiPageSummary` (which `WikiPageDetail` extends) — a redundant duplicate declaration, harmless to TypeScript but dead weight. Removed the duplicate from `WikiPageDetail`; `tsc --noEmit` re-confirmed clean.
- **Minor (fixed):** migration 149's own header comment for `wiki_page_versions` still read "one row per content-changing PATCH," which described the pre-task-399 behavior this task explicitly changed. Updated the comment to describe the actual publish-gated behavior, so the migration file doesn't silently drift out of sync with what it now does.
- **Minor (documented, not changed):** `DELETE /api/wiki/pages/[pageId]` doesn't distinguish "deleted" from "already gone / RLS-filtered" — a delete of a nonexistent or inaccessible id still returns `200 { id }` rather than `404`, since Supabase's `.delete()` doesn't error on zero affected rows. This matches the shallow-existence-check posture already accepted throughout this route file (`GET`/`PATCH` are the only handlers here that check existence, and only because they need the row's current data first) — not a new gap introduced by this task, and the UI never surfaces a stale-id delete path today (the button only ever fires on the page currently open in the detail panel).
- **Minor (documented, not changed):** the optimistic local-state update in `deletePage()` (`_wiki-shell.tsx`) removes only the deleted page's direct children from the in-memory `pages` array, not deeper descendants (grandchildren etc.), which the DB cascade-deletes correctly. The immediately-following `refreshPages()` reconciles this within one round trip, so the only user-visible effect is a possible one-frame flash of an orphaned grandchild row before the refresh resolves — judged not worth a recursive local-tree walk for a state that self-corrects immediately.
- Everything else matches the approved task document exactly: all three user-selected audit-gap fixes (Owner, Tags UI, version-on-publish) are implemented; Out of Scope boundaries (RTE, Import, Export, PDF pipeline, page-level drag-reorder) are untouched; file lengths stay well under the repo's guidance (largest changed file is 274 lines).

## Follow-Up Fixes (post-test, live-data feedback)

Live testing (post-migration-apply) surfaced that the Owner row's raw `full_name` text value was wrapping into an ugly two-line block in the 236px info panel (a long/combined name string, e.g. "Danessa helpdesk@webriq.us"). User asked to show an avatar + tooltip instead, and to add the same avatar prefix to the doc canvas's "Edited by …" line.

- New `src/app/(hub)/kb/_wiki-avatar.tsx` — extracted the avatar-color-hash + initials logic (previously inline in `_wiki-info-panel.tsx`) into a shared `WikiAvatar` component (`size: "sm" | "md"`, optional `overlap` for the Contributors stack's overlapping-circle layout), with the same native-`title`-attribute tooltip convention the Contributors stack already used.
- `_wiki-info-panel.tsx` — Owner row now renders `<WikiAvatar contributor={detail.createdBy} />` (falls back to "Unassigned" text when there's no creator) instead of the raw name string; Contributors stack refactored to use the same shared component (removes the now-duplicate local `ContributorAvatar`/`avatarColorFor`/`initialsFor`).
- `_wiki-doc-panel.tsx` — the "Edited by {name}" meta-row line now shows a small (`size="sm"`) avatar before the text.
- `npx tsc --noEmit` + `pnpm lint` PASS (0 errors; same 2 pre-existing unrelated warnings). File lengths: `_wiki-avatar.tsx` 49 lines, `_wiki-info-panel.tsx` 117 lines, `_wiki-doc-panel.tsx` 246 lines — all well under guidance.

### Follow-up: Delete confirmation uses the shared ConfirmDialog, not window.confirm()

User asked to match the "existing confirmation dialog on the other features" for better UX. This repo has exactly that: `src/components/ui/confirm-dialog.tsx`'s `ConfirmDialog` (task 230/231), already used for delete-with-children flows in `onboarding-workspace/_files-tab.tsx` (its `deleteDialogCopy` builds a title + a body naming sub-folder/file counts) and for project delete in `_delete-project-menu-item.tsx` (local `confirmOpen` state, `confirmLabel={deleting ? "Deleting…" : "Delete"}`, closes the dialog only after the delete call actually succeeds). Matched both conventions:

- `_wiki-shell.tsx`'s `deletePage()` is now `async (): Promise<boolean>`, wrapped in a `deletingPage` state (guards against a double-click firing two deletes, mirrors `useDeleteProject`'s `deleting` flag) — returns `true` only on a successful `res.ok`, `false` otherwise, so the caller knows whether to close the dialog.
- `_wiki-doc-panel.tsx`: the Delete button now opens a local `deleteConfirmOpen` state instead of calling `window.confirm()` directly; renders `<ConfirmDialog>` with title `"Delete page?"` and a body that names the page title and, when present, the sub-page count — same phrasing pattern as `_files-tab.tsx`'s folder-delete copy ("This will permanently delete "X" and its N sub-page(s)."). `confirmLabel`/`confirmDisabled` reflect the in-flight `deleting` prop; the dialog only closes when `onDelete()` resolves `true`, so a failed delete leaves it open for the user to retry or cancel — matching `_delete-project-menu-item.tsx`'s `handleConfirm` exactly.
- `npx tsc --noEmit` + `pnpm lint` PASS (0 errors; same 2 pre-existing unrelated warnings). `_wiki-doc-panel.tsx` is now 264 lines — still well under the file-length guidance.
