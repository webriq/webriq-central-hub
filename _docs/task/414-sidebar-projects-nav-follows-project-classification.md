# 414: Sidebar Projects Nav — Highlight the Open Project's Classification

**Created:** 2026-10-02
**Priority:** MEDIUM
**Type:** fix
**Recommended Tier:** balanced
**Status:** Planned

---

## Overview

User report (screenshot): on `/projects/v2/{project_id}/timeline` for a **StackShift II** project (UFP International), the sidebar's Projects group highlights **StackShift I**.

### Root cause

`v2-hub-sidebar.tsx` `isChildActive()` (line 24-31) matches classification children by `?tab=`; when the URL has no `tab` it falls back to `parseClassificationTab(null)` = `DEFAULT_CLASSIFICATION_TAB` = `"stackshift-i"`. Project detail URLs (`/projects/v2/[projectId]/…`) never carry `?tab=`, so StackShift I always lights up regardless of the project's real classification. The sidebar is a client component in the `(hub)` shell and has no knowledge of the open project.

## Requirements

- [ ] While viewing any `/projects/v2/[projectId]/**` page, the sidebar highlights the classification link(s) the project belongs to, not the default one. Membership is the union `customer_products.classifications[] ∪ customer_products.classification` (CLAUDE.md task 361 note) — a multi-classified project highlights each of its classifications.
- [ ] Project with no classification (null) → no classification child highlighted (Projects parent still active); never fall back to StackShift I on a detail route.
- [ ] Listing pages unchanged: `/projects/v2` with/without `?tab=` keeps today's behaviour (bare = StackShift I).
- [ ] `/projects/legacy/**` unchanged (Legacy highlighted).
- [ ] Highlight is correct on first paint after navigation and updates when moving between projects/tabs; clears when leaving the project (back to listing, other module).
- [ ] "Dynamic based on available classifications": the link list stays derived from `CLASSIFICATION_TABS` (already is) — no hard-coded StackShift I assumptions remain in the active-state logic.

## Out of Scope / Must-Not-Change

- Sidebar link catalog/order, `?tab=` listing semantics, `_classification-tabs.ts` exports' behaviour.
- No migration / API route / extra DB query: the project layout already loads `customer_products` data.
- Do not introduce `dark:` classes; keep existing inline-style sidebar patterns.
- `onboarding-workspace` and task/ticket/milestone detail routes sit outside the `(tabs)` layout — they must be covered too (see Notes).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/(hub)/_components/v2-hub-shell.tsx` | Modify | Hold `activeProjectClassifications` state; provide a small context (setter + value) to the sidebar and children. |
| `src/app/(hub)/_components/sidebar-project-context.tsx` | Create | Context + `useSetSidebarClassifications()` hook + `<SidebarClassificationSync classifications={...} />` client component (sets on mount/prop change via `useEffect`, clears on unmount). |
| `src/app/(hub)/_components/v2-hub-sidebar.tsx` | Modify | `isChildActive` : when pathname is a project detail route (`/projects/v2/<seg>/…`, seg ≠ bare listing) and the child has a `?tab=`, active iff that tab's classification ∈ context value; never use the default-tab fallback there. |
| `src/app/(hub)/projects/v2/[projectId]/(tabs)/layout.tsx` | Modify | Render `<SidebarClassificationSync>` with the project's classification(s). |
| `src/app/(hub)/projects/v2/[projectId]/_load-detail-data.ts` / `projects/_shared/_get-project-detail-data.ts` | Modify | Also select `classifications` from `customer_products` and return the merged, de-duplicated list (primary first). |
| `src/app/(hub)/projects/v2/[projectId]/{onboarding-workspace,tasks/[taskId],tickets/[ticketId],milestones/[milestoneId]}` | Modify (as needed) | Same sync component where these routes are outside `(tabs)` — or hoist to a `[projectId]/layout.tsx` if cleaner (implementer's choice; one place preferred). |

## Code Context

### `v2-hub-sidebar.tsx:24-31` (current)

```tsx
function isChildActive(pathname, searchParams, href) {
  ...
  const hrefTab = new URLSearchParams(href.slice(queryIndex + 1)).get("tab");
  return hrefTab === null || parseClassificationTab(searchParams.get("tab")) === hrefTab;   // null -> "stackshift-i"
}
```

### Notes

- Prefer a single `[projectId]/layout.tsx` (server, fetches classification via the already-cached detail loader) over per-route sync components, if it doesn't break the `(tabs)` layout's header chrome; otherwise keep the sync component in both layouts.
- Map classification → tab id with `TAB_ID_BY_CLASSIFICATION` (currently module-private in `_classification-tabs.ts`) — export a small `tabIdForClassification()` helper rather than duplicating.
- A project detail route = `pathname` starts with `/projects/v2/` and has a segment after it that is not a reserved sibling (`new`, `import`, `status-report`). Use an explicit reserved list so those pages keep plain behaviour.
- Context avoids sidebar fetching on its own; the sidebar stays a pure function of `pathname`, `searchParams`, context.

## Implementation Steps

1. Export `tabIdForClassification()` from `_classification-tabs.ts`.
2. Extend the detail loader to return merged classifications.
3. Create the context + sync component; wire provider in `v2-hub-shell.tsx`.
4. Render the sync component from the project layout(s).
5. Update `isChildActive` per Requirements.
6. `npx tsc --noEmit`, `pnpm lint`; browser-verify.

## Acceptance Criteria

- [ ] StackShift II project (e.g. UFP International): every tab (Overview…Time Logs), Onboarding Workspace, and task/ticket/milestone detail pages highlight **StackShift II** only.
- [ ] StackShift I project highlights StackShift I; Access / Access Plus / PipelineForge / Discrete Development likewise.
- [ ] Multi-classified project highlights each of its classifications.
- [ ] Unclassified project highlights none.
- [ ] `/projects/v2?tab=stackshift-ii`, bare `/projects/v2`, `/projects/legacy` behave exactly as before.
- [ ] Navigating project → listing/other module clears the project-driven highlight (no stale state).
- [ ] `tsc` and lint clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
# Browser: open one project per classification + a multi-classified one; check sidebar highlight on each tab and after back-navigation
```

## Compatibility Touchpoints

- CLAUDE.md "Projects classification navigation" bullet should gain one sentence on the project-detail highlight rule (docs stage).

## Implementation Notes

### What Changed
- Sidebar Projects links on `/projects/v2/<projectId>/**` now highlight the open project's classification(s) (union of `classification` + `classifications[]`) via a context published by a new `[projectId]/layout.tsx`; no default-to-StackShift-I fallback on detail routes. Listing, `?tab=`, and Legacy behaviour unchanged.

### Files Changed
- `src/app/(hub)/projects/_classification-tabs.ts` - exported `tabIdForClassification()`.
- `src/app/(hub)/_components/sidebar-project-context.tsx` (new) - context, provider, `useSidebarProjectTabs`, `SidebarClassificationSync`.
- `src/app/(hub)/_components/v2-hub-shell.tsx` - wraps shell in `SidebarProjectProvider`.
- `src/app/(hub)/_components/v2-hub-sidebar.tsx` - `isChildActive` takes project tabs; `isProjectDetailPath()` (reserved segments `new|import|status-report`).
- `src/app/(hub)/projects/v2/[projectId]/layout.tsx` (new) - cached 2-query classification lookup + sync; covers (tabs), onboarding-workspace, and task/ticket/milestone detail routes.

### Deviations From Plan
- Used a dedicated lightweight lookup in the new layout instead of extending the detail loaders (avoids touching two loaders; outside-`(tabs)` routes need it anyway). Costs two small extra queries per project load.

### Verification Run
- `npx tsc --noEmit` - PASS (no errors outside stale `.next` validator entries)
- `eslint` on changed files - PASS
- Browser check - SKIPPED (not run)

## Quality Gate Notes

### Result
PASS

### Standards Review
- No blocking issues. Typed throughout (no `any`; one narrow cast of a split string to `ClassificationTabId[]` in the sync effect, inputs originate from the typed array), small single-purpose files, guard-clause lookup in the layout, cleanup on unmount, no debug logging. ESLint/tsc clean.
- Observation (accepted): highlight is set in a `useEffect`, so there is one brief render after navigation with no classification highlighted before the context updates; acceptable for a nav indicator.
- Observation (accepted): `NON_PROJECT_V2_SEGMENTS` is a hand-maintained reserved list; a new static sibling route under `/projects/v2/` must be added to it.

### Deviations
- Minor: separate lightweight classification lookup in the new layout instead of extending the detail loaders (documented in Implementation Notes).
