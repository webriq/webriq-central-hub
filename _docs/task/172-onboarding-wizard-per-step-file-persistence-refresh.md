# 172 — Onboarding Wizard: Per-Step Uploaded Files Vanish on Refresh (State Not Rehydrated From Server)

## Overview

On the Onboarding Wizard (`/v2/portfolio-tracker/[projectId]`, `_onboarding-wizard.tsx`), every per-step file upload widget — Business Facts (Kickoff), Outcome Target, Migration Checklist, Content Map, HTML Mockup, Client Sign-off — shows an empty "no files" state immediately after a page refresh, even when the user already uploaded one or more files to that exact step earlier in the session (or in a previous session).

The user's report: files vanish on refresh, and it's unclear whether they were ever actually saved (storage + DB) or only tracked in memory/localStorage. This is a real, reproducible bug, **not** a misunderstanding of the save behavior — the files genuinely are uploaded and persisted server-side (real Supabase Storage object + a `customer_assets` DB row), but the six per-step React `useState` arrays that render each step's "already uploaded" file list are only ever populated by the upload handler's own optimistic append. Nothing re-hydrates them from the server on mount, so a refresh always starts every step's file list at `[]`, regardless of what's actually in the database.

This silently breaks the entire point of autosave for any user who doesn't finish a step in one sitting: they upload a file, refresh (or come back later), see no file in the step, and reasonably conclude nothing was saved — even though re-uploading the same file would create a **duplicate** `customer_assets` row (the old one is never cleaned up, it's just no longer shown in that step's widget). It also causes false negatives in this file's own "is this step filled in" checks (`isBusinessFactsFilled`, `isOutcomeFilled`, `isMigrationChecklistFilled`, `isContentMapFilled`, `isHtmlMockupFilled`, `isSignoffFilled` — all `... || xFiles.length > 0`), which gate checklist auto-progress and the "Complete Phase 1" validation flow.

## Root Cause (confirmed via code reading, not yet reproduced live)

1. Each upload handler (`handleBusinessFactsUpload`, `handleOutcomeFileUpload`, `handleMigrationChecklistUpload`, `handleContentMapUpload`, `handleSignoffUpload`, `handleHtmlMockupUpload`) does real, correct persistence:
   - Uploads the file's bytes via `/api/customers/{customerId}/assets/upload` (Supabase Storage).
   - Inserts a `customer_assets` row via `POST /api/customers/{customerId}/assets` with a step-specific `label` (`"Business Facts"`, `"Outcome Target"`, `"Migration Checklist"`, `"Content Map"`, `"Signed Agreement"`, `"HTML Mockup"`), `phase_number: 1`, and `project_id`.
   - Then optimistically appends the returned row to that step's own state, e.g. `setBusinessFactsFiles((prev) => [...prev, newAsset])` (`_onboarding-wizard.tsx:1020`).
2. All six of those states are declared as `useState<AssetRow[]>([])` (lines 409, 502, 522, 538, 554, 565) — initialized empty, with **no** seeding from any prop or fetched data. Compare to the adjacent text fields on the same steps (`businessFacts`, `outcomeText`, `migrationChecklistText`, …), which correctly initialize from server-provided `kickoffData`/`outcomeTargetData`/etc.
3. There **is** a real per-project fetch of all persisted Phase 1 assets — `phase1Assets` (`_onboarding-wizard.tsx:714-744`), `GET /api/customers/{customerId}/assets` filtered client-side to `phase_number === 1 && project_id === project.id`. This powers the Storage/KB File Explorer at the bottom of the wizard, which **does** correctly show every previously uploaded file after a refresh.
4. Nothing connects (3) back to (2): there is no code that derives `businessFactsFiles`/`outcomeFiles`/`migrationChecklistFiles`/`contentMapFiles`/`htmlMockupFiles`/`signoffFiles` from `phase1Assets` by filtering on `label`. So on a fresh mount, `phase1Assets` loads correctly (and shows in the Explorer), but each step's own upload widget stays stuck at the initial `[]` forever — the exact same *shape* of bug already found and fixed once in this file for `localDeliverables`/`localInternal` (task 171, Round 3): local state that's supposed to mirror server data but is never synced after the initial empty snapshot.

This confirms the user's suspicion directly: the data **is** saved (not localStorage-only), but is not fetched back / shown in the per-step list after a refresh.

## Requirements

1. After `phase1Assets` finishes loading, each of the six per-step file states must be seeded from `phase1Assets`, filtered by that step's known `label` value:
   - `businessFactsFiles` ← `label === "Business Facts"`
   - `outcomeFiles` ← `label === "Outcome Target"`
   - `migrationChecklistFiles` ← `label === "Migration Checklist"`
   - `contentMapFiles` ← `label === "Content Map"`
   - `htmlMockupFiles` ← `label === "HTML Mockup"`
   - `signoffFiles` ← `label === "Signed Agreement"`
2. The sync must not clobber a later optimistic upload/removal — apply the same "only fire on the one empty→populated transition" render-time-adjustment idiom already established in this file for `localDeliverables`/`localInternal` (`_onboarding-wizard.tsx:602`, `:607`), **not** a `useEffect` (this file has a known, deliberately-avoided `react-hooks/set-state-in-effect` lint constraint — see task 171 Round 3's note on `displayStepStatus`/the prop-sync fix).
3. After the fix, refreshing the page (or opening the project fresh in a new tab) on any step that already has an uploaded file must show that file in the step's own upload widget, with working "view" and "remove" actions — not just in the bottom Storage/KB File Explorer.
4. `isXFilled` checks and the checklist auto-progress effects (e.g. the Outcome Target auto-progress `useEffect` at `_onboarding-wizard.tsx:914-931`) must correctly reflect "already has a file" immediately after a refresh, not only within the same session the file was uploaded in.
5. No change to the upload/remove/view handlers themselves, the `/api/customers/[customerId]/assets*` routes, or the Storage/KB File Explorer's own `phase1Assets`-driven rendering — those already work correctly.

## Out of Scope / Must Not Change

- The customer-facing product onboarding form (`(public)/onboarding/[customerId]`, `FormEngine`, `useFileUpload` hook) — a separate, unrelated system with its own persistence path. Not investigated as part of this task; flag separately if it turns out to have the same class of bug.
- The generic "Documents" upload (`handleUpload`/`uploadedFiles` state, used by the File Explorer's own upload button) — this state only backs a toast message (`${uploadedFiles.length} files uploaded to project folder`, line ~1937), not a persisted-file display; the File Explorer itself already renders directly from `phase1Assets`, so it is unaffected by this bug.
- Any change to the `customer_assets` table schema, the `/api/customers/[customerId]/assets` or `/assets/upload` routes, or Supabase Storage bucket/policy config.
- Any change to `localDeliverables`/`localInternal` sync (already fixed in task 171).
- Deduplicating any `customer_assets` rows already created as accidental duplicates by this bug in production — out of scope for this fix (a data-cleanup concern, not a code fix); mention to PM as a possible follow-up if duplicates are found.

## Proposed File Changes

- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` — only file expected to change:
  - Add a render-time sync block (modeled on lines 602/607) for each of the six per-step file states, keyed off `phase1Assets` and filtered by `label`.
  - Placed after `phase1Assets` state declaration and after `businessFactsFiles`/`outcomeFiles`/`migrationChecklistFiles`/`contentMapFiles`/`htmlMockupFiles`/`signoffFiles` are all declared (component body, not inside the `phase1Assets` fetch `useEffect`).

## Code Context

`_onboarding-wizard.tsx:601-608` — the established pattern to copy, for `localDeliverables`/`localInternal`:
```tsx
if (localDeliverables.length === 0 && deliverables.length > 0) setLocalDeliverables(deliverables);
...
if (localInternal.length === 0 && internalDeliverables.length > 0) setLocalInternal(internalDeliverables);
```

`_onboarding-wizard.tsx:466-482` and `:714-744` — `phase1Assets` fetch (the source of truth to sync from):
```tsx
const [phase1Assets, setPhase1Assets] = useState<AssetRow[]>([]);
...
useEffect(() => {
  ...
  const assetsRes = await fetch(`/api/customers/${project.customer_id}/assets`);
  const data: AssetRow[] = await assetsRes.json();
  setPhase1Assets(data.filter((a) => a.phase_number === 1 && a.project_id === project.id));
  ...
}, [project.customer_id, project.id]);
```

`_onboarding-wizard.tsx:987-1026` — one representative upload handler showing the `label` tagging (repeat for each of the other five, with their own labels listed under Requirements #1):
```tsx
const handleBusinessFactsUpload = async (file: File) => {
  ...
  const res = await fetch(`/api/customers/${project.customer_id}/assets`, {
    method: "POST",
    body: JSON.stringify({ type: "file", label: "Business Facts", file_path: uploaded.path, ... phase_number: 1, project_id: project.id }),
  });
  const newAsset: AssetRow = await res.json();
  setBusinessFactsFiles((prev) => [...prev, newAsset]);
};
```

`AssetRow` = `Database["public"]["Tables"]["customer_assets"]["Row"]` (`_onboarding-wizard.tsx:34`) — has `label: string`, `phase_number: number | null`, `project_id: string | null`, `created_at: string`.

## Implementation Steps

1. Immediately after all six `useState<AssetRow[]>([])` declarations and after `phase1Assets` is declared, add one render-time sync line per step, e.g.:
   ```tsx
   if (businessFactsFiles.length === 0 && phase1Assets.length > 0) {
     const seeded = phase1Assets.filter((a) => a.label === "Business Facts");
     if (seeded.length > 0) setBusinessFactsFiles(seeded);
   }
   ```
   Repeat for `outcomeFiles`/`"Outcome Target"`, `migrationChecklistFiles`/`"Migration Checklist"`, `contentMapFiles`/`"Content Map"`, `htmlMockupFiles`/`"HTML Mockup"`, `signoffFiles`/`"Signed Agreement"`.
2. Guard correctly against the true "no files ever uploaded" case: the `phase1Assets.length > 0` check alone isn't enough (a project could have files in other categories only) — filter first, then only call `setXFiles` when the filtered result is non-empty, to avoid a no-op `setState` firing every render once `phase1Assets` is loaded but genuinely has zero matches for that label (still harmless either way since React bails out an identical-reference no-op, but prefer the cleaner form above for clarity).
3. Sort each filtered/seeded list by `created_at` ascending to preserve upload order (matches the optimistic-append order used elsewhere in this file).
4. Do not touch the upload/remove/view handlers, `isXFilled` derivations, or any auto-progress `useEffect` — they already read from the same state variables and will pick up the seeded values automatically.
5. Consider (optional, only if trivial) whether `handleRemoveXFile`'s optimistic local removal could race with this render-time sync re-adding a just-removed file if `phase1Assets` hasn't caught up yet — since `phase1Assets` itself is only fetched once on mount (not re-fetched after a remove), this should not be an issue in practice, but verify live during testing (upload → remove → confirm it doesn't reappear without a refresh).

## Acceptance Criteria

- [ ] Upload a file to Business Facts (Kickoff), Outcome Target, Migration Checklist, Content Map, HTML Mockup, and Client Sign-off (one per step, or at least a representative subset live-tested).
- [ ] Refresh the page (hard reload). Every step visited must show its previously uploaded file(s) in that step's own upload widget — not just in the bottom Storage/KB File Explorer.
- [ ] "View" and "Remove" work correctly on a file that was rehydrated after refresh (not just on one uploaded in the current session).
- [ ] A step's `isXFilled`-gated checklist item (e.g. Outcome Target's auto-progress to "in_progress") correctly reflects an already-uploaded file immediately after a fresh page load, without needing to re-upload or type anything.
- [ ] Re-uploading to a step that already has a rehydrated file does not clobber or hide the earlier one — both show.
- [ ] No duplicate `customer_assets` rows created as a side effect of this fix (this fix should only affect what's read/rendered, not what's written).
- [ ] `npx tsc --noEmit` — zero errors.
- [ ] `pnpm lint` — zero errors/warnings.

## Verification

- `npx tsc --noEmit`
- `pnpm lint`
- Live browser QA (authenticated PM/admin session) against a real project in `/v2/portfolio-tracker/[projectId]`:
  1. Upload a file to at least two different steps.
  2. Hard-refresh the page.
  3. Confirm both files still show in their respective step widgets.
  4. Confirm view/remove still work on the rehydrated files.
  5. Confirm the Storage/KB File Explorer (unaffected by this change) still shows all files as before.

## Compatibility Touchpoints

- No DB migration, no API route changes, no schema changes.
- No impact on the `(public)/onboarding/[customerId]` product onboarding form — separate code path, untouched.
- No impact on PM read-only rendering beyond correctly showing files that already exist (a strict improvement, not a new code path — PM view reuses the same components).

## Recommended Tier

`balanced` — single file, well-understood root cause with an established fix pattern already proven once in this exact file (task 171 Round 3's `localDeliverables`/`localInternal` sync), but touches six near-duplicate handler groups and needs careful live verification across all of them plus the interaction with checklist auto-progress and validation gates.

## Implementation Notes

### What Changed
- Added a render-time seeding block (six near-identical `if (xFiles.length === 0 && phase1Assets.length > 0) { ... }` guards) right after the existing `localDeliverables`/`localInternal` sync, following the same "only fire on the one empty→populated transition" idiom already established in this file — no extra `prevProp` tracking was needed since `phase1Assets` is this component's own state (not an incoming prop subject to reference churn from a re-rendering parent), and no other code path adds `customer_assets` rows carrying these six exact `label` values except the matching upload handler, which already keeps its own list in sync. Each block filters `phase1Assets` by the step's `label` (`"Business Facts"`, `"Outcome Target"`, `"Migration Checklist"`, `"Content Map"`, `"HTML Mockup"`, `"Signed Agreement"`), sorts by `created_at` ascending to preserve upload order, and only calls `setXFiles` when the filtered result is non-empty.
- Added scope requested during implementation (user: "Add skeleton on loading as well"): a `loading?: boolean` prop on `FileUploadBox` and `HtmlMockupFileList`, forwarded through `UploadFirstField`, rendering a single skeleton row (`h-11 rounded-lg animate-pulse motion-reduce:animate-none bg-[#EDF0F7]`, matching `StorageFileExplorer`'s existing loading-skeleton pattern) in place of the files list while `phase1Loading` is still `true` — so a step that already has an uploaded file no longer flashes an empty "no files" state before `phase1Assets` (and the new seeding logic) resolves. Wired `loading={phase1Loading}` into all six step call sites (Business Facts direct `FileUploadBox`; Outcome Target, Migration Checklist, Content Map, Client Sign-off via `UploadFirstField`; HTML Mockup's `HtmlMockupFileList`).

### Files Changed
- `src/app/v2/(hub)/portfolio-tracker/[projectId]/_onboarding-wizard.tsx` — only file touched, per plan. Render-time seeding block; `loading` prop + skeleton branch added to `FileUploadBox` and `HtmlMockupFileList`; `loading` prop threaded through `UploadFirstField`; `loading={phase1Loading}` passed at all six call sites.

### Deviations From Plan
- Scope addition, approved via the `/implement` invocation itself ("Add skeleton on loading as well"): the loading-skeleton requirement was not in the original task document's Requirements list. Added as described above, reusing this file's existing skeleton visual pattern rather than introducing a new one.
- The task document suggested a `seedFilesByLabel`-style single point of logic; implemented instead as six explicit, near-identical blocks (matching this file's own established convention of six parallel per-step handler groups, e.g. `handleXUpload`/`handleRemoveXFile`/`handleViewXFile`, rather than introducing a shared helper for a pattern this codebase already treats as intentionally repetitive).
- Did not investigate or touch the `(public)/onboarding/[customerId]` product onboarding form — confirmed out of scope per the task document, untouched.

### Verification Run
- `npx tsc --noEmit` — PASS, zero errors.
- `pnpm lint` — PASS, zero errors/warnings.
- Live browser QA — SKIPPED (not run this session; recommended before treating this as fully verified in practice — see Acceptance Criteria in the task document for the exact upload → refresh → confirm steps to run against a real project).
