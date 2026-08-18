# 264: Manage Collaborators — Projects & Portfolio Tracker Listings + Projects Detail Page

**Created:** 2026-08-18
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Completed (2026-08-18)

---

## Overview

A "Manage Collaborators" feature already exists, but only on the Portfolio Tracker **detail**
page (`(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` and its "generic" sibling
`_generic-phase-view.tsx`), behind a Settings-gear dropdown, alongside "Set Project Owner" and
"Delete Project". It lets a permitted user search the staff directory, stage several people,
confirm-add them as `project_members` rows, and remove existing collaborators (owner excluded)
— all via the already-generic `GET/POST/DELETE /api/projects/[projectId]/members` route (keyed
by the project's UUID `id`, not the display `project_id` — confirmed by its existing caller at
`_onboarding-detail.tsx:1280` using `project.id`).

This task extends the same capability (add/remove collaborators, with search) to three places
that don't have it yet, as a **modal** rather than an inline panel (since none of the three call
sites have the detail page's large scrollable layout to host an inline panel in):

1. **Projects listing** (`(hub)/projects` grid view) — kebab menu next to the existing
   "Delete Project" item.
2. **Portfolio Tracker listing** (`(hub)/portfolio-tracker` cards) — kebab menu next to the
   existing "Delete Project" item.
3. **Projects detail page** (`(hub)/projects/[projectId]/_project-detail.tsx`) — a new icon
   button in the header, beside the existing "Delete Project" icon button
   (`_delete-project-action.tsx`), each with a real tooltip (this codebase's Base UI
   `Tooltip`/`TooltipTrigger`/`TooltipContent`, not the native `title` attribute the Delete
   button currently uses).

The Portfolio Tracker **detail** page's existing Settings-menu feature (Manage Collaborators +
Set Project Owner) is the reference implementation and is not touched by this task — "Set
Project Owner" / ownership transfer is explicitly out of scope everywhere in this task; only
add/remove collaborators is being replicated.

No new API routes or DB migrations are needed — `/api/projects/[projectId]/members` (GET/POST/
DELETE) is already generic (keyed by the project row's UUID, works for both the Projects module
and the Portfolio Tracker module) and `/api/staff-directory` already provides the searchable
people list. This is scoped as frontend wiring: a new shared modal component + gating/plumbing
in 4 listing files + 2 detail-page files.

## Requirements

- [ ] New shared `ManageCollaboratorsModal` component: fetches current `project_members` (GET)
      and the staff directory (GET) on open, supports search-then-stage-then-confirm add (POST,
      batched), and per-person remove (DELETE, owner excluded from removal) — visually and
      behaviorally equivalent to the existing `CollaboratorsPanel` in `_onboarding-detail.tsx`,
      but rendered as a centered modal dialog (this app's `fixed inset-0` overlay convention),
      not an inline page panel.
- [ ] **Projects listing** (grid view): `_project-card-menu.tsx`'s kebab dropdown gets a new
      "Manage Collaborators" item (Users icon) beside "Delete Project", opening the modal for
      that row's project.
- [ ] **Portfolio Tracker listing**: `_portfolio-card-menu.tsx`'s kebab dropdown gets the same
      new item beside its existing "Delete Project" item.
- [ ] **Projects detail page**: a new icon button beside `DeleteProjectAction` in
      `_project-detail.tsx`'s header, opening the same modal for the current project.
- [ ] Both icon buttons on the Projects detail page (existing Delete + new Manage Collaborators)
      use the real `Tooltip`/`TooltipTrigger`/`TooltipContent` components (matching the pattern
      already used at `_project-detail.tsx:518-532` for the view-toggle buttons), not a native
      `title` attribute.
- [ ] Visibility/permission gating on all three surfaces uses the same rule as the existing
      detail-page feature: `canManageProjectMembers(role, isCreator)` from
      `@/lib/programme/membership-rules` (super_admin/admin/pm, or the project's creator) — not
      simply reusing the narrower `canDeleteProjects` role list, since a project creator with a
      role outside admin/pm/super_admin can manage collaborators but not delete the project.
- [ ] Listing kebab menus show the "Manage Collaborators" item independently of "Delete
      Project" — a user who can only manage collaborators (creator exception) still sees the
      kebab menu with just that one item; a user who can only delete still sees just Delete.

## Out of Scope / Must-Not-Change

- **"Set Project Owner" / ownership transfer** — stays exclusively on the Portfolio Tracker
  detail page's existing Settings menu (`OwnerPanel`/`canSetProjectOwner`). Not duplicated or
  exposed from any of the three new surfaces in this task.
- **`/api/projects/[projectId]/members` and `/api/staff-directory` routes** — already generic
  and already enforce `canManageProjectMembers`/`canSetProjectOwner` server-side (defense in
  depth). No route changes.
- **Portfolio Tracker detail page** (`_onboarding-detail.tsx`, `_generic-phase-view.tsx`) — the
  existing Settings-menu feature there is the reference, not a target of this task. Do not
  refactor it to reuse the new shared modal; it stays as its own inline-panel implementation
  (different UX: inline panel vs modal, and it also has the Owner panel this task doesn't touch).
- **Projects module List view** (`_project-list-view.tsx`) — currently has no kebab
  menu/actions at all (Delete Project only exists in Grid view today). This task does not add
  one; scope is "wherever Delete Project already exists," which for the Projects module is Grid
  view only.
- **`_project-detail.tsx` wholesale refactor** — this file is already ~1265 lines (well past
  `nextjs-file-length-best-practices.md`'s ceiling), but that's pre-existing debt outside this
  task's scope. Keep the diff to that file minimal (one import + one new JSX element + wrapping
  the existing Delete button in a real Tooltip) — do not attempt a broader split/refactor of the
  file as part of this task.
- **`/api/staff-directory`'s own role gate** (`admin|super_admin|pm|marketing`) is narrower than
  `canManageProjectMembers`'s creator exception — a non-listed-role creator opening the modal
  will see "No staff directory entries found" in the search (existing chips/remove still work).
  This is a pre-existing limitation already present in the reference implementation
  (`_onboarding-detail.tsx`) — not a new bug to fix here.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/components/projects/manage-collaborators-modal.tsx` | Create | Shared modal: search/stage/add + remove collaborators, used by all 3 surfaces |
| `src/app/(hub)/projects/[projectId]/_manage-collaborators-action.tsx` | Create | Icon-button trigger for the Projects detail page (mirrors `_delete-project-action.tsx`), owns its own open state + renders the shared modal |
| `src/app/(hub)/projects/page.tsx` | Modify | Add `created_by` to the `projects` select; compute per-row `canManageCollaborators` via `canManageProjectMembers` |
| `src/app/(hub)/projects/_projects-index.tsx` | Modify | Add `canManageCollaborators: boolean` to `ProjectListItem` type |
| `src/app/(hub)/projects/_project-grid-view.tsx` | Modify | Widen the menu-render gate to `(canDeleteProjects && p.project_id) \|\| p.canManageCollaborators`; pass new props to `ProjectCardMenu` |
| `src/app/(hub)/projects/_project-card-menu.tsx` | Modify | Add "Manage Collaborators" item + modal wiring; accept `projectDbId`, `canDelete`, `canManageCollaborators` props |
| `src/app/(hub)/projects/[projectId]/_delete-project-action.tsx` | Modify | Wrap the existing icon button in a real `Tooltip` (replacing the native `title` attr) |
| `src/app/(hub)/projects/[projectId]/_project-detail.tsx` | Modify | Import and render `<ManageCollaboratorsAction>` beside `<DeleteProjectAction>` (~line 438) |
| `src/app/(hub)/portfolio-tracker/_load-list-data.ts` | Modify | Add `created_by` to the `projects` select; compute per-row `can_manage_collaborators` |
| `src/app/(hub)/portfolio-tracker/_onboarding-list.tsx` | Modify | Add `canManageCollaborators: boolean` to `OnboardingProjectListItem`; pass to `ProjectCard` |
| `src/app/(hub)/portfolio-tracker/_project-card.tsx` | Modify | Accept + thread new prop; widen `showMenu` |
| `src/app/(hub)/portfolio-tracker/_portfolio-card-menu.tsx` | Modify | Add "Manage Collaborators" item + modal wiring; accept `projectDbId`, `canDelete`, `canManageCollaborators` props |

## Code Context

### `canManageProjectMembers` — the permission rule to reuse everywhere (already client-safe)
`src/lib/programme/membership-rules.ts:29-32`
```ts
export function canManageProjectMembers(role: string | null, isCreator: boolean): boolean {
  if (isCreator) return true;
  return role === "super_admin" || role === "admin" || role === "pm";
}
```

### Existing members API — already generic, no changes needed
`src/app/api/projects/[projectId]/members/route.ts` — `[projectId]` here is the project's UUID
`id` (confirmed by the only current caller, `_onboarding-detail.tsx:1280`:
`fetch(\`/api/projects/${project.id}/members\`)`), **not** the display `projects.project_id`
column used elsewhere in routing.
- `GET` → `{ id, user_id, is_owner, added_by, created_at, profiles: { full_name, role } | null }[]`,
  any authenticated user.
- `POST` body `{ user_ids: string[] }` → batched add, `canManageProjectMembers`-gated, sends
  notifications.
- `DELETE ?user_id=...` → remove one member, `canManageProjectMembers`-gated, 409s if the target
  is the current owner (transfer ownership first — that path is out of scope here).

### Reference UI to mirror (visual language + interaction, not to be reused directly since it's an inline panel, not a modal, and lives in a different route group)
`src/app/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx:1030-1145` (`CollaboratorsPanel`)
— search input above staged chips, `onMouseDown preventDefault` so the click survives the
input's `onBlur`, stage-then-confirm ("Add N" button) rather than add-on-click, existing members
rendered as `PersonChip`s with owner excluded from the remove `X`.

### Modal shell convention to follow (not `ConfirmDialog` — this needs a body, not just a confirm/cancel)
`src/app/(hub)/projects/_create-project-modal.tsx:52-53`
```tsx
<div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071133]/40 p-4" onClick={onClose}>
  <div className="w-full max-w-md rounded-[14px] bg-white shadow-[0_8px_24px_rgba(7,17,51,0.10)] border border-[#E2E7F2] overflow-hidden" onClick={(e) => e.stopPropagation()}>
```
Use `z-[60]` (not `z-50`) since this modal can be triggered from inside a listing kebab dropdown
(`z-40`/`z-50` per `_portfolio-card-menu.tsx`/`_project-card-menu.tsx`) — same reasoning already
documented in `_delete-project-menu-item.tsx:14-17` for why `ConfirmDialog` uses `z-[60]`.

### Real Tooltip pattern to use for both icon buttons on the Projects detail page
`src/app/(hub)/projects/[projectId]/_project-detail.tsx:518-532`
```tsx
<Tooltip>
  <TooltipTrigger render={
    <button onClick={...} aria-label="..." className="...">
      <IconHere size={13} />
    </button>
  } />
  <TooltipContent side="top">Label</TooltipContent>
</Tooltip>
```
`Tooltip`/`TooltipTrigger`/`TooltipContent` already imported in this file
(`_project-detail.tsx:12`) and in `_delete-project-action.tsx` will need a new import from
`@/components/ui/tooltip`.

### `_delete-project-action.tsx` — current icon-button shape to mirror for the new action + to update with a real Tooltip
`src/app/(hub)/projects/[projectId]/_delete-project-action.tsx:36-46`
```tsx
<div className="relative">
  <button
    type="button"
    onClick={() => setConfirmOpen(true)}
    aria-label="Delete Project"
    title="Delete Project"
    className="inline-flex cursor-pointer items-center justify-center rounded-full border border-[#E2E7F2] bg-white p-2.5 text-[#5F6A88] transition-colors hover:border-[#F5B8B1] hover:bg-[#FDE8E6] hover:text-[#C0392B]"
  >
    <Trash2 size={13} />
  </button>
```
Replace `title="Delete Project"` with the `Tooltip` wrapper above; keep `aria-label` as-is
(accessibility, independent of the visual tooltip). The new `ManageCollaboratorsAction` button
should reuse the same circular icon-button classes with a neutral (non-danger) hover state, e.g.
`hover:border-[#A8C6F5] hover:bg-[#E5F1FF] hover:text-[#007BFF]`, with a `Users` icon
(`lucide-react`) — matching the existing Settings-menu item's icon choice
(`_generic-phase-view.tsx:301`: `<Users size={13} .../> Manage Collaborators`).

### `_project-detail.tsx` header insertion point
`src/app/(hub)/projects/[projectId]/_project-detail.tsx:437-442`
```tsx
<div className="flex items-center gap-2 shrink-0">
  <DeleteProjectAction
    projectId={project.project_id}
    projectName={project.name}
    currentUserRole={currentUserRole}
  />
  {/* insert <ManageCollaboratorsAction ... /> here, before DeleteProjectAction or after — either order is fine, just keep them adjacent */}
```
`currentUserId`, `currentUserRole`, and `project` (via `select("*")` in
`_get-project-detail-data.ts:25`, which already includes `created_by`) are all already in scope
in this component (`_project-detail.tsx:101-102,115-116`) — no new data threading needed for
this surface. Pass `projectDbId={project.id}` (UUID, for the members API) and compute
`isCreator={project.created_by === currentUserId}` inline for the
`canManageProjectMembers(currentUserRole, isCreator)` check inside the new action component.

### Listing plumbing — `projects` select + per-row flag (Projects module)
`src/app/(hub)/projects/page.tsx:69-71` (select) and `:176-193` (row mapping)
```ts
.select("id,project_id,name,project_type,status,customer_id,end_date,tags,owner_name,updated_at,external_project_id,customer_product_id", { count: "exact" })
```
Add `created_by` to this select list. In the `.map()` building `ProjectListItem[]`, add:
```ts
canManageCollaborators: canManageProjectMembers(role ?? null, p.created_by === user?.id),
```
(`role` and `user` are already resolved earlier in this same function, lines 42-51.)

### Listing plumbing — `projects` select + per-row flag (Portfolio Tracker)
`src/app/(hub)/portfolio-tracker/_load-list-data.ts:85-100` (select) and `:172-196` (row mapping)
— same pattern: add `created_by` to the multi-line select string, add
`can_manage_collaborators: canManageProjectMembers(role, p.created_by === userId)` to the
returned object (`userId`/`role` are the function's own parameters, line 36-37).

### `_project-grid-view.tsx` gate to widen
`src/app/(hub)/projects/_project-grid-view.tsx:43-45`
```tsx
{canDeleteProjects && p.project_id && (
  <ProjectCardMenu projectId={p.project_id} projectName={p.name} />
)}
```
→ gate on `(canDeleteProjects && p.project_id) || p.canManageCollaborators`, and pass
`projectDbId={p.id}`, `canDelete={canDeleteProjects && !!p.project_id}`,
`canManageCollaborators={p.canManageCollaborators}` into `ProjectCardMenu`.

### `_project-card.tsx` gate to widen (Portfolio Tracker)
`src/app/(hub)/portfolio-tracker/_project-card.tsx:29,113-116`
```ts
const showMenu = canDelete && !!item.project_id;
...
{showMenu && (
  <div className="absolute top-4 right-4">
    <PortfolioCardMenu projectId={item.project_id!} projectName={item.project_name} onDeleted={onDeleted} />
  </div>
)}
```
→ `const showMenu = (canDelete && !!item.project_id) || canManageCollaborators;` (new prop),
pass `projectDbId={item.id}`, `canDelete={canDelete && !!item.project_id}`,
`canManageCollaborators={canManageCollaborators}` into `PortfolioCardMenu`.

## Implementation Steps

1. Build `src/components/projects/manage-collaborators-modal.tsx`:
   - Props: `{ open: boolean; onClose: () => void; projectDbId: string; projectName: string }`.
   - On `open` becoming `true`, fetch `GET /api/projects/${projectDbId}/members` and
     `GET /api/staff-directory` in parallel; map the members response to a local
     `{ id, user_id, is_owner, full_name, role }[]` shape (same mapping as
     `_onboarding-detail.tsx:1271-1273`).
   - Search/stage/confirm-add (POST, batched `user_ids`), single-remove (DELETE), busy/error
     states — same interaction shape as `CollaboratorsPanel`, styled as a modal dialog per the
     `_create-project-modal.tsx` shell convention (`z-[60]`, see Code Context above) with its own
     header row (title + close `X`) instead of `PanelHeader`.
   - Do not include owner-transfer UI.
2. Create `src/app/(hub)/projects/[projectId]/_manage-collaborators-action.tsx`: circular icon
   button (Users icon) wrapped in `Tooltip`/`TooltipTrigger`/`TooltipContent` ("Manage
   Collaborators"), owns `open` state, renders `ManageCollaboratorsModal`. Accepts
   `{ projectDbId, projectName, currentUserRole, isCreator }` and internally gates rendering
   (`return null`) via `canManageProjectMembers` when neither condition is met — mirroring
   `DeleteProjectAction`'s own `if (!currentUserRole || ...) return null;` guard.
3. Update `_delete-project-action.tsx` to wrap its button in a real `Tooltip` instead of the
   native `title` attribute (see Code Context snippet above).
4. Wire `_project-detail.tsx`: import `ManageCollaboratorsAction`, render it beside
   `DeleteProjectAction` with `projectDbId={project.id}`,
   `isCreator={project.created_by === currentUserId}`.
5. Projects listing: update `page.tsx` (select + per-row flag), `_projects-index.tsx` (type),
   `_project-grid-view.tsx` (gate + prop passthrough), `_project-card-menu.tsx` (new menu item +
   modal, accept `projectDbId`/`canDelete`/`canManageCollaborators`, keep existing Delete
   behavior unchanged when `canDelete` is true).
6. Portfolio Tracker listing: same shape of changes across `_load-list-data.ts`,
   `_onboarding-list.tsx`, `_project-card.tsx`, `_portfolio-card-menu.tsx`.
7. Run `npx tsc --noEmit` and `pnpm lint`; fix any type errors from the new props/fields.
8. Manual browser check (see Verification) on both listings (grid card menus) and the Projects
   detail page header.

## Acceptance Criteria

- [ ] On `/projects` (grid view), a permitted user sees a "Manage Collaborators" item in the
      kebab menu beside "Delete Project"; clicking it opens a modal showing current
      collaborators, a working search-to-add flow, and per-person remove (owner excluded).
- [ ] On `/portfolio-tracker`, the same behavior is available from each card's kebab menu.
- [ ] On a Projects detail page (`/projects/[projectId]`), a new icon button beside "Delete
      Project" opens the same modal for that project; both icon buttons show a real tooltip on
      hover (not the native browser title tooltip).
- [ ] A user who is the project's creator but not admin/pm/super_admin sees "Manage
      Collaborators" (via `canManageProjectMembers`'s creator exception) even where they would
      not see "Delete Project".
- [ ] Adding/removing collaborators from any of the three surfaces is reflected correctly by
      `GET /api/projects/[id]/members` (verified by reopening the modal, or by the Portfolio
      Tracker detail page's own avatar stack for the same project).
- [ ] The project owner's chip cannot be removed from the new modal (button absent/disabled,
      matching `PersonChip`'s existing behavior), and the server's 409 guard is the backstop.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.
- [ ] No changes to `/api/projects/[projectId]/members`, `/api/staff-directory`, or the
      Portfolio Tracker detail page's existing Settings-menu feature.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then manually exercise, as a super_admin/admin/pm test account:
#  - /projects (grid view): kebab menu → Manage Collaborators → search, add, remove
#  - /portfolio-tracker: card kebab menu → Manage Collaborators → search, add, remove
#  - /projects/[projectId]: header icon button → same modal; hover both icon buttons to
#    confirm the real Tooltip renders (not a native title tooltip)
#  - Confirm existing "Delete Project" flows on all three surfaces are unaffected
```

## Compatibility Touchpoints

- No DB migration, no new API routes, no change to the MCP tool inventory
  (`_docs/mcp-tools.md`) — purely additive frontend wiring against existing endpoints.
- Does not affect packaging, docs, or install surface.

## Implementation Notes

### What Changed
- Built `ManageCollaboratorsModal` (shared, `src/components/projects/`) — search-to-add +
  remove collaborators against the existing `/api/projects/[projectId]/members` (GET/POST/
  DELETE, keyed by the project's UUID `id`) and `/api/staff-directory` endpoints. No owner
  transfer UI, matching the Out-of-Scope boundary.
- Added `ManageCollaboratorsAction` (icon-button trigger, `(hub)/projects/[projectId]/`) beside
  `DeleteProjectAction` on the Projects detail page; both icon buttons now use the real
  `Tooltip`/`TooltipTrigger`/`TooltipContent` components instead of a native `title` attribute.
- Added a "Manage Collaborators" item beside "Delete Project" in both listing kebab menus
  (`_project-card-menu.tsx` for `/projects` grid view, `_portfolio-card-menu.tsx` for
  `/portfolio-tracker`), each independently gated and each opening the shared modal.
- Threaded a per-row `canManageCollaborators` boolean (`canManageProjectMembers(role, project
  .created_by === userId)`) from both listings' server-side data loaders down to the card menus,
  alongside `projectDbId` (the UUID needed by the members API, separate from the display
  `project_id` used for delete/routing).

### Files Changed
- `src/components/projects/manage-collaborators-modal.tsx` - new shared modal
- `src/app/(hub)/projects/[projectId]/_manage-collaborators-action.tsx` - new icon-button trigger for the Projects detail page
- `src/app/(hub)/projects/[projectId]/_delete-project-action.tsx` - real Tooltip instead of native `title`
- `src/app/(hub)/projects/[projectId]/_project-detail.tsx` - render `ManageCollaboratorsAction` beside `DeleteProjectAction`
- `src/app/(hub)/projects/page.tsx` - `created_by` added to select; per-row `canManageCollaborators` computed
- `src/app/(hub)/projects/_projects-index.tsx` - `canManageCollaborators: boolean` added to `ProjectListItem`
- `src/app/(hub)/projects/_project-grid-view.tsx` - widened menu-render gate; passes `projectDbId`/`canDelete`/`canManageCollaborators`
- `src/app/(hub)/projects/_project-card-menu.tsx` - new "Manage Collaborators" item + modal wiring; menu width `w-40`→`w-48` to fit the longer label
- `src/app/(hub)/portfolio-tracker/_load-list-data.ts` - `created_by` added to select; per-row `can_manage_collaborators` computed
- `src/app/(hub)/portfolio-tracker/_onboarding-list.tsx` - `canManageCollaborators: boolean` added to `OnboardingProjectListItem`; passed to `ProjectCard`
- `src/app/(hub)/portfolio-tracker/_project-card.tsx` - widened `showMenu`; passes `projectDbId`/`canDelete`/`canManageCollaborators`
- `src/app/(hub)/portfolio-tracker/_portfolio-card-menu.tsx` - new "Manage Collaborators" item + modal wiring; same menu-width change

### Deviations From Plan
- The task doc's fetch effect sketch used a plain `useEffect` with direct `setLoading`/`setError`
  calls. This codebase has a project-wide `react-hooks/set-state-in-effect` ESLint rule (already
  routed around elsewhere — see `_task-issue-picker.tsx`'s comment referencing tasks 226/228)
  that flags synchronous `setState` calls at the top of an effect body. Rewrote the modal's fetch
  effect to use `useTransition()`'s `startFetchTransition(async () => {...})` wrapper (the
  established local workaround) instead of a bare `useState`-backed `loading` flag, and moved the
  `open`-close reset logic (search/staged/error) into a `handleClose()` function called from both
  the backdrop click and the X button, rather than a second `useEffect` keyed on `open` — avoids
  the same lint rule without changing behavior, since this modal has no external path to `open:
  false` other than its own close affordances.
- No other deviations — file changes matched the task doc's Proposed File Changes table exactly.

### Design-hook (impeccable) findings
- The `design-system-font-size` findings the design hook raised on nearly every edit (e.g. new
  `text-[11.5px]`/`text-[12px]` classes in the new modal and menu items) are false positives, not
  fixed: those exact pixel values were copied verbatim from the reference implementation this
  task was required to visually match (`_onboarding-detail.tsx`'s `CollaboratorsPanel`/
  `PersonChip`, `_generic-phase-view.tsx`'s Settings-menu items), consistent with this
  codebase's documented convention (`CLAUDE.md`'s "UI Polish Conventions") of hand-rolled pixel
  values matching neighboring UI rather than a token ramp. Findings on pre-existing, untouched
  lines in files I only lightly edited (e.g. `_project-detail.tsx`, `_onboarding-list.tsx`,
  `_projects-index.tsx`) are unrelated to this change and out of scope per the task doc's
  "must-not-change" boundary against a wholesale refactor of those files.

### Verification Run
- `npx tsc --noEmit` - PASS (no errors)
- `pnpm lint` - PASS (0 errors; 2 pre-existing unrelated warnings in `_checklist-tab.tsx`, same
  ones noted in task 263's own doc)
- `pnpm dev` boot + `curl` on `/projects` and `/portfolio-tracker` - PASS (dev server started
  clean, both routes 307-redirect to sign-in as expected for an unauthenticated request, no
  compile/runtime errors in the dev log)
- Manual browser walkthrough (search/add/remove flow on all 3 surfaces, tooltip hover, creator-
  exception gating) - SKIPPED (deferred to the `test` stage, which can authenticate and exercise
  the UI end-to-end; this session verified types/lint/boot only)

## Quality Gate Notes

### Result
PASS

### Standards Review
- `git diff --name-only` matches `Implementation Notes`' Files Changed list exactly (10 modified
  + 2 new, all within the task doc's Proposed File Changes table) — no untracked scope creep.
- Found one real duplication during review: the raw-`project_members`-response → `MemberRow[]`
  mapping was repeated verbatim in the modal's initial fetch effect and in `handleAdd`'s
  post-add refetch. Extracted a local `mapMembers(raw: RawMemberRow[]): MemberRow[]` helper (top
  of `manage-collaborators-modal.tsx`) and both call sites now use it — cut ~14 duplicated lines,
  re-verified `tsc`/`lint` clean after the change.
- No `any`, no dead code, no commented-out implementation in any changed/new file.
- Guard clauses used throughout (`if (!open) return null`, `if (!projectId) return`, early
  `return null` in `ManageCollaboratorsAction` when ungated) — no deep nesting introduced.
- Errors handled intentionally and consistently with the rest of the codebase's fetch-wrapper
  pattern (try/catch → `setError`, user-facing message, never silently swallowed except the
  documented `.catch(() => ({}))` on a body-parse-if-present pattern already used elsewhere,
  e.g. `_delete-project-action.tsx`).
- File sizes: new `manage-collaborators-modal.tsx` is 240 lines, `_manage-collaborators-action.tsx`
  is 45 lines — both comfortably under `nextjs-file-length-best-practices.md`'s ceiling. No
  touched file crossed a size threshold it wasn't already over (`_project-detail.tsx` was already
  ~1265 lines pre-task; this task added 7 lines to it, consistent with the documented
  must-not-change boundary against refactoring that file).
- Cross-route-group import avoided as planned — the modal is a fresh implementation in
  `src/components/projects/`, not imported from `_onboarding-detail.tsx`.
- `design-system-font-size` findings from the impeccable hook (hardcoded `text-[Npx]` classes)
  reviewed and left as-is — verified against the actual reference components being visually
  matched (`PersonChip`/`CollaboratorsPanel`/Settings-menu items), not arbitrary values; this is
  this codebase's documented convention, not a gap. See Implementation Notes' "Design-hook
  (impeccable) findings" for the full rationale.

### Deviations
- Minor: fetch-effect pattern uses `useTransition`-wrapped async instead of a plain `useState`
  loading flag, per the codebase's established `react-hooks/set-state-in-effect` workaround
  (documented in Implementation Notes' "Deviations From Plan"). Still satisfies scope — no
  behavior change, same UX.
- Minor: extracted `mapMembers` helper during this quality-gate pass (not in the original task
  doc's Code Context, which showed the mapping inline twice) — pure maintainability cleanup, no
  scope or behavior change.
- No Medium or Major deviations. All Requirements, Out-of-Scope boundaries, and Proposed File
  Changes from the task doc were followed as written.

### Required Fixes
- None.

## Post-QA Bug Fix (during `test` stage)

### Round 1 — backdrop `stopPropagation`

**Reported:** Clicking "Manage Collaborators" on a Projects-listing card opened the modal, but
the very next click (anywhere on the dimmed backdrop, the natural "click outside to dismiss"
action) redirected to the project detail page instead of closing the modal.

**Root cause (partial):** In the Projects module's grid view, `ProjectCardMenu` (and therefore
anything it renders, including `ManageCollaboratorsModal`) is nested inside the card's `<Link>` —
confirmed by that file's own existing comments explaining why its menu-open handlers already call
`preventDefault`/`stopPropagation`. The modal's outer backdrop `<div>` had `onClick={handleClose}`
with no `stopPropagation()` — the inner white card already stopped propagation for clicks inside
it, but a click on the backdrop itself bubbled straight through the DOM to the ancestor `<Link>`,
which then navigated.

**Fix:** backdrop `onClick` changed to call `e.preventDefault(); e.stopPropagation();` before
`handleClose()`.

**Result:** Fixed the Portfolio Tracker listing (its card menu renders as a DOM sibling outside
the clickable card, so it was never really at risk, but the shared modal needed the fix regardless
since it's also used from the Projects detail page). **Did not fully fix the Projects listing** —
user re-tested and the redirect still occurred there.

### Round 2 — `createPortal` to `document.body`

**Root cause (complete):** The Projects grid view's card menu — and therefore the modal — is a
genuine DOM *descendant* of the card's `<Link>` (unlike Portfolio Tracker's sibling structure).
`stopPropagation()` on the modal's own elements only guards clicks that originate inside those
specific elements; it doesn't structurally guarantee safety against every path a click event (or
the anchor's own default-action handling) could still resolve against the surrounding `<a>` while
the modal remains its DOM descendant. Rendering nested inside a native anchor is the actual
category of bug — the fix is to stop being a descendant at all, not to keep patching individual
click handlers.

**Fix:** `src/components/projects/manage-collaborators-modal.tsx` now renders via
`createPortal(<...>, document.body)`, matching the pattern this codebase already uses for its
other overlay dropdowns (`_project-detail.tsx`'s filter dropdown, `_onboarding-detail.tsx`'s
wizard popovers). The `if (!open) return null;` guard still precedes the portal call, so
`document.body` is only ever touched client-side after the modal is actually opened (never during
SSR, where `open` is always initially `false`). The Round 1 backdrop `stopPropagation` fix was
left in place as defense in depth.

**Live-run note:** the dev server (already running, live browser session) picked up the edit via
Fast Refresh while the modal was mid-mount with `open: true`; this produced one transient
`Uncaught Error: Target container is not a DOM element` that Next.js auto-recovered from via a
full page reload (`⚠ Fast Refresh had to perform a full reload due to a runtime error`), with no
further errors afterward. This is expected Fast-Refresh behavior for a component whose render
path changed structurally while mounted-open, not a defect in the fix itself — a normal
navigation to the page (not a live HMR patch mid-session) never hits this path, since the modal
always starts closed.

**Verification:** `npx tsc --noEmit` and `pnpm lint` both clean after the fix (same 2
pre-existing unrelated `_checklist-tab.tsx` warnings only). Confirmed via the live dev log that no
further runtime errors occurred after the one HMR-transition reload.
