# 222: Swimlane Items Redirect to Onboarding Workspace (Not Wizard) + URL Params for Tabs/Folders

**Created:** 2026-08-07
**Priority:** HIGH
**Type:** enhancement
**Recommended Tier:** balanced
**Status:** Testing

---

## Overview

The Phase 1 Onboarding Timeline's swimlane (`_onboarding-detail.tsx`'s `Swimlane`/`DeliverableCard`) currently opens each of the 7 deliverables inline in the old **Onboarding Wizard** (`_onboarding-wizard.tsx`, opened via `wizardOpen` state + `?phase=&deliverable=` URL params). The **Onboarding Workspace** (`onboarding-workspace/_onboarding-wizard-v2.tsx`, route `/v2/portfolio-tracker/[projectId]/onboarding-workspace`) is the newer tabbed rebuild (Business Info / Files / Access / Checklist) and already has its own "Onboarding Workspace" entry button on the Timeline — but that button always lands on the default `business-info` tab with nothing pre-selected.

This task:
1. Re-points every swimlane deliverable card's click target from the old inline Wizard to the Workspace route, landing on a specific tab (and, for file-backed deliverables, a specific root-level Files folder) per deliverable.
2. Adds URL query params (`?tab=&parent_folder=&sub_folder_l1=&sub_folder_l2=...`) to the Workspace so any tab/folder location is directly linkable, and keeps those params in sync as the user navigates tabs/folders inside the Workspace itself (not just on initial load).
3. Renames the "Migration Checklist" deliverable's backing system folder from `Checklist` to `Migration Checklist` (folder name only — the deliverable's display name and `key` are already correct) so the Files-tab folder name matches what the swimlane item is labeled.

Per-deliverable mapping (deliverable `key` from `src/config/customer-phases.ts` phase 1 → Workspace target):

| Swimlane item | Deliverable key | Workspace target |
|---|---|---|
| Kickoff | `kickoff` | `tab=business-info` (no folder — Business Info is Kickoff-only, see `_business-info-tab.tsx:51-54`) |
| Outcome Target | `outcome-target` | `tab=files&parent_folder=Outcome Target` |
| Migration Checklist | `migration-checklist` | `tab=files&parent_folder=Migration Checklist` (folder renamed from `Checklist` — see below) |
| 90-day content map | `content-map` | `tab=files&parent_folder=Content Map` |
| HTML Mockup | `html-mockup` | `tab=files&parent_folder=HTML Mockup` |
| Storage Folder + KB | `storage-kb` | `tab=files` (root — no single folder maps to this deliverable) |
| Client call — sign-off | `client-signoff` | `tab=files&parent_folder=Notes` |

## Requirements

- [ ] Clicking any swimlane deliverable card navigates to `/v2/portfolio-tracker/[projectId]/onboarding-workspace` (not the inline `_onboarding-wizard.tsx`), with the tab/folder query params above.
- [ ] The Workspace page reads `?tab=` on load and opens that tab; reads `?parent_folder=&sub_folder_l1=&sub_folder_l2=...` and opens that folder path in the Files tab once folders have loaded.
- [ ] `?tab=` values are the existing `WizardTabKey` strings (`business-info`, `files`, `access`, `checklist`) — not display labels.
- [ ] `parent_folder`/`sub_folder_lN` values are folder **names** (not IDs), matched case-sensitively against root-level (`parent_folder`) then successively nested folders — supports arbitrary depth (`sub_folder_l1`, `sub_folder_l2`, `sub_folder_l3`, …), not just two levels, since folders can already nest arbitrarily deep (task 220).
- [ ] Navigating tabs or folders **from inside** the Workspace (tab bar, folder tiles, breadcrumbs, "Go to Notes folder", "Attach from Files") updates the URL to match, without a full page reload/data refetch (see Implementation Steps — use `history.replaceState`, not `router.push/replace`).
- [ ] The `Checklist` system folder (`SYSTEM_FOLDER_TREE` in `assets/folders/route.ts`) is renamed to `Migration Checklist` for all **future** provisioning, and a migration renames existing rows so already-onboarded projects' folders pick up the new name too.
- [ ] `ChecklistTab`'s "Attach from Files" evidence link for `implementation-file` points at the renamed folder.

## Out of Scope / Must-Not-Change

- The old inline Onboarding Wizard (`_onboarding-wizard.tsx`), its `wizardOpen` state, and the existing `?phase=&deliverable=` deep-link scheme (`_wizard-step-params.ts`, `page.tsx`'s `initialWizardStepKey`) stay as-is — they remain reachable by a direct/bookmarked URL hit on `/v2/portfolio-tracker/[projectId]?phase=&deliverable=`, just no longer reachable via swimlane clicks. Do not delete or refactor that code path.
- The existing plain "Onboarding Workspace" / "View Onboarding Workspace" CTA button (`_onboarding-detail.tsx:1681-1691`, navigates to the bare `/onboarding-workspace` URL with no params) is untouched.
- No changes to `_files-tab.tsx`'s own internal breadcrumb-building logic (`breadcrumbChain` memo) — the new URL-sync effect lives in the parent (`_onboarding-wizard-v2.tsx`) and computes its own name-path from `folders` + `openFolderId` independently, to avoid coupling to `_files-tab.tsx`'s props/exports.
- No change to deliverable `key`/`name` values in `src/config/customer-phases.ts` — only the *folder* name changes, not the deliverable config.
- Renaming `Checklist` → `Migration Checklist` is a folder-name-only change. Do not touch `LABEL_TO_SYSTEM_FOLDER`'s other entries, `SYSTEM_FOLDER_TREE`'s other nodes, or `Business Files`' sub-folders.

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/onboarding-workspace/_workspace-url-params.ts` | Create | Deliverable→Workspace-target map, URL param parse/build helpers, folder-path↔folder-id resolution helpers |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/onboarding-workspace/page.tsx` | Modify | Accept `searchParams`, parse via the new helper, pass `initialTab`/`initialFolderPath` to `OnboardingWizardV2` |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/onboarding-workspace/_onboarding-wizard-v2.tsx` | Modify | Accept `initialTab`/`initialFolderPath` props; resolve folder path to `openFolderId` once folders load; sync `tab`/`openFolderId` back to the URL via `history.replaceState` on every change |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` | Modify | `handleOpenWizardStep` navigates to the Workspace URL (deliverable→target map) instead of opening the inline Wizard; drop now-unused `stepKeyToWizardParams`/`FIRST_WIZARD_STEP_PARAMS` import |
| `src/app/api/customers/[customerId]/assets/folders/route.ts` | Modify | `SYSTEM_FOLDER_TREE`: `"Checklist"` → `"Migration Checklist"`; `LABEL_TO_SYSTEM_FOLDER["Migration Checklist"]`: `"Checklist"` → `"Migration Checklist"` |
| `src/app/v2/(hub)/portfolio-tracker/[projectId]/onboarding-workspace/_checklist-tab.tsx` | Modify | `EVIDENCE_LINKS["implementation-file"].folderName`: `"Checklist"` → `"Migration Checklist"` |
| `supabase/migrations/098_rename_checklist_folder.sql` | Create | Rename existing `customer_asset_folders` rows named `Checklist` (system folders) to `Migration Checklist` |

## Code Context

### `src/config/customer-phases.ts` — Phase 1 deliverable keys (already correct, no edits needed)

```ts
{ key: "kickoff", name: "Kickoff", ... },
{ key: "outcome-target", name: "Outcome target", ... },
{ key: "migration-checklist", name: "Migration checklist", ... },
{ key: "content-map", name: "90-day content map", ... },
{ key: "html-mockup", name: "HTML mockup", ... },
{ key: "storage-kb", name: "Storage folder + KB", ... },
{ key: "client-signoff", name: "Client call — sign-off", ... },
```

### `src/app/api/customers/[customerId]/assets/folders/route.ts` — folder name source of truth

```ts
const LABEL_TO_SYSTEM_FOLDER: Record<string, string> = {
  "Business Facts": "Business Files",
  "Documents": "Business Files",
  "Outcome Target": "Outcome Target",
  "Migration Checklist": "Checklist",        // → change value to "Migration Checklist"
  "Content Map": "Content Map",
  "HTML Mockup": "HTML Mockup",
  "Mockup Build Spec": "HTML Mockup",
};

const SYSTEM_FOLDER_TREE: { name: string; children?: string[] }[] = [
  { name: "Business Files", children: ["Branding", "Proposals", "Collateral"] },
  { name: "Outcome Target" },
  { name: "Checklist" },                     // → change to { name: "Migration Checklist" }
  { name: "Content Map" },
  { name: "HTML Mockup" },
  { name: "Other" },
];
```

`customer_asset_folders` has `unique (customer_id, project_id, phase_number, parent_folder_id, name)` (migration 065). The rename migration is a straight `UPDATE ... SET name = 'Migration Checklist' WHERE name = 'Checklist' AND is_system = true` — flag (don't silently swallow) any row that would collide with an existing non-system `Migration Checklist` folder in the same scope; this should be rare (system folders are created before users can name their own) but the migration should not error the whole batch over one colliding row.

### `onboarding-workspace/_wizard-v2-types.ts` — the tab enum and folder shape to reuse

```ts
export type WizardTabKey = "business-info" | "files" | "access" | "checklist";

export type AssetFolder = {
  id: string;
  parent_folder_id: string | null;
  name: string;
  // ...
};
```

### `onboarding-workspace/_onboarding-wizard-v2.tsx` — current tab/folder state (no URL involvement today)

```tsx
export default function OnboardingWizardV2({ project, role }: { project: WizardV2Project; role: string | null }) {
  const router = useRouter();
  const [tab, setTab] = useState<WizardTabKey>("business-info");
  ...
  const [openFolderId, setOpenFolderId] = useState<string | null>(null);
  ...
  const openFolderByName = useCallback((name: string) => {
    const folder = folders.find((f) => f.name === name && f.parent_folder_id === null);
    setTab("files");
    setOpenFolderId(folder?.id ?? null);
  }, [folders]);
  ...
  <WorkspaceHeader ... tab={tab} onTabChange={setTab} ... />
  ...
  {tab === "files" && <FilesTab ... openFolderId={openFolderId} onOpenFolder={setOpenFolderId} ... />}
```

`FilesTab`'s `onOpenFolder` prop is called directly by folder-tile clicks and breadcrumb clicks (`_files-tab.tsx:227,238,321,354`) — wiring the URL-sync effect off `tab`/`openFolderId` state changes in the parent (rather than threading a callback through every click site) covers all of these automatically, including `openFolderByName` (used by `BusinessInfoTab`'s "Go to Notes folder" and `ChecklistTab`'s "Attach from Files").

### `onboarding-workspace/page.tsx` — current entry point (task 202 comment to update)

```tsx
// Task 202 sandbox entry point ... No `?phase=&deliverable=` deep-link handling here: out of
// scope for this pass (see task doc).
export default async function OnboardingProjectV2Page({ params }: PageProps) {
  const { projectId } = await params;
  const { project, role } = await loadOnboardingDetailData(projectId);
  return <OnboardingWizardV2 project={project} role={role} />;
}
```

Mirror the sibling route's existing `searchParams` pattern exactly (`_onboarding-detail.tsx`'s `page.tsx`):

```tsx
interface PageProps {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ phase?: string; deliverable?: string }>;
}
export default async function OnboardingProjectPage({ params, searchParams }: PageProps) {
  const { projectId } = await params;
  const { phase, deliverable } = await searchParams;
  const initialWizardStepKey = wizardParamsToStepKey(...);
  return <OnboardingDetail project={project} initialWizardStepKey={initialWizardStepKey} ... />;
}
```

### `_onboarding-detail.tsx` — the function to change

```tsx
const handleOpenWizardStep = (deliverableKey: string) => {
  setWizardStartStepKey(deliverableKey);
  setWizardOpen(true);
  const stepParams = stepKeyToWizardParams(deliverableKey) ?? FIRST_WIZARD_STEP_PARAMS;
  router.push(`${V2_ROUTES.PORTFOLIO_TRACKER}/${projectUrlKey}?phase=${stepParams.phase}&deliverable=${stepParams.deliverable}`, { scroll: false });
};
```

This is the **only** call site for `onOpenWizardStep` (confirmed via grep — `Swimlane` → `DeliverableCard.onOpenWizardStep` → this function; both the card's main click and its expanded-panel "Open" button route through the same prop). `projectUrlKey` (`= project.project_id ?? project.id`, line 1014) and `V2_ROUTES` are already in scope. The existing "Onboarding Workspace" button (line 1685) already proves the target path shape: `` `${V2_ROUTES.PORTFOLIO_TRACKER}/${projectUrlKey}/onboarding-workspace` ``.

### `_checklist-tab.tsx` — evidence link to update

```ts
const EVIDENCE_LINKS: Record<string, { tab: "files" | "access"; folderName?: string }> = {
  "implementation-file": { tab: "files", folderName: "Checklist" },   // → "Migration Checklist"
  "credentials-external": { tab: "access" },
};
```

## Implementation Steps

1. **Folder rename (do first — other steps depend on the final name):**
   - In `assets/folders/route.ts`, change `SYSTEM_FOLDER_TREE`'s `{ name: "Checklist" }` → `{ name: "Migration Checklist" }`, and `LABEL_TO_SYSTEM_FOLDER["Migration Checklist"]`'s value from `"Checklist"` to `"Migration Checklist"`.
   - Update `_checklist-tab.tsx`'s `EVIDENCE_LINKS["implementation-file"].folderName` to `"Migration Checklist"`.
   - Write `supabase/migrations/098_rename_checklist_folder.sql`: `UPDATE customer_asset_folders SET name = 'Migration Checklist' WHERE name = 'Checklist' AND is_system = true AND parent_folder_id IS NULL;` — guard against the unique-constraint edge case noted above (e.g. `ON CONFLICT`-safe approach or a pre-check `NOT EXISTS` clause per row) so one colliding project doesn't fail the whole migration.

2. **Create `_workspace-url-params.ts`** in `onboarding-workspace/` with:
   - `DELIVERABLE_WORKSPACE_TARGET: Record<string, { tab: WizardTabKey; folderPath?: string[] }>` — the 7-row table from the Overview section (keyed by `customer-phases.ts` deliverable `key`, using `"Migration Checklist"` as the folder name).
   - `parseWorkspaceSearchParams(searchParams): { tab: WizardTabKey; folderPath: string[] }` — validates `tab` against the `WizardTabKey` union (default `"business-info"` if missing/invalid); builds `folderPath` from `parent_folder` then a contiguous scan of `sub_folder_l1`, `sub_folder_l2`, … stopping at the first gap.
   - `buildWorkspaceQueryString(tab, folderPath?): string` — inverse of the above, via `URLSearchParams` (so folder names with spaces are encoded correctly).
   - `resolveFolderPath(folders, path: string[]): string | null` — walks the name path root-first (`parent_folder_id === null` for the first name, then each subsequent name scoped to the previous match's id), returns the deepest resolved folder id (or `null` if the first name doesn't match anything).
   - `folderNamePath(folders, folderId): string[]` — inverse: walks `parent_folder_id` up from `folderId` to root, returns the root-to-leaf name array (`[]` for `null`).

3. **`onboarding-workspace/page.tsx`**: add `searchParams: Promise<{ tab?: string; parent_folder?: string; [key: string]: string | undefined }>` to `PageProps`, `await` and parse it with `parseWorkspaceSearchParams`, pass `initialTab`/`initialFolderPath` to `<OnboardingWizardV2>`. Update the stale "no deep-link handling" comment.

4. **`_onboarding-wizard-v2.tsx`**:
   - Add `initialTab?: WizardTabKey; initialFolderPath?: string[]` props; seed `useState<WizardTabKey>(initialTab ?? "business-info")`.
   - Add a `useRef` guard (e.g. `initialFolderApplied`) + `useEffect` keyed on `[loading, folders]`: once `!loading`, call `resolveFolderPath(folders, initialFolderPath ?? [])`; only commit it (`setTab("files")`, `setOpenFolderId(resolvedId)`, mark the ref applied) once `folderNamePath(folders, resolvedId).length === initialFolderPath.length` (i.e. the *whole* path resolved) — this naturally waits out the async "Notes" folder auto-create (lines 86-98) instead of racing it, since that effect appends the new folder into `folders` state and re-triggers this one.
   - Add a second `useEffect` keyed on `[tab, openFolderId, folders, loading]`: once `!loading`, compute `buildWorkspaceQueryString(tab, folderNamePath(folders, openFolderId))` and call `window.history.replaceState(null, "", `${window.location.pathname}?${qs}`)`. **Use the native History API, not `router.replace`** — this page is `force-dynamic`, and a Next.js router navigation on every folder click would re-run the server component (`loadOnboardingDetailData`) on every click; `history.replaceState` updates the URL bar with zero data refetch and no risk to already-mounted local state (see Next.js docs on using the native History API for shallow URL updates).

5. **`_onboarding-detail.tsx`**:
   - Import `DELIVERABLE_WORKSPACE_TARGET` and `buildWorkspaceQueryString` from `./onboarding-workspace/_workspace-url-params`.
   - Rewrite `handleOpenWizardStep`:
     ```tsx
     const handleOpenWizardStep = (deliverableKey: string) => {
       const target = DELIVERABLE_WORKSPACE_TARGET[deliverableKey] ?? { tab: "business-info" as const };
       const qs = buildWorkspaceQueryString(target.tab, target.folderPath);
       router.push(`${V2_ROUTES.PORTFOLIO_TRACKER}/${projectUrlKey}/onboarding-workspace?${qs}`, { scroll: false });
     };
     ```
   - Remove the now-dead `setWizardOpen`/`setWizardStartStepKey` calls from this function (the swimlane no longer opens the inline Wizard) and the now-unused `stepKeyToWizardParams`/`FIRST_WIZARD_STEP_PARAMS` import. Leave `wizardOpen` state, `wizardStartStepKey` state, and the `OnboardingWizard` render branch (lines ~1411+) in place — they're still reachable via `initialWizardStepKey` from a direct `?phase=&deliverable=` URL hit (out of scope, see boundaries above). If `wizardStartStepKey`'s setter becomes fully unused after this edit, leave the state declaration itself alone (still read elsewhere) but double-check with a `tsc`/lint pass.

6. Run `npx tsc --noEmit` and `pnpm lint`.

## Acceptance Criteria

- [ ] Clicking each of the 7 swimlane deliverable cards navigates to `/v2/portfolio-tracker/[projectId]/onboarding-workspace` with the correct `?tab=` (and `&parent_folder=` where applicable) per the mapping table, and the Workspace opens on that exact tab/folder.
- [ ] Loading a bookmarked/shared Workspace URL with `?tab=files&parent_folder=X&sub_folder_l1=Y` opens straight to that nested folder (test with a manually created 2-level-deep custom folder, not just the system ones).
- [ ] Switching tabs, opening/closing folders, clicking breadcrumbs, or using "Go to Notes folder" / "Attach from Files" inside the Workspace updates the address bar's query string to match, without a visible reload or loss of scroll/selection state.
- [ ] The Files tab shows a folder named "Migration Checklist" (not "Checklist") for both newly-provisioned projects and existing ones that already had a `Checklist` folder.
- [ ] `ChecklistTab`'s "Attach from Files" link for the Migration Checklist deliverable's `implementation-file` item opens the "Migration Checklist" folder.
- [ ] The old inline Wizard is still reachable by hitting `/v2/portfolio-tracker/[projectId]?phase=1&deliverable=1` directly (regression check on the untouched code path).
- [ ] `npx tsc --noEmit` and `pnpm lint` pass clean.

## Verification

```bash
npx tsc --noEmit
pnpm lint
```

Manual/browser acceptance (no test runner configured):
- On a project mid-Phase-1, click each of the 7 swimlane cards; confirm URL + landed tab/folder for each against the mapping table.
- Manually create a 2-level-deep custom folder in the Files tab, copy the resulting URL after navigating into it, open that URL in a fresh tab, confirm it lands on the same nested folder.
- Switch tabs and folders repeatedly inside the Workspace; confirm the URL updates each time and no network waterfall/loading-skeleton flash occurs (i.e. confirming `history.replaceState` is used, not a router navigation).
- Check a project that already has an onboarded/provisioned `Checklist` folder pre-migration; after the migration runs, confirm it now reads "Migration Checklist" and existing files inside it are untouched.

## Compatibility Touchpoints

- New Supabase migration (`098_rename_checklist_folder.sql`) — must be applied before/alongside the code deploy, same as any other migration in this repo.
- No API route signatures change (folders GET/POST unaffected beyond the constant rename); no changes to `customer_asset_folders` schema, only row data via the migration.
- `_docs/mcp-tools.md` not affected (no MCP tool changes).

## Implementation Notes

### What Changed
- Renamed the `Checklist` system folder to `Migration Checklist` in both the provisioning config (`SYSTEM_FOLDER_TREE`/`LABEL_TO_SYSTEM_FOLDER`) and via a new migration that backfills existing rows (guarded against the table's unique-name constraint — a colliding row is skipped, not errored).
- Updated `ChecklistTab`'s "Attach from Files" evidence link for the Migration Checklist deliverable to point at the renamed folder.
- Added `_workspace-url-params.ts`: the deliverable→Workspace-target map, `?tab=&parent_folder=&sub_folder_lN=...` parse/build helpers, and folder-name-path ↔ folder-id resolution helpers (supports arbitrary folder depth, not just two levels).
- `onboarding-workspace/page.tsx` now parses `searchParams` and passes `initialTab`/`initialFolderPath` to `OnboardingWizardV2`.
- `_onboarding-wizard-v2.tsx`: seeds `tab` state from `initialTab`; added an effect that resolves `initialFolderPath` to a folder id once folders have fully loaded (including the lazily-created "Notes" folder), and a second effect that keeps the URL in sync with `tab`/`openFolderId` via `history.replaceState` (not a router navigation, to avoid a `force-dynamic` data refetch on every folder click).
- `_onboarding-detail.tsx`'s `handleOpenWizardStep` now builds a Workspace URL from the deliverable→target map and `router.push`es there, instead of opening the inline Wizard in place.

### Files Changed
- `src/app/api/customers/[customerId]/assets/folders/route.ts` - renamed `Checklist` → `Migration Checklist` in `SYSTEM_FOLDER_TREE` and `LABEL_TO_SYSTEM_FOLDER`
- `supabase/migrations/098_rename_checklist_folder.sql` - new migration, backfills existing `Checklist` folders to `Migration Checklist`
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/onboarding-workspace/_checklist-tab.tsx` - evidence-link folder name updated
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/onboarding-workspace/_workspace-url-params.ts` - new file: mapping table + URL param/folder-path helpers
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/onboarding-workspace/page.tsx` - parses `searchParams`, passes `initialTab`/`initialFolderPath`
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/onboarding-workspace/_onboarding-wizard-v2.tsx` - accepts new props; resolves initial folder path; syncs URL on tab/folder change
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-detail.tsx` - `handleOpenWizardStep` redirects to the Workspace instead of opening the inline Wizard

### Deviations From Plan
- The initial-folder-resolution effect's `setTab`/`setOpenFolderId` calls are deferred one tick via `queueMicrotask(...)` rather than called synchronously at the top of the effect body — required to satisfy this repo's `react-hooks/set-state-in-effect` lint rule (a hard lint error, not just a warning), which the adjacent pre-existing "Notes" auto-create effect also avoids by nesting its `setFolders` call inside an async `.then()` callback instead of the effect body's top level. Not called out explicitly in the task doc's Implementation Steps, but consistent with the existing pattern in the same file.

### Verification Run
- `npx tsc --noEmit` - PASS
- `pnpm lint` - PASS (2 pre-existing warnings in `_checklist-tab.tsx` for unused `initialsFor`/`colorFor` helpers — confirmed via `git diff --stat` that file's only change is the one-line folder-name rename; warnings predate this task)
- Manual/browser acceptance checks from the task doc's Verification section - SKIPPED (no live Supabase/browser session available in this implementation pass; recommend running through the manual checklist before shipping, in particular the migration's effect on an already-onboarded project's `Checklist` folder)
