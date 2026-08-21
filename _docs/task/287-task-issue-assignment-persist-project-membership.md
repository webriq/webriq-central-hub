# 287: Task/Issue Assignment Should Persist Project Membership (Fix Access Loss on Bulk Delete)

**Created:** 2026-08-21
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

A developer's ability to view/open a v2 project is currently computed on the fly as the union of `project_members` rows and tasks they're assigned to (`tasks.assignees` contains their id) — see `isProjectVisibleToCurrentUser()` / `getDeveloperAccessibleProjectIds()` in `src/app/(hub)/projects-old/_project-access.ts` (shipped in task 208, wired into the `/projects/v2` listing in task 284). Assignment itself never writes a `project_members` row — access via the "assigned task" half of the union is purely transient.

Reported bug: when every task assigned to a developer in a project is deleted, the developer immediately loses all access to that project (404 on the detail page, project disappears from their `/projects/v2` listing) — even though, from the user's perspective, being assigned in the first place should have made them a project collaborator, not a guest whose access evaporates the moment the last task is gone.

Fix: when a task or issue is assigned to a user (creation with assignees, or an update that sets/changes assignees), persist a real `project_members` row for that user via the existing `addProjectMember()` helper (`src/lib/programme/phase-membership.ts:55` — idempotent upsert, `ignoreDuplicates: true`, already used by the "Add Collaborators" flow). Once membership is persisted, deleting the task/issue no longer affects access, because `project_members` — not `tasks.assignees` — is what's left backing it.

This is additive only: no removal logic. Un-assigning a task, deleting a task, or deleting all of a developer's tasks in a project must **not** strip their `project_members` row — membership, once granted, is removed only through the existing explicit `DELETE /api/projects/[projectId]/members` action (PM/admin/creator only), exactly like manually-added collaborators today.

## Requirements

- [ ] Creating a task with `assignees` (POST `/api/v2/projects/[projectId]/tasks`) adds each assignee as a `project_members` row for that project (best-effort, non-blocking — same pattern as Zoho push-on-approval).
- [ ] Updating a task's `assignees` (PATCH `/api/v2/tasks/[taskId]`, only reachable when `perm.canEditDetails` is true) adds each new assignee as a `project_members` row for that project.
- [ ] Updating an issue's `assignee_id` (PATCH `/api/v2/issues/[issueId]`, only reachable when `perm.canEditDetails` is true) adds that assignee as a `project_members` row for the issue's project, when `assignee_id` is being set to a non-null value.
- [ ] Deleting a task or issue does not remove any `project_members` row (already true today — no code path does this; this task must not introduce one).
- [ ] Un-assigning (removing someone from `assignees` / clearing `assignee_id`) does not remove their `project_members` row — membership, once granted via assignment, persists until an explicit "Remove collaborator" action.
- [ ] After this change: a developer assigned to a task/issue in a project, whose assignment is later fully removed (task deleted, unassigned, etc.), still sees and can open that project via `/projects/v2` and the detail page.
- [ ] No change to who can assign tasks/issues, or to any existing edit-permission gating (`getTaskEditPermission` / `getIssueEditPermission`) — this only adds a side-effect write to `project_members` on the same request paths that already permit changing `assignees`/`assignee_id`.

## Out of Scope / Must-Not-Change

- No auto-removal of `project_members` on unassignment or deletion — that would silently reintroduce a milder version of the same bug (revoking access someone was explicitly granted).
- `isProjectVisibleToCurrentUser()` / `getDeveloperAccessibleProjectIds()` — the read-side union logic is already correct and unaffected; this task only ensures the write side leaves a durable record behind.
- Issue creation (`POST /api/v2/projects/[projectId]/issues`) does not currently accept/persist `assignee_id` at all (only free-text `assignee_name`/`assignee_email` — confirmed via `_create-issue-modal.tsx`, which collects `assigneeId` locally but only sends `assignee_name`). That gap is pre-existing and unrelated to this bug; not fixing it here.
- `dedicated_developers` (free-text column on `projects`) — confirmed elsewhere (task 284) as unrelated to access control; not touched.
- Marketing/PM listing-visibility gating (`isRoleGatedByMembership`, `excludedProjectIds` in `_load-list-data.ts`) — unaffected; if a task/issue happens to be assigned to a marketing/pm user, adding them to `project_members` is consistent with — not a regression of — that existing gate (it only ever restricts to members).
- Any schema/migration changes — `project_members` and `addProjectMember()` already exist and already support this exact write (task 153/157).
- Task 285 (bulk delete confirm dialog) and task 111's new delete RLS policies — unrelated, in-flight in this same working tree; do not touch `tasks_developer_delete`/`issues_developer_delete` policies or the bulk-delete UI.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/api/v2/projects/[projectId]/tasks/route.ts` | Modify | On task creation, if `assignees` is a non-empty array, upsert each id into `project_members` |
| `src/app/api/v2/tasks/[taskId]/route.ts` | Modify | On task PATCH, if `assignees` was changed (within the `perm.canEditDetails` branch) and is a non-empty array, upsert each id into `project_members`; needs `project_id` added to the existing `existingTask` select |
| `src/app/api/v2/issues/[issueId]/route.ts` | Modify | On issue PATCH, if `assignee_id` was changed (within the `perm.canEditDetails` branch) to a non-null value, upsert it into `project_members`; needs `project_id` added to the existing `existingIssue` select |

## Code Context

### File: `src/lib/programme/phase-membership.ts:55` (reuse as-is, no changes needed)

```ts
export async function addProjectMember(projectId: string, userId: string, addedBy: string, isOwner = false) {
  return adminClient
    .from("project_members")
    .upsert(
      { project_id: projectId, user_id: userId, added_by: addedBy, is_owner: isOwner },
      { onConflict: "project_id,user_id", ignoreDuplicates: true }
    );
}
```

Idempotent (`ignoreDuplicates: true`) — safe to call on every update that touches assignees, no need to diff against the previous assignee list first.

### File: `src/app/api/v2/projects/[projectId]/tasks/route.ts` (POST handler, after the successful insert)

Current insert block ends at:

```ts
  const { data, error } = await supabase
    .from("tasks")
    .insert({ /* ... */ assignees: Array.isArray(body.assignees) ? body.assignees : null, /* ... */ })
    .select()
    .single();

  if (error) { /* ... */ }
  return NextResponse.json(data, { status: 201 });
```

Add a best-effort membership sync before the `return`, using `project.id` (already fetched at the top of the handler) and `user.id` as `addedBy`:

```ts
if (Array.isArray(body.assignees) && body.assignees.length > 0) {
  await Promise.all(
    body.assignees.map((assigneeId: string) => addProjectMember(project.id, assigneeId, user.id))
  ).catch((err) => console.error("[api/v2/projects/[id]/tasks] project_members sync failed:", err));
}
```

(Import `addProjectMember` from `@/lib/programme/phase-membership`.)

### File: `src/app/api/v2/tasks/[taskId]/route.ts` (PATCH handler)

Existing select needs `project_id` added:

```ts
supabase.from("tasks").select("created_by, assignees").eq("id", taskId).maybeSingle(),
```
→
```ts
supabase.from("tasks").select("created_by, assignees, project_id").eq("id", taskId).maybeSingle(),
```

Inside the existing `if (perm.canEditDetails) { ... if ("assignees" in body) patch.assignees = ...; ... }` block, after setting `patch.assignees`, sync membership for the new assignees (use `existingTask.project_id`, which is available in this closure):

```ts
if ("assignees" in body) {
  patch.assignees = Array.isArray(body.assignees) ? body.assignees : null;
  if (Array.isArray(patch.assignees) && patch.assignees.length > 0 && existingTask.project_id) {
    void Promise.all(
      patch.assignees.map((assigneeId) => addProjectMember(existingTask.project_id!, assigneeId, user.id))
    ).catch((err) => console.error("[api/v2/tasks/[id]] project_members sync failed:", err));
  }
}
```

Fire-and-forget (`void ...catch`) is fine here since this is a side-effect write that must never block or fail the task update response — consistent with the Zoho push-on-approval "non-blocking" convention in CLAUDE.md. If the codebase's lint config disallows floating promises, `await` it instead (still wrapped in try/catch or `.catch()`) rather than reworking the pattern.

### File: `src/app/api/v2/issues/[issueId]/route.ts` (PATCH handler)

Existing select needs `project_id` added:

```ts
supabase.from("issues").select("created_by, assignee_id").eq("id", issueId).maybeSingle(),
```
→
```ts
supabase.from("issues").select("created_by, assignee_id, project_id").eq("id", issueId).maybeSingle(),
```

Inside `if (perm.canEditDetails) { ... if ("assignee_id" in body) patch.assignee_id = ...; ... }`, after setting `patch.assignee_id`:

```ts
if ("assignee_id" in body) {
  patch.assignee_id = body.assignee_id || null;
  if (patch.assignee_id && existingIssue.project_id) {
    void addProjectMember(existingIssue.project_id, patch.assignee_id, user.id)
      .catch((err) => console.error("[api/v2/issues/[id]] project_members sync failed:", err));
  }
}
```

## Implementation Steps

1. In `src/app/api/v2/projects/[projectId]/tasks/route.ts`: import `addProjectMember`; after a successful task insert, best-effort-sync each id in `body.assignees` into `project_members` using `project.id` and `user.id`.
2. In `src/app/api/v2/tasks/[taskId]/route.ts`: import `addProjectMember`; add `project_id` to the `existingTask` select; inside the `"assignees" in body` branch (within `perm.canEditDetails`), best-effort-sync each new assignee into `project_members`.
3. In `src/app/api/v2/issues/[issueId]/route.ts`: import `addProjectMember`; add `project_id` to the `existingIssue` select; inside the `"assignee_id" in body` branch (within `perm.canEditDetails`), best-effort-sync the assignee into `project_members` when non-null.
4. `npx tsc --noEmit` to confirm no type errors (watch for `existingTask.project_id` / `existingIssue.project_id` nullability in the generated `Database` types — guard with the `&&` checks shown above, or a non-null assertion only where the column is genuinely `NOT NULL` in `src/types/database.ts`).
5. `pnpm lint`.
6. Browser-based acceptance testing (see Verification) — no test runner configured for this repo.

## Acceptance Criteria

- [ ] As PM/admin: create a task in a project, assign it to a developer with no prior access to that project. As that developer, the project now appears in `/projects/v2` and opens correctly.
- [ ] Delete that task (or all of that developer's tasks in the project). As that developer, the project still appears in `/projects/v2` and still opens — access is retained.
- [ ] Repeat with issue assignment: PM/admin sets `assignee_id` on an issue via the issue detail page; developer gains access; deleting the issue does not revoke it.
- [ ] Un-assigning a developer from a task (clearing them from `assignees`, task not deleted) does not remove their `project_members` row or their access to the project.
- [ ] A PM/admin can still explicitly remove that developer's access via the existing "Remove collaborator" action (`DELETE /api/projects/[projectId]/members`) — confirms this task didn't touch that path.
- [ ] `npx tsc --noEmit` passes.
- [ ] `pnpm lint` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manual browser walkthrough per Acceptance Criteria, using a PM/admin account to assign and a developer-role account to verify access
```

## Compatibility Touchpoints

- No schema/migration changes — reuses the existing `project_members` table and `addProjectMember()` helper as-is.
- No new routes; purely additive side-effect writes inside three existing route handlers.
- No change to RLS policies, including the in-flight migration 111 (`tasks_developer_delete` / `issues_developer_delete`) — deletion behavior itself is untouched, only what deletion no longer breaks.

## Implementation Notes

### What Changed
- Task creation (`POST /api/v2/projects/[projectId]/tasks`) now, after a successful insert, best-effort-syncs each id in `assignees` into `project_members` via `addProjectMember(project.id, assigneeId, user.id)`.
- Task update (`PATCH /api/v2/tasks/[taskId]`) now, inside the existing `"assignees" in body` branch (only reachable when `perm.canEditDetails`), best-effort-syncs each new assignee into `project_members` using `existingTask.project_id` (added to the route's initial select).
- Issue update (`PATCH /api/v2/issues/[issueId]`) now, inside the existing `"assignee_id" in body` branch (only reachable when `perm.canEditDetails`), best-effort-syncs the assignee into `project_members` when non-null, using `existingIssue.project_id` (added to the route's initial select).
- All three syncs reuse `addProjectMember()` as-is (idempotent upsert, `ignoreDuplicates: true`) — no new helper, no schema change.
- No removal logic was added anywhere — unassigning or deleting a task/issue leaves any existing `project_members` row untouched, per the task doc's explicit "no auto-removal" requirement.

### Files Changed
- `src/app/api/v2/projects/[projectId]/tasks/route.ts` — import `addProjectMember`; sync `project_members` for `body.assignees` after task insert.
- `src/app/api/v2/tasks/[taskId]/route.ts` — import `addProjectMember`; added `project_id` to the `existingTask` select; sync `project_members` for `patch.assignees` inside the `canEditDetails` branch.
- `src/app/api/v2/issues/[issueId]/route.ts` — import `addProjectMember`; added `project_id` to the `existingIssue` select; sync `project_members` for `patch.assignee_id` inside the `canEditDetails` branch.

### Deviations From Plan
- None. Implementation matches the Code Context snippets in the task doc exactly (fire-and-forget `void ...catch()` for the PATCH routes, `await ...catch()` for the POST route, matching the doc's rationale).

### Verification Run
- `npx tsc --noEmit` - PASS (clean, no output)
- `pnpm lint` - PASS (0 errors; 2 pre-existing warnings in unrelated file `_checklist-tab.tsx`, untouched by this task — same pre-existing warnings task 284 also noted)
- `pnpm dev` manual browser walkthrough - SKIPPED (no developer-role test account available in this session; same limitation tasks 282/283/284 documented for their own developer-role verification steps). Acceptance criteria involving live PM-assigns/developer-verifies behavior are unverified by browser and should be confirmed at the `test` stage.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, dead code, or commented-out implementation.
- No `any`/untyped escape hatches introduced beyond the file's existing `body: any` pattern (already implicit from `req.json().catch(() => ({}))` in all three files, unchanged by this task).
- No new deep nesting — each addition is a single `if` inside the existing `perm.canEditDetails` branch (PATCH routes) or after the existing insert (POST route), matching the file's existing shape.
- Naming (`addProjectMember`, reused as-is) and inline comments (prefixed `// Task 287 —`, explaining *why* — access must survive later deletion — not *what*) match the codebase's established comment convention.
- No new repeated logic: all three call sites reuse the existing `addProjectMember()` helper from `phase-membership.ts` rather than re-deriving an insert/upsert inline, per the task doc's explicit instruction.
- Error handling is intentional and non-blocking: `.catch(console.error(...))` / fire-and-forget `void` on the PATCH routes, `await ... .catch(...)` on the POST route — mirrors CLAUDE.md's documented "Zoho task push is non-blocking" convention (a side-effect write must never fail the primary request).
- No secrets, credentials, or debug logging.
- `addProjectMember` is imported from `@/lib/programme/phase-membership` (server-only, wraps `adminClient`) into three Route Handlers only — never a Client Component — consistent with CLAUDE.md's "Never import `@/lib/supabase/admin` in Client Components" rule.

### Deviations
- None at Medium or Major level. Implementation matches the task doc's Code Context snippets exactly (file-for-file, line-for-line intent) — no scope expansion, no touched out-of-scope files (`isProjectVisibleToCurrentUser`, issue creation's `assignee_id` gap, RLS/migrations, task 285's bulk-delete UI all left untouched, as required).

### Required Fixes
- None. Live browser verification as a developer-role account (flagged SKIPPED in Implementation Notes) remains outstanding and should happen at the `test` stage, since `tsc --noEmit`/`pnpm lint` both pass cleanly and the code changes are inspectably correct against the task doc's requirements and acceptance criteria.
