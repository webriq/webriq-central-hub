# 268: Portfolio Tracker & Projects Listings — View/Rename/Set Owner/Update Classification Actions + Hover-to-Rename Title (+ Kebab Rename) + Tasks/Issues Click Regions

**Created:** 2026-08-18
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced
**Status:** Testing (implemented 2026-08-18)

---

## Overview

Task 264 already added "Manage Collaborators" and "Delete Project" to both listing kebab menus
(`_project-card-menu.tsx` for `/projects` grid view, `_portfolio-card-menu.tsx` for
`/portfolio-tracker`), each gated by `canManageProjectMembers`/`canDeleteProjects` and reading a
per-row `canManageCollaborators` boolean threaded from the server loaders. This task extends the
same two kebab menus with the remaining actions requested: **View Project**, **Rename Project**,
**Set Project Owner**, and **Update Classification** — plus click-through regions on the Projects
listing's tasks/issues progress stats.

Rename has two entry points that drive the same underlying edit state: hovering the card's
project name converts it to an editable input directly (per the user's own description of the
mechanism), **and** a "Rename Project" kebab-menu item that triggers the identical edit mode
programmatically (focuses the same input) for users who reach for the menu instead of hovering
the title, or on touch devices where hover isn't available.

The Portfolio Tracker detail page's existing Settings-menu feature
(`_generic-phase-view.tsx`/`_onboarding-detail.tsx` — "Set Project Owner" via `OwnerPanel` +
`canSetProjectOwner`, PATCHing the already-generic `/api/projects/[projectId]/members` route) is
the reference implementation for the owner-transfer piece, mirroring how task 264 used
`CollaboratorsPanel` as the reference for Manage Collaborators. No new members-API work is
needed — `PATCH /api/projects/[projectId]/members` already transfers ownership among existing
collaborators.

"Update Classification" targets the same field the Portfolio Tracker card footer already
displays (`customer_products.classification` — one of `CLASSIFICATIONS` in
`src/config/customer-phases.ts`: StackShift I/II, Access, Access Plus, PipelineForge, Discrete
Development), joined via `projects.customer_product_id`. **Naming collision to avoid:** the
Projects module's `ProjectListItem` already has a field named `classification` that means
something unrelated ("legacy" vs "version2", derived from `external_project_id` for the existing
type filter — `page.tsx:192`). The new editable value on the Projects side must be added under a
different field name (`productClassification`) so the existing filter is untouched.

Rename reuses the existing `PATCH /api/v2/projects/[projectId]` route (already accepts
`body.name`, keyed by the display `project_id`) — this task only adds server-side empty/duplicate
validation to that route's `name` branch, plus the card-side hover-to-edit UI. The only other
current caller of that route (`_projects-index.tsx`'s `removeTag`) sends `{ tags }` only, so the
new `name`-specific validation cannot affect it.

**Toasts:** per user decision, add the shadcn-registered `sonner` component (`npx shadcn add
sonner` — this is how CLAUDE.md's own "shadcn components are added via `npx shadcn add
<component>`" convention already covers this, not a bare `pnpm add sonner`) rather than a fully
hand-rolled toast. This installs `sonner` as a dependency and generates
`src/components/ui/sonner.tsx`, mounted once in the hub layout.

## Requirements

- [ ] `npx shadcn add sonner` — adds `src/components/ui/sonner.tsx` + `sonner` dependency; mount
      `<Toaster />` once in `src/app/(hub)/layout.tsx`.
- [ ] **View Project** — new kebab-menu item on both listings, navigates to the project's detail
      page (`/projects/[project_id]` or `/portfolio-tracker/[project_id]`). Always visible when
      `project_id` is present (no extra permission gate beyond what already governs seeing the row).
- [ ] **Set Project Owner** — new kebab-menu item on both listings, gated by
      `canSetProjectOwner(role, isCreator)`. Opens a new shared `SetProjectOwnerModal`
      (mirrors `OwnerPanel`'s candidate-list-from-existing-members UX, PATCHes
      `/api/projects/[projectDbId]/members` — no API changes).
- [ ] **Update Classification** — new kebab-menu item on both listings, gated by the same
      `canManageProjectMembers`-tier permission already computed for Manage Collaborators
      (reuse the existing `canManageCollaborators` boolean — same tier, no new permission
      function needed). Opens a new shared `UpdateClassificationModal` (select from
      `CLASSIFICATIONS`), PATCHing a new `PATCH /api/v2/projects/[projectId]/classification`
      route. Disabled/hidden when the project has no linked product
      (`customer_product_id` is null) — same "nothing to act on" reasoning as the existing
      `canDelete && p.project_id` gate elsewhere in these files.
- [ ] **Rename** — two entry points, one edit state:
  - [ ] Hovering the project name on either listing card converts it in place to a real
        `<input>` (`cursor-text`), matching the user's own description of the mechanism.
  - [ ] A **"Rename Project"** kebab-menu item on both listings (gated the same as "Update
        Classification" — `canManageCollaborators`-tier) triggers the identical edit mode without
        requiring a hover — closes the menu and focuses the title's input directly.
  - [ ] Pressing **Enter** submits: reject empty (trimmed) input with an error toast, no request.
  - [ ] Reject a name that collides with any other existing project's name (case-insensitive,
        excluding the current row and soft-deleted rows) with an error toast whose action link,
        when clicked, sets that listing's own search bar to the entered name (reusing the
        page's existing `searchInput`/`navigate(buildUrl({search:...}))` plumbing).
  - [ ] While the request is in flight, show a loading toast "Saving changes…"; on success, a
        success toast confirming the update, and the card reflects the new name immediately
        (optimistic local update) plus a `router.refresh()` to reconcile server state.
  - [ ] Unchanged value (trimmed input equals the current name) or Escape: silently revert, no
        request, no toast.
- [ ] **Projects listing only** — tasks/issues progress-stat regions on the card become their own
      click targets, navigating to `/projects/[projectId]/tasks` and `/projects/[projectId]/issues`
      respectively (both routes already exist), independent of the rest of the card. Hovering
      either region changes its label text color and shows a tooltip ("View tasks" / "View
      issues" — this codebase's real `Tooltip`/`TooltipTrigger`/`TooltipContent`, matching the
      existing `AvatarTip` pattern in `_project-card-shared.tsx`).
  - [ ] The rest of the card (everything except the title-hover-rename region and the two stat
        regions) now navigates to the project's own detail page (`/projects/[projectId]`,
        "View Project") instead of its current behavior of always linking straight to
        `/projects/[projectId]/tasks` — this is the necessary consequence of giving the tasks
        stat its own distinct destination; the card's general click target becomes "View Project"
        and the tasks region becomes the one dedicated shortcut to `/tasks`.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.

## Out of Scope / Must-Not-Change

- **Portfolio Tracker detail page** (`_onboarding-detail.tsx`, `_generic-phase-view.tsx`) and its
  existing Settings-menu Owner/Collaborators/Delete feature — reference implementation only, not
  touched.
- **No new role gate on `PATCH /api/v2/projects/[projectId]`** — that route currently has no
  permission check at all for any field (pre-existing gap, not introduced by this task). This
  task only adds empty/duplicate *validation* to the `name` branch; it does not add a role check
  to the route. Client-side, the hover-to-rename affordance is still only shown when
  `canManageCollaborators` is true for that row, so casual users never see the input — but this is
  a UI-level gate only, same trust boundary the route already has today.
- **Portfolio Tracker's own `classification` field naming is untouched** — only the Projects
  module gets a newly-named `productClassification` field to avoid colliding with its existing
  `classification: "legacy" | "version2"` filter value.
- **`/api/projects/[projectId]/members` route** — already generic and already used by the
  reference Owner/Collaborators features; no changes.
- **Projects module List view** (`_project-list-view.tsx`) — same boundary task 264 already
  documented: these actions are scoped to wherever the kebab menu/card actions already exist
  (Grid view for Projects), not added to List view.
- **Touch/no-hover devices** — no dedicated touch-tap-on-title affordance is added beyond the
  hover mechanism itself; the kebab "Rename Project" item is the touch-friendly path to the same
  edit mode (menus already work by tap), so touch users are covered via the menu, not a new
  gesture on the title.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/components/ui/sonner.tsx` | Create (via `npx shadcn add sonner`) | Toaster primitive |
| `src/app/(hub)/layout.tsx` | Modify | Mount `<Toaster />` once, hub-wide |
| `src/app/api/v2/projects/[projectId]/classification/route.ts` | Create | `PATCH` — update `customer_products.classification` via the project's `customer_product_id` |
| `src/app/api/v2/projects/[projectId]/route.ts` | Modify | Add empty/duplicate validation to the `name` branch of `PATCH` |
| `src/components/projects/editable-project-title.tsx` | Create | Shared hover-to-edit title (forwardRef exposing `startEditing()` for the kebab "Rename Project" trigger), used by both listing cards |
| `src/components/projects/set-project-owner-modal.tsx` | Create | Shared modal: fetch members, transfer ownership (mirrors `OwnerPanel`) |
| `src/components/projects/update-classification-modal.tsx` | Create | Shared modal: select + save `classification` |
| `src/app/(hub)/projects/page.tsx` | Modify | Join `customer_products(classification)`; compute `productClassification`, `hasProduct`, `canSetOwner` per row |
| `src/app/(hub)/projects/_projects-index.tsx` | Modify | Add new fields to `ProjectListItem`; add `onSearchName` callback; pass through to `GridView` |
| `src/app/(hub)/projects/_project-grid-view.tsx` | Modify | Card wrapper now links to the detail page; tasks/issues stats become their own click targets with hover/tooltip; title swapped for `EditableProjectTitle` (ref held here); new props + title ref into `ProjectCardMenu` |
| `src/app/(hub)/projects/_project-card-shared.tsx` | Modify | `ProgressStat` gains an optional `href`/`tooltipLabel`/`onClick` clickable variant |
| `src/app/(hub)/projects/_project-card-menu.tsx` | Modify | Add "View Project", "Rename Project", "Set Project Owner", "Update Classification" items + modal wiring |
| `src/app/(hub)/portfolio-tracker/_load-list-data.ts` | Modify | Compute `canSetOwner` per row (classification already selected) |
| `src/app/(hub)/portfolio-tracker/_onboarding-list.tsx` | Modify | Add `canSetOwner: boolean` to `OnboardingProjectListItem`; add `onSearchName` callback; pass through |
| `src/app/(hub)/portfolio-tracker/_project-card.tsx` | Modify | Title swapped for `EditableProjectTitle` (ref held here); new props + title ref into `PortfolioCardMenu` |
| `src/app/(hub)/portfolio-tracker/_portfolio-card-menu.tsx` | Modify | Add "View Project", "Rename Project", "Set Project Owner", "Update Classification" items + modal wiring |

## Code Context

### `canSetProjectOwner` — already exists, reuse verbatim
`src/lib/programme/membership-rules.ts:36-39`
```ts
export function canSetProjectOwner(role: string | null, isCreator: boolean): boolean {
  if (isCreator) return true;
  return role === "super_admin" || role === "admin";
}
```

### `OwnerPanel` — reference UI for the new `SetProjectOwnerModal` (inline panel → modal, same transform task 264 did for `CollaboratorsPanel`)
`src/app/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx:982-1021` — candidates are
`projectMembers.filter((m) => !m.is_owner)`; transfer target must already be a collaborator
(same constraint carries into the new modal — no "add and immediately set as owner" shortcut).

### `PATCH /api/projects/[projectId]/members` — already does the ownership transfer, no changes needed
`src/app/api/projects/[projectId]/members/route.ts:149-233` — `canSetProjectOwner`-gated,
body `{ user_id }`, 400s if the target isn't already a member, syncs Phase 1 `phase_members`
ownership as a best-effort side effect. `[projectId]` here is the project's UUID `id`.

### `CLASSIFICATIONS` — the values the new dropdown offers
`src/config/customer-phases.ts:364-371`
```ts
export const CLASSIFICATIONS = [
  "StackShift I", "StackShift II", "StackShift Access", "StackShift Access Plus",
  "PipelineForge", "Discrete Development",
] as const;
```

### Existing `PATCH /api/v2/projects/[projectId]` — extend the `name` branch only
`src/app/api/v2/projects/[projectId]/route.ts:46-80` (full route shown in research; only the
`name` handling changes). Current:
```ts
if (typeof body.name === "string") patch.name = body.name.trim();
```
New (insert before the `.update()` call, only when `patch.name` was actually set):
```ts
if (patch.name !== undefined) {
  if (!patch.name) {
    return NextResponse.json({ error: "Project name cannot be empty" }, { status: 400 });
  }
  const { data: dupe } = await supabase
    .from("projects")
    .select("id")
    .ilike("name", patch.name)
    .neq("project_id", projectId)
    .neq("status", "deleted")
    .maybeSingle();
  if (dupe) {
    return NextResponse.json({ error: "duplicate_name", name: patch.name }, { status: 409 });
  }
}
```
The client (`EditableProjectTitle`) distinguishes the duplicate case by response status `409`
and the `error: "duplicate_name"` body, vs. any other error message shown as a generic toast.

### New route: `PATCH /api/v2/projects/[projectId]/classification`
Sibling to the existing `route.ts` in the same directory — same auth/param pattern
(`{ projectId }` is the display `project_id`, matching every other route in this directory, e.g.
`.../tasks/route.ts`, `.../issues/route.ts`). Body `{ classification: string }`.
```ts
// 1. auth via createClient() + supabase.auth.getUser()
// 2. const { data: project } = await supabase.from("projects")
//      .select("id, customer_product_id, created_by").eq("project_id", projectId).single();
// 3. role lookup + canManageProjectMembers(role, project.created_by === user.id) gate (403)
// 4. if (!project.customer_product_id) return 400 "Project has no linked product to classify"
// 5. validate body.classification is one of CLASSIFICATIONS (400 otherwise)
// 6. await supabase.from("customer_products").update({ classification: body.classification })
//      .eq("id", project.customer_product_id)
```

### Projects listing — select + mapping to extend
`src/app/(hub)/projects/page.tsx:72` (select) and `:176-194` (mapping)
```ts
.select("id,project_id,name,project_type,status,customer_id,end_date,tags,owner_name,updated_at,external_project_id,customer_product_id,created_by", { count: "exact" })
```
Add `,customer_products(classification)` to the select. In the `.map()`:
```ts
productClassification: (p.customer_products as unknown as { classification: string | null } | null)?.classification ?? null,
hasProduct: !!p.customer_product_id,
canSetOwner: canSetProjectOwner(role ?? null, !!user && p.created_by === user.id),
// canManageCollaborators already present (task 264) — reused as the Update Classification gate too
```
(`canSetProjectOwner` import alongside the existing `canManageProjectMembers` import at the top
of `page.tsx`.)

### Portfolio Tracker listing — mapping to extend
`src/app/(hub)/portfolio-tracker/_load-list-data.ts:172-196` — `classification` is already
selected and mapped (line ~175); just add next to the existing `canManageCollaborators` line:
```ts
canSetOwner: canSetProjectOwner(role, p.created_by === userId),
```

### `_project-grid-view.tsx` — current card wrapper + footer stats to restructure
`src/app/(hub)/projects/_project-grid-view.tsx:28-36` (wrapper) and `:90-97` (footer, current)
```tsx
<Link
  key={p.id}
  href={p.project_id ? `${V2_ROUTES.PROJECTS}/${p.project_id}/tasks` : V2_ROUTES.PROJECTS}
  className="h-full flex flex-col gap-3 p-4 rounded-[14px] border border-[#E2E7F2] bg-white hover:border-[#A8C6F5] transition-colors"
>
  ...
  <ProgressStat label="tasks" done={p.task_done} total={p.task_total} />
  <ProgressStat label="issues" done={p.issue_done} total={p.issue_total} />
```
New: `href` becomes `p.project_id ? \`${V2_ROUTES.PROJECTS}/${p.project_id}\` : V2_ROUTES.PROJECTS`
(View Project, not `/tasks`). `ProgressStat` gains an optional clickable mode (see below) invoked
as:
```tsx
<ProgressStat label="tasks" done={p.task_done} total={p.task_total} href={p.project_id ? `${V2_ROUTES.PROJECTS}/${p.project_id}/tasks` : undefined} tooltipLabel="View tasks" />
<ProgressStat label="issues" done={p.issue_done} total={p.issue_total} href={p.project_id ? `${V2_ROUTES.PROJECTS}/${p.project_id}/issues` : undefined} tooltipLabel="View issues" />
```

### `ProgressStat` — add optional clickable variant
`src/app/(hub)/projects/_project-card-shared.tsx:146-153` (current, always a plain `<div>`).
When `href` is passed, render a `<button>` (not a nested `<a>` — the card itself is already a
`<Link>`/`<a>`, and HTML forbids nested anchors; browsers force-close them, which is exactly the
bug class task 264's Round 2 fix (`createPortal`) worked around for the modal) with
`onClick={(e) => { e.preventDefault(); e.stopPropagation(); router.push(href); }}`, wrapped in
`Tooltip`/`TooltipTrigger`/`TooltipContent` (same `AvatarTip` pattern already in this file), and
`hover:text-[#007BFF] transition-colors` on the label span only (ring stays as-is — only "the
text" changes color per the request).

### `EditableProjectTitle` — new shared component, interaction shape
`forwardRef` so the kebab "Rename Project" item can trigger the same edit mode the hover
interaction does, without a second implementation of the submit/validate/toast logic.
```tsx
// export type EditableProjectTitleHandle = { startEditing: () => void };
// props: { name: string; projectId: string | null; canRename: boolean;
//          onRenamed: (newName: string) => void; onSearchName: (name: string) => void }
// component: forwardRef<EditableProjectTitleHandle, Props>
// state: editing, value (seeded from `name`, resynced when `name` prop changes)
// inputRef: useRef<HTMLInputElement>
// useImperativeHandle(ref, () => ({
//   startEditing: () => { if (canRename && projectId) { setEditing(true); } },
// }));
// useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
// showInput = canRename && !!projectId && editing
// text mode: <span onMouseEnter={() => setEditing(true)} className="cursor-text">{name}</span>
// input mode: <input ref={inputRef} value={value} onChange=...
//   onBlur={() => { if (unchanged) revert(); }}
//   onKeyDown={(e) => { if (e.key === "Escape") revert(); if (e.key === "Enter") submit(); }}
//   onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()} />
// submit(): trim; empty -> toast.error, return; unchanged -> revert, return;
//   toast.loading("Saving changes…") -> PATCH /api/v2/projects/${projectId} { name: trimmed }
//   -> 409 duplicate_name: toast.error(..., { action: { label: "Search",
//        onClick: () => onSearchName(trimmed) } })
//   -> ok: toast.success(...); onRenamed(trimmed); exit edit mode
```
Note: `editing` replaces the earlier separate `hovering`/`focused` split — a single boolean is
enough once entry is either "hover sets it true" or "ref call sets it true," and exit is only via
blur-when-unchanged, Escape, or a successful/failed-but-handled submit. Mouse-leave alone no
longer force-closes the input (previously drafted behavior); this also makes the kebab-triggered
edit mode behave identically once opened — a stray mouseleave right after opening via the menu
can't instantly collapse an input the user just asked to open.

Rendered by both cards in place of the current plain title `<div>`
(`_project-grid-view.tsx:36`: `<div className="text-[13px] font-semibold text-[#0B1533] truncate">{p.name}</div>`;
`_project-card.tsx:42`: same shape for `item.project_name`). Both call sites must stop the click
from reaching the outer `Link`/button while the input is present — same `onClick`
preventDefault/stopPropagation pattern the tags row already uses in `_project-grid-view.tsx:72`.
Each card component holds `const titleRef = useRef<EditableProjectTitleHandle>(null);`, attaches
it to `<EditableProjectTitle ref={titleRef} .../>`, and passes `onRename={() =>
titleRef.current?.startEditing()}` down into its `ProjectCardMenu`/`PortfolioCardMenu`.

### `onSearchName` callback — reuse each listing's existing search plumbing
`src/app/(hub)/projects/_projects-index.tsx` already has `searchInput` state, `buildUrl`, and
`navigate` (same shape in `_onboarding-list.tsx`). Add one function in each index component:
```ts
function handleSearchName(name: string) {
  setSearchInput(name);
  navigate(buildUrl({ search: name, page: 1 }));
}
```
passed down as `onSearchName` through `GridView`/`OnboardingList` → card → `EditableProjectTitle`.

### Card menu items to add (both `_project-card-menu.tsx` and `_portfolio-card-menu.tsx`)
Follow the exact structural pattern already used for "Manage Collaborators" in both files (task
264) — a new `menuOpen`-gated `<button>` row above/below the existing items. `viewProject` is a
direct `router.push` (no modal); `renameProject` calls the new `onRename` prop (which the parent
card wired to `titleRef.current?.startEditing()`) and closes the menu — no modal either, since it
just hands off to the same title-input edit mode the hover path uses; `setOwner`/`updateClassification`
open their respective new modals. Suggested order: View Project → Rename Project → Set Project
Owner → Update Classification → Manage Collaborators → (divider) → Delete Project, matching the
Settings-menu's existing item ordering in `_generic-phase-view.tsx:284-303`. Both menu components
accept a new `onRename: () => void` prop (gated the same as `canManageCollaborators`, reusing that
existing boolean — no separate permission flag needed for the Rename item).

## Implementation Steps

1. `npx shadcn add sonner`; mount `<Toaster />` in `src/app/(hub)/layout.tsx` (sibling to
   `<V2HubShell>`).
2. Add duplicate/empty validation to `PATCH /api/v2/projects/[projectId]/route.ts`'s `name`
   branch (Code Context above).
3. Create `src/app/api/v2/projects/[projectId]/classification/route.ts` (`PATCH` only) — auth,
   `canManageProjectMembers` gate, `customer_product_id` null check, `CLASSIFICATIONS` validation,
   update `customer_products.classification`.
4. Build `src/components/projects/editable-project-title.tsx` per the Code Context sketch above.
5. Build `src/components/projects/set-project-owner-modal.tsx` — fetch
   `GET /api/projects/${projectDbId}/members` on open (mirrors `ManageCollaboratorsModal`'s fetch
   shape from task 264), render owner + candidate `<select>` (mirrors `OwnerPanel`), PATCH the
   same members route on submit, `z-[60]` modal shell per the `_create-project-modal.tsx`
   convention (same reasoning task 264 documented).
6. Build `src/components/projects/update-classification-modal.tsx` — `<select>` of
   `CLASSIFICATIONS`, current value preselected, PATCH the new classification route.
7. Extend `ProgressStat` in `_project-card-shared.tsx` with the optional clickable/tooltip variant.
8. Wire the Projects listing: `page.tsx` (select + mapping), `_projects-index.tsx` (type +
   `handleSearchName`), `_project-grid-view.tsx` (wrapper href, stat regions, title swap + held
   `titleRef`, menu props including `onRename`), `_project-card-menu.tsx` (four new items +
   modals: View Project, Rename Project, Set Project Owner, Update Classification).
9. Wire the Portfolio Tracker listing: `_load-list-data.ts` (`canSetOwner`), `_onboarding-list.tsx`
   (type + `handleSearchName`), `_project-card.tsx` (title swap + held `titleRef`, menu props
   including `onRename`), `_portfolio-card-menu.tsx` (four new items + modals, same set).
10. `npx tsc --noEmit` and `pnpm lint`; fix any type errors from new fields/props.
11. Manual browser check per Verification below.

## Acceptance Criteria

- [ ] Both listings' kebab menus show "View Project" (navigates to the detail page),
      "Rename Project" (gated by `canManageCollaborators`-tier, focuses the title's edit input),
      "Set Project Owner" (gated by `canSetProjectOwner`, opens the transfer modal), and
      "Update Classification" (gated by `canManageCollaborators`-tier, disabled/hidden when
      `customer_product_id` is null) alongside the existing "Manage Collaborators"/"Delete
      Project".
- [ ] Hovering a card's project name (when the viewer has the manage-tier permission) turns it
      into an editable input with a text cursor; pressing Enter saves. Clicking "Rename Project"
      in the kebab menu produces the identical focused, editable input without requiring a hover.
- [ ] Empty submission shows an error toast and does not call the API.
- [ ] A name colliding with another existing project shows an error toast with a "Search" action;
      clicking it sets that listing's search bar to the entered name and filters the list.
- [ ] A successful rename shows a "Saving changes…" loading toast followed by a success toast,
      and the card's title updates without a full page reload.
- [ ] On the Projects listing, clicking the tasks stat goes to `/projects/[projectId]/tasks`,
      clicking the issues stat goes to `/projects/[projectId]/issues`, each independently of the
      rest of the card; hovering either changes its label text color and shows the matching
      tooltip ("View tasks"/"View issues"). Clicking anywhere else on the card (outside the title
      and the two stat regions) goes to the project's detail page.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.
- [ ] No changes to the Portfolio Tracker detail page's existing Settings-menu feature or to
      `/api/projects/[projectId]/members`.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then manually exercise, as a super_admin/admin/pm test account:
#  - /projects (grid view): kebab menu → View Project / Rename Project / Set Project Owner /
#    Update Classification / Manage Collaborators / Delete Project — each opens the right surface
#  - /projects: hover a card title → input appears; try empty Enter (error toast, no save),
#    duplicate name Enter (error toast + working "Search" action), valid rename Enter (loading
#    then success toast, title updates in place)
#  - /projects: click "Rename Project" from the kebab menu (no hover) → same editable input opens
#    and is focused; Enter saves the same way
#  - /projects: click the tasks ring → /projects/[projectId]/tasks; click the issues ring →
#    /projects/[projectId]/issues; hover each → color change + tooltip; click elsewhere on the
#    card → project detail page
#  - /portfolio-tracker: same kebab-menu and hover-rename checks (no tasks/issues stat regions
#    exist on this card today, out of scope to add them here)
#  - Confirm existing Delete/Manage Collaborators flows on both listings are unaffected
```

## Compatibility Touchpoints

- New dependency: `sonner` (via `npx shadcn add sonner`) — first toast library in this codebase;
  `package.json`/`pnpm-lock.yaml` will change.
- No DB migration — `customer_products.classification` and `projects.name` already exist as
  writable columns.
- No change to the MCP tool inventory (`_docs/mcp-tools.md`).
- Does not affect packaging, docs, or install surface beyond the new dependency above.

## Implementation Notes

### What Changed
- Added the shadcn `sonner` component (`src/components/ui/sonner.tsx`, `sonner` dependency) and
  mounted `<Toaster position="bottom-right" />` once in `src/app/(hub)/layout.tsx`.
- Extended `PATCH /api/v2/projects/[projectId]/route.ts`'s `name` branch with empty-string
  rejection (400) and a case-insensitive duplicate-name check against other non-deleted projects
  (409 `duplicate_name`) — no other field's behavior in that route changed.
- Added `PATCH /api/v2/projects/[projectId]/classification/route.ts` — resolves the project's
  `customer_product_id`, gates on `canManageProjectMembers`, 400s when there's no linked product
  or an invalid value, and writes `customer_products.classification` via `adminClient` (see
  Deviations below for why).
- Built three new shared components in `src/components/projects/`:
  `editable-project-title.tsx` (hover-to-edit title, `forwardRef` exposing `startEditing()`),
  `set-project-owner-modal.tsx` (mirrors `OwnerPanel`, PATCHes the existing members route),
  `update-classification-modal.tsx` (select + save against the new classification route).
- Extended `ProgressStat` in `_project-card-shared.tsx` with an optional `href`/`tooltipLabel`
  clickable variant (button, not nested `<a>`).
- Wired all four new actions (View Project, Rename Project via the title ref, Set Project Owner,
  Update Classification) into both `_project-card-menu.tsx` and `_portfolio-card-menu.tsx`,
  alongside the existing Manage Collaborators/Delete Project items from task 264.
- Projects grid card (`_project-grid-view.tsx`) extracted its per-row JSX into a new
  `ProjectGridCard` subcomponent (kept in the same file) so `titleRef`/`useRef` could be a real
  per-card hook inside a `.map()`. The card's overall click target changed from always linking to
  `/projects/[projectId]/tasks` to the project's detail page (`/projects/[projectId]`); the tasks
  and issues `ProgressStat`s now carry their own `/tasks` and `/issues` destinations with hover
  color + tooltip.
- Portfolio Tracker card (`_project-card.tsx`) got the same title swap and `titleRef`, plus new
  `canSetOwner`/`hasProduct`/`currentClassification`/`onSearchName` plumbing — its existing
  `/portfolio-tracker/[projectId]` click target and tasks/issues-free layout were untouched (that
  card has no stat regions today, out of scope per the task doc).
- Both listing loaders (`(hub)/projects/page.tsx`, `(hub)/portfolio-tracker/_load-list-data.ts`)
  now join `customer_products(classification)` (Projects: newly added; Portfolio Tracker: already
  selected) and compute `canSetOwner`/`hasProduct`/`productClassification` per row; both listing
  index components (`_projects-index.tsx`, `_onboarding-list.tsx`) gained a `handleSearchName`
  callback reusing each page's existing `searchInput`/`navigate(buildUrl(...))` plumbing, wired to
  the rename duplicate-name toast's "Search" action.

### Files Changed
- `src/components/ui/sonner.tsx` - new, via `npx shadcn add sonner`
- `src/app/(hub)/layout.tsx` - mount `<Toaster />`
- `src/app/api/v2/projects/[projectId]/route.ts` - empty/duplicate validation on `name`
- `src/app/api/v2/projects/[projectId]/classification/route.ts` - new PATCH route
- `src/components/projects/editable-project-title.tsx` - new shared hover-to-edit title
- `src/components/projects/set-project-owner-modal.tsx` - new shared modal
- `src/components/projects/update-classification-modal.tsx` - new shared modal
- `src/app/(hub)/projects/page.tsx` - `customer_products` join; `productClassification`/
  `hasProduct`/`canSetOwner` per row
- `src/app/(hub)/projects/_projects-index.tsx` - new `ProjectListItem` fields; `handleSearchName`
- `src/app/(hub)/projects/_project-grid-view.tsx` - extracted `ProjectGridCard`; wrapper href,
  title swap, stat regions, menu props
- `src/app/(hub)/projects/_project-card-shared.tsx` - `ProgressStat` clickable/tooltip variant
- `src/app/(hub)/projects/_project-card-menu.tsx` - four new menu items + modal wiring
- `src/app/(hub)/portfolio-tracker/_load-list-data.ts` - `canSetOwner`/`hasProduct` per row
- `src/app/(hub)/portfolio-tracker/_onboarding-list.tsx` - new type fields; `handleSearchName`
- `src/app/(hub)/portfolio-tracker/_project-card.tsx` - title swap, `titleRef`, menu props
- `src/app/(hub)/portfolio-tracker/_portfolio-card-menu.tsx` - four new menu items + modal wiring

### Deviations From Plan
- **`customer_products` write uses `adminClient`, not the regular request-scoped client** (not
  specified in the task doc's Code Context sketch). `customer_products`' write RLS
  (`customer_products_pm_write`) only allows `admin`/`super_admin`/`pm` — narrower than
  `canManageProjectMembers`'s creator exception the route's own permission check already allows.
  Without `adminClient`, a non-listed-role project creator's update would pass the app-level
  gate and then silently no-op under RLS (0 rows affected, misleadingly reported as success).
  `adminClient` is already the established pattern for exactly this gap — see
  `phase-membership.ts`'s write helpers (`transferProjectOwnership`, `addProjectMember`, etc.),
  which use it for the identical reason.
- **`ProjectGridCard` extracted as a named subcomponent** inside `_project-grid-view.tsx` (not a
  separate file, and not in the task doc's Code Context, which sketched the change as edits to the
  existing inline `.map()` body). Required so `useRef` (for the title's imperative handle) is a
  real per-card hook rather than a hook call inside a bare `.map()` callback (which isn't a
  React-recognized component and would fail `react-hooks/rules-of-hooks`). No behavior change —
  same JSX, same file.
- **`ProjectListItem`'s existing `classification` field left untouched**, new value added under
  `productClassification` — exactly as planned, called out here only to confirm the collision the
  task doc flagged was in fact avoided.
- No other deviations — file changes matched the task doc's Proposed File Changes table.

### Design-hook (impeccable) findings
- All `design-system-font-size` findings raised during this session (new modals' `text-[11.5px]`/
  `text-[12px]`/`text-[14px]` menu-item and dialog classes; pre-existing lines in files only
  lightly touched like `_onboarding-list.tsx`, `_project-card.tsx`, `_projects-index.tsx`) are the
  same category task 264 already documented as false positives: exact pixel values copied verbatim
  from the reference components being visually matched (`ManageCollaboratorsModal`'s dialog shell,
  the existing kebab-menu item classes), consistent with this codebase's documented convention
  (CLAUDE.md's "UI Polish Conventions") of hand-rolled pixel values matching neighboring UI. None
  fixed; none are on lines this task's diff actually introduced new arbitrary values for beyond
  matching the existing pattern.

### Verification Run
- `npx tsc --noEmit` - PASS (no errors)
- `pnpm lint` - PASS (0 errors; 2 pre-existing unrelated warnings in `_checklist-tab.tsx`, same
  ones task 264's own doc already noted)
- `pnpm build` (`--webpack`, full production build) - PASS — confirms both listing routes
  (`/projects`, `/portfolio-tracker`) and the new `/api/v2/projects/[projectId]/classification`
  route compile cleanly; no build errors or warnings
- Manual browser walkthrough (hover-rename + kebab-rename, duplicate-name toast + search link,
  Set Project Owner transfer, Update Classification save, tasks/issues click regions with hover/
  tooltip, creator-exception gating) - SKIPPED (deferred to the `test` stage, which can
  authenticate and exercise the UI end-to-end; this session verified types/lint/build only,
  matching task 264's own precedent for this codebase's auth-gated routes)

## Quality Gate Notes

### Result
PASS

### Standards Review
- `git status --porcelain` matches `Implementation Notes`' Files Changed list exactly (14 modified
  source files + `TASKS.md` + `package.json`/`pnpm-lock.yaml` for the `sonner` dependency + 6 new
  files) — no untracked scope creep.
- Found one real duplication during review, same category task 264's own quality gate already
  caught once: `MemberRow`/`RawMemberRow`/`mapMembers` were defined verbatim in both
  `manage-collaborators-modal.tsx` (task 264) and the new `set-project-owner-modal.tsx` (this
  task) — both fetch and map the identical `GET /api/projects/[projectId]/members` response
  shape. Extracted a shared `src/components/projects/member-types.ts` and pointed both modals at
  it; re-verified `tsc`/`lint`/`build` clean after the change.
- No `any`, no dead code, no commented-out implementation in any changed/new file.
- Guard clauses used throughout (`if (!open) return null`, early `<span>` return in
  `EditableProjectTitle` when ungated, `if (!res.ok) throw`) — no deep nesting introduced.
- Errors handled intentionally and consistently with this codebase's existing fetch-wrapper
  pattern (try/catch → local error state or a toast, `.catch(() => ({}))` on a body-parse-if-
  present pattern already used elsewhere, e.g. `_delete-project-action.tsx`, `route.ts`'s own
  `DELETE` handler).
- File sizes: all new files are well under `nextjs-file-length-best-practices.md`'s ceiling
  (`editable-project-title.tsx` 124 lines, `set-project-owner-modal.tsx` 149 lines,
  `update-classification-modal.tsx` 126 lines, `member-types.ts` 14 lines, the new classification
  route 60 lines). `_project-grid-view.tsx` grew from 104 to ~159 lines from the `ProjectGridCard`
  extraction — still comfortably under the soft-warning threshold.
- **Nested-interactive-element risk, flagged not fixed (see Deviations)**: `EditableProjectTitle`
  renders a real `<input>` inside the Projects grid card's `<Link>` (an anchor), and `ProgressStat`
  (task 268's new clickable variant) renders a `<button>` inside that same `<Link>` — both are
  technically HTML content-model violations (anchors forbid interactive-content descendants), the
  same bug *category* task 264's Round 2 fix (`createPortal`) addressed for the collaborators
  modal in this exact file tree. Both new elements already call `e.preventDefault()` /
  `e.stopPropagation()` on `onClick` (and `onMouseDown` for the input), which is the same defense
  this codebase's pre-existing, working kebab-menu button (`ProjectCardMenu`, task 232, also
  nested inside the same `<Link>`) has relied on successfully without needing a portal. Task 264's
  Round 2 issue was specific to a full-viewport modal with its own backdrop-click surface, not a
  plain button/input reacting only to clicks that originate on itself — so the working kebab-menu
  precedent is a closer analog than the modal incident. Not restructured into a portaled or
  stretched-link pattern here, since that would be a materially larger, speculative rewrite of two
  working card layouts without a demonstrated failure. Flagged explicitly for the `test` stage to
  click-through-verify (see Deviations).

### Deviations
- **Medium — nested-interactive-element risk on the Projects grid card, needs live-browser
  verification.** Per the Standards Review note above: hovering a card title (opening the
  `<input>`) or clicking a tasks/issues stat (`<button>`) both occur inside the card's own
  `<Link>`. Expected behavior (click stays local, no stray navigation) is backed by this file
  tree's own working precedent (the kebab menu button, same nesting shape) rather than by this
  session's own browser testing, which was not performed (see Verification Run). **Required at
  the `test` stage:** on `/projects` grid view, explicitly click into a card title to rename it,
  and click both the tasks ring and the issues ring, confirming each stays on the page / navigates
  to its own destination and never triggers the card's own "View Project" navigation. If either
  leaks through despite `stopPropagation`, the fix is the same one task 264 already proved out for
  this exact file tree (`createPortal`), applied to whichever element leaks.
- Minor: `SetProjectOwnerModal`/`UpdateClassificationModal` and the extended
  `PATCH /api/v2/projects/[projectId]/classification` route use `adminClient` for the
  `customer_products` write (not specified in the task doc's Code Context) — documented in
  Implementation Notes' "Deviations From Plan" with rationale (RLS gap for the creator exception,
  matching `phase-membership.ts`'s established pattern). Still satisfies scope — no behavior
  change from the user's perspective, only a correctness fix for a role/creator combination the
  task doc's own permission model already promised to support.
- Minor: `ProjectGridCard` extracted as a named subcomponent (already documented in Implementation
  Notes) — pure structural necessity for a per-card `useRef`, no behavior change.
- Minor: `member-types.ts` extraction (this quality-gate pass, not in the original task doc) —
  pure maintainability cleanup, no scope or behavior change.
- No Major deviations. All Requirements, Out-of-Scope boundaries, and Proposed File Changes from
  the task doc were followed as written.

### Required Fixes
- None. The Medium item above is a verification requirement for the `test` stage, not a code
  change required before proceeding — the existing defense (`preventDefault`/`stopPropagation`)
  matches this codebase's own working precedent for the same nesting shape.
