# 208: Restrict Developer Project Visibility to Member/Assigned Projects Only

**Created:** 2026-08-05
**Priority:** HIGH
**Type:** bugfix
**Recommended Tier:** balanced
**Status:** Completed (2026-08-05)

---

## Overview

Reported by the user (logged in as `developer`, screenshot of `/v2/projects`): the Projects list shows all 234 projects regardless of whether the logged-in developer has any involvement in them. There is currently **zero** role- or membership-based filtering anywhere in the native Projects module (`src/app/v2/(hub)/projects/**`) — `page.tsx` builds its query from search/status/classification/customer params only, and the detail routes (`[projectId]/tasks`, `/issues`, `/milestones`, and their `[id]` sub-pages) have no membership guard at all, so a developer can also open any project directly by URL even once the list is filtered.

Two scope decisions were confirmed with the user before writing this doc (via `AskUserQuestion`), since guessing wrong here either leaves the reported gap half-fixed or locks developers out of real work:

1. **Roles affected: `developer` only.** `client` role also currently sees every project unfiltered, but that's explicitly left alone — separate concern, not part of this task.
2. **Scope: list AND detail pages.** Filtering the list alone would still let a developer open any project's tasks/issues/milestones by pasting/guessing a `project_id` URL. This task also guards the six detail routes that read live project data.

### What counts as "member/collaborator" for a developer

Investigated two candidate signals before deciding (also confirmed with the user):

- **`project_members` table** (migration 073) — the actual membership/collaborator table. It is only populated when (a) someone starts the 120-day onboarding programme (`seedAndStartProgramme` in `src/lib/programme/seed.ts:93-98`), or (b) an explicit "Add Collaborators" call to `POST /api/projects/[projectId]/members`. Nothing in the native Projects module's own UI writes to it (no collaborator-management UI exists on `_project-detail.tsx` today). Most of the 234 projects are legacy Zoho imports and almost certainly have **zero** rows here.
- **`tasks.assignees`** (`string[]` of `profiles.id`, confirmed real user UUIDs — not names — via `_list-view.tsx:584`'s `task.assignees?.includes(currentUserId)`) — populated per-task, reflects who's actually been assigned work, including on legacy imported tasks.

Decision: a developer can see/open a project if **either** they have a `project_members` row for it **or** they appear in `tasks.assignees` for at least one task in it (OR, not AND). Using `project_members` alone would leave most developers looking at an all-but-empty list today.

`issues.assignee_name`/`assignee_email` are free-text Zoho-import fields, not linkable to `profiles.id` — not usable as a membership signal without fragile email matching, so issues assignment is intentionally not part of this check.

## Requirements

- [ ] `/v2/projects` list query only returns projects where the logged-in `developer` has a `project_members` row OR an assigned task (`tasks.assignees` contains their user id). Other roles (`pm`, `marketing`, `admin`, `super_admin`, `client`) are unaffected — full list as today.
- [ ] Direct URL access to `/v2/projects/[projectId]/tasks`, `/issues`, `/milestones` (and their `[taskId]`/`[issueId]`/`[milestoneId]` sub-pages) 404s for a `developer` who fails the same check, instead of rendering the project.
- [ ] Pagination total (`count: "exact"`) reflects the filtered set for developers, not the global 234.
- [ ] Existing empty state ("No projects yet") covers the zero-accessible-projects case without new copy — verify it reads sensibly for a developer with no assignments yet.

## Out of Scope / Must-Not-Change

- `client` role's visibility on `/v2/projects` — untouched, per explicit user decision.
- `pm`/`marketing`/`admin`/`super_admin` visibility — must continue to see all projects, unfiltered, exactly as today.
- `issues` assignment as a membership signal (see rationale above).
- Any change to `project_members`/`phase_members` RLS, or to the Portfolio Tracker's own separate membership gating (task 203) — that module's logic is untouched.
- No collaborator-management UI is being added to the native Projects module in this task — a developer's only path to gaining visibility today is being assigned a task, or a PM/admin adding them via the existing `/api/projects/[projectId]/members` POST route (no UI wired to it from this module yet — out of scope to add one here).
- No DB migration — both `project_members` and `tasks.assignees` already exist and are readable by the `developer` role (`project_members_staff_read` policy, migration 073, includes `developer`; `tasks` RLS already allows broad staff read per existing app behavior).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/projects/_project-access.ts` | Create | `getDeveloperAccessibleProjectIds(userId)` (list-page filter) and `isProjectVisibleToCurrentUser(projectRowId)` (detail-page guard) |
| `src/app/v2/(hub)/projects/page.tsx` | Modify | Apply `.in("id", ...)` filter for `developer` role using `getDeveloperAccessibleProjectIds` |
| `src/app/v2/(hub)/projects/[projectId]/_get-project-detail-data.ts` | Modify | Return `null` (→ existing `notFound()` at call sites) when `isProjectVisibleToCurrentUser` fails — covers `tasks/page.tsx`, `issues/page.tsx`, `milestones/page.tsx` with no changes needed in those three files |
| `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/page.tsx` | Modify | Call `isProjectVisibleToCurrentUser(project.id)` → `notFound()` after existing project fetch |
| `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/page.tsx` | Modify | Same guard after existing project fetch |
| `src/app/v2/(hub)/projects/[projectId]/milestones/[milestoneId]/page.tsx` | Modify | Same guard after existing project fetch |

Note: `src/app/v2/(hub)/projects/[projectId]/_get-project-detail-data.ts` and `_project-detail.tsx` currently show as modified (`M`) in `git status` from unrelated in-progress work — read the live file before editing, don't assume the version shown above is what's currently on disk.

## Code Context

Current list query has no role filter (`src/app/v2/(hub)/projects/page.tsx:39-96`, relevant slice):
```ts
const { data: { user } } = await supabase.auth.getUser();
const profileRes = user
  ? await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle()
  : null;
const role = profileRes?.data?.role;
const canManageTags = role === "admin" || role === "pm" || role === "super_admin";
...
let projectsQuery = supabase
  .from("projects")
  .select("id,project_id,name,...", { count: "exact" })
  .order(sortSpec.column, ...);

if (customerParam) { projectsQuery = projectsQuery.eq("customer_id", customerParam); }
if (statusValues !== null) { ... }
if (classificationValues !== null) { ... }
if (searchQ) { ... }
projectsQuery = projectsQuery.range(from, to);
```
`role` is already resolved here — the new developer branch slots in right after it, before the query is built, following the same `if (...) projectsQuery = projectsQuery.eq/in(...)` composition style already used for `customerParam`/`statusValues`/`classificationValues`. Reuse the existing zero-match sentinel convention (`.eq("id", "00000000-0000-0000-0000-000000000000")` used at line 82) for the "developer has zero accessible projects" case, via `.in()` with a one-element unmatched-UUID array instead.

Detail-page guard call sites — `getProjectDetailData` (`_get-project-detail-data.ts:17-27`) already fetches `project` then `claimsData` for `currentUserId`; insert the visibility check between those two steps and `return null` on failure, matching the existing `if (!project) return null;` pattern immediately above it. The three list-tab pages (`tasks/page.tsx`, `issues/page.tsx`, `milestones/page.tsx`) already do `if (!data) notFound();` right after calling `getProjectDetailData` — no changes needed in those three files.

The three `[id]` detail pages (`tasks/[taskId]/page.tsx:15-21`, `issues/[issueId]/page.tsx:15-21`, `milestones/[milestoneId]/page.tsx:15-21`) share this exact shape — add the guard call right after:
```ts
const { data: project } = await supabase
  .from("projects")
  .select("id, name, customer_id, project_id")
  .eq("project_id", projectId)
  .single();

if (!project) notFound();
// NEW: if (!(await isProjectVisibleToCurrentUser(project.id))) notFound();
```

`project_members` RLS (migration 073) already includes `developer` in the read policy:
```sql
create policy "project_members_staff_read"
  on project_members for select to authenticated
  using (get_my_role() in ('admin', 'super_admin', 'marketing', 'pm', 'developer', 'hr'));
```

## Implementation Steps

1. Create `src/app/v2/(hub)/projects/_project-access.ts`:
   - `getDeveloperAccessibleProjectIds(userId: string): Promise<string[]>` — parallel query `project_members.select("project_id").eq("user_id", userId)` and `tasks.select("project_id").contains("assignees", [userId])`, union + dedupe (`Set`) the `project_id` values, return as array.
   - `isProjectVisibleToCurrentUser(projectRowId: string): Promise<boolean>` — resolve current user id via `supabase.auth.getClaims()` (no user → `false`); resolve role via `profiles`; non-`developer` role → `true` (unrestricted); `developer` → parallel `.maybeSingle()` on `project_members` (`project_id` + `user_id` match) and `.limit(1).maybeSingle()` on `tasks` (`project_id` match + `.contains("assignees", [userId])`) → `true` if either hit.
2. Wire `getDeveloperAccessibleProjectIds` into `page.tsx`: after the existing `role` resolution, if `role === "developer" && user`, call it and apply `.in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"])` to `projectsQuery`.
3. Wire `isProjectVisibleToCurrentUser` into `_get-project-detail-data.ts` (after the `project` fetch, before building `currentUserId`/the rest) and into the three `[id]` detail pages (right after their own `if (!project) notFound();`).
4. `npx tsc --noEmit` after each file.
5. Manual verification (see below) — no automated test runner in this repo.

## Acceptance Criteria

- [ ] Logged in as `developer` with at least one assigned task: `/v2/projects` shows only projects where that developer has a `project_members` row or an assigned task; pagination total matches the filtered count.
- [ ] Logged in as `developer` with zero assigned tasks/memberships: `/v2/projects` shows the existing "No projects yet" empty state, not an error.
- [ ] Logged in as `developer`, navigating directly to a task/issues/milestones URL for a project they're not a member of and have no assigned task in → 404 (via `notFound()`), not the project's data.
- [ ] Logged in as `developer`, navigating to a project they *do* have an assigned task in (but no `project_members` row) → list and detail pages both work normally — confirms the OR logic, not just the membership-table path.
- [ ] Logged in as `pm`/`marketing`/`admin`/`super_admin`/`client`: `/v2/projects` list and all detail routes behave exactly as before this change (no regression).
- [ ] `npx tsc --noEmit` passes with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Browser-based acceptance pass required per `CLAUDE.md` (role-scoped visibility is a UI/data feature, not covered by typecheck alone): log in as a `developer` account, confirm the list narrows correctly and a direct-URL non-member project 404s; log in as `pm`/`admin` and confirm no change.

## Compatibility Touchpoints

- None — no shared component, API contract, or docs surface changes. Purely additive server-side filtering in the v2 Projects module.

## Implementation Notes

### What Changed
- Added `getDeveloperAccessibleProjectIds(userId)` and `isProjectVisibleToCurrentUser(projectRowId)` in a new shared module. `developer` role is checked against `project_members` OR `tasks.assignees` (via `.contains()`); every other role short-circuits to fully visible, matching the pre-existing behavior.
- `/v2/projects` list query now applies `.in("id", ...)` for the `developer` role using the accessible-ID set, with the existing zero-match-sentinel convention when the set is empty.
- `_get-project-detail-data.ts` (shared by `tasks/page.tsx`, `issues/page.tsx`, `milestones/page.tsx`) now returns `null` when the current user can't see the project, which the existing `if (!data) notFound();` at each of those three call sites already handles — no changes needed in those three files, as planned.
- The three standalone `[id]` detail pages (`tasks/[taskId]`, `issues/[issueId]`, `milestones/[milestoneId]`) each got one added guard line right after their existing `if (!project) notFound();`.

### Files Changed
- `src/app/v2/(hub)/projects/_project-access.ts` — new shared access-check module
- `src/app/v2/(hub)/projects/page.tsx` — developer-scoped `.in("id", ...)` filter on the list query
- `src/app/v2/(hub)/projects/[projectId]/_get-project-detail-data.ts` — visibility check after project fetch
- `src/app/v2/(hub)/projects/[projectId]/tasks/[taskId]/page.tsx` — guard call after project fetch
- `src/app/v2/(hub)/projects/[projectId]/issues/[issueId]/page.tsx` — guard call after project fetch
- `src/app/v2/(hub)/projects/[projectId]/milestones/[milestoneId]/page.tsx` — guard call after project fetch

### Deviations From Plan
- None functionally. One implementation-detail correction during typecheck: the three `[id]` detail pages are two directory levels below `[projectId]/`, so the import needed `../../../_project-access`, not `../../_project-access` — fixed before the typecheck passed clean.

### Verification Run
- `npx tsc --noEmit` — PASS, no errors
- `pnpm lint` — PASS, no warnings or errors
- Browser-based acceptance pass (developer narrows correctly, non-member direct-URL 404s, pm/admin unaffected) — not run in this environment, deferred to the user's own live pass per the task doc's Verification section.

## Quality Gate Notes

### Result
PASS

### Standards Review
- `_project-access.ts`: both functions single-responsibility, correctly typed (no `any`), no dead code, no deep nesting, top-of-file comment explains the non-obvious "why OR, not just `project_members`" decision without restating what the code does.
- Neither function checks `.error` on the Supabase calls before falling back on `data` — matches this codebase's established convention (same pattern in `page.tsx`, `_get-project-detail-data.ts`, and elsewhere: destructure `{ data }`, default with `?? []`/`?.`). Net effect on a transient query error: `isProjectVisibleToCurrentUser` fails open (a `developer` sees the project), which lines up with `role-access.ts`'s documented fail-open default (task 175) rather than contradicting it. Not a blocking issue, noting for the record.
- No secrets, credentials, or debug logging introduced.
- Import paths, `createClient()` usage, and the `.contains()`/zero-match-sentinel `.in()` patterns all match existing conventions used elsewhere in this same file tree.

### Deviations
- Minor — relative import depth fix (`../../../_project-access` vs. the originally-typed `../../_project-access`) noted in Implementation Notes; corrected before typecheck passed, no behavioral effect.
- Minor — `git diff` on `_get-project-detail-data.ts` also shows an `allMembers`/`profiles` `role` field addition (adds `role` to the type and the `select(...)`). This predates this task (the file was already showing as modified in git status before task 208 started, per the session's initial snapshot) and was not touched by this implementation — flagging only so it isn't mistaken for scope creep introduced here.
- No major deviations. All six Requirements items, all Out-of-Scope boundaries, and all Proposed File Changes were implemented exactly as planned; no unapproved scope expansion.

### Required Fixes
- None.

## Completion Notes

Marked completed directly from the quality-gate pass at the user's request (skipping the formal `test`/`document`/`ship` chain stages for this change).

- Two of this task's touched files (`page.tsx` and `_get-project-detail-data.ts`) received further, unrelated concurrent edits from in-progress task 209 work (`canCreateProject`, `currentUserRole`, switching the member-profile lookup to `adminClient`) after the quality gate passed. Re-verified post-hoc that all task 208 lines are still intact and unaffected: the `developerProjectIds` branch + `.in("id", ...)` filter in `page.tsx`, the `isProjectVisibleToCurrentUser` import + guard call in `_get-project-detail-data.ts`, and the same import + guard call in `tasks/[taskId]/page.tsx`, `issues/[issueId]/page.tsx`, and `milestones/[milestoneId]/page.tsx`.
- `npx tsc --noEmit` re-run after those concurrent edits — still PASS, no errors.
- Browser-based acceptance verification (developer-role narrowing, non-member direct-URL 404, pm/admin/no-regression check) was not performed in this environment — still outstanding, left to the user's own live pass as called out in Verification/Quality Gate Notes above. Flagging again here since this is the final status update: functionally complete and typechecked, but not yet manually verified in the running app.
