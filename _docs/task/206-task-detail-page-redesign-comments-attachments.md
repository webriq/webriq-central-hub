# 206: Task Detail Page — Design System v2.0 Redesign, HTML Description Rendering, Comments, Attachments Viewer (Remove Subtasks/Labels)

**Created:** 2026-08-04
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

`/v2/projects/[projectId]/tasks/[taskId]` (`_task-detail.tsx`) is still the functional-MVP version flagged by task 193 and never restyled by task 194 (task 194 remains `Status: Planned`, unimplemented). It uses a generic `slate-*` palette (`Card`/`Meta` helpers, `rounded-xl border-slate-200`), a plain `<textarea>` for the description (so Zoho-imported/rich-text HTML like `<div>Troubleshoot and resolve issues quickly.<br /></div>` renders as raw markup instead of formatted text), Labels and Subtasks cards, and no way to view comments or the file attachments task 205 just added upload support for (`attachments` table, `entity_type: "task"` — write-only today, "no viewer UI exists yet" per that task's own Decision #5).

This task **supersedes task 194's Task-Detail scope** (its Requirements A/B/C — title-entity-decoding, HTML description rendering, v2.0 retoning of `_task-detail.tsx`) with a superset: same fixes, plus removing Labels/Subtasks and adding Comments + an Attachments viewer. Task 194's Requirement D (`_issue-detail.tsx`) is untouched and stays open separately — issue detail is not part of this task.

This task, scoped to `_task-detail.tsx` only:
1. Redesigns the page to Design System v2.0 tokens (`_final_design/guide/central-hub-design-system.md`), matching the treatment already shipped to every sibling file in this directory (`_list-view.tsx`, `_board-view.tsx`, `_project-detail.tsx`, tasks 191/192).
2. Fixes the Description field so Zoho-imported/rich-text HTML (including the Tiptap HTML task 205's `TaskDescriptionEditor` now produces on creation, images included) renders as formatted content instead of raw markup — while staying editable, matching this page's existing "edit inline, save on blur" convention.
3. Decodes HTML-entity-encoded titles (`Bug Fixes &amp; Support` → `Bug Fixes & Support`).
4. Removes the Labels and Subtasks cards (UI only — see Out of Scope).
5. Adds a Comments section below Description (built on the existing, already-live-commenting-capable `task_comments` table — no migration needed).
6. Adds a read-only Attachments viewer (lists files uploaded via task 205's creation-time picker; the "not-yet-scoped follow-up" that task 205's Decision #5 explicitly deferred).

## Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Section order? | **Description → Attachments → Comments.** Mirrors the `CreateTaskModal`'s own field order (Description immediately followed by Attachments, task 205); Comments — the conversational/activity element — sits last, the common convention for a detail page's discussion thread. |
| 2 | Does the redesigned Description field gain paste/drop image upload, or just render existing HTML? | **Gains it**, reusing the exact endpoint task 205 already built (`POST /api/v2/projects/[projectId]/tasks/description-images`). Rationale: task 205's creation editor already lets a PM embed screenshots; if the detail-page editor can render but not add images, editing a task after creation becomes a strictly worse experience for the same field. No new backend work — same endpoint, same upload flow, just wired into a second editor instance. |
| 3 | New `@tiptap/extension-link` dependency (task 194 flagged this as an open question)? | **Not needed — verified, not assumed.** Tiptap v3's `StarterKit` bundles `Link` internally by default (`node_modules/@tiptap/starter-kit` → `extensions.push(Link.configure(...))`), whose default `HTMLAttributes` are already `{ target: "_blank", rel: "noopener noreferrer nofollow" }`. Imported/rendered links are clickable and open in a new tab with zero extra config or dependency. This overturns task 194's speculative note on the same question. |
| 4 | Attachments viewer: pre-sign every file's URL on list load, or on-demand? | **On-demand**, matching the one existing precedent in this codebase (`GET /api/customers/[customerId]/assets/[assetId]/file-url`): the list endpoint returns metadata only (no URL); clicking "View" calls a new per-attachment `file-url` endpoint that mints a 60-second signed URL at click time. Avoids the list holding URLs that silently expire if the page sits open, and avoids minting N signed URLs nobody clicks. |
| 5 | How is a comment's author name resolved? | `task_comments.author_id` FK's `auth.users(id)`, **not** `profiles` (migration 025/035) — no PostgREST embed is possible. The comments API resolves display names with a second `profiles` lookup (`.in("id", authorIds)`) server-side, falling back to the row's own `author_name`/`author_email` columns (already populated for Zoho-imported comments with no Hub account, migration 035) when no matching profile exists. |
| 6 | Can comments be edited or deleted from this UI? | **No — out of scope this pass.** `task_comments` RLS already supports own-comment delete + admin delete (migration 048), but no delete/edit affordance is built here; adding one is a natural, low-risk fast-follow once the read/post flow is live. |
| 7 | What happens to Subtasks/Labels data and their existing API routes? | **Nothing — UI-only removal.** `/api/v2/tasks/[taskId]/subtasks`, the `parent_task_id` relationship, and the `tasks.labels` column are untouched and still function; this task only removes the two `Card`s and their local state/handlers from `_task-detail.tsx`. Fully reversible later without any data migration. |

## Requirements

### A — Design System v2.0 retoning (`_task-detail.tsx`)
- [ ] Back link: `text-slate-500 hover:text-slate-700` → `text-[#5F6A88] hover:text-[#0B1533]`.
- [ ] Header border (`border-slate-100`) → `border-[#E2E7F2]`; content area bg (`bg-slate-50`) → `bg-[#F4F6FB]`.
- [ ] `TASK · {display_id}` chip: `font-mono text-slate-400 bg-slate-100 rounded` → `font-mono text-[#5F6A88] bg-[#EDF0F7] rounded-[5px]` (Chips spec).
- [ ] Title textarea: `text-slate-900` → `font-heading text-[#0B1533]` (Page-title spec: Space Grotesk 700); `focus:bg-slate-50` → `focus:bg-[#F4F6FB]`.
- [ ] Delete button: `text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg` → `text-[#5F6A88] hover:text-[#C0392B] hover:bg-[#FDE8E6] rounded-full` (pill icon-buttons, matches this directory's convention).
- [ ] `Card` helper: `rounded-xl border-slate-200` → `rounded-[14px] border-[#E2E7F2] shadow-[0_1px_2px_rgba(7,17,51,0.05)]` (Panels spec — border + soft shadow together); head border `border-slate-100` → `border-[#EDF0F7]`, padding `px-5 py-3` → `px-[18px] py-3.5`; title `text-[11px] font-semibold text-slate-500 uppercase tracking-wider` → `font-heading text-[15px] font-semibold text-[#0B1533]` (Panel-title spec, sentence case, not the small-caps table-header treatment); count badge `font-mono text-slate-400` → `font-mono text-[#5F6A88]`.
- [ ] `Meta` helper label: `text-[12px] font-medium text-slate-600` → `text-[11px] font-semibold text-[#0B1533]` (Forms spec: "Labels 11px/600 `--ink`").
- [ ] Sidebar `Details` card inputs/selects (`rounded-lg border-slate-200 … focus:border-slate-400`) → the Forms-spec class already established at `_project-detail.tsx:915` (`inputClass`): `rounded-[10px] border-[#E2E7F2] bg-[#F4F6FB] text-[#3A4565] focus:border-[#007BFF] focus:bg-white focus:ring-[3px] focus:ring-[#007BFF]/[0.14]`, keeping this page's existing `px-2.5 py-1.5`/`text-[12px]` sizing.
- [ ] Priority `<select>`'s inline `style={{ color: ps.text }}` stays (already token-driven via `PRIORITY_STYLE`) — only surrounding classes retone.
- [ ] GitHub PR / Preview links: `text-violet-600`/`text-blue-600` → both `text-[#0063D6]` (`--blue-700`), differentiated only by icon (per DESIGN.md §7: violet is reserved for the Publish phase hue, never reused).

### B — Title HTML-entity decoding
- [ ] Add `decodeHtmlEntities(input: string): string` to `_pm-shared.tsx` — pure regex string transform (numeric entities via `String.fromCodePoint`, plus a small named-entity table: `amp lt gt quot apos nbsp hellip mdash ndash lsquo rsquo ldquo rdquo`). No `DOMParser`/`document` — this module is imported by components server-rendered on first paint.
- [ ] In `_task-detail.tsx`, initialize the title `useState` from the decoded value: `useState(() => decodeHtmlEntities(task.title))`. Next blur-save persists the clean text back to the DB (organic cleanup, no migration).

### C — Description: render HTML properly, keep editable, support inline images
- [ ] Create `_task-description-field.tsx` (co-located in `tasks/[taskId]/`) — Tiptap `useEditor({ extensions: [StarterKit, Image], content: value, immediatelyRender: false })`. `StarterKit` alone renders imported `<a href>` links correctly (see Decision #3) — no extra Link config needed for read-rendering, though `StarterKit.configure({ link: { openOnClick: false } })` should be set so clicking a link while editing doesn't hijack focus (the rendered/serialized `<a>` still keeps `target="_blank"` either way).
- [ ] Same paste/drop-image-upload handlers as `_task-description-editor.tsx` (the creation-only sibling one level up, in `[projectId]/`) — **do not import it directly**; its own top comment scopes it to the New Task modal and it has no `onBlur`-save concept. Rebuild the same shape locally (same toolbar: Bold/Italic/Bullet list; same `[&_img]:max-w-full [&_img]:rounded-[8px]` content classes) with one behavioral difference: persist via `onBlur` (`useEditor({ ..., onBlur: ({ editor }) => onSave(editor.getHTML()) })`), matching every other field's "edit locally, save on blur" convention on this page — no new autosave/debounce mechanism.
- [ ] `uploadAndInsertImage` posts to `/api/v2/projects/${projectId}/tasks/description-images` (task 205's existing endpoint, unchanged) where `projectId = project.project_id ?? project.id` (the fallback convention already used at every other call site in this subtree, e.g. `_project-detail.tsx:649,662,676`).
- [ ] In `_task-detail.tsx`, replace the description `<textarea>` (current lines 239–248) with `<TaskDescriptionField projectId={project.project_id ?? project.id} value={description} onSave={(html) => { setDescription(html); void saveField({ description: html || null }); }} />`.

### D — Remove Subtasks and Labels
- [ ] Delete the "Labels" `Card` block and its state/handlers: `labels`, `newLabel`, `addLabel()`, `removeLabel()`.
- [ ] Delete the "Subtasks" `Card` block and its state/handlers/effect: `subtasks`, `loadingSubs`, `newSub`, `addingSub`, the mount `useEffect` fetching `/api/v2/tasks/${task.id}/subtasks`, `addSubtask()`, `toggleSubtask()`, `deleteSubtask()`, `doneCount`.
- [ ] Update the delete-task confirm copy from `"Delete this task and all its subtasks?"` to `"Delete this task? This cannot be undone."` — the page no longer surfaces a "subtasks" concept to the user, so the old wording would be confusing even though the DB cascade is unaffected.
- [ ] Do **not** touch `/api/v2/tasks/[taskId]/subtasks/route.ts`, `parent_task_id`, or `tasks.labels` — see Decision #7.

### E — Comments section (new)
- [ ] Create `src/app/api/v2/tasks/[taskId]/comments/route.ts`:
  - `GET` — list comments for the task (`taskId` is the task's UUID, matching the sibling `[taskId]/route.ts`/`subtasks/route.ts` convention, **not** the page URL's `display_id`), ordered `created_at asc`, each row's author resolved server-side per Decision #5, shape `{ id, body, created_at, author_name }`.
  - `POST` — body `{ body: string }`; insert `{ task_id: taskId, author_id: user.id, body: body.trim() }`; resolve the current user's `profiles.full_name` for the response so the client can append it immediately without a refetch, same `{ id, body, created_at, author_name }` shape.
  - Auth check only (`createClient()`, session-bound) — no explicit role gate; `task_comments_staff_read`/`_staff_insert` RLS (migration 048) already scopes read to `admin/super_admin/pm/developer` and insert to the same set with `author_id = auth.uid()` enforced at the DB layer, matching the existing `[taskId]/route.ts`/`subtasks/route.ts` pattern of relying on RLS rather than duplicating the role check in the route.
- [ ] Create `_task-comments.tsx` (co-located in `tasks/[taskId]/`): fetches `GET /api/v2/tasks/${task.id}/comments` on mount; renders a chronological list — small color-rotated initials avatar (reuse `AVATAR_COLORS` from `_pm-shared.tsx`, keyed off `author_name` for a stable-per-name color) + author name + `formatRelativeTime(created_at)` (from `@/lib/utils`) + body text; a `<textarea>` + "Post comment" button below the list (disabled while empty or saving); posts via the same route, appends the returned comment to local state (no full refetch).
- [ ] Empty state: icon + "No comments yet" message, per CLAUDE.md's UI Polish Convention (every list needs an explicit empty state, not blank space).
- [ ] Loading state: skeleton rows while the initial fetch is in flight (per DESIGN.md §5: "skeleton rows in place — never centered spinners").

### F — Attachments viewer (new)
- [ ] Add a `GET` handler to the existing `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/route.ts` (currently `POST`-only, task 205) — list attachments for the task: `.from("attachments").select("id, filename, size, created_at").eq("entity_type", "task").eq("entity_id", task.id).order("created_at", { ascending: true })`. Auth check only, same "rely on `attachments_staff_read` RLS" reasoning as Requirement E's comments `GET`.
- [ ] Create `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/[attachmentId]/file-url/route.ts` — `GET`, mirrors `src/app/api/customers/[customerId]/assets/[assetId]/file-url/route.ts`'s shape but with the **session-bound** client (not `adminClient` — that route's admin-bypass was needed for `customer_assets`' bespoke `allowed_roles`/`allowed_user_ids` logic; `project-assets`'s storage RLS, migration 050, already grants `admin/super_admin/pm/developer` `select` directly, so the session client's own `createSignedUrl` call is correctly scoped without a bypass): look up the attachment row (`.eq("id", attachmentId).eq("entity_type", "task").eq("entity_id", taskId)`), `createSignedUrl(storage_path, 60)`, return `{ url }`.
- [ ] Create `_task-attachments.tsx` (co-located in `tasks/[taskId]/`): fetches the list on mount from the `GET` above (`projectId = project.project_id ?? project.id`); renders each as a file-chip row reusing the exact visual pattern already shipped in `_task-attachment-picker.tsx` (`[projectId]/_task-attachment-picker.tsx:104-122` — icon by mime-inferred-from-filename-extension since the list response has no `type` field, filename, formatted size) plus a "View" button that calls the `file-url` endpoint on click and `window.open(url, "_blank", "noopener")`.
- [ ] Empty state: icon + "No attachments yet" message.
- [ ] Loading state: skeleton rows.

## Out of Scope / Must-Not-Change

- **`_issue-detail.tsx`** — task 194's Requirement D scope; not touched by this task.
- **`_task-description-editor.tsx`** (in `[projectId]/`, task 205's creation-only editor) — not modified, not imported into the new `_task-description-field.tsx`; the two stay independent per Decision #3/Requirement C.
- **Editing or deleting existing comments** — see Decision #6.
- **Editing or deleting attachments from this page** — read-only viewer only; upload still happens exclusively at creation time via `CreateTaskModal` (task 205), unchanged.
- **`/api/v2/tasks/[taskId]/subtasks/route.ts`, `parent_task_id`, `tasks.labels`** — untouched; see Decision #7.
- **`_list-view.tsx`/`_board-view.tsx`/`_calendar-view.tsx`** (Tasks listing/board/calendar) — task 194's Requirement A also flagged title-decoding for these; not part of this task, which is scoped to the detail page only.
- **`issue_comments`** table/pattern — unrelated table for a different entity; not touched or reused.
- **No new npm dependencies** — per Decision #3, `@tiptap/extension-image` (task 205) and `StarterKit`'s bundled `Link` already cover everything this task needs.
- **No new Supabase migration** — `task_comments` and `attachments` tables + their RLS policies already exist and already support everything this task's API routes need.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/projects/_pm-shared.tsx` | Modify | Add `decodeHtmlEntities()`; export `AVATAR_COLORS` (currently local to this file) for reuse by the new comment avatars |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | Full v2.0 retone; decode title; remove Labels/Subtasks cards + state; swap description textarea for `TaskDescriptionField`; render `TaskAttachments` + `TaskComments` |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-description-field.tsx` | Create | Editable Tiptap renderer for `description` (StarterKit + Image), paste/drop image upload, onBlur save |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachments.tsx` | Create | Read-only attachment list + on-demand signed-URL "View" |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-comments.tsx` | Create | Comment list + add-comment form |
| `src/app/api/v2/tasks/[taskId]/comments/route.ts` | Create | `GET` list (author-resolved) / `POST` create |
| `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/route.ts` | Modify | Add `GET` (list, no signed URL) alongside existing `POST` |
| `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/[attachmentId]/file-url/route.ts` | Create | On-demand 60s signed URL for one attachment |

## Code Context

### Current `_task-detail.tsx` — Description/Labels/Subtasks block to remove/replace (`:238-346`)
Already read in full during planning — Description is a plain `<textarea>` (`:239-248`), Labels is a full `Card` (`:250-282`), Subtasks is a full `Card` with its own fetch effect and CRUD handlers (`:86-164`, `:284-346`). All of this is deleted/replaced per Requirements C/D.

### `_task-attachment-picker.tsx` file-chip row to mirror for the read-only viewer (`[projectId]/_task-attachment-picker.tsx:101-124`)
```tsx
{files.length > 0 && (
  <ul className="flex flex-col gap-1.5">
    {files.map((file, idx) => (
      <li key={...} className="flex items-center gap-2 rounded-[8px] border border-[#E2E7F2] bg-white px-2.5 py-1.5">
        {file.type.startsWith("image/")
          ? <ImageIcon size={13} className="text-[#5F6A88] shrink-0" />
          : <FileText size={13} className="text-[#5F6A88] shrink-0" />}
        <span className="flex-1 truncate text-[12px] text-[#3A4565]">{file.name}</span>
        <span className="text-[10px] text-[#5F6A88] shrink-0">{formatFileSize(file.size)}</span>
        {/* picker has a remove button here; the viewer has a "View" button instead */}
      </li>
    ))}
  </ul>
)}
```
The viewer version has no `file.type` (server row has only `filename`) — infer image-vs-document from the filename extension for the icon choice; reuse `formatFileSize` (copy the same small helper, it's not exported from the picker).

### `_task-description-editor.tsx` — pattern to mirror locally, not import (`[projectId]/_task-description-editor.tsx`, full file already reviewed)
Same `useEditor({ extensions: [StarterKit, Image], ... })`, same `handlePaste`/`handleDrop` image-upload shape, same toolbar (`marks` array + `IconTip`). The new `_task-description-field.tsx` differs only in: takes `onSave` instead of `onChange`, wires it via Tiptap's `onBlur` callback instead of `onUpdate`, and is rendered with pre-existing `content: value` from a loaded task rather than starting empty.

### `file-url` precedent to mirror, adapted to the session client (`src/app/api/customers/[customerId]/assets/[assetId]/file-url/route.ts`, full file already reviewed)
```ts
const { data: signed, error: signError } = await supabase.storage // NOT adminClient — see Requirement F
  .from("project-assets")
  .createSignedUrl(attachment.storage_path, 60);
```

### `task_comments` schema (migrations 025 + 035) — why author resolution needs a second query
```sql
-- 025: author_id uuid not null references auth.users(id) on delete cascade
-- 035: author_id made nullable, FK → on delete set null; added external_id, author_name, author_email
```
No FK to `profiles` exists — resolve via `.from("profiles").select("id, full_name").in("id", authorIds)` after fetching comments, not a PostgREST embed.

### `attachments_staff_read` / `task_comments_staff_read` RLS (migration 048) — why the new `GET` routes skip an app-level role check
```sql
create policy "attachments_staff_read" on attachments for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));
create policy "task_comments_staff_read" on task_comments for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));
```
Both already cover every staff role that can view this page; the session-bound `createClient()` naturally scopes results, matching how `[taskId]/route.ts` and `subtasks/route.ts` skip a redundant role check today.

## Implementation Steps

1. `_pm-shared.tsx`: add `decodeHtmlEntities()`; export the existing `AVATAR_COLORS` const (remove its `const` → add `export`).
2. Build `_task-description-field.tsx` per Requirement C (adapt `_task-description-editor.tsx`'s shape locally; `onBlur`-save instead of live `onChange`; `StarterKit.configure({ link: { openOnClick: false } })`).
3. Build `src/app/api/v2/tasks/[taskId]/comments/route.ts` (`GET`/`POST`, author resolution per Decision #5).
4. Build `_task-comments.tsx` (list + add form, empty/loading states).
5. Add `GET` to `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/route.ts`.
6. Build `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/[attachmentId]/file-url/route.ts`.
7. Build `_task-attachments.tsx` (list + on-demand "View", empty/loading states).
8. Rewrite `_task-detail.tsx`: apply Requirement A's full retone; decode title (Requirement B); remove Labels/Subtasks (Requirement D); swap in `TaskDescriptionField`, `TaskAttachments`, `TaskComments` in the Description → Attachments → Comments order (Decision #1).
9. Manually verify in the browser: open a task whose description has Zoho-imported HTML (links + line breaks) and confirm it renders formatted, not raw; open a task created via the New Task modal with a pasted description image and confirm the image renders; edit the description, paste a new image into it, blur, reload, confirm it persisted; post a comment as a PM/admin/developer session and confirm it appears with the right name; upload attachments at creation time (task 205 flow) then open that task's detail page and confirm they list and "View" opens a working signed URL; confirm a title with `&amp;` in the DB now displays `&`.

## Acceptance Criteria

- [ ] `_task-detail.tsx` uses Design System v2.0 hex tokens throughout (no remaining `slate-*` classes) matching sibling files in the same directory.
- [ ] A task title stored with HTML entities (e.g. `Bug Fixes &amp; Support`) displays decoded (`Bug Fixes & Support`).
- [ ] A task description containing HTML (links, line breaks, an embedded `<img>`) renders as formatted content, not raw markup; links open in a new tab.
- [ ] The description remains editable in place (blur-to-save) and supports pasting/dropping a new image, which uploads and inserts inline.
- [ ] The Labels and Subtasks cards no longer appear on the page; `/api/v2/tasks/[taskId]/subtasks` and `tasks.labels` remain unaffected/functional at the API/DB level.
- [ ] A Comments section below Description lists existing `task_comments` rows (author name + relative time + body) and lets the current user post a new one, which appears immediately without a page reload.
- [ ] An Attachments section shows every file uploaded for the task via the creation-time picker (task 205), with a working "View" that opens the file in a new tab.
- [ ] Both new list sections show an explicit empty state when there's no data and a skeleton loading state while fetching.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new warnings/errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser verification (no test runner configured) — see Implementation Step 9 for the full walkthrough. Requires at least one task with a Zoho-imported HTML description, one task created via the New Task modal with a pasted description image and at least one staged attachment, and a session with a role in `admin/super_admin/pm/developer` to exercise comment posting.

## Compatibility Touchpoints

- No new npm dependencies (Decision #3).
- No new Supabase migration — reuses existing `task_comments`/`attachments` tables and RLS.
- `GET` added to `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/route.ts` is additive; the existing `POST` (task 205's creation-time upload) is unchanged.
- No MCP tool inventory changes (`_docs/mcp-tools.md`) — none of the new routes are `server.registerTool(...)` calls.
- No env var changes.
- Relationship to task 194: this task's Requirements A/B/C fully cover and supersede task 194's Requirements A (task-detail half)/B/C for `_task-detail.tsx` specifically; task 194's own doc is left as-is (not edited by this task) since its Requirement A (listing/board/calendar title-decoding) and Requirement D (`_issue-detail.tsx`) remain separately open work.

## Implementation Notes

### What Changed
- `_pm-shared.tsx`: added `decodeHtmlEntities()` (regex-based, numeric + named entities, no DOM). Did **not** need to export `AVATAR_COLORS` as planned — discovered `OwnerChip` (already exported, already takes a `name: string` and derives initials/color from it) is a direct fit for comment-author avatars, so it's reused as-is instead of building a new avatar helper (see Deviations).
- Verified before building (Decision #3): Tiptap v3's `StarterKit` bundles the `Link` extension internally with `HTMLAttributes: { target: "_blank", rel: "noopener noreferrer nofollow" }` as its default — confirmed by inspecting `node_modules/@tiptap/starter-kit`'s source, not assumed. No new dependency added.
- Added `_task-description-field.tsx` — editable Tiptap renderer (`StarterKit.configure({ link: { openOnClick: false } })` + `Image`), same toolbar/paste/drop-upload shape as task 205's creation-only `_task-description-editor.tsx`, persisting via `onBlur` instead of live `onChange` to match this page's existing "edit inline, save on blur" convention.
- Added `_task-attachments.tsx` — read-only list (loading skeleton / empty state / file-chip rows mirroring `_task-attachment-picker.tsx`'s styling), "View" mints a signed URL on click via the new `file-url` route.
- Added `_task-comments.tsx` — loading skeleton / empty state / chronological list (`OwnerChip` avatar + name + `formatRelativeTime` + body) + textarea/"Post comment" composer, appends the POST response directly (no refetch).
- Added `GET /api/v2/tasks/[taskId]/comments` (author-resolved via a second `profiles` lookup, per Decision #5) and `POST` (insert + resolve the poster's own name for the response).
- Added `GET` to the existing `.../tasks/[taskId]/attachments/route.ts` (list, no signed URL) alongside the unchanged `POST`.
- Added `GET /api/v2/projects/[projectId]/tasks/[taskId]/attachments/[attachmentId]/file-url/route.ts` — 60s signed URL, session-bound client (RLS-scoped, no `adminClient` needed — see Decision #4/Requirement F).
- Rewrote `_task-detail.tsx`: full Design System v2.0 retone (Requirement A) applied to `Card`/`Meta` helpers, header, chip, title, delete button, sidebar inputs, PR/Preview links; title initialized from `decodeHtmlEntities(task.title)` (Requirement B); Labels and Subtasks cards + all their state/handlers/effect removed entirely (Requirement D); delete-confirm copy changed to "Delete this task? This cannot be undone."; new Description → Attachments → Comments section order (Decision #1) wired to the three new components.

### Files Changed
- `src/app/v2/(hub)/projects/_pm-shared.tsx` - added `decodeHtmlEntities()`, per plan
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-detail.tsx` - full rewrite per plan (redesign, title decode, Labels/Subtasks removal, new sections wired in)
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-description-field.tsx` - new component, per plan
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-attachments.tsx` - new component, per plan
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/_task-comments.tsx` - new component, per plan
- `src/app/api/v2/tasks/[taskId]/comments/route.ts` - new route, per plan
- `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/route.ts` - added `GET`, per plan
- `src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/[attachmentId]/file-url/route.ts` - new route, per plan

### Deviations From Plan
- **Did not export `AVATAR_COLORS` from `_pm-shared.tsx`.** The task doc's Proposed File Changes called for exporting it so the new comment avatars could reuse the color rotation. While reading `_pm-shared.tsx` to place `decodeHtmlEntities()`, found `OwnerChip` — an already-exported component that takes a `name: string`, derives initials from it, and picks a color from the same `AVATAR_COLORS` rotation internally. Reusing `OwnerChip` directly in `_task-comments.tsx` is a strictly smaller, more consistent change than exporting the raw color array and re-deriving initials/color logic in a new local helper — same visual result, less code, one existing component reused instead of two implementations of the same idea. No other behavior changed.
- No other deviations. All Requirements (A–F) and Decisions (#1–#7) implemented as specified.

### Verification Run
- `npx tsc --noEmit` - PASS (no errors)
- `pnpm lint` - PASS (no warnings or errors)
- impeccable design-lint hook - fired after every file write/edit in this task; all findings were `design-system-font-size` on literal pixel values that either (a) pre-exist unchanged from the original file, (b) exactly match a documented DESIGN.md scale step (e.g. 22px page title), or (c) mirror an already-shipped, already-reviewed sibling file's identical class (task 205's `_task-attachment-picker.tsx`/`_task-description-editor.tsx`). All classified false positives per this codebase's documented convention (CLAUDE.md "UI Polish Conventions" — arbitrary pixel Tailwind classes are the real shipped pattern here, not a formal type-ramp system); none required a change.
- Manual/browser verification (Implementation Step 9) - SKIPPED (deferred to the `test` stage per the implement skill's workflow — this stage runs typecheck/lint only, no dev server was started during implementation)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation in any new/changed file; `_task-detail.tsx`'s unused imports from the pre-redesign version (`TagChip`, `Plus`, `Square`, `CheckSquare`, `Loader2`, the `useEffect` import) were all removed along with the Labels/Subtasks code that used them — confirmed via `grep` (no leftover `slate-`/`dark:` classes, no dangling references).
- No `any` or untyped escape hatches — all new components/routes are fully typed (`AttachmentRow`, `CommentRow`, `TaskDescriptionField`'s props, the comments route's `resolveAuthorName` helper).
- No deep nesting — the two new API routes use the same early-return guard-clause shape as every sibling route in this codebase (401 → 404 → 400/insert), and both new `GET` list handlers intentionally skip an app-level role check in favor of RLS, exactly matching the existing `[taskId]/route.ts`/`subtasks/route.ts` precedent (documented inline and in the task doc's Requirements E/F).
- Each new file has one clear responsibility: `_task-description-field.tsx` (rich-text render/edit + inline image upload only), `_task-attachments.tsx` (read-only list + on-demand view only), `_task-comments.tsx` (list + post only), `comments/route.ts` (list/create only), the two `attachments` route additions (list / sign-one-url only).
- Names accurately describe behavior (`resolveAuthorName`, `uploadAndInsertImage`, `viewAttachment`, `postComment`).
- `formatFileSize` is duplicated between `_task-attachments.tsx` and the pre-existing `_task-attachment-picker.tsx` — a 4-line helper not exported by the picker; the task doc's own Code Context flagged this as an accepted, intentional duplication rather than introducing a shared-utility abstraction for one four-line function, consistent with this codebase's own precedent (task 205's `ALLOWED_MIME_TYPES`/`MAX_FILE_SIZE` duplication across client/server).
- Errors are handled by silently no-op'ing on a failed fetch/POST (empty list stays empty, draft/staged state is preserved for retry, no crash) — this matches the exact silent-failure convention already used throughout this directory (`_task-description-editor.tsx`'s "silently drop" image-paste comment, the original `_task-detail.tsx`'s subtask-fetch `.catch(() => {})`), not a new gap introduced by this task.
- No secrets, credentials, or debug logging — only `console.error` on genuine server-side failure paths (`file-url` sign failure, comment insert failure), matching sibling routes' convention exactly.
- Fixed-hex token styling, no `dark:`, no unjustified `style={{}}` — confirmed across all new/changed files; the one remaining `style={{ color: ps.text }}` on the Priority `<select>` is a pre-existing, deliberately-unchanged carry-over (task doc Requirement A explicitly scoped it to "stays — already token-driven via `PRIORITY_STYLE`"), not new code from this task.
- `npx tsc --noEmit` and `pnpm lint` both PASS with zero errors/warnings (re-confirmed during this review).
- File sizes stay within `nextjs-file-length-best-practices.md`'s guidance: the three new components are 92–100 lines each, both new/modified API route files are 45–124 lines; `_task-detail.tsx` is 327 lines (down from the original 496 despite two new sections added, due to Labels/Subtasks removal + extraction of Description/Attachments/Comments into their own files) — over the guide's 250–300 "soft warning" but under its 400–500 "hard limit," and the excess is mostly the sidebar's six near-identical `Meta`+`<select>/<input>` blocks (simple, repetitive JSX, not nested logic) — the guide explicitly calls this pattern "often fine." Not split further, since doing so would fragment a single cohesive "Details" sidebar into artificial pieces the task didn't ask for.

### Deviations
- **Minor — did not export `AVATAR_COLORS` from `_pm-shared.tsx` as the task doc's Proposed File Changes specified.** Discovered mid-implementation that `OwnerChip` (already exported, already does name→initials→color-rotation internally) is a direct, better fit for comment avatars than exporting the raw color array and re-deriving the same logic locally. Smaller diff, one implementation of the idea instead of two, same visual result. Documented in Implementation Notes.
- No deviations found that touch the Out of Scope boundaries — `_issue-detail.tsx`, `_task-description-editor.tsx`, `/api/v2/tasks/[taskId]/subtasks/route.ts`, `parent_task_id`, `tasks.labels`, and `_list-view.tsx`/`_board-view.tsx`/`_calendar-view.tsx` are all untouched (confirmed via `git status`/`git diff --name-only` — no unexpected files appear among this session's changes).
- No new npm dependencies or Supabase migrations were introduced, matching the task doc's Compatibility Touchpoints exactly.
