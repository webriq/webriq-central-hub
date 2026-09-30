# 407: Wiki — Draft Pages Visible Only to Their Creator (and Admins)

**Created:** 2026-09-30
**Priority:** HIGH
**Type:** fix
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

`wiki_pages.status` (`draft|published|archived`) was only a label: migration 149's RLS let every staff role read every page, and the list/detail routes and UI never filtered on status, so another user's Draft page was visible (and, for pm/developer, editable) to everyone. Decisions (user, 2026-09-30): admins/super_admins see all drafts; drafts are creator-only otherwise (no sharing); publish-gated *edits* to already-published pages are a separate task (408).

## Requirements

- [x] A `draft` page is readable/updatable/deletable only by its `created_by` and admin/super_admin; `published`/`archived` behave as before (staff read, pm/developer/admin write, hr read-only).
- [x] Enforced in RLS (all wiki routes/RPCs use the caller's client; `wiki_save_page`/`wiki_restore_revision` are `security invoker`), not just in the UI.
- [x] Revisions (`wiki_page_versions`) of a hidden draft are hidden; `wiki_page_draft_holders()` (security definer) re-applies the rule.
- [x] A non-creator cannot flip a published page back to Draft (would make it vanish for them) — RLS `WITH CHECK` + the status dropdown hides "Draft" for them.

## Out of Scope / Must-Not-Change

- Draft *sharing*/collaborator lists.
- Working-copy vs live content for published pages → task 408.
- Backfilling `created_by` for legacy rows.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/152_wiki_draft_visibility.sql` | Create | `can_see_wiki_draft()`; split `wiki_pages` policies into select/insert/update/delete (a `for all` policy would still OR-expose drafts on SELECT); versions read follows page visibility; `wiki_page_draft_holders` guard. **Written, not applied.** |
| `src/app/(hub)/wiki/page.tsx` | Modify | Pass `isAdmin` |
| `src/app/(hub)/wiki/_wiki-shell.tsx` | Modify | Compute `canSetDraft` |
| `src/app/(hub)/wiki/_wiki-doc-panel.tsx` | Modify | Hide "Draft" status option unless creator/admin (or already draft) |

## Compatibility Touchpoints

- Rows with `created_by is null` (pre-existing/imported) that are currently `draft` become admin-only until published — check for any before applying.
- A published child under a hidden draft parent shows at the tree root (`buildTree` already treats a missing parent as root).
- Until migration 152 is applied nothing changes in the DB; the UI change alone only hides the Draft option for non-creators.

## Acceptance Criteria

- [ ] User A creates a draft; user B (pm/developer) doesn't see it in the tree, can't open it by URL/id (404), can't see its history; admin can.
- [ ] A publishes it → B sees it.
- [ ] B cannot set a published page created by A back to Draft.
- [ ] `npx tsc --noEmit` passes.

## Verification

- `npx tsc --noEmit` — PASS. Migration not applied and RLS behaviour not exercised by the agent; acceptance items above are untested.

## Follow-up

- Task 408 (publish-gated edits). Real per-role tests against the DB after applying 152.
