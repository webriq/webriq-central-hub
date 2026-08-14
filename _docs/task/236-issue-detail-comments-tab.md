# 236: Issue Detail — Live Comments Tab (Rich Text + Attachments)

**Created:** 2026-08-13
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced

---

## Overview

Second of three follow-ups to task 234 (Issue Detail redesign + RBAC + timer), which deferred full
Task-Detail-parity tabs to separate tasks. This one adds a live Comments tab to Issue Detail, mirroring
Task Detail's own (`_task-comments.tsx`, tasks 206/212): rich-text compose box, optional file
attachments per comment, chronological thread.

**This requires an RLS change, unlike task 235's Attachments tab.** `issue_comments` (migration 052)
was deliberately built as **import-only** — its own migration comment says so explicitly: *"Issue
Comments has no such live-compose UI yet — this table is pure imported historical data, so RLS mirrors
`issues`' own staff-read/pm-write pattern instead of task_comments' 3-policy split."* Confirmed by
reading both policies directly: `issue_comments_pm_write` (`for all`) is admin/super_admin/pm only —
there is no equivalent of `task_comments_staff_insert` (which lets any staff role, including developer,
insert a comment with `author_id = auth.uid()`) or `task_comments_delete` (own-comment delete). This
task is what turns that "not yet" into "now" — same read/insert/delete 3-policy split task_comments
already has, applied to `issue_comments`.

`issue_comments.author_id` already exists (`uuid references auth.users(id) on delete set null`,
nullable to preserve Zoho-imported comments with no Hub account) — no column changes needed, only RLS.

## Requirements

1. New `Comments` tab/section on Issue Detail — standalone `Card` if landing before 235/237, merged tab
   panel if landing after (see task 235's note on landing order).
2. Rich-text compose box (mirror `_comment-editor.tsx`) + optional file attachment picker, matching
   Task Detail's exact composer UX.
3. Any staff role with page access (admin/super_admin/pm/developer) can post a comment — comments are
   not gated by `getIssueEditPermission` (matches `task_comments`: any staff viewer can comment,
   regardless of edit rights on the issue itself — commenting is participation, not editing).
4. A commenter can delete their own comment; admin/super_admin can delete any (mirror
   `task_comments_delete`'s `admin`-only override — note this is **not** the same role set as
   `getIssueEditPermission`'s `canEditDetails`, it's the narrower `task_comments_delete` precedent:
   `admin` only, not `pm`/`super_admin` — verify against the live `task_comments_delete` policy at
   implementation time and either match it exactly or flag the discrepancy for a decision, since PM
   not being able to moderate comments may be an oversight worth fixing on both entities at once
   rather than an intentional asymmetry to preserve).
5. Imported Zoho comments (`author_id is null`, `author_name`/`author_email` populated) continue to
   display correctly alongside new live comments, same fallback-to-text-author pattern
   `_task-comments.tsx` already uses.
6. `npx tsc --noEmit` and `pnpm lint` pass.

## Out of Scope / Must Not Change

- Task comments (`tasks/[taskId]/_task-comments.tsx`, its API/RLS) — untouched.
- Attachments and Time Logs tabs — tasks 235/237.
- Comment editing — matches task 206's own "no edit/delete UI yet" boundary for task comments (delete
  only, no edit), staying consistent rather than giving issues a richer comment feature than tasks have.

## Proposed File Changes

- `supabase/migrations/101_issue_comments_live_rls.sql` (new) — adds
  `issue_comments_staff_insert`/`issue_comments_delete`, mirroring `task_comments_staff_insert`/
  `task_comments_delete` exactly (see Code Context). Does **not** remove `issue_comments_pm_write` —
  PM/Admin keep their existing broad write access (needed for admin cleanup of imported data); the new
  policies are additive (RLS policies are OR'd together per operation).
- `src/app/api/v2/issues/[issueId]/comments/route.ts` (new) — `GET`/`POST`, adapted from
  `tasks/[taskId]/comments/route.ts`.
- `src/app/api/v2/issues/[issueId]/comments/[commentId]/route.ts` (new) — `DELETE`, adapted from the
  task equivalent.
- `src/app/api/v2/issues/[issueId]/comments/[commentId]/attachments/route.ts` +
  `[attachmentId]/file-url/route.ts` (new) — adapted from the task comment-attachments routes
  (`entity_type: "comment"` already covers this — same table, no change needed there, just a new
  issue-scoped parent-comment lookup).
- `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/_issue-comments.tsx` (new) — adapted from
  `_task-comments.tsx`, pointed at the new issue comment routes.
- `_issue-detail.tsx` — renders the new component.

## Code Context

`issue_comments`'s current RLS (`supabase/migrations/052_issue_comments_table.sql:41-48`, already read
in full):
```sql
create policy "issue_comments_staff_read"
  on issue_comments for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm', 'developer'));

create policy "issue_comments_pm_write"
  on issue_comments for all to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'pm'))
  with check (get_my_role() in ('admin', 'super_admin', 'pm'));
```
The exact `task_comments` policies to mirror (`supabase/migrations/048_super_admin_rls.sql:53-64`,
already read):
```sql
create policy "task_comments_staff_insert"
  on task_comments for insert to authenticated
  with check (
    get_my_role() in ('admin', 'super_admin', 'pm', 'developer')
    and author_id = auth.uid()
  );

create policy "task_comments_delete"
  on task_comments for delete to authenticated
  using (get_my_role() = 'admin' or author_id = auth.uid());
```
New migration 101:
```sql
create policy "issue_comments_staff_insert"
  on issue_comments for insert to authenticated
  with check (
    get_my_role() in ('admin', 'super_admin', 'pm', 'developer')
    and author_id = auth.uid()
  );

create policy "issue_comments_delete"
  on issue_comments for delete to authenticated
  using (get_my_role() = 'admin' or author_id = auth.uid());
```
(Confirm at implementation time whether `task_comments_delete`'s `admin`-only override should instead
be widened to `admin`/`super_admin` for both tables — the migration history suggests `super_admin` was
added later app-wide, e.g. `issue_comments_staff_read` already includes it while this older
`task_comments_delete` policy predates that sweep and may simply not have been revisited.)

## Implementation Steps

1. Add migration 101 (RLS only).
2. Add the issue comment + comment-attachment API routes, adapted from task equivalents.
3. Add `_issue-comments.tsx`, adapted from `_task-comments.tsx` + `_comment-editor.tsx` reuse.
4. Wire into `_issue-detail.tsx`.
5. `npx tsc --noEmit`, `pnpm lint`.

## Acceptance Criteria

- [ ] Any staff role can post a rich-text comment (with optional attachments) on an issue.
- [ ] A commenter can delete their own comment; verify who else can per the Code Context decision.
- [ ] Existing Zoho-imported comments still display correctly, unaffected.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

- `npx tsc --noEmit`
- `pnpm lint`
- Browser: as a developer with no edit rights on an issue, confirm they can still post/delete their own
  comment (participation ≠ edit rights, per Requirement 3).
- Browser: confirm an imported (pre-existing) comment with `author_id = null` still renders correctly
  alongside new ones.

## Compatibility Touchpoints

- Depends on task 234 landing first (redesigned `_issue-detail.tsx` layout).
- `issue_comments_pm_write`'s existing broad access for PM/Admin is preserved, not replaced.

## Implementation Notes

### What Changed
- Added `issue_comments_staff_insert`/`issue_comments_delete` RLS policies (migration 101).
- Added GET/POST comment routes, DELETE-single-comment route, comment-attachment
  GET/POST/file-url routes, and a description-images route for inline rich-text image paste.
- Added `IssueComments` (thread + composer + attachment picker/viewer, own/admin delete) and
  `IssueCommentEditor` (Tiptap composer) client components.
- Wired a new "Comments" `Card` into `_issue-detail.tsx`, below Attachments.

### Files Changed
- `supabase/migrations/101_issue_comments_live_rls.sql` (new) — insert/delete RLS.
- `src/app/api/v2/projects/[projectId]/issues/[issueId]/comments/route.ts` (new) — GET/POST.
- `src/app/api/v2/projects/[projectId]/issues/[issueId]/comments/[commentId]/route.ts` (new) — DELETE.
- `src/app/api/v2/projects/[projectId]/issues/[issueId]/comments/[commentId]/attachments/route.ts` (new) — GET/POST.
- `src/app/api/v2/projects/[projectId]/issues/[issueId]/comments/[commentId]/attachments/[attachmentId]/file-url/route.ts` (new) — GET.
- `src/app/api/v2/projects/[projectId]/issues/[issueId]/comments/description-images/route.ts` (new) — POST.
- `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/_issue-comments.tsx` (new).
- `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/_issue-comment-editor.tsx` (new).
- `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/_issue-detail.tsx` — renders `IssueComments`.
- `TASKS.md` — moved 236 from Planned to Testing.

### Deviations From Plan
- **Route mount path** — the doc's Proposed File Changes assumed a bare
  `src/app/api/v2/issues/[issueId]/comments/...` mount (mirroring `/api/v2/issues/[issueId]`, which
  only has a PATCH/DELETE route for the issue itself). Task 235 (Attachments tab), which landed
  first, actually established `src/app/api/v2/projects/[projectId]/issues/[issueId]/...` as the real
  convention for issue sub-resources — matching `_issue-detail.tsx`'s existing `IssueAttachments`
  wiring. Comment routes follow that shipped precedent instead, for consistency with the sibling tab
  on the same page.
- **Delete role set (Code Context's flagged discrepancy)** — the doc's Code Context excerpt of
  `task_comments_delete` (from migration 048) showed `get_my_role() = 'admin'`. Re-reading migration
  048 directly, the *live* policy is actually `get_my_role() in ('admin', 'super_admin') or author_id
  = auth.uid()` — migration 048 itself is the "widen to super_admin app-wide" sweep the doc
  speculated about, it just wasn't reflected in the doc's copy-pasted excerpt. Migration 101's
  `issue_comments_delete` mirrors the confirmed-live version (`admin`/`super_admin`/own), resolving
  the flagged discrepancy without introducing a new asymmetry between the two entities.
- Comment deletion does not cascade-delete the comment's attachment rows/storage objects (matches
  no existing precedent in this codebase either way — out of scope, not flagged as a gap by the task
  doc).

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing warnings in an unrelated file, 0 errors)
- Browser verification (developer non-edit comment/delete parity, Zoho-imported `author_id = null`
  comment rendering) - SKIPPED (no browser session in this implementation pass; left for the
  `test` stage per the task doc's own Verification section)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation in any new/changed file.
- No `any`/untyped escape hatches — `CommentRow`/`CommentAttachment` typed consistently across
  the API route and the client component; `Database["public"]["Tables"]["issues"]["Update"]`-style
  typing wasn't needed here since these routes don't touch `issues` directly.
- No deep nesting — every new route uses guard-clause early returns (401/404/403) exactly like
  every sibling route it was adapted from; `IssueComments` stays flat (ternary render branches,
  no nested conditionals beyond what `_task-comments.tsx` already has).
- Naming is accurate and consistent with the codebase: `IssueComments`/`IssueCommentEditor`
  mirror `TaskComments`(`_task-comments.tsx`)/`CommentEditor` naming 1:1, `canDelete`/
  `deleteComment`/`isOwnComment`/`isAdmin` read as behavior, not implementation detail.
- Repeated logic (author-name resolution, attachment batching, formatFileSize) is duplicated
  from the task-side equivalents rather than extracted into a shared helper — intentional, not an
  oversight: the task doc's own Out-of-Scope section forbids touching
  `tasks/[taskId]/_task-comments.tsx`/its API, so a shared module would either require editing
  that file anyway or introducing a new cross-entity abstraction the task never asked for. Matches
  this codebase's own established precedent of duplicating small per-entity logic across
  independent task/issue modules (see `src/lib/issues/permissions.ts`'s header comment, which
  cites the same reasoning for `getIssueEditPermission` vs. `getTaskEditPermission`).
- Errors are handled intentionally: every Supabase mutation path checks `error` and returns a
  typed JSON error response with a matching HTTP status; `console.error` is used only for
  server-side diagnostics on 500-class failures (upload/insert/delete failures), matching every
  sibling route's own logging convention — no debug logging left in a hot path.
- No secrets/credentials in any new file.
- Project conventions followed: `pnpm`-only tooling assumed (no package changes needed — Tiptap
  was already a dependency via the task-side `_comment-editor.tsx`), Tailwind-only styling (no
  `style={{}}`), `isDark`-prop pattern not applicable (Issue Detail's whole page, including the
  pre-existing Attachments tab, doesn't use it either — light-only, consistent with its neighbors).

### Deviations
- **Medium** — Route mount path moved from the task doc's assumed
  `src/app/api/v2/issues/[issueId]/comments/...` to the actually-shipped
  `src/app/api/v2/projects/[projectId]/issues/[issueId]/comments/...` convention (established by
  task 235, which landed after the doc was written). Visible to the user as a different API
  surface than the doc specified, but functionally equivalent and more consistent with the
  sibling Attachments tab already on the same page — documented in Implementation Notes.
- **Minor** — `issue_comments_delete`'s role set resolved to `admin`/`super_admin`/own (the live
  `task_comments_delete` policy) rather than the doc's stale `admin`-only excerpt. This was the
  doc's own explicitly authorized resolution path ("match it exactly... verify against the live
  policy"), not a scope decision made unilaterally — documented in Implementation Notes with the
  exact migration line that proves the live policy already includes `super_admin`.
- No Major deviations. Out-of-scope boundaries (task comments, Attachments/Time Logs tabs, no
  comment-edit UI) are all respected — confirmed no edits to any file outside this task's own new
  files plus the single `_issue-detail.tsx` wiring point and `TASKS.md`.
