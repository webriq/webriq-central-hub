# 232: Projects Grid View — Card Context Menu with Delete Action

**Created:** 2026-08-13
**Priority:** MEDIUM
**Type:** enhancement
**Recommended Tier:** fast
**Status:** Completed

---

## Overview

Follow-up to task 231 (Delete Project Action / soft-delete), which deliberately placed the delete
action only on each project's detail page and explicitly flagged list-row delete as "a larger,
separate follow-up" (see 231's Decision 1 and Out of Scope). This task is that follow-up, scoped to
exactly what the user asked for: a context (kebab) menu with a **Delete** action on the **Grid view**
cards of `/v2/projects`, so a project can be soft-deleted straight from the listing without opening it.

Everything the delete action itself needs already exists from task 231 and is reused as-is:
`DELETE /api/v2/projects/[projectId]` (soft delete, sets `status = 'deleted'`, role-gated to
`admin`/`pm`/`super_admin`), the shared `useDeleteProject` hook, and the shared
`ConfirmDialog` (`src/components/ui/confirm-dialog.tsx`, irreversible-action confirmation, no
`window.confirm`). This task only adds the trigger — a per-card kebab menu — and the query already
excludes `status = 'deleted'` (`src/app/v2/(hub)/projects/page.tsx`), so a deleted card simply needs the
list to re-fetch to disappear.

**Decisions made below (not explicitly specified by the user — flagged for review):**

1. **Scope: Grid view only, Projects module only.** The user said "Grid card items" specifically —
   Projects is the only module with a Grid/List view toggle (`GridView`/`ListView` in
   `_projects-index.tsx`); Portfolio Tracker's cards have no such toggle and weren't named. The List
   view's table rows (`ListView`, same file) are **not** touched — if that's also wanted, it's a
   separate, similarly-small follow-up (same menu, different row markup — a `<tr>` isn't a `<Link>`
   wrapper, so the click-interception concern in Requirement 3 below doesn't even apply there).
2. **Menu implementation is a new, page-scoped component**, not a shared one. A near-identical kebab
   dropdown already exists (`ActionsMenu`/`ItemAction` in
   `.../onboarding-workspace/_file-tile.tsx:45-126` — fixed-position trigger-anchored menu with a
   full-screen click-away overlay, chosen there specifically to escape a z-index bug where adjacent
   grid tiles painted over an `absolute`-positioned dropdown). That component lives in an unrelated
   feature area (file/folder management) and is typed around `ItemAction[]` for a multi-action menu;
   this task needs exactly one action (Delete). Building a small local equivalent — same fixed-position
   + click-away technique, since Projects' grid cards have the identical adjacency/z-index risk, but
   without importing across unrelated feature directories — matches this codebase's established
   page-scoped-UI convention (see `AvatarStack`'s "not shared" reasoning in the same file).
3. **Role gate**: a new `canDeleteProjects` prop, computed identically to `canManageTags`/
   `canCreateProject` in `page.tsx` (`role === "admin" || role === "pm" || role === "super_admin"`) and
   threaded through the same way. Kept as its own named prop rather than reusing `canManageTags`,
   matching the precedent task 209 already set for `canCreateProject` ("separate capability... even
   though the role set matches today").
4. **After a successful delete, the page calls `router.refresh()`** (not a redirect) — the user stays on
   the listing and the deleted card disappears because `page.tsx`'s server-side query already excludes
   `status = 'deleted'`. This is the same pattern already used elsewhere in this exact file
   (`_projects-index.tsx:631`, on project creation) and elsewhere in the codebase for "mutate, stay on
   page, re-fetch" flows — not a new pattern.

## Requirements

1. Each Grid-view project card (`GridView` in `_projects-index.tsx`) shows a kebab (⋮) trigger,
   visible only to `admin`/`pm`/`super_admin`.
2. Clicking the kebab opens a small dropdown with one action: **Delete Project** (danger-styled, trash
   icon — matching `_file-tile.tsx`'s established danger-item styling `text-[#C0392B] hover:bg-[#FDE8E6]`).
3. Clicking the kebab (and any subsequent menu interaction) must **not** trigger the card's own
   navigation — the whole card is currently a `<Link>` to the project's Tasks tab, so the trigger and
   menu need `preventDefault`/`stopPropagation`.
4. Selecting Delete opens the shared `ConfirmDialog` (irreversible-action wording, matching task 231's
   detail-page copy) — no native `window.confirm`.
5. Confirming calls the existing `DELETE /api/v2/projects/[projectId]` soft-delete endpoint via the
   existing `useDeleteProject` hook. No API or DB changes — this task is UI-only.
6. On success, the dialog closes and the list refreshes (`router.refresh()`); the deleted card is gone
   from the Grid (already guaranteed by task 231's `.neq("status", "deleted")` filter in `page.tsx`).
7. On failure, an inline error is shown (same treatment as the detail-page trigger from task 231) and
   the card remains.
8. Clicking outside an open menu closes it (matching `_file-tile.tsx`'s click-away overlay pattern —
   Portfolio Tracker's Settings-gear dropdown from task 231 notably does *not* have this, and a grid of
   many cards each with their own menu makes an always-open stray menu more noticeable than a single
   detail-page menu, so this task does the closable version properly).

## Out of Scope / Must Not Change

- Projects **List view** (table rows) — no menu added there in this task (Decision 1).
- Portfolio Tracker cards — not touched.
- Any change to the `DELETE`/`GET` API route, the migration, `useDeleteProject`, `ConfirmDialog`, or the
  Projects detail-page delete action — all built in task 231 and reused verbatim here.
- Bulk/multi-select delete.
- An "undo" affordance — matches task 231's decision that recovery is DB-only, not a product feature.

## Proposed File Changes

- `src/app/v2/(hub)/projects/_project-card-menu.tsx` **(new, small)** — the kebab trigger + fixed-position
  dropdown + `ConfirmDialog` + `useDeleteProject` call + `router.refresh()` on success. Self-contained;
  takes `projectId` (the row's `project_id`), `projectName`, and renders nothing if either the caller
  doesn't gate it or `projectId` is null (mirrors `_delete-project-action.tsx`'s null-guard from task 231).
- `src/app/v2/(hub)/projects/_projects-index.tsx`:
  - `GridView`'s card (lines ~668–738 as of task 231) gets the new menu positioned top-right, absolutely,
    inside the `<Link>` card (needs `position: relative` on the card, already implicit via
    `flex flex-col` — add `relative` to the card's className).
  - `GridView`'s props gain `canDeleteProjects: boolean`; passed through from `ProjectsIndex`'s own new
    `canDeleteProjects` prop (mirrors how `canManageTags` is already threaded through both `GridView`
    and `ListView` today — `ListView` does **not** get this new prop, per Decision 1).
  - `ProjectsIndex`'s signature gains `canDeleteProjects = false`, and the `<GridView ... />` call site
    (line ~620) passes it through.
- `src/app/v2/(hub)/projects/page.tsx` — add `canDeleteProjects` alongside the existing
  `canManageTags`/`canCreateProject` computation (identical role check), pass to `<ProjectsIndex>`.

## Code Context

`GridView`'s current card markup (`_projects-index.tsx`) — the whole card is a `<Link>`; the tags row
already demonstrates the `preventDefault` pattern needed for the new menu:
```tsx
<Link
  key={p.id}
  href={p.project_id ? `${V2_ROUTES.PROJECTS}/${p.project_id}/tasks` : V2_ROUTES.PROJECTS}
  className="h-full flex flex-col gap-3 p-4 rounded-[14px] border border-[#E2E7F2] bg-white hover:border-[#A8C6F5] transition-colors"
>
  {/* Title + status */}
  <div className="flex items-start justify-between gap-2">
    ...
    <ProjectStatusChip status={p.status} pct={pct} />
  </div>
  ...
  {/* Tags — pill chips with gap */}
  {tags.length > 0 && (
    <div className="flex flex-wrap gap-1.5" onClick={(e) => e.preventDefault()}>
      ...
    </div>
  )}
  ...
</Link>
```

`_file-tile.tsx`'s `ActionsMenu` (`.../onboarding-workspace/_file-tile.tsx:61-105`) — the fixed-position
+ click-away technique to replicate locally (not import — Decision 2):
```tsx
function ActionsMenu({ actions }: { actions: ItemAction[] }) {
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (menuPos) { setMenuPos(null); return; }
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    setMenuPos({ x: Math.min(rect.right - 160, window.innerWidth - 168), y: Math.min(rect.bottom + 4, window.innerHeight - ... ) });
  };
  return (
    <div className="relative">
      <button ref={triggerRef} onClick={toggle} ...><MoreVertical size={13} /></button>
      {menuPos && (
        <>
          <div className="fixed inset-0 z-40" onClick={(e) => { e.stopPropagation(); setMenuPos(null); }} />
          <div className="fixed z-50 w-40 ..." style={{ left: menuPos.x, top: menuPos.y }} onClick={(e) => e.stopPropagation()}>
            {/* action buttons */}
          </div>
        </>
      )}
    </div>
  );
}
```

Task 231's `_delete-project-action.tsx` (the pattern this task's new component mirrors, minus the
`router.push` — this task uses `router.refresh()` instead, per Decision 4):
```tsx
const DELETE_ROLES = ["admin", "pm", "super_admin"];
export function DeleteProjectAction({ projectId, projectName, currentUserRole }: {...}) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { deleteProject, deleting, error } = useDeleteProject();
  if (!currentUserRole || !DELETE_ROLES.includes(currentUserRole) || !projectId) return null;
  async function handleConfirm() {
    const ok = await deleteProject(projectId!);
    if (ok) { setConfirmOpen(false); router.push(V2_ROUTES.PROJECTS); }
  }
  return ( /* trigger button + ConfirmDialog confirmDisabled={deleting} */ );
}
```

`page.tsx`'s existing role computation (add `canDeleteProjects` next to these):
```ts
const role = profileRes?.data?.role;
const canManageTags = role === "admin" || role === "pm" || role === "super_admin";
const canCreateProject = role === "admin" || role === "pm" || role === "super_admin";
```

## Implementation Steps

1. Build `_project-card-menu.tsx`: kebab trigger (fixed-position dropdown, click-away overlay, per
   Code Context) → single danger "Delete Project" item → `ConfirmDialog` (reusing
   `src/components/ui/confirm-dialog.tsx`, `confirmDisabled={deleting}`) → `useDeleteProject()` →
   on success `router.refresh()`.
2. Add `canDeleteProjects` to `page.tsx` and pass to `<ProjectsIndex>`.
3. Thread `canDeleteProjects` through `ProjectsIndex` → `GridView` (not `ListView`).
4. Add `relative` to the Grid card's className and render `<ProjectCardMenu>` top-right when
   `canDeleteProjects` and `p.project_id` are truthy, with `onClick`/menu handlers stopping propagation
   so the card's own `<Link>` navigation never fires from a menu interaction.
5. `npx tsc --noEmit` and `pnpm lint`.

## Acceptance Criteria

- [ ] As `admin`/`pm`/`super_admin`, each Grid card shows a kebab trigger; as any other role, it does not.
- [ ] Clicking the kebab opens a dropdown with only "Delete Project" (danger-styled) and does not
      navigate to the project.
  - [ ] Clicking elsewhere on the page closes an open menu without navigating.
- [ ] Clicking Delete opens the styled `ConfirmDialog`, not `window.confirm`; Cancel closes it with no change.
- [ ] Confirming removes the card from the Grid (via refresh) and the project's DB row still exists
      with `status = 'deleted'` (not removed) — same guarantee task 231 already established for the
      detail-page path, exercised here through the new trigger.
- [ ] List view (table rows) is unchanged — no menu, no regression.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass.

## Verification

- `npx tsc --noEmit`
- `pnpm lint`
- Browser: as `pm`, open `/v2/projects` in Grid view, delete a disposable/test project from its card
  menu, confirm it disappears from the grid without a full page navigation, and confirm (Supabase
  dashboard or a `select`) the row still exists with `status = 'deleted'`.
- As `developer`, confirm no kebab appears on any card.
- Switch to List view and confirm no menu/regression there.

## Compatibility Touchpoints

- No RLS, migration, or API changes — this task is additive UI only, entirely dependent on task 231's
  already-shipped-to-Testing backend and shared components.

## Implementation Notes

### What Changed
- Added a per-card kebab menu to the Projects Grid view (`GridView` in `_projects-index.tsx`) with a
  single danger-styled "Delete Project" action, gated to `admin`/`pm`/`super_admin` via a new
  `canDeleteProjects` prop threaded from `page.tsx` → `ProjectsIndex` → `GridView` only (List view
  untouched, per the task's Decision 1).
- The new `ProjectCardMenu` component reuses task 231's `useDeleteProject` hook and shared
  `ConfirmDialog` verbatim — no API, migration, or hook changes were needed.
- Unlike the detail-page trigger (which redirects after deleting), this trigger calls
  `router.refresh()` and stays on the listing — the card disappears because `page.tsx`'s query already
  excludes `status = 'deleted'` (from task 231).

### Files Changed
- `src/app/v2/(hub)/projects/_project-card-menu.tsx` - new: kebab trigger, fixed-position dropdown
  with click-away overlay (mirrors `_file-tile.tsx`'s `ActionsMenu` positioning technique), Delete
  item, `ConfirmDialog`, `useDeleteProject`, `router.refresh()` on success.
- `src/app/v2/(hub)/projects/page.tsx` - added `canDeleteProjects` role computation (same check as
  `canManageTags`/`canCreateProject`), passed to `<ProjectsIndex>`.
- `src/app/v2/(hub)/projects/_projects-index.tsx` - `ProjectsIndex` signature gained
  `canDeleteProjects`; threaded to the `<GridView>` call site only; `GridView`'s own signature gained
  the same prop; the card's title/status header row now renders `<ProjectCardMenu>` (gated on
  `canDeleteProjects && p.project_id`) next to `ProjectStatusChip`.

### Deviations From Plan
- The task doc's Proposed File Changes sketched an absolutely-positioned menu in the card's top-right
  corner (requiring `position: relative` added to the card). Implemented instead as an inline element
  in the existing title/status header row, directly left of `ProjectStatusChip`, inside a small
  `flex items-center gap-1` group. This achieves every Requirement (visible trigger, no navigation
  leak, danger-styled Delete item) with less new CSS and no risk of visually overlapping the status
  chip that already occupies that corner — a cleaner execution of the same requirement, not a scope
  change. The dropdown menu itself still uses the plan's fixed-position + click-away technique
  unchanged.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (same 2 pre-existing warnings in the untouched `_checklist-tab.tsx`, unrelated to
  this task)
- Manual browser verification (kebab visibility by role, click-away close, delete + grid refresh,
  List view non-regression) - SKIPPED (deferred to the `test` stage)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No unused code, no broad `any`, no deep nesting; `_project-card-menu.tsx` has a single clear
  responsibility (~103 lines, within component guidance) and every handler that touches the card's
  own `<Link>` calls `preventDefault`/`stopPropagation`.
- Carried the `confirmDisabled={deleting}` wiring over from the start (task 231's quality gate had to
  add this after the fact) — verified present in this file, so the double-submit gap found last time
  isn't repeated here.
- The fixed-position + click-away dropdown technique is now duplicated in two places
  (`_file-tile.tsx`'s generic `ActionsMenu` and this single-action `ProjectCardMenu`) rather than
  shared. Not flagged as a fix — the task doc's own Decision 2 already reasoned through this
  explicitly (avoids importing across unrelated feature directories; matches this codebase's
  page-scoped-UI convention) before implementation started, so this is a documented choice, not an
  oversight surfacing now.
- `ProjectCardMenu`'s stale-error persistence (an error from a failed delete stays shown until the
  next delete attempt, even after Cancel) is inherited from `useDeleteProject`, identical to both of
  task 231's trigger components. Not new, and fixing it would mean touching the shared hook or all
  three call sites uniformly — outside this task's declared Out of Scope boundary
  ("Any change to... `useDeleteProject`").
- Verified `npx tsc --noEmit` passes clean on the current state (re-run during this gate).

### Deviations
- Minor (already self-disclosed in Implementation Notes): inline placement of the kebab in the
  card's title/status row instead of the task doc's sketched absolute-positioned top-right corner.
  Satisfies every Requirement with less new CSS and no overlap risk with `ProjectStatusChip` — a
  cleaner execution, not a scope or behavior change.
- No Medium or Major deviations — `ListView` and Portfolio Tracker are both confirmed untouched by
  this task's diff; no API/migration/hook/shared-component changes were made, matching Out of Scope.

## Post-QA Adjustment (user feedback during Testing)

After this quality gate passed, the user asked for the kebab to sit **to the right** of
`ProjectStatusChip` instead of before it (matching a "status, then actions, top-right corner"
ordering) — the gate's own Deviations note above had already flagged the inline-placement choice as
a self-disclosed deviation, and this was a one-line reorder within that same header group in
`GridView`'s card (`_projects-index.tsx`): `<ProjectStatusChip />` now renders first, followed by
`{canDeleteProjects && p.project_id && <ProjectCardMenu .../>}`, inside the same
`flex items-center gap-1 shrink-0` wrapper — no other markup changed. `npx tsc --noEmit` re-verified
clean after the change.
