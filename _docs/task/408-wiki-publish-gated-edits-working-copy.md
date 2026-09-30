# 408: Wiki — Edits to Published Pages Stay Private Until Published (Working Copy)

**Created:** 2026-09-30
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

Task 407 hides *Draft pages* from other users. It does not change how a **published** page is edited: today every Save writes straight into `wiki_pages.content_html`, so a colleague's saved edit is instantly live for everyone; Publish only flips `status` and bumps `version`. The requirement: changes to a page are visible only to the editor until they Publish.

## Requirements

- [ ] Separate live content from the editor's working copy: a published page keeps serving its last-published `content_html`/`title`/`tags` to readers while Saves go to a per-editor (or per-page) working copy. Options to evaluate: (a) new `wiki_page_working_copies` table (one row per page+user, owner-only RLS, like `wiki_page_drafts` but *explicitly saved*, with history), (b) treat the latest `save`-kind row in `wiki_page_versions` as the working copy and keep `wiki_pages.content_html` = last published. Pick in the design step.
- [ ] Save writes the working copy (still conflict-checked); Publish promotes it to the live columns, bumps `version`, appends a `publish` snapshot.
- [ ] Editor UI: clear "Unpublished changes" indicator + Publish / Discard changes actions; readers/exports/search/diff/History resolve the right content.
- [ ] Decide multi-editor semantics (one shared working copy per page vs one per user) and how it interacts with task 402's `revision` optimistic-concurrency token and the presence/`page-saved` broadcasts.
- [ ] Restore (task 402) targets the working copy, not the live page.

## Out of Scope / Must-Not-Change

- Draft-page visibility (task 407); real-time co-editing (Yjs) stays deferred.

## Compatibility Touchpoints

- Touches `wiki_save_page`, `wiki_restore_revision`, `PATCH /api/wiki/pages/[pageId]`, every reader of `content_html` (doc panel, exports, diff, import), and `_use-wiki-editor.tsx`/`_use-wiki-draft.ts`. Needs its own migration (written, not applied).

## Acceptance Criteria

- [ ] Editor A saves changes to a published page; user B still sees the previously published content; A sees their changes with an "Unpublished changes" marker.
- [ ] A publishes → B sees the new content, `v{n}` bumps once.
- [ ] Discard drops the working copy; History reflects saves and publishes distinctly.
