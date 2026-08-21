# 284: Developer V2 Projects Dashboard — Click-Through to Project Detail + Membership/Assignment Filter

**Created:** 2026-08-21
**Priority:** HIGH
**Type:** bugfix / feature
**Recommended Tier:** fast
**Status:** Planned

---

## Overview

Developers should be able to click into a v2 project's detail page, and the `/projects/v2` listing should only show them projects where they're a `project_members` row or have an assigned task (`tasks.assignees` contains their `profiles.id`) — same "member OR assigned task" rule already enforced at the detail-page level.

Research found this is currently broken in two ways, both upstream of the (already correct) detail page:

1. **Cards aren't clickable for developers at all.** `canOpenProject()` in `_onboarding-list.tsx` only allows `roleEditable` roles (marketing/admin/super_admin) or membership-gated roles (marketing/pm — via `isRoleGatedByMembership`). `developer` is in neither set, so `ProjectCard` always renders with `editable={false}` for a developer — no `onClick`, no `role="button"`, no cursor-pointer. A developer cannot open *any* v2 project card today, member or not.
2. **The listing query is completely unfiltered for developers.** `loadOnboardingProjectsList()` in `_load-list-data.ts` only restricts rows for `isRoleGatedByMembership(role)` (marketing/pm). `developer` is explicitly called out in `membership-rules.ts` as untouched ("everyone else (developer/hr/client) is untouched by this task, per the user's confirmed scope" — that was a prior task's deliberate scope limit, not a decision that developer should stay unfiltered forever). A developer visiting `/projects/v2` today sees every project across every customer.

The detail page itself (`/projects/v2/[projectId]/...`) is fully built and already gated correctly: `(tabs)/layout.tsx` → `_get-project-detail-data.ts:38` calls `isProjectVisibleToCurrentUser(project.id)`, which for a `developer` role checks `project_members` OR `tasks.assignees` contains the user, 404-ing otherwise. There's also an existing list-producing helper, `getDeveloperAccessibleProjectIds(userId)`, already used by the main dashboard's project count — it implements the exact same union rule and just isn't wired into the `/projects/v2` listing query yet.

Task 282 (completed) covered *removing* developer write-capability (rename/delete/manage-collaborators/Status Report tab) from the v2 project module. This task is the other half — *adding* correct read/navigate capability — and does not touch anything 282 already fixed.

## Requirements

- [ ] `/projects/v2` listing query returns only projects where the current developer is a `project_members` row or has a task assigned to them (`tasks.assignees` contains their id) — zero such projects renders the existing empty state, not an error.
- [ ] Every project card a developer *does* see in that list is clickable and navigates to `/projects/v2/{project_id}/timeline`, matching the existing navigation target for other roles.
- [ ] No change to which projects any other role (admin/super_admin/marketing/pm/hr/client) sees or can open.
- [ ] No change to edit/delete/manage-collaborator/rename capability for developers (task 282's gating stays intact) — this task only affects visibility of the "open project" affordance, not write permissions.
- [ ] The dev dashboard's "My projects" workspace-card link goes to the v2 listing (`V2_ROUTES.PROJECTS_V2`), not the legacy one, so the dashboard's own entry point lands developers on the now-correctly-filtered list.

## Out of Scope / Must-Not-Change

- Legacy projects listing/detail (`/projects/legacy`) — unaffected, no request to change it.
- `dedicated_developers` (free-text names column on `projects`) — confirmed not used for access control anywhere; do not wire it into this filter.
- Task 282's Status Report tab gating, kebab-menu write-permission gating, or any other already-shipped developer restriction — verify unaffected, don't re-touch.
- `isProjectVisibleToCurrentUser()` / the detail-page gate itself — already correct, no changes needed there.
- Any change to `project_members` or `tasks.assignees` data/schema — this is a read-filter change only.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_v2-listing/_load-list-data.ts` | Modify | Restrict query results to `getDeveloperAccessibleProjectIds(userId)` when `role === "developer"` |
| `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` | Modify | Add `role === "developer"` to `canOpenProject()` so cards render clickable |
| `src/app/(hub)/dashboard/_components/dev-dashboard.tsx` | Modify | Fix "My projects" workspace-card link from `V2_ROUTES.PROJECTS_LEGACY` to `V2_ROUTES.PROJECTS_V2` |

## Code Context

### File: `src/app/(hub)/projects-old/_project-access.ts` (existing helper — reuse, do not duplicate)

```ts
export async function getDeveloperAccessibleProjectIds(userId: string): Promise<string[]> {
  const supabase = await createClient();
  const [{ data: memberRows }, { data: taskRows }] = await Promise.all([
    supabase.from("project_members").select("project_id").eq("user_id", userId),
    supabase.from("tasks").select("project_id").contains("assignees", [userId]),
  ]);
  const ids = new Set<string>();
  for (const row of memberRows ?? []) ids.add(row.project_id);
  for (const row of taskRows ?? []) ids.add(row.project_id);
  return [...ids];
}
```

Note the cross-tree import (`projects-old/_project-access.ts` imported from `projects/_v2-listing/`) — this is already an established pattern; the v2 detail-page gate imports `isProjectVisibleToCurrentUser` from the same file today.

### File: `src/app/(hub)/projects/_v2-listing/_load-list-data.ts` (lines 69–83, the existing marketing/pm exclusion pattern to mirror)

```ts
let excludedProjectIds: string[] = [];
if (isRoleGatedByMembership(role)) {
  const { data: memberRows } = await supabase.from("project_members").select("project_id, user_id");
  const projectsWithMembers = new Set((memberRows ?? []).map((r) => r.project_id));
  const myMemberProjectIds = new Set((memberRows ?? []).filter((r) => r.user_id === userId).map((r) => r.project_id));
  excludedProjectIds = [...projectsWithMembers].filter((id) => !myMemberProjectIds.has(id));
}
// ... later:
if (excludedProjectIds.length > 0) {
  query = query.not("id", "in", `(${excludedProjectIds.join(",")})`);
}
```

Developer needs an **inclusion** filter instead (strict allow-list, no "zero members = unrestricted" backward-compat carve-out — that carve-out exists for marketing/pm because `project_members` predates task-based assignment; for developer the union already covers both membership and task assignment, so nothing needs a legacy exception). Add a sibling block, e.g.:

```ts
let allowedProjectIds: string[] | null = null; // null = no restriction
if (role === "developer") {
  allowedProjectIds = await getDeveloperAccessibleProjectIds(userId);
}
// ... later, alongside the excludedProjectIds application:
if (allowedProjectIds !== null) {
  query = allowedProjectIds.length > 0
    ? query.in("id", allowedProjectIds)
    : query.eq("id", ZERO_ROWS_ID); // same zero-rows sentinel already used elsewhere in this file
}
```

### File: `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` (lines 143–149)

```ts
const roleEditable = role === "marketing" || role === "admin" || role === "super_admin";
const canOpenProject = (item: OnboardingProjectListItem) =>
  roleEditable || (isRoleGatedByMembership(role) && !!currentUserId && item.members.some((m) => m.id === currentUserId));
```

Change to:

```ts
const canOpenProject = (item: OnboardingProjectListItem) =>
  roleEditable
  || role === "developer" // list is now server-filtered to accessible projects only — any card shown is safe to open
  || (isRoleGatedByMembership(role) && !!currentUserId && item.members.some((m) => m.id === currentUserId));
```

`item.members` (populated from `project_members` + Phase 1 `phase_members` only, not `tasks.assignees` — see `_load-list-data.ts:155-167`) is why a per-item client-side check can't cover the "assigned task" half of the rule for developer; relying on the server-side pre-filter instead of duplicating the union client-side is correct here, since the row wouldn't be in the list at all otherwise.

`editable` only controls click-to-navigate + cursor styling on `ProjectCard` (`_project-card.tsx:126-141`) — it does not affect rename/delete/manage-collaborators, which are separately gated by `canManageCollaborators`/`canDelete`/`canSetOwner` props (already `false` for developer via `canManageProjectMembers`/`canSetProjectOwner` in `membership-rules.ts`, and `canDeleteProjects` in `_onboarding-list.tsx:153` which also excludes developer). No risk of this change re-opening a write capability task 282 closed.

### File: `src/app/(hub)/dashboard/_components/dev-dashboard.tsx` (line 143)

```tsx
<Link href={V2_ROUTES.PROJECTS_LEGACY}>
```

Change to:

```tsx
<Link href={V2_ROUTES.PROJECTS_V2}>
```

(Exact surrounding JSX/props may differ slightly — read the file before editing; this is the only line that needs to change.)

## Implementation Steps

1. In `_load-list-data.ts`: import `getDeveloperAccessibleProjectIds` from `../projects-old/_project-access`; add the `allowedProjectIds` block and apply `.in("id", allowedProjectIds)` / zero-rows fallback to the query, per the Code Context above.
2. In `_onboarding-list.tsx`: extend `canOpenProject` with the `role === "developer"` clause.
3. In `dev-dashboard.tsx`: read the file, locate the "My projects" workspace-card `Link`, and change its `href` from `V2_ROUTES.PROJECTS_LEGACY` to `V2_ROUTES.PROJECTS_V2`.
4. `npx tsc --noEmit` to confirm no type errors.
5. Browser-based acceptance testing (see Verification) — no test runner is configured for this repo.

## Acceptance Criteria

- [ ] As a `developer`-role test account with at least one `project_members` row and/or one assigned task: `/projects/v2` shows only those project(s), cards render clickable (cursor pointer, hover state), clicking navigates to `/projects/v2/{project_id}/timeline` and the page renders (not a 404).
- [ ] As the same account, a project the developer has no membership/assignment in does not appear in the listing at all.
- [ ] If the developer has zero accessible projects, the listing renders its existing empty state (not a crash, not "every project").
- [ ] Dashboard's "My projects" workspace card, when clicked, lands on `/projects/v2` (not `/projects/legacy`).
- [ ] As `admin`/`super_admin`/`marketing`/`pm`: listing contents and click-through behavior are unchanged from before this task (no regression).
- [ ] Task 282's developer write-restrictions (no Rename/Delete/Manage Collaborators/Set Owner/Status Report tab) remain intact for developer — spot-check one project.
- [ ] `npx tsc --noEmit` passes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # manual browser walkthrough as described in Acceptance Criteria, using a developer-role test account
```

## Implementation Notes

### What Changed
- `_load-list-data.ts`: developer role now gets a strict allow-list filter (`getDeveloperAccessibleProjectIds(userId)` — project_members ∪ tasks.assignees union), applied via `.in("id", allowedProjectIds)` with the same zero-rows-sentinel fallback the classification filter already uses when the list is empty. Sits alongside, not replacing, the existing marketing/pm exclusion-list logic.
- `_onboarding-list.tsx`: `canOpenProject()` now also returns `true` for `role === "developer"`, since the listing is pre-filtered server-side — any card a developer sees is already access-checked.
- `dev-dashboard.tsx`: "My projects" workspace-card link now points at `V2_ROUTES.PROJECTS_V2` instead of `V2_ROUTES.PROJECTS_LEGACY`.

### Files Changed
- `src/app/(hub)/projects/_v2-listing/_load-list-data.ts` — added `allowedProjectIds` allow-list block + query filter, imported `getDeveloperAccessibleProjectIds` from `../../projects-old/_project-access`
- `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` — extended `canOpenProject()` with the developer clause
- `src/app/(hub)/dashboard/_components/dev-dashboard.tsx` — fixed workspace-card `href`

### Deviations From Plan
- None. Import path resolved to `../../projects-old/_project-access` (two levels up from `_v2-listing/`, not one) — the task doc's Code Context section showed the import target correctly but didn't spell out the relative path; confirmed via directory listing before writing it.

### Verification Run
- `npx tsc --noEmit` - PASS (clean, no output)
- `pnpm lint` - PASS (0 errors; 2 pre-existing warnings in an unrelated file, `_checklist-tab.tsx`, untouched by this task)
- `pnpm dev` manual browser walkthrough - SKIPPED (no developer-role test account available in this sandbox session; same limitation task 282 and 283 documented for their own developer-role verification steps). Acceptance criteria involving live developer-account behavior are unverified by browser and should be confirmed before this task is considered fully done — flagging for the next stage/human reviewer rather than closing silently.

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, no dead code, no commented-out implementation.
- No `any` or untyped escape hatches introduced; `allowedProjectIds: string[] | null` is explicitly typed and mirrors the existing `excludedProjectIds` pattern in the same file.
- No new nesting — each change is a single conditional block or ternary added alongside an existing sibling block of the same shape.
- Naming (`allowedProjectIds`, `getDeveloperAccessibleProjectIds`) accurately describes behavior and matches the existing `excludedProjectIds` / `isProjectVisibleToCurrentUser` vocabulary already used in this module.
- No new repeated logic — the developer allow-list reuses the existing `getDeveloperAccessibleProjectIds()` helper instead of re-deriving the member∪assigned-task union inline, per the task doc's explicit instruction not to duplicate it.
- No error-handling gaps introduced; `getDeveloperAccessibleProjectIds` already handles empty result sets (`??[]`) internally, and the zero-rows sentinel (`ZERO_ROWS_ID`) fallback here matches the file's existing convention for "filter down to nothing" cases.
- No secrets, credentials, or debug logging.
- Comments explain *why* (rationale, cross-file relationship to `_load-list-data.ts` and `isProjectVisibleToCurrentUser`), not *what* — consistent with CLAUDE.md's comment convention and the file's existing comment style.

### Deviations
- None at Medium or Major level. One Minor implementation detail already logged in Implementation Notes: the cross-tree import resolved to `../../projects-old/_project-access` (two directory levels up), which the task doc's Code Context didn't spell out explicitly — confirmed by directory listing before writing, not a scope or behavior deviation.
- Scope boundaries from the task doc's "Out of Scope / Must-Not-Change" were respected: legacy listing/detail, `dedicated_developers`, task 282's write-permission gating, and `isProjectVisibleToCurrentUser()` were not touched.

### Required Fixes
- None. Live browser verification as a developer-role account (flagged as SKIPPED in Implementation Notes) remains outstanding and should happen at the `test` stage rather than blocking the quality gate itself, since `tsc`/`lint` both pass and the code changes are inspectably correct against the task doc's requirements.

## Compatibility Touchpoints

- No schema/migration changes, no new routes, no packaging/docs/adapter impact.
- Purely additive to existing role-branching logic in two files plus a one-line link fix in a third; no API surface changes.
