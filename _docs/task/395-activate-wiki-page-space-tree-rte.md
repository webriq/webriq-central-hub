# 395: Activate Wiki Page/Tab — Space & Page Tree, RTE-Backed Pages, Design System v2.0 Styling

**Created:** 2026-09-23
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

`(hub)/kb/page.tsx` is currently a one-line stub (`"v2 · LLM Wiki · Sprint 1C"`) behind an already-wired, non-stub sidebar entry (`Wiki` → `V2_ROUTES.KB` = `/kb`, in `v2-hub-sidebar.tsx`'s Knowledge group). This task brings it to life as a real, DB-backed internal wiki: a three-pane layout (space/page tree → document canvas → contextual info rail) modeled structurally on `_final_design/wiki/wiki-mockup.html`, restyled with this app's real Design System v2.0 tokens (`_final_design/guide/central-hub-design-system.md`) instead of the mockup's own standalone `--paper`/`--navy-900` preview palette, and backed by new `wiki_pages` / `wiki_page_versions` tables with a Tiptap RTE for authoring — reusing the same Tiptap pattern (StarterKit + Placeholder + Image, paste/drop image upload) already established in `_note-rich-text-editor.tsx` and `_task-description-editor.tsx`.

Two scope decisions were confirmed with the user before planning:
1. **Full DB-backed CRUD**, not a static/mock UI shell — pages are created, edited (via the RTE), saved and published for real. Import (.docx/.md/.pdf → page) and Export (PDF/Word) stay out of scope — no document-conversion library exists in this codebase — but Export → HTML is cheap to make genuinely functional (a client-side Blob download, no new dependency) so it's kept working. The mockup's `claude.use("downloads")` call is an Artifact-sandbox-only API and cannot ship in the real app; it must be replaced.
2. **Spaces are derived from the existing product catalog**, not independently admin-managed. The mockup's sidebar list (PipelineForge / PublishForge / CiteForge / StackShift I / StackShift II / Citation Grader) doesn't match any single existing enum in this codebase — `CLASSIFICATIONS` (`src/config/customer-phases.ts`) is project-engagement tracks, not product identity, and "Citation Grader" doesn't exist anywhere in `src`. The actual product catalog is `ProductName` in `src/types/hub.ts` (`StackShift | PublishForge | PipelineForge | CiteForge`, 4 values), already used for per-product coloring in `src/components/onboarding/product-selector.tsx`. Wiki spaces = those 4 products, one per space, no separate space CRUD UI.

## Requirements

- [ ] New Supabase tables `wiki_pages` (nested via `parent_id`, one `product` per page = its space, `status` draft/published/archived, `content_html`, `version`, `sort_order`, `tags`) and `wiki_page_versions` (append-only history row per save, powers the "Contributors" + version count in the info rail). RLS via the existing `get_my_role()` helper — **read**: `admin, super_admin, pm, developer, hr` (matches `department-map.ts`'s existing HR→`/kb` allowlist); **write** (create/update/insert version): `admin, super_admin, pm, developer` (matches the existing description-image-upload role-check precedent, e.g. `src/app/api/projects/[projectId]/notes/description-images/route.ts:26`). No role widens this to `client`/`marketing` — Wiki is internal-only, same posture as Project Notes.
- [ ] `GET/POST /api/wiki/pages` — list the full page tree (lightweight columns only: id, product, parent_id, title, status, sort_order, updated_at) for the sidebar tree; create a page (title, product, optional parent_id).
- [ ] `GET/PATCH /api/wiki/pages/[pageId]` — full page detail (content_html, version, tags, contributor list resolved from `wiki_page_versions` + `profiles`, sibling pages for "Related"); update title/content_html/status/tags — on every content-changing PATCH, insert a `wiki_page_versions` row and bump `version`.
- [ ] `POST /api/wiki/pages/[pageId]/description-images` — paste/drop image upload for the RTE, mirroring `notes/description-images/route.ts` exactly (same `task-content` bucket, `wiki/<pageId>/` prefix, same MIME/size limits, same role check).
- [ ] Three-pane `/kb` UI, structure/placement lifted from the mockup, restyled to real tokens (`--bg:#F4F6FB`, `--surface:#FFFFFF`, `--line:#E2E7F2`, `--ink:#0B1533`, `--body:#3A4565`, `--muted:#5F6A88`, `--blue:#007BFF`, `--orange:#FB914E` per the design system doc) — **not** the mockup's own navy/paper preview `:root` vars, and **not** the app rail/topbar (those are the real, already-existing `V2HubShell`/`V2HubSidebar`/`V2HubHeader` — only the content area inside them is new):
  - **Panel 1** — space switcher (4 product spaces, colored swatch per product reusing `product-selector.tsx`'s established per-product colors: StackShift `#3358F4`, PublishForge `#7C3AED`, PipelineForge `#F97316`, CiteForge `#0EA5E9`) + collapsible nested page tree + search-filter + "New page" (functional) + "Import" (disabled, "Soon" — see scope note above).
  - **Panel 2** — document canvas: status pill (draft=amber/`--warn`, published=green/`--ok`, archived=neutral/`--line-soft`, per the design system's Chip convention), title, meta row (edited-by, updated date, version, tags), Tiptap-rendered body in read mode, Tiptap editor in edit mode, Save/Cancel, Export ▾ (HTML only, functional; PDF/Word/Markdown disabled/"Soon").
  - **Panel 3** — On This Page TOC (parsed from the page's own `h2`/`h3`s, scroll-to on click), Page Info (status/version/updated), Contributors (avatar stack from distinct `wiki_page_versions.edited_by`, 6-color rotation per the design system's Avatars convention), Related Pages (siblings under the same parent/space).
- [ ] RTE: new page-scoped Tiptap component (StarterKit + Placeholder + Image, same paste/drop-upload pattern as the two precedents above), **not** imported from `projects/_shared/_notes/` — this codebase's own precedent (`_task-description-editor.tsx`'s header comment, task 202) is to rebuild per feature area rather than reach across route groups; toolbar needs Bold/Italic/Underline/Strike/H2/H3/Bullet/Numbered/Blockquote/Code block/Image, all covered by `StarterKit` + `Image` with no new `@tiptap/extension-*` packages.
- [ ] File-length discipline per `nextjs-file-length-best-practices.md` — split panels into separate colocated files under `(hub)/kb/`, none should approach the 400–500 hard-limit guidance (see Proposed File Changes for the split).
- [ ] Run `/frontend-design` and `/impeccable` (impeccable skill) during implementation for a final visual/UX polish pass, per explicit user instruction — especially on the tree's active/hover states, the status pill treatment, and the editor toolbar.

## Out of Scope / Must-Not-Change

- Import (.docx/.md/.pdf → page) and Export as PDF/Word/Markdown — no doc-conversion library in this codebase; ship the buttons visually (matches mockup placement) but disabled with a "Soon" affordance, same visual language as the sidebar's existing `item.stub` "soon" pill.
- Drag-to-reorder in the page tree (the mockup's Panel 1 annotation calls this out) — `sort_order` column exists so a future task can add it with `@dnd-kit` (already a dependency) without another migration, but no drag UI ships here.
- Full page-history diff view or a flat version list UI — the mockup itself leaves this as an "Open question" (its own doc body says so); this task only stores versions and shows a count, not a browsable history.
- A separate space CRUD UI (create/rename/archive spaces) — confirmed with the user: spaces are the fixed 4-entry `ProductName` catalog for v1.
- Any change to `V2_ROUTES.KB`, `v2-hub-sidebar.tsx`'s Knowledge group, or `department-map.ts` — the Wiki nav entry and HR's route allowlist already exist and are correct; do not touch them.
- Wiring the topbar's "Ask anything" search bar into wiki content — that's existing, unrelated global chrome (`V2HubHeader`), out of scope here.
- `kb_articles` / `kb_entries` / `kb_corrections` tables — these are unrelated pre-existing features (imported Zoho Desk KB articles, and LLM-orchestration knowledge-base entries respectively). Do not reuse, rename, or extend them; new tables are `wiki_pages` / `wiki_page_versions`.
- Dark mode / `isDark` prop — the current v2.0 redesign precedent is **fixed-light** (see `_listing-shell.tsx`'s comment: the only UI that ever wrote the `theme` setting was retired in task 255, and CLAUDE.md's older `isDark`-prop guidance is superseded for new pages). Build Wiki fixed-light with hardcoded design-system hex values, not an `isDark` prop or `dark:` classes.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/149_wiki_pages.sql` | Create | `wiki_pages` + `wiki_page_versions` tables, indexes, `update_updated_at_column()` trigger reuse, RLS via `get_my_role()`. **Written, not applied** — matches this repo's established migration convention (task 366/377/378/etc.); note in the handoff that `supabase db push` still needs to run. |
| `src/types/wiki.ts` | Create | `WikiProduct` (alias of `ProductName`), `WikiPageSummary`, `WikiPageDetail`, `WikiPageVersion`, `WikiStatus` types + the local product-color map (mirrors `product-selector.tsx`'s consts — not imported, per the decoupling precedent). |
| `src/app/api/wiki/pages/route.ts` | Create | `GET` (full lightweight tree) + `POST` (create page). |
| `src/app/api/wiki/pages/[pageId]/route.ts` | Create | `GET` (full detail + contributors + siblings) + `PATCH` (update, writes a version row) . |
| `src/app/api/wiki/pages/[pageId]/description-images/route.ts` | Create | RTE paste/drop image upload, mirrors `src/app/api/projects/[projectId]/notes/description-images/route.ts`. |
| `src/app/(hub)/kb/page.tsx` | Modify | Replace the stub. Server component: role/auth already enforced by `(hub)/layout.tsx`; resolves `?space=`/`?page=` search params, does the initial SSR fetch of the tree + selected page, renders `<WikiShell />`. |
| `src/app/(hub)/kb/_wiki-shell.tsx` | Create | Client orchestrator — 3-pane flex layout, selected space/page state synced to the URL via `router.replace` (Files-tab-deep-link precedent, task 359), edit/view mode, fetch-on-select, owns the New Page modal's open state. |
| `src/app/(hub)/kb/_wiki-tree-panel.tsx` | Create | Panel 1 — space switcher, collapsible nested page tree (recursive row component), client-side search filter, New Page trigger, disabled Import affordance. |
| `src/app/(hub)/kb/_wiki-doc-panel.tsx` | Create | Panel 2 — status pill, title, meta row, read/edit mode swap, Save/Cancel, Export ▾ menu (HTML functional, others disabled). |
| `src/app/(hub)/kb/_wiki-rte.tsx` | Create | The Tiptap editor + toolbar, page-scoped, posts images to the new description-images route. |
| `src/app/(hub)/kb/_wiki-info-panel.tsx` | Create | Panel 3 — TOC (parsed from rendered headings), Page Info, Contributors avatar stack, Related Pages. |
| `src/app/(hub)/kb/_wiki-new-page-modal.tsx` | Create | Create-page modal — title + space + optional parent, plain controlled form + `fetch`, matches the Add Asset modal convention (no `react-hook-form`). |
| `src/app/(hub)/kb/_wiki-empty-state.tsx` | Create | No-space-selected / no-pages-yet empty state — icon + message + primary action, per this repo's UI Polish Conventions. |

## Code Context

### Mockup structure to preserve (placement only, not its color tokens)
`_final_design/wiki/wiki-mockup.html` — three `.wiki` children: `.panel-tree` (264px fixed), `.panel-doc` (flex, 760px max content width), `.panel-info` (236px fixed). Its own `:root` (`--navy-950`, `--paper`, `--annot-*`, etc.) is a standalone preview palette for the mockup file itself — do not port those hex values. Its `.legend`/`.annot` dev-handoff overlay and the entire fake `.rail`/`.topbar` block (lines 162–200) are not part of the deliverable — the real app already renders that chrome.

### Real design tokens to use instead (`_final_design/guide/central-hub-design-system.md`)
```
--bg:#F4F6FB  --surface:#FFFFFF  --line:#E2E7F2  --line-soft:#EDF0F7
--ink:#0B1533  --body:#3A4565  --muted:#5F6A88
--blue:#007BFF  --blue-700:#0063D6  --blue-100:#E5F1FF  --blue-50:#F0F7FF
--orange:#FB914E  --orange-600:#E2762F
--ok:#177E48/--ok-bg:#E3F5EA   --warn:#8A5A00/--warn-bg:#FFF3D6   --late:#C0392B/--late-bg:#FDE8E6
radius: chips 7px, inputs 10px, panels 14px, buttons/pills 999px
avatars: 6-color rotation #0063D6 #6A48E0 #0B8A93 #B85512 #177E48 #44508A, assigned per person, stable
```
This app hardcodes these as literal hex in `className`/inline style (no `bg-background`/`dark:` tokens in `src/app/v2`, per CLAUDE.md's "Rejected/superseded" UI convention) — match that, don't introduce CSS variables.

### Product catalog + colors to reuse for spaces (`src/components/onboarding/product-selector.tsx`)
```ts
const PRODUCTS: { name: ProductName; label: string; description: string }[] = [
  { name: "StackShift",    label: "StackShift",    description: "Headless CMS & website platform" },
  { name: "PublishForge",  label: "PublishForge",  description: "Content publishing & blog management" },
  { name: "PipelineForge", label: "PipelineForge", description: "Sales pipeline & outreach automation" },
  { name: "CiteForge",     label: "CiteForge",     description: "AI citation & brand visibility tracking" },
];
// StackShift #3358F4 · PublishForge #7C3AED · PipelineForge #F97316 · CiteForge #0EA5E9
```
`ProductName` type lives at `src/types/hub.ts:96-100`.

### RTE precedent to follow (paste/drop upload + toolbar shape) — `src/app/(hub)/projects/_shared/_notes/_note-rich-text-editor.tsx`
```tsx
const editor = useEditor({
  extensions: [StarterKit, Placeholder.configure({ placeholder: "Take a note…" }), Image],
  content: value,
  immediatelyRender: false,
  editable: !readOnly,
  editorProps: {
    attributes: { class: cn("outline-none text-[13px] ...") },
    handlePaste(_view, event) { /* image → uploadAndInsertImage() */ },
    handleDrop(_view, event) { /* same */ },
  },
  onUpdate: ({ editor: e }) => { onChange(e.getHTML()); onEmptyChange(e.isEmpty); },
});
```
`_task-description-editor.tsx`'s header comment explicitly documents the "rebuild per feature area, don't import across route groups" precedent (task 202) — the new `_wiki-rte.tsx` should follow the same rule, not import either existing editor.

### Image upload route to mirror — `src/app/api/projects/[projectId]/notes/description-images/route.ts`
```ts
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
// role check:
const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
if (!profile || !["admin", "super_admin", "pm", "developer"].includes(profile.role)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
// upload target: supabase.storage.from("task-content").upload(`notes/${projectId}/${timestamp}_${safeFilename}`, ...)
```
Wiki's version uses the same bucket (`task-content`) under a `wiki/<pageId>/` prefix instead of `notes/<projectId>/` — no new bucket/migration needed for storage.

### RLS helper to call, not reimplement — `get_my_role()` (migration 026), used e.g. in migration 059
```sql
create policy ... using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer', 'hr'));
create policy ... using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'))
                with check (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));
```
Real `profiles.role` enum (confirmed via migration 047 + `database.ts`): `admin | hr | pm | developer | client | super_admin | marketing` — CLAUDE.md's 5-value description is stale, don't follow it literally; follow the enum above.

### `updated_at` trigger to reuse, not reinvent — `update_updated_at_column()` (migration 001)
```sql
create trigger set_updated_at_wiki_pages
  before update on wiki_pages
  for each row execute function update_updated_at_column();
```

### Fixed-light precedent (why no `isDark` prop) — `src/app/(hub)/projects/_listing-shell.tsx:15-19`
```
// Fixed-light — was previously isDark-aware via usePMSettings' `theme` setting, but the only UI
// that ever wrote that setting lived in the pre-migration hub's Settings tab, retired (moved to
// the unrouted `_hub_(OLD)`) by task 255. ... Matches the PM dashboard's existing "fixed-light"
// precedent for the v2.0 redesign.
```

### Current stub to replace — `src/app/(hub)/kb/page.tsx`
```tsx
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Knowledge Base" };
export default function KbPage() {
  return (
    <div className="py-6.5 px-8">
      <p className="text-sm text-muted-foreground">v2 · LLM Wiki · Sprint 1C</p>
    </div>
  );
}
```

### Sidebar entry already wired, no change needed — `src/app/(hub)/_components/v2-hub-sidebar.tsx:104-106`
```tsx
const knowledgeItems: NavItem[] = [
  { label: "Wiki", icon: <BookOpen size={18} />, href: V2_ROUTES.KB },
];
```

## Implementation Steps

1. Write migration `149_wiki_pages.sql` (tables, indexes, trigger, RLS policies per above). Leave unapplied per this repo's convention — note it in the handoff/TASKS.md entry.
2. Add `src/types/wiki.ts`.
3. Build the three API routes (`/api/wiki/pages`, `/api/wiki/pages/[pageId]`, `/api/wiki/pages/[pageId]/description-images`), each gated by the role checks above, each paginating with `.range()` if the tree query could plausibly exceed 1000 rows (unlikely for a v1 wiki, but follow the repo's established pagination rule regardless).
4. Build `_wiki-rte.tsx` first (self-contained), then `_wiki-doc-panel.tsx` around it, then `_wiki-tree-panel.tsx` and `_wiki-info-panel.tsx`, then `_wiki-new-page-modal.tsx` and `_wiki-empty-state.tsx`, then wire them all from `_wiki-shell.tsx`.
5. Replace `kb/page.tsx` with the SSR-fetching server component that renders `<WikiShell />`.
6. Run `/frontend-design` and `/impeccable` against the new `/kb` pages for a polish pass (hover states, spacing, the status-pill/chip treatment, toolbar icon alignment) per the user's explicit request.
7. Verify every new file against `nextjs-file-length-best-practices.md`'s soft-warn/hard-limit guidance; split further if any file is pushing 300+ lines with real complexity (not just markup).

## Acceptance Criteria

- [ ] `/kb` renders the real three-pane Wiki inside the existing app chrome (sidebar/topbar unchanged) — no more stub text.
- [ ] The 4 product spaces (StackShift, PublishForge, PipelineForge, CiteForge) list in Panel 1 with their established colors; each space expands to its own nested page tree.
- [ ] Creating a page (New Page modal) persists to `wiki_pages` and immediately appears in the tree, selected.
- [ ] Editing a page's title/body via the Tiptap RTE and saving persists `content_html`, bumps `version`, inserts a `wiki_page_versions` row, and updates the visible "Updated" date/version chip.
- [ ] Pasting/dragging an image into the RTE uploads it and inserts it inline, same UX as the Notes/Task description editors.
- [ ] Panel 3 shows an accurate TOC for the current page's headings, the correct version/status, a contributor avatar stack matching `wiki_page_versions.edited_by`, and related (sibling) pages.
- [ ] Status pill correctly reflects/edits draft → published → archived; archived pages are visually distinct and excluded from the default tree view (or shown de-emphasized — implementer's call, document whichever is chosen).
- [ ] A `client` or `marketing`-role session cannot read or write any `/api/wiki/*` route (403) and has no Wiki entry in their sidebar (already true via `department-map.ts`/role filtering — verify it still holds).
- [ ] Export → HTML on a real page downloads a working standalone `.html` file client-side (no `claude.use` call anywhere in the shipped code). Export PDF/Word/Markdown and Import are visibly present but disabled/"Soon", matching the mockup's placement.
- [ ] No file under `(hub)/kb/` is a single monolithic component — panels are split per the file plan above.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then browser-verify: create a page, edit+save it, upload a pasted image, switch spaces, check TOC/contributors/related, confirm a non-staff role is blocked
```

No test runner is configured in this repo (per CLAUDE.md) — verification is TypeScript check + lint + manual browser acceptance.

## Compatibility Touchpoints

- No changes to `_docs/mcp-tools.md` — no new `server.registerTool(...)` call is part of this task.
- No changes to `V2_ROUTES`, `v2-hub-sidebar.tsx`, or `department-map.ts` — the Wiki nav entry and HR's `/kb` allowlist already exist and already point at the right route.
- New Storage usage is additive (`wiki/` prefix inside the existing `task-content` bucket) — no bucket policy/migration change needed beyond what already exists for that bucket.
- Migration `149` must be applied (`supabase db push` or equivalent) before any of the new API routes will work — until then they'll error the same way every other "written, not applied" migration in this repo does.

## Implementation Notes

### What Changed
- New `wiki_pages` / `wiki_page_versions` tables (migration 149) with RLS via `get_my_role()`, staff-wide read (`admin, super_admin, pm, developer, hr`) / narrower write (`admin, super_admin, pm, developer`), matching the migration-059/description-image-upload precedents.
- Manually added `wiki_pages` / `wiki_page_versions` entries to `src/types/database.ts`'s `Database` type, matching this repo's established convention of adding manual type entries for "written, not applied" migrations (e.g. `departments`, `stackshift_orders`).
- New `src/types/wiki.ts` — `WikiProduct` (alias of the existing 4-value `ProductName`, not a new enum), `WikiStatus`, `WikiPageSummary`/`WikiPageDetail`/`WikiContributor`, and a local `WIKI_PRODUCTS` color map (StackShift/PublishForge/PipelineForge/CiteForge, colors copied from `product-selector.tsx`'s existing per-product assignment rather than imported, per this repo's decoupling precedent).
- Three new API route files under `/api/wiki/pages` (list+create, get+update, image upload) — `wiki_pages`/`wiki_page_versions` reads/writes rely entirely on RLS (no manual role check in-route, matching the Notes routes' convention); the image-upload route keeps an explicit role check since Storage isn't RLS-governed the same way, mirroring `notes/description-images/route.ts` exactly (same bucket, same MIME/size limits) under a `wiki/<pageId>/` prefix instead of `notes/<projectId>/`.
- Real `/kb` UI: `page.tsx` (SSR role + initial lightweight tree + resolved `?space=`/`?page=` selection) rendering a client `WikiShell` orchestrator, which composes `WikiTreePanel` (space switcher + nested page tree + search), `WikiDocPanel` (status pill/dropdown, title, meta, read/edit toggle, Export ▾), `WikiRte` (Tiptap StarterKit+Placeholder+Image, extended toolbar for H2/H3/bullet/numbered/blockquote/code block, paste/drop image upload), `WikiInfoPanel` (TOC parsed from rendered headings, page info, contributor avatar stack, related pages), `WikiNewPageModal`, and `WikiEmptyState`. Structure/placement follows `wiki-mockup.html`'s three-pane layout; all colors/typography use the real Design System v2.0 tokens (`central-hub-design-system.md`) instead of the mockup's own standalone preview palette.
- Export → HTML is a real client-side `Blob` download (no `claude.use` call anywhere in the shipped code, per the plan). Export PDF/Word/Markdown and Import render visibly but disabled/"Soon", matching the mockup's placement.
- Discovered mid-implementation and fixed: the shared `<main>` in `v2-hub-shell.tsx` already has its own `overflow-y-auto` with no fixed height, so the 3-pane layout needed `h-full flex overflow-hidden` on `WikiShell`'s root (reclaiming a bounded height so each panel scrolls independently) rather than the plan's originally-implied `flex-1` — same pattern already established by the Ticket Detail page's `h-full overflow-y-auto`.

### Files Changed
- `supabase/migrations/149_wiki_pages.sql` - new tables + RLS (written, not applied)
- `src/types/database.ts` - added `wiki_pages`/`wiki_page_versions` to the `Database` type
- `src/types/wiki.ts` - new domain types + product color map
- `src/app/api/wiki/pages/route.ts` - list tree (GET) + create page (POST)
- `src/app/api/wiki/pages/[pageId]/route.ts` - full detail (GET) + update/version (PATCH)
- `src/app/api/wiki/pages/[pageId]/description-images/route.ts` - RTE image upload
- `src/app/(hub)/kb/page.tsx` - replaced the stub with the real SSR entry point
- `src/app/(hub)/kb/_wiki-shell.tsx` - new client orchestrator
- `src/app/(hub)/kb/_wiki-tree-panel.tsx` - new Panel 1
- `src/app/(hub)/kb/_wiki-doc-panel.tsx` - new Panel 2
- `src/app/(hub)/kb/_wiki-rte.tsx` - new Tiptap editor
- `src/app/(hub)/kb/_wiki-info-panel.tsx` - new Panel 3
- `src/app/(hub)/kb/_wiki-new-page-modal.tsx` - new create-page modal
- `src/app/(hub)/kb/_wiki-empty-state.tsx` - new empty state

### Deviations From Plan
- None beyond the `h-full overflow-hidden` shell-height fix noted above, which is an implementation detail of "make the 3-pane layout actually scroll independently" rather than a scope change.
- Drag-to-reorder, PDF/Word/Markdown export, and Import remain out of scope exactly as planned.

### Verification Run
- `npx tsc --noEmit` - PASS (0 errors)
- `pnpm lint` - PASS (0 errors; 2 pre-existing unrelated warnings in `onboarding-workspace/_checklist-tab.tsx`)
- `pnpm dev` + `curl /kb` - PASS for compile/boot (307 redirect to `/auth/login`, no server error, confirming the route compiles and runs) — SKIPPED for full authenticated interaction: no live browser session and **migration 149 is written, not applied**, so `wiki_pages` doesn't exist in the connected database yet. Every read/write degrades gracefully (empty tree, JSON 500 with a logged error) rather than crashing, but real create/edit/save/image-upload/RLS-role behavior needs migration 149 applied first, then a browser pass (create a page, edit+save, paste an image, switch spaces, check TOC/contributors/related, confirm a non-staff role is blocked).

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. Full re-read of all 14 new/modified files against the standards checklist (unused code, `any`/untyped escapes, deep nesting, naming, error handling, secrets/logging, repeated logic).
- Four small maintainability issues found and fixed during this pass (see Deviations) — none changed behavior, scope, or the approved architecture.
- Error handling is consistent across all three API routes (try/catch + logged `console.error` + JSON error response; RLS is the actual permission boundary for `wiki_pages`/`wiki_page_versions`, an explicit role check only where Storage isn't RLS-governed, matching the `notes/description-images` precedent exactly).
- No secrets, credentials, or debug logging in any new file.

### Deviations
- **Minor (fixed):** `PATCH /api/wiki/pages/[pageId]` was building and returning a fully-hydrated `WikiPageDetail` (with `toContributor()` calls and the `DETAIL_SELECT` profile joins) that its only caller (`WikiShell.save()`/`changeStatus()`) discards — it only checks `res.ok` and always re-fetches via GET afterwards. Simplified to a minimal `select("id, title, content_html, version")` and a `{id, version}` response; removed the always-wrong hardcoded `contributors: []`/`relatedPages: []` placeholders this had produced.
- **Minor (fixed):** an unnecessary `as { id: string; full_name: string | null } | null` type-assertion escape hatch on the `wiki_page_versions` → `profiles` embedded-select row. Confirmed by removing it and re-running `tsc` that Supabase's query builder already infers the correct shape from the manually-declared `Relationships` in `database.ts` — no cast needed.
- **Minor (fixed):** an attached-but-never-read `useRef<HTMLButtonElement>` on the Export button in `_wiki-doc-panel.tsx` (dead code left over from an earlier JS-positioned-dropdown approach that was replaced by pure CSS `absolute` positioning). Removed the ref and its import.
- **Minor (fixed):** `pages.some((p) => p.product === selectedProduct)` was computed twice in `WikiShell`'s empty-state branch (title and message). Extracted to a single `hasPagesInSpace` local.
- **Minor (documented, not changed):** `POST /api/wiki/pages` returns a generic `500` if `product` fails the DB's `check` constraint rather than a clearer `400` — unreachable through the actual UI (`WikiNewPageModal`'s `<select>` only offers the 4 valid values), so left as-is rather than adding server-side enum validation that duplicates the DB constraint for a path nothing can currently hit.
- **Minor (documented, not changed):** the design-quality hook repeatedly flagged colors/fonts (Arial, `#0f172a`, etc.) inside `_wiki-doc-panel.tsx`'s `downloadHtml()` template literal, and several `text-[12px]`/`text-[12.5px]` button-label sizes across the new files. The former is the standalone exported `.html` file's own inline styling, deliberately decoupled from the app's `DESIGN.md` since it must render without the app's fonts/CSS (mirrors the original mockup's own export script). The latter matches `central-hub-design-system.md`'s own documented button sizing ("default 8px 15px / 12px") — the hook doesn't map literal px values back to that component-level spec. Both are intentional, not drift.
