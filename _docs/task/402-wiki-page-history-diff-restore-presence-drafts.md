# 402: Wiki Page History (Full Diff + Restore) and Edit Safety (Presence, Server Drafts, Conflict Detection)

**Created:** 2026-09-24
**Priority:** HIGH
**Type:** feature
**Recommended Tier:** deep (new migration + RPC, concurrency semantics, Realtime Presence, new dependency)
**Status:** Testing

---

## Overview

Two related gaps on `/kb` (Wiki, tasks 395–401):

1. **No real history.** `wiki_page_versions` only gets a row on the *publish* transition (task 399). Every ordinary Save overwrites `wiki_pages.content_html` with no trace, so there is nothing to diff and nothing to restore.
2. **Silent last-write-wins.** `PATCH /api/wiki/pages/[pageId]` blindly overwrites. If A and B both open Edit on the same page, whoever saves second erases the first person's work with no warning. Unsaved edits are also lost on tab close, crash, or navigating to another page (`loadDetail()` calls `setEditMode(false)` and drops the draft state).

This task adds a **revision history with a full diff view and one-click restore**, plus a layered **edit-safety** model so a user's changes are never silently lost and everyone can see who is editing now or has unsaved changes.

### Recommended approach to preventing change loss (decision record)

| Option | Verdict | Why |
|---|---|---|
| **Real-time co-editing** (Yjs + `@tiptap/extension-collaboration` + Hocuspocus/y-websocket) | **Not now** — deferred follow-up | Needs a long-lived WebSocket document server (Vercel functions can't host one), a CRDT-backed storage format replacing plain `content_html`, and rework of import/export/TOC. Too much infrastructure for an internal wiki with a few concurrent editors. |
| **Hard edit lock** (one editor at a time) | Rejected | Stale locks when a tab crashes or a laptop sleeps. Someone ends up "force-unlocking", which just recreates last-write-wins. |
| **Advisory model: presence + per-user server drafts + optimistic concurrency + revision history** | **Chosen** | Every layer is cheap and uses what the repo already has (Supabase Realtime, RLS, a debounced auto-save pattern). Together the layers guarantee no silent loss. |

The chosen model has four layers. Each one covers a failure the others miss:

1. **Presence (live awareness).** A single Supabase Realtime **Presence** channel `wiki-presence` for everyone on `/kb`. Each client tracks `{ userId, name, email, pageId, mode: "viewing" | "editing", since }`. The page header shows "Jane Doe is editing now", and the tree marks pages someone is editing. Nothing is stored in the DB.
2. **Per-user server drafts (crash/close safety + "has unsaved changes" awareness).** While in Edit mode the client autosaves (2 s debounce, same cadence as `use-auto-save.ts`) to a `wiki_page_drafts` row, one per `(page_id, user_id)`. A successful Save deletes it. Reopening Edit offers "Resume your draft from 14:32". Other users see *who* has a draft and *when* it was last touched, but never its content.
3. **Optimistic concurrency (no silent overwrite).** `wiki_pages.revision` is an integer bumped on every content save. Edit mode remembers the `baseRevision` it started from. Save goes through an RPC that only writes if the row is still at `baseRevision`; otherwise it returns **409 conflict**. The client then opens a conflict dialog showing a diff of *their latest* against *your draft*, with three choices: **Overwrite with mine** (explicit and logged; the overwritten content survives as a revision anyway), **Reload theirs and keep my draft to compare**, or **Cancel**.
4. **Revision history (undo for everything).** Every successful Save, Publish and Restore appends an immutable snapshot. Even an explicit overwrite is recoverable from History. Restore is itself a new revision, so restores are reversible too.

A Realtime **broadcast** on the same channel (`page-saved { pageId, revision, by }`) makes the conflict visible *before* Save. A viewer gets a "Updated by X · Reload" banner, and an editor gets "X saved a newer version. Your save will need to merge."

## Requirements

### History + diff + restore
- [ ] Every content-changing Save creates an immutable revision snapshot (title, content_html, tags, status, author, timestamp, kind). Publish and Restore also create snapshots, with kind `publish` / `restore`.
- [ ] Existing publish-only `version` semantics from task 399 are **unchanged**. `wiki_pages.version` still bumps only on publish, and the `v{n}` badge still means "published version". The new `revision` counter is separate.
- [ ] A **History** action in the doc header (visible to all staff readers) opens a history view listing revisions newest first. Each row shows the author avatar + name, a kind pill (Saved / Published v3 / Restored from #12), relative + absolute time, and a `#revision` label.
- [ ] Selecting a revision shows a **full diff**. The default compares it with the previous revision, and a toggle switches to comparing with the current page. The diff covers the title (if changed), the tags (added/removed pills) and the body (rendered rich-text diff: insertions green/underlined, deletions red/struck through, unchanged blocks shown). A second toggle switches between **Inline** and **Side-by-side**.
- [ ] A **Contributors** summary on the history view shows distinct authors with revision counts.
- [ ] **Restore this revision** (writers only, confirm dialog) writes that revision's title/content/tags back to the page as a new `restore` revision. It does not change `status` or `version` and goes through the same concurrency check.
- [ ] Diff HTML is sanitized with DOMPurify before render (revision content is user HTML).

### Edit safety
- [ ] Presence: a header banner on the open page lists users currently **editing** (avatar, name, "editing for 6 min"). Hover/click shows email with a `mailto:` link so the user can reach out. Users only **viewing** are shown as a smaller avatar stack.
- [ ] Presence: tree rows show a small pencil indicator (with `aria-label` + tooltip naming the editor(s)) for pages someone else is editing.
- [ ] Drafts: while in Edit mode, title/content/tags autosave to `wiki_page_drafts` (2 s debounce) with a subtle "Draft saved 14:32" / "Saving draft…" indicator.
- [ ] Drafts: on entering Edit, if the user has their own draft, prompt "Resume draft (saved {time})" / "Discard draft". If `draft.base_revision < page.revision` (the page changed since), warn and offer "View differences" using the same diff view.
- [ ] Drafts: the page header lists **other** users holding a draft ("Mark has unsaved changes from 2 h ago") with a mailto, using a `security definer` function that exposes holder identity + timestamps only, never content.
- [ ] Drafts: Save success and Cancel → "Discard changes" delete the user's draft. Cancel with unsaved changes asks "Keep as draft / Discard".
- [ ] Drafts: switching pages or closing the tab while in Edit keeps the draft (it is on the server) and shows a `beforeunload` prompt only if the last debounce hasn't flushed.
- [ ] Concurrency: Save sends `baseRevision`. Server returns `409 { error: "conflict", current: { revision, updatedBy, updatedAt } }` if stale. The client shows the conflict dialog (diff theirs vs mine, Overwrite / Reload / Cancel).
- [ ] Broadcast: on successful save/restore/publish, the saving client broadcasts `page-saved`. Viewers of that page get a non-intrusive "Updated by X · Reload" banner, and editors get a conflict-ahead warning.

## Out of Scope / Must-Not-Change

- **No real-time co-editing (CRDT/Yjs).** Listed as a follow-up only.
- **No hard locks.** Presence and drafts are advisory; anyone with write access can still save.
- Do **not** change task 399's publish/`version` semantics or the `v{n}` tree badge meaning.
- Do **not** change import (`_wiki-import-modal.tsx`, `import-pdf` route), export modules (`_wiki-export-*`), or `_wiki-rte.tsx` internals beyond passing props through.
- Do **not** expose other users' draft **content**, only holder identity and timestamps.
- No revision pruning/retention job (note as follow-up). Drafts don't create revisions, so growth is bounded by explicit Saves.
- No in-app messaging system. The "ask them" affordance is a `mailto:` link (plus the name/email so the user can use Cliq).
- `kb_articles` / `kb_entries` (other "KB" features) are untouched.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/151_wiki_page_history_drafts.sql` | Create | Extend `wiki_page_versions` into a revision log, add `wiki_pages.revision`, create `wiki_page_drafts`, the `wiki_save_page()` / `wiki_restore_revision()` RPCs, and the `wiki_page_draft_holders()` definer fn. **Written, not applied**, matching the repo's convention. |
| `src/types/database.ts` | Modify | New columns/table/functions. |
| `src/types/wiki.ts` | Modify | `WikiRevisionSummary`, `WikiRevisionDetail`, `WikiDraftHolder`, `WikiMyDraft`, `WikiPresenceState`; add `revision`, `draftHolders`, `myDraft` to `WikiPageDetail`. |
| `src/app/api/wiki/pages/[pageId]/route.ts` | Modify | GET returns `revision`, `draftHolders`, `myDraft` meta. PATCH content saves go via `wiki_save_page` RPC with `baseRevision` → 409 on conflict. Status-only publish path snapshots via the same RPC (kind `publish`). |
| `src/app/api/wiki/pages/[pageId]/revisions/route.ts` | Create | GET revision list (metadata + author, no content), paginated with `.range()`. |
| `src/app/api/wiki/pages/[pageId]/revisions/[revisionId]/route.ts` | Create | GET one revision with content, plus its predecessor's content for the default diff. |
| `src/app/api/wiki/pages/[pageId]/revisions/[revisionId]/restore/route.ts` | Create | POST restore (`baseRevision` required) → `wiki_restore_revision` RPC; 409 on conflict. |
| `src/app/api/wiki/pages/[pageId]/draft/route.ts` | Create | GET own draft (with content), PUT upsert own draft, DELETE own draft. |
| `src/lib/wiki/diff.ts` | Create | Pure HTML diff: block-tokenize (p/h1-6/li/blockquote/pre/tr/img) → `diffArrays` on blocks → `diffWords` inside modified blocks → HTML with `<ins>`/`<del>` + side-by-side pair output. Also `diffTags()`. |
| `src/app/(hub)/kb/_use-wiki-presence.ts` | Create | Hook: joins `wiki-presence`, tracks own state, exposes `editorsByPage`, `viewersOfPage`, `broadcastSaved()`, `onPageSaved` subscription. |
| `src/app/(hub)/kb/_use-wiki-draft.ts` | Create | Hook: debounced PUT of `{title, contentHtml, tags, baseRevision}`, flush/discard, `beforeunload` guard, status (`idle/saving/saved/error`). |
| `src/app/(hub)/kb/_wiki-presence-bar.tsx` | Create | Header strip: editing-now users, draft holders, viewers stack, "Updated by X · Reload" banner. |
| `src/app/(hub)/kb/_wiki-history-panel.tsx` | Create | History view: revision list + contributors summary + selected-revision diff + Restore. |
| `src/app/(hub)/kb/_wiki-diff-view.tsx` | Create | Renders `diff.ts` output inline or side-by-side, title/tags diff; reused by the history, conflict and stale-draft dialogs. |
| `src/app/(hub)/kb/_wiki-conflict-modal.tsx` | Create | 409 dialog (Overwrite with mine / Reload theirs & keep my draft / Cancel); also used for the stale-draft "View differences" prompt. |
| `src/app/(hub)/kb/_wiki-shell.tsx` | Modify | Wire the hooks, `baseRevision`, the history open state, and resume-draft/conflict flows. **Already 289 lines**, so push logic into the hooks above and keep the shell as wiring only. |
| `src/app/(hub)/kb/_wiki-doc-panel.tsx` | Modify | History button, presence bar slot, draft status indicator next to Save. |
| `src/app/(hub)/kb/_wiki-tree-panel-rows.tsx` | Modify | Pencil "being edited" indicator per row. |
| `src/app/(hub)/kb/_wiki-tree-panel.tsx` | Modify | Pass `editorsByPage` through to rows. |
| `package.json` / `pnpm-lock.yaml` | Modify | `pnpm add diff` (jsdiff, ships its own TS types in v8). |
| `CLAUDE.md` | Modify | One Key-Conventions bullet on the wiki revision/draft/presence model (revision vs version, 409 contract, definer fn). |

## Code Context

### Current save path: `src/app/api/wiki/pages/[pageId]/route.ts` PATCH
- Loads `current` (`id, title, content_html, status, version`), builds `update`, and does an unconditional `.update(update).eq("id", pageId)`. **This is where last-write-wins lives.**
- Inserts into `wiki_page_versions` **only when** `isPublishing` (task 399 comment at ~L150). A non-atomic second statement; a failure is only logged.
- GET builds `contributors` from `wiki_page_versions.edited_by`. With a revision per save this becomes *more* accurate, so keep the query and just select the new columns.

### Current client flow: `src/app/(hub)/kb/_wiki-shell.tsx`
```tsx
function enterEdit() { setDraftTitle(detail.title); setDraftContentHtml(detail.contentHtml); setDraftTags(detail.tags); setEditMode(true); }
async function save() { /* PATCH {title, contentHtml, tags} → setEditMode(false); loadDetail + refreshPages */ }
const loadDetail = useCallback(async (pageId) => { setDetailLoading(true); setEditMode(false); ... })  // ← silently drops in-progress edits on page switch
```
- `changeStatus(status)` PATCHes `{status}` only (the publish path).
- `useEffect` uses the `Promise.resolve().then(...)` deferral for `react-hooks/set-state-in-effect`. Keep that pattern in new effects.

### Schema today: `supabase/migrations/149_wiki_pages.sql`
- `wiki_pages(... status, version int default 1, tags text[], updated_by, updated_at)` with an `update_updated_at_column()` trigger.
- `wiki_page_versions(id, page_id, version, title, content_html, edited_by, created_at)`. RLS allows staff read (`admin, super_admin, pm, developer, hr`) and writer insert (`admin, super_admin, pm, developer`), with no update/delete policy (already append-only, keep it that way).
- Always use `get_my_role()` in policies; never inline the role lookup.

### Realtime precedent: `src/app/(hub)/customers/_customers-index.tsx:128-138`
```tsx
const supabase = createClient();               // @/lib/supabase/client
const channel = supabase.channel("...").on(...).subscribe();
return () => { supabase.removeChannel(channel); };
```
Presence is the same channel API: `channel.on("presence", { event: "sync" }, () => channel.presenceState())`, then `channel.track({...})` inside `.subscribe((status) => status === "SUBSCRIBED" && ...)`. Broadcast uses `channel.on("broadcast", { event: "page-saved" }, ...)` and `channel.send({ type: "broadcast", event: "page-saved", payload })`. Presence needs **no** migration (not a `postgres_changes` subscription).

### Debounce precedent: `src/hooks/use-auto-save.ts`
Default `debounceMs = 2000`. Mirror its timer/flush shape in `_use-wiki-draft.ts`. Don't reuse the hook directly; it's bound to the onboarding PATCH contract.

## Implementation Steps

1. **Migration 151** (`supabase/migrations/151_wiki_page_history_drafts.sql`, written not applied):
   - `alter table wiki_pages add column revision int not null default 0;`
   - `alter table wiki_page_versions add column revision int, add column kind text not null default 'publish' check (kind in ('save','publish','restore')), add column tags text[] not null default '{}', add column status text, add column restored_from uuid references wiki_page_versions(id) on delete set null;`. Legacy rows keep `kind='publish'`, `revision` null. Index `(page_id, created_at desc)`.
   - `create table wiki_page_drafts (page_id uuid references wiki_pages on delete cascade, user_id uuid references profiles on delete cascade, title text not null, content_html text not null, tags text[] not null default '{}', base_revision int not null, created_at, updated_at, primary key (page_id, user_id))` with an `update_updated_at_column` trigger. RLS: owner-only `for all` using `user_id = auth.uid() and get_my_role() in (writers)`.
   - `wiki_page_draft_holders(p_page_id uuid) returns table(user_id, full_name, email, updated_at, base_revision)` as **`security definer`**, `set search_path = public`, with a role gate `get_my_role() in (staff readers)` inside. Email comes from `auth.users`. `grant execute to authenticated`.
   - `wiki_save_page(p_page_id, p_base_revision, p_title, p_content_html, p_tags, p_status, p_kind, p_restored_from) returns wiki_pages` as **`security invoker`** so RLS still applies. In one transaction it runs `update wiki_pages set ..., revision = revision + 1, version = case when publishing then version + 1 else version end, updated_by = auth.uid() where id = p_page_id and revision = p_base_revision returning *`. If no row is updated it `raise exception using errcode = 'P0409'`, so the route can map the error to 409. Otherwise it inserts the snapshot row into `wiki_page_versions` (revision = new revision, version = new version, kind, tags, status, edited_by = auth.uid()) and deletes the caller's own `wiki_page_drafts` row.
   - Publish-only status change: call the same fn with the current content and `p_kind='publish'`. It bumps revision too, so a concurrent content editor still gets a 409 instead of silently racing the publish.
   - `wiki_restore_revision(p_page_id, p_revision_id, p_base_revision)` reads the snapshot and calls `wiki_save_page(..., p_kind='restore', p_restored_from=p_revision_id)` with the page's current status.
2. **Types.** Update `src/types/database.ts` (table rows + `Functions`) and `src/types/wiki.ts`.
3. **API.**
   - PATCH: require `baseRevision: number` for content/status saves (400 if missing). Call `supabase.rpc("wiki_save_page", ...)`. Map `P0409` to 409 and include the current `{revision, updatedBy, updatedAt}`.
   - GET detail: add `revision`, `myDraft` (own draft meta via RLS select, no content), and `draftHolders` (rpc, excluding self).
   - Add the revisions list/detail/restore and draft GET/PUT/DELETE routes, all RLS-based like the existing wiki routes (no `adminClient`). The list paginates with `.range()` per the 1000-row rule. Draft PUT validates payload size (reuse the existing content limits, if any; otherwise cap at ~2 MB) and normalizes tags with `normalizeWikiTags`.
4. **`src/lib/wiki/diff.ts`.** `pnpm add diff`. Parse both HTML strings with `DOMParser` (client-only module, only imported from client components) into block tokens `{ key: tag+normalizedText, html, text }`. `diffArrays` on keys. For adjacent removed+added pairs, emit a *modified* block with `diffWords(oldText, newText)` wrapped in `<ins>`/`<del>`, keeping the block tag. Pure added/removed blocks get a whole-block class. Images/tables compare by outer HTML. Return `{ inline: string, left: string, right: string, stats: {added, removed} }`. Plus `diffTags(a, b)`.
5. **Hooks.** `_use-wiki-presence.ts` (single `wiki-presence` channel mounted once in the shell; `track` updates when page/mode changes; exposes derived maps, excludes self; `broadcastSaved`). `_use-wiki-draft.ts` (enabled only in edit mode; debounced PUT; `flush()`; `discard()`; `beforeunload` while a debounce is pending).
6. **Shell wiring.** `enterEdit()` now: if `detail.myDraft` exists, fetch the draft and show the resume prompt (stale if `base_revision < detail.revision`, with a "View differences" option through the conflict modal in compare-only mode). Store `baseRevision`. `save()` sends `baseRevision`; on 409, open the conflict modal; on success, `broadcastSaved`. Page switch while editing: flush the draft first, then load (the draft survives). Subscribe to `page-saved` for the current page: in view mode show the reload banner; in edit mode show the conflict-ahead warning.
7. **UI.** Presence bar (editing-now + draft holders with `mailto:` + viewers stack), History button → `_wiki-history-panel.tsx` (replaces the doc body area while open; Esc/close returns), diff view with Inline/Side-by-side + "vs previous / vs current" toggles, Restore (writers only, confirm, sends `baseRevision`, handles 409), tree pencil indicator. Follow the existing wiki visual tokens (hex palette, `rounded-full text-[10-11px]` pills, `lucide-react` icons `History`, `RotateCcw`, `Pencil`, `Users`). Every async button gets a loading state; the history list gets an empty state ("No saved revisions yet. History starts with the next save."); icon-only buttons get `aria-label`s.
8. **CLAUDE.md.** Add the conventions bullet.
9. Run `npx tsc --noEmit` + `pnpm lint`. Keep new files under ~250 lines each and the shell under ~300.

## Acceptance Criteria

- [ ] After migration 151, saving a page 3 times shows 3 `Saved` revisions with the correct author/time. Publishing adds a `Published vN` row, and `v{n}` in the tree still only moves on publish.
- [ ] The diff for a revision highlights inserted/removed words inside changed paragraphs, whole added/removed blocks, title and tag changes, and works in both Inline and Side-by-side modes and against previous/current.
- [ ] Restore puts the old content back as a new `Restored from #N` revision. Restoring again from the pre-restore revision undoes it.
- [ ] Two browsers (users A and B) open Edit on the same page. Each sees "{other} is editing now" within ~2 s, and the tree shows the pencil on that page for the other user.
- [ ] A saves. B sees the conflict-ahead warning. B clicks Save → conflict dialog with the diff. "Overwrite with mine" succeeds, and A's version is still in History. "Reload theirs" keeps B's text available in the draft.
- [ ] B types, then closes the tab without saving. Reopening Edit offers "Resume draft", and the content is intact. A (viewing) sees "B has unsaved changes from {time}" with a working mailto link.
- [ ] A non-writer (`hr`) can open History and view diffs but sees no Restore/Edit, and a direct POST to restore is rejected by RLS.
- [ ] `client`/`marketing` get nothing from the revision/draft routes, and `wiki_page_draft_holders` returns no rows for them.
- [ ] No other user's draft content is retrievable via any route.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with 0 errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then: curl -s -o /dev/null -w "%{http_code}" localhost:3000/kb  → 307 (compile/boot smoke)
```
- Apply migration 151 (after 149/150) in a dev Supabase project, then run the two-browser acceptance pass above (two different staff accounts, or one normal + one incognito window).
- SQL spot checks: `select kind, revision, version from wiki_page_versions where page_id = ... order by created_at;` and calling `wiki_save_page` with a stale `p_base_revision` raises `P0409`.
- Unit-style sanity for `diff.ts`: run a scratchpad Node/jsdom script over two HTML fixtures (paragraph edit, list item insert, table cell change, image removed) and eyeball the output.

## Compatibility Touchpoints

- **Migration dependency:** 151 depends on 149 (and should apply after 150). 149/150 are still *written, not applied*, so the whole wiki stack must be applied in order before live testing.
- **API contract change:** PATCH `/api/wiki/pages/[pageId]` now **requires** `baseRevision` for content/status writes. The only caller is `_wiki-shell.tsx` (save + `changeStatus`). Check that the import/new-page flows (which use POST, not PATCH) are unaffected.
- **Supabase Realtime:** Presence/Broadcast use a public channel (no `realtime.messages` RLS in this repo). The payload is limited to userId/name/email/pageId/mode. Any authenticated session could technically join the channel, which is acceptable for internal staff names. Private-channel authorization is a follow-up if needed.
- **New dependency:** `diff` (jsdiff).
- **Docs:** CLAUDE.md conventions bullet; `_docs/mcp-tools.md` untouched (no MCP tool changes).
- **Follow-ups (not in scope):** real-time co-editing (Yjs + Hocuspocus), revision retention/pruning, private Realtime channel auth, notifying a draft holder via Cliq/email from the UI.

---

## Implementation Notes

### What Changed
- **Migration 151** (written, not applied): `wiki_pages.revision`; `wiki_page_versions` extended into a full revision log (`revision`, `kind`, `tags`, `status`, `restored_from`); `wiki_page_drafts` (owner-only RLS); `wiki_page_draft_holders()` (definer, identity + timestamps only); `wiki_save_page()` (invoker; conditional update on `revision`, snapshot insert, own-draft delete, one transaction; `P0409`/`P0404`/`42501`); `wiki_restore_revision()`.
- **API**: PATCH now requires `baseRevision` and goes through the RPC (409 carries `{revision, updatedBy, updatedAt}`). GET detail adds `revision`, `myDraft`, `draftHolders`. New routes: revisions list (paginated with `.range()`), revision detail (+ predecessor), restore, and own-draft GET/PUT/DELETE.
- **Diff engine** `src/lib/wiki/diff.ts` (jsdiff v9): block tokenize → `diffArrays` → edit runs aligned by block kind (a second `diffArrays` over tag names) → `diffWords` inside paired text blocks. Tables, code, images and hr are shown whole as removed/added. Formatting-only changes are flagged separately.
- **UI**: History view (revision list with author/kind/time, contributors summary, "Changes in this revision" / "Compare with current", Inline / Side-by-side, Restore with confirm). Presence bar (editing now + mailto, draft holders + mailto, also-viewing stack, "X updated this page · Reload" notice). Tree pencil indicator (tree + search results). Draft autosave label beside Save. Resume-draft / stale-draft compare / keep-or-discard-on-cancel / 409 conflict dialogs (Keep editing / Load theirs, keep mine as draft / Overwrite with mine).

### Files Changed
- `supabase/migrations/151_wiki_page_history_drafts.sql` - new schema + RPCs
- `src/types/database.ts` - new columns, `wiki_page_drafts`, 3 functions
- `src/types/wiki.ts` - revision/draft/presence/conflict types; `WikiPageDetail` + `revision`/`myDraft`/`draftHolders`
- `src/app/api/wiki/pages/[pageId]/route.ts` - GET meta; PATCH via RPC with 409
- `src/app/api/wiki/pages/[pageId]/revisions/route.ts` - new
- `src/app/api/wiki/pages/[pageId]/revisions/[revisionId]/route.ts` - new
- `src/app/api/wiki/pages/[pageId]/revisions/[revisionId]/restore/route.ts` - new
- `src/app/api/wiki/pages/[pageId]/draft/route.ts` - new
- `src/lib/wiki/save-errors.ts` - new; shared SQLSTATE → HTTP mapping + 409 body
- `src/lib/wiki/diff.ts` - new
- `src/app/(hub)/kb/_use-wiki-presence.ts` - new; Realtime Presence + Broadcast
- `src/app/(hub)/kb/_use-wiki-draft.ts` - new; debounced server draft autosave
- `src/app/(hub)/kb/_use-wiki-editor.tsx` - new; edit/save/conflict/resume state machine + dialogs
- `src/app/(hub)/kb/_use-wiki-live.ts` - new; stale notice, draft-meta refresh, tree editing map
- `src/app/(hub)/kb/_wiki-presence-bar.tsx`, `_wiki-history-panel.tsx`, `_wiki-diff-view.tsx`, `_wiki-conflict-modal.tsx` - new UI
- `src/app/(hub)/kb/_wiki-prose.ts` - new; read-mode prose classes shared by doc panel + diff view
- `src/app/(hub)/kb/_wiki-shell.tsx` - rewired (edit state moved into hooks)
- `src/app/(hub)/kb/_wiki-doc-panel.tsx` - History button, presence slot, draft label, prose constant
- `src/app/(hub)/kb/_wiki-tree-panel.tsx`, `_wiki-tree-panel-rows.tsx`, `_wiki-space-list.tsx` - editing indicator plumbing
- `src/app/(hub)/kb/page.tsx` - passes `currentUser` (id, `full_name`, email from JWT claims)
- `package.json` / `pnpm-lock.yaml` - `diff@^9.0.0`
- `CLAUDE.md` - wiki history/edit-safety conventions bullet

### Deviations From Plan
- **Two extra hooks** (`_use-wiki-editor.tsx`, `_use-wiki-live.ts`) and **`_wiki-prose.ts`**. The plan listed only the presence/draft hooks, but the shell would otherwise have been ~380 lines. It's 336 now and wiring-only. `_use-wiki-editor.tsx` returns the dialogs as a ReactNode, so it's `.tsx`.
- **`src/lib/wiki/save-errors.ts`** was added so the PATCH and restore routes share the SQLSTATE → HTTP mapping and the 409 body.
- **`page.tsx` modified** (not in the plan's table): the shell needs the current user's id/name/email for presence.
- **Status-only changes that aren't a publish** (→ draft/archived) create a `save` revision too. They go through the same RPC so they're conflict-checked.
- **PATCH `parentId`-only** requests skip the RPC. There's no caller today, and a move is structural, not content.
- **Presence hook** depends on primitive user fields, not the `currentUser` object. `router.replace` re-renders the server page on each page select, and a new object would resubscribe the channel every click.
- **Diff pairing**: positional pairing misaligned mixed-kind runs in a jsdom fixture test (a table paired against a list item). Switched to kind-aligned pairing. Ordered-list items render as bullets in the diff view only.
- **Legacy snapshots** (pre-151, `revision` null) never recorded tags. Restore keeps current tags for them, but the diff view shows a legacy side as tag-less, so a "compare" against a legacy row lists the page's tags as removed. This is a known cosmetic limitation.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (0 errors; 2 pre-existing unrelated warnings in `_checklist-tab.tsx`)
- `src/lib/wiki/diff.ts` fixture run (scratchpad, esbuild + jsdom) - PASS: word-level `<del>/<ins>` inside an edited paragraph, added list item, table shown whole removed/added, bold-only change flagged as format change, removed image, `diffTags` case-insensitive
- Dev-server smoke (`localhost:3000`) - PASS: `/kb` 307, all 4 new routes compile and return 401 unauthenticated (no 500s)
- Migration 151 apply + two-browser acceptance pass - NOT RUN: migrations 149/150/151 are still written, not applied, and there's no live session. Impeccable design-hook `font-size` flags on 12px/14px were classified as false positives: DESIGN.md itself specifies 12px button text, the sizes match the shipped `ConfirmDialog` chrome, and the hook reported its sidecar as stale. The one real flag (18px diff title) was fixed to 15px.

---

## Quality Gate Notes

### Result
PASS

### Standards Review
Changed files were identified from Implementation Notes (no git commands, per the project rule) and re-read against the task doc and the CLAUDE.md conventions. Four defects were found and **fixed in this stage**:
- **Lost-edits window on failed save** (`_use-wiki-editor.tsx`). `save()` calls `draft.settle()`, which cancels the queued draft write. If the PATCH then 409'd or errored, the last ~2 s of edits were neither saved nor autosaved, and the `beforeunload` guard (keyed on a pending timer) no longer fired. `submit()` now returns a success boolean, and `save()` calls `draft.persistNow()` when it's false.
- **Stale timer on revert** (`_use-wiki-draft.ts`). Reverting edits back to the baseline left the pending timer armed, so it still PUT a no-op draft and left the status at "Unsaved changes". The effect now clears the timer first and bails when not dirty.
- **Diff recomputed every render** (`_wiki-diff-view.tsx`). The memo was keyed on side objects that callers build inline (`valuesOf(...)`), so the DOM-parsing diff re-ran on every shell render. It's now keyed on the primitive fields and array references.
- **Missing loading state** (CLAUDE.md "every async action needs a loading state"). Edit, which fetches the user's draft first, had no feedback. `useWikiEditor` exposes `entering`, and the doc panel disables Edit and shows a spinner meanwhile.

Checked with no issues: no `any`, no dead or commented-out code, no debug logging beyond the repo's existing `console.error` route pattern, and no secrets. RLS-only permission in the routes (no `adminClient`) matches the existing wiki routes. The `.range()` pagination on the revision list follows the 1000-row rule. Diff output is DOMPurify'd before render. The `isDark`/`dark:` rule doesn't apply (the /kb wiki is light-only hex tokens, like its siblings). Icon-only buttons have `aria-label`, there are no `<div onClick>` handlers, and `lucide-react` is the only icon source. Every new file is ≤271 lines. The shell is at 337, down from the 378 before extraction, and is wiring-only.

Minor, left as-is:
- The two date formatters are near-duplicates: `timeOf` in the editor hook and `formatDateTime` in the history panel, one line each. They're too small to justify a shared module.
- PATCH does an extra `select status` round trip to label the revision kind (`publish` vs `save`), outside the RPC transaction. Only the label can race; the version-bump logic itself is atomic inside the RPC.
- The `editorsKey` effect in `_use-wiki-live.ts` also fires once on mount, which duplicates the initial detail fetch with one extra GET.

### Deviations
- **Minor:** `_use-wiki-editor.tsx`, `_use-wiki-live.ts`, `_wiki-prose.ts` and `src/lib/wiki/save-errors.ts` weren't in the planned file table. They're pure extractions for file size and reuse, with no new behavior.
- **Minor:** `page.tsx` was modified to pass `currentUser`, which presence needs to identify the user.
- **Minor:** non-publish status changes (→ draft/archived) create a `save` revision, because they go through the same conflict-checked RPC.
- **Minor:** a PATCH with only `parentId` bypasses the RPC. There's no caller today, and a move is structural.
- **Medium (visible to user, acceptable):** pre-151 legacy snapshots have no tags. Restore keeps the page's current tags for them, but diffs against a legacy row list the page's tags as removed. This is cosmetic, affects only rows written before migration 151, and is documented.
- **Medium (visible to user, acceptable):** the presence channel is public. Any authenticated session could join and see staff names and emails, including `client`/`marketing` roles, which otherwise have no /kb access. This is documented in the plan and CLAUDE.md as a follow-up (private channel with `realtime.messages` RLS).
- **Major:** none.

### Required Fixes
None outstanding. The four defects above were fixed and re-verified: `npx tsc --noEmit` PASS, `pnpm lint` 0 errors (2 pre-existing unrelated warnings).
