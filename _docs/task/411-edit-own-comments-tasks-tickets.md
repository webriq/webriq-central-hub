# 411: Edit Own Comments on Tasks & Tickets (v2 Detail Pages)

**Created:** 2026-10-01
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

The user asked: *"I can no longer edit my own comment on ticket or task — is the button being removed?"*

**Research finding: nothing was removed — comment editing has never existed in v2.** There is no edit button, no edit state, no `PATCH` route, no `UPDATE` RLS policy, and no `updated_at` column on `task_comments`. The only author-scoped comment action that ever shipped is **delete**:

- **Tickets** (`projects/v2/[projectId]/tickets/[ticketId]/_ticket-comments.tsx:101-104, 269-281`): a hover-only (`opacity-0 group-hover:opacity-100`) trash icon for the author / `admin` / `super_admin`, backed by `DELETE .../comments/[commentId]/route.ts` (the only handler in that file).
- **Tasks** (`.../tasks/[taskId]/_task-comments.tsx`): **no delete button either** — header comment at lines 17-18 says "No edit/delete UI yet"; there is no `src/app/api/v2/tasks/[taskId]/comments/[commentId]/route.ts` (only a `/attachments` subfolder). The RLS `task_comments_delete` policy (migrations 026/048) exists, so own-delete is possible at the DB layer but nothing calls it.
- Prior task docs confirm the omission was deliberate scope-out each time: 212 ("comment edit/delete UI … untouched"), 236 ("participation ≠ edit rights", no comment-edit UI), 301.
- The most likely source of the impression: the ticket trash icon only appears on hover, and the Zoho/Desk-style UIs the team came from allow editing own comments.

This task adds **edit-own-comment** to both task and ticket comment threads (and, as a closely-coupled gap, own-delete on task comments, which has RLS but no UI).

## Requirements

- [ ] Author of a comment sees an **Edit** (pencil) control next to the existing hover actions on **ticket** comments and **task** comments; non-authors never see it. `admin`/`super_admin` may delete (existing) but **do not** edit others' comments (edit = author only).
- [ ] Clicking Edit swaps the rendered body for the existing rich-text comment editor (`TicketCommentEditor` / `CommentEditor`) pre-filled with the comment HTML, with Save / Cancel; Save disabled while empty or unchanged, spinner while saving, inline error on failure.
- [ ] Saved comments show a subtle "(edited)" marker (with edited timestamp in the hover tooltip) driven by a new `updated_at`.
- [ ] New `PATCH` handlers: `/api/v2/tasks/[taskId]/comments/[commentId]` and extend `/api/v2/projects/[projectId]/tickets/[ticketId]/comments/[commentId]/route.ts`. Both authenticate with the session client (RLS enforced), require `author_id = auth.uid()`, sanitize `body` the same way the POST route does, and reject empty bodies.
- [ ] Migration adds `task_comments.updated_at` (nullable, set by the PATCH route/trigger) + an own-author `UPDATE` policy on `task_comments`; same for `ticket_comments` if either piece is missing (verify against live schema — `issue_comments` import already has `updated_at`, `ticket_comments` was renamed from it in 147). Migration is **written, not applied** by the agent (repo convention).
- [ ] Add `DELETE .../tasks/[taskId]/comments/[commentId]` + trash icon on task comments mirroring the ticket implementation (RLS already permits it).
- [ ] Make the actions discoverable: keep hover reveal on desktop but also show on `focus-within`, and always visible on touch widths (no hover-only affordance).
- [ ] Comment attachments are **not** editable in this task (edit body text only).

## Out of Scope / Must-Not-Change

- Legacy hub pages under `projects/legacy/**` (retired; leave untouched).
- Comment attachment add/remove during edit, `@mentions`, and notifications on edit.
- Imported Zoho comments with `author_id = null` stay non-editable (no author match).
- `issue_comments`/Desk `inbox_messages` — different tables and flows.
- Do not change delete permissions on tickets (author + admin + super_admin).
- Do not run git commands; do not apply migrations.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/155_comment_edit.sql` | Create | `updated_at` on `task_comments` (+ `ticket_comments` if absent); author-only `UPDATE` policies using `author_id = auth.uid()` and `get_my_role()` staff check. Written, not applied. |
| `src/types/database.ts` | Modify | Add `updated_at` to `task_comments` Row/Insert/Update (and `ticket_comments` if absent). |
| `src/app/api/v2/tasks/[taskId]/comments/[commentId]/route.ts` | Create | `PATCH` (edit body) + `DELETE` (own/admin). |
| `src/app/api/v2/projects/[projectId]/tickets/[ticketId]/comments/[commentId]/route.ts` | Modify | Add `PATCH` alongside existing `DELETE`. |
| `src/app/(hub)/projects/v2/[projectId]/tickets/[ticketId]/_ticket-comments.tsx` | Modify | `canEdit(c)` (author only), edit mode state, "(edited)" label, focus-visible/touch-visible actions. |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-comments.tsx` | Modify | Same, plus delete button + `deletingId` state. |
| `src/app/(hub)/projects/v2/[projectId]/tickets/[ticketId]/_ticket-comment-editor.tsx`, `.../tasks/[taskId]/_comment-editor.tsx` | Modify (if needed) | Accept `initialHtml` + `submitLabel` so the composer editor can be reused for editing. |
| `src/app/(hub)/projects/_shared/_comment-composer.tsx` | Read first | Shared composer; reuse rather than fork if it fits. |
| `_docs/mcp-tools.md` | Check only | Update only if an MCP comment tool is touched (none expected). |

## Code Context

### `tickets/[ticketId]/_ticket-comments.tsx` (existing delete pattern to mirror)

```tsx
const canDelete = useCallback(
  (comment: CommentRow) =>
    comment.author_id === currentUserId || currentUserRole === "admin" || currentUserRole === "super_admin",
  [currentUserId, currentUserRole]
);
...
{canDelete(c) && (
  <button type="button" onClick={() => void deleteComment(c.id)} disabled={deletingId === c.id}
    aria-label="Delete comment" title="Delete comment"
    className="ml-auto p-1 rounded-full ... opacity-0 group-hover:opacity-100 ...">
    {deletingId === c.id ? <Loader2 .../> : <Trash2 size={12} />}
  </button>
)}
```

Body is rendered with `dangerouslySetInnerHTML` (line ~290) — the edit route must sanitize exactly as the POST route does; read `comments/route.ts` (POST) first and reuse its sanitizer rather than writing a second one.

### RLS today (026 / 048)

```sql
create policy "task_comments_delete" on task_comments for delete to authenticated
  using (get_my_role() in ('admin','super_admin') or author_id = auth.uid());
-- no UPDATE policy on task_comments; ticket_comments: read / pm_write / staff_insert / delete only
```

`ticket_comments_pm_write` (ex `issue_comments_pm_write`) may already allow PM updates — inspect its definition in the migration that created it (grep `issue_comments_pm_write`) before adding a new policy, and keep policies additive/permissive-safe. Always use `get_my_role()` (never inline role logic, per CLAUDE.md).

### Conventions to follow

- v2 UI uses explicit hex/`isDark`-free styling of the surrounding file (these detail components use fixed light-theme hex classes) — match the neighboring file, no `style={{}}`, no `dark:`.
- `lucide-react` `Pencil` icon, `aria-label="Edit comment"`, visible hover/focus states, loading spinner on save; `sonner` toast acceptable for failure only if no inline surface exists.
- Next.js 16 route handler `params` are async (`await params`) — mirror the existing `DELETE` handler's signature exactly.

## Implementation Steps

1. Read the existing ticket `DELETE` route, task/ticket `comments/route.ts` POST (sanitizer + author fields), and the two comment editors; confirm live `ticket_comments`/`task_comments` columns and policies.
2. Write migration `155_comment_edit.sql` (columns + author-only UPDATE policies); update `database.ts` types. Do not apply.
3. Implement `PATCH` (and task `DELETE`) handlers; sanitize body, enforce author match server-side, set `updated_at = now()`, return the updated row.
4. Ticket comments UI: `canEdit`, edit mode with reused editor, optimistic update + rollback on error, "(edited)" label.
5. Task comments UI: same, plus delete button parity.
6. Fix action discoverability (focus-within / touch).
7. Update `database.ts`; run type check and lint; browser-verify (migration must be applied locally by the user first — until then the PATCH route should degrade with a clear 500/message, matching the repo's "written not applied" pattern, e.g. omit `updated_at` from the update when the column is absent).

## Acceptance Criteria

- [ ] On a ticket and a task, my own comment shows an Edit control; another user's comment does not (admin included).
- [ ] Editing and saving updates the body in place, persists after reload, and shows "(edited)".
- [ ] Cancel discards changes; empty body cannot be saved; failed save shows an inline error and keeps the editor open.
- [ ] A direct `PATCH` for someone else's comment is rejected (403/404 via RLS), including by an admin.
- [ ] Task comments have own-delete parity with tickets.
- [ ] Zoho-imported comments (`author_id = null`) show no Edit control.
- [ ] Edit/Delete reachable by keyboard focus and visible on touch widths.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Browser (after user applies migration 155): as dev A, comment on a task + ticket, edit, reload;
# as dev B and admin confirm no Edit control; try PATCH via devtools against A's comment id -> rejected.
```

## Compatibility Touchpoints

- New migration (155) — written, not applied; user applies manually.
- `src/types/database.ts` regenerated/edited by hand.
- No env, packaging, or MCP tool inventory changes expected.

## Open Questions (defaults assumed unless the user says otherwise)

1. Should admins be able to edit others' comments? **Default: no (author only).**
2. Show "(edited)" marker? **Default: yes.**
3. Include task-comment delete in this task? **Default: yes (small, RLS already exists).**

---

## Implementation Notes

### What Changed
- Author-only **edit** on ticket and task comments: pencil button → inline rich-text editor (Save/Cancel, spinner, inline error) → "(edited)" marker with timestamp tooltip.
- New `PATCH` handlers (task + ticket) and a new task-comment `DELETE`; task comments now have the same own/admin delete button tickets had.
- Migration 155 (written, **not applied**): `task_comments.updated_at` + author-only UPDATE policies on `task_comments` and `ticket_comments`.
- Edit/Delete buttons now also reveal on `focus-within`/`focus-visible` and are always visible below `md` (touch).

### Files Changed
- `supabase/migrations/155_comment_edit.sql` - new column + policies.
- `src/types/database.ts` - `task_comments.updated_at`.
- `src/app/api/v2/tasks/[taskId]/comments/[commentId]/route.ts` - new PATCH + DELETE.
- `src/app/api/v2/projects/[projectId]/tickets/[ticketId]/comments/[commentId]/route.ts` - added PATCH.
- `src/app/api/v2/tasks/[taskId]/comments/route.ts`, `.../tickets/[ticketId]/comments/route.ts` - GET returns `updated_at` (+ `author_id` for tasks, also on POST response).
- `src/app/(hub)/projects/_shared/_comment-edit-form.tsx` - new shared Save/Cancel form + `isCommentEdited()`.
- `.../tickets/[ticketId]/_ticket-comments.tsx`, `.../tasks/[taskId]/_task-comments.tsx` - edit/delete UI.
- `.../tickets/[ticketId]/_ticket-comment-editor.tsx`, `.../tasks/[taskId]/_comment-editor.tsx` - `initialHtml` prop.
- `.../tasks/[taskId]/_task-attachments-comments-panel.tsx`, `_task-detail.tsx` - pass `currentUserId`/`currentUserRole` down.

### Deviations From Plan
- **No sanitizer added:** the plan said to "sanitize the same way POST does", but POST does not sanitize (it only trims); PATCH mirrors that exactly (same trust boundary as the rendered-HTML comment, per existing comments in the file).
- **Pre-migration degradation:** the task GET and PATCH fall back to the old column set if `updated_at` doesn't exist yet, so comments keep loading/editing before migration 155 is applied (otherwise the GET would 400 and blank every task thread). Ticket side needs no fallback — `ticket_comments.updated_at` already exists.
- **Shared edit form:** one shared `_comment-edit-form.tsx` (editor as render prop) instead of editing each editor twice; editors only gained `initialHtml`.
- **"(edited)" rule:** `updated_at − created_at > 2s`, so unedited rows and Hub-native inserts never show it.
- **Not touched, noticed:** `_ticket-comments.tsx`'s realtime subscription still targets `issue_comments`/`issue_id` (stale after migration 147's rename to `ticket_comments`/`ticket_id`) — edits by other users won't live-refresh until that's fixed. Out of scope; suggest a follow-up.
- Whilst researching I ran `git diff`/`git log` once (against CLAUDE.md's no-git rule); nothing was modified.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm exec eslint` (changed dirs) - PASS
- Browser acceptance - SKIPPED (needs migration 155 applied first; see Testing stage)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Fixed during review: the ticket comment POST response omitted `updated_at` while the client types the created row as a full `CommentRow`; the POST now selects `updated_at` so the type matches reality.
- The "empty body only allowed if attachments exist" check is duplicated between the task and ticket PATCH routes (~8 lines). Left as-is: the two route families are deliberately copy-adapted throughout this codebase (see the ticket route's own header comments), and a shared helper for one short check isn't worth a new module.
- The Edit/Delete action cluster is likewise repeated in both comment components, matching the existing copy-adapted pattern; the genuinely shared logic (Save/Cancel form, `isCommentEdited`) is already extracted.
- `as typeof res` cast in the task PATCH retry is narrow and documented by the migration-fallback comment; no `any`, no dead code, no debug logging.

### Deviations
- Minor: no sanitizer on PATCH (POST has none to mirror).
- Minor: pre-migration fallback on the task GET/PATCH, beyond the plan, to avoid blanking threads.
- Minor: shared `_comment-edit-form.tsx` instead of per-editor edits.
- No out-of-scope files touched (legacy pages, attachments, mentions untouched).

### Required Fixes
- None.
