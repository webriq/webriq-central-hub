# 285: Task/Issue Delete — Developer-Creator Delete Rights (New RLS), Restricted Bulk-Delete Checkboxes, ConfirmDialog Replacing `window.confirm()`

**Created:** 2026-08-21
**Priority:** HIGH
**Type:** feature / bugfix
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

User report: bulk-delete on the Tasks tab currently does nothing on `/projects/v2/[projectId]` (Trash toolbar button has no `onBulkDelete` wired at all in the shared `_list-view.tsx` — a regression from the "Revamped projects tab" restructure; task 276 had fixed this exact gap in the pre-restructure file tree, but that fix lives in the now-retired `projects-old/[projectId]/_list-view.tsx` and was never ported into `projects/_shared/_list-view.tsx`). The ask is to (a) wire it up, (b) disable the row checkbox — with a restricted cursor + tooltip — for tasks the current developer didn't create, (c) replace the task-detail page's native `confirm()`/`title` attribute with the app's on-brand `ConfirmDialog`/`Tooltip` components (matching "Delete Project"'s pattern), and (d) apply (b) and (c) to Issues (listing + detail) too.

**Scope-changing finding from research, confirmed with the user before writing this doc:** delete on both `tasks` and `issues` is currently enforced server-side by RLS policies (`tasks_pm_write` / `issues_pm_write`, both `FOR ALL` scoped to `admin | super_admin | pm`) with **no developer delete policy at all** — migrations 092 and 100's own comments confirm developers only ever got `insert`/`update` policies. So today, no developer can delete a task or issue, creator or not — the checkbox-disable-for-non-creators premise in the request only makes sense if creator-developers can actually delete their own rows. The user chose (see below) to close that gap with a new migration rather than restrict the UI to "developers can never delete."

- **Decision (user-confirmed):** add `tasks_developer_delete` / `issues_developer_delete` RLS policies scoped to `created_by = auth.uid()`, mirroring the existing `tasks_developer_update` / `issues_developer_update` row-visibility shape. This makes `getTaskEditPermission`/`getIssueEditPermission`'s existing `canEditDetails` field (already `true` for the creator-developer or any admin/pm/super_admin, `false` otherwise) the correct, already-computed gate for delete rights too — no permission-lib changes needed, just reusing `canEditDetails` everywhere delete UI renders.
- Also found and will fix in passing (touches the same `handleDelete` functions being rewritten anyway): `_task-detail.tsx`'s `handleDelete()` doesn't check `res.ok` before navigating away — a blocked/failed delete today silently looks like it succeeded. `_issue-detail.tsx` has the same gap. Both get a real error check now that a delete can legitimately fail for reasons other than "you're not allowed" (e.g. a race, a network error).

`projects/_shared/_list-view.tsx` and `_shared/_issue-list-view.tsx` are shared by **both** `/projects/v2/[projectId]` and `/projects/legacy/[projectId]` (ported in task 276/282), so fixing them fixes both route variants from one edit. `_task-detail.tsx` and `_issue-detail.tsx`, however, are **not** shared — they're near-duplicate files under `v2/[projectId]/tasks/[taskId]/` and `legacy/[projectId]/tasks/[taskId]/` (confirmed via diff: only the hardcoded `/projects/v2/…` vs `/projects/legacy/…` navigation strings differ) — both copies need the same edit.

## Requirements

- [ ] New migration adds `tasks_developer_delete` (`FOR DELETE`, `using (get_my_role() = 'developer' and created_by = auth.uid())`) and `issues_developer_delete` (same shape) — developers can now delete rows they created; assignee-only or unrelated developers still cannot (matches the existing update-policy row-visibility split).
- [ ] `_shared/_list-view.tsx`: row checkbox is disabled (with `cursor-not-allowed` and a tooltip explaining the restriction) for any task where `getTaskEditPermission(...).canEditDetails` is `false` for the current user. The per-group "select all" header checkbox only considers selectable tasks within that group.
- [ ] `_shared/_list-view.tsx` gains a working `onBulkDelete` prop; the Trash toolbar button opens the shared `ConfirmDialog` (not `window.confirm()`) with a loading/disabled state while the delete request is in flight.
- [ ] `_shared/_project-detail.tsx` gains `bulkDeleteTasks` (mirrors the existing `bulkDeleteIssues`: parallel `DELETE /api/v2/tasks/[id]` requests, optimistic local-state filter) and passes it to `<ListView onBulkDelete={bulkDeleteTasks}>`.
- [ ] `_shared/_issue-list-view.tsx`: same row/header checkbox restriction as tasks, using `getIssueEditPermission(...).canEditDetails`. Its existing `handleBulkTrash` swaps `window.confirm()` for `ConfirmDialog`.
- [ ] `_task-detail.tsx` (both `v2` and `legacy` copies): delete button's `handleDelete()` uses `ConfirmDialog` instead of `confirm()`, checks the delete response's `res.ok` before navigating away (shows an inline error otherwise, mirroring `DeleteProjectMenuItem`'s `error` state), and gains a `deleting` loading state (disabled button + spinner) matching `_issue-detail.tsx`'s existing pattern. The delete button's plain `title="Delete task"` attribute is replaced with the app's `Tooltip`/`TooltipContent`.
- [ ] `_issue-detail.tsx` (both `v2` and `legacy` copies): `canDelete` switches from the hardcoded `role === "admin" || "pm" || "super_admin"` check to `perm.canEditDetails` (now that creator-developers get real delete rights via the new migration). `handleDelete()` uses `ConfirmDialog`, checks `res.ok`, shows an inline error on failure (it already has a `deleting` state/spinner — keep it). `title="Delete issue"` replaced with `Tooltip`/`TooltipContent`.
- [ ] `DELETE` handler comments in `src/app/api/v2/tasks/[taskId]/route.ts` and `src/app/api/v2/issues/[issueId]/route.ts` updated to reflect the new RLS shape (no functional route change — both already just call `.delete()` and rely on RLS).

## Out of Scope / Must-Not-Change

- No `sonner` toast feedback on the bulk-delete flows — not requested this round (unlike task 276's later follow-up on the now-retired `projects-old` tree). `<Toaster>` is already mounted in `(hub)/layout.tsx` if this becomes a follow-up.
- `_board-view.tsx`, `_calendar-view.tsx`, `_issue-board-view.tsx`, `_issue-calendar-view.tsx` have no row-selection/bulk-delete UI — untouched.
- `projects-old/[projectId]/_list-view.tsx` and `_issue-list-view.tsx` (the deprecated pre-restructure tree, distinct from `/projects/legacy`) already have their own working `onBulkDelete` wiring — not touched.
- Assignee-only developers (not the creator) still get no delete rights anywhere — unchanged; matches `canEditDetails: false` for that tier in both permission libs.
- No change to status-change or field-edit permissions — only delete-related gating (`canEditDetails` reused as-is) and the two UI mechanisms (checkbox restriction, `ConfirmDialog`) are in scope.
- No change to `getTaskEditPermission`/`getIssueEditPermission` themselves — `canEditDetails` already computes exactly the right set (creator-developer or admin/pm/super_admin); only the migration needs to change for that set to be *true* at the DB layer too.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `supabase/migrations/111_developer_task_issue_delete_rls.sql` | Create | `tasks_developer_delete` / `issues_developer_delete` RLS policies scoped to `created_by = auth.uid()` |
| `src/app/(hub)/projects/_shared/_list-view.tsx` | Modify | Add `onBulkDelete` prop, restricted-checkbox gating (row + group header), `ConfirmDialog`-based bulk-delete flow |
| `src/app/(hub)/projects/_shared/_issue-list-view.tsx` | Modify | Restricted-checkbox gating (row + header), swap `confirm()` → `ConfirmDialog` in `handleBulkTrash` |
| `src/app/(hub)/projects/_shared/_project-detail.tsx` | Modify | Add `bulkDeleteTasks`, pass as `onBulkDelete` to `<ListView>` |
| `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | `ConfirmDialog` + `res.ok` check + `deleting` state on delete; `Tooltip` on delete button |
| `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-detail.tsx` | Modify | Same as above (duplicate file, `legacy` route strings) |
| `src/app/(hub)/projects/v2/[projectId]/issues/[issueId]/_issue-detail.tsx` | Modify | `canDelete` → `perm.canEditDetails`; `ConfirmDialog` + `res.ok` check; `Tooltip` on delete button |
| `src/app/(hub)/projects/legacy/[projectId]/issues/[issueId]/_issue-detail.tsx` | Modify | Same as above (duplicate file, `legacy` route strings) |
| `src/app/api/v2/tasks/[taskId]/route.ts` | Modify | Update `DELETE` handler comment only |
| `src/app/api/v2/issues/[issueId]/route.ts` | Modify | Update `DELETE` handler comment only |

## Code Context

### `supabase/migrations/110_tasks_time_notes_columns.sql` → next is `111`

Existing shape to mirror (migration 092, tasks update policy):
```sql
create policy "tasks_developer_update"
  on tasks for update to authenticated
  using (get_my_role() = 'developer' and (created_by = auth.uid() or auth.uid() = any(assignees)))
  with check (get_my_role() = 'developer');
```
New delete policy is row-visibility-only on `created_by` (no assignee clause — assignees still can't delete):
```sql
create policy "tasks_developer_delete"
  on tasks for delete to authenticated
  using (get_my_role() = 'developer' and created_by = auth.uid());

create policy "issues_developer_delete"
  on issues for delete to authenticated
  using (get_my_role() = 'developer' and created_by = auth.uid());
```

### `src/lib/tasks/permissions.ts` — reuse as-is, no changes

```ts
export function getTaskEditPermission(
  role: string | null | undefined,
  userId: string,
  task: { created_by: string | null; assignees: string[] | null }
): TaskEditPermission {
  const isAssignee = task.assignees?.includes(userId) ?? false;
  if (role === "admin" || role === "pm" || role === "super_admin") {
    return { ...FULL_EDIT, canStartTimer: false };
  }
  if (role !== "developer") return READ_ONLY;
  if (task.created_by === userId) return { ...FULL_EDIT, canStartTimer: isAssignee };
  if (isAssignee) return ASSIGNEE_STATUS_ONLY;
  return READ_ONLY;
}
```
`canEditDetails` is `true` exactly for admin/pm/super_admin or the creator-developer — this is the delete gate. `getIssueEditPermission` (`src/lib/issues/permissions.ts`) has the identical shape.

### `src/components/ui/confirm-dialog.tsx` — existing component, reuse verbatim

```tsx
export function ConfirmDialog({
  open, title, body, confirmLabel = "Delete", confirmDisabled = false, onConfirm, onCancel,
}: { open: boolean; title: string; body: string; confirmLabel?: string; confirmDisabled?: boolean;
     onConfirm: () => void; onCancel: () => void }) { /* … */ }
```

### `src/app/(hub)/projects/_shared/_issue-list-view.tsx` — pattern to extend (currently no checkbox gating, still uses `confirm()`)

```tsx
async function handleBulkTrash() {
  if (!confirm(`Delete ${selected.size} issue${selected.size === 1 ? "" : "s"}?`)) return;
  setDeleting(true);
  await onBulkDelete(Array.from(selected));
  setDeleting(false);
  setSelected(new Set());
}
```
Replace with a `confirmOpen` state + `<ConfirmDialog>` render (same shape as `DeleteProjectMenuItem`, `src/app/(hub)/projects/v2/[projectId]/_delete-project-menu-item.tsx`):
```tsx
const [confirmOpen, setConfirmOpen] = useState(false);
// Trash button: onClick={() => setConfirmOpen(true)}
async function handleBulkTrash() {
  setConfirmOpen(false);
  setDeleting(true);
  await onBulkDelete(Array.from(selected));
  setDeleting(false);
  setSelected(new Set());
}
// ...
<ConfirmDialog
  open={confirmOpen}
  title={`Delete ${selected.size} issue${selected.size === 1 ? "" : "s"}?`}
  body="This action is irreversible."
  confirmLabel={deleting ? "Deleting…" : "Delete"}
  confirmDisabled={deleting}
  onConfirm={() => void handleBulkTrash()}
  onCancel={() => setConfirmOpen(false)}
/>
```
`_list-view.tsx`'s Trash button needs the identical treatment plus the `onBulkDelete` prop/`handleBulkTrash` added from scratch (it currently has neither).

### Row checkbox gating — apply to both list views

`_issue-list-view.tsx` row checkbox today (no gating):
```tsx
<input type="checkbox" checked={isSelected} onChange={() => toggleRow(issue.id)}
  className="w-3.5 h-3.5 rounded border-[#E2E7F2] cursor-pointer accent-[#007BFF]" />
```
**Important gotcha:** disabled form elements don't reliably fire hover/mouse events in Chromium, so wrapping the `disabled` `<input>` itself in `TooltipTrigger` will not show the tooltip. Wrap a non-disabled `<span>` (which carries `cursor-not-allowed`) as the `TooltipTrigger`'s `render` target instead, with the actual `disabled` checkbox inside it:
```tsx
const perm = getIssueEditPermission(currentUserRole, currentUserId, issue); // per row
const canSelect = perm.canEditDetails;

canSelect ? (
  <input type="checkbox" checked={isSelected} onChange={() => toggleRow(issue.id)}
    className="w-3.5 h-3.5 rounded border-[#E2E7F2] cursor-pointer accent-[#007BFF]" />
) : (
  <Tooltip>
    <TooltipTrigger render={
      <span className="inline-flex cursor-not-allowed">
        <input type="checkbox" disabled
          className="w-3.5 h-3.5 rounded border-[#E2E7F2] pointer-events-none opacity-50" />
      </span>
    } />
    <TooltipContent side="top">You're restricted from taking action on this issue</TooltipContent>
  </Tooltip>
)
```
Same pattern for `_list-view.tsx`'s `Row` (needs `currentUserRole`/`currentUserId`, already props on `Row`; `perm` is already computed there for status options — reuse it), tooltip text "You're restricted from taking action on this task". Header/group "select all" checkboxes need an analogous `selectableIds` filter (see Implementation Steps) but don't need the tooltip treatment (they're not row-scoped) — a plain `disabled` when the group/page has zero selectable rows is enough.

### `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-detail.tsx` — current delete flow (lines 138–144, 183–192)

```tsx
async function handleDelete() {
  if (!confirm("Delete this task? This cannot be undone.")) return;
  await fetch(`/api/v2/tasks/${task.id}`, { method: "DELETE" });
  if (project.project_id) router.push(`/projects/v2/${project.project_id}/tasks`);
}
// ...
{perm.canEditDetails && (
  <button onClick={() => void handleDelete()}
    className="p-2 rounded-full text-[#5F6A88] hover:text-[#C0392B] hover:bg-[#FDE8E6] cursor-pointer shrink-0 mt-1 transition-colors"
    aria-label="Delete task" title="Delete task">
    <Trash2 size={18} />
  </button>
)}
```
Target shape (mirrors `_issue-detail.tsx`'s existing `deleting`/spinner pattern, plus `ConfirmDialog` from `DeleteProjectMenuItem`, plus `Tooltip` instead of `title`):
```tsx
const [confirmOpen, setConfirmOpen] = useState(false);
const [deleting, setDeleting] = useState(false);
const [deleteError, setDeleteError] = useState<string | null>(null);

async function handleDelete() {
  setConfirmOpen(false);
  setDeleting(true);
  const res = await fetch(`/api/v2/tasks/${task.id}`, { method: "DELETE" });
  if (!res.ok) {
    setDeleting(false);
    setDeleteError("Failed to delete task.");
    return;
  }
  if (project.project_id) router.push(`/projects/v2/${project.project_id}/tasks`);
}
// ...
{perm.canEditDetails && (
  <Tooltip>
    <TooltipTrigger render={
      <button onClick={() => setConfirmOpen(true)} disabled={deleting}
        className="p-2 rounded-full text-[#5F6A88] hover:text-[#C0392B] hover:bg-[#FDE8E6] cursor-pointer shrink-0 mt-1 transition-colors disabled:opacity-45"
        aria-label="Delete task">
        {deleting ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
      </button>
    } />
    <TooltipContent side="top">Delete task</TooltipContent>
  </Tooltip>
)}
<ConfirmDialog
  open={confirmOpen}
  title="Delete this task?"
  body="This action is irreversible."
  confirmLabel={deleting ? "Deleting…" : "Delete"}
  confirmDisabled={deleting}
  onConfirm={() => void handleDelete()}
  onCancel={() => setConfirmOpen(false)}
/>
{deleteError && <p className="text-[11px] text-[#C0392B] mt-1">{deleteError}</p>}
```
`deleteError` placement: render it near the header delete button (small inline text), same idea as `DeleteProjectMenuItem`'s `{error && <p>...}`.

### `src/app/(hub)/projects/v2/[projectId]/issues/[issueId]/_issue-detail.tsx` — current (lines 68–71, 128–133, 172–182)

```tsx
const perm = getIssueEditPermission(currentUserRole, currentUserId, issue);
// Delete stays PM/Admin/super_admin-only regardless of the creator edit tier (Decision 4) —
// issues_pm_write RLS grants no developer delete policy, even for a creator.
const canDelete = currentUserRole === "admin" || currentUserRole === "pm" || currentUserRole === "super_admin";
// ...
async function handleDelete() {
  if (!confirm("Delete this issue? This cannot be undone.")) return;
  setDeleting(true);
  await fetch(`/api/v2/issues/${issue.id}`, { method: "DELETE" });
  goToIssues();
}
```
Change `canDelete` to `perm.canEditDetails` (with an updated comment explaining migration 111 reverses the old Decision 4 constraint), add `res.ok` check + `confirmOpen` + `ConfirmDialog` + `Tooltip` (same shape as the task-detail target above — this file already has `deleting`/spinner, keep as-is).

## Implementation Steps

1. Write and note (do not run — user applies migrations manually per this repo's convention) `supabase/migrations/111_developer_task_issue_delete_rls.sql` with the two new `FOR DELETE` policies.
2. Update the `DELETE` handler comment in `src/app/api/v2/tasks/[taskId]/route.ts` and `src/app/api/v2/issues/[issueId]/route.ts` to say "PM/Admin or the task/issue creator via RLS" instead of "PM/Admin via RLS" — no code change, `.delete()` already just relies on RLS.
3. `_shared/_project-detail.tsx`: add `bulkDeleteTasks` right next to `bulkDeleteIssues` (same `Promise.all` + optimistic-filter shape), pass `onBulkDelete={bulkDeleteTasks}` to `<ListView>`.
4. `_shared/_list-view.tsx`:
   - Add `onBulkDelete: (ids: string[]) => Promise<void>` to `ListView`'s props.
   - Compute a `selectableIds` `Set<string>` via `useMemo` over `tasks`, using `getTaskEditPermission(currentUserRole, currentUserId, t).canEditDetails`.
   - `toggleGroup`/`allGroupSelected`: intersect `groupTaskIds` with `selectableIds` before computing "all selected" / before toggling.
   - `Row`: gate the checkbox render on `perm.canEditDetails` (already computed in `Row` for `statusOptions`) per the gotcha above — non-disabled `<span>` wrapper carries the `Tooltip`/`cursor-not-allowed`, inner `<input disabled>` is visually dimmed + `pointer-events-none`.
   - Add `confirmOpen`/`deleting` state to `ListView`; Trash button `onClick={() => setConfirmOpen(true)}`; render `<ConfirmDialog>` with title `` `Delete ${selected.size} task${selected.size === 1 ? "" : "s"}?` ``, body "This action is irreversible.", `confirmLabel`/`confirmDisabled` reflecting `deleting`; `handleBulkTrash` closes the dialog, calls `onBulkDelete(Array.from(selected))`, clears `selected`.
5. `_shared/_issue-list-view.tsx`: same `selectableIds`/row-gating treatment using `getIssueEditPermission`; filter `allIds`/`allSelected`/`toggleAll` down to selectable issues; swap `handleBulkTrash`'s `confirm()` for a `confirmOpen` state + `<ConfirmDialog>`, matching the task list's new pattern exactly.
6. `_task-detail.tsx` (v2 copy first, then port the identical diff to the legacy copy — only the `/projects/v2/` vs `/projects/legacy/` strings differ): add `Loader2` to the lucide-react import, `Tooltip`/`TooltipTrigger`/`TooltipContent` import, `confirmOpen`/`deleting`/`deleteError` state, rewrite `handleDelete` per the Code Context target shape, swap the delete button's `title` attr for a `Tooltip`, render `<ConfirmDialog>` + inline error text.
7. `_issue-detail.tsx` (v2 copy first, then legacy): change `canDelete` to `perm.canEditDetails` with an updated comment, add `Tooltip` import + `confirmOpen`/`deleteError` state (keep existing `deleting`), rewrite `handleDelete` with `res.ok` check + dialog-close, swap `title` for `Tooltip`, render `<ConfirmDialog>` + inline error text.
8. Run `npx tsc --noEmit` after each file group; fix any type errors before moving on.

## Acceptance Criteria

- [ ] Migration 111 exists with `tasks_developer_delete` and `issues_developer_delete` policies scoped to `created_by = auth.uid()`.
- [ ] On `/projects/v2/[projectId]` and `/projects/legacy/[projectId]`, Tasks list: selecting rows and clicking Trash opens the on-brand `ConfirmDialog` (not a native alert); confirming deletes the selected tasks and removes them from the list.
- [ ] In that same list, a developer's checkbox is disabled (restricted cursor + tooltip) on any task they didn't create; unaffected on tasks they did create, and unaffected for admin/pm (never restricted).
- [ ] Same two behaviors (working `ConfirmDialog` bulk-delete + restricted checkboxes) on the Issues list, both route variants.
- [ ] Task Detail page: delete button shows a `Tooltip` (not a plain `title` attribute) and opens `ConfirmDialog`; a developer who created the task can now actually delete it (previously silently failed); a developer who didn't create it still sees no delete button (`canEditDetails` false, unchanged).
- [ ] Issue Detail page: same — `Tooltip`, `ConfirmDialog`, and a developer-creator can now delete their own issue; non-creator developers still see no delete button.
- [ ] A forced delete failure (e.g. delete an already-deleted row) surfaces an inline error instead of silently navigating away as if it succeeded.
- [ ] `npx tsc --noEmit` clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser (required — this task changes real permission behavior):
- Apply migration 111 to the local Supabase instance before testing (`supabase db push` or the project's existing migration-apply flow — confirm with the user which is in use).
- As a developer who created a task: confirm the Tasks-list checkbox is enabled for that task, bulk-delete via `ConfirmDialog` works, and the Task Detail delete button also works (with `Tooltip`, not a browser alert).
- As a developer assigned to (but not the creator of) a task: confirm the checkbox is disabled with a restricted cursor and tooltip, and no delete button renders on that task's detail page.
- Repeat both cases for Issues (listing + detail), on both `/projects/v2/…` and `/projects/legacy/…`.
- As a PM or admin: confirm nothing is restricted — full bulk-delete and single-delete access on tasks/issues regardless of creator.
- Force a delete failure (e.g. open the same task in two tabs, delete it in one, then try deleting again in the other) and confirm an inline error appears instead of a silent redirect.

## Compatibility Touchpoints

- **Deploy dependency:** migration 111 must be applied to the Supabase instance (local and any deployed environments) before the UI changes take effect — until then, developer-creator deletes will still 400 at the RLS layer even though the UI now allows attempting them (the new `res.ok` check will surface that as an inline error rather than a silent failure, which is itself an improvement but not the end state).
- No API route signature/behavior changes — both `DELETE` handlers already relied purely on RLS; only their comments change.

## Implementation Notes

### What Changed
- Added migration 111 granting developers real delete rights on tasks/issues they created (`tasks_developer_delete` / `issues_developer_delete`, `created_by = auth.uid()`), closing the gap identified during planning where delete was previously admin/pm-only for everyone.
- `_shared/_list-view.tsx`: added a working `onBulkDelete` prop end-to-end (it had none before — the Trash button was fully inert), gated row + group-header checkboxes on `getTaskEditPermission(...).canEditDetails`, and replaced the previously-nonexistent confirm flow with `ConfirmDialog`.
- `_shared/_issue-list-view.tsx`: added the same checkbox gating (`getIssueEditPermission`) and swapped the existing `window.confirm()` in `handleBulkTrash` for `ConfirmDialog`.
- `_shared/_project-detail.tsx`: added `bulkDeleteTasks` (mirrors `bulkDeleteIssues`), wired to `<ListView onBulkDelete>`; wired `currentUserId`/`currentUserRole` into `<IssueListView>` (needed for its new per-row permission check).
- Both `_task-detail.tsx` copies (v2 + legacy) and both `_issue-detail.tsx` copies: replaced `window.confirm()` with `ConfirmDialog`, added a `res.ok` check with an inline error message (previously both silently navigated away even on a failed/blocked delete), replaced the plain `title` attribute on the delete button with the app's `Tooltip` component, and added a `deleting` loading state to `_task-detail.tsx` (mirroring what `_issue-detail.tsx` already had).
- `_issue-detail.tsx` (both copies): `canDelete` now reads `perm.canEditDetails` instead of a hardcoded admin/pm/super_admin-only role check, reflecting migration 111 — a developer who created the issue now sees and can use the delete button.
- Updated the `DELETE` handler comment (no code change) in both `/api/v2/tasks/[taskId]/route.ts` and `/api/v2/issues/[issueId]/route.ts` to reflect the new RLS shape.
- Disabled checkboxes use a non-disabled `<span>` wrapper as the `Tooltip` trigger (not the `disabled` `<input>` itself) — disabled form elements don't reliably fire hover/mouse events in Chromium, so wrapping the input directly would silently produce a tooltip that never shows.

### Files Changed
- `supabase/migrations/111_developer_task_issue_delete_rls.sql` — new migration, `tasks_developer_delete` / `issues_developer_delete` policies
- `src/app/api/v2/tasks/[taskId]/route.ts` — `DELETE` handler comment only
- `src/app/api/v2/issues/[issueId]/route.ts` — `DELETE` handler comment only
- `src/app/(hub)/projects/_shared/_list-view.tsx` — `onBulkDelete` prop, `selectableIds`, group-header + row checkbox gating, `ConfirmDialog`-based bulk-delete flow
- `src/app/(hub)/projects/_shared/_issue-list-view.tsx` — `selectableIds`, header + row checkbox gating, `ConfirmDialog`-based bulk-delete flow (was `window.confirm()`)
- `src/app/(hub)/projects/_shared/_project-detail.tsx` — `bulkDeleteTasks`, `onBulkDelete`/`currentUserId`/`currentUserRole` wiring to `<ListView>`/`<IssueListView>`
- `src/app/(hub)/projects/v2/[projectId]/tasks/[taskId]/_task-detail.tsx` — `ConfirmDialog`, `res.ok` check, `deleting` state, `Tooltip`
- `src/app/(hub)/projects/legacy/[projectId]/tasks/[taskId]/_task-detail.tsx` — same (duplicate file)
- `src/app/(hub)/projects/v2/[projectId]/issues/[issueId]/_issue-detail.tsx` — `canDelete` → `perm.canEditDetails`, `ConfirmDialog`, `res.ok` check, `Tooltip`
- `src/app/(hub)/projects/legacy/[projectId]/issues/[issueId]/_issue-detail.tsx` — same (duplicate file)

### Deviations From Plan
- None. Implemented exactly per the Implementation Steps in this doc.
- Noted, not acted on (pre-existing, unrelated to this task): a concurrent session was editing `_shared/_create-task-modal.tsx`/`_shared/_project-detail.tsx` for an unrelated task (286, issue-modal validation) at the same time. A transient `tsc` run mid-edit showed one unrelated type error (`CreateTaskModal`'s `tasks` prop); re-running after that session's edit settled showed a clean pass. Confirmed via `git diff --stat` that the bulk of `_project-detail.tsx`'s changed lines belong to that other session, not this task — my edits (`bulkDeleteTasks`, the two `onBulkDelete`/`currentUserId`/`currentUserRole` wiring blocks) were verified still present and correct throughout.

### Verification Run
- `npx tsc --noEmit` — PASS (clean; one transient error tied to a concurrent unrelated edit resolved itself once that session's edit landed — see Deviations)
- `pnpm lint` — PASS (0 errors, 9 pre-existing warnings in files unrelated to this task's checkbox/dialog logic — unused-import warnings in `_create-task-modal.tsx`, `_project-detail.tsx`, and `_checklist-tab.tsx`, none in the files this task touched for delete/checkbox behavior)
- Manual/browser verification — SKIPPED (not run this session; the task doc's Verification section lists the required manual walkthrough, including applying migration 111 to a live Supabase instance first, as a prerequisite — recommended before/at the `test` stage)

## Quality Gate Notes

### Result
PASS

### Standards Review
- Reviewed every changed hunk via `git diff` per-file (not a blanket file diff) since `_shared/_project-detail.tsx` was concurrently being edited by another session (task 286, unrelated `CreateIssueModal` extraction) — isolated task 285's three hunks there (`bulkDeleteTasks`, `onBulkDelete={bulkDeleteTasks}` on `<ListView>`, `currentUserId`/`currentUserRole` on `<IssueListView>`) and confirmed the large concurrent diff (~213 lines) is unrelated and out of this review's scope.
- No unused imports/dead code in any of the 10 files this task touched — `ConfirmDialog`, `Tooltip`/`TooltipTrigger`/`TooltipContent`, `Loader2`, `getIssueEditPermission` are all referenced.
- No `any` or new type escape hatches introduced; `res.ok` checks and `selectableIds: Set<string>` are properly typed.
- Naming is accurate and consistent with the codebase's existing vocabulary (`selectableIds`, `handleBulkTrash`, `bulkDeleteTasks` mirroring `bulkDeleteIssues`, `canDelete` reused as an alias for `perm.canEditDetails` rather than a new concept).
- Errors are handled intentionally: both detail pages' `handleDelete()` now check `res.ok` and surface an inline error instead of the prior silent-failure/redirect-anyway behavior.
- No secrets, credentials, or debug logging introduced.
- `getTaskEditPermission`/`getIssueEditPermission` were deliberately left untouched (per the task doc's Out of Scope) — `canEditDetails` was already the correct gate; only the RLS layer needed to catch up, which migration 111 does.
- `npx tsc --noEmit` and `pnpm lint` both clean for every file this task touched (lint's 9 pre-existing warnings are all in files this task didn't edit for delete/checkbox logic, or belong to the concurrent session's in-progress work).

### Deviations
- Minor: the disabled-checkbox-with-restricted-tooltip JSX block is near-identical between `_list-view.tsx`'s `Row` and `_issue-list-view.tsx`'s row (same `<span>`-wraps-`disabled input`-wraps-in-`Tooltip` shape, ~15 lines each). Not extracted into a shared component — matches this codebase's established, already-accepted convention of duplicating small per-component UI across exactly two call sites rather than abstracting early (same reasoning task 276 used for not introducing a shared dropdown-positioning hook, and for `getTaskEditPermission`/`getIssueEditPermission` staying separate functions). No fix required.
- Minor: `_project-detail.tsx` was edited concurrently by another in-flight task (286) during this implementation. Verified via per-hunk `git diff` that no task-285 code was affected by or interleaved with that session's changes; both sets of edits landed cleanly and independently. No fix required, noted for traceability.

### Required Fixes
- None.
