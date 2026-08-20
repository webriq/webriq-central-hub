# 277: V2 Project Detail — Overview → "Coming Soon", New "Timeline" Tab, Uniform Header Across All Tabs, Tab/Content Spacing Fix

**Created:** 2026-08-19
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** deep
**Status:** Testing

---

## Overview

Four related changes to the V2 project detail pages at `/projects-v2/v2/[projectId]/*` (task 276's unified Projects V2 module — Legacy detail pages at `/projects-v2/legacy/[projectId]/*` are **not** in scope):

1. The **Overview** tab currently renders the full StackShift/generic-engine swimlane+programme page (`_onboarding-detail.tsx`, 2272 lines). It becomes an empty "Coming soon" placeholder with a nice, on-brand empty state.
2. A new **Timeline** tab is added (second position, right after Overview) that receives everything Overview currently renders — same component, same data, same behavior, just moved one tab over.
3. All nine V2 tabs (Overview, Timeline, Tasks, Issues, Milestones, Files, Access, Members, Status Report, Time Logs) get one **uniform page header** — the header/tab-strip chrome that Tasks/Issues/etc. already use (back link, project name + status pill, company · type subtitle, action icons, tab strip) — with two content changes to that header: the status pill becomes the **active phase** ("Phase 1: Onboard" style, not "Active"), and the subtitle's type text becomes the **actual project classification** (e.g. "StackShift I"), not the literal `project_type` column value ("Content Site").
4. The gap between the tab strip and the tab's content area is inconsistent — Tasks/Issues (which have their own toolbar bar right under the strip) look right; other tabs (and the current Overview) sit too close to the strip. Normalize the spacing across all tabs to match how Tasks looks today.

### Why the header needs new data, and where it comes from

- **Active phase** — every V2 project on the `customer_phases` engine has phase rows in the `customer_phases` table (`phase_number`, `status`). The existing `_onboarding-detail.tsx` already computes this today (`phases.find(p => p.status === "active")`, `_onboarding-detail.tsx:1885-1886`), and already fetches the raw `phases` array client-side via the existing `GET /api/projects/{project.id}/programme` endpoint (`_onboarding-detail.tsx:1400,1426`, returns `{ programme_started_at, project, phases, deliverables, ... }`). No new API route is needed — Tasks/Issues/etc. (which don't otherwise fetch this) just need to call the same endpoint client-side.
- Not every V2 project is on the `customer_phases` engine — `project.uses_customer_phases_engine` (boolean column, already selected via `select("*")` in `_shared/_get-project-detail-data.ts` since `Project = Database["public"]["Tables"]["projects"]["Row"]`) gates this. For a generic-engine project, or a customer-phases project that hasn't started yet (no row has `status === "active"`), there is no "active phase" to show — fall back to the existing `ProjectStatusBadge` (project status pill) in that case. This fallback is a deliberate scope decision, not a gap to chase further in this task.
- **Classification** — lives on `customer_products.classification` (e.g. `"StackShift I"`, `"PipelineForge"`), joined via `project.customer_product_id`, which is **not** a column on `projects` itself and therefore not already available anywhere Tasks/Issues/etc. read from. `_load-detail-data.ts` (Overview/Timeline's own loader) already does this exact lookup (see Code Context) — the same two-query pattern needs to be added to `_shared/_get-project-detail-data.ts` (the loader Tasks/Issues/Milestones/Files/Access/Members/Status Report/Time Logs all share) so `classification` is available for the header on every tab. Fall back to `project.project_type` when `classification` is `null` (legacy-imported v2 projects with no `customer_product_id`).

## Requirements

- [ ] `/projects-v2/v2/[projectId]` (Overview, bare path) renders the uniform header + an empty "Coming soon" state (icon + heading + one-line message, no action button — there's nothing to act on yet). No swimlane, no programme data fetch.
- [ ] `/projects-v2/v2/[projectId]/timeline` (new route) renders exactly what `/projects-v2/v2/[projectId]` renders today — same `OnboardingDetail` component, same props, same behavior (StackShift swimlane, generic-engine `GenericPhaseView` branch, Wizard, restricted-access screen, not-started/scheduled screens — every existing branch), just under the new path.
- [ ] Tab strip (`_project-detail-tab-strip.tsx`) gains a `"timeline"` entry, positioned second (`Overview, Timeline, Tasks, Issues, Milestones, Files, Access, Members, Status Report, Time Logs`), shown only for `variant="v2"` (same gate as the existing Overview entry — Legacy still has no Overview/Timeline concept).
- [ ] Every V2 tab renders the **same header component**: back link ("All projects"), project name, badge, `{companyName} · {classification|type}` subtitle, action icons (manage collaborators, delete project), tab strip. Tasks/Issues additionally keep their tab-specific "+ New Task"/"+ New Issue" CTA in the header's action-icon row, unchanged.
- [ ] Badge shows the active phase (e.g. "Phase 1: Onboard", styled like the existing phase pill in `_onboarding-detail.tsx:2004-2009` — tinted background + pulsing dot + `Phase {N}: {name}`) for every V2 tab when the project is on the `customer_phases` engine and has an active phase row. Falls back to the existing `ProjectStatusBadge` (project `status` pill) for generic-engine projects or when no phase is currently active (not started, or all phases complete — "Complete" pill already exists for the latter, reuse it).
- [ ] Subtitle shows `{companyName} · {classification}` for every V2 tab when `classification` is available, falling back to `{companyName} · {project.project_type}` when it is not.
- [ ] Legacy detail pages (`variant="legacy"`) are visually unchanged — status badge + `project.project_type` subtitle, no phase pill, no classification lookup performed for them.
- [ ] Spacing between the tab strip and the content area is visually consistent across all nine V2 tabs (and Legacy's eight), matching how Tasks looks today — verified by browser screenshot comparison, not just code inspection.
- [ ] The two self-referential "close wizard, go back" navigations inside `_onboarding-detail.tsx` (currently `router.push(\`/projects-v2/v2/${projectUrlKey}\`, ...)`) point at `/projects-v2/v2/${projectUrlKey}/timeline` once the component lives at that path, so closing the Wizard returns to Timeline, not to the new empty Overview.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors.

## Out of Scope / Must-Not-Change

- `/projects-v2/legacy/[projectId]/*` — no Overview/Timeline concept exists there and none is added. The shared `_project-detail.tsx`/`_project-detail-header.tsx` continue to render the plain status-badge/project_type header for `variant="legacy"`, unchanged.
- `/portfolio-tracker/[projectId]` and `/projects/[projectId]` (the original, pre-276 modules) — untouched, per the standing rule from task 276.
- No new database columns, migrations, or API routes. The active-phase data comes from the existing `GET /api/projects/{id}/programme` endpoint; classification comes from the existing `customer_products` table via the existing lookup pattern already used by `_load-detail-data.ts`.
- No change to the Onboarding Workspace (`/projects-v2/v2/[projectId]/onboarding-workspace`) — it is reached from the phase pill/deliverable clicks inside Timeline content, unchanged.
- Do not attempt full custom-phase-name resolution (`resolveEffectivePhase` against `customer_deliverables`) for the header's phase-name text on Tasks/Issues/etc. — use the static `PROGRAMME_PHASES` name lookup by number (documented simplification below). `_onboarding-detail.tsx`/Timeline keeps using its own existing, fully-resolved `activePhase` computation since it already has that data loaded — no change needed there.
- Do not restructure or trim the existing "Header card" inside `_onboarding-detail.tsx` (owner, collaborators, settings menu, Jump to Phase, Onboarding Workspace button, progress bar) beyond removing the now-redundant bare back-link+tab-strip it currently opens with. That card is Timeline-specific content and stays as page content, now sitting below the new uniform page header instead of at the very top of the page.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/projects-v2/_shared/_project-detail-tab-strip.tsx` | Modify | Add `"timeline"` to `DetailTabId`; add a `TIMELINE_TAB` entry; prepend `[OVERVIEW_TAB, TIMELINE_TAB]` (not just `OVERVIEW_TAB`) when `showOverview` is true |
| `src/app/(hub)/projects-v2/_shared/_project-detail-header.tsx` | Create | Extracted uniform header (back link, title, badge slot, subtitle, action-icons slot, tab strip) — replaces the inline header JSX in `_project-detail.tsx` and the bare `backLink` in `_onboarding-detail.tsx` |
| `src/app/(hub)/projects-v2/_shared/_use-active-phase.ts` | Create | Small client hook: given `projectDbId` + `usesCustomerPhasesEngine`, fetches `/api/projects/{id}/programme`, returns `{ activePhaseNumber, activePhaseName }` (static `PROGRAMME_PHASES` name lookup) or `null` if not applicable/not active. Used by `_project-detail.tsx` and the new Overview page; **not** used by Timeline, which already computes this itself |
| `src/app/(hub)/projects-v2/_shared/_get-project-detail-data.ts` | Modify | Add `classification: string | null` to `ProjectDetailData`/return value, via the same `customer_products` lookup pattern `_load-detail-data.ts` already uses |
| `src/app/(hub)/projects-v2/_shared/_project-detail.tsx` | Modify | Replace inline header JSX (current lines ~446-494) with `<ProjectDetailHeader />`; compute badge (phase pill via `useActivePhase` vs. `ProjectStatusBadge`) and subtitle (classification vs. `project_type`) based on `variant` |
| `src/app/(hub)/projects-v2/v2/[projectId]/_onboarding-detail.tsx` | Modify | Replace the `backLink` const's bare "Back to Projects" + `ProjectDetailTabStrip` with `<ProjectDetailHeader activeTab="timeline" ... />`; change the two self-referential `router.push(\`/projects-v2/v2/${projectUrlKey}\`, ...)` calls (wizard-close) to `.../timeline` |
| `src/app/(hub)/projects-v2/v2/[projectId]/page.tsx` | Modify | Replace `<OnboardingDetail>` render with a new lightweight "coming soon" component behind `<ProjectDetailHeader activeTab="overview" ... />`; switch its data loader from `loadOnboardingDetailData` to `getProjectDetailData` (see note below) |
| `src/app/(hub)/projects-v2/v2/[projectId]/timeline/page.tsx` | Create | Move the current `page.tsx` body here verbatim (same `loadOnboardingDetailData` + `wizardParamsToStepKey` + `<OnboardingDetail activeTab="timeline" .../>`) |
| `src/app/(hub)/projects-v2/v2/[projectId]/_coming-soon-overview.tsx` | Create (or inline in `page.tsx` per CLAUDE.md page-scoped-UI convention — implementer's call) | The empty "Coming soon" state body |

### Overview's loader — deliberate access-model change

`loadOnboardingDetailData` (`_load-detail-data.ts`) applies a role allowlist (`DETAIL_ROLES = ["marketing","admin","super_admin","pm","developer"]`) on top of the customer-visibility check — appropriate when this route rendered the full programme/Wizard content. Once Overview is just a placeholder with no sensitive data, keep it on the same access model as every other V2 tab (`getProjectDetailData` + `isProjectVisibleToCurrentUser`, no extra role gate) rather than carrying the stricter gate over for content that no longer needs it. Timeline, which now owns the real programme content, keeps `loadOnboardingDetailData`'s existing `DETAIL_ROLES` gate unchanged.

## Code Context

### `_project-detail.tsx` — the header being generalized into `_project-detail-header.tsx` (current lines 443-494)

```tsx
return (
  <div className="flex flex-col h-full min-h-0">
    {/* Header */}
    <div className="px-8 pt-6 pb-0 bg-white shrink-0">
      <button onClick={() => router.push(listingHref)} className="... mb-3 ...">
        <ArrowLeft size={14} /> All projects
      </button>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="font-heading text-[22px] font-bold text-[#0B1533] tracking-[-0.02em] truncate">
              {project.name}
            </h1>
            <ProjectStatusBadge status={project.status} />
          </div>
          <p className="text-[13px] text-[#5F6A88] mt-0.5">
            {companyName} · {project.project_type}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <ManageCollaboratorsAction ... />
          <DeleteProjectAction ... />
          {(primaryTab === "tasks" || primaryTab === "issues") && (
            <button ...>+ New Task / + New Issue</button>
          )}
        </div>
      </div>
      <ProjectDetailTabStrip basePath={basePath} activeTab={primaryTab} showOverview={variant === "v2"} />
    </div>
    {/* Content area */}
    <div className="flex-1 min-h-0 overflow-hidden bg-[#F4F6FB] flex flex-col"> ... </div>
```

`ProjectStatusBadge` and `project.project_type` are the two pieces to swap per-variant; `ManageCollaboratorsAction`/`DeleteProjectAction`/the tab-specific CTA button are the "action icons" slot the new header component needs to accept as children/props unchanged.

### `_onboarding-detail.tsx` — existing phase-pill markup to reuse for the header badge (lines 1993-2009)

```tsx
{isComplete ? (
  <span className="inline-flex items-center gap-1 rounded-full bg-[#E3F5EA] px-2.5 py-0.5 text-[11px] font-semibold text-[#177E48]">
    <CheckCircle2 size={11} /> Complete
  </span>
) : (
  <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold", visual.iconBg, visual.iconText)}>
    <span className="h-1.5 w-1.5 animate-pulse motion-reduce:animate-none rounded-full bg-current" />
    Phase {activePhaseNumber}: {activePhase.name}
  </span>
)}
```

`visual` comes from `PHASE_VISUALS[activePhaseNumber] ?? PHASE_VISUALS[1]` — `PHASE_VISUALS` is exported from `_onboarding-detail.tsx` (line 111) and safe to import from `_shared/` (no reverse dependency). Reuse this exact markup/class shape in the new badge; `isComplete`'s "Complete" pill is the natural fallback when `phasesCompleted === totalPhases` — verify how `isComplete` is derived in `_onboarding-detail.tsx` before reimplementing for other tabs (it is **not** the same as "no active phase" — a not-yet-started project also has no active phase but is not complete either; the `ProjectStatusBadge` fallback covers that case for Tasks/Issues/etc., which don't need the full completeness computation).

### `_onboarding-detail.tsx` — the bare header/backLink being replaced (lines 1605-1627)

```tsx
const backLink = (
  <>
    <button type="button" onClick={() => router.push("/projects-v2?tab=v2")} className="...">
      <ArrowLeft size={13} /> Back to Projects
    </button>
    <ProjectDetailTabStrip
      basePath={`/projects-v2/v2/${projectUrlKey}`}
      activeTab="overview"
      showOverview
    />
  </>
);
```
Referenced from every early-return branch in the component (restricted, wizardOpen, generic-engine, not-started, main) — `<ProjectDetailHeader>` replaces this same single const, so every branch picks up the new uniform header for free. `activeTab="overview"` becomes `activeTab="timeline"` once this file backs the `/timeline` route.

### `_onboarding-detail.tsx` — the two self-referential navigations that must move to `/timeline` (lines 1673, 1699)

```tsx
onClick={() => { setWizardOpen(false); router.push(`/projects-v2/v2/${projectUrlKey}`, { scroll: false }); }}
...
router.push(`/projects-v2/v2/${projectUrlKey}`, { scroll: false });
```
Both are inside the Wizard-close flow. Line 1622's `basePath={\`/projects-v2/v2/${projectUrlKey}\`}` passed to the tab strip stays unchanged (it's the shared prefix used to build every *other* tab's link, not a self-link).

### `_load-detail-data.ts` — classification lookup pattern to port into `_shared/_get-project-detail-data.ts` (lines 63-74)

```tsx
// Task 217 — Onboarding Workspace v2's title-row classification chip ("StackShift I" etc.)
// needs the linked customer_products row; a separate lookup (not an embed) since
// customer_product_id has no declared FK relationship name for PostgREST to embed through.
let classification: string | null = null;
if (project.customer_product_id) {
  const { data: product } = await supabase
    .from("customer_products")
    .select("classification")
    .eq("id", project.customer_product_id)
    .maybeSingle();
  classification = product?.classification ?? null;
}
```

### `_onboarding-detail.tsx` — existing programme fetch to reuse in `_use-active-phase.ts` (lines 1398-1418, 1420-1439)

```tsx
fetch(`/api/projects/${project.id}/programme`)
  .then(async (res) => {
    if (!res.ok) throw new Error("Failed to load programme data");
    const data = await res.json();
    setPhases(data.phases ?? []);
    // ...
  });
```
`data.phases` is an array of `CustomerPhaseRow` (`phase_number`, `status`, ...). `activePhaseNumber = phases.find(p => p.status === "active")?.phase_number`. Only call this when `project.uses_customer_phases_engine` is true (mirrors the existing `if (!project.uses_customer_phases_engine) return;` guard at line 1424) — otherwise skip the fetch entirely and let the header fall back to `ProjectStatusBadge`.

### `ProjectDetailTabStrip` — current tabs assembly (`_project-detail-tab-strip.tsx:23-48`)

```tsx
const BASE_TABS: { id: DetailTabId; label: string }[] = [
  { id: "tasks", label: "Tasks" }, { id: "issues", label: "Issues" }, /* ...6 more */
];
const OVERVIEW_TAB: { id: DetailTabId; label: string } = { id: "overview", label: "Overview" };

export function ProjectDetailTabStrip({ basePath, activeTab, showOverview }) {
  const tabs = showOverview ? [OVERVIEW_TAB, ...BASE_TABS] : BASE_TABS;
  // renders pills, onClick -> router.push(tab.id === "overview" ? basePath : `${basePath}/${tab.id}`)
```
Add `TIMELINE_TAB = { id: "timeline", label: "Timeline" }` and change the assembled list to `showOverview ? [OVERVIEW_TAB, TIMELINE_TAB, ...BASE_TABS] : BASE_TABS`. The `onClick` route resolution (`tab.id === "overview" ? basePath : ...`) needs a matching branch so Timeline routes to `${basePath}/timeline` (already covered by the existing `else` branch — only "overview" is special-cased to the bare `basePath`, "timeline" naturally falls through to `${basePath}/timeline` like every other non-overview tab).

## Implementation Steps

1. **Tab strip**: add `"timeline"` to `DetailTabId` and `TIMELINE_TAB`; update the tabs-assembly line. Confirm the `onClick` route resolution needs no change (only `"overview"` is special-cased to the bare `basePath`).
2. **Classification in the shared loader**: port the `customer_products` lookup into `_shared/_get-project-detail-data.ts`, add `classification` to `ProjectDetailData`.
3. **`_use-active-phase.ts` hook**: implement the client hook described above (fetch gated on `usesCustomerPhasesEngine`, static `PROGRAMME_PHASES` name lookup, returns `null` when not applicable or no phase is currently active).
4. **`_project-detail-header.tsx`**: extract the header JSX from `_project-detail.tsx` into this new component. Props: `basePath`, `activeTab: DetailTabId`, `showOverview: boolean` (passed straight to the tab strip), `projectName`, `badge: ReactNode`, `subtitle: string`, and an actions slot (either `children` or explicit props mirroring `ManageCollaboratorsAction`/`DeleteProjectAction`/the CTA button props `_project-detail.tsx` already threads through) plus the `listingHref`/back-link target (`_project-detail.tsx` uses `/projects-v2?tab=v2|legacy`; `_onboarding-detail.tsx` currently hardcodes `/projects-v2?tab=v2` — same value for V2, fine to hardcode `?tab=v2` as the default or accept it as a prop for correctness with `_project-detail.tsx`'s existing per-variant logic).
5. **Wire `_project-detail.tsx`**: replace its inline header with `<ProjectDetailHeader>`, computing badge/subtitle per `variant` (`useActivePhase` + `PHASE_VISUALS` badge vs. `ProjectStatusBadge`; `classification ?? project.project_type` vs. `project.project_type`). Verify Legacy (`variant="legacy"`) renders byte-identical to before (no phase pill, no classification lookup attempted).
6. **Wire `_onboarding-detail.tsx`**: replace the `backLink` const's contents with `<ProjectDetailHeader activeTab="timeline" ...>` (reusing the file's own already-computed `activePhaseNumber`/`activePhase`/`visual`/`isComplete` for the badge — no need for `_use-active-phase.ts` here). Update the two self-referential `router.push` calls to `/timeline`.
7. **Split the route**: create `timeline/page.tsx` with the current `page.tsx` body (unchanged data loading — `loadOnboardingDetailData`, `wizardParamsToStepKey`, `<OnboardingDetail ... />`); update `generateMetadata`'s title suffix if desired (e.g. keep as `${companyName} — Projects V2` or make Timeline-specific — implementer's call, low stakes).
8. **New Overview `page.tsx`**: switch to `getProjectDetailData` (or a trimmed subset — `project`, `companyName`, `classification` are all that's needed; consider whether `getProjectDetailData`'s task/issue/milestone/member fetches are wasteful here and worth trimming into a smaller loader — acceptable either way, note the tradeoff if you keep the full fetch), render `<ProjectDetailHeader activeTab="overview" ...>` + the coming-soon empty state. Check an existing empty-state pattern in the codebase (e.g. Files/Access tabs' "no data" branch, or `_list-view.tsx`'s empty state) before inventing new markup, per CLAUDE.md's "every list/section needs an explicit empty state" convention — this one has no primary action, just icon + heading + one-line message, centered, in a card consistent with `central-hub-design-system.md` panel tokens (white, `--line` border, `--r-lg` radius, `--sh-sm` shadow).
9. **Spacing pass**: with the header now uniform everywhere, compare the gap between the tab strip and content start across all nine V2 tabs against how Tasks looks today (`pnpm dev`, browser screenshots). Adjust the header's bottom spacing (or the content area's top spacing) in `_project-detail-header.tsx`/`_project-detail.tsx`/the new Overview/Timeline pages until they match. This cannot be nailed from static analysis alone — must be verified visually.
10. **Full V2 walkthrough**: log in, open a V2 project on the `customer_phases` engine (verify phase pill + classification on all 9 tabs, Timeline matches old Overview exactly, Wizard close returns to Timeline not Overview) and one on the generic engine (verify `ProjectStatusBadge` fallback badge, `GenericPhaseView` still renders correctly under `/timeline`). Confirm Legacy detail pages are visually unchanged.

## Acceptance Criteria

- [ ] `/projects-v2/v2/[projectId]` shows the uniform header + a "Coming soon" empty state, nothing else.
- [ ] `/projects-v2/v2/[projectId]/timeline` renders everything the old bare `page.tsx` rendered (swimlane, generic-engine view, Wizard, restricted/not-started/scheduled screens), byte-identical in content to before, just under the new path and new header.
- [ ] Tab strip on every V2 tab reads: Overview, Timeline, Tasks, Issues, Milestones, Files, Access, Members, Status Report, Time Logs — Timeline second, right after Overview.
- [ ] Every V2 tab's header badge shows "Phase N: {name}" for an in-progress customer-phases project, "Complete" once finished, and the existing `ProjectStatusBadge` for a generic-engine project or one that hasn't started.
- [ ] Every V2 tab's header subtitle shows `{companyName} · {classification}` when a classification exists, `{companyName} · {project_type}` otherwise.
- [ ] Legacy detail pages are visually unchanged (status badge + project_type subtitle, no Overview/Timeline tabs).
- [ ] Closing the Wizard (from `/timeline`) returns to `/projects-v2/v2/[projectId]/timeline`, not the bare Overview.
- [ ] Tab-to-content spacing looks consistent across all nine V2 tabs when compared side by side, matching Tasks' current look.
- [ ] `npx tsc --noEmit` passes with no new errors.
- [ ] `pnpm lint` passes with no new errors.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev   # then browser-test per the walkthrough in Implementation Step 10
```
Browser-based acceptance testing is required (per CLAUDE.md — no test runner configured): the spacing fix (requirement 4) and the phase-pill/classification header (requirement 3) are both visual changes that cannot be confirmed correct from code alone.

## Compatibility Touchpoints

- `_docs/mcp-tools.md` — not affected (no new `server.registerTool` calls).
- No new env vars, no DB migration, no new API routes.
- `role-access.ts` — no change; Overview's loosened access model (dropping the `DETAIL_ROLES` gate, see note above) is a page-level change inside `page.tsx`, not a `role-access.ts` change, and still passes through `isProjectVisibleToCurrentUser`.

## Implementation Notes

### What Changed

- **Tab strip**: `_project-detail-tab-strip.tsx` — added `"timeline"` to `DetailTabId`, a `TIMELINE_TAB` entry, tabs now assemble as `[OVERVIEW_TAB, TIMELINE_TAB, ...BASE_TABS]` when `showOverview` is true (v2 only; Legacy unchanged).
- **Uniform header**: new `_shared/_project-detail-header.tsx` — back link ("All projects"), title, badge (phase pill for v2 with an active phase / "Complete" pill / `ProjectStatusBadge` fallback for generic-engine or not-yet-active projects and all of Legacy), subtitle, an optional `actions` slot, and the tab strip. `pb-4` (was `pb-0`) is the tab/content spacing fix — applied once here so it's uniform across every tab automatically, including the ones (Milestones/Files/Access/Members/Status Report/Time Logs/Overview/Timeline) that don't have Tasks/Issues' own toolbar band underneath.
- **Phase-pill data**: new `_shared/_use-active-phase.ts` client hook — fetches the existing `GET /api/projects/{id}/programme` endpoint (gated on `usesCustomerPhasesEngine`), resolves the active phase number to a name via a static `PROGRAMME_PHASES` lookup (not the fuller `resolveEffectivePhase`/custom-phase resolution — documented simplification). Used by `_project-detail.tsx` (Tasks/Issues/Milestones/Files/Access/Members/Status Report/Time Logs) and the new Overview page. Timeline (`_onboarding-detail.tsx`) computes the same thing inline from its own already-loaded `phases` state instead (no extra fetch needed there).
- **Classification data**: `_shared/_get-project-detail-data.ts` — added a `classification` field (same `customer_products` lookup pattern `_load-detail-data.ts` already used), threaded through to `_project-detail.tsx`'s header subtitle. `_load-detail-data.ts` (Timeline's own loader) — added `status`/`project_type` to its `select()` and returned `project` object (previously unfetched there, needed for the header's fallback badge/subtitle) and typed both plus the already-fetched-but-previously-untyped `classification` onto `OnboardingDetailProps.project`.
- **Overview → "coming soon"**: `page.tsx` rewritten — switched from `loadOnboardingDetailData` to `getProjectDetailData` (deliberate access-model loosening, see task doc note — Overview has no sensitive content left to justify the stricter `DETAIL_ROLES` gate) and now renders a new client component, `_coming-soon-overview.tsx` (uniform header + a centered "Coming soon" empty state, icon + heading + one-line message, styled per the codebase's existing empty-state/panel conventions).
- **Timeline route**: new `timeline/page.tsx` — the bare `page.tsx`'s old body moved here verbatim (same `loadOnboardingDetailData` + `wizardParamsToStepKey` + `<OnboardingDetail>`). `_onboarding-detail.tsx`'s `backLink` const (referenced from every one of its early-return branches) now renders `<ProjectDetailHeader activeTab="timeline" variant="v2" ...>` instead of the old bare "Back to Projects" button + tab strip.
- **Self-referential navigation fixes**: 5 call sites that pushed to the bare `/projects-v2/v2/{id}` URL (expecting the old Overview/swimlane) now push to `/projects-v2/v2/{id}/timeline` instead, since that URL is now the "coming soon" placeholder: `_onboarding-detail.tsx`'s two Wizard-close handlers, `_onboarding-wizard.tsx`'s step-URL-sync effect, `onboarding-workspace/_onboarding-wizard-v2.tsx`'s "Back to Onboarding Timeline" button, `onboarding-workspace/_workspace-header.tsx`'s "Back to Tracker" link.

### Files Changed

- `src/app/(hub)/projects-v2/_shared/_project-detail-tab-strip.tsx` — added Timeline tab
- `src/app/(hub)/projects-v2/_shared/_project-detail-header.tsx` — new, uniform header component
- `src/app/(hub)/projects-v2/_shared/_use-active-phase.ts` — new, client hook for the phase-pill badge
- `src/app/(hub)/projects-v2/_shared/_get-project-detail-data.ts` — added `classification`
- `src/app/(hub)/projects-v2/_shared/_project-detail.tsx` — replaced inline header with `<ProjectDetailHeader>`, wired `useActivePhase`/classification; removed now-unused `ArrowLeft`/`ProjectStatusBadge` imports
- `src/app/(hub)/projects-v2/v2/[projectId]/_load-detail-data.ts` — added `status`/`project_type` to the query and returned `project`
- `src/app/(hub)/projects-v2/v2/[projectId]/_onboarding-detail.tsx` — typed `status`/`project_type`/`classification` on `OnboardingDetailProps.project`; replaced `backLink`'s bare header with `<ProjectDetailHeader>`; fixed 2 self-referential `router.push` calls
- `src/app/(hub)/projects-v2/v2/[projectId]/page.tsx` — rewritten as the "coming soon" Overview
- `src/app/(hub)/projects-v2/v2/[projectId]/_coming-soon-overview.tsx` — new, Overview's body
- `src/app/(hub)/projects-v2/v2/[projectId]/timeline/page.tsx` — new, moved from the old bare `page.tsx`
- `src/app/(hub)/projects-v2/v2/[projectId]/_onboarding-wizard.tsx` — fixed self-referential push
- `src/app/(hub)/projects-v2/v2/[projectId]/onboarding-workspace/_onboarding-wizard-v2.tsx` — fixed self-referential push
- `src/app/(hub)/projects-v2/v2/[projectId]/onboarding-workspace/_workspace-header.tsx` — fixed self-referential href
- `TASKS.md` — moved 277 Planned → In Progress → Testing

### Deviations From Plan

- **`actions` (ManageCollaboratorsAction/DeleteProjectAction icon buttons) omitted from Overview's and Timeline's headers**, though the task doc's Requirements listed them as part of "every V2 tab." Timeline's own body already has a fuller Settings dropdown (Set Owner/Manage Collaborators/Delete/Jump to Phase) inside its "Header card," and Overview has nothing to act on — adding the same two icon buttons a second time at the very top of Timeline would have meant two different delete/collaborator-management entry points for the exact same project. Judged confusing/redundant UI rather than following the doc literally; the header's `actions` prop still exists and is used by Tasks/Issues/Milestones/Files/Access/Members/Status Report/Time Logs.
- **`PHASE_BADGE_STYLE` in `_project-detail-header.tsx` is an independent, small copy of `_onboarding-detail.tsx`'s `PHASE_VISUALS` hex values** (just the two classes the badge needs), rather than importing `PHASE_VISUALS` directly — `_onboarding-detail.tsx` now imports `ProjectDetailHeader` from `_shared/`, so importing back from `_onboarding-detail.tsx` into `_shared/` would have created a circular import between the two files. Flagged in the task doc as an implementer's call; picked the safer option.
- **Back-link wording standardized to "All projects"** (was "Back to Projects" on the old Overview/Timeline header) — direct consequence of using one shared header component; not called out explicitly in the task doc's Requirements but implied by "uniform header."

### Verification Run

- `npx tsc --noEmit` — PASS (0 errors)
- `pnpm lint` — PASS (0 errors; 4 pre-existing warnings, unrelated — same 2 unused-var warnings in both the untouched `portfolio-tracker` `_checklist-tab.tsx` and its already-existing v2 port)
- Browser walkthrough (Claude-in-Chrome, against the user's own already-running `pnpm dev` on localhost:3000, logged in as Super Admin) — PASS:
  - **Glorias Anzac Biscuits August 2026 Revamp** (StackShift I, customer_phases engine, Phase 1 active) — Overview shows uniform header + "Coming soon" card; Timeline shows the same header (with "Phase 1: Onboard" pill + "StackShift I" subtitle) followed by the full swimlane content, byte-identical to the old Overview; Tasks/Issues/Milestones/Files/Access/Members/Status Report/Time Logs all show the same header with the phase pill and classification; Onboarding Workspace → "Back to Tracker" correctly lands on `/timeline`.
  - **ABC Test Company Gantt** (Discrete Development, generic engine) — header badge correctly falls back to `ProjectStatusBadge` ("Active") on both Overview and Timeline, since there's no phase concept; `GenericPhaseView`'s own content renders unaffected under the new header; classification subtitle ("Discrete Development") still correct.
  - **RCB & Associates** (Legacy) — confirmed unchanged: `ProjectStatusBadge` + `project_type` subtitle, 8 tabs (no Overview/Timeline), same visual layout as before this task.
  - Noted, not a bug: on a fresh full page load, the badge briefly shows the `ProjectStatusBadge` fallback before the client-side `/programme` fetch resolves to the phase pill (a few hundred ms) — expected given the hook's design (graceful fallback while loading), not fixed further.
- **Not verified in this pass**: drag-to-reorder of the tab strip itself is unaffected by this task (untouched code) and wasn't re-tested; a full authenticated walkthrough of every remaining V2/Legacy project variant (e.g. StackShift II, PipelineForge, Access/Access Plus) was not exhaustively repeated — spot-checked one customer-phases project and one generic-engine project, which cover the two branches the header's fallback logic depends on.
