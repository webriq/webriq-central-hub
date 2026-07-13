# 140: Storage/KB — Add Credential/Link Assets (Add Asset Modal Pattern)

**Created:** 2026-07-13
**Priority:** MEDIUM
**Type:** feature
**Recommended Tier:** balanced

---

## Overview

The Storage/KB File Explorer (task 134, extended visually by task 139) only lets Bert
add **file** assets — there's no way to record a **credential** (e.g. DNS registrar
login, a 3rd-party integration API key reference) or a **link** (e.g. staging URL) from
inside the onboarding wizard, even though QBR 2.1/2.3 explicitly call these out as
Phase 1 inputs ("DNS access", "Credentials for any 3rd-party tool") and this is the
step the QBR maps them to.

The Customers → Assets tab already has a complete, working flow for all three asset
types (Link/File/Credential) via its "Add Asset" modal — Type dropdown, Label, per-type
fields (URL for links, dynamic label/value pairs for credentials, masking), and role
visibility. Per the user's direction, this task brings the **same modal pattern** into
the Storage/KB step for Link and Credential specifically (File already has its own
native upload flow in the Explorer — see Out of Scope for why File isn't duplicated
into this modal).

## Requirements

- [ ] The Storage/KB step gets a new "Add credential / link" action (button, near the
      File Explorer) that opens a modal matching the Customers → Assets tab's "Add
      Asset" modal: a **Type** dropdown (Credential | Link — no File option, see Out of
      Scope), **Label** (required), and per type:
  - **Credential**: dynamic label/value field rows ("+ Add Field"), a "Mask value in
    UI" checkbox (defaults checked, matching the Assets tab's behavior when switching to
    Credential).
  - **Link**: a single required URL **Value** field, validated to start with
    `http://`/`https://` (same `isValidAssetUrl` check as the reference modal).
  - Both: the existing role-pill "Visible To" selector (and, if task 138 has landed,
    the specific-people picker too).
- [ ] Submitting calls the existing generic `POST /api/customers/[customerId]/assets`
      endpoint (no new route needed — it already accepts `type: "link" | "credential"`
      with the right shape), additionally passing `phase_number: 1` and
      `project_id: project.id` so the new asset is scoped to this project's Phase 1 (same
      tagging convention every file upload in this wizard already uses).
- [ ] Newly added credentials/links appear in a **new, separate list section** in the
      Storage/KB step (not inside the File Explorer's folder browser, which is
      file-specific — see Out of Scope), styled to match the Customers → Assets tab's
      own asset-row rendering: type badge, label, masked/revealed value display for
      credentials (Show/Hide toggle), an "Open" link for links, and the same
      Delete/Permissions affordances already established.
- [ ] Deleting a credential/link from this list uses the existing generic
      `DELETE /api/customers/[customerId]/assets?id=...` route — no new route needed.

## Out of Scope / Must-Not-Change

- **File is not a Type option in this new modal.** The File Explorer's own "Add file"
  button (task 134) already covers file uploads for this step; adding a second,
  differently-shaped way to upload a file here would be a confusing duplicate entry
  point. If the user wants a single unified "Add Asset" modal covering all three types
  in one place (replacing the Explorer's native upload button too), that's a distinct,
  larger redesign — flag it for a follow-up rather than assuming it here.
- Credentials/links added here are **not** shown inside the File Explorer's folder tiles
  (task 139) — they have no `file_path`/`file_mime_type` and don't fit
  `folderForAsset()`'s file-oriented categorization. They get their own list, not a new
  "folder."
- No changes to the Customers → Assets tab itself — its modal is a **reference** to
  match the look/behavior of, not a shared component (same page-scoped UI convention
  already applied in tasks 134/139).
- No changes to `POST`/`DELETE /api/customers/[customerId]/assets` — both already
  support everything this task needs generically.
- No new DB schema/migration — `customer_assets` already supports all three types.
- No changes to `kickoff`, `outcome-target`, `migration-checklist`, `content-map`,
  `html-mockup`, `client-signoff`, or the DNS/credentials free-text notes (which remain
  plain textareas, untouched, exactly as task 134 established).

## Proposed File Changes

| File | Action | Purpose |
|------|--------|---------|
| `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` | Modify | Add an "Add credential / link" modal (new file-scoped `AddCredentialLinkModal` component, modeled on the Customers Assets tab's Add Asset modal) and a new list section rendering non-file Phase 1 assets, in the `storage-kb` render block. |

## Code Context

### Reference modal to model on (`src/app/v2/(hub)/customers/[customerId]/client.tsx:1444-1666`)

Type dropdown, Label input, conditional Value (link) / dynamic Fields (credential) +
masked checkbox, role-pill "Visible To" selector, validation (`isAddAssetValid`), and
`handleAddAsset`'s POST body shape — copy the *shape*, not the component (per the
page-scoped UI convention), narrowing the Type dropdown to two options.

```tsx
const isValidAssetUrl = (v: string) => /^https?:\/\//i.test(v.trim());
// POST body shape (already generic):
{
  type: "link" | "credential",
  label: string,
  masked: boolean,               // credential only, meaningful
  allowed_roles: string[],
  ...(type === "link" ? { value: string } : {}),
  ...(type === "credential" ? { fields: { label: string; value: string }[] } : {}),
  phase_number: 1,                // new for this call site
  project_id: project.id,         // new for this call site
}
```

### Reference display row to model the new list section on (`client.tsx:2194-2265`)

Type badge (`ASSET_TYPE_LABELS`/`assetTypeCls` — copy these small lookup
helpers/functions locally, same convention as `ASSET_ROLE_OPTIONS`/`ASSET_ROLE_LABELS`
already copied for task 134), label, masked-with-Show/Hide credential value display,
clickable "Open" for links, Delete button. `revealedAssets` (a `Set<string>` of asset
ids currently shown unmasked) is local component state in the reference file — replicate
the same pattern locally rather than importing it.

### Where to render in the `storage-kb` block (`_onboarding-wizard.tsx`, tasks 134/139's block)

Add a new section between the File Explorer and the DNS/credentials textareas (or
below the textareas — whichever reads better once task 139's tile-grid redesign is in
place; not load-bearing which exact position, just keep the DNS/credentials textareas
untouched wherever this lands):

```tsx
<div>
  <div className="flex items-center justify-between mb-1.5">
    <label className={labelCls}>Credentials & links</label>
    <button onClick={() => setShowAddCredentialLink(true)} className="...">+ Add</button>
  </div>
  {/* list of non-file phase1Assets, or an empty state */}
</div>
{showAddCredentialLink && <AddCredentialLinkModal ... onClose={...} onCreated={(asset) => setPhase1Assets(prev => [...prev, asset])} />}
```

`phase1Assets` (task 134's state) already holds every Phase 1 asset including these new
non-file ones once created — filter it client-side (`a.type !== "file"`) for this new
list, no separate fetch needed.

## Implementation Steps

1. Add `showAddCredentialLink` state and a new `AddCredentialLinkModal` file-scoped component (Type/Label/Value-or-Fields/masked-checkbox/Visible-To, mirroring the reference modal's shape, POSTing with `phase_number: 1` + `project_id: project.id` added).
2. On successful creation, append the new asset into the existing `phase1Assets` state (same pattern as `handleUpload`'s extension in task 134) and close the modal.
3. Add a `handleDeleteCredentialLink(id)` reusing the generic `DELETE` route, removing the item from `phase1Assets` on success (mirrors `handleRemoveFile`'s shape).
4. Add the new "Credentials & links" list section to the `storage-kb` render block, filtering `phase1Assets` to `type !== "file"`, rendering each with the type badge/masked-reveal/Open-link/Delete pattern from the reference.
5. `npx tsc --noEmit` and `pnpm lint`.
6. Manually verify per Acceptance Criteria.

## Acceptance Criteria

- [ ] Clicking "+ Add" opens a modal with Type limited to Credential/Link, matching the Customers Assets tab's visual style.
- [ ] Creating a Link asset requires a valid `http(s)://` URL and appears in the new list with a working "Open" link.
- [ ] Creating a Credential asset supports multiple label/value field rows, masks values by default with a working Show/Hide toggle.
- [ ] Both types respect the "Visible To" role selection (and specific-people sharing, if task 138 has landed).
- [ ] New assets are correctly tagged `phase_number: 1`, `project_id` matching the current project — confirm via the Customers → Assets tab, where they should also appear (same underlying table).
- [ ] Deleting an item removes it from both this list and the Customers → Assets tab.
- [ ] The File Explorer (tasks 134/139) is unaffected — these new assets never appear inside its folder tiles.
- [ ] `npx tsc --noEmit` and `pnpm lint` pass with no new errors/warnings.
- [ ] No new packages, no DB/API route changes.

## Verification

```bash
npx tsc --noEmit
pnpm lint
pnpm dev
# Manual, localhost:3000, a Phase 1 project on Step 6:
#   - Click "+ Add" -> create a Credential with 2 fields, masked -> confirm it appears masked with a working Show/Hide toggle
#   - Create a Link -> confirm the "Open" action opens the right URL in a new tab
#   - Set "Visible To" to a single role on one item -> confirm the permission badge reflects it
#   - Delete one item -> confirm it disappears from this list
#   - Open the same project's Customers -> Assets tab -> confirm both created assets are visible there too (same table, same data)
```

## Compatibility Touchpoints

- None — no DB/API changes, reuses existing generic asset routes.

## Implementation Notes

### What Changed
- Added an "Add credential / link" modal (`AddCredentialLinkModal`) modeled on the Customers → Assets tab's Add Asset modal shape, narrowed to a Credential/Link Type dropdown only (File is deliberately excluded — the File Explorer's own "Add file" button already covers that). Since task 138 had already landed, the modal includes both the role-pill "Visible To" selector and the specific-people sharing picker (using the `staffDirectory` state task 138 introduced), not just roles.
- Reused this file's own isDark-aware modal chrome conventions (`cardCls`/`textPrimary`/`textMuted` computed locally, matching `FileViewerModal`/`HtmlEditorModal`'s pattern) rather than copying the Customers tab's fixed-light Tailwind classes verbatim — that page isn't isDark-aware, this one is.
- Reused the existing `isValidUrl` helper (already in this file, used for Kickoff's website/competitor URL fields) for Link validation instead of adding a duplicate `isValidAssetUrl` regex — functionally identical (both accept only `http:`/`https:`), one fewer near-duplicate helper.
- Added a new "Credentials & links" list section to the `storage-kb` render block, positioned after the existing DNS/credentials textareas (which remain completely untouched). It filters `phase1Assets` (already fetched by task 134) to `type !== "file"` — no separate fetch — and renders each item with a type badge, label, masked/revealed credential fields with a Show/Hide toggle, a clickable "Open" for links, and a Remove button.
- Added `handleDeleteCredentialLink`, reusing the existing generic `DELETE /api/customers/[customerId]/assets` route and removing the item from `phase1Assets` on success — no new route.
- New assets created here POST through the existing generic `POST /api/customers/[customerId]/assets` route (already generic, confirmed by re-reading it — no changes needed), with `phase_number: 1` and `project_id: project.id` added, same tagging convention every upload handler in this file already uses.
- Added `ASSET_TYPE_LABELS`/`assetTypeCls` (Link/Credential only, copied from the Customers tab's pattern per the page-scoped UI convention already established in tasks 134/138/139) as new module-level helpers.

### Files Changed
- `src/app/v2/(hub)/onboarding/[projectId]/_onboarding-wizard.tsx` — added `ASSET_TYPE_LABELS`/`ASSET_TYPE_CLS_LIGHT`/`ASSET_TYPE_CLS_DARK`/`assetTypeCls`; `showAddCredentialLink`/`revealedCredentials`/`credentialLinkDeleteError` state; `handleDeleteCredentialLink`; the new "Credentials & links" list section in the `storage-kb` block; the `AddCredentialLinkModal` render call; and the new `AddCredentialLinkModal` component itself (added after `StorageFileExplorer`). No other files touched — confirmed the generic `POST`/`DELETE` asset routes needed zero changes.

### Deviations From Plan
- None — implementation matches the task document's Code Context and Implementation Steps. Including the specific-people picker (not explicitly re-specified in this task's own doc, since it predates task 138 slightly in the write-up) follows the task doc's own instruction: "the specific-people picker too" if task 138 has landed, which it had by the time this was implemented.

### Verification Run
- `npx tsc --noEmit` — PASS (no errors).
- `pnpm lint` — PASS (no warnings/errors).
- `pnpm build` — PASS.
- Manual browser verification — **SKIPPED**, same standing reason as the rest of this batch: live verification requires a logged-in Hub session, and entering the user's password to authenticate is a prohibited action regardless of authorization. Verified instead by code review: `handleSubmit`'s POST body shape was checked field-by-field against the generic `POST` route's expected body (already confirmed generic in task 138's implementation); the credential masking/reveal and link "Open" rendering are the same JSX pattern already proven working in the Customers → Assets tab, adapted to this file's isDark theming; and the "no File type in this modal" / "not shown in File Explorer folders" scope boundaries were confirmed by inspection — the modal's `<select>` only offers Link/Credential, and the new list section filters strictly to `type !== "file"` while `StorageFileExplorer`'s own `folderForAsset()` grouping is completely untouched.

### Follow-up Changes (post-review, same task) — Alignment fix, removed redundant textareas, per-field sensitivity, multi-select people picker

User feedback with screenshots: (1) the Credentials & links list rows were misaligned, (2) the DNS access / 3rd-party integration credentials textareas are now redundant with this structured list and should be removed, (3) the "Mask value in UI" checkbox should be a "Sensitive" switch applied per field instead of the whole credential, (4) "Share with specific people" needed to be a searchable multi-select with removable tag badges instead of a long scrolling grid of pills, and (5) the modal's fields should match the Kickoff/New Project wizard's field styling.

- **Removed `dnsAccess`/`credentialsNote`** state, their autosave payload fields, and their textarea JSX entirely — the "Documents" note textarea and its own autosave are untouched. This is a direct, explicit reversal of task 134's original "must not change" boundary on these two fields, superseded by the user's live direction that they're now redundant with the Credentials & links list.
- **Alignment fix**: rebuilt each Credentials & links row as badge + fixed-width (`w-32`) label column + a flexible content column where each credential field renders on its own line (label, value, per-field Show/Hide), instead of the previous flex-wrap layout that squeezed multi-line credential fields next to a shrink-wrapped label.
- **Per-field sensitivity**: `fields` now carries `{ label, value, masked }` per entry (was `{ label, value }` with one asset-level `masked` boolean). The modal replaced the single "Mask value in UI" checkbox with a `Switch` toggle next to each field row, labeled via `title="Sensitive"`. The list view's reveal state moved from `revealedCredentials: Set<assetId>` to `revealedCredentialFields: Set<"assetId::fieldIndex">`, so each field can be shown/hidden independently. Legacy fields without a per-field `masked` value (or the top-level flag) fall back via `field.masked ?? asset.masked` — no silent plaintext regression for anything saved before this change.
- **Asset-level `masked` still set on submit** (`cleanFields.some(f => f.masked)`) purely as a conservative fallback for any other surface reading the whole-asset flag (e.g. the Customers → Assets tab's own display, which still masks per-asset, not per-field) — that page was not modified, per the established page-scoped UI convention; it will show the whole credential masked if *any* field is sensitive, erring safe rather than leaking a field.
- **Multi-select people picker**: replaced the always-expanded grid of role/person pills with a search input + dropdown (filtered by name, excludes already-selected people) and selected people rendered as removable tag badges (× icon) above the search box — no more requiring scrolling through a long flat list. Scoped to this modal only, per the screenshot; the Customers → Assets tab's own picker and `StorageFileExplorer`'s inline panel were intentionally left as-is (not requested).
- **Field styling**: replaced the modal's ad hoc `modalLabelCls`/`modalInputCls` with `fieldLabelCls`/`fieldInputCls` matching the exact Kickoff/New Project wizard convention already used elsewhere in this file (`rounded-[9px]`/`border-[1.5px]`/focus-glow shadow), per the explicit ask to match "the other steps or... the New Project form."

**Verification:**
- `npx tsc --noEmit` — PASS. `pnpm lint` — PASS. `pnpm build` — PASS.
- Not yet exercised live (same login/password restriction) — awaiting the user's test, including confirming per-field Show/Hide works independently and the people search/tag-removal flow feels right.
