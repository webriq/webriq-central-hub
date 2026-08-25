# 299: Issue Comments Panel — Attachment Upload RLS Failure + setState-During-Render Warning

**Created:** 2026-08-25
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** fast
**Status:** Completed

---

## Overview

Two independent bugs reported on the Issue Detail page's Comments/Attachments panel (`IssueAttachmentsCommentsPanel`, legacy project tree):

1. **Attachment upload fails with a storage RLS violation.** Posting a comment with a file attached returns `500` from `POST /api/v2/projects/{projectId}/issues/{issueId}/comments/{commentId}/attachments`, logged server-side as `upload failed: new row violates row-level security policy`. The comment itself posts successfully; only the attachment upload fails, surfaced in the UI as "Comment posted — 1 of 1 attachment(s) failed to upload."
2. **React console warning:** `Cannot update a component (IssueAttachmentsCommentsPanel) while rendering a different component (IssueComments)`, pointing at `onCommentsCount`/`onAttachmentsCount` in `_issue-attachments-comments-panel.tsx:48-49`, triggered from inside `_issue-comments.tsx`.

### Root cause 1 — storage bucket write policy excludes `developer`

The `attachments` table's own RLS has granted the `developer` role insert-only rights since migration 026 (`attachments_developer_insert`: `get_my_role() = 'developer' and uploaded_by = auth.uid()`). The comment block at the top of the attachments route (`src/app/api/v2/projects/[projectId]/issues/[issueId]/comments/[commentId]/attachments/route.ts:6-10`) explicitly relies on this, asserting "no app-level role/ownership check is needed on POST... `attachments_pm_write` / `attachments_developer_insert` RLS scope the actual insert."

That assumption is only half true: the file itself has to land in the `project-assets` **storage bucket** before the `attachments` table row is ever inserted (`route.ts:98-105`), and the bucket's own object-level write policy — `project_assets_staff_write`, created in `supabase/migrations/050_project_assets_storage.sql` — only allows `admin`, `super_admin`, `pm`. `developer` was never added there. So a developer-role user's `supabase.storage.from("project-assets").upload(...)` call is rejected by Postgres RLS on `storage.objects` before the code ever reaches the attachments-table insert the route's own comment relies on — which matches the exact error string in the report ("new row violates row-level security policy") and the fact that the *comment* posts fine (that's a different table, `issue_comments`, with its own working policy) while the *attachment* fails.

This is a bucket-level gap, not something specific to comments — the same `project-assets` bucket backs plain task/issue attachments too (`src/app/api/v2/projects/[projectId]/tasks/[taskId]/attachments/route.ts` uses the identical `createClient()` + `storage.upload()` pattern), so any developer-role user hits the same failure uploading a task attachment, not just a comment attachment. The fix therefore belongs in a migration adding a developer-scoped storage policy, which naturally covers both paths — it is not scope creep, it's the actual location of the bug.

### Root cause 2 — `onCountChange` called from inside a `setState` updater

`_issue-comments.tsx`'s `postComment()` (lines 181-185) and `deleteComment()` (lines 198-202) call the panel-supplied `onCountChange` prop **from inside** the functional updater passed to `setComments(...)`:

```tsx
setComments((prev) => {
  const next = [...prev, { ...created, attachments, legacyAttachments: [] }];
  onCountChange?.(next.length); // side effect inside a state updater — not allowed
  return next;
});
```

`onCountChange` ultimately calls `setCounts` in the *parent* component (`IssueAttachmentsCommentsPanel`). React requires `setState` updater functions to be pure; invoking a different component's setter as a side effect inside one is exactly the "Cannot update a component while rendering a different component" class of warning, and the stack trace in the report confirms it (`onCommentsCount` fired from inside `IssueComments`' render/update cycle). The same anti-pattern also exists in the fetch `.then()` at line 100-103 (`setComments(data); onCountChange?.(data.length);` — not itself inside an updater, but redundant with the fix below and worth consolidating).

The sibling **Attachments** tab in the same panel, `_issue-attachments.tsx`, has the identical anti-pattern in three places: the realtime `INSERT` handler, the realtime `DELETE` handler, and `handleDelete()` (all `setAttachments((prev) => { ...; onCountChange?.(next.length); return next; })`). Same panel, same bug shape, same fix — left unfixed it will throw the identical warning the next time a developer/PM adds or removes a plain issue attachment. In scope for this task.

`_task-comments.tsx` / `_task-attachments.tsx` (Task Detail page's mirror of these two files, explicitly documented in-code as copy-adapted) carry the exact same latent defect but were not reported and are not part of the page currently being tested — left out of scope, called out below for a possible follow-up task.

## Requirements

- [ ] A `developer`-role user can successfully upload a file attachment on an issue comment (the exact flow in the bug report) without a 500/RLS error.
- [ ] A `developer`-role user can successfully upload a file attachment directly on the Attachments tab (same bucket, same fix) — regression-checked, not the reported bug itself.
- [ ] No React "Cannot update a component while rendering a different component" warning appears in the console when posting or deleting an issue comment, or when adding/deleting a plain issue attachment.
- [ ] The Comments/Attachments tab-label counts in `IssueAttachmentsCommentsPanel` still update correctly and immediately after: initial load, posting a comment (with or without attachments), deleting a comment, adding an attachment (via upload or realtime), deleting an attachment.
- [ ] No change to existing `admin`/`super_admin`/`pm` upload behavior (still works exactly as before).

## Out of Scope / Must-Not-Change

- `_task-comments.tsx` / `_task-attachments.tsx` (Task Detail page's mirrored files) — identical latent `onCountChange`-inside-updater defect confirmed present, but not reported and not touched by this task. Flag as a known follow-up for a separate task if the user wants it fixed proactively.
- `attachments_pm_write` / `attachments_developer_insert` (the `attachments` table's own RLS, migration 026/048) — already correct; not modified.
- `customer-assets` and `task-content` storage buckets (migrations 057, 091) — different buckets, not affected by this bug, not touched.
- The `TaskAttachmentPicker` / `TaskAttachmentViewerModal` / `AttachmentDropzone` shared components — no defect found in them; not modified.
- Any change to the 25MB/mime-type allow-list validation in the attachments route — unrelated to either bug.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/115_project_assets_developer_insert.sql` | Create | Add a `developer`-scoped INSERT policy on `storage.objects` for the `project-assets` bucket, closing the RLS gap that causes root cause 1. |
| `src/app/(hub)/projects/legacy/[projectId]/issues/[issueId]/_issue-comments.tsx` | Modify | Move `onCountChange` out of the `setComments` updaters (postComment, deleteComment) and the fetch `.then`, into a single `useEffect` keyed on `comments.length`. |
| `src/app/(hub)/projects/legacy/[projectId]/issues/[issueId]/_issue-attachments.tsx` | Modify | Same consolidation for `setAttachments` — remove `onCountChange` from the realtime INSERT/DELETE handlers, `handleDelete`, and the fetch `.then`; add one `useEffect` keyed on `attachments.length`. |

## Code Context

### `supabase/migrations/050_project_assets_storage.sql` (existing policy, for reference — do not edit)

```sql
drop policy if exists "project_assets_staff_write" on storage.objects;
create policy "project_assets_staff_write"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'project-assets'
    and get_my_role() in ('admin', 'super_admin', 'pm')
  )
  with check (
    bucket_id = 'project-assets'
    and get_my_role() in ('admin', 'super_admin', 'pm')
  );
```

### New migration — `supabase/migrations/115_project_assets_developer_insert.sql`

```sql
-- Migration 115: developer insert access on project-assets storage bucket
--
-- attachments_developer_insert (migration 026) has let developers insert rows into the
-- `attachments` table since day one, but the underlying `project-assets` storage bucket never
-- got a matching object-level policy — project_assets_staff_write (migration 050) only covers
-- admin/super_admin/pm. A developer's storage.upload() call was therefore rejected by RLS on
-- storage.objects before the request ever reached the attachments-table insert, surfacing as
-- "new row violates row-level security policy" on every attachment upload a developer attempted
-- (task/issue attachments and issue-comment attachments alike — task 299).
--
-- Insert-only, mirroring attachments_developer_insert's scope (developers can add new files;
-- update/delete of others' objects stays admin/super_admin/pm-only via the existing policy).
-- Uses get_my_role() (migration 026) — never replicate the role lookup inline.

drop policy if exists "project_assets_developer_insert" on storage.objects;
create policy "project_assets_developer_insert"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'project-assets'
    and get_my_role() = 'developer'
  );
```

### `_issue-comments.tsx` (current, lines 97-190 excerpted) — remove inline `onCountChange`, add effect

```tsx
const fetchComments = useCallback((signal?: AbortSignal) => {
  return fetch(`/api/v2/projects/${projectId}/issues/${issueId}/comments`, { signal })
    .then((r) => (r.ok ? r.json() : []))
    .then((data: CommentRow[]) => {
      setComments(data);
      // onCountChange call removed from here — handled by the effect below
    })
    .catch(() => {});
}, [projectId, issueId]);

// New — single place that reports the count, outside any setState updater.
useEffect(() => {
  onCountChange?.(comments.length);
}, [comments.length, onCountChange]);
```

```tsx
// postComment() — remove the onCountChange call from inside the updater:
setComments((prev) => [...prev, { ...created, attachments, legacyAttachments: [] }]);
```

```tsx
// deleteComment() — same removal:
setComments((prev) => prev.filter((c) => c.id !== commentId));
```

`onCountChange` is a stable `useCallback` from the parent panel (empty dep array in `_issue-attachments-comments-panel.tsx:48-49`), so including it in the new effect's deps is safe and won't cause extra re-fires.

### `_issue-attachments.tsx` (current, lines 138-203 excerpted) — same consolidation

```tsx
useEffect(() => {
  const ctrl = new AbortController();
  fetch(`/api/v2/projects/${projectId}/issues/${issueId}/attachments`, { signal: ctrl.signal })
    .then((r) => (r.ok ? r.json() : []))
    .then((data: AttachmentRow[]) => {
      setAttachments(data);
      // onCountChange call removed from here
    })
    .catch(() => {})
    .finally(() => setLoading(false));
  return () => ctrl.abort();
}, [projectId, issueId]);

// New — single place that reports the count.
useEffect(() => {
  onCountChange?.(attachments.length);
}, [attachments.length, onCountChange]);
```

Realtime INSERT/DELETE handlers and `handleDelete` drop their `onCountChange?.(next.length)` lines and just return `next`/the filtered array — the new effect above picks up the change once `attachments` re-renders.

## Implementation Steps

1. Create `supabase/migrations/115_project_assets_developer_insert.sql` with the policy shown above. Do not apply it automatically — this project's convention (see recent migrations 113/114 task docs) is that the user applies migrations to the remote database manually.
2. In `_issue-comments.tsx`: remove the `onCountChange?.(data.length)` call from `fetchComments`'s `.then`, remove `onCountChange?.(next.length)` from inside both `setComments` updaters in `postComment` and `deleteComment` (keep the updaters themselves, just return the computed array directly), and add the new `useEffect` reporting `comments.length`.
3. In `_issue-attachments.tsx`: same pattern — strip `onCountChange` calls out of the fetch `.then`, the realtime INSERT/DELETE handlers, and `handleDelete`, then add the new `useEffect` reporting `attachments.length`.
4. Run `npx tsc --noEmit` to confirm no type regressions from the refactor.
5. Ask the user to apply migration 115 to the remote database (per this project's manual-migration convention), then browser-verify as a developer-role account: post an issue comment with a file attachment (the exact repro from the bug report) and confirm it uploads without error; also add/delete a plain issue attachment; watch the browser console for the "Cannot update a component..." warning during both flows and confirm it's gone; confirm the Comments/Attachments tab counts still update live in each case.

## Acceptance Criteria

- [ ] Developer-role user: posting an issue comment with an attached file succeeds — no "Comment posted — 1 of 1 attachment(s) failed to upload" message, no 500 in the network tab, no RLS error in server logs.
- [ ] Developer-role user: uploading directly via the Attachments tab also succeeds.
- [ ] No "Cannot update a component while rendering a different component" warning in the console across: initial panel load, posting a comment, deleting a comment, adding an attachment, deleting an attachment.
- [ ] Tab-label counts on `IssueAttachmentsCommentsPanel` reflect the true count immediately after every one of the actions above.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new errors.
- [ ] Existing admin/pm upload flow unaffected (still works).

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then browser-check as a developer-role account: post a comment with an attachment,
           # add/delete a plain attachment, watch console for the setState warning
```

## Compatibility Touchpoints

- Migration 115 must be applied to the remote Supabase database before the RLS fix takes effect — code changes alone do not fix bug 1. Flag this clearly to the user, matching the pattern already used for migrations 113/114 (written but pending manual application).
- No API contract changes — both route files and their request/response shapes are untouched; this is a storage-policy-only fix plus a client-side state-update ordering fix.
- No change to `attachments_pm_write` / `attachments_developer_insert` (table-level RLS) — those already function correctly; only the storage-bucket layer was missing coverage.

## Implementation Notes

### What Changed
- Added a new storage policy granting the `developer` role INSERT rights on `storage.objects` for the `project-assets` bucket, closing the RLS gap that caused root cause 1 (matches the existing `attachments_developer_insert` table-level policy's insert-only scope).
- In `_issue-comments.tsx`: removed `onCountChange?.(...)` from inside the `fetchComments` `.then` and from inside the `setComments` functional updaters in `postComment` and `deleteComment`; added one `useEffect` keyed on `comments.length` that reports the count to the parent panel outside any render/update cycle.
- In `_issue-attachments.tsx`: same consolidation — removed `onCountChange?.(...)` from the fetch `.then`, both realtime `INSERT`/`DELETE` branches, and `handleDelete`; added one `useEffect` keyed on `attachments.length`.
- Removed the two now-unnecessary `eslint-disable-next-line react-hooks/exhaustive-deps` comments on the fetch effects in both files — the comments existed to justify omitting `onCountChange` from the fetch effect's deps (to avoid redefining `fetchComments`/refiring other effects); since `onCountChange` is no longer referenced inside those effects at all, the suppression comment no longer applies and would itself become a stale/misleading artifact if left in.

### Files Changed
- `supabase/migrations/115_project_assets_developer_insert.sql` — new migration, developer INSERT policy on `project-assets` bucket objects.
- `src/app/(hub)/projects/legacy/[projectId]/issues/[issueId]/_issue-comments.tsx` — moved count reporting out of `setState` updaters into a dedicated effect.
- `src/app/(hub)/projects/legacy/[projectId]/issues/[issueId]/_issue-attachments.tsx` — same consolidation for the Attachments tab.

### Deviations From Plan
- None — matches the task document's Proposed File Changes, Code Context, and Implementation Steps exactly. The removal of the two stale `eslint-disable` comments (noted above) is a direct, necessary consequence of the planned refactor rather than a separate change.
- Pre-existing `impeccable` design-hook findings (literal font-size values off the documented type ramp, and one dynamic-`src` `<img>` in the lightbox click handler) fired on every edit to both files. All are pre-existing conditions unrelated to this task's scope (RLS + setState fix only) and were left unchanged per the task document's Out-of-Scope boundary and CLAUDE.md's UI Polish conventions (don't retrofit unrelated shipped patterns while fixing something else).

### Verification Run
- `npx tsc --noEmit` - PASS (no output, no errors)
- `pnpm lint` - PASS (0 errors; 2 pre-existing `no-unused-vars` warnings in `onboarding-workspace/_checklist-tab.tsx`, a file this task never touched — unrelated)
- `pnpm dev` browser spot-check - SKIPPED (not run interactively during this pass). Migration 115 must be applied to the remote Supabase database first — code changes alone don't fix the RLS bug. Recommend the human reviewer: (1) apply migration 115 to the remote DB, (2) as a developer-role account, post an issue comment with a file attachment (the exact repro from the bug report) and confirm it uploads without error, (3) add/delete a plain issue attachment, (4) watch the browser console across all of the above for the "Cannot update a component..." warning and confirm it no longer appears, (5) confirm the Comments/Attachments tab-label counts still update live in every case.

## Quality Gate Notes

### Result
PASS

### Standards Review
- Migration 115 matches the exact style/conventions of sibling migrations (050, 057, 091): `drop policy if exists` + `create policy`, `get_my_role()` helper (never inlined), header comment explaining the why. No secrets, no destructive statements.
- Both component diffs are minimal and surgical — no unused imports, no new `any`, no dead code left behind. The two stale `eslint-disable-next-line react-hooks/exhaustive-deps` comments were correctly removed alongside the code they were justifying (leaving them would have been a misleading artifact referencing a dependency omission that no longer exists).
- The new count-reporting `useEffect` in each file carries a one-line comment explaining the non-obvious *why* (React updater-purity rule, the exact warning it prevents, task 299) — matches CLAUDE.md's "only comment the non-obvious" convention, not a restated what-this-does comment.
- All `setComments`/`setAttachments` updaters are now pure (return a derived array, no side effects) — confirmed by reading every call site in both files, not just the ones the task doc called out.
- No RLS/table-level policy touched (`attachments_pm_write`, `attachments_developer_insert` untouched, confirmed by absence from the diff) — matches the Out-of-Scope boundary.
- No stray edits to `_task-comments.tsx`, `_task-attachments.tsx`, `customer-assets`/`task-content` migrations, or the shared attachment components — confirmed untouched.

### Deviations
- Minor — the new count-reporting effect fires once on initial mount using the just-initialized empty local state (`comments`/`attachments` = `[]`), so the parent panel's tab label briefly shows "(0)" for the duration of the initial fetch, then updates to the real count once data loads. Previously, no count was reported until the fetch's `.then` resolved, so the tab showed no parenthetical count at all during that same loading window. This is a strictly cosmetic difference (a very short-lived "(0)" flash instead of no number), doesn't violate any Requirement or Acceptance Criterion, and is an inherent, acceptable consequence of decoupling count-reporting from the fetch callback the way the task doc specified — not something to fix.

### Required Fixes
None — no Major deviations found.

## Final Status

Marked **Completed** at the user's explicit request. No independent `test`-stage browser pass was run in this session (no interactive browser was connected here). Follow-up testing on the Task Comments panel (legacy) surfaced two more instances of the same bug family this task didn't reach — a 6-file repeat of the `onCountChange`-in-updater pattern outside legacy Issue Comments, and a separate duplicate-comment-key race condition — both fixed under task 301, which also confirmed via code inspection that **migration 115** (this task's own deliverable) is bucket-level, not comment-specific: it covers task-attachment and task-comment-attachment uploads too, not only issue comments. Migration 115's applied status on the remote database remains the one dependency outside this session's control — confirm it's applied before treating either task's RLS fix as live.
