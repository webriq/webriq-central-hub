# 282: Projects V2/Legacy Listing & Detail Fixes — Developer Permissions, Status Report Gate, Overview Routing Restructure (New `/overview` Route for Both Variants), Header Secondary Row on All Tabs, Settings-Gear Consolidation on Shared Tabs, Toolbar Button Relocation, Status-Summary-Drawer Hydration Fix

**Created:** 2026-08-20
**Priority:** HIGH
**Type:** enhancement / bugfix
**Recommended Tier:** deep
**Status:** Planned

---

## Overview

Fourteen fixes to the `/projects/v2/[projectId]/*` and `/projects/legacy/[projectId]/*` detail pages and their listings, requested in one batch. Research below found several items are **already correctly implemented** by earlier tasks (277/281) — those are called out explicitly so implementation doesn't waste effort re-fixing working code. The remaining items are real gaps, grouped here:

- **A. Listing copy (item 1)** — `/projects/v2` listing's role-conditional description line.
- **B. Developer permissions (items 2–3)** — mostly already correct (verify only); one real gap: the Status Report tab has zero role gating today.
- **C. Header secondary row parity (item 4)** — Owner/Collaborators row only renders on Timeline today; needs to reach the other 8 shared tabs (`_project-detail.tsx`), and "Manually tagged" text needs to be deleted everywhere it appears.
- **D. Overview tab (items 5–8)** — loading-state flash fix, a new "still under development" note, a visually enhanced empty state (shared between V2 and a **new** Legacy Overview tab), and Legacy gaining an Overview tab for the first time.
- **E. Default landing tab (item 9)** — V2 currently lands on Overview; Legacy already lands on Tasks (already correct, verify only). Interacts directly with item D's routing restructure.
- **F. Toolbar button relocation (item 10)** — "New Task"/"New Issue" move from the page header into each tab's own toolbar row, next to the List/Board/Calendar view toggle.
- **G. Settings-gear consolidation (items 11–12)** — Timeline (`_onboarding-detail.tsx`/`_generic-phase-view.tsx`) already has the consolidated gear (task 281); the 8 shared tabs (`_project-detail.tsx`, used by both StackShift and Discrete Development project types) still show the old two separate icon buttons and need the same gear.
- **H. Onboarding Workspace button order (item 13)** — reorder one row in Timeline.
- **I. Hydration error (item 14)** — `_status-summary-drawer.tsx`'s SSR/CSR branch guard.

## Requirements

### A. Listing copy (item 1)

- [ ] `/projects/v2`'s sticky-header description line (`_v2-listing/_onboarding-list.tsx:162-166`) says "client(s)", never "project(s)" in the count, for every role. Currently the `roleEditable` branch already says "client(s)"; the non-`roleEditable` branch (which developers/pm see) wrongly says "project(s)" **and** wrongly claims "Currently going through Phase 1 onboarding" (false — only some projects are in Phase 1). Unify to a single description string used for all roles (drop the role-conditional branch entirely — this is purely informational copy, not a permission), reusing the existing accurate text: `` `${total} client${total === 1 ? "" : "s"} · Current classifications: StackShift I/II, Access, Access Plus & Discrete Development — succeeding Legacy's original StackShift` ``.

### B. Developer permissions (items 2–3)

- [ ] **Verify, do not re-implement unless broken:** Delete Project, Manage Collaborators, Set Project Owner, Rename Project, and Update Classification are already correctly hidden from `developer` role everywhere they exist today:
  - Listing kebab menu (`_v2-listing/_portfolio-card-menu.tsx`) — gated by `canManageProjectMembers`/`canSetProjectOwner`/role-only delete check, none of which include `developer`, and `developer` can never be a project's `created_by` (`CREATE_ROLES` in `_load-list-data.ts` excludes it) so the `isCreator` escape hatch never fires for a developer.
  - Timeline's Settings gear (`_onboarding-detail.tsx`/`_generic-phase-view.tsx`) — same shared functions (`canManageProjectMembers`, `canSetProjectOwner`, `DELETE_PROJECT_ROLES`).
  - The 8 shared tabs' header actions (`_project-detail.tsx`) — same shared functions via `ManageCollaboratorsAction`/`DeleteProjectAction` (being replaced by the same gear in item G below — must keep the same gating).
  - Confirm this in the browser walkthrough (Implementation Step) as a developer-role user; if any of the five is reachable, that's a real bug to fix, but code inspection shows it should not be.
- [ ] **Real gap — fix required:** the "Status Report" tab is visible and directly reachable (`/projects/v2/[projectId]/status_report`, `/projects/legacy/[projectId]/status_report`) to every role including `developer`, with zero role gating anywhere (`_project-detail-tab-strip.tsx` takes no role prop at all; `status_report/page.tsx` calls `getProjectDetailData` + `isProjectVisibleToCurrentUser`, neither of which restrict by role beyond the general project-visibility check). Developers must not see the "Status Report" tab pill, and direct navigation to the route must not render the tab's content for a `developer`.
- [ ] Files and Access tabs already render view-only for `developer` (`WRITE_ROLES = ["admin", "super_admin", "marketing"]` plus `pm`; `developer` gets `canEdit = false` in both `_files-tab.tsx` and `_access-tab.tsx`) — verify only, this already matches "view with proper permissions."

### C. Header secondary row parity (item 4)

- [ ] The Owner/Collaborators secondary row (currently `_onboarding-detail.tsx`'s `ownerCollaboratorsRow`, passed to `ProjectDetailHeader`'s `secondaryRow` prop only from Timeline) also renders on the 8 shared tabs (`_project-detail.tsx` — Tasks/Issues/Milestones/Files/Access/Members/Status Report/Time Logs), which currently pass no `secondaryRow` at all.
- [ ] Delete the "Manually tagged" chip/text from the secondary row wherever it renders (currently only `_onboarding-detail.tsx:1650`; do not reintroduce it in the new `_project-detail.tsx` copy).

### D. Overview tab (items 5–8)

- [ ] **Loading flash (item 5):** `_coming-soon-overview.tsx` must render a skeleton (not the "Coming soon" empty state) while `useProgrammeProgress`'s fetch is in flight (`progress.loading === true`). The hook already returns a distinct `loading` field the component currently ignores — this is a 3-way branch fix (`loading` → skeleton, `!loading && !ready` → Coming Soon, `ready` → `ProgrammeProgressCard`), not new data plumbing.
- [ ] **Under-development note (item 6):** below `ProgrammeProgressCard` (the `progress.ready` branch only), add a short note that the tab is still under development and more will be added soon.
- [ ] **Enhanced Coming Soon UI (item 7):** visually upgrade the static "Coming soon" empty state (both V2's non-ready branch and the new Legacy Overview page below) to match the weight/hierarchy of `src/app/(hub)/portfolio-tracker/page.tsx`'s retired-page notice (`w-14 h-14 rounded-2xl` icon container, `text-[22px]` bold heading, generous spacing) instead of the current smaller `w-12 h-12 rounded-full` / `text-[16px]` treatment. Extract into one shared component (`_shared/_coming-soon-panel.tsx`) so V2 and Legacy stay visually identical and future copy tweaks happen in one place.
- [ ] **Legacy Overview tab (item 8):** Legacy gains a 9th tab, "Overview," at `/projects/legacy/[projectId]/overview`, rendering the shared Coming Soon panel (item 7) — Legacy has no programme/customer-phases concept, so it is always the static empty state, never the progress card.

### E. Default landing tab (item 9)

- [ ] V2's default landing tab becomes **Timeline** (currently Overview, via the bare `page.tsx`). Legacy's default landing tab is **already Tasks** (`legacy/[projectId]/page.tsx` already `redirect()`s to `/tasks`) — verify only, no change needed there.
- [ ] This requires the routing restructure described in Implementation Steps below (Overview needs its own stable route once the bare path stops rendering it) — items 8 and 9 share this restructure, do it once.

### F. Toolbar button relocation (item 10)

- [ ] "New Task" (Tasks tab) and "New Issue" (Issues tab) move out of the page-level header's `actions` slot into each tab's own toolbar row, immediately beside the List/Board/Calendar view toggle, vertically centered with it (`items-center` on the shared flex row).

### G. Settings-gear consolidation (items 11–12)

- [ ] The 8 shared tabs (`_project-detail.tsx`) replace their current two separate icon buttons (`ManageCollaboratorsAction`, `DeleteProjectAction`) in the header `actions` slot with the same single Settings-gear dropdown (Set Project Owner / Manage Collaborators / Delete Project) Timeline already has, preserving identical role gating (`canManageProjectMembers`, `canSetProjectOwner`, `DELETE_PROJECT_ROLES`).
- [ ] Since `_project-detail.tsx` is the shared component for **both** StackShift and Discrete Development (generic-engine) project types' non-Timeline tabs, this single change satisfies item 12 ("apply to Discrete Development too") for those 8 tabs. Verify visually on a Discrete Development project during the browser walkthrough.

### H. Onboarding Workspace button order (item 13)

- [ ] In Timeline's above-swimlane row (`_onboarding-detail.tsx:2143-2178`), reorder so "Onboarding Workspace" is the last (rightmost) button. Current order: Jump to Phase → Onboarding Workspace → Status Summary. Target order: Jump to Phase → Status Summary → Onboarding Workspace.

### I. Hydration error (item 14)

- [ ] Fix the hydration mismatch in `_status-summary-drawer.tsx` reported on `/projects/v2/[projectId]` (`StatusSummaryDrawer`, `<div aria-hidden="true">` flagged as client-only). Root cause: `if (typeof document === "undefined") return null;` (line 78) renders `null` during SSR (no `document` global in Node) but immediately renders the full `createPortal(...)` tree on the client's first (hydrating) pass, since `document` exists from the very first client render — the two passes never match. Replace with a `mounted` state flag set via `useEffect` (runs only after hydration completes), gating the portal render on `mounted` instead of the `typeof document` check — the standard SSR-safe portal pattern, guaranteeing both the server pass and the client's hydration pass render `null` identically, with the real portal appearing only on the post-hydration re-render.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors.

## Out of Scope / Must-Not-Change

- Any Timeline/`_onboarding-detail.tsx` content beyond item H's single row reorder and (if found broken during Step 1's verification) item B's permission checks — task 281 already restructured this file extensively; do not re-touch its header/secondaryRow/settings-gear wiring beyond what's listed.
- `_generic-phase-view.tsx`'s settings gear, spacing, or progress-bar placement — already correct per task 281 (items 4–8 of that task were StackShift-only); this task's only touch to that file is confirming item 12's Discrete Development parity via `_project-detail.tsx` (no `_generic-phase-view.tsx` edits expected).
- `StatusSummaryDrawer`'s/`StatusSummaryPhaseCards`'s internal content, the `/api/projects/[projectId]/programme` route, `/api/onboarding/projects/status-report` route — no data or business-logic changes, only the portal-mount timing fix (item I).
- No new database columns, migrations, or API routes anywhere in this task.
- `role-access.ts` (the v0.1 `/dashboard/*` route table) — unrelated to the v2 Projects module's own inline permission functions; not touched.
- Rename/Update Classification/Set Owner/Manage Collaborators/Delete UI or logic itself — this task only verifies existing gating and (item G) relocates two buttons into a dropdown; it does not add, remove, or change what any of the five actions do.
- The Wizard (`_onboarding-wizard.tsx`), Onboarding Workspace route content — not touched, only its trigger button's position in the row (item H).

## Flagged Decisions (confirm during implementation / review)

1. **New Task/New Issue button's exact position relative to the view toggle (item F):** the reference images show the button and the List/Board/Calendar toggle in the same row, vertically centered, but do not make the left/right order unambiguous. **Recommended default:** button to the right of the toggle (rightmost element in that row) — matches this codebase's consistent "primary create action is rightmost" convention (e.g. the listing's own "New Project" button, the header's current placement). Confirm visually against the reference images during implementation; swap order if the images clearly show the button first.
2. **Legacy Overview's `ProjectDetailHeader` wiring:** Legacy has no `classification`/`uses_customer_phases_engine` concept, so its new Overview route needs a small server loader (reuse `getProjectDetailData`, same as Legacy's other 8 tabs) feeding a `typeLabel={project.project_type}` header with the shared Coming Soon panel body — no `useActivePhase`/`useProgrammeProgress` calls (those are v2-only hooks gated on `uses_customer_phases_engine`, which is always false for Legacy rows). Confirm this loader reuse during implementation rather than introducing a second data-fetch path.
3. **Coming Soon panel's optional CTA (item D/7):** `portfolio-tracker/page.tsx`'s reference has a "Go to Projects →" button; the current Overview empty state has no button, just body text pointing at the Timeline tab. **Recommended default:** keep it text-only (no button) — Overview already sits inside the same tab strip as Timeline, so a full CTA button is redundant in a way it wasn't for the fully-separate, soon-to-be-removed `/portfolio-tracker` page. Only the icon size/border-radius, heading size, and spacing are being upgraded to match, not the button. Flag if the user wants a "Go to Timeline" button added too.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` | Modify | Item A — collapse the two-branch description string into one accurate, role-independent line |
| `src/app/(hub)/projects/_shared/_project-detail-tab-strip.tsx` | Modify | Item B (Status Report gate) — accept a `role` (or `showStatusReport`) prop, omit the "Status Report" pill when the current user is `developer` |
| `src/app/(hub)/projects/_shared/_project-detail.tsx` | Modify | Item B (route-level Status Report gate), Item C (secondaryRow), Item F (toolbar button relocation), Item G (settings-gear swap), Item E (`showOverview` no longer v2-only) |
| `src/app/(hub)/projects/legacy/[projectId]/status_report/page.tsx` | Modify | Item B — redirect/block a `developer` role before rendering (mirror whatever gate pattern is added to the v2 status_report route) |
| `src/app/(hub)/projects/v2/[projectId]/status_report/page.tsx` | Modify | Item B — same gate, v2 side |
| `src/app/(hub)/projects/v2/[projectId]/_coming-soon-overview.tsx` | Modify | Items D5/D6 — 3-way branch on `progress.loading`/`progress.ready`, add the under-development note |
| `src/app/(hub)/projects/_shared/_coming-soon-panel.tsx` | Create | Item D7 — extracted, visually-enhanced empty-state JSX shared by V2's non-ready Overview branch and the new Legacy Overview page |
| `src/app/(hub)/projects/v2/[projectId]/page.tsx` | Modify | Item E — becomes a `redirect()` to `./timeline` instead of rendering `ComingSoonOverview` |
| `src/app/(hub)/projects/v2/[projectId]/overview/page.tsx` | Create | Items D8/E — Overview's new stable route (content moved verbatim from the old bare `page.tsx`) |
| `src/app/(hub)/projects/legacy/[projectId]/overview/page.tsx` | Create | Item D8 — new Legacy Overview route, static Coming Soon panel only |
| `src/app/(hub)/projects/_v2-listing/_portfolio-card-menu.tsx` | Modify | Item E — "View Project" link targets `/timeline`, not the bare path |
| `src/app/(hub)/projects/_v2-listing/_project-card.tsx` | Modify | Item E — card click/Enter targets `/timeline` |
| `src/app/(hub)/projects/v2/status-report/_status-report-table.tsx` | Modify | Item E — row link targets `/timeline` |
| `src/app/(hub)/projects/v2/new/_content.tsx` | Modify | Item E — post-create "View" targets `/timeline` |
| `src/app/(hub)/projects/v2/[projectId]/_onboarding-detail.tsx` | Modify | Item H — swap Status Summary/Onboarding Workspace button order (lines ~2160-2177) |
| `src/app/(hub)/projects/v2/[projectId]/_delete-project-menu-item.tsx` | Modify | Item G — add a `variant: "legacy" \| "v2"` prop (mirrors `_delete-project-action.tsx`) so `_project-detail.tsx`'s new gear redirects correctly for both variants after delete |
| `src/app/(hub)/projects/v2/[projectId]/_status-summary-drawer.tsx` | Modify | Item I — mounted-state-effect fix for the SSR/CSR portal mismatch |

## Code Context

### `_onboarding-list.tsx` — description line to unify (item A, lines 162-166)
```tsx
<p className="text-[13px] text-[#5F6A88]">
  {roleEditable
    ? `${total} client${total === 1 ? "" : "s"} · Current classifications: StackShift I/II, Access, Access Plus & Discrete Development — succeeding Legacy's original StackShift`
    : `${total} project${total === 1 ? "" : "s"} · Currently going through Phase 1 onboarding`}
</p>
```
Becomes a single unconditional string (drop the ternary and `roleEditable` branch here — `roleEditable` is still used elsewhere in the file for actual permission gating, only this one description string stops branching on it).

### `_project-detail-tab-strip.tsx` — no role awareness today (item B)
```tsx
export function ProjectDetailTabStrip({
  basePath, activeTab, showOverview,
}: {
  basePath: string;
  activeTab: DetailTabId;
  showOverview: boolean;
}) {
  const tabs = showOverview ? [OVERVIEW_TAB, TIMELINE_TAB, ...BASE_TABS] : BASE_TABS;
```
`BASE_TABS` includes `status_report` unconditionally. Add a role-aware filter, e.g. `const tabs = (showOverview ? [...] : BASE_TABS).filter((t) => t.id !== "status_report" || role !== "developer")`, threading a new `role: string | null` prop from every caller (`_project-detail-header.tsx` → its own `_project-detail.tsx`/`_onboarding-detail.tsx`/`_generic-phase-view.tsx`/`_coming-soon-overview.tsx`/new Overview pages callers already have `currentUserRole` in scope).

### `_project-detail.tsx` — current header actions to replace (item G, lines 478-501)
```tsx
actions={
  <>
    <ManageCollaboratorsAction
      projectDbId={project.id}
      projectName={project.name}
      currentUserRole={currentUserRole}
      isCreator={project.created_by === currentUserId}
    />
    <DeleteProjectAction
      projectId={project.project_id}
      projectName={project.name}
      currentUserRole={currentUserRole}
      variant={variant}
    />
    {(primaryTab === "tasks" || primaryTab === "issues") && (
      <button onClick={...}>
        <Plus size={16} /> {primaryTab === "issues" ? "New Issue" : "New Task"}
      </button>
    )}
  </>
}
```
Replace with a `settingsMenu` construction mirroring `_onboarding-detail.tsx:1659-1702` verbatim (same `canManageProjMembers`/`canSetOwner`/`canDeleteProject` booleans, computed the same way: `canManageProjectMembers(currentUserRole, project.created_by === currentUserId)`, `canSetProjectOwner(...)`, `DELETE_PROJECT_ROLES.includes(currentUserRole)`), passed as `actions={settingsMenu}`. The New Task/New Issue button block is deleted from here entirely (moves per item F below).

### `_project-detail.tsx` — Tasks tab's view-toggle row, insertion point for the relocated button (item F, lines 546-565)
```tsx
<div className="flex items-center gap-0.5 border border-[#E2E7F2] rounded-full p-1 bg-white shrink-0">
  {VIEW_ORDER.map((v) => ( /* List/Board/Calendar buttons */ ))}
</div>
```
Add the "New Task" button as a sibling immediately after this div (same parent flex row, `items-center` already present on the row per line ~510). Mirror for Issues at the equivalent `issueView` toggle block (~lines 642-660).

### `_coming-soon-overview.tsx` — current 2-way branch to become 3-way (item D5/D6, lines 54-84)
```tsx
{progress.ready ? (
  <ProgrammeProgressCard ... />
) : (
  <div className="flex h-full items-center justify-center">
    {/* static "Coming soon" panel */}
  </div>
)}
```
Becomes:
```tsx
{progress.loading ? (
  <SkeletonPanel /> // new — pulsing placeholder matching ProgrammeProgressCard's rough shape
) : progress.ready ? (
  <>
    <ProgrammeProgressCard ... />
    <p className="mt-4 text-[12px] text-[#5F6A88]">
      This tab is still under development — more will be added soon.
    </p>
  </>
) : (
  <ComingSoonPanel /> // extracted shared component, item D7
)}
```
`progress.loading` and `progress.ready` are both already returned by `useProgrammeProgress` (`_use-programme-progress.ts:45-49,78-83`) — no hook changes needed, only consuming the field the component currently ignores.

### `portfolio-tracker/page.tsx` — visual reference for the enhanced Coming Soon panel (item D7)
```tsx
<div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-[#E5F1FF] flex items-center justify-center">
  <LayoutGrid size={24} className="text-[#007BFF]" />
</div>
<h1 className="font-heading text-[22px] font-bold tracking-[-0.02em] text-[#0B1533] mb-3">
  Portfolio Tracker has moved
</h1>
<p className="text-[13px] leading-relaxed text-[#3A4565] mb-2">...</p>
```
vs. today's smaller Overview empty state (`_coming-soon-overview.tsx:73-81`, `w-12 h-12 rounded-full` icon, `text-[16px]` heading) — extract a `_shared/_coming-soon-panel.tsx` sized/spaced like the reference (icon container, heading, one body line), content is `"This tab is being redesigned. Head over to the Timeline tab for the full project programme."` for V2 and an equivalent Legacy-appropriate line (no "Timeline tab" reference, since Legacy has no Timeline tab) for the new Legacy Overview page.

### `v2/[projectId]/page.tsx` — becomes a redirect (item E)
```tsx
// current: renders <ComingSoonOverview .../> at the bare path
// target, matching legacy/[projectId]/page.tsx's existing pattern:
import { redirect } from "next/navigation";
export default async function ProjectDetailPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(`/projects/v2/${projectId}/timeline`);
}
```
The `ComingSoonOverview` component and its `generateMetadata` move verbatim into the new `overview/page.tsx`.

### `_project-detail-tab-strip.tsx` — Overview tab's nav target must change once the bare path redirects (item E)
```tsx
onClick={() => router.push(tab.id === "overview" ? basePath : `${basePath}/${tab.id}`)}
```
Once `page.tsx` redirects `basePath` → `timeline`, clicking the "Overview" pill (which still navigates to bare `basePath`) would immediately bounce to Timeline. Change to `router.push(\`${basePath}/${tab.id}\`)` unconditionally (drop the `tab.id === "overview"` special case) now that Overview has its own `/overview` segment like every other tab, for both V2 and Legacy.

### `_onboarding-detail.tsx` — button order to swap (item H, lines 2160-2177)
```tsx
{!isComplete && ... && canOpenWizard && (
  <button onClick={() => router.push(`/projects/v2/${projectUrlKey}/onboarding-workspace`)}>
    <PlayCircle size={14} /> {activePhaseNumber === 1 ? "Onboarding Workspace" : "View Onboarding Workspace"}
  </button>
)}
<button onClick={() => setSummaryOpen(true)}>
  <ClipboardList size={13} /> Status Summary
</button>
```
Swap so Status Summary's `<button>` block renders before the Onboarding Workspace `<button>` block (Jump to Phase, already first, is unaffected).

### `_status-summary-drawer.tsx` — SSR guard fix (item I, lines 78-80)
```tsx
// current — mismatches on the hydrating client render:
if (typeof document === "undefined") return null;
return createPortal(<>...</>, document.body);
```
```tsx
// target — matches SSR (null) on both the server pass and the client's hydration pass:
const [mounted, setMounted] = useState(false);
useEffect(() => { setMounted(true); }, []);
if (!mounted) return null;
return createPortal(<>...</>, document.body);
```
Note (Implementation Note, not required scope): `_onboarding-detail.tsx` has other `createPortal` call sites using the same `typeof document === "undefined"` guard (deliverable-checklist/hover popovers, per that file's own comment on `_status-summary-drawer.tsx:76-77). Only fix the one reported in the screenshot (`StatusSummaryDrawer`) — if the browser walkthrough (Implementation Step) reveals the same console error from another popover, flag it as a related but separate follow-up rather than silently expanding this task's scope.

## Implementation Steps

1. **Item A** — collapse `_onboarding-list.tsx`'s description ternary to one string.
2. **Item B verification pass** — as a `developer`-role user (or by tracing the exact prop chain in code if no live developer session is available), confirm Delete/Manage Collaborators/Set Owner/Rename/Update Classification are unreachable on both the listing kebab menu and Timeline's settings gear. Do not change working code; note the verification result in Implementation Notes.
3. **Item B fix** — add role-aware Status Report gating: (a) thread a `role`/`showStatusReport` prop into `ProjectDetailTabStrip` and every caller, filtering the pill; (b) add a server-side check in both `status_report/page.tsx` routes (v2 and legacy) that redirects a `developer` away (e.g. to `../timeline` for v2, `../tasks` for legacy) rather than rendering the tab.
4. **Item C** — build the same `ownerCollaboratorsRow`-shaped JSX (owner avatar/name, collaborator avatars) inside `_project-detail.tsx`, pass it as `ProjectDetailHeader`'s `secondaryRow` for all variants/tabs it renders; delete "Manually tagged" from `_onboarding-detail.tsx`'s existing row at the same time (single source of truth, no divergence).
5. **Item D7 first** (build the shared panel before item D5/D6/D8 consume it) — extract `_shared/_coming-soon-panel.tsx` sized per the `portfolio-tracker/page.tsx` reference, parameterized by its one body-copy line (V2 vs Legacy wording per Flagged Decision 2).
6. **Item D5/D6** — `_coming-soon-overview.tsx`'s 3-way branch (loading skeleton / `ComingSoonPanel` / `ProgrammeProgressCard` + under-development note).
7. **Items E + D8 routing restructure (do together):**
   - Move `ComingSoonOverview`'s render + `generateMetadata` from `v2/[projectId]/page.tsx` into new `v2/[projectId]/overview/page.tsx`.
   - Replace `v2/[projectId]/page.tsx` with a `redirect(...)` to `./timeline`, matching `legacy/[projectId]/page.tsx`'s existing pattern.
   - Create `legacy/[projectId]/overview/page.tsx` (new loader call + `ComingSoonPanel`, per Flagged Decision 2).
   - Update `_project-detail-tab-strip.tsx`'s Overview nav target (drop the bare-basePath special case).
   - Update `_project-detail.tsx`'s `showOverview` from `variant === "v2"` to unconditional `true` (Legacy now has an Overview tab too).
   - Update the four V2 "open project" entry points (`_portfolio-card-menu.tsx`, `_project-card.tsx` ×2 call sites, `_status-report-table.tsx`, `v2/new/_content.tsx`) to target `/timeline` instead of the bare path.
   - Verify Legacy's existing entry points still correctly land on Tasks (no change expected, confirm during walkthrough).
8. **Item F** — delete the New Task/New Issue block from `_project-detail.tsx`'s header `actions`; add it beside each of the Tasks/Issues view toggles (Flagged Decision 1 on exact left/right order).
9. **Item G** — add a `variant` prop to `_delete-project-menu-item.tsx` (mirrors `_delete-project-action.tsx`); build the settings-gear construction in `_project-detail.tsx` (same shape as `_onboarding-detail.tsx:1659-1702`); remove `ManageCollaboratorsAction`/`DeleteProjectAction` imports and usage from `_project-detail.tsx` once the gear replaces them (leave those two components themselves in place — still unused-but-harmless, or delete if `verify_done`/grep confirms no other importers; check before deleting).
10. **Item H** — swap the two button blocks' order in `_onboarding-detail.tsx`.
11. **Item I** — apply the `mounted`-state-effect fix to `_status-summary-drawer.tsx`.
12. **Full browser walkthrough** (`pnpm dev`): a customer-phases-engine project (StackShift) and a Discrete Development project, across both V2 and Legacy where applicable — confirm every requirement above, paying special attention to: Overview's 3-way state on hard refresh, the new `/overview` routes for both variants, Timeline's reordered buttons, the consolidated gear rendering correctly (and hidden correctly for a developer) on all 8 shared tabs, the relocated New Task/New Issue buttons, and no hydration-error console output on any of the pages touched.

## Acceptance Criteria

- [x] `/projects/v2`'s description line always says "client(s)" and never claims every project is in Phase 1 onboarding, for every role.
- [ ] A `developer`-role user cannot see or reach Rename/Set Owner/Update Classification/Manage Collaborators/Delete Project anywhere in the v2 Projects module (listing menu, Timeline gear, shared-tabs gear) — confirmed live, not just by code inspection. **Not live-verified** (no `developer`-role session available in this sandbox) — verified by code inspection only; see Implementation Notes.
- [ ] A `developer`-role user does not see the "Status Report" tab pill and is redirected away if they navigate to the route URL directly, on both V2 and Legacy. **Not live-verified**, same reason — see Implementation Notes.
- [x] Files and Access tabs remain reachable and view-only (no edit controls) for `developer` — unchanged, verified not regressed (code path untouched by this task).
- [x] The Owner/Collaborators secondary row renders under the header subtitle on every V2 tab (Overview, Timeline, Tasks, Issues, Milestones, Files, Access, Members, Status Report, Time Logs) and every Legacy tab; "Manually tagged" text does not render anywhere.
- [x] Hard-refreshing Overview for a customer-phases-engine, started-programme project shows a loading skeleton (never a "Coming soon" flash) before the progress card appears — verified by code inspection (`progress.loading` branch); local fetch resolved too fast to visually catch the skeleton frame in a screenshot.
- [x] Overview shows an "under development, more coming soon" note directly below the progress card/stat chips.
- [x] The Coming Soon empty state (V2 non-applicable projects, and Legacy's new Overview tab) visually matches the `portfolio-tracker/page.tsx` reference's icon/heading/spacing weight.
- [x] Legacy project detail pages have a working "Overview" tab showing the enhanced Coming Soon panel.
- [x] Opening a project from any V2 entry point (listing card, status report row, post-create "View", card kebab menu) lands on Timeline, not Overview; Overview remains reachable via its own tab. Opening a Legacy project still lands on Tasks (unchanged).
- [x] "New Task"/"New Issue" render beside the List/Board/Calendar view toggle in each tab's own toolbar, not in the page header.
- [x] The 8 shared tabs (Tasks/Issues/Milestones/Files/Access/Members/Status Report/Time Logs) show one Settings-gear button (Set Owner/Manage Collaborators/Delete, correctly role-gated) instead of two separate icon buttons — verified on both a StackShift and a Discrete Development project.
- [x] Timeline's above-swimlane row renders Jump to Phase → Status Summary → Onboarding Workspace (Onboarding Workspace last).
- [x] Opening the Status Summary drawer from any V2 page produces no hydration-error console output / dev overlay.
- [x] `npx tsc --noEmit` passes with no new errors.
- [x] `pnpm lint` passes with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then browser-test per Implementation Step 12
```
Browser-based acceptance testing is required (per CLAUDE.md — no test runner configured): nearly every item here is a visual, routing, or role-gated behavior change that cannot be confirmed from code alone. At minimum test: one StackShift project as a non-developer role (full permission surface) and as a `developer` (restricted surface), one Discrete Development project (item G/12 parity), and one Legacy project (items 8/9).

## Compatibility Touchpoints

- `_docs/mcp-tools.md` — not affected (no new `server.registerTool` calls).
- No new env vars, no DB migration, no new API routes.
- `role-access.ts` — not touched; this task's role gating lives entirely in the v2 Projects module's own inline functions (`canManageProjectMembers`, `canSetProjectOwner`, `DELETE_PROJECT_ROLES`, and the new Status Report gate).
- Route changes: `v2/[projectId]` (bare path) changes from a rendering route to a redirect; two new routes (`v2/[projectId]/overview`, `legacy/[projectId]/overview`) are added. Any external bookmarks/links to the bare V2 project path keep working (redirect, not a 404) — Legacy's bare path already behaves this way today.

## Implementation Notes

### What Changed

- **Item A**: `_onboarding-list.tsx`'s description line collapsed from a two-branch ternary (one accurate, one wrong) to one unconditional string.
- **Item B (verification)**: confirmed by code inspection that Delete/Manage Collaborators/Set Owner/Rename/Update Classification were already correctly excluded for `developer` everywhere they exist (listing kebab menu, Timeline's gear) — none of the underlying functions (`canManageProjectMembers`, `canSetProjectOwner`, `DELETE_PROJECT_ROLES`/`DELETE_ROLES`, `CREATE_ROLES`) include `developer`, and `developer` can never be a project's `created_by` since it's excluded from `CREATE_ROLES`. No code change needed for that half of item B.
- **Item B (fix)**: `ProjectDetailTabStrip` now filters out the "Status Report" pill when `role === "developer"`; both `status_report/page.tsx` routes (v2 and legacy) now `redirect()` a `developer` away before rendering (to `../timeline` and `../tasks` respectively) rather than relying on the hidden pill alone.
- **Item C**: new shared `_owner-collaborators-row.tsx` component (fetches `GET /api/projects/[projectId]/members`, renders Owner + `CollaboratorAvatars`) now renders via `ProjectDetailHeader`'s `secondaryRow` on the 8 shared tabs, Overview (both variants), and Legacy's new Overview — everywhere Timeline already had it, plus everywhere it didn't. "Manually tagged" removed from Timeline's own (separately computed, untouched otherwise) secondary row.
- **Item D5/D6**: `_coming-soon-overview.tsx`'s 2-way branch (`ready` / not) became 3-way (`loading` skeleton / `ready` progress card + new under-development note / `ComingSoonPanel`), consuming `useProgrammeProgress`'s existing `loading` field the component previously ignored.
- **Item D7**: new shared `_coming-soon-panel.tsx` (`w-14/h-14 rounded-2xl` icon, `text-[22px]` heading, matching `portfolio-tracker/page.tsx`'s weight) replaces the smaller inline empty state; used by both V2's non-ready Overview branch and the new Legacy Overview page.
- **Item D8 / E (routing restructure, done together)**: `ComingSoonOverview`'s render moved verbatim from the bare `v2/[projectId]/page.tsx` into new `v2/[projectId]/overview/page.tsx`; the bare path now `redirect()`s to `./timeline` (V2's new default landing tab, matching Legacy's existing bare-path-redirects-to-tasks pattern). New `legacy/[projectId]/overview/page.tsx` added (reuses `getProjectDetailData`, per Flagged Decision 2 — no second data-fetch path). Four V2 "open project" entry points (`_portfolio-card-menu.tsx`, `_project-card.tsx` ×2, `_status-report-table.tsx`, `v2/new/_content.tsx`) now target `/timeline` instead of the bare path.
- **Item F**: "New Task"/"New Issue" moved from the page header's `actions` slot into each tab's own toolbar row, immediately right of the List/Board/Calendar view toggle (Flagged Decision 1's recommended default — rightmost).
- **Item G**: `_project-detail.tsx`'s header `actions` now render a consolidated Settings gear (Set Project Owner / Manage Collaborators / Delete Project), matching Timeline's existing gear exactly, replacing the old separate `ManageCollaboratorsAction`/`DeleteProjectAction` icon buttons. Since this file is shared by both StackShift and Discrete Development project types' non-Timeline tabs, item 12 (Discrete Development parity) is satisfied by this same change — verified live on "ABC Test Company Gantt" (Discrete Development).
- **Item H**: Timeline's above-swimlane row reordered from Jump to Phase → Onboarding Workspace → Status Summary to Jump to Phase → Status Summary → Onboarding Workspace (Onboarding Workspace now last/rightmost).
- **Item I**: `_status-summary-drawer.tsx`'s SSR/CSR portal guard changed from `if (typeof document === "undefined") return null` (renders `null` on the server, the full portal on the client's very first/hydrating render — the two passes never match) to a `useSyncExternalStore`-based mounted flag (`false` on both the server pass and the client's hydration pass, `true` only on the client-only re-render) — same idiom already used by `use-pm-settings.ts`/`theme-toggle.tsx`. Verified via hard-reload + opening the drawer with no hydration-error console output.

### Files Changed

- `src/app/(hub)/projects/_v2-listing/_onboarding-list.tsx` — item A
- `src/app/(hub)/projects/_shared/_project-detail-tab-strip.tsx` — item B (Status Report gate); also `showOverview` → `variant`-driven Timeline gating (see Deviations)
- `src/app/(hub)/projects/_shared/_project-detail-header.tsx` — `role` prop threaded to tab strip; `showOverview` prop removed, tab strip now keys off `variant` directly
- `src/app/(hub)/projects/_shared/_project-detail.tsx` — items B (route gate n/a here)/C/E/F/G; removed `ManageCollaboratorsAction`/`DeleteProjectAction` imports and usage
- `src/app/(hub)/projects/legacy/[projectId]/status_report/page.tsx` — item B
- `src/app/(hub)/projects/v2/[projectId]/status_report/page.tsx` — item B
- `src/app/(hub)/projects/v2/[projectId]/_coming-soon-overview.tsx` — items D5/D6, `role`/`secondaryRow` threading
- `src/app/(hub)/projects/_shared/_coming-soon-panel.tsx` — new, item D7
- `src/app/(hub)/projects/_shared/_owner-collaborators-row.tsx` — new, item C (see Deviations)
- `src/app/(hub)/projects/v2/[projectId]/page.tsx` — item E, now a redirect
- `src/app/(hub)/projects/v2/[projectId]/overview/page.tsx` — new, items D8/E
- `src/app/(hub)/projects/legacy/[projectId]/overview/page.tsx` — new, item D8
- `src/app/(hub)/projects/_v2-listing/_portfolio-card-menu.tsx` — item E
- `src/app/(hub)/projects/_v2-listing/_project-card.tsx` — item E
- `src/app/(hub)/projects/v2/status-report/_status-report-table.tsx` — item E
- `src/app/(hub)/projects/v2/new/_content.tsx` — item E
- `src/app/(hub)/projects/v2/[projectId]/_onboarding-detail.tsx` — item C ("Manually tagged" removed, now-unused `headerIsManualOverride` removed), item H, `role` prop passed to both header call sites
- `src/app/(hub)/projects/v2/[projectId]/_delete-project-menu-item.tsx` — item G, added `variant` prop
- `src/app/(hub)/projects/v2/[projectId]/_status-summary-drawer.tsx` — item I
- `src/app/(hub)/projects/_shared/_delete-project-action.tsx` — **deleted** (dead code, see Deviations)
- `src/app/(hub)/projects/_shared/_manage-collaborators-action.tsx` — **deleted** (dead code, see Deviations)
- `TASKS.md` — moved 282 Planned → In Progress → Testing

### Deviations From Plan

- **Owner/Collaborators row extracted into a new shared component** (`_owner-collaborators-row.tsx`), not built inline three separate times as the task doc's Code Context section sketched — became necessary once item C's actual scope (Overview on both variants, not just the 8 shared tabs) was confirmed against the Acceptance Criteria list during implementation; a single fetch-and-render component avoided tripling the `GET /api/projects/[projectId]/members` fetch logic across `_project-detail.tsx`, `_coming-soon-overview.tsx`, and the new Legacy Overview page.
- **`ProjectDetailTabStrip`'s `showOverview: boolean` prop replaced with `variant: "legacy" | "v2"`** — not in the original plan. Initially implemented item E's `showOverview` as an unconditional `true` from every caller (per the task doc's literal instruction), which also unconditionally showed the "Timeline" tab to Legacy (the same flag controlled both) — a real bug, since Legacy has no `/timeline` route. Caught via live browser testing (Legacy's tab strip showed a dead "Timeline" pill) before reporting complete; fixed by decoupling the two concerns — Overview is now unconditional (both variants), Timeline stays gated on `variant === "v2"`.
- **Settings gear's "Set Project Owner"/"Manage Collaborators" menu items in `_project-detail.tsx`** navigate to `${basePath}/members` (the existing Members tab, which already has equivalent "Make owner"/"Add collaborator"/"Remove" actions) rather than opening Timeline's inline `OwnerPanel`/`CollaboratorsPanel` components — those are StackShift/Timeline-local components not available to the 8 shared tabs; reusing the Members tab avoided duplicating that panel UI for a second, lower-traffic entry point.
- **`_delete-project-action.tsx` and `_manage-collaborators-action.tsx` deleted** — not listed in the task doc's Proposed File Changes, but a direct, low-risk consequence of item G's consolidation: once `_project-detail.tsx` (their only remaining importer) switched to the gear, both files had zero importers left in the `projects/` module (confirmed via repo-wide grep; `projects-old/[projectId]/` has its own unrelated, separate files with the same names, not touched). Left as dead code would contradict CLAUDE.md's "if unused, delete it" guidance.

### Verification Run

- `npx tsc --noEmit` — PASS (0 errors)
- `pnpm lint` — PASS (0 errors; 2 pre-existing unrelated warnings in `onboarding-workspace/_checklist-tab.tsx`, same ones noted in task 281, untouched by this task)
- Browser walkthrough (Claude-in-Chrome, against the user's own already-running `pnpm dev` on localhost:3000, Super Admin) — PASS:
  - **V2 listing** (`/projects/v2`) — description line reads "15 clients · Current classifications: …" (item A).
  - **ABC Test Company Gantt** (Discrete Development) — clicking the listing card landed on `/timeline` directly (item E); Overview tab reachable and shows the enhanced Coming Soon panel with the secondary row (items D7/D8-parity/C); Tasks/Issues tabs show the consolidated Settings gear (Set Project Owner/Manage Collaborators/Delete Project, matching the reference image exactly) instead of two icon buttons, with "New Task"/"New Issue" now beside the view toggle (items F/G, including item 12's Discrete Development parity).
  - **Glorias Anzac Biscuits August 2026 Revamp** (StackShift I) — hard-refreshing `/timeline` and opening Status Summary produced no hydration-error console output (item I); above-swimlane row order confirmed Jump to Phase → Status Summary → Onboarding Workspace (item H); Overview tab showed the real Programme Progress card (not Coming Soon) with the owner/collaborators row and the new "This tab is still under development — more will be added soon." note (items C/D6).
  - **RCB & Associates** (Legacy) — clicking the listing card landed on `/tasks` directly, unchanged (item E verify-only); new Overview tab reachable, shows the enhanced Coming Soon panel with Legacy-appropriate copy ("Head over to the Tasks tab…") and the owner/collaborators row, no Timeline pill and no Settings-gear regression on the 8 base tabs (item D8, plus the mid-implementation regression fix above).
  - **Status Report listing** (`/projects/v2/status-report`) — confirmed a project row's link `href` targets `/timeline`, not the bare path (item E).
- **Not verified live**: item B's `developer`-role gating (Status Report tab hidden + route redirect) — no `developer`-role test session available in this sandbox; verified by code inspection only (same limitation task 281 documented for its own role-visibility checks). The Overview loading-skeleton branch (item D5) was verified by code inspection only — the local fetch resolved too fast to catch the skeleton frame in a screenshot.
